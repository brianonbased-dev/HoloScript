// Model Village MV-B2 admission bridge + per-run isolation (ENGINEERING LANE).
//
// ADMISSION-GATING DESIGN (load-bearing; spec lines 293-330, 427-433 and the
// production plan "Run slot" section): a live model proposal NEVER becomes a
// world mutation directly. After the proposal barrier closes and adjudication
// runs, an ADMITTED ActionDecisionReceipt whose proposal EXACTLY matches the
// pre-authorized deterministic action (contribute_water -> commons_cistern,
// amount 1 — already encoded in the frozen phase0b plan) GATES the execution
// of the EXISTING deterministic V4 lane: this bridge then runs the fixed
// source-run (runPhase0BEngineeringTracer) and the action is committed from
// the VERIFIED V4 receipt through the existing atomic admission path
// (validator-signed manifest + sequence/nonce burn + atomic state.json rename)
// into a per-run persistent store. An admitted proposal that does not match a
// pre-authorized action is receipted admitted_no_preauthorized_action and
// causes NO mutation. Denied proposals cause NO mutation. In one sentence:
// LIVE PROPOSALS GATE, DETERMINISTIC RECEIPTS MUTATE.
//
// Language boundary (spec lines 106-108): this module is gating, transport,
// and verification only — no resident reasoning, no village rules, no scoring
// policy. The pre-authorized action catalog below re-states plan DATA that is
// already frozen in source/proofs/model-village-phase0b-plan.hs; it authors
// no new behavior.
//
// Claim boundary: nothing here is a live study run, Phase 1 admission,
// blinded alias assignment (residents map to openly-declared engineering
// routes), native lifecycle execution, or open-outcome canonical mutation.
// Canonical world mutation, when it happens at all, comes ONLY from the
// existing verified V4 deterministic lane, because the headless plan schema
// requires the outcome up front — the open-outcome tier is a seeded future
// slice (idea-seeds/2026-07-26-open-outcome-receipt-tier.md).
//
// Public receipts NEVER carry raw model text — hashes and bounded projections
// only. The GatedAdmissionReceipt carries the decision receipt's HASH, never
// its reason/proposal text.

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalDigest,
  canonicalJson,
  createRuntimeInjectedValidatorFixture,
  readPersistentState,
  runPhase0BEngineeringTracer,
  validatePersistentState,
  verifyPhase0BReceipt,
} from './model-village-phase0b-runtime.mjs';
import { createSealedCustodyStore } from './model-village-custody-store.mjs';
// One runId law for the whole MV-B2 lane: the scheduler enforces the same
// pattern at round start, so a runId accepted there can never be rejected
// here after the live provider turns have already been spent.
import { RUN_ID_PATTERN } from './model-village-turn-scheduler.mjs';

export const ADMISSION_BRIDGE_ENGINE =
  'hololand-model-village-admission-bridge-v1';
export const GATED_ADMISSION_RECEIPT_SCHEMA =
  'hololand.model-village-gated-admission.v1';
export const ACTION_DECISION_RECEIPT_SCHEMA =
  'hololand.model-village-action-decision.v1';

export const GENESIS_RECEIPT_HASH = '0'.repeat(64);

export const REFUSAL_CLASSES = Object.freeze([
  'decision_denied',
  'no_preauthorized_match',
  'barrier_frozen',
  // The frozen phase0b plan pre-authorizes exactly ONE deterministic action
  // per provisioned run. When a second ADMITTED catalog match arrives after
  // that action has already been committed this run, the integrator receipts
  // it with this class instead of attempting a second gated execution (which
  // the durable store's run anchor refuses by construction). No mutation.
  'preauthorized_action_already_committed',
  // Post-commit verification failure: the deterministic V4 lane already
  // performed its atomic commit, but the bridge's independent re-verification
  // or durable cross-checks failed afterwards. The mutation may exist in the
  // per-run store, so it must never be silent — this class receipts it
  // instead of throwing past the receipt boundary. Consumers treat it as
  // run-contaminating evidence, never as an admission.
  'committed_but_unverified',
]);

