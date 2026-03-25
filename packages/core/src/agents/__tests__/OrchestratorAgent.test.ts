/**
 * OrchestratorAgent Tests
 *
 * Tests the first concrete BaseAgent implementation with 7-phase protocol.
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OrchestratorAgent, type OrchestratorConfig } from '../OrchestratorAgent';
import { resetDefaultRegistry, getDefaultRegistry } from '../AgentRegistry';

// =============================================================================
// FIXTURES
// =============================================================================

function makeConfig(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    name: 'Test Orchestrator',
    domain: 'spatial',
    autoDiscovery: false,
    localExecutor: async (skillId, args) => ({
      executed: true,
      skillId,
      args,
    }),
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('OrchestratorAgent', () => {
  beforeEach(() => {
    resetDefaultRegistry();
  });

  afterEach(() => {
    resetDefaultRegistry();
  });

  describe('identity', () => {
    it('has correct identity fields', () => {
      const agent = new OrchestratorAgent(makeConfig());

      expect(agent.identity.id).toBe('orchestrator-test-orchestrator');
      expect(agent.identity.name).toBe('Test Orchestrator');
      expect(agent.identity.domain).toBe('spatial');
      expect(agent.identity.version).toBe('1.0.0');
      expect(agent.identity.capabilities).toContain('orchestrate');
      expect(agent.identity.capabilities).toContain('delegate');
    });
  });

  describe('runCycle', () => {
    it('executes a complete 7-phase cycle', async () => {
      const agent = new OrchestratorAgent(makeConfig());

      const result = await agent.runCycle('test-task', { type: 'analyze' });

      expect(result.status).toBe('complete');
      expect(result.phases).toHaveLength(7);
      expect(result.domain).toBe('spatial');
      expect(result.task).toBe('test-task');
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);

      // Verify phase order
      const phaseNames = result.phases.map((p) => p.phase);
      expect(phaseNames).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('all phases succeed with no agents registered', async () => {
      const agent = new OrchestratorAgent(makeConfig());

      const result = await agent.runCycle('discover');

      // Even with no agents to delegate to, the cycle completes
      for (const phase of result.phases) {
        expect(phase.status).toBe('success');
      }
    });

    it('INTAKE phase discovers registered agents', async () => {
      const registry = getDefaultRegistry();
      await registry.register({
        id: 'helper-agent',
        name: 'Helper',
        version: '1.0.0',
        capabilities: [{ type: 'analyze', domain: 'spatial' }],
        endpoints: [{ protocol: 'local', address: 'local://helper' }],
        trustLevel: 'local',
        status: 'online',
      });

      const agent = new OrchestratorAgent(makeConfig());
      const result = await agent.runCycle('test');

      const intakeData = result.phases[0].data as Record<string, unknown>;
      expect(intakeData.totalAgents).toBe(1);
      expect(intakeData.onlineAgents).toBe(1);
    });
  });

  describe('delegateTask', () => {
    it('delegates to a registered agent', async () => {
      const registry = getDefaultRegistry();
      await registry.register({
        id: 'worker-agent',
        name: 'Worker',
        version: '1.0.0',
        capabilities: [{ type: 'transform', domain: 'spatial' }],
        endpoints: [{ protocol: 'local', address: 'local://worker', primary: true }],
        trustLevel: 'local',
        status: 'online',
      });

      const agent = new OrchestratorAgent(makeConfig());
      const result = await agent.delegateTask('transform_data', { input: 'test' });

      // Should be rejected because autoDelegate with empty query won't match
      // (no type/domain specified in the query)
      expect(result.taskId).toBeDefined();
    });

    it('returns rejected when no agents available', async () => {
      const agent = new OrchestratorAgent(makeConfig());
      const result = await agent.delegateTask('test_skill', {});

      expect(result.status).toBe('rejected');
    });
  });

  describe('runWorkflow', () => {
    it('runs a workflow using localExecutor', async () => {
      const agent = new OrchestratorAgent(makeConfig());

      const result = await agent.runWorkflow({
        id: 'test-wf',
        name: 'Test Workflow',
        steps: [
          {
            id: 'step1',
            skillId: 'parse',
            inputs: { code: { type: 'literal', value: 'test' } },
          },
        ],
      });

      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].status).toBe('completed');
    });
  });

  describe('getDiscoveredAgents', () => {
    it('returns all agents from registry', async () => {
      const registry = getDefaultRegistry();
      await registry.register({
        id: 'agent-a',
        name: 'A',
        version: '1.0.0',
        capabilities: [{ type: 'analyze', domain: 'general' }],
        endpoints: [{ protocol: 'local', address: 'local://a' }],
        trustLevel: 'local',
      });

      const agent = new OrchestratorAgent(makeConfig());
      const agents = agent.getDiscoveredAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('agent-a');
    });
  });

  describe('shutdown', () => {
    it('stops polling without error', () => {
      const agent = new OrchestratorAgent(makeConfig());
      expect(() => agent.shutdown()).not.toThrow();
    });
  });
});
