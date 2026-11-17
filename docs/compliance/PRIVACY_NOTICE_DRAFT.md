# Privacy Notice — DRAFT FOR REVIEW

> **Publication gate:** do not publish this notice while any `[TO CONFIRM]` remains. It is
> a working draft for PR-1 review, not the current published policy. The in-app Privacy
> Policy remains the current published text until this draft is approved and replaces it.

**Controller:** Zane Stanton, an individual based in England.

**Contact:** `financehub+pauluk83@gmail.com`

**Last updated:** 16 November 2026 (draft).

---

## 1. Who we are and what this notice covers

FinanceHub is a personal and household budgeting app. It is available as a Windows
desktop app and a hosted web app. In the Windows app you can use a workspace only on your
device, or sign in to sync a cloud copy.

This notice explains what personal data FinanceHub processes, why, where it goes, how long
it is kept and what rights you have. It covers the app, the hosted site, optional account
and sync, the people portal, feedback, support bundles and update checks.

FinanceHub is offered to users in the UK only at launch. It is not directed at users in
other markets. The hosted web app opens your own synced budget in the browser once you sign
in with a confirmed email, and also offers a synthetic demo you can explore without an
account. Browser storage on the hosted site is not encrypted by FinanceHub.

FinanceHub is intended for adults aged 18 or over. It is not a bank, lender, financial
adviser or payment service. It does not connect to your bank, move money, store card
numbers or provide financial advice.

---

## 2. What we collect

### Account and sign-in data

- Email address and Supabase user ID.
- Authentication-provider identifiers if you choose Google sign-in, and passkey
  credential data if you register a passkey on the hosted site.
- Session tokens and sign-in metadata needed to keep you signed in.
- Password material is handled by Supabase Auth. FinanceHub does not receive or store
  your password or Google password.
- At public launch, cloud sync is available from the Windows app and requires a verified
  email address. You can still use a local workspace without syncing.

Passkeys are available on the hosted account pages only. The Windows app uses
email/password or Google sign-in; the packaged window cannot use WebAuthn. Hosted passkeys
do not load a real budget.

### Budget records you enter

- Accounts, balances, bills, income, cards, debts, savings and holidays.
- Transactions, dates, amounts, comments, categories, tags, statuses and running balances.
- Provider details, account references, contract figures and portal links.
- Month-end locks, changelog entries, audit history and settings.
- Names and balances for people in your budget, including people who never use the app.

### Optional provider logins

If you choose to save logins for provider websites, the username, password, charge-letter
password and access-bill value are encrypted on your device with a passphrase you choose.
The passphrase is never stored or sent to us. Only the encrypted vault is placed in the
synced budget. If you forget the passphrase, the saved logins cannot be recovered.

### People portal

If you create a read-only statement sign-in for a person in your budget, we process:

- that person’s name and the statement snapshot (dates, descriptions, amounts, balances);
- the portal username, a salted password hash and technical timestamps.

The portal record is stored only in your device’s browser storage. It is **not synced to
the cloud**. Anyone who can use your device profile may be able to read the portal records,
so use a trusted device and delete portal access when it is no longer needed.

### Feedback

If you or a portal user sends feedback, we process the author name, message, source and
created/read timestamps. Feedback is stored only in the device’s browser storage, is not
synced to the cloud, and is capped at 100 messages per owner. Do not include another
person’s sensitive information unless it is necessary.

### Support bundles

The **Data health** screen can generate a support bundle when you choose to download it.
It contains:

- app version, build and build date;
- browser user agent, platform, language and online status;
- dataset counts and health-check identifiers/severity;
- sync conflict count and backup timestamps.

It does **not** contain names, transaction amounts, comments, provider credentials,
session tokens or raw health messages. It is generated locally and is not uploaded
automatically. If you send it to support, it will be handled under this notice.

### Technical and security data

- IP address, request time, requested path and error/security events in processor logs.
- Device ID, sync revision/cursor and conflict metadata used to keep devices consistent.
- When the app checks for an update, GitHub receives your IP address, user agent and
  request metadata. FinanceHub does not send your account ID, budget, credentials or
  transaction data to GitHub.

### Backups and restore points

The app can create encrypted restore points on your device (the newest seven are kept) and
can export a backup to a location you choose. A plain JSON export contains your budget but
excludes provider credential fields. An encrypted export requires your backup passphrase.
You control where exported files go and who can access them.

---

## 3. What we do not collect

- Bank account credentials or Open Banking connections. FinanceHub does not currently
  connect to banks.
- Card numbers, payment credentials or money-transmission data.
- Advertising profiles, third-party analytics or crash-reporting payloads.
- Your Google password.
- Your vault passphrase.

