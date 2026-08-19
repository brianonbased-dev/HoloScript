#!/usr/bin/env node
/* global Buffer, console, process */

/**
 * Model Village MV-B4 validator custody INTEGRATION CHECK — the drop-in proof.
 *
 * Closes the spec gate row "Trust and outer verification"
 * (docs/specs/HOLOLAND_MODEL_VILLAGE_EXPERIMENT.md), whose REMAINING column is
 * exactly: "Production validator provisioning, custody, rotation, revocation,
 * trust publication, and fleet verification." Spec lines 256-261 name the same
 * gap: `createRuntimeInjectedValidatorFixture()` generates an EPHEMERAL
 * engineering key pair — "not production key provisioning, custody, or a trust
 * root."
 *
 * ===========================================================================
 * THE LOAD-BEARING CLAIM, AND HOW IT IS PROVEN
 * ===========================================================================
 * The claim is NOT "we wrote a custody module". The claim is:
 *
 *   the REAL, UNMODIFIED runPhase0BEngineeringTracer accepts a custody-backed
 *   validator in place of its bundled ephemeral fixture, and the run it
 *   produces verifies — including from a party that holds only public trust
 *   material and cannot sign anything.
 *
 * So this checker does not assert that. It RUNS it:
 *   1. provision  — Ed25519 key generated, PKCS8 sealed into an MV-B1
 *                   encrypted custody store, never written in plaintext
 *   2. publish    — a LOCAL append-only hash-chained trust registry (MV-B4
 *                   trust-registry lane) plus the custody lane's canonical
 *                   trust document
 *   3. DROP-IN    — `runPhase0BEngineeringTracer({ trustedValidatorConfig,
 *                   signRunManifest })` fed from the custody-backed validator,
 *                   then the run's receipt re-verified through the SHIPPED
 *                   `verifyPhase0BReceipt`
 *   4. FLEET      — the same run's manifest signature verified AGAIN from the
 *                   registry snapshot alone, then a NEGATIVE case (resolved at
 *                   a time outside the key's window) rejected
 *   5. ROTATION   — successor key, overlap window, historical verifiability
 *   6. REVOCATION — compromise reason, before/after cutoff, custody erasure
 *   7. COLD FLEET — every custody store CLOSED and its directory DELETED, then
 *                   the run re-verified from the published files alone
 *
 * If the tracer rejects the provider, the provider is wrong. The tracer is
 * never edited: `model-village-phase0b-runtime.mjs` is read-only to MV-B4.
 *
 * ===========================================================================
 * THE ONE HONEST DISCREPANCY, STATED UP FRONT
 * ===========================================================================
 * The task brief expected the tracer receipt to observe keyCustody
 * 'sealed-custody-store'. It CANNOT, and that is a property of the shipped
 * runtime, not a shortfall of this slice: `verifyRuntimeInjectedValidator`
 * allowlists exactly two custody values (phase0b-runtime :859-862) —
 * 'ephemeral_engineering_fixture' and 'external_host_key'. Publishing a third
 * value in the signed config would make every run FAIL, and widening the
 * allowlist would mean editing the tracer, which is out of bounds.
 *
 * So the observed runtime value is 'external_host_key' — the allowlist's
 * non-ephemeral member, and the honest statement at that layer ("this key did
 * not come from the in-process fixture"). The richer claim,
 * 'sealed-custody-store', is carried by the custody lane's provision receipt
 * and key record, which is where custody is actually described. This receipt
 * publishes BOTH values plus `keyCustodyIsEphemeralFixture: false`, so the
 * distinction is machine-checkable and a future allowlist change fails loud
 * instead of drifting silently.
 *
 * ===========================================================================
 * WHY THE FLEET VERIFIER IS AN ADAPTER AND NOT A REIMPLEMENTATION
 * ===========================================================================
 * The two peer lanes were written to be independent on purpose:
 *   - `model-village-trust-registry.mjs` owns TEMPORAL AUTHORITY (was this
 *     validator authorized at the instant it signed?) and deliberately imports
 *     nothing from the custody lane, so fleet verification has no dependency
 *     on the ability to sign. It therefore takes an INJECTED verifier:
 *       verifySignature({ algorithm, keyFingerprint, manifest, publicKeyPem,
 *                         signature, signedAt, validatorId }) -> boolean
 *   - `model-village-validator-custody.mjs` owns the CRYPTO
 *     (`verifyValidatorSignature`), which is pure — no store, no filesystem —
 *     but is shaped around a custody key record and returns
 *     `{ ok, failureReason, disposition }` rather than a bare boolean.
 *
 * `createFleetVerifier` below is the seam between them: it is the "one-line
 * adapter at the call site" the registry lane's contract asks for, and nothing
 * more. It recomputes both halves of the signing payload from PUBLIC material
 * the fleet party actually holds (never from the receipt's own pinned hashes),
 * maps the custody verdict to a strict boolean, and records the precise
 * custody-level failure reason — which the registry's coarse
 * 'signature-verification-failed' would otherwise erase.
 *
 * TWO FINGERPRINT DEFINITIONS — found by RUNNING the seam, not by reading it.
 * The two lanes name the same key by different digests, and nothing in either
 * module says so:
 *   custody  `keyFingerprint` = sha256(SPKI **DER**)      (provisionValidatorKey)
 *   registry `keyFingerprint` = sha256(normalized **PEM** text)
 *                                                   (trustRegistryKeyFingerprint)
 * The registry's header notes its digest matches the runtime config's
 * `publicKeyFingerprint` — true, because that field is `sourceDigest(pem)` —
 * but the custody lane's own `keyFingerprint` is the DER digest, so the two
 * are NOT interchangeable. Feeding a custody fingerprint into a registry entry
 * fails validation ("supersedes a keyFingerprint that is not in the registry"),
 * which is how this was caught.
 *
 * The seam therefore addresses keys by their PEM — the one representation both
 * lanes agree on byte-for-byte — and converts explicitly via
 * `trustRegistryKeyFingerprint()` at every registry boundary. Both digests are
 * published in this receipt so the distinction is visible instead of implicit.
 *
 * TWO TEMPORAL MODELS, AND WHY BOTH RUN. The registry keeps a superseded key
 * trusted until its own `notAfter` (a fleet mid-rollout still holds artifacts
 * signed by the outgoing key). The custody key record additionally enforces
 * `overlapUntil`. The custody model is therefore STRICTER during an overlap,
 * and running both means the tighter policy wins. The rotation drill proves
 * this explicitly: a signature dated past `overlapUntil` is rejected even
 * though the registry alone would still resolve the key as trusted.
 *
 * ===========================================================================
 * CLAIM BOUNDARY
 * ===========================================================================
 * This is the EXPERIMENT's research-artifact validator: it signs RUN
 * MANIFESTS. It is not a wallet, not treasury custody, not a minting
 * authority, and must never be described as one. "Trust publication" means a
 * LOCAL canonical file plus its receipt hash — nothing is sent to a network, a
 * remote host, or any external service.
 *
 * NOT claimed: a live study run, Phase 1 admission or readiness, HSM /
 * hardware-backed key storage, multi-party or threshold signing, an external
 * or public trust root, a trusted-timestamp authority, and fleet DEPLOYMENT.
 * Fleet VERIFIABILITY is proven (a party holding only published files, with
 * every custody store closed and deleted, verifies the run); deployment is
 * not.
 *
 * THE ASSERTED-TIME LIMIT, and why this drill's own plumbing exposes it. The
 * validator's signed payload is { configHash, domain, manifestHash } — no
 * timestamp — and neither the tracer receipt nor the run manifest carries one.
 * `clockRecorder` below exists precisely because the artifact cannot supply
 * the signing instant, so this drill reads it from an IN-PROCESS side channel
 * that a real fleet party does not have. Every temporal verdict here (window,
 * overlap, revocation cutoff) is therefore evaluated against an asserted time.
 * A holder of a revoked key can sign a fresh artifact and present a
 * pre-revocation `signedAt`; it verifies, carrying disposition 'suspect' only
 * when the revocation reason was a compromise reason. That is a real limit of
 * the slice, pinned in PINNED_CLAIM_BOUNDARY as
 * signingTimeBoundBySignatureClaimed / trustedTimestampAuthorityClaimed /
 * revocationEnforceableAgainstBackdatedTimeClaimed, and named in the emitted
 * receipt's notObserved list rather than left for a reader to infer.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createSealedCustodyStore } from './model-village-custody-store.mjs';
import {
  PHASE0B_VALIDATOR_SCHEMA,
  canonicalDigest,
  canonicalJson,
  runPhase0BEngineeringTracer,
  verifyPhase0BReceipt,
  verifyRuntimeInjectedValidator,
} from './model-village-phase0b-runtime.mjs';
import {
  PHASE0B_VALIDATOR_DOMAIN,
  VALIDATOR_KEY_CUSTODY,
  VALIDATOR_RUNTIME_KEY_CUSTODY,
  createCustodyBackedValidator,
  createValidatorTrustRegistry,
  provisionValidatorKey,
  publishValidatorTrustRegistry,
  revokeValidatorKey,
  rotateValidatorKey,
  validatorReceiptSigningPayload,
  verifyValidatorSignature,
  verifyValidatorTrustRegistryDocument,
} from './model-village-validator-custody.mjs';
import {
  createTrustRegistry,
  resolveTrustedKeyAt,
  trustRegistryKeyFingerprint,
  verifyRunManifestAgainstRegistry,
  verifyTrustRegistry,
} from './model-village-trust-registry.mjs';

export const VALIDATOR_CUSTODY_DRILL_SCHEMA =
  'hololand.model-village-validator-custody-drill.v1';

const DEFAULT_OUTPUT = '.tmp/hololand/model-village/validator-custody-receipt.json';
const DEFAULT_STORE_ROOT = '.tmp/hololand/model-village/validator-custody';

/**
 * Registry identity for the validator AUTHORITY. Deliberately distinct from a
 * per-key custody id: the on-disk registry models rotation as "same validator,
 * new key" (a rotation entry supersedes a fingerprint belonging to the SAME
 * validatorId), while the custody lane models it as "new key id, backward
 * pin". Mapping authority -> registry validatorId and key -> custody
 * validatorId reconciles the two WITHOUT editing either peer, and it is the
 * correct model anyway: a fleet asks "was this AUTHORITY allowed to sign at
 * time T", and rotation swaps which key answers for it.
 */
