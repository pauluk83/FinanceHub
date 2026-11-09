/**
 * Where the Windows installer lives. Release assets are published by the
 * `Release` GitHub Actions workflow when a `v<version>` tag is pushed.
 */
export const GITHUB_REPO = 'pauluk83/FinanceHub';
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
export const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
/** Stable asset name so the newest installer always has the same URL. */
export const INSTALLER_ASSET_NAME = 'FinanceHub-Setup.exe';
export const INSTALLER_DOWNLOAD_URL = `${GITHUB_RELEASES_URL}/latest/download/${INSTALLER_ASSET_NAME}`;
export const INSTALLER_CHECKSUMS_URL = `${GITHUB_RELEASES_URL}/latest/download/SHA256SUMS.txt`;

export function installerFileName(version: string): string {
  return `FinanceHub-Setup-${version}.exe`;
}
