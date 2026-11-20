/**
 * Restore-point diff and section restore.
 *
 * A section restore must take back exactly the records in the chosen sections
 * and leave every other record — and every figure derived from it — untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Dataset } from '../core/engine.ts';
import {
  BACKUP_SECTIONS,
  RESTORABLE_SECTIONS,
  changedSections,
  diffDatasets,
  restoreSections,
} from '../core/backupDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'data', 'workbook.json');
const skip = !fs.existsSync(FILE);

const load = (): Dataset => JSON.parse(fs.readFileSync(FILE, 'utf8'));

const byId = (diff: ReturnType<typeof diffDatasets>, id: string) => {
  const hit = diff.find((section) => section.id === id);
  assert.ok(hit, `${id} is in the diff`);
  return hit;
};

test('two identical points differ nowhere', { skip }, () => {
  const ds = load();
  const diff = diffDatasets(ds, structuredClone(ds));
  assert.equal(diff.length, BACKUP_SECTIONS.length);
  assert.ok(diff.every((section) => section.identical), 'every section is identical');
  assert.ok(diff.every((section) => section.added + section.removed + section.changed === 0));
  assert.deepEqual(changedSections(diff), []);
});

test('an added transaction, a changed bill and a new account are each counted', { skip }, () => {
  const before = load();
  const after = structuredClone(before);

  const template = after.transactions[0];
  after.transactions.push({ ...structuredClone(template), id: 'zzz-new-transaction' });

  const bill = after.bills[0];
  bill.amountPence = (bill.amountPence ?? 0) + 1;
  after.bills[0] = bill;

  after.accounts.push({ name: 'ZZZ New Account', targetPence: 0, openingPence: 0, sortOrder: 999, active: true });

  const diff = diffDatasets(before, after);
  assert.deepEqual(
    { added: byId(diff, 'transactions').added, changed: byId(diff, 'transactions').changed },
    { added: 1, changed: 0 },
  );
  assert.equal(byId(diff, 'bills').changed, 1);
  assert.equal(byId(diff, 'accounts').added, 1);
  assert.equal(byId(diff, 'accounts').removed, 0);
  assert.equal(byId(diff, 'people').identical, true, 'untouched sections stay identical');

  const ranked = changedSections(diff).map((section) => section.id);
  for (const id of ['transactions', 'bills', 'accounts']) assert.ok(ranked.includes(id));
  assert.equal(ranked.includes('people'), false);
});

test('a removed record is reported as removed, not changed', { skip }, () => {
  const before = load();
  const after = structuredClone(before);
  after.accounts = after.accounts.slice(1);
  const diff = diffDatasets(before, after);
  assert.equal(byId(diff, 'accounts').removed, 1);
  assert.equal(byId(diff, 'accounts').changed, 0);
});

test('restoring one section takes only that section', { skip }, () => {
  const current = load();
  const source = structuredClone(current);
  source.bills[0].amountPence = (source.bills[0].amountPence ?? 0) + 500;
  source.transactions.push({ ...structuredClone(source.transactions[0]), id: 'zzz-source-only' });
  source.accounts.push({ name: 'ZZZ Source Account', targetPence: 0, openingPence: 0, sortOrder: 999, active: true });

  const restored = restoreSections(current, source, ['bills']);
  assert.deepEqual(restored.bills, source.bills, 'the chosen section comes from the source');
  assert.deepEqual(restored.transactions, current.transactions, 'transactions are untouched');
  assert.deepEqual(restored.accounts, current.accounts, 'accounts are untouched');
  assert.deepEqual(restored.settings, current.settings, 'settings are untouched');
  assert.equal(current.bills[0].amountPence !== source.bills[0].amountPence, true, 'the live dataset was not mutated');
});

test('restoring a section moves that section and leaves income alone', { skip }, () => {
  const current = load();
  const source = structuredClone(current);
  const before = buildEngine(current, { today: '2026-11-20' });

  // A bill with no override, so the restored base amount is what shows.
  const candidate = before.scheduledBills(2026, 11).find((bill: any) => !bill.linkedSheet
    && !current.billChanges.some((change) => change.bill === bill.name && change.amountOverridePence != null));
  assert.ok(candidate, 'a plain bill without an override is scheduled in November');
  const index = source.bills.findIndex((bill) => bill.name === candidate!.name);
  source.bills[index].amountPence = (source.bills[index].amountPence ?? 0) + 5_000;
  if (typeof source.bills[index].baseAmountPence === 'number') source.bills[index].baseAmountPence += 5_000;
  source.people[0].openingPence = (source.people[0].openingPence ?? 0) + 5_000;

  const restored = restoreSections(current, source, ['bills', 'people']);
  const after = buildEngine(restored, { today: '2026-11-20' });
  assert.equal(after.monthlyIncome(2026, 11).total, before.monthlyIncome(2026, 11).total, 'income is untouched');
  assert.deepEqual(after.scheduledBills(2026, 11).map((bill: any) => bill.name), before.scheduledBills(2026, 11).map((bill: any) => bill.name), 'the bill list itself is unchanged');
  assert.equal(
    after.billAmount(restored.bills[index], 2026, 11),
    before.billAmount(current.bills[index], 2026, 11) + 5_000,
    'the restored bill does move that bill',
  );
});

test('settings and month locks are compared but never restored on their own', { skip }, () => {
  assert.equal(RESTORABLE_SECTIONS.includes('settings'), false);
  assert.equal(RESTORABLE_SECTIONS.includes('monthLocks'), false);
  const current = load();
  const source = structuredClone(current);
  source.settings.targetYear = 2027;
  const restored = restoreSections(current, source, ['settings', 'monthLocks']);
  assert.deepEqual(restored.settings, current.settings);
});

test('several sections can be restored in one go', { skip }, () => {
  const current = load();
  const source = structuredClone(current);
  source.bills[0].amountPence = 1;
  source.people[0].openingPence = 2;
  const restored = restoreSections(current, source, ['bills', 'people']);
  assert.deepEqual(restored.bills, source.bills);
  assert.deepEqual(restored.people, source.people);
  assert.deepEqual(restored.cards, current.cards);
});
