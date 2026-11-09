import type { Dataset } from './engine';

export type AuditSection = 'transactions' | 'accounts' | 'people' | 'cards' | 'bills' | 'billChanges';
export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditEntry {
  id: string;
  at: string;
  section: AuditSection;
  action: AuditAction;
  key: string;
  label: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Groups both legs of a transfer so revert and restore are atomic. */
  groupId?: string;
  /** Set when a deleted record has been restored from the trash. */
  restoredAt?: string;
  /** Set when an update or create has been reverted. */
  revertedAt?: string;
}

export interface AuditResult {
  ok: boolean;
  message: string;
}

export interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export const AUDIT_LIMIT = 500;

const AUDIT_SECTIONS: AuditSection[] = [
  'transactions',
  'accounts',
  'people',
  'cards',
  'bills',
  'billChanges',
];

const SECTION_LABELS: Record<AuditSection, string> = {
  transactions: 'Transaction',
  accounts: 'Account',
  people: 'Person',
  cards: 'Card',
  bills: 'Bill',
  billChanges: 'Bill change',
};

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function rowsFor(dataset: Dataset, section: AuditSection): any[] {
  const value = (dataset as unknown as Record<string, unknown>)[section];
  return Array.isArray(value) ? value : [];
}

function keyFor(section: AuditSection, row: Record<string, any>): string {
  if (section === 'transactions') return String(row.row ?? '');
  if (section === 'people') return String(row.shortName ?? '');
  if (section === 'billChanges') {
    return JSON.stringify([row.bill ?? '', row.appliesFrom ?? '', row.appliesTo ?? '', row.changeType ?? '']);
  }
  return String(row.name ?? '');
}

function labelFor(section: AuditSection, row: Record<string, any>): string {
  if (section === 'transactions') {
    const amount = typeof row.amountPence === 'number' ? money.format(row.amountPence / 100) : '—';
    const comment = String(row.comments ?? '').trim();
    return `${row.date ?? '—'} · ${row.account ?? '—'} · ${row.type ?? '—'} ${amount}${comment ? ` · ${comment}` : ''}`;
  }
  if (section === 'people') return String(row.fullName || row.shortName || 'Person');
  if (section === 'billChanges') return `${row.bill ?? 'Bill'} from ${row.appliesFrom ?? '—'}`;
  return String(row.name || SECTION_LABELS[section]);
}

function cloneRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return structuredClone(value) as Record<string, unknown>;
}

function transferGroupId(section: AuditSection, row: Record<string, any>): string | undefined {
  if (section !== 'transactions' || row.budgetTreatment !== 'Transfer') return undefined;
  return `transfer:${row.date ?? ''}:${Number(row.amountPence) || 0}:${row.comments ?? ''}`;
}

/**
 * Compare the mutable record collections between two committed datasets.
 * Generated bill rows are deliberately excluded: the bill engine creates and
 * removes them, and they are not user edits. The limit keeps a large CSV import
 * from replacing the whole history in one save.
 */
