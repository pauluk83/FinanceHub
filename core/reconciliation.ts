/**
 * Reconciliation, statement checks and import rollback (R9).
 *
 * A statement check compares what the bank says the closing balance was with
 * what the engine calculates at the same close. None of this is part of the
 * money model: `cleared` is evidence, not arithmetic, and undoing an import
 * removes exactly that batch's rows and nothing else.
 */
import { normaliseCategory, normaliseTags } from './categories.ts';
import type { Dataset, Engine, Tx } from './engine.ts';

export interface StatementCheck {
  name: string;
  kind: 'account' | 'card';
  /** What the statement says the closing balance was. */
  statementPence: number;
  /** What the engine calculated for the same close date. */
  calculatedPence: number;
  /** statement − calculated. Zero means the close agrees. */
  differencePence: number;
}

export interface ReconciliationRow {
  name: string;
  kind: 'account' | 'card';
  calculatedPence: number;
}

/** A stable key for one balance in the month-end form. */
export function reconciliationKey(row: Pick<ReconciliationRow, 'kind' | 'name'>): string {
  return `${row.kind}:${row.name}`;
}

/**
 * The balances a month close should check: every active bank account and card,
 * using the same figures the lock will store.
 */
export function reconciliationRows(ds: Dataset, engine: Engine, through: string): ReconciliationRow[] {
  const accounts = engine.accountBalances(through)
    .filter((account) => account.active !== false)
    .map((account) => ({ name: account.name, kind: 'account' as const, calculatedPence: account.balancePence }));
  const cards = engine.cardBalances(through)
    .filter((card) => card.active !== false)
    .map((card) => ({ name: card.name, kind: 'card' as const, calculatedPence: card.balancePence }));
  return [...accounts, ...cards];
}

/**
 * Turn typed closing balances into checks. A missing entry means the owner has
 * not checked that balance against a statement, which never blocks a lock.
 */
export function buildStatementChecks(
  rows: readonly ReconciliationRow[],
  typed: Readonly<Record<string, number | null | undefined>>,
): StatementCheck[] {
  const checks: StatementCheck[] = [];
  for (const row of rows) {
    const value = typed[reconciliationKey(row)];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    checks.push({
      name: row.name,
      kind: row.kind,
      statementPence: value,
      calculatedPence: row.calculatedPence,
      differencePence: value - row.calculatedPence,
    });
  }
  return checks;
}

export interface ReconciliationGate {
  /** Statement checks that do not agree with the engine. */
  differences: StatementCheck[];
  /** How many balances were checked at all. */
  checked: number;
  /** True when an unexplained difference must stop the lock. */
  blocked: boolean;
  /** True when the owner has supplied the written explanation. */
  overrideUsed: boolean;
  message: string;
}

/**
 * The plan's gate: a zero difference locks immediately, a difference needs a
 * written note before the month can close. A blank note is not a note.
 */
export function reconciliationGate(checks: readonly StatementCheck[], note: string): ReconciliationGate {
  const differences = checks.filter((check) => check.differencePence !== 0);
  const explained = note.trim().length > 0;
  const blocked = differences.length > 0 && !explained;
  const message = differences.length === 0
    ? (checks.length === 0 ? 'No balances checked against a statement.' : 'Every checked balance agrees.')
    : blocked
      ? `${differences.length} balance${differences.length === 1 ? ' does' : 's do'} not match the statement. Add a reconciliation note to explain the difference.`
      : `${differences.length} explained difference${differences.length === 1 ? '' : 's'} will be recorded with the lock.`;
  return {
    differences,
    checked: checks.length,
    blocked,
    overrideUsed: differences.length > 0 && explained,
    message,
  };
}

/* ------------------------------------------------------------ import batches */

export interface ImportBatch {
  id: string;
  importedAt: string;
  /** File name, or the bank feed that produced the rows. */
  source: string;
  account: string;
  rows: number;
  /** Earliest and latest transaction date in the batch. */
  from: string;
  to: string;
  totalPence: number;
}

export const IMPORT_BATCH_LIMIT = 40;

