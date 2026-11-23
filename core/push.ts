/**
 * Push alert selection.
 *
 * Push shows the same derived notifications the app shows, but only the ones
 * worth waking a phone for: a bill due, a balance gone wrong and a target
 * warning. The payload carries no figure that the notification did not already
 * carry, and the sender never computes money of its own.
 *
 * The alert shape, allowlist and payload live in the sender's `_shared/alerts.ts`
 * because the Edge Function cannot import from `core/`; this module is the app's
 * side of the same rules.
 */
import type { BudgetNotification } from './notifications.ts';
import {
  PUSH_ALERT_KINDS,
  PUSH_MAX_ALERTS,
  isPushWorthy,
  pushPayload,
  validPushAlert,
  type PushAlert,
} from '../supabase/functions/send-push/_shared/alerts.ts';

export { PUSH_ALERT_KINDS, PUSH_MAX_ALERTS, isPushWorthy, pushPayload, validPushAlert };
export type { PushAlert, PushPayload } from '../supabase/functions/send-push/_shared/alerts.ts';

/** Critical first, then by date, so the phone shows the alert that matters most. */
export function pushAlerts(notifications: readonly BudgetNotification[], limit = PUSH_MAX_ALERTS): PushAlert[] {
  const seen = new Set<string>();
  const picked: PushAlert[] = [];
  const ranked = [...notifications].sort((left, right) => (
    (left.severity === right.severity ? 0 : left.severity === 'critical' ? -1 : 1)
    || left.date.localeCompare(right.date)
    || left.title.localeCompare(right.title)
  ));
  for (const notification of ranked) {
    if (!isPushWorthy(notification) || seen.has(notification.id)) continue;
    const alert = validPushAlert(notification);
    if (!alert) continue;
    seen.add(notification.id);
    picked.push(alert);
    if (picked.length >= Math.max(1, limit)) break;
  }
  return picked;
}
