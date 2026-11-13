# FinanceHub — master plan

Last updated: 2026-11-13
Status: **Phases 1–3 delivered; live Google sign-in and one-account cloud sync verified; encrypted credential vault, people statement sign-ins, feedback, Data Health, per-record audit/trash, transaction categories and tags, the in-app notification centre, guided first-run choice, encrypted backup v2 with seven restore points and automatic daily points, provider balances in locks, All-years statements, backup/sync health diagnostics, TOTP MFA, self-serve cloud deletion, Playwright click-through tests and Excel/print report exports delivered. The owner confirms exposed provider passwords are rotated; the GitHub v2026.11.13 tag, source archives and CI-built installer are published; build `9d20ad542569` is deployed at `https://financehub.freedev.app/`, and the owner has verified the personal Starling balance and the month-scoped duplicate review. The A-02 cloud-payload guard and the Card payment flow are live in that bundle. P0-8 is closed: the owner ran the conflict purge and removed the old pre-rotation backup files on 2026-11-13. Not release-ready — passkey enrolment UI, packaged-security checks, a throwaway-account deletion test and bank linking after C-4 remain**

This is the single plan for FinanceHub: what is built, workbook parity, architecture, security findings, release gates, the product roadmap, bank linking, authentication setup, delivery phases, and the UK/Microsoft/Apple compliance workstream. It replaces the former `PLAN.md`, `PRODUCTION_READINESS.md`, `AUTH_SETUP.md` and `FEATURE_ROADMAP.md`; nothing is tracked elsewhere.

Status key: `[x]` done/verified · `[~]` implemented, verification pending · `[ ]` not started  
Effort (roadmap sections only): **S** small · **M** medium · **L** large · **XL** separate product/security workstream

## Contents

1. Current state
2. Workbook parity
3. Architecture
4. Security findings
5. P0 — stop-ship gates
6. P1 — required for a credible first release
7. P2 — launch quality
8. Trust, traceability and reconciliation backlog
9. Feature roadmap
10. Secure bank linking
11. Authentication and cloud setup runbook
12. Delivery phases
13. Acceptance, sync rules and security design
14. Compliance workstream — UK, Microsoft and Apple
15. Current iteration
16. Decisions and open items
17. Verification log
18. Notes and constraints
19. Competitor gaps and non-goals
20. Single-file dataset storage
21. Audit remediation plan — 2026-11-07
22. Progress scorecard and competitor refresh — 2026-11-08

---

## 1. Current state

| Artifact | Path | Status |
| --- | --- | --- |
| Workbook importer (all 22 sheets, cached values, integers-in-pence) | `import/extract.mjs` | Working |
| Canonical dataset | `data/workbook.json` | 1,120 transactions, 6 banks, 10 people, 4 cards, 17 bills, 7 bill changes, 216 provider rows, 106 seed changelog entries, 2027/2028 provider blocks, product-sheet content |
| Calculation engine (pure, platform-neutral TypeScript) | `core/engine.ts` | Working for 2026 parity + open-month projection |
| Parity gate | `tests/parity.test.ts` | Passing (adjusted for internal transfers and post-workbook rows) |
| Local database schema | `db/migrations/` (0001–0004), `db/migrations.ts` | Versioned migrations applied by `import/migrate.mjs`; re-running is a no-op |
| Cloud schema (Postgres/Supabase, RLS, tombstones) | `db/migrations/postgres/` (0001–0002) | Applied in order in the Supabase SQL editor |
| SQLite seeder + reconciliation report | `import/migrate.mjs` | 10/10 checks, 12/12 months |
| Import report | `reports/reconciliation.md`, `.json` | Generated |
| Windows desktop UI (Electron + React, all views, dark/light theme) | `app/`, `electron/main.cjs` | Working; installer unsigned; signed-in local mode exposes Sync, Exit and Log out |
| Sync client | `core/sync-client.ts` | Implemented for the whole document; one-account live sync verified, multi-account/offline/conflict tests pending |
| Credential vault | `app/src/vault.ts`, Settings and provider views | PBKDF2-SHA-256 + AES-256-GCM; ciphertext in `AppState.vault`; passphrase never stored; legacy fields migrate and are stripped on setup; 6 crypto/migration tests passing |
| People statement sign-ins | `app/src/portal.ts`, `app/src/views/peoplePortal.tsx` | Settings creates a per-person username/password (PBKDF2-SHA-256, 600,000 iterations, 16-byte salt); `#people` opens a read-only statement scoped to that person; snapshots refresh on save; device-local only and explicitly not a security boundary; 6 tests |
| Provider setup (onboarding step 5) | `app/src/providerSetup.ts`, `app/src/views/providerSetup.tsx` | Adds or re-enables any of the eight provider ledgers, hides one while keeping its data, renames it, stores a custom PNG/JPEG/WebP logo (≤200 KB data URL) and edits metadata-driven account/detail fields; provider ledger rows support persistent up/down ordering with carry-forward recalculation; `tests/provider-setup.test.ts`, `tests/provider-ledger.test.ts` |
| Sidebar menu layout | `app/src/nav.ts`, `app/src/views/menuLayout.tsx` | Settings → Menu layout hides items and moves them between Overview, Ledger and Providers; Tools is static and cannot be hidden or moved; overrides live in `settings.navLayout`; `tests/nav.test.ts` |
| Legal, privacy and IP | `app/src/legal/`, `COMPLIANCE.md` | Privacy Policy, Terms of Service and EULA published in-app and linked from sign-in and Settings; owner, © 2026 and FinanceHub™ notices; applicability matrix records UK GDPR as applicable and PCI DSS, Open Banking/PSD2, FCA, MSB/KYC-AML as out of scope for a read-only budgeting app; TOTP MFA and self-serve deletion implemented (deletion SQL applied 2026-11-13; throwaway-account test pending); passkey backend configured but enrolment/sign-in UI not built; email verification pending; 4 tests |
| Live cloud workspace | Supabase `settings.state_json` | Google sign-in working; remote revision 16 carries the encrypted vault with no legacy credential fields; password rotation confirmed; owner purged conflict history and old pre-rotation backups on 2026-11-13 |
| Hosted static web build (financehub.freedev.app) | `app/vite.config.ts`, `data/web-seed.json`, `dist-web/` | Deployed to InfinityFree `financehub.freedev.app/htdocs` with a root base; the FTP service was unreachable on 2026-11-09, so build `89bb71db76a1` was uploaded through the signed-in file manager. It serves `assets/index-0QAIytWd.js` and `assets/index-BkBanxRO.css`; local and live SHA-256 hashes match for the document, JS and CSS; app-wide feedback, the Dashboard unread notice, editable provider-ledger **Balance** and **Total paid** columns and the O2/Virgin **Bill** column are live; the footer version comes from `app/src/version.ts`, baked from `package.json` by Vite, so the web build and the Windows app report the same number; the login page and Tools carry an **Application changelog** regenerated from `CHANGELOG.md` on every build, and the Windows installer is published as a GitHub Releases asset instead of on the web host; login, local and demo flows load at `https://financehub.freedev.app/`; Supabase Site URL/redirect allow-list includes `https://financehub.freedev.app/`, `https://financehub.freedev.app/**` and the desktop callback; vault rev 16 clean; owner confirmed the pre-rotation purge on 2026-11-13; the remaining release gates are the passkey UI, packaged checks, a throwaway-account deletion test and legal review |

Commands:

```bash
npm install          # dependencies
npm run extract      # workbook -> data/workbook.json
npm test             # full suite: parity, rent/water, backup, sync, schema, RLS
node import/migrate.mjs   # seed data/financehub.db + report
npm run dev:web      # Vite UI at http://localhost:5173
npm run build:web    # production renderer -> dist/
npm run build:web:hosted  # static /FinanceHub site -> dist-web/
npm run desktop      # build + open the Electron window
npm run dist:win     # unsigned x64 NSIS installer -> release/
```

Workbook baseline vs live app. The workbook is retired; the live ledger intentionally excludes internal transfers and includes later confirmed corrections.

| Figure | Workbook baseline | Live app |
| --- | ---: | ---: |
| YTD income | £30,382.43 | £27,583.24 |
| YTD expenses | £31,884.56 | £30,700.86 |
| YTD net | −£1,502.13 | −£3,117.62 |
| Total owed | £4,503.00 | £4,518.00 |
| November income / expenses / net | £2,465.74 / £2,726.90 / −£261.16 | £2,465.74 / £2,265.35 / +£200.39 |
| Credit-card balance | £0.00 | £0.00 |
| Rent ledger (as of 06/11/2026) | £983.29 | £983.29 |
| Scheduled bills, December | £883.15 | £883.15 |
| Starling balance | £649.61 (06/11) | £611.16 (07/11) |

### Audit snapshot — 2026-11-06

- `npm test`: **49/49 passing** (parity, rent/water changes, backup, sync, schema and RLS tests).
- `npm run build:web`: **passing**; renderer bundle is about **707 kB** with the existing chunk-size warning.
- `npm audit --omit=dev`: **0 production vulnerabilities**.
- Navigation: **all 24** sidebar/command-palette entries map to rendered views.
- 2026 workbook parity remains green for the covered figures.
- Statement carry-forward is verified for **all 9 people, all 4 cards and 5 of the 6 bank accounts** across 12 months and “All months”.
- **Statement reconciliation:** fixed 2026-11-08 — the Starling statement now closes at the anchor-aware Dashboard balance instead of the raw bank ledger (P0-7).
- **Not yet verified end-to-end:** live cloud authentication/sync, packaged UI navigation/CSP, and every interactive screen.
- **Security review:** critical credential exposure confirmed; see §4.

### Audit snapshot — 2026-11-07

This snapshot records the audit state before the later 2026-11-07 account, duplicate and import fixes; §17 and §21 record those changes.

- `npm test`: **106/106 passing**; `npx tsc -p app/tsconfig.json --noEmit` and `npm run build:web` clean; `npm audit --omit=dev`: **0 production vulnerabilities**.
- `data/workbook.json` is **481,337 bytes** and still carries non-empty `accessPassword` for Rent, Park Xmas and Council Tax, plus `accessBill` for Council Tax; the built renderer (`dist/assets/index-*.js`, 996,280 bytes) contains those fields.
- **12 transactions carry account names no total counts**: `Dan` (11 rows, £181) and `Credit Cards` (1 row, £30). They are preserved for parity but silently excluded from income and expenses.
- **22 groups** share date, account, type and amount; import duplicate detection does not compare staged rows with each other.
- Monthly provider rows are dated the 1st of the month, so a mid-month as-of balance includes the whole month's payment.
- The sync conflict queue can retain 25 full budget documents (about 12 MB) in `localStorage`, and a failed conflict write is silent.
- Verified later on 2026-11-07: Google sign-in, the signed-in local-data prompt, and one-account cloud sync (server revision 3, 1,120 transactions). Still not verified: two-account RLS, two-device/offline/conflict behaviour, packaged OAuth/CSP and full browser/desktop E2E.
- The full remediation queue is §21.

### Live verification — 2026-11-07 evening

- Google OAuth completed and the signed-in local-data prompt appeared.
- Keeping local now retains the account session and exposes **Sync**, **Exit** and **Log out**; Sign out still clears the session.
- Supabase `settings` held revision 3 / sync sequence 3 with 1,120 transactions; the account cache and server copy matched. The cloud includes the £6.50 Dan transaction.
- The leftover local-only copy has 1,121 transactions: a duplicate Dan £6.50 row and no unique material data. It was intentionally left in place.
- `npm test` **100/100**; `npx tsc -p app/tsconfig.json --noEmit` and `npm run build:web` clean.

---

## 2. Workbook parity

Built from `Income and Expenses 2026.xlsx` in this workspace. The workbook is not 16 sheets and it is not a static model.

### Structure

- **22 sheets**: Dashboard, Transaction Log, Monthly_Overview, Rent, Water, Council Tax, O2, Virgin, Park Xmas, Pure Cremation, Ovo, Statement, Starling Import, Changelog, Setup Wizard, Year Reset, Product Admin, Customer Guide — plus four **hidden** sheets (Starling CSV Raw, Settings, Month-End Guide, New-Year Setup).
- The original tab list omits **O2** and **Virgin** (both have full year-by-year ledgers) and treats **Holidays** as a sheet; it is actually a block on `Dashboard!A51:J78`.
- Original workbook: target year **2026**, target month **Nov**, as-of **06/11/2026**, lock cutoff **01/11/2026**, balance anchor **08/07/2026**. The live dataset is as-of **07/11/2026** after the confirmed post-workbook rows.
- Jan–Oct 2026 are `✓ Balanced` and locked; November is open; December is future.
- Original anchor-based Starling balance at 06/11/2026: **£649.61**; live app at 07/11/2026: **£611.16**.

### Rules extracted and implemented

| Workbook rule | Evidence | Engine implementation |
| --- | --- | --- |
| Future-month bills are projected; locked months are facts | Dashboard!H24:H35, Monthly_Overview!A3 | Locked Jan–Oct served from immutable imported snapshots; Nov/Dec recomputed |
| Lock cutoff = month start, previous month if day < 3 | Settings!C11 | `lockCutoff()` with tests for day 1/2/6 |
| PIP is additive per month, UC is single-valued | Settings!C94:L121; Monthly_Overview!C11 (SUMIF) vs C12 (XLOOKUP) | PIP sums schedule rows (Dec 2026 has two payments); UC takes one |
| Owed includes haircut income, monthly income excludes it | Dashboard!E24 vs B24 | Separate predicates, matching both |
| Starling balance is anchor-relative, not opening-relative | Monthly_Overview!N12 | `starlingBalance()`: posted cash + post-anchor people cash + Backup Space net + post-anchor PIP/UC − post-anchor bills |
| Card refunds reduce expenses | Monthly_Overview!U10 | Card Income tagged `Refund` subtracted |
| People spend tagged `(card)` affects debt but not cash | Monthly_Overview!N12 | Excluded from people-cash component only |
| Transfers are excluded from budget totals, kept in ledgers | Transaction Log!G | `isCash()` filters `Transfer` |
| Rent running balance is SUMIFS by date, not row order | Rent!E6 | `rentLedger()` aggregates all entries as-of |
| Bill change = latest matching override; same From/To = one-off | Settings!C45/D45, G66:M71 | Override resolution + one-off due dates (`Ovo@2026-09-27`, `PureGym £9.50`) |
| Bill visibility honours Effective From | Monthly_Overview bill mask | `billVisible()` |
| Weekly rent charge + £500 on the 27th | Rent!C7/C8 | Ledger preserved; balance verified |

### Data-quality findings (preserved, not "fixed")

These are logged in `audit_log` and the reconciliation report:

1. **`Credit Cards` account**: exactly one row, 27/02/2026, £30 expense. Not in Settings tables, so every workbook SUMIFS excludes it. Imported and flagged, never counted.
2. **`Dan`**: 11 transactions but no People account. They do not affect owed in the workbook; they are preserved and flagged.
3. **Ledger-only banks**: Barclays, Monzo, Revolut and Nationwide appear in the Transaction Log but are not part of monthly budget totals (which sum Starling/Petrol/Other/cards). They must stay visible in account ledgers without changing budget figures.
4. **Ambiguous holiday totals**: `:590` (Waterside 2027) and `:61.2` (Unity 2027) are text, not money. Preserved as `total_text` with `total_pence = null` and flagged.
5. **Plaintext credentials**: 3 pairs were present in `Settings!K6:K11` (Council Tax, Park Xmas, Rent), and the old imported seed carried non-empty credential fields for Rent, Water, Park Xmas, Ovo and Council Tax. On 2026-11-07 those fields were removed from `data/workbook.json` and `import/extract.mjs`; the new encrypted vault migrates any fields still present in an existing cloud document and strips them. Legacy builds, backups, conflict snapshots and the live cloud document must still be treated as exposed until migrated and rotated. See S-01 and P0-8.
6. **Historical bill amounts**: for locked months the workbook's bill block embeds manual/provider values that its own bill tables do not fully reproduce. Recomputing them would silently rewrite history, so locked months are imported verbatim. Open-month recomputation matches exactly (November and December).

### Statement correctness

Monthly statements carry prior transactions into the selected period, fixing the cumulative opening balance. Verified for all 9 people, all 4 cards and 5 non-Starling accounts across 12 months and “All months”; Steve's November 2026 statement opens and closes at £2,700.00.

Starling used to close on its raw ledger (November −£2,899.38 against a Dashboard balance of £1,075.40). Fixed 2026-11-08: the statement now uses the same anchor-aware legs as the balance, so every month closes at the Dashboard figure (P0-7).

---

## 3. Architecture

**One calculation core, two native shells.** All money is integer pence; no floats cross a module boundary. `core/engine.ts` is pure — no clock, network, filesystem or platform APIs — so the same code produces the same penny total everywhere.

```
                 ┌──────────────────────────────┐
                 │ core/engine.ts (TypeScript)  │
                 │ pure functions, pence only   │
                 └───────────────┬──────────────┘
             ┌───────────────────┴───────────────────┐
   Windows (Electron + React)                iOS (SwiftUI)
   - imports core directly                   - runs core in JavaScriptCore
   - keyboard-first, dark theme              - Face ID, push, share sheet
   - local SQLite via native layer           - local SQLite via GRDB
             └───────────────────┬───────────────────┘
                                 │  sync (HTTPS + Realtime)
                    Supabase Postgres + Auth + Storage
```

Why not a Rust core via UniFFI: it is the textbook parity answer, but it means rewriting the verified engine before any UI exists, and Rust is not installed in this environment. The TypeScript core is the single source of truth today; the JSON/pence contract is deliberately portable if a Rust port is warranted later. iOS embeds the bundled core in JavaScriptCore rather than calling a server, so offline use and penny parity survive without a network hop.

**Windows**: Electron shell + React/TypeScript renderer, because the Rust toolchain needed by Tauri is absent here. Vite builds the renderer; Electron loads `dist/`. Keyboard-first navigation (command palette, `Ctrl+K`, month arrows), dark palette sampled from the workbook plus a persisted light theme. Electron persists state and session tokens through a native SQLite/DPAPI secure store; the hosted web build uses `localStorage` as a cloud-synced cache and a blank public seed.

**iOS**: SwiftUI, GRDB/SQLite, JavaScriptCore for the engine, `TabView` + per-tab `NavigationStack`, Face ID via LocalAuthentication, push via APNs, CSV through a Share Extension, Keychain for keys.

---

## 4. Security findings — 2026-11-06

No secret values were read or printed during this review. Severity reflects the current implementation, not the intended architecture (§13 records the target design).

### Critical

- **S-01 — Provider credentials are exposed in shipped data and data flows.**
  - The source seed and importer no longer include `accessUsername`, `accessPassword`, `chargeLetterPassword` or `accessBill`; the canonical seed is covered by a regression test.
  - Provider logins now live only in the passphrase-derived AES-256-GCM vault (`AppState.vault`). The provider screen reads only the unlocked vault, and JSON backups strip legacy fields.
  - Existing cloud `settings.state_json`, retained `sync_conflicts` snapshots, old builds, old backups and the live cloud document can still contain the old plaintext fields until the vault is created and a clean revision is pushed. The migration cannot scrub every historical snapshot automatically.
  - `credential_vault` remains an unused normalised table; the current E2EE envelope is carried in the synced document.
  - **Required action:** create the vault on the desktop with the real legacy values, confirm a clean cloud revision, treat every old artifact as exposed and rotate every provider password. `data/workbook.json`, `dist/` and `dist-web/` are now ignored; the owner purged the retained pre-rotation snapshots and old backups on 2026-11-13.

### High

- **S-02 — Cloud budget documents are not end-to-end encrypted.**
  - Cloud sync stores the complete budget in `settings.state_json`; provider credentials are now an E2EE ciphertext envelope inside it, but the rest of the financial record is still plaintext.
  - RLS protects rows from other app users, but not from service-role access, project compromise, logical backups or database operators.
  - The vault uses PBKDF2-SHA-256 (600,000 iterations) + AES-256-GCM; the passphrase never reaches Supabase. Legacy plaintext fields remain until migration.
  - Remaining remediation: scrub old snapshots/backups, rotate exposed credentials, and consider encrypting the wider financial document.
- **S-03 — Device-only app lock delivered; Windows Hello remains.**
  - Device-only workspaces now have a PIN plus idle auto-lock, with persisted backoff and no PIN stored in the synced document. Locking also drops the unlocked vault session.
  - DPAPI protects stored values from other Windows accounts, not from anyone using the active Windows session; the PIN is a screen barrier, not disk encryption.
  - Remaining remediation: Windows Hello and SQLCipher.
- **S-04 — Web storage is plaintext.**
  - Without the Electron bridge, the web build stores the budget and Supabase session in browser localStorage.
  - Remediation: treat the web build as development-only, or add secure browser storage and a hardened deployment.
- **S-05 — RLS is not live-tested for multi-account isolation.**
  - RLS policies look correctly scoped to `auth.uid()` and static tests pass, but no real two-account Supabase test has been run.
  - Remediation: apply both SQL migrations to a test project and verify two-account isolation and two-device sync.
- **S-06 — The local database is not fully encrypted.**
  - The Electron store encrypts values with DPAPI inside SQLite; it is not SQLCipher.
  - Remediation: adopt SQLCipher or equivalent full-database encryption before claiming full at-rest protection.

### Medium

- **S-07 — CSP uses the configured origin, with a wildcard fallback.**
  - A valid `VITE_SUPABASE_URL` restricts `connect-src` to that exact HTTPS/WSS origin; an invalid or missing URL still falls back to `https://*.supabase.co` and `wss://*.supabase.co`.
  - Remaining remediation: remove the wildcard fallback and add an exact-origin regression test.
- **S-08 — CSV formula injection — fixed.**
  - `csvCell()` prefixes formula-leading values with an apostrophe before CSV quoting, while numeric values stay numeric.
  - Covered by `tests/import-safety.test.ts`.
- **S-09 — External URL scheme validation — fixed.**
  - Provider portal, bill and charge-letter URLs are accepted only as plain HTTP or HTTPS without embedded credentials, both in provider fields and on backup restore.
  - Covered by `tests/provider-setup.test.ts` and `tests/import-safety.test.ts`; React 19 still blocks script URLs defensively.
- **S-10 — Release artifact integrity is weak.**
  - The installer is unsigned and uses the default Electron icon. Code signing and signed auto-update were removed from scope by the owner on 2026-11-12; the unsigned installer is an accepted distribution risk.
- **S-11 — OAuth desktop callback still lacks an explicit callback test.**
  - The client uses Supabase PKCE and forwards `code`/`error` from the loopback callback.
  - Remaining remediation: add an automated forged/replayed callback test and document whether Supabase’s PKCE verification is the accepted state check.
- **S-12 — Backup/import content validation improved, but not exhaustive.**
  - Backup and CSV size/row caps, HTTPS URL validation and formula neutralisation are implemented and tested. Deep array/string limits and broader fuzz coverage remain.
  - Remaining remediation: bound nested payload sizes and extend import fuzzing.

