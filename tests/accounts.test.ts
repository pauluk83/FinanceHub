import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Dataset } from '../core/engine.ts';
import { PSEUDO_ACCOUNTS, accountsNeedingReview, classifyAccount, commentsMention, knownAccountNames, linkedAccountTransactions, linkedCommentSummary, unknownAccounts } from '../core/accounts.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const ds: Dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));

test('the classifier recognises banks, people, cards and pseudo-accounts', () => {
  assert.equal(classifyAccount(ds.accounts[0].name, ds), 'bank');
  assert.equal(classifyAccount(ds.people[0].shortName, ds), 'person');
  assert.equal(classifyAccount(ds.cards[0].name, ds), 'card');
  assert.equal(classifyAccount('Petrol', ds), 'pseudo');
  assert.equal(classifyAccount('Other', ds), 'pseudo');
  assert.equal(classifyAccount('Dan', ds), 'person');
  assert.equal(classifyAccount('Credit Cards', ds), 'unknown');
});

test('the workbook has no unclassified account names', () => {
  assert.deepEqual(unknownAccounts(ds.transactions, ds), []);
});

test('the lone Credit Cards row is now a Starling expense', () => {
  assert.equal(ds.transactions.filter((transaction) => transaction.account === 'Credit Cards').length, 0);
  assert.ok(ds.transactions.some((transaction) =>
    transaction.row === 172
    && transaction.account === 'Starling'
    && transaction.amountPence === 3000
    && transaction.date === '2026-02-27'));
});

test('the review queue is clear', () => {
  assert.deepEqual(accountsNeedingReview(ds.transactions, ds), []);
  assert.deepEqual(unknownAccounts(ds.transactions, ds), []);
});

test('Dan is a Starling-funded person with zero owed', () => {
  const dan = ds.people.find((person) => person.shortName === 'Dan');
  assert.equal(dan?.trackOwed, false);
  const engine = buildEngine(ds);
  assert.equal(engine.owedByPerson(ds.settings.asOfDate).find((person) => person.shortName === 'Dan')?.balancePence, 0);
  assert.equal(engine.owedAt(ds.settings.asOfDate), 451800);
  assert.equal(engine.starlingBalance(ds.settings.asOfDate), 61116);
});

test('known account names include pseudo-accounts but never the unknowns', () => {
  const known = knownAccountNames(ds);
  assert.ok(PSEUDO_ACCOUNTS.every((name) => known.includes(name)));
  assert.ok(known.includes(ds.accounts[0].name));
  assert.ok(known.includes(ds.people[0].shortName));
  assert.ok(known.includes(ds.cards[0].name));
  assert.ok(known.includes('Dan'));
  assert.ok(!known.includes('Credit Cards'));
});

test('comments match Dan as a whole word, case-insensitively', () => {
  assert.equal(commentsMention('Dan', 'Dan'), true);
  assert.equal(commentsMention('dan, he paid back', 'Dan'), true);
  assert.equal(commentsMention('Unity Pass Dan', 'Dan'), true);
  assert.equal(commentsMention('Dance class', 'Dan'), false);
  assert.equal(commentsMention(undefined, 'Dan'), false);
});

test('all Dan comment rows now belong to Dan', () => {
  const linked = linkedCommentSummary(ds.transactions, 'Dan');
  assert.deepEqual(linked, { rows: 0, expensePence: 0, incomePence: 0, lastDate: '' });
  assert.equal(ds.transactions.filter((transaction) => transaction.account === 'Dan').length, 71);
});

test('the Dan account ledger contains all direct rows', () => {
  const ledger = linkedAccountTransactions(ds.transactions, 'Dan');
  assert.equal(ledger.length, 71);
  assert.equal(ledger.filter((transaction) => transaction.account === 'Dan').length, 71);
  assert.equal(
    ledger.reduce((sum, transaction) => sum + (transaction.type === 'Expense' ? transaction.amountPence : 0), 0),
    113737,
  );
  assert.ok(ledger.every((transaction) => transaction.account === 'Dan'));
});

test('Dan rows do not add to owed and linked Starling rows still reduce Starling', () => {
  const engine = buildEngine(ds);
  assert.equal(engine.owedAt(ds.settings.asOfDate), 451800);
  assert.equal(engine.accountBalances(ds.settings.asOfDate).find((account) => account.name === 'Starling')?.balancePence, 61116);
});

test('the classifier keeps November expenses at the recorded figure', () => {
  const engine = buildEngine(ds);
  assert.equal(engine.monthlyExpenses(2026, 11).total, 226535);
  assert.equal(engine.monthlySummary(2026, 11).expensesPence, 226535);
});
