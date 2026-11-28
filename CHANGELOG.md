# FinanceHub application changelog

Every build regenerates the in-app **Application changelog** from this file, so the
release history ships with the web bundle and the Windows app. Add a section when a
release changes behaviour; the build stamps it with the version, a source build id
and the build time.

## [2026.11.28] — 28 November 2026

### Changed
- Correct the Starling anchor by the missing Pure Cremation payment
- Bills simplified, security alerts cleared
- Bills: a stopped or removed bill stays reachable in future years and can be kept in the year or deleted for a clean slate
- Bills: Paid from is a hidden column behind a header toggle, and a bill with its own provider sheet keeps the plan's amount in future years
- Bills shows a provider's due day read-only; each provider page now has a Due date card that copies the day to its linked bill.
- A plan year can only remove a bill from that year onwards; Pure Cremation is restored to 2026 and 2027 after a plan-year delete took it out of every year.
- Bills: each link sheet can be deleted from the panel once no bill uses it, including a provider's sheet after its bill is removed.
- Bills: a provider left with no bill and no link sheet can be removed from the menu from the link-sheet panel, keeping its ledger.

## [2026.11.27] — 27 November 2026

### Changed
- Count the 26 November £68.02 correction as a transfer so it stops inflating November spending
- Bill changes: Remove now deletes the row it was clicked on
- Stop O2 from November while the account is in credit
- Provider sheets fill the planned payment and tick it off on the bill's due date
- Make the Pure Cremation opening balance stick as the plan's anchor
- Count Pure Cremation's remaining payments from the plan
- Count Park Christmas's remaining payments from its latest plan
- Show one Paid mark on every provider sheet
- Add a yearly water bill card to the payment plan review

## [2026.11.26] — 26 November 2026

### Changed
- Cards blank their zero figures, and the Account, Card and People tables left-align their columns
- Bills, and the bill plan and link sheets tables, left-align their column names over the values
- Overview's bill lists, Forecast, Savings and Debts left-align their column names over the values
- An empty Effective from date shows nothing instead of the dd/mm/yyyy hint
- Bills shows a blank linked sheet instead of None, and inactive bills drop to the bottom of the list
- A bill can be deleted outright from a future year's plan, so the new year's list can start clean
- Follow-system theme, a first-run tour, a translation layer, and accessibility fixes: skip link, scoped table headers, focus rings and a light-theme contrast fix
- The tour traps Tab inside its card, and Settings gains a language selector on top of the translation layer
- Add Loan transaction category
- Categorise the existing loan rows as Loan
- Manual entries take their category from the import rules
- Backfill transaction categories from the rules and run the petrol rule first
- Add Aldi, Morrisons, Sainsbury's, Lidl and Petrol import rules
- Shrink the installer: English-only locale, no npm packages in the asar, maximum compression
- Keep the newest 7 automatic restore points instead of 30

## [2026.11.25] — 25 November 2026

### Changed
- Fix holiday trip totals: a trip whose stored total already covers its cost lines (the December Hesperia trip) is no longer counted twice
- Work out a holiday's days and nights from its dates, fill them into the form automatically and count them in Nights booked
- Count nights from a trip's dates even when its saved night count is blank, so Nights booked includes every trip
- Run the year selector to 2040 so trips and plans can be filed under future years
- Repeat Water, Ovo, Park Xmas, Council Tax and Rent through 2040 from next year's figures, leaving O2, Virgin Media and Pure Cremation on their own contracts
- Updated income section to 2040 with dates and amounts
- Removing a bill in a future year now hides it from that year's plan and keeps it gone for every later year, with the Bill changes row as the way back
- Ovo statement gains a Refund column: balance = previous + payment + credit - bill - refund, September 2026 reads a 52.92 bill with the 629 refund as its own line
- Income schedule drops the 2026/2027/2028 tabs; the year bar already picks the schedule year
- Re-align every later Ovo block to the 2026 month and bill period pattern so future years stop showing the wrong labels
- Pure Cremation ends with the December 2027 payoff: the bill and its plan stop after that year
- Stopping a bill from the live year keeps its history: it now stops from the chosen month instead of deleting the bill, so earlier months and earlier years still count the payments
- Ovo provider page shows the supply contract: plan, term, exit fee, future annual consumption and standing/unit rates for electricity and gas
- Ovo account details shows a card with the year's total bill, updating as each bill is entered
- Add a liquid glass theme: a dark backdrop with frosted, translucent panels and a glass round in the theme switcher
- Ovo shows the year's total bill as an account detail card after the balance
- Ovo repeats the 2026 pattern through 2040: every later year has its month, bill period, payment, bill and chained balance filled in
- Ovo years from 2027 to 2040 are laid out with the payment and balance in place and every bill left at 0 for you to type in
- Ovo leaves every bill from 2027 to 2040 blank to type into, and the supply contract is editable in place with left-aligned columns
- Supply contract drops its summary line, the Fixed to badge and the exit fee note, leaving just the editable table
- Ovo gas gets its own supply contract: plan name, start and end dates and exit fee are per fuel, alongside its own consumption and rates
- Repair a saved budget whose Ovo years stopped at the imported blocks: the missing years to 2040 are generated and laid out with blank bills
- Settings App shows the build number the app is running, not just the version
- Ovo year blocks that were saved without rows are laid out again on every load, so 2027 to 2040 open on their months and blank bills
- Build ids ignore the line endings a checkout uses, so the Windows build and the CI build of the same commit report one id
- Ovo's credit and refund columns are cleared from 2027 onwards, so a future statement shows the payment alone until a real one arrives
- The Ovo Payment column is linked to the Ovo bill: a bill change or override on the Bills tab cascades into the statement for that month onwards, and a payment typed on the statement becomes the same bill change
- Water, Park Xmas and Pure Cremation payments follow their bills: an amount changed on either screen applies from that month onward, with earlier months and the rest of the plan kept
- Ovo follows the same rule as the other plans: an amount changed on the sheet or the Bills tab applies from that month onwards, and the separate bill-owned sync is gone
- Virgin's statement leaves every £0.00 blank from October 2028, where the contract has ended
- Virgin's balance is left blank from October 2028 as well, so the ended contract shows no running figure
- Pure Cremation ends with the 2027 payoff: later year copies are removed and those years open blank instead of repeating the last statement
- Park Xmas is paid off each August: every year from 2027 keeps its own opening balance line after August, the months after it open blank, and typing a new opening balance and payment fills the year in until it is paid off again
- Park Xmas keeps the months after August blank until a payment is entered, so 2027 and later no longer carry the old balance down the page
- A Park Xmas year nobody has paid into reads completely blank, carried balance included, so 2028 no longer repeats the old figure
- Park Xmas marks each month paid once its date arrives, and leaves the Status and Paid columns empty for months that have not been paid yet
- Pure Cremation drops its Paid column and marks each month paid on its date; its early months before the plan starts read blank
- Virgin and O2 drop the Paid column, leaving their ledgers to the bill, payment and balance figures
- A linked bill now fills the provider's payment with the amount actually paid, taken from the payments logged against that bill
- O2 is an active bill again from November 2026, so its payments reach the plan and the O2 sheet
- Virgin and O2 open blank for the months before the contract started, January to September and January to August
- Virgin and O2 keep their full contract: the bill and running balance show every month, while the payment stays blank until the bill is paid on its date
- Water's Bill column reads blank in the months no bill arrives, so only the half-yearly bills show
- Rent, Council Tax, Ovo, Virgin and O2 leave an empty money cell blank instead of printing £0.00
- Rent's Matched column is a tick box, and Virgin's and O2's opening zero balances read blank
- Rent's charge letter link points at the Dropbox copy of the 26-27 letter
- Accounts and People leave a zero balance, owed or opening blank instead of £0.00

