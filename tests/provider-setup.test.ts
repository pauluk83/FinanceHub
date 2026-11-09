import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderPlanEntries,
  buildProviderYearPlan,
  isProviderEnabled,
  newProviderData,
  providerBilling,
  providerBillingAmount,
  providerYearPlanTotal,
  mergeProviderPlanRows,
  withoutProviderPlanRows,
  providerDisplayName,
  providerFieldProblem,
  providerLogoDataProblem,
  providerLogoFileProblem,
  providerMeta,
  readProviderField,
  writeProviderField,
} from '../app/src/providerSetup.ts';
import type { Dataset } from '../core/engine.ts';

const dataset = (providers: Record<string, any>) => ({ providers, settings: {} } as unknown as Dataset);

test('a provider is active only when its ledger exists and is not hidden', () => {
  assert.equal(isProviderEnabled(dataset({}), 'water'), false);
  assert.equal(isProviderEnabled(dataset({ water: { statement: [] } }), 'water'), true);
  assert.equal(isProviderEnabled(dataset({ water: { statement: [], enabled: false } }), 'water'), false);
  assert.equal(isProviderEnabled(dataset({ water: { statement: [], enabled: true } }), 'water'), true);
});

test('a custom provider name overrides the default and blank names fall back', () => {
  assert.equal(providerDisplayName(dataset({}), 'water'), 'Water');
  assert.equal(providerDisplayName(dataset({ water: { displayName: '  Thames  ' } }), 'water'), 'Thames');
  assert.equal(providerDisplayName(dataset({ water: { displayName: '   ' } }), 'water'), 'Water');
});

test('a blank provider has the ledger shape its view needs', () => {
  const rent = newProviderData('rent', 2026);
  assert.ok(rent);
  assert.equal(rent.enabled, true);
  assert.deepEqual(rent.entries, []);
  const water = newProviderData('water', 2026);
  assert.ok(water);
  assert.deepEqual(water.statement, []);
  const o2 = newProviderData('o2', 2026);
  assert.ok(o2);
  assert.deepEqual(o2.contract.tiers, []);
  assert.equal(newProviderData('unknown', 2026), null);
  assert.ok(providerMeta('virgin'));
});

test('provider billing defaults safely and clamps the payment day', () => {
  assert.deepEqual(providerBilling({}), {
    billPence: 0, monthlyPence: 0, paymentDay: 1, account: '', contractDetails: '', recurring: false,
  });
  const billing = providerBilling({
    paymentDay: 31,
    billing: { billPence: 4500, monthlyPence: 0, contractDetails: '12 months, ref A1', recurring: true },
  });
  assert.equal(billing.paymentDay, 28);
  assert.equal(billing.contractDetails, '12 months, ref A1');
  assert.equal(billing.recurring, true);
  assert.equal(providerBillingAmount(billing), 4500, 'an empty monthly payment falls back to the bill');
  assert.equal(providerBillingAmount(providerBilling({ billing: { billPence: 4500, monthlyPence: 4000 } })), 4000);
});

test('a recurring provider builds a dated year plan on the payment day', () => {
  const billing = providerBilling({ billing: { monthlyPence: 9500, paymentDay: 31, recurring: true } });
  const plan = buildProviderYearPlan(2026, billing);
  assert.equal(plan.length, 12);
  assert.equal(plan[0].date, '2026-01-28', 'the 31st is capped at 28 so every month has that day');
  assert.equal(plan[1].date, '2026-02-28');
  assert.equal(plan[11].date, '2026-12-28');
  assert.equal(providerYearPlanTotal(plan), 114000);
  assert.deepEqual(buildProviderYearPlan(2026, providerBilling({})), [], 'no amount, no plan');
});

