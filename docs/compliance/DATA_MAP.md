# FinanceHub Data Map — DRAFT

**Status:** Draft for PR-1 review. Not legal advice. Validate every “to confirm” item
before sign-off.

**Controller:** Zane Stanton, individual, England.

**Product:** FinanceHub personal budgeting app — Windows Electron build and hosted web
build, with optional Supabase account and sync.

**Version:** 1.0 draft, 14 November 2026.

**Related documents:** `DPIA.md` (including Addendum A), `PRIVACY_NOTICE_DRAFT.md`,
`PROCESSOR_REGISTER.md`, `RETENTION_SCHEDULE.md`, `DSAR_PROCEDURE.md`,
`BREACH_RUNBOOK.md`, `EVIDENCE_CHECKLIST.md` and `PLAN.md` §23.

---

## 1. Purpose and boundary

This map records what personal data FinanceHub processes, where it goes, who can access
it, how long it is kept and which processor or transfer applies. It covers:

- the packaged Windows app (`electron/` plus the React renderer in `app/`);
- the hosted static web build at `https://financehub.freedev.app/`;
- Supabase Auth, Postgres, Row Level Security and Realtime;
- Google OAuth when the user chooses it;
- InfinityFree static hosting;
- GitHub Releases for installer and update downloads;
- local exports, restore points, the people portal and feedback.

It does **not** cover Open Banking, payments, card acquiring, analytics, advertising or
crash reporting. None of those are in the current build; adding any of them requires a
new data map and DPIA review.

---

## 2. Roles

| Party | Role | Notes |
| --- | --- | --- |
| Zane Stanton | Controller | Individual based in England; privacy contact still to be created. |
| The signed-in user / budget owner | Data subject and, for household data, the person who enters it | The owner may enter information about other people. |
| Named people in the budget | Data subjects | Their names, balances, transactions and statements may be processed without them being app users. |
| People-portal users | Data subjects | A person given a read-only statement sign-in by the owner. |
| Feedback authors | Data subjects | A person who sends feedback through the app or portal. |
| Supabase | Processor | Auth, Postgres, RLS, Realtime; DPA and region to confirm. |
| Google | OAuth identity provider; controller/processor role to confirm | Only if Google sign-in is chosen; terms to confirm. |
| InfinityFree | Processor / hosting provider | Serves static assets and may keep access logs; DPA position to confirm. |
| GitHub / Microsoft | Infrastructure recipient | Serves release assets and update manifests; receives network metadata, not budget data. |
| Email delivery provider used by Supabase | Processor | Provider and terms to confirm for verification and password-reset email. |
| Privacy/support mailbox provider | Processor (Gmail/Google) | Mailbox `financehub+pauluk83@gmail.com` adopted; terms/retention to confirm. |
| Legal advisers, privacy adviser and penetration tester | Professional recipients | Only under confidentiality; evidence to be retained. |
| ICO, courts, law enforcement | Independent recipients | Only where required or permitted by law. |

---

## 3. Data subjects and data categories

### 3.1 Data subjects

1. The owner who creates a workspace.
2. Household members, borrowers, lenders, tenants or other people named in the budget.
3. People given a read-only portal sign-in.
4. People who submit feedback.
5. Anyone whose data appears in a support bundle, exported backup or email to support.

### 3.2 Data inventory

