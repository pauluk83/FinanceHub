import { useEffect, useState } from 'react';
import { HOSTED_WEB } from './runtime.ts';
import { readPersistedValue, removePersistedValue, writePersistedValue } from './store.ts';
import { AI_DEFAULT_MODEL, parseAiSettings, parseAiSettingsRecord, type AiSettings } from './ai.ts';
import { sealWithDeviceKey, unsealWithDeviceKey } from './aiDeviceKey.ts';

/**
 * The OpenRouter key is a device setting, kept in the same local store as the
 * rest of the app's settings rather than in the credential vault. That is what
 * lets the assistant answer without a vault passphrase; the key still never
 * enters the budget document, a backup or sync.
 *
 * The Windows app's store encrypts every value with Electron `safeStorage`
 * (DPAPI). The hosted build has no OS keystore, so its record is sealed with a
 * non-extractable device key in IndexedDB and read asynchronously.
 */
export const aiStorageKey = (userId: string) => `financehub.ai.v1:${userId}`;

const empty = (): AiSettings => ({ apiKey: '', model: AI_DEFAULT_MODEL });

/** Windows app: the DPAPI-backed value store, read synchronously. */
export function readAiSettings(userId: string): AiSettings {
  return parseAiSettings(readPersistedValue(aiStorageKey(userId)));
}

/** Hosted web: the record is sealed, so reading it is asynchronous. */
export async function loadAiSettings(userId: string): Promise<AiSettings> {
  if (!HOSTED_WEB) return readAiSettings(userId);
  const key = aiStorageKey(userId);
  const record = parseAiSettingsRecord(readPersistedValue(key));
  if (record.kind === 'empty') return empty();
  if (record.kind === 'sealed') {
    const plaintext = await unsealWithDeviceKey(record.iv, record.ciphertext);
    return plaintext ? parseAiSettings(plaintext) : empty();
  }
  // A key saved before the wrap: seal it now and replace the plaintext record.
  const sealed = await sealWithDeviceKey(JSON.stringify(record.settings));
  if (sealed) writePersistedValue(key, JSON.stringify(sealed));
  return record.settings;
}

/** Save the key, or forget the record entirely when the key is cleared. */
export async function saveAiSettings(userId: string, settings: AiSettings): Promise<boolean> {
  const key = aiStorageKey(userId);
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    removePersistedValue(key);
    return true;
  }
  const plaintext = JSON.stringify({ apiKey, model: settings.model.trim() || AI_DEFAULT_MODEL });
  if (!HOSTED_WEB) return writePersistedValue(key, plaintext);
  const sealed = await sealWithDeviceKey(plaintext);
  return sealed ? writePersistedValue(key, JSON.stringify(sealed)) : false;
}

export interface AiSettingsState {
  settings: AiSettings;
  /** True while the hosted build is unsealing the saved key. */
  loading: boolean;
  save: (next: AiSettings) => Promise<boolean>;
}

export function useAiSettings(userId: string): AiSettingsState {
  const [settings, setSettings] = useState<AiSettings>(() => (HOSTED_WEB ? empty() : readAiSettings(userId)));
  const [loading, setLoading] = useState(HOSTED_WEB);

  useEffect(() => {
    let live = true;
    if (!HOSTED_WEB) {
      setSettings(readAiSettings(userId));
      setLoading(false);
      return () => { live = false; };
    }
    setLoading(true);
    void loadAiSettings(userId).then((next) => {
      if (!live) return;
      setSettings(next);
      setLoading(false);
    });
    return () => { live = false; };
  }, [userId]);

  const save = async (next: AiSettings) => {
    const ok = await saveAiSettings(userId, next);
    if (ok) setSettings({ apiKey: next.apiKey.trim(), model: next.model.trim() || AI_DEFAULT_MODEL });
    return ok;
  };

  return { settings, loading, save };
}
