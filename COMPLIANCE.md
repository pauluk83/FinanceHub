# FinanceHub — legal and regulatory applicability

Not legal advice. Prepared 7 November 2026 and updated 16 November 2026 for the product
described in `PLAN.md`. Confirm with a UK solicitor before any commercial launch.

Draft working documents for professional review are in `docs/compliance/`:
DPIA (including the production-readiness addendum), data map, privacy notice, retention
schedule, DSAR procedure, breach runbook, processor register, risk acceptance register and
evidence checklist. The
owner-side Supabase and mailbox actions are in `docs/OWNER_ACTIONS.md`. A desktop-only
Starling personal feed was added for the owner on 17 November 2026; it is not Open Banking
and does not close the Open Banking/legal gate.

## Product facts that decide applicability

- Personal budgeting and record-keeping app; one user per workspace.
- No Open Banking/AISP connection, no payment initiation, no card acquiring, no money
  transmission and no stored card numbers.
- Optional Windows-only **Starling personal feed**: the owner's own Starling account is
  read with a Starling personal access token. This is Starling's own API, not Open Banking;
  the token is stored only in the OS-encrypted local store, and transactions are appended
  only after review. It is not offered to other people.
- Cloud sync through Supabase; authentication through Supabase (email/password and
  Google OAuth).
- Provider logins optionally stored client-side, encrypted with AES-256-GCM.
- Hosted static web build on InfinityFree. Since the owner's 2026-11-17 decision it opens, edits and syncs a signed-in real budget in the browser, still requiring a confirmed email before sync. Browser storage is plaintext while the site is open, and that residual risk is recorded as RA-3 in `docs/compliance/RISK_ACCEPTANCE_REGISTER.md`.
- Owner and data controller: Zane Stanton (individual, England).

## Applicability matrix

| Requirement | Applies now? | Why | Current position / action |
| --- | --- | --- | --- |
| Privacy Policy | Yes | UK GDPR transparency duty | Published in-app (Tools → Guides is separate; legal is linked from sign-in and Settings → About & legal) |
| EULA | Yes | Protects IP and limits liability | Published in-app |
| Terms of Service | Yes | Rules, disclaimers, no financial advice | Published in-app |
| UK GDPR / Data Protection Act 2018 | Yes | Personal data, UK controller | Lawful bases, rights, retention, processor terms; check ICO registration and data-protection fee |
| CCPA/CPRA | Not currently | No California-targeted business or thresholds | Reassess before US launch |
| GLBA | No | Not a US financial institution | Reassess only if US financial services are offered |
| PCI DSS | No | No card data and no payments | Keep it that way; if payments are added, use a tokenized processor (for example Stripe) to reduce scope |
| PSD2 / Open Banking | No | No Open Banking/AISP aggregation or payment initiation | The Starling personal feed uses Starling's own API, not PSD2 AIS; other-bank Open Banking still needs FCA authorisation/agent status and SCA |
| FCA authorisation | No | No regulated activity: no advice, payments, credit or investments | Do not describe the Starling personal feed as Open Banking or offer it to third parties without revisiting the FCA position |
| FinCEN MSB / state money transmitter licences | No | No money transmission | Reassess if account funding or payments are added |
| KYC / AML | No | No customer funds and no transmission | Reassess with payments; do not add account funding without a compliance programme |
| MFA | Passkeys only (hosted web app) | Supabase supports passkeys | TOTP setup was removed from Settings; Supabase passkeys are enabled with RP ID `financehub.freedev.app` and the passkey controls are built. The packaged Electron window loads `file://` and cannot use WebAuthn, and a real passkey ceremony is still untested |
| Biometric login | Not implemented | Web build; desktop OS keychain is possible | Roadmap |
| Zero Trust | Partial | HTTPS, row-level security, anon key only, client-side E2EE vault | Keep the service-role key server-side only (already the case) |
| App store declarations | Only on store release | Google Play Financial Features Declaration; Apple organisation account for some finance categories | Prepare at submission |
| Trademark | Common-law ™ only | Not registered | Register with UKIPO (and USPTO if US) before enforcement; use ™ now, ® only after registration |
| Copyright notice | Yes | UK CDPA / Berne | © 2026 Zane Stanton on sign-in, legal pages and Settings |
| Data access and portability | Implemented | JSON and CSV export | Documented in the Privacy Policy |
| Right to erasure | Implemented and applied | Local reset, vault deletion and self-serve cloud deletion | The app calls `delete_my_account`; the function is applied and only `authenticated` may execute it. A throwaway-account deletion test is still pending |
| Consent | Partial | Workspace choice; optional vault and People sign-ins | Consider explicit Terms/Privacy acceptance at sign-up, recorded with version and timestamp |
| Cookie banner | Not needed | No analytics or advertising cookies; functional local storage only | Reassess if analytics are added |
| Processor agreements | Needed | Supabase, hosting, Google | Accept or execute DPAs and keep a processing register |
| International transfers | Needed | Supabase/hosting may process outside the UK | Confirm SCC or UK IDTA coverage |
| Security incident process | Needed | UK GDPR breach notification within 72 hours | Write a runbook and a security contact route |
| Age limit | Stated | Terms require 18+ | Keep the sign-up text aligned |

## Deliberately not implemented

KYC/AML, transaction monitoring, FCA authorisation, PCI DSS controls, Open Banking/AISP
and money transmission are not applicable to the current owner-only budgeting tool and
were not added. The Starling personal feed is a bank's own personal API, not an AISP
service. True Open Banking for other banks would require regulated status, contracts and
audits; a checkbox or a screen in the app would not satisfy them.

## Before public or commercial launch

1. Publish the adopted privacy/support mailbox (`financehub+pauluk83@gmail.com`) in the Privacy Policy and Terms; confirm Gmail terms/retention.
2. Confirm the controller identity and address, and the ICO data-protection fee position.
3. Sign DPAs with Supabase and the hosting provider; record the international transfer mechanism.
4. Have a solicitor review the three documents for England and Wales.
5. Register the FinanceHub trade mark (UKIPO at minimum) before enforcing the name.
6. Add explicit acceptance of the Terms and Privacy Policy at sign-up, recording version and timestamp.
7. Record the 16 Nov 2026 deletion/export attestation (`docs/OWNER_ACTIONS.md`); re-run with a dated build artifact if counsel requires it, and document the 30-day service level for requests that cannot use the app.
8. Review and publish the draft breach-response runbook and a security contact from `docs/compliance/`.
9. If Open Banking aggregation, third-party bank linking, payments or financial advice are added, reassess PSD2/FCA/PCI/KYC before shipping. Keep the Starling personal feed owner-only and labelled as Starling's personal API.
