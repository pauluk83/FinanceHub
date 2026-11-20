/**
 * A-11: one implementation of the rent, water and telco rules.
 *
 * The rules themselves are pinned to exact pence values here, so a refactor
 * cannot quietly move a charge, a payment or a running balance. The last test
 * proves the engine's bills and rent ledger are the core helpers' own output
 * rather than a second copy of the arithmetic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyMonthlyPaymentChange,
  applyMonthlyRentChange,
  rentLedgerThrough,
  rentPaymentPenceForMonth,
  weeklyRentPence,
  type RentProvider,
} from '../core/rent.ts';
import {
  applyWaterPaymentChange,
  waterPaymentPenceForMonth,
  type WaterProvider,
} from '../core/water.ts';
import { recalculateTelco, telcoBillPence, type TelcoProvider } from '../core/telco.ts';
import { buildEngine } from '../core/engine.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

const rentFixture = (): RentProvider => ({
  monthlyRentPence: 200_000,
  monthlyPaymentPence: 50_000,
  paymentBasePence: 50_000,
  entries: [
    { date: '2026-10-27', description: 'Payment', amountPence: 50_000, balancePence: -150_000 },
    { date: '2026-11-02', description: 'Rent Charge', amountPence: -50_000, balancePence: -200_000 },
    { date: '2026-11-09', description: 'Rent Charge', amountPence: -50_000, balancePence: -250_000 },
    { date: '2026-11-16', description: 'Rent Charge', amountPence: -50_000, balancePence: -300_000 },
  ],
});

test('rent is charged weekly at a quarter of the monthly rent', () => {
  assert.equal(weeklyRentPence(200_000), 50_000);
  assert.equal(weeklyRentPence(220_001), 55_000, 'rounds to the nearest penny');
});

test('a rent change rewrites only future charges and rebuilds balances from the same baseline', () => {
  const rent = rentFixture();
  const changed = applyMonthlyRentChange(rent, '2026-11-10', 220_000, '2026-11-15');

  assert.equal(changed, 1, 'only the 16 November charge moves');
  assert.equal(rent.weeklyChargePence, -55_000);
  assert.deepEqual(
    rent.entries!.map((entry) => entry.amountPence),
    [50_000, -50_000, -50_000, -55_000],
    'paid history keeps its old charge',
  );
  assert.deepEqual(
    rent.entries!.map((entry) => entry.balancePence),
    [-150_000, -200_000, -250_000, -305_000],
    'balances still start from the ledger baseline',
  );
});

test('a rent payment change rewrites only future payments', () => {
  const rent = rentFixture();
  rent.entries!.push({ date: '2026-12-27', description: 'Payment', amountPence: 50_000, balancePence: -350_000 });

  const changed = applyMonthlyPaymentChange(rent, '2026-11-10', 60_000, '2026-12-27');
  assert.equal(changed, 1);
  assert.equal(rent.monthlyPaymentPence, 60_000);
  assert.equal(rent.paymentBasePence, 50_000, 'the original payment is still recorded');
  assert.equal(rent.entries!.at(-1)!.amountPence, 60_000);
  assert.equal(rent.entries![0].amountPence, 50_000, 'the October payment is history');
});

test('the month bill takes the newest rent change that has taken effect', () => {
  const rent = rentFixture();
  applyMonthlyPaymentChange(rent, '2026-11-10', 60_000, '2026-12-27');
  assert.equal(rentPaymentPenceForMonth(rent, 2026, 11), 50_000);
  assert.equal(rentPaymentPenceForMonth(rent, 2026, 12), 50_000, 'a change dated inside December starts with January');
  assert.equal(rentPaymentPenceForMonth(rent, 2027, 1), 60_000);
  assert.equal(rentPaymentPenceForMonth({}, 2026, 11), null);
});

test('the rent ledger is the sum of its amount column, not its row order', () => {
  const rent = rentFixture();
  const ledger = rentLedgerThrough(rent, '2026-11-10');
  assert.deepEqual(ledger, { balancePence: -50_000, chargesPence: -100_000, paymentsPence: 50_000, entryCount: 3 });
});

const waterFixture = (): WaterProvider => ({
  year: 2026,
  monthlyPaymentPence: 4_400,
  paymentBasePence: 4_400,
  statement: [
    { month: 'Jan', billAmountPence: 4_000, paymentPence: 4_400, balancePence: -400 },
    { month: 'Feb', billAmountPence: 4_000, paymentPence: 4_400, balancePence: 0 },
    { month: 'Mar', billAmountPence: 4_000, paymentPence: 4_400, balancePence: 400 },
    { month: 'Apr', billAmountPence: 4_000, paymentPence: 4_400, balancePence: 800 },
    { month: 'May', billAmountPence: 4_000, paymentPence: 4_400, balancePence: 1_200 },
    { month: 'Jun', billAmountPence: 4_000, paymentPence: 0, balancePence: 1_200 },
  ],
});

test('a water payment change leaves history and deliberate zero months alone', () => {
  const water = waterFixture();
  const changed = applyWaterPaymentChange(water, '2026-02-10', 5_000, '2026-04-01');
  assert.equal(changed, 2, 'April and May move; June is a deliberate zero');
  assert.equal(water.statement![0].paymentPence, 4_400);
  assert.equal(water.statement![2].paymentPence, 4_400, 'March is already history');
  assert.equal(water.statement![3].paymentPence, 5_000);
  assert.equal(water.statement![5].paymentPence, 0);
  assert.deepEqual(
    water.statement!.map((row) => row.balancePence),
    [-400, 0, 400, 1_400, 2_400, -1_600],
    'balances rebuild from the statement baseline (-£8.00 carried in)',
  );
});

test('the month bill takes the change, except for a deliberate zero month', () => {
  const water = waterFixture();
  applyWaterPaymentChange(water, '2026-02-10', 5_000, '2026-04-01');
  assert.equal(waterPaymentPenceForMonth(water, 2026, 3), 4_400);
  assert.equal(waterPaymentPenceForMonth(water, 2026, 4), 5_000);
  assert.equal(waterPaymentPenceForMonth(water, 2026, 6), 0);
});

const telcoFixture = (): TelcoProvider => ({
  year: 2026,
  statement: [
    { month: 'Oct', amountPence: 3_000, paymentPence: 3_000, balancePence: 0 },
    { month: 'Nov', amountPence: 3_000, paymentPence: 2_000, balancePence: 0 },
  ],
  contract: { endDate: '2028-09-30', contractAmountPence: 72_000 },
});

test('telco balances carry forward and the contract totals restate', () => {
  const o2 = telcoFixture();
  const totals = recalculateTelco(o2);

  assert.deepEqual(o2.statement!.map((row) => row.balancePence), [0, -1_000]);
  assert.equal(totals.paymentsPence, 5_000);
  assert.equal(totals.remainingPaymentsPence, 67_000);
  assert.equal(o2.contract!.remainingPaymentsPence, 67_000);
});

test('an overpaid telco contract owes nothing, and a typed balance anchors later rows', () => {
  const paid = telcoFixture();
  paid.contract!.contractAmountPence = 4_000;
  assert.equal(recalculateTelco(paid).remainingPaymentsPence, 0);

  const anchored = telcoFixture();
  anchored.statement![1].balanceOverridePence = -500;
  recalculateTelco(anchored);
  assert.deepEqual(anchored.statement!.map((row) => row.balancePence), [0, -500]);
});

test('the bill amount comes from the statement amount column', () => {
  assert.equal(telcoBillPence({ month: 'Nov', amountPence: 3_000 }), 3_000);
  assert.equal(telcoBillPence({ month: 'Nov' }), null);
  assert.equal(telcoBillPence(undefined), null);
});

test('the engine bills and rent ledger are the core rules, not a second copy', { skip: !fs.existsSync(path.join(ROOT, 'data', 'workbook.json')) }, () => {
  const ds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));
  // Bill changes are deliberate overrides; removing them leaves the provider
  // rule as the only thing that can set the amount.
  const next = structuredClone(ds);
  next.billChanges = [];
  const engine = buildEngine(next, { today: '2026-11-20' });
  const bills = engine.scheduledBills(2026, 11);

  const rentBill = bills.find((bill: any) => bill.linkedSheet === 'Rent');
  if (rentBill) {
    assert.equal(rentBill.amountPence, rentPaymentPenceForMonth(next.providers.rent, 2026, 11));
  }

  const waterBill = bills.find((bill: any) => bill.linkedSheet === 'Water');
  if (waterBill) {
    const rows = (next.providers.water.statement ?? []) as any[];
    assert.equal(waterBill.amountPence, waterPaymentPenceForMonth(next.providers.water, 2026, 11, rows));
  }

  const o2Bill = bills.find((bill: any) => bill.linkedSheet === 'O2');
  if (o2Bill) {
    const row = ((next.providers.o2.statement ?? []) as any[]).find((entry: any) => entry.month === 'Nov');
    assert.equal(o2Bill.amountPence, telcoBillPence(row));
  }

  assert.deepEqual(engine.rentLedger('2026-11-20'), rentLedgerThrough(next.providers.rent, '2026-11-20'));
});
