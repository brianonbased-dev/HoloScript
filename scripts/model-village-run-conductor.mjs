/* global Buffer, process, structuredClone */

// Model Village RUN CONDUCTOR — the T-7 twelve-run dress rehearsal.
//
// docs/specs/HOLOLAND_MODEL_VILLAGE_PRODUCTION_PLAN.md line 726 requires, at
// T-7: "Complete a full twelve-run dress rehearsal using captured responses and
// zero provider calls." This module executes the run-day lifecycle (plan lines
// 764-782) twelve times — three seed blocks of four conditions in the frozen
// order (plan lines 735-739) — against CAPTURED responses read back out of
// sealed custody, with a measured provider-call count of zero.
//
// The rehearsal needs no live models and no open-outcome receipt tier: replayed
// captures make the final state predetermined, so the run is sealable by the
// EXISTING v4 receipt family. That is precisely why it is the cheapest
// falsification available to this lane, and why it is the first thing that
// should have been built.
//
// ===========================================================================
// WHAT THIS MODULE IS FOR: composing five slices that were islands
// ===========================================================================
// MV-B1 model-turn receipt shape + proposal vocabulary  (adapter runtime)
// MV-B2 turn scheduler + per-run isolation              (scheduler + bridge)
// MV-B3 sealed alias-assignment vault                   (alias vault)
// MV-B4 validator custody + trust registry publication  (custody + registry)
// MV-B5 conductor (this file)                           the run that executes
//
// Before this file, model-village-alias-vault.mjs and
// model-village-trust-registry.mjs had ZERO production consumers — only their
// own checkers and tests imported them. This module is their first consumer,
// and it consumes them on the executing path, not in an assertion.
//
// ===========================================================================
// THE THREE-LAYER EXECUTOR CONTRACT (the structural conflict, resolved)
// ===========================================================================
// MV-B2's createTurnScheduler and MV-B3's captureResponseUnderCustody BOTH
// claim the `turnExecutor` slot on MV-B1's executeCertifiedModelTurn. They
// cannot both hold it: the scheduler injects an executor per resident per
// round, while the capture lane wraps an executor to seal what it returns.
// Resolved here explicitly, with the conductor owning the slot:
//
//   Layer 1 — SHAPE is MV-B1's.   The replay executor returns a receipt that
//             satisfies verifyModelTurnReceipt unchanged: same 22 closed keys,
//             same schema, same engine pin, same zero-retry rule, same bounded
//             parsedProposal projection produced by MV-B1's exported
//             parseProposal over MV-B1's `.hs` vocabulary. Nothing about the
//             receipt contract is re-authored here.
//   Layer 2 — BYTES are MV-B3's.  The response bytes are read back OUT of the
//             run's sealed custody store by custodyId on every single turn
//             (custodyStore.readObject), never from an in-memory copy, and the
//             plaintext is re-hashed against the pinned responseHash before it
//             is parsed. That is a genuine custody round-trip, which is
//             exactly what MV-B3's capture lane exists to make possible.
//   Layer 3 — SLOT is MV-B2's, filled by the conductor. The scheduler keeps
//             every guarantee it enforces (frozen snapshot, bounded
//             concurrency, dispatch-relative deadline, zero retry, proposal
//             barrier before any adjudication, hash-chained adjudication); the
//             conductor merely supplies what it calls.
//
// The seam is one-directional: the conductor hands the scheduler an executor,
// and the executor reads MV-B3-sealed bytes. MV-B3's captureResponseUnderCustody
// is NOT wrapped around the scheduler's executor, because doing so would put a
// live provider call inside a rehearsal whose whole point is that there is
// none. Capture (write) and replay (read) are separate phases of the same
// custody, and this module is the read phase.
//
// ===========================================================================
// FOUR STRUCTURAL CONFLICTS FOUND BY RUNNING THE COMPOSITION, NOT BY READING IT
// ===========================================================================
// (1) MV-B2's policy is SEALED AGAINST MV-B3. source/proofs/
//     model-village-turn-policy.hs freezes "no blinded alias assignment is
//     performed, claimed, or receipted under this policy", and the scheduler's
//     loader ENFORCES that the laneStatement says so. A blinded study run can
//     therefore never be governed by mv-b2-turn-policy-v1. Resolved by a NEW
//     frozen source, source/proofs/model-village-study-policy.hs
//     (mv-study-policy-v1), whose laneStatement REQUIRES sealed alias
//     assignment. The frozen MV-B2 policy is untouched.
//
// (2) The scheduler's POLICY BUNDLE shape is closed. validatePolicyBundle
//     asserts EXACT keys on the bundle, the policy, the snapshot fixture, the
//     pre-authorized catalog, and the vocabulary. A study bundle carrying the
//     study block order and the wider action catalog is therefore inadmissible
//     as-is. Resolved by PROJECTION, not by relaxing the scheduler: the study
//     manifest carries everything, and `schedulerPolicyBundle` is the exact
//     eight-key projection the scheduler accepts, with its own recomputed
//     manifestHash/policyHash. Nothing in MV-B2 is edited or bypassed.
//
// (3) turnsPerRun 6 does NOT mean one scheduler round. executeTurnRound
//     hard-codes the opportunity id as `${runId}-t1-${residentId}` and refuses
//     to execute a runId twice on one scheduler. Six deterministic turns per
//     village-run are therefore six ROUNDS under six derived runIds on ONE
//     scheduler, so the scheduler-scoped nonce and opportunity registries span
//     the whole run and replay stays refused across turns. The rounds are
//     hash-chained end to end: round 1 chains from the SIGNED run manifest
//     hash, round n+1 chains from round n's terminal adjudication receipt.
//
// (4) MV-B4's issue() CANNOT sign a village run manifest, and that is why the
//     lane looked composed when it was not. createCustodyBackedValidator's
//     issue() self-verifies through the shipped verifyRuntimeInjectedValidator,
//     which calls assertRunManifest — and that pins
//     runId === 'mv-phase0b-tracer-001' and the frozen phase0b two-action
//     shape. B4 was signing the pre-existing tracer's manifest because that is
//     the ONLY manifest it can sign. Its verifyValidatorSignature likewise pins
//     payload.domain to the phase0b domain.
//     Resolved WITHOUT editing MV-B4 (its handle's key set is pinned by an
//     existing test, so a new method there would break it): the conductor
//     provisions the key through MV-B4's REAL custody path
//     (provisionValidatorKey seals the PKCS8 into the run's sealed store),
//     publishes it through MV-B4's REAL trust-registry lane
//     (createTrustRegistry/appendEntry), and signs the VILLAGE run manifest
//     under a DISTINCT domain — STUDY_RUN_MANIFEST_DOMAIN — so a study
//     signature can never be replayed as a phase0b run-manifest signature or
//     the reverse. Verification runs through MV-B4's own fleet primitive,
//     verifyRunManifestAgainstRegistry, with the adapter supplied HERE rather
//     than in a checker. The manifest that is signed and verified is the
//     conductor's own run manifest, which is the composition the audit found
//     missing.
//
// ===========================================================================
// CLAIM BOUNDARY — observed{} vs declared{}, and why they are separated
// ===========================================================================
// The audit that preceded this file found 570 pinned claim flags across the
// lane of which only 7 had a load-bearing test, and checkers that verified a
// receipt against the same constant they wrote it from. This module therefore
// splits its boundary in two, and only one half is allowed to matter:
//
//   observed{}  — measured during execution ONLY: counters that increment,
//                 lengths of arrays of recorded incidents, values re-derived
//                 from the per-run entries. Nothing here is an author's
//                 sentence. verifyRehearsalReceipt gates on these.
//   declared{}  — author assertions. EXPLICITLY NON-LOAD-BEARING. The verifier
//                 checks their SHAPE and checks that they do not shadow an
//                 observed key; it never treats one as evidence.
//
// verifyRehearsalReceipt compares observed{} against REHEARSAL_EXPECTATIONS,
// which is authored independently of every value the receipt is written from
// (the receipt's numbers come from live counters and from re-derivation over
// receipt.runs), and it RECOMPUTES `passed` rather than reading it. It also
// recomputes the entire aggregate from receipt.runs, so a single flipped
// number cannot survive: forging a clean rehearsal requires rewriting twelve
// run entries and seventy-two round entries consistently AND satisfying the
// expectation table AND the cross-bindings (for example
// observed.custodyResponseReadsObserved must equal the number of resolved
// turns derived from the runs).
//
// HONEST LIMIT, stated rather than buried: this receipt is tamper-EVIDENT, not
// tamper-PROOF. It carries no signature over itself, so a party who can rewrite
// the whole artifact can produce a self-consistent clean one. What the split
// buys is that no single edit, and no re-signed single edit, passes — which is
// exactly the property the previous claim boundary did not have.
//
// PROVIDER-CALL MEASUREMENT — the one number that must never be a literal.
// The conductor installs a counting FENCE over globalThis.fetch for the
// duration of the rehearsal and hands the SAME fence down to every turn
// executor as `fetchImpl`. Every call increments a real counter and records its
// target; a call to an ABSOLUTE http/https URL is additionally counted as a
// PROVIDER call and REFUSED by throwing. Both halves matter: the count is a
// measurement, and the throw means a provider call that does happen also
// corrupts the turn it happened in, so the incident shows up in the per-run
// entries as well as in the counter.
//
// THE CLASSIFICATION RULE, stated because it was written in response to a real
// observation rather than in anticipation of one. The first fenced run recorded
// exactly one call, to `/holoscript_wasm_bg.wasm` — the HoloScript core parser
// initializing its own WASM binary while loading the frozen `.hs` sources. That
// is not a provider call and cannot become one: Node's fetch rejects a relative
// URL outright, so a non-absolute target has no network to reach. The fence
// therefore counts it, PUBLISHES it in nonProviderFetchCallTargets, delegates it
// to the original fetch so the parser's behavior is not perturbed by the
// measurement, and excludes it from providerFetchCallsObserved by a stated rule
// rather than by omission. Only providerFetchCallsObserved is gated to zero.
//
// Coverage limit, stated plainly: the fence covers the global `fetch` binding
// (which is what MV-B1's executeCertifiedModelTurn resolves at call time, via
// its `fetchImpl = globalThis.fetch` default parameter) and the injected
// handle. It does NOT cover a module that captured a reference to fetch before
// installation, a raw node:http/https socket, or a child process. This module
// claims a measured zero over absolute-http fetch, and only that.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomInt,
  sign,
  verify,
} from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ADAPTER_CERTIFICATION_SCHEMA,
  ADAPTER_RUNTIME_ENGINE,
  GENESIS_RECEIPT_HASH,
  MODEL_TURN_RECEIPT_SCHEMA,
  loadAdapterCustodyDrillManifest,
  parseProposal,
  verifyAdapterCertificationReceipt,
  verifyModelTurnReceipt,
} from './model-village-adapter-runtime.mjs';
import {
  issueUnblindingReceipt,
  loadFrozenAssignmentMatrix,
  sealAliasAssignment,
  verifyAliasAssignmentCommitment,
  verifyUnblindingReceipt,
} from './model-village-alias-vault.mjs';
import { provisionIsolatedRun } from './model-village-admission-bridge.mjs';
import { captureResponseUnderCustody } from './model-village-captured-response-custody.mjs';
import { createSealedCustodyStore } from './model-village-custody-store.mjs';
import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';
import {
  FETCH_TARGET_LOG_LIMIT,
  ProviderCallAttemptedError,
  installProviderCallFence,
  isProviderFetchTarget,
} from './model-village-provider-call-fence.mjs';
import {
  RUN_ID_PATTERN,
  createTurnScheduler,
  verifyRoundReceiptChain,
} from './model-village-turn-scheduler.mjs';
import {
  createTrustRegistry,
  trustRegistryKeyFingerprint,
  verifyRunManifestAgainstRegistry,
  verifyTrustRegistry,
} from './model-village-trust-registry.mjs';
import {
  createValidatorTrustRegistry,
  provisionValidatorKey,
} from './model-village-validator-custody.mjs';

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const CONDUCTOR_ENGINE = 'hololand-model-village-run-conductor-v1';
export const STUDY_POLICY_SCHEMA = 'hololand.model-village-study-policy.v1';
export const STUDY_BLOCK_ORDER_SCHEMA =
  'hololand.model-village-study-block-order.v1';
export const RUN_MANIFEST_SCHEMA = 'hololand.model-village-run-manifest.v1';
export const REHEARSAL_RECEIPT_SCHEMA = 'hololand.model-village-rehearsal.v1';
export const REHEARSAL_RUN_ENTRY_SCHEMA =
  'hololand.model-village-rehearsal-run.v1';

export const STUDY_POLICY_SOURCE_PATH =
  'source/proofs/model-village-study-policy.hs';
export const TRIAL_KERNEL_SOURCE_PATH =
  'source/proofs/model-village-trial-kernel.hs';

/**
 * Domain separation for the study run-manifest signature.
 *
 * MV-B4's phase0b domain is 'hololand:model-village:phase0b:trusted-validator:v1'
 * and its verifyValidatorSignature REFUSES any payload carrying a different
 * domain. A study signature must therefore be unmistakable for a phase0b one in
 * BOTH directions: this domain string cannot be verified by MV-B4's phase0b
 * verifier, and a phase0b signature cannot be verified by this lane's.
 */
export const STUDY_RUN_MANIFEST_DOMAIN =
  'hololand:model-village:study:run-manifest:v1';

export const REHEARSAL_RECEIPT_OUTPUT_PATH =
  '.tmp/hololand/model-village/rehearsal-receipt.json';

/** The three frozen seed blocks (plan lines 735-739 / kernel condition order). */
export const STUDY_BLOCK_IDS = Object.freeze(['block1', 'block2', 'block3']);
export const STUDY_CONDITIONS = Object.freeze([
  'mixed',
  'adapter_a_only',
  'adapter_b_only',
  'adapter_c_only',
]);
export const STUDY_ALIASES = Object.freeze([
  'adapter_a',
  'adapter_b',
  'adapter_c',
]);

/**
 * INDEPENDENT expectation table.
 *
 * These values are authored HERE, from the study design (3 seed blocks x 4
 * conditions = 12 village-runs; 6 deterministic turns per run; 6 residents per
 * turn), and are NEVER the source of any value the receipt is written from —
 * every observed number comes from a live counter or from re-derivation over
 * receipt.runs. That separation is the whole point: a checker that verifies a
 * receipt against the same constant it wrote the receipt from proves only that
 * it can copy a number.
 */
