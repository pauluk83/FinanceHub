import test from 'node:test';
import assert from 'node:assert/strict';
import { workbookAlias } from '../app/seedSource.ts';

test('a public build compiles the blank seed, never the private workbook', () => {
  const alias = workbookAlias(false, { webSeed: 'data/web-seed.json', privateWorkbook: 'data/workbook.json' });
  assert.deepEqual(alias, { find: '@workbook', replacement: 'data/web-seed.json' });
});

test('a local build with the private workbook compiles it', () => {
  const alias = workbookAlias(true, { webSeed: 'data/web-seed.json', privateWorkbook: 'data/workbook.json' });
  assert.equal(alias.replacement, 'data/workbook.json');
});
