/**
 * Web Push message encryption (RFC 8291) and VAPID signing (RFC 8292).
 *
 * Pure Web Crypto, so the same file runs in the Supabase Edge Function (Deno)
 * and in Node for `tests/webpush.test.ts`. Nothing here reads a clock, a file
 * or the network; the caller passes the keys and, in tests, the salt.
 *
 * This module is the one implementation of push encryption: the function
 * imports it, and the test proves it against the RFC 8291 Appendix A vector.
 */

export interface VapidKeys {
  /** base64url uncompressed P-256 point (65 bytes, starting 0x04). */
  publicKey: string;
  /** base64url private scalar `d`. */
  privateKey: string;
  /** VAPID `sub` claim: a mailto: or https: contact. */
  subject?: string;
}

export interface PushCryptoOptions {
  plaintext: string | Uint8Array;
  /** Subscription `keys.p256dh`, base64url. */
  uaPublic: string;
  /** Subscription `keys.auth`, base64url (16 bytes). */
  authSecret: string;
  /** Test override; a fresh random salt is used otherwise. */
  salt?: Uint8Array<ArrayBuffer>;
  /** Test override; a fresh ephemeral key pair is used otherwise. */
  serverKeys?: { publicKey: string; privateKey: string };
}

const encoder = new TextEncoder();

function subtle(): SubtleCrypto {
  return globalThis.crypto.subtle;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalised = String(value).trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

async function hmacSha256(keyBytes: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const key = await subtle().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', key, data));
}

/** HKDF-Expand (RFC 5869) with SHA-256. */
async function hkdfExpand(prk: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const blocks: Uint8Array[] = [];
  let previous = new Uint8Array(0);
  let produced = 0;
  for (let counter = 1; produced < length; counter += 1) {
    previous = await hmacSha256(prk, concat(previous, info, new Uint8Array([counter])));
    blocks.push(previous);
    produced += previous.length;
  }
  return concat(...blocks).slice(0, length);
}

async function importPublicKey(uncompressed: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error('A push subscription public key must be a 65-byte uncompressed P-256 point');
  }
  return subtle().importKey('raw', uncompressed, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

async function importPrivateKey(privateKey: string, publicKey: string): Promise<CryptoKey> {
  const point = fromBase64Url(publicKey);
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error('A P-256 private key needs its matching uncompressed public key');
  }
  return subtle().importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: privateKey.trim().replace(/=+$/, ''),
      x: toBase64Url(point.slice(1, 33)),
      y: toBase64Url(point.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
}

async function generateKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicBytes = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  const jwk = await subtle().exportKey('jwk', pair.privateKey) as JsonWebKey;
  if (!jwk.d) throw new Error('The generated key pair has no private scalar');
  return { publicKey: toBase64Url(publicBytes), privateKey: jwk.d };
}

/**
 * Encrypt one push message with `aes128gcm`, as RFC 8291 and RFC 8188 require:
 * `salt(16) || rs(4) || idlen(1) || keyid(65) || AES-128-GCM(plaintext || 0x02)`.
 */
export async function encryptPushPayload(options: PushCryptoOptions): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = typeof options.plaintext === 'string' ? encoder.encode(options.plaintext) : options.plaintext;
  if (plaintext.length > 3993) throw new Error('A push message may not exceed 3993 bytes of plaintext');
  const uaPublicBytes = fromBase64Url(options.uaPublic);
  const authSecret = fromBase64Url(options.authSecret);
  if (authSecret.length !== 16) throw new Error('A push subscription auth secret must be 16 bytes');

  const server = options.serverKeys ?? await generateKeys();
  const asPublicBytes = fromBase64Url(server.publicKey);
  const asPrivate = await importPrivateKey(server.privateKey, server.publicKey);
  const uaPublic = await importPublicKey(uaPublicBytes);

  const ecdhSecret = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaPublic }, asPrivate, 256));
  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concat(encoder.encode('WebPush: info'), new Uint8Array([0]), uaPublicBytes, asPublicBytes);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  const salt = options.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error('A push salt must be 16 bytes');
  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(prk, concat(encoder.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdfExpand(prk, concat(encoder.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  const aesKey = await subtle().importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await subtle().encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    concat(plaintext, new Uint8Array([0x02])),
  ));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublicBytes.length]), asPublicBytes, ciphertext);
}

/**
 * `Authorization: vapid t=<jwt>, k=<public key>` for one push endpoint.
 *
 * The JWT is ES256 over the endpoint's origin, which is what RFC 8292 requires;
 * a signature is accepted by a push service only if the `k` key matches it.
 */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  options: { nowMs?: number; expiresInSeconds?: number; subject?: string } = {},
): Promise<string> {
  const origin = new URL(endpoint).origin;
  const issuedAt = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const exp = issuedAt + Math.max(60, Math.min(24 * 3600, options.expiresInSeconds ?? 12 * 3600));
  const subject = (options.subject ?? keys.subject ?? '').trim();
  if (!/^(mailto:|https:)/.test(subject)) {
    throw new Error('VAPID needs a mailto: or https: contact in its subject claim');
  }

  const unsigned = `${toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))}.${
    toBase64Url(encoder.encode(JSON.stringify({ aud: origin, exp, sub: subject })))}`;

  const point = fromBase64Url(keys.publicKey);
  const signingKey = await subtle().importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey.trim().replace(/=+$/, ''),
      x: toBase64Url(point.slice(1, 33)),
      y: toBase64Url(point.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // Web Crypto returns the raw r||s pair, which is exactly the JWS ES256 form.
  const signature = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(unsigned)));
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${keys.publicKey.trim().replace(/=+$/, '')}`;
}

/** The `applicationServerKey` a browser subscription needs, from the base64url key. */
export function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const bytes = fromBase64Url(publicKey);
  if (bytes.length !== 65 || bytes[0] !== 0x04) throw new Error('That is not a P-256 VAPID public key');
  return bytes;
}

export const __test = { toBase64Url, fromBase64Url, hkdfExpand };
