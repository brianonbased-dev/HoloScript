import { describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_MANAGED_AGENTS_BETA_HEADER,
  ClaudeManagedAgentAdapter,
  applyExternalAgentValidation,
  createExternalAgentReceipt,
  createClaudeManagedAgentsSdkClient,
  promoteExternalAgentReceipt,
  type ClaudeManagedAgentClient,
  type ClaudeManagedAgentCreateSessionInput,
  type ClaudeManagedAgentUserEvent,
  type ClaudeManagedAgentsSdk,
  type ExternalAgentValidationResult,
} from '../ExternalAgentAdapter';

function makeClient(): ClaudeManagedAgentClient & {
  created: ClaudeManagedAgentCreateSessionInput[];
  sent: Array<{ sessionId: string; event: ClaudeManagedAgentUserEvent }>;
} {
  const created: ClaudeManagedAgentCreateSessionInput[] = [];
  const sent: Array<{ sessionId: string; event: ClaudeManagedAgentUserEvent }> = [];
  return {
    created,
    sent,
    async createSession(input) {
      created.push(input);
      return {
        id: 'sesn_fixture',
        status: 'idle',
        agentId: typeof input.agent === 'string' ? input.agent : input.agent.id,
        environmentId: input.environmentId,
      };
    },
    async sendUserEvent(sessionId, event) {
      sent.push({ sessionId, event });
    },
    async retrieveSession() {
      return {
        id: 'sesn_fixture',
        status: 'idle',
        agentId: 'agnt_fixture',
        environmentId: 'env_fixture',
      };
    },
    async listEvents() {
      return [
        {
          id: 'evt_1',
          type: 'user.message',
          processedAt: '2026-05-06T00:00:00Z',
          payload: { redacted: true },
        },
        {
          id: 'evt_2',
          type: 'agent.message',
          processedAt: '2026-05-06T00:00:01Z',
          summary: 'wrote a draft',
          payload: { text: 'Draft output' },
        },
      ];
    },
    async listArtifacts() {
      return [
        {
          id: 'file_1',
          path: 'draft.md',
          type: 'markdown',
          producer: 'agnt_fixture',
          content: 'Draft output\n',
          validator: 'local-fixture',
        },
      ];
    },
    async listOutcomes() {
      return [
        {
          id: 'outcome_1',
          score: 0.72,
          passed: false,
          criteria: [{ id: 'evidence', score: 0.72, passed: false, gap: 'Needs citations.' }],
        },
      ];
    },
  };
}

