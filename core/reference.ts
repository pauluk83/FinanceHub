/**
 * Documented adjustments to the retired workbook's own figures.
 *
 * The workbook is no longer the running truth: it counted movements between the
 * user's own accounts as income and spending, and entries were recorded after it
 * was retired. The parity gate and the reconciliation report must apply the same
 * adjustments, or they disagree about a budget that is actually correct. Keeping
 * them here means there is one list to change, not two.
 *
 * Nothing in this module changes a budget figure; it only states what the
 * workbook baseline is expected to become.
 */

export type MonthAdjustment = { incomePence: number; expensesPence: number };

/** Money moved between the user's own bank accounts, booked as income/expense. */
export const INTERNAL_TRANSFERS: Record<number, MonthAdjustment> = {
  2: { incomePence: 67500, expensesPence: 0 },
  3: { incomePence: 109419, expensesPence: 0 },
  4: { incomePence: 33000, expensesPence: 11821 },
  5: { incomePence: 10000, expensesPence: 12394 },
  7: { incomePence: 0, expensesPence: 1000 },
  8: { incomePence: 0, expensesPence: 2000 },
  9: { incomePence: 3000, expensesPence: 20000 },
  10: { incomePence: 57000, expensesPence: 25000 },
};

/** Entries recorded after the workbook was retired (November 2026). */
export const LIVE_TRANSACTIONS: Record<number, MonthAdjustment> = {
  11: { incomePence: 0, expensesPence: 3845 },
};

/** The £6.50 Dan payment and the four 7 November rows that changed owed. */
export const LIVE_OWED_PENCE = 1500;

/** The November rent payment was skipped because the account was in credit. */
export const NOVEMBER_RENT_SKIPPED_PENCE = 50000;

const ZERO: MonthAdjustment = { incomePence: 0, expensesPence: 0 };

export const internalTransferTotals = Object.values(INTERNAL_TRANSFERS).reduce(
  (sum, month) => ({
    incomePence: sum.incomePence + month.incomePence,
    expensesPence: sum.expensesPence + month.expensesPence,
  }),
  { incomePence: 0, expensesPence: 0 },
);

const liveTotals = Object.values(LIVE_TRANSACTIONS).reduce(
  (sum, month) => ({
    incomePence: sum.incomePence + month.incomePence,
    expensesPence: sum.expensesPence + month.expensesPence,
  }),
  { incomePence: 0, expensesPence: 0 },
);

export type WorkbookMonth = {
  month: number;
  incomePence: number;
  expensesPence: number;
  netPence?: number;
  owedPence: number;
};

/** What one month's income, expenses, net and owed should be once adjusted. */
export function adjustedMonth(month: WorkbookMonth) {
  const internal = INTERNAL_TRANSFERS[month.month] ?? ZERO;
  const live = LIVE_TRANSACTIONS[month.month] ?? ZERO;
  const rentSkip = month.month === 11 ? NOVEMBER_RENT_SKIPPED_PENCE : 0;
  const incomePence = month.incomePence - internal.incomePence + live.incomePence;
  const expensesPence = month.expensesPence - internal.expensesPence + live.expensesPence - rentSkip;
  return {
    incomePence,
    expensesPence,
    netPence: incomePence - expensesPence,
    owedPence: month.owedPence + (month.month >= 11 ? LIVE_OWED_PENCE : 0),
  };
}

export type WorkbookYtd = { incomePence: number; expensesPence: number; totalOwedPence: number };

/** Year-to-date expectations for the as-of month. */
export function adjustedYtd(ytd: WorkbookYtd) {
  const incomePence = ytd.incomePence - internalTransferTotals.incomePence + liveTotals.incomePence;
  const expensesPence = ytd.expensesPence - internalTransferTotals.expensesPence + liveTotals.expensesPence - NOVEMBER_RENT_SKIPPED_PENCE;
  return {
    incomePence,
    expensesPence,
    netPence: incomePence - expensesPence,
    totalOwedPence: ytd.totalOwedPence + LIVE_OWED_PENCE,
  };
}

export type WorkbookCurrentMonth = { incomePence: number; expensesPence: number; owedPence: number };

/** The current-month dashboard block (Monthly_Overview U9/U10/U13/U15). */
export function adjustedCurrentMonth(view: WorkbookCurrentMonth) {
  const live = LIVE_TRANSACTIONS[11] ?? ZERO;
  const expensesPence = view.expensesPence + live.expensesPence - NOVEMBER_RENT_SKIPPED_PENCE;
  return {
    incomePence: view.incomePence,
    expensesPence,
    netPence: view.incomePence - expensesPence,
    owedPence: view.owedPence + LIVE_OWED_PENCE,
  };
}
