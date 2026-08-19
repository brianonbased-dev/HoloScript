/* global Buffer, process, structuredClone */

// Model Village MV-B2 live turn scheduler (ENGINEERING TRACER LANE).
//
// Language boundary (spec docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md
// lines 106-108): this module is scheduling, canonicalization, and
// verification only. It contains no resident reasoning, no village rules, no
// experimental treatments, no scoring policy, and no model-specific behavior.
// The turn policy, snapshot fixture, pre-authorized action catalog, and the
// proposal vocabulary are canonical `.hs` source data consumed here, never
// authored here.
//
// ADMISSION-GATING DESIGN (the load-bearing rule — "live proposals gate,
// deterministic receipts mutate"): a live model proposal NEVER becomes a
// world mutation directly. After the proposal barrier closes and
// adjudication runs, an ADMITTED proposal that EXACTLY matches the
// pre-authorized deterministic action in ModelVillagePreauthorizedActionCatalog
// (contribute_water -> commons_cistern, amount 1 — the action already encoded
// in the frozen phase0b plan) GATES the execution of the existing
// deterministic V4 lane: the integrator then runs the fixed source-run and
// commits the action from the VERIFIED V4 receipt through the existing
// atomic admission path (scripts/model-village-phase0b-runtime.mjs — whose
// only exported driver of that path is runPhase0BEngineeringTracer; the
// commit functions themselves are module-private there). An admitted
// proposal that does not exactly match the catalog is receipted
// admitted_no_preauthorized_action and causes NO mutation. Denied proposals
// cause no mutation. This module therefore emits ADJUDICATION RECEIPTS ONLY
// and performs zero world mutation itself.
//
// Claim boundary: nothing in this module is a live study run, Phase 1
// admission, blinded alias assignment (residents map to openly-declared
// engineering routes), native lifecycle execution, or open-outcome canonical
// mutation. Canonical world mutation, when it happens at all, comes ONLY
// from the existing verified V4 deterministic lane, because the headless
// plan schema requires the outcome up front — the open-outcome tier is a
// seeded future slice (idea-seeds/2026-07-26-open-outcome-receipt-tier.md).
//
// Spec anchors implemented here (docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md):
// - Lines 293-330: SafetyCheckReceipt / ActionDecisionReceipt record the
//   policy hash, proposal hash, action-vocabulary hash, allow/deny decision,
//   and reason; the default is deny.
// - Lines 391-401: contamination triggers are receipted, never silently
//   retried or dropped.
// - Lines 427-433: rejection without mutation; append-only hash-chained
//   receipts. (Snapshot+rollback before accepted mutation belongs to the V4
//   admission path this module gates, not to this module.)
// - Production plan "Run slot": within a turn all residents receive the same
//   frozen public snapshot; model calls execute concurrently ONLY under the
//   frozen concurrency+timeout policy; the proposal barrier closes before
//   any admission or mutation.
//
// Deadline semantics: the frozen turnTimeoutMs is a PER-EXECUTION ceiling.
// The deadline clock is stamped at DISPATCH (execution start), never at
// opportunity issuance, so bounded-concurrency pool queuing is receipted
// (issuedAt on the opportunity vs dispatchedAt on the turn record) but is
// never charged against the model. The ceiling is also ENFORCED: every
// dispatch races its executor against the deadline, so a never-settling
// executor is receipted timeout_contaminated instead of wedging the barrier.
//
// Replay semantics: the nonce and opportunity registries live on the
// SCHEDULER (they survive rounds), and a runId is single-use per scheduler —
// sequential re-execution of a runId is refused loudly, so opportunity
// identities (and, under a derandomized test nonceFn, opportunity bytes) can
// never repeat across rounds. Cross-process runId reuse is refused at the
// durable layer by provisionIsolatedRun (the run directory must not
// pre-exist).
//
// Public receipts NEVER carry raw model text — hashes and bounded
// projections only (the embedded MV-B1 model-turn receipts are already
// bounded public receipts).

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';
import {
  GENESIS_RECEIPT_HASH,
  executeCertifiedModelTurn,
  loadAdapterCustodyDrillManifest,
  verifyModelTurnReceipt,
} from './model-village-adapter-runtime.mjs';

export const TURN_POLICY_SCHEMA = 'hololand.model-village-turn-policy.v1';
export const TURN_OPPORTUNITY_SCHEMA =
  'hololand.model-village-turn-opportunity.v1';
export const PROPOSAL_BARRIER_SCHEMA =
  'hololand.model-village-proposal-barrier.v1';
export const SAFETY_CHECK_RECEIPT_SCHEMA =
  'hololand.model-village-safety-check.v1';
export const ACTION_DECISION_RECEIPT_SCHEMA =
  'hololand.model-village-action-decision.v1';
export const TURN_RECORD_SCHEMA = 'hololand.model-village-turn-record.v1';
export const SCHEDULER_ENGINE = 'hololand-model-village-turn-scheduler-v1';
export const TURN_POLICY_SOURCE_PATH =
  'source/proofs/model-village-turn-policy.hs';

export { GENESIS_RECEIPT_HASH };

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const NONCE_HEX_PATTERN = /^[a-f0-9]{32}$/;

/** Engineering-lane runId law, shared by the scheduler AND the admission
 * bridge (which also uses runIds as filesystem path segments): lowercase
 * alphanumerics and hyphens only, mv-b2- prefixed. One definition so a runId
 * accepted here can never be rejected downstream after the live provider
 * turns have already been spent. */
export const RUN_ID_PATTERN = /^mv-b2-[a-z0-9][a-z0-9-]*$/;

/** Contamination kinds that FREEZE the round (no further turns issued, no
 * adjudication, frozen:true on the barrier receipt). */
export const FREEZING_CONTAMINATION_KINDS = Object.freeze([
  'snapshot_hash_mismatch',
  'nonce_replay',
  'duplicate_turn_attempt',
]);

