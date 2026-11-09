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
