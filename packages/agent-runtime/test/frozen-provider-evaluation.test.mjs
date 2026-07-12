import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA,
  FROZEN_PROVIDER_EVALUATION_SCHEMA,
  buildFrozenProviderPrompt,
  runFrozenProviderEvaluation,
  stableEvaluationJson,
} from '../src/index.mjs';

const suite = [
  { eval_id: 'route_native', instruction: 'Choose the durable native route.' },
  { eval_id: 'reject_theatre', instruction: 'Score a disposable UI-only route.' },
];

function responseContent(suffix = '') {
  return JSON.stringify({
    responses: [
      { eval_id: 'route_native', answer: `Use owned source and a local receipt${suffix}.` },
      { eval_id: 'reject_theatre', answer: `Reject it and verify the generated target${suffix}.` },
    ],
  });
}

function attestedContextFactory({ provider, contextLabel, index }) {
  return {
    complete: provider.complete.bind(provider),
    isolation: {
      schema: FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA,
      mode: 'stateless-request',
      isolationId: `fixture-isolation-${index}-${contextLabel}`,
      priorMessageCount: 0,
      attestedBy: 'fixture-harness',
    },
  };
}

test('buildFrozenProviderPrompt produces a stable provider-independent prompt', () => {
  const first = buildFrozenProviderPrompt({ promptId: 'native-route-v1', suite });
  const second = buildFrozenProviderPrompt({ promptId: 'native-route-v1', suite });

  assert.equal(first.templateSha256, second.templateSha256);
  assert.equal(first.suiteSha256, second.suiteSha256);
  assert.match(first.userPrompt, /route_native/u);
  assert.doesNotMatch(first.userPrompt, /required_signals/u);
});

test('runFrozenProviderEvaluation separates generation, local acceptance, and absorption', async () => {
  let calls = 0;
  let absorbed = null;
  const provider = {
    name: 'fixture-provider',
    async complete(_request, model, options) {
      assert.equal(options.signal.aborted, false);
      calls += 1;
      return {
        content: responseContent(`-${calls}`),
        provider: 'fixture-provider',
        model,
        reportedModel: `reported-${model}`,
        finishReason: 'stop',
        requestId: `request-${calls}`,
        usage: {
          reported: true,
          promptTokens: 100,
          completionTokens: 30,
          totalTokens: 130,
        },
        toolUses: [],
      };
    },
  };

  const receipt = await runFrozenProviderEvaluation({
    evaluationId: 'fixture-evaluation-v1',
    promptId: 'native-route-v1',
    suite,
    provider,
    model: 'fixture-model',
    createContext: attestedContextFactory,
    verifierId: 'fixture-local-verifier',
    verifier: ({ responses }) => ({
      ok: responses.every((row) => /receipt|verify/u.test(row.answer)),
      passCount: responses.length,
    }),
    absorptionId: 'fixture-memory',
    absorb: async (input) => {
      absorbed = input;
      return { ok: true, stored: true, recalled: true, contentSha256Matched: true };
    },
    now: () => new Date('2026-07-12T00:00:00.000Z'),
  });

  assert.equal(receipt.schema, FROZEN_PROVIDER_EVALUATION_SCHEMA);
  assert.equal(receipt.status, 'accepted-and-absorbed');
  assert.equal(receipt.ok, true);
  assert.equal(receipt.admissible, true);
  assert.equal(receipt.captures.length, 2);
  assert.equal(receipt.boundary.independentContextCount, 2);
  assert.equal(receipt.boundary.distinctResponseCount, 2);
  assert.equal(receipt.boundary.localAcceptanceStable, true);
  assert.equal(receipt.boundary.retrievalClaimed, false);
  assert.equal(receipt.absorption.status, 'absorbed');
  assert.equal(absorbed.responseSha256s.length, 2);
  assert.equal(receipt.providerOnlyBehavior.measured, false);
  assert.match(receipt.receiptSha256, /^sha256:[a-f0-9]{64}$/u);
});

