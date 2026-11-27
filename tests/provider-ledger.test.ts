import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendRow,
  baselineFor,
  billPeriodMonths,
  billingCadenceMonths,
  billedTotalPence,
  billingMonthsFor,
  blankCell,
  markPaidRows,
  monthRank,
  quietPlanRows,
  clearRowOrder,
  hasManualOrder,
  recalculate,
  recordBill,
  reorderRows,
  sortRows,
  usagePenceFor,
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

test('recording a bill fills its period once and returns the true figures', () => {
  const rows = [
    { month: 'Sep', billPeriod: '17 Sep - 16 Oct', billAmountPence: 68_192, paymentPence: 10_900, balancePence: 30_956 },
    { month: 'Oct', billPeriod: '17 Oct - 16 Nov', billAmountPence: 0, paymentPence: 10_900, balancePence: 41_856 },
    { month: 'Nov', billPeriod: '17 Nov - 16 Dec', billAmountPence: 0, paymentPence: 10_900, balancePence: 52_756 },
  ];
  const baseline = baselineFor(cashflow, rows);
  const bill = { month: 'Oct', billPeriod: '17 Oct - 16 Nov', billAmountPence: 9_886, creditPence: 15_000 };

  assert.equal(recordBill(cashflow, rows, bill, baseline), true);
  assert.equal(rows[1].billAmountPence, 9_886);
  assert.equal(rows[1].balancePence, 46_970);
  assert.equal(rows[2].balancePence, 57_870);
  assert.equal(usagePenceFor(rows[1]), 9_886);

  // The same statement cannot be charged twice.
  assert.equal(recordBill(cashflow, rows, bill, baseline), false);
  assert.equal(rows[1].balancePence, 46_970);
});