const AUTHORITY_ID = 'model-village-run-manifest-validator';
const VALIDATOR_K1_ID = 'mv-b4-validator-k1';
const VALIDATOR_K2_ID = 'mv-b4-validator-k2';
const OPERATOR = 'mv-b4-validator-custody-drill';
const REGISTRY_ID = 'model-village-validator-trust-registry';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const RECEIPT_KEYS = Object.freeze([
  'claimBoundary',
  'custodyAccessLogEntryCount',
  'custodyEvidence',
  'dropInProof',
  'fleetProof',
  'generatedAt',
  'provisionReceipts',
  'receiptHash',
  'registrySnapshotHash',
  'revocationDrill',
  'rotationDrill',
  'schema',
  'trustPublication',
]);

/**
 * Flags this slice must NEVER claim, pinned false so a reader does not have to
 * infer the boundary from prose. Asserted key-for-key by the suite.
 */
const PINNED_CLAIM_BOUNDARY = Object.freeze({
  custodyBackedValidatorAcceptedByRealTracer: true,
  engineeringCertificationDrill: true,
  fleetVerificationFromRegistrySnapshotOnly: true,
  localTrustPublicationPerformed: true,
  externalOrPublicTrustRootClaimed: false,
  fleetDeploymentClaimed: false,
  hardwareBackedKeyStorageClaimed: false,
  liveStudyRunClaimed: false,
  mintingAuthorityClaimed: false,
  networkPublicationPerformed: false,
  phase1AdmissionClaimed: false,
  phase1ReadinessClaimed: false,
  processMemoryScrubbingClaimed: false,
  rawModelTextIncluded: false,
  // The registry has no authorization on appendEntry: filesystem write access
  // is enough to splice a rotation entry naming a foreign key.
  registryEntryAuthorizationClaimed: false,
  // A revoked key's holder can sign now and assert a pre-revocation instant.
  // The drill reads the true instant from an in-process clock wrapper that no
  // fleet party has.
  revocationEnforceableAgainstBackdatedTimeClaimed: false,
  signingTimeBoundBySignatureClaimed: false,
  thresholdOrMultiPartySigningClaimed: false,
  trustedTimestampAuthorityClaimed: false,
  walletOrTreasuryCustodyClaimed: false,
});

export class ValidatorCustodyCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidatorCustodyCheckError';
  }
}

function fail(message) {
  throw new ValidatorCustodyCheckError(message);
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
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

// ---------------------------------------------------------------------------
// Independent anti-leak scanner.
//
// WHY A THIRD COPY EXISTS, deliberately: both peer lanes audit the artifacts
// THEY build, before those artifacts reach disk. Neither of them ever sees the
// bytes this checker finally emits, and neither is exported. This scanner runs
// over the FINAL emitted receipt and the FINAL on-disk registry file — the
// artifacts a reviewer actually reads — so a leak introduced by the assembly
// step between the peers is still caught. It is defense in depth over a
// different surface, not a duplicate of the same check.
//
// Detection is STRUCTURAL, not a keyword list: base64 runs are decoded at all
// four phases and every byte offset (a payload behind an arbitrary prefix is
// shifted by both a base64 phase and a whole number of bytes, so a single
// decode from index 0 misses it), and each decode is scanned for PKCS#8 /
// PKCS#1 / SEC1 DER framing.
//
// HONEST LIMIT: a bare 32-byte Ed25519 seed carries no DER framing and is
// byte-indistinguishable from a raw public key. Detection of DER/PEM-framed
// key material — the shape every node:crypto export produces — is what is
// claimed.
// ---------------------------------------------------------------------------

const PEM_PRIVATE_BANNER = /-----\s*BEGIN[A-Z0-9 ]*PRIVATE KEY\s*-----/i;
const PRIVATE_KEY_PHRASE = /PRIVATE\s+KEY/i;
const BASE64_RUN = /[A-Za-z0-9+/]{40,}={0,2}/g;

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

function bytesCarryPrivateKeyFraming(bytes) {
  const limit = bytes.length - 16;
  for (let offset = 0; offset <= limit; offset += 1) {
    if (bytes[offset] !== 0x30) continue;
    if (derLooksLikePrivateKey(bytes.subarray(offset))) return true;
  }
  return false;
}

function textCarriesPrivateKeyMaterial(value) {
  if (PEM_PRIVATE_BANNER.test(value)) return 'pem-banner';
  if (PRIVATE_KEY_PHRASE.test(value)) return 'free-text-phrase';
  const runs = value.replace(/\s+/g, '').match(BASE64_RUN);
  if (!runs) return null;
  for (const run of runs) {
    for (let phase = 0; phase < 4 && run.length - phase >= 40; phase += 1) {
      let decoded = null;
      try {
        decoded = Buffer.from(run.slice(phase), 'base64');
      } catch {
        decoded = null;
      }
      if (decoded && bytesCarryPrivateKeyFraming(decoded)) return 'der-framing';
    }
  }
  return null;
}

/**
 * Walks every key and string value at every depth. Returns the FIELD PATH of
 * the first hit, never the matched value — an anti-leak audit that echoes what
 * it found re-leaks exactly the material it exists to keep out.
 */
export function findPrivateKeyMaterial(value, label = 'value') {
  const stack = [[value, label]];
  while (stack.length > 0) {
    const [node, nodeLabel] = stack.pop();
    if (typeof node === 'string') {
      const kind = textCarriesPrivateKeyMaterial(node);
      if (kind !== null) return { path: nodeLabel, kind };
      continue;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => stack.push([entry, `${nodeLabel}[${index}]`]));
      continue;
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        stack.push([key, `${nodeLabel} key`]);
        stack.push([node[key], `${nodeLabel}.${key}`]);
      }
    }
  }
  return null;
}

/** Raw-byte DER scan for files that are not text (ciphertext, key blobs). */
function fileCarriesPrivateKeyMaterial(filePath) {
  const bytes = readFileSync(filePath);
  if (bytesCarryPrivateKeyFraming(bytes)) return 'der-framing';
  const text = bytes.toString('utf8');
  if (PEM_PRIVATE_BANNER.test(text)) return 'pem-banner';
  return null;
}

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function countJsonlLines(filePath) {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .length;
}

// ---------------------------------------------------------------------------
// THE SEAM: registry temporal authority x custody crypto.
// ---------------------------------------------------------------------------

/**
 * Builds the injected verifier `verifyRunManifestAgainstRegistry` expects.
 *
 * Inputs are exactly what a fleet party holds: the PUBLIC validator config
 * lifted off the artifact, and the published custody trust document (public
 * key records only). No custody store, no key that can sign, no ability to
 * produce a signature.
 *
 * Both halves of the signing payload are RECOMPUTED here rather than read off
 * the artifact's own pinned hashes — a doctored receipt that claims a
 * manifestHash belonging to a different manifest must not verify.
 */
export function createFleetVerifier({ custodyTrustDocument, validatorConfig }) {
  const documentCheck = verifyValidatorTrustRegistryDocument(custodyTrustDocument);
  if (!documentCheck.valid) {
    fail(`custody trust document is not verifiable: ${documentCheck.errors.join('; ')}`);
  }
  // Indexed by PEM, NOT by fingerprint: the registry addresses keys by
  // sha256(PEM) while a custody key record carries sha256(SPKI DER). The PEM
  // itself is the only representation both lanes hold byte-for-byte.
  const byPublicKeyPem = new Map(
    custodyTrustDocument.records.map((record) => [record.publicKeyPem, record]),
  );
  const configHash = canonicalDigest(validatorConfig);
  const observations = [];

  const verifySignature = ({ keyFingerprint, manifest, publicKeyPem, signature, signedAt }) => {
    const keyRecord = byPublicKeyPem.get(publicKeyPem);
    if (!keyRecord) {
      observations.push({
        disposition: null,
        failureReason: 'key-not-in-custody-trust-document',
        keyFingerprint,
        ok: false,
      });
      return false;
    }
    if (trustRegistryKeyFingerprint(keyRecord.publicKeyPem) !== keyFingerprint) {
      observations.push({
        disposition: null,
        failureReason: 'registry-fingerprint-does-not-re-derive-from-the-custody-record',
        keyFingerprint,
        ok: false,
      });
      return false;
    }
    const verdict = verifyValidatorSignature({
      atTime: signedAt,
      keyRecord,
      payload: {
        configHash,
        domain: PHASE0B_VALIDATOR_DOMAIN,
        manifestHash: canonicalDigest(manifest),
      },
      publicKeyPem,
      signature,
    });
    observations.push({
      disposition: verdict.disposition,
      failureReason: verdict.failureReason,
      keyFingerprint,
      ok: verdict.ok,
    });
    // Strict boolean. The registry treats a non-boolean as failure and never
    // coerces; returning the verdict object would be read as "not valid".
    return verdict.ok === true;
  };

  return { configHash, observations, verifySignature };
}

