#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PHASE0B_SOURCE_PATHS,
  createRuntimeInjectedValidatorFixture,
  runPhase0BEngineeringTracer,
} from './model-village-phase0b-runtime.mjs';
import {
  MODEL_VILLAGE_CANONICAL_LIFECYCLE_SOURCES,
  runCanonicalModelVillageLifecycle,
} from './model-village-canonical-lifecycle.mjs';
import {
  PROVIDER_FENCE_CHILD_DIR_ENV,
  PROVIDER_FENCE_CHILD_WINDOW_ENV,
  installProviderCallFence,
  snapshotProviderFence,
  summarizeProviderCallFence,
  unmeasuredProviderCallObservation,
  verifyProviderCallObservation,
} from './model-village-provider-call-fence.mjs';

// ---------------------------------------------------------------------------
// PROVIDER-CALL MEASUREMENT — this checker's OUT-OF-BAND second counter.
//
// The Phase 0B tracer and the canonical-lifecycle lane each install their own
// counting fence and publish their own counters. This checker installs a fence
// FIRST, so those inner fences delegate through it. Two consequences, both
// load-bearing:
//
//  (1) a provider call made through a reference to fetch captured BEFORE the
//      inner fence was installed — the exact case those modules name as out of
//      their own scope — bypasses the inner fence entirely and lands here,
//      where it is counted and refused; and
//  (2) the nesting FLOOR must hold: every non-provider call the inner fence
//      delegated had to pass through this one, so the outer delta can never be
//      smaller than (inner total - inner provider calls).
//
// Exact nesting EQUALITY is deliberately NOT asserted, and the reason is stated
// rather than buried: the tracer's published window closes when its receipt is
// sealed, but its fence stays up through its own self-verification, which
// re-executes the source runs. The outer delta therefore legitimately exceeds
// the inner published total. What is asserted is the floor plus an independent
// zero — the outer count of provider calls, which no inner counter can affect.
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 'hololand.model-village-experiment.v0.7.0';
const WORLD_SOURCE = 'source/layers/vr/frontier/model-village/model-village.holo';
const OBSERVER_PROJECTION_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-observer-projection.holo';
const POLICY_SOURCE = 'source/domains/agents/model-village-experiment.hsplus';
const KERNEL_SOURCE = 'source/proofs/model-village-trial-kernel.hs';
const SPEC_SOURCE = 'docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md';
const PACKAGE_JSON = 'package.json';
const DEFAULT_OUTPUT = path.join('.tmp', 'hololand', 'model-village', 'receipt.json');
const CHECKER_PATH = fileURLToPath(import.meta.url);
const EXPECTED_WORLD_OBJECT_IDS = [
  'ResidentSeat01',
  'ResidentSeat02',
  'ResidentSeat03',
  'ResidentSeat04',
  'ResidentSeat05',
  'ResidentSeat06',
  'VillageCommons',
  'PublicStateBoard',
  'ReceiptLedger',
  'ObserverDeck',
  'IsolationBoundary',
  'EmergencyStop',
];
export const REQUIRED_OBSERVER_BOUNDARY_FIELDS = [
  'canonicalSceneHash',
  'canonicalPoseHash',
  'logicalClockHash',
  'publicStateHash',
  'executedScheduleHash',
  'residentObservationHash',
  'actionReceiptRoot',
];
const CANONICAL_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OBSERVER_BOUNDARY_POLICY_FIELDS = [
  'canonical_scene_hash',
  'canonical_pose_hash',
  'logical_clock_hash',
  'public_state_hash',
  'executed_schedule_hash',
  'resident_observation_hash',
  'action_receipt_root',
];
const OBSERVER_BOUNDARY_TYPES = {
  manifest: 'observer_boundary_fixture_manifest',
  publicState: 'observer_boundary_public_state_fixture',
  observation: 'observer_boundary_observation_fixture',
  actionReceipt: 'observer_boundary_action_receipt_fixture',
  scheduleEntry: 'observer_boundary_schedule_entry',
  assignmentMatrix: 'frozen_assignment_matrix',
};

const FORMAT_BY_EXTENSION = {
  '.holo': '.holo',
  '.hsplus': '.hsplus',
  '.hs': '.hs',
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    root: process.cwd(),
    output: DEFAULT_OUTPUT,
    durationMs: 200,
    tickRate: 10,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') args.root = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--duration-ms') args.durationMs = Number(argv[++index]);
    else if (arg === '--tick-rate') args.tickRate = Number(argv[++index]);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand Model Village experiment check

Usage:
  node scripts/check-hololand-model-village-experiment.mjs [options]

Options:
  --root <path>         HoloLand repository root
  --output <path>       Receipt output path
  --duration-ms <n>     Native headless materialization duration
  --tick-rate <n>       Native headless tick rate
  --json                Print the bounded receipt as JSON
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.durationMs) || args.durationMs < 1) {
    throw new Error('--duration-ms must be a positive number');
  }
  if (!Number.isFinite(args.tickRate) || args.tickRate < 1) {
    throw new Error('--tick-rate must be a positive number');
  }

  return args;
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function repoPath(root, relativePath) {
  return path.resolve(root, relativePath);
}

function read(root, relativePath) {
  return readFileSync(repoPath(root, relativePath), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function stripLineComments(value) {
  let output = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];

    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }

    if (character === '/' && next === '/') {
      while (index < value.length && value[index] !== '\n') index += 1;
      if (index < value.length) output += '\n';
      continue;
    }

    output += character;
  }

  return output;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalDigest(value) {
  return sha256(canonicalJson(value));
}

export function validateObserverBoundaryFields(fields) {
  const missingFields = REQUIRED_OBSERVER_BOUNDARY_FIELDS.filter(
    (field) => typeof fields?.[field] !== 'string',
  );
  const invalidFields = REQUIRED_OBSERVER_BOUNDARY_FIELDS.filter(
    (field) => (
      typeof fields?.[field] === 'string'
      && !CANONICAL_SHA256_PATTERN.test(fields[field])
    ),
  );
  return {
    passed: missingFields.length === 0 && invalidFields.length === 0,
    requiredFields: REQUIRED_OBSERVER_BOUNDARY_FIELDS,
    hashEncoding: 'lowercase_sha256_hex',
    missingFields,
    invalidFields,
  };
}

export function compareObserverBoundaryFields(before, after) {
  const beforeValidation = validateObserverBoundaryFields(before);
  const afterValidation = validateObserverBoundaryFields(after);
  const changedFields = REQUIRED_OBSERVER_BOUNDARY_FIELDS.filter(
    (field) => before?.[field] !== after?.[field],
  );
  return {
    passed:
      beforeValidation.passed
      && afterValidation.passed
      && changedFields.length === 0,
    requiredFields: REQUIRED_OBSERVER_BOUNDARY_FIELDS,
    hashEncoding: 'lowercase_sha256_hex',
    missingBefore: beforeValidation.missingFields,
    missingAfter: afterValidation.missingFields,
    invalidBefore: beforeValidation.invalidFields,
    invalidAfter: afterValidation.invalidFields,
    changedFields,
  };
}

function unsignedReceipt(value) {
  const unsigned = { ...(value || {}) };
  delete unsigned.receipt;
  return unsigned;
}

export function verifyObserverBoundaryFixtureReceipt(fixture) {
  return Boolean(
    fixture?.receipt?.receiptHash
    && CANONICAL_SHA256_PATTERN.test(fixture.receipt.receiptHash)
    && fixture.receipt.receiptHash === canonicalDigest(unsignedReceipt(fixture)),
  );
}

export function verifyModelVillageReceiptHash(receipt) {
  return Boolean(
    receipt?.receipt?.receiptHash
    && CANONICAL_SHA256_PATTERN.test(receipt.receipt.receiptHash)
    && receipt.receipt.receiptHash === canonicalDigest(unsignedReceipt(receipt)),
  );
}

function includesAll(text, snippets) {
  return snippets.every((snippet) => text.includes(snippet));
}

function uniqueMatches(text, pattern, group = 1) {
  return [...new Set(
    [...text.matchAll(pattern)]
      .map((match) => match[group])
      .filter(Boolean),
  )];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractStringArray(text, key) {
  const pattern = new RegExp(`${escapeRegExp(key)}\\s*:\\s*\\[([\\s\\S]*?)\\]`);
  const match = text.match(pattern);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function extractNumber(text, key) {
  const match = text.match(new RegExp(`${escapeRegExp(key)}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : null;
}

function extractBoolean(text, key) {
  const match = text.match(new RegExp(`${escapeRegExp(key)}\\s*:\\s*(true|false)`));
  return match ? match[1] === 'true' : null;
}

function extractString(text, key) {
  const match = text.match(new RegExp(`${escapeRegExp(key)}\\s*:\\s*"([^"]+)"`));
  return match ? match[1] : null;
}

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 120000,
    env: options.env ?? process.env,
  });
}

const CHILD_FENCE_PRELOAD = pathToFileURL(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'model-village-provider-call-fence-child.mjs',
  ),
).href;

/**
 * Runs a child process WITH the provider-call fence installed inside it, and
 * returns the child's own observation alongside the spawn result.
 *
 * THE HOLE THIS CLOSES: the in-process fence covers this process's
 * `globalThis.fetch`. The HoloScript CLI runs in a child, with its own globals —
 * so the component on this lane that would actually reach a provider was the one
 * component no fence was watching, and the lane's zero was a statement about the
 * parent only.
 *
 * `--import` is passed through NODE_OPTIONS rather than argv so that it is
 * inherited by anything the CLI itself spawns; each process writes its own file,
 * so a grandchild cannot overwrite its parent's observation. A child that leaves
 * NO file is UNMEASURED, not clean — see the caller-side reconciliation.
 */
function commandResultUnderChildProviderFence(command, args, options = {}) {
  const label = options.window ?? 'child-process';
  const observationDir = path.join(
    options.cwd ?? process.cwd(),
    '.tmp',
    'hololand',
    'model-village',
    'provider-fence-children',
    `${process.pid}-${randomUUID()}`,
  );
  mkdirSync(observationDir, { recursive: true });
  const existingNodeOptions = process.env.NODE_OPTIONS
    ? `${process.env.NODE_OPTIONS} `
    : '';
  const result = commandResult(command, args, {
    ...options,
    env: {
      ...process.env,
      [PROVIDER_FENCE_CHILD_DIR_ENV]: observationDir,
      [PROVIDER_FENCE_CHILD_WINDOW_ENV]: label,
      NODE_OPTIONS: `${existingNodeOptions}--import="${CHILD_FENCE_PRELOAD}"`,
    },
  });
  let observations = [];
  try {
    observations = readdirSync(observationDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => {
        try {
          return JSON.parse(
            readFileSync(path.join(observationDir, entry), 'utf8'),
          );
        } catch (error) {
          return unmeasuredProviderCallObservation(
            label,
            `the child process wrote an unreadable provider-call observation: `
            + `${error?.message || String(error)}`,
          );
        }
      });
  } catch (error) {
    observations = [
      unmeasuredProviderCallObservation(
        label,
        `the child provider-call observation directory could not be read: `
        + `${error?.message || String(error)}`,
      ),
    ];
  }
  if (observations.length === 0) {
    // ABSENT EVIDENCE BLOCKS: no file means the fence never ran in the child.
    // Reporting 0 here would recreate the exact defect this lane is closing.
    observations = [
      unmeasuredProviderCallObservation(
        label,
        'the child process produced no provider-call observation at all, so its '
        + 'window was never watched',
      ),
    ];
  }
  rmSync(observationDir, { force: true, recursive: true });
  return { observations, result };
}

function tail(value, count = 8) {
  return String(value || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-count);
}

function findHoloScriptCli(root) {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(root, '..', 'HoloScript'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const cli = path.join(candidate, 'packages', 'cli', 'dist', 'cli.js');
    if (existsSync(cli)) {
      return {
        root: candidate,
        cli,
        cliSha256: sha256(readFileSync(cli)),
        version: (() => {
          try {
            return JSON.parse(readFileSync(path.join(candidate, 'package.json'), 'utf8')).version ?? null;
          } catch {
            return null;
          }
        })(),
      };
    }
  }

  return null;
}

async function loadHoloScriptCore(holoScript) {
  const corePath = path.join(holoScript.root, 'packages', 'core', 'dist', 'index.js');
  if (!existsSync(corePath)) {
    throw new Error(`Built HoloScript core not found: ${corePath}`);
  }
  const core = await import(pathToFileURL(corePath).href);
  if (
    typeof core.HoloScriptCodeParser !== 'function'
    || typeof core.HoloScriptPlusParser !== 'function'
  ) {
    throw new Error(
      'Built HoloScript core does not expose HoloScriptCodeParser and HoloScriptPlusParser',
    );
  }
  return {
    core,
    corePath,
    coreSha256: sha256(readFileSync(corePath)),
  };
}

