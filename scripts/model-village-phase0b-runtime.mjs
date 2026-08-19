/* global Buffer, process, structuredClone */

import { spawnSync } from 'node:child_process';
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { extractCanonicalWorldManifest } from './model-village-canonical-lifecycle.mjs';
import {
  installProviderCallFence,
  snapshotProviderFence,
  summarizeProviderCallFence,
  unmeasuredProviderCallObservation,
  verifyProviderCallObservation,
} from './model-village-provider-call-fence.mjs';

// ---------------------------------------------------------------------------
// PROVIDER-CALL MEASUREMENT — the one number on this lane that must never be a
// literal.
//
// This tracer used to publish `providerCalls: 0` as a hardcoded constant in
// three places, and verifyPhase0BReceipt "verified" it by comparing against the
// same constant. Nothing on the path intercepted fetch, so a REAL provider call
// during the tracer would not have moved the number: the claim was
// unfalsifiable by construction.
//
// It is now MEASURED. runPhase0BEngineeringTracer installs the shared counting
// fence (./model-village-provider-call-fence.mjs — the same implementation
// MV-B6's conductor is gated on) over globalThis.fetch for the whole run and
// publishes the fence's OWN counters as `runtime.providerFence`, with a
// sub-window delta for the fresh replay as `replay.providerFence`.
// `runtime.providerCalls`, `replay.providerCalls` and
// `receipt.providerCallsMadeByTracer` are now projections of those counters and
// are cross-bound to them by the verifier.
//
// Two honest limits, stated rather than buried:
//  - The window closes when the receipt is SEALED. verifyPhase0BReceipt then
//    re-executes the source runs to check them; those fetches are outside the
//    published window by construction (a receipt cannot contain a count taken
//    after its own hash). The checker's out-of-band outer fence is what covers
//    that span.
//  - The fence covers globalThis.fetch only. A pre-fence captured reference, a
//    raw node:http/https socket, or a child process is out of scope — which is
//    exactly why check-hololand-model-village-experiment.mjs installs a SECOND,
//    EARLIER fence around this one and gates on it independently.
// ---------------------------------------------------------------------------

export const PHASE0B_RECEIPT_SCHEMA =
  'hololand.model-village-phase0b-runtime-bridge.v3';
export const PHASE0B_STATE_SCHEMA =
  'hololand.model-village-phase0b-persistent-state.v1';
export const PHASE0B_VALIDATOR_SCHEMA =
  'hololand.model-village-phase0b-trusted-validator.v1';
export const PHASE0B_VALIDATOR_RECEIPT_SCHEMA =
  'hololand.model-village-phase0b-validator-receipt.v1';
export const PHASE0B_OBSERVER_PROJECTION_SCHEMA =
  'hololand.model-village.phase0b-observer-projection.v2';

const SOURCE_RUN_SCHEMA = 'holoscript.headless-experiment-source-run.v4';
const INNER_RUN_SCHEMA = 'holoscript.headless-experiment-run.v1';
const OBSERVER_PROOF_SCHEMA = 'holoscript.headless-observer-noninterference.v2';
const OBSERVER_PROOF_KEYS = Object.freeze([
  'canonicalPayloadEqual',
  'equivalent',
  'isolation',
  'liveSchedulingNoninterferenceClaimed',
  'mode',
  'observedSealedExecutionCount',
  'observedTerminalCommitment',
  'observerExecutionCount',
  'observerIntroducedExperimentExecutionCount',
  'observerProjection',
  'observerProjectionHash',
  'postObserverCanonicalFieldsHash',
  'postObserverCanonicalPayloadHash',
  'preObserverCanonicalFieldsHash',
  'preObserverCanonicalPayloadHash',
  'schema',
  'sevenFieldsEqual',
]);
const OBSERVER_PROJECTION_KEYS = Object.freeze([
  'canonicalFields',
  'runId',
  'schema',
  'sourceReceiptSchema',
  'terminalCommitment',
]);
const VALIDATOR_DOMAIN = 'hololand:model-village:phase0b:trusted-validator:v1';
const GENESIS_RECEIPT_HASH = '0'.repeat(64);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const PHASE0B_OBSERVER_CANONICAL_FIELDS = Object.freeze([
  'canonicalSceneHash',
  'canonicalPoseHash',
  'logicalClockHash',
  'publicStateHash',
  'executedScheduleHash',
  'residentObservationHash',
  'actionReceiptRoot',
]);

export const PHASE0B_SOURCE_PATHS = Object.freeze({
  world: 'source/proofs/model-village-phase0b-world.holo',
  behavior: 'source/proofs/model-village-phase0b-behavior.hsplus',
  plan: 'source/proofs/model-village-phase0b-plan.hs',
  stopPlan: 'source/proofs/model-village-phase0b-stop-plan.hs',
  manifests: 'source/proofs/model-village-phase1-manifests.hs',
  visibleWorld: 'source/layers/vr/frontier/model-village/model-village.holo',
});

const MANIFEST_BUNDLE_KEYS = [
  'bundleId',
  'canonicalization',
  'challengeOrder',
  'frozenBeforeFirstTurn',
  'hashAlgorithm',
  'metricSpecId',
  'sourceIsCanonical',
  'type',
  'version',
];
const CHALLENGE_KEYS = [
  'challengeId',
  'deadlineTick',
  'denominatorRule',
  'eligibilityFrozenBeforeTreatment',
  'initialStateId',
  'initialStatePredicate',
  'minimumDistinctResidentContributors',
  'openTick',
  'permittedActionTypes',
  'runtimeInvalidDisposition',
  'successPredicate',
  'treatmentMayChangeEligibility',
  'type',
];
const METRIC_SPEC_KEYS = [
  'acceptedActionTypeDiversityFormula',
  'capturedResponseReplaySuccessFormula',
  'diagnosticsExcludedFromBehavioralOutcomes',
  'interactionDominanceFormula',
  'metricSpecId',
  'primaryDenominator',
  'primaryFormula',
  'primaryMetricId',
  'primaryNumerator',
  'receiptCompletenessFormula',
  'reciprocityRateFormula',
  'routeContaminationCountFormula',
  'safetyBlockRateFormula',
  'type',
  'validActionRateFormula',
  'zeroDenominatorRule',
];
const CAPTURED_RESPONSE_KEYS = [
  'adapterAlias',
  'parsedProposal',
  'residentId',
  'responseId',
  'responseText',
  'type',
];
const RUN_MANIFEST_KEYS = [
  'actions',
  'capturedResponses',
  'challengeManifestHash',
  'emergencyStop',
  'expectedFinalState',
  'metricSpecHash',
  'runId',
  'schema',
  'sources',
  'validatorPolicyVersion',
];
const RUN_SOURCE_KEYS = [
  'behaviorSourceHash',
  'manifestSourceHash',
  'planExecutionSourceHash',
  'planTemplateSourceHash',
  'stopPlanSourceHash',
  'visibleWorldSourceHash',
  'worldSourceHash',
];
const SIGNED_ACTION_KEYS = [
  'args',
  'authorization',
  'entrypoint',
  'expectedAllowed',
  'expectedOutcome',
  'scheduleEntryId',
  'targetIds',
];
const AUTHORIZATION_KEYS = [
  'decisionReceiptId',
  'nonce',
  'safetyReceiptId',
  'sequence',
  'turnOpportunityId',
];
const ACTION_ARGUMENT_KEYS = [
  'capturedResponseHash',
  'challengeManifestHash',
  'metricSpecHash',
  'parsedProposal',
  'residentId',
];
const STOP_BINDING_KEYS = [
  'args',
  'authorization',
  'entrypoint',
  'expectedAllowed',
  'expectedFinalState',
  'expectedOutcome',
  'scheduleEntryId',
  'targetIds',
];

