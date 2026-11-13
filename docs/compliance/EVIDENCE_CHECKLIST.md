# Compliance Evidence Checklist — DRAFT

Keep dated evidence outside the public repository. Do not commit credentials, personal
budget data or identity documents.

## Governance

- [ ] Controller identity, address and privacy mailbox confirmed.
- [ ] ICO registration / data-protection fee position recorded.
- [ ] Privacy Policy, Terms and EULA reviewed by a UK solicitor.
- [ ] DPIA reviewed and signed with a review date.
- [ ] Retention schedule approved and reviewed annually.

## Processors and transfers

- [ ] Supabase DPA accepted or executed; security contact recorded.
- [ ] InfinityFree hosting terms and DPA position recorded.
- [ ] Google OAuth terms and data-processing position recorded.
- [ ] International transfer mechanism (SCC or UK IDTA) recorded for each processor.
- [ ] Processor register includes backup retention windows.

## Security controls

- [ ] Supabase RLS enabled and tested with two accounts.
- [ ] Service-role key never present in client code or public assets.
- [ ] TOTP MFA enabled and tested; recovery path documented.
- [ ] Passkey/WebAuthn settings recorded (RP ID and origins) after `OWNER_ACTIONS.md`.
- [ ] Account-deletion SQL applied and tested with a throwaway account.
- [ ] Pre-rotation conflict history purged and old backups removed.
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
- [ ] Any unsigned-installer risk accepted in writing.
