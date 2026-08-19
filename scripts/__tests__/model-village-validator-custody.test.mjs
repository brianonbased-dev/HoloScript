/* global Buffer, structuredClone */

/**
 * MV-B4 custody-backed validator suite. Fully offline, node --test, scratch
 * under os.tmpdir() and cleaned up.
 *
 * The load-bearing proofs here:
 *  - DROP-IN SHAPE: the custody-backed { issue, config } pair has exactly the
 *    same key sets as the shipped ephemeral fixture, and every receipt it
 *    issues is accepted by the SHIPPED verifyRuntimeInjectedValidator with a
 *    trustedConfig pin (which is what runPhase0BEngineeringTracer does).
 *  - KEY CUSTODY LAW: the sealed private key's own base64/hex never appears in
 *    any public artifact.
 *  - TIME SEMANTICS: rotation and revocation are tested on BOTH sides of their
 *    boundary instants.
 *  - FLEET CASE: verification with no custody store on disk at all.
 */

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  createSealedCustodyStore,
} from '../model-village-custody-store.mjs';
import {
  canonicalJson,
  createRuntimeInjectedValidatorFixture,
  verifyRuntimeInjectedValidator,
} from '../model-village-phase0b-runtime.mjs';
import {
  ModelVillageValidatorCustodyError,
  PHASE0B_VALIDATOR_DOMAIN,
  VALIDATOR_CUSTODY_CLAIM_BOUNDARY,
  VALIDATOR_CUSTODY_ENGINE,
  VALIDATOR_CUSTODY_SCHEMA,
  VALIDATOR_KEY_RECORD_SCHEMA,
  VALIDATOR_PRIVATE_KEY_CUSTODY_KIND,
  VALIDATOR_PROVISION_RECEIPT_SCHEMA,
  VALIDATOR_REVOCATION_RECEIPT_SCHEMA,
  VALIDATOR_ROTATION_RECEIPT_SCHEMA,
  createCustodyBackedValidator,
  createValidatorTrustRegistry,
  provisionValidatorKey,
  publishValidatorTrustRegistry,
  revokeValidatorKey,
  rotateValidatorKey,
  validatorReceiptSigningPayload,
  verifyValidatorReceiptHash,
  verifyValidatorSignature,
  verifyValidatorTrustRegistryDocument,
} from '../model-village-validator-custody.mjs';

const OPERATOR = 'mv-b4-engineering-operator';
const WIDE_WINDOW = Object.freeze({
  notAfter: '2999-01-01T00:00:00Z',
  notBefore: '2020-01-01T00:00:00Z',
});

const scratchRoots = [];
const openStores = [];

function scratchDir(label) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `mv-b4-${label}-`));
  scratchRoots.push(dir);
  return dir;
}

function newStore(label) {
  const store = createSealedCustodyStore({
    operator: OPERATOR,
    retentionPolicy: {
      description: 'MV-B4 offline validator custody test store',
      frozenAt: '2026-01-01T00:00:00Z',
      policyId: 'mv-b4-test-retention-v1',
    },
    rootDir: path.join(scratchDir(label), 'store'),
    runLabel: `mv-b4-${label}`,
  });
  openStores.push(store);
  return store;
}

after(() => {
  for (const store of openStores) {
    try {
      store.close();
    } catch {
      /* already closed */
    }
  }
  for (const root of scratchRoots) {
    rmSync(root, { force: true, recursive: true });
  }
});

/** sha256-shaped filler; assertRunManifest only checks the hex shape. */
function hex(seed) {
  return seed.repeat(64).slice(0, 64);
}

/**
 * A structurally valid phase0b run manifest. Mirrors buildRunManifest's output
 * shape exactly (RUN_MANIFEST_KEYS / SIGNED_ACTION_KEYS / AUTHORIZATION_KEYS /
 * ACTION_ARGUMENT_KEYS / STOP_BINDING_KEYS), which is what assertRunManifest
 * enforces inside the shipped verifier.
 */
function makeRunManifest(overrides = {}) {
  const action = (index) => ({
    args: {
      capturedResponseHash: hex(index === 0 ? 'a' : 'b'),
      challengeManifestHash: hex('c'),
      metricSpecHash: hex('d'),
      parsedProposal: `proposal_${index}`,
      residentId: `resident_${index}`,
    },
    authorization: {
      decisionReceiptId: `decision-${index}`,
      nonce: `nonce-${index}`,
      safetyReceiptId: `safety-${index}`,
      sequence: index,
      turnOpportunityId: `turn-${index}`,
    },
    entrypoint: 'submit_proposal',
    expectedAllowed: true,
    expectedOutcome: 'proposal_accepted',
    scheduleEntryId: `schedule-${index}`,
    targetIds: [`Resident${index}`],
  });
  return {
    actions: [action(0), action(1)],
    capturedResponses: [0, 1].map((index) => ({
      adapterAlias: `adapter_${index === 0 ? 'a' : 'b'}`,
      parsedProposal: `proposal_${index}`,
      residentId: `resident_${index}`,
      responseHash: hex(index === 0 ? 'a' : 'b'),
      responseId: `response-${index}`,
    })),
    challengeManifestHash: hex('c'),
    emergencyStop: {
      args: { reason: 'operator_stop' },
      authorization: {
        decisionReceiptId: 'decision-stop',
        nonce: 'nonce-stop',
        safetyReceiptId: 'safety-stop',
        sequence: 0,
        turnOpportunityId: 'turn-stop',
      },
      entrypoint: 'freeze_run',
      expectedAllowed: true,
      expectedFinalState: { frozen: true },
      expectedOutcome: 'run_frozen',
      scheduleEntryId: 'schedule-stop',
      targetIds: ['EmergencyStop'],
    },
    expectedFinalState: { tick: 6 },
    metricSpecHash: hex('d'),
    runId: 'mv-phase0b-tracer-001',
    schema: 'hololand.model-village-phase0b-run-manifest.v1',
    sources: {
      behaviorSourceHash: hex('1'),
      manifestSourceHash: hex('2'),
      planExecutionSourceHash: hex('3'),
      planTemplateSourceHash: hex('4'),
      stopPlanSourceHash: hex('5'),
      visibleWorldSourceHash: hex('6'),
      worldSourceHash: hex('7'),
    },
    validatorPolicyVersion: 'runtime-injected-ed25519-v1',
    ...overrides,
  };
}

