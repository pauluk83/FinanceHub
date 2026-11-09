import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendRow,
  baselineFor,
  clearRowOrder,
  hasManualOrder,
  recalculate,
  reorderRows,
  sortRows,
  type LedgerConfig,
} from '../app/src/providerLedger.ts';
import { recalculateTelco } from '../core/telco.ts';

const cashflow: LedgerConfig = {
  rowsKey: 'statement',
  formula: 'cashflow',
  monthly: true,
  note: '',
  defaults: {},
  columns: [],
};

const dated: LedgerConfig = {
  rowsKey: 'entries',
  formula: 'amount',
  monthly: false,
  note: '',
  defaults: {},
  columns: [],
};

const savings: LedgerConfig = {
  rowsKey: 'statement',
  formula: 'savings',
  monthly: true,
  note: '',
  defaults: {},
  columns: [],
};

test('moving a monthly row keeps the carry-forward and recalculates every balance', () => {
  const rows = [
    { month: 'Jan', paymentPence: 10_000, billAmountPence: 0, balancePence: 11_000 },
    { month: 'Feb', paymentPence: 10_000, billAmountPence: 5_000, balancePence: 16_000 },
    { month: 'Mar', paymentPence: 0, billAmountPence: 10_000, balancePence: 6_000 },
  ];
  const baseline = baselineFor(cashflow, rows);

  assert.equal(baseline, 1_000);
  assert.equal(reorderRows(rows, 0, 1), true);
  recalculate(cashflow, rows, baseline);

  assert.deepEqual(rows.map((row) => row.month), ['Feb', 'Jan', 'Mar']);
  assert.deepEqual(rows.map((row) => row.balancePence), [6_000, 16_000, 6_000]);
  assert.equal(rows.at(-1)?.balancePence, 6_000);
  assert.equal(hasManualOrder(rows), true);
});

test('manual order survives a later sort and new rows are appended', () => {
  const rows = [
    { month: 'Jan', paymentPence: 10_000, billAmountPence: 0, balancePence: 11_000 },
    { month: 'Feb', paymentPence: 10_000, billAmountPence: 5_000, balancePence: 16_000 },
  ];
  reorderRows(rows, 0, 1);
  sortRows(rows, cashflow);
  assert.deepEqual(rows.map((row) => row.month), ['Feb', 'Jan']);

  appendRow(rows, { month: 'Mar', paymentPence: 0, billAmountPence: 0, balancePence: 0 }, cashflow);
  assert.deepEqual(rows.map((row) => row.month), ['Feb', 'Jan', 'Mar']);
  assert.equal(rows.at(-1)?.sortIndex, 2);

  clearRowOrder(rows, cashflow);
  assert.deepEqual(rows.map((row) => row.month), ['Jan', 'Feb', 'Mar']);
  assert.equal(hasManualOrder(rows), false);
});

test('dated rows can move without changing the closing balance', () => {
  const rows = [
    { date: '2026-01-31', amountPence: 10_000, balancePence: 10_000 },
    { date: '2026-02-28', amountPence: -4_000, balancePence: 6_000 },
  ];
  const baseline = baselineFor(dated, rows);

  assert.equal(reorderRows(rows, 1, -1), true);
  recalculate(dated, rows, baseline);
  assert.deepEqual(rows.map((row) => row.date), ['2026-02-28', '2026-01-31']);
  assert.deepEqual(rows.map((row) => row.balancePence), [-4_000, 6_000]);
  assert.equal(rows.at(-1)?.balancePence, 6_000);

  clearRowOrder(rows, dated);
  assert.deepEqual(rows.map((row) => row.date), ['2026-01-31', '2026-02-28']);
});

