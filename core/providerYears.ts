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

export interface ProviderYearEdit {
  rows: any[];
  /** The balance carried into this year's first row. */
  openingPence?: number;
  /** True when this year is stored in its own `years` block. */
  block: boolean;
  /** False for a future year that has no block yet; adding a row creates it. */
  exists: boolean;
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

function lastBalance(rows: any[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (typeof rows[index]?.balancePence === 'number') return rows[index].balancePence;
  }
  return null;
}

/**
 * The writable rows for a selected year. A matching block is edited in place;
 * the live sheet is editable for its own year; a future year without a block
 * starts empty and is created by `ensureRowsForEdit` on the first change.
 */
export function rowsForEdit(provider: any, rowsKey: ProviderRowsKey, year: number): ProviderYearEdit | null {
  if (!provider || !Number.isInteger(year)) return null;
  const block = provider.years?.[String(year)];
  if (block && Array.isArray(block.rows)) {
    return {
      rows: block.rows,
      openingPence: typeof block.openingPence === 'number' ? block.openingPence : undefined,
      block: true,
      exists: true,
    };
  }
  const liveYear = providerBlockYear(provider);
  if (liveYear === null || liveYear === year) {
    return {
      rows: Array.isArray(provider[rowsKey]) ? provider[rowsKey] : [],
      openingPence: typeof provider.ledgerOpeningPence === 'number' ? provider.ledgerOpeningPence : undefined,
      block: false,
      exists: true,
    };
  }
  return { rows: [], openingPence: undefined, block: true, exists: false };
}

/** Create a missing year block from the previous year's close, then return its rows. */
export function ensureRowsForEdit(provider: any, rowsKey: ProviderRowsKey, year: number): ProviderYearEdit {
  const current = rowsForEdit(provider, rowsKey, year);
  if (!current) throw new Error('A provider and year are required');
  if (current.exists) return current;

  const previous = rowsForYear(provider, rowsKey, year - 1)?.rows ?? [];
  const opening = lastBalance(previous)
    ?? (typeof provider.closingBalancePence === 'number' ? provider.closingBalancePence : 0);
  const block = { year, openingPence: opening, closingPence: opening, rows: [] as any[] };
  provider.years = { ...(provider.years ?? {}), [String(year)]: block };
  return { rows: block.rows, openingPence: opening, block: true, exists: true };
}
