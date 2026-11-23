import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRevision,
  storePackageVersion,
  validateStoreIdentity,
} from '../scripts/store-build.mjs';

const identity = {
  identityName: '12345ZaneStanton.FinanceHub',
  publisher: 'CN=12345ZaneStanton',
  publisherDisplayName: 'Zane Stanton',
  displayName: 'FinanceHub',
  applicationId: 'FinanceHub',
  revision: 0,
};

test('store package version appends the revision as the fourth part', () => {
  assert.equal(storePackageVersion('2026.11.22', 0), '2026.11.22.0');
  assert.equal(storePackageVersion('2026.11.22', 7), '2026.11.22.7');
  assert.equal(storePackageVersion('2026.11.22', 65535), '2026.11.22.65535');
});

test('store package version rejects versions that AppX cannot represent', () => {
  assert.throws(() => storePackageVersion('2026.11', 0), /three numeric parts/);
  assert.throws(() => storePackageVersion('2026.11.22', 65536), /between 0 and 65535/);
  assert.throws(() => storePackageVersion('2026.11.22', 1.5), /whole number/);
  assert.equal(normalizeRevision(''), 0);
});

test('store identity accepts Partner Center values and rejects placeholders', () => {
  assert.deepEqual(validateStoreIdentity(identity), identity);
  assert.throws(() => validateStoreIdentity({ ...identity, publisherDisplayName: '' }), /publisherDisplayName/);
  assert.throws(() => validateStoreIdentity({ ...identity, publisher: 'Zane Stanton' }), /CN=/);
  assert.throws(() => validateStoreIdentity({ ...identity, identityName: 'YOUR_PUBLISHER_ID.FinanceHub' }), /placeholder/);
  assert.throws(() => validateStoreIdentity({ ...identity, applicationId: 'Finance Hub' }), /applicationId/);
});
