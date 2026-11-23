import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectSources } from './csp.ts';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from './publicSupabase.ts';
import { usesPrivateWorkbook, workbookAlias } from './seedSource.ts';

const appVersion = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const webSeed = fileURLToPath(new URL('../data/web-seed.json', import.meta.url));
const privateWorkbook = fileURLToPath(new URL('../data/workbook.json', import.meta.url));
// The real workbook is private and gitignored. A clean checkout (CI, a contributor,
// or the public repository) must still build, so it uses the blank seed instead.
const hasPrivateWorkbook = existsSync(privateWorkbook);

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
    "manifest-src 'self'",
    "media-src 'self' blob:",
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
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() || PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim() || PUBLIC_SUPABASE_ANON_KEY;
  const buildEnv = { ...env, VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_ANON_KEY: supabaseAnonKey };
  const hosted = mode === 'hosted' || env.VITE_HOSTED_WEB === '1';
  // A Store package is a public build: it must never contain the owner's private
  // workbook, and it gets its updates from the Microsoft Store instead of GitHub.
  const store = mode === 'store' || env.VITE_STORE_BUILD === '1';
  const privateSeed = usesPrivateWorkbook({ hosted, store, hasPrivateWorkbook });
  const publicSeed = !privateSeed;
  const dataAliases = [
    workbookAlias(privateSeed, { webSeed, privateWorkbook }),
    ...(publicSeed
      ? [{ find: './dataFixes', replacement: fileURLToPath(new URL('./src/dataFixes.web.ts', import.meta.url)) }]
      : []),
  ];

  if (hosted && (!supabaseUrl || !supabaseAnonKey)) {
    console.warn('Hosted build: the public Supabase client configuration is missing; the login screen will show the setup notice.');
  }
  if (store && hasPrivateWorkbook) {
    console.warn('Store build: using the blank web seed and the public data fixes; the private workbook is excluded.');
  }

  return {
    root: appRoot,
    envDir: projectRoot,
    base: hosted ? '/' : './',
    define: {
      'import.meta.env.VITE_HOSTED_WEB': JSON.stringify(hosted ? '1' : '0'),
      'import.meta.env.VITE_STORE_BUILD': JSON.stringify(store ? '1' : '0'),
      // One version for the web build and the Electron shell, taken from package.json.
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: {
      alias: dataAliases,
    },
    plugins: [react(), productionCsp(command, buildEnv)],
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
