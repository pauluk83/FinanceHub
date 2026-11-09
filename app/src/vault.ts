import type { Dataset } from '../../core/engine';

export const VAULT_VERSION = 1;
export const VAULT_ITERATIONS = 600_000;
export const VAULT_MIN_PASSPHRASE = 12;
export const VAULT_MAX_HINT = 80;

const PROVIDERS = ['rent', 'water', 'councilTax', 'parkXmas', 'ovo', 'o2', 'virgin'] as const;
const FIELDS = ['username', 'password', 'chargeLetterPassword', 'accessBill'] as const;

export type VaultField = (typeof FIELDS)[number];
export type ProviderSecret = Partial<Record<VaultField, string>>;
export type VaultSecrets = Record<string, ProviderSecret>;

export interface EncryptedVault {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  updatedAt: string;
  /**
   * Optional reminder the owner writes for themselves. It is stored in the
   * clear so the locked screen can show it, which is why it must never hold
   * the passphrase or any credential.
   */
  hint?: string;
}

export interface UnlockedVault {
  secrets: VaultSecrets;
  key: CryptoKey;
  salt: string;
  iterations: number;
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

/** TypeScript's DOM types require an ArrayBuffer-backed view for WebCrypto. */
function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function cryptoApi(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot use the encrypted credential vault.');
  return globalThis.crypto.subtle;
}

function normalizeSecrets(value: unknown): VaultSecrets {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: VaultSecrets = {};
  for (const [provider, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const secret: ProviderSecret = {};
    for (const field of FIELDS) {
      const fieldValue = (raw as Record<string, unknown>)[field];
      if (typeof fieldValue === 'string' && fieldValue) secret[field] = fieldValue;
    }
    if (Object.keys(secret).length) result[provider] = secret;
  }
  return result;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = cryptoApi();
  const material = await subtle.importKey(
    'raw',
    bufferSource(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: bufferSource(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptSecrets(key: CryptoKey, secrets: VaultSecrets): Promise<{ iv: string; ciphertext: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoApi().encrypt(
    { name: 'AES-GCM', iv: bufferSource(iv) },
    key,
    bufferSource(new TextEncoder().encode(JSON.stringify(secrets))),
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** One-line, length-bounded hint; empty means no hint is stored at all. */
function cleanHint(hint: string | undefined): string {
  const cleaned = (hint ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, VAULT_MAX_HINT);
  return cleaned;
}

function validateVault(vault: EncryptedVault): void {
  if (vault.version !== VAULT_VERSION || vault.algorithm !== 'AES-GCM' || vault.kdf !== 'PBKDF2-SHA-256') {
    throw new Error('This credential vault format is not supported.');
  }
  if (!vault.salt || !vault.iv || !vault.ciphertext) throw new Error('The credential vault is incomplete.');
  if (!Number.isFinite(vault.iterations) || vault.iterations < 100_000) throw new Error('The credential vault is invalid.');
}

export async function createVault(
  passphrase: string,
  secrets: VaultSecrets = {},
  hint = '',
): Promise<{ vault: EncryptedVault; session: UnlockedVault }> {
  if (passphrase.length < VAULT_MIN_PASSPHRASE) {
    throw new Error(`Use a vault passphrase of at least ${VAULT_MIN_PASSPHRASE} characters.`);
  }
  const normalized = normalizeSecrets(secrets);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, VAULT_ITERATIONS);
  const encrypted = await encryptSecrets(key, normalized);
  const clean = cleanHint(hint);
  const vault: EncryptedVault = {
    version: VAULT_VERSION,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: VAULT_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    updatedAt: new Date().toISOString(),
    ...(clean ? { hint: clean } : {}),
  };
  return {
    vault,
    session: {
      secrets: normalized,
      key,
      salt: vault.salt,
      iterations: vault.iterations,
    },
  };
}

export async function unlockVault(vault: EncryptedVault, passphrase: string): Promise<UnlockedVault> {
  validateVault(vault);
  try {
    const salt = base64ToBytes(vault.salt);
    const key = await deriveKey(passphrase, salt, vault.iterations);
    const plaintext = await cryptoApi().decrypt(
      { name: 'AES-GCM', iv: bufferSource(base64ToBytes(vault.iv)) },
      key,
      bufferSource(base64ToBytes(vault.ciphertext)),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
    return {
      secrets: normalizeSecrets(parsed),
      key,
      salt: vault.salt,
      iterations: vault.iterations,
    };
  } catch {
    throw new Error('That passphrase did not unlock this vault.');
  }
}

/** Re-encrypt with a fresh IV but the same already-derived key and KDF salt. */
export async function sealVault(session: UnlockedVault, secrets: VaultSecrets): Promise<EncryptedVault> {
  const normalized = normalizeSecrets(secrets);
  const encrypted = await encryptSecrets(session.key, normalized);
  return {
    version: VAULT_VERSION,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: session.iterations,
    salt: session.salt,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Re-key the vault under a new passphrase. A fresh salt forces a new PBKDF2
 * derivation, and the returned session keeps editing possible without a
 * re-unlock. The caller owns replacing the stored ciphertext.
 */
export async function rotateVault(
  _session: UnlockedVault,
  newPassphrase: string,
  secrets: VaultSecrets,
  hint = '',
): Promise<{ vault: EncryptedVault; session: UnlockedVault }> {
  if (newPassphrase.length < VAULT_MIN_PASSPHRASE) {
    throw new Error(`Use a new passphrase of at least ${VAULT_MIN_PASSPHRASE} characters.`);
  }
  const normalized = normalizeSecrets(secrets);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(newPassphrase, salt, VAULT_ITERATIONS);
  const encrypted = await encryptSecrets(key, normalized);
  const clean = cleanHint(hint);
  const saltText = bytesToBase64(salt);
  return {
    vault: {
      version: VAULT_VERSION,
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: VAULT_ITERATIONS,
      salt: saltText,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      updatedAt: new Date().toISOString(),
      ...(clean ? { hint: clean } : {}),
    },
    session: { secrets: normalized, key, salt: saltText, iterations: VAULT_ITERATIONS },
  };
}

/** Read the old plaintext fields so the first vault setup can migrate them. */
export function legacySecrets(ds: Dataset): VaultSecrets {
  const result: VaultSecrets = {};
  for (const provider of PROVIDERS) {
    const p = ds.providers?.[provider] as Record<string, unknown> | undefined;
    if (!p) continue;
    const secret: ProviderSecret = {};
    if (typeof p.accessUsername === 'string' && p.accessUsername) secret.username = p.accessUsername;
    if (typeof p.accessPassword === 'string' && p.accessPassword) secret.password = p.accessPassword;
    if (typeof p.chargeLetterPassword === 'string' && p.chargeLetterPassword) secret.chargeLetterPassword = p.chargeLetterPassword;
    if (typeof p.accessBill === 'string' && p.accessBill) secret.accessBill = p.accessBill;
    if (Object.keys(secret).length) result[provider] = secret;
  }
  return result;
}

/** Remove legacy plaintext fields after they have been encrypted into the vault. */
export function stripLegacySecrets(ds: Dataset): void {
  for (const provider of PROVIDERS) {
    const p = ds.providers?.[provider] as Record<string, unknown> | undefined;
    if (!p) continue;
    delete p.accessUsername;
    delete p.accessPassword;
    delete p.chargeLetterPassword;
    delete p.accessBill;
  }
  delete (ds.settings as unknown as Record<string, unknown>).plaintextCredentials;
}
