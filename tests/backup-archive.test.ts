import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptBackup, encryptBackup, MIN_BACKUP_PASSPHRASE } from '../app/src/backupArchive.ts';
import { pruneRestorePoints, MAX_AUTOMATIC_RESTORE_POINTS, MAX_RESTORE_POINTS } from '../core/backupRetention.ts';

test('an encrypted backup round-trips and rejects the wrong passphrase', async () => {
  const source = { settings: { targetYear: 2026 }, transactions: [{ row: 1 }] };
  const backup = await encryptBackup(source, 'correct horse battery', '2026-11-09T10:00:00.000Z');
  assert.equal(backup.format, 'financehub-backup-v2');
  assert.deepEqual(await decryptBackup(backup, 'correct horse battery'), source);
  assert.equal(await decryptBackup(backup, 'wrong passphrase'), null);
});

test('a tampered payload fails its checksum', async () => {
  const backup = await encryptBackup({ ok: true }, 'correct horse battery');
  const tampered = { ...backup, payload: `${backup.payload.slice(0, -2)}AA` };
  assert.equal(await decryptBackup(tampered, 'correct horse battery'), null);
});

test('short backup passphrases are refused', async () => {
  await assert.rejects(() => encryptBackup({}, 'x'.repeat(MIN_BACKUP_PASSPHRASE - 1)), /at least/);
});

test('manual restore points keep only the newest seven', () => {
  const points = Array.from({ length: 10 }, (_, index) => ({ createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }));
  const kept = pruneRestorePoints(points);
  assert.equal(kept.length, MAX_RESTORE_POINTS);
  assert.equal(kept[0].createdAt, '2026-11-10T00:00:00.000Z');
  assert.equal(kept.at(-1)?.createdAt, '2026-11-04T00:00:00.000Z');
});

test('automatic daily backups keep a week, not the manual seven', () => {
  const automatic = Array.from({ length: 40 }, (_, index) => ({
    createdAt: new Date(Date.UTC(2026, 8, 1 + index)).toISOString(),
    automatic: true,
  }));
  const kept = pruneRestorePoints(automatic);
  assert.equal(MAX_AUTOMATIC_RESTORE_POINTS, 7);
  assert.equal(kept.length, MAX_AUTOMATIC_RESTORE_POINTS);
  assert.equal(kept.every((point) => point.automatic), true);
  const newest = [...automatic].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  assert.equal(kept[0].createdAt, newest.createdAt);
});

test('the two pools keep their own limits when mixed', () => {
  const automatic = Array.from({ length: 35 }, (_, index) => ({
    id: `auto-${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 1 + index)).toISOString(),
    automatic: true,
  }));
  const manual = Array.from({ length: 9 }, (_, index) => ({
    id: `manual-${index}`,
    createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
  }));
  const kept = pruneRestorePoints([...automatic, ...manual]);
  assert.equal(kept.filter((point) => point.automatic).length, MAX_AUTOMATIC_RESTORE_POINTS);
  assert.equal(kept.filter((point) => !point.automatic).length, MAX_RESTORE_POINTS);
  for (let index = 1; index < kept.length; index += 1) {
    assert.ok(kept[index - 1].createdAt >= kept[index].createdAt, 'points stay newest first');
  }
});

test('a smaller automatic limit leaves the manual pool untouched', () => {
  const points = [
    ...Array.from({ length: 10 }, (_, index) => ({ id: `a${index}`, createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`, automatic: true })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `m${index}`, createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T12:00:00.000Z` })),
  ];
  const kept = pruneRestorePoints(points, { automatic: 4 });
  assert.equal(kept.filter((point) => point.automatic).length, 4);
  assert.equal(kept.filter((point) => !point.automatic).length, 3);
});
