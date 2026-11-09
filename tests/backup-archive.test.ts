import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptBackup, encryptBackup, MIN_BACKUP_PASSPHRASE } from '../app/src/backupArchive.ts';
import { pruneRestorePoints, MAX_RESTORE_POINTS } from '../core/backupRetention.ts';

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

test('restore points keep only the newest seven', () => {
  const points = Array.from({ length: 10 }, (_, index) => ({ createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z` }));
  const kept = pruneRestorePoints(points);
  assert.equal(kept.length, MAX_RESTORE_POINTS);
  assert.equal(kept[0].createdAt, '2026-11-10T00:00:00.000Z');
  assert.equal(kept.at(-1)?.createdAt, '2026-11-04T00:00:00.000Z');
});
