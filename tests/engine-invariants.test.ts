/**
 * Phase 2: totals invariants.
 *
 * Adding or removing a bill, account, person or card must move totals by a
 * predictable amount and nothing else. These are the property checks the plan
 * lists as missing, including the bill-table capacity case.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Bill, type Dataset } from '../core/engine.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const ds: Dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));
const base = buildEngine(ds);
const ALL = '9999-12-31';

const clone = () => structuredClone(ds);
const bill = (name: string, amountPence: number, dueDay = 15): Bill => ({
  name,
  amountPence,
  dueDay,
  linkedSheet: '',
  frequency: 'Monthly',
  latestBalancePence: 0,
  latestPaymentPence: 0,
  sortOrder: 99,
  active: true,
  effectiveFrom: '',
  paymentMethod: 'Direct Debit',
  baseAmountPence: amountPence,
  baseDueDay: dueDay,
});

test('adding a bill changes only the bill component of expenses', () => {
  const next = clone();
  next.bills.push(bill('ZZZ Test Bill', 1_234));
  const engine = buildEngine(next);

  assert.equal(engine.monthlyIncome(2026, 12).total, base.monthlyIncome(2026, 12).total, 'income is untouched');
  assert.equal(engine.scheduledBillsTotal(2026, 12), base.scheduledBillsTotal(2026, 12) + 1_234);
  assert.equal(engine.monthlyExpenses(2026, 12).total, base.monthlyExpenses(2026, 12).total + 1_234);
  assert.equal(engine.monthlySummary(2026, 12).owedPence, base.monthlySummary(2026, 12).owedPence);
});

test('the bill table has no fixed capacity limit', () => {
  const next = clone();
  const added = [100, 101, 102, 103, 104];
  added.forEach((amount, index) => next.bills.push(bill(`ZZZ Extra ${index}`, amount, 10 + index)));
  const engine = buildEngine(next);

  const visible = engine.scheduledBills(2026, 12);
  assert.equal(
    visible.filter((row) => row.name.startsWith('ZZZ Extra')).length,
    added.length,
    'every added bill is scheduled',
  );
  assert.equal(
    engine.scheduledBillsTotal(2026, 12),
    base.scheduledBillsTotal(2026, 12) + added.reduce((sum, amount) => sum + amount, 0),
    'the total is the sum of every visible bill, not a fixed 13-row block',
  );
});

test('an account, person or card with no transactions changes no total', () => {
  const next = clone();
  next.accounts.push({ name: 'ZZZ Account', targetPence: 0, openingPence: 0, sortOrder: 99, active: true });
  next.people.push({ shortName: 'ZZZ Person', fullName: 'ZZZ Person', openingPence: 0, sortOrder: 99, active: true });
  next.cards.push({ name: 'ZZZ Card', limitPence: 0, openingPence: 0, sortOrder: 99, active: true });
  const engine = buildEngine(next);

  for (const month of [11, 12]) {
    const before = base.monthlySummary(2026, month);
    const after = engine.monthlySummary(2026, month);
    assert.equal(after.incomePence, before.incomePence, `income ${month}`);
    assert.equal(after.expensesPence, before.expensesPence, `expenses ${month}`);
    assert.equal(after.netPence, before.netPence, `net ${month}`);
    assert.equal(after.owedPence, before.owedPence, `owed ${month}`);
  }
  assert.equal(engine.dashboard(2026, 11).totalAccountBalancePence, base.dashboard(2026, 11).totalAccountBalancePence);
  assert.equal(engine.dashboard(2026, 11).cardBalancePence, base.dashboard(2026, 11).cardBalancePence);
});

test('removing one person moves owed by exactly that person', () => {
  const steve = ds.people.find((person) => person.shortName === 'Steve');
  assert.ok(steve, 'Steve is in the dataset');
  const next = clone();
  next.transactions = next.transactions.filter((tx) => tx.account !== steve.shortName);
  const engine = buildEngine(next);

  const steveBalance = base.owedByPerson(ALL).find((person) => person.shortName === 'Steve')!.balancePence;
  assert.equal(
    base.owedAt(ALL) - engine.owedAt(ALL),
    steveBalance - steve.openingPence,
    'owed falls by Steve\'s movements only; his opening balance survives',
  );
  assert.equal(
    engine.owedByPerson(ALL).find((person) => person.shortName === 'Steve')!.balancePence,
    steve.openingPence,
    'a person with no transactions is back to their opening balance',
  );
  for (const other of ds.people.filter((person) => person.shortName !== 'Steve')) {
    assert.equal(
      engine.owedByPerson(ALL).find((person) => person.shortName === other.shortName)!.balancePence,
      base.owedByPerson(ALL).find((person) => person.shortName === other.shortName)!.balancePence,
      `${other.shortName} is unaffected`,
    );
  }
});
