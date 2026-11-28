import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine } from '../core/engine.ts';
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

test('a bill month typed as zero stays one month, not a standing zero', () => {
  const ds = waterBudget();
  applyProviderPayment(ds, 'water', 2026, 9, 0);
  const rows = ds.providers.water.statement;
  assert.equal(rows[8].paymentPence, 0, 'September pays nothing');
  assert.equal(rows[9].paymentPence, 4_400, 'October keeps its own payment');
  assert.equal(rows[11].paymentPence, 4_400, 'and so does December');
  const change = ds.billChanges.find((entry: any) => entry.bill === 'Water' && entry.appliesFrom === '2026-09-01');
  assert.equal(change?.appliesTo, '2026-09-30', 'the zero applies to its own month only');
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

function ovoBudget() {
  return {
    meta: {},
    settings: { targetYear: 2026, asOfDate: '2026-11-07', currency: '£', primaryAccount: 'Current' },
    accounts: [], people: [], cards: [],
    bills: [{ name: 'Ovo', amountPence: 10_900, baseAmountPence: 10_900, dueDay: 27, linkedSheet: 'Ovo', active: true, effectiveFrom: '' }],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [],
    providers: {
      ovo: {
        targetYear: 2026,
        openingBalancePence: 0,
        statement: MONTHS.map((month) => planRow(month, 10_900)),
        years: {
          2027: { year: 2027, openingPence: 130_800, closingPence: 0, rows: MONTHS.map((month) => planRow(month, 10_900)) },
        },
      },
    },
    holidays: {}, monthLocks: {}, changelog: [], audit: [],
  } as any;
}

test('Ovo follows the same rule: a bill change moves only its month onwards', () => {
  const ds = ovoBudget();
  ds.billChanges.push({
    bill: 'Ovo', appliesFrom: '2027-03-01', appliesTo: '', amountOverridePence: 12_000,
    dueDateOverride: '', changeType: 'Price change', note: '',
  });
  assert.equal(syncProviderPaymentsFromBills(ds), true);
  const rows = ds.providers.ovo.years[2027].rows;
  assert.deepEqual(rows.slice(0, 2).map((row: any) => row.paymentPence), [10_900, 10_900], 'January and February keep £109');
  assert.deepEqual(rows.slice(2).map((row: any) => row.paymentPence), Array(10).fill(12_000), 'March onwards is £120');
  assert.deepEqual(ds.providers.ovo.statement.map((row: any) => row.paymentPence), Array(12).fill(10_900), 'the live year is untouched');
  assert.equal(syncProviderPaymentsFromBills(ds), false, 'a second pass changes nothing');
});

test('an Ovo payment typed on the sheet becomes a bill change from that month', () => {
  const ds = ovoBudget();
  assert.equal(applyProviderPayment(ds, 'ovo', 2027, 7, 13_000), true);
  assert.deepEqual(ds.providers.ovo.years[2027].rows.slice(0, 6).map((row: any) => row.paymentPence), Array(6).fill(10_900));
  assert.deepEqual(ds.providers.ovo.years[2027].rows.slice(6).map((row: any) => row.paymentPence), Array(6).fill(13_000));
  const change = ds.billChanges.find((entry: any) => entry.bill === 'Ovo');
  assert.equal(change?.appliesFrom, '2027-07-01');
  assert.equal(change?.amountOverridePence, 13_000);

  // The bill now shows the new amount from July and not before.
  const amount = (month: number) => buildEngine(ds).scheduledBills(2027, month).find((bill) => bill.name === 'Ovo')?.amountPence;
  assert.equal(amount(6), 10_900, 'June still bills £109');
  assert.equal(amount(7), 13_000, 'July bills £130');
  assert.equal(amount(12), 13_000, 'and every month after it');
});
