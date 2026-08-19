/* global process, structuredClone */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  installProviderCallFence,
  snapshotProviderFence,
  summarizeProviderCallFence,
  verifyProviderCallObservation,
} from './model-village-provider-call-fence.mjs';

// PROVIDER-CALL MEASUREMENT. `counts.providerCalls` used to be a hardcoded 0
// per block, summed into an `assertions.providerCallsMade` that was then
// asserted to be 0 — the same verify(emit()) shape the Phase 0B tracer had. It
// is now a DELTA off the shared counting fence
// (./model-village-provider-call-fence.mjs) measured around each executed
// block, and the receipt publishes the fence's own observation so the number is
// falsifiable. An unmeasured window FAILS rather than reading as a clean zero.

export const MODEL_VILLAGE_CANONICAL_LIFECYCLE_SCHEMA =
  'hololand.model-village-canonical-lifecycle.v2';

export const MODEL_VILLAGE_CANONICAL_LIFECYCLE_SOURCES = Object.freeze({
  kernel: 'source/proofs/model-village-trial-kernel.hs',
  policy: 'source/domains/agents/model-village-experiment.hsplus',
  world: 'source/layers/vr/frontier/model-village/model-village.holo',
});

export const MODEL_VILLAGE_CANONICAL_OBJECT_IDS = Object.freeze([
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
]);

export const MODEL_VILLAGE_CANONICAL_LIFECYCLE_ACTIONS = Object.freeze([
  'register_run',
  'stage_resident',
  'start_run',
  'freeze_run',
  'close_run',
]);

export const MODEL_VILLAGE_PRODUCTION_LOCK_COMMIT =
  'a1c8c9ad6142ba4795385dac6551a4131befa809';

const EXPECTED_WORLD_TRANSFORMS = Object.freeze({
  ResidentSeat01: Object.freeze({ position: [-3, 1, 1.8], scale: [0.68, 1.5, 0.68] }),
  ResidentSeat02: Object.freeze({ position: [-1.8, 1, 2.8], scale: [0.68, 1.5, 0.68] }),
  ResidentSeat03: Object.freeze({ position: [-0.6, 1, 3.35], scale: [0.68, 1.5, 0.68] }),
  ResidentSeat04: Object.freeze({ position: [0.6, 1, 3.35], scale: [0.68, 1.5, 0.68] }),
  ResidentSeat05: Object.freeze({ position: [1.8, 1, 2.8], scale: [0.68, 1.5, 0.68] }),
  ResidentSeat06: Object.freeze({ position: [3, 1, 1.8], scale: [0.68, 1.5, 0.68] }),
  VillageCommons: Object.freeze({ position: [0, 0.1, 0], scale: [5.5, 0.2, 5.5] }),
  PublicStateBoard: Object.freeze({ position: [-2.2, 1.35, -2.4], scale: [1.8, 1, 0.08] }),
  ReceiptLedger: Object.freeze({ position: [0, 1.35, -2.8], scale: [1.8, 1, 0.08] }),
  ObserverDeck: Object.freeze({ position: [2.2, 1.35, -2.4], scale: [1.8, 1, 0.08] }),
  IsolationBoundary: Object.freeze({ position: [0, 0.05, 5.4], scale: [12, 0.1, 0.12] }),
  EmergencyStop: Object.freeze({ position: [4.2, 1, -2.2], scale: [0.7, 0.7, 0.7] }),
});

const EXPECTED_PERSONA_SEATS = Object.freeze([
  'persona-01@seat-01',
  'persona-02@seat-02',
  'persona-03@seat-03',
  'persona-04@seat-04',
  'persona-05@seat-05',
  'persona-06@seat-06',
]);

const EXPECTED_ADAPTERS = Object.freeze([
  'adapter_a',
  'adapter_b',
  'adapter_c',
]);

const EXPECTED_MATRIX = Object.freeze({
  block1: Object.freeze([
    'adapter_a',
    'adapter_a',
    'adapter_b',
    'adapter_b',
    'adapter_c',
    'adapter_c',
  ]),
  block2: Object.freeze([
    'adapter_b',
    'adapter_b',
    'adapter_c',
    'adapter_c',
    'adapter_a',
    'adapter_a',
  ]),
  block3: Object.freeze([
    'adapter_c',
    'adapter_c',
    'adapter_a',
    'adapter_a',
    'adapter_b',
    'adapter_b',
  ]),
});

const VALIDATOR_AUTHORITY_ID =
  'hololand_model_village_manifest_validator_v1';
const VALIDATOR_REGISTRY_RECEIPT_ID =
  'mv-l12-ephemeral-engineering-registry-001';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  const input = typeof value === 'string' ? value : canonicalJson(value);
  return createHash('sha256').update(input).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceExactly(source, searchValue, replacement, expectedCount, label) {
  const pieces = source.split(searchValue);
  const count = pieces.length - 1;
  assert(
    count === expectedCount,
    `${label} expected ${expectedCount} replacement(s), observed ${count}`,
  );
  return pieces.join(replacement);
}

function findBalancedBlock(source, pattern, label) {
  const expression = new RegExp(pattern.source, pattern.flags.replace('g', ''));
  const match = expression.exec(source);
  assert(match, `${label} block is missing`);
  const open = source.indexOf('{', match.index);
  assert(open >= 0, `${label} opening brace is missing`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  let lineComment = false;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    const next = source[cursor + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      cursor += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(open + 1, cursor),
          end: cursor + 1,
          full: source.slice(match.index, cursor + 1),
          start: match.index,
        };
      }
    }
  }
  throw new Error(`${label} closing brace is missing`);
}

