/**
 * Category and tag reports (R5) with report-only targets (R16).
 *
 * These figures read the transaction ledger directly: only ordinary expense
 * rows are counted, transfers and generated bill rows are excluded, and a
 * merged duplicate carries a zero amount so it cannot be counted twice. No
 * target or report figure is ever consumed by the calculation engine.
 */
import type { Dataset } from './engine.ts';
import { normaliseCategory, normaliseTags } from './categories.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UNCATEGORISED = 'Uncategorised';

export interface SpendLine {
  key: string;
  label: string;
  amountPence: number;
  count: number;
  share: number;
}

export interface MonthSpend {
  key: string;
  label: string;
  amountPence: number;
}

export interface SpendReport {
  year: number;
  month: number | null;
  totalPence: number;
  categories: SpendLine[];
  tags: SpendLine[];
  months: MonthSpend[];
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function inWindow(ds: Dataset, year: number, month: number | null) {
  return ds.transactions.filter((tx) => {
    if (tx.type !== 'Expense') return false;
    if (tx.budgetTreatment === 'Transfer') return false;
    if (tx.autoBill === true) return false;
    if (tx.amountPence <= 0) return false;
    if (Number(tx.date.slice(0, 4)) !== year) return false;
    if (month !== null && Number(tx.date.slice(5, 7)) !== month) return false;
    return true;
  });
}

function lines(counts: Map<string, { amountPence: number; count: number }>, totalPence: number): SpendLine[] {
  return [...counts.entries()]
    .map(([key, value]) => ({
      key,
      label: key,
      amountPence: value.amountPence,
      count: value.count,
      share: totalPence === 0 ? 0 : value.amountPence / totalPence,
    }))
    .sort((left, right) => right.amountPence - left.amountPence || left.label.localeCompare(right.label, 'en-GB'));
}

/** Category and tag spend for one month, or the whole selected year. */
export function spendReport(ds: Dataset, year: number, month: number | null): SpendReport {
  const rows = inWindow(ds, year, month);
  const totalPence = rows.reduce((sum, tx) => sum + tx.amountPence, 0);
  const categoryCounts = new Map<string, { amountPence: number; count: number }>();
  const tagCounts = new Map<string, { amountPence: number; count: number }>();

  for (const tx of rows) {
    const category = normaliseCategory(tx.category) || UNCATEGORISED;
    const current = categoryCounts.get(category) ?? { amountPence: 0, count: 0 };
    current.amountPence += tx.amountPence;
    current.count += 1;
    categoryCounts.set(category, current);

    for (const tag of normaliseTags(tx.tags)) {
      const tagged = tagCounts.get(tag) ?? { amountPence: 0, count: 0 };
      tagged.amountPence += tx.amountPence;
      tagged.count += 1;
      tagCounts.set(tag, tagged);
    }
  }

  const months: MonthSpend[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const cursor = new Date(Date.UTC(year, month === null ? 11 : month - 1, 1));
    cursor.setUTCMonth(cursor.getUTCMonth() - offset);
    const cursorYear = cursor.getUTCFullYear();
    const cursorMonth = cursor.getUTCMonth() + 1;
    const amountPence = inWindow(ds, cursorYear, cursorMonth).reduce((sum, tx) => sum + tx.amountPence, 0);
    months.push({ key: monthKey(cursorYear, cursorMonth), label: `${MONTHS[cursorMonth - 1]} ${String(cursorYear).slice(2)}`, amountPence });
  }

  return {
    year,
    month,
    totalPence,
    categories: lines(categoryCounts, totalPence),
    tags: lines(tagCounts, totalPence),
    months,
  };
}

/** Spend for one category across the twelve months ending at the selection. */
export function categoryTrend(ds: Dataset, category: string, year: number, month: number | null): MonthSpend[] {
  const wanted = (normaliseCategory(category) || UNCATEGORISED).toLocaleLowerCase('en-GB');
  const report = spendReport(ds, year, month);
  return report.months.map((entry) => {
    const [entryYear, entryMonth] = entry.key.split('-').map(Number);
    const amountPence = inWindow(ds, entryYear, entryMonth)
      .filter((tx) => (normaliseCategory(tx.category) || UNCATEGORISED).toLocaleLowerCase('en-GB') === wanted)
      .reduce((sum, tx) => sum + tx.amountPence, 0);
    return { ...entry, amountPence };
  });
}

export interface TargetProgress {
  category: string;
  spentPence: number;
  targetPence: number;
  remainingPence: number;
  /** 0 when no target is set; above 1 means the target is exceeded. */
  ratio: number;
}

export function categoryTargets(ds: Dataset): Record<string, number> {
  const targets: Record<string, number> = {};
  for (const [category, value] of Object.entries(ds.categoryTargets ?? {})) {
    const name = normaliseCategory(category);
    if (!name) continue;
    const pence = Number(value);
    if (!Number.isFinite(pence) || pence <= 0) continue;
    targets[name] = Math.round(pence);
  }
  return targets;
}

/**
 * Target progress for the month or year. A yearly view compares the spend
 * against twelve monthly targets, because a target is stored as a monthly
 * amount.
 */
export function targetProgress(ds: Dataset, year: number, month: number | null): TargetProgress[] {
  const targets = categoryTargets(ds);
  const report = spendReport(ds, year, month);
  const spent = new Map(report.categories.map((line) => [line.label, line.amountPence]));
  return Object.entries(targets)
    .map(([category, targetPence]) => {
      const target = month === null ? targetPence * 12 : targetPence;
      const spentPence = spent.get(category) ?? 0;
      return {
        category,
        spentPence,
        targetPence: target,
        remainingPence: target - spentPence,
        ratio: target === 0 ? 0 : spentPence / target,
      };
    })
    .sort((left, right) => right.ratio - left.ratio || left.category.localeCompare(right.category, 'en-GB'));
}

/** Total of every target for the period, used by the dashboard card. */
export function targetsSummary(ds: Dataset, year: number, month: number | null): {
  targets: TargetProgress[];
  targetPence: number;
  spentPence: number;
  remainingPence: number;
  exceeded: number;
} {
  const targets = targetProgress(ds, year, month);
  const targetPence = targets.reduce((sum, entry) => sum + entry.targetPence, 0);
  const spentPence = targets.reduce((sum, entry) => sum + entry.spentPence, 0);
  return {
    targets,
    targetPence,
    spentPence,
    remainingPence: targetPence - spentPence,
    exceeded: targets.filter((entry) => entry.ratio > 1).length,
  };
}