export function validateHeadlessReceipt(receipt) {
  const errors = [];
  if (receipt?.schema !== 'holoscript-headless-run-receipt-v1') {
    errors.push('unexpected headless receipt schema');
  }
  if (normalizePath(receipt?.input || '') !== WORLD_SOURCE) {
    errors.push('headless receipt input does not identify the Model Village world');
  }
  if (receipt?.scene?.schema !== 'holoscript-headless-scene-receipt-v1') {
    errors.push('missing native scene receipt');
  }
  if (receipt?.posePhysics?.schema !== 'holoscript-headless-pose-physics-receipt-v1') {
    errors.push('missing native pose/physics receipt');
  }

  const sceneObjects = Array.isArray(receipt?.scene?.objects) ? receipt.scene.objects : [];
  const poseBodies = Array.isArray(receipt?.posePhysics?.bodies) ? receipt.posePhysics.bodies : [];
  const sceneIds = sceneObjects.map((object) => object?.id).filter(Boolean);
  const poseIds = poseBodies.map((body) => body?.id).filter(Boolean);
  const expectedIds = [...EXPECTED_WORLD_OBJECT_IDS].sort();
  const sortedSceneIds = [...sceneIds].sort();
  const sortedPoseIds = [...poseIds].sort();

  if (sceneObjects.length !== EXPECTED_WORLD_OBJECT_IDS.length) {
    errors.push(`scene array must contain exactly ${EXPECTED_WORLD_OBJECT_IDS.length} objects`);
  }
  if (poseBodies.length !== EXPECTED_WORLD_OBJECT_IDS.length) {
    errors.push(`pose/physics array must contain exactly ${EXPECTED_WORLD_OBJECT_IDS.length} bodies`);
  }
  if (new Set(sceneIds).size !== sceneIds.length) {
    errors.push('scene object IDs must be unique');
  }
  if (new Set(poseIds).size !== poseIds.length) {
    errors.push('pose/physics body IDs must be unique');
  }
  if (JSON.stringify(sortedSceneIds) !== JSON.stringify(expectedIds)) {
    errors.push('scene object IDs must exactly match the Model Village contract');
  }
  if (JSON.stringify(sortedPoseIds) !== JSON.stringify(expectedIds)) {
    errors.push('pose/physics body IDs must exactly match the Model Village contract');
  }
  if (JSON.stringify(sortedSceneIds) !== JSON.stringify(sortedPoseIds)) {
    errors.push('scene and pose/physics ID sets differ');
  }
  if (receipt?.scene?.objectCount !== sceneObjects.length) {
    errors.push(`expected ${EXPECTED_WORLD_OBJECT_IDS.length} scene objects`);
  }
  if (receipt?.posePhysics?.objectCount !== poseBodies.length) {
    errors.push(`expected ${EXPECTED_WORLD_OBJECT_IDS.length} pose/physics bodies`);
  }
  for (const objectId of EXPECTED_WORLD_OBJECT_IDS) {
    if (!sceneIds.includes(objectId)) errors.push(`scene missing ${objectId}`);
    if (!poseIds.includes(objectId)) errors.push(`pose/physics missing ${objectId}`);
  }

  return {
    passed: errors.length === 0,
    errors,
    sceneIds,
    poseIds,
  };
}

function parseSource(root, cli, relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const { observations, result } = commandResultUnderChildProviderFence(
    process.execPath,
    [cli, 'parse', normalizePath(relativePath)],
    { cwd: root, window: `holoscript-cli-parse:${normalizePath(relativePath)}` },
  );

  return {
    source: relativePath,
    format: FORMAT_BY_EXTENSION[extension] || extension,
    passed: result.status === 0,
    kind: 'holoscript_cli_parse',
    providerFences: observations,
    status: result.status,
    stdoutTail: result.status === 0 ? [] : tail(result.stdout, 4),
    stderrTail: tail(result.stderr || result.error?.message, 8),
  };
}

function parseJsonOutput(value) {
  const text = String(value || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('HoloScript headless output did not contain a JSON object');
  }
  return JSON.parse(text.slice(start, end + 1));
}

function runHeadless(root, cli, options) {
  // THE lane's real execution path — the HoloScript CLI actually running the
  // world — and until this call was fenced it was the one process on the lane
  // that nothing was measuring.
  const { observations, result } = commandResultUnderChildProviderFence(
    process.execPath,
    [
      cli,
      'headless',
      normalizePath(WORLD_SOURCE),
      '--duration',
      String(options.durationMs),
      '--tick-rate',
      String(options.tickRate),
      '--json',
    ],
    { cwd: root, window: 'holoscript-cli-headless' },
  );

  if (result.status !== 0) {
    return {
      passed: false,
      providerFences: observations,
      status: result.status,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr || result.error?.message),
      receipt: null,
    };
  }

  try {
    const receipt = parseJsonOutput(result.stdout);
    const validation = validateHeadlessReceipt(receipt);
    return {
      passed: validation.passed,
      providerFences: observations,
      status: result.status,
      stdoutTail: [],
      stderrTail: validation.errors,
      receipt,
      validation,
    };
  } catch (error) {
    return {
      passed: false,
      providerFences: observations,
      status: result.status,
      stdoutTail: tail(result.stdout),
      stderrTail: [error.message],
      receipt: null,
    };
  }
}

function canonicalHeadlessProjection(run) {
  if (!run?.passed || !run.receipt) return null;
  return canonicalize({
    scene: run.receipt.scene,
    posePhysics: run.receipt.posePhysics,
  });
}

function requireExactProperties(properties, expectedKeys, label) {
  const observed = Object.keys(properties || {}).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(observed) !== canonicalJson(expected)) {
    const missing = expected.filter((key) => !observed.includes(key));
    const unexpected = observed.filter((key) => !expected.includes(key));
    throw new Error(
      `${label} fields differ; missing=${canonicalJson(missing)} unexpected=${canonicalJson(unexpected)}`,
    );
  }
}

function requireUniqueOrderedIds(order, expectedCount, label) {
  if (!Array.isArray(order) || order.length !== expectedCount) {
    throw new Error(`${label} must contain exactly ${expectedCount} IDs`);
  }
  if (new Set(order).size !== order.length) {
    throw new Error(`${label} must contain unique IDs`);
  }
}

function indexFixtureNodes(nodes, type, idField) {
  const matching = nodes.filter((node) => node.properties?.type === type);
  const index = new Map();
  for (const node of matching) {
    const id = node.properties?.[idField];
    if (typeof id !== 'string' || !id) {
      throw new Error(`${type} is missing ${idField}`);
    }
    if (index.has(id)) throw new Error(`${type} duplicates ${idField}=${id}`);
    index.set(id, node.properties);
  }
  return index;
}

function orderedFixtures(order, index, label) {
  return order.map((id) => {
    const fixture = index.get(id);
    if (!fixture) throw new Error(`${label} references missing fixture ${id}`);
    return fixture;
  });
}

function publicStateProjection(fixture) {
  return {
    snapshot_id: fixture.snapshotId,
    sequence: fixture.sequence,
    logical_tick: fixture.logicalTick,
    location: fixture.location,
    public_event_ids: fixture.publicEventIds,
    public_resource: {
      id: fixture.publicResourceId,
      units: fixture.publicResourceUnits,
    },
    public_norm_ids: fixture.publicNormIds,
  };
}

function parseObserverBoundarySources(core, kernelSource, policySource) {
  const kernelResult = new core.HoloScriptCodeParser().parse(kernelSource);
  const policyResult = new core.HoloScriptPlusParser().parse(policySource);
  if (!kernelResult.success || !policyResult.success) {
    throw new Error(
      `Observer boundary sources failed structured parsing: ${canonicalJson({
        kernel: kernelResult.errors || [],
        policy: policyResult.errors || [],
      })}`,
    );
  }
  const policyComposition = policyResult.ast.children.find(
    (node) => node.type === 'composition',
  );
  const boundaryContract = (policyComposition?.children || []).find(
    (node) => node.type === 'template' && node.name === 'ObserverBoundaryFixtureReceipt',
  );
  if (!boundaryContract) {
    throw new Error('ObserverBoundaryFixtureReceipt is missing from the .hsplus policy');
  }
  return {
    kernelNodes: kernelResult.ast,
    boundaryContract: boundaryContract.properties,
    parseSummary: {
      kernel: 'HoloScriptCodeParser',
      policy: 'HoloScriptPlusParser',
    },
  };
}

