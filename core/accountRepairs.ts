/**
 * One-off repairs to the Starling balance.
 *
 * The anchor is the date the opening balance belongs to, so anything that left
 * the account before the anchor was set (or a bill the plan lost) is missing
 * from every balance since. Each repair here fires only on the evidence a bank
 * statement proves, and only once — so running it twice, or on a budget that
 * never had the fault, changes nothing.
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

/** Water's monthly payment when the sheet's carried-forward zeros still hide it. */
export const WATER_RESUMED_PAYMENT_PENCE = 4400;

/**
 * Put Water's monthly payment back on the bill.
 *
 * The Water sheet stops paying while the account is in credit and leaves the
 * months after that as carried-forward zeros, so the bill read £0 and the £44
 * the bank still takes never left the balance. A month whose zero carries no
 * edit of its own is one of those placeholders, not a decision: the plan's
 * monthly payment goes back on the bill from 1 November 2026.
 */
export function restoreStarlingWaterPayment(dataset: Dataset): boolean {
  const water = (dataset.providers as Record<string, any> | undefined)?.water;
  const bill = (dataset.bills ?? []).find((entry) => /^water$/i.test(String(entry.name ?? '')));
  if (!water || !bill) return false;
  const plan = Number(water.paymentBasePence ?? water.monthlyPaymentPence ?? 0);
  if (plan !== WATER_RESUMED_PAYMENT_PENCE) return false;
  // A month with no payment of its own is a carried-forward zero, not a decision:
  // the address is still billed monthly, so the plan's payment is what leaves.
  const november = ((water.statement ?? []) as any[]).find((row) => row.month === 'Nov');
  if (!november || (Number(november.paymentPence) || 0) !== 0 || november.paymentEdited === true) return false;
  const from = '2026-11-01';
  const changes = (dataset.billChanges ??= []);
  const already = changes.some((change) =>
    change.bill === bill.name
    && (change.appliesFrom ?? '') >= from
    && change.amountOverridePence !== null
    && change.amountOverridePence !== undefined);
  if (already) return false;
  changes.push({
    bill: bill.name,
    appliesFrom: from,
    appliesTo: '',
    amountOverridePence: WATER_RESUMED_PAYMENT_PENCE,
    dueDateOverride: '',
    dueDayOverride: null,
    changeType: 'Monthly payment resumed',
    note: 'Account credit used up: the monthly payment resumes on 27/11/2026',
    skip: false,
  });
  return true;
}

/**
 * Align Starling's opening balance with the figures the statement proves.
 *
 * Every leg the balance uses is dated, so a plan that is a fixed amount away
 * from the bank on two different days is not a timing difference: that amount
 * sits before both dates, in the opening balance the anchor starts from. The
 * opening moves by exactly the difference only when both statement figures
 * carry the same one — two days that disagree mean a dated movement is missing,
 * and guessing which would be worse than leaving the opening alone.
 */
export function alignStarlingStatementOpening(
  dataset: Dataset,
  evidence: { date: string; pence: number }[] = STARLING_STATEMENT_EVIDENCE,
): boolean {
  const starling = (dataset.accounts ?? []).find((account) => /^starling$/i.test(String(account.name ?? '')));
  if (!starling || evidence.length === 0) return false;
  const engine = buildEngine(dataset);
  const measured = evidence.map((point) => ({
    ...point,
    balance: engine.starlingBalance(point.date),
  }));
  const offset = measured[0].balance - measured[0].pence;
  if (!offset) return false;
  if (measured.some((point) => point.balance - point.pence !== offset)) return false;
  reconcileAccountOpening(dataset, starling.name, measured[0].date, measured[0].pence, measured[0].balance);
  return true;
}

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
