#!/usr/bin/env node
/* global Buffer */

/**
 * Offline node --test suite for the MV-B3 sealed alias-assignment vault
 * (scripts/model-village-alias-vault.mjs).
 *
 * Fully offline: no network, no provider, no git. The custody store is the
 * REAL MV-B1 sealed store (scripts/model-village-custody-store.mjs) rooted in
 * an os.tmpdir() scratch directory that is closed and removed after each
 * test. Certification receipts are REAL MV-B1 receipts produced by
 * certifyLockedAdapterRoute against an in-process fetch stub, so they verify
 * genuinely (recomputable receiptHash) instead of being hand-faked shapes.
 *
 * ENDPOINTS ARE DELIBERATELY UNROUTABLE. Every fixture route points at an
 * RFC 6761 reserved `.test` hostname, never at a real sovereign endpoint, so
 * a regression that dropped the fetch stub would fail loudly instead of
 * silently probing a live service. The routeIds keep their real
 * `sovereign-*` shape because that shape is what the blinding assertions and
 * the anti-leak audit are testing against.
 *
 * Nothing here claims a live study run, Phase 1 admission or readiness, a
 * blinded evaluation, post-lock presentation execution, or family-to-model
 * attribution.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ALIAS_ASSIGNMENT_COMMITMENT_SCHEMA,
  ALIAS_VAULT_ENGINE,
  ALIAS_VAULT_SCHEMA,
  UNBLINDING_RECEIPT_SCHEMA,
  ModelVillageAliasVaultError,
  issueUnblindingReceipt,
  loadFrozenAssignmentMatrix,
  sealAliasAssignment,
  verifyAliasAssignmentCommitment,
  verifyUnblindingReceipt,
} from '../model-village-alias-vault.mjs';
import { certifyLockedAdapterRoute } from '../model-village-adapter-runtime.mjs';
import { createSealedCustodyStore } from '../model-village-custody-store.mjs';
import { canonicalJson } from '../model-village-phase0b-runtime.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const hololandRoot = path.resolve(testDir, '..', '..');
const STUDY_ALIASES = ['adapter_a', 'adapter_b', 'adapter_c'];

// ---------------------------------------------------------------------------
// Independent canonical hashing. Deliberately NOT the shipped canonicalDigest:
// the MV-L12 agreement assertion is worthless if both sides call the same
// helper. This is a from-scratch sorted-key serializer + sha256.
// ---------------------------------------------------------------------------

function independentCanonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(independentCanonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const parts = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${independentCanonicalJson(value[key])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value);
}

function independentDigest(value) {
  return createHash('sha256')
    .update(Buffer.from(independentCanonicalJson(value), 'utf8'))
    .digest('hex');
}

// The frozen matrix, transcribed independently from
// source/proofs/model-village-trial-kernel.hs lines 45-54.
const FROZEN_PERSONA_SEATS = [
  'persona-01@seat-01',
  'persona-02@seat-02',
  'persona-03@seat-03',
  'persona-04@seat-04',
  'persona-05@seat-05',
  'persona-06@seat-06',
];
const FROZEN_BLOCKS = {
  block1: ['adapter_a', 'adapter_a', 'adapter_b', 'adapter_b', 'adapter_c', 'adapter_c'],
  block2: ['adapter_b', 'adapter_b', 'adapter_c', 'adapter_c', 'adapter_a', 'adapter_a'],
  block3: ['adapter_c', 'adapter_c', 'adapter_a', 'adapter_a', 'adapter_b', 'adapter_b'],
};

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const CEILINGS = Object.freeze({
  maxOutputTokens: 256,
  retryCount: 0,
  seedRequested: 7,
  temperature: 0,
  timeoutMs: 5000,
});

function stubRoute(routeId, host, required) {
  return {
    ceilings: { ...CEILINGS },
    chatPath: '/v1/chat/completions',
    // RFC 6761 reserved TLD: guaranteed not to resolve. No live call here.
    endpoint: `http://${host}.test`,
    healthPath: '/health',
    modelsPath: '/v1/models',
    required,
    routeId,
    transport: 'openai-chat-completions-v1',
  };
}

const ROUTES = {
  laptop: stubRoute('sovereign-holoserve-laptop', 'mv-b3-stub-laptop', true),
  jetson: stubRoute('sovereign-holollama-jetson', 'mv-b3-stub-jetson', false),
  spare: stubRoute('sovereign-holoserve-spare', 'mv-b3-stub-spare', false),
};

const DRILL = {
  prompt: {
    promptTemplate:
      'Commons state: {"water": 2}. Reply with exactly one JSON object and '
      + 'no other text: contribute_water or abstain.',
  },
  vocabulary: {
    actionsRequiringNullTargetAndAmount: ['abstain'],
    actionsRequiringTargetAndAmount: ['contribute_water'],
    allowedActions: ['abstain', 'contribute_water'],
    allowedTargets: ['commons_cistern'],
    amountMax: 3,
    amountMin: 1,
    defaultDecision: 'deny',
    deniedActions: ['seize_commons'],
    type: 'proposal_vocabulary',
    vocabularyId: 'mv-b3-test-vocabulary-v1',
  },
};

/**
 * In-process fetch stub. Route-distinct bodies keep the certification
 * evidence distinguishable; no socket is ever opened.
 */
