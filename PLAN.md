# FinanceHub — plan

Local-first household budget: a Windows app (Electron + React) and a hosted web build
(Cloudflare Pages + Supabase), sharing one calculation engine and one budget document.

Current release **2026.11.22** (bundle `index-CfBNa69m.js`), suite **545/545**, `tsc` clean,
`release:check` 9/9. Live at <https://financehub-uk.pages.dev/>.

This file holds what is still to do and the rules that constrain it. It does not keep a
delivery history: that is `CHANGELOG.md` (application changelog, shown in-app and on the
login page), and the budget changelog is user data in the dataset. Completed items are
deleted rather than ticked, so the plan stays readable.

---

## 1. Where it stands

The product is built and in owner-only private use: workbook parity and the calculation
engine, the Windows app with every view, the hosted web build with accounts and cloud sync,
encrypted backups (local and cloud), device and session management, import/export, the
compliance pack and the security hardening are all delivered and released.

What remains is not feature work. It is the owner-gated work in §7 plus the decisions and
acceptances that let the build leave private use. Point 6 is the exception: simplifying what
is already built needs no owner input, so it can run while points 2–5 wait.

---

## 2. Money rules that must not change

These are the invariants the suite exists to protect. A change that touches them needs a
test proving the previous figures are unchanged, in the same release.

- The engine is pure: no I/O, no clock reads beyond the injected `today`, no platform code.
- Internal transfers never count as income or expenses.
- Locked months are immutable snapshots; historical bills are never recomputed.
- Rent, water, telco and the other provider ledgers each have exactly one implementation in
  `core/` (`providerLedger.ts` and friends); no view re-derives a charge or a balance.
- Workbook quirks are preserved and flagged, not silently corrected: Dan is a linked
  account, the £30 `Credit Cards` row belongs to Starling, and a bill-change override can
  legitimately show £0.00 due.
- A digest, statement or reconciliation is a *view* over engine figures — it never becomes a
  second calculation. `core/digest.ts` and `core/dataHealth.ts` are the patterns to follow.
- Opening balances are anchor-aware: statement closing balances match the Dashboard, not the
  raw bank ledger.

---

## 3. Architecture

| Piece | Where | Note |
| --- | --- | --- |
| Engine | `core/*.ts` | Pure TypeScript, shared by app, tests and scripts |
| Desktop shell | `electron/main.cjs`, `preload.cjs` | Secure storage (DPAPI/Keychain), OAuth callback, bank-feeds IPC, updater |
| Web app | `app/src/**` | React 19, lazy views, one `App.tsx` shell |
| Storage adapters | `app/src/store.ts` | Electron secure store, hosted IndexedDB (localStorage fallback), demo in memory |
| Cloud | Supabase (`db/migrations/postgres/0001–0005`) | `settings` document per user, backup bucket, `user_devices`, RLS per owner |
| Hosting | Cloudflare Pages `financehub-uk` | Static `dist-web/`, `_headers`, installer published as a GitHub Release asset |

Rules: the document is the single source of truth; every mutation goes through the update
boundary that also writes audit history and the budget changelog; a save that changes no
budget data records nothing; interface preferences (menu layout, theme) are not budget data.

---

## 4. Security model

What holds today, and what a change must not weaken:

