import assert from 'node:assert/strict';
import test from 'node:test';
import { isPushWorthy, pushAlerts, pushPayload, validPushAlert } from '../core/push.ts';
import type { BudgetNotification } from '../core/notifications.ts';

function notice(overrides: Partial<BudgetNotification>): BudgetNotification {
  return {
    id: 'bill:Water:2026-11-25',
    kind: 'bill',
    severity: 'warning',
    title: 'Water is due in 2 days',
    detail: '£32.50 · 2026-11-25 · paid from Starling',
    date: '2026-11-25',
    view: 'bills',
    ...overrides,
  };
}

test('only bills, balances and targets at warning or critical are pushed', () => {
  assert.equal(isPushWorthy(notice({ kind: 'bill', severity: 'warning' })), true);
  assert.equal(isPushWorthy(notice({ kind: 'account', severity: 'critical' })), true);
  assert.equal(isPushWorthy(notice({ kind: 'card', severity: 'warning' })), true);
  assert.equal(isPushWorthy(notice({ kind: 'target', severity: 'warning' })), true);
  assert.equal(isPushWorthy(notice({ kind: 'expiry', severity: 'warning' })), false);
  assert.equal(isPushWorthy(notice({ kind: 'bill', severity: 'info' })), false);
});

test('alerts are picked critical first, then by date, and capped', () => {
  const alerts = pushAlerts([
    notice({ id: 'bill:a:2026-11-27', severity: 'warning', date: '2026-11-27' }),
    notice({ id: 'account:b:2026-11-23', severity: 'critical', date: '2026-11-23', kind: 'account', title: 'Starling is below zero' }),
    notice({ id: 'bill:c:2026-11-24', severity: 'warning', date: '2026-11-24' }),
    notice({ id: 'bill:d:2026-11-26', severity: 'warning', date: '2026-11-26' }),
    notice({ id: 'expiry:e:2026-11-23', severity: 'critical', kind: 'expiry' }),
  ]);
  assert.deepEqual(alerts.map((alert) => alert.id), ['account:b:2026-11-23', 'bill:c:2026-11-24', 'bill:d:2026-11-26']);
});

test('the payload trims the text, points at the owning view and gives the alert a tag', () => {
  const payload = pushPayload(validPushAlert(notice({ detail: 'x'.repeat(400) }))!, 'https://financehub-uk.pages.dev');
  assert.equal(payload.url, 'https://financehub-uk.pages.dev/#bills');
  assert.equal(payload.tag, 'financehub-bill:Water:2026-11-25');
  assert.equal(payload.title, 'Water is due in 2 days');
  assert.equal(payload.body.length, 160);
  assert.match(payload.body, /…$/);
  assert.equal(pushPayload(validPushAlert(notice({ title: '  spaced   out  ' }))!).title, 'spaced out');
});

test('the sender refuses anything that is not a known alert', () => {
  assert.equal(validPushAlert(null), null);
  assert.equal(validPushAlert({ ...notice({}), kind: 'expiry' }), null);
  assert.equal(validPushAlert({ ...notice({}), severity: 'info' }), null);
  assert.equal(validPushAlert({ ...notice({}), id: 'x' }), null);
  assert.equal(validPushAlert({ ...notice({}), title: '' }), null);
  assert.equal(validPushAlert({ ...notice({}), view: 'javascript:alert(1)' }), null);
  const accepted = validPushAlert({ ...notice({}), detail: 'y'.repeat(500) });
  assert.equal(accepted?.detail.length, 300);
  assert.equal(accepted?.date, '2026-11-25');
  assert.equal(validPushAlert({ ...notice({}), date: '25/11/2026' })?.date, '');
});