## [2026.11.23] — 23 November 2026

### Changed
- Add the Microsoft Store AppX build, a high-contrast theme, bulk notification delete, and year-aware income schedules and rate changes
- Show true Ovo usage on the statement chart
- Add a payment-plan review to provider sheets and keep same-day releases on their date
- Apply the payment-plan recommendation in one click and choose how many months the credit is returned over
- Warn on category targets at 80%, over target and on pace to overspend, and keep the payment plan above a £0 payment
- Average a provider's bill over the months its bill period covers, keep six-monthly Water credit for the next bill, and say the bills are half-yearly
- Send bill reminders through Resend and add opt-in web push alerts
- Record Ovo's new bill with its Warm Home Discount credit
- Email reminders send through Resend, and the Notifications screen names the reminder job instead of saying delivery is off
- Split the tools views into views/tools and type the provider payment-day shapes
- Say what push delivery is doing and name the page's own origin when the browser blocks it
- Hide App update rows from what changed, and drop the reminder-job and push privacy notices
- Hide per-save rows from what changed and name the security contact in the legal pages
- Render the security contact as plain text in the legal pages

## [2026.11.22] — 22 November 2026

### Changed
- Move account, card and people editing onto their own pages, move rent and bill changes to Bills, and drop Monthly's duplicate month strip
- Send duplicate review to Data health and fold the Guides page into one help surface
- Combine the bill definitions and link sheets sections and move the scheduled bill run to Monthly
- Keep the link sheets inside the bills panel
- Trim the Accounts review panels, move People sign-ins to People, and drop revoked devices from the list
- Stop writing a Budget change row for every save and clear the old automatic rows
- Create and rename link sheets inside the bills panel and drop the separate link sheets table
- Remove the price history, expiry list and possible subscriptions panels from Bills
- Remove the payment date card from the provider sheets
- Add cost lines such as hotel, car park and travel insurance to a holiday trip
- File every holiday under the year it starts, moving 2027 trips out of 2026
- Add Settings AI with an OpenRouter key kept in the encrypted vault, plus an AI assistant that proposes bill and transaction changes for approval
- Show the AI key state honestly in Settings
- Explain when the assistant cannot reach OpenRouter
- Allow the assistant to reach OpenRouter through the production CSP
- Re-file holidays under their start year on every build, including the hosted app
- Remove the cost-line explainer from Holidays
- Show only the selected year's trips in the holiday tracker
- Show only the selected year's trips in the holiday tracker
- Show only the selected year's trips in the holiday tracker
- Offer a year that only holds holidays in the year bar
- Open the AI assistant without the vault passphrase
- Seal the hosted AI key with a device-held browser key

## [2026.11.21] — 21 November 2026

### Changed
- Tighten the demo banner spacing
- Drop the O2 account details and access sections
- Match the income and holiday cards to the KPI row
- Match the income and holiday cards to their row
- Keep the income card subtitle on one line
- Clamp the income and holiday card subtitles
- Remove the append-only note from the changelog page
- Remove the append-only wording from the in-app changelog
- Name the payment source and show passed dates on the income card
- Tidy the Virgin page and share the bill due day with providers
- Remove the repeated figures from the dashboard
- Add linked Savings and Debts tiles to the dashboard
- Keep dashboard tiles working for hidden pages
- Name the page in the header when a tile opens a hidden one

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
- Remove the always-shown note from menu layout
- Drop the unused menu layout pill styles
- Drop the three unreferenced style rules
- Security headers, dead code removal and mobile input fix
- Compact phone top bar with month and year pickers
- Fluid phone and tablet layout
- Responsive e2e guard and fluid auth and portal screens
- Let the auth card padding scale on the smallest screens

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