function stubFetchFor(routeId) {
  return async (url) => {
    const target = String(url);
    const payload = target.endsWith('/health')
      ? {
        process_instance_id: `stub-instance-${routeId}`,
        sovereign: true,
        status: 'ok',
        version: '0.0.0-test',
      }
      : { data: [{ id: `stub-model-${routeId}`, object: 'model' }], object: 'list' };
    const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    };
  };
}

function makeFixture(t) {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'mv-b3-alias-'));
  const store = createSealedCustodyStore({
    operator: 'mv-b3-test-operator',
    retentionPolicy: {
      description: 'MV-B3 alias-vault test store; deletable at any time.',
      frozenAt: '2026-07-26T00:00:00.000Z',
      policyId: 'mv-b3-alias-vault-test-retention-v1',
    },
    rootDir: path.join(scratch, 'store'),
    runLabel: 'mv-b3-alias-vault-test',
  });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed by the test body; the scratch removal is what matters.
    }
    rmSync(scratch, { force: true, recursive: true });
  });
  return { scratch, store };
}

async function certify(store, route) {
  return certifyLockedAdapterRoute({
    custodyStore: store,
    drill: DRILL,
    fetchImpl: stubFetchFor(route.routeId),
    operator: 'mv-b3-test-operator',
    route,
  });
}

const MATRIX_BUNDLE = loadFrozenAssignmentMatrix({ hololandRoot });

const AUTHORIZATION = Object.freeze({
  dataCustodian: 'data-custodian-01',
  protocolLead: 'protocol-lead-01',
});

function terminalCommitmentFor(commitment, overrides = {}) {
  return {
    assignmentManifestHash: commitment.assignmentManifestHash,
    canonicalHash: createHash('sha256')
      .update('mv-b3-terminal-commitment-fixture')
      .digest('hex'),
    commitmentId: 'mv-b3-block1-terminal-commitment',
    runId: 'mv-b3-block1',
    ...overrides,
  };
}

async function sealBlock1(t, { aliasRouteMap, allowRouteReuse, routes } = {}) {
  const { store } = makeFixture(t);
  const routeList = routes ?? [ROUTES.laptop, ROUTES.jetson, ROUTES.spare];
  const certifications = [];
  for (const route of routeList) {
    certifications.push(await certify(store, route));
  }
  const commitment = sealAliasAssignment({
    aliasRouteMap: aliasRouteMap ?? {
      adapter_a: ROUTES.laptop.routeId,
      adapter_b: ROUTES.jetson.routeId,
      adapter_c: ROUTES.spare.routeId,
    },
    allowRouteReuse,
    blockId: 'block1',
    certifications,
    custodyStore: store,
    matrixBundle: MATRIX_BUNDLE,
    operator: 'mv-b3-test-operator',
  });
  return { certifications, commitment, store };
}

// ---------------------------------------------------------------------------
// Frozen matrix.
// ---------------------------------------------------------------------------

test('frozen matrix loads, holds the latin square, and agrees with the MV-L12 hash formula', () => {
  const bundle = MATRIX_BUNDLE;
  assert.deepEqual(bundle.matrix.personasAndSeats, FROZEN_PERSONA_SEATS);
  for (const blockId of ['block1', 'block2', 'block3']) {
    assert.deepEqual(bundle.matrix.blocks[blockId], FROZEN_BLOCKS[blockId]);
    for (const alias of STUDY_ALIASES) {
      assert.equal(
        bundle.matrix.blocks[blockId].filter((entry) => entry === alias).length,
        2,
        `${blockId} must allocate ${alias} exactly twice`,
      );
    }
  }
  // Latin square: every persona/seat receives every adapter exactly once.
  FROZEN_PERSONA_SEATS.forEach((personaSeat, index) => {
    const received = ['block1', 'block2', 'block3']
      .map((blockId) => bundle.matrix.blocks[blockId][index])
      .sort();
    assert.deepEqual(received, [...STUDY_ALIASES], `${personaSeat} counterbalance`);
  });
  assert.match(bundle.kernelSourceHash, /^[a-f0-9]{64}$/);

  // MV-L12 formula, computed independently (scripts/model-village-canonical-
  // lifecycle.mjs lines 564-568).
  for (const blockId of ['block1', 'block2', 'block3']) {
    const expected = independentDigest({
      adapters: FROZEN_BLOCKS[blockId],
      blockId,
      personasAndSeats: FROZEN_PERSONA_SEATS,
    });
    assert.equal(
      bundle.assignmentManifestHashByBlock[blockId],
      expected,
      `${blockId} assignmentManifestHash must match the MV-L12 formula`,
    );
  }
  // The three blocks are distinct assignments, so their hashes must differ.
  assert.equal(new Set(Object.values(bundle.assignmentManifestHashByBlock)).size, 3);
});

// ---------------------------------------------------------------------------
// Sealing and commitment shape.
// ---------------------------------------------------------------------------

