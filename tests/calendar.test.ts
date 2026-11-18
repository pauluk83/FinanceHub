import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { calendarIcs, monthCalendar, safeToSpend } from '../core/calendar.ts';

function dataset(): Dataset {
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
    cards: [],
    bills: [{
      name: 'Rent',
      amountPence: 20_000,
      dueDay: 15,
      linkedSheet: '',
      frequency: 'Monthly',
      latestBalancePence: 0,
      latestPaymentPence: 0,
      sortOrder: 1,
      active: true,
      effectiveFrom: '',
      paymentMethod: 'Standing Order',
      baseAmountPence: 20_000,
      baseDueDay: 15,
    }],
    billChanges: [],
    incomeSchedules: {
      pip: [{
        month: 'Nov',
        year2026: { date: '2026-11-20', amountPence: 50_000 },
        year2027: { date: '2027-11-20', amountPence: 51_000 },
        year2028: { date: '2028-11-20', amountPence: 52_000 },
      }],
      uc: [],
    },
    transactions: [],
    providers: {},
    savings: [{
      id: 'sav_1',
      name: 'ISA',
      balancePence: 200_000,
      monthlyContributionPence: 5_000,
      contributionDay: 12,
      active: true,
    }],
    debts: [{ id: 'debt_1', name: 'Loan', balancePence: 80_000, monthlyPaymentPence: 3_000, dueDay: 25, active: true }],
    holidays: { '2026': [{ name: 'Cornwall', start: '2026-11-21', end: '2026-11-24' }] },
  };
}

test('the month grid places bills, income, debt, savings and holidays on their days', () => {
  const ds = dataset();
  const days = monthCalendar(ds, buildEngine(ds), 2026, 11, '2026-11-10');

  assert.equal(days.length, 30);
  assert.deepEqual(days.find((day) => day.date === '2026-11-15')?.bills.map((bill) => bill.name), ['Rent']);
  assert.deepEqual(days.find((day) => day.date === '2026-11-20')?.income.map((entry) => entry.kind), ['PIP']);
  assert.deepEqual(days.find((day) => day.date === '2026-11-25')?.debts.map((entry) => entry.name), ['Loan']);
  assert.deepEqual(days.find((day) => day.date === '2026-11-12')?.savings.map((entry) => entry.name), ['ISA']);
  assert.deepEqual(days.find((day) => day.date === '2026-11-22')?.holidays.map((entry) => entry.name), ['Cornwall']);
  assert.equal(days.find((day) => day.date === '2026-11-10')?.holidays.length, 0);
});

test('the calendar bill total is the engine scheduled-bill total', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const days = monthCalendar(ds, engine, 2026, 11, '2026-11-10');
  const total = days.reduce((sum, day) => sum + day.bills.reduce((dayTotal, bill) => dayTotal + bill.amountPence, 0), 0);

  assert.equal(total, engine.scheduledBillsTotal(2026, 11));
});

test('safe to spend deducts bills and savings due before the next income', () => {
  const ds = dataset();
  const safe = safeToSpend(ds, buildEngine(ds), '2026-11-10');

  assert.equal(safe.cashPence, 100_000);
  assert.equal(safe.nextIncomeDate, '2026-11-20');
  assert.equal(safe.nextIncomeKind, 'PIP');
  assert.equal(safe.billsPence, 20_000);
  assert.equal(safe.savingsPence, 5_000);
  assert.equal(safe.availablePence, 75_000);
  assert.equal(safe.cashPence - safe.billsPence - safe.savingsPence, safe.availablePence);
});

test('without a scheduled income the window runs to month end', () => {
  const ds = dataset();
  ds.incomeSchedules = { pip: [], uc: [] };
  const safe = safeToSpend(ds, buildEngine(ds), '2026-11-10');

  assert.equal(safe.nextIncomeDate, '');
  assert.equal(safe.horizonDate, '2026-11-30');
  assert.equal(safe.billsPence, 20_000);
  assert.equal(safe.availablePence, 75_000);
});

test('an excluded account leaves safe-to-spend cash', () => {
  const ds = dataset();
  ds.accounts[0].excludeFromSafeToSpend = true;
  const safe = safeToSpend(ds, buildEngine(ds), '2026-11-10');

  assert.equal(safe.cashPence, 0);
  assert.equal(safe.availablePence, -25_000);
});

test('the .ics file is valid, all-day and has stable unique UIDs', () => {
  const ds = dataset();
  const ics = calendarIcs(ds, buildEngine(ds), { from: '2026-11-10', months: 2, now: '2026-11-10T09:00:00Z' });

  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261115/);
  assert.match(ics, /UID:financehub-bill-rent-2026-11-15@financehub\.local/);
  assert.match(ics, /SUMMARY:Bill: Rent/);
  assert.match(ics, /UID:financehub-income-pip-2026-11-20@financehub\.local/);
  assert.match(ics, /UID:financehub-savings-isa-2026-11-12@financehub\.local/);
  assert.match(ics, /UID:financehub-debt-loan-2026-11-25@financehub\.local/);
  assert.match(ics, /UID:financehub-holiday-cornwall-2026-11-21@financehub\.local/);

  const again = calendarIcs(ds, buildEngine(ds), { from: '2026-11-10', months: 2, now: '2026-11-11T09:00:00Z' });
  assert.equal((again.match(/UID:financehub-bill-rent-2026-11-15@financehub\.local/g) ?? []).length, 1, 'a re-export does not duplicate a UID');
  assert.match(again, /DTSTART;VALUE=DATE:20261215/, 'the second month is included');
});
