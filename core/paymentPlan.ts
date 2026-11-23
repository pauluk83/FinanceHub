/**
 * Payment-plan review for usage-billed providers (Ovo, Water).
 *
 * Works out the monthly amount that covers the usage actually recorded without
 * leaving a large credit or debt. Callers pass only the months that have a bill,
 * so unbilled months cannot flatten the average.
 *
 * Pure: pence in, pence out, no storage and no clock reads.
 */

export type PaymentPlan = {
  /** Average usage of a billed month. */
  monthlyUsagePence: number;
  /** Credit held back as a buffer (one month's usage by default). */
  bufferPence: number;
  /** Payment that lands the balance on the buffer after `settleMonths`. */
  recommendedPence: number;
  /** Lowest recommendation: a quarter of usage, so a plan never stops paying. */
  floorPence: number;
  /** True when the floor raised the raw figure, as a large credit would. */
  floored: boolean;
  /** Months between bills (1 = monthly, 6 = billed twice a year). */
  cadenceMonths: number;
  /** True when credit is held for the next bill rather than paid back. */
  carryCredit: boolean;
  settleMonths: number;
  /** Balance after the settlement period at the recommended payment. */
  projectedPence: number;
};

export function paymentPlan(input: {
  usagePence: number;
  billedMonths: number;
  balancePence: number;
  /** Months over which excess credit (or debt) is worked off. Defaults to 12. */
  settleMonths?: number;
  /** Months of usage to keep in credit as a buffer. Defaults to 1. */
  bufferMonths?: number;
  /**
   * Months between bills. A quarterly or six-monthly bill keeps its credit for
   * the next bill instead of returning it in monthly instalments.
   */
  cadenceMonths?: number;
}): PaymentPlan | null {
  const usagePence = Number(input.usagePence);
  const billedMonths = Math.floor(Number(input.billedMonths));
  const balancePence = Number(input.balancePence);
  if (!Number.isFinite(usagePence) || usagePence <= 0) return null;
  if (!Number.isInteger(billedMonths) || billedMonths < 1) return null;
  if (!Number.isFinite(balancePence)) return null;

  const settleMonths = Math.max(1, Math.round(input.settleMonths ?? 12));
  const bufferMonths = Math.max(0, input.bufferMonths ?? 1);
  const cadenceMonths = Math.max(1, Math.min(12, Math.round(input.cadenceMonths ?? 1)));
  const monthlyUsagePence = Math.round(usagePence / billedMonths);
  // One bill's worth of usage is the buffer for a bill paid every six months.
  const bufferPence = Math.round(monthlyUsagePence * bufferMonths * cadenceMonths);
  const carryCredit = cadenceMonths > 1;
  // A pure credit-return calculation can reach zero when the credit already
  // covers the window. A zero direct debit silently stops paying, so the
  // recommendation is held at a quarter of usage instead; the owner can still
  // type a different figure, but never by accepting the plan by accident.
  const floorPence = Math.max(1, Math.round(monthlyUsagePence * 0.25));
  // Credit above the buffer is handed back over the settlement window; a debt is
  // cleared over it and the buffer rebuilt. A balance between the two pays usage
  // only, so the plan never invents credit the account does not already hold.
  // A less-than-monthly bill keeps its credit: it is the money for the next
  // bill, and paying it back would leave that bill short.
  const refundPence = !carryCredit && balancePence > bufferPence ? balancePence - bufferPence : 0;
  const debtPence = balancePence < 0 ? bufferPence - balancePence : 0;
  const rawPence = Math.max(0, Math.round(monthlyUsagePence + (debtPence - refundPence) / settleMonths));
  const recommendedPence = Math.max(floorPence, rawPence);
  const projectedPence = balancePence + (recommendedPence - monthlyUsagePence) * settleMonths;
  return { monthlyUsagePence, bufferPence, recommendedPence, floorPence, floored: recommendedPence > rawPence, cadenceMonths, carryCredit, settleMonths, projectedPence };
}
