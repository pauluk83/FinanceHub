import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_BASICS, USER_GUIDE } from '../app/src/userGuide.ts';
import { defaultNavItems } from '../app/src/nav.ts';
import type { Dataset } from '../core/engine.ts';

const PROVIDERS = {
  rent: {},
  water: {},
  councilTax: {},
  parkXmas: {},
  pureCremation: {},
  ovo: {},
  o2: {},
  virgin: {},
};

const dataset = { settings: { navLayout: undefined }, providers: PROVIDERS } as unknown as Dataset;

test('every sidebar entry has a guide chapter of its own', () => {
  const guideIds = new Set(USER_GUIDE.map((entry) => entry.id));
  for (const item of defaultNavItems(dataset)) {
    assert.ok(guideIds.has(item.id), `missing user-guide chapter for ${item.id}`);
  }
});

test('guide chapters are unique and carry real content', () => {
  const all = [...GUIDE_BASICS, ...USER_GUIDE];
  assert.equal(new Set(all.map((entry) => entry.id)).size, all.length);
  for (const entry of all) {
    assert.ok(entry.title.trim().length > 0, `${entry.id} needs a title`);
    assert.ok(entry.summary.trim().length > 20, `${entry.id} needs a summary`);
    assert.ok(entry.steps.length >= 2, `${entry.id} needs at least two steps`);
  }
});
