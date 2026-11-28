import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine, type Dataset } from '../core/engine.ts';
import {
  reconcileAccountOpening,
  restoreStarlingAnchorPayment,
  STARLING_ANCHOR_PAYMENT_PENCE,
  STARLING_STATEMENT_CLOSE,
  STARLING_STATEMENT_CLOSE_PENCE,
} from '../core/accountRepairs.ts';

const workbook = () => {
  const root = path.resolve(import.meta.dirname, '..');
  return JSON.parse(fs.readFileSync(path.join(root, 'data', 'workbook.json'), 'utf8')) as Dataset;
};

const starling = (ds: Dataset) => ds.accounts.find((account) => /^starling$/i.test(account.name))!;

/** Move the opening so 26 November lands exactly one payment short of the close. */
const makeOnePaymentShort = (ds: Dataset) => {
  const balance = buildEngine(ds).starlingBalance(STARLING_STATEMENT_CLOSE);
  const target = STARLING_STATEMENT_CLOSE_PENCE - STARLING_ANCHOR_PAYMENT_PENCE;
  starling(ds).openingPence += target - balance;
};

test('the one payment the anchor missed is put back once, to the statement close', () => {
  const ds = workbook();
  makeOnePaymentShort(ds);
  const opening = starling(ds).openingPence;
  assert.notEqual(buildEngine(ds).starlingBalance(STARLING_STATEMENT_CLOSE), STARLING_STATEMENT_CLOSE_PENCE);

  assert.equal(restoreStarlingAnchorPayment(ds), true, 'the repair fires');
  assert.equal(starling(ds).openingPence, opening + STARLING_ANCHOR_PAYMENT_PENCE);
  assert.equal(
    buildEngine(ds).starlingBalance(STARLING_STATEMENT_CLOSE),
    STARLING_STATEMENT_CLOSE_PENCE,
    '26 November closes at £0.17',
  );

  assert.equal(restoreStarlingAnchorPayment(ds), false, 'a second pass changes nothing');
  assert.equal(starling(ds).openingPence, opening + STARLING_ANCHOR_PAYMENT_PENCE);
});

test('the 27 November balance is evidence of the same missing payment', () => {
  const ds = workbook();
  const balance = buildEngine(ds).starlingBalance('2026-11-27');
  starling(ds).openingPence += (46185 - STARLING_ANCHOR_PAYMENT_PENCE) - balance;

  assert.equal(restoreStarlingAnchorPayment(ds), true, 'the repair fires on the 27th too');
  assert.equal(buildEngine(ds).starlingBalance('2026-11-27'), 46185, '27 November reads £461.85');
  assert.equal(restoreStarlingAnchorPayment(ds), false, 'and only once');
});

test('reconciling moves the opening so the balance matches the bank', () => {
  const ds = workbook();
  const account = starling(ds);
  const opening = account.openingPence;

  const date = '2026-11-27';
  const current = buildEngine(ds).starlingBalance(date);
  const delta = reconcileAccountOpening(ds, 'Starling', date, 46185, current);
  assert.equal(delta, 46185 - current, 'the whole difference goes to the opening');
  assert.equal(account.openingPence, opening + delta);
  assert.equal(buildEngine(ds).starlingBalance(date), 46185, 'and the date reads the bank figure');

  assert.equal(reconcileAccountOpening(ds, 'Starling', date, 46185, 46185), 0, 'a matching figure changes nothing');
  assert.equal(reconcileAccountOpening(ds, 'Missing', date, 1, 0), 0, 'an unknown account changes nothing');
});

test('a year rollover snapshot is reconciled instead of the account opening', () => {
  const ds = workbook();
  ds.settings.yearOpenings = { 2026: { accounts: { Starling: 5_000 }, people: {} } };
  const opening = starling(ds).openingPence;
  const date = '2026-11-27';
  const current = buildEngine(ds).starlingBalance(date);

  assert.equal(reconcileAccountOpening(ds, 'Starling', date, current - 1_000, current), -1_000);
  assert.equal((ds.settings.yearOpenings as any)[2026].accounts.Starling, 4_000, 'the snapshot moves');
  assert.equal(starling(ds).openingPence, opening, 'the account own opening is left alone');
  assert.equal(buildEngine(ds).starlingBalance(date), current - 1_000, 'and the balance follows it');
});

test('a budget that is not one payment short is left alone', () => {
  const ds = workbook();
  const opening = starling(ds).openingPence;
  assert.equal(restoreStarlingAnchorPayment(ds), false, 'the workbook balance is not the fault');
  assert.equal(starling(ds).openingPence, opening);

  const withoutStarling = workbook();
  withoutStarling.accounts = withoutStarling.accounts.filter((account) => !/^starling$/i.test(account.name));
  assert.equal(restoreStarlingAnchorPayment(withoutStarling), false, 'no Starling account, nothing to repair');
});
