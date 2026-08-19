#!/usr/bin/env node
/* global process, structuredClone */

// MV-B2 admission bridge tests. Fully offline: the deterministic V4 lane
// (runPhase0BEngineeringTracer) executes locally against the built HoloScript
// dist — no network, no providers. No live study run, no Phase 1 admission,
// and no blinded alias assignment is claimed by anything in this file.
//
// Core claim under test: LIVE PROPOSALS GATE, DETERMINISTIC RECEIPTS MUTATE.
// Every refusal path is proven side-effect-free by hashing the entire run
// directory before and after the call.

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canonicalDigest,
  readPersistentState,
  validatePersistentState,
} from '../model-village-phase0b-runtime.mjs';
import { openSealedCustodyStore } from '../model-village-custody-store.mjs';
import {
  ADMISSION_BRIDGE_ENGINE,
  GATED_ADMISSION_RECEIPT_SCHEMA,
  GENESIS_RECEIPT_HASH,
  ModelVillageAdmissionBridgeError,
  PREAUTHORIZED_ACTION_CATALOG,
  buildRefusedAdmissionReceipt,
  executeGatedAdmission,
  provisionIsolatedRun,
  verifyGatedAdmissionReceipt,
} from '../model-village-admission-bridge.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const ownedRoot = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'admission-bridge-tests',
  `bridge-${process.pid}-${randomUUID()}`,
);
const scratchRoot = path.join(ownedRoot, 'runs');
mkdirSync(scratchRoot, { recursive: true });

// The deterministic lane leaves four disposable fault/mismatch scratch
// stores per tracer execution under this root (phase0b test convention:
// clean by own-pid pattern afterwards).
const tracerScratchRoot = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'phase0b-runtime',
);
const tracerScratchPattern = new RegExp(
  '^(main|fault-before-rename|fault-after-rename|mismatch-target'
  + `|mismatch-state-hashes)-${process.pid}-`,
);

const OPERATOR = 'mv-b2-admission-bridge-test-operator';
const CATALOG_ENTRY = PREAUTHORIZED_ACTION_CATALOG[0];

const initialWorld = Object.freeze({
  acceptedActionCount: 0,
  emergencyStopState: 'armed',
  phase: 'running',
  publicWaterUnits: 2,
});
const postCommitWorld = Object.freeze({
  acceptedActionCount: 1,
  emergencyStopState: 'armed',
  phase: 'running',
  publicWaterUnits: 3,
});

let runCounter = 0;
function nextRunId() {
  runCounter += 1;
  return `mv-b2-test-run-${String(runCounter).padStart(2, '0')}`;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fakeHash(seed) {
  return sha256Hex(Buffer.from(`mv-b2-test-${seed}`, 'utf8'));
}

/**
 * Deterministic content hash of an entire directory tree (sorted relative
 * paths + file bytes). Byte-identical trees hash equal; any created,
 * deleted, or rewritten file changes the hash. This is the no-side-effects
 * probe for every refusal path.
 */
function hashDirectoryTree(rootDir) {
  const hash = createHash('sha256');
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const fullPath = path.join(dir, entry);
      const relative = path.relative(rootDir, fullPath).replaceAll('\\', '/');
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        hash.update(`D:${relative}\n`);
        walk(fullPath);
      } else {
        hash.update(`F:${relative}:${stats.size}\n`);
        hash.update(readFileSync(fullPath));
      }
    }
  };
  walk(rootDir);
  return hash.digest('hex');
}

// The frozen hashes the caller certifies. The bridge refuses any decision
// receipt whose policyHash/vocabularyHash differ from these — tested below.
const TEST_POLICY_HASH = fakeHash('frozen-policy');
const TEST_VOCABULARY_HASH = fakeHash('frozen-vocabulary');

// EXACTLY the MV-B2 turn scheduler's closed ActionDecisionReceipt shape:
// the bridge rejects extra fields, renamed fields, or a non-pinned schema.
function makeActionDecisionReceipt(runId, overrides = {}) {
  const unsigned = {
    decidedAt: new Date().toISOString(),
    decision: 'admit',
    policyHash: TEST_POLICY_HASH,
    preauthorizedMatch: true,
    priorReceiptHash: GENESIS_RECEIPT_HASH,
    proposalHash: fakeHash('proposal-contribute-water'),
    reason: 'admitted_preauthorized_action_match',
    residentId: 'resident-01',
    runId,
    schema: 'hololand.model-village-action-decision.v1',
    turnOpportunityId: `${runId}-t1-resident-01`,
    vocabularyHash: TEST_VOCABULARY_HASH,
    ...overrides,
  };
  return Object.freeze({ ...unsigned, receiptHash: canonicalDigest(unsigned) });
}

