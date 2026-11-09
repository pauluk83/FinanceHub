/**
 * Deploy the hosted build to InfinityFree over FTP.
 *
 * Requires FTP_PASSWORD in the environment for this command only; the password is
 * never written to the repository, a build or a log. The script builds nothing —
 * run `npm run deploy:web`, which builds the hosted bundle (regenerating the
 * application changelog) and then calls this file. The Windows installer is no
 * longer hosted here; it is a GitHub Release asset.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'dist-web');
const HOST = process.env.FTP_HOST ?? 'ftpupload.net';
const USER = process.env.FTP_USER ?? 'if0_41682313';
const REMOTE = process.env.FTP_ROOT ?? '/financehub.freedev.app/htdocs';
const MAX_BYTES = 10_000_000;
const password = process.env.FTP_PASSWORD;

if (!password) {
  console.error('FTP_PASSWORD is not set. Supply it for this command only; it is never stored.');
  process.exit(1);
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const files = walk(SITE);
const oversized = files.filter((file) => statSync(file).size >= MAX_BYTES);
if (oversized.length) {
  console.error('These files exceed the host\'s 10 MB file limit and would be deleted:');
  for (const file of oversized) console.error(`  ${relative(SITE, file)} (${(statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
  console.error('Split or remove large files before deploying; the installer belongs on GitHub Releases.');
  process.exit(1);
}

let uploaded = 0;
const failed = [];
for (const file of files) {
  const rel = relative(SITE, file).split(sep).join('/');
  const remotePath = `${REMOTE}/${rel}`;
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    try {
      execFileSync('curl', [
        '-sS', '--fail', '--ftp-create-dirs',
        '-T', file,
        '--user', `${USER}:${password}`,
        `ftp://${HOST}${remotePath}`,
      ], { stdio: 'pipe' });
      done = true;
      uploaded += 1;
    } catch {
      if (attempt === 3) failed.push(relative(SITE, file).split(sep).join('/'));
    }
  }
}

console.log(`deployed ${uploaded}/${files.length} files to ${REMOTE}`);
if (failed.length) {
  console.error(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
