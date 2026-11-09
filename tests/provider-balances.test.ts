/**
 * Phase 2: per-provider running-balance queries.
 *
 * The workbook computes each sheet's balance with its own formula. These tests
 * prove the core rules reproduce every stored running balance and that the
 * as-of query stops where the budget says it should.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  balanceAsOf,
  balancePenceAsOf,
  baselineFor,
  recalculate,
  sortRows,
  statementRowDate,
  type LedgerSpec,
} from '../core/providerLedger.ts';
import { balanceAsOf as appBalanceAsOf } from '../app/src/providerLedger.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const ds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));

const SPECS: Record<string, LedgerSpec> = {
  water: { rowsKey: 'statement', formula: 'cashflow', monthly: true },
  ovo: { rowsKey: 'statement', formula: 'cashflow', monthly: true },
  parkXmas: { rowsKey: 'statement', formula: 'savings', monthly: true },
  pureCremation: { rowsKey: 'statement', formula: 'savings', monthly: true },
  o2: { rowsKey: 'statement', formula: 'telco', monthly: true },
  virgin: { rowsKey: 'statement', formula: 'telco', monthly: true },
  councilTax: { rowsKey: 'entries', formula: 'amount', monthly: false },
  rent: { rowsKey: 'entries', formula: 'amount', monthly: false },
};

test('every provider sheet recalculates to the workbook running balances', () => {
  for (const [key, spec] of Object.entries(SPECS)) {
    const rows = structuredClone(ds.providers[key][spec.rowsKey]);
    assert.ok(rows.length > 0, `${key} has rows`);
    sortRows(rows, spec);
    const expected = rows.map((row: any) => row.balancePence);
    recalculate(spec, rows, baselineFor(spec, rows));
    assert.deepEqual(
      rows.map((row: any) => row.balancePence),
      expected,
      `${key} balances drifted when recalculated from the stored baseline`,
    );
  }
});

test('the as-of balance query stops at the last row the date has reached', () => {
  const rows = [
    { month: 'Opening Balance', opening: true, balancePence: 100_000 },
    { month: 'Jan', billAmountPence: 5_000, paymentPence: 4_400, balancePence: 99_400 },
    { month: 'Feb', billAmountPence: 0, paymentPence: 4_400, balancePence: 103_800 },
    { month: 'Mar', billAmountPence: 7_000, paymentPence: 4_400, balancePence: 101_200 },
  ];
  assert.equal(balanceAsOf(rows, 2026, '2026-01-15')?.month, 'Jan');
  assert.equal(balancePenceAsOf(rows, 2026, '2026-02-01'), 103_800);
  assert.equal(balanceAsOf(rows, 2026, '2025-12-31'), null, 'nothing has been reached yet');
  assert.equal(balanceAsOf(rows, 2026, 'not-a-date')?.month, 'Mar', 'invalid dates fall back to the stored row order');
  assert.equal(appBalanceAsOf(rows, 2026, '2026-03-02')?.month, 'Mar', 'the app re-export stays in step with core');
});

test('each provider exposes a balance as of the budget date', () => {
  const asOf = ds.settings.asOfDate;
  assert.equal(balanceAsOf(ds.providers.water.statement, 2026, asOf)?.month, 'Nov');
  assert.equal(balanceAsOf(ds.providers.ovo.statement, 2026, asOf)?.month, 'Nov');
  assert.equal(balanceAsOf(ds.providers.o2.statement, 2026, asOf)?.month, 'Nov');
  assert.equal(balanceAsOf(ds.providers.virgin.statement, 2026, asOf)?.month, 'Nov');
  assert.equal(balanceAsOf(ds.providers.parkXmas.statement, 2026, asOf)?.month, 'Nov');
  assert.equal(balanceAsOf(ds.providers.pureCremation.statement, 2026, asOf)?.month, 'Nov');

  const councilTax = balanceAsOf(ds.providers.councilTax.entries, 2026, asOf);
  assert.ok(councilTax && typeof councilTax.balancePence === 'number', 'council tax has a reached balance');
  assert.ok(String(councilTax.date).slice(0, 10) <= asOf, 'council tax rows are dated, so the query follows the date column');

  const rent = balanceAsOf(ds.providers.rent.entries, 2026, asOf);
  assert.ok(rent && typeof rent.balancePence === 'number', 'rent ledger has a reached balance');
});

test('monthly rows are dated the first of their month, or the opening day', () => {
  assert.equal(statementRowDate({ month: 'Jan' }, 2026), '2026-01-01');
  assert.equal(statementRowDate({ month: 'Dec' }, 2027), '2027-12-01');
  assert.equal(statementRowDate({ month: 'Opening Balance', opening: true }, 2026), '2026-01-01');
  assert.equal(statementRowDate({ month: '2027 Jan', opening: true }, 2026), '2027-01-01');
  assert.equal(statementRowDate({ month: 'Nonsense' }, 2026), null);
  assert.equal(statementRowDate({ date: '2026-04-27', month: 'Apr' }, 2026), '2026-04-27', 'an ISO date wins');
});
