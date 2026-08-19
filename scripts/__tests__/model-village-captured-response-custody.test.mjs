#!/usr/bin/env node
/* global Buffer, process, structuredClone */

// MV-B3 captured-response custody tests. Fully offline by design: the
// "provider" is an in-process node:http OpenAI-compatible stub bound to the
// loopback interface on an ephemeral port. This is not a stand-in for a cloud
// service — the canonical drill source declares the SOVEREIGN production
// route as a loopback HoloServe endpoint, so loopback is the real transport
// shape this lane certifies against. The stub replaces only the model, never
// the transport, the custody store, or the receipt chain (all of which are
// the real shipped modules).
//
// Nothing in this file claims a live study run, Phase 1 admission or
// readiness, blinded evaluation, post-lock presentation execution, or a swap
// of custody-backed records into the frozen Phase 0B plan. Drop-in
// ELIGIBILITY is proven; the frozen plan is never mutated.

import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalDigest, canonicalJson } from '../model-village-phase0b-runtime.mjs';
import { createSealedCustodyStore } from '../model-village-custody-store.mjs';
import {
  certifyLockedAdapterRoute,
  loadAdapterCustodyDrillManifest,
  verifyModelTurnReceipt,
} from '../model-village-adapter-runtime.mjs';
import {
  CANONICAL_RESPONSE_KIND,
  CAPTURED_RESPONSE_CUSTODY_CLAIM_BOUNDARY,
  CAPTURED_RESPONSE_CUSTODY_ENGINE,
  CAPTURED_RESPONSE_RECORD_SCHEMA,
  ModelVillageCapturedResponseCustodyError,
  PHASE0B_FIXTURE_KEYS,
  PHASE0B_FIXTURE_TYPE,
  RAW_RESPONSE_KIND,
  ROUTE_DISCLOSURE_KIND,
  buildPhase0BFixtureForm,
  captureResponseUnderCustody,
  sealAliasCommitment,
  verifyCapturedResponseRecord,
  verifyDropInEligibility,
} from '../model-village-captured-response-custody.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const ownedRoot = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'captured-response-custody-tests',
  `custody-${process.pid}-${randomUUID()}`,
);
mkdirSync(ownedRoot, { recursive: true });

const OPERATOR = 'mv-b3-test-operator';
const LOOPBACK = '127.0.0.1';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Independent mirror of the frozen sourceDigest formula (phase0b :241-243). */
function sourceDigestIndependently(text) {
  return sha256Hex(Buffer.from(String(text).replace(/\r\n?/g, '\n'), 'utf8'));
}

function newSalt() {
  return randomBytes(24).toString('hex');
}

function newCustodyStore(name) {
  return createSealedCustodyStore({
    rootDir: path.join(ownedRoot, `custody-${name}`),
    runLabel: 'mv-b3-captured-response-custody-test',
    operator: OPERATOR,
    retentionPolicy: {
      description: 'Engineering custody drill store; deletable at any time.',
      frozenAt: new Date().toISOString(),
      policyId: 'mv-b3-captured-response-test-retention-v1',
    },
  });
}

// ---------------------------------------------------------------------------
// Frozen fixture drift canary. The two `.hs` fixtures are the exact shapes a
// custody-backed record must be able to reproduce; they are read (never
// written) straight from the frozen source.
// ---------------------------------------------------------------------------

const frozenManifestSource = readFileSync(
  path.join(repoRoot, 'source', 'proofs', 'model-village-phase1-manifests.hs'),
  'utf8',
);

function frozenFixture(objectName) {
  const opened = frozenManifestSource.split(`object "${objectName}" {`);
  assert.equal(opened.length, 2, `frozen fixture ${objectName} must exist exactly once`);
  const body = opened[1].split('\n}')[0];
  const field = (name) => {
    const match = body.match(new RegExp(`${name}:\\s*("(?:[^"\\\\]|\\\\.)*")`));
    assert.ok(match, `frozen fixture ${objectName} has no ${name} field`);
    return JSON.parse(match[1]);
  };
  return {
    adapterAlias: field('adapterAlias'),
    parsedProposal: field('parsedProposal'),
    residentId: field('residentId'),
    responseId: field('responseId'),
    responseText: field('responseText'),
  };
}

const frozen01 = frozenFixture('ModelVillagePhase0BCapturedResponse01');
const frozen02 = frozenFixture('ModelVillagePhase0BCapturedResponse02');

// ---------------------------------------------------------------------------
// In-process OpenAI-compatible provider stub with settable content.
// ---------------------------------------------------------------------------

const PROSE_MARKER = 'THE-CISTERN-IS-LOW-SO-I-SHARE-MY-ALLOTMENT-FREELY';

/** Sorted keys, no padding: already its own canonical serialization. */
const CANONICAL_CONTRIBUTION = JSON.stringify({
  action: 'contribute_water',
  amount: 1,
  reason: PROSE_MARKER,
  target: 'commons_cistern',
});

/** Same values, reversed key order: canonicalization required. */
const REVERSED_CONTRIBUTION = JSON.stringify({
  target: 'commons_cistern',
  reason: PROSE_MARKER,
  amount: 1,
  action: 'contribute_water',
});