test('runFrozenProviderEvaluation accepts JSON wrapped in a Markdown fence', async () => {
  const receipt = await runFrozenProviderEvaluation({
    evaluationId: 'fenced-json-v1',
    promptId: 'native-route-v1',
    suite,
    provider: {
      name: 'fixture-provider',
      complete: async () => ({ content: `\`\`\`json\n${responseContent()}\n\`\`\`` }),
    },
    model: 'fixture-model',
    createContext: attestedContextFactory,
    verifier: ({ responses }) => ({ ok: responses.length === suite.length }),
  });

  assert.equal(receipt.captures[0].generation.parseError, null);
  assert.equal(receipt.captures[0].verification.ok, true);
});

test('runFrozenProviderEvaluation rejects tool use and keeps absent usage unknown', async () => {
  const provider = {
    name: 'fixture-provider',
    async complete() {
      return {
        content: responseContent(),
        usage: { reported: false, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        toolUses: [{ name: 'read_file', input: { path: 'secret.txt' } }],
      };
    },
  };

  const receipt = await runFrozenProviderEvaluation({
    evaluationId: 'tool-use-rejection-v1',
    promptId: 'native-route-v1',
    suite,
    provider,
    model: 'fixture-model',
    createContext: attestedContextFactory,
    verifier: () => ({ ok: true }),
  });

  assert.equal(receipt.status, 'rejected');
  assert.equal(receipt.ok, false);
  assert.equal(receipt.captures[0].generation.toolUseCount, 1);
  assert.equal(receipt.captures[0].verification.status, 'not-run');
  assert.deepEqual(receipt.captures[0].provider.usage, {
    reported: false,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
  });
});

test('runFrozenProviderEvaluation redacts secret-shaped provider output and rejects it', async () => {
  const provider = {
    name: 'fixture-provider',
    async complete() {
      return {
        content: responseContent(' sk-example-secret-value-123456'),
        toolUses: [],
      };
    },
  };

  const receipt = await runFrozenProviderEvaluation({
    evaluationId: 'redaction-v1',
    promptId: 'native-route-v1',
    suite,
    provider,
    model: 'fixture-model',
    createContext: attestedContextFactory,
    verifier: () => ({ ok: true }),
  });

  assert.equal(receipt.status, 'rejected');
  assert.equal(receipt.secretLeakDetected, true);
  assert.equal(JSON.stringify(receipt).includes('sk-example-secret-value-123456'), false);
  assert.match(receipt.captures[0].generation.response, /REDACTED_SECRET/u);
});

test('runFrozenProviderEvaluation enforces timeout when a provider ignores abort', async () => {
  const startedAt = Date.now();
  const receipt = await runFrozenProviderEvaluation({
    evaluationId: 'timeout-v1',
    promptId: 'native-route-v1',
    suite,
    provider: { name: 'hung-provider', complete: () => new Promise(() => {}) },
    model: 'fixture-model',
    createContext: attestedContextFactory,
    verifier: () => ({ ok: true }),
    timeoutMs: 20,
  });

  assert.equal(receipt.status, 'rejected');
  assert.match(receipt.captures[0].generation.providerError, /timed out/u);
  assert.equal(Date.now() - startedAt < 500, true);
});

test('runFrozenProviderEvaluation does not classify failed absorption as a secret leak', async () => {
  const receipt = await runFrozenProviderEvaluation({
    evaluationId: 'absorption-rejection-v1',
    promptId: 'native-route-v1',
    suite,
    provider: { name: 'fixture', complete: async () => ({ content: responseContent() }) },
    model: 'fixture-model',
    createContext: attestedContextFactory,
    verifier: () => ({ ok: true }),
    absorb: () => ({ ok: false, reason: 'caller storage unavailable' }),
  });

  assert.equal(receipt.status, 'accepted-not-absorbed');
  assert.equal(receipt.secretLeakDetected, false);
  assert.equal(receipt.absorption.status, 'rejected');
});

test('runFrozenProviderEvaluation does not treat distinct labels as isolation proof', async () => {
  const serializedRequests = [];
  const provider = {
    name: 'fixture-provider',
    async complete(request) {
      serializedRequests.push(stableEvaluationJson(request));
      return {
        content: responseContent(),
        toolUses: [],
      };
    },
  };

  const receipt = await runFrozenProviderEvaluation({
    evaluationId: 'labels-alone-v1',
    promptId: 'native-route-v1',
    suite,
    provider,
    model: 'fixture-model',
    contexts: ['fresh-a', 'fresh-b'],
    verifier: () => ({ ok: true }),
    absorb: () => ({ ok: true, stored: true }),
  });

  assert.equal(serializedRequests.length, 2);
  assert.equal(serializedRequests[0], serializedRequests[1]);
  assert.deepEqual(receipt.captures.map((capture) => capture.independent), [false, false]);
  assert.deepEqual(
    receipt.captures.map((capture) => capture.isolation.status),
    ['unverified', 'unverified']
  );
  assert.equal(receipt.boundary.independentContextCount, 0);
  assert.equal(receipt.boundary.crossContextInstrumented, false);
  assert.equal(receipt.boundary.contextIsolationStatus, 'unverified');
  assert.equal(receipt.boundary.allLocallyAccepted, true);
  assert.equal(receipt.absorption.ok, true);
  assert.equal(receipt.admissible, false);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.status, 'context-isolation-unverified');
});

