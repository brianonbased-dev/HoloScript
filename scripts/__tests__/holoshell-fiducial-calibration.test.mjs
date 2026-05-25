#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-fiducial-calibration.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  calibrateFiducialAnchor,
  selfTest,
  validateReceipt,
} from '../holoshell-fiducial-calibration.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-fiducial-calibration.mjs');

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

console.log('Test 1: self-test promotes explicit pose seed to calibrated anchor');
const { calibrated, blockedEstimated, blockedNoDistortion, explicitPoseSeed } = await selfTest();
assertEq(calibrated.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(calibrated.status, 'pass', 'pass status');
assertEq(validateReceipt(calibrated).length, 0, 'calibration receipt validates');
assertEq(calibrated.calibration.calibrationReady, true, 'calibration readiness recorded');
assertEq(calibrated.calibration.cameraModelReady, true, 'camera model readiness recorded');
assertEq(calibrated.calibration.calibratedAnchorReady, true, 'calibrated anchor readiness recorded');
assertEq(calibrated.calibration.solvePnPReady, false, 'calibration does not claim solvePnP');
assertEq(calibrated.cameraModel.intrinsics.source, 'explicit-pinhole-intrinsics', 'explicit intrinsics required');
assertEq(calibrated.cameraModel.distortion.known, true, 'distortion provenance recorded');
assertEq(calibrated.cameraModel.distortion.declaredZero, true, 'zero distortion declaration recorded');
assertOk(calibrated.calibration.reprojection.rmsPixels <= 4, 'calibration RMS stays within gate');
assertOk(calibrated.chain?.receipt?.hash?.startsWith('sha256:'), 'chain hash recorded');

console.log('Test 2: estimated intrinsics block calibration');
assertEq(blockedEstimated.status, 'blocked', 'estimated intrinsics blocked');
assertEq(validateReceipt(blockedEstimated).length, 0, 'blocked estimated receipt validates');
assertOk(blockedEstimated.calibration.blockers.includes('explicit-intrinsics-required'), 'explicit intrinsics blocker recorded');
assertEq(blockedEstimated.calibration.calibrationReady, false, 'blocked estimated receipt is not calibration');

console.log('Test 3: missing distortion declaration blocks calibration');
assertEq(blockedNoDistortion.status, 'blocked', 'missing distortion blocked');
assertEq(validateReceipt(blockedNoDistortion).length, 0, 'blocked no distortion receipt validates');
assertOk(
  blockedNoDistortion.calibration.blockers.includes('distortion-declaration-required'),
  'distortion declaration blocker recorded'
);

console.log('Test 4: explicit coefficients are accepted');
const explicitDistortion = calibrateFiducialAnchor({
  poseSeedReceipt: explicitPoseSeed,
  calibrationSource: 'synthetic-coefficients',
  distortionCoefficients: [0.01, -0.002, 0.0001, -0.0002, 0],
});
assertEq(explicitDistortion.status, 'pass', 'explicit distortion pass');
assertEq(explicitDistortion.cameraModel.distortion.model, 'opencv-radtan-k1-k2-p1-p2-k3', 'distortion model recorded');
assertEq(explicitDistortion.cameraModel.distortion.declaredZero, false, 'nonzero distortion recorded');

console.log('Test 5: invalid receipts fail closed');
const overclaim = {
  ...blockedEstimated,
  calibration: {
    ...blockedEstimated.calibration,
    calibrationReady: true,
  },
};
assertOk(validateReceipt(overclaim).includes('blocked receipt must not claim calibration'), 'blocked calibration overclaim rejected');

console.log('Test 6: CLI self-test runs without hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 7: CLI help explains honest scope');
const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(help.status, 0, 'CLI help exits 0');
assertOk(help.stdout.includes('Fiducial Calibration'), 'help names calibration');
assertOk(help.stdout.includes('Does not run OpenCV solvePnP'), 'help states honest scope');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
