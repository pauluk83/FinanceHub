import type { ViewProps } from '../types';
import { Badge, Empty, Section, Table } from '../components';
import { dateUk, dateTimeUk } from '../format';
import { buildBudgetNotifications, type NotificationSeverity } from '../../../core/notifications';

function tone(severity: NotificationSeverity): string {
  return severity === 'critical' ? 'red' : severity === 'warning' ? 'amber' : 'blue';
}

export function NotificationsView({ ds, engine, update, go, notify }: ViewProps) {
  const notices = buildBudgetNotifications(ds, engine);
  const read = ds.settings.notificationReads ?? {};
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
            <div className="hero-figure"><span>Balances</span><strong>{notices.filter((notice) => notice.kind !== 'bill').length}</strong></div>
          </div>
        </div>
        <div className="hero-side">
          <Badge tone={unread.length ? 'amber' : 'green'}>{unread.length ? 'Review needed' : 'All read'}</Badge>
          <div className="muted">Derived from the budget as of {dateUk(ds.settings.asOfDate)}.</div>
          <div className="muted small">Alerts clear when the underlying bill is paid or the balance changes.</div>
        </div>
      </section>

      <Section
        title="Current alerts"
        sub="Bills due in the next seven days, accounts below zero or close to their target floor, and cards over 80% used."
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
    </>
  );
}
