import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { applyWaterPaymentChange, waterPaymentTargets } from '../core/water.ts';

function loadDataset(): Dataset {
  return JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  ) as Dataset;
}

test('Water payment change updates future statement months and recalculates their balances', () => {
  const dataset = loadDataset();
  const water = dataset.providers.water;
  const waterBill = dataset.bills.find((bill) => bill.name === 'Water');
  assert.ok(waterBill);

  assert.equal(waterPaymentTargets(water, dataset.settings.asOfDate, '2026-12-01').length, 1);
  assert.equal(applyWaterPaymentChange(water, dataset.settings.asOfDate, 5000, '2026-12-01'), 1);

  const month = (name: string) => water.statement.find((row: any) => row.month === name);
  assert.equal(water.monthlyPaymentPence, 5000);
  assert.equal(water.paymentBasePence, 4400);
  assert.deepEqual(water.paymentChanges, [{ effectiveFrom: '2026-12-01', amountPence: 5000 }]);
  assert.equal(month('Nov').paymentPence, 4400, 'passed history is retained');
  assert.equal(month('Dec').paymentPence, 5000);
  assert.equal(month('Dec').balancePence, 24630, 'future balance includes the new payment');
  assert.equal(month('Apr').paymentPence, 0, 'zero-payment month is retained');

  const engine = buildEngine(dataset);
  assert.equal(engine.billAmount(waterBill, 2026, 11), 4400, 'earlier Water bills keep the old amount');
  assert.equal(engine.billAmount(waterBill, 2026, 12), 5000);
  assert.equal(engine.billAmount(waterBill, 2027, 3), 5000);
});

test('a future-year Water change leaves 2026 history untouched and applies to future bills', () => {
  const dataset = loadDataset();
  const water = dataset.providers.water;
  const waterBill = dataset.bills.find((bill) => bill.name === 'Water');
  assert.ok(waterBill);

  const before = water.statement.map((row: any) => ({ ...row }));
  assert.equal(waterPaymentTargets(water, dataset.settings.asOfDate, '2027-04-01').length, 0);
  assert.equal(applyWaterPaymentChange(water, dataset.settings.asOfDate, 5000, '2027-04-01'), 0);

  assert.deepEqual(water.statement, before, '2026 statement history is unchanged');
  assert.equal(water.monthlyPaymentPence, 5000);

  const engine = buildEngine(dataset);
  assert.equal(engine.billAmount(waterBill, 2027, 3), 4400, 'months before the change keep the old amount');
  assert.equal(engine.billAmount(waterBill, 2027, 4), 0, 'zero-payment month stays zero');
  assert.equal(engine.billAmount(waterBill, 2027, 5), 5000);
});