function tamper(receipt, mutate) {
  const copy = structuredClone(receipt);
  mutate(copy);
  return copy; // receiptHash left stale on purpose
}

test.after(() => {
  rmSync(ownedRoot, { recursive: true, force: true });
  if (existsSync(tracerScratchRoot)) {
    for (const entry of readdirSync(tracerScratchRoot)) {
      if (tracerScratchPattern.test(entry)) {
        rmSync(path.join(tracerScratchRoot, entry), {
          recursive: true,
          force: true,
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Provisioning + isolation.
// ---------------------------------------------------------------------------

test('provisionIsolatedRun creates fresh dirs and refuses reuse', () => {
  const runId = nextRunId();
  const context = provisionIsolatedRun({
    operator: OPERATOR,
    runId,
    scratchRoot,
  });
  try {
    assert.equal(context.runId, runId);
    assert.equal(existsSync(context.storeDir), true);
    assert.equal(readdirSync(context.storeDir).length, 0);
    assert.equal(
      existsSync(path.join(context.custodyDir, 'store-manifest.json')),
      true,
    );
    assert.equal(context.isTornDown(), false);

    // Reuse of the same runId (same run directory) is refused loudly.
    assert.throws(
      () => provisionIsolatedRun({ operator: OPERATOR, runId, scratchRoot }),
      (error) =>
        error instanceof ModelVillageAdmissionBridgeError
        && /refusing reuse/.test(error.message),
    );
    // Engineering-lane runId naming is enforced.
    assert.throws(
      () => provisionIsolatedRun({
        operator: OPERATOR,
        runId: 'mv-b1-wrong-lane',
        scratchRoot,
      }),
      /mv-b2-/,
    );
  } finally {
    context.teardown();
  }
});

test('two sequential runs share zero state', () => {
  const contextA = provisionIsolatedRun({
    operator: OPERATOR,
    runId: nextRunId(),
    scratchRoot,
  });
  let custodyIdFromRunA;
  try {
    const sealed = contextA.custodyStore.sealObject({
      bytes: Buffer.from('run-A private material', 'utf8'),
      kind: 'mv-b2-test-object',
      label: 'run-A-only',
    });
    custodyIdFromRunA = sealed.custodyId;
    assert.equal(
      contextA.custodyStore.readObject(custodyIdFromRunA).bytes.toString('utf8'),
      'run-A private material',
    );
  } finally {
    contextA.teardown();
  }

  const contextB = provisionIsolatedRun({
    operator: OPERATOR,
    runId: nextRunId(),
    scratchRoot,
  });
  try {
    // Different physical directories entirely.
    assert.notEqual(contextA.storeDir, contextB.storeDir);
    assert.notEqual(contextA.custodyDir, contextB.custodyDir);
    // Run A's sealed object is ABSENT from run B's custody store.
    assert.throws(
      () => contextB.custodyStore.readObject(custodyIdFromRunA),
      /no sealed object exists/,
    );
    // Run B's persistent store starts empty — nothing leaked from run A.
    assert.equal(readdirSync(contextB.storeDir).length, 0);
    assert.equal(
      existsSync(path.join(contextB.storeDir, 'state.json')),
      false,
    );
  } finally {
    contextB.teardown();
  }
});

test('teardown releases locks so the custody store can be reopened', () => {
  const context = provisionIsolatedRun({
    operator: OPERATOR,
    runId: nextRunId(),
    scratchRoot,
  });
  // While the provisioned handle is live, its exclusive lock blocks a second
  // handle on the same store.
  assert.throws(
    () => openSealedCustodyStore({ operator: OPERATOR, rootDir: context.custodyDir }),
    /lock/i,
  );
  context.teardown();
  assert.equal(context.isTornDown(), true);
  // After teardown the lock is released: the store reopens cleanly.
  const reopened = openSealedCustodyStore({
    operator: OPERATOR,
    rootDir: context.custodyDir,
  });
  reopened.close();
  // teardown is idempotent.
  context.teardown();
});

// ---------------------------------------------------------------------------
// Refusal paths — receipted, side-effect-free.
// ---------------------------------------------------------------------------

test("decision 'deny' causes no store mutation and is receipted decision_denied", async () => {
  const runId = nextRunId();
  const context = provisionIsolatedRun({
    operator: OPERATOR,
    runId,
    scratchRoot,
  });
  try {
    const runRoot = path.dirname(context.storeDir);
    const before = hashDirectoryTree(runRoot);
    const decision = makeActionDecisionReceipt(runId, {
      decision: 'deny',
      preauthorizedMatch: false,
      reason: 'default-deny-vocabulary-violation',
    });
    const outcome = await executeGatedAdmission({
      actionDecisionReceipt: decision,
      expectedPolicyHash: TEST_POLICY_HASH,
      expectedVocabularyHash: TEST_VOCABULARY_HASH,
      operator: OPERATOR,
      preauthorizedCatalogEntry: CATALOG_ENTRY,
      runId,
      storeContext: context,
    });
    assert.equal(outcome.admitted, false);
    assert.equal(outcome.receipt.refusalClass, 'decision_denied');
    assert.equal(outcome.receipt.admitted, false);
    assert.equal(outcome.receipt.committedAction, null);
    assert.equal(outcome.receipt.v4TerminalCommitment, null);
    assert.equal(outcome.receipt.persistentStoreStateHash, null);
    assert.equal(
      outcome.receipt.actionDecisionReceiptHash,
      decision.receiptHash,
    );
    assert.equal(outcome.receipt.mutationExecutedByDeterministicLaneOnly, true);
    assert.equal(verifyGatedAdmissionReceipt(outcome.receipt).ok, true);
    // NO side effects: the whole run directory is byte-identical.
    assert.equal(hashDirectoryTree(runRoot), before);
    assert.equal(existsSync(path.join(context.storeDir, 'state.json')), false);
  } finally {
    context.teardown();
  }
});

test('admit WITHOUT preauthorized match is refused with no mutation', async () => {
  const runId = nextRunId();
  const context = provisionIsolatedRun({
    operator: OPERATOR,
    runId,
    scratchRoot,
  });
  try {
    const runRoot = path.dirname(context.storeDir);
    const before = hashDirectoryTree(runRoot);
    const decision = makeActionDecisionReceipt(runId, {
      preauthorizedMatch: false,
      proposalHash: fakeHash('proposal-plant-crop-not-preauthorized'),
      reason: 'valid-vocabulary-proposal-without-preauthorized-twin',
    });
    const outcome = await executeGatedAdmission({
      actionDecisionReceipt: decision,
      expectedPolicyHash: TEST_POLICY_HASH,
      expectedVocabularyHash: TEST_VOCABULARY_HASH,
      operator: OPERATOR,
      preauthorizedCatalogEntry: CATALOG_ENTRY,
      runId,
      storeContext: context,
    });
    assert.equal(outcome.admitted, false);
    assert.equal(outcome.receipt.refusalClass, 'no_preauthorized_match');
    assert.equal(outcome.receipt.reason, 'admitted_no_preauthorized_action');
    assert.equal(verifyGatedAdmissionReceipt(outcome.receipt).ok, true);
    assert.equal(hashDirectoryTree(runRoot), before);

    // An admitted decision bound to an UNRECOGNIZED catalog entry is also
    // refused no_preauthorized_match (only pinned catalog actions may gate).
    const admitted = makeActionDecisionReceipt(runId);
    const foreignEntry = structuredClone(CATALOG_ENTRY);
    foreignEntry.amount = 999;
    const foreignOutcome = await executeGatedAdmission({
      actionDecisionReceipt: admitted,
      expectedPolicyHash: TEST_POLICY_HASH,
      expectedVocabularyHash: TEST_VOCABULARY_HASH,
      operator: OPERATOR,
      preauthorizedCatalogEntry: foreignEntry,
      runId,
      storeContext: context,
    });
    assert.equal(foreignOutcome.admitted, false);
    assert.equal(foreignOutcome.receipt.refusalClass, 'no_preauthorized_match');
    assert.equal(hashDirectoryTree(runRoot), before);
  } finally {
    context.teardown();
  }
});

test('tampered actionDecisionReceipt is rejected before any V4 execution', async () => {
  const runId = nextRunId();
  const context = provisionIsolatedRun({
    operator: OPERATOR,
    runId,
    scratchRoot,
  });
  try {
    const runRoot = path.dirname(context.storeDir);
    const before = hashDirectoryTree(runRoot);
    const genuine = makeActionDecisionReceipt(runId, {
      decision: 'deny',
      preauthorizedMatch: false,
    });
    // Forge the adjudication outcome after sealing: decision deny -> admit.
    const forged = tamper(genuine, (copy) => {
      copy.decision = 'admit';
      copy.preauthorizedMatch = true;
    });
    await assert.rejects(
      executeGatedAdmission({
        actionDecisionReceipt: forged,
        expectedPolicyHash: TEST_POLICY_HASH,
        expectedVocabularyHash: TEST_VOCABULARY_HASH,
        operator: OPERATOR,
        preauthorizedCatalogEntry: CATALOG_ENTRY,
        runId,
        storeContext: context,
      }),
      (error) =>
        error instanceof ModelVillageAdmissionBridgeError
        && /integrity verification failed/.test(error.message)
        && /before any V4 execution/.test(error.message),
    );
    // Tampering ANY field breaks the self-hash, even ones the bridge does
    // not name (covered by canonicalDigest over the whole receipt).
    const forgedExtra = tamper(makeActionDecisionReceipt(runId), (copy) => {
      copy.policyHash = fakeHash('attacker-swapped-policy');
    });
    await assert.rejects(
      executeGatedAdmission({
        actionDecisionReceipt: forgedExtra,
        expectedPolicyHash: TEST_POLICY_HASH,
        expectedVocabularyHash: TEST_VOCABULARY_HASH,
        operator: OPERATOR,
        preauthorizedCatalogEntry: CATALOG_ENTRY,
        runId,
        storeContext: context,
      }),
      /integrity verification failed/,
    );
    // A decision receipt bound to a DIFFERENT run is a protocol violation.
    const wrongRun = makeActionDecisionReceipt('mv-b2-some-other-run');
    await assert.rejects(
      executeGatedAdmission({
        actionDecisionReceipt: wrongRun,
        expectedPolicyHash: TEST_POLICY_HASH,
        expectedVocabularyHash: TEST_VOCABULARY_HASH,
        operator: OPERATOR,
        preauthorizedCatalogEntry: CATALOG_ENTRY,
        runId,
        storeContext: context,
      }),
      /does not bind run/,
    );
    // REVIEW REGRESSION: a self-hashed receipt binding an attacker-authored
    // policy (well-formed sha256, wrong value), or riding the wrong receipt
    // schema, is a protocol violation — rejected before any V4 execution.
    const foreignPolicy = makeActionDecisionReceipt(runId, {
      policyHash: fakeHash('attacker-authored-policy'),
    });
    await assert.rejects(
      executeGatedAdmission({
        actionDecisionReceipt: foreignPolicy,
        expectedPolicyHash: TEST_POLICY_HASH,
        expectedVocabularyHash: TEST_VOCABULARY_HASH,
        operator: OPERATOR,
        preauthorizedCatalogEntry: CATALOG_ENTRY,
        runId,
        storeContext: context,
      }),
      /does not bind the frozen turn policy/,
    );
    const foreignSchema = makeActionDecisionReceipt(runId, {
      schema: 'hololand.model-village-safety-check.v1',
    });
    await assert.rejects(
      executeGatedAdmission({
        actionDecisionReceipt: foreignSchema,
        expectedPolicyHash: TEST_POLICY_HASH,
        expectedVocabularyHash: TEST_VOCABULARY_HASH,
        operator: OPERATOR,
        preauthorizedCatalogEntry: CATALOG_ENTRY,
        runId,
        storeContext: context,
      }),
      /schema must be/,
    );
    // Zero side effects from every rejection above; no V4 lane artifacts.
    assert.equal(hashDirectoryTree(runRoot), before);
    assert.equal(existsSync(path.join(context.storeDir, 'state.json')), false);
  } finally {
    context.teardown();
  }
});

test('torn-down run context refuses with barrier_frozen and no mutation', async () => {
  const runId = nextRunId();
  const context = provisionIsolatedRun({
    operator: OPERATOR,
    runId,
    scratchRoot,
  });
  context.teardown();
  const runRoot = path.dirname(context.storeDir);
  const before = hashDirectoryTree(runRoot);
  const outcome = await executeGatedAdmission({
    actionDecisionReceipt: makeActionDecisionReceipt(runId),
    expectedPolicyHash: TEST_POLICY_HASH,
    expectedVocabularyHash: TEST_VOCABULARY_HASH,
    operator: OPERATOR,
    preauthorizedCatalogEntry: CATALOG_ENTRY,
    runId,
    storeContext: context,
  });
  assert.equal(outcome.admitted, false);
  assert.equal(outcome.receipt.refusalClass, 'barrier_frozen');
  assert.equal(verifyGatedAdmissionReceipt(outcome.receipt).ok, true);
  assert.equal(hashDirectoryTree(runRoot), before);
});

// ---------------------------------------------------------------------------
// The gated path: admit + preauthorized match -> deterministic lane commits
// exactly the catalog action into the per-run persistent store.
// ---------------------------------------------------------------------------

test('admit + preauthorizedMatch commits exactly the catalog action', async () => {
  const runId = nextRunId();
  const context = provisionIsolatedRun({
    operator: OPERATOR,
    runId,
    scratchRoot,
  });
  try {
    const decision = makeActionDecisionReceipt(runId);
    const outcome = await executeGatedAdmission({
      actionDecisionReceipt: decision,
      expectedPolicyHash: TEST_POLICY_HASH,
      expectedVocabularyHash: TEST_VOCABULARY_HASH,
      operator: OPERATOR,
      preauthorizedCatalogEntry: CATALOG_ENTRY,
      priorReceiptHash: GENESIS_RECEIPT_HASH,
      runId,
      storeContext: context,
    });

    assert.equal(outcome.admitted, true);
    const receipt = outcome.receipt;
    assert.equal(receipt.schema, GATED_ADMISSION_RECEIPT_SCHEMA);
    assert.equal(receipt.engine, ADMISSION_BRIDGE_ENGINE);
    assert.equal(receipt.runId, runId);
    assert.equal(receipt.residentId, 'resident-01');
    assert.equal(receipt.admitted, true);
    assert.equal(receipt.refusalClass, null);
    assert.equal(receipt.actionDecisionReceiptHash, decision.receiptHash);
    assert.equal(receipt.mutationExecutedByDeterministicLaneOnly, true);
    assert.deepEqual(receipt.committedAction, {
      action: 'contribute_water',
      amount: 1,
      target: 'commons_cistern',
    });
    assert.equal(
      receipt.preauthorizedActionId,
      CATALOG_ENTRY.preauthorizedActionId,
    );
    // World hashes come from the V4 receipt's snapshots and equal the known
    // frozen-plan deltas (water 2 -> 3, exactly one accepted action).
    assert.equal(receipt.worldStateBeforeHash, canonicalDigest(initialWorld));
    assert.equal(receipt.worldStateAfterHash, canonicalDigest(postCommitWorld));
    assert.equal(verifyGatedAdmissionReceipt(receipt).ok, true);

    // Public receipt carries NO raw model text: hashes, enums, and the
    // bounded committedAction projection only.
    const serialized = JSON.stringify(receipt);
    assert.doesNotMatch(serialized, /proposal-exactly-matches/);
    assert.doesNotMatch(serialized, /private material/);

    // The persistent store is durable, validates, and matches the receipt.
    const state = readPersistentState(context.storeDir);
    assert.equal(validatePersistentState(state), true);
    assert.equal(state.stateHash, receipt.persistentStoreStateHash);
    assert.deepEqual(state.world, postCommitWorld);
    // The deterministic lane commits its full pre-authorized fixed plan
    // (contribute_water allowed + deny_external_message denied), but exactly
    // ONE entry mutated the world — the catalog action.
    const mutating = state.ledger.entries.filter(
      (entry) => entry.worldMutationCommitted === true,
    );
    assert.equal(mutating.length, 1);
    assert.equal(mutating[0].entrypoint, 'contribute_water');
    assert.equal(
      mutating[0].scheduleEntryId,
      CATALOG_ENTRY.deterministicLane.scheduleEntryId,
    );
    assert.equal(mutating[0].allowed, true);
    assert.equal(mutating[0].postWorldStateHash, receipt.worldStateAfterHash);

    // The deterministic-lane receipt is returned for archival and binds the
    // public receipt's V4 commitments.
    assert.equal(
      outcome.phase0bReceipt.runtime.executionReceipt.terminal
        .terminalCommitment,
      receipt.v4TerminalCommitment,
    );
    assert.equal(
      outcome.phase0bReceipt.runtime.executionReceipt.terminal.actionRoot,
      receipt.v4ActionLedgerRoot,
    );
    assert.equal(
      outcome.phase0bReceipt.persistence.finalStateHash,
      receipt.persistentStoreStateHash,
    );

    // GatedAdmissionReceipt tamper detection: any field flip fails verify.
    const flippedAction = tamper(receipt, (copy) => {
      copy.committedAction.amount = 2;
    });
    assert.equal(verifyGatedAdmissionReceipt(flippedAction).ok, false);
    const flippedAdmitted = tamper(receipt, (copy) => {
      copy.admitted = false;
    });
    assert.equal(verifyGatedAdmissionReceipt(flippedAdmitted).ok, false);
    const flippedLane = tamper(receipt, (copy) => {
      copy.mutationExecutedByDeterministicLaneOnly = false;
    });
    assert.equal(verifyGatedAdmissionReceipt(flippedLane).ok, false);
    // Even a RESEALED tamper cannot claim a non-catalog action or a
    // mutation-free "mutation": semantic pins fail before/with the hash.
    const resealedForeignAction = structuredClone(receipt);
    resealedForeignAction.committedAction = {
      action: 'drain_cistern',
      amount: 999,
      target: 'commons_cistern',
    };
    {
      const { receiptHash, ...unsigned } = resealedForeignAction;
      void receiptHash;
      resealedForeignAction.receiptHash = canonicalDigest(unsigned);
    }
    assert.equal(verifyGatedAdmissionReceipt(resealedForeignAction).ok, false);

    // Refused-receipt tamper detection through the shared verifier.
    const refused = buildRefusedAdmissionReceipt({
      actionDecisionReceiptHash: decision.receiptHash,
      policyHash: TEST_POLICY_HASH,
      refusalClass: 'decision_denied',
      residentId: 'resident-02',
      runId,
      vocabularyHash: TEST_VOCABULARY_HASH,
    });
    assert.equal(verifyGatedAdmissionReceipt(refused).ok, true);
    const refusedTamper = tamper(refused, (copy) => {
      copy.refusalClass = 'no_preauthorized_match';
    });
    assert.equal(verifyGatedAdmissionReceipt(refusedTamper).ok, false);
    const refusedWithV4Claims = structuredClone(refused);
    refusedWithV4Claims.v4TerminalCommitment = receipt.v4TerminalCommitment;
    {
      const { receiptHash, ...unsigned } = refusedWithV4Claims;
      void receiptHash;
      refusedWithV4Claims.receiptHash = canonicalDigest(unsigned);
    }
    assert.equal(verifyGatedAdmissionReceipt(refusedWithV4Claims).ok, false);

    // A second gated admission into the SAME per-run store is impossible by
    // construction: the durable store is anchored to run 1's validator pin
    // and its signed authorizations are consumed, so the atomic admission
    // path refuses (anchor mismatch fires first; sequence replay would fire
    // next) — and the refusal throws WITHOUT touching the durable state.
    await assert.rejects(
      executeGatedAdmission({
        actionDecisionReceipt: makeActionDecisionReceipt(runId),
        expectedPolicyHash: TEST_POLICY_HASH,
        expectedVocabularyHash: TEST_VOCABULARY_HASH,
        operator: OPERATOR,
        preauthorizedCatalogEntry: CATALOG_ENTRY,
        runId,
        storeContext: context,
      }),
      /anchor mismatch|already consumed|already exists/,
    );
    const stateAfterRejectedReuse = readPersistentState(context.storeDir);
    assert.equal(stateAfterRejectedReuse.stateHash, state.stateHash);
  } finally {
    context.teardown();
  }
});
