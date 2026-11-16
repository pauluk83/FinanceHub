# FinanceHub Processor Register — DRAFT

**Status:** OPEN — evidence has not yet been filed for the entries below. This register is
the working record for PR-1 / DPIA Addendum A condition **C1**. It is not evidence on its
own; the signed DPA, terms, transfer assessment and screenshots/exports must be stored in
the private compliance evidence folder.

**Controller:** Zane Stanton, individual, England.

**Register owner:** Zane Stanton.

**Last reviewed:** 14 November 2026 (draft).

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
| P6 | **Privacy/support mailbox provider** — Gmail/Google (`financehub+pauluk83@gmail.com`) | Processor | Correspondence, support bundles and any attachments the user sends (`D13`, `D14`) | TBC — Gmail region | TBC — Google sub-processors | TBC — Google terms and transfer basis | TBC — mailbox terms/DPA | TBC — mailbox retention and backup window | `financehub+pauluk83@gmail.com` | Owner-provided mailbox 16 Nov 2026; terms/retention pending | Partial — address recorded; terms/retention open |
| P7 | **Legal, privacy and security advisers / penetration tester** | Independent professional recipients; not routine processors | Documents, evidence and test data needed for the engagement, under confidentiality | UK / TBC | N/A — individuals or firms | N/A unless data leaves the UK | Engagement letter and confidentiality terms | Per engagement; evidence retained only as needed | TBC | TBC | Open |

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
- [ ] Supabase processing region recorded.
- [ ] Supabase sub-processors recorded.
- [ ] Supabase DPA accepted/executed and filed.
- [ ] Supabase transfer mechanism and transfer risk assessment recorded.
- [ ] Supabase database/backup and log retention windows recorded.
- [ ] Supabase security/privacy contact recorded.
- [ ] Google role, terms, region and transfer basis recorded.
- [ ] InfinityFree role, terms, region, log retention and security contact recorded.
- [ ] GitHub/Microsoft role, terms, region, log retention and transfer basis recorded.
- [ ] Email-delivery provider identified and added to the register.
- [~] Privacy/support contact recorded as `financehub+pauluk83@gmail.com`; Gmail terms/retention still open.
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

**Owner sign-off:** ____________________  **Date:** __________
