import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ViewProps } from '../types';
import { createTapGuard } from '../mutationGuard';
import { Badge, Bar, Empty, Field, Money, Section, Table } from '../components';
import { dateUk, dateTimeUk, download, gbp, gbpBlank, MONTH_LONG, parseMoney, pct, todayIso, toCsv } from '../format';
import { auditFieldChanges, deletedTransactions, formatAuditValue, recordHistory, revertAuditEntry, type AuditEntry } from '../../../core/audit';
import { advanceAsOfToLatestTransaction } from '../../../core/engine';
import { billSheetsFor, LINK_SHEET_PROVIDER_KEYS, providerKeyForSheetName } from '../billSheets';
import { isProviderEnabled, providerDisplayName } from '../providerSetup';
import { reconcileAccountOpening } from '../../../core/accountRepairs';
import { buildCardPaymentLegs, buildTransferLegs, findTransferPartner } from '../../../core/transfers';
import { accountClassifier, commentsMention, knownAccountNames, linkedCommentSummary } from '../../../core/accounts';
import { categoryOptions, normaliseCategory, normaliseTags, tagOptions, tagsText, transactionMatches } from '../../../core/categories';
import { mergeSuggestion, ruleFieldText, suggestForTransaction } from '../../../core/importRules';
import { buildExcelWorkbook, buildPrintReport } from '../../../core/exporters';
import { printHtml } from '../print';
import { bulkEditTransactions } from '../../../core/cleanup';
import { deletePortalsForPerson, renamePortalPerson } from '../portal';
import { PeopleAccessSection } from './peoplePortal';

const BILL_METHODS = ['Direct Debit', 'Standing Order', 'Continuous Card Authority', 'Manual'];

/** The three kinds of dated bill change, so the type is picked rather than typed. */
const CHANGE_MODES: { id: string; label: string }[] = [
  { id: 'date', label: 'Move a date' },
  { id: 'amount', label: 'Change an amount' },
  { id: 'stop', label: 'Stop it' },
];

function auditActionLabel(entry: AuditEntry): string {
  if (entry.action === 'update') return `Edited · ${entry.label}`;
  if (entry.action === 'delete') return `Deleted · ${entry.label}`;
  return `Added · ${entry.label}`;
}

// R18: a double tap on a phone must not post the same new entry twice.
const transactionTapGuard = createTapGuard();

