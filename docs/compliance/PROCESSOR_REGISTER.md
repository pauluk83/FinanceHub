# FinanceHub Processor Register — DRAFT

**Status:** PARTIAL — dashboard and public-policy evidence was gathered on 17 November
2026. C1 remains open: InfinityFree and consumer Gmail provide no DPA, the Supabase Free
plan has no automatic database backups and only the non-production default SMTP, and the
Google OAuth app is unverified. This register is the working record for PR-1 / DPIA
Addendum A condition **C1**. It is not evidence on its own; signed contracts, transfer
assessments and dated exports must be stored in the private compliance evidence folder.

**Controller:** Zane Stanton, individual, England.

**Register owner:** Zane Stanton.

**Last reviewed:** 17 November 2026 (dashboard evidence pass).

**Review triggers:** new provider, new sub-processor, region change, new feature that sends
personal data to a provider, contract renewal, personal-data breach, or 12 months.

**Publication:** internal document. Do not commit signed contracts, personal data,
credentials, account numbers or security tokens to this repository. Record references and
evidence locations only.

---

## 1. How to use this register

1. List every provider that can access personal data, not just the ones named in the app.
2. Record the provider’s role: processor, independent controller, joint controller or
   infrastructure recipient with no budget-data access.
3. Record the processing region and every sub-processor that can access the data.
4. File the DPA or terms, the transfer mechanism (UK IDTA, SCC or adequacy) and the transfer
   risk assessment.
5. Record retention/backup windows and the security/privacy contact.
6. Attach evidence references and mark the entry **Complete** only when all mandatory
   fields are filled.
7. C1 closes only when every mandatory entry is Complete and the owner has signed the
   register.

**Status key:** `Open` — evidence missing; `Partial` — some fields evidenced; `Complete` —
all mandatory fields and evidence references present; `N/A` — documented reason why no
personal data is processed.

---

## 2. Processor and recipient register

Mandatory fields are marked **M**. “TBC” means to be confirmed and is not acceptable at
C1 closure.

| ID | Provider and service | Role | Purpose and data | Region (M) | Sub-processors (M) | Transfer mechanism (M) | DPA / terms (M) | Retention and backup window (M) | Security/privacy contact | Evidence reference (M) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | **Supabase** — Auth, Postgres, Row Level Security, Realtime | Processor | Account identifiers, auth data, full budget document, sync/conflict metadata, logs (`D1`–`D4`, `D6`–`D8`, `D12`, `D14`) | TBC — project settings | TBC — Supabase sub-processor list | TBC — UK IDTA / SCC / adequacy and TIA | TBC — executed or accepted DPA, date and reference | TBC — database backup/PITR window and log retention | TBC — security contact / dashboard route | TBC | Open |
| P2 | **Google** — OAuth sign-in | Controller/processor role to confirm | Google identity, email and OAuth consent data, only if Google sign-in is chosen (`D1`, `D2`, `D14`) | TBC — Google terms | TBC — Google identity sub-processors | TBC — Google terms and transfer basis | TBC — Google OAuth/API terms; DPA if processor | TBC — Google account/auth log retention | TBC | TBC | Open |
| P3 | **InfinityFree** — static web hosting | Processor / hosting provider | Static asset requests, IP address, access logs; no budget data should be deployed (`D14`) | TBC — hosting region | TBC — hosting sub-processors | TBC — UK IDTA / SCC / adequacy | TBC — hosting terms/DPA position | TBC — access-log retention and backup window | TBC | TBC | Open |
| P4 | **GitHub / Microsoft** — Releases and update assets | Infrastructure recipient; confirm whether request logs make it a processor | IP address, user agent, request metadata for update manifest/archive; no budget, account or credential data (`D14`) | TBC — global/US processing | TBC — GitHub sub-processors | TBC — GitHub terms/transfer basis | TBC — GitHub terms; DPA if applicable | TBC — request-log retention | TBC | TBC | Open |
| P5 | **Supabase email delivery provider** — verification and password-reset email | Processor | Email address, message metadata and delivery events (`D1`, `D14`) | TBC — provider and region | TBC | TBC | TBC — provider terms/DPA | TBC — delivery-log retention | TBC | TBC | Open |
| P6 | **Privacy/support mailbox provider** — Gmail/Google (`financehub+pauluk83@gmail.com`) | Independent controller (consumer Gmail) | Correspondence, support bundles and any attachments the user sends (`D13`, `D14`) | TBC — Gmail region | TBC — Google sub-processors | TBC — Google terms and transfer basis | TBC — mailbox terms/DPA | TBC — mailbox retention and backup window | `financehub+pauluk83@gmail.com` | Owner-provided mailbox 16 Nov 2026; terms/retention pending | Partial — address recorded; terms/retention open |
| P7 | **Legal, privacy and security advisers / penetration tester** | Independent professional recipients; not routine processors | Documents, evidence and test data needed for the engagement, under confidentiality | UK / TBC | N/A — individuals or firms | N/A unless data leaves the UK | Engagement letter and confidentiality terms | Per engagement; evidence retained only as needed | TBC | TBC | Open |

