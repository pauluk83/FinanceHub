# FinanceHub — plan

Local-first household budget: a Windows app (Electron + React) and a hosted web build
(Cloudflare Pages + Supabase), sharing one calculation engine and one budget document.

Current release **2026.11.23**, suite **587/587**, `tsc` clean,
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
compliance pack and the security hardening are all delivered and released. The private-use
gate has been signed off, so what is left of the plan is narrowing the build's surface and
closing the remaining owner gates.

What remains is not feature work. It is the owner-gated work in §7 — the Store publication.

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
| Cloud | Supabase (`db/migrations/postgres/0001–0006`) | `settings` document per user, backup bucket, `user_devices`, push subscriptions, RLS per owner |
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
  and never reaches the bundle; no third-party penetration test has been run yet (RA-8 in
  `docs/compliance/RISK_ACCEPTANCE_REGISTER.md`).

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
npm test                                  # full suite (587)
npx tsc -p app/tsconfig.json --noEmit     # typecheck
npm run release:check                     # release + live parity
npm run test:e2e                          # Playwright: demo flows + responsive guard
```

The suite includes parity, ledger invariants, import fuzz, provider rules, backup diff,
digest, RLS/Postgres policy checks, security headers, CSP and the responsive e2e guard
(no main view scrolls sideways at 320, 430 and 768 px).

**Closed with the private-use gate:** the signed-in edit-latency budget, the 420 px hosted
click-through, cloud backup restore from the UI, a second real account, the packaged-installer
checks and the accessibility pass, all against the published installer.

**Still honestly open:** a physical iOS/Android device pass. The third-party penetration test
is deferred by dated acceptance — RA-8 in `docs/compliance/RISK_ACCEPTANCE_REGISTER.md`.

---

## 7. The plan

Points are numbered in the order they were decided, not strictly by when they can start, and
finished points are deleted, so the numbers are not consecutive. Point 7 is built; its
publication is owner-gated.

### Point 1 — Unattended build work: **done**

Closed on 2026-11-21. Everything that needed no decision, key or signature has shipped and
been released: the pending release published, the R17 cloud-upload half, device and session
management (`0005_user_devices.sql`, applied and verified live), the orphaned backlog (A-11
provider rules, restore-point diff and section restore, statement-versus-snapshot check,
property-based ledger invariants, import fuzz, the monthly "what changed" digest), the
security headers and audit cleanup, and the fluid phone/tablet layout with its Playwright
guard. Plan truth is this rewrite.

The measurement that needed a signed-in session was left to the private-use gate, and is now
closed with it.

### Point 7 — Microsoft Store packaging: prepared, publication owner-gated

Added 2026-11-23. A separate AppX target builds a Store package without touching the
GitHub NSIS release: `npm run dist:store` writes to `release-store/`, uses only the blank
seed, hides the GitHub updater, and derives a four-part AppX version from the release date
plus `STORE_REVISION`. The Partner Center identity comes from the gitignored
`store/identity.json`; the build validates it before packaging. See `docs/STORE.md` for the
build, WACK package check and submission steps.

Owner work: reserve the FinanceHub name in Partner Center, copy its exact Identity Name,
Publisher and Publisher display name into `store/identity.json`, replace the sample AppX
tile assets, then run the WACK pre-check and submit manually. The build does not upload or
publish. The Store package has its own app-data folder, so moving an existing NSIS budget
requires the normal backup/restore flow.

Exit: the AppX installs under the reserved identity, opens in Store mode with no GitHub
updater, WACK reports no FAIL, and the owner submits the listing (or records a dated
decision to defer it).

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
- Distribution is a direct Windows download plus a prepared Microsoft Store AppX path;
  Store publication is owner-gated and no listing is submitted yet. No iOS for now.
- Transactions use one category plus up to eight free-form tags; alerts are in-app first.
- Backups are encrypted and versioned with seven restore points; audit is per-record history
  plus trash/undo.
- Engineering completion is not compliance: the dated acceptances in
  `docs/compliance/RISK_ACCEPTANCE_REGISTER.md` still apply.