function executeObserverBoundaryFixtureCore({
  kernelNodes,
  boundaryContract,
  headlessReceipt,
  providerCallObservation = null,
}) {
  if (
    !headlessReceipt
    || !headlessReceipt.scene
    || typeof headlessReceipt.scene !== 'object'
    || !headlessReceipt.posePhysics
    || typeof headlessReceipt.posePhysics !== 'object'
  ) {
    throw new Error(
      'Observer boundary fixture requires available native headless scene and posePhysics receipts',
    );
  }
  const manifestNodes = kernelNodes.filter(
    (node) => node.properties?.type === OBSERVER_BOUNDARY_TYPES.manifest,
  );
  if (manifestNodes.length !== 1) {
    throw new Error('Exactly one observer boundary fixture manifest is required');
  }
  const manifest = manifestNodes[0].properties;
  requireExactProperties(manifest, [
    'type',
    'fixtureId',
    'runId',
    'executionMode',
    'parser',
    'providerCallsAllowed',
    'nativeHsPipelineExecutionClaimed',
    'nativeHsplusActionExecutionClaimed',
    'observerProjectionMayWrite',
    'logicalClockStartTick',
    'logicalClockEndTick',
    'logicalClockStep',
    'initialPublicStateSnapshotId',
    'finalPublicStateSnapshotId',
    'initialPublicStateSequence',
    'finalPublicStateSequence',
    'scheduleOrder',
    'observationOrder',
    'actionReceiptOrder',
    'adapterPermutationOrder',
    'expectedScheduleEntryCount',
    'expectedObservationCount',
    'expectedActionReceiptCount',
    'expectedAdapterPermutationCount',
    'hashAlgorithm',
    'actionReceiptChainMode',
    'initialActionReceiptRoot',
  ], 'observer boundary manifest');
  if (
    manifest.executionMode !== 'captured_fixture_replay'
    || manifest.parser !== 'HoloScriptCodeParser'
    || manifest.providerCallsAllowed !== false
    || manifest.nativeHsPipelineExecutionClaimed !== false
    || manifest.nativeHsplusActionExecutionClaimed !== false
    || manifest.observerProjectionMayWrite !== false
    || manifest.hashAlgorithm !== 'sha256_canonical_json'
    || manifest.actionReceiptChainMode !== 'sha256_canonical_receipt_with_prior_hash'
    || !/^0{64}$/.test(manifest.initialActionReceiptRoot)
  ) {
    throw new Error('Observer boundary manifest exceeds the bounded fixture claim');
  }
  if (
    !Number.isInteger(manifest.logicalClockStartTick)
    || !Number.isInteger(manifest.logicalClockEndTick)
    || !Number.isInteger(manifest.logicalClockStep)
    || !Number.isInteger(manifest.initialPublicStateSequence)
    || !Number.isInteger(manifest.finalPublicStateSequence)
    || manifest.logicalClockStep <= 0
    || manifest.logicalClockEndTick < manifest.logicalClockStartTick
    || (manifest.logicalClockEndTick - manifest.logicalClockStartTick)
      % manifest.logicalClockStep !== 0
    || manifest.finalPublicStateSequence !== manifest.initialPublicStateSequence + 1
  ) {
    throw new Error('Observer boundary logical clock is invalid');
  }

  requireExactProperties(boundaryContract, [
    'type',
    'executionMode',
    'requiredHashFields',
    'projectionToggleMustPreserve',
    'adapterPermutationMustPreserve',
    'residentObservationForbiddenFields',
    'providerCallsAllowed',
    'nativeHsPipelineExecutionClaimed',
    'nativeHsplusActionExecutionClaimed',
    'projectionMayWriteCanonicalState',
  ], 'ObserverBoundaryFixtureReceipt');
  for (const field of [
    'requiredHashFields',
    'projectionToggleMustPreserve',
    'adapterPermutationMustPreserve',
  ]) {
    if (canonicalJson(boundaryContract[field]) !== canonicalJson(OBSERVER_BOUNDARY_POLICY_FIELDS)) {
      throw new Error(`ObserverBoundaryFixtureReceipt ${field} is incomplete or reordered`);
    }
  }
  if (
    boundaryContract.executionMode !== manifest.executionMode
    || boundaryContract.providerCallsAllowed !== false
    || boundaryContract.nativeHsPipelineExecutionClaimed !== false
    || boundaryContract.nativeHsplusActionExecutionClaimed !== false
    || boundaryContract.projectionMayWriteCanonicalState !== false
  ) {
    throw new Error('ObserverBoundaryFixtureReceipt does not preserve the fixture-only claim');
  }

  requireUniqueOrderedIds(
    manifest.scheduleOrder,
    manifest.expectedScheduleEntryCount,
    'scheduleOrder',
  );
  requireUniqueOrderedIds(
    manifest.observationOrder,
    manifest.expectedObservationCount,
    'observationOrder',
  );
  requireUniqueOrderedIds(
    manifest.actionReceiptOrder,
    manifest.expectedActionReceiptCount,
    'actionReceiptOrder',
  );
  requireUniqueOrderedIds(
    manifest.adapterPermutationOrder,
    manifest.expectedAdapterPermutationCount,
    'adapterPermutationOrder',
  );

  const publicStates = indexFixtureNodes(
    kernelNodes,
    OBSERVER_BOUNDARY_TYPES.publicState,
    'snapshotId',
  );
  const observations = indexFixtureNodes(
    kernelNodes,
    OBSERVER_BOUNDARY_TYPES.observation,
    'observationId',
  );
  const actionReceipts = indexFixtureNodes(
    kernelNodes,
    OBSERVER_BOUNDARY_TYPES.actionReceipt,
    'receiptId',
  );
  const scheduleEntries = indexFixtureNodes(
    kernelNodes,
    OBSERVER_BOUNDARY_TYPES.scheduleEntry,
    'scheduleEntryId',
  );
  const orderedObservations = orderedFixtures(
    manifest.observationOrder,
    observations,
    'observationOrder',
  );
  const orderedActionFixtures = orderedFixtures(
    manifest.actionReceiptOrder,
    actionReceipts,
    'actionReceiptOrder',
  );
  const orderedSchedule = orderedFixtures(
    manifest.scheduleOrder,
    scheduleEntries,
    'scheduleOrder',
  );
  if (
    publicStates.size !== 2
    || observations.size !== manifest.expectedObservationCount
    || actionReceipts.size !== manifest.expectedActionReceiptCount
    || scheduleEntries.size !== manifest.expectedScheduleEntryCount
  ) {
    throw new Error('Observer boundary fixture contains unreferenced or missing typed nodes');
  }

  const publicStateFields = [
    'type',
    'snapshotId',
    'sequence',
    'logicalTick',
    'location',
    'publicEventIds',
    'publicResourceId',
    'publicResourceUnits',
    'publicNormIds',
  ];
  for (const [snapshotId, fixture] of publicStates) {
    requireExactProperties(fixture, publicStateFields, `public state ${snapshotId}`);
    if (
      !Number.isInteger(fixture.sequence)
      || !Number.isInteger(fixture.logicalTick)
      || !Number.isFinite(fixture.publicResourceUnits)
      || !Array.isArray(fixture.publicEventIds)
      || !Array.isArray(fixture.publicNormIds)
    ) {
      throw new Error(`Public state ${snapshotId} is malformed`);
    }
  }
  if (
    !publicStates.has(manifest.initialPublicStateSnapshotId)
    || !publicStates.has(manifest.finalPublicStateSnapshotId)
  ) {
    throw new Error('Observer boundary manifest references a missing public state');
  }
  const initialPublicState = publicStates.get(manifest.initialPublicStateSnapshotId);
  const finalPublicState = publicStates.get(manifest.finalPublicStateSnapshotId);
  if (
    manifest.initialPublicStateSnapshotId === manifest.finalPublicStateSnapshotId
    || initialPublicState.sequence !== manifest.initialPublicStateSequence
    || finalPublicState.sequence !== manifest.finalPublicStateSequence
    || initialPublicState.logicalTick !== manifest.logicalClockStartTick
    || finalPublicState.logicalTick !== manifest.logicalClockEndTick
  ) {
    throw new Error(
      'Observer boundary initial/final public-state sequence and clock do not match the manifest',
    );
  }

  const observationFields = [
    'type',
    'observationId',
    'order',
    'runId',
    'tick',
    'residentId',
    'location',
    'visibleEventIds',
    'publicStateSnapshotId',
    'boundedMemoryIds',
    'peerPrivateMemoryIncluded',
    'sealedModelIdentityIncluded',
    'observerProjectionIncluded',
  ];
  const forbiddenObservationFields = boundaryContract.residentObservationForbiddenFields || [];
  const residentIds = new Set();
  for (let index = 0; index < orderedObservations.length; index += 1) {
    const fixture = orderedObservations[index];
    requireExactProperties(
      fixture,
      observationFields,
      `observation ${fixture.observationId}`,
    );
    const publicState = publicStates.get(fixture.publicStateSnapshotId);
    if (
      fixture.order !== index + 1
      || fixture.runId !== manifest.runId
      || fixture.publicStateSnapshotId !== manifest.initialPublicStateSnapshotId
      || !publicState
      || fixture.tick !== publicState.logicalTick
      || fixture.peerPrivateMemoryIncluded !== false
      || fixture.sealedModelIdentityIncluded !== false
      || fixture.observerProjectionIncluded !== false
      || !Array.isArray(fixture.visibleEventIds)
      || !Array.isArray(fixture.boundedMemoryIds)
      || !fixture.visibleEventIds.every((eventId) => publicState.publicEventIds.includes(eventId))
      || forbiddenObservationFields.some((field) => Object.hasOwn(fixture, field))
    ) {
      throw new Error(`Observation ${fixture.observationId} violates the resident boundary`);
    }
    if (residentIds.has(fixture.residentId)) {
      throw new Error(`Resident ${fixture.residentId} has duplicate observations`);
    }
    residentIds.add(fixture.residentId);
  }
  if (residentIds.size !== 6) {
    throw new Error('Observer boundary fixture must contain six unique resident observations');
  }

  const actionReceiptFields = [
    'type',
    'receiptId',
    'sequence',
    'runId',
    'tick',
    'residentId',
    'proposal',
    'turnOpportunityId',
    'authorizationNonce',
    'authorizationSequence',
    'safetyReceiptId',
    'actionDecisionReceiptId',
    'admissionDecision',
    'action',
    'target',
    'outcome',
    'rejectionReason',
    'preStateSnapshotId',
    'postStateSnapshotId',
    'rollbackReference',
    'playerVisibleImpact',
    'allowed',
  ];
  const uniqueActionIdentityFields = [
    'authorizationNonce',
    'turnOpportunityId',
    'safetyReceiptId',
    'actionDecisionReceiptId',
  ];
  const seenActionIdentityValues = Object.fromEntries(
    uniqueActionIdentityFields.map((field) => [field, new Set()]),
  );
  for (let index = 0; index < orderedActionFixtures.length; index += 1) {
    const fixture = orderedActionFixtures[index];
    requireExactProperties(
      fixture,
      actionReceiptFields,
      `action receipt fixture ${fixture.receiptId}`,
    );
    const preState = publicStates.get(fixture.preStateSnapshotId);
    const postState = publicStates.get(fixture.postStateSnapshotId);
    if (
      fixture.sequence !== index + 1
      || fixture.authorizationSequence !== fixture.sequence
      || fixture.runId !== manifest.runId
      || !preState
      || !postState
      || fixture.rollbackReference !== fixture.preStateSnapshotId
      || fixture.tick !== postState.logicalTick
      || preState.logicalTick > fixture.tick
      || !['allow', 'deny'].includes(fixture.admissionDecision)
      || fixture.allowed !== (fixture.admissionDecision === 'allow')
      || (fixture.allowed && fixture.rejectionReason !== '')
      || (!fixture.allowed && !fixture.rejectionReason)
      || (fixture.allowed && (
        fixture.postStateSnapshotId === fixture.preStateSnapshotId
        || postState.sequence !== preState.sequence + 1
        || fixture.playerVisibleImpact !== true
        || !fixture.outcome
        || fixture.outcome === 'blocked_without_world_mutation'
      ))
      || (!fixture.allowed && (
        fixture.postStateSnapshotId !== fixture.preStateSnapshotId
        || postState.sequence !== preState.sequence
        || fixture.playerVisibleImpact !== false
        || fixture.outcome !== 'blocked_without_world_mutation'
      ))
    ) {
      throw new Error(`Action receipt fixture ${fixture.receiptId} is malformed`);
    }
    for (const field of uniqueActionIdentityFields) {
      if (
        typeof fixture[field] !== 'string'
        || !fixture[field]
        || seenActionIdentityValues[field].has(fixture[field])
      ) {
        throw new Error(
          `Action receipt fixture ${fixture.receiptId} duplicates or omits ${field}`,
        );
      }
      seenActionIdentityValues[field].add(fixture[field]);
    }
  }

  const scheduleFields = [
    'type',
    'scheduleEntryId',
    'order',
    'tick',
    'phase',
    'operation',
    'targetIds',
    'barrierId',
  ];
  const phaseByOperation = {
    project_resident_observations: 'observation_barrier',
    seal_action_receipt: 'action_admission',
  };
  let previousScheduleTick = null;
  for (let index = 0; index < orderedSchedule.length; index += 1) {
    const fixture = orderedSchedule[index];
    requireExactProperties(
      fixture,
      scheduleFields,
      `schedule entry ${fixture.scheduleEntryId}`,
    );
    if (
      fixture.order !== index + 1
      || !Number.isInteger(fixture.tick)
      || fixture.tick < manifest.logicalClockStartTick
      || fixture.tick > manifest.logicalClockEndTick
      || (fixture.tick - manifest.logicalClockStartTick) % manifest.logicalClockStep !== 0
      || (previousScheduleTick !== null && fixture.tick < previousScheduleTick)
      || !Array.isArray(fixture.targetIds)
      || fixture.targetIds.length === 0
      || !['project_resident_observations', 'seal_action_receipt'].includes(fixture.operation)
      || fixture.phase !== phaseByOperation[fixture.operation]
    ) {
      throw new Error(`Schedule entry ${fixture.scheduleEntryId} is malformed`);
    }
    previousScheduleTick = fixture.tick;
  }

  const assignmentNodes = kernelNodes.filter(
    (node) => node.properties?.type === OBSERVER_BOUNDARY_TYPES.assignmentMatrix,
  );
  if (assignmentNodes.length !== 1) {
    throw new Error('Exactly one frozen assignment matrix is required');
  }
  const assignmentMatrix = assignmentNodes[0].properties;
  const adapterAssignments = manifest.adapterPermutationOrder.map((permutationId) => {
    const assignment = assignmentMatrix[permutationId];
    if (
      !Array.isArray(assignment)
      || assignment.length !== 6
      || !['adapter_a', 'adapter_b', 'adapter_c'].every(
        (adapter) => assignment.filter((entry) => entry === adapter).length === 2,
      )
    ) {
      throw new Error(`Adapter permutation ${permutationId} is not a balanced six-seat assignment`);
    }
    return {
      permutationId,
      assignmentHash: canonicalDigest(assignment),
      assignment,
    };
  });
  if (
    new Set(adapterAssignments.map((entry) => canonicalJson(entry.assignment))).size
      !== adapterAssignments.length
  ) {
    throw new Error('Adapter permutations must contain distinct assignment vectors');
  }
  for (let seatIndex = 0; seatIndex < 6; seatIndex += 1) {
    const seatAdapters = adapterAssignments.map((entry) => entry.assignment[seatIndex]);
    if (
      new Set(seatAdapters).size !== 3
      || !['adapter_a', 'adapter_b', 'adapter_c'].every(
        (adapter) => seatAdapters.includes(adapter),
      )
    ) {
      throw new Error(
        `Adapter permutations do not counterbalance seat ${seatIndex + 1}`,
      );
    }
  }

  const publicStateProjections = new Map(
    [...publicStates.entries()].map(([id, fixture]) => [id, publicStateProjection(fixture)]),
  );
  const publicStateHashes = new Map(
    [...publicStateProjections.entries()].map(([id, projection]) => [
      id,
      canonicalDigest(projection),
    ]),
  );
  const computedObservations = new Map();
  const computedActionReceipts = new Map();
  const executedSchedule = [];
  const executedTicks = new Set();
  const seenObservationIds = new Set();
  const seenReceiptIds = new Set();
  let currentPublicStateId = manifest.initialPublicStateSnapshotId;
  let actionReceiptRoot = manifest.initialActionReceiptRoot;

  for (const entry of orderedSchedule) {
    executedTicks.add(entry.tick);
    const outcomeHashes = [];
    if (entry.operation === 'project_resident_observations') {
      if (canonicalJson(entry.targetIds) !== canonicalJson(manifest.observationOrder)) {
        throw new Error('Observation barrier must project the complete ordered resident set');
      }
      for (const observationId of entry.targetIds) {
        if (seenObservationIds.has(observationId)) {
          throw new Error(`Observation ${observationId} was projected more than once`);
        }
        const fixture = observations.get(observationId);
        if (
          !fixture
          || fixture.tick !== entry.tick
          || fixture.publicStateSnapshotId !== currentPublicStateId
        ) {
          throw new Error(`Schedule cannot project observation ${observationId}`);
        }
        const envelope = {
          run_id: fixture.runId,
          tick: fixture.tick,
          resident_id: fixture.residentId,
          location: fixture.location,
          visible_event_ids: fixture.visibleEventIds,
          public_state_hash: publicStateHashes.get(fixture.publicStateSnapshotId),
          bounded_memory_hash: canonicalDigest(fixture.boundedMemoryIds),
        };
        const computed = {
          ...envelope,
          observation_hash: canonicalDigest(envelope),
        };
        computedObservations.set(observationId, computed);
        seenObservationIds.add(observationId);
        outcomeHashes.push(computed.observation_hash);
      }
    } else if (entry.operation === 'seal_action_receipt') {
      if (entry.targetIds.length !== 1) {
        throw new Error('Each action-admission schedule entry must seal exactly one receipt');
      }
      const receiptId = entry.targetIds[0];
      const fixture = actionReceipts.get(receiptId);
      if (
        !fixture
        || fixture.tick !== entry.tick
        || fixture.preStateSnapshotId !== currentPublicStateId
        || seenReceiptIds.has(receiptId)
      ) {
        throw new Error(`Schedule cannot seal action receipt ${receiptId}`);
      }
      const receipt = {
        receipt_id: fixture.receiptId,
        run_id: fixture.runId,
        tick: fixture.tick,
        resident_id: fixture.residentId,
        proposal: fixture.proposal,
        proposal_hash: sha256(fixture.proposal),
        turn_opportunity_id: fixture.turnOpportunityId,
        authorization_nonce: fixture.authorizationNonce,
        authorization_sequence: fixture.authorizationSequence,
        safety_receipt_id: fixture.safetyReceiptId,
        action_decision_receipt_id: fixture.actionDecisionReceiptId,
        admission_decision: fixture.admissionDecision,
        action: fixture.action,
        target: fixture.target,
        outcome: fixture.outcome,
        rejection_reason: fixture.rejectionReason,
        pre_state_hash: publicStateHashes.get(fixture.preStateSnapshotId),
        post_state_hash: publicStateHashes.get(fixture.postStateSnapshotId),
        rollback_reference: fixture.rollbackReference,
        player_visible_impact: fixture.playerVisibleImpact,
        prior_receipt_hash: actionReceiptRoot,
        allowed: fixture.allowed,
      };
      const receiptHash = canonicalDigest(receipt);
      computedActionReceipts.set(receiptId, { ...receipt, receipt_hash: receiptHash });
      seenReceiptIds.add(receiptId);
      actionReceiptRoot = receiptHash;
      currentPublicStateId = fixture.postStateSnapshotId;
      outcomeHashes.push(receiptHash);
    }
    executedSchedule.push({
      schedule_entry_id: entry.scheduleEntryId,
      order: entry.order,
      tick: entry.tick,
      phase: entry.phase,
      operation: entry.operation,
      target_ids: entry.targetIds,
      barrier_id: entry.barrierId,
      outcome_hashes: outcomeHashes,
    });
  }

  if (
    seenObservationIds.size !== manifest.expectedObservationCount
    || seenReceiptIds.size !== manifest.expectedActionReceiptCount
    || currentPublicStateId !== manifest.finalPublicStateSnapshotId
  ) {
    throw new Error('Observer boundary fixture execution did not reach its sealed final state');
  }
  const logicalClock = {
    start_tick: manifest.logicalClockStartTick,
    end_tick: manifest.logicalClockEndTick,
    step: manifest.logicalClockStep,
    executed_ticks: [...executedTicks].sort((a, b) => a - b),
  };
  const expectedExecutedTicks = [];
  for (
    let tick = manifest.logicalClockStartTick;
    tick <= manifest.logicalClockEndTick;
    tick += manifest.logicalClockStep
  ) {
    expectedExecutedTicks.push(tick);
  }
  if (
    canonicalJson(logicalClock.executed_ticks) !== canonicalJson(expectedExecutedTicks)
    || finalPublicState.logicalTick !== logicalClock.end_tick
    || finalPublicState.sequence !== manifest.finalPublicStateSequence
  ) {
    throw new Error(
      'Observer boundary executed clock coverage and final public state do not align',
    );
  }
  const residentObservationEnvelopes = manifest.observationOrder.map(
    (id) => computedObservations.get(id),
  );
  const orderedComputedActionReceipts = manifest.actionReceiptOrder.map(
    (id) => computedActionReceipts.get(id),
  );
  const canonicalFields = {
    canonicalSceneHash: canonicalDigest(headlessReceipt.scene),
    canonicalPoseHash: canonicalDigest(headlessReceipt.posePhysics),
    logicalClockHash: canonicalDigest(logicalClock),
    publicStateHash: publicStateHashes.get(manifest.finalPublicStateSnapshotId),
    executedScheduleHash: canonicalDigest(executedSchedule),
    residentObservationHash: canonicalDigest(residentObservationEnvelopes),
    actionReceiptRoot,
  };
  const fieldValidation = validateObserverBoundaryFields(canonicalFields);
  if (!fieldValidation.passed) {
    throw new Error(`Observer boundary fields are invalid: ${canonicalJson(fieldValidation)}`);
  }
  const adapterAssignmentExclusion = {
    status: 'pass',
    method: 'static_pre_inference_schema_and_dependency_exclusion',
    assignmentHashes: adapterAssignments.map((assignmentEntry) => {
      const entry = { ...assignmentEntry };
      delete entry.assignment;
      return entry;
    }),
    forbiddenResidentObservationFields: boundaryContract.residentObservationForbiddenFields,
    residentObservationExactSchemaEnforced: true,
    assignmentEntersCanonicalProjection: false,
    postInferenceOutcomeEquivalenceClaimed: false,
  };

  return {
    schema: 'hololand.model-village-observer-boundary-fixture.v1',
    status: 'pass',
    fixtureId: manifest.fixtureId,
    runId: manifest.runId,
    executionMode: manifest.executionMode,
    sourceAuthority: {
      kernel: KERNEL_SOURCE,
      policy: POLICY_SOURCE,
      parser: 'HoloScriptCodeParser',
      bridgeMayValidateAndReceipt: true,
      fixtureInputsOwnedByHoloScript: true,
      bridgeOwnsDeterministicFixtureProjection: true,
      bridgeOwnsExperimentBehavior: false,
    },
    claimBoundary: {
      capturedFixtureReplayExecuted: true,
      nativeHsPipelineExecutionClaimed: false,
      nativeHsplusActionExecutionClaimed: false,
      liveModelTurnsClaimed: false,
      // MEASURED by the caller's fence, not asserted here. `null` when this
      // fixture was executed outside a fenced window (a unit test calling it
      // directly) — which reads as UNMEASURED and FAILS the gate rather than
      // reading as a clean zero.
      providerCallsMade: providerCallObservation?.measured === true
        ? providerCallObservation.providerFetchCallsObserved
        : null,
      providerCallObservation: providerCallObservation
        ?? unmeasuredProviderCallObservation(
          'observer-boundary-fixture-replay',
          'this fixture was executed outside a fenced window',
        ),
      projectionToggleExecuted: false,
      adapterPermutationExecutionClaimed: false,
      referencedSafetyDecisionReceiptsValidated: false,
      actionReceiptRootScope: 'syntactically_chained_action_fixture_receipts_only',
    },
    canonicalFields,
    fieldValidation,
    adapterAssignmentExclusion,
    logicalClock,
    publicStateSnapshots: [...publicStateProjections.values()],
    executedSchedule,
    residentObservations: residentObservationEnvelopes,
    actionReceipts: orderedComputedActionReceipts,
  };
}

