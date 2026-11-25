/**
 * Link a monthly provider plan to the bill that pays it.
 *
 * Ovo is handled the other way round in core/ovoLink.ts, where the bill owns the
 * payment. The plans here (Water, Park Xmas, Pure Cremation) carry their own
 * schedule — a skipped month, a ramp towards a payoff — so an edit is applied
 * from the month it was made and every later month follows it, while earlier
 * months and anything outside the edited range keep their shape.
 *
 * Pure: no I/O, no clock reads, integer pence only.
 */
import type { Dataset } from './engine.ts';
import { carryForwardProviderYears } from './providerCarry.ts';
import { recalculate, type LedgerSpec } from './providerLedger.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');

export interface PaymentPlan {
  /** The link sheet name the bill carries. */
  sheet: string;
  spec: LedgerSpec;
}

/** Plans whose statement Payment column is the bill's amount, month by month. */
export const PAYMENT_PLANS: Record<string, PaymentPlan> = {
  water: { sheet: 'Water', spec: { rowsKey: 'statement', formula: 'cashflow', monthly: true } },
  parkXmas: { sheet: 'Park Xmas', spec: { rowsKey: 'statement', formula: 'savings', monthly: true } },
  pureCremation: { sheet: 'Pure Cremation', spec: { rowsKey: 'statement', formula: 'cashflow', monthly: true } },
};

const normalise = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** The bill that pays this plan: the one linked to its sheet. */
export function paymentBillFor(dataset: Dataset, key: string) {
  const plan = PAYMENT_PLANS[key];
  if (!plan) return undefined;
  const bills = dataset.bills ?? [];
  return bills.find((bill) => normalise(bill.linkedSheet) === normalise(plan.sheet))
    ?? bills.find((bill) => (bill as any).providerKey === key);
}

function liveYearOf(provider: any, dataset: Dataset): number {
  const stated = Number(provider?.targetYear ?? provider?.year ?? dataset.settings.targetYear);
  return Number.isInteger(stated) && stated > 0 ? stated : dataset.settings.targetYear;
}

/** Every statement row of the plan, with the year it belongs to. */
function yearRows(provider: any, spec: LedgerSpec): { year: number; rows: any[] }[] {
  const blocks: { year: number; rows: any[] }[] = [];
  const statement = provider?.[spec.rowsKey];
  const liveYear = Number(provider?.targetYear ?? provider?.year);
  if (Array.isArray(statement) && Number.isInteger(liveYear)) blocks.push({ year: liveYear, rows: statement });
  for (const [key, block] of Object.entries(provider?.years ?? {})) {
    const year = Number(key);
    const rows = (block as any)?.rows;
    if (Number.isInteger(year) && Array.isArray(rows)) blocks.push({ year, rows });
  }
  return blocks.sort((left, right) => left.year - right.year);
}

/** Re-chain the plan's balances from its live statement close. */
function rechain(provider: any, spec: LedgerSpec, dataset: Dataset) {
  const liveYear = liveYearOf(provider, dataset);
  const statement = Array.isArray(provider?.[spec.rowsKey]) ? provider[spec.rowsKey] : [];
  const opening = Number(provider?.openingBalancePence ?? provider?.ledgerOpeningPence) || 0;
  recalculate(spec, statement, opening);
  carryForwardProviderYears(provider, spec, liveYear, statement, opening);
  for (const block of Object.values(provider?.years ?? {}) as any[]) {
    if (!Array.isArray(block?.rows) || block.rows.length === 0) continue;
    block.closingPence = Number(block.rows[block.rows.length - 1]?.balancePence) || 0;
  }
}

/** The payment for every row from a month onwards. */
function setPaymentFrom(provider: any, spec: LedgerSpec, year: number, month: number, amountPence: number): boolean {
  let changed = false;
  for (const block of yearRows(provider, spec)) {
    if (block.year < year) continue;
    for (const row of block.rows) {
      const index = MONTHS.indexOf(String(row?.month ?? '')) + 1;
      if (index < 1) continue;
      if (block.year === year && index < month) continue;
      if ((Number(row.paymentPence) || 0) === amountPence) continue;
      row.paymentPence = amountPence;
      changed = true;
    }
  }
  return changed;
}

/**
 * Apply an amount typed on either screen from its month onwards.
 *
 * The statement rows are set from that month, and the bill records the same
 * figure as a dated change, so the Bills tab's month grid and its Bill changes
 * table show what the plan shows.
 */
export function applyProviderPayment(dataset: Dataset, key: string, year: number, month: number, amountPence: number): boolean {
  const plan = PAYMENT_PLANS[key];
  const provider = dataset.providers?.[key];
  const bill = paymentBillFor(dataset, key);
  if (!plan || !provider || !bill || !Number.isInteger(year) || month < 1 || month > 12) return false;

  const changed = setPaymentFrom(provider, plan.spec, year, month, amountPence);
  const from = `${year}-${pad(month)}-01`;
  if (!Array.isArray(dataset.billChanges)) dataset.billChanges = [];
  const same = dataset.billChanges.find((change) => change.bill === bill.name
    && change.appliesFrom === from
    && change.amountOverridePence !== null
    && change.amountOverridePence !== undefined);
  if (same) same.amountOverridePence = amountPence;
  else {
    dataset.billChanges.push({
      bill: bill.name,
      appliesFrom: from,
      appliesTo: '',
      amountOverridePence: amountPence,
      dueDateOverride: '',
      dueDayOverride: null,
      changeType: 'Plan payment',
      note: `Typed on the ${plan.sheet} sheet`,
    });
  }
  rechain(provider, plan.spec, dataset);
  return changed;
}

/**
 * Apply the bills' dated changes to their plans.
 *
 * A change made on the Bills tab (added there, or edited in its changes table)
 * is the same instruction as a payment typed on the sheet, so the plan follows
 * it from that month onwards. The bill's own base amount is left to the plan:
 * the plan's row is what a plan-provider bill shows each month.
 */
export function syncProviderPaymentsFromBills(dataset: Dataset): boolean {
  let changed = false;
  for (const key of Object.keys(PAYMENT_PLANS)) {
    const plan = PAYMENT_PLANS[key];
    const provider = dataset.providers?.[key];
    const bill = paymentBillFor(dataset, key);
    if (!provider || !bill) continue;
    const changes = (dataset.billChanges ?? [])
      .filter((change) => change.bill === bill.name
        && change.amountOverridePence !== null
        && change.amountOverridePence !== undefined
        && /^\d{4}-\d{2}-\d{2}$/.test(change.appliesFrom ?? ''))
      .sort((left, right) => left.appliesFrom.localeCompare(right.appliesFrom));
    if (changes.length === 0) continue;
    let touched = false;
    for (const change of changes) {
      const year = Number(change.appliesFrom.slice(0, 4));
      const month = Number(change.appliesFrom.slice(5, 7));
      if (setPaymentFrom(provider, plan.spec, year, month, Number(change.amountOverridePence))) touched = true;
    }
    if (!touched) continue;
    rechain(provider, plan.spec, dataset);
    changed = true;
  }
  return changed;
}
