import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  canonicalJson,
  changedPaths,
  enqueueOutbox,
  makeConflict,
  maxSyncCursor,
  planSettingsSync,
  readRemoteDocument,
  retryDelay,
  summarizeConflicts,
  toStoredConflict,
  CONFLICT_LIMIT,
  CONFLICT_PAIR_BYTES,
  CONFLICT_SNAPSHOT_LIMIT,
  type ConflictExport,
  type ConflictMeta,
  type ConflictSummary,
  type RemoteDocument,
  type StoredConflict,
  type SyncMeta,
  type SyncOutboxItem,
} from '../../core/sync-client';
import {
  decodeStoredState,
  readPersistedValue,
  writePersistedValue,
  type AppState,
} from './store';

export type SyncPhase = 'idle' | 'syncing' | 'pending' | 'synced' | 'offline' | 'error' | 'conflict';

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  conflicts: number;
  lastSyncedAt?: string;
  message?: string;
}

type Listener = (status: SyncStatus) => void;

const EMPTY_META: SyncMeta = { rev: 0, cursor: 0 };
const metaKey = (userId: string) => `financehub.sync.meta.v1:${userId}`;
const outboxKey = (userId: string) => `financehub.sync.outbox.v1:${userId}`;
const conflictsKey = (userId: string) => `financehub.sync.conflicts.v1:${userId}`;
const deviceKey = (userId: string) => `financehub.sync.device.v1:${userId}`;

