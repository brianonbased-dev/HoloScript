import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProtocolPhase,
  PHASE_NAMES,
  BaseAgent,
  BaseService,
  ServiceLifecycle,
  ServiceError,
  ServiceErrorCode,
  GoalSynthesizer,
  MicroPhaseDecomposer,
  isPattern,
  isWisdom,
  isGotcha,
} from '../index';
import type { PhaseResult, Pattern, Wisdom, Gotcha, AgentIdentity } from '../index';

// =============================================================================
// PROTOCOL PHASE TESTS
// =============================================================================

describe('ProtocolPhase', () => {
  it('should define all 8 phases', () => {
    expect(ProtocolPhase.INTAKE).toBe(0);
    expect(ProtocolPhase.REFLECT).toBe(1);
    expect(ProtocolPhase.EXECUTE).toBe(2);
    expect(ProtocolPhase.COMPRESS).toBe(3);
    expect(ProtocolPhase.REINTAKE).toBe(4);
    expect(ProtocolPhase.GROW).toBe(5);
    expect(ProtocolPhase.EVOLVE).toBe(6);
    expect(ProtocolPhase.AUTONOMIZE).toBe(7);
  });

  it('should have phase names', () => {
    expect(PHASE_NAMES[ProtocolPhase.INTAKE]).toBe('INTAKE');
    expect(PHASE_NAMES[ProtocolPhase.EVOLVE]).toBe('EVOLVE');
    expect(PHASE_NAMES[ProtocolPhase.AUTONOMIZE]).toBe('AUTONOMIZE');
  });
});

// =============================================================================
// BASE AGENT TESTS
// =============================================================================

class TestAgent extends BaseAgent {
  readonly identity: AgentIdentity = {
    id: 'test-agent-001',
    name: 'TestAgent',
    domain: 'testing',
    version: '1.0.0',
    capabilities: ['testing', 'verification'],
  };

