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
  // Headers carry scope="col" for screen readers, so match the label itself.
  assert.match(html, /<th[^>]*>Category<\/th>/);
  assert.match(html, /<th[^>]*>Tags<\/th>/);
});

test('the income page follows the year chosen in the app bar', async () => {
  const { Income } = await server.ssrLoadModule('/src/views/overview.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const row = (month, date2026, amount2026, date2027, amount2027) => ({
    month,
    year2026: { date: date2026, amountPence: amount2026 },
    year2027: { date: date2027, amountPence: amount2027 },
    year2028: { date: '', amountPence: 0 },
  });
  const ds = dataset({
    dataset: {
      incomeSchedules: {
        pip: [row('Jan', '2026-01-27', 10_000, '2027-01-26', 20_000), row('Apr', '2026-04-21', 10_000, '2027-04-20', 20_000)],
        uc: [row('Jan', '2026-01-27', 50_000, '2027-01-27', 60_000)],
      },
    },
  });

  const html2027 = render(Income, props(ds, { engine: buildEngine(ds), year: 2027 }));
  assert.match(html2027, /Add 2027 payment/);
  assert.match(html2027, /2027 schedule/);
  assert.match(html2027, /Change 2027 amount from a month/);
  assert.match(html2027, /value="2027-01-26"/, 'the 2027 payment date is shown');
  assert.match(html2027, /value="200.00"/, 'the 2027 amount is shown');
  assert.equal(html2027.includes('Add 2026 payment'), false, 'the add form does not stay on 2026');

  const html2026 = render(Income, props(ds, { engine: buildEngine(ds), year: 2026 }));
  assert.match(html2026, /Add 2026 payment/);
  assert.match(html2026, /value="100.00"/);
  assert.equal(html2026.includes('Add 2027 payment'), false);
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
  assert.match(html, /Delete selected/);
  assert.match(html, /aria-label="Select all notifications"/);
  assert.match(html, /aria-label="Select Rent is due in 3 days"/);
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
  assert.match(html, /1\/7 manual · 0\/7 daily/);
  assert.match(html, /Before large edit/);
  assert.match(html, /2 KB/);
  assert.match(html, />Restore<\/button>/);
  assert.match(html, /Export encrypted backup/);
  assert.match(html, /Save restore point/);

  const empty = render(EncryptedBackupSection, props(ds, { userId: 'ui-smoke-empty' }));
  assert.match(empty, /0\/7 manual · 0\/7 daily/);
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
  assert.match(html, /Scheduled bills/);
  assert.match(html, /Paid from log/);
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
  assert.doesNotMatch(accounts, /Pseudo-accounts and excluded rows/);
  assert.doesNotMatch(accounts, /— linked account/);

  assert.match(render(Cards, viewProps), /Add card/);

  const people = render(People, viewProps);
  assert.match(people, /Add person/);
  assert.match(people, /aria-label="Short name Dan"/);
  assert.match(people, /People sign-ins/);

  const bills = render(Bills, viewProps);
  assert.match(bills, /Add change/);
  assert.match(bills, /Bill changes/);
  assert.match(bills, /Bills and link sheets/);
  assert.doesNotMatch(bills, /Bill link sheets/, 'link sheets share the bills section');
  const billsSection = bills.slice(bills.indexOf('Bills and link sheets'));
  const panel = billsSection.slice(0, billsSection.indexOf('</section>'));
  assert.match(panel, /Add link sheet/, 'link sheets stay inside the bills panel');
  assert.match(panel, /Rename link sheet/, 'a sheet can be renamed from the bills panel');
  assert.doesNotMatch(bills, /<th[^>]*>Link sheet<\/th>/, 'no separate link sheet table');
  assert.doesNotMatch(panel, /<th[^>]*>Paid from<\/th>/, 'Paid from starts hidden');
  assert.match(bills, /Show Paid from/, 'the header keeps the hidden column reachable');
  assert.doesNotMatch(bills, /Possible subscriptions|Expiry list|Price history/, 'bills keeps only bills, bill changes and link sheets');
  assert.doesNotMatch(bills, /Scheduled for /, 'the monthly run lives on Monthly');
});

