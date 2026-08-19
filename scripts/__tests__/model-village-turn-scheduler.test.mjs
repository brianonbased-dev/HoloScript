#!/usr/bin/env node
/* global Buffer, structuredClone */

// MV-B2 live turn scheduler tests. FULLY OFFLINE: the turn executor is an
// injected in-process stub (no HTTP at this layer — MV-B1's own suite proves
// the live transport). No live study run, no Phase 1 admission, no blinded
// alias assignment, and no world mutation is claimed by anything here: live
// proposals gate, deterministic receipts mutate, and this suite only proves
// the gating receipts.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  canonicalDigest,
  canonicalJson,
} from '../model-village-phase0b-runtime.mjs';
import {
  ADAPTER_RUNTIME_ENGINE,
  MODEL_TURN_RECEIPT_SCHEMA,
} from '../model-village-adapter-runtime.mjs';
import {
  ACTION_DECISION_RECEIPT_SCHEMA,
  GENESIS_RECEIPT_HASH,
  ModelVillageTurnSchedulerError,
  PROPOSAL_BARRIER_SCHEMA,
  SAFETY_CHECK_RECEIPT_SCHEMA,
  SCHEDULER_ENGINE,
  TURN_OPPORTUNITY_SCHEMA,
  TURN_POLICY_SCHEMA,
  TURN_RECORD_SCHEMA,
  createTurnScheduler,
  loadTurnPolicyManifest,
  verifyActionDecisionReceipt,
  verifyBarrierReceipt,
  verifyRoundReceiptChain,
  verifySafetyCheckReceipt,
} from '../model-village-turn-scheduler.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');

