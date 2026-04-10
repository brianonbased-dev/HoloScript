import { describe, it, expect } from 'vitest';
import { ReactAgent } from '../react-protocol';
import type { ReactLLMAdapter, ReactToolExecutor, Thought, Observation, ReactStep } from '../react-protocol';
import type { AgentIdentity, ReactProtocolSpec } from '../index';

// =============================================================================
// MOCKS
// =============================================================================

const identity: AgentIdentity = {
  id: 'react-test-001',
  name: 'ReactTestAgent',
  domain: 'testing',
  version: '1.0.0',
  capabilities: ['react'],
};

function makeLLM(thinkResults: Thought[], synthesizeResult: unknown = 'final answer'): ReactLLMAdapter {
  let callCount = 0;
  return {
    think: async (_task: string, _history: ReactStep[]): Promise<Thought> => {
      return thinkResults[callCount++ % thinkResults.length];
    },
    synthesize: async () => synthesizeResult,
  };
}

function makeTools(results: Record<string, Observation>): ReactToolExecutor {
  return {
    execute: async (action: string, _input: unknown): Promise<Observation> => {
      const obs = results[action];
      if (!obs) throw new Error(`Unknown action: ${action}`);
      return obs;
    },
    availableTools: () => Object.keys(results),
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('ReactAgent', () => {
  it('solves task when stop condition met on first iteration', async () => {
    const spec: ReactProtocolSpec = {
      maxIterations: 5,
      tools: ['search'],
      stopCondition: (obs: unknown) => (obs as Observation).success === true,
    };

    const llm = makeLLM([
      { reasoning: 'I should search', action: 'search', actionInput: 'query', confidence: 0.9 },
    ]);

    const tools = makeTools({
      search: { action: 'search', result: 'found it', success: true },
    });

    const agent = new ReactAgent(identity, spec, llm, tools);
    const result = await agent.run('Find the answer');

    expect(result.status).toBe('solved');
    expect(result.totalIterations).toBe(1);
    expect(result.steps).toHaveLength(1);
    expect(result.finalAnswer).toBe('final answer');
  });

  it('reaches max iterations when stop condition never met', async () => {
    const spec: ReactProtocolSpec = {
      maxIterations: 3,
      tools: ['lookup'],
      stopCondition: () => false, // never stops
    };

    const llm = makeLLM([
      { reasoning: 'try lookup', action: 'lookup', actionInput: 'x', confidence: 0.5 },
    ]);

    const tools = makeTools({
      lookup: { action: 'lookup', result: 'nothing', success: false },
    });

    const agent = new ReactAgent(identity, spec, llm, tools);
    const result = await agent.run('Unsolvable task');

    expect(result.status).toBe('max_iterations');
    expect(result.totalIterations).toBe(3);
    expect(result.steps).toHaveLength(3);
  });

  it('handles tool execution errors gracefully', async () => {
    const spec: ReactProtocolSpec = {
      maxIterations: 2,
      tools: ['crash'],
      stopCondition: () => false,
    };

    const llm = makeLLM([
      { reasoning: 'try unknown', action: 'nonexistent', actionInput: null, confidence: 0.3 },
    ]);

    const tools = makeTools({}); // no tools registered

    const agent = new ReactAgent(identity, spec, llm, tools);
    const result = await agent.run('Crash test');

    expect(result.status).toBe('max_iterations');
    expect(result.steps[0].observation.success).toBe(false);
    expect(result.steps[0].observation.error).toContain('Unknown action');
  });

  it('passes growing history to LLM think calls', async () => {
    const historySizes: number[] = [];
    const spec: ReactProtocolSpec = {
      maxIterations: 3,
      tools: ['noop'],
      stopCondition: () => false,
    };

    const llm: ReactLLMAdapter = {
      think: async (_task, history) => {
        historySizes.push(history.length);
        return { reasoning: 'noop', action: 'noop', actionInput: null, confidence: 0.5 };
      },
      synthesize: async () => 'done',
    };

    const tools = makeTools({
      noop: { action: 'noop', result: null, success: true },
    });

    const agent = new ReactAgent(identity, spec, llm, tools);
    await agent.run('History test');

    expect(historySizes).toEqual([0, 1, 2]);
  });
});
