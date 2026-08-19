/* global Buffer, URL */

// Model Village MV-B3 captured-response custody + provider-route evidence
// (ENGINEERING CUSTODY LANE).
//
// Gate closed by this slice (docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md
// runtime-closure-gate row "Captured replay", REMAINING column: "Real
// captured-response custody and provider-route evidence."). Spec lines
// 216-228 require each adapter to record: whether a sampling seed was
// requested, whether the provider accepted it, model revision or local file
// hash, temperature and token limit, raw response hash, and the captured
// response location under local sealed custody. Spec lines 188-204 require
// that residents and observers never receive adapter identity or provider
// route.
//
// Language boundary (spec lines 106-108): this module is transport,
// canonicalization, custody, and verification only. It contains no resident
// reasoning, no village rules, no experimental treatments, no scoring policy,
// and no model-specific behavior. The prompt template, proposal vocabulary,
// and route declarations are canonical `.hs` source data consumed through the
// MV-B1 runtime, never authored here.
//
// ---------------------------------------------------------------------------
// THE BLINDING LAW (the load-bearing rule of this module)
// ---------------------------------------------------------------------------
// The adapter_a/adapter_b/adapter_c alias-to-route mapping is SEALED. It may
// exist ONLY inside the encrypted custody store. It never appears in a public
// record field, a log line, a thrown error message, a filename, or any `.hs`
// / `.holo` source emitted from here. Public artifacts carry COMMITMENTS
// (salted digests) only:
//
//   blinded === false (engineering default) - routes are DECLARED OPENLY
//     (matching the MV-B1 drill's routesDeclaredOpenly: true). The record
//     carries routeId, an endpoint commitment, and the server-reported
//     revision fields. routeCommitment is null. This mode is correct for the
//     engineering lane and is NOT admissible for the study lane.
//
//   blinded === true (REQUIRED by the study lane) - every route-identifying
//     and revision-identifying field in providerRouteEvidence becomes null,
//     because each of them is ENUMERABLE against a small declared route set
//     (a bare digest of "the endpoint" or of the certification receipt can be
//     recomputed by anyone holding the openly-declared engineering artifacts,
//     so a bare digest is not blinding). The only public route binding is
//     routeCommitment = canonicalDigest({ routeId, salt }) under a
//     caller-held high-entropy salt. The full disclosure (routeId, endpoint,
//     reported revision fields, certification receipt hash, salt) is SEALED
//     into custody under kind 'captured-response-route-disclosure' with an
//     ENCRYPTED label `<responseId>:route-disclosure`; the sealed key-holder
//     resolves it, nobody else can. serializerHash survives blinding because
//     it is a digest of the transport serializer descriptor alone and is
//     byte-identical across every route on the same transport.
//
// THE SAME RULE APPLIES TO DIGESTS OVER THE PROVIDER'S OWN BYTES. This was
// initially got WRONG and is called out here so it is not re-broken: the raw
// provider envelope EMBEDS route identity (the server-chosen completion id and
// the reported model name both carry it), and the drill pins temperature 0 and
// a fixed seed against openly-declared, reachable routes. A bare sha256 over
// those bytes is therefore a replay-and-compare oracle for the route, exactly
// like a bare digest of the endpoint, and a sha256 is not a substring so no
// needle scan can see it. Consequently, when blinded:
//   rawResponseHash, rawResponseCustodyId, turnReceiptHash and
//   priorReceiptHash are ALL null (the turn receipt's digest reduces to the
//   same replay because its preimage embeds the raw response hash, the routeId
//   and the endpoint), and the public bindings are the SALTED
//   rawResponseCommitment = canonicalDigest({ rawResponseHash, salt }) and
//   turnReceiptCommitment = canonicalDigest({ salt, turnReceiptHash }).
// The true hashes and the raw custody address go into the SEALED route
// disclosure, so the spec 216-228 evidence (raw response hash + captured
// response location under local sealed custody) is recorded in full for the
// key-holder without publishing a deblinding oracle.
//
// WHAT STAYS PUBLIC WHEN BLINDED, AND WHY IT IS NOT A ROUTE ORACLE:
// responseHash, canonicalResponseCustodyId and parsedProposal are digests /
// projections of the DERIVED canonical proposal, which is bounded study
// vocabulary and is byte-identical no matter which route produced it (the
// frozen Phase 0B fixtures publish exactly this text openly). They are
// required public: the frozen consumer hydrates from responseHash. They carry
// the study PAYLOAD, not the route, and the payload-to-model inference is
// behavioral blinding, which this lane explicitly does not claim.
//
// Issuance additionally SELF-AUDITS: before returning, a blinded record's
// canonical serialization is scanned for the routeId, the endpoint, the
// endpoint host, and the adapter-alias vocabulary, and issuance fails loud if
// any appears. verifyCapturedResponseRecord re-runs the alias scan.
//
// ---------------------------------------------------------------------------
// CLAIM BOUNDARY (see CAPTURED_RESPONSE_CUSTODY_CLAIM_BOUNDARY)
// ---------------------------------------------------------------------------
// This slice does NOT claim: a live study run, Phase 1 admission or
// readiness, blinded evaluation, post-lock presentation execution (that is
// the art-direction/presentation lane's declared source contract, which
// itself self-declares
// postlockPolicyExecutionStatus "declarative_source_contract_not_observed_runtime_execution"),
// family-to-model attribution, or that the frozen Phase 0B plan now consumes
// custody-backed responses. It PRODUCES custody-backed records and PROVES
// drop-in eligibility with an executable verifier:
//   dropInEligibilityProven === true, frozenPlanSwapPerformed === false.
// Swapping records into the frozen plan changes planExecutionSourceHash and
// is a study-lane admission decision, not an engineering one.
//
// Public receipts NEVER carry raw model text: the free-form `reason` field of
// a proposal is projected OUT of every derived artifact (the MV-B1 model turn
// receipt already reduces it to a length + digest), and the derived canonical
// response text carries bounded vocabulary values only.

import { createHash } from 'node:crypto';

import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';
import {
  GENESIS_RECEIPT_HASH,
  executeCertifiedModelTurn,
  verifyAdapterCertificationReceipt,
  verifyModelTurnReceipt,
} from './model-village-adapter-runtime.mjs';

export const CAPTURED_RESPONSE_CUSTODY_SCHEMA =
  'hololand.model-village-captured-response-custody.v1';
export const CAPTURED_RESPONSE_RECORD_SCHEMA =
  'hololand.model-village-captured-response-record.v1';
export const CAPTURED_RESPONSE_CUSTODY_ENGINE =
  'hololand-model-village-captured-response-custody-v1';
export const ALIAS_COMMITMENT_SCHEMA =
  'hololand.model-village-captured-response-alias-commitment.v1';

export { GENESIS_RECEIPT_HASH };