test('a future year keeps removed and stopped bills behind one toggle, without a whole-bill delete', async () => {
  const { Bills } = await server.ssrLoadModule('/src/views/money.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const bill = (name, active) => ({
    name, amountPence: 3000, dueDay: 5, linkedSheet: '', frequency: 'Monthly',
    latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active,
    effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 3000, baseDueDay: 5,
  });
  const ds = dataset({
    dataset: {
      bills: [bill('Rent', true), bill('Broadband', true), bill('Old Gym', false)],
      billChanges: [{
        bill: 'Broadband', appliesFrom: '2027-01-01', appliesTo: '', amountOverridePence: null,
        dueDateOverride: '', dueDayOverride: null, changeType: 'Removed',
        note: 'Removed from 2027 and later years', skip: true,
      }],
    },
  });
  const html = render(Bills, props(ds, { engine: buildEngine(ds), year: 2027 }));

  assert.match(html, /2027 bill plan and link sheets/);
  assert.match(html, /1 active · 2 stopped or removed/, 'a removal counts with the stopped bills');
  assert.match(html, /Show stopped and removed bills/, 'one toggle reaches both kinds');
  assert.doesNotMatch(html, /Bill name Broadband/, 'a removed bill is out of the plan list');
  assert.doesNotMatch(html, /Bill name Old Gym/, 'a stopped bill is out of the plan list');
  assert.match(html, /Keep in 2027 undoes that removal/, 'the removal is undone from this tab');
  assert.match(html, /to delete a bill from every year, use the current year/, 'a whole-bill delete is not offered in a plan year');
  assert.doesNotMatch(html, /Delete/, 'so a plan year can never take the bill out of an earlier year');
});

test('a provider-linked bill reads its plan amount in a future year too', async () => {
  const { Bills } = await server.ssrLoadModule('/src/views/money.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const ds = dataset({
    dataset: {
      bills: [{
        name: 'Water', amountPence: 3500, dueDay: 14, linkedSheet: 'Water', frequency: 'Monthly',
        latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
        effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 3500, baseDueDay: 14,
      }],
      providers: { water: {} },
    },
  });
  const html = render(Bills, props(ds, { engine: buildEngine(ds), year: 2027 }));

  assert.match(html, /from the Water plan/, 'the plan owns the figure, as in the live year');
  assert.doesNotMatch(html, /aria-label="2027 amount Water"/, 'the plan amount is not editable in a future year');
  assert.doesNotMatch(html, /aria-label="2027 due day Water"/, 'the due day is set on the provider page instead');
});

test('every provider page carries the due date card that writes the linked bill', async () => {
  const { ProviderView, Rent } = await server.ssrLoadModule('/src/views/providers.tsx');
  const { newProviderData } = await server.ssrLoadModule('/src/providerSetup.ts');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const ds = dataset({
    dataset: {
      providers: {
        water: newProviderData('water', 2026),
        o2: newProviderData('o2', 2026),
        rent: newProviderData('rent', 2026),
      },
      bills: [{
        name: 'Water', amountPence: 3500, dueDay: 14, linkedSheet: 'Water', frequency: 'Monthly',
        latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
        effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 3500, baseDueDay: 14,
      }],
    },
  });
  const viewProps = props(ds, { engine: buildEngine(ds) });

  for (const [provider, title] of [['water', 'Water'], ['o2', 'O2']]) {
    const html = render(ProviderView, { ...viewProps, provider, title, subtitle: 'Ledger' });
    assert.match(html, /Due date/, `${title} has the due date card`);
    assert.match(html, new RegExp(`aria-label="${title} due day"`), `${title} has an editable day`);
    assert.match(html, /copies the same day to the linked bill/, 'the card says where the day goes');
  }

  const rent = render(Rent, viewProps);
  assert.match(rent, /aria-label="Rent due day"/, 'the Rent page carries the same card');
});

test('settings keeps only its own controls, not record or sign-in editors', async () => {
  const { SettingsView } = await server.ssrLoadModule('/src/views/tools/index.ts');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const html = render(SettingsView, props(dataset(), { engine: buildEngine(dataset()) }));

  assert.doesNotMatch(html, /Open Accounts/);
  assert.doesNotMatch(html, /People sign-ins/);
  assert.doesNotMatch(html, /Add account/);
  assert.doesNotMatch(html, /Add person/);
  assert.doesNotMatch(html, /Add card/);
  assert.doesNotMatch(html, /Add change/);
  assert.doesNotMatch(html, /Update future rent/);
  assert.doesNotMatch(html, /Duplicate check/);
  assert.match(html, /🌙 Dark/);
  assert.match(html, /☀ Light/);
  assert.match(html, /◐ Contrast/);
});