test('sealAliasAssignment returns a verifying public commitment', async (t) => {
  const { commitment } = await sealBlock1(t);
  assert.equal(commitment.schema, ALIAS_ASSIGNMENT_COMMITMENT_SCHEMA);
  assert.equal(commitment.engine, ALIAS_VAULT_ENGINE);
  assert.equal(commitment.blockId, 'block1');
  assert.equal(
    commitment.assignmentManifestHash,
    MATRIX_BUNDLE.assignmentManifestHashByBlock.block1,
  );
  assert.equal(commitment.kernelSourceHash, MATRIX_BUNDLE.kernelSourceHash);
  assert.equal(commitment.distinctRouteCount, 3);
  assert.equal(commitment.certifiedRouteCount, 3);
  assert.equal(commitment.routeReuseDeclared, false);
  assert.deepEqual(Object.keys(commitment.aliasCommitments).sort(), [...STUDY_ALIASES]);
  for (const alias of STUDY_ALIASES) {
    assert.match(commitment.aliasCommitments[alias], /^[a-f0-9]{64}$/);
  }
  assert.match(commitment.vaultCustodyId, /^[a-f0-9]{64}$/);
  assert.match(commitment.sealedRecordHash, /^[a-f0-9]{64}$/);
  assert.equal(commitment.priorReceiptHash, '0'.repeat(64));
  assert.equal(
    commitment.vaultCustodyId,
    commitment.sealedRecordHash,
    'the MV-B1 store is sha256-plaintext addressed, so the custody address is '
    + 'the sealed-record hash',
  );
  assert.equal(verifyAliasAssignmentCommitment(commitment).ok, true);
});

test('tampering any commitment field breaks verification', async (t) => {
  const { commitment } = await sealBlock1(t);
  const mutations = {
    aliasCommitments: {
      ...commitment.aliasCommitments,
      adapter_a: commitment.aliasCommitments.adapter_b,
    },
    assignmentManifestHash: MATRIX_BUNDLE.assignmentManifestHashByBlock.block2,
    at: '2026-07-26T00:00:00.000Z',
    blockId: 'block2',
    certifiedRouteCount: 2,
    distinctRouteCount: 2,
    engine: 'not-the-alias-vault-engine',
    kernelSourceHash: 'f'.repeat(64),
    priorReceiptHash: 'a'.repeat(64),
    receiptHash: 'b'.repeat(64),
    routeReuseDeclared: true,
    schema: 'hololand.model-village-alias-assignment-commitment.v2',
    sealedRecordHash: 'c'.repeat(64),
    vaultCustodyId: 'd'.repeat(64),
  };
  for (const [key, value] of Object.entries(mutations)) {
    const tampered = { ...commitment, [key]: value };
    const result = verifyAliasAssignmentCommitment(tampered);
    assert.equal(result.ok, false, `tampering ${key} must fail verification`);
    assert.equal(typeof result.failureReason, 'string');
  }
  // Structural tampering: a dropped or added key fails the closed-key check.
  const withoutBlockId = { ...commitment };
  delete withoutBlockId.blockId;
  assert.equal(verifyAliasAssignmentCommitment(withoutBlockId).ok, false);
  assert.equal(
    verifyAliasAssignmentCommitment({ ...commitment, extra: 1 }).ok,
    false,
  );
});

test('the active anti-leak audit rejects a re-signed commitment carrying a route string', async (t) => {
  const { commitment } = await sealBlock1(t);
  // `at` is the only free-form string field, so it is the realistic smuggle
  // vector. The forgery is fully re-signed, so ONLY the anti-leak audit can
  // catch it.
  const body = { ...commitment };
  delete body.receiptHash;
  const leaking = { ...body, at: `sealed-at-${ROUTES.laptop.endpoint}` };
  const resigned = { ...leaking, receiptHash: independentDigest(leaking) };
  const result = verifyAliasAssignmentCommitment(resigned);
  assert.equal(result.ok, false);
  assert.match(result.failureReason, /route-shaped/);

  // A smuggled routeId (no scheme) is caught by the sovereign- prefix rule.
  const leakingId = { ...body, at: `sealed-by-${ROUTES.jetson.routeId}` };
  const resignedId = { ...leakingId, receiptHash: independentDigest(leakingId) };
  assert.match(
    verifyAliasAssignmentCommitment(resignedId).failureReason,
    /route-shaped/,
  );
});

// ---------------------------------------------------------------------------
// The blinding law, proved in both directions.
// ---------------------------------------------------------------------------

