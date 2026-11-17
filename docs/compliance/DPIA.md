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
| Deletion is incomplete | Medium / High | `delete_my_account` cascades from `auth.users`; local copies and exports are separate | Medium until the throwaway-account test passes |
| Sync conflict snapshots retain old data | Low / Medium | Local 25-conflict cap and two bounded snapshot pairs; cloud metadata, with historical rows to verify; purge action | Low after purge is verified |
| Processor or international transfer | Medium / Medium | DPAs, transfer mechanism, data minimisation | Medium until contracts are recorded |
| Support bundle leaks personal data | Low / Medium | Counts and check identifiers only; no names, comments, amounts, credentials or raw messages | Low |

## 4. Consultation and decision

The live deployment is owner-led, but named people in the budget, people-portal users
and feedback authors remain data subjects even if they never create an account. Before
opening the service to other people, the controller should review this DPIA with a UK
solicitor or DPIA adviser, confirm the lawful basis and retention schedule, add a
privacy contact and test the DSAR and breach procedures.

**Decision:** Continue the current private deployment with the mitigations above. Do not
add bank linking, payments, analytics or a public sign-up until the residual risks and
processor arrangements are reviewed.

---

# Addendum A — Production-readiness review

**Status:** DRAFT — not approved. For review by the owner, a UK privacy adviser and UK
counsel before public production.

**Date:** 14 November 2026.

**Build reviewed:** `2026.11.14`, build `9b9b459de201` (Windows Electron and hosted web).

**Relationship to the main DPIA:** this addendum does not replace sections 1–4 above. It
records the production-readiness assessment required by `PLAN.md` §23 PR-1 and the data
map in `docs/compliance/DATA_MAP.md`. Where the two conflict, the more protective
interpretation applies until the documents are reconciled.

## A.1 Scope of this addendum

The production scope is the Windows x64 app for UK personal and household budgeting,
plus a hosted web app limited to a synthetic demo and hosted account settings (passkeys
and deletion). The hosted site will not load, view or sync a real budget. Open Banking,
payment initiation, card acquiring, money transmission, card data, advertising, third-party
analytics, public user-generated content and use by under-18s are excluded. Bank linking remains behind the separate G1–G5 gate in `PLAN.md`
§10 and must not start from this DPIA.

The assessment covers the data flows in `DATA_MAP.md`: local Windows storage, the current
hosted-web `localStorage` flow (to be removed for real budgets at launch), Supabase
Auth/Postgres/Realtime, Google OAuth, InfinityFree hosting, GitHub Releases, backups,
restore points, the people portal, feedback and support bundles.

## A.2 Screening and conclusion

The processing involves a complete financial record, optional provider credentials, cloud
sync, a second-person portal and device-local feedback. It is not large-scale systematic
monitoring, not profiling and not a special-category dataset by design, but the
combination of financial data, credential material, cloud storage and third-party data
creates a risk that warrants a DPIA. The controller should not rely on the absence of a
single Article 35(3) trigger to skip this assessment.

**Screening outcome:** DPIA required and not yet approved. The current private/owner
deployment may continue with the existing mitigations. Public production, public sign-up
and any claim of legal compliance are not approved by this draft.

## A.3 Purposes and lawful bases

| Purpose | Data | Lawful basis to confirm | Notes |
| --- | --- | --- | --- |
| Create and operate the budget | Account, budget, transactions, people, providers, backups | Contract (Article 6(1)(b)) | Core service the user requests. |
| Sync a workspace across devices | Full budget document, sync metadata, session | Contract | Optional but integral once cloud sync is chosen. |
| Authenticate and secure the account | Email, auth identifiers, passkeys, sessions, logs | Contract; legitimate interests for security | Complete a balancing test and record it. |
| Store optional provider credentials | Encrypted vault ciphertext, hint | Consent (currently drafted); counsel to confirm | If the vault is integral to a paid service, contract may be more appropriate. Consent must be withdrawable by deleting the vault. |
| Provide a read-only people statement | Person name, statement lines, portal password hash | Contract with the owner; legitimate interests or contract for the named person — counsel to confirm | The named person may not be the person who created the record. |
| Receive feedback | Author, message, timestamps | Legitimate interests / consent — counsel to confirm | Free text may contain sensitive data; do not repurpose it. |
| Diagnose faults and prevent abuse | Counts, check IDs, platform, user agent, logs | Legitimate interests; legal obligation where applicable | No analytics or crash reporter. |
| Meet legal and rights obligations | Account and processing records | Legal obligation (Article 6(1)(c)) | Retention only as required. |

