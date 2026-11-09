import test from 'node:test';
import assert from 'node:assert/strict';
import { isTombstone, mergeRecord, syncOrder, type SyncRecord } from '../core/sync.ts';

const base: SyncRecord<{ name: string }> = {
  entity: 'accounts',
  id: '7',
  rev: 3,
  updatedAt: '2026-11-06T10:00:00.000Z',
  deviceId: 'windows',
  value: { name: 'Starling' },
};

test('a newer remote revision wins', () => {
  const result = mergeRecord(base, {
    ...base,
    rev: 4,
    deviceId: 'ios',
    value: { name: 'Starling current' },
  });

  assert.equal(result.winner.rev, 4);
  assert.equal(result.winner.value.name, 'Starling current');
  assert.equal(result.conflict, undefined);
});

test('a newer local revision is retained', () => {
  const result = mergeRecord(
    { ...base, rev: 5, value: { name: 'Local edit' } },
    { ...base, rev: 4, value: { name: 'Remote edit' } },
  );

  assert.equal(result.winner.rev, 5);
  assert.equal(result.winner.value.name, 'Local edit');
  assert.equal(result.conflict, undefined);
});

test('identical equal revisions are idempotent', () => {
  const result = mergeRecord(base, structuredClone(base));
  assert.deepEqual(result.winner, base);
  assert.equal(result.conflict, undefined);
});

test('equal revisions with different content retain both versions for review', () => {
  const result = mergeRecord(
    { ...base, value: { name: 'Local edit' } },
    { ...base, value: { name: 'Remote edit' } },
  );

  assert.equal(result.winner.value.name, 'Local edit');
  assert.ok(result.conflict);
  assert.equal(result.conflict?.recordId, '7');
  assert.equal(result.conflict?.remote.value.name, 'Remote edit');
});

test('a newer tombstone wins', () => {
  const deleted = {
    ...base,
    rev: 6,
    deletedAt: '2026-11-06T11:00:00.000Z',
  };
  const result = mergeRecord(base, deleted);

  assert.equal(result.winner.rev, 6);
  assert.equal(isTombstone(result.winner), true);
});

test('local-only mode has no sync order', () => {
  assert.deepEqual(syncOrder('local'), []);
  assert.deepEqual(syncOrder('cloud'), ['pull', 'push']);
});
