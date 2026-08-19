#!/usr/bin/env node
/* global console, process, structuredClone */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  compareObserverBoundaryFields,
  executeObserverBoundaryFixture,
  resolveReceiptOutput,
  runModelVillageCheck,
  validateObserverBoundaryFields,
  validateHeadlessReceipt,
  verifyModelVillageReceiptHash,
  verifyObserverBoundaryFixtureReceipt,
} from '../check-hololand-model-village-experiment.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const outputDir = path.join(repoRoot, '.tmp', 'hololand', 'model-village', 'test');
mkdirSync(outputDir, { recursive: true });
const output = path.join(
  outputDir,
  `receipt-${process.pid}-${randomUUID()}.json`,
);

const { receipt } = await runModelVillageCheck({
  root: repoRoot,
  output,
  durationMs: 60,
  tickRate: 10,
});

assert.equal(receipt.schemaVersion, 'hololand.model-village-experiment.v0.7.0');
assert.equal(receipt.studyPhase, 'phase0b_canonical_lifecycle_closure');
assert.equal(receipt.status, 'pass');
assert.equal(receipt.sourceContract.threeFormat, true);
assert.deepEqual(
  receipt.parsers.map((entry) => [entry.format, entry.passed]),
  [
    ['.holo', true],
    ['.hsplus', true],
    ['.hs', true],
  ],
);
assert.equal(receipt.headlessReplay.canonicalMatch, true);
assert.equal(receipt.headlessReplay.objectCount, 12);
assert.equal(receipt.headlessReplay.objectIds.length, 12);
assert.equal(receipt.runtimeEvidence.modelTurnsExecuted, null);
assert.equal(receipt.runtimeEvidence.agentActionsExecuted, null);
assert.equal(receipt.runtimeEvidence.executionCountsAvailable, false);
assert.equal(receipt.runtimeEvidence.scientificOutcomeClaimed, false);
assert.equal(receipt.runtimeEvidence.providerCallsMadeByChecker, 0);
assert.equal(receipt.runtimeEvidence.capturedFixtureScheduleEntriesExecuted, 3);
assert.equal(receipt.runtimeEvidence.capturedFixtureResidentObservationsMaterialized, 6);
assert.equal(receipt.runtimeEvidence.capturedFixtureActionReceiptsSealed, 2);
assert.equal(receipt.runtimeEvidence.nativeHsPipelineExecutionClaimed, false);
assert.equal(receipt.runtimeEvidence.nativeHsplusActionExecutionClaimed, false);
assert.deepEqual(receipt.runtimeEvidence.boundedPhase0B, {
  sourceRunSchema: 'holoscript.headless-experiment-source-run.v4',
  scheduleEntriesExecuted: 8,
  residentObservationsMaterialized: 6,
  boundedHsplusSubsetActionsExecuted: 2,
  publicStateSnapshotsMaterialized: 9,
  capturedResponsesConsumed: 2,
  allowedWorldMutationsCommitted: 1,
  deniedAuthorizationAttemptsConsumed: 1,
  authorizationAttemptsConsumed: 2,
  cryptographicValidatorVerified: true,
  hostSuppliedValidatorConfigPinned: true,
  validatorKeyCustody: 'ephemeral_engineering_fixture',
  atomicCommitBoundToVerifiedV4SourceRun: true,
  sameProcessPersistentStateRereadRecovered: true,
  separateProcessPersistentStateRereadRecovered: true,
  mismatchedTargetAttemptBurnedAndDenied: true,
  malformedHashAttemptBurnedAndDenied: true,
  faultBeforeRename: 'injected_process_level_old_state_recovered',
  faultAfterRename: 'injected_process_level_complete_new_state_recovered',
  replayAfterRestartRejected: true,
  freshCapturedResponseReplayMatches: true,
  emergencyStopBridgeExecuted: true,
  boundedHoloToHsplusStopDispatchExecuted: true,
  providerCallsMade: 0,
  providerCallMeasurement: 'measured',
  transactionScope: 'verified_v4_per_action_single_host_file_atomic_bridge',
});