/**
 * The pre-authorized deterministic action catalog. This is plan DATA: each
 * entry restates an action already frozen (and validator-signed at run time)
 * in the phase0b plan. An admitted live proposal can only ever gate one of
 * these; the mutation itself is committed from the verified V4 receipt of
 * that deterministic lane, never from the proposal.
 */
export const PREAUTHORIZED_ACTION_CATALOG = Object.freeze([
  Object.freeze({
    action: 'contribute_water',
    amount: 1,
    deterministicLane: Object.freeze({
      entrypoint: 'contribute_water',
      expectedParsedProposal: 'contribute_water:commons_cistern:1',
      planRunId: 'mv-phase0b-tracer-001',
      scheduleEntryId: 'mv-phase0b-action-01',
    }),
    preauthorizedActionId: 'mv-b2-preauth-contribute-water-01',
    target: 'commons_cistern',
  }),
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const DECISION_REASON_MAX_LENGTH = 240;

const GATED_ADMISSION_RECEIPT_KEYS = Object.freeze([
  'actionDecisionReceiptHash',
  'admitted',
  'at',
  'committedAction',
  'engine',
  'mutationExecutedByDeterministicLaneOnly',
  'persistentStoreStateHash',
  // The frozen policy and vocabulary that governed the adjudication this
  // receipt gates: without them an archived GatedAdmissionReceipt could not
  // be tied to the frozen MV-B2 policy in isolation.
  'policyHash',
  'preauthorizedActionId',
  'priorReceiptHash',
  'reason',
  'receiptHash',
  'refusalClass',
  'residentId',
  'runId',
  'schema',
  'v4ActionLedgerRoot',
  'v4TerminalCommitment',
  'vocabularyHash',
  'worldStateAfterHash',
  'worldStateBeforeHash',
]);
// Closed key set of the MV-B2 turn scheduler's ActionDecisionReceipt: the
// bridge accepts EXACTLY that shape — no extra fields, no alternate field
// names — so a hand-authored object cannot smuggle an unbound policy or
// vocabulary past the gate.
const ACTION_DECISION_BINDING_KEYS = Object.freeze([
  'decidedAt',
  'decision',
  'policyHash',
  'preauthorizedMatch',
  'priorReceiptHash',
  'proposalHash',
  'reason',
  'receiptHash',
  'residentId',
  'runId',
  'schema',
  'turnOpportunityId',
  'vocabularyHash',
]);
const COMMITTED_ACTION_KEYS = Object.freeze(['action', 'amount', 'target']);
const CATALOG_ENTRY_KEYS = Object.freeze([
  'action',
  'amount',
  'deterministicLane',
  'preauthorizedActionId',
  'target',
]);
const CATALOG_LANE_KEYS = Object.freeze([
  'entrypoint',
  'expectedParsedProposal',
  'planRunId',
  'scheduleEntryId',
]);

const REFUSAL_REASONS = Object.freeze({
  barrier_frozen: 'barrier_frozen_no_mutation',
  committed_but_unverified:
    'deterministic_lane_committed_but_post_commit_verification_failed',
  decision_denied: 'decision_denied_no_mutation',
  no_preauthorized_match: 'admitted_no_preauthorized_action',
  preauthorized_action_already_committed:
    'preauthorized_action_already_committed_this_run_no_further_mutation',
});

export class ModelVillageAdmissionBridgeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageAdmissionBridgeError';
  }
}