test('a bill credit lifts the balance without counting as energy use', () => {
  // OVO's 17 Oct - 16 Nov 2026 statement: £98.86 of energy, less a £150 Warm Home Discount.
  // September carries the £629 refund, its own flow after the £52.92 bill.
  const rows = [
    { month: 'Sep', paymentPence: 10_900, billAmountPence: 5_292, refundPence: 62_900, creditPence: 0, balancePence: 30_956 },
    { month: 'Oct', paymentPence: 10_900, billAmountPence: 9_886, creditPence: 15_000, balancePence: 0 },
  ];
  const baseline = baselineFor(cashflow, rows);
  recalculate(cashflow, rows, baseline);

  assert.equal(baseline, 88_248);
  assert.equal(rows[0].balancePence, 30_956);
  assert.equal(rows[1].balancePence, 46_970);
  assert.equal(usagePenceFor(rows[1]), 9_886);
  assert.equal(usagePenceFor(rows[0]), 5_292, 'the refund is not part of the bill');

  // A row with no credit keeps the old arithmetic exactly.
  const plain = [{ month: 'Nov', paymentPence: 10_900, billAmountPence: 5_000, balancePence: 0 }];
  recalculate(cashflow, plain, 0);
  assert.equal(plain[0].balancePence, 5_900);
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

test('a refund is its own flow: the bill is the usage and the balance moves by it', () => {
  const rows = [
    { month: 'Aug', billAmountPence: 0, paymentPence: 10_900, balancePence: 88_248 },
    { month: 'Sep', billAmountPence: 5_292, refundPence: 62_900, paymentPence: 10_900, balancePence: 0 },
  ];
  recalculate(cashflow, rows, baselineFor(cashflow, rows));

  assert.equal(usagePenceFor(rows[1]), 5_292, 'September used £52.92');
  assert.equal(rows[1].balancePence, 30_956, 'the £629 refund comes off the balance');
  assert.equal(usagePenceFor({ month: 'Aug', billAmountPence: 4_237 }), 4_237);
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

test('a bill period says how many months its bill covers', () => {
  // Water bills twice a year, and both workbook forms are in use.
  assert.equal(billPeriodMonths('15/09/25-11/03/26'), 6);
  assert.equal(billPeriodMonths('12/03/26-09/09/26'), 6);
  assert.equal(billPeriodMonths('17 Jan - 16 Feb'), 1);
  assert.equal(billPeriodMonths('17 Dec - 16 Jan'), 1);
  assert.equal(billPeriodMonths('', 1), 1, 'a missing period falls back to one month');
  assert.equal(billPeriodMonths('not a period', 1), 1);

  const water = [
    { month: 'Mar', billPeriod: '15/09/25-11/03/26', billAmountPence: 13_491 },
    { month: 'Sep', billPeriod: '12/03/26-09/09/26', billAmountPence: 17_673 },
  ];
  assert.equal(billingMonthsFor(water), 12, 'two six-month bills are twelve months of service');
  assert.equal(billingCadenceMonths(water), 6);

  const ovo = [
    { month: 'Jan', billPeriod: '17 Jan - 16 Feb', billAmountPence: 11_256 },
    { month: 'Feb', billPeriod: '17 Feb - 16 Mar', billAmountPence: 8_486 },
  ];
  assert.equal(billingMonthsFor(ovo), 2);
  assert.equal(billingCadenceMonths(ovo), 1);
});

test('reordering cannot escape the ledger', () => {
  const rows = [{ month: 'Jan' }, { month: 'Feb' }];
  assert.equal(reorderRows(rows, 0, -1), false);
  assert.equal(reorderRows(rows, 1, 1), false);
  assert.deepEqual(rows.map((row) => row.month), ['Jan', 'Feb']);
});

test('the yearly bill total adds every row that carries a bill', () => {
  const rows = [
    { month: 'Jan', billAmountPence: 11_256, refundPence: 0 },
    { month: 'Feb', billAmountPence: 8_486 },
    { month: 'Mar', billAmountPence: 0 },
    { month: 'Apr', billAmountPence: 5_292, refundPence: 62_900 },
  ];
  assert.equal(billedTotalPence(rows), 25_034, 'a refund is not a bill');
  assert.equal(billedTotalPence([]), 0);
  assert.equal(billedTotalPence([{ month: 'May' }]), 0, 'a row with no bill adds nothing');
});

test('a zero is blanked only from the month a column says', () => {
  const column = { blankZeroFrom: '2028-10' };
  assert.equal(blankCell(column, 0, 2028, 9), false, 'September 2028 still shows its figure');
  assert.equal(blankCell(column, 0, 2028, 10), true, 'October 2028 onwards reads blank');
  assert.equal(blankCell(column, 0, 2040, 1), true);
  assert.equal(blankCell(column, 0, 2026, 12), false, 'earlier years are untouched');
  assert.equal(blankCell({ blankZero: true }, 0, 2026, 1), true, 'an always-blank column ignores the month');
  assert.equal(blankCell({}, 0, 2028, 10), false, 'a plain column keeps £0.00');
  assert.equal(blankCell(column, 4_400, 2028, 10), false, 'a real figure is never hidden by a zero rule');
});

test('a column blanked from a month hides whatever it holds', () => {
  const column = { blankFrom: '2028-10' };
  assert.equal(blankCell(column, -85_477, 2028, 9), false, 'September still shows the balance');
  assert.equal(blankCell(column, -85_477, 2028, 10), true, 'October is blank even with a balance');
  assert.equal(blankCell(column, 0, 2040, 6), true);
  assert.equal(blankCell(column, -85_477, 2026, 10), false, 'earlier years keep their balance');
});

test('a line labelled Opening Balance anchors the plan without the flag', () => {
  const savings: LedgerConfig = { rowsKey: 'statement', formula: 'savings', monthly: true, note: '', defaults: {}, columns: [] };
  const rows = [
    { month: 'Jan', paymentPence: 0 },
    { month: 'Opening Balance', paymentPence: 0, balancePence: 179_500, balanceOverridePence: 179_500 },
    { month: 'Aug', paymentPence: 9_500 },
    { month: 'Sep', paymentPence: 10_000 },
  ];
  const quiet = quietPlanRows(rows);
  assert.equal(quiet[1], false, 'the opening line prints its figure');
  assert.equal(quiet[2], false, 'and so do the months after it');
  recalculate(savings, rows, 0);
  assert.equal(rows[1].balancePence, 179_500, 'the opening line is the anchor');
  assert.equal(rows[2].balancePence, 170_000, 'the first payment comes off it');
  assert.equal(rows[3].balancePence, 160_000, 'and so does the next');
});

test('a provider month ticks off on the bill\'s own due date', () => {
  const rows = [{ month: 'Nov', paymentPence: 4400 }, { month: 'Dec', paymentPence: 4400 }];
  const early = markPaidRows(rows, 2026, '2026-11-13', { Nov: '2026-11-14', Dec: '2026-12-14' });
  assert.equal(early[0].paid, '', 'the month has started but the bill is not due');
  assert.equal(early[1].paid, '');

  const due = markPaidRows(rows, 2026, '2026-11-14', { Nov: '2026-11-14', Dec: '2026-12-14' });
  assert.equal(due[0].paid, '✓ Yes', 'ticked on its due date');
  assert.equal(due[1].paid, '', 'later months stay blank');

  const unpaid = markPaidRows([{ month: 'Nov', paymentPence: 0 }], 2026, '2026-11-30', { Nov: '2026-11-14' });
  assert.equal(unpaid[0].paid, '', 'a month with no payment never ticks');
});

test('an opening balance for a new plan sorts after August', () => {
  assert.ok(monthRank('2027 Opening Balance') > monthRank('Aug'), 'the line follows August');
  assert.ok(monthRank('2027 Opening Balance') < monthRank('Sep'), 'and leads September');
  assert.equal(monthRank('Opening Balance'), -1, 'a sheet-wide opening line still comes first');
});

const planRow = (month: string, paymentPence = 0, balancePence = 0, opening = false, balanceOverridePence?: number) => ({
  month, paymentPence, balancePence, totalPaidPence: 0, opening, ...(balanceOverridePence === undefined ? {} : { balanceOverridePence }),
});
const paidYear = () => [
  ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'].map((month) => planRow(month, 5_000)),
  planRow('2027 Opening Balance', 0, 0, true),
  ...['Sep', 'Oct', 'Nov', 'Dec'].map((month) => planRow(month)),
];

test('a paid-off year keeps the months after August empty', () => {
  assert.deepEqual(quietPlanRows(paidYear()), [...Array(8).fill(false), true, true, true, true, true]);
});

test('a typed opening balance shows on its own line but not down the empty months', () => {
  const rows = paidYear();
  rows[8].balanceOverridePence = 50_000;
  rows[8].balancePence = 50_000;
  assert.deepEqual(quietPlanRows(rows), [...Array(8).fill(false), false, true, true, true, true]);
});

test('the months fill in from the first payment after the opening balance', () => {
  const rows = paidYear();
  rows[8].balanceOverridePence = 50_000;
  rows[8].balancePence = 50_000;
  rows[10].paymentPence = 10_500;
  assert.deepEqual(quietPlanRows(rows).slice(9), [true, false, false, false]);
});

test('a later year with nothing paid into it is empty, carried balance and all', () => {
  const rows = [
    ...['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'].map((month) => planRow(month, 0, 10_500)),
    planRow('2028 Opening Balance', 0, 10_500, true),
    ...['Sep', 'Oct', 'Nov', 'Dec'].map((month) => planRow(month, 0, 10_500)),
  ];
  assert.deepEqual(quietPlanRows(rows), Array(13).fill(true), 'nothing is printed until a payment is entered');
});

test('a later year shows its figures once a payment is entered', () => {
  const rows = [
    planRow('Jan', 10_500, 39_500),
    ...['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'].map((month) => planRow(month, 0, 39_500)),
    planRow('2028 Opening Balance', 0, 39_500, true),
    ...['Sep', 'Oct', 'Nov', 'Dec'].map((month) => planRow(month)),
  ];
  assert.deepEqual(quietPlanRows(rows), [...Array(8).fill(false), true, true, true, true, true]);
});

const monthsOf = (year: number, payments: Record<string, number> = {}) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  .map((month) => planRow(month, payments[month] ?? 5_000));

test('months are marked paid once the as-of date reaches them', () => {
  const marked = markPaidRows(monthsOf(2026), 2026, '2026-11-25');
  assert.deepEqual(marked.slice(0, 11).map((row: any) => row.status), Array(11).fill('Paid'));
  assert.deepEqual(marked.slice(0, 11).map((row: any) => row.paid), Array(11).fill('✓ Yes'));
  assert.equal(marked[11].status, '', 'December has not arrived yet');
  assert.equal(marked[11].paid, '');
});

test('a year that has not started says nothing at all', () => {
  const marked = markPaidRows(monthsOf(2027), 2027, '2026-11-25');
  assert.deepEqual(marked.map((row: any) => row.status), Array(12).fill(''));
  assert.deepEqual(marked.map((row: any) => row.paid), Array(12).fill(''));
});

test('later months fill in as their dates arrive', () => {
  const marked = markPaidRows(monthsOf(2027), 2027, '2027-03-15');
  assert.deepEqual(marked.map((row: any) => row.status), ['Paid', 'Paid', 'Paid', ...Array(9).fill('')]);
});

test('a month with no payment is not called paid', () => {
  const marked = markPaidRows(monthsOf(2027, { Jan: 0 }), 2027, '2027-03-15');
  assert.equal(marked[0].status, '', 'nothing was paid in January');
  assert.equal(marked[1].status, 'Paid');
});