### Low / compliance

- **S-13 — Development dependency advisories.** `xlsx` is a high-severity direct dev dependency with no fix; `electron-builder`/`minimatch` are moderate build-tool advisories. `npm audit --omit=dev` is clean; do not parse untrusted workbooks in development/build.
- **S-14 — Privacy lifecycle partly delivered.** Privacy Policy, Terms and self-serve account deletion are implemented; the deletion SQL is applied, and a throwaway-account deletion test, retention schedule and DSAR/breach runbooks remain.
- **S-15 — Authentication hardening partly delivered.** TOTP MFA is implemented and the passkey backend is configured; passkey enrolment/sign-in UI, email-verification review and live MFA/deletion testing remain.

### Existing controls

- No `dangerouslySetInnerHTML`, `eval` or direct `innerHTML` usage was found in the renderer; React escapes text.
- Electron uses context isolation, sandboxing, no Node integration, blocked webviews, HTTPS-only external links, IPC sender validation and a production CSP.
- The DPAPI-backed store fails closed when OS encryption is unavailable; SQLite queries are parameterised.
- RLS policies are scoped to `auth.uid()` by inspection; the production dependency audit is clean; `.env` is ignored.

---

## 5. P0 — stop-ship gates

- [x] **P0-1 — Explicit local-to-cloud consent**
  - [x] Automatic local-budget adoption removed from `loadState`.
  - [x] Signed-in prompt to import, start empty, or keep using local.
  - [x] Local copy is untouched unless **Import** is chosen.
  - [x] Live Google sign-in verified; the signed-in local-data prompt is shown.
  - [x] Keeping local retains the account session and exposes **Sync**, **Exit** and **Log out**.
  - [x] A stale local-only copy no longer needs to linger: Settings → Account offers **Remove local copy** once the account has a saved budget. It confirms first and deletes only the device document and its local recovery copies; the cloud budget and its sync metadata are untouched.

- [x] **P0-2 — Truthful persistence and recovery**
  - [x] Save failures surface a persistent banner and **Not saved** sidebar state.
  - [x] Top-level render error boundary added.
  - [x] Last-known-good document recovery; the unreadable copy is preserved.
  - [x] Editing and saving are blocked when no readable document or fallback exists.

- [x] **P0-3 — Restorable backups**
  - [x] Full JSON backup validation and restore added to Settings.
  - [x] A safety copy downloads before a restore.
  - [x] Parser covered by tests, including documents without `monthLocks`.
  - [x] Browser restore reached the safety-copy step; 21 holidays and 1,115 transactions were preserved.
  - [x] Encrypted backup export (format v2) with checksum and seven local restore points. Provider credentials are deliberately excluded because they live in the separate vault, not the budget document; a budget backup restores without exporting logins.
  - [x] Restore-to-parity test against the workbook figures — `tests/backup.test.ts` restores the canonical workbook backup and matches the Dashboard, Starling balance, bills total and all 12 monthly summaries.

- [~] **P0-4 — Electron security boundary**
  - [x] Navigation and redirects restricted to the packaged app page.
  - [x] External links restricted to HTTPS.
  - [x] IPC sender validation before secure-storage access.
  - [x] Production-only CSP injected into the built renderer.
  - [x] Webviews blocked; packaged builds disable DevTools and reload shortcuts.
  - [x] Single-instance lock and About dialog replace placeholder navigation.
  - [x] Packaged runtime smoke test: the unpacked build opens a responsive FinanceHub window.
  - [ ] Exercise packaged navigation, external-link blocking, CSP enforcement, secure storage and the OAuth callback inside the packaged app.

- P0-5 (Windows release engineering) and P0-6 (live cloud validation) were removed from scope by the owner on 2026-11-12.

- [x] **P0-7 — Statement correctness** — closed 2026-11-08.
  - [x] Monthly statements carry prior transactions into the selected period; verified for all 9 people, all 4 cards and 5 non-Starling accounts across 12 months and “All months”.
  - [x] Starling now closes on its anchor-aware balance: the primary-account statement adds scheduled bills, people cash, Petrol/Other and Backup Space on the same dates as `starlingBreakdown`, so every month closes at the Dashboard balance instead of the raw ledger. The Statement page says so under the table.
  - [x] Golden statement coverage added for the primary account in `tests/statements.test.ts`: closes at `starlingBalance` for all 12 months, month boundaries chain, and every line carries its running balance.

- [x] **P0-8 — Credential exposure remediation** (rotation confirmed; conflict history and old pre-rotation backups purged by the owner 2026-11-13)
  - [x] Remove `accessUsername`, `accessPassword`, `chargeLetterPassword` and `accessBill` from the canonical seed and importer; rebuild the desktop renderer from the clean seed. The hosted build already uses a blank seed.
  - [x] Hosted app is deployed privately at `https://financehub.freedev.app/` (root base); the old `https://recoverycommander.free.nf/FinanceHub/` deployment has been removed from the server. Live revision 16 carries the vault and no legacy credential fields. The pre-rotation snapshots and old backups were purged on 2026-11-13.
  - [x] Rotate every credential that has appeared in a build, backup or cloud workspace. The owner confirmed on 2026-11-09 that all exposed provider passwords are rotated; the values were not shared with the repository.
  - [x] Move provider credentials to a passphrase-derived AES-256-GCM vault; new writes carry ciphertext only and the provider screen never reads legacy fields.
  - [x] Remove old plaintext fields from the live `settings.state_json` by creating the vault, then verify the pushed revision — revision 16 is clean with an empty sync outbox and no conflicts.
  - [x] Purged the retained `sync_conflicts` snapshots and old pre-rotation backup files. The owner ran **Settings → Sync conflicts → Purge conflict history** and removed the old backups on 2026-11-13. Old builds remain historical artefacts and should not be redistributed.
  - [x] Exclude credentials from JSON backup exports.
  - [x] `data/workbook.json`, `dist/` and `dist-web/` are now in `.gitignore`. The public GitHub repository was initialized from a tree that excludes the workbook, local databases, build output and screenshots, so no personal history was published.
  - [x] Correct documentation claiming no secret values were imported.
  - [x] Add a source-seed regression test that rejects credential field keys; still add a built-artifact check (A-01).
  - [x] Build-time guard added: `tests/build-secrets.test.ts` scans `dist/` and `dist-web/` for a legacy credential field carrying a value, while allowing the vault's migration code to mention the field names. Registered in `npm test` and rerun after every release build.

**Distribution gate:** the pre-rotation snapshot/backup purge is complete. Do not distribute the current installer broadly until the passkey UI, packaged-app checks, throwaway-account deletion test and legal review are finished; the owner may continue using it privately.

- [x] **P0-9 — Money-integrity guardrails** — closed 2026-11-08.
  - [x] Classify every transaction account and fail closed on unknown values instead of silently excluding the row (A-04) — 2026-11-07.
  - [x] Deduplicate CSV imports within the staged batch as well as against existing rows (A-05) — 2026-11-07.
  - [x] The Dashboard shows a **Needs review** panel for unclassified accounts and a duplicate notice with the group count, row count and a Settings link. Both are read-only and delete nothing.

---

## 6. P1 — required for a credible first release

- [x] Conflict-resolution screen: diff summary, “use mine”, “use server”, export both; conflicts stored as metadata plus bounded snapshots (A-03). Delivered 2026-11-08 as **Settings → Sync conflicts**: 25 conflicts keep metadata, only the two newest snapshot pairs that fit 1.5 MB are stored, the server archive stores revisions and changed paths rather than documents, and resolution leaves the other pending edits untouched. Live two-device verification remains blocked on a second Supabase account.
- [x] Realtime propagation and reconnect resync. Implemented 2026-11-08: the sync engine subscribes to `postgres_changes` on its own `settings` row (RLS scoped), treats every event as a hint to run a normal cursor pull, ignores echoes at or below the known revision, and pulls again when the channel reports `SUBSCRIBED` after a reconnect. `online`, focus and visibility wakes were already wired. Live two-device confirmation remains blocked on a second Supabase account.
- [x] 2027/2028 provider data imported: all eight provider sheets, including Water, Council Tax, Ovo, Park Xmas, Pure Cremation, O2 and Virgin, plus the 2028 blocks where the sheet has one. Rent already carried 2027 entries.
- [x] Year rollover workflow and later-year views. Delivered 2026-11-08: a top-bar year selector views any year independently of the configured target year; the engine resolves each provider's imported year block for bill amounts (so 2027 O2/Virgin/Water/Ovo bills use their 2027 prices); provider views show later blocks read-only; Settings → Year rollover moves the target year and the as-of/cutoff anchors to the new year while leaving month locks, transactions, provider blocks and the balance anchor untouched, and records a budget-changelog entry. Covered by `tests/year-rollover.test.ts`.
- [x] Credential vault UI and encrypted key wrapping — PBKDF2-SHA-256 + AES-256-GCM, legacy migration, backup exclusion and cross-device ciphertext sync delivered 2026-11-07.
- [x] Credential-vault passphrase rotation and recovery UX. Delivered 2026-11-08: an unlocked vault can be re-keyed under a new passphrase with a fresh salt and a new PBKDF2 derivation (`rotateVault`), keeping the session usable and saving the on-screen logins in the same step; an optional length-bounded hint is stored unencrypted and shown on the locked screen, which now explains plainly that there is no reset, that the hint is the only reminder, and that deleting the vault preserves the budget and costs only the saved logins. Covered by `tests/vault.test.ts`.
- [x] Local-only application lock (PIN and idle auto-lock). Delivered 2026-11-09: device-only workspaces can set a 4–8 digit PIN stored as a PBKDF2-SHA-256 hash (600,000 iterations, random 16-byte salt) in device storage only, never in the synced document. The workspace starts locked, a top-bar **Lock** button locks immediately, and activity-based idle auto-lock (1/5/10/15/30 minutes, default 5) locks a hidden or unattended window. Wrong PINs back off from 5 seconds after three failures to a 30-second cap, persisted so a reload cannot reset them. Locking also discards the unlocked credential-vault session. The UI states plainly that this is a screen barrier, not encryption, and that a forgotten PIN cannot be recovered — removing the lock needs no data reset. Covered by `tests/app-lock.test.ts`. Windows Hello remains a native follow-up.
- [x] Manual encrypted restore points: seven newest retained, with checksum verification.
- [x] Automatic daily restore points, encrypted with a random device-bound key held in the secure store. Manual exports still use the owner's chosen passphrase; the newest seven points are retained.
- [x] Browser click-through coverage (`tests/e2e/demo.spec.ts`): demo navigation, transaction add/edit/delete, CSV staging and confirmation, month-end lock/unlock, encrypted restore-point creation/restore and statement totals. The four render-level tests in `tests/ui-smoke.test.mjs` still cover backup metadata, notifications and account security. Settings propagation and recovery remain covered by unit tests rather than a browser click-through.
- [~] Automated security regression tests. Built-artifact credential scanning, CSV formula neutralisation and HTTPS-only URL validation are covered. Remaining: exact Supabase CSP-origin and forged/replayed OAuth callback tests (A-01, A-12, A-13).
- [~] Security hardening. CSV formula cells are neutralised, URL schemes are validated and the CSP now fails closed with only the exact HTTPS/WSS Supabase origin. Remaining: document/test OAuth state handling (A-12, A-13).
- [ ] Provider schema validation and migration-based hydration so malformed data cannot blank the app and the seed cannot overwrite edits (A-07, A-08).
- [ ] Capacity guard: dataset-size warning, IndexedDB for the web build and a measured edit-latency budget (A-09).
- [ ] Separate the personal workbook seed from the distributable build (A-10).
- [~] SQLCipher deferred by the owner on 2026-11-13; the accepted design keeps the DPAPI-backed value store rather than adding a native SQLite encryption dependency.
- [ ] Keep hosted `/FinanceHub/` deployment blocked until P0-8 and browser storage are secured.
- [~] Build/release secret scan and sensitive-file ignore checks. `tests/build-secrets.test.ts` scans built bundles for legacy credential values; a regression test for the sensitive-file ignore rules remains.
- [~] MFA/passkeys and email-verification review. TOTP MFA and self-serve deletion are implemented and the deletion SQL is applied; the passkey UI, email-verification review and throwaway-account deletion test remain.
- [x] CI runs typecheck, the hosted build and the Playwright Chromium suite on every push. The full test suite needs the private workbook, so public CI runs it only when that file is present and otherwise skips it with a message; packaging remains outside CI.
- [ ] iOS client (separate Mac/Xcode track).

---

## 7. P2 — launch quality

- [ ] Accessibility and 125–200% scaling pass.
- [ ] Code splitting for the renderer bundle.
- [ ] Crash reporting with opt-in and no financial payloads.
- [x] Excel exports for the filtered transaction log and statements (SpreadsheetML, no runtime spreadsheet dependency) plus **Print / Save PDF** reports for both. PDF uses the browser/Electron print dialog so no report data leaves the device.
- [ ] Holiday search and filtering.
- [~] Privacy policy, terms and self-serve deletion delivered. Draft DPIA, retention schedule, DSAR procedure, breach runbook, privacy notice and evidence checklist are in `docs/compliance/`; the deletion SQL is applied; a throwaway-account deletion test and professional review of the drafts remain.
- [x] Redacted support diagnostics bundle from Data health: app/build, environment, dataset counts, health check identifiers and backup/sync timestamps only — no names, comments, amounts, credentials or raw messages.

---

## 8. Trust, traceability and reconciliation backlog

Added 2026-11-06. These are not additional P0 stop-ship items; P0-8 and P0-7 must be closed first. They are ordered by value, not by effort.

### Findings to address

- [x] **Statements expose the target year and All years.** The top-bar year selector and the Statements “All years” option are delivered.
- [x] **Month-end snapshots include provider balances.** Locks now record provider closes and statement references alongside the existing totals.
- [x] **Per-record audit history, revert and trash.** Transactions, accounts, people, cards, bills and bill changes are diffed at the update boundary; Transactions exposes history, revert and recently deleted restore.
- [ ] **Imported transactions have no import-run provenance.** A row knows its source row number but not which CSV, import batch or file created it. Add an `import_run` ID, source filename, imported-at timestamp and a one-click import undo.
- [x] **Backups have a version and checksum.** Encrypted format v2 records the format version and SHA-256 checksum and refuses a tampered payload; plain JSON restore remains available.
- [~] **Data Health screen — expanded.** Tools → Data health now includes failed-sync/pending-change and backup-age checks alongside account names, duplicates, provider year-chain breaks, linked bills, orphaned bill changes, locked-month drift, dormant accounts and unresolved conflicts. Direct statement-vs-snapshot comparison still relies on the locked-month balance check.
- [ ] **No “Explain this number” drill-down.** Every KPI should show its source rows, formula, month, account and overrides so users can understand why a figure differs from the workbook or an earlier month.
- [ ] **No session/device management.** Cloud accounts cannot see active devices, last sync, revoke a device or sign out all sessions. Add this alongside MFA/passkeys.
- [ ] **No accountant/tax-year export.** Add a pack containing transaction CSV, statement PDFs, income/expense summaries, locked-month snapshots, provider balances and a reconciliation note.

### Improvements to add

- [ ] **Transaction rules engine:** classify transfers, refunds, card payments and recurring merchants automatically.
- [ ] **Split and merge transactions:** split one payment across categories/accounts and merge duplicates.
- [ ] **Reconciliation assistant:** match imported CSV rows to existing ledger entries and flag differences, not just duplicates.
- [~] **Backup versioning and restore points:** encrypted format v2 and seven dated restore points are delivered. Still open: a diff between two points and restoring individual sections.
- [ ] **Property-based ledger tests:** assert invariants such as total owed equals the sum of people, statement closing equals cumulative balance, and account totals equal dashboard totals.
- [ ] **Import fuzz tests:** malformed CSV, huge files, odd dates, duplicate rows and formula-injection strings.
- [~] **Security regression tests:** credential scanning, URL-scheme rejection and CSV neutralisation are covered. Exact CSP-origin and OAuth state/callback tests remain.
- [ ] **Accessibility and scaling tests:** keyboard-only use, screen-reader labels and 125–200% Windows scaling.

### Features for later

- [ ] **Receipt OCR and attachments** linked to transactions and warranties.
- [ ] **PDF bank-statement import** with a review grid and duplicate detection.
- [~] **Notification centre and monthly digest.** The in-app centre for bills, low balances and card utilisation is delivered; the monthly “what changed” digest remains.
- [ ] **Bill price-change and renewal alerts.**
- [ ] **Safe-to-spend forecast** combining upcoming bills, income and known commitments.
- [ ] **Savings-goal auto-save rules.**
- [ ] **Household/shared budget roles**, after conflict resolution and per-record sync are solid.
- [ ] **Mobile/PWA quick-entry**, once the Windows data model and sync are stable.

### Deliberate order

1. [~] Data Health / Integrity Centre — screen delivered; add backup-age and failed-sync diagnostics when that metadata exists.
2. Per-record audit and undo.
3. Statement year selector and provider snapshots in month-end locks.
4. Backup checksum, format version and restore verification.
5. Import provenance and rollback.

---

## 9. Feature roadmap

Status: **planning — no feature in this section is release-approved.** Workbook parity remains the source of truth: new features must be additive and must not silently change the verified 2026 figures.

Competitor comparison, the gaps worth closing and the explicit non-goals are in §19.

### Guiding order

1. **Protect the data** — backups, encryption and app lock.
2. **Make imports trustworthy** — reconciliation and secure bank linking.
3. **Help users plan** — forecast, budgets, goals and alerts.
4. **Make collaboration safe** — conflicts, realtime and sharing.
5. **Improve reporting and daily speed** — exports, search and bulk actions.
6. **Expand platforms** — PWA and iOS after the Windows product is stable.

### A. Trust, safety and release

| Feature | Value | Effort | Depends on |
|---|---|---:|---|
| Encrypted backup export/import | Protects the complete budget outside the device | M | Backup format v2 |
| Scheduled backups and restore points | Recovers from mistakes without manual exports | M | Encrypted backups |
| Local app lock (PIN or Windows Hello) | Protects a device-only workspace, including local mode with no account | M | Electron secure store |
| Credential vault UI | Lets users store provider logins without plaintext | M | Existing vault schema |
| SQLCipher database encryption | Encrypts the whole local database, not just values | L | Native SQLite build |
| Auto-update and rollback | Delivers fixes without asking users to reinstall | L | Update feed |
| Branded icon and installer artwork | Removes the default Electron identity | S | Brand assets |
| CI for typecheck, tests, build and installer | Prevents regressions on every change | M | Repository runner |
| Automated UI tests | Covers add/edit/delete, import, restore, month-end and recovery | L | Stable test harness |
| Crash reporting | Finds production failures without financial payloads | M | Opt-in consent |
| Privacy policy, terms, account deletion and data export | Makes the product distributable and trustworthy | M | Cloud account flow |
| Support diagnostics and release notes | Speeds up support without exposing data | S | Redacted diagnostics format |

### B. Import, reconciliation and documents

| Feature | Value | Effort | Depends on |
|---|---|---:|---|
| Secure bank linking | Removes manual CSV exports while keeping bank credentials private | XL | Regulated provider, cloud backend |
| Bank reconciliation workflow | Matches imported rows to the ledger and resolves differences | M | CSV staging |
| Generic CSV mappings for other banks | Stops the importer being Starling-specific | M | Mapping schema |
| Receipt attachments | Keeps evidence next to transactions | L | Local storage; optional encrypted cloud storage |
| Import history and rollback | Lets users undo a bad import run | M | Import run IDs |

### C. Planning and money management

| Feature | Value | Effort | Depends on |
|---|---|---:|---|
| First-run model builder | Lets a stranger reach a populated budget from a CSV and a few questions instead of the workbook | M | Category model optional; guided setup |
| 12-month cash-flow forecast | Shows future low-balance days and bill clusters | M | Existing open-month engine |
| Bill and balance alerts | Prevents missed bills and unexpected overdrafts | M | Notification layer |
| Category budgets/envelopes | Shows budget versus actual without changing parity | L | Category model |
| Savings goals | Tracks target dates and required monthly contributions | M | Goal model |
| Debt payoff planner | Models interest, minimums and payoff order | M | Card/interest model |
| Net-worth view | Combines assets, liabilities and trend | M | Account/card model |
| Subscription and renewal tracker | Flags price increases, renewals and cancellation dates | M | Bills and provider contracts |
| Recurring transaction templates | Speeds up regular entries beyond scheduled bills | M | Transaction model |
| Holiday budgeting | Compares planned trip spend with actual | S–M | Holidays and transactions |
| Dashboard customization | Lets users choose the cards they use | S–M | Dashboard layout state |

### D. Cloud, sharing and account security

| Feature | Value | Effort | Depends on |
|---|---|---:|---|
| Conflict-resolution screen | Resolves both-sides-changed safely | M | Existing conflict records |
| Realtime propagation | Updates another device within seconds | M | Supabase Realtime |
| Per-record sync | Reduces conflict size and scales beyond one document | L | Normalised sync model |
| Household/shared budgets | Lets partners or family share one budget with roles | XL | Per-record sync, permissions |
| Passkeys/WebAuthn | Stronger, phishing-resistant sign-in | M | Supabase auth configuration |
| Conflict history and audit view | Shows what changed, when and on which device | M | Sync metadata |
| Account deletion and data export | Required for a credible privacy story | M | Cloud account flow |

### E. Reporting, search and daily speed

| Feature | Value | Effort | Depends on |
|---|---|---:|---|
| Excel/PDF reports | Annual summaries, statements and provider reports | M | Report templates |
| Global transaction search and saved filters | Finds records quickly across accounts and years | M | Query/filter layer |
| Bulk edit and undo | Speeds up corrections and protects against mistakes | M | Edit-history model |
| Accessibility and 125–200% scaling pass | Makes the app usable for more people | M | UI audit |
| Code splitting | Reduces the current ~707 kB renderer bundle | S–M | Route-level loading |
| PWA/mobile web | Read-only or basic entry without a native app | L | Responsive layout |

### F. Platform expansion

| Feature | Value | Effort | Depends on |
|---|---|---:|---|
| iOS client | Native mobile access, offline use and Face ID | XL | macOS/Xcode and Apple account |
| Shared core in JavaScriptCore | Keeps iOS penny parity with Windows | L | Core packaging |
| Push notifications on iOS | Bill, month-end and sync alerts | M | APNs |

### Recommended delivery phases

#### Feature phase 1 — Trust and release safety

1. Encrypted backups and restore points.
2. Local app lock.
3. Credential vault UI.
4. Branded icon.
5. CI, UI tests and crash reporting.
6. Privacy policy, account deletion and data export.

**Exit:** a user can recover from a lost or corrupted device and local-only mode is protected.

#### Feature phase 2 — Import and reconciliation