function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function canonicalize(value, label = '$') {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalize(entry, `${label}[${index}]`));
  }
  if (typeof value === 'object') {
    const output = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        throw new Error(`${label}.${key} is forbidden in canonical JSON`);
      }
      const entry = value[key];
      if (entry === undefined) {
        throw new Error(`${label}.${key} is undefined`);
      }
      output[key] = canonicalize(entry, `${label}.${key}`);
    }
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`${label} is not a finite number`);
  }
  if (!['string', 'number', 'boolean'].includes(typeof value)) {
    throw new Error(`${label} has unsupported canonical JSON type ${typeof value}`);
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalDigest(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function sourceDigest(value) {
  return sha256(Buffer.from(normalizeSource(value), 'utf8'));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    const missing = expected.filter((key) => !actual.includes(key));
    const unexpected = actual.filter((key) => !expected.includes(key));
    throw new Error(
      `${label} keys differ; missing=${canonicalJson(missing)} `
      + `unexpected=${canonicalJson(unexpected)}`,
    );
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be lowercase sha256 hex`);
  }
}

function readSource(root, relativePath) {
  return normalizeSource(readFileSync(path.resolve(root, relativePath), 'utf8'));
}

function validateCanonicalTwelveObjectProjection(visibleWorld, boundedWorld) {
  const canonical = extractCanonicalWorldManifest(visibleWorld);
  const bounded = extractCanonicalWorldManifest(boundedWorld);
  if (canonicalJson(canonical) !== canonicalJson(bounded)) {
    throw new Error(
      'Phase 0B twelve-object projection differs from the canonical world',
    );
  }
  return {
    boundedWorldSourceHash: sourceDigest(boundedWorld),
    exactIdsAndTransformsMatch: true,
    objectCount: canonical.length,
    objectIds: canonical.map((entry) => entry.id),
    transformManifestHash: canonicalDigest(canonical),
    visibleWorldSourceHash: sourceDigest(visibleWorld),
  };
}

function resolveHoloScriptRoot(root) {
  const candidate = process.env.HOLOSCRIPT_ROOT
    ? path.resolve(process.env.HOLOSCRIPT_ROOT)
    : path.resolve(root, '..', 'HoloScript');
  const cliPath = path.join(candidate, 'packages', 'cli', 'dist', 'index.js');
  const corePath = path.join(candidate, 'packages', 'core', 'dist', 'index.js');
  if (!existsSync(cliPath) || !existsSync(corePath)) {
    throw new Error(
      `HoloScript CLI/core build is unavailable at ${candidate}; `
      + 'set HOLOSCRIPT_ROOT to the built HoloScript repository',
    );
  }
  return { root: candidate, cliPath, corePath };
}

async function loadHoloScript(root) {
  const resolved = resolveHoloScriptRoot(root);
  // Keep these imports sequential. The core's CJS/ESM bridge and the CLI both
  // reach jose; concurrent first-loads can trip Node's ESM require assertion.
  const cli = await import(pathToFileURL(resolved.cliPath).href);
  const core = await import(pathToFileURL(resolved.corePath).href);
  for (const exportName of [
    'runHeadlessExperimentSources',
    'verifyHeadlessExperimentSourceRunReceipt',
  ]) {
    if (typeof cli[exportName] !== 'function') {
      throw new Error(`HoloScript CLI is missing ${exportName}`);
    }
  }
  if (typeof core.HoloScriptCodeParser !== 'function') {
    throw new Error('HoloScript core is missing HoloScriptCodeParser');
  }
  return { cli, core, root: resolved.root };
}

function scanObjectBlocks(source) {
  const blocks = [];
  const pattern = /\bobject\s+"([^"]+)"\s*\{/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    let cursor = pattern.lastIndex;
    let depth = 1;
    let inString = false;
    let escaped = false;
    let lineComment = false;
    for (; cursor < source.length && depth > 0; cursor += 1) {
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
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
    }
    if (depth !== 0) throw new Error(`Manifest object ${match[1]} is unclosed`);
    blocks.push({
      name: match[1],
      body: source.slice(pattern.lastIndex, cursor - 1),
    });
    pattern.lastIndex = cursor;
  }
  return blocks;
}

function assertNoDuplicateManifestProperties(source) {
  const blocks = scanObjectBlocks(source);
  for (const block of blocks) {
    const seen = new Set();
    for (const line of block.body.split('\n')) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (!match) continue;
      if (seen.has(match[1])) {
        throw new Error(
          `Manifest object ${block.name} duplicates property ${match[1]}`,
        );
      }
      seen.add(match[1]);
    }
  }
  return blocks.map((block) => block.name);
}

function expectedProposal(response) {
  if (response.action === 'contribute_water') {
    return `${response.action}:${response.target}:${response.amount}`;
  }
  return `${response.action}:${response.target}`;
}

function manifestNodeMap(parseResult, source) {
  if (
    !parseResult?.success
    || !Array.isArray(parseResult.ast)
    || (parseResult.errors?.length ?? 0) > 0
  ) {
    throw new Error(
      `Phase 1 manifests failed HoloScript parsing: `
      + `${canonicalJson(parseResult?.errors ?? [])}`,
    );
  }
  const sourceNames = assertNoDuplicateManifestProperties(source);
  const parsedNames = parseResult.ast.map((node) => node.name);
  if (
    new Set(sourceNames).size !== sourceNames.length
    || new Set(parsedNames).size !== parsedNames.length
    || canonicalJson(sourceNames) !== canonicalJson(parsedNames)
  ) {
    throw new Error('Phase 1 manifest source/AST object identities differ');
  }
  return new Map(parseResult.ast.map((node) => [node.name, node.properties]));
}

export function instantiatePhase1Manifests({ source, core }) {
  const parser = new core.HoloScriptCodeParser();
  const nodes = manifestNodeMap(parser.parse(source), source);
  const expectedNames = [
    'ModelVillagePhase1ManifestBundle',
    'ModelVillagePhase1CommonsWaterShortage',
    'ModelVillagePhase1BridgeRepair',
    'ModelVillagePhase1HarvestDistribution',
    'ModelVillagePhase1MetricSpec',
    'ModelVillagePhase0BCapturedResponse01',
    'ModelVillagePhase0BCapturedResponse02',
  ];
  if (canonicalJson([...nodes.keys()]) !== canonicalJson(expectedNames)) {
    throw new Error('Phase 1 manifest object set/order is not canonical');
  }

  const bundle = structuredClone(nodes.get(expectedNames[0]));
  assertExactKeys(bundle, MANIFEST_BUNDLE_KEYS, 'phase1 manifest bundle');
  if (
    bundle.type !== 'phase1_manifest_bundle'
    || bundle.hashAlgorithm !== 'sha256'
    || bundle.canonicalization !== 'canonical_json_sorted_keys'
    || bundle.frozenBeforeFirstTurn !== true
    || bundle.sourceIsCanonical !== true
  ) {
    throw new Error('Phase 1 manifest bundle identity/freeze policy is invalid');
  }

  const challenges = expectedNames.slice(1, 4).map((name) => {
    const challenge = structuredClone(nodes.get(name));
    assertExactKeys(challenge, CHALLENGE_KEYS, `challenge ${name}`);
    if (
      challenge.type !== 'phase1_challenge_definition'
      || challenge.eligibilityFrozenBeforeTreatment !== true
      || challenge.treatmentMayChangeEligibility !== false
      || challenge.runtimeInvalidDisposition
        !== 'mark_run_contaminated_without_removing_denominator'
      || challenge.denominatorRule
        !== 'retain_predeclared_eligible_challenge_in_denominator'
      || !Number.isInteger(challenge.openTick)
      || !Number.isInteger(challenge.deadlineTick)
      || challenge.deadlineTick <= challenge.openTick
      || !Number.isInteger(challenge.minimumDistinctResidentContributors)
      || challenge.minimumDistinctResidentContributors < 2
      || !Array.isArray(challenge.permittedActionTypes)
      || challenge.permittedActionTypes.length < 1
    ) {
      throw new Error(`Challenge ${challenge.challengeId} is not frozen/valid`);
    }
    return challenge;
  });
  if (
    canonicalJson(challenges.map((entry) => entry.challengeId))
    !== canonicalJson(bundle.challengeOrder)
  ) {
    throw new Error('Phase 1 challengeOrder does not match challenge declarations');
  }

  const metricSpec = structuredClone(nodes.get(expectedNames[4]));
  assertExactKeys(metricSpec, METRIC_SPEC_KEYS, 'phase1 metric spec');
  if (
    metricSpec.type !== 'phase1_metric_spec'
    || metricSpec.metricSpecId !== bundle.metricSpecId
    || metricSpec.zeroDenominatorRule !== 'missing_not_zero'
    || canonicalJson(metricSpec.diagnosticsExcludedFromBehavioralOutcomes)
      !== canonicalJson(['tokens', 'latency', 'cost'])
  ) {
    throw new Error('Phase 1 metric specification identity/policy is invalid');
  }

  const capturedResponses = expectedNames.slice(5).map((name) => {
    const fixture = structuredClone(nodes.get(name));
    assertExactKeys(fixture, CAPTURED_RESPONSE_KEYS, `captured response ${name}`);
    if (fixture.type !== 'phase0b_captured_response_fixture') {
      throw new Error(`${name} has the wrong fixture type`);
    }
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(fixture.responseText);
    } catch (error) {
      throw new Error(`${name} responseText is not strict JSON: ${error.message}`);
    }
    if (canonicalJson(parsedResponse) !== fixture.responseText) {
      throw new Error(`${name} responseText is not canonical JSON`);
    }
    if (expectedProposal(parsedResponse) !== fixture.parsedProposal) {
      throw new Error(`${name} parsedProposal does not match responseText`);
    }
    return {
      adapterAlias: fixture.adapterAlias,
      parsedProposal: fixture.parsedProposal,
      residentId: fixture.residentId,
      responseHash: sourceDigest(fixture.responseText),
      responseId: fixture.responseId,
    };
  });
  if (
    canonicalJson(capturedResponses.map((entry) => entry.residentId))
    !== canonicalJson(['resident-01', 'resident-02'])
    || new Set(capturedResponses.map((entry) => entry.responseHash)).size !== 2
  ) {
    throw new Error('Captured-response fixtures are not two distinct residents');
  }

  const challengeManifest = {
    bundle,
    challenges,
    schema: 'hololand.model-village-phase1-challenge-manifest.v1',
  };
  return deepFreeze({
    bundle,
    capturedResponses,
    challengeManifest,
    challengeManifestHash: canonicalDigest(challengeManifest),
    metricSpec,
    metricSpecHash: canonicalDigest(metricSpec),
    sourceHash: sourceDigest(source),
  });
}

function replacePlaceholder(source, placeholder, value, expectedOccurrences = 1) {
  const occurrences = source.split(placeholder).length - 1;
  if (occurrences !== expectedOccurrences) {
    throw new Error(
      `${placeholder} must occur exactly ${expectedOccurrences} time(s); `
      + `observed ${occurrences}`,
    );
  }
  return source.replaceAll(placeholder, value);
}

function hydratePlanSource(template, manifests) {
  let hydrated = template;
  hydrated = replacePlaceholder(
    hydrated,
    '__CAPTURED_RESPONSE_HASH_01__',
    manifests.capturedResponses[0].responseHash,
  );
  hydrated = replacePlaceholder(
    hydrated,
    '__CAPTURED_RESPONSE_HASH_02__',
    manifests.capturedResponses[1].responseHash,
  );
  hydrated = replacePlaceholder(
    hydrated,
    '__CHALLENGE_MANIFEST_HASH__',
    manifests.challengeManifestHash,
    2,
  );
  hydrated = replacePlaceholder(
    hydrated,
    '__METRIC_SPEC_HASH__',
    manifests.metricSpecHash,
    2,
  );
  if (/__[A-Z0-9_]+__/.test(hydrated)) {
    throw new Error('Phase 0B plan contains an unbound placeholder');
  }
  return hydrated;
}

function parsePlanSource(source, label) {
  const match = source.match(
    /export\s+function\s+main\(\):\s*string\s*\{\s*return\s+'([^']*)'\s*\}/,
  );
  if (!match) throw new Error(`${label} must export one static JSON plan string`);
  let plan;
  try {
    plan = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(plan) || plan.length < 2 || plan[0]?.kind !== 'manifest') {
    throw new Error(`${label} is not a headless experiment plan`);
  }
  return plan;
}

function signedActionFromPlan(entry) {
  const expected = entry.entrypoint === 'contribute_water'
    ? { allowed: true, outcome: 'public_water_units_increased_by_1' }
    : { allowed: false, outcome: 'blocked_without_world_mutation' };
  assertExactKeys(entry.args, ACTION_ARGUMENT_KEYS, `${entry.scheduleEntryId}.args`);
  assertExactKeys(
    entry.authorization,
    AUTHORIZATION_KEYS,
    `${entry.scheduleEntryId}.authorization`,
  );
  for (const field of [
    'capturedResponseHash',
    'challengeManifestHash',
    'metricSpecHash',
  ]) {
    assertSha256(entry.args[field], `${entry.scheduleEntryId}.args.${field}`);
  }
  return {
    args: structuredClone(entry.args),
    authorization: structuredClone(entry.authorization),
    entrypoint: entry.entrypoint,
    expectedAllowed: expected.allowed,
    expectedOutcome: expected.outcome,
    scheduleEntryId: entry.scheduleEntryId,
    targetIds: structuredClone(entry.targetIds),
  };
}

function buildRunManifest({
  sources,
  manifests,
  plan,
  stopPlan,
}) {
  const planManifest = plan[0];
  const planActions = plan.filter((entry) => entry.kind === 'action');
  if (
    planManifest.schema !== 'holoscript.headless-experiment-plan.v1'
    || planManifest.runId !== 'mv-phase0b-tracer-001'
    || planActions.length !== 2
    || plan.filter((entry) => entry.kind === 'observation').length !== 6
  ) {
    throw new Error('Phase 0B tracer plan identity/counts are invalid');
  }
  const actions = planActions.map(signedActionFromPlan);
  if (
    canonicalJson(actions.map((entry) => entry.authorization.sequence))
      !== canonicalJson([0, 1])
    || new Set(actions.map((entry) => entry.authorization.nonce)).size !== 2
  ) {
    throw new Error('Phase 0B action authorizations are not contiguous/unique');
  }
  for (let index = 0; index < actions.length; index += 1) {
    const fixture = manifests.capturedResponses[index];
    const action = actions[index];
    if (
      action.args.capturedResponseHash !== fixture.responseHash
      || action.args.challengeManifestHash !== manifests.challengeManifestHash
      || action.args.metricSpecHash !== manifests.metricSpecHash
      || action.args.parsedProposal !== fixture.parsedProposal
      || action.args.residentId !== fixture.residentId
    ) {
      throw new Error(`Plan action ${action.scheduleEntryId} is not manifest-bound`);
    }
  }

  const stopManifest = stopPlan[0];
  const stopAction = stopPlan[1];
  if (
    stopPlan.length !== 2
    || stopManifest.runId !== 'mv-phase0b-stop-001'
    || stopAction.entrypoint !== 'freeze_run'
    || canonicalJson(stopAction.targetIds) !== canonicalJson(['EmergencyStop'])
  ) {
    throw new Error('Phase 0B emergency-stop plan identity is invalid');
  }
  assertExactKeys(
    stopAction.authorization,
    AUTHORIZATION_KEYS,
    'emergencyStop.authorization',
  );

  return deepFreeze({
    actions,
    capturedResponses: manifests.capturedResponses,
    challengeManifestHash: manifests.challengeManifestHash,
    emergencyStop: {
      args: structuredClone(stopAction.args),
      authorization: structuredClone(stopAction.authorization),
      entrypoint: stopAction.entrypoint,
      expectedAllowed: true,
      expectedFinalState: structuredClone(stopManifest.expected.finalPublicState),
      expectedOutcome: 'run_frozen',
      scheduleEntryId: stopAction.scheduleEntryId,
      targetIds: structuredClone(stopAction.targetIds),
    },
    expectedFinalState: structuredClone(planManifest.expected.finalPublicState),
    metricSpecHash: manifests.metricSpecHash,
    runId: planManifest.runId,
    schema: 'hololand.model-village-phase0b-run-manifest.v1',
    sources: {
      behaviorSourceHash: sourceDigest(sources.behavior),
      manifestSourceHash: manifests.sourceHash,
      planExecutionSourceHash: sourceDigest(sources.plan),
      planTemplateSourceHash: sourceDigest(sources.planTemplate),
      stopPlanSourceHash: sourceDigest(sources.stopPlan),
      visibleWorldSourceHash: sourceDigest(sources.visibleWorld),
      worldSourceHash: sourceDigest(sources.world),
    },
    validatorPolicyVersion: 'runtime-injected-ed25519-v1',
  });
}

function assertRunManifest(manifest) {
  assertExactKeys(manifest, RUN_MANIFEST_KEYS, 'validator run manifest');
  if (
    manifest.schema !== 'hololand.model-village-phase0b-run-manifest.v1'
    || manifest.validatorPolicyVersion !== 'runtime-injected-ed25519-v1'
    || manifest.runId !== 'mv-phase0b-tracer-001'
  ) {
    throw new Error('Validator run manifest identity is invalid');
  }
  assertExactKeys(manifest.sources, RUN_SOURCE_KEYS, 'validator sources');
  for (const [key, value] of Object.entries(manifest.sources)) {
    assertSha256(value, `validator sources.${key}`);
  }
  assertSha256(manifest.challengeManifestHash, 'challengeManifestHash');
  assertSha256(manifest.metricSpecHash, 'metricSpecHash');
  if (!Array.isArray(manifest.actions) || manifest.actions.length !== 2) {
    throw new Error('Validator run manifest must contain two actions');
  }
  manifest.actions.forEach((action, index) => {
    assertExactKeys(action, SIGNED_ACTION_KEYS, `validator action ${index}`);
    assertExactKeys(action.args, ACTION_ARGUMENT_KEYS, `validator action ${index}.args`);
    assertExactKeys(
      action.authorization,
      AUTHORIZATION_KEYS,
      `validator action ${index}.authorization`,
    );
    if (action.authorization.sequence !== index) {
      throw new Error(`Validator action ${index} sequence is not contiguous`);
    }
  });
  if (
    !Array.isArray(manifest.capturedResponses)
    || manifest.capturedResponses.length !== 2
  ) {
    throw new Error('Validator manifest capturedResponses must contain two fixtures');
  }
  manifest.capturedResponses.forEach((fixture, index) => {
    assertExactKeys(
      fixture,
      ['adapterAlias', 'parsedProposal', 'residentId', 'responseHash', 'responseId'],
      `validator captured response ${index}`,
    );
    assertSha256(fixture.responseHash, `capturedResponses[${index}].responseHash`);
  });
  assertExactKeys(manifest.emergencyStop, STOP_BINDING_KEYS, 'emergencyStop');
}

function validatorSigningPayload(configHash, manifestHash) {
  return {
    configHash,
    domain: VALIDATOR_DOMAIN,
    manifestHash,
  };
}

export function createRuntimeInjectedValidatorFixture(options = {}) {
  const {
    publicKey,
    privateKey,
  } = options.keyPair ?? generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const config = deepFreeze({
    algorithm: 'Ed25519',
    authorityId: options.authorityId ?? 'model-village-trusted-validator-001',
    immutable: true,
    injectionOrigin: 'host_process_boot_argument',
    keyCustody:
      options.keyCustody ?? 'ephemeral_engineering_fixture',
    publicKeyFingerprint: sourceDigest(publicKeyPem),
    publicKeyPem,
    registryReceiptId:
      options.registryReceiptId ?? 'model-village-validator-registry-receipt-001',
    schema: PHASE0B_VALIDATOR_SCHEMA,
    validatorSourceHash:
      options.validatorSourceHash ?? sourceDigest(readFileSync(fileURLToPath(import.meta.url))),
  });
  const configHash = canonicalDigest(config);

  return Object.freeze({
    config,
    configHash,
    issue(manifest) {
      assertRunManifest(manifest);
      const manifestSnapshot = structuredClone(manifest);
      const manifestHash = canonicalDigest(manifestSnapshot);
      const payload = validatorSigningPayload(configHash, manifestHash);
      return deepFreeze({
        config: structuredClone(config),
        configHash,
        manifest: manifestSnapshot,
        manifestHash,
        schema: PHASE0B_VALIDATOR_RECEIPT_SCHEMA,
        signatureBase64: sign(
          null,
          Buffer.from(canonicalJson(payload), 'utf8'),
          privateKey,
        ).toString('base64'),
        signedPayloadHash: canonicalDigest(payload),
      });
    },
  });
}

export function verifyRuntimeInjectedValidator(receipt, expectedPins = {}) {
  const errors = [];
  try {
    assertExactKeys(
      receipt,
      [
        'config',
        'configHash',
        'manifest',
        'manifestHash',
        'schema',
        'signatureBase64',
        'signedPayloadHash',
      ],
      'validator receipt',
    );
    if (receipt.schema !== PHASE0B_VALIDATOR_RECEIPT_SCHEMA) {
      throw new Error('Validator receipt schema mismatch');
    }
    assertExactKeys(
      receipt.config,
      [
        'algorithm',
        'authorityId',
        'immutable',
        'injectionOrigin',
        'keyCustody',
        'publicKeyFingerprint',
        'publicKeyPem',
        'registryReceiptId',
        'schema',
        'validatorSourceHash',
      ],
      'validator config',
    );
    const config = receipt.config;
    if (
      config.schema !== PHASE0B_VALIDATOR_SCHEMA
      || config.algorithm !== 'Ed25519'
      || config.immutable !== true
      || config.injectionOrigin !== 'host_process_boot_argument'
      || ![
        'ephemeral_engineering_fixture',
        'external_host_key',
      ].includes(config.keyCustody)
    ) {
      throw new Error('Validator config identity/injection policy mismatch');
    }
    assertSha256(config.validatorSourceHash, 'validatorSourceHash');
    if (config.publicKeyFingerprint !== sourceDigest(config.publicKeyPem)) {
      throw new Error('Validator public-key fingerprint mismatch');
    }
    if (receipt.configHash !== canonicalDigest(config)) {
      throw new Error('Validator config hash mismatch');
    }
    assertRunManifest(receipt.manifest);
    if (receipt.manifestHash !== canonicalDigest(receipt.manifest)) {
      throw new Error('Validator manifest hash mismatch');
    }
    const payload = validatorSigningPayload(receipt.configHash, receipt.manifestHash);
    if (receipt.signedPayloadHash !== canonicalDigest(payload)) {
      throw new Error('Validator signed payload hash mismatch');
    }
    const verified = verify(
      null,
      Buffer.from(canonicalJson(payload), 'utf8'),
      createPublicKey(config.publicKeyPem),
      Buffer.from(receipt.signatureBase64, 'base64'),
    );
    if (!verified) throw new Error('Validator signature verification failed');
    if (expectedPins.trustedConfig) {
      if (
        canonicalJson(config)
        !== canonicalJson(expectedPins.trustedConfig)
      ) {
        throw new Error('Validator config does not match host trust injection');
      }
    }
    for (const [key, expected] of Object.entries(expectedPins)) {
      if (key === 'trustedConfig') continue;
      if (config[key] !== expected) {
        throw new Error(`Validator pin ${key} mismatch`);
      }
    }
  } catch (error) {
    errors.push(error.message || String(error));
  }
  return {
    configHash: receipt?.config ? canonicalDigest(receipt.config) : null,
    errors,
    manifestHash: receipt?.manifest ? canonicalDigest(receipt.manifest) : null,
    valid: errors.length === 0,
  };
}

async function executeSourceRun(cli, sources, observer = 'off') {
  const run = await cli.runHeadlessExperimentSources({
    behaviorSource: sources.behavior,
    observer,
    planSource: sources.plan,
    worldSource: sources.world,
  });
  const verification = await cli.verifyHeadlessExperimentSourceRunReceipt(
    run.sourceRunReceipt,
    run.execution,
    {
      behaviorSource: sources.behavior,
      planSource: sources.plan,
      worldSource: sources.world,
    },
  );
  if (!verification?.valid) {
    throw new Error(
      `HoloScript V4 source-run verification failed: `
      + `${canonicalJson(verification?.errors ?? [])}`,
    );
  }
  return { run, verification };
}

function assertActionMatchesSignedManifest(action, signedAction, label) {
  const payload = action.payload;
  for (const [field, expected] of Object.entries({
    args: signedAction.args,
    authorization: signedAction.authorization,
    entrypoint: signedAction.entrypoint,
    scheduleEntryId: signedAction.scheduleEntryId,
    targetIds: signedAction.targetIds,
  })) {
    if (canonicalJson(payload[field]) !== canonicalJson(expected)) {
      throw new Error(`${label}.${field} does not match signed manifest`);
    }
  }
  if (
    payload.allowed !== signedAction.expectedAllowed
    || payload.outcome !== signedAction.expectedOutcome
    || payload.result.allowed !== signedAction.expectedAllowed
    || payload.result.outcome !== signedAction.expectedOutcome
  ) {
    throw new Error(`${label} decision/outcome does not match signed manifest`);
  }
}

function validateSourceRun(run, runManifest, { observerRequired }) {
  const { execution, sourceRunReceipt, claimBoundary, observerProof } = run;
  if (
    sourceRunReceipt.schema !== SOURCE_RUN_SCHEMA
    || execution.schema !== INNER_RUN_SCHEMA
  ) {
    throw new Error('HoloScript source/inner receipt schema is not V4/v1');
  }
  const counts = execution.terminal.actualCounts;
  if (
    counts.schedule !== 8
    || counts.observations !== 6
    || counts.actions !== 2
    || counts.publicStateSnapshots !== 9
  ) {
    throw new Error(`Phase 0B source-run counts differ: ${canonicalJson(counts)}`);
  }
  const observationSubjects = execution.observationLedger.map(
    (entry) => entry.payload.targetIds,
  );
  if (
    canonicalJson(observationSubjects)
    !== canonicalJson([
      ['resident-01'],
      ['resident-02'],
      ['resident-03'],
      ['resident-04'],
      ['resident-05'],
      ['resident-06'],
    ])
  ) {
    throw new Error('Phase 0B observations are not resident-subject-bound');
  }
  execution.actionLedger.forEach((entry, index) => {
    assertActionMatchesSignedManifest(
      entry,
      runManifest.actions[index],
      `actionLedger[${index}]`,
    );
  });
  const [allowedAction, deniedAction] = execution.actionLedger;
  if (
    allowedAction.payload.stateChanged !== true
    || allowedAction.payload.prePublicStateHash
      === allowedAction.payload.postPublicStateHash
    || deniedAction.payload.stateChanged !== false
    || deniedAction.payload.prePublicStateHash
      !== deniedAction.payload.postPublicStateHash
    || deniedAction.previousHash !== allowedAction.entryHash
    || execution.terminal.actionRoot !== deniedAction.entryHash
    || execution.terminal.finalPublicStateHash
      !== deniedAction.payload.postPublicStateHash
  ) {
    throw new Error('Phase 0B action mutation/rollback/hash chain is invalid');
  }
  const finalState =
    execution.publicStateSnapshots.at(-1)?.payload?.publicState;
  if (canonicalJson(finalState) !== canonicalJson(runManifest.expectedFinalState)) {
    throw new Error('Phase 0B final public state differs from signed manifest');
  }
  if (
    claimBoundary.hsPlanEntrypointExecuted !== true
    || claimBoundary.rustWasmCompilerExecuted !== true
    || claimBoundary.uaalVmExecuted !== true
    || claimBoundary.engineOwnedDeterministicHsplusActionSubsetExecuted !== true
    || claimBoundary.worldSourceReexecutedDuringVerification !== true
    || claimBoundary.hsPlanSourceReexecutedDuringVerification !== true
    || claimBoundary.hsplusBehaviorSourceReexecutedDuringVerification !== true
    // LEFT AS AN INHERITED-FIELD ASSERTION, deliberately. This claim boundary
    // is emitted by the HoloScript CLI's source-run receipt, not by this
    // module, so checking it here is verifying an out-of-band producer's field
    // rather than a constant we just wrote. What actually backs it is the
    // tracer's fence: the CLI runs IN-PROCESS inside that window, so a provider
    // call made by the CLI increments runtime.providerFence and fails the gate
    // regardless of what the CLI says about itself.
    || claimBoundary.providerCallsMade !== 0
    || claimBoundary.fullHoloWorldProjectionClaimed !== false
    || claimBoundary.fullHsLanguageExecutionClaimed !== false
    || claimBoundary.fullHsplusLanguageExecutionClaimed !== false
    || claimBoundary.physicsEngineExecuted !== false
    || claimBoundary.worldRuntimeLifecycleExecuted !== false
  ) {
    throw new Error('HoloScript V4 source-run claim boundary differs');
  }
  if (observerRequired) {
    if (
      observerProof?.schema !== OBSERVER_PROOF_SCHEMA
      || observerProof.mode !== 'single-execution-post-seal-v1'
      || observerProof.observedSealedExecutionCount !== 1
      || observerProof.observerIntroducedExperimentExecutionCount !== 0
      || observerProof.equivalent !== true
      || observerProof.canonicalPayloadEqual !== true
      || observerProof.sevenFieldsEqual !== true
      || observerProof.observedTerminalCommitment
        !== execution.terminal.terminalCommitment
    ) {
      throw new Error('HoloScript observer proof is not fail-dark/equivalent');
    }
  }
  return {
    actionDecisions: execution.actionLedger.map((entry) => ({
      allowed: entry.payload.allowed,
      entryHash: entry.entryHash,
      entrypoint: entry.payload.entrypoint,
      postPublicStateHash: entry.payload.postPublicStateHash,
      scheduleEntryId: entry.payload.scheduleEntryId,
      sequence: entry.sequence,
      stateChanged: entry.payload.stateChanged,
    })),
    counts: structuredClone(counts),
    finalPublicState: structuredClone(finalState),
    observationSubjects,
    sourceBundleHash: execution.sourceBundleHash,
    sourceRunCommitment: sourceRunReceipt.sourceRunCommitment,
    terminalCommitment: execution.terminal.terminalCommitment,
  };
}

function replayProjection(run) {
  const execution = run.execution;
  return {
    actionDecisions: execution.actionLedger.map((entry) => ({
      allowed: entry.payload.allowed,
      entryHash: entry.entryHash,
      outcome: entry.payload.outcome,
      postPublicStateHash: entry.payload.postPublicStateHash,
      stateChanged: entry.payload.stateChanged,
    })),
    actionRoot: execution.terminal.actionRoot,
    finalPublicStateHash: execution.terminal.finalPublicStateHash,
    sourceRunCommitment: run.sourceRunReceipt.sourceRunCommitment,
    terminalCommitment: execution.terminal.terminalCommitment,
  };
}

function observerCanonicalFields(run, label) {
  const fields = run?.execution?.canonicalFields;
  assertExactKeys(fields, PHASE0B_OBSERVER_CANONICAL_FIELDS, label);
  for (const field of PHASE0B_OBSERVER_CANONICAL_FIELDS) {
    assertSha256(fields[field], `${label}.${field}`);
  }
  return structuredClone(fields);
}

function observerRunProjection(run, label) {
  const canonicalFields = observerCanonicalFields(run, `${label}.canonicalFields`);
  const sourceRunCommitment = run?.sourceRunReceipt?.sourceRunCommitment;
  const terminalCommitment = run?.execution?.terminal?.terminalCommitment;
  assertSha256(sourceRunCommitment, `${label}.sourceRunCommitment`);
  assertSha256(terminalCommitment, `${label}.terminalCommitment`);
  return {
    canonicalFields,
    sourceRunCommitment,
    terminalCommitment,
  };
}

function livingCommonsActionProjection(entry, label) {
  assertObject(entry, label);
  const projection = {
    allowed: entry.payload?.allowed,
    entryHash: entry.entryHash,
    entrypoint: entry.payload?.entrypoint,
    outcome: entry.payload?.outcome,
    previousEntryHash: entry.previousHash,
    scheduleEntryId: entry.payload?.scheduleEntryId,
    stateChanged: entry.payload?.stateChanged,
    targetIds: structuredClone(entry.payload?.targetIds),
  };
  if (
    typeof projection.allowed !== 'boolean'
    || typeof projection.entrypoint !== 'string'
    || typeof projection.outcome !== 'string'
    || typeof projection.scheduleEntryId !== 'string'
    || typeof projection.stateChanged !== 'boolean'
    || !Array.isArray(projection.targetIds)
    || projection.targetIds.some((targetId) => typeof targetId !== 'string')
  ) {
    throw new Error(`${label} is not a complete action projection`);
  }
  assertSha256(projection.entryHash, `${label}.entryHash`);
  assertSha256(projection.previousEntryHash, `${label}.previousEntryHash`);
  return projection;
}

export function buildPhase0BObserverProjectionWitness({
  sealedSourceRun,
}) {
  const off = observerRunProjection(sealedSourceRun, 'observerProjection.off');
  const observerProjectionFields =
    sealedSourceRun?.observerProof?.observerProjection?.canonicalFields;
  const observerProof = sealedSourceRun?.observerProof;
  assertExactKeys(
    observerProof,
    OBSERVER_PROOF_KEYS,
    'observerProjection.proof',
  );
  assertExactKeys(
    observerProof.observerProjection,
    OBSERVER_PROJECTION_KEYS,
    'observerProjection.proof.observerProjection',
  );
  const on = {
    canonicalFields: structuredClone(observerProjectionFields),
    sourceRunCommitment: off.sourceRunCommitment,
    terminalCommitment:
      observerProof?.observerProjection?.terminalCommitment,
  };
  observerCanonicalFields(
    {
      execution: {
        canonicalFields: on.canonicalFields,
      },
    },
    'observerProjection.on.canonicalFields',
  );
  assertSha256(
    on.terminalCommitment,
    'observerProjection.on.terminalCommitment',
  );
  for (const [field, value] of Object.entries({
    observerProjectionHash: observerProof?.observerProjectionHash,
    postObserverCanonicalFieldsHash:
      observerProof?.postObserverCanonicalFieldsHash,
    postObserverCanonicalPayloadHash:
      observerProof?.postObserverCanonicalPayloadHash,
    preObserverCanonicalFieldsHash:
      observerProof?.preObserverCanonicalFieldsHash,
    preObserverCanonicalPayloadHash:
      observerProof?.preObserverCanonicalPayloadHash,
  })) {
    assertSha256(value, `observerProjection.proof.${field}`);
  }
  if (
    observerProof?.schema !== OBSERVER_PROOF_SCHEMA
    || observerProof.mode !== 'single-execution-post-seal-v1'
    || observerProof.isolation
      !== 'separate-node-process-serialized-post-seal-v1'
    || observerProof.observedSealedExecutionCount !== 1
    || observerProof.observerExecutionCount !== 1
    || observerProof.observerIntroducedExperimentExecutionCount !== 0
    || observerProof.observedTerminalCommitment
      !== sealedSourceRun.execution.terminal.terminalCommitment
    || observerProof.equivalent !== true
    || observerProof.canonicalPayloadEqual !== true
    || observerProof.sevenFieldsEqual !== true
    || observerProof.preObserverCanonicalPayloadHash
      !== observerProof.postObserverCanonicalPayloadHash
    || observerProof.preObserverCanonicalFieldsHash
      !== observerProof.postObserverCanonicalFieldsHash
    || observerProof.observerProjection?.schema
      !== 'holoscript.headless-observer-projection.v1'
    || observerProof.observerProjection?.runId
      !== sealedSourceRun.execution.runId
    || observerProof.observerProjection?.sourceReceiptSchema
      !== sealedSourceRun.execution.schema
    || observerProof.observerProjection?.terminalCommitment
      !== sealedSourceRun.execution.terminal.terminalCommitment
    || observerProof.observerProjectionHash
      !== canonicalDigest(observerProof.observerProjection)
    || observerProof.liveSchedulingNoninterferenceClaimed !== false
    || observerProof.preObserverCanonicalPayloadHash
      !== canonicalDigest(sealedSourceRun.execution)
    || canonicalDigest(off.canonicalFields)
      !== observerProof.preObserverCanonicalFieldsHash
    || canonicalDigest(on.canonicalFields)
      !== observerProof.postObserverCanonicalFieldsHash
    || canonicalJson(observerProjectionFields) !== canonicalJson(off.canonicalFields)
  ) {
    throw new Error(
      'Sealed HoloScript observer proof differs from the execution receipt',
    );
  }
  const changedFields = PHASE0B_OBSERVER_CANONICAL_FIELDS.filter(
    (field) => off.canonicalFields[field] !== on.canonicalFields[field],
  );
  const sevenFieldsEqual = changedFields.length === 0;
  const sourceRunCommitmentEqual =
    off.sourceRunCommitment === on.sourceRunCommitment;
  const terminalCommitmentEqual =
    off.terminalCommitment === on.terminalCommitment;
  const observerIntroducedExperimentExecutionCount =
    observerProof.observerIntroducedExperimentExecutionCount;
  const [admittedEntry, blockedEntry] = sealedSourceRun.execution.actionLedger;
  const admittedAction = livingCommonsActionProjection(
    admittedEntry,
    'observerProjection.livingCommons.admittedAction',
  );
  const blockedAction = livingCommonsActionProjection(
    blockedEntry,
    'observerProjection.livingCommons.blockedAction',
  );
  const finalPublicState =
    sealedSourceRun.execution.publicStateSnapshots.at(-1)?.payload?.publicState;
  if (
    admittedAction.allowed !== true
    || admittedAction.stateChanged !== true
    || admittedAction.entrypoint !== 'contribute_water'
    || canonicalJson(admittedAction.targetIds)
      !== canonicalJson(['VillageCommons'])
    || blockedAction.allowed !== false
    || blockedAction.stateChanged !== false
    || blockedAction.entrypoint !== 'deny_external_message'
    || canonicalJson(blockedAction.targetIds)
      !== canonicalJson(['IsolationBoundary'])
    || blockedAction.previousEntryHash !== admittedAction.entryHash
    || !Number.isInteger(finalPublicState?.acceptedActionCount)
    || !Number.isInteger(finalPublicState?.publicWaterUnits)
  ) {
    throw new Error(
      'Phase 0B Living Commons projection inputs differ from the verified run',
    );
  }
  const actionReceiptRoot =
    sealedSourceRun.execution.terminal.actionRoot;
  assertSha256(
    actionReceiptRoot,
    'observerProjection.livingCommons.actionReceiptRoot',
  );
  const witness = {
    schema: PHASE0B_OBSERVER_PROJECTION_SCHEMA,
    projectionToggleExecuted: true,
    toggleScope: 'single_sealed_execution_post_seal_consumer',
    executionOrder: [
      'sealed_receipt_before_observer_consumer',
      'sealed_receipt_after_observer_consumer',
    ],
    sourceRunExecutionsObserved: {
      authoritative: 1,
      observerIntroduced: 0,
    },
    requiredCanonicalFields: [...PHASE0B_OBSERVER_CANONICAL_FIELDS],
    off,
    on,
    comparison: {
      changedFields,
      sevenFieldsEqual,
      sourceRunCommitmentEqual,
      terminalCommitmentEqual,
      preObserverCanonicalPayloadHash:
        observerProof.preObserverCanonicalPayloadHash,
      postObserverCanonicalPayloadHash:
        observerProof.postObserverCanonicalPayloadHash,
      preObserverCanonicalFieldsHash:
        observerProof.preObserverCanonicalFieldsHash,
      postObserverCanonicalFieldsHash:
        observerProof.postObserverCanonicalFieldsHash,
    },
    livingCommons: {
      acceptedActionCount: finalPublicState.acceptedActionCount,
      actionReceiptRoot,
      admittedAction,
      blockedAction,
      projectionAuthority: 'read_only_receipt_consumption',
      publicWaterUnits: finalPublicState.publicWaterUnits,
      rawModelContentIncluded: false,
      visualCuesRequireExistingActionReceipts: true,
    },
    claimBoundary: {
      adapterIdentityFieldsIncluded: false,
      boundedRuntimeSceneObjectCount:
        sealedSourceRun.execution.scene.objectCount,
      boundedV4SourceRunProjectionExecuted: true,
      freshExperimentExecutionCount: 0,
      fullCanonicalTwelveObjectLifecycleClaimed: false,
      liveSchedulingNoninterferenceClaimed: false,
      observerIntroducedExperimentExecutionCount,
      projectionOwnsExperimentBehavior: false,
      projectionWorldWritePathExposed: false,
      // This witness is a PURE projection of an already-sealed source run: it
      // opens no socket and has no fence of its own, so it is not entitled to
      // publish a provider-call count. It used to publish a literal 0, which
      // was a claim it could not make. It now names the single measured place
      // instead, so a consumer that wants the number has to read a counter.
      providerCallMeasurementAuthority:
        'receipt.runtime.providerFence (measured by the tracer fence)',
    },
  };
  if (
    !sevenFieldsEqual
    || !sourceRunCommitmentEqual
    || !terminalCommitmentEqual
    || observerIntroducedExperimentExecutionCount !== 0
    || sealedSourceRun.execution.scene.objectCount !== 12
  ) {
    throw new Error(
      `Phase 0B observer off/on projection differs: ${canonicalJson(
        witness.comparison,
      )}`,
    );
  }
  return witness;
}

function statePath(storeDir) {
  return path.join(storeDir, 'state.json');
}

function lockPath(storeDir) {
  return path.join(storeDir, 'state.lock');
}

function sealState(unsignedState) {
  return {
    ...unsignedState,
    stateHash: canonicalDigest(unsignedState),
  };
}

function assertWorldState(world, label) {
  assertExactKeys(
    world,
    [
      'acceptedActionCount',
      'emergencyStopState',
      'phase',
      'publicWaterUnits',
    ],
    label,
  );
  if (
    !Number.isInteger(world.acceptedActionCount)
    || world.acceptedActionCount < 0
    || !Number.isInteger(world.publicWaterUnits)
    || world.publicWaterUnits < 0
    || !['armed', 'triggered'].includes(world.emergencyStopState)
    || !['running', 'frozen'].includes(world.phase)
    || (
      world.emergencyStopState === 'triggered'
      && world.phase !== 'frozen'
    )
  ) {
    throw new Error(`${label} contains invalid public-state values`);
  }
}

function validateLedgerEntry(entry, expectedSequence, previousReceiptHash) {
  assertExactKeys(
    entry,
    [
      'admissionMatched',
      'allowed',
      'authorizationNonce',
      'authorizationSequence',
      'attemptDigest',
      'entrypoint',
      'eventPublication',
      'postWorldStateHash',
      'preWorldStateHash',
      'previousReceiptHash',
      'receiptHash',
      'scheduleEntryId',
      'upstreamActionEntryHash',
      'worldMutationCommitted',
    ],
    `persistent ledger entry ${expectedSequence}`,
  );
  if (
    entry.authorizationSequence !== expectedSequence
    || entry.previousReceiptHash !== previousReceiptHash
  ) {
    throw new Error(`Persistent ledger entry ${expectedSequence} chain mismatch`);
  }
  const { receiptHash, ...preimage } = entry;
  if (receiptHash !== canonicalDigest(preimage)) {
    throw new Error(`Persistent ledger entry ${expectedSequence} hash mismatch`);
  }
  assertSha256(entry.attemptDigest, `ledger[${expectedSequence}].attemptDigest`);
  assertSha256(
    entry.upstreamActionEntryHash,
    `ledger[${expectedSequence}].upstreamActionEntryHash`,
  );
  assertSha256(
    entry.preWorldStateHash,
    `ledger[${expectedSequence}].preWorldStateHash`,
  );
  assertSha256(
    entry.postWorldStateHash,
    `ledger[${expectedSequence}].postWorldStateHash`,
  );
  if (
    entry.eventPublication !== 'durable_outbox_after_atomic_commit'
    || (
      entry.allowed
      && (
        entry.admissionMatched !== true
        || entry.worldMutationCommitted
          !== (entry.preWorldStateHash !== entry.postWorldStateHash)
      )
    )
    || (
      !entry.allowed
      && (
        entry.worldMutationCommitted !== false
        || entry.preWorldStateHash !== entry.postWorldStateHash
      )
    )
  ) {
    throw new Error(
      `Persistent ledger entry ${expectedSequence} admission/mutation invariant failed`,
    );
  }
  return receiptHash;
}

export function validatePersistentState(state) {
  assertExactKeys(
    state,
    [
      'consumedAuthorizations',
      'eventOutbox',
      'lastAuthorizationSequence',
      'ledger',
      'revision',
      'runId',
      'schema',
      'stateHash',
      'validatorConfigHash',
      'validatorManifestHash',
      'world',
    ],
    'persistent state',
  );
  const { stateHash, ...unsignedState } = state;
  if (stateHash !== canonicalDigest(unsignedState)) {
    throw new Error('Persistent state hash mismatch');
  }
  if (state.schema !== PHASE0B_STATE_SCHEMA) {
    throw new Error('Persistent state schema mismatch');
  }
  assertWorldState(state.world, 'persistent world');
  assertExactKeys(state.ledger, ['entries', 'receiptRoot'], 'persistent ledger');
  if (
    !Array.isArray(state.ledger.entries)
    || !Array.isArray(state.consumedAuthorizations)
    || !Array.isArray(state.eventOutbox)
    || state.revision !== state.ledger.entries.length
    || state.lastAuthorizationSequence !== state.ledger.entries.length - 1
    || state.consumedAuthorizations.length !== state.ledger.entries.length
    || state.eventOutbox.length !== state.ledger.entries.length
  ) {
    throw new Error('Persistent state counters are inconsistent');
  }
  let previousReceiptHash = GENESIS_RECEIPT_HASH;
  state.ledger.entries.forEach((entry, index) => {
    previousReceiptHash = validateLedgerEntry(entry, index, previousReceiptHash);
    const consumed = state.consumedAuthorizations[index];
    assertExactKeys(
      consumed,
      ['nonce', 'receiptHash', 'sequence'],
      `consumed authorization ${index}`,
    );
    if (
      consumed.sequence !== index
      || consumed.nonce !== entry.authorizationNonce
      || consumed.receiptHash !== entry.receiptHash
    ) {
      throw new Error(`Consumed authorization ${index} is inconsistent`);
    }
    const event = state.eventOutbox[index];
    assertExactKeys(
      event,
      ['eventId', 'publication', 'receiptHash'],
      `event outbox entry ${index}`,
    );
    if (
      event.eventId !== `model-village-action-${index}`
      || event.publication !== 'post_commit_only'
      || event.receiptHash !== entry.receiptHash
    ) {
      throw new Error(`Event outbox entry ${index} is inconsistent`);
    }
  });
  if (state.ledger.receiptRoot !== previousReceiptHash) {
    throw new Error('Persistent ledger receiptRoot mismatch');
  }
  if (
    new Set(state.consumedAuthorizations.map((entry) => entry.nonce)).size
    !== state.consumedAuthorizations.length
  ) {
    throw new Error('Persistent state contains a duplicate authorization nonce');
  }
  if (
    state.ledger.entries.length > 0
    && canonicalDigest(state.world)
      !== state.ledger.entries.at(-1).postWorldStateHash
  ) {
    throw new Error('Persistent world does not match the terminal ledger state');
  }
  return true;
}

export function readPersistentState(storeDir) {
  const state = JSON.parse(readFileSync(statePath(storeDir), 'utf8'));
  validatePersistentState(state);
  return state;
}

function writeAtomicState(storeDir, state, faultInjection = 'none') {
  const target = statePath(storeDir);
  const temporary = path.join(
    storeDir,
    `.state-${process.pid}-${randomUUID()}.tmp`,
  );
  const descriptor = openSync(temporary, 'wx');
  let renamed = false;
  try {
    writeFileSync(descriptor, `${canonicalJson(state)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    if (faultInjection === 'before_rename') {
      throw new Error('injected fault before atomic rename');
    }
    renameSync(temporary, target);
    renamed = true;
    if (faultInjection === 'after_rename') {
      throw new Error('injected fault after atomic rename');
    }
  } catch (error) {
    try {
      closeSync(descriptor);
    } catch {
      // Descriptor was already closed.
    }
    if (!renamed && existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

const LOCK_HOLDER_MESSAGE =
  'Persistent authorization store is locked by another writer';

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but is not signalable by us — alive.
    return error?.code === 'EPERM';
  }
}

/**
 * The break token that serializes stale-lock breaking, and the ages at which an
 * abandoned token may be reclaimed. THREE floors, because the three reclaim
 * cases carry very different amounts of proof:
 *
 *   DEAD (2s) — the token names a plausible pid and that pid is PROVEN gone.
 *     Crash residue. The sequence a token guards is a handful of syscalls, so
 *     two seconds is already orders of magnitude of headroom.
 *
 *   UNIDENTIFIED (30s) — the token names no readable pid. On the primary create
 *     path this CANNOT happen: publishBreakToken writes the payload to a
 *     private path, fsyncs it, and link()s it into place, so the token carries
 *     its holder's pid from the instant it exists. An unidentified token is
 *     therefore residue from the no-hard-link fallback, an operator, or a torn
 *     write. It stays reclaimable (never reclaiming it would turn one mid-break
 *     SIGKILL into a permanent unbreakable-lock wedge) but behind a long floor,
 *     because on the fallback path an empty token CAN belong to a process that
 *     is merely SLOW between its create and its write — reclaiming that token
 *     puts two processes in the break section at once. MEASURED: with the old
 *     single 2s floor, a live (not killed) contender stalled in that window had
 *     its token reclaimed by a peer, and both were admitted to the break
 *     sequence. The primary path removes the window; this floor is what bounds
 *     it on the fallback.
 *
 *   ABSOLUTE (60s) — the token names a LIVE pid but is older than any real
 *     break sequence could be. Without this, PID REUSE (aggressive on win32) is
 *     a permanent wedge: a token leaked by a crash whose pid is later recycled
 *     onto an unrelated live process is never reclaimable at any age, so a
 *     stale lock beside it can never be broken again. CONFIRMED before this
 *     floor existed: a live-pid token with an hour-old stamp still refused at
 *     t=0 and at t=3000ms. Note the asymmetry with the LOCK, which is
 *     deliberate and must stay: a live holder's LOCK is never broken at any
 *     age, because a lock is held for the length of a transaction. A token is
 *     held for microseconds, so "live and 60s old" is overwhelmingly a recycled
 *     pid — and if it is genuinely a catastrophically stalled breaker, the
 *     identity-bound move-aside inside the break section is still there to fail
 *     it closed.
 */
const BREAK_TOKEN_SUFFIX = '.break';
const BREAK_TOKEN_MIN_RECLAIM_AGE_MS = 2000;
const BREAK_TOKEN_UNIDENTIFIED_RECLAIM_AGE_MS = 30000;
const BREAK_TOKEN_ABSOLUTE_RECLAIM_AGE_MS = 60000;

/**
 * The pid a lock or token record names, or null when the record does not
 * identify its holder at all.
 *
 * A missing, non-integer, or non-positive pid is an UNIDENTIFIABLE holder, not
 * a dead one. pidIsAlive() answers "not alive" for pid <= 0 and for `'4242'`
 * and for undefined, so any code that feeds a raw record straight to it breaks
 * locks on the strength of garbage. This is that gate, factored out so BOTH
 * locks get it from one place.
 */
function readHolderPid(bytes) {
  let record = null;
  try {
    record = JSON.parse(
      (Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes)),
    );
  } catch {
    return null;
  }
  if (!record || typeof record !== 'object') return null;
  return Number.isInteger(record.pid) && record.pid > 0 ? record.pid : null;
}

/**
 * Identity-bound move-aside: removes EXACTLY the file instance whose bytes the
 * caller inspected, or refuses.
 *
 * WHY IT IS NOT `unlinkSync(path)`. An unlink is bound to a PATH, not to the
 * file the caller inspected. Every contender that read the same stale holder
 * independently concluded "dead, break it", and each one then removed whatever
 * happened to be at that path — including a lock a winner had already
 * re-created microseconds earlier. Measured with 8 real OS processes racing one
 * genuinely stale lock, that produced 2-8 simultaneous "winners" in 12/12
 * trials and could delete a LIVE holder's lock.
 *
 *   1. re-read the file immediately before acting; if the bytes changed since
 *      the staleness decision, that decision is VOID -> 'changed' (refuse),
 *   2. rename it aside to a per-caller unique name. rename removes the SOURCE
 *      atomically, so exactly ONE contender in a field of N can move any given
 *      file instance; every other contender gets ENOENT -> 'gone',
 *   3. verify the bytes we actually moved are the bytes we inspected. If they
 *      are not, we moved somebody else's — possibly LIVE — file in the gap
 *      between step 1 and step 2, so put it back with a NON-CLOBBERING link
 *      (never a rename that could overwrite a newer holder) and refuse.
 *
 * Steps 1 and 2 are separate syscalls, so on its own this sequence can still
 * move a FRESH file aside when it is preempted in that gap — that is the defect
 * breakStaleLockFile's break token exists to NARROW.
 *
 * STEP 3 IS NOT BELT-AND-BRACES; DO NOT DELETE IT. The token narrows the window
 * but cannot close it (see breakStaleLockFile's "TWO LAYERS" note): the token's
 * own reclaim is unserializable, so a stalled or pid-recycled holder can be
 * displaced and TWO processes can be inside the break section. Step 3 is what
 * fails the displaced one closed — measured as the reason 65 trials engineered
 * to force exactly that produced 0 double-acquires. It is also the only guard
 * the one untokenizable caller (break-token reclamation) has at all.
 *
 * @returns {'broke'|'gone'|'changed'|'contended'|'stolen'}
 */
function moveFileAsideIdentityBound(lockFilePath, observedBytes) {
  // Everything that is not a syscall is done BEFORE the re-read, so the
  // read -> rename window is as close to adjacent as JS allows.
  const aside = `${lockFilePath}.stale-${process.pid}-${randomUUID()}`;

  // (1) The staleness decision is only valid for the exact bytes it was made
  //     from.
  let current;
  try {
    current = readFileSync(lockFilePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return 'gone';
    throw error;
  }
  if (!current.equals(observedBytes)) return 'changed';

  // (2) Move it aside. Unique per caller so two breakers never inspect each
  //     other's aside file.
  try {
    renameSync(lockFilePath, aside);
  } catch (error) {
    // ENOENT: another contender moved it first. EPERM/EACCES/EBUSY: a
    // transient win32 sharing refusal. Neither is a licence to delete.
    if (error?.code === 'ENOENT') return 'gone';
    if (['EACCES', 'EBUSY', 'EPERM'].includes(error?.code)) return 'contended';
    throw error;
  }

  // (3) Prove we moved the file we inspected, which a path-bound unlink can
  //     never do.
  let moved = null;
  try {
    moved = readFileSync(aside);
  } catch {
    moved = null;
  }
  if (moved !== null && moved.equals(observedBytes)) {
    try {
      unlinkSync(aside);
    } catch {
      // The aside copy is inert residue; leaving it never blocks an acquire.
    }
    return 'broke';
  }

  // We moved a lock that is NOT the stale one. Restore it without clobbering a
  // newer holder: linkSync fails EEXIST rather than overwriting.
  try {
    linkSync(aside, lockFilePath);
    try {
      unlinkSync(aside);
    } catch {
      // Inert residue.
    }
    return 'changed';
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      // Hard links unavailable (non-NTFS/exotic volume): fall back to a rename
      // back, still guarded so an existing newer lock is not overwritten.
      try {
        if (!existsSync(lockFilePath)) {
          renameSync(aside, lockFilePath);
          return 'changed';
        }
      } catch {
        // Fall through to the loud 'stolen' outcome.
      }
    }
  }
  return 'stolen';
}

/**
 * Reclaims a break token whose holder is PROVEN DEAD and which has gone
 * unrefreshed for at least BREAK_TOKEN_MIN_RECLAIM_AGE_MS. This is the depth-1
 * floor of the scheme: the token cannot be guarded by another token, so it is
 * guarded by (a) a liveness proof, (b) an age floor, and (c) the identity-bound
 * move-aside. Reclaiming does NOT confer the token: it only frees the path, and
 * the reclaimer then has to win the ordinary exclusive create like every other
 * contender. That is what keeps a reclaim race harmless — the rename can be won
 * by at most one reclaimer, and HOLDING is still decided by the atomic exclusive
 * create (linkSync, or openSync 'wx' on the no-hard-link fallback).
 *
 * WHICH FLOOR APPLIES IS DECIDED BY HOW MUCH THE TOKEN PROVES ABOUT ITS HOLDER
 * (see the three constants above): proven-dead pid -> the short floor; live pid
 * -> only the absolute floor, which exists purely so a RECYCLED pid cannot wedge
 * breaking forever; no readable pid -> the long floor, because on the fallback
 * create path an empty token can still belong to a live-but-slow breaker.
 *
 * A previous version used ONE 2s floor for all three, and skipped the liveness
 * check entirely whenever the token did not parse — so a live contender stalled
 * in the old create-then-write window lost its token to a peer. That is fixed on
 * two fronts: the token is now published atomically WITH its payload (so the
 * empty state is unobservable), and the unidentified floor is 15x longer.
 *
 * @returns {'broke'|'gone'|'changed'|'contended'|'stolen'}
 */
function reclaimStaleBreakToken(tokenPath) {
  let observed;
  try {
    observed = readFileSync(tokenPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return 'gone';
    return 'contended';
  }
  const holderPid = readHolderPid(observed);
  let stampedAt = Number.NaN;
  try {
    const record = JSON.parse(observed.toString('utf8'));
    if (record && typeof record.at === 'string') stampedAt = Date.parse(record.at);
  } catch {
    // Unparseable token: fall back to the filesystem's own timestamp below.
  }
  if (!Number.isFinite(stampedAt)) {
    try {
      stampedAt = statSync(tokenPath).mtimeMs;
    } catch {
      return 'contended';
    }
  }
  if (!Number.isFinite(stampedAt)) return 'contended';

  let floorMs;
  if (holderPid === null) {
    // Unidentifiable holder. Reclaimable (never doing so would be a wedge), but
    // only after the long floor — this is the one shape that can still be a
    // LIVE process mid-create on the no-hard-link fallback path.
    floorMs = BREAK_TOKEN_UNIDENTIFIED_RECLAIM_AGE_MS;
  } else if (pidIsAlive(holderPid)) {
    // A live breaker is mid-sequence: never reclaimed at any ordinary age. Only
    // the absolute floor applies, and only to defeat pid reuse.
    floorMs = BREAK_TOKEN_ABSOLUTE_RECLAIM_AGE_MS;
  } else {
    floorMs = BREAK_TOKEN_MIN_RECLAIM_AGE_MS;
  }
  if (Date.now() - stampedAt < floorMs) return 'contended';
  return moveFileAsideIdentityBound(tokenPath, observed);
}

/**
 * Publishes the break token ATOMICALLY WITH ITS PAYLOAD, so the token never
 * exists in a state that fails to name its holder.
 *
 * WHY NOT `openSync(tokenPath, 'wx')` FOLLOWED BY A WRITE. Those are two
 * syscalls, and between them the token is 0 bytes. An empty token names no pid,
 * so a peer's reclaim check cannot run a liveness probe on it and falls through
 * to the age floor alone — which means a contender that is merely SLOW in that
 * window (not killed) loses its token to a peer, and TWO processes end up inside
 * the break section. REPRODUCED with real processes: P1 alive and stalled with
 * the genuine 0-byte token, P2 reclaimed it, took its own, broke the stale lock,
 * and acquired the store while P1 was still running.
 *
 * `linkSync` closes that: it is atomic, it fails EEXIST instead of clobbering,
 * and the file it publishes was already written and fsynced under a private
 * name. So the token carries `{at, pid}` from the instant any peer can observe
 * it, and reclaimStaleBreakToken's liveness rule always has something to check.
 *
 * @returns {'created'|'exists'|'failed'}
 */
function publishBreakToken(tokenPath, payload) {
  // A path only THIS call can name (uuid), and one that does NOT end in
  // BREAK_TOKEN_SUFFIX, so a residue scan can never mistake staging for a token.
  const pending = `${tokenPath}-pending-${process.pid}-${randomUUID()}`;
  let pendingExists = false;
  let staged = false;
  try {
    const descriptor = openSync(pending, 'wx');
    pendingExists = true;
    try {
      writeFileSync(descriptor, payload);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    staged = true;
    linkSync(pending, tokenPath);
    return 'created';
  } catch (error) {
    if (!staged) return 'failed';
    if (error?.code === 'EEXIST') return 'exists';
    // Hard links unavailable on this volume (non-NTFS / exotic FS). Refusing
    // here instead would make stale locks unbreakable forever on such a volume
    // — a permanent outage, strictly worse than the narrowed race. Fall back to
    // the exclusive-create path, which is exactly the previously shipped
    // behaviour, still bounded by the 15x-longer unidentified reclaim floor.
    return publishBreakTokenWithoutHardLinks(tokenPath, payload);
  } finally {
    // Cleaned up on EVERY exit, including a write that failed after the create —
    // tying this to `staged` would leak the staging file on exactly that path.
    // `pending` carries a uuid this call minted, so no other process can ever
    // name it: this is the one path-bound removal in this file that is
    // identity-bound by construction rather than by a byte comparison.
    if (pendingExists) {
      try {
        unlinkSync(pending);
      } catch {
        // Inert residue; nothing ever consults this path.
      }
    }
  }
}

/**
 * Fallback for filesystems without hard links. Same contract, weaker guarantee:
 * the create and the write are separate syscalls, so the token IS briefly
 * observable empty. That residual is the reason
 * BREAK_TOKEN_UNIDENTIFIED_RECLAIM_AGE_MS exists and is long.
 *
 * @returns {'created'|'exists'|'failed'}
 */
function publishBreakTokenWithoutHardLinks(tokenPath, payload) {
  let descriptor;
  try {
    descriptor = openSync(tokenPath, 'wx');
  } catch (error) {
    // EEXIST: somebody holds it. Anything else (EACCES/EBUSY/EPERM on win32, a
    // missing parent) is a refusal too — never a licence to break blind.
    return error?.code === 'EEXIST' ? 'exists' : 'failed';
  }
  try {
    writeFileSync(descriptor, payload);
    fsyncSync(descriptor);
    closeSync(descriptor);
    return 'created';
  } catch {
    try {
      closeSync(descriptor);
    } catch {
      // Already closed by the successful path above.
    }
    // DELIBERATELY NO `unlinkSync(tokenPath)` HERE. That would be a PATH-bound
    // removal of a SHARED path — the exact pattern this whole fix exists to
    // eliminate — and the old justification for it ("we created it microseconds
    // ago, nobody can have taken it") is false: the token we just created is
    // EMPTY, an empty token is reclaimable once past its floor, and a slow
    // process reaching this catch late would delete a PEER's live token and
    // leave the break section unguarded. Leaving the residue is strictly safer:
    // the unidentified age floor clears it, and while it sits there it only
    // delays breaking — it never blocks acquiring.
    return 'failed';
  }
}

/**
 * Takes the exclusive break token, or reports that someone else holds it.
 * Exclusive create (link / openSync 'wx') is the only primitive node's builtin
 * fs exposes that is atomic across processes on both win32 and POSIX, so it —
 * not a compare — is what decides who may break.
 *
 * @returns {boolean} true only when this process now holds the token.
 */
function acquireBreakToken(tokenPath) {
  // Built BEFORE any syscall: the payload has to exist before the token does,
  // or the token is observable without a holder identity.
  const payload = Buffer.from(
    `${canonicalJson({ at: new Date().toISOString(), pid: process.pid })}\n`,
    'utf8',
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const published = publishBreakToken(tokenPath, payload);
    if (published === 'created') {
      rememberOwnedLockFile(tokenPath, payload);
      return true;
    }
    // Bounded, depth-1: one reclaim attempt, then one more create attempt.
    if (published !== 'exists' || attempt === 1) return false;
    if (reclaimStaleBreakToken(tokenPath) !== 'broke') return false;
  }
  return false;
}

/**
 * SERIALIZED, IDENTITY-BOUND stale-lock break — the single shared
 * implementation used by BOTH the phase0b persistence lock and the sealed
 * custody store lock (model-village-custody-store.mjs), so the two can never
 * drift. Both reach the defect through this one function, so both are fixed
 * here — though be precise about the evidence: the race was REPRODUCED on the
 * phase0b path (below), while on the custody path it is structural. 85 pre-fix
 * 8-way trials against openSealedCustodyStore did not surface it, presumably
 * because the surrounding crypto/chain work spreads the contenders out; the
 * defective window is the same code either way.
 *
 * WHY A TOKEN AND NOT A TIGHTER COMPARE. The previous version re-read the lock
 * and compared it to the observed bytes immediately before renaming it aside.
 * A compare cannot bind identity, because the decision and the action are
 * separate syscalls and rename addresses a PATH: contender B, preempted between
 * them, would move the winner A's brand-new lock aside, and contender C's
 * ordinary `openSync(target, 'wx')` would then succeed on the momentarily free
 * path. A and C both hold "the" lock; B's restore link fails EEXIST and B
 * refuses, so nothing is even left pointing at what happened. Measured: 8 real
 * processes racing one genuinely stale lock, 6 trials per run — two winners
 * appeared on the 70th trial, with the winner rows showing exactly that
 * fingerprint (a winner whose recordedPid is a DIFFERENT winner's pid).
 *
 * The break section therefore needs MUTUAL EXCLUSION, which is provided by an
 * exclusive break token at a fixed path next to the lock:
 *   - exactly one contender may run inspect -> move-aside -> verify,
 *   - every other contender returns 'contended' and REFUSES rather than racing.
 * While the stale lock exists nobody can create a lock (their `wx` create gets
 * EEXIST), and the only way it can stop existing is a break — which requires the
 * token. So in the ordinary case the token holder's own read -> rename gap
 * cannot see the stale file replaced by a fresh one.
 *
 * TWO LAYERS, AND BOTH ARE LOAD-BEARING. Read this before deleting either.
 * The token NARROWS the window; it does not prove it shut. The token's own
 * reclaim path cannot itself be tokenized (nothing can guard the guard without
 * infinite regress), so under a stall or a pid reuse two processes can still
 * enter the break section. What stops that from becoming a double-acquire is
 * the SECOND layer: moveFileAsideIdentityBound's post-rename byte check, which
 * fails a displaced breaker closed. MEASURED: 65 trials engineered specifically
 * to force a second process into the break section (a contender deliberately
 * stalled 2400ms in the token window, plus 4 and then 10 late contenders spread
 * across its wake) produced exactly ONE winner every time — 0 double-acquires,
 * 0 overlapping holds — because the displaced holder was caught by that check.
 * An earlier revision of this comment claimed the token "closes the window
 * rather than narrowing it". It does not, and believing it would make the inner
 * check look redundant. It is not redundant; it is the thing that holds.
 *
 * FAIL CLOSED ON AN UNIDENTIFIABLE HOLDER — enforced HERE, in the shared
 * primitive, not in each caller. A missing / null / negative / zero / float /
 * string pid is an UNKNOWN holder, never a dead one, and a break on the strength
 * of garbage is exactly the "fail-open on pid:-1" defect this lane has already
 * shipped once. The phase0b caller had its own plausibility gate; the custody
 * caller did NOT (it passed a raw `holder.pid` to a liveness probe that answers
 * "not alive" for all six of those shapes), so the two locks had already drifted
 * — MEASURED at 6/8 payload shapes opening a SECOND concurrent custody handle
 * against a store whose entire lock rationale is that a second handle forks the
 * append-only chain. Putting the gate in the primitive is what makes "one fix
 * serves both locks" true instead of aspirational.
 *
 * ONLY 'broke' lets a caller retry the exclusive create. Every other outcome —
 * including 'gone' — FAILS CLOSED, and that is load-bearing, not conservatism:
 * a loser that retried would be sitting on `openSync 'wx'` precisely while the
 * winner's path is momentarily free. Refusal is already a first-class, retried
 * outcome for both callers.
 *
 * Mutual exclusion over the STORE is still decided only by
 * `openSync(target, 'wx')`; the token governs breaking, never acquiring. A
 * leaked token can therefore never block an acquire — only a break — which is
 * what keeps every token residual a bounded DELAY rather than an outage.
 *
 * RESIDUALS, stated honestly — this is narrowed, not proven impossible:
 *   1. A process that dies or STALLS inside the break sequence leaves a token
 *      that blocks breaking until its floor expires (2s proven-dead, 30s
 *      unidentified, 60s live-pid). Note "stalls", not just "is SIGKILLed": an
 *      un-killed but slow holder is displaced by the same rules, it is only the
 *      floor that differs. During that window acquires against a stale lock fail
 *      closed with the usual holder message: a bounded delay, the deliberate
 *      trade.
 *   2. The token reclaim is the one unserialized sequence left. Two contenders
 *      racing to reclaim the SAME token can, if one is preempted inside its own
 *      read -> rename gap, end up with two live token holders. This does NOT
 *      require "a holder proven dead": the unidentified path reaches it with no
 *      liveness proof at all (a torn/empty token on the no-hard-link fallback),
 *      and the absolute floor reaches it against a live pid. In every such case
 *      the inner identity check above is what fails the loser closed — see the
 *      65-trial measurement. Perfect exclusion would need an OS-backed lock
 *      (flock/LockFileEx), which node's builtin fs does not expose.
 *   3. A token stamped with a FUTURE time (clock set backwards after it was
 *      written) reads as negative age and is never old enough to reclaim. The
 *      operator repair is the documented one: remove the named file.
 *
 * @returns {'broke'|'gone'|'changed'|'contended'|'stolen'|'unidentified'|'live'}
 */
export function breakStaleLockFile(lockFilePath, observedBytes) {
  // The gate that must not drift between the two locks (see above). Refuse
  // BEFORE taking the token: an unidentifiable or live holder is not a break
  // that is contended, it is a break that must never be attempted.
  const holderPid = readHolderPid(observedBytes);
  if (holderPid === null) return 'unidentified';
  if (pidIsAlive(holderPid)) return 'live';

  const tokenPath = `${lockFilePath}${BREAK_TOKEN_SUFFIX}`;
  if (!acquireBreakToken(tokenPath)) return 'contended';
  try {
    return moveFileAsideIdentityBound(lockFilePath, observedBytes);
  } finally {
    // Ownership-verified: releases only the token bytes THIS process wrote.
    releaseOwnedLockFile(tokenPath);
  }
}

/**
 * Lock files this process currently owns: absolute lock path -> the exact bytes
 * we wrote. Release verifies ownership against this map so a handle can never
 * unlink a SUCCESSOR's lock (which would hand two writers the same store).
 */
const OWNED_LOCK_FILES = new Map();

/** Records ownership of a lock file this process just created. */
export function rememberOwnedLockFile(lockFilePath, payloadBytes) {
  OWNED_LOCK_FILES.set(path.resolve(lockFilePath), Buffer.from(payloadBytes));
}

/**
 * Ownership-verified release: unlinks the lock ONLY when the bytes on disk are
 * still the bytes this process wrote. A lock that was broken and retaken by
 * someone else is left alone — releasing it would delete a live holder's lock.
 * Returns true when this call removed the file.
 */
export function releaseOwnedLockFile(lockFilePath) {
  const resolved = path.resolve(lockFilePath);
  const owned = OWNED_LOCK_FILES.get(resolved);
  OWNED_LOCK_FILES.delete(resolved);
  if (!owned) return false;
  try {
    if (!existsSync(resolved)) return false;
    const current = readFileSync(resolved);
    if (!current.equals(owned)) return false;
    unlinkSync(resolved);
    return true;
  } catch {
    // Best-effort release; a lock left by a dead pid is reclaimed on the next
    // acquire.
    return false;
  }
}

/**
 * Exclusive writer lock over the persistence store, pid-stamped so crash
 * residue is distinguishable from a live holder. Mirrors the ratified sealed
 * custody-store lock (model-village-custody-store.mjs acquireStoreLock).
 *
 * MV-B5 gap G2: the previous implementation wrote an EMPTY state.lock and had
 * no reclamation, so a SIGKILLed writer leaked it permanently and every later
 * initializePersistentStore/commit failed with no repair path. The lock now
 * records {acquiredAt, pid}; on EEXIST the recorded pid decides:
 *   - alive  -> refuse (a live holder's lock is NEVER stolen),
 *   - dead   -> crash residue, broken through breakStaleLockFile: the break is
 *               SERIALIZED behind an exclusive break token and IDENTITY-bound
 *               (it proves it moved the exact bytes it inspected), so N
 *               contenders that all read one stale lock still produce exactly
 *               ONE winner. Neither guard is sufficient alone: an unconditional
 *               `unlinkSync(target)` destroyed mutual exclusion outright, and
 *               the identity check on its own still let a contender move a
 *               WINNER's fresh lock aside in the gap between its re-read and its
 *               rename (measured: two simultaneous live holders on the 70th
 *               8-way racing trial, and 3 in 60 trials of a direct probe),
 *   - unreadable / unparseable / missing pid -> FAIL CLOSED. An unknown holder
 *               is not a dead holder; deliberate operator unlink is the repair.
 * Mutual exclusion itself is always decided by the atomic openSync(target,
 * 'wx'), never by the break: breaking only clears crash residue out of the way.
 * Every refusal keeps the historical message so existing callers (the
 * contention drill's refusal classifier, adversarial tests) still match.
 *
 * Exported (with its release twin) purely as the crash-drill seam: the MV-B5
 * worker must hold a REAL production lock and then be SIGKILLed, so that the
 * leak it recovers from is a genuine leak rather than a hand-built file. No
 * existing caller's behavior changes; withStoreLock remains the only in-module
 * user.
 */
export function acquirePersistentStoreLock(storeDir) {
  const target = lockPath(storeDir);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor;
    try {
      descriptor = openSync(target, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let observed;
      try {
        observed = readFileSync(target);
      } catch (readError) {
        if (readError?.code === 'ENOENT') continue; // vanished; retry create
        throw readError;
      }
      let holder = null;
      try {
        holder = JSON.parse(observed.toString('utf8'));
      } catch {
        holder = null;
      }
      // A pid must be PLAUSIBLE before it is worth a liveness probe. A missing,
      // non-integer, or non-positive pid is an unidentifiable holder, not a
      // dead one — pidIsAlive() would answer "not alive" for pid<=0 and the
      // lock would be broken on the strength of garbage.
      const holderPid = holder && Number.isInteger(holder.pid) && holder.pid > 0
        ? holder.pid
        : null;
      if (holderPid !== null && pidIsAlive(holderPid)) {
        throw new Error(
          `${LOCK_HOLDER_MESSAGE} (live pid ${holderPid}, acquired `
          + `${holder.acquiredAt ?? 'unknown'})`,
        );
      }
      if (holderPid === null) {
        throw new Error(
          `${LOCK_HOLDER_MESSAGE}: the lock at ${target} records no readable `
          + 'pid, so its holder cannot be proven dead; refusing to break it '
          + '(remove the file deliberately to recover)',
        );
      }
      if (attempt === 1) {
        throw new Error(
          `${LOCK_HOLDER_MESSAGE}: the lock at ${target} was re-acquired by a `
          + 'contender while its stale holder was being cleared',
        );
      }
      // Crash residue: the recorded pid is gone. Break it EXACTLY ONCE and
      // IDENTITY-BOUND — never a bare unlink of whatever sits at the path.
      const outcome = breakStaleLockFile(target, observed);
      // ONLY the contender that actually moved the stale file may retry. A
      // loser that retried would race the winner's momentarily-free path.
      if (outcome === 'broke') continue;
      throw new Error(
        `${LOCK_HOLDER_MESSAGE}: the lock at ${target} was claimed by another `
        + `contender while its stale holder (pid ${holderPid}) was being `
        + `cleared (${outcome}); refusing to break a lock that is no longer `
        + 'the one that was proven dead',
      );
    }
    let payload;
    try {
      payload = Buffer.from(
        `${canonicalJson({ acquiredAt: new Date().toISOString(), pid: process.pid })}\n`,
        'utf8',
      );
      writeFileSync(descriptor, payload);
      fsyncSync(descriptor);
    } catch (error) {
      closeSync(descriptor);
      // We created this file in this call and never published ownership, so
      // remove it directly rather than through the ownership-verified release.
      try {
        unlinkSync(target);
      } catch {
        // Best-effort: an empty lock left here fails closed on the next
        // acquire (unidentifiable holder) rather than being broken blind.
      }
      throw error;
    }
    rememberOwnedLockFile(target, payload);
    return descriptor;
  }
  throw new Error(`${LOCK_HOLDER_MESSAGE}: ${target} could not be acquired`);
}

/**
 * Ownership-verified release. A bare unlink here would delete whatever lock
 * happens to be at the path — including a SUCCESSOR's lock, if this holder's
 * own lock had been broken meanwhile. Only the bytes this process wrote are
 * ever removed.
 */
export function releasePersistentStoreLock(storeDir) {
  releaseOwnedLockFile(lockPath(storeDir));
}

function withStoreLock(storeDir, callback) {
  mkdirSync(storeDir, { recursive: true });
  const descriptor = acquirePersistentStoreLock(storeDir);
  try {
    return callback();
  } finally {
    closeSync(descriptor);
    releasePersistentStoreLock(storeDir);
  }
}

export function initializePersistentStore({
  storeDir,
  trustedValidatorConfig,
  validatorReceipt,
  initialWorld,
}) {
  if (!trustedValidatorConfig) {
    throw new Error('Host trustedValidatorConfig is required');
  }
  const validatorVerification = verifyRuntimeInjectedValidator(
    validatorReceipt,
    { trustedConfig: trustedValidatorConfig },
  );
  if (!validatorVerification.valid) {
    throw new Error(
      `Cannot initialize untrusted validator state: `
      + `${validatorVerification.errors.join('; ')}`,
    );
  }
  assertWorldState(initialWorld, 'initial world');
  return withStoreLock(storeDir, () => {
    if (existsSync(statePath(storeDir))) {
      throw new Error('Persistent authorization store already exists');
    }
    const state = sealState({
      consumedAuthorizations: [],
      eventOutbox: [],
      lastAuthorizationSequence: -1,
      ledger: {
        entries: [],
        receiptRoot: GENESIS_RECEIPT_HASH,
      },
      revision: 0,
      runId: validatorReceipt.manifest.runId,
      schema: PHASE0B_STATE_SCHEMA,
      validatorConfigHash: validatorReceipt.configHash,
      validatorManifestHash: validatorReceipt.manifestHash,
      world: structuredClone(initialWorld),
    });
    writeAtomicState(storeDir, state);
    return state;
  });
}

function findPostWorld(execution, scheduleEntryId) {
  const snapshot = execution.publicStateSnapshots.find(
    (entry) => entry.payload.scheduleEntryId === scheduleEntryId,
  );
  if (!snapshot) {
    throw new Error(`No public-state snapshot for ${scheduleEntryId}`);
  }
  return structuredClone(snapshot.payload.publicState);
}

function buildPersistentReceipt({
  attemptPayload,
  verifiedAction,
  signedAction,
  admissionMatched,
  allowed,
  preWorld,
  postWorld,
  previousReceiptHash,
}) {
  const preimage = {
    admissionMatched,
    allowed,
    authorizationNonce: signedAction.authorization.nonce,
    authorizationSequence: signedAction.authorization.sequence,
    attemptDigest: canonicalDigest({
      payload: attemptPayload ?? null,
      verifiedActionEntryHash: verifiedAction.entryHash,
    }),
    entrypoint: signedAction.entrypoint,
    eventPublication: 'durable_outbox_after_atomic_commit',
    postWorldStateHash: canonicalDigest(postWorld),
    preWorldStateHash: canonicalDigest(preWorld),
    previousReceiptHash,
    scheduleEntryId: signedAction.scheduleEntryId,
    upstreamActionEntryHash: verifiedAction.entryHash,
    worldMutationCommitted:
      allowed && canonicalJson(preWorld) !== canonicalJson(postWorld),
  };
  return {
    ...preimage,
    receiptHash: canonicalDigest(preimage),
  };
}

function reconstructPersistentStateFromVerifiedRun({
  execution,
  runManifest,
  validatorReceipt,
}) {
  let world = structuredClone(
    execution.publicStateSnapshots[0]?.payload?.publicState,
  );
  assertWorldState(world, 'verified initial world');

  const consumedAuthorizations = [];
  const eventOutbox = [];
  const entries = [];
  let previousReceiptHash = GENESIS_RECEIPT_HASH;

  execution.actionLedger.forEach((verifiedAction, index) => {
    const signedAction = runManifest.actions[index];
    if (!signedAction) {
      throw new Error(`No signed action exists for persistent entry ${index}`);
    }
    if (
      canonicalDigest(world) !== verifiedAction.payload.prePublicStateHash
    ) {
      throw new Error(
        `Persistent entry ${index} pre-state differs from verified V4 action`,
      );
    }
    const verifiedPostWorld = findPostWorld(
      execution,
      verifiedAction.payload.scheduleEntryId,
    );
    if (
      canonicalDigest(verifiedPostWorld)
        !== verifiedAction.payload.postPublicStateHash
    ) {
      throw new Error(
        `Persistent entry ${index} post-state differs from verified V4 action`,
      );
    }

    const allowed = signedAction.expectedAllowed;
    const committedWorld = allowed
      ? structuredClone(verifiedPostWorld)
      : structuredClone(world);
    const persistentReceipt = buildPersistentReceipt({
      admissionMatched: true,
      allowed,
      attemptPayload: verifiedAction.payload,
      postWorld: committedWorld,
      preWorld: world,
      previousReceiptHash,
      signedAction,
      verifiedAction,
    });
    entries.push(persistentReceipt);
    consumedAuthorizations.push({
      nonce: signedAction.authorization.nonce,
      receiptHash: persistentReceipt.receiptHash,
      sequence: signedAction.authorization.sequence,
    });
    eventOutbox.push({
      eventId: `model-village-action-${signedAction.authorization.sequence}`,
      publication: 'post_commit_only',
      receiptHash: persistentReceipt.receiptHash,
    });
    previousReceiptHash = persistentReceipt.receiptHash;
    world = committedWorld;
  });

  return sealState({
    consumedAuthorizations,
    eventOutbox,
    lastAuthorizationSequence: entries.length - 1,
    ledger: {
      entries,
      receiptRoot: previousReceiptHash,
    },
    revision: entries.length,
    runId: validatorReceipt.manifest.runId,
    schema: PHASE0B_STATE_SCHEMA,
    validatorConfigHash: validatorReceipt.configHash,
    validatorManifestHash: validatorReceipt.manifestHash,
    world,
  });
}

async function verifyCommitSourceContext({
  cli,
  runManifest,
  sourceRun,
  sources,
  validatorReceipt,
  trustedValidatorConfig,
}) {
  if (!trustedValidatorConfig) {
    throw new Error('Host trustedValidatorConfig is required');
  }
  const validatorVerification = verifyRuntimeInjectedValidator(
    validatorReceipt,
    { trustedConfig: trustedValidatorConfig },
  );
  if (!validatorVerification.valid) {
    throw new Error(
      `Validator rejected source execution: `
      + `${validatorVerification.errors.join('; ')}`,
    );
  }
  if (
    canonicalJson(runManifest) !== canonicalJson(validatorReceipt.manifest)
  ) {
    throw new Error('Verified source execution manifest is not validator-signed');
  }
  const sourceVerification =
    await cli.verifyHeadlessExperimentSourceRunReceipt(
      sourceRun.sourceRunReceipt,
      sourceRun.execution,
      {
        behaviorSource: sources.behavior,
        planSource: sources.plan,
        worldSource: sources.world,
      },
    );
  if (!sourceVerification?.valid) {
    throw new Error(
      `Atomic commit requires a verified HoloScript V4 source run: `
      + `${canonicalJson(sourceVerification?.errors ?? [])}`,
    );
  }
  validateSourceRun(sourceRun, runManifest, {
    observerRequired: Boolean(sourceRun.observerProof),
  });
  return sourceVerification;
}

function commitVerifiedActionAttemptAtomically({
  storeDir,
  trustedValidatorConfig,
  validatorReceipt,
  verifiedAction,
  verifiedPostWorld,
  attemptPayload = verifiedAction.payload,
  faultInjection = 'none',
}) {
  const verification = verifyRuntimeInjectedValidator(
    validatorReceipt,
    { trustedConfig: trustedValidatorConfig },
  );
  if (!verification.valid) {
    throw new Error(
      `Validator rejected action attempt: ${verification.errors.join('; ')}`,
    );
  }
  assertObject(verifiedAction?.payload, 'verified action payload');
  assertWorldState(verifiedPostWorld, 'verified action postWorld');

  return withStoreLock(storeDir, () => {
    const state = readPersistentState(storeDir);
    if (
      state.validatorConfigHash !== validatorReceipt.configHash
      || state.validatorManifestHash !== validatorReceipt.manifestHash
      || state.runId !== validatorReceipt.manifest.runId
    ) {
      throw new Error('Persistent state validator/run anchor mismatch');
    }
    const expectedSequence = state.lastAuthorizationSequence + 1;
    if (verifiedAction.sequence < expectedSequence) {
      throw new Error(
        `Authorization sequence ${verifiedAction.sequence} was already consumed`,
      );
    }
    if (verifiedAction.sequence !== expectedSequence) {
      throw new Error(
        `Verified action sequence ${verifiedAction.sequence} is not the next `
        + `authorization ${expectedSequence}`,
      );
    }
    const signedAction = validatorReceipt.manifest.actions[expectedSequence];
    if (!signedAction) {
      throw new Error('No remaining signed authorization is available');
    }
    const admissionMatched =
      canonicalJson(attemptPayload ?? null)
        === canonicalJson(verifiedAction.payload);
    const allowed = admissionMatched && signedAction.expectedAllowed;
    const preWorld = structuredClone(state.world);
    if (
      canonicalDigest(preWorld)
      !== verifiedAction.payload.prePublicStateHash
    ) {
      throw new Error(
        'Verified action pre-state does not match durable world state',
      );
    }
    if (
      canonicalDigest(verifiedPostWorld)
      !== verifiedAction.payload.postPublicStateHash
    ) {
      throw new Error(
        'Verified action post-state does not match HoloScript V4 receipt',
      );
    }
    const committedWorld = allowed
      ? structuredClone(verifiedPostWorld)
      : preWorld;
    if (
      !allowed
      && canonicalJson(committedWorld) !== canonicalJson(preWorld)
    ) {
      throw new Error('Denied action attempted to mutate durable world state');
    }

    const persistentReceipt = buildPersistentReceipt({
      attemptPayload,
      verifiedAction,
      signedAction,
      admissionMatched,
      allowed,
      postWorld: committedWorld,
      preWorld,
      previousReceiptHash: state.ledger.receiptRoot,
    });
    const nextState = sealState({
      consumedAuthorizations: [
        ...state.consumedAuthorizations,
        {
          nonce: signedAction.authorization.nonce,
          receiptHash: persistentReceipt.receiptHash,
          sequence: signedAction.authorization.sequence,
        },
      ],
      eventOutbox: [
        ...state.eventOutbox,
        {
          eventId: `model-village-action-${signedAction.authorization.sequence}`,
          publication: 'post_commit_only',
          receiptHash: persistentReceipt.receiptHash,
        },
      ],
      lastAuthorizationSequence: signedAction.authorization.sequence,
      ledger: {
        entries: [...state.ledger.entries, persistentReceipt],
        receiptRoot: persistentReceipt.receiptHash,
      },
      revision: state.revision + 1,
      runId: state.runId,
      schema: state.schema,
      validatorConfigHash: state.validatorConfigHash,
      validatorManifestHash: state.validatorManifestHash,
      world: committedWorld,
    });
    writeAtomicState(storeDir, nextState, faultInjection);
    return {
      postCommitOutboxEvent: {
        eventId: `model-village-action-${signedAction.authorization.sequence}`,
        receiptHash: persistentReceipt.receiptHash,
      },
      persistentReceipt,
      state: nextState,
    };
  });
}

async function commitVerifiedAttemptFromSourceRun({
  actionIndex,
  attemptPayload,
  cli,
  faultInjection = 'none',
  runManifest,
  sourceRun,
  sources,
  storeDir,
  trustedValidatorConfig,
  validatorReceipt,
}) {
  await verifyCommitSourceContext({
    cli,
    runManifest,
    sourceRun,
    sources,
    trustedValidatorConfig,
    validatorReceipt,
  });
  const verifiedAction = sourceRun.execution.actionLedger[actionIndex];
  if (!verifiedAction) {
    throw new Error(`Verified action index ${actionIndex} is unavailable`);
  }
  return commitVerifiedActionAttemptAtomically({
    attemptPayload,
    faultInjection,
    storeDir,
    trustedValidatorConfig,
    validatorReceipt,
    verifiedAction,
    verifiedPostWorld: findPostWorld(
      sourceRun.execution,
      verifiedAction.payload.scheduleEntryId,
    ),
  });
}

async function commitExecutionAtomically({
  cli,
  faultInjection = {},
  runManifest,
  sourceRun,
  sources,
  storeDir,
  trustedValidatorConfig,
  validatorReceipt,
}) {
  const sourceVerification = await verifyCommitSourceContext({
    cli,
    runManifest,
    sourceRun,
    sources,
    trustedValidatorConfig,
    validatorReceipt,
  });
  const execution = sourceRun.execution;
  const initialWorld = execution.publicStateSnapshots[0]?.payload?.publicState;
  if (!existsSync(statePath(storeDir))) {
    initializePersistentStore({
      initialWorld,
      storeDir,
      trustedValidatorConfig,
      validatorReceipt,
    });
  }
  const commits = [];
  for (let index = 0; index < execution.actionLedger.length; index += 1) {
    const verifiedAction = execution.actionLedger[index];
    commits.push(commitVerifiedActionAttemptAtomically({
      faultInjection: faultInjection[index] ?? 'none',
      storeDir,
      trustedValidatorConfig,
      validatorReceipt,
      verifiedAction,
      verifiedPostWorld: findPostWorld(
        execution,
        verifiedAction.payload.scheduleEntryId,
      ),
    }));
  }
  const state = readPersistentState(storeDir);
  return { commits, sourceVerification, state };
}

function validateVisibleEmergencyStopBinding(visibleWorld) {
  const required = [
    'object "EmergencyStop" using "SafetyBoundary"',
    'on_interact: "request_experiment_freeze"',
    'boundedBridgeBehaviorSource: "source/proofs/model-village-phase0b-behavior.hsplus"',
    'boundedBridgeComposition: "ModelVillagePhase0BBehavior"',
    'boundedBridgeEntrypoint: "freeze_run"',
    'boundedBridgeFullyQualifiedEntrypoint: "ModelVillagePhase0BBehavior.freeze_run"',
    'boundedBridgeDispatchReason: "operator_emergency_stop"',
    'boundedBridgeTargetId: "EmergencyStop"',
    'boundedBridgeBindingStatus: "declared_for_receipted_phase0b_hololand_bridge"',
    'nativeLifecycleBindingClaimed: false',
    'cross_composition_binding_status: "not_observed"',
  ];
  const missing = required.filter((needle) => !visibleWorld.includes(needle));
  if (missing.length > 0) {
    throw new Error(
      `Visible .holo emergency-stop bridge declaration is incomplete: `
      + `${canonicalJson(missing)}`,
    );
  }
  const binding = {
    bindingMode: 'hololand_bounded_source_binding_bridge',
    dispatchReason: 'operator_emergency_stop',
    eventEntrypoint: 'request_experiment_freeze',
    sourceObjectId: 'EmergencyStop',
    targetBehaviorSource:
      'source/proofs/model-village-phase0b-behavior.hsplus',
    targetComposition: 'ModelVillagePhase0BBehavior',
    targetEntrypoint: 'freeze_run',
    targetId: 'EmergencyStop',
    visibleWorldSourceHash: sourceDigest(visibleWorld),
  };
  return {
    binding,
    bindingHash: canonicalDigest(binding),
    bindingStatus: 'declared_and_executed_by_bounded_hololand_bridge',
    boundedBridgeFullyQualifiedEntrypoint:
      'ModelVillagePhase0BBehavior.freeze_run',
    nativeLifecycleBindingClaimed: false,
    visibleObjectId: 'EmergencyStop',
  };
}

function validateEmergencyStopRun(run, runManifest, visibleBinding) {
  const execution = run.execution;
  if (
    run.sourceRunReceipt.schema !== SOURCE_RUN_SCHEMA
    || execution.actionLedger.length !== 1
    || execution.observationLedger.length !== 0
  ) {
    throw new Error('Emergency-stop source run schema/counts are invalid');
  }
  const action = execution.actionLedger[0];
  const expected = runManifest.emergencyStop;
  const dispatchRequest = {
    bindingHash: visibleBinding.bindingHash,
    eventEntrypoint: visibleBinding.binding.eventEntrypoint,
    reason: visibleBinding.binding.dispatchReason,
    sourceObjectId: visibleBinding.binding.sourceObjectId,
    targetBehaviorSource: visibleBinding.binding.targetBehaviorSource,
    targetComposition: visibleBinding.binding.targetComposition,
    targetEntrypoint: visibleBinding.binding.targetEntrypoint,
    targetIds: [visibleBinding.binding.targetId],
  };
  if (
    dispatchRequest.reason !== expected.args.reason
    || dispatchRequest.targetEntrypoint !== expected.entrypoint
    || canonicalJson(dispatchRequest.targetIds)
      !== canonicalJson(expected.targetIds)
  ) {
    throw new Error(
      'Visible .holo emergency-stop dispatch does not match the signed stop plan',
    );
  }
  for (const [field, value] of Object.entries({
    args: expected.args,
    authorization: expected.authorization,
    entrypoint: expected.entrypoint,
    scheduleEntryId: expected.scheduleEntryId,
    targetIds: expected.targetIds,
  })) {
    if (canonicalJson(action.payload[field]) !== canonicalJson(value)) {
      throw new Error(`Emergency-stop ${field} differs from signed manifest`);
    }
  }
  const finalState = execution.publicStateSnapshots.at(-1)?.payload?.publicState;
  if (
    action.payload.allowed !== true
    || action.payload.outcome !== expected.expectedOutcome
    || action.payload.stateChanged !== true
    || canonicalJson(finalState) !== canonicalJson(expected.expectedFinalState)
    || run.observerProof?.equivalent !== true
    || run.observerProof?.observerIntroducedExperimentExecutionCount !== 0
  ) {
    throw new Error('Emergency-stop execution did not fail dark/freeze the run');
  }
  const unsignedSafetyReceipt = {
    actionEntryHash: action.entryHash,
    bindingHash: visibleBinding.bindingHash,
    decision: 'freeze_run',
    dispatchRequestHash: canonicalDigest(dispatchRequest),
    finalPublicStateHash: execution.terminal.finalPublicStateHash,
    schema: 'hololand.model-village-phase0b-safety-receipt.v1',
    sourceRunCommitment: run.sourceRunReceipt.sourceRunCommitment,
    targetIds: structuredClone(action.payload.targetIds),
    validatorManifestHash: canonicalDigest(runManifest),
  };
  return {
    dispatchRequest,
    executionReceipt: structuredClone(run.execution),
    finalPublicState: structuredClone(finalState),
    observerProof: structuredClone(run.observerProof),
    safetyReceipt: {
      ...unsignedSafetyReceipt,
      receiptHash: canonicalDigest(unsignedSafetyReceipt),
    },
    sourceRunReceipt: structuredClone(run.sourceRunReceipt),
    terminalCommitment: execution.terminal.terminalCommitment,
  };
}

function outerReceiptHash(value) {
  const unsigned = { ...value };
  delete unsigned.receipt;
  return canonicalDigest(unsigned);
}

export function verifyPhase0BReceiptSelfIntegrity(value) {
  try {
    return (
      value?.receipt?.receiptHash === outerReceiptHash(value)
      && value.receipt.rawModelResponsesIncluded === false
      // ABSENT EVIDENCE BLOCKS: an unmeasured window can never read as clean.
      && value.receipt.providerCallMeasurement === 'measured'
      && value.runtime?.providerFence?.measured === true
      // The unhashed summary must equal the hash-bound observation it claims to
      // summarize; editing one alone breaks the identity.
      && value.receipt.providerCallsMadeByTracer
        === value.runtime.providerFence.providerFetchCallsObserved
      && value.receipt.providerCallsMadeByTracer === 0
    );
  } catch {
    return false;
  }
}

export function verifyPhase0BReceiptHash(value) {
  return verifyPhase0BReceiptSelfIntegrity(value);
}

export async function verifyPhase0BReceipt(
  value,
  { root: rootOption, trustedValidatorConfig } = {},
) {
  const errors = [];
  try {
    if (!verifyPhase0BReceiptSelfIntegrity(value)) {
      throw new Error('Phase 0B receipt self-integrity check failed');
    }
    assertExactKeys(
      value,
      [
        'assertions',
        'claimBoundary',
        'emergencyStop',
        'generatedAt',
        'manifests',
        'persistence',
        'receipt',
        'replay',
        'runtime',
        'schema',
        'sources',
        'status',
        'validator',
      ],
      'Phase 0B outer receipt',
    );
    assertExactKeys(
      value.receipt,
      [
        'providerCallMeasurement',
        'providerCallsMadeByTracer',
        'rawModelPromptsIncluded',
        'rawModelResponsesIncluded',
        'receiptHash',
      ],
      'Phase 0B self-integrity receipt',
    );
    // The provider-call gate. It runs against the OBSERVATION the fence
    // produced, not against a constant this verifier also wrote: an unmeasured
    // window, a counter below its own incident log, a misclassified target, or
    // any nonzero provider count fails here.
    const providerFenceFailures = [
      ...verifyProviderCallObservation(value.runtime?.providerFence, {
        label: 'Phase 0B receipt runtime.providerFence',
      }),
      ...verifyProviderCallObservation(value.replay?.providerFence, {
        label: 'Phase 0B receipt replay.providerFence',
      }),
      // The separate PROCESS is not covered by any fence in this one, so its own
      // window is verified here with the identical rule set. An absent or
      // unmeasured child observation fails; it never reads as a clean zero.
      ...verifyProviderCallObservation(
        value.persistence?.separateProcessProviderFence,
        {
          label: 'Phase 0B receipt persistence.separateProcessProviderFence',
        },
      ),
    ];
    if (
      value.replay?.providerFence?.measured === true
      && value.runtime?.providerFence?.measured === true
      && value.replay.providerFence.fetchCallsObserved
        > value.runtime.providerFence.fetchCallsObserved
    ) {
      providerFenceFailures.push(
        'the fresh-replay provider-call sub-window recorded more fetch calls '
        + 'than the whole tracer window that contains it',
      );
    }
    if (
      value.runtime?.providerCalls
      !== value.runtime?.providerFence?.providerFetchCallsObserved
      || value.replay?.providerCalls
        !== value.replay?.providerFence?.providerFetchCallsObserved
    ) {
      providerFenceFailures.push(
        'a published providerCalls value does not equal the fence counter it '
        + 'projects; the summary and the measurement disagree',
      );
    }
    if (providerFenceFailures.length > 0) {
      throw new Error(providerFenceFailures.join('; '));
    }
    const assertionKeys = [
      'atomicActionAdmissionAndWorldMutation',
      'atomicCommitBoundToVerifiedV4SourceRun',
      'capturedResponseHashesBound',
      'canonicalTwelveObjectWorldProjectionMatches',
      'challengeAndMetricManifestsFrozenAndHashed',
      'emergencyStopBridgeExecuted',
      'faultAfterRenameRecoversCompleteState',
      'faultBeforeRenameLeavesOldState',
      'freshCapturedResponseReplayMatches',
      'hostSuppliedValidatorConfigPinned',
      'observerIntroducedNoExecution',
      'observerProjectionToggleEquivalent',
      'persistentAuthorizationMonotonic',
      'separateProcessPersistentStateRecovery',
      'sourceRunV4Verified',
      'trustedValidatorCryptographicallyVerified',
    ];
    assertExactKeys(value.assertions, assertionKeys, 'Phase 0B assertions');
    if (
      value.schema !== PHASE0B_RECEIPT_SCHEMA
      || value.status !== 'pass'
      || !value.assertions
      || !Object.values(value.assertions).every((passed) => passed === true)
      || typeof value.generatedAt !== 'string'
      || Number.isNaN(Date.parse(value.generatedAt))
    ) {
      throw new Error('Phase 0B receipt identity/status/assertions are invalid');
    }
    const boundary = value.claimBoundary;
    if (!trustedValidatorConfig) {
      throw new Error('Full receipt verification requires host trustedValidatorConfig');
    }
    if (!Object.isFrozen(trustedValidatorConfig)) {
      throw new Error(
        'Full receipt verification requires a frozen host trustedValidatorConfig',
      );
    }
    const expectedBoundary = {
      boundedHoloToHsplusStopDispatchExecuted: true,
      boundedHsplusEntrypointExecuted: true,
      capturedResponseFixturesReplayed: 2,
      fullHoloWorldExecutionClaimed: false,
      fullHsLanguageExecutionClaimed: false,
      fullHsplusLanguageExecutionClaimed: false,
      hololandCrossCompositionBridgeExecuted: true,
      liveModelProviderCallsClaimed: false,
      nativeHoloLifecycleExecutionClaimed: false,
      nativeHsplusEngineExecutionClaimed: false,
      physicsEngineExecutionClaimed: false,
      processCrashDurabilityClaimed: false,
      productionDistributedTransactionClaimed: false,
      productionValidatorTrustClaimed: false,
      scientificOutcomeClaimed: false,
      transactionScope:
        'verified_v4_per_action_single_host_file_atomic_bridge',
      trustedValidatorInjection: 'caller_supplied_frozen_host_config',
      trustedValidatorKeyCustody: trustedValidatorConfig.keyCustody,
      worldRuntimeLifecycleExecuted: false,
    };
    if (
      !boundary
      || canonicalJson(boundary) !== canonicalJson(expectedBoundary)
      || value.receipt.rawModelPromptsIncluded !== false
      || value.receipt.rawModelResponsesIncluded !== false
      || value.receipt.providerCallsMadeByTracer !== 0
    ) {
      throw new Error('Phase 0B receipt claim boundary is invalid');
    }
    const validatorVerification = verifyRuntimeInjectedValidator(
      value.validator?.validatorReceipt,
      { trustedConfig: trustedValidatorConfig },
    );
    if (!validatorVerification.valid) {
      throw new Error(
        `Full receipt validator verification failed: `
        + `${validatorVerification.errors.join('; ')}`,
      );
    }
    const validatorReceipt = value.validator.validatorReceipt;
    const expectedValidator = {
      config: structuredClone(validatorReceipt.config),
      configHash: validatorReceipt.configHash,
      manifestHash: validatorReceipt.manifestHash,
      registryReceiptId: validatorReceipt.config.registryReceiptId,
      signatureVerified: true,
      signedPayloadHash: validatorReceipt.signedPayloadHash,
      trustAnchorOrigin: 'caller_supplied_host_config',
      validatorReceipt: structuredClone(validatorReceipt),
    };
    if (canonicalJson(value.validator) !== canonicalJson(expectedValidator)) {
      throw new Error('Full receipt validator summary differs from trusted receipt');
    }
    if (
      canonicalJson(value.sources) !== canonicalJson(PHASE0B_SOURCE_PATHS)
    ) {
      throw new Error('Full receipt source paths differ from the canonical bundle');
    }

    const root = path.resolve(
      rootOption
        ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
    );
    const holoScript = await loadHoloScript(root);
    const rawSources = Object.fromEntries(
      Object.entries(PHASE0B_SOURCE_PATHS)
        .map(([key, relativePath]) => [key, readSource(root, relativePath)]),
    );
    const canonicalWorldProjection = validateCanonicalTwelveObjectProjection(
      rawSources.visibleWorld,
      rawSources.world,
    );
    const manifests = instantiatePhase1Manifests({
      core: holoScript.core,
      source: rawSources.manifests,
    });
    const hydratedPlan = hydratePlanSource(rawSources.plan, manifests);
    const plan = parsePlanSource(hydratedPlan, 'Phase 0B verifier plan');
    const stopPlan = parsePlanSource(
      rawSources.stopPlan,
      'Phase 0B verifier stop plan',
    );
    const executionSources = {
      behavior: rawSources.behavior,
      plan: hydratedPlan,
      planTemplate: rawSources.plan,
      stopPlan: rawSources.stopPlan,
      visibleWorld: rawSources.visibleWorld,
      world: rawSources.world,
    };
    const runManifest = buildRunManifest({
      manifests,
      plan,
      sources: executionSources,
      stopPlan,
    });
    if (
      canonicalJson(runManifest)
      !== canonicalJson(value.validator.validatorReceipt.manifest)
    ) {
      throw new Error('Full receipt manifest differs from canonical source inputs');
    }
    const expectedManifestSummary = {
      bundleId: manifests.bundle.bundleId,
      capturedResponses: manifests.capturedResponses,
      challengeIds: manifests.challengeManifest.challenges.map(
        (entry) => entry.challengeId,
      ),
      challengeManifestHash: manifests.challengeManifestHash,
      frozenBeforeFirstTurn: manifests.bundle.frozenBeforeFirstTurn,
      metricSpecHash: manifests.metricSpecHash,
      metricSpecId: manifests.metricSpec.metricSpecId,
      rawResponsesIncluded: false,
      sourceHash: manifests.sourceHash,
    };
    if (
      canonicalJson(value.manifests)
        !== canonicalJson(expectedManifestSummary)
    ) {
      throw new Error('Full receipt manifest summary anchors differ');
    }

    const mainRun = {
      claimBoundary: value.runtime.sourceClaimBoundary,
      execution: value.runtime.executionReceipt,
      observerProof: value.runtime.observerProof,
      sourceRunReceipt: value.runtime.sourceRunReceipt,
    };
    const mainSourceVerification =
      await holoScript.cli.verifyHeadlessExperimentSourceRunReceipt(
        mainRun.sourceRunReceipt,
        mainRun.execution,
        {
          behaviorSource: executionSources.behavior,
          planSource: executionSources.plan,
          worldSource: executionSources.world,
        },
      );
    if (!mainSourceVerification?.valid) {
      throw new Error(
        `Full receipt V4 verification failed: `
        + `${canonicalJson(mainSourceVerification?.errors ?? [])}`,
      );
    }
    const executionSummary = validateSourceRun(
      mainRun,
      runManifest,
      { observerRequired: true },
    );
    const freshReplay = await executeSourceRun(
      holoScript.cli,
      {
        behavior: executionSources.behavior,
        plan: executionSources.plan,
        world: executionSources.world,
      },
      'off',
    );
    validateSourceRun(freshReplay.run, runManifest, {
      observerRequired: false,
    });
    const observerProjection = buildPhase0BObserverProjectionWitness({
      sealedSourceRun: mainRun,
    });
    const expectedRuntime = {
      actionDecisions: executionSummary.actionDecisions,
      boundedHsplusSubsetActionsExecuted: 2,
      capturedResponsesConsumed: 2,
      counts: executionSummary.counts,
      executionReceipt: structuredClone(mainRun.execution),
      finalPublicState: executionSummary.finalPublicState,
      observationSubjects: executionSummary.observationSubjects,
      observerProof: structuredClone(mainRun.observerProof),
      observerProjection,
      // Carried from the receipt, NOT rebuilt from a constant: the value was
      // already gated above by verifyProviderCallObservation, which is where the
      // provider-call claim is actually decided. Rebuilding a literal here is
      // what made the original claim unfalsifiable.
      providerCalls: value.runtime?.providerCalls,
      providerFence: value.runtime?.providerFence,
      worldProjection: canonicalWorldProjection,
      sourceBundleHash: executionSummary.sourceBundleHash,
      sourceClaimBoundary: structuredClone(freshReplay.run.claimBoundary),
      sourceRunCommitment: executionSummary.sourceRunCommitment,
      sourceRunReceipt: structuredClone(mainRun.sourceRunReceipt),
      sourceRunSchema: mainRun.sourceRunReceipt.schema,
      terminalCommitment: executionSummary.terminalCommitment,
    };
    if (canonicalJson(value.runtime) !== canonicalJson(expectedRuntime)) {
      throw new Error('Full receipt runtime summary differs from verified V4 run');
    }
    const expectedReplay = {
      comparedFields: [
        'ordered_action_decisions',
        'ordered_post_state_hashes',
        'action_root',
        'final_public_state_hash',
        'source_run_commitment',
        'terminal_commitment',
      ],
      freshExecutionCount: 1,
      match: true,
      projectionHash: canonicalDigest(replayProjection(mainRun)),
      providerCalls: value.replay?.providerCalls,
      providerFence: value.replay?.providerFence,
    };
    if (
      canonicalJson(replayProjection(mainRun))
        !== canonicalJson(replayProjection(freshReplay.run))
      || canonicalJson(value.replay) !== canonicalJson(expectedReplay)
    ) {
      throw new Error('Full receipt fresh replay verification failed');
    }
    validatePersistentState(value.persistence?.stateReceipt);
    const expectedPersistentState = reconstructPersistentStateFromVerifiedRun({
      execution: mainRun.execution,
      runManifest,
      validatorReceipt: value.validator.validatorReceipt,
    });
    const expectedPersistence = {
      atomicActionReceiptsCommitted:
        expectedPersistentState.ledger.entries.length,
      authorizationAttemptsConsumed:
        expectedPersistentState.consumedAuthorizations.length,
      deniedAttemptsConsumed:
        expectedPersistentState.ledger.entries.filter(
          (entry) => !entry.allowed,
        ).length,
      eventPublication: 'durable_outbox_after_atomic_commit',
      faultAfterRename:
        'injected_process_level_complete_new_state_recovered',
      faultBeforeRename:
        'injected_process_level_old_state_recovered',
      finalStateHash: expectedPersistentState.stateHash,
      lastAuthorizationSequence:
        expectedPersistentState.lastAuthorizationSequence,
      malformedHashAttemptBurnedAndDenied: true,
      mismatchedTargetAttemptBurnedAndDenied: true,
      receiptRoot: expectedPersistentState.ledger.receiptRoot,
      replayAfterRestartRejected: true,
      restartRecovered: true,
      sameProcessRereadRecovered: true,
      // Carried, NOT rebuilt: this observation was taken inside the fresh child
      // process and is gated above by verifyProviderCallObservation. Rebuilding
      // a literal here is the pattern that made the original claim
      // unfalsifiable.
      separateProcessProviderFence:
        value.persistence?.separateProcessProviderFence,
      separateProcessRereadRecovered: true,
      stateReceipt: expectedPersistentState,
      stateSchema: expectedPersistentState.schema,
      storePathIncluded: false,
    };
    if (
      canonicalJson(value.persistence) !== canonicalJson(expectedPersistence)
    ) {
      throw new Error(
        'Full receipt persistent state differs from the verified V4 action sequence',
      );
    }

    const visibleBinding = validateVisibleEmergencyStopBinding(
      rawSources.visibleWorld,
    );
    const stopRun = {
      execution: value.emergencyStop.executionReceipt,
      observerProof: value.emergencyStop.observerProof,
      sourceRunReceipt: value.emergencyStop.sourceRunReceipt,
    };
    const stopSourceVerification =
      await holoScript.cli.verifyHeadlessExperimentSourceRunReceipt(
        stopRun.sourceRunReceipt,
        stopRun.execution,
        {
          behaviorSource: executionSources.behavior,
          planSource: executionSources.stopPlan,
          worldSource: executionSources.world,
        },
      );
    if (!stopSourceVerification?.valid) {
      throw new Error(
        `Full emergency-stop V4 verification failed: `
        + `${canonicalJson(stopSourceVerification?.errors ?? [])}`,
      );
    }
    const stopSummary = validateEmergencyStopRun(
      stopRun,
      runManifest,
      visibleBinding,
    );
    const expectedEmergencyStop = {
      ...stopSummary,
      visibleBinding,
    };
    if (
      canonicalJson(value.emergencyStop)
        !== canonicalJson(expectedEmergencyStop)
    ) {
      throw new Error(
        'Full emergency-stop payload differs from the verified V4 stop run',
      );
    }
  } catch (error) {
    errors.push(error.message || String(error));
  }
  return {
    errors,
    valid: errors.length === 0,
  };
}

function makeDefaultStoreDir(root, label) {
  return path.join(
    root,
    '.tmp',
    'hololand',
    'model-village',
    'phase0b-runtime',
    `${label}-${process.pid}-${randomUUID()}`,
  );
}

/**
 * Reads the persisted state hash in a FRESH PROCESS, with the provider-call
 * fence installed inside that process.
 *
 * The child has its own globals, so the tracer's fence structurally cannot see
 * anything it does — this spawn was a real hole in the lane's zero-provider-call
 * claim, not a hypothetical one. The child therefore installs the same fence
 * (resolved relative to the module URL it is already given, so a seam-tree copy
 * fences against its own sibling) and prints its own observation back, which the
 * caller verifies with the same rule set it applies to its own windows. A child
 * that prints no observation is UNMEASURED and throws.
 */
function readPersistentStateHashInFreshProcess(storeDir) {
  const program = `
    const moduleUrl = process.argv[1];
    const storeDir = process.argv[2];
    const fenceUrl = new URL(
      './model-village-provider-call-fence.mjs',
      moduleUrl,
    ).href;
    const fenceModule = await import(fenceUrl);
    const fence = fenceModule.installProviderCallFence();
    const runtime = await import(moduleUrl);
    const stateHash = runtime.readPersistentState(storeDir).stateHash;
    process.stdout.write(JSON.stringify({
      providerFence: fenceModule.summarizeProviderCallFence(fence, {
        window: 'phase0b-fresh-process-persistent-state-read',
      }),
      stateHash,
    }));
  `;
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      program,
      import.meta.url,
      storeDir,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (child.status !== 0) {
    throw new Error(
      `Fresh-process persistent-state recovery failed: `
      + `${String(child.stderr || child.stdout).trim()}`,
    );
  }
  let reported;
  try {
    reported = JSON.parse(String(child.stdout).trim());
  } catch (error) {
    throw new Error(
      `Fresh-process persistent-state recovery produced no provider-call `
      + `observation (${error?.message || String(error)}); an unmeasured child `
      + `process cannot be reported as a clean one`,
    );
  }
  const observation = reported?.providerFence
    ?? unmeasuredProviderCallObservation(
      'phase0b-fresh-process-persistent-state-read',
      'the fresh process published no provider-call observation',
    );
  const failures = verifyProviderCallObservation(observation, {
    label: 'Phase 0B fresh-process persistent-state read',
  });
  if (failures.length > 0) {
    throw new Error(
      `Phase 0B fresh-process provider-call measurement failed: `
      + `${failures.join('; ')}`,
    );
  }
  return {
    providerFence: observation,
    stateHash: String(reported.stateHash ?? '').trim(),
  };
}

export async function runPhase0BEngineeringTracer(options = {}) {
  // The fence goes up BEFORE the HoloScript CLI/core are even imported, so the
  // parser's own WASM initialization is inside the measured window rather than
  // ahead of it. Restored in the finally at the end of this function.
  const providerFence = installProviderCallFence();
  try {
    return await runPhase0BEngineeringTracerFenced(options, providerFence);
  } finally {
    providerFence.restore();
  }
}

async function runPhase0BEngineeringTracerFenced(options, providerFence) {
  const root = path.resolve(
    options.root
      ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
  const holoScript = await loadHoloScript(root);
  const rawSources = Object.fromEntries(
    Object.entries(PHASE0B_SOURCE_PATHS)
      .map(([key, relativePath]) => [key, readSource(root, relativePath)]),
  );
  const canonicalWorldProjection = validateCanonicalTwelveObjectProjection(
    rawSources.visibleWorld,
    rawSources.world,
  );
  const manifests = instantiatePhase1Manifests({
    core: holoScript.core,
    source: rawSources.manifests,
  });
  const hydratedPlan = hydratePlanSource(rawSources.plan, manifests);
  const plan = parsePlanSource(hydratedPlan, 'Phase 0B tracer plan');
  const stopPlan = parsePlanSource(rawSources.stopPlan, 'Phase 0B stop plan');
  const executionSources = {
    behavior: rawSources.behavior,
    plan: hydratedPlan,
    planTemplate: rawSources.plan,
    stopPlan: rawSources.stopPlan,
    visibleWorld: rawSources.visibleWorld,
    world: rawSources.world,
  };
  const runManifest = buildRunManifest({
    manifests,
    plan,
    sources: executionSources,
    stopPlan,
  });
  const trustedValidatorConfig = options.trustedValidatorConfig;
  const signRunManifest = options.signRunManifest;
  if (
    !trustedValidatorConfig
    || Object.isFrozen(trustedValidatorConfig) !== true
    || typeof signRunManifest !== 'function'
  ) {
    throw new Error(
      'runPhase0BEngineeringTracer requires separate frozen '
      + 'trustedValidatorConfig and host signRunManifest inputs',
    );
  }
  const validatorReceipt = signRunManifest(runManifest);
  const validatorVerification = verifyRuntimeInjectedValidator(
    validatorReceipt,
    {
      trustedConfig: trustedValidatorConfig,
    },
  );
  if (!validatorVerification.valid) {
    throw new Error(
      `Runtime-injected validator rejected its receipt: `
      + `${validatorVerification.errors.join('; ')}`,
    );
  }

  const first = await executeSourceRun(
    holoScript.cli,
    {
      behavior: executionSources.behavior,
      plan: executionSources.plan,
      world: executionSources.world,
    },
    'on',
  );
  const executionSummary = validateSourceRun(
    first.run,
    runManifest,
    { observerRequired: true },
  );
  // Sub-window: the fresh replay only. `replay.providerCalls` is this delta, not
  // a constant that happens to read zero.
  const replayFenceCursor = snapshotProviderFence(providerFence);
  const freshReplay = await executeSourceRun(
    holoScript.cli,
    {
      behavior: executionSources.behavior,
      plan: executionSources.plan,
      world: executionSources.world,
    },
    'off',
  );
  validateSourceRun(freshReplay.run, runManifest, { observerRequired: false });
  const replayProviderObservation = summarizeProviderCallFence(providerFence, {
    since: replayFenceCursor,
    window: 'phase0b-fresh-captured-response-replay',
  });
  const observerProjection = buildPhase0BObserverProjectionWitness({
    sealedSourceRun: first.run,
  });
  const firstProjection = replayProjection(first.run);
  const replayProjectionValue = replayProjection(freshReplay.run);
  const replayMatch =
    canonicalJson(firstProjection) === canonicalJson(replayProjectionValue);
  if (!replayMatch) {
    throw new Error('Fresh captured-response source replay is not deterministic');
  }

  const storeDir = path.resolve(
    options.storeDir ?? makeDefaultStoreDir(root, 'main'),
  );
  const commitSources = {
    behavior: executionSources.behavior,
    plan: executionSources.plan,
    world: executionSources.world,
  };
  const atomicCommit = await commitExecutionAtomically({
    cli: holoScript.cli,
    runManifest,
    sourceRun: first.run,
    sources: commitSources,
    storeDir,
    trustedValidatorConfig,
    validatorReceipt,
  });
  const recoveredState = readPersistentState(storeDir);
  const restartRecovered =
    recoveredState.stateHash === atomicCommit.state.stateHash
    && recoveredState.lastAuthorizationSequence === 1;
  const freshProcessRead = readPersistentStateHashInFreshProcess(storeDir);
  const separateProcessRecovery =
    freshProcessRead.stateHash === recoveredState.stateHash;
  let replayRejected = false;
  const beforeReplayStateHash = recoveredState.stateHash;
  try {
    await commitExecutionAtomically({
      cli: holoScript.cli,
      runManifest,
      sourceRun: first.run,
      sources: commitSources,
      storeDir,
      trustedValidatorConfig,
      validatorReceipt,
    });
  } catch (error) {
    replayRejected = /already consumed|No remaining signed authorization/.test(
      error.message,
    );
  }
  const afterReplayState = readPersistentState(storeDir);
  if (!replayRejected || afterReplayState.stateHash !== beforeReplayStateHash) {
    throw new Error('Persistent authorization replay was not fail-dark');
  }

  const beforeRenameStore = makeDefaultStoreDir(root, 'fault-before-rename');
  initializePersistentStore({
    initialWorld: first.run.execution.publicStateSnapshots[0].payload.publicState,
    storeDir: beforeRenameStore,
    trustedValidatorConfig,
    validatorReceipt,
  });
  const beforeFaultHash = readPersistentState(beforeRenameStore).stateHash;
  let beforeRenameFaultObserved = false;
  try {
    await commitVerifiedAttemptFromSourceRun({
      actionIndex: 0,
      cli: holoScript.cli,
      faultInjection: 'before_rename',
      runManifest,
      sourceRun: first.run,
      sources: commitSources,
      storeDir: beforeRenameStore,
      trustedValidatorConfig,
      validatorReceipt,
    });
  } catch (error) {
    beforeRenameFaultObserved = /injected fault before atomic rename/.test(error.message);
  }
  const afterBeforeFault = readPersistentState(beforeRenameStore);
  if (!beforeRenameFaultObserved || afterBeforeFault.stateHash !== beforeFaultHash) {
    throw new Error('Pre-rename fault exposed a partial persistent transaction');
  }

  const afterRenameStore = makeDefaultStoreDir(root, 'fault-after-rename');
  initializePersistentStore({
    initialWorld: first.run.execution.publicStateSnapshots[0].payload.publicState,
    storeDir: afterRenameStore,
    trustedValidatorConfig,
    validatorReceipt,
  });
  let afterRenameFaultObserved = false;
  try {
    await commitVerifiedAttemptFromSourceRun({
      actionIndex: 0,
      cli: holoScript.cli,
      faultInjection: 'after_rename',
      runManifest,
      sourceRun: first.run,
      sources: commitSources,
      storeDir: afterRenameStore,
      trustedValidatorConfig,
      validatorReceipt,
    });
  } catch (error) {
    afterRenameFaultObserved = /injected fault after atomic rename/.test(error.message);
  }
  const afterRenameRecovered = readPersistentState(afterRenameStore);
  if (
    !afterRenameFaultObserved
    || afterRenameRecovered.revision !== 1
    || afterRenameRecovered.lastAuthorizationSequence !== 0
  ) {
    throw new Error('Post-rename recovery did not expose the complete commit');
  }

  const exerciseBurnOnMismatch = async (label, mutateAttempt) => {
    const mismatchStore = makeDefaultStoreDir(root, label);
    initializePersistentStore({
      initialWorld:
        first.run.execution.publicStateSnapshots[0].payload.publicState,
      storeDir: mismatchStore,
      trustedValidatorConfig,
      validatorReceipt,
    });
    const attemptPayload = structuredClone(
      first.run.execution.actionLedger[0].payload,
    );
    mutateAttempt(attemptPayload);
    const mismatchCommit = await commitVerifiedAttemptFromSourceRun({
      actionIndex: 0,
      attemptPayload,
      cli: holoScript.cli,
      runManifest,
      sourceRun: first.run,
      sources: commitSources,
      storeDir: mismatchStore,
      trustedValidatorConfig,
      validatorReceipt,
    });
    const stateAfterMismatch = readPersistentState(mismatchStore);
    const stateHashAfterMismatch = stateAfterMismatch.stateHash;
    let retryRejected = false;
    try {
      await commitVerifiedAttemptFromSourceRun({
        actionIndex: 0,
        cli: holoScript.cli,
        runManifest,
        sourceRun: first.run,
        sources: commitSources,
        storeDir: mismatchStore,
        trustedValidatorConfig,
        validatorReceipt,
      });
    } catch (error) {
      retryRejected = /already consumed/.test(error.message);
    }
    const stateAfterRetry = readPersistentState(mismatchStore);
    if (
      mismatchCommit.persistentReceipt.admissionMatched !== false
      || mismatchCommit.persistentReceipt.allowed !== false
      || mismatchCommit.persistentReceipt.worldMutationCommitted !== false
      || stateAfterMismatch.lastAuthorizationSequence !== 0
      || canonicalJson(stateAfterMismatch.world)
        !== canonicalJson(
          first.run.execution.publicStateSnapshots[0].payload.publicState,
        )
      || !retryRejected
      || stateAfterRetry.stateHash !== stateHashAfterMismatch
    ) {
      throw new Error(`${label} did not burn once and fail dark`);
    }
    return {
      authorizationBurned: true,
      retryRejected,
      stateHash: stateAfterMismatch.stateHash,
      worldMutationCommitted: false,
    };
  };
  const mismatchedTargetAttempt = await exerciseBurnOnMismatch(
    'mismatch-target',
    (payload) => {
      payload.targetIds = ['attacker-selected-target'];
    },
  );
  const malformedHashAttempt = await exerciseBurnOnMismatch(
    'mismatch-state-hashes',
    (payload) => {
      delete payload.prePublicStateHash;
      payload.postPublicStateHash = 'not-a-valid-state-hash';
    },
  );

  const visibleStopBinding = validateVisibleEmergencyStopBinding(
    rawSources.visibleWorld,
  );
  const stopSourceRun = await executeSourceRun(
    holoScript.cli,
    {
      behavior: executionSources.behavior,
      plan: executionSources.stopPlan,
      world: executionSources.world,
    },
    'on',
  );
  const emergencyStop = validateEmergencyStopRun(
    stopSourceRun.run,
    runManifest,
    visibleStopBinding,
  );

  const assertions = {
    atomicActionAdmissionAndWorldMutation:
      atomicCommit.state.revision === 2
      && atomicCommit.state.ledger.entries[0].worldMutationCommitted === true
      && atomicCommit.state.ledger.entries[1].worldMutationCommitted === false
      && atomicCommit.state.ledger.entries[1].allowed === false,
    atomicCommitBoundToVerifiedV4SourceRun:
      atomicCommit.sourceVerification.valid === true,
    capturedResponseHashesBound:
      runManifest.actions.every((action, index) => (
        action.args.capturedResponseHash
          === manifests.capturedResponses[index].responseHash
      )),
    canonicalTwelveObjectWorldProjectionMatches:
      canonicalWorldProjection.objectCount === 12
      && canonicalWorldProjection.exactIdsAndTransformsMatch === true,
    challengeAndMetricManifestsFrozenAndHashed:
      manifests.bundle.frozenBeforeFirstTurn === true
      && SHA256_PATTERN.test(manifests.challengeManifestHash)
      && SHA256_PATTERN.test(manifests.metricSpecHash),
    emergencyStopBridgeExecuted:
      emergencyStop.finalPublicState.emergencyStopState === 'triggered'
      && emergencyStop.finalPublicState.phase === 'frozen'
      && emergencyStop.dispatchRequest.bindingHash
        === visibleStopBinding.bindingHash
      && emergencyStop.safetyReceipt.bindingHash
        === visibleStopBinding.bindingHash,
    faultBeforeRenameLeavesOldState:
      afterBeforeFault.stateHash === beforeFaultHash,
    faultAfterRenameRecoversCompleteState:
      afterRenameRecovered.revision === 1,
    freshCapturedResponseReplayMatches: replayMatch,
    hostSuppliedValidatorConfigPinned:
      validatorVerification.valid
      && validatorReceipt.configHash === canonicalDigest(trustedValidatorConfig),
    observerIntroducedNoExecution:
      first.run.observerProof.observerIntroducedExperimentExecutionCount === 0,
    observerProjectionToggleEquivalent:
      observerProjection.projectionToggleExecuted === true
      && observerProjection.comparison.sevenFieldsEqual === true
      && observerProjection.comparison.sourceRunCommitmentEqual === true
      && observerProjection.comparison.terminalCommitmentEqual === true
      && observerProjection.claimBoundary
        .observerIntroducedExperimentExecutionCount === 0,
    persistentAuthorizationMonotonic:
      recoveredState.lastAuthorizationSequence === 1
      && recoveredState.consumedAuthorizations.length === 2
      && replayRejected
      && mismatchedTargetAttempt.authorizationBurned
      && malformedHashAttempt.authorizationBurned,
    separateProcessPersistentStateRecovery: separateProcessRecovery,
    sourceRunV4Verified:
      first.verification.valid === true
      && freshReplay.verification.valid === true
      && stopSourceRun.verification.valid === true,
    trustedValidatorCryptographicallyVerified: validatorVerification.valid,
  };
  const failedAssertions = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedAssertions.length > 0) {
    throw new Error(
      `Phase 0B engineering tracer assertions failed: `
      + `${failedAssertions.join(', ')}`,
    );
  }

  // SEAL THE MEASUREMENT. Everything the tracer claims to have executed has now
  // run; this snapshot is the window the receipt publishes. It is taken BEFORE
  // the receipt is built so the number in the receipt is an observation the
  // tracer made, never one it asserted.
  const providerObservation = summarizeProviderCallFence(providerFence, {
    window: 'phase0b-tracer-execution-through-receipt-seal',
  });
  const providerObservationFailures = verifyProviderCallObservation(
    providerObservation,
    { label: 'Phase 0B tracer provider-call fence' },
  );
  if (providerObservationFailures.length > 0) {
    throw new Error(
      `Phase 0B provider-call measurement failed: `
      + `${providerObservationFailures.join('; ')}`,
    );
  }
  const replayObservationFailures = verifyProviderCallObservation(
    replayProviderObservation,
    { label: 'Phase 0B fresh-replay provider-call window' },
  );
  if (replayObservationFailures.length > 0) {
    throw new Error(
      `Phase 0B provider-call measurement failed: `
      + `${replayObservationFailures.join('; ')}`,
    );
  }

  const unsigned = {
    assertions,
    claimBoundary: {
      boundedHoloToHsplusStopDispatchExecuted: true,
      boundedHsplusEntrypointExecuted: true,
      capturedResponseFixturesReplayed: 2,
      fullHoloWorldExecutionClaimed: false,
      fullHsLanguageExecutionClaimed: false,
      fullHsplusLanguageExecutionClaimed: false,
      hololandCrossCompositionBridgeExecuted: true,
      liveModelProviderCallsClaimed: false,
      nativeHoloLifecycleExecutionClaimed: false,
      nativeHsplusEngineExecutionClaimed: false,
      physicsEngineExecutionClaimed: false,
      processCrashDurabilityClaimed: false,
      productionDistributedTransactionClaimed: false,
      productionValidatorTrustClaimed: false,
      scientificOutcomeClaimed: false,
      transactionScope:
        'verified_v4_per_action_single_host_file_atomic_bridge',
      trustedValidatorInjection: 'caller_supplied_frozen_host_config',
      trustedValidatorKeyCustody: trustedValidatorConfig.keyCustody,
      worldRuntimeLifecycleExecuted: false,
    },
    emergencyStop: {
      ...emergencyStop,
      visibleBinding: visibleStopBinding,
    },
    generatedAt: new Date().toISOString(),
    manifests: {
      bundleId: manifests.bundle.bundleId,
      capturedResponses: manifests.capturedResponses,
      challengeIds: manifests.challengeManifest.challenges.map(
        (entry) => entry.challengeId,
      ),
      challengeManifestHash: manifests.challengeManifestHash,
      frozenBeforeFirstTurn: manifests.bundle.frozenBeforeFirstTurn,
      metricSpecHash: manifests.metricSpecHash,
      metricSpecId: manifests.metricSpec.metricSpecId,
      rawResponsesIncluded: false,
      sourceHash: manifests.sourceHash,
    },
    persistence: {
      atomicActionReceiptsCommitted: atomicCommit.state.ledger.entries.length,
      authorizationAttemptsConsumed:
        atomicCommit.state.consumedAuthorizations.length,
      deniedAttemptsConsumed:
        atomicCommit.state.ledger.entries.filter((entry) => !entry.allowed).length,
      eventPublication: 'durable_outbox_after_atomic_commit',
      faultBeforeRename: 'injected_process_level_old_state_recovered',
      faultAfterRename: 'injected_process_level_complete_new_state_recovered',
      finalStateHash: atomicCommit.state.stateHash,
      lastAuthorizationSequence: atomicCommit.state.lastAuthorizationSequence,
      malformedHashAttemptBurnedAndDenied:
        malformedHashAttempt.authorizationBurned,
      mismatchedTargetAttemptBurnedAndDenied:
        mismatchedTargetAttempt.authorizationBurned,
      receiptRoot: atomicCommit.state.ledger.receiptRoot,
      replayAfterRestartRejected: replayRejected,
      restartRecovered: separateProcessRecovery,
      sameProcessRereadRecovered: restartRecovered,
      // The fresh process's OWN provider-call window, measured inside it. The
      // tracer's fence cannot see another process, so without this the
      // separate-process arm of this receipt was unwatched by construction.
      separateProcessProviderFence: freshProcessRead.providerFence,
      separateProcessRereadRecovered: separateProcessRecovery,
      stateReceipt: structuredClone(atomicCommit.state),
      stateSchema: atomicCommit.state.schema,
      storePathIncluded: false,
    },
    replay: {
      comparedFields: [
        'ordered_action_decisions',
        'ordered_post_state_hashes',
        'action_root',
        'final_public_state_hash',
        'source_run_commitment',
        'terminal_commitment',
      ],
      freshExecutionCount: 1,
      match: replayMatch,
      projectionHash: canonicalDigest(firstProjection),
      providerCalls: replayProviderObservation.providerFetchCallsObserved,
      providerFence: replayProviderObservation,
    },
    runtime: {
      actionDecisions: executionSummary.actionDecisions,
      boundedHsplusSubsetActionsExecuted: 2,
      capturedResponsesConsumed: 2,
      counts: executionSummary.counts,
      executionReceipt: structuredClone(first.run.execution),
      finalPublicState: executionSummary.finalPublicState,
      observationSubjects: executionSummary.observationSubjects,
      observerProof: structuredClone(first.run.observerProof),
      observerProjection,
      providerCalls: providerObservation.providerFetchCallsObserved,
      providerFence: providerObservation,
      worldProjection: canonicalWorldProjection,
      sourceBundleHash: executionSummary.sourceBundleHash,
      sourceClaimBoundary: structuredClone(first.run.claimBoundary),
      sourceRunCommitment: executionSummary.sourceRunCommitment,
      sourceRunReceipt: structuredClone(first.run.sourceRunReceipt),
      sourceRunSchema: first.run.sourceRunReceipt.schema,
      terminalCommitment: executionSummary.terminalCommitment,
    },
    schema: PHASE0B_RECEIPT_SCHEMA,
    sources: {
      behavior: PHASE0B_SOURCE_PATHS.behavior,
      manifests: PHASE0B_SOURCE_PATHS.manifests,
      plan: PHASE0B_SOURCE_PATHS.plan,
      stopPlan: PHASE0B_SOURCE_PATHS.stopPlan,
      visibleWorld: PHASE0B_SOURCE_PATHS.visibleWorld,
      world: PHASE0B_SOURCE_PATHS.world,
    },
    status: 'pass',
    validator: {
      config: structuredClone(validatorReceipt.config),
      configHash: validatorReceipt.configHash,
      manifestHash: validatorReceipt.manifestHash,
      registryReceiptId: validatorReceipt.config.registryReceiptId,
      signatureVerified: validatorVerification.valid,
      signedPayloadHash: validatorReceipt.signedPayloadHash,
      trustAnchorOrigin: 'caller_supplied_host_config',
      validatorReceipt: structuredClone(validatorReceipt),
    },
  };
  const result = {
    ...unsigned,
    receipt: {
      // Projections of the hash-bound observation in runtime.providerFence.
      // The verifier cross-binds them to it, so this unhashed block cannot
      // disagree with the measurement it summarizes.
      providerCallMeasurement: providerObservation.measured
        ? 'measured'
        : 'unmeasured',
      providerCallsMadeByTracer: providerObservation.providerFetchCallsObserved,
      rawModelPromptsIncluded: false,
      rawModelResponsesIncluded: false,
      receiptHash: canonicalDigest(unsigned),
    },
  };
  if (!verifyPhase0BReceiptHash(result)) {
    throw new Error('Phase 0B outer receipt self-verification failed');
  }
  const fullVerification = await verifyPhase0BReceipt(result, {
    root,
    trustedValidatorConfig,
  });
  if (!fullVerification.valid) {
    throw new Error(
      `Phase 0B full receipt verification failed: `
      + `${fullVerification.errors.join('; ')}`,
    );
  }
  return result;
}