function sha256Hex(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

const policyBundle = await loadTurnPolicyManifest({ hololandRoot: repoRoot });

// The scheduler never touches the custody store itself; it passes the handle
// through to the (stubbed) turn executor. A duck-typed stand-in keeps this
// suite offline and disk-free; the real sealed store is exercised by the
// MV-B1 adapter runtime suite.
const custodyStub = {
  sealObject: async () => ({ custodyId: 'stub-custody-id' }),
  readObject: async () => {
    throw new Error('readObject is not used at this layer');
  },
};

function makeResidents() {
  return ['01', '02', '03', '04', '05', '06'].map((suffix) => ({
    residentId: `resident-${suffix}`,
    route: { routeId: `stub-route-${suffix}` },
    certification: { stub: true },
  }));
}

const contributionProposal = Object.freeze({
  action: 'contribute_water',
  amount: 1,
  reasonLength: 18,
  reasonSha256: sha256Hex('the cistern is low'),
  target: 'commons_cistern',
});
const abstainProposal = Object.freeze({
  action: 'abstain',
  amount: null,
  reasonLength: 7,
  reasonSha256: sha256Hex('resting'),
  target: null,
});

/**
 * Build a FULLY VALID MV-B1 model-turn receipt, exactly as the real executor
 * would emit (closed keys, recomputable receiptHash, bounded proposal
 * projection only). The scheduler's safety check runs the real
 * verifyModelTurnReceipt against these — a sloppy stub receipt would be
 * denied, which is itself the default-deny law under test. The endpoint
 * field is an inert offline marker: no network exists at this layer.
 */
function stubTurnReceipt({
  priorReceiptHash,
  parsedProposal = null,
  proposalDecision = 'deny',
  proposalReason = 'proposal-not-exactly-one-json-object',
  turnCompleted = true,
  errorClass = null,
}) {
  const unsigned = {
    at: new Date(0).toISOString(),
    cacheStateEvidence: {
      providerCacheControlProbed: false,
      state: 'unknown_contamination_receipted',
    },
    custodyRefs: {
      requestCustodyId: 'stub-request-custody',
      responseCustodyId: turnCompleted ? 'stub-response-custody' : null,
    },
    endpoint: 'offline-stub-executor-no-network',
    engine: ADAPTER_RUNTIME_ENGINE,
    errorClass: turnCompleted ? null : (errorClass ?? 'transport_error'),
    fallbackEvidence: 'no-fallback-code-path-single-endpoint',
    generationParameters: {
      maxOutputTokens: 256,
      seedAcceptedEvidence: 'unverified',
      seedRequested: 1234,
      temperature: 0,
    },
    latencyMs: 5,
    parsedProposal,
    priorReceiptHash,
    promptHash: sha256Hex('stub-request-bytes'),
    proposalDecision: turnCompleted ? proposalDecision : 'not_evaluated',
    proposalReason: turnCompleted
      ? proposalReason
      : 'no-response-received-transport-failure',
    responseHash: turnCompleted ? sha256Hex('stub-response-bytes') : null,
    retries: 0,
    revisionEvidence: {
      evidenceCustodyIds: [],
      modelIdReported: null,
      packageVersionReported: null,
      processInstanceId: null,
      tier: 'server-reported',
    },
    routeId: 'stub-route',
    schema: MODEL_TURN_RECEIPT_SCHEMA,
    turnCompleted,
    usageReported: null,
  };
  return { ...unsigned, receiptHash: canonicalDigest(unsigned) };
}

function validContributionExecutor() {
  return async ({ priorReceiptHash }) => stubTurnReceipt({
    priorReceiptHash,
    parsedProposal: contributionProposal,
    proposalDecision: 'valid_proposal',
    proposalReason: 'vocabulary-valid-proposal',
  });
}

function makeScheduler(overrides = {}) {
  return createTurnScheduler({
    policyBundle,
    residents: makeResidents(),
    custodyStore: custodyStub,
    operator: 'mv-b2-test-operator',
    turnExecutor: validContributionExecutor(),
    ...overrides,
  });
}

test('loads and closed-key validates the frozen turn policy manifest', () => {
  assert.equal(policyBundle.policy.schemaId, TURN_POLICY_SCHEMA);
  assert.equal(policyBundle.policy.policyId, 'mv-b2-turn-policy-v1');
  assert.equal(policyBundle.policy.residentsPerTurn, 6);
  assert.equal(policyBundle.policy.turnsPerRun, 1);
  assert.equal(policyBundle.policy.concurrencyLimit, 2);
  assert.equal(policyBundle.policy.turnTimeoutMs, 90000);
  assert.equal(policyBundle.policy.retryCount, 0);
  assert.equal(
    policyBundle.policy.barrierRule,
    'all-turns-resolved-before-any-adjudication',
  );
  assert.equal(policyBundle.policy.adjudicationDefault, 'deny');
  assert.equal(
    policyBundle.policy.vocabularyRef,
    'model-village-adapter-custody-drill.hs#ModelVillageProposalVocabulary',
  );
  // The vocabulary rides in BY REFERENCE from the MV-B1 manifest and is
  // pinned by hash, never duplicated in the MV-B2 manifest.
  assert.equal(
    policyBundle.vocabularyHash,
    canonicalDigest(policyBundle.vocabulary),
  );
  assert.equal(policyBundle.vocabulary.vocabularyId, 'mv-b1-proposal-vocabulary-v1');
  assert.equal(policyBundle.policyHash, policyBundle.manifestHash);
  assert.equal(policyBundle.preauthorizedCatalog.action, 'contribute_water');
  assert.equal(policyBundle.preauthorizedCatalog.target, 'commons_cistern');
  assert.equal(policyBundle.preauthorizedCatalog.amount, 1);
  assert.equal(
    policyBundle.preauthorizedCatalog.sourceLane,
    'phase0b-v4-deterministic',
  );
  assert.equal(policyBundle.snapshotFixture.publicState, '{"water": 2}');
  assert.equal(policyBundle.snapshotFixture.location, 'commons');
  assert.ok(policyBundle.promptTemplate.includes('{"water": 2}'));
  assert.equal(typeof SCHEDULER_ENGINE, 'string');
});

test('rejects a runId outside the engineering lane naming', async () => {
  const scheduler = makeScheduler();
  await assert.rejects(
    scheduler.executeTurnRound({
      runId: 'phase1-live-study',
      publicSnapshot: { water: 2 },
    }),
    ModelVillageTurnSchedulerError,
  );
});

test('issues six bound opportunities, admits catalog matches exactly, and chains barrier -> safety -> decision', async () => {
  // resident-01..04 propose the catalog action, resident-05 abstains (valid
  // but NOT pre-authorized), resident-06 returns unparseable prose (deny).
  const scheduler = makeScheduler({
    turnExecutor: async ({ route, priorReceiptHash }) => {
      if (route.routeId === 'stub-route-05') {
        return stubTurnReceipt({
          priorReceiptHash,
          parsedProposal: abstainProposal,
          proposalDecision: 'valid_proposal',
          proposalReason: 'vocabulary-valid-proposal',
        });
      }
      if (route.routeId === 'stub-route-06') {
        return stubTurnReceipt({ priorReceiptHash });
      }
      return stubTurnReceipt({
        priorReceiptHash,
        parsedProposal: contributionProposal,
        proposalDecision: 'valid_proposal',
        proposalReason: 'vocabulary-valid-proposal',
      });
    },
  });
  const snapshot = { water: 2 };
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-happy',
    publicSnapshot: snapshot,
  });

  // Opportunities: six, resident order, distinct nonces, one snapshot hash.
  const snapshotHash = canonicalDigest(snapshot);
  assert.equal(round.turnOpportunities.length, 6);
  const nonces = new Set(round.turnOpportunities.map((o) => o.nonce));
  assert.equal(nonces.size, 6);
  for (const [index, opportunity] of round.turnOpportunities.entries()) {
    const residentId = `resident-0${index + 1}`;
    assert.equal(opportunity.schema, TURN_OPPORTUNITY_SCHEMA);
    assert.equal(opportunity.residentId, residentId);
    assert.equal(
      opportunity.turnOpportunityId,
      `mv-b2-round-happy-t1-${residentId}`,
    );
    assert.match(opportunity.nonce, /^[a-f0-9]{32}$/);
    assert.equal(opportunity.snapshotHash, snapshotHash);
    assert.equal(opportunity.policyHash, policyBundle.policyHash);
    // Opportunities deliberately carry NO expiresAt: the deadline clock is
    // stamped at DISPATCH onto the turn record, so pool queuing between
    // issuance and dispatch is never charged against the model.
    assert.equal('expiresAt' in opportunity, false);
    assert.ok(typeof opportunity.issuedAt === 'string');
  }

  // Turn records: identical snapshot hash, opportunity binding via the
  // model-turn receipt's priorReceiptHash.
  assert.equal(round.turnReceipts.length, 6);
  for (const [index, record] of round.turnReceipts.entries()) {
    assert.equal(record.schema, TURN_RECORD_SCHEMA);
    assert.equal(record.outcome, 'completed');
    assert.equal(record.snapshotHash, snapshotHash);
    assert.equal(
      record.modelTurnReceipt.priorReceiptHash,
      canonicalDigest(round.turnOpportunities[index]),
    );
    // The deadline is DISPATCH-relative: expiresAt - dispatchedAt equals the
    // frozen ceiling exactly, whatever the pool queuing delay was.
    assert.equal(
      Date.parse(record.expiresAt) - Date.parse(record.dispatchedAt),
      policyBundle.policy.turnTimeoutMs,
    );
    const { recordHash, ...unsigned } = record;
    assert.equal(canonicalDigest(unsigned), recordHash);
  }

  // Barrier: closes over ALL six turn record hashes in resident order.
  const barrier = round.barrierReceipt;
  assert.equal(barrier.schema, PROPOSAL_BARRIER_SCHEMA);
  assert.equal(barrier.frozen, false);
  assert.equal(barrier.snapshotHash, snapshotHash);
  assert.equal(barrier.policyHash, policyBundle.policyHash);
  assert.equal(barrier.priorReceiptHash, GENESIS_RECEIPT_HASH);
  assert.deepEqual(
    barrier.orderedTurnReceiptHashes,
    round.turnReceipts.map((record) => record.recordHash),
  );
  assert.deepEqual(barrier.resolvedCounts, {
    completed: 6,
    failed: 0,
    timedOut: 0,
  });
  assert.deepEqual(verifyBarrierReceipt(barrier), { ok: true, failureReason: null });

  // Adjudication: default deny; admit ONLY vocabulary-valid + safety-pass;
  // preauthorizedMatch ONLY on the exact catalog action.
  assert.equal(round.safetyCheckReceipts.length, 6);
  assert.equal(round.actionDecisionReceipts.length, 6);
  for (const safety of round.safetyCheckReceipts) {
    assert.equal(safety.schema, SAFETY_CHECK_RECEIPT_SCHEMA);
    assert.equal(safety.passed, true);
    assert.equal(safety.vocabularyHash, policyBundle.vocabularyHash);
    assert.deepEqual(
      verifySafetyCheckReceipt(safety),
      { ok: true, failureReason: null },
    );
  }
  for (const [index, decision] of round.actionDecisionReceipts.entries()) {
    assert.equal(decision.schema, ACTION_DECISION_RECEIPT_SCHEMA);
    assert.equal(decision.policyHash, policyBundle.policyHash);
    assert.deepEqual(
      verifyActionDecisionReceipt(decision),
      { ok: true, failureReason: null },
    );
    if (index <= 3) {
      assert.equal(decision.decision, 'admit');
      assert.equal(decision.preauthorizedMatch, true);
      assert.equal(decision.reason, 'admitted_preauthorized_action_match');
      assert.equal(decision.proposalHash, canonicalDigest(contributionProposal));
    } else if (index === 4) {
      // Valid-but-different proposal: admitted, but it gates NOTHING.
      assert.equal(decision.decision, 'admit');
      assert.equal(decision.preauthorizedMatch, false);
      assert.equal(decision.reason, 'admitted_no_preauthorized_action');
      assert.equal(decision.proposalHash, canonicalDigest(abstainProposal));
    } else {
      assert.equal(decision.decision, 'deny');
      assert.equal(decision.preauthorizedMatch, false);
      assert.equal(decision.proposalHash, null);
      assert.equal(decision.reason, 'proposal-not-exactly-one-json-object');
    }
  }

  // Chain order: barrier -> safety(r1) -> decision(r1) -> safety(r2) -> ...
  assert.equal(round.safetyCheckReceipts[0].priorReceiptHash, barrier.barrierHash);
  assert.equal(
    round.actionDecisionReceipts[0].priorReceiptHash,
    round.safetyCheckReceipts[0].receiptHash,
  );
  assert.equal(
    round.safetyCheckReceipts[1].priorReceiptHash,
    round.actionDecisionReceipts[0].receiptHash,
  );
  assert.deepEqual(
    verifyRoundReceiptChain({
      barrierReceipt: barrier,
      safetyCheckReceipts: round.safetyCheckReceipts,
      actionDecisionReceipts: round.actionDecisionReceipts,
    }),
    { ok: true, failureReason: null },
  );
  assert.deepEqual(round.contaminationRegister, []);

  // Public boundary: no raw model text anywhere in the round output.
  assert.ok(!canonicalJson(round.turnReceipts).includes('the cistern is low'));
});

