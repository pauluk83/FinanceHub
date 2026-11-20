import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_STALE_DAYS,
  DEVICE_TABLE,
  deviceFromRow,
  deviceLabel,
  deviceStore,
  deviceSummary,
  isDeviceStale,
  requireDeviceId,
  requireDeviceOwner,
  sortDevices,
  type DeviceRow,
} from '../core/devices.ts';

const OWNER = '31c12d42-8d36-49b9-bb97-d65f9eec16da';
const DEVICE = '11111111-2222-4333-8444-555555555555';

const row = (over: Partial<DeviceRow> = {}): DeviceRow => ({
  id: 'row-1',
  deviceId: DEVICE,
  label: 'Chrome on Windows',
  platform: 'web',
  createdAt: '2026-11-01T09:00:00.000Z',
  lastSeenAt: '2026-11-20T09:00:00.000Z',
  revokedAt: null,
  ...over,
});

function fakeClient() {
  const calls: string[] = [];
  const rows: DeviceRow[] = [];
  const client = {
    async upsert(input: { deviceId: string; label: string; platform: string | null; lastSeenAt: string }) {
      calls.push(`upsert ${input.deviceId} ${input.label}`);
      const existing = rows.find((entry) => entry.deviceId === input.deviceId);
      if (existing) Object.assign(existing, { label: input.label, lastSeenAt: input.lastSeenAt });
      else rows.push(row({ id: `row-${rows.length + 1}`, deviceId: input.deviceId, label: input.label, platform: input.platform, lastSeenAt: input.lastSeenAt }));
    },
    async list() {
      calls.push('list');
      return rows.map((entry) => ({ ...entry }));
    },
    async revoke(id: string) {
      calls.push(`revoke ${id}`);
      const hit = rows.find((entry) => entry.id === id);
      if (hit) hit.revokedAt = '2026-11-20T10:00:00.000Z';
    },
  };
  return { client, calls, rows };
}

test('the table name matches the applied migration', () => {
  assert.equal(DEVICE_TABLE, 'user_devices');
});

test('a signed-out or traversing owner is refused before any request', () => {
  const bucket = fakeClient();
  for (const bad of ['', '   ', null, undefined, '../other', 'a/b', 'x'.repeat(65)]) {
    assert.throws(() => deviceStore(bucket.client, bad as string | null), /Sign in to manage devices/);
    assert.throws(() => requireDeviceOwner(bad as string | null), /Sign in to manage devices/);
  }
  assert.deepEqual(bucket.calls, []);
});

test('this install updates one row instead of adding new ones', async () => {
  const fake = fakeClient();
  const store = deviceStore(fake.client, OWNER);
  await store.register(DEVICE, 'Chrome on Windows', 'web', '2026-11-19T09:00:00.000Z');
  await store.register(DEVICE, 'Chrome on Windows', 'web', '2026-11-20T09:00:00.000Z');
  assert.equal(fake.rows.length, 1);
  assert.equal(fake.rows[0].lastSeenAt, '2026-11-20T09:00:00.000Z');
  assert.equal(requireDeviceId(DEVICE), DEVICE);
  for (const bad of ['', 'short', 'has/slash', 'x'.repeat(65)]) {
    assert.throws(() => requireDeviceId(bad), /valid identifier/);
  }
});

test('the list puts this device first, then the most recently seen, revoked last', async () => {
  const current = row({ id: 'a', deviceId: 'current-device', lastSeenAt: '2026-11-01T09:00:00.000Z' });
  const fresh = row({ id: 'b', deviceId: 'other-fresh', lastSeenAt: '2026-11-20T09:00:00.000Z' });
  const older = row({ id: 'c', deviceId: 'other-old', lastSeenAt: '2026-11-10T09:00:00.000Z' });
  const revoked = row({ id: 'd', deviceId: 'gone', lastSeenAt: '2026-11-19T09:00:00.000Z', revokedAt: '2026-11-19T10:00:00.000Z' });
  const sorted = sortDevices([revoked, older, fresh, current], 'current-device');
  assert.deepEqual(sorted.map((entry) => entry.id), ['a', 'b', 'c', 'd']);
});

test('a device unseen for a month is inactive, and a revoked one is not counted active', () => {
  const now = Date.parse('2026-11-20T12:00:00.000Z');
  assert.equal(DEVICE_STALE_DAYS, 30);
  assert.equal(isDeviceStale(row({ lastSeenAt: '2026-11-19T12:00:00.000Z' }), now), false);
  assert.equal(isDeviceStale(row({ lastSeenAt: '2026-10-01T12:00:00.000Z' }), now), true);
  assert.equal(isDeviceStale(row({ lastSeenAt: '2026-01-01T12:00:00.000Z', revokedAt: '2026-11-01T12:00:00.000Z' }), now), false);
  const summary = deviceSummary([
    row({ id: 'a' }),
    row({ id: 'b', lastSeenAt: '2026-10-01T12:00:00.000Z' }),
    row({ id: 'c', revokedAt: '2026-11-19T12:00:00.000Z' }),
  ], now);
  assert.deepEqual(summary, { total: 3, active: 2, stale: 1, revoked: 1 });
});

test('a database row is mapped and a malformed one is dropped', () => {
  const mapped = deviceFromRow({
    id: 'row-9',
    device_id: DEVICE,
    label: '  Windows app ',
    platform: 'desktop',
    created_at: '2026-11-01T09:00:00.000Z',
    last_seen_at: '2026-11-20T09:00:00.000Z',
    revoked_at: null,
  });
  assert.deepEqual(mapped, {
    id: 'row-9',
    deviceId: DEVICE,
    label: 'Windows app',
    platform: 'desktop',
    createdAt: '2026-11-01T09:00:00.000Z',
    lastSeenAt: '2026-11-20T09:00:00.000Z',
    revokedAt: null,
  });
  assert.equal(deviceFromRow({ id: 'row-9' }), null);
  assert.equal(deviceFromRow(null), null);
  assert.equal(deviceFromRow({ id: 'x', device_id: 'y', created_at: 'nope', last_seen_at: 'nope' }), null);
});

test('labels stay short and readable', () => {
  assert.equal(deviceLabel('desktop', 'anything'), 'Windows app');
  assert.equal(deviceLabel('web', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'), 'Chrome on Windows');
  assert.equal(deviceLabel('web', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'), 'Safari on macOS');
  assert.equal(deviceLabel('web', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'), 'Safari on iPhone');
  assert.equal(deviceLabel('web', 'Mozilla/5.0 (Windows NT 10.0) Edg/120.0'), 'Edge on Windows');
  assert.equal(deviceLabel('web', ''), 'Browser');
});

test('revoking marks the row and never deletes it', async () => {
  const fake = fakeClient();
  const store = deviceStore(fake.client, OWNER);
  await store.register(DEVICE, 'Windows app', 'desktop');
  const [entry] = await store.list(DEVICE);
  await store.revoke(entry.id);
  assert.deepEqual(fake.calls.filter((call) => call.startsWith('revoke')), [`revoke ${entry.id}`]);
  const [after] = await store.list(DEVICE);
  assert.equal(after.revokedAt, '2026-11-20T10:00:00.000Z');
  assert.equal((await store.list(DEVICE)).length, 1);
});
