import { useMemo, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Bar, Empty, Section, Table } from '../components';
import { download, gbp, MONTH_LONG, parseMoney, pct, toCsv } from '../format';
import { buildExcelWorkbook, buildPrintReport } from '../../../core/exporters';
import { categoryTargets, spendReport, targetProgress } from '../../../core/reports';
import { printHtml } from '../print';
import { normaliseCategory } from '../../../core/categories';

/**
 * Category and tag reporting plus report-only targets (R5/R16). Every figure
 * comes from ordinary expense rows; targets are stored separately and never
 * reach the calculation engine.
 */
export function Reports({ ds, year, month, update, notify }: ViewProps) {
  const [wholeYear, setWholeYear] = useState(false);
  const periodMonth = wholeYear ? null : month;
  const report = useMemo(() => spendReport(ds, year, periodMonth), [ds, year, periodMonth]);
  const targets = useMemo(() => targetProgress(ds, year, periodMonth), [ds, year, periodMonth]);
  const targetMap = useMemo(() => new Map(targets.map((entry) => [entry.category, entry])), [targets]);
  const savedTargets = categoryTargets(ds);
  const periodLabel = wholeYear ? `${year}` : `${MONTH_LONG[month - 1]} ${year}`;
  const top = report.categories[0];

  const saveTarget = (category: string, value: string) => {
    const name = normaliseCategory(category);
    if (!name) return;
    const pence = parseMoney(value);
    update((d) => {
      const next = { ...(d.categoryTargets ?? {}) };
      if (pence > 0) next[name] = pence;
      else delete next[name];
      d.categoryTargets = next;
    });
    notify(pence > 0 ? `Target for ${name} set to ${gbp(pence)} a month` : `Target for ${name} removed`);
  };

  const exportCsv = () => {
    download('financehub-spending.csv', toCsv([
      ['Category', 'Transactions', 'Spent', 'Share', 'Monthly target'],
      ...report.categories.map((line) => [
        line.label,
        line.count,
        (line.amountPence / 100).toFixed(2),
        `${(line.share * 100).toFixed(1)}%`,
        savedTargets[line.label] ? (savedTargets[line.label] / 100).toFixed(2) : '',
      ]),
      [],
      ['Tag', 'Transactions', 'Spent'],
      ...report.tags.map((line) => [line.label, line.count, (line.amountPence / 100).toFixed(2)]),
    ]));
    notify(`Exported ${report.categories.length} categories and ${report.tags.length} tags`);
  };

  const exportExcel = () => {
    download('financehub-spending.xls', buildExcelWorkbook([
      {
        name: 'Categories',
        rows: [
          ['Category', 'Transactions', 'Spent (£)', 'Share', 'Monthly target (£)'],
          ...report.categories.map((line) => [
            line.label,
            line.count,
            line.amountPence / 100,
            Math.round(line.share * 1000) / 1000,
            savedTargets[line.label] ? savedTargets[line.label] / 100 : '',
          ]),
        ],
      },
      {
        name: 'Tags',
        rows: [['Tag', 'Transactions', 'Spent (£)'], ...report.tags.map((line) => [line.label, line.count, line.amountPence / 100])],
      },
      {
        name: 'Monthly trend',
        rows: [['Month', 'Spent (£)'], ...report.months.map((entry) => [entry.label, entry.amountPence / 100])],
      },
    ]), 'application/vnd.ms-excel');
    notify('Exported the spending report to Excel');
  };

  const print = () => {
    const html = buildPrintReport({
      title: 'FinanceHub spending report',
      subtitle: `${periodLabel} · categorised expenses only`,
      summary: [
        ['Spent', gbp(report.totalPence)],
        ['Top category', top ? `${top.label} ${gbp(top.amountPence)}` : '—'],
        ['Categories', String(report.categories.length)],
        ['Transactions', String(report.categories.reduce((sum, line) => sum + line.count, 0))],
      ],
      head: ['Category', 'Transactions', 'Spent', 'Share', 'Monthly target'],
      rows: report.categories.map((line) => [
        line.label,
        String(line.count),
        gbp(line.amountPence),
        pct(line.share),
        savedTargets[line.label] ? gbp(savedTargets[line.label]) : '—',
      ]),
    });
    if (!printHtml(html)) notify('The print view could not be opened');
  };

  return (
    <>
      <Section
        title="Spending report"
        sub={`${periodLabel} · ordinary expense rows only; transfers and generated bill rows are excluded`}
        actions={
          <div className="page-actions">
            <button className={`btn ${wholeYear ? 'primary' : 'ghost'}`} onClick={() => setWholeYear((value) => !value)}>
              {wholeYear ? 'Show this month' : 'Show whole year'}
            </button>
            <button className="btn" onClick={exportCsv}>Export CSV</button>
            <button className="btn" onClick={exportExcel}>Export Excel</button>
            <button className="btn" onClick={print}>Print / Save PDF</button>
          </div>
        }
      >
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="metric"><span>Spent</span><strong>{gbp(report.totalPence)}</strong></div>
          <div className="metric"><span>Top category</span><strong>{top ? top.label : '—'}</strong></div>
          <div className="metric"><span>Categories used</span><strong>{report.categories.length}</strong></div>
          <div className="metric"><span>Tagged spend</span><strong>{gbp(report.tags.reduce((sum, line) => sum + line.amountPence, 0))}</strong></div>
        </div>

        <Table head={['Category', 'Rows', 'Spent', 'Share', 'Monthly target', 'Progress', 'Remaining']} numHead={[1, 2, 3, 4, 6]}>
          {report.categories.map((line) => {
            const target = targetMap.get(line.label);
            return (
              <tr key={line.label}>
                <td><strong>{line.label}</strong></td>
                <td className="num">{line.count}</td>
                <td className="num">{gbp(line.amountPence)}</td>
                <td className="num">{pct(line.share)}</td>
                <td className="num">
                  <input
                    className="table-input"
                    inputMode="decimal"
                    aria-label={`Monthly target for ${line.label}`}
                    defaultValue={savedTargets[line.label] ? (savedTargets[line.label] / 100).toFixed(2) : ''}
                    placeholder="Set target"
                    onBlur={(event) => {
                      const current = savedTargets[line.label] ?? 0;
                      const next = parseMoney(event.target.value);
                      if (current !== next) saveTarget(line.label, event.target.value);
                    }}
                  />
                </td>
                <td style={{ minWidth: 120 }}>
                  {target ? (
                    <>
                      <Bar value={target.ratio} tone={target.ratio > 1 ? 'red' : target.ratio > 0.85 ? 'amber' : 'accent'} />
                      <div className="muted small">{target.targetPence ? `${pct(target.ratio, 0)} of target` : 'No target'}</div>
                    </>
                  ) : <span className="muted small">—</span>}
                </td>
                <td className="num">
                  {target ? (
                    <span className={target.remainingPence < 0 ? 'amount neg' : ''}>{gbp(target.remainingPence)}</span>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </Table>
        {report.categories.length === 0 && <Empty>No categorised expenses in this period.</Empty>}
        <div className="notice info" style={{ margin: 16 }}>
          Targets are report-only: they never change a balance, a total or a locked month. A target is stored as a monthly amount;
          the yearly view compares twelve months of spend against twelve monthly targets. Entries are saved when you leave the field.
        </div>
      </Section>

      <Section title="Targets" sub="Categories with a monthly target, whether or not they have spend this period">
        {targets.length === 0 ? (
          <Empty>No targets yet. Set a monthly figure above to start tracking one.</Empty>
        ) : (
          <Table head={['Category', 'Target', 'Spent', 'Remaining', 'State', '']} numHead={[1, 2, 3]}>
            {targets.map((entry) => (
              <tr key={entry.category}>
                <td><strong>{entry.category}</strong></td>
                <td className="num">{gbp(entry.targetPence)}</td>
                <td className="num">{gbp(entry.spentPence)}</td>
                <td className="num">{gbp(entry.remainingPence)}</td>
                <td>
                  {entry.ratio > 1
                    ? <Badge tone="red">Over by {gbp(entry.spentPence - entry.targetPence)}</Badge>
                    : entry.ratio > 0.85
                      ? <Badge tone="amber">Close to target</Badge>
                      : <Badge tone="green">On track</Badge>}
                </td>
                <td><button className="btn ghost sm" onClick={() => saveTarget(entry.category, '')}>Remove</button></td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Tags" sub="Free-form tags carry no money of their own; spend can appear under more than one tag">
        {report.tags.length === 0 ? (
          <Empty>No tagged expenses in this period.</Empty>
        ) : (
          <Table head={['Tag', 'Rows', 'Spent', 'Share of tagged spend']} numHead={[1, 2, 3]}>
            {report.tags.map((line) => (
              <tr key={line.label}>
                <td><strong>{line.label}</strong></td>
                <td className="num">{line.count}</td>
                <td className="num">{gbp(line.amountPence)}</td>
                <td className="num">{pct(line.share)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Twelve-month trend" sub="Categorised spending by month, ending with the selected period">
        <Table head={['Month', 'Spent']} numHead={[1]}>
          {report.months.map((entry) => (
            <tr key={entry.key}>
              <td>{entry.label}</td>
              <td className="num">{gbp(entry.amountPence)}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
