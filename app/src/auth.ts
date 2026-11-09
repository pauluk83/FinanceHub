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

export async function endSession(): Promise<void> {
  if (!authClient) return;
  const { error } = await authClient.auth.signOut();
  if (!error) return;
  // Clear the local session even if the network sign-out failed.
  await authClient.auth.signOut({ scope: 'local' });
  throw error;
}
