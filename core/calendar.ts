/**
 * Bill calendar, safe-to-spend and calendar export.
 *
 * Every money figure comes from the engine: the calendar's bills are the same
 * `scheduledBills` rows the Dashboard uses, so the totals cannot drift.
 */
import type { Dataset, Engine } from './engine.ts';
import { plannedPayments } from './incomePlan.ts';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const monthEndIso = (date: string) => {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return iso(year, month, daysInMonth(year, month));
};

export interface CalendarBillEvent {
  name: string;
  amountPence: number;
  dueDate: string;
  paid: boolean;
  account: string;
}

export interface CalendarDay {
  date: string;
  day: number;
  locked: boolean;
  bills: CalendarBillEvent[];
  income: { kind: string; amountPence: number }[];
  debts: { name: string; amountPence: number }[];
  savings: { name: string; amountPence: number }[];
  holidays: { name: string; start: string; end: string }[];
}

interface ScheduleHit {
  date: string;
  amountPence: number;
  kind: string;
}

function incomeDates(ds: Dataset, from: string, to: string, kinds?: string[]): ScheduleHit[] {
  const schemes: { kind: string; scheme: 'pip' | 'uc' }[] = [
    { kind: 'PIP', scheme: 'pip' },
    { kind: 'Universal Credit', scheme: 'uc' },
  ];
  const hits: ScheduleHit[] = [];
  for (const { kind, scheme } of schemes) {
    if (kinds && !kinds.includes(kind)) continue;
    for (const hit of plannedPayments(ds, scheme, from, to)) {
      hits.push({ date: hit.date, amountPence: hit.amountPence, kind });
    }
  }
  return hits.sort((left, right) => left.date.localeCompare(right.date));
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(Number(day) || 1, 1), daysInMonth(year, month));
}

/** A holiday trip covers its start through its end date, inclusive. */
function tripCovers(trip: { start?: string; end?: string }, date: string): boolean {
  const start = String(trip.start ?? '');
  if (!start) return false;
  const end = typeof trip.end === 'string' && trip.end >= start ? trip.end : start;
  return start <= date && date <= end;
}

export function monthCalendar(ds: Dataset, engine: Engine, year: number, month: number, today = ds.settings.asOfDate): CalendarDay[] {
  const bills = engine.scheduledBills(year, month);
  const income = incomeDates(ds, iso(year, month, 1), iso(year, month, daysInMonth(year, month)));
  const debts = (ds.debts ?? []).filter((debt) => debt.active !== false && debt.dueDay);
  const savings = (ds.savings ?? []).filter((account) => account.active !== false && Number(account.monthlyContributionPence) > 0);
  const holidays = engine.holidays(today);
  const locked = Boolean(ds.monthLocks?.[`${year}-${pad(month)}`]);

  const days: CalendarDay[] = [];
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    const date = iso(year, month, day);
    days.push({
      date,
      day,
      locked,
      bills: bills.filter((bill) => bill.dueDate === date).map((bill) => ({
        name: bill.name,
        amountPence: bill.amountPence,
        dueDate: bill.dueDate,
        paid: bill.paid,
        account: bill.account,
      })),
      income: income.filter((hit) => hit.date === date).map((hit) => ({ kind: hit.kind, amountPence: hit.amountPence })),
      debts: debts
        .filter((debt) => clampDay(year, month, debt.dueDay as number) === day)
        .map((debt) => ({ name: debt.name, amountPence: Number(debt.monthlyPaymentPence) || 0 })),
      savings: savings
        .filter((account) => clampDay(year, month, Number(account.contributionDay) || 1) === day)
        .map((account) => ({ name: account.name, amountPence: Number(account.monthlyContributionPence) || 0 })),
      holidays: holidays
        .filter((trip) => tripCovers(trip, date))
        .map((trip) => ({ name: String(trip.name ?? 'Holiday'), start: String(trip.start ?? date), end: String(trip.end ?? trip.start ?? date) })),
    });
  }
  return days;
}

