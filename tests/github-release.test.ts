import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReleaseAssets, repoSlug, releaseNotes } from '../scripts/github-release.mjs';
import {
  GITHUB_REPO,
  GITHUB_REPO_URL,
  installerChecksumsUrl,
  installerDownloadUrl,
  installerFileName,
} from '../app/src/installer.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
  repository?: { url?: string };
};

test('the app links to this repository’s GitHub Releases', () => {
  assert.equal(GITHUB_REPO, 'pauluk83/FinanceHub');
  assert.equal(GITHUB_REPO_URL, 'https://github.com/pauluk83/FinanceHub');
  assert.equal(installerFileName('2026.11.9'), 'FinanceHub-Setup-2026.11.9.exe');
  assert.equal(installerDownloadUrl('2026.11.9'), 'https://github.com/pauluk83/FinanceHub/releases/download/v2026.11.9/FinanceHub-Setup-2026.11.9.exe');
  assert.equal(installerChecksumsUrl('2026.11.9'), 'https://github.com/pauluk83/FinanceHub/releases/download/v2026.11.9/SHA256SUMS.txt');
});

test('the repository slug comes from package.json', () => {
  assert.equal(repoSlug(pkg.repository), 'pauluk83/FinanceHub');
  assert.equal(repoSlug('git+https://github.com/owner/repo.git'), 'owner/repo');
  assert.equal(repoSlug('pauluk83/FinanceHub'), 'pauluk83/FinanceHub');
  assert.equal(repoSlug('owner/repo.git'), 'owner/repo');
  assert.equal(repoSlug(''), null);
});

test('the published checksum and delta manifest describe the uploaded files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'financehub-release-'));
  try {
    const asarBytes = Buffer.alloc(700 * 1024, 7);
    const installerBytes = Buffer.from('installer bytes for the release test');
    const installerPath = join(dir, 'FinanceHub-Setup-2026.11.28.exe');
    const asarPath = join(dir, 'FinanceHub-app.asar');
    const manifestPath = join(dir, 'update-manifest.json');
    const checksumsPath = join(dir, 'SHA256SUMS.txt');
    writeFileSync(installerPath, installerBytes);
    writeFileSync(asarPath, asarBytes);
    // A manifest left behind by an earlier build: its hashes are all wrong.
    writeFileSync(manifestPath, JSON.stringify({
      schema: 1,
      version: '2026.11.28',
      buildId: 'stale',
      asar: { name: 'FinanceHub-app.asar', size: 1, sha256: 'stale' },
      installer: { name: 'old.exe', size: 1, sha256: 'stale' },
      blocks: [{ offset: 0, size: 1, sha256: 'stale' }],
    }));

    const manifest = prepareReleaseAssets({ installerPath, asarPath, manifestPath, checksumsPath, version: '2026.11.28' });
    const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

    assert.equal(
      readFileSync(checksumsPath, 'utf8'),
      `${sha256(installerBytes)}  FinanceHub-Setup-2026.11.28.exe\n`,
      'the checksum file is derived from the installer being uploaded',
    );
    assert.deepEqual(manifest.asar, {
      // The manifest names a build-id copy, so a same-version rebuild can never
      // describe another build's bytes.
      name: `FinanceHub-app-${manifest.buildId}.asar`,
      size: asarBytes.length,
      sha256: sha256(asarBytes),
    });
    assert.deepEqual(manifest.installer, { name: 'FinanceHub-Setup-2026.11.28.exe', size: installerBytes.length, sha256: sha256(installerBytes) });
    assert.equal(manifest.blocks.length, 3, 'the block list covers the uploaded archive');
    assert.equal(manifest.blocks[0].sha256, sha256(asarBytes.subarray(0, 256 * 1024)));
    assert.notEqual(manifest.buildId, 'stale', 'the manifest carries this build, not the previous one');
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, 'utf8')).asar, manifest.asar, 'the manifest on disk matches the upload');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('release notes are taken from the changelog section for the version', () => {
  const notes = releaseNotes(pkg.version);
  assert.match(notes, new RegExp(`^# FinanceHub ${pkg.version.replaceAll('.', '\\.')}`));
  assert.match(notes, /## Windows installer/);
  assert.ok(notes.includes(installerFileName(pkg.version)));
  assert.match(notes, /SHA256SUMS\.txt/);
  assert.doesNotMatch(notes, /stable download name/);
});
