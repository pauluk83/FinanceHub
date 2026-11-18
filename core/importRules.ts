/**
 * Import rules: merchant normalisation and review-only suggestions.
 *
 * A rule may only set descriptive fields (category, tags) and choose the import
 * account. It deliberately cannot set `budgetTreatment`, because Transfer and
 * Refund rows move totals; the acceptance gate says a rule must never change a
 * balance or a total, so treatment stays a manual decision on the row.
 */
import type { Tx } from './engine.ts';
import { normaliseCategory, normaliseTags } from './categories.ts';

export type RuleField = 'description' | 'account' | 'amount';
export type RuleOperator = 'contains' | 'equals' | 'startsWith' | 'regex' | 'greaterThan' | 'lessThan';

export interface ImportRule {
  id: string;
  /** Optional human label; falls back to the pattern in the UI. */
  label?: string;
  field: RuleField;
  operator: RuleOperator;
  pattern: string;
  /** Lower runs first; ties keep their stored order. */
  priority: number;
  category?: string;
  tags?: string[];
  /** Import the row into this account instead of the one chosen at the top. */
  targetAccount?: string;
  enabled?: boolean;
}

export interface RuleSubject {
  description: string;
  account?: string;
  /** Signed or unsigned pence both work; amount rules compare the absolute value. */
  amountPence?: number;
}

export interface RuleSuggestion {
  rule: ImportRule | null;
  category: string;
  tags: string[];
  targetAccount?: string;
}

export const RULE_FIELDS: { id: RuleField; label: string }[] = [
  { id: 'description', label: 'Description' },
  { id: 'account', label: 'Account' },
  { id: 'amount', label: 'Amount' },
];

export const RULE_OPERATORS: { id: RuleOperator; label: string; fields: RuleField[] }[] = [
  { id: 'contains', label: 'contains', fields: ['description', 'account'] },
  { id: 'equals', label: 'equals', fields: ['description', 'account'] },
  { id: 'startsWith', label: 'starts with', fields: ['description', 'account'] },
  { id: 'regex', label: 'matches regex', fields: ['description', 'account'] },
  { id: 'greaterThan', label: 'is more than', fields: ['amount'] },
  { id: 'lessThan', label: 'is less than', fields: ['amount'] },
];

/**
 * Strip the noise banks add to a description while keeping the merchant:
 * card references, statement dates, long reference numbers and repeated spaces.
 * Four digits or more are removed, so short names such as O2 survive.
 */
export function normaliseMerchant(description: string): string {
  return String(description ?? '')
    .replace(/\b(?:card|visa|mastercard|amex|debit|credit|contactless|pos|atm)\b[^\d]{0,12}\d{2,}\b/gi, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\*{1,}\s*\d{2,}/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '');
}

export function ruleFieldText(rule: ImportRule): string {
  const operator = RULE_OPERATORS.find((entry) => entry.id === rule.operator)?.label ?? rule.operator;
  const pattern = rule.field === 'amount' ? `${Number(rule.pattern) / 100}` : rule.pattern;
  return `${rule.field} ${operator} “${pattern}”`;
}

/**
 * A rule runs over every staged row, so a catastrophic-backtracking pattern
 * such as `(a+)+$` can freeze the page: cost doubles with each character.
 * Nested repetition is refused rather than executed; ordinary anchors,
 * alternation and character classes still work.
 */
export function rulePatternProblem(pattern: string): string | null {
  if (pattern.length > 120) return 'Keep a rule pattern under 120 characters.';
  const stack: boolean[] = [];
  let escaped = false;
  let inClass = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\') { escaped = true; continue; }
    if (inClass) { if (character === ']') inClass = false; continue; }
    if (character === '[') { inClass = true; continue; }
    if (character === '(') { stack.push(false); continue; }
    if (character === ')') {
      const containsQuantifier = stack.pop() ?? false;
      const next = pattern[index + 1];
      const quantified = next === '+' || next === '*' || next === '{';
      if (containsQuantifier && quantified) return 'Nested repetition is not supported; use a simpler pattern.';
      if ((containsQuantifier || quantified) && stack.length > 0) stack[stack.length - 1] = true;
      continue;
    }
    if ((character === '+' || character === '*' || character === '{') && stack.length > 0) {
      stack[stack.length - 1] = true;
    }
  }
  return null;
}

function regexFor(pattern: string): RegExp | null {
  if (rulePatternProblem(pattern)) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

export function ruleMatches(rule: ImportRule, subject: RuleSubject): boolean {
  if (rule.enabled === false) return false;
  const pattern = String(rule.pattern ?? '').trim();
  if (!pattern) return false;

  if (rule.field === 'amount') {
    const target = Number(pattern);
    if (!Number.isFinite(target)) return false;
    const amount = Math.abs(Number(subject.amountPence ?? 0));
    return rule.operator === 'greaterThan' ? amount > target
      : rule.operator === 'lessThan' ? amount < target
        : false;
  }

  const value = rule.field === 'description' ? normaliseMerchant(subject.description) : String(subject.account ?? '');
  if (rule.field === 'account' && !value) return false;

  switch (rule.operator) {
    case 'equals': return value.toLowerCase() === pattern.toLowerCase();
    case 'startsWith': return value.toLowerCase().startsWith(pattern.toLowerCase());
    case 'regex': {
      const expression = regexFor(pattern);
      return expression ? expression.test(value) : false;
    }
    case 'contains': return value.toLowerCase().includes(pattern.toLowerCase());
    default: return false;
  }
}

/** First enabled rule by priority wins; the rest are not merged, so a hit is predictable. */
export function suggestForTransaction(rules: readonly ImportRule[], subject: RuleSubject): RuleSuggestion {
  const ordered = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.enabled !== false)
    .sort((left, right) => (Number(left.rule.priority) || 0) - (Number(right.rule.priority) || 0) || left.index - right.index);

  for (const { rule } of ordered) {
    if (!ruleMatches(rule, subject)) continue;
    return {
      rule,
      category: normaliseCategory(rule.category ?? ''),
      tags: normaliseTags(rule.tags ?? []),
      targetAccount: rule.targetAccount?.trim() || undefined,
    };
  }
  return { rule: null, category: '', tags: [], targetAccount: undefined };
}

export interface RuleTestResult {
  rows: number;
  expensePence: number;
  incomePence: number;
  examples: Tx[];
}

/** Test against the stored log without changing it. */
export function testRule(rule: ImportRule, transactions: readonly Tx[], through?: string): RuleTestResult {
  const matches = transactions.filter((transaction) => {
    if (transaction.autoBill === true) return false;
    if (through && transaction.date > through) return false;
    return ruleMatches(rule, {
      description: transaction.comments,
      account: transaction.account,
      amountPence: transaction.amountPence,
    });
  });
  return {
    rows: matches.length,
    expensePence: matches.filter((transaction) => transaction.type === 'Expense').reduce((sum, transaction) => sum + transaction.amountPence, 0),
    incomePence: matches.filter((transaction) => transaction.type === 'Income').reduce((sum, transaction) => sum + transaction.amountPence, 0),
    examples: matches.slice().sort((left, right) => right.date.localeCompare(left.date)).slice(0, 3),
  };
}

/** A stable, readable id for a rule created from the UI. */
export function newRuleId(existing: readonly ImportRule[]): string {
  let index = existing.length + 1;
  const ids = new Set(existing.map((rule) => rule.id));
  while (ids.has(`rule_${index}`)) index += 1;
  return `rule_${index}`;
}