export function executeObserverBoundaryFixture({
  core,
  kernelSource,
  policySource,
  headlessReceipt,
  providerCallObservation = null,
}) {
  const parsed = parseObserverBoundarySources(core, kernelSource, policySource);
  const unsignedFixture = {
    ...executeObserverBoundaryFixtureCore({
      kernelNodes: parsed.kernelNodes,
      boundaryContract: parsed.boundaryContract,
      headlessReceipt,
      providerCallObservation,
    }),
    parseSummary: parsed.parseSummary,
  };
  return {
    ...unsignedFixture,
    receipt: {
      receiptHash: canonicalDigest(unsignedFixture),
    },
  };
}

/**
 * Folds a measured provider-call window into an already-built fixture and
 * re-seals its receipt hash. Separate from execution because the window can
 * only be closed AFTER the call returns, and a measurement taken before the
 * work it measures is not a measurement.
 */
function sealObserverBoundaryProviderObservation(fixture, observation) {
  const unsignedFixture = { ...fixture };
  delete unsignedFixture.receipt;
  unsignedFixture.claimBoundary = {
    ...unsignedFixture.claimBoundary,
    providerCallObservation: observation,
    providerCallsMade: observation?.measured === true
      ? observation.providerFetchCallsObserved
      : null,
  };
  return {
    ...unsignedFixture,
    receipt: {
      receiptHash: canonicalDigest(unsignedFixture),
    },
  };
}

function failedObserverBoundaryFixture(error) {
  const canonicalFields = Object.fromEntries(
    REQUIRED_OBSERVER_BOUNDARY_FIELDS.map((field) => [field, null]),
  );
  const unsignedFixture = {
    schema: 'hololand.model-village-observer-boundary-fixture.v1',
    status: 'fail',
    error: {
      name: error?.name || 'Error',
      message: error?.message || String(error),
    },
    sourceAuthority: {
      kernel: KERNEL_SOURCE,
      policy: POLICY_SOURCE,
      parser: 'HoloScriptCodeParser',
      bridgeMayValidateAndReceipt: true,
      fixtureInputsOwnedByHoloScript: true,
      bridgeOwnsDeterministicFixtureProjection: true,
      bridgeOwnsExperimentBehavior: false,
    },
    claimBoundary: {
      capturedFixtureReplayExecuted: false,
      nativeHsPipelineExecutionClaimed: false,
      nativeHsplusActionExecutionClaimed: false,
      liveModelTurnsClaimed: false,
      // A fixture that FAILED did not measure anything; it must not publish a
      // zero. sealObserverBoundaryProviderObservation overwrites both fields
      // with the caller's real window when there is one.
      providerCallsMade: null,
      providerCallObservation: unmeasuredProviderCallObservation(
        'observer-boundary-fixture-replay',
        'the observer-boundary fixture failed before it could be measured',
      ),
      projectionToggleExecuted: false,
      adapterPermutationExecutionClaimed: false,
      referencedSafetyDecisionReceiptsValidated: false,
      actionReceiptRootScope: 'syntactically_chained_action_fixture_receipts_only',
    },
    canonicalFields,
    fieldValidation: validateObserverBoundaryFields(canonicalFields),
    adapterAssignmentExclusion: {
      status: 'not_evaluated',
      method: 'static_pre_inference_schema_and_dependency_exclusion',
      assignmentHashes: [],
      forbiddenResidentObservationFields: [],
      residentObservationExactSchemaEnforced: false,
      assignmentEntersCanonicalProjection: false,
      postInferenceOutcomeEquivalenceClaimed: false,
    },
    logicalClock: null,
    publicStateSnapshots: [],
    executedSchedule: [],
    residentObservations: [],
    actionReceipts: [],
    parseSummary: null,
  };
  return {
    ...unsignedFixture,
    receipt: {
      receiptHash: canonicalDigest(unsignedFixture),
    },
  };
}

function buildSemanticIr(texts) {
  return {
    world: {
      source: WORLD_SOURCE,
      composition: uniqueMatches(texts.worldCode, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.worldCode, /template\s+"([^"]+)"/g),
      objects: uniqueMatches(texts.worldCode, /object\s+"([^"]+)"/g),
      groups: uniqueMatches(texts.worldCode, /spatial_group\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.worldCode, /^\s*action\s+([A-Za-z0-9_]+)/gm),
      emits: uniqueMatches(texts.worldCode, /emit\("([^"]+)"/g),
      sourceHash: sha256(normalizeSource(texts.world)),
    },
    observerProjection: {
      source: OBSERVER_PROJECTION_SOURCE,
      composition:
        uniqueMatches(
          texts.observerProjectionCode,
          /composition\s+"([^"]+)"/g,
        )[0] || '',
      actions: uniqueMatches(
        texts.observerProjectionCode,
        /^\s*action\s+([A-Za-z0-9_]+)/gm,
      ),
      emits: uniqueMatches(texts.observerProjectionCode, /emit\("([^"]+)"/g),
      sourceHash: sha256(normalizeSource(texts.observerProjection)),
    },
    policy: {
      source: POLICY_SOURCE,
      composition: uniqueMatches(texts.policyCode, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.policyCode, /template\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.policyCode, /policy\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.policyCode, /^\s*action\s+([A-Za-z0-9_]+)/gm),
      emits: uniqueMatches(texts.policyCode, /emit\("([^"]+)"/g),
      sourceHash: sha256(normalizeSource(texts.policy)),
    },
    kernel: {
      source: KERNEL_SOURCE,
      objects: uniqueMatches(texts.kernelCode, /object\s+"([^"]+)"/g),
      sourceHash: sha256(normalizeSource(texts.kernel)),
    },
    spec: {
      source: SPEC_SOURCE,
      sourceHash: sha256(normalizeSource(texts.spec)),
    },
  };
}

function buildExperimentDesign(kernel) {
  const modelAdapters = extractStringArray(kernel, 'modelAdapters');
  const conditions = extractStringArray(kernel, 'conditions');
  const seedBlocks = extractStringArray(kernel, 'seedBlocks');
  const numericSeedBlocks = seedBlocks.length || (() => {
    const match = kernel.match(/seedBlocks\s*:\s*\[([^\]]+)\]/);
    return match ? (match[1].match(/\d+/g) || []).length : 0;
  })();

  return {
    models: modelAdapters.length,
    modelAdapters,
    residents: extractNumber(kernel, 'residentsPerVillage'),
    conditions,
    seedBlocks: numericSeedBlocks,
    plannedVillageRuns: extractNumber(kernel, 'plannedVillageRuns'),
    unitOfAnalysis: extractString(kernel, 'unitOfAnalysis'),
    primaryOutcome: extractString(kernel, 'primaryOutcome'),
    primaryContrast: extractString(kernel, 'primaryContrast'),
    estimandScope: extractString(kernel, 'estimandScope'),
    blockContrast: extractString(kernel, 'blockContrast'),
    studyClass: extractString(kernel, 'claimClass'),
  };
}

/**
 * Reconciles every provider-call observation on this lane against every other
 * one. This is the out-of-band half: none of these rules can be satisfied by a
 * module agreeing with itself, because each compares a counter produced by one
 * fence against a counter produced by a different fence, or against an incident
 * log the same fence wrote independently of the counter.
 */
