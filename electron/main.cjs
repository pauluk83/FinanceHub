'use strict';
const { app, BrowserWindow, Menu, dialog, shell, ipcMain, session } = require('electron');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const { createSecureStore } = require('./secure-store.cjs');
const { signEnableBankingJwt } = require('./enable-banking-jwt.cjs');
const {
  buildBlockPlan,
  reconstructAsar,
  shouldOfferUpdate,
  validateManifest,
} = require('./update-core.cjs');

let secureStore = null;
let mainWindow = null;
let oauthServer = null;
let closeAllowed = false;
let closeRequested = false;
let storeServer = null;
let lastBrowserPing = 0;
let storeStartedAt = 0;
let updateState = { phase: 'idle' };
let updateManifest = null;
let updatePlan = null;
let updateArchivePath = null;
let updateController = null;
let pendingInstall = null;
let installTimer = null;
let installStarted = false;
const OAUTH_PORT = 53682;
const OAUTH_CALLBACK = `http://127.0.0.1:${OAUTH_PORT}/auth/callback`;
const STORE_PORT = 53683;
const STARLING_API = 'https://api.starlingbank.com/api/v2';
const STARLING_TOKEN_KEY = 'bank.starling.personal-token';
const EB_API = 'https://api.enablebanking.com';
const EB_APP_ID_KEY = 'bank.enablebanking.app-id';
const EB_KEY_KEY = 'bank.enablebanking.private-key';
const EB_SESSIONS_KEY = 'bank.enablebanking.sessions';
const EB_CALLBACK_PORT = 53684;
const EB_CALLBACK_PATH = '/enablebanking/callback';
const EB_CALLBACK_LOCAL = `http://127.0.0.1:${EB_CALLBACK_PORT}${EB_CALLBACK_PATH}`;
// Enable Banking requires HTTPS production redirects, so the hosted bounce page
// forwards the consent result to this loopback listener.
const EB_REDIRECT_URL = 'https://financehub-uk.pages.dev/bank-callback.html';
const UPDATE_MANIFEST_URL = 'https://github.com/pauluk83/FinanceHub/releases/latest/download/update-manifest.json';
const UPDATE_ARCHIVE_URL = 'https://github.com/pauluk83/FinanceHub/releases/latest/download/FinanceHub-app.asar';
const SERVE_ONLY = process.argv.includes('--serve');
const STORE_STARTUP_TIMEOUT = 2 * 60 * 1000;
// OAuth redirects leave the FinanceHub page for several minutes, so the store must
// outlive the 30-second browser heartbeat long enough for sign-in to return.
const BROWSER_IDLE_TIMEOUT = 15 * 60 * 1000;

function appPageUrl() {
  return pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
}

function isAppPage(url) {
  const page = appPageUrl();
  return url === page || url.startsWith(`${page}#`) || url.startsWith(`${page}?`);
}

function isTrustedSender(event) {
  try {
    return isAppPage(event.senderFrame?.url ?? '');
  } catch {
    return false;
  }
}

function openExternalHttps(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
    void shell.openExternal(parsed.toString());
    return true;
  } catch {
    return false;
  }
}