test('concurrency pool never exceeds the frozen limit and proves it via the high-water mark', async () => {
  let inFlight = 0;
  let observedMax = 0;
  const scheduler = makeScheduler({
    turnExecutor: async ({ priorReceiptHash }) => {
      inFlight += 1;
      observedMax = Math.max(observedMax, inFlight);
      await delay(20);
      inFlight -= 1;
      return stubTurnReceipt({
        priorReceiptHash,
        parsedProposal: contributionProposal,
        proposalDecision: 'valid_proposal',
        proposalReason: 'vocabulary-valid-proposal',
      });
    },
  });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-pool',
    publicSnapshot: { water: 2 },
  });
  assert.equal(observedMax, policyBundle.policy.concurrencyLimit);
  assert.equal(
    round.barrierReceipt.concurrencyHighWaterMark,
    policyBundle.policy.concurrencyLimit,
  );
  assert.equal(round.barrierReceipt.resolvedCounts.completed, 6);
});

test('a turn resolving after its deadline is timeout_contaminated and denied unadjudicated', async () => {
  let virtualNow = 1_753_500_000_000;
  const scheduler = makeScheduler({
    nowFn: () => virtualNow,
    turnExecutor: async ({ route, priorReceiptHash }) => {
      const receipt = stubTurnReceipt({
        priorReceiptHash,
        parsedProposal: contributionProposal,
        proposalDecision: 'valid_proposal',
        proposalReason: 'vocabulary-valid-proposal',
      });
      if (route.routeId === 'stub-route-06') {
        // Real 30ms so every other (instant) turn has fully resolved before
        // the virtual clock jumps past the 90s frozen deadline.
        await delay(30);
        virtualNow += 200000;
      }
      return receipt;
    },
  });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-deadline',
    publicSnapshot: { water: 2 },
  });
  const lateRecord = round.turnReceipts[5];
  assert.equal(lateRecord.residentId, 'resident-06');
  assert.equal(lateRecord.outcome, 'timeout_contaminated');
  // The timed-out response was custody-sealed by the executor, but it is
  // WITHHELD from the public turn record and never adjudicated.
  assert.equal(lateRecord.modelTurnReceipt, null);
  assert.deepEqual(
    round.contaminationRegister.map((entry) => entry.kind),
    ['timeout'],
  );
  assert.equal(round.barrierReceipt.frozen, false);
  assert.deepEqual(round.barrierReceipt.resolvedCounts, {
    completed: 5,
    failed: 0,
    timedOut: 1,
  });
  const lateSafety = round.safetyCheckReceipts[5];
  assert.equal(lateSafety.passed, false);
  assert.equal(lateSafety.ceilingsRespected, false);
  assert.equal(lateSafety.responseHash, null);
  const lateDecision = round.actionDecisionReceipts[5];
  assert.equal(lateDecision.decision, 'deny');
  assert.equal(lateDecision.reason, 'turn-timeout-response-never-adjudicated');
  assert.equal(lateDecision.proposalHash, null);
  assert.equal(lateDecision.preauthorizedMatch, false);
  // The on-time residents are unaffected.
  assert.equal(round.actionDecisionReceipts[0].decision, 'admit');
});

