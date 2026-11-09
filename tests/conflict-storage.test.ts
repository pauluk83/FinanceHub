import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundConflicts,
  changedPaths,
  CONFLICT_LIMIT,
  CONFLICT_SNAPSHOT_LIMIT,
  makeConflict,
  summarizeConflicts,
  type SyncOutboxItem,
} from '../core/sync-client.ts';

const pending = (index: number, state: Record<string, unknown>): SyncOutboxItem<Record<string, unknown>> => ({
  opId: `op-${index}`,
  entity: 'settings',
  recordId: 'user-1',
  baseRev: index,
  deviceId: 'windows-1',
  state,
  createdAt: `2026-11-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
  attempts: 0,
});

const conflict = (index: number, local: Record<string, unknown>, remote: Record<string, unknown>) => makeConflict(
  pending(index, local),
  { rev: index + 1, syncSeq: index, updatedAt: '2026-11-01T00:00:00.000Z', state: remote },
  `2026-11-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
);

test('changed paths name the differing leaves', () => {
  assert.deepEqual(
    changedPaths({ bills: [{ amountPence: 100 }], name: 'same' }, { bills: [{ amountPence: 200 }], name: 'same' }),
    ['bills.0.amountPence'],
  );
  assert.deepEqual(changedPaths({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(changedPaths({ a: 1 }, null), ['(document)']);
});

test('25 conflicts keep metadata while only the newest snapshots survive', () => {
  const conflicts = Array.from({ length: 30 }, (_, index) => conflict(
    index,
    { name: `Local ${index}`, nested: { value: index } },
    { name: `Remote ${index}`, nested: { value: index + 1 } },
  ));
  const stored = boundConflicts(conflicts);
  assert.equal(stored.length, CONFLICT_LIMIT);
  assert.equal(stored.filter((entry) => entry.local && entry.remote).length, CONFLICT_SNAPSHOT_LIMIT);
  assert.ok(stored.every((entry) => entry.changedPaths.length > 0));
  const summaries = summarizeConflicts(stored);
  assert.equal(summaries.filter((entry) => entry.localAvailable).length, CONFLICT_SNAPSHOT_LIMIT);
  assert.equal(summaries.filter((entry) => entry.localAvailable).length, summaries.filter((entry) => entry.remoteAvailable).length);
});

test('an oversized conflict keeps metadata but drops its snapshots', () => {
  const huge = 'x'.repeat(2_000_000);
  const stored = boundConflicts([conflict(1, { blob: huge }, { blob: 'small' })]);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].local, undefined);
  assert.equal(stored[0].remote, undefined);
  assert.ok(stored[0].localBytes > 1_000_000);
  const [summary] = summarizeConflicts(stored);
  assert.equal(summary.localAvailable, false);
  assert.equal(summary.remoteAvailable, false);
});
