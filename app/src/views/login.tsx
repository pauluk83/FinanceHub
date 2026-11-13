import { useState, type FormEvent, type ReactNode } from 'react';
import {
  authClient,
  authConfigured,
  authRedirectTo,
  passkeyErrorMessage,
  passkeysSupported,
  signInWithPasskey,
  signInWithProvider,
  type AuthProvider,
} from '../auth';
import { HOSTED_WEB } from '../runtime';
import { APP_VERSION } from '../version';
import { APP_CHANGELOG } from '../appChangelog.generated';
import { GITHUB_REPO_URL } from '../installer';

type Mode = 'signIn' | 'signUp' | 'reset';

const PASSWORD_MIN_LENGTH = 10;

function authErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  if (/invalid login credentials/i.test(raw)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(raw)) return 'Confirm your email address before signing in.';
  if (/provider is not enabled|unsupported provider/i.test(raw)) return 'That sign-in provider is not enabled for this Supabase project yet.';
  if (/rate limit|too many requests/i.test(raw)) return 'Too many attempts. Wait a moment and try again.';
  if (/password should be at least/i.test(raw)) return `Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`;
  return raw;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.4 20 5v6.1c0 5.1-3.4 9.1-8 10.5-4.6-1.4-8-5.4-8-10.5V5l8-2.6Zm0 2.2L6 6.5v4.6c0 3.9 2.4 7 6 8.3 3.6-1.3 6-4.4 6-8.3V6.5l-6-1.9Zm-.1 4.1 1.7 1.7 3.4-3.4 1.4 1.4-4.8 4.8-3.1-3.1 1.4-1.4Z"
      />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.5 3a6.5 6.5 0 0 0-6.3 8.1L3 16.3V21h4.7l1.2-1.2v-2.1h2.1l1.2-1.2v-2.1h2l1.4-1.4A6.5 6.5 0 1 0 14.5 3Zm2.2 3.3a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.75-5.6-4.1H3.04v2.58A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.94a6 6 0 0 1 0-3.88V7.48H3.04a10 10 0 0 0 0 9.04l3.36-2.58Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.36 2.58C7.2 7.7 9.4 5.96 12 5.96Z" />
    </svg>
  );
}

export function AuthFrame({
  kicker,
  title,
  subtitle,
  children,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <aside className="auth-art" aria-hidden="true">
        <div className="auth-brand">
          <div className="brand-mark">FH</div>
          <div>
            <div className="brand-title">FinanceHub™</div>
            <div className="brand-sub">Income &amp; expenses</div>
          </div>
        </div>
        <div className="auth-art-copy">
          <span className="eyebrow">Private finance, clearly</span>
          <h1>Your money.<br /><span>One clear view.</span></h1>
          <p>Accounts, bills, people and provider ledgers — reconciled in one place.</p>
          <div className="auth-points">
            <span>Month-end locks</span>
            <span>Bill changes</span>
            <span>Provider ledgers</span>
          </div>
        </div>
        <div className="auth-art-foot">
          <ShieldIcon />
          <span>Created by Zane Stanton · Your session is protected by Supabase Auth.</span>
        </div>
      </aside>

      <main className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-card-head">
            <span className="auth-kicker">{kicker}</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
            <p className="auth-owner">Designed, built and owned by <strong>Zane Stanton</strong></p>
          </div>
          {children}
          <div className="auth-legal">
            <span>© 2026 Zane Stanton · FinanceHub™</span>
            <nav aria-label="Legal documents">
              <a href="#app-changelog">Application changelog</a>
              {HOSTED_WEB && <a href="#app-changelog">Download for Windows</a>}
              <a href="#legal/privacy">Privacy</a>
              <a href="#legal/terms">Terms</a>
              <a href="#legal/eula">EULA</a>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
            </nav>
          </div>
          <div className="auth-build" style={{ marginTop: 10, textAlign: 'center', color: 'var(--faint)', fontSize: 11 }}>
            Running v{APP_VERSION} · build {APP_CHANGELOG.buildId}
          </div>
        </div>
      </main>
    </div>
  );
}

