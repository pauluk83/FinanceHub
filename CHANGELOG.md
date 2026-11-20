# FinanceHub application changelog

Every build regenerates the in-app **Application changelog** from this file, so the
release history ships with the web bundle and the Windows app. Add a section when a
release changes behaviour; the build stamps it with the version, a source build id
and the build time.

## [2026.11.20] — 20 November 2026

### Changed
- Remove the cleared checkbox from the transaction table; plan reduced to five points
- Wire encrypted backup upload to the Supabase bucket
- Dashboard income card and holiday countdown
- Keep 30 automatic daily restore points
- Remove the dashboard holiday list and show both income dates
- Show the income due and holiday countdown cards on Monthly
- Show days remaining on the income due card instead of amounts
- List signed-in devices and sign out everywhere
- List signed-in devices and sign out everywhere
- Let every Tools item be hidden or moved, except Settings
- Share the provider rules, compare restore points and check statements against locks
- Add property-based ledger invariants and import fuzz tests
- Add the monthly what changed digest

## [2026.11.19] — 18 November 2026

### Changed

- Publish the Windows installer for the ranked budget delivery and audit fixes
- Add bill price history and expiry reminders, Ctrl+K budget search, spending reports with report-only targets, evidence packs, and opt-in email reminder digests
- Count a bill once when its payment is already in the transaction log, and mark that bill Paid from log
- Tolerate a bill paid under its guessed amount so it still settles once
- Preview and apply one-click data-health fixes for dead bill changes, missing link sheets and generated rows left by deleted bills
- Phone companion editing with its own month and year control; a quieter budget changelog
- Test the desktop OAuth callback and ship SBOM, claims and packaged smoke evidence
- Holiday search, an accountant pack and a redacted local crash journal
- Repair damaged budgets, cache in IndexedDB with a double-tap guard, and upload encrypted backups through a storage adapter
- Data health reports saved-document repairs, and the plan closes steps 1-7
- Repair keeps unreadable transaction rows instead of dropping spending; step 8 backup bucket and policies applied

## [2026.11.18] — 18 November 2026

### Changed
- Bills due today are treated as paid from midnight and leave the Starling balance even before the next bank import
- Mobile read-only companion, net worth, import rules, bill calendar and explainable figures
- Reconciliation and import rollback, subscription detection, 12-month forecast, debt and savings progress, and onboarding templates
- Keep savings in the forecast position, use the lock cutoff for statement checks, and batch every bank-feed import for undo
- Audit fixes: roll cleared debt payments forward, reject impossible CSV dates and overflowing amounts, validate backup rows before restore, and block catastrophic rule regexes

## [2026.11.17] — 17 November 2026

### Changed
- Keep the sidebar buttons named for screen readers when the labels are hidden
- Restore real budgets in the hosted web app
- Clear the cached budget when signing out of the hosted web app
- Add dashboard bill and income countdowns
- Added a desktop-only Starling personal feed that imports settled transactions into the existing review grid. It is not Open Banking, uses a personal access token stored in the Windows encrypted store, and never posts automatically.
- Updated the Import guide for the Starling personal feed.
- Restored sign-in in Windows builds by bundling the public Supabase client configuration.
- Starling feed fetches settled transactions through today, so rows newer than the As-of date are visible in the review grid
- Import hints name the actual As-of date and point to Settings → Budget when rows fall outside it
- Imports now accept rows dated up to today and move the As-of date forward when the added row is newer
- Open Banking through Enable Banking: link any UK bank, fetch booked transactions into the review grid, with the application key kept in the Windows encrypted store
- Move Enable Banking request signing into a tested module so the RS256 JWT path is covered by the suite
- Show the Starling and Enable Banking feeds only in the Windows app; the hosted web build now offers CSV import alone
- Move the hosted build to Cloudflare Pages after InfinityFree suspended the account, with HTTPS live checks and Pages header rules

## [2026.11.16] — 16 November 2026

### Changed
- Hosted web build offers only the synthetic demo and hosted account settings; cloud sync requires a confirmed email

## [2026.11.14] — 14 November 2026

### Changed
- Removed the Water payment panel from Settings and grouped the remaining settings into Account, Budget, Bills, Data and App tabs
- Moved the read-only duplicate review into the Data tab so every Settings group matches its label
- Removed the authenticator-app 2FA setup from Account security; passkeys and cloud account deletion remain
- Added on-launch delta updates: check GitHub, download only changed app blocks, show size/speed/progress and restart to install
- Fixed staging of downloaded updates so Electron can write and install the verified app archive
- Rebuilt the delta update assets after fixing the staging filename
- Bypass GitHub's release-download cache when checking for and fetching update blocks
- Fixed the install preflight so the verified archive can be applied from a per-user install folder
- Made the update installer helper run reliably when the app is installed under a path with spaces
- Start the verified update helper through Windows WMI so it survives the app closing

## [2026.11.13] — 13 November 2026

