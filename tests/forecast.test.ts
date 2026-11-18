import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEngine, type Dataset, type ScheduleRow } from '../core/engine.ts';
import { buildForecast } from '../core/forecast.ts';

const schedule = (date: string, amountPence: number): ScheduleRow => ({
  month: 'Dec',
  year2026: { date, amountPence },
  year2027: { date: date.replace('2026', '2027'), amountPence },
  year2028: { date: date.replace('2026', '2028'), amountPence },
});

function dataset(): Dataset {
  return {
    settings: {
      targetYear: 2026, startMonth: 1, monthsInYear: 12, currency: '£',
      asOfDate: '2026-11-18', lockCutoff: '2026-11-01', anchorDate: '2026-11-01',
      primaryAccount: 'Current',
    },
    accounts: [{ name: 'Current', targetPence: 0, openingPence: 100_000, sortOrder: 1, active: true }],
    people: [],
    cards: [],
    bills: [
      {
        name: 'Rent', amountPence: 50_000, dueDay: 1, linkedSheet: '', frequency: 'Monthly',
        latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true,
        effectiveFrom: '', paymentMethod: 'Standing Order', baseAmountPence: 50_000, baseDueDay: 1,
      },
      {
        name: 'Energy', amountPence: 10_000, dueDay: 25, linkedSheet: '', frequency: 'Monthly',
        latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 2, active: true,
        effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 10_000, baseDueDay: 25,
      },
    ],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [schedule('2026-12-05', 80_000)] },
    transactions: [],
    providers: {},
    monthLocks: {},
    debts: [{
      id: 'd1', name: 'Car finance', balancePence: 400_000, monthlyPaymentPence: 12_000, dueDay: 10,
    }],
    savings: [{
      id: 's1', name: 'Rainy day', balancePence: 50_000, monthlyContributionPence: 5_000, contributionDay: 2,
    }],
  };
}

test('the first row is the rest of the As-of month, not the whole month again', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const forecast = buildForecast(ds, engine);
  const [first] = forecast.months;

  assert.equal(first.partial, true);
  assert.equal(first.key, '2026-11');
  assert.equal(first.openingPence, 100_000);
  assert.equal(first.incomePence, 0, 'no PIP/UC left in November');
  assert.equal(first.billsPence, 10_000, 'only Energy is still due after 18 November');
  assert.equal(first.debtPence, 0, 'the car payment fell due on the 10th, before the As-of date');
  assert.equal(first.savingsPence, 0, 'the contribution fell due on the 2nd, before the As-of date');
  assert.equal(first.closingPence, 100_000 - 10_000);
});

test('later months use the engine’s own scheduled bill total', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const forecast = buildForecast(ds, engine);
  const december = forecast.months[1];

  assert.equal(december.key, '2026-12');
  assert.equal(december.billsPence, engine.scheduledBillsTotal(2026, 12));
  assert.equal(december.incomePence, 80_000);
  assert.equal(december.openingPence, forecast.months[0].closingPence);
  assert.equal(december.closingPence, december.openingPence + 80_000 - december.billsPence - 12_000 - 5_000);
  assert.equal(december.savingsBalancePence, 55_000, 'the existing savings balance plus this month’s contribution');
  assert.equal(december.positionPence, december.closingPence + 55_000);
});

test('a savings contribution is moved, not lost, so position keeps it', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const forecast = buildForecast(ds, engine);

  assert.equal(forecast.endSavingsPence, 50_000 + 11 * 5_000);
  assert.equal(forecast.endPositionPence, forecast.endPence + forecast.endSavingsPence);
  assert.ok(forecast.endPositionPence > forecast.endPence);
});

test('paying more into savings lowers cash but leaves the total position alone', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const baseline = buildForecast(ds, engine);
  const scenario = buildForecast(ds, engine, { override: { savingsExtraPence: 1_000 } });

  assert.equal(scenario.endPence, baseline.endPence - 12_000, 'the extra applies from the rest of this month');
  assert.equal(scenario.endPositionPence, baseline.endPositionPence, 'the money is still the owner’s');
});

test('owed money is shown per month but never counted as cash', () => {
  const ds = dataset();
  ds.people = [{ shortName: 'Sam', fullName: 'Sam', openingPence: 50_000, sortOrder: 1, active: true }];
  const engine = buildEngine(ds);
  const forecast = buildForecast(ds, engine);
  const [first] = forecast.months;
  assert.equal(first.owedPence, 50_000);
  assert.equal(first.closingPence, 100_000 - 10_000);
});

test('a what-if changes the projection and never the budget', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const before = JSON.stringify(ds);
  const baseline = buildForecast(ds, engine);
  const scenario = buildForecast(ds, engine, { override: { billsPercent: -50 } });

  assert.ok(scenario.endPence > baseline.endPence);
  assert.equal(JSON.stringify(ds), before, 'the dataset is untouched by a scenario');
});

test('income override applies to full months and the partial month keeps its schedule', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const forecast = buildForecast(ds, engine, { override: { incomePence: 20_000 } });
  assert.equal(forecast.months[0].incomePence, 0);
  assert.equal(forecast.months[1].incomePence, 20_000);
});

test('a one-off expense lands in the chosen month only', () => {
  const ds = dataset();
  const engine = buildEngine(ds);
  const baseline = buildForecast(ds, engine);
  const scenario = buildForecast(ds, engine, { override: { oneOffPence: 30_000, oneOffMonth: '2026-12' } });

  assert.equal(scenario.months[0].oneOffPence, 0);
  assert.equal(scenario.months[1].oneOffPence, 30_000);
  assert.equal(scenario.months[1].closingPence, baseline.months[1].closingPence - 30_000);
});

test('with no scheduled income the forecast says so', () => {
  const ds = dataset();
  ds.incomeSchedules = { pip: [], uc: [] };
  const engine = buildEngine(ds);
  const forecast = buildForecast(ds, engine);
  assert.equal(forecast.months[1].incomePence, 0);
  assert.ok(forecast.notes.some((note) => note.includes('projected income is zero')));
});