describe('ClaudeManagedAgentAdapter', () => {
  it('launches a session and captures a quarantined ExternalAgentReceipt', async () => {
    const client = makeClient();
    const adapter = new ClaudeManagedAgentAdapter({
      client,
      agentId: 'agnt_fixture',
      environmentId: 'env_fixture',
      model: 'claude-opus-4-7',
      now: () => new Date('2026-05-06T00:00:02Z'),
    });

    const receipt = await adapter.launchAndRead({
      taskId: 'task_fixture',
      prompt: 'Draft the benchmark section.',
      metadata: { benchmark: 'managed-agent-fixture' },
    });

    expect(client.created[0]).toMatchObject({ agent: 'agnt_fixture', environmentId: 'env_fixture' });
    expect(client.sent[0].sessionId).toBe('sesn_fixture');
    expect(client.sent[0].event.content[0].text).toBe('Draft the benchmark section.');
    expect(receipt.provider).toBe('anthropic.claude-managed-agents');
    expect(receipt.agent.betaHeader).toBe(CLAUDE_MANAGED_AGENTS_BETA_HEADER);
    expect(receipt.session.id).toBe('sesn_fixture');
    expect(receipt.events).toHaveLength(2);
    expect(receipt.artifacts[0]).toMatchObject({ path: 'draft.md', hashKind: 'sha256-content' });
    expect(receipt.artifacts[0].hash).toHaveLength(64);
    expect(receipt.outcomes[0].score).toBe(0.72);
    expect(receipt.quarantine.state).toBe('quarantined');
    expect(receipt.persistentMemoryWriteAllowed).toBe(false);
    expect(receipt.request.promptHash).toHaveLength(64);
  });

  it('validates locally before MemoryReceipt promotion and never enables direct memory writes', () => {
    const receipt = createExternalAgentReceipt({
      provider: 'anthropic.claude-managed-agents',
      agent: { id: 'agnt_fixture', vendor: 'anthropic' },
      session: { id: 'sesn_fixture' },
      events: [{ id: 'evt_1', type: 'agent.message', payload: { text: 'candidate memory' } }],
      artifacts: [{ path: 'memory.md', type: 'markdown', producer: 'agnt_fixture', content: 'candidate' }],
      now: () => new Date('2026-05-06T00:00:00Z'),
    });

    const validated = applyExternalAgentValidation(receipt, [
      { id: 'local-proof', command: 'node validate-memory.mjs', passed: true, exitCode: 0 },
    ]);

    expect(validated.quarantine.state).toBe('validated');
    expect(() =>
      promoteExternalAgentReceipt(validated, {
        id: 'mem_bad',
        sourceReceiptHash: 'wrong',
        promotedBy: 'local-validator',
        promotedAt: '2026-05-06T00:00:01Z',
        destination: 'wpg-review',
      })
    ).toThrow(/source hash/);

    const promoted = promoteExternalAgentReceipt(validated, {
      id: 'mem_ok',
      sourceReceiptHash: validated.captureHash,
      promotedBy: 'local-validator',
      promotedAt: '2026-05-06T00:00:01Z',
      destination: 'wpg-review',
    });

    expect(promoted.quarantine.state).toBe('promoted');
    expect(promoted.quarantine.memoryPromotion?.id).toBe('mem_ok');
    expect(promoted.persistentMemoryWriteAllowed).toBe(false);
  });

  it('rejects receipts when required local validation fails', () => {
    const receipt = createExternalAgentReceipt({
      provider: 'anthropic.claude-managed-agents',
      agent: { id: 'agnt_fixture', vendor: 'anthropic' },
      session: { id: 'sesn_fixture' },
    });

    const rejected = applyExternalAgentValidation(receipt, [
      { id: 'local-proof', command: 'node validate-memory.mjs', passed: false, exitCode: 1 },
    ]);

    expect(rejected.quarantine.state).toBe('rejected');
    expect(rejected.quarantine.reason).toContain('local-proof');
  });

  it('can be called by a benchmark harness as a backend', async () => {
    const client = makeClient();
    const adapter = new ClaudeManagedAgentAdapter({
      client,
      agentId: 'agnt_fixture',
      environmentId: 'env_fixture',
    });
    const validation: ExternalAgentValidationResult[] = [
      { id: 'fixture-pass', command: 'node fixture.mjs', passed: true, exitCode: 0 },
    ];
    const scorer = vi.fn((receipt) => receipt.outcomes[0].score ?? 0);

    const result = await adapter.runBenchmarkCase({
      prompt: 'Run the benchmark fixture.',
      validation,
      scorer,
    });

    expect(result.backendId).toBe('claude-managed-agent-quarantined');
    expect(result.score).toBe(0.72);
    expect(result.passed).toBe(true);
    expect(scorer).toHaveBeenCalledWith(result.receipt);
    expect(result.receipt.quarantine.state).toBe('validated');
  });

  it('wraps the SDK-style beta sessions surface without reading credentials', async () => {
    const sdk: ClaudeManagedAgentsSdk = {
      beta: {
        sessions: {
          create: vi.fn(async () => ({
            id: 'sesn_sdk',
            status: 'idle',
            agent_id: 'agnt_sdk',
            environment_id: 'env_sdk',
          })),
          retrieve: vi.fn(async () => ({
            id: 'sesn_sdk',
            status: 'idle',
            agent_id: 'agnt_sdk',
            environment_id: 'env_sdk',
          })),
          events: {
            send: vi.fn(async () => undefined),
            list: vi.fn(async () => ({
              data: [{ id: 'evt_sdk', type: 'session.status_idle', processed_at: '2026-05-06T00:00:00Z' }],
            })),
          },
        },
      },
    };
    const client = createClaudeManagedAgentsSdkClient(sdk);
    const adapter = new ClaudeManagedAgentAdapter({
      client,
      agentId: 'agnt_sdk',
      environmentId: 'env_sdk',
    });

    const receipt = await adapter.launchAndRead({
      prompt: 'Run from SDK client.',
      vaultIds: ['vault_fixture'],
    });

    expect(sdk.beta.sessions.create).toHaveBeenCalledWith({
      agent: 'agnt_sdk',
      environment_id: 'env_sdk',
      vault_ids: ['vault_fixture'],
    });
    expect(sdk.beta.sessions.events.send).toHaveBeenCalledWith('sesn_sdk', {
      events: [{ type: 'user.message', content: [{ type: 'text', text: 'Run from SDK client.' }] }],
    });
    expect(receipt.session.id).toBe('sesn_sdk');
    expect(receipt.events[0]).toMatchObject({
      id: 'evt_sdk',
      type: 'session.status_idle',
      processedAt: '2026-05-06T00:00:00Z',
    });
    expect(receipt.quarantine.state).toBe('quarantined');
  });
});
