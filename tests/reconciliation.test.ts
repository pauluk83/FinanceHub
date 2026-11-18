import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatementChecks, commitImportBatch, importBatchSummary, reconciliationGate, reconciliationRows } from '../core/reconciliation.ts';
import { undoImportBatch, batchLockedMonths } from '../core/reconciliation.ts';
import { buildEngine, type Dataset, type Engine, type Tx } from '../core/engine.ts';

const engine = {
  accountBalances: () => [
    { name: 'Current', balancePence: 100_000, active: true },
    { name: 'Savings pot', balancePence: 25_000, active: false },
  ],
  cardBalances: () => [{ name: 'Visa', balancePence: 20_000, active: true }],
} as unknown as Engine;

const dataset = (): Dataset => ({
  settings: {
    targetYear: 2026, startMonth: 1, monthsInYear: 12, currency: '£',
    asOfDate: '2026-11-30', lockCutoff: '2026-11-01', anchorDate: '2026-11-01',
  },
  accounts: [], people: [], cards: [], bills: [], billChanges: [],
  incomeSchedules: { pip: [], uc: [] }, transactions: [], providers: {}, monthLocks: {},
});

const tx = (row: number, date: string, batch?: string): Tx => ({
  row, date, account: 'Current', type: 'Expense', amountPence: 1_000,
  comments: `Row ${row}`, status: '', budgetTreatment: '',
  ...(batch ? { importBatchId: batch } : {}),
});

test('a month close checks every active bank account and card', () => {
  const rows = reconciliationRows(dataset(), engine, '2026-11-30');
  assert.deepEqual(rows.map((row) => `${row.kind}:${row.name}`), ['account:Current', 'card:Visa']);
  assert.equal(rows[0].calculatedPence, 100_000);
  assert.equal(rows[1].calculatedPence, 20_000);
});

test('a matched statement closes silently and a blank one is not checked', () => {
  const rows = reconciliationRows(dataset(), engine, '2026-11-30');
  const checks = buildStatementChecks(rows, { 'account:Current': 100_000, 'card:Visa': null });
  assert.equal(checks.length, 1);
  const gate = reconciliationGate(checks, '');
  assert.equal(gate.blocked, false);
  assert.equal(gate.checked, 1);
  assert.equal(gate.overrideUsed, false);
});

test('a difference blocks the lock until a written note explains it', () => {
  const rows = reconciliationRows(dataset(), engine, '2026-11-30');
  const checks = buildStatementChecks(rows, { 'account:Current': 99_500 });

  const blocked = reconciliationGate(checks, '   ');
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.differences[0].differencePence, -500);
  assert.match(blocked.message, /does not match|do not match/);

  const explained = reconciliationGate(checks, 'Unpresented cheque 1042');
  assert.equal(explained.blocked, false);
  assert.equal(explained.overrideUsed, true);
  assert.match(explained.message, /explained difference/);
});

test('statement checks use the same cutoff as the month-end snapshot', () => {
  const ds = dataset();
  ds.settings.asOfDate = '2026-11-07';
  ds.accounts = [{ name: 'Current', targetPence: 0, openingPence: 100_000, sortOrder: 1, active: true }];
  ds.transactions = [{
    row: 1, date: '2026-11-20', account: 'Current', type: 'Expense', amountPence: 5_000,
    comments: 'After the As-of date', status: '', budgetTreatment: '',
  }];
  const engine = buildEngine(ds);

  const cutoff = engine.throughFor(2026, 11);
  assert.equal(cutoff, '2026-11-07', 'the cutoff is the As-of date, not month end');

  const snapshot = engine.dashboard(2026, 11).accounts[0].balancePence;
  assert.equal(reconciliationRows(ds, engine, cutoff)[0].calculatedPence, snapshot);
  assert.notEqual(
    reconciliationRows(ds, engine, '2026-11-30')[0].calculatedPence,
    snapshot,
    'month end would include a row the lock does not',
  );
});

test('a bank-feed import becomes one batch and records where the rows really went', () => {
  const ds = dataset();
  const batch = commitImportBatch(ds, [
    { date: '2026-11-02', account: 'Starling', type: 'Expense', amountPence: 1_200, comments: 'TESCO', category: 'Food', tags: ['Weekly'] },
    { date: '2026-11-03', account: 'Current', type: 'Income', amountPence: 5_000, comments: 'REFUND' },
  ], { source: 'Open Banking — Example Bank', importedAt: '2026-11-18T09:00:00.000Z' });

  assert.ok(batch);
  assert.equal(batch.rows, 2);
  assert.equal(batch.account, 'Multiple accounts');
  assert.ok(ds.transactions.every((row) => row.importBatchId === batch.id));
  assert.equal(ds.transactions[0].category, 'Food');
  assert.deepEqual(ds.transactions[0].tags, ['Weekly']);

  const undone = undoImportBatch(ds, batch.id);
  assert.equal(undone.ok, true);
  assert.equal(ds.transactions.length, 0);
  assert.equal(ds.importBatches?.length, 0);
});

test('a single-account feed batch names that account', () => {
  const ds = dataset();
  const batch = commitImportBatch(ds, [
    { date: '2026-11-02', account: 'Starling', type: 'Expense', amountPence: 1_200, comments: 'TESCO' },
  ], { source: 'Starling — Personal' });
  assert.equal(batch?.account, 'Starling');
  assert.equal(batch?.source, 'Starling — Personal');
});

test('an import batch records its dates, account and net', () => {
  const rows = [tx(1, '2026-11-03', 'import_a'), tx(2, '2026-11-20', 'import_a')];
  rows[1].type = 'Income';
  rows[1].amountPence = 5_000;
  const batch = importBatchSummary('import_a', 'starling.csv', 'Current', '2026-11-20T10:00:00.000Z', rows);
  assert.equal(batch.rows, 2);
  assert.equal(batch.from, '2026-11-03');
  assert.equal(batch.to, '2026-11-20');
  assert.equal(batch.totalPence, 4_000);
});

test('undo removes only its own batch and leaves hand-entered rows alone', () => {
  const ds = dataset();
  ds.transactions = [tx(1, '2026-11-03', 'import_a'), tx(2, '2026-11-04', 'import_b'), tx(3, '2026-11-05')];
  ds.importBatches = [
    importBatchSummary('import_a', 'a.csv', 'Current', '2026-11-03T10:00:00.000Z', [ds.transactions[0]]),
    importBatchSummary('import_b', 'b.csv', 'Current', '2026-11-04T10:00:00.000Z', [ds.transactions[1]]),
  ];

  const result = undoImportBatch(ds, 'import_a');
  assert.equal(result.ok, true);
  assert.equal(result.removed, 1);
  assert.deepEqual(ds.transactions.map((row) => row.row), [2, 3]);
  assert.deepEqual(ds.importBatches?.map((batch) => batch.id), ['import_b']);
});

test('an import that reaches a locked month cannot be undone', () => {
  const ds = dataset();
  ds.transactions = [tx(1, '2026-10-03', 'import_a')];
  ds.monthLocks = {
    '2026-10': {
      lockedAt: '2026-11-01T00:00:00.000Z',
      incomePence: 0, expensesPence: 0, netPence: 0, owedPence: 0,
      accounts: [], cards: [], people: [],
    },
  };

  assert.deepEqual(batchLockedMonths(ds, 'import_a'), ['2026-10']);
  const result = undoImportBatch(ds, 'import_a');
  assert.equal(result.ok, false);
  assert.match(result.message, /Unlock 2026-10/);
  assert.equal(ds.transactions.length, 1, 'a refused undo leaves the ledger untouched');
});
