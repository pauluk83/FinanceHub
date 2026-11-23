# Email bill reminders — Resend delivery

Decided 2026-11-20: **Resend** is the provider for both auth mail and reminder
digests, and **Confirm email stays off**. The code is finished; delivery stays off
until the owner's Resend account and sender are in place.

## What is in place

- **Preferences** live in `dataset.settings.emailReminders`: address, digest
  time, bill and expiry channels, and an enabled flag. They are interface
  preferences, so they do not create budget-changelog entries.
- **The digest** is built by `core/reminders.ts` from the same derived
  notifications the Notifications screen shows. The subject carries only a date
  and a count; amounts and bill names stay in the body.
- **The message** is built by `reminderEmail()` in the same file and posted by
  `scripts/send-reminders.mjs` to `POST https://api.resend.com/emails`, with a
  `List-Unsubscribe: <mailto:…>` header so a mailbox offers one-click
  unsubscribe.
- **Suppression** is a local JSON list (`data/reminder-suppressions.json` by
  default, override with `FINANCEHUB_REMINDER_SUPPRESSIONS`). It is gitignored
  and not synced, so it must live outside the repository.
- **Dry run** is the default: without `RESEND_API_KEY` or `RESEND_FROM` the
  script prints the exact message and sends nothing.

## Owner steps (Resend + Supabase Auth)

1. Create the Resend account and add the sender domain or address.
2. Verify the sender: publish the SPF and DKIM records Resend shows and wait for
   the domain to read **Verified**. Deliverability is not real until both pass.
3. Supabase → **Authentication → Emails → SMTP settings**: enable custom SMTP
   with Resend's values (host `smtp.resend.com`, port `465`, username `resend`,
   password = the Resend API key, sender = the verified address).
4. Switch **Confirm email off** in the same page. It was left on by an earlier
   dashboard change; the decision is that it stays off.
5. Run the four auth mails once — signup, confirmation (with confirm email
   temporarily on), resend, password reset — and record the result in
   `docs/compliance/EVIDENCE_CHECKLIST.md`.
6. Run one real digest (below) and keep the Resend delivery id with the date.

## Daily run

On Windows, create a Task Scheduler task that runs daily at the chosen time:

```bat
set FINANCEHUB_BUDGET=D:\private\financehub-export.json
set RESEND_API_KEY=... (from the scheduler's protected environment)
set RESEND_FROM=FinanceHub <reminders@yourdomain>
node D:\finance\scripts\send-reminders.mjs
```

Use the app's JSON export for `FINANCEHUB_BUDGET`, or write the cloud
`settings.state_json.dataset` to a protected file from your own sync job. Do not
commit that file. A dry run needs only the budget:

```bash
node scripts/send-reminders.mjs --budget <dataset.json> --dry-run
```

Unsubscribe locally with:

```bash
node scripts/send-reminders.mjs --unsubscribe owner@example.com
```

An address on the suppression list is checked before anything is sent, so a
muted address stays muted even if the preference is still on.

## Gate before enabling

Do not turn delivery on until all of these are true:

- Resend is added to `docs/compliance/PROCESSOR_REGISTER.md` as **P5** (role,
  region, sub-processors, DPA, transfer basis, retention) and named in the
  privacy notice.
- The sender domain is verified and SPF/DKIM are passing.
- The unsubscribe route is reachable and tested with a real message.
- A test digest matches the in-app alerts, and the subject contains no amount or
  bill name.
- The owner has accepted that the budget file leaves the device to produce the
  digest; the app itself never uploads it for this feature.

This feature is not a compliance claim. It stays off until the list above is
signed off, and point 4 of `PLAN.md` records that decision.
