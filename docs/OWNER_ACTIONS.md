# Owner actions — cloud security and privacy

These are the steps that need Supabase dashboard, mailbox or legal access. Do them in
this order. They are not performed by the app build.

## 1. Purge the pre-rotation conflict history — COMPLETED 13 NOVEMBER 2026

1. Sign in as the owner at https://financehub-uk.pages.dev/.
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

**Configured 13 November 2026**, then re-pointed on 17 November 2026 when the hosted
site moved to Cloudflare Pages. Passkey authentication is on with display name
`FinanceHub`, RP ID `financehub-uk.pages.dev` and origin `https://financehub-uk.pages.dev`.
**Existing passkeys were registered against `financehub.freedev.app` and cannot be used
on the new origin; delete them in the authenticator and enrol again.** In-app passkey
controls are delivered in Account security and on the hosted login page. A real
enrolment and sign-in has not been run because it needs a supported browser and an
actual authenticator.

1. Open **Supabase → Authentication → Passkeys**.
2. Turn on **Enable Passkey authentication**.
3. Set the relying party values:
   - **Relying Party Display Name:** `FinanceHub`
   - **Relying Party ID:** `financehub-uk.pages.dev` (bare host; no scheme, port or path)
   - **Relying Party Origins:** `https://financehub-uk.pages.dev`
   - For local development only, add the Vite/localhost origin shown in your Supabase
     project settings if you test passkeys there.
4. Save. Keep the RP ID stable: changing it makes every existing passkey unusable.
5. **Done 17 November 2026.** Site URL is `https://financehub-uk.pages.dev/`. The redirect
   allow-list holds `https://financehub-uk.pages.dev/`,
   `https://financehub-uk.pages.dev/**`, `http://localhost:5173/**` and the desktop
   callback `http://127.0.0.1:53682/auth/callback`; the two `financehub.freedev.app`
   entries were removed. The `/**` rule covers `/bank-callback` and the 308 from
   `/bank-callback.html`.
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
   (Controller-Controller Terms/UK Controller SCCs) are recorded. **Consumer Gmail has no
   transfer mechanism**; move it or record a signed risk acceptance with a transfer
   assessment. Cloudflare's transfer position is recorded with its DPA.
6. Cloudflare Pages replaced InfinityFree on 17 November 2026. Accept the self-serve
   Cloudflare DPA in the dashboard (Account → DPA), record the account jurisdiction and
   the access-log retention setting, and revalidate Cloudflare's published subprocessor
   list. InfinityFree is no longer used and its entry can be retired from the processor
   register once the old account is closed.
7. Supabase backups: the Free plan has **no automatic database backups** and only 1-day
   logs. Upgrade to Pro (7-day daily backups and 7-day logs) or schedule regular manual
   exports to an off-site location, and record the decision.
8. Supabase Auth email: custom SMTP is currently **disabled**, so delivery uses the
   non-production default service (2 messages/hour). **Resend** is the chosen provider
   (decided 20 November 2026) for both auth mail and reminder digests: enable custom SMTP
   with host `smtp.resend.com`, port `465`, username `resend`, the Resend API key as the
   password, and a verified sender. Switch **Confirm email off** in the same page — the
   dashboard currently has it on, contrary to the recorded decision. Then run signup,
   confirmation (with it temporarily on), resend and password reset once and record the
   result. See `docs/EMAIL_REMINDERS.md`.
9. Google OAuth: branding is populated (app name, home page, privacy policy, Terms and
   authorised domains), but the app is still unverified and shows a 1-of-100 user cap.
   Complete Google verification before relying on public Google sign-in.
10. Ask a UK solicitor to review the Privacy Policy, Terms, EULA and the drafts in
    `docs/compliance/`.

## 5. Open Banking — Enable Banking (owner only)

Open Banking is a regulated account-information service. FinanceHub uses **Enable Banking**
(a Finnish AISP authorised by the FIN-FSA) in its free **restricted production** mode, which
returns only accounts the owner links. FinanceHub holds no AISP authorisation, does not
initiate payments and does not offer bank linking to other people. Public or third-party use
still needs the provider contract, KYB and the G1–G5 gate.

1. Create a free account at https://enablebanking.com and open the Control Panel.
2. **API applications → new application**, environment **Production**, keep “generate the
   private key in the browser”, and add the redirect URL
   `https://financehub-uk.pages.dev/bank-callback.html` exactly. Update the redirect URL in
   the existing application if it still names the old host. Copy the application ID and
   keep the downloaded `<application-id>.pem` private — never in the repo, chat or a screenshot.
3. Activate the application with **Activate by linking accounts** and complete the bank's
   consent for each account you want. Only linked accounts are returned by the API.
