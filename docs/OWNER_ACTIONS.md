# Owner actions — cloud security and privacy

These are the steps that need Supabase dashboard, mailbox or legal access. Do them in
this order. They are not performed by the app build.

## 1. Purge the pre-rotation conflict history — COMPLETED 13 NOVEMBER 2026

1. Sign in as the owner at https://financehub.freedev.app/.
2. Open **Settings → Sync conflicts**.
3. Select **Purge conflict history** and confirm.
4. Check the page reports no conflicts.
5. Delete any old backup files downloaded before the provider-password rotation.
6. Keep only backups created after the rotation and store them encrypted.

The purge removes local and cloud conflict snapshots only; budget records are not changed.
The owner confirmed this step and the old backup-file removal on 13 November 2026.

## 2. Apply the account-deletion SQL — COMPLETED 13 NOVEMBER 2026

The app already has **Settings → Account security → Delete cloud account permanently**.
It calls the `delete_my_account` RPC. The function is defined in
`db/migrations/postgres/0003_account_deletion.sql` and is not applied automatically.

**Applied and verified 13 November 2026.** The function exists as `SECURITY DEFINER`,
owned by `postgres`, and `anon` has no execute privilege; only `authenticated` does.
The function still refuses calls when `auth.uid()` is null.

1. Open **Supabase → SQL Editor** for the FinanceHub project.
2. Run the whole of `db/migrations/postgres/0003_account_deletion.sql` once. It is
   written with `create or replace`, so re-running it is safe.
3. Verify the function and its grants:

```sql
select
  p.proname,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner,
  p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_my_account';
```

4. **Owner-attested 16 Nov 2026 — throwaway-account, deletion and export drills.** The owner attests that two-account sync, account deletion and export drills completed with no real data. No dated build artifact was filed; re-run with the release build/date and screenshots if counsel requires independent evidence. The deletion checks remain: the app signs out, signing in again creates a fresh account, and the old `auth.users` row and cascaded public rows are gone.
5. Never run this function with the service-role key, and never expose a service-role key
   in the web bundle.

The function deletes `auth.users` for `auth.uid()`; every public table references
`auth.users(id) on delete cascade`, so the account and its rows are removed together.
A local workspace copy and exported files are outside this deletion and must be removed
separately by the owner.

## 3. Enable passkeys / WebAuthn in Supabase — COMPLETED 13 NOVEMBER 2026

Passkey support is a Supabase beta feature. Enabling it configures the backend; this
build does not yet show passkey enrolment or sign-in controls, so users will not see a
passkey option until that UI is added.

**Configured 13 November 2026.** Passkey authentication is on with display name
`FinanceHub`, RP ID `financehub.freedev.app` and origin `https://financehub.freedev.app`.
The page was reloaded after saving to confirm the values persisted. In-app passkey
controls are now delivered in Account security and on the hosted login page. A real
enrolment and sign-in has not been run because it needs a supported browser and an
actual authenticator.

1. Open **Supabase → Authentication → Passkeys**.
2. Turn on **Enable Passkey authentication**.
3. Set the relying party values:
   - **Relying Party Display Name:** `FinanceHub`
   - **Relying Party ID:** `financehub.freedev.app` (bare host; no scheme, port or path)
   - **Relying Party Origins:** `https://financehub.freedev.app`
   - For local development only, add the Vite/localhost origin shown in your Supabase
     project settings if you test passkeys there.
4. Save. Keep the RP ID stable: changing it makes every existing passkey unusable.
5. Confirm the project's Site URL and redirect URLs include
   `https://financehub.freedev.app/`. Confirmed 13 November 2026: the Site URL is
   `https://financehub.freedev.app/` and the redirect list includes
   `https://financehub.freedev.app/`, `https://financehub.freedev.app/**`,
   `http://localhost:5173/**` and the desktop callback.
6. Recorded in `docs/compliance/EVIDENCE_CHECKLIST.md`. Do not enable passkeys as a
   required factor until enrolment and sign-in have been tested and account recovery is confirmed.

## 4. Privacy and processor actions

