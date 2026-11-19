import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Bill, type Dataset, type Tx } from '../core/engine.ts';
import { billLogKey, syncBillTransactions } from '../core/billTransactions.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SEED = fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8');

function bill(name: string, amountPence: number, dueDay: number, account?: string): Bill {
  return {
    name,
    amountPence,
    dueDay,
    linkedSheet: '',
    frequency: 'Monthly',
    latestBalancePence: 0,
    latestPaymentPence: 0,
    sortOrder: 1,
    active: true,
    effectiveFrom: '',
    paymentMethod: 'Direct Debit',
    baseAmountPence: amountPence,
    baseDueDay: dueDay,
    account,
  };
}

function dataset(asOf = '2026-11-20'): Dataset {
  const ds = JSON.parse(SEED) as Dataset;
  ds.settings.asOfDate = asOf;
  ds.settings.targetYear = 2026;
  ds.settings.primaryAccount = 'Starling';
  ds.transactions = [];
  ds.billChanges = [];
  ds.bills = [bill('Water', 4500, 14), bill('Broadband', 3000, 25)];
  return ds;
}

const autoRows = (ds: Dataset) => ds.transactions.filter((t) => t.autoBill === true);

test('bills post to the transaction log only once their due date has arrived', () => {
  const ds = dataset();
  assert.equal(syncBillTransactions(ds), true);
  const rows = autoRows(ds);
  assert.equal(rows.length, 1, 'Broadband is due after the as-of date');
  const row = rows[0];
  assert.equal(row.date, '2026-11-14');
  assert.equal(row.amountPence, 4500);
  assert.equal(row.account, 'Starling');
  assert.equal(row.comments, 'Water');
  assert.equal(row.type, 'Expense');
  assert.equal(row.budgetTreatment, 'Bill');
  assert.equal(row.status, 'Auto');
  assert.equal(row.starlingPosted, false);
  assert.equal(row.billKey, billLogKey('Water', 2026, 11));
});

test('re-running the log sync is idempotent and updates the same row', () => {
  const ds = dataset();
  syncBillTransactions(ds);
  const [row] = autoRows(ds);
  assert.equal(syncBillTransactions(ds), false);
  assert.equal(autoRows(ds).length, 1);

  ds.bills[0].baseAmountPence = 5200;
  ds.bills[0].amountPence = 5200;
  assert.equal(syncBillTransactions(ds), true);
  const rows = autoRows(ds);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row, row.row, 'the row keeps its identity');
  assert.equal(rows[0].amountPence, 5200);
});

test('log entries never move a balance or count as spending a second time', () => {
  const clean = dataset();
  const before = buildEngine(clean);
  const summaryBefore = before.monthlySummary(2026, 11);
  const balanceBefore = before.starlingBalance('2026-11-20');
  const breakdownBefore = summaryBefore.breakdown.expenses;

  const posted = dataset();
  syncBillTransactions(posted);
  const after = buildEngine(posted);
  const summaryAfter = after.monthlySummary(2026, 11);

  assert.equal(summaryAfter.expensesPence, summaryBefore.expensesPence);
  assert.equal(summaryAfter.netPence, summaryBefore.netPence);
  assert.equal(after.starlingBalance('2026-11-20'), balanceBefore);
  assert.deepEqual(summaryAfter.breakdown.expenses, breakdownBefore);
  for (const account of after.accountBalances('2026-11-20')) {
    const original = before.accountBalances('2026-11-20').find((a) => a.name === account.name);
    assert.equal(account.balancePence, original?.balancePence, `${account.name} balance is unchanged`);
  }
});

test('a bill records the account it is paid from', () => {
  const ds = dataset();
  const other = ds.accounts.find((a) => a.name !== ds.settings.primaryAccount)?.name;
  assert.ok(other);
  ds.bills[0].account = other;
  syncBillTransactions(ds);
  assert.equal(autoRows(ds)[0].account, other);
});