const EXPECTED_POLICY_OBJECT_NAMES = Object.freeze([
  'ModelVillageTurnPolicy',
  'ModelVillageTurnSnapshotFixture',
  'ModelVillagePreauthorizedActionCatalog',
]);
const POLICY_KEYS = Object.freeze([
  'adjudicationDefault',
  'barrierRule',
  'concurrencyLimit',
  'laneStatement',
  'policyId',
  'residentsPerTurn',
  'retryCount',
  'schemaId',
  'turnTimeoutMs',
  'turnsPerRun',
  'type',
  'vocabularyRef',
]);
const SNAPSHOT_FIXTURE_KEYS = Object.freeze([
  'fixtureId',
  'location',
  'publicState',
  'type',
]);
const CATALOG_KEYS = Object.freeze([
  'action',
  'amount',
  'catalogId',
  'catalogStatement',
  'sourceLane',
  'target',
  'type',
]);
const POLICY_BUNDLE_KEYS = Object.freeze([
  'manifestHash',
  'policy',
  'policyHash',
  'preauthorizedCatalog',
  'promptTemplate',
  'snapshotFixture',
  'vocabulary',
  'vocabularyHash',
]);
const VOCABULARY_KEYS = Object.freeze([
  'actionsRequiringNullTargetAndAmount',
  'actionsRequiringTargetAndAmount',
  'allowedActions',
  'allowedTargets',
  'amountMax',
  'amountMin',
  'defaultDecision',
  'deniedActions',
  'type',
  'vocabularyId',
]);
// NOTE: opportunities deliberately carry NO expiresAt — the deadline is
// stamped at dispatch onto the turn record, so pool queuing between issuance
// and dispatch is never charged against the model's frozen ceiling.
const TURN_OPPORTUNITY_KEYS = Object.freeze([
  'issuedAt',
  'nonce',
  'policyHash',
  'residentId',
  'schema',
  'snapshotHash',
  'turnOpportunityId',
]);
const TURN_RECORD_KEYS = Object.freeze([
  'dispatchedAt',
  'errorClass',
  'expiresAt',
  'modelTurnReceipt',
  'nonce',
  'outcome',
  'policyHash',
  'recordHash',
  'residentId',
  'resolvedAt',
  'runId',
  'schema',
  'snapshotHash',
  'turnOpportunityId',
]);
const BARRIER_RECEIPT_KEYS = Object.freeze([
  'barrierHash',
  'closedAt',
  'concurrencyHighWaterMark',
  'frozen',
  'orderedTurnReceiptHashes',
  'policyHash',
  'priorReceiptHash',
  'resolvedCounts',
  'runId',
  'schema',
  'snapshotHash',
]);
const RESOLVED_COUNT_KEYS = Object.freeze(['completed', 'failed', 'timedOut']);
const SAFETY_CHECK_RECEIPT_KEYS = Object.freeze([
  'at',
  'ceilingsRespected',
  'checksPerformed',
  'passed',
  'priorReceiptHash',
  'promptHash',
  'receiptHash',
  'residentId',
  'responseHash',
  'runId',
  'schema',
  'turnOpportunityId',
  'vocabularyHash',
]);
const ACTION_DECISION_RECEIPT_KEYS = Object.freeze([
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
const SAFETY_CHECKS_PERFORMED = Object.freeze([
  'barrier-closed-before-adjudication',
  'turn-opportunity-binding-prior-receipt-hash',
  'model-turn-receipt-closed-key-verification',
  'zero-retry-ceiling',
  'deadline-respected',
  'snapshot-hash-pinned',
  'vocabulary-hash-pinned',
]);

export class ModelVillageTurnSchedulerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageTurnSchedulerError';
  }
}

function fail(message) {
  throw new ModelVillageTurnSchedulerError(message);
}

function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
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

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`${label} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be lowercase sha256 hex`);
  }
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    fail(`${label} must be an ISO timestamp string`);
  }
}

// ---------------------------------------------------------------------------
// Turn policy manifest loading (mirrors the MV-B1 loader: HoloScript core
// parser, source/AST identity check, closed keys, canonicalDigest hashes).
// ---------------------------------------------------------------------------

function resolveHoloScriptCorePath(hololandRoot) {
  const candidate = process.env.HOLOSCRIPT_ROOT
    ? path.resolve(process.env.HOLOSCRIPT_ROOT)
    : path.resolve(hololandRoot, '..', 'HoloScript');
  const corePath = path.join(candidate, 'packages', 'core', 'dist', 'index.js');
  if (!existsSync(corePath)) {
    fail(
      `HoloScript core build is unavailable at ${candidate}; `
      + 'set HOLOSCRIPT_ROOT to the built HoloScript repository',
    );
  }
  return corePath;
}

function scanManifestObjectBlocks(source) {
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
    if (depth !== 0) fail(`Turn policy manifest object ${match[1]} is unclosed`);
    blocks.push({
      name: match[1],
      body: source.slice(pattern.lastIndex, cursor - 1),
    });
    pattern.lastIndex = cursor;
  }
  return blocks;
}

function assertNoDuplicateManifestProperties(source) {
  const blocks = scanManifestObjectBlocks(source);
  for (const block of blocks) {
    const seen = new Set();
    for (const line of block.body.split('\n')) {
      const lineMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (!lineMatch) continue;
      if (seen.has(lineMatch[1])) {
        fail(
          `Turn policy manifest object ${block.name} duplicates property `
          + lineMatch[1],
        );
      }
      seen.add(lineMatch[1]);
    }
  }
  return blocks.map((block) => block.name);
}

