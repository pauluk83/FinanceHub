/**
 * PIP and Universal Credit payments beyond the schedule rows.
 *
 * The schedule only carries 2026-2028. From there PIP keeps its 28-day cycle and
 * UC keeps the 27th, pulled back to the last working day when the 27th is a
 * weekend or an England and Wales bank holiday. The stored years must not move.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  bankHolidays,
  incomeFor,
  isWorkingDay,
  plannedPayments,
  storedPayments,
  ucPaymentDate,
} from '../core/incomePlan.ts';
import { buildEngine } from '../core/engine.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));
const gapDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

test('England and Wales bank holidays cover the fixed days, Easter and the Mondays', () => {
  assert.deepEqual(bankHolidays(2029), [
    '2029-01-01',
    '2029-03-30',
    '2029-04-02',
    '2029-05-07',
    '2029-05-28',
    '2029-08-27',
    '2029-12-25',
    '2029-12-26',
  ]);
  assert.deepEqual(
    bankHolidays(2027).filter((date) => date.startsWith('2027-12')),
    ['2027-12-27', '2027-12-28'],
    'a Saturday Christmas moves to Monday and Tuesday',
  );
});

test('Universal Credit lands on the 27th, or the last working day before it', () => {
  assert.equal(ucPaymentDate(2029, 5), '2029-05-25', 'the 27th is a Sunday');
  assert.equal(ucPaymentDate(2029, 8), '2029-08-24', 'the 27th is the summer bank holiday');
  assert.equal(ucPaymentDate(2027, 12), '2027-12-24', 'the 27th is the Christmas substitute');
  assert.equal(ucPaymentDate(2029, 7), '2029-07-27', 'a plain Friday is left alone');
});

test('every planned UC date is a working day on or before the 27th', () => {
  const ds = load();
  const payments = plannedPayments(ds, 'uc', '2029-01-01', '2040-12-31');

  assert.equal(payments.length, 12 * 12, 'one payment a month from 2029 to 2040');
  for (const payment of payments) {
    assert.ok(Number(payment.date.slice(8, 10)) <= 27, `${payment.date} is on or before the 27th`);
    assert.ok(isWorkingDay(payment.date), `${payment.date} is a working day`);
    assert.equal(payment.amountPence, 130_822, 'the 2028 amount carries forward');
  }
  assert.equal(payments.at(-1)?.date, '2040-12-27');
});

test('PIP keeps its 28-day cycle from the 2028 payment', () => {
  const ds = load();
  const anchor = storedPayments(ds, 'pip').at(-1);
  assert.equal(anchor?.date, '2028-12-24', 'the newest scheduled PIP payment');

  const payments = plannedPayments(ds, 'pip', '2029-01-01', '2040-12-31');
  assert.equal(payments[0].date, '2029-01-21');
  for (let index = 1; index < payments.length; index += 1) {
    assert.equal(gapDays(payments[index - 1].date, payments[index].date), 28, `gap before ${payments[index].date}`);
  }
  assert.ok(payments.every((payment) => payment.amountPence === 30_160), 'the 2028 amount carries forward');
});

test('the stored 2026-2028 payments are untouched', () => {
  const ds = load();
  const stored = storedPayments(ds, 'pip');
  const planned = plannedPayments(ds, 'pip', '2026-01-01', '2028-12-31');
  assert.deepEqual(planned.map((payment) => payment.date), stored.map((payment) => payment.date));
  assert.ok(planned.some((payment) => payment.date === '2026-12-29'), 'December 2026 keeps its two payments');
});

test('monthly income still matches the schedule for the stored years', () => {
  const ds = load();
  assert.deepEqual(incomeFor(ds, 2026, 11), { pip: 30_680, uc: 130_894 }, 'November 2026 is unchanged');
  assert.deepEqual(incomeFor(ds, 2028, 12), { pip: 30_160, uc: 130_822 }, 'December 2028 is unchanged');
  assert.deepEqual(incomeFor(ds, 2035, 5), { pip: 30_160, uc: 130_822 }, 'a planned year pays the same');
});

test('a planned year balances with the scheduled income', () => {
  const ds = load();
  const engine = buildEngine(ds);
  const planned = engine.monthlySummary(2035, 5);
  assert.equal(planned.incomePence, 30_160 + 130_822, 'PIP and UC for the month');
});
