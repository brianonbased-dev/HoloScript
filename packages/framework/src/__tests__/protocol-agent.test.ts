import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProtocolAgent, runProtocolCycle } from '../protocol-agent';
import { ProtocolPhase } from '../protocol/implementations';
import type { AgentConfig } from '../types';

// ── Mock fetch globally ──

const mockFetchResponse = (content: string) => ({
  ok: true,
  json: async () => ({
    content: [{ text: content }],
    usage: { output_tokens: 10 },
  }),
});

const mockOpenAIResponse = (content: string) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content } }],
    usage: { completion_tokens: 10 },
  }),
});

const testAgent: AgentConfig = {
  name: 'TestAgent',
  role: 'coder',
  model: { provider: 'anthropic', model: 'claude-sonnet-4', apiKey: 'test-key' },
  capabilities: ['code-generation', 'testing'],
  claimFilter: { roles: ['coder'], maxPriority: 10 },
  knowledgeDomains: ['typescript'],
};

describe('ProtocolAgent', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has correct identity from agent config', () => {
    const agent = new ProtocolAgent(testAgent);
    expect(agent.identity.name).toBe('TestAgent');
    expect(agent.identity.domain).toBe('typescript');
    expect(agent.identity.capabilities).toEqual(['code-generation', 'testing']);
  });

  it('intake phase gathers context without LLM call', async () => {
    const agent = new ProtocolAgent(testAgent, 'some knowledge');
    const result = await agent.intake({ task: 'Fix the bug' });

    expect(result.phase).toBe(ProtocolPhase.INTAKE);
    expect(result.status).toBe('success');
    expect(fetchSpy).not.toHaveBeenCalled(); // no LLM call for intake

    const data = result.data as Record<string, unknown>;
    expect(data.task).toBe('Fix the bug');
    expect(data.agent).toBe('TestAgent');
    expect(data.knowledge).toBe('some knowledge');
  });

  it('reflect phase calls LLM with light model', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse('Use TDD approach for this bug fix'));

    const agent = new ProtocolAgent(testAgent);
    const context = { task: 'Fix auth bug', role: 'coder', capabilities: ['code-generation'] };
    const result = await agent.reflect(context);

    expect(result.phase).toBe(ProtocolPhase.REFLECT);
    expect(result.status).toBe('success');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Verify it used the light model (haiku)
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody.model).toBe('claude-haiku-4');
  });

  it('execute phase calls LLM with full model', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse('Fixed the authentication bug by updating JWT validation'));

    const agent = new ProtocolAgent(testAgent);
    const plan = { plan: 'Use TDD', context: { task: 'Fix auth bug' } };
    const result = await agent.execute(plan);

    expect(result.phase).toBe(ProtocolPhase.EXECUTE);
    expect(result.status).toBe('success');

    // Verify it used the full model (sonnet)
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody.model).toBe('claude-sonnet-4');

    const data = result.data as { output: string };
    expect(data.output).toContain('authentication');
  });

  it('compress phase extracts knowledge items', async () => {
    fetchSpy.mockResolvedValue(
      mockFetchResponse(
        '[wisdom] JWT tokens should be validated on every request\n' +
        '[pattern] Use middleware for auth validation\n' +
        '[gotcha] Never store refresh tokens in localStorage'
      )
    );

    const agent = new ProtocolAgent(testAgent);
    const result = await agent.compress({ output: 'Fixed JWT validation', task: 'Fix auth' });

    expect(result.phase).toBe(ProtocolPhase.COMPRESS);
    expect(result.status).toBe('success');

    const data = result.data as { insights: Array<{ type: string; content: string }> };
    expect(data.insights).toHaveLength(3);
    expect(data.insights[0].type).toBe('wisdom');
    expect(data.insights[1].type).toBe('pattern');
    expect(data.insights[2].type).toBe('gotcha');
  });

  it('reintake phase skips LLM when no insights', async () => {
    const agent = new ProtocolAgent(testAgent);
    const result = await agent.reintake({ insights: [], rawOutput: 'some output' });

    expect(result.phase).toBe(ProtocolPhase.REINTAKE);
    expect(result.status).toBe('success');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('grow phase skips LLM when no validated insights', async () => {
    const agent = new ProtocolAgent(testAgent);
    const result = await agent.grow({ validated: [], rawOutput: 'some output' });

    expect(result.phase).toBe(ProtocolPhase.GROW);
    expect(result.status).toBe('success');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('evolve phase skips LLM when no validated insights', async () => {
    const agent = new ProtocolAgent(testAgent);
    const result = await agent.evolve({ patterns: '', validated: [] });

    expect(result.phase).toBe(ProtocolPhase.EVOLVE);
    expect(result.status).toBe('success');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('runProtocolCycle', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes all 7 phases and returns structured result', async () => {
    let callCount = 0;
    fetchSpy.mockImplementation(async () => {
      callCount++;
      // Phase 1 (reflect): light model
      if (callCount === 1) return mockFetchResponse('Approach: fix validation logic');
      // Phase 2 (execute): full model
      if (callCount === 2) return mockFetchResponse('SUMMARY: Fixed JWT validation\nDone.');
      // Phase 3 (compress): extract knowledge
      if (callCount === 3) return mockFetchResponse('[wisdom] Always validate token expiry\n[pattern] Use middleware for auth');
      // Phase 4 (reintake): validate
      if (callCount === 4) return mockFetchResponse('[wisdom] Always validate token expiry');
      // Phase 5 (grow): patterns
      if (callCount === 5) return mockFetchResponse('Auth validation is a cross-cutting concern');
      // Phase 6 (evolve): suggestions
      if (callCount === 6) return mockFetchResponse('Add auth middleware to all routes');
      return mockFetchResponse('ok');
    });

    const result = await runProtocolCycle(
      testAgent,
      { title: 'Fix JWT auth', description: 'JWT tokens not validated properly' },
      '[pattern] Use middleware'
    );

    expect(result.summary).toContain('Fixed JWT validation');
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights[0].type).toBe('wisdom');
    expect(result.phaseResults).toHaveLength(7);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);

    // 6 LLM calls: reflect + execute + compress + reintake + grow + evolve
    // (intake is local, no LLM)
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });

  it('returns summary from execute phase even when compress finds nothing', async () => {
    fetchSpy.mockImplementation(async () =>
      mockFetchResponse('Completed the task successfully')
    );

    const result = await runProtocolCycle(
      testAgent,
      { title: 'Simple task', description: 'Do something' },
      ''
    );

    expect(result.summary).toContain('Completed the task');
    // Empty insights are fine
    expect(result.insights).toBeDefined();
    expect(result.phaseResults).toHaveLength(7);
  });

  it('works with OpenAI provider', async () => {
    const openaiAgent: AgentConfig = {
      ...testAgent,
      model: { provider: 'openai', model: 'gpt-4o', apiKey: 'test-key' },
    };

    fetchSpy.mockImplementation(async () =>
      mockOpenAIResponse('Task done')
    );

    const result = await runProtocolCycle(
      openaiAgent,
      { title: 'Test task', description: 'Test' },
      ''
    );

    expect(result.phaseResults).toHaveLength(7);
    expect(result.summary).toContain('Task done');

    // Verify light model used for reflect (first call)
    const firstCallBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(firstCallBody.model).toBe('gpt-4o-mini');
  });

  it('handles LLM errors gracefully via BaseAgent.runCycle', async () => {
    fetchSpy.mockRejectedValue(new Error('API rate limit'));

    const result = await runProtocolCycle(
      testAgent,
      { title: 'Failing task', description: 'Will fail' },
      ''
    );

    // Should still return a result (BaseAgent catches phase errors)
    expect(result.phaseResults.length).toBeGreaterThan(0);
    // The reflect phase should fail, which cascades
    const reflectPhase = result.phaseResults.find(p => p.phase === ProtocolPhase.REFLECT);
    expect(reflectPhase?.status).toBe('failure');
  });
});