The optional provider logins described above are website logins you choose to save. They
are not bank credentials and are not used to connect to a bank.

Do not send identity documents or full bank statements to support unless we specifically
ask for a proportionate extract.

---

## 4. Why we use your data and our lawful bases

| Purpose | Data | Lawful basis |
| --- | --- | --- |
| Provide the budget, statements, calculations and exports you request | Account, budget records, people, providers, backups | Contract, or steps at your request before a contract |
| Sync your workspace across your devices | Full budget document, sync metadata, session | Contract |
| Authenticate you and keep the service secure | Account identifiers, passkeys, sessions, logs | Contract; legitimate interests in operating a safe service |
| Store optional provider logins | Encrypted vault, optional hint | Consent, which you withdraw by deleting the vault. We are reviewing whether contract is more appropriate for this feature. |
| Provide a read-only people statement | Person name, statement snapshot, portal username and password hash | Contract with the budget owner; legitimate interests or contract for the named person. We are confirming the position with counsel. |
| Receive and manage feedback | Author, message, timestamps | Legitimate interests in improving the service; consent where required. We are confirming the position with counsel. |
| Diagnose faults and prevent abuse | Support bundle, logs, device/sync metadata | Legitimate interests in operating a safe and reliable service |
| Meet legal obligations and respond to rights requests | Account and processing records | Legal obligation |
| Defend legal claims | Relevant records | Legitimate interests or legal obligation, as applicable |

Where we rely on legitimate interests, we carry out a balancing assessment and keep it
with the DPIA evidence. Where we rely on consent, you can withdraw it at any time by
deleting the optional feature; withdrawal does not affect processing carried out before
withdrawal.

We do not use your data for automated decision-making or profiling that produces legal or
similarly significant effects.

---

## 5. Who receives your data

We use service providers to run FinanceHub. They may only process data for the purposes
we specify, under their terms and any data-processing agreement.

| Recipient | What they receive | Why |
| --- | --- | --- |
| **Supabase** | Account identifiers, authentication data, synced budget document, sync metadata, conflict metadata, logs | Authentication, database, row-level security and realtime sync |
| **Google** | Google identity, email address and OAuth consent data, only if you choose Google sign-in | Sign-in |
| **InfinityFree** | Static website requests and access logs; no budget data should be deployed there | Hosting the web app |
| **GitHub / Microsoft** | IP address, user agent and request metadata when checking for or downloading an update; no budget or account data | Release downloads and app updates |
| **Email delivery provider used by Supabase** | Email address and verification/reset message metadata | Account verification and password-reset email; provider to be confirmed |
| **Privacy/support mailbox provider** | Whatever you send to the published contact address | Responding to support and rights requests; existing Gmail mailbox `financehub+pauluk83@gmail.com` |
| **Professional advisers, security reviewers and penetration testers** | Documents and evidence needed for their engagement, under confidentiality | Legal, privacy and security assurance |
| **Regulators, courts and law enforcement** | Only what is required or permitted by law | Legal obligations and legal claims |

We do not sell personal data, share it for advertising, or give lenders, advertisers or
credit reference agencies access to your budget.

The processor register is the working record for each provider’s role, processing region,
sub-processors, data-processing terms, transfer mechanism, retention and security contact.
It is not complete until every entry is evidenced, and this notice will not publish while
any provider field remains to be confirmed.

### International transfers

Some providers may process data outside the UK. Before public production, we will record
the processing region and the transfer mechanism for each provider — UK International Data
Transfer Addendum, Standard Contractual Clauses, or an adequacy regulation — together with
a transfer risk assessment. `[TO CONFIRM: Supabase region and sub-processors]`,
`[TO CONFIRM: Google transfer terms]`, `[TO CONFIRM: InfinityFree region and terms]`,
`[TO CONFIRM: GitHub/Microsoft terms]`.

Do not publish this notice until those fields and the processor register are complete.

---

## 6. Where your data is stored

| Data | Where it is stored | Synced to the cloud? |
| --- | --- | --- |
| Budget and settings | Windows device’s encrypted value store only; the hosted demo uses synthetic data and never loads a real budget | Only from the Windows app if you sign in and choose cloud sync |
| Account and session | Supabase Auth; device secure store on Windows; browser storage on the hosted account pages | Yes, for authentication and account settings; no real budget is loaded on the hosted site |
| Provider vault ciphertext | Inside the budget document | Yes, ciphertext only |
| People portal records | Browser storage on the owner’s device | No |
| Feedback | Browser storage on the owner’s device | No |
| Restore points | Device storage, encrypted | No |
| Support bundle | Downloaded by you; sent only if you choose | No |
| Processor logs | Supabase, InfinityFree, GitHub and their sub-processors | No, but provider-controlled |

