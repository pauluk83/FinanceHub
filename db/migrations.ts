/**
 * Versioned schema migrations for the local database.
 *
 * The schema used to be one bootstrap file executed wholesale. Every change now
 * arrives as the next numbered file in `db/migrations/`, and the runner records
 * what it has applied in `schema_migrations`, so an existing database is brought
 * forward once and re-running is a no-op.
 *
 * Naming: `NNNN_lower_snake_name.sql`, starting at 0001 with no gaps. Ordering is
 * the filename order, which is also the only order the runner will accept.
 */
import fs from 'node:fs';
import path from 'node:path';

export type Migration = {
  version: string;
  name: string;
  file: string;
  sql: string;
};

export type MigrationResult = {
  applied: string[];
  alreadyApplied: number;
};

const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

/** Minimal shape of the SQLite handle, so this module does not depend on a driver. */
export type SqliteHandle = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): any;
    all(...params: unknown[]): any[];
    run(...params: unknown[]): unknown;
  };
};

export function listMigrations(dir: string): Migration[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  const seen = new Set<string>();

  const migrations = files.map((file) => {
    const match = FILE_PATTERN.exec(file);
    if (!match) throw new Error(`Migration "${file}" must be named NNNN_lower_snake_name.sql`);
    const version = match[1];
    if (seen.has(version)) throw new Error(`Duplicate migration version ${version}`);
    seen.add(version);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    if (!sql) throw new Error(`Migration ${file} is empty`);
    return { version, name: file.slice(5, -4), file, sql };
  });

  migrations.forEach((migration, index) => {
    const expected = String(index + 1).padStart(4, '0');
    if (migration.version !== expected) {
      throw new Error(`Migration versions must run 0001, 0002, … without gaps: expected ${expected}, found ${migration.version}`);
    }
  });

  return migrations;
}

export function appliedVersions(db: SqliteHandle): string[] {
  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`).get();
  if (!table) return [];
  return db.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all().map((row) => String(row.version));
}

export function pendingMigrations(db: SqliteHandle, dir: string): Migration[] {
  const done = new Set(appliedVersions(db));
  return listMigrations(dir).filter((migration) => !done.has(migration.version));
}

/**
 * Apply every pending migration in order. Each file runs in its own transaction
 * and is recorded only when it succeeds, so a failure leaves the database at the
 * last known-good version instead of half-migrated.
 */
export function applyMigrations(db: SqliteHandle, dir: string, now = new Date().toISOString()): MigrationResult {
  db.exec(MIGRATIONS_TABLE);
  const pending = pendingMigrations(db, dir);

  for (const migration of pending) {
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare(`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`)
        .run(migration.version, migration.name, now);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.file} failed: ${(error as Error).message}`);
    }
  }

  return { applied: pending.map((migration) => migration.version), alreadyApplied: listMigrations(dir).length - pending.length };
}
