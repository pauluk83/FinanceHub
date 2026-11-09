import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, type Bill, type Dataset, type Tx } from '../core/engine.ts';
import { buildDataHealth, type HealthCheck } from '../core/dataHealth.ts';

const TX: Tx = {
  row: 1,
  date: '2026-01-05',
  account: 'Current',
  type: 'Income',
  amountPence: 100000,
  comments: '',
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
      anchorDate: '2026-11-09',
      primaryAccount: 'Current',
    },
    accounts: [{ name: 'Current', targetPence: 0, openingPence: 0, sortOrder: 1, active: true }],
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

function report(ds: Dataset, options: { syncConflicts?: number } = {}) {
  return buildDataHealth(ds, buildEngine(ds), { sheets: [], syncConflicts: options.syncConflicts ?? 0 });
}

function finding(ds: Dataset, id: string): HealthCheck | undefined {
  return report(ds).checks.find((check) => check.id === id);
}

test('a healthy budget passes every check', () => {
  const result = report(base());
  assert.equal(result.status, 'ok');
  assert.equal(result.issueCount, 0);
  assert.equal(result.counts.ok, result.checks.length);
});

test('unknown account names are reported without changing the rows', () => {
  const ds = base();
  ds.transactions.push({ ...TX, row: 2, date: '2026-02-01', account: 'Mystery', type: 'Expense', amountPence: 1200 });
  const check = finding(ds, 'unknown-accounts');
  assert.equal(check?.severity, 'warning');
  assert.match(check?.items[0] ?? '', /Mystery/);
});

test('exact duplicate groups are reported read-only', () => {
  const ds = base();
  ds.transactions.push({ ...TX, row: 2 });
  const check = finding(ds, 'duplicate-transactions');
  assert.equal(check?.severity, 'warning');
  assert.match(check?.summary ?? '', /1 group · 2 rows/);
});

test('a broken provider year chain is reported', () => {
  const ds = base();
  ds.providers = {
    o2: {
      year: 2026,
      statement: [{ balancePence: 10000 }],
      years: {
        '2027': { openingPence: 9000, closingPence: 11000, rows: [{ balancePence: 11000 }] },
      },
    },
  };
  const check = finding(ds, 'provider-year-chain');
  assert.equal(check?.severity, 'warning');
  assert.match(check?.items[0] ?? '', /opens at £90\.00/);
});

test('a linked bill with no provider ledger is reported', () => {
  const ds = base();
  ds.bills = [bill({ linkedSheet: 'Mystery' })];
  const check = finding(ds, 'bill-links');
  assert.equal(check?.severity, 'warning');
  assert.match(check?.items[0] ?? '', /not connected/);
});

test('a bill change with no bill is reported', () => {
  const ds = base();
  ds.billChanges = [{
    bill: 'Gone',
    appliesFrom: '2026-01-01',
    appliesTo: '2026-12-31',
    amountOverridePence: 1000,
    dueDateOverride: '',
    changeType: 'Amount',
    note: '',
  }];
  const check = finding(ds, 'bill-changes');
  assert.equal(check?.severity, 'warning');
  assert.match(check?.items[0] ?? '', /Gone/);
});

test('a locked month that no longer matches live balances is reported', () => {
  const ds = base();
  ds.monthLocks = {
    '2026-01': {
      lockedAt: '2026-02-01T10:00:00.000Z',
      incomePence: 100000,
      expensesPence: 0,
      netPence: 100000,
      owedPence: 0,
      accounts: [{ name: 'Current', balancePence: 99999 }],
      cards: [],
      people: [],
      bills: [],
    },
  };
  const check = finding(ds, 'locked-month-drift');
  assert.equal(check?.severity, 'warning');
  assert.match(check?.items[0] ?? '', /snapshot £999\.99, live £1000\.00/);
});

test('an active account with no movement is a note, not a failure', () => {
  const ds = base();
  ds.transactions = [];
  const result = report(ds);
  assert.equal(result.status, 'ok');
  assert.equal(result.counts.info, 1);
  assert.equal(finding(ds, 'dormant-accounts')?.severity, 'info');
});

test('unresolved sync conflicts are reported and the dataset is untouched', () => {
  const ds = base();
  const before = JSON.stringify(ds);
  const result = report(ds, { syncConflicts: 2 });
  assert.equal(result.status, 'warning');
  assert.equal(result.checks.find((check) => check.id === 'sync-conflicts')?.severity, 'warning');
  assert.equal(JSON.stringify(ds), before);
});