/** Provision + register a validator and return everything the tests need. */
function provisionRegistered({
  custodyStore,
  registry,
  validatorId,
  window = WIDE_WINDOW,
}) {
  const provisioned = provisionValidatorKey({
    custodyStore,
    notAfter: window.notAfter,
    notBefore: window.notBefore,
    operator: OPERATOR,
    trustRegistry: registry,
    validatorId,
  });
  const validator = createCustodyBackedValidator({
    custodyStore,
    keyFingerprint: provisioned.keyFingerprint,
    operator: OPERATOR,
    trustRegistry: registry,
    validatorId,
  });
  return { ...provisioned, validator };
}

function expectCustodyError(fn, code) {
  assert.throws(
    fn,
    (error) => {
      assert.ok(
        error instanceof ModelVillageValidatorCustodyError,
        `expected ModelVillageValidatorCustodyError, got ${error?.name}`,
      );
      assert.equal(error.code, code, `expected code ${code}, got ${error.code}`);
      return true;
    },
  );
}

test('provisioning seals the private key and publishes only public material', () => {
  const store = newStore('provision');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-provision',
  });
  const { receipt, publicKeyPem, keyFingerprint } = provisionValidatorKey({
    custodyStore: store,
    notAfter: WIDE_WINDOW.notAfter,
    notBefore: WIDE_WINDOW.notBefore,
    operator: OPERATOR,
    trustRegistry: registry,
    validatorId: 'validator-provision-a',
  });

  assert.equal(receipt.schema, VALIDATOR_PROVISION_RECEIPT_SCHEMA);
  assert.equal(receipt.engine, VALIDATOR_CUSTODY_ENGINE);
  assert.equal(receipt.algorithm, 'ed25519');
  assert.equal(receipt.status, 'active');
  assert.equal(receipt.supersedes, null);
  assert.equal(receipt.keyCustody, 'sealed-custody-store');
  assert.notEqual(receipt.keyCustody, 'ephemeral_engineering_fixture');
  assert.equal(receipt.publicKeySpkiSha256, keyFingerprint);
  assert.match(receipt.keyFingerprint, /^[a-f0-9]{64}$/);
  assert.ok(verifyValidatorReceiptHash(receipt));

  // The private key is in custody, sealed under the documented kind.
  const sealed = store.listObjects();
  assert.equal(sealed.length, 1);
  assert.equal(sealed[0].kind, VALIDATOR_PRIVATE_KEY_CUSTODY_KIND);
  assert.equal(sealed[0].custodyId, receipt.privateKeyCustodyId);

  // ANTI-LEAK: the actual sealed key bytes, in every encoding, are absent from
  // every public artifact.
  const opened = store.readObject(receipt.privateKeyCustodyId);
  const pkcs8Base64 = Buffer.from(opened.bytes).toString('base64');
  const pkcs8Hex = Buffer.from(opened.bytes).toString('hex');
  const seedBase64 = Buffer.from(opened.bytes).subarray(-32).toString('base64');
  const record = registry.get('validator-provision-a');
  const artifacts = [
    canonicalJson(receipt),
    canonicalJson(record),
    canonicalJson(registry.snapshot()),
    publicKeyPem,
  ];
  for (const artifact of artifacts) {
    assert.ok(!artifact.includes('PRIVATE KEY'), 'artifact leaked a PEM header');
    assert.ok(!artifact.includes(pkcs8Base64), 'artifact leaked PKCS8 base64');
    assert.ok(!artifact.includes(pkcs8Hex), 'artifact leaked PKCS8 hex');
    assert.ok(!artifact.includes(seedBase64), 'artifact leaked the seed');
  }
  assert.ok(publicKeyPem.includes('BEGIN PUBLIC KEY'));

  assert.equal(record.schema, VALIDATOR_KEY_RECORD_SCHEMA);
  assert.equal(record.status, 'active');
  assert.equal(record.historicalSignatureDisposition, 'valid');
});

test('provisioning refuses a missing or inverted validity window', () => {
  const store = newStore('window-input');
  expectCustodyError(
    () => provisionValidatorKey({
      custodyStore: store,
      notAfter: WIDE_WINDOW.notAfter,
      operator: OPERATOR,
      validatorId: 'validator-window-a',
    }),
    'invalid-input',
  );
  expectCustodyError(
    () => provisionValidatorKey({
      custodyStore: store,
      notAfter: '2020-01-01T00:00:00Z',
      notBefore: '2021-01-01T00:00:00Z',
      operator: OPERATOR,
      validatorId: 'validator-window-b',
    }),
    'invalid-validity-window',
  );
  expectCustodyError(
    () => provisionValidatorKey({
      custodyStore: store,
      notAfter: '2999-01-01',
      notBefore: WIDE_WINDOW.notBefore,
      operator: OPERATOR,
      validatorId: 'validator-window-c',
    }),
    'invalid-timestamp',
  );
});

test('the custody-backed pair is shape-identical to the ephemeral fixture', () => {
  const store = newStore('dropin');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-dropin',
  });
  const { validator } = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-dropin-a',
  });
  const fixture = createRuntimeInjectedValidatorFixture();
  const manifest = makeRunManifest();

  assert.deepEqual(
    Object.keys(validator.config).sort(),
    Object.keys(fixture.config).sort(),
  );
  assert.deepEqual(
    Object.keys(validator).sort(),
    Object.keys(fixture).sort(),
  );
  assert.deepEqual(
    Object.keys(validator.issue(manifest)).sort(),
    Object.keys(fixture.issue(manifest)).sort(),
  );

  // The custody contrast the gate row is about, pinned in both directions.
  assert.equal(fixture.config.keyCustody, 'ephemeral_engineering_fixture');
  assert.equal(validator.config.keyCustody, 'external_host_key');
  assert.equal(validator.config.immutable, true);
  assert.equal(validator.config.injectionOrigin, 'host_process_boot_argument');
  assert.equal(validator.config.algorithm, 'Ed25519');
  assert.equal(validator.config.authorityId, 'validator-dropin-a');
  assert.ok(Object.isFrozen(validator.config));
});

