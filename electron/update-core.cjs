'use strict';

/**
 * Pure helpers for the in-app delta updater.
 *
 * The release manifest describes a fixed-size view of `resources/app.asar`.
 * The running app hashes its own archive, reuses every block whose hash is
 * unchanged, and fetches only contiguous runs of new blocks from GitHub.
 * Keeping this file free of Electron and network code makes the patch plan
 * testable without launching the desktop app.
 */

const { createHash } = require('node:crypto');

const MAX_ASAR_BYTES = 128 * 1024 * 1024;
const MIN_BLOCK_SIZE = 64 * 1024;
const MAX_BLOCK_SIZE = 1024 * 1024;
const MAX_BLOCKS = 4096;
const MAX_RANGE_BYTES = 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const BUILD_ID = /^[0-9a-f]{12}$/;
const VERSION = /^\d+(?:\.\d+){2}$/;

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Compare dotted numeric versions without depending on semver. */
function compareVersions(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  if (left.length !== 3 || right.length !== 3 || [...left, ...right].some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error('Unsupported version in update manifest');
  }
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function boundedString(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`Invalid ${name} in update manifest`);
  }
  return value.trim();
}

function positiveInteger(value, max, name) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new Error(`Invalid ${name} in update manifest`);
  }
  return value;
}

function validateNotes(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error('Invalid notes in update manifest');
  return value.map((note) => boundedString(note, 500, 'note'));
}

/**
 * Validate untrusted JSON before it can drive filesystem writes or downloads.
 * The returned object is the only shape the updater uses.
 */
function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Update manifest is not an object');
  if (value.schema !== 1) throw new Error('Unsupported update manifest schema');

  const version = boundedString(value.version, 40, 'version');
  if (!VERSION.test(version)) throw new Error('Invalid update version');
  const buildId = boundedString(value.buildId, 40, 'build id');
  if (!BUILD_ID.test(buildId)) throw new Error('Invalid update build id');
  const blockSize = positiveInteger(value.blockSize, MAX_BLOCK_SIZE, 'block size');
  if (blockSize < MIN_BLOCK_SIZE) throw new Error('Update block size is too small');

  if (!value.asar || typeof value.asar !== 'object') throw new Error('Update manifest has no archive');
  const size = positiveInteger(value.asar.size, MAX_ASAR_BYTES, 'archive size');
  const archiveHash = boundedString(value.asar.sha256, 64, 'archive hash').toLowerCase();
  if (!SHA256.test(archiveHash)) throw new Error('Invalid archive hash');

  if (!Array.isArray(value.blocks)) throw new Error('Update manifest has no blocks');
  const expectedBlocks = Math.ceil(size / blockSize);
  if (value.blocks.length !== expectedBlocks || expectedBlocks > MAX_BLOCKS) {
    throw new Error('Update manifest block count does not match the archive');
  }

  const blocks = value.blocks.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid update block');
    const offset = index * blockSize;
    const length = Math.min(blockSize, size - offset);
    if (entry.offset !== offset || entry.size !== length) throw new Error('Update manifest block offsets are not contiguous');
    const hash = boundedString(entry.sha256, 64, 'block hash').toLowerCase();
    if (!SHA256.test(hash)) throw new Error('Invalid update block hash');
    return { offset, size: length, sha256: hash };
  });

  let runtime;
  if (value.runtime !== undefined) {
    if (!value.runtime || typeof value.runtime !== 'object') throw new Error('Invalid runtime in update manifest');
    runtime = { electron: boundedString(value.runtime.electron, 40, 'Electron version') };
    if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(runtime.electron)) throw new Error('Invalid Electron version');
  }

  let installer;
  if (value.installer !== undefined) {
    if (!value.installer || typeof value.installer !== 'object') throw new Error('Invalid installer in update manifest');
    const installerSize = positiveInteger(value.installer.size, 1024 * 1024 * 1024, 'installer size');
    const installerHash = boundedString(value.installer.sha256, 64, 'installer hash').toLowerCase();
    if (!SHA256.test(installerHash)) throw new Error('Invalid installer hash');
    installer = {
      name: boundedString(value.installer.name, 160, 'installer name'),
      size: installerSize,
      sha256: installerHash,
    };
  }

  return {
    schema: 1,
    version,
    buildId,
    blockSize,
    asar: { size, sha256: archiveHash },
    blocks,
    runtime,
    installer,
    notes: validateNotes(value.notes),
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt.slice(0, 40) : '',
  };
}

