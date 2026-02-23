/**
 * MultiAgentTrait — Production Test Suite
 *
 * multiAgentHandler is self-contained with no external dependencies.
 *
 * Key behaviours:
 * 1. defaultConfig — 11 fields
 * 2. onAttach — self registration in registry; emits multi_agent_registered; agentId fallback to node.id
 * 3. onDetach — emits multi_agent_unregistered; deletes __multiAgentState
 * 4. onUpdate — heartbeat: accumulates timer, fires when >= heartbeat_interval, resets, emits multi_agent_heartbeat
 *   - offline detection: once agent not seen for offline_threshold * heartbeat_interval, marks offline + emits
 *   - inbox TTL: expired messages pruned
 *   - task deadlines: expired non-terminal tasks → 'failed' + emits multi_agent_task_expired
 * 5. onEvent 'agent_discovered' — registers new peer, emits multi_agent_peer_registered; updates existing heartbeat on repeat
 * 6. onEvent 'agent_departed' — removes peer, emits multi_agent_peer_unregistered; no-op for self or unknown
 * 7. onEvent 'discover_agents' — returns all active (optionally filtered by capability), emits multi_agent_discovery_result
 * 8. onEvent 'send_agent_message' — unicast → emits multi_agent_message_unicast; broadcast (no to) → multi_agent_message_broadcast
 * 9. onEvent 'receive_agent_message' — filters: wrong recipient, own sender, expired TTL; otherwise pushes to inbox + emits
 * 10. onEvent 'delegate_task' — creates task, emits multi_agent_task_delegated; limit guard; auto-assignee by capability
 * 11. onEvent 'accept_task' — in_progress + self.status=busy + emits
 * 12. onEvent 'complete_task' — completes assigned or delegated task, reverts status, emits
 * 13. onEvent 'fail_task' — retries (< maxRetries) → pending + emits retrying; else failed + emits failed
 * 14. onEvent 'set_shared_state' — inserts/updates entry, increments version; limit guard; emits
 * 15. onEvent 'get_shared_state' — emits response with value
 * 16. onEvent 'sync_shared_state' — last-write-wins (higher version wins); emits state_synced
 * 17. onEvent 'get_agent_status' — emits status snapshot
 * 18. onEvent 'set_agent_status' — sets self.status, emits
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiAgentHandler } from '../MultiAgentTrait';

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nodeId = 0;
function makeNode() { return { id: `ma_node_${++_nodeId}` }; }
function makeCtx() { return { emit: vi.fn() }; }
function makeConfig(o: any = {}) { return { ...multiAgentHandler.defaultConfig!, ...o }; }

function attach(o: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(o);
  multiAgentHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) { return (node as any).__multiAgentState; }

function sendEvent(node: any, config: any, ctx: any, type: string, payload: any) {
  multiAgentHandler.onEvent!(node as any, config, ctx as any, { type, payload });
}

beforeEach(() => vi.clearAllMocks());

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('multiAgentHandler.defaultConfig', () => {
  const d = multiAgentHandler.defaultConfig!;
  it('agent_id = ""', () => expect(d.agent_id).toBe(''));
  it('agent_name = Agent', () => expect(d.agent_name).toBe('Agent'));
  it('capabilities = []', () => expect(d.capabilities).toEqual([]));
  it('heartbeat_interval = 5000', () => expect(d.heartbeat_interval).toBe(5000));
  it('offline_threshold = 3', () => expect(d.offline_threshold).toBe(3));
  it('max_inbox_size = 100', () => expect(d.max_inbox_size).toBe(100));
  it('default_message_ttl = 60000', () => expect(d.default_message_ttl).toBe(60000));
  it('max_active_tasks = 20', () => expect(d.max_active_tasks).toBe(20));
  it('max_task_retries = 3', () => expect(d.max_task_retries).toBe(3));
  it('enable_shared_state = true', () => expect(d.enable_shared_state).toBe(true));
  it('max_shared_state_entries = 500', () => expect(d.max_shared_state_entries).toBe(500));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('multiAgentHandler.onAttach', () => {
  it('creates __multiAgentState', () => {
    const { node } = attach();
    expect(getState(node)).toBeDefined();
  });
  it('self agentId defaults to node.id', () => {
    const { node } = attach({ agent_id: '' });
    expect(getState(node).self.id).toBe(node.id);
  });
  it('self agentId uses config.agent_id when provided', () => {
    const { node } = attach({ agent_id: 'custom_agent' });
    expect(getState(node).self.id).toBe('custom_agent');
  });
  it('self.status = active', () => {
    const { node } = attach();
    expect(getState(node).self.status).toBe('active');
  });
  it('self is pre-registered in registry', () => {
    const { node } = attach({ agent_id: 'my_agent' });
    expect(getState(node).registry.has('my_agent')).toBe(true);
  });
  it('emits multi_agent_registered', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_registered', expect.any(Object));
  });
  it('capabilities cloned from config', () => {
    const { node } = attach({ capabilities: ['vision', 'planning'] });
    expect(getState(node).self.capabilities).toEqual(['vision', 'planning']);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('multiAgentHandler.onDetach', () => {
  it('emits multi_agent_unregistered', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    multiAgentHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_unregistered', expect.any(Object));
  });
  it('removes __multiAgentState', () => {
    const { node, ctx, config } = attach();
    multiAgentHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
});

// ─── onUpdate — heartbeat ─────────────────────────────────────────────────────
describe('multiAgentHandler.onUpdate — heartbeat', () => {
  it('accumulates heartbeatTimer without firing before interval', () => {
    const { node, ctx, config } = attach({ heartbeat_interval: 100 });
    ctx.emit.mockClear();
    multiAgentHandler.onUpdate!(node as any, config, ctx as any, 50);
    expect(getState(node).heartbeatTimer).toBe(50);
    expect(ctx.emit).not.toHaveBeenCalledWith('multi_agent_heartbeat', expect.anything());
  });

  it('fires heartbeat and resets timer when >= interval', () => {
    const { node, ctx, config } = attach({ heartbeat_interval: 100 });
    ctx.emit.mockClear();
    multiAgentHandler.onUpdate!(node as any, config, ctx as any, 100);
    expect(getState(node).heartbeatTimer).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_heartbeat', expect.objectContaining({
      agentId: node.id,
    }));
  });

  it('marks peer offline after missed heartbeats and emits multi_agent_offline', () => {
    const { node, ctx, config } = attach({ heartbeat_interval: 100, offline_threshold: 2, agent_id: 'host' });
    const state = getState(node);
    // Register a peer with old heartbeat
    state.registry.set('peer_1', {
      id: 'peer_1', name: 'Peer1', capabilities: [], status: 'active',
      metadata: {}, registeredAt: 0,
      lastHeartbeat: Date.now() - 99999, nodeRef: null,
    });
    ctx.emit.mockClear();
    multiAgentHandler.onUpdate!(node as any, config, ctx as any, 100);
    const peer = state.registry.get('peer_1');
    expect(peer!.status).toBe('offline');
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_offline', expect.objectContaining({ agentId: 'peer_1' }));
  });

  it('does NOT repeatedly emit offline for already-offline peer', () => {
    const { node, ctx, config } = attach({ heartbeat_interval: 100, offline_threshold: 2, agent_id: 'host' });
    const state = getState(node);
    state.registry.set('peer_2', {
      id: 'peer_2', name: 'P2', capabilities: [], status: 'offline',
      metadata: {}, registeredAt: 0, lastHeartbeat: 0, nodeRef: null,
    });
    ctx.emit.mockClear();
    multiAgentHandler.onUpdate!(node as any, config, ctx as any, 100);
    const offlineCalls = ctx.emit.mock.calls.filter(([ev]) => ev === 'multi_agent_offline');
    expect(offlineCalls.length).toBe(0);
  });
});

// ─── onUpdate — inbox expiry & task deadline ───────────────────────────────────
describe('multiAgentHandler.onUpdate — inbox expiry & deadlines', () => {
  it('removes expired messages from inbox', () => {
    const { node, ctx, config } = attach({ heartbeat_interval: 9999 });
    const state = getState(node);
    state.inbox.push({ id: 'msg_1', from: 'other', to: node.id, type: 'x', payload: {}, priority: 'normal', timestamp: Date.now() - 90000, ttl: 60000 });
    state.inbox.push({ id: 'msg_2', from: 'other', to: node.id, type: 'x', payload: {}, priority: 'normal', timestamp: Date.now(), ttl: 60000 });
    multiAgentHandler.onUpdate!(node as any, config, ctx as any, 1);
    expect(state.inbox.length).toBe(1);
    expect(state.inbox[0].id).toBe('msg_2');
  });

  it('marks in-progress tasks as failed when deadline passed', () => {
    const { node, ctx, config } = attach({ heartbeat_interval: 9999 });
    const state = getState(node);
    const expiredTask: any = {
      id: 'task_exp_1', delegatorId: node.id, assigneeId: 'other', description: 'exp',
      requiredCapabilities: [], status: 'assigned', priority: 'normal', payload: {},
      result: null, createdAt: 0, updatedAt: 0, deadline: Date.now() - 1000, retryCount: 0, maxRetries: 3,
    };
    state.delegatedTasks.push(expiredTask);
    ctx.emit.mockClear();
    multiAgentHandler.onUpdate!(node as any, config, ctx as any, 1);
    expect(expiredTask.status).toBe('failed');
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_task_expired', expect.objectContaining({ task: expect.objectContaining({ id: 'task_exp_1' }) }));
  });
});

// ─── agent_discovered / agent_departed ───────────────────────────────────────
describe("onEvent 'agent_discovered'", () => {
  it('registers new peer and emits multi_agent_peer_registered', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'peer_A', name: 'PeerA', capabilities: ['planning'] });
    expect(getState(node).registry.has('peer_A')).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_peer_registered', expect.objectContaining({
      agent: expect.objectContaining({ id: 'peer_A' })
    }));
  });

  it('updates heartbeat for already-known peer (no duplicate registration)', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'peer_B', name: 'PeerB', capabilities: [] });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'peer_B', name: 'PeerB', capabilities: ['new_cap'] });
    // Should NOT emit peer_registered again
    expect(ctx.emit).not.toHaveBeenCalledWith('multi_agent_peer_registered', expect.anything());
    // Capabilities should be updated
    const peer = getState(node).registry.get('peer_B');
    expect(peer!.capabilities).toContain('new_cap');
  });
});

describe("onEvent 'agent_departed'", () => {
  it('removes peer and emits multi_agent_peer_unregistered', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'peer_C', name: 'C', capabilities: [] });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'agent_departed', { agentId: 'peer_C' });
    expect(getState(node).registry.has('peer_C')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_peer_unregistered', expect.objectContaining({ agentId: 'peer_C' }));
  });

  it('no-op: cannot remove self', () => {
    const { node, ctx, config } = attach({ agent_id: 'self_agent' });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'agent_departed', { agentId: 'self_agent' });
    expect(getState(node).registry.has('self_agent')).toBe(true);
  });

  it('no-op for unknown agentId', () => {
    const { node, ctx, config } = attach();
    expect(() => sendEvent(node, config, ctx, 'agent_departed', { agentId: 'ghost' })).not.toThrow();
  });
});

// ─── discover_agents ──────────────────────────────────────────────────────────
describe("onEvent 'discover_agents'", () => {
  it('returns all active agents when no capability filter', () => {
    const { node, ctx, config } = attach({ agent_id: 'host' });
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'p1', name: 'P1', capabilities: [] });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'discover_agents', {});
    const call = ctx.emit.mock.calls.find(([ev]) => ev === 'multi_agent_discovery_result');
    expect(call![1].agents.length).toBe(2); // self + p1
  });

  it('filters by capability when specified', () => {
    const { node, ctx, config } = attach({ agent_id: 'host' });
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'p_vis', name: 'V', capabilities: ['vision'] });
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'p_plan', name: 'P', capabilities: ['planning'] });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'discover_agents', { capability: 'vision' });
    const call = ctx.emit.mock.calls.find(([ev]) => ev === 'multi_agent_discovery_result');
    expect(call![1].agents.every((a: any) => a.capabilities.includes('vision'))).toBe(true);
  });

  it('excludes offline agents', () => {
    const { node, ctx, config } = attach({ agent_id: 'host' });
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'p_off', name: 'Off', capabilities: [] });
    getState(node).registry.get('p_off').status = 'offline';
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'discover_agents', {});
    const call = ctx.emit.mock.calls.find(([ev]) => ev === 'multi_agent_discovery_result');
    expect(call![1].agents.some((a: any) => a.id === 'p_off')).toBe(false);
  });
});

// ─── send_agent_message ───────────────────────────────────────────────────────
describe("onEvent 'send_agent_message'", () => {
  it('unicast: emits multi_agent_message_unicast', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'send_agent_message', { to: 'other_agent', type: 'ping', payload: {} });
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_message_unicast', expect.any(Object));
  });

  it('broadcast: emits multi_agent_message_broadcast when no "to"', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'send_agent_message', { type: 'broadcast_ping', payload: {} });
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_message_broadcast', expect.any(Object));
  });

  it('outbox stores the message', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'send_agent_message', { type: 'x', payload: {} });
    expect(getState(node).outbox.length).toBe(1);
    expect(getState(node).messageCounter).toBe(1);
  });
});

// ─── receive_agent_message ────────────────────────────────────────────────────
describe("onEvent 'receive_agent_message'", () => {
  function makeMsg(overrides: any = {}) {
    return {
      id: 'msg_99', from: 'other_agent', to: null, type: 'hello',
      payload: {}, priority: 'normal', timestamp: Date.now(), ttl: 60000,
      ...overrides,
    };
  }
  it('adds broadcast message to inbox and emits multi_agent_message_received', () => {
    const { node, ctx, config } = attach({ agent_id: 'me' });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'receive_agent_message', makeMsg({ to: null }));
    expect(getState(node).inbox.length).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_message_received', expect.any(Object));
  });

  it('accepts message explicitly addressed to self', () => {
    const { node, ctx, config } = attach({ agent_id: 'me' });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'receive_agent_message', makeMsg({ to: 'me' }));
    expect(getState(node).inbox.length).toBe(1);
  });

  it('rejects message addressed to someone else', () => {
    const { node, ctx, config } = attach({ agent_id: 'me' });
    sendEvent(node, config, ctx, 'receive_agent_message', makeMsg({ to: 'not_me' }));
    expect(getState(node).inbox.length).toBe(0);
  });

  it('rejects own message (from === self)', () => {
    const { node, ctx, config } = attach({ agent_id: 'me' });
    sendEvent(node, config, ctx, 'receive_agent_message', makeMsg({ from: 'me', to: null }));
    expect(getState(node).inbox.length).toBe(0);
  });

  it('rejects expired TTL message', () => {
    const { node, ctx, config } = attach({ agent_id: 'me' });
    sendEvent(node, config, ctx, 'receive_agent_message', makeMsg({ timestamp: Date.now() - 90000, ttl: 60000 }));
    expect(getState(node).inbox.length).toBe(0);
  });
});

// ─── delegate_task ────────────────────────────────────────────────────────────
describe("onEvent 'delegate_task'", () => {
  it('creates task with status=pending when no assignee', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'delegate_task', { description: 'Do something' });
    const state = getState(node);
    expect(state.delegatedTasks.length).toBe(1);
    expect(state.delegatedTasks[0].status).toBe('pending');
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_task_delegated', expect.any(Object));
  });

  it('creates task with status=assigned when assigneeId provided', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'delegate_task', { description: 'Do something', assigneeId: 'other_agent' });
    const state = getState(node);
    expect(state.delegatedTasks[0].status).toBe('assigned');
    expect(state.delegatedTasks[0].assigneeId).toBe('other_agent');
  });

  it('auto-assigns to capable peer by capability match', () => {
    const { node, ctx, config } = attach({ agent_id: 'host' });
    sendEvent(node, config, ctx, 'agent_discovered', { agentId: 'worker', name: 'W', capabilities: ['compute'] });
    sendEvent(node, config, ctx, 'delegate_task', { description: 'Crunch', requiredCapabilities: ['compute'] });
    const state = getState(node);
    expect(state.delegatedTasks[0].assigneeId).toBe('worker');
    expect(state.delegatedTasks[0].status).toBe('assigned');
  });

  it('emits multi_agent_task_limit_reached when at max_active_tasks', () => {
    const { node, ctx, config } = attach({ max_active_tasks: 1 });
    sendEvent(node, config, ctx, 'delegate_task', { description: 'First task' });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'delegate_task', { description: 'Blocked task' });
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_task_limit_reached', expect.any(Object));
  });
});

// ─── accept_task / complete_task / fail_task ──────────────────────────────────
describe("onEvent 'accept_task'", () => {
  it('sets task to in_progress + self.status=busy + emits', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    const task: any = {
      id: 'task_test_1', delegatorId: 'other', assigneeId: node.id, description: 'd',
      requiredCapabilities: [], status: 'assigned', priority: 'normal', payload: {},
      result: null, createdAt: 0, updatedAt: 0, deadline: 0, retryCount: 0, maxRetries: 3,
    };
    state.assignedTasks.push(task);
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'accept_task', { taskId: 'task_test_1' });
    expect(task.status).toBe('in_progress');
    expect(state.self.status).toBe('busy');
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_task_accepted', expect.objectContaining({ taskId: 'task_test_1' }));
  });
});

describe("onEvent 'complete_task'", () => {
  it('completes assigned task and reverts status to active', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    const task: any = {
      id: 'task_comp_1', delegatorId: 'other', assigneeId: node.id, description: 'd',
      requiredCapabilities: [], status: 'in_progress', priority: 'normal', payload: {},
      result: null, createdAt: 0, updatedAt: 0, deadline: 0, retryCount: 0, maxRetries: 3,
    };
    state.assignedTasks.push(task);
    state.self.status = 'busy';
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'complete_task', { taskId: 'task_comp_1', result: { score: 100 } });
    expect(task.status).toBe('completed');
    expect(task.result).toEqual({ score: 100 });
    expect(state.self.status).toBe('active');
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_task_completed', expect.any(Object));
  });

  it('completes delegated task (reported by assignee)', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    const task: any = {
      id: 'task_del_1', delegatorId: node.id, assigneeId: 'worker_agent', description: 'd',
      requiredCapabilities: [], status: 'in_progress', priority: 'normal', payload: {},
      result: null, createdAt: 0, updatedAt: 0, deadline: 0, retryCount: 0, maxRetries: 3,
    };
    state.delegatedTasks.push(task);
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'complete_task', { taskId: 'task_del_1', result: 'done' });
    expect(task.status).toBe('completed');
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_task_completed', expect.any(Object));
  });
});

describe("onEvent 'fail_task'", () => {
  function makeTask(id: string, retryCount: number, maxRetries: number) {
    return {
      id, delegatorId: 'self', assigneeId: null, description: 'd',
      requiredCapabilities: [], status: 'in_progress' as const, priority: 'normal' as const,
      payload: {}, result: null, createdAt: 0, updatedAt: 0, deadline: 0, retryCount, maxRetries,
    };
  }

  it('retries task when retryCount < maxRetries', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    const task = makeTask('t_retry', 0, 3);
    state.delegatedTasks.push(task as any);
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'fail_task', { taskId: 't_retry', error: 'timeout' });
    expect(task.status).toBe('pending');
    expect(task.retryCount).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_task_retrying', expect.any(Object));
  });

  it('permanently fails when retryCount >= maxRetries', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    const task = makeTask('t_fail', 2, 3);
    state.delegatedTasks.push(task as any);
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'fail_task', { taskId: 't_fail', error: 'crash' });
    expect(task.status).toBe('failed');
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_task_failed', expect.objectContaining({ taskId: 't_fail', error: 'crash' }));
  });
});

// ─── shared state ─────────────────────────────────────────────────────────────
describe("onEvent 'set_shared_state'", () => {
  it('stores entry and emits multi_agent_shared_state_updated', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'score', value: 42 });
    const state = getState(node);
    expect(state.sharedState.get('score')!.value).toBe(42);
    expect(state.sharedState.get('score')!.version).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_shared_state_updated', expect.objectContaining({ key: 'score', version: 1 }));
  });

  it('increments version on update', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'x', value: 1 });
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'x', value: 2 });
    expect(getState(node).sharedState.get('x')!.version).toBe(2);
  });

  it('emits limit_reached when at max_shared_state_entries', () => {
    const { node, ctx, config } = attach({ max_shared_state_entries: 1 });
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'k1', value: 1 });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'k2', value: 2 });
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_shared_state_limit', expect.any(Object));
  });

  it('no-op when enable_shared_state=false', () => {
    const { node, ctx, config } = attach({ enable_shared_state: false });
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'x', value: 1 });
    expect(getState(node).sharedState.size).toBe(0);
  });
});

describe("onEvent 'get_shared_state'", () => {
  it('emits multi_agent_shared_state_response with existing value', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'hp', value: 100 });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'get_shared_state', { key: 'hp' });
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_shared_state_response', expect.objectContaining({ key: 'hp', value: 100 }));
  });

  it('emits null value for missing key', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'get_shared_state', { key: 'missing' });
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_shared_state_response', expect.objectContaining({ value: null, version: 0 }));
  });
});

describe("onEvent 'sync_shared_state'", () => {
  it('last-write-wins: accepts higher version', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'hp', value: 50 }); // version 1
    sendEvent(node, config, ctx, 'sync_shared_state', { entries: [{ key: 'hp', value: 100, writer: 'remote', version: 5 }] });
    expect(getState(node).sharedState.get('hp')!.value).toBe(100);
  });

  it('rejects lower version', () => {
    const { node, ctx, config } = attach();
    sendEvent(node, config, ctx, 'set_shared_state', { key: 'hp', value: 50 }); // version 1
    sendEvent(node, config, ctx, 'sync_shared_state', { entries: [{ key: 'hp', value: 1, writer: 'remote', version: 0 }] });
    expect(getState(node).sharedState.get('hp')!.value).toBe(50);
  });

  it('emits multi_agent_state_synced with entry counts', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'sync_shared_state', { entries: [{ key: 'a', value: 1, writer: 'r', version: 1 }] });
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_state_synced', expect.objectContaining({ entriesReceived: 1 }));
  });
});

// ─── get/set status ───────────────────────────────────────────────────────────
describe("onEvent 'get_agent_status' / 'set_agent_status'", () => {
  it('get_agent_status emits status snapshot', () => {
    const { node, ctx, config } = attach({ agent_id: 'status_agent', capabilities: ['x'] });
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'get_agent_status', {});
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_status_response', expect.objectContaining({
      agent: expect.objectContaining({ id: 'status_agent', capabilities: ['x'] }),
    }));
  });

  it('set_agent_status updates self.status and emits', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    sendEvent(node, config, ctx, 'set_agent_status', { status: 'idle' });
    expect(getState(node).self.status).toBe('idle');
    expect(ctx.emit).toHaveBeenCalledWith('multi_agent_status_changed', expect.objectContaining({ status: 'idle' }));
  });
});
