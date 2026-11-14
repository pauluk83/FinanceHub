import { useEffect, useState } from 'react';
import { APP_CHANGELOG } from '../appChangelog.generated';
import { APP_VERSION } from '../version';
import { installerDownloadUrl } from '../installer';
import {
  formatBytes,
  formatEta,
  formatSpeed,
  updatePercent,
  type DesktopUpdateState,
} from '../update';

type PanelActions = {
  onDownload: () => void;
  onCancel: () => void;
  onInstall: () => void;
  onLater: () => void;
  onRetry: () => void;
};

function Progress({ state }: { state: DesktopUpdateState }) {
  const percent = updatePercent(state);
  return (
    <div
      className="update-progress"
      role="progressbar"
      aria-label="Update download progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function Stats({ state }: { state: DesktopUpdateState }) {
  return (
    <div className="update-stats">
      <div>
        <span>Download</span>
        <strong>{formatBytes(state.downloadBytes)}</strong>
      </div>
      <div>
        <span>Full build</span>
        <strong>{formatBytes(state.totalBytes)}</strong>
      </div>
      <div>
        <span>Reused locally</span>
        <strong>{formatBytes(state.reusedBytes)}</strong>
      </div>
      <div>
        <span>Changed blocks</span>
        <strong>{state.changedBlocks ?? 0} / {state.totalBlocks ?? 0}</strong>
      </div>
    </div>
  );
}

/** Presentational dialog, exported so the render-level test can exercise it. */
export function UpdatePanel({ state, ...actions }: { state: DesktopUpdateState } & PanelActions) {
  const phase = state.phase;
  const version = state.version ?? APP_VERSION;
  const fullInstaller = Boolean(state.requiresFullInstaller);
  const progress = updatePercent(state);

  return (
    <div className="update-backdrop">
      <section className="update-card" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div className="update-head">
          <div className="brand-mark">FH</div>
          <div>
            <div className="update-eyebrow">FinanceHub update</div>
            <h2 id="update-title">
              {phase === 'ready' ? 'Ready to restart' : phase === 'installing' ? 'Installing update' : `Version ${version} is available`}
            </h2>
            <div className="muted small">
              Installed: v{state.currentVersion ?? APP_VERSION} · build {state.currentBuildId ?? APP_CHANGELOG.buildId}
              {' '}→ Latest: v{version} · build {state.buildId ?? '—'}
            </div>
          </div>
        </div>

        {phase === 'available' && (
          <>
            <p className="update-copy">
              {fullInstaller
                ? 'This release also changes the Electron runtime, so it needs the full installer. Your budget stays on this device.'
                : 'Only the parts of the app that changed will be downloaded. Your budget, settings and local data stay where they are.'}
            </p>
            {!fullInstaller && <Stats state={state} />}
            {!!state.notes?.length && (
              <div className="update-notes">
                <strong>What changed</strong>
                <ul>
                  {state.notes.slice(0, 6).map((note) => <li key={note}>{note}</li>)}
                </ul>
              </div>
            )}
            <div className="update-actions">
              <button type="button" className="btn ghost" onClick={actions.onLater}>Later</button>
              {fullInstaller ? (
                <a className="btn primary" href={installerDownloadUrl(version)} target="_blank" rel="noreferrer">
                  Download full installer
                </a>
              ) : (
                <button type="button" className="btn primary" onClick={actions.onDownload}>Download update</button>
              )}
            </div>
            <p className="update-foot">
              {fullInstaller
                ? 'The full installer is served by GitHub Releases. The installer is unsigned, so Windows may show an unknown-publisher warning.'
                : 'The archive is checked against the release SHA-256 before it can be installed. FinanceHub is unsigned, so this verifies integrity, not publisher identity.'}
            </p>
          </>
        )}

        {phase === 'downloading' && (
          <>
            <div className="update-progress-row">
              <strong>{progress}%</strong>
              <span>{formatBytes(state.downloadedBytes)} of {formatBytes(state.downloadBytes)}</span>
            </div>
            <Progress state={state} />
            <div className="update-live">
              <div><span>Speed</span><strong>{formatSpeed(state.speedBps)}</strong></div>
              <div><span>Remaining</span><strong>{formatEta(state.etaSeconds)}</strong></div>
              <div><span>Blocks</span><strong>{state.changedBlocks ?? 0} changed</strong></div>
            </div>
            <p className="update-foot">Downloading changed blocks only. You can keep working while this runs.</p>
            <div className="update-actions">
              <button type="button" className="btn ghost" onClick={actions.onCancel}>Cancel download</button>
            </div>
          </>
        )}

        {phase === 'ready' && (
          <>
            <div className="notice info">
              <strong>Download complete and verified.</strong> FinanceHub will close, replace the app archive and reopen on v{version}.
            </div>
            <div className="update-stats">
              <div><span>Downloaded</span><strong>{formatBytes(state.downloadedBytes ?? state.downloadBytes)}</strong></div>
              <div><span>Reused locally</span><strong>{formatBytes(state.reusedBytes)}</strong></div>
              <div><span>Average speed</span><strong>{formatSpeed(state.speedBps)}</strong></div>
              <div><span>Verification</span><strong>SHA-256 passed</strong></div>
            </div>
            <p className="update-foot">Save anything you are editing before restarting. The current app archive is backed up beside the install as <code>app.asar.bak</code>.</p>
            <div className="update-actions">
              <button type="button" className="btn ghost" onClick={actions.onLater}>Restart later</button>
              <button type="button" className="btn primary" onClick={actions.onInstall}>Restart and install</button>
            </div>
          </>
        )}

        {phase === 'installing' && (
          <>
            <div className="notice info">Closing FinanceHub, applying the verified archive and reopening…</div>
            <p className="update-foot">If the window does not return, open FinanceHub again from the Start menu.</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="notice danger"><strong>Update failed.</strong> {state.error ?? 'The download could not be completed.'}</div>
            <p className="update-foot">Your current build is unchanged and your budget is safe. Check your connection and try again.</p>
            <div className="update-actions">
              <button type="button" className="btn ghost" onClick={actions.onLater}>Later</button>
              <button type="button" className="btn primary" onClick={actions.onRetry}>Retry download</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Checks once per launch and stays out of the way unless there is an update. */
export function AppUpdatePrompt() {
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const bridge = window.financeHubDesktop?.updater;

  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    const unsubscribe = bridge.onState((next) => {
      if (alive) setState(next);
    });
    bridge.check({ version: APP_VERSION, buildId: APP_CHANGELOG.buildId })
      .then((next) => { if (alive) setState(next); })
      .catch(() => { /* A launch check is best-effort and must not block the app. */ });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [bridge]);

  useEffect(() => {
    if (state?.phase === 'available') setDismissed(false);
  }, [state?.phase]);

  if (!bridge || dismissed || !state) return null;
  if (!['available', 'downloading', 'ready', 'installing', 'error'].includes(state.phase)) return null;

  const download = () => {
    setDismissed(false);
    void bridge.download().then((next) => setState(next)).catch((error: unknown) => {
      setState({ ...state, phase: 'error', error: error instanceof Error ? error.message : 'The update could not be downloaded.' });
    });
  };

  return (
    <UpdatePanel
      state={state}
      onDownload={download}
      onRetry={download}
      onCancel={() => {
        void bridge.cancel().then((next) => setState(next)).catch(() => {});
      }}
      onInstall={() => {
        void bridge.install().then((result) => {
          if (!result.ok) setState((current) => current && { ...current, phase: 'error', error: result.error ?? 'The update could not be started.' });
        }).catch((error: unknown) => {
          setState((current) => current && {
            ...current,
            phase: 'error',
            error: error instanceof Error ? error.message : 'The update could not be started.',
          });
        });
      }}
      onLater={() => setDismissed(true)}
    />
  );
}
