import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_CHANGELOG } from '../app/src/appChangelog.generated.ts';
import { buildId, parseChangelog } from '../scripts/app-changelog.mjs';
import { addNote, prepareRelease, releaseVersion, sameDayTagNotice, versionTagProblem } from '../scripts/release.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

test('the generated changelog matches the package and the source changelog', () => {
  assert.equal(APP_CHANGELOG.version, pkg.version);
  assert.match(APP_CHANGELOG.buildId, /^[0-9a-f]{12}$/);
  const releases = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  assert.deepEqual(APP_CHANGELOG.releases.map((release) => release.version), releases.map((release) => release.version));
  assert.ok(APP_CHANGELOG.releases[0].sections.some((section) => section.items.length > 0), 'the newest release needs content');
});

test('the changelog parser keeps headings, dates and bullets', () => {
  const releases = parseChangelog('## [9.9.9] — 1 January 2030\n### Added\n- A feature\n- Another\n### Fixed\n- A bug\n');
  assert.deepEqual(releases, [{
    version: '9.9.9',
    date: '1 January 2030',
    sections: [
      { title: 'Added', items: ['A feature', 'Another'] },
      { title: 'Fixed', items: ['A bug'] },
    ],
  }]);
});

test('the build id is deterministic for the same source', () => {
  assert.equal(buildId(), buildId());
});

