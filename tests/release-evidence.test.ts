import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildSbom, claimsMarkdown, writeReleaseEvidence } from '../scripts/release-evidence.mjs';

const lock = {
  packages: {
    '': { name: 'financehub', version: '1.0.0' },
    'node_modules/react': { version: '19.3.1' },
    'node_modules/react-dom': { version: '19.3.1' },
    'node_modules/@supabase/supabase-js': { version: '2.0.0' },
    'node_modules/@supabase/supabase-js/node_modules/@supabase/auth-js': { version: '2.1.0' },
    'node_modules/typescript': { version: '7.0.2', dev: true },
    'node_modules/.bin/typescript': { link: true },
  },
};

test('the SBOM lists production packages only, sorted, with purls', () => {
  const bom = buildSbom({ name: 'financehub', version: '2026.11.19', lock, now: '2026-11-19T00:00:00.000Z' });
  assert.equal(bom.bomFormat, 'CycloneDX');
  assert.equal(bom.metadata.component.version, '2026.11.19');
  assert.deepEqual(bom.components.map((c: { name: string }) => c.name), [
    '@supabase/auth-js',
    '@supabase/supabase-js',
    'react',
    'react-dom',
  ]);
  assert.equal(bom.components[0].purl, 'pkg:npm/@supabase/auth-js@2.1.0');
  assert.equal(bom.components.some((c: { name: string }) => c.name === 'typescript'), false);
});

test('the claims list states the unsigned and no-telemetry position and hashes artifacts', () => {
  const claims = claimsMarkdown({
    version: '2026.11.19',
    buildId: 'abc123',
    artifacts: [{ name: 'FinanceHub-Setup-2026.11.19.exe', bytes: 10, sha256: 'f'.repeat(64) }],
    now: '2026-11-19T00:00:00.000Z',
  });
  assert.match(claims, /FinanceHub 2026\.11\.19/);
  assert.match(claims, /Build id: abc123/);
  assert.match(claims, /unsigned/);
  assert.match(claims, /no telemetry/);
  assert.match(claims, /f{64}/);
  assert.match(claims, /does not claim/);
  assert.match(claims, /No independent penetration test/);
});

test('writing evidence creates both files and reports missing artifacts honestly', () => {
  const root = join('tmp', 'evidence-test');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, 'release'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'financehub', version: '2026.11.19' }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
  const result = writeReleaseEvidence({ root, outDir: join(root, 'release') });
  assert.equal(result.artifacts.length, 0);
  assert.ok(existsSync(result.sbomFile));
  assert.ok(existsSync(result.claimsFile));
  assert.match(readFileSync(result.claimsFile, 'utf8'), /no artifacts present/);
  assert.equal(JSON.parse(readFileSync(result.sbomFile, 'utf8')).components.length, 4);
  rmSync(root, { recursive: true, force: true });
});
