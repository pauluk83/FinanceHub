/**
 * FinanceHub core calculation engine (Phase 2).
 *
 * This is the single source of truth for every figure. It is pure: no I/O, no
 * clock reads, no floating point money. Inputs are integer pence; outputs are
 * integer pence. Ports (Windows/Tauri, iOS/JavaScriptCore) embed this module
 * unchanged, which is how "match to the penny" is preserved across platforms.
 *
 * Rules replicated from "Income and Expenses 2026.xlsx" are annotated with the
 * workbook address they came from.
 */

import { findInternalTransferRows } from './internalTransfers.ts';
import { accountClassifier } from './accounts.ts';
import { providerRowsKey, rowsForYear } from './providerYears.ts';
import { allRentEntries, rentLedgerThrough, rentPaymentPenceForMonth } from './rent.ts';
import { waterPaymentPenceForMonth } from './water.ts';
import { telcoBillPence } from './telco.ts';
import type { Asset } from './assets.ts';
import type { ImportRule } from './importRules.ts';
import type { ImportBatch, StatementCheck } from './reconciliation.ts';
import type { CsvProfile } from './csvMapping.ts';
import type { Expiry } from './billTimeline.ts';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface Tx {
  row: number;
  date: string;
  account: string;
  type: 'Income' | 'Expense' | string;
  amountPence: number;
  comments: string;
  status: string;
  budgetTreatment: '' | 'Transfer' | 'Refund' | string;
  /** Optional single category and free-form tags; never used in calculations. */
  category?: string;
  tags?: string[];
  /** False for Dan rows that were never paid from Starling. */
  starlingFunded?: boolean;
  /** False for archived rows that must stay in the log but not move this balance. */
  starlingPosted?: boolean;
  /**
   * Generated from a scheduled bill so it appears in the transaction log. The
   * bill engine already counts the bill, so every balance and total ignores it.
   */
  autoBill?: boolean;
  /** Stable bill+month identity for a generated row, so re-running never duplicates. */
  billKey?: string;
  /** Evidence only: the owner has ticked this row off against a statement. */
  cleared?: boolean;
  /** When the row was marked cleared; never used in a balance. */
  reconciledAt?: string;
  /** The CSV or bank-feed import that created this row, for one-click undo. */
  importBatchId?: string;
  /** Set on a merged duplicate: the row that now carries its amount. */
  mergedIntoRow?: number;
  /** The duplicate's amount before the merge, kept only for an exact undo. */
  mergedFromPence?: number;
  mergedAt?: string;
}

export interface Account {
  name: string; targetPence: number; openingPence: number; sortOrder: number; active: boolean;
  /** Leave this balance out of the net-worth total to avoid double counting. */
  excludeFromNetWorth?: boolean;
  /** Leave this balance out of the safe-to-spend cash figure. */
  excludeFromSafeToSpend?: boolean;
}
export interface Person { shortName: string; fullName: string; openingPence: number; sortOrder: number; active: boolean; trackOwed?: boolean; row?: number }
export interface Card { name: string; limitPence: number; openingPence: number; sortOrder: number; active: boolean }
export interface Bill {
  name: string; amountPence: number; dueDay: number; linkedSheet: string; frequency: string;
  latestBalancePence: number; latestPaymentPence: number; sortOrder: number; active: boolean;
  effectiveFrom: string; paymentMethod: string; baseAmountPence: number; baseDueDay: number;
  /** Set when the bill was created by a provider's recurring setup. */
  providerKey?: string;
  /** Bank account the bill is paid from; blank means the main account. */
  account?: string;
}
export interface BillChange {
  bill: string; appliesFrom: string; appliesTo: string;
  amountOverridePence: number | null; dueDateOverride: string; changeType: string; note: string;
  /** A recurring day for a dated range, used by a forward-year bill plan. */
  dueDayOverride?: number | null;
  /** True when the bill is removed from the scheduled run for this range. */
  skip?: boolean;
}
export interface BillSheet { name: string; providerKey?: string }
export interface SavedTransactionFilter {
  query?: string;
  account?: string;
  type?: string;
  month?: string;
  category?: string;
  tag?: string;
}
export interface EmailReminderSettings {
  enabled: boolean;
  email: string;
  bills: boolean;
  expiries: boolean;
  digestTime: string;
}
export interface MonthLock {
  lockedAt: string;
  note?: string;
  incomePence: number;
  expensesPence: number;
  netPence: number;
  owedPence: number;
  accounts: { name: string; balancePence: number }[];
  cards: { name: string; balancePence: number }[];
  people: { shortName: string; balancePence: number }[];
  bills?: { name: string; amountPence: number }[];
  /** Provider ledger closes and statement references captured at the same close. */
  providers?: import('./providerSnapshot.ts').ProviderBalanceSnapshot[];
  /** Savings, debts and assets recorded from this release onward for the net-worth trend. */
  savings?: { name: string; balancePence: number }[];
  debts?: { name: string; balancePence: number }[];
  assets?: { name: string; valuePence: number }[];
  /** Closing balances typed against statements when the month was closed. */
  statement?: StatementCheck[];
  /** The written reason recorded when a checked balance did not agree. */
  reconciledNote?: string;
}
export interface ScheduleRow { month: string; year2026: { date: string; amountPence: number }; year2027: { date: string; amountPence: number }; year2028: { date: string; amountPence: number } }

export interface Debt {
  id: string;
  name: string;
  creditor?: string;
  agreementType?: string;
  agreementRef?: string;
  balancePence: number;
  monthlyPaymentPence: number;
  dueDay?: number;
  interestRatePct?: number;
  startDate?: string;
  notes?: string;
  active?: boolean;
}

export interface SavingsAccount {
  id: string;
  name: string;
  provider?: string;
  type?: string;
  accountNumber?: string;
  sortCode?: string;
  balancePence: number;
  targetPence?: number;
  monthlyContributionPence?: number;
  contributionDay?: number;
  interestRatePct?: number;
  /** The date the target should be reached, used by the savings on-track check. */
  targetDate?: string;
  notes?: string;
  active?: boolean;
  /** Leave this balance out of the net-worth total to avoid double counting. */
  excludeFromNetWorth?: boolean;
}

