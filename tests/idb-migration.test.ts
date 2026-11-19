import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesToMigrate } from '../app/src/idbStore.ts';
import { createTapGuard } from '../app/src/mutationGuard.ts';

test('only financehub keys missing from IndexedDB are migrated', () => {
  const local = {
    'financehub.state.v1': '{"a":1}',
    'financehub.sync.outbox.v1:u1': '[]',
    'financehub.state.v1.last-good.v1': '{"a":2}',
    'other.key': 'keep',
    'financehub.owner.v1': 'u1',
  };
  const pending = entriesToMigrate(local, new Set(['financehub.state.v1']));
  assert.deepEqual(pending.map(([key]) => key).sort(), [
    'financehub.owner.v1',
    'financehub.state.v1.last-good.v1',
    'financehub.sync.outbox.v1:u1',
  ]);
  assert.equal(pending.some(([key]) => key === 'other.key'), false);
});

test('a migrated document is not copied twice', () => {
  const pending = entriesToMigrate({ 'financehub.state.v1': 'x' }, new Set(['financehub.state.v1']));
  assert.deepEqual(pending, []);
});

test('a double tap is refused inside the window and allowed after it', () => {
  const guard = createTapGuard(800);
  assert.equal(guard(1_000), true);
  assert.equal(guard(1_050), false);
  assert.equal(guard(1_700), false);
  assert.equal(guard(1_801), true);
});