test('the commitment hides the mapping while the sealed object holds it', async (t) => {
  const { commitment, store } = await sealBlock1(t);
  const publicJson = canonicalJson(commitment);
  for (const route of Object.values(ROUTES)) {
    assert.equal(
      publicJson.includes(route.routeId),
      false,
      `public commitment must not contain routeId ${route.routeId}`,
    );
    assert.equal(publicJson.includes(route.endpoint), false);
  }

  // Direction two: the sealed custody object DOES carry the mapping and salt.
  const opened = store.readObject(commitment.vaultCustodyId);
  assert.equal(opened.kind, 'alias-assignment-vault');
  const record = JSON.parse(opened.bytes.toString('utf8'));
  assert.equal(record.schema, ALIAS_VAULT_SCHEMA);
  assert.equal(record.blockId, 'block1');
  assert.deepEqual(Object.keys(record.aliasRouteMap).sort(), [...STUDY_ALIASES]);
  assert.equal(record.aliasRouteMap.adapter_a, ROUTES.laptop.routeId);
  assert.equal(record.aliasRouteMap.adapter_b, ROUTES.jetson.routeId);
  assert.equal(record.aliasRouteMap.adapter_c, ROUTES.spare.routeId);
  assert.match(record.salt, /^[a-f0-9]{64}$/);
  assert.equal(
    publicJson.includes(record.salt),
    false,
    'the salt is never public — it is the whole hiding assumption',
  );

  // Seat bindings mirror the MV-L12 shape exactly.
  assert.equal(record.seatBindings.length, 6);
  record.seatBindings.forEach((binding, index) => {
    assert.deepEqual(Object.keys(binding).sort(), [
      'adapter_alias',
      'assignment_manifest_hash',
      'persona_id',
      'resident_id',
      'run_id',
      'seat_id',
    ]);
    const [personaId, seatId] = FROZEN_PERSONA_SEATS[index].split('@');
    assert.equal(binding.persona_id, personaId);
    assert.equal(binding.seat_id, seatId);
    assert.equal(binding.resident_id, `resident-0${index + 1}`);
    assert.equal(binding.adapter_alias, FROZEN_BLOCKS.block1[index]);
    assert.equal(binding.run_id, 'mv-b3-block1');
    assert.equal(
      binding.assignment_manifest_hash,
      MATRIX_BUNDLE.assignmentManifestHashByBlock.block1,
    );
  });

  // The public digests are reproducible ONLY with the sealed salt.
  for (const alias of STUDY_ALIASES) {
    assert.equal(
      independentDigest({
        alias,
        routeId: record.aliasRouteMap[alias],
        salt: record.salt,
      }),
      commitment.aliasCommitments[alias],
    );
  }
});

test('the sealing salt is fresh CSPRNG material on EVERY sealing', async (t) => {
  // The module's stated security model is that mapping secrecy reduces to salt
  // secrecy: the alias set is public and fixed at three and the routeId set is
  // small and public, so the 32-byte salt is the whole hiding assumption. A
  // format-only assertion (`/^[a-f0-9]{64}$/`) does not test that — a
  // hardcoded `'ab'.repeat(32)` satisfies it, re-hashes consistently, passes
  // the seal-time self-verification AND the unblinding re-derivation, and
  // leaves the blind completely gone. This pins the two properties that
  // actually matter.
  const { store } = makeFixture(t);
  const certifications = [];
  for (const route of [ROUTES.laptop, ROUTES.jetson, ROUTES.spare]) {
    certifications.push(await certify(store, route));
  }
  const aliasRouteMap = {
    adapter_a: ROUTES.laptop.routeId,
    adapter_b: ROUTES.jetson.routeId,
    adapter_c: ROUTES.spare.routeId,
  };
  const salts = new Set();
  const perAliasCommitments = { adapter_a: new Set(), adapter_b: new Set(), adapter_c: new Set() };
  const certificationCommitments = new Set();
  const SEALINGS = 8;
  for (let index = 0; index < SEALINGS; index += 1) {
    // The SAME map every time: any variation can only come from the salt.
    const commitment = sealAliasAssignment({
      aliasRouteMap,
      blockId: 'block1',
      certifications,
      custodyStore: store,
      matrixBundle: MATRIX_BUNDLE,
      operator: 'mv-b3-test-operator',
    });
    const record = JSON.parse(
      store.readObject(commitment.vaultCustodyId).bytes.toString('utf8'),
    );
    assert.match(record.salt, /^[a-f0-9]{64}$/);
    salts.add(record.salt);
    certificationCommitments.add(commitment.certificationCommitment);
    for (const alias of STUDY_ALIASES) {
      perAliasCommitments[alias].add(commitment.aliasCommitments[alias]);
    }
  }
  // (1) Uniqueness: a constant or low-entropy salt collides immediately here.
  assert.equal(salts.size, SEALINGS, 'every sealing must draw a fresh salt');
  // (2) Unlinkability across sealings. With a fixed salt the SAME (alias,
  //     routeId) pair would produce a byte-identical aliasCommitment in every
  //     block, publicly linking the assignments the frozen latin square exists
  //     to counterbalance.
  for (const alias of STUDY_ALIASES) {
    assert.equal(
      perAliasCommitments[alias].size,
      SEALINGS,
      `${alias} commitments must not repeat across sealings`,
    );
  }
  assert.equal(certificationCommitments.size, SEALINGS);
  // (3) Entropy sanity: 8 independent 32-byte draws must not be degenerate.
  for (const salt of salts) {
    assert.equal(new Set(salt).size > 4, true, 'salt looks degenerate, not CSPRNG');
  }
});

