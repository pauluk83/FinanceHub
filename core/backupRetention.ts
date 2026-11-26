/**
 * Restore-point retention.
 *
 * Automatic daily points and manual points are two separate pools: a week of
 * daily backups can never push out a point the owner created deliberately, and a
 * burst of manual points cannot erase the daily history.
 */
/** Manual restore points keep the newest seven. */
export const MAX_RESTORE_POINTS = 7;
/** Automatic daily points keep the newest 7 — a week of days, about 4 MB. */
export const MAX_AUTOMATIC_RESTORE_POINTS = 7;

interface PrunablePoint {
  createdAt: string;
  automatic?: boolean;
}

/**
 * Keep the newest manual points and the newest automatic points, newest first.
 * Pass smaller limits to shrink the automatic pool when device storage is tight.
 */
export function pruneRestorePoints<T extends PrunablePoint>(
  points: readonly T[],
  limits: { manual?: number; automatic?: number } = {},
): T[] {
  const manualLimit = Math.max(0, limits.manual ?? MAX_RESTORE_POINTS);
  const automaticLimit = Math.max(0, limits.automatic ?? MAX_AUTOMATIC_RESTORE_POINTS);
  const newestFirst = [...points].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const kept = [
    ...newestFirst.filter((point) => !point.automatic).slice(0, manualLimit),
    ...newestFirst.filter((point) => point.automatic).slice(0, automaticLimit),
  ];
  return kept.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
