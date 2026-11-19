/**
 * Dataset capacity.
 *
 * The budget is one JSON document. A browser cache allows roughly 5 MB per
 * origin, so a growing document must warn before it fails to save. These
 * thresholds are deliberately conservative: they leave room for the last-good
 * and damaged copies the store keeps beside the live document.
 */
import type { Dataset } from './engine.ts';

export const CAPACITY_LIMITS = {
  /** Warn once the document is about half the browser cache. */
  warnBytes: 2_500_000,
  /** Above this a browser save is likely to fail; a desktop workspace still works. */
  criticalBytes: 4_500_000,
  warnTransactions: 25_000,
  criticalTransactions: 50_000,
} as const;

export interface CapacityReport {
  bytes: number;
  transactions: number;
  level: 'ok' | 'warning' | 'critical';
  message: string;
}

function kilobytes(bytes: number): string {
  return `${Math.round(bytes / 1024).toLocaleString('en-GB')} KB`;
}

/** UTF-8 size of the document exactly as the store serialises it. */
export function datasetBytes(dataset: Dataset): number {
  return new TextEncoder().encode(JSON.stringify(dataset)).length;
}

export function capacityReport(dataset: Dataset): CapacityReport {
  const bytes = datasetBytes(dataset);
  const transactions = dataset.transactions.length;
  if (bytes >= CAPACITY_LIMITS.criticalBytes || transactions >= CAPACITY_LIMITS.criticalTransactions) {
    return {
      bytes,
      transactions,
      level: 'critical',
      message: `${kilobytes(bytes)} across ${transactions.toLocaleString('en-GB')} transactions is near the browser cache limit. Export a backup, archive older years or use the desktop app before adding more rows.`,
    };
  }
  if (bytes >= CAPACITY_LIMITS.warnBytes || transactions >= CAPACITY_LIMITS.warnTransactions) {
    return {
      bytes,
      transactions,
      level: 'warning',
      message: `${kilobytes(bytes)} across ${transactions.toLocaleString('en-GB')} transactions is growing; the browser cache allows about 5 MB. Keep a recent export so a full cache cannot lose the budget.`,
    };
  }
  return {
    bytes,
    transactions,
    level: 'ok',
    message: `${kilobytes(bytes)} across ${transactions.toLocaleString('en-GB')} transactions leaves ample room in the browser cache.`,
  };
}