4. In FinanceHub open **Import → Open Banking (other banks)**, paste the application ID and
   private key, then choose **Save connection**. Both are stored only in the Windows
   DPAPI-backed secure store, never in the budget, backups or cloud sync.
5. Choose **Load banks**, pick a bank and choose **Connect in browser**. Finish the bank's
   consent; the panel updates when the browser returns to FinanceHub. Repeat per bank.
6. Choose the linked account and **Fetch booked transactions**, then review and add rows in
   the grid. Nothing is posted automatically.
7. Consent expires on the date shown; connect the bank again when it lapses. Enable Banking
   shows and revokes active consents at https://enablebanking.com/data-sharing-consents/.
8. **Forget connection** removes the key and linked-account list from FinanceHub. Revoke the
   consent separately in Enable Banking if you want to invalidate it.
9. Keep this feature owner-only and make no **FCA-approved** or **bank-level security** claim.
   Do not extend it to anyone else without completing G1–G5.

## 6. Starling personal feed (owner only)

This is the working desktop bank feed. It is **not** Open Banking and is not offered to
anyone else.

1. Open https://developer.starlingbank.com/personal in a browser and sign in with the
   Starling developer account linked to your own Starling account.
2. Create a personal access token with at least `account:read` and `transaction:read`.
   Treat it like a password; do not paste it into chat, a file or a screenshot.
3. In FinanceHub, open **Import → Starling personal feed**, paste the token and choose
   **Save token**. It is stored in the Windows DPAPI-backed secure store, not in the budget,
   a backup or cloud sync.
4. Choose **Refresh accounts**, select the GBP account and choose **Fetch settled transactions**.
   Review the rows in the grid; nothing is added until you press **Add to log**.
5. To disconnect, choose **Forget token** in FinanceHub and revoke the token in the Starling
   developer portal. Forgetting the local copy alone does not invalidate it at Starling.
6. Keep this feature owner-only. Do not call it Open Banking, do not give the token to
   another person, and use the separate Enable Banking feed above for other banks.

## 7. Evidence to keep

Keep dated screenshots or exports for: the purge result, any dated repeat of the deletion/export test, the passkey
settings page, the email-confirmation/resend test, the Supabase DPA/TIA references, the
backup decision, the Google verification record, the ICO position, the retention schedule
review and the breach-contact test. See `docs/compliance/EVIDENCE_CHECKLIST.md`.

## 8. Email delivery — Resend (blocks `PLAN.md` point 2)

The sender and the digest are built and tested; only the account and dashboard are missing.

1. Create the Resend account and add the sender domain or address.
2. Publish the SPF and DKIM records Resend shows and wait for the domain to read
   **Verified**. Do not enable reminder delivery before both pass.
3. Supabase → **Authentication → Emails → SMTP settings**: enable custom SMTP with
   `smtp.resend.com`, port `465`, username `resend`, the Resend API key as the password,
   and the verified sender.
4. Switch **Confirm email off**.
5. Run the four auth mails once (signup, confirmation with it temporarily on, resend,
   password reset) and record the result.
6. Put `RESEND_API_KEY` and `RESEND_FROM` in the scheduler's protected environment and run
   `node scripts/send-reminders.mjs --budget <export.json>` for one real digest. Keep the
   Resend delivery id and the date as evidence.
7. Add Resend as **P5** in `docs/compliance/PROCESSOR_REGISTER.md` (role, region,
   sub-processors, DPA, transfer basis, retention) and name it in the privacy notice.

Never put the key in the app, a build, a committed `.env` or a chat message.

## 9. Web push — Edge Function (blocks `PLAN.md` point 3)

The subscription UI, service worker, sender and tables are built and tested. Nothing has
been delivered to a real device, because deployment needs the CLI session.

1. Supabase → SQL Editor → run all of
   `db/migrations/postgres/0006_push_subscriptions.sql` (safe to re-run).
2. `npx supabase login` (browser OAuth; the session is stored outside the repository).
3. Set the three secrets from `tmp/vapid-keys.json` without printing the private key — the
   exact command is in `docs/PUSH.md`.
4. `npx supabase functions deploy send-push --project-ref fzkkgbatmmgasfmgvrzp`.
5. On <https://financehub-uk.pages.dev/> → **Notifications**, turn on push, send a test,
   confirm one push per alert, then turn it off and confirm nothing arrives.
6. Check `push_deliveries` holds only `user_id`, `alert_id` and `sent_on` — no title,
   detail or amount.
7. Record the subscription table and the Edge Function in the processor register (Supabase,
   P1) and the DPIA data map before relying on push beyond private use.
