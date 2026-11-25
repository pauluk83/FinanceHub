/**
 * UI-side provider ledger configuration.
 *
 * The balance rules themselves live in `core/providerLedger.ts` and are
 * re-exported here, so the app and any other port share one implementation.
 */

import type { LedgerSpec } from '../../core/providerLedger.ts';

export * from '../../core/providerLedger.ts';

export type LedgerColumn = {
  key: string;
  label: string;
  money?: boolean;
  edit?: 'text' | 'date' | 'money' | 'month';
  options?: string[];
  /** Show a zero as an empty box, so a figure can be typed without clearing it. */
  blankZero?: boolean;
  /** Blank a zero only from this month (YYYY-MM) onwards, e.g. after a contract ends. */
  blankZeroFrom?: string;
  /** Blank the cell from this month (YYYY-MM) onwards whatever it holds. */
  blankFrom?: string;
  /**
   * From this month number onwards, keep money cells empty until the year has a
   * payment again: a plan that was paid off prints no balance for months that
   * have not been filled in, and starts showing figures at the first payment.
   */
  blankUntilPaidFrom?: number;
};

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
  columns: LedgerColumn[];
  note: string;
  defaults: Record<string, string>;
};
