/**
 * Bill price history and expiries (R15).
 *
 * The timeline is derived from the bill definition and its effective-dated
 * changes, so it can never disagree with the amount the engine charges. Manual
 * expiries and provider contract end dates feed the same consolidated list;
 * reminders are derived, never stored, so a paid or removed item disappears.
 */
import type { Dataset } from './engine.ts';
import { isCalendarDate } from './dates.ts';

export type ExpiryKind = 'contract' | 'insurance' | 'mot' | 'tenancy' | 'other';

export const EXPIRY_KINDS: { id: ExpiryKind; label: string }[] = [
  { id: 'contract', label: 'Contract end' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'mot', label: 'MOT' },
  { id: 'tenancy', label: 'Tenancy' },
  { id: 'other', label: 'Other' },
];

export interface Expiry {
  id: string;
  label: string;
  kind: ExpiryKind;
  date: string;
  /** How many days before the date a reminder should appear. */
  leadDays?: number;
  notes?: string;
  active?: boolean;
}

export const DEFAULT_EXPIRY_LEAD_DAYS = 30;

export function newExpiryId(existing: readonly Expiry[]): string {
  const used = new Set(existing.map((entry) => entry.id));
  for (let index = existing.length + 1; index < existing.length + 500; index += 1) {
    const id = `expiry_${index.toString(36)}`;
    if (!used.has(id)) return id;
  }
  return `expiry_${Date.now().toString(36)}`;
}

export function normaliseExpiry(input: Partial<Expiry>): Expiry | null {
  const label = String(input.label ?? '').trim().slice(0, 80);
  const date = String(input.date ?? '').trim();
  if (!label || !isCalendarDate(date)) return null;
  const kind = EXPIRY_KINDS.some((entry) => entry.id === input.kind) ? input.kind as ExpiryKind : 'other';
  const lead = Number(input.leadDays);
  return {
    id: String(input.id ?? '') || `expiry_${Date.now().toString(36)}`,
    label,
    kind,
    date,
    leadDays: Number.isFinite(lead) && lead >= 0 ? Math.min(Math.round(lead), 365) : DEFAULT_EXPIRY_LEAD_DAYS,
    ...(String(input.notes ?? '').trim() ? { notes: String(input.notes).trim().slice(0, 240) } : {}),
    ...(input.active === false ? { active: false } : {}),
  };
}

export interface PricePoint {
  bill: string;
  /** First day the amount applies. Empty for a bill with no effective date. */
  from: string;
  /** Last day it applies; empty means open-ended. */
  to: string;
  amountPence: number;
  previousPence: number | null;
  changePence: number | null;
  changePct: number | null;
  annualPence: number;
  changeType: string;
  note: string;
}

/**
 * Every stored amount for one bill, oldest first. A base amount is included
 * only when the bill records an effective date; otherwise the earliest change
 * is the first known price.
 */
export function billPriceHistory(ds: Dataset, billName: string): PricePoint[] {
  const bill = ds.bills.find((entry) => entry.name === billName);
  if (!bill) return [];

  const base = Number.isFinite(bill.baseAmountPence) && bill.baseAmountPence
    ? bill.baseAmountPence
    : Number(bill.amountPence) || 0;

  const rows: { from: string; to: string; amountPence: number; changeType: string; note: string }[] = [];
  if (isCalendarDate(bill.effectiveFrom)) {
    rows.push({ from: bill.effectiveFrom, to: '', amountPence: base, changeType: 'Base amount', note: '' });
  }

  const changes = ds.billChanges
    .filter((change) => change.bill === billName
      && typeof change.amountOverridePence === 'number'
      && Number.isFinite(change.amountOverridePence))
    .sort((left, right) => (left.appliesFrom || '').localeCompare(right.appliesFrom || ''));

  for (const change of changes) {
    rows.push({
      from: String(change.appliesFrom ?? ''),
      to: String(change.appliesTo ?? ''),
      amountPence: change.amountOverridePence as number,
      changeType: change.changeType || 'Bill change',
      note: change.note || '',
    });
  }

  if (rows.length === 0) {
    rows.push({ from: '', to: '', amountPence: base, changeType: 'Base amount', note: '' });
  }

  let previous: number | null = null;
  return rows.map((row) => {
    const changePence = previous === null ? null : row.amountPence - previous;
    const point: PricePoint = {
      bill: billName,
      from: row.from,
      to: row.to,
      amountPence: row.amountPence,
      previousPence: previous,
      changePence,
      changePct: previous === null || previous === 0 ? null : changePence! / previous,
      annualPence: row.amountPence * 12,
      changeType: row.changeType,
      note: row.note,
    };
    previous = row.amountPence;
    return point;
  });
}

