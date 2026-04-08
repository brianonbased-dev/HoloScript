/**
 * Agent Orchestration MCP Tools Tests
 *
 * Tests the 5 agent orchestration MCP tools:
 * discover_agents, delegate_task, get_task_status, compose_workflow, execute_workflow
 *
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  agentOrchestrationTools,
  handleAgentOrchestrationTool,
  resetOrchestrationSingletons,
} from '../agent-orchestration-tools';
import { getDefaultRegistry, resetDefaultRegistry } from '@holoscript/framework/agents';

// =============================================================================
// SETUP
// =============================================================================

describe('Agent Orchestration MCP Tools', () => {
  beforeEach(() => {
    resetDefaultRegistry();
    resetOrchestrationSingletons();
  });

  afterEach(() => {
    resetDefaultRegistry();
    resetOrchestrationSingletons();
  });

  // ===========================================================================
  // TOOL DEFINITIONS
  // ===========================================================================

  describe('tool definitions', () => {
    it('exports 5 tools', () => {
      expect(agentOrchestrationTools).toHaveLength(5);
    });

    it('all tools have name, description, and inputSchema', () => {
      for (const tool of agentOrchestrationTools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.description!.length).toBeLessThan(200);
        expect(tool.inputSchema).toBeDefined();
      }
    });

    it('has correct tool names', () => {
      const names = agentOrchestrationTools.map((t) => t.name);
      expect(names).toContain('discover_agents');
      expect(names).toContain('delegate_task');
      expect(names).toContain('get_task_status');
      expect(names).toContain('compose_workflow');
      expect(names).toContain('execute_workflow');
    });

    it('delegate_task requires skillId and arguments', () => {
      const tool = agentOrchestrationTools.find((t) => t.name === 'delegate_task')!;
      expect(tool.inputSchema.required).toContain('skillId');
      expect(tool.inputSchema.required).toContain('arguments');
    });

    it('get_task_status requires taskId', () => {
      const tool = agentOrchestrationTools.find((t) => t.name === 'get_task_status')!;
      expect(tool.inputSchema.required).toContain('taskId');
    });
  });

  // ===========================================================================
  // HANDLER ROUTING
  // ===========================================================================

  describe('handler routing', () => {
    it('returns null for unknown tool names', async () => {
      const result = await handleAgentOrchestrationTool('unknown_tool', {});
      expect(result).toBeNull();
    });

    it('routes discover_agents correctly', async () => {
      const result = await handleAgentOrchestrationTool('discover_agents', {});
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).agents).toBeDefined();
    });

    it('routes get_task_status correctly', async () => {
      const result = await handleAgentOrchestrationTool('get_task_status', {
        taskId: 'nonexistent-id',
      });
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).status).toBe('not_found');
    });

    it('routes compose_workflow correctly', async () => {
      const result = await handleAgentOrchestrationTool('compose_workflow', {
        name: 'test',
        steps: [{ id: 'a', skillId: 'parse_hs' }],
      });
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).valid).toBe(true);
    });
  });

  // ===========================================================================
  // DISCOVER_AGENTS
  // ===========================================================================

  describe('discover_agents', () => {
    it('returns empty list when no agents registered', async () => {
      const result = (await handleAgentOrchestrationTool('discover_agents', {})) as Record<
        string,
        unknown
      >;
      expect(result.agents).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('discovers registered agents by capability', async () => {
      const registry = getDefaultRegistry();
      await registry.register({
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: [{ type: 'analyze', domain: 'spatial' }],
        endpoints: [{ protocol: 'local', address: 'local://test' }],
        trustLevel: 'local',
        status: 'online',
      });

      const result = (await handleAgentOrchestrationTool('discover_agents', {
        type: 'analyze',
        domain: 'spatial',
      })) as Record<string, unknown>;

      expect(result.total).toBe(1);
      expect((result.agents as Array<Record<string, unknown>>)[0].id).toBe('test-agent');
    });

    it('respects limit parameter', async () => {
      const registry = getDefaultRegistry();
      for (let i = 0; i < 5; i++) {
        await registry.register({
          id: `agent-${i}`,
          name: `Agent ${i}`,
          version: '1.0.0',
          capabilities: [{ type: 'analyze', domain: 'general' }],
          endpoints: [{ protocol: 'local', address: `local://${i}` }],
          trustLevel: 'local',
          status: 'online',
        });
      }

      const result = (await handleAgentOrchestrationTool('discover_agents', {
        limit: 2,
      })) as Record<string, unknown>;

      expect((result.agents as unknown[]).length).toBe(2);
    });
  });

  // ===========================================================================
  // DELEGATE_TASK
  // ===========================================================================

  describe('delegate_task', () => {
    it('returns error when skillId is missing', async () => {
      const result = (await handleAgentOrchestrationTool('delegate_task', {
        arguments: {},
      })) as Record<string, unknown>;

      expect(result.error).toContain('skillId');
    });

    it('rejects delegation to non-existent agent', async () => {
      const result = (await handleAgentOrchestrationTool('delegate_task', {
        agentId: 'nonexistent',
        skillId: 'test',
        arguments: {},
      })) as Record<string, unknown>;

      expect(result.status).toBe('rejected');
    });

    it('auto-delegates when no matching agent found', async () => {
      const result = (await handleAgentOrchestrationTool('delegate_task', {
        skillId: 'test',
        arguments: {},
        type: 'render',
        domain: 'vision',
      })) as Record<string, unknown>;

      expect(result.status).toBe('rejected');
      expect(result.error).toContain('No agent found');
    });
  });

  // ===========================================================================
  // GET_TASK_STATUS
  // ===========================================================================

  describe('get_task_status', () => {
    it('returns error when taskId is missing', async () => {
      const result = (await handleAgentOrchestrationTool('get_task_status', {})) as Record<
        string,
        unknown
      >;
      expect(result.error).toContain('taskId');
    });

    it('returns not_found for unknown task', async () => {
      const result = (await handleAgentOrchestrationTool('get_task_status', {
        taskId: 'unknown-task-id',
      })) as Record<string, unknown>;

      expect(result.status).toBe('not_found');
    });
  });

  // ===========================================================================
  // COMPOSE_WORKFLOW
  // ===========================================================================

  describe('compose_workflow', () => {
    it('validates a simple linear workflow', async () => {
      const result = (await handleAgentOrchestrationTool('compose_workflow', {
        name: 'parse-validate',
        steps: [
          { id: 'parse', skillId: 'parse_hs', inputs: { code: 'test' } },
          {
            id: 'validate',
            skillId: 'validate_composition',
            inputs: { ast: { type: 'ref', stepId: 'parse', outputKey: 'ast' } },
            dependsOn: ['parse'],
          },
        ],
      })) as Record<string, unknown>;

      expect(result.valid).toBe(true);
      expect(result.stepCount).toBe(2);
      expect(result.errors).toEqual([]);
    });

    it('detects cycles in workflow', async () => {
      const result = (await handleAgentOrchestrationTool('compose_workflow', {
        name: 'cyclic',
        steps: [
          { id: 'a', skillId: 's1', dependsOn: ['b'] },
          { id: 'b', skillId: 's2', dependsOn: ['a'] },
        ],
      })) as Record<string, unknown>;

      expect(result.valid).toBe(false);
      expect((result.errors as string[])[0]).toContain('Cycle');
    });

    it('returns error for missing parameters', async () => {
      const result = (await handleAgentOrchestrationTool('compose_workflow', {})) as Record<
        string,
        unknown
      >;
      expect(result.valid).toBe(false);
    });
  });

  // ===========================================================================
  // EXECUTE_WORKFLOW
  // ===========================================================================

  describe('execute_workflow', () => {
    it('executes a workflow with a tool executor', async () => {
      const mockExecutor = async (toolName: string, args: Record<string, unknown>) => {
        if (toolName === 'parse_hs') {
          return { ast: { type: 'composition' }, success: true };
        }
        if (toolName === 'validate_composition') {
          return { valid: true };
        }
        return { result: 'unknown' };
      };

      const result = (await handleAgentOrchestrationTool(
        'execute_workflow',
        {
          name: 'test-pipeline',
          steps: [
            { id: 'parse', skillId: 'parse_hs', inputs: { code: 'test' } },
            {
              id: 'validate',
              skillId: 'validate_composition',
              inputs: { ast: { type: 'ref', stepId: 'parse', outputKey: 'ast' } },
              dependsOn: ['parse'],
            },
          ],
        },
        mockExecutor
      )) as Record<string, unknown>;

      expect(result.status).toBe('completed');
      expect((result.steps as unknown[]).length).toBe(2);
    });

    it('runs dry-run without executor', async () => {
      const result = (await handleAgentOrchestrationTool('execute_workflow', {
        name: 'dry-run',
        steps: [{ id: 'a', skillId: 'test_skill', inputs: { x: 1 } }],
      })) as Record<string, unknown>;

      expect(result.status).toBe('completed');
      const steps = result.steps as Array<Record<string, unknown>>;
      expect((steps[0].output as Record<string, unknown>).note).toContain('dry run');
    });

    it('fails on invalid workflow', async () => {
      const result = (await handleAgentOrchestrationTool('execute_workflow', {
        name: 'bad',
        steps: [
          { id: 'a', skillId: 's1', dependsOn: ['b'] },
          { id: 'b', skillId: 's2', dependsOn: ['a'] },
        ],
      })) as Record<string, unknown>;

      expect(result.status).toBe('failed');
      expect(result.error).toContain('validation failed');
    });

    it('returns error for missing parameters', async () => {
      const result = (await handleAgentOrchestrationTool('execute_workflow', {})) as Record<
        string,
        unknown
      >;
      expect(result.status).toBe('failed');
    });
  });
});
