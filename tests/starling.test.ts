import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isStarlingUuid,
  normaliseStarlingAccounts,
  starlingDateRangeProblem,
  starlingFetchWindow,
  starlingImportRows,
} from '../core/starling.ts';

const ACCOUNT_UID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_UID = '22222222-2222-4222-8222-222222222222';

test('Starling accounts are reduced to safe, usable fields', () => {
  const accounts = normaliseStarlingAccounts([
    {
      accountUid: ACCOUNT_UID,
      defaultCategory: CATEGORY_UID,
      name: 'Personal',
      accountType: 'PRIMARY',
      currency: 'gbp',
      createdAt: '2026-01-01T00:00:00Z',
      token: 'must-not-survive',
    },
    { accountUid: 'not-a-uuid', defaultCategory: CATEGORY_UID, name: 'Bad' },
  ]);

  assert.deepEqual(accounts, [{
    accountUid: ACCOUNT_UID,
    defaultCategoryUid: CATEGORY_UID,
    name: 'Personal',
    accountType: 'PRIMARY',
    currency: 'GBP',
    createdAt: '2026-01-01T00:00:00Z',
  }]);
  assert.equal(JSON.stringify(accounts).includes('must-not-survive'), false);
  assert.equal(isStarlingUuid(ACCOUNT_UID), true);
  assert.equal(isStarlingUuid('not-a-uuid'), false);
});

test('settled feed items become signed review rows, with pending items excluded', () => {
  const rows = starlingImportRows([
    {
      feedItemUid: 'feed-expense',
      status: 'SETTLED',
      direction: 'OUT',
      amount: { currency: 'GBP', minorUnits: 1250 },
      transactionTime: '2026-11-05T12:00:00Z',
      counterPartyName: 'Tesco',
      reference: 'Weekly shop',
    },
    {
      feedItemUid: 'feed-income',
      status: 'SETTLED',
      direction: 'IN',
      amount: { currency: 'GBP', minorUnits: 18000 },
      transactionTime: '2026-11-01T08:00:00Z',
      counterPartyName: 'Employer',
    },
    {
      feedItemUid: 'feed-pending',
      status: 'PENDING',
      direction: 'OUT',
      amount: { currency: 'GBP', minorUnits: 999 },
      transactionTime: '2026-11-06T12:00:00Z',
    },
    {
      feedItemUid: 'feed-zero',
      status: 'SETTLED',
      direction: 'OUT',
      amount: { currency: 'GBP', minorUnits: 0 },
      transactionTime: '2026-11-06T12:00:00Z',
    },
  ]);

  assert.deepEqual(rows.map((row) => [row.date, row.type, row.amountPence, row.description]), [
    ['2026-11-01', 'Income', 18000, 'Employer'],
    ['2026-11-05', 'Expense', 1250, 'Tesco — Weekly shop'],
  ]);
  assert.equal(rows.every((row) => row.status === 'SETTLED'), true);
});

test('Starling transaction timestamps use the UK calendar date', () => {
  const rows = starlingImportRows([
    {
      feedItemUid: 'late-summer',
      status: 'SETTLED',
      direction: 'OUT',
      amount: { minorUnits: 100 },
      transactionTime: '2026-07-01T23:30:00Z',
    },
  ]);

  assert.equal(rows[0]?.date, '2026-07-02');
});

test('a missing direction falls back to the amount sign', () => {
  const rows = starlingImportRows([
    {
      feedItemUid: 'positive',
      status: 'SETTLED',
      amount: { minorUnit: 500 },
      transactionTime: '2026-11-01T00:00:00Z',
    },
    {
      feedItemUid: 'negative',
      status: 'SETTLED',
      amount: { minorUnits: -700 },
      transactionTime: '2026-11-02T00:00:00Z',
    },
  ]);

  assert.deepEqual(rows.map((row) => [row.id, row.type, row.amountPence]), [
    ['positive', 'Income', 500],
    ['negative', 'Expense', 700],
  ]);
});

test('the Starling fetch window runs through today, and through a later As-of date', () => {
  // The As-of date lags today: recent settled rows still have to be fetched.
  assert.deepEqual(starlingFetchWindow('2026-11-01', '2026-11-13', '2026-11-17'), {
    min: '2026-11-01',
    max: '2026-11-17',
    problem: null,
  });
  // A later As-of date (month-end reconciliation) stays the upper bound.
  assert.deepEqual(starlingFetchWindow('2026-11-01', '2026-11-30', '2026-11-17'), {
    min: '2026-11-01',
    max: '2026-11-30',
    problem: null,
  });
  // Extending a stale open period past a year falls back to the As-of window.
  const stale = starlingFetchWindow('2024-01-01', '2024-12-31', '2026-11-17');
  assert.deepEqual(stale, { min: '2024-01-01', max: '2024-12-31', problem: null });
  // ...and still reports Starling's one-year limit when the As-of window breaks it.
  const tooLong = starlingFetchWindow('2023-01-01', '2024-06-01', '2026-11-17');
  assert.equal(tooLong.max, '2024-06-01');
  assert.match(tooLong.problem ?? '', /one year/i);
});

test('Starling date ranges reject invalid and longer-than-one-year windows', () => {
  assert.equal(starlingDateRangeProblem('2026-01-01', '2026-12-31'), null);
  assert.match(starlingDateRangeProblem('2026-12-31', '2026-01-01') ?? '', /before/i);
  assert.match(starlingDateRangeProblem('2025-01-01', '2026-11-01') ?? '', /one year/i);
  assert.match(starlingDateRangeProblem('', '2026-11-01') ?? '', /valid/i);
});
