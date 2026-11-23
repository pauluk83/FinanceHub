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

- [~] Partial — provider facts gathered 17 Nov 2026. Supabase region `eu-west-1`, DPA v1/SCCs/UK Addendum/TIA, subprocessor list 12 Oct 2026, contacts and no Free-plan backups recorded. GitHub DPA recorded. Google Controller-Controller Terms recorded. Cloudflare's self-serve DPA is not yet accepted and filed, consumer Gmail has no DPA; C1 remains open.
- [x] Supabase DPA is incorporated into the Terms (v1, 1 Aug 2026) and no separate signature is required; TIA available; security contact recorded. **Free plan has no automatic backups.**
- [~] Partial — Cloudflare Pages replaced InfinityFree on 17 Nov 2026. Cloudflare publishes a self-serve DPA, a subprocessor list and SCCs; the DPA has not been accepted in the dashboard, and Pages log retention and the account's processing region are not yet recorded.
- [~] Partial — Google Controller-Controller Terms and UK Controller SCCs recorded; Google Sign-In is not a customer-DPA service. OAuth app is unverified with a 1/100 user cap.
- [~] Partial — Supabase, GitHub and Google have recorded transfer bases. Cloudflare's SCCs sit in its DPA, which is not yet accepted. Consumer Gmail has no transfer mechanism.
- [~] Partial — Supabase Free: no backups and 1-day logs (Pro: 7 days); GitHub/Google/Cloudflare publish no fixed processor retention window for this use.

## Security controls

- [~] Partial — owner attests 16 Nov 2026 that two-account sync isolation passed; no dated build artifact, so this is not closed. Two-device conflict still open.
- [x] Hosted sign-in verified end to end on the moved origin 17 Nov 2026: Google OAuth returned to `https://financehub-uk.pages.dev/`, the PKCE token exchange and `financehub_pull_changes` returned 200, the real budget loaded sync'd as the owner on build `8d87c3c46516`, and the console was clean. This is a single-account live check, not the two-account isolation test.
- [x] Email delivery configured 23 Nov 2026: Supabase custom SMTP through Resend (sender `onboarding@resend.dev`, `smtp.resend.com:465`, sending-only key), Confirm email off, a recovery email and a reminder digest both delivered and opened per Resend's log (digest id `01a2093e-e46c-7985-b8a8-63b5d9685416`). The owner account signs in with Google, so signup/confirmation/resend mail is not exercised; the shared test sender delivers only to pauluk83@gmail.com until a domain is verified.
- [ ] Service-role key never present in client code or public assets.
- [x] TOTP setup removed from Settings; passkeys are the in-app second-factor option. Existing identity-provider factors are outside FinanceHub's UI.
- [~] Partial — passkey settings re-pointed and saved on 17 November 2026 (Supabase confirmed "Passkey settings updated successfully"): display name `FinanceHub`, RP ID `financehub-uk.pages.dev`, origin `https://financehub-uk.pages.dev`. Site URL and redirect allow-list were re-pointed the same day. Existing passkeys cannot be used on the new origin, so they need re-enrolment; a real enrolment/sign-in ceremony remains untested.
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
