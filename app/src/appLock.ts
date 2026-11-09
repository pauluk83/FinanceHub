/**
 * A device-only app lock. This is a convenience barrier for a shared Windows
 * session or an unattended machine — it is deliberately not presented as
 * encryption: the budget itself stays in the normal (DPAPI-backed) store, so
 * anyone who can read that store can read the data without the PIN.
 *
 * This module stays free of storage imports so it can be tested on its own.
 */
export const APP_LOCK_VERSION = 1;
export const APP_LOCK_ITERATIONS = 600_000;
export const APP_LOCK_MIN_PIN = 4;
export const APP_LOCK_MAX_PIN = 8;
export const APP_LOCK_IDLE_OPTIONS = [1, 5, 10, 15, 30] as const;
export const APP_LOCK_DEFAULT_IDLE = 5;

export interface AppLockConfig {
  version: 1;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  hash: string;
  idleMinutes: number;
  updatedAt: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function cryptoApi(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot use the app lock.');
  return globalThis.crypto.subtle;
}

/** A PIN is digits only so the keypad, paste and stored form all agree. */
export function pinProblem(pin: string): string | null {
  if (!/^\d*$/.test(pin)) return 'Use digits only.';
  if (pin.length < APP_LOCK_MIN_PIN) return `Use at least ${APP_LOCK_MIN_PIN} digits.`;
  if (pin.length > APP_LOCK_MAX_PIN) return `Use at most ${APP_LOCK_MAX_PIN} digits.`;
  return null;
}

/** Unknown or unsupported idle values fall back to the documented default. */
export function normalizeIdleMinutes(value: unknown): number {
  const minutes = typeof value === 'number' ? value : Number(value);
  return (APP_LOCK_IDLE_OPTIONS as readonly number[]).includes(minutes) ? minutes : APP_LOCK_DEFAULT_IDLE;
}

async function deriveHash(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = cryptoApi();
  const material = await subtle.importKey(
    'raw',
    bufferSource(new TextEncoder().encode(pin)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: bufferSource(salt), iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function createAppLock(pin: string, idleMinutes: number = APP_LOCK_DEFAULT_IDLE): Promise<AppLockConfig> {
  const problem = pinProblem(pin);
  if (problem) throw new Error(problem);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(pin, salt, APP_LOCK_ITERATIONS);
  return {
    version: APP_LOCK_VERSION,
    kdf: 'PBKDF2-SHA-256',
    iterations: APP_LOCK_ITERATIONS,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    idleMinutes: normalizeIdleMinutes(idleMinutes),
    updatedAt: new Date().toISOString(),
  };
}

/** False for a wrong PIN or a damaged config; never throws at the call site. */
export async function verifyAppLock(config: AppLockConfig, pin: string): Promise<boolean> {
  if (pinProblem(pin) || !isAppLockConfig(config)) return false;
  try {
    const derived = await deriveHash(pin, base64ToBytes(config.salt), config.iterations);
    return equalBytes(derived, base64ToBytes(config.hash));
  } catch {
    return false;
  }
}

export function isAppLockConfig(value: unknown): value is AppLockConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (config.version !== APP_LOCK_VERSION || config.kdf !== 'PBKDF2-SHA-256') return false;
  if (typeof config.iterations !== 'number' || !Number.isFinite(config.iterations) || config.iterations < 100_000) return false;
  if (typeof config.salt !== 'string' || config.salt.length < 16) return false;
  if (typeof config.hash !== 'string' || config.hash.length < 16) return false;
  return true;
}

export function parseAppLock(raw: string | null): AppLockConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isAppLockConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Changing the idle window keeps the same PIN hash and salt. */
export function withIdleMinutes(config: AppLockConfig, idleMinutes: number): AppLockConfig {
  return { ...config, idleMinutes: normalizeIdleMinutes(idleMinutes), updatedAt: new Date().toISOString() };
}

/**
 * Each wrong PIN costs a little more: the delay starts after three failures and
 * caps at 30 seconds. It is stored on the device so a reload cannot reset it.
 */
export function lockoutMs(failures: number): number {
  if (!Number.isFinite(failures) || failures < 3) return 0;
  return Math.min(30_000, 5_000 * 2 ** Math.min(failures - 3, 3));
}

export function shouldAutoLock(config: AppLockConfig, lastActivityMs: number, nowMs: number): boolean {
  const minutes = normalizeIdleMinutes(config.idleMinutes);
  return nowMs - lastActivityMs >= minutes * 60_000;
}