**Hosted web app:** the hosted site stores your synced budget, restore points, sync
metadata and your session in browser storage while you use it, and offers a synthetic demo
that stays in the tab. Browser storage is not encrypted by FinanceHub, so anyone who can
use this browser profile can read that data; use a trusted device, sign out, and clear site
data when you stop using it. The Windows app uses the operating system’s
secure storage for values, but its SQLite database is not full-disk encrypted. The app lock
is a screen barrier, not disk encryption.

**Cloud budget:** the provider-login vault is end-to-end encrypted. The rest of the cloud
budget is encrypted in transit and protected by Supabase access controls, but it is not
end-to-end encrypted. This means a party with database/operator access could read it.

---

## 7. How long we keep it

| Record | Retention |
| --- | --- |
| Account and cloud budget | Until you delete your account, subject to processor backup windows |
| Local budget and recovery copies | Until you reset/remove the local copy or remove app data |
| Provider vault | Until you delete the vault or your account |
| People portal records | Until you delete the portal or clear site data |
| Feedback | Until you delete it or clear site data; at most 100 messages per owner |
| Restore points | The newest seven; one automatic point per day |
| Sync conflicts | Local queue capped at 25 records and two full snapshot pairs within 1.5 MB; cloud metadata until purged or the account is deleted |
| Support bundle | Until the support request is resolved; delete downloads and mailbox copies afterwards |
| Processor logs and backups | Per the provider’s documented retention, recorded in the processor register |

Cloud deletion removes the account and its cloud rows, but it does not remove local copies,
exported backups, screenshots or emails you have sent. Remove those separately.

---

## 8. Your rights

You can ask for:

- **access** to your personal data and a copy of it;
- **correction** of inaccurate data;
- **deletion** of your data;
- **restriction** of processing while a request is assessed;
- **portability** of data you provided, in a structured format;
- **objection** to processing based on legitimate interests;
- **withdrawal of consent** for optional processing.

The app provides JSON and CSV exports, editable records, local reset/remove-local-copy,
vault deletion, portal deletion, feedback deletion and self-serve cloud account deletion.

If you are a named person in someone else’s budget or a portal user, you can contact us
using the privacy address. We may need to coordinate with the budget owner and verify your
identity. We will avoid disclosing another person’s data.

We aim to respond within one month. We may extend that by up to two further months for
complex or numerous requests and will explain why. You can complain to the Information
 Commissioner’s Office (ICO) at <https://ico.org.uk/>.

---

## 9. Security

We use HTTPS, Supabase row-level security, PKCE authentication, optional passkeys,
client-side AES-256-GCM encryption for saved provider logins, operating-system secure
storage on Windows and encrypted backups. No system is completely secure.

Keep your device, account and backup passphrases protected. The people portal is
device-local and is not intended as a secure banking channel. If you believe your account
or vault has been compromised, contact us and rotate the affected provider passwords.

---

## 10. Cookies and local storage

FinanceHub does not use advertising or analytics cookies. It uses browser/device storage
that is necessary to run the app: your workspace, session, preferences, restore points,
portal records and feedback. Clearing site data or app data removes the local copy and may
sign you out; it does not delete your cloud account. Use the in-app deletion control for
the cloud account.

---

## 11. Changes and contact

We will date material changes and, where appropriate, ask you to review them before they
take effect. If you have a question, a rights request or a security concern, contact
`financehub+pauluk83@gmail.com`.

The controller is Zane Stanton, an individual based in England. `[Service address to be
confirmed before publication.]`

---

## 12. Draft review checklist

- [ ] Replace every `[TO CONFIRM]` with the actual region, transfer mechanism and provider.
- [ ] Confirm whether provider-vault processing is consent or contract.
- [ ] Confirm the lawful basis for named-person and portal data.
- [ ] Confirm the email-delivery provider and add it to the processor register.
- [~] Privacy/support mailbox recorded as `financehub+pauluk83@gmail.com`; controller service address still open.
- [~] The demo-only hosted restriction was withdrawn by the owner on 2026-11-17; the hosted site now loads a real budget with the confirmed-email rule enforced, and plaintext browser storage is accepted as RA-3. This notice text must be reviewed against that model.
- [ ] Reconcile this notice with `DATA_MAP.md`, `DPIA.md` Addendum A and `RETENTION_SCHEDULE.md`.
- [ ] Obtain UK legal and privacy review before publication.
