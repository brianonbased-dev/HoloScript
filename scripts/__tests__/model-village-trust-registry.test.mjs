#!/usr/bin/env node
/* global Buffer, process */

// MV-B4 local trust registry tests. Fully OFFLINE by design: no network, no
// remote host, no external service — "trust publication" in this lane means a
// local canonical file plus its receipt hash, and these tests assert exactly
// that and nothing more.
//
// Signing here uses node:crypto Ed25519 DIRECTLY and deliberately does NOT
// import the MV-B4 provider module. Fleet verification must not depend on the
// custody lane: the party that verifies is precisely the party that cannot
// sign, so the suite proves the registry verifies artifacts produced by a
// signer it knows nothing about.
//
// Nothing here claims a live study run, Phase 1 admission or readiness,
// hardware-backed key storage, threshold signing, an external trust root, or a
// deployed fleet. Fleet VERIFIABILITY is what is proven.

import assert from 'node:assert/strict';
import {
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canonicalDigest,
  canonicalJson,
  createRuntimeInjectedValidatorFixture,
} from '../model-village-phase0b-runtime.mjs';
import {
  createTrustRegistry,
  ModelVillageTrustRegistryError,
  openTrustRegistry,
  resolveTrustedKeyAt,
  TRUST_REGISTRY_CLAIM_BOUNDARY,
  TRUST_REGISTRY_ENGINE,
  TRUST_REGISTRY_ENTRY_SCHEMA,
  TRUST_REGISTRY_GENESIS,
  TRUST_REGISTRY_SCHEMA,
  trustRegistryKeyFingerprint,
  verifyRunManifestAgainstRegistry,
  verifyTrustRegistry,
} from '../model-village-trust-registry.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');

// Every artifact this suite writes lives under ONE test-owned scratch
// directory, so a run can never touch a shipped receipt path or another
// suite's registry.
const scratchRoot = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'trust-registry-tests',
  `run-${process.pid}-${randomUUID()}`,
);
mkdirSync(scratchRoot, { recursive: true });

process.on('exit', () => {
  try {
    rmSync(scratchRoot, { force: true, recursive: true });
  } catch {
    // Best-effort scratch cleanup; a leftover temp dir is not a test failure.
  }
});

let registryCounter = 0;
function registryPathFor(label) {
  registryCounter += 1;
  return path.join(scratchRoot, `${label}-${registryCounter}`, 'trust-registry.json');
}

// ---------------------------------------------------------------------------
// Local Ed25519 signer (node:crypto only — no import of the MV-B4 provider)
// ---------------------------------------------------------------------------

const SIGNING_DOMAIN = 'hololand:model-village:trust-registry-test:v1';

function newKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
  return {
    keyFingerprint: trustRegistryKeyFingerprint(publicKeyPem),
    privateKey,
    publicKeyPem,
  };
}

/**
 * THE PREIMAGE DELIBERATELY CARRIES NO TIME, because the shipped seam's does
 * not.
 *
 * This used to be `canonicalJson({ domain, manifestHash, signedAt })`. That was
 * a FALSE GREEN on the one control this slice is built around: with `signedAt`
 * inside the signed bytes, backdating broke the signature, and the whole
 * temporal-authority suite below looked cryptographically enforced when
 * production has no such property. The real payload is
 * `validatorSigningPayload` in model-village-validator-custody.mjs —
 * `{ configHash, domain, manifestHash }` — with no timestamp anywhere, and
 * `signedAt` consumed only as an out-of-band comparison input.
 *
 * So the fixture now mirrors the production SHAPE (a domain-separated
 * commitment to the manifest and nothing else). The temporal cases below still
 * pass, because the registry's clock check runs and refuses BEFORE the verifier
 * is ever called — which is exactly the property they should have been testing.
 * What the fixture no longer does is pretend the clock is enforced by crypto;
 * `verifyRunManifestAgainstRegistry cannot detect a backdated signedAt` records
 * the real, unpleasant consequence.
 */
function signingPreimage(manifest) {
  return Buffer.from(
    canonicalJson({
      domain: SIGNING_DOMAIN,
      manifestHash: canonicalDigest(manifest),
    }),
    'utf8',
  );
}

function signManifest(manifest, signedAt, privateKey) {
  // signedAt is accepted and IGNORED, exactly as production ignores it when
  // building the signed bytes. Call sites keep passing it so the intent of each
  // case stays readable.
  void signedAt;
  return sign(null, signingPreimage(manifest), privateKey).toString('base64');
}

/** The injected verifier contract the registry documents. */
function verifySignature({ manifest, publicKeyPem, signature }) {
  return verify(
    null,
    signingPreimage(manifest),
    createPublicKey(publicKeyPem),
    Buffer.from(signature, 'base64'),
  );
}

const RUN_MANIFEST = Object.freeze({
  bundleId: 'model-village-phase0b-bundle',
  runId: 'model-village-trust-registry-test-run',
  terminalCommitment: 'a'.repeat(64),
});

// ---------------------------------------------------------------------------
// Timeline used by the lifecycle tests
// ---------------------------------------------------------------------------

const VALIDATOR_ID = 'model-village-trusted-validator-001';
const T = Object.freeze({
  beforeK1: '2026-01-15T00:00:00.000Z',
  k1NotBefore: '2026-02-01T00:00:00.000Z',
  insideK1Only: '2026-03-01T00:00:00.000Z',
  k2NotBefore: '2026-05-01T00:00:00.000Z',
  insideOverlap: '2026-05-15T00:00:00.000Z',
  k1NotAfter: '2026-06-01T00:00:00.000Z',
  afterSupersession: '2026-07-01T00:00:00.000Z',
  justBeforeRevocation: '2026-08-31T23:59:59.000Z',
  revokedAt: '2026-09-01T00:00:00.000Z',
  afterRevocation: '2026-10-01T00:00:00.000Z',
  k2NotAfter: '2026-12-01T00:00:00.000Z',
});

