import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryTrend, spendReport, targetProgress, targetsSummary } from '../core/reports.ts';
import type { Dataset } from '../core/engine.ts';
import { baseDataset } from './support/dataset.ts';

function dataset(): Dataset {
  const ds = baseDataset();
  ds.transactions = [
    { row: 1, date: '2026-11-01', account: 'Starling', type: 'Expense', amountPence: 3000, comments: 'Shop', status: '', budgetTreatment: '', category: 'Food', tags: ['weekly', 'home'] },
    { row: 2, date: '2026-11-02', account: 'Starling', type: 'Expense', amountPence: 2000, comments: 'Bus', status: '', budgetTreatment: '', category: 'Transport', tags: ['weekly'] },
    { row: 3, date: '2026-11-03', account: 'Starling', type: 'Expense', amountPence: 1000, comments: 'Unlabelled', status: '', budgetTreatment: '' },
    { row: 4, date: '2026-11-04', account: 'Starling', type: 'Expense', amountPence: 9000, comments: 'Transfer out', status: '', budgetTreatment: 'Transfer', category: 'Food' },
    { row: 5, date: '2026-11-05', account: 'Starling', type: 'Expense', amountPence: 9000, comments: 'Bill generated', status: '', budgetTreatment: '', autoBill: true, category: 'Bills' },
    { row: 6, date: '2026-10-15', account: 'Starling', type: 'Expense', amountPence: 4000, comments: 'Shop', status: '', budgetTreatment: '', category: 'Food' },
    { row: 7, date: '2026-11-06', account: 'Starling', type: 'Income', amountPence: 50000, comments: 'Wages', status: '', budgetTreatment: '', category: 'Income' },
  ];
  ds.categoryTargets = { Food: 5000, Transport: 1000, Empty: 2000 };
  return ds;
}

test('monthly report counts only ordinary expense rows and groups uncategorised spend', () => {
  const report = spendReport(dataset(), 2026, 11);
  assert.equal(report.totalPence, 6000);
  assert.deepEqual(report.categories.map((line) => [line.label, line.amountPence]), [
    ['Food', 3000],
    ['Transport', 2000],
    ['Uncategorised', 1000],
  ]);
  assert.deepEqual(report.tags.map((line) => [line.label, line.amountPence]), [
    ['weekly', 5000],
    ['home', 3000],
  ]);
  assert.equal(report.months.at(-1)?.key, '2026-11');
});

test('yearly report sums the selected year and excludes other years', () => {
  const report = spendReport(dataset(), 2026, null);
  assert.equal(report.totalPence, 10_000);
  assert.equal(report.categories.find((line) => line.label === 'Food')?.amountPence, 7000);
});

test('category trend returns twelve months and follows the category', () => {
  const trend = categoryTrend(dataset(), 'food', 2026, 11);
  assert.equal(trend.length, 12);
  assert.equal(trend.at(-1)?.amountPence, 3000);
  assert.equal(trend.at(-2)?.amountPence, 4000);
});

test('targets are report-only progress and scale to a year', () => {
  const monthly = targetProgress(dataset(), 2026, 11);
  const food = monthly.find((entry) => entry.category === 'Food');
  assert.equal(food?.targetPence, 5000);
  assert.equal(food?.spentPence, 3000);
  assert.equal(food?.remainingPence, 2000);
  assert.equal(food?.ratio, 0.6);

  const yearly = targetProgress(dataset(), 2026, null).find((entry) => entry.category === 'Food');
  assert.equal(yearly?.targetPence, 60_000);
  assert.equal(yearly?.spentPence, 7000);

  const summary = targetsSummary(dataset(), 2026, 11);
  assert.equal(summary.targetPence, 8000);
  assert.equal(summary.spentPence, 5000);
  assert.equal(summary.exceeded, 1);
});
