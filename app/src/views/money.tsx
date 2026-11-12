import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Bar, Empty, Field, Money, Section, Table } from '../components';
import { dateUk, dateTimeUk, download, gbp, MONTH_LONG, parseMoney, pct, todayIso, toCsv } from '../format';
import { auditFieldChanges, deletedTransactions, formatAuditValue, recordHistory, revertAuditEntry, type AuditEntry } from '../../../core/audit';
import { advanceAsOfToLatestTransaction } from '../../../core/engine';
import { billSheetsFor, providerKeyForSheetName } from '../billSheets';
import { buildCardPaymentLegs, buildTransferLegs, findTransferPartner } from '../../../core/transfers';
import { PSEUDO_ACCOUNTS, accountClassifier, commentsMention, knownAccountNames, linkedAccountTransactions, linkedCommentSummary, unknownAccounts } from '../../../core/accounts';
import { categoryOptions, normaliseCategory, normaliseTags, tagOptions, tagsText, transactionMatches } from '../../../core/categories';

const BILL_METHODS = ['Direct Debit', 'Standing Order', 'Continuous Card Authority', 'Manual'];

function auditActionLabel(entry: AuditEntry): string {
  if (entry.action === 'update') return `Edited · ${entry.label}`;
  if (entry.action === 'delete') return `Deleted · ${entry.label}`;
  return `Added · ${entry.label}`;
}

