import test from 'node:test';
import assert from 'node:assert/strict';
import { CRASH_LIMIT, pushCrash, redactCrashText, type CrashEntry } from '../app/src/crashJournal.ts';

const entry = (index: number): CrashEntry => ({ at: `2026-11-19T00:00:0${index}.000Z`, source: 'error', message: `failure ${index}` });

test('crash text drops paths, URLs, emails and long tokens', () => {
  const text = redactCrashText(
    'Cannot read D:\\finance\\data\\workbook.json from https://example.test/x?y=1 for zane@example.com token 0123456789abcdef0123456789abcdef',
  );
  assert.doesNotMatch(text, /finance\\data/);
  assert.doesNotMatch(text, /example\.test/);
  assert.doesNotMatch(text, /zane@example\.com/);
  assert.doesNotMatch(text, /0123456789abcdef/);
  assert.match(text, /\[path\]/);
  assert.match(text, /\[url\]/);
  assert.match(text, /\[email\]/);
  assert.match(text, /\[token\]/);
});

test('crash text is bounded and readable', () => {
  const text = redactCrashText(`line one\n\nline two ${'x'.repeat(500)}`);
  assert.ok(text.length <= 240);
  assert.match(text, /^line one line two/);
  assert.equal(redactCrashText(new Error('boom')), 'boom');
  assert.equal(redactCrashText(undefined), '');
});

test('the journal keeps the newest entries and never grows past its limit', () => {
  let entries: CrashEntry[] = [];
  for (let index = 0; index < CRASH_LIMIT + 4; index += 1) entries = pushCrash(entries, entry(index));
  assert.equal(entries.length, CRASH_LIMIT);
  assert.match(entries[0].message, new RegExp(`${CRASH_LIMIT + 3}$`));
  assert.match(entries.at(-1)!.message, /^failure 4$/);
});
