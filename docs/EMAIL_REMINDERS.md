# Email bill reminders — Resend delivery

Decided 2026-11-20: **Resend** is the provider for both auth mail and reminder
digests, and **Confirm email stays off**. **Configured and live for the owner on 23
November 2026** — see *What is live* below.

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

## What is live (23 November 2026)

- **Resend account:** pauluk83@gmail.com, no domain verified. The sender is
  therefore Resend's shared test address `onboarding@resend.dev`, which Resend
  only delivers to the account's own address; owner-only mail works, any other
  recipient needs a verified domain first.
- **Supabase custom SMTP:** enabled with sender `onboarding@resend.dev`, sender
  name `FinanceHub`, host `smtp.resend.com`, port `465`, username `resend` and a
  sending-only Resend API key as the password. Supabase stores that key
  encrypted; it is not in this repository, the app or any build.
- **Confirm email:** off (Authentication → Sign In / Providers), as decided.
- **Sign-in method:** the owner account uses **Google**, so signup, confirmation
  and resend mail are not on the login path. The auth path is proven instead by a
  real recovery email sent on 23 November 2026 that Resend's log shows as
  delivered and opened.
- **Digest:** a real send was delivered and opened on 23 November 2026 — subject
  “FinanceHub reminders — 10 items for 23 November 2026”, Resend id
  `01a2093e-e46c-7985-b8a8-63b5d9685416`.

## Remaining owner steps

1. Schedule the daily task below; nothing is emailed until it runs.
2. Put `RESEND_API_KEY` and `RESEND_FROM=FinanceHub <onboarding@resend.dev>` in
   the scheduler's protected environment, never in the repository.
3. Verify a domain in Resend before mailing any address other than
   pauluk83@gmail.com, then change the sender in both places.

## Daily run

On Windows, create a Task Scheduler task that runs daily at the chosen time:

```bat
set FINANCEHUB_BUDGET=D:\private\financehub-export.json
set RESEND_API_KEY=... (from the scheduler's protected environment)
set RESEND_FROM=FinanceHub <onboarding@resend.dev>
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

## Gate before widening delivery

Owner-only delivery is live. Do not add another recipient or a public support
address until all of these are true:

- Resend's entry in `docs/compliance/PROCESSOR_REGISTER.md` as **P5** is
  completed (region, sub-processors, DPA, transfer basis, retention) and Resend
  is named in the privacy notice.
- A sender domain is verified with SPF/DKIM passing.
- The unsubscribe route is reachable and tested with a real message.
- The owner has accepted that the budget file leaves the device to produce the
  digest; the app itself never uploads it for this feature.

This feature is not a compliance claim; the decision is recorded in
`docs/compliance/RISK_ACCEPTANCE_REGISTER.md` (RA-4, processor file and transfer basis).
