/* global Buffer, process */

/**
 * Model Village MV-B4 local validator TRUST REGISTRY (publication half).
 *
 * Closes the publication + fleet-verification half of the spec's gate row
 * "Trust and outer verification"
 * (docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md), whose REMAINING column
 * reads: "Production validator provisioning, custody, rotation, revocation,
 * trust publication, and fleet verification." Spec lines 256-261 name the same
 * gap for `createRuntimeInjectedValidatorFixture()`: its key pair is an
 * ephemeral engineering fixture, "not production key provisioning, custody, or
 * a trust root."
 *
 * This module owns the two halves that are NOT custody:
 *   1. TRUST PUBLICATION — a local, canonical, append-only, hash-chained
 *      registry of authorized validator PUBLIC keys and their lifecycle
 *      (provision -> rotation -> revocation).
 *   2. FLEET VERIFICATION — `verifyRunManifestAgainstRegistry`, the primitive
 *      that lets a party holding ONLY this registry snapshot plus a signed run
 *      manifest decide whether that manifest was signed by a validator that
 *      was authorized at the signing instant THE PRESENTER ASSERTS. Read the
 *      "UNAUTHENTICATED signedAt" section below before relying on that; the
 *      instant is an input, not an observation.
 *
 * ===========================================================================
 * THE ZERO-PRIVATE-MATERIAL LAW (the load-bearing rule of this module)
 * ===========================================================================
 * The registry is a PUBLIC artifact. Ed25519 private key material may exist
 * only inside the encrypted custody store and transiently in memory while
 * signing — never here. Consequences enforced in code, not by convention:
 *
 * - `appendEntry` runs an ACTIVE private-material audit over every key and
 *   string value of the candidate entry and REFUSES TO WRITE if anything
 *   private-key-shaped is present. The scan runs before the file is touched,
 *   so a leak never reaches disk in the first place.
 * - `verifyTrustRegistry` re-runs that audit over the whole snapshot FIRST,
 *   before chain verification, so a doctored registry is rejected with an
 *   unambiguous leak reason rather than an incidental hash mismatch.
 * - The audit is structural, not a keyword list: base64 runs are decoded and
 *   checked for PKCS#8 `PrivateKeyInfo` / PKCS#1 `RSAPrivateKey` / SEC1 EC
 *   DER shape, in addition to PEM `PRIVATE KEY` banners. A bare, header-less
 *   base64 PKCS#8 blob is therefore caught too.
 * - The base64 scan is EXHAUSTIVE over alignment: a payload may sit behind an
 *   arbitrary prefix, which shifts it by both a base64 phase and a whole
 *   number of bytes, so all four phases and every byte offset are checked.
 *   (A single decode from index 0 misses `xMC4CAQAwBQYDK2Vw...` — found by
 *   probing this detector, not by reading it.)
 * - The audit is deliberately CONSERVATIVE and rejects the bare phrase
 *   "private key" in free text as well. A revocation reason such as
 *   "suspected private key compromise" is therefore refused and must be
 *   reworded. That false positive is accepted on purpose: on a public trust
 *   artifact, failing closed on a phrase costs a reword, while failing open
 *   costs the key.
 * - HONEST LIMIT: a raw 32-byte Ed25519 seed carries no DER framing and is
 *   byte-indistinguishable from a raw public key, so the audit cannot detect
 *   one. This module claims detection of DER/PEM-framed private keys, which
 *   is the shape every `node:crypto` export produces — not detection of
 *   arbitrary high-entropy bytes.
 *
 * ===========================================================================
 * APPEND-ONLY, AND WHY `supersededBy` IS DERIVED
 * ===========================================================================
 * Entries are never rewritten. Each pins `prevEntryHash` and its own
 * `entryHash` (canonicalDigest of the entry minus `entryHash`), sequences run
 * monotonically from 1, and `registryHash` covers the whole body — so editing
 * any historical entry breaks verification.
 *
 * A forward pointer cannot be written into an append-only chain: at the moment
 * a key is provisioned, nothing yet supersedes it. `supersedes` (a BACKWARD
 * pin, known at append time) therefore lives on the rotation ENTRY, and
 * `supersededBy` is DERIVED when key records are reconstructed from the chain.
 * The field is kept in the closed entry key set and asserted `null` on every
 * entry precisely so a future caller cannot smuggle in a back-filled forward
 * pointer and silently rewrite history.
 *
 * ===========================================================================
 * NO EXCLUSIVE LOCK, ON PURPOSE (contrast with MV-B1)
 * ===========================================================================
 * MV-B1's custody store takes an exclusive store-root lock because it holds a
 * secret and a second live handle would fork its access log. This registry
 * holds NO secret: concurrent readers are the entire point of fleet
 * verification, and a verifier must never be blocked by a writer's lock. The
 * concurrency guard here is the FORK FENCE alone: before every append the
 * handle re-reads the on-disk registry and requires the full entry prefix and
 * registryHash to still equal its own in-memory state. A stale handle fails
 * loud on its OWN write instead of writing a duplicate sequence number and
 * permanently corrupting the chain. (MV-B1 solved this shape first; the fence
 * is deliberately modelled on `#assertLogTailMatchesHandle`, widened from
 * tail-only to full-prefix because this file is rewritten atomically rather
 * than appended line-wise.)
 *
 * HONEST LIMIT: the fence is a check-then-write, so it closes the "stale
 * handle" window, not a true multi-writer race. It is evaluated immediately
 * before the atomic rename to make that window as small as possible. Two
 * processes appending in the same instant remain out of scope — the spec's own
 * remaining Phase 1 requirement already names multi-process CAS and
 * distributed locking as unmet.
 *
 * ===========================================================================
 * TAMPER-EVIDENCE LIMIT — chained, not authenticated
 * ===========================================================================
 * `entryHash` / `prevEntryHash` / `registryHash` make the registry tamper-
 * EVIDENT: any edit to a published file is detected by a party that pinned the
 * registryHash, and any edit to a historical entry breaks the forward chain.
 * They do NOT make it tamper-PROOF. There are no signatures over the registry
 * itself, so a party who can rewrite the whole file can also recompute a
 * self-consistent chain. Registry authenticity therefore rests on the
 * out-of-band pin of `registryHash`, exactly as the spec's outer verification
 * rests on externally supplied trusted configuration.
 *
 * AND A WEAKER CAPABILITY SUFFICES, so the "rewrite the whole file" framing
 * above understates it: `openTrustRegistry` takes an optional, unauthenticated
 * `operator` and `appendEntry` performs NO authorization check. A party with
 * only filesystem WRITE access can therefore APPEND a rotation entry naming
 * their own key onto a live published registry. It passes the fork fence (the
 * historical prefix is untouched), `verifyTrustRegistry` stays ok, and an
 * artifact signed by the spliced key then resolves as trusted. Entry
 * AUTHORIZATION is not implemented and not claimed
 * (TRUST_REGISTRY_CLAIM_BOUNDARY.entryAuthorizationClaimed === false); the pin
 * of `registryHash` after every legitimate append is the control that detects
 * it.
 *
 * ===========================================================================
 * UNAUTHENTICATED `signedAt` — THE LIMIT THE TEMPORAL RULES REST ON
 * ===========================================================================
 * `signedAt` is a bare caller-supplied string, validated only for ISO-8601
 * shape. NOTHING binds it to reality: the validator's signed payload carries no
 * timestamp, the phase0b run manifest has no timestamp field, and the validator
 * receipt has none either. Whoever presents an artifact chooses the instant it
 * is judged at.
 *
 * So every temporal rule here — notBefore/notAfter, revokedAt — is applied to
 * an ASSERTED time. A holder of a revoked key can sign a new artifact today,
 * present `signedAt` as a pre-revocation instant, and this module will resolve
 * the key as trusted and the signature will verify. Revocation is enforceable
 * against a party that reports the time honestly; it is NOT enforceable against
 * a party that controls the asserted time.
 *
 * ORDERING IS NOT A SECURITY PROPERTY HERE, and earlier revisions of this file
 * wrongly said it was. Resolving the key before checking the signature and
 * checking the signature before resolving the key accept exactly the same set
 * of artifacts; the order only decides which `failureReason` is reported and
 * spares the crypto work on an untrusted key. Resolve-first is kept for those
 * reasons, not because it closes anything.
 *
 * Closing this needs a trusted timestamp authority or an independent
 * countersignature. A self-signed timestamp from the signing key would close
 * nothing — whoever can forge the signature can forge the timestamp — so none
 * is invented. Pinned machine-readably as
 * TRUST_REGISTRY_CLAIM_BOUNDARY.trustedTimestampAuthorityClaimed /
 * signingTimeAuthenticatedClaimed /
 * revocationEnforceableAgainstBackdatedSignedAtClaimed, all false.
 *
 * ===========================================================================
 * NO PROGRAMMATIC REPAIR PATH — stated, not hidden
 * ===========================================================================
 * `openTrustRegistry` refuses unparseable or unverifiable content (appending
 * onto a broken chain would launder the break) and `createTrustRegistry`
 * refuses any path that already exists (silently replacing a published trust
 * root is the worst thing this module could do). Both refusals are correct and
 * both are kept — but together they leave NO exported repair, fork, or
 * archive-and-reseed helper. A registry damaged by an external actor or a
 * half-written file requires manual filesystem intervention: move the damaged
 * file aside (keep it — it is the evidence), then create a fresh registry and
 * re-append the lifecycle from the custody lane's provision/rotation/revocation
 * receipts, which are the durable source. This is fail-closed rather than a
 * corruption bug, but the operator-facing gap is real.
 *
 * ===========================================================================
 * CLAIM BOUNDARY — what "trust publication" does and does NOT mean here
 * ===========================================================================
 * "Publication" means a LOCAL canonical file plus its receipt hash. Nothing is
 * published to a network, a remote host, or any external service; this module
 * performs no I/O beyond the given `registryPath`.
 *
 * This is the EXPERIMENT's research-artifact validator registry — it governs
 * which key may sign a RUN MANIFEST. It is not a wallet, not treasury custody,
 * not a minting authority, and must never be described as one.
 *
 * NOT claimed: a live study run; Phase 1 admission or readiness; HSM or
 * hardware-backed key storage; multi-party or threshold signing; an external
 * or public trust root; fleet DEPLOYMENT. What IS proven is fleet
 * VERIFIABILITY — that a party holding only public trust configuration can
 * verify a signed artifact. See TRUST_REGISTRY_CLAIM_BOUNDARY.
 *
 * Language boundary (spec "Source layout"): JavaScript transport,
 * canonicalization, and verification only. No resident reasoning, no village
 * rules, no experimental treatments, no scoring policy, no model behavior.
 *
 * CRYPTO BOUNDARY: this module owns hashing only (via the shipped
 * `canonicalDigest`). Signature verification is INJECTED by the caller
 * (`verifySignature`), so fleet verification has no dependency on the custody
 * lane — the party that verifies is exactly the party that cannot sign.
 */