test('the dashboard duplicate notice sends you to data health', async () => {
  const { Dashboard } = await server.ssrLoadModule('/src/views/overview.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const row = { date: '2026-11-03', account: 'Current', type: 'Expense', amountPence: 1_000, comments: '', status: '', budgetTreatment: '' };
  const ds = dataset({ transactions: [{ ...row, row: 1 }, { ...row, row: 2 }] });
  const html = render(Dashboard, props(ds, { engine: buildEngine(ds) }));

  assert.match(html, /1 duplicate group/);
  assert.match(html, /Review in Data health/);
  assert.doesNotMatch(html, /Review duplicate check/);
});

test('data health owns the duplicate review and merge', async () => {
  const { DataHealthView } = await server.ssrLoadModule('/src/views/health.tsx');
  const { buildEngine } = await server.ssrLoadModule('/../core/engine.ts');
  const row = { date: '2026-11-03', account: 'Current', type: 'Expense', amountPence: 1_000, comments: 'Shop', status: '', budgetTreatment: '' };
  const ds = dataset({ transactions: [{ ...row, row: 1 }, { ...row, row: 2 }] });
  const html = render(DataHealthView, props(ds, { engine: buildEngine(ds) }));

  assert.match(html, /Duplicate review/);
  assert.match(html, /Merge into row 1/);
});

test('a 2027 holiday moves out of the 2026 bucket on load', async () => {
  const { normaliseHolidayYears } = await server.ssrLoadModule('/src/store.ts');
  const state = {
    version: 1,
    dataset: dataset({
      dataset: {
        holidays: {
          2026: [
            { event: 'December', start: '2026-12-22', end: '2026-12-29', nights: 7 },
            { event: 'Mum 2027', start: '2027-04-17', end: '2027-04-24', nights: 7 },
          ],
        },
      },
    }),
    theme: 'dark',
    savedAt: '2026-11-22',
  };

  const next = normaliseHolidayYears(state);
  assert.deepEqual(next.dataset.holidays['2026'].map((row) => row.event), ['December']);
  assert.deepEqual(next.dataset.holidays['2027'].map((row) => row.event), ['Mum 2027']);
  assert.equal(normaliseHolidayYears(next), next, 'a second load changes nothing');
});

test('the AI assistant asks for a key before it chats, without the vault', async () => {
  const { AssistantView } = await server.ssrLoadModule('/src/views/assistant.tsx');
  const withoutKey = render(AssistantView, props(dataset()));
  assert.match(withoutKey, /OpenRouter key/);
  assert.match(withoutKey, /Settings → AI/);
  assert.doesNotMatch(withoutKey, /vault is locked/i);
});

test('the AI settings pane saves a key without a vault passphrase', async () => {
  const { AiSettings } = await server.ssrLoadModule('/src/views/aiSettings.tsx');
  const html = render(AiSettings, props(dataset(), { vault: null, vaultSession: null }));
  assert.match(html, /OpenRouter API key/);
  assert.match(html, /Save AI settings/);
  assert.doesNotMatch(html, /Vault passphrase/);
});

test('a holiday trip can take extra cost lines', async () => {
  const { Holidays } = await server.ssrLoadModule('/src/views/holidays.tsx');
  const ds = dataset({
    dataset: {
      holidays: {
        2026: [
          { event: 'Unity - Mum', start: '2026-08-01', end: '2026-08-05', nights: 4, totalPence: 40000, paid: '✓ Paid' },
        ],
        2027: [
          { event: 'Mum 2027', start: '2027-04-17', end: '2027-04-24', nights: 7, totalPence: 30000, paid: '✓ Paid' },
        ],
      },
    },
  });
  const html = render(Holidays, props(ds));

  assert.match(html, /Unity - Mum/);
  assert.match(html, /Add cost line/);
  assert.doesNotMatch(html, /Mum 2027/, 'a later year is not listed while this year is selected');
  assert.doesNotMatch(html, /Cost lines share a trip/, 'the cost-line explainer notice is gone');

  const later = render(Holidays, props(ds, { year: 2027 }));
  assert.match(later, /Mum 2027/);
  assert.doesNotMatch(later, /Unity - Mum/, 'the selected year is the only one listed');
});

test('the budget changelog drops the old automatic per-save rows', async () => {
  const { ChangelogView } = await server.ssrLoadModule('/src/views/tools/index.ts');
  const ds = dataset({
    dataset: {
      changelog: [
        { date: '2026-11-22', sheetCell: 'Budget change — Transactions', description: 'Updated Transactions; balances recalculated.', auto: true },
        { date: '2026-11-21', sheetCell: 'Month end closed — October 2026', description: 'Balances recorded.', auto: true },
        { date: '2026-11-20', sheetCell: 'Reconciled October', description: 'My own note', custom: true },
      ],
    },
  });
  const html = render(ChangelogView, props(ds));

  assert.doesNotMatch(html, /Budget change — Transactions/);
  assert.match(html, /Month end closed/);
  assert.match(html, /Reconciled October/);
});

test('guides are one help page with both workflows', async () => {
  const { GuidesView } = await server.ssrLoadModule('/src/views/tools/index.ts');
  const html = render(GuidesView, props(dataset()));

  assert.equal((html.match(/class="tab/g) ?? []).length, 0, 'no workflow tabs');
  assert.match(html, /Help contents/);
  assert.match(html, /id="guide-month-end"/);
  assert.match(html, /id="guide-new-year"/);
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
  const { ImportView } = await server.ssrLoadModule('/src/views/tools/index.ts');
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
  assert.doesNotMatch(waterPage, /Payment date/, 'no payment date card on the provider sheet');
});
