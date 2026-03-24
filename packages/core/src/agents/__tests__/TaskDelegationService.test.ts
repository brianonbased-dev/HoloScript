/**
 * TaskDelegationService Tests
 *
 * Tests cross-agent task forwarding (local + remote delegation).
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskDelegationService, type DelegationRequest } from '../TaskDelegationService';
import { AgentRegistry, resetDefaultRegistry } from '../AgentRegistry';
import type { AgentManifest } from '../AgentManifest';

// =============================================================================
// FIXTURES
// =============================================================================

function makeLocalAgent(overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id: 'local-agent-1',
    name: 'Local Agent',
    version: '1.0.0',
    capabilities: [{ type: 'analyze', domain: 'spatial' }],
    endpoints: [{ protocol: 'local', address: 'local://agent-1', primary: true }],
    trustLevel: 'local',
    status: 'online',
    ...overrides,
  };
}

function makeRemoteAgent(overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id: 'remote-agent-1',
    name: 'Remote Agent',
    version: '1.0.0',
    capabilities: [{ type: 'transform', domain: 'spatial' }],
    endpoints: [
      { protocol: 'https', address: 'https://remote.example.com/a2a', primary: true },
    ],
    trustLevel: 'external',
    status: 'online',
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('TaskDelegationService', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    resetDefaultRegistry();
    registry = new AgentRegistry();
  });

  afterEach(() => {
    registry.stop();
    registry.clear();
  });

  describe('delegateTo', () => {
    it('delegates to a local agent using localExecutor', async () => {
      await registry.register(makeLocalAgent());

      const service = new TaskDelegationService(registry, undefined, {
        localExecutor: async (skillId, args) => ({
          parsed: true,
          skillId,
          input: args.code,
        }),
      });

      const result = await service.delegateTo({
        targetAgentId: 'local-agent-1',
        skillId: 'parse_hs',
        arguments: { code: 'object Cube {}' },
      });

      expect(result.status).toBe('completed');
      expect(result.delegatedTo.agentId).toBe('local-agent-1');
      expect((result.result as Record<string, unknown>).parsed).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns rejected for unknown agent ID', async () => {
      const service = new TaskDelegationService(registry);

      const result = await service.delegateTo({
        targetAgentId: 'nonexistent',
        skillId: 'test',
        arguments: {},
      });

      expect(result.status).toBe('rejected');
      expect(result.error).toContain('Agent not found');
    });

    it('delegates to a remote agent via A2A JSON-RPC', async () => {
      await registry.register(makeRemoteAgent());

      const service = new TaskDelegationService(registry, undefined, {
        fetchFn: async () =>
          ({
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              id: 'test',
              result: { status: 'completed', artifacts: [{ data: 'remote-result' }] },
            }),
          }) as Response,
      });

      const result = await service.delegateTo({
        targetAgentId: 'remote-agent-1',
        skillId: 'compile_hs',
        arguments: { code: 'test', target: 'threejs' },
      });

      expect(result.status).toBe('completed');
      expect(result.delegatedTo.endpoint).toBe('https://remote.example.com/a2a');
    });

    it('handles remote agent HTTP errors', async () => {
      await registry.register(makeRemoteAgent());

      const service = new TaskDelegationService(registry, undefined, {
        fetchFn: async () => ({ ok: false, status: 500 } as Response),
      });

      const result = await service.delegateTo({
        targetAgentId: 'remote-agent-1',
        skillId: 'test',
        arguments: {},
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('500');
    });

    it('handles remote agent JSON-RPC errors', async () => {
      await registry.register(makeRemoteAgent());

      const service = new TaskDelegationService(registry, undefined, {
        fetchFn: async () =>
          ({
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Skill not found' },
            }),
          }) as Response,
      });

      const result = await service.delegateTo({
        targetAgentId: 'remote-agent-1',
        skillId: 'nonexistent',
        arguments: {},
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Skill not found');
    });

    it('times out on slow execution', async () => {
      await registry.register(makeLocalAgent());

      const service = new TaskDelegationService(registry, undefined, {
        localExecutor: async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { result: 'too-slow' };
        },
      });

      const result = await service.delegateTo({
        targetAgentId: 'local-agent-1',
        skillId: 'slow_skill',
        arguments: {},
        timeout: 50,
      });

      expect(result.status).toBe('timeout');
      expect(result.error).toContain('timed out');
    });

    it('retries on failure with exponential backoff', async () => {
      await registry.register(makeLocalAgent());

      let callCount = 0;
      const service = new TaskDelegationService(registry, undefined, {
        localExecutor: async () => {
          callCount++;
          if (callCount < 3) throw new Error('Transient error');
          return { success: true };
        },
      });

      const result = await service.delegateTo({
        targetAgentId: 'local-agent-1',
        skillId: 'flaky_skill',
        arguments: {},
        retries: 2,
      });

      expect(result.status).toBe('completed');
      expect(callCount).toBe(3);
    }, 15000);

    it('fails after exhausting retries', async () => {
      await registry.register(makeLocalAgent());

      const service = new TaskDelegationService(registry, undefined, {
        localExecutor: async () => {
          throw new Error('Persistent error');
        },
      });

      const result = await service.delegateTo({
        targetAgentId: 'local-agent-1',
        skillId: 'broken_skill',
        arguments: {},
        retries: 1,
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Persistent error');
    });
  });

  describe('autoDelegate', () => {
    it('auto-selects the best agent and delegates', async () => {
      await registry.register(makeLocalAgent());

      const service = new TaskDelegationService(registry, undefined, {
        localExecutor: async (skillId) => ({ delegated: true, skillId }),
      });

      const result = await service.autoDelegate(
        { type: 'analyze', domain: 'spatial' },
        'parse_hs',
        { code: 'test' }
      );

      expect(result.status).toBe('completed');
      expect(result.delegatedTo.agentId).toBe('local-agent-1');
    });

    it('returns rejected when no matching agent found', async () => {
      const service = new TaskDelegationService(registry);

      const result = await service.autoDelegate(
        { type: 'render', domain: 'vision' },
        'test_skill',
        {}
      );

      expect(result.status).toBe('rejected');
      expect(result.error).toContain('No agent found');
    });
  });

  describe('history tracking', () => {
    it('tracks delegation results', async () => {
      await registry.register(makeLocalAgent());

      const service = new TaskDelegationService(registry, undefined, {
        localExecutor: async () => ({ ok: true }),
      });

      await service.delegateTo({
        targetAgentId: 'local-agent-1',
        skillId: 'test',
        arguments: {},
      });

      const history = service.getDelegationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('completed');
    });

    it('getStatus retrieves result by taskId', async () => {
      await registry.register(makeLocalAgent());

      const service = new TaskDelegationService(registry, undefined, {
        localExecutor: async () => ({ ok: true }),
      });

      const result = await service.delegateTo({
        targetAgentId: 'local-agent-1',
        skillId: 'test',
        arguments: {},
      });

      const status = service.getStatus(result.taskId);
      expect(status).toBeDefined();
      expect(status!.taskId).toBe(result.taskId);
    });

    it('enforces maxHistory with LRU eviction', async () => {
      await registry.register(makeLocalAgent());

      const service = new TaskDelegationService(registry, undefined, {
        maxHistory: 2,
        localExecutor: async () => ({ ok: true }),
      });

      await service.delegateTo({ targetAgentId: 'local-agent-1', skillId: 'a', arguments: {} });
      await service.delegateTo({ targetAgentId: 'local-agent-1', skillId: 'b', arguments: {} });
      await service.delegateTo({ targetAgentId: 'local-agent-1', skillId: 'c', arguments: {} });

      const history = service.getDelegationHistory();
      expect(history).toHaveLength(2);
    });

    it('getStats returns correct counts', async () => {
      await registry.register(makeLocalAgent());

      let shouldFail = false;
      const service = new TaskDelegationService(registry, undefined, {
        localExecutor: async () => {
          if (shouldFail) throw new Error('fail');
          return { ok: true };
        },
      });

      await service.delegateTo({ targetAgentId: 'local-agent-1', skillId: 'a', arguments: {} });
      shouldFail = true;
      await service.delegateTo({ targetAgentId: 'local-agent-1', skillId: 'b', arguments: {} });
      await service.delegateTo({ targetAgentId: 'nonexistent', skillId: 'c', arguments: {} });

      const stats = service.getStats();
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.rejected).toBe(1);
    });
  });
});