test('sign + verify round trip through the shipped runtime verifier', () => {
  const store = newStore('roundtrip');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-roundtrip',
  });
  const { validator, publicKeyPem } = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-roundtrip-a',
  });
  const manifest = makeRunManifest();
  const receipt = validator.issue(manifest);

  // This is exactly what runPhase0BEngineeringTracer does with the pair.
  const verification = verifyRuntimeInjectedValidator(receipt, {
    trustedConfig: validator.config,
  });
  assert.deepEqual(verification.errors, []);
  assert.equal(verification.valid, true);

  // And the pure fleet primitive agrees, using only public material. That the
  // mirrored PHASE0B_VALIDATOR_DOMAIN matches the runtime's private constant
  // is proven by both of these passing on the same signature.
  const payload = validatorReceiptSigningPayload(receipt);
  assert.equal(payload.domain, PHASE0B_VALIDATOR_DOMAIN);
  const fleet = verifyValidatorSignature({
    atTime: '2026-01-01T00:00:00Z',
    keyRecord: registry.get('validator-roundtrip-a'),
    payload,
    publicKeyPem,
    signature: receipt.signatureBase64,
  });
  assert.deepEqual(fleet, {
    disposition: 'valid',
    failureReason: null,
    ok: true,
  });
});

test('signing refuses outside the validity window and outside the registry', () => {
  const store = newStore('refusals');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-refusals',
  });
  const manifest = makeRunManifest();

  // Expired window: the key is registered and its custody is healthy.
  const expired = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-expired',
    window: {
      notAfter: '2021-01-01T00:00:00Z',
      notBefore: '2020-01-01T00:00:00Z',
    },
  });
  expectCustodyError(
    () => expired.validator.issue(manifest),
    'validator-outside-validity-window',
  );

  // Not-yet-valid window.
  const future = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-future',
    window: {
      notAfter: '2999-01-01T00:00:00Z',
      notBefore: '2998-01-01T00:00:00Z',
    },
  });
  expectCustodyError(
    () => future.validator.issue(manifest),
    'validator-outside-validity-window',
  );

  // Absent from the trust registry: no trust root, no signature.
  const unregistered = provisionValidatorKey({
    custodyStore: store,
    notAfter: WIDE_WINDOW.notAfter,
    notBefore: WIDE_WINDOW.notBefore,
    operator: OPERATOR,
    validatorId: 'validator-unregistered',
  });
  expectCustodyError(
    () => createCustodyBackedValidator({
      custodyStore: store,
      keyFingerprint: unregistered.keyFingerprint,
      operator: OPERATOR,
      trustRegistry: registry,
      validatorId: 'validator-unregistered',
    }),
    'validator-not-in-trust-registry',
  );
  expectCustodyError(
    () => createCustodyBackedValidator({
      custodyStore: store,
      keyFingerprint: unregistered.keyFingerprint,
      operator: OPERATOR,
      validatorId: 'validator-unregistered',
    }),
    'validator-not-in-trust-registry',
  );

  // Registered, but under a different key.
  expectCustodyError(
    () => createCustodyBackedValidator({
      custodyStore: store,
      keyFingerprint: unregistered.keyFingerprint,
      operator: OPERATOR,
      trustRegistry: registry,
      validatorId: 'validator-expired',
    }),
    'key-fingerprint-mismatch',
  );
});

