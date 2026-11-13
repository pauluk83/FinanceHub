import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(root, 'db', 'migrations', 'postgres', '0003_account_deletion.sql'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app', 'src', 'account.ts'), 'utf8');
const view = fs.readFileSync(path.join(root, 'app', 'src', 'views', 'accountSecurity.tsx'), 'utf8');

test('account deletion is owner-bound, security definer and authenticated only', () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /delete from auth\.users/i);
  assert.match(sql, /revoke all on function public\.delete_my_account\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.delete_my_account\(\) to authenticated/i);
});

test('the client calls the deletion function and exposes MFA setup', () => {
  assert.match(app, /rpc\('delete_my_account'\)/);
  assert.match(app, /enrollTotp|verifyTotp/);
  assert.match(view, /Delete cloud account permanently/);
});
