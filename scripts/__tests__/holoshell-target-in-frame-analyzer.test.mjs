#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-target-in-frame-analyzer.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  selfTest,
  validateReceipt,
} from '../holoshell-target-in-frame-analyzer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-target-in-frame-analyzer.mjs');

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

console.log('Test 1: self-test detects target images and rejects blank control image');
const { detected, fiducialDetected, missing } = await selfTest();
assertEq(detected.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(detected.status, 'pass', 'analyzer status pass');
assertEq(validateReceipt(detected).length, 0, 'detected receipt validates');
assertEq(detected.detection.status, 'detected', 'target PNG detected');
assertOk(detected.detection.score >= detected.detection.threshold, 'detected score clears threshold');
assertOk(detected.detection.cornerCandidates.length >= 4, 'detected receipt provides bounds corners');
assertEq(detected.detection.calibrationReady, false, 'detected receipt does not claim calibration readiness');
assertEq(validateReceipt(fiducialDetected).length, 0, 'fiducial board receipt validates');
assertEq(fiducialDetected.target.profile, 'fiducial-board', 'fiducial board profile recorded');
assertEq(fiducialDetected.target.markerCount, 9, 'fiducial marker count recorded');
assertEq(fiducialDetected.detection.status, 'detected', 'fiducial board PNG detected');
assertEq(fiducialDetected.detection.detectionMode, 'fiducial-marker-corners', 'fiducial marker corner mode recorded');
assertEq(fiducialDetected.detection.recoveredMarkerCount, 9, 'all fiducial markers recovered');
assertEq(fiducialDetected.detection.markerCornerCount, 36, 'all fiducial marker corners recovered');
assertEq(fiducialDetected.detection.poseSolveInputReady, true, 'fiducial corners are pose-solve inputs');
assertEq(fiducialDetected.detection.calibrationReady, false, 'fiducial marker recovery is not calibration');
assertOk(
  fiducialDetected.detection.fiducialMarkers.every((marker) => marker.corners.length === 4 && marker.confidence >= 0.76),
  'each recovered marker carries four high-confidence corners'
);
assertOk(
  fiducialDetected.detection.fiducialMarkers.some((marker) => marker.id === 'hs-11'),
  'marker ids are recovered from payloads'
);
assertEq(validateReceipt(missing).length, 0, 'missing receipt validates');
assertEq(missing.detection.status, 'not-detected', 'blank image rejected');
assertEq(missing.detection.cornerCandidates.length, 0, 'missing image has no corner candidates');

console.log('Test 2: invalid receipts fail closed');
const bad = {
  ...detected,
  detection: {
    ...detected.detection,
    calibrationReady: true,
  },
};
assertOk(validateReceipt(bad).includes('calibrationReady must be false for heuristic detector'), 'calibration overclaim rejected');

console.log('Test 3: CLI self-test runs without hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 4: CLI help explains honest scope');
const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(help.status, 0, 'CLI help exits 0');
assertOk(help.stdout.includes('Target-In-Frame Analyzer'), 'help names analyzer');
assertOk(help.stdout.includes('Does not claim'), 'help states honest scope');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
