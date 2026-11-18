/**
 * Cleanup actions (R16): duplicate merge and bulk editing.
 *
 * A merge keeps the oldest row and turns every later duplicate into a zero
 * amount linked to it, so the engine's existing sums need no special case and
 * the merged row cannot be counted twice. The original amount is kept only for
 * an exact undo. Bulk edits change labels, never amounts or dates.
 */
import type { Dataset } from './engine.ts';
import { normaliseCategory, normaliseTags } from './categories.ts';

export interface BulkPatch {
  category?: string | null;
  tags?: string[];
}

export interface MergeResult {
  ok: boolean;
  message: string;
  keptRow?: number;
  mergedRows?: number[];
}

export interface BulkResult {
  updated: number;
  skipped: number;
  message: string;
}

/**
 * Merge a group of rows that share date, account, type and amount. Rows must
 * be ordinary saved transactions; generated bill rows and an existing merge
 * are refused.
 */
export function mergeDuplicateRows(ds: Dataset, rowNumbers: readonly number[]): MergeResult {
  const wanted = [...new Set(rowNumbers)].sort((left, right) => left - right);
  if (wanted.length < 2) return { ok: false, message: 'Choose at least two rows to merge' };

  const rows = wanted.map((row) => ds.transactions.find((tx) => tx.row === row));
  if (rows.some((row) => !row)) return { ok: false, message: 'One of those rows no longer exists' };
  const first = rows[0]!;
  if (first.autoBill === true) return { ok: false, message: 'Generated bill rows cannot be merged' };
  if (first.mergedIntoRow) return { ok: false, message: 'Those rows are already merged' };

  for (const row of rows) {
    if (!row) continue;
    if (row.autoBill === true) return { ok: false, message: 'Generated bill rows cannot be merged' };
    if (row.mergedIntoRow) return { ok: false, message: 'Those rows are already merged' };
    if (row.date !== first.date || row.account !== first.account || row.type !== first.type) {
      return { ok: false, message: 'Only rows with the same date, account and type can be merged' };
    }
    if (row.amountPence !== first.amountPence) {
      return { ok: false, message: 'Only rows with the same amount can be merged' };
    }
  }

  const kept = first;
  const merged = rows.slice(1).map((row) => row!.row);
  const at = new Date().toISOString();
  for (const row of rows.slice(1)) {
    if (!row) continue;
    row.mergedIntoRow = kept.row;
    row.mergedFromPence = row.amountPence;
    row.mergedAt = at;
    row.amountPence = 0;
  }

  return {
    ok: true,
    message: `Merged ${merged.length} row${merged.length === 1 ? '' : 's'} into row ${kept.row}; totals now count the payment once`,
    keptRow: kept.row,
    mergedRows: merged,
  };
}

/** Undo a merge exactly: restore the stored amount and remove the link. */
export function unmergeTransaction(ds: Dataset, rowNumber: number): MergeResult {
  const row = ds.transactions.find((tx) => tx.row === rowNumber);
  if (!row || !row.mergedIntoRow) return { ok: false, message: 'That row is not merged' };
  row.amountPence = typeof row.mergedFromPence === 'number' ? row.mergedFromPence : row.amountPence;
  delete row.mergedIntoRow;
  delete row.mergedFromPence;
  delete row.mergedAt;
  return { ok: true, message: `Row ${rowNumber} restored` };
}

export function mergedRows(ds: Dataset) {
  return ds.transactions
    .filter((tx) => typeof tx.mergedIntoRow === 'number')
    .sort((left, right) => (right.mergedAt ?? '').localeCompare(left.mergedAt ?? '') || right.row - left.row);
}

/**
 * Apply a category and/or tag list to selected rows. Locked months are skipped
 * by the caller's predicate; nothing about the amount, date or account changes.
 */
export function bulkEditTransactions(
  ds: Dataset,
  rowNumbers: readonly number[],
  patch: BulkPatch,
  isLocked: (date: string) => boolean,
): BulkResult {
  let updated = 0;
  let skipped = 0;
  const category = patch.category === undefined ? undefined : normaliseCategory(patch.category ?? '');
  const tags = patch.tags === undefined ? undefined : normaliseTags(patch.tags);

  for (const rowNumber of new Set(rowNumbers)) {
    const tx = ds.transactions.find((entry) => entry.row === rowNumber);
    if (!tx) { skipped += 1; continue; }
    if (isLocked(tx.date)) { skipped += 1; continue; }
    if (patch.category !== undefined) tx.category = category ?? '';
    if (patch.tags !== undefined) tx.tags = tags ?? [];
    updated += 1;
  }

  return {
    updated,
    skipped,
    message: `${updated} transaction${updated === 1 ? '' : 's'} updated${skipped ? `; ${skipped} locked or missing skipped` : ''}`,
  };
}
