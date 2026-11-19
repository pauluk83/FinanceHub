import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_RETENTION,
  backupName,
  isBackupName,
  listEncryptedBackups,
  memoryBackupAdapter,
  readEncryptedBackup,
  uploadEncryptedBackup,
} from '../core/backupUpload.ts';

const envelope = (createdAt: string, marker = 'no plaintext here') => ({
  format: 'financehub-backup-v2',
  version: 2,
  createdAt,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: 'c2FsdA==' },
  cipher: { name: 'AES-GCM', iv: 'aXZpdml2aXZpdg==' },
  payload: `Y2lwaGVydGV4dA==${Buffer.from(marker).toString('base64')}`,
  checksum: 'a'.repeat(64),
});

test('only an encrypted envelope can be uploaded', async () => {
  const adapter = memoryBackupAdapter();
  await assert.rejects(
    uploadEncryptedBackup(adapter, { settings: {}, transactions: [] }),
    /encrypted FinanceHub backup/,
  );
  await assert.rejects(uploadEncryptedBackup(adapter, { ...envelope('2026-11-19T10:00:00.000Z'), format: 'financehub-backup-v1' }));
  await assert.rejects(uploadEncryptedBackup(adapter, { ...envelope('2026-11-19T10:00:00.000Z'), checksum: 'not-a-checksum' }));
  assert.equal((await adapter.list()).length, 0);
});

test('an encrypted backup round-trips without the plaintext leaving the device', async () => {
  const adapter = memoryBackupAdapter();
  const secret = 'SecretMarker-£1234';
  const result = await uploadEncryptedBackup(adapter, envelope('2026-11-19T10:00:00.000Z', secret), { keep: 7 });
  assert.ok(isBackupName(result.name));
  const stored = await readEncryptedBackup(adapter, result.name);
  assert.ok(stored);
  assert.equal(JSON.parse(stored!).format, 'financehub-backup-v2');
  // The marker only exists base64-encoded inside the ciphertext, never as text.
  assert.equal(stored!.includes(secret), false);
  assert.equal(stored!.includes('transactions'), false);
});

test('retention keeps the newest seven backups', async () => {
  const adapter = memoryBackupAdapter();
  const removed: string[] = [];
  for (let day = 1; day <= 9; day += 1) {
    const result = await uploadEncryptedBackup(adapter, envelope(`2026-11-${String(day).padStart(2, '0')}T09:00:00.000Z`));
    removed.push(...result.removed);
  }
  const stored = await listEncryptedBackups(adapter);
  assert.equal(stored.length, BACKUP_RETENTION);
  assert.equal(removed.length, 2);
  assert.match(stored[0].name, /2026-11-09/);
  assert.equal(stored.some((entry) => entry.name.includes('2026-11-01')), false);
});

test('names sort chronologically and foreign names are ignored', async () => {
  assert.equal(backupName('2026-11-19T10:11:12.123Z'), 'financehub-backup-2026-11-19T10-11-12-123Z.json');
  assert.ok(backupName('2026-11-19T10:00:00.000Z') < backupName('2026-11-20T10:00:00.000Z'));
  const adapter = memoryBackupAdapter({ 'notes.txt': 'x', 'financehub-backup-2026-11-01T09-00-00-000Z.json': '{}' });
  const listed = await listEncryptedBackups(adapter);
  assert.deepEqual(listed.map((entry) => entry.name), ['financehub-backup-2026-11-01T09-00-00-000Z.json']);
  assert.equal(await readEncryptedBackup(adapter, 'notes.txt'), null);
});
