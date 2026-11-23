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

test('no balance means pay the usage, and a big credit never becomes a negative payment', () => {
  const level = paymentPlan({ usagePence: 72_000, billedMonths: 12, balancePence: 0 });
  assert.equal(level?.recommendedPence, 6_000);
  assert.equal(level?.projectedPence, 0, 'paying usage level leaves a zero balance, not credit');

  const covered = paymentPlan({ usagePence: 72_000, billedMonths: 12, balancePence: 200_000 });
  assert.equal(covered?.recommendedPence, 0);
  assert.ok((covered?.projectedPence ?? 0) > 0);
});

test('without billed usage there is nothing to recommend', () => {
  assert.equal(paymentPlan({ usagePence: 0, billedMonths: 0, balancePence: 10_000 }), null);
  assert.equal(paymentPlan({ usagePence: 10_000, billedMonths: 0, balancePence: 0 }), null);
  assert.equal(paymentPlan({ usagePence: 10_000, billedMonths: 3, balancePence: Number.NaN }), null);
});

test('the settlement window and buffer are adjustable', () => {
  const twoYears = paymentPlan({ usagePence: 60_000, billedMonths: 12, balancePence: 120_000, settleMonths: 24, bufferMonths: 2 });
  assert.equal(twoYears?.bufferPence, 10_000);
  assert.equal(twoYears?.recommendedPence, 417);
  assert.ok(Math.abs((twoYears?.projectedPence ?? 0) - 10_000) <= 12, 'rounding is a few pence a month');
});