// ---------------------------------------------------------------------------
// Certification and route-reuse refusals.
// ---------------------------------------------------------------------------

test('an uncertified route can never be sealed as a study adapter', async (t) => {
  const { store } = makeFixture(t);
  const laptop = await certify(store, ROUTES.laptop);
  const jetson = await certify(store, ROUTES.jetson);
  // A genuine FAILED certification receipt: the probe throws, so certified is
  // false while the receipt still verifies structurally.
  const failing = await certifyLockedAdapterRoute({
    custodyStore: store,
    drill: DRILL,
    fetchImpl: async () => {
      const error = new Error('stub refuses to connect');
      error.name = 'TypeError';
      throw error;
    },
    operator: 'mv-b3-test-operator',
    route: ROUTES.spare,
  });
  assert.equal(failing.certified, false);

  const fullMap = {
    adapter_a: ROUTES.laptop.routeId,
    adapter_b: ROUTES.jetson.routeId,
    adapter_c: ROUTES.spare.routeId,
  };

  assert.throws(
    () => sealAliasAssignment({
      aliasRouteMap: fullMap,
      blockId: 'block1',
      certifications: [laptop, jetson, failing],
      custodyStore: store,
      matrixBundle: MATRIX_BUNDLE,
      operator: 'mv-b3-test-operator',
    }),
    (error) => {
      assert.ok(error instanceof ModelVillageAliasVaultError);
      assert.match(error.message, /not certified/);
      for (const route of Object.values(ROUTES)) {
        assert.equal(
          error.message.includes(route.routeId),
          false,
          'error messages must stay mapping-free',
        );
      }
      return true;
    },
  );

  // A route with no certification receipt at all is refused the same way.
  assert.throws(
    () => sealAliasAssignment({
      aliasRouteMap: fullMap,
      blockId: 'block1',
      certifications: [laptop, jetson],
      custodyStore: store,
      matrixBundle: MATRIX_BUNDLE,
      operator: 'mv-b3-test-operator',
    }),
    (error) => {
      assert.match(error.message, /no certified MV-B1 certification receipt/);
      for (const route of Object.values(ROUTES)) {
        assert.equal(error.message.includes(route.routeId), false);
      }
      return true;
    },
  );
});

test('route reuse is refused unless explicitly allowed, then receipted truthfully', async (t) => {
  const { store } = makeFixture(t);
  const laptop = await certify(store, ROUTES.laptop);
  const jetson = await certify(store, ROUTES.jetson);
  const reusedMap = {
    adapter_a: ROUTES.laptop.routeId,
    adapter_b: ROUTES.jetson.routeId,
    adapter_c: ROUTES.laptop.routeId,
  };

  assert.throws(
    () => sealAliasAssignment({
      aliasRouteMap: reusedMap,
      blockId: 'block1',
      certifications: [laptop, jetson],
      custodyStore: store,
      matrixBundle: MATRIX_BUNDLE,
      operator: 'mv-b3-test-operator',
    }),
    (error) => {
      assert.match(error.message, /allowRouteReuse/);
      for (const route of Object.values(ROUTES)) {
        assert.equal(error.message.includes(route.routeId), false);
      }
      return true;
    },
  );

  const commitment = sealAliasAssignment({
    aliasRouteMap: reusedMap,
    allowRouteReuse: true,
    blockId: 'block1',
    certifications: [laptop, jetson],
    custodyStore: store,
    matrixBundle: MATRIX_BUNDLE,
    operator: 'mv-b3-test-operator',
  });
  assert.equal(commitment.routeReuseDeclared, true);
  assert.equal(commitment.distinctRouteCount, 2);
  assert.equal(commitment.certifiedRouteCount, 2);
  assert.equal(verifyAliasAssignmentCommitment(commitment).ok, true);
  // Reuse PAIRING stays hidden: the two aliases sharing one route still commit
  // to different digests because the alias rides the preimage.
  assert.notEqual(
    commitment.aliasCommitments.adapter_a,
    commitment.aliasCommitments.adapter_c,
  );
  assert.equal(canonicalJson(commitment).includes(ROUTES.laptop.routeId), false);

  // The reuse is genuinely sealed and recoverable by the key holder.
  const { revealed } = issueUnblindingReceipt({
    authorization: AUTHORIZATION,
    commitment,
    custodyStore: store,
    operator: 'mv-b3-test-operator',
    terminalCommitment: terminalCommitmentFor(commitment),
  });
  assert.equal(revealed.adapter_a, ROUTES.laptop.routeId);
  assert.equal(revealed.adapter_c, ROUTES.laptop.routeId);
});

// ---------------------------------------------------------------------------
// Unblinding: fail-neutral matrix.
// ---------------------------------------------------------------------------