test('a manual payment already in the log suppresses the generated row', () => {
  const ds = dataset();
  const manual: Tx = {
    row: 1,
    date: '2026-11-14',
    account: 'Starling',
    type: 'Expense',
    amountPence: 4500,
    comments: 'Water direct debit',
    status: '',
    budgetTreatment: '',
  };
  ds.transactions.push(manual);
  syncBillTransactions(ds);
  assert.equal(autoRows(ds).length, 0);
  assert.equal(ds.transactions.length, 1);
});

test('only the current month onward is generated, and removed bills clean up after themselves', () => {
  const ds = dataset('2026-09-20');
  syncBillTransactions(ds);
  const september = autoRows(ds).filter((t) => t.billKey === billLogKey('Water', 2026, 9));
  assert.equal(september.length, 1, 'September has a due row');
  assert.equal(autoRows(ds).some((t) => t.date < '2026-09-01'), false, 'no history is rewritten');

  ds.bills = [];
  syncBillTransactions(ds);
  assert.equal(autoRows(ds).length, 0);
});

test('a logged bill payment and its scheduled bill never both leave the Starling balance', () => {
  const planned = buildEngine(dataset('2026-11-20')).starlingBalance('2026-11-20');

  const ds = dataset('2026-11-20');
  const payment: Tx = {
    row: 1,
    date: '2026-11-14',
    account: 'Starling',
    type: 'Expense',
    amountPence: 4500,
    comments: 'Water direct debit',
    status: '',
    budgetTreatment: '',
  };
  ds.transactions.push(payment);
  const engine = buildEngine(ds, { today: '2026-11-20' });

  assert.equal(engine.starlingBalance('2026-11-20'), planned, 'the bill leaves once, through the logged row');
  assert.equal(
    engine.statement('Starling', 2026, 11).closingPence,
    engine.starlingBalance('2026-11-20'),
    'the statement still closes on the dashboard balance',
  );
  assert.equal(
    engine.statement('Starling', 2026, 11).lines.filter((line) => line.comments === 'Scheduled bill: Water').length,
    0,
    'the scheduled bill line is gone, so the statement does not show it twice',
  );
});

test('a direct debit taken before the due date pays that bill once, not the one before it', () => {
  const ds = dataset('2026-11-20');
  ds.bills = [bill('Water', 4500, 2)];
  const planned = buildEngine(ds).starlingBalance('2026-11-20');

  // 30 October is within a week before the 2 November bill, so it settles November.
  ds.transactions.push({
    row: 1,
    date: '2026-10-30',
    account: 'Starling',
    type: 'Expense',
    amountPence: 4500,
    comments: 'Water',
    status: '',
    budgetTreatment: '',
  });
  assert.equal(buildEngine(ds).starlingBalance('2026-11-20'), planned, 'October still owes its own bill; November is paid once');
});

test('a payment that does not name a bill leaves the plan untouched', () => {
  const planned = buildEngine(dataset('2026-11-20')).starlingBalance('2026-11-20');
  const ds = dataset('2026-11-20');
  ds.transactions.push({
    row: 1,
    date: '2026-11-14',
    account: 'Starling',
    type: 'Expense',
    amountPence: 4500,
    comments: 'Tesco',
    status: '',
    budgetTreatment: '',
  });
  assert.equal(buildEngine(ds).starlingBalance('2026-11-20'), planned - 4500);
});

test('a generated bill row does not cancel the scheduled bill it mirrors', () => {
  const planned = buildEngine(dataset('2026-11-20')).starlingBalance('2026-11-20');
  const ds = dataset('2026-11-20');
  syncBillTransactions(ds);
  assert.ok(autoRows(ds).length > 0);
  assert.equal(buildEngine(ds).starlingBalance('2026-11-20'), planned);
});