/**
 * The EXACT six keys the frozen Phase 0B consumer requires of a captured
 * response fixture (assertExactKeys at
 * scripts/model-village-phase0b-runtime.mjs:496). Sorted, closed, and pinned
 * here so a drift in either lane fails an executable check rather than a
 * reviewer's memory.
 */
export const PHASE0B_FIXTURE_KEYS = Object.freeze([
  'adapterAlias',
  'parsedProposal',
  'residentId',
  'responseId',
  'responseText',
  'type',
]);
export const PHASE0B_FIXTURE_TYPE = 'phase0b_captured_response_fixture';

/** Resident order the frozen consumer requires (phase0b-runtime.mjs:520-526). */
export const PHASE0B_REQUIRED_RESIDENT_ORDER = Object.freeze([
  'resident-01',
  'resident-02',
]);

/** Custody object kinds owned by this slice. All labels are encrypted. */
export const RAW_RESPONSE_KIND = 'captured-response-raw';
export const CANONICAL_RESPONSE_KIND = 'captured-response-canonical';
export const ROUTE_DISCLOSURE_KIND = 'captured-response-route-disclosure';
export const ALIAS_COMMITMENT_KIND = 'captured-response-alias-commitment';

export const DERIVATION_SOURCES = Object.freeze([
  'bounded-parsed-proposal',
  'sealed-raw-bytes',
]);

