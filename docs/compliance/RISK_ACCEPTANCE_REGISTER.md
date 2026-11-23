# Risk Acceptance Register

**Status:** **RA-1, RA-2 and RA-3 signed by the owner on 2026-11-17. RA-4 to RA-10 signed
on 2026-11-23**, which closes the legal and compliance pack by dated acceptance: the
controller/processor position, lawful basis, the DPIA position, international transfers, the
penetration test, the ICO fee position, and the notice/terms/refund/complaints position.
Each entry records an accepted risk with conditions; each signature note says which evidence
was filed and what is still outstanding. **C3 is accepted, not eliminated** — C1 processor
evidence and an independent penetration test remain open as accepted risks. The code-signing
gate is closed only because the owner accepted the unsigned distribution risk in RA-2.

**Controller / proposed risk owner:** Zane Stanton.

**Scope of the proposal:** UK-only, free public launch of the Windows x64 app and the
hosted web app as separately decided.

**How to read this document:**

- “Proposal” means a decision the owner could make by signing. It is not an acceptance.
- Controls below are **candidate controls**. None is asserted to be operating until the
  evidence named beside it is filed.
- Residual ratings are provisional, not measured or accepted.
- No plan, notice, checklist or release document may describe these risks as accepted
  until the owner signs the relevant entry.

**Review trigger:** any change to the cloud document format, provider, region, distribution
channel, price, market, hosted-web model or security posture; any high/critical
penetration-test finding; or 12 months from signature.

---

## RA-1 — Proposal to accept the cloud budget without end-to-end encryption

**Related:** DPIA Addendum A risk R2 and condition C3; data map `D3`–`D8`, `F8`.

**Proposal:** if the owner signs this entry, the synced budget document
(`settings.state_json`) would remain readable by the service at rest. Wider client-side
encryption would not be implemented for this launch. The provider-login vault would remain
separately end-to-end encrypted.

**Risk being considered:** accounts, balances, transactions, comments, people, provider
details, settings and vault ciphertext are held in the cloud document. A party with
Supabase database/operator access, or access to a provider backup, could read the budget
document. The cloud copy is intended to be protected by TLS in transit and RLS in normal
application access, but it is not end-to-end encrypted.

**Candidate controls — evidence has not been filed:**

| Candidate control | Evidence status |
| --- | --- |
| Supabase RLS scoped to `auth.uid()` | Policies are claimed in the migrations; a live two-account isolation record has not been filed. |
| Anon/publishable key is the only key in the client | Claimed; a current built-bundle check is not recorded here. |
| Service-role access is limited to the owner | Not verified; requires a Supabase member/API-key review. |
| TLS protects data in transit | Expected; no current test record is filed here. |
| Provider encrypts storage at rest | Not evidenced; C1 provider evidence is outstanding. |
| Cloud account deletion removes cloud rows | SQL is applied and the owner reports a test; the build/date/evidence is not filed. |
| Privacy notice discloses the lack of end-to-end encryption | Draft only; not published or legally reviewed. |
| Two-account isolation and an independent penetration test | Owner reports a two-account test; evidence is not filed. No independent penetration test has been performed. |
| No advertising, analytics, public sharing or third-party Open Banking/AISP | Scope statement; the two exceptions are the owner-only Starling personal feed (not Open Banking, DPIA A.10) and the owner-only Enable Banking feed (Open Banking through an authorised AISP, restricted to accounts the owner links, DPIA A.11). Neither is offered to other people. Build and dependency verification is pending. |

**Evidence required before signature:**

1. C1 processor evidence: region, sub-processors, DPA, transfer mechanism, backup/log
   retention and security contact.
2. A dated two-account RLS isolation record, including the build tested.
3. Confirmation of who can access the Supabase project and service-role key.
4. The current privacy-notice disclosure, ready for legal review.
5. A penetration-test plan or report covering cloud data access; if a high/critical
   finding exists, this proposal should not be signed.

**Provisional residual if signed:** **Medium–High** (low–medium likelihood, high impact).
This is a proposal rating, not an accepted one.

**Conditions that would apply if signed:**

1. The owner signs and dates this entry.
2. The privacy notice keeps the “not end-to-end encrypted” disclosure and is published
   only after legal review.
3. C1 identifies where the data is held and who can access it.
4. Any high or critical penetration-test finding about cloud data access reopens this
   proposal.