| ID | Data category | Examples | Personal data? | Source | Purpose | Lawful basis to confirm | Storage | Recipients | Retention |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Account identifiers | Email address, Supabase user ID, auth-provider subject, passkey credential ID/public key | Yes | User, Supabase Auth, Google | Sign-in, account recovery, workspace ownership | Contract; legal obligation for security records | Supabase Auth; session cache on device | Supabase, Google (if chosen) | Until account deletion, subject to processor backup windows |
| D2 | Authentication secrets and sessions | Password hash (Supabase-managed), access/refresh tokens, PKCE verifier, passkey private key held by authenticator | Yes | User, Supabase Auth, authenticator | Authenticate and keep the session | Contract; legitimate interests for security | Supabase Auth; desktop DPAPI-backed store; web localStorage | Supabase; the user's device | Session lifetime; refresh-token rotation; until sign-out or account deletion |
| D3 | Core budget record | Accounts, balances, bills, income schedules, cards, debts, savings, holidays, month locks, changelog, settings, provider ledgers, audit entries | Yes; financial data, not a GDPR special category by itself | User input, CSV import, seed/demo data | Provide the budgeting service | Contract; legitimate interests for household records | Local device; Supabase `settings.state_json` when synced | Supabase; the user's devices | Until workspace reset or account deletion; local copy until removed |
| D4 | Transaction detail | Dates, amounts, account, type, comments, category, tags, status, bill links, running balances | Yes; comments may reveal special-category data if the user types it | User, CSV import, generated bill rows | Ledger, statements, reconciliation, exports | Contract | Local device; cloud document | Supabase; the user's devices | Same as D3 |
| D5 | People and household data | Names, short names, opening balances, amounts lent/repaid, statement lines, portal statement snapshots | Yes; may include third-party data | Owner | Track money owed and provide statements | Contract for the owner; legitimate interests or contract for the named person — counsel to confirm | Local device; cloud document; portal snapshot in localStorage | Supabase; portal user's device | Same as D3; portal snapshot until portal deletion or local storage removal |
| D6 | Provider account metadata | Provider name, account reference, billing details, portal URL, logo, payment dates, contract figures | Yes | Owner | Display and manage provider ledgers | Contract | Local device; cloud document | Supabase | Same as D3 |
| D7 | Provider credentials | Provider username, password, charge-letter password, access-bill value | Yes; high sensitivity | Owner, optional | Open provider portals manually; never used for automated bank access | Consent (currently drafted); counsel to confirm contract vs consent | Encrypted client-side vault inside the local/cloud document | Supabase stores ciphertext only; no server decryption | Until vault deletion or account deletion; ciphertext in old revisions/backups may persist |
| D8 | Vault metadata | Salt, IV, iteration count, ciphertext, optional hint, updated time | Hint may be personal; rest is cryptographic metadata | App | Unlock and synchronise the vault | Contract / legitimate interests | Local device; cloud document | Supabase | Until vault deletion; old revisions may retain ciphertext |
| D9 | Portal credentials | Username, normalised username, PBKDF2 hash, salt, iterations, person name, statement snapshot, timestamps | Yes | Owner creates; person uses | Read-only statement access | Contract or legitimate interests — counsel to confirm | Browser localStorage only; not cloud-synced | No processor; device-local | Until portal deletion or local storage removal |
| D10 | Feedback | Author name/person, message, owner ID, source, created/read timestamps | Yes; free text may contain sensitive data | Owner or portal user | Receive corrections and suggestions | Legitimate interests / consent — counsel to confirm | Browser localStorage; maximum 100 items per owner | No processor; device-local | Until deleted or local storage removed; `readAt` does not delete |
| D11 | Backups and restore points | Encrypted backup envelope; optional plain JSON export; restore-point metadata; auto-backup key | Yes; full financial record | App, user | Recovery and portability | Contract | Device storage; user-chosen export location | None by the app; user controls any sharing | Seven restore points; exports until user deletes; support copies only as needed |
| D12 | Sync metadata | Device ID, revision, cursor, outbox operation, conflict IDs, changed paths, timestamps | Yes; device ID and activity metadata | App | Synchronise, retry, detect conflicts | Contract; legitimate interests for security | Local device; Supabase `sync_clock`, `sync_ops`, `sync_conflicts` | Supabase | Outbox/conflict until resolved or purged; account deletion cascades |
| D13 | Support diagnostics | App version/build, platform, user agent, language, online flag, dataset counts, health check IDs/severity, conflict count, backup timestamps | Yes; user agent and device context can be personal | App when the user chooses to export | Troubleshooting | Legitimate interests / consent to share | User downloads the file; support mailbox if sent | Support mailbox, if the user sends it | Delete after resolution |
| D14 | Hosting and authentication logs | IP address, timestamp, request path, email/auth events, errors | Yes | Supabase, InfinityFree, GitHub | Security, abuse prevention, debugging, billing | Legitimate interests; legal obligation where applicable | Processor logs | Processors and their sub-processors | Processor-defined; confirm and record |
| D15 | Demo data | Synthetic names, transactions and budgets | No real data if the demo remains synthetic | Bundled seed | Let people explore the app | Not personal data | Browser/device only; never synced | None | Until browser/app data is cleared |