function findAllObjectBlocks(source) {
  const blocks = [];
  const pattern = /\bobject\s+"([^"]+)"(?:\s+using\s+"[^"]+")?\s*\{/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const block = findBalancedBlock(
      source.slice(match.index),
      /^object\s+"([^"]+)"(?:\s+using\s+"[^"]+")?\s*\{/,
      `world object ${match[1]}`,
    );
    blocks.push({ id: match[1], body: block.body });
    pattern.lastIndex = match.index + block.end;
  }
  return blocks;
}

function extractJsonArray(block, field, label) {
  const match = block.match(new RegExp(`\\b${field}:\\s*(\\[[^\\]]+\\])`));
  assert(match, `${label}.${field} is missing`);
  const value = JSON.parse(match[1]);
  assert(
    Array.isArray(value)
      && value.length === 3
      && value.every((entry) => Number.isFinite(entry)),
    `${label}.${field} must be a numeric xyz vector`,
  );
  return value;
}

export function extractCanonicalWorldManifest(worldSource) {
  const normalized = normalizeSource(worldSource);
  const allObjects = findAllObjectBlocks(normalized);
  const selected = allObjects.filter((entry) => (
    MODEL_VILLAGE_CANONICAL_OBJECT_IDS.includes(entry.id)
  ));
  assert(
    selected.length === MODEL_VILLAGE_CANONICAL_OBJECT_IDS.length,
    `canonical world must expose exactly ${MODEL_VILLAGE_CANONICAL_OBJECT_IDS.length} required objects`,
  );
  assert(
    new Set(selected.map((entry) => entry.id)).size === selected.length,
    'canonical world object IDs must be unique',
  );
  assert(
    canonicalJson(selected.map((entry) => entry.id))
      === canonicalJson(MODEL_VILLAGE_CANONICAL_OBJECT_IDS),
    'canonical world object order or IDs drifted',
  );

  return selected.map((entry) => {
    const transform = {
      position: extractJsonArray(entry.body, 'position', entry.id),
      scale: extractJsonArray(entry.body, 'scale', entry.id),
    };
    assert(
      canonicalJson(transform) === canonicalJson(EXPECTED_WORLD_TRANSFORMS[entry.id]),
      `${entry.id} canonical transform drifted`,
    );
    return {
      id: entry.id,
      position: transform.position,
      rotation: null,
      scale: transform.scale,
    };
  });
}

function extractStringArray(source, field, label) {
  const match = source.match(new RegExp(`\\b${field}:\\s*(\\[[^\\]]*\\])`));
  assert(match, `${label}.${field} is missing`);
  const value = JSON.parse(match[1]);
  assert(
    Array.isArray(value) && value.every((entry) => typeof entry === 'string'),
    `${label}.${field} must be a string array`,
  );
  return value;
}

export function extractCanonicalAdapterMatrix(kernelSource) {
  const normalized = normalizeSource(kernelSource);
  const block = findBalancedBlock(
    normalized,
    /object\s+"ModelVillageMixedAssignmentMatrix"\s*\{/,
    'ModelVillageMixedAssignmentMatrix',
  ).body;
  const personasAndSeats = extractStringArray(
    block,
    'personasAndSeats',
    'ModelVillageMixedAssignmentMatrix',
  );
  const blocks = Object.fromEntries(
    ['block1', 'block2', 'block3'].map((blockId) => [
      blockId,
      extractStringArray(
        block,
        blockId,
        'ModelVillageMixedAssignmentMatrix',
      ),
    ]),
  );

  assert(
    canonicalJson(personasAndSeats) === canonicalJson(EXPECTED_PERSONA_SEATS),
    'frozen persona/seat order drifted',
  );
  for (const blockId of Object.keys(EXPECTED_MATRIX)) {
    assert(
      canonicalJson(blocks[blockId]) === canonicalJson(EXPECTED_MATRIX[blockId]),
      `${blockId} adapter assignment drifted`,
    );
    for (const adapter of EXPECTED_ADAPTERS) {
      assert(
        blocks[blockId].filter((entry) => entry === adapter).length === 2,
        `${blockId} must allocate ${adapter} exactly twice`,
      );
    }
  }
  for (let index = 0; index < personasAndSeats.length; index += 1) {
    const adapters = Object.values(blocks).map((entries) => entries[index]);
    assert(
      canonicalJson([...adapters].sort()) === canonicalJson(EXPECTED_ADAPTERS),
      `${personasAndSeats[index]} must receive every adapter exactly once`,
    );
  }

  return {
    blocks,
    counterbalance:
      'each_persona_and_seat_receives_each_adapter_once_across_three_blocks',
    personasAndSeats,
  };
}

function buildWorldProjection(worldManifest, canonicalWorldHash) {
  const objects = worldManifest.map((entry) => [
    `  object "${entry.id}" {`,
    `    position: ${JSON.stringify(entry.position)}`,
    `    scale: ${JSON.stringify(entry.scale)}`,
    '  }',
  ].join('\n')).join('\n\n');
  return [
    '// Engine-admitted static projection derived from the canonical Model Village world.',
    `// canonicalWorldSha256: ${canonicalWorldHash}`,
    'composition "Model Village Canonical Twelve Object Lifecycle Projection" {',
    objects,
    '}',
    '',
  ].join('\n');
}

function stripEmitCalls(source) {
  let value = source;
  let removed = 0;
  while (true) {
    const match = /\bemit\s*\(/.exec(value);
    if (!match) break;
    const open = value.indexOf('(', match.index);
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let cursor = open; cursor < value.length; cursor += 1) {
      const character = value[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          end = cursor + 1;
          break;
        }
      }
    }
    assert(end > open, 'emit call is not balanced');
    const lineStart = value.lastIndexOf('\n', match.index) + 1;
    const prefix = value.slice(lineStart, match.index);
    const removeStart = /^\s*$/.test(prefix) ? lineStart : match.index;
    let removeEnd = end;
    while (value[removeEnd] === ' ' || value[removeEnd] === '\t') removeEnd += 1;
    if (value[removeEnd] === '\n') removeEnd += 1;
    value = value.slice(0, removeStart) + value.slice(removeEnd);
    removed += 1;
  }
  return { source: value, removed };
}