function buildProviderCallEvidence({
  checkerObservation,
  childProcessObservations,
  engineeringTracer,
  canonicalLifecycle,
  observerBoundaryFixture,
  tracerOuterObservation,
  lifecycleOuterObservation,
}) {
  const failures = [
    ...verifyProviderCallObservation(checkerObservation, {
      label: 'checker outer fence',
    }),
    ...verifyProviderCallObservation(tracerOuterObservation, {
      label: 'checker outer fence over the Phase 0B tracer',
    }),
    ...verifyProviderCallObservation(lifecycleOuterObservation, {
      label: 'checker outer fence over the canonical lifecycle',
    }),
    ...verifyProviderCallObservation(engineeringTracer?.runtime?.providerFence, {
      label: 'Phase 0B tracer inner fence',
    }),
    ...verifyProviderCallObservation(engineeringTracer?.replay?.providerFence, {
      label: 'Phase 0B fresh-replay window',
    }),
    ...verifyProviderCallObservation(canonicalLifecycle?.providerFence, {
      label: 'canonical lifecycle inner fence',
    }),
    ...verifyProviderCallObservation(
      observerBoundaryFixture?.claimBoundary?.providerCallObservation,
      { label: 'observer-boundary fixture window' },
    ),
  ];

  // CHILD PROCESSES. Each child on this lane installed the SAME fence inside
  // itself and published its own window; the parent's fence structurally cannot
  // see any of them. A child that produced no observation arrives here as an
  // UNMEASURED record and fails below — it is never absent and never a zero.
  const childProcesses = Array.isArray(childProcessObservations)
    ? childProcessObservations
    : [];
  if (childProcesses.length === 0) {
    failures.push(
      'no child-process provider-call observations were collected, but this '
      + 'checker spawns the HoloScript CLI on its executed path; an unmeasured '
      + 'child cannot be reported as a clean lane',
    );
  }
  for (const observation of childProcesses) {
    failures.push(
      ...verifyProviderCallObservation(observation, {
        label: `child process ${observation?.window ?? '(unnamed window)'}`,
      }),
    );
  }

  // NESTING FLOOR. Every non-provider call an inner fence delegated had to pass
  // through the outer fence, so the outer delta can never be below
  // (inner total - inner provider calls). A bypassed, reset, or faked inner
  // counter breaks this.
  const nesting = [
    {
      inner: engineeringTracer?.runtime?.providerFence,
      label: 'Phase 0B tracer',
      outer: tracerOuterObservation,
    },
    {
      inner: canonicalLifecycle?.providerFence,
      label: 'canonical lifecycle',
      outer: lifecycleOuterObservation,
    },
  ].map(({ inner, label, outer }) => {
    const delegated = inner?.measured === true
      ? inner.fetchCallsObserved - inner.providerFetchCallsObserved
      : null;
    const held = Boolean(
      outer?.measured === true
      && Number.isInteger(delegated)
      && outer.fetchCallsObserved >= delegated
      && outer.providerFetchCallsObserved === 0,
    );
    if (!held) {
      failures.push(
        `${label}: the nesting floor does not hold — the outer fence observed `
        + `${outer?.fetchCallsObserved ?? 'UNMEASURED'} call(s) and `
        + `${outer?.providerFetchCallsObserved ?? 'UNMEASURED'} provider call(s) `
        + `against ${delegated ?? 'UNMEASURED'} delegated by the inner fence`,
      );
    }
    return {
      innerDelegatedCalls: delegated,
      innerFetchCallsObserved: inner?.fetchCallsObserved ?? null,
      innerProviderFetchCallsObserved:
        inner?.providerFetchCallsObserved ?? null,
      lane: label,
      nestingFloorHeld: held,
      outerFetchCallsObserved: outer?.fetchCallsObserved ?? null,
      outerProviderFetchCallsObserved:
        outer?.providerFetchCallsObserved ?? null,
    };
  });

  // The checker's own total must contain every sub-window it took.
  const subWindowTotal =
    (tracerOuterObservation?.fetchCallsObserved ?? 0)
    + (lifecycleOuterObservation?.fetchCallsObserved ?? 0);
  if (
    checkerObservation?.measured === true
    && checkerObservation.fetchCallsObserved < subWindowTotal
  ) {
    failures.push(
      'the checker outer fence total is smaller than the sub-windows it '
      + 'contains; the counter and its own deltas disagree',
    );
  }

  return {
    checker: checkerObservation,
    childProcesses,
    childProcessesMeasured: childProcesses.length > 0
      && childProcesses.every((observation) => observation?.measured === true),
    // Non-vacuity of the child lane, MEASURED: the HoloScript CLI child really
    // does fetch its own WASM binary, so this number is observed moving on a
    // clean run rather than being 0 for reasons nobody checked.
    childProcessFetchCallsObserved: childProcesses.reduce(
      (sum, observation) => sum + (observation?.fetchCallsObserved ?? 0),
      0,
    ),
    failures,
    lifecycleInner: canonicalLifecycle?.providerFence ?? null,
    lifecycleOuterWindow: lifecycleOuterObservation,
    measuredAndZero: failures.length === 0,
    nesting,
    observerBoundaryFixtureWindow:
      observerBoundaryFixture?.claimBoundary?.providerCallObservation ?? null,
    phase0BInner: engineeringTracer?.runtime?.providerFence ?? null,
    phase0BReplayWindow: engineeringTracer?.replay?.providerFence ?? null,
    tracerOuterWindow: tracerOuterObservation,
  };
}

