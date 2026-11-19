/**
 * R17 upload half: encrypted backups in a remote store, adapter-first.
 *
 * Only the format-v2 envelope is accepted, so a plaintext budget can never be
 * uploaded by mistake. The storage itself is an interface: the live Supabase
 * bucket arrives in step 8, and tests use the in-memory adapter, which proves
 * the round-trip, the naming and the retention rule before any credential
 * exists. Nothing here talks to the network.
 */
export const BACKUP_RETENTION = 7;
const BACKUP_FORMAT = 'financehub-backup-v2';
const BACKUP_NAME = /^financehub-backup-[\dT-]+Z\.json$/;

export interface StoredBackup {
  name: string;
  bytes: number;
  uploadedAt?: string;
}

export interface BackupStorageAdapter {
  put(name: string, body: string): Promise<void>;
  list(): Promise<StoredBackup[]>;
  get(name: string): Promise<string | null>;
  remove(name: string): Promise<void>;
}

export interface UploadResult {
  name: string;
  kept: number;
  removed: string[];
}

interface EncryptedEnvelope {
  format: string;
  version: number;
  createdAt?: string;
  payload: string;
  checksum: string;
  cipher?: { name?: string; iv?: string };
  kdf?: { name?: string; salt?: string; iterations?: number };
}

function isEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if (entry.format !== BACKUP_FORMAT) return false;
  if (entry.version !== 2) return false;
  if (typeof entry.payload !== 'string' || entry.payload.length < 16) return false;
  if (typeof entry.checksum !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.checksum)) return false;
  // A budget field means this is not an encrypted envelope at all.
  for (const forbidden of ['transactions', 'accounts', 'settings', 'bills', 'providers']) {
    if (forbidden in entry) return false;
  }
  return true;
}

/** ISO timestamps become a filename that sorts chronologically as text. */
export function backupName(at: string): string {
  const stamp = at.replace(/[:.]/g, '-');
  return `financehub-backup-${stamp}.json`;
}

export function isBackupName(name: string): boolean {
  return BACKUP_NAME.test(name);
}

export async function uploadEncryptedBackup(
  adapter: BackupStorageAdapter,
  envelope: unknown,
  options: { at?: string; keep?: number } = {},
): Promise<UploadResult> {
  if (!isEnvelope(envelope)) {
    throw new Error('Only an encrypted FinanceHub backup (format v2) can be uploaded.');
  }
  const body = JSON.stringify(envelope);
  const at = options.at ?? envelope.createdAt ?? new Date().toISOString();
  const name = backupName(at);
  await adapter.put(name, body);

  const keep = Math.max(1, options.keep ?? BACKUP_RETENTION);
  const stored = (await adapter.list())
    .filter((entry) => isBackupName(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  const removed: string[] = [];
  for (const entry of stored.slice(keep)) {
    await adapter.remove(entry.name);
    removed.push(entry.name);
  }
  return { name, kept: Math.min(stored.length, keep), removed };
}

/** Newest first, ignoring anything that is not a FinanceHub backup. */
export async function listEncryptedBackups(adapter: BackupStorageAdapter): Promise<StoredBackup[]> {
  return (await adapter.list())
    .filter((entry) => isBackupName(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function readEncryptedBackup(adapter: BackupStorageAdapter, name: string): Promise<string | null> {
  if (!isBackupName(name)) return null;
  return adapter.get(name);
}

/** In-memory adapter: tests and a development preview, never production storage. */
export function memoryBackupAdapter(seed: Record<string, string> = {}): BackupStorageAdapter {
  const store = new Map<string, { body: string; at: string }>();
  for (const [name, body] of Object.entries(seed)) store.set(name, { body, at: new Date().toISOString() });
  return {
    async put(name, body) {
      if (!isBackupName(name)) throw new Error('Not a FinanceHub backup name.');
      store.set(name, { body, at: new Date().toISOString() });
    },
    async list() {
      return [...store.entries()].map(([name, entry]) => ({ name, bytes: entry.body.length, uploadedAt: entry.at }));
    },
    async get(name) {
      return store.get(name)?.body ?? null;
    },
    async remove(name) {
      store.delete(name);
    },
  };
}
