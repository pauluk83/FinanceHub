import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNav } from '../app/src/nav.ts';
import { decodeBackupDataset } from '../app/src/backup.ts';
import { isRentPaymentDescription } from '../core/rent.ts';
import type { Dataset } from '../core/engine.ts';

const dataset = { settings: { navLayout: undefined }, providers: {} } as unknown as Dataset;

test('debts and savings are first-class sections in the sidebar', () => {
  const nav = buildNav(dataset);
  const ledger = nav.find((group) => group.group === 'Ledger');
  assert.ok(ledger?.items.some((item) => item.id === 'debts'), 'Debts belongs in Ledger');
  assert.ok(ledger?.items.some((item) => item.id === 'savings'), 'Savings belongs in Ledger');
});

test('rent payments are matched by the generic label and old imports', () => {
  assert.equal(isRentPaymentDescription('Payment'), true);
  assert.equal(isRentPaymentDescription('Payment from Zane'), true, 'existing ledgers must keep working');
  assert.equal(isRentPaymentDescription('Rent Charge'), false);
  assert.equal(isRentPaymentDescription(undefined), false);
});

test('backups keep debts and savings', () => {
  const decoded = decodeBackupDataset({
    settings: {
      targetYear: 2026, startMonth: 1, monthsInYear: 12, currency: '£',
      asOfDate: '2026-11-08', lockCutoff: '2026-11-01', anchorDate: '2026-11-08',
    },
    accounts: [], people: [], cards: [], bills: [], billChanges: [], transactions: [],
    holidays: {}, providers: {}, incomeSchedules: { pip: [], uc: [] },
    debts: [{ id: 'd1', name: 'Car finance', balancePence: 480000, monthlyPaymentPence: 21000 }],
    savings: [{ id: 's1', name: 'Cash ISA', type: 'Cash ISA', balancePence: 250000, targetPence: 500000 }],
  });
  assert.ok(decoded);
  assert.equal(decoded.debts?.length, 1);
  assert.equal(decoded.savings?.length, 1);
  assert.equal(decoded.savings?.[0].type, 'Cash ISA');
});
