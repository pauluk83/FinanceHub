import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_LOCK_DEFAULT_IDLE,
  APP_LOCK_IDLE_OPTIONS,
  APP_LOCK_MAX_PIN,
  APP_LOCK_MIN_PIN,
  createAppLock,
  isAppLockConfig,
  lockoutMs,
  normalizeIdleMinutes,
  parseAppLock,
  pinProblem,
  shouldAutoLock,
  verifyAppLock,
  withIdleMinutes,
  type AppLockConfig,
} from '../app/src/appLock.ts';

const validPin = '0420';

test('a PIN unlocks only its own app lock', async () => {
  const config = await createAppLock(validPin);
  assert.equal(config.version, 1);
  assert.equal(config.kdf, 'PBKDF2-SHA-256');
  assert.ok(config.iterations >= 100_000);
  assert.equal(await verifyAppLock(config, validPin), true);
  assert.equal(await verifyAppLock(config, '0421'), false);
  assert.equal(await verifyAppLock(config, '420'), false, 'length changes are rejected, not normalized');
});

test('the PIN is never stored in the config', async () => {
  const config = await createAppLock('802415', 10);
  assert.equal(JSON.stringify(config).includes('802415'), false);
  assert.equal(config.idleMinutes, 10);
  assert.equal(JSON.parse(JSON.stringify(config)).hash, config.hash);
});

test('two locks created from the same PIN use different salts and hashes', async () => {
  const first = await createAppLock(validPin);
  const second = await createAppLock(validPin);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
});

test('PIN policy requires 4 to 8 digits', async () => {
  assert.equal(pinProblem(''), 'Use at least 4 digits.');
  assert.equal(pinProblem('123'), 'Use at least 4 digits.');
  assert.equal(pinProblem('123456789'), 'Use at most 8 digits.');
  assert.equal(pinProblem('12a4'), 'Use digits only.');
  assert.equal(pinProblem('  12'), 'Use digits only.');
  assert.equal(pinProblem('1234'), null);
  assert.equal(pinProblem('12345678'), null);
  assert.equal(APP_LOCK_MIN_PIN, 4);
  assert.equal(APP_LOCK_MAX_PIN, 8);
  await assert.rejects(() => createAppLock('12'), /at least/i);
  await assert.rejects(() => createAppLock('abcd'), /digits only/i);
});

test('idle values are limited to the offered windows', () => {
  assert.equal(normalizeIdleMinutes(1), 1);
  assert.equal(normalizeIdleMinutes(30), 30);
  assert.equal(normalizeIdleMinutes(7), APP_LOCK_DEFAULT_IDLE);
  assert.equal(normalizeIdleMinutes('nonsense'), APP_LOCK_DEFAULT_IDLE);
  assert.equal(normalizeIdleMinutes(undefined), APP_LOCK_DEFAULT_IDLE);
  assert.deepEqual([...APP_LOCK_IDLE_OPTIONS], [1, 5, 10, 15, 30]);
});

test('a malformed or weakened stored lock is refused', async () => {
  const config = await createAppLock(validPin);
  assert.equal(isAppLockConfig(config), true);
  assert.equal(isAppLockConfig({ ...config, version: 2 }), false);
  assert.equal(isAppLockConfig({ ...config, hash: '' }), false);
  assert.equal(isAppLockConfig({ ...config, salt: 'short' }), false);
  assert.equal(isAppLockConfig({ ...config, iterations: 1_000 }), false);
  assert.equal(isAppLockConfig(null), false);
  assert.equal(parseAppLock('{not json'), null);
  assert.equal(parseAppLock('null'), null);
  assert.deepEqual(parseAppLock(JSON.stringify(config)), config);
  assert.equal(await verifyAppLock({ ...config, iterations: 500 } as AppLockConfig, validPin), false);
});

test('wrong attempts back off and cap at 30 seconds', () => {
  assert.equal(lockoutMs(0), 0);
  assert.equal(lockoutMs(1), 0);
  assert.equal(lockoutMs(2), 0);
  assert.equal(lockoutMs(3), 5_000);
  assert.equal(lockoutMs(4), 10_000);
  assert.equal(lockoutMs(5), 20_000);
  assert.equal(lockoutMs(6), 30_000);
  assert.equal(lockoutMs(500), 30_000);
});

test('the idle window decides when the workspace locks', async () => {
  const config = await createAppLock(validPin, 5);
  const start = 1_800_000_000_000;
  assert.equal(shouldAutoLock(config, start, start), false);
  assert.equal(shouldAutoLock(config, start, start + 4 * 60_000 + 59_000), false);
  assert.equal(shouldAutoLock(config, start, start + 5 * 60_000), true);
  const short = withIdleMinutes(config, 1);
  assert.equal(short.hash, config.hash, 'changing the window keeps the PIN');
  assert.equal(short.salt, config.salt);
  assert.equal(shouldAutoLock(short, start, start + 60_000), true);
});
