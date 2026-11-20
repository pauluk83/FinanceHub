import { baselineFor, recalculate, type LedgerSpec } from './providerLedger.ts';

export type WaterStatementRow = {
  month: string;
  billAmountPence?: number;
  paymentPence?: number;
  balancePence?: number;
  [key: string]: unknown;
};

export type WaterPaymentChange = {
  effectiveFrom: string;
  amountPence: number;
};

export type WaterProvider = {
  year?: number;
  statement?: WaterStatementRow[];
  monthlyPaymentPence?: number;
  paymentBasePence?: number;
  paymentChanges?: WaterPaymentChange[];
  detailsEdited?: boolean;
  [key: string]: unknown;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function statementMonthStart(year: number, month: string): string | null {
  const index = MONTHS.indexOf(month);
  if (index < 0 || !Number.isInteger(year)) return null;
  return `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

/** Future statement months that a Water payment change may rewrite. */
export function waterPaymentTargets(
  water: WaterProvider,
  asOfDate: string,
  effectiveFrom: string,
): WaterStatementRow[] {
  const year = Number(water.year);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return [];
  return (water.statement ?? []).filter((row) => {
    const rowDate = statementMonthStart(year, row.month);
    return !!rowDate
      && rowDate >= effectiveFrom
      && rowDate > asOfDate
      && (Number(row.paymentPence) || 0) !== 0;
  });
}

/** Water is the workbook's cash-flow sheet: balance = previous + payment − bill. */
const WATER_SPEC: LedgerSpec = { rowsKey: 'statement', formula: 'cashflow', monthly: true };

function statementBaseline(rows: WaterStatementRow[]): number {
  return baselineFor(WATER_SPEC, rows);
}

function recalculateStatementBalances(rows: WaterStatementRow[], baseline: number): void {
  recalculate(WATER_SPEC, rows, baseline);
}

/**
 * The payment a month's Water bill should use. Deliberate zero-payment months
 * stay at zero unless that month was edited, a future-block edit wins, then the
 * newest change that has taken effect, then the row's own payment.
 */
export function waterPaymentPenceForMonth(
  water: WaterProvider,
  year: number,
  month: number,
  yearRows: readonly WaterStatementRow[] = water.statement ?? [],
): number | null {
  const label = MONTHS[month - 1];
  if (!label) return null;
  const row = yearRows.find((entry) => entry.month === label);
  const liveRow = (water.statement ?? []).find((entry) => entry.month === label);
  if ((row as any)?.paymentEdited === true) return Number(row?.paymentPence) || 0;
  if (row && (Number(row.paymentPence) || 0) === 0) return 0;
  if (liveRow && (Number(liveRow.paymentPence) || 0) === 0) return 0;

  const mStart = `${year}-${String(month).padStart(2, '0')}-01`;
  let chosen: WaterPaymentChange | null = null;
  for (const change of water.paymentChanges ?? []) {
    if (change.effectiveFrom <= mStart && (!chosen || change.effectiveFrom > chosen.effectiveFrom)) chosen = change;
  }
  if (chosen) return chosen.amountPence;
  if (row && typeof row.paymentPence === 'number') return row.paymentPence;
  return water.paymentBasePence ?? water.monthlyPaymentPence ?? null;
}

/**
 * Apply a dated Water payment change. Only future non-zero statement months
 * are rewritten; earlier rows and zero-payment months remain historical facts.
 */
export function applyWaterPaymentChange(
  water: WaterProvider,
  asOfDate: string,
  paymentPence: number,
  effectiveFrom: string,
): number {
  if (!Number.isInteger(paymentPence) || paymentPence <= 0) throw new Error('Monthly payment must be greater than zero');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new Error('Choose a valid Water payment start date');

  const rows = water.statement ?? [];
  const baseline = statementBaseline(rows);

  if (typeof water.paymentBasePence !== 'number') {
    water.paymentBasePence = typeof water.monthlyPaymentPence === 'number'
      ? water.monthlyPaymentPence
      : paymentPence;
  }
  water.monthlyPaymentPence = paymentPence;
  water.detailsEdited = true;

  const changes = [...(water.paymentChanges ?? [])];
  const next: WaterPaymentChange = { effectiveFrom, amountPence: paymentPence };
  const existing = changes.findIndex((change) => change.effectiveFrom === effectiveFrom);
  if (existing >= 0) changes[existing] = next;
  else changes.push(next);
  water.paymentChanges = changes.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const targets = waterPaymentTargets(water, asOfDate, effectiveFrom);
  for (const row of targets) row.paymentPence = paymentPence;
  recalculateStatementBalances(rows, baseline);

  return targets.length;
}