test('rotation preserves predecessor verifiability and chains both directions', () => {
  const store = newStore('rotation');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-rotation',
  });
  const manifest = makeRunManifest();
  const predecessor = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-rot-a',
  });
  const predecessorReceipt = predecessor.validator.issue(manifest);

  const rotation = rotateValidatorKey({
    currentValidatorId: 'validator-rot-a',
    custodyStore: store,
    nextValidatorId: 'validator-rot-b',
    operator: OPERATOR,
    overlapUntil: '2030-01-01T00:00:00Z',
    trustRegistry: registry,
  });

  assert.equal(rotation.schema, VALIDATOR_ROTATION_RECEIPT_SCHEMA);
  assert.equal(rotation.predecessorStatus, 'superseded');
  assert.equal(rotation.successorStatus, 'active');
  // Rotation NEVER destroys predecessor key material.
  assert.equal(rotation.keyMaterialDestroyed, false);
  assert.ok(verifyValidatorReceiptHash(rotation));
  assert.ok(verifyValidatorReceiptHash(rotation.successorProvisionReceipt));
  assert.ok(!canonicalJson(rotation).includes('PRIVATE KEY'));

  // Chained BOTH ways.
  const before = registry.get('validator-rot-a');
  const afterRecord = registry.get('validator-rot-b');
  assert.equal(before.status, 'superseded');
  assert.equal(before.supersededBy, 'validator-rot-b');
  assert.equal(before.overlapUntil, '2030-01-01T00:00:00Z');
  assert.equal(afterRecord.supersedes, 'validator-rot-a');
  assert.equal(afterRecord.status, 'active');
  assert.equal(
    afterRecord.provisionReceiptHash,
    rotation.successorProvisionReceipt.receiptHash,
  );
  assert.equal(
    rotation.successorProvisionReceipt.priorReceiptHash,
    before.provisionReceiptHash,
  );

  // Predecessor key material survives rotation: still readable from custody.
  const stillSealed = store.readObject(before.privateKeyCustodyId);
  assert.equal(stillSealed.kind, VALIDATOR_PRIVATE_KEY_CUSTODY_KIND);

  // Historical signature still verifies inside the overlap window.
  const payload = validatorReceiptSigningPayload(predecessorReceipt);
  const insideOverlap = verifyValidatorSignature({
    atTime: '2029-12-31T23:59:59Z',
    keyRecord: before,
    payload,
    publicKeyPem: predecessor.publicKeyPem,
    signature: predecessorReceipt.signatureBase64,
  });
  assert.equal(insideOverlap.ok, true);

  // The boundary instant itself is still valid; past it is not.
  assert.equal(
    verifyValidatorSignature({
      atTime: '2030-01-01T00:00:00Z',
      keyRecord: before,
      payload,
      publicKeyPem: predecessor.publicKeyPem,
      signature: predecessorReceipt.signatureBase64,
    }).ok,
    true,
  );
  assert.equal(
    verifyValidatorSignature({
      atTime: '2030-01-01T00:00:01Z',
      keyRecord: before,
      payload,
      publicKeyPem: predecessor.publicKeyPem,
      signature: predecessorReceipt.signatureBase64,
    }).failureReason,
    'signature-after-supersession-overlap',
  );

  // A superseded key issues no NEW signatures; the successor does.
  expectCustodyError(
    () => predecessor.validator.issue(manifest),
    'validator-superseded',
  );
  const successor = createCustodyBackedValidator({
    custodyStore: store,
    keyFingerprint: rotation.successorKeyFingerprint,
    operator: OPERATOR,
    trustRegistry: registry,
    validatorId: 'validator-rot-b',
  });
  const successorReceipt = successor.issue(manifest);
  assert.equal(
    verifyRuntimeInjectedValidator(successorReceipt, {
      trustedConfig: successor.config,
    }).valid,
    true,
  );

  // Rotation is refused on a non-active key and on an out-of-range overlap.
  expectCustodyError(
    () => rotateValidatorKey({
      currentValidatorId: 'validator-rot-a',
      custodyStore: store,
      nextValidatorId: 'validator-rot-c',
      operator: OPERATOR,
      overlapUntil: '2030-01-01T00:00:00Z',
      trustRegistry: registry,
    }),
    'invalid-status-transition',
  );
  expectCustodyError(
    () => rotateValidatorKey({
      currentValidatorId: 'validator-rot-b',
      custodyStore: store,
      nextValidatorId: 'validator-rot-d',
      operator: OPERATOR,
      overlapUntil: '3999-01-01T00:00:00Z',
      trustRegistry: registry,
    }),
    'invalid-overlap-window',
  );
});

test('revocation invalidates later signatures and preserves earlier ones', () => {
  const store = newStore('revocation');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-revocation',
  });
  const manifest = makeRunManifest();
  const compromised = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-rev-a',
  });
  const receipt = compromised.validator.issue(manifest);
  const payload = validatorReceiptSigningPayload(receipt);

  const revocation = revokeValidatorKey({
    custodyStore: store,
    operator: OPERATOR,
    reason: 'key-compromise',
    revokedAt: '2026-06-01T00:00:00Z',
    trustRegistry: registry,
    validatorId: 'validator-rev-a',
  });
  assert.equal(revocation.schema, VALIDATOR_REVOCATION_RECEIPT_SCHEMA);
  assert.equal(revocation.status, 'revoked');
  assert.equal(revocation.reason, 'key-compromise');
  assert.equal(revocation.revokedAt, '2026-06-01T00:00:00Z');
  assert.equal(revocation.preRevocationSignaturesRemainVerifiable, true);
  assert.equal(revocation.historicalSignatureDisposition, 'suspect');
  assert.equal(revocation.keyMaterialDestroyed, false);
  assert.equal(revocation.keyMaterialDestructionMethod, null);
  assert.ok(verifyValidatorReceiptHash(revocation));

  const record = registry.get('validator-rev-a');
  // BEFORE revokedAt: still verifiable, but surfaced as suspect.
  const earlier = verifyValidatorSignature({
    atTime: '2026-05-31T23:59:59Z',
    keyRecord: record,
    payload,
    publicKeyPem: compromised.publicKeyPem,
    signature: receipt.signatureBase64,
  });
  assert.equal(earlier.ok, true);
  assert.equal(earlier.disposition, 'suspect');

  // AT revokedAt and after: invalid. The boundary instant belongs to the
  // revocation.
  for (const atTime of ['2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z']) {
    const later = verifyValidatorSignature({
      atTime,
      keyRecord: record,
      payload,
      publicKeyPem: compromised.publicKeyPem,
      signature: receipt.signatureBase64,
    });
    assert.equal(later.ok, false);
    assert.equal(later.failureReason, 'signature-after-revocation');
  }

  // No new signatures from a revoked key.
  expectCustodyError(
    () => compromised.validator.issue(manifest),
    'validator-revoked',
  );

  // A non-compromise revocation leaves historical signatures 'valid'.
  const retired = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-rev-b',
  });
  const retiredReceipt = retired.validator.issue(manifest);
  const retiredRevocation = revokeValidatorKey({
    custodyStore: store,
    operator: OPERATOR,
    reason: 'policy-retirement',
    revokedAt: '2026-06-01T00:00:00Z',
    trustRegistry: registry,
    validatorId: 'validator-rev-b',
  });
  assert.equal(retiredRevocation.historicalSignatureDisposition, 'valid');
  assert.equal(
    verifyValidatorSignature({
      atTime: '2026-01-01T00:00:00Z',
      keyRecord: registry.get('validator-rev-b'),
      payload: validatorReceiptSigningPayload(retiredReceipt),
      publicKeyPem: retired.publicKeyPem,
      signature: retiredReceipt.signatureBase64,
    }).disposition,
    'valid',
  );

  // Free-text reasons are refused: compromise disposition is derived from the
  // reason, so a typo must not silently downgrade it.
  expectCustodyError(
    () => revokeValidatorKey({
      custodyStore: store,
      operator: OPERATOR,
      reason: 'key-compromis',
      revokedAt: '2026-06-01T00:00:00Z',
      trustRegistry: registry,
      validatorId: 'validator-rev-b',
    }),
    'invalid-revocation-reason',
  );
});

