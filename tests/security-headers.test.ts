/**
 * Security headers served by Cloudflare Pages.
 *
 * The hosted build has no server of its own, so `app/public/_headers` is the only
 * place response headers can be set. These tests keep the hardening in place: a
 * missing HSTS or an accidentally cacheable `index.html` would only be noticed in
 * production otherwise.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const HEADERS = fs.readFileSync(path.join(ROOT, 'app', 'public', '_headers'), 'utf8');

/** The path block a request uses, with its header lines lowercased into a map. */
function block(match: string): Map<string, string> {
  const sections = HEADERS.split(/\n\s*\n/);
  const found = sections.find((section) => section.trim().split('\n')[0]?.trim() === match);
  assert.ok(found, `_headers has no block for ${match}`);
  const lines = new Map<string, string>();
  for (const line of found.split('\n').slice(1)) {
    const index = line.indexOf(':');
    if (index < 0) continue;
    lines.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
  }
  return lines;
}

const global = block('/*');

test('every response is hardened against sniffing, framing and referrer leaks', () => {
  assert.equal(global.get('x-content-type-options'), 'nosniff');
  assert.equal(global.get('x-frame-options'), 'DENY');
  assert.equal(global.get('referrer-policy'), 'no-referrer');
  assert.match(global.get('x-robots-tag') ?? '', /noindex/);
});

test('HSTS, cross-origin isolation and DNS prefetch are set', () => {
  const hsts = global.get('strict-transport-security') ?? '';
  assert.match(hsts, /max-age=31536000/);
  assert.match(hsts, /includeSubDomains/);
  assert.equal(global.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(global.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(global.get('x-dns-prefetch-control'), 'off');
});

test('device permissions are denied by default', () => {
  const policy = global.get('permissions-policy') ?? '';
  for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'serial', 'display-capture']) {
    assert.match(policy, new RegExp(`${feature}=\\(\\)`), `${feature} must be denied`);
  }
  // Passkeys are the app's own sign-in path, so that one stays available to this origin only.
  assert.match(policy, /publickey-credentials-get=\(self\)/);
});

test('documents are revalidated while hashed assets are cached for a year', () => {
  assert.equal(block('/*.html').get('cache-control'), 'no-cache, must-revalidate');
  assert.equal(block('/index.html').get('cache-control'), 'no-cache, must-revalidate');
  assert.equal(block('/assets/*').get('cache-control'), 'public, max-age=31536000, immutable');
});

test('the installer and the budget never appear in the served headers', () => {
  assert.doesNotMatch(HEADERS, /FinanceHub-Setup/);
  assert.doesNotMatch(HEADERS, /workbook\.json/);
});
