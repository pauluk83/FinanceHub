import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDataset } from './support/dataset.ts';
import { applyIncomeRateChange, incomeRateTargets } from '../app/src/incomeSchedule.ts';
import type { Dataset } from '../core/engine.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function schedule(amount2026: number, amount2027 = 0): Dataset['incomeSchedules']['pip'] {
  return MONTHS.map((month, index) => {
    const pad = String(index + 1).padStart(2, '0');
    return {
      month,
      year2026: { date: `2026-${pad}-10`, amountPence: amount2026 },
      year2027: { date: amount2027 ? `2027-${pad}-10` : '', amountPence: amount2027 },
      year2028: { date: '', amountPence: 0 },
    };
  });
}

function budget(): Dataset {
  return baseDataset({
    incomeSchedules: { pip: schedule(10_000, 20_000), uc: schedule(50_000, 60_000) },
  });
}

test('an April rate change moves April onward and leaves January to March alone', () => {
  const ds = budget();
  const changed = applyIncomeRateChange(ds, 'pip', 2026, 'Apr', 25_000);

  assert.equal(changed, 9);
  assert.deepEqual(ds.incomeSchedules.pip.slice(0, 3).map((row) => row.year2026.amountPence), [10_000, 10_000, 10_000]);
  assert.deepEqual(ds.incomeSchedules.pip.slice(3).map((row) => row.year2026.amountPence), Array(9).fill(25_000));
});

test('a rate change never touches the other year or the other scheme', () => {
  const ds = budget();
  applyIncomeRateChange(ds, 'pip', 2026, 'Apr', 25_000);

  assert.ok(ds.incomeSchedules.pip.every((row) => row.year2027.amountPence === 20_000), '2027 PIP keeps its rates');
  assert.ok(ds.incomeSchedules.uc.every((row) => row.year2026.amountPence === 50_000), 'UC keeps its rates');
});

test('months with no payment date are skipped, so a later payment keeps what is typed', () => {
  const ds = budget();
  ds.incomeSchedules.pip[5] = {
    month: 'Jun',
    year2026: { date: '', amountPence: 0 },
    year2027: { date: '', amountPence: 0 },
    year2028: { date: '', amountPence: 0 },
  };
  const changed = applyIncomeRateChange(ds, 'pip', 2026, 'Apr', 25_000);

  assert.equal(changed, 8);
  assert.equal(ds.incomeSchedules.pip[5].year2026.amountPence, 0, 'the blank June row is untouched');
  assert.equal(incomeRateTargets(ds, 'pip', 2026, 'Apr').includes(ds.incomeSchedules.pip[5]), false);
});

test('a payment dated outside the selected year is not changed', () => {
  const ds = budget();
  ds.incomeSchedules.pip[3].year2026 = { date: '2027-04-10', amountPence: 10_000 };

  assert.equal(incomeRateTargets(ds, 'pip', 2026, 'Jan').some((row) => row.month === 'Apr'), false);
  assert.equal(applyIncomeRateChange(ds, 'pip', 2026, 'Jan', 25_000), 11);
  assert.equal(ds.incomeSchedules.pip[3].year2026.amountPence, 10_000);
  assert.equal(ds.incomeSchedules.pip[3].year2026.date, '2027-04-10');
});

test('both December PIP rows change when the month pays twice', () => {
  const ds = budget();
  ds.incomeSchedules.pip.push({
    month: 'Dec',
    year2026: { date: '2026-12-29', amountPence: 10_000 },
    year2027: { date: '', amountPence: 0 },
    year2028: { date: '', amountPence: 0 },
  });

  assert.equal(applyIncomeRateChange(ds, 'pip', 2026, 'Dec', 31_000), 2);
  assert.deepEqual(
    ds.incomeSchedules.pip.filter((row) => row.month === 'Dec').map((row) => row.year2026.amountPence),
    [31_000, 31_000],
  );
});

test('an unknown month or a year with no schedule changes nothing', () => {
  const ds = budget();
  assert.equal(applyIncomeRateChange(ds, 'pip', 2026, 'Foo', 25_000), 0);
  assert.equal(applyIncomeRateChange(ds, 'pip', 2028, 'Apr', 25_000), 0);
  assert.ok(ds.incomeSchedules.pip.every((row) => row.year2026.amountPence === 10_000));
});
