import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertNoPlaintextCredentials,
  enqueueOutbox,
  plaintextCredentialPaths,
} from '../core/sync-client.ts';

const vault = {
  version: 1,
  algorithm: 'AES-GCM',
  kdf: 'PBKDF2-SHA-256',
  iterations: 600_000,
  salt: 'salt',
  iv: 'iv',
  ciphertext: 'ciphertext',
  updatedAt: '2026-11-10T00:00:00.000Z',
};

test('plaintext credential keys are found at any depth', () => {
  const state = {
    dataset: {
      settings: { plaintextCredentials: { count: 1 } },
      providers: { rent: { accessPassword: 'rent-password' } },
      accounts: [{ username: 'starling-login' }],
    },
    vault,
  };

  assert.deepEqual(plaintextCredentialPaths(state), [
    'dataset.settings.plaintextCredentials',
    'dataset.providers.rent.accessPassword',
    'dataset.accounts[0].username',
  ]);
});

test('empty legacy placeholders do not block a sync', () => {
  const state = {
    settings: {
      plaintextCredentials: {},
      accessUsername: '',
      accessPassword: null,
      chargeLetterPassword: false,
    },
    vault,
  };

  assert.deepEqual(plaintextCredentialPaths(state), []);
  assert.doesNotThrow(() => assertNoPlaintextCredentials(state));
});

test('enqueueOutbox refuses to create a cloud payload with a credential value', () => {
  assert.throws(() => enqueueOutbox({
    items: [],
    state: { settings: { accessPassword: 'rent-password' } },
    recordId: 'user-1',
    deviceId: 'windows-1',
    baseRev: 0,
  }), /Refusing to sync plaintext credential fields/);
});

test('the current workbook payload carries no plaintext credential keys', () => {
  const dataset = JSON.parse(readFileSync(new URL('../data/workbook.json', import.meta.url), 'utf8')) as unknown;
  const state = { version: 1, dataset, theme: 'dark', savedAt: '2026-11-10T00:00:00.000Z', vault };

  assert.deepEqual(plaintextCredentialPaths(state), []);
  assert.doesNotThrow(() => assertNoPlaintextCredentials(state));
});
