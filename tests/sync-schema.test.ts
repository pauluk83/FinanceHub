import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(path.join(root, 'db', 'migrations', 'postgres', '0002_sync.sql'), 'utf8');
const initial = fs.readFileSync(path.join(root, 'db', 'migrations', 'postgres', '0001_initial.sql'), 'utf8');

test('sync migration defines a server-assigned cursor', () => {
  assert.match(sql, /create table if not exists sync_clock/i);
  assert.match(sql, /financehub_next_sync_seq/);
  assert.match(sql, /sync_seq bigint not null default 0/);
  assert.match(sql, /financehub_prepare_sync/);
  assert.match(sql, /new\.rev := coalesce\(old\.rev, 0\) \+ 1/);
  assert.match(sql, /new\.updated_at := now\(\)/);
});

test('sync migration has idempotency and pull boundaries', () => {
  assert.match(sql, /create table if not exists sync_ops/i);
  assert.match(sql, /primary key \(user_id, op_id\)/i);
  assert.match(sql, /financehub_pull_changes\(p_cursor bigint\)/);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /t\.user_id = auth\.uid\(\)/);
  assert.match(sql, /grant execute on function financehub_pull_changes\(bigint\) to authenticated/i);
});

test('settings documents have a revision-checked idempotent push', () => {
  assert.match(sql, /alter table settings add column if not exists state_json jsonb/i);
  assert.match(sql, /financehub_push_state\(\s*p_base_rev bigint,\s*p_state jsonb,\s*p_device_id text,\s*p_op_id uuid\s*\)/i);
  assert.match(sql, /v_row\.rev <> p_base_rev/);
  assert.match(sql, /insert into sync_ops \(user_id, device_id, op_id\)/i);
  assert.match(sql, /grant execute on function financehub_push_state\(bigint, jsonb, text, uuid\) to authenticated/i);
});

test('settings changes are published to realtime', () => {
  // The client subscribes to postgres_changes on settings, so the table must be
  // in the publication that Realtime streams from.
  assert.match(initial, /alter publication supabase_realtime add table[^;]*\bsettings\b/);
});

test('sync migration keeps sync tables under row-level security', () => {
  assert.match(sql, /alter table sync_clock enable row level security/i);
  assert.match(sql, /alter table sync_ops enable row level security/i);
  assert.match(sql, /create policy sync_clock_owner on sync_clock/i);
  assert.match(sql, /create policy sync_ops_owner on sync_ops/i);
});