const RECEIPT_HASHES = Object.freeze({
  provision: 'b'.repeat(64),
  rotation: 'c'.repeat(64),
  revocation: 'd'.repeat(64),
});

/**
 * Builds the full provision -> rotation -> revocation lifecycle on disk and
 * returns the handle plus both key pairs.
 */
function buildLifecycleRegistry(label = 'lifecycle') {
  const registryPath = registryPathFor(label);
  const registry = createTrustRegistry({
    operator: 'mv-b4-test-operator',
    registryId: `model-village-trust-registry-${label}`,
    registryPath,
  });
  const k1 = newKeyPair();
  const k2 = newKeyPair();

  registry.appendEntry({
    at: '2026-01-01T00:00:00.000Z',
    kind: 'provision',
    notAfter: T.k1NotAfter,
    notBefore: T.k1NotBefore,
    publicKeyPem: k1.publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.provision,
    validatorId: VALIDATOR_ID,
  });
  registry.appendEntry({
    at: '2026-04-20T00:00:00.000Z',
    kind: 'rotation',
    notAfter: T.k2NotAfter,
    notBefore: T.k2NotBefore,
    publicKeyPem: k2.publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.rotation,
    supersedes: k1.keyFingerprint,
    validatorId: VALIDATOR_ID,
  });
  registry.appendEntry({
    at: '2026-09-01T00:00:00.000Z',
    kind: 'revocation',
    notAfter: T.k2NotAfter,
    notBefore: T.k2NotBefore,
    publicKeyPem: k2.publicKeyPem,
    reason: 'scheduled engineering key retirement drill',
    revokedAt: T.revokedAt,
    sourceReceiptHash: RECEIPT_HASHES.revocation,
    validatorId: VALIDATOR_ID,
  });

  return { k1, k2, registry, registryPath };
}

// ---------------------------------------------------------------------------
// Tamper helpers: reseal a doctored chain so a test targets ONE property
// ---------------------------------------------------------------------------

function resealEntries(entries) {
  let prevEntryHash = TRUST_REGISTRY_GENESIS;
  return entries.map((entry) => {
    const { entryHash, ...rest } = entry;
    void entryHash;
    const unsigned = { ...rest, prevEntryHash };
    const nextHash = canonicalDigest(unsigned);
    prevEntryHash = nextHash;
    return { ...unsigned, entryHash: nextHash };
  });
}

