/**
 * ChoreographyEngine Production Tests
 * Sprint CLIII - Multi-agent choreography lifecycle
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChoreographyEngine,
  DEFAULT_ENGINE_CONFIG,
  getDefaultEngine,
  resetDefaultEngine,
} from '../ChoreographyEngine';
import type { ChoreographyStep } from '../ChoreographyTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<ChoreographyStep> = {}): ChoreographyStep {
  return {
    id: `step_${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Step',
    agentId: 'agent-1',
    action: 'do_something',
    inputs: {},
    dependencies: [],
    status: 'pending',
    timeout: 5000,
    retries: 0,
    ...overrides,
  };
}

// Minimal participant that satisfies the validator
const AGENT_1 = {
  id: 'agent-1',
  name: 'agent-1',
  version: '1.0.0',
  capabilities: [],
  endpoints: [],
  trustLevel: 'local' as const,
};

function makeSuccessHandler() {
  return vi.fn().mockResolvedValue({ success: true, output: { result: 42 } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChoreographyEngine', () => {
  let engine: ChoreographyEngine;

  beforeEach(() => {
    engine = new ChoreographyEngine({ verbose: false });
    engine.setActionHandler(makeSuccessHandler());
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  describe('DEFAULT_ENGINE_CONFIG', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_ENGINE_CONFIG.maxConcurrency).toBe(4);
      expect(DEFAULT_ENGINE_CONFIG.executeFallback).toBe(true);
      expect(DEFAULT_ENGINE_CONFIG.autoHitlPause).toBe(true);
      expect(DEFAULT_ENGINE_CONFIG.verbose).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Plan creation
  // -------------------------------------------------------------------------

  describe('createPlan', () => {
    it('returns a plan with correct fields', () => {
      const step = makeStep();
      const plan = engine.createPlan('Deploy', [], [step]);
      expect(plan.id).toBeTruthy();
      expect(plan.goal).toBe('Deploy');
      expect(plan.status).toBe('draft');
      expect(plan.steps).toHaveLength(1);
      expect(plan.createdAt).toBeGreaterThan(0);
    });

    it('emits plan:created event', () => {
      const listener = vi.fn();
      engine.on('plan:created', listener);
      engine.createPlan('goal', [], [makeStep()]);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('preserves agent participants', () => {
      const agent = { id: 'agent-1', name: 'A1' } as any;
      const plan = engine.createPlan('goal', [agent], []);
      expect(plan.participants).toHaveLength(1);
      expect(plan.participants[0].id).toBe('agent-1');
    });
  });

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  describe('execute', () => {
    it('throws if no action handler registered', async () => {
      const bare = new ChoreographyEngine();
      const plan = bare.createPlan('goal', [], [makeStep()]);
      await expect(bare.execute(plan)).rejects.toThrow('No action handler');
    });

    it('executes a single-step plan successfully', async () => {
      const step = makeStep();
      const plan = engine.createPlan('goal', [AGENT_1], [step]);
      const result = await engine.execute(plan);
      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toBe(1);
      expect(result.stepsFailed).toBe(0);
    });

    it('emits plan:started and plan:completed events', async () => {
      const started = vi.fn();
      const completed = vi.fn();
      engine.on('plan:started', started);
      engine.on('plan:completed', completed);

      const plan = engine.createPlan('goal', [AGENT_1], [makeStep()]);
      await engine.execute(plan);

      expect(started).toHaveBeenCalledOnce();
      expect(completed).toHaveBeenCalledOnce();
    });

    it('marks plan status as completed on success', async () => {
      const plan = engine.createPlan('goal', [AGENT_1], [makeStep()]);
      await engine.execute(plan);
      expect(plan.status).toBe('completed');
    });

    it('marks plan as failed when action throws', async () => {
      // ActionHandler must throw to fail a step (return value = outputs, not success flag)
      engine.setActionHandler(vi.fn().mockRejectedValue(new Error('action failed')));
      const plan = engine.createPlan('goal', [AGENT_1], [makeStep({ retries: 0 })]);
      const result = await engine.execute(plan);
      expect(result.success).toBe(false);
      expect(result.stepsFailed).toBe(1);
    });

    it('reports duration after completion', async () => {
      const plan = engine.createPlan('goal', [AGENT_1], [makeStep()]);
      const result = await engine.execute(plan);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('executes multi-step plans with dependencies in order', async () => {
      const order: string[] = [];
      // ActionHandler signature: (agent, action, inputs, context)
      // Step ID is in context.currentStep.id
      engine.setActionHandler(
        vi
          .fn()
          .mockImplementation(async (_agent: any, _action: any, _inputs: any, context: any) => {
            order.push(context.currentStep.id);
            return {};
          })
      );

      const step1 = makeStep({ id: 'step1', dependencies: [] });
      const step2 = makeStep({ id: 'step2', dependencies: ['step1'] });
      const plan = engine.createPlan('goal', [AGENT_1], [step1, step2]);
      const result = await engine.execute(plan);
      expect(result.success).toBe(true);
      expect(order.indexOf('step1')).toBeLessThan(order.indexOf('step2'));
    });
  });

  // -------------------------------------------------------------------------
  // Pause / Resume / Cancel
  // -------------------------------------------------------------------------

  describe('pause / resume', () => {
    it('silently ignores pause on non-existent plan', async () => {
      await expect(engine.pause('ghost-plan')).resolves.toBeUndefined();
    });

    it('silently ignores resume on non-existent plan', async () => {
      await expect(engine.resume('ghost-plan')).resolves.toBeUndefined();
    });
  });

  describe('cancel', () => {
    it('silently ignores cancel on non-existent plan', async () => {
      await expect(engine.cancel('ghost-plan')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Active plans
  // -------------------------------------------------------------------------

  describe('getActivePlans', () => {
    it('returns empty array initially', () => {
      expect(engine.getActivePlans()).toHaveLength(0);
    });
  });

  describe('getPlanStatus', () => {
    it('returns null for unknown plan', () => {
      expect(engine.getPlanStatus('ghost')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // HITL gates
  // -------------------------------------------------------------------------

  describe('HITL gates', () => {
    it('throws approveHitl for unknown plan', () => {
      expect(() => engine.approveHitl('bad-plan', 'step1')).toThrow('Plan not found');
    });

    it('throws rejectHitl for unknown plan', () => {
      expect(() => engine.rejectHitl('bad-plan', 'step1', 'no reason')).toThrow('Plan not found');
    });
  });

  // -------------------------------------------------------------------------
  // Registry
  // -------------------------------------------------------------------------

  describe('setRegistry', () => {
    it('accepts a registry without throwing', () => {
      const registry = { agents: new Map() } as any;
      expect(() => engine.setRegistry(registry)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Default engine singleton
  // -------------------------------------------------------------------------

  describe('getDefaultEngine / resetDefaultEngine', () => {
    beforeEach(() => resetDefaultEngine());

    it('returns a ChoreographyEngine instance', () => {
      const eng = getDefaultEngine();
      expect(eng).toBeInstanceOf(ChoreographyEngine);
    });

    it('returns the same instance on repeated calls', () => {
      const a = getDefaultEngine();
      const b = getDefaultEngine();
      expect(a).toBe(b);
    });

    it('creates a fresh instance after reset', () => {
      const a = getDefaultEngine();
      resetDefaultEngine();
      const b = getDefaultEngine();
      expect(a).not.toBe(b);
    });
  });
});
