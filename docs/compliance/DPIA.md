# Data Protection Impact Assessment — DRAFT

**Status:** Draft for professional review. Not legal advice.

**Controller:** Zane Stanton, individual, England.

**Product:** FinanceHub personal budgeting app (web and Windows desktop).

**Date:** 13 November 2026.

**Review trigger:** any bank-linking, payments, analytics, new processor or material
change to cloud storage.

## 1. Processing description

FinanceHub lets one person record accounts, balances, bills, income, cards, debts,
savings, holidays, transactions, provider details and optional encrypted provider
logins. A user can keep a workspace only on the device or sign in with Supabase Auth
(email/password, Google OAuth or a passkey) to sync a cloud copy.

Data flows:

1. The browser or Electron renderer holds the budget and writes a local copy.
2. A signed-in cloud workspace writes the complete budget document to Supabase
   (`settings.state_json`) and reads it back on the same or another device.
3. Provider logins, when saved, are encrypted in the browser with a user passphrase
   (PBKDF2-SHA-256 + AES-256-GCM) before being placed in the synced document. The
   passphrase is never stored.
4. Encrypted backups and restore points are created locally. Automatic daily restore
   points use a random key held in the device secure store; manual exports use the
   user's passphrase.
5. Google OAuth and Supabase process authentication data. InfinityFree serves the static
   web assets. There is no analytics, advertising or third-party crash reporter.

## 2. Necessity and proportionality

The processing is necessary to provide the budgeting service the user requests. The
data is limited to what the user enters, plus authentication identifiers. Provider
credentials are optional and are encrypted client-side. The app does not connect to
banks, initiate payments, store card numbers or provide financial advice.

The main proportionality concern is that the cloud budget document is not end-to-end
encrypted: it is protected by Supabase access controls and transport encryption, but a
party with database access could read the financial record. The credential vault is
separate and encrypted. The product is currently a private/owner deployment, not a
mass-market service.

## 3. Risks and mitigations

| Risk | Likelihood / impact | Mitigation | Residual |
| --- | --- | --- | --- |
| Account takeover exposes the cloud budget | Medium / High | Supabase Auth, PKCE, passkeys available, session revocation, RLS, private deployment | Medium until passkey enrolment and enforcement are tested |
| Cloud database or backup access exposes financial data | Low–Medium / High | RLS, anon key only in client, service-role key server-side, processor controls, encrypted vault | Medium; cloud document is plaintext at rest |
| Stolen device exposes local budget | Medium / High | OS account, DPAPI/Keychain value store, optional PIN app lock, no plaintext provider secrets | Medium; local budget is readable by the OS user |
| Provider credentials leak | Low / High | Client-side E2EE vault, legacy fields stripped, passphrase never stored | Low–Medium; forgotten passphrase means no recovery |
| Backup is lost or unreadable | Medium / Medium | Seven restore points, automatic daily point, encrypted export, safety copy before restore | Low |
| Deletion is incomplete | Medium / High | `delete_my_account` cascades from `auth.users`; local copies and exports are separate | Medium until the SQL is applied and tested |
| Sync conflict snapshots retain old data | Low / Medium | 25-conflict cap, only two full snapshots, purge action | Low after owner purges pre-rotation history |
| Processor or international transfer | Medium / Medium | DPAs, transfer mechanism, data minimisation | Medium until contracts are recorded |
| Support bundle leaks personal data | Low / Medium | Counts and check identifiers only; no names, comments, amounts, credentials or raw messages | Low |

## 4. Consultation and decision

No data subjects other than the owner are currently users of the live deployment. Before
opening the service to other people, the controller should review this DPIA with a UK
solicitor or DPIA adviser, confirm the lawful basis and retention schedule, add a
privacy contact and test the DSAR and breach procedures.

**Decision:** Continue the current private deployment with the mitigations above. Do not
add bank linking, payments, analytics or a public sign-up until the residual risks and
processor arrangements are reviewed.
