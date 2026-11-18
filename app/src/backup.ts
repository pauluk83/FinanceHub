import type { Dataset } from '../../core/engine';
import { isCalendarDate } from '../../core/dates.ts';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function dateString(value: unknown): boolean {
  return typeof value === 'string' && DATE.test(value) && isCalendarDate(value);
}

function named(value: unknown): boolean {
  return record(value) && typeof value.name === 'string' && value.name.trim() !== '';
}

function person(value: unknown): boolean {
  return record(value) && typeof value.shortName === 'string' && typeof value.fullName === 'string';
}

function identified(value: unknown): boolean {
  return record(value) && typeof value.id === 'string' && value.id !== '';
}

/** A row the engine dereferences directly: a bad one must not reach a dataset. */
function transactionRow(value: unknown): boolean {
  return record(value)
    && isCalendarDate(value.date)
    && typeof value.account === 'string' && value.account !== ''
    && (value.type === 'Income' || value.type === 'Expense')
    && finiteNumber(value.amountPence)
    && finiteNumber(value.row);
}

function everyRecord(list: unknown[]): boolean {
  return list.every(record);
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

  // A null or half-written row used to pass the shape check and then crash the
  // engine after it had replaced the live budget, so every row is checked here.
  if (!(parsed.transactions as unknown[]).every(transactionRow)) return null;
  if (!(parsed.accounts as unknown[]).every(named)) return null;
  if (!(parsed.cards as unknown[]).every(named)) return null;
  if (!(parsed.bills as unknown[]).every(named)) return null;
  if (!(parsed.people as unknown[]).every(person)) return null;
  if (!(parsed.billChanges as unknown[]).every(record)) return null;
  for (const key of ['debts', 'savings', 'importBatches', 'csvProfiles']) {
    const list = parsed[key];
    if (list !== undefined && (!Array.isArray(list) || !list.every(identified))) return null;
  }
  for (const key of ['recurringDismissed', 'categories']) {
    const list = parsed[key];
    if (list !== undefined && (!Array.isArray(list) || !list.every((entry) => typeof entry === 'string'))) return null;
  }
  if (parsed.monthLocks !== undefined) {
    for (const lock of Object.values(parsed.monthLocks)) {
      if (!record(lock) || typeof lock.lockedAt !== 'string') return null;
    }
  }

  const incomeSchedules = parsed.incomeSchedules as Record<string, unknown>;
  if (!Array.isArray(incomeSchedules.pip) || !Array.isArray(incomeSchedules.uc)) return null;
  if (!everyRecord(incomeSchedules.pip) || !everyRecord(incomeSchedules.uc)) return null;
  if (findUnsafeUrlField(parsed)) return null;

  return structuredClone({
    ...parsed,
    monthLocks: parsed.monthLocks ?? {},
    changelog: Array.isArray(parsed.changelog) ? parsed.changelog : [],
    audit: Array.isArray(parsed.audit) ? parsed.audit : [],
  }) as unknown as Dataset;
}
