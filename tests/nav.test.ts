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
  assert.deepEqual(nav[3].items.map((item) => item.id), ['setup', 'statements', 'evidence', 'import', 'rules', 'alerts', 'health', 'settings', 'appChangelog', 'changelog', 'guides']);
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

test('Tools items can be hidden like any other item', () => {
  const ds = dataset({ hidden: ['guides', 'statements', 'health'] });
  const tools = buildNav(ds).find((group) => group.group === 'Tools');
  assert.deepEqual(tools?.items.map((item) => item.id), ['setup', 'evidence', 'import', 'rules', 'alerts', 'settings', 'appChangelog', 'changelog']);
});

test('Tools items can be moved to another section and back', () => {
  const moved = dataset({ groups: { statements: 'Overview', guides: 'Ledger' } });
  assert.equal(groupOf(moved, 'statements'), 'Overview');
  assert.equal(groupOf(moved, 'guides'), 'Ledger');
  const overview = buildNav(moved).find((group) => group.group === 'Overview');
  assert.ok(overview?.items.some((item) => item.id === 'statements'));
  assert.equal(groupOf(dataset(), 'statements'), 'Tools');
});

test('Settings stays visible under Tools even when a layout tries to hide or move it', () => {
  const ds = dataset({ hidden: ['settings', 'guides'], groups: { settings: 'Overview' } });
  assert.equal(groupOf(ds, 'settings'), 'Tools');
  assert.equal(ids(ds).includes('settings'), true);
  assert.equal(ids(ds).includes('guides'), false);
});

test('an item can be moved into Tools', () => {
  const item = defaultNavItems(dataset()).find((entry) => entry.id === 'people');
  assert.ok(item);
  const layout = { groups: { people: 'Tools' } } as ReturnType<typeof navLayout>;
  assert.equal(effectiveGroup(item, layout), 'Tools');
  const tools = buildNav(dataset(layout)).find((group) => group.group === 'Tools');
  assert.equal(tools?.items.some((entry) => entry.id === 'people'), true);
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

test('a hidden page still exists, so a dashboard tile can open it', () => {
  // Hiding an item is a layout preference, not deleting the page: the app's
  // guard keeps a view that exists in defaultNavItems, and only bounces a
  // provider that is really gone.
  const ds = dataset({ hidden: ['debts', 'savings'] });
  assert.equal(ids(ds).includes('debts'), false, 'out of the sidebar');
  assert.equal(defaultNavItems(ds).some((item) => item.id === 'debts'), true, 'still a page');
  assert.equal(defaultNavItems(ds).some((item) => item.id === 'savings'), true);
  assert.equal(defaultNavItems(dataset({}, {})).some((item) => item.id === 'water'), false, 'a removed provider is gone');
});
