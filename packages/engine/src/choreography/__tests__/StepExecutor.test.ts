/**
 * StepExecutor Unit Tests
 *
 * Tests for individual step execution, retries, and timeouts.
 *
 * @version 3.1.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StepExecutor, ActionHandler } from '../StepExecutor';
import type { ChoreographyStep, StepContext, ChoreographyPlan } from '../ChoreographyTypes';
import type { AgentManifest } from '../../agents/AgentManifest';

// =============================================================================
// MOCKS
// =============================================================================

function createMockAgent(id: string, capabilities: string[] = []): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: capabilities.map((c) => ({ type: c as any, name: c })),
  };
}

function createMockStep(overrides: Partial<ChoreographyStep> = {}): ChoreographyStep {
  return {
    id: 'step-1',
    name: 'test-step',
    agentId: 'agent-1',
    action: 'test-action',
    status: 'pending',
    inputs: {},
    outputs: {},
    dependencies: [],
    ...overrides,
  };
}

function createMockPlan(steps: ChoreographyStep[], agents: AgentManifest[]): ChoreographyPlan {
  return {
    id: 'plan-1',
    goal: 'Test plan',
    steps,
    participants: agents,
    constraints: [],
    status: 'running',
    createdAt: Date.now(),
  };
}

function createMockContext(
  step: ChoreographyStep,
  agents: AgentManifest[],
  overrides: Partial<StepContext> = {}
): StepContext {
  const plan = createMockPlan([step], agents);
  return {
    plan,
    currentStep: step,
    agents: new Map(agents.map((a) => [a.id, a])),
    stepOutputs: new Map(),
    variables: {},
    startTime: Date.now(),
    elapsedTime: 0,
    ...overrides,
  };
}

// =============================================================================
// STEP EXECUTOR TESTS
// =============================================================================

describe('StepExecutor', () => {
  let executor: StepExecutor;
  let mockHandler: ActionHandler;
  const mockAgent = createMockAgent('agent-1', ['test-action']);

  beforeEach(() => {
    mockHandler = vi.fn().mockResolvedValue({ result: 'success' });
    executor = new StepExecutor();
    executor.setActionHandler(mockHandler);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('should execute a step successfully', async () => {
      const step = createMockStep();
      const context = createMockContext(step, [mockAgent]);

      const result = await executor.execute(step, context);

      expect(result.stepId).toBe('step-1');
      expect(result.success).toBe(true);
      expect(result.outputs).toEqual({ result: 'success' });
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1' }),
        'test-action',
        {},
        context
      );
    });

    it('should pass inputs to action handler', async () => {
      const step = createMockStep({
        inputs: { key: 'value', count: 42 },
      });
      const context = createMockContext(step, [mockAgent]);

      await executor.execute(step, context);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1' }),
        'test-action',
        { key: 'value', count: 42 },
        context
      );
    });

    it('should resolve input references from previous steps', async () => {
      const step = createMockStep({
        inputs: { data: '${step-0.result}' },
      });
      const context = createMockContext(step, [mockAgent], {
        stepOutputs: new Map([['step-0', { result: 'previous-output' }]]),
      });

      await executor.execute(step, context);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1' }),
        'test-action',
        { data: 'previous-output' },
        context
      );
    });

    it('should resolve state variable references', async () => {
      const step = createMockStep({
        inputs: { name: 'state.username' },
      });
      const context = createMockContext(step, [mockAgent], {
        variables: { username: 'testuser' },
      });

      await executor.execute(step, context);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1' }),
        'test-action',
        { name: 'testuser' },
        context
      );
    });

    it('should return failed status on handler error', async () => {
      mockHandler = vi.fn().mockRejectedValue(new Error('Action failed'));
      executor = new StepExecutor({ defaultRetry: { strategy: 'none', maxRetries: 0, delay: 0 } });
      executor.setActionHandler(mockHandler);

      const step = createMockStep();
      const context = createMockContext(step, [mockAgent]);

      const result = await executor.execute(step, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Action failed');
    });

    it('should record execution duration', async () => {
      const step = createMockStep();
      const context = createMockContext(step, [mockAgent]);

      const result = await executor.execute(step, context);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('retries', () => {
    it('should retry on failure up to maxRetries', async () => {
      let callCount = 0;
      mockHandler = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Temporary failure');
        }
        return { result: 'success' };
      });
      executor = new StepExecutor({
        defaultRetry: { strategy: 'fixed', maxRetries: 3, delay: 10 },
      });
      executor.setActionHandler(mockHandler);

      const step = createMockStep();
      const context = createMockContext(step, [mockAgent]);

      const result = await executor.execute(step, context);

      expect(result.success).toBe(true);
      expect(mockHandler).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting retries', async () => {
      mockHandler = vi.fn().mockRejectedValue(new Error('Persistent failure'));
      executor = new StepExecutor({
        defaultRetry: { strategy: 'fixed', maxRetries: 2, delay: 10 },
      });
      executor.setActionHandler(mockHandler);

      const step = createMockStep();
      const context = createMockContext(step, [mockAgent]);

      const result = await executor.execute(step, context);

      expect(result.success).toBe(false);
      expect(mockHandler).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use exponential backoff when configured', async () => {
      let callCount = 0;
      mockHandler = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Failure');
        }
        return { result: 'success' };
      });
      executor = new StepExecutor({
        defaultRetry: { strategy: 'exponential', maxRetries: 3, delay: 100, backoffMultiplier: 2 },
      });
      executor.setActionHandler(mockHandler);

      const step = createMockStep();
      const context = createMockContext(step, [mockAgent]);

      const result = await executor.execute(step, context);

      expect(result.success).toBe(true);
      expect(mockHandler).toHaveBeenCalledTimes(3);
    });
  });

  describe('timeouts', () => {
    it('should timeout if step takes too long', async () => {
      vi.useFakeTimers();

      mockHandler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return { result: 'success' };
      });
      executor = new StepExecutor({
        defaultTimeout: 1000,
        defaultRetry: { strategy: 'none', maxRetries: 0, delay: 0 },
      });
      executor.setActionHandler(mockHandler);

      const step = createMockStep({ timeout: 1000 });
      const context = createMockContext(step, [mockAgent]);

      const executePromise = executor.execute(step, context);
      await vi.advanceTimersByTimeAsync(1001);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('conditions', () => {
    it('should skip step when condition evaluates to false', async () => {
      const step = createMockStep({
        condition: 'false',
      });
      const context = createMockContext(step, [mockAgent]);

      const result = await executor.execute(step, context);

      expect(result.success).toBe(true); // Skipped steps are "successful"
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should execute step when condition evaluates to true', async () => {
      const step = createMockStep({
        condition: 'true',
      });
      const context = createMockContext(step, [mockAgent]);

      const result = await executor.execute(step, context);

      expect(result.success).toBe(true);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should evaluate conditions with provided function', async () => {
      const step = createMockStep({
        condition: (ctx) => ctx.variables.enabled === true,
      });
      const context = createMockContext(step, [mockAgent], {
        variables: { enabled: true },
      });

      const result = await executor.execute(step, context);

      expect(result.success).toBe(true);
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('abort handling', () => {
    it('should cancel when abort controller is used', async () => {
      mockHandler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return { result: 'success' };
      });
      executor = new StepExecutor();
      executor.setActionHandler(mockHandler);

      const step = createMockStep();
      const context = createMockContext(step, [mockAgent]);

      // Wait for step:executing event to ensure step is registered before cancelling
      const executingPromise = new Promise<void>((resolve) => {
        executor.once('step:executing', () => resolve());
      });

      const executePromise = executor.execute(step, context);

      // Wait for step to actually start executing
      await executingPromise;
      executor.cancel(step.id);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');
    });
  });
});
