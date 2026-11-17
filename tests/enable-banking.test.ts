import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import {
  enableBankingAmountPence,
  enableBankingImportRows,
  enableBankingJwtClaims,
  normaliseEnableBankingAccounts,
  normaliseEnableBankingAspsps,
} from '../core/enableBanking.ts';

test('Enable Banking decimal amounts convert exactly to pence', () => {
  assert.equal(enableBankingAmountPence('12.34'), 1234);
  assert.equal(enableBankingAmountPence('0.05'), 5);
  assert.equal(enableBankingAmountPence(3.5), 350);
  assert.equal(enableBankingAmountPence('-7.10'), -710);
  assert.equal(enableBankingAmountPence('12.345'), null);
  assert.equal(enableBankingAmountPence('not money'), null);
  assert.equal(enableBankingAmountPence(null), null);
});

test('the UK bank list is reduced to safe, sorted options', () => {
  const aspsps = normaliseEnableBankingAspsps({
    aspsps: [
      { name: 'Monzo', country: 'GB', logo: 'https://example.com/monzo.png', extra: 'drop' },
      { name: 'Barclays', country: 'gb' },
      { name: 'Monzo', country: 'GB' },
      { name: '', country: 'GB' },
      { name: 'Bank with bad logo', country: 'GB', logo: 'javascript:alert(1)' },
    ],
  });
  assert.deepEqual(aspsps.map((entry) => entry.name), ['Bank with bad logo', 'Barclays', 'Monzo']);
  assert.equal(aspsps.find((entry) => entry.name === 'Monzo')?.logo, 'https://example.com/monzo.png');
  assert.equal(aspsps.find((entry) => entry.name === 'Bank with bad logo')?.logo, undefined);
});

test('linked sessions flatten into selectable accounts', () => {
  const accounts = normaliseEnableBankingAccounts([
    {
      sessionId: 'session-1',
      aspspName: 'Monzo',
      validUntil: '2027-02-15T00:00:00Z',
      accounts: [
        { uid: 'account-1', name: 'Personal', currency: 'gbp' },
        { uid: '', name: 'Broken' },
      ],
    },
    { sessionId: '', accounts: [{ uid: 'account-2', name: 'Ignored' }] },
    'not a session',
  ]);
  assert.deepEqual(accounts, [{
    uid: 'account-1',
    sessionId: 'session-1',
    name: 'Personal',
    currency: 'GBP',
    aspspName: 'Monzo',
    validUntil: '2027-02-15T00:00:00Z',
  }]);
});

test('booked Enable Banking transactions become review rows and pending ones are dropped', () => {
  const rows = enableBankingImportRows([
    {
      transaction_id: 'tx-1',
      status: 'BOOKED',
      booking_date: '2026-11-17',
      transaction_amount: { currency: 'GBP', amount: '20.00' },
      credit_debit_indicator: 'DBIT',
      creditor: { name: 'Daniel Champion' },
    },
    {
      transaction_id: 'tx-2',
      status: 'BOOKED',
      value_date: '2026-11-16',
      transaction_amount: { currency: 'GBP', amount: '130.00' },
      credit_debit_indicator: 'CRDT',
      remittance_information: ['Post Office', 'Cash deposit'],
    },
    {
      transaction_id: 'tx-pending',
      status: 'PDNG',
      booking_date: '2026-11-17',
      transaction_amount: { currency: 'GBP', amount: '9.99' },
      credit_debit_indicator: 'DBIT',
    },
    {
      transaction_id: 'tx-zero',
      status: 'BOOKED',
      booking_date: '2026-11-17',
      transaction_amount: { currency: 'GBP', amount: '0.00' },
      credit_debit_indicator: 'DBIT',
    },
  ]);

  assert.deepEqual(rows.map((row) => [row.date, row.type, row.amountPence, row.description]), [
    ['2026-11-16', 'Income', 13000, 'Post Office — Cash deposit'],
    ['2026-11-17', 'Expense', 2000, 'Daniel Champion'],
  ]);
  assert.equal(rows.every((row) => row.currency === 'GBP'), true);
});

test('the signed request JWT verifies with the application key', () => {
  const require = createRequire(import.meta.url);
  const { signEnableBankingJwt } = require('../electron/enable-banking-jwt.cjs') as {
    signEnableBankingJwt: (appId: string, privateKey: string, nowSeconds?: number) => string;
  };
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const appId = '11111111-1111-4111-8111-111111111111';
  const token = signEnableBankingJwt(appId, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 1_700_000_000);
  const [header, payload, signature] = token.split('.');

  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')), true);
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { typ: 'JWT', alg: 'RS256', kid: appId });
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url').toString()).exp, 1_700_003_600);
});

test('the request JWT carries the Enable Banking issuer and a one-hour life', () => {
  assert.deepEqual(enableBankingJwtClaims(1_700_000_000), {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
});
