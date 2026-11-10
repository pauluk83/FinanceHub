import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repoSlug, releaseNotes } from '../scripts/github-release.mjs';
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

test('release notes are taken from the changelog section for the version', () => {
  const notes = releaseNotes(pkg.version);
  assert.match(notes, new RegExp(`^# FinanceHub ${pkg.version.replaceAll('.', '\\.')}`));
  assert.match(notes, /## Windows installer/);
  assert.ok(notes.includes(installerFileName(pkg.version)));
  assert.match(notes, /SHA256SUMS\.txt/);
  assert.doesNotMatch(notes, /stable download name/);
});