### Changed
- Dashboard income and expenses breakdown rings with percentage legends
- Add a confirmed Purge conflict history action that removes local and cloud conflict copies without touching budget records.
- Remove the wildcard Supabase CSP fallback so a missing or invalid URL fails closed.
- Create one device-encrypted automatic restore point per day, keeping the newest seven.
- Add Playwright browser coverage for transaction edits, CSV staging, month-end locking, restore points and statement totals.
- Download a redacted support bundle from Data health for troubleshooting without sharing names, amounts or credentials.
- Export transactions and statements to Excel, and print or save them as PDF.
- Add passkey enrolment and sign-in to Account security and the hosted login page

## [2026.11.12] — 12 November 2026

### Changed
- Add a Card payment flow: create the bank expense and card credit together, default the source to the main account and allow a different bank account.
- Remove the All releases link from the application changelog and keep the current installer and checksum links.
- Remove the release count from the application changelog header.

## [2026.11.10] — 10 November 2026

### Changed
- Advance the As-Of cutoff to the latest real transaction so a current Starling transaction updates the balance.
- Only show the Dashboard duplicate warning when the selected month contains duplicate rows.
- Refuse to sync plaintext credential fields; added a nested cloud-payload guard and regression coverage.

## [2026.11.9] — 9 November 2026

### Changed
- Local-only PIN app lock with idle auto-lock
- Application changelog keeps every earlier release as append-only history; budget changelog records budget changes only and ignores interface preferences
- Installers are now published as GitHub Releases; the app links to the latest release and CI builds it on a version tag. Added a public README and removed installer parts from the web host
- Added a GitHub repository link to the login page, app sidebar, About panel and application changelog
- Removed the duplicate stable installer asset; the site now links directly to the dated installer and no longer calls the rate-limited GitHub API
- Year rollover can carry account, card, person, provider and bill balances into the next year
- Rent keeps 2027 entries in a separate year block, so the 2026 ledger contains only 2026 rows
- Edit future-year provider sheets and bills for forward planning, with year-only amount, due-day and removal changes
- Payment edits now carry the updated provider balance into later years
- Add a Recalculate later years action so saved provider blocks can be rebuilt from the live closing balance
- Add a read-only Data Health integrity centre for account names, duplicates, provider year chains, bill links, locked-month drift, dormant accounts and sync conflicts
- Remove the legacy App update / Auto updates entry from the budget changelog
- Add per-record audit history with revert and transaction trash
- Add categories, alert centre, encrypted backups, provider snapshots and account security

## [2026.11.8] — 8 November 2026

### Added

- Application changelog on the login page and in the app, regenerated for every build with the version, a source build id and the build time.
- Windows installer download from the login page and the application changelog, delivered from the site in parts because the host caps files at 10 MB.
- App-wide feedback dialog with an unread notice on the Dashboard.
- Provider ledger row ordering with up/down controls, plus **Sort automatically** to restore date or month order.
- Editable provider **Balance** and **Total paid** cells that anchor later rows; clearing a cell returns it to the calculated figure.
- Versioned SQLite and Postgres schemas under `db/migrations/`, applied by a migration runner that records each version and rolls back a failed file.
- Statement, provider balance and engine-invariant tests covering the ledger rules.

### Changed

- O2 and Virgin **Charge** renamed to **Bill** throughout the ledger, sidebar tips and guide.
- The sidebar version and the legal pages now read the version from `package.json`, matching the Windows app instead of a hardcoded label.
- Provider ledger rules moved into `core/providerLedger.ts` so the app no longer keeps its own copy.
- Workbook adjustments shared through `core/reference.ts`, so the seeder and the parity gate agree.
- Generic onboarding with a guided rent agreement step, editable provider names, plus new Debts and Savings sections
- Provider setup now records the normal bill, normal monthly payment, payment date and contract details, with a recurring option that builds the provider's 12-month plan and keeps a linked bill in sync
- Release version now follows the release date (YYYY.M.D), set automatically by npm run release, with same-day releases sharing one dated section
- Recurring provider setup now writes the remaining months into the provider's own ledger with bill and payment figures, and links the bill to its provider sheet so the provider page shows the plan
- Bills and providers now post to the transaction log on their due date, from the account you choose, without counting twice
- Bank CSV imports ignore generated bill rows when checking duplicates
- The login page shows the running version and build id
- Starling statements now close at the dashboard balance, with scheduled bills and post-anchor cash on the same dates
- The Dashboard review now includes duplicate groups, and builds are scanned for legacy credential values
- Local copies can be removed safely from Settings, backup restores are parity-tested, and the Dashboard flags duplicate groups
- Settings: review sync conflicts with bounded snapshots, use mine/server and export both
- Cloud sync applies realtime settings changes and resyncs after reconnect
- Year rollover workflow and later-year views
- Vault passphrase rotation and forgotten-passphrase recovery

### Fixed

- Reconciliation report failed 6 of 10 checks by comparing raw workbook totals with adjusted live figures; it now passes 10/10 checks and 12/12 months.
- Savings plans that pay off mid-year restart their total for the new plan instead of carrying the old cycle forward.
- The add-entry form's Balance field sat out of line with the fields beside it.