5. Access to the Supabase project and service-role key is reviewed and limited.
6. The position is reviewed at least every 12 months or on any trigger above.

**Owner signature:** Zane Stanton  **Date:** 2026-11-17

**Review date:** 2027-11-17

**Signature note:** signed at the owner's direction before evidence items 1 (C1 processor
evidence), 3 (Supabase project and service-role access review) and 5 (independent
penetration test) were filed. Those items remain open under PR-1 and PR-3: the acceptance
is recorded, the evidence is not claimed.

---

## RA-2 — Proposal to accept an unsigned Windows installer and updater

**Related:** PR-0 owner decision 4; PR-4 code-signing item; release and update controls.

**Proposal:** if the owner signs this entry, the Windows installer and updater would ship
**without Authenticode code signing** for this launch. The certificate/signing route would
not be purchased now.

**Risk being considered:** Windows SmartScreen and browsers may warn that the publisher is
unknown. Users cannot verify a signed publisher identity. An attacker who can replace the
download or update channel could distribute a modified build. SHA-256 can prove file
integrity only if the expected digest is obtained through a trusted channel. This is a
distribution and user-trust risk, not a budget-data access control.

**Candidate controls — evidence has not been filed:**

| Candidate control | Evidence status |
| --- | --- |
| Installer is a GitHub Release asset served over HTTPS | Claimed by the release process; the current release asset and link have not been recorded here. |
| Each release publishes a dated installer and `SHA256SUMS.txt` | Claimed by the release process; the current digest match has not been recorded here. |
| Updater validates manifest/archive/block hashes | Code appears to validate these values; no independent release-build test is recorded here. It does not authenticate a publisher. |
| App links directly to a versioned release, with no stable alias | Plan claim; the live link has not been recorded here. |
| Download page and release notes warn that the installer is unsigned | Not implemented. |
| Public repository and release history expose unexpected builds | Repository exists; this does not prevent a tampered download. |
| Release assets contain no budget data, credentials or tokens | Release-process claim; a current asset scan is not recorded here. |

**Evidence required before signature:**

1. A release-build record showing the dated installer, its SHA-256 and the matching
   `SHA256SUMS.txt`.
2. Verification that the live download link resolves to that dated release and not a
   mutable alias.
3. A recorded updater test showing hash validation and the unsigned-publisher limitation.
4. The unsigned-installer warning text for the download page and release notes.
5. An asset scan confirming no budget data, credentials or tokens are present.

**Provisional residual if signed:** **Medium–High** (medium likelihood of a SmartScreen or
trust problem, high impact if a download is replaced). This is a proposal rating, not an
accepted one.

**Conditions that would apply if signed:**

1. The owner signs and dates this entry.
2. The unsigned status is stated on the download page and in release notes.
3. Every release has a dated installer and matching `SHA256SUMS.txt`.
4. The app continues to use the versioned GitHub Release URL, not a stable alias.
5. Any report of a tampered download or update is treated as a security incident.
6. The position is revisited before general availability, before charging, before any
   Microsoft Store distribution, or if the installer is hosted anywhere else.
7. A future code-signing certificate is treated as a change to this proposal, not as
   silently closing it.

**Owner signature:** Zane Stanton  **Date:** 2026-11-17

**Review date:** 2027-11-17

**Signature note:** evidence items 1, 2 and 4 were filed before signature — the dated
installer and `SHA256SUMS.txt` match (`FinanceHub-Setup-2026.11.16.exe`, SHA-256
`39b56d97148d9b11a5b0734caadb6b21630cdd091358038017eec0a90206abc4`), the app's download link
resolves to the versioned `v2026.11.16` release with no stable alias, and the
unsigned-publisher warning is published on the application-changelog page. The owner also
reports a successful delta update on a packaged app (2026-11-17). The release-asset scan
for budget data or credentials (item 5) remains outstanding.

---

## RA-3 — Accepted risk: plaintext browser storage for the hosted budget

**Related:** S-04; DPIA condition C2 (superseded 2026-11-17); data map `F3`.

**Decision:** the owner withdrew the demo-only hosted model on 2026-11-17, so a signed-in
account with a confirmed email opens, edits and syncs its real budget at
`https://financehub-uk.pages.dev/` (the site moved to Cloudflare Pages on 2026-11-17). The hosted build holds the budget, session, restore
points and sync metadata in unencrypted browser `localStorage`.

