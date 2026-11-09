import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Dataset } from '../core/engine.ts';
import {
  applyMonthlyPaymentChange,
  applyMonthlyRentChange,
  rentChangeTargets,
  weeklyRentPence,
} from '../core/rent.ts';

test('weekly rent is one quarter of the monthly rent', () => {
  assert.equal(weeklyRentPence(46472), 11618);
  assert.equal(weeklyRentPence(50000), 12500);
});

test('rent change updates only future non-zero rent charges and recalculates balances', () => {
  const rent = {
    monthlyRentPence: 40000,
    weeklyChargePence: -10000,
    entries: [
      { date: '2026-04-06', description: 'Rent Charge', amountPence: -10000, balancePence: -10000 },
      { date: '2026-11-09', description: 'Rent Charge', amountPence: -10000, balancePence: -20000 },
      { date: '2026-12-21', description: 'Rent Charge', amountPence: 0, balancePence: -20000 },
      { date: '2027-04-05', description: 'Rent Charge', amountPence: -10000, balancePence: -30000 },
      { date: '2027-04-27', description: 'Payment from Zane', amountPence: 50000, balancePence: 20000 },
      { date: '2027-05-03', description: 'Rent Charge', amountPence: -10000, balancePence: 10000 },
    ],
  };

  assert.equal(rentChangeTargets(rent.entries, '2026-11-06', '2027-04-01').length, 2);
  assert.equal(applyMonthlyRentChange(rent, '2026-11-06', 50000, '2027-04-01'), 2);

  assert.equal(rent.monthlyRentPence, 50000);
  assert.equal(rent.weeklyChargePence, -12500);
  assert.equal(rent.detailsEdited, true);
  assert.equal(rent.entries[0].amountPence, -10000, 'passed history is retained');
  assert.equal(rent.entries[1].amountPence, -10000, 'future rows before the effective date are retained');
  assert.equal(rent.entries[2].amountPence, 0, 'free-week row is retained');
  assert.equal(rent.entries[3].amountPence, -12500);
  assert.equal(rent.entries[4].amountPence, 50000, 'payments are not changed');
  assert.equal(rent.entries[5].amountPence, -12500);
  assert.equal(rent.entries[5].balancePence, 5000);
});

test('payment change updates future payment rows and preserves passed and zero-payment rows', () => {
  const rent = {
    monthlyPaymentPence: 50000,
    entries: [
      { date: '2026-04-27', description: 'Payment from Zane', amountPence: 50000, balancePence: 50000 },
      { date: '2026-11-27', description: 'Payment from Zane', amountPence: 0, balancePence: 50000 },
      { date: '2027-04-27', description: 'Payment from Zane', amountPence: 50000, balancePence: 100000 },
      { date: '2027-05-27', description: 'Payment from Zane', amountPence: 50000, balancePence: 150000 },
    ],
  };

  assert.equal(applyMonthlyPaymentChange(rent, '2026-11-06', 52500, '2027-04-01'), 2);
  assert.equal(rent.monthlyPaymentPence, 52500);
  assert.equal(rent.paymentBasePence, 50000);
  assert.deepEqual(rent.paymentChanges, [{ effectiveFrom: '2027-04-01', amountPence: 52500 }]);
  assert.equal(rent.entries[0].amountPence, 50000, 'passed payment history is retained');
  assert.equal(rent.entries[1].amountPence, 0, 'zero-payment month is retained');
  assert.equal(rent.entries[2].amountPence, 52500);
  assert.equal(rent.entries[3].amountPence, 52500);
  assert.equal(rent.entries[2].balancePence, 102500);
  assert.equal(rent.entries[3].balancePence, 155000);
});

test('a payment change keeps earlier Rent bill months on the old amount', () => {
  const dataset = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  ) as Dataset;
  const rent = dataset.providers.rent;
  const rentBill = dataset.bills.find((bill) => bill.name === 'Rent');
  assert.ok(rentBill);

  applyMonthlyPaymentChange(rent, dataset.settings.asOfDate, 52500, '2027-04-01');
  const engine = buildEngine(dataset);

  assert.equal(engine.billAmount(rentBill, 2026, 11), 0, 'November 2026 rent is skipped in credit');
  assert.equal(engine.billAmount(rentBill, 2027, 3), 50000);
  assert.equal(engine.billAmount(rentBill, 2027, 4), 52500);
});

test('a rent change updates a later year stored in its own block', () => {
  const dataset = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  ) as Dataset;
  const rent = dataset.providers.rent;
  const before = rent.entries.map((row: any) => [row.date, row.amountPence]);
  const beforeClose = buildEngine(dataset).rentLedger('2027-12-31').balancePence;

  const changed = applyMonthlyRentChange(rent, dataset.settings.asOfDate, 50000, '2027-04-01');
  assert.ok(changed > 0, 'future 2027 charges are found in the block');
  assert.deepEqual(rent.entries.map((row: any) => [row.date, row.amountPence]), before, '2026 amounts are unchanged');

  const april = rent.years['2027'].rows.find((row: any) => row.date === '2027-04-05');
  assert.equal(april?.amountPence, -12500);
  const engine = buildEngine(dataset);
  assert.equal(engine.rentLedger('2027-12-31').balancePence, beforeClose + changed * (-12500 - -11618));
});
