/**
 * MultiAgentTrait Integration Tests
 *
 * Cross-agent collaboration flows that exercise registry → messaging →
 * task delegation → shared state → heartbeat → liveness together.
 * Each test simulates two or more agents cooperating through the handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { multiAgentHandler } from '../MultiAgentTrait';

// =============================================================================
// HELPERS
// =============================================================================

/** Create a fully attached agent and return its node, config, context, and state accessor. */
function spawnAgent(
  id: string,
  name: string,
  caps: string[] = [],
  extraConfig: Record<string, any> = {}
) {
  const node = { id } as any;
  const config = {
    ...multiAgentHandler.defaultConfig,
    agent_id: id,
    agent_name: name,
    capabilities: caps,
    ...extraConfig,
  };
  const ctx = { emit: vi.fn() };
  multiAgentHandler.onAttach(node, config, ctx);
  return {
    node,
    config,
    ctx,
    state: () => (node as any).__multiAgentState,
  };
}

/** Simulate Agent A discovering Agent B */
function discover(a: ReturnType<typeof spawnAgent>, bState: any) {
  multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
    type: 'agent_discovered',
    payload: {
      agentId: bState.self.id,
      name: bState.self.name,
      capabilities: bState.self.capabilities,
    },
  });
}

/** Simulate Agent B receiving a message (from Agent A's outbox) */
function deliverLastMessage(
  sender: ReturnType<typeof spawnAgent>,
  receiver: ReturnType<typeof spawnAgent>
) {
  const outbox = sender.state().outbox;
  const lastMsg = outbox[outbox.length - 1];
  multiAgentHandler.onEvent!(receiver.node, receiver.config, receiver.ctx, {
    type: 'receive_agent_message',
    payload: lastMsg,
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('MultiAgentTrait — Integration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ======== REGISTRY + DISCOVERY ========

  describe('registry + discovery', () => {
    it('Agent A discovers Agent B and registry grows', () => {
      const a = spawnAgent('a1', 'Alpha', ['search']);
      const b = spawnAgent('b1', 'Bravo', ['render']);

      discover(a, b.state());

      expect(a.state().registry.size).toBe(2);
      expect(a.state().registry.has('b1')).toBe(true);
      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_peer_registered',
        expect.objectContaining({ totalAgents: 2 })
      );
    });

    it('re-discovery updates heartbeat without duplicating', () => {
      const a = spawnAgent('a1', 'Alpha');
      const b = spawnAgent('b1', 'Bravo', ['code']);

      discover(a, b.state());

      // Re-discover — should not duplicate, just update heartbeat
      discover(a, b.state());

      expect(a.state().registry.size).toBe(2); // no duplicate
      expect(a.state().registry.get('b1')!.status).toBe('active');
    });

    it('discovers agents filtered by capability', () => {
      const a = spawnAgent('a1', 'Alpha', ['search']);
      const b = spawnAgent('b1', 'Bravo', ['render', 'search']);
      const c = spawnAgent('c1', 'Charlie', ['audio']);

      discover(a, b.state());
      discover(a, c.state());
      a.ctx.emit.mockClear();

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'discover_agents',
        payload: { capability: 'render' },
      });

      const result = a.ctx.emit.mock.calls.find(
        (c: any) => c[0] === 'multi_agent_discovery_result'
      );
      expect(result).toBeDefined();
      expect(result![1].agents).toHaveLength(1);
      expect(result![1].agents[0].id).toBe('b1');
    });

    it('departed agent is removed from registry', () => {
      const a = spawnAgent('a1', 'Alpha');
      const b = spawnAgent('b1', 'Bravo');

      discover(a, b.state());
      expect(a.state().registry.size).toBe(2);

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'agent_departed',
        payload: { agentId: 'b1' },
      });

      expect(a.state().registry.size).toBe(1);
      expect(a.state().registry.has('b1')).toBe(false);
    });

    it('cannot depart self', () => {
      const a = spawnAgent('a1', 'Alpha');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'agent_departed',
        payload: { agentId: 'a1' },
      });

      expect(a.state().registry.size).toBe(1); // self remains
    });
  });

  // ======== MESSAGING ========

  describe('messaging', () => {
    it('Agent A sends unicast to Agent B, B receives it', () => {
      const a = spawnAgent('a1', 'Alpha');
      const b = spawnAgent('b1', 'Bravo');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'send_agent_message',
        payload: { to: 'b1', type: 'hello', payload: { text: 'Hi Bravo!' } },
      });

      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_message_unicast',
        expect.objectContaining({ message: expect.objectContaining({ to: 'b1' }) })
      );

      // Deliver to B
      deliverLastMessage(a, b);

      expect(b.state().inbox).toHaveLength(1);
      expect(b.state().inbox[0].from).toBe('a1');
      expect(b.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_message_received',
        expect.objectContaining({
          message: expect.objectContaining({ from: 'a1', type: 'hello' }),
        })
      );
    });

    it('broadcasts go to all agents', () => {
      const a = spawnAgent('a1', 'Alpha');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'send_agent_message',
        payload: { type: 'announce', payload: 'Global!' },
      });

      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_message_broadcast',
        expect.objectContaining({ message: expect.objectContaining({ to: null }) })
      );
    });

    it('agent does not receive own messages', () => {
      const a = spawnAgent('a1', 'Alpha');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'send_agent_message',
        payload: { type: 'echo', payload: 'test' },
      });

      const msg = a.state().outbox[0];
      a.ctx.emit.mockClear();

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'receive_agent_message',
        payload: msg,
      });

      expect(a.state().inbox).toHaveLength(0);
    });

    it('message to different agent is ignored', () => {
      const b = spawnAgent('b1', 'Bravo');

      const foreignMsg = {
        id: 'msg_foreign',
        from: 'a1',
        to: 'c1', // not b1
        type: 'secret',
        payload: {},
        priority: 'normal',
        timestamp: Date.now(),
        ttl: 60000,
      };

      multiAgentHandler.onEvent!(b.node, b.config, b.ctx, {
        type: 'receive_agent_message',
        payload: foreignMsg,
      });

      expect(b.state().inbox).toHaveLength(0);
    });

    it('expired messages are not received', () => {
      const b = spawnAgent('b1', 'Bravo');

      const expiredMsg = {
        id: 'msg_old',
        from: 'a1',
        to: 'b1',
        type: 'old',
        payload: {},
        priority: 'normal',
        timestamp: Date.now() - 120000, // 2m ago
        ttl: 60000, // 1m TTL
      };

      multiAgentHandler.onEvent!(b.node, b.config, b.ctx, {
        type: 'receive_agent_message',
        payload: expiredMsg,
      });

      expect(b.state().inbox).toHaveLength(0);
    });

    it('inbox overflow trims oldest message', () => {
      const b = spawnAgent('b1', 'Bravo', [], { max_inbox_size: 3 });

      for (let i = 0; i < 4; i++) {
        multiAgentHandler.onEvent!(b.node, b.config, b.ctx, {
          type: 'receive_agent_message',
          payload: {
            id: `msg_${i}`,
            from: 'a1',
            to: 'b1',
            type: 'ping',
            payload: i,
            priority: 'normal',
            timestamp: Date.now(),
            ttl: 60000,
          },
        });
      }

      expect(b.state().inbox).toHaveLength(3);
      // oldest (msg_0) was shifted out
      expect(b.state().inbox[0].id).toBe('msg_1');
    });
  });

  // ======== TASK DELEGATION ========

  describe('task delegation', () => {
    it('delegates task to specific agent', () => {
      const a = spawnAgent('a1', 'Alpha');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'delegate_task',
        payload: {
          assigneeId: 'b1',
          description: 'Process data',
        },
      });

      const tasks = a.state().delegatedTasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0].assigneeId).toBe('b1');
      expect(tasks[0].status).toBe('assigned');
    });

    it('auto-assigns task by capability match', () => {
      const a = spawnAgent('a1', 'Alpha');
      const b = spawnAgent('b1', 'Bravo', ['render', 'gpu']);

      // Register B in A's registry
      discover(a, b.state());
      a.ctx.emit.mockClear();

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'delegate_task',
        payload: {
          description: 'Render scene',
          requiredCapabilities: ['render'],
        },
      });

      const task = a.state().delegatedTasks[0];
      expect(task.assigneeId).toBe('b1');
      expect(task.status).toBe('assigned');
    });

    it('leaves task pending when no capable agent found', () => {
      const a = spawnAgent('a1', 'Alpha');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'delegate_task',
        payload: {
          description: 'Fly to moon',
          requiredCapabilities: ['rocket'],
        },
      });

      expect(a.state().delegatedTasks[0].status).toBe('pending');
      expect(a.state().delegatedTasks[0].assigneeId).toBeNull();
    });

    it('enforces task limit', () => {
      const a = spawnAgent('a1', 'Alpha', [], { max_active_tasks: 2 });

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'delegate_task',
        payload: { assigneeId: 'b1', description: 'Task 1' },
      });
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'delegate_task',
        payload: { assigneeId: 'b1', description: 'Task 2' },
      });
      a.ctx.emit.mockClear();

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'delegate_task',
        payload: { assigneeId: 'b1', description: 'Task 3 — overflow' },
      });

      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_task_limit_reached',
        expect.objectContaining({ limit: 2 })
      );
      expect(a.state().delegatedTasks).toHaveLength(2);
    });

    it('accepts task and marks agent busy', () => {
      const b = spawnAgent('b1', 'Bravo');

      // Simulate an assigned task arriving
      b.state().assignedTasks.push({
        id: 'task_1',
        delegatorId: 'a1',
        assigneeId: 'b1',
        description: 'Work',
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

      multiAgentHandler.onEvent!(b.node, b.config, b.ctx, {
        type: 'accept_task',
        payload: { taskId: 'task_1' },
      });

      expect(b.state().assignedTasks[0].status).toBe('in_progress');
      expect(b.state().self.status).toBe('busy');
    });

    it('completes assigned task and returns to active', () => {
      const b = spawnAgent('b1', 'Bravo');

      b.state().assignedTasks.push({
        id: 'task_2',
        delegatorId: 'a1',
        assigneeId: 'b1',
        description: 'Work',
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
      b.state().self.status = 'busy';

      multiAgentHandler.onEvent!(b.node, b.config, b.ctx, {
        type: 'complete_task',
        payload: { taskId: 'task_2', result: { output: 'done' } },
      });

      expect(b.state().assignedTasks[0].status).toBe('completed');
      expect(b.state().assignedTasks[0].result).toEqual({ output: 'done' });
      expect(b.state().self.status).toBe('active');
    });

    it('retries failed task then fails permanently', () => {
      const a = spawnAgent('a1', 'Alpha', [], { max_task_retries: 2 });

      a.state().delegatedTasks.push({
        id: 'task_r',
        delegatorId: 'a1',
        assigneeId: 'b1',
        description: 'Flaky task',
        requiredCapabilities: [],
        status: 'assigned',
        priority: 'normal',
        payload: {},
        result: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deadline: 0,
        retryCount: 0,
        maxRetries: 2,
      });

      // First failure → retry
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'fail_task',
        payload: { taskId: 'task_r', error: 'timeout' },
      });
      expect(a.state().delegatedTasks[0].status).toBe('pending');
      expect(a.state().delegatedTasks[0].retryCount).toBe(1);

      // Second failure → permanently failed
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'fail_task',
        payload: { taskId: 'task_r', error: 'timeout' },
      });
      expect(a.state().delegatedTasks[0].status).toBe('failed');
      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_task_failed',
        expect.objectContaining({ taskId: 'task_r' })
      );
    });

    it('task deadline expiry on update', () => {
      const a = spawnAgent('a1', 'Alpha', [], { heartbeat_interval: 99999 });

      a.state().delegatedTasks.push({
        id: 'task_exp',
        delegatorId: 'a1',
        assigneeId: 'b1',
        description: 'Deadline task',
        requiredCapabilities: [],
        status: 'assigned',
        priority: 'normal',
        payload: {},
        result: null,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 10000,
        deadline: Date.now() - 1000, // already past
        retryCount: 0,
        maxRetries: 3,
      });

      multiAgentHandler.onUpdate!(a.node, a.config, a.ctx, 16);

      expect(a.state().delegatedTasks[0].status).toBe('failed');
      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_task_expired',
        expect.objectContaining({ task: expect.objectContaining({ id: 'task_exp' }) })
      );
    });
  });

  // ======== SHARED STATE ========

  describe('shared state', () => {
    it('sets and gets shared state', () => {
      const a = spawnAgent('a1', 'Alpha');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'score', value: 42 },
      });

      a.ctx.emit.mockClear();
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'get_shared_state',
        payload: { key: 'score' },
      });

      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_shared_state_response',
        expect.objectContaining({ key: 'score', value: 42, version: 1 })
      );
    });

    it('increments version on overwrite', () => {
      const a = spawnAgent('a1', 'Alpha');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'counter', value: 1 },
      });
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'counter', value: 2 },
      });

      const entry = a.state().sharedState.get('counter');
      expect(entry.value).toBe(2);
      expect(entry.version).toBe(2);
    });

    it('last-write-wins on sync from remote', () => {
      const a = spawnAgent('a1', 'Alpha');

      // Local write v1
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'data', value: 'local' },
      });

      // Remote sync with higher version
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'sync_shared_state',
        payload: {
          entries: [{ key: 'data', value: 'remote', writer: 'b1', version: 5 }],
        },
      });

      const entry = a.state().sharedState.get('data');
      expect(entry.value).toBe('remote');
      expect(entry.version).toBe(5);
      expect(entry.lastWriter).toBe('b1');
    });

    it('rejects sync with lower version', () => {
      const a = spawnAgent('a1', 'Alpha');

      // Local write v1 → v2
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'x', value: 'v1' },
      });
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'x', value: 'v2' },
      });

      // Sync with v1 (lower)
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'sync_shared_state',
        payload: {
          entries: [{ key: 'x', value: 'stale', writer: 'b1', version: 1 }],
        },
      });

      expect(a.state().sharedState.get('x').value).toBe('v2');
    });

    it('enforces max_shared_state_entries', () => {
      const a = spawnAgent('a1', 'Alpha', [], { max_shared_state_entries: 2 });

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'k1', value: 1 },
      });
      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'k2', value: 2 },
      });
      a.ctx.emit.mockClear();

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_shared_state',
        payload: { key: 'k3', value: 3 },
      });

      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_shared_state_limit',
        expect.objectContaining({ limit: 2 })
      );
      expect(a.state().sharedState.size).toBe(2);
    });

    it('returns null for missing key', () => {
      const a = spawnAgent('a1', 'Alpha');
      a.ctx.emit.mockClear();

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'get_shared_state',
        payload: { key: 'missing' },
      });

      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_shared_state_response',
        expect.objectContaining({ key: 'missing', value: null, version: 0 })
      );
    });
  });

  // ======== HEARTBEAT + LIVENESS ========

  describe('heartbeat + liveness', () => {
    it('emits heartbeat after interval elapses', () => {
      const a = spawnAgent('a1', 'Alpha', [], { heartbeat_interval: 100 });
      a.ctx.emit.mockClear();

      // 50ms — not enough
      multiAgentHandler.onUpdate!(a.node, a.config, a.ctx, 50);
      expect(a.ctx.emit).not.toHaveBeenCalledWith('multi_agent_heartbeat', expect.anything());

      // +60ms = 110ms — enough
      multiAgentHandler.onUpdate!(a.node, a.config, a.ctx, 60);
      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_heartbeat',
        expect.objectContaining({ agentId: 'a1' })
      );
    });

    it('marks peer offline after threshold', () => {
      const a = spawnAgent('a1', 'Alpha', [], {
        heartbeat_interval: 100,
        offline_threshold: 2,
      });
      const b = spawnAgent('b1', 'Bravo');

      discover(a, b.state());

      // Artificially age B's heartbeat
      a.state().registry.get('b1')!.lastHeartbeat = Date.now() - 300; // > 100*2=200
      a.ctx.emit.mockClear();

      multiAgentHandler.onUpdate!(a.node, a.config, a.ctx, 100);

      expect(a.state().registry.get('b1')!.status).toBe('offline');
      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_offline',
        expect.objectContaining({ agentId: 'b1' })
      );
    });

    it('offline agent excluded from discovery', () => {
      const a = spawnAgent('a1', 'Alpha', [], {
        heartbeat_interval: 100,
        offline_threshold: 2,
      });
      const b = spawnAgent('b1', 'Bravo', ['render']);

      discover(a, b.state());
      a.state().registry.get('b1')!.status = 'offline';
      a.ctx.emit.mockClear();

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'discover_agents',
        payload: {},
      });

      const result = a.ctx.emit.mock.calls.find(
        (c: any) => c[0] === 'multi_agent_discovery_result'
      );
      // Only self should be returned (offline B excluded)
      expect(result![1].agents).toHaveLength(1);
      expect(result![1].agents[0].id).toBe('a1');
    });

    it('message TTL causes expiry during update', () => {
      const a = spawnAgent('a1', 'Alpha');

      // Inject an old message directly
      a.state().inbox.push({
        id: 'msg_old',
        from: 'b1',
        to: 'a1',
        type: 'stale',
        payload: {},
        priority: 'normal',
        timestamp: Date.now() - 120000,
        ttl: 60000,
      });

      expect(a.state().inbox).toHaveLength(1);

      multiAgentHandler.onUpdate!(a.node, a.config, a.ctx, 16);

      expect(a.state().inbox).toHaveLength(0);
    });
  });

  // ======== STATUS ========

  describe('status management', () => {
    it('responds to get_agent_status', () => {
      const a = spawnAgent('a1', 'Alpha', ['search']);
      a.ctx.emit.mockClear();

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'get_agent_status',
        payload: {},
      });

      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_status_response',
        expect.objectContaining({
          agent: expect.objectContaining({ id: 'a1', status: 'active' }),
          registrySize: 1,
        })
      );
    });

    it('sets agent status', () => {
      const a = spawnAgent('a1', 'Alpha');

      multiAgentHandler.onEvent!(a.node, a.config, a.ctx, {
        type: 'set_agent_status',
        payload: { status: 'idle' },
      });

      expect(a.state().self.status).toBe('idle');
      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_status_changed',
        expect.objectContaining({ status: 'idle' })
      );
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('emits unregistered on detach', () => {
      const a = spawnAgent('a1', 'Alpha');
      a.ctx.emit.mockClear();

      multiAgentHandler.onDetach!(a.node, a.config, a.ctx);

      expect(a.ctx.emit).toHaveBeenCalledWith(
        'multi_agent_unregistered',
        expect.objectContaining({ agentId: 'a1' })
      );
      expect((a.node as any).__multiAgentState).toBeUndefined();
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const bare = { id: 'bare' } as any;
      const ctx = { emit: vi.fn() };
      multiAgentHandler.onEvent!(bare, multiAgentHandler.defaultConfig, ctx, {
        type: 'delegate_task',
        payload: { description: 'test' },
      });
      expect(ctx.emit).not.toHaveBeenCalled();
    });

    it('update with no state is a no-op', () => {
      const bare = { id: 'bare' } as any;
      const ctx = { emit: vi.fn() };
      // Should not crash
      multiAgentHandler.onUpdate!(bare, multiAgentHandler.defaultConfig, ctx, 16);
    });
  });
});
