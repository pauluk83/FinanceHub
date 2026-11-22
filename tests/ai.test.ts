import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEngine, type Dataset } from '../core/engine.ts';
import {
  AI_DEFAULT_MODEL,
  parseAiSettings,
  applyAiAction,
  budgetSnapshot,
  parseAssistantReply,
} from '../app/src/ai.ts';

const seed = JSON.parse(readFileSync(new URL('../data/workbook.json', import.meta.url), 'utf8')) as Dataset;
const clone = () => structuredClone(seed);

test('a missing or damaged key record means the free default model and no key', () => {
  assert.deepEqual(parseAiSettings(null), { apiKey: '', model: AI_DEFAULT_MODEL });
  assert.deepEqual(parseAiSettings('not json'), { apiKey: '', model: AI_DEFAULT_MODEL });
  assert.deepEqual(parseAiSettings('[]'), { apiKey: '', model: AI_DEFAULT_MODEL });
});

test('a saved key is read back with the default model unless one is set', () => {
  assert.deepEqual(parseAiSettings(JSON.stringify({ apiKey: 'sk-or-test' })), {
    apiKey: 'sk-or-test',
    model: AI_DEFAULT_MODEL,
  });
  assert.deepEqual(parseAiSettings(JSON.stringify({ apiKey: 'sk-or-test', model: '  ' })), {
    apiKey: 'sk-or-test',
    model: AI_DEFAULT_MODEL,
  });
  assert.deepEqual(parseAiSettings(JSON.stringify({ apiKey: 'sk-or-test', model: 'anthropic/claude-sonnet-4' })), {
    apiKey: 'sk-or-test',
    model: 'anthropic/claude-sonnet-4',
  });
});

test('a JSON reply keeps its text and valid actions', () => {
  const parsed = parseAssistantReply(JSON.stringify({
    reply: 'Water is due on the 12th.',
    actions: [
      { type: 'add_bill', name: 'Water', amountPence: 3450, dueDay: 12 },
      { type: 'update_bill', name: 'Rent', dueDay: 1 },
      { type: 'add_bill', name: '', amountPence: 0, dueDay: 50 },
      { type: 'delete_everything' },
    ],
  }));

  assert.equal(parsed.reply, 'Water is due on the 12th.');
  assert.deepEqual(parsed.actions.map((action) => action.type), ['add_bill', 'update_bill']);
});

test('a fenced or plain answer still reaches the chat', () => {
  const fenced = parseAssistantReply('```json\n{"reply":"£12.00 left","actions":[]}\n```');
  assert.equal(fenced.reply, '£12.00 left');

  const plain = parseAssistantReply('The Current balance is £61.16.');
  assert.equal(plain.reply, 'The Current balance is £61.16.');
  assert.deepEqual(plain.actions, []);
});

test('an approved add_bill action creates a bill with the usual defaults', () => {
  const ds = clone();
  const before = ds.bills.length;
  const label = applyAiAction(ds, { type: 'add_bill', name: 'AI water', amountPence: 3_450, dueDay: 12 }, ds.settings.asOfDate);

  assert.equal(label, 'AI water added to Bills');
  assert.equal(ds.bills.length, before + 1);
  const bill = ds.bills[ds.bills.length - 1];
  assert.equal(bill.amountPence, 3_450);
  assert.equal(bill.baseAmountPence, 3_450);
  assert.equal(bill.dueDay, 12);
  assert.equal(bill.active, true);
  assert.equal(bill.frequency, 'Monthly');
});

test('a duplicate bill name is refused rather than silently added twice', () => {
  const ds = clone();
  const existing = ds.bills[0].name;
  const label = applyAiAction(ds, { type: 'add_bill', name: existing, amountPence: 100, dueDay: 1 }, ds.settings.asOfDate);
  assert.equal(label, null);
});

test('an approved update_bill action changes only what it names', () => {
  const ds = clone();
  const bill = ds.bills[0];
  const beforeAmount = bill.amountPence;
  const label = applyAiAction(ds, { type: 'update_bill', name: bill.name, dueDay: 3 }, ds.settings.asOfDate);

  assert.equal(label, `${bill.name} updated in Bills`);
  assert.equal(bill.dueDay, 3);
  assert.equal(bill.baseDueDay, 3);
  assert.equal(bill.amountPence, beforeAmount);
});

test('an approved add_transaction action lands in Transactions', () => {
  const ds = clone();
  const before = ds.transactions.length;
  const label = applyAiAction(ds, {
    type: 'add_transaction',
    date: '2026-11-20',
    description: 'AI test shop',
    amountPence: 525,
    account: ds.accounts[0].name,
    kind: 'Expense',
  }, ds.settings.asOfDate);

  assert.match(String(label), /added to Transactions/);
  assert.equal(ds.transactions.length, before + 1);
  const row = ds.transactions[ds.transactions.length - 1];
  assert.equal(row.amountPence, 525);
  assert.equal(row.type, 'Expense');
  assert.equal(row.date, '2026-11-20');
});

test('the budget snapshot carries figures but never the vault or a key', () => {
  const engine = buildEngine(seed);
  const snapshot = budgetSnapshot(seed, engine, seed.settings.targetYear, 11);
  const text = JSON.stringify(snapshot);

  assert.ok(snapshot.bills.length > 0);
  assert.ok(snapshot.view.accounts.length > 0);
  assert.doesNotMatch(text, /sk-or|apiKey|password/i);
});
