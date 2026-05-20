#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-actuation-plan-adapter.mjs.
 *
 * Run via: node scripts/__tests__/holoshell-actuation-plan-adapter.test.mjs
 *
 * task_1779224072780_0o16
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildActuationPlanPack,
  buildSimulatedPack,
  buildApprovedPack,
  buildAbortedPack,
  validateActuationPlanPack,
  ACTUATION_PLAN_PACK_VERSION,
  WORKFLOW,
} from '../holoshell-actuation-plan-adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-actuation-plan-adapter.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertThrows(fn, expectedSubstring, name) {
  testsRun += 1;
  try {
    fn();
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected throw but did not throw`);
  } catch (error) {
    if (expectedSubstring && !String(error.message).includes(expectedSubstring)) {
      testsFailed += 1;
      console.error(`  FAIL ${name}: expected "${expectedSubstring}" in error, got "${error.message}"`);
    } else {
      console.log(`  PASS ${name}`);
    }
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// ── Fixtures ──

const validRequest = {
  now: '2026-05-20T00:00:00.000Z',
  deviceId: 'quest-3-bt-aabbcc1122',
  deviceCategory: 'headset',
  deviceLabel: 'Quest 3 (headset)',
  identitySource: 'pnP_device_id',
  manufacturer: 'Meta',
  model: 'Quest 3',
  connectionStatus: 'connected',
  actionClass: 'haptic',
  riskLevel: 'low',
  commandPreview: 'haptic pulse 200ms left-controller',
  safeRanges: [
    { parameter: 'pulse_duration_ms', unit: 'ms', min: 0, max: 500, defaultValue: 100, autoStopOnViolation: true },
  ],
  maxSensorAgeMs: 5000,
  maxApprovalAgeMs: 30000,
  rollbackScope: 'haptic completes or times out; no physical state change',
  rollbackWindowMs: 0,
};

const simulateInput = {
  now: '2026-05-20T00:01:00.000Z',
  simulationEngine: 'holoshell-haptic-stub',
  predictedOutcome: 'left-controller emits 200ms haptic pulse within safe range',
  durationMs: 200,
  paramValues: { pulse_duration_ms: 200 },
};

// ── Test 1: plan produces valid read-only pack ──
console.log('Test 1: plan produces read-only pack with nonce + execution disabled');
const plan = buildActuationPlanPack(validRequest);
assertEq(plan.status, 'planned', 'plan status');
assertEq(plan.workflow, WORKFLOW, 'plan workflow');
assertEq(plan.schemaVersion, ACTUATION_PLAN_PACK_VERSION, 'plan schemaVersion');
assertEq(plan.executionEnabled, false, 'executionEnabled is false in plan');
assertOk(plan.nonce?.length > 0, 'nonce is present');
assertOk(plan.replayKey?.length > 0, 'replayKey is present');
assertOk(validateActuationPlanPack(plan).length === 0, 'plan validates');
assertEq(plan.envelope.deviceMutationAllowed, false, 'envelope.deviceMutationAllowed is false in plan');
const planJson = JSON.stringify(plan);
assertOk(!planJson.includes('aabbcc1122'), 'raw device ID fragment is absent from receipt');

// ── Test 2: simulate passes safe ranges ──
console.log('Test 2: simulate passes safe ranges and produces simulation receipt');
const simulated = buildSimulatedPack(plan, simulateInput);
assertEq(simulated.status, 'simulated', 'simulated status');
assertOk(simulated.simulation?.simulationPassed === true, 'simulation.simulationPassed is true');
assertOk(validateActuationPlanPack(simulated).length === 0, 'simulated pack validates');

// ── Test 3: safe-range violation is rejected ──
console.log('Test 3: simulate rejects safe-range violations');
assertThrows(
  () => buildSimulatedPack(plan, {
    ...simulateInput,
    paramValues: { pulse_duration_ms: 600 }, // > max 500
    durationMs: 600,
  }),
  'safe-range constraints',
  'safe-range violation throws'
);

// ── Test 4: approve with correct nonce unlocks execution ──
// Approve within the 30s window from plan creation (2026-05-20T00:00:00Z + 20s)
console.log('Test 4: approve with correct nonce unlocks execution');
const approved = buildApprovedPack(simulated, {
  now: '2026-05-20T00:00:20.000Z',
  approveNonce: plan.nonce,
});
assertEq(approved.status, 'approved', 'approved status');
assertEq(approved.executionEnabled, true, 'executionEnabled is true after approve');
assertOk(approved.envelope.deviceMutationAllowed === true, 'envelope.deviceMutationAllowed is true after approve');
assertOk(approved.sensorFreshness?.fresh === true, 'sensorFreshness.fresh is true');
assertOk(validateActuationPlanPack(approved).length === 0, 'approved pack validates');

// ── Test 5: wrong nonce is rejected ──
console.log('Test 5: approve rejects wrong nonce');
assertThrows(
  () => buildApprovedPack(simulated, { now: '2026-05-20T00:00:10.000Z', approveNonce: 'wrong-nonce' }),
  'Nonce mismatch',
  'wrong nonce throws nonce mismatch'
);

// ── Test 6: approving without simulating is rejected ──
console.log('Test 6: approve without simulate is rejected');
assertThrows(
  () => buildApprovedPack(plan, { now: '2026-05-20T00:02:00.000Z', approveNonce: plan.nonce }),
  'simulate first',
  'approve without simulate throws'
);

// ── Test 7: stale approval is rejected ──
console.log('Test 7: stale approval is rejected');
const stalePlan = buildActuationPlanPack({ ...validRequest, now: '2026-04-01T00:00:00.000Z' });
const staleSimulated = buildSimulatedPack(stalePlan, { ...simulateInput, now: '2026-04-01T00:01:00.000Z' });
assertThrows(
  () => buildApprovedPack(staleSimulated, {
    now: '2026-05-20T12:00:00.000Z',
    approveNonce: stalePlan.nonce,
  }),
  'Freshness gate',
  'stale approval throws freshness gate error'
);

// ── Test 8: abort from planned produces safeStop receipt ──
console.log('Test 8: abort produces safeStop receipt with execution disabled');
const aborted = buildAbortedPack(plan, { now: '2026-05-20T00:03:00.000Z', abortReason: 'operator_request' });
assertEq(aborted.status, 'aborted', 'aborted status');
assertEq(aborted.executionEnabled, false, 'executionEnabled is false after abort');
assertOk(aborted.safeStop?.safeCategoryReached === true, 'safeStop.safeCategoryReached is true');
assertEq(aborted.safeStop?.trigger, 'operator_request', 'safeStop trigger is operator_request');
assertOk(validateActuationPlanPack(aborted).length === 0, 'aborted pack validates');

// ── Test 9: abort from simulated also works ──
console.log('Test 9: abort from simulated state works');
const abortedFromSim = buildAbortedPack(simulated, { now: '2026-05-20T00:03:00.000Z', abortReason: 'timeout' });
assertEq(abortedFromSim.status, 'aborted', 'aborted from simulated status');
assertEq(abortedFromSim.safeStop?.trigger, 'timeout', 'safeStop trigger is timeout');
assertOk(validateActuationPlanPack(abortedFromSim).length === 0, 'aborted-from-simulated validates');

// ── Test 10: CLI plan -> simulate -> approve -> abort round trip ──
console.log('Test 10: CLI plan -> simulate -> approve round trip writes receipts');
const tmp = mkdtempSync(join(tmpdir(), 'actuation-plan-adapter-test-'));
const requestPath = join(tmp, 'request.json');
const planPath = join(tmp, 'plan.json');
const simulatePath = join(tmp, 'simulate.json');
const simulatedPath = join(tmp, 'simulated.json');
const approvePath = join(tmp, 'approve.json');
const approvedPath = join(tmp, 'approved.json');
const abortPath = join(tmp, 'abort.json');
const abortedPath = join(tmp, 'aborted.json');

writeJson(requestPath, validRequest);
writeJson(simulatePath, simulateInput);

const planCli = spawnSync(process.execPath, [SCRIPT, 'plan', '--input', requestPath, '--out', planPath], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(planCli.status, 0, 'CLI plan exits 0');
assertOk(existsSync(planPath), 'CLI plan file exists');

const cliPlan = JSON.parse(readFileSync(planPath, 'utf8'));
assertOk(cliPlan.nonce?.length > 0, 'CLI plan has nonce');

const simulateCli = spawnSync(process.execPath, [SCRIPT, 'simulate', '--pack', planPath, '--input', simulatePath, '--out', simulatedPath], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(simulateCli.status, 0, 'CLI simulate exits 0');
assertOk(existsSync(simulatedPath), 'CLI simulated file exists');

writeJson(approvePath, { now: '2026-05-20T00:00:20.000Z', approveNonce: cliPlan.nonce });
const approveCli = spawnSync(process.execPath, [SCRIPT, 'approve', '--pack', simulatedPath, '--input', approvePath, '--out', approvedPath], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(approveCli.status, 0, 'CLI approve exits 0');
const cliApproved = JSON.parse(readFileSync(approvedPath, 'utf8'));
assertEq(cliApproved.status, 'approved', 'CLI approved status');
assertEq(cliApproved.executionEnabled, true, 'CLI approved executionEnabled');

writeJson(abortPath, { now: '2026-05-20T00:03:00.000Z', abortReason: 'operator_request' });
const abortCli = spawnSync(process.execPath, [SCRIPT, 'abort', '--pack', simulatedPath, '--input', abortPath, '--out', abortedPath], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(abortCli.status, 0, 'CLI abort exits 0');
const cliAborted = JSON.parse(readFileSync(abortedPath, 'utf8'));
assertEq(cliAborted.status, 'aborted', 'CLI aborted status');
assertEq(validateActuationPlanPack(cliAborted).length, 0, 'CLI aborted validates');
rmSync(tmp, { recursive: true, force: true });

// ── Test 11: CLI --self-test ──
console.log('Test 11: CLI --self-test passes');
const selfTest = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(selfTest.status, 0, 'CLI self-test exits 0');
assertOk(selfTest.stdout.includes('holoshell-actuation-plan-adapter'), 'self-test names adapter');

// ── Test 12: robot device category works ──
console.log('Test 12: robot device category and command action class work');
const robotPlan = buildActuationPlanPack({
  ...validRequest,
  deviceId: 'robot-arm-usb-00ff1122',
  deviceCategory: 'robot',
  identitySource: 'usb_serial',
  actionClass: 'command',
  riskLevel: 'high',
  commandPreview: 'move joint J1 +10deg at 20deg/s',
  safeRanges: [
    { parameter: 'joint_velocity_deg_s', unit: 'deg/s', min: 0, max: 30, defaultValue: 10, autoStopOnViolation: true },
  ],
});
assertEq(robotPlan.envelope.actionClass, 'command', 'robot plan actionClass');
assertOk(validateActuationPlanPack(robotPlan).length === 0, 'robot plan validates');

// ── Summary ──
if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}
console.log(`\n${testsRun}/${testsRun} tests passed`);
