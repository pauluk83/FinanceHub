/**
 * One-click repairs for the dead records the read-only health checks report.
 *
 * A fix is only offered when the repair is deterministic: the record is already
 * inert, so removing or unlinking it cannot move a balance, a bill total or a
 * statement figure. Anything that needs a judgement call (an unknown account, a
 * duplicate, a locked-month drift, a provider ledger that is merely hidden) stays
 * a finding the owner reviews by hand.
 *
 * Both functions are pure: `buildHealthFixPlan` only reads, and
 * `applyHealthFixPlan` edits the draft the caller already cloned, so the normal
 * save path records the budget changelog entry and the per-record audit.
 */
import type { BillSheet, Dataset } from './engine.ts';

export type HealthFixKind = 'remove-bill-change' | 'clear-bill-link' | 'remove-generated-row';

export interface HealthFixChange {
  kind: HealthFixKind;
  /** The record being repaired, e.g. "Water · Sep 2026". */
  label: string;
  before: string;
  after: string;
}

export interface HealthFix {
  /** The read-only check this fix clears. */
  id: string;
  title: string;
  summary: string;
  changes: HealthFixChange[];
}

export interface HealthFixPlan {
  fixes: HealthFix[];
  /** Total rows the apply step would touch. */
  changeCount: number;
}

export interface HealthFixOptions {
  /** The link sheets the bill editor offers, including historical names. */
  sheets?: readonly BillSheet[];
}

function money(pence: number): string {
  return `${pence < 0 ? '-' : ''}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function billNames(ds: Dataset): Set<string> {
  return new Set(ds.bills.map((bill) => bill.name));
}

/** Bill changes whose bill is no longer in the budget: dead metadata that cannot affect a schedule. */
function orphanedBillChanges(ds: Dataset): Dataset['billChanges'] {
  const names = billNames(ds);
  return (ds.billChanges ?? []).filter((change) => !names.has(change.bill));
}

/**
 * Bills linked to a link sheet that no longer exists at all.
 *
 * A sheet that still exists but whose provider ledger is hidden is left alone:
 * hiding a ledger keeps its data and the link is expected to survive, so that
 * finding stays a manual review.
 */
function orphanedBillLinks(ds: Dataset, sheets: readonly BillSheet[]): Dataset['bills'] {
  const known = new Set(sheets.map((sheet) => sheet.name.trim()));
  return ds.bills.filter((bill) => {
    const name = bill.linkedSheet?.trim();
    return Boolean(name) && !known.has(name as string);
  });
}

/**
 * Generated bill-log rows left behind by a bill that no longer exists.
 *
 * These rows are a log-only view of the scheduled bill (`autoBill`,
 * `budgetTreatment: 'Bill'`, `starlingPosted: false`), and the engine excludes
 * them from every balance and total, so deleting one changes no figure. Rows for
 * a bill that still exists are owned by the bill sync and are never touched.
 */
function orphanedGeneratedRows(ds: Dataset): Dataset['transactions'] {
  const names = [...billNames(ds)];
  return ds.transactions.filter((transaction) => {
    if (transaction.autoBill !== true) return false;
    const key = transaction.billKey ?? '';
    if (!key) return true;
    return !names.some((name) => key.startsWith(`${name}|`));
  });
}

function removeGeneratedRows(ds: Dataset): number {
  const orphans = new Set(orphanedGeneratedRows(ds));
  if (!orphans.size) return 0;
  ds.transactions = ds.transactions.filter((transaction) => !orphans.has(transaction));
  return orphans.size;
}

export function buildHealthFixPlan(ds: Dataset, options: HealthFixOptions = {}): HealthFixPlan {
  const fixes: HealthFix[] = [];

  const changes = orphanedBillChanges(ds);
  if (changes.length) {
    fixes.push({
      id: 'bill-changes',
      title: 'Remove bill changes with no bill',
      summary: 'These changes point at a bill that is no longer in the budget, so they cannot affect any schedule.',
      changes: changes.map((change) => ({
        kind: 'remove-bill-change',
        label: change.bill,
        before: `${change.appliesFrom || 'no start'} to ${change.appliesTo || 'no end'}${change.amountOverridePence === undefined || change.amountOverridePence === null ? '' : ` · ${money(change.amountOverridePence)}`}`,
        after: 'Removed',
      })),
    });
  }

  const links = orphanedBillLinks(ds, options.sheets ?? []);
  if (links.length) {
    fixes.push({
      id: 'bill-links',
      title: 'Unlink bills from missing link sheets',
      summary: 'The link sheet these bills name no longer exists, so the bill cannot read a provider statement or payment history.',
      changes: links.map((bill) => ({
        kind: 'clear-bill-link',
        label: bill.name,
        before: `Linked to “${bill.linkedSheet.trim()}”`,
        after: 'No link sheet',
      })),
    });
  }

  const orphans = orphanedGeneratedRows(ds);
  if (orphans.length) {
    const total = orphans.reduce((sum, row) => sum + row.amountPence, 0);
    fixes.push({
      id: 'generated-bill-rows',
      title: 'Remove generated bill rows for deleted bills',
      summary: 'The bill log wrote these rows for a bill that has since been removed. They are log-only and no balance or total counts them.',
      changes: orphans.map((row) => ({
        kind: 'remove-generated-row',
        label: `${row.billKey?.split('|')[0] ?? 'Bill'} · ${row.date}`,
        before: `${money(row.amountPence)} on ${row.account}`,
        after: 'Removed',
      })),
    });
    // A single summary line follows the detail so a long log stays readable.
    fixes[fixes.length - 1].summary += ` ${orphans.length} row${orphans.length === 1 ? '' : 's'} · ${money(total)} in total.`;
  }

  return {
    fixes,
    changeCount: fixes.reduce((sum, fix) => sum + fix.changes.length, 0),
  };
}

/**
 * Apply every offered repair to a draft dataset. Returns the number of records
 * changed. Recomputes the plan from the draft, so a stale preview can never
 * remove something that has since become valid, and a second run applies nothing.
 */
export function applyHealthFixPlan(ds: Dataset, options: HealthFixOptions = {}): number {
  const names = billNames(ds);
  let applied = 0;

  const changes = (ds.billChanges ?? []).filter((change) => !names.has(change.bill));
  if (changes.length) {
    ds.billChanges = (ds.billChanges ?? []).filter((change) => names.has(change.bill));
    applied += changes.length;
  }

  for (const bill of orphanedBillLinks(ds, options.sheets ?? [])) {
    bill.linkedSheet = '';
    applied += 1;
  }

  applied += removeGeneratedRows(ds);
  return applied;
}
