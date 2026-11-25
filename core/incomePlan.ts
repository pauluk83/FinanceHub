/**
 * PIP and Universal Credit payment dates for any year up to 2040.
 *
 * The schedule rows only carry 2026, 2027 and 2028, and the last of those is the
 * "next year" the budget plans from. Beyond it PIP keeps its 28-day cycle and UC
 * keeps the 27th, moved back to the last working day when the 27th is a weekend
 * or an England and Wales bank holiday.
 *
 * Pure: no I/O, no clock reads.
 */
import type { Dataset } from './engine.ts';

export type IncomeScheme = 'pip' | 'uc';

/** The last year the schedule rows themselves carry a payment for. */
export const SCHEDULE_LAST_YEAR = 2028;

/** How far ahead payments are planned. */
export const INCOME_PLAN_LAST_YEAR = 2040;

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAY = 86_400_000;

const dayTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const isoOf = (time: number) => new Date(time).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => isoOf(dayTime(date) + days * DAY);
/** 0 = Sunday … 6 = Saturday. */
const weekday = (date: string) => new Date(dayTime(date)).getUTCDay();
const isoDate = (year: number, month: number, day: number) => isoOf(Date.UTC(year, month - 1, day));

/** Easter Sunday (anonymous Gregorian algorithm), used for Good Friday and Easter Monday. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

function nthWeekday(year: number, month: number, target: number, nth: number): string {
  const first = weekday(isoDate(year, month, 1));
  const offset = (target - first + 7) % 7;
  return isoDate(year, month, 1 + offset + (nth - 1) * 7);
}

function lastWeekday(year: number, month: number, target: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekday(isoDate(year, month, lastDay));
  return isoDate(year, month, lastDay - ((last - target + 7) % 7));
}

/** A weekend or already-taken holiday moves the day to the next free weekday. */
function substitute(date: string, taken: Set<string>): string {
  let cursor = date;
  while (weekday(cursor) === 0 || weekday(cursor) === 6 || taken.has(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

/** England and Wales bank holidays: the ones that can pull a 27th payment back. */
export function bankHolidays(year: number): string[] {
  const taken = new Set<string>();
  taken.add(substitute(isoDate(year, 1, 1), taken));
  const easter = easterSunday(year);
  taken.add(addDays(easter, -2));
  taken.add(addDays(easter, 1));
  taken.add(nthWeekday(year, 5, 1, 1));
  taken.add(lastWeekday(year, 5, 1));
  taken.add(lastWeekday(year, 8, 1));
  taken.add(substitute(isoDate(year, 12, 25), taken));
  taken.add(substitute(isoDate(year, 12, 26), taken));
  return [...taken].sort();
}

export function isWorkingDay(date: string): boolean {
  const day = weekday(date);
  if (day === 0 || day === 6) return false;
  return !bankHolidays(Number(date.slice(0, 4))).includes(date);
}

/** The last working day on or before a date: weekends and bank holidays step back. */
export function lastWorkingDayOnOrBefore(date: string): string {
  let cursor = date;
  for (let guard = 0; guard < 14; guard += 1) {
    if (isWorkingDay(cursor)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

/** Universal Credit lands on the 27th, or the last working day before it. */
export function ucPaymentDate(year: number, month: number): string {
  return lastWorkingDayOnOrBefore(isoDate(year, month, 27));
}

interface Payment {
  date: string;
  amountPence: number;
}

function storedPayment(row: any, year: number): Payment | null {
  const cell = year === 2027 ? row?.year2027 : year === 2028 ? row?.year2028 : row?.year2026;
  const date = typeof cell?.date === 'string' ? cell.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== year) return null;
  return { date, amountPence: Number(cell.amountPence) || 0 };
}

/** Every payment the schedule rows carry, in date order. */
export function storedPayments(ds: Dataset, scheme: IncomeScheme): Payment[] {
  const rows = ds.incomeSchedules?.[scheme] ?? [];
  const payments: Payment[] = [];
  for (const row of rows) {
    for (const year of [2026, 2027, 2028]) {
      const hit = storedPayment(row, year);
      if (hit) payments.push(hit);
    }
  }
  return payments.sort((a, b) => a.date.localeCompare(b.date));
}

/** The 2028 payment the plan carries on from: the newest one on the schedule. */
export function planAnchor(ds: Dataset, scheme: IncomeScheme): Payment | null {
  return storedPayments(ds, scheme).at(-1) ?? null;
}

/**
 * Payments for a window, from the schedule rows up to 2028 and from the plan
 * after that: PIP every 28 days from the 2028 payment, UC on the adjusted 27th.
 */
export function plannedPayments(ds: Dataset, scheme: IncomeScheme, from: string, to: string): Payment[] {
  const horizon = `${INCOME_PLAN_LAST_YEAR}-12-31`;
  // The plan never runs past 2040, however far ahead a caller asks (a statement
  // to the end of time still stops there).
  const end = to > horizon ? horizon : to;
  const payments = storedPayments(ds, scheme).filter((hit) => hit.date >= from && hit.date <= to);
  const anchor = planAnchor(ds, scheme);
  const lastYear = Number(end.slice(0, 4));
  if (!anchor || !Number.isInteger(lastYear) || lastYear <= SCHEDULE_LAST_YEAR) {
    return payments;
  }

  if (scheme === 'pip') {
    let cursor = addDays(anchor.date, 28);
    while (Number(cursor.slice(0, 4)) <= lastYear && cursor <= end) {
      if (cursor >= from) payments.push({ date: cursor, amountPence: anchor.amountPence });
      cursor = addDays(cursor, 28);
    }
  } else {
    let year = Number(anchor.date.slice(0, 4));
    let month = Number(anchor.date.slice(5, 7)) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    while (year <= lastYear) {
      const date = ucPaymentDate(year, month);
      if (date <= end && date >= from && date > anchor.date) payments.push({ date, amountPence: anchor.amountPence });
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return payments.sort((a, b) => a.date.localeCompare(b.date));
}

/** The PIP and UC money for one month, used by the monthly totals. */
export function incomeFor(ds: Dataset, year: number, month: number): { pip: number; uc: number } {
  const start = isoDate(year, month, 1);
  const end = isoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  const pip = plannedPayments(ds, 'pip', start, end).reduce((sum, hit) => sum + hit.amountPence, 0);
  const uc = plannedPayments(ds, 'uc', start, end).reduce((sum, hit) => sum + Math.max(0, hit.amountPence), 0);
  return { pip, uc };
}
