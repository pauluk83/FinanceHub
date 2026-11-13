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

4. **Still pending — throwaway-account test.** In a private window, create a throwaway account with no real data, sign in, and use
   **Delete cloud account permanently**. Confirm:
   - the app signs out;
   - signing in again creates a fresh account;
   - the old `auth.users` row and its cascaded public rows are gone.
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

1. Create a dedicated privacy/support mailbox (for example `privacy@` and `support@`).
2. Put the real contact address into the published Privacy Policy and Terms after legal
   review; the draft in `docs/compliance/` contains a placeholder.
3. Confirm the ICO registration and data-protection fee position for the controller.
4. Accept or execute the Supabase DPA and the hosting provider's data-processing terms.
5. Record the UK international-transfer mechanism (SCC or UK IDTA) for each processor.
6. Ask a UK solicitor to review the Privacy Policy, Terms, EULA and the drafts in
   `docs/compliance/`.

## 5. Evidence to keep

Keep dated screenshots or exports for: the purge result, the deletion test, the passkey
settings page, the DPA acceptance, the ICO position, the retention schedule review and
the breach-contact test. See `docs/compliance/EVIDENCE_CHECKLIST.md`.