test('adjudication stays closed until every turn has resolved (proposal barrier)', async () => {
  const probes = [];
  let scheduler;
  const executor = async ({ priorReceiptHash }) => {
    probes.push(scheduler.inspectLiveRound());
    await delay(5);
    return stubTurnReceipt({
      priorReceiptHash,
      parsedProposal: contributionProposal,
      proposalDecision: 'valid_proposal',
      proposalReason: 'vocabulary-valid-proposal',
    });
  };
  scheduler = makeScheduler({ turnExecutor: executor });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-barrier',
    publicSnapshot: { water: 2 },
  });
  assert.equal(probes.length, 6);
  for (const probe of probes) {
    // At every executor invocation, zero adjudication receipts exist and the
    // barrier is still open.
    assert.equal(probe.actionDecisionReceiptCount, 0);
    assert.equal(probe.safetyCheckReceiptCount, 0);
    assert.equal(probe.barrierClosed, false);
  }
  assert.equal(round.actionDecisionReceipts.length, 6);
  assert.equal(scheduler.inspectLiveRound(), null);
});

test('exactly one executor invocation per resident even when one fails', async () => {
  const callsByRoute = new Map();
  const scheduler = makeScheduler({
    turnExecutor: async ({ route, priorReceiptHash }) => {
      callsByRoute.set(route.routeId, (callsByRoute.get(route.routeId) ?? 0) + 1);
      if (route.routeId === 'stub-route-03') {
        const error = new Error('stub transport failure');
        error.name = 'StubTransportError';
        throw error;
      }
      return stubTurnReceipt({
        priorReceiptHash,
        parsedProposal: contributionProposal,
        proposalDecision: 'valid_proposal',
        proposalReason: 'vocabulary-valid-proposal',
      });
    },
  });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-zero-retry',
    publicSnapshot: { water: 2 },
  });
  assert.equal(callsByRoute.size, 6);
  for (const count of callsByRoute.values()) assert.equal(count, 1);
  const failedRecord = round.turnReceipts[2];
  assert.equal(failedRecord.outcome, 'failed');
  assert.equal(failedRecord.errorClass, 'StubTransportError');
  assert.equal(failedRecord.modelTurnReceipt, null);
  assert.deepEqual(
    round.contaminationRegister.map((entry) => entry.kind),
    ['transport_error'],
  );
  assert.equal(round.barrierReceipt.frozen, false);
  assert.deepEqual(round.barrierReceipt.resolvedCounts, {
    completed: 5,
    failed: 1,
    timedOut: 0,
  });
  const failedDecision = round.actionDecisionReceipts[2];
  assert.equal(failedDecision.decision, 'deny');
  assert.equal(failedDecision.reason, 'turn-failed-no-adjudicable-response');
});

