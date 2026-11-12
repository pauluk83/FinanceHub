import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { buildCardPaymentLegs, buildTransferLegs, findTransferPartner } from '../core/transfers.ts';

function loadDataset(): Dataset {
  return JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  ) as Dataset;
}

test('a transfer builds an outgoing and an incoming leg on one date', () => {
  const legs = buildTransferLegs({ date: '2026-11-15', from: 'Starling', to: 'Nationwide', amountPence: 10000, firstRow: 900 });

  assert.equal(legs.length, 2);
  assert.deepEqual(
    legs.map((l) => [l.row, l.account, l.type, l.amountPence, l.budgetTreatment]),
    [
      [900, 'Starling', 'Expense', 10000, 'Transfer'],
      [901, 'Nationwide', 'Income', 10000, 'Transfer'],
    ],
  );
  assert.equal(legs[0].comments, 'Transfer to Nationwide');
  assert.equal(legs[1].comments, 'Transfer from Starling');
});

test('a note typed by the user is used on both legs, and amounts are sanitised', () => {
  const legs = buildTransferLegs({ date: '2026-11-15', from: 'Starling', to: 'Monzo', amountPence: -2599.4, comments: '  Rent float  ', firstRow: 12 });

  assert.equal(legs[0].amountPence, 2599);
  assert.equal(legs[1].amountPence, 2599);
  assert.equal(legs[0].comments, 'Rent float');
  assert.equal(legs[1].comments, 'Rent float');
});

test('transfer legs find each other, and ordinary rows have no partner', () => {
  const rows = [
    { row: 5, date: '2026-11-15', account: 'Starling', type: 'Expense', amountPence: 10000, comments: 'out', status: '', budgetTreatment: 'Transfer' },
    { row: 6, date: '2026-11-15', account: 'Nationwide', type: 'Income', amountPence: 10000, comments: 'in', status: '', budgetTreatment: 'Transfer' },
    { row: 7, date: '2026-11-15', account: 'Starling', type: 'Expense', amountPence: 2599, comments: 'coffee', status: '', budgetTreatment: '' },
  ];

  assert.equal(findTransferPartner(rows, rows[0])?.row, 6);
  assert.equal(findTransferPartner(rows, rows[1])?.row, 5);
  assert.equal(findTransferPartner(rows, rows[2]), undefined, 'a normal expense has no partner');
  assert.equal(findTransferPartner([rows[0], rows[2]], rows[0]), undefined, 'no pair when nothing matches');
});

test('a card payment creates a bank expense and a card credit', () => {
  const legs = buildCardPaymentLegs({
    date: '2026-11-12', from: 'Starling', card: 'Zable', amountPence: 2739, comments: 'Paid off', firstRow: 900,
  });

  assert.deepEqual(
    legs.map((leg) => [leg.row, leg.account, leg.type, leg.amountPence, leg.budgetTreatment]),
    [
      [900, 'Starling', 'Expense', 2739, 'Transfer'],
      [901, 'Zable', 'Income', 2739, 'Transfer'],
    ],
  );
  assert.equal(legs[0].comments, 'Paid off');
  assert.equal(legs[1].comments, 'Paid off');
  assert.equal(findTransferPartner(legs, legs[0])?.row, 901);

  const defaultComments = buildCardPaymentLegs({
    date: '2026-11-12', from: 'Starling', card: 'Zable', amountPence: 2739, firstRow: 902,
  });
  assert.equal(defaultComments[0].comments, defaultComments[1].comments);
  assert.equal(defaultComments[0].comments, 'Card payment — Zable');
});

test('a card payment reduces the card and the main account without counting as spending', () => {
  const dataset = loadDataset();
  dataset.cards.push({ name: 'ZZZ Card', limitPence: 100_000, openingPence: 50_000, sortOrder: 99, active: true });
  const before = buildEngine(dataset);
  const beforeSummary = before.monthlySummary(2026, 11);
  const beforeAccounts = before.accountBalances('2026-11-30');
  const beforeCards = before.cardBalances('2026-11-30');
  const firstRow = Math.max(0, ...dataset.transactions.map((t) => t.row)) + 1;

  dataset.transactions.push(...buildCardPaymentLegs({
    date: '2026-11-12', from: 'Starling', card: 'ZZZ Card', amountPence: 12_345, firstRow,
  }));

  const after = buildEngine(dataset);
  const afterSummary = after.monthlySummary(2026, 11);
  const balance = (name: string, list: any[]) => list.find((entry) => entry.name === name)?.balancePence;

  assert.equal(balance('Starling', after.accountBalances('2026-11-30')), balance('Starling', beforeAccounts)! - 12_345);
  assert.equal(balance('ZZZ Card', after.cardBalances('2026-11-30')), balance('ZZZ Card', beforeCards)! - 12_345);
  assert.equal(afterSummary.incomePence, beforeSummary.incomePence, 'the card credit is not income');
  assert.equal(afterSummary.expensesPence, beforeSummary.expensesPence, 'the bank leg is not a second expense');
  assert.equal(afterSummary.netPence, beforeSummary.netPence);
});

test('a card payment can come from another bank account', () => {
  const dataset = loadDataset();
  dataset.cards.push({ name: 'ZZZ Card', limitPence: 100_000, openingPence: 50_000, sortOrder: 99, active: true });
  const before = buildEngine(dataset).accountBalances('2026-11-30');
  const firstRow = Math.max(0, ...dataset.transactions.map((t) => t.row)) + 1;

  dataset.transactions.push(...buildCardPaymentLegs({
    date: '2026-11-12', from: 'Nationwide', card: 'ZZZ Card', amountPence: 7_500, firstRow,
  }));

  const after = buildEngine(dataset).accountBalances('2026-11-30');
  const balance = (name: string, list: any[]) => list.find((entry) => entry.name === name)?.balancePence;

  assert.equal(balance('Starling', after), balance('Starling', before), 'the main account is untouched');
  assert.equal(balance('Nationwide', after), balance('Nationwide', before)! - 7_500);
});

test('a recorded transfer moves the balances but not income or expenses', () => {
  const dataset = loadDataset();
  const baseline = buildEngine(dataset).monthlySummary(2026, 11);
  const before = buildEngine(dataset).accountBalances('2026-11-30');

  const firstRow = Math.max(0, ...dataset.transactions.map((t) => t.row)) + 1;
  dataset.transactions.push(...buildTransferLegs({
    date: '2026-11-15', from: 'Starling', to: 'Nationwide', amountPence: 10000, firstRow,
  }));

  const engine = buildEngine(dataset);
  const after = engine.monthlySummary(2026, 11);
  const balance = (name: string, list: any[]) => list.find((a) => a.name === name)?.balancePence;

  assert.equal(after.incomePence, baseline.incomePence, 'income is untouched');
  assert.equal(after.expensesPence, baseline.expensesPence, 'expenses are untouched');
  assert.equal(after.netPence, baseline.netPence);
  assert.equal(balance('Starling', engine.accountBalances('2026-11-30')), balance('Starling', before) - 10000);
  assert.equal(balance('Nationwide', engine.accountBalances('2026-11-30')), balance('Nationwide', before) + 10000);
});
