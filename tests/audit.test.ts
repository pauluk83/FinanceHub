import test from 'node:test';
import assert from 'node:assert/strict';
import type { Dataset, Tx } from '../core/engine.ts';
import {
  appendAudit,
  auditEntries,
  auditFieldChanges,
  deletedTransactions,
  diffRecords,
  recordHistory,
  revertAuditEntry,
} from '../core/audit.ts';

const TX: Tx = {
  row: 1,
  date: '2026-11-09',
  account: 'Current',
  type: 'Expense',
  amountPence: 1250,
  comments: 'Coffee',
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
    transactions: [structuredClone(TX)],
    incomeSchedules: { pip: [], uc: [] },
    providers: {},
    monthLocks: {},
    audit: [],
  };
}

const at = '2026-11-09T12:00:00.000Z';

test('a new transaction is recorded with its full record and can be reverted', () => {
  const before = base();
  const after = structuredClone(before);
  after.transactions.push({ ...structuredClone(TX), row: 2, amountPence: 2500, comments: 'Lunch' });

  const entries = diffRecords(before, after, at);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].section, 'transactions');
  assert.equal(entries[0].action, 'create');
  assert.equal(entries[0].before, null);
  assert.equal(entries[0].after?.amountPence, 2500);

  const dataset = structuredClone(after);
  appendAudit(dataset, entries);
  assert.equal(recordHistory(dataset, 'transactions', '2').length, 1);
  const result = revertAuditEntry(dataset, entries[0].id, at);
  assert.equal(result.ok, true);
  assert.equal(dataset.transactions.length, 1);
  assert.ok(auditEntries(dataset)[0].revertedAt);
});

test('an edit records only the changed fields and reverts the previous value', () => {
  const before = base();
  const after = structuredClone(before);
  after.transactions[0].amountPence = 2000;
  after.transactions[0].comments = 'Coffee and cake';

  const entries = diffRecords(before, after, at);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, 'update');
  assert.deepEqual(auditFieldChanges(entries[0]).map((change) => change.field).sort(), ['amountPence', 'comments']);

  const dataset = structuredClone(after);
  appendAudit(dataset, entries);
  assert.equal(revertAuditEntry(dataset, entries[0].id, at).ok, true);
  assert.equal(dataset.transactions[0].amountPence, 1250);
  assert.equal(dataset.transactions[0].comments, 'Coffee');
});

test('a deleted transaction enters the trash and can be restored', () => {
  const before = base();
  const after = structuredClone(before);
  after.transactions = [];

  const entries = diffRecords(before, after, at);
  assert.equal(entries[0].action, 'delete');
  assert.equal(entries[0].after, null);

  const dataset = structuredClone(after);
  appendAudit(dataset, entries);
  assert.equal(deletedTransactions(dataset).length, 1);
  const result = revertAuditEntry(dataset, entries[0].id, at);
  assert.equal(result.ok, true);
  assert.equal(dataset.transactions.length, 1);
  assert.equal(dataset.transactions[0].row, 1);
  assert.equal(deletedTransactions(dataset).length, 0);
  assert.ok(auditEntries(dataset)[0].restoredAt);
});

test('generated bill rows do not flood the audit history', () => {
  const before = base();
  const after = structuredClone(before);
  after.transactions.push({ ...structuredClone(TX), row: 2, autoBill: true, billKey: 'Rent:2026-11' });
  assert.equal(diffRecords(before, after, at).length, 0);
});

test('account edits use the same per-record audit path', () => {
  const before = base();
  const after = structuredClone(before);
  after.accounts[0].targetPence = 50000;
  const entries = diffRecords(before, after, at);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].section, 'accounts');
  assert.equal(entries[0].action, 'update');
  assert.equal(entries[0].label, 'Current');
});

test('a restore never overwrites a transaction that already uses the old row', () => {
  const before = base();
  const after = structuredClone(before);
  after.transactions = [];
  const entries = diffRecords(before, after, at);
  const dataset = structuredClone(after);
  dataset.transactions.push({ ...structuredClone(TX), row: 1, comments: 'New occupant' });
  appendAudit(dataset, entries);
  assert.equal(revertAuditEntry(dataset, entries[0].id, at).ok, true);
  assert.equal(dataset.transactions.length, 2);
  assert.equal(dataset.transactions.find((transaction) => transaction.comments === 'Coffee')?.row, 2);
});

test('both legs of a deleted transfer are restored atomically', () => {
  const before = base();
  before.transactions.push(
    { ...structuredClone(TX), row: 2, account: 'Current', type: 'Expense', amountPence: 5000, comments: 'Move', budgetTreatment: 'Transfer' },
    { ...structuredClone(TX), row: 3, account: 'Savings', type: 'Income', amountPence: 5000, comments: 'Move', budgetTreatment: 'Transfer' },
  );
  const after = structuredClone(before);
  after.transactions = after.transactions.filter((transaction) => transaction.budgetTreatment !== 'Transfer');

  const entries = diffRecords(before, after, at);
  assert.equal(entries.length, 2);
  assert.ok(entries[0].groupId);
  assert.equal(entries[0].groupId, entries[1].groupId);

  const dataset = structuredClone(after);
  appendAudit(dataset, entries);
  assert.equal(deletedTransactions(dataset).length, 2);
  assert.equal(revertAuditEntry(dataset, entries[0].id, at).ok, true);
  assert.equal(dataset.transactions.filter((transaction) => transaction.budgetTreatment === 'Transfer').length, 2);
  assert.equal(deletedTransactions(dataset).length, 0);
});
