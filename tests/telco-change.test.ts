import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { recalculateTelco, telcoOpeningPence, telcoRemainingMonths, type TelcoProvider } from '../core/telco.ts';

function loadDataset(): Dataset {
  return JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  ) as Dataset;
}

const paymentsOf = (rows: any[]) => rows.reduce((sum, row) => sum + (Number(row.paymentPence) || 0), 0);
const rowOf = (rows: any[], month: string) => rows.find((row) => row.month === month);

test('a Virgin payment change carries through every later month and restates the contract', () => {
  const dataset = loadDataset();
  const virgin = dataset.providers.virgin as TelcoProvider & { statement: any[]; contract: any };
  const rows = virgin.statement;

  assert.equal(virgin.contract.contractAmountPence, 88776, 'contract amount from the workbook');
  const beforePayments = paymentsOf(rows);
  const dec = rowOf(rows, 'Dec');
  assert.ok(dec);
  const decBefore = dec.balancePence;
  const opening = telcoOpeningPence(rows);

  dec.paymentPence = (Number(dec.paymentPence) || 0) + 3299;
  const totals = recalculateTelco(virgin, opening);

  assert.equal(dec.balancePence, decBefore + 3299, 'December balance absorbs the new payment');
  assert.equal(totals.paymentsPence, beforePayments + 3299);
  assert.equal(virgin.contract.paymentsPence, beforePayments + 3299, 'payments made restated');
  assert.equal(virgin.contract.remainingPaymentsPence, 88776 - (beforePayments + 3299), 'remaining payments restated');
  assert.equal(virgin.contractEdited, true, 'the contract is now derived, not the seed copy');
});

test('an O2 payment change leaves earlier months alone and updates the current one', () => {
  const dataset = loadDataset();
  const o2 = dataset.providers.o2 as TelcoProvider & { statement: any[]; contract: any };
  const rows = o2.statement;

  assert.equal(o2.contract.contractAmountPence, 35500, 'contract amount from the workbook');
  const before = rows.map((row) => row.balancePence);
  const beforePayments = paymentsOf(rows);
  const opening = telcoOpeningPence(rows);
  const dec = rowOf(rows, 'Dec');
  assert.ok(dec);

  dec.paymentPence = 1000;
  const totals = recalculateTelco(o2, opening);

  assert.deepEqual(
    rows.slice(0, -1).map((row) => row.balancePence),
    before.slice(0, -1),
    'months before the edit keep their balances',
  );
  assert.equal(dec.balancePence, before[before.length - 1] + 1000);
  assert.equal(totals.paymentsPence, beforePayments + 1000);
  assert.equal(o2.contract.remainingPaymentsPence, 35500 - (beforePayments + 1000));
});

test('recalculation is idempotent once the ledger is consistent', () => {
  const dataset = loadDataset();
  const virgin = dataset.providers.virgin as TelcoProvider & { statement: any[]; contract: any };

  const snapshot = virgin.statement.map((row) => row.balancePence);
  const payments = virgin.contract.paymentsPence;
  recalculateTelco(virgin);

  assert.deepEqual(virgin.statement.map((row) => row.balancePence), snapshot);
  assert.equal(virgin.contract.paymentsPence, payments);
});

test('an overpayment leaves nothing outstanding rather than a negative total', () => {
  const dataset = loadDataset();
  const o2 = dataset.providers.o2 as TelcoProvider & { statement: any[]; contract: any };
  const opening = telcoOpeningPence(o2.statement);

  o2.statement[0].paymentPence = 500000;
  const totals = recalculateTelco(o2, opening);

  assert.equal(totals.remainingPaymentsPence, 0);
  assert.equal(o2.contract.remainingPaymentsPence, 0);
});

test('O2 remaining months come from the contract end date', () => {
  const dataset = loadDataset();
  const o2 = dataset.providers.o2 as TelcoProvider;

  assert.equal(telcoRemainingMonths(o2, '2026-11-06'), 23, 'November 2026 to September 2028 inclusive');
  assert.equal(telcoRemainingMonths(o2, '2026-12-31'), 22);
  assert.equal(telcoRemainingMonths(o2, '2028-09-15'), 1);
  assert.equal(telcoRemainingMonths(o2, '2028-10-01'), 0, 'the contract has ended');
  assert.equal(telcoRemainingMonths(o2, '2029-01-01'), 0, 'never negative');
  assert.equal(telcoRemainingMonths({ ...o2, contract: { ...o2.contract!, endDate: undefined } }, '2026-11-06'), null);
  assert.equal(telcoRemainingMonths(o2, 'not-a-date'), null);
});

test('Virgin remaining months agree with the workbook figure', () => {
  const dataset = loadDataset();
  const virgin = dataset.providers.virgin as TelcoProvider;

  assert.equal(telcoRemainingMonths(virgin, '2026-11-06'), 23);
  assert.equal(virgin.contract?.remaining, '23');
});

test('payment edits do not change the scheduled bill amounts', () => {
  const dataset = loadDataset();
  const virginBill = dataset.bills.find((bill) => bill.name === 'Virgin Media');
  const o2Bill = dataset.bills.find((bill) => bill.name === 'O2');
  assert.ok(virginBill && o2Bill);

  const engine = buildEngine(dataset);
  const before = [engine.billAmount(virginBill, 2026, 11), engine.billAmount(o2Bill, 2026, 11)];

  for (const key of ['virgin', 'o2']) {
    const provider = dataset.providers[key] as TelcoProvider & { statement: any[] };
    const opening = telcoOpeningPence(provider.statement);
    rowOf(provider.statement, 'Dec')!.paymentPence = 5000;
    recalculateTelco(provider, opening);
  }

  const after = buildEngine(dataset);
  assert.deepEqual(
    [after.billAmount(virginBill, 2026, 11), after.billAmount(o2Bill, 2026, 11)],
    before,
    'charges, not payments, drive the linked bill amounts',
  );
});
