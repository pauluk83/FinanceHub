import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, type Bill, type BillSheet, type Dataset, type Tx } from '../core/engine.ts';
import { applyHealthFixPlan, buildHealthFixPlan } from '../core/dataHealthFixes.ts';

const TX: Tx = {
  row: 1,
  date: '2026-11-05',
  account: 'Current',
  type: 'Expense',
  amountPence: 1250,
  comments: 'Groceries',
  status: '',
  budgetTreatment: '',
};

function base(): Dataset {
  return {
    settings: {
      targetYear: 2026,
      startMonth: 1,
      monthsInYear: 12,
      currency: '£',
      asOfDate: '2026-11-09',
      lockCutoff: '2026-11-01',
      anchorDate: '2026-11-01',
      primaryAccount: 'Current',
    },
    accounts: [{ name: 'Current', targetPence: 0, openingPence: 100000, sortOrder: 1, active: true }],
    people: [],
    cards: [],
    bills: [],
    billChanges: [],
    transactions: [TX],
    incomeSchedules: { pip: [], uc: [] },
    providers: {},
    monthLocks: {},
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    name: 'Rent',
    amountPence: 50000,
    dueDay: 1,
    linkedSheet: '',
    frequency: 'Monthly',
    latestBalancePence: 0,
    latestPaymentPence: 50000,
    sortOrder: 1,
    active: true,
    effectiveFrom: '2026-01-01',
    paymentMethod: 'Direct debit',
    baseAmountPence: 50000,
    baseDueDay: 1,
    ...overrides,
  };
}

function generatedRow(name: string, month: string, amountPence = 50000): Tx {
  return {
    ...TX,
    row: 2,
    date: `${month}-01`,
    type: 'Expense',
    amountPence,
    comments: name,
    status: 'Auto',
    budgetTreatment: 'Bill',
    autoBill: true,
    billKey: `${name}|${month}`,
    starlingPosted: false,
  };
}

const SHEETS: BillSheet[] = [{ name: 'Rent', providerKey: 'rent' }, { name: 'Travel', providerKey: '' }];

test('an orphaned bill change is previewed and removed, leaving live ones alone', () => {
  const ds = base();
  ds.bills = [bill()];
  ds.billChanges = [
    { bill: 'Rent', appliesFrom: '2026-04-01', appliesTo: '2026-05-01', amountOverridePence: 51000, dueDateOverride: '', changeType: 'Amount', note: '' },
    { bill: 'Gone', appliesFrom: '2026-01-01', appliesTo: '2026-02-01', amountOverridePence: 900, dueDateOverride: '', changeType: 'Amount', note: '' },
  ];

  const plan = buildHealthFixPlan(ds, { sheets: SHEETS });
  const fix = plan.fixes.find((entry) => entry.id === 'bill-changes');
  assert.equal(fix?.changes.length, 1);
  assert.equal(fix?.changes[0].label, 'Gone');
  assert.match(fix?.changes[0].before ?? '', /2026-01-01 to 2026-02-01/);
  assert.equal(fix?.changes[0].after, 'Removed');
  assert.equal(plan.changeCount, 1);

  assert.equal(applyHealthFixPlan(ds, { sheets: SHEETS }), 1);
  assert.deepEqual(ds.billChanges.map((change) => change.bill), ['Rent']);
});

test('generated rows for a deleted bill are removed without moving a figure', () => {
  const ds = base();
  ds.bills = [bill()];
  ds.billChanges = [];
  ds.transactions = [TX, generatedRow('Rent', '2026-11'), generatedRow('OldGym', '2026-11', 950)];
  const before = buildEngine(ds);
  const balance = before.starlingBalance('2026-11-09');
  const expenses = before.dashboard(2026, 11).expensesPence;

  const plan = buildHealthFixPlan(ds, { sheets: SHEETS });
  const fix = plan.fixes.find((entry) => entry.id === 'generated-bill-rows');
  assert.equal(fix?.changes.length, 1);
  assert.match(fix?.summary ?? '', /1 row · £9\.50 in total/);

  assert.equal(applyHealthFixPlan(ds, { sheets: SHEETS }), 1);
  assert.equal(ds.transactions.some((row) => row.billKey === 'OldGym|2026-11'), false);
  assert.equal(ds.transactions.some((row) => row.billKey === 'Rent|2026-11'), true, 'the live bill keeps its row');

  const after = buildEngine(ds);
  assert.equal(after.starlingBalance('2026-11-09'), balance);
  assert.equal(after.dashboard(2026, 11).expensesPence, expenses);
});

