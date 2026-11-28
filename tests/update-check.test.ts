import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_CHANGELOG } from '../app/src/appChangelog.generated.ts';
import {
  LATEST_RELEASE_API,
  buildLabel,
  changelogMatchesBuild,
  parseLatestRelease,
  sameBuild,
  verdictFor,
} from '../app/src/updateCheck.ts';

test('a build is current only when the version and the build id both match', () => {
  const running = { version: '2026.11.28', buildId: '24279c133a03' };
  assert.equal(verdictFor(running, { ...running }), 'current');
  assert.equal(verdictFor(running, { version: '2026.11.28', buildId: '0deb60b00000' }), 'behind', 'a rebuild of the same day is newer');
  assert.equal(verdictFor(running, { version: '2026.11.29', buildId: '24279c133a03' }), 'behind');
  assert.equal(sameBuild(running, { ...running }), true);
  assert.equal(sameBuild(running, { version: '2026.11.29', buildId: '24279c133a03' }), false);
});

test('the newest release is read from its tag and the archive it published', () => {
  assert.deepEqual(
    parseLatestRelease({
      tag_name: 'v2026.11.28',
      assets: [
        { name: 'FinanceHub-Setup-2026.11.28.exe' },
        { name: 'FinanceHub-app.asar' },
        { name: 'FinanceHub-app-24279c133a03.asar' },
      ],
    }),
    { version: '2026.11.28', buildId: '24279c133a03' },
  );

  assert.equal(parseLatestRelease({ tag_name: 'latest' }), null, 'a tag that is not a version is no answer');
  assert.equal(parseLatestRelease({ tag_name: 'v2026.11.28', assets: [{ name: 'FinanceHub-app.asar' }] }), null, 'no build id, no answer');
  assert.equal(parseLatestRelease(null), null);
  assert.equal(LATEST_RELEASE_API, 'https://api.github.com/repos/pauluk83/FinanceHub/releases/latest');
});

test('the changelog must open with this build own release', () => {
  const current = {
    version: '2026.11.28',
    buildId: '24279c133a03',
    releases: [{ version: '2026.11.28' }, { version: '2026.11.27' }],
  };
  assert.equal(changelogMatchesBuild(current), true);
  assert.equal(changelogMatchesBuild({ ...current, releases: [{ version: '2026.11.27' }] }), false, 'a stale note is caught');
  assert.equal(changelogMatchesBuild({ ...current, buildId: 'not-a-build' }), false);
  assert.equal(buildLabel(current), 'v2026.11.28 · build 24279c133a03');
});

test('this build carries its own release note', () => {
  assert.equal(changelogMatchesBuild(APP_CHANGELOG), true);
});
