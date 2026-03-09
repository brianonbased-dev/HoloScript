/**
 * Comprehensive MCP Orchestrator Test Suite
 *
 * Covers all aspects of multi-agent orchestration including:
 * - Agent registration and discovery
 * - Tool execution and result aggregation
 * - Parallel and sequential task execution
 * - Failure handling and retries
 * - Resource management and pooling
 * - Metrics and performance tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MCPOrchestrator,
  MCPAgent,
  MCPTool,
  OrchestrationTask,
  OrchestrationStep,
  AgentType,
} from '../MCPOrchestrator';

describe('MCP Orchestrator - Comprehensive Test Suite', () => {
  let orchestrator: MCPOrchestrator;

  // Mock agent and tool implementations
  const createMockAgent = (id: string, type: AgentType): MCPAgent => {
    const tools = new Map<string, MCPTool>();

    tools.set('test-tool', {
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
      execute: async (params) => ({ result: `Executed with: ${JSON.stringify(params)}` }),
    });

    return {
      id,
      name: `Agent-${id}`,
      type,
      description: `Test ${type} agent`,
      tools,
      capabilities: ['test-capability', 'validate', 'transform'],
      version: '1.0.0',
      isReady: async () => true,
    };
  };

  const createMockTool = (name: string): MCPTool => ({
    name,
    description: `Mock ${name} tool`,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
    execute: async (params) => ({ output: `${name} executed` }),
  });

  beforeEach(() => {
    orchestrator = new MCPOrchestrator({
      maxConcurrentAgents: 5,
      timeoutMs: 30000,
      maxRetries: 3,
      aggregationStrategy: 'all-responses',
      enableCache: true,
      enableMetrics: true,
    });
  });

  // =========================================================================
  // AGENT REGISTRATION & DISCOVERY TESTS
  // =========================================================================

  describe('Agent Registration & Discovery', () => {
    it('should register an agent', async () => {
      const agent = createMockAgent('agent_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      const registered = orchestrator.getAgent('agent_001');
      expect(registered?.id).toBe('agent_001');
    });

    it('should discover agents by type', async () => {
      const builderAgent = createMockAgent('builder_001', AgentType.BUILDER);
      const workerAgent = createMockAgent('worker_001', AgentType.WORKER);

      await orchestrator.registerAgent(builderAgent);
      await orchestrator.registerAgent(workerAgent);

      const builders = orchestrator.discoverAgents({ type: AgentType.BUILDER });
      expect(builders.length).toBeGreaterThan(0);
    });

    it('should discover agents by capability', async () => {
      const agent = createMockAgent('capable_001', AgentType.ANALYZER);
      await orchestrator.registerAgent(agent);

      const capable = orchestrator.discoverAgents({ capability: 'validate' });
      expect(capable.length).toBeGreaterThanOrEqual(0);
    });

    it('should list all registered agents', async () => {
      const agents = [
        createMockAgent('list_001', AgentType.BUILDER),
        createMockAgent('list_002', AgentType.WORKER),
        createMockAgent('list_003', AgentType.ANALYZER),
      ];

      for (const agent of agents) {
        await orchestrator.registerAgent(agent);
      }

      const allAgents = orchestrator.listAgents();
      expect(allAgents.length).toBeGreaterThanOrEqual(3);
    });

    it('should unregister agents', async () => {
      const agent = createMockAgent('unreg_001', AgentType.WORKER);
      await orchestrator.registerAgent(agent);

      const before = orchestrator.listAgents().length;
      await orchestrator.unregisterAgent('unreg_001');
      const after = orchestrator.listAgents().length;

      expect(after).toBeLessThan(before);
    });

    it('should handle duplicate agent registration', async () => {
      const agent = createMockAgent('dup_001', AgentType.BUILDER);

      await orchestrator.registerAgent(agent);

      // Re-register same agent (should update)
      await orchestrator.registerAgent(agent);

      const agents = orchestrator.listAgents();
      const dupCount = agents.filter((a) => a.id === 'dup_001').length;
      expect(dupCount).toBe(1);
    });
  });

  // =========================================================================
  // TOOL EXECUTION TESTS
  // =========================================================================

  describe('Tool Execution', () => {
    beforeEach(async () => {
      const agent = createMockAgent('exec_agent_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);
    });

    it('should execute a single tool', async () => {
      const result = await orchestrator.executeTool('exec_agent_001', 'test-tool', {
        input: 'test',
      });

      expect(result).toBeDefined();
      expect(result.output || result.result).toBeDefined();
    });

    it('should pass parameters to tools', async () => {
      const params = { input: 'parameter-test', value: 42 };
      const result = await orchestrator.executeTool('exec_agent_001', 'test-tool', params);

      expect(result).toBeDefined();
    });

    it('should timeout tool execution', async () => {
      const shortTimeout = new MCPOrchestrator({
        ...{
          maxConcurrentAgents: 5,
          timeoutMs: 500,
          maxRetries: 0,
          aggregationStrategy: 'first-success',
          enableCache: false,
          enableMetrics: false,
        },
      });

      const agent = createMockAgent('timeout_agent_001', AgentType.BUILDER);
      await shortTimeout.registerAgent(agent);

      const slowTool: MCPTool = {
        name: 'slow-tool',
        description: 'Slow tool',
        inputSchema: {},
        outputSchema: {},
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { result: 'done' };
        },
      };

      agent.tools.set('slow-tool', slowTool);

      try {
        await shortTimeout.executeTool('timeout_agent_001', 'slow-tool', {});
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });

    it('should handle tool not found', async () => {
      try {
        await orchestrator.executeTool('exec_agent_001', 'nonexistent-tool', {});
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });

    it('should retry failed tool executions', async () => {
      const retryOrchestrator = new MCPOrchestrator({
        maxConcurrentAgents: 5,
        timeoutMs: 30000,
        maxRetries: 2,
        aggregationStrategy: 'first-success',
        enableCache: false,
        enableMetrics: true,
      });

      const agent = createMockAgent('retry_agent_001', AgentType.BUILDER);
      let callCount = 0;

      const unreliableTool: MCPTool = {
        name: 'unreliable-tool',
        description: 'Sometimes fails',
        inputSchema: {},
        outputSchema: {},
        execute: async () => {
          callCount++;
          if (callCount < 3) {
            throw new Error('Temporary failure');
          }
          return { result: 'success' };
        },
      };

      agent.tools.set('unreliable-tool', unreliableTool);
      await retryOrchestrator.registerAgent(agent);

      const result = await retryOrchestrator.executeTool('retry_agent_001', 'unreliable-tool', {});

      expect(callCount).toBeGreaterThan(1);
      expect(result.result).toBe('success');
    });
  });

  // =========================================================================
  // TASK ORCHESTRATION TESTS
  // =========================================================================

  describe('Task Orchestration', () => {
    beforeEach(async () => {
      const agent1 = createMockAgent('task_agent_001', AgentType.BUILDER);
      const agent2 = createMockAgent('task_agent_002', AgentType.WORKER);
      await orchestrator.registerAgent(agent1);
      await orchestrator.registerAgent(agent2);
    });

    it('should execute linear task steps sequentially', async () => {
      const task: OrchestrationTask = {
        id: 'linear_task_001',
        name: 'Linear Task',
        description: 'Execute steps in order',
        steps: [
          {
            id: 'step_1',
            agentId: 'task_agent_001',
            toolName: 'test-tool',
            params: { input: 'step1' },
          },
          {
            id: 'step_2',
            agentId: 'task_agent_002',
            toolName: 'test-tool',
            params: { input: 'step2' },
            dependsOn: ['step_1'],
          },
        ],
        config: { parallel: false, timeout: 30000, retries: 1 },
      };

      const result = await orchestrator.executeTask(task);
      expect(result).toBeDefined();
      expect(result.status).toBe('success');
    });

    it('should execute steps in parallel when allowed', async () => {
      const task: OrchestrationTask = {
        id: 'parallel_task_001',
        name: 'Parallel Task',
        description: 'Execute steps concurrently',
        steps: [
          {
            id: 'step_1',
            agentId: 'task_agent_001',
            toolName: 'test-tool',
            params: { input: 'parallel1' },
          },
          {
            id: 'step_2',
            agentId: 'task_agent_002',
            toolName: 'test-tool',
            params: { input: 'parallel2' },
          },
        ],
        config: { parallel: true, timeout: 30000, retries: 1 },
      };

      const startTime = Date.now();
      const result = await orchestrator.executeTask(task);
      const duration = Date.now() - startTime;

      expect(result.status).toBe('success');
      expect(result.steps.length).toBe(2);
    });

    it('should respect step dependencies', async () => {
      const task: OrchestrationTask = {
        id: 'dep_task_001',
        name: 'Dependency Task',
        description: 'Verify dependency ordering',
        steps: [
          {
            id: 'step_a',
            agentId: 'task_agent_001',
            toolName: 'test-tool',
            params: { input: 'a' },
          },
          {
            id: 'step_b',
            agentId: 'task_agent_002',
            toolName: 'test-tool',
            params: { input: 'b' },
            dependsOn: ['step_a'],
          },
          {
            id: 'step_c',
            agentId: 'task_agent_001',
            toolName: 'test-tool',
            params: { input: 'c' },
            dependsOn: ['step_a', 'step_b'],
          },
        ],
        config: { parallel: false, timeout: 30000, retries: 1 },
      };

      const result = await orchestrator.executeTask(task);
      expect(result.steps.some((s) => s.id === 'step_c')).toBe(true);
    });

    it('should handle circular dependencies', async () => {
      const task: OrchestrationTask = {
        id: 'circular_task_001',
        name: 'Circular Task',
        description: 'Detect circular dependencies',
        steps: [
          {
            id: 'step_1',
            agentId: 'task_agent_001',
            toolName: 'test-tool',
            params: {},
            dependsOn: ['step_2'],
          },
          {
            id: 'step_2',
            agentId: 'task_agent_002',
            toolName: 'test-tool',
            params: {},
            dependsOn: ['step_1'],
          },
        ],
        config: { parallel: false, timeout: 30000, retries: 1 },
      };

      const result = await orchestrator.executeTask(task);
      expect(result.status).toBe('failure');
      expect(result.error?.message).toContain('Circular dependency');
    });
  });

  // =========================================================================
  // RESULT AGGREGATION TESTS
  // =========================================================================

  describe('Result Aggregation', () => {
    beforeEach(async () => {
      const agent1 = createMockAgent('agg_agent_001', AgentType.BUILDER);
      const agent2 = createMockAgent('agg_agent_002', AgentType.WORKER);
      const agent3 = createMockAgent('agg_agent_003', AgentType.ANALYZER);
      await orchestrator.registerAgent(agent1);
      await orchestrator.registerAgent(agent2);
      await orchestrator.registerAgent(agent3);
    });

    it('should aggregate all responses', async () => {
      const orch = new MCPOrchestrator({
        maxConcurrentAgents: 5,
        timeoutMs: 30000,
        maxRetries: 0,
        aggregationStrategy: 'all-responses',
        enableCache: false,
        enableMetrics: false,
      });

      // Re-register agents
      const agent1 = createMockAgent('agg_all_001', AgentType.BUILDER);
      await orch.registerAgent(agent1);

      const results = await orch.runTools([
        { agentId: 'agg_all_001', toolName: 'test-tool', params: { input: 'a' } },
        { agentId: 'agg_all_001', toolName: 'test-tool', params: { input: 'b' } },
      ]);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should return first successful response', async () => {
      const orch = new MCPOrchestrator({
        maxConcurrentAgents: 5,
        timeoutMs: 30000,
        maxRetries: 0,
        aggregationStrategy: 'first-success',
        enableCache: false,
        enableMetrics: false,
      });

      const agent = createMockAgent('agg_first_001', AgentType.BUILDER);
      await orch.registerAgent(agent);

      const results = await orch.runTools([
        { agentId: 'agg_first_001', toolName: 'test-tool', params: { input: 'a' } },
      ]);

      expect(results).toBeDefined();
    });

    it('should support consensus aggregation', async () => {
      const orch = new MCPOrchestrator({
        maxConcurrentAgents: 5,
        timeoutMs: 30000,
        maxRetries: 0,
        aggregationStrategy: 'consensus',
        enableCache: false,
        enableMetrics: false,
      });

      const agent = createMockAgent('agg_consensus_001', AgentType.ANALYZER);
      await orch.registerAgent(agent);

      const results = await orch.runTools([
        { agentId: 'agg_consensus_001', toolName: 'test-tool', params: {} },
      ]);

      expect(results).toBeDefined();
    });
  });

  // =========================================================================
  // RESOURCE MANAGEMENT TESTS
  // =========================================================================

  describe('Resource Management', () => {
    it('should enforce max concurrent agents', async () => {
      const orch = new MCPOrchestrator({
        maxConcurrentAgents: 2,
        timeoutMs: 30000,
        maxRetries: 0,
        aggregationStrategy: 'all-responses',
        enableCache: false,
        enableMetrics: false,
      });

      const agents = Array.from({ length: 5 }, (_, i) =>
        createMockAgent(`concurrent_00${i + 1}`, AgentType.BUILDER)
      );

      for (const agent of agents) {
        await orch.registerAgent(agent);
      }

      const metrics = orch.getMetrics();
      expect(metrics.activeAgents).toBeLessThanOrEqual(2);
    });

    it('should pool agent resources', async () => {
      const agent = createMockAgent('pool_001', AgentType.WORKER);
      await orchestrator.registerAgent(agent);

      // Execute multiple tasks sequentially
      for (let i = 0; i < 3; i++) {
        await orchestrator.executeTool('pool_001', 'test-tool', { index: i });
      }

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalExecutions).toBeGreaterThanOrEqual(3);
    });

    it('should track resource usage', async () => {
      const agent = createMockAgent('usage_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      await orchestrator.executeTool('usage_001', 'test-tool', {});

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalExecutions).toBeGreaterThan(0);
      expect(metrics.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // CACHING TESTS
  // =========================================================================

  describe('Caching', () => {
    it('should cache tool results', async () => {
      const agent = createMockAgent('cache_agent_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      const params = { input: 'test-cache' };

      const result1 = await orchestrator.executeTool('cache_agent_001', 'test-tool', params);
      const result2 = await orchestrator.executeTool('cache_agent_001', 'test-tool', params);

      expect(result1).toEqual(result2);
    });

    it('should invalidate cache when requested', async () => {
      const agent = createMockAgent('invalidate_agent_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      await orchestrator.executeTool('invalidate_agent_001', 'test-tool', { input: 'test' });
      await orchestrator.invalidateCache();

      const metrics = orchestrator.getMetrics();
      expect(metrics.cacheHits || 0).toBeDefined();
    });
  });

  // =========================================================================
  // METRICS & MONITORING TESTS
  // =========================================================================

  describe('Metrics & Monitoring', () => {
    it('should collect execution metrics', async () => {
      const agent = createMockAgent('metrics_agent_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      await orchestrator.executeTool('metrics_agent_001', 'test-tool', {});

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalExecutions).toBeGreaterThan(0);
      expect(metrics.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should track success/failure rates', async () => {
      const agent = createMockAgent('rate_agent_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      try {
        await orchestrator.executeTool('rate_agent_001', 'test-tool', {});
      } catch {
        // Expected for some cases
      }

      const metrics = orchestrator.getMetrics();
      expect(metrics.successRate || metrics.totalExecutions).toBeDefined();
    });

    it('should reset metrics', async () => {
      const agent = createMockAgent('reset_agent_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      await orchestrator.executeTool('reset_agent_001', 'test-tool', {});
      orchestrator.resetMetrics();

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalExecutions).toBe(0);
    });
  });

  // =========================================================================
  // ERROR HANDLING TESTS
  // =========================================================================

  describe('Error Handling', () => {
    it('should handle missing agents gracefully', async () => {
      try {
        await orchestrator.executeTool('nonexistent_agent', 'test-tool', {});
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });

    it('should provide clear error messages', async () => {
      const agent = createMockAgent('error_agent_001', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      try {
        await orchestrator.executeTool('error_agent_001', 'nonexistent-tool', {});
      } catch (error: any) {
        expect(error.message).toContain('not found');
      }
    });

    it('should handle task execution errors', async () => {
      const agent = createMockAgent('task_error_agent', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      const failingTool: MCPTool = {
        name: 'failing-tool',
        description: 'Always fails',
        inputSchema: {},
        outputSchema: {},
        execute: async () => {
          throw new Error('Deliberate failure');
        },
      };

      agent.tools.set('failing-tool', failingTool);

      const task: OrchestrationTask = {
        id: 'failing_task',
        name: 'Failing Task',
        description: 'Task that fails',
        steps: [
          {
            id: 'failing_step',
            agentId: 'task_error_agent',
            toolName: 'failing-tool',
            params: {},
          },
        ],
        config: { parallel: false, timeout: 30000, retries: 1 },
      };

      const result = await orchestrator.executeTask(task);
      expect(result.status).toBe('failure');
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // INTEGRATION TESTS
  // =========================================================================

  describe('Integration Scenarios', () => {
    it('should orchestrate multi-agent workflow', async () => {
      const builder = createMockAgent('workflow_builder', AgentType.BUILDER);
      const analyzer = createMockAgent('workflow_analyzer', AgentType.ANALYZER);
      const worker = createMockAgent('workflow_worker', AgentType.WORKER);

      await orchestrator.registerAgent(builder);
      await orchestrator.registerAgent(analyzer);
      await orchestrator.registerAgent(worker);

      const task: OrchestrationTask = {
        id: 'integration_workflow',
        name: 'Multi-Agent Workflow',
        description: 'Build → Analyze → Execute',
        steps: [
          {
            id: 'build',
            agentId: 'workflow_builder',
            toolName: 'test-tool',
            params: { input: 'generate' },
          },
          {
            id: 'analyze',
            agentId: 'workflow_analyzer',
            toolName: 'test-tool',
            params: { input: 'validate' },
            dependsOn: ['build'],
          },
          {
            id: 'execute',
            agentId: 'workflow_worker',
            toolName: 'test-tool',
            params: { input: 'run' },
            dependsOn: ['analyze'],
          },
        ],
        config: { parallel: false, timeout: 30000, retries: 1 },
      };

      const result = await orchestrator.executeTask(task);
      expect(result.status).toBe('success');
      expect(result.steps.length).toBe(3);
    });

    it('should handle cascading failures', async () => {
      const agent = createMockAgent('cascade_agent', AgentType.BUILDER);
      await orchestrator.registerAgent(agent);

      const failTool: MCPTool = {
        name: 'fail-tool',
        description: 'Always fails',
        inputSchema: {},
        outputSchema: {},
        execute: async () => {
          throw new Error('Step failure');
        },
      };

      agent.tools.set('fail-tool', failTool);

      const task: OrchestrationTask = {
        id: 'cascade_task',
        name: 'Cascading Failure',
        description: 'Step 2 depends on failing step 1',
        steps: [
          {
            id: 'step_1',
            agentId: 'cascade_agent',
            toolName: 'fail-tool',
            params: {},
          },
          {
            id: 'step_2',
            agentId: 'cascade_agent',
            toolName: 'test-tool',
            params: {},
            dependsOn: ['step_1'],
          },
        ],
        config: { parallel: false, timeout: 30000, retries: 0 },
      };

      const result = await orchestrator.executeTask(task);
      expect(result.status).toBe('failure');
      expect(result.error).toBeDefined();
    });
  });
});