import { createHash } from 'node:crypto';
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

import {
  canonicalDigest,
  canonicalJson,
} from './model-village-phase0b-runtime.mjs';

export const TRUST_REGISTRY_SCHEMA =
  'hololand.model-village-trust-registry.v1';
export const TRUST_REGISTRY_ENTRY_SCHEMA =
  'hololand.model-village-trust-registry-entry.v1';
export const TRUST_REGISTRY_ENGINE =
  'hololand-model-village-trust-registry-v1';

/** Chain seed for the first entry's prevEntryHash. */
export const TRUST_REGISTRY_GENESIS = 'trust-registry-genesis-v1';

/** The only signature algorithm this registry publishes. */
export const TRUST_REGISTRY_ALGORITHM = 'Ed25519';

export const TRUST_REGISTRY_ENTRY_KINDS = Object.freeze([
  'provision',
  'revocation',
  'rotation',
]);

export const TRUST_REGISTRY_KEY_STATUSES = Object.freeze([
  'active',
  'revoked',
  'superseded',
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const PUBLIC_KEY_PEM_PATTERN =
  /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/;
const MAX_REASON_LENGTH = 200;
const MAX_IDENTIFIER_LENGTH = 200;

const REGISTRY_BODY_KEYS = Object.freeze([
  'createdAt',
  'entries',
  'registryHash',
  'registryId',
  'schema',
]);

/**
 * CLOSED entry key set. Every entry carries every key; inapplicable fields are
 * explicitly null rather than absent, so canonical JSON stays byte-stable
 * across kinds and two parties can diff entries positionally.
 */
const ENTRY_KEYS = Object.freeze([
  'algorithm',
  'at',
  'entryHash',
  'keyFingerprint',
  'kind',
  'notAfter',
  'notBefore',
  'operator',
  'prevEntryHash',
  'publicKeyPem',
  'reason',
  'revokedAt',
  'schema',
  'sequence',
  'sourceReceiptHash',
  'status',
  'supersededBy',
  'supersedes',
  'validatorId',
]);

/** Caller-supplied append input; everything else is derived by the handle. */
const ENTRY_INPUT_KEYS = Object.freeze([
  'algorithm',
  'at',
  'keyFingerprint',
  'kind',
  'notAfter',
  'notBefore',
  'operator',
  'publicKeyPem',
  'reason',
  'revokedAt',
  'sourceReceiptHash',
  'status',
  'supersededBy',
  'supersedes',
  'validatorId',
]);

/** Derived (never stored) per-key lifecycle view reconstructed from entries. */
const KEY_RECORD_KEYS = Object.freeze([
  'algorithm',
  'keyFingerprint',
  'notAfter',
  'notBefore',
  'provisionedAt',
  'provisionedBySequence',
  'publicKeyPem',
  'reason',
  'revokedAt',
  'sourceReceiptHash',
  'status',
  'supersededBy',
  'supersedes',
  'validatorId',
]);

/**
 * Every claim this slice must NEVER make, pinned false so a reader does not
 * have to infer the boundary from prose.
 */
export const TRUST_REGISTRY_CLAIM_BOUNDARY = Object.freeze({
  engineeringCertificationDrill: true,
  localTrustPublicationImplemented: true,
  fleetVerifiabilityProven: true,
  // appendEntry performs no authorization check; FS write access is enough to
  // splice a rotation entry onto a live registry.
  entryAuthorizationClaimed: false,
  externalOrPublicTrustRootClaimed: false,
  fleetDeploymentClaimed: false,
  hardwareBackedKeyStorageClaimed: false,
  liveStudyRunClaimed: false,
  mintingOrTreasuryAuthorityClaimed: false,
  multiPartyThresholdSigningClaimed: false,
  networkPublicationClaimed: false,
  phase1AdmissionClaimed: false,
  privateKeyMaterialInRegistryClaimed: false,
  processCrashDurabilityClaimed: false,
  rawSeedDetectionClaimed: false,
  // This module owns the only public API that consumes `signedAt`, so the
  // three time flags belong here even more than on the peer boundaries.
  revocationEnforceableAgainstBackdatedSignedAtClaimed: false,
  signingTimeAuthenticatedClaimed: false,
  trustedTimestampAuthorityClaimed: false,
  walletCustodyClaimed: false,
});

/** Fail-loud typed error for every registry failure (no coercion). */
export class ModelVillageTrustRegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelVillageTrustRegistryError';
  }
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function fail(message) {
  throw new ModelVillageTrustRegistryError(message);
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeSource(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

/**
 * Key fingerprint = sha256 over the LINE-NORMALIZED public key PEM. This is
 * byte-identical to the `publicKeyFingerprint` that
 * `createRuntimeInjectedValidatorFixture` puts on its trusted validator config
 * (phase0b-runtime `sourceDigest(publicKeyPem)`), so a registry entry and a
 * runtime validator config address the same key by the same name and no
 * translation layer is needed at the seam.
 */
export function trustRegistryKeyFingerprint(publicKeyPem) {
  if (typeof publicKeyPem !== 'string' || publicKeyPem.length === 0) {
    fail('publicKeyPem must be a non-empty string');
  }
  return createHash('sha256')
    .update(Buffer.from(normalizeSource(publicKeyPem), 'utf8'))
    .digest('hex');
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

function assertAllowedKeys(value, allowedKeys, label) {
  assertObject(value, label);
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    fail(`${label} carries unsupported keys ${canonicalJson(unexpected.sort())}`);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  if (value.length > MAX_IDENTIFIER_LENGTH) {
    fail(`${label} exceeds ${MAX_IDENTIFIER_LENGTH} characters`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be lowercase sha256 hex`);
  }
}

function assertIsoUtc(value, label) {
  if (typeof value !== 'string' || !ISO_UTC_PATTERN.test(value)) {
    fail(`${label} must be an ISO-8601 UTC timestamp`);
  }
  if (!Number.isFinite(Date.parse(value))) {
    fail(`${label} is not a parseable timestamp`);
  }
}

function epochMs(value, label) {
  assertIsoUtc(value, label);
  return Date.parse(value);
}

// ---------------------------------------------------------------------------
// Zero-private-material audit
// ---------------------------------------------------------------------------

/** PEM banners for every private-key form node:crypto can export. */
const PRIVATE_PEM_PATTERN = /-----\s*BEGIN[A-Z0-9 ]*PRIVATE KEY\s*-----/i;
/** Free-text mention, caught even without the surrounding dashes. */
const PRIVATE_KEY_PHRASE_PATTERN = /PRIVATE\s+KEY/i;
/**
 * Candidate base64 runs long enough to carry a DER-framed key. `=` is excluded
 * from the RUN body and allowed only as trailing padding, so a prefix such as
 * `keyMaterial=<blob>` splits into a short prefix and the real blob instead of
 * merging into one misaligned run.
 */
const BASE64_RUN_PATTERN = /[A-Za-z0-9+/]{40,}={0,2}/g;

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
  // version 0 -> PKCS#8 (next = SEQUENCE) or PKCS#1 (next = INTEGER modulus)
  if (version === 0x00 && (next === 0x30 || next === 0x02)) return true;
  // version 1 -> SEC1 EC private key (next = OCTET STRING)
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

function stringCarriesPrivateMaterial(value) {
  if (PRIVATE_PEM_PATTERN.test(value)) return true;
  if (PRIVATE_KEY_PHRASE_PATTERN.test(value)) return true;
  const compact = value.replace(/\s+/g, '');
  const runs = compact.match(BASE64_RUN_PATTERN);
  if (!runs) return false;
  for (const run of runs) {
    // A key may sit anywhere inside a run behind an arbitrary prefix, and a
    // prefix shifts the payload by BOTH a base64 phase and a whole number of
    // bytes. Decoding the run once from index 0 therefore misses
    // `xMC4CAQAwBQYDK2Vw...` entirely — found by probing this detector rather
    // than by reading it, which is why the scan is exhaustive: all four
    // phases (alignment is mod 4), then every byte offset of each decode.
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
 * ACTIVE audit over every key and string value at every depth. Deliberately an
 * assertion rather than a construction-time comfort: a future field, a future
 * caller, or a doctored artifact that smuggles private key material into this
 * public registry fails loudly instead of being published.
 *
 * The offending value is NEVER echoed into the error — echoing it would
 * re-leak exactly the material the audit exists to keep out. Only the path is
 * named.
 */
function assertNoPrivateKeyMaterial(value, label) {
  const visit = (node, nodeLabel) => {
    if (typeof node === 'string') {
      if (stringCarriesPrivateMaterial(node)) {
        fail(
          `${nodeLabel} carries private-key-shaped material; the Model Village `
          + 'trust registry is a public artifact and publishes public keys, '
          + 'fingerprints, and signatures only (zero-private-material law). '
          + "The audit is deliberately conservative: the bare phrase 'private "
          + "key' in free text is rejected too — reword the field",
        );
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${nodeLabel}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        visit(key, `${nodeLabel} key`);
        visit(node[key], `${nodeLabel}.${key}`);
      }
    }
  };
  visit(value, label);
}

// ---------------------------------------------------------------------------
// Entry + chain validation
// ---------------------------------------------------------------------------

function assertPublicKeyPem(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  const normalized = normalizeSource(value);
  if (!PUBLIC_KEY_PEM_PATTERN.test(normalized)) {
    fail(`${label} must be a PEM-encoded SPKI public key`);
  }
}

function validateEntryShape(entry, label) {
  assertExactKeys(entry, ENTRY_KEYS, label);
  if (entry.schema !== TRUST_REGISTRY_ENTRY_SCHEMA) {
    fail(`${label} schema must be '${TRUST_REGISTRY_ENTRY_SCHEMA}'`);
  }
  if (!TRUST_REGISTRY_ENTRY_KINDS.includes(entry.kind)) {
    fail(`${label} kind must be one of ${canonicalJson([...TRUST_REGISTRY_ENTRY_KINDS])}`);
  }
  if (!Number.isInteger(entry.sequence) || entry.sequence < 1) {
    fail(`${label} sequence must be an integer >= 1`);
  }
  assertIdentifier(entry.prevEntryHash, `${label} prevEntryHash`);
  assertSha256(entry.entryHash, `${label} entryHash`);
  assertIdentifier(entry.validatorId, `${label} validatorId`);
  assertIdentifier(entry.operator, `${label} operator`);
  assertIsoUtc(entry.at, `${label} at`);
  assertSha256(entry.keyFingerprint, `${label} keyFingerprint`);
  assertSha256(entry.sourceReceiptHash, `${label} sourceReceiptHash`);
  assertPublicKeyPem(entry.publicKeyPem, `${label} publicKeyPem`);
  if (entry.algorithm !== TRUST_REGISTRY_ALGORITHM) {
    fail(`${label} algorithm must be '${TRUST_REGISTRY_ALGORITHM}'`);
  }
  if (entry.keyFingerprint !== trustRegistryKeyFingerprint(entry.publicKeyPem)) {
    fail(`${label} keyFingerprint does not match its publicKeyPem`);
  }
  assertIsoUtc(entry.notBefore, `${label} notBefore`);
  if (entry.notAfter !== null) {
    assertIsoUtc(entry.notAfter, `${label} notAfter`);
    if (epochMs(entry.notAfter, `${label} notAfter`)
      < epochMs(entry.notBefore, `${label} notBefore`)) {
      fail(`${label} notAfter precedes notBefore`);
    }
  }
  if (!TRUST_REGISTRY_KEY_STATUSES.includes(entry.status)) {
    fail(`${label} status must be one of ${canonicalJson([...TRUST_REGISTRY_KEY_STATUSES])}`);
  }
  // Append-only law: forward pointers cannot exist without rewriting history.
  if (entry.supersededBy !== null) {
    fail(
      `${label} supersededBy must be null on an append-only entry; the value `
      + 'is DERIVED when key records are reconstructed from the chain',
    );
  }

  if (entry.kind === 'rotation') {
    assertSha256(entry.supersedes, `${label} supersedes`);
    if (entry.supersedes === entry.keyFingerprint) {
      fail(`${label} rotation cannot supersede itself`);
    }
  } else if (entry.supersedes !== null) {
    fail(`${label} supersedes must be null on a ${entry.kind} entry`);
  }

  if (entry.kind === 'revocation') {
    assertIsoUtc(entry.revokedAt, `${label} revokedAt`);
    assertIdentifier(entry.reason, `${label} reason`);
    if (entry.reason.length > MAX_REASON_LENGTH) {
      fail(`${label} reason exceeds ${MAX_REASON_LENGTH} characters`);
    }
    if (entry.status !== 'revoked') {
      fail(`${label} revocation status must be 'revoked'`);
    }
  } else {
    if (entry.revokedAt !== null) {
      fail(`${label} revokedAt must be null on a ${entry.kind} entry`);
    }
    if (entry.reason !== null) {
      fail(`${label} reason must be null on a ${entry.kind} entry`);
    }
    if (entry.status !== 'active') {
      fail(`${label} ${entry.kind} status must be 'active'`);
    }
  }
}

function recomputeEntryHash(entry) {
  const { entryHash, ...unsigned } = entry;
  void entryHash;
  return canonicalDigest(unsigned);
}

/**
 * Full chain validation: sequences monotonic from 1, prevEntryHash chains from
 * TRUST_REGISTRY_GENESIS, and every entryHash recomputes as the canonical
 * digest of the entry minus entryHash. Returns the tail state.
 */
function validateEntryChain(entries) {
  if (!Array.isArray(entries)) fail('registry entries must be an array');
  let prevHash = TRUST_REGISTRY_GENESIS;
  let expectedSequence = 1;
  for (const entry of entries) {
    const label = `registry entry ${expectedSequence}`;
    validateEntryShape(entry, label);
    if (entry.sequence !== expectedSequence) {
      fail(
        `${label} sequence ${entry.sequence} breaks monotonic order `
        + `(expected ${expectedSequence})`,
      );
    }
    if (entry.prevEntryHash !== prevHash) {
      fail(`${label} prevEntryHash does not chain from the previous entry`);
    }
    if (recomputeEntryHash(entry) !== entry.entryHash) {
      fail(`${label} entryHash does not match its recomputed canonical digest`);
    }
    prevHash = entry.entryHash;
    expectedSequence += 1;
  }
  return { lastEntryHash: prevHash, lastSequence: expectedSequence - 1 };
}

// ---------------------------------------------------------------------------
// Derived key lifecycle
// ---------------------------------------------------------------------------

/**
 * Reconstructs the per-key lifecycle from the append-only chain. This is the
 * ONLY place `supersededBy` and terminal `status` come into existence — they
 * are derived, never stored (see the append-only note in the module header).
 *
 * Rotation does NOT immediately kill the outgoing key: it marks it superseded
 * while its own validity window keeps running. That is the rotation OVERLAP
 * window, and it is deliberate — a fleet mid-rollout still holds artifacts
 * signed by the outgoing key, and those must stay verifiable until the key's
 * declared notAfter.
 */
function buildKeyRecords(entries) {
  const byValidator = new Map();
  const byFingerprint = new Map();
  for (const entry of entries) {
    const label = `registry entry ${entry.sequence}`;
    if (entry.kind === 'provision' || entry.kind === 'rotation') {
      if (byFingerprint.has(entry.keyFingerprint)) {
        fail(`${label} reintroduces an already-registered keyFingerprint`);
      }
      const record = {
        algorithm: entry.algorithm,
        keyFingerprint: entry.keyFingerprint,
        notAfter: entry.notAfter,
        notBefore: entry.notBefore,
        provisionedAt: entry.at,
        provisionedBySequence: entry.sequence,
        publicKeyPem: entry.publicKeyPem,
        reason: null,
        revokedAt: null,
        sourceReceiptHash: entry.sourceReceiptHash,
        status: 'active',
        supersededBy: null,
        supersedes: entry.supersedes,
        validatorId: entry.validatorId,
      };
      if (!byValidator.has(entry.validatorId)) byValidator.set(entry.validatorId, []);
      byValidator.get(entry.validatorId).push(record);
      byFingerprint.set(entry.keyFingerprint, record);
    }

    if (entry.kind === 'provision') {
      const existing = byValidator.get(entry.validatorId) ?? [];
      if (existing.length > 1) {
        fail(
          `${label} provisions a validator that already holds a key; use a `
          + "'rotation' entry instead",
        );
      }
    }

    if (entry.kind === 'rotation') {
      const superseded = byFingerprint.get(entry.supersedes);
      if (!superseded) {
        fail(`${label} supersedes a keyFingerprint that is not in the registry`);
      }
      if (superseded.validatorId !== entry.validatorId) {
        fail(`${label} supersedes a key belonging to a different validator`);
      }
      if (superseded.supersededBy !== null) {
        fail(`${label} supersedes a key that was already superseded`);
      }
      if (superseded.status === 'revoked') {
        fail(`${label} supersedes a revoked key`);
      }
      superseded.supersededBy = entry.keyFingerprint;
      superseded.status = 'superseded';
    }

    if (entry.kind === 'revocation') {
      const target = byFingerprint.get(entry.keyFingerprint);
      if (!target) {
        fail(`${label} revokes a keyFingerprint that is not in the registry`);
      }
      if (target.validatorId !== entry.validatorId) {
        fail(`${label} revokes a key belonging to a different validator`);
      }
      if (target.revokedAt !== null) {
        fail(`${label} revokes a key that was already revoked`);
      }
      if (target.publicKeyPem !== entry.publicKeyPem
        || target.notBefore !== entry.notBefore
        || target.notAfter !== entry.notAfter) {
        fail(
          `${label} restates the revoked key's public material inconsistently `
          + 'with its provisioning entry',
        );
      }
      target.revokedAt = entry.revokedAt;
      target.reason = entry.reason;
      target.status = 'revoked';
    }
  }
  return { byFingerprint, byValidator };
}

/**
 * Temporal authority for ONE key: was this key authorized to sign at `atMs`?
 *
 * ONE window rule, stated once for BOTH MV-B4 lanes:
 *   notBefore  INCLUSIVE — signing at exactly notBefore is inside the window
 *   notAfter   EXCLUSIVE — signing at exactly notAfter is already outside it
 *   revokedAt  STRICT cutoff — signing at exactly revokedAt is already outside
 *
 * The exclusive notAfter is a CHANGE from this lane's original inclusive rule,
 * made because the custody lane's verifyValidatorSignature has always used
 * `atMs >= notAfter -> refuse`. At exactly notAfter the two exported primitives
 * returned OPPOSITE verdicts, and a consumer using this lane standalone (which
 * the module presents as a fleet-verification primitive) accepted one instant
 * of signing authority the custody lane rejected. The stricter rule wins:
 * disagreeing about a boundary instant is worse than either choice, and
 * failing closed is the right direction to converge on.
 *
 * Stating the boundaries explicitly matters because "signed the same second the
 * key was revoked/expired" is precisely the case an attacker would aim for.
 */
function keyTrustAt(record, atMs) {
  if (atMs < Date.parse(record.notBefore)) {
    return { trusted: false, failureReason: 'key-not-yet-valid' };
  }
  if (record.notAfter !== null && atMs >= Date.parse(record.notAfter)) {
    return { trusted: false, failureReason: 'key-expired' };
  }
  if (record.revokedAt !== null && atMs >= Date.parse(record.revokedAt)) {
    return { trusted: false, failureReason: 'key-revoked' };
  }
  return { trusted: true, failureReason: null };
}

const FAILURE_PRIORITY = Object.freeze([
  'key-revoked',
  'key-expired',
  'key-not-yet-valid',
]);

function freezeKeyRecord(record) {
  assertExactKeys(record, KEY_RECORD_KEYS, 'key record');
  return deepFreeze({ ...record });
}

/**
 * THE TEMPORAL-AUTHORITY QUESTION, as a pure function over a snapshot: was
 * `validatorId` authorized to sign at the ASSERTED time `atTime`? (See the
 * header's "UNAUTHENTICATED signedAt" section — `atTime` is an input supplied
 * by whoever presents the artifact, never an observation.)
 *
 * THE SNAPSHOT IS VERIFIED HERE, not assumed. This is an exported primitive
 * written for a fleet party, and it previously called buildKeyRecords directly
 * on `registrySnapshot.entries` — no shape check, no chain walk, no
 * registryHash recompute. A snapshot whose `notAfter` had been edited without
 * repairing `entryHash` still returned trusted:true. `verifyTrustRegistry` now
 * runs first and a failing snapshot yields
 * `failureReason: 'registry-invalid: <reason>'`, so the precondition cannot be
 * forgotten by a caller who reads only this function's name.
 *
 * During a rotation overlap MORE THAN ONE key can be trusted at the same
 * instant, so `keyRecords` carries every trusted key and `keyRecord` is the
 * newest of them (highest provisioning sequence) as the deterministic pick.
 * Verification must try them all — the artifact does not say which key signed.
 */
export function resolveTrustedKeyAt({ registrySnapshot, validatorId, atTime }) {
  assertObject(registrySnapshot, 'registrySnapshot');
  assertIdentifier(validatorId, 'validatorId');
  const atMs = epochMs(atTime, 'atTime');
  const snapshotVerification = verifyTrustRegistry(registrySnapshot);
  if (!snapshotVerification.ok) {
    return {
      failureReason: `registry-invalid: ${snapshotVerification.failureReason}`,
      keyRecord: null,
      keyRecords: [],
      trusted: false,
    };
  }
  const { byValidator } = buildKeyRecords(registrySnapshot.entries ?? []);
  const records = byValidator.get(validatorId);
  if (!records || records.length === 0) {
    return { failureReason: 'validator-not-in-registry', keyRecord: null, keyRecords: [], trusted: false };
  }
  const trustedRecords = [];
  const reasons = new Set();
  for (const record of records) {
    const verdict = keyTrustAt(record, atMs);
    if (verdict.trusted) trustedRecords.push(record);
    else reasons.add(verdict.failureReason);
  }
  if (trustedRecords.length === 0) {
    const failureReason =
      FAILURE_PRIORITY.find((reason) => reasons.has(reason)) ?? 'no-trusted-key-at-time';
    return { failureReason, keyRecord: null, keyRecords: [], trusted: false };
  }
  const ordered = [...trustedRecords].sort(
    (left, right) => right.provisionedBySequence - left.provisionedBySequence,
  );
  return {
    failureReason: null,
    keyRecord: freezeKeyRecord(ordered[0]),
    keyRecords: deepFreeze(ordered.map((record) => freezeKeyRecord(record))),
    trusted: true,
  };
}

// ---------------------------------------------------------------------------
// Durable canonical on-disk form
// ---------------------------------------------------------------------------

function registryBody({ createdAt, entries, registryId }) {
  const unsigned = {
    createdAt,
    entries,
    registryId,
    schema: TRUST_REGISTRY_SCHEMA,
  };
  return { ...unsigned, registryHash: canonicalDigest(unsigned) };
}

function recomputeRegistryHash(snapshot) {
  const { registryHash, ...unsigned } = snapshot;
  void registryHash;
  return canonicalDigest(unsigned);
}

/**
 * Durable atomic publish: write a sibling temp file, fsync the descriptor,
 * then rename over the registry path. The registry is APPEND-ONLY in SEMANTICS
 * (entries are never modified or removed; the chain and the fork fence enforce
 * it) while being rewritten as ONE canonical document, because the spec's
 * publication form has to be byte-comparable between two parties — a jsonl log
 * is not.
 *
 * Process-crash durability is explicitly NOT claimed
 * (TRUST_REGISTRY_CLAIM_BOUNDARY.processCrashDurabilityClaimed === false); the
 * rename does bound the failure to "old complete file or new complete file",
 * never a torn one.
 *
 * WINDOWS SHARING VIOLATION, and why the retry exists. MoveFileEx over a
 * destination that another handle has open fails with EPERM. That directly
 * contradicted this module's central design decision — no exclusive lock,
 * because "a verifier must never be blocked by a writer's lock" — since in
 * practice on win32 a READER blocked the WRITER instead: any editor, tail,
 * backup agent, AV scanner, or fleet verifier holding a handle across a check
 * broke every append. Worse, the raw fs Error escaped untyped, so a caller
 * could not tell a transient sharing violation ("retry") from a corrupted
 * chain ("stop"). The rename is therefore retried with bounded backoff, and
 * the terminal failure is wrapped in ModelVillageTrustRegistryError with the
 * OS code preserved in the message.
 */
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) { /* bounded busy wait */ }
  }
}

