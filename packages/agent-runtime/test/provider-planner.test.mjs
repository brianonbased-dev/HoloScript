import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_PLANNER_PROMPT_ID,
  PROVIDER_PLANNER_SCHEMA,
  PROVIDER_PLANNER_TOOL_NAME,
  ProviderPlannerError,
  createProviderPlannerAdapter,
  createSecondBrainRuntime,
  redactRuntimeValue,
} from '../src/index.mjs';

function plannerInput() {
  return {
    intent: {
      id: 'intent-1',
      summary: 'Verify the installed public runtime',
      constraints: ['read-only'],
    },
    profile: { agentId: 'codex-consumer', family: 'openai', surface: 'codex' },
    memory: [
      {
        id: 'D.MEMORY.1',
        authorAgent: 'prior-context',
        section: 'D',
        type: 'pattern',
        domain: 'agent-runtime',
        content: 'Use probe provider-native-v1.',
        tags: ['public-consumer'],
      },
    ],
    knowledge: [{ id: 'K.1', content: 'Authorize read-only probes only.' }],
  };
}

function toolResponse(overrides = {}) {
  return {
    content: '',
    provider: 'openai',
    model: 'gpt-test',
    finishReason: 'tool_use',
    usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
    requestId: 'request-secret-value',
    toolUses: [
      {
        type: 'tool_use',
        id: 'call-1',
        name: PROVIDER_PLANNER_TOOL_NAME,
        input: {
          summary: 'Verify the public runtime',
          rationale: 'The caller supplied one read-only probe.',
          cited_memory_ids: ['memory-1'],
          cited_knowledge_ids: ['knowledge-1'],
          actions: [
            {
              type: 'verify_public_runtime',
              summary: 'Read installed package metadata',
              risk: 'read-only',
              input: { probeId: 'provider-native-v1' },
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

test('builds a frozen native-tool planner receipt without raw provider identifiers', async () => {
  let capturedRequest;
  const provider = {
    name: 'openai',
    async complete(request, model) {
      capturedRequest = { request, model };
      return toolResponse();
    },
  };
  const ticks = [1_000, 1_025];
  const planner = createProviderPlannerAdapter({
    provider,
    model: 'gpt-test',
    allowedActionTypes: ['verify_public_runtime'],
    maxActions: 1,
    maxTokens: 256,
    timeoutMs: 2_000,
    contextPolicy: { includeMemoryContent: true, includeKnowledgeContent: true },
    requireMemoryCitation: true,
    requireKnowledgeCitation: true,
    now: () => ticks.shift(),
  });

  const plan = await planner.plan(plannerInput());

  assert.equal(planner.schema, PROVIDER_PLANNER_SCHEMA);
  assert.equal(planner.prompt.id, PROVIDER_PLANNER_PROMPT_ID);
  assert.equal(capturedRequest.model, 'gpt-test');
  assert.equal(capturedRequest.request.tools[0].name, PROVIDER_PLANNER_TOOL_NAME);
  assert.deepEqual(capturedRequest.request.provider.anthropic.toolChoice, {
    type: 'tool',
    name: PROVIDER_PLANNER_TOOL_NAME,
  });
  assert.equal(capturedRequest.request.provider.openai.toolChoice, 'required');
  assert.equal(capturedRequest.request.provider.openai.parallelToolCalls, false);
  assert.match(capturedRequest.request.messages[1].content, /memory-1/u);
  assert.doesNotMatch(capturedRequest.request.messages[1].content, /D\.MEMORY\.1/u);
  assert.doesNotMatch(capturedRequest.request.messages[1].content, /prior-context/u);
  assert.doesNotMatch(capturedRequest.request.messages[1].content, /codex-consumer/u);
  assert.equal(plan.actions[0].type, 'verify_public_runtime');
  assert.equal(plan.metadata.provider.nativeToolCall, true);
  assert.equal(plan.metadata.timing.elapsedMs, 25);
  assert.equal(plan.metadata.usage.totalTokens, 165);
  assert.deepEqual(plan.metadata.grounding.citedMemoryIds, ['D.MEMORY.1']);
  assert.match(plan.metadata.generation.actionContractSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.match(plan.metadata.provider.requestIdSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(plan).includes('request-secret-value'), false);
  assert.equal(JSON.stringify(plan).includes('Use probe provider-native-v1.'), false);
});

test('rejects text fallbacks, multiple tool calls, unknown citations, and denied action types', async () => {
  for (const [expectedCode, response] of [
    ['native-tool-call-required', toolResponse({ finishReason: 'stop', toolUses: [] })],
    [
      'native-tool-call-required',
      toolResponse({ toolUses: [...toolResponse().toolUses, ...toolResponse().toolUses] }),
    ],
    [
      'ungrounded-citation',
      toolResponse({
        toolUses: [
          {
            ...toolResponse().toolUses[0],
            input: {
              ...toolResponse().toolUses[0].input,
              cited_memory_ids: ['D.NOT.SUPPLIED'],
            },
          },
        ],
      }),
    ],
    [
      'action-type-denied',
      toolResponse({
        toolUses: [
          {
            ...toolResponse().toolUses[0],
            input: {
              ...toolResponse().toolUses[0].input,
              actions: [
                {
                  type: 'delete_everything',
                  summary: 'No',
                  risk: 'destructive',
                  input: {},
                },
              ],
            },
          },
        ],
      }),
    ],
    [
      'action-risk-denied',
      toolResponse({
        toolUses: [
          {
            ...toolResponse().toolUses[0],
            input: {
              ...toolResponse().toolUses[0].input,
              actions: [
                {
                  type: 'verify_public_runtime',
                  summary: 'No',
                  risk: 'destructive',
                  input: {},
                },
              ],
            },
          },
        ],
      }),
    ],
  ]) {
    const planner = createProviderPlannerAdapter({
      provider: { complete: async () => response },
      model: 'provider-test',
      allowedActionTypes: ['verify_public_runtime'],
      requireMemoryCitation: true,
    });
    await assert.rejects(
      planner.plan(plannerInput()),
      (error) => error instanceof ProviderPlannerError && error.code === expectedCode
    );
  }
});

test('required retrieval fails closed before a provider call when recall is empty', async () => {
  let calls = 0;
  const planner = createProviderPlannerAdapter({
    provider: {
      complete: async () => {
        calls += 1;
        return toolResponse();
      },
    },
    model: 'provider-test',
    allowedActionTypes: ['verify_public_runtime'],
    requireMemoryCitation: true,
  });
  await assert.rejects(
    planner.plan({ ...plannerInput(), memory: [] }),
    (error) =>
      error instanceof ProviderPlannerError && error.code === 'retrieval-evidence-missing'
  );
  assert.equal(calls, 0);
});

test('exact request hashes change with provider request controls', async () => {
  const makePlanner = (temperature) =>
    createProviderPlannerAdapter({
      provider: { complete: async () => toolResponse() },
      model: 'provider-test',
      allowedActionTypes: ['verify_public_runtime'],
      requestOptions: { temperature },
    });
  const first = await makePlanner(0).plan(plannerInput());
  const second = await makePlanner(0.5).plan(plannerInput());
  assert.notEqual(first.metadata.prompt.requestSha256, second.metadata.prompt.requestSha256);
});

test('enforces the caller time bound', async () => {
  const planner = createProviderPlannerAdapter({
    provider: { complete: async () => new Promise(() => {}) },
    model: 'provider-test',
    allowedActionTypes: ['verify_public_runtime'],
    timeoutMs: 100,
  });
  await assert.rejects(
    planner.plan(plannerInput()),
    (error) => error instanceof ProviderPlannerError && error.code === 'provider-timeout'
  );
});

test('propagates runtime aborts as structured planner errors', async () => {
  const controller = new AbortController();
  const planner = createProviderPlannerAdapter({
    provider: { complete: async () => new Promise(() => {}) },
    model: 'provider-test',
    allowedActionTypes: ['verify_public_runtime'],
    timeoutMs: 5_000,
  });
  const pending = planner.plan({ ...plannerInput(), signal: controller.signal });
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error instanceof ProviderPlannerError && error.code === 'aborted'
  );
});

test('marks absent provider telemetry as unknown instead of synthesizing zero usage', async () => {
  const response = toolResponse({ usage: undefined, provider: undefined, model: undefined });
  const planner = createProviderPlannerAdapter({
    provider: { complete: async () => response },
    model: 'requested-model',
    allowedActionTypes: ['verify_public_runtime'],
  });
  const plan = await planner.plan(plannerInput());
  assert.deepEqual(plan.metadata.usage, {
    reported: false,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
  });
  assert.equal(plan.metadata.provider.requestedModel, 'requested-model');
  assert.equal(plan.metadata.provider.reportedModel, null);
  assert.equal(plan.metadata.provider.reportedName, null);
});

test('preserves provider planner error codes in the runtime decision network', async () => {
  const runtime = createSecondBrainRuntime({
    profile: { agentId: 'codex-consumer', family: 'openai', surface: 'codex' },
    adapters: {
      memory: { recall: async () => [], store: async () => 'G.RUNTIME.1' },
      planner: {
        plan: async () => {
          throw new ProviderPlannerError('native-tool-call-required', 'tool call absent');
        },
      },
      authority: { authorize: async () => true },
      executor: { execute: async () => ({}) },
      verifier: { verify: async () => true },
      receipts: { write: async () => {} },
    },
  });
  const receipt = await runtime.runTurn({ intent: 'Fail with a structured planner code' });
  const failure = receipt.decisionNetwork.nodes.find((node) => node.kind === 'failure');
  assert.equal(receipt.stopReason, 'plan-failed');
  assert.equal(failure.data.errorCode, 'native-tool-call-required');
  assert.equal(failure.data.errorName, 'ProviderPlannerError');
});

test('preserves safe planner telemetry in the runtime receipt while redacting secrets', async () => {
  const receipts = [];
  const runtime = createSecondBrainRuntime({
    profile: { agentId: 'codex-consumer', family: 'openai', surface: 'codex' },
    adapters: {
      memory: { recall: async () => [], store: async () => 'D.RUNTIME.2' },
      planner: {
        plan: async () => ({
          summary: 'One action',
          metadata: {
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            bounds: { maxTokens: 100 },
            apiKey: 'sk-raw-secret-value',
          },
          actions: [{ type: 'verify_public_runtime', input: {} }],
        }),
      },
      authority: { authorize: async () => true },
      executor: { execute: async () => ({ summary: 'read' }) },
      verifier: { verify: async () => true },
      receipts: { write: async (receipt) => receipts.push(receipt) },
    },
  });

  const receipt = await runtime.runTurn({ intent: 'Verify runtime telemetry' });

  assert.equal(receipt.plan.metadata.usage.promptTokens, 10);
  assert.equal(receipt.plan.metadata.bounds.maxTokens, 100);
  assert.equal(receipt.plan.metadata.apiKey, '<redacted>');
  assert.equal(receipt.decisionNetwork.nodes.find((node) => node.kind === 'plan').data.metadata.usage.totalTokens, 15);
  assert.equal(JSON.stringify(receipt).includes('sk-raw-secret-value'), false);
  assert.equal(receipts.length, 1);
  assert.deepEqual(redactRuntimeValue({ token: 'raw', totalTokens: 9 }), {
    token: '<redacted>',
    totalTokens: 9,
  });
  assert.deepEqual(redactRuntimeValue({ totalTokens: 'sk-raw-secret-value' }), {
    totalTokens: '<redacted>',
  });
});