function manifestNodeMap(parseResult, source) {
  if (
    !parseResult?.success
    || !Array.isArray(parseResult.ast)
    || (parseResult.errors?.length ?? 0) > 0
  ) {
    fail(
      'Turn policy manifest failed HoloScript parsing: '
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
    fail('Turn policy manifest source/AST object identities differ');
  }
  return new Map(parseResult.ast.map((node) => [node.name, node.properties]));
}

function validateVocabularyShape(vocabulary, label = 'vocabulary') {
  assertExactKeys(vocabulary, VOCABULARY_KEYS, label);
  if (vocabulary.defaultDecision !== 'deny') {
    fail(`${label}.defaultDecision must be deny`);
  }
  for (const key of [
    'allowedActions',
    'deniedActions',
    'allowedTargets',
    'actionsRequiringTargetAndAmount',
    'actionsRequiringNullTargetAndAmount',
  ]) {
    if (!Array.isArray(vocabulary[key]) || vocabulary[key].length === 0) {
      fail(`${label}.${key} must be a non-empty array`);
    }
  }
  assertPositiveInteger(vocabulary.amountMin, `${label}.amountMin`);
  assertPositiveInteger(vocabulary.amountMax, `${label}.amountMax`);
}

/**
 * Load and closed-key validate the frozen MV-B2 turn policy manifest
 * (source/proofs/model-village-turn-policy.hs) AND the referenced MV-B1
 * proposal vocabulary (via vocabularyRef, loaded through the MV-B1 loader so
 * the vocabulary and prompt template arrive fully validated instead of being
 * re-authored here). The returned frozen bundle pins:
 * - vocabularyHash: canonicalDigest of the MV-B1 vocabulary object;
 * - manifestHash: canonicalDigest of the complete bundle content;
 * - policyHash: the receipt-pinned hash of the frozen concurrency+timeout
 *   policy. It EQUALS manifestHash by construction because the frozen policy
 *   the production plan requires is the whole bundle (policy scalars +
 *   snapshot fixture + pre-authorized catalog + prompt template + vocabulary
 *   pin), not the policy scalars alone.
 */
export async function loadTurnPolicyManifest({
  hololandRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const corePath = resolveHoloScriptCorePath(hololandRoot);
  const core = await import(pathToFileURL(corePath).href);
  if (typeof core.HoloScriptCodeParser !== 'function') {
    fail('HoloScript core is missing HoloScriptCodeParser');
  }
  const source = normalizeSource(
    readFileSync(path.resolve(hololandRoot, TURN_POLICY_SOURCE_PATH), 'utf8'),
  );
  const parser = new core.HoloScriptCodeParser();
  const nodes = manifestNodeMap(parser.parse(source), source);
  if (
    canonicalJson([...nodes.keys()])
    !== canonicalJson([...EXPECTED_POLICY_OBJECT_NAMES])
  ) {
    fail('Turn policy manifest object set/order is not canonical');
  }

  const policy = structuredClone(nodes.get(EXPECTED_POLICY_OBJECT_NAMES[0]));
  assertExactKeys(policy, POLICY_KEYS, 'turn policy');
  if (
    policy.type !== 'turn_policy'
    || policy.schemaId !== TURN_POLICY_SCHEMA
    || policy.policyId !== 'mv-b2-turn-policy-v1'
    || policy.residentsPerTurn !== 6
    || policy.turnsPerRun !== 1
    || policy.concurrencyLimit !== 2
    || policy.turnTimeoutMs !== 90000
    || policy.retryCount !== 0
    || policy.barrierRule !== 'all-turns-resolved-before-any-adjudication'
    || policy.adjudicationDefault !== 'deny'
    || policy.vocabularyRef
      !== 'model-village-adapter-custody-drill.hs#ModelVillageProposalVocabulary'
  ) {
    fail('Turn policy identity/frozen values are invalid');
  }
  assertNonEmptyString(policy.laneStatement, 'turn policy laneStatement');
  if (
    !policy.laneStatement.includes('engineering tracer')
    || !policy.laneStatement.includes('openly declared')
    || !policy.laneStatement.includes('alias assignment')
  ) {
    fail(
      'Turn policy laneStatement must state the engineering tracer lane and '
      + 'the openly-declared (non-sealed-alias) route mapping',
    );
  }

  const snapshotFixture = structuredClone(
    nodes.get(EXPECTED_POLICY_OBJECT_NAMES[1]),
  );
  assertExactKeys(snapshotFixture, SNAPSHOT_FIXTURE_KEYS, 'snapshot fixture');
  if (
    snapshotFixture.type !== 'turn_snapshot_fixture'
    || snapshotFixture.fixtureId !== 'mv-b2-turn-snapshot-fixture-v1'
    || snapshotFixture.location !== 'commons'
  ) {
    fail('Snapshot fixture identity is invalid');
  }
  let fixturePublicState;
  try {
    fixturePublicState = JSON.parse(snapshotFixture.publicState);
  } catch {
    fail('Snapshot fixture publicState is not valid JSON');
  }
  if (
    !fixturePublicState
    || typeof fixturePublicState !== 'object'
    || Array.isArray(fixturePublicState)
  ) {
    fail('Snapshot fixture publicState must encode a JSON object');
  }

  const preauthorizedCatalog = structuredClone(
    nodes.get(EXPECTED_POLICY_OBJECT_NAMES[2]),
  );
  assertExactKeys(preauthorizedCatalog, CATALOG_KEYS, 'pre-authorized catalog');
  if (
    preauthorizedCatalog.type !== 'preauthorized_action_catalog'
    || preauthorizedCatalog.catalogId !== 'mv-b2-preauthorized-action-catalog-v1'
    || preauthorizedCatalog.action !== 'contribute_water'
    || preauthorizedCatalog.target !== 'commons_cistern'
    || preauthorizedCatalog.amount !== 1
    || preauthorizedCatalog.sourceLane !== 'phase0b-v4-deterministic'
  ) {
    fail('Pre-authorized action catalog identity is invalid');
  }
  assertNonEmptyString(
    preauthorizedCatalog.catalogStatement,
    'catalogStatement',
  );
  if (
    !preauthorizedCatalog.catalogStatement.includes('gates the')
    || !preauthorizedCatalog.catalogStatement.includes('never mutates')
  ) {
    fail(
      'catalogStatement must state the admission-gating rule (admitted '
      + 'catalog matches gate the deterministic lane; everything else never '
      + 'mutates)',
    );
  }

  // Reuse the MV-B1 vocabulary + prompt template BY REFERENCE through the
  // MV-B1 loader (full closed-key validation), never by duplication.
  const drillBundle = await loadAdapterCustodyDrillManifest({ hololandRoot });
  const vocabulary = structuredClone(drillBundle.vocabulary);
  validateVocabularyShape(vocabulary, 'referenced vocabulary');
  const promptTemplate = drillBundle.prompt.promptTemplate;
  assertNonEmptyString(promptTemplate, 'referenced promptTemplate');

  // Freeze-coherence cross checks: the catalog action must be expressible in
  // the referenced vocabulary, and the prompt template must embed the exact
  // frozen snapshot fixture text (all residents receive the same frozen
  // public snapshot through this template).
  if (
    !vocabulary.allowedActions.includes(preauthorizedCatalog.action)
    || !vocabulary.allowedTargets.includes(preauthorizedCatalog.target)
    || preauthorizedCatalog.amount < vocabulary.amountMin
    || preauthorizedCatalog.amount > vocabulary.amountMax
  ) {
    fail('Pre-authorized catalog is outside the referenced vocabulary');
  }
  if (!promptTemplate.includes(snapshotFixture.publicState)) {
    fail(
      'Referenced prompt template does not embed the frozen snapshot fixture '
      + 'publicState',
    );
  }

  const vocabularyHash = canonicalDigest(vocabulary);
  const content = {
    policy,
    preauthorizedCatalog,
    promptTemplate,
    snapshotFixture,
    vocabulary,
    vocabularyHash,
  };
  const manifestHash = canonicalDigest(content);
  return deepFreeze({
    ...content,
    manifestHash,
    policyHash: manifestHash,
  });
}

// ---------------------------------------------------------------------------
// Policy bundle / scheduler input validation.
// ---------------------------------------------------------------------------

function validatePolicyBundle(policyBundle) {
  assertExactKeys(policyBundle, POLICY_BUNDLE_KEYS, 'policyBundle');
  assertExactKeys(policyBundle.policy, POLICY_KEYS, 'policyBundle.policy');
  const { policy } = policyBundle;
  assertPositiveInteger(policy.residentsPerTurn, 'policy.residentsPerTurn');
  assertPositiveInteger(policy.turnsPerRun, 'policy.turnsPerRun');
  assertPositiveInteger(policy.concurrencyLimit, 'policy.concurrencyLimit');
  assertPositiveInteger(policy.turnTimeoutMs, 'policy.turnTimeoutMs');
  if (policy.concurrencyLimit > policy.residentsPerTurn) {
    fail('policy.concurrencyLimit must not exceed residentsPerTurn');
  }
  // Hard laws of the lane (not tunable frozen scalars): zero retry, default
  // deny, and the barrier rule are structural — a bundle that relaxes them is
  // rejected regardless of its hashes.
  if (policy.retryCount !== 0) {
    fail('policy.retryCount must be 0 (zero-retry by construction)');
  }
  if (policy.adjudicationDefault !== 'deny') {
    fail('policy.adjudicationDefault must be deny');
  }
  if (policy.barrierRule !== 'all-turns-resolved-before-any-adjudication') {
    fail('policy.barrierRule must be all-turns-resolved-before-any-adjudication');
  }
  assertExactKeys(
    policyBundle.snapshotFixture,
    SNAPSHOT_FIXTURE_KEYS,
    'policyBundle.snapshotFixture',
  );
  assertExactKeys(
    policyBundle.preauthorizedCatalog,
    CATALOG_KEYS,
    'policyBundle.preauthorizedCatalog',
  );
  validateVocabularyShape(policyBundle.vocabulary, 'policyBundle.vocabulary');
  assertNonEmptyString(policyBundle.promptTemplate, 'policyBundle.promptTemplate');
  if (canonicalDigest(policyBundle.vocabulary) !== policyBundle.vocabularyHash) {
    fail('policyBundle.vocabularyHash does not recompute');
  }
  const { manifestHash, policyHash, ...content } = policyBundle;
  if (canonicalDigest(content) !== manifestHash || policyHash !== manifestHash) {
    fail('policyBundle manifestHash/policyHash does not recompute');
  }
}

function validateResidents(residents, residentsPerTurn) {
  if (!Array.isArray(residents) || residents.length !== residentsPerTurn) {
    fail(`residents must be an array of exactly ${residentsPerTurn} entries`);
  }
  const seen = new Set();
  for (const [index, resident] of residents.entries()) {
    assertObject(resident, `residents[${index}]`);
    assertExactKeys(
      resident,
      ['certification', 'residentId', 'route'],
      `residents[${index}]`,
    );
    assertNonEmptyString(resident.residentId, `residents[${index}].residentId`);
    if (seen.has(resident.residentId)) {
      fail(`residents[${index}].residentId duplicates ${resident.residentId}`);
    }
    seen.add(resident.residentId);
    assertObject(resident.route, `residents[${index}].route`);
    assertNonEmptyString(
      resident.route.routeId,
      `residents[${index}].route.routeId`,
    );
    // Deep route/certification validation is the turn executor's job
    // (executeCertifiedModelTurn re-verifies the certification receipt and
    // its binding to the route before any provider contact).
    assertObject(resident.certification, `residents[${index}].certification`);
  }
}

function validateCustodyStore(custodyStore) {
  if (
    !custodyStore
    || typeof custodyStore.sealObject !== 'function'
    || typeof custodyStore.readObject !== 'function'
  ) {
    fail('custodyStore must expose sealObject and readObject');
  }
}

// ---------------------------------------------------------------------------
// Scheduler.
// ---------------------------------------------------------------------------

function sealHashed(unsigned, hashKey) {
  return deepFreeze({ ...unsigned, [hashKey]: canonicalDigest(unsigned) });
}

/**
 * Create the MV-B2 live turn scheduler.
 *
 * @param {object} options
 * @param {object} options.policyBundle - frozen bundle from
 *   loadTurnPolicyManifest (or a structurally coherent test bundle; the hard
 *   laws — zero retry, default deny, barrier rule — are re-enforced here).
 * @param {Array<{residentId:string,route:object,certification:object}>}
 *   options.residents - openly-declared engineering resident-to-route
 *   mapping; length must equal policy.residentsPerTurn. NOT the sealed
 *   adapter alias assignment.
 * @param {object} options.custodyStore - sealed custody store handle
 *   (duck-typed; passed through to the turn executor which seals request and
 *   response bytes).
 * @param {string} options.operator - named operator for custody accounting.
 * @param {Function} [options.turnExecutor] - defaults to
 *   executeCertifiedModelTurn; injectable for offline tests. Invoked EXACTLY
 *   once per resident per round (zero retry), with priorReceiptHash =
 *   canonicalDigest(turnOpportunity) so the model-turn receipt is bound to
 *   its opportunity.
 * @param {Function} [options.nowFn] - millisecond clock, defaults to
 *   Date.now; injectable for deterministic deadline tests.
 * @param {Function} [options.nonceFn] - nonce source, defaults to 16 random
 *   bytes hex; injectable ONLY as a test seam to exercise the replay
 *   registry (a duplicate nonce freezes the round).
 */
export function createTurnScheduler({
  policyBundle,
  residents,
  custodyStore,
  operator,
  turnExecutor = executeCertifiedModelTurn,
  nowFn = Date.now,
  nonceFn = () => randomBytes(16).toString('hex'),
}) {
  validatePolicyBundle(policyBundle);
  validateResidents(residents, policyBundle.policy.residentsPerTurn);
  validateCustodyStore(custodyStore);
  assertNonEmptyString(operator, 'operator');
  if (typeof turnExecutor !== 'function') fail('turnExecutor must be a function');
  if (typeof nowFn !== 'function') fail('nowFn must be a function');
  if (typeof nonceFn !== 'function') fail('nonceFn must be a function');

  const frozenResidents = deepFreeze(structuredClone(residents));
  let liveRound = null;

  // Route-ceiling coherence: an executor's own transport ceiling must fit
  // inside the frozen turn window, or the dispatch-relative deadline could
  // never be met by a legal call. Checked once at construction.
  for (const resident of frozenResidents) {
    const routeTimeoutMs = resident?.route?.ceilings?.timeoutMs;
    if (
      typeof routeTimeoutMs === 'number'
      && routeTimeoutMs > policyBundle.policy.turnTimeoutMs
    ) {
      fail(
        `resident ${resident.residentId} route ceiling timeoutMs `
        + `${routeTimeoutMs} exceeds the frozen turnTimeoutMs `
        + `${policyBundle.policy.turnTimeoutMs}`,
      );
    }
  }

  // Replay registries live on the SCHEDULER, not the round: nonces and
  // opportunity ids can never repeat across sequential rounds, and a runId
  // is single-use per scheduler (a re-run would re-issue byte-identical
  // opportunity ids, making archived receipts ambiguous).
  const executedRunIds = new Set();
  const nonceRegistry = new Set();
  const opportunityRegistry = new Set();

  /**
   * Read-only observability probe for the round currently executing.
   * Exists so tests (and tracer monitors) can PROVE the proposal barrier:
   * while any turn executor is in flight, actionDecisionReceiptCount and
   * safetyCheckReceiptCount are 0 and barrierClosed is false — adjudication
   * is unreachable until every turn has resolved.
   */
  function inspectLiveRound() {
    if (!liveRound) return null;
    return Object.freeze({
      actionDecisionReceiptCount: liveRound.actionDecisionReceipts.length,
      barrierClosed: liveRound.barrierClosed,
      frozen: liveRound.frozen,
      issuedOpportunityCount: liveRound.turnOpportunities.length,
      resolvedTurnCount: liveRound.turnReceipts.filter(Boolean).length,
      safetyCheckReceiptCount: liveRound.safetyCheckReceipts.length,
    });
  }

  /**
   * Execute one complete turn round: snapshot freeze -> opportunity issuance
   * -> bounded-concurrency zero-retry turn execution -> proposal barrier ->
   * (barrier only) safety checks -> action decisions.
   *
   * ADJUDICATION EMITS RECEIPTS ONLY. An 'admit' decision with
   * preauthorizedMatch:true is the GATE the integrator consumes to run the
   * frozen phase0b V4 deterministic lane; the world mutation, when it
   * happens at all, is committed from that lane's VERIFIED receipt through
   * the existing atomic admission path (model-village-phase0b-runtime.mjs,
   * driven via runPhase0BEngineeringTracer — its commit functions are
   * module-private). Live proposals gate; deterministic receipts mutate.
   */
  async function executeTurnRound({
    runId,
    publicSnapshot,
    priorReceiptHash = GENESIS_RECEIPT_HASH,
  }) {
    if (liveRound) {
      fail('a turn round is already executing on this scheduler');
    }
    assertNonEmptyString(runId, 'runId');
    if (!RUN_ID_PATTERN.test(runId)) {
      fail(
        `runId must match ${RUN_ID_PATTERN} (engineering lane naming law, `
        + 'shared with the admission bridge so a runId accepted here can '
        + 'never be rejected downstream after live turns are spent)',
      );
    }
    if (executedRunIds.has(runId)) {
      fail(
        `runId ${runId} was already executed on this scheduler; runIds are `
        + 'single-use so turn opportunity identities never repeat',
      );
    }
    executedRunIds.add(runId);
    assertObject(publicSnapshot, 'publicSnapshot');
    assertSha256(priorReceiptHash, 'priorReceiptHash');

    const { policy, policyHash, vocabularyHash } = policyBundle;
    const round = {
      actionDecisionReceipts: [],
      barrierClosed: false,
      contaminationRegister: [],
      frozen: false,
      safetyCheckReceipts: [],
      turnOpportunities: [],
      turnReceipts: new Array(frozenResidents.length).fill(null),
    };
    liveRound = round;
    try {
      const isoNow = () => new Date(nowFn()).toISOString();
      const contaminate = (kind, detail) => {
        const entry = Object.freeze({ at: isoNow(), detail, kind });
        round.contaminationRegister.push(entry);
        if (FREEZING_CONTAMINATION_KINDS.includes(kind)) round.frozen = true;
        return entry;
      };

      // (a) SNAPSHOT FREEZE — one canonical hash for the whole round.
      // The hash is computed ONCE here; every opportunity, turn record, and
      // receipt pins it, and it is recomputed against the caller's snapshot
      // object before every dispatch and again before adjudication so any
      // aliasing mutation mid-round is contamination, never silent drift.
      const snapshotHash = canonicalDigest(publicSnapshot);
      let fixtureState;
      try {
        fixtureState = JSON.parse(policyBundle.snapshotFixture.publicState);
      } catch {
        fail('policyBundle.snapshotFixture.publicState is not valid JSON');
      }
      if (canonicalJson(fixtureState) !== canonicalJson(publicSnapshot)) {
        contaminate(
          'snapshot_hash_mismatch',
          'publicSnapshot does not match the frozen snapshot fixture; '
          + 'the rendered prompt would not embed the distributed snapshot',
        );
      }

      // Every resident's rendered prompt is the SAME frozen template, which
      // embeds the identical frozen snapshot (verified at manifest load and
      // by the fixture check above). The template is canonical .hs data.
      const renderedDrill = deepFreeze({
        prompt: { promptTemplate: policyBundle.promptTemplate },
        vocabulary: structuredClone(policyBundle.vocabulary),
      });

      // (b) TURN OPPORTUNITIES. Nonce and opportunity registries are
      // SCHEDULER-scoped (see createTurnScheduler), so replay is refused
      // across rounds, scheduler lifetime, and derandomized nonceFn seams —
      // not merely within one round. Opportunities deliberately carry NO
      // expiresAt: the deadline clock starts at dispatch (see dispatchOne),
      // so pool queuing is never charged against the model.
      const attemptRegistry = new Set();
      if (!round.frozen) {
        for (const resident of frozenResidents) {
          const issuedAtMs = nowFn();
          const nonce = nonceFn();
          if (typeof nonce !== 'string' || !NONCE_HEX_PATTERN.test(nonce)) {
            fail('nonceFn must return 16 bytes of lowercase hex');
          }
          const turnOpportunityId = `${runId}-t1-${resident.residentId}`;
          if (nonceRegistry.has(nonce)) {
            contaminate(
              'nonce_replay',
              `nonce for ${resident.residentId} replays an already-issued nonce`,
            );
            break;
          }
          if (opportunityRegistry.has(turnOpportunityId)) {
            contaminate(
              'duplicate_turn_attempt',
              `turn opportunity ${turnOpportunityId} was already issued`,
            );
            break;
          }
          nonceRegistry.add(nonce);
          opportunityRegistry.add(turnOpportunityId);
          round.turnOpportunities.push(deepFreeze({
            issuedAt: new Date(issuedAtMs).toISOString(),
            nonce,
            policyHash,
            residentId: resident.residentId,
            schema: TURN_OPPORTUNITY_SCHEMA,
            snapshotHash,
            turnOpportunityId,
          }));
        }
      }

      // (c)/(d) Bounded-concurrency, zero-retry dispatch pool. At most
      // policy.concurrencyLimit turnExecutor calls are in flight; the high
      // water mark is recorded into the barrier receipt as proof. Exactly
      // one executor invocation per resident, whatever the outcome.
      let inFlight = 0;
      let highWaterMark = 0;
      const DEADLINE_SENTINEL = Symbol('turn-deadline-exceeded');
      const dispatchOne = async (opportunity, index) => {
        const resident = frozenResidents[index];
        // The deadline clock starts HERE, at execution start — pool queuing
        // between issuance and dispatch is receipted (issuedAt vs
        // dispatchedAt) but never charged against the model's frozen
        // ceiling. The ceiling is also ENFORCED with a real timer race so a
        // never-settling executor is receipted timeout_contaminated instead
        // of wedging the barrier and poisoning the scheduler.
        const dispatchedAtMs = nowFn();
        const deadlineAtMs = dispatchedAtMs + policy.turnTimeoutMs;
        let receipt = null;
        let errorClass = null;
        let deadlineTimer = null;
        try {
          const executorPromise = Promise.resolve(turnExecutor({
            route: resident.route,
            certification: resident.certification,
            drill: renderedDrill,
            custodyStore,
            operator,
            priorReceiptHash: canonicalDigest(opportunity),
          })).then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
          const deadlinePromise = new Promise((resolveDeadline) => {
            deadlineTimer = setTimeout(
              () => resolveDeadline(DEADLINE_SENTINEL),
              policy.turnTimeoutMs,
            );
          });
          const settled = await Promise.race([executorPromise, deadlinePromise]);
          if (settled === DEADLINE_SENTINEL) {
            errorClass = 'executor-deadline-exceeded';
          } else if ('error' in settled) {
            errorClass = settled.error?.name ?? 'Error';
          } else {
            receipt = settled.value ?? null;
          }
        } finally {
          if (deadlineTimer !== null) clearTimeout(deadlineTimer);
        }
        const resolvedAtMs = nowFn();
        if (receipt !== null) {
          try {
            // The record is canonically hashed below; a receipt that cannot
            // canonicalize (undefined values, functions) is recorded as a
            // failed turn instead of crashing the barrier.
            canonicalJson(receipt);
          } catch {
            receipt = null;
            errorClass = 'executor-uncanonical-receipt';
          }
        }
        let outcome;
        if (errorClass === 'executor-deadline-exceeded' || resolvedAtMs > deadlineAtMs) {
          // A turn exceeding its DISPATCH-relative deadline is
          // timeout-contaminated. Its response, if any, was already sealed
          // to custody by the executor but is NEVER adjudicated.
          outcome = 'timeout_contaminated';
          receipt = null;
          contaminate(
            'timeout',
            `${resident.residentId} exceeded its dispatch-relative turn deadline`,
          );
        } else if (receipt !== null && receipt.turnCompleted === true) {
          outcome = 'completed';
        } else {
          outcome = 'failed';
          contaminate(
            'transport_error',
            `${resident.residentId} turn failed `
            + `(${errorClass ?? receipt?.errorClass ?? 'receipted-failure'})`,
          );
        }
        round.turnReceipts[index] = sealHashed({
          dispatchedAt: new Date(dispatchedAtMs).toISOString(),
          errorClass,
          expiresAt: new Date(deadlineAtMs).toISOString(),
          modelTurnReceipt: receipt,
          nonce: opportunity.nonce,
          outcome,
          policyHash,
          residentId: resident.residentId,
          resolvedAt: new Date(resolvedAtMs).toISOString(),
          runId,
          schema: TURN_RECORD_SCHEMA,
          snapshotHash,
          turnOpportunityId: opportunity.turnOpportunityId,
        }, 'recordHash');
      };

      await new Promise((resolve, reject) => {
        let nextIndex = 0;
        const total = round.turnOpportunities.length;
        const launch = () => {
          while (
            !round.frozen
            && inFlight < policy.concurrencyLimit
            && nextIndex < total
          ) {
            const index = nextIndex;
            nextIndex += 1;
            const opportunity = round.turnOpportunities[index];
            // Snapshot recompute before EVERY dispatch: aliasing mutation of
            // the caller's snapshot object between dispatches is freezing
            // contamination — the residents would no longer receive the
            // identical frozen snapshot.
            if (canonicalDigest(publicSnapshot) !== snapshotHash) {
              contaminate(
                'snapshot_hash_mismatch',
                `public snapshot drifted before dispatching ${opportunity.turnOpportunityId}`,
              );
              break;
            }
            if (attemptRegistry.has(opportunity.turnOpportunityId)) {
              contaminate(
                'duplicate_turn_attempt',
                `second dispatch attempt for ${opportunity.turnOpportunityId}`,
              );
              break;
            }
            attemptRegistry.add(opportunity.turnOpportunityId);
            inFlight += 1;
            highWaterMark = Math.max(highWaterMark, inFlight);
            dispatchOne(opportunity, index)
              .catch(reject)
              .finally(() => {
                inFlight -= 1;
                if (inFlight === 0 && (nextIndex >= total || round.frozen)) {
                  resolve();
                } else {
                  launch();
                }
              });
          }
          if (inFlight === 0) resolve();
        };
        launch();
      });

      // (e) PROPOSAL BARRIER — closes only after every dispatched turn has
      // resolved; adjudication below is unreachable until this receipt is
      // sealed. Post-barrier snapshot recompute: late drift still freezes
      // adjudication.
      if (
        !round.frozen
        && canonicalDigest(publicSnapshot) !== snapshotHash
      ) {
        contaminate(
          'snapshot_hash_mismatch',
          'public snapshot drifted between barrier close and adjudication',
        );
      }
      const resolvedRecords = round.turnReceipts.filter(Boolean);
      const resolvedCounts = {
        completed: resolvedRecords
          .filter((record) => record.outcome === 'completed').length,
        failed: resolvedRecords
          .filter((record) => record.outcome === 'failed').length,
        timedOut: resolvedRecords
          .filter((record) => record.outcome === 'timeout_contaminated').length,
      };
      const barrierReceipt = sealHashed({
        closedAt: isoNow(),
        concurrencyHighWaterMark: highWaterMark,
        frozen: round.frozen,
        orderedTurnReceiptHashes: resolvedRecords
          .map((record) => record.recordHash),
        policyHash,
        priorReceiptHash,
        resolvedCounts,
        runId,
        schema: PROPOSAL_BARRIER_SCHEMA,
        snapshotHash,
      }, 'barrierHash');
      round.barrierClosed = true;

      // (f) ADJUDICATION — after the barrier only, per resident in fixed
      // resident order, hash-chained barrier -> safety -> decision ->
      // safety -> decision ... Default deny throughout. A frozen round
      // performs NO adjudication.
      if (!round.frozen) {
        let chainPrior = barrierReceipt.barrierHash;
        for (const [index, resident] of frozenResidents.entries()) {
          const record = round.turnReceipts[index];
          const opportunity = round.turnOpportunities[index];
          const receipt = record.modelTurnReceipt;
          const timedOut = record.outcome === 'timeout_contaminated';
          const receiptVerifies = receipt !== null
            && verifyModelTurnReceipt(receipt).ok;
          const opportunityBound = receiptVerifies
            && receipt.priorReceiptHash === canonicalDigest(opportunity);
          const ceilingsRespected = !timedOut
            && (receipt === null || receipt.retries === 0);
          const passed = record.outcome === 'completed'
            && receiptVerifies
            && opportunityBound
            && ceilingsRespected;
          const safetyReceipt = sealHashed({
            at: isoNow(),
            ceilingsRespected,
            checksPerformed: [...SAFETY_CHECKS_PERFORMED],
            passed,
            priorReceiptHash: chainPrior,
            // A timeout-contaminated turn's response is NEVER adjudicated:
            // its response hash is withheld from the adjudication chain.
            promptHash: receiptVerifies ? receipt.promptHash : null,
            residentId: resident.residentId,
            responseHash: passed ? receipt.responseHash : null,
            runId,
            schema: SAFETY_CHECK_RECEIPT_SCHEMA,
            turnOpportunityId: opportunity.turnOpportunityId,
            vocabularyHash,
          }, 'receiptHash');
          round.safetyCheckReceipts.push(safetyReceipt);
          chainPrior = safetyReceipt.receiptHash;

          // Decision: default deny. 'admit' ONLY for a vocabulary-valid
          // proposal on a safety-passing turn. preauthorizedMatch true ONLY
          // on exact catalog match — that admit is the GATE for the
          // deterministic V4 lane; admitted non-matches are receipted
          // admitted_no_preauthorized_action and cause NO mutation.
          let decision = 'deny';
          let reason;
          let proposalHash = null;
          let preauthorizedMatch = false;
          if (timedOut) {
            reason = 'turn-timeout-response-never-adjudicated';
          } else if (record.outcome === 'failed') {
            reason = 'turn-failed-no-adjudicable-response';
          } else if (!passed) {
            reason = 'safety-check-failed';
          } else if (
            receipt.proposalDecision !== 'valid_proposal'
            || receipt.parsedProposal === null
          ) {
            reason = typeof receipt.proposalReason === 'string'
              && receipt.proposalReason.length > 0
              ? receipt.proposalReason
              : 'no-proposal';
          } else {
            decision = 'admit';
            proposalHash = canonicalDigest(receipt.parsedProposal);
            const { preauthorizedCatalog } = policyBundle;
            preauthorizedMatch =
              receipt.parsedProposal.action === preauthorizedCatalog.action
              && receipt.parsedProposal.target === preauthorizedCatalog.target
              && receipt.parsedProposal.amount === preauthorizedCatalog.amount;
            reason = preauthorizedMatch
              ? 'admitted_preauthorized_action_match'
              : 'admitted_no_preauthorized_action';
          }
          const decisionReceipt = sealHashed({
            decidedAt: isoNow(),
            decision,
            policyHash,
            preauthorizedMatch,
            priorReceiptHash: chainPrior,
            proposalHash,
            reason,
            residentId: resident.residentId,
            runId,
            schema: ACTION_DECISION_RECEIPT_SCHEMA,
            turnOpportunityId: opportunity.turnOpportunityId,
            vocabularyHash,
          }, 'receiptHash');
          round.actionDecisionReceipts.push(decisionReceipt);
          chainPrior = decisionReceipt.receiptHash;
        }
      }

      return deepFreeze({
        actionDecisionReceipts: round.actionDecisionReceipts,
        barrierReceipt,
        contaminationRegister: round.contaminationRegister,
        safetyCheckReceipts: round.safetyCheckReceipts,
        turnOpportunities: round.turnOpportunities,
        turnReceipts: round.turnReceipts.filter(Boolean),
      });
    } finally {
      liveRound = null;
    }
  }

  return Object.freeze({ executeTurnRound, inspectLiveRound });
}

// ---------------------------------------------------------------------------
// Receipt verification (closed keys, schema pin, hash recompute) and chain
// helpers.
// ---------------------------------------------------------------------------

function verifyCore(receipt, hashKey, label, body) {
  try {
    body(receipt);
    const { [hashKey]: sealedHash, ...unsigned } = receipt;
    assertSha256(sealedHash, `${label}.${hashKey}`);
    if (canonicalDigest(unsigned) !== sealedHash) {
      fail(`${label} ${hashKey} does not recompute`);
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}

export function verifyBarrierReceipt(receipt) {
  return verifyCore(receipt, 'barrierHash', 'barrier receipt', (value) => {
    assertExactKeys(value, BARRIER_RECEIPT_KEYS, 'barrier receipt');
    if (value.schema !== PROPOSAL_BARRIER_SCHEMA) {
      fail(`barrier receipt schema is not ${PROPOSAL_BARRIER_SCHEMA}`);
    }
    assertNonEmptyString(value.runId, 'barrier receipt runId');
    assertSha256(value.snapshotHash, 'barrier receipt snapshotHash');
    assertSha256(value.policyHash, 'barrier receipt policyHash');
    assertSha256(value.priorReceiptHash, 'barrier receipt priorReceiptHash');
    assertIsoTimestamp(value.closedAt, 'barrier receipt closedAt');
    if (typeof value.frozen !== 'boolean') {
      fail('barrier receipt frozen must be boolean');
    }
    assertNonNegativeInteger(
      value.concurrencyHighWaterMark,
      'barrier receipt concurrencyHighWaterMark',
    );
    if (!Array.isArray(value.orderedTurnReceiptHashes)) {
      fail('barrier receipt orderedTurnReceiptHashes must be an array');
    }
    for (const [index, hash] of value.orderedTurnReceiptHashes.entries()) {
      assertSha256(hash, `barrier receipt orderedTurnReceiptHashes[${index}]`);
    }
    assertExactKeys(
      value.resolvedCounts,
      RESOLVED_COUNT_KEYS,
      'barrier receipt resolvedCounts',
    );
    for (const key of RESOLVED_COUNT_KEYS) {
      assertNonNegativeInteger(
        value.resolvedCounts[key],
        `barrier receipt resolvedCounts.${key}`,
      );
    }
    const totalResolved = RESOLVED_COUNT_KEYS
      .reduce((sum, key) => sum + value.resolvedCounts[key], 0);
    if (totalResolved !== value.orderedTurnReceiptHashes.length) {
      fail('barrier receipt resolvedCounts do not sum to the turn hash count');
    }
  });
}

export function verifySafetyCheckReceipt(receipt) {
  return verifyCore(receipt, 'receiptHash', 'safety check receipt', (value) => {
    assertExactKeys(value, SAFETY_CHECK_RECEIPT_KEYS, 'safety check receipt');
    if (value.schema !== SAFETY_CHECK_RECEIPT_SCHEMA) {
      fail(`safety check receipt schema is not ${SAFETY_CHECK_RECEIPT_SCHEMA}`);
    }
    assertNonEmptyString(value.runId, 'safety check receipt runId');
    assertNonEmptyString(value.residentId, 'safety check receipt residentId');
    assertNonEmptyString(
      value.turnOpportunityId,
      'safety check receipt turnOpportunityId',
    );
    if (value.promptHash !== null) {
      assertSha256(value.promptHash, 'safety check receipt promptHash');
    }
    if (value.responseHash !== null) {
      assertSha256(value.responseHash, 'safety check receipt responseHash');
    }
    assertSha256(value.vocabularyHash, 'safety check receipt vocabularyHash');
    assertSha256(value.priorReceiptHash, 'safety check receipt priorReceiptHash');
    assertIsoTimestamp(value.at, 'safety check receipt at');
    if (typeof value.ceilingsRespected !== 'boolean') {
      fail('safety check receipt ceilingsRespected must be boolean');
    }
    if (typeof value.passed !== 'boolean') {
      fail('safety check receipt passed must be boolean');
    }
    if (
      !Array.isArray(value.checksPerformed)
      || value.checksPerformed.length === 0
      || value.checksPerformed.some(
        (check) => typeof check !== 'string' || check.length === 0,
      )
    ) {
      fail('safety check receipt checksPerformed must be non-empty strings');
    }
    if (value.passed === true && value.responseHash === null) {
      fail('passing safety check receipt must pin a responseHash');
    }
  });
}

export function verifyActionDecisionReceipt(receipt) {
  return verifyCore(receipt, 'receiptHash', 'action decision receipt', (value) => {
    assertExactKeys(
      value,
      ACTION_DECISION_RECEIPT_KEYS,
      'action decision receipt',
    );
    if (value.schema !== ACTION_DECISION_RECEIPT_SCHEMA) {
      fail(
        `action decision receipt schema is not ${ACTION_DECISION_RECEIPT_SCHEMA}`,
      );
    }
    assertNonEmptyString(value.runId, 'action decision receipt runId');
    assertNonEmptyString(value.residentId, 'action decision receipt residentId');
    assertNonEmptyString(
      value.turnOpportunityId,
      'action decision receipt turnOpportunityId',
    );
    assertSha256(value.policyHash, 'action decision receipt policyHash');
    assertSha256(value.vocabularyHash, 'action decision receipt vocabularyHash');
    assertSha256(
      value.priorReceiptHash,
      'action decision receipt priorReceiptHash',
    );
    assertIsoTimestamp(value.decidedAt, 'action decision receipt decidedAt');
    assertNonEmptyString(value.reason, 'action decision receipt reason');
    if (value.decision !== 'admit' && value.decision !== 'deny') {
      fail('action decision receipt decision must be admit or deny');
    }
    if (typeof value.preauthorizedMatch !== 'boolean') {
      fail('action decision receipt preauthorizedMatch must be boolean');
    }
    if (value.decision === 'admit') {
      assertSha256(value.proposalHash, 'admitted decision proposalHash');
    } else {
      if (value.proposalHash !== null) {
        fail('denied decision must carry a null proposalHash');
      }
      if (value.preauthorizedMatch !== false) {
        fail('denied decision preauthorizedMatch must be false');
      }
    }
  });
}

/**
 * Chain helper: verify a complete round adjudication chain
 * priorReceiptHash -> barrier -> safety(r1) -> decision(r1) -> safety(r2)
 * -> decision(r2) -> ... in fixed resident order. A frozen barrier requires
 * EMPTY safety/decision lists (no adjudication ever follows a frozen round).
 */
export function verifyRoundReceiptChain({
  barrierReceipt,
  safetyCheckReceipts,
  actionDecisionReceipts,
}) {
  try {
    const barrierCheck = verifyBarrierReceipt(barrierReceipt);
    if (!barrierCheck.ok) fail(`barrier: ${barrierCheck.failureReason}`);
    if (
      !Array.isArray(safetyCheckReceipts)
      || !Array.isArray(actionDecisionReceipts)
      || safetyCheckReceipts.length !== actionDecisionReceipts.length
    ) {
      fail('safety/decision receipt lists must be arrays of equal length');
    }
    if (barrierReceipt.frozen === true && safetyCheckReceipts.length !== 0) {
      fail('a frozen barrier must not be followed by adjudication receipts');
    }
    // The completeness law that makes the chain append-only in BOTH
    // directions: a non-frozen round adjudicates every resolved turn, so a
    // barrier attesting N orderedTurnReceiptHashes must be followed by
    // exactly N safety/decision pairs. Without this, any SUFFIX of the
    // adjudication chain (including all of it) could be silently erased and
    // the remaining chain would still verify.
    if (
      barrierReceipt.frozen === false
      && safetyCheckReceipts.length
        !== barrierReceipt.orderedTurnReceiptHashes.length
    ) {
      fail(
        'a non-frozen barrier must be followed by exactly one safety/decision '
        + `pair per resolved turn (${barrierReceipt.orderedTurnReceiptHashes.length} `
        + `resolved, ${safetyCheckReceipts.length} adjudicated)`,
      );
    }
    let chainPrior = barrierReceipt.barrierHash;
    for (const [index, safetyReceipt] of safetyCheckReceipts.entries()) {
      const safetyCheck = verifySafetyCheckReceipt(safetyReceipt);
      if (!safetyCheck.ok) {
        fail(`safety[${index}]: ${safetyCheck.failureReason}`);
      }
      if (safetyReceipt.priorReceiptHash !== chainPrior) {
        fail(`safety[${index}] breaks the receipt chain`);
      }
      chainPrior = safetyReceipt.receiptHash;
      const decisionReceipt = actionDecisionReceipts[index];
      const decisionCheck = verifyActionDecisionReceipt(decisionReceipt);
      if (!decisionCheck.ok) {
        fail(`decision[${index}]: ${decisionCheck.failureReason}`);
      }
      if (decisionReceipt.priorReceiptHash !== chainPrior) {
        fail(`decision[${index}] breaks the receipt chain`);
      }
      if (
        decisionReceipt.residentId !== safetyReceipt.residentId
        || decisionReceipt.turnOpportunityId !== safetyReceipt.turnOpportunityId
        || decisionReceipt.runId !== safetyReceipt.runId
        || decisionReceipt.runId !== barrierReceipt.runId
      ) {
        fail(`decision[${index}] does not pair with its safety receipt`);
      }
      chainPrior = decisionReceipt.receiptHash;
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}
