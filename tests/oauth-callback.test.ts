import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseOAuthCallback, MAX_CODE_LENGTH, MAX_ERROR_LENGTH } = require('../electron/oauthCallback.cjs');

const PORT = 53682;
const base = { host: `127.0.0.1:${PORT}`, method: 'GET', port: PORT };

test('a loopback callback with a code or an error is accepted', () => {
  const ok = parseOAuthCallback({ ...base, url: '/auth/callback?code=abc123' });
  assert.deepEqual(ok, { status: 200, code: 'abc123', error: null });

  const localhost = parseOAuthCallback({ ...base, host: `localhost:${PORT}`, url: '/auth/callback?code=abc' });
  assert.equal(localhost.status, 200);

  const failed = parseOAuthCallback({ ...base, url: '/auth/callback?error_description=Access%20denied' });
  assert.equal(failed.status, 200);
  assert.equal(failed.code, null);
  assert.equal(failed.error, 'Access denied');
});

test('a callback without a code or an error is reported, not silently accepted', () => {
  const empty = parseOAuthCallback({ ...base, url: '/auth/callback' });
  assert.equal(empty.status, 200);
  assert.equal(empty.code, null);
  assert.match(empty.error, /did not return an authorization code/);
});

test('forged callbacks are refused before the renderer sees them', () => {
  assert.equal(parseOAuthCallback({ ...base, host: 'evil.example:53682', url: '/auth/callback?code=abc' }).status, 403);
  assert.equal(parseOAuthCallback({ ...base, host: `127.0.0.1:9999`, url: '/auth/callback?code=abc' }).status, 403);
  assert.equal(parseOAuthCallback({ ...base, url: '/auth/callback?code=abc' , method: 'POST' }).status, 404);
  assert.equal(parseOAuthCallback({ ...base, url: '/auth/other?code=abc' }).status, 404);
  assert.equal(parseOAuthCallback({ ...base, url: '/auth/callback/../other' }).status, 404);
  assert.equal(parseOAuthCallback({ ...base, url: '' }).status, 404);
});

test('an oversized code or error cannot be pushed through the loopback', () => {
  const longCode = 'a'.repeat(MAX_CODE_LENGTH + 1);
  const code = parseOAuthCallback({ ...base, url: `/auth/callback?code=${longCode}` });
  assert.equal(code.status, 400);
  assert.equal(code.code, null);

  const longError = 'e'.repeat(MAX_ERROR_LENGTH + 50);
  const error = parseOAuthCallback({ ...base, url: `/auth/callback?error_description=${longError}` });
  assert.equal(error.status, 400);
  assert.equal(error.error.length, MAX_ERROR_LENGTH);
});

test('a repeated callback is parsed the same way and carries no state of its own', () => {
  // Replay safety belongs to Supabase's PKCE exchange, not the loopback page:
  // the parser must not invent a state, accept a state-only request, or vary.
  const url = '/auth/callback?code=same-code&state=ignored';
  const first = parseOAuthCallback({ ...base, url });
  const second = parseOAuthCallback({ ...base, url });
  assert.deepEqual(first, second);
  assert.equal(first.code, 'same-code');
  assert.equal(parseOAuthCallback({ ...base, url: '/auth/callback?state=only' }).code, null);
});
