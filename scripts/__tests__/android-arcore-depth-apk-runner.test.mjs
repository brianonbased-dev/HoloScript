#!/usr/bin/env node
/**
 * Pure Node tests for scripts/android-arcore-depth-apk-runner.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRAME_RECEIPT_VERSION,
  frameReceiptToArCoreBundleInput,
  validateFrameReceipt,
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
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
assertEq(bundleInput.frames[0].depthImage16Bits.millimeters[1], 1000, 'depth millimeters preserved');
assertEq(bundleInput.intrinsics.fx, 2, 'fx scaled to sample frame');
assertEq(bundleInput.intrinsics.cx, 1, 'cx scaled to sample frame');
assertEq(bundleInput.frames[0].rawDepthConfidenceImage.values[0], 255, 'confidence preserved');

console.log('Test 2: invalid receipts fail closed');
const badDepth = { ...fixture, sample: { ...fixture.sample, depthMillimeters: [500] } };
assertOk(validateFrameReceipt(badDepth).includes('sample depth length invalid'), 'bad depth length rejected');
const blocked = {
  schemaVersion: FRAME_RECEIPT_VERSION,
  status: 'blocked',
  blockedReason: 'depth-frame-timeout',
};
assertEq(validateFrameReceipt(blocked).length, 0, 'blocked receipt validates with reason');
assertOk(
  validateFrameReceipt({ schemaVersion: FRAME_RECEIPT_VERSION, status: 'blocked' }).includes('blocked receipt missing blockedReason'),
  'blocked receipt requires reason'
);

console.log('Test 3: CLI self-test verifies native template contents');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI names self-test pass');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
