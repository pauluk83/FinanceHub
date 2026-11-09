import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_BACKUP_BYTES,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  backupFileProblem,
  countCsvRows,
  csvFileProblem,
  csvRowProblem,
} from '../core/importLimits.ts';
import { decodeBackupDataset, findUnsafeUrlField } from '../app/src/backup.ts';
import { csvCell, toCsv } from '../app/src/format.ts';

function validBackup() {
  return {
    settings: {
      targetYear: 2026,
      startMonth: 1,
      monthsInYear: 12,
      currency: '£',
      asOfDate: '2026-11-06',
      lockCutoff: '2026-11-01',
      anchorDate: '2026-07-08',
    },
    accounts: [],
    people: [],
    cards: [],
    bills: [],
    billChanges: [],
    transactions: [],
    holidays: {},
    providers: {
      rent: {
        portalUrl: 'https://example.com/rent',
        chargeLetterUrl: 'http://example.com/letter',
      },
    },
    incomeSchedules: { pip: [], uc: [] },
    monthLocks: {},
    changelog: [],
    audit: [],
  };
}

test('CSV files are rejected by size and row count before parsing', () => {
  assert.equal(csvFileProblem(MAX_CSV_BYTES), null);
  assert.ok(csvFileProblem(MAX_CSV_BYTES + 1));
  assert.ok(csvFileProblem(0));

  assert.equal(csvRowProblem(MAX_CSV_ROWS), null);
  assert.ok(csvRowProblem(MAX_CSV_ROWS + 1));

  assert.equal(backupFileProblem(MAX_BACKUP_BYTES), null);
  assert.ok(backupFileProblem(MAX_BACKUP_BYTES + 1));
});

test('row counting ignores the header and a trailing newline', () => {
  assert.equal(countCsvRows('Date,Amount\n01/11/2026,-1.00\n02/11/2026,-2.00\n'), 2);
  assert.equal(countCsvRows('Date,Amount\n01/11/2026,-1.00'), 1);
  assert.equal(countCsvRows(''), 0);
});

test('provider URLs must use http or https without embedded credentials', () => {
  const safe = validBackup();
  assert.equal(findUnsafeUrlField(safe), null);
  assert.ok(decodeBackupDataset(safe), 'an https/http provider link is restorable');

  for (const unsafe of ['javascript:alert(1)', 'data:text/html,x', 'file:///C:/secret', 'https://user:pass@example.com/']) {
    const bad = validBackup();
    bad.providers.rent.portalUrl = unsafe;
    assert.equal(findUnsafeUrlField(bad), 'providers.rent.portalUrl');
    assert.equal(decodeBackupDataset(bad), null, `${unsafe} must be rejected`);
  }
});

test('a nested ledger URL is checked too', () => {
  const bad = validBackup() as unknown as { providers: Record<string, unknown> };
  bad.providers.ovo = { statement: [{ billUrl: 'javascript:alert(1)' }] };
  assert.equal(decodeBackupDataset(bad), null);
});

test('the live workbook backup still passes URL validation', () => {
  const dataset = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'workbook.json'), 'utf8'),
  );
  assert.ok(decodeBackupDataset(dataset), 'the current seed must be restorable');
});

test('CSV formula cells become literal text, but numbers stay numeric', () => {
  assert.equal(csvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(csvCell('+cmd|calc'), "'+cmd|calc");
  assert.equal(csvCell('@SUM'), "'@SUM");
  assert.equal(csvCell('-£12.34'), "'-£12.34");
  assert.equal(csvCell('-42'), '-42');
  assert.equal(csvCell(-42), '-42');
  assert.equal(csvCell(12.5), '12.5');
  assert.equal(csvCell('ordinary text'), 'ordinary text');
  assert.equal(csvCell(null), '');
});

test('formula neutralisation happens before CSV quoting', () => {
  const line = toCsv([['=a,b'], ['plain']]);
  assert.equal(line, `"'=a,b"\r\nplain`);
});