export function Transactions({ ds, engine, month, setMonth, update, notify }: ViewProps) {
  const [q, setQ] = useState('');
  const [account, setAccount] = useState('All');
  const [type, setType] = useState('All');
  const [mFilter, setMFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkTags, setBulkTags] = useState('');
  const [filterName, setFilterName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [historyRow, setHistoryRow] = useState<number | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [loanPrefilled, setLoanPrefilled] = useState(false);
  const [autoFill, setAutoFill] = useState({ category: '', tags: '' });
  const [ruleHint, setRuleHint] = useState('');
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

  const kindOf = accountClassifier(ds);
  const mainAccount = ds.settings.primaryAccount || ds.accounts[0]?.name || 'the main account';
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
  const categories = useMemo(() => categoryOptions(ds.transactions, ds.categories ?? []), [ds.transactions, ds.categories]);
  const tags = useMemo(() => tagOptions(ds.transactions), [ds.transactions]);
  const category = normaliseCategory(form.category);
  const formTags = normaliseTags(form.tags);

  const savedFilters = ds.settings.savedFilters ?? {};
  const applySavedFilter = (name: string) => {
    const saved = savedFilters[name];
    if (!saved) return;
    setQ(saved.query ?? '');
    setAccount(saved.account ?? 'All');
    setType(saved.type ?? 'All');
    setMFilter(saved.month ?? 'All');
    setCategoryFilter(saved.category ?? 'All');
    setTagFilter(saved.tag ?? 'All');
    notify(`Applied saved filter “${name}”`);
  };
  const saveCurrentFilter = () => {
    const name = filterName.trim().slice(0, 40);
    if (!name) return notify('Give the filter a name first');
    update((d) => {
      d.settings.savedFilters = {
        ...(d.settings.savedFilters ?? {}),
        [name]: { query: q, account, type, month: mFilter, category: categoryFilter, tag: tagFilter },
      };
    });
    setFilterName('');
    notify(`Saved the current filters as “${name}”`);
  };
  const deleteSavedFilter = (name: string) => {
    update((d) => {
      const next = { ...(d.settings.savedFilters ?? {}) };
      delete next[name];
      d.settings.savedFilters = next;
    });
    notify(`Removed saved filter “${name}”`);
  };

  const pageSize = 60;
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((row) => selectedRows.has(row.row));
  const toggleRow = (row: number) => setSelectedRows((current) => {
    const next = new Set(current);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    return next;
  });
  const togglePage = () => setSelectedRows((current) => {
    const next = new Set(current);
    if (pageAllSelected) pageRows.forEach((row) => next.delete(row.row));
    else pageRows.forEach((row) => next.add(row.row));
    return next;
  });
  const applyBulkEdit = () => {
    if (selectedRows.size === 0) return;
    if (!bulkCategory.trim() && !bulkTags.trim()) return notify('Enter a category or tags to apply');
    const locked = (date: string) => engine.monthlySummary(Number(date.slice(0, 4)), Number(date.slice(5, 7))).locked;
    const patch = {
      ...(bulkCategory.trim() ? { category: bulkCategory } : {}),
      ...(bulkTags.trim() ? { tags: normaliseTags(bulkTags) } : {}),
    };
    let result = { updated: 0, skipped: 0, message: '' };
    update((d) => { result = bulkEditTransactions(d, [...selectedRows], patch, locked); });
    setSelectedRows(new Set());
    notify(result.message || 'No transactions were updated');
  };
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const history = historyRow === null ? [] : recordHistory(ds, 'transactions', String(historyRow));
  const deleted = deletedTransactions(ds);

  const exportRows = () => {
    download('financehub-transactions.csv', toCsv([
      ['Date', 'Account', 'Type', 'Amount', 'Comments', 'Category', 'Tags', 'Treatment', 'Status', 'Cleared'],
      ...rows.map((t) => [t.date, t.account, t.type, (t.amountPence / 100).toFixed(2), t.comments, t.category ?? '', tagsText(t.tags), t.budgetTreatment, t.status, t.cleared ? 'Yes' : '']),
    ]));
    notify(`Exported ${rows.length} transactions`);
  };

  const exportExcel = () => {
    download(
      'financehub-transactions.xls',
      buildExcelWorkbook([{
        name: 'Transactions',
        rows: [
          ['Date', 'Account', 'Type', 'Amount', 'Comments', 'Category', 'Tags', 'Treatment', 'Status', 'Cleared'],
          ...rows.map((t) => [
            t.date,
            t.account,
            t.type,
            t.amountPence / 100,
            t.comments,
            t.category ?? '',
            tagsText(t.tags),
            t.budgetTreatment,
            t.status,
            t.cleared ? 'Yes' : '',
          ]),
        ],
      }]),
      'application/vnd.ms-excel',
    );
    notify(`Exported ${rows.length} transactions to Excel`);
  };

  const printLog = () => {
    const netPence = rows.reduce((sum, t) => sum + (t.type === 'Income' ? t.amountPence : -t.amountPence), 0);
    const html = buildPrintReport({
      title: 'FinanceHub transaction log',
      subtitle: `${rows.length} rows · filters: ${account === 'All' ? 'all accounts' : account}, ${type === 'All' ? 'all types' : type}`,
      summary: [
        ['Rows', String(rows.length)],
        ['Net', gbp(netPence)],
      ],
      head: ['Date', 'Account', 'Type', 'Amount', 'Comments', 'Category', 'Tags'],
      rows: rows.map((t) => [
        t.date,
        t.account,
        t.type,
        gbp(t.amountPence),
        t.comments,
        t.category ?? '',
        tagsText(t.tags),
      ]),
    });
    if (!printHtml(html)) notify('The print view could not be opened');
  };

  const updateTransaction = (mutator: (dataset: typeof ds) => void) =>
    update((d) => {
      mutator(d);
      advanceAsOfToLatestTransaction(d, todayIso());
    });

  /**
   * Manual entry runs through the same import rules as the review grid, so a
   * Tesco description arrives with Food already chosen. Nothing typed by hand
   * is replaced: only a blank field, or one the rules filled, takes the hit.
   */
  const fillFromRules = (next: typeof form, allowRules = editing === null) => {
    if (!allowRules) { setForm(next); return; }
    const suggestion = suggestForTransaction(ds.importRules ?? [], {
      description: next.comments,
      account: next.account,
      amountPence: Math.abs(parseMoney(next.amount)) || undefined,
    });
    const merged = mergeSuggestion(next, suggestion, autoFill);
    setForm({ ...next, category: merged.category, tags: merged.tags });
    setAutoFill({ category: merged.autoCategory, tags: merged.autoTags });
    setRuleHint(suggestion.rule && (merged.autoCategory || merged.autoTags)
      ? `Filled from the rule “${ruleFieldText(suggestion.rule)}”`
      : '');
  };

  // A saved entry starts clean so the next description is judged on its own
  // merits instead of inheriting the last category.
  const resetFormAfterSave = () => {
    setForm({ ...form, amount: '', comments: '', category: '', tags: '' });
    setAutoFill({ category: '', tags: '' });
    setRuleHint('');
  };

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
    if (editing === null && !transactionTapGuard()) {
      notify('That entry was just added — not posting it twice');
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
        resetFormAfterSave();
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
        resetFormAfterSave();
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
      resetFormAfterSave();
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
      resetFormAfterSave();
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
      resetFormAfterSave();
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
    resetFormAfterSave();
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
          <button className="btn" onClick={exportExcel}>Export Excel</button>
          <button className="btn" onClick={printLog}>Print / Save PDF</button>
          <button
            className="btn primary"
            onClick={() => {
              if (!adding) {
                const prefill = kindOf(form.account) === 'person' && !form.comments.trim();
                setLoanPrefilled(prefill);
                setEditing(null);
                setAdding(true);
                fillFromRules({ ...form, comments: prefill ? 'Loan' : form.comments }, true);
              } else {
                setEditing(null);
                setAdding(false);
              }
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
        <div className="toolbar">
          <select className="select" value="" onChange={(e) => { if (e.target.value) applySavedFilter(e.target.value); }} aria-label="Saved filters">
            <option value="">Saved filters…</option>
            {Object.keys(savedFilters).sort().map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <input className="input" placeholder="Name this filter" value={filterName} onChange={(e) => setFilterName(e.target.value)} maxLength={40} />
          <button className="btn ghost" onClick={saveCurrentFilter}>Save filter</button>
          {Object.keys(savedFilters).length > 0 && (
            <button className="btn ghost" onClick={() => deleteSavedFilter(Object.keys(savedFilters).sort().at(-1) ?? '')}>Delete newest</button>
          )}
          <div className="toolbar-spacer" />
          <span className="muted small">Saved filters change no amounts and are never part of the budget changelog.</span>
        </div>

        {selectedRows.size > 0 && (
          <div className="toolbar" style={{ background: 'var(--panel-2)' }}>
            <strong>{selectedRows.size} selected</strong>
            <input className="input" list="transaction-categories" placeholder="Category" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} aria-label="Bulk category" />
            <input className="input" placeholder="Tags, comma-separated" value={bulkTags} onChange={(e) => setBulkTags(e.target.value)} aria-label="Bulk tags" />
            <button className="btn primary sm" onClick={applyBulkEdit}>Apply</button>
            <button className="btn ghost sm" onClick={() => setSelectedRows(new Set())}>Clear</button>
            <div className="toolbar-spacer" />
            <span className="muted small">Locked months are skipped.</span>
          </div>
        )}

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
                  if (prefill) setLoanPrefilled(true);
                  if (clearAuto) setLoanPrefilled(false);
                  fillFromRules({
                    ...form,
                    account: next,
                    to: form.to === next ? bankAccounts.find((a) => a !== next) ?? '' : form.to,
                    comments: prefill ? 'Loan' : clearAuto ? '' : form.comments,
                  });
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
            <Field label="Comments" hint="Import rules set the category from this"><input className="input" value={form.comments} onChange={(e) => { setLoanPrefilled(false); fillFromRules({ ...form, comments: e.target.value }); }} /></Field>
            <Field label="Category" hint={ruleHint || undefined}>
              <input className="input" list="transaction-categories" placeholder="e.g. Food" value={form.category} onChange={(e) => { setAutoFill({ ...autoFill, category: '' }); setRuleHint(''); setForm({ ...form, category: e.target.value }); }} />
              <datalist id="transaction-categories">{categories.map((entry) => <option key={entry} value={entry} />)}</datalist>
            </Field>
            <Field label="Tags" hint="Comma-separated; up to 8">
              <input className="input" placeholder="weekly, tesco" value={form.tags} onChange={(e) => { setAutoFill({ ...autoFill, tags: '' }); setRuleHint(''); setForm({ ...form, tags: e.target.value }); }} />
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

        <Table
          head={[
            <input key="select" type="checkbox" aria-label="Select all rows on this page" checked={pageAllSelected} onChange={togglePage} />,
            'Date', 'Account', 'Type', 'Amount', 'Comments', 'Category', 'Tags', 'Treatment', 'Status', 'Actions',
          ]}
          numHead={[4]}
        >
          {pageRows.map((t) => (
            <tr key={t.row}>
              <td><input type="checkbox" aria-label={`Select ${t.date} ${t.comments || 'transaction'}`} checked={selectedRows.has(t.row)} onChange={() => toggleRow(t.row)} /></td>
              <td className="nowrap muted">{dateUk(t.date)}</td>
              <td>
                {t.account}{' '}
                {typeof t.mergedIntoRow === 'number' && <Badge tone="violet">Merged into row {t.mergedIntoRow}</Badge>}
                {kindOf(t.account) === 'unknown' && (linkedUnknownNames.has(t.account)
                  ? <Badge tone="blue">Linked account</Badge>
                  : <Badge tone="amber">Needs review</Badge>)}
                {linkedTo && t.account !== linkedTo && <Badge tone="blue">Linked to {linkedTo}</Badge>}
              </td>
              <td><Badge tone={t.type === 'Income' ? 'green' : 'neutral'}>{t.type}</Badge></td>
              <td className={`num ${t.type === 'Income' ? 'amount pos' : 'amount neg'}`}>{t.type === 'Income' ? '+' : '−'}{gbp(t.amountPence)}</td>
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

export function Accounts({ ds, engine, year, month, update, notify }: ViewProps) {
  const asOf = engine.throughFor(year, month);
  const balances = engine.accountBalances(asOf);
  const [selected, setSelected] = useState(
    ds.accounts.find((a) => a.name === (ds.settings.primaryAccount || ds.accounts[0]?.name))?.name ?? balances[0]?.name ?? '',
  );
  const [acct, setAcct] = useState({ name: '', target: '', opening: '' });
  const [reconcile, setReconcile] = useState({ date: asOf, balance: '' });
  const mainAccount = ds.settings.primaryAccount || ds.accounts[0]?.name || 'the main account';
  const reconcileDate = /^\d{4}-\d{2}-\d{2}$/.test(reconcile.date) ? reconcile.date : asOf;
  const reconcileCurrent = engine.accountBalances(reconcileDate).find((a) => a.name === mainAccount)?.balancePence ?? 0;
  /**
   * Match the bank: only the opening balance moves, by exactly the difference, so
   * a statement's figure can be reconciled without inventing a transaction.
   */
  const applyReconcile = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reconcile.date)) return notify('Choose the date the bank balance is from');
    if (!reconcile.balance.trim()) return notify('Enter the balance your bank shows');
    const target = parseMoney(reconcile.balance);
    const delta = target - reconcileCurrent;
    setReconcile((current) => ({ ...current, balance: '' }));
    if (!delta) return notify(`${mainAccount} already reads ${gbp(target)} on ${dateUk(reconcile.date)}`);
    update((d) => { reconcileAccountOpening(d, mainAccount, reconcile.date, target, reconcileCurrent); });
    notify(`${mainAccount} opening moved by ${gbp(delta)} — ${dateUk(reconcile.date)} now reads ${gbp(target)}`);
  };
  const nameInUse = (name: string, old?: string) =>
    ds.accounts.some((a) => a.name === name && a.name !== old)
    || ds.people.some((p) => p.shortName === name && p.shortName !== old)
    || ds.cards.some((c) => c.name === name && c.name !== old);
  const addAccount = () => {
    const name = acct.name.trim();
    if (!name) return notify('Give the account a name');
    if (ds.accounts.some((a) => a.name === name)) return notify('An account with that name already exists');
    update((d) => d.accounts.push({ name, targetPence: parseMoney(acct.target), openingPence: parseMoney(acct.opening), sortOrder: d.accounts.length + 1, active: true }));
    setAcct({ name: '', target: '', opening: '' });
    notify(`${name} added everywhere`);
  };
  const renameAccount = (oldName: string, newName: string) => {
    if (nameInUse(newName, oldName)) return notify('That name is already used by an account, person or card');
    update((d) => {
      const account = d.accounts.find((x) => x.name === oldName);
      if (!account) return;
      account.name = newName;
      d.transactions.forEach((t) => { if (t.account === oldName) t.account = newName; });
      if (d.settings.primaryAccount === oldName) d.settings.primaryAccount = newName;
    });
    setSelected((current) => (current === oldName ? newName : current));
    notify(`${oldName} renamed to ${newName}`);
  };
  const removeAccount = (name: string) => {
    const isPrimary = name === mainAccount;
    const used = ds.transactions.filter((t) => t.account === name).length;
    const other = ds.accounts.find((a) => a.name !== name)?.name ?? '';
    if (isPrimary && !other) return notify('Add another account before removing the main account');
    const destination = isPrimary ? other : ds.accounts.some((a) => a.name === mainAccount) ? mainAccount : other;
    if (used > 0 && !destination) return notify('Add another account before removing this one');
    const detail = used ? ` ${used} transactions will move to ${destination}.` : '';
    if (!confirm(`Remove ${name}?${detail}`)) return;
    update((d) => {
      if (used) d.transactions.forEach((t) => { if (t.account === name) t.account = destination; });
      d.accounts = d.accounts.filter((a) => a.name !== name);
      if (isPrimary) d.settings.primaryAccount = destination;
    });
    notify(`${name} removed${used ? ` — ledger moved to ${destination}` : ''}`);
  };
  return (
    <>
      <Section title="Bank accounts" sub={`Balances as of ${dateUk(asOf)}. Edit a name in place (Enter saves, Esc cancels); removing an account moves its transactions to the main account.`}>
        <Table className="ledger-table-start" head={['Account', 'Opening', 'Balance', 'Target', 'Progress', 'Active', '']} numHead={[1, 2, 3]}>
          {balances.map((a) => {
            const index = ds.accounts.findIndex((entry) => entry.name === a.name);
            return (
              <tr key={a.name} className={a.name === selected ? 'selected' : ''} onClick={() => setSelected(a.name)} style={{ cursor: 'pointer' }}>
                <td><EditableName value={a.name} onCommit={(next) => renameAccount(a.name, next)} ariaLabel={`Account name ${a.name}`} /></td>
                <td className="num"><MoneyCell pence={a.openingPence} ariaLabel={`Opening ${a.name}`} onCommit={(pence) => update((d) => { d.accounts[index].openingPence = pence; })} /></td>
                <td className="num"><strong>{gbpBlank(a.balancePence)}</strong></td>
                <td className="num"><MoneyCell pence={a.targetPence} ariaLabel={`Target ${a.name}`} onCommit={(pence) => update((d) => { d.accounts[index].targetPence = pence; })} /></td>
                <td style={{ width: 150 }}><Bar value={a.targetPence === 0 ? 0 : a.balancePence / a.targetPence} /></td>
                <td><input type="checkbox" aria-label={`${a.name} active`} checked={a.active} onChange={(e) => update((d) => { d.accounts[index].active = e.target.checked; })} /></td>
                <td><button className="btn ghost sm" onClick={(event) => { event.stopPropagation(); removeAccount(a.name); }}>Remove</button></td>
              </tr>
            );
          })}
        </Table>
        {ds.accounts.length === 0 && <Empty>No accounts yet — add the first one below.</Empty>}
        <div className="inline-form">
          <Field label="New account"><input className="input" placeholder="Name" value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} /></Field>
          <Field label="Target £"><input className="input" inputMode="decimal" value={acct.target} onChange={(e) => setAcct({ ...acct, target: e.target.value })} /></Field>
          <Field label="Opening £"><input className="input" inputMode="decimal" value={acct.opening} onChange={(e) => setAcct({ ...acct, opening: e.target.value })} /></Field>
          <button className="btn primary" onClick={addAccount}>Add account</button>
        </div>
      </Section>

      <Section
        title={`Reconcile ${mainAccount}`}
        sub={`Type the balance your bank shows for a date. Only the opening balance moves, by exactly the difference, so FinanceHub reads the same figure — no transaction or bill is changed.`}
        actions={<Badge tone="blue">{`Reads ${gbpBlank(reconcileCurrent)}`}</Badge>}
      >
        <div className="inline-form">
          <Field label="Bank balance £" hint={`${dateUk(reconcileDate)} reads ${gbpBlank(reconcileCurrent)} here`}>
            <input
              className="input"
              inputMode="decimal"
              aria-label="Bank balance"
              placeholder="e.g. 461.85"
              value={reconcile.balance}
              onChange={(e) => setReconcile({ ...reconcile, balance: e.target.value })}
            />
          </Field>
          <Field label="On date">
            <input
              className="input"
              type="date"
              aria-label="Reconcile date"
              value={reconcile.date}
              onChange={(e) => setReconcile({ ...reconcile, date: e.target.value })}
            />
          </Field>
          <button className="btn primary" onClick={applyReconcile}>Match the balance</button>
        </div>
        <div className="muted small" style={{ padding: '0 16px 12px' }}>
          The opening balance is the anchor the whole running balance counts from, so a statement's close is enough to put the account back on the bank's figure. A year rollover's opening figure is moved instead when the date falls in a rolled-over year.
        </div>
      </Section>

    </>
  );
}

export function Cards({ ds, engine, year, month, update, notify }: ViewProps) {
  const asOf = engine.throughFor(year, month);
  const cards = engine.cardBalances(asOf);
  const [card, setCard] = useState({ name: '', limit: '', opening: '' });
  const totalBalance = cards.reduce((s, c) => s + c.balancePence, 0);
  const totalLimit = cards.reduce((s, c) => s + c.limitPence, 0);
  const addCard = () => {
    const name = card.name.trim();
    if (!name) return notify('Give the card a name');
    if (ds.cards.some((c) => c.name === name)) return notify('That card already exists');
    update((d) => d.cards.push({ name, limitPence: parseMoney(card.limit), openingPence: parseMoney(card.opening), sortOrder: d.cards.length + 1, active: true }));
    setCard({ name: '', limit: '', opening: '' });
    notify(`${name} added everywhere`);
  };
  const removeCard = (name: string) => {
    const used = ds.transactions.filter((t) => t.account === name).length;
    if (used > 0) return notify(`${name} has ${used} transactions — deactivate instead`);
    if (!confirm(`Remove ${name}?`)) return;
    update((d) => { d.cards = d.cards.filter((c) => c.name !== name); });
  };
  return (
    <>
      <div className="kpi-grid">
        <div className="card"><div className="card-title">Total balance</div><div className="kpi-value">{gbp(totalBalance)}</div></div>
        <div className="card"><div className="card-title">Total limit</div><div className="kpi-value">{gbp(totalLimit)}</div></div>
        <div className="card"><div className="card-title">Utilisation</div><div className="kpi-value">{pct(totalLimit === 0 ? 0 : totalBalance / totalLimit)}</div></div>
        <div className="card"><div className="card-title">Available</div><div className="kpi-value pos">{gbp(totalLimit - totalBalance)}</div></div>
      </div>
      <Section title="Credit cards" sub="Balance = opening + charges − refunds/payments">
        <Table className="ledger-table-start" head={['Card', 'Opening', 'Balance', 'Limit', 'Available', 'Used', 'Active', '']} numHead={[1, 2, 3, 4, 5]}>
          {cards.map((c) => {
            const index = ds.cards.findIndex((entry) => entry.name === c.name);
            return (
              <tr key={c.name}>
                <td><strong>{c.name}</strong></td>
                <td className="num"><MoneyCell pence={c.openingPence} ariaLabel={`Opening ${c.name}`} onCommit={(pence) => update((d) => { d.cards[index].openingPence = pence; })} /></td>
                <td className="num"><strong>{gbpBlank(c.balancePence)}</strong></td>
                <td className="num"><MoneyCell pence={c.limitPence} ariaLabel={`Limit ${c.name}`} onCommit={(pence) => update((d) => { d.cards[index].limitPence = pence; })} /></td>
                <td className="num">{gbpBlank(c.availablePence)}</td>
                <td className="num">{c.utilisation === 0 ? '' : pct(c.utilisation)}</td>
                <td><input type="checkbox" aria-label={`${c.name} active`} checked={c.active} onChange={(e) => update((d) => { d.cards[index].active = e.target.checked; })} /></td>
                <td><button className="btn ghost sm" onClick={() => removeCard(c.name)}>Remove</button></td>
              </tr>
            );
          })}
        </Table>
        {ds.cards.length === 0 && <Empty>No credit cards yet — add the first one below.</Empty>}
        <div className="inline-form">
          <Field label="New card"><input className="input" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></Field>
          <Field label="Limit £"><input className="input" inputMode="decimal" value={card.limit} onChange={(e) => setCard({ ...card, limit: e.target.value })} /></Field>
          <Field label="Opening £"><input className="input" inputMode="decimal" value={card.opening} onChange={(e) => setCard({ ...card, opening: e.target.value })} /></Field>
          <button className="btn primary" onClick={addCard}>Add card</button>
        </div>
      </Section>
    </>
  );
}

export function People({ ds, engine, year, month, update, notify, userId, workspace }: ViewProps) {
  const asOf = engine.throughFor(year, month);
  const people = engine.owedByPerson(asOf);
  const [person, setPerson] = useState({ short: '', full: '', opening: '' });
  const nameInUse = (name: string, old?: string) =>
    ds.accounts.some((a) => a.name === name && a.name !== old)
    || ds.people.some((p) => p.shortName === name && p.shortName !== old)
    || ds.cards.some((c) => c.name === name && c.name !== old);
  const addPerson = () => {
    const short = person.short.trim();
    if (!short) return notify('Give the person a short name');
    if (ds.people.some((p) => p.shortName === short)) return notify('That person already exists');
    update((d) => d.people.push({ shortName: short, fullName: person.full.trim() || short, openingPence: parseMoney(person.opening), sortOrder: d.people.length + 1, active: true }));
    setPerson({ short: '', full: '', opening: '' });
    notify(`${short} added everywhere`);
  };
  const renamePerson = (oldName: string, newName: string) => {
    if (nameInUse(newName, oldName)) return notify('That name is already used by an account, person or card');
    update((d) => {
      const record = d.people.find((x) => x.shortName === oldName);
      if (!record) return;
      record.shortName = newName;
      d.transactions.forEach((t) => { if (t.account === oldName) t.account = newName; });
    });
    renamePortalPerson(userId, oldName, newName);
    notify(`${oldName} renamed to ${newName}`);
  };
  const removePerson = (name: string) => {
    const used = ds.transactions.filter((t) => t.account === name).length;
    if (used > 0 && !confirm(`${name} has ${used} ledger rows. Removing the person leaves those rows in the transaction log but they will no longer count towards anyone. Remove ${name}?`)) return;
    update((d) => { d.people = d.people.filter((p) => p.shortName !== name); });
    deletePortalsForPerson(userId, name);
    notify(`${name} removed${used ? ` — ${used} ledger rows kept` : ''}`);
  };
  return (
    <>
    <Section title="People accounts" sub="Owed = opening + lent − repaid. Edit names in place; removing someone keeps their ledger rows but stops counting them as owed.">
      <Table className="ledger-table-start" head={['Person', 'Full name', 'Opening', 'Lent', 'Repaid', 'Owed', 'Active', '']} numHead={[2, 3, 4, 5]}>
        {ds.people.map((p) => {
          const owed = people.find((entry) => entry.shortName === p.shortName);
          const lent = ds.transactions.filter((t) => t.account === p.shortName && t.type === 'Expense').reduce((s, t) => s + t.amountPence, 0);
          const repaid = ds.transactions.filter((t) => t.account === p.shortName && t.type === 'Income').reduce((s, t) => s + t.amountPence, 0);
          return (
            <tr key={p.shortName}>
              <td><EditableName value={p.shortName} onCommit={(next) => renamePerson(p.shortName, next)} ariaLabel={`Short name ${p.shortName}`} /></td>
              <td><EditableName value={p.fullName} onCommit={(next) => update((d) => { d.people.find((x) => x.shortName === p.shortName)!.fullName = next; })} ariaLabel={`Full name ${p.fullName}`} /></td>
              <td className="num"><MoneyCell pence={p.openingPence} ariaLabel={`Opening ${p.shortName}`} onCommit={(pence) => update((d) => { d.people.find((x) => x.shortName === p.shortName)!.openingPence = pence; })} /></td>
              <td className="num">{gbpBlank(lent)}</td>
              <td className="num">{gbpBlank(repaid)}</td>
              <td className="num">
                <strong>{gbpBlank(owed?.balancePence ?? p.openingPence + lent - repaid)}</strong>
                {owed?.trackOwed === false && <div className="muted small">No amount owed</div>}
              </td>
              <td><input type="checkbox" aria-label={`${p.shortName} active`} checked={p.active} onChange={(e) => update((d) => { d.people.find((x) => x.shortName === p.shortName)!.active = e.target.checked; })} /></td>
              <td><button className="btn ghost sm" onClick={() => removePerson(p.shortName)}>Remove</button></td>
            </tr>
          );
        })}
      </Table>
      {ds.people.length === 0 && <Empty>No people yet — add the first one below.</Empty>}
      <div className="inline-form">
        <Field label="Short name"><input className="input" value={person.short} onChange={(e) => setPerson({ ...person, short: e.target.value })} /></Field>
        <Field label="Full name"><input className="input" value={person.full} onChange={(e) => setPerson({ ...person, full: e.target.value })} /></Field>
        <Field label="Opening £"><input className="input" inputMode="decimal" value={person.opening} onChange={(e) => setPerson({ ...person, opening: e.target.value })} /></Field>
        <button className="btn primary" onClick={addPerson}>Add person</button>
      </div>
    </Section>
    <PeopleAccessSection ds={ds} userId={userId} notify={notify} workspace={workspace} />
    </>
  );
}

/** A money cell in a table: a zero reads blank, and typing keeps the raw text. */
function MoneyCell({ pence, onCommit, ariaLabel }: { pence: number; onCommit: (pence: number) => void; ariaLabel: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (pence === 0 ? '' : (pence / 100).toFixed(2));
  return (
    <input
      className="table-input"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={shown}
      onFocus={() => setDraft(pence === 0 ? '' : (pence / 100).toFixed(2))}
      onChange={(e) => { setDraft(e.target.value); onCommit(parseMoney(e.target.value)); }}
      onBlur={() => setDraft(null)}
    />
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

export function Bills({ ds, engine, year, month, update, notify, go }: ViewProps) {
  const sheets = billSheetsFor(ds);
  const [sheetDraft, setSheetDraft] = useState('');
  const [sheetRename, setSheetRename] = useState({ from: '', to: '' });
  const [billDraft, setBillDraft] = useState({ name: '', amount: '', due: '27', method: 'Direct Debit', sheet: '', account: '' });
  const [change, setChange] = useState({ bill: ds.bills[0]?.name ?? '', from: '', to: '', amount: '', due: '', mode: 'date' });
  const [showStopped, setShowStopped] = useState(false);
  // Paid from is a reference column, so it starts hidden and the header keeps it reachable.
  const [showPaidFrom, setShowPaidFrom] = useState(false);
  const [openActions, setOpenActions] = useState<string | null>(null);
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
  /**
   * A bill removed from this year stays removed for every later year, so the
   * skip is open-ended: any skip that has started by the end of this year holds.
   */
  const skipChangeFor = (changes: typeof ds.billChanges, name: string) => {
    for (let index = changes.length - 1; index >= 0; index -= 1) {
      const change = changes[index];
      if (change.bill !== name || change.skip !== true) continue;
      if (change.appliesFrom && change.appliesFrom > planEnd) continue;
      if (change.appliesTo && change.appliesTo < planStart) continue;
      return change;
    }
    return undefined;
  };
  /** The change that keeps this bill out of the year being planned: a removal or a stop. */
  const removedForYear = (name: string) => (planning ? skipChangeFor(ds.billChanges, name) : undefined);
  /** A removal made with “Remove from {year}”, which this tab can undo. */
  const planRemovalFor = (name: string) => {
    const removal = removedForYear(name);
    return removal?.changeType === 'Removed' ? removal : undefined;
  };
  const removeFromYear = (name: string) => update((d) => {
    const yearPlan = planChangeFor(d.billChanges, name);
    if (yearPlan) {
      Object.assign(yearPlan, { skip: true, appliesTo: '', changeType: 'Removed', note: `Removed from ${year} and later years` });
      return;
    }
    d.billChanges.push({
      bill: name,
      appliesFrom: planStart,
      appliesTo: '',
      amountOverridePence: null,
      dueDateOverride: '',
      dueDayOverride: null,
      changeType: 'Removed',
      note: `Removed from ${year} and later years`,
      skip: true,
    });
  });
  /**
   * Undo a removal from this tab. A removal that carried a planned amount or due
   * day goes back to being the year's plan; one that was only a removal is dropped.
   */
  const keepInYear = (name: string) => update((d) => {
    const removal = skipChangeFor(d.billChanges, name);
    if (!removal || removal.changeType !== 'Removed') return;
    Object.assign(removal, { skip: false, appliesTo: planEnd, changeType: `Year plan ${year}`, note: `Planned for ${year}` });
    if (removal.amountOverridePence == null && !removal.dueDateOverride && typeof removal.dueDayOverride !== 'number') {
      d.billChanges = d.billChanges.filter((entry) => entry !== removal);
    }
  });
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
  /** Delete a bill outright so a new year's plan can start from a clean list. */
  const deleteBill = (name: string) => {
    if (!confirm(`Delete ${name} completely? It is removed from every year and its bill changes go with it. Payments already recorded in the ledgers stay.`)) return;
    update((d) => {
      d.bills = d.bills.filter((bill) => bill.name !== name);
      d.billChanges = d.billChanges.filter((change) => change.bill !== name);
    });
    setChange((current) => (current.bill === name ? { ...current, bill: '' } : current));
    notify(`${name} deleted`);
  };
  const planAmount = (bill: typeof ds.bills[number]) => yearChange(bill.name)?.amountOverridePence ?? engine.billAmount(bill, year, 1);
  const planDueDay = (bill: typeof ds.bills[number]) => yearChange(bill.name)?.dueDayOverride ?? bill.dueDay;
  /** A provider-linked bill reads the plan's figure in every year; month 1 is the year's baseline. */
  const providerPlanAmount = (bill: typeof ds.bills[number]) => engine.billAmount(bill, year, planning ? 1 : month);
  const billColumnCount = 8 + (showPaidFrom ? 1 : 0);
  /**
   * A bill paid by a provider plan reads its amount from that plan. The provider
   * page owns the figure, so this tab shows it and never edits it.
   */
  const planKeyForBill = (bill: typeof ds.bills[number]) => {
    const key = providerKeyForSheetName(bill.linkedSheet ?? '');
    return key && (ds.providers as any)?.[key] ? key : undefined;
  };
  // A bill removed from the year being planned hides with the stopped ones, so
  // the toggle below is the way back to it.
  const activeBillCount = ds.bills.filter((bill) => bill.active !== false && !removedForYear(bill.name)).length;
  const stoppedBillCount = ds.bills.length - activeBillCount;
  const hiddenBillLabel = planning ? 'stopped and removed bills' : 'stopped bills';

  /**
   * A provider page whose bill and link sheet have both gone is orphaned: the
   * ledger is still stored, so its page is offered here to take out of the menu.
   */
  const orphanProviders = Object.entries(LINK_SHEET_PROVIDER_KEYS)
    .filter(([sheetName, key]) => isProviderEnabled(ds, key)
      && !sheets.some((sheet) => sheet.providerKey === key)
      && !ds.bills.some((bill) => bill.providerKey === key || bill.linkedSheet === sheetName))
    .map(([, key]) => ({ key, label: providerDisplayName(ds, key) }));

  /** Hide an orphaned provider page. Its ledger, payments and settings stay. */
  const removeProviderFromMenu = (key: string) => {
    const label = providerDisplayName(ds, key);
    if (!confirm(`Remove ${label} from the menu? Its ledger, payments and settings stay, and Set up can add the page back.`)) return;
    update((d) => { if (d.providers[key]) d.providers[key].enabled = false; });
    notify(`${label} removed from the menu — its data is kept`);
  };

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
    const name = newName.trim();
    if (!name) { notify('Type the new link sheet name'); return false; }
    if (name === oldName) { notify('That is already the link sheet name'); return false; }
    if (sheets.some((sheet) => sheet.name !== oldName && sheet.name.toLowerCase() === name.toLowerCase())) { notify('That link sheet already exists'); return false; }
    update((d) => {
      d.settings.billSheets = billSheetsFor(d).map((sheet) => sheet.name === oldName ? { ...sheet, name } : sheet);
      d.bills.forEach((b) => { if (b.linkedSheet === oldName) b.linkedSheet = name; });
    });
    setBillDraft((current) => current.sheet === oldName ? { ...current, sheet: name } : current);
    setSheetRename((current) => current.from === oldName ? { from: '', to: '' } : current);
    notify(`${oldName} renamed to ${name}`);
    return true;
  };

  /**
   * Delete a link sheet. A provider sheet whose bill is still in the list stays:
   * the bill reads that plan, so remove the bill first and then the sheet goes.
   */
  const removeSheet = (name: string) => {
    const sheet = sheets.find((entry) => entry.name === name);
    const used = ds.bills.filter((b) => b.linkedSheet === name).length;
    if (sheet?.providerKey && used > 0) {
      notify(`${name} is a provider sheet and ${used} bill${used === 1 ? ' still uses' : 's still use'} it — remove the bill${used === 1 ? '' : 's'} first`);
      return;
    }
    const detail = used ? ` ${used} bill${used === 1 ? '' : 's'} will become standalone; the provider ledger itself is not deleted.` : ' The provider ledger itself is not deleted.';
    if (!confirm(`Delete link sheet “${name}”?${detail}`)) return;
    update((d) => {
      d.settings.billSheets = billSheetsFor(d).filter((sheet) => sheet.name !== name);
      d.bills.forEach((b) => { if (b.linkedSheet === name) b.linkedSheet = ''; });
    });
    setBillDraft((current) => current.sheet === name ? { ...current, sheet: '' } : current);
    setSheetRename((current) => current.from === name ? { from: '', to: '' } : current);
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

  /**
   * Stopping a bill keeps the definition, so every month before the stop — this
   * year's history and every year before it — still reads exactly as it did.
   * The stop is a dated bill change, so Bill changes can undo it.
   */
  const stopBillFrom = (name: string) => update((d) => {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const stop = d.billChanges.find((c) => c.bill === name && c.skip === true && !c.appliesTo);
    if (stop) {
      stop.appliesFrom = from;
      stop.note = `Stopped from ${MONTH_LONG[month - 1]} ${year}`;
      return;
    }
    d.billChanges.push({
      bill: name,
      appliesFrom: from,
      appliesTo: '',
      amountOverridePence: null,
      dueDateOverride: '',
      dueDayOverride: null,
      changeType: 'Stopped',
      note: `Stopped from ${MONTH_LONG[month - 1]} ${year}`,
      skip: true,
    });
  });
  /** A stop that begins inside the year being shown, so the row can say so. */
  const stopInYear = (name: string) => ds.billChanges.find((c) => (
    c.bill === name && c.skip === true && !c.appliesTo && c.appliesFrom > `${year}-01-01` && c.appliesFrom.startsWith(`${year}-`)
  ));

  const addChange = () => {
    if (!change.bill) return notify('Choose a bill');
    if (!change.from) return notify(change.mode === 'stop' ? 'Choose the date the bill stops' : 'Choose the date the change starts');
    if (change.mode === 'date' && !change.due) return notify('Choose the new date for that month');
    if (change.mode === 'amount' && !change.amount.trim()) return notify('Enter the new amount');
    update((d) => d.billChanges.push({
      bill: change.bill,
      appliesFrom: change.from,
      appliesTo: change.mode === 'stop' ? '' : change.to,
      amountOverridePence: change.mode === 'amount' ? parseMoney(change.amount) : null,
      dueDateOverride: change.mode === 'date' ? change.due : '',
      dueDayOverride: null,
      changeType: change.mode === 'date' ? 'One-off date' : change.mode === 'amount' ? 'Amount change' : 'Stopped',
      note: '',
      skip: change.mode === 'stop',
    }));
    setChange({ ...change, from: '', to: '', amount: '', due: '' });
    notify(change.mode === 'stop' ? `Stopped ${change.bill} from ${dateUk(change.from)}` : 'Bill change added');
  };

  return (
    <>
      <Section
        title={planning ? `${year} bill plan and link sheets` : 'Bills and link sheets'}
        sub={planning
          ? `Amount and due day apply to ${year} only; a removal lasts from ${year} onwards. Method, account and linked sheet stay shared. A bill linked to a provider sheet keeps reading that plan's amount.`
          : "Edit a bill in place. A bill linked to a provider sheet shows that plan's amount here and is changed on the provider page. Link sheets below are optional labels that group bills."}
        actions={<button
          type="button"
          className="btn ghost sm"
          aria-pressed={showPaidFrom}
          onClick={() => setShowPaidFrom((open) => !open)}
        >{showPaidFrom ? 'Hide Paid from' : 'Show Paid from'}</button>}
      >
        <Table className="ledger-table-start" head={['Bill', planning ? `${year} £` : 'Base £', planning ? 'Due day' : 'Due', 'Method', ...(showPaidFrom ? ['Paid from'] : []), 'Linked sheet', 'Effective from', planning ? `In ${year}` : 'Active', '']} numHead={[1, 2]}>
          {/* Active bills first; stopped ones sit behind a count so the list stays short. */}
          {ds.bills.map((b, i) => ({ b, i }))
            .sort((x, y) => (x.b.active === false ? 1 : 0) - (y.b.active === false ? 1 : 0))
            .filter(({ b }) => showStopped || (b.active !== false && !removedForYear(b.name)))
            .map(({ b, i }) => (
            <Fragment key={b.name || i}>
            <tr>
              <td><EditableName value={b.name} onCommit={(next) => renameBill(b.name, next)} ariaLabel={`Bill name ${b.name}`} /></td>
              <td className="num">
                {planKeyForBill(b) ? (
                  <div>
                    <strong>{gbp(providerPlanAmount(b))}</strong>
                    <div className="muted small">from the {b.linkedSheet} plan</div>
                  </div>
                ) : (
                  <input
                    className="table-input"
                    inputMode="decimal"
                    aria-label={`${planning ? `${year} ` : ''}amount ${b.name}`}
                    value={((planning ? planAmount(b) : b.baseAmountPence) / 100).toFixed(2)}
                    disabled={planning && Boolean(removedForYear(b.name))}
                    onChange={(e) => planning
                      ? setPlan(b.name, { amountOverridePence: e.target.value.trim() ? parseMoney(e.target.value) : null })
                      : update((d) => {
                        const amount = parseMoney(e.target.value);
                        d.bills[i].baseAmountPence = amount;
                        d.bills[i].amountPence = amount;
                      })}
                  />
                )}
              </td>
              <td className="num">
                {planKeyForBill(b) ? (
                  <strong title={`Set on the ${b.linkedSheet} page`}>{planning ? planDueDay(b) : b.dueDay}</strong>
                ) : (
                  <input
                    className="table-input"
                    style={{ maxWidth: 64 }}
                    type="number"
                    min={1}
                    max={31}
                    aria-label={`${planning ? `${year} ` : ''}due day ${b.name}`}
                    value={planning ? planDueDay(b) : b.dueDay}
                    disabled={planning && Boolean(removedForYear(b.name))}
                    onChange={(e) => planning
                      ? setPlan(b.name, { dueDayOverride: Number(e.target.value) || null })
                      : update((d) => {
                          d.bills[i].dueDay = Number(e.target.value);
                          d.bills[i].baseDueDay = Number(e.target.value);
                        })}
                  />
                )}
              </td>
              <td>
                <select className="select" value={b.paymentMethod || 'Manual'} onChange={(e) => update((d) => { d.bills[i].paymentMethod = e.target.value; })}>
                  {BILL_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </td>
              {showPaidFrom && (
                <td>
                  <select className="select" value={b.account || ds.settings.primaryAccount || ds.accounts[0]?.name || ''} onChange={(e) => update((d) => { d.bills[i].account = e.target.value; })}>
                    {ds.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                </td>
              )}
              <td>
                <select className="select" value={b.linkedSheet || ''} onChange={(e) => update((d) => { d.bills[i].linkedSheet = e.target.value; })}>
                  <option value=""></option>
                  {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
                </select>
              </td>
              <td>{planning
                ? <span className="muted">{b.effectiveFrom ? dateUk(b.effectiveFrom) : '—'}</span>
                                 : <input className={`table-input date${b.effectiveFrom ? '' : ' date-empty'}`} type="date" value={b.effectiveFrom || ''} onChange={(e) => update((d) => { d.bills[i].effectiveFrom = e.target.value; })} />}</td>
              <td>{planning
                ? <input
                    type="checkbox"
                    aria-label={`Include ${b.name} in ${year}`}
                    checked={!removedForYear(b.name)}
                    onChange={(e) => setPlan(b.name, { skip: !e.target.checked })}
                  />
                : <>
                    <input type="checkbox" checked={b.active} onChange={(e) => update((d) => { d.bills[i].active = e.target.checked; })} />
                    {stopInYear(b.name) && (
                      <span className="muted small" style={{ display: 'block' }}>
                        Stops {MONTH_LONG[Number(stopInYear(b.name)!.appliesFrom.slice(5, 7)) - 1]}
                      </span>
                    )}
                  </>}</td>
              <td className="nowrap">
                <button
                  className="btn ghost sm"
                  aria-label={`Actions for ${b.name}`}
                  aria-expanded={openActions === b.name}
                  onClick={() => setOpenActions((current) => (current === b.name ? null : b.name))}
                >
                  ⋯
                </button>
              </td>
            </tr>
            {openActions === b.name && (
              <tr className="row-actions">
                <td colSpan={billColumnCount}>
                  <div className="page-actions">
                    {planning && planRemovalFor(b.name) && (
                      <button className="btn sm" onClick={() => {
                        setOpenActions(null);
                        keepInYear(b.name);
                        notify(`${b.name} kept in ${year}`);
                      }}>{`Keep in ${year}`}</button>
                    )}
                    {!removedForYear(b.name) && (
                      <button className="btn sm" onClick={() => {
                        setOpenActions(null);
                        if (planning) {
                          if (!confirm(`Remove ${b.name} from ${year} and every later year? Earlier years stay untouched.`)) return;
                          removeFromYear(b.name);
                          notify(`${b.name} removed from ${year} and later years`);
                          return;
                        }
                        if (!confirm(`Stop ${b.name} from ${MONTH_LONG[month - 1]} ${year}? Earlier months and earlier years keep their payments.`)) return;
                        stopBillFrom(b.name);
                        notify(`${b.name} stops from ${MONTH_LONG[month - 1]} ${year}`);
                      }}>{planning ? `Remove from ${year}` : `Stop from ${MONTH_LONG[month - 1]}`}</button>
                    )}
                    {/* Delete takes a bill out of every year, so it belongs to the live
                        year's view; a plan year can only remove it from that year on. */}
                    {!planning && (
                      <button className="btn sm danger" onClick={() => { setOpenActions(null); deleteBill(b.name); }}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </Table>
        {stoppedBillCount > 0 && (
          <div className="toolbar" style={{ borderTop: '1px solid var(--line)' }}>
            <span className="muted small">{activeBillCount} active · {stoppedBillCount} {planning ? 'stopped or removed' : 'stopped'}</span>
            <div className="toolbar-spacer" />
            <button className="btn ghost sm" onClick={() => setShowStopped((open) => !open)}>
              {showStopped ? `Hide ${hiddenBillLabel}` : `Show ${hiddenBillLabel}`}
            </button>
          </div>
        )}
        {ds.providers.rent && (
          <div style={{ padding: '12px 16px 0' }}>
            <div className="notice info">
              Rent's monthly charge and payment are set on the Rent page, so this tab and that page never disagree.{' '}
              <button className="btn ghost sm" onClick={() => go('rent')}>Open Rent</button>
            </div>
          </div>
        )}
        {planning && (
          <div style={{ padding: '0 16px 16px' }}>
            <div className="notice info">
              You are planning <strong>{year}</strong>. Amount and due-day edits create a {year}-only bill change; the base definitions and earlier years are not rewritten. A bill linked to a provider sheet keeps its plan amount and due day, both set on the provider page. A bill added here starts in {year}. Remove from {year} takes a bill out of {year} and every later year, and Keep in {year} undoes that removal — a plan year never rewrites an earlier one. A stopped or removed bill sits behind the toggle below; to delete a bill from every year, use the current year's Bills tab.
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
        <div className="panel-head" style={{ borderTop: '1px solid var(--line)' }}>
          <div>
            <h3 className="card-title">Link sheets</h3>
            <p className="card-sub">Optional labels that group bills. A provider-linked sheet keeps its provider lookup when renamed; a custom sheet is a label only, so its bills use the base amount.</p>
          </div>
          <Badge tone={sheets.length ? 'blue' : 'neutral'}>{sheets.length} sheet{sheets.length === 1 ? '' : 's'}</Badge>
        </div>
        <div className="muted small" style={{ padding: '0 16px 4px' }}>
          {sheets.length === 0
            ? 'No link sheets yet — add one below and pick it on a bill.'
            : (
              <div style={{ display: 'grid', gap: 6 }}>
                {sheets.map((sheet) => {
                  const used = ds.bills.filter((b) => b.linkedSheet === sheet.name).length;
                  return (
                    <div key={sheet.name} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{sheet.name} ({sheet.providerKey ? 'provider' : 'custom'}, {used} bill{used === 1 ? '' : 's'})</span>
                      <button
                        className="btn ghost sm"
                        aria-label={`Delete link sheet ${sheet.name}`}
                        title={sheet.providerKey && used > 0 ? 'Remove the bill first, then the sheet' : undefined}
                        onClick={() => removeSheet(sheet.name)}
                      >Delete</button>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
        {orphanProviders.length > 0 && (
          <div style={{ padding: '0 16px 8px', display: 'grid', gap: 6 }}>
            {orphanProviders.map((provider) => (
              <div key={provider.key} className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>{provider.label} — provider page with no bill and no link sheet</span>
                <button
                  className="btn ghost sm"
                  aria-label={`Remove ${provider.label} from the menu`}
                  onClick={() => removeProviderFromMenu(provider.key)}
                >Remove from menu</button>
              </div>
            ))}
          </div>
        )}
        <div className="inline-form">
          <Field label="New link sheet"><input className="input" placeholder="e.g. TV Licence" value={sheetDraft} onChange={(e) => setSheetDraft(e.target.value)} /></Field>
          <button className="btn primary" onClick={addSheet}>Add link sheet</button>
          {sheets.length > 0 && (
            <>
              <Field label="Rename link sheet">
                <select
                  className="select"
                  value={sheetRename.from || sheets[0]?.name || ''}
                  onChange={(e) => setSheetRename({ ...sheetRename, from: e.target.value })}
                >
                  {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
                </select>
              </Field>
              <Field label="New name">
                <input
                  className="input"
                  placeholder="New sheet name"
                  value={sheetRename.to}
                  onChange={(e) => setSheetRename({ ...sheetRename, to: e.target.value })}
                />
              </Field>
              <button className="btn" onClick={() => {
                const from = sheetRename.from || sheets[0]?.name || '';
                if (renameSheet(from, sheetRename.to)) setSheetRename({ from: '', to: '' });
              }}>Rename</button>
              <button className="btn ghost" onClick={() => removeSheet(sheetRename.from || sheets[0]?.name || '')}>Remove</button>
            </>
          )}
        </div>
      </Section>

      <Section title={planning ? `Bill changes for ${year}` : 'Bill changes'} sub="Latest matching override wins; same From/To month is a one-off. A dated change is the way to alter one month without rewriting the bill's base amount.">
        <Table className="ledger-table-start" head={['Bill', 'From', 'To', 'Amount', 'Due override', 'Type', 'Note', '']} numHead={[3]}>
          {ds.billChanges.filter((c) => !planning || ((!c.appliesFrom || c.appliesFrom <= planEnd) && (!c.appliesTo || c.appliesTo >= planStart))).map((c, i) => (
            <tr key={`${c.bill}-${c.appliesFrom}-${c.appliesTo}-${i}`}>
              <td>{c.bill}</td>
              <td className="muted">{dateUk(c.appliesFrom)}</td>
              <td className="muted">{c.appliesTo ? dateUk(c.appliesTo) : '—'}</td>
              <td className="num">{c.amountOverridePence === null ? '—' : gbp(c.amountOverridePence)}</td>
              <td className="muted">{c.dueDateOverride ? dateUk(c.dueDateOverride) : typeof c.dueDayOverride === 'number' ? `Day ${c.dueDayOverride}` : '—'}</td>
              <td className="muted small">{c.skip ? `Removed for ${year}` : c.changeType || '—'}</td>
              <td className="muted small">{c.note || '—'}</td>
              <td><button className="btn ghost sm" onClick={() => {
                // `update` hands the mutator a cloned dataset, so this row's object
                // is not the clone's object and an identity filter would match
                // nothing. Remove it by its position in the saved list instead.
                const index = ds.billChanges.indexOf(c);
                if (index < 0) return;
                update((d) => { d.billChanges.splice(index, 1); });
              }}>Remove</button></td>
            </tr>
          ))}
        </Table>
        {ds.billChanges.length === 0 && <Empty>No bill changes yet. Add one below for a one-off month or a dated range.</Empty>}
        <div className="inline-form">
          <Field label="Bill">
            <select className="select" value={change.bill} onChange={(e) => setChange({ ...change, bill: e.target.value })}>
              {ds.bills.length === 0 && <option value="">No bills</option>}
              {ds.bills.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </Field>
          <div className="field">
            <span>What changes</span>
            <div className="segmented" role="group" aria-label="Kind of bill change">
              {CHANGE_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`btn sm ${change.mode === mode.id ? 'primary' : 'ghost'}`}
                  aria-pressed={change.mode === mode.id}
                  onClick={() => setChange({ ...change, mode: mode.id })}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <Field label={change.mode === 'stop' ? 'Stops from' : 'Applies from'}><input className="input" type="date" value={change.from} onChange={(e) => setChange({ ...change, from: e.target.value })} /></Field>
          {change.mode !== 'stop' && (
            <Field label="Applies to" hint="Leave blank for this month onwards"><input className="input" type="date" value={change.to} onChange={(e) => setChange({ ...change, to: e.target.value })} /></Field>
          )}
          {change.mode === 'date' && (
            <Field label="New date"><input className="input" type="date" value={change.due} onChange={(e) => setChange({ ...change, due: e.target.value })} /></Field>
          )}
          {change.mode === 'amount' && (
            <Field label="New amount £"><input className="input" inputMode="decimal" value={change.amount} onChange={(e) => setChange({ ...change, amount: e.target.value })} /></Field>
          )}
          <button className="btn primary" onClick={addChange}>{change.mode === 'stop' ? 'Stop the bill' : 'Add change'}</button>
        </div>
      </Section>
    </>
  );
}
