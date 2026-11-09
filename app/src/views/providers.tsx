import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ViewProps } from '../types';
import { Empty, Field, Section, Table } from '../components';
import { dateUk, download, gbp, MONTH_LONG, parseMoney, toCsv } from '../format';
import { appendRow, balanceAsOf, baselineFor, clearRowOrder, hasManualOrder, recalculate, reorderRows, sortRows, type LedgerConfig } from '../providerLedger';
import { recalculateTelco, telcoRemainingMonths } from '../../../core/telco';
import { providerBilling } from '../providerSetup';
import { rowsForYear } from '../../../core/providerYears';
import type { VaultSecrets } from '../vault';

const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`;

/** A provider can carry its own uploaded logo; fall back to the bundled mark. */
const providerLogoSrc = (provider: any, fallback: string) =>
  typeof provider?.logoData === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/.test(provider.logoData)
    ? provider.logoData
    : asset(fallback);

const providerCustomLogo = (provider: any) =>
  typeof provider?.logoData === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/.test(provider.logoData)
    ? provider.logoData as string
    : undefined;

type AutoPayment = { bill: string; amountPence: number; dueDate: string };
type ContractTier = { label: string; amountPence: number };
type ProviderContract = {
  accountName?: string;
  accountNumber?: string;
  mobileNumber?: string;
  length?: string;
  remaining?: string;
  endDate?: string;
  tiers?: ContractTier[];
  contractAmountPence?: number;
  paymentsPence?: number;
  remainingPaymentsPence?: number;
};

const RENT_CONFIG: LedgerConfig = {
  rowsKey: 'entries',
  formula: 'amount',
  monthly: false,
  note: 'Edit or remove any rent line; balances recalculate in date order.',
  defaults: { date: '', ref: 'Rent Due', description: 'Rent Charge', amountPence: '0.00', matched: '' },
  columns: [
    { key: 'date', label: 'Date', edit: 'date' },
    { key: 'ref', label: 'Ref', edit: 'text' },
    { key: 'description', label: 'Description', edit: 'text', options: ['Rent Charge', 'Payment', 'Rent Free Week', 'Adjustment'] },
    { key: 'amountPence', label: 'Amount', money: true, edit: 'money' },
    { key: 'balancePence', label: 'Balance', money: true, edit: 'money' },
    { key: 'matched', label: 'Matched', edit: 'text', options: ['✓ Yes', 'No'] },
  ],
};

export const CONFIG: Record<string, LedgerConfig> = {
  water: {
    rowsKey: 'statement',
    formula: 'cashflow',
    monthly: true,
    note: 'Monthly plan; bill periods arrive quarterly. Balance = previous + payment − bill.',
    defaults: { month: 'Jan', billPeriod: '', billAmountPence: '0.00', paymentPence: '44.00' },
    columns: [
      { key: 'month', label: 'Month', edit: 'month' },
      { key: 'billPeriod', label: 'Bill period', edit: 'text' },
      { key: 'billAmountPence', label: 'Bill', money: true, edit: 'money' },
      { key: 'paymentPence', label: 'Payment', money: true, edit: 'money' },
      { key: 'balancePence', label: 'Balance', money: true, edit: 'money' },
    ],
  },
  ovo: {
    rowsKey: 'statement',
    formula: 'cashflow',
    monthly: true,
    note: 'Statement periods run 17th to 16th. Balance = previous + payment − bill.',
    defaults: { month: 'Jan', billPeriod: '', billAmountPence: '0.00', paymentPence: '109.00' },
    columns: [
      { key: 'month', label: 'Month', edit: 'month' },
      { key: 'billPeriod', label: 'Bill period', edit: 'text' },
      { key: 'billAmountPence', label: 'Bill', money: true, edit: 'money' },
      { key: 'paymentPence', label: 'Payment', money: true, edit: 'money' },
      { key: 'balancePence', label: 'Balance', money: true, edit: 'money' },
    ],
  },
  parkXmas: {
    rowsKey: 'statement',
    formula: 'savings',
    monthly: true,
    note: 'Savings plan; balance falls as payments are made and total paid accumulates.',
    defaults: { month: 'Jan', paymentPence: '50.00', status: 'Owed' },
    columns: [
      { key: 'month', label: 'Month', edit: 'month' },
      { key: 'paymentPence', label: 'Payment', money: true, edit: 'money' },
      { key: 'balancePence', label: 'Balance', money: true, edit: 'money' },
      { key: 'totalPaidPence', label: 'Total paid', money: true, edit: 'money' },
      { key: 'status', label: 'Status', edit: 'text' },
      { key: 'paid', label: 'Paid', edit: 'text', options: ['✓ Yes', 'No'] },
    ],
  },
  pureCremation: {
    rowsKey: 'statement',
    formula: 'savings',
    monthly: true,
    note: 'Starts in August 2026; earlier months are zero. Balance falls as payments are made.',
    defaults: { month: 'Aug', paymentPence: '106.66', status: 'Owed', paid: '' },
    columns: [
      { key: 'month', label: 'Month', edit: 'month' },
      { key: 'paymentPence', label: 'Payment', money: true, edit: 'money' },
      { key: 'balancePence', label: 'Balance', money: true, edit: 'money' },
      { key: 'totalPaidPence', label: 'Total paid', money: true, edit: 'money' },
      { key: 'status', label: 'Status', edit: 'text' },
      { key: 'paid', label: 'Paid', edit: 'text', options: ['✓ Yes', 'No'] },
    ],
  },
  o2: {
    rowsKey: 'statement',
    formula: 'telco',
    monthly: true,
    note: 'Contract amounts by month. Balance = previous + payment − bill.',
    defaults: { month: 'Jan', amountPence: '0.00', paymentPence: '0.00' },
    columns: [
      { key: 'month', label: 'Month', edit: 'month' },
      { key: 'amountPence', label: 'Bill', money: true, edit: 'money' },
      { key: 'paymentPence', label: 'Payment', money: true, edit: 'money' },
      { key: 'balancePence', label: 'Balance', money: true, edit: 'money' },
      { key: 'paid', label: 'Paid', edit: 'text', options: ['✓ Yes', 'No'] },
    ],
  },
  virgin: {
    rowsKey: 'statement',
    formula: 'telco',
    monthly: true,
    note: 'Contract amounts by month; £32.99 from Oct 2026. Balance = previous + payment − bill.',
    defaults: { month: 'Jan', amountPence: '0.00', paymentPence: '0.00' },
    columns: [
      { key: 'month', label: 'Month', edit: 'month' },
      { key: 'amountPence', label: 'Bill', money: true, edit: 'money' },
      { key: 'paymentPence', label: 'Payment', money: true, edit: 'money' },
      { key: 'balancePence', label: 'Balance', money: true, edit: 'money' },
      { key: 'paid', label: 'Paid', edit: 'text', options: ['✓ Yes', 'No'] },
    ],
  },
  councilTax: {
    rowsKey: 'entries',
    formula: 'amount',
    monthly: false,
    note: 'Direct debit on the 27th; charge rows carry the annual opening balance. Balances recalculate in date order.',
    defaults: { date: '', ref: 'Direct Debit', description: '', amountPence: '0.00' },
    columns: [
      { key: 'date', label: 'Date', edit: 'date' },
      { key: 'ref', label: 'Ref', edit: 'text' },
      { key: 'description', label: 'Description', edit: 'text' },
      { key: 'amountPence', label: 'Amount', money: true, edit: 'money' },
      { key: 'balancePence', label: 'Balance', money: true, edit: 'money' },
    ],
  },
};

const penceInput = (value: unknown) => (typeof value === 'number' ? (value / 100).toFixed(2) : '');
const withCurrentOption = (options: string[], value: unknown) => {
  const current = String(value ?? '');
  return current && !options.includes(current) ? [current, ...options] : options;
};
/** Row closest to the as-of date; ties go to the row already reached. */
function nearestDateRowIndex(rows: any[], asOfDate: string) {
  const target = Date.parse(asOfDate);
  if (!Number.isFinite(target)) return -1;
  let best = -1;
  let bestScore = Infinity;
  rows.forEach((row, index) => {
    const iso = String(row.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) return;
    const score = Math.abs(time - target) + (time > target ? 0.5 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/** Show a scheduled payment only when the provider has no actual payment for that month. */
function effectiveRowsFor(cfg: LedgerConfig, rows: any[], autoPayments?: Record<string, AutoPayment>, openingPence?: number) {
  if (!cfg.monthly) return rows;
  const hasOpening = rows.some((row) => row.opening === true);
  if (!autoPayments && !hasOpening) return rows;
  let changed = false;
  const display = rows.map((row) => {
    const auto = row.month && autoPayments ? autoPayments[row.month] : undefined;
    if (!auto || (Number(row.paymentPence) || 0) !== 0) return { ...row };
    changed = true;
    return { ...row, paymentPence: auto.amountPence };
  });
  if (!changed && !hasOpening) return rows;
  recalculate(cfg, display, baselineFor(cfg, rows, openingPence));
  return display;
}

function CellInput({ value, onCommit, kind, label }: { value: string; onCommit: (value: string) => void; kind: 'text' | 'date' | 'money' | 'month'; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (raw: string) => {
    const next = raw.trim();
    if (next === value) return;
    if (kind === 'date' && !next) { setDraft(value); return; }
    onCommit(next);
  };
  return (
    <input
      className="table-input"
      aria-label={label}
      type={kind === 'date' ? 'date' : 'text'}
      inputMode={kind === 'money' ? 'decimal' : undefined}
      style={{ minWidth: kind === 'date' ? 132 : kind === 'money' ? 88 : kind === 'month' ? 74 : 120 }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget.value); }
        if (e.key === 'Escape') { e.currentTarget.value = value; setDraft(value); e.currentTarget.blur(); }
      }}
    />
  );
}

function LedgerEditor({ ds, provider, title, cfg, update, notify, autoPayments }: Pick<ViewProps, 'ds' | 'update' | 'notify'> & { provider: string; title: string; cfg: LedgerConfig; autoPayments?: Record<string, AutoPayment> }) {
  const p = ds.providers[provider];
  const rows = (p?.[cfg.rowsKey] ?? []) as any[];
  const displayRows = effectiveRowsFor(cfg, rows, autoPayments, p?.ledgerOpeningPence);
  const editable = cfg.columns.filter((c) => c.edit);
  const manualOrder = hasManualOrder(rows);
  const baselineForProvider = (prov: any, list: any[]) => {
    const baseline = baselineFor(cfg, list, prov.ledgerOpeningPence);
    if (typeof prov.ledgerOpeningPence !== 'number') prov.ledgerOpeningPence = baseline;
    return baseline;
  };
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...cfg.defaults }));
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const nearestScrollKey = useRef('');

  // The rent ledger spans several years, so open on the entry closest to the
  // as-of date rather than making every visit scroll down from the first charge.
  useEffect(() => {
    if (provider !== 'rent') return;
    const key = `${provider}|${ds.settings.asOfDate}`;
    if (nearestScrollKey.current === key) return;
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const index = nearestDateRowIndex(displayRows, ds.settings.asOfDate);
    if (index < 0) return;
    const target = wrap.querySelectorAll('tbody tr')[index] as HTMLElement | undefined;
    if (!target) return;
    const head = wrap.querySelector('thead') as HTMLElement | null;
    const offset = target.getBoundingClientRect().top - wrap.getBoundingClientRect().top - (head?.offsetHeight ?? 0);
    wrap.scrollTop = Math.max(0, wrap.scrollTop + offset);
    nearestScrollKey.current = key;
  }, [provider, ds.settings.asOfDate, displayRows]);

  const patch = (index: number, key: string, raw: string) => {
    update((d) => {
      const prov = d.providers[provider];
      const list = prov[cfg.rowsKey] as any[];
      if (!list?.[index]) return;
      const baseline = baselineForProvider(prov, list);
      if (key === 'balancePence') {
        if (raw.trim()) list[index].balanceOverridePence = parseMoney(raw);
        else delete list[index].balanceOverridePence;
      } else if (key === 'totalPaidPence') {
        if (raw.trim()) list[index].totalPaidOverridePence = parseMoney(raw);
        else delete list[index].totalPaidOverridePence;
      } else {
        list[index][key] = key.endsWith('Pence') ? parseMoney(raw) : raw;
      }
      sortRows(list, cfg);
      recalculate(cfg, list, baseline);
      if (cfg.formula === 'telco') recalculateTelco(prov, baseline);
    });
    if (key === 'balancePence') notify(raw.trim() ? 'Balance set as a new anchor; later rows recalculated' : 'Balance returned to automatic');
    if (key === 'totalPaidPence') notify(raw.trim() ? 'Total paid set; later rows accumulate from it' : 'Total paid returned to automatic');
  };

  const move = (index: number, delta: number) => {
    const row = displayRows[index];
    const target = index + delta;
    if (!row || target < 0 || target >= displayRows.length) return;
    update((d) => {
      const prov = d.providers[provider];
      const list = prov[cfg.rowsKey] as any[];
      const baseline = baselineForProvider(prov, list);
      if (!reorderRows(list, index, delta)) return;
      recalculate(cfg, list, baseline);
      if (cfg.formula === 'telco') recalculateTelco(prov, baseline);
    });
    notify(`${row.month || dateUk(row.date)} entry moved ${delta < 0 ? 'up' : 'down'}`);
  };

  const resetOrder = () => {
    update((d) => {
      const prov = d.providers[provider];
      const list = prov[cfg.rowsKey] as any[];
      const baseline = baselineForProvider(prov, list);
      clearRowOrder(list, cfg);
      recalculate(cfg, list, baseline);
      if (cfg.formula === 'telco') recalculateTelco(prov, baseline);
    });
    notify(cfg.monthly ? 'Ledger sorted by month' : 'Ledger sorted by date');
  };

  const remove = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (!confirm(`Remove the ${row.month || dateUk(row.date)} entry?`)) return;
    update((d) => {
      const prov = d.providers[provider];
      const list = prov[cfg.rowsKey] as any[];
      const baseline = baselineForProvider(prov, list);
      list.splice(index, 1);
      sortRows(list, cfg);
      recalculate(cfg, list, baseline);
      if (cfg.formula === 'telco') recalculateTelco(prov, baseline);
    });
    notify(`${row.month || dateUk(row.date)} entry removed`);
  };

  const add = () => {
    const row: Record<string, any> = { ...cfg.defaults };
    for (const c of editable) {
      if (c.key === 'balancePence') {
        const raw = (draft[c.key] ?? '').trim();
        if (raw) row.balanceOverridePence = parseMoney(raw);
        continue;
      }
      if (c.key === 'totalPaidPence') {
        const raw = (draft[c.key] ?? '').trim();
        if (raw) row.totalPaidOverridePence = parseMoney(raw);
        continue;
      }
      row[c.key] = c.edit === 'money' ? parseMoney(draft[c.key] ?? '') : (draft[c.key] ?? '').trim();
    }
    if (cfg.monthly) {
      if (!row.month) return notify('Choose a month');
      if (rows.some((r) => r.month === row.month)) return notify(`${row.month} already has an entry — edit that row instead`);
    } else if (!row.date) return notify('Choose a date');
    update((d) => {
      const prov = d.providers[provider];
      const list = prov[cfg.rowsKey] as any[];
      const baseline = baselineForProvider(prov, list);
      appendRow(list, row, cfg);
      recalculate(cfg, list, baseline);
      if (cfg.formula === 'telco') recalculateTelco(prov, baseline);
    });
    setDraft({ ...cfg.defaults });
    notify(`${row.month || dateUk(row.date)} entry added`);
  };

  return (
    <Section
      title={`${title} ${cfg.rowsKey === 'entries' ? 'ledger' : 'statement'}`}
      sub={`${displayRows.length} entries · ${cfg.note}${cfg.monthly && Object.keys(autoPayments ?? {}).length ? ' · Due linked bills auto-fill Paid.' : ''} · Type a balance or total paid to anchor it; clear the cell for automatic. Move rows with ↑/↓.`}
      actions={manualOrder ? <button className="btn ghost sm" type="button" onClick={resetOrder}>Sort automatically</button> : undefined}
    >
      <div className="inline-form">
        {editable.map((column) => (
          <Field key={column.key} label={column.label}>
            {column.options ? (
              <select
                className="input"
                value={draft[column.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [column.key]: e.target.value })}
              >
                <option value="">Choose {column.label.toLowerCase()}</option>
                {column.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input
                className="input"
                type={column.edit === 'date' ? 'date' : 'text'}
                inputMode={column.edit === 'money' ? 'decimal' : undefined}
                placeholder={column.key === 'balancePence' || column.key === 'totalPaidPence' ? 'Automatic' : undefined}
                value={draft[column.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [column.key]: e.target.value })}
              />
            )}
          </Field>
        ))}
        <button className="btn primary" onClick={add}>Add entry</button>
      </div>
      <Table head={[...cfg.columns.map((c) => c.label), '']} className="ledger-table-start" wrapRef={tableWrapRef}>
        {displayRows.map((row, index) => (
          <tr key={`${row.month ?? row.date ?? 'row'}-${index}`}>
            {cfg.columns.map((column) => {
              const value = row[column.key];
              if (!column.edit) {
                if (column.money) return <td key={column.key} className={`num ${typeof value === 'number' && value < 0 ? 'amount neg' : ''}`}>{typeof value === 'number' ? gbp(value) : '—'}</td>;
                if (column.key === 'date') return <td key={column.key} className="muted">{dateUk(value)}</td>;
                return <td key={column.key} className={column.key === 'month' ? 'nowrap' : 'muted'}>{value ?? '—'}</td>;
              }
              return (
                <td key={column.key} className={column.money ? 'num' : ''}>
                  {column.options ? (
                    <select
                      className="table-input"
                      aria-label={`${column.label} ${row.month || row.date || index + 1}`}
                      style={{ minWidth: 150 }}
                      value={String(value ?? '')}
                      onChange={(e) => patch(index, column.key, e.target.value)}
                    >
                      {!value && <option value="">Select…</option>}
                      {withCurrentOption(column.options, value).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <CellInput
                      label={`${column.label} ${row.month || row.date || index + 1}`}
                      kind={column.edit}
                      value={column.money ? penceInput(value) : String(value ?? '')}
                      onCommit={(next) => patch(index, column.key, next)}
                    />
                  )}
                </td>
              );
            })}
            <td>
              <div className="row-actions">
                <button className="btn ghost sm" type="button" title="Move up" aria-label={`Move ${row.month || dateUk(row.date)} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                <button className="btn ghost sm" type="button" title="Move down" aria-label={`Move ${row.month || dateUk(row.date)} down`} disabled={index === displayRows.length - 1} onClick={() => move(index, 1)}>↓</button>
                <button className="btn ghost sm" type="button" onClick={() => remove(index)}>Remove</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {displayRows.length === 0 && <Empty>No entries yet. Add the first line below.</Empty>}
    </Section>
  );
}

