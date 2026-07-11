import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DECISION_NETWORK_SCHEMA,
  SECOND_BRAIN_LOOP_RECEIPT_SCHEMA,
  SECOND_BRAIN_RUNTIME_SCHEMA,
  SECOND_BRAIN_TURN_RECEIPT_SCHEMA,
  createSecondBrainRuntime,
} from '../src/index.mjs';

function deterministicIds() {
  let index = 0;
  return (prefix) => `${prefix}-${++index}`;
}

function baseAdapters({ nextWork = null } = {}) {
  const stored = [];
  const receipts = [];
  return {
    stored,
    receipts,
    adapters: {
      memory: {
        recall: async () => [],
        store: async (entry) => {
          stored.push(entry);
          return `memory-${stored.length}`;
        },
      },
      planner: {
        plan: async () => ({
          summary: 'Run one verified action',
          actions: [{ type: 'inspect', summary: 'Inspect public state' }],
        }),
      },
      authority: { authorize: async () => ({ allowed: true, reason: 'within caller policy' }) },
      executor: { execute: async () => ({ summary: 'inspection complete' }) },
      verifier: { verify: async () => ({ ok: true, summary: 'evidence accepted' }) },
      receipts: {
        write: async (receipt) => {
          receipts.push(receipt);
        },
      },
      ...(nextWork ? { nextWork } : {}),
    },
  };
}

test('second-brain turn preserves wiring order, adapter handoff, and redacted receipts', async () => {
  const telemetryKinds = [];
  const stored = [];
  const published = [];
  const delivered = [];
  let plannerInput = null;
  let executorInput = null;
  let verifierInput = null;

  const runtime = createSecondBrainRuntime({
    profile: {
      agentId: 'codex-public-consumer',
      family: 'openai',
      surface: 'codex',
      model: 'caller-selected',
      metadata: { bearerToken: 'never-emit-this' },
    },
    adapters: {
      memory: {
        recall: async () => [
          {
            id: 'D.TEST.1',
            authorAgent: 'claude-public-consumer',
            section: 'D',
            type: 'pattern',
            content: 'Use the public registry artifact.',
            tags: ['public-package'],
          },
        ],
        store: async (entry) => {
          stored.push(entry);
          return 'D.TEST.2';
        },
      },
      knowledge: {
        search: async () => [{ id: 'K.1', content: 'Cold installs are delivery proof.' }],
        publish: async (entry) => {
          published.push(entry);
          return 'K.2';
        },
      },
      planner: {
        plan: async (input) => {
          plannerInput = input;
          return {
            summary: 'Inspect and verify the public package',
            rationale: 'The registry is the consumer boundary.',
            actions: [
              {
                id: 'inspect-package',
                type: 'registry-inspect',
                summary: 'Inspect registry metadata',
                risk: 'read-only',
                input: { package: '@holoscript/memory', token: 'raw-adapter-secret' },
              },
            ],
          };
        },
      },
      authority: {
        authorize: async ({ action }) => {
          assert.equal(action.input.token, 'raw-adapter-secret');
          return {
            allowed: true,
            reason: 'read-only action',
            evidence: { policy: 'consumer-read' },
          };
        },
      },
      executor: {
        execute: async (input) => {
          executorInput = input;
          return { summary: 'registry returned 0.1.0', password: 'result-secret' };
        },
      },
      verifier: {
        verify: async (input) => {
          verifierInput = input;
          assert.equal(input.result.password, 'result-secret');
          return {
            ok: true,
            summary: 'version and integrity matched',
            evidence: { sha256: 'abc123' },
          };
        },
      },
      telemetry: {
        emit: async ({ node }) => {
          telemetryKinds.push(node.kind);
        },
      },
      receipts: {
        write: async (receipt) => {
          delivered.push(receipt);
        },
      },
      nextWork: {
        farm: async ({ status, actions }) => {
          assert.equal(status, 'completed');
          assert.equal(actions[0].verification.ok, true);
          return { items: [{ summary: 'Run the same proof on another profile' }] };
        },
      },
    },
    idFactory: deterministicIds(),
    clock: () => '2026-07-11T00:00:00.000Z',
  });

  const receipt = await runtime.runTurn({
    intent: {
      summary: 'Prove the package from a cold consumer',
      metadata: { apiKey: 'intent-secret' },
    },
  });

  assert.equal(runtime.schema, SECOND_BRAIN_RUNTIME_SCHEMA);
  assert.equal(receipt.schema, SECOND_BRAIN_TURN_RECEIPT_SCHEMA);
  assert.equal(receipt.decisionNetwork.schema, DECISION_NETWORK_SCHEMA);
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.ok, true);
  assert.equal(receipt.memory.storedMemoryId, 'D.TEST.2');
  assert.equal(receipt.knowledge.published, true);
  assert.equal(receipt.nextWork.items[0].summary, 'Run the same proof on another profile');
  assert.equal(plannerInput.memory[0].content, 'Use the public registry artifact.');
  assert.equal(plannerInput.knowledge[0].id, 'K.1');
  assert.equal(executorInput.action.id, 'inspect-package');
  assert.equal(verifierInput.result.summary, 'registry returned 0.1.0');
  assert.equal(stored.length, 1);
  assert.equal(published.length, 1);
  assert.equal(delivered.length, 1);
  assert.deepEqual(telemetryKinds, [
    'intent',
    'memory-recall',
    'knowledge-recall',
    'plan',
    'authority',
    'act',
    'verify',
    'remember',
    'knowledge-publish',
    'next-work',
    'receipt',
  ]);
  assert.equal(receipt.decisionNetwork.edges.length, receipt.decisionNetwork.nodes.length - 1);
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes('never-emit-this'), false);
  assert.equal(serialized.includes('raw-adapter-secret'), false);
  assert.equal(serialized.includes('result-secret'), false);
  assert.equal(serialized.includes('intent-secret'), false);
});

