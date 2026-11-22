/**
 * UI smoke tests for the screens that were added after the workbook parity
 * suite. The real views are loaded through Vite (the same TSX transform as the
 * app) and rendered to static markup, so a broken import, hook or view
 * contract fails here before it can reach the packaged app.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server;
let restoreStorage;

function dataset(overrides = {}) {
  return {
    settings: {
      targetYear: 2026,
      startMonth: 1,
      currency: '£',
      monthsInYear: 12,
      asOfDate: '2026-11-09',
      lockCutoff: '2026-11-01',
      anchorDate: '2026-11-01',
      primaryAccount: 'Current',
      ...(overrides.settings ?? {}),
    },
    accounts: [{
      name: 'Current', targetPence: 10_000, openingPence: overrides.openingPence ?? 5_000,
      sortOrder: 1, active: true,
    }],
    people: [],
    cards: [{
      name: 'Card', limitPence: 10_000, openingPence: 9_000, sortOrder: 1, active: true,
    }],
    bills: [{
      name: 'Rent', amountPence: 20_000, dueDay: 12, linkedSheet: '', frequency: 'Monthly',
      latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
      effectiveFrom: '', paymentMethod: 'Standing Order', baseAmountPence: 20_000, baseDueDay: 12,
    }],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: overrides.transactions ?? [],
    providers: {},
    monthLocks: {},
    ...(overrides.dataset ?? {}),
  };
}

function props(ds, extra = {}) {
  return {
    ds,
    engine: extra.engine,
    month: 11,
    setMonth: () => {},
    year: 2026,
    setYear: () => {},
    availableYears: [2026],
    update: () => {},
    theme: 'dark',
    setTheme: () => {},
    notify: () => {},
    go: () => {},
    userId: 'ui-smoke-user',
    userEmail: 'owner@example.test',
    isLocal: false,
    lastSavedAt: null,
    lastSyncedAt: null,
    signOut: () => {},
    workspace: 'account',
    chooseWorkspace: () => {},
    vault: null,
    appLock: null,
    setAppLock: () => {},
    lockNow: () => {},
    vaultSession: null,
    setVault: () => {},
    setVaultSession: () => {},
    feedbackItems: [],
    openFeedback: () => {},
    syncConflicts: [],
    resolveSyncConflict: () => {},
    exportSyncConflict: () => null,
    ...extra,
  };
}

const render = (Component, viewProps) => renderToStaticMarkup(React.createElement(Component, viewProps));

before(async () => {
  server = await createServer({
    configFile: path.join(ROOT, 'app', 'vite.config.ts'),
    root: path.join(ROOT, 'app'),
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true },
  });
  restoreStorage = new Map();
  globalThis.window = {
    financeHubDesktop: {
      secureStorage: {
        getItem: (key) => restoreStorage.get(key) ?? null,
        setItem: (key, value) => { restoreStorage.set(key, String(value)); },
        removeItem: (key) => { restoreStorage.delete(key); },
      },
    },
  };
});

after(async () => {
  await server?.close();
  delete globalThis.window;
});

test('transaction log renders category and tag labels with both filters', async () => {
  const { Transactions } = await server.ssrLoadModule('/src/views/money.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const ds = dataset({
    transactions: [{
      row: 1,
      date: '2026-11-05',
      account: 'Current',
      type: 'Expense',
      amountPence: 1_234,
      comments: 'Tesco weekly shop',
      status: '',
      budgetTreatment: '',
      category: 'Food',
      tags: ['weekly', 'Tesco'],
    }],
  });
  const html = render(Transactions, props(ds, { engine: buildEngine(ds) }));

  assert.match(html, /aria-label="Category filter"/);
  assert.match(html, /aria-label="Tag filter"/);
  assert.match(html, /<span class="badge blue">Food<\/span>/);
  assert.match(html, /weekly, Tesco/);
  assert.match(html, /<th>Category<\/th>/);
  assert.match(html, /<th>Tags<\/th>/);
});

test('the notification centre renders bill, balance and card alerts', async () => {
  const { NotificationsView } = await server.ssrLoadModule('/src/views/notifications.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const ds = dataset({
    openingPence: 500,
    transactions: [{
      row: 1,
      date: '2026-11-05',
      account: 'Current',
      type: 'Expense',
      amountPence: 1_234,
      comments: 'Shop',
      status: '',
      budgetTreatment: '',
    }],
  });
  const html = render(NotificationsView, props(ds, { engine: buildEngine(ds) }));

  assert.match(html, /Current alerts/);
  assert.match(html, /Current is below zero/);
  assert.match(html, /Rent is due in 3 days/);
  assert.match(html, /Card is over 80% used/);
  assert.match(html, /Mark all read/);
  assert.match(html, /<span class="badge amber">Unread<\/span>/);
});

test('the encrypted backup panel shows the retention limit and stored restore points', async () => {
  const { EncryptedBackupSection } = await server.ssrLoadModule('/src/views/backup.tsx');
  const ds = dataset();
  restoreStorage.clear();
  restoreStorage.set('financehub.restore-points.v1:ui-smoke-user', JSON.stringify([{
    id: 'restore_1',
    createdAt: '2026-11-08T10:00:00.000Z',
    label: 'Before large edit',
    bytes: 2_048,
    backup: { format: 'financehub-backup-v2' },
  }]));
  const html = render(EncryptedBackupSection, props(ds));

  assert.match(html, /Encrypted backups &amp; restore points/);
  assert.match(html, /1\/7 manual · 0\/30 daily/);
  assert.match(html, /Before large edit/);
  assert.match(html, /2 KB/);
  assert.match(html, />Restore<\/button>/);
  assert.match(html, /Export encrypted backup/);
  assert.match(html, /Save restore point/);

  const empty = render(EncryptedBackupSection, props(ds, { userId: 'ui-smoke-empty' }));
  assert.match(empty, /0\/7 manual · 0\/30 daily/);
  assert.match(empty, /No encrypted restore points yet/);
});

test('the dashboard only warns about duplicates in the month on screen', async () => {
  const { Dashboard } = await server.ssrLoadModule('/src/views/overview.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const transaction = (row, date) => ({
    row,
    date,
    account: 'Current',
    type: 'Expense',
    amountPence: 1_234,
    comments: 'Shop',
    status: '',
    budgetTreatment: '',
  });

  const october = dataset({ transactions: [transaction(1, '2026-10-05'), transaction(2, '2026-10-05')] });
  const novemberView = render(Dashboard, props(october, { engine: buildEngine(october) }));
  assert.doesNotMatch(novemberView, /duplicate group/);

  const november = dataset({ transactions: [transaction(3, '2026-11-05'), transaction(4, '2026-11-05')] });
  const novemberViewWithDuplicates = render(Dashboard, props(november, { engine: buildEngine(november) }));
  assert.match(novemberViewWithDuplicates, /duplicate group/);
});

test('account security renders passkey and deletion controls without authenticator setup', async () => {
  const { AccountSecuritySection } = await server.ssrLoadModule('/src/views/accountSecurity.tsx');
  const cloud = render(AccountSecuritySection, props({}, { isLocal: false }));
  assert.match(cloud, /Account security/);
  assert.match(cloud, /Delete cloud account permanently/);
  assert.match(cloud, /delete_my_account/);
  assert.match(cloud, /Passkeys need the hosted website/);
  assert.doesNotMatch(cloud, /authenticator app/i);
  assert.doesNotMatch(cloud, /MFA/);

  const local = render(AccountSecuritySection, props({}, { isLocal: true }));
  assert.match(local, /This is a local-only workspace/);
  assert.doesNotMatch(local, /Delete cloud account permanently/);
});

test('the update dialog shows delta size, speed, progress and install controls', async () => {
  const { UpdatePanel } = await server.ssrLoadModule('/src/views/appUpdate.tsx');
  const actions = {
    onDownload: () => {},
    onCancel: () => {},
    onInstall: () => {},
    onLater: () => {},
    onRetry: () => {},
  };
  const downloading = render(UpdatePanel, {
    ...actions,
    state: {
      phase: 'downloading',
      version: '2026.11.15',
      buildId: 'abcdef123456',
      currentVersion: '2026.11.14',
      currentBuildId: '111111111111',
      downloadBytes: 4 * 1024 * 1024,
      totalBytes: 14 * 1024 * 1024,
      reusedBytes: 10 * 1024 * 1024,
      changedBlocks: 16,
      totalBlocks: 56,
      downloadedBytes: 2 * 1024 * 1024,
      speedBps: 2.5 * 1024 * 1024,
      etaSeconds: 1,
    },
  });
  assert.match(downloading, /Downloading changed blocks only/);
  assert.match(downloading, /50%/);
  assert.match(downloading, /2\.5 MB\/s/);
  assert.match(downloading, /16 changed/);
  assert.match(downloading, /Cancel download/);

  const ready = render(UpdatePanel, {
    ...actions,
    state: {
      phase: 'ready',
      version: '2026.11.15',
      buildId: 'abcdef123456',
      currentVersion: '2026.11.14',
      currentBuildId: '111111111111',
      downloadBytes: 4 * 1024 * 1024,
      totalBytes: 14 * 1024 * 1024,
      reusedBytes: 10 * 1024 * 1024,
      downloadedBytes: 4 * 1024 * 1024,
      speedBps: 2.5 * 1024 * 1024,
      verified: true,
    },
  });
  assert.match(ready, /SHA-256 passed/);
  assert.match(ready, /Restart and install/);
});

test('countdown helpers handle today, future, overdue and DST boundaries', async () => {
  const { daysUntil, countdownLabel, incomeCountdownLabel } = await server.ssrLoadModule('/../core/countdowns.ts');

  assert.equal(daysUntil('2026-11-16', '2026-11-16'), 0);
  assert.equal(daysUntil('2026-11-19', '2026-11-16'), 3);
  assert.equal(daysUntil('2026-11-15', '2026-11-16'), -1);
  assert.equal(daysUntil('2026-03-30', '2026-03-28'), 2);
  assert.equal(countdownLabel(0), 'Due today');
  assert.equal(countdownLabel(1), 'Due tomorrow');
  assert.equal(countdownLabel(-2), '2 days overdue');
  assert.equal(incomeCountdownLabel(-2), '2 days ago');
});

test('the dashboard shows bill and income countdowns', async () => {
  const { Dashboard } = await server.ssrLoadModule('/src/views/overview.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const ds = dataset({
    dataset: {
      incomeSchedules: {
        pip: [{ month: 'Nov', year2026: { date: '2026-11-20', amountPence: 18_000 }, year2027: { date: '', amountPence: 0 }, year2028: { date: '', amountPence: 0 } }],
        uc: [{ month: 'Nov', year2026: { date: '2026-11-25', amountPence: 12_000 }, year2027: { date: '', amountPence: 0 }, year2028: { date: '', amountPence: 0 } }],
      },
    },
  });
  const html = render(Dashboard, props(ds, { engine: buildEngine(ds) }));

  assert.match(html, /Bills due/);
  assert.match(html, /Countdown/);
  assert.match(html, /Income due/);
  // The card names each source and its state, soonest first, and carries no amounts:
  // "PIP in 6 days" over "UC in 11 days", or "PIP passed" once the date has gone.
  const incomeCard = html.match(/Income due[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.ok(incomeCard.length > 0, 'the income card rendered');
  assert.match(incomeCard, /PIP (\d+ days?|today|passed)/);
  assert.match(incomeCard, /UC (\d+ days?|today|passed)/);
  assert.equal(incomeCard.includes('Universal Credit (UC)'), false, 'no per-source row in the card');
  assert.equal(incomeCard.includes('£180.00'), false, 'no PIP amount in the card');
  assert.equal(incomeCard.includes('£120.00'), false, 'no UC amount in the card');
  // The holiday countdown card is always in the same row.
  assert.match(html, /Next holiday/);
  // Savings and Debts are tiles that open their own pages rather than editors.
  assert.match(html, /Savings/);
  assert.match(html, /Debts/);
  assert.equal((html.match(/card-link/g) ?? []).length, 2, 'both tiles link somewhere');
});

test('an income date that has gone reads as passed', async () => {
  const { Dashboard } = await server.ssrLoadModule('/src/views/overview.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const ds = dataset({
    dataset: {
      incomeSchedules: {
        pip: [{ month: 'Jan', year2026: { date: '2026-01-05', amountPence: 18_000 }, year2027: { date: '', amountPence: 0 }, year2028: { date: '', amountPence: 0 } }],
        uc: [{ month: 'Jan', year2026: { date: '2026-01-26', amountPence: 12_000 }, year2027: { date: '', amountPence: 0 }, year2028: { date: '', amountPence: 0 } }],
      },
    },
  });
  const html = render(Dashboard, props(ds, { engine: buildEngine(ds) }));
  const incomeCard = html.match(/Income due[\s\S]*?<\/section>/)?.[0] ?? '';

  // The sooner date has gone, so it says so rather than counting backwards; the
  // later one still counts down until its own date passes.
  assert.match(incomeCard, /PIP passed/);
  assert.match(incomeCard, /UC (\d+ days?|today|passed)/);
});

test('the monthly view shows the same income and holiday cards', async () => {
  const { Monthly } = await server.ssrLoadModule('/src/views/overview.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const ds = dataset();
  const html = render(Monthly, props(ds, { engine: buildEngine(ds) }));

  assert.match(html, /Income due/);
  assert.match(html, /Next holiday/);
  const cards = [...html.matchAll(/<section class="card[^"]*"[\s\S]*?<\/section>/g)].map((m) => m[0]);
  const incomeCard = cards.find((card) => card.includes('Income due')) ?? '';
  assert.ok(incomeCard.length > 0, 'the income card rendered');
  assert.equal(incomeCard.includes('Universal Credit (UC)'), false, 'no per-source row in the card');
  assert.doesNotMatch(html, /month-btn/, 'the dashboard owns the only month strip');
});

test('accounts, cards, people and bills edit their own records on their own pages', async () => {
  const { Accounts, Cards, People, Bills } = await server.ssrLoadModule('/src/views/money.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const ds = dataset({
    dataset: { people: [{ shortName: 'Dan', fullName: 'Dan Smith', openingPence: 0, sortOrder: 1, active: true }] },
  });
  const viewProps = props(ds, { engine: buildEngine(ds) });

  const accounts = render(Accounts, viewProps);
  assert.match(accounts, /Add account/);
  assert.match(accounts, /aria-label="Target Current"/);

  assert.match(render(Cards, viewProps), /Add card/);

  const people = render(People, viewProps);
  assert.match(people, /Add person/);
  assert.match(people, /aria-label="Short name Dan"/);

  const bills = render(Bills, viewProps);
  assert.match(bills, /Add change/);
  assert.match(bills, /Bill changes/);
});

test('settings links to the record pages instead of keeping second editors', async () => {
  const { SettingsView } = await server.ssrLoadModule('/src/views/tools.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const html = render(SettingsView, props(dataset(), { engine: buildEngine(dataset()) }));

  assert.match(html, /Open Accounts/);
  assert.match(html, /Open People/);
  assert.match(html, /Open Cards/);
  assert.doesNotMatch(html, /Add account/);
  assert.doesNotMatch(html, /Add person/);
  assert.doesNotMatch(html, /Add card/);
  assert.doesNotMatch(html, /Add change/);
  assert.doesNotMatch(html, /Update future rent/);
});

test('email verification is required for unconfirmed email accounts only', async () => {
  const { emailNeedsVerification } = await server.ssrLoadModule('/src/auth.ts');

  assert.equal(emailNeedsVerification({ email_confirmed_at: null, confirmed_at: null, app_metadata: { provider: 'email' } }), true);
  assert.equal(emailNeedsVerification({ email_confirmed_at: '2026-11-16T00:00:00Z', app_metadata: { provider: 'email' } }), false);
  assert.equal(emailNeedsVerification({ email_confirmed_at: null, confirmed_at: null, app_metadata: { provider: 'google' } }), false);
  assert.equal(emailNeedsVerification(null), false);
});

test('the email verification page blocks sync and offers resend and local use', async () => {
  const { EmailVerificationPage } = await server.ssrLoadModule('/src/views/login.tsx');
  const html = render(EmailVerificationPage, { email: 'owner@example.test', onSignOut: () => {}, onUseLocally: () => {} });

  assert.match(html, /Check your inbox/);
  assert.match(html, /Resend confirmation email/);
  assert.match(html, /Sign out and use this device only/);
  assert.match(html, /Cloud sync stays off/);
});

test('the hosted build opens the real budget for a signed-in user', async () => {
  const app = fs.readFileSync(path.join(ROOT, 'app', 'src', 'App.tsx'), 'utf8');

  // The demo-only gate was withdrawn by the owner on 2026-11-17, so a hosted
  // session reaches the normal cloud workspace instead of an account-settings page.
  assert.doesNotMatch(app, /HostedAccountSettings/);
  assert.doesNotMatch(app, /hostedAccount/);
  assert.doesNotMatch(app, /setPeopleRoute\(!HOSTED_WEB/);
  // A confirmed email is still required before cloud sync.
  assert.match(app, /emailNeedsVerification\(session.user\)/);
  // Hosted is always a cloud workspace, so it never shows the mode chooser or a
  // device-only budget.
  assert.match(app, /if \(HOSTED_WEB\) return 'cloud';/);
  assert.match(app, /onContinueLocally=\{HOSTED_WEB \? undefined/);
});

test('the hosted import screen offers CSV only, with no bank linking', async () => {
  const { ImportView } = await server.ssrLoadModule('/src/views/tools.tsx');
  const ds = dataset();
  const html = render(ImportView, props(ds));

  // The Starling and Enable Banking feeds need the Electron bridge, so the
  // hosted build must not advertise them at all.
  assert.match(html, /Bank CSV import/);
  assert.doesNotMatch(html, /Starling/);
  assert.doesNotMatch(html, /Open Banking/);
  assert.doesNotMatch(html, /Enable Banking/);
  assert.doesNotMatch(html, /Windows desktop app/i);
});

test('a hosted sign-out clears the cached budget only once it is synced', async () => {
  const { hostedKeysToClear } = await server.ssrLoadModule('/src/store.ts');
  const keys = [
    'financehub.state.v1:abc',
    'financehub.state.v1:abc.last-good.v1',
    'financehub.sync.outbox.v1:abc',
    'financehub.applock.v1',
    'sb-project-auth-token',
  ];

  assert.deepEqual(hostedKeysToClear(keys, '[]'), [
    'financehub.state.v1:abc',
    'financehub.state.v1:abc.last-good.v1',
    'financehub.sync.outbox.v1:abc',
  ]);
  // Pending edits are the only copy: keep everything rather than lose them.
  assert.deepEqual(hostedKeysToClear(keys, '[{"state":{}}]'), []);
  assert.deepEqual(hostedKeysToClear(keys, 'not json'), []);
});

test('the Virgin page keeps only the contract and ledger', async () => {
  const { ProviderView } = await server.ssrLoadModule('/src/views/providers.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const virgin = {
    statement: [],
    ledgerOpeningPence: 0,
    monthlyPaymentPence: 3_299,
    paymentDay: 5,
    contract: { accountName: 'Virgin Media', endDate: '2028-09-30', tiers: [], paymentsPence: 0, remainingPaymentsPence: 0 },
  };
  const ds = dataset({ dataset: { providers: { virgin, water: { statement: [], ledgerOpeningPence: 0, accountName: 'Thames Water' } } } });
  const virginPage = render(ProviderView, {
    ...props(ds, { engine: buildEngine(ds) }),
    provider: 'virgin',
    title: 'Virgin Media',
    subtitle: 'Broadband',
  });

  // Both summary sections are hidden for Virgin; the contract and ledger stay.
  assert.equal(virginPage.includes('Account details'), false, 'no account details section');
  assert.equal(virginPage.includes('Account access'), false, 'no account access section');
  assert.match(virginPage, /Virgin Media/);

  // The same sections still render for a provider that uses them.
  const waterPage = render(ProviderView, {
    ...props(ds, { engine: buildEngine(ds) }),
    provider: 'water',
    title: 'Water',
    subtitle: 'Thames Water',
  });
  assert.match(waterPage, /Account details/);
  assert.match(waterPage, /Account access/);
});