test('a recurring provider writes the remaining months in its own ledger shape', () => {
  const billing = providerBilling({ billing: { billPence: 3000, monthlyPence: 2500, paymentDay: 14, recurring: true } });
  const water = buildProviderPlanEntries('water', 2026, billing, 10);
  assert.deepEqual(water.map((row) => row.month), ['Oct', 'Nov', 'Dec'], 'only the remaining months');
  assert.equal(water[0].billAmountPence, 3000);
  assert.equal(water[0].paymentPence, 2500);
  assert.equal(water[0].plan, true);
  const o2 = buildProviderPlanEntries('o2', 2026, billing, 11);
  assert.equal(o2[0].amountPence, 3000, 'telco rows carry the bill in amountPence');
  assert.equal(o2[0].paymentPence, 2500);
  const savings = buildProviderPlanEntries('parkXmas', 2026, billing, 12);
  assert.equal(savings[0].paymentPence, 2500);
  assert.equal(savings[0].status, 'Owed');
  const tax = buildProviderPlanEntries('councilTax', 2026, billing, 12);
  assert.equal(tax[0].date, '2026-12-14', 'dated providers get the payment date');
  assert.equal(tax[0].ref, 'Direct Debit');
  assert.deepEqual(buildProviderPlanEntries('rent', 2026, billing, 1), [], 'rent keeps its weekly schedule');
  assert.deepEqual(buildProviderPlanEntries('water', 2026, providerBilling({}), 1), [], 'no amount, no rows');
});

test('the plan fills missing months, refreshes only its own rows and can be removed', () => {
  const rows: any[] = [{ month: 'Oct', paymentPence: 2400, balancePence: 0 }];
  const first = mergeProviderPlanRows(rows, buildProviderPlanEntries('water', 2026, providerBilling({ billing: { monthlyPence: 2500, paymentDay: 14, recurring: true } }), 10), true);
  assert.equal(first.added, 2);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].paymentPence, 2400, 'a month with real data is left alone');

  rows[1].paymentPence = 2600;
  const second = mergeProviderPlanRows(rows, buildProviderPlanEntries('water', 2026, providerBilling({ billing: { monthlyPence: 2700, paymentDay: 14, recurring: true } }), 10), true);
  assert.equal(second.updated, 2);
  assert.equal(rows[1].paymentPence, 2700, 'a plan row follows the new amount');
  assert.equal(rows[0].paymentPence, 2400);
  assert.equal(withoutProviderPlanRows(rows).length, 1);
});

test('provider fields write into nested contract objects and numbers stay numeric', () => {
  const provider: any = { contract: {} };
  writeProviderField(provider, 'contract.accountNumber', '0123456789');
  writeProviderField(provider, 'paymentDay', '14', 'number');
  assert.equal(provider.contract.accountNumber, '0123456789');
  assert.equal(provider.paymentDay, 14);
  assert.equal(readProviderField(provider, 'contract.accountNumber'), '0123456789');
  assert.equal(readProviderField(provider, 'missing.field'), '');
});

test('provider URL fields only accept plain http or https addresses', () => {
  const portal = { key: 'portalUrl', label: 'Portal URL', type: 'url' as const };
  assert.equal(providerFieldProblem(portal, 'https://example.com/login'), null);
  assert.equal(providerFieldProblem(portal, 'http://example.com'), null);
  assert.equal(providerFieldProblem(portal, ''), null);
  assert.match(providerFieldProblem(portal, 'javascript:alert(1)') ?? '', /http or https/i);
  assert.match(providerFieldProblem(portal, 'https://user:pass@example.com') ?? '', /username or password/i);
  assert.match(providerFieldProblem(portal, 'example.com') ?? '', /complete http/i);
});

test('provider logos accept small PNG/JPEG/WebP images only', () => {
  assert.equal(providerLogoFileProblem({ type: 'image/png', size: 40_000 }), null);
  assert.equal(providerLogoFileProblem({ type: 'image/jpeg', size: 40_000 }), null);
  assert.equal(providerLogoFileProblem({ type: 'image/webp', size: 40_000 }), null);
  assert.match(providerLogoFileProblem({ type: 'image/svg+xml', size: 4_000 }) ?? '', /PNG, JPEG or WebP/i);
  assert.match(providerLogoFileProblem({ type: 'image/png', size: 500_000 }) ?? '', /200 KB/i);
  assert.ok(providerLogoFileProblem(null));

  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(providerLogoDataProblem(png), null);
  assert.match(providerLogoDataProblem('data:text/html;base64,PHNjcmlwdD4=') ?? '', /not a supported/i);
  assert.match(providerLogoDataProblem(`data:image/png;base64,${'A'.repeat(300_000)}`) ?? '', /too large/i);
});
