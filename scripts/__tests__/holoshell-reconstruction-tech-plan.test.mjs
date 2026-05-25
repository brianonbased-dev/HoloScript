#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-reconstruction-tech-plan.mjs.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  buildTechnologyPlan,
  selfTest,
  validateReceipt,
} from '../holoshell-reconstruction-tech-plan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-reconstruction-tech-plan.mjs');

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

console.log('Test 1: self-test emits a researched technology plan receipt');
const receipt = await selfTest();
assertEq(receipt.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(receipt.status, 'pass', 'pass status');
assertEq(validateReceipt(receipt).length, 0, 'receipt validates');
assertEq(receipt.plan.recommendations[0].id, 'fiducial-calibration', 'fiducial calibration is first');
assertOk(receipt.plan.recommendedNow.includes('fiducial-calibration'), 'fiducial calibration recommended now');
assertOk(receipt.plan.sources.some((source) => source.id === 'opencv-aruco'), 'OpenCV ArUco source carried');
assertOk(receipt.plan.sources.some((source) => source.id === 'colmap'), 'COLMAP source carried');
assertOk(receipt.plan.sources.some((source) => source.id === 'apple-mvhevc'), 'MV-HEVC source carried');
assertOk(receipt.plan.nextActions.some((action) => action.id === 'detect-generated-target-in-control-frame'), 'target detection next action carried');
assertOk(receipt.plan.nextActions.some((action) => action.id === 'recover-fiducial-marker-corners'), 'fiducial corner recovery next action carried');
assertOk(receipt.chain?.receipt?.hash?.startsWith('sha256:'), 'chain hash recorded');

console.log('Test 2: planner keeps direct Holoshell path ahead of browser workarounds');
const plan = buildTechnologyPlan({
  workflowReceipt: {
    status: 'pass',
    capturePlan: { frames: 2, geometricTarget: true, targetProfile: 'fiducial-board' },
    target: { profile: 'fiducial-board', markerCount: 9, pngHash: 'sha256:' + 'a'.repeat(64) },
    targetDetection: { detection: { status: 'not-detected' } },
    control: { frame: { rawQuality: { score: 0.52, edgeEnergy: 0.02, contrast: 0.12 } } },
    render: { quality: { score: 0.44, grade: 'weak' } },
  },
});
assertEq(plan.recommendations[0].id, 'fiducial-calibration', 'low-quality workflow starts with fiducials');
assertOk(plan.recommendations.every((recommendation) => !recommendation.backend.toLowerCase().includes('browser')), 'no browser backend recommended');
assertOk(plan.recommendations.some((recommendation) => recommendation.id === 'mobile-native-depth'), 'mobile native depth remains on ladder');
assertOk(plan.nextActions.some((action) => action.id === 'place-target-in-camera-view'), 'missing target visibility becomes operator action');
assertOk(plan.nextActions.some((action) => action.id === 'recover-fiducial-marker-corners'), 'fiducial board advances to marker detector action');
assertOk(!plan.nextActions.some((action) => action.id === 'replace-chart-with-fiducial-board'), 'fiducial board is not re-requested');

console.log('Test 3: planner advances to pose solve once marker corners exist');
const cornerPlan = buildTechnologyPlan({
  workflowReceipt: {
    status: 'pass',
    capturePlan: { frames: 2, geometricTarget: true, targetProfile: 'fiducial-board' },
    target: { profile: 'fiducial-board', markerCount: 9, pngHash: 'sha256:' + 'b'.repeat(64) },
    targetDetection: {
      detection: {
        status: 'detected',
        recoveredMarkerCount: 9,
        markerCornerCount: 36,
        poseSolveInputReady: true,
        boardHomographyReady: false,
        calibrationReady: false,
      },
    },
    control: { frame: { rawQuality: { score: 0.74, edgeEnergy: 0.05, contrast: 0.2 } } },
    render: { quality: { score: 0.67, grade: 'usable' } },
  },
});
assertOk(cornerPlan.signals.hasFiducialMarkerCorners, 'marker corner signal recorded');
assertOk(cornerPlan.nextActions.some((action) => action.id === 'solve-fiducial-board-pose'), 'pose solve is next after marker recovery');
assertOk(!cornerPlan.nextActions.some((action) => action.id === 'recover-fiducial-marker-corners'), 'marker recovery is not re-requested');

console.log('Test 4: planner advances to pose seed once homography exists');
const homographyPlan = buildTechnologyPlan({
  workflowReceipt: {
    status: 'pass',
    capturePlan: { frames: 2, geometricTarget: true, targetProfile: 'fiducial-board' },
    target: { profile: 'fiducial-board', markerCount: 9, pngHash: 'sha256:' + 'c'.repeat(64) },
    targetDetection: {
      detection: {
        status: 'detected',
        recoveredMarkerCount: 9,
        markerCornerCount: 36,
        poseSolveInputReady: true,
        boardHomographyReady: true,
        boardPose: {
          status: 'homography-estimated',
          calibrationReady: false,
          solvePnPReady: false,
          reprojection: { rmsPixels: 0.42, maxPixels: 0.9 },
        },
        calibrationReady: false,
      },
    },
    control: { frame: { rawQuality: { score: 0.74, edgeEnergy: 0.05, contrast: 0.2 } } },
    render: { quality: { score: 0.67, grade: 'usable' } },
  },
});
assertOk(homographyPlan.signals.hasBoardHomography, 'board homography signal recorded');
assertEq(homographyPlan.signals.boardReprojectionRms, 0.42, 'board homography RMS signal recorded');
assertOk(
  homographyPlan.nextActions.some((action) => action.id === 'seed-fiducial-board-camera-pose'),
  'pose seed is next after board homography'
);
assertOk(
  !homographyPlan.nextActions.some((action) => action.id === 'solve-fiducial-board-pose'),
  'homography solve is not re-requested'
);

console.log('Test 5: planner asks for calibration once pose seed exists');
const poseSeedPlan = buildTechnologyPlan({
  workflowReceipt: {
    status: 'pass',
    capturePlan: { frames: 2, geometricTarget: true, targetProfile: 'fiducial-board' },
    target: { profile: 'fiducial-board', markerCount: 9, pngHash: 'sha256:' + 'd'.repeat(64) },
    targetDetection: {
      detection: {
        status: 'detected',
        recoveredMarkerCount: 9,
        markerCornerCount: 36,
        poseSolveInputReady: true,
        boardHomographyReady: true,
        boardPose: {
          status: 'homography-estimated',
          calibrationReady: false,
          solvePnPReady: false,
          reprojection: { rmsPixels: 0.42, maxPixels: 0.9 },
        },
        calibrationReady: false,
      },
    },
    fiducialPoseSeed: {
      status: 'pass',
      poseSeed: {
        poseSeedReady: true,
        calibrationReady: false,
        reprojection: { rmsPixels: 0.51 },
      },
    },
    control: { frame: { rawQuality: { score: 0.74, edgeEnergy: 0.05, contrast: 0.2 } } },
    render: { quality: { score: 0.67, grade: 'usable' } },
  },
});
assertOk(poseSeedPlan.signals.hasFiducialPoseSeed, 'pose seed signal recorded');
assertEq(poseSeedPlan.signals.poseSeedReprojectionRms, 0.51, 'pose seed RMS signal recorded');
assertOk(
  poseSeedPlan.nextActions.some((action) => action.id === 'calibrate-camera-intrinsics-distortion'),
  'camera intrinsics calibration is next after pose seed'
);
assertOk(
  !poseSeedPlan.nextActions.some((action) => action.id === 'seed-fiducial-board-camera-pose'),
  'pose seed is not re-requested'
);

console.log('Test 6: invalid receipts fail closed');
const missingSources = {
  ...receipt,
  plan: {
    ...receipt.plan,
    sources: [],
  },
};
assertOk(validateReceipt(missingSources).includes('sources missing'), 'sources are required');

console.log('Test 7: CLI self-test runs without hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 8: CLI help explains advisory scope');
const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(help.status, 0, 'CLI help exits 0');
assertOk(help.stdout.includes('Reconstruction Technology Plan'), 'help names planner');
assertOk(help.stdout.includes('Does not install'), 'help states honest scope');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
