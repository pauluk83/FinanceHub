/**
 * Year rollover and later-year views.
 *
 * The provider sheets keep 2027/2028 as imported blocks. These tests pin the
 * resolver that reads them, the bill amounts derived from them, and the
 * rollover that moves the configured year without touching history.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine } from '../core/engine.ts';
import { availableYears, planYearRollover, rolloverYear } from '../core/yearRollover.ts';
import { ensureRowsForEdit, rowsForEdit, rowsForYear } from '../core/providerYears.ts';
import { baselineFor, recalculate } from '../core/providerLedger.ts';
import { carryForwardProviderYears } from '../core/providerCarry.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workbook.json'), 'utf8'));

test('available years include the imported later-year blocks', () => {
  assert.deepEqual(availableYears(load()), [2026, 2027, 2028]);
});

test('later-year bills read their own provider block', () => {
  const engine = buildEngine(load());
  const amount = (year: number, month: number, name: string) =>
    engine.scheduledBills(year, month).find((bill) => bill.name === name)?.amountPence;
  assert.equal(amount(2027, 4, 'Virgin Media'), 3699);
  assert.equal(amount(2027, 3, 'Water'), 4400);
  assert.equal(amount(2027, 4, 'Water'), 0, 'April stays a zero-payment month');
  assert.equal(amount(2027, 7, 'Ovo'), 10900);
  assert.equal(amount(2028, 4, 'Virgin Media'), 4099);
  assert.equal(amount(2026, 10, 'Virgin Media'), 3299, 'the live sheet is still used for 2026');
  assert.equal(amount(2026, 4, 'Water'), 0);
});

test('the provider resolver keeps live rows writable and marks imported blocks', () => {
  const ds = load();
  const live = rowsForYear(ds.providers.o2, 'statement', 2026);
  assert.equal(live?.archived, false);
  assert.equal(live?.rows, ds.providers.o2.statement, 'live rows are the array the editor writes');
  const archived = rowsForYear(ds.providers.o2, 'statement', 2027);
  assert.equal(archived?.archived, true);
  assert.ok((archived?.rows.length ?? 0) > 0);
  assert.equal(rowsForYear(ds.providers.o2, 'statement', 2029), null);
});

test('a future provider block is writable without touching the live sheet', () => {
  const ds = load();
  const edit = rowsForEdit(ds.providers.o2, 'statement', 2027);
  assert.equal(edit?.exists, true);
  assert.equal(edit?.block, true);
  assert.equal(edit?.rows, ds.providers.o2.years['2027'].rows);
  const live = JSON.stringify(ds.providers.o2.statement);
  edit!.rows[0].paymentPence = (edit!.rows[0].paymentPence ?? 0) + 100;
  assert.equal(JSON.stringify(ds.providers.o2.statement), live);
});

test('a missing future block starts from the previous year close', () => {
  const ds = load();
  const close2028 = ds.providers.o2.years['2028'].rows.at(-1).balancePence;
  const edit = ensureRowsForEdit(ds.providers.o2, 'statement', 2029);
  assert.equal(edit.exists, true);
  assert.equal(edit.openingPence, close2028);
  assert.equal(ds.providers.o2.years['2029'].rows, edit.rows);
});

test('editing a future block changes that year without moving the live year', () => {
  const ds = load();
  const before2026 = buildEngine(ds).scheduledBills(2026, 4).find((bill) => bill.name === 'Water')?.amountPence;
  const before2027 = buildEngine(ds).scheduledBills(2027, 4).find((bill) => bill.name === 'Water')?.amountPence;
  assert.equal(before2027, 0, 'the untouched block keeps the deliberate zero-payment month');
  const edit = rowsForEdit(ds.providers.water, 'statement', 2027);
  const april = edit!.rows.find((row: any) => row.month === 'Apr');
  assert.ok(april);
  april.paymentPence = 5000;
  april.paymentEdited = true;
  const engine = buildEngine(ds);
  assert.equal(engine.scheduledBills(2027, 4).find((bill) => bill.name === 'Water')?.amountPence, 5000);
  assert.equal(engine.scheduledBills(2026, 4).find((bill) => bill.name === 'Water')?.amountPence, before2026);
});

test('a 2026 payment edit carries the updated rent balance into 2027', () => {
  const ds = load();
  const rent = ds.providers.rent;
  const spec = { rowsKey: 'entries', formula: 'amount', monthly: false } as const;
  const beforeClose = rent.entries.at(-1).balancePence;
  const before2027Opening = rent.years['2027'].openingPence;
  const before2027First = rent.years['2027'].rows[0].balancePence;
  const before2027Close = rent.years['2027'].closingPence;
  const payment = rent.entries.filter((row: any) => Number(row.amountPence) > 0).at(-1);
  assert.ok(payment);
  payment.amountPence += 1000;
  const baseline = baselineFor(spec, rent.entries, rent.ledgerOpeningPence);
  recalculate(spec, rent.entries, baseline);
  const newClose = rent.entries.at(-1).balancePence;
  assert.equal(newClose, beforeClose + 1000);

  carryForwardProviderYears(rent, spec, 2026, rent.entries, baseline);
  assert.equal(rent.years['2027'].openingPence, newClose);
  assert.equal(rent.years['2027'].openingPence, before2027Opening + 1000);
  assert.equal(rent.years['2027'].rows[0].balancePence, before2027First + 1000);
  assert.equal(rent.years['2027'].closingPence, before2027Close + 1000);
  assert.equal(buildEngine(ds).rentLedger('2027-12-31').balancePence, before2027Close + 1000);
});

test('carrying a savings block forward keeps its plan total-paid history', () => {
  const ds = load();
  const plan = ds.providers.pureCremation;
  const before = JSON.stringify(plan.years);
  carryForwardProviderYears(
    plan,
    { rowsKey: 'statement', formula: 'savings', monthly: true },
    Number(plan.year ?? ds.settings.targetYear),
    plan.statement,
    plan.ledgerOpeningPence,
  );
  assert.equal(JSON.stringify(plan.years), before);
});

test('a forward-year bill plan changes only that year and can skip a bill', () => {
  const ds = load();
  const water = ds.bills.find((bill: any) => bill.name === 'Water');
  assert.ok(water);
  const before2026 = buildEngine(ds).billAmount(water, 2026, 3);
  ds.billChanges.push({
    bill: water.name,
    appliesFrom: '2027-01-01',
    appliesTo: '2027-12-31',
    amountOverridePence: 5500,
    dueDateOverride: '',
    dueDayOverride: 15,
    changeType: 'Year plan 2027',
    note: 'Planned for 2027',
    skip: false,
  });
  const engine = buildEngine(ds);
  assert.equal(engine.billAmount(water, 2026, 3), before2026, 'the earlier year keeps its amount');
  assert.equal(engine.billAmount(water, 2027, 3), 5500);
  assert.equal(engine.billDueDate(water, 2027, 4), '2027-04-15');

  ds.billChanges[ds.billChanges.length - 1].skip = true;
  const skipped = buildEngine(ds);
  assert.equal(skipped.scheduledBills(2027, 3).some((bill) => bill.name === 'Water'), false);
  assert.equal(skipped.scheduledBills(2026, 3).some((bill) => bill.name === 'Water'), true);
});

test('rollover refuses to stay on the same year or move backwards', () => {
  const ds = load();
  assert.equal(planYearRollover(ds, 2026).ok, false);
  assert.equal(planYearRollover(ds, 2025).ok, false);
  assert.equal(planYearRollover(ds, 1999).ok, false);
});

test('rollover moves the anchors and leaves history untouched', () => {
  const ds = load();
  const locks = JSON.stringify(ds.monthLocks);
  const providers = JSON.stringify(ds.providers);
  const transactions = ds.transactions.length;
  const anchor = ds.settings.anchorDate;

  const result = rolloverYear(ds, 2027, '2026-12-31');
  assert.equal(result.ok, true);
  assert.equal(ds.settings.targetYear, 2027);
  assert.equal(ds.settings.asOfDate, '2027-01-01');
  assert.equal(ds.settings.lockCutoff, '2026-12-01');
  assert.equal(ds.settings.anchorDate, anchor);
  assert.equal(JSON.stringify(ds.monthLocks), locks);
  assert.equal(JSON.stringify(ds.providers), providers);
  assert.equal(ds.transactions.length, transactions);
  assert.match(ds.changelog[0].description, /2026 to 2027/);
  assert.equal(ds.changelog[0].date, '2026-12-31');

  const engine = buildEngine(ds);
  assert.equal(engine.scheduledBills(2027, 4).find((bill) => bill.name === 'Virgin Media')?.amountPence, 3699);
});

test('carry-over plans the previous close for every balance', () => {
  const ds = load();
  const result = planYearRollover(ds, 2027, { carryBalances: true });
  assert.equal(result.ok, true);
  const carry = result.plan?.carry;
  assert.ok(carry);
  assert.equal(carry.through, '2026-12-31');
  assert.equal(carry.accountNames.length, ds.accounts.length);
  assert.equal(carry.cardCount, ds.cards.length);
  assert.equal(carry.personCount, ds.people.length);
  assert.equal(carry.providerNames.length, Object.keys(ds.providers).length);
  assert.equal(carry.billNames.length, ds.bills.length);
});

test('carry-over starts the new year from the close and keeps history readable', () => {
  const ds = load();
  const locks = JSON.stringify(ds.monthLocks);
  const transactions = ds.transactions.length;
  const before = buildEngine(ds);
  const accountCloses = before.accountBalances('2026-12-31');
  const cardCloses = before.cardBalances('2026-12-31');
  const peopleCloses = before.owedByPerson('2026-12-31');
  const pureCremationClose = ds.providers.pureCremation.statement[ds.providers.pureCremation.statement.length - 1].balancePence;
  delete ds.providers.pureCremation.years['2027'];

  const result = rolloverYear(ds, 2027, '2026-12-31', { carryBalances: true });
  assert.equal(result.ok, true);
  assert.equal(ds.settings.targetYear, 2027);
  assert.equal(ds.settings.asOfDate, '2027-01-01');
  assert.equal(ds.settings.lockCutoff, '2026-12-01');
  assert.equal(ds.transactions.length, transactions);
  assert.equal(JSON.stringify(ds.monthLocks), locks);

  const opening = ds.settings.yearOpenings?.['2027'];
  assert.ok(opening);
  for (const account of accountCloses) assert.equal(opening.accounts[account.name], account.balancePence);
  for (const card of cardCloses) assert.equal(opening.cards[card.name], card.balancePence);
  for (const person of peopleCloses) assert.equal(opening.people[person.shortName], person.balancePence);

  const engine = buildEngine(ds);
  assert.equal(engine.accountBalances('2027-01-01').find((a) => a.name === 'Starling')?.balancePence,
    accountCloses.find((a) => a.name === 'Starling')?.balancePence);
  assert.equal(engine.cardBalances('2027-01-01').find((c) => c.name === cardCloses[0]?.name)?.balancePence, cardCloses[0]?.balancePence);
  assert.equal(engine.owedAt('2027-01-01'), peopleCloses.filter((p) => p.trackOwed !== false).reduce((sum, p) => sum + p.balancePence, 0));

  assert.equal(ds.providers.o2.year, 2027);
  assert.equal(ds.providers.o2.years['2027'], undefined);
  assert.equal(rowsForYear(ds.providers.o2, 'statement', 2027)?.archived, false);
  assert.equal(rowsForYear(ds.providers.o2, 'statement', 2026)?.archived, true);
  assert.ok(ds.providers.o2.years['2028'], 'the untouched later block stays available');
  assert.equal(engine.scheduledBills(2027, 4).find((bill) => bill.name === 'Virgin Media')?.amountPence, 3699);

  assert.equal(rowsForYear(ds.providers.pureCremation, 'statement', 2027)?.archived, false);
  assert.equal(ds.providers.pureCremation.statement[0].balancePence, pureCremationClose);
  assert.equal(rowsForYear(ds.providers.rent, 'entries', 2027)?.archived, false);
  assert.equal(rowsForYear(ds.providers.rent, 'entries', 2026)?.archived, true);
  assert.equal(ds.providers.rent.year, 2027);
  assert.equal(ds.providers.rent.entries[0].date, '2027-01-04');
  assert.equal(ds.providers.rent.years?.['2027'], undefined, 'the live block is no longer archived');
  assert.equal(engine.rentLedger('2027-12-31').balancePence, 74485);
  assert.match(ds.changelog[0].description, /Balances were carried/);
});