function buildAssertions({
  providerCallEvidence,
  texts,
  semanticIr,
  parsers,
  observerProjectionParser,
  headlessRuns,
  headlessReplay,
  experimentDesign,
  observerBoundaryFixture,
  engineeringTracer,
  canonicalLifecycle,
}) {
  const residentSeats = Array.from(
    { length: 6 },
    (_, index) => `ResidentSeat${String(index + 1).padStart(2, '0')}`,
  );
  const requiredPolicyTemplates = [
    'ModelVillageStudyDesign',
    'ModelResidentSeat',
    'LockedModelAdapterManifest',
    'EqualAffordanceEnvelope',
    'RunManifestReceipt',
    'RunManifestValidationReceipt',
    'ObservationEnvelope',
    'ModelTurnReceipt',
    'ModelVillageActionReceipt',
    'RunSummaryReceipt',
    'SafetyCheckReceipt',
    'ActionDecisionReceipt',
    'ObserverBoundaryFixtureReceipt',
  ];
  const requiredPolicies = [
    'EqualAffordanceRequired',
    'LockedModelRouteRequired',
    'WorldAndModelDeterminismSeparated',
    'ExperimentIsolationRequired',
    'ReceiptedMutationRequired',
    'BlindedAnalysisRequired',
    'PilotClaimBoundary',
    'HumanObserverConsentBoundary',
    'OutcomeDefinitionsFrozenBeforeFirstTurn',
    'NoSilentRunReplacement',
  ];
  const requiredKernelSteps = [
    'ValidateSourcesStep',
    'FreezeRunManifestStep',
    'CloneWorldStep',
    'AssignResidentSeatsStep',
    'BuildTurnScheduleStep',
    'ObservePublicWorldStep',
    'InvokeLockedModelAdapterStep',
    'ValidateActionProposalStep',
    'ApplyReceiptedMutationStep',
    'ReplayCapturedResponsesStep',
    'SummarizeVillageRunStep',
    'SealClaimBoundaryStep',
    'ModelVillageMixedAssignmentMatrix',
    'ModelVillageConditionOrder',
    'ModelVillageChallengeManifestSchema',
    'ModelVillageAnalysisSet',
    'ModelVillageEmergencyStopBinding',
    'ModelVillagePhase1TrustBindings',
  ];

  return {
    canonicalSourcesExist: [
      WORLD_SOURCE,
      OBSERVER_PROJECTION_SOURCE,
      POLICY_SOURCE,
      KERNEL_SOURCE,
      SPEC_SOURCE,
    ]
      .every((source) => existsSync(repoPath(texts.root, source))),
    threeFormatsParse: parsers.length === 3 && parsers.every((parser) => parser.passed),
    observerProjectionSourceParsesAndHasNoTextualLogic:
      observerProjectionParser.passed
      && semanticIr.observerProjection.actions.length === 0
      && semanticIr.observerProjection.emits.length === 0,
    nativeHeadlessRunsPass: headlessRuns.length === 2 && headlessRuns.every((run) => run.passed),
    headlessReceiptsIdentifyExactModelVillage: headlessRuns.every((run) => (
      run.validation?.passed
      && run.validation.sceneIds.length === EXPECTED_WORLD_OBJECT_IDS.length
      && run.validation.poseIds.length === EXPECTED_WORLD_OBJECT_IDS.length
      && new Set(run.validation.sceneIds).size === EXPECTED_WORLD_OBJECT_IDS.length
      && new Set(run.validation.poseIds).size === EXPECTED_WORLD_OBJECT_IDS.length
    )),
    canonicalSceneReplayMatches: headlessReplay.canonicalMatch,
    capturedObserverBoundaryFixturePasses:
      observerBoundaryFixture.status === 'pass'
      && observerBoundaryFixture.claimBoundary.capturedFixtureReplayExecuted === true
      // MEASURED, then zero — in that order. An unmeasured window fails.
      && observerBoundaryFixture.claimBoundary.providerCallObservation
        ?.measured === true
      && observerBoundaryFixture.claimBoundary.providerCallsMade === 0,
    // THE PROVIDER-CALL GATE for this whole lane. Every observation must be a
    // real measurement, cross-bound to its own incident log, nested correctly
    // inside this checker's independent outer fence, and zero. Failures are
    // published verbatim in runtimeEvidence.providerCallEvidence.failures.
    providerCallsMeasuredAndZeroAcrossEveryLane:
      providerCallEvidence.measuredAndZero === true,
    // NAMED SEPARATELY because it is the surface that was previously unwatched
    // by construction: the HoloScript CLI runs in a child process with its own
    // globals, so the parent's fence could never have seen a call it made. Each
    // child now installs the same fence and publishes its own window.
    providerCallsMeasuredInsideEverySpawnedChildProcess:
      providerCallEvidence.childProcessesMeasured === true
      && providerCallEvidence.childProcesses.every(
        (observation) => observation.providerFetchCallsObserved === 0,
      )
      // NON-VACUITY: on a clean run the CLI child really does fetch its own
      // WASM binary, so a child fence that never counted anything at all is a
      // fence that was not doing its job.
      && providerCallEvidence.childProcessFetchCallsObserved > 0,
    observerBoundaryFixtureReceiptBindsClaimBoundary:
      verifyObserverBoundaryFixtureReceipt(observerBoundaryFixture),
    observerBoundaryFieldsAreAvailable:
      observerBoundaryFixture.fieldValidation.passed === true
      && REQUIRED_OBSERVER_BOUNDARY_FIELDS.every(
        (field) => CANONICAL_SHA256_PATTERN.test(
          observerBoundaryFixture.canonicalFields[field] || '',
        ),
      ),
    adapterAssignmentsExcludedFromPreInferenceBoundary:
      observerBoundaryFixture.adapterAssignmentExclusion.status === 'pass'
      && observerBoundaryFixture.adapterAssignmentExclusion.assignmentHashes.length === 3
      && observerBoundaryFixture.adapterAssignmentExclusion
        .assignmentEntersCanonicalProjection === false
      && observerBoundaryFixture.adapterAssignmentExclusion
        .postInferenceOutcomeEquivalenceClaimed === false,
    observerBoundaryDoesNotClaimNativePipelineExecution:
      observerBoundaryFixture.claimBoundary.nativeHsPipelineExecutionClaimed === false
      && observerBoundaryFixture.claimBoundary.nativeHsplusActionExecutionClaimed === false
      && observerBoundaryFixture.claimBoundary.liveModelTurnsClaimed === false,
    phase0BEngineeringTracerPasses:
      engineeringTracer.status === 'pass'
      && engineeringTracer.schema === 'hololand.model-village-phase0b-runtime-bridge.v3'
      && Object.values(engineeringTracer.assertions).every((passed) => passed === true),
    phase0BSourceRunV4CountsAreBounded:
      engineeringTracer.runtime.sourceRunSchema
        === 'holoscript.headless-experiment-source-run.v4'
      && engineeringTracer.runtime.counts.schedule === 8
      && engineeringTracer.runtime.counts.observations === 6
      && engineeringTracer.runtime.counts.actions === 2
      && engineeringTracer.runtime.counts.publicStateSnapshots === 9
      && engineeringTracer.runtime.capturedResponsesConsumed === 2
      // The zero is now read off a fence counter that this checker also
      // independently verified (see providerCallsMeasuredAndZeroAcrossEveryLane);
      // requiring `measured` here means an absent fence blocks instead of
      // quietly reporting a clean run.
      && engineeringTracer.runtime.providerFence?.measured === true
      && engineeringTracer.runtime.providerCalls
        === engineeringTracer.runtime.providerFence.providerFetchCallsObserved
      && engineeringTracer.runtime.providerCalls === 0
      && engineeringTracer.runtime.worldProjection.objectCount === 12
      && engineeringTracer.runtime.worldProjection
        .exactIdsAndTransformsMatch === true,
    phase0BTrustPersistenceAtomicityReplayAndStopPass:
      engineeringTracer.assertions.trustedValidatorCryptographicallyVerified === true
      && engineeringTracer.assertions.hostSuppliedValidatorConfigPinned === true
      && engineeringTracer.assertions.persistentAuthorizationMonotonic === true
      && engineeringTracer.assertions.atomicActionAdmissionAndWorldMutation === true
      && engineeringTracer.assertions.atomicCommitBoundToVerifiedV4SourceRun === true
      && engineeringTracer.assertions.separateProcessPersistentStateRecovery === true
      && engineeringTracer.assertions.freshCapturedResponseReplayMatches === true
      && engineeringTracer.assertions.emergencyStopBridgeExecuted === true
      && engineeringTracer.assertions
        .canonicalTwelveObjectWorldProjectionMatches === true
      && engineeringTracer.persistence.authorizationAttemptsConsumed === 2
      && engineeringTracer.persistence.deniedAttemptsConsumed === 1
      && engineeringTracer.persistence.atomicActionReceiptsCommitted === 2
      && engineeringTracer.persistence.restartRecovered === true
      && engineeringTracer.persistence.sameProcessRereadRecovered === true
      && engineeringTracer.persistence.separateProcessRereadRecovered === true
      && engineeringTracer.persistence.mismatchedTargetAttemptBurnedAndDenied === true
      && engineeringTracer.persistence.malformedHashAttemptBurnedAndDenied === true
      && engineeringTracer.persistence.replayAfterRestartRejected === true,
    phase0BClaimBoundaryRemainsBounded:
      engineeringTracer.claimBoundary.boundedHsplusEntrypointExecuted === true
      && engineeringTracer.claimBoundary.capturedResponseFixturesReplayed === 2
      && engineeringTracer.claimBoundary.hololandCrossCompositionBridgeExecuted === true
      && engineeringTracer.claimBoundary.boundedHoloToHsplusStopDispatchExecuted === true
      && engineeringTracer.claimBoundary.liveModelProviderCallsClaimed === false
      && engineeringTracer.claimBoundary.fullHoloWorldExecutionClaimed === false
      && engineeringTracer.claimBoundary.fullHsLanguageExecutionClaimed === false
      && engineeringTracer.claimBoundary.fullHsplusLanguageExecutionClaimed === false
      && engineeringTracer.claimBoundary.nativeHoloLifecycleExecutionClaimed === false
      && engineeringTracer.claimBoundary.nativeHsplusEngineExecutionClaimed === false
      && engineeringTracer.claimBoundary.physicsEngineExecutionClaimed === false
      && engineeringTracer.claimBoundary.processCrashDurabilityClaimed === false
      && engineeringTracer.claimBoundary.productionDistributedTransactionClaimed === false
      && engineeringTracer.claimBoundary.productionValidatorTrustClaimed === false
      && engineeringTracer.claimBoundary.scientificOutcomeClaimed === false
      && engineeringTracer.claimBoundary.transactionScope
        === 'verified_v4_per_action_single_host_file_atomic_bridge'
      && engineeringTracer.claimBoundary.trustedValidatorInjection
        === 'caller_supplied_frozen_host_config'
      && engineeringTracer.claimBoundary.trustedValidatorKeyCustody
        === 'ephemeral_engineering_fixture'
      && engineeringTracer.claimBoundary.worldRuntimeLifecycleExecuted === false,
    canonicalTwelveObjectLifecycleAndAdapterMatrixClose:
      canonicalLifecycle.status === 'pass'
      && canonicalLifecycle.schema
        === 'hololand.model-village-canonical-lifecycle.v2'
      && Object.values(canonicalLifecycle.assertions)
        .every((value) => value === true || value === 0)
      && canonicalLifecycle.world.objectCount === 12
      && canonicalLifecycle.blocks.length === 3
      && canonicalLifecycle.blocks.every((block) => (
        block.bindings.length === 6
        && block.counts.schedule === 10
        && block.counts.actions === 10
        && block.counts.publicStateSnapshots === 11
        && block.counts.finalPublicState.phase === 'closed'
        && block.counts.finalPublicState.emergencyStopState === 'triggered'
        && block.counts.finalPublicState.worldMutationAllowed === false
        && block.replay.match === true
        && block.observerProof.equivalent === true
      ))
      && canonicalLifecycle.claimBoundary
        .canonicalTwelveObjectLifecycleExecuted === true
      && canonicalLifecycle.claimBoundary
        .adapterPermutationExecutionClaimed === true
      && canonicalLifecycle.claimBoundary.worldRuntimeLifecycleExecuted === true
      && canonicalLifecycle.claimBoundary.fullHoloWorldExecutionClaimed === false
      && canonicalLifecycle.claimBoundary
        .productionValidatorTrustClaimed === false
      && canonicalLifecycle.claimBoundary.liveModelProviderCallsClaimed === false
      && canonicalLifecycle.claimBoundary.scientificOutcomeClaimed === false,
    worldDefinesSixBlindedResidentSeats: residentSeats
      .every((name) => semanticIr.world.objects.includes(name))
      && includesAll(texts.worldCode, [
        'residentCapacity: 6',
        'modelIdentityVisibleToResidents: false',
        'privatePeerMemoryVisible: false',
      ]),
    worldDefinesVisibleExperimentControls: [
      'VillageCommons',
      'PublicStateBoard',
      'ReceiptLedger',
      'ObserverDeck',
      'IsolationBoundary',
      'EmergencyStop',
    ].every((name) => semanticIr.world.objects.includes(name)),
    worldDeclaresBoundedFreezeAndReceiptGap: includesAll(texts.worldCode, [
      'mutationWithoutReceipt: "deny"',
      'failClosedBehavior: "deny_mutation_and_request_freeze_when_runtime_gate_is_available"',
      'emit("receipt_written"',
      'receipt_status: "event_only_not_persisted_or_hash_chained"',
      'on_interact: "request_experiment_freeze"',
      'state.emergencyStopRequestState = "triggered"',
      'targetPolicyEntrypoint: "ModelVillageExperimentRuntime.freeze_run"',
      'bindingStatus: "blocked_until_cross_composition_action_binding"',
      'cross_composition_binding_status: "not_observed"',
      'run_manifest_receipt_emitted: false',
    ]),
    worldStartupDoesNotForgeRunManifestReceipt: includesAll(texts.worldCode, [
      'emit("model_village_world_ready"',
      'run_manifest_receipt_emitted: false',
    ]) && !texts.worldCode.includes('emit_receipt_written_event("run_manifest"'),
    policyDefinesStudyAndReceiptEnvelopes: requiredPolicyTemplates
      .every((name) => semanticIr.policy.templates.includes(name)),
    policyDefinesEqualAffordanceSafetyAndClaims: requiredPolicies
      .every((name) => semanticIr.policy.policies.includes(name)),
    policySeparatesWorldAndModelDeterminism: includesAll(texts.policyCode, [
      'samplingSeedRequestedFieldRequired: true',
      'samplingSeedAcceptedFieldRequired: true',
      'temperatureZeroIsNotDeterminismProof: true',
      'capturedResponseReplayRequired: true',
    ]),
    policyLocksRoutesAndHiddenContext: includesAll(texts.policyCode, [
      'forceProviderRequired: true',
      'fallbackAllowed: false',
      'promptEnhancementAllowed: false',
      'hiddenContextAllowed: false',
    ]),
    policyDeniesExternalCapabilities: includesAll(texts.policyCode, [
      '"filesystem"',
      '"browser"',
      '"payments"',
      '"wallets"',
      '"external_messages"',
      '"physical_actuation"',
      'crossRunMemoryAllowed: false',
      'crossVillageCommunicationAllowed: false',
    ]),
    policyReceiptActionsUseDeclaredSnakeCaseFields: includesAll(texts.policyCode, [
      'manifest.run_id',
      'manifest.seed_block',
      'seat.resident_id',
      'seat.adapter_alias',
      'turnReceipt.receipt_id',
      'turnReceipt.response_hash',
      'actionReceipt.receipt_id',
      'actionReceipt.rollback_reference',
      'actionReceipt.prior_receipt_hash',
      'summaryReceipt.receipt_chain_root',
    ]),
    policyRequiresTrustedManifestValidationReceipt: includesAll(texts.policyCode, [
      'template "RunManifestValidationReceipt"',
      'action register_run(manifest, validationReceipt)',
      'trustedValidatorRuntimeBindingStatus: "target_not_observed_phase_1_blocker"',
      'ModelVillageExperimentRuntime.phase == "idle"',
      'ModelVillageExperimentRuntime.trustedManifestValidatorConfigured',
      'validationReceipt.run_id == manifest.run_id',
      'validationReceipt.manifest_hash == manifest.manifest_hash',
      'validationReceipt.validator_authority_id == ModelVillageExperimentRuntime.trustedManifestValidatorAuthorityId',
      'validationReceipt.validator_source_hash == ModelVillageExperimentRuntime.trustedManifestValidatorSourceHash',
      'validationReceipt.validator_registry_receipt_id == ModelVillageExperimentRuntime.trustedManifestValidatorRegistryReceiptId',
      'validationReceipt.validation_sequence > ModelVillageExperimentRuntime.lastManifestValidationSequence',
      'validationReceipt.signature_verified',
      'ModelVillageExperimentRuntime.manifestValidationReceiptId = validationReceipt.receipt_id',
    ]),
    policyRequiresSixUniqueStagedSeatsAndClosedLifecycle: includesAll(texts.policyCode, [
      'ModelVillageExperimentRuntime.stagedResidentIds.includes(seat.resident_id)',
      'ModelVillageExperimentRuntime.stagedSeatIds.includes(seat.seat_id)',
      'ModelVillageExperimentRuntime.stagedResidentCount < ModelVillageExperimentRuntime.residentCount',
      'ModelVillageExperimentRuntime.stagedResidentCount == ModelVillageExperimentRuntime.residentCount',
      'ModelVillageExperimentRuntime.phase == "resident_staged"',
      'ModelVillageExperimentRuntime.residentStagingOpen = false',
      'ModelVillageExperimentRuntime.manifestValidated = false',
    ]),
    policyMutationAuthorizationIsCorrelatedAndSingleUse: includesAll(texts.policyCode, [
      'ModelVillageExperimentRuntime.manifestValidated',
      'ModelVillageExperimentRuntime.emergencyStopState == "armed"',
      'ModelVillageExperimentRuntime.phase == "running"',
      'ModelVillageExperimentRuntime.safetyDecision == "allow"',
      'safetyReceipt.proposal_hash == actionDecisionReceipt.proposal_hash',
      'safetyReceipt.turn_opportunity_id == actionDecisionReceipt.turn_opportunity_id',
      'safetyReceipt.authorization_nonce == actionDecisionReceipt.authorization_nonce',
      'safetyReceipt.authorization_sequence == ModelVillageExperimentRuntime.lastConsumedAuthorizationSequence + 1',
      'actionReceipt.run_id == ModelVillageExperimentRuntime.pendingRunId',
      'actionReceipt.tick == ModelVillageExperimentRuntime.pendingTick',
      'actionReceipt.resident_id == ModelVillageExperimentRuntime.pendingResidentId',
      'actionReceipt.proposal_hash == ModelVillageExperimentRuntime.pendingProposalHash',
      'actionReceipt.turn_opportunity_id == ModelVillageExperimentRuntime.pendingTurnOpportunityId',
      'actionReceipt.authorization_nonce == ModelVillageExperimentRuntime.pendingAuthorizationNonce',
      'actionReceipt.authorization_sequence == ModelVillageExperimentRuntime.pendingAuthorizationSequence',
      'actionReceipt.safety_receipt_id == ModelVillageExperimentRuntime.pendingSafetyReceiptId',
      'actionReceipt.action_decision_receipt_id == ModelVillageExperimentRuntime.pendingActionDecisionReceiptId',
      'ModelVillageExperimentRuntime.lastConsumedAuthorizationSequence = ModelVillageExperimentRuntime.pendingAuthorizationSequence',
      'emit("model_village_action_authorization_consumed"',
      'authorization_scope: "this_entrypoint_only"',
      'mutation_transaction_binding_status: "target_not_observed"',
      'ModelVillageExperimentRuntime.worldMutationAllowed = false',
      'action freeze_run(reason)',
    ]),
    policyPreservesFallbackAsContamination: includesAll(texts.policyCode, [
      'if (turnReceipt.fallback_used)',
      'ModelVillageExperimentRuntime.runContaminated = true',
      'ModelVillageExperimentRuntime.contaminationReason = "fallback_used"',
      'preserved_for_disposition: true',
    ]),
    kernelDefinesMatchedVillageDesign: experimentDesign.models === 3
      && experimentDesign.residents === 6
      && experimentDesign.conditions.length === 4
      && experimentDesign.seedBlocks === 3
      && experimentDesign.plannedVillageRuns === 12
      && experimentDesign.unitOfAnalysis === 'village_run'
      && experimentDesign.primaryOutcome === 'cooperative_event_completion_rate'
      && experimentDesign.estimandScope === 'exact_locked_adapter_triplet_persona_protocol_and_challenge_distribution'
      && experimentDesign.blockContrast === 'D_s_equals_Y_mixed_s_minus_mean_Y_a_Y_b_Y_c_within_seed_s'
      && experimentDesign.studyClass === 'mechanism_pilot_not_confirmatory',
    kernelDefinesCompleteTrialPipeline: requiredKernelSteps
      .every((name) => semanticIr.kernel.objects.includes(name)),
    kernelKeepsBehaviorInHoloScript: includesAll(texts.kernelCode, [
      'sourceIsCanonical: true',
      'bridgeMayValidateAndReceipt: true',
      'bridgeMayOwnVillageBehavior: false',
    ]),
    kernelDefinesBoundedObserverBoundaryFixture: includesAll(texts.kernelCode, [
      'type: "observer_boundary_fixture_manifest"',
      'executionMode: "captured_fixture_replay"',
      'providerCallsAllowed: false',
      'nativeHsPipelineExecutionClaimed: false',
      'nativeHsplusActionExecutionClaimed: false',
      'observerProjectionMayWrite: false',
      'type: "observer_boundary_public_state_fixture"',
      'type: "observer_boundary_observation_fixture"',
      'type: "observer_boundary_action_receipt_fixture"',
      'type: "observer_boundary_schedule_entry"',
    ]),
    kernelReportsRuntimeGapsHonestly: includesAll(texts.kernelCode, [
      'runtimeStatus: "declarative_pipeline_not_yet_executed_by_headless_runtime"',
      'currentModelTurnExecutionTrace: "unavailable"',
      'currentAgentActionExecutionTrace: "unavailable"',
      'scientificOutcomeClaimed: false',
      '"live_model_turns"',
      '"action_entrypoint_execution"',
      '"trusted_manifest_validator_binding"',
      '"receipted_mutation_transaction"',
      '"cross_composition_emergency_stop_binding"',
      '"state_snapshot_replay"',
    ]),
    specSeparatesObservedTargetGapAndForbiddenClaims: includesAll(texts.spec, [
      '## Claim register',
      '| Observed |',
      '| Target |',
      '| Gap |',
      '| Forbidden claim |',
      'The tracer makes zero provider calls and executes no live model',
    ]),
    packageExposesChecker: texts.packageJson.includes(
      '"check:hololand-model-village": "node scripts/check-hololand-model-village-experiment.mjs"',
    ),
  };
}

