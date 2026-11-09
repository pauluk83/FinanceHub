/**
 * Phase 1: versioned schema migrations.
 *
 * The local schema must be brought forward one numbered file at a time, applied
 * exactly once, with a failure leaving the database at its last good version.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { appliedVersions, applyMigrations, listMigrations, pendingMigrations } from '../db/migrations.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'db', 'migrations');
const TMP = path.join(ROOT, 'tmp', 'migrations-test');

test('the local schema is an ordered set of numbered migrations', () => {
  const migrations = listMigrations(DIR);
  assert.equal(migrations.length, 4);
  assert.deepEqual(migrations.map((migration) => migration.version), ['0001', '0002', '0003', '0004']);
  assert.ok(migrations.every((migration) => migration.sql.length > 0), 'no migration is empty');
  assert.deepEqual(migrations.map((migration) => migration.name), [
    'core',
    'provider_entries',
    'vault_and_audit',
    'sync_conflicts',
  ]);
});

test('applying migrations creates the schema once and records each version', () => {
  const db = new DatabaseSync(':memory:');
  const first = applyMigrations(db, DIR);
  assert.deepEqual(first.applied, ['0001', '0002', '0003', '0004']);

  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all().map((row: any) => String(row.name));
  for (const expected of [
    'settings', 'accounts', 'people', 'cards', 'bills', 'bill_changes', 'income_schedules',
    'transactions', 'month_locks', 'holidays', 'changelog', 'provider_entries',
    'credential_vault', 'audit_log', 'sync_conflicts', 'schema_migrations',
  ]) {
    assert.ok(tables.includes(expected), `${expected} exists after migrating`);
  }

  assert.deepEqual(appliedVersions(db), ['0001', '0002', '0003', '0004']);
  assert.deepEqual(pendingMigrations(db, DIR), [], 'nothing is pending after a full apply');

  const second = applyMigrations(db, DIR);
  assert.deepEqual(second.applied, [], 're-running applies nothing');
  assert.equal(second.alreadyApplied, 4);

  db.prepare(`INSERT INTO settings (id,target_year,start_month,currency,months_in_year,as_of_date,lock_cutoff,anchor_date,updated_at,rev)
    VALUES (1,2026,1,'GBP',12,'2026-11-07','2026-11-01','2026-11-07','2026-11-08T00:00:00.000Z',1)`).run();
  assert.equal(db.prepare(`SELECT target_year FROM settings`).get()!.target_year, 2026, 'the migrated schema accepts a settings row');
});

test('the runner rejects a badly named file rather than guessing the order', () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, 'initial.sql'), 'CREATE TABLE t (id TEXT);');
  assert.throws(() => listMigrations(TMP), /NNNN_lower_snake_name\.sql/);
});

test('the runner rejects gaps and duplicate versions', () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, '0001_core.sql'), 'CREATE TABLE t (id TEXT);');
  fs.writeFileSync(path.join(TMP, '0003_third.sql'), 'CREATE TABLE u (id TEXT);');
  assert.throws(() => listMigrations(TMP), /without gaps/);

  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, '0001_core.sql'), 'CREATE TABLE t (id TEXT);');
  fs.writeFileSync(path.join(TMP, '0001_again.sql'), 'CREATE TABLE u (id TEXT);');
  assert.throws(() => listMigrations(TMP), /Duplicate migration version 0001/);
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('a failing migration rolls back and is not recorded', () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, '0001_core.sql'), 'CREATE TABLE ok (id TEXT);');
  fs.writeFileSync(path.join(TMP, '0002_broken.sql'), 'CREATE TABLE broken (id TEXT); CREATE TABLE broken (id TEXT);');
  const db = new DatabaseSync(':memory:');
  assert.throws(() => applyMigrations(db, TMP), /Migration 0002_broken\.sql failed/);
  assert.deepEqual(appliedVersions(db), ['0001'], 'the good migration stays applied');
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((row: any) => String(row.name));
  assert.ok(tables.includes('ok'), 'the earlier migration survived');
  assert.ok(!tables.includes('broken'), 'the failed migration left nothing behind');
  fs.rmSync(TMP, { recursive: true, force: true });
});
