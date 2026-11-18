import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPayoffPlan, payoffPlan, savingsProgress, yearComparison } from '../core/progress.ts';
import { buildEngine, type Dataset, type Debt, type Tx } from '../core/engine.ts';

const debt = (id: string, name: string, balancePence: number, monthlyPaymentPence: number, annualRatePct = 0): Debt => ({
  id, name, balancePence, monthlyPaymentPence, annualRatePct,
});

function dataset(): Dataset {
  return {
    settings: {
      targetYear: 2026, startMonth: 1, monthsInYear: 12, currency: '£',
      asOfDate: '2026-11-18', lockCutoff: '2026-11-01', anchorDate: '2026-11-01',
      primaryAccount: 'Current',
    },
    accounts: [{ name: 'Current', targetPence: 0, openingPence: 0, sortOrder: 1, active: true }],
    people: [], cards: [], bills: [], billChanges: [],
    incomeSchedules: { pip: [], uc: [] }, transactions: [], providers: {}, monthLocks: {},
  };
}

const tx = (row: number, date: string, type: 'Income' | 'Expense', amountPence: number): Tx => ({
  row, date, account: 'Current', type, amountPence, comments: '', status: '', budgetTreatment: '',
});

test('a zero-interest debt pays off in balance ÷ payment months', () => {
  const plan = payoffPlan([debt('a', 'Card', 100_000, 10_000)], { startDate: '2026-11-18' });
  assert.equal(plan.ok, true);
  assert.equal(plan.months, 10);
  assert.equal(plan.payoffDate, '2027-09-18');
  assert.equal(plan.totalInterestPence, 0);
  assert.equal(plan.interestSavedPence, 0);
});

test('a cleared payment keeps rolling into the next debt for the whole plan', () => {
  const plan = payoffPlan([
    debt('a', 'A', 10_000, 10_000),
    debt('b', 'B', 100_000, 5_000),
  ], { startDate: '2026-11-18' });

  assert.equal(plan.ok, true);
  assert.equal(plan.months, 8, 'the freed £100 a month keeps paying B down');
  assert.equal(plan.payoffDate, '2027-07-18');
  assert.ok(plan.schedule.every((entry) => entry.paymentPence <= 15_000), 'never more than the planned monthly total');
  assert.deepEqual(plan.schedule.slice(0, 7).map((entry) => entry.paymentPence), Array(7).fill(15_000));
  assert.equal(plan.schedule[7].paymentPence, 5_000, 'the last month pays only what is left');
  assert.equal(
    plan.startingPayments.reduce((sum, entry) => sum + entry.toPence, 0),
    15_000,
    'applying the plan asks for the same total the simulation used',
  );
});

test('avalanche costs less interest than snowball when the rates differ', () => {
  const debts = [debt('small', 'Small', 20_000, 5_000, 0), debt('big', 'Big', 100_000, 5_000, 24)];
  const snowball = payoffPlan(debts, { strategy: 'snowball', extraPence: 5_000, startDate: '2026-11-18' });
  const avalanche = payoffPlan(debts, { strategy: 'avalanche', extraPence: 5_000, startDate: '2026-11-18' });

  assert.equal(snowball.ok, true);
  assert.equal(avalanche.ok, true);
  assert.ok(avalanche.totalInterestPence < snowball.totalInterestPence);
});

test('payments that never cover the interest are refused', () => {
  const plan = payoffPlan([debt('a', 'Store card', 200_000, 2_000, 30)], { startDate: '2026-11-18' });
  assert.equal(plan.ok, false);
  assert.match(plan.reason ?? '', /never fall|never/i);
});

test('applying a plan changes only the monthly payment', () => {
  const ds = dataset();
  ds.debts = [debt('a', 'Card', 100_000, 10_000), debt('b', 'Loan', 60_000, 5_000)];
  const plan = payoffPlan(ds.debts, { extraPence: 5_000, startDate: '2026-11-18' });
  const balances = ds.debts.map((entry) => entry.balancePence);

  const applied = applyPayoffPlan(ds, plan);
  assert.ok(applied.length > 0);
  assert.deepEqual(ds.debts.map((entry) => entry.balancePence), balances, 'balances are never rewritten');
  assert.ok(ds.debts.some((entry) => entry.monthlyPaymentPence > 5_000));
  assert.equal(
    ds.debts.reduce((sum, entry) => sum + entry.monthlyPaymentPence, 0),
    20_000,
    'the applied payments total the plan\'s monthly budget, not more',
  );
});

test('a savings target date produces the required monthly amount', () => {
  const [progress] = savingsProgress([{
    id: 's1', name: 'Deposit', balancePence: 0, targetPence: 120_000,
    targetDate: '2027-11-18', monthlyContributionPence: 5_000, interestRatePct: 0,
  }], '2026-11-18');

  assert.equal(progress.monthsLeft, 12);
  assert.equal(progress.requiredMonthlyPence, 10_000);
  assert.equal(progress.onTrack, false);
  assert.equal(progress.gapPence, 5_000);
});

test('a reached target is on track and needs nothing more', () => {
  const [progress] = savingsProgress([{
    id: 's1', name: 'Deposit', balancePence: 150_000, targetPence: 120_000,
    targetDate: '2027-11-18', monthlyContributionPence: 0,
  }], '2026-11-18');
  assert.equal(progress.onTrack, true);
  assert.equal(progress.requiredMonthlyPence, 0);
  assert.equal(progress.status, 'Target reached');
});

test('year over year reports no previous year honestly', () => {
  const ds = dataset();
  const comparison = yearComparison(ds, buildEngine(ds), 2026, 11);
  assert.equal(comparison.hasPrevious, false);
  assert.match(comparison.note, /nothing to compare/);
  assert.deepEqual(comparison.rows, [], 'no previous-year figures are invented');
  assert.deepEqual(comparison.categories, []);
  assert.deepEqual(comparison.providers, []);
});

test('year over year compares the same month last year', () => {
  const ds = dataset();
  ds.transactions = [
    tx(1, '2025-11-05', 'Income', 150_000),
    tx(2, '2026-11-05', 'Income', 200_000),
    tx(3, '2025-11-09', 'Expense', 40_000),
    tx(4, '2026-11-09', 'Expense', 55_000),
  ];
  const comparison = yearComparison(ds, buildEngine(ds), 2026, 11);

  assert.equal(comparison.hasPrevious, true);
  const income = comparison.rows.find((row) => row.label === 'Income');
  assert.equal(income?.currentPence, 200_000);
  assert.equal(income?.previousPence, 150_000);
  assert.equal(income?.deltaPence, 50_000);
  const expenses = comparison.rows.find((row) => row.label === 'Expenses');
  assert.equal(expenses?.deltaPence, 15_000);
});
