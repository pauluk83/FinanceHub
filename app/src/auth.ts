import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Public auth endpoint values used by the account-security helpers. */
export const authUrl = url;
export const authAnonKey = anonKey;

/** The anon/publishable key is intentionally public. Never use a service-role key here. */
export const authConfigured = Boolean(url && anonKey);

/** On desktop, Supabase sessions are stored in DPAPI/Keychain-backed SQLite, not localStorage. */
const desktopBridge = typeof window !== 'undefined' ? window.financeHubDesktop : undefined;
const secureStorage = desktopBridge?.secureStorage;
const sessionStorage = secureStorage
  ? {
      getItem: (key: string) => secureStorage.getItem(key),
      setItem: (key: string, value: string) => { secureStorage.setItem(key, value); },
      removeItem: (key: string) => { secureStorage.removeItem(key); },
    }
  : undefined;

export const authClient: SupabaseClient | null = authConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        ...(sessionStorage ? { storage: sessionStorage } : {}),
      },
    })
  : null;

export type AuthProvider = 'google';
export type { Session };

/** Web uses its own origin; Electron uses the loopback callback registered by the main process. */
export function authRedirectTo(): string {
  if (desktopBridge?.oauth) return desktopBridge.oauth.redirectUrl;
  if (typeof window === 'undefined') return '';
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

if (authClient && desktopBridge?.oauth) {
  desktopBridge.oauth.onCallback(({ code, error }) => {
    if (error || !code) {
      console.error('Desktop OAuth callback failed:', error || 'missing authorization code');
      return;
    }
    void authClient.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) console.error('Desktop OAuth session exchange failed:', exchangeError.message);
    });
  });
}

export async function signInWithProvider(provider: AuthProvider): Promise<void> {
  if (!authClient) throw new Error('Authentication is not configured.');
  const redirectTo = authRedirectTo();
  if (!redirectTo) throw new Error('Social sign-in needs the web app or a registered desktop callback.');

  const options = { redirectTo };

  if (desktopBridge?.oauth) {
    const { data, error } = await authClient.auth.signInWithOAuth({
      provider,
      options: { ...options, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data.url) throw new Error('The provider did not return a sign-in URL.');
    desktopBridge.oauth.openExternal(data.url);
    return;
  }

  const { error } = await authClient.auth.signInWithOAuth({ provider, options });
  if (error) throw error;
}

/** WebAuthn needs a secure hosted origin; the packaged Electron window loads a local file. */
export function passkeysSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!window.location || window.location.protocol === 'file:' || !window.isSecureContext) return false;
  if (typeof window.PublicKeyCredential === 'undefined') return false;
  return typeof navigator.credentials?.create === 'function' && typeof navigator.credentials?.get === 'function';
}

/** Turn WebAuthn and Supabase passkey errors into messages a user can act on. */
export function passkeyErrorMessage(error: unknown): string {
  const source = error as { code?: unknown; message?: unknown } | null;
  const code = typeof source?.code === 'string' ? source.code : '';
  const raw = error instanceof Error
    ? error.message
    : typeof source?.message === 'string'
      ? source.message
      : 'The passkey request did not complete. Please try again.';

  if (code === 'passkey_disabled' || /passkey_disabled|passkeys? (?:is|are) not enabled/i.test(raw)) {
    return 'Passkey sign-in is not enabled for this project yet.';
  }
  if (code === 'too_many_passkeys' || /too_many_passkeys|maximum number of passkeys/i.test(raw)) {
    return 'This account has reached its passkey limit. Remove one before adding another.';
  }
  if (code === 'webauthn_credential_exists' || /already.*registered|credential_exists/i.test(raw)) {
    return 'This device already has a passkey for FinanceHub.';
  }
  if (code === 'webauthn_credential_not_found' || /credential_not_found|no passkey/i.test(raw)) {
    return 'No FinanceHub passkey was found on this device. Sign in with your password, then add a passkey in Account security.';
  }
  if (code === 'webauthn_challenge_expired' || /challenge.*expired/i.test(raw)) {
    return 'The passkey prompt expired. Try again.';
  }
  if (code === 'webauthn_verification_failed') {
    return 'The passkey could not be verified. Try again or use your password.';
  }
  if (code === 'ERROR_CEREMONY_ABORTED' || /not allowed|timed out|abort|cancel/i.test(raw)) {
    return 'The passkey prompt was cancelled or timed out.';
  }
  if (/browser does not support webauthn|webauthn.*not supported/i.test(raw)) {
    return 'This browser does not support passkeys. Use the hosted FinanceHub app in a supported browser.';
  }
  if (/relying party|registrable domain|invalid domain/i.test(raw)) {
    return 'Passkeys are registered for the FinanceHub domain. Open the hosted app at that address to use them.';
  }
  return raw;
}

export async function signInWithPasskey(): Promise<void> {
  if (!authClient) throw new Error('Authentication is not configured.');
  if (!passkeysSupported()) throw new Error('This browser does not support passkeys.');
  const { error } = await authClient.auth.signInWithPasskey();
  if (error) throw error;
}

export async function endSession(): Promise<void> {
  if (!authClient) return;
  const { error } = await authClient.auth.signOut();
  if (!error) return;
  // Clear the local session even if the network sign-out failed.
  await authClient.auth.signOut({ scope: 'local' });
  throw error;
}
