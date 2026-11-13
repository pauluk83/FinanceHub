/**
 * Connect sources for the production Content-Security-Policy.
 *
 * A valid HTTPS Supabase URL adds only that exact origin (and its WSS endpoint).
 * A missing or invalid URL adds nothing beyond the app itself; the hosted build
 * shows its setup notice instead of falling back to every Supabase project.
 */
export function connectSources(env: Record<string, string | undefined>): string {
  const sources = new Set(["'self'"]);
  try {
    const url = new URL(env.VITE_SUPABASE_URL ?? '');
    if (url.protocol === 'https:') {
      sources.add(url.origin);
      sources.add(`wss://${url.host}`);
    }
  } catch {
    // Fail closed: no wildcard fallback.
  }
  return [...sources].join(' ');
}
