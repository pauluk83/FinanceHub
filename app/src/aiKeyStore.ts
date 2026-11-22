import { readPersistedValue, removePersistedValue, writePersistedValue } from './store.ts';
import { AI_DEFAULT_MODEL, parseAiSettings, type AiSettings } from './ai.ts';

/**
 * The OpenRouter key is a device setting, kept in the same local store as the
 * rest of the app's settings rather than in the credential vault. That is what
 * lets the assistant answer without a vault passphrase; the key still never
 * enters the budget document, a backup or sync.
 */
export const aiStorageKey = (userId: string) => `financehub.ai.v1:${userId}`;

export function readAiSettings(userId: string): AiSettings {
  return parseAiSettings(readPersistedValue(aiStorageKey(userId)));
}

/** Save the key, or forget the record entirely when the key is cleared. */
export function writeAiSettings(userId: string, settings: AiSettings): boolean {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    removePersistedValue(aiStorageKey(userId));
    return true;
  }
  return writePersistedValue(
    aiStorageKey(userId),
    JSON.stringify({ apiKey, model: settings.model.trim() || AI_DEFAULT_MODEL }),
  );
}
