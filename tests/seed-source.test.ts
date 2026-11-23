import test from 'node:test';
import assert from 'node:assert/strict';
import { usesPrivateWorkbook, workbookAlias } from '../app/seedSource.ts';

test('a public build compiles the blank seed, never the private workbook', () => {
  const alias = workbookAlias(false, { webSeed: 'data/web-seed.json', privateWorkbook: 'data/workbook.json' });
  assert.deepEqual(alias, { find: '@workbook', replacement: 'data/web-seed.json' });
});

test('a local build with the private workbook compiles it', () => {
  const alias = workbookAlias(true, { webSeed: 'data/web-seed.json', privateWorkbook: 'data/workbook.json' });
  assert.equal(alias.replacement, 'data/workbook.json');
});

test('hosted and Store builds never compile the private workbook', () => {
  assert.equal(usesPrivateWorkbook({ hosted: false, store: true, hasPrivateWorkbook: true }), false);
  assert.equal(usesPrivateWorkbook({ hosted: true, store: false, hasPrivateWorkbook: true }), false);
  assert.equal(usesPrivateWorkbook({ hosted: false, store: false, hasPrivateWorkbook: true }), true);
  assert.equal(usesPrivateWorkbook({ hosted: false, store: false, hasPrivateWorkbook: false }), false);
});
