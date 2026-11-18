import assert from 'node:assert/strict';
import test from 'node:test';
import { benefitsPack, monthClosePack, providerDisputePack } from '../core/evidence.ts';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { baseDataset } from './support/dataset.ts';

function dataset(): Dataset {
  const ds = baseDataset();
  ds.settings.asOfDate = '2026-11-18';
  ds.providers = {
    o2: {
      displayName: 'O2',
      year: 2026,
      statement: [
        { date: '2026-10-01', amountPence: 3000, paymentPence: 3000, balancePence: 0, note: 'October' },
        { date: '2026-11-01', amountPence: 3200, paymentPence: 3000, balancePence: 200, note: 'November' },
      ],
      contract: { endDate: '2028-09-30', contractAmountPence: 96000, paymentsPence: 6000 },
      credentials: { password: 'never-export-this' },
    },
  };
  ds.incomeSchedules = {
    pip: [{ month: 'Nov', year2026: { date: '2026-11-10', amountPence: 15000 }, year2027: { date: '2027-11-10', amountPence: 0 }, year2028: { date: '2028-11-10', amountPence: 0 } }],
    uc: [{ month: 'Nov', year2026: { date: '2026-11-12', amountPence: 8000 }, year2027: { date: '2027-11-12', amountPence: 0 }, year2028: { date: '2028-11-12', amountPence: 0 } }],
  };
  ds.transactions = [
    { row: 1, date: '2026-11-10', account: 'Starling', type: 'Income', amountPence: 15000, comments: 'PIP payment', status: '', budgetTreatment: '' },
    { row: 2, date: '2026-11-15', account: 'Starling', type: 'Income', amountPence: 7000, comments: 'Universal Credit', status: '', budgetTreatment: '' },
  ];
  ds.monthLocks = {
    '2026-10': {
      lockedAt: '2026-11-01T10:00:00.000Z',
      incomePence: 100000,
      expensesPence: 80000,
      netPence: 20000,
      owedPence: 0,
      accounts: [{ name: 'Starling', balancePence: 50000 }],
      cards: [],
      people: [],
      bills: [{ name: 'Broadband', amountPence: 3500 }],
      statement: [{ name: 'Starling', kind: 'account', statementPence: 50000, calculatedPence: 50000, differencePence: 0 }],
      reconciledNote: '',
    },
  };
  return ds;
}

test('provider pack carries statement lines and contract terms but no credentials', () => {
  const pack = providerDisputePack(dataset(), 'o2', 2026);
  assert.ok(pack);
  assert.equal(pack.summary.find(([key]) => key === 'Closing balance')?.[1], '£2.00');
  assert.equal(pack.summary.find(([key]) => key === 'Contract end')?.[1], '2028-09-30');
  const serialised = JSON.stringify(pack);
  assert.ok(!serialised.includes('never-export-this'));
  assert.ok(!serialised.includes('credentials'));
  assert.equal(pack.sheets.find((sheet) => sheet.name === 'Statement')?.rows.length, 3);
});

test('provider pack returns null for an unknown or empty year', () => {
  assert.equal(providerDisputePack(dataset(), 'ovo', 2026), null);
  assert.equal(providerDisputePack(dataset(), 'o2', 2027), null);
});

test('month close pack uses a frozen lock and labels an open month as live', () => {
  const ds = dataset();
  const locked = monthClosePack(ds, buildEngine(ds), 2026, 10);
  assert.equal(locked.summary.find(([key]) => key === 'Status')?.[1], 'Locked snapshot');
  assert.equal(locked.summary.find(([key]) => key === 'Income')?.[1], '£1,000.00');
  assert.equal(locked.sheets.some((sheet) => sheet.name === 'Statement checks'), true);

  const open = monthClosePack(ds, buildEngine(ds), 2026, 11);
  assert.equal(open.summary.find(([key]) => key === 'Status')?.[1], 'Open month (live figures)');
  assert.equal(open.sheets.some((sheet) => sheet.name === 'Statement checks'), false);
});

test('benefits pack compares schedule and recorded income by month', () => {
  const pack = benefitsPack(dataset(), 2026);
  assert.equal(pack.summary.find(([key]) => key === 'Expected')?.[1], '£230.00');
  assert.equal(pack.summary.find(([key]) => key === 'Received')?.[1], '£220.00');
  assert.equal(pack.summary.find(([key]) => key === 'Difference')?.[1], '-£10.00');
  const benefitRows = pack.sheets.find((sheet) => sheet.name === 'Benefits')?.rows ?? [];
  assert.equal(benefitRows.length, 3);
});
