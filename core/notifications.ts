/**
 * In-app notification derivation.
 *
 * Notifications are deliberately read-only and derived from the live budget:
 * a due date or balance change can never be hidden by stale notification data.
 * Only the read timestamps are persisted in `settings.notificationReads`.
 */
import type { Dataset, Engine } from './engine.ts';

export type NotificationKind = 'bill' | 'account' | 'card';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface BudgetNotification {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  date: string;
  view: string;
}

export interface NotificationOptions {
  /** Defaults to the budget's As-Of date so the app and its tests agree. */
  today?: string;
  /** How many days ahead a bill is announced. */
  horizonDays?: number;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function nextMonth(iso: string): string {
  const date = new Date(`${monthStart(iso)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function money(pence: number): string {
  return `${pence < 0 ? '-' : ''}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function billNotifications(ds: Dataset, engine: Engine, today: string, horizon: string): BudgetNotification[] {
  const notices: BudgetNotification[] = [];
  const seen = new Set<string>();
  let cursor = monthStart(today);
  for (let guard = 0; guard < 3; guard += 1) {
    const year = Number(cursor.slice(0, 4));
    const month = Number(cursor.slice(5, 7));
    for (const bill of engine.scheduledBills(year, month)) {
      if (bill.paid || bill.dueDate < today || bill.dueDate > horizon) continue;
      const id = `bill:${bill.name}:${bill.dueDate}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const days = Math.round((Date.parse(`${bill.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      notices.push({
        id,
        kind: 'bill',
        severity: days <= 1 ? 'warning' : 'info',
        title: days === 0 ? `${bill.name} is due today` : `${bill.name} is due in ${days} day${days === 1 ? '' : 's'}`,
        detail: `${money(bill.amountPence)} · ${bill.dueDate}${bill.account ? ` · paid from ${bill.account}` : ''}`,
        date: bill.dueDate,
        view: 'bills',
      });
    }
    if (cursor >= horizon) break;
    cursor = nextMonth(cursor);
  }
  return notices;
}

function balanceNotifications(ds: Dataset, engine: Engine, today: string): BudgetNotification[] {
  const notices: BudgetNotification[] = [];
  const month = today.slice(0, 7);
  for (const account of engine.accountBalances(today)) {
    const configured = ds.accounts.find((entry) => entry.name === account.name);
    if (!configured?.active) continue;
    if (account.balancePence < 0) {
      notices.push({
        id: `account:${account.name}:${month}:negative`,
        kind: 'account',
        severity: 'critical',
        title: `${account.name} is below zero`,
        detail: `Balance ${money(account.balancePence)} as of ${today}.`,
        date: today,
        view: 'accounts',
      });
    } else if (configured.targetPence > 0 && account.balancePence < configured.targetPence * 0.1) {
      notices.push({
        id: `account:${account.name}:${month}:target`,
        kind: 'account',
        severity: 'warning',
        title: `${account.name} is close to its target floor`,
        detail: `Balance ${money(account.balancePence)} against a ${money(configured.targetPence)} target.`,
        date: today,
        view: 'accounts',
      });
    }
  }
  for (const card of engine.cardBalances(today)) {
    if (card.limitPence > 0 && card.balancePence > card.limitPence * 0.8) {
      notices.push({
        id: `card:${card.name}:${month}:utilisation`,
        kind: 'card',
        severity: 'warning',
        title: `${card.name} is over 80% used`,
        detail: `${money(card.balancePence)} of a ${money(card.limitPence)} limit.`,
        date: today,
        view: 'cards',
      });
    }
  }
  return notices;
}

export function buildBudgetNotifications(ds: Dataset, engine: Engine, options: NotificationOptions = {}): BudgetNotification[] {
  const today = options.today ?? ds.settings.asOfDate;
  const horizon = addDays(today, Math.max(0, Math.min(60, options.horizonDays ?? 7)));
  return [...billNotifications(ds, engine, today, horizon), ...balanceNotifications(ds, engine, today)]
    .sort((a, b) => {
      const rank: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 };
      return rank[a.severity] - rank[b.severity] || a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
    });
}

export function unreadBudgetNotifications(ds: Dataset, notifications: readonly BudgetNotification[]): BudgetNotification[] {
  const read = ds.settings.notificationReads ?? {};
  return notifications.filter((notification) => !read[notification.id]);
}
