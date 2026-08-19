/* global Buffer, process, structuredClone */

/**
 * Model Village MV-B4 custody-backed run-manifest validator (CUSTODY LANE).
 *
 * Closes the gate row "Trust and outer verification" in
 * docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md, whose REMAINING column is
 * exactly: "Production validator provisioning, custody, rotation, revocation,
 * trust publication, and fleet verification." Spec lines 256-261 name the same
 * gap: the bundled createRuntimeInjectedValidatorFixture() generates an
 * EPHEMERAL engineering key pair and exposes both inputs for the drill; it is
 * not production key provisioning, custody, or a trust root.
 *
 * This module supplies the custody-backed DROP-IN for that fixture pair.
 * scripts/model-village-phase0b-runtime.mjs is NOT modified: the tracer keeps
 * consuming `{ trustedValidatorConfig, signRunManifest }` exactly as before.
 *
 * Language boundary (spec "Source layout"): JavaScript key custody,
 * canonicalization, signing, and verification only. No resident reasoning, no
 * village rules, no experimental treatments, no scoring policy, no
 * model-specific behavior.
 *
 * ===========================================================================
 * OBSERVED DROP-IN CONTRACT (recorded so the next agent need not re-derive it)
 * ===========================================================================
 * Read from scripts/model-village-phase0b-runtime.mjs at the commit this
 * module was written against:
 *
 * createRuntimeInjectedValidatorFixture(options) -> :770
 *   returns Object.freeze({ config, configHash, issue })
 *   - config: deepFrozen, EXACTLY these 10 keys (verifier asserts exact keys
 *     at :837-852):
 *       algorithm             'Ed25519'                     (exact string)
 *       authorityId           free string, default
 *                             'model-village-trusted-validator-001'
 *       immutable             true                          (exact)
 *       injectionOrigin       'host_process_boot_argument'  (exact)
 *       keyCustody            fixture default
 *                             'ephemeral_engineering_fixture'
 *       publicKeyFingerprint  sourceDigest(publicKeyPem)
 *       publicKeyPem          spki PEM string
 *       registryReceiptId     free string
 *       schema                PHASE0B_VALIDATOR_SCHEMA
 *       validatorSourceHash   lowercase sha256 hex
 *   - configHash: canonicalDigest(config)
 *   - issue(manifest) -> deepFrozen receipt with EXACTLY these 7 keys
 *     (verifier asserts exact keys at :821-833):
 *       config             structuredClone(config)
 *       configHash         canonicalDigest(config)
 *       manifest           structuredClone(manifest)
 *       manifestHash       canonicalDigest(manifestSnapshot)
 *       schema             PHASE0B_VALIDATOR_RECEIPT_SCHEMA
 *       signatureBase64    Ed25519 over
 *                          Buffer.from(canonicalJson(payload),'utf8'), base64
 *       signedPayloadHash  canonicalDigest(payload)
 *     where payload = { configHash, domain: VALIDATOR_DOMAIN, manifestHash }
 *     (validatorSigningPayload at :762) and
 *     VALIDATOR_DOMAIN = 'hololand:model-village:phase0b:trusted-validator:v1'
 *     (:68, module-private -> mirrored here as PHASE0B_VALIDATOR_DOMAIN).
 *     issue() also runs assertRunManifest(manifest) before signing.
 *
 * verifyRuntimeInjectedValidator(receipt, expectedPins) -> :818 pins:
 *   - receipt exact keys, receipt.schema
 *   - config exact keys; config.schema, algorithm 'Ed25519', immutable true,
 *     injectionOrigin 'host_process_boot_argument'
 *   - config.keyCustody MUST be one of
 *       ['ephemeral_engineering_fixture', 'external_host_key']   (:859-862)
 *   - validatorSourceHash is sha256 hex
 *   - publicKeyFingerprint === sourceDigest(publicKeyPem)
 *   - configHash === canonicalDigest(config)
 *   - assertRunManifest(receipt.manifest); manifestHash matches
 *   - signedPayloadHash matches the recomputed payload
 *   - Ed25519 verify against config.publicKeyPem
 *   - expectedPins.trustedConfig: canonicalJson equality with the host's
 *     frozen trusted config; every other pin is a config field equality check
 *
 * runPhase0BEngineeringTracer(options) -> :2594 requires a FROZEN
 * options.trustedValidatorConfig plus a separate options.signRunManifest
 * function (:2629-2640), calls signRunManifest(runManifest), and rejects the
 * run unless verifyRuntimeInjectedValidator(receipt, { trustedConfig }) is
 * valid (:2641-2653).
 *
 * CONSEQUENCE FOR THIS MODULE (the one non-obvious mapping): the runtime
 * verifier's keyCustody allowlist has only two members. A custody-backed
 * validator therefore publishes `external_host_key` in the SIGNED runtime
 * config -- that is the allowlist's non-ephemeral member, and it is the honest
 * statement at that layer ("the key did not come from the in-process fixture").
 * The richer custody claim, `sealed-custody-store`, is carried by THIS
 * module's provision receipt and key record (VALIDATOR_KEY_CUSTODY), which is
 * where custody is actually described. Both values are asserted by the test
 * suite so a future allowlist change fails loud instead of drifting.
 *
 * ===========================================================================
 * KEY CUSTODY LAW (the load-bearing rule of this module)
 * ===========================================================================
 * Ed25519 PRIVATE key material may exist ONLY (a) inside the encrypted MV-B1
 * sealed custody store, and (b) transiently in memory while signing. It must
 * NEVER appear in a public receipt, a registry file, a log line, a thrown
 * error, a test snapshot, or a filename. Public artifacts carry the PUBLIC
 * key, its fingerprint, and signatures only.
 *
 * Enforced in code, not merely intended:
 * - provisionValidatorKey seals the PKCS8 DER through custodyStore.sealObject
 *   and then ZEROES its own plaintext buffer. No plaintext key file is ever
 *   written, not even under a temp directory.
 * - Every public artifact this module emits is passed through
 *   assertNoPrivateKeyMaterial(), an ACTIVE audit that walks every string and
 *   rejects PEM private-key banners, the bare phrase, and STRUCTURALLY
 *   DER-framed private keys (PKCS#8 / PKCS#1 / SEC1, with or without a banner,
 *   decoded at all four base64 phases and every byte offset). At provisioning
 *   it additionally probes for the exact base64/hex encodings of the PKCS8 DER
 *   and its 32-byte seed. The structural half runs at EVERY call site.
 *   Construction is not trusted.
 * - HONEST LIMIT: a raw 32-byte Ed25519 seed carries no DER framing and is
 *   byte-indistinguishable from a raw public key, so it cannot be detected.
 *   DER/PEM-framed detection — the shape every node:crypto export produces —
 *   is what is claimed.
 * - assertNoPrivateKeyMaterial's own error message never echoes the secret it
 *   found (an anti-leak audit that leaks in its failure path is not an audit).
 * - The private key is re-read from custody on EVERY signature and dropped
 *   immediately; it is never cached on a closure that outlives the call.
 *
 * SIGNING-PATH TRADEOFF (chosen deliberately):
 *   read-per-signature, NOT cache-once-per-validator.
 *   Cost: one custody decrypt + one hash-chained access-log append per
 *   signature, so signing is I/O bound and leaves an audit trail that grows
 *   with signature count.
 *   Benefit: the process holds decrypted private key material for microseconds
 *   around a single sign() call instead of for the lifetime of the validator
 *   handle, a heap snapshot or core dump taken between signatures contains no
 *   key, and revoking custody access takes effect on the very next signature
 *   rather than after a restart. The audit-trail growth is a FEATURE for a
 *   research validator: named-operator access accounting is exactly what the
 *   spec's sealed-store requirement asks for.
 *   Honest limit: the Buffer holding the PKCS8 DER is zeroed after use, but
 *   Node's KeyObject keeps its own internal copy and exposes no zeroing API.
 *   This module does NOT claim memory scrubbing of KeyObject internals, and
 *   does NOT claim protection against an attacker who can read process memory
 *   during the signing window.
 *
 * ===========================================================================
 * REVOCATION SEMANTICS (the subtle rule, decided and pinned here)
 * ===========================================================================
 * A revocation is a statement about TIME, not an eraser. Given a key record
 * revoked at `revokedAt`:
 *  1. A signature whose asserted signing time is STRICTLY BEFORE revokedAt
 *     remains verifiable. Erasing the historical record would let a single
 *     compromise destroy every prior research artifact the key ever attested,
 *     which is the opposite of what an audit trail is for.
 *  2. A signature whose asserted signing time is AT OR AFTER revokedAt is
 *     invalid (`signature-after-revocation`). The boundary instant belongs to
 *     the revocation: revokedAt is the first invalid instant.
 *  3. If the revocation reason is a COMPROMISE reason
 *     (VALIDATOR_COMPROMISE_REVOCATION_REASONS), historical signatures are
 *     additionally marked `suspect`: they still verify cryptographically and
 *     are still returned ok:true, but every verification result carries
 *     disposition 'suspect' so a downstream reader can quarantine rather than
 *     silently trust them. Suspicion is surfaced, never silently applied and
 *     never used to erase.
 *  4. Revocation NEVER invalidates a SUPERSESSION. Rotation is not compromise,
 *     so revoking a key that was already superseded leaves the supersession
 *     standing: the successor is still the successor, and the predecessor's
 *     pre-overlap history stays verifiable. It does NOT mean the overlap
 *     cutoff stops applying — BOTH cutoffs are evaluated whenever they are set,
 *     because a revocation that widened trust would be the exact inverse of
 *     what a revocation is.
 *
 * ===========================================================================
 * ASSERTED SIGNING TIME -- THE HONEST LIMIT OF EVERYTHING ABOVE
 * ===========================================================================
 * The signed payload is { configHash, domain, manifestHash }. IT COMMITS TO NO
 * TIME AT ALL, and neither the 7-key validator receipt (fixed by the drop-in
 * contract) nor the phase0b run manifest carries a timestamp field. So `atTime`
 * is supplied out of band by whoever presents the artifact.
 *
 * Consequence, stated plainly rather than buried: EVERY temporal rule in this
 * module (revokedAt, overlapUntil, notBefore/notAfter) is enforced against a
 * time the relying party did not observe and cannot check. A holder of a
 * revoked key can sign a new artifact today, assert a pre-revocation atTime,
 * and it will verify. Revocation here is therefore NOT enforceable against a
 * party that controls the asserted time; it is enforceable against a party that
 * reports the time honestly, which is the research-artifact threat model this
 * slice is for.
 *
 * The only signal that survives a backdated presentation is
 * historicalSignatureDisposition: a COMPROMISE revocation marks the key's whole
 * history 'suspect', so the forgery lands as ok:true/disposition:'suspect'
 * rather than silently trusted. For a NON-compromise reason
 * ('policy-retirement', 'operator-request', 'end-of-study') there is no signal.
 *
 * Closing this would take a trusted timestamp authority or a countersigned
 * time attestation from an independent party. A self-signed timestamp from the
 * same key would close nothing — whoever can forge the signature can forge the
 * timestamp too — so none is invented here.
 * VALIDATOR_CUSTODY_CLAIM_BOUNDARY pins signingTimeBoundBySignatureClaimed and
 * revocationEnforceableAgainstBackdatedTimeClaimed false so a machine reader
 * does not have to infer this from prose.
 *
 * KEY-MATERIAL DESTRUCTION, scoped honestly. MV-B1 deliberately exposes no
 * per-object destruction: its deletion method is content-key destruction with
 * append-only nonidentifying tombstones, never chain rewriting. Therefore
 * destroyKeyMaterial:true performs MV-B1 content-key destruction, which is
 * STORE-SCOPED. Consequences, all enforced:
 *  - The private-key ciphertext file is not unlinked. It becomes permanently
 *    undecryptable. The object is unrecoverable, not absent -- that is the
 *    exact claim, and the receipt records
 *    keyMaterialDestructionMethod 'custody-content-key-destruction'.
 *  - Destruction is REFUSED (fail loud) if the store holds ANY sealed object
 *    that is not this validator's own private key -- another validator's key,
 *    a captured response, an alias record, anything a peer or successor slice
 *    sealed there -- because store-scoped destruction erases every sealed
 *    object regardless of kind. Callers that intend to destroy must give each
 *    validator key its own custody store.
 *  - ROTATION NEVER DESTROYS ANYTHING. rotateValidatorKey marks the
 *    predecessor `superseded`, never `revoked`, and never touches key
 *    material: destroying a predecessor's key would not invalidate its past
 *    signatures (they verify from the PUBLIC key) but it WOULD destroy the
 *    custody chain evidence that the key was ever properly held. Historical
 *    verifiability is the whole point of an overlap window.
 *
 * PUBLISHING sha256(PKCS8) -- stated, not hidden. The public provision receipt
 * carries privateKeyCustodyId, and MV-B1's custodyId is sha256 of the
 * PLAINTEXT, i.e. sha256 of the PKCS8 DER. That is a confirmation oracle for a
 * GUESSED private key. It is safe here for the same reason MV-B1 treats
 * custodyIds as public nonidentifying content hashes: the preimage is 256-bit
 * CSPRNG material, so there is nothing to guess. It is NOT safe for any
 * low-entropy secret, and this module seals nothing else.
 *
 * ===========================================================================
 * TRUST PUBLICATION -- LOCAL ONLY
 * ===========================================================================
 * "Trust publication" here means a LOCAL canonical trust registry document
 * plus its receipt. publishValidatorTrustRegistry writes a file and computes
 * hashes. It performs NO network I/O, contacts no remote host, and reaches no
 * external service; networkPublicationClaimed is pinned false on every
 * publication receipt.
 *
 * ===========================================================================
 * CLAIM BOUNDARY (what this slice does NOT claim) -- see also
 * VALIDATOR_CUSTODY_CLAIM_BOUNDARY, which pins each flag machine-readably.
 * ===========================================================================
 * This is the EXPERIMENT's research-artifact validator: it signs run
 * manifests. It is NOT a wallet, NOT treasury custody, NOT a minting
 * authority, and must never be described as one. It does not claim a live
 * study run, Phase 1 admission or readiness, HSM or hardware-backed key
 * storage, multi-party or threshold signing, an external/public trust root, a
 * trusted timestamp authority, or fleet DEPLOYMENT. It claims fleet
 * VERIFIABILITY: verifyValidatorSignature is pure and needs no custody store,
 * so a party holding only public trust config can verify.
 *
 * MV-B1's CUSTODY_STORE_CLAIM_BOUNDARY pins
 * productionValidatorCustodyClaimed:false. That file is not edited here; this
 * module is the slice that supplies the capability, and states its own scope
 * in VALIDATOR_CUSTODY_CLAIM_BOUNDARY.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHASE0B_VALIDATOR_RECEIPT_SCHEMA,
  PHASE0B_VALIDATOR_SCHEMA,
  canonicalDigest,
  canonicalJson,
  verifyRuntimeInjectedValidator,
} from './model-village-phase0b-runtime.mjs';

export const VALIDATOR_CUSTODY_SCHEMA =
  'hololand.model-village-validator-custody.v1';
export const VALIDATOR_KEY_RECORD_SCHEMA =
  'hololand.model-village-validator-key-record.v1';
export const VALIDATOR_PROVISION_RECEIPT_SCHEMA =
  'hololand.model-village-validator-provision-receipt.v1';
export const VALIDATOR_ROTATION_RECEIPT_SCHEMA =
  'hololand.model-village-validator-rotation-receipt.v1';
export const VALIDATOR_REVOCATION_RECEIPT_SCHEMA =
  'hololand.model-village-validator-revocation-receipt.v1';
export const VALIDATOR_TRUST_PUBLICATION_RECEIPT_SCHEMA =
  'hololand.model-village-validator-trust-publication-receipt.v1';
export const VALIDATOR_CUSTODY_ENGINE =
  'hololand-model-village-validator-custody-v1';

/**
 * Mirror of the runtime's module-private VALIDATOR_DOMAIN (phase0b-runtime
 * :68). Drift is caught structurally, not by inspection: every receipt this
 * module issues is self-verified through the SHIPPED
 * verifyRuntimeInjectedValidator, which recomputes the payload with the real
 * constant. If this literal ever diverges, issue() fails loud immediately.
 */
