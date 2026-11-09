import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../app/src/version.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const source = (name: string) => readFileSync(new URL(`../app/src/${name}`, import.meta.url), 'utf8');

test('the version constant is the package version', () => {
  assert.equal(APP_VERSION, pkg.version);
});

test('the version is the release date, not a running patch number', () => {
  assert.match(APP_VERSION, /^\d{4}\.\d{1,2}\.\d{1,2}$/, 'use YYYY.M.D so the version says when it shipped');
});

test('the web footer and legal pages use the shared version', () => {
  assert.match(source('App.tsx'), /\{APP_VERSION\}/);
  assert.doesNotMatch(source('App.tsx'), />v\d/, 'the sidebar must not hardcode a version');
  assert.match(source('legal.ts'), /LEGAL_VERSION = APP_VERSION/);
});

test('the desktop shell reports the same package version', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.match(main, /app\.getVersion\(\)/);
});
