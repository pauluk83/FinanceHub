import { baselineFor, recalculate, type LedgerSpec } from './providerLedger.ts';

export type RentEntry = {
  date: string;
  description?: string;
  amountPence?: number;
  balancePence?: number;
  [key: string]: unknown;
};

export type RentPaymentChange = {
  effectiveFrom: string;
  amountPence: number;
};

export type RentProvider = {
  monthlyRentPence?: number;
  weeklyChargePence?: number;
  monthlyPaymentPence?: number;
  paymentBasePence?: number;
  paymentChanges?: RentPaymentChange[];
  detailsEdited?: boolean;
  entries?: RentEntry[];
  /** Later years can live in their own block, like the other provider ledgers. */
  years?: Record<string, { rows?: RentEntry[]; [key: string]: unknown }>;
  [key: string]: unknown;
};

/** Rent is charged weekly at one quarter of the monthly rent in this workbook. */
export const weeklyRentPence = (monthlyPence: number): number => Math.round(monthlyPence / 4);

/** Every rent row, including later-year blocks, in one list. */
export function allRentEntries(rent: RentProvider): RentEntry[] {
  const entries = [...(rent.entries ?? [])];
  for (const block of Object.values(rent.years ?? {})) {
    if (Array.isArray(block?.rows)) entries.push(...block.rows);
  }
  return entries;
}

/**
 * Rows that a rent change is allowed to rewrite: future Rent Charge entries
 * on or after the effective date. Passed rows and zero/free-week rows stay
 * as history.
 */
export function rentChangeTargets(entries: readonly RentEntry[], asOfDate: string, effectiveFrom: string): RentEntry[] {
  return entries.filter((entry) =>
    entry.description === 'Rent Charge'
    && entry.date >= effectiveFrom
    && entry.date > asOfDate
    && (Number(entry.amountPence) || 0) !== 0,
  );
}

/**
 * Payment rows that a payment change is allowed to rewrite. Passed rows and
 * zero-payment months stay as history.
 */
/** Payment rows use the generic "Payment" label; older imports may still say "Payment from ...". */
export function isRentPaymentDescription(description: unknown): boolean {
  if (typeof description !== 'string') return false;
  return description === 'Payment' || /^Payment from\b/.test(description);
}

export function rentPaymentTargets(entries: readonly RentEntry[], asOfDate: string, effectiveFrom: string): RentEntry[] {
  return entries.filter((entry) =>
    isRentPaymentDescription(entry.description)
    && entry.date >= effectiveFrom
    && entry.date > asOfDate
    && (Number(entry.amountPence) || 0) !== 0,
  );
}

/** The rent sheet is a dated ledger of charges and payments; balances are shared with every provider sheet. */
const RENT_SPEC: LedgerSpec = { rowsKey: 'entries', formula: 'amount', monthly: false };

function rentBaseline(entries: RentEntry[]): number {
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return baselineFor(RENT_SPEC, ordered);
}

function recalculateRentBalances(entries: RentEntry[], baseline: number): void {
  entries.sort((a, b) => a.date.localeCompare(b.date));
  recalculate(RENT_SPEC, entries, baseline);
}

/**
 * The rent payment a month's bill should use: the newest payment change that
 * has taken effect by the month start, else the recorded payment, else null.
 */
export function rentPaymentPenceForMonth(rent: RentProvider, year: number, month: number): number | null {
  const mStart = `${year}-${String(month).padStart(2, '0')}-01`;
  let chosen: RentPaymentChange | null = null;
  for (const change of rent.paymentChanges ?? []) {
    if (change.effectiveFrom <= mStart && (!chosen || change.effectiveFrom > chosen.effectiveFrom)) chosen = change;
  }
  if (chosen) return chosen.amountPence;
  return rent.paymentBasePence ?? rent.monthlyPaymentPence ?? null;
}

/**
 * Rent ledger as of a date, computed by SUMIFS over the amount column rather
 * than by row order: the brought-forward row is part of the amount column, so
 * charges plus payments is the balance.
 */
export function rentLedgerThrough(rent: RentProvider, through: string) {
  const entries = allRentEntries(rent).filter((entry) => String(entry.date ?? '') <= through);
  const chargesPence = entries.filter((entry) => (Number(entry.amountPence) || 0) < 0).reduce((sum, entry) => sum + (Number(entry.amountPence) || 0), 0);
  const paymentsPence = entries.filter((entry) => (Number(entry.amountPence) || 0) > 0).reduce((sum, entry) => sum + (Number(entry.amountPence) || 0), 0);
  return { balancePence: chargesPence + paymentsPence, chargesPence, paymentsPence, entryCount: entries.length };
}

/**
 * Apply a monthly rent change, retaining every passed ledger row. Future
 * eligible charges are set to the new weekly amount and balances are rebuilt
 * in date order from the ledger's original starting balance.
 */
export function applyMonthlyRentChange(
  rent: RentProvider,
  asOfDate: string,
  monthlyPence: number,
  effectiveFrom: string,
): number {
  if (!Number.isInteger(monthlyPence) || monthlyPence <= 0) throw new Error('Monthly rent must be greater than zero');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new Error('Choose a valid rent start date');

  const entries = allRentEntries(rent);
  const baseline = rentBaseline(entries);
  const weekly = weeklyRentPence(monthlyPence);

  rent.monthlyRentPence = monthlyPence;
  rent.weeklyChargePence = -weekly;
  rent.detailsEdited = true;

  const targets = rentChangeTargets(entries, asOfDate, effectiveFrom);
  for (const entry of targets) entry.amountPence = -weekly;
  recalculateRentBalances(entries, baseline);

  return targets.length;
}

/**
 * Apply a monthly payment change, retaining passed ledger rows. The payment
 * history keeps earlier bill months on the old amount while future scheduled
 * Rent bills use the new amount.
 */
export function applyMonthlyPaymentChange(
  rent: RentProvider,
  asOfDate: string,
  paymentPence: number,
  effectiveFrom: string,
): number {
  if (!Number.isInteger(paymentPence) || paymentPence <= 0) throw new Error('Monthly payment must be greater than zero');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new Error('Choose a valid payment start date');

  const entries = allRentEntries(rent);
  const baseline = rentBaseline(entries);

  if (typeof rent.paymentBasePence !== 'number') {
    rent.paymentBasePence = typeof rent.monthlyPaymentPence === 'number' ? rent.monthlyPaymentPence : paymentPence;
  }
  rent.monthlyPaymentPence = paymentPence;
  rent.detailsEdited = true;

  const changes = [...(rent.paymentChanges ?? [])];
  const next: RentPaymentChange = { effectiveFrom, amountPence: paymentPence };
  const existing = changes.findIndex((change) => change.effectiveFrom === effectiveFrom);
  if (existing >= 0) changes[existing] = next;
  else changes.push(next);
  rent.paymentChanges = changes.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const targets = rentPaymentTargets(entries, asOfDate, effectiveFrom);
  for (const entry of targets) entry.amountPence = paymentPence;
  recalculateRentBalances(entries, baseline);

  return targets.length;
}
