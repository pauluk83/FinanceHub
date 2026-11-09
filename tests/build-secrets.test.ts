/**
 * A-01 / P0-8 built-artifact guard.
 *
 * The source seed is covered by tests/vault.test.ts. This test covers what
 * actually ships: the desktop bundle in dist/ and the hosted bundle in
 * dist-web/. The vault's legacy-migration code legitimately names the old
 * fields (`delete provider.accessPassword`), so the guard looks for a field
 * that carries a value — the shape a leaked seed or backup would take.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEXT_FILE = /\.(?:js|mjs|html|json|css)$/i;

/** A legacy credential field followed by a non-empty value, object or true. */
const SERIALIZED_SECRET = /(?:^|[^\w$])(?:accessPassword|accessUsername|chargeLetterPassword|accessBill|plaintextCredentials)["']?\s*:\s*(?:"[^"\n]+"|'[^'\n]+'|!0|true|\{|\[)/;

function textFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) textFiles(full, out);
    else if (TEXT_FILE.test(entry.name)) out.push(full);
  }
  return out;
}

test('the credential scanner catches values but ignores migration code', () => {
  assert.match('{"accessPassword":"hunter2"}', SERIALIZED_SECRET);
  assert.match("accessPassword:'hunter2'", SERIALIZED_SECRET);
  assert.match('chargeLetterPassword:!0', SERIALIZED_SECRET);
  assert.match('{"plaintextCredentials":{"rent":"secret"}}', SERIALIZED_SECRET);
  assert.doesNotMatch('delete provider.accessPassword', SERIALIZED_SECRET);
  assert.doesNotMatch('{key:"accessPassword",label:"Password"}', SERIALIZED_SECRET);
  assert.doesNotMatch('"accessPassword":""', SERIALIZED_SECRET);
});

test('built bundles carry no legacy credential values', (t) => {
  const roots = ['dist', 'dist-web']
    .map((dir) => path.join(ROOT, dir))
    .filter((dir) => fs.existsSync(dir));
  if (roots.length === 0) {
    t.skip('no built bundles present; run npm run release or npm run build:web first');
    return;
  }
  let scanned = 0;
  for (const root of roots) {
    for (const file of textFiles(root)) {
      const text = fs.readFileSync(file, 'utf8');
      scanned += 1;
      assert.equal(
        SERIALIZED_SECRET.test(text),
        false,
        `${path.relative(ROOT, file)} carries a legacy credential value`,
      );
    }
  }
  assert.ok(scanned > 0, 'at least one built text file was scanned');
});
