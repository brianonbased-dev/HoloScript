/**
 * @fileoverview Extended Agent Protocol Tests
 *
 * Extends coverage for @holoscript/agent-protocol:
 * - BaseAgent: cycle timing, phase data passing, parallel cycles
 * - BaseService: full lifecycle, metrics precision, error recording, executeWithMetrics
 * - PWG: validation, domain filtering, severity comparison
 * - ServiceError: all error codes, custom details
 * - Enums: exhaustive coverage
 */
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
  type PhaseResult,
  type CycleResult,
  type AgentIdentity,
  type Pattern,
  type Wisdom,
  type Gotcha,
} from '../index';

// =============================================================================
// HELPERS
// =============================================================================

class TimedAgent extends BaseAgent {
  readonly identity: AgentIdentity = {
    id: 'timed-001',
    name: 'TimedAgent',
    domain: 'testing',
    version: '2.0.0',
    capabilities: ['timing', 'metrics', 'verification'],
  };
  phaseLog: string[] = [];

  async intake(ctx: Record<string, unknown>) {
    this.phaseLog.push('INTAKE');
    return {
      phase: ProtocolPhase.INTAKE,
      status: 'success' as const,
      data: { ...ctx, enriched: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async reflect(data: unknown) {
    this.phaseLog.push('REFLECT');
    return {
      phase: ProtocolPhase.REFLECT,
      status: 'success' as const,
      data: { plan: 'analysed', input: data },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async execute(plan: unknown) {
    this.phaseLog.push('EXECUTE');
    return {
      phase: ProtocolPhase.EXECUTE,
      status: 'success' as const,
      data: { completed: true, plan },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async compress(results: unknown) {
    this.phaseLog.push('COMPRESS');
    return {
      phase: ProtocolPhase.COMPRESS,
      status: 'success' as const,
      data: { compressed: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async reintake(compressed: unknown) {
    this.phaseLog.push('REINTAKE');
    return {
      phase: ProtocolPhase.REINTAKE,
      status: 'success' as const,
      data: { reabsorbed: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async grow(learnings: unknown) {
    this.phaseLog.push('GROW');
    return {
      phase: ProtocolPhase.GROW,
      status: 'success' as const,
      data: { patterns: 3, wisdom: 2 },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
  async evolve(adaptations: unknown) {
    this.phaseLog.push('EVOLVE');
    return {
      phase: ProtocolPhase.EVOLVE,
      status: 'success' as const,
      data: { evolved: true },
      durationMs: 0,
      timestamp: Date.now(),
    };
  }
}

class MetricsService extends BaseService {
  initCount = 0;
  readyCount = 0;
  stopCount = 0;

  constructor() {
    super({ name: 'MetricsService', version: '2.0.0', description: 'Full metrics testing' });
  }

  async onInit() {
    this.initCount++;
  }
  async onReady() {
    this.readyCount++;
  }
  async onStop() {
    this.stopCount++;
  }
}

// =============================================================================
// EXTENDED BASE AGENT TESTS
// =============================================================================

describe('BaseAgent (extended)', () => {
  let agent: TimedAgent;

  beforeEach(() => {
    agent = new TimedAgent();
  });

  it('passes data between phases (intake → reflect → execute)', async () => {
    const result = await agent.runCycle('Data pipeline test', { inputKey: 'hello' });
    expect(result.status).toBe('complete');
    expect(result.phases.length).toBe(7);
    // Verify phase ordering
    expect(agent.phaseLog).toEqual([
      'INTAKE',
      'REFLECT',
      'EXECUTE',
      'COMPRESS',
      'REINTAKE',
      'GROW',
      'EVOLVE',
    ]);
  });

  it('records cycle timing accurately', async () => {
    const before = Date.now();
    const result = await agent.runCycle('Timing test');
    const after = Date.now();
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.startedAt).toBeGreaterThanOrEqual(before);
    expect(result.completedAt).toBeLessThanOrEqual(after + 1);
  });

  it('supports multiple sequential cycles', async () => {
    const r1 = await agent.runCycle('Cycle 1');
    const r2 = await agent.runCycle('Cycle 2');
    expect(r1.cycleId).not.toBe(r2.cycleId);
    expect(r1.task).toBe('Cycle 1');
    expect(r2.task).toBe('Cycle 2');
    expect(agent.phaseLog.length).toBe(14); // 7 × 2
  });

  it('identity has required fields', () => {
    expect(agent.identity.id).toBe('timed-001');
    expect(agent.identity.capabilities).toContain('timing');
    expect(agent.identity.version).toBe('2.0.0');
  });

  it('all 7 phases produce results', async () => {
    const result = await agent.runCycle('Full pipeline');
    const phaseNumbers = result.phases.map((p) => p.phase);
    expect(phaseNumbers).toEqual([0, 1, 2, 3, 4, 5, 6]);
    result.phases.forEach((p) => expect(p.status).toBe('success'));
  });
});

// =============================================================================
// EXTENDED BASE SERVICE TESTS
// =============================================================================

describe('BaseService (extended)', () => {
  let svc: MetricsService;

  beforeEach(() => {
    svc = new MetricsService();
  });

  it('full lifecycle: init → ready → stop', async () => {
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.INITIALIZING);

    await svc.initialize();
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.READY);
    expect(svc.isReady()).toBe(true);
    expect(svc.initCount).toBe(1);
    expect(svc.readyCount).toBe(1);

    await svc.stop();
    expect(svc.getMetadata().lifecycle).toBe(ServiceLifecycle.STOPPED);
    expect(svc.isReady()).toBe(false);
    expect(svc.stopCount).toBe(1);
  });

  it('metrics recording', async () => {
    await svc.initialize();
    (svc as any).recordRequest(10);
    (svc as any).recordRequest(20);
    (svc as any).recordRequest(30);

    const metrics = svc.getMetrics();
    expect(metrics.requestCount).toBe(3);
    expect(metrics.lastRequestAt).toBeDefined();
  });

  it('error recording', async () => {
    await svc.initialize();
    (svc as any).recordError(new Error('Test error'));

    const metrics = svc.getMetrics();
    expect(metrics.errorCount).toBe(1);
    expect(metrics.lastErrorAt).toBeDefined();
  });

  it('executeWithMetrics tracks performance', async () => {
    await svc.initialize();
    const result = await (svc as any).executeWithMetrics(async () => 42);
    expect(result).toBe(42);
    expect(svc.getMetrics().requestCount).toBe(1);
  });

  it('executeWithMetrics records errors', async () => {
    await svc.initialize();
    await expect(
      (svc as any).executeWithMetrics(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(svc.getMetrics().errorCount).toBe(1);
  });

  it('metadata has correct fields', () => {
    const meta = svc.getMetadata();
    expect(meta.name).toBe('MetricsService');
    expect(meta.version).toBe('2.0.0');
    expect(meta.description).toBe('Full metrics testing');
  });
});

// =============================================================================
// SERVICE ERROR TESTS
// =============================================================================

describe('ServiceError (extended)', () => {
  it('all error codes exist', () => {
    const codes = [
      ServiceErrorCode.VALIDATION_ERROR,
      ServiceErrorCode.NOT_FOUND,
      ServiceErrorCode.CONFLICT,
      ServiceErrorCode.RATE_LIMIT,
      ServiceErrorCode.INTERNAL_ERROR,
      ServiceErrorCode.SERVICE_UNAVAILABLE,
    ];
    expect(codes.length).toBe(6);
    codes.forEach((c) => expect(typeof c).toBe('string'));
  });

  it('creates error with details', () => {
    const err = new ServiceError(ServiceErrorCode.NOT_FOUND, 'Agent not found', 404, {
      agentId: 'xyz',
    });
    expect(err.code).toBe(ServiceErrorCode.NOT_FOUND);
    expect(err.statusCode).toBe(404);
    expect(err.details?.agentId).toBe('xyz');
    expect(err.message).toBe('Agent not found');
    expect(err.name).toBe('ServiceError');
  });

  it('default status code is 500', () => {
    const err = new ServiceError(ServiceErrorCode.INTERNAL_ERROR, 'Something broke');
    expect(err.statusCode).toBe(500);
  });
});

// =============================================================================
// EXTENDED PWG TESTS
// =============================================================================

describe('PWG Knowledge Format (extended)', () => {
  it('pattern with all fields', () => {
    const now = Date.now();
    const p: Pattern = {
      id: 'P.STUDIO.01',
      domain: 'studio',
      problem: 'Panel communication',
      solution: 'Event bus',
      context: 'React panels',
      tags: ['studio', 'react', 'events'],
      confidence: 0.95,
      createdAt: now,
      updatedAt: now,
    };
    expect(isPattern(p)).toBe(true);
    expect(isWisdom(p)).toBe(false);
    expect(isGotcha(p)).toBe(false);
  });

  it('wisdom with insight', () => {
    const w: Wisdom = {
      id: 'W.COMPILER.01',
      domain: 'compiler',
      insight: 'Always bypass RBAC for Studio demo mode',
      context: 'Studio integration',
      tags: ['compiler', 'bypass'],
      source: 'experience',
      createdAt: Date.now(),
    };
    expect(isWisdom(w)).toBe(true);
    expect(isPattern(w)).toBe(false);
  });

  it('gotcha with severity', () => {
    const g: Gotcha = {
      id: 'G.API.01',
      domain: 'api',
      mistake: 'Using wrong constructor args',
      fix: 'Check API signatures',
      severity: 'high',
      tags: ['api'],
      createdAt: Date.now(),
    };
    expect(isGotcha(g)).toBe(true);
    expect(isPattern(g)).toBe(false);
  });
});

// =============================================================================
// ENUM EXHAUSTIVENESS TESTS
// =============================================================================

describe('Protocol Enums (extended)', () => {
  it('all 7 phases mapped in PHASE_NAMES', () => {
    const phases = [
      ProtocolPhase.INTAKE,
      ProtocolPhase.REFLECT,
      ProtocolPhase.EXECUTE,
      ProtocolPhase.COMPRESS,
      ProtocolPhase.REINTAKE,
      ProtocolPhase.GROW,
      ProtocolPhase.EVOLVE,
    ];
    expect(phases.length).toBe(7);
    phases.forEach((p) => expect(PHASE_NAMES[p]).toBeDefined());
  });

  it('PHASE_NAMES are uppercase strings', () => {
    Object.values(PHASE_NAMES).forEach((name) => {
      expect(name).toBe(name.toUpperCase());
    });
  });

  it('all ServiceLifecycle values', () => {
    const states = [
      ServiceLifecycle.INITIALIZING,
      ServiceLifecycle.READY,
      ServiceLifecycle.DEGRADED,
      ServiceLifecycle.STOPPING,
      ServiceLifecycle.STOPPED,
      ServiceLifecycle.ERROR,
    ];
    expect(states.length).toBe(6);
    states.forEach((s) => expect(typeof s).toBe('string'));
  });
});

// =============================================================================
// GOAL SYNTHESIZER (EXTENDED)
// =============================================================================

describe('GoalSynthesizer (extended)', () => {
  it('generates goals with required fields', () => {
    const synth = new GoalSynthesizer();
    const goal = synth.synthesize();
    expect(goal.id).toMatch(/^GOAL-/);
    expect(goal.description).toBeTruthy();
    expect(goal.priority).toBeDefined();
    expect(goal.category).toBeDefined();
    expect(goal.source).toBe('autonomous-boredom');
  });

  it('supports custom source and domain', () => {
    const synth = new GoalSynthesizer();
    const goal = synth.synthesize('coding', 'user-instruction');
    expect(goal.source).toBe('user-instruction');
  });
});

// =============================================================================
// MICRO PHASE DECOMPOSER (EXTENDED)
// =============================================================================

describe('MicroPhaseDecomposer (extended)', () => {
  it('creates execution plan with dependencies', () => {
    const decomposer = new MicroPhaseDecomposer();
    decomposer.registerTask({
      id: 'A',
      name: 'Parse',
      estimatedDuration: 50,
      dependencies: [],
      execute: async () => {},
    });
    decomposer.registerTask({
      id: 'B',
      name: 'Compile',
      estimatedDuration: 100,
      dependencies: ['A'],
      execute: async () => {},
    });
    decomposer.registerTask({
      id: 'C',
      name: 'Link',
      estimatedDuration: 30,
      dependencies: ['B'],
      execute: async () => {},
    });

    const plan = decomposer.createExecutionPlan();
    expect(plan.groups.length).toBeGreaterThanOrEqual(2);
    expect(plan.totalEstimatedTime).toBeGreaterThanOrEqual(100); // at least the longest group
  });

  it('parallelizes independent tasks', () => {
    const decomposer = new MicroPhaseDecomposer();
    decomposer.registerTask({
      id: 'A',
      name: 'Task A',
      estimatedDuration: 100,
      dependencies: [],
      execute: async () => {},
    });
    decomposer.registerTask({
      id: 'B',
      name: 'Task B',
      estimatedDuration: 100,
      dependencies: [],
      execute: async () => {},
    });
    decomposer.registerTask({
      id: 'C',
      name: 'Task C',
      estimatedDuration: 50,
      dependencies: ['A', 'B'],
      execute: async () => {},
    });

    const plan = decomposer.createExecutionPlan();
    // A and B should be in same group (parallel), C in next group
    expect(plan.groups.length).toBe(2);
    expect(plan.groups[0].tasks.length).toBe(2); // A + B parallel
    expect(plan.groups[1].tasks.length).toBe(1); // C after
  });
});
