/**
 * ChoreographyPlanner Production Tests
 * Sprint CLIII - Plan creation, validation, fluent builder, topological sort
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChoreographyPlanner,
  PlanBuilder,
  plan,
  getDefaultPlanner,
  type StepDefinition,
  type PlanDefinition,
} from '../ChoreographyPlanner';
import type { AgentManifest } from '../../agents/AgentManifest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(id: string, caps: string[] = []): AgentManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    capabilities: caps.map((c) => ({ type: c as any, name: c, version: '1.0.0' })),
    metadata: {},
  };
}

function makeStep(overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    agent: 'agent-1',
    action: 'do_work',
    ...overrides,
  };
}

function makeDefinition(overrides: Partial<PlanDefinition> = {}): PlanDefinition {
  return {
    goal: 'Test goal',
    agents: [makeAgent('agent-1')],
    steps: [makeStep()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChoreographyPlanner', () => {
  let planner: ChoreographyPlanner;

  beforeEach(() => {
    planner = new ChoreographyPlanner();
  });

  // -------------------------------------------------------------------------
  // createPlan
  // -------------------------------------------------------------------------

  describe('createPlan', () => {
    it('creates a plan with correct goal and status', () => {
      const p = planner.createPlan(makeDefinition());
      expect(p.goal).toBe('Test goal');
      expect(p.status).toBe('draft');
      expect(p.id).toBeTruthy();
      expect(p.createdAt).toBeGreaterThan(0);
    });

    it('maps step agent string to agentId', () => {
      const p = planner.createPlan(makeDefinition());
      expect(p.steps[0].agentId).toBe('agent-1');
    });

    it('throws for unresolvable agent', () => {
      const def = makeDefinition({ steps: [makeStep({ agent: 'nonexistent' })] });
      expect(() => planner.createPlan(def)).toThrow('No agent found');
    });

    it('resolves step dependencies by name', () => {
      const def = makeDefinition({
        steps: [
          makeStep({ id: 'step-a', name: 'StepA', dependencies: [] }),
          makeStep({ id: 'step-b', name: 'StepB', dependencies: ['StepA'] }),
        ],
      });
      const p = planner.createPlan(def);
      expect(p.steps[1].dependencies).toContain('step-a');
    });

    it('throws for unknown dependency', () => {
      const def = makeDefinition({
        steps: [makeStep({ dependencies: ['step-ghost'] })],
      });
      expect(() => planner.createPlan(def)).toThrow('Unknown step dependency');
    });

    it('preserves agents as participants', () => {
      const def = makeDefinition({
        agents: [makeAgent('a1'), makeAgent('a2')],
        steps: [makeStep({ agent: 'a1' })],
      });
      const p = planner.createPlan(def);
      const ids = p.participants.map((a) => a.id);
      expect(ids).toContain('a1');
      expect(ids).toContain('a2');
    });

    it('creates nested fallback plan', () => {
      const fallback: PlanDefinition = makeDefinition({ goal: 'fallback' });
      const def = makeDefinition({ fallback });
      const p = planner.createPlan(def);
      expect(p.fallback).toBeTruthy();
      expect(p.fallback!.goal).toBe('fallback');
    });

    it('normalizes outputs from string shorthand', () => {
      const def = makeDefinition({
        steps: [makeStep({ outputs: { result: 'output-value' } })],
      });
      const p = planner.createPlan(def);
      expect(p.steps[0].outputs!['result']).toMatchObject({ key: 'result', type: 'unknown' });
    });

    it('preserves tags and priority metadata', () => {
      const def = makeDefinition({ tags: ['test', 'prod'], priority: 5 });
      const p = planner.createPlan(def);
      expect(p.tags).toContain('test');
      expect(p.priority).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------------

  describe('validate', () => {
    it('returns valid=true for well-formed plan', () => {
      const p = planner.createPlan(
        makeDefinition({
          constraints: [{ type: 'timeout', value: 60000, hard: true }],
        })
      );
      const result = planner.validate(p);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for empty steps', () => {
      const p = planner.createPlan(makeDefinition({ steps: [] }));
      // No-step plan - force validate
      const result = planner.validate(p);
      expect(result.errors).toContain('Plan has no steps');
    });

    it('warns about missing timeout constraint', () => {
      const p = planner.createPlan(makeDefinition());
      const result = planner.validate(p);
      expect(result.warnings.some((w) => w.includes('timeout'))).toBe(true);
    });

    it('detects circular dependency', () => {
      // Manually create a circular dep plan (bypass normal createPlan validation)
      const p = planner.createPlan(
        makeDefinition({
          steps: [
            makeStep({ id: 'a', dependencies: [] }),
            makeStep({ id: 'b', dependencies: ['a'] }),
          ],
        })
      );
      // Manually inject a cycle
      p.steps[0].dependencies = ['b'];

      const result = planner.validate(p);
      expect(result.errors.some((e) => e.toLowerCase().includes('circular'))).toBe(true);
    });

    it('detects agent not in participants', () => {
      const p = planner.createPlan(makeDefinition());
      p.steps[0].agentId = 'ghost-agent';
      const result = planner.validate(p);
      expect(result.errors.some((e) => e.includes('not in participants'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // calculateExecutionOrder
  // -------------------------------------------------------------------------

  describe('calculateExecutionOrder', () => {
    it('returns topological flat order', () => {
      const def = makeDefinition({
        steps: [
          makeStep({ id: 'step1', dependencies: [] }),
          makeStep({ id: 'step2', dependencies: ['step1'] }),
          makeStep({ id: 'step3', dependencies: ['step1'] }),
        ],
      });
      const p = planner.createPlan(def);
      const order = planner.calculateExecutionOrder(p);

      expect(order.flatOrder.indexOf('step1')).toBeLessThan(order.flatOrder.indexOf('step2'));
      expect(order.flatOrder.indexOf('step1')).toBeLessThan(order.flatOrder.indexOf('step3'));
    });

    it('groups independent steps in same parallel group', () => {
      const def = makeDefinition({
        steps: [makeStep({ id: 'a', dependencies: [] }), makeStep({ id: 'b', dependencies: [] })],
      });
      const p = planner.createPlan(def);
      const order = planner.calculateExecutionOrder(p);
      // Both a and b have no deps — they are in the first group
      const firstGroup = order.parallelGroups[0];
      expect(firstGroup).toContain('a');
      expect(firstGroup).toContain('b');
    });

    it('builds the dependency graph correctly', () => {
      const def = makeDefinition({
        steps: [
          makeStep({ id: 'x', dependencies: [] }),
          makeStep({ id: 'y', dependencies: ['x'] }),
        ],
      });
      const p = planner.createPlan(def);
      const order = planner.calculateExecutionOrder(p);
      expect(order.graph.get('y')).toContain('x');
    });
  });

  // -------------------------------------------------------------------------
  // resetPlan
  // -------------------------------------------------------------------------

  describe('resetPlan', () => {
    it('creates a new plan with reset status', () => {
      const p = planner.createPlan(makeDefinition());
      p.status = 'completed';
      p.steps[0].status = 'completed';

      const reset = planner.resetPlan(p);
      expect(reset.id).not.toBe(p.id);
      expect(reset.status).toBe('draft');
      expect(reset.steps[0].status).toBe('pending');
    });

    it('preserves goal and participants', () => {
      const p = planner.createPlan(makeDefinition({ goal: 'original' }));
      const reset = planner.resetPlan(p);
      expect(reset.goal).toBe('original');
    });

    it('clears start/complete timestamps', () => {
      const p = planner.createPlan(makeDefinition());
      (p as any).startedAt = Date.now();
      (p as any).completedAt = Date.now();

      const reset = planner.resetPlan(p);
      expect(reset.startedAt).toBeUndefined();
      expect(reset.completedAt).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// PlanBuilder (fluent API)
// ---------------------------------------------------------------------------

describe('PlanBuilder', () => {
  it('builds a valid plan using the fluent API', () => {
    const agent1 = makeAgent('a1');
    const p = plan('deploy service')
      .name('Deploy Plan')
      .agent(agent1)
      .step({ agent: 'a1', action: 'run' })
      .timeout(30000)
      .tags('ci', 'prod')
      .priority(3)
      .metadata({ env: 'staging' })
      .build();

    expect(p.goal).toBe('deploy service');
    expect(p.name).toBe('Deploy Plan');
    expect(p.priority).toBe(3);
    expect(p.tags).toContain('ci');
    expect(p.metadata?.env).toBe('staging');
    expect(p.constraints.some((c) => c.type === 'timeout')).toBe(true);
  });

  it('buildUnsafe skips validation', () => {
    // An otherwise invalid plan (no steps) — should not throw with buildUnsafe
    const agent1 = makeAgent('a1');
    const builder = new PlanBuilder('minimal');
    builder.agent(agent1);
    // No steps, no timeout — would fail validate
    expect(() => builder.buildUnsafe()).not.toThrow();
  });

  it('throws on build if validation fails', () => {
    const builder = new PlanBuilder('failing');
    makeAgent('a1');
    // Step references non-existent agent
    builder.step({ agent: 'ghost', action: 'ping' });
    expect(() => builder.build()).toThrow();
  });

  it('concurrency constraint shorthand', () => {
    const agent1 = makeAgent('a1');
    const p = plan('test')
      .agent(agent1)
      .step({ agent: 'a1', action: 'do' })
      .timeout(60000)
      .concurrency(4)
      .build();
    expect(p.constraints.some((c) => c.type === 'concurrency')).toBe(true);
  });

  it('agents() adds multiple agents at once', () => {
    const a1 = makeAgent('a1');
    const a2 = makeAgent('a2');
    const p = plan('multi-agent')
      .agents([a1, a2])
      .step({ agent: 'a1', action: 'do' })
      .timeout(60000)
      .build();
    const ids = p.participants.map((a) => a.id);
    expect(ids).toContain('a1');
    expect(ids).toContain('a2');
  });
});

// ---------------------------------------------------------------------------
// getDefaultPlanner singleton
// ---------------------------------------------------------------------------

describe('getDefaultPlanner', () => {
  it('returns a ChoreographyPlanner', () => {
    const p = getDefaultPlanner();
    expect(p).toBeInstanceOf(ChoreographyPlanner);
  });

  it('returns the same instance on multiple calls', () => {
    expect(getDefaultPlanner()).toBe(getDefaultPlanner());
  });
});
