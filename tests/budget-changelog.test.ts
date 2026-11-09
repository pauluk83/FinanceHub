import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APP_FEATURE_NOTE_SIGNATURES,
  changedBudgetSections,
  withoutAppFeatureNotes,
  withoutLegacyAppUpdateNotes,
} from '../app/src/budgetChangelog.ts';
import type { Dataset } from '../core/engine.ts';

const seed = JSON.parse(readFileSync(new URL('../data/workbook.json', import.meta.url), 'utf8')) as Dataset;
const clone = () => structuredClone(seed);

test('interface-only settings changes create no budget changelog entry', () => {
  const before = clone();
  const after = structuredClone(before);
  after.settings.navLayout = { hidden: ['bills'], groups: { savings: 'Tools' } };
  assert.deepEqual(changedBudgetSections(before, after), []);
});

test('budget settings changes are recorded', () => {
  const before = clone();
  const after = structuredClone(before);
  after.settings.targetYear = before.settings.targetYear + 1;
  assert.deepEqual(changedBudgetSections(before, after), ['Settings']);
});

test('money changes name the section they touch', () => {
  const before = clone();
  const after = structuredClone(before);
  after.transactions[0].amountPence += 1;
  assert.deepEqual(changedBudgetSections(before, after), ['Transactions']);

  const locks = structuredClone(before);
  locks.monthLocks = { ...(locks.monthLocks ?? {}), '2026-11': { lockedAt: '2026-11-30', incomePence: 0, expensesPence: 0, netPence: 0, owedPence: 0 } };
  assert.deepEqual(changedBudgetSections(before, locks), ['Month locks']);
});

test('reference-only differences are not budget changes', () => {
  const before = clone();
  const after = structuredClone(before);
  after.reference = { ...(after.reference ?? {}), note: 'workbook annotation' };
  assert.deepEqual(changedBudgetSections(before, after), []);
});

test('the legacy App update / Auto updates entry is removed without touching budget entries', () => {
  const kept = withoutLegacyAppUpdateNotes([
    { sheetCell: 'App update', description: 'Auto updates' },
    { sheetCell: 'Auto updates', description: 'App update' },
    { sheetCell: 'App update', description: 'Updated Bills; balances recalculated.', auto: true },
    { sheetCell: 'Auto updates', description: 'Holiday paid' },
    { sheetCell: 'App update', description: 'Changed', details: ['Auto updates'] },
  ]);
  assert.deepEqual(kept.map((entry) => `${entry.sheetCell}: ${entry.description}`), [
    'App update: Updated Bills; balances recalculated.',
    'Auto updates: Holiday paid',
  ]);
});

test('app-feature notes are removed but budget entries and custom notes stay', () => {
  const entries = [
    ...APP_FEATURE_NOTE_SIGNATURES.map((signature) => ({ signature, sheetCell: 'App feature' })),
    { signature: 'financehub-2026-11-07-starling', sheetCell: 'Starling balance corrected' },
    { signature: 'financehub-2026-11-07-rent-tables', sheetCell: 'November rent and table fixes' },
    { sheetCell: 'Reconciled October', custom: true },
    { sheetCell: 'Imported workbook note' },
  ];
  const kept = withoutAppFeatureNotes(entries);
  assert.deepEqual(kept.map((entry) => entry.sheetCell), [
    'Starling balance corrected',
    'November rent and table fixes',
    'Reconciled October',
    'Imported workbook note',
  ]);
});
