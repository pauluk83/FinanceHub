/**
 * Where the Windows installer lives. Release assets are published by the
 * `Release` GitHub Actions workflow when a `v<version>` tag is pushed.
 */
export const GITHUB_REPO = 'pauluk83/FinanceHub';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

export function installerFileName(version: string): string {
  return `FinanceHub-Setup-${version}.exe`;
}

/** Each release publishes one dated installer; there is no stable alias asset. */
export function installerDownloadUrl(version: string): string {
  return `${GITHUB_RELEASES_URL}/download/v${version}/${installerFileName(version)}`;
}

export function installerChecksumsUrl(version: string): string {
  return `${GITHUB_RELEASES_URL}/download/v${version}/SHA256SUMS.txt`;
}
