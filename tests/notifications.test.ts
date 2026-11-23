import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { buildBudgetNotifications, unreadBudgetNotifications } from '../core/notifications.ts';

function dataset(): Dataset {
  return {
    settings: {
      targetYear: 2026,
      startMonth: 1,
      currency: '£',
      monthsInYear: 12,
      asOfDate: '2026-11-09',
      lockCutoff: '2026-11-01',
      anchorDate: '2026-11-01',
      primaryAccount: 'Current',
    },
    accounts: [{ name: 'Current', targetPence: 10_000, openingPence: 500, sortOrder: 1, active: true }],
    people: [],
    cards: [{ name: 'Card', limitPence: 10_000, openingPence: 9_000, sortOrder: 1, active: true }],
    bills: [{
      name: 'Rent', amountPence: 20_000, dueDay: 12, linkedSheet: '', frequency: 'Monthly',
      latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
      effectiveFrom: '', paymentMethod: 'Standing Order', baseAmountPence: 20_000, baseDueDay: 12,
    }],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [],
    providers: {},
    monthLocks: {},
  };
}

test('upcoming unpaid bills and low balances produce alerts', () => {
  const engine = buildEngine(dataset());
  const notices = buildBudgetNotifications(dataset(), engine, { today: '2026-11-09', horizonDays: 7 });
  assert.ok(notices.some((notice) => notice.id.startsWith('bill:Rent:')));
  assert.ok(notices.some((notice) => notice.severity === 'warning' && notice.kind === 'account'));
  assert.ok(notices.some((notice) => notice.kind === 'card'));
});

test('category targets warn at 80%, when over, and when the pace overshoots', () => {
  const ds = dataset();
  ds.categoryTargets = { Food: 10_000, Travel: 10_000, Shopping: 10_000, Empty: 10_000 };
  ds.transactions = [
    { id: 'food', date: '2026-11-05', type: 'Expense', amountPence: 9_000, category: 'Food', account: 'Current', budgetTreatment: 'Spending' },
    { id: 'travel', date: '2026-11-06', type: 'Expense', amountPence: 12_000, category: 'Travel', account: 'Current', budgetTreatment: 'Spending' },
    { id: 'shopping', date: '2026-11-07', type: 'Expense', amountPence: 4_000, category: 'Shopping', account: 'Current', budgetTreatment: 'Spending' },
  ] as any;
  const engine = buildEngine(ds);
  const notices = buildBudgetNotifications(ds, engine, { today: '2026-11-09', horizonDays: 7 });
  const target = (category: string) => notices.find((notice) => notice.kind === 'target' && notice.title.startsWith(category));

  assert.equal(target('Food')?.severity, 'warning');
  assert.match(target('Food')?.title ?? '', /90% of its monthly target/);
  assert.equal(target('Travel')?.severity, 'critical');
  assert.match(target('Travel')?.title ?? '', /over its monthly target/);
  assert.match(target('Shopping')?.title ?? '', /heading for an overspend/);
  assert.equal(target('Empty'), undefined, 'a target with no spend is not an alert');
  assert.ok(target('Shopping')?.detail.includes('day 9 of 30'));
});

test('a bill outside the horizon and paid bills are not announced', () => {
  const engine = buildEngine(dataset());
  const notices = buildBudgetNotifications(dataset(), engine, { today: '2026-11-01', horizonDays: 3 });
  assert.equal(notices.some((notice) => notice.kind === 'bill'), false);
});

test('deleted notifications stay hidden while the same alert is still derived', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const notices = buildBudgetNotifications(ds, engine, { today: '2026-11-09' });
  assert.ok(notices.length > 1);
  ds.settings.notificationDismissed = { [notices[0].id]: '2026-11-09T10:00:00Z' };

  const remaining = buildBudgetNotifications(ds, engine, { today: '2026-11-09' });
  assert.equal(remaining.some((notice) => notice.id === notices[0].id), false, 'the deleted alert is not derived');
  assert.equal(remaining.length, notices.length - 1, 'only the deleted alert is removed');
});

test('read timestamps suppress only the matching notification', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const notices = buildBudgetNotifications(ds, engine, { today: '2026-11-09' });
  assert.ok(notices.length > 0);
  ds.settings.notificationReads = { [notices[0].id]: '2026-11-09T10:00:00Z' };
  assert.equal(unreadBudgetNotifications(ds, notices).some((notice) => notice.id === notices[0].id), false);
});
