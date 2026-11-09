/**
 * Publish the Windows installer as a GitHub Release.
 *
 * The `Release` GitHub Actions workflow runs this after building the installer
 * on a `v<version>` tag, with GITHUB_TOKEN available. It can also be run
 * locally with GITHUB_TOKEN set. It never prints the token.
 *
 *   node scripts/github-release.mjs           upload the current version
 *   node scripts/github-release.mjs --notes   print the release notes only
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, parseChangelog } from './app-changelog.mjs';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** `owner/repo` from package.json, GITHUB_REPOSITORY, or an explicit override. */
export function repoSlug(repository = pkg.repository) {
  const raw = process.env.GITHUB_REPOSITORY
    || (typeof repository === 'string' ? repository : repository?.url)
    || '';
  const text = String(raw).trim();
  // Actions sets GITHUB_REPOSITORY to `owner/repo`; package.json uses a URL.
  const slug = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (slug) return `${slug[1]}/${slug[2]}`;
  const url = text.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return url ? `${url[1]}/${url[2]}` : null;
}

export function releaseNotes(version, changelogPath = join(ROOT, 'CHANGELOG.md')) {
  const releases = parseChangelog(readFileSync(changelogPath, 'utf8'));
  const release = releases.find((entry) => entry.version === version);
  if (!release) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const sections = release.sections
    .map((section) => `### ${section.title}\n\n${section.items.map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n');
  return [
    `# FinanceHub ${version}`,
    '',
    sections,
    '',
    '## Windows installer',
    '',
    `- \`FinanceHub-Setup-${version}.exe\` — this release`,
    '- `FinanceHub-Setup.exe` — the same installer under a stable download name',
    '- `SHA256SUMS.txt` — SHA-256 checksum for the versioned installer',
    '',
    'The installer is unsigned, so Windows may show an unknown-publisher warning.',
  ].join('\n');
}

class GitHubError extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(path, { token, method = 'GET', body, base = 'https://api.github.com', raw = false } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...(raw ? { 'Content-Type': 'application/octet-stream' } : {}),
    },
    ...(body ? { body } : {}),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GitHubError(`${method} ${path} → ${response.status} ${detail.slice(0, 200)}`, response.status);
  }
  return response.status === 204 ? null : response.json();
}

/** Create the release if needed, then upload/replace its installer assets. */
export async function publishInstaller({ version, files, token, repo = repoSlug(), notes = releaseNotes(version) }) {
  if (!repo) throw new Error('Set package.json repository or GITHUB_REPOSITORY to owner/repo.');
  if (!token) throw new Error('GITHUB_TOKEN is required to publish a GitHub release.');
  const tag = `v${version}`;
  let release;
  try {
    release = await call(`/repos/${repo}/releases/tags/${tag}`, { token });
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 404) throw error;
    release = await call(`/repos/${repo}/releases`, {
      token,
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        name: `FinanceHub ${version}`,
        body: notes,
        draft: false,
        prerelease: false,
      }),
    });
  }

  const assets = await call(`/repos/${repo}/releases/${release.id}/assets?per_page=100`, { token });
  const uploaded = [];
  for (const file of files) {
    const name = basename(file);
    const existing = assets.find((asset) => asset.name === name);
    if (existing) await call(`/repos/${repo}/releases/assets/${existing.id}`, { token, method: 'DELETE' });
    const buffer = readFileSync(file);
    const upload = new URL(release.upload_url.replace('{?name,label}', ''));
    upload.searchParams.set('name', name);
    await call(`${upload.pathname}${upload.search}`, {
      token,
      method: 'POST',
      base: upload.origin,
      body: buffer,
      raw: true,
    });
    uploaded.push({ name, bytes: buffer.length });
  }
  return { tag, releaseId: release.id, uploaded };
}

async function main() {
  const version = pkg.version;
  const tag = `v${version}`;
  const ref = process.env.GITHUB_REF_NAME;
  if (ref && ref.startsWith('v') && ref !== tag) {
    throw new Error(`Tag ${ref} does not match package version ${version}`);
  }

  if (process.argv.includes('--notes')) {
    console.log(releaseNotes(version));
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log(`GITHUB_TOKEN is not set — the installer was not uploaded.`);
    console.log(`Push the tag ${tag} to let the Release workflow build and publish it.`);
    return;
  }

  const installer = join(ROOT, 'release', `FinanceHub-Setup-${version}.exe`);
  const stable = join(ROOT, 'release', 'FinanceHub-Setup.exe');
  const checksums = join(ROOT, 'release', 'SHA256SUMS.txt');
  if (!existsSync(installer)) throw new Error(`${installer} is missing — run npm run dist:win first.`);
  if (!existsSync(stable)) throw new Error(`${stable} is missing — copy the versioned installer to the stable name first.`);
  if (!existsSync(checksums)) throw new Error(`${checksums} is missing — generate the checksum file first.`);

  const result = await publishInstaller({ version, files: [installer, stable, checksums], token });
  console.log(`github release ${result.tag}: ${result.uploaded.map((asset) => `${asset.name} (${(asset.bytes / 1024 / 1024).toFixed(1)} MB)`).join(', ')}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
