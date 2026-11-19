/**
 * IndexedDB cache for the hosted build.
 *
 * `localStorage` caps an origin at about 5 MB and is synchronous; a growing
 * budget can fill it. IndexedDB has a much larger quota, so the hosted build
 * keeps its documents there and hydrates an in-memory map at boot, which keeps
 * the rest of the store synchronous. Existing `localStorage` documents are
 * migrated once and removed only after their IndexedDB write succeeds.
 *
 * The desktop app never uses this module: it has the DPAPI-backed store.
 */
const DB_NAME = 'financehub-cache';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

let cache: Map<string, string> | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;
let writeChain: Promise<void> = Promise.resolve();

/** Keys that must move; an entry already in IndexedDB wins over a stale copy. */
export function entriesToMigrate(
  local: Record<string, string>,
  cached: ReadonlySet<string>,
): [string, string][] {
  return Object.entries(local)
    .filter(([key, value]) => key.startsWith('financehub.') && typeof value === 'string' && !cached.has(key));
}

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

function queueWrite(op: () => Promise<void>): void {
  writeChain = writeChain.then(op).catch(() => { /* the in-memory copy is still correct */ });
}

async function put(db: IDBDatabase, key: string, value: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function remove(db: IDBDatabase, key: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function localKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (typeof value === 'string') out[key] = value;
    }
  } catch {
    /* sign-out and private mode can both refuse localStorage */
  }
  return out;
}

/** Load the cache, migrating any `localStorage` documents first. */
export async function hydrateIdbCache(): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  const values = new Map<string, string>();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.value === 'string') values.set(String(cursor.key), cursor.value);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return false;
  }

  const local = localKeys();
  const pending = entriesToMigrate(local, new Set(values.keys()));
  for (const [key, value] of pending) {
    try {
      await put(db, key, value);
      values.set(key, value);
      localStorage.removeItem(key);
    } catch {
      /* keep the localStorage copy when the migration write fails */
    }
  }

  cache = values;
  return true;
}

/** The hydrated map, or null when IndexedDB is unavailable. */
export function idbValues(): Map<string, string> | null {
  return cache;
}

export function idbSet(key: string, value: string): void {
  if (!cache) return;
  cache.set(key, value);
  queueWrite(async () => {
    const db = await open();
    if (db) await put(db, key, value);
  });
}

export function idbRemove(key: string): void {
  if (!cache) return;
  cache.delete(key);
  queueWrite(async () => {
    const db = await open();
    if (db) await remove(db, key);
  });
}
