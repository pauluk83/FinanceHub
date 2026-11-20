/**
 * The monthly "what changed" digest.
 *
 * The digest is a view over the engine, never a second calculation: every
 * figure it prints must equal the engine's own, and building it must leave the
 * budget document and every existing figure untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Bill, type Dataset, type Tx } from '../core/engine.ts';
import { buildMonthDigest, moneyText } from '../core/digest.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORKBOOK = path.join(ROOT, 'data', 'workbook.json');

const tx = (over: Partial<Tx>): Tx => ({
  row: 1,
  date: '2026-11-01',
  account: 'Current',
  type: 'Income',
  amountPence: 0,
  comments: '',
  status: '',
  budgetTreatment: '',
  ...over,
});

const bill = (): Bill => ({
  name: 'Rent',
  amountPence: 50_000,
  dueDay: 1,
  linkedSheet: '',
  frequency: 'Monthly',
  latestBalancePence: 0,
  latestPaymentPence: 50_000,
  sortOrder: 1,
  active: true,
  effectiveFrom: '2026-01-01',
  paymentMethod: 'Direct debit',
  baseAmountPence: 50_000,
  baseDueDay: 1,
});

function base(): Dataset {
  return {
    settings: {
      targetYear: 2026,
      startMonth: 1,
      monthsInYear: 12,
      currency: '£',
      asOfDate: '2026-11-09',
      lockCutoff: '2026-11-01',
      anchorDate: '2026-11-09',
      primaryAccount: 'Current',
    },
    accounts: [{ name: 'Current', targetPence: 0, openingPence: 0, sortOrder: 1, active: true }],
    people: [{ shortName: 'Alex', fullName: 'Alex Example', openingPence: 0, sortOrder: 1, active: true }],
    cards: [],
    bills: [bill()],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [
      tx({ row: 1, date: '2026-10-01', amountPence: 80_000 }),
      tx({ row: 2, date: '2026-10-02', type: 'Expense', amountPence: 10_000 }),
      tx({ row: 3, date: '2026-11-01', amountPence: 100_000 }),
      tx({ row: 4, date: '2026-11-03', type: 'Expense', amountPence: 20_000 }),
    ],
    providers: {},
    monthLocks: {},
    changelog: [
      { date: '2026-11-04', sheetCell: 'Bills', description: 'Rent changed to £500.00' },
      { date: '2026-11-20', sheetCell: 'Accounts', description: 'Opening balance corrected' },
      { date: '2026-10-15', sheetCell: 'Bills', description: 'October change' },
    ],
  };
}

const digestOf = (ds: Dataset, year: number, month: number) => buildMonthDigest(ds, buildEngine(ds, { today: '2026-11-20' }), year, month);

test('the digest compares a month with the one before it', () => {
  const ds = base();
  const engine = buildEngine(ds, { today: '2026-11-20' });
  const digest = buildMonthDigest(ds, engine, 2026, 11);

  const income = digest.changes.find((entry) => entry.id === 'income')!;
  assert.equal(income.before, '£800.00');
  assert.equal(income.after, '£1,000.00');
  assert.equal(income.deltaPence, 20_000);
  assert.equal(income.direction, 'up');

  // Expenses include the £500 scheduled bill, so October is 100 + 500 and
  // November is 200 + 500.
  const expenses = digest.changes.find((entry) => entry.id === 'expenses')!;
  assert.equal(expenses.before, '£600.00');
  assert.equal(expenses.after, '£700.00');
  assert.equal(expenses.direction, 'up');

  const accounts = digest.changes.find((entry) => entry.id === 'accounts')!;
  assert.equal(accounts.after, moneyText(engine.accountBalances('2026-11-30').reduce((sum, account) => sum + account.balancePence, 0)));

  assert.equal(digest.label, 'November 2026');
  assert.equal(digest.previousLabel, 'October 2026');
  assert.equal(digest.locked, false);
});

test('every digest figure is the engine’s own figure', () => {
  const ds = base();
  const engine = buildEngine(ds, { today: '2026-11-20' });
  const digest = buildMonthDigest(ds, engine, 2026, 11);
  const income = engine.monthlySummary(2026, 11).incomePence;
  const expenses = engine.monthlySummary(2026, 11).expensesPence;

  assert.equal(digest.changes.find((entry) => entry.id === 'income')!.after, moneyText(income));
  assert.equal(digest.changes.find((entry) => entry.id === 'expenses')!.after, moneyText(expenses));
  assert.equal(digest.changes.find((entry) => entry.id === 'bills')!.after, moneyText(engine.scheduledBillsTotal(2026, 11)));
  assert.equal(digest.changes.find((entry) => entry.id === 'owed')!.after, moneyText(engine.owedAt('2026-11-30')));
});

test('only the selected month’s budget changes are listed', () => {
  const digest = digestOf(base(), 2026, 11);
  assert.deepEqual(digest.events.map((event) => event.description), [
    'Opening balance corrected',
    'Rent changed to £500.00',
  ]);
  assert.equal(digest.counts.events, 2);
  assert.match(digest.summary, /November 2026/);
  assert.match(digest.summary, /2 budget changes recorded/);
});

test('a quiet month reads as unchanged rather than as a wall of zeros', () => {
  const digest = digestOf(base(), 2026, 9);
  assert.equal(digest.empty, true);
  assert.equal(digest.changes.every((entry) => entry.direction === 'same'), true);
  assert.equal(digest.events.length, 0);
  assert.match(digest.summary, /Nothing changed in September 2026/);
});

test('a locked month says so and keeps the same figures', () => {
  const ds = base();
  const engine = buildEngine(ds, { today: '2026-11-20' });
  ds.monthLocks = {
    '2026-11': {
      lockedAt: '2026-11-30T10:00:00.000Z',
      incomePence: engine.monthlySummary(2026, 11).incomePence,
      expensesPence: engine.monthlySummary(2026, 11).expensesPence,
      netPence: engine.monthlySummary(2026, 11).netPence,
      owedPence: engine.owedAt('2026-11-30'),
      accounts: engine.accountBalances('2026-11-30').map((account) => ({ name: account.name, balancePence: account.balancePence })),
      cards: [],
      people: [],
    },
  };
  const digest = buildMonthDigest(ds, buildEngine(ds, { today: '2026-11-20' }), 2026, 11);
  assert.equal(digest.locked, true);
  assert.match(digest.summary, /the month is locked/);
  assert.equal(digest.changes.find((entry) => entry.id === 'income')!.after, '£1,000.00');
});

test('budget changes from another year are not pulled in', () => {
  const digest = digestOf(base(), 2025, 11);
  assert.equal(digest.events.length, 0);
});

test('building the digest changes no record and moves no existing figure', () => {
  const ds = base();
  const engine = buildEngine(ds, { today: '2026-11-20' });
  const before = JSON.stringify(ds);
  const figures = [
    engine.monthlySummary(2026, 11).incomePence,
    engine.monthlySummary(2026, 11).expensesPence,
    engine.owedAt('2026-11-30'),
    engine.scheduledBillsTotal(2026, 11),
    ...engine.accountBalances('2026-11-30').map((account) => account.balancePence),
  ];

  buildMonthDigest(ds, engine, 2026, 11);
  buildMonthDigest(ds, engine, 2026, 10);
  buildMonthDigest(ds, engine, 2026, 1);

  assert.equal(JSON.stringify(ds), before, 'the dataset is untouched');
  const after = buildEngine(ds, { today: '2026-11-20' });
  assert.deepEqual([
    after.monthlySummary(2026, 11).incomePence,
    after.monthlySummary(2026, 11).expensesPence,
    after.owedAt('2026-11-30'),
    after.scheduledBillsTotal(2026, 11),
    ...after.accountBalances('2026-11-30').map((account) => account.balancePence),
  ], figures, 'every figure is unchanged');
});

test('the loaded workbook digest matches its engine figures', { skip: !fs.existsSync(WORKBOOK) }, () => {
  const ds: Dataset = JSON.parse(fs.readFileSync(WORKBOOK, 'utf8'));
  const engine = buildEngine(ds, { today: '2026-11-20' });
  const snapshot = JSON.stringify(ds);
  const digest = buildMonthDigest(ds, engine, 2026, 11);

  assert.equal(digest.changes.find((entry) => entry.id === 'income')!.after, moneyText(engine.monthlySummary(2026, 11).incomePence));
  assert.equal(digest.changes.find((entry) => entry.id === 'expenses')!.after, moneyText(engine.monthlySummary(2026, 11).expensesPence));
  assert.equal(JSON.stringify(ds), snapshot, 'reading the digest never writes');
  for (const change of digest.changes) {
    assert.match(change.after, /^-?£[\d,]+\.\d{2}$/, `${change.label} is a formatted money figure`);
    assert.match(change.before, /^-?£[\d,]+\.\d{2}$/, `${change.label} has a formatted previous figure`);
  }
});
