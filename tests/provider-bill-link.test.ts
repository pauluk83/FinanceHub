import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProviderPayment, syncProviderPaymentsFromBills } from '../core/providerBillLink.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const planRow = (month: string, payment: number) => ({
  month, billPeriod: `${month} period`, billAmountPence: 0, creditPence: 0, refundPence: 0, paymentPence: payment, balancePence: 0,
});

function waterBudget() {
  const payments = [4_400, 4_400, 4_400, 0, 4_400, 4_400, 4_400, 4_400, 0, 4_400, 4_400, 4_400];
  return {
    meta: {},
    settings: { targetYear: 2026, asOfDate: '2026-11-07', currency: '£', primaryAccount: 'Current' },
    accounts: [], people: [], cards: [],
    bills: [{ name: 'Water', amountPence: 4_400, baseAmountPence: 4_400, dueDay: 27, linkedSheet: 'Water', active: true, effectiveFrom: '' }],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [],
    providers: {
      water: {
        year: 2026,
        openingBalancePence: 0,
        statement: MONTHS.map((month, index) => planRow(month, payments[index])),
        years: {
          2027: { year: 2027, openingPence: 0, closingPence: 0, rows: MONTHS.map((month, index) => planRow(month, payments[index])) },
          2028: { year: 2028, openingPence: 0, closingPence: 0, rows: MONTHS.map((month, index) => planRow(month, payments[index])) },
        },
      },
    },
    holidays: {}, monthLocks: {}, changelog: [], audit: [],
  } as any;
}

test('a payment changed on the sheet applies from that month forward only', () => {
  const ds = waterBudget();
  applyProviderPayment(ds, 'water', 2027, 3, 5_000);
  const rows2027 = ds.providers.water.years[2027].rows;
  assert.deepEqual(rows2027.slice(0, 2).map((row: any) => row.paymentPence), [4_400, 4_400], 'January and February keep their own amounts');
  assert.deepEqual(rows2027.slice(2).map((row: any) => row.paymentPence), Array(10).fill(5_000), 'March onwards follows the edit');
  assert.deepEqual(ds.providers.water.years[2028].rows.map((row: any) => row.paymentPence), Array(12).fill(5_000), 'later years follow too');
  assert.deepEqual(ds.providers.water.statement.map((row: any) => row.paymentPence), [4_400, 4_400, 4_400, 0, 4_400, 4_400, 4_400, 4_400, 0, 4_400, 4_400, 4_400], 'the live year is untouched by a 2027 edit');

  const change = ds.billChanges.find((entry: any) => entry.bill === 'Water');
  assert.equal(change?.appliesFrom, '2027-03-01');
  assert.equal(change?.amountOverridePence, 5_000, 'the Bills tab follows from March 2027');
});

test('a bill change made on the Bills tab reaches the plan from its month', () => {
  const ds = waterBudget();
  ds.billChanges.push({
    bill: 'Water', appliesFrom: '2026-07-01', appliesTo: '', amountOverridePence: 4_600,
    dueDateOverride: '', changeType: 'Price change', note: '',
  });
  assert.equal(syncProviderPaymentsFromBills(ds), true);
  const rows = ds.providers.water.statement;
  assert.deepEqual(rows.slice(0, 6).map((row: any) => row.paymentPence), [4_400, 4_400, 4_400, 0, 4_400, 4_400], 'earlier months keep what happened');
  assert.deepEqual(rows.slice(6).map((row: any) => row.paymentPence), Array(6).fill(4_600), 'July onwards follows the change');
  assert.deepEqual(ds.providers.water.years[2027].rows.map((row: any) => row.paymentPence), Array(12).fill(4_600));
  assert.equal(syncProviderPaymentsFromBills(ds), false, 'a second pass changes nothing');
});