test('a nonce replay attempt freezes the round before any turn executes', async () => {
  let executorCalls = 0;
  const scheduler = makeScheduler({
    turnExecutor: async () => {
      executorCalls += 1;
      throw new Error('must not be invoked in a frozen round');
    },
    nonceFn: () => 'a'.repeat(32),
  });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-replay',
    publicSnapshot: { water: 2 },
  });
  assert.equal(executorCalls, 0);
  assert.equal(round.contaminationRegister.length, 1);
  assert.equal(round.contaminationRegister[0].kind, 'nonce_replay');
  assert.equal(round.barrierReceipt.frozen, true);
  assert.deepEqual(round.barrierReceipt.orderedTurnReceiptHashes, []);
  assert.deepEqual(round.barrierReceipt.resolvedCounts, {
    completed: 0,
    failed: 0,
    timedOut: 0,
  });
  assert.equal(round.barrierReceipt.concurrencyHighWaterMark, 0);
  // Frozen round: no adjudication of any kind.
  assert.deepEqual(round.safetyCheckReceipts, []);
  assert.deepEqual(round.actionDecisionReceipts, []);
  assert.deepEqual(
    verifyRoundReceiptChain({
      barrierReceipt: round.barrierReceipt,
      safetyCheckReceipts: [],
      actionDecisionReceipts: [],
    }),
    { ok: true, failureReason: null },
  );
});

