#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.holoshell.slow-computer-guarded-stop-dry-run.v0.1.0';
const DEFAULT_PROCESS_HEALTH = path.join(
  '.bench-logs',
  'holoshell-human-os-frontier',
  '2026-05-16',
  'slow-computer-process-health-latest.json'
);
const DEFAULT_OUTPUT = path.join(
  '.bench-logs',
  'holoshell-human-os-frontier',
  '2026-05-16',
  'slow-computer-guarded-stop-dry-run-receipt.json'
);

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function parseArgs(argv) {
  const args = {
    processHealth: DEFAULT_PROCESS_HEALTH,
    output: DEFAULT_OUTPUT,
    pid: 0,
    approvalId: '',
    ownerAck: '',
    reason: 'slow-computer-clinic production dry-run stop readiness',
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--process-health') args.processHealth = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--pid') args.pid = Number(argv[++index]);
    else if (arg === '--approval-id') args.approvalId = argv[++index];
    else if (arg === '--owner-ack') args.ownerAck = argv[++index];
    else if (arg === '--reason') args.reason = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node experiments/holoshell-human-os-frontier/slow-computer-clinic-guarded-stop-dry-run.mjs [--process-health <path>] [--pid <pid>] [--approval-id <id>] [--owner-ack <text>] [--json]`);
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

function readJson(filePath) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(readFileSync(resolved, 'utf8'));
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

function chooseStopPlan(health, requestedPid) {
  const plans = Array.isArray(health.stopPlans) ? health.stopPlans : [];
  if (requestedPid) return plans.find((plan) => Number(plan.pid) === requestedPid) || null;
  return plans[0] || null;
}

function buildReceipt({ health, args, now = new Date(), visibleNow = null }) {
  const requestedPid = Number.isInteger(args.pid) && args.pid > 0 ? args.pid : 0;
  const stopPlan = chooseStopPlan(health, requestedPid);
  const targetPid = Number(stopPlan?.pid || requestedPid || 0);
  const liveVisible = visibleNow === null ? processExists(targetPid) : Boolean(visibleNow);
  const policy = health.policies || {};
  const blockedReasons = [];
  const ownerHandoffRequired = Boolean(stopPlan?.custody?.ownerHandoffRequired);

  if (!stopPlan) blockedReasons.push('no_stop_plan_for_exact_pid');
  if (!Number.isInteger(targetPid) || targetPid <= 0) blockedReasons.push('missing_exact_pid');
  if (policy.readOnlyByDefault !== true) blockedReasons.push('read_only_policy_missing');
  if (policy.automaticTerminationAllowed !== false) blockedReasons.push('automatic_termination_policy_not_false');
  if (policy.exactPidRequired !== true) blockedReasons.push('exact_pid_policy_missing');
  if (stopPlan && stopPlan.approvalRequired !== true) blockedReasons.push('stop_plan_missing_approval_requirement');
  if (stopPlan && stopPlan.safeToExecuteAutomatically !== false) blockedReasons.push('stop_plan_allows_automatic_execution');
  if (!args.approvalId) blockedReasons.push('approval_id_required');
  if (ownerHandoffRequired && !args.ownerAck) blockedReasons.push('owner_ack_required');
  if (!liveVisible) blockedReasons.push('target_pid_not_visible_at_recheck');

  const status = blockedReasons.length ? 'blocked' : 'ready_for_runtime_approval';
  const generatedAt = now.toISOString();
  const stopReadiness = {
    targetPid,
    planId: stopPlan?.planId || '',
    planHash: stableHash(stopPlan || { targetPid }),
    exactPidRechecked: liveVisible,
    approvalId: args.approvalId,
    ownerAck: args.ownerAck,
    ownerHandoffRequired,
    reason: args.reason,
    stopPolicy: stopPlan?.custody?.stopPolicy || policy.stopPolicy || 'break_glass_required',
    dryRunOnly: true,
  };

  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: {
      room: 'experiments/holoshell-human-os-frontier/slow-computer-clinic-room.holo',
      policy: 'experiments/holoshell-human-os-frontier/slow-computer-clinic-policy.hsplus',
      pipeline: 'experiments/holoshell-human-os-frontier/slow-computer-clinic-pipeline.hs',
      adapter: 'experiments/holoshell-human-os-frontier/slow-computer-clinic-guarded-stop-dry-run.mjs',
      processHealth: args.processHealth,
    },
    host: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
    },
    stopReadiness,
    target: stopPlan
      ? {
        pid: stopPlan.pid,
        name: stopPlan.name,
        category: stopPlan.category,
        ageMinutes: stopPlan.ageMinutes,
        memoryMb: stopPlan.memoryMb,
        findings: stopPlan.findings || [],
        ownerLane: stopPlan.custody?.ownerLane || null,
        ownerHandoffRequired,
        cleanupEligible: Boolean(stopPlan.custody?.cleanupEligible),
      }
      : null,
    execution: {
      attempted: false,
      performed: false,
      dryRunOnly: true,
      refusedReason: 'production_guarded_stop_adapter_never_terminates_processes',
    },
    safety: {
      externalProcessTerminationAllowed: false,
      sourceFilesMutated: false,
      rawCommandLinesCaptured: false,
      requiresFreshHumanGestureBeforeExecution: true,
      requiresExactPidRecheckImmediatelyBeforeExecution: true,
      requiresOwnerAckWhenOwnerLanePresent: true,
    },
    blockedReasons,
    summary: {
      status,
      targetPid,
      exactPidRechecked: liveVisible,
      approvalCaptured: Boolean(args.approvalId),
      ownerAckCaptured: Boolean(args.ownerAck),
      terminationPerformed: false,
      dryRunOnly: true,
    },
  };
  receipt.witness = {
    processHealthHash: stableHash({
      generatedAt: health.generatedAt,
      summary: health.summary,
      policies: health.policies,
      stopPlanCount: Array.isArray(health.stopPlans) ? health.stopPlans.length : 0,
    }),
    stopReadinessHash: stableHash(stopReadiness),
    receiptHash: stableHash({
      schemaVersion: receipt.schemaVersion,
      generatedAt: receipt.generatedAt,
      stopReadiness: receipt.stopReadiness,
      target: receipt.target,
      execution: receipt.execution,
      safety: receipt.safety,
      blockedReasons: receipt.blockedReasons,
      summary: receipt.summary,
    }),
  };
  return receipt;
}

function selfTest() {
  const health = {
    generatedAt: '2026-05-16T00:00:00.000Z',
    summary: { riskState: 'warn', stopPlanCount: 1 },
    policies: {
      readOnlyByDefault: true,
      automaticTerminationAllowed: false,
      stopPolicy: 'break_glass_required',
      exactPidRequired: true,
      receiptRequired: true,
    },
    stopPlans: [
      {
        planId: 'stop-plan-fixture',
        status: 'approval_required',
        pid: 12345,
        name: 'node.exe',
        category: 'node_runtime',
        ageMinutes: 180,
        memoryMb: 12.5,
        findings: ['stale_shell_or_dev_run'],
        custody: {
          cleanupEligible: true,
          ownerHandoffRequired: false,
          ownerLane: null,
          stopPolicy: 'break_glass_required',
        },
        approvalRequired: true,
        safeToExecuteAutomatically: false,
        receiptRequired: true,
      },
    ],
  };
  const blocked = buildReceipt({
    health,
    args: { pid: 12345, approvalId: '', ownerAck: '', reason: 'test', processHealth: 'fixture' },
    visibleNow: true,
  });
  assert.equal(blocked.summary.status, 'blocked');
  assert.ok(blocked.blockedReasons.includes('approval_id_required'));

  const ready = buildReceipt({
    health,
    args: { pid: 12345, approvalId: 'approval-fixture', ownerAck: '', reason: 'test', processHealth: 'fixture' },
    visibleNow: true,
  });
  assert.equal(ready.summary.status, 'ready_for_runtime_approval');
  assert.equal(ready.execution.performed, false);
  assert.equal(ready.safety.externalProcessTerminationAllowed, false);

  const missing = buildReceipt({
    health,
    args: { pid: 12345, approvalId: 'approval-fixture', ownerAck: '', reason: 'test', processHealth: 'fixture' },
    visibleNow: false,
  });
  assert.equal(missing.summary.status, 'blocked');
  assert.ok(missing.blockedReasons.includes('target_pid_not_visible_at_recheck'));
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) selfTest();
  const health = readJson(args.processHealth);
  const receipt = buildReceipt({ health, args });
  receipt.output = { path: atomicWriteJson(args.output, receipt) };
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(`Slow Computer Clinic guarded stop dry-run: ${receipt.summary.status}`);
    console.log(`Receipt: ${receipt.output.path}`);
    console.log(`PID: ${receipt.summary.targetPid || 'none'}`);
    console.log(`Termination performed: no`);
  }
} catch (error) {
  console.error(`slow-computer guarded stop dry-run failed: ${error.message}`);
  process.exit(1);
}
