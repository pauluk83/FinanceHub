/**
 * Provider ledger rules (Phase 2).
 *
 * Every provider sheet — Water, Ovo, Council Tax, Park Xmas, Pure Cremation,
 * O2, Virgin and the Rent ledger — is a list of rows plus a running balance.
 * The workbook computes those balances with per-sheet formulas; this module is
 * the single implementation of that behaviour so the Windows app, the hosted
 * build and any future port agree to the penny.
 *
 * Pure: no I/O, no clock reads, integer pence only.
 */

import { MONTHS } from './engine.ts';

export type LedgerFormula = 'amount' | 'cashflow' | 'savings' | 'telco';

/** The parts of a sheet the balance rules need. UI column labels stay in the app. */
export type LedgerSpec = {
  rowsKey: 'entries' | 'statement';
  formula: LedgerFormula;
  monthly: boolean;
};

const monthIndex = (label: string) => (MONTHS as readonly string[]).indexOf(label);

export const monthRank = (month: unknown) => {
  const label = String(month ?? '');
  if (label === 'Opening Balance') return -1;
  const index = monthIndex(label);
  return index < 0 ? 99 : index;
};

export const hasManualOrder = (rows: any[]) => rows.some((row) => Number.isFinite(row.sortIndex));

/**
 * Manual order is only used after the user moves a row. Until then the ledger
 * stays chronological, so adding a row behaves exactly as it did before.
 */
export function sortRows(rows: any[], spec: LedgerSpec) {
  if (hasManualOrder(rows)) {
    const rank = (row: any) => (Number.isFinite(row.sortIndex) ? row.sortIndex : Number.MAX_SAFE_INTEGER);
    rows.sort((a, b) => rank(a) - rank(b) || String(a.month ?? a.date ?? '').localeCompare(String(b.month ?? b.date ?? '')));
    return;
  }
  if (spec.monthly) rows.sort((a, b) => monthRank(a.month) - monthRank(b.month) || String(a.month ?? '').localeCompare(String(b.month ?? '')));
  else rows.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
}

/**
 * Move one stored row and pin every row's position. The caller captures the
 * carry-forward first, then recalculates after this reorder.
 */
export function reorderRows(rows: any[], index: number, delta: number): boolean {
  const target = index + delta;
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) return false;
  if (!Number.isInteger(target) || target < 0 || target >= rows.length) return false;
  const [row] = rows.splice(index, 1);
  rows.splice(target, 0, row);
  rows.forEach((entry, position) => {
    entry.sortIndex = position;
  });
  return true;
}

/** Add a row at the end when the user has taken control of the order. */
export function appendRow(rows: any[], row: any, spec: LedgerSpec) {
  const manual = hasManualOrder(rows);
  if (manual) {
    row.sortIndex = rows.reduce((highest, entry) => (
      Number.isFinite(entry.sortIndex) ? Math.max(highest, entry.sortIndex) : highest
    ), -1) + 1;
  }
  rows.push(row);
  sortRows(rows, spec);
}

/** Remove manual positions and restore the ledger's natural date/month order. */
export function clearRowOrder(rows: any[], spec: LedgerSpec) {
  for (const row of rows) delete row.sortIndex;
  sortRows(rows, spec);
}

/** Recover the carry-forward before the first row so edits preserve the ledger's starting point. */
export function baselineFor(spec: LedgerSpec, rows: any[], stored?: number): number {
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  if (rows.length === 0) return 0;
  const first = rows[0];
  const balance = Number(first.balancePence) || 0;
  const payment = Number(first.paymentPence) || 0;
  const bill = Number(first.billAmountPence) || 0;
  const amount = Number(first.amountPence) || 0;
  if (spec.formula === 'cashflow') return balance - payment + bill;
  if (spec.formula === 'savings') return balance + payment;
  if (spec.formula === 'telco') return balance - payment + amount;
  return balance - amount;
}

/**
 * Recalculate every running balance in the current row order.
 *
 * Savings sheets carry one extra workbook rule: once a plan is paid off (the
 * balance reaches zero) and a later row opens a fresh plan, that row starts a
 * new cycle with its own total. Park Xmas pays off in September and restarts in
 * October, so the stored October balance is the new plan's anchor rather than a
 * payment-reduced leftover. The rule only fires after a completed plan, so
 * ordinary rows — and an overpayment while a plan is still running — cannot look
 * like a restart.
 */
export function recalculate(spec: LedgerSpec, rows: any[], baseline: number) {
  let running = baseline;
  let totalPaid = 0;
  for (const row of rows) {
    const payment = Number(row.paymentPence) || 0;
    const bill = Number(row.billAmountPence) || 0;
    const amount = Number(row.amountPence) || 0;
    const stored = Number(row.balancePence);
    if (spec.formula === 'cashflow') running += payment - bill;
    else if (spec.formula === 'savings') {
      if (row.opening === true) {
        running = Number(row.balancePence) || 0;
        totalPaid = 0;
        row.totalPaidPence = 0;
      } else if (running <= 0 && Number.isFinite(stored) && stored > running) {
        // A new plan cycle after the previous one was paid off.
        running = stored;
        totalPaid = payment;
        row.totalPaidPence = totalPaid;
      } else {
        running -= payment;
        totalPaid += payment;
        row.totalPaidPence = totalPaid;
      }
      // A typed total anchors the running total the same way a typed balance
      // anchors the balance, so a new plan can start from its own figure.
      if (Number.isFinite(row.totalPaidOverridePence)) {
        totalPaid = Number(row.totalPaidOverridePence);
        row.totalPaidPence = totalPaid;
      }
    } else if (spec.formula === 'telco') running += payment - amount;
    else running += amount;
    if (Number.isFinite(row.balanceOverridePence)) running = row.balanceOverridePence;
    row.balancePence = running;
  }
}

/**
 * The date a statement row represents, so balances can stop at the as-of date.
 * Monthly rows are dated the 1st of their month (a known workbook behaviour),
 * and an Opening Balance row belongs to the start of the sheet's year.
 */
export function statementRowDate(row: any, year: number): string | null {
  if (typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) return row.date;
  const label = String(row.month ?? '');
  const openingYear = label.match(/^(\d{4})\b/);
  if (row.opening === true) return openingYear ? `${openingYear[1]}-01-01` : `${year}-01-01`;
  const index = monthIndex(label);
  if (index < 0) return null;
  return `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

/**
 * Latest row the as-of date has actually reached. This is the per-sheet query
 * Phase 2 was missing: pass a provider's rows (already adjusted for scheduled
 * payments if the caller wants that), the statement year and the as-of date.
 */
export function balanceAsOf(rows: any[], year: number, asOfDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return [...rows].reverse().find((row) => typeof row.balancePence === 'number') ?? null;
  }
  let latest: any = null;
  for (const row of rows) {
    if (typeof row.balancePence !== 'number') continue;
    const rowDate = statementRowDate(row, year);
    if (rowDate && rowDate <= asOfDate) latest = row;
  }
  return latest;
}

/** The balance figure only, for metrics and reports. */
export function balancePenceAsOf(rows: any[], year: number, asOfDate: string): number | null {
  const row = balanceAsOf(rows, year, asOfDate);
  return row && typeof row.balancePence === 'number' ? row.balancePence : null;
}
