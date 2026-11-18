import { useMemo, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Section, Table } from '../components';
import { download, MONTH_LONG } from '../format';
import { buildExcelWorkbook, buildPrintReport } from '../../../core/exporters';
import { benefitsPack, monthClosePack, providerDisputePack, type EvidencePack, type EvidencePackId } from '../../../core/evidence';
import { printHtml } from '../print';

const PACKS: { id: EvidencePackId; label: string; description: string }[] = [
  { id: 'provider-dispute', label: 'Provider dispute', description: 'Statement, payments, running balance and contract terms for one provider year.' },
  { id: 'month-close', label: 'Month close', description: 'Balances, bills and reconciliation evidence for a locked month, or live figures for an open one.' },
  { id: 'benefits', label: 'Benefits', description: 'PIP and Universal Credit schedule against the income recorded in the ledger.' },
];

/**
 * Printable and Excel evidence packs (R14). Every pack is a projection of the
 * current ledger; opening this screen writes nothing.
 */
export function Evidence({ ds, engine, year, month, notify }: ViewProps) {
  const providerKeys = Object.keys(ds.providers ?? {});
  const [packId, setPackId] = useState<EvidencePackId>('month-close');
  const [providerKey, setProviderKey] = useState(providerKeys[0] ?? '');
  const [packYear, setPackYear] = useState(year);
  const [packMonth, setPackMonth] = useState(month);

  const pack: EvidencePack | null = useMemo(() => {
    if (packId === 'provider-dispute') return providerDisputePack(ds, providerKey, packYear);
    if (packId === 'benefits') return benefitsPack(ds, packYear);
    return monthClosePack(ds, engine, packYear, packMonth);
  }, [ds, engine, packId, providerKey, packYear, packMonth]);

  const exportExcel = () => {
    if (!pack) return;
    download(`financehub-${pack.id}-${packYear}.xls`, buildExcelWorkbook(pack.sheets), 'application/vnd.ms-excel');
    notify(`${pack.title} exported to Excel`);
  };

  const print = () => {
    if (!pack) return;
    if (!printHtml(buildPrintReport(pack.print))) notify('The print view could not be opened');
  };

  return (
    <>
      <Section
        title="Evidence packs"
        sub="Printable and spreadsheet evidence built from this budget. No credentials or full account numbers are included."
        actions={<Badge tone="blue">{pack ? pack.sheets.length : 0} sheets</Badge>}
      >
        <div className="tabs">
          {PACKS.map((entry) => (
            <button key={entry.id} className={`tab ${packId === entry.id ? 'active' : ''}`} onClick={() => setPackId(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
        <p className="muted small" style={{ margin: '0 16px' }}>{PACKS.find((entry) => entry.id === packId)?.description}</p>
        <div className="inline-form">
          {packId === 'provider-dispute' && (
            <label className="field">
              <span>Provider</span>
              <select className="select" value={providerKey} onChange={(event) => setProviderKey(event.target.value)}>
                {providerKeys.length === 0 && <option value="">No provider ledgers</option>}
                {providerKeys.map((key) => (
                  <option key={key} value={key}>{String(ds.providers?.[key]?.displayName ?? ds.providers?.[key]?.name ?? key)}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Year</span>
            <select className="select" value={packYear} onChange={(event) => setPackYear(Number(event.target.value))}>
              {[2026, 2027, 2028].map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          {packId === 'month-close' && (
            <label className="field">
              <span>Month</span>
              <select className="select" value={packMonth} onChange={(event) => setPackMonth(Number(event.target.value))}>
                {MONTH_LONG.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
              </select>
            </label>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'end' }}>
            <button className="btn" onClick={print} disabled={!pack}>Print / Save PDF</button>
            <button className="btn primary" onClick={exportExcel} disabled={!pack}>Export Excel</button>
          </div>
        </div>
      </Section>

      {!pack ? (
        <Section title="Nothing to pack yet" sub="This selection has no statement rows or provider data.">
          <Empty>Choose another provider or year. A pack is only produced from real stored rows, never an empty template.</Empty>
        </Section>
      ) : (
        <>
          <Section title={pack.title} sub={pack.subtitle}>
            <Table head={['Field', 'Value']} numHead={[]}>
              {pack.summary.map(([label, value]) => (
                <tr key={label}>
                  <td><strong>{label}</strong></td>
                  <td className="muted">{value}</td>
                </tr>
              ))}
            </Table>
          </Section>

          {pack.sheets.slice(1).map((sheet) => (
            <div key={sheet.name}>
            <Section title={sheet.name} sub={`${Math.max(0, sheet.rows.length - 1)} rows · exported with the workbook`}>
              <Table head={sheet.rows[0]?.map((cell) => String(cell ?? '')) ?? []}>
                {sheet.rows.slice(1, 51).map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className={cellIndex > 0 ? 'num' : undefined}>{String(cell ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </Table>
              {sheet.rows.length > 51 && (
                <div className="muted small" style={{ padding: '8px 16px' }}>
                  Showing the first 50 of {sheet.rows.length - 1} rows; the download contains all of them.
                </div>
              )}
            </Section>
            </div>
          ))}

          <Section title="What is included" sub="Deliberate limits">
            <div className="list">
              <div className="list-row"><div className="sub">Amounts and balances come from the same ledger the app displays; nothing is recalculated for the pack.</div></div>
              <div className="list-row"><div className="sub">Provider credentials, tokens, vault fields and full account numbers are never read or exported.</div></div>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
