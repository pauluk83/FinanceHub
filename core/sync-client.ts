export interface SyncOutboxItem<T> {
  opId: string;
  entity: 'settings';
  recordId: string;
  baseRev: number;
  deviceId: string;
  state: T;
  createdAt: string;
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
}

export interface SyncMeta {
  rev: number;
  cursor: number;
  lastSyncedAt?: string;
}

export interface RemoteDocument<T> {
  rev: number;
  syncSeq: number;
  updatedAt: string;
  state: T;
}

export interface ConflictRecord<T> {
  id: string;
  entity: string;
  recordId: string;
  local: { rev: number; updatedAt: string; deviceId: string; state: T };
  remote: { rev: number; updatedAt: string; deviceId: string; state: T };
  detectedAt: string;
}

export type SettingsSyncPlan<T> =
  | { action: 'none' }
  | { action: 'push' }
  | { action: 'ack'; remote: RemoteDocument<T> }
  | { action: 'apply'; remote: RemoteDocument<T> }
  | { action: 'conflict'; pending: SyncOutboxItem<T>; remote: RemoteDocument<T> };

/**
 * Stable JSON is used for equality checks. Server JSONB can return keys in a
 * different order from the browser object, so plain JSON.stringify is unsafe.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

/** Keys that must never carry a plaintext value into a cloud document. */
const CREDENTIAL_KEY = /(?:passwords?|passphrases?|secrets?|credentials?|accessbills?|accesstokens?|apikeys?|privatekeys?|usernames?)$/i;

function hasCredentialValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

/**
 * Find plaintext credential fields anywhere in a cloud document. The encrypted
 * vault is safe because its ciphertext/salt/iv keys do not match; its optional
 * reminder is stored as `hint`, never under a credential name.
 */
export function plaintextCredentialPaths(value: unknown, prefix = '', out: string[] = []): string[] {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => plaintextCredentialPaths(entry, `${prefix}[${index}]`, out));
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (CREDENTIAL_KEY.test(key) && hasCredentialValue(child)) out.push(path);
    plaintextCredentialPaths(child, path, out);
  }
  return out;
}

/** Fail closed before a cloud write rather than uploading a plaintext secret. */
export function assertNoPlaintextCredentials(value: unknown): void {
  const paths = plaintextCredentialPaths(value);
  if (paths.length) {
    throw new Error(`Refusing to sync plaintext credential fields: ${paths.join(', ')}`);
  }
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** The cursor is server-assigned and must only move forward. */
export function maxSyncCursor(payload: unknown, current: number): number {
  if (!payload || typeof payload !== 'object') return current;
  let cursor = finiteNumber(current);
  for (const rows of Object.values(payload as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      cursor = Math.max(cursor, finiteNumber((row as Record<string, unknown>).sync_seq));
    }
  }
  return cursor;
}

/** Read the settings document from the pull RPC response. */
export function readRemoteDocument<T = unknown>(payload: unknown): RemoteDocument<T> | null {
  if (!payload || typeof payload !== 'object') return null;
  const rows = (payload as Record<string, unknown>).settings;
  if (!Array.isArray(rows)) return null;

  let best: RemoteDocument<T> | null = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    if (record.state_json === null || record.state_json === undefined) continue;
    const rev = finiteNumber(record.rev);
    if (rev <= 0) continue;
    const candidate: RemoteDocument<T> = {
      rev,
      syncSeq: finiteNumber(record.sync_seq),
      updatedAt: typeof record.updated_at === 'string' ? record.updated_at : new Date().toISOString(),
      state: record.state_json as T,
    };
    if (!best || candidate.rev > best.rev || (candidate.rev === best.rev && candidate.syncSeq > best.syncSeq)) {
      best = candidate;
    }
  }
  return best;
}

export function enqueueOutbox<T>(options: {
  items: SyncOutboxItem<T>[];
  state: T;
  recordId: string;
  deviceId: string;
  baseRev: number;
  now?: string;
  idFactory?: () => string;
}): SyncOutboxItem<T>[] {
  const {
    items, state, recordId, deviceId, baseRev,
    now = new Date().toISOString(),
    idFactory = defaultId,
  } = options;
  assertNoPlaintextCredentials(state);
  const existing = items[0];
  if (existing && canonicalJson(existing.state) === canonicalJson(state)) return items;

  if (existing) {
    return [{
      ...existing,
      state,
      attempts: 0,
      nextAttemptAt: undefined,
      lastError: undefined,
    }];
  }

  return [{
    opId: idFactory(),
    entity: 'settings',
    recordId,
    baseRev: Math.max(0, Math.floor(finiteNumber(baseRev))),
    deviceId,
    state,
    createdAt: now,
    attempts: 0,
  }];
}

/**
 * Exponential backoff with a small jitter. A caller passes Math.random for a
 * testable delay; production callers can omit it.
 */
export function retryDelay(attempts: number, random = Math.random): number {
  const attempt = Math.max(1, Math.floor(finiteNumber(attempts, 1)));
  const base = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.max(0, Math.min(1, random())) * 250);
  return base + jitter;
}

/** Metadata retained for every conflict, even after its snapshots are trimmed. */
export interface ConflictMeta {
  id: string;
  entity: string;
  recordId: string;
  detectedAt: string;
  localRev: number;
  remoteRev: number;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  localBytes: number;
  remoteBytes: number;
  changedPaths: string[];
}

