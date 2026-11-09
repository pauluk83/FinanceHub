/**
 * Year rollover and later-year views.
 *
 * The provider sheets keep 2027/2028 as imported blocks. These tests pin the
 * resolver that reads them, the bill amounts derived from them, and the
 * rollover that moves the configured year without touching history.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine } from '../core/engine.ts';
import { availableYears, planYearRollover, rolloverYear } from '../core/yearRollover.ts';
import { rowsForYear } from '../core/providerYears.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));

test('available years include the imported later-year blocks', () => {
  assert.deepEqual(availableYears(load()), [2026, 2027, 2028]);
});

test('later-year bills read their own provider block', () => {
  const engine = buildEngine(load());
  const amount = (year: number, month: number, name: string) =>
    engine.scheduledBills(year, month).find((bill) => bill.name === name)?.amountPence;
  assert.equal(amount(2027, 4, 'Virgin Media'), 3699);
  assert.equal(amount(2027, 3, 'Water'), 4400);
  assert.equal(amount(2027, 4, 'Water'), 0, 'April stays a zero-payment month');
  assert.equal(amount(2027, 7, 'Ovo'), 10900);
  assert.equal(amount(2028, 4, 'Virgin Media'), 4099);
  assert.equal(amount(2026, 10, 'Virgin Media'), 3299, 'the live sheet is still used for 2026');
  assert.equal(amount(2026, 4, 'Water'), 0);
});

test('the provider resolver keeps live rows writable and marks imported blocks', () => {
  const ds = load();
  const live = rowsForYear(ds.providers.o2, 'statement', 2026);
  assert.equal(live?.archived, false);
  assert.equal(live?.rows, ds.providers.o2.statement, 'live rows are the array the editor writes');
  const archived = rowsForYear(ds.providers.o2, 'statement', 2027);
  assert.equal(archived?.archived, true);
  assert.ok((archived?.rows.length ?? 0) > 0);
  assert.equal(rowsForYear(ds.providers.o2, 'statement', 2029), null);
});

test('rollover refuses to stay on the same year or move backwards', () => {
  const ds = load();
  assert.equal(planYearRollover(ds, 2026).ok, false);
  assert.equal(planYearRollover(ds, 2025).ok, false);
  assert.equal(planYearRollover(ds, 1999).ok, false);
});

test('rollover moves the anchors and leaves history untouched', () => {
  const ds = load();
  const locks = JSON.stringify(ds.monthLocks);
  const providers = JSON.stringify(ds.providers);
  const transactions = ds.transactions.length;
  const anchor = ds.settings.anchorDate;

  const result = rolloverYear(ds, 2027, '2026-12-31');
  assert.equal(result.ok, true);
  assert.equal(ds.settings.targetYear, 2027);
  assert.equal(ds.settings.asOfDate, '2027-01-01');
  assert.equal(ds.settings.lockCutoff, '2026-12-01');
  assert.equal(ds.settings.anchorDate, anchor);
  assert.equal(JSON.stringify(ds.monthLocks), locks);
  assert.equal(JSON.stringify(ds.providers), providers);
  assert.equal(ds.transactions.length, transactions);
  assert.match(ds.changelog[0].description, /2026 to 2027/);
  assert.equal(ds.changelog[0].date, '2026-12-31');

  const engine = buildEngine(ds);
  assert.equal(engine.scheduledBills(2027, 4).find((bill) => bill.name === 'Virgin Media')?.amountPence, 3699);
});
