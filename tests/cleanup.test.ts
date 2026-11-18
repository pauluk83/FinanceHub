import assert from 'node:assert/strict';
import test from 'node:test';
import { bulkEditTransactions, mergeDuplicateRows, mergedRows, unmergeTransaction } from '../core/cleanup.ts';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { baseDataset } from './support/dataset.ts';

function dataset(): Dataset {
  const ds = baseDataset();
  ds.accounts = [{ name: 'Starling', targetPence: 0, openingPence: 0, sortOrder: 1, active: true }];
  ds.settings.primaryAccount = 'Starling';
  ds.people = [];
  ds.cards = [];
  ds.bills = [];
  ds.billChanges = [];
  ds.incomeSchedules = { pip: [], uc: [] };
  ds.providers = {};
  ds.transactions = [
    { row: 1, date: '2026-11-01', account: 'Starling', type: 'Expense', amountPence: 1250, comments: 'Shop', status: '', budgetTreatment: '' },
    { row: 2, date: '2026-11-01', account: 'Starling', type: 'Expense', amountPence: 1250, comments: 'Shop again', status: '', budgetTreatment: '' },
    { row: 3, date: '2026-11-01', account: 'Starling', type: 'Expense', amountPence: 900, comments: 'Other', status: '', budgetTreatment: '' },
  ];
  return ds;
}

test('merging duplicates counts the payment once and is reversible', () => {
  const ds = dataset();
  const before = buildEngine(ds).monthlyExpenses(2026, 11).total;
  assert.equal(before, 3400);

  const result = mergeDuplicateRows(ds, [2, 1]);
  assert.equal(result.ok, true);
  assert.equal(result.keptRow, 1);
  assert.deepEqual(result.mergedRows, [2]);
  assert.equal(buildEngine(ds).monthlyExpenses(2026, 11).total, 2150);
  assert.equal(ds.transactions.find((tx) => tx.row === 2)?.amountPence, 0);
  assert.equal(ds.transactions.find((tx) => tx.row === 2)?.mergedIntoRow, 1);
  assert.equal(mergedRows(ds).length, 1);

  const undo = unmergeTransaction(ds, 2);
  assert.equal(undo.ok, true);
  assert.equal(buildEngine(ds).monthlyExpenses(2026, 11).total, 3400);
  assert.equal(ds.transactions.find((tx) => tx.row === 2)?.mergedIntoRow, undefined);
});

test('merging refuses different amounts, missing rows and generated bill rows', () => {
  const ds = dataset();
  assert.equal(mergeDuplicateRows(ds, [1, 3]).ok, false);
  assert.equal(mergeDuplicateRows(ds, [1, 99]).ok, false);
  ds.transactions[1].autoBill = true;
  assert.equal(mergeDuplicateRows(ds, [1, 2]).ok, false);
});

test('bulk edit updates labels and skips locked or missing rows', () => {
  const ds = dataset();
  const result = bulkEditTransactions(ds, [1, 2, 99], { category: 'Food', tags: ['weekly', 'weekly'] }, (date) => date === '2026-11-01' && false);
  assert.equal(result.updated, 2);
  assert.equal(result.skipped, 1);
  assert.equal(ds.transactions[0].category, 'Food');
  assert.deepEqual(ds.transactions[0].tags, ['weekly']);

  const locked = bulkEditTransactions(ds, [3], { category: 'Travel' }, () => true);
  assert.equal(locked.updated, 0);
  assert.equal(locked.skipped, 1);
  assert.equal(ds.transactions[2].category, undefined);
});