export interface SafeToSpend {
  asOf: string;
  cashPence: number;
  billsPence: number;
  savingsPence: number;
  availablePence: number;
  nextIncomeDate: string;
  nextIncomeKind: string | null;
  horizonDate: string;
  horizonLabel: string;
  cashRows: { name: string; balancePence: number }[];
  billRows: { name: string; dueDate: string; amountPence: number }[];
  savingsRows: { name: string; dueDate: string; amountPence: number }[];
}

/**
 * Cleared cash (every active current account) minus bills due before the next
 * scheduled income minus savings contributions in the same window. If no income
 * is scheduled, the window runs to the end of the month.
 */
export function safeToSpend(ds: Dataset, engine: Engine, today = ds.settings.asOfDate): SafeToSpend {
  const cashRows = engine.accountBalances(today)
    .filter((account) => account.active !== false && account.excludeFromSafeToSpend !== true)
    .map((account) => ({ name: account.name, balancePence: account.balancePence }));
  const cashPence = cashRows.reduce((sum, account) => sum + account.balancePence, 0);

  const lookahead = addDays(today, 400);
  const nextIncome = incomeDates(ds, addDays(today, 1), lookahead)[0];
  const horizonDate = nextIncome?.date ?? monthEndIso(today);
  const horizonLabel = nextIncome ? `${nextIncome.kind} on ${horizonDate}` : `month end (${horizonDate})`;

  const billRows: { name: string; dueDate: string; amountPence: number }[] = [];
  const startYear = Number(today.slice(0, 4));
  const startMonth = Number(today.slice(5, 7));
  const endYear = Number(horizonDate.slice(0, 4));
  const endMonth = Number(horizonDate.slice(5, 7));
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      if (year === startYear && month < startMonth) continue;
      if (year === endYear && month > endMonth) continue;
      for (const bill of engine.scheduledBills(year, month)) {
        if (bill.dueDate <= today || bill.dueDate > horizonDate) continue;
        billRows.push({ name: bill.name, dueDate: bill.dueDate, amountPence: bill.amountPence });
      }
    }
  }
  billRows.sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.name.localeCompare(right.name));

  const savingsRows: { name: string; dueDate: string; amountPence: number }[] = [];
  for (const account of ds.savings ?? []) {
    if (account.active === false) continue;
    const amountPence = Number(account.monthlyContributionPence) || 0;
    if (amountPence <= 0) continue;
    const day = Math.min(Math.max(Number(account.contributionDay) || 1, 1), 28);
    let year = startYear;
    let month = startMonth;
    if (day < Number(today.slice(8, 10))) {
      month += 1;
      if (month === 13) { month = 1; year += 1; }
    }
    const dueDate = iso(year, month, day);
    if (dueDate > horizonDate) continue;
    savingsRows.push({ name: account.name, dueDate, amountPence });
  }
  savingsRows.sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.name.localeCompare(right.name));

  const billsPence = billRows.reduce((sum, bill) => sum + bill.amountPence, 0);
  const savingsPence = savingsRows.reduce((sum, contribution) => sum + contribution.amountPence, 0);

  return {
    asOf: today,
    cashPence,
    billsPence,
    savingsPence,
    availablePence: cashPence - billsPence - savingsPence,
    nextIncomeDate: nextIncome?.date ?? '',
    nextIncomeKind: nextIncome?.kind ?? null,
    horizonDate,
    horizonLabel,
    cashRows,
    billRows,
    savingsRows,
  };
}

