/**
 * Provider sheets keep the later years as imported `years` blocks: the live
 * rows for the configured year stay at the top level (`statement`/`entries`)
 * and every other year is a block with its own `rows`, opening balance and
 * closing balance. Bills and views resolve a year through this module so a
 * future year is read from its own block instead of reusing the live rows.
 */

export type ProviderRowsKey = 'statement' | 'entries';

const ENTRIES_PROVIDERS = new Set(['rent', 'councilTax']);

export function providerRowsKey(provider: string): ProviderRowsKey {
  return ENTRIES_PROVIDERS.has(provider) ? 'entries' : 'statement';
}

/** The year the live top-level rows belong to, when the sheet records one. */
export function providerBlockYear(provider: any): number | null {
  const year = Number(provider?.year ?? provider?.targetYear);
  return Number.isInteger(year) ? year : null;
}

export interface ProviderYearRows {
  rows: any[];
  /** True when the rows come from an imported year block rather than the live sheet. */
  archived: boolean;
}

/**
 * Rows for a year. A matching `years` block wins; otherwise the live rows are
 * used for the live year (or for sheets that never recorded a year).
 */
export function rowsForYear(provider: any, rowsKey: ProviderRowsKey, year: number): ProviderYearRows | null {
  if (!provider || !Number.isInteger(year)) return null;
  const block = provider.years?.[String(year)];
  if (block && Array.isArray(block.rows)) {
    return { rows: block.rows, archived: providerBlockYear(provider) !== year };
  }
  const liveYear = providerBlockYear(provider);
  if (liveYear === null || liveYear === year) {
    return { rows: Array.isArray(provider[rowsKey]) ? provider[rowsKey] : [], archived: false };
  }
  return null;
}
