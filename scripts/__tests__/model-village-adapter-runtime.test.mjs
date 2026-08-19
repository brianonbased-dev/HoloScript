#!/usr/bin/env node
/* global Buffer, process, structuredClone */

// MV-B1 locked-adapter runtime tests. Fully offline: the "provider" is an
// in-process node:http OpenAI-compatible stub on 127.0.0.1 (ephemeral port).
// No live study run, no Phase 1 admission, and no blinded alias assignment is
// claimed by anything in this file.

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalDigest, canonicalJson } from '../model-village-phase0b-runtime.mjs';
import {
  ADAPTER_CERTIFICATION_SCHEMA,
  ADAPTER_RUNTIME_ENGINE,
  MODEL_TURN_RECEIPT_SCHEMA,
  ModelVillageAdapterRuntimeError,
  certifyLockedAdapterRoute,
  executeCertifiedModelTurn,
  loadAdapterCustodyDrillManifest,
  parseProposal,
  verifyAdapterCertificationReceipt,
  verifyModelTurnReceipt,
} from '../model-village-adapter-runtime.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const ownedRoot = path.join(
  repoRoot,
  '.tmp',
  'hololand',
  'model-village',
  'adapter-runtime-tests',
  `runtime-${process.pid}-${randomUUID()}`,
);
mkdirSync(ownedRoot, { recursive: true });

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// Sealed custody store: the REAL peer module, imported statically. There is
// deliberately no inline fallback — a load-time regression in the custody
// store must fail this whole suite loudly, never let it stay green against a
// substitute store (that fallback previously masked exactly that failure).
// ---------------------------------------------------------------------------

import { createSealedCustodyStore } from '../model-village-custody-store.mjs';

async function newCustodyStore(name) {
  return createSealedCustodyStore({
    rootDir: path.join(ownedRoot, `custody-${name}`),
    runLabel: 'mv-b1-adapter-runtime-test',
    operator: 'mv-b1-test-operator',
    retentionPolicy: {
      description: 'Engineering certification drill store; deletable at any time.',
      frozenAt: new Date().toISOString(),
      policyId: 'mv-b1-adapter-runtime-test-retention-v1',
    },
  });
}

// ---------------------------------------------------------------------------
// In-process OpenAI-compatible provider stub.
// ---------------------------------------------------------------------------

function respondJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
  });
  res.end(body);
}

