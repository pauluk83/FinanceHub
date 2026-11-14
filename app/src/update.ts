export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error'
  | 'check-error'
  | 'unsupported';

export interface DesktopUpdateState {
  phase: DesktopUpdatePhase;
  version?: string;
  buildId?: string;
  currentVersion?: string;
  currentBuildId?: string;
  notes?: string[];
  totalBytes?: number;
  downloadBytes?: number;
  reusedBytes?: number;
  changedBlocks?: number;
  totalBlocks?: number;
  downloadedBytes?: number;
  speedBps?: number;
  etaSeconds?: number | null;
  requiresFullInstaller?: boolean;
  verified?: boolean;
  canRetry?: boolean;
  error?: string | null;
}

export interface DesktopUpdaterBridge {
  check(current: { version: string; buildId: string }): Promise<DesktopUpdateState>;
  download(): Promise<DesktopUpdateState>;
  cancel(): Promise<DesktopUpdateState>;
  install(): Promise<{ ok: boolean; error?: string }>;
  onState(callback: (state: DesktopUpdateState) => void): () => void;
}

export function formatBytes(bytes: number | undefined): string {
  if (!Number.isFinite(bytes) || (bytes ?? 0) < 0) return '0 B';
  const value = bytes ?? 0;
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function formatSpeed(bytesPerSecond: number | undefined): string {
  if (!Number.isFinite(bytesPerSecond) || (bytesPerSecond ?? 0) <= 0) return '—';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds) || seconds === null || seconds === undefined || seconds < 0) return '—';
  if (seconds < 1) return 'Finishing…';
  if (seconds < 60) return `${Math.ceil(seconds)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

export function updatePercent(state: DesktopUpdateState): number {
  const total = state.downloadBytes ?? 0;
  const done = state.downloadedBytes ?? 0;
  if (total <= 0) return state.phase === 'ready' || state.phase === 'installing' ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}
