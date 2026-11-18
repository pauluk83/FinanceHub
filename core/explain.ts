/**
 * "Explain this number": every panel lists the components the engine already
 * used, so the rows always add up to the displayed figure. No second
 * calculation is introduced here — the engine's own breakdown is the source.
 */
import type { Dataset, Engine } from './engine.ts';
import { netWorth } from './assets.ts';

export type ExplanationSource = 'live' | 'locked' | 'workbook';

export interface ExplanationRow {
  label: string;
  detail?: string;
  amountPence: number;
}

export interface Explanation {
  key: string;
  title: string;
  subtitle?: string;
  totalPence: number;
  rows: ExplanationRow[];
  source: ExplanationSource;
  note?: string;
  linkView?: string;
}

const signed = (amountPence: number) => amountPence;

export function explainMonth(ds: Dataset, engine: Engine, year: number, month: number, figure: 'income' | 'expenses' | 'net' | 'bills'): Explanation {
  const summary = engine.monthlySummary(year, month);
  const locked = summary.locked;
  const source: ExplanationSource = summary.source === 'manual-lock'
    ? 'locked'
    : summary.source === 'workbook-locked-snapshot' ? 'workbook' : 'live';
  const label = `${summary.label} ${year}`;
  const lock = ds.monthLocks?.[`${year}-${String(month).padStart(2, '0')}`];

  if (figure === 'net') {
    return {
      key: `net-${year}-${month}`,
      title: `Net for ${label}`,
      subtitle: 'Income minus expenses',
      totalPence: summary.netPence,
      source,
      linkView: 'monthly',
      note: locked ? 'Both figures come from the locked month, not from a fresh calculation.' : undefined,
      rows: [
        { label: 'Income', amountPence: signed(summary.incomePence) },
        { label: 'Expenses', detail: 'subtracted', amountPence: signed(-summary.expensesPence) },
      ],
    };
  }

  if (figure === 'bills') {
    if (locked && lock?.bills) {
      return {
        key: `bills-${year}-${month}`,
        title: `Bills for ${label}`,
        subtitle: 'Locked snapshot',
        totalPence: lock.bills.reduce((sum, bill) => sum + bill.amountPence, 0),
        source,
        linkView: 'monthEnd',
        note: 'The locked month keeps the bill amounts that were true when it closed.',
        rows: lock.bills.map((bill) => ({ label: bill.name, amountPence: bill.amountPence })),
      };
    }
    const bills = engine.scheduledBills(year, month);
    return {
      key: `bills-${year}-${month}`,
      title: `Bills for ${label}`,
      subtitle: `${bills.length} scheduled bill${bills.length === 1 ? '' : 's'}`,
      totalPence: bills.reduce((sum, bill) => sum + bill.amountPence, 0),
      source,
      linkView: 'bills',
      rows: bills.map((bill) => ({
        label: bill.name,
        detail: `Due ${bill.dueDate}${bill.paid ? ' · paid' : ''}`,
        amountPence: bill.amountPence,
      })),
    };
  }

  if (locked) {
    const totalPence = figure === 'income' ? summary.incomePence : summary.expensesPence;
    return {
      key: `${figure}-${year}-${month}`,
      title: `${figure === 'income' ? 'Income' : 'Expenses'} for ${label}`,
      subtitle: source === 'workbook' ? 'Frozen workbook snapshot' : 'Locked snapshot',
      totalPence,
      source,
      linkView: 'monthEnd',
      note: 'A locked month is a historical fact; its components were frozen when it closed.',
      rows: [
        {
          label: figure === 'income' ? 'Locked income total' : 'Locked expenses total',
          detail: 'No live recalculation',
          amountPence: totalPence,
        },
      ],
    };
  }

  if (figure === 'income') {
    const mix = engine.monthlyIncome(year, month);
    return {
      key: `income-${year}-${month}`,
      title: `Income for ${label}`,
      subtitle: 'Every income leg the engine summed',
      totalPence: mix.total,
      source,
      linkView: 'income',
      rows: [
        { label: 'PIP', detail: 'Income schedule', amountPence: mix.pip },
        { label: 'Universal Credit', detail: 'Income schedule', amountPence: mix.uc },
        { label: `${ds.settings.primaryAccount || 'Main account'} income`, detail: 'Posted bank rows', amountPence: mix.starlingIncome },
        { label: 'People repayments', detail: 'Person ledgers', amountPence: mix.peopleIncome },
      ],
    };
  }

  const mix = engine.monthlyExpenses(year, month);
  return {
    key: `expenses-${year}-${month}`,
    title: `Expenses for ${label}`,
    subtitle: 'Every expense leg the engine summed',
    totalPence: mix.total,
    source,
    linkView: 'monthly',
    rows: [
      { label: 'Scheduled bills', detail: 'Bill engine', amountPence: mix.bills },
      { label: 'People', detail: 'Person ledgers', amountPence: mix.people },
      { label: `${ds.settings.primaryAccount || 'Main account'} cash`, detail: 'Posted bank rows', amountPence: mix.starling },
      { label: 'Petrol / other', detail: 'Pseudo-accounts', amountPence: mix.pseudo },
      { label: 'Card spend', amountPence: mix.cardSpend },
      { label: 'Card refunds', detail: 'subtracted', amountPence: -mix.cardRefunds },
    ].filter((row) => row.amountPence !== 0),
  };
}

