import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name: string) => readFileSync(new URL(`../app/src/legal/${name}`, import.meta.url), 'utf8');

test('the privacy policy covers financial data, access and erasure', () => {
  const text = read('privacy-policy.md');
  for (const phrase of [
    'financial data',
    'Export full backup',
    'erasure',
    'Supabase',
    'AES-256-GCM',
    'right to access',
    'Zane Stanton',
  ]) {
    assert.ok(text.toLowerCase().includes(phrase.toLowerCase()), `privacy policy is missing: ${phrase}`);
  }
});

test('the terms disclaim financial advice and limit liability', () => {
  const text = read('terms-of-service.md');
  for (const phrase of [
    'not a bank',
    'regulated financial advice',
    'Acceptable use',
    'Limitation of liability',
    'England and Wales',
    'trademark',
  ]) {
    assert.ok(text.toLowerCase().includes(phrase.toLowerCase()), `terms are missing: ${phrase}`);
  }
});

test('the EULA grants a limited licence and protects ownership', () => {
  const text = read('eula.md');
  for (const phrase of [
    'licence grant',
    'Restrictions',
    'licensed, not sold',
    'Limitation of liability',
    'Zane Stanton',
  ]) {
    assert.ok(text.toLowerCase().includes(phrase.toLowerCase()), `EULA is missing: ${phrase}`);
  }
});

test('every legal document names the owner and copyright year', () => {
  for (const file of ['privacy-policy.md', 'terms-of-service.md', 'eula.md']) {
    const text = read(file);
    assert.match(text, /Zane Stanton/, `${file} must name the owner`);
    assert.match(text, /2026/, `${file} must carry the copyright year`);
  }
});
