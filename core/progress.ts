/**
 * Progress pack (R11): debt payoff, savings on track and year over year.
 *
 * The planners are calculators over figures the budget already holds. A payoff
 * plan only writes when the owner applies it, and then only each debt's monthly
 * payment; the debts ledger balance is never rewritten.
 */
import { monthEnd, type Dataset, type Engine, type SavingsAccount } from './engine.ts';

const pad = (value: number) => String(value).padStart(2, '0');
const MAX_MONTHS = 600;

export function addMonths(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10)) || 1;
  const absolute = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = (absolute % 12) + 1;
  const last = Number(monthEnd(nextYear, nextMonth).slice(8, 10));
  return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(day, last))}`;
}

export function monthsBetween(from: string, to: string): number {
  const left = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)) - 1;
  const right = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - 1;
  return right - left;
}

/* ------------------------------------------------------------- debt payoff */

export type PayoffStrategy = 'snowball' | 'avalanche';

export interface PayoffDebtInput {
  id: string;
  name: string;
  balancePence: number;
  annualRatePct?: number;
  monthlyPaymentPence: number;
}

export interface PayoffDebtResult {
  id: string;
  name: string;
  interestPence: number;
  payoffMonth: number | null;
  payoffDate: string | null;
  startingPaymentPence: number;
}

export interface PayoffMonthPoint {
  key: string;
  label: string;
  totalPence: number;
  interestPence: number;
  paymentPence: number;
}

export interface PayoffPlan {
  ok: boolean;
  reason?: string;
  strategy: PayoffStrategy;
  extraPence: number;
  months: number;
  payoffDate: string;
  totalInterestPence: number;
  minimumInterestPence: number;
  minimumComplete: boolean;
  interestSavedPence: number;
  perDebt: PayoffDebtResult[];
  schedule: PayoffMonthPoint[];
  startingPayments: { id: string; name: string; fromPence: number; toPence: number }[];
}

interface WorkingDebt extends PayoffDebtInput {
  rate: number;
  base: number;
  balance: number;
}

function normalise(debts: readonly PayoffDebtInput[]): WorkingDebt[] {
  return debts
    .filter((debt) => Number(debt.balancePence) > 0)
    .map((debt) => ({
      ...debt,
      rate: Math.max(0, Number(debt.annualRatePct) || 0),
      base: Math.max(0, Math.round(Number(debt.monthlyPaymentPence) || 0)),
      balance: Math.max(0, Math.round(Number(debt.balancePence) || 0)),
    }));
}

function monthlyInterest(balance: number, rate: number): number {
  if (balance <= 0 || rate <= 0) return 0;
  return Math.round(balance * (rate / 100) / 12);
}

const byStrategy = (strategy: PayoffStrategy) => (left: WorkingDebt, right: WorkingDebt) =>
  strategy === 'snowball'
    ? left.balance - right.balance || left.name.localeCompare(right.name)
    : right.rate - left.rate || left.balance - right.balance || left.name.localeCompare(right.name);

/** Interest paid when every debt only ever receives its own minimum. */
function minimumInterest(debts: readonly WorkingDebt[]): { interest: number; complete: boolean } {
  const working = debts.map((debt) => ({ ...debt }));
  let interest = 0;
  let month = 0;
  while (working.some((debt) => debt.balance > 0) && month < MAX_MONTHS) {
    month += 1;
    for (const debt of working) {
      if (debt.balance <= 0) continue;
      const charged = monthlyInterest(debt.balance, debt.rate);
      debt.balance += charged;
      interest += charged;
      debt.balance = Math.max(0, debt.balance - debt.base);
    }
  }
  return { interest, complete: !working.some((debt) => debt.balance > 0) };
}

/**
 * Simulate a payoff plan. The payment of a cleared debt rolls to the next debt
 * in the chosen order, which is why snowball clears small balances first.
 */
export function payoffPlan(
  debts: readonly PayoffDebtInput[],
  options: { strategy?: PayoffStrategy; extraPence?: number; startDate: string } = { startDate: new Date().toISOString().slice(0, 10) },
): PayoffPlan {
  const strategy = options.strategy ?? 'snowball';
  const extraPence = Math.max(0, Math.round(Number(options.extraPence) || 0));
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(options.startDate) ? options.startDate : new Date().toISOString().slice(0, 10);
  const inputs = normalise(debts);
  const plan: PayoffPlan = {
    ok: false,
    reason: inputs.length === 0 ? 'Add a debt with a balance to plan a payoff.' : undefined,
    strategy,
    extraPence,
    months: 0,
    payoffDate: startDate,
    totalInterestPence: 0,
    minimumInterestPence: 0,
    minimumComplete: false,
    interestSavedPence: 0,
    perDebt: [],
    schedule: [],
    startingPayments: [],
  };
  if (inputs.length === 0) return plan;

  const firstMonthInterest = inputs.reduce((sum, debt) => sum + monthlyInterest(debt.balance, debt.rate), 0);
  const firstMonthPayments = inputs.reduce((sum, debt) => sum + debt.base, 0) + extraPence;
  if (firstMonthPayments <= firstMonthInterest) {
    return {
      ...plan,
      reason: 'The monthly payments do not cover the interest, so the balance would never fall. Increase a payment or add an extra amount.',
    };
  }

  const order = [...inputs].sort(byStrategy(strategy));
  const working = inputs.map((debt) => ({ ...debt }));
  const byId = new Map(working.map((debt) => [debt.id, debt]));
  const interestByDebt = new Map(working.map((debt) => [debt.id, 0]));
  const payoffMonth = new Map<string, number | null>(working.map((debt) => [debt.id, null]));
  const firstPayment = new Map(working.map((debt) => [debt.id, 0]));
  const schedule: PayoffMonthPoint[] = [];
  // The plan keeps the owner's total monthly outlay constant: every debt's own
  // payment plus the extra. A cleared debt's payment stays in that total and is
  // redirected by priority, month after month — not just in the month it clears.
  const monthlyBudget = inputs.reduce((sum, debt) => sum + debt.base, 0) + extraPence;

  let month = 0;
  while ([...byId.values()].some((debt) => debt.balance > 0) && month < MAX_MONTHS) {
    month += 1;
    const date = addMonths(startDate, month);
    let monthInterest = 0;
    for (const debt of byId.values()) {
      if (debt.balance <= 0) continue;
      const charged = monthlyInterest(debt.balance, debt.rate);
      debt.balance += charged;
      monthInterest += charged;
      interestByDebt.set(debt.id, (interestByDebt.get(debt.id) ?? 0) + charged);
    }

    let pool = monthlyBudget;
    let paid = 0;
    // Every live debt keeps its own payment first, so nothing falls behind.
    for (const debt of order) {
      const live = byId.get(debt.id);
      if (!live || live.balance <= 0) continue;
      const payment = Math.min(live.balance, live.base);
      live.balance -= payment;
      paid += payment;
      pool -= payment;
      if (month === 1) firstPayment.set(debt.id, payment);
      if (live.balance <= 0 && payoffMonth.get(debt.id) === null) payoffMonth.set(debt.id, month);
    }
    // Then the freed payments and the extra, in the chosen order.
    for (const debt of order) {
      if (pool <= 0) break;
      const live = byId.get(debt.id);
      if (!live || live.balance <= 0) continue;
      const payment = Math.min(live.balance, pool);
      live.balance -= payment;
      paid += payment;
      pool -= payment;
      if (month === 1) firstPayment.set(debt.id, (firstPayment.get(debt.id) ?? 0) + payment);
      if (live.balance <= 0 && payoffMonth.get(debt.id) === null) payoffMonth.set(debt.id, month);
    }

    schedule.push({
      key: date.slice(0, 7),
      label: date,
      totalPence: [...byId.values()].reduce((sum, debt) => sum + debt.balance, 0),
      interestPence: monthInterest,
      paymentPence: paid,
    });
  }

  const cleared = [...byId.values()].every((debt) => debt.balance <= 0);
  const minimum = minimumInterest(inputs);
  const totalInterest = [...interestByDebt.values()].reduce((sum, value) => sum + value, 0);

  return {
    ...plan,
    ok: cleared,
    reason: cleared ? undefined : 'Not repaid within 50 years at these payments.',
    months: month,
    payoffDate: addMonths(startDate, month),
    totalInterestPence: totalInterest,
    minimumInterestPence: minimum.interest,
    minimumComplete: minimum.complete,
    interestSavedPence: minimum.complete ? Math.max(0, minimum.interest - totalInterest) : 0,
    perDebt: inputs.map((debt) => {
      const cleared = payoffMonth.get(debt.id) ?? null;
      return {
        id: debt.id,
        name: debt.name,
        interestPence: interestByDebt.get(debt.id) ?? 0,
        payoffMonth: cleared,
        payoffDate: cleared === null ? null : addMonths(startDate, cleared),
        startingPaymentPence: firstPayment.get(debt.id) || debt.base,
      };
    }),
    schedule,
    startingPayments: inputs.map((debt) => ({
      id: debt.id,
      name: debt.name,
      fromPence: debt.base,
      toPence: firstPayment.get(debt.id) || debt.base,
    })),
  };
}

export interface AppliedPayment {
  id: string;
  name: string;
  fromPence: number;
  toPence: number;
}

/**
 * Write the plan's starting payments into the debts ledger. Only records whose
 * payment actually changes are touched, and the balance is left alone.
 */
export function applyPayoffPlan(dataset: Dataset, plan: PayoffPlan): AppliedPayment[] {
  if (!plan.ok) return [];
  const applied: AppliedPayment[] = [];
  for (const change of plan.startingPayments) {
    const debt = (dataset.debts ?? []).find((entry) => entry.id === change.id);
    if (!debt) continue;
    if (debt.monthlyPaymentPence === change.toPence) continue;
    applied.push({ id: debt.id, name: debt.name, fromPence: debt.monthlyPaymentPence, toPence: change.toPence });
    debt.monthlyPaymentPence = change.toPence;
  }
  return applied;
}

/* ----------------------------------------------------------- savings target */

export interface SavingsProgress {
  id: string;
  name: string;
  balancePence: number;
  targetPence: number;
  targetDate?: string;
  monthsLeft: number | null;
  requiredMonthlyPence: number | null;
  monthlyContributionPence: number;
  projectedDate: string | null;
  onTrack: boolean | null;
  gapPence: number;
  status: string;
}

function requiredMonthly(balance: number, target: number, rate: number, months: number): number {
  if (balance >= target) return 0;
  if (months <= 0) return target - balance;
  const monthlyRate = rate / 100 / 12;
  if (monthlyRate <= 0) return Math.ceil((target - balance) / months);
  const growth = Math.pow(1 + monthlyRate, months);
  return Math.max(0, Math.ceil((target - balance * growth) * monthlyRate / (growth - 1)));
}

function projectedPayoffDate(
  balance: number,
  target: number,
  rate: number,
  contribution: number,
  today: string,
): string | null {
  if (balance >= target) return today;
  if (contribution <= 0) return null;
  let value = balance;
  const monthlyRate = rate / 100 / 12;
  for (let month = 1; month <= MAX_MONTHS; month += 1) {
    value = value * (1 + monthlyRate) + contribution;
    if (value >= target) return addMonths(today, month);
  }
  return null;
}

export function savingsProgress(
  accounts: readonly SavingsAccount[],
  today: string,
): SavingsProgress[] {
  return accounts
    .filter((account) => account.active !== false)
    .map((account) => {
      const balance = Math.max(0, account.balancePence || 0);
      const target = Math.max(0, account.targetPence || 0);
      const rate = Math.max(0, account.interestRatePct || 0);
      const contribution = Math.max(0, account.monthlyContributionPence || 0);
      const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(account.targetDate ?? '') ? account.targetDate : undefined;
      const monthsLeft = targetDate ? Math.max(0, monthsBetween(today, targetDate)) : null;
      const projectedDate = target > 0 ? projectedPayoffDate(balance, target, rate, contribution, today) : null;

      if (target <= 0) {
        return {
          id: account.id, name: account.name, balancePence: balance, targetPence: 0,
          ...(targetDate ? { targetDate } : {}),
          monthsLeft, requiredMonthlyPence: null, monthlyContributionPence: contribution,
          projectedDate, onTrack: null, gapPence: 0, status: 'No target set',
        };
      }
      if (balance >= target) {
        return {
          id: account.id, name: account.name, balancePence: balance, targetPence: target,
          ...(targetDate ? { targetDate } : {}),
          monthsLeft, requiredMonthlyPence: 0, monthlyContributionPence: contribution,
          projectedDate: today, onTrack: true, gapPence: 0, status: 'Target reached',
        };
      }
      if (!targetDate) {
        return {
          id: account.id, name: account.name, balancePence: balance, targetPence: target,
          monthsLeft: null, requiredMonthlyPence: null, monthlyContributionPence: contribution,
          projectedDate, onTrack: null, gapPence: target - balance,
          status: projectedDate ? `No target date · reaches target ${projectedDate}` : 'No target date or regular contribution',
        };
      }

      const required = requiredMonthly(balance, target, rate, monthsLeft ?? 0);
      const gap = required - contribution;
      return {
        id: account.id, name: account.name, balancePence: balance, targetPence: target,
        targetDate, monthsLeft, requiredMonthlyPence: required, monthlyContributionPence: contribution,
        projectedDate, onTrack: gap <= 0, gapPence: Math.max(0, gap),
        status: gap <= 0 ? 'On track' : `Behind by ${Math.round(gap) / 100} a month`,
      };
    });
}

/* ------------------------------------------------------- year over year */

export interface ComparisonRow {
  label: string;
  currentPence: number;
  previousPence: number;
  deltaPence: number;
  changePct: number | null;
}

export interface YearComparison {
  year: number;
  previousYear: number;
  month: number | null;
  rows: ComparisonRow[];
  categories: ComparisonRow[];
  providers: ComparisonRow[];
  hasPrevious: boolean;
  note: string;
}

function comparison(label: string, currentPence: number, previousPence: number): ComparisonRow {
  return {
    label,
    currentPence,
    previousPence,
    deltaPence: currentPence - previousPence,
    changePct: previousPence === 0 ? null : (currentPence - previousPence) / Math.abs(previousPence),
  };
}

interface Totals {
  incomePence: number;
  expensesPence: number;
  netPence: number;
  billsPence: number;
}

function totalsFor(engine: Engine, year: number, month: number | null): Totals {
  if (month !== null) {
    const summary = engine.monthlySummary(year, month);
    return {
      incomePence: summary.incomePence,
      expensesPence: summary.expensesPence,
      netPence: summary.netPence,
      billsPence: engine.scheduledBillsTotal(year, month),
    };
  }
  const totals: Totals = { incomePence: 0, expensesPence: 0, netPence: 0, billsPence: 0 };
  for (let entry = 1; entry <= 12; entry += 1) {
    const summary = engine.monthlySummary(year, entry);
    totals.incomePence += summary.incomePence;
    totals.expensesPence += summary.expensesPence;
    totals.netPence += summary.netPence;
    totals.billsPence += engine.scheduledBillsTotal(year, entry);
  }
  return totals;
}

function inPeriod(date: string, year: number, month: number | null): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (Number(date.slice(0, 4)) !== year) return false;
  return month === null || Number(date.slice(5, 7)) === month;
}

function categorySpend(ds: Dataset, year: number, month: number | null): Map<string, number> {
  const totals = new Map<string, number>();
  for (const tx of ds.transactions) {
    if (tx.type !== 'Expense' || tx.autoBill === true || tx.budgetTreatment === 'Transfer') continue;
    if (!inPeriod(tx.date, year, month)) continue;
    const label = tx.category?.trim() || 'Uncategorised';
    totals.set(label, (totals.get(label) ?? 0) + tx.amountPence);
  }
  return totals;
}

function providerSpend(engine: Engine, year: number, month: number | null): Map<string, number> {
  const totals = new Map<string, number>();
  const add = (key: string, amount: number) => totals.set(key, (totals.get(key) ?? 0) + amount);
  const months = month === null ? Array.from({ length: 12 }, (_, index) => index + 1) : [month];
  for (const entry of months) {
    for (const bill of engine.scheduledBills(year, entry)) {
      add(bill.linkedSheet?.trim() || 'No provider link', bill.amountPence);
    }
  }
  return totals;
}

function mergeComparison(
  current: Map<string, number>,
  previous: Map<string, number>,
): ComparisonRow[] {
  const keys = [...new Set([...current.keys(), ...previous.keys()])];
  return keys
    .map((key) => comparison(key, current.get(key) ?? 0, previous.get(key) ?? 0))
    .sort((left, right) => Math.abs(right.currentPence) - Math.abs(left.currentPence) || left.label.localeCompare(right.label));
}

/** Month or whole-year comparison against the previous year. */
export function yearComparison(ds: Dataset, engine: Engine, year: number, month: number | null): YearComparison {
  const previousYear = year - 1;
  const totals = totalsFor(engine, year, month);
  const previous = totalsFor(engine, previousYear, month);

  const hasPrevious = ds.transactions.some((tx) => tx.date.startsWith(`${previousYear}-`))
    || Object.keys(ds.monthLocks ?? {}).some((key) => key.startsWith(`${previousYear}-`));

  // With no recorded previous year, today's bill table would still produce a
  // 2025 figure. That is an invention, not a comparison, so nothing is shown.
  if (!hasPrevious) {
    return {
      year,
      previousYear,
      month,
      rows: [],
      categories: [],
      providers: [],
      hasPrevious: false,
      note: `No figures were recorded in ${previousYear}, so there is nothing to compare yet.`,
    };
  }

  return {
    year,
    previousYear,
    month,
    rows: [
      comparison('Income', totals.incomePence, previous.incomePence),
      comparison('Expenses', totals.expensesPence, previous.expensesPence),
      comparison('Net', totals.netPence, previous.netPence),
      comparison('Scheduled bills', totals.billsPence, previous.billsPence),
    ],
    categories: mergeComparison(categorySpend(ds, year, month), categorySpend(ds, previousYear, month)),
    providers: mergeComparison(providerSpend(engine, year, month), providerSpend(engine, previousYear, month)),
    hasPrevious,
    note: hasPrevious
      ? `Compared with ${previousYear}. Locked months use the recorded close and open months recalculate.`
      : `No figures were recorded in ${previousYear}, so there is nothing to compare yet.`,
  };
}