function resealRegistry(snapshot, entries) {
  const unsigned = {
    createdAt: snapshot.createdAt,
    entries,
    registryId: snapshot.registryId,
    schema: snapshot.schema,
  };
  return { ...unsigned, registryHash: canonicalDigest(unsigned) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Seam with the shipped runtime validator config
// ---------------------------------------------------------------------------

test('registry fingerprints address keys exactly as the runtime validator config does', () => {
  // The registry is only a real drop-in partner for the Phase 0B validator
  // seam if both sides NAME a key identically. phase0b-runtime derives
  // `publicKeyFingerprint` as sha256 over the line-normalized public PEM; if
  // either side ever changes that derivation, this assertion goes red instead
  // of the two lanes silently addressing the same key by different names.
  const { config } = createRuntimeInjectedValidatorFixture();
  assert.equal(
    trustRegistryKeyFingerprint(config.publicKeyPem),
    config.publicKeyFingerprint,
  );

  // The shipped config publishes only public material, so a registry entry can
  // be built straight from it.
  assert.match(config.publicKeyPem, /BEGIN PUBLIC KEY/);
  const registryPath = registryPathFor('seam');
  const registry = createTrustRegistry({
    operator: 'mv-b4-test-operator',
    registryId: 'model-village-trust-registry-seam',
    registryPath,
  });
  const entry = registry.appendEntry({
    kind: 'provision',
    notAfter: null,
    notBefore: T.k1NotBefore,
    publicKeyPem: config.publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.provision,
    validatorId: config.authorityId,
  });
  assert.equal(entry.keyFingerprint, config.publicKeyFingerprint);
  assert.equal(
    registry.resolveKeyAt(config.authorityId, T.insideK1Only).trusted,
    true,
  );
  registry.close();
});

// ---------------------------------------------------------------------------
// Create / append / reopen
// ---------------------------------------------------------------------------

test('creates, appends, and reopens a byte-canonical registry', () => {
  const { k1, k2, registry, registryPath } = buildLifecycleRegistry('create');
  const snapshot = registry.snapshot();

  assert.equal(snapshot.schema, TRUST_REGISTRY_SCHEMA);
  assert.equal(TRUST_REGISTRY_ENGINE, 'hololand-model-village-trust-registry-v1');
  assert.equal(snapshot.entries.length, 3);
  assert.equal(verifyTrustRegistry(snapshot).ok, true);

  // The on-disk form IS the canonical snapshot, byte for byte, so two parties
  // holding the same registry can diff files rather than trust a parser.
  const onDisk = readFileSync(registryPath, 'utf8');
  assert.equal(onDisk, `${canonicalJson(snapshot)}\n`);

  const [provision, rotation, revocation] = snapshot.entries;
  assert.equal(provision.schema, TRUST_REGISTRY_ENTRY_SCHEMA);
  assert.equal(provision.kind, 'provision');
  assert.equal(provision.prevEntryHash, TRUST_REGISTRY_GENESIS);
  assert.equal(provision.keyFingerprint, k1.keyFingerprint);
  assert.equal(rotation.prevEntryHash, provision.entryHash);
  assert.equal(rotation.supersedes, k1.keyFingerprint);
  assert.equal(rotation.keyFingerprint, k2.keyFingerprint);
  assert.equal(revocation.prevEntryHash, rotation.entryHash);
  assert.equal(revocation.revokedAt, T.revokedAt);

  // Append-only law: no entry may carry a forward pointer.
  for (const entry of snapshot.entries) {
    assert.equal(entry.supersededBy, null);
  }

  registry.close();
  const reopened = openTrustRegistry({ registryPath, operator: 'mv-b4-test-operator' });
  assert.equal(canonicalJson(reopened.snapshot()), canonicalJson(snapshot));
  assert.equal(reopened.registryHash, snapshot.registryHash);
  assert.equal(reopened.sequence, 3);

  // supersededBy is DERIVED, never stored.
  const [k1Record, k2Record] = reopened.listKeyRecords(VALIDATOR_ID);
  assert.equal(k1Record.supersededBy, k2.keyFingerprint);
  assert.equal(k1Record.status, 'superseded');
  assert.equal(k2Record.supersededBy, null);
  assert.equal(k2Record.status, 'revoked');
  assert.equal(k2Record.revokedAt, T.revokedAt);
  reopened.close();
});

test('refuses to overwrite an existing published registry', () => {
  const { registryPath } = buildLifecycleRegistry('no-overwrite');
  assert.throws(
    () => createTrustRegistry({
      operator: 'mv-b4-test-operator',
      registryId: 'model-village-trust-registry-clobber',
      registryPath,
    }),
    (error) => error instanceof ModelVillageTrustRegistryError
      && /refusing to overwrite/.test(error.message),
  );
});

test('rejects lifecycle-illegal appends', () => {
  const registryPath = registryPathFor('illegal');
  const registry = createTrustRegistry({
    operator: 'mv-b4-test-operator',
    registryId: 'model-village-trust-registry-illegal',
    registryPath,
  });
  const k1 = newKeyPair();
  const k2 = newKeyPair();
  const base = {
    kind: 'provision',
    notAfter: null,
    notBefore: T.k1NotBefore,
    publicKeyPem: k1.publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.provision,
    validatorId: VALIDATOR_ID,
  };
  registry.appendEntry(base);

  // A second provision for the same validator must be a rotation.
  assert.throws(
    () => registry.appendEntry({ ...base, publicKeyPem: k2.publicKeyPem }),
    /rotation/,
  );
  // Forward pointers cannot be written into an append-only chain.
  assert.throws(
    () => registry.appendEntry({
      ...base,
      kind: 'rotation',
      publicKeyPem: k2.publicKeyPem,
      supersededBy: k1.keyFingerprint,
      supersedes: k1.keyFingerprint,
    }),
    /supersededBy must be null/,
  );
  // Superseding a key that is not in the registry.
  assert.throws(
    () => registry.appendEntry({
      ...base,
      kind: 'rotation',
      publicKeyPem: k2.publicKeyPem,
      supersedes: 'e'.repeat(64),
    }),
    /not in the registry/,
  );
  // A registry that rejected every illegal append is still exactly one entry.
  assert.equal(registry.sequence, 1);
  assert.equal(verifyTrustRegistry(registry.snapshot()).ok, true);
  registry.close();
});

// ---------------------------------------------------------------------------
// Chain integrity
// ---------------------------------------------------------------------------

test('chain tamper: editing one entry fails verification', () => {
  const { registry } = buildLifecycleRegistry('tamper');
  const snapshot = registry.snapshot();

  // (a) Naive edit: the entry's own hash no longer recomputes.
  const naive = clone(snapshot);
  naive.entries[0].notAfter = '2027-01-01T00:00:00.000Z';
  const naiveResult = verifyTrustRegistry(naive);
  assert.equal(naiveResult.ok, false);
  assert.match(naiveResult.failureReason, /entryHash does not match/);

  // (b) Sophisticated edit: the attacker also repairs the edited entry's own
  // entryHash and the registryHash. The FORWARD chain still catches it,
  // because entry 2 pins the pre-edit hash of entry 1.
  const repaired = clone(snapshot);
  repaired.entries[0].notAfter = '2027-01-01T00:00:00.000Z';
  const { entryHash, ...unsigned } = repaired.entries[0];
  void entryHash;
  repaired.entries[0] = { ...unsigned, entryHash: canonicalDigest(unsigned) };
  const chainResult = verifyTrustRegistry(
    resealRegistry(repaired, repaired.entries),
  );
  assert.equal(chainResult.ok, false);
  assert.match(chainResult.failureReason, /prevEntryHash does not chain/);

  // (c) registryHash alone is also load-bearing: a fully consistent chain with
  // a stale registryHash is rejected.
  const staleHead = clone(snapshot);
  staleHead.registryHash = 'f'.repeat(64);
  const headResult = verifyTrustRegistry(staleHead);
  assert.equal(headResult.ok, false);
  assert.match(headResult.failureReason, /registryHash does not match/);

  // The genuine snapshot still verifies — the tampering was on copies only.
  assert.equal(verifyTrustRegistry(registry.snapshot()).ok, true);
  registry.close();
});

test('sequence monotonicity is enforced independently of the hash chain', () => {
  const { registry } = buildLifecycleRegistry('sequence');
  const snapshot = registry.snapshot();

  // Skew ONE sequence number and reseal the whole chain + head, so every hash
  // is internally consistent and the monotonicity check is the only thing
  // that can catch it.
  const skewed = clone(snapshot);
  skewed.entries[1].sequence = 3;
  const skewedResult = verifyTrustRegistry(
    resealRegistry(skewed, resealEntries(skewed.entries)),
  );
  assert.equal(skewedResult.ok, false);
  assert.match(skewedResult.failureReason, /breaks monotonic order/);

  // Dropping a middle entry breaks monotonicity too, even fully resealed.
  const dropped = clone(snapshot);
  dropped.entries.splice(1, 1);
  const droppedResult = verifyTrustRegistry(
    resealRegistry(dropped, resealEntries(dropped.entries)),
  );
  assert.equal(droppedResult.ok, false);
  assert.match(droppedResult.failureReason, /breaks monotonic order/);

  registry.close();
});

test('openTrustRegistry refuses to hand back a handle on a broken chain', () => {
  const { registry, registryPath } = buildLifecycleRegistry('open-broken');
  const snapshot = registry.snapshot();
  registry.close();

  const broken = clone(snapshot);
  broken.entries[2].reason = 'rewritten after publication';
  writeFileSync(registryPath, `${canonicalJson(broken)}\n`, 'utf8');

  assert.throws(
    () => openTrustRegistry({ registryPath }),
    (error) => error instanceof ModelVillageTrustRegistryError
      && /failed verification/.test(error.message),
  );
});

// ---------------------------------------------------------------------------
// Fork fence
// ---------------------------------------------------------------------------

test('fork fence: a stale handle fails loud instead of forking the chain', () => {
  const registryPath = registryPathFor('fork');
  const first = createTrustRegistry({
    operator: 'operator-a',
    registryId: 'model-village-trust-registry-fork',
    registryPath,
  });
  const k1 = newKeyPair();
  const k2 = newKeyPair();
  first.appendEntry({
    kind: 'provision',
    notAfter: T.k1NotAfter,
    notBefore: T.k1NotBefore,
    publicKeyPem: k1.publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.provision,
    validatorId: VALIDATOR_ID,
  });

  // A concurrent reader/writer is explicitly allowed to open — there is no
  // exclusive lock, because fleet verification must never be blocked by a
  // writer. The fence, not a lock, is what protects the chain.
  const second = openTrustRegistry({ registryPath, operator: 'operator-b' });
  assert.equal(second.sequence, 1);

  // `first` advances the registry; `second` is now stale.
  first.appendEntry({
    kind: 'rotation',
    notAfter: T.k2NotAfter,
    notBefore: T.k2NotBefore,
    publicKeyPem: k2.publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.rotation,
    supersedes: k1.keyFingerprint,
    validatorId: VALIDATOR_ID,
  });

  assert.throws(
    () => second.appendEntry({
      kind: 'revocation',
      notAfter: T.k1NotAfter,
      notBefore: T.k1NotBefore,
      publicKeyPem: k1.publicKeyPem,
      reason: 'stale-handle write attempt',
      revokedAt: T.revokedAt,
      sourceReceiptHash: RECEIPT_HASHES.revocation,
      validatorId: VALIDATOR_ID,
    }),
    (error) => error instanceof ModelVillageTrustRegistryError
      && /refusing to fork the append-only chain/.test(error.message),
  );

  // The refused write left the published registry untouched and verifiable:
  // two entries, sequences 1..2, chain intact.
  const published = JSON.parse(readFileSync(registryPath, 'utf8'));
  assert.equal(published.entries.length, 2);
  assert.deepEqual(published.entries.map((entry) => entry.sequence), [1, 2]);
  assert.equal(verifyTrustRegistry(published).ok, true);
  assert.equal(canonicalJson(published), canonicalJson(first.snapshot()));

  // A closed handle refuses to write at all.
  first.close();
  assert.throws(
    () => first.appendEntry({
      kind: 'provision',
      notBefore: T.k1NotBefore,
      publicKeyPem: newKeyPair().publicKeyPem,
      sourceReceiptHash: RECEIPT_HASHES.provision,
      validatorId: 'another-validator',
    }),
    /handle is closed/,
  );
  second.close();
});

// ---------------------------------------------------------------------------
// resolveKeyAt across the full lifecycle timeline
// ---------------------------------------------------------------------------

test('resolveKeyAt answers the temporal-authority question across a lifecycle', () => {
  const { k1, k2, registry } = buildLifecycleRegistry('resolve');
  const snapshot = registry.snapshot();
  const at = (instant) => registry.resolveKeyAt(VALIDATOR_ID, instant);

  // Before notBefore: the key exists but was not yet authorized.
  const before = at(T.beforeK1);
  assert.equal(before.trusted, false);
  assert.equal(before.failureReason, 'key-not-yet-valid');
  assert.equal(before.keyRecord, null);

  // Exactly at notBefore: the window is INCLUSIVE at its start.
  assert.equal(at(T.k1NotBefore).trusted, true);
  // One millisecond before notBefore is outside it.
  assert.equal(at('2026-01-31T23:59:59.999Z').failureReason, 'key-not-yet-valid');

  // Inside the first window, before rotation: exactly one trusted key.
  const insideK1 = at(T.insideK1Only);
  assert.equal(insideK1.trusted, true);
  assert.equal(insideK1.keyRecords.length, 1);
  assert.equal(insideK1.keyRecord.keyFingerprint, k1.keyFingerprint);

  // ROTATION OVERLAP: both the outgoing and incoming keys resolve trusted, and
  // the deterministic pick is the newer one.
  const overlap = at(T.insideOverlap);
  assert.equal(overlap.trusted, true);
  assert.equal(overlap.keyRecords.length, 2);
  assert.deepEqual(
    [...overlap.keyRecords.map((record) => record.keyFingerprint)].sort(),
    [k1.keyFingerprint, k2.keyFingerprint].sort(),
  );
  assert.equal(overlap.keyRecord.keyFingerprint, k2.keyFingerprint);

  // BOUNDARY INSTANT, pinned in both directions. notAfter is EXCLUSIVE, and it
  // is exclusive in the custody lane's verifyValidatorSignature too — the two
  // lanes used to disagree at exactly this instant (inclusive here, exclusive
  // there), so a consumer of this lane alone accepted one instant of signing
  // authority the custody lane rejected. One rule, asserted on the instant
  // itself rather than on far-away timestamps.
  assert.equal(
    at('2026-05-31T23:59:59.999Z').keyRecords.length,
    2,
    'one millisecond before notAfter the outgoing key is still trusted',
  );
  const atExactNotAfter = at(T.k1NotAfter);
  assert.equal(atExactNotAfter.keyRecords.length, 1);
  assert.equal(atExactNotAfter.keyRecord.keyFingerprint, k2.keyFingerprint);

  // AFTER SUPERSESSION: the outgoing key's window has closed; only the
  // incoming key remains trusted.
  const afterSupersession = at(T.afterSupersession);
  assert.equal(afterSupersession.trusted, true);
  assert.equal(afterSupersession.keyRecords.length, 1);
  assert.equal(afterSupersession.keyRecord.keyFingerprint, k2.keyFingerprint);

  // Before revokedAt: still trusted.
  const beforeRevocation = at(T.justBeforeRevocation);
  assert.equal(beforeRevocation.trusted, true);
  assert.equal(beforeRevocation.keyRecord.keyFingerprint, k2.keyFingerprint);

  // Revocation is a STRICT cutoff: at the revocation instant itself, trust is
  // already gone.
  const atRevocation = at(T.revokedAt);
  assert.equal(atRevocation.trusted, false);
  assert.equal(atRevocation.failureReason, 'key-revoked');

  // After revokedAt: still revoked.
  const afterRevocation = at(T.afterRevocation);
  assert.equal(afterRevocation.trusted, false);
  assert.equal(afterRevocation.failureReason, 'key-revoked');

  // An unknown validator is a distinct, honest answer.
  const unknownValidator = resolveTrustedKeyAt({
    atTime: T.insideK1Only,
    registrySnapshot: snapshot,
    validatorId: 'validator-that-was-never-provisioned',
  });
  assert.equal(unknownValidator.trusted, false);
  assert.equal(unknownValidator.failureReason, 'validator-not-in-registry');

  // The pure function over a snapshot and the handle method agree — a party
  // with only the published file gets the same answer as the publisher.
  assert.equal(
    canonicalJson(resolveTrustedKeyAt({
      atTime: T.insideOverlap,
      registrySnapshot: snapshot,
      validatorId: VALIDATOR_ID,
    })),
    canonicalJson(overlap),
  );

  registry.close();
});

test('resolveTrustedKeyAt verifies the snapshot before answering', () => {
  // The exported primitive used to call buildKeyRecords straight on
  // `snapshot.entries` with no shape check, chain walk, or registryHash
  // recompute, so a snapshot with an edited notAfter and a stale entryHash
  // still answered trusted:true. A fleet party reading only the function name
  // would never have guessed the precondition.
  const { registry } = buildLifecycleRegistry('resolve-precondition');
  const snapshot = registry.snapshot();
  registry.close();

  const tampered = clone(snapshot);
  tampered.entries[0].notAfter = '2999-01-01T00:00:00.000Z';
  assert.equal(verifyTrustRegistry(tampered).ok, false);

  const resolved = resolveTrustedKeyAt({
    atTime: '2028-01-01T00:00:00.000Z',
    registrySnapshot: tampered,
    validatorId: VALIDATOR_ID,
  });
  assert.equal(resolved.trusted, false);
  assert.match(resolved.failureReason, /^registry-invalid: /);
  assert.equal(resolved.keyRecord, null);
  assert.deepEqual(resolved.keyRecords, []);

  // The genuine snapshot is unaffected.
  assert.equal(
    resolveTrustedKeyAt({
      atTime: T.insideK1Only,
      registrySnapshot: snapshot,
      validatorId: VALIDATOR_ID,
    }).trusted,
    true,
  );
});

test('an expired, never-revoked key reports expiry rather than revocation', () => {
  const registryPath = registryPathFor('expiry');
  const registry = createTrustRegistry({
    operator: 'mv-b4-test-operator',
    registryId: 'model-village-trust-registry-expiry',
    registryPath,
  });
  const k1 = newKeyPair();
  registry.appendEntry({
    kind: 'provision',
    notAfter: T.k1NotAfter,
    notBefore: T.k1NotBefore,
    publicKeyPem: k1.publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.provision,
    validatorId: VALIDATOR_ID,
  });
  const expired = registry.resolveKeyAt(VALIDATOR_ID, T.afterSupersession);
  assert.equal(expired.trusted, false);
  assert.equal(expired.failureReason, 'key-expired');

  // An open-ended key (notAfter null) never expires.
  const openEndedPath = registryPathFor('open-ended');
  const openEnded = createTrustRegistry({
    operator: 'mv-b4-test-operator',
    registryId: 'model-village-trust-registry-open-ended',
    registryPath: openEndedPath,
  });
  openEnded.appendEntry({
    kind: 'provision',
    notAfter: null,
    notBefore: T.k1NotBefore,
    publicKeyPem: newKeyPair().publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.provision,
    validatorId: VALIDATOR_ID,
  });
  assert.equal(openEnded.resolveKeyAt(VALIDATOR_ID, '2099-01-01T00:00:00.000Z').trusted, true);
  registry.close();
  openEnded.close();
});

// ---------------------------------------------------------------------------
// Zero-private-material law
// ---------------------------------------------------------------------------

test('zero-private-material audit catches planted PKCS#8, PEM and bare base64', () => {
  const { registry } = buildLifecycleRegistry('leak');
  const snapshot = registry.snapshot();

  // A clean registry full of PUBLIC key PEMs must NOT trip the audit — a
  // detector that flags SPKI would be useless.
  assert.equal(verifyTrustRegistry(snapshot).ok, true);

  const { privateKey } = generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const bareBase64 = privateKey
    .export({ format: 'der', type: 'pkcs8' })
    .toString('base64');

  // (a) Full PEM planted into a free-text field.
  const pemLeak = clone(snapshot);
  pemLeak.entries[2].reason = privatePem;
  const pemResult = verifyTrustRegistry(pemLeak);
  assert.equal(pemResult.ok, false);
  assert.match(pemResult.failureReason, /private-key-shaped material/);
  // The offending value is never echoed back — that would re-leak it.
  assert.equal(pemResult.failureReason.includes('PRIVATE KEY'), false);
  assert.equal(pemResult.failureReason.includes(bareBase64), false);

  // (b) Header-less base64 PKCS#8: caught structurally by DER shape, not by a
  // keyword list.
  const bareLeak = clone(snapshot);
  bareLeak.entries[2].reason = `retired: ${bareBase64}`;
  const bareResult = verifyTrustRegistry(
    resealRegistry(bareLeak, resealEntries(bareLeak.entries)),
  );
  assert.equal(bareResult.ok, false);
  assert.match(bareResult.failureReason, /private-key-shaped material/);

  // (c) The leak reason wins over the incidental hash break: the audit runs
  // FIRST so the diagnosis is unambiguous.
  assert.equal(pemResult.failureReason.includes('entryHash'), false);

  // (d) A planted key in an OBJECT KEY is caught too.
  const keyLeak = clone(snapshot);
  keyLeak.entries[0][bareBase64] = 'x';
  assert.match(verifyTrustRegistry(keyLeak).failureReason, /private-key-shaped material/);

  registry.close();
});

test('private-material audit is exhaustive over base64 alignment', () => {
  const { registry } = buildLifecycleRegistry('leak-alignment');
  const snapshot = registry.snapshot();
  registry.close();

  const carriesLeak = (planted) => {
    const doctored = clone(snapshot);
    doctored.entries[2].reason = planted;
    const result = verifyTrustRegistry(
      resealRegistry(doctored, resealEntries(doctored.entries)),
    );
    return result.ok === false
      && /private-key-shaped material/.test(result.failureReason);
  };

  // REGRESSION LOCK. A prefix with no separator shifts the payload by both a
  // base64 phase and whole bytes; decoding a run once from index 0 misses it.
  // Every prefix length mod 4 is covered, plus an `=` prefix, which would
  // otherwise merge into one misaligned run.
  const ed25519 = generateKeyPairSync('ed25519');
  const pkcs8 = ed25519.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  for (const prefix of ['', 'x', 'xy', 'xyz', 'abcdefg', 'keyMaterial=']) {
    assert.equal(carriesLeak(`${prefix}${pkcs8}`), true, `missed prefix '${prefix}'`);
  }

  // Every private-key DER framing node:crypto can export is caught.
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const shapes = {
    'ec pkcs8': ec.privateKey.export({ format: 'der', type: 'pkcs8' }),
    'ec sec1': ec.privateKey.export({ format: 'der', type: 'sec1' }),
    'rsa pkcs1': rsa.privateKey.export({ format: 'der', type: 'pkcs1' }),
    'rsa pkcs8': rsa.privateKey.export({ format: 'der', type: 'pkcs8' }),
  };
  for (const [label, der] of Object.entries(shapes)) {
    assert.equal(carriesLeak(der.toString('base64')), true, `missed ${label}`);
  }

  // A detector that flags PUBLIC material would be useless, so the negative
  // side is asserted just as hard as the positive side.
  const publicShapes = {
    'ec spki': ec.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    'ed25519 spki': ed25519.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    'rsa spki': rsa.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    'sha256 hex': 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
  };
  for (const [label, encoded] of Object.entries(publicShapes)) {
    assert.equal(carriesLeak(encoded), false, `false positive on ${label}`);
  }
});

test('appendEntry refuses to write private material to disk at all', () => {
  const registryPath = registryPathFor('leak-append');
  const registry = createTrustRegistry({
    operator: 'mv-b4-test-operator',
    registryId: 'model-village-trust-registry-leak-append',
    registryPath,
  });
  const k1 = newKeyPair();
  const { privateKey } = generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

  registry.appendEntry({
    kind: 'provision',
    notAfter: null,
    notBefore: T.k1NotBefore,
    publicKeyPem: k1.publicKeyPem,
    sourceReceiptHash: RECEIPT_HASHES.provision,
    validatorId: VALIDATOR_ID,
  });

  assert.throws(
    () => registry.appendEntry({
      kind: 'revocation',
      notAfter: null,
      notBefore: T.k1NotBefore,
      publicKeyPem: k1.publicKeyPem,
      reason: privatePem,
      revokedAt: T.revokedAt,
      sourceReceiptHash: RECEIPT_HASHES.revocation,
      validatorId: VALIDATOR_ID,
    }),
    (error) => error instanceof ModelVillageTrustRegistryError
      && /private-key-shaped material/.test(error.message)
      && !error.message.includes('PRIVATE KEY'),
  );

  // A private key PEM in the publicKeyPem slot is refused as well.
  assert.throws(
    () => registry.appendEntry({
      kind: 'rotation',
      notAfter: null,
      notBefore: T.k2NotBefore,
      publicKeyPem: privatePem,
      sourceReceiptHash: RECEIPT_HASHES.rotation,
      supersedes: k1.keyFingerprint,
      validatorId: VALIDATOR_ID,
    }),
    /private-key-shaped material/,
  );

  // Nothing reached the file: still exactly one entry, and the published bytes
  // contain no private-key banner.
  const raw = readFileSync(registryPath, 'utf8');
  assert.equal(raw.includes('PRIVATE KEY'), false);
  assert.equal(JSON.parse(raw).entries.length, 1);
  registry.close();
});

// ---------------------------------------------------------------------------
// Fleet verification primitive
// ---------------------------------------------------------------------------

test('verifyRunManifestAgainstRegistry accepts an artifact signed inside trust', () => {
  const { k1, k2, registry } = buildLifecycleRegistry('fleet-accept');
  const registrySnapshot = registry.snapshot();
  registry.close();

  // The verifying party holds ONLY the published snapshot and the artifact.
  const signedAt = T.afterSupersession;
  const signature = signManifest(RUN_MANIFEST, signedAt, k2.privateKey);
  const result = verifyRunManifestAgainstRegistry({
    manifest: RUN_MANIFEST,
    registrySnapshot,
    signature,
    signedAt,
    validatorId: VALIDATOR_ID,
    verifySignature,
  });
  assert.equal(result.ok, true);
  assert.equal(result.failureReason, null);
  assert.equal(result.keyFingerprint, k2.keyFingerprint);
  assert.equal(result.manifestHash, canonicalDigest(RUN_MANIFEST));

  // Accept and reject carry the same key set, so a consumer can assert exact
  // keys on the verdict without branching on ok.
  const rejected = verifyRunManifestAgainstRegistry({
    manifest: RUN_MANIFEST,
    registrySnapshot,
    signature,
    signedAt: T.afterRevocation,
    validatorId: VALIDATOR_ID,
    verifySignature,
  });
  assert.deepEqual(Object.keys(result).sort(), Object.keys(rejected).sort());

  // During the rotation overlap the artifact does not say which key signed, so
  // BOTH the outgoing and incoming keys must verify.
  for (const key of [k1, k2]) {
    const overlapResult = verifyRunManifestAgainstRegistry({
      manifest: RUN_MANIFEST,
      registrySnapshot,
      signature: signManifest(RUN_MANIFEST, T.insideOverlap, key.privateKey),
      signedAt: T.insideOverlap,
      validatorId: VALIDATOR_ID,
      verifySignature,
    });
    assert.equal(overlapResult.ok, true);
    assert.equal(overlapResult.keyFingerprint, key.keyFingerprint);
  }
});

test('verifyRunManifestAgainstRegistry rejects every untrusted case', () => {
  const { k1, k2, registry } = buildLifecycleRegistry('fleet-reject');
  const registrySnapshot = registry.snapshot();
  registry.close();

  const base = {
    manifest: RUN_MANIFEST,
    registrySnapshot,
    validatorId: VALIDATOR_ID,
    verifySignature,
  };

  // (1) Wrong validator: the artifact names a validator the registry never
  // provisioned.
  const wrongValidator = verifyRunManifestAgainstRegistry({
    ...base,
    signature: signManifest(RUN_MANIFEST, T.afterSupersession, k2.privateKey),
    signedAt: T.afterSupersession,
    validatorId: 'model-village-impostor-validator',
  });
  assert.equal(wrongValidator.ok, false);
  assert.equal(wrongValidator.failureReason, 'validator-not-in-registry');

  // (2) Signature made AFTER revocation: the key is genuine and the signature
  // is mathematically valid — only the clock refuses it. This is the case the
  // resolve-then-verify sequencing exists for.
  const afterRevocation = verifyRunManifestAgainstRegistry({
    ...base,
    signature: signManifest(RUN_MANIFEST, T.afterRevocation, k2.privateKey),
    signedAt: T.afterRevocation,
  });
  assert.equal(afterRevocation.ok, false);
  assert.equal(afterRevocation.failureReason, 'key-revoked');

  // (3) Signature made BEFORE notBefore.
  const beforeNotBefore = verifyRunManifestAgainstRegistry({
    ...base,
    signature: signManifest(RUN_MANIFEST, T.beforeK1, k1.privateKey),
    signedAt: T.beforeK1,
  });
  assert.equal(beforeNotBefore.ok, false);
  assert.equal(beforeNotBefore.failureReason, 'key-not-yet-valid');

  // (4) Tampered manifest: signed over the original, presented with an edit.
  const tamperedManifest = verifyRunManifestAgainstRegistry({
    ...base,
    manifest: { ...RUN_MANIFEST, terminalCommitment: 'b'.repeat(64) },
    signature: signManifest(RUN_MANIFEST, T.afterSupersession, k2.privateKey),
    signedAt: T.afterSupersession,
  });
  assert.equal(tamperedManifest.ok, false);
  assert.equal(tamperedManifest.failureReason, 'signature-verification-failed');

  // (5) Tampered REGISTRY: an attacker splices in their own key under the
  // trusted validator's id and resigns the whole chain.
  const attacker = newKeyPair();
  const doctored = clone(registrySnapshot);
  doctored.entries[0].publicKeyPem = attacker.publicKeyPem;
  const tamperedRegistry = verifyRunManifestAgainstRegistry({
    ...base,
    registrySnapshot: doctored,
    signature: signManifest(RUN_MANIFEST, T.insideK1Only, attacker.privateKey),
    signedAt: T.insideK1Only,
  });
  assert.equal(tamperedRegistry.ok, false);
  assert.match(tamperedRegistry.failureReason, /^registry-invalid: /);

  // (6) A signature from a key that is simply not this validator's.
  const foreignKey = verifyRunManifestAgainstRegistry({
    ...base,
    signature: signManifest(RUN_MANIFEST, T.afterSupersession, attacker.privateKey),
    signedAt: T.afterSupersession,
  });
  assert.equal(foreignKey.ok, false);
  assert.equal(foreignKey.failureReason, 'signature-verification-failed');
});

test('verifyRunManifestAgainstRegistry cannot detect a backdated signedAt', () => {
  // THE HONEST LIMIT, asserted rather than described. This test exists to make
  // a real weakness impossible to lose: it is the case the old time-bound test
  // fixture hid.
  //
  // `signedAt` is a bare caller-supplied string. The signed payload carries no
  // timestamp, the run manifest carries no timestamp, and the validator receipt
  // carries no timestamp — so whoever presents the artifact chooses the instant
  // it is judged at. A holder of a REVOKED key can sign a brand-new artifact
  // and simply assert a pre-revocation instant.
  const { k2, registry } = buildLifecycleRegistry('backdate');
  const registrySnapshot = registry.snapshot();
  registry.close();

  const base = {
    manifest: RUN_MANIFEST,
    registrySnapshot,
    validatorId: VALIDATOR_ID,
    verifySignature,
  };
  // Signed "now", long after the key was revoked at T.revokedAt.
  const forgery = signManifest(RUN_MANIFEST, T.afterRevocation, k2.privateKey);

  // Presented honestly: refused by the clock.
  assert.equal(
    verifyRunManifestAgainstRegistry({
      ...base, signature: forgery, signedAt: T.afterRevocation,
    }).failureReason,
    'key-revoked',
  );

  // Presented with a BACKDATED signedAt: accepted. This is not a bug in the
  // module — it is the boundary the module now states in its header and pins in
  // TRUST_REGISTRY_CLAIM_BOUNDARY. Closing it needs a trusted timestamp
  // authority or an independent countersignature, neither of which this slice
  // has or claims.
  const backdated = verifyRunManifestAgainstRegistry({
    ...base, signature: forgery, signedAt: T.justBeforeRevocation,
  });
  assert.equal(
    backdated.ok,
    true,
    'if this ever goes false, signing time became authenticated — update the '
    + 'claim boundary, this test, and both module headers together',
  );

  // ...and the claim boundary says so, machine-readably, so a consumer does
  // not have to read prose to learn it.
  assert.equal(
    TRUST_REGISTRY_CLAIM_BOUNDARY.signingTimeAuthenticatedClaimed,
    false,
  );
  assert.equal(
    TRUST_REGISTRY_CLAIM_BOUNDARY.trustedTimestampAuthorityClaimed,
    false,
  );
  assert.equal(
    TRUST_REGISTRY_CLAIM_BOUNDARY.revocationEnforceableAgainstBackdatedSignedAtClaimed,
    false,
  );
  assert.equal(TRUST_REGISTRY_CLAIM_BOUNDARY.entryAuthorizationClaimed, false);
  assert.ok(Object.isFrozen(TRUST_REGISTRY_CLAIM_BOUNDARY));
});

test('verifyRunManifestAgainstRegistry fails closed on bad inputs and bad verifiers', () => {
  const { k2, registry } = buildLifecycleRegistry('fleet-inputs');
  const registrySnapshot = registry.snapshot();
  registry.close();

  const signedAt = T.afterSupersession;
  const signature = signManifest(RUN_MANIFEST, signedAt, k2.privateKey);
  const base = {
    manifest: RUN_MANIFEST,
    registrySnapshot,
    signature,
    signedAt,
    validatorId: VALIDATOR_ID,
  };

  assert.equal(
    verifyRunManifestAgainstRegistry({ ...base }).failureReason,
    'verifier-not-provided',
  );
  assert.equal(
    verifyRunManifestAgainstRegistry({ ...base, manifest: 'not-an-object', verifySignature })
      .failureReason,
    'manifest-not-an-object',
  );
  assert.equal(
    verifyRunManifestAgainstRegistry({ ...base, signature: '', verifySignature }).failureReason,
    'signature-missing',
  );
  assert.equal(
    verifyRunManifestAgainstRegistry({ ...base, signedAt: 'yesterday', verifySignature })
      .failureReason,
    'signed-at-invalid',
  );

  // A truthy NON-boolean must never be read as "valid".
  assert.equal(
    verifyRunManifestAgainstRegistry({
      ...base,
      verifySignature: () => ({ valid: true }),
    }).failureReason,
    'injected-verifier-returned-non-boolean',
  );

  // A throwing verifier fails closed, and its message is not echoed.
  const thrown = verifyRunManifestAgainstRegistry({
    ...base,
    verifySignature: () => {
      throw new Error('BEGIN PRIVATE KEY leak attempt');
    },
  });
  assert.equal(thrown.ok, false);
  assert.equal(thrown.failureReason, 'injected-verifier-threw');
  assert.equal(thrown.failureReason.includes('PRIVATE KEY'), false);

  // The verifier never throws, even on a hostile snapshot.
  const hostile = verifyRunManifestAgainstRegistry({
    ...base,
    registrySnapshot: { entries: [{ nope: true }] },
    verifySignature,
  });
  assert.equal(hostile.ok, false);
  assert.match(hostile.failureReason, /^registry-invalid: /);
});
