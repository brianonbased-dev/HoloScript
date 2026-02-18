/**
 * MultiAgent Coordination Trait Tests
 *
 * Tests agent registry, inter-agent messaging, task delegation,
 * shared state management, heartbeat liveness, and conflict resolution.
 *
 * Commence All VI — Track 3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiAgentHandler } from '../MultiAgentTrait';
import type {
  MultiAgentConfig,
  MultiAgentState,
  AgentMessage,
} from '../MultiAgentTrait';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockNode(id = 'node-1') {
  return { id, name: id };
}

function createMockContext() {
  return { emit: vi.fn() };
}

function getState(node: any): MultiAgentState {
  return (node as any).__multiAgentState;
}

function makeConfig(overrides: Partial<MultiAgentConfig> = {}): MultiAgentConfig {
  return { ...multiAgentHandler.defaultConfig, ...overrides };
}

function getEmit(ctx: any, eventName: string): any[] {
  return ctx.emit.mock.calls.filter((c: any) => c[0] === eventName);
}

// =============================================================================
// TESTS
// =============================================================================

describe('MultiAgentTrait', () => {
  let node: any;
  let ctx: any;
  let config: MultiAgentConfig;

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
    config = makeConfig({
      agent_id: 'alpha',
      agent_name: 'Agent Alpha',
      capabilities: ['code', 'review'],
    });
  });

  // ---------------------------------------------------------------------------
  // 1. INITIALIZATION & LIFECYCLE
  // ---------------------------------------------------------------------------

  describe('initialization', () => {
    it('attaches state with self-registration', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      expect(s.self.id).toBe('alpha');
      expect(s.self.name).toBe('Agent Alpha');
      expect(s.self.capabilities).toEqual(['code', 'review']);
      expect(s.self.status).toBe('active');
    });

    it('registers self in registry', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      expect(s.registry.size).toBe(1);
      expect(s.registry.has('alpha')).toBe(true);
    });

    it('emits multi_agent_registered on attach', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const calls = getEmit(ctx, 'multi_agent_registered');
      expect(calls.length).toBe(1);
      expect(calls[0][1].agent.id).toBe('alpha');
    });

    it('falls back to node.id if no agent_id configured', () => {
      multiAgentHandler.onAttach!(node, makeConfig({ agent_id: '' }), ctx);
      const s = getState(node);
      expect(s.self.id).toBe('node-1');
    });

    it('cleans up state on detach', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onDetach!(node, config, ctx);
      expect(getState(node)).toBeUndefined();
    });

    it('emits unregistered on detach', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();
      multiAgentHandler.onDetach!(node, config, ctx);
      const calls = getEmit(ctx, 'multi_agent_unregistered');
      expect(calls.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. AGENT REGISTRY
  // ---------------------------------------------------------------------------

  describe('agent registry', () => {
    it('registers discovered agent', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'beta', name: 'Agent Beta', capabilities: ['deploy'] },
      } as any);

      const s = getState(node);
      expect(s.registry.size).toBe(2);
      expect(s.registry.get('beta')!.name).toBe('Agent Beta');
    });

    it('emits peer_registered for new discovery', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'beta', name: 'Beta', capabilities: [] },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_peer_registered');
      expect(calls.length).toBe(1);
      expect(calls[0][1].totalAgents).toBe(2);
    });

    it('updates capabilities for re-discovered agent', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'beta', name: 'Beta', capabilities: ['a'] },
      } as any);

      const s = getState(node);
      expect(s.registry.get('beta')!.capabilities).toEqual(['a']);

      // Re-discover with updated capabilities
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'beta', name: 'Beta', capabilities: ['a', 'b'] },
      } as any);

      expect(s.registry.get('beta')!.capabilities).toEqual(['a', 'b']);
      expect(s.registry.get('beta')!.status).toBe('active');
    });

    it('removes departed agent', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'beta', name: 'Beta', capabilities: [] },
      } as any);

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_departed',
        payload: { agentId: 'beta' },
      } as any);

      const s = getState(node);
      expect(s.registry.size).toBe(1); // Only self remains
    });

    it('does not remove self on agent_departed', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_departed',
        payload: { agentId: 'alpha' },
      } as any);

      expect(getState(node).registry.has('alpha')).toBe(true);
    });

    it('discover_agents filters by capability', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'beta', name: 'Beta', capabilities: ['deploy'] },
      } as any);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'gamma', name: 'Gamma', capabilities: ['code', 'test'] },
      } as any);

      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'discover_agents',
        payload: { capability: 'code' },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_discovery_result');
      expect(calls.length).toBe(1);
      // alpha (code, review) and gamma (code, test) should match
      const agents = calls[0][1].agents;
      expect(agents.length).toBe(2);
      expect(agents.map((a: any) => a.id).sort()).toEqual(['alpha', 'gamma']);
    });

    it('discover_agents returns all when no capability specified', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'beta', name: 'Beta', capabilities: [] },
      } as any);

      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'discover_agents',
        payload: {},
      } as any);

      const calls = getEmit(ctx, 'multi_agent_discovery_result');
      expect(calls[0][1].agents.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MESSAGING
  // ---------------------------------------------------------------------------

  describe('messaging', () => {
    it('sends unicast message', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'send_agent_message',
        payload: { to: 'beta', type: 'ping', payload: { data: 1 } },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_message_unicast');
      expect(calls.length).toBe(1);
      expect(calls[0][1].message.to).toBe('beta');
      expect(calls[0][1].message.from).toBe('alpha');
    });

    it('sends broadcast message when no "to" specified', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'send_agent_message',
        payload: { type: 'announce', payload: { msg: 'hello' } },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_message_broadcast');
      expect(calls.length).toBe(1);
      expect(calls[0][1].message.to).toBeNull();
    });

    it('receives incoming message', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();

      const msg: AgentMessage = {
        id: 'msg_1',
        from: 'beta',
        to: 'alpha',
        type: 'ping',
        payload: {},
        priority: 'normal',
        timestamp: Date.now(),
        ttl: 60000,
      };

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'receive_agent_message',
        payload: msg,
      } as any);

      const s = getState(node);
      expect(s.inbox.length).toBe(1);
      expect(s.inbox[0].from).toBe('beta');
    });

    it('ignores messages not addressed to self', () => {
      multiAgentHandler.onAttach!(node, config, ctx);

      const msg: AgentMessage = {
        id: 'msg_2',
        from: 'beta',
        to: 'gamma', // Not us
        type: 'ping',
        payload: {},
        priority: 'normal',
        timestamp: Date.now(),
        ttl: 60000,
      };

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'receive_agent_message',
        payload: msg,
      } as any);

      expect(getState(node).inbox.length).toBe(0);
    });

    it('ignores own messages', () => {
      multiAgentHandler.onAttach!(node, config, ctx);

      const msg: AgentMessage = {
        id: 'msg_3',
        from: 'alpha', // Self
        to: null,
        type: 'announce',
        payload: {},
        priority: 'normal',
        timestamp: Date.now(),
        ttl: 60000,
      };

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'receive_agent_message',
        payload: msg,
      } as any);

      expect(getState(node).inbox.length).toBe(0);
    });

    it('ignores expired messages', () => {
      multiAgentHandler.onAttach!(node, config, ctx);

      const msg: AgentMessage = {
        id: 'msg_4',
        from: 'beta',
        to: 'alpha',
        type: 'old',
        payload: {},
        priority: 'normal',
        timestamp: Date.now() - 120000, // 2 minutes ago
        ttl: 60000, // 1 minute TTL
      };

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'receive_agent_message',
        payload: msg,
      } as any);

      expect(getState(node).inbox.length).toBe(0);
    });

    it('assigns incremental message IDs', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'send_agent_message',
        payload: { to: 'beta', type: 'a', payload: {} },
      } as any);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'send_agent_message',
        payload: { to: 'beta', type: 'b', payload: {} },
      } as any);

      const s = getState(node);
      expect(s.outbox.length).toBe(2);
      expect(s.outbox[0].id).not.toBe(s.outbox[1].id);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. TASK DELEGATION
  // ---------------------------------------------------------------------------

  describe('task delegation', () => {
    it('creates delegated task', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'delegate_task',
        payload: {
          assigneeId: 'beta',
          description: 'Run tests',
          requiredCapabilities: ['test'],
        },
      } as any);

      const s = getState(node);
      expect(s.delegatedTasks.length).toBe(1);
      expect(s.delegatedTasks[0].assigneeId).toBe('beta');
      expect(s.delegatedTasks[0].status).toBe('assigned');
    });

    it('emits task_delegated event', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'delegate_task',
        payload: {
          assigneeId: 'beta',
          description: 'Deploy',
        },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_task_delegated');
      expect(calls.length).toBe(1);
      expect(calls[0][1].task.assigneeId).toBe('beta');
    });

    it('auto-assigns task by capability', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      // Register a peer with 'deploy' capability
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'agent_discovered',
        payload: { agentId: 'beta', name: 'Beta', capabilities: ['deploy', 'test'] },
      } as any);

      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'delegate_task',
        payload: {
          description: 'Deploy to prod',
          requiredCapabilities: ['deploy'],
        },
      } as any);

      const s = getState(node);
      expect(s.delegatedTasks[0].assigneeId).toBe('beta');
    });

    it('task remains pending when no capable agent found', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'delegate_task',
        payload: {
          description: 'Translate to Klingon',
          requiredCapabilities: ['klingon'],
        },
      } as any);

      const s = getState(node);
      expect(s.delegatedTasks[0].assigneeId).toBeNull();
      expect(s.delegatedTasks[0].status).toBe('pending');
    });

    it('accepts assigned task', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.assignedTasks.push({
        id: 'task_1',
        delegatorId: 'beta',
        assigneeId: 'alpha',
        description: 'Do stuff',
        requiredCapabilities: [],
        status: 'assigned',
        priority: 'normal',
        payload: {},
        result: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deadline: 0,
        retryCount: 0,
        maxRetries: 3,
      });

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'accept_task',
        payload: { taskId: 'task_1' },
      } as any);

      expect(s.assignedTasks[0].status).toBe('in_progress');
      expect(s.self.status).toBe('busy');
    });

    it('completes assigned task and returns to active', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.assignedTasks.push({
        id: 'task_1',
        delegatorId: 'beta',
        assigneeId: 'alpha',
        description: 'Do stuff',
        requiredCapabilities: [],
        status: 'in_progress',
        priority: 'normal',
        payload: {},
        result: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deadline: 0,
        retryCount: 0,
        maxRetries: 3,
      });
      s.self.status = 'busy';

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'complete_task',
        payload: { taskId: 'task_1', result: { success: true } },
      } as any);

      expect(s.assignedTasks[0].status).toBe('completed');
      expect(s.assignedTasks[0].result).toEqual({ success: true });
      expect(s.self.status).toBe('active');
    });

    it('retries failed task', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.delegatedTasks.push({
        id: 'task_1',
        delegatorId: 'alpha',
        assigneeId: 'beta',
        description: 'Flaky task',
        requiredCapabilities: [],
        status: 'in_progress',
        priority: 'normal',
        payload: {},
        result: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deadline: 0,
        retryCount: 0,
        maxRetries: 3,
      });

      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'fail_task',
        payload: { taskId: 'task_1', error: 'timeout' },
      } as any);

      expect(s.delegatedTasks[0].status).toBe('pending');
      expect(s.delegatedTasks[0].retryCount).toBe(1);
      const calls = getEmit(ctx, 'multi_agent_task_retrying');
      expect(calls.length).toBe(1);
    });

    it('fails task permanently after max retries', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.delegatedTasks.push({
        id: 'task_1',
        delegatorId: 'alpha',
        assigneeId: 'beta',
        description: 'Hopeless',
        requiredCapabilities: [],
        status: 'in_progress',
        priority: 'normal',
        payload: {},
        result: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deadline: 0,
        retryCount: 2,
        maxRetries: 3,
      });

      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'fail_task',
        payload: { taskId: 'task_1' },
      } as any);

      expect(s.delegatedTasks[0].status).toBe('failed');
      const calls = getEmit(ctx, 'multi_agent_task_failed');
      expect(calls.length).toBe(1);
    });

    it('rejects task delegation when at limit', () => {
      const limitConfig = makeConfig({ ...config, max_active_tasks: 1 });
      multiAgentHandler.onAttach!(node, limitConfig, ctx);

      // First task
      multiAgentHandler.onEvent!(node, limitConfig, ctx, {
        type: 'delegate_task',
        payload: { assigneeId: 'beta', description: 'Task 1' },
      } as any);

      // Second task should be rejected
      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, limitConfig, ctx, {
        type: 'delegate_task',
        payload: { assigneeId: 'beta', description: 'Task 2' },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_task_limit_reached');
      expect(calls.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. SHARED STATE
  // ---------------------------------------------------------------------------

  describe('shared state', () => {
    it('sets shared state entry', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'set_shared_state',
        payload: { key: 'theme', value: 'dark' },
      } as any);

      const s = getState(node);
      expect(s.sharedState.get('theme')?.value).toBe('dark');
      expect(s.sharedState.get('theme')?.lastWriter).toBe('alpha');
      expect(s.sharedState.get('theme')?.version).toBe(1);
    });

    it('increments version on update', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'set_shared_state',
        payload: { key: 'count', value: 1 },
      } as any);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'set_shared_state',
        payload: { key: 'count', value: 2 },
      } as any);

      const s = getState(node);
      expect(s.sharedState.get('count')?.version).toBe(2);
      expect(s.sharedState.get('count')?.value).toBe(2);
    });

    it('gets shared state entry', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'set_shared_state',
        payload: { key: 'lang', value: 'ts' },
      } as any);

      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'get_shared_state',
        payload: { key: 'lang' },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_shared_state_response');
      expect(calls.length).toBe(1);
      expect(calls[0][1].value).toBe('ts');
      expect(calls[0][1].version).toBe(1);
    });

    it('returns null for missing key', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'get_shared_state',
        payload: { key: 'nonexistent' },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_shared_state_response');
      expect(calls[0][1].value).toBeNull();
      expect(calls[0][1].version).toBe(0);
    });

    it('syncs state with last-write-wins', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'set_shared_state',
        payload: { key: 'x', value: 'old' },
      } as any);

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'sync_shared_state',
        payload: {
          entries: [
            { key: 'x', value: 'new', writer: 'beta', version: 5 },
            { key: 'y', value: 42, writer: 'beta', version: 1 },
          ],
        },
      } as any);

      const s = getState(node);
      expect(s.sharedState.get('x')?.value).toBe('new');
      expect(s.sharedState.get('x')?.version).toBe(5);
      expect(s.sharedState.get('y')?.value).toBe(42);
    });

    it('rejects older version during sync', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      // Set version 10
      const s = getState(node);
      s.sharedState.set('x', {
        key: 'x',
        value: 'latest',
        lastWriter: 'alpha',
        version: 10,
        updatedAt: Date.now(),
      });

      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'sync_shared_state',
        payload: {
          entries: [{ key: 'x', value: 'stale', writer: 'beta', version: 5 }],
        },
      } as any);

      expect(s.sharedState.get('x')?.value).toBe('latest');
    });

    it('enforces max shared state entries', () => {
      const limitConfig = makeConfig({ ...config, max_shared_state_entries: 2 });
      multiAgentHandler.onAttach!(node, limitConfig, ctx);

      multiAgentHandler.onEvent!(node, limitConfig, ctx, {
        type: 'set_shared_state',
        payload: { key: 'a', value: 1 },
      } as any);
      multiAgentHandler.onEvent!(node, limitConfig, ctx, {
        type: 'set_shared_state',
        payload: { key: 'b', value: 2 },
      } as any);

      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, limitConfig, ctx, {
        type: 'set_shared_state',
        payload: { key: 'c', value: 3 },
      } as any);

      const calls = getEmit(ctx, 'multi_agent_shared_state_limit');
      expect(calls.length).toBe(1);
      expect(getState(node).sharedState.size).toBe(2); // Still 2
    });
  });

  // ---------------------------------------------------------------------------
  // 6. HEARTBEAT & LIVENESS
  // ---------------------------------------------------------------------------

  describe('heartbeat & liveness', () => {
    it('emits heartbeat after interval', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();

      // Enough delta to trigger heartbeat (5000ms default)
      multiAgentHandler.onUpdate!(node, config, ctx, 5100);

      const calls = getEmit(ctx, 'multi_agent_heartbeat');
      expect(calls.length).toBe(1);
      expect(calls[0][1].agentId).toBe('alpha');
    });

    it('does not emit heartbeat before interval', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();
      multiAgentHandler.onUpdate!(node, config, ctx, 1000);

      const calls = getEmit(ctx, 'multi_agent_heartbeat');
      expect(calls.length).toBe(0);
    });

    it('detects offline agents', () => {
      const fastConfig = makeConfig({
        ...config,
        heartbeat_interval: 100,
        offline_threshold: 2,
      });
      multiAgentHandler.onAttach!(node, fastConfig, ctx);

      // Register a peer with old heartbeat
      const s = getState(node);
      s.registry.set('beta', {
        id: 'beta',
        name: 'Beta',
        capabilities: [],
        status: 'active',
        metadata: {},
        registeredAt: Date.now(),
        lastHeartbeat: Date.now() - 300, // 300ms ago, threshold is 200ms
        nodeRef: null,
      });

      ctx.emit.mockClear();
      multiAgentHandler.onUpdate!(node, fastConfig, ctx, 100);

      const calls = getEmit(ctx, 'multi_agent_offline');
      expect(calls.length).toBe(1);
      expect(calls[0][1].agentId).toBe('beta');
    });

    it('excludes offline agents from discovery', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.registry.set('dead', {
        id: 'dead',
        name: 'Dead Agent',
        capabilities: ['code'],
        status: 'offline',
        metadata: {},
        registeredAt: Date.now(),
        lastHeartbeat: 0,
        nodeRef: null,
      });

      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'discover_agents',
        payload: {},
      } as any);

      const calls = getEmit(ctx, 'multi_agent_discovery_result');
      const agents = calls[0][1].agents;
      expect(agents.find((a: any) => a.id === 'dead')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. STATUS
  // ---------------------------------------------------------------------------

  describe('status', () => {
    it('returns agent status', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'get_agent_status',
        payload: {},
      } as any);

      const calls = getEmit(ctx, 'multi_agent_status_response');
      expect(calls.length).toBe(1);
      expect(calls[0][1].agent.id).toBe('alpha');
      expect(calls[0][1].registrySize).toBe(1);
    });

    it('changes agent status', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      multiAgentHandler.onEvent!(node, config, ctx, {
        type: 'set_agent_status',
        payload: { status: 'idle' },
      } as any);

      expect(getState(node).self.status).toBe('idle');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. HANDLER METADATA
  // ---------------------------------------------------------------------------

  describe('handler metadata', () => {
    it('has correct name', () => {
      expect(multiAgentHandler.name).toBe('multi_agent');
    });

    it('has all lifecycle methods', () => {
      expect(multiAgentHandler.onAttach).toBeTypeOf('function');
      expect(multiAgentHandler.onDetach).toBeTypeOf('function');
      expect(multiAgentHandler.onUpdate).toBeTypeOf('function');
      expect(multiAgentHandler.onEvent).toBeTypeOf('function');
    });

    it('default config has sensible values', () => {
      const d = multiAgentHandler.defaultConfig;
      expect(d.heartbeat_interval).toBeGreaterThan(0);
      expect(d.max_inbox_size).toBeGreaterThan(0);
      expect(d.max_active_tasks).toBeGreaterThan(0);
      expect(d.enable_shared_state).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. TASK DEADLINE EXPIRY
  // ---------------------------------------------------------------------------

  describe('task deadline expiry', () => {
    it('marks overdue tasks as failed', () => {
      multiAgentHandler.onAttach!(node, config, ctx);
      const s = getState(node);
      s.delegatedTasks.push({
        id: 'task_deadline',
        delegatorId: 'alpha',
        assigneeId: 'beta',
        description: 'Expired',
        requiredCapabilities: [],
        status: 'in_progress',
        priority: 'normal',
        payload: {},
        result: null,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 10000,
        deadline: Date.now() - 1000, // Already past
        retryCount: 0,
        maxRetries: 3,
      });

      ctx.emit.mockClear();
      multiAgentHandler.onUpdate!(node, config, ctx, 5100); // Trigger heartbeat + check

      const calls = getEmit(ctx, 'multi_agent_task_expired');
      expect(calls.length).toBe(1);
      expect(s.delegatedTasks[0].status).toBe('failed');
    });
  });
});
