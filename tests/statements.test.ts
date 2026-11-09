/**
 * Phase 2: golden statement coverage.
 *
 * Every person, card and bank account statement must close at the entity's
 * ledger balance, and month boundaries must chain exactly. The primary account
 * statement uses the same anchor-aware legs as the Dashboard balance (P0-7).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, MONTHS, type Dataset } from '../core/engine.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const ds: Dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));
const engine = buildEngine(ds);
const ALL = '9999-12-31';
const primary = ds.settings.primaryAccount || 'Starling';
const money = (p: number) => `${p < 0 ? '-' : ''}£${(Math.abs(p) / 100).toFixed(2)}`;

test('every person statement closes at opening + lent - repaid', () => {
  const owed = engine.owedByPerson(ALL);
  for (const person of ds.people) {
    const st = engine.statement(person.shortName, null, null);
    assert.equal(
      st.closingPence,
      person.openingPence + st.totalLentPence - st.totalRepaidPence,
      `${person.shortName} statement closes at ${money(st.closingPence)}`,
    );
    if (person.trackOwed !== false) {
      assert.equal(
        st.closingPence,
        owed.find((p) => p.shortName === person.shortName)?.balancePence,
        `${person.shortName} statement agrees with the People ledger`,
      );
    }
  }
});

test('every card statement closes at the card balance', () => {
  const cards = engine.cardBalances(ALL);
  for (const card of ds.cards) {
    const st = engine.statement(card.name, null, null);
    assert.equal(
      st.closingPence,
      cards.find((c) => c.name === card.name)?.balancePence,
      `${card.name} statement closes at ${money(st.closingPence)}`,
    );
  }
});

test('every non-primary bank account statement closes at its ledger balance', () => {
  const accounts = engine.accountBalances(ALL);
  const checked: string[] = [];
  for (const account of ds.accounts) {
    if (account.name === primary) continue;
    const st = engine.statement(account.name, null, null);
    assert.equal(
      st.closingPence,
      accounts.find((a) => a.name === account.name)?.balancePence,
      `${account.name} statement closes at ${money(st.closingPence)}`,
    );
    checked.push(account.name);
  }
  assert.ok(checked.length >= 5, `checked ${checked.length} non-primary accounts`);
});

test('the primary account statement closes at the dashboard balance for every month', () => {
  const asOf = ds.settings.asOfDate;
  const all = engine.statement(primary, 2026, null);
  assert.equal(
    all.closingPence,
    engine.starlingBalance(asOf),
    `all months closes at ${money(all.closingPence)} against a ${money(engine.starlingBalance(asOf))} balance`,
  );
  for (let month = 1; month <= 12; month++) {
    const st = engine.statement(primary, 2026, month);
    const expected = engine.starlingBalance(engine.throughFor(2026, month));
    assert.equal(
      st.closingPence,
      expected,
      `${MONTHS[month - 1]} closes at ${money(st.closingPence)} against a ${money(expected)} balance`,
    );
  }
});

test('the primary account statement chains and runs line by line', () => {
  for (let month = 1; month < 12; month++) {
    const current = engine.statement(primary, 2026, month);
    const next = engine.statement(primary, 2026, month + 1);
    assert.equal(
      current.closingPence,
      next.openingPence,
      `${MONTHS[month - 1]} closes at ${money(current.closingPence)} but ${MONTHS[month]} opens at ${money(next.openingPence)}`,
    );
  }
  const st = engine.statement(primary, 2026, null);
  let running = st.openingPence;
  for (const line of st.lines) {
    running += line.deltaPence;
    assert.equal(line.runningPence, running, `line ${line.date} ${line.comments}`);
  }
  assert.equal(running, st.closingPence);
});

test('monthly statements chain: each closing balance is the next opening', () => {
  const subjects = [
    ...ds.people.map((p) => p.shortName),
    ...ds.cards.map((c) => c.name),
    ...ds.accounts.map((a) => a.name).filter((name) => name !== primary),
  ];
  for (const subject of subjects) {
    for (let month = 1; month < 12; month++) {
      const current = engine.statement(subject, 2026, month);
      const next = engine.statement(subject, 2026, month + 1);
      assert.equal(
        current.closingPence,
        next.openingPence,
        `${subject} ${MONTHS[month - 1]} closes at ${money(current.closingPence)} but ${MONTHS[month]} opens at ${money(next.openingPence)}`,
      );
    }
  }
});

test('statement lines carry a running balance line by line', () => {
  for (const subject of ['Steve', ds.cards[0]?.name, ds.accounts.find((a) => a.name !== primary)?.name]) {
    if (!subject) continue;
    const st = engine.statement(subject, 2026, null);
    let running = st.openingPence;
    for (const line of st.lines) {
      running += line.deltaPence;
      assert.equal(line.runningPence, running, `${subject} line ${line.date}`);
    }
    assert.equal(running, st.closingPence, `${subject} closes at the last running balance`);
  }
});