test('destroyKeyMaterial makes signing impossible but leaves receipts verifiable', () => {
  const store = newStore('destroy');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-destroy',
  });
  const manifest = makeRunManifest();
  const doomed = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-destroy-a',
  });
  const receipt = doomed.validator.issue(manifest);
  const payload = validatorReceiptSigningPayload(receipt);

  const revocation = revokeValidatorKey({
    custodyStore: store,
    destroyKeyMaterial: true,
    operator: OPERATOR,
    reason: 'custody-compromise',
    revokedAt: '2026-06-01T00:00:00Z',
    trustRegistry: registry,
    validatorId: 'validator-destroy-a',
  });
  assert.equal(revocation.keyMaterialDestroyed, true);
  assert.equal(
    revocation.keyMaterialDestructionMethod,
    'custody-content-key-destruction',
  );
  assert.equal(revocation.keyMaterialDestructionScope, 'custody-store');
  assert.equal(store.keyDestroyed, true);

  // The key is gone from custody, not merely marked revoked. Prove it against
  // a STALE registry that still believes the key is active, so the refusal
  // cannot come from the status check.
  const staleRegistry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-destroy-stale',
  });
  staleRegistry.register(doomed.receipt);
  const staleValidator = createCustodyBackedValidator({
    custodyStore: store,
    keyFingerprint: doomed.keyFingerprint,
    operator: OPERATOR,
    trustRegistry: staleRegistry,
    validatorId: 'validator-destroy-a',
  });
  expectCustodyError(
    () => staleValidator.issue(manifest),
    'validator-key-material-destroyed',
  );

  // Receipts issued before destruction still verify: public material only.
  assert.equal(
    verifyRuntimeInjectedValidator(receipt, {
      trustedConfig: doomed.validator.config,
    }).valid,
    true,
  );
  const fleet = verifyValidatorSignature({
    atTime: '2026-01-01T00:00:00Z',
    keyRecord: registry.get('validator-destroy-a'),
    payload,
    publicKeyPem: doomed.publicKeyPem,
    signature: receipt.signatureBase64,
  });
  assert.equal(fleet.ok, true);
  assert.equal(fleet.disposition, 'suspect');
  assert.ok(verifyValidatorReceiptHash(doomed.receipt));
});

test('destroyKeyMaterial refuses when the store holds ANY foreign sealed object', () => {
  // REGRESSION LOCK. The guard used to filter listObjects() by
  // `kind === validator-private-key`, so every NON-validator tenant of the
  // same store — captured responses, alias records, anything a peer or
  // successor slice sealed there — was invisible to it and was destroyed as
  // collateral by the store-scoped content-key destruction. A neighbour's
  // irreplaceable data is exactly what the guard exists to protect.
  const store = newStore('destroy-foreign-kind');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-destroy-foreign',
  });
  const neighbour = store.sealObject({
    kind: 'captured-response',
    label: 'captured-response:resident_0',
    value: { note: 'irreplaceable captured study data' },
  });
  provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-foreign-a',
  });

  expectCustodyError(
    () => revokeValidatorKey({
      custodyStore: store,
      destroyKeyMaterial: true,
      operator: OPERATOR,
      reason: 'key-compromise',
      revokedAt: '2026-06-01T00:00:00Z',
      trustRegistry: registry,
      validatorId: 'validator-foreign-a',
    }),
    'destroy-would-erase-other-custody-objects',
  );

  // The neighbour is intact and the store key is alive.
  assert.equal(store.keyDestroyed, false);
  assert.equal(
    store.readObject(neighbour.custodyId).kind,
    'captured-response',
  );
});

test('destroyKeyMaterial refuses when the store holds another validator key', () => {
  const store = newStore('destroy-guard');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-destroy-guard',
  });
  provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-guard-a',
  });
  provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-guard-b',
  });

  expectCustodyError(
    () => revokeValidatorKey({
      custodyStore: store,
      destroyKeyMaterial: true,
      operator: OPERATOR,
      reason: 'key-compromise',
      revokedAt: '2026-06-01T00:00:00Z',
      trustRegistry: registry,
      validatorId: 'validator-guard-a',
    }),
    'destroy-would-erase-other-custody-objects',
  );
  // Nothing was destroyed by the refused call.
  assert.equal(store.keyDestroyed, false);
  assert.equal(registry.get('validator-guard-a').status, 'active');

  // Revocation without destruction still works in a shared store.
  const revocation = revokeValidatorKey({
    custodyStore: store,
    operator: OPERATOR,
    reason: 'key-compromise',
    revokedAt: '2026-06-01T00:00:00Z',
    trustRegistry: registry,
    validatorId: 'validator-guard-a',
  });
  assert.equal(revocation.keyMaterialDestroyed, false);
  assert.equal(store.keyDestroyed, false);
});

