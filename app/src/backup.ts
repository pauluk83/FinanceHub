import type { Dataset } from '../../core/engine';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function dateString(value: unknown): boolean {
  return typeof value === 'string' && DATE.test(value);
}

/**
 * Restore-side URL guard. Provider links are rendered as anchors, so a backup
 * must not be able to introduce a script or local-file scheme. HTTP is still
 * accepted because one existing provider charge letter is served over HTTP;
 * every other scheme, and URLs carrying credentials, is rejected.
 */
const SAFE_URL_PROTOCOL = /^https?:$/;
const URL_FIELD = /(?:url|href)$/i;

function unsafeUrl(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  try {
    const url = new URL(text);
    return !SAFE_URL_PROTOCOL.test(url.protocol) || Boolean(url.username) || Boolean(url.password);
  } catch {
    return true;
  }
}

/** Return the path of the first URL-like field with an unsafe scheme. */
export function findUnsafeUrlField(value: unknown, path = ''): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const hit = findUnsafeUrlField(value[index], `${path}[${index}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (!record(value)) return null;
  for (const [key, entry] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (URL_FIELD.test(key) && typeof entry === 'string' && unsafeUrl(entry)) return next;
    if (record(entry) || Array.isArray(entry)) {
      const hit = findUnsafeUrlField(entry, next);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Validate the full JSON backup produced by Settings → Data & backups.
 * The function is deliberately strict about the structure the engine relies on,
 * then returns a detached copy so the caller can replace the live dataset.
 */
export function decodeBackupDataset(value: unknown): Dataset | null {
  let parsed: unknown;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
  if (!record(parsed)) return null;

  const settings = parsed.settings;
  if (!record(settings)) return null;
  if (!finiteNumber(settings.targetYear) || !finiteNumber(settings.startMonth) || !finiteNumber(settings.monthsInYear)) return null;
  if (typeof settings.currency !== 'string') return null;
  if (!dateString(settings.asOfDate) || !dateString(settings.lockCutoff) || !dateString(settings.anchorDate)) return null;

  for (const key of ['accounts', 'people', 'cards', 'bills', 'billChanges', 'transactions']) {
    if (!Array.isArray(parsed[key])) return null;
  }
  for (const key of ['holidays', 'providers', 'incomeSchedules']) {
    if (!record(parsed[key])) return null;
  }
  if (parsed.monthLocks !== undefined && !record(parsed.monthLocks)) return null;

  const incomeSchedules = parsed.incomeSchedules as Record<string, unknown>;
  if (!Array.isArray(incomeSchedules.pip) || !Array.isArray(incomeSchedules.uc)) return null;
  if (findUnsafeUrlField(parsed)) return null;

  return structuredClone({
    ...parsed,
    monthLocks: parsed.monthLocks ?? {},
    changelog: Array.isArray(parsed.changelog) ? parsed.changelog : [],
    audit: Array.isArray(parsed.audit) ? parsed.audit : [],
  }) as unknown as Dataset;
}
