import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentPlan } from '../core/paymentPlan.ts';

test('a level payment covers usage and returns excess credit to the buffer', () => {
  // The real Ovo figures: £555.49 across 9 billed months and £527.56 in credit.
  const plan = paymentPlan({ usagePence: 55_549, billedMonths: 9, balancePence: 52_756 });
  assert.ok(plan);
  assert.equal(plan.monthlyUsagePence, 6_172);
  assert.equal(plan.bufferPence, 6_172);
  assert.equal(plan.recommendedPence, 2_290);
  assert.equal(plan.projectedPence, plan.bufferPence, 'the credit lands on one month of usage');
});

test('a debt is cleared on top of the usage rather than ignored', () => {
  const plan = paymentPlan({ usagePence: 60_000, billedMonths: 12, balancePence: -20_000 });
  assert.ok(plan);
  assert.equal(plan.monthlyUsagePence, 5_000);
  assert.equal(plan.recommendedPence, 7_083);
  assert.ok(Math.abs(plan.projectedPence - plan.bufferPence) <= plan.settleMonths, 'rounding is at most a few pence a month');
  assert.ok(plan.recommendedPence > plan.monthlyUsagePence, 'the debt payment is above usage');
});

test('no balance means pay the usage, and a big credit is floored above zero', () => {
  const level = paymentPlan({ usagePence: 72_000, billedMonths: 12, balancePence: 0 });
  assert.equal(level?.recommendedPence, 6_000);
  assert.equal(level?.projectedPence, 0, 'paying usage level leaves a zero balance, not credit');
  assert.equal(level?.floored, false);

  // £2,000 of credit would return a negative payment on a 12-month window.
  // The plan stops at a quarter of usage instead of suggesting £0.
  const covered = paymentPlan({ usagePence: 72_000, billedMonths: 12, balancePence: 200_000 });
  assert.equal(covered?.recommendedPence, 1_500);
  assert.equal(covered?.floorPence, 1_500);
  assert.equal(covered?.floored, true);
  assert.ok((covered?.projectedPence ?? 0) > 0);
});

test('a short settlement window never recommends a zero payment', () => {
  // The real Ovo figures on a 6-month window: the credit alone would cover it.
  const plan = paymentPlan({ usagePence: 55_549, billedMonths: 9, balancePence: 52_756, settleMonths: 6 });
  assert.ok(plan);
  assert.equal(plan.floorPence, 1_543);
  assert.equal(plan.recommendedPence, 1_543);
  assert.equal(plan.floored, true);
  assert.ok(plan.recommendedPence > 0);
});

test('without billed usage there is nothing to recommend', () => {
  assert.equal(paymentPlan({ usagePence: 0, billedMonths: 0, balancePence: 10_000 }), null);
  assert.equal(paymentPlan({ usagePence: 10_000, billedMonths: 0, balancePence: 0 }), null);
  assert.equal(paymentPlan({ usagePence: 10_000, billedMonths: 3, balancePence: Number.NaN }), null);
});

test('the settlement window and buffer are adjustable', () => {
  const twoYears = paymentPlan({ usagePence: 60_000, billedMonths: 12, balancePence: 40_000, settleMonths: 24, bufferMonths: 2 });
  assert.equal(twoYears?.bufferPence, 10_000);
  assert.equal(twoYears?.recommendedPence, 3_750);
  assert.equal(twoYears?.floored, false);
  assert.ok(Math.abs((twoYears?.projectedPence ?? 0) - 10_000) <= 12, 'rounding is a few pence a month');
});
