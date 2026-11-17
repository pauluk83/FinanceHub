/**
 * Deploy the hosted build to Cloudflare Pages.
 *
 * Requires, for this command only:
 *   CLOUDFLARE_API_TOKEN   API token with Account → Cloudflare Pages: Edit
 *   CLOUDFLARE_ACCOUNT_ID  account id from the Cloudflare dashboard
 * Optional:
 *   PAGES_PROJECT          Pages project name (default financehub-uk)
 *
 * The token and account id are read from the environment and never written to
 * the repository, a build or a deployment log. Only dist-web is uploaded; the
 * Windows installer stays a GitHub Release asset.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'dist-web');
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const PROJECT = process.env.PAGES_PROJECT ?? 'financehub-uk';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!TOKEN || !ACCOUNT) {
  console.error(
    'Set CLOUDFLARE_API_TOKEN (Pages: Edit) and CLOUDFLARE_ACCOUNT_ID for this command only.\n'
    + 'Both are read from the environment and are never stored in the repository.',
  );
  process.exit(1);
}
if (!existsSync(WRANGLER)) {
  console.error('wrangler is not installed. Run npm install first.');
  process.exit(1);
}
if (!existsSync(join(SITE, 'index.html'))) {
  console.error('dist-web/index.html is missing. Run npm run build:web:hosted first.');
  process.exit(1);
}

const wrangler = (args, { allowFailure = false } = {}) => {
  try {
    return execFileSync(process.execPath, [WRANGLER, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
    });
  } catch (error) {
    if (allowFailure) return null;
    process.stderr.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    throw error;
  }
};

// A fresh account has no project yet. Creating an existing project fails, which
// is expected on every later release.
wrangler(['pages', 'project', 'create', PROJECT, '--production-branch', 'main'], { allowFailure: true });

const output = wrangler([
  'pages', 'deploy', SITE,
  '--project-name', PROJECT,
  '--branch', 'main',
  '--commit-dirty=true',
]);
process.stdout.write(output);

console.log(`deployed ${SITE} to https://${PROJECT}.pages.dev`);
