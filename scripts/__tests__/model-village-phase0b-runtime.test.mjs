#!/usr/bin/env node
/* global console, process, structuredClone */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHASE0B_RECEIPT_SCHEMA,
  PHASE0B_STATE_SCHEMA,
  canonicalDigest,
  createRuntimeInjectedValidatorFixture,
  initializePersistentStore,
  readPersistentState,
  runPhase0BEngineeringTracer,
  validatePersistentState,
  verifyPhase0BReceipt,
  verifyPhase0BReceiptHash,
  verifyRuntimeInjectedValidator,
} from '../model-village-phase0b-runtime.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const ownedRoot = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'phase0b-runtime-tests',
  `runtime-${process.pid}-${randomUUID()}`,
);
const tracerStore = path.join(ownedRoot, 'tracer-store');
const foreignSignerStore = path.join(ownedRoot, 'foreign-signer-store');
const lockedStore = path.join(ownedRoot, 'locked-store');
const runtimeScratchRoot = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'phase0b-runtime',
);
const ownedTracerScratchPattern = new RegExp(
  '^(fault-before-rename|fault-after-rename|mismatch-target'
  + `|mismatch-state-hashes)-${process.pid}-`,
);

const initialWorld = Object.freeze({
  acceptedActionCount: 0,
  emergencyStopState: 'armed',
  phase: 'running',
  publicWaterUnits: 2,
});
const firstAllowedPostWorld = Object.freeze({
  acceptedActionCount: 1,
  emergencyStopState: 'armed',
  phase: 'running',
  publicWaterUnits: 3,
});

