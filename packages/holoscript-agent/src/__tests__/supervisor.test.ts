import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '@holoscript/llm-provider';
import { Supervisor } from '../supervisor.js';
import type { SupervisorConfig, AgentSpec } from '../supervisor-config.js';

const MINI_BRAIN = `
composition "Test" {
  identity {
    name: "test-brain"
    domain: "test"
    capability_tags: ["security", "paper-21"]
  }
}
`;

function provider(content = 'mock response'): ILLMProvider {
  return {
    name: 'mock',
    models: ['mock-1'],
    defaultHoloScriptModel: 'mock-1',
    async complete(_req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      return {
        content,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'mock-1',
        provider: 'mock',
        finishReason: 'stop',
      };
    },
    async generateHoloScript() { throw new Error('not used'); },
    async healthCheck() { return { ok: true, latencyMs: 1 }; },
  };
}

function specForBrain(brainPath: string, overrides: Partial<AgentSpec> = {}): AgentSpec {
  return {
    handle: 'security-auditor',
    brainPath,
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    walletEnvKey: 'WALLET_TEST',
    bearerEnvKey: 'BEARER_TEST',
    budgetUsdPerDay: 5,
    ...overrides,
  };
}

describe('Supervisor', () => {
  let dir: string;
  let brainPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sup-'));
    brainPath = join(dir, 'brain.hsplus');
    writeFileSync(brainPath, MINI_BRAIN, 'utf8');
    process.env.WALLET_TEST = '0x346126AbCdEf0123456789abcdef0123456789AB';
    process.env.BEARER_TEST = 'test-bearer';
  });

  function buildFetch(tasks: Array<{ id: string; title: string; tags: string[]; status?: string }> = []): typeof fetch {
    return (async (_url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') return new Response(null, { status: 204 });
      if (method === 'PATCH') return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ tasks: tasks.map((t) => ({ ...t, status: t.status ?? 'open', description: '', priority: 'high' })) }), { status: 200 });
    }) as unknown as typeof fetch;
  }

  it('starts only enabled agents and reports them in status', async () => {
    const config: SupervisorConfig = {
      agents: [
        specForBrain(brainPath, { handle: 'security-auditor', enabled: true }),
        specForBrain(brainPath, { handle: 'lean-theorist', enabled: false, walletEnvKey: 'WALLET_TEST', bearerEnvKey: 'BEARER_TEST' }),
      ],
    };
    const sup = new Supervisor({
      config,
      providerFactory: () => provider(),
      teamId: 'team_test',
      stateDir: dir,
      fetchImpl: buildFetch(),
    });
    await sup.start();
    const status = sup.status();
    expect(status.agents).toHaveLength(1);
    expect(status.agents[0].handle).toBe('security-auditor');
    await sup.stop();
  });

  it('throws fast on missing wallet/bearer env (W.087 vertex B identity discipline)', async () => {
    delete process.env.BEARER_TEST;
    const sup = new Supervisor({
      config: { agents: [specForBrain(brainPath)] },
      providerFactory: () => provider(),
      teamId: 't',
      stateDir: dir,
      fetchImpl: buildFetch(),
    });
    await expect(sup.start()).rejects.toThrow(/BEARER_TEST/);
  });

  it('tickOnce executes a real claim+complete cycle through the runner', async () => {
    const tasks = [{ id: 't-G10', title: 'security memo', tags: ['security'] }];
    const sup = new Supervisor({
      config: { agents: [specForBrain(brainPath)] },
      providerFactory: () => provider(),
      teamId: 't',
      stateDir: dir,
      fetchImpl: buildFetch(tasks),
    });
    await sup.start();
    const status = await sup.tickOnce('security-auditor');
    expect(status.state).toBe('running');
    expect(status.spentUsd).toBeGreaterThan(0);
    expect(status.lastTickAt).toBeDefined();
    await sup.stop();
  });

  it('flips agent state to over-budget when global ceiling trips (founder ruling Q1)', async () => {
    const tasks = [{ id: 't1', title: 'security memo', tags: ['security'] }];
    const sup = new Supervisor({
      config: {
        agents: [specForBrain(brainPath)],
        globalBudgetUsdPerDay: 0.0001,
      },
      providerFactory: () => provider(),
      teamId: 't',
      stateDir: dir,
      fetchImpl: buildFetch(tasks),
    });
    await sup.start();
    await sup.tickOnce('security-auditor');
    const second = await sup.tickOnce('security-auditor');
    expect(second.state).toBe('over-budget');
    const overall = sup.status();
    expect(overall.globalBudgetExhausted).toBe(true);
    await sup.stop();
  });

  it('tickOnce on unknown handle throws clearly (no silent no-op)', async () => {
    const sup = new Supervisor({
      config: { agents: [specForBrain(brainPath)] },
      providerFactory: () => provider(),
      teamId: 't',
      stateDir: dir,
      fetchImpl: buildFetch(),
    });
    await sup.start();
    await expect(sup.tickOnce('does-not-exist')).rejects.toThrow(/No agent/);
    await sup.stop();
  });

  it('emits structured supervisor-started log with agent count', async () => {
    const events: Array<Record<string, unknown>> = [];
    const sup = new Supervisor({
      config: { agents: [specForBrain(brainPath)] },
      providerFactory: () => provider(),
      teamId: 't',
      stateDir: dir,
      fetchImpl: buildFetch(),
      logger: (e) => events.push(e),
    });
    await sup.start();
    await sup.stop();
    const started = events.find((e) => e.ev === 'supervisor-started');
    expect(started?.count).toBe(1);
    const stopped = events.find((e) => e.ev === 'supervisor-stopped');
    expect(stopped?.count).toBe(1);
  });
});
