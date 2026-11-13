# Privacy Notice — DRAFT FOR REVIEW

This is a working draft, not the published notice. The in-app Privacy Policy remains the
current published text until this draft is reviewed and replaces it.

## Who is responsible

Zane Stanton, an individual based in England, is the data controller for FinanceHub.
Contact: **[privacy mailbox to be created]**.

## What we collect

- Account details: email address, authentication identifiers and MFA factors.
- Budget records you enter: accounts, balances, bills, income, cards, debts, savings,
  holidays, transactions, provider details and notes.
- Optional provider logins you choose to save. These are encrypted on your device with a
  passphrase that is never sent to us or stored.
- Local technical data needed to run the app: browser storage, app-lock settings and
  backup metadata.
- If you use Google sign-in, Google authenticates you and returns an identifier and email
  address. We do not receive your Google password.

We do not collect bank credentials, card numbers, payment data or advertising profiles.
We do not use analytics or a third-party crash reporter.

## Why we use it and lawful bases

| Purpose | Lawful basis |
| --- | --- |
| Provide the budgeting service you request | Contract / steps at your request |
| Sync your budget across your devices when you sign in | Contract |
| Secure the service, prevent abuse and investigate faults | Legitimate interests in operating a safe service |
| Comply with legal obligations and respond to rights requests | Legal obligation |
| Optional provider credentials | Consent, which you can withdraw by deleting the vault |

## Who receives it

- **Supabase** hosts authentication and the synced budget database.
- **Google** handles sign-in only if you choose Google.
- **InfinityFree** serves the static website.
- Professional advisers, regulators or law enforcement only where required by law.

We do not sell personal data. We do not share it for advertising.

## International transfers

Some processors may process data outside the UK. Where required, we rely on the UK
International Data Transfer Addendum or Standard Contractual Clauses and recorded
processor terms. The current processor register is maintained with the compliance
evidence.

## How long we keep it

- Cloud budget and account: until you delete the account or ask us to delete it.
- Local device copy: until you reset it or remove the app data.
- Encrypted restore points: the newest seven; automatic points are created daily.
- Sync conflicts: at most 25, with at most two full snapshot pairs; purge available.
- Support bundle: only as long as needed to resolve the support request.
- Backups held by a processor: according to the processor's documented schedule, which
  must be confirmed in the processor register.

See `RETENTION_SCHEDULE.md` for the working schedule.

## Your rights

You can ask for access, correction, deletion, restriction, portability or objection, and
you can withdraw consent for optional processing. The app provides JSON/CSV export,
encrypted backup and self-serve cloud account deletion. Local copies and exported files
are outside cloud deletion and must be removed separately.

We aim to respond within one month. We may need to verify your identity. You can complain
to the Information Commissioner's Office (ICO) at https://ico.org.uk/.

## Security

We use HTTPS, Supabase row-level security, PKCE authentication, optional TOTP MFA,
client-side encryption for saved provider logins, OS-backed secure storage for desktop
sessions and encrypted backups. No system is completely secure; keep your device and
passwords protected and keep an independent backup.

## Changes

We will date material changes and, where appropriate, ask you to review them before they
take effect.
