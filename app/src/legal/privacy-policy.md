# Privacy Policy

FinanceHub is a personal budgeting application. This policy explains what personal data it handles, why, where it is stored and how you can access or erase it.

Last updated: 7 November 2026 · Version 1.0

## 1. Who is responsible

FinanceHub is designed, built and operated by Zane Stanton, an individual based in England, United Kingdom, who is the data controller for the app. Contact for privacy requests: email the address registered to your FinanceHub account with the subject "Privacy request". This policy covers the hosted web app, the Windows desktop app and any iOS build distributed by the owner.

## 2. What data is processed

- Account data: email address, display name if provided by Google, user ID, sign-in timestamps and session tokens handled by Supabase Auth. Passwords are hashed by Supabase and are never seen by FinanceHub.
- Budget data you enter: transactions, account and card details, balances, bills, income schedules, people and amounts owed, holiday notes, provider account names and numbers, changelog entries and month-end snapshots.
- Provider credentials: usernames and passwords you choose to save in the credential vault. They are encrypted in your browser with AES-256-GCM using a key derived from your passphrase (PBKDF2-SHA-256). The passphrase is not stored or transmitted.
- People sign-ins: a username, a PBKDF2-SHA-256 password hash and a statement snapshot, stored only in the browser or device where you create them.
- Local workspace data: stored in this browser's local storage and never uploaded unless you choose account sync.
- Technical data: standard server logs from Supabase and the static hosting provider (IP address, user agent, request time) used for security and availability.

FinanceHub does not connect to banks, does not process card numbers and does not receive payment card data.

## 3. Why it is processed (lawful bases)

- To provide the app and sync your budget: performance of a contract (UK GDPR Article 6(1)(b)).
- To secure the service, prevent abuse and fix faults: legitimate interests (Article 6(1)(f)).
- To send sign-in, confirmation and password-reset emails: contract and, where required, consent.
- Optional provider credentials and People sign-ins: consent, given by choosing to create them.

FinanceHub does not sell personal data, does not use it for advertising and does not build profiles for marketing.

## 4. Financial data

Budget data is sensitive in practice even where it is not a special category. It is used only to calculate and display your budget, produce statements and backups, and sync between your devices. It is not shared with lenders, advertisers or credit reference agencies. Demo mode uses synthetic data and is never uploaded.

## 5. Storage, processors and transfers

- Supabase hosts authentication and the cloud database. Budget documents are stored per user and protected by row-level security.
- A static hosting provider serves the web build.
- Google may process sign-in if you choose "Continue with Google".
- Desktop data is stored in the app's local storage on your computer; local mode never leaves the device.

These providers may process data outside the UK or EEA under their standard contractual clauses. The owner chooses providers with appropriate safeguards but cannot control their internal operations.

## 6. Security

- All network traffic uses HTTPS.
- Cloud rows are protected by row-level security and per-user policies.
- Provider credentials are encrypted client-side; the vault ciphertext is useless without your passphrase.
- People sign-ins store only a password hash and a statement snapshot.
- Backups you export are plain JSON and are your responsibility.

No system is completely secure. Report a suspected compromise immediately.

## 7. Retention

Budget data is kept until you delete the workspace or ask for erasure. Month-end snapshots and changelog history are part of the budget. Sign-in sessions expire under Supabase policy. Provider vault data remains until you delete the vault or the workspace. Local-only data remains until you clear it or your browser storage is removed. Server logs are retained by the providers under their own policies.

## 8. Your rights and how to use them

You have the right to access, correct, erase, restrict or object to processing, and to data portability.

- Access and portability: Settings → Data & backups → Export full backup (JSON) and Export transactions (CSV).
- Correction: edit any record in the app; the changelog records the change.
- Erasure: Settings → Data & backups → Reset to imported workbook removes the current budget; use "Delete vault" to remove stored provider logins; clear this site's data in your browser to remove local-only data. For account data and cloud backups, send an erasure request from the account email and the owner will delete the cloud document and auth record within 30 days, except records required by law.
- Consent withdrawal: delete the vault or People sign-ins, or stop using the optional feature.
- Complaints: you may complain to the UK Information Commissioner's Office (ico.org.uk). Please contact the owner first so the issue can be fixed.

Requests are answered within one month. Identity may need to be verified from the account email.

## 9. Children

FinanceHub is not intended for anyone under 18. Do not create an account for a child.

## 10. Cookies and local storage

FinanceHub uses local storage for the session, workspace choice and budget cache. It does not use advertising cookies or third-party trackers. Clearing site data removes local workspace data.

## 11. Changes

This policy may be updated when the app changes. The version and date at the top will change, and material changes will be announced in the app or by email where appropriate.

## 12. Contact

Zane Stanton, owner and data controller. Email the address registered to your FinanceHub account with the subject "Privacy request".
