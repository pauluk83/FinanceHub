/**
 * The hosted build has no OS keystore, so the OpenRouter key is wrapped with an
 * AES-GCM key that WebCrypto generates as non-extractable and keeps in its own
 * IndexedDB database. The raw key material never exists as a JavaScript value
 * or a stored string: copying the browser profile yields ciphertext plus a key
 * handle the browser will only use on this origin. This is not a passphrase
 * gate, so the assistant still opens without an unlock step.
 *
 * The desktop app never uses this module: its values are encrypted per value by
 * Electron `safeStorage` (Windows DPAPI).
 */
const DB_NAME = 'financehub-aikey';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const DEVICE_KEY = 'device';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
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

function cryptoApi(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

async function readDeviceKey(db: IDBDatabase): Promise<CryptoKey | null> {
  try {
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(DEVICE_KEY);
      request.onsuccess = () => {
        const value = request.result as unknown;
        resolve(typeof CryptoKey !== 'undefined' && value instanceof CryptoKey ? value : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/** Generated once per browser profile; `extractable: false` from the start. */
async function createDeviceKey(db: IDBDatabase): Promise<CryptoKey | null> {
  const subtle = cryptoApi();
  if (!subtle) return null;
  try {
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    if (!(key instanceof CryptoKey)) return null;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(key, DEVICE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return key;
  } catch {
    return null;
  }
}

async function deviceKey(): Promise<CryptoKey | null> {
  const db = await open();
  if (!db) return null;
  return (await readDeviceKey(db)) ?? (await createDeviceKey(db));
}

/** Encrypt the AI settings for the hosted store; null when the browser cannot. */
export async function sealWithDeviceKey(plaintext: string): Promise<{ iv: string; ciphertext: string } | null> {
  const subtle = cryptoApi();
  if (!subtle) return null;
  const key = await deviceKey();
  if (!key) return null;
  try {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle.encrypt(
      { name: 'AES-GCM', iv: bufferSource(iv) },
      key,
      bufferSource(new TextEncoder().encode(plaintext)),
    );
    return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
  } catch {
    return null;
  }
}

/** Null for a damaged record or a profile without the device key. */
export async function unsealWithDeviceKey(ivText: string, ciphertextText: string): Promise<string | null> {
  const subtle = cryptoApi();
  if (!subtle) return null;
  const db = await open();
  if (!db) return null;
  const key = await readDeviceKey(db);
  if (!key) return null;
  try {
    const plaintext = await subtle.decrypt(
      { name: 'AES-GCM', iv: bufferSource(base64ToBytes(ivText)) },
      key,
      bufferSource(base64ToBytes(ciphertextText)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
