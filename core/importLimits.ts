/**
 * Import and restore limits. These are deliberately generous for a personal
 * budget but small enough that a malformed or hostile file is rejected before
 * it is parsed into memory.
 */

export const MAX_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_CSV_ROWS = 20_000;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

const MB = 1024 * 1024;

export function csvFileProblem(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes < 0) return 'That CSV could not be read.';
  if (bytes === 0) return 'That CSV is empty.';
  if (bytes > MAX_CSV_BYTES) {
    return `That CSV is larger than ${MAX_CSV_BYTES / MB} MB. Export a shorter date range.`;
  }
  return null;
}

export function csvRowProblem(rows: number): string | null {
  if (!Number.isFinite(rows) || rows < 0) return 'That CSV could not be read.';
  if (rows > MAX_CSV_ROWS) {
    return `That CSV has more than ${MAX_CSV_ROWS.toLocaleString('en-GB')} transactions. Export a shorter date range.`;
  }
  return null;
}

export function backupFileProblem(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes < 0) return 'That backup could not be read.';
  if (bytes === 0) return 'That backup is empty.';
  if (bytes > MAX_BACKUP_BYTES) {
    return `That backup is larger than ${MAX_BACKUP_BYTES / MB} MB and cannot be restored safely.`;
  }
  return null;
}

/**
 * Count data rows without parsing CSV quoting. It is a safety cap, so counting
 * physical lines (and therefore over-counting multi-line quoted fields) is the
 * conservative choice.
 */
export function countCsvRows(text: string): number {
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines += 1;
  }
  if (text.length > 0 && !text.endsWith('\n')) lines += 1;
  return Math.max(0, lines - 1);
}
