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
};

/** A sheet's rules plus the column labels, note and add-form defaults the UI needs. */
export type LedgerConfig = LedgerSpec & {
  columns: LedgerColumn[];
  note: string;
  defaults: Record<string, string>;
};
