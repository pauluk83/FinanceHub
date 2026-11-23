#!/usr/bin/env node
/**
 * Generate the VAPID key pair for web push (RFC 8292).
 *
 *   node scripts/vapid-keys.mjs [--force] [--out=tmp/vapid-keys.json]
 *
 * The pair is written to `tmp/vapid-keys.json` (gitignored) and only the public
 * half is printed. The private half goes into Supabase as the `VAPID_PRIVATE_KEY`
 * secret and must never be pasted into chat, a commit, a build or a screenshot.
 *
 * The public half must match `app/src/pushConfig.ts`; if you regenerate the pair,
 * update that file and remember every existing subscription must be remade.
 */
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const force = args.includes('--force');
const outArg = args.find((value) => value.startsWith('--out='));
const out = resolve(outArg ? outArg.slice('--out='.length) : (process.env.FINANCEHUB_VAPID_KEYS || 'tmp/vapid-keys.json'));
const subject = process.env.VAPID_SUBJECT || 'mailto:pauluk83+financehub@gmail.com';

if (existsSync(out) && !force) {
  const existing = JSON.parse(readFileSync(out, 'utf8'));
  console.log(`A key pair already exists at ${out}. Use --force to replace it (every subscription would have to be remade).`);
  console.log(`Public key: ${existing.publicKey}`);
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });
if (!publicJwk.x || !publicJwk.y || !privateJwk.d) throw new Error('The generated key pair is incomplete');

const point = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(publicJwk.x, 'base64url'),
  Buffer.from(publicJwk.y, 'base64url'),
]);

const record = {
  created: new Date().toISOString().slice(0, 10),
  subject,
  publicKey: point.toString('base64url'),
  privateKey: privateJwk.d,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
try { chmodSync(out, 0o600); } catch { /* Windows may ignore the mode */ }

console.log(`Wrote the VAPID key pair to ${out} (owner-only, gitignored).`);
console.log(`Public key: ${record.publicKey}`);
console.log('');
console.log('Next: put the private key and both public values into Supabase secrets, and the public key into app/src/pushConfig.ts:');
console.log('  npx supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:you@example.com');
