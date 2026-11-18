import assert from 'node:assert/strict';
import test from 'node:test';
import { globalSearch } from '../core/search.ts';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { baseDataset } from './support/dataset.ts';

function context(): { ds: Dataset; engine: ReturnType<typeof buildEngine> } {
  const ds = baseDataset();
  ds.transactions = [
    { row: 1, date: '2026-11-02', account: 'Starling', type: 'Expense', amountPence: 1250, comments: 'Tesco groceries', status: '', budgetTreatment: '', category: 'Food', tags: ['weekly'] },
    { row: 2, date: '2026-11-03', account: 'Starling', type: 'Income', amountPence: 5000, comments: 'Refund from Tesco', status: '', budgetTreatment: 'Refund' },
    { row: 3, date: '2026-11-04', account: 'Starling', type: 'Expense', amountPence: 0, comments: 'Merged Tesco row', status: '', budgetTreatment: '', mergedIntoRow: 1 },
  ];
  ds.bills = [{ name: 'Tesco Mobile', amountPence: 1200, dueDay: 8, linkedSheet: '', frequency: 'Monthly', latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true, effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 1200, baseDueDay: 8 }];
  ds.people = [{ shortName: 'Dan', fullName: 'Dan Tesco', openingPence: 0, sortOrder: 1, active: true }];
  ds.accounts = [{ name: 'Starling', targetPence: 0, openingPence: 100000, sortOrder: 1, active: true }];
  ds.cards = [{ name: 'Tesco Bank Card', limitPence: 100000, openingPence: 0, sortOrder: 1, active: true }];
  ds.debts = [{ id: 'd1', name: 'Tesco Loan', balancePence: 50000, monthlyPaymentPence: 5000 }];
  ds.savings = [{ id: 's1', name: 'Tesco Saver', balancePence: 20000 }];
  ds.providers = { ovo: { displayName: 'Ovo Energy' } };
  ds.holidays = { 2026: [{ name: 'Tesco trip', start: '2026-12-01', end: '2026-12-03' }] };
  return { ds, engine: buildEngine(ds) };
}

test('a short query returns nothing so the palette keeps its navigation', () => {
  const { ds, engine } = context();
  assert.deepEqual(globalSearch(ds, engine, 't'), []);
  assert.deepEqual(globalSearch(ds, engine, '   '), []);
});

test('search spans the ledger and ranks title prefixes first', () => {
  const { ds, engine } = context();
  const results = globalSearch(ds, engine, 'tesco');
  const kinds = new Set(results.map((result) => result.kind));
  assert.ok(kinds.has('transaction'));
  assert.ok(kinds.has('bill'));
  assert.ok(kinds.has('person'));
  assert.ok(kinds.has('card'));
  assert.ok(kinds.has('debt'));
  assert.ok(kinds.has('saving'));
  assert.ok(kinds.has('holiday'));
  assert.equal(results[0].score, 0);
  assert.ok(results.some((result) => result.kind === 'bill' && result.title === 'Tesco Mobile'));
});

test('merged transactions and non-matching entities stay out', () => {
  const { ds, engine } = context();
  const results = globalSearch(ds, engine, 'merged');
  assert.equal(results.length, 0);
  const ovo = globalSearch(ds, engine, 'ovo');
  assert.equal(ovo[0].kind, 'provider');
  assert.equal(ovo[0].view, 'ovo');
});

test('the limit is honoured and matching is case-insensitive', () => {
  const { ds, engine } = context();
  const results = globalSearch(ds, engine, 'TES', 3);
  assert.equal(results.length, 3);
  assert.ok(results.every((result) => result.title.toLocaleLowerCase('en-GB').includes('tes')
    || result.detail.toLocaleLowerCase('en-GB').includes('tes')));
});
