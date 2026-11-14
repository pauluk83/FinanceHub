/**
 * Build the GitHub assets used by the in-app delta updater.
 *
 * Run after `electron-builder` has produced release/win-unpacked. The manifest
 * contains only hashes and sizes; the archive itself is uploaded beside it and
 * fetched with HTTP ranges so existing installs download changed blocks only.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, buildId, parseChangelog } from './app-changelog.mjs';

const BLOCK_SIZE = 256 * 1024;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function updateNotes(root = ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const release = parseChangelog(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'))
    .find((entry) => entry.version === pkg.version);
  return release?.sections.flatMap((section) => section.items).slice(0, 20) ?? [];
}

export function electronVersion(root = ROOT) {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
  } catch {
    return '';
  }
}

export function buildUpdateArtifacts({ root = ROOT, blockSize = BLOCK_SIZE } = {}) {
  const asarPath = join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
  if (!existsSync(asarPath)) throw new Error(`${asarPath} is missing — build the Windows app first.`);

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const bytes = readFileSync(asarPath);
  const blocks = [];
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    const size = Math.min(blockSize, bytes.length - offset);
    blocks.push({ offset, size, sha256: sha256(bytes.subarray(offset, offset + size)) });
  }

  const installerPath = join(root, 'release', `FinanceHub-Setup-${pkg.version}.exe`);
  const installer = existsSync(installerPath)
    ? { name: `FinanceHub-Setup-${pkg.version}.exe`, size: statSync(installerPath).size, sha256: sha256(readFileSync(installerPath)) }
    : undefined;
  const runtime = electronVersion(root);

  const manifest = {
    schema: 1,
    version: pkg.version,
    buildId: buildId(root),
    generatedAt: new Date().toISOString(),
    blockSize,
    runtime: runtime ? { electron: runtime } : undefined,
    asar: { name: 'FinanceHub-app.asar', size: bytes.length, sha256: sha256(bytes) },
    blocks,
    installer,
    notes: updateNotes(root),
  };

  const outDir = join(root, 'release', 'update');
  mkdirSync(outDir, { recursive: true });
  copyFileSync(asarPath, join(outDir, 'FinanceHub-app.asar'));
  writeFileSync(join(outDir, 'update-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifestPath: join(outDir, 'update-manifest.json'),
    asarPath: join(outDir, 'FinanceHub-app.asar'),
    manifest,
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { manifestPath, asarPath, manifest } = buildUpdateArtifacts();
  console.log(`update manifest: ${manifest.version} ${manifest.buildId}, ${manifest.blocks.length} blocks (${(manifest.asar.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`update assets: ${asarPath}, ${manifestPath}`);
}