// PROVIDER-CALL MEASUREMENT. These used to be literals compared against
// literals. They are now fence counters, and the assertions below are about the
// MEASUREMENT being real — not just about the number being zero.
assert.equal(receipt.assertions.providerCallsMeasuredAndZeroAcrossEveryLane, true);
assert.deepEqual(receipt.runtimeEvidence.providerCallEvidence.failures, []);
assert.equal(receipt.receipt.providerCallMeasurement, 'measured');
assert.equal(receipt.engineeringTracer.runtime.providerFence.measured, true);
assert.equal(
  receipt.engineeringTracer.runtime.providerFence.providerFetchCallsObserved,
  0,
);
assert.equal(receipt.canonicalLifecycle.providerFence.measured, true);
assert.equal(
  receipt.observerBoundaryFixture.claimBoundary.providerCallObservation.measured,
  true,
);
// The fence is not a decoration: it observed real non-provider traffic (the
// HoloScript core WASM initialization) during this run. If this ever reads 0
// the counter is no longer known to be wired to anything.
assert.ok(
  receipt.runtimeEvidence.providerCallEvidence.checker.fetchCallsObserved > 0,
  'the checker outer fence observed no traffic at all; it may not be installed',
);
// The nesting floor held for every inner fence, measured by an INDEPENDENT
// counter this checker installed before them.
for (const lane of receipt.runtimeEvidence.providerCallEvidence.nesting) {
  assert.equal(lane.nestingFloorHeld, true, `nesting floor broke for ${lane.lane}`);
  assert.equal(lane.outerProviderFetchCallsObserved, 0);
}
assert.deepEqual(receipt.runtimeEvidence.canonicalLifecycle, {
  adapterBlocksExecuted: 3,
  lifecycleActionsExecuted: 30,
  lifecycleSequence: [
    'register_run',
    'stage_resident_x6',
    'start_run',
    'freeze_run',
    'close_run',
  ],
  observerNoninterferenceVerified: true,
  providerCallsMade: 0,
  publicStateSnapshotsMaterialized: 33,
  replayVerified: true,
  residentPersonaSeatBindingsStaged: 18,
  worldObjectsProjected: 12,
  worldRuntimeLifecycleExecuted: true,
});
assert.equal(receipt.capabilityStatus.observed.worldMaterialization, true);
assert.equal(receipt.capabilityStatus.observed.canonicalSceneReplay, true);
assert.equal(receipt.capabilityStatus.observed.capturedObserverBoundaryFixtureReplay, true);
assert.equal(receipt.capabilityStatus.observed.boundedPhase0BEngineeringTracer, true);
assert.equal(
  receipt.capabilityStatus.observed.canonicalTwelveObjectLifecycleAndAdapterMatrix,
  true,
);
assert.equal(
  receipt.capabilityStatus.targetObservedScope,
  'live_full_native_and_scientific_experiment',
);
assert.deepEqual(receipt.capabilityStatus.boundedBridgeObserved, {
  sourceRunV4Verified: true,
  boundedHsplusEntrypointExecution: true,
  capturedResponseActionReplay: true,
  perStepPublicStateSnapshots: true,
  challengeAndMetricManifestsHashed: true,
  cryptographicTrustedValidator: true,
  hostSuppliedValidatorConfigPinned: true,
  persistentAuthorizationConsumption: true,
  verifiedV4PerActionSingleHostFileAtomicCommit: true,
  separateProcessPersistentStateRecovery: true,
  invalidAuthorizationAttemptsBurnedAndDenied: true,
  emergencyStopBridge: true,
  boundedHoloToHsplusStopDispatch: true,
  canonicalLifecycleSourceProjection: true,
  canonicalTwelveObjectLifecycle: true,
  frozenAdapterMatrixExecution: true,
});
assert.equal(receipt.capabilityStatus.targetObserved.liveModelAdapterInvocation, false);
assert.equal(receipt.capabilityStatus.targetObserved.receiptedActionExecution, false);
assert.equal(receipt.capabilityStatus.targetObserved.processCrashDurability, false);
assert.equal(receipt.capabilityStatus.targetObserved.productionDistributedTransactions, false);
assert.equal(receipt.capabilityStatus.targetObserved.productionValidatorTrust, false);
assert.equal(receipt.engineeringTracer.status, 'pass');
assert.equal(
  receipt.engineeringTracer.schema,
  'hololand.model-village-phase0b-runtime-bridge.v3',
);
assert.equal(
  receipt.sourceContract.boundedTwelveObjectRehearsalObserverProjectionToggleExecuted,
  true,
);
assert.equal(
  receipt.sourceContract.canonicalTwelveObjectObserverProjectionToggleExecuted,
  true,
);
assert.equal(
  receipt.sourceContract.canonicalTwelveObjectRuntimeLifecycleExecuted,
  true,
);
assert.equal(receipt.sourceContract.frozenThreeBlockAdapterMatrixExecuted, true);
assert.equal(
  Object.values(receipt.engineeringTracer.assertions).every((passed) => passed === true),
  true,
);
assert.deepEqual(receipt.engineeringTracer.runtime.counts, {
  schedule: 8,
  observations: 6,
  actions: 2,
  publicStateSnapshots: 9,
});
assert.deepEqual(
  receipt.engineeringTracer.runtime.actionDecisions.map(
    ({ allowed, stateChanged }) => ({ allowed, stateChanged }),
  ),
  [
    { allowed: true, stateChanged: true },
    { allowed: false, stateChanged: false },
  ],
);
assert.equal(receipt.engineeringTracer.runtime.capturedResponsesConsumed, 2);
assert.equal(receipt.engineeringTracer.validator.signatureVerified, true);
assert.equal(receipt.engineeringTracer.persistence.authorizationAttemptsConsumed, 2);
assert.equal(receipt.engineeringTracer.persistence.deniedAttemptsConsumed, 1);
assert.equal(receipt.engineeringTracer.persistence.atomicActionReceiptsCommitted, 2);
assert.equal(receipt.engineeringTracer.persistence.restartRecovered, true);
assert.equal(receipt.engineeringTracer.persistence.sameProcessRereadRecovered, true);
assert.equal(receipt.engineeringTracer.persistence.separateProcessRereadRecovered, true);
assert.equal(receipt.engineeringTracer.persistence.mismatchedTargetAttemptBurnedAndDenied, true);
assert.equal(receipt.engineeringTracer.persistence.malformedHashAttemptBurnedAndDenied, true);
assert.equal(
  receipt.engineeringTracer.persistence.faultBeforeRename,
  'injected_process_level_old_state_recovered',
);
assert.equal(
  receipt.engineeringTracer.persistence.faultAfterRename,
  'injected_process_level_complete_new_state_recovered',
);
assert.equal(receipt.engineeringTracer.persistence.replayAfterRestartRejected, true);
assert.equal(receipt.engineeringTracer.replay.match, true);
assert.equal(
  receipt.engineeringTracer.assertions.atomicCommitBoundToVerifiedV4SourceRun,
  true,
);
assert.equal(
  receipt.engineeringTracer.assertions.separateProcessPersistentStateRecovery,
  true,
);
assert.equal(
  receipt.engineeringTracer.emergencyStop.finalPublicState.emergencyStopState,
  'triggered',
);
assert.equal(receipt.engineeringTracer.emergencyStop.finalPublicState.phase, 'frozen');
assert.equal(receipt.engineeringTracer.claimBoundary.liveModelProviderCallsClaimed, false);
assert.equal(receipt.engineeringTracer.claimBoundary.fullHoloWorldExecutionClaimed, false);
assert.equal(receipt.engineeringTracer.claimBoundary.fullHsLanguageExecutionClaimed, false);
assert.equal(receipt.engineeringTracer.claimBoundary.fullHsplusLanguageExecutionClaimed, false);
assert.equal(receipt.engineeringTracer.claimBoundary.nativeHoloLifecycleExecutionClaimed, false);
assert.equal(receipt.engineeringTracer.claimBoundary.nativeHsplusEngineExecutionClaimed, false);
assert.equal(receipt.engineeringTracer.claimBoundary.physicsEngineExecutionClaimed, false);
assert.equal(receipt.engineeringTracer.claimBoundary.processCrashDurabilityClaimed, false);
assert.equal(
  receipt.engineeringTracer.claimBoundary.productionDistributedTransactionClaimed,
  false,
);
assert.equal(
  receipt.engineeringTracer.claimBoundary.productionValidatorTrustClaimed,
  false,
);
assert.equal(
  receipt.engineeringTracer.claimBoundary.trustedValidatorInjection,
  'caller_supplied_frozen_host_config',
);
assert.equal(
  receipt.engineeringTracer.claimBoundary.trustedValidatorKeyCustody,
  'ephemeral_engineering_fixture',
);
assert.equal(receipt.engineeringTracer.claimBoundary.scientificOutcomeClaimed, false);
assert.equal(
  receipt.engineeringTracer.claimBoundary.boundedHoloToHsplusStopDispatchExecuted,
  true,
);
assert.equal(
  receipt.engineeringTracer.claimBoundary.transactionScope,
  'verified_v4_per_action_single_host_file_atomic_bridge',
);
assert.equal(receipt.engineeringTracer.claimBoundary.worldRuntimeLifecycleExecuted, false);
assert.equal(receipt.canonicalLifecycle.status, 'pass');
assert.equal(receipt.canonicalLifecycle.world.objectCount, 12);
assert.equal(receipt.canonicalLifecycle.blocks.length, 3);
assert.equal(
  receipt.canonicalLifecycle.claimBoundary.worldRuntimeLifecycleExecuted,
  true,
);
assert.equal(
  receipt.canonicalLifecycle.claimBoundary.adapterPermutationExecutionClaimed,
  true,
);
assert.equal(
  receipt.canonicalLifecycle.claimBoundary.fullHoloWorldExecutionClaimed,
  false,
);
assert.equal(
  receipt.canonicalLifecycle.claimBoundary.productionValidatorTrustClaimed,
  false,
);
assert.equal(
  receipt.assertions.canonicalTwelveObjectLifecycleAndAdapterMatrixClose,
  true,
);
assert.equal(receipt.experimentDesign.models, 3);
assert.equal(receipt.experimentDesign.residents, 6);
assert.equal(receipt.experimentDesign.conditions.length, 4);
assert.equal(receipt.experimentDesign.seedBlocks, 3);
assert.equal(receipt.experimentDesign.plannedVillageRuns, 12);
assert.equal(receipt.observerBoundaryFixture.status, 'pass');
assert.equal(receipt.observerBoundaryFixture.fieldValidation.passed, true);
assert.equal(receipt.observerBoundaryFixture.adapterAssignmentExclusion.status, 'pass');
assert.equal(
  receipt.observerBoundaryFixture.adapterAssignmentExclusion.assignmentHashes.length,
  3,
);
assert.equal(
  receipt.observerBoundaryFixture.adapterAssignmentExclusion
    .postInferenceOutcomeEquivalenceClaimed,
  false,
);
const forbiddenPublicIdentityFields = [
  'public_embodiment_id',
  'public_story_ordinal',
  'public_display_name',
  'family_id',
  'model_family',
  'provider',
  'agent_surface_id',
  'family_embodiment_manifest_id',
  'family_mantle_id',
  'family_mantle_pattern_id',
  'family_mantle_glyph_id',
  'exact_model_revision',
  'embodiment_binding',
  'embodiment_binding_receipt_hash',
];
assert.equal(
  forbiddenPublicIdentityFields.every((field) => (
    receipt.observerBoundaryFixture.adapterAssignmentExclusion
      .forbiddenResidentObservationFields.includes(field)
  )),
  true,
);
assert.equal(
  receipt.observerBoundaryFixture.residentObservations.every(
    (observation) => forbiddenPublicIdentityFields.every(
      (field) => !Object.hasOwn(observation, field),
    ),
  ),
  true,
);
assert.equal(
  receipt.observerBoundaryFixture.claimBoundary.referencedSafetyDecisionReceiptsValidated,
  false,
);
assert.equal(
  receipt.observerBoundaryFixture.claimBoundary.actionReceiptRootScope,
  'syntactically_chained_action_fixture_receipts_only',
);
assert.equal(receipt.observerBoundaryFixture.executedSchedule.length, 3);
assert.equal(receipt.observerBoundaryFixture.residentObservations.length, 6);
assert.equal(receipt.observerBoundaryFixture.actionReceipts.length, 2);
for (const value of Object.values(receipt.observerBoundaryFixture.canonicalFields)) {
  assert.match(value, /^[a-f0-9]{64}$/);
}
for (const field of Object.keys(receipt.observerBoundaryFixture.canonicalFields)) {
  const tampered = {
    ...receipt.observerBoundaryFixture.canonicalFields,
    [field]: 'f'.repeat(64),
  };
  const comparison = compareObserverBoundaryFields(
    receipt.observerBoundaryFixture.canonicalFields,
    tampered,
  );
  assert.equal(comparison.passed, false);
  assert.deepEqual(comparison.changedFields, [field]);
}
const missingBoundary = { ...receipt.observerBoundaryFixture.canonicalFields };
delete missingBoundary.executedScheduleHash;
assert.equal(
  compareObserverBoundaryFields(
    receipt.observerBoundaryFixture.canonicalFields,
    missingBoundary,
  ).passed,
  false,
);
const invalidBoundary = {
  ...receipt.observerBoundaryFixture.canonicalFields,
  actionReceiptRoot: 'z'.repeat(64),
};
const invalidBoundaryComparison = compareObserverBoundaryFields(
  receipt.observerBoundaryFixture.canonicalFields,
  invalidBoundary,
);
assert.equal(invalidBoundaryComparison.passed, false);
assert.deepEqual(invalidBoundaryComparison.invalidAfter, ['actionReceiptRoot']);
assert.deepEqual(
  validateObserverBoundaryFields(invalidBoundary).invalidFields,
  ['actionReceiptRoot'],
);
assert.equal(verifyObserverBoundaryFixtureReceipt(receipt.observerBoundaryFixture), true);
assert.equal(verifyModelVillageReceiptHash(receipt), true);
const claimMutatedReceipt = structuredClone(receipt);
claimMutatedReceipt.claimBoundary.observed.push('native .hs pipeline execution');
assert.equal(verifyModelVillageReceiptHash(claimMutatedReceipt), false);
const fixtureClaimMutatedReceipt = structuredClone(receipt.observerBoundaryFixture);
fixtureClaimMutatedReceipt.claimBoundary.nativeHsPipelineExecutionClaimed = true;
fixtureClaimMutatedReceipt.claimBoundary.liveModelTurnsClaimed = true;
assert.equal(verifyObserverBoundaryFixtureReceipt(fixtureClaimMutatedReceipt), false);

