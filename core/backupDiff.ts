/**
 * Restore-point comparison and section restore.
 *
 * Restoring a whole backup replaces every record. This module answers the two
 * questions an owner actually asks before that: what changed between two points,
 * and can I take back only the part I got wrong? Pure: no I/O, no decryption.
 */
import type { Dataset } from './engine.ts';

export type SectionId =
  | 'accounts'
  | 'people'
  | 'cards'
  | 'bills'
  | 'billChanges'
  | 'transactions'
  | 'incomeSchedules'
  | 'providers'
  | 'debts'
  | 'savings'
  | 'assets'
  | 'holidays'
  | 'monthLocks'
  | 'settings';

export interface SectionDef {
  id: SectionId;
  label: string;
  /** Records are matched by this field; sections without one are compared whole. */
  key?: 'id' | 'name' | 'shortName' | 'month' | 'key';
}

export const BACKUP_SECTIONS: SectionDef[] = [
  { id: 'accounts', label: 'Accounts', key: 'name' },
  { id: 'people', label: 'People', key: 'shortName' },
  { id: 'cards', label: 'Cards', key: 'name' },
  { id: 'bills', label: 'Bills', key: 'name' },
  { id: 'billChanges', label: 'Bill changes', key: 'id' },
  { id: 'transactions', label: 'Transactions', key: 'id' },
  { id: 'incomeSchedules', label: 'Income schedules' },
  { id: 'providers', label: 'Provider ledgers' },
  { id: 'debts', label: 'Debts', key: 'id' },
  { id: 'savings', label: 'Savings', key: 'id' },
  { id: 'assets', label: 'Assets', key: 'id' },
  { id: 'holidays', label: 'Holidays' },
  { id: 'monthLocks', label: 'Month locks', key: 'key' },
  { id: 'settings', label: 'Settings' },
];

/** Settings and month locks carry the budget's anchors, so they are compared but not restorable alone. */
export const RESTORABLE_SECTIONS: SectionId[] = BACKUP_SECTIONS
  .map((section) => section.id)
  .filter((id) => id !== 'settings' && id !== 'monthLocks');

export interface SectionDiff {
  id: SectionId;
  label: string;
  added: number;
  removed: number;
  changed: number;
  same: number;
  /** True when the two points hold the same value for this section. */
  identical: boolean;
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>).sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null) ?? 'null';
};

export function sectionValue(ds: Dataset, id: SectionId): unknown {
  return (ds as unknown as Record<string, unknown>)[id] ?? null;
}

interface RecordMap {
  keyed: Map<string, unknown>;
  unkeyed: unknown[];
}

function recordsOf(value: unknown, key?: SectionDef['key']): RecordMap {
  const keyed = new Map<string, unknown>();
  const unkeyed: unknown[] = [];
  const push = (entry: unknown) => {
    if (key && entry && typeof entry === 'object') {
      const raw = (entry as Record<string, unknown>)[key];
      if (typeof raw === 'string' || typeof raw === 'number') {
        keyed.set(String(raw), entry);
        return;
      }
    }
    unkeyed.push(entry);
  };
  if (Array.isArray(value)) value.forEach(push);
  else if (value && typeof value === 'object') {
    for (const [entryKey, entry] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(entry)) entry.forEach(push);
      else if (key === 'key') push({ key: entryKey, value: entry });
      else push(entry);
    }
  } else if (value !== null && value !== undefined) push(value);
  return { keyed, unkeyed };
}

export function diffDatasets(from: Dataset, to: Dataset): SectionDiff[] {
  return BACKUP_SECTIONS.map((section) => {
    const a = sectionValue(from, section.id);
    const b = sectionValue(to, section.id);
    if (stable(a) === stable(b)) {
      const count = recordsOf(a, section.key);
      return { id: section.id, label: section.label, added: 0, removed: 0, changed: 0, same: count.keyed.size + count.unkeyed.length, identical: true };
    }

    const A = recordsOf(a, section.key);
    const B = recordsOf(b, section.key);
    let added = 0;
    let removed = 0;
    let changed = 0;
    let same = 0;
    for (const [key, entry] of B.keyed) {
      if (!A.keyed.has(key)) added += 1;
      else if (stable(A.keyed.get(key)) !== stable(entry)) changed += 1;
      else same += 1;
    }
    for (const key of A.keyed.keys()) if (!B.keyed.has(key)) removed += 1;

    // A section with no usable key is compared as one value.
    if (A.keyed.size === 0 && B.keyed.size === 0) {
      if (A.unkeyed.length === 0 && B.unkeyed.length > 0) added = B.unkeyed.length;
      else if (B.unkeyed.length === 0 && A.unkeyed.length > 0) removed = A.unkeyed.length;
      else if (stable(A.unkeyed) !== stable(B.unkeyed)) changed = 1;
      same = A.unkeyed.length > 0 && stable(A.unkeyed) === stable(B.unkeyed) ? A.unkeyed.length : 0;
    }

    return { id: section.id, label: section.label, added, removed, changed, same, identical: false };
  });
}

/**
 * The current dataset with only the chosen sections taken from the source.
 * Every other section keeps its live value, so a section restore cannot quietly
 * roll back work the owner did elsewhere.
 */
export function restoreSections(current: Dataset, source: Dataset, ids: readonly SectionId[]): Dataset {
  const next = structuredClone(current);
  for (const id of ids) {
    const def = BACKUP_SECTIONS.find((section) => section.id === id);
    if (!def || !RESTORABLE_SECTIONS.includes(id)) continue;
    const value = sectionValue(source, id);
    if (value === null || value === undefined) delete (next as unknown as Record<string, unknown>)[id];
    else (next as unknown as Record<string, unknown>)[id] = structuredClone(value);
  }
  return next;
}

/** Sections whose records actually differ, newest first by size of change. */
export function changedSections(diff: readonly SectionDiff[]): SectionDiff[] {
  return diff
    .filter((section) => !section.identical)
    .sort((a, b) => (b.added + b.removed + b.changed) - (a.added + a.removed + a.changed));
}