function startStubProvider({
  chatMode = 'ok',
  chatContent = '',
  chatUsage = { completion_tokens: 21, prompt_tokens: 84, total_tokens: 105 },
} = {}) {
  const requests = { chat: 0, health: 0, models: 0 };
  let lastChatRequestBytes = null;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (req.method === 'GET' && req.url === '/health') {
        requests.health += 1;
        respondJson(res, 200, {
          process_instance_id: 'stub-process-1',
          sovereign: true,
          status: 'ok',
          version: '9.9.9-test',
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/v1/models') {
        requests.models += 1;
        respondJson(res, 200, {
          data: [{ id: 'stub-model-1', object: 'model' }],
          object: 'list',
        });
        return;
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        requests.chat += 1;
        lastChatRequestBytes = body;
        if (chatMode === 'http-500') {
          respondJson(res, 500, { error: 'stub induced failure' });
          return;
        }
        if (chatMode === 'die-mid-body') {
          // 200 headers, partial body, then a hard socket kill: the failure
          // happens DURING the body read, after fetch itself resolved.
          res.writeHead(200, {
            'content-type': 'application/json',
            'content-length': 100000,
          });
          res.write('{"choices":');
          setTimeout(() => res.destroy(), 30);
          return;
        }
        respondJson(res, 200, {
          choices: [{
            finish_reason: 'stop',
            index: 0,
            message: { content: chatContent, role: 'assistant' },
          }],
          created: 1753488000,
          id: 'chatcmpl-stub-1',
          model: 'stub-model-1',
          object: 'chat.completion',
          usage: chatUsage,
        });
        return;
      }
      respondJson(res, 404, { error: 'not found' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        endpoint: `http://127.0.0.1:${port}`,
        getLastChatRequestBytes: () => lastChatRequestBytes,
        requests,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

// Deterministic dead endpoint WITHOUT a release-then-reuse port race: the
// listener stays bound for the test's duration (no other process can be
// handed the port) and destroys every connection before any bytes flow, so
// the probe always observes a transport failure — never a stranger service.
function startRefusingProvider() {
  const server = createServer(() => {});
  server.on('connection', (socket) => socket.destroy());
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const bound = server.address();
      resolve({
        endpoint: `http://${bound.address}:${bound.port}`,
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

const validContribution = JSON.stringify({
  action: 'contribute_water',
  target: 'commons_cistern',
  amount: 1,
  reason: 'the cistern is low',
});

test('loads and closed-key validates the adapter custody drill manifest', () => {
  assert.equal(bundle.drill.schemaId, 'hololand.model-village-adapter-custody-drill.v1');
  assert.equal(bundle.drill.drillId, 'mv-b1-adapter-custody-v1');
  assert.equal(bundle.drill.lane, 'engineering_certification');
  assert.equal(bundle.drill.routesDeclaredOpenly, true);
  assert.equal(bundle.drill.sealedAliasAssignmentInScope, false);
  assert.equal(bundle.drill.studyLaneClaimed, false);
  assert.match(bundle.drill.laneStatement, /engineering certification lane/);
  assert.match(bundle.drill.laneStatement, /out of scope/);
  assert.equal(bundle.routes.length, 2);
  assert.equal(bundle.routes[0].routeId, 'sovereign-holoserve-laptop');
  assert.equal(bundle.routes[0].endpoint, 'http://127.0.0.1:8099');
  assert.equal(bundle.routes[0].required, true);
  assert.equal(bundle.routes[1].routeId, 'sovereign-holollama-jetson');
  assert.equal(bundle.routes[1].endpoint, 'http://192.168.0.119:18080');
  assert.equal(bundle.routes[1].required, false);
  for (const route of bundle.routes) {
    assert.deepEqual(route.ceilings, {
      maxOutputTokens: 256,
      retryCount: 0,
      seedRequested: 1234,
      temperature: 0,
      timeoutMs: 60000,
    });
  }
  assert.equal(bundle.prompt.systemMessagePermitted, false);
  assert.equal(bundle.prompt.messageCount, 1);
  assert.equal(bundle.prompt.messageRole, 'user');
  assert.match(bundle.prompt.promptTemplate, /\{"water": 2\}/);
  assert.equal(bundle.vocabulary.defaultDecision, 'deny');
  assert.deepEqual(bundle.vocabulary.allowedActions, ['contribute_water', 'abstain']);
  assert.deepEqual(bundle.vocabulary.deniedActions, ['send_external_message']);
  assert.match(bundle.manifestHash, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(bundle));
  assert.ok(Object.isFrozen(bundle.routes[0]));
});

test('certifies a reachable route with a verifiable sealed-evidence receipt', async () => {
  const provider = await startStubProvider({ chatContent: validContribution });
  try {
    const custodyStore = await newCustodyStore('certify-ok');
    const route = stubRoute(provider.endpoint);
    const receipt = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    assert.equal(receipt.schema, ADAPTER_CERTIFICATION_SCHEMA);
    assert.equal(receipt.engine, ADAPTER_RUNTIME_ENGINE);
    assert.equal(receipt.certified, true);
    assert.equal(receipt.failureReason, null);
    assert.equal(receipt.routeId, 'sovereign-holoserve-laptop');
    assert.equal(receipt.fallbackDisabled, true);
    assert.equal(receipt.fallbackEvidence, 'no-fallback-code-path-single-endpoint');
    assert.equal(receipt.hiddenPromptEnhancement, 'none-request-bytes-hashed');
    // Honesty: the engine never probes cache control, so the receipt may
    // only assert that no probe ran — never an unprobed provider capability.
    assert.deepEqual(receipt.cacheStateEvidence, {
      providerCacheControlProbed: false,
      state: 'unknown_contamination_receipted',
    });
    assert.equal(receipt.revisionEvidence.tier, 'server-reported');
    assert.equal(receipt.revisionEvidence.modelIdReported, 'stub-model-1');
    assert.equal(receipt.revisionEvidence.processInstanceId, 'stub-process-1');
    assert.equal(receipt.revisionEvidence.packageVersionReported, '9.9.9-test');
    assert.equal(receipt.revisionEvidence.evidenceCustodyIds.length, 2);
    assert.equal(
      receipt.promptTemplateHash,
      sha256Hex(Buffer.from(bundle.prompt.promptTemplate, 'utf8')),
    );
    // 'model' is conditional on the optional models probe reporting an id,
    // so the descriptor declares it optional instead of pinning a request
    // key the wire bytes may omit.
    assert.equal(receipt.serializerHash, canonicalDigest({
      messageShape: ['content', 'role'],
      optionalRequestFields: { model: 'present-only-when-model-id-reported' },
      requestShape: ['max_tokens', 'messages', 'seed', 'temperature'],
      serializerVersion: 'mv-b1-serializer-v1',
      transport: 'openai-chat-completions-v1',
    }));

    // Sealed probe evidence decrypts to server-reported payloads.
    const healthRead = await custodyStore.readObject(
      receipt.revisionEvidence.evidenceCustodyIds[0],
    );
    assert.equal(JSON.parse(healthRead.bytes.toString('utf8')).status, 'ok');

    // receiptHash recomputes over receipt-minus-receiptHash.
    const { receiptHash, ...unsigned } = receipt;
    assert.equal(canonicalDigest(unsigned), receiptHash);
    assert.deepEqual(verifyAdapterCertificationReceipt(receipt), {
      ok: true,
      failureReason: null,
    });
  } finally {
    await provider.close();
  }
});

test('sealed request bytes equal wire bytes and promptHash binds them', async () => {
  const provider = await startStubProvider({ chatContent: validContribution });
  try {
    const custodyStore = await newCustodyStore('turn-ok');
    const route = stubRoute(provider.endpoint);
    const certification = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    const turn = await executeCertifiedModelTurn({
      route,
      certification,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
      priorReceiptHash: certification.receiptHash,
    });

    assert.equal(turn.schema, MODEL_TURN_RECEIPT_SCHEMA);
    assert.equal(turn.turnCompleted, true);
    assert.equal(turn.errorClass, null);
    assert.equal(turn.retries, 0);
    assert.equal(turn.priorReceiptHash, certification.receiptHash);
    assert.equal(turn.proposalDecision, 'valid_proposal');
    assert.deepEqual(turn.generationParameters, {
      maxOutputTokens: 256,
      seedAcceptedEvidence: 'unverified',
      seedRequested: 1234,
      temperature: 0,
    });

    // Hidden-prompt-enhancement guard: the exact bytes observed on the wire
    // are the sealed custody bytes and are the bytes promptHash covers.
    const wireBytes = provider.getLastChatRequestBytes();
    const sealedRequest = await custodyStore.readObject(
      turn.custodyRefs.requestCustodyId,
    );
    assert.ok(wireBytes.equals(sealedRequest.bytes));
    assert.equal(turn.promptHash, sha256Hex(wireBytes));
    assert.equal(turn.promptHash, sha256Hex(sealedRequest.bytes));

    // The wire request is the rendered template with no additions and no
    // system message.
    const wireRequest = JSON.parse(wireBytes.toString('utf8'));
    assert.deepEqual(
      Object.keys(wireRequest).sort(),
      ['max_tokens', 'messages', 'model', 'seed', 'temperature'],
    );
    assert.equal(wireRequest.messages.length, 1);
    assert.equal(wireRequest.messages[0].role, 'user');
    assert.equal(wireRequest.messages[0].content, bundle.prompt.promptTemplate);
    assert.equal(wireRequest.model, 'stub-model-1');
    assert.equal(wireRequest.temperature, 0);
    assert.equal(wireRequest.max_tokens, 256);
    assert.equal(wireRequest.seed, 1234);

    // Sealed response bytes recompute responseHash.
    const sealedResponse = await custodyStore.readObject(
      turn.custodyRefs.responseCustodyId,
    );
    assert.equal(turn.responseHash, sha256Hex(sealedResponse.bytes));

    // Public receipt carries a bounded proposal projection, never raw model
    // text: the free-form reason appears only as hash + length.
    assert.deepEqual(turn.parsedProposal, {
      action: 'contribute_water',
      amount: 1,
      reasonLength: 'the cistern is low'.length,
      reasonSha256: sha256Hex(Buffer.from('the cistern is low', 'utf8')),
      target: 'commons_cistern',
    });
    assert.ok(!canonicalJson(turn).includes('the cistern is low'));
    assert.deepEqual(turn.usageReported, {
      completion_tokens: 21,
      prompt_tokens: 84,
      total_tokens: 105,
    });
    assert.deepEqual(verifyModelTurnReceipt(turn), { ok: true, failureReason: null });
  } finally {
    await provider.close();
  }
});

test('HTTP 500 yields a failed turn receipt after exactly one request', async () => {
  const provider = await startStubProvider({ chatMode: 'http-500' });
  try {
    const custodyStore = await newCustodyStore('turn-500');
    const route = stubRoute(provider.endpoint);
    const certification = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    const turn = await executeCertifiedModelTurn({
      route,
      certification,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    // Zero-retry guard, counted server-side.
    assert.equal(provider.requests.chat, 1);
    assert.equal(turn.turnCompleted, false);
    assert.equal(turn.errorClass, 'http_500');
    assert.equal(turn.retries, 0);
    assert.equal(turn.responseHash, null);
    assert.equal(turn.custodyRefs.responseCustodyId, null);
    assert.equal(turn.parsedProposal, null);
    assert.equal(turn.proposalDecision, 'not_evaluated');
    // The request was still serialized once, sealed, and hashed.
    const sealedRequest = await custodyStore.readObject(
      turn.custodyRefs.requestCustodyId,
    );
    assert.equal(turn.promptHash, sha256Hex(sealedRequest.bytes));
    assert.deepEqual(verifyModelTurnReceipt(turn), { ok: true, failureReason: null });
  } finally {
    await provider.close();
  }
});

test('parseProposal is strict, closed-key, and default deny', () => {
  const { vocabulary } = bundle;
  const valid = parseProposal(validContribution, vocabulary);
  assert.equal(valid.decision, 'valid_proposal');
  assert.deepEqual(valid.parsed, {
    action: 'contribute_water',
    amount: 1,
    reason: 'the cistern is low',
    target: 'commons_cistern',
  });

  const abstain = parseProposal(
    JSON.stringify({ action: 'abstain', target: null, amount: null, reason: 'keeping reserve' }),
    vocabulary,
  );
  assert.equal(abstain.decision, 'valid_proposal');
  assert.deepEqual(abstain.parsed, {
    action: 'abstain',
    amount: null,
    reason: 'keeping reserve',
    target: null,
  });

  const denies = [
    [`Sure! Here is my move: ${validContribution}`, 'proposal-not-exactly-one-json-object'],
    [`${validContribution} trailing prose`, 'proposal-not-exactly-one-json-object'],
    ['not json at all', 'proposal-not-exactly-one-json-object'],
    ['[1,2,3]', 'proposal-not-a-json-object'],
    [
      JSON.stringify({
        action: 'contribute_water',
        target: 'commons_cistern',
        amount: 1,
        reason: 'ok',
        extra: 'key',
      }),
      'proposal-keys-not-closed',
    ],
    [
      JSON.stringify({ action: 'contribute_water', target: 'commons_cistern', amount: 1 }),
      'proposal-keys-not-closed',
    ],
    [
      JSON.stringify({
        action: 'send_external_message',
        target: 'commons_cistern',
        amount: 1,
        reason: 'ok',
      }),
      'denied-action',
    ],
    [
      JSON.stringify({ action: 'dance', target: 'commons_cistern', amount: 1, reason: 'ok' }),
      'unknown-action',
    ],
    [
      JSON.stringify({ action: 'contribute_water', target: 'river', amount: 1, reason: 'ok' }),
      'unknown-target',
    ],
    [
      JSON.stringify({
        action: 'contribute_water',
        target: 'commons_cistern',
        amount: 2,
        reason: 'ok',
      }),
      'amount-out-of-bounds',
    ],
    [
      JSON.stringify({
        action: 'contribute_water',
        target: 'commons_cistern',
        amount: 1,
        reason: 'x'.repeat(241),
      }),
      'proposal-reason-not-short-string',
    ],
    [
      JSON.stringify({
        action: 'abstain',
        target: 'commons_cistern',
        amount: null,
        reason: 'ok',
      }),
      'null-shape-action-requires-null-target-and-amount',
    ],
  ];
  for (const [text, expectedReason] of denies) {
    const outcome = parseProposal(text, vocabulary);
    assert.equal(outcome.decision, 'deny', `expected deny for ${text.slice(0, 60)}`);
    assert.equal(outcome.reason, expectedReason);
  }
});

test('tampered receipts fail verification', async () => {
  const provider = await startStubProvider({ chatContent: validContribution });
  try {
    const custodyStore = await newCustodyStore('tamper');
    const route = stubRoute(provider.endpoint);
    const certification = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    const turn = await executeCertifiedModelTurn({
      route,
      certification,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });

    const tamperedCert = { ...certification, certified: false };
    assert.equal(verifyAdapterCertificationReceipt(tamperedCert).ok, false);
    const extraKeyCert = { ...certification, injected: true };
    assert.equal(verifyAdapterCertificationReceipt(extraKeyCert).ok, false);
    const wrongSchemaCert = { ...certification, schema: 'hololand.other.v1' };
    assert.equal(verifyAdapterCertificationReceipt(wrongSchemaCert).ok, false);

    const tamperedTurn = { ...turn, proposalDecision: 'deny' };
    assert.equal(verifyModelTurnReceipt(tamperedTurn).ok, false);
    const { latencyMs, ...droppedKeyTurn } = turn;
    assert.equal(typeof latencyMs, 'number');
    assert.equal(verifyModelTurnReceipt(droppedKeyTurn).ok, false);
    const retriedTurn = { ...turn, retries: 1 };
    assert.equal(verifyModelTurnReceipt(retriedTurn).ok, false);
    assert.equal(verifyModelTurnReceipt(null).ok, false);
  } finally {
    await provider.close();
  }
});

test('unreachable endpoint certifies false without throwing', async () => {
  const refusing = await startRefusingProvider();
  try {
    const custodyStore = await newCustodyStore('unreachable');
    const route = stubRoute(refusing.endpoint, 3000);
    const receipt = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    assert.equal(receipt.certified, false);
    assert.equal(typeof receipt.failureReason, 'string');
    assert.match(receipt.failureReason, /^health_probe_unreachable:/);
    assert.deepEqual(receipt.revisionEvidence.evidenceCustodyIds, []);
    assert.equal(receipt.revisionEvidence.modelIdReported, null);
    assert.deepEqual(verifyAdapterCertificationReceipt(receipt), {
      ok: true,
      failureReason: null,
    });
  } finally {
    await refusing.close();
  }
});

test('an uncertified route refuses to execute a model turn', async () => {
  const refusing = await startRefusingProvider();
  try {
    const custodyStore = await newCustodyStore('refuse-uncertified');
    const route = stubRoute(refusing.endpoint, 3000);
    const failedCertification = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    assert.equal(failedCertification.certified, false);
    await assert.rejects(
      executeCertifiedModelTurn({
        route,
        certification: failedCertification,
        drill: bundle,
        custodyStore,
        operator: 'mv-b1-test-operator',
      }),
      (error) => {
        assert.ok(error instanceof ModelVillageAdapterRuntimeError);
        assert.match(error.message, /not certified/);
        return true;
      },
    );
  } finally {
    await refusing.close();
  }
});

test('repeated turns against one store reuse custody instead of throwing', async () => {
  // Blocker regression: identical request bytes (same route + certification,
  // as the six-resident lane replays one prompt) previously hard-threw
  // CustodyDuplicateObjectError past the receipt boundary on turn two.
  const provider = await startStubProvider({ chatContent: validContribution });
  try {
    const custodyStore = await newCustodyStore('repeat-turns');
    const route = stubRoute(provider.endpoint);
    const certification = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    const turnOne = await executeCertifiedModelTurn({
      route,
      certification,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
      priorReceiptHash: certification.receiptHash,
    });
    const turnTwo = await executeCertifiedModelTurn({
      route,
      certification,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
      priorReceiptHash: turnOne.receiptHash,
    });
    assert.equal(turnOne.turnCompleted, true);
    assert.equal(turnTwo.turnCompleted, true);
    assert.equal(provider.requests.chat, 2, 'each turn issued exactly one request');
    // Content-addressing: identical request bytes share one custody object.
    assert.equal(
      turnTwo.custodyRefs.requestCustodyId,
      turnOne.custodyRefs.requestCustodyId,
    );
    assert.equal(turnTwo.promptHash, turnOne.promptHash);
    assert.deepEqual(verifyModelTurnReceipt(turnOne), { ok: true, failureReason: null });
    assert.deepEqual(verifyModelTurnReceipt(turnTwo), { ok: true, failureReason: null });
  } finally {
    await provider.close();
  }
});

test('byte-identical health payloads across two endpoints both certify', async () => {
  // Regression: the second route sealing the same health bytes into one
  // content-addressed store was previously misreceipted as
  // health_probe_unreachable:CustodyDuplicateObjectError.
  const providerA = await startStubProvider({ chatContent: validContribution });
  const providerB = await startStubProvider({ chatContent: validContribution });
  try {
    const custodyStore = await newCustodyStore('same-health-bytes');
    const receiptA = await certifyLockedAdapterRoute({
      route: stubRoute(providerA.endpoint),
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    const receiptB = await certifyLockedAdapterRoute({
      route: stubRoute(providerB.endpoint),
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    assert.equal(receiptA.certified, true);
    assert.equal(receiptB.certified, true);
    assert.equal(receiptB.failureReason, null);
    // Identical bytes are shared custody objects, not failures.
    assert.deepEqual(
      receiptB.revisionEvidence.evidenceCustodyIds,
      receiptA.revisionEvidence.evidenceCustodyIds,
    );
    assert.deepEqual(verifyAdapterCertificationReceipt(receiptB), {
      ok: true,
      failureReason: null,
    });
  } finally {
    await providerA.close();
    await providerB.close();
  }
});

test('custody seal failure is receipted as evidence_seal_failed, not unreachable', async () => {
  const provider = await startStubProvider({ chatContent: validContribution });
  try {
    const realStore = await newCustodyStore('seal-failure');
    const failingStore = {
      readObject: (custodyId) => realStore.readObject(custodyId),
      sealObject: () => {
        const error = new Error('simulated store I/O failure');
        error.name = 'CustodyStoreError';
        throw error;
      },
    };
    const receipt = await certifyLockedAdapterRoute({
      route: stubRoute(provider.endpoint),
      drill: bundle,
      custodyStore: failingStore,
      operator: 'mv-b1-test-operator',
    });
    assert.equal(receipt.certified, false);
    // The endpoint answered; the receipt must say the SEAL failed, never
    // launder a custody failure into a false unreachability claim.
    assert.equal(receipt.failureReason, 'evidence_seal_failed:CustodyStoreError');
    assert.deepEqual(receipt.revisionEvidence.evidenceCustodyIds, []);
    assert.deepEqual(verifyAdapterCertificationReceipt(receipt), {
      ok: true,
      failureReason: null,
    });
  } finally {
    await provider.close();
  }
});

test('mid-body transport death yields a failed-turn receipt, not a throw', async () => {
  const provider = await startStubProvider({ chatMode: 'die-mid-body' });
  try {
    const custodyStore = await newCustodyStore('mid-body-death');
    const route = stubRoute(provider.endpoint);
    const certification = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    const turn = await executeCertifiedModelTurn({
      route,
      certification,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    assert.equal(turn.turnCompleted, false);
    assert.equal(turn.errorClass, 'transport_error');
    assert.equal(turn.proposalReason, 'response-body-read-failed');
    assert.equal(turn.responseHash, null);
    assert.equal(turn.custodyRefs.responseCustodyId, null);
    // The request was still serialized once, sealed, and hashed.
    const sealedRequest = await custodyStore.readObject(
      turn.custodyRefs.requestCustodyId,
    );
    assert.equal(turn.promptHash, sha256Hex(sealedRequest.bytes));
    assert.deepEqual(verifyModelTurnReceipt(turn), { ok: true, failureReason: null });
  } finally {
    await provider.close();
  }
});

test('provider-controlled usage is projected to closed integer token counts', async () => {
  const rawMarker = 'RAW-MODEL-TEXT-MARKER: scratchpad reasoning leak';
  const provider = await startStubProvider({
    chatContent: validContribution,
    chatUsage: {
      completion_tokens: 5,
      nested: { deeper: { leak: rawMarker } },
      prompt_tokens: 'not-a-count',
      total_tokens: 7.5,
      verbose_echo: rawMarker.repeat(4),
    },
  });
  try {
    const custodyStore = await newCustodyStore('hostile-usage');
    const route = stubRoute(provider.endpoint);
    const certification = await certifyLockedAdapterRoute({
      route,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    const turn = await executeCertifiedModelTurn({
      route,
      certification,
      drill: bundle,
      custodyStore,
      operator: 'mv-b1-test-operator',
    });
    assert.equal(turn.turnCompleted, true);
    // Only closed integer token counts survive into the public receipt.
    assert.deepEqual(turn.usageReported, { completion_tokens: 5 });
    assert.ok(!canonicalJson(turn).includes('RAW-MODEL-TEXT-MARKER'));
    assert.deepEqual(verifyModelTurnReceipt(turn), { ok: true, failureReason: null });

    // Shape enforcement: even a RE-SIGNED receipt (valid hash) carrying
    // non-token-count usage content must fail verification.
    const resign = (mutate) => {
      const clone = structuredClone(turn);
      mutate(clone);
      const { receiptHash: droppedHash, ...unsigned } = clone;
      assert.equal(typeof droppedHash, 'string');
      return { ...unsigned, receiptHash: canonicalDigest(unsigned) };
    };
    const smuggled = resign((clone) => {
      clone.usageReported = { completion_tokens: 5, verbose_echo: rawMarker };
    });
    assert.equal(verifyModelTurnReceipt(smuggled).ok, false);
    const nonInteger = resign((clone) => {
      clone.usageReported = { completion_tokens: 'five' };
    });
    assert.equal(verifyModelTurnReceipt(nonInteger).ok, false);
    const emptyUsage = resign((clone) => {
      clone.usageReported = {};
    });
    assert.equal(verifyModelTurnReceipt(emptyUsage).ok, false);
  } finally {
    await provider.close();
  }
});

test('malformed vocabulary fails loud and typed before any provider call', async () => {
  // parseProposal misuse is a typed validation error, never a bare TypeError.
  assert.throws(
    () => parseProposal(validContribution, {}),
    ModelVillageAdapterRuntimeError,
  );
  // The turn path rejects the malformed bundle BEFORE contacting a provider.
  const custodyStore = await newCustodyStore('bad-vocabulary');
  let fetchCalls = 0;
  await assert.rejects(
    executeCertifiedModelTurn({
      route: stubRoute('http://192.0.2.1:9'),
      certification: null,
      drill: { ...bundle, vocabulary: { bogus: true } },
      custodyStore,
      operator: 'mv-b1-test-operator',
      fetchImpl: () => {
        fetchCalls += 1;
        throw new Error('must not be reached');
      },
    }),
    ModelVillageAdapterRuntimeError,
  );
  assert.equal(fetchCalls, 0, 'no provider interaction may precede validation');
});

test.after(() => {
  rmSync(ownedRoot, { recursive: true, force: true });
});
