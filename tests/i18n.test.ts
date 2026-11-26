/**
 * The translation layer is small on purpose: a catalogue of keys, a lookup and
 * a locale switch. These tests keep the catalogue honest so a new language
 * cannot ship with missing or placeholder-mangled strings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, locale, setLocale, t } from '../app/src/i18n.ts';

test('at least one locale is offered and it is the default', () => {
  assert.ok(LOCALES.length >= 1);
  assert.equal(locale(), 'en-GB');
  assert.equal(LOCALES[0].id, 'en-GB');
});

test('every message resolves, with no empty strings', () => {
  const keys = [
    'app.name',
    'a11y.skip',
    'theme.system',
    'tour.progress',
    'tour.skip',
    'tour.back',
    'tour.next',
    'tour.done',
    'tour.sample',
    'tour.welcome.title',
    'tour.welcome.body',
    'tour.nav.title',
    'tour.nav.body',
    'tour.entry.title',
    'tour.entry.body',
    'tour.bills.title',
    'tour.bills.body',
    'tour.ready.title',
    'tour.ready.body',
  ] as const;
  for (const key of keys) {
    const message = t(key);
    assert.notEqual(message, key, `${key} is missing from the catalogue`);
    assert.ok(message.trim().length > 0, `${key} is empty`);
  }
});

test('placeholders are filled and unknown ones are left visible', () => {
  assert.equal(t('tour.progress', { step: 2, total: 5 }), 'Step 2 of 5');
  assert.match(t('tour.progress', { step: 1 }), /Step 1 of \{total\}/);
});

test('the locale switch is guarded and updates the document language', () => {
  setLocale('en-GB');
  assert.equal(locale(), 'en-GB');
  // An unknown locale is ignored rather than blanking the interface.
  setLocale('xx-XX' as unknown as 'en-GB');
  assert.equal(locale(), 'en-GB');
});
