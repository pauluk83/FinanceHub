import test from 'node:test';
import assert from 'node:assert/strict';
import { repairDataset } from '../core/datasetSchema.ts';
import { mergeProviderSeed } from '../core/providerMerge.ts';

const settings = {
  targetYear: 2026,
  monthsInYear: 12,
  currency: '£',
  asOfDate: '2026-11-19',
  lockCutoff: '2026-11-01',
  anchorDate: '2026-07-08',
};

function documentWith(extra: Record<string, unknown> = {}) {
  return {
    settings: { ...settings },
    accounts: [{ name: 'Starling' }],
    people: [], cards: [], bills: [], billChanges: [], transactions: [],
    debts: [], savings: [], assets: [], importRules: [], importBatches: [],
    recurringDismissed: [], csvProfiles: [], categories: [], changelog: [], audit: [],
    holidays: {}, providers: {}, monthLocks: {},
    ...extra,
  };
}

test('a document with missing collections opens with empty ones', () => {
  const result = repairDataset({ settings: { ...settings } });
  assert.ok(result);
  assert.equal(result!.dataset.transactions.length, 0);
  assert.equal(result!.dataset.accounts.length, 0);
  assert.deepEqual(result!.dataset.monthLocks, {});
  assert.ok(result!.repairs.length >= 10);
});

test('unreadable rows and providers are removed instead of reaching the engine', () => {
  const result = repairDataset(documentWith({
    transactions: [
      { row: 1, date: '2026-11-19', account: 'Starling', type: 'Expense', amountPence: 100 },
      null,
      { row: 2, date: 'not-a-date', account: 'Starling', amountPence: 200 },
      { row: 3, date: '2026-11-18', account: '', amountPence: 300 },
    ],
    bills: [{ name: 'Rent' }, { amountPence: 1 }],
    providers: {
      water: { statement: [{ month: 'Jan', amountPence: 1 }, null] },
      ovo: 'broken',
    },
  }));
  assert.ok(result);
  assert.equal(result!.dataset.transactions.length, 1);
  assert.equal(result!.dataset.bills.length, 1);
  assert.equal(result!.dataset.providers.water.statement.length, 1);
  assert.equal('ovo' in result!.dataset.providers, false);
  assert.ok(result!.repairs.some((repair) => /unreadable water statement row/.test(repair)));
  assert.ok(result!.repairs.some((repair) => /provider ovo was unreadable/.test(repair)));
});

test('usable values, including settings, are left exactly as saved', () => {
  const input = documentWith({
    transactions: [{ row: 1, date: '2026-11-19', account: 'Starling', type: 'Expense', amountPence: 1234 }],
    settings: { ...settings, targetYear: 2027, currency: '€' },
  });
  const result = repairDataset(input);
  assert.ok(result);
  assert.equal(result!.dataset.settings.targetYear, 2027);
  assert.equal(result!.dataset.settings.currency, '€');
  assert.equal(result!.dataset.transactions[0].amountPence, 1234);
  assert.equal(result!.repairs.length, 0);
});

test('the repair is recorded in the document metadata, newest last and bounded', () => {
  const result = repairDataset(documentWith({ transactions: [null] }));
  assert.ok(result);
  assert.ok(Array.isArray(result!.dataset.meta?.schemaRepairs));
  const many = repairDataset(documentWith({ meta: { schemaRepairs: Array.from({ length: 30 }, (_, i) => `old ${i}`) }, transactions: [null] }));
  assert.ok(many);
  assert.equal(many!.dataset.meta!.schemaRepairs.length, 20);
});

test('a seed fills missing provider fields but never overwrites a saved edit', () => {
  const saved = { displayName: 'Thames Water (mine)', accountNumber: '', website: 'https://example.test' };
  const seed = { displayName: 'Thames Water', accountNumber: '12345', website: 'https://thameswater.co.uk', contract: { term: 12 } };
  const { next, changed } = mergeProviderSeed(saved, seed);
  assert.equal(changed, true);
  assert.equal(next.displayName, 'Thames Water (mine)');
  assert.equal(next.website, 'https://example.test');
  assert.equal(next.accountNumber, '12345');
  assert.deepEqual(next.contract, { term: 12 });

  const withContract = mergeProviderSeed({ ...saved, contract: { term: 24 } }, seed);
  assert.deepEqual(withContract.next.contract, { term: 24 });
  assert.equal(withContract.changed, true);

  const complete = mergeProviderSeed({ displayName: 'x', accountNumber: '1', website: 'w', contract: {} }, seed);
  assert.equal(complete.changed, false);
});
