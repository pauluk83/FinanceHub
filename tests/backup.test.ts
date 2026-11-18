import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decodeBackupDataset } from '../app/src/backup.ts';
import { buildEngine } from '../core/engine.ts';
import { shouldCreateAutomaticBackup } from '../core/backupSchedule.ts';

const valid = {
  settings: {
    targetYear: 2026,
    startMonth: 1,
    monthsInYear: 12,
    currency: '£',
    asOfDate: '2026-11-06',
    lockCutoff: '2026-11-01',
    anchorDate: '2026-07-08',
  },
  accounts: [],
  people: [],
  cards: [],
  bills: [],
  billChanges: [],
  transactions: [],
  holidays: {},
  providers: {},
  incomeSchedules: { pip: [], uc: [] },
  monthLocks: {},
  changelog: [],
  audit: [],
};

test('a full JSON backup is accepted and detached from its source', () => {
  const decoded = decodeBackupDataset(JSON.stringify(valid));
  assert.ok(decoded);
  assert.deepEqual(decoded.accounts, []);
  const source = structuredClone(valid);
  const fromObject = decodeBackupDataset(source);
  assert.ok(fromObject);
  assert.notEqual(fromObject, source);
});

test('a backup without monthLocks is accepted with an empty lock map', () => {
  const { monthLocks: _monthLocks, ...withoutLocks } = valid;
  const decoded = decodeBackupDataset(withoutLocks);
  assert.ok(decoded);
  assert.deepEqual(decoded.monthLocks, {});
});

test('restoring the workbook backup reproduces the live figures', () => {
  const seed = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'));
  const restored = decodeBackupDataset(JSON.stringify(seed));
  assert.ok(restored, 'the canonical workbook is a valid backup');
  const before = buildEngine(seed);
  const after = buildEngine(restored);
  const asOf = seed.settings.asOfDate;
  assert.equal(after.starlingBalance(asOf), before.starlingBalance(asOf));
  assert.equal(after.dashboard(2026, 11).current.incomePence, before.dashboard(2026, 11).current.incomePence);
  assert.equal(after.dashboard(2026, 11).current.expensesPence, before.dashboard(2026, 11).current.expensesPence);
  assert.equal(after.dashboard(2026, 11).current.netPence, before.dashboard(2026, 11).current.netPence);
  assert.equal(after.dashboard(2026, 11).totalOwedPence, before.dashboard(2026, 11).totalOwedPence);
  assert.equal(after.dashboard(2026, 11).billsTotalPence, before.dashboard(2026, 11).billsTotalPence);
  for (let month = 1; month <= 12; month++) {
    assert.deepEqual(after.monthlySummary(2026, month), before.monthlySummary(2026, month), `month ${month}`);
  }
});

test('a backup with missing or malformed data is rejected', () => {
  assert.equal(decodeBackupDataset('not json'), null);
  assert.equal(decodeBackupDataset({ ...valid, settings: null }), null);
  assert.equal(decodeBackupDataset({ ...valid, transactions: null }), null);
  assert.equal(decodeBackupDataset({ ...valid, holidays: [] }), null);
  assert.equal(decodeBackupDataset({ ...valid, monthLocks: [] }), null);
  assert.equal(decodeBackupDataset({
    ...valid,
    settings: { ...valid.settings, asOfDate: '06/11/2026' },
  }), null);
  assert.equal(decodeBackupDataset({
    ...valid,
    incomeSchedules: { pip: [] },
  }), null);
});

test('a backup with a malformed row is rejected before it can crash the engine', () => {
  assert.equal(decodeBackupDataset({ ...valid, transactions: [null] }), null);
  assert.equal(decodeBackupDataset({
    ...valid,
    transactions: [{ row: 1, date: '2026-02-31', account: 'Current', type: 'Expense', amountPence: 100 }],
  }), null, 'an impossible calendar date is refused');
  assert.equal(decodeBackupDataset({
    ...valid,
    transactions: [{ row: 1, date: '2026-11-01', account: 'Current', type: 'Expense', amountPence: Number.POSITIVE_INFINITY }],
  }), null, 'a non-finite amount is refused');
  assert.equal(decodeBackupDataset({ ...valid, accounts: [{ openingPence: 0 }] }), null);
  assert.equal(decodeBackupDataset({ ...valid, bills: [null] }), null);
  assert.equal(decodeBackupDataset({ ...valid, debts: 'not a list' }), null);
  assert.equal(decodeBackupDataset({ ...valid, monthLocks: { '2026-11': {} } }), null);
});

test('a backup carrying the newer optional collections is accepted', () => {
  const decoded = decodeBackupDataset({
    ...valid,
    debts: [{ id: 'd1', name: 'Card', balancePence: 10_000, monthlyPaymentPence: 500 }],
    savings: [],
    importBatches: [{ id: 'b1', source: 'Starling' }],
    csvProfiles: [],
    recurringDismissed: ['spotify'],
    categories: ['Food'],
    monthLocks: { '2026-10': { lockedAt: '2026-11-01T09:00:00.000Z' } },
  });
  assert.ok(decoded);
  assert.equal(decoded.debts?.length, 1);
});

test('an automatic backup is created at most once a day', () => {
  const now = Date.parse('2026-11-13T12:00:00.000Z');
  assert.equal(shouldCreateAutomaticBackup(null, now), true);
  assert.equal(shouldCreateAutomaticBackup('not a date', now), true);
  assert.equal(shouldCreateAutomaticBackup('2026-11-13T11:59:00.000Z', now), false);
  assert.equal(shouldCreateAutomaticBackup('2026-11-12T12:00:00.000Z', now), true);
});