**Special-category data:** FinanceHub does not ask for health, religion, ethnicity, sexual
orientation, biometric or criminal-offence data. Free-text comments, merchant names,
feedback and provider references can nevertheless contain it. The app must not use those
fields for profiling or automated decisions; support staff should avoid copying free text
into tickets unless necessary.

---

## 4. Flow register

| Flow | From → to | Data | Trigger | Transport / protection | Access | Retention / notes |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | React renderer → local device store | Full `AppState`: dataset, theme, saved timestamp, optional vault ciphertext | Every successful save | On Windows, Electron IPC to a SQLite value store encrypted per value with `safeStorage`/DPAPI; hosted web uses `localStorage` | The Windows user / browser origin | Until reset, local-copy removal or app-data removal |
| F2 | Desktop renderer → local HTTP store bridge | Same key/value pairs, including budget and session | Browser-mode desktop use | Loopback HTTP `/api/store`; Electron native store | Local process and Windows user | Same as F1; not a separate long-term store |
| F3 | Hosted browser → `localStorage` | Budget, last-good copy, damaged copy, sync metadata, restore points, portal records, feedback, session token | Saves, sync, portal and feedback actions | Browser origin storage; no app-layer encryption | Any script on the origin and anyone with the browser profile | Until site data is cleared; DPIA risk S-04. **Planned launch change:** the public hosted build will be synthetic demo + account settings only and will not load a real budget; this row describes the current live build until C2 lands. |
| F4 | User → Supabase Auth (email/password) | Email, password over TLS, session tokens | Sign-up, sign-in, recovery | HTTPS; Supabase Auth; no password stored by the app | Supabase Auth; user | Auth record until deletion; session until expiry/sign-out |
| F5 | User → Google → Supabase Auth | Google identity, email, OAuth code; no Google password | User chooses Google sign-in | OAuth 2.0 authorisation code with PKCE; HTTPS; desktop loopback callback | Google, Supabase | Google terms and retention apply; Supabase auth record until deletion |
| F6 | User → Supabase passkey flow | Passkey credential ID/public key, challenge; private key stays in authenticator | Hosted passkey enrolment/sign-in | WebAuthn over HTTPS; RP ID `financehub.freedev.app` | Supabase; user's authenticator | Credential until removed or account deletion |
| F7 | Supabase session → device | Access token, refresh token, user ID | Sign-in and token refresh | Desktop: DPAPI-backed store. Web: localStorage | User's device | Until sign-out, revocation or expiry |
| F8 | Renderer → Supabase `settings` | Full `AppState` JSON: dataset, theme, savedAt, optional vault ciphertext; scalar settings columns | Signed-in save/sync | HTTPS; Supabase anon key + JWT; RLS; `financehub_push_state` revision check | The authenticated owner only; service-role operators in principle | Until account deletion; old revisions/backups may persist |
| F9 | Supabase → renderer | Full document plus sync metadata; changed rows from pull RPC; Realtime hints | Sign-in, focus, reconnect, Realtime event | HTTPS/WSS; RLS scoped to `auth.uid()` | Authenticated owner | Local copy follows F1 |
| F10 | Renderer → provider vault | Provider credentials encrypted with PBKDF2-SHA-256 (600,000 iterations) + AES-256-GCM | User creates or edits the vault | Plaintext only in memory; ciphertext in `AppState.vault`; passphrase never stored or sent | User who knows passphrase | Until vault deletion; old ciphertext may remain in revisions/backups |
| F11 | Renderer → local backup store / user file | Encrypted backup envelope; optional plain JSON budget export; automatic restore points | Daily automatic point, manual backup or restore | WebCrypto AES-GCM; manual passphrase or random device-bound key; user downloads plain JSON on request | User; anyone with the file/passphrase | Seven points; exports until user deletes |
| F12 | Owner → people portal → portal user | Username, password hash/salt, person statement snapshot | Owner creates portal; person signs in | PBKDF2-SHA-256 (600,000 iterations), 16-byte salt; local `localStorage`; no server | Owner's browser profile and portal user | Until portal deletion or local storage removal |
| F13 | Owner/portal user → feedback store | Author, message, owner ID, source, timestamps | Feedback form | Local `localStorage`; no network | Owner's browser profile | Until deleted; max 100 items |
| F14 | App → support bundle | Counts, check IDs, version/build, platform, user agent, timestamps | User chooses **Data health → support bundle** | Locally generated JSON download; no automatic upload | User; support if sent | Delete after resolution |
| F15 | App → GitHub Releases | Version/build, request for manifest/asar; GitHub receives IP/user-agent and request metadata | Launch update check and update download | HTTPS; no budget, credentials or account identifiers sent | GitHub; no app data beyond request metadata | GitHub logs under its terms |
| F16 | User → `delete_my_account` | Auth user ID | User confirms cloud deletion | Authenticated RPC; `SECURITY DEFINER`; cascade from `auth.users` | Owner only; service-role operators in principle | Removes cloud auth and public rows; local copies/exports unaffected |
| F17 | Processors → logs | IP, auth events, requests, errors | Normal operation | Processor logging | Processor; owner where dashboards expose logs | Processor-defined; no retention job in app |