export function resolveReceiptOutput(root, output) {
  const resolved = path.isAbsolute(output) ? output : repoPath(root, output);
  const allowedRoot = repoPath(root, '.tmp');
  const relative = path.relative(allowedRoot, resolved);
  const withinAllowedRoot = relative !== ''
    && !relative.startsWith(`..${path.sep}`)
    && relative !== '..'
    && !path.isAbsolute(relative);
  if (!withinAllowedRoot || path.extname(resolved).toLowerCase() !== '.json') {
    throw new Error(
      `Receipt output must be a .json file inside ${allowedRoot}`,
    );
  }
  return resolved;
}

function writeReceipt(root, output, receipt) {
  const resolved = resolveReceiptOutput(root, output);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return resolved;
}

function assertionFailures(assertions) {
  return Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
}

function gitProvenance(root) {
  const commit = commandResult('git', ['rev-parse', 'HEAD'], { cwd: root });
  const status = commandResult(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      WORLD_SOURCE,
      OBSERVER_PROJECTION_SOURCE,
      POLICY_SOURCE,
      KERNEL_SOURCE,
      SPEC_SOURCE,
      ...Object.values(PHASE0B_SOURCE_PATHS),
      'scripts/model-village-phase0b-runtime.mjs',
      'scripts/check-hololand-model-village-experiment.mjs',
      'scripts/__tests__/hololand-model-village-experiment.test.mjs',
      PACKAGE_JSON,
    ],
    { cwd: root },
  );
  const scopedStatus = String(status.stdout || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => normalizePath(line));

  return {
    commit: commit.status === 0 ? String(commit.stdout).trim() : null,
    scopedDirty: scopedStatus.length > 0,
    scopedStatus,
  };
}

export async function runModelVillageCheck(options = {}) {
  // The outer fence goes up before anything else this checker does, including
  // loading the HoloScript CLI.
  const checkerFence = installProviderCallFence();
  try {
    return await runModelVillageCheckFenced(options, checkerFence);
  } finally {
    checkerFence.restore();
  }
}

