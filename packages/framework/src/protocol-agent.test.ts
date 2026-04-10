/**
 * Tests for defineProtocolAgent() builder and CycleResult adapters (FW-0.2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock callLLM before importing the module under test
vi.mock('./llm/llm-adapter', () => ({
  callLLM: vi.fn().mockResolvedValue({
    content: '[wisdom] Test insight\n[pattern] Test pattern',
    model: 'mock-model',
    provider: 'anthropic',
    tokensUsed: 50,
  }),
}));

import {
  defineProtocolAgent,
  protocolToFrameworkCycleResult,
  frameworkToProtocolCycleResult,
  ProtocolAgent,
} from './protocol-agent';
import { ProtocolPhase } from './protocol/implementations';
import type { ProtocolAgentConfig, CycleResult as FrameworkCycleResult } from './types';
import type { ProtocolCycleResult, PhaseResult } from './protocol/implementations';

const BASE_CONFIG: ProtocolAgentConfig = {
  name: 'test-agent',
  role: 'researcher',
  model: { provider: 'anthropic', model: 'claude-haiku-4' },
  capabilities: ['search', 'summarize'],
  claimFilter: { roles: ['researcher'], maxPriority: 10 },
};

describe('defineProtocolAgent', () => {
  // ── Validation ──

  it('throws on empty name', () => {
    expect(() => defineProtocolAgent({ ...BASE_CONFIG, name: '' })).toThrow(
      'Agent name is required'
    );
  });

  it('throws on invalid role', () => {
    expect(() => defineProtocolAgent({ ...BASE_CONFIG, role: 'wizard' as never })).toThrow(
      'Invalid role'
    );
  });

  it('throws on missing model provider', () => {
    expect(() =>
      defineProtocolAgent({ ...BASE_CONFIG, model: { provider: '' as never, model: 'x' } })
    ).toThrow('Agent model must specify provider and model');
  });

  it('throws on empty capabilities', () => {
    expect(() => defineProtocolAgent({ ...BASE_CONFIG, capabilities: [] })).toThrow(
      'Agent must have at least one capability'
    );
  });

  it('throws on unsupported protocol style', () => {
    expect(() => defineProtocolAgent({ ...BASE_CONFIG, protocolStyle: 'react' })).toThrow(
      'not yet implemented'
    );
  });

  // ── Handle properties ──

  it('returns a handle with correct name and role', () => {
    const handle = defineProtocolAgent(BASE_CONFIG);
    expect(handle.name).toBe('test-agent');
    expect(handle.role).toBe('researcher');
  });

  it('starts in idle status with empty history', () => {
    const handle = defineProtocolAgent(BASE_CONFIG);
    expect(handle.status).toBe('idle');
    expect(handle.history).toEqual([]);
  });

  // ── Execute ──

  it('executes a full uaa2 cycle and returns ProtocolCycleResult', async () => {
    const handle = defineProtocolAgent(BASE_CONFIG);

    const result = await handle.execute({
      title: 'Research quantum computing',
      description: 'Find latest papers',
    });

    expect(result.task).toBe('Research quantum computing');
    expect(result.cycleId).toMatch(/^cycle_/);
    expect(result.status).toBe('complete');
    expect(result.phases.length).toBe(7);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.startedAt).toBeLessThanOrEqual(result.completedAt);

    // Phase order
    expect(result.phases[0].phase).toBe(ProtocolPhase.INTAKE);
    expect(result.phases[1].phase).toBe(ProtocolPhase.REFLECT);
    expect(result.phases[2].phase).toBe(ProtocolPhase.EXECUTE);
    expect(result.phases[3].phase).toBe(ProtocolPhase.COMPRESS);
    expect(result.phases[4].phase).toBe(ProtocolPhase.REINTAKE);
    expect(result.phases[5].phase).toBe(ProtocolPhase.GROW);
    expect(result.phases[6].phase).toBe(ProtocolPhase.EVOLVE);
  });

  it('returns to idle after successful execution', async () => {
    const handle = defineProtocolAgent(BASE_CONFIG);
    await handle.execute({ title: 'T', description: 'D' });
    expect(handle.status).toBe('idle');
  });

  it('accumulates phase history across executions', async () => {
    const handle = defineProtocolAgent(BASE_CONFIG);
    await handle.execute({ title: 'T1', description: 'D1' });
    expect(handle.history.length).toBe(7);
    await handle.execute({ title: 'T2', description: 'D2' });
    expect(handle.history.length).toBe(14);
  });

  // ── Cancel ──

  it('cancels mid-execution and marks remaining phases as skipped', async () => {
    const handle = defineProtocolAgent({
      ...BASE_CONFIG,
      phaseHooks: {
        after: (phase) => {
          // Cancel after REFLECT phase completes
          if (phase === ProtocolPhase.REFLECT) {
            handle.cancel();
          }
          return undefined as never;
        },
      },
    });

    const result = await handle.execute({ title: 'T', description: 'D' });

    expect(result.status).toBe('partial');
    expect(handle.status).toBe('cancelled');

    // At least INTAKE and REFLECT ran, then EXECUTE should be skipped
    const skipped = result.phases.filter((p) => p.status === 'skipped');
    expect(skipped.length).toBeGreaterThan(0);
  });

  // ── Pause / Resume ──

  it('pause and resume work correctly', async () => {
    let pauseSeenAtPhase: number | null = null;

    const handle = defineProtocolAgent({
      ...BASE_CONFIG,
      phaseHooks: {
        before: (phase) => {
          if (phase === ProtocolPhase.EXECUTE) {
            handle.pause();
            // Immediately resume after pause is requested (simulating external resume)
            setTimeout(() => {
              pauseSeenAtPhase = phase;
              handle.resume();
            }, 10);
          }
          return undefined;
        },
      },
    });

    const result = await handle.execute({ title: 'T', description: 'D' });

    expect(pauseSeenAtPhase).toBe(ProtocolPhase.EXECUTE);
    expect(result.status).toBe('complete');
    expect(handle.status).toBe('idle');
  });

  // ── Reset ──

  it('reset clears history and returns to idle', async () => {
    const handle = defineProtocolAgent(BASE_CONFIG);
    await handle.execute({ title: 'T', description: 'D' });
    expect(handle.history.length).toBe(7);

    handle.reset();
    expect(handle.status).toBe('idle');
    expect(handle.history).toEqual([]);
  });

  it('reset throws if agent is running', async () => {
    const handle = defineProtocolAgent({
      ...BASE_CONFIG,
      phaseHooks: {
        before: () => {
          // Try reset during execution — should throw
          expect(() => handle.reset()).toThrow('Cannot reset while running');
          return undefined;
        },
      },
    });

    await handle.execute({ title: 'T', description: 'D' });
  });

  // ── Phase hooks ──

  it('before hook can transform phase input', async () => {
    const beforeSpy = vi.fn().mockImplementation((_phase, input) => input);

    const handle = defineProtocolAgent({
      ...BASE_CONFIG,
      phaseHooks: { before: beforeSpy },
    });

    await handle.execute({ title: 'T', description: 'D' });

    // Called once per phase
    expect(beforeSpy).toHaveBeenCalledTimes(7);
    expect(beforeSpy.mock.calls[0][0]).toBe(ProtocolPhase.INTAKE);
  });

  it('after hook can transform phase result', async () => {
    const afterSpy = vi.fn().mockImplementation((_phase, result) => result);

    const handle = defineProtocolAgent({
      ...BASE_CONFIG,
      phaseHooks: { after: afterSpy },
    });

    await handle.execute({ title: 'T', description: 'D' });

    expect(afterSpy).toHaveBeenCalledTimes(7);
  });

  // ── Protocol style default ──

  it('defaults to uaa2 protocol style', () => {
    const handle = defineProtocolAgent(BASE_CONFIG);
    // No throw = uaa2 accepted
    expect(handle.name).toBe('test-agent');
  });
});

describe('protocolToFrameworkCycleResult', () => {
  it('maps protocol result to framework CycleResult', () => {
    const protocol: ProtocolCycleResult = {
      cycleId: 'cycle_123',
      task: 'Test task',
      domain: 'testing',
      phases: [
        {
          phase: ProtocolPhase.EXECUTE,
          status: 'success',
          data: { output: 'Did the thing' },
          durationMs: 100,
          timestamp: Date.now(),
        },
        {
          phase: ProtocolPhase.REINTAKE,
          status: 'success',
          data: {
            validated: [
              {
                type: 'wisdom',
                content: 'insight',
                domain: 'testing',
                confidence: 0.8,
                source: 'test',
              },
            ],
          },
          durationMs: 50,
          timestamp: Date.now(),
        },
      ],
      status: 'complete',
      totalDurationMs: 500,
      startedAt: 1000,
      completedAt: 1500,
    };

    const fw = protocolToFrameworkCycleResult(protocol, 'team-alpha', 3);

    expect(fw.teamName).toBe('team-alpha');
    expect(fw.cycle).toBe(3);
    expect(fw.durationMs).toBe(500);
    expect(fw.agentResults).toHaveLength(1);
    expect(fw.agentResults[0].action).toBe('completed');
    expect(fw.agentResults[0].summary).toBe('Did the thing');
    expect(fw.knowledgeProduced).toHaveLength(1);
    expect(fw.knowledgeProduced[0].type).toBe('wisdom');
    expect(fw.compoundedInsights).toBe(1);
  });

  it('maps failed protocol result correctly', () => {
    const protocol: ProtocolCycleResult = {
      cycleId: 'cycle_456',
      task: 'Failing task',
      domain: 'testing',
      phases: [],
      status: 'failed',
      totalDurationMs: 100,
      startedAt: 1000,
      completedAt: 1100,
    };

    const fw = protocolToFrameworkCycleResult(protocol, 'team-beta', 1);
    expect(fw.agentResults[0].action).toBe('error');
  });
});

describe('frameworkToProtocolCycleResult', () => {
  it('maps framework CycleResult to protocol result', () => {
    const fw: FrameworkCycleResult = {
      teamName: 'team-gamma',
      cycle: 5,
      agentResults: [
        {
          agentName: 'agent-1',
          taskId: 'task-1',
          taskTitle: 'Test',
          action: 'completed',
          summary: 'Done',
          knowledge: [],
        },
      ],
      knowledgeProduced: [],
      compoundedInsights: 0,
      durationMs: 300,
    };

    const protocol = frameworkToProtocolCycleResult(fw, 'The task', 'testing');

    expect(protocol.task).toBe('The task');
    expect(protocol.domain).toBe('testing');
    expect(protocol.status).toBe('complete');
    expect(protocol.totalDurationMs).toBe(300);
    expect(protocol.phases).toEqual([]);
  });

  it('marks as failed when agent result has error action', () => {
    const fw: FrameworkCycleResult = {
      teamName: 'team-delta',
      cycle: 1,
      agentResults: [
        {
          agentName: 'agent-1',
          taskId: null,
          taskTitle: null,
          action: 'error',
          summary: 'Boom',
          knowledge: [],
        },
      ],
      knowledgeProduced: [],
      compoundedInsights: 0,
      durationMs: 50,
    };

    const protocol = frameworkToProtocolCycleResult(fw, 'Task', 'domain');
    expect(protocol.status).toBe('failed');
  });
});