export interface Dataset {
  settings: {
    targetYear: number; startMonth: number; currency: string; monthsInYear: number;
    asOfDate: string; lockCutoff: string; anchorDate: string; primaryAccount?: string; billSheets?: BillSheet[];
    /** Sidebar visibility and section overrides; Tools is always static. */
    navLayout?: { hidden?: string[]; groups?: Record<string, string> };
    /** Year-opening balances captured by a carry-over rollover. */
    yearOpenings?: Record<string, YearOpeningBalances>;
    /** Notification IDs the owner has already read. */
    notificationReads?: Record<string, string>;
    /** Notification IDs the owner has deleted; the same derived alert stays hidden. */
    notificationDismissed?: Record<string, string>;
    /** Saved transaction filter, stored as an interface preference only. */
    savedFilters?: Record<string, SavedTransactionFilter>;
    /** Opt-in email reminder preferences; delivery stays off until a server key exists. */
    emailReminders?: EmailReminderSettings;
  };
  accounts: Account[];
  people: Person[];
  cards: Card[];
  bills: Bill[];
  billChanges: BillChange[];
  incomeSchedules: { pip: ScheduleRow[]; uc: ScheduleRow[] };
  transactions: Tx[];
  providers: Record<string, any>;
  debts?: Debt[];
  savings?: SavingsAccount[];
  /** Manual property, vehicle, pension and investment valuations (R2). */
  assets?: Asset[];
  /** Review-only import rules (R3). */
  importRules?: ImportRule[];
  /** Import batches, newest last, so one import can be undone (R9). */
  importBatches?: ImportBatch[];
  /** Merchants the owner has dismissed from recurring suggestions (R4). */
  recurringDismissed?: string[];
  /** Saved CSV column mappings for other banks (R12). */
  csvProfiles?: CsvProfile[];
  /** Extra category names supplied by a template; they never carry money. */
  categories?: string[];
  /** Monthly report-only targets by category, in pence (R16). */
  categoryTargets?: Record<string, number>;
  /** Manually recorded insurance, MOT, tenancy and other expiry dates (R15). */
  expiries?: Expiry[];
  holidays?: Record<string, any[]>;
  guides?: { monthEnd: string[]; newYear: string[] };
  changelog?: any[];
  audit?: any[];
  meta?: any;
  reference?: any;
  monthLocks?: Record<string, MonthLock>;
}

/**
 * The balances a year starts from after a carry-over rollover. History stays
 * in the ledger; balances after the checkpoint are calculated from these
 * figures plus movements in the checkpoint year and later.
 */
