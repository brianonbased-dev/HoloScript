/* global Buffer, process, structuredClone */

/**
 * MV-B4 validator custody INTEGRATION suite.
 *
 * Fully offline. The drill runs ONCE (it executes the real Phase 0B tracer, so
 * re-running it per test would be wasteful, not more rigorous) into a scratch
 * directory that is removed on exit; every test then interrogates that single
 * real result plus the artifacts it left on disk.
 *
 * The suite deliberately includes POSITIVE CONTROLS for its own detectors: an
 * assertion that "no key material was found" is worthless unless the detector
 * demonstrably finds key material when it is there, and unless it stays quiet
 * on the public keys that legitimately appear in every artifact.
 */

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  VALIDATOR_CUSTODY_DRILL_SCHEMA,
  createFleetVerifier,
  findPrivateKeyMaterial,
  runValidatorCustodyDrill,
  verifyValidatorCustodyReceipt,
} from '../check-hololand-model-village-validator-custody.mjs';
import { canonicalDigest } from '../model-village-phase0b-runtime.mjs';
import { verifyTrustRegistry } from '../model-village-trust-registry.mjs';
import { verifyValidatorTrustRegistryDocument } from '../model-village-validator-custody.mjs';

const HOLOLAND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const SCRATCH_ID = `${process.pid}-${randomUUID()}`;
const SCRATCH_REL = path.posix.join(
  '.tmp',
  'hololand',
  'model-village',
  'validator-custody-tests',
  SCRATCH_ID,
);
const SCRATCH_ABS = path.join(HOLOLAND_ROOT, SCRATCH_REL);
const OUTPUT_REL = path.posix.join(SCRATCH_REL, 'validator-custody-receipt.json');

const TRACER_SCRATCH_ROOT = path.join(
  HOLOLAND_ROOT, '.tmp', 'hololand', 'model-village', 'phase0b-runtime',
);

/**
 * Every flag this slice must never claim, restated INDEPENDENTLY here. If the
 * checker's own pinned set drifts, this suite fails — which is the entire
 * point of not importing it.
 */
const EXPECTED_CLAIM_BOUNDARY = Object.freeze({
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
  registryEntryAuthorizationClaimed: false,
  revocationEnforceableAgainstBackdatedTimeClaimed: false,
  signingTimeBoundBySignatureClaimed: false,
  thresholdOrMultiPartySigningClaimed: false,
  trustedTimestampAuthorityClaimed: false,
  walletOrTreasuryCustodyClaimed: false,
});

mkdirSync(SCRATCH_ABS, { recursive: true });

// ONE real drill. Everything below reads this.
const drill = await runValidatorCustodyDrill({
  output: OUTPUT_REL,
  root: HOLOLAND_ROOT,
  storeRoot: SCRATCH_REL,
});
const receipt = drill.receipt;

after(() => {
  rmSync(SCRATCH_ABS, { force: true, recursive: true });
});

// ---------------------------------------------------------------------------
// Receipt shape
// ---------------------------------------------------------------------------