**Special category data:** the app does not request it. Free-text comments, merchant names,
provider references and feedback can contain it. Do not use those fields for profiling,
scoring or automated decisions, and train support to avoid copying them unnecessarily.

**Children:** the Terms state 18+. There is no age-verification control. The hosted site
must not be marketed to children, and the privacy notice must say the service is not
intended for under-18s.

## A.4 Necessity and proportionality

- **Minimisation:** the service needs the budget record, but the full document is synced
  as one unit. There is no field-level sync yet. Provider credentials are optional and
  encrypted. There is no analytics, advertising or crash reporting.
- **Storage limitation:** cloud and local data remain until the user deletes them; restore
  points are capped at seven; conflicts are capped locally at 25 metadata records and two
  full snapshot pairs; feedback is capped at 100 messages. Processor backup windows and
  server-side conflict/log retention are not yet defined.
- **Accuracy:** the user controls the data; locked months are immutable by design and may
  preserve historical errors. The UI and terms should explain that.
- **Security:** the vault is end-to-end encrypted and the Windows store uses DPAPI, but
  the wider cloud document is plaintext at rest and the hosted web build stores the budget,
  session and automatic-backup key in `localStorage`. These are the main proportionality
  gaps.
- **Transparency:** the in-app Privacy Policy and the draft notice must be reconciled with
  the data map, especially the people portal, feedback, support bundles and processor
  transfers.
- **Third-party data:** the owner may enter information about people who never use the
  app. The notice should explain how to handle their rights and how to remove their data.

## A.5 Risks and mitigations

Ratings are initial judgments for review, not measured results. “Residual” is the position
before the production conditions in A.7 are closed.

| ID | Risk | Likelihood / impact | Controls | Residual | Owner / evidence |
| --- | --- | --- | --- | --- | --- |
| R1 | Account takeover exposes the cloud budget | Medium / High | Supabase Auth, PKCE, passkeys on hosted origin, RLS, session revocation; no live passkey test yet | High until passkey and two-account tests pass | Engineering |
| R2 | Cloud database or backup access exposes the full financial record | Low–Medium / High | RLS, anon key only in client, service-role key server-side, provider controls; document is not E2EE | Medium–High; unsigned proposal to accept the risk instead of wider encryption | Owner + engineering |
| R3 | Hosted-web XSS or shared-device access steals the hosted session or account settings | Medium / High | CSP, React escaping, no third-party scripts; no secure browser storage | High until the public web is demo/account-settings-only, no real budget is loaded, and the live build is checked | Engineering |
| R4 | Stolen Windows device exposes the local budget | Medium / High | Windows account, DPAPI per-value encryption, optional PIN lock; SQLite not SQLCipher | Medium; owner position is to keep DPAPI and narrow the at-rest claim, implementation pending | Engineering |
| R5 | Provider credentials leak from the vault or an old revision | Low / High | AES-256-GCM, PBKDF2 600k, passphrase never stored, legacy fields stripped; old ciphertext can remain | Low–Medium; rotate provider passwords after suspected exposure | Owner + engineering |
| R6 | Named person’s portal data is read on a shared device | Medium / Medium | Portal is device-local, password-hashed and read-only; no server access control | Medium; disclose device-local nature and offer deletion | Product |
| R7 | Feedback contains sensitive free text and is stored unencrypted | Low–Medium / Medium | Local only, 2,000-character cap, 100-item cap, user deletion | Low–Medium | Product |
| R8 | Exported plain JSON backup is lost or shared | Medium / High | User-initiated export, warning, encrypted backup option; credentials stripped | Medium; user-controlled residual risk | Owner |
| R9 | Sync conflicts or old revisions retain data after apparent deletion | Medium / Medium | Local cap, cloud metadata, purge action, account cascade | Medium; document retention and purge evidence | Engineering |
| R10 | Deletion is incomplete across local copies, exports and processor backups | Medium / High | Self-serve cloud deletion, local reset/remove, notice wording; throwaway test pending | Medium until tested and processor windows recorded | Owner + engineering |
| R11 | Processor or international transfer without agreed terms | Medium / Medium | DPA/transfer review planned; none recorded yet | Medium–High until evidence is filed | Owner |
| R12 | Service-role or operator access is misused | Low / High | Key not in client; RLS; provider access controls; no independent review yet | Medium until access review and pen test | Owner + security reviewer |
| R13 | Named people are not told their data is in the budget | Medium / Medium | Owner-facing notice and rights procedure to draft | Medium | Owner + privacy adviser |
| R14 | Children use the service despite the 18+ term | Low / Medium | Terms and notice; no age verification | Low | Owner |
| R15 | Update check or hosting logs reveal usage metadata | Low / Low | HTTPS; no budget data sent; processor terms | Low | Owner |

