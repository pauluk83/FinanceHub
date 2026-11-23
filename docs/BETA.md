# Beta testers — readiness gate

Status checked 2026-11-23 against project `fzkkgbatmmgasfmgvrzp` and the live build.
Engineering is ready; three owner-side gates are open. Nothing here changes the app; this is
the checklist that says when another person's budget may sit on the hosted site.

`PLAN.md` still treats the build as owner-only. Inviting a tester is the decision that
re-triggers RA-4, RA-7, RA-9 and RA-10 in
`docs/compliance/RISK_ACCEPTANCE_REGISTER.md`.

## Verified configuration

Pulled from the live project's auth settings on 2026-11-23:

| Setting | Value |
| --- | --- |
| `site_url` | `https://financehub-uk.pages.dev/` |
| Additional redirect URLs | `http://localhost:5173/**`, `http://127.0.0.1:53682/auth/callback`, `https://financehub-uk.pages.dev/**`, `https://financehub-uk.pages.dev/` |
| Minimum password length | 10 |
| Email OTP length | 8 |
| Email throttle | one per minute, 30 per hour |
| SMTP | `smtp.resend.com:465`, user `resend`, sender name `FinanceHub` |
| Sender address | `onboarding@resend.dev` (Resend's shared test sender) |
| Google provider | enabled |
| TOTP verify | enabled |
| Confirm email | **off** (`mailer_autoconfirm`) |

**What that means for a tester today.** Signup by email and password completes without any
mail, and the app's confirmed-email gate passes because Supabase confirms the address at
signup. So a tester can create an account, sign in and sync straight away.

**What breaks.** Resend's shared `onboarding@resend.dev` sender delivers only to the
account owner's own address, so a tester cannot receive a password-reset or email-change
message. Only the owner can rescue a forgotten password (Dashboard → Authentication → Users
→ reset/set password). There is no domain to verify at Resend — `freedev.app` is iFastNet's
free-subdomain domain, not the owner's — so the beta works around it instead.

## Gate 1 — no domain yet: the beta signs in with Google

Decided 2026-11-23. `freedev.app` is iFastNet's free-subdomain domain, not the owner's, so
Resend cannot verify a sender and Confirm email cannot be switched on without stranding every
new signup. (A pending `mail.freedev.app` entry was created during the investigation and then
removed from Resend.) The beta therefore runs **Google-only**:

1. Google Cloud Console → OAuth consent screen for the `FinanceHub Web` client → **Publish
   app** (In production). Add the public links it asks for: privacy
   `https://financehub-uk.pages.dev/#legal/privacy`, terms
   `https://financehub-uk.pages.dev/#legal/terms`, authorised domain `pages.dev`. The client
   requests only the non-sensitive `email`/`profile` scopes, so this is a publishing step, not
   a verification review; it lifts the 100-test-user cap.
2. Keep **Confirm email off**. Google accounts arrive already verified, so the app's
   confirmed-email gate passes on the first sign-in.
3. Tell testers to use **Continue with Google** in the beta brief. Email/password still works,
   but a forgotten password can only be fixed by the owner (Dashboard → Authentication → Users
   → set password). If you would rather remove the trap entirely, disable the Email provider
   for the beta (`Authentication → Sign In / Providers → Email`) and re-enable it once a domain
   exists.
4. Record a dated Google sign-in test with a fresh account: sign in, sync, sign out.

**When a domain is bought** (before public launch): Resend → Add domain → add the records it
shows (SPF CNAMEs, DKIM TXT and `_dmarc`) at your DNS host → wait for Verified → point the
Supabase SMTP sender at that domain → turn Confirm email on → run signup → confirm → sign in →
password reset end to end.

## Gate 2 — a server copy of tester budgets

The Supabase project is on the Free plan, which has **no automatic database backups**; the
in-app encrypted export is the only copy. Before anyone else's budget lands there, either:

- move the project to Pro (7 days of daily backups), or
- keep Free and run a scheduled export of the document on a fixed cadence from a machine you
  control, recording where the copies live.

Record the decision and its date in this file and in `docs/compliance/PROCESSOR_REGISTER.md`
(P1 "backup decision still open").

## Gate 3 — the acceptances that name "beyond the owner"

These are conditions already written into signed entries, not new policy:

- **Cloudflare DPA** accepted in the dashboard, with the subprocessor-list version, the
  account processing jurisdiction and the log-retention window recorded (RA-4 condition 1,
  RA-7).
- **Resend's DPA and transfer basis** filed in the private evidence folder, plus a sender
  domain (RA-4 condition 2, RA-7).
- **ICO registration and the data-protection fee** paid, because processing stops being the
  owner's personal/household affairs once other people's budgets are hosted (RA-9).
- **A beta brief and tester wording.** Terms §6 already says features may change during beta;
  add a short tester note covering: the installer is unsigned, so SmartScreen will warn
  (RA-2); hosted browser storage is not encrypted (RA-3); each tester gets their own
  workspace and there is no budget sharing; support and security contact is
  `pauluk83+financehub@gmail.com`; data can be exported or deleted at any time.

A solicitor's review (RA-10) and an independent penetration test (RA-8) are conditions for a
public or commercial launch, not for an invited beta — but a high or critical finding from any
source reopens the distribution decision.

## Acceptance checklist

Date and initial each line; the file is the record that the gate closed.

- [ ] OAuth consent screen published to production; a fresh Google account signs in and syncs
- [ ] Confirm email stays off for the beta (Google-only sign-in) — recorded as a decision
- [ ] Owner-assisted password reset documented in the beta brief
- [ ] Two-account isolation recorded against a dated build (tester A cannot read tester B)
- [ ] Throwaway-account deletion and JSON export drill recorded
- [ ] Cloudflare DPA accepted; subprocessor version, jurisdiction and log retention recorded
- [ ] Resend DPA and transfer basis filed
- [ ] ICO registered and fee paid (or a dated decision to stay invite-only on the owner's own
      accounts only, which is not a beta)
- [ ] Backup decision recorded (Pro plan or scheduled export cadence)
- [ ] Beta brief and tester wording published

## Who each tester is

There is no shared-household feature: a tester's workspace is their own. Do not invite
someone expecting to budget together with a partner, and do not hand a tester the owner's
account.
