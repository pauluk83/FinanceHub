/**
 * The complete in-app user guide. One entry per sidebar section, plus the
 * basics that apply everywhere. `tests/guide.test.ts` checks that every
 * sidebar item has an entry here.
 */

export interface GuideEntry {
  id: string;
  group: 'Basics' | 'Overview' | 'Ledger' | 'Providers' | 'Tools';
  title: string;
  summary: string;
  steps: string[];
  notes?: string[];
}

export const GUIDE_BASICS: GuideEntry[] = [
  {
    id: 'workspaces',
    group: 'Basics',
    title: 'Workspaces: account, local and sample',
    summary: 'A workspace is one budget document. It can sync through your account, stay on this device, or be a synthetic demo.',
    steps: [
      'Choose Account · browser sync at onboarding to store the budget in your account and sync it between devices. Sign-in is required, and the browser keeps a cache so a brief disconnect does not stop you working.',
      'Choose Local · this device to keep everything on this computer. Nothing is uploaded; use Exit in the sidebar to leave the local workspace.',
      'Explore a sample budget opens a synthetic demo with invented figures. It lives only in the current tab and never touches an account or sync.',
      'People sign-ins are separate: #people opens a read-only statement for one People account and lives only in this browser.',
    ],
    notes: [
      'The sidebar footer shows the workspace type and whether changes are saved or synced.',
      'Demo figures are not real. Never use the sample budget to plan actual money.',
    ],
  },
  {
    id: 'saving',
    group: 'Basics',
    title: 'How saving, recalculating and month locks work',
    summary: 'Every edit changes one budget document; the engine recalculates open months from it, while locked months stay frozen.',
    steps: [
      'Edits save automatically. The status dot in the sidebar footer shows Saving, Saved, Synced, or a warning when local storage or sync fails.',
      'Open months recalculate from accounts, income, bills, transactions and provider ledgers. The month selector at the top changes the view, not the data.',
      'Provider ledger rows can be moved with the up/down buttons. Balances recalculate from the same carry-forward; typing a balance anchors that row and later entries, while clearing it returns the row to automatic. Total paid works the same way, so a fresh savings plan starts its own total; contract totals stay calculated. Sort automatically restores date or month order.',
      'Locked months are saved close snapshots. They reject new rows and recalculated totals; unlock one from Dashboard → Month end only when the close is genuinely wrong.',
      'The As-of date in Settings decides which payments count as due. The Balance anchor date calibrates cumulative balances and should not be changed casually.',
    ],
    notes: [
      'Account workspaces keep a local outbox and a pull cursor. Sync now forces an immediate pull and push.',
      'Export a JSON backup from Settings → Data & backups before large changes.',
    ],
  },
  {
    id: 'navigation',
    group: 'Basics',
    title: 'Finding your way around',
    summary: 'The sidebar groups the app into Overview, Ledger, Providers and Tools; every entry explains itself on hover.',
    steps: [
      'Hover or focus a sidebar entry to read a one-line description. Hover a group title to see what the group is for.',
      'Open Settings → Menu layout to hide sidebar items or move them between Overview, Ledger and Providers. Tools is fixed and cannot be hidden or moved.',
      'Press Ctrl+K and type to jump to any visible section. Press [ or ] to step through months.',
      'The topbar shows the current section, the selected month, whether it is Locked or Open, the theme and account controls, and a Feedback button available on every screen.',
    ],
    notes: [
      'Hidden sections also leave the Ctrl+K palette, but their data is untouched.',
      'The complete guide (this page) is always available from Tools → Guides.',
    ],
  },
];