const holoScriptCore = await import(pathToFileURL(path.join(
  repoRoot,
  '..',
  'HoloScript',
  'packages',
  'core',
  'dist',
  'index.js',
)).href);
const kernelSource = readFileSync(
  path.join(repoRoot, 'source/proofs/model-village-trial-kernel.hs'),
  'utf8',
);
const policySource = readFileSync(
  path.join(repoRoot, 'source/domains/agents/model-village-experiment.hsplus'),
  'utf8',
);
const headlessFixture = {
  scene: { schema: 'test-scene', objectCount: 12 },
  posePhysics: { schema: 'test-pose', objectCount: 12 },
};
const executeFixture = (source) => executeObserverBoundaryFixture({
  core: holoScriptCore,
  kernelSource: source,
  policySource,
  headlessReceipt: headlessFixture,
});
assert.throws(
  () => executeObserverBoundaryFixture({
    core: holoScriptCore,
    kernelSource,
    policySource,
    headlessReceipt: null,
  }),
  /requires available native headless scene and posePhysics receipts/,
);
assert.throws(
  () => executeFixture(
    kernelSource.replace(
      'residentId: "resident-01"\n  location: "VillageCommons"',
      'residentId: "resident-01"\n  adapterAlias: "adapter_a"\n  location: "VillageCommons"',
    ),
  ),
  /unexpected=\["adapterAlias"\]/,
);
assert.throws(
  () => executeFixture(
    kernelSource.replace(
      'scheduleOrder: ["mv-p0-schedule-observe", "mv-p0-schedule-admit-01", "mv-p0-schedule-admit-02"]',
      'scheduleOrder: ["mv-p0-schedule-admit-01", "mv-p0-schedule-observe", "mv-p0-schedule-admit-02"]',
    ),
  ),
  /Schedule cannot seal action receipt|Schedule entry .* is malformed/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'rollbackReference: "mv-p0-public-state-before"',
    'rollbackReference: "does-not-exist"',
  )),
  /Action receipt fixture .* is malformed/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'authorizationNonce: "mv-p0-auth-02"',
    'authorizationNonce: "mv-p0-auth-01"',
  )),
  /duplicates or omits authorizationNonce/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'block2: ["adapter_b", "adapter_b", "adapter_c", "adapter_c", "adapter_a", "adapter_a"]',
    'block2: ["adapter_a", "adapter_a", "adapter_b", "adapter_b", "adapter_c", "adapter_c"]',
  )),
  /distinct assignment vectors/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'outcome: "blocked_without_world_mutation"',
    'outcome: "world_mutated_anyway"',
  )),
  /Action receipt fixture .* is malformed/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'rollbackReference: "mv-p0-public-state-after"\n  playerVisibleImpact: false\n  allowed: false',
    'rollbackReference: "mv-p0-public-state-after"\n  playerVisibleImpact: true\n  allowed: false',
  )),
  /Action receipt fixture .* is malformed/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'phase: "observation_barrier"',
    'phase: "action_admission"',
  )),
  /Schedule entry .* is malformed/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'logicalClockEndTick: 1',
    'logicalClockEndTick: 2',
  )),
  /initial\/final public-state sequence and clock do not match|executed clock coverage/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'logicalTick: 1\n  location: "VillageCommons"',
    'logicalTick: 99\n  location: "VillageCommons"',
  )),
  /initial\/final public-state sequence and clock do not match/,
);
assert.throws(
  () => executeFixture(kernelSource.replace(
    'parser: "HoloScriptCodeParser"',
    'parser: "NativeHsPipelineExecutor"',
  )),
  /manifest exceeds the bounded fixture claim/,
);
assert.throws(
  () => executeFixture(kernelSource
    .replace(
      'scheduleEntryId: "mv-p0-schedule-observe"\n  order: 1\n  tick: 0',
      'scheduleEntryId: "mv-p0-schedule-observe"\n  order: 1\n  tick: 1',
    )
    .replace(
      'scheduleEntryId: "mv-p0-schedule-admit-01"\n  order: 2\n  tick: 1',
      'scheduleEntryId: "mv-p0-schedule-admit-01"\n  order: 2\n  tick: 0',
    )),
  /Schedule entry .* is malformed/,
);
assert.ok(receipt.receipt.receiptHash);
assert.ok(receipt.toolchain.holoScriptCliSha256);
assert.ok(receipt.toolchain.checkerSha256);
assert.equal(receipt.toolchain.durationMs, 60);
assert.equal(receipt.toolchain.tickRate, 10);
assert.equal(existsSync(output), true);

