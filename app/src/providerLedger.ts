/**
 * UI-side provider ledger configuration.
 *
 * The balance rules themselves live in `core/providerLedger.ts` and are
 * re-exported here, so the app and any other port share one implementation.
 */

import { isOpeningRow, type LedgerSpec } from '../../core/providerLedger.ts';

/** The one mark every provider sheet uses for a paid month. */
export const PAID_MARK = '✓';

/**
 * True for every way a saved sheet has recorded a payment: the single mark, the
 * older "✓ Yes", a plain "yes", or the savings plans' "Paid"/"Paid Off"
 * status. The sheets never print the saved text itself, only the one mark.
 */
export function isPaidValue(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  return text === PAID_MARK || text === `✓ yes` || text === 'yes' || text === 'paid' || text === 'paid off';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export * from '../../core/providerLedger.ts';

export type LedgerColumn = {
  key: string;
  label: string;
  money?: boolean;
  edit?: 'text' | 'date' | 'money' | 'month' | 'check';
  options?: string[];
  /** Show a zero as an empty box, so a figure can be typed without clearing it. */
  blankZero?: boolean;
  /** Blank a zero only from this month (YYYY-MM) onwards, e.g. after a contract ends. */
  blankZeroFrom?: string;
  /** Blank the cell from this month (YYYY-MM) onwards whatever it holds. */
  blankFrom?: string;
  /** Show the value as plain text, and nothing at all where it is empty. */
  readOnlyBlank?: boolean;
};

/**
 * Which rows of a plan that pays off mid-year stay empty.
 *
 * A year nobody has filled in yet prints no money at all, and after an opening
 * balance line the months stay empty until a payment follows it — otherwise a
 * carried figure would print down a year that has not been paid into. The
 * opening line shows a figure only when one has been typed into it.
 */
export function quietPlanRows(rows: any[]): boolean[] {
  const paid = (row: any) => Number(row?.paymentPence ?? 0) !== 0;
  const firstPayment = rows.findIndex((row) => !isOpeningRow(row) && paid(row));
  const lastOpening = rows.reduce((last, row, index) => (isOpeningRow(row) ? index : last), -1);
  const firstAfterOpening = lastOpening < 0 ? -1 : rows.findIndex((row, index) => index > lastOpening && paid(row));
  return rows.map((row, index) => {
    // An opening line only prints a figure the owner has typed into it; a
    // carried balance waits until a payment brings the new plan into being.
    if (isOpeningRow(row)) return !Number.isFinite(row?.balanceOverridePence);
    if (firstPayment < 0 || index < firstPayment) return true;
    if (lastOpening < 0 || index <= lastOpening) return false;
    return firstAfterOpening < 0 || index < firstAfterOpening;
  });
}

/**
 * Mark the months that have arrived as paid, and leave later months blank.
 *
 * A month counts as paid once the payment's own date has been reached and the
 * row carries a payment, so the Status and Paid columns only ever list what has
 * actually been paid rather than announcing every future month. Pass the linked
 * bills' due dates to tick a month off on its real day; without them the month
 * itself is the test.
 */
export function markPaidRows(rows: any[], year: number, asOfDate: unknown, dueDates: Record<string, string> = {}): any[] {
  const cutoff = String(asOfDate ?? '').slice(0, 7);
  const today = String(asOfDate ?? '');
  if (!/^\d{4}-\d{2}$/.test(cutoff) || !Number.isInteger(year)) return rows;
  return rows.map((row) => {
    if (isOpeningRow(row)) return row;
    const month = MONTH_NAMES.indexOf(String(row?.month ?? '')) + 1;
    if (month < 1) return row;
    const dueDate = String(dueDates[String(row?.month ?? '')] ?? '');
    const arrived = /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
      ? dueDate <= today
      : `${year}-${String(month).padStart(2, '0')}` <= cutoff;
    const paid = arrived && Number(row?.paymentPence ?? 0) !== 0;
    return { ...row, paid: paid ? PAID_MARK : '' };
  });
}

/**
 * True when a cell should read empty: a column that blanks zeros (always, or
 * from a month), or one blanked from a month whatever the figure is.
 */
export function blankCell(
  column: { blankZero?: boolean; blankZeroFrom?: string; blankFrom?: string },
  value: unknown,
  year: number,
  month?: number,
): boolean {
  const at = `${year}-${String(month ?? 1).padStart(2, '0')}`;
  if (column.blankFrom && Number.isInteger(year) && at >= column.blankFrom) return true;
  if (Number(value)) return false;
  if (column.blankZero === true) return true;
  return Boolean(column.blankZeroFrom) && Number.isInteger(year) && at >= (column.blankZeroFrom as string);
}

/** A sheet's rules plus the column labels, note and add-form defaults the UI needs. */
export type LedgerConfig = LedgerSpec & {
  /** Mark each month as paid once the as-of date reaches it (a savings plan). */
  markPaidByDate?: boolean;
  /** Keep months nobody has paid into empty, carried figures included. */
  quietUntilPaid?: boolean;
  columns: LedgerColumn[];
  note: string;
  defaults: Record<string, string>;
};
