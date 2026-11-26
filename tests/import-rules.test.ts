import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeSuggestion,
  normaliseMerchant,
  ruleMatches,
  rulePatternProblem,
  suggestForTransaction,
  testRule,
  type ImportRule,
} from '../core/importRules.ts';
import type { Tx } from '../core/engine.ts';

const rule = (overrides: Partial<ImportRule> = {}): ImportRule => ({
  id: 'rule_1',
  field: 'description',
  operator: 'contains',
  pattern: 'TESCO',
  priority: 10,
  category: 'Food',
  tags: ['weekly', 'groceries'],
  enabled: true,
  ...overrides,
});

const tx = (overrides: Partial<Tx> = {}): Tx => ({
  row: 1,
  date: '2026-11-10',
  account: 'Current',
  type: 'Expense',
  amountPence: 2_500,
  comments: 'Tesco weekly shop',
  status: '',
  budgetTreatment: '',
  ...overrides,
});

test('merchant normalisation removes card references, dates and long numbers', () => {
  assert.equal(normaliseMerchant('TESCO STORES 3245 12/11 CARD 1234'), 'TESCO STORES');
  assert.equal(normaliseMerchant('O2 447700900123'), 'O2');
  assert.equal(normaliseMerchant('  COSTA   COFFEE  '), 'COSTA COFFEE');
  assert.equal(normaliseMerchant('VISA PAYMENT 4321'), '');
});

test('the first enabled rule by priority wins and provides category and tags', () => {
  const rules = [
    rule({ id: 'later', priority: 20, category: 'Shopping' }),
    rule({ id: 'first', priority: 5, category: 'Food', tags: ['weekly'] }),
    rule({ id: 'disabled', priority: 1, enabled: false, category: 'Never' }),
  ];
  const suggestion = suggestForTransaction(rules, { description: 'Tesco 3245' });
  assert.equal(suggestion.rule?.id, 'first');
  assert.equal(suggestion.category, 'Food');
  assert.deepEqual(suggestion.tags, ['weekly']);
});

test('no rule means no suggestion, so nothing is written implicitly', () => {
  const suggestion = suggestForTransaction([rule({ pattern: 'ALDI' })], { description: 'Tesco' });
  assert.equal(suggestion.rule, null);
  assert.equal(suggestion.category, '');
  assert.deepEqual(suggestion.tags, []);
});

test('a rule fills a blank entry form and leaves a typed category alone', () => {
  const suggestion = suggestForTransaction([rule({ pattern: 'Tesco', category: 'Food', tags: ['weekly'] })], {
    description: 'Tesco 3245',
  });
  const blank = mergeSuggestion({ category: '', tags: '' }, suggestion);
  assert.equal(blank.category, 'Food');
  assert.equal(blank.tags, 'weekly');
  assert.equal(blank.autoCategory, 'Food');

  const typed = mergeSuggestion({ category: 'Shopping', tags: 'gift' }, suggestion);
  assert.equal(typed.category, 'Shopping');
  assert.equal(typed.tags, 'gift');
  assert.equal(typed.autoCategory, '');
  assert.equal(typed.autoTags, '');

  // A value an earlier rule supplied is replaceable; a typed one is not.
  const reRun = mergeSuggestion({ category: 'Food', tags: 'weekly' }, suggestion, { category: 'Food', tags: 'weekly' });
  assert.equal(reRun.category, 'Food');
  assert.equal(reRun.autoCategory, 'Food');
});

test('amount rules compare the absolute value and ignore invalid patterns', () => {
  const over = rule({ field: 'amount', operator: 'greaterThan', pattern: '1000' });
  assert.equal(ruleMatches(over, { description: '', amountPence: 1_500 }), true);
  assert.equal(ruleMatches(over, { description: '', amountPence: -1_500 }), true);
  assert.equal(ruleMatches(over, { description: '', amountPence: 500 }), false);

  const invalid = rule({ operator: 'regex', pattern: '[' });
  assert.equal(ruleMatches(invalid, { description: 'anything' }), false);
});

test('account rules match the account name and can redirect the import', () => {
  const redirect = rule({ field: 'account', operator: 'equals', pattern: 'Current', targetAccount: 'Bills' });
  const suggestion = suggestForTransaction([redirect], { description: 'Anything', account: 'Current' });
  assert.equal(suggestion.rule?.id, 'rule_1');
  assert.equal(suggestion.targetAccount, 'Bills');
});

test('testing a rule counts matches, money and examples without changing the log', () => {
  const transactions = [
    tx({ row: 1, date: '2026-11-01', amountPence: 1_000 }),
    tx({ row: 2, date: '2026-11-05', amountPence: 2_000 }),
    tx({ row: 3, date: '2026-11-06', amountPence: 3_000, type: 'Income', comments: 'Tesco refund' }),
    tx({ row: 4, date: '2026-11-07', comments: 'ALDI' }),
    tx({ row: 5, date: '2026-11-08', comments: 'Tesco', autoBill: true }),
  ];
  const result = testRule(rule(), transactions, '2026-11-30');

  assert.equal(result.rows, 3, 'auto-bill rows are not counted');
  assert.equal(result.expensePence, 3_000);
  assert.equal(result.incomePence, 3_000);
  assert.deepEqual(result.examples.map((entry) => entry.row), [3, 2, 1]);
});

test('nested regex repetition is refused instead of freezing the page', () => {
  assert.ok(rulePatternProblem('(a+)+$'));
  assert.ok(rulePatternProblem('((a+))+$'));
  assert.ok(rulePatternProblem('(ab*){2,}'));
  assert.ok(rulePatternProblem('a'.repeat(121)), 'over-long patterns are refused');
  assert.equal(rulePatternProblem('^TESCO.*$'), null);
  assert.equal(rulePatternProblem('(TESCO|ALDI)'), null);
  assert.equal(rulePatternProblem('(\\d{2,3})'), null);

  const unsafe = rule({ operator: 'regex', pattern: '(a+)+$' });
  const started = Date.now();
  assert.equal(ruleMatches(unsafe, { description: `${'a'.repeat(40)}!` }), false);
  assert.ok(Date.now() - started < 50, 'the pattern is never executed');
});
