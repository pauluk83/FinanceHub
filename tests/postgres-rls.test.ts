import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(root, 'db', 'migrations', 'postgres', '0001_initial.sql'), 'utf8');

const syncedTables = [
  'settings', 'accounts', 'people', 'cards', 'bills', 'bill_changes',
  'income_schedules', 'transactions', 'month_locks', 'holidays', 'changelog',
  'provider_entries', 'credential_vault', 'audit_log', 'sync_conflicts', 'devices',
];

test('every cloud table has row-level security', () => {
  for (const table of ['profiles', ...syncedTables]) {
    assert.match(sql, new RegExp(`alter table ${table} enable row level security`, 'i'), `${table} must enable RLS`);
  }
});

test('profiles are limited to the authenticated user', () => {
  assert.match(sql, /create policy profiles_owner on profiles for all using \(id = auth\.uid\(\)\) with check \(id = auth\.uid\(\)\)/i);
});

test('owner policies use auth.uid and every synced table is covered', () => {
  assert.match(sql, /user_id = auth\.uid\(\)/, 'owner policy must use auth.uid()');
  assert.doesNotMatch(sql, /service_role/i, 'service-role credentials must never appear in the client schema');
  for (const table of syncedTables) {
    assert.match(sql, new RegExp(`'${table}'`), `${table} must be included in the owner-policy loop`);
  }
});