test('mid-round snapshot drift is freezing contamination', async () => {
  const snapshot = { water: 2 };
  const scheduler = makeScheduler({
    turnExecutor: async ({ route, priorReceiptHash }) => {
      await delay(10);
      if (route.routeId === 'stub-route-01') {
        // Aliasing mutation of the caller's snapshot object mid-round.
        snapshot.water = 999;
      }
      return stubTurnReceipt({
        priorReceiptHash,
        parsedProposal: contributionProposal,
        proposalDecision: 'valid_proposal',
        proposalReason: 'vocabulary-valid-proposal',
      });
    },
  });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-drift',
    publicSnapshot: snapshot,
  });
  assert.ok(
    round.contaminationRegister.some(
      (entry) => entry.kind === 'snapshot_hash_mismatch',
    ),
  );
  assert.equal(round.barrierReceipt.frozen, true);
  // Only the turns dispatched before drift detection resolved; the rest were
  // never handed to an executor, and no adjudication ran.
  assert.equal(round.turnReceipts.length, 2);
  assert.deepEqual(round.safetyCheckReceipts, []);
  assert.deepEqual(round.actionDecisionReceipts, []);
});

test('tamper detection on barrier, safety-check, and action-decision receipts', async () => {
  const scheduler = makeScheduler();
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-tamper',
    publicSnapshot: { water: 2 },
  });
  const barrier = round.barrierReceipt;
  const safety = round.safetyCheckReceipts[0];
  const decision = round.actionDecisionReceipts[0];
  assert.equal(verifyBarrierReceipt(barrier).ok, true);
  assert.equal(verifySafetyCheckReceipt(safety).ok, true);
  assert.equal(verifyActionDecisionReceipt(decision).ok, true);

  const resign = (receipt, hashKey, mutate) => {
    const clone = structuredClone(receipt);
    mutate(clone);
    const { [hashKey]: dropped, ...unsigned } = clone;
    assert.equal(typeof dropped, 'string');
    return { ...unsigned, [hashKey]: canonicalDigest(unsigned) };
  };

  // Plain tamper: hash no longer recomputes.
  const frozenFlip = structuredClone(barrier);
  frozenFlip.frozen = true;
  assert.equal(verifyBarrierReceipt(frozenFlip).ok, false);
  const passedFlip = structuredClone(safety);
  passedFlip.passed = false;
  assert.equal(verifySafetyCheckReceipt(passedFlip).ok, false);
  const reasonTamper = structuredClone(decision);
  reasonTamper.reason = 'admitted_no_preauthorized_action';
  assert.equal(verifyActionDecisionReceipt(reasonTamper).ok, false);

  // Closed keys: an extra smuggled key fails even if re-signed.
  assert.equal(
    verifyBarrierReceipt(
      resign(barrier, 'barrierHash', (clone) => {
        clone.rawModelText = 'smuggled';
      }),
    ).ok,
    false,
  );

  // Shape law survives re-signing: counts must sum to the hash count, denied
  // decisions cannot carry a proposalHash, passing safety needs responseHash.
  assert.equal(
    verifyBarrierReceipt(
      resign(barrier, 'barrierHash', (clone) => {
        clone.resolvedCounts.completed = 3;
      }),
    ).ok,
    false,
  );
  assert.equal(
    verifyActionDecisionReceipt(
      resign(decision, 'receiptHash', (clone) => {
        clone.decision = 'deny';
      }),
    ).ok,
    false,
  );
  assert.equal(
    verifySafetyCheckReceipt(
      resign(safety, 'receiptHash', (clone) => {
        clone.responseHash = null;
      }),
    ).ok,
    false,
  );

  // Chain helper: reordering or cross-wiring receipts breaks the chain.
  const swappedSafety = [...round.safetyCheckReceipts];
  [swappedSafety[0], swappedSafety[1]] = [swappedSafety[1], swappedSafety[0]];
  assert.equal(
    verifyRoundReceiptChain({
      barrierReceipt: barrier,
      safetyCheckReceipts: swappedSafety,
      actionDecisionReceipts: round.actionDecisionReceipts,
    }).ok,
    false,
  );
  // A frozen barrier followed by adjudication receipts is invalid.
  assert.equal(
    verifyRoundReceiptChain({
      barrierReceipt: resign(barrier, 'barrierHash', (clone) => {
        clone.frozen = true;
      }),
      safetyCheckReceipts: round.safetyCheckReceipts,
      actionDecisionReceipts: round.actionDecisionReceipts,
    }).ok,
    false,
  );
});

