-- 0003 — encrypted credential vault and audit log.
-- Only ciphertext lives here. Keys are held in Windows DPAPI / iOS Keychain and
-- never in the database or on the server.

CREATE TABLE IF NOT EXISTS credential_vault (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  username      TEXT,
  ciphertext    BLOB NOT NULL,
  nonce         BLOB NOT NULL,
  kdf           TEXT NOT NULL DEFAULT 'argon2id',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  rev           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  detail        TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
