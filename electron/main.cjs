'use strict';
const { app, BrowserWindow, Menu, dialog, shell, ipcMain, session } = require('electron');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const { createSecureStore } = require('./secure-store.cjs');

let secureStore = null;
let mainWindow = null;
let oauthServer = null;
let closeAllowed = false;
let closeRequested = false;
let storeServer = null;
let lastBrowserPing = 0;
let storeStartedAt = 0;
const OAUTH_PORT = 53682;
const OAUTH_CALLBACK = `http://127.0.0.1:${OAUTH_PORT}/auth/callback`;
const STORE_PORT = 53683;
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

function registerWindowClose() {
  ipcMain.on('app:close-ready', (event) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (event.sender !== mainWindow.webContents) return;
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
  oauthServer?.close();
  oauthServer = null;
  storeServer?.close();
  storeServer = null;
  secureStore?.close();
  secureStore = null;
});
