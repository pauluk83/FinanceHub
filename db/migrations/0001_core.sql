-- 0001 — core budget tables.
-- Every mutable row carries sync metadata so offline edits can merge without loss.
-- All money is INTEGER pence.

CREATE TABLE IF NOT EXISTS settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  target_year       INTEGER NOT NULL,
  start_month       INTEGER NOT NULL,
  currency          TEXT NOT NULL,
  months_in_year    INTEGER NOT NULL,
  as_of_date        TEXT NOT NULL,
  lock_cutoff       TEXT NOT NULL,
  anchor_date       TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  rev               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS accounts (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  target_pence      INTEGER NOT NULL DEFAULT 0,
  opening_pence     INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  rev               INTEGER NOT NULL DEFAULT 1,
  device_id         TEXT
);

CREATE TABLE IF NOT EXISTS people (
  id                TEXT PRIMARY KEY,
  short_name        TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  opening_pence     INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  rev               INTEGER NOT NULL DEFAULT 1,
  device_id         TEXT
);

CREATE TABLE IF NOT EXISTS cards (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  limit_pence       INTEGER NOT NULL DEFAULT 0,
  opening_pence     INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  rev               INTEGER NOT NULL DEFAULT 1,
  device_id         TEXT
);

CREATE TABLE IF NOT EXISTS bills (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  amount_pence          INTEGER NOT NULL DEFAULT 0,
  due_day               INTEGER NOT NULL DEFAULT 1,
  linked_sheet          TEXT,
  frequency             TEXT,
  latest_balance_pence  INTEGER NOT NULL DEFAULT 0,
  latest_payment_pence  INTEGER NOT NULL DEFAULT 0,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  active                INTEGER NOT NULL DEFAULT 1,
  effective_from        TEXT,
  payment_method        TEXT,
  base_amount_pence     INTEGER NOT NULL DEFAULT 0,
  base_due_day          INTEGER NOT NULL DEFAULT 1,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT,
  rev                   INTEGER NOT NULL DEFAULT 1,
  device_id             TEXT
);

CREATE TABLE IF NOT EXISTS bill_changes (
  id                    TEXT PRIMARY KEY,
  bill_id               TEXT NOT NULL REFERENCES bills(id),
  applies_from          TEXT,
  applies_to            TEXT,
  amount_override_pence INTEGER,
  due_date_override     TEXT,
  change_type           TEXT,
  note                  TEXT,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT,
  rev                   INTEGER NOT NULL DEFAULT 1,
  device_id             TEXT
);

CREATE TABLE IF NOT EXISTS income_schedules (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('PIP', 'UC')),
  month_label   TEXT NOT NULL,
  year          INTEGER NOT NULL,
  pay_date      TEXT,
  amount_pence  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kind, year, month_label, pay_date)
);

CREATE TABLE IF NOT EXISTS transactions (
  id                TEXT PRIMARY KEY,
  tx_date           TEXT NOT NULL,
  account           TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('Income', 'Expense')),
  amount_pence      INTEGER NOT NULL,
  comments          TEXT,
  status            TEXT,
  budget_treatment  TEXT CHECK (budget_treatment IN ('', 'Transfer', 'Refund', 'Ambiguous')),
  source_row        INTEGER,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  rev               INTEGER NOT NULL DEFAULT 1,
  device_id         TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_tx_account_date ON transactions(account, tx_date);

CREATE TABLE IF NOT EXISTS month_locks (
  year                    INTEGER NOT NULL,
  month                   INTEGER NOT NULL,
  balanced                INTEGER NOT NULL,
  locked_at               TEXT,
  snapshot_income_pence   INTEGER,
  snapshot_expenses_pence INTEGER,
  snapshot_net_pence      INTEGER,
  snapshot_owed_pence     INTEGER,
  source                  TEXT NOT NULL DEFAULT 'workbook',
  PRIMARY KEY (year, month)
);

CREATE TABLE IF NOT EXISTS holidays (
  id            TEXT PRIMARY KEY,
  year          INTEGER NOT NULL,
  event         TEXT NOT NULL,
  start_date    TEXT,
  end_date      TEXT,
  nights        INTEGER,
  ref           TEXT,
  status        TEXT,
  notes         TEXT,
  paid          TEXT,
  total_pence   INTEGER,
  total_text    TEXT,
  address       TEXT,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  rev           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS changelog (
  id            TEXT PRIMARY KEY,
  entry_date    TEXT NOT NULL,
  sheet_cell    TEXT,
  description   TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