function fail(message) {
  throw new ModelVillageAdmissionBridgeError(message);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    const missing = expected.filter((key) => !actual.includes(key));
    const unexpected = actual.filter((key) => !expected.includes(key));
    fail(
      `${label} keys differ; missing=${canonicalJson(missing)} `
      + `unexpected=${canonicalJson(unexpected)}`,
    );
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be lowercase sha256 hex`);
  }
}

function assertRunId(value, label) {
  assertNonEmptyString(value, label);
  if (!RUN_ID_PATTERN.test(value)) {
    fail(`${label} must match ${RUN_ID_PATTERN} (engineering lane runIds are mv-b2-*)`);
  }
}

function defaultHololandRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function sealReceipt(unsigned) {
  return deepFreeze({ ...unsigned, receiptHash: canonicalDigest(unsigned) });
}

// ---------------------------------------------------------------------------
// Per-run isolation.
// ---------------------------------------------------------------------------

/**
 * Provisions a fully isolated run context: a fresh persistent-store directory
 * (for the existing phase0b atomic admission path) plus a fresh sealed
 * custody store (AES-256-GCM, hash-chained access log, exclusive lock), both
 * under `<scratchRoot>/<runId>/`. Cross-run isolation is by construction:
 * the run directory MUST NOT pre-exist (reuse fails loud), so no state,
 * ledger entry, custody object, or lock can leak between runs.
 *
 * teardown() closes the custody store (releasing its exclusive lock) and
 * freezes the run barrier: executeGatedAdmission on a torn-down context is
 * receipted refusalClass 'barrier_frozen' and causes no mutation. The
 * persistent store's own lock is transient (held only inside commits by the
 * phase0b runtime), so nothing else needs releasing.
 *
 * NOTE: the deterministic lane (runPhase0BEngineeringTracer) also creates
 * four disposable fault/mismatch scratch stores under
 * `<hololandRoot>/.tmp/hololand/model-village/phase0b-runtime/` per gated
 * execution; callers own that cleanup (same convention as the phase0b test).
 */
export function provisionIsolatedRun({
  runId,
  scratchRoot,
  operator,
  hololandRoot = defaultHololandRoot(),
} = {}) {
  assertRunId(runId, 'runId');
  assertNonEmptyString(scratchRoot, 'scratchRoot');
  assertNonEmptyString(operator, 'operator');
  assertNonEmptyString(hololandRoot, 'hololandRoot');

  const runRoot = path.resolve(scratchRoot, runId);
  if (existsSync(runRoot)) {
    fail(
      `run directory ${runRoot} already exists; refusing reuse — every run `
      + 'gets a fresh isolated store by construction',
    );
  }
  const storeDir = path.join(runRoot, 'persistent-store');
  const custodyDir = path.join(runRoot, 'custody');
  mkdirSync(storeDir, { recursive: true });

  // createSealedCustodyStore itself refuses a non-empty rootDir, takes the
  // exclusive store lock, and appends the genesis 'create' access entry.
  const custodyStore = createSealedCustodyStore({
    operator,
    retentionPolicy: {
      description:
        'MV-B2 per-run engineering custody store; sealed raw material only, '
        + 'deletable by content-key destruction at any time.',
      frozenAt: new Date().toISOString(),
      policyId: 'mv-b2-per-run-custody-retention-v1',
    },
    rootDir: custodyDir,
    runLabel: runId,
  });

  let tornDown = false;
  return {
    custodyDir,
    custodyStore,
    hololandRoot: path.resolve(hololandRoot),
    isTornDown: () => tornDown,
    operator,
    runId,
    storeDir,
    teardown: () => {
      if (tornDown) return;
      tornDown = true;
      custodyStore.close();
    },
  };
}

// ---------------------------------------------------------------------------
// ActionDecisionReceipt input contract (produced by the adjudication slice).
// ---------------------------------------------------------------------------

/**
 * Integrity + shape gate for the incoming ActionDecisionReceipt. Per spec
 * lines 293-330 the decision chain records the policy hash, proposal hash,
 * action-vocabulary hash, allow/deny decision, and reason (default deny).
 * The receipt must be self-hashed with the shared convention
 * (receiptHash === canonicalDigest(receipt minus receiptHash)), so ANY
 * tampered field fails here, BEFORE any V4 execution and before any side
 * effect. The shape is CLOSED to the MV-B2 turn scheduler's exact
 * ActionDecisionReceipt keys, the schema is pinned exactly, and the policy
 * and vocabulary hashes must equal the frozen manifest hashes the caller
 * certifies — a self-hashed forgery binding a nonexistent policy cannot gate
 * a mutation.
 */
function verifyActionDecisionReceiptBinding(
  receipt,
  runId,
  expectedPolicyHash,
  expectedVocabularyHash,
) {
  assertObject(receipt, 'actionDecisionReceipt');
  // Closed keys FIRST: the bridge accepts exactly the MV-B2 turn scheduler's
  // ActionDecisionReceipt shape. A self-hashed but hand-authored object with
  // extra/missing/renamed fields is rejected before any V4 execution.
  assertExactKeys(
    receipt,
    ACTION_DECISION_BINDING_KEYS,
    'actionDecisionReceipt',
  );
  const { receiptHash, ...unsigned } = receipt;
  assertSha256(receiptHash, 'actionDecisionReceipt.receiptHash');
  if (canonicalDigest(unsigned) !== receiptHash) {
    fail(
      'actionDecisionReceipt integrity verification failed (receiptHash does '
      + 'not recompute); rejected before any V4 execution',
    );
  }
  if (receipt.schema !== ACTION_DECISION_RECEIPT_SCHEMA) {
    fail(
      `actionDecisionReceipt.schema must be ${ACTION_DECISION_RECEIPT_SCHEMA} `
      + '(exact pin, not a pattern)',
    );
  }
  if (receipt.decision !== 'admit' && receipt.decision !== 'deny') {
    fail("actionDecisionReceipt.decision must be 'admit' or 'deny'");
  }
  if (typeof receipt.preauthorizedMatch !== 'boolean') {
    fail('actionDecisionReceipt.preauthorizedMatch must be boolean');
  }
  assertNonEmptyString(receipt.residentId, 'actionDecisionReceipt.residentId');
  if (
    typeof receipt.reason !== 'string'
    || receipt.reason.length === 0
    || receipt.reason.length > DECISION_REASON_MAX_LENGTH
  ) {
    fail('actionDecisionReceipt.reason must be a bounded non-empty string');
  }
  // The decision must bind the FROZEN policy and vocabulary the caller
  // certifies (the checker passes the loaded manifest's hashes). Well-formed
  // sha256 hex is not enough: an attacker-authored policy hash would
  // otherwise gate a real mutation.
  assertSha256(expectedPolicyHash, 'expectedPolicyHash');
  assertSha256(expectedVocabularyHash, 'expectedVocabularyHash');
  if (receipt.policyHash !== expectedPolicyHash) {
    fail(
      'actionDecisionReceipt.policyHash does not bind the frozen turn policy; '
      + 'rejected before any V4 execution',
    );
  }
  if (receipt.vocabularyHash !== expectedVocabularyHash) {
    fail(
      'actionDecisionReceipt.vocabularyHash does not bind the frozen proposal '
      + 'vocabulary; rejected before any V4 execution',
    );
  }
  // A DENIED decision may pin proposalHash null (the MV-B2 turn scheduler's
  // own verifier REQUIRES null there: a denied turn has no adjudicable
  // proposal). An ADMITTED decision must always pin a real proposal hash.
  if (receipt.decision === 'admit' || receipt.proposalHash !== null) {
    assertSha256(receipt.proposalHash, 'actionDecisionReceipt.proposalHash');
  }
  if (receipt.runId !== runId) {
    fail(
      `actionDecisionReceipt.runId ${receipt.runId} does not bind run ${runId}`,
    );
  }
}

function validateCatalogEntry(entry) {
  assertExactKeys(entry, CATALOG_ENTRY_KEYS, 'preauthorizedCatalogEntry');
  assertExactKeys(
    entry.deterministicLane,
    CATALOG_LANE_KEYS,
    'preauthorizedCatalogEntry.deterministicLane',
  );
  const known = PREAUTHORIZED_ACTION_CATALOG.find(
    (candidate) => canonicalJson(candidate) === canonicalJson(entry),
  );
  return known ?? null;
}

// ---------------------------------------------------------------------------
// Receipt construction.
// ---------------------------------------------------------------------------

function buildReceiptBase({
  runId,
  residentId,
  actionDecisionReceiptHash,
  priorReceiptHash,
  policyHash,
  vocabularyHash,
}) {
  return {
    actionDecisionReceiptHash,
    at: new Date().toISOString(),
    engine: ADMISSION_BRIDGE_ENGINE,
    // Invariant statement, pinned true on EVERY receipt (admitted or
    // refused): any world mutation that occurs under this bridge is executed
    // by the deterministic V4 lane only — live proposals gate, deterministic
    // receipts mutate. On refusals no mutation occurs at all.
    mutationExecutedByDeterministicLaneOnly: true,
    // The frozen policy/vocabulary that governed the gated adjudication, so
    // the archived receipt is verifiable against the manifest in isolation.
    policyHash,
    priorReceiptHash,
    residentId,
    runId,
    schema: GATED_ADMISSION_RECEIPT_SCHEMA,
    vocabularyHash,
  };
}

/**
 * Deny-path receipt builder: refusals ride the SAME public schema as
 * admissions so the run ledger is uniform. Refused receipts carry null in
 * every deterministic-lane field — there was no V4 execution and no
 * mutation. Exported so the turn scheduler can receipt refusals it decides
 * before ever reaching the bridge (e.g. barrier_frozen at slot close).
 */
export function buildRefusedAdmissionReceipt({
  runId,
  residentId,
  refusalClass,
  actionDecisionReceiptHash,
  policyHash,
  vocabularyHash,
  reason = REFUSAL_REASONS[refusalClass],
  priorReceiptHash = GENESIS_RECEIPT_HASH,
} = {}) {
  assertRunId(runId, 'runId');
  assertNonEmptyString(residentId, 'residentId');
  if (!REFUSAL_CLASSES.includes(refusalClass)) {
    fail(`refusalClass must be one of ${canonicalJson([...REFUSAL_CLASSES])}`);
  }
  assertSha256(actionDecisionReceiptHash, 'actionDecisionReceiptHash');
  assertSha256(policyHash, 'policyHash');
  assertSha256(vocabularyHash, 'vocabularyHash');
  assertNonEmptyString(reason, 'reason');
  assertSha256(priorReceiptHash, 'priorReceiptHash');
  return sealReceipt({
    ...buildReceiptBase({
      actionDecisionReceiptHash,
      policyHash,
      priorReceiptHash,
      residentId,
      runId,
      vocabularyHash,
    }),
    admitted: false,
    committedAction: null,
    persistentStoreStateHash: null,
    preauthorizedActionId: null,
    reason,
    refusalClass,
    v4ActionLedgerRoot: null,
    v4TerminalCommitment: null,
    worldStateAfterHash: null,
    worldStateBeforeHash: null,
  });
}

// ---------------------------------------------------------------------------
// Gated admission execution.
// ---------------------------------------------------------------------------

/**
 * Implements the admission-gating design end to end.
 *
 * Refusal paths (NO side effects — the run directory is byte-identical
 * afterwards; refusals are receipted, never silent):
 *  - torn-down/frozen run context      -> refusalClass 'barrier_frozen'
 *  - decision !== 'admit'              -> refusalClass 'decision_denied'
 *  - preauthorizedMatch !== true, or the admitted proposal does not bind a
 *    known catalog entry               -> refusalClass 'no_preauthorized_match'
 *                                         (reason admitted_no_preauthorized_action)
 * A tampered/malformed actionDecisionReceipt THROWS (typed error) before any
 * V4 execution and before any side effect — forgery is a protocol violation,
 * not a receipted refusal.
 *
 * Gated path (decision === 'admit' AND preauthorizedMatch === true AND the
 * catalog entry is recognized): runs the EXISTING deterministic V4 lane
 * (runPhase0BEngineeringTracer over the fixed frozen phase0b sources — the
 * only exported driver of the existing atomic admission path; commit
 * functions are module-private by design and are NOT reimplemented here),
 * re-verifies the resulting V4 source-run receipt with the exported full
 * verifier (verifyPhase0BReceipt: validator signature vs frozen host pin,
 * V4 CLI re-verification, fresh deterministic replay, persistent-state
 * reconstruction), re-reads and re-validates the per-run persistent store,
 * cross-checks that the committed action IS the catalog action, and emits
 * the public GatedAdmissionReceipt. The world mutation is committed from the
 * VERIFIED V4 receipt by the existing atomic admission path — never from the
 * live proposal. Live proposals gate; deterministic receipts mutate.
 *
 * Returns { admitted, reason, receipt } and, on the gated path, also
 * { phase0bReceipt } (the full self-verified deterministic-lane receipt, for
 * archival by the caller — it contains no raw model text by construction).
 */
export async function executeGatedAdmission({
  runId,
  actionDecisionReceipt,
  preauthorizedCatalogEntry,
  storeContext,
  operator,
  expectedPolicyHash,
  expectedVocabularyHash,
  priorReceiptHash = GENESIS_RECEIPT_HASH,
} = {}) {
  assertRunId(runId, 'runId');
  assertNonEmptyString(operator, 'operator');
  assertSha256(priorReceiptHash, 'priorReceiptHash');
  assertObject(storeContext, 'storeContext');
  assertNonEmptyString(storeContext.storeDir, 'storeContext.storeDir');
  assertNonEmptyString(storeContext.hololandRoot, 'storeContext.hololandRoot');
  if (typeof storeContext.isTornDown !== 'function') {
    fail('storeContext.isTornDown must be a function');
  }
  if (storeContext.runId !== runId) {
    fail(
      `storeContext.runId ${storeContext.runId} does not bind run ${runId}; `
      + 'cross-run store reuse is refused by construction',
    );
  }

  // (1) Integrity gate FIRST: a tampered decision receipt — or one that does
  // not bind the caller-certified frozen policy/vocabulary hashes — is
  // rejected before any V4 execution and before any side effect.
  verifyActionDecisionReceiptBinding(
    actionDecisionReceipt,
    runId,
    expectedPolicyHash,
    expectedVocabularyHash,
  );
  const actionDecisionReceiptHash = actionDecisionReceipt.receiptHash;
  const residentId = actionDecisionReceipt.residentId;

  const refuse = (refusalClass, reasonOverride) => {
    const receipt = buildRefusedAdmissionReceipt({
      actionDecisionReceiptHash,
      policyHash: expectedPolicyHash,
      priorReceiptHash,
      refusalClass,
      residentId,
      runId,
      vocabularyHash: expectedVocabularyHash,
      ...(reasonOverride === undefined ? {} : { reason: reasonOverride }),
    });
    return { admitted: false, reason: receipt.reason, receipt };
  };

  // (2) Frozen barrier: after teardown (or emergency freeze) nothing is
  // admitted and nothing mutates.
  if (storeContext.isTornDown() === true) return refuse('barrier_frozen');

  // (3) Denied proposals cause no mutation (rejection without mutation,
  // spec lines 427-433).
  if (actionDecisionReceipt.decision !== 'admit') {
    return refuse('decision_denied');
  }

  // (4) Admission without an exact pre-authorized match is receipted
  // admitted_no_preauthorized_action and causes NO mutation.
  if (actionDecisionReceipt.preauthorizedMatch !== true) {
    return refuse('no_preauthorized_match');
  }
  assertObject(preauthorizedCatalogEntry, 'preauthorizedCatalogEntry');
  const catalogEntry = validateCatalogEntry(preauthorizedCatalogEntry);
  if (catalogEntry === null) return refuse('no_preauthorized_match');
  if (
    typeof actionDecisionReceipt.preauthorizedActionId === 'string'
    && actionDecisionReceipt.preauthorizedActionId
      !== catalogEntry.preauthorizedActionId
  ) {
    return refuse('no_preauthorized_match');
  }

  // (5) GATED PATH: the admitted proposal gates the existing deterministic
  // V4 lane; the lane's verified receipts perform the mutation through the
  // existing atomic admission path into the per-run persistent store.
  const hololandRoot = storeContext.hololandRoot;
  const validator = createRuntimeInjectedValidatorFixture();
  const phase0bReceipt = await runPhase0BEngineeringTracer({
    root: hololandRoot,
    signRunManifest: validator.issue,
    storeDir: storeContext.storeDir,
    trustedValidatorConfig: validator.config,
  });

  // (6)-(8) run AFTER the deterministic lane's atomic commit. A failure in
  // here must therefore never escape as a bare throw: the mutation may
  // already exist in the per-run store, and an unreceipted mutation would
  // violate the slice's central claim. Any post-commit verification failure
  // is receipted as refusalClass 'committed_but_unverified' — contaminating
  // evidence, never an admission, never silent.
  let state;
  let execution;
  let worldStateBeforeHash;
  let worldStateAfterHash;
  const lane = catalogEntry.deterministicLane;
  try {
    // (6) Independent re-verification with the exported full verifier — the
    // bridge does not trust the tracer's own return value.
    const verification = await verifyPhase0BReceipt(phase0bReceipt, {
      root: hololandRoot,
      trustedValidatorConfig: validator.config,
    });
    if (verification.valid !== true) {
      fail(
        'deterministic V4 lane receipt failed exported re-verification: '
        + verification.errors.join('; '),
      );
    }

    // (7) Re-read the durable per-run store and cross-check that what was
    // committed is EXACTLY the catalog action, committed from the verified
    // V4 action ledger.
    state = readPersistentState(storeContext.storeDir);
    validatePersistentState(state);
    if (state.stateHash !== phase0bReceipt.persistence.finalStateHash) {
      fail('durable store stateHash does not match the deterministic-lane receipt');
    }
    execution = phase0bReceipt.runtime.executionReceipt;
    const committedEntry = state.ledger.entries.find(
      (entry) => entry.scheduleEntryId === lane.scheduleEntryId,
    );
    if (!committedEntry) {
      fail(`no persistent ledger entry for ${lane.scheduleEntryId}`);
    }
    const mutatingEntries = state.ledger.entries.filter(
      (entry) => entry.worldMutationCommitted === true,
    );
    const ledgerAction = execution.actionLedger.find(
      (entry) => entry.payload.scheduleEntryId === lane.scheduleEntryId,
    );
    if (
      committedEntry.entrypoint !== lane.entrypoint
      || committedEntry.allowed !== true
      || committedEntry.admissionMatched !== true
      || committedEntry.worldMutationCommitted !== true
      || mutatingEntries.length !== 1
      || mutatingEntries[0] !== committedEntry
      || !ledgerAction
      || ledgerAction.payload.args.parsedProposal !== lane.expectedParsedProposal
      || ledgerAction.entryHash !== committedEntry.upstreamActionEntryHash
      || state.runId !== lane.planRunId
    ) {
      fail(
        'committed deterministic action does not exactly match the '
        + 'pre-authorized catalog entry',
      );
    }

    // (8) World-state binding from the V4 receipt's public-state snapshots.
    const beforeSnapshot = execution.publicStateSnapshots[0];
    const afterSnapshot = execution.publicStateSnapshots.find(
      (entry) => entry.payload.scheduleEntryId === lane.scheduleEntryId,
    );
    if (!beforeSnapshot || !afterSnapshot) {
      fail('V4 receipt is missing the pre/post public-state snapshots');
    }
    worldStateBeforeHash = canonicalDigest(
      beforeSnapshot.payload.publicState,
    );
    worldStateAfterHash = canonicalDigest(afterSnapshot.payload.publicState);
    if (
      committedEntry.preWorldStateHash !== worldStateBeforeHash
      || committedEntry.postWorldStateHash !== worldStateAfterHash
      || canonicalDigest(state.world) !== worldStateAfterHash
    ) {
      fail('persistent world hashes do not bind the V4 snapshots');
    }
  } catch (error) {
    const bounded = String(error?.message ?? error).slice(0, DECISION_REASON_MAX_LENGTH - 40);
    return {
      ...refuse(
        'committed_but_unverified',
        `deterministic_lane_committed_but_unverified: ${bounded}`,
      ),
      phase0bReceipt,
    };
  }

  const receipt = sealReceipt({
    ...buildReceiptBase({
      actionDecisionReceiptHash,
      policyHash: expectedPolicyHash,
      priorReceiptHash,
      residentId,
      runId,
      vocabularyHash: expectedVocabularyHash,
    }),
    admitted: true,
    committedAction: {
      action: catalogEntry.action,
      amount: catalogEntry.amount,
      target: catalogEntry.target,
    },
    persistentStoreStateHash: state.stateHash,
    preauthorizedActionId: catalogEntry.preauthorizedActionId,
    reason: 'admitted_preauthorized_action_committed_from_verified_v4_receipt',
    refusalClass: null,
    v4ActionLedgerRoot: execution.terminal.actionRoot,
    v4TerminalCommitment: execution.terminal.terminalCommitment,
    worldStateAfterHash,
    worldStateBeforeHash,
  });
  return { admitted: true, phase0bReceipt, reason: receipt.reason, receipt };
}

// ---------------------------------------------------------------------------
// Public receipt verification (closed keys, schema/engine pins, hash
// recompute, admitted/refused branch consistency).
// ---------------------------------------------------------------------------

export function verifyGatedAdmissionReceipt(receipt) {
  try {
    assertExactKeys(receipt, GATED_ADMISSION_RECEIPT_KEYS, 'gated admission receipt');
    if (receipt.schema !== GATED_ADMISSION_RECEIPT_SCHEMA) {
      fail(`gated admission receipt schema is not ${GATED_ADMISSION_RECEIPT_SCHEMA}`);
    }
    if (receipt.engine !== ADMISSION_BRIDGE_ENGINE) {
      fail(`gated admission receipt engine is not ${ADMISSION_BRIDGE_ENGINE}`);
    }
    assertRunId(receipt.runId, 'gated admission receipt runId');
    assertNonEmptyString(receipt.residentId, 'gated admission receipt residentId');
    assertSha256(
      receipt.actionDecisionReceiptHash,
      'gated admission receipt actionDecisionReceiptHash',
    );
    assertSha256(receipt.priorReceiptHash, 'gated admission receipt priorReceiptHash');
    assertSha256(receipt.policyHash, 'gated admission receipt policyHash');
    assertSha256(receipt.vocabularyHash, 'gated admission receipt vocabularyHash');
    assertNonEmptyString(receipt.reason, 'gated admission receipt reason');
    if (typeof receipt.at !== 'string' || !ISO_UTC_PATTERN.test(receipt.at)) {
      fail('gated admission receipt at must be an ISO UTC timestamp');
    }
    if (receipt.mutationExecutedByDeterministicLaneOnly !== true) {
      fail(
        'gated admission receipt must pin mutationExecutedByDeterministicLaneOnly '
        + 'true — live proposals gate, deterministic receipts mutate',
      );
    }
    if (typeof receipt.admitted !== 'boolean') {
      fail('gated admission receipt admitted must be boolean');
    }
    if (receipt.admitted === true) {
      if (receipt.refusalClass !== null) {
        fail('admitted receipt must carry null refusalClass');
      }
      assertExactKeys(
        receipt.committedAction,
        COMMITTED_ACTION_KEYS,
        'gated admission receipt committedAction',
      );
      const catalogEntry = PREAUTHORIZED_ACTION_CATALOG.find(
        (candidate) =>
          candidate.preauthorizedActionId === receipt.preauthorizedActionId,
      );
      if (!catalogEntry) {
        fail('admitted receipt preauthorizedActionId is not in the catalog');
      }
      if (
        receipt.committedAction.action !== catalogEntry.action
        || receipt.committedAction.target !== catalogEntry.target
        || receipt.committedAction.amount !== catalogEntry.amount
      ) {
        fail('admitted receipt committedAction is not the cataloged action');
      }
      assertSha256(receipt.v4TerminalCommitment, 'v4TerminalCommitment');
      assertSha256(receipt.v4ActionLedgerRoot, 'v4ActionLedgerRoot');
      assertSha256(receipt.worldStateBeforeHash, 'worldStateBeforeHash');
      assertSha256(receipt.worldStateAfterHash, 'worldStateAfterHash');
      assertSha256(receipt.persistentStoreStateHash, 'persistentStoreStateHash');
      if (receipt.worldStateBeforeHash === receipt.worldStateAfterHash) {
        fail('admitted receipt world hashes claim a mutation but are equal');
      }
    } else {
      if (!REFUSAL_CLASSES.includes(receipt.refusalClass)) {
        fail('refused receipt refusalClass is outside the closed set');
      }
      for (const key of [
        'committedAction',
        'persistentStoreStateHash',
        'preauthorizedActionId',
        'v4ActionLedgerRoot',
        'v4TerminalCommitment',
        'worldStateAfterHash',
        'worldStateBeforeHash',
      ]) {
        if (receipt[key] !== null) {
          fail(`refused receipt ${key} must be null (no V4 execution, no mutation)`);
        }
      }
    }
    const { receiptHash, ...unsigned } = receipt;
    assertSha256(receiptHash, 'gated admission receipt receiptHash');
    if (canonicalDigest(unsigned) !== receiptHash) {
      fail('gated admission receipt receiptHash does not recompute');
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}