/**
 * One fleet-verification attempt: temporal authority from the chained registry
 * snapshot, crypto from the custody lane's pure verifier, and the precise
 * custody-level reason preserved (the registry's coarse
 * 'signature-verification-failed' otherwise erases WHY).
 */
export function fleetVerifyRunManifest({
  custodyTrustDocument,
  manifest,
  registrySnapshot,
  signature,
  signedAt,
  validatorConfig,
  validatorId = AUTHORITY_ID,
}) {
  const verifier = createFleetVerifier({ custodyTrustDocument, validatorConfig });
  const result = verifyRunManifestAgainstRegistry({
    manifest,
    registrySnapshot,
    signature,
    signedAt,
    validatorId,
    verifySignature: verifier.verifySignature,
  });
  const accepted = verifier.observations.find((entry) => entry.ok === true) ?? null;
  const lastRefusal = [...verifier.observations].reverse()
    .find((entry) => entry.ok === false) ?? null;
  return {
    custodyDisposition: accepted ? accepted.disposition : null,
    custodyFailureReason: accepted ? null : (lastRefusal?.failureReason ?? null),
    failureReason: result.failureReason,
    keyFingerprint: result.keyFingerprint,
    keysTried: verifier.observations.length,
    manifestHash: result.manifestHash,
    ok: result.ok,
  };
}

// ---------------------------------------------------------------------------
// Drill.
// ---------------------------------------------------------------------------

function newCustodyStore(rootDir, runLabel, frozenAt) {
  return createSealedCustodyStore({
    operator: OPERATOR,
    retentionPolicy: {
      description:
        'MV-B4 engineering validator custody drill; sealed signing material is '
        + 'destroyed with the store at the end of the drill',
      frozenAt,
      policyId: 'mv-b4-validator-custody-drill-v1',
    },
    rootDir,
    runLabel,
  });
}

/**
 * Wraps the validator's clock so the drill learns the EXACT instant a
 * signature was made. The tracer receipt does not record it, and fleet
 * verification is a question about that instant, so it has to be captured at
 * the source. `atTime` remains an ASSERTED signing time — no trusted-timestamp
 * claim is made anywhere in this slice.
 */
function clockRecorder() {
  const observed = [];
  return {
    now: () => {
      const at = new Date().toISOString();
      observed.push(at);
      return at;
    },
    observed,
    last() {
      if (observed.length === 0) fail('no signing time was observed');
      return observed[observed.length - 1];
    },
  };
}