test('revoking a SUPERSEDED key never widens trust', () => {
  // REGRESSION LOCK on a trust-EXPANDING revocation.
  //
  // verifyValidatorSignature used to branch exclusively on status: the
  // revokedAt check ran only for status 'revoked' and the overlapUntil check
  // only for status 'superseded'. markRevoked overwrites 'superseded' ->
  // 'revoked' while LEAVING overlapUntil in place, so any revocation whose
  // revokedAt fell after overlapUntil silently dropped the supersession cutoff
  // and re-validated every signature in the (overlapUntil, revokedAt) gap that
  // had just been correctly rejected. Revocation must only ever reduce trust.
  //
  // No previous test revoked an already-superseded key, which is exactly why
  // this passed for so long.
  const store = newStore('revoke-superseded');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-revoke-superseded',
  });
  const manifest = makeRunManifest();
  const predecessor = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-widen-a',
  });
  const receipt = predecessor.validator.issue(manifest);
  const payload = validatorReceiptSigningPayload(receipt);

  rotateValidatorKey({
    at: '2026-01-01T02:00:00Z',
    currentValidatorId: 'validator-widen-a',
    custodyStore: store,
    nextValidatorId: 'validator-widen-b',
    operator: OPERATOR,
    overlapUntil: '2026-01-01T03:00:00Z',
    trustRegistry: registry,
  });

  const pastOverlap = '2026-01-01T10:00:00Z';
  const verifyAtPastOverlap = () => verifyValidatorSignature({
    atTime: pastOverlap,
    keyRecord: registry.get('validator-widen-a'),
    payload,
    publicKeyPem: predecessor.publicKeyPem,
    signature: receipt.signatureBase64,
  });

  assert.equal(
    verifyAtPastOverlap().failureReason,
    'signature-after-supersession-overlap',
  );

  // A revocation dated AFTER overlapUntil. Nothing about it should make a
  // previously-rejected signature acceptable.
  revokeValidatorKey({
    custodyStore: store,
    operator: OPERATOR,
    reason: 'end-of-study',
    revokedAt: '2026-01-03T00:00:00Z',
    trustRegistry: registry,
    validatorId: 'validator-widen-a',
  });

  const afterRevocation = verifyAtPastOverlap();
  assert.equal(
    afterRevocation.ok,
    false,
    'revocation WIDENED trust: a signature the supersession rejected became valid',
  );
  assert.equal(
    afterRevocation.failureReason,
    'signature-after-supersession-overlap',
  );

  // ...and the supersession itself SURVIVES the revocation (header rule 4):
  // history inside the overlap is still verifiable.
  assert.equal(
    verifyValidatorSignature({
      atTime: '2026-01-01T02:30:00Z',
      keyRecord: registry.get('validator-widen-a'),
      payload,
      publicKeyPem: predecessor.publicKeyPem,
      signature: receipt.signatureBase64,
    }).ok,
    true,
  );
  // Past revokedAt, the revocation cutoff is what refuses.
  assert.equal(
    verifyValidatorSignature({
      atTime: '2026-01-04T00:00:00Z',
      keyRecord: registry.get('validator-widen-a'),
      payload,
      publicKeyPem: predecessor.publicKeyPem,
      signature: receipt.signatureBase64,
    }).failureReason,
    'signature-after-revocation',
  );
});

test('validity-window boundary instants are pinned, and match the registry lane', () => {
  // The suite previously probed the window only with far-out timestamps
  // (2020/2021, 2998/2999), so the exact instants were never exercised — which
  // is how an inclusive/exclusive divergence with the trust-registry lane went
  // unnoticed. Both lanes now agree: notBefore INCLUSIVE, notAfter EXCLUSIVE.
  const store = newStore('window-boundary');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-window-boundary',
  });
  const window = Object.freeze({
    notAfter: '2026-06-01T00:00:00Z',
    notBefore: '2026-02-01T00:00:00Z',
  });
  const subject = provisionValidatorKey({
    custodyStore: store,
    notAfter: window.notAfter,
    notBefore: window.notBefore,
    operator: OPERATOR,
    trustRegistry: registry,
    validatorId: 'validator-window-a',
  });
  const validator = createCustodyBackedValidator({
    custodyStore: store,
    keyFingerprint: subject.keyFingerprint,
    // Inside the window: the point of this test is the VERIFY boundary, so
    // signing must not fail on the wall clock.
    now: () => '2026-03-01T00:00:00Z',
    operator: OPERATOR,
    trustRegistry: registry,
    validatorId: 'validator-window-a',
  });
  const receipt = validator.issue(makeRunManifest());
  const payload = validatorReceiptSigningPayload(receipt);
  const record = registry.get('validator-window-a');
  const at = (atTime) => verifyValidatorSignature({
    atTime,
    keyRecord: record,
    payload,
    publicKeyPem: subject.publicKeyPem,
    signature: receipt.signatureBase64,
  });

  assert.equal(at('2026-01-31T23:59:59.999Z').failureReason,
    'signature-time-before-validity-window');
  assert.equal(at(window.notBefore).ok, true, 'notBefore is INCLUSIVE');
  assert.equal(at('2026-05-31T23:59:59.999Z').ok, true);
  assert.equal(
    at(window.notAfter).failureReason,
    'signature-time-after-validity-window',
    'notAfter is EXCLUSIVE',
  );
});

test('validatorReceiptSigningPayload refuses a receipt whose manifest was swapped', () => {
  // The helper is the documented fleet-verifier entry point. It used to return
  // { configHash, domain, manifestHash } read straight OFF the receipt, so a
  // receipt whose `manifest` had been replaced with an attacker-chosen one
  // still produced the ORIGINAL manifestHash and verified — proving only "some
  // manifest was signed", never "THIS manifest was signed".
  const store = newStore('binding');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-binding',
  });
  const subject = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-binding-a',
  });
  const receipt = subject.validator.issue(makeRunManifest());

  // Genuine receipt: the payload recomputes and verifies.
  assert.equal(
    verifyValidatorSignature({
      atTime: '2026-01-01T00:00:00Z',
      keyRecord: registry.get('validator-binding-a'),
      payload: validatorReceiptSigningPayload(receipt),
      publicKeyPem: subject.publicKeyPem,
      signature: receipt.signatureBase64,
    }).ok,
    true,
  );

  const swappedManifest = {
    ...receipt,
    manifest: makeRunManifest({ runId: 'mv-phase0b-attacker-chosen' }),
  };
  expectCustodyError(
    () => validatorReceiptSigningPayload(swappedManifest),
    'receipt-binding-mismatch',
  );

  const swappedConfig = {
    ...receipt,
    config: { ...receipt.config, authorityId: 'attacker-authority' },
  };
  expectCustodyError(
    () => validatorReceiptSigningPayload(swappedConfig),
    'receipt-binding-mismatch',
  );

  // Domain separation is asserted, not assumed: a payload from another
  // protocol is refused before any crypto runs.
  assert.equal(
    verifyValidatorSignature({
      atTime: '2026-01-01T00:00:00Z',
      keyRecord: registry.get('validator-binding-a'),
      payload: { ...validatorReceiptSigningPayload(receipt), domain: 'other:v1' },
      publicKeyPem: subject.publicKeyPem,
      signature: receipt.signatureBase64,
    }).failureReason,
    'invalid-signing-payload-domain',
  );
});