function indentBlock(source, spaces) {
  const prefix = ' '.repeat(spaces);
  return source
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}

function transformLifecycleAction(policySource, actionName) {
  const extracted = findBalancedBlock(
    policySource,
    new RegExp(`action\\s+${actionName}\\s*\\([^)]*\\)\\s*\\{`),
    `canonical action ${actionName}`,
  );
  let action = extracted.full.replaceAll(
    'ModelVillageExperimentRuntime.',
    'state.',
  );

  if (actionName === 'stage_resident') {
    action = replaceExactly(
      action,
      'if (!state.stagedResidentIds.includes(seat.resident_id)) {',
      'if (seat.resident_id != "") {',
      1,
      'stage_resident resident uniqueness projection',
    );
    action = replaceExactly(
      action,
      'if (!state.stagedSeatIds.includes(seat.seat_id)) {',
      'if (seat.seat_id != "") {',
      1,
      'stage_resident seat uniqueness projection',
    );
    action = replaceExactly(
      action,
      'state.stagedResidentIds.push(seat.resident_id)\n',
      '',
      1,
      'stage_resident resident array projection',
    );
    action = replaceExactly(
      action,
      'state.stagedSeatIds.push(seat.seat_id)\n',
      '',
      1,
      'stage_resident seat array projection',
    );
  }

  const stripped = stripEmitCalls(action);
  const closingBrace = stripped.source.lastIndexOf('}');
  assert(closingBrace > 0, `${actionName} projection lost its closing brace`);
  const returned = [
    stripped.source.slice(0, closingBrace).trimEnd(),
    '    return {',
    '      allowed: true,',
    '      emergencyStopState: state.emergencyStopState,',
    '      manifestValidated: state.manifestValidated,',
    `      outcome: "${actionName}_executed",`,
    '      phase: state.phase,',
    '      stagedResidentCount: state.stagedResidentCount,',
    '      worldMutationAllowed: state.worldMutationAllowed',
    '    }',
    stripped.source.slice(closingBrace),
  ].join('\n');
  return { emitCallsProjectedToLedger: stripped.removed, source: returned };
}