test('a bill linked to a sheet that no longer exists is unlinked, and valid links stay', () => {
  const ds = base();
  ds.bills = [
    bill({ name: 'Rent', linkedSheet: 'Rent' }),
    bill({ name: 'Water', linkedSheet: 'Travel' }),
    bill({ name: 'Mystery', linkedSheet: 'Removed sheet' }),
    bill({ name: 'Hidden', linkedSheet: 'Ovo' }),
  ];
  ds.providers = { rent: { year: 2026 } };
  // The Ovo sheet still exists because hiding a provider ledger keeps its data.
  const sheets: BillSheet[] = [...SHEETS, { name: 'Ovo', providerKey: 'ovo' }];

  const plan = buildHealthFixPlan(ds, { sheets });
  assert.deepEqual(plan.fixes.map((fix) => fix.id), ['bill-links']);
  assert.deepEqual(plan.fixes[0].changes.map((change) => change.label), ['Mystery']);
  assert.match(plan.fixes[0].changes[0].before, /Removed sheet/);
  assert.equal(plan.fixes[0].changes[0].after, 'No link sheet');

  assert.equal(applyHealthFixPlan(ds, { sheets }), 1);
  const links = new Map(ds.bills.map((entry) => [entry.name, entry.linkedSheet]));
  assert.equal(links.get('Mystery'), '');
  assert.equal(links.get('Rent'), 'Rent');
  assert.equal(links.get('Water'), 'Travel');
  assert.equal(links.get('Hidden'), 'Ovo', 'a hidden provider ledger keeps its link');
});

test('a healthy budget offers nothing and applying changes nothing', () => {
  const ds = base();
  ds.bills = [bill({ linkedSheet: 'Rent' })];
  ds.transactions = [TX, generatedRow('Rent', '2026-11')];
  const snapshot = JSON.stringify(ds);

  const plan = buildHealthFixPlan(ds, { sheets: SHEETS });
  assert.equal(plan.fixes.length, 0);
  assert.equal(plan.changeCount, 0);
  assert.equal(applyHealthFixPlan(ds, { sheets: SHEETS }), 0);
  assert.equal(JSON.stringify(ds), snapshot);
});

test('applying twice applies nothing the second time', () => {
  const ds = base();
  ds.bills = [bill({ linkedSheet: 'Gone sheet' })];
  ds.billChanges = [
    { bill: 'Gone', appliesFrom: '2026-01-01', appliesTo: '', amountOverridePence: 1000, dueDateOverride: '', changeType: 'Amount', note: '' },
  ];
  ds.transactions = [TX, generatedRow('Ghost', '2026-11', 500)];

  assert.equal(applyHealthFixPlan(ds, { sheets: SHEETS }), 3);
  assert.equal(applyHealthFixPlan(ds, { sheets: SHEETS }), 0);
  assert.equal(buildHealthFixPlan(ds, { sheets: SHEETS }).changeCount, 0);
});

test('the preview count matches the records the apply step touches', () => {
  const ds = base();
  ds.bills = [bill({ linkedSheet: 'Old sheet' })];
  ds.billChanges = [
    { bill: 'Gone', appliesFrom: '', appliesTo: '', amountOverridePence: 100, dueDateOverride: '', changeType: 'Amount', note: '' },
  ];
  ds.transactions = [TX, generatedRow('Gone', '2026-10', 100), generatedRow('Gone', '2026-11', 100)];
  const rowsBefore = ds.transactions.length;
  const plan = buildHealthFixPlan(ds, { sheets: SHEETS });
  assert.equal(plan.changeCount, 4);
  assert.equal(applyHealthFixPlan(ds, { sheets: SHEETS }), 4);
  assert.equal(ds.transactions.length, rowsBefore - 2);
});
