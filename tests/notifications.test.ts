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

test('a bill outside the horizon and paid bills are not announced', () => {
  const engine = buildEngine(dataset());
  const notices = buildBudgetNotifications(dataset(), engine, { today: '2026-11-01', horizonDays: 3 });
  assert.equal(notices.some((notice) => notice.kind === 'bill'), false);
});

test('read timestamps suppress only the matching notification', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const notices = buildBudgetNotifications(ds, engine, { today: '2026-11-09' });
  assert.ok(notices.length > 0);
  ds.settings.notificationReads = { [notices[0].id]: '2026-11-09T10:00:00Z' };
  assert.equal(unreadBudgetNotifications(ds, notices).some((notice) => notice.id === notices[0].id), false);
});