function flipHexDigest(value) {
  return `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;
}

function resealPersistentState(state) {
  const unsigned = { ...state };
  delete unsigned.stateHash;
  state.stateHash = canonicalDigest(unsigned);
  return state;
}

function resealPersistentLedgerFrom(state, startIndex) {
  let previousReceiptHash = startIndex === 0
    ? '0'.repeat(64)
    : state.ledger.entries[startIndex - 1].receiptHash;
  for (let index = startIndex; index < state.ledger.entries.length; index += 1) {
    const entry = state.ledger.entries[index];
    entry.previousReceiptHash = previousReceiptHash;
    const unsignedEntry = { ...entry };
    delete unsignedEntry.receiptHash;
    entry.receiptHash = canonicalDigest(unsignedEntry);
    state.consumedAuthorizations[index].receiptHash = entry.receiptHash;
    state.eventOutbox[index].receiptHash = entry.receiptHash;
    previousReceiptHash = entry.receiptHash;
  }
  state.ledger.receiptRoot = previousReceiptHash;
  return resealPersistentState(state);
}

function resealOuterReceipt(receipt) {
  const unsigned = structuredClone(receipt);
  delete unsigned.receipt;
  receipt.receipt.receiptHash = canonicalDigest(unsigned);
  return receipt;
}

function assertValidatorRejected(receipt, expectedPins = {}) {
  const verification = verifyRuntimeInjectedValidator(receipt, expectedPins);
  assert.equal(verification.valid, false);
  assert.ok(verification.errors.length > 0);
}

try {
  mkdirSync(ownedRoot, { recursive: true });

  const trustedValidator = createRuntimeInjectedValidatorFixture();
  const baseline = await runPhase0BEngineeringTracer({
    root: repoRoot,
    signRunManifest: trustedValidator.issue,
    storeDir: tracerStore,
    trustedValidatorConfig: trustedValidator.config,
  });

  assert.equal(baseline.schema, PHASE0B_RECEIPT_SCHEMA);
  assert.equal(baseline.status, 'pass');
  assert.equal(verifyPhase0BReceiptHash(baseline), true);
  assert.equal(Object.values(baseline.assertions).every(Boolean), true);
  assert.deepEqual(baseline.runtime.counts, {
    actions: 2,
    observations: 6,
    publicStateSnapshots: 9,
    schedule: 8,
  });
  assert.deepEqual(baseline.runtime.finalPublicState, firstAllowedPostWorld);
  assert.deepEqual(
    baseline.runtime.observationSubjects,
    [
      ['resident-01'],
      ['resident-02'],
      ['resident-03'],
      ['resident-04'],
      ['resident-05'],
      ['resident-06'],
    ],
  );
  assert.equal(
    baseline.assertions.canonicalTwelveObjectWorldProjectionMatches,
    true,
  );
  assert.equal(baseline.runtime.worldProjection.objectCount, 12);
  assert.equal(
    baseline.runtime.worldProjection.exactIdsAndTransformsMatch,
    true,
  );
  assert.equal(baseline.runtime.worldProjection.objectIds.length, 12);
  assert.equal(baseline.runtime.providerCalls, 0);
  assert.equal(baseline.runtime.boundedHsplusSubsetActionsExecuted, 2);
  assert.equal(baseline.runtime.capturedResponsesConsumed, 2);
  assert.equal(baseline.replay.match, true);
  assert.equal(baseline.replay.freshExecutionCount, 1);
  assert.equal(baseline.replay.providerCalls, 0);
  assert.equal(
    baseline.runtime.observerProjection.schema,
    'hololand.model-village.phase0b-observer-projection.v2',
  );
  assert.equal(
    baseline.runtime.observerProjection.projectionToggleExecuted,
    true,
  );
  assert.equal(
    baseline.runtime.observerProjection.toggleScope,
    'single_sealed_execution_post_seal_consumer',
  );
  assert.equal(
    baseline.runtime.observerProjection.comparison.sevenFieldsEqual,
    true,
  );
  assert.deepEqual(
    baseline.runtime.observerProjection.comparison.changedFields,
    [],
  );
  assert.deepEqual(
    baseline.runtime.observerProjection.off.canonicalFields,
    baseline.runtime.observerProjection.on.canonicalFields,
  );
  assert.equal(
    baseline.runtime.observerProjection.off.sourceRunCommitment,
    baseline.runtime.observerProjection.on.sourceRunCommitment,
  );
  assert.equal(
    baseline.runtime.observerProjection.off.terminalCommitment,
    baseline.runtime.observerProjection.on.terminalCommitment,
  );
  assert.equal(
    baseline.runtime.observerProjection.claimBoundary
      .observerIntroducedExperimentExecutionCount,
    0,
  );
  assert.equal(
    baseline.runtime.observerProjection.claimBoundary
      .freshExperimentExecutionCount,
    0,
  );
  assert.equal(
    baseline.runtime.observerProjection.claimBoundary
      .boundedRuntimeSceneObjectCount,
    12,
  );
  assert.equal(
    baseline.runtime.observerProjection.claimBoundary
      .fullCanonicalTwelveObjectLifecycleClaimed,
    false,
  );
  assert.equal(
    baseline.runtime.observerProjection.livingCommons.publicWaterUnits,
    3,
  );
  assert.equal(
    baseline.runtime.observerProjection.livingCommons.admittedAction
      .entrypoint,
    'contribute_water',
  );
  assert.equal(
    baseline.runtime.observerProjection.livingCommons.blockedAction
      .entrypoint,
    'deny_external_message',
  );
  assert.equal(
    baseline.runtime.observerProjection.livingCommons.actionReceiptRoot,
    baseline.runtime.executionReceipt.terminal.actionRoot,
  );
  assert.equal(
    baseline.runtime.observerProjection.livingCommons.blockedAction
      .previousEntryHash,
    baseline.runtime.observerProjection.livingCommons.admittedAction.entryHash,
  );
  assert.equal(
    baseline.claimBoundary.boundedHoloToHsplusStopDispatchExecuted,
    true,
  );
  assert.equal(baseline.claimBoundary.boundedHsplusEntrypointExecuted, true);
  assert.equal(baseline.claimBoundary.capturedResponseFixturesReplayed, 2);
  assert.equal(baseline.claimBoundary.hololandCrossCompositionBridgeExecuted, true);
  assert.equal(baseline.claimBoundary.nativeHsplusEngineExecutionClaimed, false);
  assert.equal(baseline.claimBoundary.nativeHoloLifecycleExecutionClaimed, false);
  assert.equal(baseline.claimBoundary.worldRuntimeLifecycleExecuted, false);
  assert.equal(baseline.claimBoundary.fullHoloWorldExecutionClaimed, false);
  assert.equal(baseline.claimBoundary.fullHsLanguageExecutionClaimed, false);
  assert.equal(baseline.claimBoundary.fullHsplusLanguageExecutionClaimed, false);
  assert.equal(baseline.claimBoundary.physicsEngineExecutionClaimed, false);
  assert.equal(baseline.claimBoundary.processCrashDurabilityClaimed, false);
  assert.equal(
    baseline.claimBoundary.productionDistributedTransactionClaimed,
    false,
  );
  assert.equal(baseline.claimBoundary.productionValidatorTrustClaimed, false);
  assert.equal(
    baseline.claimBoundary.trustedValidatorInjection,
    'caller_supplied_frozen_host_config',
  );
  assert.equal(
    baseline.claimBoundary.trustedValidatorKeyCustody,
    'ephemeral_engineering_fixture',
  );
  assert.equal(baseline.claimBoundary.liveModelProviderCallsClaimed, false);
  assert.equal(baseline.claimBoundary.scientificOutcomeClaimed, false);
  assert.equal(
    baseline.claimBoundary.transactionScope,
    'verified_v4_per_action_single_host_file_atomic_bridge',
  );
  assert.equal(baseline.persistence.atomicActionReceiptsCommitted, 2);
  assert.equal(baseline.persistence.authorizationAttemptsConsumed, 2);
  assert.equal(baseline.persistence.deniedAttemptsConsumed, 1);
  assert.equal(baseline.persistence.lastAuthorizationSequence, 1);
  assert.equal(
    baseline.persistence.malformedHashAttemptBurnedAndDenied,
    true,
  );
  assert.equal(
    baseline.persistence.mismatchedTargetAttemptBurnedAndDenied,
    true,
  );
  assert.equal(baseline.persistence.restartRecovered, true);
  assert.equal(baseline.persistence.sameProcessRereadRecovered, true);
  assert.equal(baseline.persistence.separateProcessRereadRecovered, true);
  assert.equal(baseline.persistence.replayAfterRestartRejected, true);
  assert.equal(
    baseline.persistence.faultBeforeRename,
    'injected_process_level_old_state_recovered',
  );
  assert.equal(
    baseline.persistence.faultAfterRename,
    'injected_process_level_complete_new_state_recovered',
  );
  assert.equal(baseline.persistence.stateSchema, PHASE0B_STATE_SCHEMA);
  assert.equal(baseline.persistence.storePathIncluded, false);
  assert.equal(baseline.receipt.providerCallsMadeByTracer, 0);
  assert.equal(baseline.receipt.rawModelPromptsIncluded, false);
  assert.equal(baseline.receipt.rawModelResponsesIncluded, false);

  const fullBaselineVerification = await verifyPhase0BReceipt(baseline, {
    root: repoRoot,
    trustedValidatorConfig: trustedValidator.config,
  });
  assert.equal(fullBaselineVerification.valid, true);
  assert.deepEqual(fullBaselineVerification.errors, []);

  const mutableTrustedConfig = structuredClone(trustedValidator.config);
  assert.equal(Object.isFrozen(mutableTrustedConfig), false);
  const mutableTrustVerification = await verifyPhase0BReceipt(
    baseline,
    {
      root: repoRoot,
      trustedValidatorConfig: mutableTrustedConfig,
    },
  );
  assert.equal(mutableTrustVerification.valid, false);
  assert.match(
    mutableTrustVerification.errors.join('\n'),
    /requires a frozen host trustedValidatorConfig/,
  );

  const forbiddenCanonicalKeyTamper =
    JSON.parse(JSON.stringify(baseline));
  Object.defineProperty(
    forbiddenCanonicalKeyTamper.runtime,
    '__proto__',
    {
      configurable: true,
      enumerable: true,
      value: {
        providerCalls: 999,
        scientificOutcomeClaimed: true,
      },
      writable: true,
    },
  );
  assert.match(JSON.stringify(forbiddenCanonicalKeyTamper), /"__proto__"/);
  assert.equal(verifyPhase0BReceiptHash(forbiddenCanonicalKeyTamper), false);
  const forbiddenCanonicalKeyVerification = await verifyPhase0BReceipt(
    forbiddenCanonicalKeyTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(forbiddenCanonicalKeyVerification.valid, false);
  assert.match(
    forbiddenCanonicalKeyVerification.errors.join('\n'),
    /self-integrity check failed/,
  );

  const semanticLedgerTamper = structuredClone(baseline);
  const semanticLedgerState = semanticLedgerTamper.persistence.stateReceipt;
  semanticLedgerState.ledger.entries[1].allowed = true;
  resealPersistentLedgerFrom(semanticLedgerState, 1);
  semanticLedgerTamper.persistence.deniedAttemptsConsumed = 0;
  semanticLedgerTamper.persistence.finalStateHash =
    semanticLedgerState.stateHash;
  semanticLedgerTamper.persistence.receiptRoot =
    semanticLedgerState.ledger.receiptRoot;
  resealOuterReceipt(semanticLedgerTamper);
  assert.equal(validatePersistentState(semanticLedgerState), true);
  assert.equal(verifyPhase0BReceiptHash(semanticLedgerTamper), true);
  const semanticLedgerVerification = await verifyPhase0BReceipt(
    semanticLedgerTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(semanticLedgerVerification.valid, false);
  assert.match(
    semanticLedgerVerification.errors.join('\n'),
    /persistent state differs from the verified V4 action sequence/,
  );

  const stopDispatchTamper = structuredClone(baseline);
  stopDispatchTamper.emergencyStop.dispatchRequest.targetEntrypoint =
    'attacker_entrypoint';
  resealOuterReceipt(stopDispatchTamper);
  assert.equal(verifyPhase0BReceiptHash(stopDispatchTamper), true);
  const stopDispatchVerification = await verifyPhase0BReceipt(
    stopDispatchTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(stopDispatchVerification.valid, false);
  assert.match(
    stopDispatchVerification.errors.join('\n'),
    /emergency-stop payload differs from the verified V4 stop run/,
  );

  const stopSafetyTamper = structuredClone(baseline);
  stopSafetyTamper.emergencyStop.safetyReceipt.decision = 'continue_run';
  resealOuterReceipt(stopSafetyTamper);
  assert.equal(verifyPhase0BReceiptHash(stopSafetyTamper), true);
  const stopSafetyVerification = await verifyPhase0BReceipt(
    stopSafetyTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(stopSafetyVerification.valid, false);
  assert.match(
    stopSafetyVerification.errors.join('\n'),
    /emergency-stop payload differs from the verified V4 stop run/,
  );

  // A runtime-summary edit is now caught EARLIER and more specifically than it
  // used to be: providerCalls is a projection of the fence counter, so editing
  // one alone breaks the cross-binding before the canonical summary comparison
  // is even reached.
  const runtimeSummaryTamper = structuredClone(baseline);
  runtimeSummaryTamper.runtime.providerCalls = 1;
  resealOuterReceipt(runtimeSummaryTamper);
  assert.equal(verifyPhase0BReceiptHash(runtimeSummaryTamper), true);
  const runtimeSummaryVerification = await verifyPhase0BReceipt(
    runtimeSummaryTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(runtimeSummaryVerification.valid, false);
  assert.match(
    runtimeSummaryVerification.errors.join('\n'),
    /does not equal the fence counter it projects/,
  );

  // A non-provider field of the runtime summary still fails for the ORIGINAL
  // reason, so the rule above did not swallow the summary comparison.
  const runtimeCountTamper = structuredClone(baseline);
  runtimeCountTamper.runtime.capturedResponsesConsumed = 3;
  resealOuterReceipt(runtimeCountTamper);
  assert.equal(verifyPhase0BReceiptHash(runtimeCountTamper), true);
  const runtimeCountVerification = await verifyPhase0BReceipt(
    runtimeCountTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(runtimeCountVerification.valid, false);
  assert.match(
    runtimeCountVerification.errors.join('\n'),
    /runtime summary differs from verified V4 run/,
  );

  // The CONSISTENT forgery: move the projection AND the counter it projects, so
  // the cross-binding holds. The gate must still refuse it, because a nonzero
  // measured provider count is a violation whatever the rest of the receipt
  // agrees on. (This is the shape the old literal-vs-literal check could not
  // distinguish from a clean run at all.)
  const consistentProviderTamper = structuredClone(baseline);
  consistentProviderTamper.runtime.providerCalls = 1;
  consistentProviderTamper.runtime.providerFence.providerFetchCallsObserved = 1;
  consistentProviderTamper.runtime.providerFence.providerFetchCallTargets = [
    'http://provider.invalid/never',
  ];
  consistentProviderTamper.runtime.providerFence.fetchCallsObserved += 1;
  consistentProviderTamper.receipt.providerCallsMadeByTracer = 1;
  resealOuterReceipt(consistentProviderTamper);
  const consistentProviderVerification = await verifyPhase0BReceipt(
    consistentProviderTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(consistentProviderVerification.valid, false);
  assert.match(
    consistentProviderVerification.errors.join('\n'),
    /PROVIDER-CALL VIOLATION|self-integrity check failed/,
  );

  // ABSENT EVIDENCE BLOCKS: a receipt whose fence never ran must FAIL, not read
  // as a clean zero.
  const unmeasuredTamper = structuredClone(baseline);
  unmeasuredTamper.runtime.providerFence.measured = false;
  unmeasuredTamper.runtime.providerFence.unmeasuredReason =
    'fence was not installed';
  unmeasuredTamper.runtime.providerFence.providerFetchCallsObserved = null;
  unmeasuredTamper.runtime.providerFence.fetchCallsObserved = null;
  unmeasuredTamper.receipt.providerCallMeasurement = 'unmeasured';
  unmeasuredTamper.receipt.providerCallsMadeByTracer = null;
  resealOuterReceipt(unmeasuredTamper);
  assert.equal(verifyPhase0BReceiptHash(unmeasuredTamper), false);
  const unmeasuredVerification = await verifyPhase0BReceipt(
    unmeasuredTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(unmeasuredVerification.valid, false);
  assert.match(
    unmeasuredVerification.errors.join('\n'),
    /self-integrity check failed/,
  );

  // The measurement is REAL, not a shape.
  assert.equal(baseline.runtime.providerFence.measured, true);
  assert.equal(baseline.runtime.providerFence.providerFetchCallsObserved, 0);
  assert.deepEqual(baseline.runtime.providerFence.providerFetchCallTargets, []);
  assert.equal(baseline.receipt.providerCallMeasurement, 'measured');

  const observerProjectionTamper = structuredClone(baseline);
  observerProjectionTamper.runtime.observerProjection.on.canonicalFields
    .residentObservationHash = flipHexDigest(
      observerProjectionTamper.runtime.observerProjection.on.canonicalFields
        .residentObservationHash,
    );
  resealOuterReceipt(observerProjectionTamper);
  assert.equal(verifyPhase0BReceiptHash(observerProjectionTamper), true);
  const observerProjectionVerification = await verifyPhase0BReceipt(
    observerProjectionTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(observerProjectionVerification.valid, false);
  assert.match(
    observerProjectionVerification.errors.join('\n'),
    /runtime summary differs from verified V4 run/,
  );

  const observerPayloadHashTamper = structuredClone(baseline);
  observerPayloadHashTamper.runtime.observerProof
    .preObserverCanonicalPayloadHash = '7'.repeat(64);
  observerPayloadHashTamper.runtime.observerProof
    .postObserverCanonicalPayloadHash = '7'.repeat(64);
  resealOuterReceipt(observerPayloadHashTamper);
  assert.equal(verifyPhase0BReceiptHash(observerPayloadHashTamper), true);
  const observerPayloadHashVerification = await verifyPhase0BReceipt(
    observerPayloadHashTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(observerPayloadHashVerification.valid, false);
  assert.match(
    observerPayloadHashVerification.errors.join('\n'),
    /sealed HoloScript observer proof differs/i,
  );

  for (const target of ['proof', 'projection']) {
    const observerShadowFieldTamper = structuredClone(baseline);
    if (target === 'proof') {
      observerShadowFieldTamper.runtime.observerProof
        .publisherAuthenticated = true;
    } else {
      observerShadowFieldTamper.runtime.observerProof.observerProjection
        .publisherAuthenticated = true;
    }
    resealOuterReceipt(observerShadowFieldTamper);
    assert.equal(verifyPhase0BReceiptHash(observerShadowFieldTamper), true);
    const observerShadowFieldVerification = await verifyPhase0BReceipt(
      observerShadowFieldTamper,
      {
        root: repoRoot,
        trustedValidatorConfig: trustedValidator.config,
      },
    );
    assert.equal(observerShadowFieldVerification.valid, false);
    assert.match(
      observerShadowFieldVerification.errors.join('\n'),
      /keys differ/i,
    );
  }

  const unknownAssertionTamper = structuredClone(baseline);
  unknownAssertionTamper.assertions.productionPhaseComplete = true;
  resealOuterReceipt(unknownAssertionTamper);
  assert.equal(verifyPhase0BReceiptHash(unknownAssertionTamper), true);
  const unknownAssertionVerification = await verifyPhase0BReceipt(
    unknownAssertionTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(unknownAssertionVerification.valid, false);
  assert.match(
    unknownAssertionVerification.errors.join('\n'),
    /Phase 0B assertions keys differ/,
  );

  const outerTamper = structuredClone(baseline);
  outerTamper.claimBoundary.scientificOutcomeClaimed = true;
  resealOuterReceipt(outerTamper);
  assert.equal(verifyPhase0BReceiptHash(outerTamper), true);
  const fullOuterTamperVerification = await verifyPhase0BReceipt(
    outerTamper,
    {
      root: repoRoot,
      trustedValidatorConfig: trustedValidator.config,
    },
  );
  assert.equal(fullOuterTamperVerification.valid, false);
  assert.match(
    fullOuterTamperVerification.errors.join('\n'),
    /claim boundary is invalid/,
  );

  assert.equal(Object.isFrozen(trustedValidator.config), true);
  const validatorReceipt = baseline.validator.validatorReceipt;
  assert.equal(
    verifyRuntimeInjectedValidator(
      validatorReceipt,
      { trustedConfig: trustedValidator.config },
    ).valid,
    true,
  );

  const signatureTamper = structuredClone(validatorReceipt);
  signatureTamper.signatureBase64 =
    `${signatureTamper.signatureBase64[0] === 'A' ? 'B' : 'A'}`
    + signatureTamper.signatureBase64.slice(1);
  assertValidatorRejected(signatureTamper);

  const configTamper = structuredClone(validatorReceipt);
  configTamper.config.algorithm = 'none';
  assertValidatorRejected(configTamper);

  assertValidatorRejected(validatorReceipt, {
    validatorSourceHash: flipHexDigest(
      validatorReceipt.config.validatorSourceHash,
    ),
  });
  assertValidatorRejected(validatorReceipt, {
    registryReceiptId: 'untrusted-registry-receipt',
  });

  const manifestFieldTamper = structuredClone(validatorReceipt);
  manifestFieldTamper.manifest.actions[0].args.residentId = 'resident-attacker';
  assertValidatorRejected(manifestFieldTamper);

  const unknownManifestField = structuredClone(validatorReceipt);
  unknownManifestField.manifest.unexpectedAuthority = 'composition-supplied';
  assertValidatorRejected(unknownManifestField);

  const secondSigner = createRuntimeInjectedValidatorFixture({
    authorityId: trustedValidator.config.authorityId,
    registryReceiptId: trustedValidator.config.registryReceiptId,
    validatorSourceHash: trustedValidator.config.validatorSourceHash,
  });
  const foreignSignerReceipt = secondSigner.issue(
    structuredClone(validatorReceipt.manifest),
  );
  assertValidatorRejected(
    foreignSignerReceipt,
    { trustedConfig: trustedValidator.config },
  );
  assert.throws(
    () => initializePersistentStore({
      initialWorld,
      storeDir: foreignSignerStore,
      trustedValidatorConfig: trustedValidator.config,
      validatorReceipt: foreignSignerReceipt,
    }),
    /Cannot initialize untrusted validator state/,
  );

  const persistedState = readPersistentState(tracerStore);
  const stateTamper = structuredClone(persistedState);
  stateTamper.world.publicWaterUnits += 100;
  assert.throws(
    () => validatePersistentState(stateTamper),
    /Persistent state hash mismatch/,
  );

  const ledgerTamper = structuredClone(persistedState);
  ledgerTamper.ledger.entries[0].allowed =
    !ledgerTamper.ledger.entries[0].allowed;
  resealPersistentState(ledgerTamper);
  assert.throws(
    () => validatePersistentState(ledgerTamper),
    /Persistent ledger entry 0 hash mismatch/,
  );

  const consumedAuthorizationTamper = structuredClone(persistedState);
  consumedAuthorizationTamper.consumedAuthorizations[0].nonce =
    'attacker-rewritten-nonce';
  resealPersistentState(consumedAuthorizationTamper);
  assert.throws(
    () => validatePersistentState(consumedAuthorizationTamper),
    /Consumed authorization 0 is inconsistent/,
  );

  const outboxDeletionTamper = structuredClone(persistedState);
  outboxDeletionTamper.eventOutbox.pop();
  resealPersistentState(outboxDeletionTamper);
  assert.throws(
    () => validatePersistentState(outboxDeletionTamper),
    /Persistent state counters are inconsistent/,
  );

  const outboxCorrelationTamper = structuredClone(persistedState);
  outboxCorrelationTamper.eventOutbox[0].receiptHash =
    flipHexDigest(outboxCorrelationTamper.eventOutbox[0].receiptHash);
  resealPersistentState(outboxCorrelationTamper);
  assert.throws(
    () => validatePersistentState(outboxCorrelationTamper),
    /Event outbox entry 0 is inconsistent/,
  );

  mkdirSync(lockedStore, { recursive: true });
  writeFileSync(
    path.join(lockedStore, 'state.lock'),
    'held-by-adversarial-test\n',
    'utf8',
  );
  assert.throws(
    () => initializePersistentStore({
      initialWorld,
      storeDir: lockedStore,
      trustedValidatorConfig: trustedValidator.config,
      validatorReceipt,
    }),
    /Persistent authorization store is locked by another writer/,
  );
  assert.equal(existsSync(path.join(lockedStore, 'state.json')), false);
} finally {
  rmSync(ownedRoot, { recursive: true, force: true });
  if (existsSync(runtimeScratchRoot)) {
    for (const entry of readdirSync(runtimeScratchRoot)) {
      if (ownedTracerScratchPattern.test(entry)) {
        rmSync(
          path.join(runtimeScratchRoot, entry),
          { recursive: true, force: true },
        );
      }
    }
  }
}

console.log('PASS HoloLand Model Village Phase 0B runtime adversarial tests');
