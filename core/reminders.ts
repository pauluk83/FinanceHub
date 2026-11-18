/**
 * Email bill reminders (R6).
 *
 * The digest is built from the same derived notifications the app shows, so an
 * email cannot invent a bill or hide a paid one. Delivery is opt-in and stays
 * disabled until a server-side provider key is configured; no key, address or
 * provider secret is ever written into the budget or a bundle.
 */
import type { Dataset, Engine } from './engine.ts';
import { buildBudgetNotifications, type BudgetNotification } from './notifications.ts';

export interface EmailReminderPreferences {
  enabled: boolean;
  email: string;
  bills: boolean;
  expiries: boolean;
  /** Local time the daily digest should be produced, HH:MM. */
  digestTime: string;
}

export const DEFAULT_REMINDER_HORIZON_DAYS = 7;

export function reminderPreferences(ds: Dataset): EmailReminderPreferences {
  const saved = ds.settings.emailReminders;
  return {
    enabled: saved?.enabled === true,
    email: String(saved?.email ?? '').trim(),
    bills: saved?.bills !== false,
    expiries: saved?.expiries !== false,
    digestTime: /^\d{2}:\d{2}$/.test(String(saved?.digestTime ?? '')) ? String(saved.digestTime) : '07:00',
  };
}

export interface ReminderDigest {
  subject: string;
  text: string;
  html: string;
  items: BudgetNotification[];
  bills: BudgetNotification[];
  expiries: BudgetNotification[];
  recipient: string;
  enabled: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function longDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/**
 * Build the daily digest. The subject carries the date and the count only, so
 * an inbox preview never shows a bill name or an amount. The body does, because
 * it is addressed to the owner.
 */
export function buildReminderDigest(
  ds: Dataset,
  engine: Engine,
  options: { today?: string; horizonDays?: number } = {},
): ReminderDigest {
  const prefs = reminderPreferences(ds);
  const today = options.today ?? ds.settings.asOfDate;
  const horizon = Math.max(1, Math.min(60, options.horizonDays ?? DEFAULT_REMINDER_HORIZON_DAYS));
  const notices = buildBudgetNotifications(ds, engine, { today, horizonDays: horizon });
  const bills = notices.filter((notice) => notice.kind === 'bill');
  const expiries = notices.filter((notice) => notice.kind === 'expiry');
  const items = [
    ...(prefs.bills ? bills : []),
    ...(prefs.expiries ? expiries : []),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));

  const count = items.length;
  const subject = count === 0
    ? `FinanceHub reminders — nothing due around ${longDate(today)}`
    : `FinanceHub reminders — ${count} item${count === 1 ? '' : 's'} for ${longDate(today)}`;

  const lines = items.map((notice) => `- ${notice.title} — ${notice.detail}`);
  const text = [
    `FinanceHub reminders for ${longDate(today)}`,
    '',
    ...(count ? lines : ['Nothing is due in the next few days.']),
    '',
    'This digest is generated from your own budget. Reply with “Unsubscribe” to stop these emails.',
  ].join('\n');

  const rows = items.map((notice) => (
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e3e8ec"><strong>${escapeHtml(notice.title)}</strong>`
    + `<div style="color:#5b6773">${escapeHtml(notice.detail)}</div></td>`
    + `<td style="padding:6px 10px;border-bottom:1px solid #e3e8ec;white-space:nowrap">${escapeHtml(notice.date)}</td></tr>`
  )).join('');

  const html = `<!doctype html><html lang="en-GB"><body style="font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17202a;margin:0;padding:24px">`
    + `<h1 style="font-size:18px;margin:0 0 4px">FinanceHub reminders</h1>`
    + `<p style="color:#5b6773;margin:0 0 16px">${escapeHtml(longDate(today))}</p>`
    + (count
      ? `<table style="border-collapse:collapse;width:100%;max-width:640px"><tbody>${rows}</tbody></table>`
      : '<p>Nothing is due in the next few days.</p>')
    + '<p style="color:#5b6773;font-size:12px;margin-top:20px">Generated from your own budget. Reply with “Unsubscribe” to stop these emails.</p>'
    + '</body></html>';

  return {
    subject,
    text,
    html,
    items,
    bills,
    expiries,
    recipient: prefs.email,
    enabled: prefs.enabled,
  };
}