function ConfigNotice() {
  return (
    <div className="auth-alert auth-config" role="status">
      <strong>Authentication setup required</strong>
      <span>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>, then restart the app.</span>
      <span>Enable Email and Google in Supabase Auth.</span>
    </div>
  );
}

export function ModeChooser({ cloudAvailable, onChoose }: { cloudAvailable: boolean; onChoose: (mode: 'cloud' | 'local') => void }) {
  return (
    <AuthFrame
      kicker="Storage"
      title="Choose where your data lives"
      subtitle="You can use FinanceHub locally or sign in to sync it across devices."
    >
      <div className="auth-modes">
        <button type="button" className="auth-mode-card" onClick={() => onChoose('cloud')}>
          <span className="auth-mode-icon" aria-hidden="true">☁</span>
          <strong>Cloud sync</strong>
          <span>Sign in on Windows and iOS. Your budget is stored in Supabase and cached securely on each device.</span>
          <small>{cloudAvailable ? 'Account required' : 'Supabase setup required'}</small>
        </button>
        <button type="button" className="auth-mode-card" onClick={() => onChoose('local')}>
          <span className="auth-mode-icon" aria-hidden="true">▣</span>
          <strong>Local only</strong>
          <span>Keep this budget on this device. Cloud sync stays off, even if you later sign in.</span>
          <small>Not protected by a login</small>
        </button>
      </div>
      <p className="auth-security">
        <ShieldIcon />
        <span>Cloud sync uses Supabase Auth. Local mode stays on this device.</span>
      </p>
    </AuthFrame>
  );
}

export function LocalImportPrompt({
  email,
  error,
  onImport,
  onStartEmpty,
  onKeepLocal,
  onSignOut,
}: {
  email: string | null;
  error: string | null;
  onImport: () => void;
  onStartEmpty: () => void;
  onKeepLocal: () => void;
  onSignOut: () => void;
}) {
  return (
    <AuthFrame
      kicker="Local data found"
      title="Bring this device’s budget with you?"
      subtitle="Nothing has been uploaded. Choose what happens to the local-only budget."
    >
      <div className="auth-alert auth-notice" role="status">
        <strong>{email ?? 'Your account'} is signed in.</strong>
        <span> This device also contains a local-only budget.</span>
      </div>
      {error && <div className="auth-alert auth-error" role="alert">{error}</div>}
      <div className="auth-local" style={{ display: 'grid', gap: 10 }}>
        <button type="button" className="btn primary auth-submit" onClick={onImport}>
          Sync local budget to cloud
        </button>
        <button type="button" className="btn auth-submit" onClick={onStartEmpty}>
          Start with an empty cloud budget
        </button>
        <button type="button" className="btn ghost auth-submit" onClick={onKeepLocal}>
          Keep using local budget
        </button>
        <button type="button" className="btn ghost auth-submit" onClick={onSignOut}>
          Log out of account
        </button>
        <p>
          Syncing copies the local budget into this account and removes the local copy. Starting empty leaves the local copy untouched. The account stays signed in when you keep the local budget, so Sync, Exit, and Log out remain available.
        </p>
      </div>
    </AuthFrame>
  );
}

export function AuthLoading() {
  return (
    <div className="auth-loading">
      <div className="brand-mark">FH</div>
      <div>
        <strong>FinanceHub™</strong>
        <span>Checking your secure session…</span>
      </div>
    </div>
  );
}