1. Generic CSV mappings.
2. Bank reconciliation workflow.
3. Import history and rollback.
4. Secure bank linking pilot.
5. Receipt attachments.

**Exit:** every imported row can be reviewed, matched, reversed and audited; the CSV path remains available if the bank connection is unavailable.

#### Feature phase 3 — Planning

1. 12-month forecast.
2. Bill and balance alerts.
3. Category budgets.
4. Savings goals and debt payoff.
5. Subscription tracker and recurring templates.
6. Net worth and holiday budgets.

**Exit:** users can plan forward without changing historical parity.

#### Feature phase 4 — Cloud collaboration

1. Conflict-resolution screen.
2. Realtime propagation.
3. Per-record sync.
4. Household sharing.
5. Passkeys and conflict history.

**Exit:** two devices and two users can edit without silent loss.

#### Feature phase 5 — Reporting and polish

1. Excel/PDF reports.
2. Global search and saved filters.
3. Bulk edit and undo.
4. Dashboard customization.
5. Accessibility and scaling.
6. Code splitting and PWA.

#### Feature phase 6 — iOS

Only after the Windows data model, sync and conflict rules are stable.

---

## 10. Secure bank linking

The detailed plan for the **Secure bank linking** panel in the Import screen. It is a planned feature, not a current connection.

### Goal

Let a signed-in user connect a UK bank account, import transactions and reconcile them without ever giving FinanceHub their bank password.

### Non-goals

- No screen scraping.
- No storage of bank usernames, passwords, PINs or one-time codes.
- No automatic posting into the ledger.
- No silent consent or background access after consent expires.
- No client-side storage of provider secrets or refresh tokens.

### Regulatory and provider gate

Select an **FCA-authorised Open Banking account-information provider** after a commercial, security and data-protection review. The provider must support:

- OAuth 2.0 authorisation-code flow with PKCE.
- A sandbox and production credentials.
- Consent expiry, revocation and re-consent.
- Webhooks or a reliable transaction-sync API.
- UK bank coverage, transaction history and account metadata.
- Clear data residency, retention and sub-processor terms.
- Server-side token exchange; no secret in the renderer.

Provider selection remains open. No provider should be integrated until the commercial and regulatory review is complete, and the FCA gate in §14 (C-4) is cleared.

### Architecture

```
Electron renderer
  └─ calls FinanceHub server endpoint only
       └─ Supabase Edge Function / token broker
            ├─ creates consent URL
            ├─ verifies state + PKCE
            ├─ exchanges code for tokens
            ├─ stores encrypted tokens server-side
            └─ fetches accounts and transactions
                 └─ writes staged rows to the user's workspace
                      └─ renderer review grid → explicit append
```

| Component | Responsibility |
|---|---|
| Import screen | Start connection, show status, choose accounts, review rows |
| Desktop callback | Receive the browser return with a one-time code; verify state |
| Server token broker | Exchange code, hold tokens, refresh, revoke |
| Provider API | Bank consent and transaction data |
| Database | Connection metadata, staged rows, mapping and audit records |
| Reconciliation engine | Duplicate/out-of-window checks and matching |

The existing Supabase OAuth loopback port is for authentication. Bank linking must use a **dedicated callback** (or a separate state namespace and port) so the two flows cannot be confused.

### User flow

1. User opens **Import → Secure bank linking**.
2. FinanceHub explains what will be shared and asks for consent to redirect.
3. The system browser opens the provider/bank consent page.
4. The user selects the bank and account.
5. The provider redirects back with a one-time code.
6. The server verifies state, exchanges the code and stores tokens server-side.
7. FinanceHub shows the linked account and asks which local account it maps to.
8. Transactions are fetched into the existing review grid.
9. Duplicate and out-of-window rows are flagged; nothing posts automatically.
10. The user approves rows; an import run and audit entry are recorded.
11. The user can disconnect at any time, which revokes consent and deletes tokens.

### Data model

Proposed server-side tables, all protected by row-level security:

- `bank_connections`
  - `id`, `user_id`, `provider`, `institution_id`, `consent_id`
  - `status`, `expires_at`, `last_synced_at`, `revoked_at`
  - encrypted access/refresh token fields, never returned to the client
- `bank_accounts`
  - `id`, `connection_id`, `external_account_id`, display name, currency, type
  - last-four digits only; no full account number
- `import_runs`
  - `id`, `user_id`, `connection_id`, `started_at`, `finished_at`, counts, status
- `import_staging`
  - `id`, `run_id`, `external_transaction_id`, booked date, amount pence
  - description, merchant, duplicate flag, out-of-window flag, decision
- `import_mappings`
  - provider account → FinanceHub account, with user confirmation
- `import_audit`
  - who connected, synced, approved, disconnected and when

### Security requirements

#### Credentials and tokens

- Bank credentials never enter FinanceHub.
- Provider client secrets and refresh tokens never enter the renderer.
- Tokens are encrypted at rest with a server-managed key; keys live in the platform secret store, not the repository.
- Logs contain no tokens, authorization codes, account numbers or raw payloads.
- Tokens are revoked and deleted on disconnect, account deletion and consent expiry.

#### Request integrity

- OAuth state and PKCE verifier are single-use and bound to the user session.
- Redirect URIs are exact allow-listed values; no wildcard origins.
- The callback is HTTPS in production. Loopback is allowed only for the desktop development flow.
- Provider webhooks are signature-verified and replay-protected.
- All mutations are same-origin and authenticated.
- Rate-limit connection, sync and revoke endpoints.

#### Data minimisation and correctness

- Request only account metadata and transaction history needed for the budget.
- Store external transaction IDs for idempotency.
- Re-syncing must not create duplicate ledger rows.
- Imported rows remain staged until the user explicitly approves them.
- Locked months and out-of-window rows cannot be posted by a sync.
- Every import records a reversible run ID.

#### Threat model

| Threat | Control |
|---|---|
| Phishing or fake callback | Exact redirect allow-list, state/PKCE, user-visible consent |
| Stolen refresh token | Server-only encrypted storage, rotation, revocation |
| CSRF on callback | Single-use state, session binding |
| Replay | One-time code, idempotency keys, webhook replay protection |
| Malicious provider data | Strict schema validation, amount/date limits, staging review |
| Cross-account data leak | RLS by `auth.uid()`, no client-supplied user IDs |
| Silent duplicate posting | External IDs, duplicate matching, explicit approval |
| Provider outage | CSV fallback, retry with backoff, clear connection status |

### UX states

- Not connected.
- Consent in progress.
- Connected, never synced.
- Syncing.
- Review required.
- Consent expiring soon.
- Re-consent required.
- Revoked.
- Provider unavailable; CSV import still available.

### Acceptance tests

- A user can connect in the sandbox and see only their own accounts.
- A second account cannot read the first account's connection, tokens or staging rows.
- A forged or replayed state is rejected.
- An expired consent requires re-consent; it never silently refreshes forever.
- A sync with duplicate transactions produces no duplicate ledger rows.
- Out-of-window and locked-month rows stay staged and cannot post.
- Disconnect revokes the provider consent and removes tokens.
- The renderer, browser storage, logs and network responses contain no provider secret or refresh token.
- A provider outage leaves the CSV importer usable.
- A failed import can be identified by run ID and reversed.

### Rollout

1. Provider and legal review; confirm FCA status and contract.
2. Build a mock provider and complete the staging/reconciliation flow offline.
3. Provider sandbox with one test bank and one test account.
4. Internal pilot with a real account and manual reconciliation.
5. Desktop production behind a feature flag.
6. iOS after the desktop flow is stable.

### Recommended first implementation slice

Build the **mock-provider staging and reconciliation path** first:

1. Add import-run and staging records.
2. Feed synthetic provider rows through the existing review grid.
3. Add duplicate, locked-month and out-of-window guards.
4. Add approve/rollback and audit logging.
5. Only then integrate a real provider.

This proves the safety model before any bank credential or token is involved.

---

## 11. Authentication and cloud setup runbook

FinanceHub asks on first run whether to use **Cloud sync** or **Local only**. Cloud sync uses the Supabase Auth gate below. It supports:

- Email and password, with email confirmation and password recovery
- Google OAuth

Apple and Microsoft sign-in were removed from the app and are not offered.

No provider secret or service-role key belongs in this project. The browser only receives the public project URL and anon/publishable key.

### 11.1 Create the Supabase project