test('unblinding is fail-neutral for every refusal path', async (t) => {
  const { commitment, store } = await sealBlock1(t);
  const good = terminalCommitmentFor(commitment);
  const base = {
    authorization: AUTHORIZATION,
    commitment,
    custodyStore: store,
    operator: 'mv-b3-test-operator',
    terminalCommitment: good,
  };

  const cases = {
    'absent terminalCommitment': { ...base, terminalCommitment: undefined },
    'null terminalCommitment': { ...base, terminalCommitment: null },
    'malformed terminalCommitment (bare hash, not the binding object)': {
      ...base,
      terminalCommitment: good.canonicalHash,
    },
    'malformed terminalCommitment (bad hash)': {
      ...base,
      terminalCommitment: terminalCommitmentFor(commitment, { canonicalHash: 'nope' }),
    },
    'malformed terminalCommitment (foreign lane run id)': {
      ...base,
      terminalCommitment: terminalCommitmentFor(commitment, { runId: 'mv-b2-block1' }),
    },
    'mismatched terminalCommitment': {
      ...base,
      terminalCommitment: terminalCommitmentFor(commitment, {
        assignmentManifestHash: MATRIX_BUNDLE.assignmentManifestHashByBlock.block2,
      }),
    },
    'protocolLead absent': {
      ...base,
      authorization: { dataCustodian: AUTHORIZATION.dataCustodian, protocolLead: '' },
    },
    'dataCustodian absent': {
      ...base,
      authorization: { dataCustodian: null, protocolLead: AUTHORIZATION.protocolLead },
    },
    'authorization absent entirely': { ...base, authorization: undefined },
    'one person holding both roles': {
      ...base,
      authorization: { dataCustodian: 'same-human', protocolLead: 'same-human' },
    },
    'unverifiable commitment': {
      ...base,
      commitment: { ...commitment, receiptHash: 'e'.repeat(64) },
    },
    'unopenable vault': {
      ...base,
      custodyStore: {
        readObject: () => {
          throw new Error('no sealed object exists for that custodyId');
        },
      },
    },
    'operator absent': { ...base, operator: '' },
  };

  for (const [label, input] of Object.entries(cases)) {
    const outcome = issueUnblindingReceipt(input);
    assert.equal(outcome.revealed, null, `${label} must reveal nothing`);
    assert.equal(outcome.receipt.failNeutral, true, `${label} must be fail-neutral`);
    assert.equal(outcome.receipt.aliasCommitmentsVerified, false, label);
    assert.equal(outcome.receipt.revealedInReceipt, false, label);
    assert.equal(
      verifyUnblindingReceipt(outcome.receipt).ok,
      true,
      `${label} refusal receipt must still be a well-formed receipt`,
    );
    const receiptJson = canonicalJson(outcome.receipt);
    for (const route of Object.values(ROUTES)) {
      assert.equal(receiptJson.includes(route.routeId), false, label);
    }
  }

  // A refusal never echoes a field from a commitment that did not verify.
  const forged = issueUnblindingReceipt({
    ...base,
    commitment: { ...commitment, at: `forged-${ROUTES.laptop.routeId}` },
  });
  assert.equal(forged.receipt.commitmentId, null);
  assert.equal(forged.receipt.assignmentManifestHash, null);
  assert.equal(
    canonicalJson(forged.receipt).includes(ROUTES.laptop.routeId),
    false,
  );

  // Destroyed content key: the vault becomes unopenable and the reveal is
  // refused rather than throwing out of the custody boundary.
  store.destroyContentKey({ reason: 'mv-b3-alias-vault-test-deletion-drill' });
  const afterDestroy = issueUnblindingReceipt(base);
  assert.equal(afterDestroy.revealed, null);
  assert.equal(afterDestroy.receipt.failNeutral, true);
  assert.equal(verifyUnblindingReceipt(afterDestroy.receipt).ok, true);
});

test('a forged route-reuse claim is refused at unblinding, not merely at the verifier', async (t) => {
  // routeReuseDeclared is a SCIENTIFIC-INTEGRITY claim ("a study that reuses a
  // route is a different study, and the public receipt says so"). The
  // commitment verifier only checks the three aggregates for INTERNAL
  // coherence, so a coherent lie passes it. Unblinding is the one moment the
  // sealed truth is in hand, so that is where the aggregates are bound.
  const { store } = makeFixture(t);
  const laptop = await certify(store, ROUTES.laptop);
  const jetson = await certify(store, ROUTES.jetson);
  const commitment = sealAliasAssignment({
    aliasRouteMap: {
      adapter_a: ROUTES.laptop.routeId,
      adapter_b: ROUTES.jetson.routeId,
      adapter_c: ROUTES.laptop.routeId,
    },
    allowRouteReuse: true,
    blockId: 'block1',
    certifications: [laptop, jetson],
    custodyStore: store,
    matrixBundle: MATRIX_BUNDLE,
    operator: 'mv-b3-test-operator',
  });
  assert.equal(commitment.routeReuseDeclared, true);
  assert.equal(commitment.distinctRouteCount, 2);

  const forgeAggregates = (overrides) => {
    const body = { ...commitment };
    delete body.receiptHash;
    const forgedBody = { ...body, ...overrides };
    return { ...forgedBody, receiptHash: independentDigest(forgedBody) };
  };

  const noReuseLie = forgeAggregates({
    certifiedRouteCount: 3,
    distinctRouteCount: 3,
    routeReuseDeclared: false,
  });
  // The lie is internally coherent, so the commitment verifier CANNOT catch
  // it — that is exactly why the unblinding rebind has to exist.
  assert.equal(verifyAliasAssignmentCommitment(noReuseLie).ok, true);

  const forgeries = {
    'reuse denied over a reused assignment': noReuseLie,
    'inflated certifiedRouteCount only': forgeAggregates({
      certifiedRouteCount: 1,
      distinctRouteCount: 1,
      routeReuseDeclared: true,
    }),
  };
  for (const [label, forged] of Object.entries(forgeries)) {
    assert.equal(verifyAliasAssignmentCommitment(forged).ok, true, label);
    const outcome = issueUnblindingReceipt({
      authorization: AUTHORIZATION,
      commitment: forged,
      custodyStore: store,
      operator: 'mv-b3-test-operator',
      terminalCommitment: terminalCommitmentFor(forged),
    });
    assert.equal(outcome.revealed, null, `${label} must reveal nothing`);
    assert.equal(outcome.receipt.failNeutral, true, label);
    assert.equal(verifyUnblindingReceipt(outcome.receipt).ok, true, label);
  }

  // The TRUTHFUL commitment still unblinds, so the new binding is not just a
  // blanket refusal.
  const honest = issueUnblindingReceipt({
    authorization: AUTHORIZATION,
    commitment,
    custodyStore: store,
    operator: 'mv-b3-test-operator',
    terminalCommitment: terminalCommitmentFor(commitment),
  });
  assert.notEqual(honest.revealed, null);
  assert.equal(honest.receipt.failNeutral, false);
});