export async function runValidatorCustodyDrill({
  root = process.cwd(),
  output = DEFAULT_OUTPUT,
  storeRoot = null,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const drillRoot = path.resolve(
    resolvedRoot,
    storeRoot ?? DEFAULT_STORE_ROOT,
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  mkdirSync(drillRoot, { recursive: true });

  const failures = [];
  const T0 = Date.now();
  const k1NotBefore = iso(T0 - HOUR_MS);
  const k1NotAfter = iso(T0 + DAY_MS);
  const rotationAt = iso(T0);
  const overlapUntil = iso(T0 + 12 * HOUR_MS);
  const revokedAt = iso(T0 + HOUR_MS);

  const registryPath = path.join(drillRoot, 'trust-registry.json');
  const custodyDocumentPath = path.join(drillRoot, 'custody-trust-document.json');
  const storeAPath = path.join(drillRoot, 'custody-store-k1');
  const storeBPath = path.join(drillRoot, 'custody-store-k2');

  // Two stores ON PURPOSE. MV-B1 exposes no per-object destruction by design
  // (its deletion method is content-key destruction plus append-only
  // tombstones, never chain rewriting), so destruction is STORE-SCOPED and
  // `revokeValidatorKey` REFUSES it when the store holds sealed material for
  // any other validator id. Giving each key its own store is what makes the
  // revocation drill's destruction step legal rather than collateral.
  const storeA = newCustodyStore(storeAPath, 'mv-b4-validator-k1', iso(T0));
  const storeB = newCustodyStore(storeBPath, 'mv-b4-validator-k2', iso(T0));

  const custodyRegistry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: REGISTRY_ID,
  });
  const trustRegistry = createTrustRegistry({
    operator: OPERATOR,
    registryId: REGISTRY_ID,
    registryPath,
  });

  let receipt = null;
  let resolvedOutput = null;
  const tracerScratchRemoved = [];

  try {
    // -----------------------------------------------------------------------
    // (b) PROVISION — key sealed in encrypted custody, absent everywhere public
    // -----------------------------------------------------------------------
    const k1 = provisionValidatorKey({
      at: iso(T0),
      custodyStore: storeA,
      notAfter: k1NotAfter,
      notBefore: k1NotBefore,
      operator: OPERATOR,
      trustRegistry: custodyRegistry,
      validatorId: VALIDATOR_K1_ID,
    });

    // Explicit conversion at the registry boundary (see TWO FINGERPRINT
    // DEFINITIONS in the header). Never pass a custody fingerprint here.
    const k1RegistryFingerprint = trustRegistryKeyFingerprint(k1.publicKeyPem);

    const provisionEntry = trustRegistry.appendEntry({
      at: iso(T0),
      kind: 'provision',
      notAfter: k1NotAfter,
      notBefore: k1NotBefore,
      publicKeyPem: k1.publicKeyPem,
      sourceReceiptHash: k1.receipt.receiptHash,
      validatorId: AUTHORITY_ID,
    });

    const sealedObjects = storeA.listObjects();
    if (sealedObjects.length !== 1) {
      failures.push(
        `expected exactly one sealed object in the k1 custody store, found `
        + `${sealedObjects.length}`,
      );
    } else {
      const sealed = sealedObjects[0];
      if (sealed.kind !== 'validator-private-key') {
        failures.push(`sealed object kind is ${sealed.kind}, expected validator-private-key`);
      }
      if (sealed.custodyId !== k1.receipt.privateKeyCustodyId) {
        failures.push('sealed custodyId does not match the provision receipt');
      }
    }
    if (k1.receipt.keyCustody !== VALIDATOR_KEY_CUSTODY) {
      failures.push(
        `provision receipt keyCustody is ${k1.receipt.keyCustody}, expected `
        + VALIDATOR_KEY_CUSTODY,
      );
    }

    // Signing material must be absent from EVERY file this drill has written,
    // scanned as raw bytes so ciphertext is covered too.
    const provisionLeak = walkFiles(drillRoot)
      .map((file) => ({ file: path.relative(drillRoot, file), kind: fileCarriesPrivateKeyMaterial(file) }))
      .find((entry) => entry.kind !== null) ?? null;
    if (provisionLeak !== null) {
      failures.push(
        `a drill file carries key material in the clear at ${provisionLeak.file} `
        + `(${provisionLeak.kind})`,
      );
    }
    const receiptLeak = findPrivateKeyMaterial(k1.receipt, 'provisionReceipt');
    if (receiptLeak !== null) {
      failures.push(`provision receipt carries key material at ${receiptLeak.path}`);
    }

    // -----------------------------------------------------------------------
    // (c) THE DROP-IN PROOF — the real tracer, unmodified, custody-backed
    // -----------------------------------------------------------------------
    const clock = clockRecorder();
    const validatorK1 = createCustodyBackedValidator({
      authorityId: AUTHORITY_ID,
      custodyStore: storeA,
      keyFingerprint: k1.keyFingerprint,
      now: clock.now,
      operator: OPERATOR,
      trustRegistry: custodyRegistry,
      validatorId: VALIDATOR_K1_ID,
    });

    if (validatorK1.config.schema !== PHASE0B_VALIDATOR_SCHEMA) {
      failures.push('custody-backed config does not carry the runtime validator schema');
    }
    if (Object.isFrozen(validatorK1.config) !== true) {
      failures.push('custody-backed config is not frozen; the tracer requires a frozen config');
    }

    // MEASURED, not asserted. `tracerRuntimeUnmodified` used to be a hardcoded
    // `true` with nothing producing it. It is now the comparison of the
    // tracer runtime's source digest taken immediately before and immediately
    // after the run, so the claim "this drill did not modify the runtime it is
    // proving itself against" is backed by a computation that can fail.
    //
    // HONEST SCOPE: this establishes that the drill did not mutate the file
    // mid-run. It does NOT establish that the file matches any upstream
    // baseline — there is no pinned reference digest to compare against, and
    // inventing one here would be an unbacked claim of a different kind. The
    // measured digest is published so a reviewer can pin it out of band.
    const tracerRuntimePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'model-village-phase0b-runtime.mjs',
    );
    const tracerRuntimeDigestBefore = sha256Hex(readFileSync(tracerRuntimePath));

    const tracerStoreDir = path.join(drillRoot, 'phase0b-store');
    const tracerReceipt = await runPhase0BEngineeringTracer({
      root: resolvedRoot,
      signRunManifest: validatorK1.issue,
      storeDir: tracerStoreDir,
      trustedValidatorConfig: validatorK1.config,
    });
    const tracerRuntimeDigestAfter = sha256Hex(readFileSync(tracerRuntimePath));
    const tracerRuntimeUnmodified =
      tracerRuntimeDigestBefore === tracerRuntimeDigestAfter;
    if (!tracerRuntimeUnmodified) {
      failures.push(
        'the phase0b tracer runtime source changed while the drill was running; '
        + 'MV-B4 must never modify model-village-phase0b-runtime.mjs',
      );
    }

    const signedAt = clock.last();
    if (clock.observed.length !== 1) {
      failures.push(
        `the tracer took ${clock.observed.length} signatures from the custody-backed `
        + 'validator; exactly one run manifest signature was expected',
      );
    }

    const tracerVerification = await verifyPhase0BReceipt(tracerReceipt, {
      root: resolvedRoot,
      trustedValidatorConfig: validatorK1.config,
    });
    if (!tracerVerification.valid) {
      failures.push(
        `phase0b receipt verification failed: ${tracerVerification.errors.join('; ')}`,
      );
    }
    if (tracerReceipt.status !== 'pass') {
      failures.push(`phase0b tracer status is ${tracerReceipt.status}, expected pass`);
    }
    if (tracerReceipt.validator.signatureVerified !== true) {
      failures.push('phase0b receipt does not report a verified validator signature');
    }

    const validatorReceipt = tracerReceipt.validator.validatorReceipt;
    const runManifest = validatorReceipt.manifest;
    const observedKeyCustody = tracerReceipt.validator.config.keyCustody;
    if (observedKeyCustody !== VALIDATOR_RUNTIME_KEY_CUSTODY) {
      failures.push(
        `tracer receipt observed keyCustody ${observedKeyCustody}, expected `
        + `${VALIDATOR_RUNTIME_KEY_CUSTODY} (the runtime allowlist's non-ephemeral member)`,
      );
    }
    if (observedKeyCustody === 'ephemeral_engineering_fixture') {
      failures.push('the tracer ran against the EPHEMERAL fixture; the drop-in did not take effect');
    }
    if (tracerReceipt.claimBoundary.trustedValidatorKeyCustody !== observedKeyCustody) {
      failures.push('tracer claimBoundary keyCustody disagrees with the signed validator config');
    }

    // Independent cross-check of the mirrored signing domain: rebuild the
    // payload from public material and require the peer helper to agree.
    const rebuiltPayload = {
      configHash: canonicalDigest(validatorReceipt.config),
      domain: PHASE0B_VALIDATOR_DOMAIN,
      manifestHash: canonicalDigest(runManifest),
    };
    if (canonicalJson(rebuiltPayload) !== canonicalJson(validatorReceiptSigningPayload(validatorReceipt))) {
      failures.push('recomputed signing payload disagrees with the receipt pinned hashes');
    }
    const runtimeRecheck = verifyRuntimeInjectedValidator(validatorReceipt, {
      trustedConfig: validatorK1.config,
    });
    if (!runtimeRecheck.valid) {
      failures.push(
        `shipped runtime verifier rejected the custody-backed receipt: `
        + runtimeRecheck.errors.join('; '),
      );
    }

    // -----------------------------------------------------------------------
    // TRUST PUBLICATION — local files only
    // -----------------------------------------------------------------------
    const publishAfterProvision = publishValidatorTrustRegistry({
      at: iso(T0),
      filePath: custodyDocumentPath,
      operator: OPERATOR,
      trustRegistry: custodyRegistry,
    });

    // -----------------------------------------------------------------------
    // (d) FLEET PROOF — registry snapshot + public key only
    // -----------------------------------------------------------------------
    const fleetPositive = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterProvision.document,
      manifest: runManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: validatorReceipt.signatureBase64,
      signedAt,
      validatorConfig: validatorReceipt.config,
    });
    if (!fleetPositive.ok) {
      failures.push(`fleet verification from the registry snapshot failed: ${fleetPositive.failureReason}`);
    }
    if (fleetPositive.manifestHash !== validatorReceipt.manifestHash) {
      failures.push('fleet-recomputed manifestHash disagrees with the signed receipt');
    }
    if (fleetPositive.keyFingerprint !== k1RegistryFingerprint) {
      failures.push('fleet verification resolved a different key than the one that signed');
    }

    // The negative is the half that makes the positive mean something: the
    // SAME signature, the SAME registry, resolved at an instant BEFORE the
    // key's window opened.
    const outsideWindowAt = iso(T0 - HOUR_MS - 1000);
    const fleetNegative = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterProvision.document,
      manifest: runManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: validatorReceipt.signatureBase64,
      signedAt: outsideWindowAt,
      validatorConfig: validatorReceipt.config,
    });
    if (fleetNegative.ok) {
      failures.push('fleet verification accepted a signature dated outside the key validity window');
    }
    if (fleetNegative.failureReason !== 'key-not-yet-valid') {
      failures.push(
        `out-of-window rejection reason was ${fleetNegative.failureReason}, expected key-not-yet-valid`,
      );
    }
    // A tampered manifest must fail too — otherwise "verified" would only mean
    // "some manifest was signed", not "THIS manifest was signed".
    const tamperedManifest = { ...runManifest, tamperedFieldForDrill: true };
    const fleetTampered = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterProvision.document,
      manifest: tamperedManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: validatorReceipt.signatureBase64,
      signedAt,
      validatorConfig: validatorReceipt.config,
    });
    if (fleetTampered.ok) {
      failures.push('fleet verification accepted a tampered run manifest');
    }

    // -----------------------------------------------------------------------
    // (e) ROTATION DRILL
    // -----------------------------------------------------------------------
    const rotationReceipt = rotateValidatorKey({
      at: rotationAt,
      currentValidatorId: VALIDATOR_K1_ID,
      // Successor is sealed into its OWN store; rotation never reads the
      // predecessor's custody, so a second store is free here and is what
      // keeps the later destruction step non-collateral.
      custodyStore: storeB,
      nextNotBefore: rotationAt,
      nextValidatorId: VALIDATOR_K2_ID,
      operator: OPERATOR,
      overlapUntil,
      trustRegistry: custodyRegistry,
    });
    const k2Fingerprint = rotationReceipt.successorKeyFingerprint;
    const k2RegistryFingerprint = trustRegistryKeyFingerprint(
      rotationReceipt.successorPublicKeyPem,
    );

    const rotationEntry = trustRegistry.appendEntry({
      at: rotationAt,
      kind: 'rotation',
      notAfter: rotationReceipt.successorProvisionReceipt.notAfter,
      notBefore: rotationReceipt.successorProvisionReceipt.notBefore,
      publicKeyPem: rotationReceipt.successorPublicKeyPem,
      sourceReceiptHash: rotationReceipt.receiptHash,
      supersedes: k1RegistryFingerprint,
      validatorId: AUTHORITY_ID,
    });
    const publishAfterRotation = publishValidatorTrustRegistry({
      at: rotationAt,
      filePath: custodyDocumentPath,
      operator: OPERATOR,
      trustRegistry: custodyRegistry,
    });

    // k1 keeps its historical verifiability inside the overlap...
    const historicInOverlap = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterRotation.document,
      manifest: runManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: validatorReceipt.signatureBase64,
      signedAt,
      validatorConfig: validatorReceipt.config,
    });
    if (!historicInOverlap.ok) {
      failures.push(
        `a k1-signed artifact stopped verifying inside the rotation overlap: `
        + historicInOverlap.failureReason,
      );
    }

    // ...and loses it past overlapUntil. The registry alone would still
    // resolve k1 as trusted here (it keeps a superseded key until notAfter);
    // the custody key record's overlapUntil is what refuses, so this is the
    // case that proves the stricter of the two temporal models wins.
    const pastOverlapAt = iso(T0 + 13 * HOUR_MS);
    const registryStillResolves = resolveTrustedKeyAt({
      atTime: pastOverlapAt,
      registrySnapshot: trustRegistry.snapshot(),
      validatorId: AUTHORITY_ID,
    });
    const historicPastOverlap = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterRotation.document,
      manifest: runManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: validatorReceipt.signatureBase64,
      signedAt: pastOverlapAt,
      validatorConfig: validatorReceipt.config,
    });
    if (historicPastOverlap.ok) {
      failures.push('a signature dated past overlapUntil was accepted');
    }
    if (historicPastOverlap.custodyFailureReason !== 'signature-after-supersession-overlap') {
      failures.push(
        `past-overlap refusal came from ${historicPastOverlap.custodyFailureReason}, `
        + 'expected signature-after-supersession-overlap',
      );
    }

    // k1 may no longer issue NEW signatures.
    let supersededIssueRefusal = null;
    try {
      validatorK1.issue(runManifest);
    } catch (error) {
      supersededIssueRefusal = error?.code ?? null;
    }
    if (supersededIssueRefusal !== 'validator-superseded') {
      failures.push(
        `superseded k1 issued or refused with ${supersededIssueRefusal}, expected validator-superseded`,
      );
    }

    // k2 signs new work, self-verified through the SHIPPED runtime verifier.
    const clockK2 = clockRecorder();
    const validatorK2 = createCustodyBackedValidator({
      authorityId: AUTHORITY_ID,
      custodyStore: storeB,
      keyFingerprint: k2Fingerprint,
      now: clockK2.now,
      operator: OPERATOR,
      trustRegistry: custodyRegistry,
      validatorId: VALIDATOR_K2_ID,
    });
    const k2Receipt = validatorK2.issue(runManifest);
    const k2SignedAt = clockK2.last();
    const k2Fleet = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterRotation.document,
      manifest: runManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: k2Receipt.signatureBase64,
      signedAt: k2SignedAt,
      validatorConfig: k2Receipt.config,
    });
    if (!k2Fleet.ok) {
      failures.push(`a successor-signed artifact did not fleet-verify: ${k2Fleet.failureReason}`);
    }
    if (k2Fleet.keyFingerprint !== k2RegistryFingerprint) {
      failures.push('successor artifact resolved to the wrong key');
    }

    const k1AfterRotation = custodyRegistry.get(VALIDATOR_K1_ID);
    const k2AfterRotation = custodyRegistry.get(VALIDATOR_K2_ID);
    const registryK1Record = trustRegistry.listKeyRecords(AUTHORITY_ID)
      .find((record) => record.keyFingerprint === k1RegistryFingerprint) ?? null;
    if (k1AfterRotation.status !== 'superseded' || k1AfterRotation.supersededBy !== VALIDATOR_K2_ID) {
      failures.push('custody registry did not record the forward supersession pin');
    }
    if (k2AfterRotation.supersedes !== VALIDATOR_K1_ID) {
      failures.push('custody registry did not record the backward supersession pin');
    }
    if (registryK1Record?.supersededBy !== k2RegistryFingerprint) {
      failures.push('published registry did not derive supersededBy for the outgoing key');
    }
    if (rotationReceipt.keyMaterialDestroyed !== false) {
      failures.push('rotation destroyed key material; rotation must never destroy');
    }

    // -----------------------------------------------------------------------
    // (f) REVOCATION DRILL
    // -----------------------------------------------------------------------
    // A STALE view on purpose: it still believes k1 is active. Without it, the
    // post-destruction refusal could come from the status check rather than
    // from custody, and the drill would prove nothing about erasure.
    const staleRegistry = createValidatorTrustRegistry({
      operator: OPERATOR,
      registryId: 'model-village-validator-stale-view',
    });
    staleRegistry.register(k1.receipt);
    const staleClock = clockRecorder();
    const staleK1 = createCustodyBackedValidator({
      authorityId: AUTHORITY_ID,
      custodyStore: storeA,
      keyFingerprint: k1.keyFingerprint,
      now: staleClock.now,
      operator: OPERATOR,
      trustRegistry: staleRegistry,
      validatorId: VALIDATOR_K1_ID,
    });
    // Positive control: the same handle CAN sign right now. Whatever it does
    // after destruction is therefore attributable to destruction alone.
    let preDestroySigned = false;
    try {
      staleK1.issue(runManifest);
      preDestroySigned = true;
    } catch (error) {
      failures.push(`stale-view control signature failed before destruction: ${error?.code ?? error?.message}`);
    }

    const revocationReceipt = revokeValidatorKey({
      at: revokedAt,
      custodyStore: storeA,
      destroyKeyMaterial: true,
      operator: OPERATOR,
      reason: 'key-compromise',
      revokedAt,
      trustRegistry: custodyRegistry,
      validatorId: VALIDATOR_K1_ID,
    });
    const revocationEntry = trustRegistry.appendEntry({
      at: revokedAt,
      kind: 'revocation',
      notAfter: k1NotAfter,
      notBefore: k1NotBefore,
      publicKeyPem: k1.publicKeyPem,
      reason: 'key-compromise',
      revokedAt,
      sourceReceiptHash: revocationReceipt.receiptHash,
      validatorId: AUTHORITY_ID,
    });
    const publishAfterRevocation = publishValidatorTrustRegistry({
      at: revokedAt,
      filePath: custodyDocumentPath,
      operator: OPERATOR,
      trustRegistry: custodyRegistry,
    });

    // The same handle that signed a moment ago can no longer read its key.
    // This is what read-per-signature buys: no restart is needed for the
    // erasure to take effect.
    let postDestroyRefusal = null;
    try {
      staleK1.issue(runManifest);
    } catch (error) {
      postDestroyRefusal = error?.code ?? null;
    }
    if (postDestroyRefusal !== 'validator-key-material-destroyed') {
      failures.push(
        `post-destruction signing refused with ${postDestroyRefusal}, expected `
        + 'validator-key-material-destroyed',
      );
    }
    if (revocationReceipt.keyMaterialDestroyed !== true) {
      failures.push('revocation receipt does not record the destruction it performed');
    }
    if (revocationReceipt.historicalSignatureDisposition !== 'suspect') {
      failures.push('a compromise revocation did not mark historical signatures suspect');
    }
    if (revocationReceipt.preRevocationSignaturesRemainVerifiable !== true) {
      failures.push('revocation receipt does not pin pre-revocation verifiability');
    }

    // Pre-revocation signature still verifies, and is surfaced as SUSPECT
    // rather than silently trusted or silently erased.
    const preRevocation = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterRevocation.document,
      manifest: runManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: validatorReceipt.signatureBase64,
      signedAt,
      validatorConfig: validatorReceipt.config,
    });
    if (!preRevocation.ok) {
      failures.push(`a pre-revocation signature stopped verifying: ${preRevocation.failureReason}`);
    }
    if (preRevocation.custodyDisposition !== 'suspect') {
      failures.push(
        `pre-revocation disposition is ${preRevocation.custodyDisposition}, expected suspect`,
      );
    }

    // The boundary instant belongs to the revocation: signed AT revokedAt is
    // already outside trust. "Signed the same second it was revoked" is
    // precisely the case an attacker aims for.
    const postRevocationAt = iso(T0 + HOUR_MS + 1000);
    const atRevocation = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterRevocation.document,
      manifest: runManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: validatorReceipt.signatureBase64,
      signedAt: revokedAt,
      validatorConfig: validatorReceipt.config,
    });
    const postRevocation = fleetVerifyRunManifest({
      custodyTrustDocument: publishAfterRevocation.document,
      manifest: runManifest,
      registrySnapshot: trustRegistry.snapshot(),
      signature: validatorReceipt.signatureBase64,
      signedAt: postRevocationAt,
      validatorConfig: validatorReceipt.config,
    });
    if (atRevocation.ok) failures.push('a signature dated exactly at revokedAt was accepted');
    if (postRevocation.ok) failures.push('a post-revocation signature was accepted');

    // WHY THE REASON SLUG IS COARSE HERE, and why that is correct: this
    // authority was ROTATED before it was revoked, so at the post-revocation
    // instant the SUCCESSOR key is still trusted. The registry therefore
    // resolves a trusted key, tries it, and reports the crypto failure — the
    // successor did not sign this artifact. Pinning 'key-revoked' here would
    // have been an expectation about an un-rotated authority.
    //
    // The precise revocation fact is asserted structurally instead: the
    // outgoing key must be GONE from the resolution set at that instant.
    const postRevocationResolution = resolveTrustedKeyAt({
      atTime: postRevocationAt,
      registrySnapshot: trustRegistry.snapshot(),
      validatorId: AUTHORITY_ID,
    });
    const outgoingStillResolved = postRevocationResolution.keyRecords
      .some((record) => record.keyFingerprint === k1RegistryFingerprint);
    if (outgoingStillResolved) {
      failures.push('the revoked key was still resolved as trusted after its revocation instant');
    }

    // ...and the SLUG itself is proven on an isolated registry that carries
    // ONLY this key's provision and revocation, so nothing else can be
    // resolved in its place. Same key, same entries, no successor — the
    // cleanest available statement of the cutoff rule.
    const cutoffRegistryPath = path.join(drillRoot, 'revocation-cutoff-registry.json');
    const cutoffRegistry = createTrustRegistry({
      operator: OPERATOR,
      registryId: 'model-village-revocation-cutoff-probe',
      registryPath: cutoffRegistryPath,
    });
    let cutoffPre = null;
    let cutoffAt = null;
    let cutoffPost = null;
    try {
      cutoffRegistry.appendEntry({
        at: iso(T0),
        kind: 'provision',
        notAfter: k1NotAfter,
        notBefore: k1NotBefore,
        publicKeyPem: k1.publicKeyPem,
        sourceReceiptHash: k1.receipt.receiptHash,
        validatorId: AUTHORITY_ID,
      });
      cutoffRegistry.appendEntry({
        at: revokedAt,
        kind: 'revocation',
        notAfter: k1NotAfter,
        notBefore: k1NotBefore,
        publicKeyPem: k1.publicKeyPem,
        reason: 'key-compromise',
        revokedAt,
        sourceReceiptHash: revocationReceipt.receiptHash,
        validatorId: AUTHORITY_ID,
      });
      const cutoffSnapshot = cutoffRegistry.snapshot();
      const cutoffArgs = {
        custodyTrustDocument: publishAfterRevocation.document,
        manifest: runManifest,
        registrySnapshot: cutoffSnapshot,
        signature: validatorReceipt.signatureBase64,
        validatorConfig: validatorReceipt.config,
      };
      cutoffPre = fleetVerifyRunManifest({ ...cutoffArgs, signedAt });
      cutoffAt = fleetVerifyRunManifest({ ...cutoffArgs, signedAt: revokedAt });
      cutoffPost = fleetVerifyRunManifest({ ...cutoffArgs, signedAt: postRevocationAt });
    } finally {
      cutoffRegistry.close();
    }
    if (!cutoffPre.ok) {
      failures.push(`isolated cutoff probe rejected a pre-revocation signature: ${cutoffPre.failureReason}`);
    }
    if (cutoffAt.failureReason !== 'key-revoked') {
      failures.push(
        `signature dated exactly at revokedAt was refused with ${cutoffAt.failureReason}, `
        + 'expected key-revoked (the boundary instant belongs to the revocation)',
      );
    }
    if (cutoffPost.failureReason !== 'key-revoked') {
      failures.push(
        `post-revocation refusal reason was ${cutoffPost.failureReason}, expected key-revoked`,
      );
    }

    // -----------------------------------------------------------------------
    // Custody evidence, then the COLD FLEET proof
    // -----------------------------------------------------------------------
    const integrityA = storeA.verifyIntegrity();
    const integrityB = storeB.verifyIntegrity();
    const accessLogA = countJsonlLines(path.join(storeAPath, 'access-log.jsonl'));
    const accessLogB = countJsonlLines(path.join(storeBPath, 'access-log.jsonl'));
    if (integrityA.mode !== 'ciphertext-checksum-only') {
      failures.push(
        `k1 store integrity mode is ${integrityA.mode}; after destruction it must be `
        + 'ciphertext-checksum-only',
      );
    }
    if (integrityA.ok !== true) failures.push('k1 custody store failed its integrity verification');
    if (integrityB.ok !== true) failures.push('k2 custody store failed its integrity verification');
    if (storeA.keyDestroyed !== true) failures.push('k1 custody store does not report a destroyed content key');
    if (storeB.keyDestroyed !== false) failures.push('k2 custody store key was destroyed collaterally');

    const registryFileBytes = readFileSync(registryPath);
    const custodyDocumentBytes = readFileSync(custodyDocumentPath);

    // FINAL raw-byte sweep over EVERY file the drill produced, run HERE rather
    // than only after provisioning. The earlier sweep (see "(b) PROVISION")
    // fires before publishValidatorTrustRegistry has written
    // custody-trust-document.json and before the trust registry file exists, so
    // on its own it never sees the published artifacts a fleet party is told to
    // consume. This one runs after every publication, every rotation and the
    // revocation, and it scans raw bytes so ciphertext and non-text blobs are
    // covered too.
    const finalLeak = walkFiles(drillRoot)
      .map((file) => ({
        file: path.relative(drillRoot, file),
        kind: fileCarriesPrivateKeyMaterial(file),
      }))
      .find((entry) => entry.kind !== null) ?? null;
    if (finalLeak !== null) {
      failures.push(
        `a published drill file carries key material in the clear at `
        + `${finalLeak.file} (${finalLeak.kind})`,
      );
    }
    const finalSnapshot = trustRegistry.snapshot();
    const registryVerification = verifyTrustRegistry(finalSnapshot);
    if (!registryVerification.ok) {
      failures.push(`published trust registry failed verification: ${registryVerification.failureReason}`);
    }

    storeA.close();
    storeB.close();
    trustRegistry.close();
    // The strongest available statement of fleet VERIFIABILITY: the custody
    // stores are gone from disk, so nothing in this scope could sign, and the
    // run still verifies from the two published files re-read from disk.
    rmSync(storeAPath, { force: true, recursive: true });
    rmSync(storeBPath, { force: true, recursive: true });
    const coldRegistrySnapshot = JSON.parse(registryFileBytes.toString('utf8'));
    const coldCustodyDocument = JSON.parse(custodyDocumentBytes.toString('utf8'));
    const coldFleet = fleetVerifyRunManifest({
      custodyTrustDocument: coldCustodyDocument,
      manifest: runManifest,
      registrySnapshot: coldRegistrySnapshot,
      signature: validatorReceipt.signatureBase64,
      signedAt,
      validatorConfig: validatorReceipt.config,
    });
    if (!coldFleet.ok) {
      failures.push(
        `cold fleet verification (custody stores deleted) failed: ${coldFleet.failureReason}`,
      );
    }

    // -----------------------------------------------------------------------
    // Receipt
    // -----------------------------------------------------------------------
    const provisionReceipts = [k1.receipt, rotationReceipt.successorProvisionReceipt];
    const unsigned = {
      claimBoundary: {
        ...PINNED_CLAIM_BOUNDARY,
        notObserved: [
          'no live study run: the tracer replays captured-response fixtures and makes zero provider calls',
          'no Phase 1 admission or readiness; this closes one gate row, it does not admit the phase',
          'no HSM or hardware-backed storage: the content key is an AES-256-GCM file key on this host',
          'no multi-party or threshold signing: one key signs',
          'no external or public trust root: publication is a LOCAL file plus its receipt hash',
          'no trusted-timestamp authority: every signing time is ASSERTED, never attested',
          'the signed payload commits to NO time at all, so a holder of a revoked key can sign now, assert a pre-revocation instant, and it verifies; revocation is enforceable against a party that reports the time honestly, not against one that controls it',
          'this drill learns the true signing instant from an in-process clock wrapper that no fleet party has; the artifact itself does not carry it',
          'no entry AUTHORIZATION on the trust registry: filesystem write access is enough to append a rotation entry naming a foreign key, and only an out-of-band registryHash pin detects it',
          'no fleet DEPLOYMENT: verifiability by a party holding only public files is proven, deployment is not',
          'no detection of a bare 32-byte seed, which carries no DER framing and is byte-indistinguishable from a public key',
          'no baseline comparison of the tracer runtime source: the digest is measured before and after the run and published for out-of-band pinning, not checked against a reference',
        ],
        observed: [
          'Ed25519 validator provisioned with its signing material sealed in an AES-256-GCM custody store and never written in the clear',
          'the real runPhase0BEngineeringTracer accepted the custody-backed validator UNMODIFIED and its receipt verified through the shipped verifyPhase0BReceipt',
          'the same run manifest signature re-verified from a published trust registry snapshot alone, and rejected when resolved outside the key validity window',
          'rotation with an overlap window: historical artifacts stay verifiable, the outgoing key is refused new signatures, and both supersession directions are recorded',
          'revocation with a compromise reason: the before/after cutoff holds at the boundary instant and historical signatures are surfaced as suspect rather than erased',
          'custody erasure takes effect on the very next signature, proven against a STALE trust view so the refusal cannot come from a status check',
          'an append-only hash-chained LOCAL trust registry whose entries, chain, and registryHash all re-verify independently',
          'cold fleet verification with every custody store closed and its directory deleted',
        ],
      },
      custodyAccessLogEntryCount: accessLogA + accessLogB,
      custodyEvidence: {
        // Published side by side because the two lanes name the same key with
        // different digests; a reader comparing them must not assume equality.
        custodyFingerprintAlgorithm: 'sha256(spki-der)',
        registryFingerprintAlgorithm: 'sha256(normalized-pem)',
        privateMaterialScan: {
          filesScannedBeforePublication: true,
          method: 'pem-banner + free-text-phrase + exhaustive-base64-alignment DER framing scan',
          rawSeedDetectionClaimed: false,
        },
        stores: [
          {
            accessLogEntryCount: accessLogA,
            directoryRemovedAfterDrill: true,
            integrityMode: integrityA.mode,
            integrityOk: integrityA.ok === true,
            keyDestroyed: true,
            label: 'mv-b4-validator-k1',
          },
          {
            accessLogEntryCount: accessLogB,
            directoryRemovedAfterDrill: true,
            integrityMode: integrityB.mode,
            integrityOk: integrityB.ok === true,
            keyDestroyed: false,
            label: 'mv-b4-validator-k2',
          },
        ],
      },
      dropInProof: {
        custodyLaneKeyCustody: VALIDATOR_KEY_CUSTODY,
        fixtureReplaced: 'createRuntimeInjectedValidatorFixture',
        keyCustodyIsEphemeralFixture: false,
        keyCustodyObserved: observedKeyCustody,
        keyCustodyObservedNote:
          'the shipped runtime verifier allowlists exactly two custody values, so a '
          + 'custody-backed validator publishes the non-ephemeral member in the SIGNED '
          + 'config; the sealed-custody claim is carried by the provision receipt',
        manifestHash: validatorReceipt.manifestHash,
        runtimeConfigHash: validatorReceipt.configHash,
        signedPayloadHash: validatorReceipt.signedPayloadHash,
        signingTimeAsserted: signedAt,
        signingTimeAssertedNote:
          'the drill observed this instant through an in-process clock wrapper; the '
          + 'signed payload carries NO timestamp, so a fleet party receives the signing '
          + 'time as an unauthenticated assertion and cannot check it',
        tracerReceiptHash: tracerReceipt.receipt.receiptHash,
        tracerRan: true,
        tracerRuntimeSourceSha256: tracerRuntimeDigestAfter,
        tracerRuntimeUnmodified,
        receiptVerified: tracerVerification.valid === true,
        terminalCommitment: tracerReceipt.runtime.terminalCommitment,
        validatorSignatureVerified: tracerReceipt.validator.signatureVerified === true,
      },
      fleetProof: {
        coldVerifiedWithCustodyStoresDeleted: coldFleet.ok === true,
        negativeCaseFailureReason: fleetNegative.failureReason,
        negativeCaseRejected: fleetNegative.ok === false,
        resolvedKeyFingerprint: fleetPositive.keyFingerprint,
        tamperedManifestRejected: fleetTampered.ok === false,
        verifiedFromRegistryOnly: fleetPositive.ok === true,
        verifierInjectedNotImported: true,
      },
      generatedAt: new Date().toISOString(),
      provisionReceipts,
      registrySnapshotHash: finalSnapshot.registryHash,
      revocationDrill: {
        atRevocationInstantRejected: atRevocation.ok === false,
        historicalSignatureDisposition: preRevocation.custodyDisposition,
        isolatedCutoffProbe: {
          atRevocationInstantFailureReason: cutoffAt.failureReason,
          note:
            'an isolated registry carrying ONLY this key proves the cutoff slug; on the '
            + 'rotated authority the successor key is still trusted at that instant, so the '
            + 'refusal there is a crypto failure rather than a resolution failure',
          postRevocationFailureReason: cutoffPost.failureReason,
          preRevocationVerified: cutoffPre.ok === true,
        },
        keyMaterialDestroyed: revocationReceipt.keyMaterialDestroyed === true,
        keyMaterialDestructionMethod: revocationReceipt.keyMaterialDestructionMethod,
        keyMaterialDestructionScope: revocationReceipt.keyMaterialDestructionScope,
        outgoingKeyRemovedFromResolutionSet: outgoingStillResolved === false,
        postDestructionSigningRefusalCode: postDestroyRefusal,
        postRevocationFailureReason: postRevocation.failureReason,
        postRevocationRejected: postRevocation.ok === false,
        preDestructionControlSigned: preDestroySigned,
        preRevocationStillVerifies: preRevocation.ok === true,
        reason: revocationReceipt.reason,
        registryEntrySequence: revocationEntry.sequence,
        revocationReceiptHash: revocationReceipt.receiptHash,
        revokedAt,
      },
      rotationDrill: {
        overlapUntil,
        pastOverlapCustodyFailureReason: historicPastOverlap.custodyFailureReason,
        pastOverlapRejected: historicPastOverlap.ok === false,
        predecessorKeyFingerprint: rotationReceipt.predecessorKeyFingerprint,
        predecessorRefusedNewSignatures: supersededIssueRefusal === 'validator-superseded',
        predecessorRegistryFingerprint: k1RegistryFingerprint,
        predecessorVerifiesInsideOverlap: historicInOverlap.ok === true,
        registryDerivedSupersededBy: registryK1Record?.supersededBy ?? null,
        registryEntrySequence: rotationEntry.sequence,
        registryStillResolvesPastOverlap: registryStillResolves.trusted === true,
        rotationReceiptHash: rotationReceipt.receiptHash,
        successorBackwardPin: k2AfterRotation.supersedes,
        successorKeyFingerprint: k2Fingerprint,
        successorRegistryFingerprint: k2RegistryFingerprint,
        successorSignedNewWork: k2Fleet.ok === true,
        keyMaterialDestroyed: rotationReceipt.keyMaterialDestroyed === true,
      },
      schema: VALIDATOR_CUSTODY_DRILL_SCHEMA,
      trustPublication: {
        custodyTrustDocumentRecordCount: publishAfterRevocation.document.recordCount,
        custodyTrustDocumentSha256: sha256Hex(custodyDocumentBytes),
        entryCount: finalSnapshot.entries.length,
        firstEntrySequence: provisionEntry.sequence,
        networkPublicationPerformed: false,
        registryFileName: path.basename(registryPath),
        registryHash: finalSnapshot.registryHash,
        registryId: finalSnapshot.registryId,
        trustPublicationReceiptHash: publishAfterRevocation.receipt.receiptHash,
      },
    };
    receipt = { ...unsigned, receiptHash: canonicalDigest(unsigned) };

    // HARD MACHINE CHECK. The emitted receipt and the published registry file
    // are the artifacts a reviewer reads; neither peer lane ever sees these
    // final bytes, so they are scanned here before the receipt is written.
    const emittedLeak = findPrivateKeyMaterial(receipt, 'receipt');
    if (emittedLeak !== null) {
      failures.push(
        `emitted receipt carries key material at ${emittedLeak.path} (${emittedLeak.kind})`,
      );
    }
    const registryLeakKind = textCarriesPrivateKeyMaterial(registryFileBytes.toString('utf8'));
    if (registryLeakKind !== null) {
      failures.push(`published trust registry file carries key material (${registryLeakKind})`);
    }
    const documentLeakKind = textCarriesPrivateKeyMaterial(custodyDocumentBytes.toString('utf8'));
    if (documentLeakKind !== null) {
      failures.push(`published custody trust document carries key material (${documentLeakKind})`);
    }

    resolvedOutput = path.resolve(resolvedRoot, output);
    mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, `${JSON.stringify(receipt, null, 2)}\n`);

    const selfVerification = verifyValidatorCustodyReceipt(receipt);
    if (!selfVerification.ok) {
      failures.push(`emitted receipt failed self-verification: ${selfVerification.failureReason}`);
    }
  } finally {
    // close() is idempotent; this releases the exclusive store locks on every
    // failure path so a later operator handle can open the stores for audit.
    try { storeA.close(); } catch { /* already closed */ }
    try { storeB.close(); } catch { /* already closed */ }
    try { trustRegistry.close(); } catch { /* already closed */ }
    // The tracer's fault-injection stores are created with makeDefaultStoreDir,
    // which embeds THIS process id. Only those are removed, so a concurrent
    // run's scratch is never touched.
    const tracerScratchRoot = path.join(
      resolvedRoot, '.tmp', 'hololand', 'model-village', 'phase0b-runtime',
    );
    if (existsSync(tracerScratchRoot)) {
      for (const name of readdirSync(tracerScratchRoot)) {
        if (!name.includes(`-${process.pid}-`)) continue;
        const full = path.join(tracerScratchRoot, name);
        try {
          if (statSync(full).isDirectory()) {
            rmSync(full, { force: true, recursive: true });
            tracerScratchRemoved.push(name);
          }
        } catch { /* best-effort cleanup only */ }
      }
    }
  }

  if (failures.length > 0) {
    throw new ValidatorCustodyCheckError(
      `Model Village MV-B4 validator custody drill failed: ${failures.join('; ')}`
      + (resolvedOutput ? `. Receipt: ${resolvedOutput}` : ''),
    );
  }

  return {
    drillRoot,
    output: resolvedOutput,
    receipt,
    tracerScratchRemoved,
  };
}

