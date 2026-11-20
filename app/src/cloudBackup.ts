/**
 * Live wiring for R17: the browser Supabase client as a backup bucket.
 *
 * The session comes from `authClient`, which already stores it in the secure
 * store on desktop and in the browser on the web build. No service-role key is
 * ever used: the bucket policies authorise the user's own JWT.
 */
import { authClient } from './auth';
import { BACKUP_BUCKET, cloudBackupAdapter, type CloudBucketClient } from '../../core/cloudBackup';
import type { BackupStorageAdapter } from '../../core/backupUpload';

/** False when the build has no Supabase URL or publishable key. */
export const cloudBackupConfigured = Boolean(authClient);

function message(error: { message?: string } | null | undefined, fallback: string): string {
  const detail = error?.message?.trim();
  return detail ? `${fallback}: ${detail}` : fallback;
}

/** Builds the adapter for the signed-in user, or throws a readable sign-in error. */
export async function cloudBackupAdapterForCurrentUser(): Promise<BackupStorageAdapter> {
  if (!authClient) throw new Error('Cloud backups are not configured in this build.');
  const { data, error } = await authClient.auth.getSession();
  if (error) throw new Error(message(error, 'The cloud session could not be read'));
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('Sign in to your cloud account to use cloud backups.');

  const storage = authClient.storage.from(BACKUP_BUCKET);
  const client: CloudBucketClient = {
    async upload(path, body, options) {
      const { error: uploadError } = await storage.upload(path, body, {
        upsert: options?.upsert ?? false,
        contentType: options?.contentType ?? 'application/json',
      });
      if (uploadError) throw new Error(message(uploadError, 'The backup could not be uploaded'));
    },
    async list(folder) {
      const { data: entries, error: listError } = await storage.list(folder, {
        limit: 100,
        sortBy: { column: 'name', order: 'desc' },
      });
      if (listError) throw new Error(message(listError, 'The cloud backup list could not be read'));
      return (entries ?? []).map((entry) => ({
        name: entry.name,
        bytes: typeof entry.metadata?.size === 'number' ? entry.metadata.size : undefined,
        uploadedAt: entry.updated_at ?? undefined,
      }));
    },
    async download(path) {
      const { data: blob, error: downloadError } = await storage.download(path);
      if (downloadError) throw new Error(message(downloadError, 'The cloud backup could not be read'));
      return blob instanceof Blob ? blob.text() : String(blob ?? '');
    },
    async remove(path) {
      const { error: removeError } = await storage.remove([path]);
      if (removeError) throw new Error(message(removeError, 'The cloud backup could not be removed'));
    },
  };

  return cloudBackupAdapter(client, userId);
}