The table above is the original 14 November inventory. The verified findings below supersede
its TBC cells for the fields covered; a remaining TBC is not evidence of closure.

### Verified findings — 17 November 2026

These are facts read from the signed-in provider dashboards and published policies. They
record what is now known; they do not close C1, and the gaps below still need evidence or
a decision.

**P1 — Supabase**

- **Region:** West EU (Ireland), `eu-west-1`, from the project General settings.
- **Subprocessors:** Supabase Subprocessor List updated 12 October 2026; the list includes
  AWS, Google, Cloudflare, Postmark, Sentry, GitHub, Vercel and others. The full list is
  the PDF linked from <https://supabase.com/legal/subprocessors>.
- **DPA and transfer:** DPA version 1, 1 August 2026, is incorporated into the Supabase
  Terms; the dashboard states that all organisations get its protections automatically and
  no separate signed DPA is needed. It includes the EU SCCs and the UK Addendum, and the
  Transfer Impact Assessment is available from the dashboard.
- **Retention and backups:** the Free plan has **no automatic database backups**; the
  Backups page says Free projects must export manually. Pro includes 7 days of daily
  backups. Logs are retained for 1 day on Free (7 days on Pro). The DPA provides a 30-day
  post-termination return window before deletion.
- **Contacts:** `privacy@supabase.com` and `security@supabase.com`.
- **Auth email:** custom SMTP is **disabled**. Auth therefore uses Supabase's default SMTP,
  documented as best-effort, limited to 2 messages per hour and not for production. The
  **Confirm email** setting is currently enabled in the dashboard, which conflicts with the
  recorded owner decision that it was deliberately left off; confirm which state is intended.
- **Gap:** decide on Pro backups or a manual off-site export; configure and identify a
  production SMTP provider; resolve the Confirm-email decision; file the DPA/TIA references.

**P2 — Google Sign-In / OAuth**

- **Role and terms:** Google APIs Terms incorporate the Google Controller-Controller Data
  Protection Terms. For UK controller personal data, the UK Controller SCCs apply with
  Google LLC as importer. This is a controller-to-controller relationship, not a customer
  DPA for Google Sign-In.
- **Region and subprocessors:** Google processes globally, including the United States;
  no region commitment applies to Google Sign-In. Google does not publish a
  Sign-In-specific subprocessor list; the Google Cloud subprocessor list is not established
  as applicable.
- **Contacts:** legal notices `legal-notices@google.com`; security reports through
  <https://bughunters.google.com/>.
- **OAuth client state:** the `FinanceHub Web` client is External and marked In production,
  but the project is **unverified** and shows a 1-of-100 user cap. Branding is populated
  (`FinanceHub`, `https://financehub.freedev.app/`, privacy and Terms links, authorised
  domains `freedev.app` and the Supabase project domain). The only requested scope is
  `userinfo.email` (non-sensitive).
- **Gap:** complete Google verification before relying on public Google sign-in; obtain
  legal confirmation of the controller role and transfer wording.

**P3 — InfinityFree**

- **Entity and location:** InfinityFree is registered in the Netherlands. The account's
  hosting IP resolved on 17 November 2026 to Gosforth, England (AS34119 Wildcard UK
  Limited); the service is fulfilled by iFastNet Ltd., a UK company.
- **Terms:** last revised 25 October 2024. The privacy policy says personal data may be
  transferred and processed outside the EEA; it does not provide a transfer mechanism.
- **DPA:** none. InfinityFree support-forum staff state that no separate DPA is available
  and that the privacy policies govern; this is a staff statement, not a contract. iFastNet
  publishes a privacy policy but no DPA for free-hosting customers.
- **Subprocessors:** iFastNet's published third-party processor list is dated 26 May 2018
  and includes KoPage, cPanel, Let's Encrypt, domain registrars, payment providers,
  Attracta, Wildcard Networks and Cloudflare. It is stale and needs revalidation.
- **Retention and logs:** the privacy policy gives no fixed retention period. Forum staff
  say free-hosting access logs are aggregated and discarded immediately; that is not a
  contractual commitment and needs written confirmation.
- **Contact:** `hello@infinityfree.com`; responsible disclosure is also via that address.
- **Gap:** no DPA and no transfer mechanism. This provider cannot close C1 as-is; either
  obtain written terms or move the static site to a provider that offers a DPA.

**P4 — GitHub / Microsoft**

