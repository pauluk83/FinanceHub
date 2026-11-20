import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_BUCKET, cloudBackupAdapter, cloudBackupPath, requireUserId } from '../core/cloudBackup.ts';
import {
  BACKUP_RETENTION,
  listEncryptedBackups,
  readEncryptedBackup,
  uploadEncryptedBackup,
} from '../core/backupUpload.ts';

const USER = '3f2b8c1a-1111-4c2d-9e3f-1234567890ab';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const envelope = (createdAt: string) => ({
  format: 'financehub-backup-v2',
  version: 2,
  createdAt,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: 'c2FsdA==' },
  cipher: { name: 'AES-GCM', iv: 'aXZpdml2aXZpdg==' },
  payload: 'Y2lwaGVydGV4dC1vbmx5',
  checksum: 'a'.repeat(64),
});

/** Records every path so the tests can prove nothing escapes the user's folder. */
function fakeBucket() {
  const files = new Map<string, string>();
  const calls: string[] = [];
  const client = {
    async upload(path: string, body: string) {
      calls.push(`put ${path}`);
      files.set(path, body);
    },
    async list(folder: string) {
      calls.push(`list ${folder}`);
      return [...files.entries()]
        .filter(([path]) => path.startsWith(`${folder}/`))
        .map(([path, body]) => ({
          name: path.slice(folder.length + 1),
          bytes: body.length,
          uploadedAt: '2026-11-20T09:00:00.000Z',
        }));
    },
    async download(path: string) {
      calls.push(`get ${path}`);
      const body = files.get(path);
      if (!body) throw new Error('Object not found');
      return body;
    },
    async remove(path: string) {
      calls.push(`remove ${path}`);
      files.delete(path);
    },
  };
  return { client, files, calls };
}

test('the bucket name matches the policies applied in Supabase', () => {
  assert.equal(BACKUP_BUCKET, 'financehub-backups');
});

test('uploads are written under the signed-in user folder only', async () => {
  const bucket = fakeBucket();
  const adapter = cloudBackupAdapter(bucket.client, USER);
  const result = await uploadEncryptedBackup(adapter, envelope('2026-11-20T09:30:00.000Z'));
  assert.equal(result.name, 'financehub-backup-2026-11-20T09-30-00-000Z.json');
  assert.deepEqual([...bucket.files.keys()], [`${USER}/${result.name}`]);
  assert.equal(bucket.files.get(`${USER}/${result.name}`)!.includes('transactions'), false);
  assert.ok(bucket.calls.every((call) => {
    const target = call.slice(call.indexOf(' ') + 1);
    return target === USER || target.startsWith(`${USER}/`);
  }));
});

test('a signed-out or traversing user id is refused before any request', () => {
  const bucket = fakeBucket();
  for (const bad of ['', '   ', null, undefined, '../other', 'a/b', 'a\\b', 'x'.repeat(65)]) {
    assert.throws(() => cloudBackupAdapter(bucket.client, bad as string | null), /Sign in to your cloud account/);
    assert.throws(() => requireUserId(bad as string | null), /Sign in to your cloud account/);
  }
  assert.deepEqual(bucket.calls, []);
  assert.equal(requireUserId(USER), USER);
});

test('a foreign name never becomes a path', () => {
  assert.throws(() => cloudBackupPath(USER, 'notes.txt'), /Not a FinanceHub backup name/);
  assert.throws(() => cloudBackupPath(USER, '../financehub-backup-2026-11-20T09-00-00-000Z.json'), /Not a FinanceHub backup name/);
  assert.equal(
    cloudBackupPath(USER, 'financehub-backup-2026-11-20T09-00-00-000Z.json'),
    `${USER}/financehub-backup-2026-11-20T09-00-00-000Z.json`,
  );
});

test('the list shows only this user folder and ignores foreign objects', async () => {
  const bucket = fakeBucket();
  bucket.files.set(`${USER}/financehub-backup-2026-11-19T09-00-00-000Z.json`, '{}');
  bucket.files.set(`${USER}/notes.txt`, 'ignored');
  bucket.files.set(`${OTHER}/financehub-backup-2026-11-19T09-00-00-000Z.json`, '{}');
  const adapter = cloudBackupAdapter(bucket.client, USER);
  const listed = await listEncryptedBackups(adapter);
  assert.deepEqual(listed.map((entry) => entry.name), ['financehub-backup-2026-11-19T09-00-00-000Z.json']);
  assert.equal(await readEncryptedBackup(adapter, 'notes.txt'), null);
  assert.equal(await readEncryptedBackup(adapter, `${OTHER}/financehub-backup-2026-11-19T09-00-00-000Z.json`), null);
});

test('retention keeps seven backups per user folder', async () => {
  const bucket = fakeBucket();
  const adapter = cloudBackupAdapter(bucket.client, USER);
  for (let day = 1; day <= 9; day += 1) {
    await uploadEncryptedBackup(adapter, envelope(`2026-11-${String(day).padStart(2, '0')}T09:00:00.000Z`));
  }
  const stored = await listEncryptedBackups(adapter);
  assert.equal(stored.length, BACKUP_RETENTION);
  assert.ok(stored.every((entry) => bucket.files.has(`${USER}/${entry.name}`)));
  assert.equal([...bucket.files.keys()].some((path) => path.includes('2026-11-01')), false);
  assert.equal([...bucket.files.keys()].some((path) => !path.startsWith(`${USER}/`)), false);
});

test('a storage error is reported instead of silently passing', async () => {
  const bucket = fakeBucket();
  const adapter = cloudBackupAdapter(
    {
      ...bucket.client,
      async upload() {
        throw new Error('new row violates row-level security policy');
      },
    },
    USER,
  );
  await assert.rejects(
    uploadEncryptedBackup(adapter, envelope('2026-11-20T09:30:00.000Z')),
    /row-level security/,
  );
});