### 4.1 Cloud tables in scope

- `auth.users` and Supabase Auth session/identity tables — account and authentication.
- `settings.state_json` — the complete synced budget document; the active sync path.
- `settings` scalar columns — target year, currency, dates and revision metadata.
- `sync_clock`, `sync_ops` — per-user sequence and idempotency metadata.
- `sync_conflicts` — revision numbers, timestamps, entity/record ID and changed paths; the
  current client inserts metadata rather than full snapshots. Historical rows from
  earlier builds may contain full `local_json`/`remote_json` documents; verify and purge
  them before sign-off rather than assuming the current insert shape applies to old rows.
- Normalised legacy tables (`accounts`, `people`, `cards`, `bills`, `bill_changes`,
  `income_schedules`, `transactions`, `month_locks`, `holidays`, `changelog`,
  `provider_entries`, `credential_vault`, `audit_log`, `devices`, `profiles`) —
  RLS-protected; confirm whether any still contain data before relying on the
  document-only description. The client pull reads them but the app uses the `settings`
  document as the source of truth.
- All public tables reference `auth.users(id) on delete cascade`; confirm this in the
  applied schema and test it with a throwaway account.

---

## 5. Storage and access map

| Location | What is stored | Protection | Who can access | Notes |
| --- | --- | --- | --- | --- |
| Windows Electron user-data SQLite store | Budget keys, last-good/damaged copies, session, restore points, sync metadata, auto-backup key, app-lock config | Per-value encryption via Electron `safeStorage` (DPAPI); SQLite file itself is not SQLCipher | Windows user, Electron process, anyone with the unlocked OS session | S-06: no full-database encryption; app lock is a screen barrier, not disk encryption |
| Windows renderer localStorage | People portal records, feedback; possibly browser-mode caches | Chromium profile permissions; not app-layer encrypted | Windows user, same-origin renderer | Portal/feedback are deliberately device-local, not synced |
| Hosted web localStorage | Current live build: budget, last-good copy, sync metadata, restore points, auto-backup key, portal records, feedback, Supabase session | Browser origin isolation and CSP; no app-layer encryption | Any script on the origin; anyone with the browser profile | S-04 production blocker. Planned launch: synthetic demo + hosted account settings only; no real budget loaded. Implement and verify before C2 closes. |
| Supabase Postgres | Account/auth data, full budget document, sync metadata, conflict metadata, legacy tables | TLS; RLS by `auth.uid()`; encrypted at rest by the provider (confirm region/terms) | Authenticated owner; Supabase service-role/operators | Cloud document is not end-to-end encrypted (S-02) |
| Supabase Auth | Email, password hash, identities, passkeys, sessions | Supabase-managed; TLS; provider controls | Supabase; the account owner | Password material never reaches FinanceHub |
| Google | Google account identity and OAuth consent | Google controls | Google; the user | Only if Google sign-in is chosen |
| InfinityFree | Static HTML/JS/CSS and access logs | TLS; provider controls | Provider; public assets are not confidential | No budget data should be deployed |
| GitHub Releases | Installer, `app.asar`, manifest, checksums; request metadata | HTTPS; public assets | Anyone; request metadata logged by GitHub | No account or budget data in assets |
| User export locations | JSON/CSV/encrypted backup/support bundle | User-controlled | User and anyone they share with | Plain JSON backup is not encrypted |
| Support mailbox | Whatever the user sends | Mail provider controls | Owner/support | Not yet created; minimise and delete after resolution |

