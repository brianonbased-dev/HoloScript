/**
 * ChoreographyEngine Unit Tests
 *
 * Tests for plan execution orchestration.
 *
 * @version 3.1.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChoreographyEngine } from '../ChoreographyEngine';
import { ChoreographyPlanner } from '../ChoreographyPlanner';
import type { ChoreographyPlan, ChoreographyStep } from '../ChoreographyTypes';
import type { AgentManifest } from '../../agents/AgentManifest';

// =============================================================================
// MOCKS
// =============================================================================

function createMockAgent(id: string, capabilities: string[] = []): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    protocol: 'holoscript-agent/1.0',
    capabilities: capabilities.map((name) => ({
      name,
      description: `${name} action`,
      inputs: [],
      outputs: [],
    })),
    endpoints: {
      execute: `/agents/${id}/execute`,
    },
  };
}

function createSimplePlan(): ChoreographyPlan {
  const planner = new ChoreographyPlanner();
  const agent = createMockAgent('agent-1', ['fetch', 'process', 'store']);

  return planner.createPlan({
    goal: 'Simple workflow',
    agents: [agent],
    steps: [
      { name: 'fetch', agent: 'agent-1', action: 'fetch' },
      { name: 'process', agent: 'agent-1', action: 'process', dependsOn: ['fetch'] },
      { name: 'store', agent: 'agent-1', action: 'store', dependsOn: ['process'] },
    ],
  });
}

// =============================================================================
// ENGINE TESTS
// =============================================================================

describe('ChoreographyEngine', () => {
  let engine: ChoreographyEngine;

  beforeEach(() => {
    engine = new ChoreographyEngine();
  });

  describe('execute', () => {
    it('should execute a simple plan successfully', async () => {
      engine.setActionHandler(async (agent, action, inputs) => {
        return { [`${action}_result`]: 'done' };
      });

      const plan = createSimplePlan();
      const result = await engine.execute(plan);

      expect(result.status).toBe('completed');
      expect(result.planId).toBe(plan.id);
      expect(result.completedSteps).toHaveLength(3);
    });

    it('should execute steps in correct order', async () => {
      const executionOrder: string[] = [];

      engine.setActionHandler(async (agent, action) => {
        executionOrder.push(action);
        return { result: action };
      });

      const plan = createSimplePlan();
      await engine.execute(plan);

      expect(executionOrder).toEqual(['fetch', 'process', 'store']);
    });

    it('should pass outputs from previous steps', async () => {
      const receivedInputs: Record<string, unknown>[] = [];

      engine.setActionHandler(async (agent, action, inputs, context) => {
        receivedInputs.push({ action, inputs: { ...inputs } });

        if (action === 'fetch') {
          return { data: 'fetched-data' };
        }
        return { processed: true };
      });

      const planner = new ChoreographyPlanner();
      const agent = createMockAgent('agent-1', ['fetch', 'process']);

      const plan = planner.createPlan({
        goal: 'Data passing',
        agents: [agent],
        steps: [
          { name: 'fetch', agent: 'agent-1', action: 'fetch' },
          {
            name: 'process',
            agent: 'agent-1',
            action: 'process',
            inputs: { data: '${fetch.data}' },
            dependsOn: ['fetch'],
          },
        ],
      });

      await engine.execute(plan);

      expect(receivedInputs[1].inputs).toEqual({ data: 'fetched-data' });
    });

    it('should handle step failures', async () => {
      engine.setActionHandler(async (agent, action) => {
        if (action === 'process') {
          throw new Error('Processing failed');
        }
        return { result: 'ok' };
      });

      const plan = createSimplePlan();
      // Disable retries for faster test execution
      plan.steps.forEach((step) => {
        step.retry = { maxRetries: 0, strategy: 'fixed', delay: 0 };
      });
      const result = await engine.execute(plan);

      expect(result.status).toBe('failed');
      expect(result.failedSteps.some((s) => s.name === 'process')).toBe(true);
    });

    it('should execute independent steps in parallel', async () => {
      const startTimes: Record<string, number> = {};
      const endTimes: Record<string, number> = {};

      engine.setActionHandler(async (agent, action) => {
        startTimes[action] = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 50));
        endTimes[action] = Date.now();
        return { result: action };
      });

      const planner = new ChoreographyPlanner();
      const agent = createMockAgent('agent-1', ['a', 'b', 'c']);

      const plan = planner.createPlan({
        goal: 'Parallel execution',
        agents: [agent],
        steps: [
          { name: 'a', agent: 'agent-1', action: 'a', parallelGroup: 'group1' },
          { name: 'b', agent: 'agent-1', action: 'b', parallelGroup: 'group1' },
          { name: 'c', agent: 'agent-1', action: 'c', dependsOn: ['a', 'b'] },
        ],
      });

      await engine.execute(plan);

      // Steps a and b should start at roughly the same time
      const startDiff = Math.abs(startTimes['a'] - startTimes['b']);
      expect(startDiff).toBeLessThan(20); // Should be nearly simultaneous

      // Step c should start after both a and b complete
      expect(startTimes['c']).toBeGreaterThanOrEqual(endTimes['a']);
      expect(startTimes['c']).toBeGreaterThanOrEqual(endTimes['b']);
    });

    it('should provide variables to steps', async () => {
      let receivedVars: Record<string, unknown> = {};

      engine.setActionHandler(async (agent, action, inputs, context) => {
        receivedVars = { ...context.variables };
        return { result: 'ok' };
      });

      const plan = createSimplePlan();
      await engine.execute(plan, { apiKey: 'secret-123', debug: true });

      expect(receivedVars.apiKey).toBe('secret-123');
      expect(receivedVars.debug).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit plan:started event', async () => {
      const startedHandler = vi.fn();
      engine.on('plan:started', startedHandler);

      engine.setActionHandler(async () => ({ result: 'ok' }));

      const plan = createSimplePlan();
      await engine.execute(plan);

      expect(startedHandler).toHaveBeenCalledWith(expect.objectContaining({ id: plan.id }));
    });

    it('should emit plan:completed event', async () => {
      const completedHandler = vi.fn();
      engine.on('plan:completed', completedHandler);

      engine.setActionHandler(async () => ({ result: 'ok' }));

      const plan = createSimplePlan();
      await engine.execute(plan);

      expect(completedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ planId: plan.id, status: 'completed' })
      );
    });

    it('should emit step:started events', async () => {
      const stepStartedHandler = vi.fn();
      engine.on('step:started', stepStartedHandler);

      engine.setActionHandler(async () => ({ result: 'ok' }));

      const plan = createSimplePlan();
      await engine.execute(plan);

      expect(stepStartedHandler).toHaveBeenCalledTimes(3);
    });

    it('should emit step:completed events', async () => {
      const stepCompletedHandler = vi.fn();
      engine.on('step:completed', stepCompletedHandler);

      engine.setActionHandler(async () => ({ result: 'ok' }));

      const plan = createSimplePlan();
      await engine.execute(plan);

      expect(stepCompletedHandler).toHaveBeenCalledTimes(3);
    });
  });

  describe('pause and resume', () => {
    it('should pause execution', async () => {
      const executedSteps: string[] = [];

      engine.setActionHandler(async (agent, action) => {
        executedSteps.push(action);
        return { result: action };
      });

      const plan = createSimplePlan();

      // Start execution
      const executePromise = engine.execute(plan);

      // Pause after a short delay
      setTimeout(async () => {
        await engine.pause(plan.id);
      }, 10);

      // Wait a bit then resume
      setTimeout(async () => {
        await engine.resume(plan.id);
      }, 100);

      await executePromise;

      expect(executedSteps).toHaveLength(3);
    });
  });

  describe('cancel', () => {
    it('should cancel running plan', async () => {
      const executedSteps: string[] = [];

      engine.setActionHandler(async (agent, action) => {
        executedSteps.push(action);
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { result: action };
      });

      const plan = createSimplePlan();

      // Start execution
      const executePromise = engine.execute(plan);

      // Cancel after first step starts
      setTimeout(async () => {
        await engine.cancel(plan.id);
      }, 10);

      const result = await executePromise;

      expect(result.status).toBe('cancelled');
    });
  });

  describe('HITL gates', () => {
    it('should pause at HITL gate and emit event', async () => {
      const hitlHandler = vi.fn();
      engine.on('hitl:required', hitlHandler);

      engine.setActionHandler(async () => ({ result: 'ok' }));

      const planner = new ChoreographyPlanner();
      const agent = createMockAgent('agent-1', ['action']);

      const plan = planner.createPlan({
        goal: 'HITL workflow',
        agents: [agent],
        steps: [
          {
            name: 'step1',
            agent: 'agent-1',
            action: 'action',
            hitlGate: { prompt: 'Approve this step?', required: true },
          },
        ],
      });

      // Start execution in background
      const executePromise = engine.execute(plan);

      // Wait for HITL event
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(hitlHandler).toHaveBeenCalled();

      // Approve the HITL
      engine.approveHitl(plan.id, plan.steps[0].id);

      const result = await executePromise;
      expect(result.status).toBe('completed');
    });

    it('should fail plan when HITL is rejected', async () => {
      engine.setActionHandler(async () => ({ result: 'ok' }));

      const planner = new ChoreographyPlanner();
      const agent = createMockAgent('agent-1', ['action']);

      const plan = planner.createPlan({
        goal: 'HITL rejection',
        agents: [agent],
        steps: [
          {
            name: 'step1',
            agent: 'agent-1',
            action: 'action',
            hitlGate: { prompt: 'Approve?', required: true },
          },
        ],
      });

      const executePromise = engine.execute(plan);

      await new Promise((resolve) => setTimeout(resolve, 50));

      engine.rejectHitl(plan.id, plan.steps[0].id, 'Not approved');

      const result = await executePromise;
      expect(result.status).toBe('failed');
    });
  });

  describe('fallback execution', () => {
    it('should execute fallback step on failure', async () => {
      const executedSteps: string[] = [];

      engine.setActionHandler(async (agent, action) => {
        executedSteps.push(action);
        if (action === 'main') {
          throw new Error('Main action failed');
        }
        return { result: 'fallback-success' };
      });

      const planner = new ChoreographyPlanner();
      const agent = createMockAgent('agent-1', ['main', 'fallback']);

      const plan = planner.createPlan({
        goal: 'Fallback workflow',
        agents: [agent],
        steps: [
          {
            name: 'main-step',
            agent: 'agent-1',
            action: 'main',
            fallbackStepId: 'fallback-step',
          },
          {
            name: 'fallback-step',
            agent: 'agent-1',
            action: 'fallback',
          },
        ],
      });

      // Disable retries for faster test execution
      plan.steps.forEach((step) => {
        step.retry = { maxRetries: 0, strategy: 'fixed', delay: 0 };
      });

      const result = await engine.execute(plan);

      expect(executedSteps).toContain('fallback');
      expect(result.status).toBe('completed');
    });
  });
});
