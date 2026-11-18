import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReminderDigest, reminderPreferences } from '../core/reminders.ts';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { baseDataset } from './support/dataset.ts';

function dataset(): Dataset {
  const ds = baseDataset();
  ds.settings.asOfDate = '2026-11-18';
  ds.settings.emailReminders = { enabled: true, email: 'owner@example.com', bills: true, expiries: true, digestTime: '07:30' };
  ds.bills = [{
    name: 'Broadband', amountPence: 3500, dueDay: 20, linkedSheet: '', frequency: 'Monthly',
    latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
    effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 3500, baseDueDay: 20,
  }];
  ds.billChanges = [];
  ds.expiries = [{ id: 'expiry_mot', label: 'Car MOT', kind: 'mot', date: '2026-11-25', leadDays: 30 }];
  return ds;
}

test('preferences default to disabled and normalise the digest time', () => {
  const ds = dataset();
  delete ds.settings.emailReminders;
  const prefs = reminderPreferences(ds);
  assert.equal(prefs.enabled, false);
  assert.equal(prefs.digestTime, '07:00');
  assert.equal(prefs.bills, true);
  assert.equal(prefs.expiries, true);
});

test('digest includes due bills and expiries but keeps amounts out of the subject', () => {
  const ds = dataset();
  const digest = buildReminderDigest(ds, buildEngine(ds), { today: '2026-11-18', horizonDays: 14 });
  assert.equal(digest.recipient, 'owner@example.com');
  assert.equal(digest.enabled, true);
  assert.ok(digest.items.some((item) => item.kind === 'bill' && item.title.includes('Broadband')));
  assert.ok(digest.items.some((item) => item.kind === 'expiry' && item.title.includes('Car MOT')));
  assert.ok(!digest.subject.includes('£'));
  assert.ok(!digest.subject.includes('Broadband'));
  assert.match(digest.text, /Broadband/);
  assert.match(digest.text, /Unsubscribe/);
  assert.match(digest.html, /Car MOT/);
});

test('channel preferences remove a whole category', () => {
  const ds = dataset();
  ds.settings.emailReminders = { enabled: true, email: 'owner@example.com', bills: false, expiries: true, digestTime: '07:00' };
  const digest = buildReminderDigest(ds, buildEngine(ds), { today: '2026-11-18', horizonDays: 14 });
  assert.equal(digest.bills.length > 0, true);
  assert.equal(digest.expiries.length, 1);
  assert.ok(digest.items.every((item) => item.kind === 'expiry'));
});

test('an empty digest still has a clear subject and body', () => {
  const ds = dataset();
  ds.bills = [];
  ds.expiries = [];
  const digest = buildReminderDigest(ds, buildEngine(ds), { today: '2026-11-18', horizonDays: 7 });
  assert.equal(digest.items.length, 0);
  assert.match(digest.subject, /nothing due/i);
  assert.match(digest.text, /Nothing is due/);
});
