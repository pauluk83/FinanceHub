/** Automatic restore points are created at most once per day. */
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * True when there is no automatic restore point, the stored timestamp cannot be
 * read, or the newest one is at least `interval` old.
 */
export function shouldCreateAutomaticBackup(
  lastAt: string | null | undefined,
  now = Date.now(),
  interval = AUTO_BACKUP_INTERVAL_MS,
): boolean {
  if (!lastAt) return true;
  const last = Date.parse(lastAt);
  if (!Number.isFinite(last)) return true;
  return now - last >= interval;
}