// ---------------------------------------------------------------------------
// Receipt verification.
//
// LIMIT, stated plainly: this is closed-key SELF-CONSISTENCY plus an anti-leak
// audit. It is NOT authenticity — nothing here is signed, so a party who can
// re-hash can produce a self-consistent receipt. What it does establish is
// that the receipt's own claims are internally coherent and that it carries no
// key material.
// ---------------------------------------------------------------------------

export function verifyValidatorCustodyReceipt(receipt) {
  try {
    assertExactKeys(receipt, RECEIPT_KEYS, 'validator custody drill receipt');
    if (receipt.schema !== VALIDATOR_CUSTODY_DRILL_SCHEMA) {
      fail(`receipt schema must be '${VALIDATOR_CUSTODY_DRILL_SCHEMA}'`);
    }
    if (typeof receipt.generatedAt !== 'string' || Number.isNaN(Date.parse(receipt.generatedAt))) {
      fail('receipt.generatedAt must be a parseable timestamp');
    }
    if (!SHA256_PATTERN.test(receipt.registrySnapshotHash)) {
      fail('receipt.registrySnapshotHash must be lowercase sha256 hex');
    }
    if (
      !Number.isInteger(receipt.custodyAccessLogEntryCount)
      || receipt.custodyAccessLogEntryCount < 1
    ) {
      fail('receipt.custodyAccessLogEntryCount must be a positive integer');
    }

    if (!Array.isArray(receipt.provisionReceipts) || receipt.provisionReceipts.length !== 2) {
      fail('receipt.provisionReceipts must carry the two provisioned keys');
    }
    for (const [index, provision] of receipt.provisionReceipts.entries()) {
      if (provision.keyCustody !== VALIDATOR_KEY_CUSTODY) {
        fail(`receipt.provisionReceipts[${index}] does not declare sealed custody`);
      }
      if (!SHA256_PATTERN.test(provision.receiptHash)) {
        fail(`receipt.provisionReceipts[${index}].receiptHash must be sha256 hex`);
      }
    }

    const dropIn = receipt.dropInProof;
    if (dropIn.tracerRan !== true) fail('receipt.dropInProof.tracerRan must be true');
    if (dropIn.receiptVerified !== true) fail('receipt.dropInProof.receiptVerified must be true');
    if (dropIn.tracerRuntimeUnmodified !== true) {
      fail('receipt.dropInProof.tracerRuntimeUnmodified must be true');
    }
    if (dropIn.keyCustodyIsEphemeralFixture !== false) {
      fail('receipt.dropInProof must record that the ephemeral fixture was NOT used');
    }
    if (dropIn.keyCustodyObserved !== VALIDATOR_RUNTIME_KEY_CUSTODY) {
      fail(
        `receipt.dropInProof.keyCustodyObserved must be '${VALIDATOR_RUNTIME_KEY_CUSTODY}'`,
      );
    }
    if (dropIn.custodyLaneKeyCustody !== VALIDATOR_KEY_CUSTODY) {
      fail(`receipt.dropInProof.custodyLaneKeyCustody must be '${VALIDATOR_KEY_CUSTODY}'`);
    }
    if (typeof dropIn.terminalCommitment !== 'string' || dropIn.terminalCommitment.length === 0) {
      fail('receipt.dropInProof.terminalCommitment must be present');
    }
    for (const field of [
      'manifestHash',
      'runtimeConfigHash',
      'signedPayloadHash',
      'tracerReceiptHash',
      // Measured before/after the run rather than asserted; publishing it lets
      // a reviewer pin the tracer runtime out of band.
      'tracerRuntimeSourceSha256',
    ]) {
      if (!SHA256_PATTERN.test(dropIn[field])) {
        fail(`receipt.dropInProof.${field} must be lowercase sha256 hex`);
      }
    }

    const fleet = receipt.fleetProof;
    if (fleet.verifiedFromRegistryOnly !== true) {
      fail('receipt.fleetProof.verifiedFromRegistryOnly must be true');
    }
    if (fleet.negativeCaseRejected !== true) {
      fail('receipt.fleetProof.negativeCaseRejected must be true');
    }
    if (fleet.tamperedManifestRejected !== true) {
      fail('receipt.fleetProof.tamperedManifestRejected must be true');
    }
    if (fleet.coldVerifiedWithCustodyStoresDeleted !== true) {
      fail('receipt.fleetProof.coldVerifiedWithCustodyStoresDeleted must be true');
    }

    const rotation = receipt.rotationDrill;
    if (rotation.predecessorVerifiesInsideOverlap !== true) {
      fail('receipt.rotationDrill must show the outgoing key still verifying inside the overlap');
    }
    if (rotation.successorSignedNewWork !== true) {
      fail('receipt.rotationDrill must show the successor signing new work');
    }
    if (rotation.predecessorRefusedNewSignatures !== true) {
      fail('receipt.rotationDrill must show the superseded key refusing new signatures');
    }
    if (rotation.keyMaterialDestroyed !== false) {
      fail('rotation must never destroy key material');
    }
    // Compared against the REGISTRY digest, not the custody one: the two lanes
    // fingerprint the same key differently (sha256(PEM) vs sha256(SPKI DER)).
    if (rotation.registryDerivedSupersededBy !== rotation.successorRegistryFingerprint) {
      fail('receipt.rotationDrill supersession pins do not agree');
    }
    if (rotation.successorRegistryFingerprint === rotation.successorKeyFingerprint) {
      fail(
        'the registry and custody fingerprints for the successor are identical; the two '
        + 'lanes digest different encodings, so equality means one of them drifted',
      );
    }

    const revocation = receipt.revocationDrill;
    if (revocation.preRevocationStillVerifies !== true) {
      fail('receipt.revocationDrill must show pre-revocation signatures still verifying');
    }
    if (revocation.postRevocationRejected !== true) {
      fail('receipt.revocationDrill must show post-revocation signatures rejected');
    }
    if (revocation.atRevocationInstantRejected !== true) {
      fail('the revocation boundary instant must be rejected');
    }
    if (revocation.historicalSignatureDisposition !== 'suspect') {
      fail('a compromise revocation must surface historical signatures as suspect');
    }
    if (revocation.keyMaterialDestroyed !== true) {
      fail('receipt.revocationDrill must record the custody destruction it performed');
    }
    if (revocation.postDestructionSigningRefusalCode !== 'validator-key-material-destroyed') {
      fail('post-destruction signing must be refused for custody reasons');
    }
    if (revocation.outgoingKeyRemovedFromResolutionSet !== true) {
      fail('the revoked key must drop out of the trusted resolution set at its cutoff');
    }
    const cutoff = revocation.isolatedCutoffProbe;
    if (cutoff.preRevocationVerified !== true) {
      fail('the isolated cutoff probe must still verify a pre-revocation signature');
    }
    if (cutoff.atRevocationInstantFailureReason !== 'key-revoked') {
      fail("the revocation boundary instant must be refused with 'key-revoked'");
    }
    if (cutoff.postRevocationFailureReason !== 'key-revoked') {
      fail("post-revocation signatures must be refused with 'key-revoked'");
    }

    for (const [key, value] of Object.entries(PINNED_CLAIM_BOUNDARY)) {
      if (receipt.claimBoundary[key] !== value) {
        fail(`receipt.claimBoundary.${key} must be ${value}`);
      }
    }
    if (!Array.isArray(receipt.claimBoundary.observed) || receipt.claimBoundary.observed.length === 0) {
      fail('receipt.claimBoundary.observed must list what was actually exercised');
    }
    if (!Array.isArray(receipt.claimBoundary.notObserved) || receipt.claimBoundary.notObserved.length === 0) {
      fail('receipt.claimBoundary.notObserved must list what was NOT exercised');
    }
    if (receipt.trustPublication.networkPublicationPerformed !== false) {
      fail('trust publication is a local file; network publication must be pinned false');
    }

    const leak = findPrivateKeyMaterial(receipt, 'receipt');
    if (leak !== null) fail(`receipt carries key material at ${leak.path} (${leak.kind})`);

    const { receiptHash, ...unsigned } = receipt;
    if (!SHA256_PATTERN.test(receiptHash)) fail('receipt.receiptHash must be sha256 hex');
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
    json: false,
    output: DEFAULT_OUTPUT,
    root: process.cwd(),
    storeRoot: null,
    verify: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') args.root = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--store-root') args.storeRoot = argv[++index];
    else if (arg === '--verify') args.verify = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand Model Village MV-B4 validator custody drop-in check

Runs the REAL Phase 0B engineering tracer against a custody-backed validator in
place of its bundled ephemeral fixture, then verifies the run again from a
published local trust registry alone. Fully offline; no live model dependency.

Usage:
  node scripts/check-hololand-model-village-validator-custody.mjs [options]

Options:
  --root <path>        HoloLand repository root
  --output <path>      Receipt output path
  --store-root <path>  Parent directory for the drill custody stores
  --verify <path>      Verify an existing receipt file and exit
  --json               Print the receipt as JSON
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

// The argv[1] guard matters: this module is IMPORTED by its test suite and by
// any consumer that wants verifyValidatorCustodyReceipt. A bare
// pathToFileURL(process.argv[1]) throws when argv[1] is absent (an embedded or
// `-e` host), which would turn a library import into a crash.
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const args = parseArgs();
    if (args.verify) {
      const parsed = JSON.parse(readFileSync(path.resolve(args.root, args.verify), 'utf8'));
      const verification = verifyValidatorCustodyReceipt(parsed);
      if (!verification.ok) {
        console.error('[hololand-model-village-validator-custody] verify FAILED');
        console.error(verification.failureReason);
        process.exit(1);
      }
      console.log('[hololand-model-village-validator-custody] verify ok');
      console.log(`receiptHash: ${parsed.receiptHash}`);
    } else {
      const { receipt, output, drillRoot } = await runValidatorCustodyDrill(args);
      if (args.json) {
        console.log(JSON.stringify(receipt, null, 2));
      } else {
        console.log('[hololand-model-village-validator-custody] ok');
        console.log(`receipt: ${output}`);
        console.log(`drill root: ${drillRoot}`);
        console.log(
          `DROP-IN: tracerRan=${receipt.dropInProof.tracerRan} `
          + `receiptVerified=${receipt.dropInProof.receiptVerified} `
          + `keyCustodyObserved=${receipt.dropInProof.keyCustodyObserved} `
          + `(custody lane: ${receipt.dropInProof.custodyLaneKeyCustody})`,
        );
        console.log(`  terminalCommitment: ${receipt.dropInProof.terminalCommitment}`);
        console.log(
          `FLEET: fromRegistryOnly=${receipt.fleetProof.verifiedFromRegistryOnly} `
          + `negativeRejected=${receipt.fleetProof.negativeCaseRejected} `
          + `(${receipt.fleetProof.negativeCaseFailureReason}) `
          + `tamperRejected=${receipt.fleetProof.tamperedManifestRejected} `
          + `cold=${receipt.fleetProof.coldVerifiedWithCustodyStoresDeleted}`,
        );
        console.log(
          `ROTATION: overlapVerifies=${receipt.rotationDrill.predecessorVerifiesInsideOverlap} `
          + `successorSigned=${receipt.rotationDrill.successorSignedNewWork} `
          + `predecessorRefused=${receipt.rotationDrill.predecessorRefusedNewSignatures} `
          + `pastOverlapRejected=${receipt.rotationDrill.pastOverlapRejected}`,
        );
        console.log(
          `REVOCATION: preStillVerifies=${receipt.revocationDrill.preRevocationStillVerifies} `
          + `(${receipt.revocationDrill.historicalSignatureDisposition}) `
          + `postRejected=${receipt.revocationDrill.postRevocationRejected} `
          + `destroyed=${receipt.revocationDrill.keyMaterialDestroyed} `
          + `postDestroySigning=${receipt.revocationDrill.postDestructionSigningRefusalCode}`,
        );
        console.log(
          `TRUST REGISTRY: ${receipt.trustPublication.registryFileName} `
          + `entries=${receipt.trustPublication.entryCount} `
          + `registryHash=${receipt.trustPublication.registryHash}`,
        );
        console.log(`custody access-log entries: ${receipt.custodyAccessLogEntryCount}`);
        console.log('network publication performed: false (local files only)');
      }
    }
  } catch (error) {
    console.error('[hololand-model-village-validator-custody] FAILED');
    console.error(error?.stack ?? error?.message ?? error);
    process.exit(1);
  }
}
