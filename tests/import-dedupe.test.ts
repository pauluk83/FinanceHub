import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { detectDuplicates, duplicateGroups, matchesTransaction } from '../core/importDedupe.ts';

type Row = { date: string; account: string; type: 'Income' | 'Expense'; amountPence: number; comments?: string };

function loadRows(): Row[] {
  const dataset = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  ) as { transactions: Row[] };
  return dataset.transactions;
}

test('an existing transaction within one day is a duplicate', () => {
  const existing: Row = { date: '2026-11-01', account: 'Starling', type: 'Expense', amountPence: 1250 };

  assert.equal(matchesTransaction({ date: '2026-11-01', type: 'Expense', amountPence: 1250 }, existing), true);
  assert.equal(matchesTransaction({ date: '2026-11-02', type: 'Expense', amountPence: 1250 }, existing), true);
  assert.equal(matchesTransaction({ date: '2026-11-03', type: 'Expense', amountPence: 1250 }, existing), false);
  assert.equal(matchesTransaction({ date: '2026-11-01', type: 'Income', amountPence: 1250 }, existing), false);
  assert.equal(matchesTransaction({ date: '2026-11-01', type: 'Expense', amountPence: 1251 }, existing), false);
});

test('a repeated line inside one CSV is flagged even with no existing match', () => {
  const flags = detectDuplicates([], [
    { date: '2026-11-02', type: 'Expense', amountPence: 1250 },
    { date: '2026-11-02', type: 'Expense', amountPence: 1250 },
    { date: '2026-11-02', type: 'Expense', amountPence: 1300 },
  ]);

  assert.deepEqual(flags, [null, 'staged', null]);
});

test('a matching saved transaction labels every occurrence, and the first match wins', () => {
  const existing: Row = { date: '2026-11-06', account: 'Starling', type: 'Expense', amountPence: 650 };

  assert.deepEqual(detectDuplicates([existing], [
    { date: '2026-11-06', type: 'Expense', amountPence: 650 },
    { date: '2026-11-07', type: 'Expense', amountPence: 650 },
  ]), ['existing', 'existing']);
});

test('the imported workbook has 18 exact-key duplicate groups and the report is read-only', () => {
  const rows = loadRows();
  const before = rows.length;
  const groups = duplicateGroups(rows);

  assert.equal(groups.length, 18);
  for (const group of groups) {
    assert.ok(group.rows.length >= 2);
    for (const row of group.rows) {
      assert.equal(row.date, group.date);
      assert.equal(row.account, group.account);
      assert.equal(row.type, group.type);
      assert.equal(row.amountPence, group.amountPence);
    }
  }
  assert.equal(rows.length, before, 'reporting must not delete or reorder rows');
});

test('sharing only a date or only an amount is not a duplicate group', () => {
  const groups = duplicateGroups([
    { date: '2026-11-06', account: 'Starling', type: 'Expense' as const, amountPence: 650 },
    { date: '2026-11-06', account: 'Starling', type: 'Expense' as const, amountPence: 651 },
    { date: '2026-11-07', account: 'Starling', type: 'Expense' as const, amountPence: 650 },
  ]);

  assert.equal(groups.length, 0);
});
