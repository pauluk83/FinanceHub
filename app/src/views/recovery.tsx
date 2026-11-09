import { useRef, useState } from 'react';
import { decodeBackupDataset } from '../backup';
import { download, todayIso } from '../format';
import { readStoredStateRaw, saveState, seedState } from '../store';

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export function BlockedStatePage({
  userId,
  isLocal,
  message,
  onSignOut,
}: {
  userId: string;
  isLocal: boolean;
  message: string | null;
  onSignOut: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const downloadDamaged = () => {
    const raw = readStoredStateRaw(userId);
    if (!raw) {
      setError('No saved document is available to download.');
      return false;
    }
    download(`financehub-damaged-${todayIso()}.json`, raw, 'application/json');
    return true;
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BACKUP_BYTES) {
      setError('That backup is too large to restore safely.');
      return;
    }

    let text = '';
    try {
      text = await file.text();
    } catch {
      setError('That backup could not be read.');
      return;
    }

    const restored = decodeBackupDataset(text);
    if (!restored) {
      setError('That file is not a valid FinanceHub backup.');
      return;
    }

    if (!confirm('Restore this backup? It will replace the unreadable saved document.\n\nThe unreadable document will download first as a safety copy.')) {
      return;
    }

    setWorking(true);
    downloadDamaged();
    const next = seedState();
    next.dataset = restored;
    const result = saveState(next, userId);
    if (!result.ok) {
      setWorking(false);
      setError(`The backup could not be saved. ${result.message ?? 'Device storage is unavailable.'}`);
      return;
    }
    window.location.reload();
  };

  const startFromWorkbook = () => {
    if (!confirm('Start from the built-in workbook data? This replaces the unreadable saved document. The unreadable document will download first as a safety copy.')) {
      return;
    }

    setError(null);
    setWorking(true);
    downloadDamaged();
    const result = saveState(seedState(), userId);
    if (!result.ok) {
      setWorking(false);
      setError(`The recovery state could not be saved. ${result.message ?? 'Device storage is unavailable.'}`);
      return;
    }
    window.location.reload();
  };

  return (
    <div className="auth-shell" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <main className="auth-card-wrap">
        <div className="auth-card" style={{ width: 'min(620px, 100%)' }}>
          <div className="auth-card-head">
            <span className="auth-kicker" style={{ color: 'var(--danger)' }}>Recovery required</span>
            <h2>FinanceHub could not read your saved budget</h2>
            <p>
              Editing and saving are disabled. The unreadable document has not been overwritten.
              {isLocal ? ' This is the local-only workspace on this device.' : ' This is the cached workspace for your account.'}
            </p>
          </div>

          <div className="auth-alert auth-error" role="alert">
            <strong>No data was reset or replaced.</strong>
            <span>{message ?? 'The saved document could not be read. Restore a backup or download the damaged document before making any changes.'}</span>
          </div>

          {error && <div className="auth-alert auth-error" role="alert">{error}</div>}

          <div className="auth-local" style={{ display: 'grid', gap: 10 }}>
            <button
              type="button"
              className="btn primary auth-submit"
              disabled={working}
              onClick={() => fileInput.current?.click()}
            >
              Restore a FinanceHub backup
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void restore(file);
              }}
            />
            <button type="button" className="btn auth-submit" disabled={working} onClick={downloadDamaged}>
              Download the damaged document
            </button>
            <button type="button" className="btn ghost auth-submit" disabled={working} onClick={startFromWorkbook}>
              Start from the built-in workbook
            </button>
            <p>
              A backup restore replaces the saved budget. The damaged document downloads first, so it can be inspected or sent for support.
            </p>
          </div>

          <div className="auth-switch">
            <button type="button" className="auth-link" onClick={onSignOut}>
              {isLocal ? 'Use an account instead' : 'Sign out'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
