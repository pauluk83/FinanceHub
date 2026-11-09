/**
 * Phase 2 acceptance gate: every month of 2026 must match the workbook's own
 * cached results to the penny, less the internal transfers the workbook counted
 * as income and spending. A failure prints the component breakdown so the
 * offending rule is identifiable, not just a delta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, MONTHS, monthEnd, type Dataset } from '../core/engine.ts';
import { LIVE_TRANSACTIONS, adjustedCurrentMonth, adjustedMonth, adjustedYtd } from '../core/reference.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const ds: Dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));
const engine = buildEngine(ds);
const ref = ds.reference!;
const money = (p: number) => `${p < 0 ? '-' : ''}£${(Math.abs(p) / 100).toFixed(2)}`;

/**
 * The adjustments themselves live in core/reference.ts so the reconciliation
 * report in import/migrate.mjs applies exactly the same expectations:
 * internal transfers the engine removes, the post-workbook November rows, and
 * the November rent payment that was skipped because the account was in credit.
 */

function detail(year: number, month: number) {
  const s = engine.monthlySummary(year, month);
  const inc = s.breakdown.income as Record<string, number> | null;
  const exp = s.breakdown.expenses as Record<string, number> | null;
  return {
    label: s.label, source: s.source, locked: s.locked,
    income: money(s.incomePence), expenses: money(s.expensesPence),
    net: money(s.netPence), owed: money(s.owedPence),
    incomeParts: inc ? Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, money(v as number)])) : 'locked snapshot',
    expenseParts: exp ? Object.fromEntries(Object.entries(exp).map(([k, v]) => [k, money(v as number)])) : 'locked snapshot',
    bills: s.breakdown.bills.map((b) => `${b.name}:${money(b.amountPence)}`),
  };
}

test('2026 monthly income, expenses, net and owed match Dashboard rows 24-35', () => {
  for (const month of ref.months) {
    const actual = engine.monthlySummary(2026, month.month);
    const expected = adjustedMonth(month);
    const message = `${month.label}\n${JSON.stringify(detail(2026, month.month), null, 2)}`;
    assert.equal(actual.incomePence, expected.incomePence, `${month.label} income: ${message}`);
    assert.equal(actual.expensesPence, expected.expensesPence, `${month.label} expenses: ${message}`);
    assert.equal(actual.netPence, expected.netPence, `${month.label} net: ${message}`);
    assert.equal(actual.owedPence, expected.owedPence, `${month.label} owed: ${message}`);
  }
});

test('Dashboard YTD totals match for the as-of month', () => {
  const asOfMonth = Number(ref.asOfDate.slice(5, 7));
  const ytd = engine.yearToDate(2026, asOfMonth);
  const expected = adjustedYtd(ref.ytd);
  assert.equal(ytd.incomePence, expected.incomePence, `YTD income\n${money(ytd.incomePence)} vs ${money(expected.incomePence)}`);
  assert.equal(ytd.expensesPence, expected.expensesPence, 'YTD expenses');
  assert.equal(ytd.netPence, expected.netPence, 'YTD net');
  assert.equal(engine.owedAt(monthEnd(2026, asOfMonth)), expected.totalOwedPence, 'total owed');
});

test('current-month view matches Monthly_Overview less the post-workbook entry', () => {
  const view = adjustedCurrentMonth(ref.currentMonthView);
  const s = engine.monthlySummary(2026, 11);
  assert.equal(s.incomePence, view.incomePence, 'U9 income');
  assert.equal(s.expensesPence, view.expensesPence, 'U10 expenses include the post-workbook rows and exclude the £500 rent skipped in credit');
  assert.equal(s.netPence, view.netPence, 'U15 net');
  assert.equal(s.owedPence, view.owedPence, 'U13 owed');
  assert.ok(Math.abs(s.percentIncomeSpent - view.expensesPence / view.incomePence) < 1e-9, 'U12 % spent');
});

test('scheduled bills reproduce the December bill-only total', () => {
  const dec = engine.monthlySummary(2026, 12);
  assert.equal(dec.expensesPence, 88315, `December is bill-only in the workbook, got ${money(dec.expensesPence)}`);
  assert.equal(engine.scheduledBillsTotal(2026, 12), 88315);
});

test('bill changes resolve one-off dates and the PureGym intro rate', () => {
  const oct = engine.scheduledBills(2026, 10);
  const pureGym = oct.find((b) => b.name === 'PureGym');
  assert.equal(pureGym?.amountPence, 950, 'PureGym £9.50 in Oct 2026 (Bill Changes row 69)');
  const nov = engine.scheduledBills(2026, 11);
  assert.equal(nov.find((b) => b.name === 'Virgin Media')?.amountPence, 3299);
  const dueDates = engine.scheduledBills(2026, 9).map((b) => `${b.name}@${b.dueDate}`);
  assert.ok(dueDates.includes('Ovo@2026-09-28'), `Ovo Sept override (27th fell on Sunday), got ${dueDates.join(',')}`);
});

test('lock cutoff follows month-start / day<3 rule', () => {
  assert.equal(engine.lockCutoff('2026-11-06'), '2026-11-01');
  assert.equal(engine.lockCutoff('2026-11-02'), '2026-10-01');
  assert.equal(engine.lockCutoff('2026-01-01'), '2025-12-01');
  assert.equal(ds.settings.lockCutoff, '2026-11-01');
});

