/**
 * Starling personal-feed normalisation.
 *
 * This is deliberately separate from the cloud/Open Banking work: a Starling
 * personal access token can read the owner's own account, but it is not an
 * AISP connection and must never be described as Open Banking.
 *
 * The API returns feed items with a direction and an unsigned amount. Pending,
 * upcoming and reversed items are excluded so the same transaction is not
 * imported before it settles and then imported again later.
 */

export interface StarlingAccount {
  accountUid: string;
  defaultCategoryUid: string;
  name: string;
  accountType: string;
  currency: string;
  createdAt?: string;
}

export interface StarlingImportRow {
  id: string;
  date: string;
  description: string;
  amountPence: number;
  type: 'Income' | 'Expense';
  status: 'SETTLED';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function minorUnits(value: unknown): number | null {
  const amount = record(value);
  const raw = amount.minorUnits ?? amount.minorUnit;
  return typeof raw === 'number' && Number.isSafeInteger(raw) ? raw : null;
}

function datePart(value: unknown): string {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) return '';
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  // Starling returns UTC timestamps. Use the UK calendar date so a late-night
  // transaction does not land on the previous day (or an hour into the next).
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  return DATE_RE.test(date) ? date : '';
}

export function isStarlingUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Keep only the fields the renderer needs; never pass a token through. */
export function normaliseStarlingAccounts(input: unknown): StarlingAccount[] {
  if (!Array.isArray(input)) return [];
  const accounts: StarlingAccount[] = [];
  for (const entry of input) {
    const account = record(entry);
    const accountUid = text(account.accountUid);
    const defaultCategoryUid = text(account.defaultCategoryUid ?? account.defaultCategory);
    if (!isStarlingUuid(accountUid) || !isStarlingUuid(defaultCategoryUid)) continue;
    const name = text(account.name) || text(account.accountType) || 'Starling account';
    accounts.push({
      accountUid,
      defaultCategoryUid,
      name,
      accountType: text(account.accountType),
      currency: text(account.currency).toUpperCase(),
      ...(text(account.createdAt) ? { createdAt: text(account.createdAt) } : {}),
    });
  }
  return accounts;
}

/**
 * Convert settled Starling feed items into review-grid rows. The caller still
 * runs duplicate detection and requires an explicit append.
 */
export function starlingImportRows(input: unknown): StarlingImportRow[] {
  if (!Array.isArray(input)) return [];
  const rows: StarlingImportRow[] = [];
  input.forEach((entry, index) => {
    const item = record(entry);
    if (text(item.status).toUpperCase() !== 'SETTLED') return;
    const amountPence = minorUnits(item.amount);
    if (amountPence === null || amountPence === 0) return;
    const date = datePart(item.transactionTime ?? item.settlementTime);
    if (!date) return;

    const direction = text(item.direction).toUpperCase();
    const type: 'Income' | 'Expense' = direction === 'IN' || (!direction && amountPence > 0)
      ? 'Income'
      : 'Expense';
    const counterparty = text(item.counterPartyName);
    const reference = text(item.reference);
    const fallback = text(item.transactionType) || 'Starling transaction';
    const description = (counterparty && reference && counterparty !== reference
      ? `${counterparty} — ${reference}`
      : counterparty || reference || fallback).slice(0, 240);
    const id = text(item.feedItemUid) || `starling_${date}_${Math.abs(amountPence)}_${index}`;

    rows.push({
      id,
      date,
      description,
      amountPence: Math.abs(amountPence),
      type,
      status: 'SETTLED',
    });
  });

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Starling's non-paginated feed endpoints reject ranges longer than one year. */
export function starlingDateRangeProblem(min: string, max: string): string | null {
  if (!DATE_RE.test(min) || !DATE_RE.test(max)) return 'Choose a valid start and end date.';
  if (max < min) return 'The end date must not be before the start date.';
  const days = Math.round((Date.parse(`${max}T00:00:00Z`) - Date.parse(`${min}T00:00:00Z`)) / 86_400_000);
  if (days > 365) return 'Starling allows at most one year of transactions per request.';
  return null;
}
