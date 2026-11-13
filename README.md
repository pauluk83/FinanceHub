# FinanceHub

FinanceHub is a personal-finance app for Windows and the web, built from a real
household budget rather than a generic template. It keeps a full transaction ledger,
bank and card balances, people and shared spending, recurring bills, provider ledgers and
month-end figures in one place, with the same calculation core behind the desktop app and
the hosted build.

**Download the Windows app:** [latest installer](https://github.com/pauluk83/FinanceHub/releases/latest)
· [all releases](https://github.com/pauluk83/FinanceHub/releases) · [hosted app](https://financehub.freedev.app/)

The installer is unsigned, so Windows may show an unknown-publisher warning. Each
release also attaches `SHA256SUMS.txt` for verification.

## What it does

- **Dashboard** with income, expenses, net, money owed, bills and month-by-month balances.
- **Ledger** for transactions, CSV staging and duplicate review, with locked historical
  months that are never silently rewritten.
- **Accounts and cards** with running balances and statements, plus **People** for money
  borrowed and repaid.
- **Bills** with effective-dated price changes, one-off charges, scheduled totals and
  month-end locking.
- **Provider ledgers** for eight providers: reorder rows, record manual balance anchors,
  track total paid, rename or hide a provider and store a logo with the budget.
- **Budget changelog** recording changes to bills, balances, people and month-end figures.
- **Application changelog** at `#app-changelog` and in Tools, generated from
  [`CHANGELOG.md`](./CHANGELOG.md) on every build.
- **Credential vault** for provider logins: PBKDF2-SHA-256 + AES-256-GCM, unlocked by a
  passphrase that is never stored or synced.
- **Local app lock** for device-only workspaces: a 4–8 digit PIN, idle auto-lock and
  throttled retries. This is a screen barrier, not database encryption.
- **Cloud sync** (optional): Supabase sign-in, whole-document sync, an outbox with
  retries, conflict snapshots and a conflict-review screen.
- **People statements**: device-local read-only statement sign-ins scoped to one person.
- **Backups and restore**: JSON export/import with validation and a safety copy.
- **Menu layout** and theme preferences, with a fixed Tools section.

## Privacy and data

This repository is public, so it contains **no personal budget data**. The real
`data/workbook.json` is gitignored, and builds without it fall back to the blank
`data/web-seed.json`. The hosted app starts from that blank seed; a demo budget is
generated in the browser and never touches an account.

Cloud mode stores the budget in Supabase behind row-level security. Provider credentials
are end-to-end encrypted inside the synced document; the rest of the budget is not
end-to-end encrypted, so treat the hosted deployment as private. See
[`COMPLIANCE.md`](./COMPLIANCE.md) and the security findings in [`PLAN.md`](./PLAN.md).

Sign-in requires Supabase environment variables (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) in `.env`; nothing secret is committed. Without them the app
still opens in local or demo mode.

## Development

Requirements: Node 26 (the TypeScript core runs directly through type stripping) and npm.

```bash
npm install
npm run dev:web           # Vite UI at http://localhost:5173
npm run build:web         # production renderer -> dist/
npm run build:web:hosted  # hosted bundle -> dist-web/
npm run desktop           # build the renderer and open the Electron window
npm run dist:win          # unsigned x64 NSIS installer -> release/
npm test                  # full test suite
npx tsc -p app/tsconfig.json --noEmit
```

`npm run extract` re-derives the workbook JSON from the archived spreadsheet, which is
not part of this repository. `node import/migrate.mjs` seeds the local SQLite database and
writes a reconciliation report; that path needs the private workbook.

## Architecture

```
core/engine.ts          pure calculation engine, integer pence, no I/O or clock
core/sync-client.ts     outbox, cursor, retry and conflict planning
app/                    React renderer (views, theme, legal documents)
electron/main.cjs       Electron main process, secure store, CSP and navigation lock
db/migrations/          local SQLite migrations
db/migrations/postgres/ Supabase schema, RLS and sync RPCs
scripts/                release, deploy, changelog and GitHub release tooling
tests/                  engine, sync, backup, security and coherence tests
```

All money is integer pence at every boundary. Dates are ISO `YYYY-MM-DD`. The renderer
and the desktop app read the same core, and both report the version from `package.json`.

## Releasing

A release is one command, then one tag:

```bash
FTP_PASSWORD=… npm run release -- "Short description of the change"
git add -A && git commit -m "…"
git tag v2026.11.9
git push origin main v2026.11.9
```

`npm run release` takes its version from the release date (`YYYY.M.D`), appends the note
to `CHANGELOG.md`, regenerates the in-app changelog, rebuilds the Windows installer and
the hosted bundle, deploys the website and checks live parity. Later releases on the same
day append to the same section. Use `--no-deploy` when FTP credentials are unavailable.

Pushing a `v*` tag runs [`.github/workflows/release.yml`](./.github/workflows/release.yml),
which builds the installer on `windows-latest` and attaches two assets to the GitHub
Release:

- `FinanceHub-Setup-<version>.exe` — the dated installer for this release, also used by the app's download link
- `SHA256SUMS.txt` — SHA-256 checksum of the installer

The hosted website no longer carries installer parts. `npm run release:check` verifies the
version, changelog, generated changelog and hosted bundle; when a GitHub release exists it
also compares its installer checksum with the local build.

## Changelog rules

- [`CHANGELOG.md`](./CHANGELOG.md) is the application changelog and is **append-only**. A
  new release adds a dated section at the top; older sections are never renamed, merged or
  removed.
- The **Budget changelog** is different: it is budget data (bills, balances, people and
  month-end figures) stored in the dataset, synced and included in backups. UI-only
  preferences do not create entries.

## Status and limitations

Implemented: the calculation core and workbook parity, the Windows/web UI, cloud sync,
the credential vault, people statements, app lock, year rollover, provider setup and
ledgers, menu layout, legal documents, the two changelogs and GitHub release publishing.

Outstanding: iOS, bank linking, passkeys in the packaged desktop window, packaged-app
checks, a live passkey ceremony test, a throwaway-account deletion test and professional
review of the compliance drafts. The
pre-rotation conflict history and old backups were purged by the owner on 13 November
2026; the Supabase deletion function and passkey backend were configured the same day.
SQLCipher full-database encryption is deferred; the DPAPI-backed value store remains the
accepted design. Automatic daily restore points and Playwright browser coverage are
implemented. [`PLAN.md`](./PLAN.md) is the single source for the
roadmap, release gates and security findings.

## Owner and licence

FinanceHub™ is designed, built and owned by **Zane Stanton**. © 2026. All rights
reserved; the source is published for transparency and review, not under an open-source
licence. See the in-app Privacy Policy, Terms of Service and EULA, or
[`COMPLIANCE.md`](./COMPLIANCE.md).
