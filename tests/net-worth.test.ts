import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { netWorth, netWorthTrend, ownedValuePence, type Asset } from '../core/assets.ts';

function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    settings: {
      targetYear: 2026,
      startMonth: 1,
      currency: '£',
      monthsInYear: 12,
      asOfDate: '2026-11-10',
      lockCutoff: '2026-11-01',
      anchorDate: '2026-11-01',
      primaryAccount: 'Current',
    },
    accounts: [{ name: 'Current', targetPence: 0, openingPence: 100_000, sortOrder: 1, active: true }],
    people: [],
    cards: [{ name: 'Card', limitPence: 200_000, openingPence: 50_000, sortOrder: 1, active: true }],
    bills: [],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [],
    providers: {},
    debts: [{ id: 'debt_1', name: 'Loan', balancePence: 30_000, monthlyPaymentPence: 5_000, active: true }],
    savings: [{ id: 'sav_1', name: 'ISA', balancePence: 200_000, active: true }],
    assets: [],
    ...overrides,
  };
}

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset_1',
  name: 'Home',
  kind: 'property',
  valuePence: 300_000_00,
  ownershipPct: 50,
  includeInNetWorth: true,
  active: true,
  ...overrides,
});

test('net worth is accounts + savings + assets − cards − debts', () => {
  const ds = dataset({ assets: [asset()] });
  const worth = netWorth(ds, buildEngine(ds), ds.settings.asOfDate);

  assert.equal(worth.accountsPence, 100_000);
  assert.equal(worth.savingsPence, 200_000);
  assert.equal(worth.assetsPence, 15_000_000);
  assert.equal(worth.cardsPence, 50_000);
  assert.equal(worth.debtsPence, 30_000);
  assert.equal(worth.netPence, 100_000 + 200_000 + 15_000_000 - 50_000 - 30_000);
});

test('ownership percentage applies before the total and is bounded', () => {
  assert.equal(ownedValuePence(asset({ valuePence: 100_000, ownershipPct: 25 })), 25_000);
  assert.equal(ownedValuePence(asset({ valuePence: 100_000, ownershipPct: 150 })), 100_000);
  assert.equal(ownedValuePence(asset({ valuePence: 100_000, ownershipPct: -10 })), 0);
});

test('excluded accounts, savings and assets leave the total without being deleted', () => {
  const ds = dataset({
    assets: [asset({ includeInNetWorth: false })],
    accounts: [{ name: 'Current', targetPence: 0, openingPence: 100_000, sortOrder: 1, active: true, excludeFromNetWorth: true }],
    savings: [{ id: 'sav_1', name: 'ISA', balancePence: 200_000, active: true, excludeFromNetWorth: true }],
  });
  const worth = netWorth(ds, buildEngine(ds), ds.settings.asOfDate);

  assert.equal(worth.accountsPence, 0);
  assert.equal(worth.savingsPence, 0);
  assert.equal(worth.assetsPence, 0);
  assert.equal(worth.netPence, -80_000);
  assert.deepEqual(worth.excluded.sort(), ['Current', 'Home', 'ISA']);
});

test('with no assets, savings or debts the net figure is the existing account-minus-card total', () => {
  const ds = dataset({ savings: [], debts: [], assets: [] });
  const engine = buildEngine(ds);
  const worth = netWorth(ds, engine, ds.settings.asOfDate);
  const dashboard = engine.dashboard(2026, 11);

  assert.equal(worth.netPence, dashboard.totalAccountBalancePence - dashboard.cardBalancePence);
});

test('the trend uses recorded locks and never invents assets for an old lock', () => {
  const ds = dataset({
    assets: [asset({ valuePence: 100_000, ownershipPct: 100 })],
    monthLocks: {
      '2026-09': {
        lockedAt: '2026-09-30T00:00:00Z',
        incomePence: 0,
        expensesPence: 0,
        netPence: 0,
        owedPence: 0,
        accounts: [{ name: 'Current', balancePence: 90_000 }],
        cards: [{ name: 'Card', balancePence: 40_000 }],
        people: [],
      },
    },
  });
  const points = netWorthTrend(ds, buildEngine(ds), ds.settings.asOfDate);
  const old = points.find((point) => point.key === '2026-09');
  assert.ok(old);
  assert.equal(old.complete, false, 'a lock without savings/debts/assets is partial');
  assert.equal(old.assetsPence, 0, 'no asset value is backfilled');
  assert.equal(old.netPence, 50_000);

  const live = points.find((point) => point.key === '2026-11');
  assert.ok(live);
  assert.equal(live.source, 'live');
  assert.equal(live.assetsPence, 100_000);
});

test('a new lock records savings, debts and assets for the trend', () => {
  const ds = dataset({
    assets: [asset({ valuePence: 100_000, ownershipPct: 100 })],
    monthLocks: {
      '2026-10': {
        lockedAt: '2026-10-31T00:00:00Z',
        incomePence: 0,
        expensesPence: 0,
        netPence: 0,
        owedPence: 0,
        accounts: [{ name: 'Current', balancePence: 90_000 }],
        cards: [{ name: 'Card', balancePence: 40_000 }],
        people: [],
        savings: [{ name: 'ISA', balancePence: 200_000 }],
        debts: [{ name: 'Loan', balancePence: 30_000 }],
        assets: [{ name: 'Home', valuePence: 100_000 }],
      },
    },
  });
  const point = netWorthTrend(ds, buildEngine(ds), ds.settings.asOfDate).find((entry) => entry.key === '2026-10');
  assert.ok(point);
  assert.equal(point.complete, true);
  assert.equal(point.netPence, 90_000 + 200_000 + 100_000 - 40_000 - 30_000);
});
