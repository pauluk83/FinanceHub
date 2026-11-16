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
- [ ] Risk acceptance register (`RISK_ACCEPTANCE_REGISTER.md`) signed for cloud-at-rest and unsigned installer.

## Processors and transfers

- [ ] Processor register (`PROCESSOR_REGISTER.md`) completed: region, sub-processors, DPA, transfer mechanism, retention and security contact for every provider.
- [ ] Supabase DPA accepted or executed; security contact recorded.
- [ ] InfinityFree hosting terms and DPA position recorded.
- [ ] Google OAuth terms and data-processing position recorded.
- [ ] International transfer mechanism (SCC or UK IDTA) recorded for each processor.
- [ ] Processor register includes backup retention windows.

## Security controls

- [~] Partial — owner attests 16 Nov 2026 that two-account sync isolation passed; no dated build artifact, so this is not closed. Two-device conflict still open.
- [~] Partial — client email-verification gate implemented; Supabase Confirm email setting and live signup/resend test pending.
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
- [~] Unsigned installer/updater position recorded; `RISK_ACCEPTANCE_REGISTER.md` signature pending.
