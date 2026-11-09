import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appVersion = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const webSeed = fileURLToPath(new URL('../data/web-seed.json', import.meta.url));
// The real workbook is private and gitignored. A clean checkout (CI, a contributor,
// or the public repository) must still build, so it uses the blank seed instead.
const hasPrivateWorkbook = existsSync(fileURLToPath(new URL('../data/workbook.json', import.meta.url)));

function connectSources(env: Record<string, string>): string {
  const sources = new Set(["'self'", 'https://api.github.com']);
  try {
    const url = new URL(env.VITE_SUPABASE_URL ?? '');
    if (url.protocol === 'https:') {
      sources.add(url.origin);
      sources.add(`wss://${url.host}`);
    } else {
      sources.add('https://*.supabase.co');
      sources.add('wss://*.supabase.co');
    }
  } catch {
    sources.add('https://*.supabase.co');
    sources.add('wss://*.supabase.co');
  }
  return [...sources].join(' ');
}

function productionCsp(command: string, env: Record<string, string>): Plugin {
  const policy = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources(env)}`,
    "worker-src 'self' blob:",
  ].join('; ');

  return {
    name: 'financehub-production-csp',
    transformIndexHtml(html) {
      if (command !== 'build') return html;
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy.replaceAll('"', '&quot;')}">`,
      );
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const hosted = mode === 'hosted' || env.VITE_HOSTED_WEB === '1';
  const publicSeed = hosted || !hasPrivateWorkbook;

  if (hosted && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    console.warn('Hosted build: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not both set; the login screen will show the setup notice.');
  }

  return {
    root: appRoot,
    envDir: projectRoot,
    base: hosted ? '/' : './',
    define: {
      'import.meta.env.VITE_HOSTED_WEB': JSON.stringify(hosted ? '1' : '0'),
      // One version for the web build and the Electron shell, taken from package.json.
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: publicSeed
      ? {
          alias: [
            {
              find: '../../data/workbook.json',
              replacement: webSeed,
            },
            {
              find: './dataFixes',
              replacement: fileURLToPath(new URL('./src/dataFixes.web.ts', import.meta.url)),
            },
          ],
        }
      : undefined,
    plugins: [react(), productionCsp(command, env)],
    build: {
      outDir: fileURLToPath(new URL(hosted ? '../dist-web' : '../dist', import.meta.url)),
      emptyOutDir: true,
      target: 'chrome120',
      sourcemap: false,
    },
    ...(hosted
      ? {}
      : {
          server: {
            port: 5173,
            strictPort: true,
            proxy: {
              '/api': { target: 'http://127.0.0.1:53683', changeOrigin: true },
            },
          },
        }),
  };
});
