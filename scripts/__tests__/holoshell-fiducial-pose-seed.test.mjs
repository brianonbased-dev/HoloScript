#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-fiducial-pose-seed.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  estimateFiducialPoseSeed,
  selfTest,
  validateReceipt,
} from '../holoshell-fiducial-pose-seed.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-fiducial-pose-seed.mjs');

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

console.log('Test 1: self-test derives an honest fiducial pose seed');
const { poseSeed, blocked, targetInFrame } = await selfTest();
assertEq(poseSeed.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(poseSeed.status, 'pass', 'pass status');
assertEq(validateReceipt(poseSeed).length, 0, 'pose seed validates');
assertEq(poseSeed.poseSeed.status, 'pose-seed-estimated', 'pose seed status');
assertEq(poseSeed.poseSeed.poseSeedReady, true, 'pose seed readiness recorded');
assertEq(poseSeed.poseSeed.calibrationReady, false, 'pose seed is not camera calibration');
assertEq(poseSeed.poseSeed.solvePnPReady, false, 'pose seed does not claim solvePnP');
assertEq(poseSeed.poseSeed.metricScaleReady, false, 'pose seed has no metric scale');
assertEq(poseSeed.intrinsics.source, 'estimated-fov-pinhole', 'estimated intrinsics source recorded');
assertOk(poseSeed.poseSeed.reprojection.rmsPixels <= 1.5, 'pose seed reprojection RMS is low');
assertOk(poseSeed.poseSeed.cameraFromBoard.translationTargetPixels[2] > 0, 'pose seed has positive camera depth');
assertOk(poseSeed.chain?.receipt?.hash?.startsWith('sha256:'), 'chain hash recorded');

console.log('Test 2: missing target blocks instead of overclaiming pose');
assertEq(blocked.status, 'blocked', 'blocked status');
assertEq(validateReceipt(blocked).length, 0, 'blocked receipt validates');
assertEq(blocked.poseSeed.poseSeedReady, false, 'blocked receipt is not pose ready');
assertOk(blocked.poseSeed.blockers.includes('board-homography-unavailable'), 'blocked reason recorded');
assertEq(blocked.poseSeed.calibrationReady, false, 'blocked receipt is not calibration');

console.log('Test 3: explicit pinhole intrinsics are recorded but not promoted to calibration');
const explicit = estimateFiducialPoseSeed({
  targetInFrameReceipt: targetInFrame,
  fx: 500,
  fy: 505,
  cx: 320,
  cy: 180,
});
assertEq(explicit.status, 'pass', 'explicit intrinsics pass');
assertEq(explicit.intrinsics.source, 'explicit-pinhole-intrinsics', 'explicit intrinsics source recorded');
assertEq(explicit.intrinsics.calibrationReady, false, 'explicit intrinsics alone are not calibration');
assertEq(explicit.poseSeed.calibrationReady, false, 'explicit pose seed is not calibration');
assertOk(explicit.poseSeed.reprojection.rmsPixels <= 4, 'explicit intrinsics reprojection RMS stays within gate');

console.log('Test 4: invalid receipts fail closed');
const overclaim = {
  ...poseSeed,
  poseSeed: {
    ...poseSeed.poseSeed,
    calibrationReady: true,
  },
};
assertOk(validateReceipt(overclaim).includes('pose seed must not claim camera calibration'), 'calibration overclaim rejected');

console.log('Test 5: CLI self-test runs without hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 6: CLI help explains honest scope');
const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(help.status, 0, 'CLI help exits 0');
assertOk(help.stdout.includes('Fiducial Pose Seed'), 'help names solver');
assertOk(help.stdout.includes('Does not claim camera calibration'), 'help states honest scope');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
