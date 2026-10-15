#!/usr/bin/env node
/**
 * Pure Node tests for scripts/android-arcore-depth-apk-runner.mjs.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRAME_RECEIPT_VERSION,
  SWEEP_MANIFEST_VERSION,
  SWEEP_REPLAY_RECEIPT_VERSION,
  frameReceiptToArCoreBundleInput,
  sweepManifestToArCoreBundleInput,
  validateFrameReceipt,
  validateSweepManifest,
} from '../android-arcore-depth-apk-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'android-arcore-depth-apk-runner.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertOk(value, name) {
  testsRun += 1;
  if (value) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

console.log('Test 1: frame receipt validation accepts native depth pass');
const fixture = {
  schemaVersion: FRAME_RECEIPT_VERSION,
  status: 'pass',
  deviceModel: 'SM-S918U',
  timestampNs: 123000000,
  sample: {
    width: 2,
    height: 2,
    stride: 3,
    rgb: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4],
    depthMillimeters: [500, 1000, 1500, 0],
    rawDepthConfidence: [255, 128, 64, 0],
  },
  depthImage16Bits: { width: 160, height: 90 },
  intrinsics: { imageWidth: 4, imageHeight: 4, fx: 4, fy: 4, cx: 2, cy: 2 },
  cameraTransformColumnMajor4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0.3, 1],
};
assertEq(validateFrameReceipt(fixture).length, 0, 'valid receipt validates');
const bundleInput = frameReceiptToArCoreBundleInput(fixture);
assertEq(
  bundleInput.frames[0].depthImage16Bits.millimeters[1],
  1000,
  'depth millimeters preserved'
);
assertEq(bundleInput.intrinsics.fx, 2, 'fx scaled to sample frame');
assertEq(bundleInput.intrinsics.cx, 1, 'cx scaled to sample frame');
assertEq(bundleInput.frames[0].rawDepthConfidenceImage.values[0], 255, 'confidence preserved');

console.log('Test 2: invalid receipts fail closed');
const badDepth = { ...fixture, sample: { ...fixture.sample, depthMillimeters: [500] } };
assertOk(
  validateFrameReceipt(badDepth).includes('sample depth length invalid'),
  'bad depth length rejected'
);
const blocked = {
  schemaVersion: FRAME_RECEIPT_VERSION,
  status: 'blocked',
  blockedReason: 'depth-frame-timeout',
};
assertEq(validateFrameReceipt(blocked).length, 0, 'blocked receipt validates with reason');
assertOk(
  validateFrameReceipt({ schemaVersion: FRAME_RECEIPT_VERSION, status: 'blocked' }).includes(
    'blocked receipt missing blockedReason'
  ),
  'blocked receipt requires reason'
);

console.log('Test 3: CLI self-test verifies native template contents');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI names self-test pass');

console.log('Test 4: sweep manifest converts to ARCore bundle input');
function makeSweepManifest() {
  return {
    schemaVersion: SWEEP_MANIFEST_VERSION,
    status: 'pass',
    deviceModel: 'TEST-SWEEP',
    frameCount: 3,
    durationMs: 4000,
    pathLengthM: 0.6,
    cameraImage: { width: 8, height: 6, format: 'jpeg' },
    intrinsics: { imageWidth: 8, imageHeight: 6, fx: 8, fy: 8, cx: 4, cy: 3 },
    frames: [0, 1, 2].map((i) => ({
      index: i,
      timestampNs: 1_000_000_000 + i * 100_000_000,
      jpeg: `frames/frame_00${i}.jpg`,
      depthCoverage: 0.9,
      sharpness: 500,
      cameraTransformColumnMajor4x4: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.2 * i, 0, 0.1 * i, 1],
      depthWidth: 4,
      depthHeight: 3,
      depthMillimeters: Array.from({ length: 12 }, (_, k) => 600 + 40 * k + 10 * i),
    })),
  };
}
const sweepManifest = makeSweepManifest();
assertEq(validateSweepManifest(sweepManifest).length, 0, 'valid sweep manifest validates');
const sweepDecoded = sweepManifest.frames.map((_, i) => ({
  width: 4,
  height: 3,
  rgb: new Uint8Array(4 * 3 * 3).fill(10 + i),
}));
const sweepBundleInput = sweepManifestToArCoreBundleInput(sweepManifest, sweepDecoded);
assertEq(sweepBundleInput.frames.length, 3, 'all sweep frames converted');
assertEq(sweepBundleInput.intrinsics.fx, 4, 'sweep fx scaled to decoded rgb');
assertEq(sweepBundleInput.intrinsics.cy, 1.5, 'sweep cy scaled to decoded rgb');
assertEq(sweepBundleInput.frames[1].timestampMs, 1100, 'sweep timestampNs converted to ms');
assertEq(
  sweepBundleInput.frames[2].depthImage16Bits.millimeters[0],
  620,
  'sweep depth millimeters preserved'
);
assertEq(
  sweepBundleInput.frames[2].cameraTransformColumnMajor4x4[12],
  0.4,
  'sweep pose translation preserved'
);
assertEq(sweepBundleInput.frames[0].stride, 3, 'sweep frames use rgb stride 3');
const sweepLimited = sweepManifestToArCoreBundleInput(sweepManifest, sweepDecoded.slice(0, 2), {
  maxFrames: 2,
});
assertEq(sweepLimited.frames.length, 2, 'maxFrames bounds converted sweep frames');

console.log('Test 5: invalid sweep manifests fail closed');
const badSweepDepth = makeSweepManifest();
badSweepDepth.frames[0] = { ...badSweepDepth.frames[0], depthMillimeters: [600] };
assertOk(
  validateSweepManifest(badSweepDepth).includes('frames[0].depthMillimeters length invalid'),
  'bad sweep depth length rejected'
);
const badSweepCount = { ...makeSweepManifest(), frameCount: 7 };
assertOk(
  validateSweepManifest(badSweepCount).includes('frameCount does not match frames length'),
  'frameCount mismatch rejected'
);
const badSweepJpeg = makeSweepManifest();
badSweepJpeg.frames[1] = { ...badSweepJpeg.frames[1], jpeg: '../escape.jpg' };
assertOk(
  validateSweepManifest(badSweepJpeg).includes('frames[1].jpeg must be a sweep-relative path'),
  'jpeg path traversal rejected'
);
let decodedMismatchError = '';
try {
  sweepManifestToArCoreBundleInput(makeSweepManifest(), sweepDecoded.slice(0, 1));
} catch (error) {
  decodedMismatchError = error.message;
}
assertOk(
  decodedMismatchError.includes('decodedFrames length must be 3'),
  'decoded frame mismatch rejected'
);

console.log('Test 6: CLI pull-sweep converts a synthetic local sweep end to end');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'arcore-sweep-fixture-'));
try {
  const sweepDir = join(fixtureRoot, 'sweep');
  mkdirSync(join(sweepDir, 'frames'), { recursive: true });
  const sharp = (await import('sharp')).default;
  const cliManifest = makeSweepManifest();
  for (const frame of cliManifest.frames) {
    const raw = Buffer.alloc(8 * 6 * 3);
    for (let p = 0; p < 8 * 6; p += 1) {
      raw[p * 3] = 40 * frame.index + 40;
      raw[p * 3 + 1] = 90;
      raw[p * 3 + 2] = 200 - 40 * frame.index;
    }
    await sharp(raw, { raw: { width: 8, height: 6, channels: 3 } })
      .jpeg({ quality: 92 })
      .toFile(join(sweepDir, frame.jpeg));
  }
  writeFileSync(join(sweepDir, 'manifest.json'), JSON.stringify(cliManifest));
  const replayOut = join(fixtureRoot, 'sweep-replay.json');
  const cliSweep = spawnSync(
    process.execPath,
    [
      SCRIPT,
      'pull-sweep',
      '--sweep-dir',
      sweepDir,
      '--out',
      replayOut,
      '--rgb-width',
      '4',
      '--tile-grid',
      '2',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assertEq(cliSweep.status, 0, 'CLI pull-sweep exits 0 on synthetic sweep');
  const receipt = JSON.parse(readFileSync(replayOut, 'utf8'));
  assertEq(receipt.schemaVersion, SWEEP_REPLAY_RECEIPT_VERSION, 'sweep replay receipt version');
  assertEq(receipt.status, 'pass', 'sweep replay receipt passes');
  assertEq(receipt.conversion.rgb.width, 4, 'sweep rgb downsampled to requested width');
  assertEq(receipt.conversion.rgb.height, 3, 'sweep rgb height keeps intrinsics aspect');
  assertEq(receipt.conversion.frameJpegSha256.length, 3, 'sweep receipt hashes every jpeg');
  assertEq(receipt.replay.frameCount, 3, 'sweep replay consumed all frames');
  assertEq(receipt.replay.stepCount, 3, 'sweep replay stepped every frame');
  assertEq(receipt.replay.pointCount, 12, 'sweep replay point count = frames * tileGrid^2');
  assertOk(
    /^[0-9a-f]{16}$/.test(receipt.replay.replayFingerprint ?? ''),
    'sweep replay fingerprint present'
  );

  const emptyDir = join(fixtureRoot, 'empty-sweep');
  mkdirSync(emptyDir, { recursive: true });
  const cliMissing = spawnSync(
    process.execPath,
    [SCRIPT, 'pull-sweep', '--sweep-dir', emptyDir, '--out', join(fixtureRoot, 'unused.json')],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assertEq(cliMissing.status, 1, 'CLI pull-sweep fails on sweep dir without manifest');
  assertOk(
    cliMissing.stderr.includes('Sweep manifest not found'),
    'missing manifest failure names the gap'
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