test('the build id ignores the line endings a checkout happens to use', () => {
  const root = mkdtempSync(join(tmpdir(), 'financehub-buildid-'));
  try {
    mkdirSync(join(root, 'app', 'src'), { recursive: true });
    const pkgLf = '{\n  "version": "1.0.0"\n}\n';
    const fileLf = 'line one\nline two\n';
    writeFileSync(join(root, 'package.json'), pkgLf);
    writeFileSync(join(root, 'app', 'src', 'main.ts'), fileLf);
    const linux = buildId(root);
    writeFileSync(join(root, 'package.json'), pkgLf.replace(/\n/g, '\r\n'));
    writeFileSync(join(root, 'app', 'src', 'main.ts'), fileLf.replace(/\n/g, '\r\n'));
    assert.equal(buildId(root), linux, 'a Windows checkout and a Linux build share one id');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a release note appends to the current version without bumping it', () => {
  const text = '# App\n\n## [0.1.0] — 1 January 2026\n\n### Changed\n\n- Old note\n';
  const updated = addNote(text, '0.1.0', 'New note');
  assert.match(updated, /- Old note\n- New note/);
  assert.equal((updated.match(/## \[/g) || []).length, 1, 'the version section is reused, not duplicated');
  assert.match(updated, /## \[0\.1\.0\]/);
});

test('a published tag on an older commit blocks reusing that day', () => {
  const today = new Date(2026, 10, 23);
  assert.equal(versionTagProblem('2026.11.18', null, 'b'.repeat(40), today), null, 'an untagged version is normal');
  assert.equal(versionTagProblem('2026.11.18', 'a'.repeat(40), 'a'.repeat(40), today), null, 'the same commit is fine');
  const problem = versionTagProblem('2026.11.18', 'c'.repeat(40), 'd'.repeat(40), today);
  assert.match(problem ?? '', /v2026\.11\.18 already tags ccccccc/);
  assert.match(problem ?? '', /Release versions are dates/);
});

test('a same-day rebuild keeps the date and asks for the tag to move', () => {
  const day = new Date(2026, 10, 23);
  const version = releaseVersion(day);
  assert.equal(versionTagProblem(version, 'c'.repeat(40), 'd'.repeat(40), day), null, 'same-day rebuilds are allowed');
  const notice = sameDayTagNotice(version, 'c'.repeat(40), 'd'.repeat(40), day);
  assert.match(notice ?? '', /same-day rebuild keeps 2026\.11\.23/);
  assert.match(notice ?? '', /git tag -f v2026\.11\.23/);
  assert.equal(sameDayTagNotice(version, 'd'.repeat(40), 'd'.repeat(40), day), null, 'a tag on HEAD needs no notice');
});

test('the version is the release date, without padding', () => {
  assert.equal(releaseVersion(new Date(2026, 10, 8)), '2026.11.8');
  assert.equal(releaseVersion(new Date(2027, 0, 23)), '2027.1.23');
});

test('a new day starts a new dated section and keeps the old one', () => {
  const text = '# App\n\n## [2026.11.8] — 8 November 2026\n\n### Changed\n\n- Old note\n';
  const prepared = prepareRelease(text, '2026.11.9', '9 November 2026');
  assert.match(prepared, /## \[2026\.11\.9\] — 9 November 2026/);
  assert.match(prepared, /## \[2026\.11\.8\] — 8 November 2026/);
  const updated = addNote(prepared, '2026.11.9', 'New note', '9 November 2026');
  assert.match(updated, /- New note/);
  assert.equal((updated.match(/## \[/g) || []).length, 2);
});

test('a second release the same day reuses the dated section', () => {
  const text = '# App\n\n## [2026.11.8] — 8 November 2026\n\n### Changed\n\n- First note\n';
  assert.equal(prepareRelease(text, '2026.11.8', '8 November 2026'), text);
  const updated = addNote(prepareRelease(text, '2026.11.8', '8 November 2026'), '2026.11.8', 'Second note', '8 November 2026');
  assert.match(updated, /- First note\n- Second note/);
  assert.equal((updated.match(/## \[/g) || []).length, 1);
});

test('an earlier release dated today is kept instead of renamed', () => {
  const text = '# App\n\n## [0.1.0] — 8 November 2026\n\n### Changed\n\n- Existing note\n';
  const prepared = prepareRelease(text, '2026.11.8', '8 November 2026');
  assert.match(prepared, /## \[2026\.11\.8\] — 8 November 2026/);
  assert.match(prepared, /## \[0\.1\.0\] — 8 November 2026/);
  assert.match(prepared, /- Existing note/);
  assert.equal((prepared.match(/## \[/g) || []).length, 2, 'history is never rewritten');
});

test('a new release never rewrites or drops an earlier release', () => {
  const text = [
    '# App',
    '',
    '## [2026.11.8] — 8 November 2026',
    '',
    '### Added',
    '',
    '- First note',
    '',
    '### Fixed',
    '',
    '- A bug',
    '',
    '## [2026.11.7] — 7 November 2026',
    '',
    '### Changed',
    '',
    '- Old note',
    '',
  ].join('\n');
  const prepared = addNote(prepareRelease(text, '2026.11.9', '9 November 2026'), '2026.11.9', 'New note', '9 November 2026');
  const releases = parseChangelog(prepared);
  assert.deepEqual(releases.map((release) => release.version), ['2026.11.9', '2026.11.8', '2026.11.7']);
  assert.deepEqual(releases[0].sections, [{ title: 'Changed', items: ['New note'] }]);
  assert.deepEqual(releases[1].sections, [
    { title: 'Added', items: ['First note'] },
    { title: 'Fixed', items: ['A bug'] },
  ]);
  assert.deepEqual(releases[2].sections, [{ title: 'Changed', items: ['Old note'] }]);
});

test('a release note creates the section when the version has none', () => {
  const updated = addNote('# App\n\n## [0.0.9] — 1 January 2026\n\n### Added\n\n- Old\n', '0.1.0', 'First note');
  assert.match(updated, /## \[0\.1\.0\]/);
  assert.match(updated, /- First note/);
  assert.equal((updated.match(/## \[/g) || []).length, 2);
});

test('the newest release is the package version and releases are ordered', () => {
  const releases = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  assert.equal(releases[0].version, pkg.version, 'bump package.json and CHANGELOG.md together');
  const versions = releases.map((release) => release.version);
  assert.equal(new Set(versions).size, versions.length, 'release versions must be unique');
  for (const release of releases) {
    assert.ok(release.sections.some((section) => section.items.length > 0), `${release.version} needs release notes`);
  }
});
