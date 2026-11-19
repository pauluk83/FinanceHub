import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Card, Empty, Section, Table } from '../components';
import { buildDataHealth, type HealthCheck } from '../../../core/dataHealth';
import { applyHealthFixPlan, buildHealthFixPlan, type HealthFixPlan } from '../../../core/dataHealthFixes';
import { billSheetsFor } from '../billSheets';
import { lastBackupExportedAt, latestRestorePointAt } from '../backupStore';
import { buildSupportBundle } from '../supportBundle';
import { crashSummary } from '../crashJournal';
import { APP_CHANGELOG } from '../appChangelog.generated';
import { download, todayIso } from '../format';

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

export function DataHealthView({ ds, engine, go, notify, update, syncConflicts, syncHealth, userId }: ViewProps) {
  const sheets = billSheetsFor(ds);
  const [fixPreview, setFixPreview] = useState<HealthFixPlan | null>(null);
  const fixPlan = buildHealthFixPlan(ds, { sheets });
  const report = buildDataHealth(ds, engine, {
    sheets,
    syncConflicts: syncConflicts.length,
    sync: syncHealth,
    backup: {
      lastExportedAt: lastBackupExportedAt(userId),
      lastRestorePointAt: latestRestorePointAt(userId),
      now: new Date().toISOString(),
    },
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

  const applyFixes = () => {
    const count = fixPreview?.changeCount ?? 0;
    update((draft) => { applyHealthFixPlan(draft, { sheets: billSheetsFor(draft) }); });
    setFixPreview(null);
    notify(count ? `Applied ${count} data-health fix${count === 1 ? '' : 'es'}` : 'Nothing left to fix');
  };

  const downloadSupportBundle = () => {
    const bundle = buildSupportBundle({
      ds,
      report,
      app: { version: APP_CHANGELOG.version, buildId: APP_CHANGELOG.buildId, builtAt: APP_CHANGELOG.builtAt },
      conflicts: syncConflicts.length,
      crashes: crashSummary(),
      backup: {
        lastExportedAt: lastBackupExportedAt(userId),
        lastRestorePointAt: latestRestorePointAt(userId),
      },
      runtime: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        online: navigator.onLine,
      },
    });
    download(`financehub-support-${todayIso()}.json`, JSON.stringify(bundle, null, 2), 'application/json');
    notify('Support bundle downloaded — no names, amounts or credentials included');
  };

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
          <div className="muted">The report only reads the budget; every one-click fix is previewed first.</div>
          <button className="btn" type="button" onClick={downloadSupportBundle}>Download support bundle</button>
        </div>
      </section>

      <div className={`notice ${noticeTone}`} role="status">
        <div>
          <strong>{findings.length === 0 ? 'No integrity issues found.' : `${findings.length} area${findings.length === 1 ? '' : 's'} to review.`}</strong>
          <span>The checks themselves change nothing. Repair dead records with One-click fixes below, or open the linked screen to change live data; this report recalculates from the budget each time it opens.</span>
        </div>
      </div>

      <div className="kpi-grid">
        <Card title="Accounts checked" value={String(report.stats.accounts)} sub={`${report.stats.people} people · ${report.stats.cards} cards`} />
        <Card title="Bills checked" value={String(report.stats.bills)} sub={`${report.stats.providers} provider ledgers`} />
        <Card title="Locked months" value={String(report.stats.lockedMonths)} sub="Snapshots compared with the live balances" />
      </div>

      <Section
        title="One-click fixes"
        sub="Deterministic repairs for dead records the checks below report. Every change is listed before it applies, and the save records a budget changelog entry and per-record audit like any other edit."
        actions={<Badge tone={fixPlan.changeCount ? 'blue' : 'neutral'}>{fixPlan.changeCount ? `${fixPlan.changeCount} available` : 'Nothing to fix'}</Badge>}
      >
        {fixPlan.changeCount === 0 ? (
          <Empty>No dead records found. A bill change with no bill, a link sheet that no longer exists or a generated row for a deleted bill would appear here.</Empty>
        ) : fixPreview ? (
          <>
            <Table head={['Fix', 'Record', 'Before', 'After']}>
              {fixPreview.fixes.flatMap((fix) => fix.changes.map((change, index) => (
                <tr key={`${fix.id}-${index}`}>
                  <td>{index === 0 ? <strong>{fix.title}</strong> : <span className="muted small">{fix.title}</span>}</td>
                  <td className="muted">{change.label}</td>
                  <td className="muted small">{change.before}</td>
                  <td>{change.after}</td>
                </tr>
              )))}
            </Table>
            <div className="toolbar" style={{ borderBottom: 0 }}>
              <span className="muted small">Nothing outside this list is touched. Cancel leaves the budget exactly as it is.</span>
              <div className="toolbar-spacer" />
              <button className="btn ghost sm" type="button" onClick={() => setFixPreview(null)}>Cancel</button>
              <button className="btn primary" type="button" onClick={applyFixes}>Apply {fixPreview.changeCount} change{fixPreview.changeCount === 1 ? '' : 's'}</button>
            </div>
            {fixPreview.fixes.map((fix) => (
              <div key={`note-${fix.id}`} className="muted small" style={{ padding: '0 16px 12px' }}>{fix.title}: {fix.summary}</div>
            ))}
          </>
        ) : (
          <div className="toolbar" style={{ borderBottom: 0 }}>
            <span className="muted small">{fixPlan.fixes.map((fix) => `${fix.title} (${fix.changes.length})`).join(' · ')}</span>
            <div className="toolbar-spacer" />
            <button className="btn" type="button" onClick={() => setFixPreview(buildHealthFixPlan(ds, { sheets }))}>Preview {fixPlan.changeCount} change{fixPlan.changeCount === 1 ? '' : 's'}</button>
          </div>
        )}
      </Section>

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
