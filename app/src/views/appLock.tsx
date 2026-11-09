import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Badge, Section } from '../components';
import type { WorkspaceMode } from '../types';
import {
  APP_LOCK_IDLE_OPTIONS,
  APP_LOCK_MAX_PIN,
  APP_LOCK_MIN_PIN,
  createAppLock,
  lockoutMs,
  normalizeIdleMinutes,
  pinProblem,
  verifyAppLock,
  withIdleMinutes,
  type AppLockConfig,
} from '../appLock';
import { readLockAttempts, saveLockAttempts } from '../appLockStore';
import { APP_VERSION } from '../version';

function idleLabel(minutes: number): string {
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2.5A2.5 2.5 0 0 1 14.5 7v3h-5V7A2.5 2.5 0 0 1 12 4.5Zm0 9a2 2 0 0 1 1 3.73V19h-2v-1.77A2 2 0 0 1 12 13.5Z"
      />
    </svg>
  );
}

export function AppLockScreen({
  config,
  onUnlocked,
  onRemoved,
}: {
  config: AppLockConfig;
  onUnlocked: () => void;
  onRemoved: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [attempts, setAttempts] = useState(() => readLockAttempts());
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const waiting = attempts.blockedUntil - now;
  const counting = waiting > 0;

  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [counting]);

  useEffect(() => {
    if (!counting) inputRef.current?.focus();
  }, [counting]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (Date.now() < attempts.blockedUntil) return;
    const problem = pinProblem(pin);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const ok = await verifyAppLock(config, pin);
    setBusy(false);
    if (ok) {
      saveLockAttempts({ failures: 0, blockedUntil: 0 });
      setPin('');
      onUnlocked();
      return;
    }
    const failures = attempts.failures + 1;
    const next = { failures, blockedUntil: Date.now() + lockoutMs(failures) };
    saveLockAttempts(next);
    setAttempts(next);
    setNow(Date.now());
    setPin('');
    setError(
      next.blockedUntil > Date.now()
        ? `That PIN is not correct. Wait ${Math.ceil(lockoutMs(failures) / 1000)} seconds before trying again.`
        : 'That PIN is not correct.',
    );
  };

  const removeLock = () => {
    if (!window.confirm(
      'Remove the app lock and open FinanceHub?\n\n'
      + 'The budget and its data are not deleted. The lock is only a screen barrier, '
      + 'so removing it does not change or expose anything that was not already on this device.',
    )) return;
    saveLockAttempts({ failures: 0, blockedUntil: 0 });
    onRemoved();
  };

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label="FinanceHub is locked">
      <div className="lock-card">
        <div className="lock-mark"><LockIcon /></div>
        <span className="auth-kicker">Device lock</span>
        <h1>FinanceHub is locked</h1>
        <p className="lock-sub">
          {forgot
            ? 'A PIN cannot be recovered or reset from here.'
            : 'Enter the PIN set for this device to open the local workspace.'}
        </p>

        {!forgot ? (
          <form className="lock-form" onSubmit={(event) => void submit(event)} noValidate>
            <label className="auth-field">
              <span>PIN</span>
              <input
                ref={inputRef}
                className="auth-input lock-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]*"
                maxLength={APP_LOCK_MAX_PIN}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, APP_LOCK_MAX_PIN))}
                disabled={busy || counting}
                autoFocus
                aria-describedby="lock-status"
              />
            </label>
            {error && <div className="auth-alert auth-error" role="alert" id="lock-status">{error}</div>}
            {counting && (
              <div className="auth-alert auth-notice" role="status" id="lock-status">
                Too many attempts. Try again in {Math.ceil(waiting / 1000)} seconds.
              </div>
            )}
            <button className="btn primary auth-submit" type="submit" disabled={busy || counting}>
              {busy ? 'Checking…' : 'Unlock'}
            </button>
            <button type="button" className="auth-link lock-link" onClick={() => { setForgot(true); setError(''); }}>
              Forgotten PIN?
            </button>
          </form>
        ) : (
          <div className="lock-forgot">
            <div className="auth-alert auth-notice" role="status">
              <strong>There is no PIN reset or recovery key.</strong>
              <span>
                {' '}The PIN is stored only as a slow hash on this device, so nobody — including FinanceHub —
                can recover it. The budget itself is not encrypted by this lock, so removing the lock opens
                the workspace without changing or deleting any data.
              </span>
            </div>
            <button className="btn primary auth-submit" type="button" onClick={removeLock}>
              Remove the app lock and open
            </button>
            <button className="btn ghost auth-submit" type="button" onClick={() => setForgot(false)}>
              Back to PIN entry
            </button>
          </div>
        )}

        <p className="lock-foot">
          Auto-locks after {idleLabel(normalizeIdleMinutes(config.idleMinutes))} idle · v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}

