import { buildEngine, type Dataset, type Tx } from './engine.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** Budget treatment written on every generated bill entry. */
export const BILL_LOG_TREATMENT = 'Bill';
/** Status written on every generated bill entry. */
export const BILL_LOG_STATUS = 'Auto';

/** Stable identity for one bill in one month, so re-running never duplicates. */
export function billLogKey(billName: string, year: number, month: number): string {
  return `${billName}|${year}-${pad(month)}`;
}

/** The bank account a bill is paid from; blank means the main account. */
export function billLogAccount(ds: Dataset, billName: string): string {
  const primary = ds.settings.primaryAccount || ds.accounts[0]?.name || '';
  return ds.bills.find((b) => b.name === billName)?.account || primary;
}

/**
 * Project scheduled bills into the transaction log on their due date.
 *
 * The bill engine already counts every scheduled bill in the month's expenses and
 * subtracts post-anchor bills from the Starling balance, so these rows are a
 * log-only view of the same money: they carry `autoBill`, `budgetTreatment: 'Bill'`
 * and `starlingPosted: false`, and the engine excludes them from every balance and
 * total. That is what stops a bill being counted twice.
 *
 * Only the current (as-of) month onward is generated, and only bills whose due date
 * has actually arrived; future months appear as the as-of date advances. A manual
 * transaction already matching the bill's date, account and amount suppresses the
 * generated row.
 *
 * Returns true when the dataset changed (mutates `ds.transactions`).
 */
export function syncBillTransactions(ds: Dataset): boolean {
  const asOf = ds.settings.asOfDate;
  if (!asOf) return false;
  const year = ds.settings.targetYear;
  const asOfYear = Number(asOf.slice(0, 4));
  const asOfMonth = Number(asOf.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(asOfYear)) return false;

  const desired = new Map<string, { date: string; amountPence: number; account: string; name: string }>();
  if (asOfYear <= year) {
    const engine = buildEngine(ds);
    for (let month = 1; month <= 12; month++) {
      if (year === asOfYear && month < asOfMonth) continue;
      for (const bill of engine.scheduledBills(year, month)) {
        if (bill.dueDate > asOf || bill.amountPence <= 0) continue;
        const account = billLogAccount(ds, bill.name);
        if (!account) continue;
        desired.set(billLogKey(bill.name, year, month), {
          date: bill.dueDate,
          amountPence: bill.amountPence,
          account,
          name: bill.name,
        });
      }
    }
  }

  const kept: Tx[] = [];
  const present = new Set<string>();
  let changed = false;
  for (const t of ds.transactions) {
    if (t.autoBill !== true) { kept.push(t); continue; }
    const key = t.billKey ?? '';
    const want = desired.get(key);
    if (!want) { changed = true; continue; }
    present.add(key);
    if (t.date !== want.date || t.amountPence !== want.amountPence || t.account !== want.account || t.comments !== want.name) {
      kept.push({ ...t, date: want.date, amountPence: want.amountPence, account: want.account, comments: want.name });
      changed = true;
    } else {
      kept.push(t);
    }
  }

  let nextRow = ds.transactions.reduce((max, t) => Math.max(max, Number(t.row) || 0), 0) + 1;
  for (const [key, want] of desired) {
    if (present.has(key)) continue;
    const manual = kept.some((t) => t.autoBill !== true
      && t.type === 'Expense'
      && t.date === want.date
      && t.account === want.account
      && Math.abs(t.amountPence - want.amountPence) < 1);
    if (manual) continue;
    kept.push({
      row: nextRow++,
      date: want.date,
      account: want.account,
      type: 'Expense',
      amountPence: want.amountPence,
      comments: want.name,
      status: BILL_LOG_STATUS,
      budgetTreatment: BILL_LOG_TREATMENT,
      autoBill: true,
      billKey: key,
      starlingPosted: false,
    });
    changed = true;
  }

  if (changed) ds.transactions = kept;
  return changed;
}
