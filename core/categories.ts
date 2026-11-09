/**
 * Transaction categories and free-form tags.
 *
 * The category is a single optional label; tags are a small, de-duplicated
 * list. Neither participates in the calculation engine, so adding or editing
 * them cannot move a balance or rewrite a locked month.
 */
import type { Tx } from './engine.ts';

export const STANDARD_CATEGORIES = [
  'Bills',
  'Housing',
  'Food',
  'Transport',
  'Shopping',
  'Health',
  'Family',
  'Debt',
  'Savings',
  'Entertainment',
  'Income',
  'Transfer',
  'Other',
] as const;

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;
export const MAX_CATEGORY_LENGTH = 40;

export function normaliseCategory(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_CATEGORY_LENGTH);
}

/** Accepts an array or the comma/semicolon-separated text used by the editor. */
export function normaliseTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;]/)
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase('en-GB');
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

export function tagsText(tags: readonly string[] | undefined): string {
  return (tags ?? []).join(', ');
}

export function categoryOptions(transactions: readonly Pick<Tx, 'category'>[]): string[] {
  const seen = new Set<string>();
  for (const category of STANDARD_CATEGORIES) seen.add(category);
  for (const tx of transactions) {
    const category = normaliseCategory(tx.category);
    if (category) seen.add(category);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'en-GB'));
}

export function tagOptions(transactions: readonly Pick<Tx, 'tags'>[]): string[] {
  const seen = new Map<string, string>();
  for (const tx of transactions) {
    for (const tag of normaliseTags(tx.tags)) {
      const key = tag.toLocaleLowerCase('en-GB');
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'en-GB'));
}

export function transactionHasTag(tx: Pick<Tx, 'tags'>, tag: string): boolean {
  const wanted = tag.trim().toLocaleLowerCase('en-GB');
  if (!wanted) return true;
  return normaliseTags(tx.tags).some((entry) => entry.toLocaleLowerCase('en-GB') === wanted);
}

export interface TransactionFilter {
  category?: string;
  tag?: string;
}

/** `All`/blank means no restriction, matching the other ledger filters. */
export function transactionMatches(tx: Tx, filter: TransactionFilter): boolean {
  const category = filter.category && filter.category !== 'All' ? normaliseCategory(filter.category) : '';
  if (category && normaliseCategory(tx.category) !== category) return false;
  const tag = filter.tag && filter.tag !== 'All' ? filter.tag : '';
  return !tag || transactionHasTag(tx, tag);
}