**Risk being considered:** anyone who can use that browser profile, or a device where the
site was used without clearing site data, can read the budget without the app passphrase.
A script-injection flaw on the origin or a malicious browser extension could read it too.
The data outlives sign-out until site data is cleared.

**Controls relied on:**

| Control | Status |
| --- | --- |
| Confirmed email required before cloud sync | Implemented as a client gate; Supabase “Confirm email” is deliberately off |
| Supabase RLS scoped to `auth.uid()` | Policies applied; owner-attested two-account isolation test |
| HTTPS transport | Live site serves over HTTPS |
| Session ends on sign-out | Sign-out ends the Supabase session |
| Cached budget removed on hosted sign-out | Implemented 2026-11-17; skipped while the sync outbox holds unsynced edits |
| Notice discloses plaintext browser storage | Draft updated 2026-11-17 |
| Trusted-device guidance | Draft notice text |

**Not in place:** encryption of browser-stored budget data; a purge while unsynced edits
remain in the outbox (those are kept rather than lost); anything beyond the exact Supabase
CSP origin.

**Residual if signed:** **Medium–High**, accepted by the owner.

**Conditions:**

1. The notice keeps disclosing that browser storage is not encrypted.
2. Confirmed email stays required before cloud sync.
3. Review before charging, before the hosted app becomes the primary product, or if a
   browser-storage encryption route lands.
4. Any report of budget data read from a shared device is treated as a security incident.

**Owner signature:** Zane Stanton  **Date:** 2026-11-17

**Review date:** 2027-11-17

---

## RA-4 — Accepted: controller/processor position with an incomplete processor file

**Related:** DPIA Addendum A condition C1; `COMPLIANCE.md`; `PROCESSOR_REGISTER.md`.

**Decision:** the owner is the data controller (individual, England). Providers recorded as
processors or independent controllers: **Supabase** (auth, Postgres, RLS), **Cloudflare
Pages** (static hosting), **Resend** (auth email and reminder digests), **GitHub/Microsoft**
(release download metadata), **Google** (OAuth sign-in as controller; consumer Gmail as
independent controller for the support mailbox). **Enable Banking** (authorised AISP) and
**Starling** act only for the owner's own linked accounts through desktop-only feeds and are
not offered to other people.

**Risk being considered:** the processor file is not complete. Cloudflare's self-serve DPA
has not been accepted, consumer Gmail offers no DPA, Supabase is on the Free plan with no
automatic backups, Resend's DPA and transfer terms are unfiled, and the Google OAuth app is
unverified. A processor could therefore act outside documented terms, and there is no
automatic cloud backup behind the budget document.

**Controls relied on:** Supabase region `eu-west-1` (Ireland) recorded; DPAs and transfer
mechanisms recorded where published (Supabase v1, GitHub October 2025, Google
Controller-Controller Terms); owner-scoped RLS; no service-role key in the client or any
asset; manual exports available from the app; owner-only use with no payments.

**Residual if signed:** **Medium**, accepted.

**Conditions:**

1. Accept and file Cloudflare's DPA, and record its subprocessor-list version and log
   retention, before the app is offered to anyone beyond the owner.
2. File Resend's DPA and transfer basis, and record a sender domain before mail goes to any
   address other than the owner's.
3. Decide between Supabase Pro backups and a scheduled manual export; until then the manual
   export is the only cloud backup.
4. Move the support mailbox to a provider that offers a DPA, or keep it owner-only and
   documented as accepted.
5. Reopen this entry on any new provider, region change or new feature that sends personal
   data to a provider.

**Owner signature:** Zane Stanton  **Date:** 2026-11-23

**Review date:** 2027-11-23

**Signature note:** signed with the processor file incomplete by decision, for owner-only
use. Nothing here asserts C1 is closed; the open items stay tracked in
`docs/compliance/EVIDENCE_CHECKLIST.md`.

---

## RA-5 — Accepted: lawful basis for the current feature set

**Related:** privacy policy §3; DPIA A.3; `COMPLIANCE.md`.

**Decision:** the lawful bases relied on are performance of a contract, Article 6(1)(b), for
running the app and syncing the budget; legitimate interests, Article 6(1)(f), for security,
abuse prevention and fault-fixing; consent, Article 6(1)(a), for the provider-credential
vault, People sign-ins, the Starling personal feed and the Enable Banking feed; and legal
obligation where tax or records law requires retention. No special-category data is
collected, nothing is sold, there is no advertising or profiling, and there is no automated
decision-making.

