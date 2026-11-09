export const MAX_RESTORE_POINTS = 7;

/** Keep the newest seven restore points, newest first. */
export function pruneRestorePoints<T extends { createdAt: string }>(points: readonly T[]): T[] {
  return [...points]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_RESTORE_POINTS);
}
