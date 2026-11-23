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
}): PaymentPlan | null {
  const usagePence = Number(input.usagePence);
  const billedMonths = Math.floor(Number(input.billedMonths));
  const balancePence = Number(input.balancePence);
  if (!Number.isFinite(usagePence) || usagePence <= 0) return null;
  if (!Number.isInteger(billedMonths) || billedMonths < 1) return null;
  if (!Number.isFinite(balancePence)) return null;

  const settleMonths = Math.max(1, Math.round(input.settleMonths ?? 12));
  const bufferMonths = Math.max(0, input.bufferMonths ?? 1);
  const monthlyUsagePence = Math.round(usagePence / billedMonths);
  const bufferPence = Math.round(monthlyUsagePence * bufferMonths);
  // Credit above the buffer is handed back over the settlement window; a debt is
  // cleared over it and the buffer rebuilt. A balance between the two pays usage
  // only, so the plan never invents credit the account does not already hold.
  const recommendedPence = Math.max(0, Math.round(
    balancePence > bufferPence
      ? monthlyUsagePence - (balancePence - bufferPence) / settleMonths
      : balancePence < 0
        ? monthlyUsagePence + (bufferPence - balancePence) / settleMonths
        : monthlyUsagePence,
  ));
  const projectedPence = balancePence + (recommendedPence - monthlyUsagePence) * settleMonths;
  return { monthlyUsagePence, bufferPence, recommendedPence, settleMonths, projectedPence };
}