**Risk being considered:** the legitimate-interests balance is not separately documented per
purpose, and consent withdrawal is a manual act (deleting the vault, forgetting a token or
revoking a bank consent) rather than a switch.

**Residual if signed:** **Low**, accepted.

**Conditions:** the published notice keeps §3 as written; no analytics, advertising or data
sale is added without revisiting this entry; consent withdrawal stays available for each
optional feature; the position is reviewed with counsel before charging.

**Owner signature:** Zane Stanton  **Date:** 2026-11-23

**Review date:** 2027-11-23

---

## RA-6 — Accepted: DPIA and Addendum A adopted with conditions tracked

**Related:** `docs/compliance/DPIA.md`, Addendum A conditions C1–C8.

**Decision:** the DPIA and Addendum A are adopted as written, and each production condition
closes as follows: **C1** accepted by RA-4 (processor file open), **C2** superseded by RA-3,
**C3** accepted by RA-1, **C4** and **C5** owner-attested with the dated records in
`EVIDENCE_CHECKLIST.md`, **C6** accepted by RA-8, **C7** accepted here with RA-4 and RA-10,
and **C8** recorded in `RETENTION_SCHEDULE.md` and the notice.

**Risk being considered:** conditions C4 and C5 rest on owner attestation without a dated
build artefact, and no independent review of the DPIA has taken place.

**Residual if signed:** **Medium**, accepted.

**Conditions:** the DPIA stays the governing assessment and is refreshed at least every 12
months or on any trigger in this register; C4/C5 evidence is replaced by a dated build
record when convenient; a new feature that changes the data map reopens the DPIA.

**Owner signature:** Zane Stanton  **Date:** 2026-11-23

**Review date:** 2027-11-23

---

## RA-7 — Accepted: international transfer basis without every mechanism filed

**Related:** DPIA C1; processor register §4; `DATA_MAP.md`.

**Decision:** transfers rely on the following: **Supabase** processes in `eu-west-1`
(Ireland) under the EU SCCs plus the UK Addendum, with its Transfer Impact Assessment;
**Cloudflare** serves a global CDN under its self-serve DPA incorporating the EU SCCs and UK
Addendum; **GitHub/Microsoft** processes in the United States under the GitHub Data
Protection Agreement (October 2025) with the EU SCCs, UK Addendum and the UK Extension to the
EU–US Data Privacy Framework; **Google** sign-in runs under the UK Controller SCCs;
**Resend** is US-based and will be covered by SCCs once filed; **consumer Gmail** has no
contractual transfer mechanism.

**Risk being considered:** Cloudflare's DPA is unaccepted, Resend's mechanism is unfiled and
Gmail has none, so not every transfer is evidenced.

**Residual if signed:** **Medium**, accepted.

**Conditions:** no claim is made that data stays in the UK; each mechanism is filed in the
private evidence folder before the app is offered beyond the owner; a transfer risk
assessment is recorded where the IDTA or SCCs are relied on; a region change reopens this
entry.

**Owner signature:** Zane Stanton  **Date:** 2026-11-23

**Review date:** 2027-11-23

---

## RA-8 — Accepted: independent penetration test deferred

**Related:** DPIA C6; DPIA Addendum A risk R6; RA-1.

**Decision:** no third-party penetration test is commissioned for this release. The owner
relies instead on owner-scoped RLS with an attested two-account isolation check, the CSP and
security-header suite locked by `tests/security-headers.test.ts`, no service-role key in the
client, HTTPS-only transport, the full automated suite, and the fact that the build is
used by the owner only and takes no payments.

**Risk being considered:** an unknown high or critical flaw in the hosted app, the OAuth
callback, the RLS policies or the token handling could expose budget data, and nobody
independent has looked for it.

**Residual if signed:** **High if such a flaw exists**, accepted for owner-only use.

**Conditions:** any high or critical finding from any source — including a user report —
reopens this entry and stops distribution until resolved; a test covering the packaged app,
hosted app, OAuth callback, RLS and token broker is commissioned before any public or
commercial launch; the position is reviewed at least every 12 months.

**Owner signature:** Zane Stanton  **Date:** 2026-11-23

**Review date:** 2027-11-23

---

## RA-9 — Accepted: ICO data-protection fee not paid

