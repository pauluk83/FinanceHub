/**
 * Workbook-retirement gate.
 *
 * These assertions cover the data that only existed inside
 * "Income and Expenses 2026.xlsx": the 2027/2028 provider blocks and the four
 * product sheets. If the source workbook is ever deleted, this file is the
 * proof that the figures it held still live in data/workbook.json.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));
const years = (key: string) => ds.providers[key].years as Record<string, any>;
const money = (p: number) => `${p < 0 ? '-' : ''}£${(Math.abs(p) / 100).toFixed(2)}`;

test('2027/2028 provider balances match the workbook year blocks', () => {
  const expected: Record<string, Record<string, number>> = {
    water: { '2027': 76830, '2028': 129630 },
    ovo: { '2027': 194456, '2028': 325256 },
    parkXmas: { '2027': 0, '2028': 0 },
    pureCremation: { '2027': 0 },
    o2: { '2027': -2000, '2028': -19250 },
    virgin: { '2027': -49786, '2028': -85477 },
    councilTax: { '2027': 0, '2028': 0 },
  };
  for (const [key, blocks] of Object.entries(expected)) {
    for (const [year, closing] of Object.entries(blocks)) {
      const block = years(key)[year];
      assert.ok(block, `${key} ${year} block missing`);
      assert.equal(block.closingPence, closing, `${key} ${year} closes at ${money(block.closingPence)}, expected ${money(closing)}`);
    }
  }
});

test('opening balances chain from the previous year', () => {
  assert.equal(years('water')['2028'].openingPence, years('water')['2027'].closingPence);
  assert.equal(years('ovo')['2028'].openingPence, years('ovo')['2027'].closingPence);
  assert.equal(years('o2')['2028'].openingPence, years('o2')['2027'].closingPence);
  assert.equal(years('virgin')['2028'].openingPence, years('virgin')['2027'].closingPence);
});

test('park xmas and pure cremation payments are retained', () => {
  assert.equal(years('parkXmas')['2027'].totalPaidPence, 40000);
  assert.equal(years('parkXmas')['2027'].rows[0].paymentPence, 5000);
  assert.equal(years('pureCremation')['2027'].totalPaidPence, 179500);
  assert.equal(years('pureCremation')['2027'].rows[0].paymentPence, 10666);
});

test('water carries the 2027 and 2028 payment plan', () => {
  for (const year of ['2027', '2028']) {
    assert.equal(years('water')[year].totalPaymentPence, 52800);
    assert.equal(years('water')[year].rows.length, 12);
    assert.ok(years('water')[year].rows.every((row: any) => row.paymentPence === 4400));
  }
});

test('council tax keeps all 13 dated 2027 and 2028 entries', () => {
  for (const year of ['2027', '2028']) {
    const block = years('councilTax')[year];
    assert.equal(block.rows.length, 13);
    assert.equal(block.rows[0].date, `${year}-01-27`);
    assert.equal(block.rows[block.rows.length - 1].date, `${year}-12-27`);
    assert.ok(block.rows.every((row: any) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)), 'every row keeps an ISO date');
    assert.ok(block.rows.every((row: any) => Number.isInteger(row.amountPence)), 'amounts are integer pence');
  }
});

test('O2 and Virgin keep their 2027/2028 price tiers', () => {
  const o2 = years('o2')['2027'].rows;
  assert.equal(o2[0].amountPence, 1000);
  assert.equal(o2[3].amountPence, 1250);
  assert.equal(years('o2')['2028'].rows[3].amountPence, 1500);
  const virgin = years('virgin')['2027'].rows;
  assert.equal(virgin[0].amountPence, 3299);
  assert.equal(virgin[3].amountPence, 3699);
  assert.equal(years('virgin')['2028'].rows[3].amountPence, 4099);
});

test('the 2026 provider data keeps its original shape', () => {
  assert.equal(ds.providers.water.statement.length, 12);
  assert.equal(ds.providers.ovo.statement.length, 12);
  assert.equal(ds.providers.parkXmas.statement.length >= 12, true);
  assert.equal(ds.providers.rent.statement, undefined, 'rent uses entries, not statement');
  for (const key of Object.keys(ds.providers)) {
    assert.ok(!Array.isArray(ds.providers[key].years), `${key}.years must be an object keyed by year`);
  }
});

test('product sheets survive without the workbook', () => {
  const content = ds.productContent;
  const has = (lines: string[], pattern: RegExp) => lines.some((line) => pattern.test(line));
  assert.ok(has(content.setupWizard, /SETUP WIZARD/), 'setup wizard copy');
  assert.ok(has(content.setupWizard, /Choose the reporting year/), 'setup wizard steps');
  assert.ok(has(content.yearReset, /YEAR RESET/), 'year reset copy');
  assert.ok(has(content.yearReset, /Archive the completed prior-year workbook/), 'year reset steps');
  assert.ok(has(content.productAdmin, /Product Name/), 'product admin fields');
  assert.ok(has(content.customerGuide, /CUSTOMER GUIDE/), 'customer guide copy');
  assert.ok(content.transactionLogHowTo.length > 0, 'transaction log instructions');
  assert.ok(content.statementTemplate.length > 0, 'statement template labels');
  assert.ok(content.starlingImport.length > 0, 'starling import instructions');
});
