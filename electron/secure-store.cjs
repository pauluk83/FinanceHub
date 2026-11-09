'use strict';

const { DatabaseSync } = require('node:sqlite');
const { safeStorage } = require('electron');

const PREFIX = Buffer.from('FH1:');

function assertKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 200) {
    throw new Error('Invalid secure-storage key');
  }
}

/**
 * SQLite is the local container; every value is encrypted with Electron's
 * safeStorage (Windows DPAPI, macOS Keychain, or the OS keyring on Linux).
 * This is deliberately not a plaintext JSON/localStorage store.
 */
function createSecureStore(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS secure_kv (
      key TEXT PRIMARY KEY,
      value BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const read = db.prepare('SELECT value FROM secure_kv WHERE key = ?');
  const write = db.prepare(`
    INSERT INTO secure_kv (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  const remove = db.prepare('DELETE FROM secure_kv WHERE key = ?');
  const listRows = db.prepare('SELECT key, value FROM secure_kv ORDER BY key');

  function requireEncryption() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS secure storage is unavailable; refusing to persist data');
    }
  }

  return {
    get(key) {
      assertKey(key);
      const row = read.get(key);
      if (!row) return null;
      requireEncryption();
      const value = Buffer.from(row.value);
      if (!value.subarray(0, PREFIX.length).equals(PREFIX)) {
        throw new Error('Unsupported secure-storage value');
      }
      return safeStorage.decryptString(value.subarray(PREFIX.length));
    },

    set(key, value) {
      assertKey(key);
      if (typeof value !== 'string') throw new Error('Secure-storage values must be strings');
      requireEncryption();
      const encrypted = safeStorage.encryptString(value);
      write.run(key, Buffer.concat([PREFIX, encrypted]), new Date().toISOString());
    },

    remove(key) {
      assertKey(key);
      remove.run(key);
    },

    list() {
      requireEncryption();
      const values = {};
      for (const row of listRows.all()) {
        const value = Buffer.from(row.value);
        if (!value.subarray(0, PREFIX.length).equals(PREFIX)) {
          throw new Error('Unsupported secure-storage value');
        }
        values[row.key] = safeStorage.decryptString(value.subarray(PREFIX.length));
      }
      return values;
    },

    close() {
      db.close();
    },
  };
}

module.exports = { createSecureStore };
