import { useState } from 'react';
import type { ViewProps } from '../types';
import type { SavingsAccount } from '../../../core/engine';
import { Badge, Empty, Field, Section, Table } from '../components';
import { gbp, parseMoney } from '../format';

const TYPES = ['Cash ISA', 'Stocks and shares ISA', 'Easy access savings', 'Fixed-rate savings', 'Regular saver', 'Premium bonds', 'Other'];
const BLANK = { name: '', provider: '', type: TYPES[2], sortCode: '', accountNumber: '', balance: '', target: '', monthly: '', contributionDay: '1', interest: '', notes: '' };

/** Savings and ISA accounts with balances, account details, targets and regular contributions. */
export function Savings({ ds, update, notify }: ViewProps) {
  const accounts = ds.savings ?? [];
  const [form, setForm] = useState({ ...BLANK });
  const [editing, setEditing] = useState<string | null>(null);

  const totalSaved = accounts.reduce((sum, account) => sum + (account.balancePence || 0), 0);
  const monthly = accounts.reduce((sum, account) => sum + (account.monthlyContributionPence || 0), 0);

  const reset = () => {
    setForm({ ...BLANK });
    setEditing(null);
  };

  const save = () => {
    const name = form.name.trim();
    if (!name) return notify('Give the savings account a name');
    const balance = parseMoney(form.balance);
    const account: SavingsAccount = {
      id: editing ?? `savings_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      provider: form.provider.trim(),
      type: form.type,
      sortCode: form.sortCode.trim(),
      accountNumber: form.accountNumber.trim(),
      balancePence: balance,
      targetPence: parseMoney(form.target),
      monthlyContributionPence: parseMoney(form.monthly),
      contributionDay: Math.min(31, Math.max(1, Number(form.contributionDay) || 1)),
      interestRatePct: Number(form.interest) || 0,
      notes: form.notes.trim(),
      active: true,
    };
    update((dataset) => {
      dataset.savings = dataset.savings ?? [];
      const index = dataset.savings.findIndex((entry) => entry.id === account.id);
      if (index >= 0) dataset.savings[index] = account;
      else dataset.savings.push(account);
    });
    notify(editing ? `${name} updated` : `${name} added`);
    reset();
  };

  const edit = (account: SavingsAccount) => {
    setEditing(account.id);
    setForm({
      name: account.name,
      provider: account.provider ?? '',
      type: account.type ?? TYPES[2],
      sortCode: account.sortCode ?? '',
      accountNumber: account.accountNumber ?? '',
      balance: (account.balancePence / 100).toFixed(2),
      target: account.targetPence ? (account.targetPence / 100).toFixed(2) : '',
      monthly: account.monthlyContributionPence ? (account.monthlyContributionPence / 100).toFixed(2) : '',
      contributionDay: String(account.contributionDay ?? 1),
      interest: account.interestRatePct ? String(account.interestRatePct) : '',
      notes: account.notes ?? '',
    });
  };

  const remove = (account: SavingsAccount) => {
    if (!confirm(`Remove ${account.name}? Its balance and account details will be deleted from this budget.`)) return;
    update((dataset) => {
      dataset.savings = (dataset.savings ?? []).filter((entry) => entry.id !== account.id);
    });
    if (editing === account.id) reset();
    notify(`${account.name} removed`);
  };

  return (
    <Section
      title="Savings"
      sub="Savings and ISA accounts: balances, account details, targets and regular contributions"
      actions={<Badge tone="green">{gbp(totalSaved)} saved</Badge>}
    >
      <div className="metric-list" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="metric"><span>Total saved</span><strong>{gbp(totalSaved)}</strong></div>
        <div className="metric"><span>Regular saving</span><strong>{gbp(monthly)}/mo</strong></div>
        <div className="metric"><span>Accounts</span><strong>{accounts.length}</strong></div>
      </div>

      <Table head={['Account', 'Details', 'Balance', 'Target', 'Monthly', '']}>
        {accounts.map((account) => {
          const progress = account.targetPence ? Math.min(1, account.balancePence / account.targetPence) : null;
          return (
            <tr key={account.id}>
              <td>
                <strong>{account.name}</strong>
                <div className="muted small">{account.provider || '—'} · {account.type || 'Savings'}{account.interestRatePct ? ` · ${account.interestRatePct}%` : ''}</div>
              </td>
              <td className="muted small">
                {account.sortCode ? `Sort code ${account.sortCode}` : 'No sort code'}
                {account.accountNumber ? ` · Account ${account.accountNumber}` : ''}
              </td>
              <td className="num">{gbp(account.balancePence)}</td>
              <td>
                {account.targetPence ? (
                  <>
                    <div className="num">{gbp(account.targetPence)}</div>
                    <progress value={progress ?? 0} max={1} style={{ width: 90 }} />
                  </>
                ) : <span className="muted small">No target</span>}
              </td>
              <td className="num">{account.monthlyContributionPence ? `${gbp(account.monthlyContributionPence)} · day ${account.contributionDay ?? 1}` : '—'}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn ghost sm" type="button" onClick={() => edit(account)}>Edit</button>
                  <button className="btn ghost sm" type="button" onClick={() => remove(account)}>Remove</button>
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      {accounts.length === 0 && <Empty>No savings accounts yet. Add an ISA or savings account below, with its balance and target.</Empty>}

      <div className="form-grid" style={{ padding: 16 }}>
        <Field label="Account name"><input className="input" placeholder="e.g. Rainy day savings" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Provider / bank"><input className="input" value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} /></Field>
        <Field label="Type">
          <select className="select" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Sort code"><input className="input" placeholder="00-00-00" value={form.sortCode} onChange={(event) => setForm({ ...form, sortCode: event.target.value })} /></Field>
        <Field label="Account number"><input className="input" value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} /></Field>
        <Field label="Balance £"><input className="input" inputMode="decimal" value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} /></Field>
        <Field label="Target £"><input className="input" inputMode="decimal" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} /></Field>
        <Field label="Monthly contribution £"><input className="input" inputMode="decimal" value={form.monthly} onChange={(event) => setForm({ ...form, monthly: event.target.value })} /></Field>
        <Field label="Contribution day"><input className="input" type="number" min={1} max={31} value={form.contributionDay} onChange={(event) => setForm({ ...form, contributionDay: event.target.value })} /></Field>
        <Field label="Interest rate %"><input className="input" inputMode="decimal" value={form.interest} onChange={(event) => setForm({ ...form, interest: event.target.value })} /></Field>
        <Field label="Notes"><input className="input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
      </div>
      <div className="toolbar" style={{ borderBottom: 0 }}>
        <button className="btn primary" type="button" onClick={save}>{editing ? 'Save changes' : 'Add savings account'}</button>
        {editing && <button className="btn" type="button" onClick={reset}>Cancel</button>}
        <span className="muted small">Balances are recorded here; they do not move money or post transactions.</span>
      </div>
    </Section>
  );
}