test('receipt carries exactly the declared key set and schema', () => {
  assert.equal(receipt.schema, VALIDATOR_CUSTODY_DRILL_SCHEMA);
  assert.deepEqual(Object.keys(receipt).sort(), [
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
  assert.ok(Number.isFinite(Date.parse(receipt.generatedAt)));
  assert.match(receipt.registrySnapshotHash, /^[a-f0-9]{64}$/);
  assert.ok(receipt.custodyAccessLogEntryCount > 0);
});

test('the receipt was written to disk and re-verifies from that file', () => {
  const onDisk = JSON.parse(readFileSync(drill.output, 'utf8'));
  assert.equal(onDisk.receiptHash, receipt.receiptHash);
  assert.equal(verifyValidatorCustodyReceipt(onDisk).ok, true);
});

// ---------------------------------------------------------------------------
// THE DROP-IN PROOF — the load-bearing result
// ---------------------------------------------------------------------------

test('the REAL phase0b tracer ran against the custody-backed validator and its receipt verified', () => {
  const dropIn = receipt.dropInProof;
  assert.equal(dropIn.tracerRan, true);
  assert.equal(dropIn.receiptVerified, true);
  assert.equal(dropIn.validatorSignatureVerified, true);
  assert.equal(dropIn.tracerRuntimeUnmodified, true);
  assert.equal(dropIn.fixtureReplaced, 'createRuntimeInjectedValidatorFixture');
  assert.match(dropIn.terminalCommitment, /^[a-f0-9]{64}$/);
  for (const field of [
    'manifestHash',
    'runtimeConfigHash',
    'signedPayloadHash',
    'tracerReceiptHash',
    'tracerRuntimeSourceSha256',
  ]) {
    assert.match(dropIn[field], /^[a-f0-9]{64}$/, `${field} must be sha256 hex`);
  }
  assert.ok(Number.isFinite(Date.parse(dropIn.signingTimeAsserted)));
});

test('tracerRuntimeUnmodified is MEASURED, and the digest it rests on is published', () => {
  // It used to be a hardcoded `true` with no producing computation anywhere in
  // the checker, while the suite asserted that literal equalled true — a claim
  // backed by nothing. It is now the before/after comparison of the tracer
  // runtime's own source digest, and the measured digest is published so a
  // reviewer can pin it out of band.
  const dropIn = receipt.dropInProof;
  const actual = createHash('sha256')
    .update(readFileSync(path.join(HOLOLAND_ROOT, 'scripts', 'model-village-phase0b-runtime.mjs')))
    .digest('hex');
  assert.equal(
    dropIn.tracerRuntimeSourceSha256,
    actual,
    'the published tracer runtime digest must be the digest of the file the drill ran',
  );
  assert.equal(dropIn.tracerRuntimeUnmodified, true);
  // HONEST SCOPE, asserted so it cannot be quietly upgraded: this proves the
  // drill did not mutate the runtime mid-run, NOT that the runtime matches any
  // upstream baseline. There is no pinned reference digest, and the receipt
  // says so.
  assert.ok(
    receipt.claimBoundary.notObserved.some(
      (line) => line.includes('no baseline comparison of the tracer runtime source'),
    ),
    'the receipt must state that no baseline comparison was performed',
  );
});

test('the ephemeral engineering fixture was NOT what signed the run', () => {
  const dropIn = receipt.dropInProof;
  assert.equal(dropIn.keyCustodyIsEphemeralFixture, false);
  assert.notEqual(dropIn.keyCustodyObserved, 'ephemeral_engineering_fixture');
  // The shipped runtime verifier allowlists exactly two custody values, so the
  // SIGNED config publishes the non-ephemeral member while the sealed-custody
  // claim rides on the provision receipt. Both are pinned so a future
  // allowlist change fails loud here instead of drifting.
  assert.equal(dropIn.keyCustodyObserved, 'external_host_key');
  assert.equal(dropIn.custodyLaneKeyCustody, 'sealed-custody-store');
});

test('both provisioned keys declare sealed custody and chain their receipts', () => {
  assert.equal(receipt.provisionReceipts.length, 2);
  const [first, second] = receipt.provisionReceipts;
  for (const provision of receipt.provisionReceipts) {
    assert.equal(provision.keyCustody, 'sealed-custody-store');
    assert.equal(provision.algorithm, 'ed25519');
    assert.equal(provision.status, 'active');
    assert.match(provision.receiptHash, /^[a-f0-9]{64}$/);
    assert.match(provision.privateKeyCustodyId, /^[a-f0-9]{64}$/);
  }
  // The successor chains onto the predecessor rather than starting a new root.
  assert.equal(first.priorReceiptHash, '0'.repeat(64));
  assert.equal(second.priorReceiptHash, first.receiptHash);
});

// ---------------------------------------------------------------------------
// FLEET PROOF — positive AND negative
// ---------------------------------------------------------------------------

test('fleet verification succeeded from the registry snapshot alone', () => {
  const fleet = receipt.fleetProof;
  assert.equal(fleet.verifiedFromRegistryOnly, true);
  assert.equal(fleet.verifierInjectedNotImported, true);
  assert.match(fleet.resolvedKeyFingerprint, /^[a-f0-9]{64}$/);
});

test('fleet verification rejected the negative cases', () => {
  const fleet = receipt.fleetProof;
  assert.equal(fleet.negativeCaseRejected, true);
  assert.equal(fleet.negativeCaseFailureReason, 'key-not-yet-valid');
  assert.equal(fleet.tamperedManifestRejected, true);
});

test('the run still verified with every custody store closed and deleted', () => {
  assert.equal(receipt.fleetProof.coldVerifiedWithCustodyStoresDeleted, true);
  for (const label of ['custody-store-k1', 'custody-store-k2']) {
    assert.equal(
      existsSync(path.join(drill.drillRoot, label)),
      false,
      `${label} must be gone; fleet verifiability is proven without it`,
    );
  }
  // ...while the PUBLIC artifacts a fleet party actually holds remain.
  assert.equal(existsSync(path.join(drill.drillRoot, 'trust-registry.json')), true);
  assert.equal(existsSync(path.join(drill.drillRoot, 'custody-trust-document.json')), true);
});

test('the published trust registry independently re-verifies from its own file', () => {
  const snapshot = JSON.parse(
    readFileSync(path.join(drill.drillRoot, 'trust-registry.json'), 'utf8'),
  );
  const verification = verifyTrustRegistry(snapshot);
  assert.equal(verification.ok, true, verification.failureReason ?? '');
  assert.equal(snapshot.registryHash, receipt.registrySnapshotHash);
  assert.equal(snapshot.entries.length, receipt.trustPublication.entryCount);
  assert.deepEqual(
    snapshot.entries.map((entry) => entry.kind),
    ['provision', 'rotation', 'revocation'],
  );

  const document = JSON.parse(
    readFileSync(path.join(drill.drillRoot, 'custody-trust-document.json'), 'utf8'),
  );
  assert.equal(verifyValidatorTrustRegistryDocument(document).valid, true);
  assert.equal(document.recordCount, receipt.trustPublication.custodyTrustDocumentRecordCount);
});

// ---------------------------------------------------------------------------
// ROTATION
// ---------------------------------------------------------------------------

test('rotation preserved historical verifiability and moved signing to the successor', () => {
  const rotation = receipt.rotationDrill;
  assert.equal(rotation.predecessorVerifiesInsideOverlap, true);
  assert.equal(rotation.successorSignedNewWork, true);
  assert.equal(rotation.predecessorRefusedNewSignatures, true);
  assert.ok(Number.isFinite(Date.parse(rotation.overlapUntil)));
});

test('rotation never destroys the outgoing key material', () => {
  assert.equal(receipt.rotationDrill.keyMaterialDestroyed, false);
  const k2Store = receipt.custodyEvidence.stores
    .find((store) => store.label === 'mv-b4-validator-k2');
  assert.equal(k2Store.keyDestroyed, false);
});

test('the chain records supersession in BOTH directions', () => {
  const rotation = receipt.rotationDrill;
  // Backward pin lives on the successor (known at append time)...
  assert.equal(rotation.successorBackwardPin, 'mv-b4-validator-k1');
  // ...and the forward pin is DERIVED from the append-only chain.
  assert.equal(rotation.registryDerivedSupersededBy, rotation.successorRegistryFingerprint);
  assert.equal(rotation.registryEntrySequence, 2);
});

test('the two lanes fingerprint the same key differently, and the seam converts explicitly', () => {
  const rotation = receipt.rotationDrill;
  // custody = sha256(SPKI DER), registry = sha256(normalized PEM). Equality
  // would mean one of the two definitions silently drifted into the other.
  assert.notEqual(rotation.successorRegistryFingerprint, rotation.successorKeyFingerprint);
  assert.notEqual(rotation.predecessorRegistryFingerprint, rotation.predecessorKeyFingerprint);
  assert.equal(receipt.custodyEvidence.custodyFingerprintAlgorithm, 'sha256(spki-der)');
  assert.equal(receipt.custodyEvidence.registryFingerprintAlgorithm, 'sha256(normalized-pem)');
});

test('a signature dated past overlapUntil is refused by the custody record, not the registry', () => {
  const rotation = receipt.rotationDrill;
  assert.equal(rotation.pastOverlapRejected, true);
  assert.equal(rotation.pastOverlapCustodyFailureReason, 'signature-after-supersession-overlap');
  // The registry alone would STILL have resolved the superseded key as
  // trusted there (it keeps one until its own notAfter). The stricter of the
  // two temporal models is what refused, which is the property under test.
  assert.equal(rotation.registryStillResolvesPastOverlap, true);
});

// ---------------------------------------------------------------------------
// REVOCATION
// ---------------------------------------------------------------------------

test('revocation is a statement about time: before still verifies, after does not', () => {
  const revocation = receipt.revocationDrill;
  assert.equal(revocation.preRevocationStillVerifies, true);
  assert.equal(revocation.postRevocationRejected, true);
  assert.equal(revocation.atRevocationInstantRejected, true);
  assert.equal(revocation.outgoingKeyRemovedFromResolutionSet, true);
  assert.equal(revocation.reason, 'key-compromise');
  assert.ok(Number.isFinite(Date.parse(revocation.revokedAt)));
});

test('the revocation cutoff slug is proven on an isolated single-key registry', () => {
  const cutoff = receipt.revocationDrill.isolatedCutoffProbe;
  assert.equal(cutoff.preRevocationVerified, true);
  // The boundary instant belongs to the revocation: signed AT revokedAt is
  // already outside trust. This is precisely the case an attacker aims for.
  assert.equal(cutoff.atRevocationInstantFailureReason, 'key-revoked');
  assert.equal(cutoff.postRevocationFailureReason, 'key-revoked');
});

test('a compromise revocation surfaces history as suspect rather than erasing it', () => {
  assert.equal(receipt.revocationDrill.historicalSignatureDisposition, 'suspect');
  assert.equal(receipt.revocationDrill.preRevocationStillVerifies, true);
});

test('custody erasure stops the NEXT signature, proven against a stale trust view', () => {
  const revocation = receipt.revocationDrill;
  // The control matters: the same handle signed successfully moments earlier,
  // so the refusal is attributable to destruction and not to a status check.
  assert.equal(revocation.preDestructionControlSigned, true);
  assert.equal(revocation.keyMaterialDestroyed, true);
  assert.equal(revocation.postDestructionSigningRefusalCode, 'validator-key-material-destroyed');
  assert.equal(revocation.keyMaterialDestructionMethod, 'custody-content-key-destruction');
  // Store-scoped, and SAID so: MV-B1 exposes no per-object destruction.
  assert.equal(revocation.keyMaterialDestructionScope, 'custody-store');
});

test('destruction did not collaterally erase the successor key', () => {
  const stores = receipt.custodyEvidence.stores;
  const k1 = stores.find((store) => store.label === 'mv-b4-validator-k1');
  const k2 = stores.find((store) => store.label === 'mv-b4-validator-k2');
  assert.equal(k1.keyDestroyed, true);
  assert.equal(k1.integrityMode, 'ciphertext-checksum-only');
  assert.equal(k1.integrityOk, true);
  assert.equal(k2.keyDestroyed, false);
  assert.equal(k2.integrityMode, 'plaintext-decrypt');
  assert.equal(k2.integrityOk, true);
  assert.equal(
    receipt.custodyAccessLogEntryCount,
    k1.accessLogEntryCount + k2.accessLogEntryCount,
  );
});

// ---------------------------------------------------------------------------
// ZERO PRIVATE MATERIAL — over the receipt AND the published files
// ---------------------------------------------------------------------------

test('no key material in the emitted receipt or in any published trust file', () => {
  assert.equal(findPrivateKeyMaterial(receipt, 'receipt'), null);
  for (const name of ['trust-registry.json', 'custody-trust-document.json', 'revocation-cutoff-registry.json']) {
    const text = readFileSync(path.join(drill.drillRoot, name), 'utf8');
    assert.equal(findPrivateKeyMaterial(text, name), null, `${name} carries key material`);
    assert.equal(/-----BEGIN[A-Z ]*PRIVATE KEY-----/.test(text), false);
  }
  assert.equal(/PRIVATE KEY/.test(JSON.stringify(receipt)), false);
});

test('the anti-leak detector is not vacuous: it catches real sealed-key shapes', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const pkcs8Pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const pkcs8Base64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

  assert.notEqual(findPrivateKeyMaterial({ leaked: pkcs8Pem }, 'probe'), null);
  // Bare, header-less base64 must be caught too — that is the shape a naive
  // "just strip the PEM banner" leak takes.
  assert.notEqual(findPrivateKeyMaterial({ leaked: pkcs8Base64 }, 'probe'), null);
  // ...and behind an arbitrary prefix, which shifts it by both a base64 phase
  // and a whole number of bytes.
  for (const prefix of ['', 'x', 'ab', 'abc', 'keyblob']) {
    assert.notEqual(
      findPrivateKeyMaterial({ leaked: `${prefix}${pkcs8Base64}` }, 'probe'),
      null,
      `prefix of length ${prefix.length} defeated the alignment scan`,
    );
  }
  const hit = findPrivateKeyMaterial({ nested: { deep: pkcs8Pem } }, 'probe');
  assert.equal(hit.path, 'probe.nested.deep');
  // The audit names the field path and never echoes what it matched.
  assert.equal(JSON.stringify(hit).includes(pkcs8Base64.slice(0, 40)), false);
});

test('the detector stays quiet on the public material every artifact carries', () => {
  const { publicKey } = generateKeyPairSync('ed25519');
  const spkiPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
  const spkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  assert.equal(findPrivateKeyMaterial({ publicKeyPem: spkiPem }, 'probe'), null);
  assert.equal(findPrivateKeyMaterial({ spki: spkiBase64 }, 'probe'), null);
  assert.equal(
    findPrivateKeyMaterial({ signature: Buffer.alloc(64, 7).toString('base64') }, 'probe'),
    null,
  );
});

// ---------------------------------------------------------------------------
// Claim boundary
// ---------------------------------------------------------------------------

test('claim-boundary flags are exact', () => {
  for (const [flag, expected] of Object.entries(EXPECTED_CLAIM_BOUNDARY)) {
    assert.equal(receipt.claimBoundary[flag], expected, `claimBoundary.${flag}`);
  }
  assert.deepEqual(
    Object.keys(receipt.claimBoundary).sort(),
    [...Object.keys(EXPECTED_CLAIM_BOUNDARY), 'notObserved', 'observed'].sort(),
  );
  assert.ok(receipt.claimBoundary.observed.length >= 6);
  assert.ok(receipt.claimBoundary.notObserved.length >= 6);
  assert.equal(receipt.trustPublication.networkPublicationPerformed, false);
});

test('the receipt names the asserted-signing-time limit instead of burying it', () => {
  // The whole revocation/overlap machinery is evaluated against a time the
  // relying party did not observe. That is a real limit of the slice, and the
  // ARTIFACT — not just a module comment — has to say so, because the receipt
  // is what a reviewer reads.
  const prose = receipt.claimBoundary.notObserved.join(' ').toLowerCase();
  assert.ok(
    prose.includes('commits to no time'),
    'notObserved must state that the signed payload carries no timestamp',
  );
  assert.ok(
    prose.includes('in-process clock wrapper'),
    'notObserved must disclose that the drill learned the instant out of band',
  );
  assert.equal(receipt.claimBoundary.signingTimeBoundBySignatureClaimed, false);
  assert.equal(
    receipt.claimBoundary.revocationEnforceableAgainstBackdatedTimeClaimed,
    false,
  );
  assert.equal(receipt.claimBoundary.registryEntryAuthorizationClaimed, false);
  assert.ok(
    receipt.dropInProof.signingTimeAssertedNote.includes('unauthenticated'),
    'the signing time must be published as an assertion, not a fact',
  );
});

test('claim-boundary prose never asserts a claim this slice pinned false', () => {
  const prose = [
    ...receipt.claimBoundary.observed,
    ...receipt.claimBoundary.notObserved,
  ].join(' ').toLowerCase();
  for (const forbidden of ['wallet', 'treasury', 'minting', 'hsm']) {
    assert.equal(
      receipt.claimBoundary.observed.join(' ').toLowerCase().includes(forbidden),
      false,
      `observed[] must not mention ${forbidden}`,
    );
  }
  // The boundary must actually SAY what is missing, not just pin booleans.
  for (const required of ['live study run', 'phase 1', 'deployment']) {
    assert.ok(prose.includes(required), `notObserved must name: ${required}`);
  }
});

// ---------------------------------------------------------------------------
// Self-hash + tamper rejection
// ---------------------------------------------------------------------------

test('the receipt self-hash recomputes', () => {
  const { receiptHash, ...unsigned } = receipt;
  assert.equal(canonicalDigest(unsigned), receiptHash);
  assert.equal(verifyValidatorCustodyReceipt(receipt).ok, true);
});

test('verification rejects a tampered receipt', () => {
  const flipped = structuredClone(receipt);
  flipped.dropInProof.receiptVerified = false;
  assert.equal(verifyValidatorCustodyReceipt(flipped).ok, false);

  const rehashed = structuredClone(receipt);
  rehashed.fleetProof.negativeCaseRejected = false;
  // Re-hash so the ONLY thing wrong is the claim itself: a self-consistent
  // receipt that claims the negative case passed must still be refused.
  const { receiptHash: rehashedHash, ...body } = rehashed;
  void rehashedHash;
  const resealed = { ...body, receiptHash: canonicalDigest(body) };
  const verdict = verifyValidatorCustodyReceipt(resealed);
  assert.equal(verdict.ok, false);
  assert.match(verdict.failureReason, /negativeCaseRejected/);

  const hashOnly = structuredClone(receipt);
  hashOnly.receiptHash = 'f'.repeat(64);
  assert.match(verifyValidatorCustodyReceipt(hashOnly).failureReason, /does not recompute/);

  const extraKey = { ...receipt, smuggledField: true };
  assert.equal(verifyValidatorCustodyReceipt(extraKey).ok, false);

  const leaky = structuredClone(receipt);
  const { privateKey } = generateKeyPairSync('ed25519');
  leaky.custodyEvidence.smuggled = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const { receiptHash: leakyHash, ...leakyBody } = leaky;
  void leakyHash;
  const leakySealed = { ...leakyBody, receiptHash: canonicalDigest(leakyBody) };
  const leakVerdict = verifyValidatorCustodyReceipt(leakySealed);
  assert.equal(leakVerdict.ok, false);
  assert.match(leakVerdict.failureReason, /carries key material/);
});

test('the fleet verifier refuses an unverifiable custody trust document', () => {
  const document = JSON.parse(
    readFileSync(path.join(drill.drillRoot, 'custody-trust-document.json'), 'utf8'),
  );
  const doctored = { ...document, recordCount: document.recordCount + 1 };
  assert.throws(
    () => createFleetVerifier({
      custodyTrustDocument: doctored,
      validatorConfig: { any: 'config' },
    }),
    /not verifiable/,
  );
});

// ---------------------------------------------------------------------------
// Scratch isolation
// ---------------------------------------------------------------------------

test('the drill writes only under its own scratch root', () => {
  assert.ok(
    drill.drillRoot.startsWith(SCRATCH_ABS),
    `drill root ${drill.drillRoot} escaped the test scratch root`,
  );
  assert.ok(drill.output.startsWith(SCRATCH_ABS));
  const names = readdirSync(drill.drillRoot).sort();
  assert.deepEqual(names, [
    'custody-trust-document.json',
    'phase0b-store',
    'revocation-cutoff-registry.json',
    'trust-registry.json',
  ]);
});

test('the tracer scratch this process created was cleaned up', () => {
  if (!existsSync(TRACER_SCRATCH_ROOT)) return;
  const mine = readdirSync(TRACER_SCRATCH_ROOT)
    .filter((name) => name.includes(`-${process.pid}-`));
  assert.deepEqual(mine, [], 'tracer fault-injection scratch from this process was left behind');
});