test('issuance self-audits: a route-shaped authorizer refuses instead of reveals', async (t) => {
  // authorizedBy is the ONLY free-text field on an unblinding receipt.
  // Previously it was projected in unvalidated, so a URN-style custodian id or
  // a host-shaped name produced a SUCCESSFUL reveal (irreversible: two-person
  // authorization consumed, custody read logged) carried by a receipt that
  // then failed verifyUnblindingReceipt — a permanently unverifiable record of
  // a reveal that already happened, with no re-issue path.
  const { commitment, store } = await sealBlock1(t);
  const base = {
    commitment,
    custodyStore: store,
    operator: 'mv-b3-test-operator',
    terminalCommitment: terminalCommitmentFor(commitment),
  };
  const hostile = {
    'endpoint-shaped custodian': {
      dataCustodian: 'http://192.168.0.119:18080',
      protocolLead: 'protocol-lead-01',
    },
    'routeId-shaped lead': {
      dataCustodian: 'data-custodian-01',
      protocolLead: ROUTES.laptop.routeId,
    },
    'loopback-shaped custodian': {
      dataCustodian: 'localhost-custodian',
      protocolLead: 'protocol-lead-01',
    },
    'dotted-quad lead': {
      dataCustodian: 'data-custodian-01',
      protocolLead: '10.0.0.4',
    },
  };
  for (const [label, authorization] of Object.entries(hostile)) {
    const outcome = issueUnblindingReceipt({ ...base, authorization });
    assert.equal(outcome.revealed, null, `${label} must not reveal`);
    assert.equal(outcome.receipt.failNeutral, true, label);
    // The receipt recording the refusal is itself verifiable — the property
    // that was broken.
    assert.equal(verifyUnblindingReceipt(outcome.receipt).ok, true, label);
    const serialized = canonicalJson(outcome.receipt);
    for (const route of Object.values(ROUTES)) {
      assert.equal(serialized.includes(route.routeId), false, label);
    }
    assert.equal(serialized.includes('192.168.0.119'), false, label);
    assert.equal(serialized.includes('localhost'), false, label);
  }
});

test('the unblinding boundary never throws, whatever the caller hands it', async (t) => {
  // "a throw at an unblinding boundary is itself a leak surface (stack traces
  // and messages escape into logs)" — so the boundary has to survive a null
  // argument and a hostile accessor, both of which used to escape it.
  const { commitment, store } = await sealBlock1(t);
  const hostileAuthorization = {
    get protocolLead() {
      throw new Error(`boom ${ROUTES.laptop.routeId}`);
    },
    dataCustodian: 'data-custodian-01',
  };
  const inputs = {
    'null argument': null,
    'no argument': undefined,
    'array argument': [],
    'string argument': 'not-an-input-object',
    'authorization accessor that throws a route string': {
      authorization: hostileAuthorization,
      commitment,
      custodyStore: store,
      operator: 'mv-b3-test-operator',
      terminalCommitment: terminalCommitmentFor(commitment),
    },
  };
  for (const [label, input] of Object.entries(inputs)) {
    let outcome;
    assert.doesNotThrow(() => { outcome = issueUnblindingReceipt(input); }, label);
    assert.equal(outcome.revealed, null, label);
    assert.equal(outcome.receipt.failNeutral, true, label);
    assert.equal(verifyUnblindingReceipt(outcome.receipt).ok, true, label);
    assert.equal(
      canonicalJson(outcome.receipt).includes(ROUTES.laptop.routeId),
      false,
      label,
    );
  }
});