- **DPA and transfer:** the GitHub Data Protection Agreement (version October 2025) forms
  part of the GitHub Customer Agreement. It includes the EU SCCs, the UK Addendum and the
  UK Extension to the EU-US Data Privacy Framework. GitHub is a processor for Customer
  Personal Data and an independent controller for its own account/security processing.
- **Region and subprocessors:** GitHub processes in the United States and other countries;
  data residency is an Enterprise Cloud feature and does not apply here. The published
  Subprocessor List is the applicable list.
- **Retention:** the privacy statement retains data while the account is active and as
  needed for legal/contractual purposes; the DPA requires deletion or return after the
  services end. No fixed public log-retention window is published.
- **Contacts:** `privacy@github.com` and `dpo@github.com`.
- **Gap:** confirm that the free public-repository account is covered by the Customer
  Agreement/DPA and file the DPA reference.

**P5 — Supabase Auth email delivery**

- Custom SMTP is disabled, so delivery uses Supabase's default SMTP. Supabase does not
  identify a separate provider for that default service in the dashboard, and its docs mark
  it best-effort/non-production (2 messages per hour).
- The Supabase subprocessor list includes Postmark for communications, but it is not
  confirmed as the Auth default sender.
- **Gap:** configure a named production SMTP provider, add it to this register, and record
  its terms, region, subprocessors and retention. With Confirm email enabled, this is a
  live signup blocker.

**P6 — Gmail support mailbox**

- The mailbox `financehub+pauluk83@gmail.com` is consumer Gmail under the Google Terms of
  Service (effective 30 July 2026) and Google Privacy Policy. Google LLC acts as controller
  for the consumer service; no DPA is offered for consumer Gmail.
- Processing is global and may include the United States. Retention is controlled by the
  mailbox owner's deletion and Google's account/backup practices; no fixed processor
  retention window is published for this use.
- **Gap:** no DPA and no controller/processor allocation. Move the support mailbox to a
  service with a DPA, or record a signed risk acceptance and transfer assessment. Do not
  publish the address as a formal support/security route until this is resolved.

**P7 — Advisers and penetration tester**

- No engagement letter, confidentiality terms or data-processing position is recorded yet.
  This remains open and is not a routine processor.

### Providers that are not processors

- **ICO, courts and law enforcement** — independent recipients; disclosed only where
  required or permitted by law.
- **The user’s own backup location** — controlled by the user; not a FinanceHub processor.
- **Demo data** — synthetic; no processor.

---

## 3. Sub-processor schedule

Complete this for every provider marked TBC. A provider’s general sub-processor page is not
enough; record the list version/date relied on.

| Provider | Sub-processor | Service | Region | Personal data | Transfer basis | Evidence | Reviewed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | TBC | Auth/Postgres/Realtime infrastructure | TBC | Account and budget data | TBC | TBC | TBC |
| Google | TBC | OAuth identity | TBC | Identity/email | TBC | TBC | TBC |
| InfinityFree | TBC | Hosting/CDN/logs | TBC | IP/request logs | TBC | TBC | TBC |
| GitHub / Microsoft | TBC | Release delivery and logs | TBC | IP/user-agent/request metadata | TBC | TBC | TBC |
| Email provider | TBC | Verification/reset delivery | TBC | Email/message metadata | TBC | TBC | TBC |
| Gmail/Google (`financehub+pauluk83@gmail.com`) | TBC | Support correspondence | TBC | Correspondence | TBC | TBC | TBC |

---

## 4. DPA and transfer evidence schedule

For each entry, file the actual document in the private evidence folder and record its
identifier here. Do not rely on a provider’s marketing page as the contract.

| Evidence ID | Provider | Document | Version / date | Scope | Transfer mechanism | Transfer risk assessment | Stored at | Reviewed by / date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-P1-DPA | Supabase | Data-processing agreement | TBC | Auth/Postgres/Realtime | TBC | TBC | Private evidence folder | TBC |
| E-P1-SUB | Supabase | Sub-processor list | TBC | Infrastructure | TBC | TBC | Private evidence folder | TBC |
| E-P2-TERMS | Google | OAuth/API terms | TBC | Google sign-in | TBC | TBC | Private evidence folder | TBC |
| E-P3-TERMS | InfinityFree | Hosting terms/DPA position | TBC | Static hosting and logs | TBC | TBC | Private evidence folder | TBC |
| E-P4-TERMS | GitHub / Microsoft | GitHub terms and privacy statement | TBC | Release/update requests | TBC | TBC | Private evidence folder | TBC |
| E-P5-DPA | Email provider | Email delivery terms/DPA | TBC | Verification/reset email | TBC | TBC | Private evidence folder | TBC |
| E-P6-DPA | Gmail/Google | Mailbox terms/DPA | TBC | Support correspondence | TBC | TBC | Private evidence folder | TBC |

