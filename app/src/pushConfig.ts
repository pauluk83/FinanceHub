/**
 * The public half of the VAPID key pair (RFC 8292).
 *
 * Safe to publish: a push subscription is bound to this key, and the private
 * half exists only as the `VAPID_PRIVATE_KEY` Supabase secret. Regenerating the
 * pair with `node scripts/vapid-keys.mjs --force` invalidates every existing
 * subscription, so update this constant only when you mean to.
 *
 * `VITE_VAPID_PUBLIC_KEY` overrides it for a local build.
 */
const fromEnv = (import.meta.env?.VITE_VAPID_PUBLIC_KEY ?? '').trim();

export const PUSH_PUBLIC_KEY = fromEnv
  || 'BDrkh_y-KD-fibhqtJCGt1JC-y_XrZNUksCkgNpZEoRZ-wLEXQsAfFQPnK3se4irBaFwqEaeTHq6kZuKNxEu_-o';
