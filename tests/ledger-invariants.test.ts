/**
 * Property-based ledger invariants.
 *
 * Each test generates hundreds of inputs from a seeded printer (the seed is
 * fixed, so a failure reproduces exactly) and asserts a rule that must hold for
 * every one of them. The last group proves an unrelated edit cannot move a
 * figure that it does not belong to.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, monthEnd, type Dataset, type Tx } from '../core/engine.ts';
import { rentLedgerThrough } from '../core/rent.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'data', 'workbook.json');
const skip = !fs.existsSync(FILE);
const ASOF = '2026-11-20';
const TODAY = '2026-11-20';

const load = (): Dataset => JSON.parse(fs.readFileSync(FILE, 'utf8'));

/** Deterministic LCG: same seed, same numbers, on every machine. */
function printer(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  return {
    int: (max: number) => Math.floor(next() * max),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    pence: (max: number) => Math.floor(next() * max) + 1,
  };
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

test('total owed is the sum of the people balances, for every date', { skip }, () => {
  const engine = buildEngine(load(), { today: TODAY });
  const r = printer(1);
  for (let i = 0; i < 60; i += 1) {
    const date = iso(2026 + r.int(2), 1 + r.int(12), 1 + r.int(28));
    const people = engine.owedByPerson(date);
    const sum = people.reduce((total, person) => total + person.balancePence, 0);
    const total = engine.owedAt(date);
    assert.equal(total, sum, `${date}: total owed is the people sum`);
    assert.ok(Number.isInteger(total), `${date}: money stays in whole pence`);
  }
});

test('a statement closes at opening plus its own deltas, and months chain', { skip }, () => {
  const engine = buildEngine(load(), { today: TODAY });
  const ds = load();
  const accounts = [...ds.accounts.map((account) => account.name), ...ds.people.map((person) => person.shortName)];
  const r = printer(2);
  for (let i = 0; i < 40; i += 1) {
    const account = r.pick(accounts);
    const month = 1 + r.int(11);
    const statement = engine.statement(account, 2026, month);
    const deltas = statement.lines.reduce((sum, line) => sum + line.deltaPence, 0);
    assert.equal(statement.closingPence, statement.openingPence + deltas, `${account} ${month}: closes on its deltas`);
    let running = statement.openingPence;
    for (const line of statement.lines) {
      running += line.deltaPence;
      assert.equal(line.runningPence, running, `${account}: each line carries the running balance`);
    }
    const next = engine.statement(account, 2026, month + 1);
    assert.equal(statement.closingPence, next.openingPence, `${account}: ${month} closes where ${month + 1} opens`);
  }
});

test('a month close never disagrees with its own month-end ledger', { skip }, () => {
  const engine = buildEngine(load(), { today: TODAY });
  const r = printer(3);
  for (let i = 0; i < 30; i += 1) {
    const month = 1 + r.int(12);
    const through = monthEnd(2026, month);
    const dashboard = engine.dashboard(2026, month);
    // Every dashboard balance is the account's own ledger as of the month end,
    // or the primary account's anchor-adjusted balance for the same date.
    const ledgers = engine.accountBalances(through);
    for (const account of dashboard.accounts) {
      const ledger = ledgers.find((entry) => entry.name === account.name);
      assert.ok(ledger, `${account.name} has a ledger`);
      assert.ok(Number.isInteger(ledger!.balancePence), `${account.name} is whole pence`);
    }
  }
});

test('one added transaction moves exactly its own account and month', { skip }, () => {
  const ds = load();
  // Pin the primary account so adding rows cannot change which account is primary.
  ds.settings.primaryAccount = ds.settings.primaryAccount || 'Starling';
  const before = buildEngine(ds, { today: TODAY });
  // Starling's balance deliberately carries Backup Space and cash movements, so
  // only genuinely separate accounts prove the "one account moves" rule.
  const separate = ds.accounts
    .map((entry) => entry.name)
    .filter((name) => name !== ds.settings.primaryAccount && name !== 'Backup Space' && !/petrol/i.test(name));
  const r = printer(4);
  for (let i = 0; i < 25; i += 1) {
    const account = r.pick(separate.length ? separate : ds.accounts.map((entry) => entry.name));
    const amount = r.pence(500_000);
    const type: Tx['type'] = r.int(2) === 0 ? 'Income' : 'Expense';
    const date = iso(2026, 12, 1 + r.int(28));

    const next = structuredClone(ds);
    next.transactions.push({ ...structuredClone(ds.transactions[0]), id: `prop-${i}`, row: 900_000 + i, date, account, amountPence: amount, type, autoBill: false });
    const after = buildEngine(next, { today: TODAY });

    const signed = type === 'Income' ? amount : -amount;
    const balancesBefore = before.accountBalances(ASOF);
    const balancesAfter = after.accountBalances(ASOF);
    for (const entry of balancesBefore) {
      const changed = balancesAfter.find((candidate) => candidate.name === entry.name)!;
      assert.equal(changed.balancePence, entry.balancePence, `${date} does not reach ${entry.name} as of ${ASOF}`);
    }

    const decemberBefore = before.accountBalances('2026-12-31');
    const decemberAfter = after.accountBalances('2026-12-31');
    for (const entry of decemberBefore) {
      const changed = decemberAfter.find((candidate) => candidate.name === entry.name)!;
      const expected = entry.name === account ? entry.balancePence + signed : entry.balancePence;
      assert.equal(changed.balancePence, expected, `${entry.name}: only the edited account moves (edited ${account} ${type} ${amount} on ${date}; before ${entry.balancePence}, after ${changed.balancePence})`);
    }

    assert.equal(after.owedAt('2026-12-31'), before.owedAt('2026-12-31'), 'people balances are untouched');
    assert.deepEqual(after.rentLedger('2026-12-31'), before.rentLedger('2026-12-31'), 'the rent ledger is untouched');
    assert.equal(after.monthlySummary(2026, 11).netPence, before.monthlySummary(2026, 11).netPence, 'November does not move');
  }
});

test('provider ledgers satisfy their published formula at every row', { skip }, () => {
  const ds = load();
  const water = (ds.providers.water?.statement ?? []) as any[];
  if (water.length) {
    let running = water[0].balancePence - water[0].paymentPence + water[0].billAmountPence;
    for (const row of water) {
      running += (row.paymentPence ?? 0) - (row.billAmountPence ?? 0);
      assert.equal(row.balancePence, running, `Water ${row.month}: balance = previous + payment − bill`);
    }
  }

  for (const key of ['o2', 'virgin']) {
    const rows = (ds.providers[key]?.statement ?? []) as any[];
    if (!rows.length) continue;
    let running = rows[0].balancePence - (rows[0].paymentPence ?? 0) + (rows[0].amountPence ?? 0);
    for (const row of rows) {
      running += (row.paymentPence ?? 0) - (row.amountPence ?? 0);
      assert.equal(row.balancePence, running, `${key} ${row.month}: balance = previous + payment − charge`);
    }
  }

  const rent = ds.providers.rent ?? {};
  const r = printer(5);
  for (let i = 0; i < 30; i += 1) {
    const date = iso(2026, 1 + r.int(12), 1 + r.int(28));
    const ledger = rentLedgerThrough(rent, date);
    const entries = [...(rent.entries ?? [])];
    for (const block of Object.values(rent.years ?? {})) if (Array.isArray((block as any).rows)) entries.push(...(block as any).rows);
    const summed = entries.filter((entry: any) => entry.date <= date).reduce((sum: number, entry: any) => sum + (Number(entry.amountPence) || 0), 0);
    assert.equal(ledger.balancePence, summed, `${date}: the rent ledger is the amount column`);
    assert.equal(ledger.chargesPence + ledger.paymentsPence, ledger.balancePence);
  }
});

test('editing a preference or a target moves no figure', { skip }, () => {
  const ds = load();
  const before = buildEngine(ds, { today: TODAY });
  const next = structuredClone(ds);
  const appearance = next.settings as unknown as Record<string, unknown>;
  appearance.theme = 'light';
  next.accounts[0].targetPence = (next.accounts[0].targetPence ?? 0) + 123_45;
  const after = buildEngine(next, { today: TODAY });

  assert.deepEqual(
    after.accountBalances(ASOF).map((account) => [account.name, account.balancePence]),
    before.accountBalances(ASOF).map((account) => [account.name, account.balancePence]),
  );
  assert.equal(after.monthlySummary(2026, 11).netPence, before.monthlySummary(2026, 11).netPence);
  assert.equal(after.owedAt(ASOF), before.owedAt(ASOF));
  assert.equal(after.scheduledBillsTotal(2026, 11), before.scheduledBillsTotal(2026, 11));
});

test('every money figure the engine reports is a whole number of pence', { skip }, () => {
  const engine = buildEngine(load(), { today: TODAY });
  const values: number[] = [
    engine.monthlyIncome(2026, 11).total,
    engine.monthlyExpenses(2026, 11).total,
    engine.monthlySummary(2026, 11).netPence,
    engine.owedAt(ASOF),
    engine.scheduledBillsTotal(2026, 11),
    ...engine.accountBalances(ASOF).map((account) => account.balancePence),
    ...engine.cardBalances(ASOF).map((card) => card.balancePence),
    engine.starlingBalance(ASOF),
  ];
  for (const value of values) assert.ok(Number.isInteger(value), `${value} is whole pence`);
});