export interface YearOpeningBalances {
  accounts: Record<string, number>;
  people: Record<string, number>;
  cards: Record<string, number>;
  /** Provider closes captured for the rollover audit; provider rows carry themselves. */
  providers?: Record<string, { openingPence: number; closingPence: number; rows?: number; source?: string }>;
  /** Bills keep their amounts and due dates; the snapshot is for the audit log. */
  bills?: Record<string, { amountPence: number; dueDay: number; active: boolean; latestBalancePence: number }>;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;
export const monthEnd = (year: number, month: number) => {
  const d = new Date(Date.UTC(year, month, 0));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const monthIndexOf = (iso: string) => Number(iso.slice(5, 7));
export const yearOf = (iso: string) => Number(iso.slice(0, 4));

/**
 * Legacy imports do not name a primary account. Pick the active account that
 * carries the most transaction rows so the engine still reads the real ledger.
 */
function mostActiveAccount(ds: Dataset): string | undefined {
  const counts = new Map<string, number>();
  for (const t of ds.transactions) counts.set(t.account, (counts.get(t.account) ?? 0) + 1);
  let best: { name: string; count: number } | undefined;
  for (const account of ds.accounts) {
    if (!account.active) continue;
    const count = counts.get(account.name) ?? 0;
    if (!best || count > best.count) best = { name: account.name, count };
  }
  return best?.name ?? ds.accounts.find((account) => account.active)?.name;
}

/** Cash rows: exclude internal transfers and the synthetic Previous Balance rows. */
const isCash = (t: Tx) => t.budgetTreatment !== 'Transfer' && t.budgetTreatment !== 'Bill' && t.autoBill !== true && t.comments !== 'Previous Balance';
const noHaircut = (t: Tx) => t.comments.toLowerCase() !== 'haircut';
const isCardTagged = (t: Tx) => /\(card\)/i.test(t.comments);

export interface EngineOptions {
  /**
   * Today's calendar date (YYYY-MM-DD). Bills are paid from midnight on their
   * due date, so a bill due today leaves the balance even before the bank
   * import that would otherwise move the As-Of date reaches it. Omitting it
   * keeps the historical As-Of behaviour (used by the parity fixtures).
   */
  today?: string;
}

export function buildEngine(ds: Dataset, options: EngineOptions = {}) {
  const years = [2026, 2027, 2028] as const;
  const calendarToday = /^\d{4}-\d{2}-\d{2}$/.test(options.today ?? '') ? options.today as string : '';
  /** Bills count as paid from midnight on their due date, even before the As-Of date catches up. */
  const paidThrough = calendarToday > ds.settings.asOfDate ? calendarToday : ds.settings.asOfDate;
  const providerKeyBySheet: Record<string, string> = {
    Rent: 'rent', Water: 'water', Ovo: 'ovo', 'Park Xmas': 'parkXmas',
    'Pure Cremation': 'pureCremation', 'Council Tax': 'councilTax', O2: 'o2', Virgin: 'virgin',
  };
  const providerKeyForSheet = (sheet: string) =>
    ds.settings.billSheets?.find((entry) => entry.name === sheet)?.providerKey ?? providerKeyBySheet[sheet];
  const accountNames = new Set(ds.accounts.map((a) => a.name));
  const personNames = new Set(ds.people.map((p) => p.shortName));
  const trackedPersonNames = new Set(ds.people.filter((p) => p.trackOwed !== false).map((p) => p.shortName));
  const starlingFundedNames = new Set(ds.people.filter((p) => p.trackOwed === false).map((p) => p.shortName));
  const cardNames = new Set(ds.cards.map((c) => c.name));
  const accountKind = accountClassifier(ds);
  /**
   * The account every cash figure is drawn from. New budgets name it in
   * Settings; imports that predate that setting fall back to the account with
   * the most activity, never to a hardcoded bank name.
   */
  const primaryAccount = ds.settings.primaryAccount || mostActiveAccount(ds) || 'Current account';
  const bankNames = new Set(ds.accounts.map((a) => a.name));
  /** Primary-account rows that mirror another own bank account: an internal movement. */
  const internalTransferRows = findInternalTransferRows(ds.transactions, bankNames, primaryAccount);

  /** Effective schedule amount for a target year (Settings K/L blocks resolve by year). */
  function scheduleAmount(row: ScheduleRow, year: number): { date: string; amountPence: number } {
    if (year === 2027) return row.year2027;
    if (year === 2028) return row.year2028;
    return row.year2026;
  }

  /**
   * Settings!C11 logic: month-start, back one month if as-of day < 3.
   * Kept as a pure helper so devices with different clocks still agree.
   */
  function lockCutoff(asOf: string): string {
    return lockCutoffFor(asOf);
  }

  /** Bills that exist in a given month (Monthly_Overview bill mask). */
  function billVisible(bill: Bill, mStart: string): boolean {
    if (!bill.name) return false;
    // Monthly_Overview!U19 special-cases the Virgin price switch: the old
    // £38.49 line runs up to (not including) the new line's Effective From
    // month, and the £47.01 line exists only in that one month.
    if (bill.name === 'Virgin old' || bill.name === 'Virgin sept') {
      const swap = ds.bills.find((b) => b.name === 'Virgin sept')?.effectiveFrom || '';
      if (swap) return bill.name === 'Virgin old' ? mStart < swap : mStart.slice(0, 7) === swap.slice(0, 7);
    }
    const eff = bill.effectiveFrom || '';
    if (bill.active) return !eff || mStart >= eff;
    // Workbook also shows an inactive bill before its Effective From (retired rows).
    return !!eff && mStart < eff;
  }

  function providerMonthlyPence(bill: Bill, year: number, month: number): number | null {
    const key = providerKeyForSheet(bill.linkedSheet);
    if (!key) return null;
    const p = ds.providers[key];
    if (!p) return null;
    const label = MONTHS[month - 1];
    // Later years live in their own imported block, so a 2027 bill reads the
    // 2027 prices instead of reusing the live 2026 rows.
    const resolved = rowsForYear(p, providerRowsKey(key), year);
    const yearRows = resolved?.rows ?? [];
    if (key === 'councilTax') {
      const hit = yearRows.find((e: any) => typeof e.date === 'string' && e.date.slice(0, 7) === `${year}-${pad(month)}`);
      return hit ? (hit.amountPence as number) : 0;
    }
    // The rent, water and telco month rules live in their core modules, so the
    // bills, the provider screens and any future port read the same figures.
    if (key === 'rent') return rentPaymentPenceForMonth(p as any, year, month);
    if (key === 'water') return waterPaymentPenceForMonth(p as any, year, month, yearRows as any[]);
    const row = yearRows.find((r: any) => r.month === label);
    if (!row) return null;
    // O2/Virgin bill from the charge column; the utility sheets expose the
    // monthly payment column as the bill amount (Settings!G50:G54).
    if (key === 'o2' || key === 'virgin') return telcoBillPence(row as any);
    const amount = row.paymentPence;
    return typeof amount === 'number' ? amount : null;
  }

  /** Base amount, then the latest applicable Bill Change override (XLOOKUP ...,-1). */
  function billAmount(bill: Bill, year: number, month: number): number {
    const mStart = monthStart(year, month);
    const provider = providerMonthlyPence(bill, year, month);
    let amount = provider !== null ? provider : (bill.baseAmountPence || bill.amountPence || 0);

    let chosen: BillChange | null = null;
    for (const ch of ds.billChanges) {
      if (ch.bill !== bill.name) continue;
      if (ch.amountOverridePence === null || ch.amountOverridePence === undefined) continue;
      if (!ch.appliesFrom || mStart < ch.appliesFrom) continue;
      if (ch.appliesTo && mStart > ch.appliesTo) continue;
      chosen = ch;
    }
    if (chosen) amount = chosen.amountOverridePence as number;
    return amount;
  }

  /** Due day for a month, honouring a one-off date override. */
  function billDueDate(bill: Bill, year: number, month: number): string {
    const mStart = monthStart(year, month);
    let chosenDate: BillChange | null = null;
    let chosenDay: BillChange | null = null;
    for (const ch of ds.billChanges) {
      if (ch.bill !== bill.name) continue;
      if (!ch.appliesFrom || mStart < ch.appliesFrom) continue;
      if (ch.appliesTo && mStart > ch.appliesTo) continue;
      if (ch.dueDateOverride) chosenDate = ch;
      if (typeof ch.dueDayOverride === 'number' && Number.isFinite(ch.dueDayOverride)) chosenDay = ch;
    }
    if (chosenDate?.dueDateOverride) return chosenDate.dueDateOverride;
    if (chosenDay) {
      const override = Math.min(Math.max(Math.round(chosenDay.dueDayOverride as number), 1), Number(monthEnd(year, month).slice(8, 10)));
      return `${year}-${pad(month)}-${pad(override)}`;
    }
    const day = Math.min(Math.max(bill.dueDay || 1, 1), Number(monthEnd(year, month).slice(8, 10)));
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  /** A later matching plan wins; only a skip change removes a bill for the range. */
  function billSkipped(bill: Bill, mStart: string): boolean {
    let chosen: BillChange | null = null;
    for (const ch of ds.billChanges) {
      if (ch.bill !== bill.name) continue;
      if (!ch.appliesFrom || mStart < ch.appliesFrom) continue;
      if (ch.appliesTo && mStart > ch.appliesTo) continue;
      if (ch.skip !== undefined) chosen = ch;
    }
    return chosen?.skip === true;
  }

  function scheduledBills(year: number, month: number) {
    const mStart = monthStart(year, month);
    return ds.bills
      .filter((b) => billVisible(b, mStart) && !billSkipped(b, mStart) && (b.dueDay > 0 || !!b.linkedSheet))
      .map((b) => {
        const dueDate = billDueDate(b, year, month);
        const account = b.account || primaryAccount;
        return {
          name: b.name,
          amountPence: billAmount(b, year, month),
          dueDate,
          paid: b.dueDay > 0 && dueDate <= paidThrough,
          /** True when the log already records this bill, so the balance counts it once. */
          paidFromLog: billPaymentLogged(b.name, account, dueDate),
          paymentMethod: b.paymentMethod,
          linkedSheet: b.linkedSheet,
          account,
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
  }

  function scheduledBillsTotal(year: number, month: number): number {
    return scheduledBills(year, month).reduce((s, b) => s + b.amountPence, 0);
  }

  /** Bill payments that can fill a linked provider's monthly Paid column. */
  function providerBillPayments(provider: string, year = ds.settings.targetYear) {
    const payments: Record<string, { bill: string; amountPence: number; dueDate: string }> = {};
    for (let month = 1; month <= 12; month++) {
      for (const bill of scheduledBills(year, month)) {
        if (!bill.paid || !bill.linkedSheet) continue;
        if (providerKeyForSheet(bill.linkedSheet) !== provider) continue;
        payments[MONTHS[month - 1]] = {
          bill: bill.name,
          amountPence: bill.amountPence,
          dueDate: bill.dueDate,
        };
      }
    }
    return payments;
  }

  /** Whole words only, so "Mum xmas prent" never matches a "Rent" bill. */
  const words = (value: unknown) => String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  /**
   * Real bill payments already recorded in the transaction log.
   *
   * A scheduled bill is deducted from the Starling balance on its due date. When
   * the owner also logs the actual debit from the bank ("O2 Bill", "Water"), the
   * two are the same money and deducting both counts it twice. A logged payment
   * is a real Expense on the bill's account whose description names the bill.
   * Generated bill rows (`autoBill`) never qualify: they mirror the scheduled
   * bill, so treating them as a payment would cancel it instead.
   */
  let loggedBillPaymentRowsCache: { account: string; date: string; phrase: string; amountPence: number }[] | null = null;
  function loggedBillPaymentRows() {
    if (loggedBillPaymentRowsCache) return loggedBillPaymentRowsCache;
    loggedBillPaymentRowsCache = ds.transactions
      .filter((t) => t.autoBill !== true && t.starlingPosted !== false && t.type === 'Expense')
      .filter((t) => !!t.account && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
      .map((t) => ({
        account: t.account,
        date: t.date,
        phrase: ` ${words(t.comments).join(' ')} `,
        amountPence: Math.abs(t.amountPence),
      }))
      .filter((row) => row.phrase.trim().length > 0);
    return loggedBillPaymentRowsCache;
  }

  /**
   * The due date a logged payment settles. A payment belongs to the bill in its
   * own month, unless it arrives within a week before next month's due date (a
   * direct debit taken early), in which case that is the bill it pays. One
   * payment therefore settles exactly one due date, and one scheduled bill can
   * never be cancelled twice.
   */
  function paymentDueDate(bill: Bill | undefined, date: string): string {
    if (!bill) return '';
    const year = yearOf(date);
    const month = monthIndexOf(date);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextDue = billDueDate(bill, nextYear, nextMonth);
    const at = Date.parse(`${date}T00:00:00Z`);
    const nextAt = Date.parse(`${nextDue}T00:00:00Z`);
    if (at >= nextAt - 7 * 86_400_000 && at < nextAt) return nextDue;
    return billDueDate(bill, year, month);
  }

  /**
   * Every due date already settled from the log, per bill account and name.
   *
   * A payment only settles a bill when the description names it in full as a run
   * of whole words ("O2 Bill" for O2, "Council Tax") and it covers at least four
   * fifths of that month's planned amount. The plan is a guess, so a bill paid
   * slightly under it (PureGym planned at £9.50, paid £8.50) still settles once;
   * a stray word in an unrelated purchase, or a token charge that happens to name
   * a large bill, stays well short and cannot silently cancel it.
   */
  const NO_DUE_DATES: ReadonlySet<string> = new Set<string>();
  const BILL_PAYMENT_COVERAGE = 0.8;
  let loggedBillDueDates: Map<string, Set<string>> | null = null;
  function loggedBillDueDatesFor(billName: string, account: string): ReadonlySet<string> {
    if (!loggedBillDueDates) {
      loggedBillDueDates = new Map<string, Set<string>>();
      for (const bill of ds.bills) {
        const nameWords = words(bill.name);
        if (nameWords.length === 0 || nameWords.some((word) => word.length < 2)) continue;
        const phrase = ` ${nameWords.join(' ')} `;
        const billAccount = bill.account || primaryAccount;
        const dueDates = new Set<string>();
        for (const row of loggedBillPaymentRows()) {
          if (row.account !== billAccount || !row.phrase.includes(phrase)) continue;
          const dueDate = paymentDueDate(bill, row.date);
          const amount = billAmount(bill, yearOf(dueDate), monthIndexOf(dueDate));
          if (amount <= 0) continue;
          if (row.amountPence < Math.ceil(amount * BILL_PAYMENT_COVERAGE)) continue;
          dueDates.add(dueDate);
        }
        loggedBillDueDates.set(`${billAccount}|${bill.name}`, dueDates);
      }
    }
    return loggedBillDueDates.get(`${account}|${billName}`) ?? NO_DUE_DATES;
  }

  /** True when the log already holds this bill's payment, so the plan must not deduct it again. */
  function billPaymentLogged(billName: string, account: string, dueDate: string): boolean {
    return loggedBillDueDatesFor(billName, account).has(dueDate);
  }

  /** Scheduled bills strictly after the Balance Anchor Date (Monthly_Overview!U19). */
  function scheduledBillsPostAnchor(year: number, month: number, anchor: string, cutoff: string): number {
    const from = anchor > `${year}-${pad(month)}-01` ? anchor : `${year}-${pad(month)}-01`;
    return scheduledBills(year, month)
      .filter((b) => b.dueDate > from && b.dueDate <= cutoff && !billPaymentLogged(b.name, b.account, b.dueDate))
      .reduce((s, b) => s + b.amountPence, 0);
  }

  function inMonth(t: Tx, year: number, month: number): boolean {
    return t.date >= monthStart(year, month) && t.date <= monthEnd(year, month);
  }

  function monthlyIncome(year: number, month: number, includeInternal = false) {
    const label = MONTHS[month - 1];
    const counted = (t: Tx) => includeInternal || !internalTransferRows.has(t.row);
    // PIP uses SUMIF over the schedule, so a duplicated month (Dec 2026 has two
    // payments) is additive; UC uses XLOOKUP, so it is single-valued.
    const pip = ds.incomeSchedules.pip
      .filter((r) => r.month === label)
      .reduce((s, r) => {
        const hit = scheduleAmount(r, year);
        return hit.date && yearOf(hit.date) === year ? s + hit.amountPence : s;
      }, 0);
    const ucRow = ds.incomeSchedules.uc.find((r) => r.month === label);
    const ucHit = ucRow ? scheduleAmount(ucRow, year) : { date: '', amountPence: 0 };
    const uc = ucHit.date && yearOf(ucHit.date) === year ? ucHit.amountPence : 0;

    const starlingIncome = ds.transactions
      .filter((t) => t.account === primaryAccount && t.type === 'Income' && inMonth(t, year, month) && t.budgetTreatment !== 'Transfer' && t.autoBill !== true && counted(t))
      .reduce((s, t) => s + t.amountPence, 0);

    const peopleIncome = ds.transactions
      .filter((t) => accountKind(t.account) === 'person' && t.type === 'Income' && inMonth(t, year, month) && noHaircut(t) && t.budgetTreatment !== 'Transfer' && t.autoBill !== true && counted(t))
      .reduce((s, t) => s + t.amountPence, 0);

    return { total: pip + uc + starlingIncome + peopleIncome, pip, uc, starlingIncome, peopleIncome };
  }

  function monthlyExpenses(year: number, month: number, includeInternal = false) {
    const bills = scheduledBillsTotal(year, month);
    const counted = (t: Tx) => includeInternal || !internalTransferRows.has(t.row);

    const people = ds.transactions
      .filter((t) => accountKind(t.account) === 'person' && t.type === 'Expense' && inMonth(t, year, month) && noHaircut(t) && t.budgetTreatment !== 'Transfer' && t.autoBill !== true && counted(t))
      .reduce((s, t) => s + t.amountPence, 0);

    const starling = ds.transactions
      .filter((t) => t.account === primaryAccount && t.type === 'Expense' && inMonth(t, year, month) && isCash(t) && noHaircut(t) && counted(t))
      .reduce((s, t) => s + t.amountPence, 0);

    const pseudo = ds.transactions
      .filter((t) => accountKind(t.account) === 'pseudo' && t.type === 'Expense' && inMonth(t, year, month) && t.budgetTreatment !== 'Transfer' && t.autoBill !== true && counted(t))
      .reduce((s, t) => s + t.amountPence, 0);

    const cardSpend = ds.transactions
      .filter((t) => accountKind(t.account) === 'card' && t.type === 'Expense' && inMonth(t, year, month) && t.budgetTreatment !== 'Transfer' && t.autoBill !== true && counted(t))
      .reduce((s, t) => s + t.amountPence, 0);

    const cardRefunds = ds.transactions
      .filter((t) => accountKind(t.account) === 'card' && t.type === 'Income' && inMonth(t, year, month) && t.budgetTreatment === 'Refund')
      .reduce((s, t) => s + t.amountPence, 0);

    return { total: bills + people + starling + pseudo + cardSpend - cardRefunds, bills, people, starling, pseudo, cardSpend, cardRefunds };
  }

  /**
   * A locked month is a historical fact, not a derived value. The workbook
   * freezes Jan-Oct 2026 (`✓ Balanced` + before Lock Cutoff); those totals are
   * imported verbatim so later edits or bill-table changes cannot rewrite them.
   */
  function lockedSnapshot(year: number, month: number) {
    const ref = ds.reference;
    if (!ref?.months || year !== ds.settings.targetYear) return null;
    const snap = ref.months.find((m: any) => m.month === month);
    if (!snap || snap.balanced !== '✓ Balanced') return null;
    if (monthStart(year, month) >= ds.settings.lockCutoff) return null;
    return snap;
  }

  function monthlySummary(year: number, month: number) {
    const manualLock = ds.monthLocks?.[`${year}-${pad(month)}`];
    if (manualLock) {
      return {
        year, month, label: MONTHS[month - 1],
        incomePence: manualLock.incomePence,
        expensesPence: manualLock.expensesPence,
        netPence: manualLock.netPence,
        percentIncomeSpent: manualLock.incomePence === 0 ? 0 : manualLock.expensesPence / manualLock.incomePence,
        owedPence: manualLock.owedPence,
        locked: true,
        source: 'manual-lock' as const,
        breakdown: { income: null, expenses: null, bills: [] },
      };
    }
    const snap = lockedSnapshot(year, month);
    if (snap) {
      // The frozen totals counted movements between the user's own accounts as
      // income and spending. Remove only that portion; every other frozen figure
      // is left exactly as the workbook recorded it.
      const internalIncome = monthlyIncome(year, month, true).total - monthlyIncome(year, month).total;
      const internalExpenses = monthlyExpenses(year, month, true).total - monthlyExpenses(year, month).total;
      const incomePence = snap.incomePence - internalIncome;
      const expensesPence = snap.expensesPence - internalExpenses;
      return {
        year, month, label: MONTHS[month - 1],
        incomePence,
        expensesPence,
        netPence: incomePence - expensesPence,
        percentIncomeSpent: incomePence === 0 ? 0 : expensesPence / incomePence,
        owedPence: snap.owedPence,
        locked: true,
        source: 'workbook-locked-snapshot' as const,
        breakdown: { income: null, expenses: null, bills: [] },
      };
    }
    const inc = monthlyIncome(year, month);
    const exp = monthlyExpenses(year, month);
    return {
      year, month, label: MONTHS[month - 1],
      incomePence: inc.total,
      expensesPence: exp.total,
      netPence: inc.total - exp.total,
      percentIncomeSpent: inc.total === 0 ? 0 : exp.total / inc.total,
      owedPence: owedAt(monthEnd(year, month)),
      locked: false,
      source: 'engine' as const,
      breakdown: { income: inc, expenses: exp, bills: scheduledBills(year, month) },
    };
  }

  /**
   * Owed = opening + lent - repaid, cumulative through a date (Dashboard E24).
   * Note: E24 does NOT exclude haircut rows, unlike the monthly income block.
   */
  /** Latest carry-over checkpoint at or before a date. */
  function openingContext(through: string) {
    let chosen: { year: number; start: string; data: YearOpeningBalances } | null = null;
    for (const [key, data] of Object.entries(ds.settings.yearOpenings ?? {})) {
      const year = Number(key);
      if (!Number.isInteger(year) || year > yearOf(through)) continue;
      if (!chosen || year > chosen.year) chosen = { year, start: `${year}-01-01`, data };
    }
    return chosen;
  }

  function owedAt(through: string): number {
    const checkpoint = openingContext(through);
    const opening = ds.people
      .filter((p) => p.trackOwed !== false)
      .reduce((s, p) => s + (checkpoint && typeof checkpoint.data.people[p.shortName] === 'number'
        ? checkpoint.data.people[p.shortName]
        : p.openingPence), 0);
    const from = checkpoint?.start ?? '';
    const lent = ds.transactions
      .filter((t) => trackedPersonNames.has(t.account) && t.type === 'Expense' && t.date <= through && (!from || t.date >= from))
      .reduce((s, t) => s + t.amountPence, 0);
    const repaid = ds.transactions
      .filter((t) => trackedPersonNames.has(t.account) && t.type === 'Income' && t.date <= through && (!from || t.date >= from))
      .reduce((s, t) => s + t.amountPence, 0);
    return opening + lent - repaid;
  }

  function owedByPerson(through: string) {
    const checkpoint = openingContext(through);
    return ds.people.map((p) => {
      const from = checkpoint?.start ?? '';
      const lent = ds.transactions
        .filter((t) => t.account === p.shortName && t.type === 'Expense' && t.date <= through && (!from || t.date >= from))
        .reduce((s, t) => s + t.amountPence, 0);
      const repaid = ds.transactions
        .filter((t) => t.account === p.shortName && t.type === 'Income' && t.date <= through && (!from || t.date >= from))
        .reduce((s, t) => s + t.amountPence, 0);
      const opening = checkpoint && typeof checkpoint.data.people[p.shortName] === 'number'
        ? checkpoint.data.people[p.shortName]
        : p.openingPence;
      return { ...p, balancePence: p.trackOwed === false ? 0 : opening + lent - repaid };
    });
  }

  /** Card balance = opening + charges - refunds/payments (Monthly_Overview N33:N36). */
  function cardBalances(through: string) {
    const checkpoint = openingContext(through);
    return ds.cards.map((c) => {
      const from = checkpoint?.start ?? '';
      const charges = ds.transactions
        .filter((t) => t.account === c.name && t.type === 'Expense' && t.date <= through && (!from || t.date >= from))
        .reduce((s, t) => s + t.amountPence, 0);
      const credits = ds.transactions
        .filter((t) => t.account === c.name && t.type === 'Income' && t.date <= through && (!from || t.date >= from))
        .reduce((s, t) => s + t.amountPence, 0);
      const opening = checkpoint && typeof checkpoint.data.cards[c.name] === 'number'
        ? checkpoint.data.cards[c.name]
        : c.openingPence;
      const balance = opening + charges - credits;
      return { ...c, balancePence: balance, availablePence: c.limitPence - balance, utilisation: c.limitPence === 0 ? 0 : balance / c.limitPence };
    });
  }

  /** Scheduled PIP/UC income dated after the anchor, across every month in range (N12 schedin). */
  function scheduledIncomePostAnchor(anchor: string, through: string): number {
    let total = 0;
    for (let year = yearOf(anchor); year <= yearOf(through); year++) {
      for (let month = 1; month <= 12; month++) {
        if (monthStart(year, month) > through) continue;
        const label = MONTHS[month - 1];
        for (const r of ds.incomeSchedules.pip.concat(ds.incomeSchedules.uc)) {
          if (r.month !== label) continue;
          const hit = scheduleAmount(r, year);
          if (hit.date && hit.date > anchor && hit.date <= through) total += hit.amountPence;
        }
      }
    }
    return total;
  }

  /** Scheduled bills dated after the anchor, across every month in range (N12 billsout / U19). */
  function scheduledBillsPostAnchorRange(anchor: string, through: string): number {
    let total = 0;
    for (let year = yearOf(anchor); year <= yearOf(through); year++) {
      for (let month = 1; month <= 12; month++) {
        if (monthStart(year, month) > through) continue;
        total += scheduledBills(year, month)
          .filter((b) => b.dueDate > anchor && b.dueDate <= through && !billPaymentLogged(b.name, b.account, b.dueDate))
          .reduce((s, b) => s + b.amountPence, 0);
      }
    }
    return total;
  }

  /**
   * Dated movements that make up the Starling balance, built from the same legs
   * as starlingBreakdown: posted bank rows, Petrol/Other cash, people cash,
   * Backup Space, post-anchor scheduled income and post-anchor bills. The
   * primary-account statement uses this so it closes on the Dashboard figure
   * instead of the raw bank ledger (P0-7).
   */
  function starlingMovements() {
    const anchor = ds.settings.anchorDate;
    const asOf = ds.settings.asOfDate;
    const movements: { date: string; deltaPence: number; comments: string; type: 'Income' | 'Expense'; row: number }[] = [];
    let syntheticRow = 0;
    const push = (date: string, deltaPence: number, comments: string, type: 'Income' | 'Expense', row: number, through = asOf) => {
      if (!date || deltaPence === 0 || date > through) return;
      movements.push({ date, deltaPence, comments, type, row });
    };
    const billThrough = paidThrough;
    if (!anchor) return movements;

    for (const t of ds.transactions) {
      if (t.autoBill === true) continue;
      const label = t.comments || `${t.type} on ${t.account}`;
      if (t.account === primaryAccount && t.starlingPosted !== false) {
        push(t.date, t.type === 'Income' ? t.amountPence : -t.amountPence, label, t.type === 'Income' ? 'Income' : 'Expense', t.row);
      } else if ((t.account === 'Petrol' || t.account === 'Other') && t.type === 'Expense') {
        push(t.date, -t.amountPence, label, 'Expense', t.row);
      } else if (starlingFundedNames.has(t.account) && t.starlingFunded !== false && !isCardTagged(t) && noHaircut(t)) {
        push(t.date, t.type === 'Income' ? t.amountPence : -t.amountPence, label, t.type === 'Income' ? 'Income' : 'Expense', t.row);
      } else if (personNames.has(t.account) && !starlingFundedNames.has(t.account) && t.date > anchor && !isCardTagged(t) && noHaircut(t)) {
        push(t.date, t.type === 'Income' ? t.amountPence : -t.amountPence, label, t.type === 'Income' ? 'Income' : 'Expense', t.row);
      } else if (t.account === 'Backup Space' && t.date > anchor) {
        push(t.date, t.type === 'Expense' ? t.amountPence : -t.amountPence, label, t.type === 'Income' ? 'Income' : 'Expense', t.row);
      }
    }

    for (const [kind, schedule] of [['PIP', ds.incomeSchedules.pip], ['UC', ds.incomeSchedules.uc]] as const) {
      for (let year = yearOf(anchor); year <= yearOf(asOf); year++) {
        for (let month = 1; month <= 12; month++) {
          if (monthStart(year, month) > asOf) continue;
          const label = MONTHS[month - 1];
          for (const row of schedule) {
            if (row.month !== label) continue;
            const hit = scheduleAmount(row, year);
            if (hit.date && hit.date > anchor) push(hit.date, hit.amountPence, `${kind} payment`, 'Income', --syntheticRow);
          }
        }
      }
    }

    for (let year = yearOf(anchor); year <= yearOf(billThrough); year++) {
      for (let month = 1; month <= 12; month++) {
        if (monthStart(year, month) > billThrough) continue;
        for (const bill of scheduledBills(year, month)) {
          if (bill.dueDate <= anchor) continue;
          if (billPaymentLogged(bill.name, bill.account, bill.dueDate)) continue;
          push(bill.dueDate, -bill.amountPence, `Scheduled bill: ${bill.name}`, 'Expense', --syntheticRow, billThrough);
        }
      }
    }

    return movements.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);
  }

  /**
   * Starling statement on the same anchor-aware legs as starlingBalance, so the
   * closing balance matches the Dashboard instead of the raw bank ledger (P0-7).
   */
  function primaryStatement(year: number | null, month: number | null) {
    const periodStart = year === null ? null : `${year}-${pad(month ?? 1)}-01`;
    const checkpoint = periodStart ? openingContext(periodStart) : null;
    const baseOpeningPence = checkpoint && typeof checkpoint.data.accounts[primaryAccount] === 'number'
      ? checkpoint.data.accounts[primaryAccount]
      : ds.accounts.find((a) => a.name === primaryAccount)?.openingPence ?? 0;
    const from = checkpoint?.start ?? '';
    const movements = starlingMovements().filter((m) => !from || m.date >= from);
    const openingPence = periodStart
      ? baseOpeningPence + movements.filter((m) => m.date < periodStart).reduce((sum, m) => sum + m.deltaPence, 0)
      : baseOpeningPence;
    const inside = movements.filter((m) =>
      (year === null || yearOf(m.date) === year) && (month === null || monthIndexOf(m.date) === month));
    let running = openingPence;
    const lines = inside.map((m) => {
      running += m.deltaPence;
      return {
        row: m.row,
        date: m.date,
        account: primaryAccount,
        type: m.type,
        amountPence: Math.abs(m.deltaPence),
        comments: m.comments,
        status: m.row < 0 ? 'Scheduled' : '',
        budgetTreatment: '',
        deltaPence: m.deltaPence,
        runningPence: running,
      };
    });
    return {
      account: primaryAccount, year, month, openingPence, lines,
      totalRepaidPence: lines.filter((l) => l.type === 'Income').reduce((s, l) => s + l.amountPence, 0),
      totalLentPence: lines.filter((l) => l.type === 'Expense').reduce((s, l) => s + l.amountPence, 0),
      closingPence: running,
    };
  }

  /**
   * Starling balance (Monthly_Overview!N12), anchor-aware:
   * opening + posted cash to cutoff + post-anchor people cash (non-card)
   * + Backup Space net + post-anchor scheduled income - post-anchor scheduled bills.
   * Every leg is summed across the whole anchor-to-cutoff range, not just one month.
   */
  function starlingBreakdown(through: string) {
    const anchor = ds.settings.anchorDate;
    const checkpoint = openingContext(through);
    const checkpointBase = checkpoint && typeof checkpoint.data.accounts[primaryAccount] === 'number'
      ? checkpoint.data.accounts[primaryAccount]
      : null;
    const from = checkpointBase !== null ? checkpoint.start : '';
    const opening = checkpointBase ?? ds.accounts.find((a) => a.name === primaryAccount)?.openingPence ?? 0;

    const inWindow = (t: Tx) => t.date <= through && (!from || t.date >= from);
    const sum = (pred: (t: Tx) => boolean) => ds.transactions.filter((t) => inWindow(t) && pred(t)).reduce((s, t) => s + t.amountPence, 0);

    const posted = opening
      + sum((t) => t.account === primaryAccount && t.type === 'Income' && t.starlingPosted !== false && t.autoBill !== true)
      - sum((t) => t.account === primaryAccount && t.type === 'Expense' && t.starlingPosted !== false && t.autoBill !== true)
      - sum((t) => t.account === 'Petrol' && t.type === 'Expense')
      - sum((t) => t.account === 'Other' && t.type === 'Expense');

    const peopleCash = ds.transactions
      .filter((t) => personNames.has(t.account) && !starlingFundedNames.has(t.account) && (from ? t.date >= from : t.date > anchor) && t.date <= through && noHaircut(t) && !isCardTagged(t))
      .reduce((s, t) => s + (t.type === 'Income' ? t.amountPence : -t.amountPence), 0);

    // Dan-style people are tracked for visibility but are not receivables. Their
    // full ledger reduces Starling even before the anchor, as requested.
    const starlingFundedCash = ds.transactions
      .filter((t) => starlingFundedNames.has(t.account) && t.starlingFunded !== false && inWindow(t) && noHaircut(t) && !isCardTagged(t))
      .reduce((s, t) => s + (t.type === 'Income' ? t.amountPence : -t.amountPence), 0);

    const inAnchorWindow = (t: Tx) => (from ? t.date >= from : t.date > anchor) && t.date <= through;
    const backupSpace = ds.transactions
      .filter((t) => t.account === 'Backup Space' && t.type === 'Expense' && inAnchorWindow(t))
      .reduce((s, t) => s + t.amountPence, 0)
      - ds.transactions
        .filter((t) => t.account === 'Backup Space' && t.type === 'Income' && inAnchorWindow(t))
        .reduce((s, t) => s + t.amountPence, 0);

    const scheduleFrom = checkpoint ? `${checkpoint.year - 1}-12-31` : anchor;
    const scheduledIncome = scheduledIncomePostAnchor(scheduleFrom, through);
    const billsOut = scheduledBillsPostAnchorRange(scheduleFrom, through);
    const adjustmentPence = peopleCash + starlingFundedCash + backupSpace + scheduledIncome - billsOut;
    return { posted, peopleCash, starlingFundedCash, backupSpace, scheduledIncome, billsOut, adjustmentPence, balancePence: posted + adjustmentPence };
  }

  function starlingBalance(through: string): number {
    return starlingBreakdown(through).balancePence;
  }

  function accountBalances(through: string) {
    const checkpoint = openingContext(through);
    const from = checkpoint?.start ?? '';
    return ds.accounts.map((a) => {
      if (a.name === primaryAccount) return { ...a, balancePence: starlingBalance(through) };
      const carried = checkpoint && typeof checkpoint.data.accounts[a.name] === 'number' ? checkpoint.data.accounts[a.name] : null;
      const income = ds.transactions.filter((t) => t.account === a.name && t.type === 'Income' && t.autoBill !== true && t.date <= through && (!from || t.date >= from)).reduce((s, t) => s + t.amountPence, 0);
      const expense = ds.transactions.filter((t) => t.account === a.name && t.type === 'Expense' && t.autoBill !== true && t.date <= through && (!from || t.date >= from)).reduce((s, t) => s + t.amountPence, 0);
      return { ...a, balancePence: (carried ?? a.openingPence) + income - expense };
    });
  }

  /**
   * Monthly account flow (Monthly_Overview!M11:M16). Starling's row also carries
   * people cash (non-card), Petrol/Other cash and Backup Space, because those
   * move through the Starling balance without being Starling rows.
   */
  function accountFlow(account: string, year: number, month: number): number {
    const start = monthStart(year, month), end = monthEnd(year, month);
    const rows = ds.transactions.filter((t) => t.autoBill !== true && t.date >= start && t.date <= end);
    if (account !== primaryAccount) {
      const income = rows.filter((t) => t.account === account && t.type === 'Income').reduce((s, t) => s + t.amountPence, 0);
      const expense = rows.filter((t) => t.account === account && t.type === 'Expense').reduce((s, t) => s + t.amountPence, 0);
      return income - expense;
    }
    const sum = (pred: (t: Tx) => boolean) => rows.filter(pred).reduce((s, t) => s + t.amountPence, 0);
    return sum((t) => t.account === primaryAccount && t.type === 'Income')
      + sum((t) => personNames.has(t.account) && t.type === 'Income' && noHaircut(t))
      + sum((t) => t.account === 'Backup Space' && t.type === 'Expense')
      - sum((t) => t.account === primaryAccount && t.type === 'Expense' && noHaircut(t) && t.comments !== 'Previous Balance')
      - sum((t) => (t.account === 'Petrol' || t.account === 'Other') && t.type === 'Expense')
      - sum((t) => personNames.has(t.account) && t.type === 'Expense' && noHaircut(t) && !isCardTagged(t))
      - sum((t) => t.account === 'Backup Space' && t.type === 'Income');
  }

  function yearToDate(year: number, throughMonth: number) {
    let income = 0, expenses = 0;
    for (let m = 1; m <= throughMonth; m++) {
      const s = monthlySummary(year, m);
      income += s.incomePence;
      expenses += s.expensesPence;
    }
    return { incomePence: income, expensesPence: expenses, netPence: income - expenses, savingsRate: income === 0 ? 0 : (income - expenses) / income };
  }

  /**
   * Per-account statement with running balance as of a month/year filter.
   * Sign convention follows the entity: people/cards increase on Expense and
   * decrease on Income; bank accounts are the reverse. Opening balance is included.
   */
  function statement(account: string, year: number | null, month: number | null) {
    if (account === primaryAccount) return primaryStatement(year, month);
    const rows = ds.transactions
      .filter((t) => t.account === account)
      .filter((t) => (year === null || yearOf(t.date) === year))
      .filter((t) => (month === null || monthIndexOf(t.date) === month))
      .sort((a, b) => a.date.localeCompare(b.date));
    const isBank = accountNames.has(account);
    const periodStart = year === null ? null : `${year}-${pad(month ?? 1)}-01`;
    const checkpoint = periodStart ? openingContext(periodStart) : null;
    const carried = checkpoint
      ? (isBank ? checkpoint.data.accounts[account] : personNames.has(account) ? checkpoint.data.people[account] : cardNames.has(account) ? checkpoint.data.cards[account] : undefined)
      : undefined;
    const baseOpeningPence = typeof carried === 'number'
      ? carried
      : isBank
        ? ds.accounts.find((a) => a.name === account)?.openingPence ?? 0
        : personNames.has(account)
          ? ds.people.find((p) => p.shortName === account)?.openingPence ?? 0
          : cardNames.has(account)
            ? ds.cards.find((c) => c.name === account)?.openingPence ?? 0
            : 0;
    const deltaFor = (t: Tx) => isBank
      ? (t.type === 'Income' ? t.amountPence : -t.amountPence)
      : (t.type === 'Expense' ? t.amountPence : -t.amountPence);
    const openingPence = periodStart
      ? baseOpeningPence + ds.transactions
        .filter((t) => t.account === account && t.date < periodStart && (!checkpoint || t.date >= checkpoint.start))
        .reduce((sum, t) => sum + deltaFor(t), 0)
      : baseOpeningPence;
    let running = openingPence;
    const lines = rows.map((t) => {
      const delta = deltaFor(t);
      running += delta;
      return { ...t, deltaPence: delta, runningPence: running };
    });
    return {
      account, year, month, openingPence,
      lines,
      totalRepaidPence: rows.filter((t) => t.type === 'Income').reduce((s, t) => s + t.amountPence, 0),
      totalLentPence: rows.filter((t) => t.type === 'Expense').reduce((s, t) => s + t.amountPence, 0),
      closingPence: running,
    };
  }

  /**
   * Rent ledger: weekly charge every Monday, £500 on the 27th, running balance
   * computed by SUMIFS-style aggregation as of a date (not row order).
   */
  function rentLedger(through: string) {
    return rentLedgerThrough(ds.providers.rent ?? {}, through);
  }

  /**
   * Trips with their countdown. A trip is upcoming before its start date and
   * ongoing from its start through its end date, so a holiday that is happening
   * now is not shown as one that has already passed.
   */
  function holidays(nowIso: string) {
    const all = Object.values(ds.holidays ?? {}) as any[];
    const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    return all.flat().map((h) => {
      const start = h.start as string;
      const days = Math.ceil((day(start) - day(nowIso)) / 86400000);
      const end = typeof h.end === 'string' && h.end >= start ? h.end : start;
      const ongoing = !!start && start <= nowIso && nowIso <= end;
      return { ...h, daysToGo: days, ongoing, upcoming: !!start && start > nowIso };
    }).sort((a, b) => {
      if (a.ongoing !== b.ongoing) return a.ongoing ? -1 : 1;
      if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
      return a.start.localeCompare(b.start);
    });
  }

  /**
   * Balances stop at the As-Of date in the current month, not at a future month-end.
   * In the live month the cutoff is never earlier than today, so a bill due today
   * leaves the balance from midnight even before the next bank import.
   */
  function throughFor(year: number, month: number): string {
    const end = monthEnd(year, month);
    if (year !== ds.settings.targetYear) return end;
    if (!calendarToday) return end >= ds.settings.asOfDate ? ds.settings.asOfDate : end;
    if (`${calendarToday.slice(0, 7)}-01` > end) return end;
    return calendarToday > ds.settings.asOfDate ? calendarToday : ds.settings.asOfDate;
  }

  function dashboard(year: number, month: number) {
    const asOf = throughFor(year, month);
    const current = monthlySummary(year, month);
    const ytd = yearToDate(year, month);
    const cards = cardBalances(asOf);
    const accounts = accountBalances(asOf);
    const cardBalance = cards.reduce((s, c) => s + c.balancePence, 0);
    const cardLimit = cards.reduce((s, c) => s + c.limitPence, 0);
    return {
      year, month, asOf,
      current,
      ytd,
      totalOwedPence: owedAt(asOf),
      owedByPerson: owedByPerson(asOf),
      accounts,
      totalAccountBalancePence: accounts.reduce((s, a) => s + a.balancePence, 0),
      cards,
      cardBalancePence: cardBalance,
      cardLimitPence: cardLimit,
      cardUtilisation: cardLimit === 0 ? 0 : cardBalance / cardLimit,
      bills: scheduledBills(year, month),
      billsTotalPence: scheduledBillsTotal(year, month),
    };
  }

  return {
    lockCutoff, billVisible, billAmount, billDueDate, scheduledBills, scheduledBillsTotal, providerBillPayments,
    scheduledBillsPostAnchor, monthlyIncome, monthlyExpenses, monthlySummary, owedAt, owedByPerson,
    cardBalances, starlingBalance, starlingBreakdown, accountBalances, accountFlow, yearToDate, statement, rentLedger, holidays, dashboard, throughFor,
  };
}

/** The lock cutoff that belongs to an As-Of date: its month start, or the previous month before the 3rd. */
export function lockCutoffFor(asOf: string): string {
  const day = Number(asOf.slice(8, 10));
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  if (day < 3) {
    const previousYear = month === 1 ? year - 1 : year;
    const previousMonth = month === 1 ? 12 : month - 1;
    return `${previousYear}-${String(previousMonth).padStart(2, '0')}-01`;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** The latest real transaction date on or before today, or an empty string. */
export function latestTransactionDate(ds: Dataset, today: string): string {
  const through = today.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through)) return '';
  let latest = '';
  for (const transaction of ds.transactions) {
    if (transaction.autoBill === true) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) continue;
    if (transaction.date > through) continue;
    if (transaction.date > latest) latest = transaction.date;
  }
  return latest;
}

/**
 * Make the As-Of cutoff cover the latest real transaction, without ever moving
 * it past today. Planned rows and generated bill-log rows do not advance it.
 * Returns true when the cutoff changed.
 */
export function advanceAsOfToLatestTransaction(ds: Dataset, today: string): boolean {
  const latest = latestTransactionDate(ds, today);
  if (!latest || latest <= ds.settings.asOfDate) return false;
  ds.settings.asOfDate = latest;
  ds.settings.lockCutoff = lockCutoffFor(latest);
  return true;
}

export type Engine = ReturnType<typeof buildEngine>;
