# Compliance Evidence Checklist — DRAFT

Keep dated evidence outside the public repository. Do not commit credentials, personal
budget data or identity documents.

## Governance

- [~] Privacy/support contact recorded as `financehub+pauluk83@gmail.com` (Gmail); controller service address and ICO position still open.
- [ ] ICO registration / data-protection fee position recorded.
- [ ] Privacy Policy, Terms and EULA reviewed by a UK solicitor.
- [ ] DPIA and Addendum A reviewed and signed with a review date.
- [ ] Data map (`DATA_MAP.md`) validated; processors, region, sub-processors and retention recorded.
- [ ] Retention schedule approved and reviewed annually.
- [x] Risk acceptance register (`RISK_ACCEPTANCE_REGISTER.md`) signed 17 Nov 2026: RA-1 (cloud plaintext), RA-2 (unsigned installer/updater) and RA-3 (hosted browser storage).

## Processors and transfers

- [~] Partial — provider facts gathered 17 Nov 2026. Supabase region `eu-west-1`, DPA v1/SCCs/UK Addendum/TIA, subprocessor list 12 Oct 2026, contacts and no Free-plan backups recorded. GitHub DPA recorded. Google Controller-Controller Terms recorded. InfinityFree and consumer Gmail have no DPA; C1 remains open.
- [x] Supabase DPA is incorporated into the Terms (v1, 1 Aug 2026) and no separate signature is required; TIA available; security contact recorded. **Free plan has no automatic backups.**
- [~] Partial — InfinityFree terms last revised 2024-10-25; no DPA, no transfer mechanism and a stale 2018 subprocessor list. Hosting IP geolocated to Gosforth, England.
- [~] Partial — Google Controller-Controller Terms and UK Controller SCCs recorded; Google Sign-In is not a customer-DPA service. OAuth app is unverified with a 1/100 user cap.
- [~] Partial — Supabase, GitHub and Google have recorded transfer bases. InfinityFree and consumer Gmail have no transfer mechanism.
- [~] Partial — Supabase Free: no backups and 1-day logs (Pro: 7 days); GitHub/Google/InfinityFree publish no fixed processor retention window for this use.

## Security controls

- [~] Partial — owner attests 16 Nov 2026 that two-account sync isolation passed; no dated build artifact, so this is not closed. Two-device conflict still open.
- [~] Partial — client email-verification gate implemented; Supabase Confirm email is currently enabled, but custom SMTP is disabled and the default service is non-production (2 messages/hour). Live signup/resend test remains open.
- [ ] Service-role key never present in client code or public assets.
- [x] TOTP setup removed from Settings; passkeys are the in-app second-factor option. Existing identity-provider factors are outside FinanceHub's UI.
- [x] Passkey/WebAuthn settings recorded 13 November 2026: display name `FinanceHub`; RP ID `financehub.freedev.app`; origin `https://financehub.freedev.app`. In-app controls shipped for the hosted browser app; a real enrolment/sign-in ceremony remains untested.
- [x] Account-deletion SQL applied 13 November 2026; `SECURITY DEFINER`, owned by `postgres`, `anon` execute denied and `authenticated` allowed.
- [~] Partial — owner attests 16 Nov 2026 that account deletion and data-export drills completed; no dated build artifact, so this is not closed. Live passkey, email verification and two-device conflict tests remain open.
- [x] Pre-rotation conflict history purged and old backups removed (owner confirmed 13 November 2026).
- [ ] Encrypted backup and restore tested; automatic restore point observed.
- [ ] Redacted support bundle checked for names, amounts and credentials.

## Rights and incidents

- [ ] DSAR procedure tested; register created; one-month timer understood.
- [ ] Breach contact route tested; ICO reporting route bookmarked.
- [ ] Breach tabletop exercise completed and actions recorded.
- [ ] Local-copy and exported-backup deletion wording checked in the privacy notice.

## Release evidence

- [ ] Build id and installer checksum recorded for each release.
- [ ] CI and Release workflow results recorded.
- [ ] Live site version/build checked after deployment.
- [x] Unsigned installer/updater position recorded; RA-2 signed 17 Nov 2026.
