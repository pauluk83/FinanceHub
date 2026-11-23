/**
 * Supabase Edge Function: send one push alert to the signed-in user's devices.
 *
 * Deploy with `npx supabase functions deploy send-push` after `npx supabase login`
 * (owner step). Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. The
 * public key must match `app/src/pushConfig.ts`, or browsers reject every message.
 *
 * The function never derives a figure: the app sends the alerts its own engine
 * already produced, each alert is recorded once per user in `push_deliveries`,
 * and every subscription is read and scoped by the user id from the verified JWT.
 * No service-role key ever reaches the browser.
 */
import { pushPayload, validPushAlert, type PushAlert } from './_shared/alerts.ts';
import { encryptPushPayload, vapidAuthorization } from './_shared/webpush.ts';

const MAX_ALERTS = 3;
const MAX_SUBSCRIPTIONS = 10;

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function secret(name: string): string {
  return (Deno.env.get(name) ?? '').trim();
}

const VAPID = {
  publicKey: secret('VAPID_PUBLIC_KEY'),
  privateKey: secret('VAPID_PRIVATE_KEY'),
  subject: secret('VAPID_SUBJECT') || 'mailto:pauluk83+financehub@gmail.com',
};

const ALLOWED_ORIGINS = (secret('APP_ORIGINS') || 'https://financehub-uk.pages.dev,http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin.replace(/\/$/, '')) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed || ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/** The user id comes from Supabase's own verification of the caller's JWT. */
async function verifiedUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  return typeof user?.id === 'string' && /^[0-9a-f-]{36}$/.test(user.id) ? user.id : null;
}

async function subscriptionsFor(userId: string): Promise<SubscriptionRow[]> {
  const response = await rest(
    `push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,endpoint,p256dh,auth&order=last_seen_at.desc&limit=${MAX_SUBSCRIPTIONS}`,
  );
  if (!response.ok) throw new Error(`Subscriptions could not be read (${response.status})`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows.filter((row) => row && row.endpoint && row.p256dh && row.auth) : [];
}

/** True only for the first delivery of this alert to this user. */
async function claimAlert(userId: string, alert: PushAlert): Promise<boolean> {
  const response = await rest('push_deliveries?on_conflict=user_id,alert_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: userId,
      alert_id: alert.id,
      sent_on: alert.date || new Date().toISOString().slice(0, 10),
    }),
  });
  if (!response.ok) throw new Error(`The alert could not be recorded (${response.status})`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function forgetSubscription(id: string): Promise<void> {
  await rest(`push_subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function deliver(subscription: SubscriptionRow, payload: unknown): Promise<'sent' | 'gone' | 'failed'> {
  const body = await encryptPushPayload({
    plaintext: JSON.stringify(payload),
    uaPublic: subscription.p256dh,
    authSecret: subscription.auth,
  });
  const authorization = await vapidAuthorization(subscription.endpoint, VAPID);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  });
  if (response.status === 404 || response.status === 410) return 'gone';
  return response.ok ? 'sent' : 'failed';
}

async function handleAlerts(userId: string, origin: string | null, body: Record<string, unknown>): Promise<Response> {
  const offered = Array.isArray(body.alerts) ? body.alerts.slice(0, MAX_ALERTS) : [];
  const alerts = offered.map(validPushAlert).filter((alert): alert is PushAlert => Boolean(alert));
  if (alerts.length === 0) return json({ ok: true, sent: 0, removed: 0, skipped: 0 }, 200, origin);

  const subscriptions = await subscriptionsFor(userId);
  if (subscriptions.length === 0) return json({ ok: true, sent: 0, removed: 0, skipped: alerts.length }, 200, origin);

  const base = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  let sent = 0;
  let removed = 0;
  let skipped = 0;
  for (const alert of alerts) {
    if (!await claimAlert(userId, alert)) {
      skipped += 1;
      continue;
    }
    const payload = pushPayload(alert, base);
    for (const subscription of subscriptions) {
      let outcome: 'sent' | 'gone' | 'failed';
      try {
        outcome = await deliver(subscription, payload);
      } catch {
        outcome = 'failed';
      }
      if (outcome === 'sent') sent += 1;
      if (outcome === 'gone') {
        removed += 1;
        await forgetSubscription(subscription.id);
      }
    }
  }
  return json({ ok: true, sent, removed, skipped }, 200, origin);
}

async function handleTest(userId: string, origin: string | null): Promise<Response> {
  const subscriptions = await subscriptionsFor(userId);
  if (subscriptions.length === 0) {
    return json({ ok: false, error: 'No device is subscribed yet.' }, 409, origin);
  }
  const base = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  let sent = 0;
  let removed = 0;
  for (const subscription of subscriptions) {
    let outcome: 'sent' | 'gone' | 'failed';
    try {
      outcome = await deliver(subscription, {
        title: 'FinanceHub push is on',
        body: 'Bill, balance, card and target alerts will arrive here.',
        url: `${base}/#alerts`,
        tag: 'financehub-test',
      });
    } catch {
      outcome = 'failed';
    }
    if (outcome === 'sent') sent += 1;
    if (outcome === 'gone') {
      removed += 1;
      await forgetSubscription(subscription.id);
    }
  }
  if (sent === 0) return json({ ok: false, error: 'The push service rejected the test message.', sent, removed }, 502, origin);
  return json({ ok: true, sent, removed }, 200, origin);
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405, origin);
  if (request.headers.get('Origin') && !ALLOWED_ORIGINS.includes(origin!.replace(/\/$/, ''))) {
    return json({ ok: false, error: 'That origin is not allowed.' }, 403, origin);
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !VAPID.publicKey || !VAPID.privateKey) {
    return json({ ok: false, error: 'Push is not configured on the server.' }, 503, origin);
  }

  const userId = await verifiedUserId(request);
  if (!userId) return json({ ok: false, error: 'Sign in to receive push alerts.' }, 401, origin);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'The request body was not JSON.' }, 400, origin);
  }

  try {
    if (body.type === 'test') return await handleTest(userId, origin);
    if (body.type === 'alerts') return await handleAlerts(userId, origin, body);
    return json({ ok: false, error: 'Unknown request type.' }, 400, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push delivery failed.';
    return json({ ok: false, error: message }, 500, origin);
  }
});