## A.6 Data-subject rights and third-party data

The product supports access/portability through JSON and CSV export, rectification through
editing, erasure through workspace reset/remove-local-copy/delete-vault/delete-cloud-account,
and withdrawal of optional features by deleting the vault, portal or feedback. Gaps:

- A named person cannot self-serve a statement extract or erasure request; the owner must
  handle it. Define a proportionate process that does not expose other people’s data.
- There is no server-side “restrict processing” flag; restriction is a manual procedure.
- Cloud deletion does not remove local copies, exported files, screenshots or support
  emails. The UI and notice must say so before confirmation.
- The privacy mailbox address exists; the DSAR register and rights test do not.

## A.7 Production conditions

Public production is conditional on all of the following evidence:

1. **C1 — Data map validated:** Supabase region, sub-processors, email provider, hosting
   logs and processor backup windows are recorded in `PROCESSOR_REGISTER.md`; every “to
   confirm” item is closed and the register is signed.
2. **C2 — Hosted-web storage (superseded 2026-11-17):** the demo-only restriction was
   withdrawn by the owner, so the hosted build now loads and syncs a real budget for a
   signed-in, confirmed account. Browser storage is plaintext, which is accepted in RA-3
   of `RISK_ACCEPTANCE_REGISTER.md`; the notice must disclose it, and a trusted-device
   instruction applies. C2 is no longer a blocker but its residual risk stays recorded.
3. **C3 — Cloud encryption decision:** the owner is considering an unsigned proposal to
   keep the wider budget document plaintext at rest under a risk acceptance, rather than
   encrypting it. The notice must disclose that it is not end-to-end encrypted. C3 remains
   open until the owner signs RA-1 in `RISK_ACCEPTANCE_REGISTER.md`.
4. **C4 — Authentication and isolation:** hosted-only passkeys, a client email-verification
   gate before cloud sync, and live passkey/two-account RLS/two-device sync evidence. The
   owner attests on 16 Nov 2026 that two-account sync, deletion and export drills passed;
   no dated build artifact is filed. The client verification gate is implemented; Supabase
   Confirm email configuration and the live signup/resend test, passkey ceremony and
   two-device conflict test remain open.
5. **C5 — Deletion and export:** the owner attests on 16 Nov 2026 that deletion and export
   drills passed; dated build evidence, encrypted backup/restore observation and UI/notice
   wording for local copies and exports remain open.
6. **C6 — Security assurance:** independent penetration test of the packaged app, hosted
   app, OAuth callback, RLS and token broker; no unresolved high or critical finding.
7. **C7 — Legal pack:** DPIA and this addendum signed, privacy notice and Terms reviewed,
   ICO fee position recorded, DPAs and transfer mechanisms filed, privacy mailbox address recorded (provider terms/retention still open).
8. **C8 — Third-party and retention wording:** named-person notice, feedback retention,
   portal deletion, support-bundle handling and processor retention are written down and
   reflected in the retention schedule.

## A.8 Consultation

| Consultee | Status | Required input |
| --- | --- | --- |
| Owner / controller | Engaged; this draft prepared for review | Confirm scope, risk appetite and decisions C1–C8 |
| UK privacy adviser / DPO | Not consulted | Review necessity, lawful bases, third-party data, transfers and rights |
| UK legal counsel | Not consulted | Review the DPIA, notice, Terms/EULA and consumer position |
| Security reviewer | Not consulted | Review threat model, RLS, storage and pen-test scope |
| Data subjects / pilot users | No formal consultation | Pilot feedback on transparency, portal and deletion experience |
| Supabase / processors | No DPA evidence filed | Confirm roles, region, sub-processors and retention |

## A.9 Decision and sign-off

**Interim decision:** the current private/owner deployment may continue. Public production,
public sign-up, marketing and any claim that FinanceHub is legally compliant remain on
hold until C1–C8 are closed and the sign-off below is completed.

| Role | Name | Decision | Date | Conditions |
| --- | --- | --- | --- | --- |
| Controller | Zane Stanton |  |  |  |
| Privacy adviser / DPO |  |  |  |  |
| UK counsel |  |  |  |  |
| Security reviewer |  |  |  |  |

**Review trigger:** any new processor, region, bank-linking, payment, analytics, attachment,
sharing or storage change; any personal-data breach; or 12 months from sign-off, whichever
is sooner.
