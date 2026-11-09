export interface SyncRecord<T> {
  entity: string;
  id: string;
  rev: number;
  updatedAt: string;
  deviceId: string;
  deletedAt?: string | null;
  value: T;
}

export interface SyncConflict<T> {
  entity: string;
  recordId: string;
  local: SyncRecord<T>;
  remote: SyncRecord<T>;
  detectedAt: string;
}

export interface MergeResult<T> {
  winner: SyncRecord<T>;
  conflict?: SyncConflict<T>;
}

function sameRecord<T>(a: SyncRecord<T>, b: SyncRecord<T>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Server revisions are authoritative. A higher revision wins. Equal revisions
 * with different content are never silently replaced: the local record stays
 * visible and both versions are returned for the conflict review queue.
 */
export function mergeRecord<T>(
  local: SyncRecord<T>,
  remote: SyncRecord<T>,
  detectedAt = new Date().toISOString(),
): MergeResult<T> {
  if (remote.rev > local.rev) return { winner: remote };
  if (local.rev > remote.rev) return { winner: local };
  if (sameRecord(local, remote)) return { winner: local };

  return {
    winner: local,
    conflict: {
      entity: local.entity,
      recordId: local.id,
      local,
      remote,
      detectedAt,
    },
  };
}

export function isTombstone<T>(record: SyncRecord<T>): boolean {
  return Boolean(record.deletedAt);
}

/**
 * Local-only workspaces never call the sync boundary. Cloud workspaces pull
 * before pushing so a stale local revision does not overwrite a newer server row.
 */
export function syncOrder(mode: 'local' | 'cloud'): Array<'pull' | 'push'> {
  return mode === 'cloud' ? ['pull', 'push'] : [];
}
