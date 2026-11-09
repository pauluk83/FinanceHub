-- 0002 — provider statement/charge rows (rent, water, Ovo, council tax, Park
-- Xmas, Pure Cremation, O2, Virgin). Running balances stay authoritative as
-- imported; edits recalculate through core/providerLedger.ts.

CREATE TABLE IF NOT EXISTS provider_entries (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  entry_date    TEXT,
  month_label   TEXT,
  description   TEXT,
  ref           TEXT,
  amount_pence  INTEGER NOT NULL DEFAULT 0,
  payment_pence INTEGER NOT NULL DEFAULT 0,
  balance_pence INTEGER,
  meta_json     TEXT,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  rev           INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_provider_date ON provider_entries(provider, entry_date);
