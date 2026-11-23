/**
 * The monthly "what changed" digest.
 *
 * One read-only answer to "what moved this month?" — income, expenses, bills,
 * account balance and what people owe, each against the month before, plus the
 * budget changelog entries recorded in that month. Every figure is the engine's
 * own, so the digest can never disagree with the screens or with a lock.
 */
import type { Dataset, Engine } from './engine.ts';
import { monthEnd } from './engine.ts';
import { withoutAppUpdatePlaceholders } from './changelogFilters.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type DigestDirection = 'up' | 'down' | 'same';

export interface DigestChange {
  id: string;
  label: string;
  before: string;
  after: string;
  deltaPence: number;
  direction: DigestDirection;
  note?: string;
}

export interface DigestEvent {
  date: string;
  title: string;
  description: string;
}

export interface MonthDigest {
  year: number;
  month: number;
  label: string;
  previousLabel: string;
  locked: boolean;
  empty: boolean;
  summary: string;
  changes: DigestChange[];
  events: DigestEvent[];
  counts: { scheduledBills: number; changedBills: number; events: number };
}

const pad = (value: number) => String(value).padStart(2, '0');

export function moneyText(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const directionOf = (delta: number): DigestDirection => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'same');

function shift(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function change(
  id: string,
  label: string,
  beforePence: number,
  afterPence: number,
  note?: string,
): DigestChange {
  const delta = afterPence - beforePence;
  return {
    id,
    label,
    before: moneyText(beforePence),
    after: moneyText(afterPence),
    deltaPence: delta,
    direction: directionOf(delta),
    ...(note ? { note } : {}),
  };
}

export function buildMonthDigest(ds: Dataset, engine: Engine, year: number, month: number): MonthDigest {
  const safeMonth = Math.min(12, Math.max(1, Math.trunc(month)));
  const safeYear = Math.trunc(year);
  const previous = shift(safeYear, safeMonth, -1);
  const label = `${MONTHS[safeMonth - 1]} ${safeYear}`;
  const previousLabel = `${MONTHS[previous.month - 1]} ${previous.year}`;
  const through = monthEnd(safeYear, safeMonth);
  const previousThrough = monthEnd(previous.year, previous.month);

  const current = engine.monthlySummary(safeYear, safeMonth);
  const before = engine.monthlySummary(previous.year, previous.month);

  const bills = engine.scheduledBills(safeYear, safeMonth);
  const previousBills = engine.scheduledBills(previous.year, previous.month);
  const previousByName = new Map(previousBills.map((bill) => [bill.name, bill.amountPence]));
  let changedBills = 0;
  for (const bill of bills) {
    const previousAmount = previousByName.get(bill.name);
    if (previousAmount !== undefined && previousAmount !== bill.amountPence) changedBills += 1;
  }

  const accountTotal = engine.accountBalances(through).reduce((sum, account) => sum + account.balancePence, 0);
  const previousAccountTotal = engine.accountBalances(previousThrough).reduce((sum, account) => sum + account.balancePence, 0);

  const changes: DigestChange[] = [
    change('income', 'Income', before.incomePence, current.incomePence),
    change('expenses', 'Expenses', before.expensesPence, current.expensesPence),
    change('bills', 'Scheduled bills', engine.scheduledBillsTotal(previous.year, previous.month), engine.scheduledBillsTotal(safeYear, safeMonth),
      changedBills ? `${changedBills} bill${changedBills === 1 ? '' : 's'} changed amount` : undefined),
    change('accounts', 'Account balance at month end', previousAccountTotal, accountTotal),
    change('owed', 'Owed to me at month end', engine.owedAt(previousThrough), engine.owedAt(through)),
  ];

  const key = `${safeYear}-${pad(safeMonth)}`;
  const locked = Boolean(ds.monthLocks?.[key]);
  const events: DigestEvent[] = withoutAppUpdatePlaceholders(ds.changelog ?? [])
    .filter((entry: any) => typeof entry?.date === 'string' && entry.date.slice(0, 7) === key)
    .map((entry: any) => ({
      date: String(entry.date),
      title: String(entry.sheetCell ?? entry.title ?? 'Budget change'),
      description: String(entry.description ?? ''),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const moved = changes.filter((entry) => entry.direction !== 'same').length;
  const summary = events.length === 0 && moved === 0
    ? `Nothing changed in ${label}${locked ? ', and the month is locked' : ''}.`
    : `${label}: ${moved} figure${moved === 1 ? '' : 's'} moved from ${previousLabel}, ${events.length} budget change${events.length === 1 ? '' : 's'} recorded${locked ? '; the month is locked' : ''}.`;

  return {
    year: safeYear,
    month: safeMonth,
    label,
    previousLabel,
    locked,
    empty: events.length === 0 && moved === 0,
    summary,
    changes,
    events,
    counts: { scheduledBills: bills.length, changedBills, events: events.length },
  };
}