test('the anti-leak audit is structural at EVERY call site, not a PEM regex', () => {
  // REGRESSION LOCK. assertNoPrivateKeyMaterial only ran a structural check
  // when `secrets` was supplied, and provisioning was the ONLY call site that
  // supplied them. Everywhere else it degraded to /PRIVATE KEY/, so a bare
  // base64 PKCS#8 blob (no banner) planted in a caller-supplied string sailed
  // into the PUBLISHED trust document — the exact artifact the
  // fleet-verification claim tells a third party to consume.
  const rawPkcs8Base64 = generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' })
    .toString('base64');
  assert.equal(rawPkcs8Base64.includes('PRIVATE KEY'), false, 'no banner: the old regex would miss it');

  const store = newStore('leak-structural');
  const registry = createValidatorTrustRegistry({
    operator: `mv-b4-operator-${rawPkcs8Base64}`,
    registryId: 'mv-b4-leak-structural',
  });
  provisionValidatorKey({
    custodyStore: store,
    notAfter: WIDE_WINDOW.notAfter,
    notBefore: WIDE_WINDOW.notBefore,
    operator: OPERATOR,
    trustRegistry: registry,
    validatorId: 'validator-leak-a',
  });

  // The snapshot carries the poisoned operator string; the audit must refuse
  // BEFORE anything is written.
  expectCustodyError(() => registry.snapshot(), 'private-key-material-leak');
  const documentPath = path.join(scratchDir('leak-structural-out'), 'trust.json');
  expectCustodyError(
    () => publishValidatorTrustRegistry({
      filePath: documentPath,
      operator: OPERATOR,
      trustRegistry: registry,
    }),
    'private-key-material-leak',
  );
  assert.equal(existsSync(documentPath), false, 'a refused publish must not touch disk');

  // The failure names the field path and never echoes the material.
  assert.throws(
    () => registry.snapshot(),
    (error) => error.message.includes(rawPkcs8Base64) === false
      && error.message.includes('PRIVATE KEY') === false,
  );

  // The detector stays quiet on the public material every artifact carries.
  const clean = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-leak-structural-clean',
  });
  const cleanStore = newStore('leak-structural-clean');
  provisionValidatorKey({
    custodyStore: cleanStore,
    notAfter: WIDE_WINDOW.notAfter,
    notBefore: WIDE_WINDOW.notBefore,
    operator: OPERATOR,
    trustRegistry: clean,
    validatorId: 'validator-leak-clean',
  });
  assert.equal(verifyValidatorTrustRegistryDocument(clean.snapshot()).valid, true);
});

test('trust publication is atomic: a rewrite never leaves a torn document', () => {
  // writeFileDurable used to openSync(filePath, 'w'), which TRUNCATES the
  // destination to zero before the first byte lands. publishValidatorTrustRegistry
  // rewrites the SAME canonical path on every publication, so any failure in
  // that window destroyed the previously published trust root. It now writes a
  // sibling temp file, fsyncs, and renames — "old complete file or new complete
  // file", never nothing.
  const store = newStore('atomic-publish');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-atomic-publish',
  });
  const outDir = scratchDir('atomic-publish-out');
  const documentPath = path.join(outDir, 'custody-trust-document.json');

  for (const validatorId of ['validator-atomic-a', 'validator-atomic-b']) {
    provisionValidatorKey({
      custodyStore: store,
      notAfter: WIDE_WINDOW.notAfter,
      notBefore: WIDE_WINDOW.notBefore,
      operator: OPERATOR,
      trustRegistry: registry,
      validatorId,
    });
    const published = publishValidatorTrustRegistry({
      filePath: documentPath,
      operator: OPERATOR,
      trustRegistry: registry,
    });
    // Every rewrite leaves a COMPLETE, independently verifiable document.
    const onDisk = JSON.parse(readFileSync(documentPath, 'utf8'));
    assert.equal(verifyValidatorTrustRegistryDocument(onDisk).valid, true);
    assert.equal(onDisk.registryHash, published.document.registryHash);
  }

  // No temp residue survives a successful publish.
  assert.deepEqual(
    readdirSync(outDir).filter((name) => name.includes('.tmp-')),
    [],
  );
});