test('a word that merely contains a bill name does not cancel the bill', () => {
  const ds = dataset('2026-11-20');
  ds.bills = [bill('Rent', 50000, 15)];
  const planned = buildEngine(ds).starlingBalance('2026-11-20');
  ds.transactions.push({
    row: 1,
    date: '2026-11-15',
    account: 'Starling',
    type: 'Expense',
    amountPence: 10000,
    comments: 'Mum xmas prent sue, paid cash',
    status: '',
    budgetTreatment: '',
  });
  assert.equal(buildEngine(ds).starlingBalance('2026-11-20'), planned - 10000, 'the Rent bill is still deducted');
});

test('a small charge that names a large bill cannot cancel it', () => {
  const ds = dataset('2026-11-20');
  ds.bills = [bill('Rent', 50000, 15)];
  const planned = buildEngine(ds).starlingBalance('2026-11-20');
  ds.transactions.push({
    row: 1,
    date: '2026-11-15',
    account: 'Starling',
    type: 'Expense',
    amountPence: 5000,
    comments: 'Rent top-up',
    status: '',
    budgetTreatment: '',
  });
  assert.equal(buildEngine(ds).starlingBalance('2026-11-20'), planned - 5000, 'the £500 bill still leaves the balance');
});

test('a bill name must appear as whole words in order', () => {
  const ds = dataset('2026-11-20');
  ds.bills = [bill('Council Tax', 30000, 15)];
  const planned = buildEngine(ds).starlingBalance('2026-11-20');
  ds.transactions.push({
    row: 1,
    date: '2026-11-15',
    account: 'Starling',
    type: 'Expense',
    amountPence: 30000,
    comments: 'Tax council payment',
    status: '',
    budgetTreatment: '',
  });
  assert.equal(buildEngine(ds).starlingBalance('2026-11-20'), planned - 30000, 'the names must run together, not just appear');
});

test('the scheduled bill reports when the log already pays it', () => {
  const ds = dataset('2026-11-20');
  ds.bills = [bill('Water', 4500, 14), bill('Broadband', 3000, 25)];
  assert.equal(buildEngine(ds).scheduledBills(2026, 11).find((b) => b.name === 'Water')?.paidFromLog, false);
  ds.transactions.push({
    row: 1,
    date: '2026-11-14',
    account: 'Starling',
    type: 'Expense',
    amountPence: 4500,
    comments: 'Water direct debit',
    status: '',
    budgetTreatment: '',
  });
  const scheduled = buildEngine(ds).scheduledBills(2026, 11);
  assert.equal(scheduled.find((b) => b.name === 'Water')?.paidFromLog, true, 'the bill says the log pays it');
  assert.equal(scheduled.find((b) => b.name === 'Broadband')?.paidFromLog, false, 'other bills are unaffected');
});

test('a bill paid slightly under its planned amount still settles once', () => {
  const ds = dataset('2026-11-20');
  ds.bills = [bill('PureGym', 950, 6)];
  const planned = buildEngine(ds).starlingBalance('2026-11-20');
  ds.transactions.push({
    row: 1,
    date: '2026-11-06',
    account: 'Starling',
    type: 'Expense',
    amountPence: 850,
    comments: 'PureGym',
    status: '',
    budgetTreatment: '',
  });
  const engine = buildEngine(ds);
  assert.equal(engine.starlingBalance('2026-11-20'), planned - 850 + 950, 'the £9.50 guess is released and the £8.50 payment counted once');
  assert.equal(engine.scheduledBills(2026, 11).find((b) => b.name === 'PureGym')?.paidFromLog, true);
});

test('a payment well under the plan leaves the bill in place', () => {
  const ds = dataset('2026-11-20');
  ds.bills = [bill('Rent', 50000, 15)];
  const planned = buildEngine(ds).starlingBalance('2026-11-20');
  ds.transactions.push({
    row: 1,
    date: '2026-11-15',
    account: 'Starling',
    type: 'Expense',
    amountPence: 20000,
    comments: 'Rent part payment',
    status: '',
    budgetTreatment: '',
  });
  assert.equal(buildEngine(ds).starlingBalance('2026-11-20'), planned - 20000, 'a £200 payment does not cancel a £500 bill');
});
