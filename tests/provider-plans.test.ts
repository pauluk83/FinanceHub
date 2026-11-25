/**
 * The provider sheets only carried their imported 2027/2028 blocks. These tests
 * pin the plan-year generator that repeats the newest year through 2040 for the
 * sheets that follow a pattern, and that leaves the contract sheets alone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLAN_LAST_YEAR, PLAN_PROVIDERS, alignMonthsToTemplate, extendProvidersToPlanYear } from '../core/providerPlans.ts';
import { buildEngine } from '../core/engine.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));
const lastBalance = (rows: any[]) => [...rows].reverse().find((row) => typeof row?.balancePence === 'number')?.balancePence;

test('every plan provider runs to 2040 and the contract sheets are untouched', () => {
  const ds = load();
  const excluded = ['o2', 'virgin', 'pureCremation'].map((key) => [key, Object.keys(ds.providers[key].years ?? {})]);
  extendProvidersToPlanYear(ds);

  for (const key of Object.keys(PLAN_PROVIDERS)) {
    const years = Object.keys(ds.providers[key].years).map(Number).sort((a, b) => a - b);
    assert.equal(years.at(-1), PLAN_LAST_YEAR, `${key} reaches ${PLAN_LAST_YEAR}`);
    assert.deepEqual(
      years,
      Array.from({ length: years.at(-1)! - years[0] + 1 }, (_, index) => years[0] + index),
      `${key} has no gap between its first block and ${PLAN_LAST_YEAR}`,
    );
    for (const year of years) {
      assert.ok(Array.isArray(ds.providers[key].years[String(year)].rows), `${key} ${year} has rows`);
      assert.ok(ds.providers[key].years[String(year)].rows.length > 0, `${key} ${year} is not empty`);
    }
  }

  for (const [key, before] of excluded) {
    assert.deepEqual(Object.keys(ds.providers[key].years ?? {}), before, `${key} keeps only its own blocks`);
  }
});

test('each year opens where the year before it closed', () => {
  const ds = load();
  extendProvidersToPlanYear(ds);

  for (const key of Object.keys(PLAN_PROVIDERS)) {
    const blocks = ds.providers[key].years;
    const years = Object.keys(blocks).map(Number).filter((year) => Number.isInteger(year)).sort((a, b) => a - b);
    for (let index = 0; index < years.length; index += 1) {
      const block = blocks[String(years[index])];
      assert.equal(block.closingPence, lastBalance(block.rows), `${key} ${years[index]} closes at its last row`);
      if (index > 0) {
        assert.equal(block.openingPence, blocks[String(years[index - 1])].closingPence, `${key} ${years[index]} opening`);
      }
    }
  }
});

test('rent keeps its weekly Monday charges and the 27th payment', () => {
  const ds = load();
  extendProvidersToPlanYear(ds);
  const rows = ds.providers.rent.years['2035'].rows;
  const charges = rows.filter((row) => /rent charge/i.test(String(row.description)));
  const payments = rows.filter((row) => /payment/i.test(String(row.description)));

  assert.equal(payments.length, 12, 'one payment a month');
  assert.ok(payments.every((row) => row.date.slice(8) === '27'), 'payments stay on the 27th');
  assert.ok(payments.every((row) => row.amountPence === 50000), 'the payment amount repeats');
  for (let index = 1; index < charges.length; index += 1) {
    const gap = (Date.parse(`${charges[index].date}T00:00:00Z`) - Date.parse(`${charges[index - 1].date}T00:00:00Z`)) / 86_400_000;
    assert.equal(gap, 7, 'rent is still charged weekly');
  }
  assert.ok(charges.every((row) => new Date(`${row.date}T00:00:00Z`).getUTCDay() === 1), 'charges stay on Mondays');
  // The template skips one week in March (a zero charge), so the repeat keeps that too.
  assert.equal(charges.filter((row) => row.amountPence === -11618).length, 51, 'the weekly charge repeats');
  assert.equal(charges.filter((row) => row.amountPence === 0).length, 1, 'the skipped week repeats');
});

test('water and council tax keep their own shape in the new years', () => {
  const ds = load();
  extendProvidersToPlanYear(ds);

  const water = ds.providers.water.years['2040'];
  assert.equal(water.rows.length, 12, 'twelve monthly rows');
  assert.ok(water.rows.every((row: any) => row.paymentPence === 4400), 'the monthly payment repeats');

  const councilTax = ds.providers.councilTax.years['2040'];
  assert.equal(councilTax.rows.length, 13, 'twelve payments and the opening charge');
  assert.ok(councilTax.rows.every((row: any) => row.date.startsWith('2040-')), 'every row is dated in 2040');
});

test('a planned year reads like a normal provider year', () => {
  const ds = load();
  extendProvidersToPlanYear(ds);
  const engine = buildEngine(ds);
  const amount = (year: number, month: number, name: string) =>
    engine.scheduledBills(year, month).find((bill) => bill.name === name)?.amountPence;
  assert.equal(amount(2035, 3, 'Water'), amount(2027, 3, 'Water'), 'the next year figure carries forward');
});

test('running the plan twice adds nothing', () => {
  const ds = load();
  extendProvidersToPlanYear(ds);
  const once = JSON.stringify(ds.providers);
  const created = extendProvidersToPlanYear(ds);
  assert.deepEqual(Object.values(created).flat(), [], 'no year is generated twice');
  assert.equal(JSON.stringify(ds.providers), once);
});

test('a later block is re-aligned to the sheet it repeats, labels only', () => {
  const template = [
    { month: 'Jan', billPeriod: '17 Jan - 16 Feb', balancePence: 500 },
    { month: 'Feb', billPeriod: '17 Feb - 16 Mar', balancePence: 900 },
  ];
  const block = [
    { month: 'Feb', billPeriod: '17 Feb - 16 Mar', billAmountPence: 4_000, balancePence: 500 },
    { month: 'Feb', billPeriod: '17 Feb - 16 Mar', billAmountPence: 0, balancePence: 900 },
  ];

  assert.equal(alignMonthsToTemplate(block, template), true);
  assert.deepEqual(block.map((row) => row.month), ['Jan', 'Feb']);
  assert.deepEqual(block.map((row) => row.billPeriod), ['17 Jan - 16 Feb', '17 Feb - 16 Mar']);
  assert.deepEqual(block.map((row) => row.balancePence), [500, 900], 'money is untouched');
  assert.deepEqual(block.map((row) => row.billAmountPence), [4_000, 0]);
  assert.equal(alignMonthsToTemplate(block, template), false, 'a second pass changes nothing');
  assert.equal(alignMonthsToTemplate([{ month: 'Jan' }], template), false, 'a short block is left alone');
});