/**
 * A same-version release is a new build when its content id changes. A lower
 * version is never offered, because a force-moved tag can be older than the
 * installed app.
 */
function shouldOfferUpdate(current, manifest) {
  if (!current || typeof current.version !== 'string' || typeof current.buildId !== 'string') {
    throw new Error('The running build is missing its version information');
  }
  if (!BUILD_ID.test(current.buildId)) throw new Error('The running build id is invalid');
  const order = compareVersions(manifest.version, current.version);
  if (order > 0) return true;
  if (order < 0) return false;
  return manifest.buildId !== current.buildId;
}

/**
 * Build a patch plan by matching the new archive's block hashes against the
 * installed archive. Changed blocks are grouped into ranges of at most 1 MiB
 * so the GUI receives regular progress updates without one request per block.
 */
function buildBlockPlan(oldAsar, manifest) {
  const blocks = manifest.blocks.map((block) => ({ ...block, localOffset: null }));
  const oldOffsets = new Map();

  if (Buffer.isBuffer(oldAsar) && oldAsar.length > 0) {
    for (let offset = 0; offset < oldAsar.length; offset += manifest.blockSize) {
      const end = Math.min(offset + manifest.blockSize, oldAsar.length);
      const hash = sha256(oldAsar.subarray(offset, end));
      if (!oldOffsets.has(hash)) oldOffsets.set(hash, offset);
    }
  }

  let reusedBytes = 0;
  for (const block of blocks) {
    const localOffset = oldOffsets.get(block.sha256);
    if (
      Number.isInteger(localOffset)
      && localOffset >= 0
      && localOffset + block.size <= oldAsar.length
    ) {
      block.localOffset = localOffset;
      reusedBytes += block.size;
    }
  }

  const ranges = [];
  let current = null;
  for (const block of blocks) {
    if (block.localOffset !== null) {
      current = null;
      continue;
    }
    if (!current) {
      current = { start: block.offset, end: block.offset + block.size };
      ranges.push(current);
    } else if (block.offset === current.end && current.end - current.start + block.size <= MAX_RANGE_BYTES) {
      current.end += block.size;
    } else {
      current = { start: block.offset, end: block.offset + block.size };
      ranges.push(current);
    }
  }

  const downloadBytes = blocks
    .filter((block) => block.localOffset === null)
    .reduce((sum, block) => sum + block.size, 0);

  return {
    blocks,
    ranges,
    downloadBytes,
    reusedBytes,
    changedBlocks: blocks.filter((block) => block.localOffset === null).length,
    totalBlocks: blocks.length,
  };
}

/**
 * Reconstruct the archive in memory. `readRemote(start, end)` must return the
 * exact inclusive byte range. The final archive hash is checked before the
 * caller is allowed to stage or install anything.
 */
async function reconstructAsar({ oldAsar, manifest, plan, readRemote, onProgress }) {
  if (!plan || plan.blocks.length !== manifest.blocks.length) throw new Error('Update plan does not match the manifest');
  const output = Buffer.alloc(manifest.asar.size);
  let downloadedBytes = 0;

  for (const block of plan.blocks) {
    if (block.localOffset === null) continue;
    oldAsar.copy(output, block.offset, block.localOffset, block.localOffset + block.size);
  }

  for (const range of plan.ranges) {
    const expected = range.end - range.start;
    const chunk = await readRemote(range.start, range.end - 1);
    if (!Buffer.isBuffer(chunk) || chunk.length !== expected) {
      throw new Error('GitHub returned a different update range than requested');
    }
    chunk.copy(output, range.start);
    downloadedBytes += chunk.length;
    onProgress?.({
      downloadedBytes,
      totalBytes: plan.downloadBytes,
      changedBlocks: plan.changedBlocks,
      totalBlocks: plan.totalBlocks,
    });
  }

  for (const block of manifest.blocks) {
    if (sha256(output.subarray(block.offset, block.offset + block.size)) !== block.sha256) {
      throw new Error('The downloaded update failed its block checksum');
    }
  }
  if (sha256(output) !== manifest.asar.sha256) {
    throw new Error('The downloaded update failed its final checksum');
  }
  return output;
}

module.exports = {
  MAX_ASAR_BYTES,
  MAX_BLOCK_SIZE,
  MIN_BLOCK_SIZE,
  buildBlockPlan,
  compareVersions,
  reconstructAsar,
  sha256,
  shouldOfferUpdate,
  validateManifest,
};
