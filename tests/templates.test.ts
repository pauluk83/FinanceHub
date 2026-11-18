import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtInCsvRows, detectCsvProfile, guessDelimiter, mapCsvRows, parseAmountPence, parseCsvDate,
  parseDelimited,
} from '../core/csvMapping.ts';
import { BUDGET_TEMPLATES, applyTemplate, templateProblem } from '../core/templates.ts';
import { categoryOptions } from '../core/categories.ts';
import type { Dataset, Tx } from '../core/engine.ts';

test('impossible CSV dates and overflowing amounts are refused at the parser', () => {
  assert.equal(parseCsvDate('29/02/2024', 'uk'), '2024-02-29', 'a real leap day is kept');
  assert.equal(parseCsvDate('29/02/2025', 'uk'), '', 'a non-leap 29 February is refused');
  assert.equal(parseCsvDate('31/02/2026', 'uk'), '');
  assert.equal(parseCsvDate('1/13/2026', 'uk'), '', 'a US month is not silently stored as month 13');
  assert.equal(parseCsvDate('2026-13-01'), '');
  assert.equal(parseCsvDate('2026-00-00'), '');
  assert.equal(parseCsvDate('2026-11-18'), '2026-11-18');

  assert.equal(parseAmountPence('1e308'), 0, 'a pence value that would be Infinity becomes 0');
  assert.equal(parseAmountPence('-1e308'), 0);
  assert.equal(parseAmountPence('12.34'), 1234);
});

function dataset(): Dataset {
  return {
    settings: {
      targetYear: 2026, startMonth: 1, monthsInYear: 12, currency: '£',
      asOfDate: '2026-11-18', lockCutoff: '2026-11-01', anchorDate: '2026-11-01',
    },
    accounts: [], people: [], cards: [], bills: [], billChanges: [],
    incomeSchedules: { pip: [], uc: [] }, transactions: [], providers: {}, monthLocks: {},
  };
}

const tx = (row: number): Tx => ({
  row, date: '2026-11-02', account: 'Current', type: 'Expense', amountPence: 100,
  comments: '', status: '', budgetTreatment: '',
});

const STARLING = [
  'Date,Amount,Counter Party,Type',
  '18/11/2026,-12.50,TESCO STORES,Debit',
  '17/11/2026,1500.00,EMPLOYER,Credit',
  '16/11/2026,-4.20,COFFEE SHOP,Debit',
].join('\n');

test('a detected profile reproduces the built-in parser exactly', () => {
  const grid = parseDelimited(STARLING, guessDelimiter(STARLING));
  const builtIn = builtInCsvRows(grid);
  const profile = detectCsvProfile(grid);

  assert.ok(builtIn);
  assert.ok(profile);
  assert.equal(profile.dateFormat, 'uk');
  assert.deepEqual(mapCsvRows(grid, profile), builtIn);
});

test('the sign convention decides direction when there is no direction column', () => {
  const text = 'Date,Amount,Description\n2026-11-01,12.50,TESCO\n';
  const grid = parseDelimited(text, ',');
  const profile = detectCsvProfile(grid);
  assert.ok(profile);
  assert.equal(profile.typeColumn, null);

  const normal = mapCsvRows(grid, profile);
  assert.equal(normal[0].type, 'Income', 'a positive amount reads as income');
  assert.equal(normal[0].amountPence, 1_250);

  const inverted = mapCsvRows(grid, { ...profile, sign: 'inverted' });
  assert.equal(inverted[0].type, 'Expense', 'a file where plus means spending');
  assert.equal(inverted[0].amountPence, 1_250);
});

test('a semicolon file is detected and parsed as one grid', () => {
  const text = 'Date;Amount;Description\n2026-11-01;-4.50;COFFEE\n';
  assert.equal(guessDelimiter(text), ';');
  const grid = parseDelimited(text, guessDelimiter(text));
  assert.equal(grid[0].length, 3);
  assert.deepEqual(builtInCsvRows(grid), [{ date: '2026-11-01', description: 'COFFEE', amountPence: 450, type: 'Expense' }]);
});

test('an unrecognisable file returns nothing rather than guessed rows', () => {
  const grid = parseDelimited('Reference,Value\nabc,12\n', ',');
  assert.equal(builtInCsvRows(grid), null);
  assert.equal(detectCsvProfile(grid), null);
});

test('the template library is structure only', () => {
  assert.equal(BUDGET_TEMPLATES.length, 3);
  for (const template of BUDGET_TEMPLATES) {
    assert.ok(template.accounts.length > 0, `${template.id} needs an account`);
    assert.ok(template.bills.length >= 4, `${template.id} needs bills`);
    assert.ok(template.categories.includes('Housing'), `${template.id} needs categories`);
  }
});

test('a template is refused once the budget has money in it', () => {
  assert.equal(templateProblem(dataset()), null);
  const used = dataset();
  used.transactions = [tx(1)];
  assert.match(templateProblem(used) ?? '', /transactions/);
});

test('applying a template starts a zero-balance budget with no transactions or ledgers', () => {
  const built = applyTemplate(dataset(), 'ukHousehold', {
    year: 2026, asOf: '2026-11-18', anchor: '2026-11-01',
  });
  assert.ok(built);
  assert.ok(built.accounts.length >= 2);
  assert.ok(built.bills.length >= 6);
  assert.equal(built.transactions.length, 0);
  assert.deepEqual(built.providers, {});
  assert.deepEqual(built.monthLocks, {});
  assert.equal(built.accounts[0].openingPence, 0);
  assert.equal(built.accounts[0].name, built.settings.primaryAccount);
  assert.ok(built.bills.every((bill) => bill.linkedSheet === '' && bill.amountPence > 0));
  assert.ok((built.categories ?? []).includes('Housing'));
});

test('template categories appear in the category picker', () => {
  const built = applyTemplate(dataset(), 'benefits', {
    year: 2026, asOf: '2026-11-18', anchor: '2026-11-01',
  });
  assert.ok(built);
  assert.ok(categoryOptions([], built.categories ?? []).includes('Housing'));
});

test('an unknown template changes nothing', () => {
  assert.equal(applyTemplate(dataset(), 'not-a-template', {
    year: 2026, asOf: '2026-11-18', anchor: '2026-11-01',
  }), null);
});