---

## 6. Retention and deletion map

| Record | Retention | Deletion route | Residual copy risk |
| --- | --- | --- | --- |
| Auth account and identifiers | Until account deletion | `delete_my_account`; processor backup window | Supabase backups/logs may persist until provider expiry |
| Cloud budget document and revisions | Until account deletion | Cascade from `auth.users` | Old database backups, point-in-time recovery, logs |
| Local budget and last-good/damaged copies | Until reset, remove local copy or app-data removal | Settings reset/remove; OS app-data removal | Browser profile backups, disk images |
| Vault ciphertext | Until vault deletion or account deletion | Delete vault; account deletion | Old cloud revisions, conflict history, exported backups |
| Vault hint | Until vault deletion | Delete vault | It is plaintext by design; never put a passphrase in it |
| Restore points | Seven newest; daily automatic point | Remove individually; reset removes all | Device backups/images |
| Sync conflicts | Local queue 25; snapshots for at most two pairs within 1.5 MB; cloud metadata until purge/deletion | Resolve, purge, or account deletion | Cloud backups; old local documents |
| People portal records | Until portal deletion or local storage removal | Settings → People sign-ins; clear site data | Browser profile/disk backup |
| Feedback | Until deleted or local storage removal; max 100 | Feedback inbox delete; clear site data | Browser profile/disk backup |
| Support bundle | Until support request resolved | Delete download and mailbox copy | Mailbox backups |
| Processor logs | Processor-defined | Processor controls | Confirm retention in DPA/register |

**Deletion caveat:** cloud deletion does not delete local device copies, exported backups,
screenshots, support emails or processor backups. The privacy notice and deletion UI must
say this before the user confirms.

---

## 7. Rights map

| Right | Product route | Evidence/limitation |
| --- | --- | --- |
| Access | In-app budget, statements, JSON/CSV export | Owner can export; a named person may need a statement extract without other people's data |
| Rectification | Edit records in app | Some imported/locked-month facts are immutable by design; explain why |
| Erasure | Reset workspace, remove local copy, delete vault, delete cloud account | Cloud function applied; throwaway test pending; local copies/exports remain |
| Restriction | Stop syncing; delete optional feature data | No server-side “restrict processing” flag; manual process needed |
| Portability | JSON and CSV export | Structured, commonly used format; confirm scope for named people |
| Objection | Stop optional processing; delete vault/feedback | No marketing or analytics to object to; record the position |
| Withdraw consent | Delete vault (if consent is the basis) | Clarify whether vault is consent or contract before launch |
| Automated decisions | None | No profiling, scoring or automated eligibility decisions |
| Complaint | Privacy contact and ICO | Mailbox recorded; DSAR register and rights test still open |

---

## 8. Processors, transfers and unknowns

The region, DPA, sub-processor and transfer evidence for each entry is tracked in
`PROCESSOR_REGISTER.md`. The table below is the data-map summary; the register is the C1
closure record.

