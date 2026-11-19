/**
 * Release evidence: a CycloneDX-style SBOM, a claims list and artifact hashes.
 *
 * This is generated, never committed: CI attaches the two files to the GitHub
 * release next to the installer, so anyone downloading a build can see what is
 * inside it, what it claims and what it deliberately does not do.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './app-changelog.mjs';

const OUT_DIR = join(ROOT, 'release');
const SBOM_FILE = join(OUT_DIR, 'SBOM.json');
const CLAIMS_FILE = join(OUT_DIR, 'RELEASE_CLAIMS.md');

/** Production packages from package-lock.json, as CycloneDX components. */
export function buildSbom({ name, version, lock, now = new Date().toISOString() }) {
  const packages = lock?.packages ?? {};
  const seen = new Set();
  const components = [];
  for (const [path, meta] of Object.entries(packages)) {
    if (!path.startsWith('node_modules/')) continue;
    if (!meta || typeof meta !== 'object') continue;
    if (meta.dev || meta.link) continue;
    if (meta.optional && !meta.version) continue;
    // A nested install still lives under the last node_modules/ segment.
    const marker = path.lastIndexOf('node_modules/');
    const componentName = typeof meta.name === 'string' && meta.name
      ? meta.name
      : path.slice(marker + 'node_modules/'.length);
    const componentVersion = typeof meta.version === 'string' ? meta.version : 'unknown';
    const key = `${componentName}@${componentVersion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    components.push({
      type: 'library',
      name: componentName,
      version: componentVersion,
      purl: `pkg:npm/${componentName}@${componentVersion}`,
      scope: 'required',
    });
  }
  components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.4',
    version: 1,
    metadata: {
      timestamp: now,
      tools: [{ vendor: 'FinanceHub', name: 'release-evidence', version: '1' }],
      component: { type: 'application', name, version },
    },
    components,
  };
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * The literal claims this build may make. Anything that needs code signing, a
 * hosted provider or a live account is deliberately absent.
 */
export function claimsMarkdown({ version, buildId, artifacts, now = new Date().toISOString() }) {
  const lines = [
    `# FinanceHub ${version} — release claims`,
    '',
    `Generated: ${now}`,
    `Build id: ${buildId ?? 'unpublished local build'}`,
    '',
    '## Artifacts',
    '',
    '| File | Bytes | SHA-256 |',
    '| --- | ---: | --- |',
  ];
  if (artifacts.length === 0) lines.push('| (no artifacts present) | — | — |');
  for (const artifact of artifacts) {
    lines.push(`| ${artifact.name} | ${artifact.bytes} | \`${artifact.sha256}\` |`);
  }
  lines.push(
    '',
    '## What this build claims',
    '',
    '- The budget is calculated by one pure TypeScript engine in integer pence; the workbook parity suite passes.',
    '- Provider credentials live only in the passphrase-derived encrypted vault; built bundles are scanned for legacy plaintext credential values.',
    '- The renderer runs with context isolation and sandboxing, no Node integration and a production Content-Security-Policy that fails closed to the exact configured origin.',
    '- Cloud sync stores the budget document in Supabase under row-level security scoped to the signed-in user; the vault stays end-to-end encrypted.',
    '- Imports are staged, validated and committed as a batch that can be rolled back; CSV formulas are neutralised and URLs restricted to HTTP(S).',
    '- Backups are encrypted (v2) with a checksum, and seven restore points are retained.',
    '- Health checks and one-click fixes are read-only until a fix is previewed and applied, and every repair is recorded in the audit log and budget changelog.',
    '- The installer and updater are unsigned. SHA-256 verification detects corruption but is not a substitute for code signing; Windows may show an unknown-publisher warning.',
    '- The app makes no telemetry or crash-reporting requests and needs no account for a device-only workspace.',
    '',
    '## What this build does not claim',
    '',
    '- No independent penetration test, no code signing, no SOC/ISO certification.',
    '- No regulated banking service: bank linking is CSV import (and a desktop-only owner Starling feed), not Open Banking.',
    '- No legal advice: the privacy notice and terms still need professional review before public signup.',
    '',
  );
  return lines.join('\n');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Write the evidence files and return their paths. Missing artifacts are skipped. */
export function writeReleaseEvidence({ outDir = OUT_DIR, root = ROOT } = {}) {
  const pkg = readJson(join(root, 'package.json')) ?? { name: 'financehub', version: '0.0.0' };
  const lock = readJson(join(root, 'package-lock.json')) ?? {};
  const manifest = readJson(join(root, 'release', 'update', 'update-manifest.json'));
  const candidates = [
    join(root, 'release', `FinanceHub-Setup-${pkg.version}.exe`),
    join(root, 'release', 'update', 'FinanceHub-app.asar'),
  ];
  const artifacts = candidates
    .filter((path) => existsSync(path))
    .map((path) => ({
      name: path.split(/[\\/]/).pop(),
      bytes: readFileSync(path).length,
      sha256: sha256File(path),
    }));
  const bom = buildSbom({ name: pkg.name ?? 'financehub', version: pkg.version, lock });
  const claims = claimsMarkdown({
    version: pkg.version,
    buildId: manifest?.buildId ?? null,
    artifacts,
  });
  mkdirSync(outDir, { recursive: true });
  const sbomFile = join(outDir, 'SBOM.json');
  const claimsFile = join(outDir, 'RELEASE_CLAIMS.md');
  writeFileSync(sbomFile, `${JSON.stringify(bom, null, 2)}\n`);
  writeFileSync(claimsFile, claims);
  return { sbomFile, claimsFile, components: bom.components.length, artifacts };
}

function run() {
  const result = writeReleaseEvidence();
  console.log(`release evidence: ${result.components} production components, ${result.artifacts.length} artifacts`);
  for (const artifact of result.artifacts) {
    console.log(`  ${artifact.name} ${artifact.bytes} bytes ${artifact.sha256}`);
  }
  console.log(`  ${result.sbomFile}`);
  console.log(`  ${result.claimsFile}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  run();
}
