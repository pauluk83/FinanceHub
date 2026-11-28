/**
 * One-off repairs to a bank anchor.
 *
 * The anchor is the date the opening balance belongs to, so a payment that left
 * the account before the anchor was set is missing from every balance since.
 * The repair puts such a payment back, but only when the balance is exactly one
 * payment away from a figure the bank statement proves — so running it twice,
 * or on a budget that never had the fault, changes nothing.
 */
import { buildEngine, type Dataset } from './engine.ts';

/** The £106.66 Pure Cremation payment the 9 July 2026 Starling anchor predates. */
export const STARLING_ANCHOR_PAYMENT_PENCE = 10666;

/** The day the November 2026 statement closes. */
export const STARLING_STATEMENT_CLOSE = '2026-11-26';

/** The statement's closing balance: £0.17 once that payment is counted. */
export const STARLING_STATEMENT_CLOSE_PENCE = 17;

/**
 * The two figures the bank statement proves, used to recognise the fault: the
 * close on 26 November and the balance after the 27th's bills. Either one being
 * exactly one payment low is the same missing payment.
 */
export const STARLING_STATEMENT_EVIDENCE: { date: string; pence: number }[] = [
  { date: STARLING_STATEMENT_CLOSE, pence: STARLING_STATEMENT_CLOSE_PENCE },
  { date: '2026-11-27', pence: 46185 },
];

/**
 * Put the £106.66 back into Starling's opening balance.
 *
 * The workbook fix that did this runs only in the desktop build, so a budget
 * kept on the web host never saw it: every balance stayed one payment low, which
 * showed as £355.19 on 27 November instead of the £461.85 the statement gives.
 * The repair fires only when a balance the statement proves is exactly that
 * payment low (£0.17 on 26 November, £461.85 on 27 November), so a blank budget,
 * an earlier budget, or a budget already corrected is left exactly as it is.
 */
/**
 * Move an account's opening balance so its computed balance matches the bank.
 *
 * The difference goes to the year's opening figure when a year rollover set one
 * (that snapshot, not the account's own opening, is what the engine reads for
 * that year), otherwise to the account itself. Transactions are never touched,
 * and the figure the engine computes after this is exactly `targetPence`.
 */
export function reconcileAccountOpening(
  dataset: Dataset,
  accountName: string,
  date: string,
  targetPence: number,
  currentPence: number,
): number {
  const delta = Math.round(targetPence) - Math.round(currentPence);
  if (!delta) return 0;
  const year = String(date).slice(0, 4);
  const snapshot = (dataset.settings?.yearOpenings ?? {})[year];
  const snapshotBalance = snapshot?.accounts?.[accountName];
  if (typeof snapshotBalance === 'number') {
    snapshot.accounts[accountName] = snapshotBalance + delta;
    return delta;
  }
  const account = (dataset.accounts ?? []).find((entry) => entry.name === accountName);
  if (!account) return 0;
  account.openingPence = Number(account.openingPence || 0) + delta;
  return delta;
}

export function restoreStarlingAnchorPayment(dataset: Dataset): boolean {
  const starling = (dataset.accounts ?? []).find((account) => /^starling$/i.test(String(account.name ?? '')));
  if (!starling) return false;
  const engine = buildEngine(dataset);
  const onePaymentShort = STARLING_STATEMENT_EVIDENCE.some(
    ({ date, pence }) => engine.starlingBalance(date) === pence - STARLING_ANCHOR_PAYMENT_PENCE,
  );
  if (!onePaymentShort) return false;
  starling.openingPence = Number(starling.openingPence || 0) + STARLING_ANCHOR_PAYMENT_PENCE;
  return true;
}
