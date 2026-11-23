import { useEffect, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Section, Table } from '../components';
import { dateUk, dateTimeUk } from '../format';
import { buildBudgetNotifications, type NotificationSeverity } from '../../../core/notifications';
import { reminderPreferences } from '../../../core/reminders';
import { buildMonthDigest, moneyText } from '../../../core/digest';
import { disablePush, enablePush, pushState, pushSupported, sendTestPush, type PushState } from '../push';

function tone(severity: NotificationSeverity): string {
  return severity === 'critical' ? 'red' : severity === 'warning' ? 'amber' : 'blue';
}

export function NotificationsView({ ds, engine, update, go, notify }: ViewProps) {
  const notices = buildBudgetNotifications(ds, engine);
  const read = ds.settings.notificationReads ?? {};
  const initialPrefs = reminderPreferences(ds);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [push, setPush] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const refreshPush = () => {
    if (!pushSupported()) {
      setPush('unsupported');
      return;
    }
    void pushState().then(setPush).catch(() => setPush('unsupported'));
  };

  useEffect(() => {
    refreshPush();
  }, []);

  const runPush = (action: () => Promise<string>) => {
    setPushBusy(true);
    void action()
      .then((message) => notify(message))
      .catch((error: unknown) => notify(error instanceof Error ? error.message : 'Push did not change'))
      .finally(() => {
        setPushBusy(false);
        refreshPush();
      });
  };
  const digestYear = ds.settings.targetYear;
  const [digestMonth, setDigestMonth] = useState(() => Number(ds.settings.asOfDate.slice(5, 7)) || 1);
  const digest = buildMonthDigest(ds, engine, digestYear, digestMonth);

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
  const allSelected = notices.length > 0 && notices.every((notice) => selected.includes(notice.id));

  const toggleSelected = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  };

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

  const deleteSelected = () => {
    if (!selected.length) return;
    const ids = selected;
    update((dataset) => {
      const dismissed = { ...(dataset.settings.notificationDismissed ?? {}) };
      const readState = { ...(dataset.settings.notificationReads ?? {}) };
      const deletedAt = new Date().toISOString();
      for (const id of ids) {
        dismissed[id] = deletedAt;
        delete readState[id];
      }
      dataset.settings.notificationDismissed = dismissed;
      dataset.settings.notificationReads = readState;
    });
    setSelected([]);
    notify(ids.length === 1 ? 'Notification deleted' : `${ids.length} notifications deleted`);
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
            <div className="hero-figure"><span>Targets</span><strong>{notices.filter((notice) => notice.kind === 'target').length}</strong></div>
          </div>
        </div>
        <div className="hero-side">
          <Badge tone={unread.length ? 'amber' : 'green'}>{unread.length ? 'Review needed' : 'All read'}</Badge>
          <div className="muted">Derived from the budget as of {dateUk(ds.settings.asOfDate)}.</div>
          <div className="muted small">Alerts clear when the underlying bill is paid, the expiry passes or the balance changes. Deleting an alert hides it and drops it from the bell without changing any budget data.</div>
        </div>
      </section>

      <Section
        title="Current alerts"
        sub="Bills and expiries due in the next seven days, accounts below zero or close to their target floor, cards over 80% used, and category targets at 80%, over target, or on pace to overspend."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn ghost sm" onClick={() => markRead(unread.map((notice) => notice.id))} disabled={unread.length === 0}>Mark all read</button>
            <button className="btn danger sm" onClick={deleteSelected} disabled={selected.length === 0}>
              Delete selected{selected.length ? ` (${selected.length})` : ''}
            </button>
          </div>
        }
      >
        {notices.length === 0 ? (
          <Empty>No bill, balance or target alerts right now.</Empty>
        ) : (
          <Table head={[
            <input
              key="select-all"
              type="checkbox"
              aria-label={allSelected ? 'Clear notification selection' : 'Select all notifications'}
              title={allSelected ? 'Clear selection' : 'Select all notifications'}
              checked={allSelected}
              onChange={() => setSelected(allSelected ? [] : notices.map((notice) => notice.id))}
            />,
            'Priority', 'Alert', 'Detail', 'Date', 'State', '',
          ]}>
            {notices.map((notice) => (
              <tr key={notice.id}>
                <td style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${notice.title}`}
                    checked={selected.includes(notice.id)}
                    onChange={() => toggleSelected(notice.id)}
                  />
                </td>
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

      <Section
        title="What changed"
        sub="A month against the one before it: income, expenses, bills, the account balance and what people owe, plus every budget change recorded that month."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="select" aria-label="Digest month" value={digestMonth} onChange={(event) => setDigestMonth(Number(event.target.value))}>
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((name, index) => (
                <option key={name} value={index + 1}>{name} {digestYear}</option>
              ))}
            </select>
            <Badge tone={digest.locked ? 'green' : 'neutral'}>{digest.locked ? 'Locked' : 'Open month'}</Badge>
          </div>
        }
      >
        <div style={{ padding: '12px 16px' }}>
          <div className="muted">{digest.summary}</div>
        </div>
        <Table head={['Figure', digest.previousLabel, digest.label, 'Change']}>
          {digest.changes.map((entry) => (
            <tr key={entry.id}>
              <td>
                <strong>{entry.label}</strong>
                {entry.note && <div className="muted small">{entry.note}</div>}
              </td>
              <td className="num muted">{entry.before}</td>
              <td className="num">{entry.after}</td>
              <td className="num nowrap">
                {entry.direction === 'same'
                  ? <span className="muted">No change</span>
                  : <span style={{ color: entry.direction === 'up' ? 'var(--accent)' : 'var(--danger)' }}>
                    {entry.direction === 'up' ? '▲' : '▼'} {moneyText(Math.abs(entry.deltaPence))}
                  </span>}
              </td>
            </tr>
          ))}
        </Table>
        <div style={{ padding: '12px 16px 16px' }}>
          <strong>Budget changes recorded in {digest.label}</strong>
          {digest.events.length === 0 ? (
            <div className="muted small" style={{ marginTop: 6 }}>No budget changes were recorded in this month.</div>
          ) : (
            <div className="list" style={{ marginTop: 8 }}>
              {digest.events.map((event, index) => (
                <div className="list-row" key={`${event.date}-${index}`}>
                  <div style={{ minWidth: 0 }}>
                    <div className="title">{event.title}</div>
                    <div className="sub">{event.description}</div>
                  </div>
                  <span className="muted small nowrap">{dateUk(event.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Email reminders" sub="A daily digest of the same bill and expiry alerts, built here and posted to Resend by the reminder job. This budget never stores the sending key.">
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
        <div className="notice" style={{ margin: 16 }}>
          <strong>Sent by the reminder job.</strong> <code>scripts/send-reminders.mjs</code> builds this digest and posts it to Resend with
          <code>RESEND_API_KEY</code> and <code>RESEND_FROM</code> in its own environment. Until that daily task runs, nothing is emailed;
          the alerts above work now, and an address on the suppression list is skipped.
        </div>
      </Section>

      <Section
        title="Push notifications"
        sub="A lock-screen alert on this phone or browser for a bill due, an account below zero, a card over 80% used, or a category target warning. It is the same alert the list above shows, pushed once."
        actions={
          <Badge tone={push === 'enabled' ? 'green' : push === 'blocked' ? 'red' : 'amber'}>
            {push === 'enabled' ? 'On for this device'
              : push === 'blocked' ? 'Blocked by the browser'
                : push === 'signed-out' ? 'Sign in first'
                  : push === 'unsupported' ? 'Not available here'
                    : 'Off on this device'}
          </Badge>
        }
      >
        <div style={{ padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn primary"
            disabled={pushBusy || push === 'unsupported' || push === 'signed-out' || push === 'enabled'}
            onClick={() => runPush(enablePush)}
          >
            Turn on push
          </button>
          <button className="btn ghost" disabled={pushBusy || push !== 'enabled'} onClick={() => runPush(sendTestPush)}>
            Send a test push
          </button>
          <button className="btn ghost" disabled={pushBusy || push !== 'enabled'} onClick={() => runPush(disablePush)}>
            Turn off on this device
          </button>
        </div>
        <div className="notice" style={{ margin: 16 }}>
          {push === 'unsupported' ? (
            <>
              <strong>Hosted app only.</strong> Push needs the FinanceHub web app in a browser that allows notifications;
              the Windows app keeps its in-app bell.
            </>
          ) : (
            <>
              <strong>No budget figure leaves the device for this.</strong> The browser subscription is stored against your
              account, and the FinanceHub sender encrypts each alert for that device. Delivery stays off until the sender is
              deployed with its VAPID secret — see <code>docs/PUSH.md</code>.
            </>
          )}
        </div>
      </Section>
    </>
  );
}
