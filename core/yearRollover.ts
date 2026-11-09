/**
 * Year rollover moves the budget's configured year forward without rewriting
 * history. Month locks, transactions, bills and provider year blocks are left
 * exactly as they are; only the target year and the as-of/cutoff anchors move
 * to the first day of the new year. The balance anchor is deliberately kept,
 * because recalibrating it changes every cumulative balance.
 */
import type { Dataset } from './engine';

export interface YearRolloverPlan {
  from: number;
  to: number;
  asOfDate: string;
  lockCutoff: string;
  /** What the rollover leaves alone, shown in the confirmation dialog. */
  preserved: string[];
}

export interface YearRolloverResult {
  ok: boolean;
  plan?: YearRolloverPlan;
  reason?: string;
}

/** Same rule as `Settings!C11`: month start, previous month when day < 3. */
function cutoffFor(year: number): string {
  return `${year - 1}-12-01`;
}

export function planYearRollover(ds: Dataset, year: number): YearRolloverResult {
  const current = ds.settings.targetYear;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, reason: 'Choose a year between 2000 and 2100.' };
  }
  if (year === current) {
    return { ok: false, reason: `${current} is already the target year.` };
  }
  if (year < current) {
    return { ok: false, reason: `The budget is already on ${current}; history is viewed with the year selector rather than by rolling backwards.` };
  }
  return {
    ok: true,
    plan: {
      from: current,
      to: year,
      asOfDate: `${year}-01-01`,
      lockCutoff: cutoffFor(year),
      preserved: [
        'Every month lock and its snapshot',
        'All transactions, bills and bill changes',
        'Provider year blocks and their opening balances',
        `The balance anchor date (${ds.settings.anchorDate || 'not set'})`,
      ],
    },
  };
}

/** Years the app can display: the target year plus imported blocks, locks and rows. */
export function availableYears(ds: Dataset): number[] {
  const years = new Set<number>();
  const add = (value: number) => {
    if (Number.isInteger(value) && value >= 2000 && value <= 2100) years.add(value);
  };
  add(ds.settings.targetYear);
  add(Number(ds.settings.asOfDate?.slice(0, 4)));
  for (const provider of Object.values(ds.providers ?? {})) {
    for (const key of Object.keys((provider as any)?.years ?? {})) add(Number(key));
  }
  for (const key of Object.keys(ds.monthLocks ?? {})) add(Number(key.slice(0, 4)));
  for (const row of ds.transactions ?? []) add(Number(row.date?.slice(0, 4)));
  return [...years].sort((a, b) => a - b);
}

/**
 * Apply the rollover in place. The caller owns saving and syncing; this only
 * changes the dataset and records the budget-changelog entry.
 */
export function rolloverYear(ds: Dataset, year: number, today: string): YearRolloverResult {
  const result = planYearRollover(ds, year);
  if (!result.ok) return result;
  const { plan } = result;
  ds.settings.targetYear = plan.to;
  ds.settings.asOfDate = plan.asOfDate;
  ds.settings.lockCutoff = plan.lockCutoff;
  if (!ds.changelog) ds.changelog = [];
  ds.changelog.unshift({
    date: today,
    sheetCell: 'Year rollover',
    description: `Target year rolled from ${plan.from} to ${plan.to}. As-of and lock cutoff reset to 1 January ${plan.to}; ${plan.preserved.length} categories were left untouched, including month locks and provider year blocks. The balance anchor date was kept.`,
    details: [
      `As-of date — ${plan.asOfDate}`,
      `Lock cutoff — ${plan.lockCutoff}`,
      `Balance anchor — ${ds.settings.anchorDate || 'not set'} (unchanged)`,
      ...plan.preserved.map((entry) => `Preserved — ${entry}`),
    ],
    signature: `year-rollover:${plan.to}`,
    auto: true,
    at: new Date().toISOString(),
  });
  return result;
}
