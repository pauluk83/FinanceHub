import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_GROUPS, buildNav, defaultNavItems, effectiveGroup, navLayout } from '../app/src/nav.ts';
import type { Dataset } from '../core/engine.ts';

const PROVIDERS = {
  rent: { entries: [] },
  water: { statement: [] },
  councilTax: { entries: [] },
  o2: { statement: [] },
};

const dataset = (navLayout?: unknown, providers: Record<string, any> = PROVIDERS) =>
  ({ settings: { navLayout }, providers } as unknown as Dataset);

const ids = (ds: Dataset, options?: { hideSetup?: boolean }) =>
  buildNav(ds, options).flatMap((group) => group.items.map((item) => item.id));

const groupOf = (ds: Dataset, id: string) =>
  buildNav(ds).find((group) => group.items.some((item) => item.id === id))?.group;

test('the default sidebar keeps the expected group order and provider order', () => {
  const nav = buildNav(dataset());
  assert.deepEqual(nav.map((group) => group.group), ['Overview', 'Ledger', 'Providers', 'Tools']);
  assert.deepEqual(nav[2].items.map((item) => item.id), ['rent', 'water', 'councilTax', 'o2']);
  assert.deepEqual(nav[3].items.map((item) => item.id), ['setup', 'statements', 'import', 'health', 'settings', 'appChangelog', 'changelog', 'guides']);
});

test('a hidden item leaves the sidebar and the palette list', () => {
  const ds = dataset({ hidden: ['people'] });
  assert.equal(ids(ds).includes('people'), false);
  assert.equal(ids(ds).includes('accounts'), true);
});

test('an item can be moved to another section and back', () => {
  const ds = dataset({ groups: { people: 'Overview' } });
  assert.equal(groupOf(ds, 'people'), 'Overview');
  assert.equal(groupOf(dataset(), 'people'), 'Ledger');
});

test('Tools is static: its items cannot be hidden or moved', () => {
  const ds = dataset({ hidden: ['settings', 'guides'], groups: { settings: 'Overview', guides: 'Ledger' } });
  const nav = buildNav(ds);
  const tools = nav.find((group) => group.group === 'Tools');
  assert.deepEqual(tools?.items.map((item) => item.id), ['setup', 'statements', 'import', 'health', 'settings', 'appChangelog', 'changelog', 'guides']);
  assert.equal(groupOf(ds, 'settings'), 'Tools');
  assert.equal(groupOf(ds, 'guides'), 'Tools');
});

test('a group target of Tools is ignored for movable items', () => {
  const item = defaultNavItems(dataset()).find((entry) => entry.id === 'people');
  assert.ok(item);
  const layout = { groups: { people: 'Tools' } } as ReturnType<typeof navLayout>;
  assert.equal(effectiveGroup(item, layout), 'Ledger');
});

test('an unknown section falls back to the default group', () => {
  const item = defaultNavItems(dataset()).find((entry) => entry.id === 'bills');
  assert.ok(item);
  assert.equal(effectiveGroup(item, { groups: { bills: 'Nonsense' } }), 'Ledger');
});

test('a disabled provider loses its sidebar item and custom names are used', () => {
  const hidden = dataset(undefined, { ...PROVIDERS, rent: { entries: [], enabled: false }, water: { statement: [], displayName: 'Thames Water' } });
  assert.equal(ids(hidden).includes('rent'), false);
  const nav = buildNav(hidden);
  const providers = nav.find((group) => group.group === 'Providers');
  assert.equal(providers?.items.find((item) => item.id === 'water')?.label, 'Thames Water');
});

test('the setup item can be hidden once the budget has data', () => {
  assert.equal(ids(dataset()).includes('setup'), true);
  assert.equal(ids(dataset(), { hideSetup: true }).includes('setup'), false);
});

test('every group name is known', () => {
  assert.deepEqual([...NAV_GROUPS], ['Overview', 'Ledger', 'Providers', 'Tools']);
});
