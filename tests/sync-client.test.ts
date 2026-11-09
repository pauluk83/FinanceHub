import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJson,
  enqueueOutbox,
  makeConflict,
  maxSyncCursor,
  planSettingsSync,
  readRemoteDocument,
  retryDelay,
  type SyncMeta,
  type SyncOutboxItem,
} from '../core/sync-client.ts';

const meta: SyncMeta = { rev: 4, cursor: 12, lastSyncedAt: '2026-11-06T10:00:00.000Z' };
const pending: SyncOutboxItem<{ name: string }> = {
  opId: 'op-1',
  entity: 'settings',
  recordId: 'user-1',
  baseRev: 4,
  deviceId: 'windows-1',
  state: { name: 'Local' },
  createdAt: '2026-11-06T09:00:00.000Z',
  attempts: 2,
};

test('canonical JSON ignores object key order', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
});

test('the pull cursor advances to the highest server sequence', () => {
  const payload = {
    settings: [{ sync_seq: 8 }],
    transactions: [{ sync_seq: 14 }, { sync_seq: 11 }],
    other: 'ignored',
  };
  assert.equal(maxSyncCursor(payload, 12), 14);
  assert.equal(maxSyncCursor({}, 12), 12);
});

test('the settings document is read from the pull payload', () => {
  const remote = readRemoteDocument<{ name: string }>({
    settings: [{
      rev: 5,
      sync_seq: 18,
      updated_at: '2026-11-06T10:05:00.000Z',
      state_json: { name: 'Remote' },
    }],
  });

  assert.deepEqual(remote, {
    rev: 5,
    syncSeq: 18,
    updatedAt: '2026-11-06T10:05:00.000Z',
    state: { name: 'Remote' },
  });
  assert.equal(readRemoteDocument({ settings: [] }), null);
  assert.equal(readRemoteDocument({ settings: [{ rev: 1, sync_seq: 1, state_json: null }] }), null);
});

test('a new outbox operation records the base revision', () => {
  const items = enqueueOutbox({
    items: [],
    state: { name: 'Local' },
    recordId: 'user-1',
    deviceId: 'windows-1',
    baseRev: 4,
    now: '2026-11-06T09:00:00.000Z',
    idFactory: () => 'op-new',
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].opId, 'op-new');
  assert.equal(items[0].baseRev, 4);
  assert.equal(items[0].state.name, 'Local');
});

test('further local edits coalesce without changing the base revision', () => {
  const first = enqueueOutbox({
    items: [],
    state: { name: 'Local' },
    recordId: 'user-1',
    deviceId: 'windows-1',
    baseRev: 4,
    idFactory: () => 'op-new',
  });
  const second = enqueueOutbox({
    items: first,
    state: { name: 'Local edited' },
    recordId: 'user-1',
    deviceId: 'windows-1',
    baseRev: 9,
  });

  assert.equal(second.length, 1);
  assert.equal(second[0].opId, 'op-new');
  assert.equal(second[0].baseRev, 4);
  assert.equal(second[0].state.name, 'Local edited');
  assert.equal(second[0].attempts, 0);
});

test('an unchanged state does not create another outbox operation', () => {
  const items = [pending];
  assert.equal(enqueueOutbox({
    items,
    state: { name: 'Local' },
    recordId: 'user-1',
    deviceId: 'windows-1',
    baseRev: 4,
  }), items);
});

test('retry delay grows exponentially and is capped', () => {
  assert.equal(retryDelay(1, () => 0), 1_000);
  assert.equal(retryDelay(2, () => 0), 2_000);
  assert.equal(retryDelay(3, () => 0), 4_000);
  assert.equal(retryDelay(20, () => 0), 30_000);
  assert.equal(retryDelay(1, () => 1), 1_250);
});

test('a pending edit based on an older revision is a conflict, not a silent overwrite', () => {
  const plan = planSettingsSync({
    meta,
    pending,
    remote: {
      rev: 5,
      syncSeq: 20,
      updatedAt: '2026-11-06T10:05:00.000Z',
      state: { name: 'Remote' },
    },
  });

  assert.equal(plan.action, 'conflict');
  assert.equal(plan.action === 'conflict' ? plan.remote.rev : 0, 5);
});

test('identical content at a newer remote revision can be acknowledged', () => {
  const plan = planSettingsSync({
    meta,
    pending,
    remote: {
      rev: 5,
      syncSeq: 20,
      updatedAt: '2026-11-06T10:05:00.000Z',
      state: { name: 'Local' },
    },
  });

  assert.equal(plan.action, 'ack');
});

test('a pending edit with no newer remote revision is pushed', () => {
  assert.equal(planSettingsSync({
    meta,
    pending,
    remote: {
      rev: 4,
      syncSeq: 12,
      updatedAt: '2026-11-06T10:00:00.000Z',
      state: { name: 'Remote base' },
    },
  }).action, 'push');
});

test('a newer remote document is applied when there is no pending edit', () => {
  assert.equal(planSettingsSync({
    meta,
    remote: {
      rev: 5,
      syncSeq: 20,
      updatedAt: '2026-11-06T10:05:00.000Z',
      state: { name: 'Remote' },
    },
  }).action, 'apply');
});

test('a conflict keeps both local and remote snapshots', () => {
  const conflict = makeConflict(pending, {
    rev: 5,
    syncSeq: 20,
    updatedAt: '2026-11-06T10:05:00.000Z',
    state: { name: 'Remote' },
  }, '2026-11-06T10:06:00.000Z');

  assert.equal(conflict.id, 'op-1:5');
  assert.equal(conflict.local.state.name, 'Local');
  assert.equal(conflict.remote.state.name, 'Remote');
  assert.equal(conflict.local.rev, 4);
  assert.equal(conflict.remote.rev, 5);
});