1. Adopt the existing privacy/support mailbox `financehub+pauluk83@gmail.com` (Gmail). Restrict access, confirm retention, and replace it with dedicated addresses if it becomes a shared support route. **Consumer Gmail has no DPA**; either move the mailbox to a provider that offers one or record a signed risk acceptance. Do not publish it as a formal security route until this is resolved.
2. Put the real contact address into the published Privacy Policy and Terms after legal
   review; the draft in `docs/compliance/` contains a placeholder.
3. Confirm the ICO registration and data-protection fee position for the controller.
4. Supabase DPA: no separate signature is needed. Version 1 (1 August 2026) is incorporated
   into the Terms and covers the EU SCCs and UK Addendum. Download the TIA from the
   organisation's Legal Documents page and file it privately with the DPA reference.
5. Transfers: Supabase (UK Addendum/SCCs), GitHub (UK Addendum/DPF) and Google
   (Controller-Controller Terms/UK Controller SCCs) are recorded. **InfinityFree and
   consumer Gmail have no transfer mechanism**; move them or record a signed risk
   acceptance with a transfer assessment.
6. InfinityFree: it provides no DPA. Obtain written processor terms or move the static site
   to a provider that offers a DPA. If it stays, revalidate iFastNet's 2018 third-party
   processor list and record the hosting location.
7. Supabase backups: the Free plan has **no automatic database backups** and only 1-day
   logs. Upgrade to Pro (7-day daily backups and 7-day logs) or schedule regular manual
   exports to an off-site location, and record the decision.
8. Supabase Auth email: custom SMTP is currently **disabled**, so delivery uses the
   non-production default service (2 messages/hour). Configure a named production SMTP
   provider, then test signup, confirmation, resend and sign-in and record the result.
   **Confirm email is currently enabled** in the dashboard, despite the earlier recorded
   decision that it was deliberately off; confirm which state is intended.
9. Google OAuth: branding is populated (app name, home page, privacy policy, Terms and
   authorised domains), but the app is still unverified and shows a 1-of-100 user cap.
   Complete Google verification before relying on public Google sign-in.
10. Ask a UK solicitor to review the Privacy Policy, Terms, EULA and the drafts in
    `docs/compliance/`.

## 5. Open Banking — before any provider signup

Open Banking is a regulated account-information service, not a normal API integration.
The plan's G1 gate must pass before a provider account, sandbox credential, contract or
real bank data is used. No provider has been contacted or selected.

1. Decide the scope: **read-only account and transaction import**, with no payment
   initiation, no card data and no stored bank credentials. The existing CSV import stays
   available as the fallback.
2. Decide whether this is for your own use only or for public users. Public use requires
   a business/legal entity and a principal-agent or direct-registration route; provider
   production access is generally business-only.
3. Reverse or narrow decision 11 in `PLAN.md`. It currently records **no external legal
   review**, but OB-1 requires UK financial-services counsel and OB-2 requires privacy
   counsel. Open Banking cannot start while decision 11 stands.
4. Appoint UK fintech counsel to write the OB-1 memo. The plan recommends testing the
   **registered agent of an FCA-authorised AISP** model first, with direct RAISP
   registration as the alternative. Ask counsel to confirm the classification, agent
   registration, professional indemnity insurance, complaints/FOS, Consumer Duty and
   consent requirements.
5. Treat **Finexer** as the first due-diligence candidate, not a selection. Its FCA
   authorisation is FRN 925695 for AIS/PIS; its advertised model includes an agent route
   and a self-serve sandbox. Obtain its security certifications, sub-processors, data
   residency, SLA, insurance, incident terms, exit plan and production pricing before G3.
   TrueLayer, Yapily, Plaid and Tink are alternatives; TrueLayer production is not
   available to personal/hobby projects.
6. Only after G1 and G2 pass: create the sandbox account, approve the DPIA addendum and
   privacy notice, and build against mock data. Do not connect a real bank account until
   G3 and G4 pass and the independent security review is complete.
7. Keep the **Secure bank linking** panel labelled **Planned** and make no Open Banking,
   FCA-approved or bank-level-security claim until the C-4 gate is cleared.

## 6. Evidence to keep

Keep dated screenshots or exports for: the purge result, any dated repeat of the deletion/export test, the passkey
settings page, the email-confirmation/resend test, the Supabase DPA/TIA references, the
backup decision, the Google verification record, the ICO position, the retention schedule
review and the breach-contact test. See `docs/compliance/EVIDENCE_CHECKLIST.md`.
