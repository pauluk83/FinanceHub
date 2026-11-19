import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { buildAccountantPack } from '../core/accountantPack.ts';

const seed = JSON.parse(readFileSync(new URL('../data/workbook.json', import.meta.url), 'utf8')) as Dataset;
const engine = buildEngine(seed, { today: '2026-11-19' });
const year = seed.settings.targetYear;

test('the pack has reconciliation, monthly, transaction and lock sheets', () => {
  const sheets = buildAccountantPack(seed, engine, year);
  assert.deepEqual(sheets.map((sheet) => sheet.name), [
    'Reconciliation',
    'Monthly summary',
    'Transactions',
    'Month locks',
  ]);
  assert.ok(sheets.every((sheet) => sheet.rows.length >= 1));
  assert.ok(sheets[0].rows.length > 5);
  // The imported workbook has no manual month locks, so that sheet is header-only.
  assert.equal(sheets[3].rows.length, 1);
});

test('the monthly sheet matches the engine exactly and marks locks', () => {
  const sheets = buildAccountantPack(seed, engine, year);
  const monthly = sheets[1].rows.slice(1);
  assert.equal(monthly.length, 12);
  monthly.forEach((row, index) => {
    const summary = engine.monthlySummary(year, index + 1);
    assert.equal(row[1], Math.round(summary.incomePence) / 100);
    assert.equal(row[2], Math.round(summary.expensesPence) / 100);
    assert.equal(row[3], Math.round(summary.netPence) / 100);
    assert.equal(row[4], summary.locked ? 'Locked' : 'Open');
  });
});

test('the transaction sheet lists only the requested year', () => {
  const sheets = buildAccountantPack(seed, engine, year);
  const rows = sheets[2].rows.slice(1);
  const expected = seed.transactions.filter((transaction) => transaction.date.startsWith(`${year}-`));
  assert.equal(rows.length, expected.length);
  assert.ok(rows.every((row) => String(row[0]).startsWith(`${year}-`)));
});

test('the lock sheet lists only locked months with their notes', () => {
  const sheets = buildAccountantPack(seed, engine, year);
  const rows = sheets[3].rows.slice(1);
  assert.equal(rows.length, Object.keys(seed.monthLocks ?? {}).filter((key) => key.startsWith(`${year}-`)).length);
  assert.ok(rows.every((row) => String(row[1]).length > 0));
});

test('the reconciliation sheet states the pack is not an audit', () => {
  const text = buildAccountantPack(seed, engine, year)[0].rows.flat().join(' ');
  assert.match(text, /not an audit/);
  assert.match(text, /whole pence/);
});
