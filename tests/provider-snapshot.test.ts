import assert from 'node:assert/strict';
import test from 'node:test';
import type { Dataset } from '../core/engine.ts';
import { providerBalancesForYear } from '../core/providerSnapshot.ts';

test('a provider snapshot takes the last dated row at or before month end', () => {
  const ds = {
    providers: {
      water: {
        displayName: 'Water',
        year: 2026,
        statement: [
          { month: 'Sep', date: '2026-09-01', paymentPence: 3000, balancePence: 1000, description: 'September' },
          { month: 'Oct', date: '2026-10-01', paymentPence: 3000, balancePence: 2000, description: 'October' },
          { month: 'Nov', date: '2026-11-01', paymentPence: 3000, balancePence: 3000, description: 'November' },
        ],
      },
    },
  } as unknown as Dataset;
  const snapshots = providerBalancesForYear(ds, 2026, '2026-10-31');
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].balancePence, 2000);
  assert.match(snapshots[0].statementRef, /2026-10-01 · October/);
});

test('a future-year block is used for a future lock', () => {
  const ds = {
    providers: {
      o2: {
        displayName: 'O2',
        year: 2026,
        statement: [],
        years: { '2027': { rows: [{ date: '2027-01-05', description: 'January bill', balancePence: 4200 }] } },
      },
    },
  } as unknown as Dataset;
  assert.equal(providerBalancesForYear(ds, 2027, '2027-01-31')[0].balancePence, 4200);
});
