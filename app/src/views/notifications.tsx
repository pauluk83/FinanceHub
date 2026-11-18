import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Section, Table } from '../components';
import { dateUk, dateTimeUk } from '../format';
import { buildBudgetNotifications, type NotificationSeverity } from '../../../core/notifications';
import { reminderPreferences } from '../../../core/reminders';

function tone(severity: NotificationSeverity): string {
  return severity === 'critical' ? 'red' : severity === 'warning' ? 'amber' : 'blue';
}

export function NotificationsView({ ds, engine, update, go, notify }: ViewProps) {
  const notices = buildBudgetNotifications(ds, engine);
  const read = ds.settings.notificationReads ?? {};
  const initialPrefs = reminderPreferences(ds);
  const [prefs, setPrefs] = useState(initialPrefs);

  const savePrefs = () => {
    const email = prefs.email.trim();
    if (prefs.enabled && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return notify('Enter a valid email address before enabling reminders');
    update((dataset) => {
      dataset.settings.emailReminders = {
        enabled: prefs.enabled,
        email,
        bills: prefs.bills,
        expiries: prefs.expiries,
        digestTime: prefs.digestTime || '07:00',
      };
    });
    notify(prefs.enabled ? 'Email reminder preferences saved — delivery starts once the server key is set' : 'Email reminders turned off');
  };
  const unread = notices.filter((notice) => !read[notice.id]);

  const markRead = (ids: string[]) => {
    if (!ids.length) return;
    update((dataset) => {
      dataset.settings.notificationReads = {
        ...(dataset.settings.notificationReads ?? {}),
        ...Object.fromEntries(ids.map((id) => [id, new Date().toISOString()])),
      };
    });
    notify(ids.length === 1 ? 'Notification marked read' : `${ids.length} notifications marked read`);
  };

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">In-app alerts</span>
          <h2>Notifications</h2>
          <div className="hero-figures">
            <div className="hero-figure"><span>Unread</span><strong>{unread.length}</strong></div>
            <div className="hero-figure"><span>Bills</span><strong>{notices.filter((notice) => notice.kind === 'bill').length}</strong></div>
            <div className="hero-figure"><span>Expiries</span><strong>{notices.filter((notice) => notice.kind === 'expiry').length}</strong></div>
            <div className="hero-figure"><span>Balances</span><strong>{notices.filter((notice) => notice.kind === 'account' || notice.kind === 'card').length}</strong></div>
          </div>
        </div>
        <div className="hero-side">
          <Badge tone={unread.length ? 'amber' : 'green'}>{unread.length ? 'Review needed' : 'All read'}</Badge>
          <div className="muted">Derived from the budget as of {dateUk(ds.settings.asOfDate)}.</div>
          <div className="muted small">Alerts clear when the underlying bill is paid, the expiry passes or the balance changes.</div>
        </div>
      </section>

      <Section
        title="Current alerts"
        sub="Bills and expiries due in the next seven days, accounts below zero or close to their target floor, and cards over 80% used."
        actions={<button className="btn ghost sm" onClick={() => markRead(unread.map((notice) => notice.id))} disabled={unread.length === 0}>Mark all read</button>}
      >
        {notices.length === 0 ? (
          <Empty>No bill or balance alerts right now.</Empty>
        ) : (
          <Table head={['Priority', 'Alert', 'Detail', 'Date', 'State', '']}>
            {notices.map((notice) => (
              <tr key={notice.id}>
                <td><Badge tone={tone(notice.severity)}>{notice.severity}</Badge></td>
                <td><strong>{notice.title}</strong></td>
                <td className="muted">{notice.detail}</td>
                <td className="muted nowrap">{dateUk(notice.date)}</td>
                <td>{read[notice.id] ? <span className="muted small">Read {dateTimeUk(read[notice.id])}</span> : <Badge tone="amber">Unread</Badge>}</td>
                <td className="nowrap">
                  <button className="btn ghost sm" onClick={() => go(notice.view)}>Open</button>{' '}
                  {!read[notice.id] && <button className="btn ghost sm" onClick={() => markRead([notice.id])}>Mark read</button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Email reminders" sub="A daily digest of the same bill and expiry alerts. Delivery stays off until a server-side provider key is configured; this budget never stores that key.">
        <div className="form-grid" style={{ padding: 16 }}>
          <label className="field">
            <span>Email address</span>
            <input className="input" type="email" value={prefs.email} onChange={(e) => setPrefs({ ...prefs, email: e.target.value })} placeholder="you@example.com" />
            <small>The address the digest is sent to; it stays in this budget and its backups.</small>
          </label>
          <label className="field">
            <span>Daily digest time</span>
            <input className="input" type="time" value={prefs.digestTime} onChange={(e) => setPrefs({ ...prefs, digestTime: e.target.value })} />
            <small>The server job that reads this preference runs at 07:00 by default.</small>
          </label>
          <div className="field">
            <span>Include</span>
            <div style={{ display: 'grid', gap: 6 }}>
              <label><input type="checkbox" checked={prefs.bills} onChange={(e) => setPrefs({ ...prefs, bills: e.target.checked })} /> Bill reminders</label>
              <label><input type="checkbox" checked={prefs.expiries} onChange={(e) => setPrefs({ ...prefs, expiries: e.target.checked })} /> Expiry reminders</label>
              <label><input type="checkbox" checked={prefs.enabled} onChange={(e) => setPrefs({ ...prefs, enabled: e.target.checked })} /> Enable email reminders</label>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn primary" onClick={savePrefs}>Save preferences</button>
          </div>
        </div>
        <div className="notice warn" style={{ margin: 16 }}>
          <strong>Not yet delivering.</strong> The app builds and stores the preferences and the digest, but no email is sent until the owner sets the server key, verifies a sender and adds the processor to the privacy notice. In-app alerts work now.
        </div>
      </Section>
    </>
  );
}
