import test from 'node:test';
import assert from 'node:assert/strict';
import { activeRecurring, billPrefill, recurringSuggestions } from '../core/recurring.ts';
import type { Dataset, Tx } from '../core/engine.ts';

function dataset(transactions: Tx[], bills: Dataset['bills'] = []): Dataset {
  return {
    settings: {
      targetYear: 2026, startMonth: 1, monthsInYear: 12, currency: '£',
      asOfDate: '2026-11-18', lockCutoff: '2026-11-01', anchorDate: '2026-11-01',
    },
    accounts: [], people: [], cards: [], bills, billChanges: [],
    incomeSchedules: { pip: [], uc: [] }, transactions, providers: {}, monthLocks: {},
  };
}

function expense(row: number, date: string, comments: string, amountPence: number): Tx {
  return { row, date, account: 'Current', type: 'Expense', amountPence, comments, status: '', budgetTreatment: '' };
}

const monthly = (comments: string, amount = 1_599, dates = ['2026-08-14', '2026-09-14', '2026-10-14', '2026-11-14']) =>
  dates.map((date, index) => expense(index + 1, date, comments, amount));

test('four regular monthly charges become a high-confidence suggestion', () => {
  const found = recurringSuggestions(dataset(monthly('NETFLIX.COM 1234')));
  assert.equal(found.length, 1);
  assert.equal(found[0].cadence, 'monthly');
  assert.equal(found[0].occurrences, 4);
  assert.equal(found[0].confidence, 'high');
  assert.equal(found[0].amountPence, 1_599);
  assert.equal(found[0].nextExpectedDate, '2026-12-15', 'a 31-day median interval from 14 November');
});

test('two charges are not enough to call something recurring', () => {
  const found = recurringSuggestions(dataset(monthly('SPOTIFY', 1_099, ['2026-10-02', '2026-11-02'])));
  assert.equal(found.length, 0);
});

test('a series that stopped more than 45 days ago is left out', () => {
  const found = recurringSuggestions(
    dataset(monthly('OLD GYM', 3_000, ['2026-06-01', '2026-07-01', '2026-08-01'])),
    '2026-11-18',
  );
  assert.equal(found.length, 0);
});

test('a price rise is reported against the earlier charges', () => {
  const rows = [
    expense(1, '2026-08-05', 'BROADBAND LTD', 3_200),
    expense(2, '2026-09-05', 'BROADBAND LTD', 3_200),
    expense(3, '2026-10-05', 'BROADBAND LTD', 3_200),
    expense(4, '2026-11-05', 'BROADBAND LTD', 3_600),
  ];
  const [found] = recurringSuggestions(dataset(rows));
  assert.equal(found.priceChangePence, 400);
  assert.equal(found.previousAmountPence, 3_200);
});

test('an existing bill suppresses the suggestion', () => {
  const ds = dataset(monthly('NETFLIX.COM 1234'), [{
    name: 'Netflix', amountPence: 1_599, dueDay: 14, linkedSheet: '', frequency: 'Monthly',
    latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
    effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 1_599, baseDueDay: 14,
  }]);
  const [found] = recurringSuggestions(ds);
  assert.equal(found.suppressedBy, 'Netflix');
  assert.equal(activeRecurring(ds).length, 0);
});

test('an ignored merchant stays dismissed until it is restored', () => {
  const ds = dataset(monthly('NETFLIX.COM 1234'));
  ds.recurringDismissed = ['netflix.com'];
  assert.equal(recurringSuggestions(ds).length, 0);
  assert.equal(recurringSuggestions(ds, ds.settings.asOfDate, { includeDismissed: true }).length, 1);
});

test('a suggestion prefills a monthly bill without writing anything', () => {
  const [found] = recurringSuggestions(dataset(monthly('NETFLIX.COM 1234')));
  const prefill = billPrefill(found);
  assert.equal(prefill.amountPence, 1_599);
  assert.equal(prefill.dueDay, 14);
  assert.equal(prefill.frequency, 'Monthly');
  assert.equal(prefill.linkedSheet, '');
});