export function explainBill(ds: Dataset, engine: Engine, year: number, month: number, name: string): Explanation {
  const bill = ds.bills.find((entry) => entry.name === name);
  const scheduled = engine.scheduledBills(year, month).find((entry) => entry.name === name);
  if (!bill || !scheduled) {
    return {
      key: `bill-${name}`,
      title: name,
      totalPence: 0,
      rows: [],
      source: 'live',
      note: 'This bill is not scheduled in the selected month.',
    };
  }

  const mStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const base = bill.baseAmountPence || bill.amountPence || 0;
  const rows: ExplanationRow[] = [{ label: 'Base amount', detail: bill.linkedSheet ? `Linked to ${bill.linkedSheet}` : undefined, amountPence: base }];
  let running = base;

  const changes = ds.billChanges
    .filter((change) => change.bill === name && change.amountOverridePence !== null && change.amountOverridePence !== undefined)
    .filter((change) => change.appliesFrom && mStart >= change.appliesFrom && (!change.appliesTo || mStart <= change.appliesTo))
    .sort((left, right) => left.appliesFrom.localeCompare(right.appliesFrom));

  for (const change of changes) {
    const next = Number(change.amountOverridePence);
    if (!Number.isFinite(next)) continue;
    rows.push({
      label: `Change from ${change.appliesFrom}`,
      detail: change.note || change.changeType || undefined,
      amountPence: next - running,
    });
    running = next;
  }

  const final = engine.billAmount(bill, year, month);
  if (final !== running) {
    rows.push({
      label: bill.linkedSheet ? 'Provider ledger price' : 'Scheduled amount',
      detail: bill.linkedSheet ? `${bill.linkedSheet} month price` : undefined,
      amountPence: final - running,
    });
  }

  return {
    key: `bill-${name}-${year}-${month}`,
    title: `${name} — ${MONTH_LABEL[month - 1]} ${year}`,
    subtitle: `Due ${scheduled.dueDate}${scheduled.paid ? ' · paid' : ''}`,
    totalPence: final,
    source: 'live',
    linkView: 'bills',
    rows,
  };
}

const MONTH_LABEL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function explainAccount(ds: Dataset, engine: Engine, name: string): Explanation {
  const balance = engine.accountBalances(ds.settings.asOfDate).find((account) => account.name === name);
 const statement = engine.statement(name, null, null);
  if (!balance) {
    return { key: `account-${name}`, title: name, totalPence: 0, rows: [], source: 'live', note: 'This account no longer exists.' };
  }
  if (name === (ds.settings.primaryAccount || ds.accounts[0]?.name)) {
    const driver = engine.starlingBreakdown(ds.settings.asOfDate);
    return {
      key: `account-${name}`,
      title: name,
      subtitle: 'Dashboard bank balance',
      totalPence: balance.balancePence,
      source: 'live',
      linkView: 'accounts',
      rows: [
        { label: 'Posted balance', detail: 'Opening balance plus posted rows', amountPence: driver.posted },
        { label: 'People cash', amountPence: driver.peopleCash },
        { label: 'Starling-funded people', amountPence: driver.starlingFundedCash },
        { label: 'Backup Space', amountPence: driver.backupSpace },
        { label: 'Scheduled income after the anchor', amountPence: driver.scheduledIncome },
        { label: 'Scheduled bills after the anchor', detail: 'subtracted', amountPence: -driver.billsOut },
      ].filter((row) => row.amountPence !== 0),
    };
  }
  const income = statement.lines.filter((line) => line.type === 'Income').reduce((sum, line) => sum + line.amountPence, 0);
  const expenses = statement.lines.filter((line) => line.type === 'Expense').reduce((sum, line) => sum + line.amountPence, 0);
  return {
    key: `account-${name}`,
    title: name,
    subtitle: 'All rows in this ledger',
    totalPence: balance.balancePence,
    source: 'live',
    linkView: 'accounts',
    rows: [
      { label: 'Opening balance', amountPence: statement.openingPence },
      { label: `Money in (${statement.lines.filter((line) => line.type === 'Income').length})`, amountPence: income },
      { label: `Money out (${statement.lines.filter((line) => line.type === 'Expense').length})`, amountPence: -expenses },
    ],
  };
}

