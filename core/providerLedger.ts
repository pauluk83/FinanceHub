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
  // A plan that pays off in the summer restarts with a fresh opening balance
  // after August, so that line sits between August and September.
  if (/^\d{4}\s+opening balance$/i.test(label)) return MONTHS.indexOf('Aug') + 0.5;
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
  const credit = Number(first.creditPence) || 0;
  const refund = Math.max(0, Number(first.refundPence) || 0);
  const amount = Number(first.amountPence) || 0;
  if (spec.formula === 'cashflow') return balance - payment + bill - credit + refund;
  if (spec.formula === 'savings') return balance + payment;
  if (spec.formula === 'telco') return balance - payment + amount;
  return balance - amount;
}

/**
 * The sheet's own opening line.
 *
 * Older sheets do not carry the flag, so the label the workbook uses counts
 * too: a line reading "Opening Balance" is the anchor every later row comes
 * off, exactly like `opening: true`. A year line such as
 * "2027 Opening Balance" is a new plan, not the sheet's anchor.
 */
export function isOpeningRow(row: any): boolean {
  if (row?.opening === true) return true;
  return /^opening balance$/i.test(String(row?.month ?? '').trim());
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
    // A credit on the bill (Warm Home Discount, a goodwill credit) raises the
    // balance like a payment. It is not energy use, so `usagePenceFor` ignores it.
    const credit = Number(row.creditPence) || 0;
    // A refund is money the provider paid back for credit held, so it leaves the
    // account like a bill. Balance = previous + payment + credit − bill − refund.
    const refund = Math.max(0, Number(row.refundPence) || 0);
    const amount = Number(row.amountPence) || 0;
    const stored = Number(row.balancePence);
    if (spec.formula === 'cashflow') running += payment - bill + credit - refund;
    else if (spec.formula === 'savings') {
      if (isOpeningRow(row)) {
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
 * Payments still to come before a savings plan clears.
 *
 * Walks the months after the as-of date in order, taking each row's payment off
 * the balance until nothing is left, so a plan whose payment changes month by
 * month counts its real number of payments rather than one division. Months
 * with no payment are skipped; a balance already at zero needs nothing.
 */
export function remainingPaymentsFor(balancePence: number, payments: readonly number[]): number {
  let left = Math.max(0, Number(balancePence) || 0);
  if (left === 0) return 0;
  let count = 0;
  for (const value of payments) {
    const payment = Number(value) || 0;
    if (payment <= 0) continue;
    left -= payment;
    count += 1;
    if (left <= 0) break;
  }
  return count;
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const utcDay = (year: number, month: number, day: number) => Date.UTC(year, month, day);

/**
 * Months of service a bill period covers. Water bills every six months, so one
 * row can stand for half a year of use; averaging by row count would multiply
 * its usage by six. Accepts the workbook's two forms ("12/03/26-09/09/26" and
 * "17 Jan - 16 Feb") and falls back to one month when the text is unusable.
 */
export function billPeriodMonths(period: unknown, fallback = 1): number {
  const text = String(period ?? '').trim();
  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{2,4}))?\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{2,4}))?$/);
  let start: number | null = null;
  let end: number | null = null;
  if (numeric) {
    const year = (raw: string) => (raw.length === 2 ? 2000 + Number(raw) : Number(raw));
    start = utcDay(year(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
    end = utcDay(year(numeric[6]), Number(numeric[5]) - 1, Number(numeric[4]));
  } else if (named) {
    const startMonth = MONTH_NAMES.indexOf(named[2].slice(0, 3).toLowerCase());
    const endMonth = MONTH_NAMES.indexOf(named[5].slice(0, 3).toLowerCase());
    if (startMonth >= 0 && endMonth >= 0) {
      const startYear = named[3] ? (named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3])) : 2000;
      let endYear = named[6] ? (named[6].length === 2 ? 2000 + Number(named[6]) : Number(named[6])) : startYear;
      // "17 Dec - 16 Jan" without years crosses into the next year.
      if (!named[6] && endMonth < startMonth) endYear += 1;
      start = utcDay(startYear, startMonth, Number(named[1]));
      end = utcDay(endYear, endMonth, Number(named[4]));
    }
  }
  if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return fallback;
  const months = Math.round((end - start) / (30.44 * 86_400_000));
  return Math.max(1, Math.min(24, months));
}

/** Total months of service covered by the billed rows, one row's period each. */
export function billingMonthsFor(rows: any[]): number {
  return rows.reduce((total, row) => (
    (Number(row?.billAmountPence) || 0) > 0 ? total + billPeriodMonths(row?.billPeriod, 1) : total
  ), 0);
}

/** The usual gap between bills, so a plan can size the next bill's buffer. */
export function billingCadenceMonths(rows: any[]): number {
  const bills = rows.filter((row) => (Number(row?.billAmountPence) || 0) > 0);
  if (bills.length === 0) return 1;
  const average = bills.reduce((total, row) => total + billPeriodMonths(row?.billPeriod, 1), 0) / bills.length;
  return Math.max(1, Math.min(12, Math.round(average)));
}

/**
 * Record a bill on the row whose period it covers.
 *
 * Idempotent: a row that already carries a bill is left alone, so a data fix or
 * a re-import cannot charge the same statement twice. A `creditPence` (the Warm
 * Home Discount, a goodwill credit) raises the balance but never counts as use.
 */
export function recordBill(
  spec: LedgerSpec,
  rows: any[],
  bill: { month: string; billPeriod: string; billAmountPence: number; creditPence?: number },
  baseline: number,
): boolean {
  const existing = rows.find((row) => (
    String(row?.month ?? '') === bill.month && String(row?.billPeriod ?? '') === bill.billPeriod
  ));
  if (!existing) return false;
  if ((Number(existing.billAmountPence) || 0) !== 0) return false;
  existing.billAmountPence = Math.round(bill.billAmountPence);
  if (bill.creditPence) existing.creditPence = Math.round(bill.creditPence);
  recalculate(spec, rows, baseline);
  return true;
}

/** Total billed across a year's rows; a row without a bill adds nothing. */
export function billedTotalPence(rows: any[]): number {
  return rows.reduce((total, row) => total + (Number(row?.billAmountPence) || 0), 0);
}

/**
 * Energy used in a statement period. The bill is what the period used; a refund
 * is its own flow on the row (money paid back for credit), so it never inflates
 * the usage a payment plan is built from.
 */
export function usagePenceFor(row: any): number {
  return Number(row?.billAmountPence) || 0;
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
