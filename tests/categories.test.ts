import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_TAGS,
  categoryOptions,
  normaliseCategory,
  normaliseTags,
  tagOptions,
  tagsText,
  transactionHasTag,
  transactionMatches,
} from '../core/categories.ts';

test('a category is trimmed, bounded and safe for an empty row', () => {
  assert.equal(normaliseCategory('  Food   shopping  '), 'Food shopping');
  assert.equal(normaliseCategory(null), '');
  assert.equal(normaliseCategory('x'.repeat(100)).length, 40);
});

test('tags accept comma or semicolon text, de-duplicate and cap the list', () => {
  assert.deepEqual(normaliseTags('weekly, Tesco; weekly,  fuel '), ['weekly', 'Tesco', 'fuel']);
  assert.deepEqual(normaliseTags(['One', 'one', 'Two']), ['One', 'Two']);
  assert.equal(normaliseTags(Array.from({ length: 20 }, (_, index) => `tag-${index}`)).length, MAX_TAGS);
  assert.equal(tagsText(['a', 'b']), 'a, b');
});

test('options keep the standard categories and add the labels already in use', () => {
  const categories = categoryOptions([{ category: 'Garden' }, { category: 'Food' }, { category: '' }] as any[]);
  assert.ok(categories.includes('Bills'));
  assert.ok(categories.includes('Garden'));
  assert.equal(categories.filter((value) => value === 'Food').length, 1);
  assert.deepEqual(tagOptions([{ tags: ['weekly', 'tesco'] }, { tags: ['Tesco', 'fuel'] }] as any[]), ['fuel', 'tesco', 'weekly']);
});

test('category and tag filters are independent and blank means all', () => {
  const tx = { category: 'Food', tags: ['weekly', 'Tesco'] } as any;
  assert.equal(transactionMatches(tx, {}), true);
  assert.equal(transactionMatches(tx, { category: 'All' }), true);
  assert.equal(transactionMatches(tx, { category: 'Food', tag: 'tesco' }), true);
  assert.equal(transactionMatches(tx, { category: 'Bills' }), false);
  assert.equal(transactionMatches(tx, { tag: 'fuel' }), false);
  assert.equal(transactionHasTag(tx, 'TESCO'), true);
});
