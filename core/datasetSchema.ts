/**
 * A-07/A-08: schema repair for the saved document.
 *
 * A budget can be damaged by a partial write, an old build or a hand-edited
 * backup. Refusing to open it blanks the app; overwriting it loses data. This
 * repairs the shape instead: missing collections become empty, unreadable rows
 * are dropped and reported, and every value that is already usable is left
 * exactly as it was. The engine never sees a null row.
 */
import type { Dataset } from './engine.ts';

export interface RepairResult {
  dataset: Dataset;
  /** Human-readable repairs, safe to store on the document and show in Data health. */
  repairs: string[];
}

const ARRAY_KEYS = [
  'accounts', 'people', 'cards', 'bills', 'billChanges', 'transactions',
  'debts', 'savings', 'assets', 'importRules', 'importBatches',
  'recurringDismissed', 'csvProfiles', 'categories', 'changelog', 'audit',
] as const;

const RECORD_KEYS = ['holidays', 'providers', 'monthLocks'] as const;

const PROVIDER_ROWS_KEYS = ['statement', 'entries'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function dropUnreadable(rows: unknown[]): { rows: any[]; dropped: number } {
  const kept = rows.filter(isRecord);
  return { rows: kept, dropped: rows.length - kept.length };
}

export function repairDataset(value: unknown): RepairResult | null {
  if (!isRecord(value) || !isRecord(value.settings)) return null;
  const dataset = structuredClone(value) as Record<string, any>;
  const repairs: string[] = [];

  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(dataset[key])) {
      dataset[key] = [];
      repairs.push(`${key} was missing and was reset to an empty list`);
      continue;
    }
    const { rows, dropped } = dropUnreadable(dataset[key]);
    if (dropped > 0) {
      dataset[key] = rows;
      repairs.push(`${dropped} unreadable ${key} row${dropped === 1 ? '' : 's'} were removed`);
    }
  }

  for (const key of RECORD_KEYS) {
    if (!isRecord(dataset[key])) {
      dataset[key] = {};
      repairs.push(`${key} was missing and was reset to an empty map`);
    }
  }

  const settings = dataset.settings;
  if (!Number.isFinite(settings.targetYear)) {
    settings.targetYear = new Date().getFullYear();
    repairs.push('the target year was unreadable and was reset');
  }
  if (!Number.isFinite(settings.monthsInYear) || settings.monthsInYear < 1 || settings.monthsInYear > 12) {
    settings.monthsInYear = 12;
    repairs.push('monthsInYear was unreadable and was reset to 12');
  }
  if (typeof settings.currency !== 'string' || !settings.currency) {
    settings.currency = '£';
    repairs.push('the currency was unreadable and was reset to £');
  }
  for (const field of ['asOfDate', 'lockCutoff', 'anchorDate'] as const) {
    if (typeof settings[field] !== 'string' || !DATE.test(settings[field])) {
      settings[field] = new Date().toISOString().slice(0, 10);
      repairs.push(`${field} was unreadable and was reset to today`);
    }
  }

  // A provider must be an object with readable row arrays; a broken one is
  // removed rather than left for the engine to dereference.
  for (const [key, provider] of Object.entries(dataset.providers)) {
    if (!isRecord(provider)) {
      delete dataset.providers[key];
      repairs.push(`provider ${key} was unreadable and was removed`);
      continue;
    }
    for (const rowsKey of PROVIDER_ROWS_KEYS) {
      if (provider[rowsKey] === undefined) continue;
      if (!Array.isArray(provider[rowsKey])) {
        provider[rowsKey] = [];
        repairs.push(`provider ${key} ${rowsKey} was unreadable and was reset`);
        continue;
      }
      const { rows, dropped } = dropUnreadable(provider[rowsKey]);
      if (dropped > 0) {
        provider[rowsKey] = rows;
        repairs.push(`${dropped} unreadable ${key} ${rowsKey} row${dropped === 1 ? '' : 's'} were removed`);
      }
    }
  }

  // Rows the engine dereferences directly must carry the fields it reads. A
  // missing row number is repairable — dropping a readable payment would lose
  // real spending — so only rows without a date, account or amount go.
  const readable = dataset.transactions.filter((transaction: any) => (
    DATE.test(String(transaction.date ?? ''))
    && typeof transaction.account === 'string'
    && transaction.account !== ''
    && Number.isFinite(transaction.amountPence)
  ));
  if (readable.length !== dataset.transactions.length) {
    repairs.push(`${dataset.transactions.length - readable.length} transaction row(s) lacked a date, account or amount and were removed`);
  }
  const usedRows = new Set<number>();
  const needsNumber: any[] = [];
  let highestRow = 0;
  for (const transaction of readable) {
    const row = transaction.row;
    if (Number.isInteger(row) && row > 0 && !usedRows.has(row)) {
      usedRows.add(row);
      highestRow = Math.max(highestRow, row);
      continue;
    }
    // Missing, non-integer or duplicated: give it a fresh number below.
    needsNumber.push(transaction);
  }
  let nextRow = highestRow + 1;
  for (const transaction of needsNumber) {
    while (usedRows.has(nextRow)) nextRow += 1;
    transaction.row = nextRow;
    usedRows.add(nextRow);
    nextRow += 1;
  }
  if (needsNumber.length > 0) {
    repairs.push(`${needsNumber.length} transaction row(s) had no usable row number and were numbered instead of removed`);
  }
  if (readable.length !== dataset.transactions.length) dataset.transactions = readable;

  const bills = dataset.bills.filter((bill: any) => typeof bill.name === 'string' && bill.name !== '');
  if (bills.length !== dataset.bills.length) {
    repairs.push(`${dataset.bills.length - bills.length} bill(s) without a name were removed`);
    dataset.bills = bills;
  }

  if (repairs.length) {
    const meta = isRecord(dataset.meta) ? dataset.meta : {};
    const earlier = Array.isArray(meta.schemaRepairs) ? meta.schemaRepairs : [];
    dataset.meta = { ...meta, schemaRepairs: [...earlier, ...repairs].slice(-20) };
  }

  return { dataset: dataset as Dataset, repairs };
}
