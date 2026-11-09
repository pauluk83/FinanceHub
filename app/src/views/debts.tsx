import { useState } from 'react';
import type { ViewProps } from '../types';
import type { Debt } from '../../../core/engine';
import { Badge, Empty, Field, Section, Table } from '../components';
import { gbp, parseMoney } from '../format';

const AGREEMENTS = ['Personal loan', 'Credit card', 'Car finance', 'Buy now pay later', 'Overdraft', 'Family loan', 'Other'];
const BLANK = { name: '', creditor: '', agreementType: AGREEMENTS[0], agreementRef: '', balance: '', monthly: '', dueDay: '1', interest: '', startDate: '', notes: '' };

/** Loans, credit and other agreements with the amount owed and the monthly payment. */
export function Debts({ ds, update, notify }: ViewProps) {
  const debts = ds.debts ?? [];
  const [form, setForm] = useState({ ...BLANK });
  const [editing, setEditing] = useState<string | null>(null);

  const totalOwed = debts.reduce((sum, debt) => sum + Math.max(0, debt.balancePence || 0), 0);
  const monthly = debts.reduce((sum, debt) => sum + (debt.monthlyPaymentPence || 0), 0);

  const reset = () => {
    setForm({ ...BLANK });
    setEditing(null);
  };

  const save = () => {
    const name = form.name.trim();
    if (!name) return notify('Give the debt a name');
    const balance = parseMoney(form.balance);
    if (!balance) return notify('Enter how much is still owed');
    const debt: Debt = {
      id: editing ?? `debt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      creditor: form.creditor.trim(),
      agreementType: form.agreementType,
      agreementRef: form.agreementRef.trim(),
      balancePence: balance,
      monthlyPaymentPence: parseMoney(form.monthly),
      dueDay: Math.min(31, Math.max(1, Number(form.dueDay) || 1)),
      interestRatePct: Number(form.interest) || 0,
      startDate: form.startDate,
      notes: form.notes.trim(),
      active: true,
    };
    update((dataset) => {
      dataset.debts = dataset.debts ?? [];
      const index = dataset.debts.findIndex((entry) => entry.id === debt.id);
      if (index >= 0) dataset.debts[index] = debt;
      else dataset.debts.push(debt);
    });
    notify(editing ? `${name} updated` : `${name} added`);
    reset();
  };

  const edit = (debt: Debt) => {
    setEditing(debt.id);
    setForm({
      name: debt.name,
      creditor: debt.creditor ?? '',
      agreementType: debt.agreementType ?? AGREEMENTS[0],
      agreementRef: debt.agreementRef ?? '',
      balance: (debt.balancePence / 100).toFixed(2),
      monthly: (debt.monthlyPaymentPence / 100).toFixed(2),
      dueDay: String(debt.dueDay ?? 1),
      interest: debt.interestRatePct ? String(debt.interestRatePct) : '',
      startDate: debt.startDate ?? '',
      notes: debt.notes ?? '',
    });
  };

  const remove = (debt: Debt) => {
    if (!confirm(`Remove ${debt.name}? Its agreement details will be deleted from this budget.`)) return;
    update((dataset) => {
      dataset.debts = (dataset.debts ?? []).filter((entry) => entry.id !== debt.id);
    });
    if (editing === debt.id) reset();
    notify(`${debt.name} removed`);
  };

  return (
    <Section
      title="Debts"
      sub="Loans, credit and agreements: what is owed, the monthly payment and the due date"
      actions={<Badge tone={totalOwed ? 'amber' : 'green'}>{gbp(totalOwed)} owed</Badge>}
    >
      <div className="metric-list" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="metric"><span>Total owed</span><strong>{gbp(totalOwed)}</strong></div>
        <div className="metric"><span>Monthly payments</span><strong>{gbp(monthly)}</strong></div>
        <div className="metric"><span>Agreements</span><strong>{debts.length}</strong></div>
      </div>

      <Table head={['Debt', 'Agreement', 'Balance', 'Monthly', 'Due', '']}>
        {debts.map((debt) => (
          <tr key={debt.id}>
            <td>
              <strong>{debt.name}</strong>
              <div className="muted small">{debt.creditor || '—'}{debt.interestRatePct ? ` · ${debt.interestRatePct}%` : ''}</div>
            </td>
            <td className="muted small">{debt.agreementType || '—'}{debt.agreementRef ? ` · ${debt.agreementRef}` : ''}</td>
            <td className="num">{gbp(debt.balancePence)}</td>
            <td className="num">{gbp(debt.monthlyPaymentPence)}</td>
            <td className="num">{debt.dueDay ?? '—'}</td>
            <td>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn ghost sm" type="button" onClick={() => edit(debt)}>Edit</button>
                <button className="btn ghost sm" type="button" onClick={() => remove(debt)}>Remove</button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {debts.length === 0 && <Empty>No debts yet. Add each loan or credit agreement below, with the amount still owed.</Empty>}

      <div className="form-grid" style={{ padding: 16 }}>
        <Field label="Debt name"><input className="input" placeholder="e.g. Car finance" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Creditor"><input className="input" placeholder="e.g. Example Finance" value={form.creditor} onChange={(event) => setForm({ ...form, creditor: event.target.value })} /></Field>
        <Field label="Agreement type">
          <select className="select" value={form.agreementType} onChange={(event) => setForm({ ...form, agreementType: event.target.value })}>
            {AGREEMENTS.map((agreement) => <option key={agreement} value={agreement}>{agreement}</option>)}
          </select>
        </Field>
        <Field label="Agreement reference"><input className="input" value={form.agreementRef} onChange={(event) => setForm({ ...form, agreementRef: event.target.value })} /></Field>
        <Field label="Balance owed £"><input className="input" inputMode="decimal" value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} /></Field>
        <Field label="Monthly payment £"><input className="input" inputMode="decimal" value={form.monthly} onChange={(event) => setForm({ ...form, monthly: event.target.value })} /></Field>
        <Field label="Due day"><input className="input" type="number" min={1} max={31} value={form.dueDay} onChange={(event) => setForm({ ...form, dueDay: event.target.value })} /></Field>
        <Field label="Interest rate %"><input className="input" inputMode="decimal" value={form.interest} onChange={(event) => setForm({ ...form, interest: event.target.value })} /></Field>
        <Field label="Start date"><input className="input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></Field>
        <Field label="Notes"><input className="input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
      </div>
      <div className="toolbar" style={{ borderBottom: 0 }}>
        <button className="btn primary" type="button" onClick={save}>{editing ? 'Save changes' : 'Add debt'}</button>
        {editing && <button className="btn" type="button" onClick={reset}>Cancel</button>}
        <span className="muted small">Balances update when you edit the debt; nothing is posted to transactions.</span>
      </div>
    </Section>
  );
}