export function diffRecords(
  before: Dataset,
  after: Dataset,
  at = new Date().toISOString(),
  limit = AUDIT_LIMIT,
): AuditEntry[] {
  const entries: AuditEntry[] = [];
  let sequence = 0;

  outer: for (const section of AUDIT_SECTIONS) {
    const left = new Map<string, Record<string, any>>();
    const right = new Map<string, Record<string, any>>();
    for (const row of rowsFor(before, section)) {
      if (section === 'transactions' && row.autoBill === true) continue;
      left.set(keyFor(section, row), row);
    }
    for (const row of rowsFor(after, section)) {
      if (section === 'transactions' && row.autoBill === true) continue;
      right.set(keyFor(section, row), row);
    }

    const keys = new Set([...left.keys(), ...right.keys()]);
    for (const key of keys) {
      if (entries.length >= limit) break outer;
      const previous = left.get(key) ?? null;
      const next = right.get(key) ?? null;
      if (previous && next && JSON.stringify(previous) === JSON.stringify(next)) continue;
      const action: AuditAction = previous && next ? 'update' : next ? 'create' : 'delete';
      const sample = next ?? previous;
      if (!sample) continue;
      sequence += 1;
      entries.push({
        id: `audit_${Date.now().toString(36)}_${sequence.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        at,
        section,
        action,
        key,
        label: labelFor(section, sample),
        ...(transferGroupId(section, sample) ? { groupId: transferGroupId(section, sample) } : {}),
        before: action === 'create' ? null : cloneRecord(previous),
        after: action === 'delete' ? null : cloneRecord(next),
      });
    }
  }
  return entries;
}

export function auditEntries(dataset: Dataset): AuditEntry[] {
  return Array.isArray(dataset.audit) ? dataset.audit as AuditEntry[] : [];
}

export function appendAudit(dataset: Dataset, entries: AuditEntry[]): void {
  if (entries.length === 0) return;
  dataset.audit = [...entries, ...auditEntries(dataset)].slice(0, AUDIT_LIMIT);
}

export function recordHistory(dataset: Dataset, section: AuditSection, key: string): AuditEntry[] {
  return auditEntries(dataset).filter((entry) => entry.section === section && entry.key === key);
}

export function deletedTransactions(dataset: Dataset): AuditEntry[] {
  return auditEntries(dataset).filter((entry) =>
    entry.section === 'transactions' && entry.action === 'delete' && !entry.restoredAt,
  );
}

function revertOne(dataset: Dataset, entry: AuditEntry, at: string): AuditResult {
  const rows = rowsFor(dataset, entry.section);
  const index = rows.findIndex((row) => keyFor(entry.section, row) === entry.key);

  if (entry.action === 'create') {
    if (index < 0) return { ok: false, message: 'That record no longer exists.' };
    rows.splice(index, 1);
    entry.revertedAt = at;
    return { ok: true, message: `Reverted the addition of ${entry.label}.` };
  }

  if (entry.action === 'delete') {
    const restored = cloneRecord(entry.before);
    if (!restored) return { ok: false, message: 'The deleted record has no saved copy.' };
    if (entry.section === 'transactions') {
      const row = Number(restored.row);
      if (rows.some((candidate) => Number(candidate.row) === row)) {
        restored.row = Math.max(0, ...rows.map((candidate) => Number(candidate.row) || 0)) + 1;
      }
    } else if (index >= 0) {
      return { ok: false, message: 'A record with that key already exists.' };
    }
    rows.push(restored);
    entry.restoredAt = at;
    return { ok: true, message: `Restored ${entry.label}.` };
  }

  if (index < 0) return { ok: false, message: 'That record no longer exists.' };
  const previous = cloneRecord(entry.before);
  if (!previous) return { ok: false, message: 'The previous version has no saved copy.' };
  rows[index] = previous;
  entry.revertedAt = at;
  return { ok: true, message: `Reverted ${entry.label} to its previous values.` };
}

/**
 * Reverse one audit entry against the live dataset. A transfer entry carries a
 * groupId; both legs are reversed together so a restore cannot leave one leg
 * of a transfer behind. The caller must run this through the normal update
 * boundary so the reversal itself is audited.
 */
export function revertAuditEntry(dataset: Dataset, id: string, at = new Date().toISOString()): AuditResult {
  const entry = auditEntries(dataset).find((candidate) => candidate.id === id);
  if (!entry) return { ok: false, message: 'That history entry is no longer available.' };
  if (entry.revertedAt) return { ok: false, message: 'That change has already been reverted.' };
  if (entry.restoredAt) return { ok: false, message: 'That transaction has already been restored.' };

  const group = entry.groupId
    ? auditEntries(dataset).filter((candidate) => candidate.groupId === entry.groupId && candidate.action === entry.action)
    : [entry];
  if (group.some((candidate) => candidate.revertedAt || candidate.restoredAt)) {
    return { ok: false, message: 'The other leg of that transfer has already been restored or reverted.' };
  }

  const trial = structuredClone(dataset);
  const results: AuditResult[] = [];
  for (const member of group) {
    const target = auditEntries(trial).find((candidate) => candidate.id === member.id);
    if (!target) { results.push({ ok: false, message: 'That history entry is no longer available.' }); break; }
    const result = revertOne(trial, target, at);
    results.push(result);
    if (!result.ok) break;
  }
  const failed = results.find((result) => !result.ok);
  if (failed) return failed;

  for (const section of new Set(group.map((member) => member.section))) {
    (dataset as unknown as Record<string, unknown>)[section] = (trial as unknown as Record<string, unknown>)[section];
  }
  dataset.audit = trial.audit;
  return { ok: true, message: group.length > 1 ? 'Reverted both legs of the transfer.' : results[0]?.message ?? 'Change reverted.' };
}

export function auditFieldChanges(entry: AuditEntry): AuditFieldChange[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...fields]
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

export function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? '' : 's'}` : 'none';
  if (typeof value === 'object') return 'changed';
  if (/Pence$/.test(field) && typeof value === 'number') return money.format(value / 100);
  return String(value);
}
