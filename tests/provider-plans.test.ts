/**
 * The provider sheets only carried their imported 2027/2028 blocks. These tests
 * pin the plan-year generator that repeats the newest year through 2040 for the
 * sheets that follow a pattern, and that leaves the contract sheets alone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLAN_LAST_YEAR, PLAN_PROVIDERS, PURE_CREMATION_END_YEAR, alignMonthsToTemplate, blankYearBills, dropYearsAfter, endPureCremationPlan, extendProvidersToPlanYear, fillEmptyProviderYears, fillPlanYears, recordLiveYear } from '../core/providerPlans.ts';
import { rowsForYear } from '../core/providerYears.ts';
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

test('the Pure Cremation plan ends with the December 2027 payoff', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const ds = JSON.parse(fs.readFileSync(path.join(root, 'data', 'workbook.json'), 'utf8'));
  endPureCremationPlan(ds);
  const engine = buildEngine(ds);
  const billed = (year: number) => engine.scheduledBills(year, 6).some((bill) => /pure cremation/i.test(bill.name));

  assert.equal(billed(2026), true, 'the live year still pays it');
  assert.equal(billed(2027), true, 'the payoff year still pays it to December');
  assert.equal(billed(2028), false, 'nothing bills after the plan is cleared');
  assert.equal(billed(2040), false);
  assert.equal(ds.providers.pureCremation.paymentsRemaining, 0, 'no payments remain');

  const changes = ds.billChanges.filter((change: any) => /pure cremation/i.test(change.bill));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].appliesFrom, '2028-01-01');
  assert.equal(changes[0].skip, true);

  endPureCremationPlan(ds);
  assert.equal(ds.billChanges.filter((change: any) => /pure cremation/i.test(change.bill)).length, 1, 'a second pass adds nothing');
});

test('every later year is laid out with its bill left blank', () => {
  const provider = {
    statement: [
      { month: 'Jan', billPeriod: '17 Jan - 16 Feb', billAmountPence: 10_000, paymentPence: 11_000, balancePence: 1_000 },
      { month: 'Feb', billPeriod: '17 Feb - 16 Mar', billAmountPence: 20_000, paymentPence: 11_000, balancePence: 2_000 },
      { month: 'Mar', billPeriod: '17 Mar - 16 Apr', billAmountPence: 5_000, paymentPence: 11_000, balancePence: 3_000 },
    ],
    years: {
      2027: {
        openingPence: 0,
        rows: [
          { month: 'Jan', billPeriod: 'x', billAmountPence: 0, paymentPence: 11_000, balancePence: 0 },
          { month: 'Feb', billPeriod: 'x', billAmountPence: 0, paymentPence: 11_000, balancePence: 0 },
          { month: 'Mar', billPeriod: 'x', billAmountPence: 0, paymentPence: 11_000, balancePence: 0 },
        ],
      },
      2028: {
        openingPence: 0,
        rows: [
          { month: 'Jan', billPeriod: 'x', billAmountPence: 0, paymentPence: 11_000, balancePence: 0 },
          { month: 'Feb', billPeriod: 'x', billAmountPence: 0, paymentPence: 11_000, balancePence: 0 },
          { month: 'Mar', billPeriod: 'x', billAmountPence: 0, paymentPence: 11_000, balancePence: 0 },
        ],
      },
    },
  };
  const spec = { rowsKey: 'statement', formula: 'cashflow', monthly: true } as const;

  assert.deepEqual(blankYearBills(provider, spec, 2027, 2040), [2027, 2028]);
  const rows2027 = provider.years[2027].rows;
  assert.deepEqual(rows2027.map((row) => row.billAmountPence), [0, 0, 0], 'the bill waits for the real statement');
  assert.deepEqual(rows2027.map((row) => row.paymentPence), [11_000, 11_000, 11_000]);
  assert.deepEqual(rows2027.map((row) => row.billPeriod), ['17 Jan - 16 Feb', '17 Feb - 16 Mar', '17 Mar - 16 Apr']);
  // 2026 closes at 3000, then each month adds the payment with no bill to take.
  assert.deepEqual(rows2027.map((row) => row.balancePence), [14_000, 25_000, 36_000]);
  assert.deepEqual(provider.years[2028].rows.map((row) => row.balancePence), [47_000, 58_000, 69_000], 'the next year opens where the last closed');
  assert.equal(blankYearBills(provider, spec, 2027, 2040).length, 0, 'a second pass changes nothing');

  // A bill typed into one month moves that month and every later balance.
  rows2027[0].billAmountPence = 9_000;
  blankYearBills(provider, spec, 2027, 2040);
  assert.deepEqual(rows2027.map((row) => row.billAmountPence), [0, 0, 0], 'the layout pass only ever clears bills');
});

test('a year block saved with no rows is laid out again on the next load', () => {
  const row = (month: string, period: string, bill: number, payment: number, balance: number) => ({
    month, billPeriod: period, billAmountPence: bill, paymentPence: payment, balancePence: balance,
  });
  const provider = {
    year: 2026,
    statement: [
      row('Jan', '17 Jan - 16 Feb', 10_000, 11_000, 1_000),
      row('Feb', '17 Feb - 16 Mar', 20_000, 11_000, 2_000),
      row('Mar', '17 Mar - 16 Apr', 5_000, 11_000, 3_000),
    ],
    years: {
      2027: { openingPence: 0, rows: [] },
      2028: {
        openingPence: 0,
        rows: [
          row('Jan', '17 Jan - 16 Feb', 4_000, 11_000, 0),
          row('Feb', '17 Feb - 16 Mar', 4_000, 11_000, 0),
          row('Mar', '17 Mar - 16 Apr', 4_000, 11_000, 0),
        ],
      },
    },
  } as any;
  const spec = { rowsKey: 'statement', formula: 'cashflow', monthly: true } as const;
  assert.deepEqual(fillEmptyProviderYears(provider, spec, 2026), [], 'the live year is left alone');

  const filled = fillPlanYears({ providers: { ovo: provider }, settings: { targetYear: 2026 } }, 2028);
  assert.deepEqual(filled.ovo, [2027], 'the empty block is the one that is filled');

  const rows = provider.years[2027].rows;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((entry: any) => entry.month), ['Jan', 'Feb', 'Mar']);
  assert.deepEqual(rows.map((entry: any) => entry.billAmountPence), [0, 0, 0], 'the future bill waits for a statement');
  assert.deepEqual(rows.map((entry: any) => entry.paymentPence), [11_000, 11_000, 11_000]);
  assert.deepEqual(rows.map((entry: any) => entry.balancePence), [14_000, 25_000, 36_000], 'chained from the 2026 close');
  assert.deepEqual(provider.years[2028].rows.map((entry: any) => entry.balancePence), [47_000, 58_000, 69_000]);
  assert.deepEqual(fillPlanYears({ providers: { ovo: provider }, settings: { targetYear: 2026 } }, 2028).ovo, [], 'a second load changes nothing');
});

test('credit and a refund are cleared from the future years', () => {
  const row = (month: string, bill: number, credit: number, refund: number, payment: number, balance: number) => ({
    month, billPeriod: '17 - 16', billAmountPence: bill, creditPence: credit, refundPence: refund, paymentPence: payment, balancePence: balance,
  });
  const provider = {
    statement: [row('Jan', 5_000, 0, 0, 11_000, 1_000)],
    years: {
      2027: { openingPence: 1_000, rows: [row('Jan', 0, 5_000, 2_000, 11_000, 0), row('Feb', 0, 5_000, 0, 11_000, 0)] },
      2028: { openingPence: 0, rows: [row('Jan', 0, 5_000, 0, 11_000, 0)] },
    },
  } as any;
  const spec = { rowsKey: 'statement', formula: 'cashflow', monthly: true } as const;

  assert.deepEqual(blankYearBills(provider, spec, 2027, 2028), [2027, 2028]);
  assert.deepEqual(provider.years[2027].rows.map((entry: any) => entry.creditPence), [0, 0], 'no credit before a statement');
  assert.deepEqual(provider.years[2027].rows.map((entry: any) => entry.refundPence), [0, 0], 'no refund before a statement');
  assert.deepEqual(provider.years[2028].rows.map((entry: any) => entry.creditPence), [0]);
  // 2026 closes at 1000, then each month is the payment alone.
  assert.deepEqual(provider.years[2027].rows.map((entry: any) => entry.balancePence), [12_000, 23_000]);
  assert.deepEqual(provider.years[2028].rows.map((entry: any) => entry.balancePence), [34_000]);
});

test('a plan that ended in 2027 opens blank after it', () => {
  const provider = {
    paymentsRemaining: 0,
    statement: [{ month: 'Jan', paymentPence: 10_000 }, { month: 'Dec', paymentPence: 10_676 }],
    years: {
      2027: { year: 2027, openingPence: 0, rows: [{ month: 'Jan', paymentPence: 10_666 }] },
      2028: { year: 2028, openingPence: 0, rows: [{ month: 'Jan', paymentPence: 10_666 }] },
      2033: { year: 2033, openingPence: 0, rows: [{ month: 'Jan', paymentPence: 10_666 }] },
    },
  } as any;

  assert.equal(recordLiveYear(provider, 2026), true, 'the sheet records which year its live rows are');
  assert.equal(provider.year, 2026);
  assert.equal(rowsForYear(provider, 'statement', 2028)?.rows.length, 1, 'the copied 2028 block is still there before the drop');

  assert.deepEqual(dropYearsAfter(provider, PURE_CREMATION_END_YEAR), [2028, 2033]);
  assert.deepEqual(Object.keys(provider.years), ['2027'], 'only the last working year is kept');
  assert.equal(rowsForYear(provider, 'statement', 2028), null, '2028 has no block, so the statement is blank');
  assert.equal(rowsForYear(provider, 'statement', 2026)?.rows.length, 2, 'the live year still reads its own rows');
  assert.equal(recordLiveYear(provider, 2027), false, 'a recorded year is not overwritten');
});
