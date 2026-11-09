import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repoSlug, releaseNotes } from '../scripts/github-release.mjs';
import {
  GITHUB_LATEST_RELEASE_API,
  GITHUB_REPO,
  INSTALLER_CHECKSUMS_URL,
  INSTALLER_DOWNLOAD_URL,
  installerFileName,
} from '../app/src/installer.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
  repository?: { url?: string };
};

test('the app links to this repository’s GitHub Releases', () => {
  assert.equal(GITHUB_REPO, 'pauluk83/FinanceHub');
  assert.equal(GITHUB_LATEST_RELEASE_API, 'https://api.github.com/repos/pauluk83/FinanceHub/releases/latest');
  assert.equal(INSTALLER_DOWNLOAD_URL, 'https://github.com/pauluk83/FinanceHub/releases/latest/download/FinanceHub-Setup.exe');
  assert.equal(INSTALLER_CHECKSUMS_URL, 'https://github.com/pauluk83/FinanceHub/releases/latest/download/SHA256SUMS.txt');
  assert.equal(installerFileName('2026.11.9'), 'FinanceHub-Setup-2026.11.9.exe');
});

test('the repository slug comes from package.json', () => {
  assert.equal(repoSlug(pkg.repository), 'pauluk83/FinanceHub');
  assert.equal(repoSlug('git+https://github.com/owner/repo.git'), 'owner/repo');
  assert.equal(repoSlug(''), null);
});

test('release notes are taken from the changelog section for the version', () => {
  const notes = releaseNotes(pkg.version);
  assert.match(notes, new RegExp(`^# FinanceHub ${pkg.version.replaceAll('.', '\\.')}`));
  assert.match(notes, /## Windows installer/);
  assert.match(notes, /FinanceHub-Setup\.exe/);
  assert.match(notes, /SHA256SUMS\.txt/);
});
