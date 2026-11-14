/**
 * UI smoke tests for the screens that were added after the workbook parity
 * suite. The real views are loaded through Vite (the same TSX transform as the
 * app) and rendered to static markup, so a broken import, hook or view
 * contract fails here before it can reach the packaged app.
 */
import assert from 'node:assert/strict';
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
  assert.match(html, /1\/7 restore points/);
  assert.match(html, /Before large edit/);
  assert.match(html, /2 KB/);
  assert.match(html, />Restore<\/button>/);
  assert.match(html, /Export encrypted backup/);
  assert.match(html, /Save restore point/);

  const empty = render(EncryptedBackupSection, props(ds, { userId: 'ui-smoke-empty' }));
  assert.match(empty, /0\/7 restore points/);
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
