/**
 * Import fuzz tests.
 *
 * Every target is fed a few hundred generated inputs from a seeded printer:
 * unbalanced quotes, stray delimiters, CRLF noise, odd dates, overflow
 * amounts, duplicate rows and formula-injection strings. The rules are that the
 * importer never throws, never invents a row, never turns money into a float
 * or Infinity, and never changes the loaded budget.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  builtInCsvRows,
  mapCsvRows,
  parseAmountPence,
  parseCsvDate,
  parseDelimited,
  type CsvProfile,
} from '../core/csvMapping.ts';
import { detectDuplicates } from '../core/importDedupe.ts';
import { MAX_CSV_ROWS, countCsvRows, csvRowProblem } from '../core/importLimits.ts';
import { isCalendarDate } from '../core/dates.ts';
import { buildEngine, type Dataset } from '../core/engine.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'data', 'workbook.json');
const skip = !fs.existsSync(FILE);

function printer(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  return {
    int: (max: number) => Math.floor(next() * max),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    any: next,
  };
}

const PIECES = [
  '', ' ', '\n', '\r', '\r\n', ',', ';', '\t', '"', '""', '=', '+', '-', '@', '#',
  '2026-11-05', '05/11/2026', '31/02/2026', '2026-02-30', '0000-00-00', 'Infinity',
  '1e309', '-1e309', 'NaN', '£12.34', '12,34', '1 234.56', '=SUM(A1:A2)', '=cmd|\' /c calc\'!A0',
  'Mum xmas prent', 'Ünïcodé ☃', '\uFEFFdate', 'a'.repeat(5_000), '\u0000', '😀😀',
];

function fuzzText(r: ReturnType<typeof printer>, length: number): string {
  let text = '';
  for (let i = 0; i < length; i += 1) text += r.pick(PIECES);
  return text;
}

const validTypes = new Set(['Income', 'Expense']);

test('the splitter never throws, always returns strings, and is deterministic', () => {
  const r = printer(11);
  for (let i = 0; i < 300; i += 1) {
    const text = fuzzText(r, 1 + r.int(12));
    const delimiter = r.pick([',', ';', '\t'] as const);
    const grid = parseDelimited(text, delimiter);
    assert.ok(Array.isArray(grid), 'a grid comes back');
    for (const row of grid) {
      assert.ok(Array.isArray(row), 'every row is an array');
      for (const cell of row) assert.equal(typeof cell, 'string', 'every cell is text');
    }
    assert.deepEqual(parseDelimited(text, delimiter), grid, 'the same input gives the same grid');
  }
});

test('a parsed date is empty or a real calendar day', () => {
  const r = printer(12);
  for (let i = 0; i < 400; i += 1) {
    const input = r.any() < 0.5 ? fuzzText(r, 1 + r.int(3)) : r.pick(PIECES);
    for (const format of ['auto', 'iso', 'uk', 'us'] as const) {
      const date = parseCsvDate(input, format);
      if (date === '') continue;
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${JSON.stringify(input)} → ${date}`);
      assert.equal(isCalendarDate(date), true, `${date} is a real day`);
    }
  }
  // The specific traps stay rejected.
  for (const bad of ['2026-02-30', '31/02/2026', '0000-00-00', '', 'not a date', '2026-13-01']) {
    assert.equal(parseCsvDate(bad), '', `${bad} is refused`);
  }
});

test('amounts stay whole pence and never become Infinity', () => {
  const r = printer(13);
  const inputs = ['1e309', '-1e309', 'Infinity', '-Infinity', 'NaN', '9'.repeat(40), '9999999999999999999999', '0.001', '-0.005', ...Array.from({ length: 50 }, () => fuzzText(r, 1 + r.int(4)))];
  for (const input of inputs) {
    const pence = parseAmountPence(input);
    assert.ok(Number.isFinite(pence), `${JSON.stringify(input.slice(0, 30))} stays finite`);
    assert.ok(Number.isInteger(pence), `${JSON.stringify(input.slice(0, 30))} is whole pence`);
  }
  assert.equal(parseAmountPence('£12.34'), 1_234);
  assert.equal(parseAmountPence('-£12.34'), -1_234);
});

test('a fuzzed bank file yields only valid rows, or no mapping at all', () => {
  const r = printer(14);
  for (let i = 0; i < 250; i += 1) {
    const grid = Array.from({ length: 1 + r.int(8) }, () => Array.from({ length: 1 + r.int(5) }, () => r.pick(PIECES)));
    const rows = builtInCsvRows(grid);
    if (rows === null) continue;
    for (const row of rows) {
      assert.ok(isCalendarDate(row.date), `${row.date} is a real day`);
      assert.ok(Number.isInteger(row.amountPence) && row.amountPence > 0, 'a row always carries whole positive pence');
      assert.ok(validTypes.has(row.type), 'the direction is Income or Expense');
      assert.equal(typeof row.description, 'string');
    }
  }
});

test('a saved profile with out-of-range columns cannot throw or invent rows', () => {
  const r = printer(15);
  for (let i = 0; i < 250; i += 1) {
    const grid = Array.from({ length: 1 + r.int(6) }, () => Array.from({ length: 1 + r.int(4) }, () => r.pick(PIECES)));
    const profile: CsvProfile = {
      id: 'fuzz',
      name: 'Fuzz',
      delimiter: r.pick([',', ';', '\t'] as const),
      hasHeader: r.any() < 0.5,
      dateColumn: r.int(10) - 2,
      descriptionColumn: r.int(10) - 2,
      amountColumn: r.int(10) - 2,
      typeColumn: r.any() < 0.5 ? null : r.int(10) - 2,
      dateFormat: r.pick(['iso', 'uk', 'us'] as const),
      sign: r.pick(['signed', 'inverted'] as const),
    };
    const rows = mapCsvRows(grid, profile);
    for (const row of rows) {
      assert.ok(isCalendarDate(row.date), 'mapped rows carry real days');
      assert.ok(Number.isInteger(row.amountPence), 'mapped amounts are whole pence');
      assert.notEqual(row.amountPence, 0, 'a zero amount is not a movement');
    }
  }
});

test('duplicate detection is stable and never flags the first occurrence as staged', () => {
  const r = printer(16);
  for (let i = 0; i < 200; i += 1) {
    const existing = Array.from({ length: r.int(4) }, () => ({
      date: r.pick(['2026-11-01', '2026-11-02', '2026-11-05', 'not-a-date']),
      type: r.pick(['Income', 'Expense']),
      amountPence: r.int(3) * 1_000,
    }));
    const candidates = Array.from({ length: r.int(6) }, () => ({
      date: r.pick(['2026-11-01', '2026-11-02', '2026-11-05']),
      type: r.pick(['Income', 'Expense'] as const),
      amountPence: r.int(3) * 1_000,
    }));

    const flags = detectDuplicates(existing, candidates);
    assert.equal(flags.length, candidates.length);
    assert.deepEqual(detectDuplicates(existing, candidates), flags, 'the same input flags the same rows');
    const dayGap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
    candidates.forEach((candidate, index) => {
      if (flags[index] === 'staged') {
        const earlier = candidates.slice(0, index);
        assert.equal(
          earlier.some((row) => row.type === candidate.type
            && Math.abs(row.amountPence) === Math.abs(candidate.amountPence)
            && dayGap(row.date, candidate.date) <= 86_400_000),
          true,
          'staged only after an earlier copy within a day',
        );
      }
      if (flags[index] === 'existing') {
        assert.equal(existing.some((row) => row.type === candidate.type
          && Math.abs(row.amountPence) === Math.abs(candidate.amountPence)
          && Number.isFinite(dayGap(row.date, candidate.date))
          && dayGap(row.date, candidate.date) <= 86_400_000), true);
      }
    });
  }
});

test('a repeated row is staged and a formula cell stays literal text', () => {
  const formula = '=HYPERLINK("http://example.test","click")';
  const grid = [
    ['Date', 'Description', 'Amount'],
    ['2026-11-05', formula, '12.34'],
    ['2026-11-06', '+1+1', '5'],
    ['2026-11-07', '@SUM(A1:A2)', '-5'],
    ['2026-11-08', '\tTAB', '7'],
  ];
  const rows = builtInCsvRows(grid)!;
  assert.equal(rows.length, 4);
  assert.equal(rows[0].description, formula, 'the formula is kept as text, not evaluated');
  assert.equal(rows[0].amountPence, 1_234);
  assert.deepEqual(rows.map((row) => row.type), ['Income', 'Income', 'Expense', 'Income']);
  assert.deepEqual(rows.map((row) => row.description), [formula, '+1+1', '@SUM(A1:A2)', '\tTAB']);
});

test('the row cap rejects a huge file before it is parsed', () => {
  const header = 'Date,Description,Amount\n';
  const row = '2026-11-05,Shop,1.00\n';
  assert.equal(csvRowProblem(MAX_CSV_ROWS), null, 'the cap itself is allowed');
  assert.match(csvRowProblem(MAX_CSV_ROWS + 1) ?? '', /more than/);

  const atLimit = header + row.repeat(MAX_CSV_ROWS);
  assert.equal(countCsvRows(atLimit), MAX_CSV_ROWS);
  const overLimit = atLimit + row;
  assert.equal(countCsvRows(overLimit), MAX_CSV_ROWS + 1);
  assert.notEqual(csvRowProblem(countCsvRows(overLimit)), null);

  // Counting is a safety cap: it may over-count quoted newlines, never under-count.
  const r = printer(17);
  for (let i = 0; i < 100; i += 1) {
    const text = fuzzText(r, r.int(20));
    const physical = (text.match(/\n/g) ?? []).length;
    assert.ok(countCsvRows(text) >= physical - 1, 'the count never drops below the newlines it can see');
  }
});

test('fuzzing the importer leaves the loaded budget and its figures untouched', { skip }, () => {
  const ds: Dataset = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const before = buildEngine(ds, { today: '2026-11-20' });
  const snapshot = JSON.stringify(ds);
  const totals = [
    before.monthlyIncome(2026, 11).total,
    before.monthlyExpenses(2026, 11).total,
    before.owedAt('2026-11-20'),
    before.scheduledBillsTotal(2026, 11),
  ];

  const r = printer(18);
  for (let i = 0; i < 100; i += 1) {
    const grid = Array.from({ length: 1 + r.int(5) }, () => Array.from({ length: 1 + r.int(5) }, () => r.pick(PIECES)));
    builtInCsvRows(grid);
    detectDuplicates(ds.transactions.slice(0, 3), []);
  }

  assert.equal(JSON.stringify(ds), snapshot, 'the budget document is untouched');
  const after = buildEngine(ds, { today: '2026-11-20' });
  assert.deepEqual([
    after.monthlyIncome(2026, 11).total,
    after.monthlyExpenses(2026, 11).total,
    after.owedAt('2026-11-20'),
    after.scheduledBillsTotal(2026, 11),
  ], totals, 'every headline figure is unchanged');
});
