import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { findInternalTransferRows } from '../core/internalTransfers.ts';

function loadDataset(): Dataset {
  return JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  ) as Dataset;
}

test('a row is internal only when another own bank account carries the opposite leg', () => {
  const banks = new Set(['Starling', 'Barclays', 'Monzo']);
  const rows = [
    { row: 1, date: '2026-02-16', account: 'Starling', type: 'Income', amountPence: 47500 },
    { row: 2, date: '2026-02-16', account: 'Barclays', type: 'Expense', amountPence: 47500 },
    { row: 3, date: '2026-02-17', account: 'Starling', type: 'Expense', amountPence: 5000 },
    { row: 4, date: '2026-02-17', account: 'Starling', type: 'Income', amountPence: 5000 },
    { row: 5, date: '2026-02-18', account: 'Starling', type: 'Income', amountPence: 2500 },
    { row: 6, date: '2026-02-18', account: 'Monzo', type: 'Expense', amountPence: 2599 },
  ];

  const internal = findInternalTransferRows(rows, banks, 'Starling');
  assert.deepEqual([...internal], [1], 'only the mirrored Starling row is internal');
});

test('the dataset really does contain untagged internal movements', () => {
  const dataset = loadDataset();
  const banks = new Set(dataset.accounts.map((a) => a.name));
  const internal = findInternalTransferRows(dataset.transactions, banks, 'Starling');

  assert.ok(internal.size >= 20, `expected the historical pairs, found ${internal.size}`);
});

test('locked months no longer count internal movements as income or spending', () => {
  const dataset = loadDataset();
  const engine = buildEngine(dataset);

  const feb = engine.monthlySummary(2026, 2);
  assert.equal(feb.locked, true);
  assert.equal(feb.incomePence, 188051, '£2,555.51 less £675.00 of transfers in');
  assert.equal(feb.expensesPence, 265831, 'no transfers out that month');

  const ytd = engine.yearToDate(2026, 10);
  assert.equal(ytd.incomePence, 2511750, '£2,799.19 of internal income removed');
  assert.equal(ytd.expensesPence, 2843551, '£722.15 of internal spending removed');
  assert.equal(ytd.netPence, ytd.incomePence - ytd.expensesPence);

  assert.equal(engine.monthlySummary(2026, 11).incomePence, 246574, 'open months are unaffected');
});

test('only the transfer portion is removed from the frozen snapshots', () => {
  const dataset = loadDataset();
  const engine = buildEngine(dataset);
  const months = (dataset as any).reference.months as any[];
  // The Credit Cards row was deliberately reclassified to Starling after the
  // workbook was frozen; its amount is the only non-transfer correction.
  const reclassified: Record<number, number> = { 2: 3000, 5: 7100, 6: 9500, 7: 1500 };

  for (const snap of months) {
    if (snap.balanced !== '✓ Balanced' || snap.month >= 11) continue;
    assert.equal(
      engine.monthlyIncome(2026, snap.month, true).total,
      snap.incomePence,
      `${snap.label} frozen income equals the uncorrected ledger`,
    );
    assert.equal(
      engine.monthlyExpenses(2026, snap.month, true).total - (reclassified[snap.month] ?? 0),
      snap.expensesPence,
      `${snap.label} frozen expenses equal the uncorrected ledger less reclassified rows`,
    );
  }
});
