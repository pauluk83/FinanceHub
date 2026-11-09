import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateUk, download, gbp, parseMoney } from '../format';
import { blankDataset } from '../store';
import { billSheetsFor } from '../billSheets';
import { ProviderSetupSection } from './providerSetup';

const METHODS = ['Direct Debit', 'Standing Order', 'Continuous Card Authority', 'Manual'];

export function OnboardingView({ ds, engine, update, notify, go, setMonth, workspace, chooseWorkspace, onOpenDemo }: ViewProps) {
  const [basics, setBasics] = useState({
    year: ds.settings.targetYear,
    asOf: ds.settings.asOfDate,
    anchor: ds.settings.anchorDate,
    currency: ds.settings.currency,
    main: ds.accounts.find((a) => a.name === (ds.settings.primaryAccount || 'Current account'))?.name ?? ds.accounts[0]?.name ?? 'Current account',
    opening: '0',
  });
  const [acct, setAcct] = useState({ name: '', target: '', opening: '' });
  const [person, setPerson] = useState({ short: '', full: '', opening: '' });
  const [bill, setBill] = useState({ name: '', amount: '', due: '27', method: 'Direct Debit', sheet: '' });
  const rentProvider = ds.providers.rent;
  const [rentForm, setRentForm] = useState({
    providerName: typeof rentProvider?.providerName === 'string' && rentProvider.providerName
      ? rentProvider.providerName
      : typeof rentProvider?.displayName === 'string' ? rentProvider.displayName : '',
    monthlyRent: typeof rentProvider?.monthlyRentPence === 'number' && rentProvider.monthlyRentPence ? (rentProvider.monthlyRentPence / 100).toFixed(2) : '',
    monthlyPayment: typeof rentProvider?.monthlyPaymentPence === 'number' && rentProvider.monthlyPaymentPence ? (rentProvider.monthlyPaymentPence / 100).toFixed(2) : '',
    paymentDay: String(rentProvider?.paymentDay ?? 1),
    agreementType: typeof rentProvider?.agreementType === 'string' ? rentProvider.agreementType : 'Assured shorthold tenancy',
    tenancyStart: typeof rentProvider?.tenancyStart === 'string' ? rentProvider.tenancyStart : '',
    agreement: typeof rentProvider?.agreement === 'string' ? rentProvider.agreement : '',
    paymentPlan: typeof rentProvider?.paymentPlan === 'string' ? rentProvider.paymentPlan : '',
    weeklyRecurring: Boolean(rentProvider?.weeklyChargePence),
    weeklyCharge: typeof rentProvider?.weeklyChargePence === 'number' && rentProvider.weeklyChargePence ? (Math.abs(rentProvider.weeklyChargePence) / 100).toFixed(2) : '',
  });

  const primary = ds.settings.primaryAccount || ds.accounts[0]?.name || 'Current account';
  const sheets = billSheetsFor(ds);
  const balances = engine.accountBalances(ds.settings.asOfDate);
  const done = [ds.accounts.length > 0, ds.people.length > 0, ds.bills.length > 0, ds.transactions.length > 0].filter(Boolean).length;
  const firstRun = ds.accounts.length === 0 && ds.transactions.length === 0;

  const saveBasics = () => {
    if (!basics.asOf || !basics.anchor) return notify('Choose an As-Of date and a Balance Anchor date');
    update((d) => {
      d.settings.targetYear = Number(basics.year) || d.settings.targetYear;
      d.settings.asOfDate = basics.asOf;
      d.settings.anchorDate = basics.anchor;
      d.settings.lockCutoff = engine.lockCutoff(basics.asOf);
      d.settings.currency = basics.currency || '£';
    });
    setMonth(Number(basics.asOf.slice(5, 7)) || 1);
    notify('Budget basics saved');
  };

  const startFresh = () => {
    if (!confirm(
      `Start a blank ${basics.year} budget for “${basics.main}”?\n\nThis removes the imported accounts, people, cards, bills and transactions from this device. A JSON backup downloads first, and “Reset to imported workbook” can restore the workbook.`,
    )) return;
    download(`financehub-before-fresh-start-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ds, null, 2), 'application/json');
    const fresh = blankDataset(ds, {
      year: Number(basics.year) || ds.settings.targetYear,
      asOf: basics.asOf,
      anchor: basics.anchor,
      mainAccount: basics.main,
      openingPence: parseMoney(basics.opening),
      currency: basics.currency,
    });
    update((d) => { Object.assign(d, fresh); });
    setMonth(Number(basics.asOf.slice(5, 7)) || 1);
    notify(`Blank budget ready for ${basics.main}`);
  };

  const addAccount = () => {
    const name = acct.name.trim();
    if (!name) return notify('Give the account a name');
    if (ds.accounts.some((a) => a.name === name) || ds.people.some((p) => p.shortName === name) || ds.cards.some((c) => c.name === name)) {
      return notify('That name is already in use');
    }
    update((d) => {
      d.accounts.push({ name, targetPence: parseMoney(acct.target), openingPence: parseMoney(acct.opening), sortOrder: d.accounts.length + 1, active: true });
      if (d.accounts.length === 1) d.settings.primaryAccount = name;
    });
    setAcct({ name: '', target: '', opening: '' });
    notify(`${name} added`);
  };

  const addPerson = () => {
    const short = person.short.trim();
    if (!short) return notify('Give the person a short name');
    if (ds.people.some((p) => p.shortName === short) || ds.accounts.some((a) => a.name === short) || ds.cards.some((c) => c.name === short)) {
      return notify('That name is already in use');
    }
    update((d) => d.people.push({ shortName: short, fullName: person.full.trim() || short, openingPence: parseMoney(person.opening), sortOrder: d.people.length + 1, active: true }));
    setPerson({ short: '', full: '', opening: '' });
    notify(`${short} added`);
  };

  const addBill = () => {
    const name = bill.name.trim();
    if (!name) return notify('Give the bill a name');
    if (ds.bills.some((b) => b.name === name)) return notify('That bill already exists');
    update((d) => d.bills.push({
      name,
      amountPence: parseMoney(bill.amount),
      dueDay: Number(bill.due) || 1,
      linkedSheet: bill.sheet,
      frequency: 'Monthly',
      latestBalancePence: 0,
      latestPaymentPence: 0,
      sortOrder: d.bills.length + 1,
      active: true,
      effectiveFrom: '',
      paymentMethod: bill.method,
      baseAmountPence: parseMoney(bill.amount),
      baseDueDay: Number(bill.due) || 1,
    }));
    setBill({ name: '', amount: '', due: '27', method: 'Direct Debit', sheet: '' });
    notify(`${name} will appear in this month’s bill run`);
  };

  const saveRentAgreement = () => {
    const monthly = parseMoney(rentForm.monthlyRent);
    if (!monthly) return notify('Enter the monthly rent you are liable for');
    const payment = parseMoney(rentForm.monthlyPayment) || monthly;
    const day = Math.min(28, Math.max(1, Number(rentForm.paymentDay) || 1));
    const weekly = rentForm.weeklyRecurring ? (parseMoney(rentForm.weeklyCharge) || Math.round(monthly / 4)) : 0;
    const name = rentForm.providerName.trim() || 'Landlord';
    const start = /^\d{4}-\d{2}-\d{2}$/.test(rentForm.tenancyStart) ? rentForm.tenancyStart : '';
    update((d) => {
      const provider = d.providers.rent ?? (d.providers.rent = { enabled: true, year: d.settings.targetYear, entries: [] });
      provider.enabled = true;
      provider.providerName = name;
      provider.displayName = name;
      provider.monthlyRentPence = monthly;
      provider.monthlyPaymentPence = payment;
      provider.paymentDay = day;
      provider.agreementType = rentForm.agreementType;
      provider.agreement = rentForm.agreement.trim();
      provider.paymentPlan = rentForm.paymentPlan.trim();
      provider.tenancyStart = start;
      provider.weeklyChargePence = weekly ? -weekly : 0;
      if (weekly && (provider.entries ?? []).length === 0) {
        const first = start || `${d.settings.targetYear}-01-01`;
        const last = `${d.settings.targetYear}-12-31`;
        const entries: { date: string; description: string; amountPence: number; balancePence: number }[] = [];
        let running = 0;
        for (let time = Date.parse(first); Number.isFinite(time) && time <= Date.parse(last); time += 7 * 86_400_000) {
          running -= weekly;
          entries.push({ date: new Date(time).toISOString().slice(0, 10), description: 'Rent Charge', amountPence: -weekly, balancePence: running });
        }
        provider.entries = entries;
      }
      const existing = d.bills.find((entry) => entry.name === 'Rent');
      if (existing) {
        existing.amountPence = payment;
        existing.baseAmountPence = payment;
        existing.dueDay = day;
        existing.baseDueDay = day;
        existing.linkedSheet = 'Rent';
        existing.paymentMethod = 'Standing Order';
        existing.active = true;
      } else {
        d.bills.push({
          name: 'Rent', amountPence: payment, dueDay: day, linkedSheet: 'Rent', frequency: 'Monthly',
          latestBalancePence: 0, latestPaymentPence: 0, sortOrder: d.bills.length + 1, active: true,
          effectiveFrom: '', paymentMethod: 'Standing Order', baseAmountPence: payment, baseDueDay: day,
        });
      }
    });
    notify(`Rent set up — ${gbp(payment)} on day ${day} each month`);
  };

  return (
    <>
      {firstRun && (
        <Section
          title="Start your budget"
          sub="First run: choose a blank budget you will fill in, or explore the demo with sample data. Nothing is uploaded by either choice."
          actions={<Badge tone="blue">First run</Badge>}
        >
          <div className="workspace-choice">
            <button type="button" className="workspace-choice-card" onClick={startFresh}>
              <span className="workspace-choice-icon" aria-hidden="true">▣</span>
              <strong>Blank budget</strong>
              <span>Start with one main account and add your own people, bills and transactions.</span>
              <small>Opens the guided setup below</small>
            </button>
            <button type="button" className="workspace-choice-card" onClick={() => onOpenDemo?.()} disabled={!onOpenDemo}>
              <span className="workspace-choice-icon" aria-hidden="true">◇</span>
              <strong>Demo workspace</strong>
              <span>Explore every screen with sample data before entering your own.</span>
              <small>Nothing you change in the demo is saved</small>
            </button>
          </div>
        </Section>
      )}
      <Section
        title="Where should this budget live?"
        sub="Choose an account for browser sync, or keep this workspace local to this device."
        actions={<Badge tone={workspace === 'demo' ? 'blue' : workspace === 'account' ? 'green' : 'amber'}>{workspace === 'demo' ? 'Demo' : workspace === 'account' ? 'Account sync' : 'Local only'}</Badge>}
      >
        <div className="workspace-choice">
          <button
            type="button"
            className={`workspace-choice-card ${workspace === 'account' ? 'selected' : ''}`}
            onClick={() => chooseWorkspace('account')}
            disabled={workspace === 'account'}
          >
            <span className="workspace-choice-icon" aria-hidden="true">☁</span>
            <strong>Account · browser sync</strong>
            <span>Sign in to keep the budget in Supabase and open it on another device.</span>
            <small>{workspace === 'account' ? 'Current workspace' : 'Switch to account'}</small>
          </button>
          <button
            type="button"
            className={`workspace-choice-card ${workspace === 'local' ? 'selected' : ''}`}
            onClick={() => chooseWorkspace('local')}
            disabled={workspace === 'local'}
          >
            <span className="workspace-choice-icon" aria-hidden="true">▣</span>
            <strong>Local · this device</strong>
            <span>Keep this budget in this browser or device only. No account is required.</span>
            <small>{workspace === 'local' ? 'Current workspace' : 'Switch to local'}</small>
          </button>
        </div>
        <div className="workspace-choice-note">
          Switching to local signs you out of the cloud account. Switching to account may open the sign-in screen. Local data is not protected by a login.
        </div>
      </Section>

      <Section
        title="Guided setup"
        sub="Onboarding for a new budget. Ongoing changes live in Settings; bills and link sheets are managed under Bills."
        actions={<Badge tone={done === 4 ? 'green' : 'blue'}>{done}/4 essentials</Badge>}
      >
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="metric"><span>Bank accounts</span><strong>{ds.accounts.length}</strong></div>
          <div className="metric"><span>People</span><strong>{ds.people.length}</strong></div>
          <div className="metric"><span>Bills</span><strong>{ds.bills.length}</strong></div>
          <div className="metric"><span>Transactions</span><strong>{ds.transactions.length}</strong></div>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div className="notice info">
            Already have data? Start with the basics below and add only what is missing.
            Want a clean slate? Use “Start blank budget” — it downloads a backup before clearing the imported workbook.
          </div>
        </div>
      </Section>

      <Section title="1. Budget basics" sub="These dates drive every month, the lock cutoff and the balance anchor">
        <div className="form-grid">
          <Field label="Budget year">
            <input type="number" value={basics.year} onChange={(e) => setBasics({ ...basics, year: Number(e.target.value) })} />
          </Field>
          <Field label="As-of date" hint="What date are your balances correct to?">
            <input type="date" value={basics.asOf} onChange={(e) => setBasics({ ...basics, asOf: e.target.value })} />
          </Field>
          <Field label="Balance anchor date" hint="Usually the date you entered your opening balances">
            <input type="date" value={basics.anchor} onChange={(e) => setBasics({ ...basics, anchor: e.target.value })} />
          </Field>
          <Field label="Currency symbol">
            <input value={basics.currency} onChange={(e) => setBasics({ ...basics, currency: e.target.value })} />
          </Field>
        </div>
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <button className="btn primary" onClick={saveBasics}>Save budget basics</button>
          <span className="muted small">Lock cutoff will be {dateUk(engine.lockCutoff(basics.asOf))}</span>
        </div>
      </Section>

      <div className="two-col">
        <Section title="Start from a clean slate" sub="Use this when you are setting FinanceHub up for someone new">
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <Field label="Main bank account name" hint="Income, day-to-day spending and the balance formula use this account">
              <input className="input" value={basics.main} onChange={(e) => setBasics({ ...basics, main: e.target.value })} />
            </Field>
            <Field label="Opening balance £" hint="The cleared balance on the Balance Anchor date">
              <input className="input" inputMode="decimal" value={basics.opening} onChange={(e) => setBasics({ ...basics, opening: e.target.value })} />
            </Field>
            <div className="notice warn">
              Clears imported accounts, people, cards, bills, transactions, holidays and provider ledgers.
              A full JSON backup downloads first; “Reset to imported workbook” in Settings restores the original.
            </div>
            <button className="btn danger" onClick={startFresh}>Start blank budget</button>
            <button className="btn" onClick={() => go('settings')}>Open all settings</button>
          </div>
        </Section>

        <Section title="2. Bank accounts" sub="Add every account whose balance you want to track; set one as the main account">
          <Table head={['Account', 'Balance', 'Main', '']}>
            {balances.map((a) => (
              <tr key={a.name}>
                <td><strong>{a.name}</strong></td>
                <td className="num">{gbp(a.balancePence)}</td>
                <td>{a.name === primary ? <Badge tone="green">Main</Badge> : <button className="btn ghost sm" onClick={() => update((d) => { d.settings.primaryAccount = a.name; })}>Make main</button>}</td>
                <td className="muted small">{a.targetPence ? `Target ${gbp(a.targetPence)}` : 'No target'}</td>
              </tr>
            ))}
          </Table>
          {balances.length === 0 && <Empty>No accounts yet. Add your main account below.</Empty>}
          <div className="inline-form">
            <Field label="Account name"><input className="input" placeholder="e.g. Current account" value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} /></Field>
            <Field label="Target £"><input className="input" inputMode="decimal" value={acct.target} onChange={(e) => setAcct({ ...acct, target: e.target.value })} /></Field>
            <Field label="Opening £"><input className="input" inputMode="decimal" value={acct.opening} onChange={(e) => setAcct({ ...acct, opening: e.target.value })} /></Field>
            <button className="btn primary" onClick={addAccount}>Add account</button>
          </div>
        </Section>
      </div>

      <Section title="3. People you lend to" sub="Optional — owed is opening + lent − repaid">
        <Table head={['Person', 'Opening', 'Owed', '']}>
          {engine.owedByPerson(ds.settings.asOfDate).map((p) => (
            <tr key={p.shortName}>
              <td><strong>{p.shortName}</strong><div className="muted small">{p.fullName}</div></td>
              <td className="num">{gbp(p.openingPence)}</td>
              <td className="num">{gbp(p.balancePence)}</td>
              <td />
            </tr>
          ))}
        </Table>
        {ds.people.length === 0 && <Empty>No people yet. Add someone if you track money lent and repaid.</Empty>}
        <div className="inline-form">
          <Field label="Short name"><input className="input" value={person.short} onChange={(e) => setPerson({ ...person, short: e.target.value })} /></Field>
          <Field label="Full name"><input className="input" value={person.full} onChange={(e) => setPerson({ ...person, full: e.target.value })} /></Field>
          <Field label="Opening £"><input className="input" inputMode="decimal" value={person.opening} onChange={(e) => setPerson({ ...person, opening: e.target.value })} /></Field>
          <button className="btn primary" onClick={addPerson}>Add person</button>
        </div>
      </Section>

      <Section title="4. Recurring bills" sub="Monthly bills are projected into open months; manage link sheets and one-off changes from Bills and Settings">
        <Table head={['Bill', 'Base', 'Due day', 'Method', '']}>
          {ds.bills.map((b) => (
            <tr key={b.name}>
              <td><strong>{b.name}</strong><div className="muted small">{b.linkedSheet ? `Linked to ${b.linkedSheet}` : 'Standalone'}</div></td>
              <td className="num">{gbp(b.baseAmountPence || b.amountPence)}</td>
              <td className="num">{b.dueDay || '—'}</td>
              <td className="muted small">{b.paymentMethod || '—'}</td>
              <td>{b.active ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Paused</Badge>}</td>
            </tr>
          ))}
        </Table>
        {ds.bills.length === 0 && <Empty>No bills yet. Add rent, utilities or subscriptions below.</Empty>}
        <div className="inline-form">
          <Field label="Bill name"><input className="input" value={bill.name} onChange={(e) => setBill({ ...bill, name: e.target.value })} /></Field>
          <Field label="Amount £"><input className="input" inputMode="decimal" value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} /></Field>
          <Field label="Due day"><input className="input" type="number" value={bill.due} onChange={(e) => setBill({ ...bill, due: e.target.value })} /></Field>
          <Field label="Method">
            <select className="select" value={bill.method} onChange={(e) => setBill({ ...bill, method: e.target.value })}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Linked sheet" hint="Add or edit link sheets under Bills">
            <select className="select" value={bill.sheet} onChange={(e) => setBill({ ...bill, sheet: e.target.value })}>
              <option value="">None</option>
              {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
            </select>
          </Field>
          <button className="btn primary" onClick={addBill}>Add bill</button>
        </div>
      </Section>

      <Section title="5. Rent agreement" sub="What you are liable for, the agreement and when the payment leaves each month">
        <div className="form-grid" style={{ padding: 16 }}>
          <Field label="Landlord or agent" hint="Used as the provider name in the menu">
            <input className="input" placeholder="e.g. Landlord" value={rentForm.providerName} onChange={(e) => setRentForm({ ...rentForm, providerName: e.target.value })} />
          </Field>
          <Field label="Rent you are liable for each month £" hint="The contractual monthly rent">
            <input className="input" inputMode="decimal" value={rentForm.monthlyRent} onChange={(e) => setRentForm({ ...rentForm, monthlyRent: e.target.value })} />
          </Field>
          <Field label="Agreement type">
            <select className="select" value={rentForm.agreementType} onChange={(e) => setRentForm({ ...rentForm, agreementType: e.target.value })}>
              {['Assured shorthold tenancy', 'Licence agreement', 'Lodger agreement', 'Owner-occupier mortgage', 'Other'].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Tenancy start"><input className="input" type="date" value={rentForm.tenancyStart} onChange={(e) => setRentForm({ ...rentForm, tenancyStart: e.target.value })} /></Field>
          <Field label="Payment each month £" hint="Defaults to the monthly rent">
            <input className="input" inputMode="decimal" value={rentForm.monthlyPayment} onChange={(e) => setRentForm({ ...rentForm, monthlyPayment: e.target.value })} />
          </Field>
          <Field label="Payment day" hint="The day the payment leaves each month (1–28)">
            <input className="input" type="number" min={1} max={28} value={rentForm.paymentDay} onChange={(e) => setRentForm({ ...rentForm, paymentDay: e.target.value })} />
          </Field>
          <Field label="Agreement details" hint="Deposit, term, break clause or anything you need to remember">
            <input className="input" value={rentForm.agreement} onChange={(e) => setRentForm({ ...rentForm, agreement: e.target.value })} />
          </Field>
          <Field label="Payment agreement" hint="Standing order, direct debit or arrangement">
            <input className="input" value={rentForm.paymentPlan} onChange={(e) => setRentForm({ ...rentForm, paymentPlan: e.target.value })} />
          </Field>
          <Field label="Weekly charge">
            <label className="muted small" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 34 }}>
              <input type="checkbox" checked={rentForm.weeklyRecurring} onChange={(e) => setRentForm({ ...rentForm, weeklyRecurring: e.target.checked })} />
              Add weekly rent charges as recurring ledger rows
            </label>
          </Field>
          <Field label="Weekly charge £" hint="Optional — one quarter of the monthly rent by default">
            <input className="input" inputMode="decimal" disabled={!rentForm.weeklyRecurring} value={rentForm.weeklyCharge} onChange={(e) => setRentForm({ ...rentForm, weeklyCharge: e.target.value })} />
          </Field>
        </div>
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <button className="btn primary" onClick={saveRentAgreement}>Save rent agreement</button>
          <span className="muted small">Creates the monthly Rent bill and, when enabled, the weekly Rent Charge rows.</span>
        </div>
      </Section>

      <ProviderSetupSection ds={ds} update={update} notify={notify} />

      <Section title="6. Add your first transactions" sub="Import a bank CSV or enter them directly — nothing is auto-posted">
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <button className="btn" onClick={() => go('import')}>Import a CSV</button>
          <button className="btn" onClick={() => go('transactions')}>Add manually</button>
          <div className="toolbar-spacer" />
          <button className="btn primary" onClick={() => go('dashboard')}>Finish — open dashboard</button>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div className="notice info">            People, bills and transactions are optional at first — you can reopen this page from Settings → Onboarding & reset.</div>
        </div>
      </Section>
    </>
  );
}