export interface BillPriceSummary {
  bill: string;
  points: PricePoint[];
  currentPence: number;
  annualPence: number;
  nextChange: PricePoint | null;
  nextChangeDate: string;
}

/** Current price plus the next effective-dated change after `today`. */
export function billPriceSummary(ds: Dataset, billName: string, today = ds.settings.asOfDate): BillPriceSummary {
  const points = billPriceHistory(ds, billName);
  const current = points.filter((point) => !point.from || point.from <= today).at(-1)
    ?? points[0]
    ?? null;
  const next = points.find((point) => point.from && point.from > today) ?? null;
  return {
    bill: billName,
    points,
    currentPence: current?.amountPence ?? 0,
    annualPence: (current?.amountPence ?? 0) * 12,
    nextChange: next,
    nextChangeDate: next?.from ?? '',
  };
}

export interface ExpiryItem {
  id: string;
  label: string;
  kind: ExpiryKind;
  date: string;
  leadDays: number;
  notes?: string;
  source: 'manual' | 'provider';
}

function providerLabel(key: string, provider: any): string {
  const label = provider?.displayName ?? provider?.name;
  return typeof label === 'string' && label.trim() ? label.trim() : key;
}

/**
 * Manual expiries plus provider contract end dates. No credentials, account
 * numbers or payment figures are read; only the date and the display name.
 */
export function expiryList(ds: Dataset): ExpiryItem[] {
  const items: ExpiryItem[] = [];

  for (const expiry of ds.expiries ?? []) {
    if (expiry.active === false) continue;
    if (!isCalendarDate(expiry.date)) continue;
    items.push({
      id: expiry.id,
      label: expiry.label,
      kind: expiry.kind,
      date: expiry.date,
      leadDays: typeof expiry.leadDays === 'number' ? expiry.leadDays : DEFAULT_EXPIRY_LEAD_DAYS,
      ...(expiry.notes ? { notes: expiry.notes } : {}),
      source: 'manual',
    });
  }

  for (const [key, provider] of Object.entries(ds.providers ?? {})) {
    const date = String(provider?.contract?.endDate ?? '');
    if (!isCalendarDate(date)) continue;
    items.push({
      id: `provider:${key}:contract`,
      label: `${providerLabel(key, provider)} contract end`,
      kind: 'contract',
      date,
      leadDays: 60,
      source: 'provider',
    });
  }

  return items.sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label));
}

export interface ExpiryReminder extends ExpiryItem {
  days: number;
}

/** Expiries inside their own lead time, soonest first. */
export function expiryReminders(ds: Dataset, today = ds.settings.asOfDate, horizonDays = DEFAULT_EXPIRY_LEAD_DAYS): ExpiryReminder[] {
  const start = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start)) return [];
  const reminders: ExpiryReminder[] = [];
  for (const item of expiryList(ds)) {
    const at = Date.parse(`${item.date}T00:00:00Z`);
    if (!Number.isFinite(at) || at < start) continue;
    const days = Math.round((at - start) / 86_400_000);
    if (days > Math.max(item.leadDays, horizonDays)) continue;
    reminders.push({ ...item, days });
  }
  return reminders;
}
