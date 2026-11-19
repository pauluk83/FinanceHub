'use strict';

/**
 * Pure parsing for the desktop OAuth loopback callback.
 *
 * Electron's HTTP handler is hard to test, so every decision it makes about a
 * callback lives here: the host must be this machine's loopback on the callback
 * port, the request must be a GET to /auth/callback, and a code or error may be
 * carried but only within a sane length. A forged request (another host, another
 * path, a POST, an oversized code) is rejected before the renderer hears about it.
 */

const CALLBACK_PATH = '/auth/callback';
const MAX_CODE_LENGTH = 2048;
const MAX_ERROR_LENGTH = 300;

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Returns `{ status, code, error }`. `status` is the HTTP status the loopback
 * server should answer with: 200 for a usable callback, 403 for a foreign host,
 * 404 for a wrong method or path, 400 for an out-of-bounds payload.
 */
function parseOAuthCallback({ host, method, url, port }) {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(trimmed(host).toLowerCase())) return { status: 403, code: null, error: null };
  if (method !== 'GET') return { status: 404, code: null, error: null };

  let parsed;
  try {
    parsed = new URL(typeof url === 'string' && url ? url : '/', `http://${allowed[0]}`);
  } catch {
    return { status: 404, code: null, error: null };
  }
  if (parsed.pathname !== CALLBACK_PATH) return { status: 404, code: null, error: null };

  const code = trimmed(parsed.searchParams.get('code'));
  const error = trimmed(parsed.searchParams.get('error_description') || parsed.searchParams.get('error'));
  if (code.length > MAX_CODE_LENGTH) {
    return { status: 400, code: null, error: 'The authorization code is too long.' };
  }
  if (error.length > MAX_ERROR_LENGTH) {
    return { status: 400, code: null, error: error.slice(0, MAX_ERROR_LENGTH) };
  }
  if (!code && !error) {
    return { status: 200, code: null, error: 'The provider did not return an authorization code.' };
  }
  return { status: 200, code: code || null, error: error || null };
}

module.exports = { parseOAuthCallback, CALLBACK_PATH, MAX_CODE_LENGTH, MAX_ERROR_LENGTH };
