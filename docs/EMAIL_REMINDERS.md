# Email bill reminders — setup and gate

Email reminders are **built but disabled**. The app stores preferences and builds
the digest, and the sender refuses to send without a server-side key. In-app
alerts work without any of this.

## What is in place

- **Preferences** live in `dataset.settings.emailReminders`: address, digest
  time, bill and expiry channels, and an enabled flag. They are interface
  preferences, so they do not create budget-changelog entries.
- **The digest** is built by `core/reminders.ts` from the same derived
  notifications the Notifications screen shows. The subject carries only a date
  and a count; amounts and bill names stay in the body.
- **The sender** is `scripts/send-reminders.mjs`. It reads a budget JSON file
  from `FINANCEHUB_BUDGET`/`--budget`, recomputes with `core/engine.ts`, and
  either prints a dry run or triggers a Knock workflow.
- **Suppression** is a local JSON list (`data/reminder-suppressions.json` by
  default, override with `FINANCEHUB_REMINDER_SUPPRESSIONS`). It is not synced
  and must be stored outside the repository.

## Provider

The chosen provider is **Knock** (server-side workflow API). Knock delivers
email through an email provider you connect in its dashboard, so two accounts
are involved:

1. Create a Knock project and workflow key `bill-reminder-digest`.
2. Add an email step and connect your own email provider (for example the
   provider already used for Supabase auth mail).
3. Set `KNOCK_API_KEY` where the daily job runs. Never put it in the app, a
   build, `.env` committed to git, or a chat message.
4. Verify the sender domain before enabling the channel.

The workflow receives `subject`, `text`, `html` and a `reminders` array. It
must render the HTML or text and include an unsubscribe link or instruction.

## Daily run

On Windows, create a Task Scheduler task that runs daily at the chosen time:

```bat
set FINANCEHUB_BUDGET=D:\private\financehub-export.json
set KNOCK_API_KEY=... (from the scheduler's protected environment)
node D:\finance\scripts\send-reminders.mjs
```

Use the app's JSON export for `FINANCEHUB_BUDGET`, or write the cloud
`settings.state_json.dataset` to a protected file from your own sync job. Do
not commit that file. A dry run is the default without a key:

```bash
node scripts/send-reminders.mjs --budget <dataset.json> --dry-run
```

Unsubscribe locally with:

```bash
node scripts/send-reminders.mjs --unsubscribe owner@example.com
```

## Gate before enabling

Do not enable delivery until all of these are true:

- The email provider and Knock are added to the processor register and the
  privacy notice, with retention and region confirmed.
- The sender domain is verified and SPF/DKIM are passing.
- The unsubscribe route is reachable and tested with a real message.
- A test digest matches the in-app alerts, and the subject contains no amount
  or bill name.
- The owner has accepted that the budget file leaves the device to produce the
  digest; the app itself never uploads it for this feature.

This feature is not a compliance claim. It stays off until the checklist above
is signed off.
