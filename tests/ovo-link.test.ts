import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine } from '../core/engine.ts';
import { setOvoSheetPayment, syncOvoProviderPayments } from '../core/ovoLink.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const row = (month: string, payment: number, balance: number) => ({
  month, billPeriod: `${month} period`, billAmountPence: 0, creditPence: 0, refundPence: 0, paymentPence: payment, balancePence: balance,
});

function budget() {
  return {
    meta: {},
    settings: { targetYear: 2026, asOfDate: '2026-11-07', currency: '£', primaryAccount: 'Current' },
    accounts: [{ name: 'Current', openingPence: 0 }],
    people: [],
    cards: [],
    bills: [{
      name: 'Ovo', amountPence: 10_900, baseAmountPence: 10_900, dueDay: 27, baseDueDay: 27,
      linkedSheet: 'Ovo', frequency: 'Monthly', active: true, effectiveFrom: '',
    }],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [],
    providers: {
      ovo: {
        targetYear: 2026,
        openingBalancePence: 0,
        statement: MONTHS.map((month, index) => row(month, 10_900, (index + 1) * 10_900)),
        years: {
          2027: { year: 2027, openingPence: 130_800, closingPence: 0, rows: MONTHS.map((month, index) => row(month, 10_900, 130_800 + (index + 1) * 10_900)) },
        },
      },
    },
    holidays: {},
    monthLocks: {},
    changelog: [],
    audit: [],
  } as any;
}

test('a bill override reaches the Ovo statement for that month onwards', () => {
  const ds = budget();
  ds.billChanges.push({
    bill: 'Ovo', appliesFrom: '2027-03-01', appliesTo: '', amountOverridePence: 12_000,
    dueDateOverride: '', changeType: 'Price change', note: '',
  });
  assert.equal(syncOvoProviderPayments(ds), true);
  const rows = ds.providers.ovo.years[2027].rows;
  assert.deepEqual(rows.slice(0, 2).map((entry: any) => entry.paymentPence), [10_900, 10_900], 'earlier months keep the old amount');
  assert.deepEqual(rows.slice(2).map((entry: any) => entry.paymentPence), [12_000, 12_000, 12_000, 12_000, 12_000, 12_000, 12_000, 12_000, 12_000, 12_000]);
  // 2026 closes at 130800, then February and March are on the old amount.
  assert.equal(rows[0].balancePence, 141_700);
  assert.equal(rows[1].balancePence, 152_600);
  assert.equal(rows[2].balancePence, 164_600, 'the new amount carries into the balance');
  assert.equal(syncOvoProviderPayments(ds), false, 'a second pass changes nothing');
});

test('changing the bill amount on the Bills tab cascades into every statement year', () => {
  const ds = budget();
  ds.bills[0].baseAmountPence = 12_500;
  ds.bills[0].amountPence = 12_500;
  assert.equal(buildEngine(ds).scheduledBills(2026, 1)[0].amountPence, 12_500, 'the bill is the amount the sheet follows');
  syncOvoProviderPayments(ds);
  assert.equal(ds.providers.ovo.statement[0].paymentPence, 12_500);
  assert.equal(ds.providers.ovo.years[2027].rows[5].paymentPence, 12_500);
});

test('a payment typed on the statement becomes a bill change for its month', () => {
  const ds = budget();
  assert.equal(setOvoSheetPayment(ds, 2027, 4, 13_000), true);
  const changes = ds.billChanges.filter((change: any) => change.bill === 'Ovo');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].appliesFrom, '2027-04-01');
  assert.equal(changes[0].amountOverridePence, 13_000);

  // Typing April again updates the same change instead of piling another one up.
  setOvoSheetPayment(ds, 2027, 4, 13_500);
  assert.equal(ds.billChanges.length, 1);
  assert.equal(ds.billChanges[0].amountOverridePence, 13_500);

  assert.equal(buildEngine(ds).scheduledBills(2027, 3)[0].amountPence, 10_900, 'March is untouched');
  assert.equal(buildEngine(ds).scheduledBills(2027, 4)[0].amountPence, 13_500, 'the Bills tab follows the statement');
  assert.equal(buildEngine(ds).scheduledBills(2027, 12)[0].amountPence, 13_500, 'and every month after it');
});