async function runModelVillageCheckFenced(options, checkerFence) {
  const root = path.resolve(options.root ?? process.cwd());
  const output = options.output ?? DEFAULT_OUTPUT;
  const durationMs = options.durationMs ?? 200;
  const tickRate = options.tickRate ?? 10;
  const holoScript = findHoloScriptCli(root);

  if (!holoScript) {
    throw new Error(
      'Local HoloScript CLI not found. Set HOLOSCRIPT_ROOT or place HoloScript beside HoloLand.',
    );
  }
  const holoScriptCore = await loadHoloScriptCore(holoScript);

  const texts = {
    root,
    world: read(root, WORLD_SOURCE),
    observerProjection: read(root, OBSERVER_PROJECTION_SOURCE),
    policy: read(root, POLICY_SOURCE),
    kernel: read(root, KERNEL_SOURCE),
    spec: read(root, SPEC_SOURCE),
    packageJson: read(root, PACKAGE_JSON),
  };
  texts.worldCode = stripLineComments(texts.world);
  texts.observerProjectionCode = stripLineComments(texts.observerProjection);
  texts.policyCode = stripLineComments(texts.policy);
  texts.kernelCode = stripLineComments(texts.kernel);
  const parsers = [WORLD_SOURCE, POLICY_SOURCE, KERNEL_SOURCE]
    .map((source) => parseSource(root, holoScript.cli, source));
  const observerProjectionParser = parseSource(
    root,
    holoScript.cli,
    OBSERVER_PROJECTION_SOURCE,
  );
  const headlessRuns = [
    runHeadless(root, holoScript.cli, { durationMs, tickRate }),
    runHeadless(root, holoScript.cli, { durationMs, tickRate }),
  ];
  const canonicalRuns = headlessRuns.map(canonicalHeadlessProjection);
  const canonicalDigests = canonicalRuns.map((projection) => (
    projection ? sha256(canonicalJson(projection)) : null
  ));
  const firstHeadlessReceipt = headlessRuns[0]?.receipt;
  const rawHeadlessReceiptHashes = headlessRuns.map((run) => (
    run.receipt ? sha256(canonicalJson(run.receipt)) : null
  ));
  const headlessReplay = {
    runtimeSchema: firstHeadlessReceipt?.schema ?? null,
    runs: 2,
    canonicalMatch: Boolean(
      canonicalDigests[0]
      && canonicalDigests[1]
      && canonicalDigests[0] === canonicalDigests[1],
    ),
    canonicalDigests,
    canonicalProjection: ['scene', 'posePhysics'],
    fieldsOutsideCanonicalProjection: ['stats'],
    rawHeadlessReceiptHashes,
    runStats: headlessRuns.map((run) => run.receipt?.stats ?? null),
    objectCount: firstHeadlessReceipt?.scene?.objectCount ?? 0,
    objectIds: (firstHeadlessReceipt?.scene?.objects ?? []).map((object) => object.id),
    baselineEventCount: firstHeadlessReceipt?.stats?.eventCount ?? 0,
    eventCountUsedAsExperimentEvidence: false,
    orderedEventPayloadTraceAvailable: false,
  };
  let observerBoundaryFixture;
  const fixtureFenceCursor = snapshotProviderFence(checkerFence);
  try {
    observerBoundaryFixture = executeObserverBoundaryFixture({
      core: holoScriptCore.core,
      kernelSource: texts.kernel,
      policySource: texts.policy,
      headlessReceipt: firstHeadlessReceipt,
      providerCallObservation: null,
    });
  } catch (error) {
    observerBoundaryFixture = failedObserverBoundaryFixture(error);
  }
  // The fixture's provider-call claim is a delta off THIS checker's fence,
  // taken around the call that produced it, then folded into the fixture and
  // re-sealed. It is not a constant the fixture wrote about itself.
  observerBoundaryFixture = sealObserverBoundaryProviderObservation(
    observerBoundaryFixture,
    summarizeProviderCallFence(checkerFence, {
      since: fixtureFenceCursor,
      window: 'observer-boundary-fixture-replay',
    }),
  );

  const trustedValidator = createRuntimeInjectedValidatorFixture();
  // OUT-OF-BAND SECOND COUNTER over the tracer: the tracer installs its own
  // fence inside this window, so this delta sees everything the inner fence
  // delegated PLUS anything that bypassed it via a pre-fence reference.
  const tracerFenceCursor = snapshotProviderFence(checkerFence);
  const engineeringTracer = await runPhase0BEngineeringTracer({
    root,
    signRunManifest: trustedValidator.issue,
    trustedValidatorConfig: trustedValidator.config,
  });
  const tracerOuterObservation = summarizeProviderCallFence(checkerFence, {
    since: tracerFenceCursor,
    window: 'checker-outer-fence-over-phase0b-tracer',
  });
  const lifecycleFenceCursor = snapshotProviderFence(checkerFence);
  const canonicalLifecycle = await runCanonicalModelVillageLifecycle({ root });
  const lifecycleOuterObservation = summarizeProviderCallFence(checkerFence, {
    since: lifecycleFenceCursor,
    window: 'checker-outer-fence-over-canonical-lifecycle',
  });
  // Every I/O-capable phase of this checker has now run, so this is the window
  // the receipt publishes. Nothing below opens a socket; the non-regression
  // check at receipt-build time proves that rather than assuming it.
  const checkerObservation = summarizeProviderCallFence(checkerFence, {
    window: 'checker-execution-through-receipt-seal',
  });
  // Every child process this checker spawned published its own window from
  // inside itself. They are collected here rather than inferred: a spawn site
  // that stops fencing its child stops contributing an observation, and the
  // "no child observations" rule in buildProviderCallEvidence fires.
  const childProcessObservations = [
    ...parsers,
    observerProjectionParser,
    ...headlessRuns,
  ].flatMap((entry) => entry?.providerFences ?? []);
  const providerCallEvidence = buildProviderCallEvidence({
    checkerObservation,
    childProcessObservations,
    engineeringTracer,
    canonicalLifecycle,
    observerBoundaryFixture,
    tracerOuterObservation,
    lifecycleOuterObservation,
  });

  const semanticIr = buildSemanticIr(texts);
  const experimentDesign = buildExperimentDesign(texts.kernelCode);
  const assertions = buildAssertions({
    providerCallEvidence,
    texts,
    semanticIr,
    parsers,
    observerProjectionParser,
    headlessRuns,
    headlessReplay,
    experimentDesign,
    observerBoundaryFixture,
    engineeringTracer,
    canonicalLifecycle,
  });
  const failures = assertionFailures(assertions);
  const capabilityStatus = {
    observed: {
      sourceParsing:
        parsers.every((parser) => parser.passed)
        && observerProjectionParser.passed,
      worldMaterialization: headlessRuns.every((run) => run.passed),
      canonicalSceneReplay: headlessReplay.canonicalMatch,
      capturedObserverBoundaryFixtureReplay: observerBoundaryFixture.status === 'pass',
      boundedPhase0BEngineeringTracer: engineeringTracer.status === 'pass',
      canonicalTwelveObjectLifecycleAndAdapterMatrix:
        canonicalLifecycle.status === 'pass',
    },
    boundedBridgeObserved: {
      sourceRunV4Verified: engineeringTracer.assertions.sourceRunV4Verified,
      boundedHsplusEntrypointExecution:
        engineeringTracer.claimBoundary.boundedHsplusEntrypointExecuted,
      capturedResponseActionReplay:
        engineeringTracer.assertions.freshCapturedResponseReplayMatches,
      perStepPublicStateSnapshots:
        engineeringTracer.runtime.counts.publicStateSnapshots === 9,
      challengeAndMetricManifestsHashed:
        engineeringTracer.assertions.challengeAndMetricManifestsFrozenAndHashed,
      cryptographicTrustedValidator:
        engineeringTracer.assertions.trustedValidatorCryptographicallyVerified,
      hostSuppliedValidatorConfigPinned:
        engineeringTracer.assertions.hostSuppliedValidatorConfigPinned,
      persistentAuthorizationConsumption:
        engineeringTracer.assertions.persistentAuthorizationMonotonic,
      verifiedV4PerActionSingleHostFileAtomicCommit:
        engineeringTracer.assertions.atomicActionAdmissionAndWorldMutation
        && engineeringTracer.assertions.atomicCommitBoundToVerifiedV4SourceRun,
      separateProcessPersistentStateRecovery:
        engineeringTracer.assertions.separateProcessPersistentStateRecovery,
      invalidAuthorizationAttemptsBurnedAndDenied:
        engineeringTracer.persistence.mismatchedTargetAttemptBurnedAndDenied
        && engineeringTracer.persistence.malformedHashAttemptBurnedAndDenied,
      emergencyStopBridge: engineeringTracer.assertions.emergencyStopBridgeExecuted,
      boundedHoloToHsplusStopDispatch:
        engineeringTracer.claimBoundary.boundedHoloToHsplusStopDispatchExecuted,
      canonicalLifecycleSourceProjection:
        canonicalLifecycle.claimBoundary
          .canonicalLifecycleSourceProjectionExecuted,
      canonicalTwelveObjectLifecycle:
        canonicalLifecycle.claimBoundary
          .canonicalTwelveObjectLifecycleExecuted,
      frozenAdapterMatrixExecution:
        canonicalLifecycle.claimBoundary.adapterPermutationExecutionClaimed,
    },
    targetObservedScope: 'live_full_native_and_scientific_experiment',
    targetObserved: {
      liveModelAdapterInvocation: false,
      receiptedActionExecution: false,
      perStepStateSnapshots: false,
      capturedResponseActionReplay: false,
      deterministicModelSampling: false,
      processCrashDurability: false,
      productionDistributedTransactions: false,
      productionValidatorTrust: false,
      scientificOutcomeEvidence: false,
    },
  };
  const runtimeEvidence = {
    modelTurnsExecuted: null,
    agentActionsExecuted: null,
    executionCountsAvailable: false,
    scientificOutcomeClaimed: extractBoolean(texts.kernelCode, 'scientificOutcomeClaimed') ?? false,
    worldObjectsMaterialized: headlessReplay.objectCount,
    baselineEventsCountedWithoutPayloadTrace: headlessReplay.baselineEventCount,
    providerCallsMadeByChecker:
      checkerObservation.providerFetchCallsObserved,
    providerCallEvidence,
    capturedFixtureScheduleEntriesExecuted:
      observerBoundaryFixture.executedSchedule.length,
    capturedFixtureResidentObservationsMaterialized:
      observerBoundaryFixture.residentObservations.length,
    capturedFixtureActionReceiptsSealed:
      observerBoundaryFixture.actionReceipts.length,
    capturedFixtureExecutionCountsAvailable: observerBoundaryFixture.status === 'pass',
    nativeHsPipelineExecutionClaimed: false,
    nativeHsplusActionExecutionClaimed: false,
    boundedPhase0B: {
      sourceRunSchema: engineeringTracer.runtime.sourceRunSchema,
      scheduleEntriesExecuted: engineeringTracer.runtime.counts.schedule,
      residentObservationsMaterialized:
        engineeringTracer.runtime.counts.observations,
      boundedHsplusSubsetActionsExecuted:
        engineeringTracer.runtime.boundedHsplusSubsetActionsExecuted,
      publicStateSnapshotsMaterialized:
        engineeringTracer.runtime.counts.publicStateSnapshots,
      capturedResponsesConsumed:
        engineeringTracer.runtime.capturedResponsesConsumed,
      allowedWorldMutationsCommitted:
        engineeringTracer.runtime.actionDecisions
          .filter((decision) => decision.allowed && decision.stateChanged).length,
      deniedAuthorizationAttemptsConsumed:
        engineeringTracer.persistence.deniedAttemptsConsumed,
      authorizationAttemptsConsumed:
        engineeringTracer.persistence.authorizationAttemptsConsumed,
      cryptographicValidatorVerified:
        engineeringTracer.validator.signatureVerified,
      hostSuppliedValidatorConfigPinned:
        engineeringTracer.assertions.hostSuppliedValidatorConfigPinned,
      validatorKeyCustody:
        engineeringTracer.claimBoundary.trustedValidatorKeyCustody,
      atomicCommitBoundToVerifiedV4SourceRun:
        engineeringTracer.assertions.atomicCommitBoundToVerifiedV4SourceRun,
      sameProcessPersistentStateRereadRecovered:
        engineeringTracer.persistence.sameProcessRereadRecovered,
      separateProcessPersistentStateRereadRecovered:
        engineeringTracer.persistence.separateProcessRereadRecovered,
      mismatchedTargetAttemptBurnedAndDenied:
        engineeringTracer.persistence.mismatchedTargetAttemptBurnedAndDenied,
      malformedHashAttemptBurnedAndDenied:
        engineeringTracer.persistence.malformedHashAttemptBurnedAndDenied,
      faultBeforeRename: engineeringTracer.persistence.faultBeforeRename,
      faultAfterRename: engineeringTracer.persistence.faultAfterRename,
      replayAfterRestartRejected:
        engineeringTracer.persistence.replayAfterRestartRejected,
      freshCapturedResponseReplayMatches:
        engineeringTracer.replay.match,
      emergencyStopBridgeExecuted:
        engineeringTracer.assertions.emergencyStopBridgeExecuted,
      boundedHoloToHsplusStopDispatchExecuted:
        engineeringTracer.claimBoundary.boundedHoloToHsplusStopDispatchExecuted,
      providerCallsMade: engineeringTracer.runtime.providerCalls,
      providerCallMeasurement:
        engineeringTracer.receipt.providerCallMeasurement,
      transactionScope: engineeringTracer.claimBoundary.transactionScope,
    },
    canonicalLifecycle: {
      adapterBlocksExecuted: canonicalLifecycle.blocks.length,
      lifecycleActionsExecuted: canonicalLifecycle.blocks.reduce(
        (sum, block) => sum + block.counts.actions,
        0,
      ),
      lifecycleSequence:
        canonicalLifecycle.blocks[0].lifecycleSequence,
      observerNoninterferenceVerified:
        canonicalLifecycle.assertions.observerNoninterferenceVerified,
      providerCallsMade: canonicalLifecycle.assertions.providerCallsMade,
      publicStateSnapshotsMaterialized:
        canonicalLifecycle.blocks.reduce(
          (sum, block) => sum + block.counts.publicStateSnapshots,
          0,
        ),
      replayVerified: canonicalLifecycle.assertions.replayVerified,
      residentPersonaSeatBindingsStaged:
        canonicalLifecycle.blocks.reduce(
          (sum, block) => sum + block.bindings.length,
          0,
        ),
      worldObjectsProjected: canonicalLifecycle.world.objectCount,
      worldRuntimeLifecycleExecuted:
        canonicalLifecycle.claimBoundary.worldRuntimeLifecycleExecuted,
    },
  };
  const sourceContract = {
    threeFormat: parsers.map((parser) => parser.format).join(',') === '.holo,.hsplus,.hs',
    formats: {
      '.holo': 'spatial village plus source-bound read-only observer projection',
      '.hsplus': 'resident, adapter, policy, safety, and receipt contracts',
      '.hs': 'trial pipeline, matched conditions, metrics, and closure gates',
    },
    sourceIsCanonical: true,
    checkerOwnsExperimentBehavior: false,
    checkerOwnsDeterministicFixtureProjection: true,
    fixtureInputsOwnedByHoloScript: true,
    boundedTwelveObjectRehearsalObserverProjectionToggleExecuted:
      engineeringTracer.runtime.observerProjection.projectionToggleExecuted
        === true,
    canonicalTwelveObjectObserverProjectionToggleExecuted: true,
    canonicalTwelveObjectRuntimeLifecycleExecuted:
      canonicalLifecycle.claimBoundary.worldRuntimeLifecycleExecuted,
    frozenThreeBlockAdapterMatrixExecuted:
      canonicalLifecycle.claimBoundary.adapterPermutationExecutionClaimed,
  };
  const toolchain = {
    holoScriptVersion: holoScript.version,
    holoScriptCliSha256: holoScript.cliSha256,
    holoScriptCoreSha256: holoScriptCore.coreSha256,
    checkerSha256: sha256(normalizeSource(readFileSync(CHECKER_PATH, 'utf8'))),
    nodeVersion: process.version,
    durationMs,
    tickRate,
  };
  const git = gitProvenance(root);
  const claimBoundary = {
    observed: [
      'three source formats and the source-bound observer projection parse',
      'native headless world materialization',
      'canonical scene and pose replay',
      'source-declared captured fixture schedule, six resident observations, and action-receipt chain replay through the bounded HoloLand bridge',
      'static adapter-assignment exclusion from the pre-inference fixture projection',
      'bounded HoloScript V4 source-run engineering tracer with eight schedule entries, six resident observations, two captured-response actions, and nine public-state snapshots',
      'host-supplied ephemeral engineering validator config plus monotonic authorization, same-process and separate-process reread recovery, and a verified-V4 per-action single-host file-atomic bridge',
      'fresh captured-response replay match and bounded emergency-stop bridge execution',
      'single-sealed-execution observer projection off/on equivalence for the bounded twelve-object, six-resident Phase 0B rehearsal',
      'canonical twelve-object static world projection with exact source-locked transforms across three replay-verified observer toggles',
      'canonical register, six-resident stage, start, freeze, and close lifecycle execution for every frozen adapter block',
      'exact resident, persona, and seat bindings with each seat receiving every adapter once across the three-block matrix',
    ],
    targetNotObserved: [
      'browser consumer toggle for the canonical lifecycle projection',
      'post-inference adapter outcome equivalence',
      'validation of the opaque referenced safety and action-decision receipt IDs',
      'live model turns',
      'full/native .hs pipeline execution beyond the bounded V4 plan subset',
      'full/native .hsplus engine execution beyond the bounded deterministic action subset',
      'general receipted action entrypoint execution beyond the Phase 0B bridge',
      'full world-runtime per-step state replay beyond the bounded Phase 0B snapshots',
      'process-crash durability',
      'production distributed transactions',
      'production validator provisioning, custody, and trust publication',
      'scientific outcomes',
    ],
    pilotIsConfirmatory: false,
  };
  const unsignedModelVillageReceipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? 'pass' : 'fail',
    studyPhase: 'phase0b_canonical_lifecycle_closure',
    sources: {
      world: WORLD_SOURCE,
      observerProjection: OBSERVER_PROJECTION_SOURCE,
      policy: POLICY_SOURCE,
      kernel: KERNEL_SOURCE,
      spec: SPEC_SOURCE,
      phase0B: engineeringTracer.sources,
      canonicalLifecycle: MODEL_VILLAGE_CANONICAL_LIFECYCLE_SOURCES,
    },
    sourceContract,
    parsers,
    observerProjectionParser,
    semanticIr,
    assertions,
    headlessReplay,
    observerBoundaryFixture,
    engineeringTracer,
    canonicalLifecycle,
    runtimeEvidence,
    capabilityStatus,
    experimentDesign,
    toolchain,
    git,
    claimBoundary,
  };
  // NON-REGRESSION ON THE SEALED WINDOW: prove that nothing between the seal
  // and here opened a socket, instead of asserting it in a comment. If the
  // fence moved after the receipt's number was taken, the receipt is stale and
  // must not be written.
  const postSealObservation = summarizeProviderCallFence(checkerFence, {
    window: 'checker-post-seal-non-regression',
  });
  // Two DIFFERENT faults, reported separately. Folding them together sent an
  // operator hunting a stale-count bug when the real cause was a fence that was
  // never watching in the first place.
  if (postSealObservation.measured !== true) {
    throw new Error(
      'Model Village check: the provider-call window is UNMEASURED at receipt-'
      + `write time (${postSealObservation.unmeasuredReason
        || 'no reason published'}); an unwatched window cannot be published as `
      + 'a clean run',
    );
  }
  if (
    postSealObservation.fetchCallsObserved
      !== checkerObservation.fetchCallsObserved
    || postSealObservation.providerFetchCallsObserved
      !== checkerObservation.providerFetchCallsObserved
  ) {
    throw new Error(
      'Model Village check: the provider-call fence moved after the receipt '
      + 'window was sealed; the published count is stale',
    );
  }

  const receipt = {
    ...unsignedModelVillageReceipt,
    receipt: {
      receiptHash: canonicalDigest(unsignedModelVillageReceipt),
      rawSourceIncluded: false,
      rawModelPromptsIncluded: false,
      rawModelResponsesIncluded: false,
      providerCallMeasurement: checkerObservation.measured
        ? 'measured'
        : 'unmeasured',
      providerCallsMadeByChecker:
        checkerObservation.providerFetchCallsObserved,
      output: normalizePath(output),
    },
  };

  const resolvedOutput = writeReceipt(root, output, receipt);
  if (failures.length > 0) {
    throw new Error(
      `Model Village source-contract check failed: ${failures.join(', ')}. Receipt: ${resolvedOutput}`,
    );
  }

  return {
    receipt,
    output: resolvedOutput,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs();
    const { receipt, output } = await runModelVillageCheck(args);
    if (args.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log('[hololand-model-village] ok');
      console.log(`receipt: ${output}`);
      console.log(`world objects: ${receipt.headlessReplay.objectCount}`);
      console.log(`canonical replay: ${receipt.headlessReplay.canonicalMatch}`);
      console.log(
        `bounded Phase 0B source-run: `
        + `${receipt.runtimeEvidence.boundedPhase0B.scheduleEntriesExecuted} schedule / `
        + `${receipt.runtimeEvidence.boundedPhase0B.residentObservationsMaterialized} observations / `
        + `${receipt.runtimeEvidence.boundedPhase0B.boundedHsplusSubsetActionsExecuted} actions / `
        + `${receipt.runtimeEvidence.boundedPhase0B.publicStateSnapshotsMaterialized} snapshots`,
      );
      console.log(
        `canonical lifecycle: `
        + `${receipt.runtimeEvidence.canonicalLifecycle.adapterBlocksExecuted} blocks / `
        + `${receipt.runtimeEvidence.canonicalLifecycle.residentPersonaSeatBindingsStaged} bindings / `
        + `${receipt.runtimeEvidence.canonicalLifecycle.lifecycleActionsExecuted} actions / `
        + `${receipt.runtimeEvidence.canonicalLifecycle.publicStateSnapshotsMaterialized} snapshots`,
      );
      console.log('live model-turn execution trace: unavailable');
      console.log('full/native agent-action execution trace: unavailable');
    }
  } catch (error) {
    console.error('[hololand-model-village] failed');
    console.error(error.message || error);
    process.exit(1);
  }
}
