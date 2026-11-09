import { useEffect, useRef, useState } from 'react';
import { canonicalJson, type ConflictExport, type ConflictSummary } from '../../core/sync-client';
import { authClient } from './auth';
import { CloudSyncEngine, type SyncStatus } from './sync';
import type { AppState } from './store';

const IDLE: SyncStatus = { phase: 'idle', pending: 0, conflicts: 0 };

export interface CloudSyncView extends SyncStatus {
  enabled: boolean;
  flush: (state: AppState) => void;
  syncNow: () => Promise<void>;
  conflictList: ConflictSummary[];
  resolveConflict: (id: string, choice: 'local' | 'remote') => void;
  exportConflict: (id: string) => ConflictExport | null;
}

/**
 * Owns the engine lifecycle. Local mode passes enabled=false and never creates
 * an engine, so it cannot read, write or transmit cloud sync keys.
 */
export function useCloudSync(options: {
  enabled: boolean;
  userId: string;
  state: AppState;
  onRemoteState: (state: AppState) => void;
  onRestoreLocal: (state: AppState) => void;
}): CloudSyncView {
  const { enabled, userId, state, onRemoteState, onRestoreLocal } = options;
  const active = enabled && Boolean(authClient);
  const [status, setStatus] = useState<SyncStatus>(IDLE);
  const [conflictList, setConflictList] = useState<ConflictSummary[]>([]);
  const [ready, setReady] = useState(false);
  const engineRef = useRef<CloudSyncEngine | null>(null);
  const awaitingRemoteRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const remoteHandlerRef = useRef(onRemoteState);
  const restoreHandlerRef = useRef(onRestoreLocal);
  stateRef.current = state;
  remoteHandlerRef.current = onRemoteState;
  restoreHandlerRef.current = onRestoreLocal;

  useEffect(() => {
    if (!active || !authClient) {
      setReady(false);
      setStatus(IDLE);
      return;
    }

    let disposed = false;
    awaitingRemoteRef.current = null;
    const engine = new CloudSyncEngine(userId, authClient, (remote) => {
      awaitingRemoteRef.current = canonicalJson(remote);
      remoteHandlerRef.current(remote);
    });
    engineRef.current = engine;
    const unsubscribe = engine.subscribe((next) => {
      setStatus(next);
      setConflictList(engine.getConflictSummaries());
    });
    setReady(false);
    setStatus(engine.getStatus());
    setConflictList(engine.getConflictSummaries());

    void engine.initialize(stateRef.current).then(() => {
      if (disposed) return;
      setReady(true);
      setStatus(engine.getStatus());
    });

    return () => {
      disposed = true;
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
      awaitingRemoteRef.current = null;
      setReady(false);
      setStatus(IDLE);
      setConflictList([]);
    };
  }, [active, userId]);

  useEffect(() => {
    if (!active) return;
    const wake = () => engineRef.current?.wake();
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !ready) return;
    const engine = engineRef.current;
    if (!engine) return;

    // A remote state was applied during this render cycle. Do not enqueue the
    // previous local state back into the outbox while React renders it.
    if (awaitingRemoteRef.current) {
      if (canonicalJson(state) === awaitingRemoteRef.current) awaitingRemoteRef.current = null;
      return;
    }

    engine.setLocalState(state);
  }, [active, ready, state]);

  return {
    ...status,
    enabled: active,
    flush: (nextState) => { engineRef.current?.flush(nextState); },
    syncNow: async () => { await engineRef.current?.syncNow(); },
    conflictList,
    resolveConflict: (id, choice) => {
      const restored = engineRef.current?.resolveConflict(id, choice);
      setConflictList(engineRef.current?.getConflictSummaries() ?? []);
      if (restored) restoreHandlerRef.current?.(restored);
    },
    exportConflict: (id) => engineRef.current?.exportConflict(id) ?? null,
  };
}