export function Transactions({ ds, engine, month, setMonth, update, notify }: ViewProps) {
  const [q, setQ] = useState('');
  const [account, setAccount] = useState('All');
  const [type, setType] = useState('All');
  const [mFilter, setMFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [historyRow, setHistoryRow] = useState<number | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [loanPrefilled, setLoanPrefilled] = useState(false);
  const [form, setForm] = useState({
    date: todayIso(),
    account: ds.settings.primaryAccount || ds.accounts[0]?.name || '',
    to: ds.accounts.find((a) => a.name !== (ds.settings.primaryAccount || ds.accounts[0]?.name))?.name || '',
    type: 'Expense',
    amount: '',
    comments: '',
    treatment: '',
    category: '',
    tags: '',
  });

  const mainAccount = ds.settings.primaryAccount || ds.accounts[0]?.name || 'the main account';
  const kindOf = accountClassifier(ds);
  const accounts = useMemo(
    () => knownAccountNames(ds),
    [ds.accounts, ds.people, ds.cards],
  );
  const bankAccounts = useMemo(() => ds.accounts.map((a) => a.name), [ds.accounts]);
  const cardNames = useMemo(() => ds.cards.map((c) => c.name), [ds.cards]);
  const unknownNames = Array.from(new Set(ds.transactions.map((t) => t.account)))
    .filter((name) => kindOf(name) === 'unknown');
  const linkedUnknownNames = new Set(
    unknownNames.filter((name) => linkedCommentSummary(ds.transactions, name).rows > 0),
  );
  const linkedPersonNames = new Set(
    ds.people
      .filter((person) => person.trackOwed === false)
      .map((person) => person.shortName),
  );
  const editingRow = editing !== null ? ds.transactions.find((t) => t.row === editing) : undefined;
  const mappingRequired = Boolean(editingRow && kindOf(editingRow.account) === 'unknown' && form.account === editingRow.account);
  const formAccounts = form.type === 'Transfer'
    ? bankAccounts
    : form.type === 'Card payment'
      ? cardNames
      : mappingRequired
        ? [form.account, ...accounts.filter((name) => name !== form.account)]
        : accounts;
  const linkedTo = account !== 'All' && (kindOf(account) === 'unknown' || linkedPersonNames.has(account)) ? account : null;

  const rows = useMemo(() => ds.transactions
    .filter((t) => {
      if (account !== 'All' && t.account !== account && !(linkedTo && commentsMention(t.comments, linkedTo))) return false;
      if (type !== 'All' && t.type !== type) return false;
      if (mFilter !== 'All' && Number(t.date.slice(5, 7)) !== Number(mFilter)) return false;
      if (!transactionMatches(t, { category: categoryFilter, tag: tagFilter })) return false;
      if (q && !`${t.comments} ${t.account} ${t.type} ${t.amountPence} ${t.category ?? ''} ${tagsText(t.tags)}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row), [ds.transactions, account, linkedTo, type, mFilter, categoryFilter, tagFilter, q]);

  const linkedCount = linkedTo ? rows.filter((t) => t.account !== linkedTo).length : 0;
  const linkedExpensePence = linkedTo
    ? rows.reduce((sum, t) => sum + (t.type === 'Expense' ? t.amountPence : -t.amountPence), 0)
    : 0;

  useEffect(() => setPage(0), [q, account, type, mFilter, categoryFilter, tagFilter]);
  const categories = useMemo(() => categoryOptions(ds.transactions), [ds.transactions]);
  const tags = useMemo(() => tagOptions(ds.transactions), [ds.transactions]);
  const category = normaliseCategory(form.category);
  const formTags = normaliseTags(form.tags);

  const pageSize = 60;
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const history = historyRow === null ? [] : recordHistory(ds, 'transactions', String(historyRow));
  const deleted = deletedTransactions(ds);

  const exportRows = () => {
    download('financehub-transactions.csv', toCsv([
      ['Date', 'Account', 'Type', 'Amount', 'Comments', 'Category', 'Tags', 'Treatment', 'Status'],
      ...rows.map((t) => [t.date, t.account, t.type, (t.amountPence / 100).toFixed(2), t.comments, t.category ?? '', tagsText(t.tags), t.budgetTreatment, t.status]),
    ]));
    notify(`Exported ${rows.length} transactions`);
  };

  const updateTransaction = (mutator: (dataset: typeof ds) => void) =>
    update((d) => {
      mutator(d);
      advanceAsOfToLatestTransaction(d, todayIso());
    });

  const submit = () => {
    const amount = Math.abs(parseMoney(form.amount));
    if (!form.date || amount === 0) { notify('Enter a date and a non-zero amount'); return; }
    if (kindOf(form.account) === 'unknown' || (form.type === 'Transfer' && kindOf(form.to) === 'unknown')) {
      notify('Choose a known bank, person, card, Petrol or Other before saving');
      return;
    }
    if (form.type === 'Transfer' && (!form.to || form.to === form.account)) {
      notify('Choose two different accounts to transfer between');
      return;
    }
    if (form.type === 'Card payment' && (kindOf(form.account) !== 'card' || kindOf(form.to) !== 'bank')) {
      notify('Choose a card and the bank account paying it');
      return;
    }
    const y = Number(form.date.slice(0, 4));
    const m = Number(form.date.slice(5, 7));
    if (engine.monthlySummary(y, m).locked) {
      notify('That month is locked — choose an open month or unlock it first');
      return;
    }
    if (editing !== null) {
      const original = ds.transactions.find((t) => t.row === editing);
      if (!original) { notify('That transaction no longer exists'); setEditing(null); setAdding(false); return; }
      const originalAccount = original.account;
      if (engine.monthlySummary(Number(original.date.slice(0, 4)), Number(original.date.slice(5, 7))).locked) {
        notify('That entry is in a locked month — unlock it first');
        return;
      }
      if (form.type === 'Card payment') {
        updateTransaction((d) => {
          const row = d.transactions.find((t) => t.row === editing);
          if (!row) return;
          const partner = findTransferPartner(d.transactions, row);
          const outgoingRow = row.type === 'Expense' ? row.row : partner?.row;
          const incomingRow = row.type === 'Income' ? row.row : partner?.row;
          const drop = new Set([row.row, partner?.row].filter((n): n is number => typeof n === 'number'));
          const maxRow = Math.max(0, ...d.transactions.map((t) => t.row));
          const legs = buildCardPaymentLegs({
            date: form.date,
            from: form.to,
            card: form.account,
            amountPence: amount,
            comments: form.comments,
            firstRow: outgoingRow ?? row.row,
          });
          legs[0].row = outgoingRow ?? row.row;
          legs[1].row = incomingRow ?? maxRow + 1;
          if (legs[1].row === legs[0].row) legs[1].row = Math.max(maxRow, ...legs.map((l) => l.row)) + 1;
          for (const leg of legs) { leg.category = category; leg.tags = formTags; }
          d.transactions = [...d.transactions.filter((t) => !drop.has(t.row)), legs[0], legs[1]];
        });
        setEditing(null);
        setForm({ ...form, amount: '', comments: '' });
        setAdding(false);
        notify(`Card payment updated — ${gbp(amount)} from ${form.to} to ${form.account}`);
        return;
      }
      if (form.type === 'Transfer') {
        updateTransaction((d) => {
          const row = d.transactions.find((t) => t.row === editing);
          if (!row) return;
          const partner = findTransferPartner(d.transactions, row);
          const outgoingRow = row.type === 'Expense' ? row.row : partner?.row;
          const incomingRow = row.type === 'Income' ? row.row : partner?.row;
          const drop = new Set([row.row, partner?.row].filter((n): n is number => typeof n === 'number'));
          const legs = buildTransferLegs({
            date: form.date,
            from: form.account,
            to: form.to,
            amountPence: amount,
            comments: form.comments,
            firstRow: outgoingRow ?? row.row,
          });
          legs[0].row = outgoingRow ?? row.row;
          legs[1].row = incomingRow ?? Math.max(0, ...d.transactions.map((t) => t.row)) + 1;
          if (legs[1].row === legs[0].row) legs[1].row = Math.max(...legs.map((l) => l.row)) + 1;
          for (const leg of legs) { leg.category = category; leg.tags = formTags; }
          d.transactions = [...d.transactions.filter((t) => !drop.has(t.row)), legs[0], legs[1]];
        });
        setEditing(null);
        setForm({ ...form, amount: '', comments: '' });
        setAdding(false);
        notify(`Transfer updated — ${gbp(amount)} from ${form.account} to ${form.to}`);
        return;
      }
      updateTransaction((d) => {
        const row = d.transactions.find((t) => t.row === editing);
        if (!row) return;
        const partner = findTransferPartner(d.transactions, row);
        if (partner) d.transactions = d.transactions.filter((t) => t.row !== partner.row);
        const updated = d.transactions.find((t) => t.row === editing);
        if (!updated) return;
        updated.date = form.date;
        updated.account = form.account;
        updated.type = form.type;
        updated.amountPence = amount;
        updated.comments = form.comments;
        updated.budgetTreatment = form.treatment;
        updated.category = category;
        updated.tags = formTags;
        if (kindOf(originalAccount) === 'unknown' && kindOf(form.account) !== 'unknown') {
          d.changelog = d.changelog ?? [];
          (d.changelog as any[]).unshift({
            date: todayIso(),
            sheetCell: 'Account mapping',
            description: `Mapped “${originalAccount}” to “${form.account}”.`,
            details: [`Transaction row ${original.row} · ${original.date}`],
            custom: true,
            at: new Date().toISOString(),
          });
        }
      });
      setEditing(null);
      setForm({ ...form, amount: '', comments: '' });
      setAdding(false);
      notify('Transaction updated');
      return;
    }
    if (form.type === 'Card payment') {
      updateTransaction((d) => {
        const firstRow = Math.max(0, ...d.transactions.map((t) => t.row)) + 1;
        const legs = buildCardPaymentLegs({
          date: form.date,
          from: form.to,
          card: form.account,
          amountPence: amount,
          comments: form.comments,
          firstRow,
        });
        for (const leg of legs) { leg.category = category; leg.tags = formTags; }
        d.transactions.push(...legs);
      });
      setForm({ ...form, amount: '', comments: '' });
      setAdding(false);
      notify(`Card payment recorded — ${gbp(amount)} from ${form.to} to ${form.account}`);
      return;
    }
    if (form.type === 'Transfer') {
      updateTransaction((d) => {
        const firstRow = Math.max(0, ...d.transactions.map((t) => t.row)) + 1;
        const legs = buildTransferLegs({
          date: form.date,
          from: form.account,
          to: form.to,
          amountPence: amount,
          comments: form.comments,
          firstRow,
        });
        for (const leg of legs) { leg.category = category; leg.tags = formTags; }
        d.transactions.push(...legs);
      });
      setForm({ ...form, amount: '', comments: '' });
      setAdding(false);
      notify(`Transfer recorded — ${gbp(amount)} from ${form.account} to ${form.to}`);
      return;
    }
    updateTransaction((d) => {
      const row = Math.max(0, ...d.transactions.map((t) => t.row)) + 1;
      d.transactions.push({
        row,
        date: form.date,
        account: form.account,
        type: form.type,
        amountPence: amount,
        comments: form.comments,
        status: '',
        budgetTreatment: form.treatment,
        category,
        tags: formTags,
      });
    });
    setForm({ ...form, amount: '', comments: '' });
    setAdding(false);
    notify('Transaction added — dashboard and monthly view updated');
  };

  const startEdit = (t: any) => {
    const partner = findTransferPartner(ds.transactions, t);
    const paired = t.budgetTreatment === 'Transfer' && !!partner;
    const cardPayment = paired && (kindOf(t.account) === 'card' || kindOf(partner?.account) === 'card');
    const cardAccount = cardPayment
      ? [t.account, partner?.account].find((name) => name && kindOf(name) === 'card') ?? ''
      : '';
    const bankAccount = cardPayment
      ? [t.account, partner?.account].find((name) => name && kindOf(name) === 'bank') ?? mainAccount
      : '';
    setForm({
      date: t.date,
      account: cardPayment ? cardAccount : paired ? (t.type === 'Expense' ? t.account : partner?.account ?? '') : t.account,
      to: cardPayment ? bankAccount : paired ? (t.type === 'Expense' ? partner?.account ?? '' : t.account) : (bankAccounts.find((a) => a !== t.account) ?? ''),
      type: cardPayment ? 'Card payment' : paired ? 'Transfer' : t.type,
      amount: (t.amountPence / 100).toFixed(2),
      comments: t.comments,
      treatment: paired ? 'Transfer' : t.budgetTreatment,
      category: t.category ?? '',
      tags: tagsText(t.tags),
    });
    setEditing(t.row);
    setAdding(true);
  };

  const changeTransactionType = (next: string) => {
    if (next === 'Card payment') {
      setForm((f) => ({
        ...f,
        type: next,
        account: cardNames.includes(f.account) ? f.account : cardNames[0] ?? '',
        to: mainAccount,
        treatment: 'Transfer',
      }));
      return;
    }
    if (next === 'Transfer') {
      setForm((f) => {
        const account = bankAccounts.includes(f.account) ? f.account : mainAccount;
        const to = bankAccounts.includes(f.to) && f.to !== account
          ? f.to
          : bankAccounts.find((name) => name !== account) ?? '';
        return { ...f, type: next, account, to, treatment: 'Transfer' };
      });
      return;
    }
    setForm((f) => ({
      ...f,
      type: next,
      treatment: f.treatment === 'Transfer' ? '' : f.treatment,
    }));
  };

  const removeTx = (t: any) => {
    const partner = findTransferPartner(ds.transactions, t);
    const locked = (date: string) => engine.monthlySummary(Number(date.slice(0, 4)), Number(date.slice(5, 7))).locked;
    if (locked(t.date) || (partner && locked(partner.date))) {
      notify('That entry is in a locked month — unlock it first');
      return;
    }
    const question = partner
      ? `Delete both legs of this ${gbp(t.amountPence)} transfer?`
      : `Delete this ${gbp(t.amountPence)} ${String(t.type).toLowerCase()}?`;
    if (!confirm(question)) return;
    const drop = new Set([t.row, partner?.row].filter((n): n is number => typeof n === 'number'));
    update((d) => { d.transactions = d.transactions.filter((x) => !drop.has(x.row)); });
    if (editing !== null && drop.has(editing)) { setEditing(null); setAdding(false); }
    if (historyRow !== null && drop.has(historyRow)) setHistoryRow(null);
    notify(partner ? 'Transfer deleted — both legs removed' : 'Transaction deleted');
  };

  const revertEntry = (entry: AuditEntry) => {
    const date = String(entry.before?.date ?? entry.after?.date ?? '');
    if (entry.section === 'transactions' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const y = Number(date.slice(0, 4));
      const m = Number(date.slice(5, 7));
      if (engine.monthlySummary(y, m).locked) {
        notify('That entry is in a locked month — unlock it first');
        return;
      }
    }
    const preview = structuredClone(ds);
    const result = revertAuditEntry(preview, entry.id);
    if (!result.ok) { notify(result.message); return; }
    update((d) => { revertAuditEntry(d, entry.id); });
    notify(result.message);
  };

  return (
    <>
      <Section
        title="Transaction log"
        sub={`${rows.length} of ${ds.transactions.length} rows · locked months are read-only`}
        actions={<div className="page-actions">
          <button className="btn" onClick={() => setShowTrash((open) => !open)}>
            Trash{deleted.length ? ` (${deleted.length})` : ''}
          </button>
          <button className="btn" onClick={exportRows}>Export CSV</button>
          <button
            className="btn primary"
            onClick={() => {
              if (!adding) {
                const prefill = kindOf(form.account) === 'person' && !form.comments.trim();
                setForm((f) => ({ ...f, comments: prefill ? 'Loan' : f.comments }));
                setLoanPrefilled(prefill);
              }
              setEditing(null);
              setAdding((a) => !a);
            }}
          >{adding ? 'Close' : 'Add transaction'}</button>
        </div>}
      >
        <div className="toolbar">
          <input className="input" placeholder="Search comments, account or amount…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account filter">
            <option value="All">All accounts</option>
            {[...accounts, ...unknownNames].map((a) => {
              const suffix = linkedUnknownNames.has(a) ? 'linked account' : unknownNames.includes(a) ? 'needs review' : '';
              return <option key={a} value={a}>{suffix ? `${a} — ${suffix}` : a}</option>;
            })}
          </select>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type filter">
            <option value="All">All types</option>
            <option value="Income">Income</option>
            <option value="Expense">Expense</option>
          </select>
          <select className="select" value={mFilter} onChange={(e) => setMFilter(e.target.value)} aria-label="Month filter">
            <option value="All">All months</option>
            {MONTH_LONG.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category filter">
            <option value="All">All categories</option>
            {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          <select className="select" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Tag filter">
            <option value="All">All tags</option>
            {tags.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          <button className="btn ghost" onClick={() => { setQ(''); setAccount('All'); setType('All'); setMFilter('All'); setCategoryFilter('All'); setTagFilter('All'); }}>Clear</button>
        </div>

        {adding && (
          <div className="inline-form">
            <Field label="Date"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label={form.type === 'Transfer' ? 'From account' : form.type === 'Card payment' ? 'Card' : 'Account'}>
              <select
                className="select"
                value={form.account}
                onChange={(e) => {
                  const next = e.target.value;
                  const person = kindOf(next) === 'person';
                  const prefill = editing === null && person && !form.comments.trim();
                  const clearAuto = editing === null && !person && loanPrefilled && form.comments === 'Loan';
                  setForm((f) => ({
                    ...f,
                    account: next,
                    to: f.to === next ? bankAccounts.find((a) => a !== next) ?? '' : f.to,
                    comments: prefill ? 'Loan' : clearAuto ? '' : f.comments,
                  }));
                  if (prefill) setLoanPrefilled(true);
                  if (clearAuto) setLoanPrefilled(false);
                }}
              >
                {formAccounts.map((a) => (
                  <option key={a} value={a}>{a === editingRow?.account && mappingRequired ? `${a} — ${linkedUnknownNames.has(a) ? 'linked account' : 'needs review'}` : a}</option>
                ))}
              </select>
            </Field>
            {mappingRequired && (
              <div className="notice warn" style={{ flexBasis: '100%' }}>
                “{form.account}” is not a bank, person, card or pseudo-account. Choose a known account to save this row.
              </div>
            )}
            {(form.type === 'Transfer' || form.type === 'Card payment') && (
              <Field label={form.type === 'Card payment' ? 'Pay from account' : 'To account'}>
                <select className="select" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
                  {bankAccounts.filter((a) => a !== form.account).map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
            )}
            <Field label="Type">
              <select className="select" value={form.type} onChange={(e) => changeTransactionType(e.target.value)}>
                <option>Expense</option><option>Income</option><option>Transfer</option>
                {cardNames.length > 0 && <option>Card payment</option>}
              </select>
            </Field>
            <Field label="Amount (£)"><input className="input" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Comments"><input className="input" value={form.comments} onChange={(e) => { setLoanPrefilled(false); setForm({ ...form, comments: e.target.value }); }} /></Field>
            <Field label="Category">
              <input className="input" list="transaction-categories" placeholder="e.g. Food" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <datalist id="transaction-categories">{categories.map((entry) => <option key={entry} value={entry} />)}</datalist>
            </Field>
            <Field label="Tags" hint="Comma-separated; up to 8">
              <input className="input" placeholder="weekly, tesco" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </Field>
            {form.type === 'Card payment' && (
              <div className="notice info" style={{ flexBasis: '100%' }}>
                This creates two linked legs: the chosen bank account falls and the card balance falls. It is a transfer, not extra spending.
              </div>
            )}
            {form.type !== 'Transfer' && form.type !== 'Card payment' && (
              <Field label="Budget treatment">
                <select className="select" value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })}>
                  <option value="">Normal</option><option value="Transfer">Transfer</option><option value="Refund">Card refund</option><option value="Ambiguous">Ambiguous</option>
                </select>
              </Field>
            )}
            <button className="btn primary" onClick={submit}>{editing !== null ? 'Save changes' : 'Save'}</button>
            {editing !== null && (
              <button className="btn ghost" onClick={() => { setEditing(null); setAdding(false); setForm({ ...form, amount: '', comments: '' }); }}>Cancel</button>
            )}
          </div>
        )}

        {linkedTo && linkedCount > 0 && (
          <div style={{ padding: '12px 14px 0' }}>
            <div className="notice info">
              Showing {rows.length} rows for {linkedTo}: {gbp(linkedExpensePence)} combined. {linkedCount} are linked by a comment and stay on their original account; they are not moved or recounted.
            </div>
          </div>
        )}
        {linkedTo && linkedCount === 0 && linkedPersonNames.has(linkedTo) && (
          <div style={{ padding: '12px 14px 0' }}>
            <div className="notice info">
              Showing {rows.length} rows for {linkedTo}: {gbp(linkedExpensePence)}. It reduces {mainAccount} but adds £0.00 to People who owe me.
            </div>
          </div>
        )}

        <Table head={['Date', 'Account', 'Type', 'Amount', 'Comments', 'Category', 'Tags', 'Treatment', 'Status', 'Actions']} numHead={[3]}>
          {pageRows.map((t) => (
            <tr key={t.row}>
              <td className="nowrap muted">{dateUk(t.date)}</td>
              <td>
                {t.account}{' '}
                {kindOf(t.account) === 'unknown' && (linkedUnknownNames.has(t.account)
                  ? <Badge tone="blue">Linked account</Badge>
                  : <Badge tone="amber">Needs review</Badge>)}
                {linkedTo && t.account !== linkedTo && <Badge tone="blue">Linked to {linkedTo}</Badge>}
              </td>
              <td><Badge tone={t.type === 'Income' ? 'green' : 'neutral'}>{t.type}</Badge></td>
              <td className={`num ${t.type === 'Income' ? 'amount pos' : 'amount neg'}`}>{t.type === 'Income' ? '+' : '−'}{gbp(t.amountPence).replace('£', '£')}</td>
              <td className="muted">{t.comments || '—'}</td>
              <td>{t.category ? <Badge tone="blue">{t.category}</Badge> : <span className="faint">—</span>}</td>
              <td className="muted small">{(t.tags ?? []).length ? t.tags!.join(', ') : '—'}</td>
              <td>{t.budgetTreatment ? <Badge tone={t.budgetTreatment === 'Transfer' ? 'blue' : 'violet'}>{t.budgetTreatment}</Badge> : <span className="faint">Normal</span>}</td>
              <td>{t.status ? <Badge tone="amber">{t.status}</Badge> : <Badge tone="green">Open</Badge>}</td>
              <td className="nowrap">
                <button className="btn ghost sm" onClick={() => setHistoryRow(t.row)}>History</button>{' '}
                <button className="btn ghost sm" onClick={() => startEdit(t)}>Edit</button>{' '}
                <button className="btn ghost sm" onClick={() => removeTx(t)}>Delete</button>
              </td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 && <Empty>No transactions match these filters.</Empty>}
        {historyRow !== null && (
          <div className="panel" style={{ margin: 12 }}>
            <header className="panel-head">
              <div>
                <h2>Transaction history</h2>
                <p>Row {historyRow} · newest first. Reverting restores the recorded previous values.</p>
              </div>
              <button className="btn ghost sm" onClick={() => setHistoryRow(null)}>Close</button>
            </header>
            <div className="list">
              {history.length === 0 && <Empty>No recorded changes for this row yet.</Empty>}
              {history.map((entry) => (
                <div className="list-row" key={entry.id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="title">{auditActionLabel(entry)}</div>
                    <div className="sub">{dateTimeUk(entry.at)}</div>
                    {auditFieldChanges(entry).slice(0, 6).map((change) => (
                      <div className="sub" key={change.field}>
                        {change.field}: {formatAuditValue(change.field, change.before)} → {formatAuditValue(change.field, change.after)}
                      </div>
                    ))}
                    {entry.revertedAt && <div className="sub">Reverted {dateTimeUk(entry.revertedAt)}</div>}
                    {entry.restoredAt && <div className="sub">Restored {dateTimeUk(entry.restoredAt)}</div>}
                  </div>
                  {!entry.revertedAt && !entry.restoredAt && (
                    <button className="btn ghost sm" onClick={() => revertEntry(entry)}>Revert</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {showTrash && (
          <div className="panel" style={{ margin: 12 }}>
            <header className="panel-head">
              <div>
                <h2>Recently deleted</h2>
                <p>Deleted transactions stay here until restored. Locked months still reject changes.</p>
              </div>
              <button className="btn ghost sm" onClick={() => setShowTrash(false)}>Close</button>
            </header>
            <div className="list">
              {deleted.length === 0 && <Empty>No deleted transactions.</Empty>}
              {deleted.map((entry) => (
                <div className="list-row" key={entry.id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="title">{entry.label}</div>
                    <div className="sub">Deleted {dateTimeUk(entry.at)}</div>
                  </div>
                  <button className="btn ghost sm" onClick={() => revertEntry(entry)}>Restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="toolbar" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>
          <span className="muted small">Page {page + 1} of {pages}</span>
          <div className="toolbar-spacer" />
          <button className="btn sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</button>
          <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>Next</button>
        </div>
      </Section>
    </>
  );
}

export function Accounts({ ds, engine, year, month }: ViewProps) {
  const asOf = engine.throughFor(year, month);
  const balances = engine.accountBalances(asOf);
  const [selected, setSelected] = useState(
    ds.accounts.find((a) => a.name === (ds.settings.primaryAccount || ds.accounts[0]?.name))?.name ?? balances[0]?.name ?? '',
  );
  const mainAccount = ds.settings.primaryAccount || ds.accounts[0]?.name || 'the main account';
  const recent = ds.transactions
    .filter((t) => t.account === selected)
    .sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row)
    .slice(0, 12);
  const pseudoAccounts = PSEUDO_ACCOUNTS.map((name) => {
    const rows = ds.transactions.filter((t) => t.account === name && t.date <= asOf && t.type === 'Expense' && t.budgetTreatment !== 'Transfer');
    return { name, rows: rows.length, totalPence: rows.reduce((sum, t) => sum + t.amountPence, 0) };
  });
  const excludedAccounts = unknownAccounts(ds.transactions, ds, asOf).map((account) => ({
    ...account,
    linked: linkedCommentSummary(ds.transactions, account.name, asOf),
    ledger: linkedAccountTransactions(ds.transactions, account.name, asOf)
      .sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row),
    reviewPence: account.expensePence + linkedCommentSummary(ds.transactions, account.name, asOf).expensePence,
  }));
  const linkedPeople = ds.people
    .filter((person) => person.trackOwed === false)
    .map((person) => {
      const rows = ds.transactions.filter((t) => t.account === person.shortName && t.date <= asOf);
      const expensePence = rows.filter((t) => t.type === 'Expense').reduce((s, t) => s + t.amountPence, 0);
      const linked = linkedCommentSummary(ds.transactions, person.shortName, asOf);
      const ledger = linkedAccountTransactions(ds.transactions, person.shortName, asOf)
        .sort((a, b) => b.date.localeCompare(a.date) || b.row - a.row);
      return { name: person.shortName, rows: rows.length, expensePence, linked, ledger, reviewPence: expensePence + linked.expensePence };
    });
  const linkedAccounts = [...excludedAccounts, ...linkedPeople].filter((account) => account.ledger.length > 0);

  return (
    <>
      <Section title="Bank accounts" sub={`Balances as of ${dateUk(asOf)} · targets are managed in Settings`}>
        <Table head={['Account', 'Opening', 'Balance', 'Target', 'Progress', 'Active']} numHead={[1, 2, 3]}>
          {balances.map((a) => (
            <tr key={a.name} className={a.name === selected ? 'selected' : ''} onClick={() => setSelected(a.name)} style={{ cursor: 'pointer' }}>
              <td><strong>{a.name}</strong></td>
              <td className="num muted">{gbp(a.openingPence)}</td>
              <td className="num"><strong>{gbp(a.balancePence)}</strong></td>
              <td className="num muted">{gbp(a.targetPence)}</td>
              <td style={{ width: 150 }}><Bar value={a.targetPence === 0 ? 0 : a.balancePence / a.targetPence} /></td>
              <td>{a.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section
        title="Pseudo-accounts and excluded rows"
        sub="Petrol and Other are spend categories, not bank accounts. Accounts marked not counted stay in the transaction log but are excluded from every total, matching the workbook. Comment mentions link rows for review without moving or recounting them."
      >
        <Table head={['Account', 'Rows to as-of', 'Expense total', 'Treatment']} numHead={[1, 2]}>
          {pseudoAccounts.map((account) => (
            <tr key={account.name}>
              <td><strong>{account.name}</strong></td>
              <td className="num">{account.rows}</td>
              <td className="num"><strong>{gbp(account.totalPence)}</strong></td>
              <td><Badge tone="blue">Included in expenses</Badge></td>
            </tr>
          ))}
        </Table>
        {excludedAccounts.length > 0 && (
          <Table head={['Account in the log', 'Account rows', 'Combined total', 'Linked rows', 'Treatment']} numHead={[1, 2, 3]}>
            {excludedAccounts.map((account) => (
              <tr key={account.name}>
                <td><strong>{account.name}</strong></td>
                <td className="num">{account.rows}</td>
                <td className="num">
                  <strong>{gbp(account.reviewPence)}</strong>
                  <div className="muted small">{gbp(account.expensePence)} direct + {gbp(account.linked.expensePence)} linked</div>
                </td>
                <td className="num">{account.linked.rows > 0 ? account.linked.rows : <span className="faint">None</span>}</td>
                <td><Badge tone="amber">Not counted</Badge></td>
              </tr>
            ))}
          </Table>
        )}
        <div style={{ padding: '0 16px 16px' }}>
          <div className="notice info">
            Petrol and Other are pseudo-accounts: their spending is counted in monthly expenses but they are not bank accounts, so they do not appear in account balances or the Statement bank list. Rows whose account matches no ledger are preserved but excluded from totals; review or reassign them in Transactions. Comment-linked rows are shown for Dan-style matches but remain counted on their original account.
          </div>
        </div>
      </Section>

      {linkedAccounts.map((account) => (
        <Fragment key={`${account.name}-linked`}>
          <Section
            title={`${account.name} — linked account`}
          sub={account.linked.rows > 0
            ? `Every row booked to ${account.name} or mentioning it in comments. ${account.linked.rows} linked rows stay on their original accounts.`
            : `Every row is booked to ${account.name}.`}
        >
          <div className="metric-list" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className="metric"><span>Rows</span><strong>{account.ledger.length}</strong></div>
            <div className="metric"><span>{account.name} owes — combined</span><strong>{gbp(account.reviewPence)}</strong></div>
            <div className="metric"><span>People who owe me impact</span><strong>{gbp(0)}</strong></div>
          </div>
          <Table head={['Date', 'Booked account', 'Type', 'Amount', 'Comments', 'Link']} numHead={[3]}>
            {account.ledger.map((t) => (
              <tr key={t.row}>
                <td className="nowrap muted">{dateUk(t.date)}</td>
                <td>{t.account}</td>
                <td><Badge tone={t.type === 'Income' ? 'green' : 'neutral'}>{t.type}</Badge></td>
                <td className={`num ${t.type === 'Income' ? 'amount pos' : 'amount neg'}`}>{t.type === 'Income' ? '+' : '−'}{gbp(t.amountPence)}</td>
                <td className="muted">{t.comments || '—'}</td>
                <td>{t.account === account.name ? <Badge tone="amber">Booked to {account.name}</Badge> : <Badge tone="blue">Linked by comment</Badge>}</td>
              </tr>
            ))}
          </Table>
          <div style={{ padding: '0 16px 16px' }}>
            <div className="notice info">
              {account.linked.rows > 0
                ? `The combined ${gbp(account.reviewPence)} is ${gbp(account.expensePence)} booked to ${account.name} plus ${gbp(account.linked.expensePence)} linked from other accounts. The ${account.linked.rows} linked rows remain on their original accounts and keep reducing those balances — nothing is moved. This ledger is a review view and adds £0.00 to People who owe me.`
                : `All ${account.ledger.length} rows are booked to ${account.name} and reduce ${mainAccount}. This account adds £0.00 to People who owe me.`}
            </div>
          </div>
          </Section>
        </Fragment>
      ))}

      <Section title={`${selected} — recent activity`} sub="Ledger view; transfers remain visible here but not in budget totals">
        <Table head={['Date', 'Type', 'Amount', 'Comments', 'Treatment']} numHead={[2]}>
          {recent.map((t) => (
            <tr key={t.row}>
              <td className="muted">{dateUk(t.date)}</td>
              <td><Badge tone={t.type === 'Income' ? 'green' : 'neutral'}>{t.type}</Badge></td>
              <td className={`num ${t.type === 'Income' ? 'amount pos' : 'amount neg'}`}>{gbp(t.amountPence)}</td>
              <td className="muted">{t.comments || '—'}</td>
              <td>{t.budgetTreatment || 'Normal'}</td>
            </tr>
          ))}
        </Table>
        {recent.length === 0 && <Empty>No transactions on this account.</Empty>}
      </Section>
    </>
  );
}

export function Cards({ ds, engine, year, month }: ViewProps) {
  const asOf = engine.throughFor(year, month);
  const cards = engine.cardBalances(asOf);
  const totalBalance = cards.reduce((s, c) => s + c.balancePence, 0);
  const totalLimit = cards.reduce((s, c) => s + c.limitPence, 0);
  return (
    <>
      <div className="kpi-grid">
        <div className="card"><div className="card-title">Total balance</div><div className="kpi-value">{gbp(totalBalance)}</div></div>
        <div className="card"><div className="card-title">Total limit</div><div className="kpi-value">{gbp(totalLimit)}</div></div>
        <div className="card"><div className="card-title">Utilisation</div><div className="kpi-value">{pct(totalLimit === 0 ? 0 : totalBalance / totalLimit)}</div></div>
        <div className="card"><div className="card-title">Available</div><div className="kpi-value pos">{gbp(totalLimit - totalBalance)}</div></div>
      </div>
      <Section title="Credit cards" sub="Balance = opening + charges − refunds/payments">
        <Table head={['Card', 'Opening', 'Balance', 'Limit', 'Available', 'Used', '']} numHead={[1, 2, 3, 4, 5]}>
          {cards.map((c) => (
            <tr key={c.name}>
              <td><strong>{c.name}</strong></td>
              <td className="num muted">{gbp(c.openingPence)}</td>
              <td className="num"><strong>{gbp(c.balancePence)}</strong></td>
              <td className="num muted">{gbp(c.limitPence)}</td>
              <td className="num">{gbp(c.availablePence)}</td>
              <td className="num">{pct(c.utilisation)}</td>
              <td style={{ width: 100 }}><Bar value={c.utilisation} tone={c.utilisation > 0.5 ? 'red' : 'accent'} /></td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}

export function People({ ds, engine, year, month }: ViewProps) {
  const asOf = engine.throughFor(year, month);
  const people = engine.owedByPerson(asOf);
  return (
    <Section title="People accounts" sub="Owed = opening + lent − repaid · accounts are managed in Settings">
      <Table head={['Person', 'Full name', 'Opening', 'Lent', 'Repaid', 'Owed']} numHead={[2, 3, 4, 5]}>
        {people.map((p) => {
          const lent = ds.transactions.filter((t) => t.account === p.shortName && t.type === 'Expense').reduce((s, t) => s + t.amountPence, 0);
          const repaid = ds.transactions.filter((t) => t.account === p.shortName && t.type === 'Income').reduce((s, t) => s + t.amountPence, 0);
          return (
            <tr key={p.shortName}>
              <td><strong>{p.shortName}</strong></td>
              <td className="muted">{p.fullName}</td>
              <td className="num muted">{gbp(p.openingPence)}</td>
              <td className="num">{gbp(lent)}</td>
              <td className="num">{gbp(repaid)}</td>
              <td className="num">
                <strong>{gbp(p.balancePence)}</strong>
                {p.trackOwed === false && <div className="muted small">No amount owed</div>}
              </td>
            </tr>
          );
        })}
      </Table>
    </Section>
  );
}

function EditableName({ value, onCommit, ariaLabel }: { value: string; onCommit: (next: string) => void; ariaLabel: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (!next) { setDraft(value); return; }
    if (next !== value) onCommit(next);
  };
  return (
    <input
      className="table-input"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); }
      }}
    />
  );
}

export function Bills({ ds, engine, year, month, update, notify }: ViewProps) {
  const scheduled = engine.scheduledBills(year, month);
  const sheets = billSheetsFor(ds);
  const [sheetDraft, setSheetDraft] = useState('');
  const [billDraft, setBillDraft] = useState({ name: '', amount: '', due: '27', method: 'Direct Debit', sheet: '', account: '' });
  const planning = year > ds.settings.targetYear;
  const planStart = `${year}-01-01`;
  const planEnd = `${year}-12-31`;
  const planChangeFor = (changes: typeof ds.billChanges, name: string) => {
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const change = changes[index];
      if (change.bill === name && change.appliesFrom === planStart && change.appliesTo === planEnd) return change;
    }
    return undefined;
  };
  const yearChange = (name: string) => planChangeFor(ds.billChanges, name);
  const setPlan = (name: string, patch: { amountOverridePence?: number | null; dueDayOverride?: number | null; skip?: boolean }) => update((d) => {
    let change = planChangeFor(d.billChanges, name);
    if (!change) {
      change = {
        bill: name,
        appliesFrom: planStart,
        appliesTo: planEnd,
        amountOverridePence: null,
        dueDateOverride: '',
        dueDayOverride: null,
        changeType: `Year plan ${year}`,
        note: `Planned for ${year}`,
        skip: false,
      };
      d.billChanges.push(change);
    }
    Object.assign(change, patch);
    if (change.amountOverridePence == null && !change.dueDateOverride && typeof change.dueDayOverride !== 'number' && !change.skip) {
      d.billChanges = d.billChanges.filter((entry) => entry !== change);
    }
  });
  const planAmount = (bill: typeof ds.bills[number]) => yearChange(bill.name)?.amountOverridePence ?? engine.billAmount(bill, year, 1);
  const planDueDay = (bill: typeof ds.bills[number]) => yearChange(bill.name)?.dueDayOverride ?? bill.dueDay;

  const addSheet = () => {
    const name = sheetDraft.trim();
    if (!name) return notify('Give the link sheet a name');
    if (sheets.some((sheet) => sheet.name.toLowerCase() === name.toLowerCase())) return notify('That link sheet already exists');
    update((d) => {
      d.settings.billSheets = [...billSheetsFor(d), { name, providerKey: providerKeyForSheetName(name) }];
    });
    setSheetDraft('');
    setBillDraft((current) => ({ ...current, sheet: name }));
    notify(`${name} added — you can select it for a bill now`);
  };

  const renameSheet = (oldName: string, newName: string) => {
    if (sheets.some((sheet) => sheet.name !== oldName && sheet.name.toLowerCase() === newName.toLowerCase())) return notify('That link sheet already exists');
    update((d) => {
      d.settings.billSheets = billSheetsFor(d).map((sheet) => sheet.name === oldName ? { ...sheet, name: newName } : sheet);
      d.bills.forEach((b) => { if (b.linkedSheet === oldName) b.linkedSheet = newName; });
    });
    setBillDraft((current) => current.sheet === oldName ? { ...current, sheet: newName } : current);
    notify(`${oldName} renamed to ${newName}`);
  };

  const removeSheet = (name: string) => {
    const used = ds.bills.filter((b) => b.linkedSheet === name).length;
    const detail = used ? ` ${used} bill${used === 1 ? '' : 's'} will become standalone; the provider ledger itself is not deleted.` : '';
    if (!confirm(`Remove link sheet “${name}”?${detail}`)) return;
    update((d) => {
      d.settings.billSheets = billSheetsFor(d).filter((sheet) => sheet.name !== name);
      d.bills.forEach((b) => { if (b.linkedSheet === name) b.linkedSheet = ''; });
    });
    setBillDraft((current) => current.sheet === name ? { ...current, sheet: '' } : current);
    notify(`${name} removed from the linked-sheet list`);
  };

  const addBill = () => {
    const name = billDraft.name.trim();
    if (!name) return notify('Give the bill a name');
    if (ds.bills.some((b) => b.name === name)) return notify('That bill already exists');
    update((d) => d.bills.push({
      name,
      amountPence: parseMoney(billDraft.amount),
      dueDay: Number(billDraft.due) || 1,
      linkedSheet: billDraft.sheet,
      account: billDraft.account,
      frequency: 'Monthly',
      latestBalancePence: 0,
      latestPaymentPence: 0,
      sortOrder: d.bills.length + 1,
      active: true,
      effectiveFrom: planning ? planStart : '',
      paymentMethod: billDraft.method,
      baseAmountPence: parseMoney(billDraft.amount),
      baseDueDay: Number(billDraft.due) || 1,
    }));
    setBillDraft({ name: '', amount: '', due: '27', method: 'Direct Debit', sheet: billDraft.sheet, account: billDraft.account });
    notify(planning ? `${name} added from ${year}` : `${name} added to the bill run`);
  };

  const renameBill = (oldName: string, newName: string) => {
    if (ds.bills.some((b) => b.name === newName && b.name !== oldName)) return notify('That bill already exists');
    update((d) => {
      const b = d.bills.find((x) => x.name === oldName);
      if (!b) return;
      b.name = newName;
      d.billChanges.forEach((c) => { if (c.bill === oldName) c.bill = newName; });
    });
    notify(`${oldName} renamed to ${newName}`);
  };

  const removeBill = (name: string) => {
    const changes = ds.billChanges.filter((c) => c.bill === name).length;
    if (!confirm(`Remove ${name}${changes ? ` and its ${changes} bill change${changes === 1 ? '' : 's'}` : ''}?`)) return;
    update((d) => { d.bills = d.bills.filter((b) => b.name !== name); d.billChanges = d.billChanges.filter((c) => c.bill !== name); });
    notify(`${name} removed`);
  };

  return (
    <>
      <Section title={`Scheduled for ${MONTH_LONG[month - 1]} ${year}`} sub="Marked paid automatically when As-Of reaches the due date; inactive bills stay in history">
        <Table head={['Bill', 'Due', 'Method', 'Paid from', 'Linked sheet', 'Amount', 'Status']} numHead={[5]}>
          {scheduled.map((b) => (
            <tr key={b.name}>
              <td><strong>{b.name}</strong></td>
              <td className="muted">{dateUk(b.dueDate)}</td>
              <td className="muted small">{b.paymentMethod || '—'}</td>
              <td className="muted small">{b.account || '—'}</td>
              <td className="muted small">{b.linkedSheet || '—'}</td>
              <td className="num"><strong>{gbp(b.amountPence)}</strong></td>
              <td>{b.paid ? <Badge tone="green">Paid</Badge> : <Badge>Scheduled</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Bill link sheets" sub="Create, rename or remove the options in every Linked sheet dropdown. Provider-linked sheets keep their automatic amount; custom sheets use the bill base amount.">
        <Table head={['Link sheet', 'Bills', 'Type', '']} numHead={[1]}>
          {sheets.map((sheet) => {
            const used = ds.bills.filter((b) => b.linkedSheet === sheet.name).length;
            return (
              <tr key={sheet.name}>
                <td><EditableName value={sheet.name} onCommit={(next) => renameSheet(sheet.name, next)} ariaLabel={`Link sheet ${sheet.name}`} /></td>
                <td className="num">{used}</td>
                <td>{sheet.providerKey ? <Badge tone="blue">Provider</Badge> : <Badge>Custom</Badge>}</td>
                <td><button className="btn ghost sm" onClick={() => removeSheet(sheet.name)}>Remove</button></td>
              </tr>
            );
          })}
        </Table>
        {sheets.length === 0 && <Empty>No link sheets yet. Add one to make it selectable on bills.</Empty>}
        <div style={{ padding: '0 16px 16px' }}>
          <div className="notice info">Renaming a provider-linked sheet keeps its provider lookup. A custom sheet is a label only, so its bills use the base amount.</div>
        </div>
        <div className="inline-form">
          <Field label="New link sheet"><input className="input" placeholder="e.g. TV Licence" value={sheetDraft} onChange={(e) => setSheetDraft(e.target.value)} /></Field>
          <button className="btn primary" onClick={addSheet}>Add link sheet</button>
        </div>
      </Section>

      <Section
        title={planning ? `${year} bill plan` : 'Bill definitions'}
        sub={planning
          ? `Amount, due day and removal apply to ${year} only. Method, account and linked sheet stay shared.`
          : "Edit a bill in place; adding a bill uses the base amount, or the linked provider's scheduled amount when one is available."}
      >
        <Table head={['Bill', planning ? `${year} £` : 'Base £', planning ? 'Due day' : 'Due', 'Method', 'Paid from', 'Linked sheet', 'Effective from', planning ? `In ${year}` : 'Active', '']} numHead={[1, 2]}>
          {ds.bills.map((b, i) => (
            <tr key={b.name || i}>
              <td><EditableName value={b.name} onCommit={(next) => renameBill(b.name, next)} ariaLabel={`Bill name ${b.name}`} /></td>
              <td className="num">
                <input
                  className="table-input"
                  inputMode="decimal"
                  aria-label={`${planning ? `${year} ` : ''}amount ${b.name}`}
                  value={((planning ? planAmount(b) : b.baseAmountPence) / 100).toFixed(2)}
                  disabled={planning && yearChange(b.name)?.skip === true}
                  onChange={(e) => planning
                    ? setPlan(b.name, { amountOverridePence: e.target.value.trim() ? parseMoney(e.target.value) : null })
                    : update((d) => { d.bills[i].baseAmountPence = parseMoney(e.target.value); d.bills[i].amountPence = parseMoney(e.target.value); })}
                />
              </td>
              <td className="num">
                <input
                  className="table-input"
                  style={{ maxWidth: 64 }}
                  type="number"
                  min={1}
                  max={31}
                  aria-label={`${planning ? `${year} ` : ''}due day ${b.name}`}
                  value={planning ? planDueDay(b) : b.dueDay}
                  disabled={planning && yearChange(b.name)?.skip === true}
                  onChange={(e) => planning
                    ? setPlan(b.name, { dueDayOverride: Number(e.target.value) || null })
                    : update((d) => { d.bills[i].dueDay = Number(e.target.value); d.bills[i].baseDueDay = Number(e.target.value); })}
                />
              </td>
              <td>
                <select className="select" value={b.paymentMethod || 'Manual'} onChange={(e) => update((d) => { d.bills[i].paymentMethod = e.target.value; })}>
                  {BILL_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </td>
              <td>
                <select className="select" value={b.account || ds.settings.primaryAccount || ds.accounts[0]?.name || ''} onChange={(e) => update((d) => { d.bills[i].account = e.target.value; })}>
                  {ds.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </td>
              <td>
                <select className="select" value={b.linkedSheet || ''} onChange={(e) => update((d) => { d.bills[i].linkedSheet = e.target.value; })}>
                  <option value="">None</option>
                  {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
                </select>
              </td>
              <td>{planning
                ? <span className="muted">{b.effectiveFrom ? dateUk(b.effectiveFrom) : '—'}</span>
                : <input className="table-input date" type="date" value={b.effectiveFrom || ''} onChange={(e) => update((d) => { d.bills[i].effectiveFrom = e.target.value; })} />}</td>
              <td>{planning
                ? <input
                    type="checkbox"
                    aria-label={`Include ${b.name} in ${year}`}
                    checked={yearChange(b.name)?.skip !== true}
                    onChange={(e) => setPlan(b.name, { skip: !e.target.checked })}
                  />
                : <input type="checkbox" checked={b.active} onChange={(e) => update((d) => { d.bills[i].active = e.target.checked; })} />}</td>
              <td><button className="btn ghost sm" onClick={() => {
                if (!planning) return removeBill(b.name);
                if (!confirm(`Remove ${b.name} from ${year}? Earlier years stay untouched.`)) return;
                setPlan(b.name, { skip: true });
                notify(`${b.name} removed from ${year}`);
              }}>{planning ? `Remove from ${year}` : 'Remove'}</button></td>
            </tr>
          ))}
        </Table>
        {planning && (
          <div style={{ padding: '0 16px 16px' }}>
            <div className="notice info">
              You are planning <strong>{year}</strong>. Amount and due-day edits create a {year}-only bill change; the base definitions and earlier years are not rewritten. A bill added here starts in {year}.
            </div>
          </div>
        )}
        <div className="inline-form">
          <Field label="New bill"><input className="input" placeholder="Bill name" value={billDraft.name} onChange={(e) => setBillDraft({ ...billDraft, name: e.target.value })} /></Field>
          <Field label="Amount £"><input className="input" inputMode="decimal" value={billDraft.amount} onChange={(e) => setBillDraft({ ...billDraft, amount: e.target.value })} /></Field>
          <Field label="Due day"><input className="input" type="number" min={1} max={31} value={billDraft.due} onChange={(e) => setBillDraft({ ...billDraft, due: e.target.value })} /></Field>
          <Field label="Method">
            <select className="select" value={billDraft.method} onChange={(e) => setBillDraft({ ...billDraft, method: e.target.value })}>
              {BILL_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Paid from">
            <select className="select" value={billDraft.account || ds.settings.primaryAccount || ds.accounts[0]?.name || ''} onChange={(e) => setBillDraft({ ...billDraft, account: e.target.value })}>
              {ds.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Linked sheet"><select className="select" value={billDraft.sheet} onChange={(e) => setBillDraft({ ...billDraft, sheet: e.target.value })}>
            <option value="">None</option>
            {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
          </select></Field>
          <button className="btn primary" onClick={addBill}>{planning ? `Add bill from ${year}` : 'Add bill'}</button>
        </div>
      </Section>

      <Section title={planning ? `Bill changes for ${year}` : 'Bill changes'} sub="Latest matching override wins; same From/To month is a one-off. Add or edit changes in Settings.">
        <Table head={['Bill', 'From', 'To', 'Amount', 'Due override', 'Type', 'Note', '']} numHead={[3]}>
          {ds.billChanges.filter((c) => !planning || ((!c.appliesFrom || c.appliesFrom <= planEnd) && (!c.appliesTo || c.appliesTo >= planStart))).map((c, i) => (
            <tr key={`${c.bill}-${c.appliesFrom}-${c.appliesTo}-${i}`}>
              <td>{c.bill}</td>
              <td className="muted">{dateUk(c.appliesFrom)}</td>
              <td className="muted">{c.appliesTo ? dateUk(c.appliesTo) : '—'}</td>
              <td className="num">{c.amountOverridePence === null ? '—' : gbp(c.amountOverridePence)}</td>
              <td className="muted">{c.dueDateOverride ? dateUk(c.dueDateOverride) : typeof c.dueDayOverride === 'number' ? `Day ${c.dueDayOverride}` : '—'}</td>
              <td className="muted small">{c.skip ? `Removed for ${year}` : c.changeType || '—'}</td>
              <td className="muted small">{c.note || '—'}</td>
              <td><button className="btn ghost sm" onClick={() => update((d) => { d.billChanges = d.billChanges.filter((entry) => entry !== c); })}>Remove</button></td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
