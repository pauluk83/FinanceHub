import assert from 'node:assert/strict';
import test from 'node:test';
import { billPriceHistory, billPriceSummary, expiryList, expiryReminders, normaliseExpiry } from '../core/billTimeline.ts';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { baseDataset } from './support/dataset.ts';

function dataset(): Dataset {
  return baseDataset();
}

test('bill price history starts at the base amount and applies each change in order', () => {
  const ds = dataset();
  ds.bills = [{
    name: 'Broadband', amountPence: 3000, dueDay: 5, linkedSheet: '', frequency: 'Monthly',
    latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
    effectiveFrom: '2026-01-01', paymentMethod: 'Direct Debit', baseAmountPence: 3000, baseDueDay: 5,
  }];
  ds.billChanges = [
    { bill: 'Broadband', appliesFrom: '2026-04-01', appliesTo: '', amountOverridePence: 3500, dueDateOverride: '', changeType: 'Annual increase', note: 'April rise' },
    { bill: 'Broadband', appliesFrom: '2027-04-01', appliesTo: '', amountOverridePence: 3800, dueDateOverride: '', changeType: 'Annual increase', note: '' },
  ];

  const points = billPriceHistory(ds, 'Broadband');
  assert.equal(points.length, 3);
  assert.equal(points[0].amountPence, 3000);
  assert.equal(points[0].changePence, null);
  assert.equal(points[1].previousPence, 3000);
  assert.equal(points[1].changePence, 500);
  assert.equal(points[1].annualPence, 42_000);
  assert.equal(points[2].changePence, 300);
  assert.ok(Math.abs((points[2].changePct ?? 0) - 300 / 3500) < 1e-9);
});

test('next change is the first dated amount after today', () => {
  const ds = dataset();
  ds.bills = [{
    name: 'Broadband', amountPence: 3000, dueDay: 5, linkedSheet: '', frequency: 'Monthly',
    latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
    effectiveFrom: '2026-01-01', paymentMethod: 'Direct Debit', baseAmountPence: 3000, baseDueDay: 5,
  }];
  ds.billChanges = [
    { bill: 'Broadband', appliesFrom: '2026-04-01', appliesTo: '', amountOverridePence: 3500, dueDateOverride: '', changeType: 'Rise', note: '' },
  ];
  const summary = billPriceSummary(ds, 'Broadband', '2026-02-01');
  assert.equal(summary.currentPence, 3000);
  assert.equal(summary.nextChange?.amountPence, 3500);
  assert.equal(summary.nextChangeDate, '2026-04-01');

  const later = billPriceSummary(ds, 'Broadband', '2026-06-01');
  assert.equal(later.currentPence, 3500);
  assert.equal(later.nextChange, null);
});

test('manual expiries and provider contracts merge into one dated list', () => {
  const ds = dataset();
  ds.expiries = [{
    id: 'expiry_mot', label: 'Car MOT', kind: 'mot', date: '2026-12-01', leadDays: 30,
  }];
  ds.providers = {
    o2: { displayName: 'O2', contract: { endDate: '2028-09-30' } },
    virgin: { name: 'Virgin Media', contract: { endDate: '2028-09-30' } },
  };

  const list = expiryList(ds);
  assert.equal(list.length, 3);
  assert.equal(list[0].label, 'Car MOT');
  assert.equal(list[1].source, 'provider');
  assert.equal(list[1].label, 'O2 contract end');
  assert.equal(list[2].label, 'Virgin Media contract end');
});

test('expiry reminders respect lead time and ignore past or inactive items', () => {
  const ds = dataset();
  ds.expiries = [
    { id: 'a', label: 'Insurance', kind: 'insurance', date: '2026-11-30', leadDays: 14 },
    { id: 'b', label: 'Tenancy', kind: 'tenancy', date: '2026-12-20', leadDays: 14 },
    { id: 'c', label: 'Old', kind: 'other', date: '2026-11-01', leadDays: 30 },
    { id: 'd', label: 'Hidden', kind: 'other', date: '2026-11-25', leadDays: 30, active: false },
  ];
  const reminders = expiryReminders(ds, '2026-11-18');
  assert.deepEqual(reminders.map((entry) => entry.id), ['a']);
  assert.equal(reminders[0].days, 12);
});

test('normaliseExpiry rejects impossible dates and clamps the lead time', () => {
  assert.equal(normaliseExpiry({ label: 'Broken', date: '2026-02-31' }), null);
  const expiry = normaliseExpiry({ id: 'x', label: ' Insurance ', date: '2026-12-01', kind: 'insurance', leadDays: 999 });
  assert.equal(expiry?.label, 'Insurance');
  assert.equal(expiry?.leadDays, 365);
});

test('a bill removed from a year stays removed for later years but not earlier ones', () => {
  const ds = dataset();
  ds.bills = [{
    name: 'Broadband', amountPence: 3000, dueDay: 5, linkedSheet: '', frequency: 'Monthly',
    latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
    effectiveFrom: '2026-01-01', paymentMethod: 'Direct Debit', baseAmountPence: 3000, baseDueDay: 5,
  }];
  ds.billChanges = [{
    bill: 'Broadband', appliesFrom: '2030-01-01', appliesTo: '', amountOverridePence: null,
    dueDateOverride: '', dueDayOverride: null, changeType: 'Removed', note: '', skip: true,
  }];
  const engine = buildEngine(ds);
  const has = (year: number) => engine.scheduledBills(year, 1).some((bill) => bill.name === 'Broadband');

  assert.equal(has(2029), true, 'the year before the removal still pays it');
  assert.equal(has(2030), false, 'the removal year drops it');
  assert.equal(has(2035), false, 'later years stay clear of it');
});

test('a bill stopped mid-year keeps every month before the stop', () => {
  const ds = dataset();
  ds.bills = [{
    name: 'Broadband', amountPence: 3000, dueDay: 5, linkedSheet: '', frequency: 'Monthly',
    latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
    effectiveFrom: '2025-01-01', paymentMethod: 'Direct Debit', baseAmountPence: 3000, baseDueDay: 5,
  }];
  ds.billChanges = [{
    bill: 'Broadband', appliesFrom: '2026-08-01', appliesTo: '', amountOverridePence: null,
    dueDateOverride: '', dueDayOverride: null, changeType: 'Stopped', note: '', skip: true,
  }];
  const engine = buildEngine(ds);
  const billed = (year: number, month: number) => engine.scheduledBills(year, month).some((bill) => bill.name === 'Broadband');

  assert.equal(billed(2025, 9), true, 'a year before the stop is untouched');
  assert.equal(billed(2026, 7), true, 'the month before the stop still pays it');
  assert.equal(billed(2026, 8), false, 'the stop month is the first without it');
  assert.equal(billed(2026, 12), false);
  assert.equal(billed(2027, 1), false);
  assert.equal(ds.bills.length, 1, 'the definition stays, so history can still be read');
});
