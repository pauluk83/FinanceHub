/**
 * Recurring and subscription detection (R4).
 *
 * Detection is read-only: it groups ordinary expense rows by the merchant name
 * the import rules already normalise, looks for a regular cadence, and suggests
 * a bill. Nothing is created without an explicit "add as bill", and a bill that
 * already covers the charge suppresses the suggestion.
 */
import type { Dataset, Tx } from './engine.ts';
import { normaliseMerchant } from './importRules.ts';

export type Cadence = 'weekly' | 'fourWeekly' | 'monthly' | 'quarterly' | 'annual';

export const CADENCES: Record<Cadence, { label: string; days: number; low: number; high: number }> = {
  weekly: { label: 'Weekly', days: 7, low: 6, high: 8 },
  fourWeekly: { label: 'Every 4 weeks', days: 28, low: 26, high: 30 },
  monthly: { label: 'Monthly', days: 30, low: 27, high: 33 },
  quarterly: { label: 'Quarterly', days: 91, low: 84, high: 98 },
  annual: { label: 'Annual', days: 365, low: 350, high: 380 },
};

/** Three charges is the smallest run that can show a rhythm. */
export const MIN_OCCURRENCES = 3;
/** Charges may drift by 15% or £1 before the series stops looking regular. */
export const AMOUNT_TOLERANCE_PCT = 0.15;
export const AMOUNT_TOLERANCE_PENCE = 100;
/** A subscription is still current for one interval plus a fortnight. */
export const RECENCY_GRACE_DAYS = 14;

const DAY_MS = 86_400_000;

function dayValue(iso: string): number {
  return Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
}

