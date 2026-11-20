/**
 * R17: the Supabase Storage adapter for encrypted backups.
 *
 * The bucket is private and its policies only allow an authenticated user whose
 * `auth.uid()` equals the first path segment, so every object lives under
 * `<user-id>/financehub-backup-<timestamp>.json`. The storage client is injected
 * rather than imported, which keeps this file pure and lets the tests prove the
 * path scoping, the signed-out refusal and the retention rule with no network.
 */
import { type BackupStorageAdapter, type StoredBackup, isBackupName } from './backupUpload.ts';

/** Created privately in Supabase on 2026-11-20; see db/migrations/postgres/0004. */
export const BACKUP_BUCKET = 'financehub-backups';

export interface CloudBucketClient {
  upload(path: string, body: string, options?: { upsert?: boolean; contentType?: string }): Promise<void>;
  list(folder: string): Promise<{ name: string; bytes?: number; uploadedAt?: string }[]>;
  download(path: string): Promise<string>;
  remove(path: string): Promise<void>;
}

/**
 * The bucket policy compares the first path segment with `auth.uid()`, so an
 * empty or traversing value must be refused here rather than sent to the server.
 */
export function requireUserId(userId: string | null | undefined): string {
  const value = String(userId ?? '').trim();
  if (!value || value.includes('/') || value.includes('\\') || value.includes('..') || value.length > 64) {
    throw new Error('Sign in to your cloud account to use cloud backups.');
  }
  return value;
}

export function cloudBackupPath(userId: string, name: string): string {
  if (!isBackupName(name)) throw new Error('Not a FinanceHub backup name.');
  return `${requireUserId(userId)}/${name}`;
}

export function cloudBackupAdapter(
  client: CloudBucketClient,
  userId: string | null | undefined,
): BackupStorageAdapter {
  const folder = requireUserId(userId);
  return {
    async put(name, body) {
      await client.upload(cloudBackupPath(folder, name), body, { upsert: true, contentType: 'application/json' });
    },
    async list(): Promise<StoredBackup[]> {
      const entries = await client.list(folder);
      return entries
        .filter((entry) => isBackupName(entry.name))
        .map((entry) => ({ name: entry.name, bytes: entry.bytes ?? 0, uploadedAt: entry.uploadedAt }));
    },
    async get(name) {
      if (!isBackupName(name)) return null;
      return client.download(cloudBackupPath(folder, name));
    },
    async remove(name) {
      if (!isBackupName(name)) return;
      await client.remove(cloudBackupPath(folder, name));
    },
  };
}
