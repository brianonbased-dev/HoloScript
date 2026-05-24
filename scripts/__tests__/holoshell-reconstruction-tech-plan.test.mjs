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
assertOk(receipt.chain?.receipt?.hash?.startsWith('sha256:'), 'chain hash recorded');

console.log('Test 2: planner keeps direct Holoshell path ahead of browser workarounds');
const plan = buildTechnologyPlan({
  workflowReceipt: {
    status: 'pass',
    capturePlan: { frames: 2, geometricTarget: true },
    target: { pngHash: 'sha256:' + 'a'.repeat(64) },
    control: { frame: { rawQuality: { score: 0.52, edgeEnergy: 0.02, contrast: 0.12 } } },
    render: { quality: { score: 0.44, grade: 'weak' } },
  },
});
assertEq(plan.recommendations[0].id, 'fiducial-calibration', 'low-quality workflow starts with fiducials');
assertOk(plan.recommendations.every((recommendation) => !recommendation.backend.toLowerCase().includes('browser')), 'no browser backend recommended');
assertOk(plan.recommendations.some((recommendation) => recommendation.id === 'mobile-native-depth'), 'mobile native depth remains on ladder');

console.log('Test 3: invalid receipts fail closed');
const missingSources = {
  ...receipt,
  plan: {
    ...receipt.plan,
    sources: [],
  },
};
assertOk(validateReceipt(missingSources).includes('sources missing'), 'sources are required');

console.log('Test 4: CLI self-test runs without hardware');
const cli = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cli.status, 0, 'CLI self-test exits 0');
assertOk(cli.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 5: CLI help explains advisory scope');
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
