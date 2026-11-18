import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, type Dataset } from '../core/engine.ts';
import {
  explainAccount,
  explainBill,
  explainCard,
  explainLock,
  explainMonth,
  explainNetWorth,
  explainPerson,
} from '../core/explain.ts';

function dataset(): Dataset {
  return {
    settings: {
      targetYear: 2026,
      startMonth: 1,
      currency: '£',
      monthsInYear: 12,
      asOfDate: '2026-11-10',
      lockCutoff: '2026-11-01',
      anchorDate: '2026-11-01',
      primaryAccount: 'Current',
    },
    accounts: [{ name: 'Current', targetPence: 0, openingPence: 100_000, sortOrder: 1, active: true }],
    people: [{ shortName: 'Steve', fullName: 'Steve Smith', openingPence: 0, sortOrder: 1, active: true }],
    cards: [{ name: 'Card', limitPence: 200_000, openingPence: 50_000, sortOrder: 1, active: true }],
    bills: [{
      name: 'Rent',
      amountPence: 20_000,
      dueDay: 15,
      linkedSheet: '',
      frequency: 'Monthly',
      latestBalancePence: 0,
      latestPaymentPence: 0,
      sortOrder: 1,
      active: true,
      effectiveFrom: '',
      paymentMethod: 'Standing Order',
      baseAmountPence: 20_000,
      baseDueDay: 15,
    }],
    billChanges: [{ bill: 'Rent', appliesFrom: '2026-01-01', appliesTo: '', amountOverridePence: null, dueDateOverride: '', changeType: 'Rent change', note: 'Annual increase' }],
    incomeSchedules: {
      pip: [{
        month: 'Nov',
        year2026: { date: '2026-11-20', amountPence: 90_000 },
        year2027: { date: '', amountPence: 0 },
        year2028: { date: '', amountPence: 0 },
      }],
      uc: [],
    },
    transactions: [
      { row: 1, date: '2026-11-05', account: 'Current', type: 'Expense', amountPence: 1_000, comments: 'Shop', status: '', budgetTreatment: '' },
      { row: 2, date: '2026-11-06', account: 'Card', type: 'Expense', amountPence: 2_000, comments: 'Card shop', status: '', budgetTreatment: '' },
      { row: 3, date: '2026-11-07', account: 'Steve', type: 'Expense', amountPence: 3_000, comments: 'Lent', status: '', budgetTreatment: '' },
    ],
    providers: {},
    savings: [],
    debts: [],
    assets: [],
  };
}

const sum = (explanation: { rows: { amountPence: number }[] }) => explanation.rows.reduce((total, row) => total + row.amountPence, 0);

test('income and expense explanations add up to their displayed figures', () => {
  const ds = dataset();
  const engine = buildEngine(ds);

  for (const figure of ['income', 'expenses', 'net'] as const) {
    const explanation = explainMonth(ds, engine, 2026, 11, figure);
    assert.equal(sum(explanation), explanation.totalPence, `${figure} rows sum to the total`);
  }
});

test('the bills explanation lists the scheduled rows and sums to the bill total', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const explanation = explainMonth(ds, engine, 2026, 11, 'bills');

  assert.equal(explanation.totalPence, engine.scheduledBillsTotal(2026, 11));
  assert.equal(sum(explanation), explanation.totalPence);
  assert.ok(explanation.rows.some((row) => row.label === 'Rent'));
});

test('a bill explanation shows the base amount and every effective change', () => {
  const ds = dataset();
  ds.billChanges = [
    { bill: 'Rent', appliesFrom: '2026-04-01', appliesTo: '', amountOverridePence: 22_000, dueDateOverride: '', changeType: 'Rent change', note: 'April rise' },
    { bill: 'Rent', appliesFrom: '2026-10-01', appliesTo: '', amountOverridePence: 25_000, dueDateOverride: '', changeType: 'Rent change', note: 'Autumn rise' },
  ];
  const engine = buildEngine(ds);
  const explanation = explainBill(ds, engine, 2026, 11, 'Rent');

  assert.equal(explanation.totalPence, 25_000);
  assert.equal(sum(explanation), 25_000);
  assert.equal(explanation.rows[0].amountPence, 20_000);
  assert.ok(explanation.rows.some((row) => row.label === 'Change from 2026-04-01'));
  assert.ok(explanation.rows.some((row) => row.label === 'Change from 2026-10-01'));
});

test('account, card and person explanations use the same ledger the view displays', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const asOf = ds.settings.asOfDate;

  const account = explainAccount(ds, engine, 'Current');
  assert.equal(account.totalPence, engine.dashboard(2026, 11).accounts.find((entry) => entry.name === 'Current')?.balancePence);
  assert.equal(sum(account), account.totalPence);

  const card = explainCard(ds, engine, 'Card');
  assert.equal(card.totalPence, engine.cardBalances(asOf).find((entry) => entry.name === 'Card')?.balancePence);
  assert.equal(sum(card), card.totalPence);

  const person = explainPerson(ds, engine, 'Steve');
  assert.equal(person.totalPence, 3_000);
  assert.equal(sum(person), person.totalPence);
});

test('a locked month explains from its snapshot, not a fresh calculation', () => {
  const ds = dataset();
  ds.monthLocks = {
    '2026-11': {
      lockedAt: '2026-11-30T12:00:00Z',
      note: 'Checked against statements',
      incomePence: 90_000,
      expensesPence: 60_000,
      netPence: 30_000,
      owedPence: 3_000,
      accounts: [{ name: 'Current', balancePence: 120_000 }],
      cards: [{ name: 'Card', balancePence: 52_000 }],
      people: [{ shortName: 'Steve', balancePence: 3_000 }],
      bills: [{ name: 'Rent', amountPence: 25_000 }],
    },
  };
  const engine = buildEngine(ds);
  const income = explainMonth(ds, engine, 2026, 11, 'income');
  const expenses = explainMonth(ds, engine, 2026, 11, 'expenses');
  const lock = explainLock(ds, 2026, 11);

  assert.equal(income.source, 'locked');
  assert.equal(income.totalPence, 90_000);
  assert.equal(expenses.totalPence, 60_000);
  assert.equal(sum(income), income.totalPence);
  assert.equal(sum(expenses), expenses.totalPence);
  assert.equal(lock.totalPence, 30_000);
  assert.equal(sum(lock), lock.totalPence);
  assert.equal(lock.note, 'Checked against statements');
});

test('net worth explanations add up to the same total the view shows', () => {
  const ds = dataset();
  ds.assets = [{ id: 'asset_1', name: 'Home', kind: 'property', valuePence: 100_000, ownershipPct: 50, includeInNetWorth: true, active: true }];
  const engine = buildEngine(ds);
  const explanation = explainNetWorth(ds, engine);

  assert.equal(sum(explanation), explanation.totalPence);
  const cash = engine.accountBalances(ds.settings.asOfDate).reduce((total, account) => total + account.balancePence, 0);
  const cards = engine.cardBalances(ds.settings.asOfDate).reduce((total, card) => total + card.balancePence, 0);
  assert.equal(explanation.totalPence, cash + 50_000 - cards);
});