/** Pretty-printed, whitespace-padded, prose-carrying: canonicalization required. */
const PROSE_PADDED_CONTRIBUTION = `\n  ${JSON.stringify(
  {
    action: 'contribute_water',
    reason: `${PROSE_MARKER} and I explain myself at length right here.`,
    target: 'commons_cistern',
    amount: 1,
  },
  null,
  2,
)}\n\n`;

/**
 * A denied action (the vocabulary denies send_external_message), emitted in
 * exactly the shape of the frozen resident-02 fixture. The MV-B1 turn receipt
 * carries parsedProposal: null for this, which is what drives the
 * 'sealed-raw-bytes' derivation path.
 */
const DENIED_EXTERNAL_MESSAGE = frozen02.responseText;

const UNPARSEABLE_PROSE = `Sure! Here is my proposal:\n${CANONICAL_CONTRIBUTION}\nHope that helps.`;

function respondJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
  });
  res.end(body);
}

function startStubProvider({ content = CANONICAL_CONTRIBUTION, chatMode = 'ok' } = {}) {
  const state = { chatMode, content, lastResponseBytes: null, chatRequests: 0 };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/health') {
        respondJson(res, 200, {
          process_instance_id: 'stub-process-1',
          sovereign: true,
          status: 'ok',
          version: '9.9.9-test',
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/v1/models') {
        respondJson(res, 200, {
          data: [{ id: 'stub-model-1', object: 'model' }],
          object: 'list',
        });
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        state.chatRequests += 1;
        if (state.chatMode === 'http-500') {
          respondJson(res, 500, { error: 'stub induced failure' });
          return;
        }
        const payload = {
          choices: [{
            finish_reason: 'stop',
            index: 0,
            message: { content: state.content, role: 'assistant' },
          }],
          created: 1753488000,
          id: 'chatcmpl-stub-1',
          model: 'stub-model-1',
          object: 'chat.completion',
          usage: { completion_tokens: 21, prompt_tokens: 84, total_tokens: 105 },
        };
        const body = Buffer.from(JSON.stringify(payload), 'utf8');
        state.lastResponseBytes = body;
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-length': body.length,
        });
        res.end(body);
        return;
      }
      respondJson(res, 404, { error: 'not found' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, LOOPBACK, () => {
      const { port } = server.address();
      resolve({
        endpoint: `http://${LOOPBACK}:${port}`,
        host: LOOPBACK,
        setContent: (next) => { state.content = next; },
        setChatMode: (next) => { state.chatMode = next; },
        getLastResponseBytes: () => state.lastResponseBytes,
        getChatRequestCount: () => state.chatRequests,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

const bundle = await loadAdapterCustodyDrillManifest({ hololandRoot: repoRoot });

function stubRoute(endpoint, timeoutMs = 5000) {
  return {
    ...bundle.routes[0],
    ceilings: { ...bundle.routes[0].ceilings, timeoutMs },
    endpoint,
  };
}

async function certifiedRoute(custodyStore, provider) {
  const route = stubRoute(provider.endpoint);
  const certification = await certifyLockedAdapterRoute({
    route,
    drill: bundle,
    custodyStore,
    operator: OPERATOR,
  });
  assert.equal(certification.certified, true, certification.failureReason ?? '');
  return { certification, route };
}

async function captureOne(custodyStore, provider, overrides = {}) {
  const { certification, route } = overrides.certified
    ?? await certifiedRoute(custodyStore, provider);
  return captureResponseUnderCustody({
    custodyStore,
    operator: OPERATOR,
    route,
    certification,
    drill: bundle,
    residentId: overrides.residentId ?? 'resident-01',
    responseId: overrides.responseId ?? 'mv-b3-response-01',
    blinded: overrides.blinded ?? false,
    routeCommitmentSalt: overrides.routeCommitmentSalt ?? null,
    aliasCommitmentRef: overrides.aliasCommitmentRef ?? null,
  });
}

function checkByName(result, name) {
  const found = result.checks.find((check) => check.name === name);
  assert.ok(found, `expected a check named ${name}; got `
    + canonicalJson(result.checks.map((check) => check.name)));
  return found;
}

function sealedKinds(custodyStore) {
  return custodyStore.listObjects()
    .filter((entry) => entry.metadataAvailable)
    .map((entry) => entry.kind);
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

test('the frozen fixture drift canary reads the two `.hs` fixtures', () => {
  assert.equal(frozen01.residentId, 'resident-01');
  assert.equal(frozen02.residentId, 'resident-02');
  assert.equal(
    frozen01.responseText,
    '{"action":"contribute_water","amount":1,"target":"commons_cistern"}',
  );
  assert.equal(frozen01.parsedProposal, 'contribute_water:commons_cistern:1');
  assert.equal(
    frozen02.responseText,
    '{"action":"send_external_message","target":"outside_village"}',
  );
  assert.equal(frozen02.parsedProposal, 'send_external_message:outside_village');
  // The frozen responseText carries no `reason`: raw model text never rides
  // into the public fixture, which is why derivation projects it out.
  assert.equal(frozen01.responseText.includes('reason'), false);
  assert.equal(frozen02.responseText.includes('reason'), false);
});

test('capture seals BOTH the raw provider bytes and the derived canonical text', async () => {
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('seals-both');
    const { record, turnReceipt } = await captureOne(custodyStore, provider);

    assert.ok(record, 'a completed turn must yield a record');
    assert.equal(record.schema, CAPTURED_RESPONSE_RECORD_SCHEMA);
    assert.equal(record.engine, CAPTURED_RESPONSE_CUSTODY_ENGINE);
    assert.equal(verifyModelTurnReceipt(turnReceipt).ok, true);
    assert.equal(verifyCapturedResponseRecord(record).ok, true);
    assert.equal(provider.getChatRequestCount(), 1, 'exactly one model turn');

    // Raw read-back is byte-identical to the bytes the provider actually wrote.
    const providerBytes = provider.getLastResponseBytes();
    const rawRead = custodyStore.readObject(record.rawResponseCustodyId);
    assert.ok(Buffer.isBuffer(rawRead.bytes));
    assert.ok(rawRead.bytes.equals(providerBytes), 'raw custody != provider bytes');
    assert.equal(record.rawResponseHash, sha256Hex(providerBytes));
    assert.equal(record.rawResponseHash, turnReceipt.responseHash);

    // The canonical object is a SECOND, distinct sealed object.
    const canonicalRead = custodyStore.readObject(record.canonicalResponseCustodyId);
    const canonicalText = canonicalRead.bytes.toString('utf8');
    assert.equal(canonicalText, frozen01.responseText);
    assert.notEqual(record.canonicalResponseCustodyId, record.rawResponseCustodyId);
    assert.ok(sealedKinds(custodyStore).includes(CANONICAL_RESPONSE_KIND));

    // responseHash is the frozen sourceDigest formula, computed independently.
    assert.equal(record.responseHash, sourceDigestIndependently(canonicalText));
    assert.equal(record.responseHash, sourceDigestIndependently(frozen01.responseText));
    assert.equal(record.parsedProposal, frozen01.parsedProposal);

    // Sampling evidence (spec lines 216-224).
    assert.deepEqual(record.samplingEvidence, {
      maxOutputTokens: 256,
      seedAcceptedEvidence: 'unverified',
      seedRequested: 1234,
      temperature: 0,
    });
  } finally {
    await provider.close();
  }
});

test('canonicalizationRequired is FALSE only when the provider emitted canonical bytes', async () => {
  const cases = [
    ['already-canonical', CANONICAL_CONTRIBUTION, false, 'bounded-parsed-proposal'],
    ['reversed-key-order', REVERSED_CONTRIBUTION, true, 'bounded-parsed-proposal'],
    ['prose-and-whitespace-padded', PROSE_PADDED_CONTRIBUTION, true, 'bounded-parsed-proposal'],
    ['denied-action-sealed-raw-path', DENIED_EXTERNAL_MESSAGE, false, 'sealed-raw-bytes'],
  ];
  for (const [name, content, expected, expectedSource] of cases) {
    const provider = await startStubProvider({ content });
    try {
      const custodyStore = newCustodyStore(`canonicalization-${name}`);
      const { record } = await captureOne(custodyStore, provider, {
        responseId: `mv-b3-${name}`,
      });
      assert.equal(record.canonicalizationRequired, expected, name);
      assert.equal(record.derivationSource, expectedSource, name);
      // Whatever the provider emitted, the derived canonical text is byte-equal
      // to its own canonical serialization.
      const canonicalText = custodyStore
        .readObject(record.canonicalResponseCustodyId).bytes.toString('utf8');
      assert.equal(canonicalJson(JSON.parse(canonicalText)), canonicalText, name);
      assert.equal(record.responseHash, sourceDigestIndependently(canonicalText), name);
    } finally {
      await provider.close();
    }
  }
});

test('the denied-action path reproduces the frozen resident-02 fixture exactly', async () => {
  const provider = await startStubProvider({ content: DENIED_EXTERNAL_MESSAGE });
  try {
    const custodyStore = newCustodyStore('frozen-02-shape');
    const { record, turnReceipt } = await captureOne(custodyStore, provider, {
      residentId: 'resident-02',
      responseId: 'mv-b3-response-02',
    });
    // MV-B1 denies the action, so no bounded proposal exists and derivation
    // must fall through to the sealed raw bytes.
    assert.equal(turnReceipt.proposalDecision, 'deny');
    assert.equal(turnReceipt.parsedProposal, null);
    assert.equal(record.derivationSource, 'sealed-raw-bytes');
    const canonicalText = custodyStore
      .readObject(record.canonicalResponseCustodyId).bytes.toString('utf8');
    assert.equal(canonicalText, frozen02.responseText);
    assert.equal(record.parsedProposal, frozen02.parsedProposal);
    assert.equal(record.responseHash, sourceDigestIndependently(frozen02.responseText));
  } finally {
    await provider.close();
  }
});

test('an ordered custody-backed pair proves drop-in eligibility', async () => {
  const provider = await startStubProvider({ content: REVERSED_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('drop-in-eligible');
    const certified = await certifiedRoute(custodyStore, provider);
    await sealAliasCommitment({
      custodyStore,
      aliasCommitmentRef: 'mvb3-commitment-ref-01',
      adapterAlias: frozen01.adapterAlias,
      salt: newSalt(),
    });
    await sealAliasCommitment({
      custodyStore,
      aliasCommitmentRef: 'mvb3-commitment-ref-02',
      adapterAlias: frozen02.adapterAlias,
      salt: newSalt(),
    });

    const first = await captureOne(custodyStore, provider, {
      certified,
      residentId: 'resident-01',
      responseId: frozen01.responseId,
      aliasCommitmentRef: 'mvb3-commitment-ref-01',
    });
    provider.setContent(DENIED_EXTERNAL_MESSAGE);
    const second = await captureOne(custodyStore, provider, {
      certified,
      residentId: 'resident-02',
      responseId: frozen02.responseId,
      aliasCommitmentRef: 'mvb3-commitment-ref-02',
    });

    const forms = [first.record, second.record].map(
      (record) => buildPhase0BFixtureForm(record, custodyStore),
    );
    assert.deepEqual(Object.keys(forms[0]).sort(), [...PHASE0B_FIXTURE_KEYS]);
    assert.equal(forms[0].type, PHASE0B_FIXTURE_TYPE);
    // The custody-backed forms reproduce the frozen fixtures byte-for-byte,
    // alias included (the alias came out of sealed custody, not the record).
    assert.deepEqual(forms[0], { ...frozen01, type: PHASE0B_FIXTURE_TYPE });
    assert.deepEqual(forms[1], { ...frozen02, type: PHASE0B_FIXTURE_TYPE });

    const result = verifyDropInEligibility({
      records: [first.record, second.record],
      custodyStore,
    });
    assert.equal(
      result.eligible,
      true,
      canonicalJson(result.checks.filter((check) => !check.ok)),
    );
    for (const name of [
      'record-pair-arity',
      'fixture-forms-resolved',
      'record-receipts-verify',
      'fixture-form-exact-keys',
      'fixture-type-pinned',
      'response-text-strict-json',
      'response-text-canonical-byte-equal',
      'parsed-proposal-matches-expected',
      'resident-order-exact',
      'response-hash-source-digest',
      'response-hashes-distinct',
      'plan-hydration-binding-shape',
    ]) {
      assert.equal(checkByName(result, name).ok, true, name);
    }
    // Claim boundary: eligibility proven, no frozen-plan swap performed.
    assert.equal(CAPTURED_RESPONSE_CUSTODY_CLAIM_BOUNDARY.frozenPlanSwapPerformed, false);
    assert.equal(
      CAPTURED_RESPONSE_CUSTODY_CLAIM_BOUNDARY.dropInEligibilityVerifierProvided,
      true,
    );
  } finally {
    await provider.close();
  }
});

test('each drop-in violation fails its OWN named check', async () => {
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('drop-in-violations');
    const certified = await certifiedRoute(custodyStore, provider);
    await sealAliasCommitment({
      custodyStore,
      aliasCommitmentRef: 'mvb3-violation-ref-01',
      adapterAlias: frozen01.adapterAlias,
      salt: newSalt(),
    });
    await sealAliasCommitment({
      custodyStore,
      aliasCommitmentRef: 'mvb3-violation-ref-02',
      adapterAlias: frozen02.adapterAlias,
      salt: newSalt(),
    });
    const first = (await captureOne(custodyStore, provider, {
      certified,
      residentId: 'resident-01',
      responseId: 'mv-b3-violation-01',
      aliasCommitmentRef: 'mvb3-violation-ref-01',
    })).record;
    provider.setContent(DENIED_EXTERNAL_MESSAGE);
    const second = (await captureOne(custodyStore, provider, {
      certified,
      residentId: 'resident-02',
      responseId: 'mv-b3-violation-02',
      aliasCommitmentRef: 'mvb3-violation-ref-02',
    })).record;
    const formOf = (record) => buildPhase0BFixtureForm(record, custodyStore);

    // (a) wrong resident order.
    const swapped = verifyDropInEligibility({
      records: [second, first],
      custodyStore,
    });
    assert.equal(swapped.eligible, false);
    assert.equal(checkByName(swapped, 'resident-order-exact').ok, false);

    // (b) identical responses -> non-distinct hashes.
    provider.setContent(CANONICAL_CONTRIBUTION);
    const duplicate = (await captureOne(custodyStore, provider, {
      certified,
      residentId: 'resident-02',
      responseId: 'mv-b3-violation-duplicate',
      aliasCommitmentRef: 'mvb3-violation-ref-02',
    })).record;
    assert.equal(duplicate.responseHash, first.responseHash);
    const nonDistinct = verifyDropInEligibility({
      records: [first, duplicate],
      custodyStore,
    });
    assert.equal(nonDistinct.eligible, false);
    assert.equal(checkByName(nonDistinct, 'response-hashes-distinct').ok, false);
    assert.equal(checkByName(nonDistinct, 'resident-order-exact').ok, true);

    // (c) non-canonical responseText, observed AS PRODUCED (never re-canonicalized).
    const nonCanonical = verifyDropInEligibility({
      records: [
        {
          record: first,
          fixtureForm: {
            ...formOf(first),
            responseText: '{"target":"commons_cistern","amount":1,"action":"contribute_water"}',
          },
        },
        second,
      ],
      custodyStore,
    });
    assert.equal(nonCanonical.eligible, false);
    assert.equal(checkByName(nonCanonical, 'response-text-canonical-byte-equal').ok, false);
    assert.equal(checkByName(nonCanonical, 'response-text-strict-json').ok, true);

    // (d) parsedProposal mismatch.
    const badProposal = verifyDropInEligibility({
      records: [
        {
          record: first,
          fixtureForm: {
            ...formOf(first),
            parsedProposal: 'contribute_water:commons_cistern:2',
          },
        },
        second,
      ],
      custodyStore,
    });
    assert.equal(badProposal.eligible, false);
    assert.equal(checkByName(badProposal, 'parsed-proposal-matches-expected').ok, false);

    // (e) wrong type field.
    const badType = verifyDropInEligibility({
      records: [
        { record: first, fixtureForm: { ...formOf(first), type: 'captured_response' } },
        second,
      ],
      custodyStore,
    });
    assert.equal(badType.eligible, false);
    assert.equal(checkByName(badType, 'fixture-type-pinned').ok, false);

    // (f) extra key.
    const extraKey = verifyDropInEligibility({
      records: [
        { record: first, fixtureForm: { ...formOf(first), providerRouteId: 'leaked' } },
        second,
      ],
      custodyStore,
    });
    assert.equal(extraKey.eligible, false);
    assert.equal(checkByName(extraKey, 'fixture-form-exact-keys').ok, false);

    // (g) a fixture whose responseText does not hash to its record.
    const hashDrift = verifyDropInEligibility({
      records: [
        {
          record: first,
          fixtureForm: { ...formOf(first), responseText: frozen02.responseText },
        },
        second,
      ],
      custodyStore,
    });
    assert.equal(hashDrift.eligible, false);
    assert.equal(checkByName(hashDrift, 'response-hash-source-digest').ok, false);

    // (h) not an ordered pair at all.
    const arity = verifyDropInEligibility({ records: [first], custodyStore });
    assert.equal(arity.eligible, false);
    assert.equal(checkByName(arity, 'record-pair-arity').ok, false);
  } finally {
    await provider.close();
  }
});

test('drop-in check details never echo raw model text', async () => {
  // The `{record, fixtureForm}` entry shape exists so a HAND-AUTHORED
  // candidate fixture is judged exactly as produced — which is precisely the
  // case where responseText is untrusted model output. Node's JSON.parse
  // quotes a prefix of its input, and a consumer copies checks[].detail
  // verbatim into a durable receipt, so the parse failure must be projected
  // onto a closed reason set (the discipline classifyCaptureError already
  // applies in the capture lane).
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('detail-projection');
    await sealAliasCommitment({
      custodyStore,
      aliasCommitmentRef: 'mvb3-detail-ref-01',
      adapterAlias: frozen01.adapterAlias,
      salt: newSalt(),
    });
    const { record } = await captureOne(custodyStore, provider, {
      responseId: 'mv-b3-detail-01',
      aliasCommitmentRef: 'mvb3-detail-ref-01',
    });
    const SECRET = 'SECRET-PATIENT-NOTE http://192.168.0.119:18080';
    const form = buildPhase0BFixtureForm(record, custodyStore);
    const result = verifyDropInEligibility({
      records: [
        { record, fixtureForm: { ...form, responseText: `I think I should; ${SECRET}` } },
        { record, fixtureForm: { ...form, responseText: '["not","an","object"]' } },
      ],
      custodyStore,
    });
    assert.equal(result.eligible, false);
    const parseCheck = checkByName(result, 'response-text-strict-json');
    assert.equal(parseCheck.ok, false);
    assert.equal(parseCheck.detail.includes(SECRET), false, 'raw model text echoed');
    assert.equal(parseCheck.detail.includes('I think I'), false);
    assert.match(parseCheck.detail, /responseText-not-strict-json/);
    assert.match(parseCheck.detail, /responseText-not-json-object/);
    // No check detail anywhere may carry the smuggled text.
    for (const check of result.checks) {
      assert.equal(String(check.detail).includes('SECRET-PATIENT-NOTE'), false, check.name);
      assert.equal(String(check.detail).includes('192.168.0.119'), false, check.name);
    }
  } finally {
    await provider.close();
  }
});

test('blinded mode publishes a commitment and leaks no route identity', async () => {
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('blinded');
    const salt = newSalt();
    const { record } = await captureOne(custodyStore, provider, {
      blinded: true,
      routeCommitmentSalt: salt,
      responseId: 'mv-b3-blinded-01',
      aliasCommitmentRef: 'mvb3-blinded-ref-01',
    });
    const serialized = canonicalJson(record);

    assert.equal(record.routeIdentityBlinded, true);
    assert.match(record.routeCommitment, /^[a-f0-9]{64}$/);
    assert.equal(record.providerRouteEvidence.routeId, null);
    assert.equal(record.providerRouteEvidence.endpointCommitment, null);
    assert.equal(record.providerRouteEvidence.modelIdReported, null);
    assert.equal(record.providerRouteEvidence.packageVersionReported, null);
    assert.equal(record.providerRouteEvidence.processInstanceId, null);
    assert.equal(record.providerRouteEvidence.certificationReceiptHash, null);
    assert.match(record.providerRouteEvidence.serializerHash, /^[a-f0-9]{64}$/);

    // THE ENUMERABLE-DIGEST RULE, applied to the provider's own bytes. The raw
    // envelope embeds route identity (the completion id and the reported model
    // name), and the drill pins temperature and seed, so a bare sha256 over
    // those bytes is a replay-and-compare route oracle — and unlike a routeId
    // substring, no needle scan can see a digest. All four provider-correlated
    // hashes are therefore null when blinded.
    for (const key of [
      'rawResponseHash', 'rawResponseCustodyId', 'turnReceiptHash', 'priorReceiptHash',
    ]) {
      assert.equal(record[key], null, `blinded record.${key} must be null`);
    }
    assert.match(record.rawResponseCommitment, /^[a-f0-9]{64}$/);
    assert.match(record.turnReceiptCommitment, /^[a-f0-9]{64}$/);
    // The attack, executed: recompute the digest an attacker who can replay
    // the route would compute, and assert it appears NOWHERE in the record.
    const replayDigest = sha256Hex(provider.getLastResponseBytes());
    assert.equal(
      serialized.includes(replayDigest),
      false,
      'a replayable digest of the provider response bytes rides the record',
    );
    assert.notEqual(record.rawResponseCommitment, replayDigest);

    for (const needle of [
      'sovereign-holoserve-laptop',
      provider.endpoint,
      provider.host,
      'stub-model-1',
      'stub-process-1',
      '9.9.9-test',
      salt,
      'adapter_a',
      'adapter_',
    ]) {
      assert.equal(serialized.includes(needle), false, `blinded record leaks ${needle}`);
    }
    assert.equal(verifyCapturedResponseRecord(record).ok, true);

    // The sealed key-holder still has the disclosure: it lives in custody
    // only, under an ENCRYPTED label.
    const disclosures = custodyStore.listObjects().filter(
      (entry) => entry.metadataAvailable && entry.kind === ROUTE_DISCLOSURE_KIND,
    );
    assert.equal(disclosures.length, 1);
    const sealed = JSON.parse(
      custodyStore.readObject(disclosures[0].custodyId).bytes.toString('utf8'),
    );
    assert.equal(sealed.routeId, 'sovereign-holoserve-laptop');
    assert.equal(sealed.modelIdReported, 'stub-model-1');
    assert.equal(sealed.routeCommitment, record.routeCommitment);
    // Spec 216-228 evidence is RECORDED, just not published: the raw response
    // hash and the sealed custody location live in the disclosure, and both
    // published commitments re-derive from the sealed salt.
    assert.equal(sealed.rawResponseHash, replayDigest);
    assert.equal(sealed.rawResponseCustodyId, replayDigest);
    assert.match(sealed.turnReceiptHash, /^[a-f0-9]{64}$/);
    assert.equal(
      canonicalDigest({ rawResponseHash: sealed.rawResponseHash, salt }),
      record.rawResponseCommitment,
    );
    assert.equal(
      canonicalDigest({ salt, turnReceiptHash: sealed.turnReceiptHash }),
      record.turnReceiptCommitment,
    );
    // Round-trip: the sealed location still opens the real raw bytes.
    assert.ok(
      custodyStore.readObject(sealed.rawResponseCustodyId).bytes
        .equals(provider.getLastResponseBytes()),
    );
  } finally {
    await provider.close();
  }
});

test('unblinded engineering mode declares the route openly', async () => {
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('unblinded');
    const { record } = await captureOne(custodyStore, provider, {
      responseId: 'mv-b3-unblinded-01',
    });
    assert.equal(record.routeIdentityBlinded, false);
    assert.equal(record.routeCommitment, null);
    assert.equal(record.providerRouteEvidence.routeId, 'sovereign-holoserve-laptop');
    assert.equal(record.providerRouteEvidence.modelIdReported, 'stub-model-1');
    assert.equal(record.providerRouteEvidence.processInstanceId, 'stub-process-1');
    assert.equal(record.providerRouteEvidence.packageVersionReported, '9.9.9-test');
    assert.match(record.providerRouteEvidence.endpointCommitment, /^[a-f0-9]{64}$/);
    assert.match(record.providerRouteEvidence.certificationReceiptHash, /^[a-f0-9]{64}$/);
    const serialized = canonicalJson(record);
    assert.ok(serialized.includes('sovereign-holoserve-laptop'));
    // Even unblinded, no endpoint URL and no raw model text ride the record.
    assert.equal(serialized.includes(provider.endpoint), false);
    assert.equal(serialized.includes(PROSE_MARKER), false);

    // A salt supplied without blinding is refused rather than silently ignored.
    await assert.rejects(
      captureOne(custodyStore, provider, {
        responseId: 'mv-b3-unblinded-02',
        routeCommitmentSalt: newSalt(),
      }),
      ModelVillageCapturedResponseCustodyError,
    );
  } finally {
    await provider.close();
  }
});

test('no raw model text reaches the record or the fixture form', async () => {
  const provider = await startStubProvider({ content: PROSE_PADDED_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('no-raw-text');
    await sealAliasCommitment({
      custodyStore,
      aliasCommitmentRef: 'mvb3-prose-ref-01',
      adapterAlias: frozen01.adapterAlias,
      salt: newSalt(),
    });
    const { record, turnReceipt } = await captureOne(custodyStore, provider, {
      responseId: 'mv-b3-prose-01',
      aliasCommitmentRef: 'mvb3-prose-ref-01',
    });
    assert.ok(PROSE_PADDED_CONTRIBUTION.includes(PROSE_MARKER));
    assert.equal(canonicalJson(record).includes(PROSE_MARKER), false);
    assert.equal(canonicalJson(turnReceipt).includes(PROSE_MARKER), false);
    const form = buildPhase0BFixtureForm(record, custodyStore);
    assert.equal(canonicalJson(form).includes(PROSE_MARKER), false);
    assert.equal(form.responseText.includes('reason'), false);
    assert.equal(form.responseText, frozen01.responseText);
    // The prose is not lost — it is SEALED, exactly where the spec puts it.
    const rawText = custodyStore
      .readObject(record.rawResponseCustodyId).bytes.toString('utf8');
    assert.ok(rawText.includes(PROSE_MARKER));
  } finally {
    await provider.close();
  }
});

test('a tampered record fails verification', async () => {
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('tamper');
    const { record } = await captureOne(custodyStore, provider, {
      responseId: 'mv-b3-tamper-01',
    });
    assert.equal(verifyCapturedResponseRecord(record).ok, true);

    const mutations = [
      ['residentId', (copy) => { copy.residentId = 'resident-09'; }],
      ['responseHash', (copy) => { copy.responseHash = 'f'.repeat(64); }],
      ['derivationSource', (copy) => { copy.derivationSource = 'guessed'; }],
      ['chain-break', (copy) => { copy.priorReceiptHash = '0'.repeat(64); }],
      ['blinding-flip', (copy) => { copy.routeIdentityBlinded = true; }],
      ['alias-leak', (copy) => { copy.aliasCommitmentRef = 'adapter_a'; }],
      ['extra-key', (copy) => { copy.leaked = 'sovereign-holoserve-laptop'; }],
      ['sampling', (copy) => { copy.samplingEvidence.seedAcceptedEvidence = 'accepted'; }],
    ];
    for (const [name, mutate] of mutations) {
      const copy = structuredClone(record);
      mutate(copy);
      const check = verifyCapturedResponseRecord(copy);
      assert.equal(check.ok, false, `tamper '${name}' should not verify`);
      assert.ok(check.failureReason.length > 0, name);
    }

    // A mutation that is RE-SEALED with a recomputed receiptHash still fails:
    // the blinding-law scan is independent of the hash recompute.
    const resealed = structuredClone(record);
    resealed.aliasCommitmentRef = 'adapter_c';
    delete resealed.receiptHash;
    const forged = verifyCapturedResponseRecord({
      ...resealed,
      receiptHash: sha256Hex(Buffer.from(canonicalJson(resealed), 'utf8')),
    });
    assert.equal(forged.ok, false);
    assert.match(forged.failureReason, /adapter-alias namespace/);
  } finally {
    await provider.close();
  }
});

test('a failed turn yields a receipted failure and seals nothing misleading', async () => {
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('failed-turn');
    const certified = await certifiedRoute(custodyStore, provider);
    provider.setChatMode('http-500');
    const { record, turnReceipt } = await captureOne(custodyStore, provider, {
      certified,
      responseId: 'mv-b3-failed-01',
    });
    assert.equal(record, null);
    assert.equal(turnReceipt.turnCompleted, false);
    assert.equal(turnReceipt.errorClass, 'http_500');
    assert.equal(turnReceipt.responseHash, null);
    assert.equal(turnReceipt.custodyRefs.responseCustodyId, null);
    assert.equal(verifyModelTurnReceipt(turnReceipt).ok, true);
    const kinds = sealedKinds(custodyStore);
    assert.equal(kinds.includes(CANONICAL_RESPONSE_KIND), false, canonicalJson(kinds));
    assert.equal(kinds.includes(RAW_RESPONSE_KIND), false, canonicalJson(kinds));
    assert.equal(kinds.includes(ROUTE_DISCLOSURE_KIND), false, canonicalJson(kinds));
    assert.equal(custodyStore.verifyIntegrity().ok, true);
  } finally {
    await provider.close();
  }
});

test('unparseable prose fails loud instead of being scraped into a proposal', async () => {
  const provider = await startStubProvider({ content: UNPARSEABLE_PROSE });
  try {
    const custodyStore = newCustodyStore('unparseable');
    await assert.rejects(
      captureOne(custodyStore, provider, { responseId: 'mv-b3-unparseable-01' }),
      (error) => {
        assert.ok(error instanceof ModelVillageCapturedResponseCustodyError);
        assert.match(error.message, /not strict JSON/);
        // The failure message names no alias.
        assert.equal(/adapter[_-][a-z0-9]/i.test(error.message), false);
        return true;
      },
    );
    const kinds = sealedKinds(custodyStore);
    assert.equal(kinds.includes(CANONICAL_RESPONSE_KIND), false, canonicalJson(kinds));
  } finally {
    await provider.close();
  }
});

test('the fixture form refuses to invent an adapter alias', async () => {
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('alias-required');
    const certified = await certifiedRoute(custodyStore, provider);
    const withoutRef = (await captureOne(custodyStore, provider, {
      certified,
      responseId: 'mv-b3-alias-none',
    })).record;
    assert.equal(withoutRef.aliasCommitmentRef, null);
    assert.throws(
      () => buildPhase0BFixtureForm(withoutRef, custodyStore),
      ModelVillageCapturedResponseCustodyError,
    );

    const withRef = (await captureOne(custodyStore, provider, {
      certified,
      responseId: 'mv-b3-alias-unsealed',
      aliasCommitmentRef: 'mvb3-unsealed-ref',
    })).record;
    // Ref present but nothing sealed: still refuses.
    assert.throws(
      () => buildPhase0BFixtureForm(withRef, custodyStore),
      /no sealed alias commitment/,
    );

    await sealAliasCommitment({
      custodyStore,
      aliasCommitmentRef: 'mvb3-unsealed-ref',
      adapterAlias: 'adapter_b',
      salt: newSalt(),
    });
    const form = buildPhase0BFixtureForm(withRef, custodyStore);
    assert.equal(form.adapterAlias, 'adapter_b');
    // The alias came from custody, never from the public record.
    assert.equal(canonicalJson(withRef).includes('adapter_b'), false);

    // An aliasCommitmentRef that IS the alias is refused at both ends.
    await assert.rejects(
      sealAliasCommitment({
        custodyStore,
        aliasCommitmentRef: 'adapter_b',
        adapterAlias: 'adapter_b',
        salt: newSalt(),
      }),
      ModelVillageCapturedResponseCustodyError,
    );
    await assert.rejects(
      captureOne(custodyStore, provider, {
        certified,
        responseId: 'mv-b3-alias-leaky',
        aliasCommitmentRef: 'adapter_b-route',
      }),
      ModelVillageCapturedResponseCustodyError,
    );
    // A weak salt is not a commitment.
    await assert.rejects(
      sealAliasCommitment({
        custodyStore,
        aliasCommitmentRef: 'mvb3-weak-salt-ref',
        adapterAlias: 'adapter_c',
        salt: 'short',
      }),
      ModelVillageCapturedResponseCustodyError,
    );
  } finally {
    await provider.close();
  }
});

