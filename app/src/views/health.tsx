import type { ViewProps } from '../types';
import { Badge, Card, Empty, Section, Table } from '../components';
import { buildDataHealth, type HealthCheck } from '../../../core/dataHealth';
import { billSheetsFor } from '../billSheets';

function severityLabel(severity: HealthCheck['severity']): string {
  if (severity === 'critical') return 'Critical';
  if (severity === 'warning') return 'Warning';
  if (severity === 'info') return 'Note';
  return 'Passed';
}

function severityTone(severity: HealthCheck['severity']): string {
  if (severity === 'critical') return 'red';
  if (severity === 'warning') return 'amber';
  if (severity === 'info') return 'neutral';
  return 'green';
}

export function DataHealthView({ ds, engine, go, syncConflicts }: ViewProps) {
  const report = buildDataHealth(ds, engine, {
    sheets: billSheetsFor(ds),
    syncConflicts: syncConflicts.length,
  });
  const findings = report.checks.filter((check) => check.severity !== 'ok');
  const statusLabel = report.status === 'critical'
    ? 'Action needed'
    : report.status === 'warning'
      ? 'Review needed'
      : report.counts.info > 0
        ? 'Healthy with notes'
        : 'Healthy';
  const statusTone = report.status === 'critical' ? 'red' : report.status === 'warning' ? 'amber' : 'green';
  const noticeTone = report.status === 'critical' ? 'danger' : report.status === 'warning' ? 'warn' : 'info';

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <span className="eyebrow">Read-only integrity centre</span>
          <h2>Data health</h2>
          <div className="hero-figures">
            <div className="hero-figure"><span>Status</span><strong><Badge tone={statusTone}>{statusLabel}</Badge></strong></div>
            <div className="hero-figure"><span>Critical</span><strong>{report.counts.critical}</strong></div>
            <div className="hero-figure"><span>Warnings</span><strong>{report.counts.warning}</strong></div>
            <div className="hero-figure"><span>Notes</span><strong>{report.counts.info}</strong></div>
          </div>
        </div>
        <div className="hero-side">
          <div className="saved-meta">
            <span>Checks run <strong>{report.checks.length}</strong></span>
            <span>Transactions <strong>{report.stats.transactions}</strong></span>
            <span>Locked months <strong>{report.stats.lockedMonths}</strong></span>
          </div>
          <div className="muted">This page only reads the loaded budget.</div>
        </div>
      </section>

      <div className={`notice ${noticeTone}`} role="status">
        <div>
          <strong>{findings.length === 0 ? 'No integrity issues found.' : `${findings.length} area${findings.length === 1 ? '' : 's'} to review.`}</strong>
          <span>Nothing is deleted, merged or rewritten. Open the linked screen to make a change; this report recalculates from the budget each time it opens.</span>
        </div>
      </div>

      <div className="kpi-grid">
        <Card title="Accounts checked" value={String(report.stats.accounts)} sub={`${report.stats.people} people · ${report.stats.cards} cards`} />
        <Card title="Bills checked" value={String(report.stats.bills)} sub={`${report.stats.providers} provider ledgers`} />
        <Card title="Locked months" value={String(report.stats.lockedMonths)} sub="Snapshots compared with the live balances" />
      </div>

      <Section
        title="Integrity findings"
        sub="Read-only checks across accounts, imports, provider year blocks, linked bills, locked months and sync."
      >
        {findings.length === 0 ? (
          <Empty>All {report.checks.length} checks passed. There is nothing to review.</Empty>
        ) : (
          <Table head={['Check', 'Level', 'What to review', 'Open']}>
            {findings.map((check) => (
              <tr key={check.id}>
                <td><strong>{check.title}</strong></td>
                <td><Badge tone={severityTone(check.severity)}>{severityLabel(check.severity)}</Badge></td>
                <td>
                  <div>{check.summary}</div>
                  {check.items.length > 0 && (
                    <ul className="muted" style={{ margin: '8px 0 0 16px', padding: 0 }}>
                      {check.items.slice(0, 8).map((item, index) => <li key={`${check.id}-${index}`}>{item}</li>)}
                      {check.items.length > 8 && <li>…and {check.items.length - 8} more.</li>}
                    </ul>
                  )}
                </td>
                <td>
                  {check.action
                    ? <button className="btn ghost sm" type="button" onClick={() => go(check.action!.view)}>{check.action.label}</button>
                    : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title={`Checks run — ${report.checks.length}`}
        sub="A passing check means the loaded data agrees with the rule; it does not change anything."
      >
        <Table head={['Area', 'Result', 'What it looks at']}>
          {report.checks.map((check) => (
            <tr key={`summary-${check.id}`}>
              <td><strong>{check.title}</strong></td>
              <td><Badge tone={severityTone(check.severity)}>{severityLabel(check.severity)}</Badge></td>
              <td className="muted">{check.summary}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