// ---------------------------------------------------------------------------
// Unblinding: success path.
// ---------------------------------------------------------------------------

test('authorized unblinding reveals the mapping in memory only', async (t) => {
  const { commitment, store } = await sealBlock1(t);
  const terminalCommitment = terminalCommitmentFor(commitment);
  const { receipt, revealed } = issueUnblindingReceipt({
    authorization: AUTHORIZATION,
    commitment,
    custodyStore: store,
    operator: 'mv-b3-test-operator',
    terminalCommitment,
  });

  assert.notEqual(revealed, null);
  assert.deepEqual(revealed, {
    adapter_a: ROUTES.laptop.routeId,
    adapter_b: ROUTES.jetson.routeId,
    adapter_c: ROUTES.spare.routeId,
  });

  assert.equal(receipt.schema, UNBLINDING_RECEIPT_SCHEMA);
  assert.equal(receipt.engine, ALIAS_VAULT_ENGINE);
  assert.equal(receipt.failNeutral, false);
  assert.equal(receipt.aliasCommitmentsVerified, true);
  assert.equal(receipt.revealedInReceipt, false);
  assert.equal(receipt.commitmentId, commitment.receiptHash);
  assert.equal(receipt.assignmentManifestHash, commitment.assignmentManifestHash);
  assert.equal(receipt.runId, 'mv-b3-block1');
  assert.equal(receipt.terminalCommitmentId, terminalCommitment.commitmentId);
  assert.equal(receipt.terminalCommitmentHash, terminalCommitment.canonicalHash);
  assert.equal(
    receipt.priorReceiptHash,
    terminalCommitment.canonicalHash,
    'declared chain: terminal commitment -> unblinding receipt',
  );
  assert.deepEqual(receipt.authorizedBy, {
    dataCustodian: AUTHORIZATION.dataCustodian,
    protocolLead: AUTHORIZATION.protocolLead,
  });
  assert.equal(verifyUnblindingReceipt(receipt).ok, true);

  // THE RECEIPT NEVER CONTAINS THE MAPPING.
  const receiptJson = canonicalJson(receipt);
  for (const route of Object.values(ROUTES)) {
    assert.equal(
      receiptJson.includes(route.routeId),
      false,
      `unblinding receipt must not contain routeId ${route.routeId}`,
    );
    assert.equal(receiptJson.includes(route.endpoint), false);
  }
  for (const alias of STUDY_ALIASES) {
    assert.equal(
      receiptJson.includes(revealed[alias]),
      false,
      'the revealed mapping stays in memory, never in the receipt',
    );
  }

  // Two-stage hashing is real: canonicalHash covers the body, receiptHash
  // covers body + canonicalHash. Recomputed with the independent hasher.
  const { canonicalHash, receiptHash, ...body } = receipt;
  assert.equal(independentDigest(body), canonicalHash);
  assert.equal(independentDigest({ ...body, canonicalHash }), receiptHash);
});

test('unblinding receipt tampering is detected', async (t) => {
  const { commitment, store } = await sealBlock1(t);
  const { receipt } = issueUnblindingReceipt({
    authorization: AUTHORIZATION,
    commitment,
    custodyStore: store,
    operator: 'mv-b3-test-operator',
    terminalCommitment: terminalCommitmentFor(commitment),
  });
  assert.equal(verifyUnblindingReceipt(receipt).ok, true);

  const mutations = {
    aliasCommitmentsVerified: false,
    assignmentManifestHash: MATRIX_BUNDLE.assignmentManifestHashByBlock.block3,
    at: '2026-07-26T00:00:00.000Z',
    authorizedBy: { dataCustodian: 'someone-else', protocolLead: 'protocol-lead-01' },
    canonicalHash: 'a'.repeat(64),
    commitmentId: 'b'.repeat(64),
    engine: 'other-engine',
    failNeutral: true,
    priorReceiptHash: 'c'.repeat(64),
    receiptHash: 'd'.repeat(64),
    receiptId: 'mv-b3-unblinding-forged',
    revealedInReceipt: true,
    runId: 'mv-b3-block2',
    schema: 'hololand.model-village-unblinding-receipt.v2',
    terminalCommitmentHash: 'e'.repeat(64),
    terminalCommitmentId: 'forged-terminal-commitment',
  };
  for (const [key, value] of Object.entries(mutations)) {
    const tampered = { ...receipt, [key]: value };
    assert.equal(
      verifyUnblindingReceipt(tampered).ok,
      false,
      `tampering ${key} must fail verification`,
    );
  }

  // A fully re-signed forgery that flips revealedInReceipt is still refused:
  // the flag is pinned, not merely hashed.
  const body = { ...receipt };
  delete body.canonicalHash;
  delete body.receiptHash;
  const forgedBody = { ...body, revealedInReceipt: true };
  const forgedCanonical = independentDigest(forgedBody);
  const forged = {
    ...forgedBody,
    canonicalHash: forgedCanonical,
    receiptHash: independentDigest({ ...forgedBody, canonicalHash: forgedCanonical }),
  };
  assert.equal(verifyUnblindingReceipt(forged).ok, false);
});
