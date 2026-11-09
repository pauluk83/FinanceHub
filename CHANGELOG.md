# FinanceHub application changelog

Every build regenerates the in-app **Application changelog** from this file, so the
release history ships with the web bundle and the Windows app. Add a section when a
release changes behaviour; the build stamps it with the version, a source build id
and the build time.

## [2026.11.9] — 9 November 2026

### Changed
- Local-only PIN app lock with idle auto-lock
- Application changelog keeps every earlier release as append-only history; budget changelog records budget changes only and ignores interface preferences
- Installers are now published as GitHub Releases; the app links to the latest release and CI builds it on a version tag. Added a public README and removed installer parts from the web host
- Added a GitHub repository link to the login page, app sidebar, About panel and application changelog

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
