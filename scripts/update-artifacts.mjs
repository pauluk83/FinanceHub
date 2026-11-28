/**
 * Build the GitHub assets used by the in-app delta updater.
 *
 * Run after `electron-builder` has produced release/win-unpacked. The manifest
 * contains only hashes and sizes; the archive itself is uploaded beside it and
 * fetched with HTTP ranges so existing installs download changed blocks only.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/**
 * The manifest rows for the archive and installer exactly as given. Publishing
 * derives them from the bytes being uploaded, so a stale copy left in release/
 * can never describe a different file.
 */
export function artifactManifest(manifest, { asarBytes, installerBytes, installerName, blockSize = BLOCK_SIZE }) {
  const blocks = [];
  for (let offset = 0; offset < asarBytes.length; offset += blockSize) {
    const size = Math.min(blockSize, asarBytes.length - offset);
    blocks.push({ offset, size, sha256: sha256(asarBytes.subarray(offset, offset + size)) });
  }
  return {
    ...manifest,
    blockSize,
    asar: { name: 'FinanceHub-app.asar', size: asarBytes.length, sha256: sha256(asarBytes) },
    blocks,
    ...(installerBytes && installerName
      ? { installer: { name: installerName, size: installerBytes.length, sha256: sha256(installerBytes) } }
      : {}),
  };
}

export function buildUpdateArtifacts({ root = ROOT, blockSize = BLOCK_SIZE } = {}) {
  const asarPath = join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
  if (!existsSync(asarPath)) throw new Error(`${asarPath} is missing — build the Windows app first.`);

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const bytes = readFileSync(asarPath);

  const installerPath = join(root, 'release', `FinanceHub-Setup-${pkg.version}.exe`);
  const installerBytes = existsSync(installerPath) ? readFileSync(installerPath) : undefined;
  const runtime = electronVersion(root);

  const manifest = artifactManifest({
    schema: 1,
    version: pkg.version,
    buildId: buildId(root),
    generatedAt: new Date().toISOString(),
    runtime: runtime ? { electron: runtime } : undefined,
    notes: updateNotes(root),
  }, {
    asarBytes: bytes,
    installerBytes,
    installerName: installerBytes ? `FinanceHub-Setup-${pkg.version}.exe` : undefined,
    blockSize,
  });

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