**Related:** `COMPLIANCE.md` applicability matrix; DPIA C7.

**Decision:** no ICO data-protection fee is paid. Processing is carried out for the owner's
own personal and household affairs, with the app used by the owner alone, which falls in the
personal/household exemption from the charges regulations. No staff administration,
advertising or business accounts processing takes place.

**Risk being considered:** if the app is opened to other people or used commercially, the
exemption no longer applies and an unpaid fee would be a breach of the registration duty.

**Residual if signed:** **Low**, accepted.

**Conditions:** the app stays owner-only until this entry is revisited; registering with the
ICO and paying the appropriate tier happens before any other person uses the hosted service;
the ICO self-assessment result is recorded in the private evidence folder.

**Owner signature:** Zane Stanton  **Date:** 2026-11-23

**Review date:** 2027-11-23

---

## RA-10 — Accepted: in-house notice and terms, no refund route

**Related:** DPIA C7 and C8; DPIA Addendum A risk R10; `app/src/legal/`.

**Decision:** the privacy policy (v1.2) and terms of service (v1.1) are published in the app
and on the login page without a solicitor's review, and both name the security and privacy
contact `pauluk83+financehub@gmail.com`. The app is free, takes no payments, stores no card
data and issues no invoices, so no refund, chargeback or cooling-off route applies.
Complaints go to that contact first; data-protection complaints may go to the ICO.

**Risk being considered:** consumer-law and transparency wording has not been checked by
counsel, and a refund position would have to be written the moment charging starts.

**Residual if signed:** **Low–Medium**, accepted.

**Conditions:** a UK solicitor reviews the three documents before any public or commercial
launch and before any charge is introduced; a refund and complaints policy is published if
payments ever start; the 18+ requirement, the no-financial-advice wording and the
not-end-to-end-encrypted disclosure stay in place; the contact address stays current.

**Owner signature:** Zane Stanton  **Date:** 2026-11-23

**Review date:** 2027-11-23

---

## Proposal status

| ID | Risk | Proposal | Provisional residual | Signature | Status |
| --- | --- | --- | --- | --- | --- |
| RA-1 | Cloud budget not end-to-end encrypted | Accepted with candidate controls and conditions | Medium–High (accepted) | Zane Stanton, 2026-11-17 | **Signed — C3 accepted; C1 evidence and pen test open** |
| RA-3 | Hosted budget in plaintext browser storage | Accepted with candidate controls and conditions | Medium–High (accepted) | Zane Stanton, 2026-11-17 | **Signed — hosted real-budget model permitted** |
| RA-2 | Unsigned installer/updater | Accepted with candidate controls and conditions | Medium–High (accepted) | Zane Stanton, 2026-11-17 | **Signed — code-signing gate closed as accepted risk** |
| RA-4 | Controller/processor file incomplete | Accepted with conditions | Medium (accepted) | Zane Stanton, 2026-11-23 | **Signed — C1 accepted; DPA and transfer evidence open** |
| RA-5 | Lawful basis for the current features | Accepted with conditions | Low (accepted) | Zane Stanton, 2026-11-23 | **Signed** |
| RA-6 | DPIA and Addendum A adopted, conditions tracked | Accepted with conditions | Medium (accepted) | Zane Stanton, 2026-11-23 | **Signed — C1/C6 accepted elsewhere** |
| RA-7 | Transfer basis without every mechanism filed | Accepted with conditions | Medium (accepted) | Zane Stanton, 2026-11-23 | **Signed** |
| RA-8 | Independent penetration test deferred | Accepted with conditions | High if a flaw exists (accepted) | Zane Stanton, 2026-11-23 | **Signed — C6 accepted, not eliminated** |
| RA-9 | ICO data-protection fee not paid | Accepted with conditions | Low (accepted) | Zane Stanton, 2026-11-23 | **Signed — owner-only use** |
| RA-10 | In-house notice and terms, no refund route | Accepted with conditions | Low–Medium (accepted) | Zane Stanton, 2026-11-23 | **Signed — C7 wording accepted** |

**C3 status:** accepted risk. RA-1 is signed and dated, so the plaintext-at-rest model is
permitted for this launch. The evidence items listed in RA-1 are still outstanding and are
tracked under PR-1 and PR-3. RA-2 closes only the code-signing gate.

**No acceptance beyond the ten signed entries above may be inferred from this document, the
plan, the notice or any checklist.**