/** Transient on win32 when another handle holds the destination open. */
const RETRYABLE_RENAME_CODES = Object.freeze(['EPERM', 'EACCES', 'EBUSY']);

function publishRegistryFile(registryPath, snapshot) {
  const serialized = Buffer.from(`${canonicalJson(snapshot)}\n`, 'utf8');
  const tempPath = `${registryPath}.tmp-${process.pid}`;
  const fd = openSync(tempPath, 'w');
  try {
    writeSync(fd, serialized, 0, serialized.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      renameSync(tempPath, registryPath);
      return;
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_RENAME_CODES.includes(error?.code)) break;
      sleepSync(5 * 2 ** attempt);
    }
  }
  try {
    if (existsSync(tempPath)) unlinkSync(tempPath);
  } catch {
    // Best-effort cleanup only; the rename failure is the reportable fault.
  }
  const code = lastError?.code ?? 'unknown';
  fail(
    `could not publish the trust registry atomically (${code})`
    + (RETRYABLE_RENAME_CODES.includes(code)
      ? '; another process is holding the registry file open — this is a '
        + 'transient sharing violation, the published registry is untouched '
        + 'and the append can be retried'
      : '; the published registry is untouched'),
  );
}

function readRegistryFile(registryPath) {
  if (!existsSync(registryPath)) {
    fail(`trust registry not found at ${registryPath}`);
  }
  const raw = readFileSync(registryPath, 'utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`trust registry at ${registryPath} is not valid JSON: ${error.message}`);
  }
  return parsed;
}

