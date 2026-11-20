# Step 8 setup — the one owner sitting

Status 2026-11-19: **the Supabase side is done.** Only the email account is left for you;
everything else below is already in place or is code work that needs no credentials.

## Done for you (project `fzkkgbatmmgasfmgvrzp`)

- Bucket **`financehub-backups`** created, **private**, 50 MB per file, any MIME type.
- Four policies on `storage.objects` — select, insert, update, delete — each allowing
  `authenticated` only when the first path segment equals `auth.uid()`:
  `<user-id>/financehub-backup-<timestamp>.json`. Verified in Storage → Files: the bucket
  reports **4 policies**.
- The same SQL is recorded in `db/migrations/postgres/0004_backup_storage.sql`, so it can be
  re-applied or reviewed later. It is idempotent (`drop policy if exists`, `on conflict`).
- Web-push VAPID key pair generated locally at `tmp/vapid-keys.json` (gitignored). The
  public key goes into the app when push is wired; the private key becomes a server-side
  secret then. Do not commit it or paste it anywhere.

## Your one remaining account step — transactional email (~10 minutes)

1. Create an account with an SMTP-capable provider — **Resend** (free tier, SMTP on
   `smtp.resend.com:465`, username `resend`, password = API key) or Brevo/Postmark if you
   prefer. Verify the sending domain or address.
2. Supabase → **Authentication → Emails → SMTP settings**: enable custom SMTP with the host,
   port 465, the username above, the API key as password, and a sender such as
   `no-reply@yourdomain`.
3. Send a test email, then run **signup → confirmation → resend → password reset** once.
4. Decide the **“Confirm email”** setting. It is currently **on**, while §24 decision 7
   records it was deliberately left off; pick one and record the date. The client gate stays
   either way.
5. Record the result in `docs/compliance/EVIDENCE_CHECKLIST.md`.

The API key lives only in Supabase's SMTP settings. It is never needed in this repository,
the Windows app or the browser.

## Keys that need no action

| Key | Where it lives | Why nothing to do |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, publishable key | `app/publicSupabase.ts` (public) | Already compiled into every build |
| Service-role key | nowhere | Backups upload with the user's own JWT; the bucket policies above authorise it. A service key in the client would be a breach, so it is deliberately unused |
| Backup bucket name | code (step 8 wiring) | Fixed as `financehub-backups` |
| VAPID pair | `tmp/vapid-keys.json` locally | Generated; used when push lands |

## Not applicable yet — nothing to run

There is **no pending SQL** for device/session management: that table does not exist in
`db/migrations/postgres/` yet. It arrives as a reviewed migration with the point 1 code, not
as a setup step. Running speculative DDL now would create schema nothing reads.

## Verification already done

- Storage → Files lists `financehub-backups`, private, 4 policies.
- SQL editor run returned `Success. No rows returned`.
- A second query attempt to list policies was blocked by the dashboard's own
  destructive-query dialog; the policy count in Storage is the authoritative confirmation.

## After this sitting (unattended, no credentials)

1. ~~Wire the R17 upload UI~~ **Done and verified live 2026-11-20:** `core/cloudBackup.ts` and
   `app/src/cloudBackup.ts` write `<user-id>/financehub-backup-<timestamp>.json`, list and
   prune to seven, and Tools → Settings → Data has Upload, Restore and Remove. From the
   signed-in hosted app the upload stored a 577,654-byte v2 envelope under
   `31c12d42…/financehub-backup-2026-11-20T22-30-52-997Z.json` with no plaintext budget keys,
   and Remove emptied it. An anonymous upload and a write to another user's folder are both
   refused by RLS. A second account and a UI restore are still untested.
2. Device/session list with revoke.
3. Service-worker web push and reminder delivery behind the privacy gate.
4. Prove signed-out uploads are refused and two accounts cannot read each other's folder.