  async intake(ctx: Record<string, unknown>): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.INTAKE,
      status: 'success',
      data: { ingested: ctx },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async reflect(data: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.REFLECT,
      status: 'success',
      data: { analyzed: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async execute(plan: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.EXECUTE,
      status: 'success',
      data: { executed: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async compress(results: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.COMPRESS,
      status: 'success',
      data: { compressed: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async reintake(compressed: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.REINTAKE,
      status: 'success',
      data: { reingested: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async grow(learnings: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.GROW,
      status: 'success',
      data: { learned: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async evolve(adaptations: unknown): Promise<PhaseResult> {
    return {
      phase: ProtocolPhase.EVOLVE,
      status: 'success',
      data: { evolved: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
}

describe('BaseAgent', () => {
  it('should run a complete 7-phase cycle', async () => {
    const agent = new TestAgent();
    const result = await agent.runCycle('Test task', { context: 'test' });

    expect(result.status).toBe('complete');
    expect(result.task).toBe('Test task');
    expect(result.domain).toBe('testing');
    expect(result.phases).toHaveLength(7);
    expect(result.phases[0].phase).toBe(ProtocolPhase.INTAKE);
    expect(result.phases[6].phase).toBe(ProtocolPhase.EVOLVE);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle phase failures gracefully', async () => {
    class FailingAgent extends TestAgent {
      async execute(): Promise<PhaseResult> {
        throw new Error('Execution failed');
      }
    }

    const agent = new FailingAgent();
    const result = await agent.runCycle('Failing task');

    expect(result.status).toBe('partial');
    expect(result.phases[2].status).toBe('failure');
    expect(result.phases[2].data).toBe('Execution failed');
  });

  it('should expose agent identity', () => {
    const agent = new TestAgent();
    expect(agent.identity.name).toBe('TestAgent');
    expect(agent.identity.domain).toBe('testing');
  });
});

// =============================================================================
// BASE SERVICE TESTS
// =============================================================================

class TestService extends BaseService {
  constructor() {
    super({ name: 'TestService', version: '1.0.0', description: 'Test' });
  }
}

describe('BaseService', () => {
  it('should initialize and transition to READY', async () => {
    const svc = new TestService();
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.INITIALIZING);

    await svc.initialize();
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.READY);
    expect(svc.isReady()).toBe(true);
  });

  it('should stop and transition to STOPPED', async () => {
    const svc = new TestService();
    await svc.initialize();
    await svc.stop();
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.STOPPED);
  });

  it('should track metrics', async () => {
    const svc = new TestService();
    await svc.initialize();
    const metrics = svc.getMetrics();
    expect(metrics.requestCount).toBe(0);
    expect(metrics.errorCount).toBe(0);
  });
});

// =============================================================================
// PWG FORMAT TESTS
// =============================================================================

describe('PWG Knowledge Format', () => {
  it('should identify patterns', () => {
    const pattern: Pattern = {
      id: 'P.LOGGING.01',
      domain: 'logging',
      problem: 'Inconsistent logs',
      solution: 'Use unified logger',
      tags: ['logging'],
      confidence: 0.9,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(isPattern(pattern)).toBe(true);
    expect(isWisdom(pattern)).toBe(false);
    expect(isGotcha(pattern)).toBe(false);
  });

  it('should identify wisdom', () => {
    const wisdom: Wisdom = {
      id: 'W.ARCH.01',
      domain: 'architecture',
      insight: 'Decouple services',
      context: 'Microservices',
      source: 'experience',
      tags: ['architecture'],
      createdAt: Date.now(),
    };
    expect(isWisdom(wisdom)).toBe(true);
    expect(isPattern(wisdom)).toBe(false);
  });

  it('should identify gotchas', () => {
    const gotcha: Gotcha = {
      id: 'G.ENV.01',
      domain: 'environment',
      mistake: 'Hardcoded paths',
      fix: 'Use env vars',
      severity: 'high',
      tags: ['env'],
      createdAt: Date.now(),
    };
    expect(isGotcha(gotcha)).toBe(true);
    expect(isPattern(gotcha)).toBe(false);
  });
});

// =============================================================================
// GOAL SYNTHESIZER TESTS
// =============================================================================

describe('GoalSynthesizer', () => {
  it('should generate a goal', () => {
    const synth = new GoalSynthesizer();
    const goal = synth.synthesize();

    expect(goal.id).toMatch(/^GOAL-/);
    expect(goal.description).toBeTruthy();
    expect(goal.category).toBe('self-improvement');
    expect(goal.priority).toBe('low');
    expect(goal.source).toBe('autonomous-boredom');
  });

  it('should accept domain and source', () => {
    const synth = new GoalSynthesizer();
    const goal = synth.synthesize('coding', 'user-instruction');
    expect(goal.source).toBe('user-instruction');
  });
});

// =============================================================================
// MICRO-PHASE DECOMPOSER TESTS
// =============================================================================

describe('MicroPhaseDecomposer', () => {
  let decomposer: MicroPhaseDecomposer;

  beforeEach(() => {
    decomposer = new MicroPhaseDecomposer();
  });

  it('should register tasks', () => {
    decomposer.registerTask({
      id: 'A',
      name: 'Task A',
      estimatedDuration: 100,
      dependencies: [],
      execute: async () => 'A done',
    });
    expect(() =>
      decomposer.registerTask({
        id: 'A',
        name: 'Duplicate',
        estimatedDuration: 50,
        dependencies: [],
        execute: async () => {},
      })
    ).toThrow('already registered');
  });

  it('should reject missing dependencies', () => {
    expect(() =>
      decomposer.registerTask({
        id: 'B',
        name: 'Task B',
        estimatedDuration: 50,
        dependencies: ['nonexistent'],
        execute: async () => {},
      })
    ).toThrow('not registered');
  });

  it('should create execution plan with parallelization', () => {
    decomposer.registerTask({
      id: 'A',
      name: 'A',
      estimatedDuration: 100,
      dependencies: [],
      execute: async () => {},
    });
    decomposer.registerTask({
      id: 'B',
      name: 'B',
      estimatedDuration: 100,
      dependencies: [],
      execute: async () => {},
    });
    decomposer.registerTask({
      id: 'C',
      name: 'C',
      estimatedDuration: 50,
      dependencies: ['A', 'B'],
      execute: async () => {},
    });

    const plan = decomposer.createExecutionPlan();
    expect(plan.groups).toHaveLength(2);
    expect(plan.groups[0].tasks).toHaveLength(2); // A and B in parallel
    expect(plan.groups[1].tasks).toHaveLength(1); // C after both
    expect(plan.parallelizationRatio).toBeGreaterThan(0);
  });

  it('should execute plan and return results', async () => {
    decomposer.registerTask({
      id: 'X',
      name: 'X',
      estimatedDuration: 10,
      dependencies: [],
      execute: async () => 42,
    });
    decomposer.registerTask({
      id: 'Y',
      name: 'Y',
      estimatedDuration: 10,
      dependencies: ['X'],
      execute: async () => 99,
    });

    const plan = decomposer.createExecutionPlan();
    const results = await decomposer.executePlan(plan);

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.taskId === 'X')?.status).toBe('success');
    expect(results.find((r) => r.taskId === 'X')?.result).toBe(42);
    expect(results.find((r) => r.taskId === 'Y')?.result).toBe(99);
  });

  it('should handle task failures', async () => {
    decomposer.registerTask({
      id: 'F',
      name: 'Failing',
      estimatedDuration: 10,
      dependencies: [],
      execute: async () => {
        throw new Error('boom');
      },
    });

    const plan = decomposer.createExecutionPlan();
    const results = await decomposer.executePlan(plan);

    expect(results[0].status).toBe('failure');
    expect(results[0].error?.message).toBe('boom');
  });

  it('should reset state', () => {
    decomposer.registerTask({
      id: 'R',
      name: 'R',
      estimatedDuration: 10,
      dependencies: [],
      execute: async () => {},
    });
    decomposer.reset();
    // Should be able to re-register
    decomposer.registerTask({
      id: 'R',
      name: 'R',
      estimatedDuration: 10,
      dependencies: [],
      execute: async () => {},
    });
  });
});
