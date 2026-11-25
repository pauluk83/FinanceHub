/**
 * The Ovo statement's Payment column and the Ovo bill are the same money.
 *
 * The bill is the single source of truth: its base amount and its dated Bill
 * Changes decide what leaves the bank in a month, and the statement's Payment
 * cell is written from it, so a change on the Bills tab (or a bill override)
 * reaches the provider sheet for that month and every month after it. Typing a
 * payment on the statement writes the same figure back as a Bill Change, so the
 * Bills tab follows the sheet in return.
 *
 * Pure: no I/O, no clock reads, integer pence only.
 */
import { buildEngine, type Dataset } from './engine.ts';
import { carryForwardProviderYears } from './providerCarry.ts';
import { recalculate, type LedgerSpec } from './providerLedger.ts';

/** The Ovo statement's shape, shared with the providers screen. */
export const OVO_LEDGER: LedgerSpec = { rowsKey: 'statement', formula: 'cashflow', monthly: true };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => String(value).padStart(2, '0');

/** The bill that pays the Ovo statement: the one linked to the Ovo sheet. */
export function ovoPaymentBill(dataset: Dataset) {
  const bills = dataset.bills ?? [];
  return bills.find((bill) => String(bill.linkedSheet ?? '').trim().toLowerCase() === 'ovo')
    ?? bills.find((bill) => (bill as any).providerKey === 'ovo');
}

/**
 * Make every Ovo statement row's payment the bill's amount for that month.
 *
 * The rows are written, then the balances re-chain from the live statement, so
 * a payment changed on either screen shows the same figures in both places.
 */
export function syncOvoProviderPayments(dataset: Dataset): boolean {
  const provider = dataset.providers?.ovo as any;
  const bill = ovoPaymentBill(dataset);
  if (!provider || !bill) return false;
  const engine = buildEngine(dataset);
  const liveYear = Number(provider.targetYear ?? dataset.settings.targetYear) || dataset.settings.targetYear;

  let changed = false;
  const apply = (rows: any[] | undefined, year: number) => {
    if (!Array.isArray(rows) || !Number.isInteger(year)) return;
    for (const row of rows) {
      const month = MONTHS.indexOf(String(row?.month ?? ''));
      if (month < 0) continue;
      const scheduled = engine.scheduledBills(year, month + 1).find((entry) => entry.name === bill.name);
      const amount = scheduled?.amountPence ?? 0;
      if ((Number(row.paymentPence) || 0) !== amount) {
        row.paymentPence = amount;
        changed = true;
      }
    }
  };

  apply(provider.statement, liveYear);
  for (const [key, block] of Object.entries(provider.years ?? {})) apply((block as any)?.rows, Number(key));
  if (!changed) return false;

  const opening = Number(provider.openingBalancePence ?? provider.ledgerOpeningPence) || 0;
  const statement = Array.isArray(provider.statement) ? provider.statement : [];
  recalculate(OVO_LEDGER, statement, opening);
  carryForwardProviderYears(provider, OVO_LEDGER, liveYear, statement, opening);
  return true;
}

/**
 * Record a payment typed on the Ovo statement as a Bill Change for its month.
 *
 * A change runs from that month onwards, which is what a standing order does,
 * so an edited October sets October and every later month — on the Bills tab as
 * well as the sheet. Editing the same month again updates that one change
 * instead of adding a second.
 */
export function setOvoSheetPayment(dataset: Dataset, year: number, month: number, amountPence: number): boolean {
  const bill = ovoPaymentBill(dataset);
  if (!bill || !Number.isInteger(year) || month < 1 || month > 12) return false;
  const from = `${year}-${pad(month)}-01`;
  if (!Array.isArray(dataset.billChanges)) dataset.billChanges = [];
  const changes = dataset.billChanges;
  const same = changes.find((change) => change.bill === bill.name
    && change.appliesFrom === from
    && change.amountOverridePence !== null
    && change.amountOverridePence !== undefined);
  if (same) {
    same.amountOverridePence = amountPence;
    return true;
  }
  changes.push({
    bill: bill.name,
    appliesFrom: from,
    appliesTo: '',
    amountOverridePence: amountPence,
    dueDateOverride: '',
    dueDayOverride: null,
    changeType: 'Statement payment',
    note: 'Typed on the Ovo statement',
  });
  return true;
}
