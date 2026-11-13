import type { EncryptedBackup } from './backupArchive';
import { readPersistedValue, writePersistedValue } from './store';
import { MAX_RESTORE_POINTS, pruneRestorePoints } from '../../core/backupRetention';

export { MAX_RESTORE_POINTS, pruneRestorePoints };

export interface RestorePointMeta {
  id: string;
  createdAt: string;
  label: string;
  bytes: number;
  automatic?: boolean;
}

interface StoredPoint extends RestorePointMeta {
  backup: EncryptedBackup;
}

const keyFor = (ownerId: string) => `financehub.restore-points.v1:${ownerId}`;
const exportKeyFor = (ownerId: string) => `financehub.last-backup-export.v1:${ownerId}`;
const autoKeyFor = (ownerId: string) => `financehub.auto-backup-key.v1:${ownerId}`;

function parsePoints(raw: string | null): StoredPoint[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is StoredPoint =>
      Boolean(entry)
      && typeof entry.id === 'string'
      && typeof entry.createdAt === 'string'
      && typeof entry.label === 'string'
      && typeof entry.bytes === 'number'
      && (entry.automatic === undefined || typeof entry.automatic === 'boolean')
      && Boolean(entry.backup),
    );
  } catch {
    return [];
  }
}

export function listRestorePoints(ownerId: string): RestorePointMeta[] {
  return parsePoints(readPersistedValue(keyFor(ownerId))).map(({ backup: _backup, ...meta }) => meta);
}

export function readRestorePoint(ownerId: string, id: string): EncryptedBackup | null {
  return parsePoints(readPersistedValue(keyFor(ownerId))).find((entry) => entry.id === id)?.backup ?? null;
}

export function saveRestorePoint(ownerId: string, backup: EncryptedBackup, label: string, automatic = false): RestorePointMeta | null {
  const points = parsePoints(readPersistedValue(keyFor(ownerId)));
  const point: StoredPoint = {
    id: `restore_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: backup.createdAt,
    label: label.trim().slice(0, 80) || 'Manual restore point',
    bytes: JSON.stringify(backup).length,
    automatic,
    backup,
  };
  const next = pruneRestorePoints([point, ...points]);
  return writePersistedValue(keyFor(ownerId), JSON.stringify(next)) ? point : null;
}

export function removeRestorePoint(ownerId: string, id: string): boolean {
  const points = parsePoints(readPersistedValue(keyFor(ownerId)));
  return writePersistedValue(keyFor(ownerId), JSON.stringify(points.filter((entry) => entry.id !== id)));
}

export function markBackupExported(ownerId: string, at = new Date().toISOString()): boolean {
  return writePersistedValue(exportKeyFor(ownerId), at);
}

export function lastBackupExportedAt(ownerId: string): string | null {
  return readPersistedValue(exportKeyFor(ownerId));
}

export function latestRestorePointAt(ownerId: string): string | null {
  return listRestorePoints(ownerId)[0]?.createdAt ?? null;
}

export function latestAutomaticRestorePointAt(ownerId: string): string | null {
  return listRestorePoints(ownerId).find((point) => point.automatic)?.createdAt ?? null;
}

/** Random device-bound passphrase for automatic restore points. */
export function autoBackupPassphrase(ownerId: string): string | null {
  const existing = readPersistedValue(autoKeyFor(ownerId));
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const next = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return writePersistedValue(autoKeyFor(ownerId), next) ? next : null;
}