const emptyHeadlessValidation = validateHeadlessReceipt({});
assert.equal(emptyHeadlessValidation.passed, false);
assert.ok(emptyHeadlessValidation.errors.length > 0);
assert.throws(
  () => resolveReceiptOutput(repoRoot, 'package.json'),
  /must be a \.json file inside/,
);

const persisted = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(persisted.receipt.receiptHash, receipt.receipt.receiptHash);

const negativeRoot = mkdtempSync(path.join(tmpdir(), 'hololand-model-village-negative-'));
const negativeFiles = [
  'source/layers/vr/frontier/model-village/model-village.holo',
  'source/layers/vr/frontier/model-village/model-village-observer-projection.holo',
  'source/domains/agents/model-village-experiment.hsplus',
  'source/proofs/model-village-trial-kernel.hs',
  'source/proofs/model-village-phase0b-behavior.hsplus',
  'source/proofs/model-village-phase0b-plan.hs',
  'source/proofs/model-village-phase0b-stop-plan.hs',
  'source/proofs/model-village-phase0b-world.holo',
  'source/proofs/model-village-phase1-manifests.hs',
  'docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md',
  'package.json',
];

for (const relativePath of negativeFiles) {
  const destination = path.join(negativeRoot, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(repoRoot, relativePath), destination);
}