test('a manually entered balance anchors later rows and can be cleared', () => {
  const rows = [
    { month: 'Jan', paymentPence: 10_000, billAmountPence: 0, balancePence: 11_000 },
    { month: 'Feb', paymentPence: 10_000, billAmountPence: 5_000, balancePence: 16_000 },
    { month: 'Mar', paymentPence: 0, billAmountPence: 10_000, balancePence: 6_000 },
  ];
  const baseline = baselineFor(cashflow, rows);

  rows[0].balanceOverridePence = 5_000;
  recalculate(cashflow, rows, baseline);
  assert.deepEqual(rows.map((row) => row.balancePence), [5_000, 10_000, 0]);

  delete rows[0].balanceOverridePence;
  recalculate(cashflow, rows, baseline);
  assert.deepEqual(rows.map((row) => row.balancePence), [11_000, 16_000, 6_000]);
});

test('a stored opening baseline survives a manual balance override', () => {
  const rows = [
    { month: 'Jan', paymentPence: 10_000, billAmountPence: 0, balancePence: 11_000 },
    { month: 'Feb', paymentPence: 10_000, billAmountPence: 5_000, balancePence: 16_000 },
  ];
  const stored = baselineFor(cashflow, rows);
  rows[0].balanceOverridePence = 5_000;
  recalculate(cashflow, rows, stored);
  delete rows[0].balanceOverridePence;
  recalculate(cashflow, rows, baselineFor(cashflow, rows, stored));
  assert.deepEqual(rows.map((row) => row.balancePence), [11_000, 16_000]);
});

test('telco recalculation respects a manually entered balance', () => {
  const provider = {
    statement: [
      { month: 'Jan', amountPence: 1_000, paymentPence: 0, balanceOverridePence: 5_000 },
      { month: 'Feb', amountPence: 1_000, paymentPence: 0 },
    ],
    contract: { contractAmountPence: 10_000 },
  };
  recalculateTelco(provider, 0);
  assert.deepEqual(provider.statement.map((row) => row.balancePence), [5_000, 4_000]);
  assert.equal(provider.contract.paymentsPence, 0);
});

test('total paid can be anchored and cleared without moving a balance', () => {
  const rows = [
    { month: 'Jan', paymentPence: 5_000, balancePence: 50_000, totalPaidPence: 5_000 },
    { month: 'Feb', paymentPence: 5_000, balancePence: 45_000, totalPaidPence: 10_000 },
  ];
  const baseline = baselineFor(savings, rows);

  rows[0].totalPaidOverridePence = 1_000;
  recalculate(savings, rows, baseline);
  assert.deepEqual(rows.map((row) => row.totalPaidPence), [1_000, 6_000]);
  assert.deepEqual(rows.map((row) => row.balancePence), [50_000, 45_000], 'balances are untouched by a total-paid anchor');

  delete rows[0].totalPaidOverridePence;
  recalculate(savings, rows, baseline);
  assert.deepEqual(rows.map((row) => row.totalPaidPence), [5_000, 10_000], 'clearing the anchor restores the automatic total');
});

test('a new savings plan starts its own total', () => {
  const rows = [
    { month: 'Aug', paymentPence: 5_000, balancePence: 5_000, totalPaidPence: 5_000 },
    { month: 'Sep', paymentPence: 5_000, balancePence: 0, totalPaidPence: 10_000 },
    { month: 'Oct', paymentPence: 7_500, balancePence: 10_000, totalPaidPence: 7_500 },
    { month: 'Nov', paymentPence: 5_000, balancePence: 5_000, totalPaidPence: 12_500 },
  ];
  recalculate(savings, rows, baselineFor(savings, rows));
  assert.deepEqual(rows.map((row) => row.balancePence), [5_000, 0, 10_000, 5_000]);
  assert.deepEqual(rows.map((row) => row.totalPaidPence), [5_000, 10_000, 7_500, 12_500], 'the paid-off cycle resets before the new plan');
});

test('reordering cannot escape the ledger', () => {
  const rows = [{ month: 'Jan' }, { month: 'Feb' }];
  assert.equal(reorderRows(rows, 0, -1), false);
  assert.equal(reorderRows(rows, 1, 1), false);
  assert.deepEqual(rows.map((row) => row.month), ['Jan', 'Feb']);
});