export const REHEARSAL_EXPECTATIONS = Object.freeze({
  aliasBlocksSealed: 3,
  aliasCommitmentVerificationFailures: 0,
  aliasUnblindingsVerified: 3,
  chainVerificationFailures: 0,
  crossRunStateFindings: 0,
  distinctRunDirectoryCount: 12,
  distinctRunIdCount: 12,
  distinctValidatorIdCount: 12,
  modelTurnsResolved: 432,
  providerFetchCallsObserved: 0,
  runManifestSignatureFailures: 0,
  runManifestSignaturesVerified: 12,
  schedulerFrozenRounds: 0,
  trustRegistryEntriesAppended: 12,
  trustRegistryVerified: true,
  turnRoundsExecuted: 72,
  turnsCompleted: 432,
  turnsFailed: 0,
  turnsTimedOut: 0,
  villageRunsExecuted: 12,
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// The fence, its incident-log bound, its classification rule and its refusal
// error now live in ./model-village-provider-call-fence.mjs so that MV-B4's
// Phase 0B tracer and the canonical-lifecycle lane measure through THIS code
// rather than each growing a near-miss copy. They are re-exported below so
// every existing consumer of this module is unchanged.
export {
  ProviderCallAttemptedError,
  installProviderCallFence,
  isProviderFetchTarget,
};

/**
 * Mirrors of MV-B1 module-private constants that its verifiers pin. They are
 * restated (not imported — they are not exported) and every one of them is
 * checked immediately by verifyModelTurnReceipt /
 * verifyAdapterCertificationReceipt, so drift fails loud on the first turn
 * rather than silently.
 */
const MV_B1_FALLBACK_EVIDENCE = 'no-fallback-code-path-single-endpoint';
const MV_B1_HIDDEN_PROMPT_ENHANCEMENT = 'none-request-bytes-hashed';
const MV_B1_CACHE_STATE_EVIDENCE = Object.freeze({
  providerCacheControlProbed: false,
  state: 'unknown_contamination_receipted',
});

/**
 * MV-B3's captureResponseUnderCustody requires a `drill` object, but that
 * argument is only ever read by its DEFAULT turnExecutor
 * (executeCertifiedModelTurn) — the rehearsal always supplies
 * buildSyntheticCaptureTurnExecutor instead, which never reads it. A tiny
 * named placeholder documents that rather than passing an unrelated bundle
 * (e.g. studyBundle) in its place.
 */
const SYNTHETIC_CAPTURE_DRILL = Object.freeze({
  note: 'unused: buildSyntheticCaptureTurnExecutor never reads the drill argument',
});

const STUDY_POLICY_OBJECT_NAMES = Object.freeze([
  'ModelVillageStudyPolicy',
  'ModelVillageStudyBlockOrder',
  'ModelVillageStudySnapshotFixture',
  'ModelVillageStudyPreauthorizedActionCatalog',
]);
const STUDY_POLICY_KEYS = Object.freeze([
  'adjudicationDefault',
  'assignmentMatrixRef',
  'barrierRule',
  'conditionOrderRef',
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
const STUDY_BLOCK_ORDER_KEYS = Object.freeze([
  'block1',
  'block2',
  'block3',
  'conditionsPerBlock',
  'dayOneBlockId',
  'dayThreeBlockId',
  'dayTwoBlockId',
  'orderId',
  'orderStatement',
  'seedBlockCount',
  'type',
  'villageRunCount',
]);
const STUDY_SNAPSHOT_FIXTURE_KEYS = Object.freeze([
  'fixtureId',
  'location',
  'publicState',
  'type',
]);
const STUDY_CATALOG_KEYS = Object.freeze([
  'actions',
  'catalogId',
  'catalogStatement',
  'primaryAction',
  'primaryAmount',
  'primaryTarget',
  'sourceLane',
  'type',
]);

/** The EXACT eight-key bundle scripts/model-village-turn-scheduler.mjs takes. */
const SCHEDULER_BUNDLE_KEYS = Object.freeze([
  'manifestHash',
  'policy',
  'policyHash',
  'preauthorizedCatalog',
  'promptTemplate',
  'snapshotFixture',
  'vocabulary',
  'vocabularyHash',
]);

const REHEARSAL_RECEIPT_KEYS = Object.freeze([
  'aggregate',
  'declared',
  'engine',
  'generatedAt',
  'observed',
  'passed',
  'receiptHash',
  'runs',
  'schema',
  'studyManifestHash',
  'studyPolicyId',
]);
const REHEARSAL_RUN_KEYS = Object.freeze([
  'aliasCommitmentReceiptHash',
  'blockId',
  'chainVerified',
  'condition',
  'conditionIndex',
  'crossRunStateFindings',
  'dayIndex',
  'decisionCounts',
  'entryHash',
  'receiptChainRoot',
  'runDirectory',
  'runId',
  'runManifestHash',
  'runManifestSignatureVerified',
  'schema',
  'seatBindingHash',
  'turnOutcomeCounts',
  'turnRounds',
  'validatorId',
]);
const REHEARSAL_ROUND_KEYS = Object.freeze([
  'barrierHash',
  'chainVerified',
  'decisionCounts',
  'frozen',
  'priorReceiptHash',
  'resolvedCounts',
  'roundRunId',
  'terminalReceiptHash',
  'turnIndex',
]);
const AGGREGATE_KEYS = Object.freeze([
  'blockChainRoots',
  'chainVerificationFailures',
  'crossRunStateFindings',
  'decisionCounts',
  'distinctRunDirectoryCount',
  'distinctRunIdCount',
  'distinctValidatorIdCount',
  'modelTurnsResolved',
  'rehearsalRoot',
  'runManifestSignatureFailures',
  'runManifestSignaturesVerified',
  'schedulerFrozenRounds',
  'turnOutcomeCounts',
  'turnRoundsExecuted',
  'villageRunsExecuted',
]);
const OBSERVED_KEYS = Object.freeze([
  'aliasBlocksSealed',
  'aliasCommitmentVerificationFailures',
  'aliasUnblindingsVerified',
  'custodyResponseReadsObserved',
  'fetchCallsObserved',
  'nonProviderFetchCallTargets',
  'providerFetchCallTargets',
  'providerFetchCallsObserved',
  'rehearsalWallClockMs',
  'runDirectoryPreexistingRefusals',
  'trustRegistryEntriesAppended',
  'trustRegistryVerified',
]);
const DECISION_COUNT_KEYS = Object.freeze([
  'admitted',
  'denied',
  'noPreauthorizedMatch',
  'preauthorizedMatch',
]);
const OUTCOME_COUNT_KEYS = Object.freeze(['completed', 'failed', 'timedOut']);

// ---------------------------------------------------------------------------
// Errors + primitives
// ---------------------------------------------------------------------------

export class ModelVillageRunConductorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageRunConductorError';
  }
}

function fail(message) {
  throw new ModelVillageRunConductorError(message);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function sourceDigest(value) {
  return sha256Hex(Buffer.from(normalizeSource(value), 'utf8'));
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

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer`);
  }
}

function sealHashed(unsigned, hashKey) {
  return deepFreeze({ ...unsigned, [hashKey]: canonicalDigest(unsigned) });
}

function conditionSlug(condition) {
  return condition.replace(/_/g, '-');
}

function defaultHololandRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

// ---------------------------------------------------------------------------
// Study policy manifest loading
// ---------------------------------------------------------------------------

function resolveHoloScriptCorePath(hololandRoot) {
  const candidate = process.env.HOLOSCRIPT_ROOT
    ? path.resolve(process.env.HOLOSCRIPT_ROOT)
    : path.resolve(hololandRoot, '..', 'HoloScript');
  const corePath = path.join(candidate, 'packages', 'core', 'dist', 'index.js');
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
    if (depth !== 0) fail(`study policy object ${match[1]} is unclosed`);
    blocks.push({ body: source.slice(pattern.lastIndex, cursor - 1), name: match[1] });
    pattern.lastIndex = cursor;
  }
  return blocks;
}

function assertNoDuplicateManifestProperties(source, label) {
  const blocks = scanManifestObjectBlocks(source);
  for (const block of blocks) {
    const seen = new Set();
    for (const line of block.body.split('\n')) {
      const lineMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (!lineMatch) continue;
      if (seen.has(lineMatch[1])) {
        fail(`${label} object ${block.name} duplicates property ${lineMatch[1]}`);
      }
      seen.add(lineMatch[1]);
    }
  }
  return blocks.map((block) => block.name);
}

function manifestNodeMap(parseResult, source, label) {
  if (
    !parseResult?.success
    || !Array.isArray(parseResult.ast)
    || (parseResult.errors?.length ?? 0) > 0
  ) {
    fail(
      `${label} failed HoloScript parsing: `
      + `${canonicalJson(parseResult?.errors ?? [])}`,
    );
  }
  const sourceNames = assertNoDuplicateManifestProperties(source, label);
  const parsedNames = parseResult.ast.map((node) => node.name);
  if (
    new Set(sourceNames).size !== sourceNames.length
    || new Set(parsedNames).size !== parsedNames.length
    || canonicalJson(sourceNames) !== canonicalJson(parsedNames)
  ) {
    fail(`${label} source/AST object identities differ`);
  }
  return new Map(parseResult.ast.map((node) => [node.name, node.properties]));
}

function parseEscapedJsonArray(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail(`${label} is not valid escaped JSON`);
  }
  if (!Array.isArray(parsed)) fail(`${label} must encode a JSON array`);
  return parsed;
}

/**
 * Loads and closed-key validates the frozen study policy manifest, then binds
 * it to the two frozen sources it references BY REFERENCE:
 *
 *  - the MV-B1 proposal vocabulary + prompt template (via vocabularyRef,
 *    loaded through MV-B1's own loader so both arrive fully validated rather
 *    than re-authored here), and
 *  - the frozen trial kernel's ModelVillageConditionOrder (via
 *    conditionOrderRef). The study manifest's block orders are DERIVED
 *    evidence: they are compared element-by-element against the kernel and a
 *    disagreement REFUSES the load. A restatement that cannot drift is data;
 *    one that can is a second authority (D.134).
 *
 * Returns a frozen study bundle plus `schedulerPolicyBundle` — the exact
 * eight-key projection scripts/model-village-turn-scheduler.mjs accepts, with
 * its own recomputed manifestHash/policyHash.
 */
export async function loadStudyPolicyManifest({
  hololandRoot = defaultHololandRoot(),
} = {}) {
  const corePath = resolveHoloScriptCorePath(hololandRoot);
  let core;
  try {
    core = await import(pathToFileURL(corePath).href);
  } catch (error) {
    fail(
      `HoloScript core build is unavailable at ${corePath}; set HOLOSCRIPT_ROOT `
      + `to the built HoloScript repository (${error?.message ?? error})`,
    );
  }
  if (typeof core.HoloScriptCodeParser !== 'function') {
    fail('HoloScript core is missing HoloScriptCodeParser');
  }
  const { readFileSync } = await import('node:fs');
  const policySourceRaw = readFileSync(
    path.resolve(hololandRoot, ...STUDY_POLICY_SOURCE_PATH.split('/')),
    'utf8',
  );
  const policySource = normalizeSource(policySourceRaw);
  const parser = new core.HoloScriptCodeParser();
  const nodes = manifestNodeMap(
    parser.parse(policySource),
    policySource,
    'study policy manifest',
  );
  if (
    canonicalJson([...nodes.keys()])
    !== canonicalJson([...STUDY_POLICY_OBJECT_NAMES])
  ) {
    fail('study policy manifest object set/order is not canonical');
  }

  const policy = structuredClone(nodes.get(STUDY_POLICY_OBJECT_NAMES[0]));
  assertExactKeys(policy, STUDY_POLICY_KEYS, 'study policy');
  if (
    policy.type !== 'study_turn_policy'
    || policy.schemaId !== STUDY_POLICY_SCHEMA
    || policy.policyId !== 'mv-study-policy-v1'
    || policy.residentsPerTurn !== 6
    || policy.turnsPerRun !== 6
    || policy.concurrencyLimit !== 2
    || policy.turnTimeoutMs !== 90000
    || policy.retryCount !== 0
    || policy.barrierRule !== 'all-turns-resolved-before-any-adjudication'
    || policy.adjudicationDefault !== 'deny'
    || policy.vocabularyRef
      !== 'model-village-adapter-custody-drill.hs#ModelVillageProposalVocabulary'
    || policy.conditionOrderRef
      !== 'model-village-trial-kernel.hs#ModelVillageConditionOrder'
  ) {
    fail('study policy identity/frozen values are invalid');
  }
  assertNonEmptyString(policy.laneStatement, 'study policy laneStatement');
  // The inverse of mv-b2-turn-policy-v1, enforced rather than intended: this
  // lane REQUIRES sealed alias assignment, and must not be confusable with the
  // engineering tracer policy that forbids it.
  if (
    !/sealed alias assignment is REQUIRED/i.test(policy.laneStatement)
    || !/STUDY lane/i.test(policy.laneStatement)
    || /no blinded alias assignment is performed/i.test(policy.laneStatement)
  ) {
    fail(
      'study policy laneStatement must REQUIRE sealed alias assignment and must '
      + "not restate mv-b2-turn-policy-v1's no-blinded-assignment clause",
    );
  }

  const blockOrder = structuredClone(nodes.get(STUDY_POLICY_OBJECT_NAMES[1]));
  assertExactKeys(blockOrder, STUDY_BLOCK_ORDER_KEYS, 'study block order');
  if (
    blockOrder.type !== 'study_block_order'
    || blockOrder.orderId !== 'mv-study-block-order-v1'
    || blockOrder.seedBlockCount !== 3
    || blockOrder.conditionsPerBlock !== 4
    || blockOrder.villageRunCount !== 12
    || blockOrder.dayOneBlockId !== 'block1'
    || blockOrder.dayTwoBlockId !== 'block2'
    || blockOrder.dayThreeBlockId !== 'block3'
  ) {
    fail('study block order identity/frozen values are invalid');
  }
  const declaredOrder = Object.fromEntries(
    STUDY_BLOCK_IDS.map((blockId) => [
      blockId,
      parseEscapedJsonArray(blockOrder[blockId], `study block order ${blockId}`),
    ]),
  );
  for (const blockId of STUDY_BLOCK_IDS) {
    const conditions = declaredOrder[blockId];
    if (
      conditions.length !== 4
      || canonicalJson([...conditions].sort())
        !== canonicalJson([...STUDY_CONDITIONS].sort())
    ) {
      fail(`study block order ${blockId} is not a permutation of the four conditions`);
    }
  }

  // DERIVED, NEVER AUTHORED: cross-check against the frozen trial kernel.
  const kernelSourceRaw = readFileSync(
    path.resolve(hololandRoot, ...TRIAL_KERNEL_SOURCE_PATH.split('/')),
    'utf8',
  );
  const kernelSource = normalizeSource(kernelSourceRaw);
  const kernelNodes = manifestNodeMap(
    new core.HoloScriptCodeParser().parse(kernelSource),
    kernelSource,
    'frozen trial kernel',
  );
  const kernelOrder = kernelNodes.get('ModelVillageConditionOrder');
  if (!kernelOrder) {
    fail('frozen trial kernel does not declare ModelVillageConditionOrder');
  }
  for (const blockId of STUDY_BLOCK_IDS) {
    const kernelConditions = kernelOrder[blockId];
    if (!Array.isArray(kernelConditions)) {
      fail(`frozen trial kernel ModelVillageConditionOrder.${blockId} is not an array`);
    }
    if (canonicalJson(kernelConditions) !== canonicalJson(declaredOrder[blockId])) {
      fail(
        `study block order ${blockId} disagrees with the frozen trial kernel `
        + 'condition order; the study policy restates kernel data and may never '
        + 'drift from it',
      );
    }
  }

  const snapshotFixture = structuredClone(nodes.get(STUDY_POLICY_OBJECT_NAMES[2]));
  assertExactKeys(
    snapshotFixture,
    STUDY_SNAPSHOT_FIXTURE_KEYS,
    'study snapshot fixture',
  );
  if (
    snapshotFixture.type !== 'study_snapshot_fixture'
    || snapshotFixture.fixtureId !== 'mv-study-snapshot-fixture-v1'
    || snapshotFixture.location !== 'commons'
  ) {
    fail('study snapshot fixture identity is invalid');
  }
  let fixturePublicState;
  try {
    fixturePublicState = JSON.parse(snapshotFixture.publicState);
  } catch {
    fail('study snapshot fixture publicState is not valid JSON');
  }
  assertObject(fixturePublicState, 'study snapshot fixture publicState');

  const catalog = structuredClone(nodes.get(STUDY_POLICY_OBJECT_NAMES[3]));
  assertExactKeys(catalog, STUDY_CATALOG_KEYS, 'study action catalog');
  if (
    catalog.type !== 'study_preauthorized_action_catalog'
    || catalog.catalogId !== 'mv-study-preauthorized-action-catalog-v1'
    || catalog.primaryAction !== 'contribute_water'
    || catalog.primaryTarget !== 'commons_cistern'
    || catalog.primaryAmount !== 1
    || catalog.sourceLane !== 'phase0b-v4-deterministic'
  ) {
    fail('study action catalog identity/frozen values are invalid');
  }
  const catalogActions = parseEscapedJsonArray(
    catalog.actions,
    'study action catalog actions',
  );
  if (catalogActions.length < 2) {
    fail(
      'the study action catalog must pre-authorize more than one action; a '
      + 'one-action catalog is a permission check, not a choice set',
    );
  }
  assertNonEmptyString(catalog.catalogStatement, 'catalogStatement');
  if (
    !/open-outcome/i.test(catalog.catalogStatement)
    || !/idea-seeds\/2026-07-26-open-outcome-receipt-tier\.md/.test(
      catalog.catalogStatement,
    )
    || !/catalog width/i.test(catalog.catalogStatement)
  ) {
    fail(
      'catalogStatement must state honestly that catalog width bounds how much '
      + 'resident behavior can reach the world, and must name the open-outcome '
      + 'receipt tier as the thing a truly open outcome requires',
    );
  }

  // MV-B1 vocabulary + prompt template BY REFERENCE (never duplicated).
  const drillBundle = await loadAdapterCustodyDrillManifest({ hololandRoot });
  const vocabulary = structuredClone(drillBundle.vocabulary);
  const promptTemplate = drillBundle.prompt.promptTemplate;
  assertNonEmptyString(promptTemplate, 'referenced promptTemplate');
  if (!promptTemplate.includes(snapshotFixture.publicState)) {
    fail(
      'referenced prompt template does not embed the frozen study snapshot '
      + 'fixture publicState',
    );
  }
  for (const entry of catalogActions) {
    assertObject(entry, 'study catalog action');
    if (!vocabulary.allowedActions.includes(entry.action)) {
      fail(`study catalog action ${entry.action} is outside the referenced vocabulary`);
    }
  }
  if (
    !vocabulary.allowedActions.includes(catalog.primaryAction)
    || !vocabulary.allowedTargets.includes(catalog.primaryTarget)
    || catalog.primaryAmount < vocabulary.amountMin
    || catalog.primaryAmount > vocabulary.amountMax
  ) {
    fail('study catalog primary action is outside the referenced vocabulary');
  }

  const vocabularyHash = canonicalDigest(vocabulary);

  // The exact eight-key bundle MV-B2's scheduler accepts. The scheduler's
  // policy shape has its own closed key set, so the STUDY scalars are
  // projected into it: everything the scheduler enforces (zero retry, default
  // deny, barrier rule, concurrency <= residents) is carried across unchanged.
  const schedulerPolicy = {
    adjudicationDefault: policy.adjudicationDefault,
    barrierRule: policy.barrierRule,
    concurrencyLimit: policy.concurrencyLimit,
    laneStatement: policy.laneStatement,
    policyId: policy.policyId,
    residentsPerTurn: policy.residentsPerTurn,
    retryCount: policy.retryCount,
    schemaId: policy.schemaId,
    turnTimeoutMs: policy.turnTimeoutMs,
    turnsPerRun: policy.turnsPerRun,
    type: policy.type,
    vocabularyRef: policy.vocabularyRef,
  };
  const schedulerContent = {
    policy: schedulerPolicy,
    preauthorizedCatalog: {
      action: catalog.primaryAction,
      amount: catalog.primaryAmount,
      catalogId: catalog.catalogId,
      catalogStatement: catalog.catalogStatement,
      sourceLane: catalog.sourceLane,
      target: catalog.primaryTarget,
      type: 'preauthorized_action_catalog',
    },
    promptTemplate,
    snapshotFixture: {
      fixtureId: snapshotFixture.fixtureId,
      location: snapshotFixture.location,
      publicState: snapshotFixture.publicState,
      type: 'turn_snapshot_fixture',
    },
    vocabulary,
    vocabularyHash,
  };
  const schedulerManifestHash = canonicalDigest(schedulerContent);
  const schedulerPolicyBundle = {
    ...schedulerContent,
    manifestHash: schedulerManifestHash,
    policyHash: schedulerManifestHash,
  };
  assertExactKeys(
    schedulerPolicyBundle,
    SCHEDULER_BUNDLE_KEYS,
    'schedulerPolicyBundle',
  );

  const content = {
    blockOrder,
    catalog,
    catalogActions,
    conditionOrder: declaredOrder,
    drillManifestHash: drillBundle.manifestHash,
    policy,
    promptTemplate,
    routes: structuredClone(drillBundle.routes),
    schedulerPolicyBundle,
    snapshotFixture,
    studyPolicySourceHash: sourceDigest(policySource),
    vocabulary,
    vocabularyHash,
  };
  return deepFreeze({ ...content, studyManifestHash: canonicalDigest(content) });
}

/**
 * The twelve village-runs, in the frozen order: three seed blocks (one per
 * day) of four conditions each.
 */
export function buildVillageRunPlan(studyBundle) {
  assertObject(studyBundle, 'studyBundle');
  const runs = [];
  STUDY_BLOCK_IDS.forEach((blockId, blockIndex) => {
    const conditions = studyBundle.conditionOrder[blockId];
    conditions.forEach((condition, conditionIndex) => {
      const runId = `mv-b2-study-${blockId}-${conditionSlug(condition)}`;
      if (!RUN_ID_PATTERN.test(runId)) {
        fail(
          `derived village runId ${runId} violates the shared MV-B2 runId law; `
          + 'the isolation and scheduler primitives are namespaced to that lane',
        );
      }
      runs.push(Object.freeze({
        blockId,
        condition,
        conditionIndex,
        dayIndex: blockIndex + 1,
        runId,
      }));
    });
  });
  if (runs.length !== 12) fail('the village run plan must contain twelve runs');
  return deepFreeze(runs);
}

/**
 * The study DESIGN restated as a POSITIONAL law.
 *
 * The plan above is three consecutive day-blocks of four conditions each, in
 * STUDY_BLOCK_IDS order, and a bounded smoke is a front-slice of it. So the run
 * sitting at position `index` of any honest receipt belongs to a KNOWN block, a
 * KNOWN day, and a KNOWN within-block slot. The study policy source pins the
 * same mapping independently (seedBlockCount 3, conditionsPerBlock 4,
 * villageRunCount 12, dayOneBlockId block1 / dayTwo block2 / dayThree block3),
 * and loadStudyPolicyManifest refuses a manifest that says anything else.
 *
 * This is what makes dayIndex verifiable at all. dayIndex is not an
 * independently writable field — it is a function of position — so verification
 * RE-DERIVES it rather than type-checking it. A type check ("dayIndex must be a
 * positive integer") would still admit a receipt whose twelve runs all claim
 * day 1, which is exactly the forgery this law exists to reject.
 */
export function deriveRunPlacement(index) {
  const conditionsPerBlock = STUDY_CONDITIONS.length;
  const maxRuns = STUDY_BLOCK_IDS.length * conditionsPerBlock;
  if (!Number.isInteger(index) || index < 0 || index >= maxRuns) {
    fail(`village-run position ${canonicalJson(index)} is outside the frozen plan (0..${maxRuns - 1})`);
  }
  const blockIndex = Math.floor(index / conditionsPerBlock);
  return Object.freeze({
    blockId: STUDY_BLOCK_IDS[blockIndex],
    conditionIndex: index % conditionsPerBlock,
    dayIndex: blockIndex + 1,
  });
}

/**
 * Re-derives the whole day/block/condition sequence of a receipt's run list
 * from deriveRunPlacement and refuses any disagreement.
 *
 * Deliberately does NOT pin WHICH condition sits in a given slot: the
 * within-block condition order is counterbalanced by the policy source (block2
 * and block3 are permutations of block1), so pinning it here would be this
 * file asserting a value it does not own. What IS owned by the design, and is
 * enforced: every COMPLETE block runs each of the four study conditions exactly
 * once, a partial trailing block (bounded smoke) may not repeat one, and every
 * runId recomputes from its own (blockId, condition) pair — so a rewritten
 * block or condition cannot keep its old identity.
 *
 * EVERY IDENTITY FIELD DERIVED FROM THE SAME PAIR IS RE-DERIVED (added
 * 2026-07-28). Pinning `runId` alone left three siblings — `validatorId`,
 * `runDirectory` and each round's `roundRunId` — carrying only an
 * assertNonEmptyString, even though the conductor emits all three as pure
 * functions of the same (blockId, condition) pair. That gap was not theoretical:
 * a two-field intra-block condition PERMUTATION (swap `condition` between two
 * runs of the same block and recompute `runId` + `receiptChainRoot`) preserved
 * the per-block condition SET, so the "repeats a condition" rule never fired and
 * the "pair derives" rule was satisfied by the recomputed runId — and the whole
 * gate exited 0 while runs[0] read condition=adapter_a_only against a
 * validatorId, runDirectory and roundRunIds all still naming `mixed`. Three
 * independent contradictions sat in the artifact, uninspected. They are
 * inspected now, with data the receipt already carried.
 *
 * WHAT THIS STILL DOES NOT PROVE, measured rather than guessed (probe run
 * 2026-07-27 against the twelve-run artifact at
 * .tmp/hololand/model-village/rehearsal-receipt.json). This law pins the day
 * LABEL to a position; it does not bind an EXECUTION to a day. A forgery that
 * leaves every identity field where the plan puts it but SWAPS the executed
 * payloads between two runs — turnRounds, decisionCounts, runManifestHash,
 * seatBindingHash, aliasCommitmentReceiptHash — and then rebuilds
 * receiptChainRoot, every entryHash, the aggregate and the receiptHash still
 * verifies clean today. (The identity fields named above can no longer travel
 * with such a swap; the opaque per-run hashes still can.) The receipt cannot
 * catch it because it carries the run manifest only as an opaque hash: there is
 * no manifest body in the artifact to re-derive the runId from. Closing that
 * needs the signed run manifest to commit to its own runId and the receipt to
 * carry enough of it to check, which is a conductor emission change, not a
 * verifier change, and is deliberately NOT claimed here.
 */
export function assertRunPlanSequence(runs) {
  if (!Array.isArray(runs)) fail('runs must be an array');
  const conditionsPerBlock = STUDY_CONDITIONS.length;
  const maxRuns = STUDY_BLOCK_IDS.length * conditionsPerBlock;
  if (runs.length < 1) {
    fail('a rehearsal receipt must carry at least one village-run entry');
  }
  if (runs.length > maxRuns) {
    fail(
      `a rehearsal receipt carries ${runs.length} village-runs but the frozen `
      + `study plan has exactly ${maxRuns}`,
    );
  }
  const conditionsByBlock = new Map();
  for (const [index, run] of runs.entries()) {
    const label = `runs[${index}]`;
    const placement = deriveRunPlacement(index);
    if (run.blockId !== placement.blockId) {
      fail(
        `${label}.blockId is ${canonicalJson(run.blockId)} but position ${index} of the `
        + `frozen study plan is ${placement.blockId}; the block sequence is derived from `
        + 'the study design, never read from the receipt',
      );
    }
    if (run.dayIndex !== placement.dayIndex) {
      fail(
        `${label}.dayIndex is ${canonicalJson(run.dayIndex)} but position ${index} of the `
        + `frozen study plan is day ${placement.dayIndex}; the day sequence is RE-DERIVED `
        + 'from the study design and is never an independently writable field',
      );
    }
    if (run.conditionIndex !== placement.conditionIndex) {
      fail(
        `${label}.conditionIndex is ${canonicalJson(run.conditionIndex)} but position `
        + `${index} of the frozen study plan is slot ${placement.conditionIndex}`,
      );
    }
    if (typeof run.condition !== 'string' || !STUDY_CONDITIONS.includes(run.condition)) {
      fail(`${label}.condition is not a study condition`);
    }
    const slug = conditionSlug(run.condition);
    const expectedRunId = `mv-b2-study-${placement.blockId}-${slug}`;
    if (run.runId !== expectedRunId) {
      fail(
        `${label}.runId is ${canonicalJson(run.runId)} but its own (blockId, condition) `
        + `pair derives ${expectedRunId}; a run cannot be relabelled and keep its identity`,
      );
    }
    // The three siblings of runId, re-derived from the SAME pair. Each is
    // emitted by the conductor as a pure function of (blockId, condition) — see
    // the `mv-study-val-...` validator id, `path.join(scratch, runId)` and
    // `${runId}-r${turnIndex}` — so a relabelled run cannot keep them.
    const expectedValidatorId = `mv-study-val-${placement.blockId}-${slug}`;
    if (run.validatorId !== expectedValidatorId) {
      fail(
        `${label}.validatorId is ${canonicalJson(run.validatorId)} but its own `
        + `(blockId, condition) pair derives ${expectedValidatorId}; the validator that `
        + 'adjudicated a run cannot be swapped away from it',
      );
    }
    const runDirectoryLeaf = String(run.runDirectory ?? '')
      .split(/[\\/]/)
      .filter((segment) => segment.length > 0)
      .pop() ?? '';
    if (runDirectoryLeaf !== expectedRunId) {
      fail(
        `${label}.runDirectory ends in ${canonicalJson(runDirectoryLeaf)} but this run's `
        + `isolated shard is named ${expectedRunId}; the per-run directory is emitted as `
        + 'path.join(scratch, runId) and cannot belong to a different run',
      );
    }
    if (Array.isArray(run.turnRounds)) {
      for (const [roundIndex, round] of run.turnRounds.entries()) {
        const expectedRoundRunId = `${expectedRunId}-r${roundIndex + 1}`;
        if (round?.roundRunId !== expectedRoundRunId) {
          fail(
            `${label}.turnRounds[${roundIndex}].roundRunId is `
            + `${canonicalJson(round?.roundRunId)} but this run's round ${roundIndex + 1} `
            + `derives ${expectedRoundRunId}; the rounds a run carries cannot come from `
            + 'another run',
          );
        }
      }
    }
    if (!conditionsByBlock.has(placement.blockId)) conditionsByBlock.set(placement.blockId, []);
    conditionsByBlock.get(placement.blockId).push(run.condition);
  }
  for (const [blockId, conditions] of conditionsByBlock) {
    const distinct = new Set(conditions);
    if (distinct.size !== conditions.length) {
      fail(
        `block ${blockId} repeats a study condition (${canonicalJson(conditions)}); each `
        + 'block runs every condition exactly once',
      );
    }
    if (conditions.length === conditionsPerBlock
      && canonicalJson([...distinct].sort()) !== canonicalJson([...STUDY_CONDITIONS].sort())) {
      fail(
        `block ${blockId} does not run all four study conditions `
        + `(${canonicalJson(conditions)})`,
      );
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Provider-call fence — the ONLY honest way to publish a zero.
// Implementation lives in ./model-village-provider-call-fence.mjs (imported and
// re-exported at the top of this file); the classification rule and the
// nested-counter reasoning are documented in that module's header.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Rehearsal fixtures (T-7 has no certified adapters BY DESIGN)
// ---------------------------------------------------------------------------

/**
 * Builds an MV-B1-SHAPED certification receipt for the rehearsal.
 *
 * WHY A FIXTURE IS CORRECT HERE, not a shortcut: the production calendar puts
 * "Certify adapters" at T-3 (plan line 727), AFTER the T-7 dress rehearsal
 * (line 726). At T-7 there are no live certifications to hold, and producing
 * one requires probing a live route — which is precisely what a zero-provider-
 * call rehearsal must not do. The rehearsal therefore runs on fixture
 * certifications and SAYS SO: the emitted rehearsal receipt pins
 * declared.certificationProvenance to 'rehearsal-fixture-not-live-probe'.
 *
 * `revisionEvidence.tier` is 'server-reported' because MV-B1's verifier pins
 * that value; it is a SHAPE requirement of the receipt family, not a claim by
 * this module that a server reported anything.
 */
export function buildRehearsalCertification({ route, promptTemplate }) {
  assertObject(route, 'route');
  assertNonEmptyString(promptTemplate, 'promptTemplate');
  const unsigned = {
    at: new Date().toISOString(),
    cacheStateEvidence: { ...MV_B1_CACHE_STATE_EVIDENCE },
    ceilings: { ...route.ceilings },
    certified: true,
    endpoint: route.endpoint,
    engine: ADAPTER_RUNTIME_ENGINE,
    failureReason: null,
    fallbackDisabled: true,
    fallbackEvidence: MV_B1_FALLBACK_EVIDENCE,
    hiddenPromptEnhancement: MV_B1_HIDDEN_PROMPT_ENHANCEMENT,
    priorReceiptHash: GENESIS_RECEIPT_HASH,
    probeLatencyMs: 0,
    promptTemplateHash: sourceDigest(promptTemplate),
    revisionEvidence: {
      evidenceCustodyIds: [],
      modelIdReported: null,
      packageVersionReported: null,
      processInstanceId: null,
      tier: 'server-reported',
    },
    routeId: route.routeId,
    schema: ADAPTER_CERTIFICATION_SCHEMA,
    serializerHash: canonicalDigest({
      serializerVersion: 'mv-b1-serializer-v1',
      transport: route.transport,
    }),
    transport: route.transport,
  };
  const receipt = sealHashed(unsigned, 'receiptHash');
  const check = verifyAdapterCertificationReceipt(receipt);
  if (!check.ok) {
    fail(`rehearsal certification fixture does not verify: ${check.failureReason}`);
  }
  return receipt;
}

/**
 * Deterministic captured-response envelopes for one village-run.
 *
 * Shape mirrors the provider envelope MV-B3's capture lane reads
 * (choices[0].message.content carrying the proposal as strict JSON), so the
 * replay path exercises the same derivation the live path would.
 *
 * Residents alternate between contribute_water and abstain so BOTH catalog
 * entries are exercised every turn: the contribute proposals reach
 * preauthorizedMatch true, the abstain proposals reach the deny case
 * (admitted_no_preauthorized_action, no mutation).
 */
export function buildRunCaptures({ runId, residentIds, turnsPerRun, blockId, condition }) {
  const captures = [];
  for (let turnIndex = 1; turnIndex <= turnsPerRun; turnIndex += 1) {
    residentIds.forEach((residentId, seatIndex) => {
      const abstains = (seatIndex + turnIndex) % 3 === 0;
      const proposal = abstains
        ? {
          action: 'abstain',
          amount: null,
          reason: `holding water at turn ${turnIndex}`,
          target: null,
        }
        : {
          action: 'contribute_water',
          amount: 1,
          reason: `commons first at turn ${turnIndex}`,
          target: 'commons_cistern',
        };
      const envelope = {
        choices: [{ finish_reason: 'stop', index: 0, message: { content: JSON.stringify(proposal), role: 'assistant' } }],
        id: `rehearsal-${runId}-t${turnIndex}-${residentId}`,
        object: 'chat.completion',
      };
      captures.push(Object.freeze({
        blockId,
        bytes: Buffer.from(JSON.stringify(envelope), 'utf8'),
        condition,
        residentId,
        responseId: `${runId}-t${turnIndex}-${residentId}`,
        turnIndex,
      }));
    });
  }
  return captures;
}

// ---------------------------------------------------------------------------
// The synthetic capture turn executor (MV-B3 write phase, network-free)
// ---------------------------------------------------------------------------

/**
 * Builds the turnExecutor MV-B3's captureResponseUnderCustody calls to seal
 * ONE of buildRunCaptures's synthetic responses. This is the CAPTURE (write)
 * half of the seam the module header describes; it is a distinct function
 * from createReplayTurnExecutor (the READ half) and is never substituted for
 * it. It is handed to captureResponseUnderCustody's `turnExecutor` slot,
 * which defaults to MV-B1's real executeCertifiedModelTurn (a live fetch) —
 * supplying this instead is what keeps the rehearsal's measured
 * provider-call count at zero while still exercising captureResponseUnderCustody's
 * real blinding and no-route-leak guarantees on the run's own execution path,
 * not only in the standalone alias-custody checker.
 *
 * It NEVER calls fetchImpl (or any network primitive): the bytes to seal are
 * already decided by buildRunCaptures, so there is nothing to fetch, and
 * calling the fence at all would trip the provider-call refusal this
 * rehearsal must keep at zero.
 *
 * The returned receipt is MV-B1-shaped and self-verified through the SAME
 * shipped verifyModelTurnReceipt createReplayTurnExecutor's receipts satisfy
 * — captureResponseUnderCustody re-verifies it again on the way in, so a
 * drift here fails loud twice over.
 */
function buildSyntheticCaptureTurnExecutor({
  capture,
  promptHash,
  requestCustodyId,
  vocabulary,
}) {
  return async function syntheticCaptureTurnExecutor({
    route,
    certification,
    custodyStore,
    priorReceiptHash,
  }) {
    const startedAt = Date.now();
    const responseCustodyId = custodyStore.sealObject({
      bytes: capture.bytes,
      kind: 'model-turn-response',
      label: `${capture.responseId}:raw`,
    }).custodyId;
    const responseHash = sha256Hex(capture.bytes);

    const envelope = JSON.parse(capture.bytes.toString('utf8'));
    const content = envelope.choices[0].message.content;
    const parsed = parseProposal(content, vocabulary);
    const parsedProposal = parsed.decision === 'valid_proposal'
      ? {
        action: parsed.parsed.action,
        amount: parsed.parsed.amount,
        reasonLength: parsed.parsed.reason.length,
        reasonSha256: sha256Hex(Buffer.from(parsed.parsed.reason, 'utf8')),
        target: parsed.parsed.target,
      }
      : null;

    const receipt = sealHashed({
      at: new Date().toISOString(),
      cacheStateEvidence: { ...MV_B1_CACHE_STATE_EVIDENCE },
      custodyRefs: { requestCustodyId, responseCustodyId },
      endpoint: route.endpoint,
      engine: ADAPTER_RUNTIME_ENGINE,
      errorClass: null,
      fallbackEvidence: MV_B1_FALLBACK_EVIDENCE,
      generationParameters: {
        maxOutputTokens: route.ceilings.maxOutputTokens,
        seedAcceptedEvidence: 'unverified',
        seedRequested: route.ceilings.seedRequested,
        temperature: route.ceilings.temperature,
      },
      latencyMs: Math.max(0, Date.now() - startedAt),
      parsedProposal,
      priorReceiptHash,
      promptHash,
      proposalDecision: parsed.decision,
      proposalReason: parsed.decision === 'valid_proposal' ? null : parsed.reason,
      responseHash,
      retries: 0,
      revisionEvidence: structuredClone(certification.revisionEvidence),
      routeId: route.routeId,
      schema: MODEL_TURN_RECEIPT_SCHEMA,
      turnCompleted: true,
      usageReported: null,
    }, 'receiptHash');

    // Self-verify through MV-B1's SHIPPED verifier, the same discipline
    // createReplayTurnExecutor applies to its own receipts.
    const check = verifyModelTurnReceipt(receipt);
    if (!check.ok) {
      fail(`synthetic captured model-turn receipt does not verify: ${check.failureReason}`);
    }
    return receipt;
  };
}

// ---------------------------------------------------------------------------
// The replay turn executor (layer 1 shape + layer 2 bytes)
// ---------------------------------------------------------------------------

/**
 * Builds the executor the scheduler calls. It NEVER touches the network: the
 * `fetchImpl` handed down is the counting fence, and it is deliberately left
 * unused so that any call at all is somebody else's, and is counted.
 *
 * @param {object} options
 * @param {Map} options.captureIndex  key -> { requestCustodyId, promptHash,
 *   responseCustodyId, responseHash }
 * @param {{index:number}} options.turnCursor  bumped by the conductor between
 *   rounds; rounds are strictly sequential (the scheduler refuses a concurrent
 *   round), so a cursor is sufficient and no ambient state is shared.
 * @param {{reads:number}} options.readCounter  incremented on every custody
 *   round-trip; the rehearsal receipt cross-binds this out-of-band counter to
 *   the number of resolved turns derived from the run entries.
 */
export function createReplayTurnExecutor({
  captureIndex,
  turnCursor,
  readCounter,
  vocabulary,
}) {
  if (!(captureIndex instanceof Map)) fail('captureIndex must be a Map');
  assertObject(turnCursor, 'turnCursor');
  assertObject(readCounter, 'readCounter');
  assertObject(vocabulary, 'vocabulary');

  return async function replayTurnExecutor({
    route,
    certification,
    custodyStore,
    priorReceiptHash,
  }) {
    const startedAt = Date.now();
    const seat = route?.studySeat;
    if (!seat || typeof seat.residentId !== 'string') {
      fail('replay executor received a route without a study seat binding');
    }
    const key = `t${turnCursor.index}|${seat.residentId}`;
    const capture = captureIndex.get(key);
    if (!capture) fail(`no sealed capture for ${key}`);

    // LAYER 2: a real custody round-trip, every turn. The store re-verifies
    // plaintext-hash === custodyId on read; the pinned hash is re-checked here
    // too so a substituted object fails before it is parsed.
    const read = custodyStore.readObject(capture.responseCustodyId);
    readCounter.reads += 1;
    const bytes = read.bytes;
    const responseHash = sha256Hex(bytes);
    if (responseHash !== capture.responseHash) {
      fail('sealed captured response does not match its pinned responseHash');
    }

    let envelope;
    try {
      envelope = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('sealed captured response is not valid JSON');
    }
    const content = envelope?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      fail('sealed captured response carries no choices[0].message.content');
    }

    // LAYER 1: MV-B1's own parser over MV-B1's own `.hs` vocabulary. No
    // proposal rule is authored here.
    const parsed = parseProposal(content, vocabulary);
    const proposalDecision = parsed.decision;
    const parsedProposal = parsed.decision === 'valid_proposal'
      ? {
        action: parsed.parsed.action,
        amount: parsed.parsed.amount,
        reasonLength: parsed.parsed.reason.length,
        reasonSha256: sha256Hex(Buffer.from(parsed.parsed.reason, 'utf8')),
        target: parsed.parsed.target,
      }
      : null;

    const receipt = sealHashed({
      at: new Date().toISOString(),
      cacheStateEvidence: { ...MV_B1_CACHE_STATE_EVIDENCE },
      custodyRefs: {
        requestCustodyId: capture.requestCustodyId,
        responseCustodyId: capture.responseCustodyId,
      },
      endpoint: route.endpoint,
      engine: ADAPTER_RUNTIME_ENGINE,
      errorClass: null,
      fallbackEvidence: MV_B1_FALLBACK_EVIDENCE,
      generationParameters: {
        maxOutputTokens: route.ceilings.maxOutputTokens,
        seedAcceptedEvidence: 'unverified',
        seedRequested: route.ceilings.seedRequested,
        temperature: route.ceilings.temperature,
      },
      latencyMs: Math.max(0, Date.now() - startedAt),
      parsedProposal,
      priorReceiptHash,
      promptHash: capture.promptHash,
      proposalDecision,
      proposalReason: parsed.decision === 'valid_proposal' ? null : parsed.reason,
      responseHash,
      retries: 0,
      revisionEvidence: structuredClone(certification.revisionEvidence),
      routeId: route.routeId,
      schema: MODEL_TURN_RECEIPT_SCHEMA,
      turnCompleted: true,
      usageReported: null,
    }, 'receiptHash');

    // Self-verify through MV-B1's SHIPPED verifier: the layer-1 claim is only
    // real if the receipt this executor emits satisfies the contract unchanged.
    const check = verifyModelTurnReceipt(receipt);
    if (!check.ok) {
      fail(`replayed model-turn receipt does not verify: ${check.failureReason}`);
    }
    return receipt;
  };
}

// ---------------------------------------------------------------------------
// Fleet verification adapter (owned HERE, not in a checker)
// ---------------------------------------------------------------------------

/**
 * The injected verifier MV-B4's verifyRunManifestAgainstRegistry expects.
 *
 * Both halves of the signing payload are RECOMPUTED from public material — the
 * manifest object itself and the study config hash — never read off a pinned
 * field, so this proves "THIS manifest was signed", not "some manifest was".
 * The verdict is a strict boolean; anything else is a failure by the registry's
 * own contract.
 */
export function createStudyFleetVerifier({ studyConfigHash }) {
  assertSha256(studyConfigHash, 'studyConfigHash');
  const observations = [];
  const verifySignature = ({ keyFingerprint, manifest, publicKeyPem, signature }) => {
    try {
      if (trustRegistryKeyFingerprint(publicKeyPem) !== keyFingerprint) {
        observations.push({ failureReason: 'key-fingerprint-mismatch', ok: false });
        return false;
      }
      const payload = {
        configHash: studyConfigHash,
        domain: STUDY_RUN_MANIFEST_DOMAIN,
        manifestHash: canonicalDigest(manifest),
      };
      const ok = verify(
        null,
        Buffer.from(canonicalJson(payload), 'utf8'),
        createPublicKey(publicKeyPem),
        Buffer.from(signature, 'base64'),
      );
      observations.push({
        failureReason: ok === true ? null : 'signature-verification-failed',
        ok: ok === true,
      });
      return ok === true;
    } catch {
      observations.push({ failureReason: 'verifier-error', ok: false });
      return false;
    }
  };
  return Object.freeze({ observations, verifySignature });
}

/**
 * Signs the CONDUCTOR'S run manifest with the MV-B4 custody-held key.
 *
 * The key is read out of the sealed custody store for this one signature and
 * the plaintext buffer is zeroed on every path — the same read-per-signature
 * discipline MV-B4's own signer uses, for the same reason (the process holds
 * decrypted key material for microseconds, not for a handle lifetime).
 *
 * See structural conflict (4) in the module header for why MV-B4's issue()
 * cannot be called here and why this signature carries its own domain.
 */
function signStudyRunManifest({ custodyStore, privateKeyCustodyId, studyConfigHash, manifest }) {
  const payload = {
    configHash: studyConfigHash,
    domain: STUDY_RUN_MANIFEST_DOMAIN,
    manifestHash: canonicalDigest(manifest),
  };
  const opened = custodyStore.readObject(privateKeyCustodyId);
  try {
    const privateKey = createPrivateKey({
      format: 'der',
      key: opened.bytes,
      type: 'pkcs8',
    });
    return sign(
      null,
      Buffer.from(canonicalJson(payload), 'utf8'),
      privateKey,
    ).toString('base64');
  } finally {
    opened.bytes.fill(0);
  }
}

// ---------------------------------------------------------------------------
// Seat bindings (MV-B3 frozen matrix + condition)
// ---------------------------------------------------------------------------

/**
 * Derives the six seat -> alias bindings for one village-run.
 *
 * The seat -> ALIAS binding is PUBLIC study vocabulary (it is declared openly
 * in the frozen trial kernel). The alias -> ROUTE map is the sealed secret and
 * never appears here or in any emitted artifact.
 *
 * `mixed` takes the block's frozen latin-square row; a homogeneous condition
 * (`adapter_X_only`) assigns that single alias to all six seats, which is what
 * makes the primary contrast mixed - mean(homogeneous) well defined.
 */
export function buildSeatAliasBindings({ matrix, blockId, condition }) {
  const personaSeats = matrix.personasAndSeats;
  const row = matrix.blocks[blockId];
  return personaSeats.map((personaSeat, index) => {
    const [personaId, seatId] = String(personaSeat).split('@');
    if (!personaId || !seatId) fail('frozen persona/seat entry is not persona@seat');
    let adapterAlias;
    if (condition === 'mixed') {
      adapterAlias = row[index];
    } else {
      const alias = condition.replace(/_only$/, '');
      if (!STUDY_ALIASES.includes(alias)) {
        fail(`condition ${condition} does not name a frozen study alias`);
      }
      adapterAlias = alias;
    }
    return Object.freeze({
      adapterAlias,
      personaId,
      residentId: `resident-${String(index + 1).padStart(2, '0')}`,
      seatId,
    });
  });
}

// ---------------------------------------------------------------------------
// The rehearsal
// ---------------------------------------------------------------------------

function emptyDecisionCounts() {
  return { admitted: 0, denied: 0, noPreauthorizedMatch: 0, preauthorizedMatch: 0 };
}

function emptyOutcomeCounts() {
  return { completed: 0, failed: 0, timedOut: 0 };
}

function addCounts(target, source, keys) {
  for (const key of keys) target[key] += source[key];
  return target;
}

/**
 * Recomputes the aggregate from the per-run entries ALONE.
 *
 * This is the anti-ritual core of the claim boundary: emission and verification
 * both call this function over `runs`, so the aggregate is never an
 * independently-writable field. Forging a clean aggregate requires forging
 * every run entry it is derived from.
 */
export function deriveAggregate(runs) {
  if (!Array.isArray(runs)) fail('runs must be an array');
  const decisionCounts = emptyDecisionCounts();
  const turnOutcomeCounts = emptyOutcomeCounts();
  let turnRoundsExecuted = 0;
  let chainVerificationFailures = 0;
  let schedulerFrozenRounds = 0;
  let crossRunStateFindings = 0;
  let runManifestSignaturesVerified = 0;
  const runIds = new Set();
  const runDirectories = new Set();
  const validatorIds = new Set();
  const byBlock = new Map();

  for (const run of runs) {
    runIds.add(run.runId);
    runDirectories.add(run.runDirectory);
    validatorIds.add(run.validatorId);
    if (run.runManifestSignatureVerified === true) runManifestSignaturesVerified += 1;
    if (run.chainVerified !== true) chainVerificationFailures += 1;
    crossRunStateFindings += Array.isArray(run.crossRunStateFindings)
      ? run.crossRunStateFindings.length
      : 1;
    addCounts(decisionCounts, run.decisionCounts, DECISION_COUNT_KEYS);
    addCounts(turnOutcomeCounts, run.turnOutcomeCounts, OUTCOME_COUNT_KEYS);
    for (const round of run.turnRounds) {
      turnRoundsExecuted += 1;
      if (round.chainVerified !== true) chainVerificationFailures += 1;
      if (round.frozen === true) schedulerFrozenRounds += 1;
    }
    if (!byBlock.has(run.blockId)) byBlock.set(run.blockId, []);
    byBlock.get(run.blockId).push(run.receiptChainRoot);
  }

  const blockChainRoots = {};
  for (const blockId of STUDY_BLOCK_IDS) {
    const roots = byBlock.get(blockId) ?? [];
    blockChainRoots[blockId] = canonicalDigest({ blockId, runChainRoots: roots });
  }

  const modelTurnsResolved =
    turnOutcomeCounts.completed + turnOutcomeCounts.failed + turnOutcomeCounts.timedOut;

  const aggregate = {
    blockChainRoots,
    chainVerificationFailures,
    crossRunStateFindings,
    decisionCounts,
    distinctRunDirectoryCount: runDirectories.size,
    distinctRunIdCount: runIds.size,
    distinctValidatorIdCount: validatorIds.size,
    modelTurnsResolved,
    rehearsalRoot: canonicalDigest({
      blockChainRoots,
      schema: REHEARSAL_RECEIPT_SCHEMA,
    }),
    runManifestSignatureFailures: runs.length - runManifestSignaturesVerified,
    runManifestSignaturesVerified,
    schedulerFrozenRounds,
    turnOutcomeCounts,
    turnRoundsExecuted,
    villageRunsExecuted: runs.length,
  };
  assertExactKeys(aggregate, AGGREGATE_KEYS, 'aggregate');
  return aggregate;
}

/**
 * Evaluates observed{} + aggregate against REHEARSAL_EXPECTATIONS and the
 * cross-bindings. Returns a list of failure strings; empty means passed.
 *
 * Called by BOTH runRehearsal (to set `passed`) and verifyRehearsalReceipt (to
 * RECOMPUTE `passed` rather than read it). Sharing this function is safe and
 * deliberate: it reads only the receipt's measured values and the independent
 * expectation table, so it cannot launder a value the receipt did not measure.
 */
export function evaluateRehearsal({ aggregate, observed, expectations = REHEARSAL_EXPECTATIONS }) {
  const failures = [];
  const expect = (label, actual, wanted) => {
    if (actual !== wanted) {
      failures.push(`${label} observed ${canonicalJson(actual)} != expected ${canonicalJson(wanted)}`);
    }
  };

  expect('observed.providerFetchCallsObserved', observed.providerFetchCallsObserved, expectations.providerFetchCallsObserved);
  expect('observed.aliasBlocksSealed', observed.aliasBlocksSealed, expectations.aliasBlocksSealed);
  expect('observed.aliasUnblindingsVerified', observed.aliasUnblindingsVerified, expectations.aliasUnblindingsVerified);
  expect('observed.aliasCommitmentVerificationFailures', observed.aliasCommitmentVerificationFailures, expectations.aliasCommitmentVerificationFailures);
  expect('observed.trustRegistryEntriesAppended', observed.trustRegistryEntriesAppended, expectations.trustRegistryEntriesAppended);
  expect('observed.trustRegistryVerified', observed.trustRegistryVerified, expectations.trustRegistryVerified);

  expect('aggregate.villageRunsExecuted', aggregate.villageRunsExecuted, expectations.villageRunsExecuted);
  expect('aggregate.turnRoundsExecuted', aggregate.turnRoundsExecuted, expectations.turnRoundsExecuted);
  expect('aggregate.modelTurnsResolved', aggregate.modelTurnsResolved, expectations.modelTurnsResolved);
  expect('aggregate.turnOutcomeCounts.completed', aggregate.turnOutcomeCounts.completed, expectations.turnsCompleted);
  expect('aggregate.turnOutcomeCounts.failed', aggregate.turnOutcomeCounts.failed, expectations.turnsFailed);
  expect('aggregate.turnOutcomeCounts.timedOut', aggregate.turnOutcomeCounts.timedOut, expectations.turnsTimedOut);
  expect('aggregate.chainVerificationFailures', aggregate.chainVerificationFailures, expectations.chainVerificationFailures);
  expect('aggregate.schedulerFrozenRounds', aggregate.schedulerFrozenRounds, expectations.schedulerFrozenRounds);
  expect('aggregate.crossRunStateFindings', aggregate.crossRunStateFindings, expectations.crossRunStateFindings);
  expect('aggregate.runManifestSignaturesVerified', aggregate.runManifestSignaturesVerified, expectations.runManifestSignaturesVerified);
  expect('aggregate.runManifestSignatureFailures', aggregate.runManifestSignatureFailures, expectations.runManifestSignatureFailures);
  expect('aggregate.distinctRunDirectoryCount', aggregate.distinctRunDirectoryCount, expectations.distinctRunDirectoryCount);
  expect('aggregate.distinctRunIdCount', aggregate.distinctRunIdCount, expectations.distinctRunIdCount);
  expect('aggregate.distinctValidatorIdCount', aggregate.distinctValidatorIdCount, expectations.distinctValidatorIdCount);

  // CROSS-BINDINGS: an out-of-band counter tied to a value derived from the
  // run entries. Flipping either one alone breaks the identity.
  //
  // The FLOOR rule below is the one that matters, and it was added because a
  // test found the hole rather than because it was anticipated: the incident
  // logs are BOUNDED at FETCH_TARGET_LOG_LIMIT entries, so an exact-equality
  // check has to be skipped once a log saturates — and a saturated log was
  // therefore a place to hide a zeroed counter. A run that recorded 432
  // provider calls could be rewritten to claim 0 while still carrying 32
  // recorded provider targets, and every other rule passed. The floor closes
  // it: a counter can never be smaller than its own incident log.
  if (observed.providerFetchCallsObserved < observed.providerFetchCallTargets.length) {
    failures.push(
      'observed.providerFetchCallsObserved is smaller than its own incident '
      + 'log; a counter can never be below the number of calls it recorded',
    );
  }
  if (observed.providerFetchCallTargets.length < FETCH_TARGET_LOG_LIMIT
    && observed.providerFetchCallsObserved !== observed.providerFetchCallTargets.length) {
    failures.push(
      'observed.providerFetchCallsObserved does not equal the number of recorded '
      + 'provider-call targets; the counter and its incident log disagree',
    );
  }
  if (observed.fetchCallsObserved < observed.nonProviderFetchCallTargets.length) {
    failures.push(
      'observed.fetchCallsObserved is smaller than its own non-provider '
      + 'incident log',
    );
  }
  if (observed.providerFetchCallsObserved > observed.fetchCallsObserved) {
    failures.push(
      'observed.providerFetchCallsObserved exceeds the total fetch calls the '
      + 'fence saw; the provider count is a subset of the total by construction',
    );
  }
  if (
    observed.fetchCallsObserved
    < observed.providerFetchCallTargets.length + observed.nonProviderFetchCallTargets.length
  ) {
    failures.push(
      'observed.fetchCallsObserved is smaller than the number of recorded fetch '
      + 'targets; the total counter and its incident logs disagree',
    );
  }
  for (const target of observed.providerFetchCallTargets) {
    if (!isProviderFetchTarget(target)) {
      failures.push(
        'a recorded provider-call target is not an absolute http(s) URL; the '
        + 'provider/non-provider classification was not applied as stated',
      );
      break;
    }
  }
  for (const target of observed.nonProviderFetchCallTargets) {
    if (isProviderFetchTarget(target)) {
      failures.push(
        'an absolute http(s) target was recorded as a NON-provider call; a '
        + 'provider call cannot be reclassified out of the gated count',
      );
      break;
    }
  }
  if (observed.custodyResponseReadsObserved !== aggregate.modelTurnsResolved) {
    failures.push(
      'observed.custodyResponseReadsObserved does not equal the number of '
      + 'resolved model turns derived from the run entries; every replayed turn '
      + 'is exactly one sealed-custody read',
    );
  }
  if (
    aggregate.decisionCounts.admitted
    !== aggregate.decisionCounts.preauthorizedMatch + aggregate.decisionCounts.noPreauthorizedMatch
  ) {
    failures.push(
      'aggregate.decisionCounts.admitted does not split into preauthorized and '
      + 'non-preauthorized admissions',
    );
  }
  if (
    aggregate.decisionCounts.admitted + aggregate.decisionCounts.denied
    !== aggregate.modelTurnsResolved
  ) {
    failures.push(
      'adjudicated decisions do not account for every resolved model turn',
    );
  }
  // Both catalog entries must actually have been exercised, or the wider
  // catalog is decorative.
  if (aggregate.decisionCounts.preauthorizedMatch <= 0) {
    failures.push('no proposal ever matched the pre-authorized action');
  }
  if (aggregate.decisionCounts.noPreauthorizedMatch <= 0) {
    failures.push(
      'the deny case was never exercised; a catalog whose second entry never '
      + 'occurs is decorative width',
    );
  }
  return failures;
}

/**
 * Executes the twelve-run dress rehearsal.
 *
 * Run-day lifecycle (plan lines 764-782) per village-run, in order:
 *   (1) verify source/policy/kernel/vocabulary/assignment hashes  [study load]
 *   (4) validate and seal only the next run manifest              [sign + fleet-verify]
 *   (5) clone a clean shard and prove no cross-run state          [measured]
 *   (6) stage six unique resident and seat IDs                    [seat bindings]
 *   (7) execute with no prompt edits, fallback, or enhancement    [frozen template]
 *   (8) close the run and verify receipt completeness + chain root
 *   (9) replay captured responses                                 [layer 2]
 *  (10) tear down the shard
 *  (11) decide integrity disposition while outcomes stay blinded
 *
 * `runLimit` exists ONLY for a bounded smoke (a fast structural probe of the
 * composition) and it cannot forge a full rehearsal: the twelve-run plan is
 * still built and validated at twelve before it is sliced, and a receipt with
 * fewer than twelve runs is REFUSED by verifyRehearsalReceipt under the default
 * REHEARSAL_EXPECTATIONS — aggregate.villageRunsExecuted is derived from
 * receipt.runs.length, so a short run is self-identifying and no caller can
 * pass one off as the acceptance artifact.
 */
export async function runRehearsal({
  hololandRoot = defaultHololandRoot(),
  scratchRoot = null,
  operator = 'model-village-run-conductor',
  turnExecutorFactory = null,
  writeReceipt = true,
  runLimit = null,
  expectations = REHEARSAL_EXPECTATIONS,
  nowFn = Date.now,
} = {}) {
  if (typeof nowFn !== 'function') fail('nowFn must be a function');
  const startedAtMs = nowFn();
  const root = path.resolve(hololandRoot);
  // `ownsScratchRoot` decides who is responsible for destroying the tree. A
  // caller-supplied scratchRoot belongs to the caller (the test suite cleans up
  // its own base); a path this function invented belongs to this function.
  const ownsScratchRoot = !scratchRoot;
  // DELIBERATELY the real wall clock, not nowFn: this names a directory on a
  // real filesystem and must stay unique even when a caller injects a FROZEN
  // clock (the repeat-execution probe does exactly that, twice in a row). The
  // path reaches the receipt only through runs[].runDirectory, which is on the
  // pinned variance allowlist for precisely this reason.
  const scratch = scratchRoot
    ? path.resolve(scratchRoot)
    : path.join(root, '.tmp', 'hololand', 'model-village', `rehearsal-${Date.now().toString(36)}`);

  // ---------------------------------------------------------------------
  // INJECTED-CLOCK CONTAINMENT.
  //
  // The repeat-execution probe compares two receipts, so it can only see a
  // clock leak that reaches a COMPARED LEAF. Four of the six sites that were
  // threaded onto `nowFn` reach the receipt only through hashes that are on
  // the variance allowlist for unrelated reasons (the alias draw), and were
  // therefore invisible to it: deleting `nowFn` from the createTurnScheduler
  // options — the deepest and most load-bearing of the six — left the gate
  // exit 0 while every round receipt carried real millisecond wall-clock
  // stamps again.
  //
  // These samples close that. Every value this function derives from the clock
  // is recorded here, and at emission time, IF the injected clock is measurably
  // frozen (see `clockFrozen` below: nowFn() has not advanced across the whole
  // ~37s rehearsal, which the real clock cannot do), every sample must equal
  // it. A site that stops reading nowFn produces a different number and the
  // rehearsal REFUSES TO EMIT, which the probe reports as UNMEASURED and the
  // gate fails closed on.
  //
  // WHAT THIS IS AND IS NOT. For values this function both writes and reads
  // back (the retention stamp, the validator validity window, the manifest
  // signing time) it is a CONTAINMENT assertion over its own writes, not
  // independent evidence: its worth is that it goes red when one of them stops
  // reading the injected clock. For the scheduler round stamps it is genuine
  // cross-module evidence — the timestamp is produced inside
  // model-village-turn-scheduler.mjs and read back out of the barrier receipt.
  // It is skipped entirely on the real-clock (acceptance) path, so it cannot
  // false-red a correct production run.
  const clockSamples = [];
  const sampleClock = (label, milliseconds) => {
    clockSamples.push({ label, milliseconds });
    return milliseconds;
  };
  // COVERAGE FENCE over the samples themselves, in the same spirit as the
  // "an allowlist entry that matched nothing is RED" rule: a containment law
  // over a sample SET is only as strong as the set is complete, so a value
  // that stops registering a sample must be as loud as one that registers a
  // wrong sample. This is not a config read -- every label below is pushed at
  // runtime by the code path that actually executed, so a bypassed expression
  // simply has no label.
  //
  // MEASURED NECESSITY: without this fence, replacing
  // `rehearsalWallClockMs: Math.max(0, sampleClock(...) - startedAtMs)` with an
  // hour-floored `Date.now()` PASSED, because the hour floor lands BEFORE the
  // injected clock and `Math.max(0, negative)` clamps the leak to exactly the
  // 0 the containment law was checking for. The sample simply stopped existing.
  const REQUIRED_CLOCK_SAMPLES = Object.freeze([
    { exact: 'study-custody.retentionPolicy.frozenAt' },
    { exact: 'validator.validityWindow.now' },
    { exact: 'receipt.observed.rehearsalWallClockMs.end' },
    { exact: 'receipt.generatedAt' },
    { suffix: '.runManifest.signedAt' },
    { suffix: '.barrierReceipt.closedAt' },
  ]);

  const fence = installProviderCallFence();
  const readCounter = { reads: 0 };
  let runDirectoryPreexistingRefusals = 0;
  let aliasBlocksSealed = 0;
  let aliasUnblindingsVerified = 0;
  let aliasCommitmentVerificationFailures = 0;
  let trustRegistryEntriesAppended = 0;
  let trustRegistryVerified = false;
  const runEntries = [];
  const teardowns = [];
  let studyCustody = null;

  try {
    const studyBundle = await loadStudyPolicyManifest({ hololandRoot: root });
    // The FULL plan is built and validated at twelve first, every time. The
    // slice below never reaches buildVillageRunPlan's own twelve-run law.
    const fullPlan = buildVillageRunPlan(studyBundle);
    if (runLimit !== null) {
      if (!Number.isInteger(runLimit) || runLimit < 1 || runLimit > fullPlan.length) {
        fail(
          `runLimit must be an integer in 1..${fullPlan.length} when supplied; `
          + `received ${canonicalJson(runLimit)}`,
        );
      }
    }
    const plan = runLimit === null ? fullPlan : fullPlan.slice(0, runLimit);
    const matrixBundle = loadFrozenAssignmentMatrix({ hololandRoot: root });
    const publicSnapshot = JSON.parse(studyBundle.snapshotFixture.publicState);

    // Study-level custody: the alias-assignment vault is a STUDY secret held
    // across runs by the data custodian, not per-run state. Per-run stores
    // (below) hold only the run's own material.
    mkdirSync(scratch, { recursive: true });
    studyCustody = createSealedCustodyStore({
      operator,
      retentionPolicy: {
        description:
          'Model Village T-7 rehearsal study custody; sealed alias assignment '
          + 'only, deletable by content-key destruction at any time.',
        frozenAt: new Date(
          sampleClock('study-custody.retentionPolicy.frozenAt', nowFn()),
        ).toISOString(),
        policyId: 'mv-study-rehearsal-custody-retention-v1',
      },
      rootDir: path.join(scratch, 'study-custody'),
      runLabel: 'mv-study-rehearsal',
    });

    const routes = studyBundle.routes;
    const certifications = routes.map((route) => buildRehearsalCertification({
      promptTemplate: studyBundle.promptTemplate,
      route,
    }));
    const certificationByRoute = new Map(
      routes.map((route, index) => [route.routeId, certifications[index]]),
    );

    // MV-B3: seal one alias -> route assignment per block. The map is drawn
    // with a CSPRNG because the vault's own precondition requires an assignment
    // that is NOT a deterministic function of public source.
    const aliasCommitments = new Map();
    const aliasRouteMaps = new Map();
    for (const blockId of STUDY_BLOCK_IDS) {
      const aliasRouteMap = Object.fromEntries(
        STUDY_ALIASES.map((alias) => [alias, routes[randomInt(routes.length)].routeId]),
      );
      const commitment = sealAliasAssignment({
        allowRouteReuse: true,
        aliasRouteMap,
        blockId,
        certifications,
        custodyStore: studyCustody,
        matrixBundle,
        operator,
      });
      const check = verifyAliasAssignmentCommitment(commitment);
      if (!check.ok) aliasCommitmentVerificationFailures += 1;
      aliasCommitments.set(blockId, commitment);
      aliasRouteMaps.set(blockId, aliasRouteMap);
      aliasBlocksSealed += 1;
    }

    // MV-B4 publication half: ONE local trust registry for the rehearsal, with
    // a provision entry per village-run validator. This is the first
    // production consumer of scripts/model-village-trust-registry.mjs.
    const registryPath = path.join(scratch, 'trust-registry', 'study-trust-registry.json');
    const trustRegistryHandle = createTrustRegistry({
      operator,
      registryId: 'mv-study-rehearsal-trust-registry',
      registryPath,
    });
    // MV-B4 custody half: the in-memory validator record registry the custody
    // lane requires.
    const custodyRegistry = createValidatorTrustRegistry({
      operator,
      registryId: 'mv-study-rehearsal-registry',
    });

    const studyConfigHash = canonicalDigest({
      drillManifestHash: studyBundle.drillManifestHash,
      policyId: studyBundle.policy.policyId,
      schedulerPolicyHash: studyBundle.schedulerPolicyBundle.policyHash,
      studyManifestHash: studyBundle.studyManifestHash,
    });
    const fleetVerifier = createStudyFleetVerifier({ studyConfigHash });

    const nowMs = sampleClock('validator.validityWindow.now', nowFn());
    const notBefore = new Date(nowMs - 3_600_000).toISOString();
    const notAfter = new Date(nowMs + 86_400_000).toISOString();

    for (const planned of plan) {
      const { blockId, condition, conditionIndex, dayIndex, runId } = planned;
      const crossRunStateFindings = [];

      // (5) Clone a clean shard. provisionIsolatedRun REFUSES a pre-existing
      // run directory by construction, so reuse fails loud rather than leaking
      // state; the emptiness of the fresh shard is then MEASURED, not assumed.
      let context;
      try {
        context = provisionIsolatedRun({
          hololandRoot: root,
          operator,
          runId,
          scratchRoot: scratch,
        });
      } catch (error) {
        runDirectoryPreexistingRefusals += 1;
        throw error;
      }
      teardowns.push(context);
      if (readdirSync(context.storeDir).length !== 0) {
        crossRunStateFindings.push('persistent store directory was not empty at provision');
      }
      if (context.custodyStore.listObjects().length !== 0) {
        crossRunStateFindings.push('sealed custody store was not empty at provision');
      }
      if (runEntries.some((entry) => entry.runDirectory === path.join(scratch, runId))) {
        crossRunStateFindings.push('run directory collides with an earlier run');
      }

      // (6) Stage six unique resident and seat IDs. The route object carries a
      // `studySeat` extension so the replay executor can identify which seat a
      // dispatch belongs to — the scheduler passes a structuredClone, so object
      // identity is not preserved and the seat must travel in the value. The
      // extension carries the residentId and seatId (public) and never the
      // alias -> route map (sealed). Staged BEFORE (9) capture-sealing —
      // moved up from its production-plan position — because MV-B3's
      // captureResponseUnderCustody needs a real route + certification per
      // resident to seal a capture under, and this is the only place in the
      // run where those are resolved. Nothing below depends on the validator
      // provisioning or run-manifest signing that used to sit between the two
      // steps, so the reorder does not touch the hash-chain start (still
      // runManifestHash, computed after this block as before).
      const seatBindings = buildSeatAliasBindings({
        blockId,
        condition,
        matrix: matrixBundle.matrix,
      });
      const residentIds = seatBindings.map((binding) => binding.residentId);
      const aliasRouteMap = aliasRouteMaps.get(blockId);
      const residents = seatBindings.map((binding) => {
        const routeId = aliasRouteMap[binding.adapterAlias];
        const route = routes.find((candidate) => candidate.routeId === routeId);
        if (!route) fail('sealed alias assignment names an undeclared route');
        return {
          certification: certificationByRoute.get(routeId),
          residentId: binding.residentId,
          route: {
            ...structuredClone(route),
            studySeat: { residentId: binding.residentId, seatId: binding.seatId },
          },
        };
      });
      const residentContextById = new Map(
        residents.map((resident) => [resident.residentId, resident]),
      );

      // (9) Seal this run's captured responses into ITS OWN store, through
      // MV-B3's real captureResponseUnderCustody — the same blinding and
      // no-route-leak guarantees the alias-custody checker proves in
      // isolation (scripts/check-hololand-model-village-alias-custody.mjs),
      // now exercised on the path an actual village-run takes. The
      // turnExecutor is buildSyntheticCaptureTurnExecutor (network-free); the
      // real live-provider default (executeCertifiedModelTurn) is never
      // reached. Replay then reads these back out of custody, one read per
      // turn, via createReplayTurnExecutor — untouched, and never wrapped in
      // captureResponseUnderCustody, per the module header's seam.
      const promptBytes = Buffer.from(
        JSON.stringify({
          messages: [{ content: studyBundle.promptTemplate, role: 'user' }],
          runId,
        }),
        'utf8',
      );
      const requestCustodyId = context.custodyStore.sealObject({
        bytes: promptBytes,
        kind: 'model-turn-request',
        label: `${runId}:turn-request`,
      }).custodyId;
      const promptHash = sha256Hex(promptBytes);

      const captureIndex = new Map();
      for (const capture of buildRunCaptures({
        blockId,
        condition,
        residentIds,
        runId,
        turnsPerRun: studyBundle.policy.turnsPerRun,
      })) {
        const resident = residentContextById.get(capture.residentId);
        if (!resident) fail(`capture ${capture.responseId} names an unstaged resident`);
        // MV-B3's blinding law refuses any responseId/residentId containing
        // the adapter_a/adapter_b/adapter_c ALIAS namespace pattern
        // (assertNoSealedIdentityLeak) — and the STUDY's own PUBLIC condition
        // vocabulary reuses those exact names for its four run conditions
        // ('adapter_a_only' etc, plan lines 735-739), so capture.responseId
        // (which embeds runId, which embeds the condition slug) trips it even
        // though a condition name is intentionally public, not the sealed
        // route alias. The record identity passed to captureResponseUnderCustody
        // is therefore built from (dayIndex, conditionIndex) instead — still
        // unique across all twelve runs and every turn/resident, never the
        // condition string.
        const captureRecordResponseId =
          `mv-b3-capture-d${dayIndex}-c${conditionIndex}-t${capture.turnIndex}-${capture.residentId}`;
        const { record, turnReceipt } = await captureResponseUnderCustody({
          aliasCommitmentRef: null,
          blinded: true,
          certification: resident.certification,
          custodyStore: context.custodyStore,
          drill: SYNTHETIC_CAPTURE_DRILL,
          operator,
          residentId: capture.residentId,
          responseId: captureRecordResponseId,
          route: resident.route,
          routeCommitmentSalt: randomBytes(32).toString('hex'),
          turnExecutor: buildSyntheticCaptureTurnExecutor({
            capture,
            promptHash,
            requestCustodyId,
            vocabulary: studyBundle.vocabulary,
          }),
        });
        if (!turnReceipt || turnReceipt.turnCompleted !== true || !record) {
          fail(`synthetic capture ${captureRecordResponseId} did not seal under custody`);
        }
        captureIndex.set(`t${capture.turnIndex}|${capture.residentId}`, Object.freeze({
          promptHash,
          requestCustodyId: turnReceipt.custodyRefs.requestCustodyId,
          responseCustodyId: turnReceipt.custodyRefs.responseCustodyId,
          responseHash: turnReceipt.responseHash,
        }));
      }

      // MV-B4: provision this run's validator key INTO the run's sealed store.
      const validatorId = `mv-study-val-${blockId}-${conditionSlug(condition)}`;
      const provision = provisionValidatorKey({
        custodyStore: context.custodyStore,
        notAfter,
        notBefore,
        operator,
        trustRegistry: custodyRegistry,
        validatorId,
      });
      trustRegistryHandle.appendEntry({
        kind: 'provision',
        notAfter,
        notBefore,
        operator,
        publicKeyPem: provision.publicKeyPem,
        sourceReceiptHash: provision.receipt.receiptHash,
        validatorId,
      });
      trustRegistryEntriesAppended += 1;

      // (4) Validate and seal only the NEXT run manifest — the conductor's own
      // village run manifest, which is the artifact MV-B4's key signs.
      const aliasCommitment = aliasCommitments.get(blockId);
      const runManifest = deepFreeze({
        assignmentManifestHash: aliasCommitment.assignmentManifestHash,
        aliasCommitmentReceiptHash: aliasCommitment.receiptHash,
        blockId,
        condition,
        conditionIndex,
        dayIndex,
        drillManifestHash: studyBundle.drillManifestHash,
        engine: CONDUCTOR_ENGINE,
        kernelSourceHash: matrixBundle.kernelSourceHash,
        promptTemplateHash: sourceDigest(studyBundle.promptTemplate),
        residentsPerTurn: studyBundle.policy.residentsPerTurn,
        runId,
        schema: RUN_MANIFEST_SCHEMA,
        seatBindings: seatBindings.map((binding) => ({ ...binding })),
        snapshotHash: canonicalDigest(publicSnapshot),
        studyManifestHash: studyBundle.studyManifestHash,
        studyPolicyHash: studyBundle.schedulerPolicyBundle.policyHash,
        turnsPerRun: studyBundle.policy.turnsPerRun,
        vocabularyHash: studyBundle.vocabularyHash,
      });
      const runManifestHash = canonicalDigest(runManifest);
      const signature = signStudyRunManifest({
        custodyStore: context.custodyStore,
        manifest: runManifest,
        privateKeyCustodyId: provision.receipt.privateKeyCustodyId,
        studyConfigHash,
      });
      const fleetResult = verifyRunManifestAgainstRegistry({
        manifest: runManifest,
        registrySnapshot: trustRegistryHandle.snapshot(),
        signature,
        signedAt: new Date(
          sampleClock(`${runId}.runManifest.signedAt`, nowFn()),
        ).toISOString(),
        validatorId,
        verifySignature: fleetVerifier.verifySignature,
      });

      const turnCursor = { index: 1 };
      const buildExecutor = turnExecutorFactory ?? (() => createReplayTurnExecutor({
        captureIndex,
        readCounter,
        turnCursor,
        vocabulary: studyBundle.vocabulary,
      }));
      const executor = buildExecutor({
        captureIndex,
        readCounter,
        runId,
        turnCursor,
        vocabulary: studyBundle.vocabulary,
      });
      // The conductor hands the counting fence DOWN to every executor call.
      const schedulerExecutor = (args) => executor({ ...args, fetchImpl: fence.fetch });

      const scheduler = createTurnScheduler({
        custodyStore: context.custodyStore,
        // The scheduler has exposed a nowFn seam since it shipped and the
        // conductor never used it, so every round receipt carried a real wall
        // clock. It is threaded now so an injected clock reaches the deepest
        // timestamp the rehearsal receipt depends on.
        nowFn,
        operator,
        policyBundle: studyBundle.schedulerPolicyBundle,
        residents,
        turnExecutor: schedulerExecutor,
      });

      // (7)+(8) Six deterministic turns as six hash-chained rounds. Round 1
      // chains from the SIGNED run manifest hash, so the whole adjudication
      // chain is anchored on the artifact MV-B4's key attested.
      let chainPrior = runManifestHash;
      const turnRounds = [];
      const runDecisionCounts = emptyDecisionCounts();
      const runOutcomeCounts = emptyOutcomeCounts();
      let runChainVerified = true;

      for (let turnIndex = 1; turnIndex <= studyBundle.policy.turnsPerRun; turnIndex += 1) {
        turnCursor.index = turnIndex;
        const roundRunId = `${runId}-r${turnIndex}`;
        let round;
        try {
          round = await scheduler.executeTurnRound({
            priorReceiptHash: chainPrior,
            publicSnapshot,
            runId: roundRunId,
          });
        } catch (error) {
          fail(`turn round ${roundRunId} did not complete: ${error?.message ?? error}`);
        }
        // CROSS-MODULE clock evidence: closedAt is stamped inside
        // model-village-turn-scheduler.mjs from the nowFn the conductor handed
        // it, and read back out of the barrier receipt here. If the conductor
        // ever stops passing nowFn into createTurnScheduler, this sample stops
        // matching the injected clock and the rehearsal refuses to emit. It is
        // the only one of these samples that a mutation to the conductor's
        // OPTIONS OBJECT (rather than to a timestamp expression) can move.
        sampleClock(
          `${roundRunId}.barrierReceipt.closedAt`,
          Date.parse(round?.barrierReceipt?.closedAt ?? ''),
        );
        const chainCheck = verifyRoundReceiptChain({
          actionDecisionReceipts: round.actionDecisionReceipts,
          barrierReceipt: round.barrierReceipt,
          safetyCheckReceipts: round.safetyCheckReceipts,
        });
        const chainVerified = chainCheck.ok === true
          && round.barrierReceipt.priorReceiptHash === chainPrior;
        if (!chainVerified) runChainVerified = false;

        const roundDecisions = emptyDecisionCounts();
        for (const decision of round.actionDecisionReceipts) {
          if (decision.decision === 'admit') {
            roundDecisions.admitted += 1;
            if (decision.preauthorizedMatch === true) roundDecisions.preauthorizedMatch += 1;
            else roundDecisions.noPreauthorizedMatch += 1;
          } else {
            roundDecisions.denied += 1;
          }
        }
        addCounts(runDecisionCounts, roundDecisions, DECISION_COUNT_KEYS);
        addCounts(runOutcomeCounts, {
          completed: round.barrierReceipt.resolvedCounts.completed,
          failed: round.barrierReceipt.resolvedCounts.failed,
          timedOut: round.barrierReceipt.resolvedCounts.timedOut,
        }, OUTCOME_COUNT_KEYS);

        const terminalReceiptHash = round.actionDecisionReceipts.length > 0
          ? round.actionDecisionReceipts[round.actionDecisionReceipts.length - 1].receiptHash
          : round.barrierReceipt.barrierHash;
        turnRounds.push(Object.freeze({
          barrierHash: round.barrierReceipt.barrierHash,
          chainVerified,
          decisionCounts: roundDecisions,
          frozen: round.barrierReceipt.frozen === true,
          priorReceiptHash: chainPrior,
          resolvedCounts: { ...round.barrierReceipt.resolvedCounts },
          roundRunId,
          terminalReceiptHash,
          turnIndex,
        }));
        chainPrior = terminalReceiptHash;
      }

      const receiptChainRoot = canonicalDigest({
        roundTerminalHashes: turnRounds.map((round) => round.terminalReceiptHash),
        runId,
      });

      runEntries.push(sealHashed({
        aliasCommitmentReceiptHash: aliasCommitment.receiptHash,
        blockId,
        chainVerified: runChainVerified,
        condition,
        conditionIndex,
        crossRunStateFindings,
        dayIndex,
        decisionCounts: runDecisionCounts,
        receiptChainRoot,
        runDirectory: path.join(scratch, runId),
        runId,
        runManifestHash,
        runManifestSignatureVerified: fleetResult.ok === true
          && fleetResult.manifestHash === runManifestHash,
        schema: REHEARSAL_RUN_ENTRY_SCHEMA,
        seatBindingHash: canonicalDigest(seatBindings.map((b) => ({ ...b }))),
        turnOutcomeCounts: runOutcomeCounts,
        turnRounds,
        validatorId,
      }, 'entryHash'));

      // (10) Tear down the shard.
      context.teardown();
    }

    // (11) Integrity disposition. The sealed alias assignment is opened ONLY
    // now, per block, with the block's own receipt-chain root as the terminal
    // commitment — the strongest available proof that the vault round-trips:
    // MV-B3 re-derives every public commitment from the sealed record and
    // refuses to reveal on any mismatch. The revealed map is deliberately
    // DISCARDED; it never reaches a variable that outlives this block.
    const draftAggregate = deriveAggregate(runEntries);
    for (const blockId of STUDY_BLOCK_IDS) {
      const commitment = aliasCommitments.get(blockId);
      const { receipt } = issueUnblindingReceipt({
        authorization: {
          dataCustodian: 'rehearsal-data-custodian',
          protocolLead: 'rehearsal-protocol-lead',
        },
        commitment,
        custodyStore: studyCustody,
        operator,
        terminalCommitment: {
          assignmentManifestHash: commitment.assignmentManifestHash,
          canonicalHash: draftAggregate.blockChainRoots[blockId],
          commitmentId: commitment.receiptHash,
          runId: `mv-b3-${blockId}`,
        },
      });
      if (
        verifyUnblindingReceipt(receipt).ok === true
        && receipt.failNeutral === false
        && receipt.aliasCommitmentsVerified === true
      ) {
        aliasUnblindingsVerified += 1;
      }
    }

    trustRegistryVerified = verifyTrustRegistry(trustRegistryHandle.snapshot()).ok === true;
    trustRegistryHandle.close();

    const aggregate = deriveAggregate(runEntries);
    const observed = {
      aliasBlocksSealed,
      aliasCommitmentVerificationFailures,
      aliasUnblindingsVerified,
      custodyResponseReadsObserved: readCounter.reads,
      // Baseline-relative, so these stay "traffic during the rehearsal". The
      // fence drives one self-test call through the global binding at install
      // time to prove the counter can move at all; that probe is before the
      // baseline cursor and is not rehearsal traffic.
      fetchCallsObserved: fence.state.calls - fence.baseline.calls,
      nonProviderFetchCallTargets: fence.state.nonProviderTargets
        .slice(fence.baseline.nonProviderTargets),
      providerFetchCallTargets: fence.state.providerTargets
        .slice(fence.baseline.providerTargets),
      providerFetchCallsObserved:
        fence.state.providerCalls - fence.baseline.providerCalls,
      rehearsalWallClockMs: Math.max(
        0,
        sampleClock('receipt.observed.rehearsalWallClockMs.end', nowFn()) - startedAtMs,
      ),
      runDirectoryPreexistingRefusals,
      trustRegistryEntriesAppended,
      trustRegistryVerified,
    };
    assertExactKeys(observed, OBSERVED_KEYS, 'observed');

    const generatedAtMs = sampleClock('receipt.generatedAt', nowFn());

    const failures = evaluateRehearsal({ aggregate, expectations, observed });
    const receipt = sealHashed({
      aggregate,
      declared: buildDeclaredBoundary(failures),
      engine: CONDUCTOR_ENGINE,
      generatedAt: new Date(generatedAtMs).toISOString(),
      observed,
      passed: failures.length === 0,
      runs: runEntries,
      schema: REHEARSAL_RECEIPT_SCHEMA,
      studyManifestHash: studyBundle.studyManifestHash,
      studyPolicyId: studyBundle.policy.policyId,
    }, 'receiptHash');

    // INJECTED-CLOCK CONTAINMENT, enforced over the SEALED RECEIPT rather than
    // over the local variables that fed it, so that replacing a receipt field's
    // expression outright cannot route around the check.
    //
    // MEASURED, not configured: a frozen clock is one that has not advanced
    // across the entire rehearsal. The real clock advances by tens of seconds
    // here, so this can only be true when a caller injected a constant, which
    // is why the check is inert on the real-clock acceptance path and cannot
    // false-red a correct production run.
    if (clockSamples.length > 0 && nowFn() === startedAtMs) {
      const labels = clockSamples.map((sample) => sample.label);
      const missing = REQUIRED_CLOCK_SAMPLES.filter((required) => (
        required.exact
          ? !labels.includes(required.exact)
          : !labels.some((label) => label.endsWith(required.suffix))
      )).map((required) => required.exact ?? `*${required.suffix}`);
      if (missing.length > 0) {
        fail(
          'INJECTED CLOCK NOT CONTAINED: a clock-derived value stopped registering '
          + 'its sample, so the containment law had nothing to check it against. '
          + `Missing clock samples: ${missing.join(', ')}`,
        );
      }
      const offInjectedClock = clockSamples.filter(
        (sample) => sample.milliseconds !== startedAtMs,
      );
      if (offInjectedClock.length > 0) {
        const shown = offInjectedClock.slice(0, 4).map((sample) => (
          `${sample.label}=${canonicalJson(sample.milliseconds)}`
        ));
        fail(
          'INJECTED CLOCK NOT CONTAINED: this rehearsal was given a frozen clock '
          + `(${startedAtMs}) but ${offInjectedClock.length} of ${clockSamples.length} `
          + 'clock-derived values did not come from it, so the receipt would carry '
          + `real wall-clock time. Off the injected clock: ${shown.join(', ')}`
          + `${offInjectedClock.length > shown.length ? ', ...' : ''}`,
        );
      }
      // The two clock-derived values that ARE compared leaves, read back out of
      // the sealed receipt. Both previously survived a real-clock mutation
      // because an hour-floored Date.now() is equal across two executions five
      // seconds apart, so leaf-equality alone could never catch them.
      if (receipt.observed.rehearsalWallClockMs !== 0) {
        fail(
          'INJECTED CLOCK NOT CONTAINED: under a frozen clock the rehearsal wall '
          + 'clock must be 0ms, but the receipt carries '
          + `${canonicalJson(receipt.observed.rehearsalWallClockMs)}`,
        );
      }
      if (Date.parse(receipt.generatedAt) !== startedAtMs) {
        fail(
          'INJECTED CLOCK NOT CONTAINED: under a frozen clock generatedAt must be '
          + `${new Date(startedAtMs).toISOString()}, but the receipt carries `
          + `${canonicalJson(receipt.generatedAt)}`,
        );
      }
    }

    if (writeReceipt) {
      const outputPath = path.join(root, ...REHEARSAL_RECEIPT_OUTPUT_PATH.split('/'));
      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${canonicalJson(receipt)}\n`, 'utf8');
    }
    return deepFreeze({ failures, receipt, scratchRoot: scratch });
  } finally {
    for (const context of teardowns) {
      try {
        context.teardown();
      } catch {
        // Teardown is best effort; the run's evidence is already recorded.
      }
    }
    try {
      if (studyCustody) studyCustody.close();
    } catch {
      // As above.
    }
    // CUSTODY HYGIENE, found by looking at the disk after a run rather than by
    // reading the teardown code. context.teardown() and custodyStore.close()
    // release handles; NEITHER removes the store. A completed rehearsal was
    // therefore leaving, per village-run, the sealed objects, the sealed
    // validator PKCS8, AND custody/key/content-key.bin — the decryption key
    // sitting in the same tree as the ciphertext it opens (measured 2026-07-27:
    // 958 files, ~718 KB per rehearsal, one tree accumulating per invocation).
    // A sealed store whose content key is left beside it is not sealed against
    // anyone with filesystem access, so the tree this function created is
    // destroyed here.
    //
    // Best-effort by necessity — Windows can hold a handle briefly after
    // teardown — and deliberately NOT a claim: the checker measures whether the
    // directory is actually gone and fails if it is not, so a silent failure
    // here cannot pass as success.
    if (ownsScratchRoot) {
      try {
        rmSync(scratch, { force: true, recursive: true });
      } catch {
        // Measured by the checker, never asserted here.
      }
    }
    fence.restore();
  }
}

/**
 * declared{} — author assertions, EXPLICITLY NON-LOAD-BEARING.
 *
 * Not one value here is evidence. They exist so a reader does not have to infer
 * the boundary from prose, and verifyRehearsalReceipt checks only their SHAPE
 * and that they do not shadow an observed key. `failureSummary` is a bounded
 * projection of the evaluation, kept here rather than in observed{} precisely
 * because it is prose.
 */
function buildDeclaredBoundary(failures) {
  return {
    capturedResponseProvenance: 'rehearsal-fixture-sealed-into-run-custody',
    certificationProvenance: 'rehearsal-fixture-not-live-probe',
    failureSummary: failures.slice(0, 8).map((entry) => entry.slice(0, 200)),
    laneStatement:
      'T-7 dress rehearsal of the study-lane run-day lifecycle against captured '
      + 'responses. Every value in observed{} and aggregate{} is measured or '
      + 'derived from execution; every value in declared{} is an author '
      + 'assertion and is not evidence for anything.',
    liveStudyRunClaimed: false,
    modelTurnReceiptProvenance: 'conductor-replay-executor-not-live-provider',
    openOutcomeTierClaimed: false,
    operationalBlindingProven: false,
    phase1AdmissionClaimed: false,
    providerCallMeasurementScope:
      'globalThis.fetch plus the injected fetchImpl handle, for the whole '
      + 'rehearsal. A call is counted as a PROVIDER call only when its target is '
      + 'an absolute http(s) URL; every other call is counted and published in '
      + 'nonProviderFetchCallTargets. Raw node:http/https sockets, child '
      + 'processes, and references to fetch captured before the fence was '
      + 'installed are OUT of scope and are not measured.',
    tamperProofReceiptClaimed: false,
    worldMutationPerformedClaimed: false,
  };
}

const DECLARED_KEYS = Object.freeze([
  'capturedResponseProvenance',
  'certificationProvenance',
  'failureSummary',
  'laneStatement',
  'liveStudyRunClaimed',
  'modelTurnReceiptProvenance',
  'openOutcomeTierClaimed',
  'operationalBlindingProven',
  'phase1AdmissionClaimed',
  'providerCallMeasurementScope',
  'tamperProofReceiptClaimed',
  'worldMutationPerformedClaimed',
]);

// ---------------------------------------------------------------------------
// Receipt verification — the gate that bites
// ---------------------------------------------------------------------------

/**
 * Verifies a rehearsal receipt.
 *
 * The load-bearing steps, in order:
 *  1. closed keys + schema/engine pins on the receipt, every run, every round;
 *  2. every run entryHash recomputes;
 *  2b. the day/block/condition SEQUENCE is RE-DERIVED from the frozen study
 *     design (three day-blocks of four conditions) and must match position for
 *     position — dayIndex is never read, and a runId must recompute from its
 *     own (blockId, condition) pair;
 *  3. the ENTIRE aggregate is RE-DERIVED from receipt.runs and must match —
 *     so no aggregate field is independently writable;
 *  4. observed{} + aggregate{} are checked against the INDEPENDENT
 *     REHEARSAL_EXPECTATIONS table and the cross-bindings;
 *  5. `passed` is RECOMPUTED from (4), never read;
 *  6. declared{} may not shadow an observed key, and every declared
 *     did-not-happen flag must be false;
 *  7. the receiptHash recomputes.
 *
 * A field edited without re-hashing fails at (7). A field edited AND re-signed
 * fails at (3), (4) or (5) — which is the property the lane's other claim
 * boundaries did not have.
 */
export function verifyRehearsalReceipt(receipt, { expectations = REHEARSAL_EXPECTATIONS } = {}) {
  try {
    assertExactKeys(receipt, REHEARSAL_RECEIPT_KEYS, 'rehearsal receipt');
    if (receipt.schema !== REHEARSAL_RECEIPT_SCHEMA) {
      fail(`rehearsal receipt schema is not ${REHEARSAL_RECEIPT_SCHEMA}`);
    }
    if (receipt.engine !== CONDUCTOR_ENGINE) {
      fail(`rehearsal receipt engine is not ${CONDUCTOR_ENGINE}`);
    }
    if (typeof receipt.generatedAt !== 'string' || !ISO_UTC_PATTERN.test(receipt.generatedAt)) {
      fail('rehearsal receipt generatedAt must be an ISO UTC timestamp');
    }
    assertSha256(receipt.studyManifestHash, 'studyManifestHash');
    assertNonEmptyString(receipt.studyPolicyId, 'studyPolicyId');
    if (receipt.studyPolicyId !== 'mv-study-policy-v1') {
      fail('rehearsal receipt is not governed by mv-study-policy-v1');
    }
    if (typeof receipt.passed !== 'boolean') {
      fail('rehearsal receipt passed must be boolean');
    }
    if (!Array.isArray(receipt.runs)) fail('rehearsal receipt runs must be an array');

    // (1)+(2) per-run and per-round structure, with self-hash recompute.
    for (const [index, run] of receipt.runs.entries()) {
      const label = `runs[${index}]`;
      assertExactKeys(run, REHEARSAL_RUN_KEYS, label);
      if (run.schema !== REHEARSAL_RUN_ENTRY_SCHEMA) {
        fail(`${label} schema is not ${REHEARSAL_RUN_ENTRY_SCHEMA}`);
      }
      if (!STUDY_BLOCK_IDS.includes(run.blockId)) fail(`${label} blockId is not a study block`);
      if (!STUDY_CONDITIONS.includes(run.condition)) {
        fail(`${label} condition is not a study condition`);
      }
      assertNonEmptyString(run.runId, `${label}.runId`);
      if (!RUN_ID_PATTERN.test(run.runId)) fail(`${label}.runId violates the runId law`);
      assertSha256(run.runManifestHash, `${label}.runManifestHash`);
      assertSha256(run.receiptChainRoot, `${label}.receiptChainRoot`);
      assertSha256(run.seatBindingHash, `${label}.seatBindingHash`);
      assertSha256(run.aliasCommitmentReceiptHash, `${label}.aliasCommitmentReceiptHash`);
      assertNonEmptyString(run.validatorId, `${label}.validatorId`);
      assertNonEmptyString(run.runDirectory, `${label}.runDirectory`);
      if (typeof run.chainVerified !== 'boolean') fail(`${label}.chainVerified must be boolean`);
      if (typeof run.runManifestSignatureVerified !== 'boolean') {
        fail(`${label}.runManifestSignatureVerified must be boolean`);
      }
      if (!Array.isArray(run.crossRunStateFindings)) {
        fail(`${label}.crossRunStateFindings must be an array`);
      }
      assertExactKeys(run.decisionCounts, DECISION_COUNT_KEYS, `${label}.decisionCounts`);
      assertExactKeys(run.turnOutcomeCounts, OUTCOME_COUNT_KEYS, `${label}.turnOutcomeCounts`);
      for (const key of DECISION_COUNT_KEYS) {
        assertNonNegativeInteger(run.decisionCounts[key], `${label}.decisionCounts.${key}`);
      }
      for (const key of OUTCOME_COUNT_KEYS) {
        assertNonNegativeInteger(run.turnOutcomeCounts[key], `${label}.turnOutcomeCounts.${key}`);
      }
      if (!Array.isArray(run.turnRounds)) fail(`${label}.turnRounds must be an array`);
      const roundDecisionTotals = emptyDecisionCounts();
      const roundOutcomeTotals = emptyOutcomeCounts();
      for (const [roundIndex, round] of run.turnRounds.entries()) {
        const roundLabel = `${label}.turnRounds[${roundIndex}]`;
        assertExactKeys(round, REHEARSAL_ROUND_KEYS, roundLabel);
        if (round.turnIndex !== roundIndex + 1) {
          fail(`${roundLabel}.turnIndex is not contiguous from 1`);
        }
        assertSha256(round.barrierHash, `${roundLabel}.barrierHash`);
        assertSha256(round.priorReceiptHash, `${roundLabel}.priorReceiptHash`);
        assertSha256(round.terminalReceiptHash, `${roundLabel}.terminalReceiptHash`);
        assertNonEmptyString(round.roundRunId, `${roundLabel}.roundRunId`);
        if (typeof round.chainVerified !== 'boolean') {
          fail(`${roundLabel}.chainVerified must be boolean`);
        }
        if (typeof round.frozen !== 'boolean') fail(`${roundLabel}.frozen must be boolean`);
        assertExactKeys(round.resolvedCounts, OUTCOME_COUNT_KEYS, `${roundLabel}.resolvedCounts`);
        assertExactKeys(round.decisionCounts, DECISION_COUNT_KEYS, `${roundLabel}.decisionCounts`);
        // The round chain must be linear: round 1 anchors on the signed run
        // manifest hash, round n+1 on round n's terminal receipt.
        const expectedPrior = roundIndex === 0
          ? run.runManifestHash
          : run.turnRounds[roundIndex - 1].terminalReceiptHash;
        if (round.priorReceiptHash !== expectedPrior) {
          fail(
            `${roundLabel} does not chain from `
            + `${roundIndex === 0 ? 'the signed run manifest' : 'the previous round'}`,
          );
        }
        addCounts(roundDecisionTotals, round.decisionCounts, DECISION_COUNT_KEYS);
        addCounts(roundOutcomeTotals, round.resolvedCounts, OUTCOME_COUNT_KEYS);
      }
      // The run's own totals must be the sum of its rounds — a run entry
      // cannot restate a total its rounds do not support.
      if (canonicalJson(roundDecisionTotals) !== canonicalJson(run.decisionCounts)) {
        fail(`${label}.decisionCounts does not equal the sum of its rounds`);
      }
      if (canonicalJson(roundOutcomeTotals) !== canonicalJson(run.turnOutcomeCounts)) {
        fail(`${label}.turnOutcomeCounts does not equal the sum of its rounds`);
      }
      if (run.receiptChainRoot !== canonicalDigest({
        roundTerminalHashes: run.turnRounds.map((round) => round.terminalReceiptHash),
        runId: run.runId,
      })) {
        fail(`${label}.receiptChainRoot does not recompute from its round chain`);
      }
      const { entryHash, ...unsignedRun } = run;
      assertSha256(entryHash, `${label}.entryHash`);
      if (canonicalDigest(unsignedRun) !== entryHash) {
        fail(`${label}.entryHash does not recompute`);
      }
    }

    // (2b) the day/block/condition sequence is DERIVED from the frozen study
    // design, never read. Runs the whole list at once because the law is
    // positional: run i belongs to a known day, not to whatever day it says.
    assertRunPlanSequence(receipt.runs);

    // (3) the aggregate is DERIVED, never read.
    assertExactKeys(receipt.aggregate, AGGREGATE_KEYS, 'aggregate');
    const derived = deriveAggregate(receipt.runs);
    if (canonicalJson(derived) !== canonicalJson(receipt.aggregate)) {
      fail(
        'aggregate does not re-derive from the per-run entries; a rehearsal '
        + 'aggregate is never an independently writable field',
      );
    }

    // (4) observed{} shape, then the independent expectation table.
    assertExactKeys(receipt.observed, OBSERVED_KEYS, 'observed');
    const observed = receipt.observed;
    for (const key of [
      'aliasBlocksSealed',
      'aliasCommitmentVerificationFailures',
      'aliasUnblindingsVerified',
      'custodyResponseReadsObserved',
      'fetchCallsObserved',
      'providerFetchCallsObserved',
      'rehearsalWallClockMs',
      'runDirectoryPreexistingRefusals',
      'trustRegistryEntriesAppended',
    ]) {
      assertNonNegativeInteger(observed[key], `observed.${key}`);
    }
    if (typeof observed.trustRegistryVerified !== 'boolean') {
      fail('observed.trustRegistryVerified must be boolean');
    }
    for (const key of ['nonProviderFetchCallTargets', 'providerFetchCallTargets']) {
      if (!Array.isArray(observed[key]) || observed[key].some((entry) => typeof entry !== 'string')) {
        fail(`observed.${key} must be an array of strings`);
      }
    }

    // (6) declared{} may not shadow observed{} or aggregate{}, and every
    // did-not-happen flag must stay false.
    assertExactKeys(receipt.declared, DECLARED_KEYS, 'declared');
    for (const key of Object.keys(receipt.declared)) {
      if (OBSERVED_KEYS.includes(key) || AGGREGATE_KEYS.includes(key)) {
        fail(`declared.${key} shadows a measured key; declared values are never evidence`);
      }
    }
    for (const flag of [
      'liveStudyRunClaimed',
      'openOutcomeTierClaimed',
      'operationalBlindingProven',
      'phase1AdmissionClaimed',
      'tamperProofReceiptClaimed',
      'worldMutationPerformedClaimed',
    ]) {
      if (receipt.declared[flag] !== false) {
        fail(`declared.${flag} is a pinned claim flag and must be false`);
      }
    }

    // (5) RECOMPUTE passed. Never read it.
    const failures = evaluateRehearsal({
      aggregate: receipt.aggregate,
      expectations,
      observed,
    });
    if (receipt.passed !== (failures.length === 0)) {
      fail(
        `rehearsal receipt passed=${receipt.passed} does not match the `
        + `recomputed verdict (${failures.length} expectation failure(s)`
        + `${failures.length > 0 ? `: ${failures[0]}` : ''})`,
      );
    }

    // (7) self-hash last, so a structural or claim failure is reported as
    // itself rather than as an incidental hash mismatch.
    const { receiptHash, ...unsigned } = receipt;
    assertSha256(receiptHash, 'rehearsal receipt receiptHash');
    if (canonicalDigest(unsigned) !== receiptHash) {
      fail('rehearsal receipt receiptHash does not recompute');
    }
    return { failureReason: null, failures, ok: true };
  } catch (error) {
    return {
      failureReason: error?.message ?? String(error),
      failures: null,
      ok: false,
    };
  }
}

// ---------------------------------------------------------------------------
// REPEAT-EXECUTION EQUALITY (the "seed and deterministic clock" gate)
// ---------------------------------------------------------------------------

/**
 * WHAT WAS ACTUALLY WRONG, AND WHAT THIS DOES AND DOES NOT FIX.
 *
 * The runtime-closure gate row was named "Seed and deterministic clock" and
 * NOTHING in this lane had ever compared two executions. Measured at HEAD
 * (2026-07-27, two read-only two-run executions in one process): 53 of 271
 * receipt leaves differed, including rehearsalRoot, every runManifestHash,
 * every receiptChainRoot and every round terminal hash. The gate was named for
 * a property no artifact tested.
 *
 * THE SEED HALF OF THAT NAME IS DISPROVEN AND IS NOT IMPLEMENTED. A seed
 * parameter was NOT added, because there is nothing left for it to seed. The
 * rehearsal draws randomness in exactly two places, and both are blinding
 * material that MUST be fresh:
 *   - the alias -> route draw (`routes[randomInt(routes.length)]`), which is a
 *     CSPRNG draw precisely because an earlier finding in this lane established
 *     that a deterministic assignment is a function of public source and
 *     therefore not sealed at all; and
 *   - `routeCommitmentSalt: randomBytes(32)`, the hiding salt of that same
 *     commitment.
 * Every other value in the rehearsal is already a pure function of frozen
 * source. Adding a `seed` option that no genuinely-deterministic code path
 * consumed would be decorative width — the exact failure this lane keeps
 * shipping — so the name is corrected instead of satisfied.
 *
 * THE CLOCK HALF IS IMPLEMENTED: runRehearsal now takes `nowFn` and threads it
 * through its own timestamps AND into createTurnScheduler, whose nowFn seam had
 * existed unused since it shipped.
 *
 * WHAT REMAINS PERMITTED TO VARY is pinned below and is NOT a free-form escape
 * hatch. Four rules make it teeth rather than decoration:
 *   (1) the two receipts must have IDENTICAL leaf-path sets — a field that
 *       exists in one execution and not the other is a failure, not a diff;
 *   (2) any differing leaf whose path is not matched by a pinned pattern fails;
 *   (3) a pinned pattern that matches NO path in the receipt fails — so a
 *       rename cannot leave a silently permissive entry behind; and
 *   (4) a pinned pattern whose matched paths did not actually DIFFER fails — so
 *       the list cannot be padded with stable fields to widen the exemption.
 * Rules (3) and (4) are what stop a new nondeterministic field from being
 * absorbed: it lands on no pattern, so rule (2) reds.
 *
 * FALSE-POSITIVE RATE. Every pinned entry is either a 256-bit digest downstream
 * of a fresh CSPRNG draw and a fresh 32-byte salt (probability of two
 * executions agreeing is ~2^-256, i.e. it will not happen) or `runDirectory`,
 * which differs whenever the two executions were given different scratch roots
 * — asserted by this function rather than assumed. There is no probabilistic
 * detector here and therefore no power calculation to pin: the comparison is
 * exact equality over the whole artifact.
 */
export const REHEARSAL_VARIANCE_ALLOWLIST = Object.freeze([
  Object.freeze({
    path: 'aggregate.blockChainRoots.*',
    reason: 'per-block digest over receiptChainRoots, which are alias-derived',
  }),
  Object.freeze({
    path: 'aggregate.rehearsalRoot',
    reason: 'digest over blockChainRoots, which are alias-derived',
  }),
  Object.freeze({
    path: 'receiptHash',
    reason: 'self-hash over an artifact containing alias-derived material',
  }),
  Object.freeze({
    path: 'runs[*].aliasCommitmentReceiptHash',
    reason: 'THE root cause: a fresh CSPRNG alias draw under a fresh 32-byte salt',
  }),
  Object.freeze({
    path: 'runs[*].entryHash',
    reason: 'self-hash over a run entry containing alias-derived material',
  }),
  Object.freeze({
    path: 'runs[*].receiptChainRoot',
    reason: 'chain anchored on runManifestHash, which is alias-derived',
  }),
  Object.freeze({
    path: 'runs[*].runDirectory',
    reason: 'absolute filesystem path; the two executions need distinct scratch roots',
  }),
  Object.freeze({
    path: 'runs[*].runManifestHash',
    reason: 'the manifest pins aliasCommitmentReceiptHash and assignmentManifestHash',
  }),
  Object.freeze({
    path: 'runs[*].turnRounds[*].barrierHash',
    reason: 'round receipt chained from the alias-derived runManifestHash',
  }),
  Object.freeze({
    path: 'runs[*].turnRounds[*].priorReceiptHash',
    reason: 'round 1 IS runManifestHash; later rounds chain from it',
  }),
  Object.freeze({
    path: 'runs[*].turnRounds[*].terminalReceiptHash',
    reason: 'terminal decision receipt of an alias-derived chain',
  }),
]);

/**
 * Flattens a receipt to `path -> canonical leaf string`. Array indices are kept
 * concrete so a length change shows up as a structural difference.
 */
export function flattenReceiptLeaves(value, prefix = '', out = new Map()) {
  if (value === null || typeof value !== 'object') {
    out.set(prefix, canonicalJson(value));
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(`${prefix}[]`, '[]');
    value.forEach((item, index) => flattenReceiptLeaves(item, `${prefix}[${index}]`, out));
    return out;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) out.set(`${prefix}{}`, '{}');
  for (const key of keys.sort()) {
    flattenReceiptLeaves(value[key], prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/** `runs[3].turnRounds[5].barrierHash` -> `runs[*].turnRounds[*].barrierHash`. */
function normalizeLeafPath(leafPath) {
  return leafPath.replace(/\[\d+\]/g, '[*]');
}

function allowlistPatternMatches(pattern, normalizedPath) {
  if (pattern === normalizedPath) return true;
  if (!pattern.endsWith('.*')) return false;
  const prefix = `${pattern.slice(0, -2)}.`;
  if (!normalizedPath.startsWith(prefix)) return false;
  const tail = normalizedPath.slice(prefix.length);
  // `.*` covers exactly one further key, never a whole subtree.
  return tail.length > 0 && !tail.includes('.') && !tail.includes('[');
}

/**
 * Compares two independent executions of runRehearsal.
 *
 * Both receipts must be real, passing rehearsals of the same shape; anything
 * else is reported as UNMEASURED and fails, because a comparison of zero runs
 * over zero executions certifies nothing.
 */
export function compareRehearsalExecutions(
  receiptA,
  receiptB,
  { allowlist = REHEARSAL_VARIANCE_ALLOWLIST } = {},
) {
  const failures = [];
  for (const [label, receipt] of [['A', receiptA], ['B', receiptB]]) {
    if (!receipt || typeof receipt !== 'object' || !Array.isArray(receipt.runs)) {
      failures.push(
        `UNMEASURED: execution ${label} did not produce a rehearsal receipt, so `
        + 'the repeat-execution comparison never ran',
      );
    } else if (receipt.runs.length === 0) {
      failures.push(`UNMEASURED: execution ${label} produced zero village-runs`);
    } else if (receipt.passed !== true) {
      failures.push(
        `execution ${label} did not pass, so comparing it proves nothing about a `
        + 'passing rehearsal',
      );
    }
  }
  if (failures.length > 0) {
    return {
      comparedLeaves: 0,
      deadAllowlistEntries: [],
      differingLeaves: [],
      failures,
      nonVaryingAllowlistEntries: [],
      ok: false,
      structuralDrift: [],
      unallowlistedDifferences: [],
    };
  }

  const flatA = flattenReceiptLeaves(receiptA);
  const flatB = flattenReceiptLeaves(receiptB);
  const allPaths = [...new Set([...flatA.keys(), ...flatB.keys()])].sort();

  const structuralDrift = allPaths.filter((p) => !flatA.has(p) || !flatB.has(p));
  const differingLeaves = allPaths.filter(
    (p) => flatA.has(p) && flatB.has(p) && flatA.get(p) !== flatB.get(p),
  );

  if (structuralDrift.length > 0) {
    failures.push(
      `${structuralDrift.length} receipt leaf path(s) exist in one execution and `
      + `not the other (first: ${structuralDrift.slice(0, 5).join(', ')}); a field `
      + 'that appears conditionally is nondeterministic structure',
    );
  }

  const matchedByPattern = new Map(allowlist.map((entry) => [entry.path, []]));
  const differedByPattern = new Map(allowlist.map((entry) => [entry.path, []]));
  for (const leafPath of allPaths) {
    const normalized = normalizeLeafPath(leafPath);
    for (const entry of allowlist) {
      if (allowlistPatternMatches(entry.path, normalized)) {
        matchedByPattern.get(entry.path).push(leafPath);
        if (differingLeaves.includes(leafPath)) differedByPattern.get(entry.path).push(leafPath);
      }
    }
  }

  const unallowlistedDifferences = differingLeaves.filter((leafPath) => {
    const normalized = normalizeLeafPath(leafPath);
    return !allowlist.some((entry) => allowlistPatternMatches(entry.path, normalized));
  });
  if (unallowlistedDifferences.length > 0) {
    failures.push(
      `${unallowlistedDifferences.length} receipt field(s) differed between two `
      + 'executions and are NOT on the pinned variance allowlist: '
      + `${unallowlistedDifferences.slice(0, 10).join(', ')}`,
    );
  }

  const deadAllowlistEntries = allowlist
    .filter((entry) => matchedByPattern.get(entry.path).length === 0)
    .map((entry) => entry.path);
  if (deadAllowlistEntries.length > 0) {
    failures.push(
      'the pinned variance allowlist contains entries that match no field in the '
      + `receipt (${deadAllowlistEntries.join(', ')}); a stale exemption is a `
      + 'silently widened check',
    );
  }

  const nonVaryingAllowlistEntries = allowlist
    .filter((entry) => matchedByPattern.get(entry.path).length > 0
      && differedByPattern.get(entry.path).length === 0)
    .map((entry) => entry.path);
  if (nonVaryingAllowlistEntries.length > 0) {
    failures.push(
      'the pinned variance allowlist exempts fields that did NOT vary '
      + `(${nonVaryingAllowlistEntries.join(', ')}); the exemption list must be `
      + 'exactly the set that genuinely cannot be reproduced',
    );
  }

  return {
    comparedLeaves: allPaths.length,
    deadAllowlistEntries,
    differingLeaves,
    failures,
    nonVaryingAllowlistEntries,
    ok: failures.length === 0,
    structuralDrift,
    unallowlistedDifferences,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * One execution of the rehearsal with an injected FROZEN clock, written raw to
 * `--out`. This exists so the checker can run two executions in two FRESH
 * PROCESSES: process warm state is itself a nondeterminism source (measured —
 * the one-time `/holoscript_wasm_bg.wasm` module load makes
 * observed.fetchCallsObserved 1 on the first in-process rehearsal and 0 on
 * every later one), and two in-process executions would silently differ on the
 * provider-call counter, which is the last field that should ever be exempted.
 */
async function runRepeatProbeExecution(argv) {
  const readFlag = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
  };
  const out = readFlag('--out');
  const scratch = readFlag('--scratch');
  const clockRaw = readFlag('--clock');
  const runsRaw = readFlag('--runs');
  // The caller supplies the expectation table for the shape it asked for. A
  // bounded probe evaluated against the twelve-run table would report
  // passed:false and the comparison would (correctly) refuse to certify it.
  const expectationsPath = readFlag('--expectations');
  if (!out || !scratch || !clockRaw) {
    process.stderr.write('--repeat-probe requires --out, --scratch and --clock\n');
    process.exitCode = 2;
    return;
  }
  const clock = Number(clockRaw);
  if (!Number.isFinite(clock)) {
    process.stderr.write('--clock must be a finite epoch-millisecond value\n');
    process.exitCode = 2;
    return;
  }
  const runLimit = runsRaw === null ? null : Number(runsRaw);
  const expectations = expectationsPath
    ? Object.freeze(JSON.parse(readFileSync(path.resolve(expectationsPath), 'utf8')))
    : REHEARSAL_EXPECTATIONS;
  const rootFlag = readFlag('--root');
  const result = await runRehearsal({
    expectations,
    hololandRoot: rootFlag ? path.resolve(rootFlag) : defaultHololandRoot(),
    // A FROZEN clock, not a monotonic fake: the validator validity window is
    // enforced against the caller-supplied signing time (never against real
    // time), so freezing keeps every window internally consistent.
    nowFn: () => clock,
    runLimit,
    scratchRoot: scratch,
    writeReceipt: false,
  });
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(path.resolve(out), `${canonicalJson(result.receipt)}\n`, 'utf8');
}

async function main() {
  if (process.argv.includes('--repeat-probe')) {
    await runRepeatProbeExecution(process.argv.slice(2));
    return;
  }
  const result = await runRehearsal({});
  const verification = verifyRehearsalReceipt(result.receipt);
  const summary = {
    aggregate: result.receipt.aggregate,
    observed: result.receipt.observed,
    passed: result.receipt.passed,
    receiptHash: result.receipt.receiptHash,
    verified: verification.ok,
    verifyFailureReason: verification.failureReason,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.receipt.passed !== true || verification.ok !== true) {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
