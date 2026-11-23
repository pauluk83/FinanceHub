/**
 * Web push for the hosted app.
 *
 * A subscription is created in this browser, stored against the signed-in user
 * in `push_subscriptions`, and delivered by the `send-push` Edge Function with
 * the VAPID key in `pushConfig.ts`. The private half never reaches the browser.
 *
 * Alerts come from the same `buildBudgetNotifications` output the Notifications
 * screen shows (`core/push.ts` chooses the ones worth a phone alert), so a push
 * can never invent a bill or an amount. Nothing here runs in the Electron build:
 * it has no service worker and no push permission.
 */
import { authClient, authConfigured } from './auth';
import { readPersistedValue, writePersistedValue } from './store';
import { PUSH_PUBLIC_KEY } from './pushConfig';
import { pushAlerts, type PushAlert } from '../../core/push';
import type { BudgetNotification } from '../../core/notifications';
import { applicationServerKey } from '../../supabase/functions/send-push/_shared/webpush.ts';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '../publicSupabase';

const TABLE = 'push_subscriptions';
const LAST_SENT_KEY = 'financehub.push.last-alert.v1';
const MIN_GAP_MS = 30 * 60 * 1000;

const url = (import.meta.env.VITE_SUPABASE_URL?.trim() || PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || PUBLIC_SUPABASE_ANON_KEY || '';

export type PushState = 'unsupported' | 'signed-out' | 'blocked' | 'enabled' | 'disabled';

export function pushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (!authConfigured || !url || !PUSH_PUBLIC_KEY) return false;
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return false;
  }
  return true;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js');
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const ready = await registration();
  return ready ? ready.pushManager.getSubscription() : null;
}

async function session(): Promise<{ userId: string; accessToken: string } | null> {
  if (!authClient) return null;
  const { data } = await authClient.auth.getSession();
  const userId = data.session?.user?.id;
  const accessToken = data.session?.access_token;
  return userId && accessToken ? { userId, accessToken } : null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!await session()) return 'signed-out';
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'blocked';
  const subscription = await currentSubscription();
  return subscription ? 'enabled' : 'disabled';
}

export async function enablePush(): Promise<string> {
  if (!pushSupported()) throw new Error('Push needs the hosted app in a browser that supports notifications.');
  const who = await session();
  if (!who) throw new Error('Sign in to turn on push.');
  if (Notification.permission === 'denied') {
    throw new Error('Notifications are blocked for this site. Allow them in the browser settings, then try again.');
  }
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications were not allowed, so nothing was subscribed.');
  }

  const ready = await registration();
  if (!ready) throw new Error('The service worker is not available in this build.');

  const existing = await ready.pushManager.getSubscription();
  const subscription = existing ?? await ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(PUSH_PUBLIC_KEY),
  });

  const serialised = subscription.toJSON();
  const keys = serialised.keys ?? {};
  if (!serialised.endpoint || !keys.p256dh || !keys.auth) {
    throw new Error('The browser did not return a usable subscription.');
  }

  const { error } = await authClient!.from(TABLE).upsert({
    user_id: who.userId,
    endpoint: serialised.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' });
  if (error) throw new Error(`The subscription could not be saved: ${error.message}`);

  return 'Push is on for this device.';
}

export async function disablePush(): Promise<string> {
  const subscription = await currentSubscription();
  if (!subscription) return 'This device is not subscribed.';
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  if (authClient) await authClient.from(TABLE).delete().eq('endpoint', endpoint);
  return 'Push is off for this device.';
}

async function call(type: 'test' | 'alerts', body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const who = await session();
  if (!who) throw new Error('Sign in to receive push alerts.');
  const response = await fetch(`${url}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${who.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, ...body }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) {
    throw new Error(String(payload.error || `The push sender returned ${response.status}.`));
  }
  return payload;
}

export async function sendTestPush(): Promise<string> {
  const result = await call('test');
  const sent = Number(result.sent ?? 0);
  return sent > 0 ? `Test push sent to ${sent} device${sent === 1 ? '' : 's'}.` : 'No device received the test push.';
}

/**
 * Hands the current alerts to the sender. The same alert is recorded server-side
 * once per user, so a repeated render or a second tab cannot push it twice; the
 * local timestamp stops a busy app from calling the sender every minute.
 */
export async function deliverPushAlerts(notifications: readonly BudgetNotification[]): Promise<void> {
  if (!pushSupported()) return;
  if (await pushState() !== 'enabled') return;
  const alerts: PushAlert[] = pushAlerts(notifications);
  if (alerts.length === 0) return;

  const signature = alerts.map((alert) => alert.id).join('|');
  const previous = readPersistedValue(LAST_SENT_KEY);
  if (previous) {
    try {
      const saved = JSON.parse(previous) as { at?: number; ids?: string };
      if (saved.ids === signature && typeof saved.at === 'number' && Date.now() - saved.at < MIN_GAP_MS) return;
    } catch { /* a corrupt marker only costs one extra attempt */ }
  }

  try {
    await call('alerts', { alerts });
    writePersistedValue(LAST_SENT_KEY, JSON.stringify({ at: Date.now(), ids: signature }));
  } catch {
    /* push is best effort: the in-app bell already shows the same alert */
  }
}
