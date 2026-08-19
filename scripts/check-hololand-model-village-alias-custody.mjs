#!/usr/bin/env node
/* global Buffer, URL, console, process */

// HoloLand Model Village MV-B3 alias custody + captured-response integration
// checker.
//
// GATE THIS CLOSES (custody side): docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md
// runtime-closure-gate row "Captured replay", REMAINING column: "Real
// captured-response custody and provider-route evidence." Spec lines 216-228
// require each adapter to record seed requested, seed accepted, model revision
// or local file hash, temperature and token limit, raw response hash, and the
// captured response location under local sealed custody. Spec lines 188-204
// require that residents and observers never receive adapter identity or
// provider route.
//
// Language boundary (spec lines 106-108): this checker is orchestration,
// canonicalization, custody, and verification only. The assignment matrix,
// prompt, vocabulary, and route declarations are canonical `.hs` source DATA
// consumed through the shipped MV-B1/MV-B3 modules; nothing here authors
// resident reasoning, village rules, treatments, or scoring.
//
// ---------------------------------------------------------------------------
// THE BLINDING LAW (load-bearing)
// ---------------------------------------------------------------------------
// The adapter_a/adapter_b/adapter_c -> certified-route mapping is SEALED. It
// exists only inside the encrypted custody store and, on an authorized
// unblinding, in this process's memory. It NEVER reaches the emitted receipt,
// a log line, a thrown message, or a filename. Public artifacts carry
// COMMITMENTS (salted digests) only.
//
// Two independent fences enforce that here:
//   1. Every captured response is taken in BLINDED mode, so the record's
//      route-identifying and revision-identifying fields are null and the only
//      public route binding is a salted routeCommitment (a FRESH salt per
//      capture, so two captures over one route do not publish a linkable
//      commitment).
//   2. Before the receipt is written, its canonical serialization is scanned
//      for every routeId, endpoint, and endpoint host this run actually
//      touched, plus generic route-shaped patterns. A hit FAILS the checker.
//      The exported verifier re-runs the generic scan on any receipt from any
//      source.
//
// The alias NAMES are public study vocabulary (they are declared openly in the
// frozen kernel and appear as the keys of aliasCommitments). What is sealed is
// the alias -> route MAP and, separately, which adapter produced a given
// captured response. So the alias-namespace scan is scoped to the
// capturedResponseRecords and dropInEligibility subtrees, where an alias would
// be a genuine disclosure, and is deliberately NOT applied to the assignment
// commitment whose alias keys are frozen public vocabulary.
//
// ---------------------------------------------------------------------------
// FROZEN-SOURCE BINDING (why this checker re-derives instead of trusting)
// ---------------------------------------------------------------------------
// verifyAliasAssignmentCommitment is SELF-CONSISTENCY plus anti-leak, as its
// own JSDoc states: it asserts kernelSourceHash and assignmentManifestHash are
// well-formed sha256 hex, never that they are TRUE. Probed directly before
// this checker was written: a commitment carrying kernelSourceHash
// '0'.repeat(64) — and separately a false assignmentManifestHash — with every
// other field valid and the receiptHash recomputed returns {ok:true}. A
// commitment therefore proves it REMEMBERS a hash, not that the hash matches
// the frozen kernel. Since source/proofs/model-village-trial-kernel.hs is a
// live tracked file in a tree with concurrent lanes, a block sealed against a
// drifted kernel would be cryptographically perfect and evidentially void.
//
// So this checker re-derives kernelSourceHash and all three
// assignmentManifestHashes from the frozen `.hs` through the shipped extractor
// on every run, and verifyAliasCustodyReceipt does the same whenever it is
// given a hololandRoot, failing with a distinct frozen-source-drift reason.
// Without a hololandRoot the binding cannot be performed and is NOT silently
// assumed — see the limit stated on the verifier.
//
// ---------------------------------------------------------------------------
// PUBLIC-RECEIPT RULE (spec lines 288-289)
// ---------------------------------------------------------------------------
// Raw model text never reaches this receipt. Two consequences that look like
// details but are not:
//   - A capture failure is receipted as a CLOSED-SET outcome enum, never as
//     the caught error message. Node's JSON.parse errors quote the offending
//     input, so echoing a derivation failure would export raw model bytes into
//     a durable public artifact.
//   - A record whose parsedProposal projection is not bounded
//     (BOUNDED_PARSED_PROPOSAL) is NOT embedded. The raw bytes stay sealed in
//     custody and the capture is receipted as
//     'derivation-projection-unbounded'. The record is never truncated into a
//     half-true artifact.
//
// ---------------------------------------------------------------------------
// CLAIM BOUNDARY
// ---------------------------------------------------------------------------
// Not a live study run. Not Phase 1 admission or readiness. Not blinded
// EVALUATION. Not post-lock presentation execution — profile admission is the
// presentation lane's declarative contract in
// source/domains/agents/model-village-art-direction.hsplus, which itself
// declares postlockPolicyExecutionStatus
// "declarative_source_contract_not_observed_runtime_execution". Not
// family-to-model attribution. And NO frozen-plan swap: drop-in eligibility is
// PROVEN with an executable verifier (dropInEligibilityProven true /
// frozenPlanSwapPerformed false); swapping records into the frozen Phase 0B
// plan changes planExecutionSourceHash and is a study-lane admission decision,
// not an engineering one.

import { randomBytes, randomInt } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';
import {
  certifyLockedAdapterRoute,
  executeCertifiedModelTurn,
  loadAdapterCustodyDrillManifest,
} from './model-village-adapter-runtime.mjs';
import { createSealedCustodyStore } from './model-village-custody-store.mjs';
import {
  ALIAS_ASSIGNMENT_COMMITMENT_SCHEMA,
  issueUnblindingReceipt,
  loadFrozenAssignmentMatrix,
  sealAliasAssignment,
  verifyAliasAssignmentCommitment,
  verifyUnblindingReceipt,
} from './model-village-alias-vault.mjs';
import {
  captureResponseUnderCustody,
  sealAliasCommitment,
  verifyCapturedResponseRecord,
  verifyDropInEligibility,
} from './model-village-captured-response-custody.mjs';

export const ALIAS_CUSTODY_RECEIPT_SCHEMA =
  'hololand.model-village-alias-custody.v1';
/**
 * The terminal observation root this checker derives for its unblinding
 * drill. See buildTerminalCommitment: it is a CUSTODY-LANE root over this
 * run's own receipts, deliberately schema-tagged so it can never be mistaken
 * for a verified V4 study run receipt or for the presentation lane's richer
 * VerifiedTerminalCommitment struct.
 */
export const ALIAS_CUSTODY_TERMINAL_OBSERVATION_SCHEMA =
  'hololand.model-village-alias-custody-terminal-observation.v1';

const DEFAULT_OUTPUT = path.join(
  '.tmp', 'hololand', 'model-village', 'alias-custody-receipt.json',
);
const DEFAULT_STORE_PARENT = path.join(
  '.tmp', 'hololand', 'model-village', 'alias-custody',
);
const OPERATOR = 'mv-b3-alias-custody-checker';
const RETENTION_POLICY_ID = 'mv-b3-alias-custody-retention-v1';
const RETENTION_DESCRIPTION =
  'MV-B3 alias custody drill store: sealed alias-to-route assignment, raw '
  + 'and canonical captured responses, and route disclosures; deletable at '
  + 'any time via content-key destruction with a nonidentifying tombstone.';