// ---------------------------------------------------------------------------
// Post-review regression tests (MV-B2 adversarial review, 2026-07-26).
// ---------------------------------------------------------------------------

function happyExecutor() {
  return async ({ priorReceiptHash }) => stubTurnReceipt({
    priorReceiptHash,
    parsedProposal: contributionProposal,
    proposalDecision: 'valid_proposal',
    proposalReason: 'vocabulary-valid-proposal',
  });
}

/**
 * Variant policy bundle for tests that need a short REAL deadline (the
 * enforced executor race uses real timers). Recomputes the bundle hashes the
 * same way the loader does; the structural hard laws are untouched.
 */
function makeVariantPolicyBundle(turnTimeoutMs) {
  const clone = structuredClone(policyBundle);
  clone.policy.turnTimeoutMs = turnTimeoutMs;
  const { manifestHash, policyHash, ...content } = clone;
  const digest = canonicalDigest(content);
  return { ...content, manifestHash: digest, policyHash: digest };
}

test('BLOCKER regression: verifyRoundReceiptChain rejects truncated or erased adjudication (non-frozen barrier)', async () => {
  const scheduler = makeScheduler({ turnExecutor: happyExecutor() });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-truncation',
    publicSnapshot: { water: 2 },
  });
  const intact = verifyRoundReceiptChain({
    barrierReceipt: round.barrierReceipt,
    safetyCheckReceipts: round.safetyCheckReceipts,
    actionDecisionReceipts: round.actionDecisionReceipts,
  });
  assert.equal(intact.ok, true);
  // Dropping the chain SUFFIX (last resident) must fail even though every
  // remaining link still verifies.
  const suffixDropped = verifyRoundReceiptChain({
    barrierReceipt: round.barrierReceipt,
    safetyCheckReceipts: round.safetyCheckReceipts.slice(0, 5),
    actionDecisionReceipts: round.actionDecisionReceipts.slice(0, 5),
  });
  assert.equal(suffixDropped.ok, false);
  assert.match(
    suffixDropped.failureReason,
    /exactly one safety\/decision pair per resolved turn/,
  );
  // Wholesale erasure of ALL adjudication receipts must fail: a non-frozen
  // barrier attesting six resolved turns cannot stand alone.
  const erased = verifyRoundReceiptChain({
    barrierReceipt: round.barrierReceipt,
    safetyCheckReceipts: [],
    actionDecisionReceipts: [],
  });
  assert.equal(erased.ok, false);
});

