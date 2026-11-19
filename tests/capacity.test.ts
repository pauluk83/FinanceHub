import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPACITY_LIMITS, capacityReport, datasetBytes } from '../core/capacity.ts';
import type { Dataset } from '../core/engine.ts';

function fake(transactionCount: number, padding = ''): Dataset {
  return {
    settings: { targetYear: 2026 },
    transactions: Array.from({ length: transactionCount }, (_, index) => ({
      row: index + 1,
      date: '2026-11-19',
      account: 'Starling',
      type: 'Expense',
      amountPence: 100,
      comments: `${padding}${index}`,
    })),
  } as unknown as Dataset;
}

test('a small budget reports plenty of headroom', () => {
  const report = capacityReport(fake(100));
  assert.equal(report.level, 'ok');
  assert.match(report.message, /ample room/);
  assert.ok(report.bytes > 0);
  assert.equal(datasetBytes(fake(100)), report.bytes);
});

test('a large document warns before the browser cache fills', () => {
  const report = capacityReport(fake(10, 'x'.repeat(CAPACITY_LIMITS.warnBytes / 10)));
  assert.equal(report.level, 'warning');
  assert.match(report.message, /5 MB/);
  assert.match(report.message, /export/i);
});

test('a document at the cache limit is critical and names the remedy', () => {
  const report = capacityReport(fake(10, 'x'.repeat(CAPACITY_LIMITS.criticalBytes / 10)));
  assert.equal(report.level, 'critical');
  assert.match(report.message, /desktop app/);
});

test('transaction count can trigger the guard even when the document is small', () => {
  const report = capacityReport(fake(CAPACITY_LIMITS.criticalTransactions));
  assert.equal(report.level, 'critical');
  assert.match(report.message, /transactions/);
});
