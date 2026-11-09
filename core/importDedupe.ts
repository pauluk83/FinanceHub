/**
 * Duplicate detection for the CSV review grid and the read-only duplicate report.
 *
 * The import keeps the workbook/Starling convention: a row matches an existing
 * transaction when the type and absolute amount agree and the dates are within
 * one day. In-batch detection applies the same rule against earlier rows in the
 * same file, so loading one export twice in a row is caught before anything is
 * committed.
 */

export type DuplicateFlag = 'existing' | 'staged' | null;

export interface DedupeCandidate {
  date: string;
  type: 'Income' | 'Expense';
  amountPence: number;
}

export interface DedupeRow {
  date: string;
  type: string;
  amountPence: number;
}

export interface DuplicateGroup<T> {
  key: string;
  date: string;
  account: string;
  type: string;
  amountPence: number;
  rows: T[];
}

const DAY_MS = 86_400_000;

function dayValue(iso: string): number {
  return Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
}

export function matchesTransaction(candidate: DedupeCandidate, row: DedupeRow): boolean {
  if (row.type !== candidate.type) return false;
  if (Math.abs(row.amountPence) !== Math.abs(candidate.amountPence)) return false;
  const candidateDay = dayValue(candidate.date);
  const rowDay = dayValue(row.date);
  if (!Number.isFinite(candidateDay) || !Number.isFinite(rowDay)) return false;
  return Math.abs(candidateDay - rowDay) <= DAY_MS;
}

/**
 * Flag staged rows in order: `existing` when a saved transaction matches,
 * `staged` when an earlier row in this file already matched. The first
 * occurrence stays unflagged so a genuine new payment is still importable.
 */
export function detectDuplicates(
  existing: readonly DedupeRow[],
  candidates: readonly DedupeCandidate[],
): DuplicateFlag[] {
  const seen: DedupeCandidate[] = [];
  return candidates.map((candidate) => {
    let flag: DuplicateFlag = null;
    if (existing.some((row) => matchesTransaction(candidate, row))) flag = 'existing';
    else if (seen.some((row) => matchesTransaction(candidate, row))) flag = 'staged';
    seen.push(candidate);
    return flag;
  });
}

/**
 * Read-only report: rows that share the exact date, account, type and amount.
 * The caller must not delete anything; the owner reviews each group.
 */
export function duplicateGroups<T extends {
  date: string;
  account: string;
  type: string;
  amountPence: number;
}>(rows: readonly T[]): DuplicateGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.date}|${row.account}|${row.type}|${row.amountPence}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      date: list[0].date,
      account: list[0].account,
      type: list[0].type,
      amountPence: list[0].amountPence,
      rows: list,
    }))
    .sort((a, b) => a.date.localeCompare(b.date)
      || a.account.localeCompare(b.account)
      || a.amountPence - b.amountPence
      || a.type.localeCompare(b.type));
}