export const USER_GUIDE: GuideEntry[] = [
  {
    id: 'dashboard',
    group: 'Overview',
    title: 'Dashboard',
    summary: 'The year-to-date position for the selected month, with balances, month cards and the model checks.',
    steps: [
      'Read income, expenses, net and owed for the target year at the top of the page.',
      'Compare account, card and People balances with their statements, and review any model checks or differences.',
      'Use Year at a glance to pick a month, then open Month end from the same page when you are ready to close it.',
    ],
    notes: [
      'Clicking a month here changes the selected month across the whole app.',
      'Locked months show their saved close rather than a fresh calculation.',
      'Unread feedback appears as a notice at the top of Dashboard. Open it to read and clear the messages from the topbar Feedback inbox.',
    ],
  },
  {
    id: 'monthly',
    group: 'Overview',
    title: 'Monthly',
    summary: 'One month at a time: every income line, bill, provider charge and transfer, with the resulting balance.',
    steps: [
      'Choose the month from the topbar selector. A locked month is read-only and shows its saved close.',
      'Review each bill line, override and one-off change; edit open months in the section that owns the item.',
      'Check the opening and closing balances and confirm internal transfers appear as two linked legs.',
    ],
    notes: [
      'Internal transfers move money between your own accounts and are excluded from income and expenses.',
      'A missing bill usually means it is inactive, has not started yet, or is overridden by a dated change.',
    ],
  },
  {
    id: 'monthEnd',
    group: 'Overview',
    title: 'Month end',
    summary: 'Close a month: confirm the figures, record the balances and lock the snapshot.',
    steps: [
      'Reconcile every account, card and person first — the lock stores exactly what is on screen.',
      'Set the As-of date in Settings to the last day of the month, then open Dashboard → Month end.',
      'Review the close summary, add a note for anything unusual, and lock the month.',
      'Unlock only to correct a confirmed mistake, then reconcile again and relock.',
    ],
    notes: [
      'A lock belongs to a specific month and year, and every lock or unlock is recorded in Changelog.',
      'Locking does not repair an incomplete month; post missing rows before you close.',
    ],
  },
  {
    id: 'transactions',
    group: 'Ledger',
    title: 'Transactions',
    summary: 'Every movement in the budget, including transfer legs, refunds, categories, free-form tags and linked people or provider rows.',
    steps: [
      'Filter by account, month, type, category, tag or free text to find a row, then open it to edit.',
      'Add, edit or delete rows in open months; choose one category and up to eight comma-separated tags when useful.',
      'Record a transfer between your own accounts as one transfer — both legs and the balance effect are created together.',
      'Use History on a row to inspect the recorded before/after values and revert an edit or addition.',
      'Deleted rows stay in Trash until restored; restoring a deleted row creates a new audit entry.',
    ],
    notes: [
      'Refund treatment follows the original row type so totals are not inflated.',
      'A transfer never counts as income or expense; it only moves the balance. Its category and tags are applied to both legs.',
      'Categories and tags are optional labels: they are included in CSV exports and filters, but never change a total, balance or locked month.',
      'Reverting a locked-month row is refused until that month is unlocked.',
    ],
  },
  {
    id: 'income',
    group: 'Ledger',
    title: 'Income',
    summary: 'PIP and Universal Credit payment dates, amounts and target-year totals.',
    steps: [
      'Review the schedule for each income source; these dates and amounts feed Monthly and Dashboard.',
      'Add or adjust an expected payment in an open period.',
      'Check that past locked months keep their saved values while future months pick up the change.',
    ],
    notes: [
      'Change income here rather than inventing a transaction, so the schedule stays consistent.',
      'Totals shown are for the budget target year in Settings.',
    ],
  },
  {
    id: 'accounts',
    group: 'Ledger',
    title: 'Accounts',
    summary: 'Bank accounts, opening balances, targets and running ledger balances.',
    steps: [
      'Add an account with its opening balance and the balance anchor date it belongs to.',
      'Set an optional target balance; progress is calculated from the engine’s running balance.',
      'Reconcile the ledger balance against the bank statement and correct any missing rows in Transactions.',
    ],
    notes: [
      'Opening balances belong on the account record, never in a transaction.',
      'Changing the anchor date shifts cumulative balances, so keep it fixed once real data exists.',
    ],
  },
  {
    id: 'cards',
    group: 'Ledger',
    title: 'Cards',
    summary: 'Credit limits, current balances and utilisation for each card.',
    steps: [
      'Add a card with its limit, opening balance and any promotional rate.',
      'Record spending and card payments through Transactions. Choose Card payment to move money from the main account, or pick another bank account in Pay from account.',
      'Watch utilisation and the minimum-payment hints when planning the month.',
    ],
    notes: [
      'Card spending counts as an expense when it happens; paying the card creates two linked transfer legs, so the card and the chosen bank account both update without counting the payment as spending again.',
      'A balance over the limit is flagged in the card summary.',
    ],
  },
  {
    id: 'people',
    group: 'Ledger',
    title: 'People',
    summary: 'Money you lent, repayments received and what is still owed to you.',
    steps: [
      'Add a person with their opening balance, then record money lent and repayments against them.',
      'Read the running balance to see what is still owed.',
      'Use Settings → People sign-ins to give somebody a read-only statement at #people. Their page shows the budget owner, links to the main FinanceHub website, and includes a feedback box for corrections or suggestions.',
    ],
    notes: [
      'People balances are included in Dashboard totals and month-end snapshots.',
      'Renaming a person also updates their People sign-in record on this device.',
      'Feedback left on a statement is stored only on this device. It appears in the topbar Feedback inbox, as a Dashboard notice until read, and in Settings → People sign-ins.',
    ],
  },
  {
    id: 'bills',
    group: 'Ledger',
    title: 'Bills',
    summary: 'Scheduled bills, base amounts, standing overrides and one-off changes.',
    steps: [
      'Add a bill with its amount, due day, method, category and an optional provider link.',
      'Edit the base amount for the current year; use Settings → Bill changes for a dated change instead of rewriting history.',
      'Mark a bill inactive to stop it appearing in future months while keeping its past rows.',
    ],
    notes: [
      'A dated change wins over the base amount from its effective date onward.',
      'A provider-linked bill follows the provider ledger unless an override applies.',
    ],
  },
  {
    id: 'holidays',
    group: 'Ledger',
    title: 'Holidays',
    summary: 'Trips, dates, payments and booking details.',
    steps: [
      'Add a trip with its destination, dates and expected total.',
      'Record deposits and payments, and link them to transactions where useful.',
      'Compare planned against actual spend as the trip approaches.',
    ],
    notes: [
      'Holiday spend still belongs in Transactions for the budget totals.',
      'Holiday totals from the original workbook are kept as reference text.',
    ],
  },
  {
    id: 'rent',
    group: 'Providers',
    title: 'Rent',
    summary: 'The rent agreement and ledger: liability, payment date, weekly charge and running balance.',
    steps: [
      'Use Guided setup → Rent agreement to record the landlord, rent you are liable for, agreement type and payment day.',
      'Use Settings → Rent payment change for a dated change that keeps earlier months intact.',
      'Add ledger entries for charges and payments; the balance rolls forward month by month.',
    ],
    notes: [
      'The provider card in Guided setup edits the address, tenancy dates, reference, logo and links.',
      'Custom provider names and logos appear in the sidebar, the topbar and the provider page banner.',
      'Later rent years are kept in their own year block, so the 2026 view contains only 2026 entries; use the year selector to read 2027 and roll the target year to edit it. A rent change updates the balance chain, so the next year starts from the edited close. Recalculate later years rebuilds every saved block from the live close on demand.',
    ],
  },
  {
    id: 'water',
    group: 'Providers',
    title: 'Water',
    summary: 'Water statements: bills, payments, the monthly plan and the running balance.',
    steps: [
      'Record each bill period with its bill and payment amounts.',
      'Use Settings → Water payment change when the monthly plan changes; future months follow the new plan.',
      'Check the balance at the As-of date against the latest statement.',
    ],
    notes: [
      'Balance = previous balance + payment − bill for each period.',
      'Bill periods arrive quarterly, so several rows share a payment month.',
    ],
  },
  {
    id: 'councilTax',
    group: 'Providers',
    title: 'Council Tax',
    summary: 'Council Tax charges, instalments and direct debit payments.',
    steps: [
      'Review the dated entries for the year; each row holds a charge or a payment.',
      'Add or adjust an entry in an open period.',
      'Keep the account reference and portal link current in the provider card.',
    ],
    notes: [
      'Do not overwrite a finished year to make a new year fit; start a new ledger or adjust future rows.',
      'The monthly payment and balance at the As-of date are shown above the ledger.',
    ],
  },
  {
    id: 'parkXmas',
    group: 'Providers',
    title: 'Park Xmas',
    summary: 'Park Christmas Savings: plan payments in and withdrawals out.',
    steps: [
      'Record each monthly payment into the plan.',
      'Add the withdrawal when the balance is spent, so the ledger closes at zero.',
      'Keep the account name and number in the provider card.',
    ],
    notes: [
      'This is a savings plan rather than a bill: payments set money aside instead of paying a charge.',
      'The statement field holds the plan’s own reference text.',
    ],
  },
  {
    id: 'pureCremation',
    group: 'Providers',
    title: 'Pure Cremation',
    summary: 'The Pure Cremation monthly plan and payment history.',
    steps: [
      'Record each monthly plan payment.',
      'Keep the payment account and payment day up to date in the provider card.',
      'Check the running balance against the plan statement.',
    ],
    notes: [
      'The latest balance at the As-of date is shown with the account details.',
      'Provider logins live in the encrypted credential vault, never in the ledger.',
    ],
  },
  {
    id: 'ovo',
    group: 'Providers',
    title: 'Ovo',
    summary: 'Ovo Energy statements, payments and running balance.',
    steps: [
      'Add each statement period with its bill and payment.',
      'Use the plan field for the tariff name.',
      'Reconcile the balance with the latest statement.',
    ],
    notes: [
      'Monthly and quarterly billing are both supported by adding the relevant periods.',
      'A payment can be recorded before its bill without breaking the running balance.',
    ],
  },
  {
    id: 'o2',
    group: 'Providers',
    title: 'O2',
    summary: 'O2 contract bills, price tiers and the remaining contract months.',
    steps: [
      'Record the contract details and each price tier with its start date.',
      'Add monthly charges and payments as ledger rows.',
      'Read the remaining months — they are derived from the contract end date, never stored.',
    ],
    notes: [
      'Account and mobile numbers are edited in the provider card during onboarding.',
      'A new tier starts a new price period; earlier months keep the old tier.',
    ],
  },
  {
    id: 'virgin',
    group: 'Providers',
    title: 'Virgin Media',
    summary: 'Virgin Media contract bills and price tiers.',
    steps: [
      'Keep the contract length, end date and tiers current.',
      'Record each monthly charge and payment.',
      'Check the derived remaining months against the contract.',
    ],
    notes: [
      'The contract summary appears above the ledger, with the account number when shown.',
      'Custom logos and names from Guided setup apply here too.',
    ],
  },
  {
    id: 'setup',
    group: 'Tools',
    title: 'Guided setup',
    summary: 'Onboarding: budget location, accounts, people, bills, the providers you track, and your first transactions.',
    steps: [
      'Choose where the budget lives, then set the budget year, As-of date and balance anchor date.',
      'Add accounts, people and recurring bills. Start from a clean slate if you want a fresh budget with new opening balances.',
      'In Providers you track, add or hide providers, rename them, upload a logo, and edit their account and detail fields.',
      'Finish with your first transactions, or import a bank CSV.',
    ],
    notes: [
      'Removing a provider only hides it and its sidebar entry; the ledger, payments and bills are kept and can be added back at any time.',
      'Once the budget has accounts or transactions, Guided setup leaves the sidebar; ongoing changes live in Settings.',
    ],
  },
  {
    id: 'statements',
    group: 'Tools',
    title: 'Statements',
    summary: 'A filtered statement for one account with opening balance, movements and a running balance.',
    steps: [
      'Pick an account, person or card, a year (or All years) and a month, or choose All months.',
      'Review the opening, repaid/lent and closing balances with every movement in between.',
      'Export the filtered statement as a CSV.',
    ],
    notes: [
      'Statements are a report — edit the underlying rows in Transactions.',
      'Locked months are included exactly as they were closed. All years puts every matching movement in date order.',
    ],
  },
  {
    id: 'import',
    group: 'Tools',
    title: 'Import',
    summary: 'Import a bank CSV: review every row, then append — nothing posts until you confirm.',
    steps: [
      'Choose a CSV and confirm the columns and account.',
      'Review duplicate warnings and rejected rows, and fix the file before continuing.',
      'Confirm to append the rows, then reconcile the account against its statement.',
    ],
    notes: [
      'Imports never post into locked months and never silently overwrite existing rows.',
      'File size and row limits are shown before an import starts.',
    ],
  },
  {
    id: 'alerts',
    group: 'Tools',
    title: 'Notifications',
    summary: 'In-app alerts for bills due soon, low account balances and high card use.',
    steps: [
      'Open the bell in the top bar or Tools → Notifications to see current alerts.',
      'Mark an alert read after dealing with it; the alert remains visible until the underlying bill or balance changes.',
      'Use Open to jump to the bill, account or card that caused the alert.',
    ],
    notes: [
      'Alerts are derived from the loaded budget. Marking one read never changes a balance, bill or locked month.',
      'The read state travels with the budget document, but the reminder itself is in-app only — no email or push notification is sent.',
    ],
  },
  {
    id: 'health',
    group: 'Tools',
    title: 'Data health',
    summary: 'A read-only integrity centre that flags account names, duplicates, provider year-chain breaks, linked bills, locked-month drift, dormant accounts and sync conflicts.',
    steps: [
      'Open Tools → Data health after an import, a restore, a year rollover or a month close.',
      'Read critical and warning findings first, then open the screen named by the finding to review the underlying rows.',
      'Use the Checks run table to confirm which rules passed. Reopen the page after an edit to recalculate every finding.',
    ],
    notes: [
      'Data health never deletes, merges or rewrites anything. It only reads the loaded budget and points you to the review screen.',
      'A lock that no longer matches live balances means history changed after the month was closed. Unlock it only when the close itself is wrong.',
    ],
  },
  {
    id: 'settings',
    group: 'Tools',
    title: 'Settings',
    summary: 'The single source of truth: accounts, people, cards, bills, provider logins, sync, backups and the sidebar layout.',
    steps: [
      'Use the sections to add or edit accounts, people, cards, bills, bill changes, rent and water changes.',
      'Open the credential vault to store provider logins, and People sign-ins to create read-only #people access.',
      'In a local-only workspace, App lock sets a 4–8 digit PIN, a 1–30 minute idle window and a Lock button in the top bar. It applies to this device only and starts locked the next time the workspace opens.',
      'Set the budget year, As-of date, anchor date, theme and Menu layout.',
      'Export a JSON backup, restore the imported workbook, or manage sync and local data in Data & backups.',
      'For a protected copy, enter a backup passphrase and export an encrypted backup. The seven newest restore points stay on this device.',
      'In Settings → Sync conflicts, review both versions, export a copy, or purge the retained conflict history once nothing needs reviewing. The purge removes local and cloud conflict copies only; every budget record stays intact.',
      'Add an authenticator app under Account security, or delete the cloud account and its records permanently.',
    ],
    notes: [
      'Menu layout hides items and moves them between sections; Tools is fixed and can never be hidden or moved.',
      'Provider credentials are encrypted with your vault passphrase; the app never stores them as plaintext. You can change the passphrase from the unlocked vault, and an optional hint is stored unencrypted so the locked screen can show it.',
      'The app lock is a screen barrier, not encryption. Its PIN is stored as a slow hash, cannot be recovered, and removing the lock does not delete anything; the budget data itself stays as protected as the device store.',
    ],
  },
  {
    id: 'changelog',
    group: 'Tools',
    title: 'Budget changelog',
    summary: 'Your budget history: bills, balances, people and month-end figures. Only budget changes are recorded, never app release notes.',
    steps: [
      'Search by month, account, bill or wording to find an earlier change.',
      'Review the automatic entries created whenever balances change.',
      'Add a custom change to record a decision the app cannot infer.',
    ],
    notes: [
      'The changelog is part of the budget document and is included in backups and sync.',
      'Month-end locks and unlocks are recorded with their close summary.',
      'Editing a preference such as the menu layout creates no entry. If nothing in the budget changed, nothing is logged.',
      'App release notes are not part of the budget. They live in the separate Application changelog, which keeps every release.',
    ],
  },
  {
    id: 'debts',
    group: 'Ledger',
    title: 'Debts',
    summary: 'Every loan, credit agreement and amount owed, with the monthly payment and due date.',
    steps: [
      'Add each debt with the amount still owed, the agreement type and the monthly payment.',
      'Set the due day so it matches the agreement or the statement.',
      'Update the balance after a payment; the total owed and monthly commitments follow.',
    ],
    notes: [
      'Debts are part of the budget document, so they sync and are included in JSON backups.',
      'This section tracks agreements and balances; it does not move money or post transactions.',
    ],
  },
  {
    id: 'savings',
    group: 'Ledger',
    title: 'Savings',
    summary: 'Savings and ISA accounts with balances, account details, targets and regular contributions.',
    steps: [
      'Add each account with its provider, type (ISA, easy access, fixed rate), sort code and account number.',
      'Record the current balance and an optional target to see progress.',
      'Set a monthly contribution and day to track regular saving.',
    ],
    notes: [
      'Account details are stored in the budget document; keep backups somewhere protected.',
      'Savings balances are recorded here and are separate from the balances on Accounts.',
    ],
  },
  {
    id: 'appChangelog',
    group: 'Tools',
    title: 'Application changelog',
    summary: 'Release history for each build, with the build id, dates and the Windows installer download.',
    steps: [
      'Open it from Tools, or from the link on the login page before you sign in.',
      'Check the build id and date to confirm which version is running on this device.',
      'Use Download for Windows to rebuild and save the installer for this exact build.',
    ],
    notes: [
      'The application changelog is regenerated from CHANGELOG.md on every build, so it always matches the running code.',
      'Budget history stays in the separate Budget changelog, which is part of the budget and included in backups.',
    ],
  },
  {
    id: 'guides',
    group: 'Tools',
    title: 'Guides',
    summary: 'This page: the complete section-by-section guide, plus the month-end and new-year workflows.',
    steps: [
      'Read the Basics first: workspaces, saving and navigation.',
      'Jump to any section from the contents list.',
      'Use the Month-End Guide and New-Year Setup tabs for step-by-step workflows.',
    ],
    notes: [
      'Sidebar tooltips repeat the one-line purpose of each section without leaving the current screen.',
      'The guide describes the app as shipped; your workspace data stays exactly as you left it.',
    ],
  },
];