function installWebContentsGuards() {
  app.on('web-contents-created', (_event, contents) => {
    const blockNavigation = (event, url) => {
      if (isAppPage(url)) return;
      event.preventDefault();
      openExternalHttps(url);
    };

    contents.on('will-navigate', blockNavigation);
    contents.on('will-redirect', blockNavigation);
    contents.setWindowOpenHandler(({ url }) => {
      openExternalHttps(url);
      return { action: 'deny' };
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function oauthPage(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#0a101c;color:#e6edf7;font:16px/1.5 Segoe UI,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}main{max-width:32rem;padding:2rem;border:1px solid #2b3f60;border-radius:14px;background:#101a2b}h1{margin:0 0 .6rem;font-size:1.35rem}p{margin:0;color:#8fa3bf}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

function registerOAuthCallback() {
  ipcMain.on('oauth:open-external', (event, url) => {
    if (!isTrustedSender(event)) {
      console.error('Rejected OAuth request from an untrusted renderer');
      return;
    }
    if (!openExternalHttps(url)) console.error('Rejected OAuth URL');
  });

  oauthServer = http.createServer((req, res) => {
    const host = req.headers.host ?? '';
    if (host !== `127.0.0.1:${OAUTH_PORT}` && host !== `localhost:${OAUTH_PORT}`) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    if (req.method !== 'GET' || req.url?.split('?')[0] !== '/auth/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const url = new URL(req.url ?? '/', OAUTH_CALLBACK);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error_description') || url.searchParams.get('error');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('oauth:callback', { code, error });
    }

    const title = error || !code ? 'Sign-in failed' : 'Sign-in complete';
    const message = error || !code
      ? (error || 'The provider did not return an authorization code.')
      : 'You can close this tab and return to FinanceHub.';
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(oauthPage(title, message));
  });

  oauthServer.on('error', (error) => {
    console.error('OAuth callback server unavailable:', error);
    oauthServer = null;
  });
  oauthServer.listen(OAUTH_PORT, '127.0.0.1', () => {
    console.log(`OAuth callback listening at ${OAUTH_CALLBACK}`);
  });
}

function starlingToken() {
  if (!secureStore) throw new Error('Secure local storage is unavailable');
  const token = secureStore.get(STARLING_TOKEN_KEY);
  if (!token) throw new Error('Save a Starling personal access token first');
  return token;
}

function validStarlingToken(token) {
  return typeof token === 'string' && /^\S{20,4096}$/.test(token.trim());
}

function starlingDate(value) {
  const text = typeof value === 'string' ? value : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function starlingDateRangeProblem(min, max) {
  const start = starlingDate(min);
  const end = starlingDate(max);
  if (!start || !end) return 'Choose a valid start and end date.';
  if (end < start) return 'The end date must not be before the start date.';
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  if (days > 365) return 'Starling allows at most one year of transactions per request.';
  return null;
}

async function starlingRequest(path) {
  const token = starlingToken();
  const response = await fetchWithTimeout(`${STARLING_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': `FinanceHub/${app.getVersion()}`,
    },
  }, 20000);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Starling rejected the personal access token. Create a new token and try again.');
    if (response.status === 403) throw new Error('Starling did not grant this token the account:read and transaction:read scopes.');
    if (response.status === 429) throw new Error('Starling is rate-limiting this app. Wait a moment and try again.');
    if (response.status === 400) throw new Error('Starling rejected the date range or account. Check the account and the open period.');
    const detail = payload && typeof payload === 'object' && typeof payload.error_description === 'string'
      ? ` ${payload.error_description.slice(0, 160)}`
      : '';
    throw new Error(`Starling returned HTTP ${response.status}.${detail}`);
  }
  return payload;
}

function registerStarlingBank() {
  const reply = async (event, action) => {
    if (!isTrustedSender(event)) return { ok: false, error: 'Untrusted renderer' };
    try {
      return { ok: true, value: await action() };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'The Starling request failed',
      };
    }
  };

  ipcMain.handle('bank:starling:status', (event) => reply(event, () => ({
    hasToken: Boolean(secureStore?.get(STARLING_TOKEN_KEY)),
    secureStorage: Boolean(secureStore),
  })));

  ipcMain.handle('bank:starling:save-token', (event, token) => reply(event, () => {
    if (!secureStore) throw new Error('Secure local storage is unavailable');
    if (!validStarlingToken(token)) throw new Error('Paste a valid Starling personal access token');
    secureStore.set(STARLING_TOKEN_KEY, token.trim());
    return { hasToken: true, secureStorage: true };
  }));

  ipcMain.handle('bank:starling:forget', (event) => reply(event, () => {
    if (!secureStore) throw new Error('Secure local storage is unavailable');
    secureStore.remove(STARLING_TOKEN_KEY);
    return { hasToken: false, secureStorage: true };
  }));

  ipcMain.handle('bank:starling:accounts', (event) => reply(event, async () => {
    const payload = await starlingRequest('/accounts');
    const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
    return accounts
      .map((account) => ({
        accountUid: account?.accountUid,
        defaultCategoryUid: account?.defaultCategory ?? account?.defaultCategoryUid,
        name: account?.name,
        accountType: account?.accountType,
        currency: account?.currency,
        createdAt: account?.createdAt,
      }))
      .filter((account) => typeof account.accountUid === 'string'
        && typeof account.defaultCategoryUid === 'string'
        && typeof account.name === 'string');
  }));

  ipcMain.handle('bank:starling:transactions', (event, params) => reply(event, async () => {
    const accountUid = typeof params?.accountUid === 'string' ? params.accountUid : '';
    const categoryUid = typeof params?.categoryUid === 'string' ? params.categoryUid : '';
    const min = starlingDate(params?.min);
    const max = starlingDate(params?.max);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountUid)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryUid)) {
      throw new Error('Choose a valid Starling account first');
    }
    const rangeProblem = starlingDateRangeProblem(min, max);
    if (rangeProblem) throw new Error(rangeProblem);
    const query = new URLSearchParams({
      minTransactionTimestamp: `${min}T00:00:00.000Z`,
      maxTransactionTimestamp: `${max}T23:59:59.999Z`,
    });
    const payload = await starlingRequest(
      `/feed/account/${encodeURIComponent(accountUid)}/category/${encodeURIComponent(categoryUid)}/transactions-between?${query.toString()}`,
    );
    const feedItems = Array.isArray(payload?.feedItems) ? payload.feedItems : [];
    return feedItems.map((item) => ({
      feedItemUid: item?.feedItemUid,
      status: item?.status,
      direction: item?.direction,
      amount: item?.amount && typeof item.amount === 'object' ? {
        currency: item.amount.currency,
        minorUnits: item.amount.minorUnits ?? item.amount.minorUnit,
      } : null,
      transactionTime: item?.transactionTime,
      counterPartyName: item?.counterPartyName,
      reference: item?.reference,
      transactionType: item?.transactionType,
    }));
  }));
}

/* --------------------------------------- Enable Banking (Open Banking AIS) */

let ebCallbackServer = null;
let ebPendingLink = null;
let ebCallbackServerFailure = '';

function ebCredentials() {
  if (!secureStore) throw new Error('Secure local storage is unavailable');
  return {
    appId: secureStore.get(EB_APP_ID_KEY) || '',
    privateKey: secureStore.get(EB_KEY_KEY) || '',
  };
}

function ebStoredSessions() {
  if (!secureStore) return [];
  try {
    const raw = secureStore.get(EB_SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
}

function ebSaveSessions(sessions) {
  if (!secureStore) throw new Error('Secure local storage is unavailable');
  secureStore.set(EB_SESSIONS_KEY, JSON.stringify(sessions));
}

/** RS256 JWT signed with the application's private key (kid = application ID). */
function ebJwt() {
  const { appId, privateKey } = ebCredentials();
  if (!appId || !privateKey) throw new Error('Save the Enable Banking application ID and private key first');
  return signEnableBankingJwt(appId, privateKey);
}

async function ebRequest(pathname, init = {}) {
  const response = await fetchWithTimeout(`${EB_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ebJwt()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  }, 25000);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Enable Banking rejected the application ID or private key. Save them again.');
    }
    if (response.status === 429) throw new Error('Enable Banking is rate-limiting this app. Wait a moment and try again.');
    if (response.status === 400) {
      const detail = typeof payload?.message === 'string' ? ` ${payload.message.slice(0, 160)}` : '';
      throw new Error(`Enable Banking rejected the request.${detail}`);
    }
    const detail = typeof payload?.message === 'string' ? ` ${payload.message.slice(0, 160)}` : '';
    throw new Error(`Enable Banking returned HTTP ${response.status}.${detail}`);
  }
  return payload;
}

function ebValidAppId(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function ebValidPrivateKey(value) {
  if (typeof value !== 'string') return false;
  const key = value.trim();
  if (key.length < 200 || key.length > 12000) return false;
  if (!/^-----BEGIN (RSA )?PRIVATE KEY-----/.test(key) || !/-----END (RSA )?PRIVATE KEY-----$/.test(key)) return false;
  try {
    crypto.createPrivateKey(key);
    return true;
  } catch {
    return false;
  }
}

function ebEnsureCallbackServer() {
  if (ebCallbackServer) return;
  ebCallbackServer = http.createServer(async (req, res) => {
    const host = req.headers.host ?? '';
    if (host !== `127.0.0.1:${EB_CALLBACK_PORT}` && host !== `localhost:${EB_CALLBACK_PORT}`) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    if (req.method !== 'GET' || (req.url ?? '').split('?')[0] !== EB_CALLBACK_PATH) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const url = new URL(req.url ?? '/', EB_CALLBACK_LOCAL);
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const providerError = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
    let title = 'Bank connection failed';
    let message = providerError || 'The bank did not return an authorisation code.';
    let ok = false;
    try {
      if (!ebPendingLink) throw new Error('Start the bank connection from FinanceHub again.');
      if (!state || state !== ebPendingLink.state) {
        throw new Error('The bank returned an unexpected consent state. Start the connection again.');
      }
      if (providerError) throw new Error(providerError);
      if (!code) throw new Error(message);

      const session = await ebRequest('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
      const accounts = (Array.isArray(session?.accounts) ? session.accounts : [])
        .map((entry) => ({
          uid: typeof entry?.uid === 'string' ? entry.uid : '',
          name: typeof entry?.name === 'string' ? entry.name : (typeof entry?.product === 'string' ? entry.product : 'Linked account'),
          currency: typeof entry?.currency === 'string' ? entry.currency.toUpperCase() : '',
        }))
        .filter((entry) => entry.uid);
      const record = {
        sessionId: typeof session?.session_id === 'string' ? session.session_id : '',
        aspspName: ebPendingLink.name,
        aspspCountry: ebPendingLink.country,
        validUntil: typeof session?.access?.valid_until === 'string' ? session.access.valid_until : '',
        accounts,
        linkedAt: new Date().toISOString(),
      };
      if (!record.sessionId) throw new Error('Enable Banking did not return a session for that bank.');
      ebSaveSessions([...ebStoredSessions().filter((entry) => entry.sessionId !== record.sessionId), record]);
      ok = true;
      title = 'Bank connected';
      message = 'You can close this tab and return to FinanceHub.';
    } catch (error) {
      message = error instanceof Error ? error.message : 'The bank connection failed.';
    }
    ebPendingLink = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bank:enablebanking:linked', { ok, error: ok ? null : message });
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(oauthPage(title, message));
  });
  ebCallbackServer.on('error', (error) => {
    console.error('Enable Banking callback listener unavailable:', error);
    ebCallbackServerFailure = 'The local bank callback port is unavailable. Close any other copy of FinanceHub and try again.';
    ebCallbackServer = null;
  });
  ebCallbackServer.listen(EB_CALLBACK_PORT, '127.0.0.1', () => {
    ebCallbackServerFailure = '';
    console.log(`Bank callback listening at ${EB_CALLBACK_LOCAL}`);
  });
}

function registerEnableBanking() {
  const reply = async (event, action) => {
    if (!isTrustedSender(event)) return { ok: false, error: 'Untrusted renderer' };
    try {
      return { ok: true, value: await action() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'The Enable Banking request failed' };
    }
  };

  ipcMain.handle('bank:enablebanking:status', (event) => reply(event, () => {
    const { appId, privateKey } = { appId: secureStore?.get(EB_APP_ID_KEY) || '', privateKey: secureStore?.get(EB_KEY_KEY) || '' };
    return {
      hasCredentials: Boolean(appId && privateKey),
      secureStorage: Boolean(secureStore),
      sessions: ebStoredSessions(),
    };
  }));

  ipcMain.handle('bank:enablebanking:save-credentials', (event, params) => reply(event, () => {
    if (!secureStore) throw new Error('Secure local storage is unavailable');
    const appId = typeof params?.appId === 'string' ? params.appId.trim() : '';
    const privateKey = typeof params?.privateKey === 'string' ? params.privateKey.trim() : '';
    if (!ebValidAppId(appId)) throw new Error('Paste the Enable Banking application ID (a UUID)');
    if (!ebValidPrivateKey(privateKey)) throw new Error('Paste the private key (.pem) that Enable Banking generated');
    secureStore.set(EB_APP_ID_KEY, appId);
    secureStore.set(EB_KEY_KEY, privateKey);
    return { hasCredentials: true, secureStorage: true };
  }));

  ipcMain.handle('bank:enablebanking:forget', (event) => reply(event, () => {
    if (!secureStore) throw new Error('Secure local storage is unavailable');
    for (const key of [EB_APP_ID_KEY, EB_KEY_KEY, EB_SESSIONS_KEY]) secureStore.remove(key);
    ebPendingLink = null;
    return { hasCredentials: false, secureStorage: true, sessions: [] };
  }));

  ipcMain.handle('bank:enablebanking:aspsps', (event) => reply(event, async () => {
    const payload = await ebRequest('/aspsps?country=GB');
    return Array.isArray(payload?.aspsps) ? payload.aspsps : [];
  }));

  ipcMain.handle('bank:enablebanking:link', (event, params) => reply(event, async () => {
    const name = typeof params?.name === 'string' ? params.name.trim() : '';
    const country = typeof params?.country === 'string' ? params.country.trim().toUpperCase() : 'GB';
    if (!name || name.length > 120) throw new Error('Choose a bank to connect');
    if (!/^[A-Z]{2}$/.test(country)) throw new Error('Choose a valid bank country');
    ebEnsureCallbackServer();
    if (ebCallbackServerFailure) throw new Error(ebCallbackServerFailure);
    const state = crypto.randomUUID();
    const payload = await ebRequest('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: new Date(Date.now() + 90 * 86400000).toISOString() },
        aspsp: { name, country },
        state,
        redirect_url: EB_REDIRECT_URL,
        psu_type: 'personal',
      }),
    });
    const consentUrl = typeof payload?.url === 'string' ? payload.url : '';
    let parsed = null;
    try {
      parsed = new URL(consentUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== 'https:' || !/(^|\.)enablebanking\.com$/i.test(parsed.hostname)) {
      throw new Error('Enable Banking did not return a valid consent URL');
    }
    ebPendingLink = { state, name, country };
    void shell.openExternal(parsed.toString());
    return { opened: true };
  }));

  ipcMain.handle('bank:enablebanking:accounts', (event) => reply(event, () => ebStoredSessions()));

  ipcMain.handle('bank:enablebanking:transactions', (event, params) => reply(event, async () => {
    const accountUid = typeof params?.accountUid === 'string' ? params.accountUid : '';
    const min = starlingDate(params?.min);
    const max = starlingDate(params?.max);
    if (!accountUid) throw new Error('Choose a linked bank account');
    const rangeProblem = starlingDateRangeProblem(min, max);
    if (rangeProblem) throw new Error(rangeProblem);
    const sessions = ebStoredSessions();
    const owns = sessions.some((session) => Array.isArray(session.accounts)
      && session.accounts.some((account) => account?.uid === accountUid));
    if (!owns) throw new Error('That account is not linked to this connection');

    const base = `/accounts/${encodeURIComponent(accountUid)}/transactions`
      + `?date_from=${encodeURIComponent(min)}&date_to=${encodeURIComponent(max)}&transaction_status=BOOKED`;
    const items = [];
    let pathname = base;
    for (let page = 0; page < 10; page += 1) {
      const payload = await ebRequest(pathname);
      if (Array.isArray(payload?.transactions)) items.push(...payload.transactions);
      const next = typeof payload?.continuation_key === 'string' ? payload.continuation_key : '';
      if (!next) break;
      pathname = `${base}&continuation_key=${encodeURIComponent(next)}`;
    }
    return items.map((item) => ({
      transaction_id: item?.transaction_id,
      entry_reference: item?.entry_reference,
      status: item?.status,
      booking_date: item?.booking_date,
      value_date: item?.value_date,
      transaction_amount: item?.transaction_amount && typeof item.transaction_amount === 'object'
        ? { currency: item.transaction_amount.currency, amount: item.transaction_amount.amount }
        : null,
      credit_debit_indicator: item?.credit_debit_indicator,
      creditor: item?.creditor && typeof item.creditor === 'object' ? { name: item.creditor.name } : null,
      debtor: item?.debtor && typeof item.debtor === 'object' ? { name: item.debtor.name } : null,
      remittance_information: Array.isArray(item?.remittance_information)
        ? item.remittance_information.filter((line) => typeof line === 'string')
        : undefined,
      transaction_code: item?.transaction_code,
    }));
  }));
}

function registerSecureStorage() {
  try {
    secureStore = createSecureStore(path.join(app.getPath('userData'), 'financehub.sqlite'));
  } catch (error) {
    console.error('Unable to open the secure local database:', error);
  }

  const reply = (event, action) => {
    if (!isTrustedSender(event)) {
      event.returnValue = { ok: false, error: 'Untrusted renderer' };
      return;
    }
    try {
      event.returnValue = { ok: true, value: action() };
    } catch (error) {
      event.returnValue = {
        ok: false,
        error: error instanceof Error ? error.message : 'Secure storage failed',
      };
    }
  };

  ipcMain.on('secure-storage:get', (event, key) => {
    reply(event, () => secureStore ? secureStore.get(key) : null);
  });
  ipcMain.on('secure-storage:set', (event, key, value) => {
    reply(event, () => {
      if (!secureStore) throw new Error('Secure local storage is unavailable');
      secureStore.set(key, value);
      return null;
    });
  });
  ipcMain.on('secure-storage:remove', (event, key) => {
    reply(event, () => {
      if (!secureStore) throw new Error('Secure local storage is unavailable');
      secureStore.remove(key);
      return null;
    });
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sharedStoreKey(key) {
  return typeof key === 'string' && key.startsWith('financehub.') && key.length <= 200;
}

function startStoreServer() {
  if (storeServer) return;
  storeStartedAt = Date.now();
  storeServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${STORE_PORT}`);
      if (url.pathname === '/api/health' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, store: Boolean(secureStore) });
        return;
      }
      if (url.pathname === '/api/ping' && req.method === 'POST') {
        lastBrowserPing = Date.now();
        sendJson(res, 200, { ok: true });
        return;
      }
      if (url.pathname === '/api/store') {
        lastBrowserPing = Date.now();
        if (!secureStore) {
          sendJson(res, 503, { ok: false, error: 'The desktop secure store is unavailable.' });
          return;
        }
        if (req.method === 'GET') {
          const values = Object.fromEntries(
            Object.entries(secureStore.list()).filter(([key]) => sharedStoreKey(key)),
          );
          sendJson(res, 200, { ok: true, values });
          return;
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!sharedStoreKey(body?.key)) {
            sendJson(res, 400, { ok: false, error: 'This key is not available through the shared browser store.' });
            return;
          }
          if (body.value === null) secureStore.remove(body.key);
          else if (typeof body.value === 'string') secureStore.set(body.key, body.value);
          else {
            sendJson(res, 400, { ok: false, error: 'A string value or null is required.' });
            return;
          }
          sendJson(res, 200, { ok: true });
          return;
        }
      }
      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (error) {
      console.error('Shared store request failed:', error);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'The shared data store could not complete this request.' });
      else res.end();
    }
  });
  storeServer.on('error', (error) => {
    console.error(`Shared store unavailable on 127.0.0.1:${STORE_PORT}:`, error);
    storeServer = null;
  });
  storeServer.listen(STORE_PORT, '127.0.0.1', () => {
    console.log(`Shared store listening at http://127.0.0.1:${STORE_PORT}`);
  });
}

function watchStoreHost() {
  setInterval(() => {
    if (mainWindow) return;
    const now = Date.now();
    if (!lastBrowserPing) {
      if (now - storeStartedAt > STORE_STARTUP_TIMEOUT) app.quit();
      return;
    }
    if (now - lastBrowserPing > BROWSER_IDLE_TIMEOUT) app.quit();
  }, 10000);
}

function publishUpdate(patch) {
  updateState = { ...updateState, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:state', updateState);
  }
  return updateState;
}

function resetUpdateState() {
  updateManifest = null;
  updatePlan = null;
  updateArchivePath = null;
}

function safeUpdateError(error) {
  if (error && typeof error === 'object' && 'syscall' in error) {
    return 'The update could not be written to disk. Check free space and folder permissions, then try again.';
  }
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/[A-Za-z]:\\[^\s]+/g, '[local path]')
    .replace(/https?:\/\/\S+/g, '[remote address]')
    .slice(0, 240);
}

function installedAsarPath() {
  return path.join(process.resourcesPath, 'app.asar');
}

async function readInstalledAsar() {
  try {
    return await fs.promises.readFile(installedAsarPath());
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Same-tag releases replace assets, so bypass GitHub's download CDN cache. */
function freshDownloadUrl(url) {
  return `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`;
}

function updateAvailable(manifest, plan, requiresFullInstaller) {
  return {
    phase: 'available',
    version: manifest.version,
    buildId: manifest.buildId,
    notes: manifest.notes,
    totalBytes: manifest.asar.size,
    downloadBytes: plan.downloadBytes,
    reusedBytes: plan.reusedBytes,
    changedBlocks: plan.changedBlocks,
    totalBlocks: plan.totalBlocks,
    requiresFullInstaller,
    downloadedBytes: 0,
    speedBps: 0,
    etaSeconds: null,
    error: null,
  };
}

async function checkForUpdate(current) {
  if (!app.isPackaged) return publishUpdate({ phase: 'unsupported' });
  if (['downloading', 'ready', 'installing'].includes(updateState.phase)) return updateState;
  if (!current || typeof current.buildId !== 'string' || current.version !== app.getVersion()) {
    throw new Error('The running build information is invalid');
  }

  resetUpdateState();
  publishUpdate({ phase: 'checking', currentVersion: app.getVersion(), currentBuildId: current.buildId, error: null });

  try {
    const response = await fetchWithTimeout(freshDownloadUrl(UPDATE_MANIFEST_URL), { cache: 'no-store' });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error('The update manifest is too large');
    const manifest = validateManifest(JSON.parse(text));

    if (!shouldOfferUpdate({ version: app.getVersion(), buildId: current.buildId }, manifest)) {
      return publishUpdate({ phase: 'current' });
    }

    const oldAsar = await readInstalledAsar();
    const plan = buildBlockPlan(oldAsar, manifest);
    const requiresFullInstaller = Boolean(
      manifest.runtime?.electron && manifest.runtime.electron !== process.versions.electron,
    );
    updateManifest = manifest;
    updatePlan = plan;
    return publishUpdate(updateAvailable(manifest, plan, requiresFullInstaller));
  } catch (error) {
    console.error('Update check failed:', error);
    return publishUpdate({
      phase: 'check-error',
      error: 'Could not check GitHub for a newer build. FinanceHub will keep working normally.',
    });
  }
}

async function downloadUpdate() {
  if (updateState.phase !== 'available') throw new Error('No update is ready to download');
  if (updateState.requiresFullInstaller) throw new Error('This update needs the full installer');
  if (!updateManifest || !updatePlan) throw new Error('The update manifest is unavailable');

  const manifest = updateManifest;
  const plan = updatePlan;
  const controller = new AbortController();
  updateController = controller;
  const started = Date.now();
  let lastProgressAt = 0;
  let fullArchive = null;

  publishUpdate({
    phase: 'downloading',
    downloadedBytes: 0,
    speedBps: 0,
    etaSeconds: null,
    error: null,
  });

  try {
    const oldAsar = await readInstalledAsar();
    const archive = await reconstructAsar({
      oldAsar: oldAsar ?? Buffer.alloc(0),
      manifest,
      plan,
      readRemote: async (start, end) => {
        const response = await fetch(freshDownloadUrl(UPDATE_ARCHIVE_URL), {
          headers: {
            Range: `bytes=${start}-${end}`,
            'Cache-Control': 'no-cache',
            Accept: 'application/octet-stream',
          },
          redirect: 'follow',
          signal: controller.signal,
        });
        if (response.status === 206) {
          return Buffer.from(await response.arrayBuffer());
        }
        // GitHub normally answers a range with 206. If a proxy ignores Range,
        // keep the full body once and slice it rather than downloading it per range.
        if (response.status === 200) {
          if (!fullArchive) {
            fullArchive = Buffer.from(await response.arrayBuffer());
            if (fullArchive.length !== manifest.asar.size) throw new Error('GitHub returned an unexpected update archive');
          }
          return fullArchive.subarray(start, end + 1);
        }
        throw new Error(`GitHub answered ${response.status} for the update download`);
      },
      onProgress: ({ downloadedBytes, totalBytes }) => {
        const now = Date.now();
        if (now - lastProgressAt < 120 && downloadedBytes < totalBytes) return;
        lastProgressAt = now;
        const seconds = Math.max((now - started) / 1000, 0.2);
        const speedBps = downloadedBytes / seconds;
        publishUpdate({
          downloadedBytes,
          speedBps,
          etaSeconds: speedBps > 0 ? Math.max(0, Math.round((totalBytes - downloadedBytes) / speedBps)) : null,
        });
      },
    });

    const directory = path.join(app.getPath('userData'), 'updates', manifest.buildId);
    await fs.promises.mkdir(directory, { recursive: true });
    // Electron's fs shim treats a path ending in `.asar` as an archive. Stage
    // under a neutral extension; the helper copies it to the real app.asar path.
    const staged = path.join(directory, 'FinanceHub-update.package');
    await fs.promises.writeFile(staged, archive);
    updateArchivePath = staged;
    return publishUpdate({
      phase: 'ready',
      downloadedBytes: plan.downloadBytes,
      speedBps: Math.round(plan.downloadBytes / Math.max((Date.now() - started) / 1000, 0.2)),
      etaSeconds: 0,
      verified: true,
      error: null,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      return publishUpdate({
        phase: 'available',
        downloadedBytes: 0,
        speedBps: 0,
        etaSeconds: null,
        error: null,
      });
    }
    console.error('Update download failed:', error);
    return publishUpdate({
      phase: 'error',
      error: safeUpdateError(error),
      canRetry: true,
    });
  } finally {
    updateController = null;
  }
}

function cancelUpdateDownload() {
  updateController?.abort();
  updateController = null;
  return publishUpdate({
    phase: 'available',
    downloadedBytes: 0,
    speedBps: 0,
    etaSeconds: null,
    error: null,
  });
}

function startUpdateHelper(pending) {
  const directory = path.dirname(pending.staged);
  const script = path.join(directory, 'install-update.ps1');
  const log = path.join(directory, 'install.log');
  const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const body = [
    `$AppPid = ${Number(process.pid)}`,
    `$NewAsar = ${literal(pending.staged)}`,
    `$TargetAsar = ${literal(pending.target)}`,
    `$Exe = ${literal(pending.exe)}`,
    `$Log = ${literal(log)}`,
    "$ErrorActionPreference = 'Stop'",
    'function Wait-ForExit {',
    '  for ($i = 0; $i -lt 120; $i++) {',
    '    if (-not (Get-Process -Id $AppPid -ErrorAction SilentlyContinue)) { return }',
    '    Start-Sleep -Milliseconds 500',
    '  }',
    '}',
    'try {',
    '  Wait-ForExit',
    '  Start-Sleep -Milliseconds 700',
    '  $backup = "$TargetAsar.bak"',
    '  for ($i = 0; $i -lt 20; $i++) {',
    '    try { Copy-Item -LiteralPath $TargetAsar -Destination $backup -Force -ErrorAction Stop; break }',
    '    catch { Start-Sleep -Milliseconds 300 }',
    '  }',
    '  $copied = $false',
    '  for ($i = 0; $i -lt 40; $i++) {',
    '    try { Copy-Item -LiteralPath $NewAsar -Destination "$TargetAsar.new" -Force -ErrorAction Stop; Move-Item -LiteralPath "$TargetAsar.new" -Destination $TargetAsar -Force -ErrorAction Stop; $copied = $true; break }',
    '    catch { Start-Sleep -Milliseconds 250 }',
    '  }',
    "  if (-not $copied) { throw 'The updated archive was not written' }",
    '  Remove-Item -LiteralPath $NewAsar -Force -ErrorAction SilentlyContinue',
    '  Start-Process -FilePath $Exe',
    '} catch {',
    '  "$(Get-Date -Format o) $($_.Exception.Message)" | Out-File -LiteralPath $Log -Append -Encoding utf8',
    '  Start-Process -FilePath $Exe',
    '}',
    '',
  ].join('\r\n');
  fs.writeFileSync(script, body, 'utf8');
  const encoded = Buffer.from(body, 'utf16le').toString('base64');

  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const launch = `"${powershell}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
  const created = spawnSync(powershell, [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    [
      "$ErrorActionPreference = 'Stop'",
      `$commandLine = '${launch.replace(/'/g, "''")}'`,
      '$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine }',
      'if ($result.ReturnValue -ne 0) { throw "Process creation returned $($result.ReturnValue)" }',
    ].join('\r\n'),
  ], { windowsHide: true, encoding: 'utf8', timeout: 15000 });
  if (created.status !== 0) {
    throw new Error((created.stderr || created.error?.message || 'The update helper did not start').trim());
  }
}

function performInstallAndQuit() {
  if (!pendingInstall || installStarted) return;
  installStarted = true;
  if (installTimer) clearTimeout(installTimer);
  installTimer = null;
  try {
    startUpdateHelper(pendingInstall);
    pendingInstall = null;
    closeAllowed = true;
    app.quit();
  } catch (error) {
    installStarted = false;
    pendingInstall = null;
    closeAllowed = false;
    console.error('Update install could not start:', error);
    publishUpdate({ phase: 'ready', error: 'The update could not be started. FinanceHub is still running your current build.' });
  }
}

function installUpdate() {
  if (updateState.phase !== 'ready' || !updateArchivePath) throw new Error('No downloaded update is ready');
  if (!app.isPackaged) throw new Error('Updates can only be installed from the packaged app');
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('The FinanceHub window is not available');

  const target = installedAsarPath();
  try {
    fs.accessSync(path.dirname(target), fs.constants.W_OK);
  } catch {
    throw new Error('FinanceHub cannot write to its install folder. Reinstall the app in a per-user location, then try again.');
  }

  pendingInstall = { staged: updateArchivePath, target, exe: process.execPath };
  installStarted = false;
  publishUpdate({ phase: 'installing', error: null });
  mainWindow.webContents.send('app:before-close');
  if (installTimer) clearTimeout(installTimer);
  installTimer = setTimeout(() => {
    if (pendingInstall && !installStarted) performInstallAndQuit();
  }, 8000);
  return { ok: true };
}

function registerUpdater() {
  ipcMain.handle('updater:check', async (event, current) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted renderer');
    return checkForUpdate(current);
  });
  ipcMain.handle('updater:download', async (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted renderer');
    return downloadUpdate();
  });
  ipcMain.handle('updater:cancel', (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted renderer');
    return cancelUpdateDownload();
  });
  ipcMain.handle('updater:install', (event) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted renderer');
    try {
      return installUpdate();
    } catch (error) {
      return { ok: false, error: safeUpdateError(error) };
    }
  });
}