const BLOCK_ID = 'block1';
const BLOCK_IDS = Object.freeze(['block1', 'block2', 'block3']);
const STUDY_ALIASES = Object.freeze(['adapter_a', 'adapter_b', 'adapter_c']);
const REQUIRED_RESIDENT_ORDER = Object.freeze(['resident-01', 'resident-02']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Two-person rule authorizers for the DRILL unblinding. They carry `drill` on
 * their face so this artifact can never be mistaken for a real study
 * unblinding, which names its actual protocol lead and data custodian.
 */
const DRILL_PROTOCOL_LEAD = 'mv-b3-drill-protocol-lead';
const DRILL_DATA_CUSTODIAN = 'mv-b3-drill-data-custodian';

/**
 * Public-receipt bound on the derived proposal projection. The vocabulary's
 * legal actions/targets are snake_case identifiers and amount is a small
 * integer, so a vocabulary-shaped parsedProposal always matches. A model that
 * emits prose into `action` or `target` does NOT, and its record is refused
 * embedding rather than exporting model prose into a durable public artifact.
 */
const BOUNDED_PARSED_PROPOSAL = /^[A-Za-z0-9_.:-]{1,120}$/;

/** Closed outcome set for one capture attempt. Never a caught error message. */
const CAPTURE_OUTCOMES = Object.freeze([
  'capture-error',
  'capture-refused',
  'derivation-disagreement',
  'derivation-projection-unbounded',
  'emitted-proposal-has-no-action',
  'emitted-proposal-not-json-object',
  'emitted-proposal-not-strict-json',
  'no-response-content',
  'record-issued',
  'turn-not-completed',
]);

const DROP_IN_OUTCOMES = Object.freeze([
  'eligible',
  'not-attempted-capture-incomplete',
  'not-eligible-checks-failed',
]);

/** The four unblinding drills, in issuance order, with their legal verdict. */
const UNBLINDING_DRILL_PLAN = Object.freeze([
  Object.freeze({ drill: 'missing-terminal-commitment', expectedFailNeutral: true }),
  Object.freeze({ drill: 'mismatched-terminal-commitment', expectedFailNeutral: true }),
  Object.freeze({ drill: 'incomplete-authorization', expectedFailNeutral: true }),
  Object.freeze({ drill: 'authorized-reveal', expectedFailNeutral: false }),
]);

/**
 * Generic route-shaped patterns for the exported verifier, which cannot know
 * which routes a past run touched. Every pattern is UNANCHORED on purpose: an
 * anchored rule only catches a routeId that is the whole value and misses a
 * leak that concatenates one into a longer string. No legitimate MV-B3 public
 * value (schemas, engine ids, blockIds, sha256 hex, ISO timestamps, resident
 * ids, bounded enums) contains any of these fragments.
 */
const ROUTE_SHAPED_PATTERNS = Object.freeze([
  /sovereign-/i,
  /:\/\//,
  /https?:/i,
  /localhost/i,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
]);
/** The sealed adapter-alias namespace, scanned only where it is a disclosure. */
const ADAPTER_ALIAS_PATTERN = /adapter[_-][a-z0-9]/i;

const RECEIPT_KEYS = Object.freeze([
  'aliasAssignmentCommitment',
  'assignmentManifestHashes',
  'capturedResponseRecords',
  'claimBoundary',
  'custodyAccessLogEntryCount',
  'dropInEligibility',
  'generatedAt',
  'kernelSourceHash',
  'receiptHash',
  'schema',
  'storeManifestHash',
  'unblindingDrills',
]);
const CAPTURED_RECORD_ENTRY_KEYS = Object.freeze([
  'aliasCommitmentRef',
  'captureOutcome',
  'proposalDecision',
  'record',
  'residentId',
  'responseId',
  'turnCompleted',
  'turnErrorClass',
  'turnReceiptHash',
]);
const DROP_IN_KEYS = Object.freeze([
  'attempted',
  'checks',
  'eligible',
  'failedCheckNames',
  'outcome',
]);
const DROP_IN_CHECK_KEYS = Object.freeze(['detail', 'name', 'ok']);
const UNBLINDING_DRILL_KEYS = Object.freeze([
  'drill',
  'expectedFailNeutral',
  'receipt',
  'receiptCarriesNoMapping',
  'receiptVerified',
  'revealedMatchesSealed',
]);
const CLAIM_BOUNDARY_KEYS = Object.freeze([
  'blindedEvaluationClaimed',
  'dropInEligibilityProven',
  'dropInSwapAdmitted',
  'familyToModelAttributionClaimed',
  'frozenPlanSwapPerformed',
  'frozenSourceRederivedFromCanonicalSource',
  'liveSovereignRouteExercised',
  'liveStudyRunClaimed',
  'notObserved',
  'observed',
  'phase1AdmissionClaimed',
  'postLockPresentationExecuted',
  'productionValidatorCustodyClaimed',
]);
/**
 * Every flag this lane must NEVER claim, pinned to its only legal value.
 *
 * dropInEligibilityProven is pinned TRUE because the executable verifier runs
 * on every invocation — providing that proof is what this slice does; whether
 * a given pair WAS eligible is reported separately in dropInEligibility.
 *
 * frozenSourceRederivedFromCanonicalSource is pinned TRUE because the checker
 * re-derives kernelSourceHash and every block's assignmentManifestHash from
 * the frozen `.hs` before sealing; a receipt that cannot assert it was not
 * produced by this lane.
 */
const PINNED_CLAIM_BOUNDARY_VALUES = Object.freeze({
  blindedEvaluationClaimed: false,
  dropInEligibilityProven: true,
  dropInSwapAdmitted: false,
  familyToModelAttributionClaimed: false,
  frozenPlanSwapPerformed: false,
  frozenSourceRederivedFromCanonicalSource: true,
  liveStudyRunClaimed: false,
  phase1AdmissionClaimed: false,
  postLockPresentationExecuted: false,
  productionValidatorCustodyClaimed: false,
});

export class AliasCustodyCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AliasCustodyCheckError';
  }
}

