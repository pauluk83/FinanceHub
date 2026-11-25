/**
 * 12-month forward forecast and what-if scenarios (R10).
 *
 * The forecast is a cash projection from the As-of date, built only from
 * figures the engine already owns: scheduled bills, scheduled PIP and Universal
 * Credit, debt payments and savings contributions. It adds no new money model,
 * never writes to the budget, and a what-if override lives in memory only.
 */
import { MONTHS, monthEnd, type Dataset, type Engine } from './engine.ts';
import { plannedPayments } from './incomePlan.ts';

export interface ForecastOverride {
  /** Shift every future month's bills by this percentage, e.g. 10 for +10%. */
  billsPercent?: number;
  /** Extra debt payment each month. */
  extraDebtPence?: number;
  /** Extra saved each month. */
  savingsExtraPence?: number;
  /** Replaces scheduled income in full months; null keeps the schedule. */
  incomePence?: number | null;
  /** A single assumed expense. */
  oneOffPence?: number;
  /** Month key (`YYYY-MM`) for the one-off. */
  oneOffMonth?: string;
}

export interface ForecastMonth {
  key: string;
  label: string;
  year: number;
  month: number;
  openingPence: number;
  incomePence: number;
  billsPence: number;
  debtPence: number;
  /** Moved into savings this month. This leaves the current account, not the owner. */
  savingsPence: number;
  oneOffPence: number;
  /** Current-account cash after every movement, including the savings transfer. */
  closingPence: number;
  /** Savings held after this month's contribution. */
  savingsBalancePence: number;
  /** Cash plus savings: a contribution is still the owner's money. */
  positionPence: number;
  /** Owed to the owner at month end. Never counted as cash. */
  owedPence: number;
  /** True for the remainder of the As-of month. */
  partial: boolean;
}

export interface ForecastResult {
  through: string;
  startPence: number;
  startSavingsPence: number;
  months: ForecastMonth[];
  /** Cash at the end of the horizon. */
  endPence: number;
  /** Savings held at the end of the horizon. */
  endSavingsPence: number;
  /** Cash plus savings at the end of the horizon. */
  endPositionPence: number;
  lowestPence: number;
  lowestKey: string;
  monthsNegative: number;
  totalIncomePence: number;
  totalOutgoPence: number;
  notes: string[];
  /** The engine's own view of the starting month, for comparison. */
  currentMonth: { label: string; incomePence: number; expensesPence: number; netPence: number } | null;
}

const pad = (value: number) => String(value).padStart(2, '0');

interface DatedAmount {
  name: string;
  date: string;
  amountPence: number;
}

/** PIP and Universal Credit only, with their real scheduled dates. */
function scheduledIncomeRows(ds: Dataset, year: number, month: number): DatedAmount[] {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = `${year}-${String(month).padStart(2, '0')}-${monthEnd(year, month).slice(8, 10)}`;
  return [
    ...plannedPayments(ds, 'pip', from, to).map((hit) => ({ name: 'PIP', ...hit })),
    ...plannedPayments(ds, 'uc', from, to).map((hit) => ({ name: 'Universal Credit', ...hit })),
  ].sort((left, right) => left.date.localeCompare(right.date));
}

function monthLength(year: number, month: number): number {
  return Number(monthEnd(year, month).slice(8, 10));
}

function debtRows(ds: Dataset, year: number, month: number): DatedAmount[] {
  const length = monthLength(year, month);
  return (ds.debts ?? [])
    .filter((debt) => debt.active !== false && debt.monthlyPaymentPence > 0)
    .map((debt) => {
      const day = Math.min(Math.max(1, Number(debt.dueDay) || 1), length);
      return {
        name: debt.name,
        date: `${year}-${pad(month)}-${pad(day)}`,
        amountPence: debt.monthlyPaymentPence,
        // A debt without a due day is assumed to fall somewhere in the month.
        undated: !debt.dueDay,
      };
    });
}

function savingsRows(ds: Dataset, year: number, month: number): DatedAmount[] {
  const length = monthLength(year, month);
  return (ds.savings ?? [])
    .filter((account) => account.active !== false && (account.monthlyContributionPence ?? 0) > 0)
    .map((account) => {
      const day = Math.min(Math.max(1, Number(account.contributionDay) || 1), length);
      return {
        name: account.name,
        date: `${year}-${pad(month)}-${pad(day)}`,
        amountPence: account.monthlyContributionPence ?? 0,
        undated: !account.contributionDay,
      };
    });
}

function hasUndated(rows: readonly DatedAmount[]): boolean {
  return rows.some((row) => Boolean((row as DatedAmount & { undated?: boolean }).undated));
}

/**
 * Project cash forward from the As-of date. The first row covers the rest of
 * that month, so nothing already reflected in the balance is counted twice.
 */
