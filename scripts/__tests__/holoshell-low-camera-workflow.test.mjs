#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-low-camera-workflow.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  selfTest,
  validateReceipt,
} from '../holoshell-low-camera-workflow.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-low-camera-workflow.mjs');

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

console.log('Test 1: self-test workflow receipt links sweep and render receipts');
const receipt = await selfTest();
assertEq(receipt.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(receipt.status, 'pass', 'pass status');
assertEq(validateReceipt(receipt).length, 0, 'receipt validates');
assertOk(receipt.target.receiptHash.startsWith('sha256:'), 'target receipt hash recorded');
assertOk(receipt.target.pngHash.startsWith('sha256:'), 'target PNG hash recorded');
assertOk(receipt.target.pngFileHash.startsWith('sha256:'), 'target PNG file hash recorded');
assertEq(receipt.target.profile, 'fiducial-board', 'fiducial board profile recorded');
assertEq(receipt.target.dictionary, 'holoshell-native-binary-7x7-v1', 'fiducial dictionary recorded');
assertEq(receipt.target.markerCount, 9, 'fiducial marker count recorded');
assertEq(receipt.target.primitiveCount, 2, 'target primitive count recorded');
assertEq(receipt.target.fiducialCount, 9, 'target fiducial count recorded');
assertOk(receipt.sweep.receiptHash.startsWith('sha256:'), 'sweep receipt hash recorded');
assertOk(receipt.sweep.fileHash.startsWith('sha256:'), 'sweep file hash recorded');
assertEq(receipt.sweep.winner.mode, 'raw', 'winner mode recorded');
assertOk(receipt.control.frame.path, 'camera control frame recorded');
assertOk(receipt.control.frame.fileHash.startsWith('sha256:'), 'camera control frame hash recorded');
assertEq(receipt.targetDetection.detection.status, 'not-detected', 'target detection status recorded');
assertEq(receipt.targetDetection.target.profile, 'fiducial-board', 'target detection carries target profile');
assertEq(receipt.targetDetection.detection.recoveredMarkerCount, 0, 'missing target recovers zero markers');
assertEq(receipt.targetDetection.detection.boardHomographyReady, false, 'missing target has no board homography');
assertEq(
  receipt.targetDetection.detection.boardPose.status,
  'insufficient-correspondences',
  'missing target homography fails closed'
);
assertEq(receipt.targetDetection.detection.calibrationReady, false, 'target detection does not claim calibration readiness');
const targetDetectionStage = receipt.chain.stages.find((stage) => stage.name === 'workflow.target-in-frame-analysis');
assertEq(targetDetectionStage.metrics.boardHomographyReady, false, 'chain stage records board homography readiness');
assertEq(receipt.fiducialPoseSeed.status, 'blocked', 'missing target blocks fiducial pose seed');
assertEq(receipt.fiducialPoseSeed.poseSeed.poseSeedReady, false, 'blocked pose seed is not ready');
assertEq(receipt.fiducialPoseSeed.poseSeed.calibrationReady, false, 'pose seed does not claim calibration');
assertOk(
  receipt.fiducialPoseSeed.poseSeed.blockers.includes('board-homography-unavailable'),
  'pose seed blocker recorded'
);
const poseSeedStage = receipt.chain.stages.find((stage) => stage.name === 'workflow.fiducial-pose-seed');
assertEq(poseSeedStage.metrics.poseSeedReady, false, 'chain stage records pose seed readiness');
assertOk(receipt.render.receiptHash.startsWith('sha256:'), 'render receipt hash recorded');
assertOk(receipt.render.pngHash.startsWith('sha256:'), 'quilt png hash recorded');
assertEq(receipt.render.quality.grade, 'weak', 'workflow carries render quality grade');
assertOk(receipt.quality.score >= 0, 'workflow exposes top-level quality');
assertOk(receipt.technologyPlan.recommendedNow.includes('fiducial-calibration'), 'workflow recommends fiducial calibration');
assertOk(receipt.technologyPlan.recommendations.some((recommendation) => recommendation.id === 'mobile-native-depth'), 'workflow carries mobile depth alternative');
assertEq(receipt.chain?.receipt?.stageCount, 5, 'workflow has target, sweep, target detection, pose seed, and render stages');

console.log('Test 2: invalid workflow receipts fail closed');
const missingWinner = {
  ...receipt,
  sweep: {
    ...receipt.sweep,
    winner: undefined,
  },
};
assertOk(validateReceipt(missingWinner).includes('winner missing'), 'winner is required on pass');
const blocked = {
  ...receipt,
  status: 'blocked',
  render: undefined,
};
assertEq(validateReceipt(blocked).length, 0, 'blocked receipt can omit render');

console.log('Test 3: CLI self-test runs without touching hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 4: CLI help exposes one-command workflow');
const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(help.status, 0, 'CLI help exits 0');
assertOk(help.stdout.includes('Low-Camera Workflow'), 'help names workflow');
assertOk(help.stdout.includes('--require-capture'), 'help names hardware gate');
assertOk(help.stdout.includes('--target-profile'), 'help names target profile');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