- **Electron:** `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, a
  navigation allowlist, `setWindowOpenHandler` denial, webview blocking, every permission
  request refused, `https:`-only external links with no credentials in the URL.
- **CSP:** no inline script, `object-src 'none'`, `base-uri 'none'`, `connect-src` limited to
  `'self'` plus the exact Supabase origin, failing closed when the URL is unset.
- **Headers:** nosniff, `X-Frame-Options: DENY`, `no-referrer`, HSTS, COOP, CORP,
  `X-DNS-Prefetch-Control: off`, a Permissions-Policy that denies device features,
  immutable caching for `/assets/*` and `no-cache` for documents. Locked by
  `tests/security-headers.test.ts`.
- **Identity:** PKCE everywhere; desktop sessions live in DPAPI/Keychain storage, never on
  disk in plaintext; passkeys on the hosted origin only (the packaged `file://` window
  cannot use WebAuthn and says so).
- **Secrets:** provider credentials live in the encrypted vault, never in the synced
  document; no key, token or account id in the repository, a build, a log or an asset.
- **Cloud:** every table and bucket is owner-scoped by RLS; ids never come from the client.
- **Accepted risks:** the hosted build keeps the budget in plaintext browser storage (cleared
  on sign-out while the outbox is empty); `xlsx` stays a devDependency for `import/extract.mjs`
  and never reaches the bundle; no third-party penetration test has been run yet (§7 point 4).

---

## 5. Release process

`npm run release -- "note"` is the only supported way to ship. It sets the version from the
date, regenerates the application changelog from `CHANGELOG.md`, builds the Windows installer
and the hosted bundle, deploys to Pages and verifies the live bundle matches.

- Version is the release date (`YYYY.M.D`); a later release the same day appends to the same
  section. Same-day re-tags need `--allow-tag-move`, then `git tag -f` and a force-push.
- Never hand-edit `CHANGELOG.md` headings or `app/src/appChangelog.generated.ts`.
- The installer is a GitHub Release asset built by `.github/workflows/release.yml` from the
  `v<version>` tag; it never goes to the web host.
- Gates: `npm test`, `npx tsc -p app/tsconfig.json --noEmit`, `npm run release:check`.
  `release:check` needs the tag at `HEAD`, so commit, tag and push, or move the tag.

---

## 6. Verification

```
npm test                                  # full suite (534)
npx tsc -p app/tsconfig.json --noEmit     # typecheck
npm run release:check                     # release + live parity
npm run test:e2e                          # Playwright: demo flows + responsive guard
```

The suite includes parity, ledger invariants, import fuzz, provider rules, backup diff,
digest, RLS/Postgres policy checks, security headers, CSP and the responsive e2e guard
(no main view scrolls sideways at 320, 430 and 768 px).

**Not measured, and honestly open:** a signed-in edit-latency budget, a 420 px hosted
click-through, a physical iOS/Android device pass, a real penetration test, and the packaged
installer exercised by hand. These move to point 5 (§7).

---

## 7. The plan

Points are numbered in the order they were decided, not strictly by when they can start:
point 1 is closed, point 6 is ready to start now, and points 2–5 each wait on one owner
action or signature.

### Point 1 — Unattended build work: **done**

Closed on 2026-11-21. Everything that needed no decision, key or signature has shipped and
been released: the pending release published, the R17 cloud-upload half, device and session
management (`0005_user_devices.sql`, applied and verified live), the orphaned backlog (A-11
provider rules, restore-point diff and section restore, statement-versus-snapshot check,
property-based ledger invariants, import fuzz, the monthly "what changed" digest), the
security headers and audit cleanup, and the fluid phone/tablet layout with its Playwright
guard. Plan truth is this rewrite.

The only work left from this point is measurement that needs a signed-in session, which is
now part of point 5.

### Point 2 — Email delivery (needs the owner's provider account)

Decided 2026-11-20: **Resend** is the provider, and **Confirm email stays off**, so the
dashboard setting is switched off when SMTP is enabled. Owner work: create the Resend
account, verify the sender domain or address, and paste the SMTP host, username and API key
into Supabase → Authentication → Emails → SMTP settings.

Then, without further input: run signup → confirmation → resend → password reset once, wire
email reminder delivery to the shipped suppression list and digest, and run one real send.

Exit: the four auth emails arrive, the confirmation setting is recorded with a date, and one
reminder digest is delivered and logged.

### Point 3 — Web push (needs the Supabase CLI session and a secret)

Decided 2026-11-20: the sender runs as a **Supabase Edge Function**, so the VAPID private key
becomes a Supabase secret beside auth and the backup bucket. The pair is generated at
`tmp/vapid-keys.json` and is never pasted into chat or the repository. Owner work: authorise
the CLI once (`npx supabase login`) so the function can be deployed and its secret set.

Then: service-worker subscription, permission prompt, push for the existing bill, balance and
card alerts, and unsubscribe.

Exit: a real device receives a push for a due bill, and an unsubscribed device receives none.

### Point 4 — Legal and compliance pack (in-house, dated risk acceptances)

Decided 2026-11-20: no external legal review and no penetration test for now; every open gate
closes by a **dated written risk acceptance**. Support stays on the in-app Feedback route and
the security contact is `pauluk83+financehub@gmail.com`.

Remaining work, each recorded in `docs/compliance/RISK_ACCEPTANCE_REGISTER.md` with a date and
the risk carried: processor list and controller/processor position, lawful basis, DPIA
addendum position, international-transfer basis for the Supabase region, the ICO exemption and
its reason, the penetration-test acceptance, and the privacy-notice, terms and
refund/complaints position. The privacy notice, terms and in-app legal pages name the security
contact.

Exit: every compliance gate is a dated acceptance or passing evidence, signed by the owner.

### Point 5 — Private-use gate (needs the owner's signature)

Decided 2026-11-20: **owner-only private use for now** — no pilot, no public launch and no
public claims until the owner revisits the decision.

Work: run the packaged-app checks and the accessibility pass against the published installer,
do a signed-in pass covering the edit-latency budget, a 420 px hosted click-through, cloud
backup restore from the UI and a second real account, assemble the release evidence (SBOM,
hashes, claims list), and take a dated owner sign-off that the build is for private use only,
naming what is still unproven.

Exit: every gate is passing evidence or a signed acceptance, the private-use statement is
recorded, and the final release is tagged and verified live.

### Point 6 — Simplification (unattended; can run now)

Decided 2026-11-21: the build has accumulated second editors for the same records and figures
repeated across screens. This point is presentation and structure only, so it is unblocked
while points 2–5 wait on the owner; it ships ahead of them in the order below.

Rules for every item here: no money rule in §2 changes; a change that touches a figure needs
a test proving the figure unchanged in the same release; one release per item, so any item can
be dropped without unpicking the others. Nothing here adds a feature or restyles a screen.

**6.2 — Merge four pairs of pages (Tier 2).** Accounts + Cards become "Accounts & cards";
Calendar absorbs Notifications; Progress + Reports become "Insights"; Statements + Evidence
packs become one print/export page. The sidebar drops from 36 destinations to about 28 with no
capability removed.

Exit: the merged pages pass the responsive guard at 320, 430 and 768 px, and every existing way
in (help, command palette, dashboard links) reaches the merged page.

**6.3 — Split Dashboard and Monthly by period (Tier 3).** Dashboard owns the year (YTD totals,
balances, what needs attention); Monthly owns the month, where the income, bill and breakdown
detail already lives. The two donuts move to Monthly, and the Dashboard's reconciliation, card,
people and bills tables reduce to one "Needs attention" list linking to the owning page.
Already done in this direction: the repeated hero figure and donut badges are gone, and the
Savings and Debts tiles link to their pages.

Exit: no figure or table appears on both screens, and each KPI row stays one height.

**6.4 — Internal structure (Tier 4).** Split `views/tools.tsx` (about 1,980 lines, around twenty
unrelated tools) into `views/tools/*`; type the provider shapes that are `any` today, starting
with the payment-day/due-day pair, so one fact stops having two interpretations.

Exit: no behaviour change, suite and typecheck green, and no view file over 800 lines.

---

## 8. Outside this plan

- Split/merge transactions — changes money rules across every balance; needs its own release
  with a parity proof.
- Native iOS — needs macOS/Xcode and an Apple Developer account.
- Secure bank linking — stays CSV/owner-only desktop feeds until the FCA/Open Banking gate
  (C-4) clears; no provider contract, no public linking.
- Receipt OCR and PDF statement import.

---

## 9. Owner decisions that still bind

- Publish with the already-authenticated Wrangler session; Pages project `financehub-uk`.
- Resend for transactional email, **Confirm email off**.
- Web push from a Supabase Edge Function, VAPID key as a Supabase secret.
- Device list with per-device revoke and sign-out-everywhere.
- Legal pack kept in-house with dated risk acceptances; penetration test deferred by
  acceptance; ICO exemption recorded with its reason.
- Owner-only private use as the launch route; support through in-app Feedback, security
  contact `pauluk83+financehub@gmail.com`.
- Distribution is a direct Windows download; no Microsoft Store, no iOS for now.
- Transactions use one category plus up to eight free-form tags; alerts are in-app first.
- Backups are encrypted and versioned with seven restore points; audit is per-record history
  plus trash/undo.
- Engineering completion is not compliance: the gates in point 4 and point 5 still apply.
