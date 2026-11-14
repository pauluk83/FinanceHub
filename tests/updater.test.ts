import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildBlockPlan,
  compareVersions,
  reconstructAsar,
  sha256,
  shouldOfferUpdate,
  validateManifest,
} = require('../electron/update-core.cjs');

const BLOCK = 64 * 1024;

function manifestFor(buffer: Buffer, version = '2026.11.15', buildId = 'abcdef123456') {
  const blocks: { offset: number; size: number; sha256: string }[] = [];
  for (let offset = 0; offset < buffer.length; offset += BLOCK) {
    const size = Math.min(BLOCK, buffer.length - offset);
    blocks.push({ offset, size, sha256: sha256(buffer.subarray(offset, offset + size)) });
  }
  return validateManifest({
    schema: 1,
    version,
    buildId,
    blockSize: BLOCK,
    asar: { size: buffer.length, sha256: sha256(buffer) },
    blocks,
    notes: ['Delta updater test note'],
    installer: { name: 'FinanceHub-Setup-2026.11.15.exe', size: 123, sha256: 'a'.repeat(64) },
  });
}

test('a newer version or a new build of the same version is offered', () => {
  const manifest = { version: '2026.11.15', buildId: 'abcdef123456' };
  assert.equal(shouldOfferUpdate({ version: '2026.11.14', buildId: '111111111111' }, manifest), true);
  assert.equal(shouldOfferUpdate({ version: '2026.11.15', buildId: '111111111111' }, manifest), true);
  assert.equal(shouldOfferUpdate({ version: '2026.11.15', buildId: 'abcdef123456' }, manifest), false);
  assert.equal(shouldOfferUpdate({ version: '2026.11.16', buildId: '111111111111' }, manifest), false);
  assert.equal(compareVersions('2026.11.15', '2026.11.9'), 6);
});

test('the manifest rejects unsafe or inconsistent block layouts', () => {
  const buffer = Buffer.alloc(BLOCK * 2 + 50, 1);
  const valid = manifestFor(buffer);
  assert.equal(valid.blocks.length, 3);

  assert.throws(() => validateManifest({ ...valid, schema: 2 }), /schema/);
  assert.throws(() => validateManifest({ ...valid, asar: { ...valid.asar, size: valid.asar.size + 1 } }), /block count|contiguous/);
  assert.throws(() => validateManifest({
    ...valid,
    blocks: valid.blocks.map((block, index) => index === 0 ? { ...block, offset: 1 } : block),
  }), /contiguous/);
  assert.throws(() => validateManifest({
    ...valid,
    blocks: valid.blocks.map((block, index) => index === 1 ? { ...block, sha256: 'bad' } : block),
  }), /block hash/);
});

test('the patch plan reuses unchanged local blocks and groups changed ranges', async () => {
  const oldAsar = Buffer.alloc(BLOCK * 3, 0);
  for (let offset = 0; offset < oldAsar.length; offset += BLOCK) {
    oldAsar.fill(offset / BLOCK + 1, offset, offset + BLOCK);
  }
  const newAsar = Buffer.from(oldAsar);
  newAsar.fill(99, BLOCK, BLOCK * 2);

  const manifest = manifestFor(newAsar);
  const plan = buildBlockPlan(oldAsar, manifest);
  assert.equal(plan.totalBlocks, 3);
  assert.equal(plan.changedBlocks, 1);
  assert.equal(plan.reusedBytes, BLOCK * 2);
  assert.equal(plan.downloadBytes, BLOCK);
  assert.deepEqual(plan.ranges, [{ start: BLOCK, end: BLOCK * 2 }]);

  const progress: number[] = [];
  const rebuilt = await reconstructAsar({
    oldAsar,
    manifest,
    plan,
    readRemote: async (start: number, end: number) => newAsar.subarray(start, end + 1),
    onProgress: (value: { downloadedBytes: number }) => progress.push(value.downloadedBytes),
  });
  assert.equal(sha256(rebuilt), sha256(newAsar));
  assert.deepEqual(progress, [BLOCK]);
});

test('a missing installed archive produces a full download plan', () => {
  const newAsar = Buffer.alloc(BLOCK + 10, 7);
  const manifest = manifestFor(newAsar);
  const plan = buildBlockPlan(null, manifest);
  assert.equal(plan.changedBlocks, 2);
  assert.equal(plan.reusedBytes, 0);
  assert.equal(plan.downloadBytes, newAsar.length);
});