test('runFrozenProviderEvaluation admits attested contexts without response diversity', async () => {
  let baseProviderCalls = 0;
  let contextCalls = 0;
  const provider = {
    name: 'fixture-provider',
    async complete() {
      baseProviderCalls += 1;
      throw new Error('base provider should not receive attested context calls');
    },
  };

  const receipt = await runFrozenProviderEvaluation({
    evaluationId: 'attested-contexts-v1',
    promptId: 'native-route-v1',
    suite,
    provider,
    model: 'fixture-model',
    createContext: ({ contextLabel, index }) => ({
      complete: async () => {
        contextCalls += 1;
        return { content: responseContent(), toolUses: [] };
      },
      isolation: {
        schema: FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA,
        mode: 'fresh-session',
        isolationId: `raw-secret-session-id-${index}-${contextLabel}`,
        priorMessageCount: 0,
        attestedBy: 'fixture-harness',
      },
    }),
    verifier: () => ({ ok: true }),
    absorb: () => ({ ok: true, stored: true }),
  });

  assert.equal(baseProviderCalls, 0);
  assert.equal(contextCalls, 2);
  assert.equal(receipt.boundary.independentContextCount, 2);
  assert.equal(receipt.boundary.crossContextInstrumented, true);
  assert.equal(receipt.boundary.contextIsolationStatus, 'attested');
  assert.equal(receipt.boundary.distinctResponseCount, 1);
  assert.equal(receipt.admissible, true);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, 'accepted-and-absorbed');
  assert.equal(JSON.stringify(receipt).includes('raw-secret-session-id'), false);
});

test('runFrozenProviderEvaluation rejects duplicate isolation IDs before completion', async () => {
  let calls = 0;
  await assert.rejects(
    runFrozenProviderEvaluation({
      evaluationId: 'duplicate-isolation-v1',
      promptId: 'native-route-v1',
      suite,
      provider: {
        name: 'fixture-provider',
        complete: async () => {
          calls += 1;
          return { content: responseContent() };
        },
      },
      model: 'fixture-model',
      createContext: ({ provider }) => ({
        complete: provider.complete.bind(provider),
        isolation: {
          schema: FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA,
          mode: 'stateless-request',
          isolationId: 'duplicate-fixture-isolation',
          priorMessageCount: 0,
          attestedBy: 'fixture-harness',
        },
      }),
      verifier: () => ({ ok: true }),
    }),
    /isolationId values must be unique/u
  );
  assert.equal(calls, 0);
});

test('runFrozenProviderEvaluation requires repeated independent contexts', async () => {
  await assert.rejects(
    runFrozenProviderEvaluation({
      evaluationId: 'single-context-v1',
      promptId: 'native-route-v1',
      suite,
      provider: { name: 'fixture', complete: async () => ({ content: responseContent() }) },
      model: 'fixture-model',
      verifier: () => ({ ok: true }),
      contexts: ['only-one'],
    }),
    /at least two context labels/u
  );
});
