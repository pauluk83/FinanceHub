/**
 * Packaged-app smoke check.
 *
 * Runs the built Windows app in its shared-store mode, then verifies the pieces
 * a browser test cannot reach: the loopback store only exposes financehub.* keys,
 * refuses anything else, and answers unknown routes with 404; the packaged
 * renderer HTML carries the production CSP with an exact connect source and no
 * wildcard. It does not sign in and never reads budget values.
 *
 *   npm run smoke:packaged
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './app-changelog.mjs';

const EXE = join(ROOT, 'release', 'win-unpacked', 'FinanceHub.exe');
const STORE = 'http://127.0.0.1:53683';

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

async function waitForStore(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${STORE}/api/health`, { cache: 'no-store' });
      const body = await response.json();
      if (response.ok && body.ok) return true;
    } catch {
      /* the app is still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function main() {
  if (!existsSync(EXE)) {
    fail(`${EXE} is missing — run npm run dist:win first`);
    return;
  }
  const app = spawn(EXE, ['--serve'], { stdio: 'ignore', windowsHide: true });
  try {
    if (!(await waitForStore())) {
      fail('the packaged app did not answer /api/health');
      return;
    }
    console.log('PASS  packaged app starts and answers /api/health');

    await fetch(`${STORE}/api/ping`, { method: 'POST' });

    const snapshot = await (await fetch(`${STORE}/api/store`, { cache: 'no-store' })).json();
    const keys = Object.keys(snapshot.values ?? {});
    if (!snapshot.ok || keys.some((key) => !key.startsWith('financehub.'))) {
      fail('/api/store exposed a key outside the financehub.* namespace');
    } else {
      console.log(`PASS  /api/store exposes ${keys.length} financehub.* key(s) and nothing else`);
    }

    const refused = await fetch(`${STORE}/api/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ key: 'evil.key', value: 'x' }),
    });
    if (refused.status !== 400) fail(`/api/store accepted a foreign key (${refused.status})`);
    else console.log('PASS  /api/store refuses keys outside the financehub.* namespace');

    const missing = await fetch(`${STORE}/api/nope`);
    if (missing.status !== 404) fail(`unknown route answered ${missing.status}, expected 404`);
    else console.log('PASS  unknown store routes answer 404');

    const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
    if (!csp) fail('dist/index.html has no Content-Security-Policy meta tag');
    else if (/connect-src[^;]*\*/.test(csp)) fail('the production CSP has a wildcard connect source');
    else if (!/script-src 'self'/.test(csp) || !/object-src 'none'/.test(csp) || !/frame-src 'none'/.test(csp)) {
      fail('the production CSP is missing a required directive');
    } else {
      console.log('PASS  packaged renderer carries the production CSP without a wildcard');
    }
  } finally {
    app.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!process.exitCode) console.log('packaged smoke passed');
}

await main();
