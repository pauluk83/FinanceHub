/**
 * Push alert shape, shared by the app and the sender.
 *
 * The Edge Function may not import from `core/`, so this one file holds the
 * allowlist, the trimming and the validation. `core/push.ts` imports it too, so
 * the app and the sender cannot disagree about what a push alert is.
 */

export type PushAlertKind = 'bill' | 'account' | 'card' | 'target';
export type PushAlertSeverity = 'warning' | 'critical';

export const PUSH_ALERT_KINDS: readonly PushAlertKind[] = ['bill', 'account', 'card', 'target'];
export const PUSH_MAX_ALERTS = 3;

export interface PushAlert {
  id: string;
  kind: PushAlertKind;
  severity: PushAlertSeverity;
  title: string;
  detail: string;
  date: string;
  view: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function isPushWorthy(alert: { kind: string; severity: string }): boolean {
  return PUSH_ALERT_KINDS.includes(alert.kind as PushAlertKind)
    && (alert.severity === 'warning' || alert.severity === 'critical');
}

function clipped(value: string, limit: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** `base` is the app origin; the view is the app's hash route. */
export function pushPayload(alert: PushAlert, base = ''): PushPayload {
  return {
    title: clipped(alert.title, 80) || 'FinanceHub',
    body: clipped(alert.detail, 160),
    url: `${String(base ?? '').replace(/\/$/, '')}/#${alert.view}`,
    tag: `financehub-${alert.id}`.slice(0, 120),
  };
}

/**
 * The sender accepts a request only for alerts it can recognise, so a
 * signed-in caller cannot turn the function into a general notification relay.
 */
export function validPushAlert(value: unknown): PushAlert | null {
  const source = value as Partial<PushAlert> | null;
  if (!source || typeof source !== 'object') return null;
  const kind = source.kind as PushAlertKind;
  const severity = source.severity as PushAlertSeverity;
  if (!PUSH_ALERT_KINDS.includes(kind)) return null;
  if (severity !== 'warning' && severity !== 'critical') return null;
  const id = String(source.id ?? '');
  const title = String(source.title ?? '');
  const view = String(source.view ?? '');
  // Notification ids carry the bill or account name, which can contain spaces.
  if (!/^[\x20-\x7E]{4,80}$/.test(id)) return null;
  if (!title.trim() || title.length > 120) return null;
  if (!/^[A-Za-z][A-Za-z0-9]{1,23}$/.test(view)) return null;
  return {
    id,
    kind,
    severity,
    title,
    detail: String(source.detail ?? '').slice(0, 300),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(source.date ?? '')) ? String(source.date) : '',
    view,
  };
}
