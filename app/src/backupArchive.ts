/**
 * Encrypted, versioned backup envelope (format v2).
 *
 * The JSON export remains available for inspection and manual recovery. This
 * envelope keeps the same document private with PBKDF2-SHA-256 and AES-256-GCM,
 * and records the format version and creation time so old backups stay readable.
 */
export const BACKUP_FORMAT = 'financehub-backup-v2';
export const BACKUP_VERSION = 2;
export const BACKUP_ITERATIONS = 600_000;
export const MIN_BACKUP_PASSPHRASE = 8;

export interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  payload: string;
  checksum: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: BACKUP_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function assertPassphrase(passphrase: string) {
  if (passphrase.length < MIN_BACKUP_PASSPHRASE) {
    throw new Error(`Use at least ${MIN_BACKUP_PASSPHRASE} characters for the backup passphrase.`);
  }
}

export async function encryptBackup(value: unknown, passphrase: string, createdAt = new Date().toISOString()): Promise<EncryptedBackup> {
  assertPassphrase(passphrase);
  const plaintext = JSON.stringify(value);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: BACKUP_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(ciphertext)),
    checksum: await digest(plaintext),
  };
}

function isEnvelope(value: unknown): value is EncryptedBackup {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<EncryptedBackup>;
  return entry.format === BACKUP_FORMAT
    && entry.version === BACKUP_VERSION
    && typeof entry.createdAt === 'string'
    && entry.kdf?.name === 'PBKDF2'
    && entry.kdf?.hash === 'SHA-256'
    && typeof entry.kdf?.salt === 'string'
    && typeof entry.kdf?.iterations === 'number'
    && entry.cipher?.name === 'AES-GCM'
    && typeof entry.cipher?.iv === 'string'
    && typeof entry.payload === 'string'
    && typeof entry.checksum === 'string';
}

export async function decryptBackup(value: string | EncryptedBackup, passphrase: string): Promise<unknown | null> {
  let envelope: unknown = value;
  if (typeof value === 'string') {
    try { envelope = JSON.parse(value); } catch { return null; }
  }
  if (!isEnvelope(envelope)) return null;
  try {
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const key = await deriveKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      base64ToBytes(envelope.payload) as unknown as BufferSource,
    );
    const text = new TextDecoder().decode(plaintext);
    if (await digest(text) !== envelope.checksum) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
