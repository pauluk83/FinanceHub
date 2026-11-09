# Schema migrations

The schema is versioned. Each change is a new numbered file; nothing edits an
earlier migration once it has been applied anywhere.

## Naming and order

`NNNN_lower_snake_name.sql`, starting at `0001`, with no gaps or duplicates. The
runner rejects a badly named, empty, duplicated or out-of-sequence file rather
than guessing, and applies files in filename order.

## Local SQLite

Files directly in this folder target the local database and are applied by
`db/migrations.ts`:

```bash
node import/migrate.mjs   # rebuilds data/financehub.db from data/workbook.json
```

`import/migrate.mjs` opens the database, applies every pending migration, then
seeds it. Applied versions are recorded in `schema_migrations`, so re-running is
a no-op and a failure rolls that file back instead of leaving a half-migrated
database.

| Version | Adds |
| --- | --- |
| 0001 | Core budget tables: settings, accounts, people, cards, bills, bill changes, income schedules, transactions, month locks, holidays, changelog |
| 0002 | Provider statement/charge rows |
| 0003 | Encrypted credential vault and audit log |
| 0004 | Conflict review queue |

## Cloud Postgres

`postgres/` holds the Supabase schema, applied by hand in the SQL editor in
order:

1. `postgres/0001_initial.sql` — tables, RLS policies, tombstones.
2. `postgres/0002_sync.sql` — `settings.state_json`, server clock, revision
   triggers and the push/pull functions.

The runner in `db/migrations.ts` only manages SQLite; Postgres migrations are
deliberately explicit because they also carry policies and functions that need a
reviewed apply.

## Adding a change

1. Add the next number, e.g. `0005_add_budget_categories.sql`.
2. Use `IF NOT EXISTS` for new objects and never rewrite old rows destructively.
3. Back up before applying to a database with real data.
4. Update `PLAN.md` §1 and the README schema list if the shape changes.
