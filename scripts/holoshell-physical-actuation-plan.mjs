#!/usr/bin/env node
import crypto from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'physical-actuation-plan-latest.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'physical-actuation-plan-latest.js');
const SOURCE_ANCHORS = [
  'apps/holoshell/source/holoshell-physical-actuation-safety-room.holo',
  'apps/holoshell/source/holoshell-physical-actuation-safety-policy.hsplus',
  'apps/holoshell/source/holoshell-physical-actuation-safety-pipeline.hs',
  '../HoloScript/packages/framework/src/board/holoshell-physical-actuation-receipts.ts',
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    actorId: 'device-redacted',
    action: 'trigger_haptic',
    deviceKind: 'headset',
    intent: 'Plan one bounded physical action and show why execution is blocked.',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--actor-id') args.actorId = argv[++index] || args.actorId;
    else if (arg === '--action') args.action = argv[++index] || args.action;
    else if (arg === '--device-kind') args.deviceKind = argv[++index] || args.deviceKind;
    else if (arg === '--intent') args.intent = argv[++index] || args.intent;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) {
    args.actorId = 'quest-3-redacted';
    args.action = 'trigger_haptic';
    args.deviceKind = 'headset';
    args.intent = 'Preview a bounded headset haptic pulse without touching hardware.';
    args.output = path.join('.tmp', 'holoshell', 'self-test', 'physical-actuation-plan-latest.json');
    args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'physical-actuation-plan-latest.js');
  }

  return args;
}

function printHelp() {
  console.log(`HoloShell physical actuation plan

Usage:
  node scripts/holoshell-physical-actuation-plan.mjs --actor-id quest-3-redacted --action trigger_haptic --json

This bridge only creates a deterministic plan receipt. It does not execute
hardware commands, open native device sessions, or mutate physical state.`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, resolveRepoPath(filePath)).replace(/\\/g, '/');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function writeText(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolved);
  return resolved;
}

function buildPlan(args) {
  const now = new Date().toISOString();
  const expectedDelta = {
    action: args.action,
    actorId: args.actorId,
    deviceKind: args.deviceKind,
    physicalMutationPerformed: false,
    nativeCommandIssued: false,
  };
  const simulation = {
    id: `actuation-sim-${Date.now().toString(36)}`,
    schemaVersion: 'hololand.holoshell.physical-actuation.v0.1.0',
    workflow: 'physical-actuation-safety',
    action: args.action,
    actorId: args.actorId,
    simulatedAt: now,
    status: 'passed',
    deterministicPreview: true,
    expectedDeltaHash: sha256(stableStringify(expectedDelta)),
    safeRangeNames: ['no-native-command', 'execution-disabled', 'approval-required'],
    humanVisibleSummary: `Previewed ${args.action} for ${args.deviceKind}; no hardware command was issued.`,
    hashAlgorithm: 'sha256',
  };
  simulation.hash = sha256(stableStringify(simulation));

  const freshness = {
    id: `actuation-fresh-${Date.now().toString(36)}`,
    schemaVersion: 'hololand.holoshell.physical-actuation.v0.1.0',
    workflow: 'physical-actuation-safety',
    actorId: args.actorId,
    checkedAt: now,
    sensorFresh: true,
    approvalFresh: false,
    adapterHealthy: true,
    maxSensorAgeMs: 1000,
    observedSensorAgeMs: 0,
    ownerLaneFresh: false,
    staleReason: 'No native fresh user approval was supplied to this bridge-only adapter.',
    hashAlgorithm: 'sha256',
  };
  freshness.hash = sha256(stableStringify(freshness));

  const safeStop = {
    id: `actuation-stop-${Date.now().toString(36)}`,
    schemaVersion: 'hololand.holoshell.physical-actuation.v0.1.0',
    workflow: 'physical-actuation-safety',
    actorId: args.actorId,
    status: 'armed',
    armedAt: now,
    stopAvailable: true,
    ownerHandoffRequired: true,
    stopInstruction: 'Because no physical command is issued, safe stop is represented as keeping execution disabled.',
    hashAlgorithm: 'sha256',
  };
  safeStop.hash = sha256(stableStringify(safeStop));

  const rollbackLimit = {
    id: `actuation-rollback-${Date.now().toString(36)}`,
    schemaVersion: 'hololand.holoshell.physical-actuation.v0.1.0',
    workflow: 'physical-actuation-safety',
    actorId: args.actorId,
    rollbackClass: 'physical_limited',
    softwareReplayAvailable: true,
    physicalUndoGuaranteed: false,
    rollbackNote: 'The plan can be replayed exactly; a future real physical action cannot promise full undo.',
    hashAlgorithm: 'sha256',
  };
  rollbackLimit.hash = sha256(stableStringify(rollbackLimit));

  const receiptPack = {
    id: `physical-actuation-pack-${Date.now().toString(36)}`,
    schemaVersion: 'hololand.holoshell.physical-actuation.v0.1.0',
    workflow: 'physical-actuation-safety',
    status: 'blocked',
    actorId: args.actorId,
    action: args.action,
    simulation,
    freshness,
    safeStop,
    rollbackLimit,
    taskFiled: false,
    humanVisibleSummary: 'Execution remains blocked until a fresh native approval and owner lane are present.',
    hashAlgorithm: 'sha256',
  };
  receiptPack.hash = sha256(stableStringify(receiptPack));

  const plan = {
    schemaVersion: 'hololand.holoshell.physical-actuation-plan.v0.1.0',
    createdAt: now,
    sourceAnchors: SOURCE_ANCHORS,
    request: {
      actorId: args.actorId,
      action: args.action,
      deviceKind: args.deviceKind,
      intent: args.intent,
    },
    execution: {
      executionAllowed: false,
      mutationExecuted: false,
      nativeCommandIssued: false,
      blockedReason: 'fresh native approval is absent; bridge-only adapter never mutates hardware',
    },
    receiptPack,
    output: {
      latestPath: repoRelative(args.output),
      latestJsPath: repoRelative(args.jsOutput),
    },
    hashAlgorithm: 'sha256',
  };
  plan.hash = sha256(stableStringify(plan));
  return plan;
}

function assertSelfTest(plan) {
  const missingAnchor = SOURCE_ANCHORS.find((anchor) => !plan.sourceAnchors.includes(anchor));
  if (missingAnchor) throw new Error(`missing source anchor: ${missingAnchor}`);
  if (plan.execution.executionAllowed !== false) throw new Error('execution must remain blocked');
  if (plan.execution.mutationExecuted !== false) throw new Error('mutation must not execute');
  if (plan.execution.nativeCommandIssued !== false) throw new Error('native command must not issue');
  if (plan.receiptPack.simulation.deterministicPreview !== true) throw new Error('simulation preview must be deterministic');
  if (plan.receiptPack.freshness.approvalFresh !== false) throw new Error('approval must be stale without user gesture');
  if (plan.receiptPack.rollbackLimit.physicalUndoGuaranteed !== false) {
    throw new Error('physical undo must not be guaranteed');
  }
}

const args = parseArgs();
const plan = buildPlan(args);
if (args.selfTest) assertSelfTest(plan);

writeText(args.output, `${JSON.stringify(plan, null, 2)}\n`);
writeText(args.jsOutput, `window.HOLOSHELL_PHYSICAL_ACTUATION_PLAN = ${JSON.stringify(plan, null, 2)};\n`);

if (args.json) {
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.log(`physical actuation plan written: ${repoRelative(args.output)}`);
}
