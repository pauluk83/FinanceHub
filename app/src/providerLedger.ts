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
};

/** True when a zero should read as an empty cell: always, or from a given month. */
export function blankZeroCell(
  column: { blankZero?: boolean; blankZeroFrom?: string },
  year: number,
  month?: number,
): boolean {
  if (column.blankZero === true) return true;
  if (!column.blankZeroFrom || !Number.isInteger(year)) return false;
  return `${year}-${String(month ?? 1).padStart(2, '0')}` >= column.blankZeroFrom;
}

/** A sheet's rules plus the column labels, note and add-form defaults the UI needs. */
export type LedgerConfig = LedgerSpec & {
  columns: LedgerColumn[];
  note: string;
  defaults: Record<string, string>;
};
