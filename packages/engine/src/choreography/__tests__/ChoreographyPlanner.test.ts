/**
 * ChoreographyPlanner Unit Tests
 *
 * Tests for plan creation, validation, and execution order calculation.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChoreographyPlanner, plan, PlanBuilder } from '../ChoreographyPlanner';
import type { AgentManifest } from '../../agents/AgentManifest';

// =============================================================================
// MOCKS
// =============================================================================

function createMockAgent(id: string, capabilities: string[] = []): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: capabilities.map((name) => ({
      type: name as any,
      name,
      description: `${name} action`,
    })),
  };
}

// =============================================================================
// PLANNER TESTS
// =============================================================================

describe('ChoreographyPlanner', () => {
  let planner: ChoreographyPlanner;

  beforeEach(() => {
    planner = new ChoreographyPlanner();
  });

  describe('createPlan', () => {
    it('should create a valid plan with basic steps', () => {
      const agent = createMockAgent('agent-1', ['fetch', 'process']);

      const result = planner.createPlan({
        goal: 'Test workflow',
        agents: [agent],
        steps: [
          {
            name: 'step1',
            agent: 'agent-1',
            action: 'fetch',
            inputs: { url: 'https://example.com' },
          },
          {
            name: 'step2',
            agent: 'agent-1',
            action: 'process',
            inputs: { data: '${step1.result}' },
            dependsOn: ['step1'],
          },
        ],
      });

      expect(result.id).toBeDefined();
      expect(result.goal).toBe('Test workflow');
      expect(result.steps).toHaveLength(2);
      expect(result.status).toBe('draft');
    });

    it('should assign unique IDs to steps', () => {
      const agent = createMockAgent('agent-1', ['action']);

      const result = planner.createPlan({
        goal: 'ID test',
        agents: [agent],
        steps: [
          { name: 'step1', agent: 'agent-1', action: 'action' },
          { name: 'step2', agent: 'agent-1', action: 'action' },
        ],
      });

      expect(result.steps[0].id).toBeDefined();
      expect(result.steps[1].id).toBeDefined();
      expect(result.steps[0].id).not.toBe(result.steps[1].id);
    });

    it('should set creation timestamp', () => {
      const agent = createMockAgent('agent-1', ['action']);
      const before = Date.now();

      const result = planner.createPlan({
        goal: 'Timestamp test',
        agents: [agent],
        steps: [{ name: 'step1', agent: 'agent-1', action: 'action' }],
      });

      const after = Date.now();
      expect(result.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('validate', () => {
    it('should return valid for correct plans', () => {
      const agent = createMockAgent('agent-1', ['fetch', 'process']);

      const validPlan = planner.createPlan({
        goal: 'Valid workflow',
        agents: [agent],
        steps: [
          { name: 'step1', agent: 'agent-1', action: 'fetch' },
          { name: 'step2', agent: 'agent-1', action: 'process', dependsOn: ['step1'] },
        ],
      });

      const result = planner.validate(validPlan);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing agent references', () => {
      const agent = createMockAgent('agent-1', ['action']);

      // This should throw because 'non-existent' agent isn't in the participants
      expect(() => {
        planner.createPlan({
          goal: 'Missing agent',
          agents: [agent],
          steps: [{ name: 'step1', agent: 'non-existent', action: 'action' }],
        });
      }).toThrow();
    });

    it('should detect missing dependencies', () => {
      const agent = createMockAgent('agent-1', ['action']);

      // This should throw because 'missing-step' doesn't exist
      expect(() => {
        planner.createPlan({
          goal: 'Missing dependency',
          agents: [agent],
          steps: [
            {
              name: 'step1',
              agent: 'agent-1',
              action: 'action',
              dependsOn: ['missing-step'],
            },
          ],
        });
      }).toThrow();
    });

    it('should detect circular dependencies', () => {
      const agent = createMockAgent('agent-1', ['action']);

      const cyclicPlan = planner.createPlan({
        goal: 'Circular dependency',
        agents: [agent],
        steps: [
          {
            id: 'step1',
            name: 'step1',
            agent: 'agent-1',
            action: 'action',
            dependencies: ['step2'],
          },
          {
            id: 'step2',
            name: 'step2',
            agent: 'agent-1',
            action: 'action',
            dependencies: ['step1'],
          },
        ],
      });

      const result = planner.validate(cyclicPlan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('circular'))).toBe(true);
    });

    it('should detect empty plans', () => {
      const emptyPlan = planner.createPlan({
        goal: 'Empty plan',
        agents: [],
        steps: [],
      });

      const result = planner.validate(emptyPlan);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('no steps'))).toBe(true);
    });
  });

  describe('calculateExecutionOrder', () => {
    it('should return topologically sorted order', () => {
      const agent = createMockAgent('agent-1', ['a', 'b', 'c']);

      const createdPlan = planner.createPlan({
        goal: 'Execution order',
        agents: [agent],
        steps: [
          {
            id: 'step3',
            name: 'step3',
            agent: 'agent-1',
            action: 'c',
            dependencies: ['step1', 'step2'],
          },
          { id: 'step1', name: 'step1', agent: 'agent-1', action: 'a' },
          { id: 'step2', name: 'step2', agent: 'agent-1', action: 'b', dependencies: ['step1'] },
        ],
      });

      const order = planner.calculateExecutionOrder(createdPlan);

      // step1 must come before step2 and step3
      // step2 must come before step3
      const step1Idx = order.flatOrder.indexOf('step1');
      const step2Idx = order.flatOrder.indexOf('step2');
      const step3Idx = order.flatOrder.indexOf('step3');

      expect(step1Idx).toBeLessThan(step2Idx);
      expect(step1Idx).toBeLessThan(step3Idx);
      expect(step2Idx).toBeLessThan(step3Idx);
    });

    it('should handle independent steps', () => {
      const agent = createMockAgent('agent-1', ['a', 'b', 'c']);

      const createdPlan = planner.createPlan({
        goal: 'Independent steps',
        agents: [agent],
        steps: [
          { id: 'step1', name: 'step1', agent: 'agent-1', action: 'a' },
          { id: 'step2', name: 'step2', agent: 'agent-1', action: 'b' },
          { id: 'step3', name: 'step3', agent: 'agent-1', action: 'c' },
        ],
      });

      const order = planner.calculateExecutionOrder(createdPlan);
      expect(order.flatOrder).toHaveLength(3);
      expect(order.flatOrder).toContain('step1');
      expect(order.flatOrder).toContain('step2');
      expect(order.flatOrder).toContain('step3');
      // All independent steps should be in the first parallel group
      expect(order.parallelGroups[0]).toHaveLength(3);
    });
  });
});

// =============================================================================
// PLAN BUILDER TESTS
// =============================================================================

describe('PlanBuilder', () => {
  describe('fluent API', () => {
    it('should build a plan with fluent syntax', () => {
      const agent = createMockAgent('agent-1', ['analyze', 'report']);

      const result = plan('Analyze and report')
        .agent(agent)
        .step({
          name: 'analyze',
          agent: 'agent-1',
          action: 'analyze',
          inputs: { data: 'test-data' },
        })
        .step({ name: 'report', agent: 'agent-1', action: 'report', dependsOn: ['analyze'] })
        .build();

      expect(result.goal).toBe('Analyze and report');
      expect(result.participants).toHaveLength(1);
      expect(result.steps).toHaveLength(2);
    });

    it('should support HITL gates', () => {
      const agent = createMockAgent('agent-1', ['action']);

      const result = plan('HITL workflow')
        .agent(agent)
        .step({ name: 'step1', agent: 'agent-1', action: 'action', hitlGate: true })
        .build();

      expect(result.steps[0].hitlGate).toBe(true);
    });

    it('should support retry configuration', () => {
      const agent = createMockAgent('agent-1', ['action']);

      const result = plan('Retry workflow')
        .agent(agent)
        .step({ name: 'step1', agent: 'agent-1', action: 'action', retries: 3 })
        .build();

      expect(result.steps[0].retry).toBeDefined();
      expect(result.steps[0].retry?.maxRetries).toBe(3);
    });

    it('should support timeout configuration', () => {
      const agent = createMockAgent('agent-1', ['action']);

      const result = plan('Timeout workflow')
        .agent(agent)
        .step({ name: 'step1', agent: 'agent-1', action: 'action', timeout: 5000 })
        .build();

      expect(result.steps[0].timeout).toBe(5000);
    });

    it('should support conditions', () => {
      const agent = createMockAgent('agent-1', ['action']);

      const result = plan('Conditional workflow')
        .agent(agent)
        .step({
          name: 'step1',
          agent: 'agent-1',
          action: 'action',
          condition: 'input.enabled === true',
        })
        .build();

      expect(result.steps[0].condition).toBe('input.enabled === true');
    });

    it('should support parallel groups', () => {
      const agent = createMockAgent('agent-1', ['action']);

      const result = plan('Parallel workflow')
        .agent(agent)
        .step({ name: 'step1', agent: 'agent-1', action: 'action', parallelGroup: 'group1' })
        .step({ name: 'step2', agent: 'agent-1', action: 'action', parallelGroup: 'group1' })
        .build();

      expect(result.steps[0].parallelGroup).toBe('group1');
      expect(result.steps[1].parallelGroup).toBe('group1');
    });

    it('should support fallback steps', () => {
      const agent = createMockAgent('agent-1', ['action', 'fallback']);

      const result = plan('Fallback workflow')
        .agent(agent)
        .step({
          name: 'step1',
          agent: 'agent-1',
          action: 'action',
          fallbackStepId: 'fallback-step',
        })
        .step({ id: 'fallback-step', name: 'fallback-step', agent: 'agent-1', action: 'fallback' })
        .build();

      expect(result.steps[0].fallbackStepId).toBeDefined();
    });
  });
});