function fail(message) {
  throw new AliasCustodyCheckError(message);
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
    const absent = expected.filter((key) => !actual.includes(key));
    const unexpected = actual.filter((key) => !expected.includes(key));
    fail(
      `${label} keys differ; absent=${canonicalJson(absent)} `
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

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean`);
}

function normalizePath(root, target) {
  const relative = path.relative(root, target);
  const chosen = relative.startsWith('..') ? target : relative;
  return chosen.split(path.sep).join('/');
}

function drillTimestamp() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-p${process.pid}`;
}

function countJsonlLines(filePath) {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .length;
}

// ---------------------------------------------------------------------------
// Frozen-source binding.
// ---------------------------------------------------------------------------

/**
 * Re-derives the frozen matrix from canonical `.hs` and asserts the latin
 * square independently. extractCanonicalAdapterMatrix already asserts it
 * upstream; re-deriving here means the receipt's "latin square verified"
 * claim rests on this checker's OWN observation rather than on trust in an
 * upstream comment (D.131 / DT-24: a check that reads only a record verifies
 * that someone wrote the record).
 */
function loadBoundFrozenMatrix(hololandRoot) {
  const matrixBundle = loadFrozenAssignmentMatrix({ hololandRoot });
  const personaSeats = matrixBundle.matrix.personasAndSeats;
  for (let index = 0; index < personaSeats.length; index += 1) {
    const across = BLOCK_IDS.map(
      (blockId) => matrixBundle.matrix.blocks[blockId][index],
    );
    if (canonicalJson([...across].sort()) !== canonicalJson([...STUDY_ALIASES])) {
      fail(
        `frozen matrix latin square does not hold at persona/seat index ${index}: `
        + 'each persona/seat must receive each adapter exactly once across the '
        + 'three blocks',
      );
    }
  }
  return matrixBundle;
}

/**
 * Binds a receipt's frozen-source pins to the canonical `.hs` on disk.
 * Returns a failure reason string, or null when the pins are true.
 */
function frozenSourceDriftReason(receipt, hololandRoot) {
  let matrixBundle;
  try {
    matrixBundle = loadBoundFrozenMatrix(hololandRoot);
  } catch (error) {
    return `frozen source could not be re-derived: ${error?.message ?? String(error)}`;
  }
  if (receipt.kernelSourceHash !== matrixBundle.kernelSourceHash) {
    return 'frozen-source-drift: receipt.kernelSourceHash does not match the '
      + 'canonical trial kernel on disk';
  }
  for (const blockId of BLOCK_IDS) {
    if (
      receipt.assignmentManifestHashes?.[blockId]
      !== matrixBundle.assignmentManifestHashByBlock[blockId]
    ) {
      return `frozen-source-drift: receipt.assignmentManifestHashes.${blockId} `
        + 'does not re-derive from the canonical trial kernel on disk';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Blinding-law scanners.
// ---------------------------------------------------------------------------

/**
 * Walks every key and string value and reports the first PATH whose value
 * matches a pattern. The offending VALUE is never returned — echoing it into
 * an error message or a log line is the very leak being detected.
 */
function findPatternHit(value, patterns, label) {
  const visit = (node, nodeLabel) => {
    if (typeof node === 'string') {
      for (const pattern of patterns) {
        if (pattern.test(node)) return nodeLabel;
      }
      return null;
    }
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        const hit = visit(node[index], `${nodeLabel}[${index}]`);
        if (hit) return hit;
      }
      return null;
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        const keyHit = visit(key, `${nodeLabel} key`);
        if (keyHit) return keyHit;
        const hit = visit(node[key], `${nodeLabel}.${key}`);
        if (hit) return hit;
      }
    }
    return null;
  };
  return visit(value, label);
}

/**
 * Emit-time fence. Unlike the generic verifier scan, this run KNOWS which
 * routeIds, endpoints, and hosts it touched, so it searches for those exact
 * needles too. Case-insensitive substring, so a concatenated leak
 * (`sealed-by-<routeId>`) cannot slip past a prefix rule.
 */
function findExactRouteNeedle(serialized, needles) {
  const haystack = serialized.toLowerCase();
  for (const needle of needles) {
    if (needle.length > 0 && haystack.includes(needle)) return needle;
  }
  return null;
}

function routeIdentityNeedles(routes) {
  const needles = new Set();
  for (const route of routes) {
    for (const candidate of [
      route.routeId, route.declaredEndpoint, route.endpointUsed,
    ]) {
      if (typeof candidate !== 'string' || candidate.length === 0) continue;
      needles.add(candidate.toLowerCase());
      try {
        const parsed = new URL(candidate);
        needles.add(parsed.host.toLowerCase());
        needles.add(parsed.hostname.toLowerCase());
      } catch {
        // routeIds are not URLs; the raw-string needle above still applies.
      }
    }
  }
  return [...needles];
}

// ---------------------------------------------------------------------------
// --skip-live stub: one in-process OpenAI-compatible node:http server per
// route, bound to the loopback interface on an ephemeral port — the same
// offline convention already shipped in the MV-B1 and MV-B2 checkers. The
// canonical frozen drill source declares the SOVEREIGN production route as a
// loopback HoloServe endpoint, so loopback is the real transport shape this
// lane certifies against, not a stand-in for a remote service.
//
// The stub's own base URL is derived from server.address() AFTER binding
// rather than assembled from an assumed host literal: the address the kernel
// actually bound is the truthful one, and deriving it keeps the stub correct
// on hosts where the loopback family differs.
//
// The chat stub answers the FIRST turn with a vocabulary-valid contribution
// and the SECOND with a denied external message, mirroring the two shapes the
// frozen Phase 0B fixtures carry. That is what makes the offline lane produce
// two DISTINCT responses over one route, which the drop-in verifier requires.
// The stub replaces only the model: transport, certification, custody, and
// every receipt chain are the real shipped modules.
// ---------------------------------------------------------------------------

/** Loopback bind target for the offline stub servers (never a public interface). */
const STUB_BIND_HOST = '127.0.0.1';

const STUB_TURN_CONTENTS = Object.freeze([
  JSON.stringify({
    action: 'contribute_water',
    amount: 1,
    reason: 'the cistern is low and my allotment can carry the shortfall',
    target: 'commons_cistern',
  }),
  JSON.stringify({
    action: 'send_external_message',
    target: 'outside_village',
  }),
]);

function startCertificationStub(route) {
  const { routeId } = route;
  const state = { chatTurns: 0 };
  const server = createServer((req, res) => {
    const respond = (status, payload) => {
      const body = Buffer.from(JSON.stringify(payload), 'utf8');
      res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': body.length,
      });
      res.end(body);
    };
    req.on('data', () => {});
    req.on('end', () => {
      if (req.method === 'GET' && req.url === route.healthPath) {
        respond(200, {
          process_instance_id: `stub-${routeId}`,
          status: 'ok',
          stub: true,
          version: `0.0.0-stub-${routeId}`,
        });
        return;
      }
      if (req.method === 'GET' && req.url === route.modelsPath) {
        respond(200, {
          data: [{ id: `stub-model-${routeId}`, object: 'model' }],
          object: 'list',
        });
        return;
      }
      if (req.method === 'POST' && req.url === route.chatPath) {
        const content = STUB_TURN_CONTENTS[
          state.chatTurns % STUB_TURN_CONTENTS.length
        ];
        state.chatTurns += 1;
        respond(200, {
          choices: [{
            finish_reason: 'stop',
            index: 0,
            message: { content, role: 'assistant' },
          }],
          id: `chatcmpl-stub-${routeId}-${state.chatTurns}`,
          model: `stub-model-${routeId}`,
          object: 'chat.completion',
          usage: { completion_tokens: 24, prompt_tokens: 96, total_tokens: 120 },
        });
        return;
      }
      respond(404, { error: 'not found' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, STUB_BIND_HOST, () => {
      // Truthful endpoint: whatever the kernel actually bound, not an assumption.
      const bound = server.address();
      const endpoint = new URL(`http://${bound.address}:${bound.port}`).origin;
      resolve({
        endpoint,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Alias -> route assignment (the sealed secret).
// ---------------------------------------------------------------------------

/**
 * Draws the alias -> route assignment with a CSPRNG.
 *
 * WHY THIS IS NOT A LOOP INDEX. The first version of this checker assigned
 * `certifiedRoutes[i % certifiedRoutes.length]` in the frozen route order. That
 * made the sealed mapping a DETERMINISTIC FUNCTION OF PUBLIC SOURCE: this file
 * is tracked, the route order is fixed public data in the frozen `.hs`
 * manifest, and the emitted receipt discloses how many routes certified — so
 * any reader could recompute the whole "sealed" mapping exactly, and the
 * receipt's own authorized-reveal drill then confirmed it. The salt was doing
 * no work whatever for that artifact (see the two preconditions stated in the
 * alias vault's HIDING LIMIT). A salted commitment only hides a mapping the
 * reader cannot otherwise derive, so the mapping must be DRAWN, not computed.
 *
 * Shape preserved from the deterministic version, deliberately: the draw is a
 * SURJECTION onto the certified routes, so every certified route is used at
 * least once and distinctRouteCount stays equal to the number of certified
 * routes (which the receipt states truthfully either way).
 *
 * RESIDUAL, stated rather than hidden: with three aliases and n certified
 * routes the candidate space is only the surjections from 3 aliases onto n
 * routes (6 when n is 2). Randomization removes DERIVABILITY, not the small
 * candidate space; confirming a guess still requires the sealed salt, which is
 * exactly the reduction the vault claims. The receipt says so in its claim
 * boundary.
 *
 * @param {string[]} routeIds certified routeIds, at least one
 * @returns {Record<string, string>} alias -> routeId
 */
export function drawAliasRouteAssignment(routeIds) {
  if (!Array.isArray(routeIds) || routeIds.length === 0) {
    fail('an alias assignment needs at least one certified route');
  }
  const distinct = [...new Set(routeIds)];
  if (distinct.length > STUDY_ALIASES.length) {
    fail(
      'more distinct certified routes than study aliases; the assignment '
      + 'cannot be a surjection and the choice is not this checker\'s to make',
    );
  }
  // Fisher-Yates over the aliases with crypto.randomInt (CSPRNG, unbiased).
  const shuffledAliases = [...STUDY_ALIASES];
  for (let index = shuffledAliases.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    const held = shuffledAliases[index];
    shuffledAliases[index] = shuffledAliases[swap];
    shuffledAliases[swap] = held;
  }
  const assignment = {};
  // Cover every certified route exactly once first (guarantees the surjection),
  // then draw uniformly for the aliases that remain.
  shuffledAliases.forEach((alias, index) => {
    assignment[alias] = index < distinct.length
      ? distinct[index]
      : distinct[randomInt(distinct.length)];
  });
  // Canonical key order; the VALUES are the secret, the keys are public.
  return Object.fromEntries(
    STUDY_ALIASES.map((alias) => [alias, assignment[alias]]),
  );
}

// ---------------------------------------------------------------------------
// Capture.
// ---------------------------------------------------------------------------

/**
 * Classifies a capture failure into the CLOSED outcome set WITHOUT echoing the
 * caught message. Node's JSON.parse errors quote the offending input, so a
 * derivation failure message can carry raw model bytes; matching stable
 * substrings and discarding the message is the only safe projection.
 */
function classifyCaptureError(error) {
  if (error?.name !== 'ModelVillageCapturedResponseCustodyError') {
    return 'capture-error';
  }
  const message = String(error.message ?? '');
  if (message.includes('carries no choices[0].message.content')) {
    return 'no-response-content';
  }
  if (message.includes('is not strict JSON')) return 'emitted-proposal-not-strict-json';
  if (message.includes('is not a JSON object')) return 'emitted-proposal-not-json-object';
  if (message.includes('has no string action')) return 'emitted-proposal-has-no-action';
  if (message.includes('derive different proposals')) return 'derivation-disagreement';
  return 'capture-refused';
}

/**
 * One blinded capture. Returns the bounded public entry plus the in-memory
 * record (used by the drop-in verifier and the terminal observation root).
 *
 * A FRESH 32-byte routeCommitmentSalt per capture: with a shared salt, two
 * captures over one route would publish an IDENTICAL routeCommitment and
 * disclose the very pairing the blind exists to hide.
 *
 * The turnExecutor wrapper exists so a derivation refusal — which throws AFTER
 * the provider turn is already receipted and sealed — still reports the turn's
 * bounded evidence instead of losing it with the thrown error.
 */
async function captureBlindedResponse({
  store,
  route,
  certification,
  drill,
  residentId,
  responseId,
  aliasCommitmentRef,
  priorReceiptHash,
}) {
  const observed = { turnReceipt: null };
  const turnExecutor = async (args) => {
    const turnReceipt = await executeCertifiedModelTurn(args);
    observed.turnReceipt = turnReceipt;
    return turnReceipt;
  };
  const entryFor = (captureOutcome, turnReceipt, record) => ({
    entry: {
      aliasCommitmentRef,
      captureOutcome,
      proposalDecision: turnReceipt?.proposalDecision ?? null,
      record,
      residentId,
      responseId,
      turnCompleted: turnReceipt?.turnCompleted === true,
      turnErrorClass: turnReceipt?.errorClass ?? null,
      // NULL ON PURPOSE, and it must stay null while this lane captures
      // blinded. The MV-B1 turn receipt's digest is taken over a body that
      // embeds the routeId, the endpoint and the raw response hash, so
      // publishing it here would re-expose exactly the replay-and-compare
      // route oracle the blinded record nulls (see the blinding law in
      // scripts/model-village-captured-response-custody.mjs). The record's
      // salted turnReceiptCommitment is the public binding; the true hash is
      // held in memory for the terminal observation root and sealed in the
      // route disclosure for the key-holder.
      turnReceiptHash: null,
    },
    record,
    turnReceiptHash: turnReceipt?.receiptHash ?? null,
  });

  try {
    const { record, turnReceipt } = await captureResponseUnderCustody({
      custodyStore: store,
      operator: OPERATOR,
      route,
      certification,
      drill,
      residentId,
      responseId,
      priorReceiptHash,
      blinded: true,
      routeCommitmentSalt: randomBytes(32).toString('hex'),
      aliasCommitmentRef,
      turnExecutor,
    });
    if (record === null) {
      return entryFor('turn-not-completed', turnReceipt, null);
    }
    if (!BOUNDED_PARSED_PROPOSAL.test(String(record.parsedProposal))) {
      // The raw bytes remain sealed in custody; the PUBLIC receipt refuses to
      // carry a model-chosen unbounded string. Never truncated.
      return entryFor('derivation-projection-unbounded', turnReceipt, null);
    }
    return entryFor('record-issued', turnReceipt, record);
  } catch (error) {
    return entryFor(classifyCaptureError(error), observed.turnReceipt, null);
  }
}

// ---------------------------------------------------------------------------
// Terminal commitment for the unblinding drill.
// ---------------------------------------------------------------------------

/**
 * Derives the terminal observation root this run actually has.
 *
 * HONEST PROVENANCE: this is a CUSTODY-LANE root over this run's own sealed
 * receipts (the alias assignment commitment plus the ordered captured-response
 * and turn receipt hashes). It is NOT a verified V4 study run receipt, and it
 * is NOT the presentation lane's richer 12-field VerifiedTerminalCommitment
 * (source/domains/agents/model-village-art-direction.hsplus lines 748-760),
 * which adds verified / canonicalHashVerified / signature / signatureVerified /
 * signerId / trustedSigner / finalObservationRoot / failNeutral. The four
 * fields here are exactly the binding the alias vault requires, using that
 * lane's own field names so this lifts without a rename. The schema tag inside
 * canonicalHash's preimage keeps the provenance non-confusable.
 */
function buildTerminalCommitment({ commitment, capturedEntries, turnReceiptHashes }) {
  // The turn receipt hashes ride the PREIMAGE only — they are held in memory,
  // never published (see entryFor). The resulting canonicalHash is safe to
  // publish because its preimage also carries commitment.receiptHash, which
  // depends on the sealed salt and is therefore not enumerable.
  const canonicalHash = canonicalDigest({
    assignmentCommitmentReceiptHash: commitment.receiptHash,
    capturedResponseReceiptHashes: capturedEntries.map(
      (entry) => entry.record?.receiptHash ?? null,
    ),
    schema: ALIAS_CUSTODY_TERMINAL_OBSERVATION_SCHEMA,
    turnReceiptHashes: [...turnReceiptHashes],
  });
  return Object.freeze({
    assignmentManifestHash: commitment.assignmentManifestHash,
    canonicalHash,
    commitmentId: `mv-b3-${BLOCK_ID}-terminal-observation`,
    runId: `mv-b3-${BLOCK_ID}`,
  });
}

// ---------------------------------------------------------------------------
// Drill execution.
// ---------------------------------------------------------------------------

export async function runAliasCustodyDrill({
  root = process.cwd(),
  output = DEFAULT_OUTPUT,
  storeRoot = null,
  skipLive = false,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const failures = [];

  // (a) Frozen matrix (re-derived + latin-square verified) and the MV-B1
  // drill manifest.
  const matrixBundle = loadBoundFrozenMatrix(resolvedRoot);
  const bundle = await loadAdapterCustodyDrillManifest({ hololandRoot: resolvedRoot });

  // (b) Fresh sealed custody store.
  const storeParent = storeRoot
    ? path.resolve(resolvedRoot, storeRoot)
    : path.resolve(resolvedRoot, DEFAULT_STORE_PARENT, drillTimestamp());
  const primaryStoreRoot = path.join(storeParent, 'store');
  const store = createSealedCustodyStore({
    rootDir: primaryStoreRoot,
    runLabel: 'mv-b3-alias-custody-drill',
    operator: OPERATOR,
    retentionPolicy: {
      description: RETENTION_DESCRIPTION,
      frozenAt: new Date().toISOString(),
      policyId: RETENTION_POLICY_ID,
    },
  });

  let receipt = null;
  let resolvedOutput = path.resolve(resolvedRoot, output);
  const stubs = [];
  const routeRuntime = [];

  try {
    // (c) Certify the declared sovereign routes through MV-B1.
    for (const route of bundle.routes) {
      let effectiveRoute = { ...route, ceilings: { ...route.ceilings } };
      if (skipLive) {
        const stub = await startCertificationStub(route);
        stubs.push(stub);
        effectiveRoute = { ...effectiveRoute, endpoint: stub.endpoint };
      }
      const entry = {
        certification: null,
        certificationError: null,
        declaredEndpoint: route.endpoint,
        endpointUsed: effectiveRoute.endpoint,
        required: route.required,
        route: effectiveRoute,
        routeId: route.routeId,
      };
      try {
        entry.certification = await certifyLockedAdapterRoute({
          route: effectiveRoute,
          drill: bundle,
          custodyStore: store,
          operator: OPERATOR,
          priorReceiptHash: bundle.manifestHash,
        });
      } catch (error) {
        entry.certificationError = error?.message ?? String(error);
      }
      if (route.required) {
        if (!entry.certification) {
          failures.push(
            `required route certification errored: ${entry.certificationError}`,
          );
        } else if (entry.certification.certified !== true) {
          failures.push(
            `required route did not certify (${entry.certification.failureReason})`,
          );
        }
      }
      routeRuntime.push(entry);
    }

    const certifiedRoutes = routeRuntime.filter(
      (entry) => entry.certification?.certified === true,
    );
    if (certifiedRoutes.length === 0) {
      fail('no declared sovereign route certified; refusing to seal an assignment');
    }

    // (d) Seal the block1 alias assignment. The mapping is DRAWN with a CSPRNG
    // (see drawAliasRouteAssignment) — a mapping computed from this tracked
    // file and the public route order would be recoverable by any reader of
    // the receipt, and the salt would be hiding nothing. With fewer certified
    // routes than study aliases the assignment MUST reuse a route; reuse is an
    // explicit, receipted engineering-lane choice (allowRouteReuse), never a
    // silent one, and the commitment then states routeReuseDeclared /
    // distinctRouteCount truthfully.
    const aliasRouteMap = drawAliasRouteAssignment(
      certifiedRoutes.map((entry) => entry.routeId),
    );
    const commitment = sealAliasAssignment({
      custodyStore: store,
      operator: OPERATOR,
      blockId: BLOCK_ID,
      aliasRouteMap,
      matrixBundle,
      certifications: certifiedRoutes.map((entry) => entry.certification),
      allowRouteReuse: true,
      priorReceiptHash: bundle.manifestHash,
    });
    const commitmentCheck = verifyAliasAssignmentCommitment(commitment);
    if (!commitmentCheck.ok) {
      failures.push(
        `alias assignment commitment did not verify: ${commitmentCheck.failureReason}`,
      );
    }

    // (e) Two blinded captures, resident-01 then resident-02, each routed
    // through the adapter the FROZEN block1 assignment gives that seat (both
    // seats carry the same alias in block1 — that is the frozen matrix's own
    // allocation, not a checker choice).
    const capturedEntries = [];
    const capturedRecords = [];
    // In-memory only: the true turn receipt hashes never reach the receipt.
    const capturedTurnReceiptHashes = [];
    let chainHash = commitment.receiptHash;
    for (let index = 0; index < REQUIRED_RESIDENT_ORDER.length; index += 1) {
      const residentId = REQUIRED_RESIDENT_ORDER[index];
      const adapterAlias = matrixBundle.matrix.blocks[BLOCK_ID][index];
      const routeId = aliasRouteMap[adapterAlias];
      const runtime = certifiedRoutes.find((entry) => entry.routeId === routeId);
      if (!runtime) {
        fail('sealed assignment references a route with no live runtime handle');
      }
      const aliasCommitmentRef = `mv-b3-${BLOCK_ID}-alias-ref-0${index + 1}`;
      // The alias itself is written ONLY into encrypted custody. The public
      // record carries the opaque ref; only the sealed key-holder can resolve
      // it back to an adapter.
      await sealAliasCommitment({
        custodyStore: store,
        aliasCommitmentRef,
        adapterAlias,
        salt: randomBytes(32).toString('hex'),
      });
      const captured = await captureBlindedResponse({
        store,
        route: runtime.route,
        certification: runtime.certification,
        drill: bundle,
        residentId,
        responseId: `mv-b3-${BLOCK_ID}-response-0${index + 1}`,
        aliasCommitmentRef,
        priorReceiptHash: chainHash,
      });
      capturedEntries.push(captured.entry);
      capturedRecords.push(captured.record);
      capturedTurnReceiptHashes.push(captured.turnReceiptHash);
      if (captured.record) chainHash = captured.record.receiptHash;
      else if (captured.turnReceiptHash) {
        chainHash = captured.turnReceiptHash;
      }
    }

    for (const entry of capturedEntries) {
      if (entry.record === null) continue;
      const check = verifyCapturedResponseRecord(entry.record);
      if (!check.ok) {
        failures.push(`captured-response record did not verify: ${check.failureReason}`);
      }
      if (entry.record.routeIdentityBlinded !== true) {
        failures.push('captured-response record was not issued in blinded mode');
      }
    }

    // Executable drop-in eligibility over the ordered pair. A live sovereign
    // model that emits prose is a LEGITIMATE not-eligible outcome and is
    // receipted as such — never massaged into eligibility.
    let dropInEligibility;
    if (capturedRecords.every((record) => record !== null)) {
      const result = verifyDropInEligibility({
        records: capturedRecords,
        custodyStore: store,
      });
      dropInEligibility = {
        attempted: true,
        checks: result.checks.map((check) => ({
          detail: String(check.detail ?? ''),
          name: check.name,
          ok: check.ok === true,
        })),
        eligible: result.eligible === true,
        failedCheckNames: result.checks
          .filter((check) => check.ok !== true)
          .map((check) => check.name),
        outcome: result.eligible === true ? 'eligible' : 'not-eligible-checks-failed',
      };
    } else {
      dropInEligibility = {
        attempted: false,
        checks: [],
        eligible: false,
        failedCheckNames: [],
        outcome: 'not-attempted-capture-incomplete',
      };
    }
    // The offline lane is fully deterministic (the stub IS the model), so a
    // non-eligible pair there is a defect, not a finding. The live lane
    // reports whatever the sovereign model actually produced.
    if (skipLive && dropInEligibility.eligible !== true) {
      failures.push(
        'offline stub lane did not produce a drop-in-eligible pair: '
        + `${canonicalJson(dropInEligibility.failedCheckNames)}`,
      );
    }

    // (f) Unblinding drills.
    const terminalCommitment = buildTerminalCommitment({
      capturedEntries,
      commitment,
      turnReceiptHashes: capturedTurnReceiptHashes,
    });
    const mismatchedTerminalCommitment = {
      ...terminalCommitment,
      // A REAL hash for a DIFFERENT frozen block: the vault must refuse to
      // unblind an assignment other than the one it committed to.
      assignmentManifestHash: matrixBundle.assignmentManifestHashByBlock.block2,
    };
    const fullAuthorization = {
      dataCustodian: DRILL_DATA_CUSTODIAN,
      protocolLead: DRILL_PROTOCOL_LEAD,
    };
    const drillInputs = [
      { authorization: fullAuthorization, terminalCommitment: null },
      { authorization: fullAuthorization, terminalCommitment: mismatchedTerminalCommitment },
      {
        authorization: { dataCustodian: null, protocolLead: DRILL_PROTOCOL_LEAD },
        terminalCommitment,
      },
      { authorization: fullAuthorization, terminalCommitment },
    ];
    const needles = routeIdentityNeedles(routeRuntime);
    const unblindingDrills = [];
    for (let index = 0; index < UNBLINDING_DRILL_PLAN.length; index += 1) {
      const plan = UNBLINDING_DRILL_PLAN[index];
      const input = drillInputs[index];
      const { receipt: drillReceipt, revealed } = issueUnblindingReceipt({
        custodyStore: store,
        operator: OPERATOR,
        commitment,
        terminalCommitment: input.terminalCommitment,
        authorization: input.authorization,
      });
      const verification = verifyUnblindingReceipt(drillReceipt);
      const serialized = canonicalJson(drillReceipt).toLowerCase();
      const receiptCarriesNoMapping =
        !STUDY_ALIASES.some((alias) => serialized.includes(alias))
        && findExactRouteNeedle(serialized, needles) === null;
      const revealedMatchesSealed = plan.expectedFailNeutral
        ? null
        : revealed !== null
          && canonicalJson(revealed) === canonicalJson(aliasRouteMap);
      unblindingDrills.push({
        drill: plan.drill,
        expectedFailNeutral: plan.expectedFailNeutral,
        receipt: drillReceipt,
        receiptCarriesNoMapping,
        receiptVerified: verification.ok === true,
        revealedMatchesSealed,
      });
      if (drillReceipt.failNeutral !== plan.expectedFailNeutral) {
        failures.push(
          `unblinding drill ${plan.drill} expected failNeutral `
          + `${plan.expectedFailNeutral} but issued ${drillReceipt.failNeutral}`,
        );
      }
      if (verification.ok !== true) {
        failures.push(
          `unblinding drill ${plan.drill} receipt did not verify: `
          + `${verification.failureReason}`,
        );
      }
      if (!receiptCarriesNoMapping) {
        failures.push(`unblinding drill ${plan.drill} receipt carries mapping material`);
      }
      if (plan.expectedFailNeutral) {
        if (revealed !== null) {
          failures.push(`unblinding drill ${plan.drill} revealed a mapping on a refusal`);
        }
      } else if (revealedMatchesSealed !== true) {
        failures.push(`unblinding drill ${plan.drill} did not reveal the sealed mapping`);
      }
    }

    // (g) Receipt.
    const storeManifestHash = canonicalDigest(store.getManifest());
    const custodyAccessLogEntryCount = countJsonlLines(
      path.join(primaryStoreRoot, 'access-log.jsonl'),
    );
    store.close();

    const claimBoundary = {
      observed: [
        'frozen mixed-assignment matrix re-derived from canonical `.hs` source with independent latin-square verification (each persona/seat receives each adapter exactly once across the three blocks)',
        'alias-to-route assignment DRAWN with a CSPRNG (not computed from this checker source or the public route order) and sealed in encrypted custody; the public commitment carries salted per-alias digests and no mapping',
        'certified-routes-only enforcement: every distinct route in the sealed assignment carries a verifying MV-B1 certification receipt, committed publicly as a salted digest over those receipt hashes and re-derived from the sealed record at unblinding',
        'real provider responses captured under sealed custody in blinded mode with provider-route and sampling evidence (spec lines 216-224); every digest whose preimage is the provider response bytes (raw response hash, raw custody address, turn receipt hash, chain link) is null in the public record and published only as a salted commitment, because a bare digest of those bytes is a replay-and-compare route oracle',
        'executable drop-in eligibility verification of the ordered captured pair against the frozen Phase 0B consumer contract',
        'two-person fail-neutral unblinding issuance: refusal on absent, mismatched, and incompletely authorized requests; reveal only under a bound terminal commitment and two distinct authorizers',
      ],
      notObserved: [
        'live study run',
        'Phase 1 admission or readiness',
        'blinded evaluation (behavioral blinding is explicitly not claimed)',
        'post-lock presentation execution (profile admission is the presentation lane declarative source contract)',
        'family-to-model attribution',
        'production validator custody',
        'a swap of custody-backed records into the frozen Phase 0B plan (planExecutionSourceHash is unchanged; the swap is a study-lane admission decision)',
        'a verified V4 study run receipt as the terminal commitment (the terminal observation root here is derived from this run own custody receipts)',
        'cryptographic two-person control: the authorization gate compares two distinct authorizer strings, it does not verify two independently held signing keys',
        'a fail-neutral refusal does not distinguish a policy refusal from an internal defect; the unblinding boundary swallows both by design',
        'information-theoretic hiding of the assignment: with three aliases over the certified routes the candidate space is only the surjections onto them (six over two routes), and distinctRouteCount is published, so randomization removes DERIVABILITY while confirming any guess still requires the sealed salt and therefore the custody key',
        'hiding of the study PAYLOAD: responseHash, canonicalResponseCustodyId and parsedProposal are digests or projections of the derived canonical proposal and are required public by the frozen Phase 0B hydration contract; they are route-independent, and payload-to-model inference is behavioral blinding, which this lane does not claim',
      ],
      liveSovereignRouteExercised: skipLive === false,
      ...PINNED_CLAIM_BOUNDARY_VALUES,
    };

    const unsigned = {
      aliasAssignmentCommitment: commitment,
      assignmentManifestHashes: { ...matrixBundle.assignmentManifestHashByBlock },
      capturedResponseRecords: capturedEntries,
      claimBoundary,
      custodyAccessLogEntryCount,
      dropInEligibility,
      generatedAt: new Date().toISOString(),
      kernelSourceHash: matrixBundle.kernelSourceHash,
      schema: ALIAS_CUSTODY_RECEIPT_SCHEMA,
      storeManifestHash,
      unblindingDrills,
    };
    receipt = { ...unsigned, receiptHash: canonicalDigest(unsigned) };

    // HARD MACHINE CHECK (the blinding law, enforced not asserted): with any
    // blinded record present, the emitted receipt must carry no routeId,
    // endpoint, or host this run touched, and no generic route-shaped string.
    const blindedPresent = capturedEntries.some(
      (entry) => entry.record?.routeIdentityBlinded === true,
    );
    if (blindedPresent) {
      if (findExactRouteNeedle(canonicalJson(receipt), needles) !== null) {
        // The offending value is not echoed — that would re-leak it.
        failures.push(
          'emitted receipt carries a route identity this run touched; blinded '
          + 'MV-B3 receipts carry commitments only (blinding law)',
        );
      }
      const patternHit = findPatternHit(receipt, ROUTE_SHAPED_PATTERNS, 'receipt');
      if (patternHit !== null) {
        failures.push(
          `emitted receipt carries a route-shaped string at ${patternHit}; `
          + 'blinded MV-B3 receipts carry commitments only (blinding law)',
        );
      }
      const aliasHit = findPatternHit(
        {
          capturedResponseRecords: receipt.capturedResponseRecords,
          dropInEligibility: receipt.dropInEligibility,
        },
        [ADAPTER_ALIAS_PATTERN],
        'receipt',
      );
      if (aliasHit !== null) {
        failures.push(
          `emitted receipt discloses the sealed adapter alias at ${aliasHit}; `
          + 'a captured response never names its adapter',
        );
      }
    }

    resolvedOutput = path.resolve(resolvedRoot, output);
    mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, `${JSON.stringify(receipt, null, 2)}\n`);

    // Self-verification binds the frozen source too: an emitted receipt whose
    // pins do not re-derive from the canonical `.hs` fails its own checker.
    const verification = verifyAliasCustodyReceipt(receipt, {
      hololandRoot: resolvedRoot,
    });
    if (!verification.ok) {
      failures.push(`emitted receipt failed self-verification: ${verification.failureReason}`);
    }
  } finally {
    for (const stub of stubs) await stub.close();
    // close() is idempotent; this releases the exclusive store lock on any
    // failure path so a later operator handle can open the store for audit.
    store.close();
  }

  if (failures.length > 0) {
    throw new AliasCustodyCheckError(
      `Model Village alias custody drill failed: ${failures.join('; ')}. `
      + `Receipt: ${resolvedOutput}`,
    );
  }

  return {
    receipt,
    output: resolvedOutput,
    storeRoot: normalizePath(resolvedRoot, primaryStoreRoot),
  };
}

// ---------------------------------------------------------------------------
// Receipt verification.
//
// LIMIT, stated plainly: this is closed-key SELF-CONSISTENCY plus nested
// receipt verification plus an anti-leak audit plus — when a hololandRoot is
// supplied — a FROZEN-SOURCE BINDING. It is NOT authenticity: nothing here is
// signed, so a party who can re-hash can produce a self-consistent receipt.
// Signature / signerId / trustedSigner belong to the presentation lane's typed
// contract and are not issued here.
//
// The frozen-source binding is the one check that reads the WORLD rather than
// the record. Without `hololandRoot` it cannot run, and this verifier does NOT
// silently assume it passed: an offline caller learns only that the receipt is
// internally coherent, which is strictly weaker. Pass the repository root
// whenever the canonical `.hs` is reachable.
// ---------------------------------------------------------------------------

export function verifyAliasCustodyReceipt(receipt, { hololandRoot = null } = {}) {
  try {
    assertExactKeys(receipt, RECEIPT_KEYS, 'alias custody receipt');
    if (receipt.schema !== ALIAS_CUSTODY_RECEIPT_SCHEMA) {
      fail(`receipt schema must be '${ALIAS_CUSTODY_RECEIPT_SCHEMA}'`);
    }
    assertNonEmptyString(receipt.generatedAt, 'receipt.generatedAt');
    assertSha256(receipt.kernelSourceHash, 'receipt.kernelSourceHash');
    assertSha256(receipt.storeManifestHash, 'receipt.storeManifestHash');
    if (
      !Number.isInteger(receipt.custodyAccessLogEntryCount)
      || receipt.custodyAccessLogEntryCount < 1
    ) {
      fail('receipt.custodyAccessLogEntryCount must be a positive integer');
    }

    assertExactKeys(
      receipt.assignmentManifestHashes,
      BLOCK_IDS,
      'receipt.assignmentManifestHashes',
    );
    for (const blockId of BLOCK_IDS) {
      assertSha256(
        receipt.assignmentManifestHashes[blockId],
        `receipt.assignmentManifestHashes.${blockId}`,
      );
    }

    // Alias assignment commitment: verified by the vault's own verifier
    // (closed keys, aggregates, recompute, anti-leak audit), then bound to
    // this receipt's frozen-source pins.
    const commitment = receipt.aliasAssignmentCommitment;
    const commitmentCheck = verifyAliasAssignmentCommitment(commitment);
    if (!commitmentCheck.ok) {
      fail(`receipt.aliasAssignmentCommitment invalid: ${commitmentCheck.failureReason}`);
    }
    if (commitment.schema !== ALIAS_ASSIGNMENT_COMMITMENT_SCHEMA) {
      fail('receipt.aliasAssignmentCommitment schema drifted');
    }
    if (commitment.kernelSourceHash !== receipt.kernelSourceHash) {
      fail('receipt.aliasAssignmentCommitment does not pin this receipt kernelSourceHash');
    }
    if (commitment.blockId !== BLOCK_ID) {
      fail(`receipt.aliasAssignmentCommitment must commit ${BLOCK_ID}`);
    }
    if (
      commitment.assignmentManifestHash
      !== receipt.assignmentManifestHashes[BLOCK_ID]
    ) {
      fail('receipt.aliasAssignmentCommitment assignmentManifestHash does not match the block');
    }

    // Captured-response records.
    if (
      !Array.isArray(receipt.capturedResponseRecords)
      || receipt.capturedResponseRecords.length !== REQUIRED_RESIDENT_ORDER.length
    ) {
      fail(
        'receipt.capturedResponseRecords must hold exactly '
        + `${REQUIRED_RESIDENT_ORDER.length} ordered entries`,
      );
    }
    let blindedPresent = false;
    receipt.capturedResponseRecords.forEach((entry, index) => {
      const label = `receipt.capturedResponseRecords[${index}]`;
      assertExactKeys(entry, CAPTURED_RECORD_ENTRY_KEYS, label);
      if (entry.residentId !== REQUIRED_RESIDENT_ORDER[index]) {
        fail(`${label}.residentId must be ${REQUIRED_RESIDENT_ORDER[index]}`);
      }
      assertNonEmptyString(entry.responseId, `${label}.responseId`);
      assertNonEmptyString(entry.aliasCommitmentRef, `${label}.aliasCommitmentRef`);
      if (!CAPTURE_OUTCOMES.includes(entry.captureOutcome)) {
        fail(`${label}.captureOutcome is outside the closed outcome set`);
      }
      assertBoolean(entry.turnCompleted, `${label}.turnCompleted`);
      if (entry.turnReceiptHash !== null) {
        assertSha256(entry.turnReceiptHash, `${label}.turnReceiptHash`);
      }
      for (const key of ['proposalDecision', 'turnErrorClass']) {
        if (entry[key] !== null) assertNonEmptyString(entry[key], `${label}.${key}`);
      }
      if (entry.record === null) {
        if (entry.captureOutcome === 'record-issued') {
          fail(`${label} declares record-issued but carries no record`);
        }
        return;
      }
      if (entry.captureOutcome !== 'record-issued') {
        fail(`${label} carries a record without declaring record-issued`);
      }
      const recordCheck = verifyCapturedResponseRecord(entry.record);
      if (!recordCheck.ok) {
        fail(`${label}.record invalid: ${recordCheck.failureReason}`);
      }
      if (entry.record.routeIdentityBlinded !== true) {
        fail(`${label}.record must be blinded (the study lane never publishes a route)`);
      }
      blindedPresent = true;
      for (const key of [
        'residentId', 'responseId', 'aliasCommitmentRef', 'turnReceiptHash',
      ]) {
        if (entry.record[key] !== entry[key]) {
          fail(`${label}.record ${key} does not bind this entry`);
        }
      }
      if (!BOUNDED_PARSED_PROPOSAL.test(String(entry.record.parsedProposal))) {
        fail(
          `${label}.record parsedProposal exceeds the public-receipt bounded `
          + 'projection; raw model text may not ride a durable receipt',
        );
      }
    });

    // Drop-in eligibility.
    const dropIn = receipt.dropInEligibility;
    assertExactKeys(dropIn, DROP_IN_KEYS, 'receipt.dropInEligibility');
    assertBoolean(dropIn.attempted, 'receipt.dropInEligibility.attempted');
    assertBoolean(dropIn.eligible, 'receipt.dropInEligibility.eligible');
    if (!DROP_IN_OUTCOMES.includes(dropIn.outcome)) {
      fail('receipt.dropInEligibility.outcome is outside the closed outcome set');
    }
    if (!Array.isArray(dropIn.checks)) {
      fail('receipt.dropInEligibility.checks must be an array');
    }
    if (!Array.isArray(dropIn.failedCheckNames)) {
      fail('receipt.dropInEligibility.failedCheckNames must be an array');
    }
    dropIn.checks.forEach((check, index) => {
      const label = `receipt.dropInEligibility.checks[${index}]`;
      assertExactKeys(check, DROP_IN_CHECK_KEYS, label);
      assertNonEmptyString(check.name, `${label}.name`);
      assertBoolean(check.ok, `${label}.ok`);
      if (typeof check.detail !== 'string') fail(`${label}.detail must be a string`);
    });
    const observedFailed = dropIn.checks
      .filter((check) => check.ok !== true)
      .map((check) => check.name);
    if (canonicalJson(observedFailed) !== canonicalJson(dropIn.failedCheckNames)) {
      fail('receipt.dropInEligibility.failedCheckNames disagrees with its checks');
    }
    if (dropIn.attempted === false) {
      if (dropIn.checks.length !== 0 || dropIn.eligible !== false) {
        fail('an unattempted drop-in verification cannot carry checks or eligibility');
      }
      if (dropIn.outcome !== 'not-attempted-capture-incomplete') {
        fail('an unattempted drop-in verification must declare the not-attempted outcome');
      }
    } else {
      if (dropIn.checks.length === 0) {
        fail('an attempted drop-in verification must carry its checks');
      }
      const allOk = dropIn.checks.every((check) => check.ok === true);
      if (dropIn.eligible !== allOk) {
        fail('receipt.dropInEligibility.eligible disagrees with its checks');
      }
      const expected = allOk ? 'eligible' : 'not-eligible-checks-failed';
      if (dropIn.outcome !== expected) {
        fail(`receipt.dropInEligibility.outcome must be '${expected}'`);
      }
    }

    // Unblinding drills.
    if (
      !Array.isArray(receipt.unblindingDrills)
      || receipt.unblindingDrills.length !== UNBLINDING_DRILL_PLAN.length
    ) {
      fail(
        `receipt.unblindingDrills must hold exactly ${UNBLINDING_DRILL_PLAN.length} `
        + 'ordered drills',
      );
    }
    receipt.unblindingDrills.forEach((drill, index) => {
      const label = `receipt.unblindingDrills[${index}]`;
      const plan = UNBLINDING_DRILL_PLAN[index];
      assertExactKeys(drill, UNBLINDING_DRILL_KEYS, label);
      if (drill.drill !== plan.drill) fail(`${label}.drill must be '${plan.drill}'`);
      if (drill.expectedFailNeutral !== plan.expectedFailNeutral) {
        fail(`${label}.expectedFailNeutral drifted from the drill plan`);
      }
      if (drill.receiptVerified !== true) {
        fail(`${label} must carry a verified unblinding receipt`);
      }
      if (drill.receiptCarriesNoMapping !== true) {
        fail(`${label} must assert its receipt carries no mapping`);
      }
      const check = verifyUnblindingReceipt(drill.receipt);
      if (!check.ok) fail(`${label}.receipt invalid: ${check.failureReason}`);
      if (drill.receipt.failNeutral !== plan.expectedFailNeutral) {
        fail(`${label}.receipt failNeutral does not match the drill plan`);
      }
      if (plan.expectedFailNeutral) {
        if (drill.revealedMatchesSealed !== null) {
          fail(`${label} must not claim a reveal on a fail-neutral refusal`);
        }
      } else if (drill.revealedMatchesSealed !== true) {
        fail(`${label} must prove the revealed mapping equals the sealed mapping`);
      }
      if (
        drill.receipt.commitmentId !== null
        && drill.receipt.commitmentId !== commitment.receiptHash
      ) {
        fail(`${label}.receipt does not bind this receipt alias assignment commitment`);
      }
    });

    // Claim boundary.
    assertExactKeys(receipt.claimBoundary, CLAIM_BOUNDARY_KEYS, 'receipt.claimBoundary');
    for (const [key, pinned] of Object.entries(PINNED_CLAIM_BOUNDARY_VALUES)) {
      if (receipt.claimBoundary[key] !== pinned) {
        fail(
          `receipt.claimBoundary.${key} must be ${canonicalJson(pinned)} `
          + '(pinned claim flag)',
        );
      }
    }
    assertBoolean(
      receipt.claimBoundary.liveSovereignRouteExercised,
      'receipt.claimBoundary.liveSovereignRouteExercised',
    );
    for (const listName of ['observed', 'notObserved']) {
      const list = receipt.claimBoundary[listName];
      if (!Array.isArray(list) || list.length === 0) {
        fail(`receipt.claimBoundary.${listName} must be a non-empty array`);
      }
      for (const item of list) {
        assertNonEmptyString(item, `receipt.claimBoundary.${listName} entry`);
      }
    }

    // Anti-leak audit. Runs BEFORE the hash recompute so a leaking receipt is
    // reported as a blinding failure, not as a hash mismatch.
    if (blindedPresent) {
      const patternHit = findPatternHit(receipt, ROUTE_SHAPED_PATTERNS, 'receipt');
      if (patternHit !== null) {
        fail(
          `receipt carries a route-shaped string at ${patternHit}; blinded `
          + 'MV-B3 receipts carry commitments only (blinding law)',
        );
      }
      const aliasHit = findPatternHit(
        {
          capturedResponseRecords: receipt.capturedResponseRecords,
          dropInEligibility: receipt.dropInEligibility,
        },
        [ADAPTER_ALIAS_PATTERN],
        'receipt',
      );
      if (aliasHit !== null) {
        fail(
          `receipt discloses the sealed adapter alias at ${aliasHit}; a captured `
          + 'response never names its adapter',
        );
      }
    }

    // Frozen-source binding: the only check here that reads the world.
    if (hololandRoot !== null) {
      const driftReason = frozenSourceDriftReason(receipt, hololandRoot);
      if (driftReason !== null) fail(driftReason);
    }

    const { receiptHash, ...unsigned } = receipt;
    assertSha256(receiptHash, 'receipt.receiptHash');
    if (canonicalDigest(unsigned) !== receiptHash) {
      fail('receipt.receiptHash does not recompute');
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    root: process.cwd(),
    output: DEFAULT_OUTPUT,
    storeRoot: null,
    skipLive: false,
    verify: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') args.root = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--store-root') args.storeRoot = argv[++index];
    else if (arg === '--skip-live') args.skipLive = true;
    else if (arg === '--verify') args.verify = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand Model Village MV-B3 alias custody + captured-response check

Usage:
  node scripts/check-hololand-model-village-alias-custody.mjs [options]

Options:
  --root <path>        HoloLand repository root
  --output <path>      Receipt output path
  --store-root <path>  Parent directory for the drill custody store
  --skip-live          Certify and capture against in-process loopback stubs
                       instead of the declared sovereign routes (marks
                       claimBoundary.liveSovereignRouteExercised false)
  --verify <path>      Verify an existing receipt file and exit (binds the
                       receipt frozen-source pins against --root)
  --json               Print the bounded receipt as JSON
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function describeCapture(entry) {
  return `  ${entry.residentId}: ${entry.captureOutcome}`
    + ` (turnCompleted=${entry.turnCompleted}`
    + `, proposal=${entry.proposalDecision ?? 'none'}`
    + `${entry.turnErrorClass ? `, errorClass=${entry.turnErrorClass}` : ''})`;
}

// The argv[1] guard matters: this module is IMPORTED by its test suite and by
// any consumer that wants verifyAliasCustodyReceipt. A bare
// pathToFileURL(process.argv[1]) throws when argv[1] is absent (an embedded or
// `-e` host), which would turn a library import into a crash.
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const args = parseArgs();
    if (args.verify) {
      const parsed = JSON.parse(
        readFileSync(path.resolve(args.root, args.verify), 'utf8'),
      );
      const verification = verifyAliasCustodyReceipt(parsed, {
        hololandRoot: path.resolve(args.root),
      });
      if (!verification.ok) {
        console.error('[hololand-model-village-alias-custody] verify FAILED');
        console.error(verification.failureReason);
        process.exit(1);
      }
      console.log('[hololand-model-village-alias-custody] verify ok');
      console.log(`receiptHash: ${parsed.receiptHash}`);
      console.log('frozen-source binding: re-derived from canonical `.hs`');
    } else {
      const { receipt, output, storeRoot } = await runAliasCustodyDrill(args);
      const commitment = receipt.aliasAssignmentCommitment;
      if (args.json) {
        console.log(JSON.stringify(receipt, null, 2));
      } else {
        console.log('[hololand-model-village-alias-custody] ok');
        console.log(`receipt: ${output}`);
        console.log(`store: ${storeRoot}`);
        console.log(`kernelSourceHash: ${receipt.kernelSourceHash}`);
        console.log(
          `alias assignment (${commitment.blockId}): `
          + `distinctRouteCount=${commitment.distinctRouteCount} `
          + `certifiedRouteCount=${commitment.certifiedRouteCount} `
          + `routeReuseDeclared=${commitment.routeReuseDeclared}`,
        );
        console.log('captured responses (blinded):');
        for (const entry of receipt.capturedResponseRecords) {
          console.log(describeCapture(entry));
        }
        console.log(
          `drop-in eligibility: ${receipt.dropInEligibility.outcome}`
          + ` (eligible=${receipt.dropInEligibility.eligible}`
          + `, failed=${canonicalJson(receipt.dropInEligibility.failedCheckNames)})`,
        );
        for (const drill of receipt.unblindingDrills) {
          console.log(
            `unblinding drill ${drill.drill}: `
            + `failNeutral=${drill.receipt.failNeutral} `
            + `verified=${drill.receiptVerified} `
            + `revealedMatchesSealed=${drill.revealedMatchesSealed}`,
          );
        }
        console.log(`custody access-log entries: ${receipt.custodyAccessLogEntryCount}`);
        console.log(
          'live sovereign route exercised: '
          + `${receipt.claimBoundary.liveSovereignRouteExercised}`,
        );
        console.log(
          'frozen plan swap performed: '
          + `${receipt.claimBoundary.frozenPlanSwapPerformed} `
          + '(drop-in eligibility is proven, never admitted here)',
        );
      }
    }
  } catch (error) {
    console.error('[hololand-model-village-alias-custody] failed');
    console.error(error.message || error);
    process.exit(1);
  }
}
