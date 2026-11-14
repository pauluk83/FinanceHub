/**
 * Release driver for FinanceHub.
 *
 *   npm run release -- "What changed"              dated version, note, rebuild, deploy
 *   npm run release -- "What changed" --no-deploy  build only
 *   npm run release:bump -- minor "What changed"   deliberate milestone bump only
 *   npm run release:check                          verify coherence, live parity when possible
 *
 * A normal release takes its version from the release date (`YYYY.M.D`): the first
 * release of a day moves the version forward, later releases that day share it and
 * append notes. The generated build id stays a content hash, so two builds of the
 * same day are still distinguishable and live parity keeps comparing like with like.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAppChangelog, parseChangelog } from './app-changelog.mjs';
import { repoSlug } from './github-release.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'dist-web');
const PACKAGE = join(ROOT, 'package.json');
const CHANGELOG = join(ROOT, 'CHANGELOG.md');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const HOST = process.env.FTP_HOST ?? 'ftpupload.net';
const USER = process.env.FTP_USER ?? 'if0_41682313';
const FTP_ROOT = process.env.FTP_ROOT ?? '/financehub.freedev.app/htdocs';

export function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function bumpVersion(version, kind) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Unsupported version "${version}"`);
  }
  const [major, minor, patch] = parts;
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error('Use patch, minor or major');
}

export function releaseDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** The dated version: `2026.11.8`. No padding, so it reads as the release day. */
export function releaseVersion(date = new Date()) {
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

/**
 * Append a note to an existing version's `### Changed` list without touching the
 * version. Creates the release section (and the heading) only if it is absent.
 */
export function addNote(text, version, note, date = releaseDate()) {
  const bullet = `- ${note.trim()}`;
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));

  if (start < 0) {
    const firstRelease = lines.findIndex((line) => /^## \[/.test(line));
    const at = firstRelease < 0 ? lines.length : firstRelease;
    const entry = [`## [${version}] — ${date}`, '', '### Changed', '', bullet, ''];
    const prefix = lines.slice(0, at);
    const suffix = lines.slice(at);
    return [...prefix, ...entry, ...suffix].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }

  let end = lines.findIndex((line, index) => index > start && /^## \[/.test(line));
  if (end < 0) end = lines.length;
  const changed = lines.findIndex((line, index) => index > start && index < end && /^###\s+Changed\s*$/.test(line));

  if (changed < 0) {
    return [...lines.slice(0, end), '', '### Changed', '', bullet, '', ...lines.slice(end)]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n';
  }

  let next = lines.findIndex((line, index) => index > changed && index < end && /^###\s/.test(line));
  if (next < 0) next = end;
  while (next > changed + 1 && lines[next - 1].trim() === '') next -= 1;
  return [...lines.slice(0, next), bullet, ...lines.slice(next)].join('\n');
}

/** Create a new release section (used by the explicit bump command). */
export function addRelease(text, version, note, date = releaseDate()) {
  const entry = `## [${version}] — ${date}\n\n### Changed\n\n- ${note.trim()}\n`;
  const marker = text.indexOf('\n## [');
  if (marker < 0) return `${text.trimEnd()}\n\n${entry}`;
  return `${text.slice(0, marker + 1)}${entry}\n${text.slice(marker + 1)}`;
}

/** An empty section, ready for `addNote` to fill in. */
export function addReleaseSection(text, version, date = releaseDate()) {
  const entry = `## [${version}] — ${date}\n\n### Changed\n`;
  const marker = text.indexOf('\n## [');
  if (marker < 0) return `${text.trimEnd()}\n\n${entry}\n`;
  return `${text.slice(0, marker + 1)}${entry}\n${text.slice(marker + 1)}`;
}

/**
 * Make room for a dated release without touching history. An existing section for
 * this version is reused (same-day releases append to it); otherwise a new dated
 * section is added above the others. Earlier sections are never renamed, merged
 * or dropped — the application changelog is an append-only history.
 */
export function prepareRelease(text, version, date = releaseDate()) {
  if (parseChangelog(text).some((release) => release.version === version)) return text;
  return addReleaseSection(text, version, date);
}

/** Keep the plain-Node fallback in app/src/version.ts in step with the package. */
export function syncVersionConstant(version, root = ROOT) {
  const file = join(root, 'app', 'src', 'version.ts');
  const source = readFileSync(file, 'utf8');
  const next = source.replace(/__APP_VERSION__ : '[^']*'/, `__APP_VERSION__ : '${version}'`);
  if (next !== source) writeFileSync(file, next);
  return next !== source;
}

function ftpRead(remotePath) {
  if (!process.env.FTP_PASSWORD) throw new Error('FTP_PASSWORD is not set');
  return execSync(
    `curl -sS --user ${JSON.stringify(`${USER}:${process.env.FTP_PASSWORD}`)} "ftp://${HOST}${FTP_ROOT}${remotePath}"`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
}

async function localChecks({ requireUpdateAssets = false } = {}) {
  let failures = 0;
  const pass = (message) => console.log(`PASS  ${message}`);
  const fail = (message) => {
    console.error(`FAIL  ${message}`);
    failures += 1;
  };

  const pkg = JSON.parse(read('package.json'));
  if (!/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(pkg.version)) {
    fail(`package version ${pkg.version} is not a release date (YYYY.M.D)`);
  }
  const releases = parseChangelog(read('CHANGELOG.md'));
  if (!releases.length) fail('CHANGELOG.md has no release sections');
  if (releases[0]?.version !== pkg.version) {
    fail(`newest changelog release ${releases[0]?.version ?? '(none)'} does not match package ${pkg.version}`);
  } else {
    pass(`newest release is ${pkg.version}`);
  }
  const versions = releases.map((release) => release.version);
  if (new Set(versions).size !== versions.length) fail('release versions are not unique');
  for (let index = 1; index < versions.length; index += 1) {
    if (compareVersions(versions[index - 1], versions[index]) <= 0) {
      fail(`release order is wrong: ${versions[index - 1]} then ${versions[index]}`);
    }
  }
  for (const release of releases) {
    if (!release.sections.some((section) => section.items.length > 0)) fail(`${release.version} has no notes`);
  }
  if (failures === 0) pass(`${releases.length} release(s) have notes and are ordered`);

  const generated = join(ROOT, 'app', 'src', 'appChangelog.generated.ts');
  if (!existsSync(generated)) {
    fail('appChangelog.generated.ts is missing — run node scripts/app-changelog.mjs');
  } else {
    const { APP_CHANGELOG } = await import(`${pathToFileURL(generated).href}?v=${Date.now()}`);
    const expected = buildAppChangelog({ root: ROOT });
    if (APP_CHANGELOG.version !== expected.version) fail('generated changelog version is stale');
    else if (APP_CHANGELOG.buildId !== expected.buildId) fail('generated changelog build id is stale');
    else if (JSON.stringify(APP_CHANGELOG.releases) !== JSON.stringify(expected.releases)) fail('generated changelog notes are stale');
    else pass(`generated changelog matches source (build ${expected.buildId})`);
  }

  const indexPath = join(SITE, 'index.html');
  let html = '';
  if (!existsSync(indexPath)) {
    fail('dist-web/index.html is missing — run npm run build:web:hosted');
  } else {
    html = readFileSync(indexPath, 'utf8');
    const bundle = (html.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [''])[0];
    if (!bundle || !existsSync(join(SITE, bundle))) fail('dist-web/index.html references a missing bundle');
    else pass(`hosted bundle present (${bundle.split('/').pop()})`);
  }

  let installerSha = '';
  const installer = join(ROOT, 'release', `FinanceHub-Setup-${pkg.version}.exe`);
  if (!existsSync(installer)) {
    console.log('SKIP  installer — run npm run dist:win before releasing');
  } else {
    const bytes = readFileSync(installer);
    installerSha = createHash('sha256').update(bytes).digest('hex');
    pass(`installer ${installer.split(/[\\/]/).pop()} built (${(bytes.length / 1024 / 1024).toFixed(1)} MB, ${installerSha.slice(0, 12)})`);
  }

  const updateManifestPath = join(ROOT, 'release', 'update', 'update-manifest.json');
  const updateAsarPath = join(ROOT, 'release', 'update', 'FinanceHub-app.asar');
  if (!existsSync(updateManifestPath) || !existsSync(updateAsarPath)) {
    console.log('SKIP  update manifest — run npm run dist:win to build the delta assets');
  } else {
    try {
      const manifest = JSON.parse(readFileSync(updateManifestPath, 'utf8'));
      const asar = readFileSync(updateAsarPath);
      const asarSha = createHash('sha256').update(asar).digest('hex');
      if (manifest.version !== pkg.version) fail(`update manifest version ${manifest.version} does not match package ${pkg.version}`);
      else if (manifest.asar?.size !== asar.length || manifest.asar?.sha256 !== asarSha) {
        fail('update manifest does not match the packaged app.asar asset');
      } else pass(`update manifest matches FinanceHub-app.asar (${(asar.length / 1024 / 1024).toFixed(1)} MB, ${asarSha.slice(0, 12)})`);
    } catch (error) {
      fail(`update manifest check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // The installer is published by the Release workflow on a `v<version>` tag.
  // Before the tag exists this is a warning, not a failure: building and deploying
  // the web bundle is a normal part of a release commit.
  const repo = repoSlug(pkg.repository);
  if (!installerSha) {
    // Nothing local to report; the GitHub release is still checked below so a
    // checkout without a built installer can validate a published release.
  }
  if (!repo) {
    fail('package.json has no GitHub repository to check the installer release against');
  } else {
    try {
      const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'financehub-release-check',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      };
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${pkg.version}`, { headers });
      if (response.status === 404) {
        console.log(`SKIP  GitHub release v${pkg.version} — push the tag to publish the installer`);
      } else if (response.status === 403 || response.status === 401) {
        // The public API allows only 60 unauthenticated requests an hour. This is an
        // optional check; the website and download link never call the API.
        console.log('SKIP  GitHub release check — API rate limited; set GITHUB_TOKEN to verify it');
      } else if (!response.ok) {
        fail(`GitHub release check answered ${response.status}`);
      } else {
        const release = await response.json();
        const assets = release.assets ?? [];
        const versioned = assets.find((entry) => entry.name === `FinanceHub-Setup-${pkg.version}.exe`);
        const checksums = assets.find((entry) => entry.name === 'SHA256SUMS.txt');
        const updateManifest = assets.find((entry) => entry.name === 'update-manifest.json');
        const updateAsar = assets.find((entry) => entry.name === 'FinanceHub-app.asar');
        if (!versioned || !checksums) {
          fail(`GitHub release v${pkg.version} is missing the dated installer or the checksum file`);
        } else if (!updateManifest || !updateAsar) {
          if (requireUpdateAssets) {
            fail(`GitHub release v${pkg.version} is missing the update manifest or app archive`);
          } else {
            console.log(`SKIP  delta update assets — push tag v${pkg.version} to publish them`);
          }
        } else if (versioned.digest?.startsWith('sha256:') && checksums.browser_download_url) {
          // CI builds on a different machine, so compare the release's own checksum
          // file with its installer digest rather than with this local build.
          const text = await (await fetch(checksums.browser_download_url)).text();
          const published = text.match(/\b([0-9a-f]{64})\b/i)?.[1]?.toLowerCase();
          if (!published || published !== versioned.digest.slice(7)) {
            fail('the GitHub checksum file does not match the published installer');
          } else {
            const manifestText = await (await fetch(updateManifest.browser_download_url)).text();
            const publishedManifest = JSON.parse(manifestText);
            if (publishedManifest.asar?.sha256 !== updateAsar.digest?.slice(7)) {
              fail('the GitHub update manifest does not match the published app.asar');
            } else {
              pass(`GitHub release v${pkg.version} installer and delta assets match their hashes`);
            }
          }
        } else {
          pass(`GitHub release v${pkg.version} carries ${versioned.name}`);
        }
      }
    } catch (error) {
      fail(`GitHub release check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!html) return failures;

  if (!process.env.FTP_PASSWORD) {
    console.log('SKIP  live parity — set FTP_PASSWORD to compare the deployed site');
    return failures;
  }
  try {
    const remoteHtml = ftpRead('/index.html');
    const localBundle = (html.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [''])[0];
    const remoteBundle = (remoteHtml.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [''])[0];
    if (!remoteBundle || remoteBundle !== localBundle) {
      fail(`live bundle ${remoteBundle || '(none)'} does not match local ${localBundle}`);
    } else {
      pass(`live site matches this build (${localBundle.split('/').pop()})`);
    }
  } catch (error) {
    fail(`live check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return failures;
}

function buildAndDeploy(deploy) {
  const run = (command) => execSync(command, { cwd: ROOT, stdio: 'inherit' });
  run('node scripts/app-changelog.mjs');
  console.log('building Windows app and installer…');
  run('npm run dist:win');
  console.log('building hosted web bundle…');
  run('npm run build:web:hosted');
  if (deploy) {
    console.log('deploying…');
    run('node scripts/deploy-hosted.mjs');
  } else {
    console.log('skip deploy (--no-deploy)');
  }
  console.log(`Windows installer: release/FinanceHub-Setup-${appVersion()}.exe`);
  console.log(`Publish it with: git tag v${appVersion()} && git push origin v${appVersion()} (GitHub Actions builds and attaches it)`);
}

function appVersion() {
  return JSON.parse(read('package.json')).version;
}

function requireNote(note) {
  if (!note || !note.trim()) {
    throw new Error('Add a release note, e.g. npm run release -- "Fixed the vault unlock hint"');
  }
  return note.trim();
}

/** Normal release: version from the release date, note added, artefacts rebuilt. */
function release(note, deploy) {
  const text = requireNote(note);
  if (deploy && !process.env.FTP_PASSWORD) {
    throw new Error('FTP_PASSWORD is not set. Use --no-deploy to build without publishing, or set it for this command only.');
  }
  const pkg = JSON.parse(read('package.json'));
  const version = releaseVersion();
  const previous = pkg.version;
  writeFileSync(CHANGELOG, addNote(prepareRelease(read('CHANGELOG.md'), version), version, text));
  if (pkg.version !== version) {
    pkg.version = version;
    writeFileSync(PACKAGE, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  syncVersionConstant(version);
  console.log(
    previous === version
      ? `release ${version}: note added, same-day version kept`
      : `release ${version}: dated version set (was ${previous})`,
  );
  buildAndDeploy(deploy);
  return version;
}

/** Explicit bump: only on the owner's request. */
function bump(kind, note, deploy) {
  const text = requireNote(note);
  if (deploy && !process.env.FTP_PASSWORD) {
    throw new Error('FTP_PASSWORD is not set. Use --no-deploy to build without publishing, or set it for this command only.');
  }
  const pkg = JSON.parse(read('package.json'));
  const next = bumpVersion(pkg.version, kind);
  const changelog = read('CHANGELOG.md');
  if (parseChangelog(changelog).some((entry) => entry.version === next)) throw new Error(`${next} already has a release section`);
  writeFileSync(CHANGELOG, addRelease(changelog, next, text));
  pkg.version = next;
  writeFileSync(PACKAGE, `${JSON.stringify(pkg, null, 2)}\n`);
  syncVersionConstant(next);
  console.log(`bump ${next}: version and changelog updated`);
  buildAndDeploy(deploy);
  return next;
}

async function main(args) {
  const deploy = !args.includes('--no-deploy');
  const clean = args.filter((value) => value !== '--no-deploy');
  if (clean[0] === 'check') {
    const failures = await localChecks({ requireUpdateAssets: true });
    process.exit(failures ? 1 : 0);
  }
  if (clean[0] === 'bump') {
    const version = bump(clean[1], clean.slice(2).join(' '), deploy);
    const failures = await localChecks();
    console.log(failures ? `release ${version} built but coherence checks failed` : `release ${version} complete`);
    process.exit(failures ? 1 : 0);
  }
  const version = release(clean.join(' '), deploy);
  const failures = await localChecks();
  console.log(failures ? `release ${version} built but coherence checks failed` : `release ${version} complete`);
  process.exit(failures ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv.slice(2));
}