test('tampered payload, signature, receipt, and wrong key all fail', () => {
  const store = newStore('tamper');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-tamper',
  });
  const manifest = makeRunManifest();
  const subject = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-tamper-a',
  });
  const receipt = subject.validator.issue(manifest);
  const record = registry.get('validator-tamper-a');
  const payload = validatorReceiptSigningPayload(receipt);
  const goodArgs = {
    atTime: '2026-01-01T00:00:00Z',
    keyRecord: record,
    payload,
    publicKeyPem: subject.publicKeyPem,
    signature: receipt.signatureBase64,
  };
  assert.equal(verifyValidatorSignature(goodArgs).ok, true);

  // Tampered payload.
  assert.equal(
    verifyValidatorSignature({
      ...goodArgs,
      payload: { ...payload, manifestHash: hex('9') },
    }).failureReason,
    'signature-verification-failed',
  );

  // Tampered signature (flip one base64 character).
  const flipped = receipt.signatureBase64.startsWith('A')
    ? `B${receipt.signatureBase64.slice(1)}`
    : `A${receipt.signatureBase64.slice(1)}`;
  assert.equal(verifyValidatorSignature({ ...goodArgs, signature: flipped }).ok, false);

  // Tampered receipt: the shipped verifier rejects it.
  const tamperedReceipt = structuredClone(receipt);
  tamperedReceipt.manifest.runId = 'mv-phase0b-tracer-999';
  const tamperVerification = verifyRuntimeInjectedValidator(tamperedReceipt, {
    trustedConfig: subject.validator.config,
  });
  assert.equal(tamperVerification.valid, false);

  // Tampered key record: an internally inconsistent record (fingerprint no
  // longer agrees with publicKeySpkiSha256) is rejected on shape alone.
  assert.equal(
    verifyValidatorSignature({
      ...goodArgs,
      keyRecord: { ...record, keyFingerprint: hex('f') },
    }).failureReason,
    'invalid-key-record',
  );

  // Wrong-key signature: a foreign Ed25519 key signs the same payload.
  const foreign = generateKeyPairSync('ed25519');
  const foreignPem = foreign.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString();

  // A record swapped onto a DIFFERENT public key stays self-consistent but no
  // longer hashes to its own fingerprint: caught by re-derivation, not trust.
  assert.equal(
    verifyValidatorSignature({
      ...goodArgs,
      keyRecord: { ...record, publicKeyPem: foreignPem },
      publicKeyPem: foreignPem,
    }).failureReason,
    'public-key-fingerprint-mismatch',
  );

  const foreignSignature = sign(
    null,
    Buffer.from(canonicalJson(payload), 'utf8'),
    foreign.privateKey,
  ).toString('base64');
  assert.equal(
    verifyValidatorSignature({ ...goodArgs, signature: foreignSignature })
      .failureReason,
    'signature-verification-failed',
  );

  // A public key that is not the record's public key is refused before crypto.
  assert.equal(
    verifyValidatorSignature({ ...goodArgs, publicKeyPem: foreignPem })
      .failureReason,
    'public-key-does-not-match-key-record',
  );

  // Malformed inputs are refused, never thrown.
  assert.equal(
    verifyValidatorSignature({ ...goodArgs, atTime: 'yesterday' }).failureReason,
    'invalid-at-time',
  );
  assert.equal(
    verifyValidatorSignature({ ...goodArgs, keyRecord: { nope: true } })
      .failureReason,
    'invalid-key-record',
  );
});

test('fleet verification works with no custody store present at all', () => {
  const store = newStore('fleet');
  const registry = createValidatorTrustRegistry({
    operator: OPERATOR,
    registryId: 'mv-b4-fleet',
  });
  const manifest = makeRunManifest();
  const subject = provisionRegistered({
    custodyStore: store,
    registry,
    validatorId: 'validator-fleet-a',
  });
  const receipt = subject.validator.issue(manifest);
  const publishPath = path.join(scratchDir('fleet-publish'), 'trust.json');
  const published = publishValidatorTrustRegistry({
    filePath: publishPath,
    operator: OPERATOR,
    trustRegistry: registry,
  });

  // Simulate the fleet party: only the published trust file and the receipt.
  // The custody store is closed AND its directory removed.
  const storeRoot = scratchRoots.find((root) => root.includes('mv-b4-fleet-'));
  store.close();
  rmSync(path.join(storeRoot, 'store'), { force: true, recursive: true });

  const document = JSON.parse(readFileSync(publishPath, 'utf8'));
  assert.equal(document.schema, VALIDATOR_CUSTODY_SCHEMA);
  assert.equal(
    verifyValidatorTrustRegistryDocument(document).valid,
    true,
  );
  assert.equal(published.receipt.networkPublicationClaimed, false);
  assert.equal(published.receipt.registryHash, document.registryHash);
  assert.equal(published.receipt.fileName, 'trust.json');
  assert.ok(!published.receipt.fileName.includes(path.sep));
  assert.ok(verifyValidatorReceiptHash(published.receipt));
  assert.ok(!canonicalJson(document).includes('PRIVATE KEY'));

  const record = document.records.find(
    (entry) => entry.validatorId === 'validator-fleet-a',
  );
  const fleet = verifyValidatorSignature({
    atTime: '2026-01-01T00:00:00Z',
    keyRecord: record,
    payload: validatorReceiptSigningPayload(receipt),
    publicKeyPem: record.publicKeyPem,
    signature: receipt.signatureBase64,
  });
  assert.equal(fleet.ok, true);

  // And the runtime verifier also needs nothing but the receipt.
  assert.equal(
    verifyRuntimeInjectedValidator(receipt, {
      trustedConfig: subject.validator.config,
    }).valid,
    true,
  );

  // A tampered published document fails.
  const tampered = structuredClone(document);
  tampered.records[0].notAfter = '3999-01-01T00:00:00Z';
  assert.equal(verifyValidatorTrustRegistryDocument(tampered).valid, false);
});

test('claim boundary pins every flag this slice must not claim', () => {
  for (const flag of [
    'externalPublicTrustRootClaimed',
    'fleetDeploymentClaimed',
    'hardwareBackedKeyStorageClaimed',
    'liveStudyRunClaimed',
    'mintingAuthorityClaimed',
    'multiPartyThresholdSigningClaimed',
    'networkTrustPublicationClaimed',
    'phase1AdmissionClaimed',
    'phase1ReadinessClaimed',
    'processMemoryScrubbingClaimed',
    // The three flags that make the asserted-signing-time limit and the
    // receipt-chain shape machine-readable instead of prose-only.
    'receiptLifecycleChainIsLinearClaimed',
    'revocationEnforceableAgainstBackdatedTimeClaimed',
    'signingTimeBoundBySignatureClaimed',
    'treasuryOrWalletCustodyClaimed',
    'trustedTimestampAuthorityClaimed',
  ]) {
    assert.equal(
      VALIDATOR_CUSTODY_CLAIM_BOUNDARY[flag],
      false,
      `${flag} must be pinned false`,
    );
  }
  assert.equal(
    VALIDATOR_CUSTODY_CLAIM_BOUNDARY.custodyBackedValidatorImplemented,
    true,
  );
  assert.equal(
    VALIDATOR_CUSTODY_CLAIM_BOUNDARY.fleetVerifiabilityImplemented,
    true,
  );
  assert.ok(Object.isFrozen(VALIDATOR_CUSTODY_CLAIM_BOUNDARY));
});
