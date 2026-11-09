import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVault, rotateVault, sealVault, unlockVault, legacySecrets, stripLegacySecrets, VAULT_MAX_HINT } from '../app/src/vault.ts';
import type { Dataset } from '../core/engine.ts';

const secrets = {
  rent: { username: 'renter', password: 'rent-password', chargeLetterPassword: 'letter-password' },
  councilTax: { accessBill: 'bill-password', username: 'council', password: 'council-password' },
};

test('the encrypted vault round-trips provider credentials', async () => {
  const { vault, session } = await createVault('a long enough passphrase', secrets);
  assert.equal(vault.version, 1);
  assert.equal(vault.kdf, 'PBKDF2-SHA-256');
  assert.ok(vault.iterations >= 100_000);
  assert.ok(vault.ciphertext.length > 0);
  assert.ok(!JSON.stringify(vault).includes('rent-password'));

  const unlocked = await unlockVault(vault, 'a long enough passphrase');
  assert.deepEqual(unlocked.secrets, secrets);
  assert.deepEqual(session.secrets, secrets);
});

test('the wrong passphrase is rejected', async () => {
  const { vault } = await createVault('a long enough passphrase', secrets);
  await assert.rejects(() => unlockVault(vault, 'the wrong passphrase'), /did not unlock/i);
});

test('tampering with the ciphertext is rejected', async () => {
  const { vault } = await createVault('a long enough passphrase', secrets);
  const bytes = Buffer.from(vault.ciphertext, 'base64');
  bytes[0] ^= 1;
  await assert.rejects(
    () => unlockVault({ ...vault, ciphertext: bytes.toString('base64') }, 'a long enough passphrase'),
    /did not unlock/i,
  );
});

test('sealing again preserves the same passphrase and updates the IV', async () => {
  const { vault, session } = await createVault('a long enough passphrase', secrets);
  const changed = await sealVault(session, { ...secrets, ovo: { username: 'ovo-user' } });
  assert.notEqual(changed.iv, vault.iv);
  assert.equal(changed.salt, vault.salt);
  assert.deepEqual((await unlockVault(changed, 'a long enough passphrase')).secrets, {
    ...secrets,
    ovo: { username: 'ovo-user' },
  });
});

test('the passphrase can be rotated without losing the stored secrets', async () => {
  const { vault } = await createVault('a long enough passphrase', secrets, 'first pet');
  assert.equal(vault.hint, 'first pet');
  const session = await unlockVault(vault, 'a long enough passphrase');
  const rotated = await rotateVault(session, 'another long passphrase', secrets, '  blue   door  ');
  assert.notEqual(rotated.vault.salt, vault.salt, 'a new salt forces a new key derivation');
  assert.notEqual(rotated.vault.iv, vault.iv);
  assert.notEqual(rotated.vault.ciphertext, vault.ciphertext);
  assert.equal(rotated.vault.hint, 'blue door');
  assert.equal(rotated.vault.iterations, vault.iterations);
  await assert.rejects(() => unlockVault(rotated.vault, 'a long enough passphrase'), /did not unlock/i);
  assert.deepEqual((await unlockVault(rotated.vault, 'another long passphrase')).secrets, secrets);
  assert.deepEqual(rotated.session.secrets, secrets);

  // The rotated session stays usable for ordinary saves under the new key.
  const saved = await sealVault(rotated.session, { ovo: { username: 'ovo-user' } });
  assert.equal(saved.salt, rotated.vault.salt);
  assert.deepEqual((await unlockVault(saved, 'another long passphrase')).secrets, { ovo: { username: 'ovo-user' } });
});

test('rotation refuses a short passphrase and the hint stays a bounded reminder', async () => {
  const { vault } = await createVault('a long enough passphrase', secrets);
  const session = await unlockVault(vault, 'a long enough passphrase');
  await assert.rejects(() => rotateVault(session, 'too short', secrets), /at least/i);
  const rotated = await rotateVault(session, 'another long passphrase', secrets, 'x'.repeat(VAULT_MAX_HINT + 50));
  assert.equal(rotated.vault.hint?.length, VAULT_MAX_HINT);
  assert.ok(!JSON.stringify(rotated.vault).includes('rent-password'));
  const cleared = await rotateVault(session, 'another long passphrase', secrets, '   ');
  assert.equal('hint' in cleared.vault, false, 'an empty hint is not stored');
});

test('the canonical seed contains no plaintext credential fields', () => {
  const raw = readFileSync(new URL('../data/workbook.json', import.meta.url), 'utf8');
  assert.doesNotMatch(raw, /"(?:accessUsername|accessPassword|chargeLetterPassword|accessBill|plaintextCredentials)"\s*:/);
});

test('legacy plaintext fields can be extracted and stripped', () => {
  const ds = {
    settings: { targetYear: 2026, plaintextCredentials: { count: 3 } },
    providers: {
      rent: { accessUsername: 'renter', accessPassword: 'rent-password', chargeLetterPassword: 'letter-password', monthlyRentPence: 100 },
      councilTax: { accessBill: 'bill-password', accessUsername: 'council', accessPassword: 'council-password', reference: 'keep-me' },
      ovo: { accessUsername: 'ovo-user', monthlyPaymentPence: 100 },
    },
  } as unknown as Dataset;
  assert.deepEqual(legacySecrets(ds), {
    rent: { username: 'renter', password: 'rent-password', chargeLetterPassword: 'letter-password' },
    councilTax: { username: 'council', password: 'council-password', accessBill: 'bill-password' },
    ovo: { username: 'ovo-user' },
  });
  stripLegacySecrets(ds);
  assert.equal('accessPassword' in ds.providers.rent, false);
  assert.equal('chargeLetterPassword' in ds.providers.rent, false);
  assert.equal('accessBill' in ds.providers.councilTax, false);
  assert.equal('plaintextCredentials' in ds.settings, false);
  assert.equal(ds.providers.rent.monthlyRentPence, 100);
  assert.equal(ds.providers.councilTax.reference, 'keep-me');
});