export function AppLockSection({
  config,
  onChange,
  workspace,
  notify,
}: {
  config: AppLockConfig | null;
  onChange: (config: AppLockConfig | null) => void;
  workspace: WorkspaceMode;
  notify: (message: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newConfirmation, setNewConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);

  if (workspace !== 'local') {
    return (
      <Section
        title="App lock"
        sub="The PIN lock is for device-only workspaces."
      >
        <div style={{ padding: 16 }} className="muted small">
          {workspace === 'demo'
            ? 'The sample workspace holds no personal data, so it cannot be locked.'
            : 'This workspace is protected by your FinanceHub sign-in. The device PIN lock is available when you switch to the local-only workspace.'}
        </div>
      </Section>
    );
  }

  const enable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const problem = pinProblem(pin);
    if (problem) { setError(problem); return; }
    if (pin !== confirmation) { setError('The two PINs do not match.'); return; }
    setBusy(true);
    try {
      const created = await createAppLock(pin);
      onChange(created);
      setPin('');
      setConfirmation('');
      notify(`App lock on — FinanceHub locks after ${created.idleMinutes} minutes idle`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The app lock could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const changePin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!config) return;
    setError('');
    const problem = pinProblem(newPin);
    if (problem) { setError(problem); return; }
    if (newPin !== newConfirmation) { setError('The two new PINs do not match.'); return; }
    if (pinProblem(currentPin)) { setError('Enter your current PIN.'); return; }
    setBusy(true);
    try {
      if (!(await verifyAppLock(config, currentPin))) {
        setError('That current PIN is not correct.');
        return;
      }
      const rotated = await createAppLock(newPin, config.idleMinutes);
      onChange(rotated);
      setCurrentPin('');
      setNewPin('');
      setNewConfirmation('');
      setChanging(false);
      notify('PIN changed — the old PIN no longer unlocks this device');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The PIN could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!config) return;
    if (!window.confirm('Turn off the app lock? The budget and every record stay untouched.')) return;
    onChange(null);
    notify('App lock off');
  };

  return (
    <Section
      title="App lock"
      sub="A device-only PIN that hides this workspace when you step away. It is not encryption."
      actions={config ? <Badge tone="green">On</Badge> : <Badge tone="amber">Off</Badge>}
    >
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        <p className="muted small" style={{ margin: 0 }}>
          The PIN is stored on this device as a PBKDF2-SHA-256 hash and is never sent to the cloud.
          It stops someone using your unlocked Windows session from reading the budget, but it does not
          encrypt the stored data, and it cannot be recovered if forgotten. Your credential-vault
          passphrase is separate and is not affected.
        </p>

        {!config ? (
          <form className="inline-form" onSubmit={(event) => void enable(event)}>
            <label className="field">
              <span>PIN ({APP_LOCK_MIN_PIN}–{APP_LOCK_MAX_PIN} digits)</span>
              <input
                className="input"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={APP_LOCK_MAX_PIN}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, APP_LOCK_MAX_PIN))}
              />
            </label>
            <label className="field">
              <span>Confirm PIN</span>
              <input
                className="input"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={APP_LOCK_MAX_PIN}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, '').slice(0, APP_LOCK_MAX_PIN))}
              />
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Setting up…' : 'Turn on app lock'}
            </button>
          </form>
        ) : (
          <>
            <div className="inline-form">
              <label className="field">
                <span>Auto-lock after</span>
                <select
                  className="select"
                  value={normalizeIdleMinutes(config.idleMinutes)}
                  onChange={(event) => {
                    const minutes = Number(event.target.value);
                    onChange(withIdleMinutes(config, minutes));
                    notify(`App lock now waits ${minutes} minute${minutes === 1 ? '' : 's'} of inactivity`);
                  }}
                >
                  {APP_LOCK_IDLE_OPTIONS.map((minutes) => (
                    <option value={minutes} key={minutes}>{idleLabel(minutes)} idle</option>
                  ))}
                </select>
              </label>
              <button className="btn ghost" type="button" onClick={() => setChanging((open) => !open)}>
                {changing ? 'Cancel PIN change' : 'Change PIN'}
              </button>
              <button className="btn ghost" type="button" onClick={remove}>Turn off app lock</button>
            </div>

            {changing && (
              <form className="inline-form" onSubmit={(event) => void changePin(event)}>
                <label className="field">
                  <span>Current PIN</span>
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    maxLength={APP_LOCK_MAX_PIN}
                    value={currentPin}
                    onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, APP_LOCK_MAX_PIN))}
                  />
                </label>
                <label className="field">
                  <span>New PIN</span>
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={APP_LOCK_MAX_PIN}
                    value={newPin}
                    onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, APP_LOCK_MAX_PIN))}
                  />
                </label>
                <label className="field">
                  <span>Confirm new PIN</span>
                  <input
                    className="input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={APP_LOCK_MAX_PIN}
                    value={newConfirmation}
                    onChange={(event) => setNewConfirmation(event.target.value.replace(/\D/g, '').slice(0, APP_LOCK_MAX_PIN))}
                  />
                </label>
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Save new PIN'}
                </button>
              </form>
            )}
          </>
        )}

        {error && <div className="auth-alert auth-error" role="alert">{error}</div>}
        {config && (
          <p className="muted small" style={{ margin: 0 }}>
            The lock is on for this workspace. It starts locked whenever FinanceHub opens, and the
            top bar has a <strong>Lock</strong> button. Provider credentials unlocked in the vault are
            sealed again when the app locks.
          </p>
        )}
      </div>
    </Section>
  );
}

