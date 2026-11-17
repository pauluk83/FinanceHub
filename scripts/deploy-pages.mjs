/**
 * Deploy the hosted build to Cloudflare Pages.
 *
 * Authentication (one of):
 *   - run `npx wrangler login` once, which stores an OAuth session locally; or
 *   - set CLOUDFLARE_API_TOKEN (Account → Cloudflare Pages: Edit) and
 *     CLOUDFLARE_ACCOUNT_ID for this command only.
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
const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
let account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

if (!existsSync(WRANGLER)) {
  console.error('wrangler is not installed. Run npm install first.');
  process.exit(1);
}
if (!existsSync(join(SITE, 'index.html'))) {
  console.error('dist-web/index.html is missing. Run npm run build:web:hosted first.');
  process.exit(1);
}

const env = { ...process.env };
if (TOKEN) env.CLOUDFLARE_API_TOKEN = TOKEN;
else delete env.CLOUDFLARE_API_TOKEN;

const wrangler = (args, { allowFailure = false } = {}) => {
  try {
    return execFileSync(process.execPath, [WRANGLER, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
  } catch (error) {
    if (allowFailure) return null;
    process.stderr.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    throw error;
  }
};

// Wrangler login stores an OAuth session; the account id can be read from it.
if (!account) {
  const whoami = wrangler(['whoami'], { allowFailure: true }) ?? '';
  const match = whoami.match(/[0-9a-f]{32}/i)
    ?? whoami.match(/Account ID[^0-9a-f]*([0-9a-f-]{32,36})/i);
  if (match) account = match[1] ?? match[0];
}
if (!account) {
  console.error(
    'No Cloudflare account is available. Run `npx wrangler login` once, or set\n'
    + 'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID for this command only.',
  );
  process.exit(1);
}
env.CLOUDFLARE_ACCOUNT_ID = account;

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
