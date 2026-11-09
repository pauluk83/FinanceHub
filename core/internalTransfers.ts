/**
 * Internal transfers between the user's own bank accounts.
 *
 * The workbook recorded both sides of these movements as ordinary rows, so the
 * primary account's side was counted as income or spending even though no money
 * entered or left the household. A row on the primary account is treated as
 * internal when another one of the user's bank accounts carries the opposite
 * leg on the same date for the same amount; the budget treatment tag is not
 * required, because older rows predate it.
 */
export type TransferRow = {
  row: number;
  date: string;
  account: string;
  type: string;
  amountPence: number;
  budgetTreatment?: string;
};

/**
 * Row numbers on `primaryAccount` that are one leg of a movement between own
 * bank accounts. Rows on the other accounts are not returned: only the primary
 * account's rows feed the income and expense totals.
 */
export function findInternalTransferRows(
  transactions: TransferRow[],
  bankNames: Set<string>,
  primaryAccount: string,
): Set<number> {
  const internal = new Set<number>();
  const byAmount = new Map<string, TransferRow[]>();

  for (const t of transactions) {
    if (!bankNames.has(t.account)) continue;
    const key = `${t.date}|${t.amountPence}`;
    const bucket = byAmount.get(key);
    if (bucket) bucket.push(t);
    else byAmount.set(key, [t]);
  }

  for (const t of transactions) {
    if (t.account !== primaryAccount) continue;
    const candidates = byAmount.get(`${t.date}|${t.amountPence}`) ?? [];
    const mirrored = candidates.some((other) =>
      other.row !== t.row && other.type !== t.type && other.account !== t.account,
    );
    if (mirrored) internal.add(t.row);
  }

  return internal;
}