const negativeKernel = path.join(
  negativeRoot,
  'source/proofs/model-village-trial-kernel.hs',
);
writeFileSync(
  negativeKernel,
  readFileSync(negativeKernel, 'utf8')
    .replace(
      'bridgeMayOwnVillageBehavior: false',
      'bridgeMayOwnVillageBehavior: true\n  // bridgeMayOwnVillageBehavior: false',
    ),
  'utf8',
);

const negativeOutput = path.join(negativeRoot, '.tmp', 'receipt.json');
const previousHoloScriptRoot = process.env.HOLOSCRIPT_ROOT;
process.env.HOLOSCRIPT_ROOT = path.resolve(repoRoot, '..', 'HoloScript');
try {
  await assert.rejects(
    runModelVillageCheck({
      root: negativeRoot,
      output: negativeOutput,
      durationMs: 20,
      tickRate: 10,
    }),
    /kernelKeepsBehaviorInHoloScript/,
  );
} finally {
  if (previousHoloScriptRoot === undefined) delete process.env.HOLOSCRIPT_ROOT;
  else process.env.HOLOSCRIPT_ROOT = previousHoloScriptRoot;
}

const negativeReceipt = JSON.parse(readFileSync(negativeOutput, 'utf8'));
assert.equal(negativeReceipt.status, 'fail');
assert.equal(negativeReceipt.assertions.kernelKeepsBehaviorInHoloScript, false);
assert.equal(verifyModelVillageReceiptHash(negativeReceipt), true);