export const PHASE0B_VALIDATOR_DOMAIN =
  'hololand:model-village:phase0b:trusted-validator:v1';

/**
 * Seed for the FIRST provision receipt's priorReceiptHash.
 *
 * HONEST SHAPE, so the name is not read as more than it is: the lifecycle
 * receipts form a STAR anchored on the provision receipt, not a linear chain.
 * rotateValidatorKey and revokeValidatorKey both set
 * priorReceiptHash = <key record>.provisionReceiptHash, so a rotation receipt
 * and a revocation receipt are SIBLINGS of the provision receipt rather than
 * links to each other. Reordering them, or dropping the rotation receipt,
 * leaves every remaining receipt hash self-consistent — hash ordering between
 * lifecycle events is NOT established here. The append-only ORDER lives in the
 * trust-registry lane's prevEntryHash chain, which is where a fleet party reads
 * it. Pinned machine-readably as
 * VALIDATOR_CUSTODY_CLAIM_BOUNDARY.receiptLifecycleChainIsLinearClaimed:false.
 */
export const VALIDATOR_GENESIS_RECEIPT_HASH = '0'.repeat(64);

/** MV-B1 custody `kind` for a sealed validator private key. */
export const VALIDATOR_PRIVATE_KEY_CUSTODY_KIND = 'validator-private-key';

/** Custody descriptor published by THIS module's receipts and key records. */
export const VALIDATOR_KEY_CUSTODY = 'sealed-custody-store';

/**
 * Custody descriptor published in the SIGNED runtime config. The runtime
 * verifier allowlists exactly two values (phase0b-runtime :859-862); this is
 * its non-ephemeral member, and contrasts with the fixture's
 * 'ephemeral_engineering_fixture'.
 */
export const VALIDATOR_RUNTIME_KEY_CUSTODY = 'external_host_key';

/**
 * Closed revocation vocabulary. Deliberately an ENUM rather than free text:
 * compromise disposition is DERIVED from the reason, so a typo in free text
 * ('key-compromis') would silently downgrade historical signatures from
 * 'suspect' to 'valid'. Fail closed instead.
 */
export const VALIDATOR_REVOCATION_REASONS = Object.freeze([
  'custody-compromise',
  'end-of-study',
  'key-compromise',
  'operator-compromise',
  'operator-request',
  'policy-retirement',
  'superseded-cleanup',
]);

/** Reasons that additionally mark historical signatures 'suspect'. */
export const VALIDATOR_COMPROMISE_REVOCATION_REASONS = Object.freeze([
  'custody-compromise',
  'key-compromise',
  'operator-compromise',
]);

