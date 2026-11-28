#!/usr/bin/env node
/**
 * Build the Microsoft Store (AppX) package.
 *
 * The normal `dist:win` NSIS release is deliberately untouched. This script
 * validates the Partner Center identity, derives the required four-part package
 * version, builds the Store renderer (blank seed, no GitHub updater), and asks
 * electron-builder for an AppX package. It never uploads or publishes anything.
 */
import { existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const MAX_VERSION_PART = 65535;

function requiredText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`Store identity is missing ${field}.`);
  if (/YOUR|REPLACE|EXAMPLE/i.test(text)) {
    throw new Error(`Store identity field ${field} still contains a placeholder.`);
  }
  return text;
}

export function normalizeRevision(value) {
  if (value === undefined || value === null || value === '') return 0;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0 || revision > MAX_VERSION_PART) {
    throw new Error(`STORE_REVISION must be a whole number between 0 and ${MAX_VERSION_PART}.`);
  }
  return revision;
}

/** `2026.11.22` + revision `1` -> `2026.11.22.1` for the AppX manifest. */
export function storePackageVersion(version, revision = 0) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`package.json version "${version}" must be three numeric parts (YYYY.M.D).`);
  }
  const parts = version.split('.').map(Number);
  if (parts.some((part) => part > MAX_VERSION_PART)) {
    throw new Error(`package.json version "${version}" has a part above ${MAX_VERSION_PART}.`);
  }
  const fourth = normalizeRevision(revision);
  return `${version}.${fourth}`;
}

export function validateStoreIdentity(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Store identity must be a JSON object.');
  }

  const identityName = requiredText(input.identityName, 'identityName');
  if (identityName.length < 3 || identityName.length > 50 || !/^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$/.test(identityName)) {
    throw new Error('identityName must be 3–50 characters using letters, numbers, periods or dashes.');
  }

  const publisher = requiredText(input.publisher, 'publisher');
  if (!/^CN=.+/i.test(publisher)) {
    throw new Error('publisher must be the Partner Center publisher string, beginning with CN=.');
  }

  const publisherDisplayName = requiredText(input.publisherDisplayName, 'publisherDisplayName');
  const displayName = requiredText(input.displayName || 'FinanceHub', 'displayName');
  const applicationId = requiredText(input.applicationId || 'FinanceHub', 'applicationId');
  if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/.test(applicationId) || applicationId.length > 64) {
    throw new Error('applicationId must be 1–64 characters of letters and numbers separated by periods.');
  }

  return {
    identityName,
    publisher,
    publisherDisplayName,
    displayName,
    applicationId,
    revision: normalizeRevision(input.revision),
  };
}

export function resolveStoreIdentity({ file = path.join(root, 'store', 'identity.json'), env = process.env } = {}) {
  let fileIdentity = {};
  if (existsSync(file)) {
    try {
      fileIdentity = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`Could not read ${path.relative(root, file)}: ${error.message}`);
    }
  }

  const identity = { ...fileIdentity };
  const envFields = [
    ['STORE_IDENTITY_NAME', 'identityName'],
    ['STORE_PUBLISHER', 'publisher'],
    ['STORE_PUBLISHER_DISPLAY_NAME', 'publisherDisplayName'],
    ['STORE_DISPLAY_NAME', 'displayName'],
    ['STORE_APPLICATION_ID', 'applicationId'],
  ];
  for (const [envKey, field] of envFields) {
    if (env[envKey] !== undefined && env[envKey] !== '') identity[field] = env[envKey];
  }
  if (env.STORE_REVISION !== undefined && env.STORE_REVISION !== '') {
    identity.revision = env.STORE_REVISION;
  }

  if (!Object.keys(identity).length) {
    throw new Error(
      `No Store identity found. Copy ${path.relative(root, path.join(root, 'store', 'identity.example.json'))} ` +
      `to ${path.relative(root, file)} and fill in the Partner Center values.`,
    );
  }
  return validateStoreIdentity(identity);
}

function run(command, args, env) {
  // Run local CLIs through Node rather than npx/cmd.exe, so arguments are passed
  // literally and no shell deprecation warning is emitted on Windows.
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function newestAppx(directory) {
  if (!existsSync(directory)) return null;
  return readdirSync(directory)
    .filter((name) => name.toLowerCase().endsWith('.appx'))
    .map((name) => ({ name, mtimeMs: statSync(path.join(directory, name)).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0] ?? null;
}

async function main() {
  const identity = resolveStoreIdentity();
  const version = storePackageVersion(packageJson.version, identity.revision);
  const outputDir = path.join(root, 'release-store');

  console.log(`Store identity: ${identity.identityName}`);
  console.log(`Publisher:      ${identity.publisher ? 'configured' : 'missing'}`);
  console.log(`Package version: ${version}`);

  if (process.argv.includes('--check')) {
    console.log('Identity and version check passed; nothing was built.');
    return;
  }

  const buildEnv = {
    ...process.env,
    VITE_STORE_BUILD: '1',
    STORE_IDENTITY_NAME: identity.identityName,
    STORE_PUBLISHER: identity.publisher,
    STORE_PUBLISHER_DISPLAY_NAME: identity.publisherDisplayName,
    STORE_DISPLAY_NAME: identity.displayName,
    STORE_APPLICATION_ID: identity.applicationId,
    // electron-builder reads this when appx.setBuildNumber is true.
    BUILD_NUMBER: String(identity.revision),
  };

  console.log('\nBuilding the Store renderer (blank seed, GitHub updater disabled)…');
  run(process.execPath, [path.join(root, 'scripts', 'app-changelog.mjs')], buildEnv);
  run(process.execPath, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    '--config', 'app/vite.config.ts',
    '--mode', 'store',
  ], buildEnv);

  console.log('\nPackaging the AppX…');
  run(process.execPath, [
    path.join(root, 'node_modules', 'electron-builder', 'cli.js'),
    '--config', 'electron-builder.store.cjs',
    '--win', 'appx',
    '--x64',
    '--publish', 'never',
  ], buildEnv);

  const built = newestAppx(outputDir);
  if (!built) throw new Error(`electron-builder did not produce an AppX package in ${outputDir}.`);

  const builtPath = path.join(outputDir, built.name);
  const finalPath = path.join(outputDir, `FinanceHub-${version}-x64.appx`);
  if (path.resolve(builtPath) !== path.resolve(finalPath)) {
    if (existsSync(finalPath)) unlinkSync(finalPath);
    renameSync(builtPath, finalPath);
  }

  console.log(`\nBuilt ${finalPath}`);
  console.log('Package version: ' + version);
  console.log('Next: run the AppX WACK check and review the Partner Center submission steps in docs/STORE.md.');
  console.log('Nothing was uploaded or published.');
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`Store build failed: ${error.message}`);
    process.exit(1);
  });
}