test('authority denial blocks execution but still remembers and receipts the decision', async () => {
  const fixture = baseAdapters();
  let executionCount = 0;
  fixture.adapters.authority.authorize = async () => ({
    allowed: false,
    reason: 'operator review required',
  });
  fixture.adapters.executor.execute = async () => {
    executionCount += 1;
    return { summary: 'should not run' };
  };
  const runtime = createSecondBrainRuntime({
    profile: { agentId: 'claude-consumer', family: 'anthropic', surface: 'claude' },
    adapters: fixture.adapters,
    idFactory: deterministicIds(),
  });

  const receipt = await runtime.runTurn({ intent: 'Attempt a governed operation' });

  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.stopReason, 'authority-denied');
  assert.equal(executionCount, 0);
  assert.equal(receipt.decisions[0].allowed, false);
  assert.equal(fixture.stored[0].type, 'gotcha');
  assert.equal(fixture.receipts.length, 1);
});

test('verification failure invokes recovery and records a failed turn', async () => {
  const fixture = baseAdapters();
  const recoveries = [];
  fixture.adapters.verifier.verify = async () => ({
    ok: false,
    summary: 'expected digest was absent',
  });
  fixture.adapters.recovery = {
    recover: async (input) => {
      recoveries.push(input);
      return { summary: 'Preserve evidence and farm a repair task', retry: false };
    },
  };
  const runtime = createSecondBrainRuntime({
    profile: { agentId: 'edge-builder', family: 'holoscript', nodeProfile: 'jetson-reference' },
    adapters: fixture.adapters,
    idFactory: deterministicIds(),
  });

  const receipt = await runtime.runTurn({ intent: 'Verify an owned-metal deployment' });

  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.stopReason, 'verification-failed');
  assert.equal(recoveries.length, 1);
  assert.match(receipt.recovery.summary, /Preserve evidence/u);
  assert.equal(fixture.stored[0].section, 'G');
  assert(receipt.decisionNetwork.nodes.some((node) => node.kind === 'recovery'));
});

test('bounded autonomous loop runs the same contract across agent families', async () => {
  for (const profile of [
    { agentId: 'claude-seat', family: 'anthropic', surface: 'claude' },
    { agentId: 'codex-seat', family: 'openai', surface: 'codex' },
    {
      agentId: 'jetson-seat',
      family: 'holoscript',
      surface: 'edge-agent',
      nodeProfile: 'jetson-reference',
    },
    { agentId: 'cloud-seat', family: 'other', surface: 'cloud-agent' },
  ]) {
    let farmCount = 0;
    const fixture = baseAdapters({
      nextWork: {
        farm: async () => {
          farmCount += 1;
          return farmCount === 1 ? { summary: 'Second bounded turn' } : null;
        },
      },
    });
    const runtime = createSecondBrainRuntime({
      profile,
      adapters: fixture.adapters,
      limits: { maxTurns: 3 },
      idFactory: deterministicIds(),
    });

    const loop = await runtime.runLoop({ initialIntent: 'First bounded turn' });

    assert.equal(loop.schema, SECOND_BRAIN_LOOP_RECEIPT_SCHEMA);
    assert.equal(loop.status, 'completed');
    assert.equal(loop.stopReason, 'no-next-work');
    assert.equal(loop.turnCount, 2);
    assert.equal(loop.profile.family, profile.family);
    assert.equal(fixture.receipts.length, 3);
  }
});