/**
 * Machine-readable claim boundary. Every flag this slice must never claim is
 * pinned false here and asserted by the suite.
 */
export const VALIDATOR_CUSTODY_CLAIM_BOUNDARY = Object.freeze({
  custodyBackedValidatorImplemented: true,
  fleetVerifiabilityImplemented: true,
  localTrustRegistryPublicationImplemented: true,
  engineeringCertificationDrill: true,
  externalPublicTrustRootClaimed: false,
  fleetDeploymentClaimed: false,
  hardwareBackedKeyStorageClaimed: false,
  liveStudyRunClaimed: false,
  mintingAuthorityClaimed: false,
  multiPartyThresholdSigningClaimed: false,
  networkTrustPublicationClaimed: false,
  phase1AdmissionClaimed: false,
  phase1ReadinessClaimed: false,
  processMemoryScrubbingClaimed: false,
  // The lifecycle receipts all chain from the key's PROVISION receipt (a star
  // anchored on provisioning), NOT from one another. Ordering between a
  // rotation and a revocation receipt is therefore NOT established by hashes.
  receiptLifecycleChainIsLinearClaimed: false,
  // A revoked key's holder can sign now and assert a pre-revocation time.
  revocationEnforceableAgainstBackdatedTimeClaimed: false,
  // The signed payload is { configHash, domain, manifestHash } — no timestamp.
  signingTimeBoundBySignatureClaimed: false,
  treasuryOrWalletCustodyClaimed: false,
  trustedTimestampAuthorityClaimed: false,
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const VALIDATOR_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const REGISTRY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const PEM_PRIVATE_KEY_PATTERN = /PRIVATE KEY/;
/**
 * Candidate base64 runs long enough to carry a DER-framed key. `=` is excluded
 * from the RUN body and allowed only as trailing padding, so a prefix such as
 * `keyMaterial=<blob>` splits into a short prefix and the real blob instead of
 * merging into one misaligned run.
 */
const BASE64_RUN_PATTERN = /[A-Za-z0-9+/]{40,}={0,2}/g;
const ED25519_SEED_BYTE_LENGTH = 32;

const KEY_RECORD_KEYS = Object.freeze([
  'algorithm',
  'historicalSignatureDisposition',
  'keyCustody',
  'keyFingerprint',
  'notAfter',
  'notBefore',
  'overlapUntil',
  'privateKeyCustodyId',
  'provisionReceiptHash',
  'publicKeyPem',
  'publicKeySpkiSha256',
  'registryReceiptId',
  'revocationReason',
  'revokedAt',
  'schema',
  'status',
  'supersededBy',
  'supersedes',
  'validatorId',
]);

const PROVISION_RECEIPT_KEYS = Object.freeze([
  'algorithm',
  'at',
  'engine',
  'keyCustody',
  'keyFingerprint',
  'notAfter',
  'notBefore',
  'priorReceiptHash',
  'privateKeyCustodyId',
  'publicKeyPem',
  'publicKeySpkiSha256',
  'receiptHash',
  'schema',
  'status',
  'supersedes',
  'validatorId',
]);

const RUNTIME_CONFIG_KEYS = Object.freeze([
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
]);

/** Typed error for every MV-B4 validator-custody refusal. Fail loud. */
export class ModelVillageValidatorCustodyError extends Error {
  constructor(message, code = 'validator-custody-error') {
    super(message);
    this.name = 'ModelVillageValidatorCustodyError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ModelVillageValidatorCustodyError(message, code);
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Byte-identical replication of the runtime's module-private sourceDigest
 * (phase0b-runtime :241 over normalizeSource :197). publicKeyFingerprint must
 * match it exactly or verifyRuntimeInjectedValidator rejects the receipt.
 */
function sourceDigest(value) {
  return sha256Hex(Buffer.from(String(value).replace(/\r\n?/g, '\n'), 'utf8'));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function isoNow() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail('invalid-input', `${label} must be a non-empty string`);
  }
}

function assertIsoUtc(value, label) {
  assertNonEmptyString(value, label);
  if (!ISO_UTC_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    fail(
      'invalid-timestamp',
      `${label} must be an ISO-8601 UTC timestamp ending in Z`,
    );
  }
  return Date.parse(value);
}

function assertValidatorId(value, label) {
  assertNonEmptyString(value, label);
  if (!VALIDATOR_ID_PATTERN.test(value)) {
    fail(
      'invalid-validator-id',
      `${label} must match ${VALIDATOR_ID_PATTERN} `
      + '(lowercase, hyphenated, 3-64 chars)',
    );
  }
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('invalid-shape', `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    const missing = expected.filter((key) => !actual.includes(key));
    const unexpected = actual.filter((key) => !expected.includes(key));
    fail(
      'invalid-shape',
      `${label} keys differ; missing=${canonicalJson(missing)} `
      + `unexpected=${canonicalJson(unexpected)}`,
    );
  }
}

function assertCustodyStore(custodyStore, requiredMethods) {
  if (!custodyStore || typeof custodyStore !== 'object') {
    fail('invalid-custody-store', 'custodyStore must be a sealed custody store');
  }
  for (const method of requiredMethods) {
    if (typeof custodyStore[method] !== 'function') {
      fail(
        'invalid-custody-store',
        `custodyStore must expose ${method}()`,
      );
    }
  }
  if (custodyStore.closed === true) {
    fail('custody-store-closed', 'custodyStore handle is closed');
  }
}

/**
 * Structural DER check for private-key framing.
 *
 * PKCS#8 PrivateKeyInfo  := SEQUENCE { INTEGER 0, AlgorithmIdentifier SEQ, .. }
 * PKCS#1 RSAPrivateKey   := SEQUENCE { INTEGER 0, INTEGER modulus, .. }
 * SEC1  ECPrivateKey     := SEQUENCE { INTEGER 1, OCTET STRING privateKey, .. }
 *
 * An SPKI PUBLIC key is SEQUENCE { AlgorithmIdentifier SEQ, BIT STRING }, so
 * its first inner tag is 0x30 (SEQUENCE) and never the 0x02 (INTEGER) version
 * field checked here — the published `publicKeyPem` cannot trip this audit.
 */
function derLooksLikePrivateKey(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16) return false;
  if (bytes[0] !== 0x30) return false;
  let cursor = 2;
  const lengthByte = bytes[1];
  if ((lengthByte & 0x80) !== 0) {
    const lengthBytes = lengthByte & 0x7f;
    if (lengthBytes < 1 || lengthBytes > 4) return false;
    cursor = 2 + lengthBytes;
  }
  if (cursor + 3 >= bytes.length) return false;
  if (bytes[cursor] !== 0x02 || bytes[cursor + 1] !== 0x01) return false;
  const version = bytes[cursor + 2];
  const next = bytes[cursor + 3];
  if (version === 0x00 && (next === 0x30 || next === 0x02)) return true;
  if (version === 0x01 && next === 0x04) return true;
  return false;
}

/** Scans every byte offset of a decode for private-key DER framing. */
function bytesCarryPrivateKeyFraming(bytes) {
  const limit = bytes.length - 16;
  for (let offset = 0; offset <= limit; offset += 1) {
    // Cheap first-byte filter: every candidate structure is a DER SEQUENCE.
    if (bytes[offset] !== 0x30) continue;
    if (derLooksLikePrivateKey(bytes.subarray(offset))) return true;
  }
  return false;
}

/**
 * STRUCTURAL private-material detector, not a keyword list.
 *
 * WHY THIS COPY EXISTS. It is byte-for-byte the same algorithm the trust
 * registry lane runs, deliberately duplicated rather than imported: this module
 * must not depend on the publication lane (and the publication lane must not
 * depend on the custody lane — that independence is what makes fleet
 * verification meaningful). A shared import would couple the two lanes at
 * exactly the seam the design keeps apart, so the algorithm is restated here
 * and both copies are pinned by their own suites.
 *
 * WHAT IT ADDS over the previous PEM-banner regex: a bare, header-less base64
 * PKCS#8 blob — the shape a naive "just strip the banner" leak takes — is now
 * caught. The base64 scan is EXHAUSTIVE over alignment: a payload may sit
 * behind an arbitrary prefix, which shifts it by both a base64 phase and a
 * whole number of bytes, so all four phases and every byte offset are checked.
 *
 * HONEST LIMIT: a raw 32-byte Ed25519 seed carries no DER framing and is
 * byte-indistinguishable from a raw public key. Detection of DER/PEM-framed
 * private keys — the shape every `node:crypto` export produces — is what is
 * claimed, and only that.
 */
function stringCarriesPrivateKeyMaterial(value) {
  // Catches both the PEM banner and the bare phrase in free text.
  if (PEM_PRIVATE_KEY_PATTERN.test(value)) return true;
  const compact = value.replace(/\s+/g, '');
  const runs = compact.match(BASE64_RUN_PATTERN);
  if (!runs) return false;
  for (const run of runs) {
    for (let phase = 0; phase < 4 && run.length - phase >= 40; phase += 1) {
      let decoded = null;
      try {
        decoded = Buffer.from(run.slice(phase), 'base64');
      } catch {
        decoded = null;
      }
      if (decoded && bytesCarryPrivateKeyFraming(decoded)) return true;
    }
  }
  return false;
}

/**
 * ACTIVE anti-leak audit. Walks every string reachable in a public artifact
 * and refuses PEM private-key headers, STRUCTURALLY DER-framed private keys
 * (with or without a banner), plus the exact encodings of any supplied
 * secrets. Construction is never trusted to have kept key material out.
 *
 * The structural half runs at EVERY call site, with or without `secrets`. The
 * `secrets` list is an additional exact-match probe used at provisioning,
 * where the module happens to hold the very bytes it must not publish; it is a
 * supplement to the structural scan, never a precondition for it. (Before this
 * fix the audit degraded to a `/PRIVATE KEY/` regex at eight of its nine call
 * sites, which is how a bare base64 PKCS#8 blob planted in a caller-supplied
 * `operator` / `registryId` string reached the published trust document.)
 *
 * The failure message names the FIELD PATH only. It never echoes the matched
 * value: an anti-leak audit whose error message prints the secret has leaked
 * it into every log that captures the throw.
 */
function assertNoPrivateKeyMaterial(value, label, secrets = []) {
  const forbidden = secrets.filter(
    (secret) => typeof secret === 'string' && secret.length >= 16,
  );
  const walk = (node, pathLabel) => {
    if (typeof node === 'string') {
      if (stringCarriesPrivateKeyMaterial(node)) {
        fail(
          'private-key-material-leak',
          `${pathLabel} carries private-key-shaped material`,
        );
      }
      for (const secret of forbidden) {
        if (node.includes(secret)) {
          fail(
            'private-key-material-leak',
            `${pathLabel} carries sealed private-key material`,
          );
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${pathLabel}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, entry] of Object.entries(node)) {
        if (stringCarriesPrivateKeyMaterial(key)) {
          fail(
            'private-key-material-leak',
            `${pathLabel} has a private-key-shaped field name`,
          );
        }
        walk(entry, `${pathLabel}.${key}`);
      }
    }
  };
  walk(value, label);
  return value;
}

/** receiptHash = canonicalDigest(receipt without receiptHash). */
function sealReceipt(receiptBody) {
  return deepFreeze({
    ...receiptBody,
    receiptHash: canonicalDigest(receiptBody),
  });
}

/** Recomputes and checks a receipt's self-hash. Pure; no custody needed. */
export function verifyValidatorReceiptHash(receipt) {
  if (!receipt || typeof receipt !== 'object') return false;
  const { receiptHash, ...body } = receipt;
  return typeof receiptHash === 'string'
    && canonicalDigest(body) === receiptHash;
}

function publicKeyMaterialFromPem(publicKeyPem) {
  const spkiDer = createPublicKey(publicKeyPem).export({
    format: 'der',
    type: 'spki',
  });
  return sha256Hex(spkiDer);
}

/** Synchronous bounded backoff; no timers, no deps, no async in this path. */
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // SharedArrayBuffer unavailable: spin briefly rather than fail the write.
    const until = Date.now() + ms;
    while (Date.now() < until) { /* bounded busy wait */ }
  }
}

/**
 * DURABLE ATOMIC publish: sibling temp file, fsync the descriptor, then rename
 * over the destination.
 *
 * The previous implementation opened the destination with 'w', which TRUNCATES
 * IT TO ZERO before the first byte is written. publishValidatorTrustRegistry
 * rewrites the SAME canonical trust document on every publication, so any
 * failure between the truncate and the completed write (ENOSPC, EIO, SIGKILL,
 * AV interference) destroyed the previously published trust root and left a
 * zero-length or partial file in its place. The rename bounds the failure to
 * "old complete file or new complete file", never a torn one — the same
 * guarantee the trust-registry lane's publishRegistryFile provides.
 *
 * WINDOWS: MoveFileEx over a destination another process holds open fails with
 * EPERM. A reader with a handle open (an editor, a backup agent, an AV scanner,
 * a fleet verifier mid-check) must not permanently break publication, so the
 * rename is retried with bounded backoff before the failure is reported.
 */
function writeFileDurable(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now().toString(36)}`;
  const fd = openSync(tempPath, 'wx');
  try {
    writeSync(fd, bytes, 0, bytes.length, 0);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      renameSync(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== 'EPERM' && error?.code !== 'EACCES' && error?.code !== 'EBUSY') break;
      sleepSync(5 * 2 ** attempt);
    }
  }
  try {
    if (existsSync(tempPath)) unlinkSync(tempPath);
  } catch {
    // Best-effort cleanup only; the rename failure is the reportable fault.
  }
  fail(
    'trust-document-publish-failed',
    `could not publish ${path.basename(filePath)} atomically `
    + `(${lastError?.code ?? 'unknown'}); the previously published document is `
    + 'untouched',
  );
}

/* ==========================================================================
 * Trust registry -- the LOCAL canonical trust root for this experiment lane.
 * ========================================================================== */

const REGISTRY_TOKEN = Symbol('mv-b4-validator-trust-registry');

class ValidatorTrustRegistry {
  #registryId;
  #operator;
  #records;

  constructor(token, { registryId, operator }) {
    if (token !== REGISTRY_TOKEN) {
      fail('invalid-input', 'use createValidatorTrustRegistry()');
    }
    this.#registryId = registryId;
    this.#operator = operator;
    this.#records = new Map();
  }

  get registryId() {
    return this.#registryId;
  }

  get operator() {
    return this.#operator;
  }

  /** Derives and stores a public key record from a provision receipt. */
  register(receipt) {
    assertProvisionReceipt(receipt);
    if (this.#records.has(receipt.validatorId)) {
      fail(
        'duplicate-validator-id',
        `validatorId ${receipt.validatorId} is already registered`,
      );
    }
    for (const record of this.#records.values()) {
      if (record.keyFingerprint === receipt.keyFingerprint) {
        fail(
          'duplicate-key-fingerprint',
          'a record with this key fingerprint is already registered',
        );
      }
    }
    const record = {
      algorithm: receipt.algorithm,
      historicalSignatureDisposition: 'valid',
      keyCustody: receipt.keyCustody,
      keyFingerprint: receipt.keyFingerprint,
      notAfter: receipt.notAfter,
      notBefore: receipt.notBefore,
      overlapUntil: null,
      privateKeyCustodyId: receipt.privateKeyCustodyId,
      provisionReceiptHash: receipt.receiptHash,
      publicKeyPem: receipt.publicKeyPem,
      publicKeySpkiSha256: receipt.publicKeySpkiSha256,
      registryReceiptId: [
        VALIDATOR_CUSTODY_ENGINE,
        this.#registryId,
        receipt.validatorId,
        receipt.receiptHash,
      ].join(':'),
      revocationReason: null,
      revokedAt: null,
      schema: VALIDATOR_KEY_RECORD_SCHEMA,
      status: 'active',
      supersededBy: null,
      supersedes: receipt.supersedes,
      validatorId: receipt.validatorId,
    };
    assertKeyRecord(record, `key record ${receipt.validatorId}`);
    assertNoPrivateKeyMaterial(record, `key record ${receipt.validatorId}`);
    this.#records.set(record.validatorId, record);
    return deepFreeze(structuredClone(record));
  }

  has(validatorId) {
    return this.#records.has(validatorId);
  }

  /** Frozen deep copy: a caller can never mutate registry state in place. */
  get(validatorId) {
    const record = this.#records.get(validatorId);
    return record ? deepFreeze(structuredClone(record)) : null;
  }

  list() {
    return deepFreeze(
      [...this.#records.values()]
        .sort((left, right) => (left.validatorId < right.validatorId ? -1 : 1))
        .map((record) => structuredClone(record)),
    );
  }

  #require(validatorId) {
    const record = this.#records.get(validatorId);
    if (!record) {
      fail(
        'validator-not-in-trust-registry',
        `validatorId ${validatorId} is not in the trust registry`,
      );
    }
    return record;
  }

  markSuperseded({ validatorId, supersededBy, overlapUntil }) {
    const record = this.#require(validatorId);
    if (record.status !== 'active') {
      fail(
        'invalid-status-transition',
        `validatorId ${validatorId} is ${record.status}; only an active key `
        + 'can be superseded',
      );
    }
    assertIsoUtc(overlapUntil, 'overlapUntil');
    record.status = 'superseded';
    record.supersededBy = supersededBy;
    record.overlapUntil = overlapUntil;
    return deepFreeze(structuredClone(record));
  }

  markSupersedes({ validatorId, supersedes }) {
    const record = this.#require(validatorId);
    record.supersedes = supersedes;
    return deepFreeze(structuredClone(record));
  }

  markRevoked({
    validatorId,
    reason,
    revokedAt,
    historicalSignatureDisposition,
  }) {
    const record = this.#require(validatorId);
    if (record.status === 'revoked') {
      fail(
        'invalid-status-transition',
        `validatorId ${validatorId} is already revoked`,
      );
    }
    record.status = 'revoked';
    record.revocationReason = reason;
    record.revokedAt = revokedAt;
    record.historicalSignatureDisposition = historicalSignatureDisposition;
    return deepFreeze(structuredClone(record));
  }

  /** Canonical, self-hashed, public-only trust document. */
  snapshot() {
    const body = {
      engine: VALIDATOR_CUSTODY_ENGINE,
      operator: this.#operator,
      recordCount: this.#records.size,
      records: this.list().map((record) => structuredClone(record)),
      registryId: this.#registryId,
      schema: VALIDATOR_CUSTODY_SCHEMA,
    };
    assertNoPrivateKeyMaterial(body, 'trust registry document');
    return deepFreeze({ ...body, registryHash: canonicalDigest(body) });
  }
}

export function createValidatorTrustRegistry({ registryId, operator } = {}) {
  assertNonEmptyString(registryId, 'registryId');
  if (!REGISTRY_ID_PATTERN.test(registryId)) {
    fail('invalid-input', `registryId must match ${REGISTRY_ID_PATTERN}`);
  }
  assertNonEmptyString(operator, 'operator');
  return new ValidatorTrustRegistry(REGISTRY_TOKEN, { registryId, operator });
}

function assertKeyRecord(record, label = 'key record') {
  assertExactKeys(record, KEY_RECORD_KEYS, label);
  if (record.schema !== VALIDATOR_KEY_RECORD_SCHEMA) {
    fail('invalid-shape', `${label} schema mismatch`);
  }
  if (record.algorithm !== 'ed25519') {
    fail('invalid-shape', `${label} algorithm must be ed25519`);
  }
  if (record.keyCustody !== VALIDATOR_KEY_CUSTODY) {
    fail('invalid-shape', `${label} keyCustody must be ${VALIDATOR_KEY_CUSTODY}`);
  }
  if (!['active', 'superseded', 'revoked'].includes(record.status)) {
    fail('invalid-shape', `${label} status is not a known status`);
  }
  if (
    !['valid', 'suspect'].includes(record.historicalSignatureDisposition)
  ) {
    fail('invalid-shape', `${label} historicalSignatureDisposition is unknown`);
  }
  if (!SHA256_PATTERN.test(record.keyFingerprint)) {
    fail('invalid-shape', `${label} keyFingerprint must be sha256 hex`);
  }
  if (record.publicKeySpkiSha256 !== record.keyFingerprint) {
    fail(
      'invalid-shape',
      `${label} publicKeySpkiSha256 must equal keyFingerprint`,
    );
  }
  assertIsoUtc(record.notBefore, `${label}.notBefore`);
  assertIsoUtc(record.notAfter, `${label}.notAfter`);
  return record;
}

function assertProvisionReceipt(receipt) {
  assertExactKeys(receipt, PROVISION_RECEIPT_KEYS, 'provision receipt');
  if (receipt.schema !== VALIDATOR_PROVISION_RECEIPT_SCHEMA) {
    fail('invalid-shape', 'provision receipt schema mismatch');
  }
  if (receipt.engine !== VALIDATOR_CUSTODY_ENGINE) {
    fail('invalid-shape', 'provision receipt engine mismatch');
  }
  if (!verifyValidatorReceiptHash(receipt)) {
    fail('receipt-hash-mismatch', 'provision receipt hash does not recompute');
  }
  return receipt;
}

/* ==========================================================================
 * Provisioning
 * ========================================================================== */

/**
 * Generates an Ed25519 validator key, SEALS the PKCS8 private key into the
 * supplied custody store, and returns a PUBLIC provision receipt.
 *
 * Inputs beyond the required five are optional and defaulted:
 *   trustRegistry    when supplied, the derived key record is registered
 *   priorReceiptHash chains this receipt (default: genesis)
 *   at               receipt timestamp (default: now)
 */
export function provisionValidatorKey({
  custodyStore,
  operator,
  validatorId,
  notBefore,
  notAfter,
  trustRegistry = null,
  priorReceiptHash = VALIDATOR_GENESIS_RECEIPT_HASH,
  at = isoNow(),
} = {}) {
  assertCustodyStore(custodyStore, ['sealObject']);
  assertNonEmptyString(operator, 'operator');
  assertValidatorId(validatorId, 'validatorId');
  // Validity window is REQUIRED. A validator key with no expiry is a
  // permanent trust anchor by accident; rotation policy needs a horizon.
  const notBeforeMs = assertIsoUtc(notBefore, 'notBefore');
  const notAfterMs = assertIsoUtc(notAfter, 'notAfter');
  if (notAfterMs <= notBeforeMs) {
    fail(
      'invalid-validity-window',
      'notAfter must be strictly after notBefore',
    );
  }
  assertIsoUtc(at, 'at');
  if (!SHA256_PATTERN.test(priorReceiptHash)) {
    fail('invalid-input', 'priorReceiptHash must be sha256 hex');
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' })
    .toString();
  const keyFingerprint = sha256Hex(
    publicKey.export({ format: 'der', type: 'spki' }),
  );
  const pkcs8Der = privateKey.export({ format: 'der', type: 'pkcs8' });
  // Encodings of the private key, computed ONLY to feed the anti-leak audit
  // below, and dropped with the plaintext buffer.
  const leakProbes = [
    pkcs8Der.toString('base64'),
    pkcs8Der.toString('hex'),
    pkcs8Der.subarray(-ED25519_SEED_BYTE_LENGTH).toString('base64'),
    pkcs8Der.subarray(-ED25519_SEED_BYTE_LENGTH).toString('hex'),
  ];

  let sealed;
  try {
    sealed = custodyStore.sealObject({
      bytes: pkcs8Der,
      kind: VALIDATOR_PRIVATE_KEY_CUSTODY_KIND,
      // Label is encrypted custody metadata, never a public field. It carries
      // the validatorId so revocation can prove a destroy is not collateral.
      label: `${VALIDATOR_PRIVATE_KEY_CUSTODY_KIND}:${validatorId}`,
    });
  } finally {
    // The plaintext PKCS8 buffer never outlives the seal call.
    pkcs8Der.fill(0);
  }
  if (!sealed || !SHA256_PATTERN.test(sealed.custodyId ?? '')) {
    fail('custody-seal-failed', 'custodyStore.sealObject returned no custodyId');
  }

  const receipt = sealReceipt({
    algorithm: 'ed25519',
    at,
    engine: VALIDATOR_CUSTODY_ENGINE,
    keyCustody: VALIDATOR_KEY_CUSTODY,
    keyFingerprint,
    notAfter,
    notBefore,
    priorReceiptHash,
    privateKeyCustodyId: sealed.custodyId,
    publicKeyPem,
    publicKeySpkiSha256: keyFingerprint,
    schema: VALIDATOR_PROVISION_RECEIPT_SCHEMA,
    status: 'active',
    supersedes: null,
    validatorId,
  });
  assertNoPrivateKeyMaterial(receipt, 'provision receipt', leakProbes);

  if (trustRegistry) {
    trustRegistry.register(receipt);
  }
  return Object.freeze({ keyFingerprint, publicKeyPem, receipt });
}

/* ==========================================================================
 * The drop-in: custody-backed { issue, config }
 * ========================================================================== */

const VALIDATOR_MODULE_SOURCE_HASH_HOLDER = { value: null };

/**
 * sha256 of THIS module's source, published as config.validatorSourceHash.
 * The ephemeral fixture publishes the digest of phase0b-runtime.mjs because
 * that file IS its validator; a custody-backed validator's code lives here, so
 * this file is what a verifier should pin. Lazy + cached: the value is pinned
 * into the signed config, so it must be stable for the process lifetime, and
 * re-reading it per signature would be pointless I/O.
 */
function validatorModuleSourceHash() {
  if (VALIDATOR_MODULE_SOURCE_HASH_HOLDER.value === null) {
    VALIDATOR_MODULE_SOURCE_HASH_HOLDER.value = sourceDigest(
      readFileSync(fileURLToPath(import.meta.url)),
    );
  }
  return VALIDATOR_MODULE_SOURCE_HASH_HOLDER.value;
}

function signingPayload(configHash, manifestHash) {
  return {
    configHash,
    domain: PHASE0B_VALIDATOR_DOMAIN,
    manifestHash,
  };
}

/**
 * THE DROP-IN. Same call shape and same returned shape as
 * createRuntimeInjectedValidatorFixture(), so
 * runPhase0BEngineeringTracer({ trustedValidatorConfig: v.config,
 * signRunManifest: v.issue }) accepts it unchanged.
 *
 * Refusals (all typed ModelVillageValidatorCustodyError):
 *   - key absent from the supplied trust registry
 *   - key revoked
 *   - key superseded (past signatures stay verifiable; issuing NEW signatures
 *     from a rotated-out key is refused)
 *   - signing time outside the key's validity window
 *   - custody key material destroyed / custody unreadable
 *
 * `now` is injectable for tests ONLY; it defaults to the system clock and this
 * module makes no trusted-timestamp claim.
 */
export function createCustodyBackedValidator({
  custodyStore,
  operator,
  validatorId,
  keyFingerprint,
  trustRegistry,
  authorityId = null,
  registryReceiptId = null,
  now = isoNow,
} = {}) {
  assertCustodyStore(custodyStore, ['readObject']);
  assertNonEmptyString(operator, 'operator');
  assertValidatorId(validatorId, 'validatorId');
  assertNonEmptyString(keyFingerprint, 'keyFingerprint');
  if (!trustRegistry || typeof trustRegistry.get !== 'function') {
    fail(
      'validator-not-in-trust-registry',
      'a trust registry is required: an unregistered key has no trust root',
    );
  }
  if (typeof now !== 'function') {
    fail('invalid-input', 'now must be a function returning an ISO timestamp');
  }

  const bootRecord = trustRegistry.get(validatorId);
  if (!bootRecord) {
    fail(
      'validator-not-in-trust-registry',
      `validatorId ${validatorId} is not in the supplied trust registry`,
    );
  }
  if (bootRecord.keyFingerprint !== keyFingerprint) {
    fail(
      'key-fingerprint-mismatch',
      `validatorId ${validatorId} registry fingerprint does not match the `
      + 'requested keyFingerprint',
    );
  }
  if (publicKeyMaterialFromPem(bootRecord.publicKeyPem) !== keyFingerprint) {
    fail(
      'key-fingerprint-mismatch',
      'registry publicKeyPem does not hash to the registered fingerprint',
    );
  }

  const config = deepFreeze({
    algorithm: 'Ed25519',
    authorityId: authorityId ?? validatorId,
    immutable: true,
    injectionOrigin: 'host_process_boot_argument',
    // See the OBSERVED DROP-IN CONTRACT note: the runtime verifier allowlists
    // exactly two custody values; this is its non-ephemeral member. The
    // sealed-custody claim lives on the provision receipt and key record.
    keyCustody: VALIDATOR_RUNTIME_KEY_CUSTODY,
    publicKeyFingerprint: sourceDigest(bootRecord.publicKeyPem),
    publicKeyPem: bootRecord.publicKeyPem,
    registryReceiptId: registryReceiptId ?? bootRecord.registryReceiptId,
    schema: PHASE0B_VALIDATOR_SCHEMA,
    validatorSourceHash: validatorModuleSourceHash(),
  });
  assertExactKeys(config, RUNTIME_CONFIG_KEYS, 'runtime validator config');
  assertNoPrivateKeyMaterial(config, 'runtime validator config');
  const configHash = canonicalDigest(config);

  const privateKeyCustodyId = bootRecord.privateKeyCustodyId;

  function assertSignable(at) {
    // Re-read the record on EVERY signature: a revocation that landed after
    // this validator handle was created must take effect immediately.
    const record = trustRegistry.get(validatorId);
    if (!record) {
      fail(
        'validator-not-in-trust-registry',
        `validatorId ${validatorId} is no longer in the trust registry`,
      );
    }
    if (record.keyFingerprint !== keyFingerprint) {
      fail(
        'key-fingerprint-mismatch',
        'trust registry fingerprint changed under this validator handle',
      );
    }
    if (record.status === 'revoked') {
      fail(
        'validator-revoked',
        `validatorId ${validatorId} was revoked at ${record.revokedAt}; `
        + 'it may not issue new signatures',
      );
    }
    if (record.status === 'superseded') {
      fail(
        'validator-superseded',
        `validatorId ${validatorId} was superseded by ${record.supersededBy}; `
        + 'prior signatures stay verifiable, new ones are refused',
      );
    }
    const atMs = assertIsoUtc(at, 'signing time');
    if (atMs < Date.parse(record.notBefore)) {
      fail(
        'validator-outside-validity-window',
        `signing time ${at} is before notBefore ${record.notBefore}`,
      );
    }
    if (atMs >= Date.parse(record.notAfter)) {
      fail(
        'validator-outside-validity-window',
        `signing time ${at} is at or after notAfter ${record.notAfter}`,
      );
    }
    return record;
  }

  function signWithCustodyKey(payloadBytes) {
    let opened;
    try {
      opened = custodyStore.readObject(privateKeyCustodyId);
    } catch (error) {
      if (error?.name === 'CustodyKeyDestroyedError') {
        fail(
          'validator-key-material-destroyed',
          `validatorId ${validatorId} key material is unrecoverable: the `
          + 'custody content key was destroyed',
        );
      }
      fail(
        'custody-read-failed',
        `validatorId ${validatorId} private key could not be read from `
        + `custody: ${error?.name ?? 'error'}`,
      );
    }
    if (opened.kind !== VALIDATOR_PRIVATE_KEY_CUSTODY_KIND) {
      opened.bytes.fill(0);
      fail(
        'custody-read-failed',
        `custody object ${privateKeyCustodyId} is not a validator private key`,
      );
    }
    try {
      const privateKey = createPrivateKey({
        format: 'der',
        key: opened.bytes,
        type: 'pkcs8',
      });
      return sign(null, payloadBytes, privateKey).toString('base64');
    } finally {
      // Zeroed on every path, including a throw from createPrivateKey/sign.
      opened.bytes.fill(0);
    }
  }

  return Object.freeze({
    config,
    configHash,
    issue(manifest) {
      const at = now();
      assertSignable(at);
      const manifestSnapshot = structuredClone(manifest);
      const manifestHash = canonicalDigest(manifestSnapshot);
      const payload = signingPayload(configHash, manifestHash);
      const receipt = deepFreeze({
        config: structuredClone(config),
        configHash,
        manifest: manifestSnapshot,
        manifestHash,
        schema: PHASE0B_VALIDATOR_RECEIPT_SCHEMA,
        signatureBase64: signWithCustodyKey(
          Buffer.from(canonicalJson(payload), 'utf8'),
        ),
        signedPayloadHash: canonicalDigest(payload),
      });
      // Self-verify through the SHIPPED verifier before emitting. This is what
      // makes the drop-in claim real rather than asserted: it runs the
      // runtime's own assertRunManifest, exact-key checks, keyCustody
      // allowlist, fingerprint recomputation and Ed25519 verification, and it
      // catches any drift in the mirrored signing domain.
      const verification = verifyRuntimeInjectedValidator(receipt, {
        trustedConfig: config,
      });
      if (!verification.valid) {
        fail(
          'issued-receipt-rejected',
          `issued validator receipt failed runtime verification: `
          + `${verification.errors.join('; ')}`,
        );
      }
      assertNoPrivateKeyMaterial(receipt, 'issued validator receipt');
      return receipt;
    },
  });
}

/* ==========================================================================
 * Rotation
 * ========================================================================== */

const ROTATION_RECEIPT_KEYS = Object.freeze([
  'at',
  'currentValidatorId',
  'engine',
  'keyMaterialDestroyed',
  'nextValidatorId',
  'overlapUntil',
  'predecessorKeyFingerprint',
  'predecessorProvisionReceiptHash',
  'predecessorStatus',
  'priorReceiptHash',
  'receiptHash',
  'schema',
  'successorKeyFingerprint',
  'successorProvisionReceipt',
  'successorPublicKeyPem',
  'successorStatus',
]);

/**
 * Provisions the successor, marks the predecessor `superseded` (NOT revoked),
 * chains supersedes/supersededBy both ways, and records the overlap window.
 *
 * ROTATION NEVER DESTROYS THE PREDECESSOR'S KEY MATERIAL. keyMaterialDestroyed
 * is pinned false on every rotation receipt. Historical verification of the
 * predecessor's signatures must keep working, and the sealed key is the
 * custody evidence that those signatures were properly held; destroying it
 * would delete the evidence without invalidating anything (verification uses
 * the PUBLIC key). Destruction is a revocation decision, never a rotation
 * side effect.
 *
 * Successor window defaults are conservative: nextNotBefore defaults to the
 * rotation instant and nextNotAfter defaults to the PREDECESSOR's notAfter, so
 * a rotation never silently extends the trust horizon. Pass nextNotAfter
 * explicitly to extend it.
 */
export function rotateValidatorKey({
  custodyStore,
  operator,
  currentValidatorId,
  nextValidatorId,
  overlapUntil,
  trustRegistry,
  nextNotBefore = null,
  nextNotAfter = null,
  at = isoNow(),
} = {}) {
  assertCustodyStore(custodyStore, ['sealObject']);
  assertNonEmptyString(operator, 'operator');
  assertValidatorId(currentValidatorId, 'currentValidatorId');
  assertValidatorId(nextValidatorId, 'nextValidatorId');
  if (currentValidatorId === nextValidatorId) {
    fail(
      'invalid-input',
      'nextValidatorId must differ from currentValidatorId',
    );
  }
  if (!trustRegistry || typeof trustRegistry.get !== 'function') {
    fail('invalid-input', 'rotateValidatorKey requires a trust registry');
  }
  const atMs = assertIsoUtc(at, 'at');
  const overlapMs = assertIsoUtc(overlapUntil, 'overlapUntil');

  const predecessor = trustRegistry.get(currentValidatorId);
  if (!predecessor) {
    fail(
      'validator-not-in-trust-registry',
      `validatorId ${currentValidatorId} is not in the trust registry`,
    );
  }
  if (predecessor.status !== 'active') {
    fail(
      'invalid-status-transition',
      `validatorId ${currentValidatorId} is ${predecessor.status}; only an `
      + 'active key can be rotated',
    );
  }
  if (overlapMs < atMs) {
    fail(
      'invalid-overlap-window',
      'overlapUntil must not precede the rotation instant',
    );
  }
  if (overlapMs > Date.parse(predecessor.notAfter)) {
    fail(
      'invalid-overlap-window',
      'overlapUntil must not extend past the predecessor notAfter',
    );
  }

  const successor = provisionValidatorKey({
    at,
    custodyStore,
    notAfter: nextNotAfter ?? predecessor.notAfter,
    notBefore: nextNotBefore ?? at,
    operator,
    priorReceiptHash: predecessor.provisionReceiptHash,
    validatorId: nextValidatorId,
  });
  trustRegistry.register(successor.receipt);
  // Both directions, explicitly: successor -> predecessor (supersedes) and
  // predecessor -> successor (supersededBy).
  trustRegistry.markSupersedes({
    supersedes: currentValidatorId,
    validatorId: nextValidatorId,
  });
  trustRegistry.markSuperseded({
    overlapUntil,
    supersededBy: nextValidatorId,
    validatorId: currentValidatorId,
  });

  const receipt = sealReceipt({
    at,
    currentValidatorId,
    engine: VALIDATOR_CUSTODY_ENGINE,
    keyMaterialDestroyed: false,
    nextValidatorId,
    overlapUntil,
    predecessorKeyFingerprint: predecessor.keyFingerprint,
    predecessorProvisionReceiptHash: predecessor.provisionReceiptHash,
    predecessorStatus: 'superseded',
    priorReceiptHash: predecessor.provisionReceiptHash,
    schema: VALIDATOR_ROTATION_RECEIPT_SCHEMA,
    successorKeyFingerprint: successor.keyFingerprint,
    successorProvisionReceipt: structuredClone(successor.receipt),
    successorPublicKeyPem: successor.publicKeyPem,
    successorStatus: 'active',
  });
  assertExactKeys(receipt, ROTATION_RECEIPT_KEYS, 'rotation receipt');
  assertNoPrivateKeyMaterial(receipt, 'rotation receipt');
  return receipt;
}

/* ==========================================================================
 * Revocation
 * ========================================================================== */

const REVOCATION_RECEIPT_KEYS = Object.freeze([
  'at',
  'engine',
  'historicalSignatureDisposition',
  'keyFingerprint',
  'keyMaterialDestroyed',
  'keyMaterialDestructionMethod',
  'keyMaterialDestructionScope',
  'preRevocationSignaturesRemainVerifiable',
  'priorReceiptHash',
  'privateKeyCustodyId',
  'reason',
  'receiptHash',
  'revokedAt',
  'schema',
  'status',
  'validatorId',
]);

/**
 * Revokes a validator key. See REVOCATION SEMANTICS in the module header for
 * the before/after rule and the 'suspect' disposition.
 *
 * destroyKeyMaterial performs MV-B1 content-key destruction, which is
 * STORE-SCOPED because MV-B1 exposes no per-object destruction by design. It
 * is REFUSED when the store holds ANY sealed object other than this
 * validator's own private key -- of ANY kind, not just other validator keys --
 * so it can never collaterally erase a peer's or successor's material.
 * Callers that intend to destroy give each key its own store.
 */
export function revokeValidatorKey({
  custodyStore,
  operator,
  validatorId,
  reason,
  revokedAt,
  destroyKeyMaterial = false,
  trustRegistry = null,
  at = isoNow(),
} = {}) {
  assertCustodyStore(custodyStore, ['listObjects']);
  assertNonEmptyString(operator, 'operator');
  assertValidatorId(validatorId, 'validatorId');
  if (!VALIDATOR_REVOCATION_REASONS.includes(reason)) {
    fail(
      'invalid-revocation-reason',
      `reason must be one of ${canonicalJson([...VALIDATOR_REVOCATION_REASONS])}`
      + '; compromise disposition is derived from it, so free text would let a '
      + 'typo silently downgrade historical signatures',
    );
  }
  assertIsoUtc(revokedAt, 'revokedAt');
  assertIsoUtc(at, 'at');
  if (typeof destroyKeyMaterial !== 'boolean') {
    fail('invalid-input', 'destroyKeyMaterial must be a boolean');
  }
  if (!trustRegistry || typeof trustRegistry.get !== 'function') {
    fail(
      'invalid-input',
      'revokeValidatorKey requires the trust registry: a revocation nobody '
      + 'can observe is not a revocation',
    );
  }
  const record = trustRegistry.get(validatorId);
  if (!record) {
    fail(
      'validator-not-in-trust-registry',
      `validatorId ${validatorId} is not in the trust registry`,
    );
  }

  const historicalSignatureDisposition =
    VALIDATOR_COMPROMISE_REVOCATION_REASONS.includes(reason)
      ? 'suspect'
      : 'valid';

  let keyMaterialDestroyed = false;
  let keyMaterialDestructionMethod = null;
  let keyMaterialDestructionScope = null;
  if (destroyKeyMaterial) {
    assertCustodyStore(custodyStore, ['listObjects', 'destroyContentKey']);
    if (custodyStore.keyDestroyed === true) {
      // Already destroyed: there is nothing left to erase, so the tenancy
      // guard has nothing to protect. (It could not run anyway — without the
      // content key, listObjects() cannot decrypt metadata.)
      keyMaterialDestroyed = true;
      keyMaterialDestructionMethod = 'custody-content-key-destruction';
      keyMaterialDestructionScope = 'custody-store';
    } else {
      // ANTI-COLLATERAL GUARD. MV-B1 content-key destruction erases EVERY
      // sealed object in the store, whatever its kind — captured responses,
      // alias records, anything a peer or a successor slice sealed here. So
      // the guard refuses on ANY object that is not this validator's own key,
      // not merely on other VALIDATOR keys: filtering by
      // kind === VALIDATOR_PRIVATE_KEY_CUSTODY_KIND made every non-validator
      // tenant invisible to the guard and destroyed it as collateral.
      //
      // An entry whose metadata cannot be read is treated as foreign: the
      // guard cannot prove it belongs to this validator, and an anti-collateral
      // check that guesses is not a check.
      const ownLabel = `${VALIDATOR_PRIVATE_KEY_CUSTODY_KIND}:${validatorId}`;
      const foreign = custodyStore.listObjects().filter(
        (entry) => entry.metadataAvailable !== true
          || entry.kind !== VALIDATOR_PRIVATE_KEY_CUSTODY_KIND
          || entry.label !== ownLabel,
      );
      if (foreign.length > 0) {
        fail(
          'destroy-would-erase-other-custody-objects',
          `refusing to destroy key material: this custody store also holds `
          + `${foreign.length} sealed object(s) that are not this validator's `
          + 'private key, and MV-B1 content-key destruction is store-scoped '
          + '(it erases every sealed object regardless of kind). Give each '
          + 'validator key its own custody store to destroy safely.',
        );
      }
      custodyStore.destroyContentKey({
        // Bounded (<= 200 chars) and nonidentifying: the reason vocabulary is
        // closed and the validatorId is already public.
        reason: `validator key revocation ${validatorId}: ${reason}`,
      });
      keyMaterialDestroyed = true;
      keyMaterialDestructionMethod = 'custody-content-key-destruction';
      keyMaterialDestructionScope = 'custody-store';
    }
  }

  trustRegistry.markRevoked({
    historicalSignatureDisposition,
    reason,
    revokedAt,
    validatorId,
  });

  const receipt = sealReceipt({
    at,
    engine: VALIDATOR_CUSTODY_ENGINE,
    historicalSignatureDisposition,
    keyFingerprint: record.keyFingerprint,
    keyMaterialDestroyed,
    keyMaterialDestructionMethod,
    keyMaterialDestructionScope,
    // Pinned true: a revocation is a statement about time, not an eraser.
    preRevocationSignaturesRemainVerifiable: true,
    priorReceiptHash: record.provisionReceiptHash,
    privateKeyCustodyId: record.privateKeyCustodyId,
    reason,
    revokedAt,
    schema: VALIDATOR_REVOCATION_RECEIPT_SCHEMA,
    status: 'revoked',
    validatorId,
  });
  assertExactKeys(receipt, REVOCATION_RECEIPT_KEYS, 'revocation receipt');
  assertNoPrivateKeyMaterial(receipt, 'revocation receipt');
  return receipt;
}

/* ==========================================================================
 * Fleet verification -- pure, public-material only
 * ========================================================================== */

/**
 * THE FLEET-VERIFICATION PRIMITIVE. Pure: no custody store, no private
 * material, no filesystem. A party holding only the published trust registry
 * (public key + key record) and a signed artifact can run this.
 *
 * Returns { ok, failureReason, disposition }:
 *   ok                 boolean
 *   failureReason      null when ok, else a stable machine-readable slug
 *   disposition        'valid' | 'suspect' | null
 *                      'suspect' means the signature verifies and predates a
 *                      COMPROMISE revocation: surfaced, never silently
 *                      trusted, never erased.
 *
 * Time boundaries, pinned (the trust-registry lane's keyTrustAt uses the SAME
 * rules — one definition, stated once, asserted by both suites):
 *   notBefore   inclusive  (atTime === notBefore is valid)
 *   notAfter    exclusive  (atTime === notAfter is invalid)
 *   revokedAt   inclusive-invalid (atTime === revokedAt is invalid)
 *   overlapUntil inclusive (atTime === overlapUntil is still valid)
 *
 * revokedAt and overlapUntil are evaluated INDEPENDENTLY whenever they are set,
 * never as mutually exclusive status branches — see the block comment at the
 * checks themselves.
 *
 * atTime is an ASSERTED signing time. This function does not and cannot
 * establish when a signature was actually made; it applies the trust rules
 * deterministically to the time it is given. The signed payload contains no
 * timestamp, so a party that controls the asserted time can present a
 * post-revocation signature as pre-revocation and it will verify — see
 * "ASSERTED SIGNING TIME" in the module header. `disposition` is the only
 * residual signal, and only for compromise revocations.
 */
export function verifyValidatorSignature({
  publicKeyPem,
  payload,
  signature,
  keyRecord,
  atTime,
} = {}) {
  const refuse = (failureReason) => Object.freeze({
    disposition: null,
    failureReason,
    ok: false,
  });
  try {
    assertKeyRecord(keyRecord, 'key record');
  } catch {
    return refuse('invalid-key-record');
  }
  if (typeof publicKeyPem !== 'string' || publicKeyPem.length === 0) {
    return refuse('invalid-public-key');
  }
  if (publicKeyPem !== keyRecord.publicKeyPem) {
    return refuse('public-key-does-not-match-key-record');
  }
  let publicKey;
  try {
    if (publicKeyMaterialFromPem(publicKeyPem) !== keyRecord.keyFingerprint) {
      return refuse('public-key-fingerprint-mismatch');
    }
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    return refuse('invalid-public-key');
  }
  if (typeof signature !== 'string' || signature.length === 0) {
    return refuse('invalid-signature-encoding');
  }
  // DOMAIN SEPARATION, asserted rather than assumed. The caller supplies the
  // payload, so without this check a signature made over some OTHER protocol's
  // message that happened to use this key would verify here.
  if (
    !payload
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || payload.domain !== PHASE0B_VALIDATOR_DOMAIN
  ) {
    return refuse('invalid-signing-payload-domain');
  }
  let atMs;
  try {
    atMs = assertIsoUtc(atTime, 'atTime');
  } catch {
    return refuse('invalid-at-time');
  }
  if (atMs < Date.parse(keyRecord.notBefore)) {
    return refuse('signature-time-before-validity-window');
  }
  if (atMs >= Date.parse(keyRecord.notAfter)) {
    return refuse('signature-time-after-validity-window');
  }
  // BOTH cutoffs are evaluated whenever they are SET, never as mutually
  // exclusive status branches.
  //
  // WHY THIS IS NOT A STATUS SWITCH: ValidatorTrustRegistry.markRevoked
  // overwrites status 'superseded' -> 'revoked' while leaving overlapUntil in
  // place. Branching on status therefore silently DROPPED the supersession
  // cutoff the moment a superseded key was revoked, and every signature in the
  // (overlapUntil, revokedAt) gap that had just been rejected became valid
  // again. Revocation must be monotonically trust-REDUCING; a status branch
  // made it trust-EXPANDING.
  //
  // Rule 4 in the module header ("revocation never invalidates a supersession")
  // is about the SUPERSESSION SURVIVING a revocation — the successor stays the
  // successor and the predecessor's pre-overlap history stays verifiable. It
  // never meant the overlap cutoff stops applying.
  if (keyRecord.status === 'revoked' && !keyRecord.revokedAt) {
    return refuse('invalid-key-record');
  }
  if (keyRecord.status === 'superseded' && !keyRecord.overlapUntil) {
    return refuse('invalid-key-record');
  }
  if (keyRecord.revokedAt && atMs >= Date.parse(keyRecord.revokedAt)) {
    return refuse('signature-after-revocation');
  }
  if (keyRecord.overlapUntil && atMs > Date.parse(keyRecord.overlapUntil)) {
    return refuse('signature-after-supersession-overlap');
  }
  let verified = false;
  try {
    verified = verify(
      null,
      Buffer.from(canonicalJson(payload), 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return refuse('signature-verification-error');
  }
  if (!verified) return refuse('signature-verification-failed');
  return Object.freeze({
    disposition: keyRecord.historicalSignatureDisposition,
    failureReason: null,
    ok: true,
  });
}

/**
 * Rebuilds the phase0b validator signing payload from a runtime validator
 * receipt, so a fleet verifier can feed verifyValidatorSignature without
 * knowing the runtime's internals.
 *
 * BINDING IS RECOMPUTED, NEVER TRUSTED. Both hashes are derived from the
 * receipt's OWN config and manifest and then checked against the hashes the
 * receipt pins; a mismatch is a loud refusal, not a silent pass-through.
 *
 * WHY: this helper is the documented fleet-verifier entry point, and reading
 * `receipt.manifestHash` off the artifact made it a trap. A receipt whose
 * `manifest` had been swapped for an attacker-chosen one still produced the
 * ORIGINAL manifestHash, so verifyValidatorSignature verified happily and the
 * fleet party proved only "some manifest was signed" rather than "THIS manifest
 * was signed". The gate's own createFleetVerifier recomputes both halves for
 * exactly this reason; the helper now does the same instead of being the
 * shortcut that undoes it.
 */
export function validatorReceiptSigningPayload(receipt) {
  if (
    !receipt
    || typeof receipt !== 'object'
    || typeof receipt.configHash !== 'string'
    || typeof receipt.manifestHash !== 'string'
  ) {
    fail('invalid-shape', 'validator receipt is missing config/manifest hashes');
  }
  if (!receipt.config || typeof receipt.config !== 'object') {
    fail('invalid-shape', 'validator receipt is missing its config');
  }
  if (!receipt.manifest || typeof receipt.manifest !== 'object') {
    fail('invalid-shape', 'validator receipt is missing its run manifest');
  }
  const configHash = canonicalDigest(receipt.config);
  const manifestHash = canonicalDigest(receipt.manifest);
  if (configHash !== receipt.configHash) {
    fail(
      'receipt-binding-mismatch',
      'validator receipt configHash does not recompute from its own config; '
      + 'the receipt does not bind the config it carries',
    );
  }
  if (manifestHash !== receipt.manifestHash) {
    fail(
      'receipt-binding-mismatch',
      'validator receipt manifestHash does not recompute from its own run '
      + 'manifest; the receipt does not bind the manifest it carries',
    );
  }
  return deepFreeze(signingPayload(configHash, manifestHash));
}

/* ==========================================================================
 * Trust publication -- LOCAL FILE ONLY
 * ========================================================================== */

const TRUST_PUBLICATION_RECEIPT_KEYS = Object.freeze([
  'at',
  'documentSha256',
  'engine',
  'fileName',
  'networkPublicationClaimed',
  'operator',
  'receiptHash',
  'recordCount',
  'registryHash',
  'registryId',
  'schema',
]);

/**
 * Writes the canonical trust registry document to a LOCAL file and returns its
 * publication receipt. No network I/O of any kind; networkPublicationClaimed
 * is pinned false. Only the file BASENAME is recorded, so an absolute host
 * path (which carries the operator's home directory) never lands in a durable
 * public receipt.
 */
export function publishValidatorTrustRegistry({
  trustRegistry,
  filePath,
  operator = null,
  at = isoNow(),
} = {}) {
  if (!trustRegistry || typeof trustRegistry.snapshot !== 'function') {
    fail('invalid-input', 'publishValidatorTrustRegistry requires a registry');
  }
  assertNonEmptyString(filePath, 'filePath');
  assertIsoUtc(at, 'at');
  const document = trustRegistry.snapshot();
  assertNoPrivateKeyMaterial(document, 'trust registry document');
  const bytes = Buffer.from(canonicalJson(document), 'utf8');
  writeFileDurable(path.resolve(filePath), bytes);
  const receipt = sealReceipt({
    at,
    documentSha256: sha256Hex(bytes),
    engine: VALIDATOR_CUSTODY_ENGINE,
    fileName: path.basename(filePath),
    networkPublicationClaimed: false,
    operator: operator ?? trustRegistry.operator,
    recordCount: document.recordCount,
    registryHash: document.registryHash,
    registryId: document.registryId,
    schema: VALIDATOR_TRUST_PUBLICATION_RECEIPT_SCHEMA,
  });
  assertExactKeys(
    receipt,
    TRUST_PUBLICATION_RECEIPT_KEYS,
    'trust publication receipt',
  );
  assertNoPrivateKeyMaterial(receipt, 'trust publication receipt');
  return Object.freeze({ document, receipt });
}

/**
 * Verifies a published trust registry document with nothing but the document
 * itself: recomputes registryHash, re-validates every key record, and
 * re-derives every fingerprint from its public key. The other half of the
 * fleet-verification claim.
 *
 * SELF-CONSISTENT IS NOT AUTHENTIC — the same limit the trust-registry lane
 * states for its chain, restated here because this function is the one a fleet
 * party actually calls. Nothing in the document is SIGNED, so a party who can
 * write the file can hand-build a wholly fabricated document naming their own
 * key and this returns { valid: true, errors: [] }. What is established is
 * internal coherence plus the absence of key material, never provenance.
 * Authenticity rests entirely on an out-of-band pin of documentSha256 /
 * registryHash from the publication receipt — exactly as the spec's outer
 * verification rests on externally supplied trusted configuration.
 * VALIDATOR_CUSTODY_CLAIM_BOUNDARY.externalPublicTrustRootClaimed is false for
 * this reason.
 */
export function verifyValidatorTrustRegistryDocument(document) {
  const errors = [];
  try {
    assertExactKeys(
      document,
      [
        'engine',
        'operator',
        'recordCount',
        'records',
        'registryHash',
        'registryId',
        'schema',
      ],
      'trust registry document',
    );
    if (document.schema !== VALIDATOR_CUSTODY_SCHEMA) {
      fail('invalid-shape', 'trust registry schema mismatch');
    }
    if (document.engine !== VALIDATOR_CUSTODY_ENGINE) {
      fail('invalid-shape', 'trust registry engine mismatch');
    }
    const { registryHash, ...body } = document;
    if (canonicalDigest(body) !== registryHash) {
      fail('registry-hash-mismatch', 'trust registry hash does not recompute');
    }
    if (!Array.isArray(document.records)) {
      fail('invalid-shape', 'trust registry records must be an array');
    }
    if (document.records.length !== document.recordCount) {
      fail('invalid-shape', 'trust registry recordCount disagrees with records');
    }
    document.records.forEach((record, index) => {
      assertKeyRecord(record, `trust registry record ${index}`);
      if (publicKeyMaterialFromPem(record.publicKeyPem) !== record.keyFingerprint) {
        fail(
          'key-fingerprint-mismatch',
          `trust registry record ${index} public key does not hash to its `
          + 'fingerprint',
        );
      }
    });
    assertNoPrivateKeyMaterial(document, 'trust registry document');
  } catch (error) {
    errors.push(error.message || String(error));
  }
  return Object.freeze({ errors: Object.freeze(errors), valid: errors.length === 0 });
}