function buildBehaviorProjection(policySource, canonicalPolicyHash) {
  const normalized = normalizeSource(policySource);
  const stateBlock = findBalancedBlock(
    normalized,
    /state\s+ModelVillageExperimentRuntime\s*\{/,
    'ModelVillageExperimentRuntime',
  );
  let state = stateBlock.full.replace(
    'state ModelVillageExperimentRuntime',
    'state Runtime',
  );
  state = replaceExactly(
    state,
    'trustedManifestValidatorConfigured: false',
    'trustedManifestValidatorConfigured: true',
    1,
    'trusted validator configured fixture',
  );
  state = replaceExactly(
    state,
    'trustedManifestValidatorSourceHash: ""',
    `trustedManifestValidatorSourceHash: "${canonicalPolicyHash}"`,
    1,
    'trusted validator source fixture',
  );
  state = replaceExactly(
    state,
    'trustedManifestValidatorRegistryReceiptId: ""',
    `trustedManifestValidatorRegistryReceiptId: "${VALIDATOR_REGISTRY_RECEIPT_ID}"`,
    1,
    'trusted validator registry fixture',
  );

  const actions = MODEL_VILLAGE_CANONICAL_LIFECYCLE_ACTIONS.map(
    (actionName) => transformLifecycleAction(normalized, actionName),
  );
  const emitCallsProjectedToLedger = actions.reduce(
    (sum, entry) => sum + entry.emitCallsProjectedToLedger,
    0,
  );
  assert(
    emitCallsProjectedToLedger === 6,
    `canonical lifecycle projection expected 6 emit calls, observed ${emitCallsProjectedToLedger}`,
  );

  return {
    emitCallsProjectedToLedger,
    source: [
      '// Deterministic engine projection derived from canonical lifecycle actions.',
      `// canonicalPolicySha256: ${canonicalPolicyHash}`,
      '// emit() calls are represented by the HoloScript source-run receipt ledger.',
      'composition "ModelVillageCanonicalLifecycleProjection" {',
      indentBlock(state, 2),
      '',
      '  logic {',
      actions.map((entry) => indentBlock(entry.source, 4)).join('\n\n'),
      '  }',
      '}',
      '',
    ].join('\n'),
  };
}

function buildSeatBindings(matrix, blockId, runId, assignmentManifestHash) {
  return matrix.personasAndSeats.map((personaSeat, index) => {
    const [personaId, seatId] = personaSeat.split('@');
    return {
      adapter_alias: matrix.blocks[blockId][index],
      assignment_manifest_hash: assignmentManifestHash,
      persona_id: personaId,
      resident_id: `resident-${String(index + 1).padStart(2, '0')}`,
      run_id: runId,
      seat_id: seatId,
    };
  });
}

function validateSeatBindings(bindings, matrix, blockId) {
  assert(bindings.length === 6, `${blockId} must stage exactly six bindings`);
  assert(
    new Set(bindings.map((entry) => entry.resident_id)).size === 6,
    `${blockId} resident IDs must be unique`,
  );
  assert(
    new Set(bindings.map((entry) => entry.seat_id)).size === 6,
    `${blockId} seat IDs must be unique`,
  );
  bindings.forEach((binding, index) => {
    const expectedPersonaSeat = matrix.personasAndSeats[index];
    assert(
      `${binding.persona_id}@${binding.seat_id}` === expectedPersonaSeat,
      `${blockId} binding ${index + 1} persona/seat mismatch`,
    );
    assert(
      binding.resident_id === `resident-${String(index + 1).padStart(2, '0')}`,
      `${blockId} binding ${index + 1} resident mismatch`,
    );
    assert(
      binding.adapter_alias === matrix.blocks[blockId][index],
      `${blockId} binding ${index + 1} adapter mismatch`,
    );
  });
}

function buildBlockPlan({ blockId, blockNumber, matrix, policyHash }) {
  const runId = `mv-l12-${blockId}`;
  const assignmentManifestHash = digest({
    adapters: matrix.blocks[blockId],
    blockId,
    personasAndSeats: matrix.personasAndSeats,
  });
  const bindings = buildSeatBindings(
    matrix,
    blockId,
    runId,
    assignmentManifestHash,
  );
  validateSeatBindings(bindings, matrix, blockId);
  const manifest = {
    blinded_assignment_hash: assignmentManifestHash,
    condition: 'mixed',
    manifest_hash: '',
    receipt_id: `${runId}-manifest-receipt`,
    run_id: runId,
    seed_block: blockNumber,
  };
  manifest.manifest_hash = digest({
    ...manifest,
    manifest_hash: undefined,
  });
  const validationReceipt = {
    allowed: true,
    decision: 'allow',
    manifest_hash: manifest.manifest_hash,
    receipt_id: `${runId}-validation-receipt`,
    run_id: runId,
    signature_verified: true,
    validation_sequence: blockNumber,
    validator_authority_id: VALIDATOR_AUTHORITY_ID,
    validator_registry_receipt_id: VALIDATOR_REGISTRY_RECEIPT_ID,
    validator_source_hash: policyHash,
  };

  const schedule = [
    {
      args: { manifest, validationReceipt },
      entrypoint: 'register_run',
      kind: 'action',
      order: 0,
      phase: 'register',
      scheduleEntryId: `${runId}-register`,
      targetIds: ['ReceiptLedger'],
      tick: 0,
    },
    ...bindings.map((seat, index) => ({
      args: { seat },
      entrypoint: 'stage_resident',
      kind: 'action',
      order: index + 1,
      phase: 'stage_residents',
      scheduleEntryId: `${runId}-stage-${String(index + 1).padStart(2, '0')}`,
      targetIds: [`ResidentSeat${String(index + 1).padStart(2, '0')}`],
      tick: index + 1,
    })),
    {
      args: {},
      entrypoint: 'start_run',
      kind: 'action',
      order: 7,
      phase: 'start',
      scheduleEntryId: `${runId}-start`,
      targetIds: ['VillageCommons'],
      tick: 7,
    },
    {
      args: { reason: 'mv_l12_lifecycle_closure' },
      entrypoint: 'freeze_run',
      kind: 'action',
      order: 8,
      phase: 'stop',
      scheduleEntryId: `${runId}-stop`,
      targetIds: ['EmergencyStop'],
      tick: 8,
    },
    {
      args: {
        summaryReceipt: {
          receipt_chain_root: digest({
            assignmentManifestHash,
            blockId,
            lifecycle: 'register_stage_start_stop_end',
          }),
        },
      },
      entrypoint: 'close_run',
      kind: 'action',
      order: 9,
      phase: 'end',
      scheduleEntryId: `${runId}-end`,
      targetIds: ['ReceiptLedger'],
      tick: 9,
    },
  ];
  const expectedFinalState = {
    assignmentManifestHash,
    condition: 'mixed',
    emergencyStopState: 'triggered',
    manifestValidated: false,
    phase: 'closed',
    residentStagingOpen: false,
    runId,
    safetyDecision: 'deny',
    seedBlock: blockNumber,
    stagedResidentCount: 6,
    worldMutationAllowed: false,
  };
  const plan = [
    {
      clock: { endTick: 9, startTick: 0, step: 1 },
      expected: {
        actionCount: 10,
        finalPublicState: expectedFinalState,
        observationCount: 0,
        scheduleCount: 10,
      },
      kind: 'manifest',
      publicStateKeys: Object.keys(expectedFinalState),
      runId,
      schema: 'holoscript.headless-experiment-plan.v1',
      seed: `${runId}-seed`,
    },
    ...schedule,
  ];
  return {
    assignmentManifestHash,
    bindings,
    blockId,
    expectedFinalState,
    planSource:
      `export function main(): string { return '${JSON.stringify(plan)}' }\n`,
    runId,
    schedule,
  };
}

function resolveHoloScriptRoot(root) {
  const candidate = process.env.HOLOSCRIPT_ROOT
    ? path.resolve(process.env.HOLOSCRIPT_ROOT)
    : path.resolve(root, '..', 'HoloScript');
  const cliPath = path.join(candidate, 'packages', 'cli', 'dist', 'index.js');
  assert(
    existsSync(cliPath),
    `built HoloScript CLI is unavailable at ${candidate}`,
  );
  return { cliPath, root: candidate };
}

async function loadHoloScriptCli(root) {
  const resolved = resolveHoloScriptRoot(root);
  const cli = await import(pathToFileURL(resolved.cliPath).href);
  for (const exportName of [
    'runHeadlessExperimentSources',
    'verifyHeadlessExperimentSourceRunReceipt',
  ]) {
    assert(
      typeof cli[exportName] === 'function',
      `HoloScript CLI is missing ${exportName}`,
    );
  }
  return { cli, root: resolved.root };
}

function readSources(root) {
  return Object.fromEntries(
    Object.entries(MODEL_VILLAGE_CANONICAL_LIFECYCLE_SOURCES)
      .map(([key, relativePath]) => [
        key,
        normalizeSource(readFileSync(path.resolve(root, relativePath), 'utf8')),
      ]),
  );
}

function validateProductionLock(root) {
  const ancestry = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', MODEL_VILLAGE_PRODUCTION_LOCK_COMMIT, 'HEAD'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  assert(
    ancestry.status === 0,
    `production lock ${MODEL_VILLAGE_PRODUCTION_LOCK_COMMIT} is not an ancestor of HEAD`,
  );
  const head = spawnSync(
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  assert(head.status === 0, 'unable to resolve HoloLand HEAD');
  return {
    head: head.stdout.trim(),
    productionLockCommit: MODEL_VILLAGE_PRODUCTION_LOCK_COMMIT,
    productionLockIsAncestor: true,
  };
}

export function buildCanonicalLifecycleArtifacts(sources) {
  const sourceHashes = Object.fromEntries(
    Object.entries(sources).map(([key, value]) => [key, digest(value)]),
  );
  const worldManifest = extractCanonicalWorldManifest(sources.world);
  const matrix = extractCanonicalAdapterMatrix(sources.kernel);
  const worldProjection = buildWorldProjection(
    worldManifest,
    sourceHashes.world,
  );
  const behaviorProjection = buildBehaviorProjection(
    sources.policy,
    sourceHashes.policy,
  );
  const blockPlans = Object.keys(EXPECTED_MATRIX).map((blockId, index) => (
    buildBlockPlan({
      blockId,
      blockNumber: index + 1,
      matrix,
      policyHash: sourceHashes.policy,
    })
  ));
  return {
    behaviorProjection: behaviorProjection.source,
    blockPlans,
    matrix,
    projection: {
      behaviorSha256: digest(behaviorProjection.source),
      emitCallsProjectedToReceiptLedger:
        behaviorProjection.emitCallsProjectedToLedger,
      stageUniquenessBoundary:
        'host_prevalidated_exact_six_unique_resident_persona_seat_bindings',
      worldSha256: digest(worldProjection),
    },
    sourceHashes,
    worldManifest,
    worldProjection,
  };
}

async function executeBlock(cli, artifacts, blockPlan, observer) {
  const sources = {
    behaviorSource: artifacts.behaviorProjection,
    planSource: blockPlan.planSource,
    worldSource: artifacts.worldProjection,
  };
  const run = await cli.runHeadlessExperimentSources({
    ...sources,
    observer,
  });
  const verification = await cli.verifyHeadlessExperimentSourceRunReceipt(
    run.sourceRunReceipt,
    run.execution,
    sources,
  );
  assert(
    verification?.valid === true,
    `${blockPlan.blockId} source-run verification failed: ${canonicalJson(verification?.errors ?? [])}`,
  );
  return { run, verification };
}

/**
 * `providerCallsObserved` is a MEASUREMENT the caller took, never a default.
 * The runner passes the fence delta for this block's execution window; the
 * verifier passes the value stored in the receipt (already gated out-of-band
 * against the receipt-level fence observation). There is no literal zero left
 * on this path.
 */
function validateExecutedBlock(blockPlan, primary, replay, providerCallsObserved) {
  const execution = primary.run.execution;
  const finalSnapshot = execution.publicStateSnapshots.at(-1);
  const finalPublicState = finalSnapshot?.payload?.publicState;
  assert(
    canonicalJson(finalPublicState)
      === canonicalJson(blockPlan.expectedFinalState),
    `${blockPlan.blockId} final public state mismatch`,
  );
  assert(
    execution.scheduleLedger.length === 10
      && execution.actionLedger.length === 10
      && execution.observationLedger.length === 0
      && execution.publicStateSnapshots.length === 11,
    `${blockPlan.blockId} lifecycle execution counts mismatch`,
  );
  assert(
    canonicalJson(
      execution.scheduleLedger.map((entry) => entry.payload.entrypoint),
    ) === canonicalJson([
      'register_run',
      'stage_resident',
      'stage_resident',
      'stage_resident',
      'stage_resident',
      'stage_resident',
      'stage_resident',
      'start_run',
      'freeze_run',
      'close_run',
    ]),
    `${blockPlan.blockId} lifecycle action order mismatch`,
  );
  assert(
    primary.run.claimBoundary.providerCallsMade === 0
      && replay.run.claimBoundary.providerCallsMade === 0,
    `${blockPlan.blockId} unexpectedly reported provider calls`,
  );
  assert(
    primary.run.claimBoundary.fullHoloWorldProjectionClaimed === false
      && primary.run.claimBoundary.fullHsplusLanguageExecutionClaimed === false
      && primary.run.claimBoundary.worldRuntimeLifecycleExecuted === false,
    `${blockPlan.blockId} upstream bounded-engine claim boundary widened`,
  );
  assert(
    primary.run.execution.terminal.terminalCommitment
      === replay.run.execution.terminal.terminalCommitment,
    `${blockPlan.blockId} replay terminal commitment mismatch`,
  );
  assert(
    primary.run.observerProof?.equivalent === true
      && primary.run.observerProof?.observerIntroducedExperimentExecutionCount === 0,
    `${blockPlan.blockId} observer noninterference failed`,
  );
  assert(
    Number.isInteger(providerCallsObserved) && providerCallsObserved >= 0,
    `${blockPlan.blockId} provider-call count is UNMEASURED; a block that was `
    + 'not watched cannot report a zero',
  );
  return {
    actions: execution.actionLedger.length,
    finalPublicState,
    observations: execution.observationLedger.length,
    providerCalls: providerCallsObserved,
    publicStateSnapshots: execution.publicStateSnapshots.length,
    schedule: execution.scheduleLedger.length,
  };
}

function unsignedReceipt(receipt) {
  const value = structuredClone(receipt);
  delete value.receipt;
  return value;
}

export function verifyCanonicalLifecycleReceiptHash(receipt) {
  return Boolean(
    receipt?.receipt?.receiptHash
      && receipt.receipt.receiptHash === digest(unsignedReceipt(receipt)),
  );
}

export async function verifyCanonicalLifecycleReceipt(receipt, options = {}) {
  const errors = [];
  const moduleRoot = path.resolve(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
  const root = path.resolve(
    options.root ?? moduleRoot,
  );
  try {
    assert(
      receipt?.schema === MODEL_VILLAGE_CANONICAL_LIFECYCLE_SCHEMA,
      'canonical lifecycle receipt schema mismatch',
    );
    assert(
      verifyCanonicalLifecycleReceiptHash(receipt),
      'canonical lifecycle outer receipt hash mismatch',
    );
    const artifacts = buildCanonicalLifecycleArtifacts(readSources(root));
    const productionLock = validateProductionLock(
      path.resolve(options.productionLockRoot ?? moduleRoot),
    );
    assert(
      canonicalJson(receipt.sources.hashes) === canonicalJson(artifacts.sourceHashes),
      'canonical lifecycle source hashes mismatch',
    );
    assert(
      canonicalJson(receipt.world.objects) === canonicalJson(artifacts.worldManifest),
      'canonical lifecycle world manifest mismatch',
    );
    assert(
      receipt.world.projectionSha256 === artifacts.projection.worldSha256
        && receipt.policy.projectionSha256 === artifacts.projection.behaviorSha256,
      'canonical lifecycle projection hashes mismatch',
    );
    assert(
      receipt.productionLock.productionLockCommit
        === productionLock.productionLockCommit
        && receipt.productionLock.productionLockIsAncestor === true,
      'canonical lifecycle production lock mismatch',
    );
    assert(
      receipt.blocks.length === 3,
      'canonical lifecycle must contain three executed blocks',
    );
    // PROVIDER-CALL GATE, out-of-band with respect to the values it checks: an
    // UNMEASURED window, a counter below its own incident log, a misclassified
    // target, or any nonzero provider count fails here.
    const providerFenceFailures = verifyProviderCallObservation(
      receipt.providerFence,
      { label: 'canonical lifecycle receipt providerFence' },
    );
    assert(
      providerFenceFailures.length === 0,
      providerFenceFailures.join('; '),
    );
    assert(
      receipt.receipt.providerCallMeasurement === 'measured'
        && receipt.receipt.providerCallsMade
          === receipt.providerFence.providerFetchCallsObserved,
      'canonical lifecycle receipt provider-call summary does not equal the '
      + 'fence counter it projects',
    );
    assert(
      receipt.assertions.providerCallsMeasured === true,
      'canonical lifecycle provider-call assertion is UNMEASURED',
    );
    const summedBlockProviderCalls = receipt.blocks.reduce(
      (sum, block) => sum + (block?.counts?.providerCalls ?? Number.NaN),
      0,
    );
    assert(
      Number.isInteger(summedBlockProviderCalls)
        && summedBlockProviderCalls === receipt.assertions.providerCallsMade
        && summedBlockProviderCalls
          <= receipt.providerFence.providerFetchCallsObserved,
      'canonical lifecycle per-block provider-call deltas do not reconcile with '
      + 'the sealed fence observation that contains them',
    );
    const holoScript = await loadHoloScriptCli(root);
    for (let index = 0; index < artifacts.blockPlans.length; index += 1) {
      const blockPlan = artifacts.blockPlans[index];
      const block = receipt.blocks[index];
      assert(block.blockId === blockPlan.blockId, `${blockPlan.blockId} receipt order mismatch`);
      assert(
        canonicalJson(block.bindings) === canonicalJson(blockPlan.bindings),
        `${blockPlan.blockId} bindings mismatch`,
      );
      const verification = await holoScript.cli
        .verifyHeadlessExperimentSourceRunReceipt(
          block.sourceRunReceipt,
          block.executionReceipt,
          {
            behaviorSource: artifacts.behaviorProjection,
            planSource: blockPlan.planSource,
            worldSource: artifacts.worldProjection,
          },
        );
      assert(
        verification?.valid === true,
        `${blockPlan.blockId} stored source-run receipt failed verification`,
      );
      const replayVerification = await holoScript.cli
        .verifyHeadlessExperimentSourceRunReceipt(
          block.replay.sourceRunReceipt,
          block.replay.executionReceipt,
          {
            behaviorSource: artifacts.behaviorProjection,
            planSource: blockPlan.planSource,
            worldSource: artifacts.worldProjection,
          },
        );
      assert(
        replayVerification?.valid === true,
        `${blockPlan.blockId} stored replay receipt failed verification`,
      );
      const recomputedCounts = validateExecutedBlock(
        blockPlan,
        {
          run: {
            claimBoundary: block.sourceClaimBoundary,
            execution: block.executionReceipt,
            observerProof: block.observerProof,
            sourceRunReceipt: block.sourceRunReceipt,
          },
        },
        {
          run: {
            claimBoundary: block.replay.sourceClaimBoundary,
            execution: block.replay.executionReceipt,
            sourceRunReceipt: block.replay.sourceRunReceipt,
          },
        },
        // Carried from the receipt, not rebuilt from a constant. The value was
        // already reconciled against the sealed fence observation above, which
        // is where the provider-call claim is actually decided.
        block.counts?.providerCalls,
      );
      assert(
        canonicalJson(block.counts) === canonicalJson(recomputedCounts),
        `${blockPlan.blockId} stored counts mismatch`,
      );
      assert(
        canonicalJson(block.lifecycleSequence) === canonicalJson([
          'register_run',
          'stage_resident_x6',
          'start_run',
          'freeze_run',
          'close_run',
        ]),
        `${blockPlan.blockId} stored lifecycle sequence mismatch`,
      );
    }
    assert(
      receipt.claimBoundary.worldRuntimeLifecycleExecuted === true
        && receipt.claimBoundary.adapterPermutationExecutionClaimed === true
        && receipt.claimBoundary.canonicalTwelveObjectLifecycleExecuted === true
        && receipt.claimBoundary.fullHoloWorldExecutionClaimed === false
        && receipt.claimBoundary.fullHsplusLanguageExecutionClaimed === false
        && receipt.claimBoundary.liveModelProviderCallsClaimed === false
        && receipt.claimBoundary.productionValidatorTrustClaimed === false
        && receipt.claimBoundary.scientificOutcomeClaimed === false,
      'canonical lifecycle claim boundary mismatch',
    );
  } catch (error) {
    errors.push(error.message || String(error));
  }
  return { errors, valid: errors.length === 0 };
}

export async function runCanonicalModelVillageLifecycle(options = {}) {
  // Fence up before the HoloScript CLI is loaded, so the parser's own WASM
  // initialization is inside the measured window rather than ahead of it.
  const providerFence = installProviderCallFence();
  try {
    return await runCanonicalModelVillageLifecycleFenced(options, providerFence);
  } finally {
    providerFence.restore();
  }
}

async function runCanonicalModelVillageLifecycleFenced(options, providerFence) {
  const moduleRoot = path.resolve(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
  const root = path.resolve(
    options.root ?? moduleRoot,
  );
  const sources = readSources(root);
  const artifacts = buildCanonicalLifecycleArtifacts(sources);
  const productionLock = validateProductionLock(
    path.resolve(options.productionLockRoot ?? moduleRoot),
  );
  const holoScript = await loadHoloScriptCli(root);
  const blocks = [];

  for (const blockPlan of artifacts.blockPlans) {
    const blockFenceCursor = snapshotProviderFence(providerFence);
    const primary = await executeBlock(
      holoScript.cli,
      artifacts,
      blockPlan,
      'on',
    );
    const replay = await executeBlock(
      holoScript.cli,
      artifacts,
      blockPlan,
      'off',
    );
    const blockObservation = summarizeProviderCallFence(providerFence, {
      since: blockFenceCursor,
      window: `canonical-lifecycle-block:${blockPlan.blockId}`,
    });
    const blockObservationFailures = verifyProviderCallObservation(
      blockObservation,
      { label: `${blockPlan.blockId} provider-call window` },
    );
    assert(
      blockObservationFailures.length === 0,
      `canonical lifecycle provider-call measurement failed: `
      + `${blockObservationFailures.join('; ')}`,
    );
    const counts = validateExecutedBlock(
      blockPlan,
      primary,
      replay,
      blockObservation.providerFetchCallsObserved,
    );
    blocks.push({
      assignmentManifestHash: blockPlan.assignmentManifestHash,
      bindings: blockPlan.bindings,
      blockId: blockPlan.blockId,
      counts,
      executionReceipt: structuredClone(primary.run.execution),
      lifecycleSequence: [
        'register_run',
        'stage_resident_x6',
        'start_run',
        'freeze_run',
        'close_run',
      ],
      observerProof: structuredClone(primary.run.observerProof),
      planSha256: digest(blockPlan.planSource),
      replay: {
        executionReceipt: structuredClone(replay.run.execution),
        match: true,
        sourceRunCommitment:
          replay.run.sourceRunReceipt.sourceRunCommitment,
        sourceClaimBoundary: structuredClone(replay.run.claimBoundary),
        sourceRunReceipt: structuredClone(replay.run.sourceRunReceipt),
        terminalCommitment:
          replay.run.execution.terminal.terminalCommitment,
      },
      sourceClaimBoundary: structuredClone(primary.run.claimBoundary),
      sourceRunReceipt: structuredClone(primary.run.sourceRunReceipt),
    });
  }

  // SEAL THE MEASUREMENT: every block has executed, so this is the window the
  // receipt publishes.
  const providerObservation = summarizeProviderCallFence(providerFence, {
    window: 'canonical-lifecycle-execution-through-receipt-seal',
  });
  const providerObservationFailures = verifyProviderCallObservation(
    providerObservation,
    { label: 'canonical lifecycle provider-call fence' },
  );
  assert(
    providerObservationFailures.length === 0,
    `canonical lifecycle provider-call measurement failed: `
    + `${providerObservationFailures.join('; ')}`,
  );

  const assertions = {
    adapterMatrixExecutedAcrossThreeBlocks:
      blocks.length === 3
      && blocks.every((block) => block.counts.actions === 10),
    canonicalLifecycleOrderExecuted:
      blocks.every((block) => canonicalJson(block.lifecycleSequence)
        === canonicalJson([
          'register_run',
          'stage_resident_x6',
          'start_run',
          'freeze_run',
          'close_run',
        ])),
    canonicalSourcesHashBound:
      Object.values(artifacts.sourceHashes).every((hash) => SHA256_PATTERN.test(hash)),
    canonicalTwelveObjectProjectionExecuted:
      artifacts.worldManifest.length === 12,
    exactResidentPersonaSeatBindingsStaged:
      blocks.every((block) => block.bindings.length === 6),
    failClosedStopAndEndExecuted:
      blocks.every((block) => (
        block.counts.finalPublicState.emergencyStopState === 'triggered'
        && block.counts.finalPublicState.phase === 'closed'
        && block.counts.finalPublicState.worldMutationAllowed === false
      )),
    observerNoninterferenceVerified:
      blocks.every((block) => (
        block.observerProof.equivalent === true
        && block.observerProof.observerIntroducedExperimentExecutionCount === 0
      )),
    providerCallsMade: blocks.reduce(
      (sum, block) => sum + block.counts.providerCalls,
      0,
    ),
    providerCallsMeasured: providerObservation.measured === true,
    replayVerified:
      blocks.every((block) => block.replay.match === true),
    productionLockIsAncestor:
      productionLock.productionLockIsAncestor === true,
  };
  assert(
    assertions.providerCallsMade === 0
      && Object.entries(assertions)
        .filter(([name]) => name !== 'providerCallsMade')
        .every(([, passed]) => passed === true),
    'canonical lifecycle closure assertions failed',
  );

  const unsigned = {
    assertions,
    blocks,
    // Hash-bound observation. The per-block deltas above are slices of it, and
    // receipt.providerCallsMade below is a projection of it.
    providerFence: providerObservation,
    claimBoundary: {
      adapterPermutationExecutionClaimed: true,
      canonicalLifecycleSourceProjectionExecuted: true,
      canonicalTwelveObjectLifecycleExecuted: true,
      fullHoloWorldExecutionClaimed: false,
      fullHsLanguageExecutionClaimed: false,
      fullHsplusLanguageExecutionClaimed: false,
      liveModelProviderCallsClaimed: false,
      nativeHoloLifecycleExecutionClaimed: false,
      productionValidatorTrustClaimed: false,
      scientificOutcomeClaimed: false,
      stageUniquenessBoundary:
        artifacts.projection.stageUniquenessBoundary,
      validatorTrust:
        'ephemeral_engineering_fixture_hash_pinned_to_canonical_policy',
      worldRuntimeLifecycleExecuted: true,
    },
    generatedAt: new Date().toISOString(),
    matrix: {
      ...artifacts.matrix,
      matrixSha256: digest(artifacts.matrix),
    },
    policy: {
      canonicalActions: MODEL_VILLAGE_CANONICAL_LIFECYCLE_ACTIONS,
      emitCallsProjectedToReceiptLedger:
        artifacts.projection.emitCallsProjectedToReceiptLedger,
      projectionSha256: artifacts.projection.behaviorSha256,
    },
    productionLock,
    schema: MODEL_VILLAGE_CANONICAL_LIFECYCLE_SCHEMA,
    sources: {
      hashes: artifacts.sourceHashes,
      paths: MODEL_VILLAGE_CANONICAL_LIFECYCLE_SOURCES,
    },
    status: 'pass',
    world: {
      objectCount: artifacts.worldManifest.length,
      objects: artifacts.worldManifest,
      projectionSha256: artifacts.projection.worldSha256,
    },
  };
  const result = {
    ...unsigned,
    receipt: {
      providerCallMeasurement: providerObservation.measured
        ? 'measured'
        : 'unmeasured',
      providerCallsMade: providerObservation.providerFetchCallsObserved,
      rawProviderCredentialsIncluded: false,
      receiptHash: digest(unsigned),
    },
  };
  const verification = await verifyCanonicalLifecycleReceipt(result, {
    productionLockRoot: options.productionLockRoot ?? moduleRoot,
    root,
  });
  assert(
    verification.valid,
    `canonical lifecycle self-verification failed: ${verification.errors.join('; ')}`,
  );
  return result;
}