test('a runId is single-use per scheduler (opportunity identities never repeat)', async () => {
  const scheduler = makeScheduler({ turnExecutor: happyExecutor() });
  const first = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-single-use',
    publicSnapshot: { water: 2 },
  });
  assert.equal(first.barrierReceipt.frozen, false);
  await assert.rejects(
    scheduler.executeTurnRound({
      runId: 'mv-b2-round-single-use',
      publicSnapshot: { water: 2 },
    }),
    (error) => error instanceof ModelVillageTurnSchedulerError
      && /single-use/.test(error.message),
  );
  // A DIFFERENT runId on the same scheduler still works: the refusal is
  // about identity reuse, not about the scheduler being spent.
  const second = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-single-use-2',
    publicSnapshot: { water: 2 },
  });
  assert.equal(second.barrierReceipt.frozen, false);
});

test('pool queuing is never charged against the model deadline (dispatch-relative clock)', async () => {
  // Virtual clock: every executor call advances the shared clock 40 virtual
  // seconds, so a resident is charged AT MOST 80s (its own 40s plus its
  // concurrent wave-mate's 40s) against the frozen 90s ceiling. The round
  // takes ~240 virtual seconds end to end, so issue-relative expiry (the
  // reviewed defect) would time out every resident after the first wave;
  // dispatch-relative expiry must complete all six.
  let virtualNow = 1_700_000_000_000;
  const scheduler = makeScheduler({
    nowFn: () => virtualNow,
    turnExecutor: async ({ priorReceiptHash }) => {
      virtualNow += 40_000;
      return stubTurnReceipt({
        priorReceiptHash,
        parsedProposal: contributionProposal,
        proposalDecision: 'valid_proposal',
        proposalReason: 'vocabulary-valid-proposal',
      });
    },
  });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-queue-uncharged',
    publicSnapshot: { water: 2 },
  });
  assert.deepEqual(round.barrierReceipt.resolvedCounts, {
    completed: 6,
    failed: 0,
    timedOut: 0,
  });
  assert.deepEqual(round.contaminationRegister, []);
  for (const record of round.turnReceipts) {
    assert.equal(record.outcome, 'completed');
    assert.equal(
      Date.parse(record.expiresAt) - Date.parse(record.dispatchedAt),
      policyBundle.policy.turnTimeoutMs,
    );
  }
});

test('a never-settling executor is receipted timeout_contaminated instead of wedging the barrier', async () => {
  // Short REAL ceiling via a rehashed variant bundle (structural hard laws
  // unchanged) because the enforced race uses real timers.
  const variantBundle = makeVariantPolicyBundle(150);
  const scheduler = makeScheduler({
    policyBundle: variantBundle,
    turnExecutor: async ({ route, priorReceiptHash }) => {
      if (route.routeId === 'stub-route-03') {
        return new Promise(() => {});
      }
      return stubTurnReceipt({
        priorReceiptHash,
        parsedProposal: contributionProposal,
        proposalDecision: 'valid_proposal',
        proposalReason: 'vocabulary-valid-proposal',
      });
    },
  });
  const round = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-hang-guard',
    publicSnapshot: { water: 2 },
  });
  const hungRecord = round.turnReceipts.find(
    (record) => record.residentId === 'resident-03',
  );
  assert.equal(hungRecord.outcome, 'timeout_contaminated');
  assert.equal(hungRecord.errorClass, 'executor-deadline-exceeded');
  assert.equal(hungRecord.modelTurnReceipt, null);
  assert.equal(round.barrierReceipt.resolvedCounts.timedOut, 1);
  assert.equal(round.barrierReceipt.resolvedCounts.completed, 5);
  // The scheduler is NOT poisoned: a fresh runId still executes.
  const next = await scheduler.executeTurnRound({
    runId: 'mv-b2-round-hang-guard-2',
    publicSnapshot: { water: 2 },
  });
  assert.equal(next.barrierReceipt.frozen, false);
});
