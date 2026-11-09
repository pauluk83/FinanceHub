-- 0004 — conflict review queue. Both versions are retained until a human
-- resolves them; nothing is discarded automatically.

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id              TEXT PRIMARY KEY,
  entity          TEXT NOT NULL,
  record_id       TEXT NOT NULL,
  local_json      TEXT NOT NULL,
  remote_json     TEXT NOT NULL,
  local_rev       INTEGER NOT NULL,
  remote_rev      INTEGER NOT NULL,
  detected_at     TEXT NOT NULL,
  resolved_at     TEXT,
  resolution      TEXT
);