/** A readable, collision-free id for a new import batch. */
export function newImportBatchId(existing: readonly ImportBatch[], at = new Date().toISOString()): string {
  const day = at.slice(0, 10).replace(/-/g, '');
  const ids = new Set(existing.map((batch) => batch.id));
  let index = existing.length + 1;
  let id = `import_${day}_${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `import_${day}_${index}`;
  }
  return id;
}

export function importBatchSummary(
  id: string,
  source: string,
  account: string,
  importedAt: string,
  rows: readonly Tx[],
): ImportBatch {
  const dates = rows.map((row) => row.date).sort();
  const totalPence = rows.reduce((sum, row) => sum + (row.type === 'Income' ? row.amountPence : -row.amountPence), 0);
  return {
    id,
    importedAt,
    source,
    account,
    rows: rows.length,
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    totalPence,
  };
}

export interface StagedImportRow {
  date: string;
  account: string;
  type: 'Income' | 'Expense';
  amountPence: number;
  comments: string;
  category?: string;
  tags?: string[];
}

/**
 * Append one reviewed import as a single undoable batch. Every import path —
 * a CSV, a saved column profile, the Starling feed and Open Banking — goes
 * through this, so a batch is never created without the feed being named.
 */
export function commitImportBatch(
  dataset: Dataset,
  staged: readonly StagedImportRow[],
  options: { source: string; importedAt?: string },
): ImportBatch | null {
  if (staged.length === 0) return null;
  const importedAt = options.importedAt ?? new Date().toISOString();
  const id = newImportBatchId(dataset.importBatches ?? [], importedAt);
  let row = Math.max(0, ...dataset.transactions.map((entry) => entry.row));
  const added: Tx[] = [];

  for (const stagedRow of staged) {
    row += 1;
    const category = normaliseCategory(stagedRow.category ?? '');
    const tags = normaliseTags(stagedRow.tags ?? []);
    const entry: Tx = {
      row,
      date: stagedRow.date,
      account: stagedRow.account,
      type: stagedRow.type,
      amountPence: stagedRow.amountPence,
      comments: stagedRow.comments,
      status: '',
      budgetTreatment: '',
      importBatchId: id,
      ...(category ? { category } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };
    dataset.transactions.push(entry);
    added.push(entry);
  }

  // A rule may move a row to another account, so the batch records the real
  // destination rather than whichever account was selected in the toolbar.
  const accounts = [...new Set(added.map((entry) => entry.account))];
  const batch = importBatchSummary(
    id,
    options.source || 'Import',
    accounts.length === 1 ? accounts[0] : 'Multiple accounts',
    importedAt,
    added,
  );
  dataset.importBatches = [...(dataset.importBatches ?? []), batch].slice(-IMPORT_BATCH_LIMIT);
  return batch;
}

export function batchRows(ds: Dataset, id: string): Tx[] {
  return ds.transactions.filter((row) => row.importBatchId === id);
}

/** Month keys (`YYYY-MM`) in this batch that are already locked. */
export function batchLockedMonths(ds: Dataset, id: string): string[] {
  const locks = ds.monthLocks ?? {};
  return [...new Set(batchRows(ds, id).map((row) => row.date.slice(0, 7)))]
    .filter((key) => Boolean(locks[key]))
    .sort();
}

export interface UndoBatchResult {
  ok: boolean;
  removed: number;
  message: string;
}

/**
 * Remove one import batch. The whole batch is refused when any of its rows sit
 * in a locked month, because a lock is a saved close and not a filter. Rows
 * from every other batch, and hand-entered rows, are untouched.
 */
export function undoImportBatch(dataset: Dataset, id: string): UndoBatchResult {
  const rows = batchRows(dataset, id);
  if (rows.length === 0) return { ok: false, removed: 0, message: 'That import has no rows left to remove.' };
  const locked = batchLockedMonths(dataset, id);
  if (locked.length > 0) {
    return {
      ok: false,
      removed: 0,
      message: `Unlock ${locked.join(', ')} before undoing this import; a locked month is a saved close.`,
    };
  }
  dataset.transactions = dataset.transactions.filter((row) => row.importBatchId !== id);
  dataset.importBatches = (dataset.importBatches ?? []).filter((batch) => batch.id !== id);
  return {
    ok: true,
    removed: rows.length,
    message: `Removed ${rows.length} transaction${rows.length === 1 ? '' : 's'} from that import; every other row is untouched.`,
  };
}