function icsText(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsStamp(now: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(now);
  if (!match) return '19700101T000000Z';
  return `${match[1]}${match[2]}${match[3]}T000000Z`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

interface IcsEvent {
  uid: string;
  date: string;
  summary: string;
  description?: string;
  endDate?: string;
}

function icsEvent(event: IcsEvent, stamp: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`,
    `DTEND;VALUE=DATE:${(event.endDate ?? addDays(event.date, 1)).replaceAll('-', '')}`,
    `SUMMARY:${icsText(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    'END:VEVENT',
  ];
}

/**
 * All-day events for bills, income, debt payments, savings contributions and
 * holidays. UIDs include the entity and date, so re-importing updates instead
 * of duplicating events in Google or Apple Calendar.
 */
export function calendarIcs(ds: Dataset, engine: Engine, options: { from?: string; months?: number; now?: string } = {}): string {
  const from = options.from ?? ds.settings.asOfDate;
  const months = Math.max(1, options.months ?? 12);
  const stamp = icsStamp(options.now ?? new Date().toISOString());
  const events: IcsEvent[] = [];

  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const throughDate = (() => {
    const value = new Date(`${iso(year, month, 1)}T00:00:00Z`);
    value.setUTCMonth(value.getUTCMonth() + months);
    return value.toISOString().slice(0, 10);
  })();

  for (let index = 0; index < months; index += 1) {
    for (const bill of engine.scheduledBills(year, month)) {
      if (bill.dueDate < from) continue;
      events.push({
        uid: `financehub-bill-${slug(bill.name)}-${bill.dueDate}@financehub.local`,
        date: bill.dueDate,
        summary: `Bill: ${bill.name}`,
        description: `${bill.paymentMethod || 'Bill'} — ${(bill.amountPence / 100).toFixed(2)} from ${bill.account}`,
      });
    }
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }

  for (const hit of incomeDates(ds, from, throughDate)) {
    events.push({
      uid: `financehub-income-${slug(hit.kind)}-${hit.date}@financehub.local`,
      date: hit.date,
      summary: `Income: ${hit.kind}`,
      description: `${(hit.amountPence / 100).toFixed(2)} expected`,
    });
  }

  for (const account of ds.savings ?? []) {
    if (account.active === false || Number(account.monthlyContributionPence) <= 0) continue;
    for (let index = 0; index < months; index += 1) {
      const target = new Date(`${from.slice(0, 8)}01T00:00:00Z`);
      target.setUTCMonth(target.getUTCMonth() + index);
      const eventYear = target.getUTCFullYear();
      const eventMonth = target.getUTCMonth() + 1;
      const day = clampDay(eventYear, eventMonth, Number(account.contributionDay) || 1);
      const date = iso(eventYear, eventMonth, day);
      if (date < from || date > throughDate) continue;
      events.push({
        uid: `financehub-savings-${slug(account.name)}-${date}@financehub.local`,
        date,
        summary: `Savings: ${account.name}`,
        description: `${((Number(account.monthlyContributionPence) || 0) / 100).toFixed(2)} contribution`,
      });
    }
  }

  for (const debt of ds.debts ?? []) {
    if (debt.active === false || !debt.dueDay) continue;
    for (let index = 0; index < months; index += 1) {
      const target = new Date(`${from.slice(0, 8)}01T00:00:00Z`);
      target.setUTCMonth(target.getUTCMonth() + index);
      const eventYear = target.getUTCFullYear();
      const eventMonth = target.getUTCMonth() + 1;
      const date = iso(eventYear, eventMonth, clampDay(eventYear, eventMonth, debt.dueDay));
      if (date < from || date > throughDate) continue;
      events.push({
        uid: `financehub-debt-${slug(debt.name)}-${date}@financehub.local`,
        date,
        summary: `Debt payment: ${debt.name}`,
        description: `${(debt.monthlyPaymentPence / 100).toFixed(2)} due`,
      });
    }
  }

  for (const trip of engine.holidays(from)) {
    const start = String(trip.start ?? '');
    if (!start) continue;
    const end = typeof trip.end === 'string' && trip.end >= start ? trip.end : start;
    if (end < from) continue;
    events.push({
      uid: `financehub-holiday-${slug(String(trip.name ?? 'holiday'))}-${start}@financehub.local`,
      date: start,
      endDate: addDays(end, 1),
      summary: `Holiday: ${String(trip.name ?? 'Trip')}`,
    });
  }

  events.sort((left, right) => left.date.localeCompare(right.date) || left.summary.localeCompare(right.summary));

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FinanceHub//Budget calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap((event) => icsEvent(event, stamp)),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
