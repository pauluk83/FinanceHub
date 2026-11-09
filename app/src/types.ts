import type { Dataset, Engine } from '../../core/engine';
import type { ConflictExport, ConflictSummary } from '../../core/sync-client';
import type { PortalFeedback } from './portal';
import type { EncryptedVault, UnlockedVault } from './vault';
import type { AppLockConfig } from './appLock';

export type Theme = 'dark' | 'light';
export type WorkspaceMode = 'account' | 'local' | 'demo';

export interface LocalAccountControls {
  email: string | null;
  canSync: boolean;
  onSync: () => void;
  onExit: () => void;
  onLogout: () => void;
  /** True when a device-only copy exists alongside a saved account budget. */
  canRemoveLocal: boolean;
  onRemoveLocal: () => void;
}

export interface ViewProps {
  ds: Dataset;
  engine: Engine;
  month: number;
  setMonth: (month: number) => void;
  /** The year being viewed; may differ from the configured target year. */
  year: number;
  setYear: (year: number) => void;
  availableYears: number[];
  update: (mutator: (dataset: Dataset) => void) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  notify: (message: string) => void;
  go: (view: string) => void;
  userId: string;
  userEmail: string | null;
  isLocal: boolean;
  lastSavedAt: string | null;
  lastSyncedAt: string | null;
  signOut: () => void;
  workspace: WorkspaceMode;
  chooseWorkspace: (mode: 'account' | 'local') => void;
  localAccount?: LocalAccountControls;
  vault: EncryptedVault | null;
  /** Device-only PIN lock; null when this workspace has no lock or syncs to an account. */
  appLock: AppLockConfig | null;
  setAppLock: (config: AppLockConfig | null) => void;
  lockNow: () => void;
  vaultSession: UnlockedVault | null;
  setVault: (vault: EncryptedVault | null) => void;
  setVaultSession: (session: UnlockedVault | null) => void;
  feedbackItems: PortalFeedback[];
  openFeedback: (tab?: 'send' | 'inbox') => void;
  syncConflicts: ConflictSummary[];
  resolveSyncConflict: (id: string, choice: 'local' | 'remote') => void;
  exportSyncConflict: (id: string) => ConflictExport | null;
  /** Transport state used by Data Health; local workspaces leave this undefined. */
  syncHealth?: { phase?: string; pending?: number; message?: string; lastSyncedAt?: string | null };
  /** Opens the demo workspace from guided setup. */
  onOpenDemo?: () => void;
}