export function buildForecast(
  ds: Dataset,
  engine: Engine,
  options: { months?: number; override?: ForecastOverride } = {},
): ForecastResult {
  const through = ds.settings.asOfDate;
  const horizon = Math.max(1, Math.min(36, Math.trunc(options.months ?? 12)));
  const override = options.override ?? {};

  const cashNames = new Set(
    ds.accounts
      .filter((account) => account.active !== false && account.excludeFromSafeToSpend !== true)
      .map((account) => account.name),
  );
  const startPence = engine.accountBalances(through)
    .filter((account) => cashNames.has(account.name))
    .reduce((sum, account) => sum + account.balancePence, 0);
  const startSavingsPence = (ds.savings ?? [])
    .filter((account) => account.active !== false)
    .reduce((sum, account) => sum + Math.max(0, account.balancePence || 0), 0);

  const startYear = Number(through.slice(0, 4));
  const startMonth = Number(through.slice(5, 7));
  const hasDebt = (ds.debts ?? []).some((debt) => debt.active !== false && debt.monthlyPaymentPence > 0);
  const hasSavingsContribution = (ds.savings ?? []).some(
    (account) => account.active !== false && (account.monthlyContributionPence ?? 0) > 0,
  );

  const months: ForecastMonth[] = [];
  let opening = startPence;
  let savingsBalance = startSavingsPence;
  let undatedNotice = false;

  for (let offset = 0; offset < horizon; offset += 1) {
    const absolute = startYear * 12 + (startMonth - 1) + offset;
    const year = Math.floor(absolute / 12);
    const month = (absolute % 12) + 1;
    const key = `${year}-${pad(month)}`;
    const partial = offset === 0;

    const incomeRows = scheduledIncomeRows(ds, year, month);
    const billRows = engine.scheduledBills(year, month);
    const debts = debtRows(ds, year, month);
    const savings = savingsRows(ds, year, month);
    if (hasUndated(debts) || hasUndated(savings)) undatedNotice = true;

    // Bills carry `dueDate`, so the accessor keeps one remaining-rows rule.
    const remaining = <T,>(rows: readonly T[], dateOf: (row: T) => string): T[] => partial
      ? rows.filter((row) => dateOf(row) > through)
      : [...rows];

    const remainingIncome = remaining(incomeRows, (row) => row.date);
    const incomePence = partial || override.incomePence == null
      ? remainingIncome.reduce((sum, row) => sum + row.amountPence, 0)
      : Number(override.incomePence);

    const billsBase = remaining(billRows, (bill) => bill.dueDate).reduce((sum, bill) => sum + bill.amountPence, 0);
    const billsPence = override.billsPercent
      ? Math.round(billsBase * (1 + override.billsPercent / 100))
      : billsBase;

    const debtBase = remaining(debts, (row) => row.date).reduce((sum, row) => sum + row.amountPence, 0);
    const debtPence = debtBase + (hasDebt ? Math.max(0, override.extraDebtPence ?? 0) : 0);

    const savingsBase = remaining(savings, (row) => row.date).reduce((sum, row) => sum + row.amountPence, 0);
    const savingsPence = savingsBase + (hasSavingsContribution ? Math.max(0, override.savingsExtraPence ?? 0) : 0);

    const oneOffPence = override.oneOffMonth === key ? Math.max(0, override.oneOffPence ?? 0) : 0;
    const closing = opening + incomePence - billsPence - debtPence - savingsPence - oneOffPence;
    savingsBalance += savingsPence;

    months.push({
      key,
      label: `${MONTHS[month - 1]} ${year}`,
      year,
      month,
      openingPence: opening,
      incomePence,
      billsPence,
      debtPence,
      savingsPence,
      oneOffPence,
      closingPence: closing,
      savingsBalancePence: savingsBalance,
      positionPence: closing + savingsBalance,
      owedPence: engine.owedAt(monthEnd(year, month)),
      partial,
    });
    opening = closing;
  }

  const lowest = months.reduce(
    (best, entry) => (entry.closingPence < best.closingPence ? entry : best),
    months[0],
  );

  const notes = [
    'Income uses scheduled PIP and Universal Credit only; recorded pay is not extrapolated.',
    'Cash is the active current accounts at the As-of date. A savings contribution leaves the current account but stays yours, so Position adds the savings balance back.',
    'Owed to you is shown on each row but never added to cash or position.',
  ];
  if (monthRowsEmpty(ds)) notes.push('No PIP or Universal Credit is scheduled, so projected income is zero.');
  if (undatedNotice) notes.push('A debt payment or savings contribution without a day of the month is assumed to fall inside that month.');

  const current = engine.monthlySummary(startYear, startMonth);

  return {
    through,
    startPence,
    startSavingsPence,
    months,
    endPence: months.length > 0 ? months[months.length - 1].closingPence : startPence,
    endSavingsPence: savingsBalance,
    endPositionPence: months.length > 0
      ? months[months.length - 1].positionPence
      : startPence + startSavingsPence,
    lowestPence: lowest?.closingPence ?? startPence,
    lowestKey: lowest?.key ?? '',
    monthsNegative: months.filter((entry) => entry.closingPence < 0).length,
    totalIncomePence: months.reduce((sum, entry) => sum + entry.incomePence, 0),
    totalOutgoPence: months.reduce(
      (sum, entry) => sum + entry.billsPence + entry.debtPence + entry.savingsPence + entry.oneOffPence,
      0,
    ),
    notes,
    currentMonth: {
      label: `${MONTHS[startMonth - 1]} ${startYear}`,
      incomePence: current.incomePence,
      expensesPence: current.expensesPence,
      netPence: current.netPence,
    },
  };
}

function monthRowsEmpty(ds: Dataset): boolean {
  return (ds.incomeSchedules.pip ?? []).length === 0 && (ds.incomeSchedules.uc ?? []).length === 0;
}