export const CAPTURED_RESPONSE_CUSTODY_CLAIM_BOUNDARY = Object.freeze({
  capturedResponseCustodyImplemented: true,
  dropInEligibilityVerifierProvided: true,
  providerRouteEvidenceImplemented: true,
  blindedEvaluationClaimed: false,
  familyToModelAttributionClaimed: false,
  frozenPlanSwapPerformed: false,
  liveStudyRunClaimed: false,
  phase1AdmissionClaimed: false,
  phase1ReadinessClaimed: false,
  postLockPresentationExecutionClaimed: false,
  rawModelTextInPublicReceiptsClaimed: false,
  temperatureZeroDeterminismClaimed: false,
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
// The adapter alias vocabulary. Any occurrence of this shape in a public
// field is a blinding-law violation, whether it names a real assignment or
// not — the alias namespace itself only exists inside sealed custody.
const ADAPTER_ALIAS_PATTERN = /adapter[_-][a-z0-9]/i;
// A salt short enough to brute-force is not a commitment. Route/alias sets
// are tiny (2-3 members), so the salt is the ONLY entropy standing between a
// public commitment and full deblinding.
const MIN_COMMITMENT_SALT_LENGTH = 32;
// The plan kernel is parsed with /return\s+'([^']*)'/ (phase0b-runtime.mjs:587):
// a quote, backslash, or newline inside a hydrated value breaks plan parsing
// after the provider turns have already been spent.
const PLAN_EMBEDDABLE_FORBIDDEN = /['\\\r\n]/;

const RECORD_KEYS = Object.freeze([
  'aliasCommitmentRef',
  'at',
  'canonicalResponseCustodyId',
  'canonicalizationRequired',
  'derivationSource',
  'engine',
  'parsedProposal',
  'priorReceiptHash',
  'providerRouteEvidence',
  'rawResponseCommitment',
  'rawResponseCustodyId',
  'rawResponseHash',
  'receiptHash',
  'residentId',
  'responseHash',
  'responseId',
  'routeCommitment',
  'routeIdentityBlinded',
  'samplingEvidence',
  'schema',
  'turnReceiptCommitment',
  'turnReceiptHash',
]);

/**
 * The four hash fields whose PREIMAGE is the provider's own response bytes (or
 * a receipt that embeds them together with the routeId and the endpoint). Each
 * is a replay-and-compare oracle for the route against the small, openly
 * declared route set, so a blinded record nulls all four and publishes salted
 * commitments instead. They are present, and cross-checked, only when the
 * engineering lane declares its route openly.
 */
const PROVIDER_CORRELATED_HASH_KEYS = Object.freeze([
  'priorReceiptHash',
  'rawResponseCustodyId',
  'rawResponseHash',
  'turnReceiptHash',
]);
const PROVIDER_ROUTE_EVIDENCE_KEYS = Object.freeze([
  'certificationReceiptHash',
  'endpointCommitment',
  'modelIdReported',
  'packageVersionReported',
  'processInstanceId',
  'routeId',
  'serializerHash',
]);
/** Spec lines 216-224: seed requested, seed accepted, temperature, token limit. */
const SAMPLING_EVIDENCE_KEYS = Object.freeze([
  'maxOutputTokens',
  'seedAcceptedEvidence',
  'seedRequested',
  'temperature',
]);
const ALIAS_COMMITMENT_KEYS = Object.freeze([
  'adapterAlias',
  'aliasCommitmentRef',
  'salt',
  'schema',
]);

export class ModelVillageCapturedResponseCustodyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageCapturedResponseCustodyError';
  }
}

function fail(message) {
  throw new ModelVillageCapturedResponseCustodyError(message);
}

function sha256HexOfBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

// ---------------------------------------------------------------------------
// Frozen-consumer mirrors. These two functions MUST stay byte-identical in
// behavior to model-village-phase0b-runtime.mjs (sourceDigest at :241-243 and
// expectedProposal at :394-399). They are module-private there, so they
// cannot be imported without editing a file this slice may not touch; the
// test suite pins them against the frozen `.hs` fixtures as a drift canary.
// ---------------------------------------------------------------------------

function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

/** sha256 over the CRLF-normalized utf8 source text — NOT a re-serialization. */
function sourceDigest(value) {
  return sha256HexOfBytes(Buffer.from(normalizeSource(value), 'utf8'));
}

/** Mirror of the frozen consumer. Do not "improve" the null/undefined edges. */
function expectedProposal(response) {
  if (response.action === 'contribute_water') {
    return `${response.action}:${response.target}:${response.amount}`;
  }
  return `${response.action}:${response.target}`;
}

// ---------------------------------------------------------------------------
// Blinding-law guards.
// ---------------------------------------------------------------------------

/**
 * Caller-supplied public identifiers must never smuggle the sealed alias
 * namespace into a public field. The alias check applies in BOTH modes (the
 * alias namespace is sealed regardless); the route/endpoint checks apply only
 * when blinded, because the engineering lane declares routes openly.
 */
function assertNoSealedIdentityLeak(value, label, { route, blinded }) {
  if (typeof value !== 'string' || value.length === 0) return;
  if (ADAPTER_ALIAS_PATTERN.test(value)) {
    fail(
      `${label} carries the sealed adapter-alias namespace; alias identity `
      + 'may exist only inside the encrypted custody store',
    );
  }
  if (!blinded || !route) return;
  const haystack = value.toLowerCase();
  for (const [needleLabel, needle] of routeIdentityNeedles(route)) {
    if (needle && haystack.includes(needle)) {
      fail(
        `${label} carries the sealed provider ${needleLabel} while blinded is `
        + 'true; blinded artifacts carry commitments only',
      );
    }
  }
}

function routeIdentityNeedles(route) {
  const needles = [['routeId', String(route.routeId ?? '').toLowerCase()]];
  const endpoint = String(route.endpoint ?? '');
  if (endpoint.length > 0) {
    needles.push(['endpoint', endpoint.toLowerCase()]);
    try {
      const parsed = new URL(endpoint);
      needles.push(['endpoint host', parsed.host.toLowerCase()]);
      needles.push(['endpoint hostname', parsed.hostname.toLowerCase()]);
    } catch {
      // A non-URL endpoint is rejected upstream by the MV-B1 route validator;
      // the raw-string needle above still applies here.
    }
  }
  return needles.filter(([, needle]) => needle.length > 0);
}

/**
 * Final issuance fence: the serialized public record itself is scanned. This
 * catches a leak that slipped in through ANY field (including one added by a
 * future edit) rather than trusting the per-field construction.
 */
function assertRecordCarriesNoSealedIdentity(record, { route, blinded }) {
  const serialized = canonicalJson(record);
  if (ADAPTER_ALIAS_PATTERN.test(serialized)) {
    fail('captured-response record carries the sealed adapter-alias namespace');
  }
  if (!blinded) return;
  const haystack = serialized.toLowerCase();
  for (const [needleLabel, needle] of routeIdentityNeedles(route)) {
    if (haystack.includes(needle)) {
      fail(
        `blinded captured-response record leaks the provider ${needleLabel}; `
        + 'refusing to issue',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Custody helpers (duplicate-tolerant, mirroring the MV-B1 rationale).
// ---------------------------------------------------------------------------

function validateCustodyStore(custodyStore) {
  if (
    !custodyStore
    || typeof custodyStore.sealObject !== 'function'
    || typeof custodyStore.readObject !== 'function'
    || typeof custodyStore.listObjects !== 'function'
  ) {
    fail('custodyStore must expose sealObject, readObject, and listObjects');
  }
}

/**
 * Content-addressed idempotent seal. custodyId is sha256 of the PLAINTEXT, so
 * re-sealing identical bytes is PROOF of custody, not a failure: the raw
 * provider bytes are already sealed by the MV-B1 turn (kind
 * 'model-turn-response'), and two records may legitimately derive the same
 * canonical proposal text. On duplicate the existing custodyId is reused.
 * NOTE the honest consequence: the store's encrypted `kind` metadata records
 * whichever seal FIRST created the object, so a raw response's stored kind
 * stays 'model-turn-response'. The record therefore publishes the content
 * ADDRESS (rawResponseCustodyId), never a kind claim.
 */
async function sealBytes(custodyStore, bytes, kind, label) {
  let sealed;
  try {
    sealed = await custodyStore.sealObject({ bytes, kind, label });
  } catch (error) {
    if (
      error?.name === 'CustodyDuplicateObjectError'
      && typeof error.custodyId === 'string'
      && error.custodyId.length > 0
    ) {
      return error.custodyId;
    }
    throw error;
  }
  if (!sealed || typeof sealed.custodyId !== 'string' || sealed.custodyId.length === 0) {
    fail(`custodyStore.sealObject did not return a custodyId for ${label}`);
  }
  return sealed.custodyId;
}

async function sealValue(custodyStore, value, kind, label) {
  let sealed;
  try {
    sealed = await custodyStore.sealObject({ value, kind, label });
  } catch (error) {
    if (
      error?.name === 'CustodyDuplicateObjectError'
      && typeof error.custodyId === 'string'
      && error.custodyId.length > 0
    ) {
      return error.custodyId;
    }
    throw error;
  }
  if (!sealed || typeof sealed.custodyId !== 'string' || sealed.custodyId.length === 0) {
    fail(`custodyStore.sealObject did not return a custodyId for ${label}`);
  }
  return sealed.custodyId;
}

function assertCommitmentSalt(salt, label) {
  assertNonEmptyString(salt, label);
  if (salt.length < MIN_COMMITMENT_SALT_LENGTH) {
    fail(
      `${label} must be at least ${MIN_COMMITMENT_SALT_LENGTH} characters; a `
      + 'short salt over a 2-3 member route set is brute-forceable and is not '
      + 'a commitment',
    );
  }
}

/**
 * Seals the alias commitment that binds an opaque public aliasCommitmentRef
 * to a sealed adapter alias. THIS is the only place an alias may be written,
 * and the write goes straight into the encrypted store (both the plaintext
 * and the `label` metadata are encrypted by the custody store).
 *
 * The salt is sealed alongside the alias so the custodyId — a sha256 over the
 * canonical plaintext — is not itself guessable from the tiny alias space.
 */
export async function sealAliasCommitment({
  custodyStore,
  aliasCommitmentRef,
  adapterAlias,
  salt,
} = {}) {
  validateCustodyStore(custodyStore);
  assertNonEmptyString(aliasCommitmentRef, 'aliasCommitmentRef');
  assertNonEmptyString(adapterAlias, 'adapterAlias');
  assertCommitmentSalt(salt, 'alias commitment salt');
  if (ADAPTER_ALIAS_PATTERN.test(aliasCommitmentRef)) {
    fail(
      'aliasCommitmentRef must be opaque; it must never be, or contain, the '
      + 'adapter alias it commits to',
    );
  }
  const value = {
    adapterAlias,
    aliasCommitmentRef,
    salt,
    schema: ALIAS_COMMITMENT_SCHEMA,
  };
  assertExactKeys(value, ALIAS_COMMITMENT_KEYS, 'alias commitment');
  const custodyId = await sealValue(
    custodyStore,
    value,
    ALIAS_COMMITMENT_KIND,
    aliasCommitmentLabel(aliasCommitmentRef),
  );
  return Object.freeze({ aliasCommitmentRef, custodyId });
}

/**
 * The ENCRYPTED custody label an alias commitment is sealed under. Derived in
 * one place so resolution can address the binding directly instead of opening
 * every sealed alias object to find out which one it is.
 */
function aliasCommitmentLabel(aliasCommitmentRef) {
  return `${aliasCommitmentRef}:alias-commitment`;
}

/**
 * Sealed key-holder resolution for ONE alias binding.
 *
 * ADDRESSED, NOT SCANNED. The custody store's metadata (including the label)
 * is encrypted at rest but decrypted by listObjects for a live-key handle, so
 * the binding is selected by its exact sealed label BEFORE anything is opened.
 * That matters for the audit trail, not just for speed: every readObject
 * appends an fsync'd `read` entry to the hash-chained access log, so opening
 * every sealed alias object to resolve one of them would record that the
 * key-holder opened EVERY adapter binding in the study — destroying exactly
 * the distinction a blinding audit needs. Resolving one binding now logs one
 * read.
 *
 * Exactly one match is required — zero means the caller never sealed the
 * binding (we never invent an alias), and more than one means an ambiguous
 * binding that must be resolved by an operator, not by this module picking a
 * winner. The decrypted value's own aliasCommitmentRef is still compared, so a
 * label collision cannot substitute a different binding.
 */
function resolveSealedAdapterAlias(custodyStore, aliasCommitmentRef) {
  const expectedLabel = aliasCommitmentLabel(aliasCommitmentRef);
  const entries = custodyStore.listObjects().filter(
    (entry) => entry?.metadataAvailable === true
      && entry.kind === ALIAS_COMMITMENT_KIND
      && entry.label === expectedLabel,
  );
  const matches = [];
  for (const entry of entries) {
    const read = custodyStore.readObject(entry.custodyId);
    let value;
    try {
      value = JSON.parse(read.bytes.toString('utf8'));
    } catch (error) {
      fail(`sealed alias commitment ${entry.custodyId} is not JSON: ${error.message}`);
    }
    assertExactKeys(value, ALIAS_COMMITMENT_KEYS, 'sealed alias commitment');
    if (value.schema !== ALIAS_COMMITMENT_SCHEMA) {
      fail(`sealed alias commitment ${entry.custodyId} has the wrong schema`);
    }
    if (value.aliasCommitmentRef === aliasCommitmentRef) {
      matches.push(value.adapterAlias);
    }
  }
  if (matches.length === 0) {
    fail(
      'no sealed alias commitment matches this record\'s aliasCommitmentRef; '
      + 'seal one with sealAliasCommitment first (an alias is never invented)',
    );
  }
  if (matches.length > 1) {
    fail(
      'multiple sealed alias commitments match this record\'s '
      + 'aliasCommitmentRef; the binding is ambiguous',
    );
  }
  return matches[0];
}

// ---------------------------------------------------------------------------
// Proposal derivation.
// ---------------------------------------------------------------------------

/**
 * The frozen fixture's `responseText` is the PROPOSAL object, not the
 * provider envelope, and it carries NO `reason` key (compare the frozen
 * fixtures in source/proofs/model-village-phase1-manifests.hs). `reason` is
 * free-form model text, so projecting it out is the public-receipt rule (spec
 * lines 288-289), not a convenience: everything else is kept EXACTLY as
 * emitted so no value is silently normalized.
 */
function proposalObjectFromEmitted(emitted) {
  assertObject(emitted, 'emitted proposal');
  const projected = {};
  for (const key of Object.keys(emitted)) {
    if (key === 'reason') continue;
    projected[key] = emitted[key];
  }
  if (typeof projected.action !== 'string' || projected.action.length === 0) {
    fail('emitted proposal has no string action');
  }
  return projected;
}

/**
 * Bounded path: the MV-B1 receipt's public parsedProposal already reduced the
 * free-form reason to a length + digest, so the three vocabulary-bounded
 * fields can be lifted without touching raw text at all.
 */
function proposalObjectFromBounded(boundedProposal) {
  return {
    action: boundedProposal.action,
    amount: boundedProposal.amount,
    target: boundedProposal.target,
  };
}

/**
 * Projects a responseText parse failure onto a CLOSED reason set.
 *
 * Node's V8 JSON.parse errors QUOTE a prefix of the offending input, and the
 * caller-supplied `{record, fixtureForm}` entry shape exists precisely so a
 * hand-authored candidate fixture (untrusted model output) can be judged as
 * produced. Echoing error.message there would export raw model text into
 * checks[].detail, which a consumer writes verbatim into a durable receipt —
 * the exact rule this module's header states ("Public receipts NEVER carry raw
 * model text") and the discipline classifyCaptureError already applies in the
 * capture lane.
 */
function projectResponseTextParseFailure(error) {
  return String(error?.message ?? '') === NOT_A_JSON_OBJECT
    ? 'responseText-not-json-object'
    : 'responseText-not-strict-json';
}

const NOT_A_JSON_OBJECT = 'responseText is not a JSON object';

function tryParseJsonBytes(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Capture.
// ---------------------------------------------------------------------------

/**
 * Runs ONE certified model turn (zero retry is guaranteed by the MV-B1
 * runtime: there is no retry loop and no second fetch on any path), seals the
 * raw provider bytes AND the derived canonical proposal text, and issues a
 * public captured-response record.
 *
 * Returns { record, turnReceipt }. A FAILED turn (transport error, HTTP
 * error, truncated body) returns { record: null, turnReceipt } — the failure
 * is receipted by the MV-B1 turn receipt and NOTHING is sealed by this
 * module, so a failed provider interaction can never leave a canonical
 * artifact that looks like a capture.
 *
 * Derivation is fail-loud, never coercive: if the emitted content is not
 * strict JSON (prose that does not parse), issuance throws instead of
 * scraping a JSON substring out of prose.
 *
 * Chain: priorReceiptHash positions the TURN; the record then chains linearly
 * after its own turn receipt, so record.priorReceiptHash === turnReceiptHash
 * by construction and verifyCapturedResponseRecord enforces it.
 */
export async function captureResponseUnderCustody({
  custodyStore,
  operator,
  route,
  certification,
  drill,
  residentId,
  responseId,
  priorReceiptHash = GENESIS_RECEIPT_HASH,
  blinded = false,
  routeCommitmentSalt = null,
  aliasCommitmentRef = null,
  turnExecutor = executeCertifiedModelTurn,
} = {}) {
  validateCustodyStore(custodyStore);
  assertNonEmptyString(operator, 'operator');
  assertObject(route, 'route');
  assertNonEmptyString(route.routeId, 'route.routeId');
  assertNonEmptyString(route.endpoint, 'route.endpoint');
  assertObject(drill, 'drill');
  assertNonEmptyString(residentId, 'residentId');
  assertNonEmptyString(responseId, 'responseId');
  assertSha256(priorReceiptHash, 'priorReceiptHash');
  if (typeof blinded !== 'boolean') fail('blinded must be a boolean');
  if (typeof turnExecutor !== 'function') fail('turnExecutor must be a function');

  if (blinded) {
    assertCommitmentSalt(routeCommitmentSalt, 'routeCommitmentSalt');
  } else if (routeCommitmentSalt !== null) {
    // Fail loud rather than accept an unused salt: a caller who supplied one
    // believes they are blinded, and silently publishing routeId would be the
    // exact deblinding this module exists to prevent.
    fail('routeCommitmentSalt is only valid when blinded is true');
  }
  if (aliasCommitmentRef !== null) {
    assertNonEmptyString(aliasCommitmentRef, 'aliasCommitmentRef');
  }
  for (const [label, value] of [
    ['residentId', residentId],
    ['responseId', responseId],
    ['aliasCommitmentRef', aliasCommitmentRef],
  ]) {
    assertNoSealedIdentityLeak(value, label, { route, blinded });
  }

  const certificationCheck = verifyAdapterCertificationReceipt(certification);
  if (!certificationCheck.ok) {
    fail(`certification receipt is invalid: ${certificationCheck.failureReason}`);
  }
  if (certification.certified !== true) {
    fail('route is not certified; refusing to capture a response');
  }
  if (
    certification.routeId !== route.routeId
    || certification.endpoint !== route.endpoint
  ) {
    fail('certification receipt does not bind this route');
  }

  const turnReceipt = await turnExecutor({
    route,
    certification,
    drill,
    custodyStore,
    operator,
    priorReceiptHash,
  });
  const turnCheck = verifyModelTurnReceipt(turnReceipt);
  if (!turnCheck.ok) {
    fail(`model turn receipt is invalid: ${turnCheck.failureReason}`);
  }
  if (turnReceipt.routeId !== route.routeId) {
    fail('model turn receipt does not bind this route');
  }
  if (turnReceipt.priorReceiptHash !== priorReceiptHash) {
    fail('model turn receipt does not chain from the supplied priorReceiptHash');
  }
  if (turnReceipt.turnCompleted !== true) {
    // Receipted failure. Nothing is sealed here; the turn receipt already
    // carries errorClass, the sealed request custodyId, and a null response.
    return Object.freeze({ record: null, turnReceipt });
  }

  // Read the sealed raw provider bytes back out of custody. The store
  // re-verifies plaintext-hash === custodyId on read, so this is a genuine
  // custody round-trip, not a re-use of an in-memory buffer.
  const rawRead = custodyStore.readObject(turnReceipt.custodyRefs.responseCustodyId);
  const rawBytes = rawRead.bytes;
  const rawResponseHash = sha256HexOfBytes(rawBytes);
  if (rawResponseHash !== turnReceipt.responseHash) {
    fail('sealed raw response bytes disagree with the turn receipt responseHash');
  }

  const envelope = tryParseJsonBytes(rawBytes);
  const emittedContent = envelope?.choices?.[0]?.message?.content;
  if (typeof emittedContent !== 'string' || emittedContent.length === 0) {
    fail('sealed raw response carries no choices[0].message.content string');
  }
  let emittedProposal;
  try {
    emittedProposal = JSON.parse(emittedContent);
  } catch (error) {
    fail(
      'emitted proposal text is not strict JSON '
      + `(${error.message}); refusing to scrape a proposal out of prose`,
    );
  }
  if (!emittedProposal || typeof emittedProposal !== 'object' || Array.isArray(emittedProposal)) {
    fail('emitted proposal text is not a JSON object');
  }

  const rawDerived = proposalObjectFromEmitted(emittedProposal);
  const boundedDerived = turnReceipt.parsedProposal === null
    ? null
    : proposalObjectFromBounded(turnReceipt.parsedProposal);
  if (boundedDerived && canonicalJson(boundedDerived) !== canonicalJson(rawDerived)) {
    fail(
      'bounded parsedProposal and sealed raw bytes derive different proposals; '
      + 'refusing to pick a winner',
    );
  }
  const derivationSource = boundedDerived
    ? 'bounded-parsed-proposal'
    : 'sealed-raw-bytes';
  const proposalObject = boundedDerived ?? rawDerived;

  const canonicalResponseText = canonicalJson(proposalObject);
  // canonicalizationRequired asks whether the PROVIDER'S emitted proposal
  // bytes were already their own canonical serialization (sorted keys, no
  // padding). It is deliberately independent of the `reason` projection,
  // which is a public-receipt rule applied to every capture.
  const canonicalizationRequired = emittedContent !== canonicalJson(emittedProposal);
  const responseHash = sourceDigest(canonicalResponseText);
  const parsedProposal = expectedProposal(proposalObject);

  // Seal only after derivation succeeds, so a derivation failure leaves no
  // canonical artifact behind.
  const rawResponseCustodyId = await sealBytes(
    custodyStore,
    Buffer.from(rawBytes),
    RAW_RESPONSE_KIND,
    `${responseId}:raw`,
  );
  if (rawResponseCustodyId !== turnReceipt.custodyRefs.responseCustodyId) {
    fail('raw response custody address diverged from the turn receipt');
  }
  const canonicalResponseCustodyId = await sealBytes(
    custodyStore,
    Buffer.from(canonicalResponseText, 'utf8'),
    CANONICAL_RESPONSE_KIND,
    `${responseId}:canonical`,
  );

  let routeCommitment = null;
  let rawResponseCommitment = null;
  let turnReceiptCommitment = null;
  if (blinded) {
    routeCommitment = canonicalDigest({
      routeId: route.routeId,
      salt: routeCommitmentSalt,
    });
    // Salted commitments over the two provider-correlated digests. The bare
    // digests are replayable against the declared route set (see the blinding
    // law at the head of this file), so they never reach a public field; the
    // commitments preserve the binding without the oracle, and a FRESH salt
    // per capture keeps two captures over one route unlinkable.
    rawResponseCommitment = canonicalDigest({
      rawResponseHash,
      salt: routeCommitmentSalt,
    });
    turnReceiptCommitment = canonicalDigest({
      salt: routeCommitmentSalt,
      turnReceiptHash: turnReceipt.receiptHash,
    });
    // The sealed key-holder record. Its custodyId is unguessable because the
    // salt is inside the sealed plaintext; the label is encrypted by the
    // custody store, so nothing on disk names the route in the clear. It
    // carries the spec 216-228 raw-response hash and the sealed custody
    // LOCATION that the blinded public record must not publish.
    await sealValue(
      custodyStore,
      {
        certificationReceiptHash: certification.receiptHash,
        endpoint: route.endpoint,
        modelIdReported: certification.revisionEvidence.modelIdReported,
        packageVersionReported: certification.revisionEvidence.packageVersionReported,
        processInstanceId: certification.revisionEvidence.processInstanceId,
        rawResponseCommitment,
        rawResponseCustodyId,
        rawResponseHash,
        residentId,
        responseId,
        routeCommitment,
        routeCommitmentSalt,
        routeId: route.routeId,
        schema: CAPTURED_RESPONSE_CUSTODY_SCHEMA,
        turnReceiptCommitment,
        turnReceiptHash: turnReceipt.receiptHash,
      },
      ROUTE_DISCLOSURE_KIND,
      `${responseId}:route-disclosure`,
    );
  }

  const providerRouteEvidence = blinded
    ? {
      // Every field below is ENUMERABLE against the openly-declared
      // engineering route set, so blinding requires null, not a digest.
      certificationReceiptHash: null,
      endpointCommitment: null,
      modelIdReported: null,
      packageVersionReported: null,
      processInstanceId: null,
      routeId: null,
      // Transport-only descriptor digest: byte-identical across routes on
      // the same transport, therefore nonidentifying.
      serializerHash: certification.serializerHash,
    }
    : {
      certificationReceiptHash: certification.receiptHash,
      endpointCommitment: canonicalDigest({ endpoint: route.endpoint }),
      modelIdReported: certification.revisionEvidence.modelIdReported,
      packageVersionReported: certification.revisionEvidence.packageVersionReported,
      processInstanceId: certification.revisionEvidence.processInstanceId,
      routeId: route.routeId,
      serializerHash: certification.serializerHash,
    };

  const unsigned = {
    aliasCommitmentRef,
    at: new Date().toISOString(),
    canonicalResponseCustodyId,
    canonicalizationRequired,
    derivationSource,
    engine: CAPTURED_RESPONSE_CUSTODY_ENGINE,
    parsedProposal,
    // The chain link IS the turn receipt hash, so blinding one blinds both.
    priorReceiptHash: blinded ? null : turnReceipt.receiptHash,
    providerRouteEvidence,
    rawResponseCommitment,
    rawResponseCustodyId: blinded ? null : rawResponseCustodyId,
    rawResponseHash: blinded ? null : rawResponseHash,
    residentId,
    responseHash,
    responseId,
    routeCommitment,
    routeIdentityBlinded: blinded,
    samplingEvidence: {
      maxOutputTokens: turnReceipt.generationParameters.maxOutputTokens,
      seedAcceptedEvidence: turnReceipt.generationParameters.seedAcceptedEvidence,
      seedRequested: turnReceipt.generationParameters.seedRequested,
      temperature: turnReceipt.generationParameters.temperature,
    },
    schema: CAPTURED_RESPONSE_RECORD_SCHEMA,
    turnReceiptCommitment,
    turnReceiptHash: blinded ? null : turnReceipt.receiptHash,
  };
  const record = deepFreeze({
    ...unsigned,
    receiptHash: canonicalDigest(unsigned),
  });
  assertRecordCarriesNoSealedIdentity(record, { route, blinded });
  const selfCheck = verifyCapturedResponseRecord(record);
  if (!selfCheck.ok) {
    fail(`issued captured-response record does not verify: ${selfCheck.failureReason}`);
  }
  return Object.freeze({ record, turnReceipt });
}

// ---------------------------------------------------------------------------
// Record verification.
// ---------------------------------------------------------------------------

export function verifyCapturedResponseRecord(record) {
  try {
    assertExactKeys(record, RECORD_KEYS, 'captured-response record');
    if (record.schema !== CAPTURED_RESPONSE_RECORD_SCHEMA) {
      fail(`captured-response record schema is not ${CAPTURED_RESPONSE_RECORD_SCHEMA}`);
    }
    if (record.engine !== CAPTURED_RESPONSE_CUSTODY_ENGINE) {
      fail(`captured-response record engine is not ${CAPTURED_RESPONSE_CUSTODY_ENGINE}`);
    }
    if (typeof record.at !== 'string' || !ISO_UTC_PATTERN.test(record.at)) {
      fail('captured-response record at must be an ISO-8601 UTC timestamp');
    }
    assertNonEmptyString(record.residentId, 'record.residentId');
    assertNonEmptyString(record.responseId, 'record.responseId');
    assertNonEmptyString(record.parsedProposal, 'record.parsedProposal');
    assertSha256(record.responseHash, 'record.responseHash');
    assertSha256(record.canonicalResponseCustodyId, 'record.canonicalResponseCustodyId');
    if (typeof record.routeIdentityBlinded !== 'boolean') {
      fail('record.routeIdentityBlinded must be a boolean');
    }
    if (record.routeIdentityBlinded) {
      // The blinding law applied to digests over the provider's own bytes: a
      // bare sha256 of the raw envelope (or of the turn receipt that embeds
      // it) is replayable against the small declared route set at the pinned
      // temperature and seed, so it is an enumerable route oracle exactly like
      // a bare endpoint digest — and no substring scan can catch a sha256.
      for (const key of PROVIDER_CORRELATED_HASH_KEYS) {
        if (record[key] !== null) {
          fail(
            `blinded record.${key} must be null; a bare digest over the `
            + 'provider response bytes is replayable against the declared '
            + 'route set and is not blinding',
          );
        }
      }
      assertSha256(record.rawResponseCommitment, 'record.rawResponseCommitment');
      assertSha256(record.turnReceiptCommitment, 'record.turnReceiptCommitment');
    } else {
      for (const key of PROVIDER_CORRELATED_HASH_KEYS) {
        assertSha256(record[key], `record.${key}`);
      }
      // Linear chain: the record chains after its own turn receipt.
      if (record.priorReceiptHash !== record.turnReceiptHash) {
        fail('record.priorReceiptHash must equal record.turnReceiptHash');
      }
      // Content addressing: the raw custody address is the sha256 of the raw
      // plaintext, which is exactly the raw response hash.
      if (record.rawResponseCustodyId !== record.rawResponseHash) {
        fail('record.rawResponseCustodyId must equal record.rawResponseHash');
      }
      for (const key of ['rawResponseCommitment', 'turnReceiptCommitment']) {
        if (record[key] !== null) {
          fail(`unblinded record.${key} must be null`);
        }
      }
    }
    if (typeof record.canonicalizationRequired !== 'boolean') {
      fail('record.canonicalizationRequired must be a boolean');
    }
    if (!DERIVATION_SOURCES.includes(record.derivationSource)) {
      fail(
        `record.derivationSource '${record.derivationSource}' is outside the `
        + `closed set ${canonicalJson([...DERIVATION_SOURCES])}`,
      );
    }
    if (record.aliasCommitmentRef !== null) {
      assertNonEmptyString(record.aliasCommitmentRef, 'record.aliasCommitmentRef');
    }
    assertExactKeys(
      record.samplingEvidence,
      SAMPLING_EVIDENCE_KEYS,
      'record.samplingEvidence',
    );
    const sampling = record.samplingEvidence;
    if (!Number.isInteger(sampling.maxOutputTokens) || sampling.maxOutputTokens <= 0) {
      fail('record.samplingEvidence.maxOutputTokens must be a positive integer');
    }
    if (!Number.isInteger(sampling.seedRequested)) {
      fail('record.samplingEvidence.seedRequested must be an integer');
    }
    if (!Number.isFinite(sampling.temperature) || sampling.temperature < 0) {
      fail('record.samplingEvidence.temperature must be a finite non-negative number');
    }
    // Honesty pin (spec line 226: temperature zero is not a determinism
    // receipt): seed acceptance is provider-unverified in this engine.
    if (sampling.seedAcceptedEvidence !== 'unverified') {
      fail('record.samplingEvidence.seedAcceptedEvidence must be unverified');
    }
    assertExactKeys(
      record.providerRouteEvidence,
      PROVIDER_ROUTE_EVIDENCE_KEYS,
      'record.providerRouteEvidence',
    );
    const evidence = record.providerRouteEvidence;
    assertSha256(evidence.serializerHash, 'providerRouteEvidence.serializerHash');
    if (record.routeIdentityBlinded) {
      for (const key of [
        'certificationReceiptHash',
        'endpointCommitment',
        'modelIdReported',
        'packageVersionReported',
        'processInstanceId',
        'routeId',
      ]) {
        if (evidence[key] !== null) {
          fail(
            `blinded record providerRouteEvidence.${key} must be null; it is `
            + 'enumerable against the declared route set',
          );
        }
      }
      assertSha256(record.routeCommitment, 'record.routeCommitment');
    } else {
      assertNonEmptyString(evidence.routeId, 'providerRouteEvidence.routeId');
      assertSha256(
        evidence.endpointCommitment,
        'providerRouteEvidence.endpointCommitment',
      );
      assertSha256(
        evidence.certificationReceiptHash,
        'providerRouteEvidence.certificationReceiptHash',
      );
      if (record.routeCommitment !== null) {
        fail('unblinded record.routeCommitment must be null');
      }
    }
    // Blinding law, re-checked on any record from any source.
    if (ADAPTER_ALIAS_PATTERN.test(canonicalJson(record))) {
      fail('captured-response record carries the sealed adapter-alias namespace');
    }
    const { receiptHash, ...unsigned } = record;
    assertSha256(receiptHash, 'record.receiptHash');
    if (canonicalDigest(unsigned) !== receiptHash) {
      fail('captured-response record receiptHash does not recompute');
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return { ok: false, failureReason: error?.message ?? String(error) };
  }
}

// ---------------------------------------------------------------------------
// Phase 0B fixture form + drop-in eligibility.
// ---------------------------------------------------------------------------

/**
 * Builds the six-field fixture form the frozen Phase 0B consumer requires,
 * reading the canonical response text back OUT of sealed custody (never from
 * an in-memory copy) and resolving the adapter alias from the sealed alias
 * commitment. The alias never travels in the public record; only the sealed
 * key-holder can produce this form.
 */
export function buildPhase0BFixtureForm(record, custodyStore) {
  validateCustodyStore(custodyStore);
  const check = verifyCapturedResponseRecord(record);
  if (!check.ok) {
    fail(`captured-response record does not verify: ${check.failureReason}`);
  }
  if (record.aliasCommitmentRef === null) {
    fail(
      'a Phase 0B fixture form requires a sealed alias commitment; this record '
      + 'carries no aliasCommitmentRef',
    );
  }
  const read = custodyStore.readObject(record.canonicalResponseCustodyId);
  const responseText = read.bytes.toString('utf8');
  if (sourceDigest(responseText) !== record.responseHash) {
    fail('sealed canonical response text does not match record.responseHash');
  }
  const adapterAlias = resolveSealedAdapterAlias(
    custodyStore,
    record.aliasCommitmentRef,
  );
  return Object.freeze({
    adapterAlias,
    parsedProposal: record.parsedProposal,
    residentId: record.residentId,
    responseId: record.responseId,
    responseText,
    type: PHASE0B_FIXTURE_TYPE,
  });
}

function resolveEntry(entry, custodyStore) {
  // An entry is either a captured-response record (the fixture form is then
  // derived from sealed custody) or an explicit { record, fixtureForm } pair.
  // The explicit pair exists so a HAND-AUTHORED candidate fixture can be
  // verified EXACTLY AS PRODUCED — the verifier must never rebuild or
  // normalize the value it is judging.
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'record' in entry) {
    return {
      fixtureForm: entry.fixtureForm,
      fixtureFormSupplied: true,
      record: entry.record,
    };
  }
  return {
    fixtureForm: buildPhase0BFixtureForm(entry, custodyStore),
    fixtureFormSupplied: false,
    record: entry,
  };
}

/**
 * Executable verifier of ALL SIX frozen drop-in constraints for an ORDERED
 * PAIR of captured-response records (see the contract in
 * scripts/model-village-phase0b-runtime.mjs:241, :394-399, :496-526, :557-562,
 * :654-666). Every constraint is a NAMED check and every check runs
 * independently, so a violation names itself instead of hiding behind the
 * first failure.
 *
 * Returns { eligible, checks }. Eligibility is proof that these records COULD
 * be dropped into the frozen plan; it performs no swap. Swapping changes
 * planExecutionSourceHash and is a study-lane admission decision.
 */
export function verifyDropInEligibility({ records, custodyStore } = {}) {
  const checks = [];
  const addCheck = (name, ok, detail) => {
    checks.push(Object.freeze({ name, ok, detail }));
  };
  const guard = (name, run) => {
    try {
      const result = run();
      addCheck(name, result.ok, result.detail);
      return result.ok;
    } catch (error) {
      addCheck(name, false, error?.message ?? String(error));
      return false;
    }
  };

  if (!Array.isArray(records) || records.length !== 2) {
    addCheck(
      'record-pair-arity',
      false,
      `drop-in eligibility is defined for an ordered pair; received `
      + `${Array.isArray(records) ? records.length : typeof records}`,
    );
    return deepFreeze({ eligible: false, checks });
  }
  addCheck('record-pair-arity', true, 'exactly two ordered records');

  let resolved = null;
  const resolvedOk = guard('fixture-forms-resolved', () => {
    validateCustodyStore(custodyStore);
    resolved = records.map((entry) => resolveEntry(entry, custodyStore));
    const supplied = resolved.filter((entry) => entry.fixtureFormSupplied).length;
    return {
      ok: true,
      detail: supplied === 0
        ? 'both fixture forms derived from sealed custody'
        : `${supplied} fixture form(s) supplied verbatim by the caller`,
    };
  });
  if (!resolvedOk) return deepFreeze({ eligible: false, checks });

  const forms = resolved.map((entry) => entry.fixtureForm);
  const recordList = resolved.map((entry) => entry.record);

  // (record integrity) Every record must independently verify.
  guard('record-receipts-verify', () => {
    const failures = [];
    recordList.forEach((record, index) => {
      const check = verifyCapturedResponseRecord(record);
      if (!check.ok) failures.push(`[${index}] ${check.failureReason}`);
    });
    return {
      ok: failures.length === 0,
      detail: failures.length === 0
        ? 'both captured-response records verify'
        : failures.join('; '),
    };
  });

  // (1a) EXACTLY the six frozen keys.
  guard('fixture-form-exact-keys', () => {
    const failures = [];
    forms.forEach((form, index) => {
      try {
        assertExactKeys(form, PHASE0B_FIXTURE_KEYS, `fixture[${index}]`);
      } catch (error) {
        failures.push(error.message);
      }
    });
    return {
      ok: failures.length === 0,
      detail: failures.length === 0
        ? `keys are exactly ${canonicalJson([...PHASE0B_FIXTURE_KEYS])}`
        : failures.join('; '),
    };
  });

  // (1b) type pinned to the frozen fixture type.
  guard('fixture-type-pinned', () => {
    const failures = [];
    forms.forEach((form, index) => {
      if (form?.type !== PHASE0B_FIXTURE_TYPE) {
        // The observed value is NOT echoed: on a caller-supplied fixture it is
        // untrusted text, and this detail lands in a durable public receipt.
        failures.push(
          `fixture[${index}].type is not '${PHASE0B_FIXTURE_TYPE}'`,
        );
      }
    });
    return {
      ok: failures.length === 0,
      detail: failures.length === 0
        ? `both fixtures declare '${PHASE0B_FIXTURE_TYPE}'`
        : failures.join('; '),
    };
  });

  // (2a) responseText parses as strict JSON.
  const parsedTexts = [];
  guard('response-text-strict-json', () => {
    const failures = [];
    forms.forEach((form, index) => {
      try {
        const parsed = JSON.parse(form?.responseText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error(NOT_A_JSON_OBJECT);
        }
        parsedTexts[index] = parsed;
      } catch (error) {
        parsedTexts[index] = null;
        failures.push(`fixture[${index}]: ${projectResponseTextParseFailure(error)}`);
      }
    });
    return {
      ok: failures.length === 0,
      detail: failures.length === 0
        ? 'both responseText values parse as strict JSON objects'
        : failures.join('; '),
    };
  });

  // (2b) responseText is BYTE-EQUAL to its own canonical serialization. The
  // value is observed AS PRODUCED; it is never canonicalized and then
  // declared canonical.
  guard('response-text-canonical-byte-equal', () => {
    const failures = [];
    forms.forEach((form, index) => {
      const parsed = parsedTexts[index];
      if (parsed === null || parsed === undefined) {
        failures.push(`fixture[${index}]: unparsed responseText cannot be canonical`);
        return;
      }
      const canonical = canonicalJson(parsed);
      if (canonical !== form.responseText) {
        failures.push(
          `fixture[${index}] responseText is not byte-equal to its canonical `
          + 'sorted-key serialization',
        );
      }
    });
    return {
      ok: failures.length === 0,
      detail: failures.length === 0
        ? 'both responseText values are their own canonical serialization'
        : failures.join('; '),
    };
  });

  // (3) parsedProposal === expectedProposal(JSON.parse(responseText)).
  guard('parsed-proposal-matches-expected', () => {
    const failures = [];
    forms.forEach((form, index) => {
      const parsed = parsedTexts[index];
      if (parsed === null || parsed === undefined) {
        failures.push(`fixture[${index}]: unparsed responseText has no expected proposal`);
        return;
      }
      const expected = expectedProposal(parsed);
      if (expected !== form.parsedProposal) {
        // Both sides are model-DERIVED strings; neither is echoed into a
        // durable public artifact (same rule as the parse-failure projection).
        failures.push(
          `fixture[${index}] parsedProposal does not equal the frozen `
          + 'expectedProposal derivation of its own responseText',
        );
      }
    });
    return {
      ok: failures.length === 0,
      detail: failures.length === 0
        ? 'both parsedProposal values match the frozen expectedProposal rule'
        : failures.join('; '),
    };
  });

  // (4) residents are exactly resident-01 then resident-02, IN ORDER.
  guard('resident-order-exact', () => {
    const observed = forms.map((form) => form?.residentId ?? null);
    const ok = canonicalJson(observed)
      === canonicalJson([...PHASE0B_REQUIRED_RESIDENT_ORDER]);
    return {
      ok,
      detail: ok
        ? `residents are ${canonicalJson(observed)} in order`
        : `residents ${canonicalJson(observed)} != required ordered `
          + `${canonicalJson([...PHASE0B_REQUIRED_RESIDENT_ORDER])}`,
    };
  });

  // (5) responseHash uses the sourceDigest formula over the CRLF-normalized
  // raw utf8 of responseText — NOT a canonical re-serialization.
  guard('response-hash-source-digest', () => {
    const failures = [];
    forms.forEach((form, index) => {
      const record = recordList[index];
      if (typeof form?.responseText !== 'string') {
        failures.push(`fixture[${index}]: responseText is not a string`);
        return;
      }
      const digest = sourceDigest(form.responseText);
      if (digest !== record?.responseHash) {
        failures.push(
          `fixture[${index}] sourceDigest(responseText) does not equal the `
          + 'record responseHash',
        );
      }
    });
    return {
      ok: failures.length === 0,
      detail: failures.length === 0
        ? 'both responseHash values recompute under the frozen sourceDigest formula'
        : failures.join('; '),
    };
  });

  // (4b/5b) two DISTINCT response hashes.
  guard('response-hashes-distinct', () => {
    const hashes = recordList.map((record) => record?.responseHash ?? null);
    const ok = hashes.every((hash) => typeof hash === 'string')
      && new Set(hashes).size === 2;
    return {
      ok,
      detail: ok
        ? 'the two captured responses hash distinctly'
        : 'the two captured responses do not produce two distinct responseHash '
          + 'values (the frozen consumer requires two distinct residents)',
    };
  });

  // (6) the hash-binding shape plan hydration expects: lowercase sha256 for
  // the two __CAPTURED_RESPONSE_HASH_* placeholders, and positionally bound
  // parsedProposal / residentId values that survive the single-quoted plan
  // string the kernel parser requires.
  guard('plan-hydration-binding-shape', () => {
    const failures = [];
    recordList.forEach((record, index) => {
      const form = forms[index];
      if (!SHA256_PATTERN.test(String(record?.responseHash))) {
        failures.push(
          `[${index}] responseHash is not lowercase sha256 hex; the `
          + `__CAPTURED_RESPONSE_HASH_0${index + 1}__ placeholder cannot hydrate`,
        );
      }
      for (const [label, value] of [
        ['parsedProposal', form?.parsedProposal],
        ['residentId', form?.residentId],
        ['responseText', form?.responseText],
      ]) {
        if (typeof value !== 'string' || value.length === 0) {
          failures.push(`[${index}] ${label} is not a non-empty string`);
          continue;
        }
        if (PLAN_EMBEDDABLE_FORBIDDEN.test(value)) {
          failures.push(
            `[${index}] ${label} contains a quote, backslash, or newline and `
            + 'cannot be embedded in the single-quoted plan/source string',
          );
        }
      }
      if (form?.parsedProposal !== undefined && record?.parsedProposal !== undefined
        && form.parsedProposal !== record.parsedProposal) {
        failures.push(
          `[${index}] fixture parsedProposal does not equal the record's `
          + 'parsedProposal; positional plan binding would disagree',
        );
      }
      if (form?.residentId !== undefined && record?.residentId !== undefined
        && form.residentId !== record.residentId) {
        failures.push(
          `[${index}] fixture residentId does not equal the record's residentId; `
          + 'positional plan binding would disagree',
        );
      }
    });
    return {
      ok: failures.length === 0,
      detail: failures.length === 0
        ? 'both records carry a plan-hydratable (hash, parsedProposal, residentId) binding'
        : failures.join('; '),
    };
  });

  const eligible = checks.every((check) => check.ok);
  return deepFreeze({ eligible, checks });
}