function addDays(iso: string, days: number): string {
  return new Date(dayValue(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(later: string, earlier: string): number {
  return Math.round((dayValue(later) - dayValue(earlier)) / DAY_MS);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function cadenceFor(days: number): Cadence | null {
  for (const [id, info] of Object.entries(CADENCES) as [Cadence, (typeof CADENCES)[Cadence]][]) {
    if (days >= info.low && days <= info.high) return id;
  }
  return null;
}

export interface RecurringSuggestion {
  /** Normalised merchant key; also the dismiss key. */
  key: string;
  merchant: string;
  cadence: Cadence;
  occurrences: number;
  /** The latest charge. */
  amountPence: number;
  /** Median of every charge before the latest, when a price change is visible. */
  previousAmountPence?: number;
  priceChangePence?: number;
  firstDate: string;
  lastDate: string;
  nextExpectedDate: string;
  confidence: 'high' | 'medium';
  account: string;
  /** Row numbers so the evidence is inspectable. */
  rows: number[];
  /** Set when a current bill already covers this merchant. */
  suppressedBy?: string;
  dismissed?: boolean;
}

function isRecurringCandidate(tx: Tx): boolean {
  return tx.type === 'Expense'
    && tx.budgetTreatment !== 'Transfer'
    && tx.budgetTreatment !== 'Refund'
    && tx.autoBill !== true;
}

function billCovers(ds: Dataset, key: string): string | undefined {
  for (const bill of ds.bills) {
    const candidates = [bill.name, bill.linkedSheet].filter(Boolean);
    for (const candidate of candidates) {
      const name = normaliseMerchant(candidate).toLowerCase();
      if (name.length < 4) continue;
      if (name.includes(key) || key.includes(name)) return bill.name;
    }
  }
  return undefined;
}

/**
 * Every merchant that looks like a subscription, newest expectation first.
 * Suppressed and dismissed suggestions are still returned so the UI can
 * explain why they are not being offered.
 */
export function recurringSuggestions(
  ds: Dataset,
  through: string = ds.settings.asOfDate,
  options: { includeDismissed?: boolean } = {},
): RecurringSuggestion[] {
  const dismissed = new Set(ds.recurringDismissed ?? []);
  const groups = new Map<string, Tx[]>();

  for (const tx of ds.transactions) {
    if (!isRecurringCandidate(tx)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) continue;
    if (through && tx.date > through) continue;
    const key = normaliseMerchant(tx.comments).toLowerCase();
    if (key.length < 3) continue;
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }

  const found: RecurringSuggestion[] = [];

  for (const [key, list] of groups) {
    // One charge per day is enough to establish the rhythm; a duplicate row on
    // the same day would otherwise look like a zero-day interval.
    const byDay = new Map<string, Tx>();
    for (const tx of [...list].sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row)) {
      byDay.set(tx.date, tx);
    }
    const rows = [...byDay.values()];
    if (rows.length < MIN_OCCURRENCES) continue;

    const intervals = rows.slice(1).map((row, index) => daysBetween(row.date, rows[index].date));
    const cadenceId = cadenceFor(median(intervals));
    if (!cadenceId) continue;
    const band = CADENCES[cadenceId];
    const inBand = intervals.filter((days) => days >= band.low && days <= band.high).length;
    if (inBand < Math.max(2, Math.ceil(intervals.length * 0.75))) continue;

    const last = rows[rows.length - 1];
    if (through && daysBetween(through, last.date) > band.days + RECENCY_GRACE_DAYS) continue;

    const amounts = rows.map((row) => row.amountPence);
    const typical = median(amounts);
    const tolerance = Math.max(AMOUNT_TOLERANCE_PENCE, Math.round(typical * AMOUNT_TOLERANCE_PCT));
    if (amounts.some((amount) => Math.abs(amount - typical) > tolerance)) continue;

    const earlier = amounts.slice(0, -1);
    const previous = earlier.length >= 2 ? median(earlier) : null;
    const priceChange = previous !== null && Math.abs(last.amountPence - previous) >= AMOUNT_TOLERANCE_PENCE
      ? last.amountPence - previous
      : undefined;

    const suppressedBy = billCovers(ds, key);
    const isDismissed = dismissed.has(key);
    if (isDismissed && !options.includeDismissed) continue;

    found.push({
      key,
      merchant: rows[rows.length - 1].comments.trim() || key,
      cadence: cadenceId,
      occurrences: rows.length,
      amountPence: last.amountPence,
      ...(previous !== null ? { previousAmountPence: previous } : {}),
      ...(priceChange !== undefined ? { priceChangePence: priceChange } : {}),
      firstDate: rows[0].date,
      lastDate: last.date,
      nextExpectedDate: addDays(last.date, Math.round(median(intervals))),
      confidence: rows.length >= 4 && inBand === intervals.length ? 'high' : 'medium',
      account: last.account,
      rows: rows.map((row) => row.row),
      ...(suppressedBy ? { suppressedBy } : {}),
      ...(isDismissed ? { dismissed: true } : {}),
    });
  }

  return found.sort((left, right) =>
    Number(Boolean(left.suppressedBy)) - Number(Boolean(right.suppressedBy))
    || (left.confidence === right.confidence ? 0 : left.confidence === 'high' ? -1 : 1)
    || left.nextExpectedDate.localeCompare(right.nextExpectedDate));
}

/** Only the suggestions worth offering: current, unsuppressed and not dismissed. */
export function activeRecurring(ds: Dataset, through?: string): RecurringSuggestion[] {
  return recurringSuggestions(ds, through).filter((entry) => !entry.suppressedBy && !entry.dismissed);
}

export interface BillPrefill {
  name: string;
  amountPence: number;
  dueDay: number;
  frequency: string;
  paymentMethod: string;
  linkedSheet: string;
  baseAmountPence: number;
  baseDueDay: number;
}

/**
 * Prefill for "add as bill". Bills in FinanceHub are scheduled monthly, so a
 * weekly or annual series carries its real cadence in the label and the owner
 * confirms the monthly amount before saving.
 */
export function billPrefill(suggestion: RecurringSuggestion): BillPrefill {
  const dueDay = Math.min(28, Math.max(1, Number(suggestion.lastDate.slice(8, 10)) || 1));
  return {
    name: suggestion.merchant.slice(0, 60),
    amountPence: suggestion.amountPence,
    dueDay,
    frequency: CADENCES[suggestion.cadence].label,
    paymentMethod: 'Direct Debit',
    linkedSheet: '',
    baseAmountPence: suggestion.amountPence,
    baseDueDay: dueDay,
  };
}
