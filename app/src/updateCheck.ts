/**
 * Is this build the newest one?
 *
 * Answering that honestly takes two comparisons. The published release gives a
 * version and a build id, and either one moving means a newer build: two builds
 * of the same day differ only by id. The changelog this build carries gives the
 * second check, because its newest entry must be this build's own release — a
 * note left behind by a stale release is how a build quietly ships unlabelled.
 */
import { GITHUB_REPO } from './installer.ts';

export interface RunningBuild {
  version: string;
  buildId: string;
}

export interface LatestBuild {
  version: string;
  buildId: string;
}

export type BuildVerdict = 'current' | 'behind';

const VERSION = /^\d{4}\.\d{1,2}\.\d{1,2}$/;
const BUILD_ID = /^[0-9a-f]{12}$/;
const BUILD_ARCHIVE = /^FinanceHub-app-([0-9a-f]{12})\.asar$/;

/** Where the newest published release is listed. Public, and readable from a browser. */
export const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export function sameBuild(left: RunningBuild, right: LatestBuild): boolean {
  return left.version === right.version && left.buildId === right.buildId;
}

/** Any difference is a newer build: a new version, or a rebuild of the same day. */
export function verdictFor(running: RunningBuild, latest: LatestBuild): BuildVerdict {
  return sameBuild(running, latest) ? 'current' : 'behind';
}

/**
 * The release's version and build id from a GitHub release object.
 *
 * The version is the tag; the build id is the name of the archive the release
 * published for it (`FinanceHub-app-<buildId>.asar`), which is the only place a
 * build id appears outside the manifest.
 */
export function parseLatestRelease(value: unknown): LatestBuild | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as { tag_name?: unknown; assets?: unknown };
  const version = String(release.tag_name ?? '').replace(/^v/, '').trim();
  if (!VERSION.test(version)) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  for (const asset of assets) {
    const match = BUILD_ARCHIVE.exec(String((asset as { name?: unknown })?.name ?? ''));
    if (match) return { version, buildId: match[1] };
  }
  return null;
}

/** The changelog opens with this build's own release, or the note is stale. */
export function changelogMatchesBuild(changelog: {
  version: string;
  buildId: string;
  releases: { version: string }[];
}): boolean {
  return changelog.releases[0]?.version === changelog.version
    && VERSION.test(changelog.version)
    && BUILD_ID.test(changelog.buildId);
}

/** `v2026.11.28 · build 24279c133a03` */
export function buildLabel(build: { version: string; buildId: string }): string {
  return `v${build.version} · build ${build.buildId}`;
}