writeFileSync(
  negativeKernel,
  kernelSource.replace(
    'rollbackReference: "mv-p0-public-state-before"',
    'rollbackReference: "does-not-exist"',
  ),
  'utf8',
);
const malformedFixtureOutput = path.join(
  negativeRoot,
  '.tmp',
  'malformed-fixture-receipt.json',
);
process.env.HOLOSCRIPT_ROOT = path.resolve(repoRoot, '..', 'HoloScript');
try {
  await assert.rejects(
    runModelVillageCheck({
      root: negativeRoot,
      output: malformedFixtureOutput,
      durationMs: 20,
      tickRate: 10,
    }),
    /capturedObserverBoundaryFixturePasses/,
  );
} finally {
  if (previousHoloScriptRoot === undefined) delete process.env.HOLOSCRIPT_ROOT;
  else process.env.HOLOSCRIPT_ROOT = previousHoloScriptRoot;
}
const malformedFixtureReceipt = JSON.parse(
  readFileSync(malformedFixtureOutput, 'utf8'),
);
assert.equal(malformedFixtureReceipt.status, 'fail');
assert.equal(malformedFixtureReceipt.observerBoundaryFixture.status, 'fail');
assert.match(
  malformedFixtureReceipt.observerBoundaryFixture.error.message,
  /Action receipt fixture .* is malformed/,
);
assert.equal(
  verifyObserverBoundaryFixtureReceipt(
    malformedFixtureReceipt.observerBoundaryFixture,
  ),
  true,
);
assert.equal(verifyModelVillageReceiptHash(malformedFixtureReceipt), true);

rmSync(negativeRoot, { recursive: true, force: true });
rmSync(output, { force: true });
console.log('PASS HoloLand model village experiment');