/** A conflict plus the full documents while the bounded snapshot budget allows. */
export interface StoredConflict<T> extends ConflictMeta {
  local?: T;
  remote?: T;
}

export interface ConflictSummary extends ConflictMeta {
  localAvailable: boolean;
  remoteAvailable: boolean;
}

export interface ConflictExport {
  meta: ConflictMeta;
  local?: string;
  remote?: string;
}

/** 25 conflicts fit well within quota because only two keep a full snapshot pair. */
export const CONFLICT_LIMIT = 25;
export const CONFLICT_SNAPSHOT_LIMIT = 2;
export const CONFLICT_PAIR_BYTES = 1_500_000;

function byteLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Leaf paths that differ, capped so the conflict screen stays readable. */
export function changedPaths(
  local: unknown,
  remote: unknown,
  limit = 12,
  prefix = '',
  out: string[] = [],
): string[] {
  if (out.length >= limit) return out;
  if (canonicalJson(local) === canonicalJson(remote)) return out;
  const left = local as Record<string, unknown> | null;
  const right = remote as Record<string, unknown> | null;
  const bothObjects = Boolean(left) && Boolean(right) && typeof left === 'object' && typeof right === 'object';
  if (!bothObjects || Array.isArray(left) !== Array.isArray(right)) {
    out.push(prefix || '(document)');
    return out;
  }
  const keys = [...new Set([...Object.keys(left as object), ...Object.keys(right as object)])].sort();
  for (const key of keys) {
    if (out.length >= limit) break;
    changedPaths(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      limit,
      prefix ? `${prefix}.${key}` : key,
      out,
    );
  }
  return out;
}

export function conflictMeta<T>(conflict: ConflictRecord<T>): ConflictMeta {
  return {
    id: conflict.id,
    entity: conflict.entity,
    recordId: conflict.recordId,
    detectedAt: conflict.detectedAt,
    localRev: conflict.local.rev,
    remoteRev: conflict.remote.rev,
    localUpdatedAt: conflict.local.updatedAt,
    remoteUpdatedAt: conflict.remote.updatedAt,
    localBytes: byteLength(conflict.local.state),
    remoteBytes: byteLength(conflict.remote.state),
    changedPaths: changedPaths(conflict.local.state, conflict.remote.state),
  };
}

/** Convert a conflict to storage form, optionally carrying the document states. */
export function toStoredConflict<T>(conflict: ConflictRecord<T>, includeStates: boolean): StoredConflict<T> {
  const meta = conflictMeta(conflict);
  return includeStates ? { ...meta, local: conflict.local.state, remote: conflict.remote.state } : meta;
}

/**
 * Bound the conflict queue: metadata for every conflict up to the limit, full
 * snapshots only for the newest few that fit the byte budget.
 */
export function boundConflicts<T>(
  conflicts: readonly ConflictRecord<T>[],
  options: { limit?: number; snapshots?: number; pairBytes?: number } = {},
): StoredConflict<T>[] {
  const limit = options.limit ?? CONFLICT_LIMIT;
  const snapshots = options.snapshots ?? CONFLICT_SNAPSHOT_LIMIT;
  const pairBytes = options.pairBytes ?? CONFLICT_PAIR_BYTES;
  let kept = 0;
  return [...conflicts]
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, limit)
    .map((conflict) => {
      const meta = conflictMeta(conflict);
      const fits = kept < snapshots && meta.localBytes + meta.remoteBytes <= pairBytes;
      if (!fits) return meta;
      kept += 1;
      return { ...meta, local: conflict.local.state, remote: conflict.remote.state };
    });
}

export function summarizeConflicts<T>(conflicts: readonly StoredConflict<T>[]): ConflictSummary[] {
  return conflicts.map(({ local, remote, ...meta }) => ({
    ...meta,
    localAvailable: local !== undefined,
    remoteAvailable: remote !== undefined,
  }));
}

export function makeConflict<T>(
  pending: SyncOutboxItem<T>,
  remote: RemoteDocument<T>,
  detectedAt = new Date().toISOString(),
): ConflictRecord<T> {
  return {
    id: `${pending.opId}:${remote.rev}`,
    entity: pending.entity,
    recordId: pending.recordId,
    local: {
      rev: pending.baseRev,
      updatedAt: pending.createdAt,
      deviceId: pending.deviceId,
      state: pending.state,
    },
    remote: {
      rev: remote.rev,
      updatedAt: remote.updatedAt,
      deviceId: 'server',
      state: remote.state,
    },
    detectedAt,
  };
}

/**
 * Pull before push. A pending local edit based on an older revision is never
 * silently pushed over a newer server document; both versions are retained.
 */
export function planSettingsSync<T>(input: {
  meta: SyncMeta;
  pending?: SyncOutboxItem<T>;
  remote: RemoteDocument<T> | null;
}): SettingsSyncPlan<T> {
  const { meta, pending, remote } = input;
  if (!remote) return pending ? { action: 'push' } : { action: 'none' };

  if (pending) {
    if (remote.rev > pending.baseRev) {
      return canonicalJson(pending.state) === canonicalJson(remote.state)
        ? { action: 'ack', remote }
        : { action: 'conflict', pending, remote };
    }
    return { action: 'push' };
  }

  if (remote.rev > finiteNumber(meta.rev)) return { action: 'apply', remote };
  return { action: 'none' };
}

function defaultId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