Create a project at [supabase.com](https://supabase.com), then open **Project Settings → API** and copy:

- **Project URL**
- **anon public** or **publishable** key

Create a local `.env` file (it is git-ignored):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

Restart Vite after changing `.env`.

### 11.2 Configure redirects

In **Authentication → URL Configuration**:

- Set **Site URL** to the app origin, for example `http://localhost:5173`
- Add the same origin to **Redirect URLs**
- For the Windows desktop build, add `http://127.0.0.1:53682/auth/callback`

Add the production origin as well when there is one. OAuth and password-reset links must return to an origin on this allow list. The desktop callback listener binds only to loopback and expects port `53682` to be free.

### 11.3 Enable the providers

In **Authentication → Providers**:

- **Email**: enabled; configure the minimum password length (the app asks for at least 10 characters) and whether email confirmation is required.
- **Google**: add the Google OAuth client ID and secret.

The Google OAuth client needs the Supabase callback URL shown by Supabase. Apple and Microsoft provider setup is not part of the current app.

### 11.4 What this build protects

- When Supabase is configured, the whole FinanceHub UI is gated behind a valid Supabase session.
- OAuth uses the PKCE flow and sessions are refreshed by the Supabase client.
- Passwords are sent to Supabase Auth, never stored by FinanceHub.
- Local budget state is stored per Supabase user on this device. A pre-login local budget is never adopted automatically; the signed-in prompt offers sync, start empty, or keep local. Keeping local retains the account session so **Sync**, **Exit** and **Log out** remain available.
- A sign-out clears the local session even if the network request fails.
- Cloud sync stores the complete budget document in `settings.state_json`, with a local outbox, server-assigned pull cursor, retry backoff and revision-checked pushes. Both sides of a conflict are retained in `sync_conflicts`; a conflict-review screen is not built yet.

If the environment variables are missing, Cloud sync remains selectable but the login screen shows a setup notice and offers **Continue locally**. Local mode is a device-only workspace: it reads and writes the original local budget key, does not reserve the first-account ownership marker and does not sync automatically. It can be used without an account or while signed in; signed-in local mode offers manual **Sync**, **Exit** and **Log out**. Local mode without an account is not protected by a login and should not be used on a shared computer.

On Windows, the Electron build stores budget state and Supabase session tokens in a SQLite database under the app's user-data folder, with every value encrypted by Windows DPAPI through Electron `safeStorage`. The web development build falls back to browser localStorage. The current implementation is not SQLCipher; native SQLCipher packaging is still required before claiming full-database encryption at rest.

This is an access gate, not full at-rest encryption. The budget remains in local storage on this computer, so device access and OS disk encryption still matter. The sync client and server schema are implemented and one-account Google/cloud sync is live-verified. Two-account RLS, two-device/offline/conflict tests, conflict resolution and encrypted backups still require work in §5 and §6.

### 11.5 Apply the cloud schema

In the Supabase SQL editor, run `db/migrations/postgres/0001_initial.sql` first and `0002_sync.sql` second. The second file adds `settings.state_json`, the server sequence clock, revision triggers, `financehub_push_state` and `financehub_pull_changes`.

Cloud sync only runs for an authenticated cloud workspace. Local mode without an account creates no sync metadata and makes no sync requests. The sidebar reports pending changes, offline/paused state and retained conflicts.

### 11.6 Desktop note

Email/password works in the built Electron renderer. Google sign-in opens the system browser, returns to `http://127.0.0.1:53682/auth/callback`, and exchanges the authorization code in the renderer so the PKCE verifier stays in the secure desktop store. Register that callback URL in Supabase before using Google from the desktop app. If another process owns port `53682`, the desktop callback listener will fail and social sign-in will not complete.

---

## 12. Delivery phases

Estimates assume one experienced developer; they are not calendar promises.

### Phase 1 — Data model + migration — **complete**

Scope: canonical entities (Settings, accounts, people, cards, bills, bill changes, income schedules, transactions, holidays, changelog, provider ledgers), integer money, stable IDs, sync metadata, audit trail.

Delivered: `db/migrations/` (SQLite 0001–0004, Postgres 0001–0002), `db/migrations.ts`, `import/extract.mjs`, `import/migrate.mjs`, `reports/reconciliation.md`.

Exit criteria (met): all 22 sheets read; 1,115 transactions preserved; opening balances, anchor date and locked months preserved; key totals match to the penny; excluded/ambiguous rows audited.

### Phase 2 — Calculation engine with parity tests — **engine complete; rollover pending**

Delivered: monthly income/expenses/net/owed, YTD, savings rate, account and card balances, anchor-aware Starling balance, bills engine (visibility, overrides, one-off dates, provider tables), owed by person, statements, rent ledger, holiday sorting, lock cutoff. Tests cover the Starling N12 balance and M12 monthly flow, rent/water bill changes, backup parsing, sync revisions and conflicts, schema and RLS.

Remaining:

- People sign-ins are device-local snapshots, not owner-managed Supabase accounts: they work only in the browser/device where they were created and do not sync. Because the portal shares the browser with the owner app, it cannot stop the person opening FinanceHub itself; a real security boundary needs a backend, per-person auth and server-side statement scoping.
- Year rollover and later-year views. The 2027/2028 provider blocks are imported, but the engine and UI still target the configured year.
- [x] Water/Ovo/Council Tax/Park Xmas/Pure Cremation **running-balance APIs** — delivered 2026-11-08 in `core/providerLedger.ts`. The rules moved out of the app into the pure core, `balanceAsOf` / `balancePenceAsOf` query any sheet as of the budget date, and `recalculate` implements all four formulas including the savings plan restart after payoff (Park Xmas pays off in September and opens a new plan in October). The provider view now calls the core query instead of keeping its own copy.
- [ ] CSV staging rules (raw → flagged → ready → append, duplicate ±1 day, out-of-window) are implemented in the desktop UI; extract them into the engine for iOS reuse.
- [x] Statement **golden tests** — `tests/statements.test.ts` covers all 10 people, all 4 cards and all 5 non-Starling bank accounts, month-boundary chaining and line-by-line running balances. Starling stays excluded until P0-7 is fixed: its statement uses the raw ledger while the dashboard balance is anchor-adjusted.
- [x] **Property tests** — `tests/engine-invariants.test.ts` proves a new bill moves only the bill component, entities with no transactions change no total, the bill table has no 13-row cap (17 bills load and a 5-bill addition is fully scheduled), and removing one person moves owed by exactly their movements.

Exit criteria: every figure on Dashboard, Monthly, Statements and each provider sheet matches for every month **and** year; month-close/rollover/bill-change/transfer cases in the Changelog are test cases.

### Phase 3 — Windows app — **UI built; installer available**

- Electron/Vite scaffold, dark theme tokens from the workbook palette, 24-section shell.
- Dashboard (YTD cards, reconciliation with penny tolerance, utilisation, bills, holiday countdown), Monthly, Month end, Transactions (virtualised grid, keyboard entry, auto-lock status), Accounts, Cards, People, Bills, provider ledgers, Statements, Import, Settings hub, Changelog, Guides.
- Settings-first CRUD with instant propagation and no layout breakage (capacity checks mirroring auto-adjusting blocks).
- CSV picker + staging grid; export Excel/CSV/PDF.
- Keyboard-first: command palette, tab traversal, month navigation, focus restore.

Delivered: Electron + React shell, all workbook views, dark/light theme, command palette, month navigation, CSV staging and exports, validated backup restore, last-known-good recovery, render error boundary, single-instance lock.

Remaining: native SQLCipher layer, Excel/PDF export, accessibility pass. See P0-4 and P2.

### Phase 4 — iOS app — 4–6 weeks

- SwiftUI screens mirroring Phase 3; phone-first tab bar + stacks; iPad optional.
- JavaScriptCore bridge loading the bundled core; Codable DTOs; pence integers.
- Face ID/PIN unlock after first login; Keychain; share-sheet CSV import; APNs for bill due dates, month-close reminders and sync events.
- Full parity: no read-only screens.

Exit: two-device walkthrough; same figures to the penny; offline edit/reconnect.

Dependencies: macOS + Xcode, Apple Developer account, APNs key — none available on this Windows machine, so this phase cannot be built or verified here.

### Phase 5 — Sync & auth — partial

- Supabase project: `db/migrations/postgres/`, RLS on every table, per-user isolation.
- Auth: email + password and Google OAuth; passkeys/WebAuthn and secure reset are next. Apple and Microsoft are not offered; session tokens stay in Keychain/DPAPI, with optional PIN only after first login.
- Sync: outbox per device, `updated_at`/`rev`/`device_id` metadata, pull cursor, tombstones, idempotent upserts. Transactions are append-only; reference data is last-write-wins per record with a **conflict review screen** when both sides changed since the last sync. The losing version is stored in `sync_conflicts`, never discarded. Realtime channel per user for "within seconds" propagation.
- Tests: two accounts isolated; foreign-origin rejected; offline merge; conflict resolution; no silent loss.

Delivered so far: Supabase Auth gate and desktop OAuth callback; DPAPI-backed session/token storage; a cloud-only outbox/pull/push client for the complete `settings.state_json` document; server revision checks, idempotent operations, retry backoff and retained conflict records. Google sign-in and one-account cloud sync are live-verified (remote revision 3, 1,120 transactions). Signed-in local mode offers manual Sync, Exit and Log out. Local mode still creates no sync engine and makes no sync requests until Sync is chosen.

Remaining: run live email/password and sign-out tests, exercise the packaged OAuth/CSP path (P0-4), build the conflict-review screen, and add realtime propagation. The current client syncs the document, not individual normalised rows.

Exit: edit on iOS appears on Windows within seconds online; airplane-mode edits merge; reconciliation after merge is identical.

### Phase 6 — Import/export, guides, backups — 2–3 weeks

- CSV import UI end-to-end; never auto-post; duplicate ±1 day; out-of-window.
- Export Excel (values + rules sheet), CSV, PDF statements.
- In-app Month-End Guide and New-Year Setup (10 steps) as contextual wizards.
- Daily automatic local backups, restore points, full export; optional encrypted cloud backup.
- Credential vault migration flow: prompt for the workbook passwords, encrypt with AES-256-GCM, store ciphertext only.

Exit: restore from backup reproduces every figure; vault contains no plaintext; guides complete the month/year flows without leaving the app.

---

## 13. Acceptance, sync rules and security design

### Acceptance matrix

| Acceptance criterion | How it is proven | Today |
| --- | --- | --- |
| Dashboard/Monthly/Statements/bill sheets match to the penny | `npm test`, reconciliation report | 2026: pass except Starling statements; 2027/28 pending |
| Month-close, rollover, bill-change, transfer logic | unit tests from Changelog cases | bill changes/lock pass; rollover pending |
| iOS edit appears on Windows in seconds | Phase 5 two-device test | not built |
| Offline edits merge without loss | Phase 5 conflict tests | outbox/merge helpers tested; live two-device test not run |
| Settings CRUD propagates everywhere | Phase 3/4 UI tests | desktop UI supports; automated UI tests pending |
| Login/biometrics/sync production-grade, no plaintext | Phase 5 security review | auth gate and one-account document sync live-verified; two-account RLS, vault, SQLCipher and app lock pending |

### Sync and conflict rules

- Every mutable row: `updated_at`, `rev`, `device_id`, `deleted_at`.
- Push: outbox drained in order; server upsert is idempotent on `(user_id, id)`; server rejects `rev` older than stored.
- Pull: `updated_at > cursor` ordered; cursor persisted per device.
- Merge: transactions are immutable (append-only, soft delete only). Reference records use last-write-wins; if local and remote both changed since the last common rev, write both into `sync_conflicts` and keep local until reviewed.
- Settings/anchor date: never auto-merged. Anchor change is a protected action requiring confirmation on both devices; it changes the Starling formula.
- Reconciliation screen shows conflicts with old/new values and per-field choice.

### Security design (target state)

The current gaps against this design are in §4; the release gates are in §5 and §6.

- TLS 1.3 in transit; SQLCipher at rest on both clients; Supabase disk encryption.
- Passwords handled by Supabase Auth (Argon2id/bcrypt server-side); no password material in the app database.
- Passkeys (WebAuthn) next; biometric unlock gates a Keychain-held key, not a stored password. Apple sign-in is added only if the iOS/App Store workstream requires it; Microsoft sign-in is out of scope.
- Vault: AES-256-GCM, per-item nonce, key wrapped by DPAPI (Windows) / Keychain (iOS); ciphertext syncs, key does not.
- RLS: every table scoped to `auth.uid()`; no service-role key in client code.
- Audit log for structural changes; export/backup encrypted.

---

## 14. Compliance workstream — UK, Microsoft and Apple

Completing the engineering plan is **engineering readiness only**. UK data-protection duties, app-store rules and financial-regulation gates are separate workstreams with their own evidence and external sign-off; finishing every item above does not by itself make FinanceHub compliant, approved or certifiable.

Nothing in this section is a legal opinion. Each item needs confirmation from the named professional, registrar or platform, and several are impossible to complete from this repository or this Windows host.

Scope assumed for the current build:

- Controller: whoever distributes FinanceHub; the first release is a household/personal tool, but it still holds other named people's financial data.
- Distribution: direct Windows download first. Microsoft Store and the Apple App Store are optional tracks, opened only if the user wants them.
- No bank account linking, no card payments, no third-party analytics or advertising in the current build. Opening any of those adds a new gate below.

### C-1 — UK data protection (UK GDPR, DPA 2018, PECR)

- [ ] Confirm controller/processor roles and sign data-processing agreements with every processor in the path: Supabase (and its underlying host/region), any email provider used for auth, and any crash/analytics service added later.
- [ ] Record the lawful basis for each purpose and keep it in writing. Household use does not remove the duty; the named people in statements are identifiable individuals.
- [ ] Complete a DPIA before public distribution, because this is high-risk processing (financial data plus provider credentials plus cloud sync). Re-run it whenever a new data source ships: bank linking, receipt OCR, attachments, PDF import.
- [ ] Decide the international-transfer position: pick the Supabase project region deliberately and record the adequacy regulations or IDTA/addendum relied on if data leaves the UK.
- [ ] Check whether a data-protection fee is payable to the ICO and pay it if so; record the exemption relied on if not. Keep the registration reference.
- [ ] Publish a privacy notice covering what is collected, why, where it is stored, who it is shared with, retention, rights and a contact route. It must match the actual build, not the intended one.
- [x] Retention schedule and deletion procedure drafted in `docs/compliance/RETENTION_SCHEDULE.md` and `docs/compliance/DSAR_PROCEDURE.md`, covering cloud deletion, restore points, `sync_conflicts`, local copies and exports.
- [ ] Write a subject-access procedure that can answer within one month, including exporting one person's rows from statements and transactions.
- [ ] Write a breach procedure with triage, containment and the 72-hour ICO notification assessment, plus a member-notification step.
- [ ] Keep a record of processing if Article 30 applies.
- [ ] Review cookies, local storage and any telemetry for PECR compliance; if there is genuinely no analytics, document that so the claim can be defended.
- [ ] Apply data minimisation: provider credentials must be gone from the document before this pack is signed off (depends on P0-8).
- [ ] Document the household-member position: whose data appears, who can read it, and what happens when a person is removed from the dataset.

### C-2 — Microsoft and Windows distribution

- [ ] Record the distribution model. A direct download is not reviewed or approved by Microsoft; only Store submission is certified, and Microsoft does not approve direct installers.
- [ ] Microsoft Store track (only if chosen): Partner Center account, reserved app identity, age-rating questionnaire, privacy-policy URL, support contact and Store listing disclosures that match the real data flows.
- [ ] Review the Microsoft Store Policies that apply: distinctive functionality, security, personal-data handling and the financial-services policy (for example Policy 7.20). Fix anything the listing cannot honestly claim.
- [ ] Package for Store requirements (MSIX) and pass the Windows App Certification Kit; ensure a clean uninstall that leaves no budget or credentials behind.
- [ ] Publish installer hashes, an SBOM and release notes per build.
- [ ] Meet Windows accessibility expectations: UI Automation names, keyboard-only operation, contrast, focus order and 125–200% scaling.
- [ ] Provide a privacy policy link and a support/security contact in the app and on the download page.

### C-3 — Apple and iOS (only if that track opens)

- [ ] Apple Developer Program membership and an iOS build made and tested on Apple hardware; this cannot be built, signed or verified on this Windows host.
- [ ] App Privacy answers in App Store Connect that match the build: financial info, identifiers, usage and diagnostics, and whether any of it is linked to the user. No tracking in the current design.
- [ ] Guideline 5.1.1(v): in-app account deletion if account creation exists, plus a documented data-deletion path.
- [ ] Guideline 4.8: Sign in with Apple if third-party or social sign-in is offered.
- [ ] Guideline 5.1.1/5.1.2: privacy policy link, purpose strings and consent before any data sharing.
- [ ] Guideline 3.1.1 and payments rules if any feature is monetised inside the app.
- [ ] Export-compliance answer for encryption in App Store Connect, consistent with what the app actually uses.
- [ ] Guideline 2.1 review readiness: demo account or seeded demo data, review notes explaining local-only mode and that no bank connection exists, and a working review path with no dead ends.
- [ ] Decide whether iOS ships at all. If not, say so plainly rather than implying cross-platform support.

### C-4 — FCA and Open Banking gate (only if bank linking ships)

- [ ] Choose the model: become an authorised AISP, or partner with an authorised provider; confirm whether the RAISP exclusion could apply.
- [ ] If AISP: FCA authorisation, capital and conduct requirements, complaints handling, Open Banking Directory enrolment, strong customer authentication, consent dashboard and revocation flow.
- [ ] Apply Consumer Duty and financial-promotion rules if the app is offered to retail customers or marketed as a financial service.
- [ ] Keep "Secure bank linking" as a clearly labelled preview, with no credential collection, until this gate is cleared.

### C-5 — Security assurance and claim discipline

- [ ] Maintain a list of claims the app may make and claims it may not. No "bank-level security", "fully encrypted", "GDPR certified" or "approved by" wording without evidence.
- [ ] Commission an independent penetration test of the packaged Windows build, the OAuth callback and cloud RLS before any public security claim or enterprise sale.
- [ ] Consider Cyber Essentials / Cyber Essentials Plus if customers or insurers ask; ISO 27001 only if a real ISMS with audits exists.
- [ ] Publish a vulnerability-disclosure contact and a patch/support policy with a stated support window.

### C-6 — Consumer, accessibility and tax

- [ ] Consumer Rights Act 2015: accurate description, quality and remedies for digital content; terms of sale if the app is sold.
- [ ] Accessibility target: WCAG 2.2 AA plus the Equality Act 2010 reasonable-adjustments position; EN 301 549 if any public-sector buyer appears.
- [ ] VAT/income-tax treatment of any sales, separate from the ICO fee; record the decision.
- [ ] Refund route per channel, noting that Microsoft and Apple run their own refund processes.

### C-7 — Evidence pack per release

- [ ] Signed DPIA, privacy notice and retention/DSAR/breach runbooks.
- [ ] Processor list, DPAs and hosting region/transfer basis.
- [ ] Store-listing disclosures and privacy labels checked against the build.
- [ ] Penetration-test report and remediation record.
- [ ] Accessibility test record and scaling results.
- [ ] Installer hashes, SBOM, release notes and the claim list from C-5.

### Compliance order and gates

1. Close P0-8 (credentials removed) — data minimisation underpins C-1.
2. Complete the UK data-protection pack in C-1 before any public distribution.
3. Complete C-2 before publicising a Windows download.
4. Open C-3 only when an iOS build can be made and tested on Apple hardware.
5. Clear C-4 before any real bank connection.
6. Complete C-5 before any public security claim.
7. Assemble C-7 for every release; keep it with the build it describes.

External dependencies that code changes cannot satisfy: legal review, Apple hardware and account, ICO fee payment, any FCA application and third-party penetration testing.

---

## 15. Current iteration

Sequence chosen: low-risk, independently verifiable release work first.

**Immediate next:** add the passkey enrolment/sign-in UI, run the throwaway-account deletion test, and run the packaged-app security checks. The account-deletion SQL and passkey backend are configured in Supabase (see `docs/OWNER_ACTIONS.md`). The hosted bundle is live at `2026.11.13`, build `9d20ad542569`, with matching local/live hashes; the GitHub `v2026.11.13` tag and source archives are at `02c7bb0`, and CI built the installer with a matching checksum file. The owner has verified the personal budget after today's transaction and the month-scoped duplicate warning. The A-02 cloud-payload guard and the Card payment flow are live. P0-5 and P0-6 were removed from scope by the owner on 2026-11-12.

1. [x] Write and maintain this plan.
2. [x] Harden Electron navigation, external links, IPC and production CSP.
3. [x] Report persistence failures truthfully in the UI.
4. [x] Add validated restore for full JSON backups.
5. [x] Add explicit local-to-cloud import consent.
6. [x] Add a top-level render error boundary.
7. [x] Add last-known-good recovery and blocked-state handling.
8. [x] Windows NSIS installer builds. Code signing, auto-update and embedded-seed removal were removed from scope on 2026-11-12.
9. [x] Fixed Starling statement reconciliation and added full statement coverage (P0-7) — closed 2026-11-08.
10. [~] Complete packaged-security and automated UI smoke-test verification. Google sign-in, the local-data consent prompt and one-account cloud sync are verified; packaged OAuth/CSP and UI smoke tests remain.
11. [~] Data Health / Integrity Centre delivered, including failed-sync state and backup-age checks. P0-8 rotation is confirmed and the in-app conflict-history purge is delivered; running it and removing old backup files remains.
12. [~] Started the compliance workstream with the **DPIA and ICO pack**. It cannot be closed by code and it gates public distribution, any store submission and every regulatory or security claim.
13. [x] Added a safe **Remove local copy** action in Settings → Account. It removes only the device-only document and its recovery copies after confirming a saved cloud budget exists; it never uploads or resets cloud data.
14. [x] Added per-record audit history, revert and transaction trash/undo. Transactions, accounts, people, cards, bills and bill changes are diffed at the update boundary; Transactions exposes row history and recently deleted restore.
15. [x] Added one optional category and up to eight free-form tags to transactions, with filtering, CSV export and transfer-leg propagation. Labels never change calculations.
16. [x] Added the in-app notification centre for bills due within seven days, negative or low account balances and cards above 80% utilisation, with read state in the budget.
17. [x] Added a first-run choice between a blank budget and the demo workspace; both remain device/account-local until the owner saves or syncs.
18. [x] Added encrypted backup format v2 (PBKDF2-SHA-256 + AES-256-GCM), checksum verification and seven newest local restore points.
19. [x] Added provider balances and statement references to month-end locks, provider drift to Data Health, and an All years statement view.
20. [x] Added failed-sync, pending-change, missing-backup and backup-age diagnostics to Data Health.
21. [~] Added self-serve cloud account deletion and TOTP authenticator MFA. The deletion SQL is applied and the passkey backend is configured; the passkey UI and a throwaway-account deletion test remain.
22. [ ] Bank linking remains gated on C-4; no provider credentials or integration code have been added.

---

## 16. Decisions and open items

Decisions already taken:

- Release: refresh the existing `v2026.11.9` installer assets (done); retarget `v2026.11.9` so the source archives match the release (done); deploy the hosted web bundle (done 2026-11-09 through the file manager because FTP was unreachable); commit and push the current working tree.
- Locked months stay immutable imported snapshots; historical bills are not recomputed.
- Workbook quirks are preserved and flagged where they still affect totals; the £30 `Credit Cards` row is reclassified as Starling and Dan is a linked account rather than a normal budget account.
- The hosted `/FinanceHub/` build is structurally ready; the pre-rotation purge is complete, but passkey configuration, packaged checks, browser-storage hardening and legal review remain before broad public use.
- Provider credentials must not live in the synced document; the vault is the target home.
- P0-8: the owner confirmed on 2026-11-09 that every exposed third-party provider password has been rotated, and on 2026-11-13 that the pre-rotation conflict snapshots and old backups were purged.
- P0-5 Windows release engineering and P0-6 live cloud validation were removed from scope by the owner on 2026-11-12.
- Distribution is direct Windows download first. Microsoft Store is not opened. iOS is deferred; Windows and web remain the supported targets.
- Secure bank linking stays CSV-only until C-4 clears; integration starts only after the gate.
- Transactions use one category plus free-form tags.
- Alerts use the in-app notification centre first.
- New users get guided setup with a choice of a blank budget or the demo.
- Backups are encrypted and versioned, with seven restore points.
- Audit is per-record history plus trash/undo.
- Locked-month snapshots include provider balances and statement references.
- Statements gain an All years view.
- Data Health gains failed-sync and backup-age checks.
- Cloud accounts gain self-serve deletion plus MFA/passkeys.
- Open the DPIA and ICO pack now; other external compliance workstreams wait for their gates.
- Engineering completion is not compliance; §14 gates distribution and store submission.

Open items:

1. **Bank-linking provider and C-4** — the regulated provider, cloud-only linking, consent duration/re-consent, raw-payload retention, receipt-bucket sharing and household connection sharing are still undecided. Integration starts only after C-4.
2. **Supabase project** (URL + anon key) for live auth and sync testing. Never paste service-role keys.
3. **Barclays/Monzo/Revolut/Nationwide** — keep workbook behaviour (excluded from budget totals) or normalise them? Dan is now a linked account and the £30 `Credit Cards` row is reclassified as Starling.
4. **Web deployment** — the GitHub `v2026.11.9` installer assets are refreshed and verified. On 2026-11-09 `ftpupload.net:21` timed out, so the web bundle was uploaded through the signed-in InfinityFree file manager instead. The live page, JS and CSS return 200 and their SHA-256 hashes match the local build. The pre-rotation purge is complete; the site stays private until passkey configuration, packaged checks, browser-storage hardening and legal review are complete.
5. **Pre-rotation purge access** — the owner selected purge; the production cloud/local backup locations must be made available, or the owner must run the purge.
6. **iOS** — deferred; reopen only with macOS/Xcode and an Apple Developer account.

---

## 17. Verification log

- 2026-11-06: Plan created.
- 2026-11-06: Baseline suite 38/38 passing; `npm audit` reports a direct high-severity `xlsx` advisory with no npm fix.
- 2026-11-06: Electron syntax check passes; production build contains a CSP.
- 2026-11-06: Save-failure test showed the persistent banner and **Not saved** status, then cleared after storage recovered.
- 2026-11-06: Backup validation added; current live dataset initially failed because `monthLocks` can be absent. Optional handling added and covered by regression test.
- 2026-11-06: `npx tsc -p app/tsconfig.json --noEmit` passes.
- 2026-11-06: `npm test` passes 41/41 tests.
- 2026-11-06: `npm run build:web` passes; renderer bundle is about 671 kB with the existing chunk-size warning.
- 2026-11-06: Browser restore reached the safety-copy download; local state remained 21 holidays and 1,115 transactions.
- 2026-11-06: Browser recovery test replaced the current document with malformed JSON while keeping a valid last-good copy. FinanceHub recovered 21 holidays and 1,115 transactions, repaired the current document, kept the damaged raw copy, showed the recovery notice, and reported **Saved locally**.
- 2026-11-06: Browser blocked-state test removed the last-good copy and left malformed JSON current. FinanceHub showed the recovery screen with no navigation or save status, and the malformed document was unchanged after the save delay.
- 2026-11-06: `npm audit --omit=dev` reports 0 production vulnerabilities.
- 2026-11-06: Month end moved from the Dashboard into a dedicated **Overview → Month end** page beneath Monthly.
- 2026-11-06: `npm run dist:win` produced `release/FinanceHub-Setup-0.1.0.exe` (about 117 MB) and a 14 MB `app.asar`.
- 2026-11-06: Packaged archive inspection found 432 files, including `dist/index.html`, `electron/main.cjs` and production Supabase dependencies; it excluded `xlsx`, `.env`, the source workbook and spreadsheets.
- 2026-11-06: The unpacked build launched with an OAuth callback server, four running processes and a responsive **FinanceHub** main window. The UI was not visually inspected.
- 2026-11-06: Code signing was skipped because no certificate is configured. The installer uses the default Electron icon.
- 2026-11-06: Full `npm audit` reports 7 development/toolchain vulnerabilities (6 moderate, 1 high); `npm audit --omit=dev` remains 0.
- 2026-11-06: Removed the Dashboard **Model checks** section; parity remains covered by the engine test suite and Monthly view.
- 2026-11-06: Added the planned **Secure bank linking** panel to Import with its provider, token, consent, revocation, threat-model and acceptance-test requirements.
- 2026-11-06: Production-readiness audit re-ran `npm test` (49/49), `npm run build:web` (passing) and `npm audit --omit=dev` (0 vulnerabilities); confirmed all 24 navigation entries have rendered views and the Windows installer is present (~117 MB).
- 2026-11-06: Verified statement carry-forward for all 9 people, all 4 cards and 5 non-Starling accounts over 12 months and “All months”. Starling failed reconciliation (November statement −£2,899.38 versus dashboard £1,075.40) and was added as P0-7.
- 2026-11-06: Audit classified the build as usable for a local 2026 single-user workflow but not production-ready: cloud/auth not live-tested, no conflict-resolution UI or realtime, no packaged UI/CSP exercise, plain JSON backups, unsigned/default-icon installer, and unfinished 2027/28 data.
- 2026-11-06: Security review recorded S-01–S-15. Confirmed non-empty provider credential fields in the seed and built renderer, plain backup/cloud paths, wildcard CSP, CSV formula export risk, unvalidated URL fields, unsigned installer and dev-only dependency advisories. No secret values were read or printed.
- 2026-11-06: Added security findings and P0-8; no application code changed.
- 2026-11-06: Added the trust, traceability and reconciliation backlog: nine findings, eight improvements and eight later features. No application code changed.
- 2026-11-06: Added the UK/Microsoft/Apple compliance workstream (C-1 to C-7) with its ordering and external dependencies, and recorded that completing the engineering plan is not compliance. No application code changed.
- 2026-11-06: Merged the former `PLAN.md`, `PRODUCTION_READINESS.md`, `AUTH_SETUP.md` and `FEATURE_ROADMAP.md` into this single plan and removed those files. Corrected the parity record's inaccurate claim that no provider credentials were imported. No application code changed.
- 2026-11-06: Added §19, the competitor gap analysis and non-goals, comparing the current build against YNAB, Monarch, PocketSmith and the UK Open Banking apps. Confirmed against the codebase that there is no category/tag model in `core/engine.ts`, that Transactions offers comment/account/amount search with month and type filters, and that the 24-entry navigation contains no goals, forecast, net-worth or notification view. No application code changed.
- 2026-11-06: Extended `import/extract.mjs` to parse every provider year block (2027 and 2028 where present) and to capture the Setup Wizard, Year Reset, Product Admin, Customer Guide, Transaction Log and Statement/Starling instruction sheets. Added `tests/workbook-years.test.ts`. `npm test` passes 57/57, `npm run build:web` passes (renderer 737 kB, still over the chunk warning), and `npx tsc -p app/tsconfig.json --noEmit` passes. Then deleted `Income and Expenses 2026.xlsx`; the same three checks still pass with no workbook present, and `npm run extract` now exits with an explanatory message.
- 2026-11-06: O2 and Virgin payment edits now cascade: `core/telco.ts` recalculates every later month's balance and restates the contract's payments-made and remaining-payments totals. Saving a contract no longer lets `hydrateProviderDetails` overwrite the derived figures with the seed copy. Added `tests/telco-change.test.ts`. No change to the 2026 charges or bill amounts. O2's remaining months are now derived from the contract end date (23 as of November 2026), replacing its stale `0`, and Virgin's stored 23 is confirmed by the same calculation.
- 2026-11-06: Transfers between bank accounts can be recorded as one entry: `core/transfers.ts` writes the outgoing Expense and incoming Income legs with the `Transfer` treatment, so balances move and monthly income/expenses do not. Added `tests/transfer.test.ts`; table headers are left-aligned app-wide.
- 2026-11-06: Transaction log rows are editable and deletable. Editing reuses the inline form and rewrites the row in place; deleting a transfer leg asks once and removes both legs. Locked months still refuse both. `core/transfers.ts` gained `findTransferPartner` with tests; `npm test` 68/68.
- 2026-11-06: Internal transfers no longer inflate income or expenses. `core/internalTransfers.ts` detects a primary-account row whose opposite leg sits on another own bank account (same date and amount), and the engine excludes those rows. Locked months subtract only that transfer portion from their frozen snapshot, so other historical figures are untouched: locked YTD income falls from £27,916.69 to £25,117.50 and expenses from £29,157.66 to £28,435.51 (Jan–Oct 2026). Added `tests/internal-transfers.test.ts`.
- 2026-11-06: Recorded the missing £6.50 Starling payment to Dan (6 November 2026), which reconciles the Starling balance to the £643.11 confirmed against the bank. The November workbook figures predate it, so the parity expectations carry it as an explicit post-workbook adjustment. A marked one-time data fix also applies the row to budgets saved before the seed change.
- 2026-11-06: Investigated the reported £623.11 in the browser tab. Both stored documents (`financehub.state.v1` and `.last-good.v1`) hold 1,116 transactions with exactly one Dan £6.50 row on 06/11/2026, and the engine computes 64,311p from them; a forced reload of http://localhost:5173 renders **£643.11** on the Dashboard and in the Starling reconciliation row. The £623.11 came from a stale in-memory render, not from the saved budget. `npm run build:web` was rebuilt and the desktop app was launched against its DPAPI store: 1,116 transactions with one Dan £6.50 row, **£643.11** on the Dashboard and in the Starling reconciliation row, and **11/12 months match workbook** (only November differs, by the post-workbook £6.50). The debugging port used to read the renderer was closed and the app relaunched without it.
- 2026-11-06: The Rent ledger now opens on the entry closest to the As-Of date instead of the first charge, scrolling the table so that row sits under the sticky header. Added `nearestDateRowIndex` in `app/src/views/providers.tsx` and an optional `wrapRef` on the shared `Table` component; the scroll only runs for the rent ledger and only once per provider/as-of pair, so editing or adding a row does not jump the view. `npx tsc -p app/tsconfig.json --noEmit` passes and `npm run build:web` passes. In the running app the table moved from the top to row 55 of 129 (2026-11-09, `scrollTop` 2,615 of 6,168) with that row 35px down, exactly below the header.
- 2026-11-07: Holiday countdown now recognises an in-progress trip. `engine.holidays()` returns `ongoing` for as-of dates between start and end (inclusive), treats only future trips as `upcoming`, and sorts ongoing first; the Dashboard badge reads "On holiday" and the Holiday tracker does the same instead of "Passed". Verified with a test at 24/12/2026 (Hesperia 22–29 Dec ongoing, −2 days, top of list) and in an incognito browser session with As-Of set to 24/12/2026 (real budget untouched). 73/73 tests, tsc clean, web build and Windows package rebuilt.
- 2026-11-07: Applied the numeric-header rule to the remaining screens: Accounts, Cards, People, Bills (scheduled, link sheets, definitions, bill changes), Month end and Settings (accounts, people, cards, bill changes). Verified in the browser that every header matches its cells' text-align and column left edge in all six views; `tsc` and build clean, Windows package rebuilt.
- 2026-11-07: Extended the numeric-header rule to the Dashboard, Monthly and Transactions tables (Account reconciliation, Credit cards, Bills due, Income sources, Expense composition, Scheduled bills, Accounts at month end, People, Transactions) so each money heading sits over its figures. Verified in the browser: every header shares its cells' computed text-align and column left edge in all three views.
- 2026-11-07: Recorded that the November 2026 rent payment is skipped because the rent account is in credit. `data/workbook.json` now has a £0 "No payment (in credit)" row on 27/11/2026, the £500 payment restored on 27/12/2026, and a Rent bill change overriding 1–30 November to £0; a `rent-nov-2026-credit-skip` data fix applies the same correction to already-saved budgets (web and desktop). Verified in the app: November expenses £2,233.40 (was £2,733.40), bills this month £383.15, net +£232.34, YTD expenses £30,668.91, rent ledger 27/11 £0.00 and 27/12 £500.00, rent balance still £983.29 credit at the as-of date; 72/72 tests, `tsc` clean, web build and Windows package rebuilt.
- 2026-11-07: Fixed the Statement table's column/heading mismatch: `Table` now accepts `numHead` and marks those header cells `num`, and `th.num` is right-aligned instead of left, so Repaid/Lent/Balance sit over their figures. Verified in the browser: headers and first-row cells share left edges (271/483/727/889/1052 px) and align right in the three money columns.
- 2026-11-07: Added double-click launchers in the project root. `FinanceHub Standalone.lnk` opens `release\win-unpacked\FinanceHub.exe` (rebuilt: 250 MB exe, 123 MB installer, unsigned, default Electron icon). `FinanceHub Browser.lnk` runs `FinanceHubBrowser.cmd`, which starts `npm run dev:web` only when `http://localhost:5173/` is not already answering, then opens that URL in the default browser.
- 2026-11-06: Added §20, the single-file dataset storage refactor: one SQLite file holding accounts, people, cards, bills, transactions, provider ledgers, holidays, month locks, changelog and settings, with a repository that still materialises the `Dataset` the engine consumes. This entry is planning only — no storage code changed, so both saved budgets are untouched.
- 2026-11-06: The browser budget was re-seeded from `data/workbook.json` through the app's own **Reset to imported workbook** path, replacing the older import whose dates differed on 807 rows. The pre-reset document is kept in storage under `financehub.state.v1.pre-align-backup.v1` (309,578 bytes). After the reset the browser holds 1,116 transactions with one Dan £6.50 row on 06/11/2026 and one £20 Dan row on 29/10/2026, the data-fix marker, as-of 2026-11-06, **£643.11**, and **11/12 months match workbook** — the same reconciliation the desktop app shows. The dev server was also restarted with a cleared `node_modules/.vite` cache after Vite served `504 Outdated Optimize Dep` and rendered a blank page; it is serving HTTP 200 again. The browser budget is also an older import than `data/workbook.json`: 807 of 1,116 rows differ, almost all by one day, which explains the **4/12 months match workbook** badge; this does not affect today's balance and was left unchanged.
- 2026-11-07: Full code and data audit; no application code changed. Added §21 (A-01–A-18), P0-9 and the 2026-11-07 audit snapshot. Verified 73/73 tests, `tsc` and `build:web` clean, `npm audit --omit=dev` 0; the seed and the 746 KB renderer still carry three providers' credential fields; 12 transactions with unknown accounts (`Dan` 11, `Credit Cards` 1) are counted nowhere; 22 same-key transaction groups; the conflict queue can hold 25 full documents in `localStorage`; provider balances are month-granular. Live Supabase, the packaged installer and browser/desktop E2E remain unverified and are recorded as such.
- 2026-11-07: Implemented A-05 and A-16. `core/importDedupe.ts` flags duplicates against saved rows and against earlier rows in the same CSV; the import grid distinguishes `In log` from `Duplicate in file`, skips duplicates by default and allows a per-row override; Settings gained a read-only **Duplicate check** for the 22 same-key groups (44 rows). `tests/import-dedupe.test.ts` added. `npm test` 78/78, `tsc` clean, `build:web` clean, Windows package rebuilt (122,597,812 bytes). Browser check: report shows 22 groups / 44 rows; a two-line CSV produced 1 Ready + 1 Duplicate in file, with metrics 2 source / 1 ready / 1 duplicate / 0 out of window.
- 2026-11-07: Implemented A-13. CSV imports are rejected above 10 MB or 20,000 physical data rows before parsing; backup restores use the shared 25 MB cap. `decodeBackupDataset` now rejects provider URL fields that are not `http`/`https` or that contain credentials — HTTP is kept because the rent charge-letter link is HTTP, and the HTTPS-only outbound rule remains part of S-09/A-12. `toCsv` neutralises formula-leading text while preserving numeric strings. Added `tests/import-safety.test.ts`; `npm test` **85/85**, `tsc` clean, `build:web` clean, Windows installer rebuilt (122,598,225 bytes).
- 2026-11-07: Implemented A-14 and A-15. `core/holidays.ts` groups holiday rows into trips (positive-nights rows anchor, cost rows attach to the latest matching trip); the Dashboard renders one row per trip and the tracker badges cost lines and counts trips. Fixed the 2027 Travel Insurance end in the seed and through the `holiday-insurance-2027-end` data fix. Accounts now shows Petrol/Other pseudo-accounts and a not-counted panel for Dan/Credit Cards. Added `tests/holidays.test.ts`; `npm test` **89/89**, `tsc` and `build:web` clean, installer rebuilt (122,598,943 bytes). Browser check: Dashboard shows seven trips, December £1,401.09 / Kn Matas £837.82 ending 24/04/2027; tracker shows 15 trips / 8 upcoming / 73 nights and six Cost line badges; Accounts shows Petrol 24 rows £685.66, Other 0 / £0.00, Dan 11 / £181.00 and Credit Cards 1 / £30.00. No totals changed.
- 2026-11-07: Made the Holiday tracker collapsible by trip. It now opens as **15 headline rows**; each trip with extras has a **Show/Hide N cost lines** control, and expanding December shows 18 rows with indented cost lines, their own Edit/Remove actions and the headline trip total (£1,401.09). Browser check: 15 → 18 → 18 (after opening and cancelling a cost-line edit) → 15 after collapsing; the edit form pre-filled `flights and hotel` and `633.38`. `tests/holidays.test.ts` also asserts unique, stable trip keys. 89/89 tests, `tsc` and `build:web` clean, installer rebuilt (122,599,223 bytes).
- 2026-11-07: Made Dashboard holiday trips expandable. Each trip row now has a **Show/Hide N cost lines** control; expanded rows show the line's name, paid state, reference and amount beneath the trip total. Browser check: December went from 7 trip rows to 10 with `flights and hotel £633.38`, `car parking £34.40` and `travel insurance £32.77`, then back to 7 when collapsed. `npm test` **89/89**, `tsc` and `build:web` clean, installer rebuilt (122,599,541 bytes).
- 2026-11-07: Implemented A-04. Added `core/accounts.ts` with a shared `accountClassifier` / `classifyAccount` and `unknownAccounts`; `monthlyIncome` and `monthlyExpenses` now classify people, cards and pseudo-accounts through it. The Dashboard has a **Needs review** panel, Accounts lists the same names as not counted, and Transactions filters/labels unknown accounts. Editing an unknown row shows it as “— needs review” and blocks Save until a known account is chosen; a mapping writes an `Account mapping` changelog entry. Added `tests/accounts.test.ts`; `npm test` **93/93**, `tsc` and `build:web` clean, installer rebuilt (122,599,890 bytes). Browser check: Dashboard/Accounts show `Dan` 11 rows / £181.00 and `Credit Cards` 1 / £30.00; filtering Transactions to Dan shows 11 rows; Save without mapping is blocked with the expected message; November expenses remain £2,233.40. Existing unknowns remain intentionally unmapped, so no totals changed.
- 2026-11-07: Linked comment matches to unclassified accounts for review. Filtering Transactions to an unknown account now also includes rows whose comments mention it (whole-word, case-insensitive), badges them **Linked to X**, and warns that they stay on their original account. Accounts shows the linked count/value separately. For `Dan`: 11 account rows / £181.00 plus 59 comment-only Starling rows / £948.37; the comment rows remain counted on Starling, so totals do not change. Added `commentsMention` / `linkedCommentSummary` tests; `npm test` **95/95**, `tsc` and `build:web` clean, installer rebuilt (122,600,400 bytes). Browser check: Dan filter shows 70 rows (11 account + 59 linked), Accounts shows 59 / £948.37 in the **Comment-linked rows** column, and November expenses remain £2,233.40.
- 2026-11-07: Added the **Dan — linked account** ledger in Accounts. It lists all 70 matching rows: 11 booked to Dan (£181.00) and 59 comment-linked Starling rows (£948.37), with **Added to owed £0.00**. Linked rows are badged and remain on Starling, so the Starling balance stays £643.11 and People who owe me stays £4,503.00. Added ledger/balance tests; `npm test` **97/97**, `tsc` and `build:web` clean, installer rebuilt (122,600,866 bytes).
- 2026-11-07: Reclassified the lone `Credit Cards` row (27/02/2026, £30) as a Starling expense and cleared the review queue. `accountsNeedingReview` now excludes comment-linked accounts, so Dan is a **linked account** rather than a review item; the Dashboard **Needs review** panel is gone and Transactions shows **Dan — linked account**. Browser check: no Credit Cards label, Starling **£613.11**, Dan ledger **70 rows** (11 direct / 59 linked), November expenses **£2,233.40**, owed **£4,503.00**. The February locked snapshot remains **£2,658.31** and was not rewritten; the correction affects the live Starling balance. `npm test` **99/99**, `tsc` and `build:web` clean, installer rebuilt (122,600,910 bytes).
- 2026-11-07: Combined Dan's two subtotals into one **£1,129.37** figure (£181.00 booked to Dan + £948.37 linked from Starling) in the Accounts excluded table, the **Dan — linked account** metrics, and the Transactions filter notice. The ledger still shows **People who owe me impact £0.00**; Starling remains £613.11, November expenses £2,233.40 and owed £4,503.00. `npm test` **99/99**, `tsc` and `build:web` clean, installer rebuilt (122,601,110 bytes).
- 2026-11-07: Added local-with-account controls. Keeping a local budget no longer signs the user out; the sidebar and Settings expose **Sync**, **Exit** and **Log out**. Sync is guarded by `hasAccountState()` and moves the local budget only when the account has no saved document.
- 2026-11-07: Live Google/Supabase verification. The remote `settings` row was revision 3 / sync sequence 3 with 1,120 transactions and matched the account cache; the cloud contains the £6.50 Dan row. The local-only copy held 1,121 rows because it also contained a duplicate of that row. The local copy was intentionally left in place pending a safe remove-local-copy action.
- 2026-11-07: Final checks after the local-with-account changes: `npm test` **100/100**, `npx tsc -p app/tsconfig.json --noEmit` clean and `npm run build:web` clean (renderer 996 kB, existing chunk-size warning).
- 2026-11-07: E2EE credential vault delivered: PBKDF2-SHA-256 (600,000 iterations) + AES-256-GCM, ciphertext stored in `AppState.vault`, same passphrase unlocks on another device, legacy fields migrate and strip on setup, provider screens no longer read plaintext, backup exports exclude credential fields. `npm test` **106/106**, TypeScript clean. Live cloud migration, old-snapshot cleanup and password rotation remain.
- 2026-11-07: Hosted build uploaded to InfinityFree `/htdocs/FinanceHub`; `.htaccess` and hashed assets present; live document/JS/CSS returned 200; `.htaccess` not served; Google sign-in returned to `/FinanceHub/` and PKCE exchange succeeded; Supabase Site URL set to `https://recoverycommander.free.nf/FinanceHub/` and the same redirect added to the allow list. The live Settings screen confirms legacy plaintext fields are still present until the vault is created, so the site remains private and P0-8 cleanup/rotation is open.
- 2026-11-07: Added the hosted `/FinanceHub/` static build: `build:web:hosted`, `/FinanceHub/` base, `.htaccess` SPA fallback, browser storage, Supabase cloud sync, no local-only option, and a blank public seed. The desktop data fixes are aliased out of the hosted bundle. Verified `tsc`, `npm test` **100/100**, hosted and desktop builds, served root/assets/fallback at `http://127.0.0.1:4173/FinanceHub/`, signed-out UI with no `/api` requests, and zero real credential values or post-workbook personal data in `dist-web`. Authenticated web sign-in/cloud sync was not re-run; public hosting remains blocked by P0-8.

- 2026-11-07: Added **Sync** beside **Sign out** for cloud workspaces, calling the existing pull/push engine immediately. Rebuilt the hosted bundle and uploaded `dist-web/` via the InfinityFree archive uploader; live `index.html` now serves `index-AyVnKLLT.js` (200). Live manual sync returned to **Sync** with status **Synced**; vault is present with no legacy provider fields and no sync outbox/conflicts. `npm test` **106/106**, `npx tsc -p app/tsconfig.json --noEmit` clean, hosted build clean.
- 2026-11-07: Fixed the sidebar account layout by giving the identity its own full-width row and stacking Sync/Sign out below it. Added a public **Explore a sample budget** demo to the sign-in page, rejected cloud sync/persistence for the synthetic `demo` workspace, and added the **Account · browser sync** / **Local · this device** choice at the top of onboarding. Hosted local mode now survives reloads. Rebuilt and uploaded `dist-web` (archive 215,166 bytes); live `index-GIBmEp9O.js` and `index-CFStTLHr.css` load cleanly in a fresh session, and the live demo opens the populated dashboard and guided setup. `npm test` **106/106**, `tsc` clean, hosted build clean.
- 2026-11-07: Added **People sign-ins**. Settings → People sign-ins creates a username (email or user ID) and password for one People account; the sign-in screen and Settings link to `#people`, where the person sees a read-only statement with opening, borrowed, repaid, owed and a running balance, and nothing else from the budget. Passwords use PBKDF2-SHA-256 (600,000 iterations, random 16-byte salt) and only the person's statement snapshot is stored beside the hash; snapshots refresh whenever the owner's workspace saves. The record is device-local and the UI states plainly that it is not a security boundary. Verified end-to-end on the hosted build at `http://localhost:4173/FinanceHub/`: created a sign-in, signed in at `#people`, saw only that person's statement, and a later movement appeared in the refreshed snapshot. `npm test` **112/112**, `npx tsc -p app/tsconfig.json --noEmit` clean, hosted build clean.
- 2026-11-07: Added **provider setup to onboarding** and a **sidebar layout editor**. Step **5. Providers you track** can add, hide (data kept) or re-enable all eight provider ledgers, rename them, upload a custom PNG/JPEG/WebP logo (≤200 KB data URL) and edit the account/detail fields shown on the provider page; a hidden provider leaves the sidebar without losing its ledger. Settings → **Menu layout** hides items and moves them between Overview, Ledger and Providers, while **Tools** stays fixed. Verified in the built app: add/rename/upload/edit, the custom-logo banner on the provider page, hide People, move Accounts, reset the layout, remove and re-add a provider, and Tools unchanged. `npm test` **127/127**, `npx tsc -p app/tsconfig.json --noEmit` clean, hosted build clean; archive rebuilt at 224,385 bytes (`index-B97piKMs.js`, `index-utZQoljN.css`). Hosted upload still pending.
- 2026-11-07: Added **sidebar descriptions and a full user guide**. Every menu entry and group title now shows a hover/focus tooltip explaining what that section is for. Tools → Guides opens a rewritten **User Guide** with chapters for the three basics and all 24 sections — what each does, how to use it and practical notes — alongside the existing Month-End and New-Year guides. `tests/guide.test.ts` asserts every sidebar entry has a chapter. `npm test` **129/129**, `npx tsc -p app/tsconfig.json --noEmit` clean, hosted build clean; archive rebuilt (`index-fXsK-8MP.js`, `index-BYfE9VpU.css`). Hosted upload still pending.
- 2026-11-07: Added **ownership branding and legal documents**. The sign-in screen now credits Zane Stanton, shows the © 2026 copyright and FinanceHub™ notices, and links to a new in-app legal page containing the Privacy Policy, Terms of Service and EULA (also in Settings → About & legal). The documents cover financial-data handling, lawful bases, access and erasure, acceptable use, disclaimers, liability and IP under England and Wales law. `COMPLIANCE.md` records applicability: UK GDPR applies; KYC/AML, PCI DSS, PSD2/Open Banking, FCA and money-transmission rules do not for the current read-only app; MFA, self-serve account deletion and trademark registration remain actions. `npm test` **133/133**, `npx tsc -p app/tsconfig.json --noEmit` clean, hosted build clean; archive rebuilt (`index-BHPHgkbG.js`, `index-DlLpRR8s.css`). Hosted upload still pending.
- 2026-11-07: Moved the hosted app to **https://financehub.freedev.app/** at the domain root. The hosted build base is now `/`, `.htaccess` rewrites to `/index.html`, and `dist-web/` was uploaded over FTP to `financehub.freedev.app/htdocs`. The sign-in page, owner/legal notices, local workspace and demo load at the new URL with root asset paths, and `/.htaccess` is not served. Google sign-in still needs the new origin in Supabase’s Site URL and redirect allow-list. `npm test` **133/133**, `npx tsc -p app/tsconfig.json --noEmit` clean, hosted build clean; archive rebuilt.
- 2026-11-08: Added a query-preserving forward on the old host so Supabase Google/confirmation/reset returns and their `?code=`/`?error=` parameters reached the new origin where the PKCE verifier lives. Verified in the browser with simulated `?code=` and `?error=` returns; the old copy itself had stopped rendering (assets served as HTML).
- 2026-11-08: Retired the old host. Before removal, the rent charge letter PDF was copied to `https://financehub.freedev.app/files/Rent%20Charge%20Letter%2026-27.pdf` and its links in `data/workbook.json` and `import/extract.mjs` now use the new domain; README deployment steps no longer describe the old copy as a rollback target.
- 2026-11-08: Completed the auth URL migration. Supabase Site URL is `https://financehub.freedev.app/`; redirect URLs are the new root and `https://financehub.freedev.app/**`, plus the existing localhost and desktop loopback callback; the old `recoverycommander.free.nf` entry was removed. Google Cloud was checked and needs no change: the OAuth client still has only the Supabase callback `https://fzkkgbatmmgasfmgvrzp.supabase.co/auth/v1/callback`, no JavaScript origins, and no old-domain branding links.
- 2026-11-08: Configured **Google Auth branding**: app name FinanceHub, a 120×120 FH logo (`app/public/financehub-logo.png`), the existing support email, application home page `https://financehub.freedev.app/`, privacy policy `https://financehub.freedev.app/#legal/privacy`, Terms of Service `https://financehub.freedev.app/#legal/terms`, and authorised domains `fzkkgbatmmgasfmgvrzp.supabase.co` plus `freedev.app`. Google saved the branding successfully; both legal pages were checked live. Logo and domain verification may still be required before production use.
- 2026-11-08: Added budget-owner identity, main-site links and device-local **statement feedback** to People access. The `#people` statement names Zane Stanton and links to `https://financehub.freedev.app/`; a validated 2,000-character feedback form stores notes per owner in localStorage, and Settings → People sign-ins now shows a refreshable/dismissable feedback inbox. Deployed `dist-web/` over FTP to `financehub.freedev.app/htdocs`. Live verification: new assets `index-DwbeQ1Bq.js` and `index-DHkXX3qA.css` return 200, a throwaway incognito sign-in rendered the owner card, statement row and feedback form, and a test note saved under the expected feedback key. `npm test` **134/134**, `tsc` clean, hosted build clean.
- 2026-11-08: Promoted feedback to an app-wide topbar dialog and a Dashboard unread notice. Feedback stays device-local; opening the inbox marks messages read. Deployed `index-DqYbyJGp.js` and `index-BEvaStl2.css` to `financehub.freedev.app/htdocs`. Live incognito verification: the Feedback dialog saved a test suggestion, the Dashboard showed **New feedback message** with the sender and excerpt, and **Read feedback** opened the inbox, cleared the unread badge and set `readAt`. The test note lived only in the throwaway incognito profile and was discarded.
- 2026-11-08: Added persistent **provider-ledger row ordering**. Up/down controls pin row order, recalculate balances from the same carry-forward, preserve savings opening rows, and keep O2/Virgin paid and remaining totals correct; **Sort automatically** restores date or month order. All non-computed entry fields stay editable, including the previously missing Pure Cremation status field. `npm test` **138/138**, `tsc` clean, hosted build clean. Deployed `index-Cot8dfd1.js` / `index-ByuwyWpD.css`; live incognito verification moved a Water row (Jan £40 below Feb) and saw balances become £30/£70/£90 with the £90 closing balance unchanged, then reset the order successfully.
- 2026-11-08: Made provider **Balance** cells editable as manual anchors. Typing a balance pins that row, stores the ledger's original opening baseline, and recalculates later rows from the typed figure; clearing the cell returns the row to automatic. The add-entry form also accepts an optional balance. `npm test` **141/141**, `tsc` clean, hosted build clean. Deployed `index-CPsD7QvU.js`; live incognito verification changed a Water January balance from £40 to £55 and saw February/March recalculate to £85/£105, with the override and zero opening baseline persisted.
- 2026-11-08: Renamed the O2 and Virgin Media **Charge** column to **Bill**, along with their ledger notes ("Balance = previous + payment − bill"), page subtitles, sidebar descriptions and guide summaries. Field keys (`amountPence`) are unchanged, so balances, contract totals and due-bill auto-fill behave exactly as before. `npm test` **141/141**, `tsc` clean, hosted build clean. Uploaded all 11 files of `dist-web/` (including `.htaccess`) over FTP to `financehub.freedev.app/htdocs`; the live document serves `index-BgsU3hmG.js` / `index-ByuwyWpD.css`, and that bundle carries the **Bill** label and "Contract bills year by year" with no charge wording left. README now records the FTP host, account and remote root; the password is never stored in the repository and was removed from the workspace after the upload.
- 2026-11-08: Added **§22**, a dated progress scorecard (64/231 tracked items done; 1 of 9 P0 gates closed; none of §9's roadmap features released) and a refreshed comparison against Emma, Snoop, YNAB, Monarch and PocketSmith. Also added the missing **first-run model builder** row to §9 C and a status note on §19.4 drift. Documentation only; no code or figures changed.
- 2026-11-08: Closed the Phase 2 engine gaps. The provider-ledger rules moved into `core/providerLedger.ts` — one implementation shared by the app and any future port — with `balanceAsOf`/`balancePenceAsOf` as the per-sheet running-balance query Phase 2 listed as missing, and the savings plan restart after payoff implemented (Park Xmas paid off in September and opens a new plan in October; the engine now reproduces it instead of drifting). The provider view no longer duplicates the ledger maths. Added `tests/provider-balances.test.ts` (all eight sheets reproduce their stored balances, as-of cutoff, row dating), `tests/statements.test.ts` (10 people, 4 cards, 5 non-Starling accounts, month chaining, per-line running balances) and `tests/engine-invariants.test.ts` (bill totals, no fixed bill cap, empty entities, person removal). `npm test` **154/154**, `tsc` clean, hosted build clean (`index-CtaYQgHF.js`). Still open in Phase 2: year rollover and later-year views, CSV staging rules extracted for iOS, and Starling statement reconciliation (P0-7).
- 2026-11-08: Completed **Phase 1** with versioned schema migrations. The local schema is `db/migrations/0001–0004`, applied by `db/migrations.ts`, which records applied versions in `schema_migrations`, rejects badly named/gapped/duplicate files, applies each file in its own transaction and rolls a failure back; the cloud schema is versioned the same way under `db/migrations/postgres/` (0001–0002). `import/migrate.mjs` applies pending migrations instead of executing one bootstrap file. Also extracted the workbook-to-live adjustments into `core/reference.ts` so the parity gate and the reconciliation report agree: the seeder had been failing 6 of 10 checks because it compared raw workbook totals against the adjusted engine. It now exits 0 with **10/10 checks and 12/12 months**, and the report states the adjustments. `npm test` **159/159**, `tsc` clean. Phase 1 has no open work; the only conditional item is `.xlsx` import on a second machine, which cannot run while the source workbook is deleted.
- 2026-11-08: **Total paid** is editable on Park Xmas and Pure Cremation, using the same anchor rule as Balance: a typed figure is stored as `totalPaidOverridePence`, later rows accumulate from it, and clearing the cell returns the row to the automatic total — so a new savings plan starts at its own figure instead of carrying the previous cycle's. The add-entry form's per-field `hint` was replaced with an "Automatic" placeholder, because the extra line under Balance made that one field taller than the fields beside it. Two tests in `tests/provider-ledger.test.ts` cover anchoring/clearing and the plan restart; `npm test` **161/161**, `tsc` clean, hosted build clean (`index-DxOkgOOp.js`, not deployed).
- 2026-11-08: Single-sourced the app version. The sidebar footer had drifted to a hardcoded `v0.3` while Settings → About, the legal pages and the Windows app (`app.getVersion()`) all reported `0.1.0`. Vite now bakes `__APP_VERSION__` from `package.json`, `app/src/version.ts` exposes it with a fallback that plain Node tests can read, the sidebar and legal pages use it, and `electron/main.cjs` keeps reading the same package version. A new `tests/version.test.ts` fails if the fallback, the footer or the legal pages drift, or if the desktop dialog stops reading `app.getVersion()`. `npm test` **164/164**, `tsc` clean, both builds clean. Uploaded `dist-web/` (11 files, including the hidden `.htaccess`) and verified live: the document serves `assets/index-D6Cg_u-_.js` with `assets/index-ByuwyWpD.css`, and the bundle contains the Total paid behaviour, so the live web build now matches the Windows app.
- 2026-11-08: Split the changelog in two and added an installer download. **Application changelog** is generated at build time by `scripts/app-changelog.mjs` from `CHANGELOG.md` — package version, deterministic source build id, build time and per-release notes — and appears on the login page (`#app-changelog`) and in Tools; the existing record is now the **Budget changelog**, still stored in the dataset and carried by backups and sync. The Windows installer (116.9 MB) exceeds InfinityFree's 10 MB per-file limit, so `scripts/package-installer.mjs` splits it into 13 parts with per-part and whole-file SHA-256 under `files/installer/`, and the app rebuilds and verifies the .exe in the browser before saving. `npm run deploy:web` builds, regenerates the changelog, repackages the installer and uploads 25 files with a size guard and retries. `npm test` **169/169**, `tsc` clean, hosted build clean (`index-DOJYyUcp.js`), deployed and serving the new bundle. The Windows installer was then rebuilt from the current source (117.0 MB, SHA-256 `d14001801e229a02…`) and republished so the download matches the web build; deployments now skip installer parts only when the published manifest checksum is identical, and `.htaccess` marks HTML, JSON and installer parts no-cache so a new build cannot hide behind a cached document.
- 2026-11-08: Added a release workflow so the changelog, version, web build, Windows app and installer cannot drift. `AGENTS.md` records the rule; `npm run release -- <patch|minor|major> "note"` bumps `package.json`, adds a dated `CHANGELOG.md` section, regenerates the application changelog, rebuilds the Windows installer and hosted bundle, repackages the installer parts, deploys and verifies live parity. `npm run release:check` verifies the same invariants without changing anything (live parity when `FTP_PASSWORD` is set), and `npm test` now fails if the package version, changelog, generated file, bundle or installer manifest disagree. The build stamp is date-only so the same source produces the same bundle hash. A normal release never bumps the version: notes append to the current version's `### Changed` list so many changes can ship under one number, and `npm run release:bump -- patch "note"` runs only when the owner explicitly asks for a new version.
- 2026-11-08: Onboarding is generic and covers debts and savings. Guided setup no longer assumes a person or a bank: the main account defaults to “Current account”, rent payments are labelled “Payment” (the `isRentPaymentDescription` matcher still accepts old “Payment from Zane” rows so existing ledgers keep working), and provider names can be edited in setup. A new **5. Rent agreement** step walks through the liable monthly rent, agreement type and start, agreement details, the payment agreement, the day the payment leaves each month (1–28) and an optional weekly recurring charge; saving writes the provider record, creates or updates the monthly **Rent** bill at that amount and day, and generates weekly **Rent Charge** rows when the recurring option is on. Two new **Ledger** sections store the agreements as optional `Dataset.debts` / `Dataset.savings`, so backups, demo data and sync carry them automatically: **Debts** records creditor, agreement type/reference, balance, monthly payment, due day, interest and start date with totals owed and monthly; **Savings** records provider, account type (cash/stocks ISA, easy access, fixed-rate, regular saver, premium bonds), sort code and account number, balance, target with progress, interest and regular contribution with its day. The engine’s primary-account fallback now picks the active account with the most rows instead of a hardcoded bank name, and dashboard/ledger labels derive the main account name. Tests: `tests/sections.test.ts` covers the nav placement, the rent matcher and debts/savings backup round-trip; `npm test` **175/175**, `tsc` clean.
- 2026-11-08: Provider guided setup now records billing. Each provider card has the **normal bill**, the **normal monthly payment** (falling back to the bill), the **payment date** (1–28) and **contract details**, stored as `provider.billing`. A **Recurring** switch builds that provider’s year plan: the setup shows all twelve dated payments with the annual total, and a monthly bill linked by `Bill.providerKey` is created or adopted by name (so an existing Rent bill is reused, not duplicated) and kept in step with the amount, day and provider name; switching recurring off pauses that linked bill without deleting the details. `providerBilling`, `providerBillingAmount`, `buildProviderYearPlan` and `providerYearPlanTotal` live in `app/src/providerSetup.ts`; `tests/provider-setup.test.ts` covers the defaults, the 28-day cap, the fallback amount and the twelve dated rows plus annual total. `npm test` **177/177**, `tsc` clean.
- 2026-11-08: The release version is now the **release date** (`YYYY.M.D`) instead of a manually managed semver counter. `npm run release` sets `package.json` and the plain-Node fallback in `app/src/version.ts` from the date, renames an existing same-day section rather than creating a duplicate, and starts a new section on a new day; later releases that day keep the version and append notes. `release:check` rejects a package version that is not a date, and `release:bump` remains available for a deliberate milestone. The generated **build id** is deliberately still a content hash, so two builds of the same day can be told apart and live parity keeps comparing identical code; the changelog shows the dated version, that build id and the build date. `tests/app-changelog.test.ts` pins the date format, the new-day section, the same-day reuse and the rename of today’s older section; `tests/version.test.ts` pins the date-shaped version. The first dated release is `2026.11.8`.
- 2026-11-08: Enabling **Recurring** in provider setup now fills the provider’s own page, not just a budget bill. `buildProviderPlanEntries` writes a row for each remaining month of the year in that provider’s shape — Water/Ovo bill period plus bill and payment, O2/Virgin charge plus payment, Park Xmas/Pure Cremation payment with status, Council Tax a dated direct-debit entry — marked `plan: true`; `mergeProviderPlanRows` adds missing months and refreshes only its own rows, so real statements are never overwritten, and switching recurring off removes them. The linked bill now carries the provider’s link sheet (`sheetNameForProviderKey`) so the engine reads the same ledger and the provider page’s “due bill” auto-fill works, and the provider’s monthly payment/payment day are written for its account details. Provider pages also show the saved contract details and payment date. `tests/provider-setup.test.ts` covers the row shapes, remaining-month window, user-row protection and plan removal. `npm test` **184/184**, `tsc` clean.
- 2026-11-09: Added the read-only **Data Health / Integrity Centre** under Tools. The report checks unresolved account names, exact duplicate groups, provider year-chain openings and closings, linked bills without a provider ledger, bill changes with no bill, locked-month snapshot drift, active accounts with no target-year movement and unresolved sync conflicts. Every finding links to the review screen; the report never deletes, merges or rewrites. Added `core/dataHealth.ts`, `app/src/views/health.tsx`, a guide chapter and `tests/data-health.test.ts`; the check runs over the real workbook and correctly surfaces its 18 known duplicate groups without flagging any other check. `npm test` **240/240**, `npx tsc -p app/tsconfig.json --noEmit` clean. Release artefacts built with `--no-deploy` because `FTP_PASSWORD` is not set: build `e59117263c4b`, hosted bundle `index-DiRBVPJA.js`, installer SHA-256 `cbb9d2f3182c`; `npm run release:check` passes. Live upload and the GitHub `v2026.11.9` installer asset still point at the earlier same-day build (`bd69b322`).
- 2026-11-09: Committed and pushed the approved Data Health, budget-changelog and plan work as `93a835b`. Refreshed the existing GitHub `v2026.11.9` installer assets from the local build and verified the published installer against `SHA256SUMS.txt` (`1d332836fd32`). The hosted web bundle remains local (`index-_vRfJwjx.js`) because the FTP host was unreachable; the password was not stored.
- 2026-11-09: Web deployment paused without uploading. `ftpupload.net:21` timed out from this host before authentication (curl 28, 0/11 files deployed), so the failure was network reachability, not a rejected password. The corrected password was supplied only as `FTP_PASSWORD`; a workspace scan found no copy of it. Retry from a network that can reach the FTP host or through the InfinityFree file manager.
- 2026-11-09: Recorded the owner's remaining release decisions: deploy the hosted bundle and refresh the existing `v2026.11.9` assets; commit and push; the exposed provider passwords are already rotated; purge pre-rotation snapshots and old backups; defer two-device validation and signing; direct Windows distribution first; defer iOS; integrate bank linking only after C-4; one category plus free-form tags; in-app alerts first; guided setup with blank/demo choice; encrypted backups with seven restore points; per-record audit and trash; provider balances and statement references in locks; All-years statements; failed-sync and backup-age health checks; self-serve deletion plus MFA/passkeys; open the DPIA/ICO pack. Deployment is paused because `ftpupload.net:21` is unreachable; the earlier GitHub asset refresh is complete; the audit rebuild remains local until upload is authorized.
- 2026-11-09: Added per-record audit history and transaction trash. `core/audit.ts` diffs transactions, accounts, people, cards, bills and bill changes at the save boundary, caps history at 500 entries, groups both transfer legs for atomic restore, and keeps generated bill rows out. Transactions has a per-row **History** panel with revert and a **Recently deleted** panel with restore; locked months still refuse changes. `tests/audit.test.ts` covers create, edit, delete, restore, row reuse and atomic transfer restore. `npm test` **248/248**, `tsc` clean. Release build `4991d0a107bf`, hosted bundle `index-Cz-or00I.js`, installer SHA-256 prefix `72c26858f7c0`; not uploaded.
- 2026-11-09: Delivered transaction **categories and free-form tags** with filters and CSV export; the **in-app notification centre** for bills, low balances and card utilisation; the **first-run blank/demo choice**; **encrypted backup v2** with PBKDF2-SHA-256 + AES-256-GCM, checksum verification and seven local restore points; **provider balances and statement references** in month-end locks plus an **All years** statement; and **failed-sync, pending-change and backup-age** Data Health checks. Added **TOTP authenticator MFA** and a **self-serve cloud account deletion** function/migration. `npm test` **265/265**, `tsc` clean. Release build `85c5c46da578`, hosted bundle `index-BeGV_upU.js`, installer SHA-256 prefix `f9ee0c3e8c2d`; `release:check` passes. The deletion SQL migration still needs applying; passkeys depend on Supabase WebAuthn configuration and bank linking remains gated on C-4. Nothing was uploaded; the live site and GitHub installer assets remain on their earlier builds.
- 2026-11-09: Added render-level UI smoke coverage for transaction categories/tags, the notification centre, encrypted backup/restore-point metadata and account security (`tests/ui-smoke.test.mjs`). The real views render through Vite’s existing TSX pipeline; `npm test` **269/269**, `tsc` clean. Reconciled this plan with the code: P0-3 is closed, encrypted backups deliberately exclude the separate credential vault, manual restore points are distinguished from scheduling, the smoke suite is recorded as render-level with click-through flows still open, and completed CSV/URL/secret-scanning work is no longer listed as untouched.
- 2026-11-09: Rebuilt the Windows installer and hosted bundle after the test-script change so the generated changelog and build id are coherent: build `89bb71db76a1`, hosted bundle `index-0QAIytWd.js`, installer SHA-256 prefix `d369e2afc346`; `release:check` passes. `FTP_PASSWORD` was absent and `ftpupload.net:21` timed out, so all 11 `dist-web` files were uploaded through the signed-in InfinityFree file manager at `financehub.freedev.app/htdocs`, with `index.html` last. Live verification: page, JS and CSS return 200 with no console errors; `index.html`, `index-0QAIytWd.js` and `index-BkBanxRO.css` SHA-256 hashes match the local build exactly. The GitHub CLI/token is absent, so the published installer asset remains the earlier `1d332836fd32` build.
- 2026-11-09: Refreshed the existing GitHub `v2026.11.9` release through the signed-in browser: removed the earlier installer and checksum, uploaded the rebuilt 117.02 MB installer and `SHA256SUMS.txt`, and saved the release. The published installer digest is now `d369e2afc34654ae5d2adcb78420bb7b0786f1ad91d8828a42ff23c4d1a6990b`; `release:check` confirms the release installer matches `SHA256SUMS.txt`.
- 2026-11-09: Replaced the GitHub release description with the current generated `2026.11.9` notes from `CHANGELOG.md`. The release page now lists all 14 changed items instead of the original three; the installer and checksum assets are unchanged.
- 2026-11-09: Retargeted `v2026.11.9` from `1c002df` to `1272857` so GitHub's source archives contain the delivered feature work. The tag push ran Release run `42696050584` successfully; CI rebuilt the installer (digest `91d17700c084fa53ef930429937192fcacb0d11651fb6116955bfa6578dd4d57`), the checksum asset matches, the release notes still match the generated source and the raw source at the tag contains the current plan. `release:check` passes.

---

- 2026-11-10: Released `2026.11.10`: commit `a5011a1` and tag `v2026.11.10` pushed; Release run `42850560790` succeeded; GitHub assets are `FinanceHub-Setup-2026.11.10.exe` (122,611,527 bytes) and `SHA256SUMS.txt` with installer SHA-256 `055aaf67708793640e3f99340e63914e96543e4beb4c7f9fa459341258a3a4df`. The live bundle serves build `d487c28831e9`, JS `assets/index-BZ6wsYFk.js` and CSS `assets/index-BkBanxRO.css`; the live JS hash matches the local build, the public dashboard rendered without console errors, and the owner verified the personal Starling balance and month-scoped duplicate review. `npm test` **272/272**, `tsc` and `release:check` passed.
- 2026-11-10: Implemented the remaining A-02 code guard. `core/sync-client.ts` now walks a cloud document and refuses any non-empty password, passphrase, secret, credential, access-bill, access-token, API-key, private-key or username field, while allowing empty legacy placeholders; `app/src/sync.ts` re-checks older outbox entries before every push. Added `tests/sync-payload-secrets.test.ts` for nested fields, empty placeholders, refusal at enqueue time and the current workbook payload. `npm test` **276/276**, `tsc` and the web build clean. The rebuild is build `77c4c33c16cd`, hosted bundle `index-CJuyMBkJ.js` and installer SHA-256 prefix `2cab796c9d54`; `release:check` passed with live parity skipped. This guard is **not** in the deployed `d487c28831e9` bundle; deploy it after the P0-8 purge.
- 2026-11-12: Added a **Card payment** flow to Transactions. It creates two linked `Transfer` legs from the selected bank account to the card, defaults the source to the main account and offers every bank account in the source picker; editing or deleting either leg updates both. `tests/transfer.test.ts` covers the main-account and alternate-bank cases and proves the payment does not count as income or extra spending. Release `2026.11.12` build `ac4bf7537be9`, hosted bundle `index-CyldmavZ.js`, local installer SHA-256 prefix `618a3d0525cd`; `npm test` **279/279**, `tsc` and `release:check` clean.
- 2026-11-12: Published the build. Commit `3cf90e3` and tag `v2026.11.12` pushed; Release run `43290059717` succeeded. GitHub assets are `FinanceHub-Setup-2026.11.12.exe` (122,612,045 bytes, SHA-256 `8b7a2dcffda6e0f75a6eb63254efeec9706d87f3c855cdf197f1f90e913d9c72`) and `SHA256SUMS.txt`; the installer link returns 200. The hosted bundle was uploaded to `htdocs`; live `index.html`, `index-CyldmavZ.js` and `index-BkBanxRO.css` hashes match the local build, and the login page reports `2026.11.12` / `ac4bf7537be9`. `release:check` passes (live parity skipped without `FTP_PASSWORD`).
- 2026-11-12: Removed the **All releases** button from the application changelog and installer panel; the direct Windows installer and SHA-256 checksum links remain. Release build `e0258777546f`, hosted bundle `index-BFIIBcDY.js`, local installer SHA-256 prefix `1e32cc2e2b90`; Release run `43292176243` succeeded and replaced the GitHub installer with 122,612,133 bytes, SHA-256 `3e4153729bca8e830f7edeadf63a2a8c1adb11986ba3b0cf9cf997f4be871729`. Live HTML/JS/CSS hashes match the local bundle and the live changelog shows only the two remaining buttons. `npm test` **279/279**, `tsc` and `release:check` clean.
- 2026-11-12: Removed the release-count suffix from the application changelog header; it now shows only the version, build id and date. Release build `1769103a8691`, hosted bundle `index-TdOI5Q5W.js`, local installer SHA-256 prefix `26bbac4bce57`; Release run `43293183909` succeeded and replaced the GitHub installer with 122,612,110 bytes, SHA-256 `4b98677256610b7031277569354aed2ac2ae5d9a14a81d96addced18c4137838`. Live JS hash matches the local bundle and the live header contains no release count. `npm test` **279/279**, `tsc` and `release:check` clean.
- 2026-11-13: Dashboard income and expenses breakdown rings published as `2026.11.13`, build `2aef9384c403`, hosted bundle `index-DReyl8vz.js`, tag `5059fcc`. GitHub release assets are `FinanceHub-Setup-2026.11.13.exe` (122,613,331 bytes, SHA-256 `2eb19790e0afbcc84a0cae5d67a9e88d867824398dec04fcb1898d2818d0fcdc`) and `SHA256SUMS.txt`. The live page reports `2026.11.13` / `2aef9384c403`.
- 2026-11-13: Added daily automatic restore points encrypted with a random device-bound key in the secure store. They restore on this device without a passphrase prompt; manual exports keep the owner's passphrase. Release build `5e0a4a7c764a`, hosted bundle `index-BwVD3oKI.js`, tag `9f6c1dd`; Release run `43460973955` and CI run `43460966807` succeeded, and the installer is 122,613,796 bytes with SHA-256 `df72d2ef3c4c14f63d3fba94c80b7af0d351cf31b8129c18a640f1ae5ef03306`. `npm test` **282/282** and `tsc` clean.
- 2026-11-13: Added Playwright Chromium click-through coverage for demo navigation, transaction add/edit/delete, CSV staging and confirmation, month-end lock/unlock, encrypted restore-point create/restore and statement totals; CI now installs Chromium and runs the suite. Release build `6942b23693f7`, hosted bundle `index-B71MQhkl.js`, tag `d47bf70`; Release run `43463152995` and CI run `43463147510` succeeded. The release installer is 122,614,218 bytes with SHA-256 `5ccddc5112df007bdd8bc131a7559990d9dbf1e39dd777e231628c444e1988e2`; downloaded asset matches its published checksum. `npm test` **282/282**, `tsc` clean, Playwright **6/6**.
- 2026-11-13: Added Data health **Download support bundle**, a redacted JSON diagnostic containing app/build, environment, dataset counts, health-check identifiers and backup/sync timestamps only; names, comments, amounts, credentials and raw health messages are excluded. Added a unit redaction test and a browser download test. Release build `be45a788affe`, hosted bundle `index-BxEZSKvj.js`, tag `61e4a36`; Release run `43464966594` and CI run `43464960936` succeeded. The release installer is 122,614,220 bytes with SHA-256 `e4dbddba4e465a8d22f21dbaa841034b7d61eb136d687c0d3758d2278956da90`; downloaded asset matches its published checksum. `npm test` **283/283**, `tsc` clean, Playwright **7/7**. Draft compliance documents and owner actions added under `docs/`.
- 2026-11-13: Added **Export Excel** for the filtered transaction log and statements (SpreadsheetML, no runtime spreadsheet dependency) and **Print / Save PDF** reports for both. Added exporter escaping tests and an Excel download browser test. Release build `9d20ad542569`, hosted bundle `index-CH_xyre8.js`, tag `02c7bb0`; Release run `43466846369` and CI run `43466838108` succeeded. The release installer is 122,616,077 bytes with SHA-256 `67359e84d9ef097d6bf14b8d61160c025e83d1d35f15c1502f223dc0baf42d30`; downloaded asset matches its published checksum. `npm test` **285/285**, `tsc` clean, Playwright **8/8**.
- 2026-11-13: **P0-8 closed.** The owner ran **Settings → Sync conflicts → Purge conflict history** and removed the old pre-rotation backup files. The hosted app remains private; the remaining release gates are the passkey UI, packaged-app checks, a throwaway-account deletion test and professional review of the compliance drafts.
- 2026-11-13: Added **Settings → Sync conflicts → Purge conflict history**. It deletes the local and cloud conflict copies for the signed-in account after confirmation and leaves budget records untouched. Release build `c46b06de1e55`, hosted bundle `index-D9xz5RlG.js`, tag `40aba84`; Release run `43456160256` replaced the GitHub installer with 122,613,396 bytes, SHA-256 `415f288cfce85a2514ca69f003948fdf5d034dd7178d7bed68967327135b2d4d`. `npm test` **280/280**, `tsc` and `release:check` clean.
- 2026-11-13: Removed the wildcard Supabase CSP fallback. A missing or invalid URL now yields `connect-src 'self'` only; a valid URL adds just its exact HTTPS/WSS origin. The hosted bundle is `index-BazeCTgG.js`, tag `fe3ed46`; Release run `43457692671` replaced the GitHub installer with 122,613,481 bytes, SHA-256 `744f266183b198113132aac4565634cb67c0b1ad9e861f6ce82cada700daa68e`. CI run `43457687117` passed typecheck, the private-workbook test skip and the hosted build; `npm test` **281/281** and `tsc` clean.
- 2026-11-13: Applied `public.delete_my_account` in the Supabase SQL editor; it is `SECURITY DEFINER`, owned by `postgres`, and the grant check showed `anon` execute `false`, `authenticated` execute `true`. Enabled Supabase passkeys with display name `FinanceHub`, RP ID `financehub.freedev.app` and origin `https://financehub.freedev.app`; reloading the page confirmed the saved values. The Site URL is `https://financehub.freedev.app/` and the redirect allow-list includes the web origin, its wildcard path, local Vite and the desktop callback. The passkey enrolment/sign-in UI and a throwaway-account deletion test remain.

## 18. Notes and constraints

- Local-only mode must remain device-only.
- No service-role key belongs in the renderer or this repository.
- The desktop secure store uses DPAPI-encrypted values in SQLite; it is not SQLCipher.
- The current cloud sync stores the complete budget document. A conflict-resolution screen is delivered; two-device/RLS validation remains.
- Provider statements for 2027 and 2028 are imported for all eight provider sheets; the year selector and provider views expose them, and Statements has an All years option.
- The source workbook `Income and Expenses 2026.xlsx` is retired and deleted. `data/workbook.json` is canonical, including the 2027/2028 provider blocks and the four product sheets. `npm run extract` exits with a clear message until a workbook is restored.
- Electron navigation guards and CSP have not been exercised inside a packaged installer yet.
- The local-to-cloud consent screen is live-tested with Google sign-in. Keeping local retains the account session for manual Sync, Exit and Log out; local mode still does not auto-sync.
- Recovery covers the device-cached budget document. Cloud sync is disabled while the local document is blocked, so a remote copy cannot overwrite it automatically.
- The Windows installer is unsigned and uses the default Electron icon; this is an accepted distribution risk. A branded icon remains optional.
- The renderer bundle still contains the workbook seed data; do not treat the installer as free of personal data until the seed is replaced or confirmed appropriate for distribution.
- Live Google sign-in and one-account cloud sync are verified. A full visual click-through and packaged OAuth/CSP exercise remain release gates.
- Provider credentials must never re-enter the seed, renderer bundle, plain backups, cloud `state_json` or sync-conflict snapshots.
- The hosted `/FinanceHub/` build is structurally ready but not approved for public use until P0-8 and browser-storage hardening are complete.
- Completing P0/P1/P2 does not equal compliance. The compliance workstream needs external legal, registrar, Apple-hardware and FCA inputs, and must be evidenced per release.
- The app must not describe itself as compliant, certified, approved or "bank-level secure" until the matching C-5/C-7 evidence exists.

---

## 19. Competitor gaps and non-goals

Added 2026-11-06. Compares the current build against YNAB, Monarch Money, PocketSmith and the UK Open Banking apps (Snoop, Emma, PocketSpend) as of October–November 2026. Competitor claims come from their own pages (links in §19.7); features and prices change, so re-check before relying on them.

### 19.1 The structural difference

FinanceHub is a **fidelity tool**: it reproduces one household's workbook to the penny, with provider ledgers, month-end locks and an audit trail. Competitors are **automation tools**: connect a bank, auto-categorise, project forward. Several competitor features are only possible because they hold a bank feed and a mature category model. FinanceHub now has basic categories and tags; the bank feed and category rules/splits are still missing. That distinction decides which gaps to close and which to leave.

### 19.2 Table stakes that are missing

| Gap | Who has it | Where it stands here |
| --- | --- | --- |
| Live bank feeds / Open Banking | All of them; PocketSmith advertises 12,000+ institutions, Monarch uses several aggregators, Snoop and Emma are built on UK Open Banking | Planned in §10 but gated behind the FCA work in C-4 |
| Categories, tags and labels | Universal — PocketSmith categorises, labels and annotates; Monarch auto-categorises on connect | One optional category plus up to eight free-form tags, with filters and CSV export. Rules, splits and category budgets are still missing |
| Recurring and subscription detection | Monarch lists bills and subscriptions with reminders and cancellation prompts; Snoop's core pitch is finding subscriptions | A subscription tracker is planned in §9 C, but detection from transaction history is not planned |
| Alerts and reminders | Monarch payment reminders; Emma and Snoop daily balance and overdraft alerts | In-app alerts for bills due within seven days, negative/low balances and cards over 80% used; no push or email delivery |
| Mobile app | Every competitor is mobile-first | iOS is Phase 4, blocked on macOS; a PWA is in §9 E; no Android |
| Receipts and attachments | YNAB attaches photos and memos per transaction; Monarch similar | Planned in §9 B, with OCR in §8 |
| Powerful search | PocketSmith sells its search; Monarch markets searching any transaction | Transactions searches comments, account and amount with month and type filters. No cross-entity search, saved filters or search inside statements |
| Shared household budget | YNAB Together covers up to six people; Monarch invites a partner at no extra cost | Planned as XL in §9 D, after per-record sync |
| Net worth, assets and investments | PocketSmith tracks property, mortgages and vehicles; Monarch tracks investments, allocation and performance | Only a "net worth view" row in §9 C; no asset, liability or investment model |
| Long-range forecasting | PocketSmith projects daily balances up to 60 years with what-if scenarios; Monarch Plus does retirement forecasting | Only the 12-month cash-flow forecast in §9 C, on top of the existing open-month projection |
| Multi-currency | PocketSmith, including native and converted balances | Not planned anywhere |
| Excel/PDF reports and cash-flow statements | PocketSmith cash-flow statement; YNAB net-worth reports | In P2 and §9 E |
| Conflict-free multi-device sync | Assumed working by every competitor | One-account sync and the conflict-resolution UI are delivered; live multi-device and RLS testing were removed from scope |

### 19.3 Do not copy — explicit non-goals

- **Credit score monitoring, bill negotiation, energy switching and cashback** (Emma, Snoop). These need credit-reference and switching APIs, commercial partnerships and FCA-adjacent compliance, and they add cost and liability without serving a workbook-replacement buyer. Record them as non-goals rather than roadmap items.
- **Envelope / zero-based budgeting** (YNAB's entire product). The model here is income − expenses − owed with immutable locked months. Bolting on envelopes would either create a second, contradictory model or silently change verified figures. If it is ever wanted, it must be a separate view fed by the ledger, never a rewrite of the engine.
- **AI assistant over the user's finances** (Monarch Plus). It needs an external model provider, a key and a new privacy story, and it undercuts the local-first, nothing-leaves-the-device position.
- **Crypto and live investment pricing.** Manual valuation belongs in a net-worth view; live prices mean market-data feeds, licensing and a new failure mode.

### 19.4 The real adoption blocker

No competitor gap hurts adoption as much as this: **every competitor onboards with "connect your bank and we will build the budget", while this app onboards with "bring your 2026 workbook".** A stranger has no `data/workbook.json`, no provider ledgers and no locked months, so the seed data is either irrelevant or wrong for them, and an empty shell has nothing to show. Much of §8 and §9 assumes a populated model.

The missing capability is not on the competitor table at all:

- [x] A demo/template dataset a buyer can explore before entering anything.
- [~] A first-run model builder: guided setup already offers blank/demo and adds accounts, people, bills and providers, but a CSV-plus-questions model builder is still absent.
- [x] A clear "start from scratch" path, so onboarding does not require the original spreadsheet.

*Status note (2026-11-09): the hosted sign-in screen and first run both offer **Explore a sample budget**, and first run offers a genuinely blank budget. The CSV-plus-questions model builder remains the adoption gap. See §22.5.*

### 19.5 What this app has that competitors do not

Protect these rather than trading them away for feature parity:

- Penny-exact workbook parity with a parity test suite, which no competitor can claim.
- Per-provider statement ledgers — Rent, Water, Council Tax, Ovo, Park Xmas, Pure Cremation, O2, Virgin — including running balances and the rent ledger rules.
- Month-end lock with immutable snapshots and a changelog that distinguishes locked facts from projections.
- People/owed tracking for money lent to named individuals.
- Local-first operation with no account required, and a one-off price rather than a subscription.

### 19.6 If only five gaps are closed

1. **Categories and tags on transactions** — delivered; the remaining leverage is reports, search, rules and splits.
2. **Recurring detection plus alerts** — turns a passive ledger into something that talks to the user.
3. **First-run model builder and demo dataset** (§19.4) — the adoption blocker. The demo ships on the hosted sign-in screen; the model builder is now a roadmap row in §9 C and ranked 3 in §22.4.
4. **Bank feed** — the real differentiator once C-4 clears; until then CSV remains the feed.
5. **Mobile or PWA read-only companion** — so a balance can be checked without a laptop.

Item 1 is delivered; item 2 is partly delivered through in-app alerts; item 3 is partly delivered through blank/demo onboarding; item 4 is §10; item 5 is partly §9 E and Phase 4.

### 19.7 Sources

- PocketSmith features: <https://www.pocketsmith.com/features>
- Monarch tracking features: <https://www.monarch.com/features/tracking>
- Monarch forecasting: <https://help.monarch.com/hc/en-us/articles/48344305092244-Forecasting-in-Monarch>
- YNAB features: <https://www.ynab.com/features>
- UK app features and prices: <https://moneynerd.co.uk/best-budgeting-apps>

---

## 20. Single-file dataset storage

Added 2026-11-06. Requirement: every piece of user-defined data — transactions, accounts, people, cards, bills, bill changes, provider ledgers, holidays, month locks, changelog, settings and the workbook reference — must live in **one file** instead of one JSON document, so it can be opened, copied, backed up and queried as a single artefact.

Scope is storage only. The calculation engine stays pure and unchanged: a repository reads rows and materialises the same `Dataset` object that `buildEngine(ds)` consumes today, so no view or figure changes as a result of the refactor.

### 20.1 Current state

| Store | Format | Consequence |
| --- | --- | --- |
| Desktop (`%APPDATA%\financehub\financehub.sqlite`) | `secure_kv(key TEXT, value BLOB)` holding the whole budget JSON, DPAPI-encrypted | One file already exists, but the data inside is an opaque blob — no rows, no queries, no partial writes |
| Browser | `localStorage` `financehub.state.v1` (~310 KB) + last-good + damaged copies | No file at all; 5 MB ceiling |
| Cloud | `settings.state_json jsonb` with `rev` / `sync_seq` | Whole-document sync; the relational tables in `db/migrations/postgres/` are dormant |

Payload being moved: 1,116 transactions, 6 accounts, 9 people, 4 cards, 17 bills, 6 bill changes, 216 provider rows, 21 holidays, 106 changelog entries, 0 imported month locks plus runtime locks, 8 provider profiles.

### 20.2 Target

- One file: the existing `financehub.sqlite` under the app's user-data folder. New tables are added alongside `secure_kv`; `secure_kv` remains for sync metadata, the owner key and the encrypted credential vault. No second database.
- All entities become rows via `db/migrations/` plus the additions in §20.3. Money stays `INTEGER` pence.
- `settings` is a single row (`id = 1`); `accounts`, `people`, `cards`, `bills`, `bill_changes`, `transactions`, `holidays`, `changelog`, `provider_entries`, `month_locks` and `dataset_meta` carry the rest.
- A new `electron/dataset-db.cjs` exposes `readDataset()`, `writeDataset(dataset)`, `exportDocument()` and `importDocument(json)`; the renderer keeps its current synchronous bridge, so `store.ts` API and every view are untouched.
- JSON remains the **import/export and backup format** (`Settings → Data & backups`), because it is portable, diffable and already validated by `decodeBackupDataset`.
- Browser stays on `localStorage` for now; the desktop file is the canonical single-file copy. A browser file handle (File System Access API) or WASM SQLite is a later option, not part of this refactor.

**Security decision to sign off before coding:** plaintext rows mean the DPAPI whole-document protection is lost. The plan is plaintext financial rows (required for querying) with provider passwords moved out of the dataset into DPAPI-encrypted storage, and backups excluding secrets. The alternative — encrypting every value — keeps confidentiality but removes queryability, which defeats the purpose. Record whichever is chosen in §4 and §18.

### 20.3 Schema additions

`db/migrations/` is close but not sufficient. Add:

| Gap | Change |
| --- | --- |
| Settings | `primary_account TEXT`, `bill_sheets_json TEXT`; remove credentials from this row |
| Provider profiles | New `provider_profiles(provider TEXT PRIMARY KEY, profile_json TEXT)` for rent/water/ovo/council tax/Park Xmas/Pure Cremation addresses, portals, tenancy dates, plans, references, `years` blocks |
| Provider contracts | New `provider_contracts(provider TEXT PRIMARY KEY, contract_json TEXT, edited INTEGER)` for O2/Virgin length, tiers, end date, derived totals |
| Month locks | `snapshot_json TEXT` (accounts, cards, people, optional bills breakdown and note) beside the existing totals |
| Changelog | `source_row INTEGER`, `signature TEXT`, `auto INTEGER`, `occurred_at TEXT`, `details_json TEXT` |
| Data fixes | New `applied_fixes(id TEXT PRIMARY KEY, applied_at TEXT)` replacing `meta.dataFixes` |
| Workbook reference | New `dataset_meta(key TEXT PRIMARY KEY, value_json TEXT)` for `reference`, `guides`, `audit`, `meta` |
| Bills | `due_day_label TEXT` |
| Holidays | Map `start`/`end` to `start_date`/`end_date`; `total_text` already present as `total_text` |
| Income schedules | One row per `(kind, year, month_label)` instead of one row holding `year2026/2027/2028` |
| Credentials | `credential_vault` rewritten for DPAPI (`ciphertext BLOB`, `prefix TEXT`), or a `provider_secrets(provider, field, ciphertext)` table; the argon2id columns do not match `safeStorage` |

### 20.4 Migration

1. Copy the current `financehub.sqlite` to a timestamped backup and download a JSON backup before the first write.
2. Create the new tables under `PRAGMA user_version = 2`; leave `secure_kv` intact.
3. Import in FK order inside one transaction: settings → accounts → people → cards → bills → bill_changes → transactions → provider profiles/contracts → provider entries → holidays → month locks → changelog → dataset_meta.
4. Deterministic IDs so re-imports are idempotent: `tx:<row>`, `acct:<slug>`, `person:<slug>`, `card:<slug>`, `bill:<slug>`, `billchange:<row>`, `prov:<key>:<index>`, `hol:<year>:<index>`, `lock:<yyyy-mm>`, `chg:<index>`. Keep `source_row` for traceability.
5. Run the existing one-time fixups during import, not on every load: `hydrateProviderDetails`, `hydrateRentMatched`, `hydrateProviderPaid`, `hydrateParkXmasPlan`, and the `starling-dan-2026-11-06` fix, recording each id in `applied_fixes`.
6. **Parity gate:** rebuild a `Dataset` from the new tables, compare `canonicalJson` against the pre-migration document (ignoring `savedAt` and `theme`), and abort the switch on any difference, leaving the old document authoritative and reporting the first mismatching entity.
7. Switch reads/writes through the repository behind `storage.mode = document | sqlite`; rollback is flipping the flag, with the JSON document kept until the gate passes.

### 20.5 What breaks if this is done carelessly

- **Identity.** Nothing has an ID; `transactions.account` holds an account, a person or a card name, and the seed already contains `Petrol`, `Credit Cards` and `Dan`, which match none of them. No foreign key can be added on `account`; renaming an account/person/card must either cascade or leave history keyed by the old name.
- **Cloud sync.** `financehub_push_state` pushes one `state_json`, and the outbox has a single `entity: 'settings'`. Row storage without row-level sync leaves two models side by side. Row-level sync is a separate phase (§20.6), not implied by this refactor.
- **Month locks.** Without `snapshot_json` the locked-month breakdown (accounts, cards, people, bills) disappears from the Dashboard.
- **Provider metadata.** `provider_entries` only holds rows; contracts, URLs, tenancy dates and `years` need §20.3 or the provider pages lose details and 2027/2028 data.
- **Data fixes and hydrations.** If they keep running on every load, they re-hydrate migrated rows and can overwrite edits; if they are dropped, the £6.50 Dan row or the paid flags regress.
- **Backup, reset, recovery, onboarding.** `clearState`, `blankState`, `claimLocalBudget`, `startEmptyCloudBudget`, the damaged-document recovery screen and `decodeBackupDataset` all assume one JSON value and need repository equivalents.
- **Engine load.** Materialising a `Dataset` per read keeps memory and dashboard work the same; the win is durability, partial writes and queryability, not speed.
- **Tests.** `tests/backup.test.ts` validates the document shape and `tests/parity.test.ts` / `tests/workbook-years.test.ts` build a `Dataset` from `data/workbook.json`; they keep passing only while `Dataset` remains the interchange format. New tests are needed for round-trip parity, the importer and the repository.

### 20.6 Phases

| Phase | Work | Exit criterion | Estimate |
| --- | --- | --- | --- |
| 1 | Schema additions (§20.3), repository interface, JSON adapter refactor with no behaviour change | Existing 72 tests pass, app unchanged | 3–5 days |
| 2 | Importer, deterministic IDs, one-time fixups, parity gate, backups | Round-trip canonical JSON equal; mismatch aborts cleanly | 3–4 days |
| 3 | SQLite adapter wired for desktop writes and reads; reset/onboarding/recovery/backup paths | Dashboard £643.11, 11/12 parity, locks and provider pages intact | 4–6 days |
| 4 | Tests: golden migration snapshot, round-trip, adapter, corrupt-file recovery | Suite green; corrupt DB recovers from JSON backup | 2–3 days |
| 5 | Row-level cloud sync (new RPCs, per-entity outbox, conflict queue/UI) | Two devices merge row edits; RLS tests | 3–5 weeks |
| 6 | Browser parity: File System Access handle or WASM SQLite | Browser and desktop read the same file format | 1–2 weeks |

Phases 1–4 deliver the single-file requirement: **around 3 weeks**. Phase 5 is the cost that makes it a 6–8 week programme if cross-device merging is included.

### 20.7 Acceptance criteria

- One file contains every entity; `SELECT` counts match the payload in §20.1 exactly (1,116 transactions, 6 accounts, 9 people, 4 cards, 17 bills, 6 bill changes, 216 provider rows, 21 holidays, 106 changelog entries).
- Dashboard shows **£643.11**, Year at a glance **11/12**, November income £2,465.74 / expenses £2,733.40, YTD income £27,583.24 / expenses £31,168.91.
- The Rent page still opens on 09/11/2026; provider contract details, remaining months and the 2027/2028 blocks survive.
- Locking and unlocking a month round-trips through `month_locks` with its full breakdown.
- JSON backup → reset → restore reproduces the same file contents; a corrupted file falls back to the last good copy without overwriting it.
- No plaintext provider password exists in any table outside the encrypted store, and no backup contains one.

### 20.8 Open decisions

- [ ] Encrypt rows or accept plaintext for queryability (§20.2).
- [ ] Keep `state_json` cloud push as-is while local storage becomes row-based, or migrate both together.
- [ ] Browser: stay on `localStorage`, or adopt a file handle / WASM SQLite.
- [ ] Whether the 2027/2028 provider `years` blocks get their own tables or stay in `profile_json`.

---

## 21. Audit remediation plan — 2026-11-07

Added 2026-11-07 from a full code and data audit. This section is the work queue; it changes no code and no figures. Existing IDs stay authoritative where they overlap (`S-01`–`S-15`, `P0-1`–`P0-9`, §20); the `A-xx` items add the concrete fix and acceptance test, and they track two money-integrity issues that were not previously recorded (A-04, A-05).

**Evidence recorded by the audit (2026-11-07):** 73/73 tests, `tsc` and `build:web` clean, `npm audit --omit=dev` 0. The seed (481,337 bytes) has non-empty credential fields for Rent, Park Xmas and Council Tax, and the built 746,236-byte renderer bundle contains them. 12 transactions use account names no total counts (`Dan` 11 rows / £181, `Credit Cards` 1 row / £30); 22 groups share date, account, type and amount; provider balances are dated to the 1st; the conflict queue can hold 25 full documents in `localStorage`. No live Supabase, packaged-installer or E2E verification was possible.

### 21.1 Priority table

| ID | Priority | Problem | Fix | Acceptance | Effort |
| --- | --- | --- | --- | --- | --- |
| A-01 | P0 | Provider passwords in the seed, bundle, backups and provider screen (`S-01`, `P0-8`) | Strip from the dataset; store in the OS-backed vault; rotate exposed values | No credential field in seed or `dist/`; desktop reveal still works; scan test in `npm test` | M |
| A-02 | P0 | Secrets in `settings.state_json` and `sync_conflicts` (`S-02`) | Same boundary as A-01; conflicts keep metadata, not documents | DB inspection clean; conflict row under 8 KB | M |
| A-03 | P0 | Conflicts retain 25 whole documents in `localStorage`, swallow write failure, offer no resolution UI (P1) | Diff/metadata conflicts, byte budget, resolution screen | 25 large conflicts fit; local version restorable; quota failure surfaced | M |
| A-04 | P0 | Unknown accounts are silently excluded from every total | Central classifier plus a blocking review step; decide `Dan` / `Credit Cards` | Every row classified or listed; unknown import cannot be saved unclassified | M |
| A-05 | P0 | Import dedupe ignores the staged batch | Canonical key across existing and staged rows | Re-importing the same file adds no rows | S |
| A-06 | P1 | “Paid” is inferred from the due date; provider balance is month-granular | Reconcile or relabel; generic bill skip; missed-payment flag | As-of 2 Nov excludes the 27 Nov payment; missed bill shows unpaid | M |
| A-07 | P1 | Malformed backup/provider data can crash the renderer (`S-12`) | Provider validators plus defensive engine reads | Bad backup shows an error, not a blank screen | S |
| A-08 | P1 | Seed fields overwrite saved provider details on every load | Versioned migrations; fill only missing fields | Edited provider field survives reload | S |
| A-09 | P1 | Whole-document writes, 5 MB ceiling, whole-document sync (`§20`) | Row store (§20 phases 1–4), throttled last-good, IndexedDB for web, size guard | Edit latency independent of dataset size; no quota loss at 5× data | L |
| A-10 | P1 | Personal seed (names, amounts, credentials) ships in the bundle | Blank/demo seed by default; owner-only import path | Default installer opens blank; no personal data in the build | M |
| A-11 | P1 | Rent/water/telco/provider logic duplicated between engine and views | One domain module per provider used by both | Golden tests compare UI preview with engine rows | M |
| A-12 | P1 | Unsigned release accepted; OAuth has no state; web session in `localStorage` (`S-04`, `S-07`, `S-10`, `S-11`) | State/nonce; hosted web deployment blocked | Forged callback rejected | M/L |
| A-13 | P1 | Import/backup limits are size-only; CSV formula export (`S-08`, `S-12`) | Byte/row caps, HTTPS URL validation, formula neutralisation | Oversized file rejected before parse; formula cells inert | S |
| A-14 | P2 | Holiday list shows cost rows; 2027 insurance end date is a year late | Group by trip, cap cost rows, fix the data | One headline row per trip; sane dates | S |
| A-15 | P2 | Pseudo/orphan accounts are not visible as accounts | Show them, or exclude them with a visible note | `Petrol`, `Other`, `Dan`, `Credit Cards` semantics documented in-app | S |
| A-16 | P2 | 22 duplicate-looking transaction groups | Read-only duplicates report; owner review | Report lists the groups; nothing deleted automatically | S |
| A-17 | P2 | Table/dialog accessibility gaps | `scope`/caption, focus trap, scaling pass | Audit pass at 125–200% | M |
| A-18 | P2 | No CI protection against regressions | CI: test, `tsc`, build, secret scan, bundle scan | CI blocks a change that reintroduces a secret or breaks the build | S |

### 21.2 P0 detail

- [~] **A-01 — Remove provider credentials from every data path.**
  - [x] Deleted the legacy credential values and `settings.plaintextCredentials` from the canonical seed and importer; the seed type and tests reject them.
  - [x] Provider secrets live in the passphrase-derived AES-256-GCM vault. The dataset, JSON backups and conflict snapshots carry no plaintext secret fields; backups deliberately exclude the vault.
  - [x] The provider screen and Settings read only the unlocked vault, and the Settings copy distinguishes a bank password from stored provider logins.
  - [x] Rotated every credential that appeared in a build, backup or cloud workspace (owner confirmed 2026-11-09).
  - [x] `tests/vault.test.ts` rejects plaintext seed fields and `tests/build-secrets.test.ts` scans built bundles for legacy values.
  - [x] Purged the retained pre-rotation `sync_conflicts` snapshots and old backups (owner confirmed 2026-11-13).
  - Acceptance: no non-empty legacy credential value in a built bundle; an old backup strips the fields; the vault reveal works. The old-snapshot purge is complete.

- [~] **A-02 — Keep secrets out of cloud state and the conflict archive.**
  - [x] The live cloud revision carries only the encrypted vault envelope and no legacy credential fields; conflicts now store revisions, timestamps and changed paths rather than whole documents.
  - [x] Decision: no plaintext secrets in cloud state. The vault ciphertext may sync as an opaque envelope; the passphrase never leaves the device.
  - [x] Added `plaintextCredentialPaths` / `assertNoPlaintextCredentials` in `core/sync-client.ts`; `enqueueOutbox` and the push path refuse any plaintext credential key, and `tests/sync-payload-secrets.test.ts` covers nested fields, empty legacy placeholders and the current workbook payload.
  - [x] Purged the retained pre-rotation conflict snapshots and old backups (owner confirmed 2026-11-13).
  - Acceptance: an injected cloud document and a conflict row contain no plaintext credential field; conflict row JSON stays under 8 KB for the current dataset. The purge is complete.

- [x] **A-03 — Bounded conflict storage and a resolution screen.** Implemented 2026-11-08.
  - [x] Conflicts are stored as `StoredConflict<AppState>` metadata with snapshots for only the newest two pairs that fit `CONFLICT_PAIR_BYTES` (1.5 MB); the queue holds 25 entries. `normalizeConflicts` reads both the old `{local: {state}}` shape and the new shape, so an existing device upgrades without losing its queue.
  - [x] `saveMeta`, `saveOutbox` and `saveConflicts` report quota/write failure as `storageError`, which is surfaced through `SyncStatus.message` and clears when a later write succeeds.
  - [x] **Settings → Sync conflicts** lists detection time, both revisions, changed paths and snapshot availability, with **Use mine** (restores the stored local document, then the normal outbox pushes it at the current server revision), **Use server** (dismisses; the server version is already shown) and **Export both** (JSON download).
  - [x] `sync_conflicts` now receives revisions, timestamps and changed paths only — no documents — so a row stays far below 8 KB (A-02 conflict half).
  - [x] `tests/conflict-storage.test.ts` covers 25-conflict metadata retention, the two-pair snapshot budget, an oversized pair dropping its snapshots, and changed-path diffs.
  - Acceptance: metadata is bounded independently of document size; the local version round-trips through `resolveConflict`; two-tab/live verification still needs a second Supabase account.

- [x] **A-04 — Fail closed on unrecognised accounts.** Implemented 2026-11-07.
  - [x] Added `core/accounts.ts` with `accountClassifier(directory)` / `classifyAccount(name, directory)` returning `bank | person | card | pseudo | unknown`; `monthlyIncome` and `monthlyExpenses` now classify people, pseudo-accounts and cards through it.
  - [x] Manual saves with an unknown account are blocked until mapped; imports guard on an unknown account; editing an unknown row offers it as “— needs review” and requires a known choice. A successful mapping writes an `Account mapping` changelog entry.
  - [x] Dashboard adds a **Needs review** panel listing each unclassified account, row count and expense total; Accounts lists the same names as “Not counted”. Historical locked snapshots are untouched.
  - [x] Unclassified-account review follows comment matches: filtering Transactions to `Dan` also includes the 59 rows whose comments name Dan, badges them **Linked to Dan**, and Accounts shows their count and value separately. Those rows stay on Starling and are not recounted.
  - [x] Accounts renders a **Dan — linked account** ledger: 70 rows in total (11 booked to Dan / £181.00 and 59 linked from Starling / £948.37), with an explicit **Added to owed £0.00** metric. The Starling rows keep reducing Starling as before and are not moved.
  - [x] Decision: keep the historical figures frozen and label `Dan` and `Credit Cards` as not counted; mapping remains a per-row owner choice, with no automatic reclassification.
  - [x] Added `tests/accounts.test.ts` covering the classifier, the exact unknown set (`Dan` 11 / £181, `Credit Cards` 1 / £30), known names and the unchanged November expense figure.
  - [x] Follow-up 2026-11-07: reclassified the lone `Credit Cards` row to Starling and treated comment-linked Dan as reviewed. The review queue is empty, Dan remains a linked ledger (70 rows, £0.00 owed), and Credit Cards is gone. The live Starling balance is £613.11; the frozen February total is unchanged.
  - Acceptance: no transaction is silently unclassified; new unknown rows cannot enter the budget without an explicit mapping; November totals remain £2,233.40 expenses / £383.15 bills until a mapping changes them by choice.

- [x] **A-05 — Import dedupe within the batch.** Implemented 2026-11-07.
  - [x] Build the duplicate match from date, type and absolute amount using the existing ±1 day window; check earlier staged rows as well as saved transactions (`core/importDedupe.ts`, used by `app/src/views/tools.tsx`).
  - [x] Show duplicate rows as skipped with a per-row **Import anyway** tick; the grid distinguishes `In log` from `Duplicate in file` and the summary counts both.
  - [x] Add `tests/import-dedupe.test.ts` covering the in-file case, the saved-row case and the read-only report.
  - Acceptance: staging the same file twice in one session adds zero rows; existing legitimate same-day/same-amount rows are not removed.

### 21.3 P1 detail

- [ ] **A-06 — Truthful paid status and balances.** Label provider balances as “End of <Month>” until the actual payment date is reached, or date monthly rows to their real payment date where known (`app/src/views/providers.tsx:177`, `:208`). Record realised payments per bill (`paidDate` or provider reconciliation) instead of `dueDate <= asOf` (`core/engine.ts:231`); add a missed-payment flag and a generic bill-skip mechanism so rent no longer needs a £0 override. Acceptance: on 2 November the 27 November payment is excluded or the label says “November”; a missed bill shows unpaid; rent still shows £2,233.40 expenses, £383.15 bills and a 27/12 £500 payment.

- [ ] **A-07 — Validate provider shapes.** Add validators for each provider profile and ledger (arrays where arrays are expected, numeric pence, ISO dates) to `decodeBackupDataset` and `decodeState`; make engine reads defensive (`core/engine.ts:148`); reject an invalid restore with the field path. Acceptance: a backup with `providers.councilTax = {}` is rejected with a message and the app does not blank; fuzz tests cover rent, water, council tax, o2 and virgin.

- [ ] **A-08 — Migrations, not seed clobber.** Replace `hydrateProviderDetails` (`app/src/store.ts:144`) with versioned migrations recorded in `meta.appliedFixes` / `applied_fixes`; fill only fields that are `undefined`, never overwrite saved values, and keep the seed as a one-time import. Acceptance: edit a provider field, reload, value persists; a v1 document migrates once and re-running the migration is a no-op.

- [ ] **A-09 — Stop rewriting and syncing the whole document.** Execute §20 phases 1–4 for desktop row storage; for the web build move the state to IndexedDB (or keep `localStorage` behind a hard size warning), throttle the last-good copy, and add a dataset-size guard. Then implement per-record sync or document explicitly that conflicts are whole-document last-write-wins. Acceptance: measured edit latency does not grow with transaction count; 5× the current data saves without quota failure; two-device merge or the honest limitation is recorded.

- [ ] **A-10 — Separate personal seed from distributable data.** Default build opens blank with demo data; the owner imports `data/workbook.json` through the validated restore path (or a build flag that is never used for distribution). Add personal names/amounts to the release scan. Acceptance: a default build contains no personal names, amounts or credentials; the owner build still reproduces the parity figures.

- [ ] **A-11 — One implementation per provider calculation.** Move the rent/water payment-target and ledger recalculation in `app/src/views/tools.tsx` and `app/src/views/providers.tsx` into `core/rent.ts`, `core/water.ts` and `core/telco.ts`, and have the views call them. Acceptance: golden tests show the preview rows equal the engine rows for rent, water, O2 and Virgin changes.

- [~] **A-12 — Release and auth hardening.**
  - [x] A valid Supabase configuration now restricts CSP `connect-src` to the exact HTTPS/WSS origin; CSV/URL hardening is covered by A-13.
  - [x] Remove the wildcard CSP fallback and add an exact-origin test.
  - [ ] Add OAuth `state`/nonce validation or document Supabase PKCE as the accepted check, with a forged/replayed callback test.
  - [ ] Branded icon.
  - [~] Hosted web stays private until P0-8 and browser-storage hardening are complete.
  - Acceptance: installer builds; forged/replayed callback rejected; CSP has no wildcard Supabase origin.

- [x] **A-13 — Content limits and CSV safety.** Implemented 2026-11-07.
  - CSV imports are rejected above **10 MB** or **20,000 physical data rows** before `parseCsv` runs (`core/importLimits.ts`, used by `app/src/views/tools.tsx`); backup restores use the shared **25 MB** cap.
  - `decodeBackupDataset` rejects provider URL fields whose scheme is not `http`/`https`, or that carry credentials (`app/src/backup.ts`). HTTP is deliberately retained because the owner's rent charge-letter link is HTTP; S-09's HTTPS-only rule for outbound links/web hardening still stands.
  - `toCsv` neutralises leading `=`, `+`, `@`, tab/CR and non-numeric `-` cells while leaving numbers and numeric strings numeric (`app/src/format.ts`).
  - `tests/import-safety.test.ts` covers the limits, URL rejection (including nested ledger URLs), formula quoting and the current workbook backup passing validation.

### 21.4 P2 detail

- [x] **A-14 — Holiday trips and the 2027 insurance date.** Implemented 2026-11-07.
  - `core/holidays.ts` groups rows by dates: a row with positive nights anchors a trip, and rows without nights (parking, flights, insurance) attach to the latest matching trip, so two real trips on the same dates stay separate.
  - The Dashboard shows one row per trip (capped at seven) with the stay, dates and total including cost lines. A **Show/Hide N cost lines** button expands each line's name, paid state, reference and amount beneath the trip; December is one £1,401.09 row instead of four, so later trips remain visible.
  - The Holiday tracker now shows one collapsible headline row per trip. A **Show/Hide N cost lines** control reveals indented cost lines with their own Edit/Remove actions, while the headline keeps the trip total. It counts **15 trips / 6 cost lines** (was 21 rows) and shows “—” rather than “- nights”.
  - `data/workbook.json` ends the 2027 Travel Insurance on `2027-04-24`; the `holiday-insurance-2027-end` data fix corrects saved budgets.
  - `tests/holidays.test.ts` added. Verified in the running app: December shows `7 nights · 3 cost lines` and £1,401.09; Kn Matas shows £837.82 with 2 cost lines and ends 24/04/2027; tracker metrics are 15 trips / 8 upcoming / 73 nights. 89/89 tests, `tsc` and `build:web` clean; installer rebuilt.
- [x] **A-15 — Pseudo-accounts and excluded rows visible.** Implemented 2026-11-07 in Accounts. A new panel lists `Petrol` (24 rows, £685.66 to the as-of date) and `Other` (0, £0.00) as pseudo-accounts with an “Included in expenses” badge; any account outside the known bank/person/card sets is listed as “Not counted” — currently `Dan` (11 rows, £181.00) — with a note that the rows are preserved but excluded from totals and reviewable in Transactions. The excluded panel also shows comment-linked rows: `Dan` links to 59 comment-only rows (£948.37) that remain counted on Starling and are not added to Dan's £181.00. The excluded table and ledger show the combined Dan amount **£1,129.37** (£181.00 direct + £948.37 linked), with a **£0.00** impact on People who owe me. The lone `Credit Cards` row was reclassified to Starling on 2026-11-07, so it is no longer an excluded account and the review queue is empty. Dan is now a person record with `trackOwed: false`: People shows £0.00 owed, and his direct expenses are included in the Starling balance (now £432.11) without changing the owed total. Monthly totals are unchanged.
- [x] **A-16** — Read-only duplicate report for the 22 same-key groups; the owner decides whether each is a round-up, a transfer or a true duplicate. No automatic deletion. Implemented 2026-11-07 as **Settings → Duplicate check** (`duplicateGroups` in `core/importDedupe.ts`): 22 groups / 44 rows in a collapsed table, pure and read-only; verified in the browser.
- [ ] **A-17** — Accessibility: `<th scope>`, table captions, focus trap in the command palette and dialogs, visible focus, 125–200% scaling.
- [ ] **A-18** — CI: `npm test`, `tsc`, `build:web`, the A-01 secret/bundle scan and a typecheck of the tests. Add the new tests to the `npm test` script.

### 21.5 Order, dependencies and decisions

Order: **A-01/A-02 (then rotate) → A-04/A-05 → A-03/A-07/A-08 → A-06/A-09/A-10 → A-11–A-18.**

- A-01 and A-02 are the distribution gate; nothing leaves this machine until they and the rotation are done.
- A-04 needs a data decision on `Dan` and the single `Credit Cards` row before the numbers can change; until then the classifier can flag without altering totals.
- A-09/A-11 depend on §20 phases 1–4; do not start row storage before A-07 has bounded the provider shapes.
- A-03's live two-device test and the RLS/two-account test remain blocked on Supabase credentials; A-12's signing remains blocked on a certificate.

Decisions needed:

- [ ] Store provider secrets in the OS vault on desktop and never in the web build, or drop password storage entirely. Recommended: OS vault only.
- [ ] Map `Dan` to a person (recommended if real) or to `Other`; map the single `Credit Cards` row or mark it excluded.
- [ ] Replace the personal seed with a blank/demo default (recommended) or keep the personal build private and never distribute it.
- [ ] Per-record sync after §20, or keep whole-document sync with an explicit last-write-wins warning.

**Definition of done for every item:** code plus the named test(s), `npm test`, `tsc` and `build:web` green, a verification-log entry, and the related `S-xx`/`P0-x` line updated. Live cloud, installer and E2E checks are recorded as blocked, never as passed.

---

## 22. Progress scorecard and competitor refresh — 2026-11-08

Added 2026-11-08. A quantitative read of this plan and a market check of the apps named in §19, using their own pages and published price trackers from August–November 2026. Method: counted from this document's own status markers and feature rows; nothing here changes a budget figure. Competitor prices and tiers move — re-check before quoting them to anyone, and refresh this section quarterly.

**Historical snapshot.** The counts below describe 2026-11-08 and are superseded by the checklists in §5, §6 and §15. In particular, P0-3 is now closed, manual restore points/UI smoke tests have landed, and categories/alerts/first-run are no longer unreleased.

### 22.1 How much of the plan is done

| Scope | Done | In progress | Open | Done |
| --- | ---: | ---: | ---: | ---: |
| §5 P0 stop-ship sub-items | 44 | — | 18 | 71% |
| §6 P1 credible first release | 2 | 0 | 18 | 10% |
| §7 P2 launch quality | 0 | 0 | 7 | 0% |
| §21 audit items (A-01–A-18) | 6 | 0 | 12 | 33% |
| Every tracked checkbox | 67 | 10 | 158 | 29% |

The audit items closed are A-04 (unknown-account classification), A-05 (in-batch import dedupe), A-13 (content limits and CSV safety), A-14 (holiday trips), A-15 (pseudo-accounts visible) and A-16 (read-only duplicate report) — the money-integrity and content-safety fixes.

**Gate level at this snapshot:** four of nine P0 gates were closed — P0-1 local-to-cloud consent, P0-2 persistence and recovery, P0-7 statement correctness and P0-9 money-integrity guardrails. P0-3 was still in progress. Current status: **five closed** (P0-3 backups added), P0-4 in progress, P0-5/P0-6 removed from scope, P0-8 open on the snapshot purge.

| Phase (§12) | Status | Remaining |
| --- | --- | --- |
| 1 Data model + migration | Complete | Versioned migrations |
| 2 Calculation engine | Core complete | Later-year views, golden statements per account |
| 3 Windows/web app | Built | Signed installer, accessibility, Excel/PDF export |
| 4 iOS | Not started | Blocked on macOS/Xcode |
| 5 Sync and auth | Partial | Two-account RLS, two-device/offline, conflict UI, realtime |
| 6 Import/export/guides/backups | Partial | Excel/PDF export, scheduled backups and restore points |

**Feature roadmap (§9) at this snapshot:** none of its rows was released. Since then, transaction categories/tags, in-app alerts, first-run blank/demo, encrypted backups and provider snapshots have shipped; the planning layer is no longer entirely absent.

Reading: the replacement product is built and live; the release is about a third of the way through its gates. The 29% overall figure is dragged down by §7 and §9 items that only become meaningful after the P0 gates close.

### 22.2 Market position, refreshed

| Capability | FinanceHub | Emma | Snoop | YNAB | Monarch / PocketSmith |
| --- | --- | --- | --- | --- | --- |
| Open Banking feed | No — CSV only (Starling) | Yes, 50+ UK banks | Yes | Yes, Plaid/MX | Yes; PocketSmith claims 12,000+ institutions |
| Categories, tags, budgets | Categories and tags; no budgets/rules | Custom categories free on Pro; budgets with rollover and daily allowance | Basic categories, 3 custom free | Envelopes, targets, loan planner | Categories, rules, splits |
| Subscription detection and cancellation | No — bills are entered by hand | Track and cancel | Core pitch ("Snoops") | No | Monarch tracks and reminds |
| Alerts and reminders | In-app bill/balance/card alerts; no push/email | Weekly bill reminders, overdraft alerts | Bill and deal alerts | Limited | Yes |
| Native mobile app | No — web/desktop | iOS and Android | iOS and Android | iOS, Android, web | iOS, Android, web |
| Net worth, assets, investments | Accounts and cards only | Spaces, savings, investing, crypto; rent reported to Experian | Credit score only | Tracking accounts, net-worth report | Full asset, mortgage and investment tracking |
| Shared household budget | Read-only people portal, one owner | No | No | Up to 6 people | Partner invite (Monarch) |
| Forecasting | Open-month projection only | Limited | No | No | PocketSmith to 60 years with scenarios |
| Reports and export | CSV and JSON backup; no Excel/PDF | CSV export on higher tiers | Limited | Reports | Cash-flow statements, reports |
| Provider ledgers with running balances | Yes — 8 ledgers, rent rules | No | No | No | No |
| Month-end lock and audit trail | Yes | No | No | No | No |
| People-owed ledger | Yes | No | No | No | No |
| Local-first, no account required | Yes | No | No | No | No |
| Price | One-off / self-hosted | Free; Plus £4.99, Pro £9.99, Ultimate £14.99 per month (£41.99/£83.99/£124.99 a year) | Free; Plus £5.99 per month or £47.99 a year | $14.99 per month or $109 a year | Monarch $14.99 per month; PocketSmith subscription tiers |

### 22.3 What the comparison says

- **Breadth:** roughly a third of Emma's consumer surface. The missing third is the connective tissue — bank feed, categorisation, detection, alerts, mobile — which is also the order Emma itself built it in.
- **Depth:** ahead of every listed competitor on the axis they do not compete on: penny-exact parity, eight provider ledgers with carry-forward rules, month-end locks with immutable snapshots, owed-by-person and a changelog that separates locked fact from projection. Emma can report £190 of eating out; it cannot report that the Water balance is £70 because a quarterly bill has not landed.
- **Tier design is the competitive lesson.** Emma charges for bank logins (two free, four on Plus, unlimited on Ultimate), custom categories and net worth. Those are exactly the features this app has not started, so a future paid tier has an obvious shape if one is ever wanted.
- **The standalone UK aggregator field is thinning.** Moneyhub closed its consumer app in summer 2026 to focus on business clients, and Snoop now sits inside Vanquis Banking Group. That strengthens the local-first, own-your-data, one-off-price position rather than weakening it.
- **The real gap is still onboarding (§19.4):** the market onboards with "connect your bank and we build the budget"; this app still onboards from a workbook. No competitor table captures that, and it is the single largest adoption risk.

### 22.4 Gaps ranked by leverage

| Rank | Gap | Why it matters | Effort | Unlocks |
| ---: | --- | --- | --- | --- |
| 1 | Categories and tags on transactions | Cheapest change with the widest effect; everything downstream needs a category field | M | Reports, search, rules, splits, budgets |
| 2 | Recurring detection plus alerts | Turns a passive ledger into something that talks to the user | M | Subscription tracker, bill and balance alerts |
| 3 | First-run model builder (see §9 C) | Removes the workbook as a prerequisite for a new user | M | Demo-to-real conversion, distributable build |
| 4 | Net worth and manual assets | The one "complete picture" feature every paywalled competitor sells | M | Property, vehicles, mortgage, investments |
| 5 | PWA or mobile companion | A balance cannot be checked from a laptop in a shop | L | Read-only mobile entry, alerts on the go |
| 6 | Bank feed | The differentiator once C-4 clears; CSV stays the fallback | XL | Removes manual import, enables detection |

Since this ranking: item 1 (categories/tags) is delivered, item 2 is partly delivered (in-app alerts, but no recurring detection), and item 3 is partly delivered (blank/demo onboarding, but no CSV-plus-questions builder). The highest remaining unbuilt gaps are category budgets/reports, net worth, a PWA/mobile companion and the bank feed.

### 22.5 Drift against earlier sections

- §19.4 bullet 1 (demo dataset) is **delivered**: the hosted sign-in screen and first run offer **Explore a sample budget**. Bullet 2 (first-run model builder) is still absent and is now a roadmap row in §9 C. Bullet 3 (start from scratch) is **delivered** through the blank-budget first-run choice, though a new user still cannot build a populated model from a CSV without the workbook-shaped seed.
- §1's audit snapshot and §19's own comparison were written against the November 2026 competitor pages; prices in §22.2 are the later check. Where they disagree, §22.2 wins until the next refresh.
- §9 remains the authoritative roadmap; §22.4 ranks it rather than replacing it.

### 22.6 Sources checked for §22

- Emma plans and prices: <https://help.emma-app.com/en/article/how-much-does-emma-plusproultimate-cost-1ywhulq> (updated 15/09/2026); features <https://emma-app.com/features/tracking>
- Emma tier and bank-login limits: <https://portofelo.com/blog/emma-app-alternatives> (September 2026); <https://www.finder.com/uk/budgeting/emma-review> (updated 28/09/2026)
- Snoop price and ownership: <https://netoapp.es/en/blog/best-budgeting-apps-uk> (02/10/2026); <https://www.tryabel.com/emma-vs-snoop-vs-plum> (2026)
- YNAB price, sharing and features: <https://www.ynab.com/pricing>, <https://www.ynab.com/features>, <https://frontdeskreview.com/software/budgeting-apps/ynab> (01/11/2026)
- Monarch and PocketSmith features: §19.7 plus <https://www.pocketsmith.com/features>
- Market consolidation and self-hosted alternatives: <https://www.startdoingwell.com/resource/ynab-alternative> (02/11/2026)

These are third-party and vendor pages, not audited figures; they are cited to show where each claim came from, not as endorsement.