| Recipient | Data | Agreement/transfer status | Action |
| --- | --- | --- | --- |
| Supabase | Auth, budget document, sync metadata, logs | DPA/region/transfer mechanism to confirm | Execute DPA; record region, sub-processors, backup window, IDTA/SCC |
| Google | OAuth identity and email | Terms/data-processing position to confirm | Record Google terms and transfer basis; disclose in notice |
| InfinityFree | Static hosting and access logs | DPA/terms to confirm | Record terms, log retention and security contact |
| GitHub / Microsoft | Release downloads, IP/user-agent | Terms to confirm | Record as infrastructure recipient; no budget data sent |
| Supabase email provider | Verification/reset email address and content | Provider and terms to confirm | Identify provider; add to register or replace with owner-controlled SMTP |
| Privacy/support mailbox | User correspondence and support bundles | Provider: Gmail/Google (`financehub+pauluk83@gmail.com`); DPA/terms/retention to confirm | Record Gmail terms/transfer/retention; restrict access |
| Advisers/pen tester | Documents and test evidence | Confidentiality/engagement terms | Keep evidence outside the public repository |

**International transfers:** the Supabase project region and each processor's sub-processor
locations must be recorded. If data leaves the UK, identify the UK IDTA or SCC and the
transfer risk assessment. Do not state “UK data stays in the UK” until the region and
sub-processors are confirmed.

---

## 9. Security controls and gaps

### Controls present

- HTTPS for Supabase, Google, InfinityFree and GitHub.
- Supabase Auth with PKCE; passkey support on the hosted origin.
- RLS policies scoped to `auth.uid()` on public tables.
- Anon/publishable key only in the client; service-role key is not shipped.
- Provider credentials encrypted client-side with AES-256-GCM and PBKDF2-SHA-256.
- Windows sessions and values use Electron `safeStorage`/DPAPI, not plaintext JSON.
- Backup encryption, checksum and seven-point retention.
- Sync conflict snapshots are bounded locally; the current client writes revision metadata and changed paths to the cloud, though historical rows need verification and purge.
- Support bundles exclude names, amounts, comments, credentials and raw messages.
- Content Security Policy, no `eval`, no `dangerouslySetInnerHTML`; React escapes text.
- Account deletion RPC is authenticated, `SECURITY DEFINER` and cascades.

### Gaps and production conditions

1. **Hosted web storage:** the current live build shares the budget, session and
   auto-backup key in plaintext `localStorage`. The public launch will be a synthetic demo
   plus hosted account settings only, with no real-budget load, view or sync; implement and
   verify that restriction before C2 closes.
2. **Cloud document encryption:** `settings.state_json` is plaintext at rest; record the
   risk acceptance or encrypt the wider document.
3. **Local database:** SQLite is not SQLCipher; DPAPI protects values but not the whole
   database or metadata.
4. **Authentication:** live passkey ceremony, email verification and two-account RLS
   isolation are not tested.
5. **Deletion:** cloud deletion is applied but not tested with a throwaway account;
   local copies and exports remain separate.
6. **People portal:** device-local records contain another person's statement and a
   password hash; there is no server-side access control or audit.
7. **Feedback:** free-text messages are stored locally without encryption and may contain
   sensitive data.
8. **Transfers:** DPA, region and sub-processor evidence are incomplete.
9. **Retention:** no automated server-side retention job; processor backup windows are
   unconfirmed.
10. **Assurance:** no independent penetration test or completed RLS/auth test evidence.

---

## 10. Change control

Re-run this map and the DPIA addendum before adding:

- Open Banking, bank feeds, payments or card data;
- analytics, crash reporting, advertising or any new SDK that sees app data;
- receipt attachments, OCR or cloud file storage;
- household sharing, additional users per workspace or public profiles;
- a new processor, region or international transfer;
- any change to the cloud document format, vault, portal or feedback storage;
- a new distribution channel (Microsoft Store, Apple App Store, mobile app).

**Owner:** Zane Stanton. **Review date:** before public production and at least annually.