export function LoginPage({ onContinueLocally, onTryDemo, onOpenPeoplePortal }: { onContinueLocally?: () => void; onTryDemo?: () => void; onOpenPeoplePortal?: () => void }) {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<AuthProvider | 'email' | 'passkey' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const passkeyAvailable = passkeysSupported();
  const disabled = !authConfigured || busy !== null;
  const title = mode === 'signIn' ? 'Welcome back' : mode === 'signUp' ? 'Create your account' : 'Reset your password';
  const subtitle = mode === 'signIn'
    ? 'Sign in to open your budget.'
    : mode === 'signUp'
      ? 'Create a secure account for FinanceHub.'
      : 'We’ll email you a secure link to choose a new password.';

  const changeMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirm('');
    setShowPassword(false);
  };

  const handleSocial = async (provider: AuthProvider) => {
    setError(null);
    setNotice(null);
    setBusy(provider);
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  };

  const handlePasskey = async () => {
    setError(null);
    setNotice(null);
    setBusy('passkey');
    try {
      await signInWithPasskey();
    } catch (err) {
      setError(passkeyErrorMessage(err));
      setBusy(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!authClient) {
      setError('Authentication is not configured.');
      return;
    }

    const emailAddress = email.trim();
    if (!isEmail(emailAddress)) {
      setError('Enter a valid email address.');
      return;
    }

    if (mode === 'reset') {
      const redirectTo = authRedirectTo();
      if (!redirectTo) {
        setError('Password reset needs the web app or a registered desktop callback.');
        return;
      }
      setBusy('email');
      const { error: resetError } = await authClient.auth.resetPasswordForEmail(emailAddress, { redirectTo });
      setBusy(null);
      if (resetError) {
        setError(authErrorMessage(resetError));
        return;
      }
      setNotice('If an account exists for that address, a reset link is on its way.');
      return;
    }

    if (mode === 'signUp') {
      if (password.length < PASSWORD_MIN_LENGTH) {
        setError(`Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        setError('The passwords do not match.');
        return;
      }
      setBusy('email');
      const { data, error: signUpError } = await authClient.auth.signUp({
        email: emailAddress,
        password,
        options: { emailRedirectTo: authRedirectTo() },
      });
      setBusy(null);
      if (signUpError) {
        setError(authErrorMessage(signUpError));
        return;
      }
      if (!data.session) {
        changeMode('signIn');
        setNotice('Check your email to confirm the account, then sign in.');
      }
      return;
    }

    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy('email');
    const { error: signInError } = await authClient.auth.signInWithPassword({ email: emailAddress, password });
    setBusy(null);
    if (signInError) setError(authErrorMessage(signInError));
  };

  return (
    <AuthFrame kicker="Secure access" title={title} subtitle={subtitle}>
      {!authConfigured && <ConfigNotice />}

      {onContinueLocally && (
        <div className="auth-local">
          <button type="button" className="btn primary auth-local-btn" onClick={onContinueLocally}>
            Continue locally
          </button>
          <p>Open FinanceHub without an account. Your budget stays on this device and is not protected by a login.</p>
        </div>
      )}

      {mode !== 'reset' && (
        <>
          <div className="auth-socials">
            <button type="button" className="auth-social" onClick={() => void handleSocial('google')} disabled={disabled}>
              <GoogleIcon />
              <span>Continue with Google</span>
              <span className="auth-social-arrow" aria-hidden="true">→</span>
            </button>
            {mode === 'signIn' && passkeyAvailable && (
              <button type="button" className="auth-social" onClick={() => void handlePasskey()} disabled={disabled}>
                <PasskeyIcon />
                <span>{busy === 'passkey' ? 'Waiting for your passkey…' : 'Sign in with a passkey'}</span>
                <span className="auth-social-arrow" aria-hidden="true">→</span>
              </button>
            )}
          </div>
          <div className="auth-divider"><span>or use email and password</span></div>
        </>
      )}

      {error && <div className="auth-alert auth-error" role="alert">{error}</div>}
      {notice && <div className="auth-alert auth-notice" role="status">{notice}</div>}

      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className="auth-field">
          <span>Email address</span>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            autoFocus
            disabled={disabled}
            required
          />
        </label>

        {mode !== 'reset' && (
          <>
            <div className="auth-label-row">
              <label htmlFor="login-password">Password</label>
              {mode === 'signIn' && (
                <button type="button" className="auth-link" onClick={() => changeMode('reset')} disabled={disabled}>
                  Forgot password?
                </button>
              )}
            </div>
            <div className="auth-password">
              <input
                id="login-password"
                className="auth-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                minLength={mode === 'signUp' ? PASSWORD_MIN_LENGTH : undefined}
                disabled={disabled}
                required
              />
              <button
                type="button"
                className="auth-reveal"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={disabled}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'signUp' && <span className="auth-hint">At least {PASSWORD_MIN_LENGTH} characters.</span>}
          </>
        )}

        {mode === 'signUp' && (
          <label className="auth-field">
            <span>Confirm password</span>
            <input
              className="auth-input"
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              disabled={disabled}
              required
            />
          </label>
        )}

        <button className="btn primary auth-submit" type="submit" disabled={disabled}>
          {busy === 'email'
            ? 'Please wait…'
            : mode === 'signIn'
              ? 'Sign in'
              : mode === 'signUp'
                ? 'Create account'
                : 'Send reset link'}
        </button>
      </form>

      <div className="auth-switch">
        {mode === 'signIn' && (
          <span>New to FinanceHub? <button type="button" className="auth-link" onClick={() => changeMode('signUp')} disabled={disabled}>Create an account</button></span>
        )}
        {mode === 'signUp' && (
          <span>Already have an account? <button type="button" className="auth-link" onClick={() => changeMode('signIn')} disabled={disabled}>Sign in</button></span>
        )}
        {mode === 'reset' && (
          <span>Remembered it? <button type="button" className="auth-link" onClick={() => changeMode('signIn')} disabled={disabled}>Back to sign in</button></span>
        )}
      </div>

      {onOpenPeoplePortal && (
        <div className="auth-people">
          <div>
            <span className="auth-demo-kicker">People statement</span>
            <strong>Sign in to your own statement</strong>
            <p>Use the username and password your budget owner created for you.</p>
          </div>
          <button type="button" className="btn ghost auth-submit" onClick={onOpenPeoplePortal}>
            Open people sign-in
          </button>
        </div>
      )}

      {onTryDemo && (
        <div className="auth-demo">
          <div>
            <span className="auth-demo-kicker">Just looking?</span>
            <strong>Explore a sample budget</strong>
            <p>Open FinanceHub with demo data. No account, email or setup needed.</p>
          </div>
          <button type="button" className="btn primary auth-submit" onClick={onTryDemo}>
            Take a look around
          </button>
        </div>
      )}

      <p className="auth-security">
        <ShieldIcon />
        <span>Your password is handled by Supabase Auth and is never stored by FinanceHub.</span>
      </p>
    </AuthFrame>
  );
}

export function RecoveryPage({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!authClient) {
      setError('Authentication is not configured.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await authClient.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(authErrorMessage(updateError));
      return;
    }
    onComplete();
  };

  return (
    <AuthFrame kicker="Account recovery" title="Choose a new password" subtitle="Your reset link is valid for this session only.">
      {!authConfigured && <ConfigNotice />}
      {error && <div className="auth-alert auth-error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="auth-field">
          <label htmlFor="recovery-password">New password</label>
          <div className="auth-password">
            <input
              id="recovery-password"
              className="auth-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              autoFocus
              disabled={!authConfigured || busy}
              required
            />
            <button
              type="button"
              className="auth-reveal"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              disabled={!authConfigured || busy}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className="auth-hint">At least {PASSWORD_MIN_LENGTH} characters.</span>
        </div>
        <label className="auth-field">
          <span>Confirm new password</span>
          <input
            className="auth-input"
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            disabled={!authConfigured || busy}
            required
          />
        </label>
        <button className="btn primary auth-submit" type="submit" disabled={!authConfigured || busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
      <div className="auth-switch">
        <button type="button" className="auth-link" onClick={onCancel} disabled={busy}>
          Cancel and sign in again
        </button>
      </div>
    </AuthFrame>
  );
}