test('capture refuses an uncertified or mismatched route', async () => {
  const provider = await startStubProvider({ content: CANONICAL_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('certification-binding');
    const { certification, route } = await certifiedRoute(custodyStore, provider);
    await assert.rejects(
      captureResponseUnderCustody({
        custodyStore,
        operator: OPERATOR,
        route: { ...route, endpoint: `http://${LOOPBACK}:1` },
        certification,
        drill: bundle,
        residentId: 'resident-01',
        responseId: 'mv-b3-mismatch-01',
      }),
      /certification receipt does not bind this route/,
    );
    await assert.rejects(
      captureResponseUnderCustody({
        custodyStore,
        operator: OPERATOR,
        route,
        certification: { ...certification, certified: false },
        drill: bundle,
        residentId: 'resident-01',
        responseId: 'mv-b3-uncertified-01',
      }),
      ModelVillageCapturedResponseCustodyError,
    );
  } finally {
    await provider.close();
  }
});

test('the custody store stays integral across a full capture session', async () => {
  const provider = await startStubProvider({ content: REVERSED_CONTRIBUTION });
  try {
    const custodyStore = newCustodyStore('integrity');
    const certified = await certifiedRoute(custodyStore, provider);
    await sealAliasCommitment({
      custodyStore,
      aliasCommitmentRef: 'mvb3-integrity-ref-01',
      adapterAlias: frozen01.adapterAlias,
      salt: newSalt(),
    });
    await captureOne(custodyStore, provider, {
      certified,
      responseId: 'mv-b3-integrity-01',
      aliasCommitmentRef: 'mvb3-integrity-ref-01',
    });
    const integrity = custodyStore.verifyIntegrity();
    assert.equal(
      integrity.ok,
      true,
      canonicalJson(integrity.checks.filter((check) => !check.ok)),
    );
    assert.equal(integrity.claimBoundary.liveStudyRunClaimed, false);
  } finally {
    await provider.close();
  }
});