function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}_${cryptoApi.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readJson<T>(key: string, fallback: T): T {
  const raw = readPersistedValue(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    return writePersistedValue(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

function finite(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeMeta(value: unknown): SyncMeta {
  if (!value || typeof value !== 'object') return { ...EMPTY_META };
  const record = value as Record<string, unknown>;
  return {
    rev: Math.max(0, Math.floor(finite(record.rev))),
    cursor: Math.max(0, finite(record.cursor)),
    ...(typeof record.lastSyncedAt === 'string' ? { lastSyncedAt: record.lastSyncedAt } : {}),
  };
}

function normalizeOutbox(value: unknown): SyncOutboxItem<AppState>[] {
  if (!Array.isArray(value)) return [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const state = decodeStoredState(record.state);
    if (!state || typeof record.opId !== 'string' || typeof record.recordId !== 'string' || typeof record.deviceId !== 'string') continue;
    return [{
      opId: record.opId,
      entity: 'settings',
      recordId: record.recordId,
      baseRev: Math.max(0, Math.floor(finite(record.baseRev))),
      deviceId: record.deviceId,
      state,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
      attempts: Math.max(0, Math.floor(finite(record.attempts))),
      ...(typeof record.nextAttemptAt === 'string' ? { nextAttemptAt: record.nextAttemptAt } : {}),
      ...(typeof record.lastError === 'string' ? { lastError: record.lastError } : {}),
    }];
  }
  return [];
}

function normalizeConflicts(value: unknown): StoredConflict<AppState>[] {
  if (!Array.isArray(value)) return [];
  const out: StoredConflict<AppState>[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.recordId !== 'string') continue;

    const localRaw = record.local;
    const remoteRaw = record.remote;
    const localState = decodeStoredState(
      localRaw && typeof localRaw === 'object' && 'state' in (localRaw as Record<string, unknown>)
        ? (localRaw as Record<string, unknown>).state
        : localRaw,
    );
    const remoteState = decodeStoredState(
      remoteRaw && typeof remoteRaw === 'object' && 'state' in (remoteRaw as Record<string, unknown>)
        ? (remoteRaw as Record<string, unknown>).state
        : remoteRaw,
    );
    if (!localState && !remoteState) continue;

    const localRecord = localRaw as Record<string, unknown> | undefined;
    const remoteRecord = remoteRaw as Record<string, unknown> | undefined;
    const meta: ConflictMeta = {
      id: record.id,
      entity: typeof record.entity === 'string' ? record.entity : 'settings',
      recordId: record.recordId,
      detectedAt: typeof record.detectedAt === 'string' ? record.detectedAt : new Date(0).toISOString(),
      localRev: Math.max(0, Math.floor(finite(record.localRev ?? localRecord?.rev))),
      remoteRev: Math.max(0, Math.floor(finite(record.remoteRev ?? remoteRecord?.rev))),
      localUpdatedAt: typeof record.localUpdatedAt === 'string'
        ? record.localUpdatedAt
        : (typeof localRecord?.updatedAt === 'string' ? localRecord.updatedAt : ''),
      remoteUpdatedAt: typeof record.remoteUpdatedAt === 'string'
        ? record.remoteUpdatedAt
        : (typeof remoteRecord?.updatedAt === 'string' ? remoteRecord.updatedAt : ''),
      localBytes: Math.max(0, Math.floor(finite(record.localBytes, localState ? JSON.stringify(localState).length : 0))),
      remoteBytes: Math.max(0, Math.floor(finite(record.remoteBytes, remoteState ? JSON.stringify(remoteState).length : 0))),
      changedPaths: Array.isArray(record.changedPaths) && record.changedPaths.every((path) => typeof path === 'string')
        ? record.changedPaths as string[]
        : changedPaths(localState, remoteState),
    };
    out.push({
      ...meta,
      ...(localState ? { local: localState } : {}),
      ...(remoteState ? { remote: remoteState } : {}),
    });
  }
  return out.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, CONFLICT_LIMIT);
}

function normalizeDeviceId(userId: string): string {
  const existing = readPersistedValue(deviceKey(userId));
  if (existing) return existing;
  const next = randomId('device');
  writePersistedValue(deviceKey(userId), next);
  return next;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'Sync failed.';
}

/**
 * Cloud-only sync engine. It is constructed only for an authenticated cloud
 * workspace; local mode never creates it and never reads/writes sync keys.
 */
export class CloudSyncEngine {
  private readonly client: SupabaseClient;
  private readonly userId: string;
  private readonly deviceId: string;
  private readonly onRemote: (state: AppState) => void;
  private readonly listeners = new Set<Listener>();

  private meta: SyncMeta = { ...EMPTY_META };
  private outbox: SyncOutboxItem<AppState>[] = [];
  private conflicts: StoredConflict<AppState>[] = [];
  private storageError: string | undefined;
  private localState: AppState | null = null;
  private lastRemoteSignature: string | null = null;

  private phase: SyncPhase = 'idle';
  private message: string | undefined;
  private ready = false;
  private stopped = false;
  private syncing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private channel: RealtimeChannel | null = null;
  private wakeQueued = false;

  constructor(userId: string, client: SupabaseClient, onRemote: (state: AppState) => void) {
    this.userId = userId;
    this.client = client;
    this.onRemote = onRemote;
    this.deviceId = normalizeDeviceId(userId);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return {
      phase: this.phase,
      pending: this.outbox.length,
      conflicts: this.conflicts.length,
      ...(this.lastSyncedAt() ? { lastSyncedAt: this.lastSyncedAt() } : {}),
      ...(this.message || this.storageError ? { message: this.message ?? this.storageError } : {}),
    };
  }

  async initialize(localState: AppState): Promise<void> {
    this.localState = localState;
    this.load();
    this.phase = this.outbox.length ? 'pending' : 'idle';
    this.emit();

    let pullSucceeded = false;
    let conflicted = false;
    try {
      conflicted = await this.pull();
      pullSucceeded = true;
    } catch (error) {
      this.fail(error);
    }

    this.ready = true;
    this.attachRealtime();
    if (pullSucceeded && this.outbox.length) this.schedule(0);
    else if (pullSucceeded && !conflicted) {
      this.phase = this.meta.lastSyncedAt ? 'synced' : 'idle';
      this.emit();
    }
  }

  /**
   * Called for every local state change. The first edit creates one outbox
   * operation; subsequent edits update that operation so the queue stays small.
   */
  setLocalState(localState: AppState): void {
    this.localState = localState;
    if (!this.ready || this.stopped) return;

    const signature = canonicalJson(localState);
    if (this.lastRemoteSignature === signature) return;

    const next = enqueueOutbox({
      items: this.outbox,
      state: localState,
      recordId: this.userId,
      deviceId: this.deviceId,
      baseRev: this.meta.rev,
    });
    if (next === this.outbox) return;

    this.outbox = next;
    this.saveOutbox();
    this.phase = 'pending';
    this.message = undefined;
    this.emit();
    this.schedule(500);
  }

  wake(): void {
    if (this.ready && !this.stopped) this.schedule(0);
  }

  /** Persist the latest state to the outbox and try to push it immediately. */
  flush(localState: AppState): void {
    this.setLocalState(localState);
    if (this.stopped || !this.ready) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.schedule(0);
  }

  async syncNow(): Promise<void> {
    if (!this.ready || this.stopped || this.syncing) return;
    this.syncing = true;
    this.phase = 'syncing';
    this.message = undefined;
    this.emit();

    try {
      const conflicted = await this.pull();
      if (conflicted) return;
      await this.push();
      if (this.outbox.length === 0) {
        this.phase = 'synced';
        this.emit();
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.syncing = false;
      this.emit();
      if (this.wakeQueued) {
        this.wakeQueued = false;
        this.schedule(0);
      }
    }
  }

  dispose(): void {
    this.stopped = true;
    this.detachRealtime();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.listeners.clear();
  }

  private lastSyncedAt(): string | undefined {
    return this.meta.lastSyncedAt;
  }

  /**
   * Realtime is a hint, never the source of truth: any change to this user's
   * settings row schedules a normal cursor pull, so a dropped, duplicated or
   * reordered event can only delay a sync. SUBSCRIBED fires again after a
   * reconnect, which covers the gap while the socket was down.
   */
  private attachRealtime(): void {
    if (this.channel || this.stopped) return;
    this.channel = this.client
      .channel(`financehub:settings:${this.userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${this.userId}` },
        (payload) => {
          const incoming = payload.new as { rev?: unknown } | undefined;
          const rev = finite(incoming?.rev);
          // Our own push echoes back; meta.rev already reflects it.
          if (rev > 0 && rev <= this.meta.rev) return;
          this.requestSync(300);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.requestSync(0);
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Sync realtime channel is unavailable; scheduled sync continues.');
        }
      });
  }

  private detachRealtime(): void {
    const channel = this.channel;
    if (!channel) return;
    this.channel = null;
    void this.client.removeChannel(channel);
  }

  /** A wake during an in-flight sync is replayed once that sync settles. */
  private requestSync(delay: number): void {
    if (this.stopped) return;
    if (this.syncing) {
      this.wakeQueued = true;
      return;
    }
    this.schedule(delay);
  }

  private load(): void {
    this.meta = normalizeMeta(readJson<unknown>(metaKey(this.userId), null));
    this.outbox = normalizeOutbox(readJson<unknown>(outboxKey(this.userId), null));
    this.conflicts = normalizeConflicts(readJson<unknown>(conflictsKey(this.userId), null));
  }

  private saveMeta(): void {
    if (!writeJson(metaKey(this.userId), this.meta)) {
      this.storageError = 'Sync progress could not be saved on this device.';
    } else if (this.storageError === 'Sync progress could not be saved on this device.') {
      this.storageError = undefined;
    }
  }

  private saveOutbox(): void {
    if (!writeJson(outboxKey(this.userId), this.outbox)) {
      this.storageError = 'Pending changes could not be queued on this device.';
    } else if (this.storageError === 'Pending changes could not be queued on this device.') {
      this.storageError = undefined;
    }
  }

  private saveConflicts(): void {
    if (!writeJson(conflictsKey(this.userId), this.conflicts)) {
      this.storageError = 'Sync conflicts could not be saved on this device.';
    } else if (this.storageError === 'Sync conflicts could not be saved on this device.') {
      this.storageError = undefined;
    }
  }

  private emit(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) listener(status);
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, delay);
  }

  private fail(error: unknown): void {
    const message = errorMessage(error);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    this.phase = offline ? 'offline' : 'error';
    this.message = message;

    if (this.outbox[0]) {
      const item = this.outbox[0];
      item.attempts += 1;
      item.lastError = message;
      item.nextAttemptAt = new Date(Date.now() + retryDelay(item.attempts)).toISOString();
      this.saveOutbox();
      this.schedule(retryDelay(item.attempts));
    } else {
      this.schedule(15_000);
    }
    this.emit();
  }

  private normalizeRemote(value: RemoteDocument<unknown> | null): RemoteDocument<AppState> | null {
    if (!value) return null;
    const state = decodeStoredState(value.state);
    return state ? { ...value, state } : null;
  }

  private applyRemote(remote: RemoteDocument<AppState>): void {
    const changed = !this.localState || canonicalJson(remote.state) !== canonicalJson(this.localState);
    this.meta.rev = Math.max(this.meta.rev, remote.rev);
    this.meta.lastSyncedAt = new Date().toISOString();
    this.lastRemoteSignature = canonicalJson(remote.state);
    this.localState = remote.state;
    this.saveMeta();
    if (changed) this.onRemote(remote.state);
  }

  private async pull(): Promise<boolean> {
    const { data, error } = await this.client.rpc('financehub_pull_changes', {
      p_cursor: this.meta.cursor,
    });
    if (error) throw error;

    this.meta.cursor = maxSyncCursor(data, this.meta.cursor);
    this.saveMeta();

    const remote = this.normalizeRemote(readRemoteDocument<unknown>(data));
    const plan = planSettingsSync<AppState>({
      meta: this.meta,
      pending: this.outbox[0],
      remote,
    });

    switch (plan.action) {
      case 'apply':
        this.applyRemote(plan.remote);
        this.phase = 'synced';
        this.emit();
        break;
      case 'ack':
        this.meta.rev = Math.max(this.meta.rev, plan.remote.rev);
        this.meta.lastSyncedAt = new Date().toISOString();
        this.lastRemoteSignature = canonicalJson(plan.remote.state);
        this.localState = plan.remote.state;
        this.outbox = [];
        this.saveMeta();
        this.saveOutbox();
        this.phase = 'synced';
        this.emit();
        break;
      case 'conflict':
        this.recordConflict(plan.pending, plan.remote);
        this.applyRemote(plan.remote);
        this.outbox = [];
        this.saveOutbox();
        this.phase = 'conflict';
        this.message = 'Both versions were kept; the newer server version is shown.';
        this.emit();
        return true;
      case 'push':
      case 'none':
        break;
    }
    return false;
  }

  private async push(): Promise<void> {
    const item = this.outbox[0];
    if (!item) return;

    const { data, error } = await this.client.rpc('financehub_push_state', {
      p_base_rev: item.baseRev,
      p_state: item.state,
      p_device_id: this.deviceId,
      p_op_id: item.opId,
    });
    if (error) throw error;

    const status = data && typeof data === 'object' ? (data as Record<string, unknown>).status : null;
    if (status === 'applied' || status === 'duplicate') {
      const response = data as Record<string, unknown>;
      this.meta.rev = Math.max(this.meta.rev, Math.floor(finite(response.rev, item.baseRev)));
      this.meta.cursor = Math.max(this.meta.cursor, finite(response.sync_seq));
      this.meta.lastSyncedAt = new Date().toISOString();
      this.lastRemoteSignature = canonicalJson(item.state);
      this.localState = item.state;
      this.outbox = [];
      this.saveMeta();
      this.saveOutbox();
      this.phase = 'synced';
      this.emit();
      return;
    }

    if (status === 'conflict') {
      const response = data as Record<string, unknown>;
      const remote = this.normalizeRemote({
        rev: finite(response.rev),
        syncSeq: finite(response.sync_seq),
        updatedAt: typeof response.updated_at === 'string' ? response.updated_at : new Date().toISOString(),
        state: response.state,
      });
      if (remote) {
        this.recordConflict(item, remote);
        this.applyRemote(remote);
        this.meta.cursor = Math.max(this.meta.cursor, finite(response.sync_seq));
        this.saveMeta();
        this.outbox = [];
        this.saveOutbox();
        this.phase = 'conflict';
        this.message = 'Both versions were kept; the newer server version is shown.';
        this.emit();
        return;
      }
    }

    throw new Error('The server returned an unexpected sync response.');
  }

  /** Read-only summaries for the Settings conflict panel. */
  getConflictSummaries(): ConflictSummary[] {
    return summarizeConflicts(this.conflicts);
  }

  /** Both versions as JSON text, or null when the conflict is already gone. */
  exportConflict(id: string): ConflictExport | null {
    const entry = this.conflicts.find((conflict) => conflict.id === id);
    if (!entry) return null;
    const { local, remote, ...meta } = entry;
    return {
      meta,
      ...(local !== undefined ? { local: JSON.stringify(local, null, 2) } : {}),
      ...(remote !== undefined ? { remote: JSON.stringify(remote, null, 2) } : {}),
    };
  }

  /**
   * Resolve one conflict. Remote is already shown after a conflict, so `remote`
   * only dismisses it. `local` returns the stored local document for the caller
   * to put back into React state; that edit is then queued against the server
   * revision and pushed normally.
   */
  resolveConflict(id: string, choice: 'local' | 'remote'): AppState | null {
    const entry = this.conflicts.find((conflict) => conflict.id === id);
    if (!entry) return null;
    if (choice === 'local' && entry.local === undefined) return null;
    this.conflicts = this.conflicts.filter((conflict) => conflict.id !== id);
    this.saveConflicts();
    this.message = this.conflicts.length ? 'Both versions were kept; the newer server version is shown.' : undefined;
    if (choice === 'local') {
      this.outbox = [];
      this.saveOutbox();
      this.lastRemoteSignature = null;
      this.phase = 'pending';
      this.emit();
      return entry.local ?? null;
    }
    this.phase = this.conflicts.length ? 'conflict' : (this.outbox.length ? 'pending' : 'synced');
    this.emit();
    return null;
  }

  private recordConflict(pending: SyncOutboxItem<AppState>, remote: RemoteDocument<AppState>): void {
    const conflict = makeConflict(pending, remote);
    if (this.conflicts.some((entry) => entry.id === conflict.id)) return;

    const stored = toStoredConflict(conflict, true);
    const next = [stored, ...this.conflicts]
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
      .slice(0, CONFLICT_LIMIT);
    let snapshots = 0;
    this.conflicts = next.map((entry) => {
      if (entry.local === undefined || entry.remote === undefined) return entry;
      if (snapshots < CONFLICT_SNAPSHOT_LIMIT && entry.localBytes + entry.remoteBytes <= CONFLICT_PAIR_BYTES) {
        snapshots += 1;
        return entry;
      }
      return { ...entry, local: undefined, remote: undefined };
    });
    this.saveConflicts();

    void this.client.from('sync_conflicts').insert({
      user_id: this.userId,
      entity: conflict.entity,
      record_id: conflict.recordId,
      local_json: { rev: conflict.local.rev, updatedAt: conflict.local.updatedAt, changedPaths: stored.changedPaths },
      remote_json: { rev: conflict.remote.rev, updatedAt: conflict.remote.updatedAt, changedPaths: stored.changedPaths },
      local_rev: conflict.local.rev,
      remote_rev: conflict.remote.rev,
      detected_at: conflict.detectedAt,
    }).then(({ error }) => {
      if (error) console.warn('Could not archive sync conflict on the server:', error.message);
    });
  }
}
