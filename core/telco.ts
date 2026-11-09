/**
 * O2 and Virgin Media contract ledgers.
 *
 * The workbook treats each month as `balance = previous + payment − charge`
 * and keeps the contract totals as "payments made" and
 * "contract amount − payments made". Editing or adding a payment therefore has
 * to carry through every later month and restate those totals, not just change
 * the row that was edited.
 */
export type TelcoRow = {
  month?: string;
  amountPence?: number;
  paymentPence?: number;
  balancePence?: number;
  /** A balance deliberately entered by the user; later rows carry forward from it. */
  balanceOverridePence?: number;
  [key: string]: unknown;
};

export type TelcoContract = {
  endDate?: string;
  contractAmountPence?: number;
  paymentsPence?: number;
  remainingPaymentsPence?: number;
  [key: string]: unknown;
};

export type TelcoProvider = {
  year?: number;
  statement?: TelcoRow[];
  contract?: TelcoContract;
  contractEdited?: boolean;
  [key: string]: unknown;
};

export type TelcoTotals = {
  paymentsPence: number;
  remainingPaymentsPence: number | null;
};

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Balance carried into the first statement row of the ledger. */
export function telcoOpeningPence(rows: TelcoRow[]): number {
  const first = rows[0];
  if (!first) return 0;
  return num(first.balancePence) - num(first.paymentPence) + num(first.amountPence);
}

/**
 * Recalculate every row balance and the contract's paid/remaining totals.
 *
 * `openingPence` is the balance before the first row. Pass the value captured
 * *before* an edit; without it the current first row is used, which is correct
 * only when the ledger is already consistent.
 */
export function recalculateTelco(provider: TelcoProvider, openingPence?: number): TelcoTotals {
  const rows = provider.statement ?? [];
  let running = openingPence ?? telcoOpeningPence(rows);
  let payments = 0;

  for (const row of rows) {
    const payment = num(row.paymentPence);
    const charge = num(row.amountPence);
    running += payment - charge;
    if (typeof row.balanceOverridePence === 'number' && Number.isFinite(row.balanceOverridePence)) {
      running = row.balanceOverridePence;
    }
    row.balancePence = running;
    payments += payment;
  }

  let remaining: number | null = null;
  const contract = provider.contract;
  if (contract) {
    contract.paymentsPence = payments;
    if (typeof contract.contractAmountPence === 'number') {
      // An overpayment leaves nothing outstanding rather than a negative total.
      remaining = Math.max(contract.contractAmountPence - payments, 0);
      contract.remainingPaymentsPence = remaining;
    } else if (typeof contract.remainingPaymentsPence === 'number') {
      remaining = contract.remainingPaymentsPence;
    }
    provider.contractEdited = true;
  }

  return { paymentsPence: payments, remainingPaymentsPence: remaining };
}

const isoMonth = (value?: string) => {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? '');
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
};

/**
 * Whole months left to run, counting the month `asOf` falls in and the
 * contract's end month. O2 and Virgin run from October 2026 to 30 September
 * 2028, so as of November 2026 there are 23 months left.
 * Returns null when the contract has no usable end date.
 */
export function telcoRemainingMonths(provider: TelcoProvider, asOf: string): number | null {
  const end = isoMonth(provider.contract?.endDate);
  const from = isoMonth(asOf);
  if (!end || !from) return null;
  const months = end.year * 12 + end.month - (from.year * 12 + from.month) + 1;
  return Math.max(months, 0);
}
