#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.slow-computer-remediation-fixture.v0.1.0';
const DEFAULT_OUTPUT = path.join(
  '.bench-logs',
  'holoshell-human-os-frontier',
  '2026-05-16',
  'slow-computer-remediation-fixture-receipt.json'
);

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    selfTest: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node experiments/holoshell-human-os-frontier/slow-computer-clinic-remediation-fixture.mjs [--self-test] [--json] [--output <path>]`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function atomicWriteJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temp, resolved);
  return resolved;
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, intervalMs = 50) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await wait(intervalMs);
  }
  return predicate();
}

function spawnFixtureProcess() {
  const child = spawn(process.execPath, [
    '-e',
    [
      'process.title = "holoshell-slow-clinic-fixture";',
      'process.on("SIGTERM", () => setTimeout(() => process.exit(0), 20));',
      'setInterval(() => {}, 1000);',
    ].join(''),
  ], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  return child;
}

async function runFixture(args) {
  const generatedAt = new Date().toISOString();
  const child = spawnFixtureProcess();
  const pid = child.pid;
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('fixture process did not expose a PID');
  }

  const becameVisible = await waitFor(() => processExists(pid), 3000);
  const before = {
    pid,
    visible: becameVisible,
    ownerLane: 'codex-hardware',
    fixtureOnly: true,
    commandLineIncluded: false,
    commandClass: 'node_fixture_sleep_loop',
  };

  const stopPlan = {
    planId: `clinic-stop-${Date.now().toString(36)}-${stableHash({ pid, generatedAt }).slice(0, 8)}`,
    operation: 'stop_process',
    targetPid: pid,
    exactPidRequired: true,
    ownerLaneRequired: true,
    ownerLane: 'codex-hardware',
    reason: 'slow-computer-clinic guarded remediation fixture',
    automaticTerminationAllowed: false,
    approvalRequired: true,
    breakGlass: true,
    allowedBecause: 'process was spawned by this fixture run and is recorded as disposable',
    refusedTargetPolicy: 'refuse_any_pid_not_spawned_by_this_process',
  };

  const approval = {
    approvalId: `clinic-approval-${Date.now().toString(36)}-${stableHash(stopPlan).slice(0, 8)}`,
    approved: true,
    approvedAt: new Date().toISOString(),
    approvedBy: 'fixture_user_gesture',
    approvalSurface: 'slow_computer_clinic_fixture',
    approvalText: `Approve stopping disposable fixture PID ${pid}`,
  };

  const execution = {
    attempted: false,
    performed: false,
    method: 'SIGTERM',
    exitCode: null,
    signal: null,
    error: '',
  };

  let childExit = null;
  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      childExit = { code, signal };
      resolve(childExit);
    });
  });

  if (!becameVisible) {
    execution.error = 'fixture_pid_not_visible_before_stop';
  } else if (child.pid !== pid || !approval.approved) {
    execution.error = 'fixture_guard_failed';
  } else {
    execution.attempted = true;
    execution.performed = child.kill('SIGTERM');
    await Promise.race([exitPromise, wait(3000)]);
    if (!childExit && processExists(pid)) {
      execution.error = 'fixture_process_did_not_exit_after_sigterm';
      child.kill('SIGKILL');
      await Promise.race([exitPromise, wait(3000)]);
    }
  }

  execution.exitCode = childExit?.code ?? null;
  execution.signal = childExit?.signal ?? null;

  const afterVisible = processExists(pid);
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: {
      room: 'experiments/holoshell-human-os-frontier/slow-computer-clinic-room.holo',
      policy: 'experiments/holoshell-human-os-frontier/slow-computer-clinic-policy.hsplus',
      pipeline: 'experiments/holoshell-human-os-frontier/slow-computer-clinic-pipeline.hs',
      fixture: 'experiments/holoshell-human-os-frontier/slow-computer-clinic-remediation-fixture.mjs',
    },
    host: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
    },
    before,
    stopPlan,
    approval,
    execution,
    after: {
      pid,
      visible: afterVisible,
      verifiedAt: new Date().toISOString(),
      processTerminated: before.visible && !afterVisible,
    },
    safety: {
      fixtureOnly: true,
      targetSpawnedByThisProcess: child.pid === pid,
      externalProcessTerminationAllowed: false,
      rawCommandLinesCaptured: false,
      sourceFilesMutated: false,
      rollback: 'fixture process exits; no user process or file state is modified',
    },
    summary: {
      status: before.visible && execution.performed && !afterVisible ? 'verified' : 'warn',
      targetPid: pid,
      approvalRequired: true,
      approvalCaptured: approval.approved,
      terminationPerformed: execution.performed,
      afterVisible,
    },
  };

  receipt.witness = {
    beforeHash: stableHash(before),
    stopPlanHash: stableHash(stopPlan),
    approvalHash: stableHash(approval),
    afterHash: stableHash(receipt.after),
    receiptHash: stableHash({
      schemaVersion: receipt.schemaVersion,
      generatedAt: receipt.generatedAt,
      before: receipt.before,
      stopPlan: receipt.stopPlan,
      approval: receipt.approval,
      execution: receipt.execution,
      after: receipt.after,
      safety: receipt.safety,
    }),
  };
  receipt.output = { path: atomicWriteJson(args.output, receipt) };
  return receipt;
}

function assertReceipt(receipt) {
  assert.equal(receipt.schemaVersion, SCHEMA_VERSION);
  assert.equal(receipt.before.fixtureOnly, true);
  assert.equal(receipt.stopPlan.exactPidRequired, true);
  assert.equal(receipt.stopPlan.approvalRequired, true);
  assert.equal(receipt.approval.approved, true);
  assert.equal(receipt.execution.performed, true);
  assert.equal(receipt.after.processTerminated, true);
  assert.equal(receipt.safety.externalProcessTerminationAllowed, false);
  assert.equal(receipt.summary.status, 'verified');
}

try {
  const args = parseArgs(process.argv.slice(2));
  const receipt = await runFixture(args);
  if (args.selfTest) assertReceipt(receipt);
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(`Slow Computer Clinic remediation fixture: ${receipt.summary.status}`);
    console.log(`Receipt: ${receipt.output.path}`);
    console.log(`PID: ${receipt.summary.targetPid}`);
    console.log(`Terminated: ${receipt.summary.terminationPerformed ? 'yes' : 'no'}`);
  }
} catch (error) {
  console.error(`slow-computer remediation fixture failed: ${error.message}`);
  process.exit(1);
}
