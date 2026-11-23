import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __test,
  applicationServerKey,
  encryptPushPayload,
  vapidAuthorization,
  type VapidKeys,
} from '../supabase/functions/send-push/_shared/webpush.ts';

const b64url = (value: string): Uint8Array => __test.fromBase64Url(value);

/** RFC 8291 Appendix A. Any change to the encryption must fail this test. */
const VECTOR = {
  plaintext: 'When I grow up, I want to be a watermelon',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  serverPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  serverPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('encryption reproduces the RFC 8291 Appendix A message byte for byte', async () => {
  const body = await encryptPushPayload({
    plaintext: VECTOR.plaintext,
    uaPublic: VECTOR.uaPublic,
    authSecret: VECTOR.authSecret,
    salt: b64url(VECTOR.salt),
    serverKeys: { publicKey: VECTOR.serverPublic, privateKey: VECTOR.serverPrivate },
  });
  assert.deepEqual(Array.from(body), Array.from(b64url(VECTOR.body)));
});

test('the aes128gcm header is salt, record size, key id length and the server key', async () => {
  const body = await encryptPushPayload({
    plaintext: 'hello',
    uaPublic: VECTOR.uaPublic,
    authSecret: VECTOR.authSecret,
  });
  assert.equal(body.length > 86, true);
  // rs is a big-endian uint32 and must exceed the plaintext, delimiter and tag.
  assert.equal(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), 4096);
  assert.equal(body[20], 65);
  assert.equal(body[21], 0x04);
  const keyIdEnd = 21 + 65;
  assert.equal(body.length, keyIdEnd + 'hello'.length + 1 + 16);
});

test('a payload larger than a single push record is refused', async () => {
  await assert.rejects(
    () => encryptPushPayload({ plaintext: 'x'.repeat(3994), uaPublic: VECTOR.uaPublic, authSecret: VECTOR.authSecret }),
    /3993/,
  );
});

test('a VAPID JWT is ES256 over the endpoint origin and verifies with the public key', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const keys: VapidKeys = {
    publicKey: __test.toBase64Url(raw),
    privateKey: String(jwk.d),
    subject: 'mailto:owner@example.com',
  };

  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, { nowMs: 1_800_000_000_000 });
  assert.match(header, /^vapid t=[^,]+, k=/);
  const encoded = /t=([^,]+)/.exec(header)?.[1] ?? '';
  const [head, claims, signature] = encoded.split('.');
  assert.equal(signature.length > 0, true);
  assert.equal(b64url(signature).length, 64);

  const parsedHeader = JSON.parse(new TextDecoder().decode(b64url(head)));
  assert.deepEqual(parsedHeader, { typ: 'JWT', alg: 'ES256' });
  const parsedClaims = JSON.parse(new TextDecoder().decode(b64url(claims)));
  assert.equal(parsedClaims.aud, 'https://fcm.googleapis.com');
  assert.equal(parsedClaims.sub, 'mailto:owner@example.com');
  assert.equal(parsedClaims.exp, 1_800_000_000 + 12 * 3600);

  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.publicKey,
    b64url(signature),
    new TextEncoder().encode(`${head}.${claims}`),
  );
  assert.equal(verified, true);
  assert.match(header, new RegExp(`, k=${keys.publicKey}$`));
});

test('VAPID refuses a contact that is not mailto: or https:', async () => {
  const keys: VapidKeys = {
    publicKey: VECTOR.serverPublic,
    privateKey: VECTOR.serverPrivate,
    subject: 'owner@example.com',
  };
  await assert.rejects(() => vapidAuthorization('https://push.example.net/x', keys), /subject/);
});

test('the browser key must be an uncompressed P-256 point', () => {
  assert.deepEqual(Array.from(applicationServerKey(VECTOR.serverPublic)).slice(0, 3), [0x04, 0xfe, 0x33]);
  assert.throws(() => applicationServerKey('nope'), /P-256/);
});