test('card balances and people balances match the workbook', () => {
  const cards = engine.cardBalances('2026-11-30');
  assert.equal(cards.find((c) => c.name === 'Vanquis')?.balancePence, 0);
  assert.equal(cards.find((c) => c.name === 'Zable')?.balancePence, 0);
  assert.equal(cards.reduce((s, c) => s + c.balancePence, 0), ref.cardsCurrent.totalBalancePence);
  const owed = engine.owedByPerson('2026-11-30');
  assert.equal(owed.reduce((s, p) => s + p.balancePence, 0), 451800);
  assert.equal(owed.find((p) => p.shortName === 'Steve')?.balancePence, 271500);
  assert.equal(owed.find((p) => p.shortName === 'Callum')?.balancePence, 71600);
});

test('Starling balance and monthly flow reconcile after the Dan and Credit Cards corrections', () => {
  const expected = ref.accountsCurrent.find((a: any) => a.name === 'Starling');
  const livePence = LIVE_TRANSACTIONS[11].expensesPence;
  assert.equal(engine.starlingBalance('2026-11-07'), 61116, 'N12 less post-workbook spending; direct historical Dan rows are not Starling cash');
  assert.equal(engine.starlingBalance('2026-11-07'), expected.expectedPence - livePence, 'workbook N12 less the 06/11 Dan payment and four 07/11 rows');
  assert.equal(engine.accountFlow('Starling', 2026, 11), expected.flowPence - livePence, 'M12 monthly flow');
  assert.equal(engine.dashboard(2026, 11).totalAccountBalancePence, 61116, 'dashboard account total');
});

test('rent ledger balance as-of date matches Rent!E6', () => {
  const ledger = engine.rentLedger(ref.asOfDate);
  assert.equal(ledger.balancePence, 98329, `rent balance ${money(ledger.balancePence)}`);
});

test('statement running balance closes at the account balance', () => {
  const st = engine.statement('Steve', 2026, null);
  assert.ok(st.lines.length > 0);
  assert.equal(st.closingPence, st.openingPence + st.totalLentPence - st.totalRepaidPence);
  assert.equal(st.closingPence, engine.owedByPerson('2026-11-30').find((p) => p.shortName === 'Steve')?.balancePence);
});

test('monthly statement carries the prior balance into the month', () => {
  const st = engine.statement('Steve', 2026, 11);
  const opening = engine.owedByPerson('2026-10-31').find((p) => p.shortName === 'Steve')?.balancePence;
  const closing = engine.owedByPerson('2026-11-30').find((p) => p.shortName === 'Steve')?.balancePence;
  assert.equal(st.openingPence, opening);
  assert.equal(st.closingPence, closing);
});

test('open months are recomputed by the engine, not read from snapshots', () => {
  const nov = engine.monthlySummary(2026, 11);
  assert.equal(nov.source, 'engine');
  assert.equal(nov.locked, false);
  assert.equal(nov.incomePence, 246574);
  assert.equal(nov.expensesPence, 226535, '£500 rent skipped in credit (Nov 2026), includes the four post-workbook rows');
  const dec = engine.monthlySummary(2026, 12);
  assert.equal(dec.source, 'engine');
  assert.equal(dec.expensesPence, 88315);
});

test('locked months are immutable imported facts', () => {
  const jan = engine.monthlySummary(2026, 1);
  assert.equal(jan.locked, true);
  assert.equal(jan.source, 'workbook-locked-snapshot');
  assert.equal(jan.incomePence, 205199);
  assert.equal(jan.expensesPence, 228508);
});

test('holidays sort upcoming first and passed to the bottom', () => {
  const rows = engine.holidays('2026-11-06');
  const firstPassed = rows.findIndex((h) => !h.upcoming);
  if (firstPassed !== -1) {
    assert.ok(rows.slice(firstPassed).every((h) => !h.upcoming), 'passed events sink to the bottom');
  }
  assert.ok(rows[0].upcoming, 'soonest upcoming is first');
});

test('a holiday in progress is ongoing, not passed, and stays at the top', () => {
  const rows = engine.holidays('2026-12-24');
  const trip = rows.find((h) => h.event === 'Hesperia Bristol Playa - Mum');
  assert.equal(trip?.ongoing, true, '22-29 Dec trip is ongoing on 24 Dec');
  assert.equal(trip?.upcoming, false);
  assert.equal(trip?.daysToGo, -2);
  assert.equal(rows[0].event, 'Hesperia Bristol Playa - Mum', 'ongoing trips sort before upcoming ones');
  const ongoing = rows.filter((h) => h.ongoing);
  assert.equal(ongoing.length, 4, 'the four December cost rows share 22-29 Dec');
  assert.ok(rows.slice(0, ongoing.length).every((h) => h.ongoing), 'every ongoing row sorts before upcoming and passed ones');
});

test('due bills auto-mark paid and supply linked provider payments', () => {
  const before = buildEngine({ ...ds, settings: { ...ds.settings, asOfDate: '2026-11-29' } });
  assert.equal(before.scheduledBills(2026, 11).find((b) => b.name === 'Virgin Media')?.paid, false);
  assert.equal(before.providerBillPayments('virgin')['Nov'], undefined);

  const onDue = buildEngine({ ...ds, settings: { ...ds.settings, asOfDate: '2026-11-30' } });
  assert.equal(onDue.scheduledBills(2026, 11).find((b) => b.name === 'Virgin Media')?.paid, true);
  assert.deepEqual(onDue.providerBillPayments('virgin')['Nov'], {
    bill: 'Virgin Media',
    amountPence: 3299,
    dueDate: '2026-11-30',
  });
});
