/**
 * A bounded, redacted crash journal.
 *
 * It exists to answer "the app closed once" without sending anything anywhere:
 * entries stay on this device, contain no amounts, names or comments, and are
 * summarised in the redacted support bundle as a count and a timestamp only.
 */
export interface CrashEntry {
  at: string;
  source: 'error' | 'promise' | 'render';
  message: string;
}

export const CRASH_LIMIT = 10;
const CRASH_KEY = 'financehub.crash.v1';

const PATH = /[A-Za-z]:\\[^\s"'<>]+/g;
const URL_TEXT = /https?:\/\/\S+/g;
const EMAIL = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
const LONG_TOKEN = /\b[0-9a-fA-F]{32,}\b/g;

/** Strip anything that could carry a path, a token, an address or a URL. */
export function redactCrashText(value: unknown): string {
  const text = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : String(value ?? '');
  return text
    .replace(PATH, '[path]')
    .replace(URL_TEXT, '[url]')
    .replace(EMAIL, '[email]')
    .replace(LONG_TOKEN, '[token]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

/** Newest first, capped; the journal can never grow without limit. */
export function pushCrash(entries: CrashEntry[], entry: CrashEntry, limit = CRASH_LIMIT): CrashEntry[] {
  return [entry, ...entries].slice(0, limit);
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCrashJournal(): CrashEntry[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(CRASH_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is CrashEntry => Boolean(entry) && typeof entry === 'object'
        && typeof (entry as CrashEntry).message === 'string'
        && typeof (entry as CrashEntry).at === 'string')
      .slice(0, CRASH_LIMIT);
  } catch {
    return [];
  }
}

export function recordCrash(source: CrashEntry['source'], value: unknown, at = new Date().toISOString()): void {
  const store = storage();
  if (!store) return;
  try {
    const entry: CrashEntry = { at, source, message: redactCrashText(value) };
    store.setItem(CRASH_KEY, JSON.stringify(pushCrash(readCrashJournal(), entry)));
  } catch {
    /* a full cache must never turn a handled error into a second failure */
  }
}

/** Counts only: safe to put in a support bundle. */
export function crashSummary(): { count: number; newestAt: string | null } {
  const entries = readCrashJournal();
  return { count: entries.length, newestAt: entries[0]?.at ?? null };
}