function assertRegistryBodyShape(snapshot) {
  assertExactKeys(snapshot, REGISTRY_BODY_KEYS, 'trust registry');
  if (snapshot.schema !== TRUST_REGISTRY_SCHEMA) {
    fail(`trust registry schema must be '${TRUST_REGISTRY_SCHEMA}'`);
  }
  assertIdentifier(snapshot.registryId, 'registryId');
  assertIsoUtc(snapshot.createdAt, 'createdAt');
  assertSha256(snapshot.registryHash, 'registryHash');
}

// ---------------------------------------------------------------------------
// Registry handle
// ---------------------------------------------------------------------------

class TrustRegistryHandle {
  #registryPath;
  #registryId;
  #createdAt;
  #entries;
  #registryHash;
  #operator;
  #closed = false;

  constructor({ registryPath, registryId, createdAt, entries, registryHash, operator }) {
    this.#registryPath = registryPath;
    this.#registryId = registryId;
    this.#createdAt = createdAt;
    this.#entries = entries;
    this.#registryHash = registryHash;
    this.#operator = operator ?? null;
  }

  get registryPath() { return this.#registryPath; }

  get registryId() { return this.#registryId; }

  get registryHash() { return this.#registryHash; }

  get sequence() { return this.#entries.length; }

  get closed() { return this.#closed; }

  /** Inertly closes this handle. Idempotent. No lock is held (see header). */
  close() {
    this.#closed = true;
  }

  #assertOpen(action) {
    if (this.#closed) {
      fail(`${action} is unavailable: this trust registry handle is closed`);
    }
  }

  /** Frozen, publishable canonical body — byte-identical to the on-disk form. */
  snapshot() {
    return deepFreeze({
      createdAt: this.#createdAt,
      entries: this.#entries.map((entry) => ({ ...entry })),
      registryHash: this.#registryHash,
      registryId: this.#registryId,
      schema: TRUST_REGISTRY_SCHEMA,
    });
  }

  listEntries() {
    return deepFreeze(this.#entries.map((entry) => ({ ...entry })));
  }

  /** Derived per-key lifecycle view for `validatorId` (or all validators). */
  listKeyRecords(validatorId) {
    const { byValidator } = buildKeyRecords(this.#entries);
    if (validatorId === undefined) {
      const all = [];
      for (const records of byValidator.values()) {
        for (const record of records) all.push(freezeKeyRecord(record));
      }
      return deepFreeze(all);
    }
    assertIdentifier(validatorId, 'validatorId');
    const records = byValidator.get(validatorId) ?? [];
    return deepFreeze(records.map((record) => freezeKeyRecord(record)));
  }

  resolveKeyAt(validatorId, atTime) {
    return resolveTrustedKeyAt({
      atTime,
      registrySnapshot: this.snapshot(),
      validatorId,
    });
  }

  /**
   * FORK FENCE. Before every append, re-read the on-disk registry and require
   * its ENTIRE entry prefix, registryId, and registryHash to still equal this
   * handle's in-memory state. A stale handle — or any external mutation —
   * fails loud on its OWN write instead of forking the append-only chain.
   *
   * Full-prefix rather than tail-only: this file is rewritten atomically, so a
   * foreign writer can change any historical line, not just append past the
   * tail.
   */
  #assertDiskMatchesHandle() {
    const disk = readRegistryFile(this.#registryPath);
    assertRegistryBodyShape(disk);
    if (disk.registryId !== this.#registryId) {
      fail(
        'trust registry at this path now carries a different registryId; '
        + 'refusing to append',
      );
    }
    if (
      disk.registryHash !== this.#registryHash
      || !Array.isArray(disk.entries)
      || disk.entries.length !== this.#entries.length
      || canonicalJson(disk.entries) !== canonicalJson(this.#entries)
    ) {
      fail(
        'trust registry moved outside this handle (concurrent or external '
        + 'write detected); refusing to fork the append-only chain',
      );
    }
  }

  /**
   * Appends one lifecycle entry. Append-only, hash-chained, fork-fenced,
   * write-then-fsync, and audited for private material BEFORE the file is
   * touched.
   */
  appendEntry(input) {
    this.#assertOpen('appendEntry');
    assertAllowedKeys(input, ENTRY_INPUT_KEYS, 'entry input');
    // Audit the raw caller input first: a leak must fail before it is
    // normalized into an entry, hashed, or written anywhere.
    assertNoPrivateKeyMaterial(input, 'entry input');

    const kind = input.kind;
    if (!TRUST_REGISTRY_ENTRY_KINDS.includes(kind)) {
      fail(`entry kind must be one of ${canonicalJson([...TRUST_REGISTRY_ENTRY_KINDS])}`);
    }
    const operator = input.operator ?? this.#operator;
    if (operator === null || operator === undefined) {
      fail('entry operator is required (no default operator on this handle)');
    }
    const publicKeyPem = normalizeSource(input.publicKeyPem ?? '');
    const keyFingerprint = input.keyFingerprint
      ?? (publicKeyPem.length > 0 ? trustRegistryKeyFingerprint(publicKeyPem) : null);

    const unsigned = {
      algorithm: input.algorithm ?? TRUST_REGISTRY_ALGORITHM,
      at: input.at ?? isoNow(),
      keyFingerprint,
      kind,
      notAfter: input.notAfter ?? null,
      notBefore: input.notBefore ?? null,
      operator,
      prevEntryHash:
        this.#entries.length === 0
          ? TRUST_REGISTRY_GENESIS
          : this.#entries[this.#entries.length - 1].entryHash,
      publicKeyPem,
      reason: input.reason ?? null,
      revokedAt: input.revokedAt ?? null,
      schema: TRUST_REGISTRY_ENTRY_SCHEMA,
      sequence: this.#entries.length + 1,
      sourceReceiptHash: input.sourceReceiptHash ?? null,
      status: input.status ?? (kind === 'revocation' ? 'revoked' : 'active'),
      supersededBy: input.supersededBy ?? null,
      supersedes: input.supersedes ?? null,
      validatorId: input.validatorId ?? null,
    };
    const entry = { ...unsigned, entryHash: canonicalDigest(unsigned) };

    validateEntryShape(entry, `registry entry ${entry.sequence}`);
    // Second audit over the fully normalized entry: defaults, coercions, and
    // derived fields are all in place, so nothing slipped past the input scan.
    assertNoPrivateKeyMaterial(entry, `registry entry ${entry.sequence}`);

    // Lifecycle legality is decided against the WHOLE prospective chain, so a
    // rotation that supersedes a revoked key or a duplicate provision is
    // rejected before publication rather than discovered later at verify time.
    const nextEntries = [...this.#entries, entry];
    validateEntryChain(nextEntries);
    buildKeyRecords(nextEntries);

    // Fence LAST, immediately before the atomic publish: every cheap rejection
    // has already happened, so the check-then-write window is as small as this
    // module can make it without a lock (see the header's honest limit).
    this.#assertDiskMatchesHandle();

    const nextSnapshot = registryBody({
      createdAt: this.#createdAt,
      entries: nextEntries,
      registryId: this.#registryId,
    });
    publishRegistryFile(this.#registryPath, nextSnapshot);
    this.#entries = nextEntries;
    this.#registryHash = nextSnapshot.registryHash;
    return deepFreeze({ ...entry });
  }
}

/**
 * Creates a new local trust registry file. Exclusive: refuses to overwrite an
 * existing registry, because silently replacing a published trust root is the
 * single most dangerous thing this module could do.
 */
export function createTrustRegistry({ registryPath, operator, registryId } = {}) {
  if (typeof registryPath !== 'string' || registryPath.length === 0) {
    fail('registryPath must be a non-empty string');
  }
  assertIdentifier(operator, 'operator');
  assertIdentifier(registryId, 'registryId');
  const resolved = path.resolve(registryPath);
  if (existsSync(resolved)) {
    fail(
      `a trust registry already exists at ${resolved}; refusing to overwrite a `
      + 'published registry',
    );
  }
  mkdirSync(path.dirname(resolved), { recursive: true });
  const snapshot = registryBody({
    createdAt: isoNow(),
    entries: [],
    registryId,
  });
  // Exclusive create so two concurrent creators cannot both believe they own
  // this path; the atomic publish path is used for every later append.
  const serialized = Buffer.from(`${canonicalJson(snapshot)}\n`, 'utf8');
  const fd = openSync(resolved, 'wx');
  try {
    writeSync(fd, serialized, 0, serialized.length);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return new TrustRegistryHandle({
    createdAt: snapshot.createdAt,
    entries: [],
    operator,
    registryHash: snapshot.registryHash,
    registryId: snapshot.registryId,
    registryPath: resolved,
  });
}

/**
 * Opens an existing registry, fully verifying it before returning a handle. An
 * unverifiable registry never yields a writable handle — appending onto a
 * broken chain would launder the break.
 */
export function openTrustRegistry({ registryPath, operator } = {}) {
  if (typeof registryPath !== 'string' || registryPath.length === 0) {
    fail('registryPath must be a non-empty string');
  }
  if (operator !== undefined) assertIdentifier(operator, 'operator');
  const resolved = path.resolve(registryPath);
  const snapshot = readRegistryFile(resolved);
  const verification = verifyTrustRegistry(snapshot);
  if (!verification.ok) {
    fail(`trust registry at ${resolved} failed verification: ${verification.failureReason}`);
  }
  return new TrustRegistryHandle({
    createdAt: snapshot.createdAt,
    entries: snapshot.entries.map((entry) => ({ ...entry })),
    operator: operator ?? null,
    registryHash: snapshot.registryHash,
    registryId: snapshot.registryId,
    registryPath: resolved,
  });
}

/**
 * Full independent re-verification of a published snapshot. Never throws —
 * a verifier that throws on hostile input is a denial-of-service surface, so
 * every failure is returned as a reason string.
 *
 * Order is deliberate: the ZERO-PRIVATE-MATERIAL audit runs FIRST, before
 * closed-key and chain checks, so a registry carrying leaked key material is
 * reported as a leak rather than as an incidental hash mismatch.
 */
export function verifyTrustRegistry(snapshot) {
  try {
    assertObject(snapshot, 'trust registry');
    assertNoPrivateKeyMaterial(snapshot, 'trust registry');
    assertRegistryBodyShape(snapshot);
    const { lastSequence } = validateEntryChain(snapshot.entries);
    if (lastSequence !== snapshot.entries.length) {
      return { ok: false, failureReason: 'entry count does not match the verified chain length' };
    }
    buildKeyRecords(snapshot.entries);
    if (recomputeRegistryHash(snapshot) !== snapshot.registryHash) {
      return { ok: false, failureReason: 'registryHash does not match its recomputed canonical digest' };
    }
    return { ok: true, failureReason: null };
  } catch (error) {
    return {
      ok: false,
      failureReason:
        error instanceof ModelVillageTrustRegistryError
          ? error.message
          : `trust registry verification error: ${error?.message ?? 'unknown'}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Fleet verification primitive
// ---------------------------------------------------------------------------

/**
 * THE FLEET VERIFICATION PRIMITIVE.
 *
 * A party holding ONLY the registry snapshot plus the signed artifact decides
 * whether that artifact is authentic. It holds no custody store, no key, and
 * no ability to sign — which is exactly why `verifySignature` is INJECTED
 * rather than imported: fleet verification must not depend on the custody
 * lane.
 *
 * Injected verifier contract:
 *   verifySignature({ algorithm, keyFingerprint, manifest, publicKeyPem,
 *                     signature, signedAt, validatorId }) -> boolean
 * A non-boolean return is treated as a FAILURE, not coerced — a verifier that
 * returns a truthy object must never be read as "valid".
 *
 * AN ADAPTER IS REQUIRED — do not pass MV-B4's `verifyValidatorSignature`
 * directly. Earlier revisions of this header said to, and that instruction was
 * wrong: its parameters are
 * `{ publicKeyPem, payload, signature, keyRecord, atTime }`, so handing it this
 * contract's argument object leaves `keyRecord` undefined, it returns
 * `refuse('invalid-key-record')` — an OBJECT — and this function correctly
 * treats the non-boolean as a failure. The result is a verifier that rejects
 * 100% of artifacts with a misleading reason. It fails closed, but it never
 * works. `createFleetVerifier` in
 * scripts/check-hololand-model-village-validator-custody.mjs is the reference
 * adapter: it recomputes the signing payload from PUBLIC material, looks the
 * custody key record up by PEM (the two lanes fingerprint keys differently),
 * and maps the custody verdict to a strict boolean.
 *
 * SEQUENCING IS NOT A SECURITY PROPERTY. The key is resolved at `signedAt`
 * before the signature is checked, but an earlier revision of this header
 * claimed the reverse order "would accept an artifact signed with a revoked
 * key". That is FALSE. `signedAt` is unauthenticated (see the header section of
 * the same name), so clock-first and signature-first accept exactly the same
 * artifact set; the order changes only which `failureReason` is reported and
 * spares the crypto work on a key that is not trusted anyway. Both are good
 * reasons to keep resolve-first. Neither is a defense.
 *
 * During a rotation overlap several keys may be trusted at `signedAt` and the
 * artifact does not name which one signed, so every trusted key is tried.
 */
export function verifyRunManifestAgainstRegistry({
  manifest,
  signature,
  validatorId,
  signedAt,
  registrySnapshot,
  verifySignature,
} = {}) {
  // Accept and reject return the SAME key set (values differ), so a consumer
  // can assert exact keys on the result without branching on ok.
  const reject = (failureReason) => ({
    failureReason,
    keyFingerprint: null,
    manifestHash: null,
    ok: false,
  });
  try {
    if (typeof verifySignature !== 'function') {
      return reject('verifier-not-provided');
    }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return reject('manifest-not-an-object');
    }
    if (typeof signature !== 'string' || signature.length === 0) {
      return reject('signature-missing');
    }
    if (typeof validatorId !== 'string' || validatorId.length === 0) {
      return reject('validator-id-missing');
    }
    if (typeof signedAt !== 'string' || !ISO_UTC_PATTERN.test(signedAt)) {
      return reject('signed-at-invalid');
    }

    const registryVerification = verifyTrustRegistry(registrySnapshot);
    if (!registryVerification.ok) {
      return reject(`registry-invalid: ${registryVerification.failureReason}`);
    }

    const resolution = resolveTrustedKeyAt({ atTime: signedAt, registrySnapshot, validatorId });
    if (!resolution.trusted) {
      return reject(resolution.failureReason);
    }

    for (const record of resolution.keyRecords) {
      let verdict = null;
      try {
        verdict = verifySignature({
          algorithm: record.algorithm,
          keyFingerprint: record.keyFingerprint,
          manifest,
          publicKeyPem: record.publicKeyPem,
          signature,
          signedAt,
          validatorId,
        });
      } catch {
        // The thrown value is NOT echoed: an injected verifier's error could
        // carry caller-supplied material, and this reason string is public.
        return reject('injected-verifier-threw');
      }
      if (verdict === true) {
        return {
          failureReason: null,
          keyFingerprint: record.keyFingerprint,
          manifestHash: canonicalDigest(manifest),
          ok: true,
        };
      }
      if (verdict !== false) {
        return reject('injected-verifier-returned-non-boolean');
      }
    }
    return reject('signature-verification-failed');
  } catch (error) {
    return reject(
      error instanceof ModelVillageTrustRegistryError
        ? `verification-error: ${error.message}`
        : 'verification-error',
    );
  }
}