export function explainCard(ds: Dataset, engine: Engine, name: string): Explanation {
  const card = engine.cardBalances(ds.settings.asOfDate).find((entry) => entry.name === name);
  if (!card) return { key: `card-${name}`, title: name, totalPence: 0, rows: [], source: 'live', note: 'This card no longer exists.' };
  const statement = engine.statement(name, null, null);
  const charges = statement.lines.filter((line) => line.type === 'Expense').reduce((sum, line) => sum + line.amountPence, 0);
  const credits = statement.lines.filter((line) => line.type === 'Income').reduce((sum, line) => sum + line.amountPence, 0);
  return {
    key: `card-${name}`,
    title: name,
    subtitle: `${card.utilisation === 0 ? '0' : Math.round(card.utilisation * 100)}% of the ${(card.limitPence / 100).toFixed(2)} limit`,
    totalPence: card.balancePence,
    source: 'live',
    linkView: 'cards',
    rows: [
      { label: 'Opening balance', amountPence: card.openingPence },
      { label: `Charges (${statement.lines.filter((line) => line.type === 'Expense').length})`, amountPence: charges },
      { label: `Credits and refunds (${statement.lines.filter((line) => line.type === 'Income').length})`, detail: 'subtracted', amountPence: -credits },
    ],
  };
}

export function explainPerson(ds: Dataset, engine: Engine, shortName: string): Explanation {
  const person = ds.people.find((entry) => entry.shortName === shortName);
  const balance = engine.owedByPerson(ds.settings.asOfDate).find((entry) => entry.shortName === shortName);
  if (!person || !balance) return { key: `person-${shortName}`, title: shortName, totalPence: 0, rows: [], source: 'live', note: 'This person no longer exists.' };
  const statement = engine.statement(shortName, null, null);
  const lent = statement.lines.filter((line) => line.type === 'Expense').reduce((sum, line) => sum + line.amountPence, 0);
  const repaid = statement.lines.filter((line) => line.type === 'Income').reduce((sum, line) => sum + line.amountPence, 0);
  return {
    key: `person-${shortName}`,
    title: `${person.fullName || shortName}`,
    subtitle: person.trackOwed === false ? 'Cash tracking only — not counted as owed' : 'What is still owed',
    totalPence: balance.balancePence,
    source: 'live',
    linkView: 'people',
    rows: [
      { label: 'Opening balance', amountPence: person.openingPence },
      { label: 'Lent', amountPence: lent },
      { label: 'Repaid', detail: 'subtracted', amountPence: -repaid },
    ],
  };
}

export function explainNetWorth(ds: Dataset, engine: Engine, through = ds.settings.asOfDate): Explanation {
  const worth = netWorth(ds, engine, through);
  return {
    key: 'net-worth',
    title: 'Net worth',
    subtitle: `As of ${worth.asOf}`,
    totalPence: worth.netPence,
    source: 'live',
    linkView: 'netWorth',
    note: worth.excluded.length > 0 ? `Excluded by choice: ${worth.excluded.join(', ')}.` : undefined,
    rows: [
      { label: `Bank accounts (${worth.accounts.length})`, amountPence: worth.accountsPence },
      { label: `Savings (${worth.savings.length})`, amountPence: worth.savingsPence },
      { label: `Assets (${worth.assets.length})`, amountPence: worth.assetsPence },
      { label: `Cards (${worth.cards.length})`, detail: 'subtracted', amountPence: -worth.cardsPence },
      { label: `Debts (${worth.debts.length})`, detail: 'subtracted', amountPence: -worth.debtsPence },
    ],
  };
}

export function explainLock(ds: Dataset, year: number, month: number): Explanation {
  const lock = ds.monthLocks?.[`${year}-${String(month).padStart(2, '0')}`];
  const label = `${MONTH_LABEL[month - 1]} ${year}`;
  if (!lock) {
    return { key: `lock-${year}-${month}`, title: `Month lock — ${label}`, totalPence: 0, rows: [], source: 'live', note: 'This month has no saved lock.' };
  }
  return {
    key: `lock-${year}-${month}`,
    title: `Month lock — ${label}`,
    subtitle: `Locked ${lock.lockedAt.slice(0, 10)}`,
    totalPence: lock.netPence,
    source: 'locked',
    linkView: 'monthEnd',
    note: lock.note || undefined,
    rows: [
      { label: 'Income', amountPence: lock.incomePence },
      { label: 'Expenses', detail: 'subtracted', amountPence: -lock.expensesPence },
    ],
  };
}