function registerWindowClose() {
  ipcMain.on('app:close-ready', (event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (event.sender !== mainWindow.webContents) return;
    if (pendingInstall) {
      performInstallAndQuit();
      return;
    }
    closeAllowed = true;
    mainWindow.close();
  });
}

function buildApplicationMenu() {
  const viewItems = [
    ...(!app.isPackaged ? [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
    ] : []),
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'View',
      submenu: viewItems,
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About FinanceHub',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'FinanceHub',
              message: `FinanceHub ${app.getVersion()}`,
              detail: 'Local-only or cloud-synced personal finance.',
            });
          },
        },
      ],
    },
  ]);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1080,
    minHeight: 680,
    title: 'FinanceHub',
    backgroundColor: '#0b1220',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow = win;
  closeAllowed = false;
  closeRequested = false;
  win.on('close', (event) => {
    if (closeAllowed) return;
    event.preventDefault();
    if (closeRequested) return;
    closeRequested = true;
    try {
      win.webContents.send('app:before-close');
    } catch {
      closeAllowed = true;
      win.close();
      return;
    }
    // Never trap a window if the renderer cannot answer (for example after a crash).
    setTimeout(() => {
      if (!win.isDestroyed() && !closeAllowed) {
        closeAllowed = true;
        win.close();
      }
    }, 1500);
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process ended:', details.reason);
  });
  void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch((error) => {
    console.error('Unable to load the FinanceHub renderer:', error);
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.financehub.desktop');

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    installWebContentsGuards();
    registerSecureStorage();
    registerStarlingBank();
    registerEnableBanking();
    registerUpdater();
    registerWindowClose();
    registerOAuthCallback();
    startStoreServer();
    watchStoreHost();
    Menu.setApplicationMenu(buildApplicationMenu());
    if (!SERVE_ONLY) createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return;
    if (lastBrowserPing && Date.now() - lastBrowserPing < 30000) return;
    app.quit();
  });
}

app.on('will-quit', () => {
  updateController?.abort();
  updateController = null;
  if (installTimer) clearTimeout(installTimer);
  installTimer = null;
  oauthServer?.close();
  oauthServer = null;
  ebCallbackServer?.close();
  ebCallbackServer = null;
  storeServer?.close();
  storeServer = null;
  secureStore?.close();
  secureStore = null;
});