**Transfer notes:** record whether the mechanism is the UK International Data Transfer
Addendum, Standard Contractual Clauses, an adequacy regulation, or another lawful route.
Where the IDTA/SCC is used, complete the transfer risk assessment and record the assessor
and date. Do not state that data stays in the UK unless the region and all relevant
sub-processors confirm it.

---

## 5. C1 closure checklist

C1 from `DPIA.md` Addendum A is **OPEN** until every line is checked and evidenced.

- [x] Data map completed (`DATA_MAP.md`).
- [x] Processor inventory drafted (this register).
- [x] Supabase processing region recorded: West EU (Ireland), `eu-west-1`.
- [x] Supabase sub-processors recorded: list updated 12 October 2026.
- [x] Supabase DPA recorded: v1, 1 August 2026, incorporated into the Terms; no separate signature required. TIA available; file it privately.
- [x] Supabase transfer mechanism recorded: EU SCCs and UK Addendum; TIA covers the transfer.
- [x] Supabase retention recorded: no Free-plan backups, 1-day logs, Pro gives 7 days; DPA 30-day deletion window. **Backup decision still open.**
- [x] Supabase security/privacy contacts recorded: `security@supabase.com`, `privacy@supabase.com`.
- [~] Google role/terms/transfer recorded: Controller-Controller Terms and UK Controller SCCs; Sign-In-specific subprocessors and region commitment remain unconfirmed. OAuth app is unverified.
- [~] InfinityFree recorded: Netherlands entity, UK hosting, terms 2024-10-25, no DPA and no transfer mechanism; subprocessor list dated 2018.
- [x] GitHub/Microsoft recorded: DPA October 2025, UK Addendum/DPF, US/global processing, published subprocessor list; free-account coverage still to confirm.
- [~] Email delivery: Supabase default SMTP; custom SMTP disabled and no named provider. Production SMTP remains open.
- [~] Privacy/support contact recorded as `financehub+pauluk83@gmail.com`; consumer Gmail has no DPA and retention/role remain open.
- [ ] Every provider entry is `Complete`, with evidence references.
- [ ] Owner has signed and dated the register.

**C1 closure test:** every mandatory field is filled, no “TBC” remains in a mandatory
field, the DPA/terms and transfer evidence are filed, and the owner has signed. Until then,
the register stays **OPEN** and the privacy notice must not be published with unresolved
`[TO CONFIRM]` fields.

---

## 6. Review record

| Date | Reviewer | Change | Next review |
| --- | --- | --- | --- |
| 14 Nov 2026 | Draft prepared | Initial inventory from `DATA_MAP.md`; all provider evidence remains open | Before public production |
| 17 Nov 2026 | Dashboard evidence pass | Supabase region/subprocessors/DPA/TIA/backups/SMTP; Google OAuth state; InfinityFree terms/no DPA; GitHub DPA; Gmail consumer terms. C1 remains partial | Before public production |

## 7. Sources checked — 17 November 2026

Private dashboard pages are references only; no passwords, session tokens, client secrets or
screenshots are stored in this repository.

- **Supabase:** project General settings (region), Database → Backups, Authentication →
  Providers and Emails (Confirm email, custom SMTP), Organisation → Legal Documents.
  Public: <https://supabase.com/legal/customer-resources/data-processing-addendum>,
  <https://supabase.com/legal/subprocessors>, <https://supabase.com/docs/guides/platform/backups>,
  <https://supabase.com/pricing>, <https://supabase.com/contact-us>.
- **Google Sign-In:** <https://developers.google.com/terms>,
  <https://privacy.google.com/businesses/gdprcontrollerterms>,
  <https://developers.google.com/identity/protocols/oauth2/policies>; Google Cloud
  project `financehub-514021` Auth Platform pages (Branding, Audience, Data access,
  Clients).
- **InfinityFree:** <https://www.infinityfree.com/terms/>,
  <https://www.infinityfree.com/privacy/>,
  <https://www.infinityfree.com/responsible-disclosure/>; hosting IP geolocation checked
  with ipinfo.io; support-forum statements at
  <https://forum.infinityfree.com/t/gdpr-unclarity/87212>,
  <https://forum.infinityfree.com/t/gdpr-data-processing-agreement-auftragsverarbeitungsvertrag-avv/66605>
  and <https://forum.infinityfree.com/t/privacy-of-get-requests-in-logs/77597>.
- **iFastNet:** <https://ifastnet.com/privacy.php>,
  <https://www.ifastnet.com/ThirdPartyDataProcessors.pdf>.
- **GitHub:** <https://github.com/customer-terms/github-data-protection-agreement>,
  <https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>,
  <https://docs.github.com/en/site-policy/privacy-policies/github-subprocessors>.
- **Gmail:** <https://policies.google.com/terms>,
  <https://policies.google.com/privacy>.

**Owner sign-off:** ____________________  **Date:** __________