function ArchivedLedger({ title, cfg, rows, year }: { title: string; cfg: LedgerConfig; rows: any[]; year: number }) {
  return (
    <Section
      title={`${title} ${year} ${cfg.rowsKey === 'entries' ? 'ledger' : 'statement'}`}
      sub={`Imported ${year} block — read-only. Roll the target year to ${year} to edit it.`}
    >
      <Table head={cfg.columns.map((column) => column.label)}>
        {rows.map((row, index) => (
          <tr key={`${row.month ?? row.date ?? 'row'}-${index}`}>
            {cfg.columns.map((column) => {
              const value = row[column.key];
              if (column.key === 'date') return <td key={column.key} className="muted nowrap">{dateUk(value)}</td>;
              if (column.money) {
                return (
                  <td key={column.key} className={`num ${typeof value === 'number' && value < 0 ? 'amount neg' : ''}`}>
                    {typeof value === 'number' ? gbp(value) : '—'}
                  </td>
                );
              }
              return <td key={column.key} className="muted">{value ?? '—'}</td>;
            })}
          </tr>
        ))}
      </Table>
      {rows.length === 0 && <Empty>This year block has no rows.</Empty>}
    </Section>
  );
}

function DetailEditor({ label, value, onCommit, multiline = false, type = 'text' }: { label: string; value: string; onCommit: (value: string) => void; multiline?: boolean; type?: 'text' | 'date' }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline) {
    return (
      <textarea
        className="input detail-input detail-textarea"
        aria-label={label}
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    );
  }
  return (
    <input
      className="input detail-input"
      aria-label={label}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

function AccountDetails({ heading = 'Account details', details, actions, children, renderDetail, metricListClassName }: { heading?: string; details: [string, string | undefined][]; actions?: ReactNode; children?: ReactNode; renderDetail?: (label: string, value: string | undefined) => ReactNode; metricListClassName?: string }) {
  const visible = details.filter(([, value]) => value !== undefined && value !== '');
  if (visible.length === 0) return null;
  return (
    <Section title={heading} actions={actions}>
      {children}
      <div className={`metric-list ${metricListClassName ?? ''}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {visible.map(([label, value]) => (
          <div className="metric" key={label}><span>{label}</span>{renderDetail?.(label, value) ?? <strong>{value}</strong>}</div>
        ))}
      </div>
    </Section>
  );
}

function VaultLocked({ go, actions }: { go: (view: string) => void; actions?: ReactNode }) {
  return (
    <Section title="Account access" sub="Unlock the encrypted credential vault to show provider logins" actions={actions}>
      <div style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="muted">Credentials are stored as ciphertext. They are never kept in the budget or backups as plaintext.</div>
        <button className="btn" onClick={() => go('settings')}>Open credential vault</button>
      </div>
    </Section>
  );
}

function AccessDetails({ items, actions, logo }: { items: { label: string; value?: string; secret?: boolean }[]; actions?: ReactNode; logo?: { src: string; href: string; label: string } }) {
  const visible = items.filter((item) => item.value !== undefined && item.value !== '');
  const [shown, setShown] = useState<Record<string, boolean>>({});
  if (visible.length === 0 && !logo) return null;
  return (
    <Section title="Account access" sub="Provider login details from the encrypted vault" actions={actions}>
      <div className="metric-list" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {logo && (
          <a className="metric account-logo-card" href={logo.href} target="_blank" rel="noreferrer" aria-label={`Open ${logo.label} website`}>
            <span>{logo.label}</span>
            <img src={logo.src} alt={`${logo.label} logo`} />
          </a>
        )}
        {visible.map(({ label, value, secret }) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <div className="credential-value">
              <strong className={secret ? 'credential-secret' : undefined}>{secret && !shown[label] ? '••••••••••' : value}</strong>
              {secret && (
                <button className="btn ghost sm" onClick={() => setShown({ ...shown, [label]: !shown[label] })}>
                  {shown[label] ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function providerAccessDetails(provider: string, secrets: VaultSecrets | undefined): { label: string; value?: string; secret?: boolean }[] {
  const secret = secrets?.[provider] ?? {};
  switch (provider) {
    case 'rent':
      return [
        { label: 'Username', value: secret.username },
        { label: 'Password', value: secret.password, secret: true },
        { label: 'Charge letter password', value: secret.chargeLetterPassword, secret: true },
      ];
    case 'water':
      return [
        { label: 'Username', value: secret.username },
        { label: 'Password', value: secret.password, secret: true },
      ];
    case 'councilTax':
      return [
        { label: 'Council Tax Bill password', value: secret.accessBill, secret: true },
        { label: 'Username', value: secret.username },
        { label: 'Password', value: secret.password, secret: true },
      ];
    case 'parkXmas':
      return [
        { label: 'Username', value: secret.username },
        { label: 'Password', value: secret.password, secret: true },
      ];
    case 'ovo':
      return [
        { label: 'Username', value: secret.username },
        { label: 'Password', value: secret.password, secret: true },
      ];
    case 'o2':
    case 'virgin':
      return [
        { label: 'Username', value: secret.username },
      ];
    default:
      return [];
  }
}

function rentAccountDetails(rent: any): [string, string | undefined][] {
  return [
    ['Provider', rent.providerName],
    ['Tenancy start', rent.tenancyStart ? dateUk(rent.tenancyStart) : '—'],
    ['Rent breakdown', rent.rentBreakdown],
    ['Payment plan', rent.paymentPlan],
    ['Agreement', rent.agreement],
    ['Tenancy reference', rent.reference],
  ];
}

export function Rent({ ds, engine, go, update, notify, vaultSession }: ViewProps) {
  const rent = ds.providers.rent;
  if (!rent) {
    return (
      <Section title="Rent" sub="No rent ledger yet" actions={<button className="btn primary" onClick={() => go('setup')}>Open setup</button>}>
        <Empty>Add a Rent bill in Set up, or import a workbook that contains a Rent sheet.</Empty>
      </Section>
    );
  }
  const entries = rent.entries as any[];
  const ledger = engine.rentLedger(ds.settings.asOfDate);
  const updateRentField = (field: string, value: string) => {
    update((d) => {
      const current = d.providers.rent;
      current[field] = value;
      current.detailsEdited = true;
    });
  };
  const renderRentDetail = (label: string) => {
    if (label === 'Provider' && rent.providerUrl) {
      return (
        <a className="account-link provider-link" href={rent.providerUrl} target="_blank" rel="noreferrer" aria-label="Swindon Borough Council website">
          <img src={providerLogoSrc(rent, 'swindon-borough-council.svg')} alt="Swindon Borough Council" />
        </a>
      );
    }
    if (label === 'Rent breakdown') return <DetailEditor label={label} multiline value={rent.rentBreakdown ?? ''} onCommit={(value) => updateRentField('rentBreakdown', value)} />;
    if (label === 'Payment plan') return <DetailEditor label={label} multiline value={rent.paymentPlan ?? ''} onCommit={(value) => updateRentField('paymentPlan', value)} />;
    if (label === 'Agreement') return <DetailEditor label={label} multiline value={rent.agreement ?? ''} onCommit={(value) => updateRentField('agreement', value)} />;
    return null;
  };
  return (
    <>
      <AccountDetails
        heading="Rent account"
        details={rentAccountDetails(rent)}
        renderDetail={renderRentDetail}
        actions={(
          <div className="page-actions">
            {rent.chargeLetterUrl ? <a className="btn primary" href={rent.chargeLetterUrl} target="_blank" rel="noreferrer">View rent charge letter</a> : null}
          </div>
        )}
      >
        <div className="kpi-grid" style={{ padding: '14px 16px 0' }}>
          <div className="card"><div className="card-title">Monthly rent</div><div className="kpi-value">{gbp(rent.monthlyRentPence)}</div><div className="card-sub">{rent.address}</div></div>
          <div className="card"><div className="card-title">Weekly charge</div><div className="kpi-value">{gbp(Math.abs(rent.weeklyChargePence))}</div><div className="card-sub">Every Monday</div></div>
          <div className="card"><div className="card-title">Monthly payment</div><div className="kpi-value">{gbp(rent.monthlyPaymentPence)}</div><div className="card-sub">Contractual</div></div>
          <div className="card"><div className="card-title">Balance</div><div className="kpi-value pos">{gbp(ledger.balancePence)}</div><div className="card-sub">{ledger.balancePence >= 0 ? 'Credit' : 'Debt'}</div></div>
        </div>
      </AccountDetails>
      {vaultSession ? (
        <AccessDetails
          items={providerAccessDetails('rent', vaultSession.secrets)}
          actions={rent.portalUrl ? <a className="btn primary" href={rent.portalUrl} target="_blank" rel="noreferrer">Login to your 'My Housing Tenancy'</a> : null}
        />
      ) : (
        <VaultLocked go={go} actions={rent.portalUrl ? <a className="btn primary" href={rent.portalUrl} target="_blank" rel="noreferrer">Login to your 'My Housing Tenancy'</a> : null} />
      )}
      <LedgerEditor ds={ds} provider="rent" title="Rent" cfg={RENT_CONFIG} update={update} notify={notify} />
    </>
  );
}

function ContractDetails({ title, contract, logo, monthly, latest, latestLabel = 'Latest balance', showAccount = true }: { title: string; contract?: ProviderContract; logo?: { src: string; href: string; label: string; className: string }; monthly?: number; latest?: any; latestLabel?: string; showAccount?: boolean }) {
  if (!contract) return null;
  const details: [string, string][] = [
    ...(showAccount ? [['Account', contract.accountName || title] as [string, string]] : []),
    ['Account number', contract.accountNumber || '—'],
    ['Mobile number', contract.mobileNumber || '—'],
    ['Contract length', contract.length || '—'],
    ['Remaining months', contract.remaining || '—'],
    ['Contract end', contract.endDate ? dateUk(contract.endDate) : '—'],
    ['Contract amount', contract.contractAmountPence === undefined ? '—' : gbp(contract.contractAmountPence)],
    ['Payments made', contract.paymentsPence === undefined ? '—' : gbp(contract.paymentsPence)],
    ['Remaining payments', contract.remainingPaymentsPence === undefined ? '—' : gbp(contract.remainingPaymentsPence)],
  ];
  const visibleDetails = details.filter(([, value]) => value !== '—');
  const tiers = contract.tiers ?? [];
  return (
    <Section title="Contract details">
      <div className="metric-list" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {logo && (
          <div className="metric">
            <span>Provider</span>
            <a className={`account-link provider-link ${logo.className}`} href={logo.href} target="_blank" rel="noreferrer" aria-label={`${logo.label} website`}>
              <img src={logo.src} alt={`${logo.label} logo`} />
            </a>
          </div>
        )}
        {visibleDetails.map(([label, value]) => (
          <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
        {monthly !== undefined && <div className="metric"><span>Monthly payment</span><strong>{gbp(monthly)}</strong></div>}
        {latest && typeof latest.balancePence === 'number' && <div className="metric"><span>{latestLabel}</span><strong>{gbp(latest.balancePence)}</strong></div>}
        {tiers.map((tier) => (
          <div className="metric" key={tier.label}><span>{tier.label}</span><strong>{gbp(tier.amountPence)}</strong></div>
        ))}
      </div>
    </Section>
  );
}

function providerAccountDetails(provider: string, p: any): [string, string | undefined][] {
  switch (provider) {
    case 'water':
      return [
        ['Account', p.accountName],
        ['Payment plan', p.paymentPlan],
        ['Monthly payment', p.monthlyPaymentPence === undefined ? undefined : gbp(p.monthlyPaymentPence)],
        ['Account number', p.accountNumber],
      ];
    case 'ovo':
      return [
        ['Provider', p.accountName || 'Ovo Energy'],
        ['Payment plan', p.plan],
        ['Account number', p.accountNumber],
      ];
    case 'parkXmas':
      return [
        ['Provider', 'Park Christmas Savings'],
        ['Account number', p.accountNo],
        ['Monthly payments remaining', p.paymentsRemaining === undefined ? undefined : String(p.paymentsRemaining)],
      ];
    case 'pureCremation':
      return [
        ['Provider account', p.accountName || 'Pure Cremation'],
        ['Payment account', p.paymentAccount],
        ['Payment date', p.paymentDay === undefined ? undefined : String(p.paymentDay)],
        ['Monthly payments remaining', p.paymentsRemaining === undefined ? undefined : String(p.paymentsRemaining)],
      ];
    case 'councilTax':
      return [
        ['Provider', p.providerName],
        ['Address', p.address],
        ['Tenancy start', p.tenancyStart ? dateUk(p.tenancyStart) : undefined],
        ['Payment plan', p.paymentPlan],
        ['Reference', p.reference],
      ];
    default:
      return [];
  }
}

export function ProviderView({ ds, engine, year, provider, title, subtitle, go, update, notify, vaultSession }: ViewProps & { provider: string; title: string; subtitle: string }) {
  const p = ds.providers[provider];
  const cfg = CONFIG[provider];
  if (!p || !cfg) {
    return (
      <Section title={title} sub={subtitle} actions={<button className="btn primary" onClick={() => go('setup')}>Open setup</button>}>
        <Empty>No {title} ledger yet. Add a bill linked to {title} in Set up, or import a workbook with this sheet.</Empty>
      </Section>
    );
  }
  // A later year reads its own imported block; only the live sheet is writable.
  const resolvedRows = rowsForYear(p, cfg.rowsKey, year);
  const rows: any[] = resolvedRows?.rows ?? [];
  const archivedYear = resolvedRows?.archived === true;
  const contract = p.contract as ProviderContract | undefined;
  // Months left are worked out from the contract end date rather than stored,
  // so O2 (whose workbook cell says 0) and Virgin stay correct as time passes.
  const remainingMonths = contract ? telcoRemainingMonths(p, ds.settings.asOfDate) : null;
  const contractView = contract && remainingMonths !== null ? { ...contract, remaining: String(remainingMonths) } : contract;
  const autoPayments = archivedYear ? undefined : engine.providerBillPayments(provider, year);
  const displayRows = effectiveRowsFor(cfg, rows, autoPayments, p?.ledgerOpeningPence);
  const statementYear = year;
  const latest = balanceAsOf(displayRows, statementYear, ds.settings.asOfDate);
  const latestLabel = `Balance at ${dateUk(ds.settings.asOfDate)}`;
  const monthly = p.monthlyPaymentPence ?? contract?.tiers?.[0]?.amountPence ?? displayRows[displayRows.length - 1]?.paymentPence ?? 0;
  const accountDetails = providerAccountDetails(provider, p);
  if (provider === 'water') {
    accountDetails.push([latestLabel, latest ? gbp(latest.balancePence) : undefined]);
  }
  if (provider === 'councilTax') {
    accountDetails.push(
      ['Monthly payment', gbp(monthly)],
      [latestLabel, latest ? gbp(latest.balancePence) : undefined],
    );
  }
  if (provider === 'parkXmas') {
    accountDetails.push(
      ['Monthly payment', gbp(monthly)],
      [latestLabel, latest ? gbp(latest.balancePence) : undefined],
    );
  }
  if (provider === 'pureCremation') {
    accountDetails.push(
      ['Monthly payment', gbp(monthly)],
      [latestLabel, latest ? gbp(latest.balancePence) : undefined],
    );
  }
  if (provider === 'ovo') {
    accountDetails.push(
      ['Monthly payment', gbp(monthly)],
      [latestLabel, latest ? gbp(latest.balancePence) : undefined],
    );
  }
  const billing = providerBilling(p);
  if (billing.contractDetails) accountDetails.push(['Contract details', billing.contractDetails]);
  if (!accountDetails.some(([label]) => /payment date/i.test(label))) {
    accountDetails.push(['Payment date', `Day ${billing.paymentDay}`]);
  }
  const renderProviderDetail = (label: string, value: string | undefined) => {
    if (provider === 'water' && label === 'Account number' && p.portalUrl) {
      return <a className="account-link" href={p.portalUrl} target="_blank" rel="noreferrer"><strong>{value}</strong></a>;
    }
    if (provider === 'councilTax' && label === 'Provider' && p.providerUrl) {
      return (
        <a className="account-link provider-link" href={p.providerUrl} target="_blank" rel="noreferrer" aria-label="Swindon Borough Council website">
          <img src={providerLogoSrc(p, 'swindon-borough-council.svg')} alt="Swindon Borough Council" />
        </a>
      );
    }
    if (provider === 'parkXmas' && label === 'Provider') {
      return (
        <a className="account-link provider-link park-xmas-link" href={p.portalUrl || 'https://www.getpark.co.uk/budgeting/login.jsp'} target="_blank" rel="noreferrer" aria-label="Park Christmas Savings website">
          <img src={providerLogoSrc(p, 'park-christmas-savings.svg')} alt="Park Christmas Savings" />
        </a>
      );
    }
    if (provider === 'ovo' && label === 'Provider') {
      return (
        <a className="account-link provider-link ovo-link" href={p.portalUrl || 'https://www.ovoenergy.com/'} target="_blank" rel="noreferrer" aria-label="OVO Energy website">
          <img src={providerLogoSrc(p, 'ovo-logo.svg')} alt="OVO Energy" />
        </a>
      );
    }
    if (provider === 'councilTax' && label === 'Address') {
      return <strong className="metric-address" title={value}>{value}</strong>;
    }
    return null;
  };
  const accountActions = provider === 'councilTax' && p.billUrl ? (
    <div className="page-actions">
      <a className="btn primary" href={p.billUrl} target="_blank" rel="noreferrer">View current bill</a>
    </div>
  ) : undefined;
  const accessActions = provider === 'councilTax' && p.portalUrl ? (
    <a className="btn primary" href={p.portalUrl} target="_blank" rel="noreferrer">View Council Tax account</a>
  ) : provider === 'parkXmas' && p.portalUrl ? (
    <a className="btn primary" href={p.portalUrl} target="_blank" rel="noreferrer">View account</a>
  ) : provider === 'o2' && p.portalUrl ? (
    <a className="btn" href={p.portalUrl} target="_blank" rel="noreferrer">Visit O2 website</a>
  ) : provider === 'virgin' && p.portalUrl ? (
    <a className="btn" href={p.portalUrl} target="_blank" rel="noreferrer">Visit Virgin Media website</a>
  ) : undefined;
  const contractLogo = provider === 'o2'
    ? { src: providerLogoSrc(p, 'o2-logo.svg'), href: p.portalUrl || 'https://www.o2.co.uk/', label: 'O2', className: 'o2-link' }
    : provider === 'virgin'
      ? { src: providerLogoSrc(p, 'virgin-media-logo.png'), href: p.portalUrl || 'https://www.virginmedia.com/', label: 'Virgin Media', className: 'virgin-link' }
      : undefined;

  const customLogo = providerCustomLogo(p);

  return (
    <>
      {customLogo ? (
        <div className="provider-brand">
          <img src={customLogo} alt={`${title} logo`} />
          <div>
            <strong>{title}</strong>
            <span className="muted small">Custom logo from Set up</span>
          </div>
        </div>
      ) : null}
      {provider !== 'water' && provider !== 'councilTax' && provider !== 'parkXmas' && provider !== 'pureCremation' && provider !== 'ovo' && provider !== 'o2' && provider !== 'virgin' && (
        <div className="kpi-grid">
          <div className="card"><div className="card-title">Provider</div><div className="kpi-value" style={{ fontSize: 18 }}>{p.accountName || contract?.accountName || p.address || title}</div><div className="card-sub">{subtitle}</div></div>
          <div className="card"><div className="card-title">Monthly payment</div><div className="kpi-value">{gbp(monthly)}</div><div className="card-sub">{p.plan || p.paymentPlan || '—'}</div></div>
          <div className="card"><div className="card-title">Latest balance</div><div className="kpi-value">{latest ? gbp(latest.balancePence) : '—'}</div><div className="card-sub">{latest?.date ? dateUk(latest.date) : latest?.month || '—'}</div></div>
        </div>
      )}
      <AccountDetails details={accountDetails} renderDetail={renderProviderDetail} actions={accountActions} metricListClassName={provider === 'councilTax' ? 'council-tax-details' : undefined} />
      {provider !== 'pureCremation' && (vaultSession ? (
        <AccessDetails
          items={providerAccessDetails(provider, vaultSession.secrets)}
          actions={accessActions}
          logo={provider === 'water' ? {
            src: providerLogoSrc(p, 'thames-water-logo.svg'),
            href: p.portalUrl || 'https://www.thameswater.co.uk/',
            label: 'Thames Water',
          } : undefined}
        />
      ) : (
        <VaultLocked go={go} actions={accessActions} />
      ))}
      <ContractDetails title={title} contract={contractView} logo={contractLogo} monthly={monthly} latest={latest} latestLabel={latestLabel} showAccount={provider !== 'o2' && provider !== 'virgin'} />
      {archivedYear
        ? <ArchivedLedger title={title} cfg={cfg} rows={rows} year={year} />
        : <LedgerEditor ds={ds} provider={provider} title={title} cfg={cfg} update={update} notify={notify} autoPayments={autoPayments} />}
    </>
  );
}

export function Statements({ ds, engine, year, go }: ViewProps) {
  const options = [
    ...ds.accounts.map((a) => a.name),
    ...ds.people.map((p) => p.shortName),
    ...ds.cards.map((c) => c.name),
  ];
  const [account, setAccount] = useState(options[0] ?? '');
  const [m, setM] = useState('All');
  if (options.length === 0) {
    return (
      <Section title="Statement" sub="No accounts to report on yet" actions={<button className="btn primary" onClick={() => go('setup')}>Open setup</button>}>
        <Empty>Add a bank account in Set up to see its statement and running balance.</Empty>
      </Section>
    );
  }
  const st = engine.statement(account, year, m === 'All' ? null : Number(m));
  const repaid = st.lines.filter((l) => l.type === 'Income');
  const lent = st.lines.filter((l) => l.type === 'Expense');
  const primaryAccount = ds.settings.primaryAccount || ds.accounts[0]?.name || '';
  const anchorAdjusted = account === primaryAccount;

  const exportStatement = () => download(`statement-${account}.csv`, toCsv([
    ['Date', 'Description', 'Repaid', 'Lent', 'Balance'],
    ...st.lines.map((l) => [l.date, l.comments, l.type === 'Income' ? (l.amountPence / 100).toFixed(2) : '', l.type === 'Expense' ? (l.amountPence / 100).toFixed(2) : '', (l.runningPence / 100).toFixed(2)]),
  ]));

  return (
    <>
      <Section
        title="Statement"
        sub="Opening balance, total repaid/lent and running balance for the selected account"
        actions={<button className="btn" onClick={exportStatement}>Export CSV</button>}
      >
        <div className="toolbar">
          <select className="select" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="select" value={m} onChange={(e) => setM(e.target.value)} aria-label="Month">
            <option value="All">All months</option>
            {MONTH_LONG.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
          </select>
          <span className="muted small">{st.lines.length} transactions</span>
        </div>
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="metric"><span>Opening balance</span><strong>{gbp(st.openingPence)}</strong></div>
          <div className="metric"><span>Total repaid</span><strong className="amount pos">{gbp(st.totalRepaidPence)}</strong></div>
          <div className="metric"><span>Total lent</span><strong className="amount neg">{gbp(st.totalLentPence)}</strong></div>
          <div className="metric"><span>Closing balance</span><strong>{gbp(st.closingPence)}</strong></div>
        </div>
        <Table head={['Date', 'Description', 'Repaid', 'Lent', 'Balance']} numHead={[2, 3, 4]}>
          {st.lines.map((l) => (
            <tr key={l.row}>
              <td className="muted nowrap">{dateUk(l.date)}</td>
              <td>{l.comments || '—'}</td>
              <td className="num amount pos">{l.type === 'Income' ? gbp(l.amountPence) : ''}</td>
              <td className="num amount neg">{l.type === 'Expense' ? gbp(l.amountPence) : ''}</td>
              <td className="num"><strong>{gbp(l.runningPence)}</strong></td>
            </tr>
          ))}
        </Table>
        {st.lines.length === 0 && <Empty>No transactions for this account in the selected period.</Empty>}
        <div style={{ padding: '10px 16px' }} className="muted small">
          Repaid rows: {repaid.length} · Lent rows: {lent.length} · Closing includes the opening balance.
          {anchorAdjusted && ' This statement adds scheduled bills, people cash and Backup Space on the same dates as the Dashboard, so the closing balance matches the account balance.'}
        </div>
      </Section>
    </>
  );
}
