/**
 * AgentPortalTrait — comprehensive test suite
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  agentPortalHandler,
  type PortalConfig,
  type PortalState,
  type PortalMessage,
  type RemoteAgent,
  type AgentMigrationPacket,
} from '../AgentPortalTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => {
      emitted.push({ type, payload });
    },
  };
  return { context, emitted };
}

const BASE_CONFIG: PortalConfig = {
  ...(agentPortalHandler.defaultConfig as PortalConfig),
  scene_id: 'scene-A',
  scene_name: 'Scene A',
  agent_id: 'agent-1',
  capabilities: ['vision', 'nlp'],
};

function setup(partial: Partial<PortalConfig> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: PortalConfig = { ...BASE_CONFIG, ...partial };
  agentPortalHandler.onAttach(node, config, context);
  emitted.length = 0;
  return { node, context, emitted, config };
}

function getState(node: HSPlusNode): PortalState {
  return (node as any).__portalState as PortalState;
}

function fire(
  node: HSPlusNode,
  config: PortalConfig,
  context: TraitContext,
  type: string,
  payload?: unknown
) {
  agentPortalHandler.onEvent(node, config, context, { type, payload });
}

// ---------------------------------------------------------------------------
// onAttach
// ---------------------------------------------------------------------------

describe('onAttach', () => {
  it('should initialise __portalState', () => {
    const { node } = setup();
    expect((node as any).__portalState).toBeDefined();
  });

  it('should start disconnected', () => {
    const { node } = setup();
    expect(getState(node).connected).toBe(false);
  });

  it('should start with empty scenes map', () => {
    const { node } = setup();
    expect(getState(node).scenes.size).toBe(0);
  });

  it('should start with empty remoteAgents map', () => {
    const { node } = setup();
    expect(getState(node).remoteAgents.size).toBe(0);
  });

  it('should start with empty inbox', () => {
    const { node } = setup();
    expect(getState(node).inbox.length).toBe(0);
  });

  it('should start with empty outbox', () => {
    const { node } = setup();
    expect(getState(node).outbox.length).toBe(0);
  });

  it('should emit portal:init on attach', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    agentPortalHandler.onAttach(node, BASE_CONFIG, context);
    expect(emitted.some(e => e.type === 'portal:init')).toBe(true);
  });

  it('portal:init payload should include sceneId', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    agentPortalHandler.onAttach(node, BASE_CONFIG, context);
    const ev = emitted.find(e => e.type === 'portal:init');
    expect((ev!.payload as any).sceneId).toBe('scene-A');
  });

  it('portal:init payload should include relayUrl', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    agentPortalHandler.onAttach(node, BASE_CONFIG, context);
    const ev = emitted.find(e => e.type === 'portal:init');
    expect((ev!.payload as any).relayUrl).toBe(BASE_CONFIG.relay_url);
  });

  it('portal:init payload should include capabilities', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    agentPortalHandler.onAttach(node, BASE_CONFIG, context);
    const ev = emitted.find(e => e.type === 'portal:init');
    expect((ev!.payload as any).capabilities).toEqual(['vision', 'nlp']);
  });
});

// ---------------------------------------------------------------------------
// onDetach
// ---------------------------------------------------------------------------

describe('onDetach', () => {
  it('should remove __portalState', () => {
    const { node, config, context } = setup();
    agentPortalHandler.onDetach(node, config, context);
    expect((node as any).__portalState).toBeUndefined();
  });

  it('should emit portal:disconnected on detach', () => {
    const { node, config, emitted } = setup();
    const { context: ctx2, emitted: ev2 } = makeContext();
    agentPortalHandler.onDetach(node, config, ctx2);
    expect(ev2.some(e => e.type === 'portal:disconnected')).toBe(true);
  });

  it('should emit portal:disconnecting if was connected', () => {
    const { node, config, emitted } = setup();
    getState(node).connected = true;
    const { context: ctx2, emitted: ev2 } = makeContext();
    agentPortalHandler.onDetach(node, config, ctx2);
    expect(ev2.some(e => e.type === 'portal:disconnecting')).toBe(true);
  });

  it('should handle detach with no state gracefully', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => agentPortalHandler.onDetach(node, BASE_CONFIG, context)).not.toThrow();
  });

  it('portal:disconnected reason should be "detached"', () => {
    const { node, config } = setup();
    const { context, emitted } = makeContext();
    agentPortalHandler.onDetach(node, config, context);
    const ev = emitted.find(e => e.type === 'portal:disconnected');
    expect((ev!.payload as any).reason).toBe('detached');
  });
});

// ---------------------------------------------------------------------------
// defaultConfig
// ---------------------------------------------------------------------------

describe('defaultConfig', () => {
  it('should have name "agent_portal"', () => {
    expect(agentPortalHandler.name).toBe('agent_portal');
  });

  it('should have auto_reconnect true', () => {
    expect(agentPortalHandler.defaultConfig?.auto_reconnect).toBe(true);
  });

  it('should have max_hop_count 5', () => {
    expect(agentPortalHandler.defaultConfig?.max_hop_count).toBe(5);
  });

  it('should have max_outbox_size 200', () => {
    expect(agentPortalHandler.defaultConfig?.max_outbox_size).toBe(200);
  });

  it('should have offline_threshold 3', () => {
    expect(agentPortalHandler.defaultConfig?.offline_threshold).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// portal:ws_connected
// ---------------------------------------------------------------------------

describe('portal:ws_connected', () => {
  it('should set connected=true', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal:ws_connected');
    expect(getState(node).connected).toBe(true);
  });

  it('should emit portal:connected', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:ws_connected');
    expect(emitted.some(e => e.type === 'portal:connected')).toBe(true);
  });

  it('portal:connected should include sceneId', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:ws_connected');
    const ev = emitted.find(e => e.type === 'portal:connected');
    expect((ev!.payload as any).sceneId).toBe('scene-A');
  });

  it('should reset reconnectAttempts to 0', () => {
    const { node, config, context } = setup();
    getState(node).reconnectAttempts = 5;
    fire(node, config, context, 'portal:ws_connected');
    expect(getState(node).reconnectAttempts).toBe(0);
  });

  it('should flush queued outbox messages on connect', () => {
    const { node, config, context, emitted } = setup();
    const state = getState(node);
    // Manually add a valid message to outbox
    state.outbox.push({
      id: 'pm_test_1',
      from: { sceneId: 'scene-A', agentId: 'agent-1' },
      to: { sceneId: 'scene-B', agentId: 'agent-2' },
      type: 'hello',
      payload: null,
      timestamp: Date.now(),
      ttl: 60000,
      hopCount: 0,
    });
    fire(node, config, context, 'portal:ws_connected');
    expect(state.outbox.length).toBe(0);
    expect(emitted.some(e => e.type === 'portal:relay_send')).toBe(true);
  });

  it('should not flush expired outbox messages', () => {
    const { node, config, context, emitted } = setup();
    const state = getState(node);
    state.outbox.push({
      id: 'pm_expired',
      from: { sceneId: 'scene-A', agentId: 'agent-1' },
      to: null,
      type: 'old',
      payload: null,
      timestamp: Date.now() - 120_000, // 2 minutes ago
      ttl: 60000, // 1 minute TTL — expired
      hopCount: 0,
    });
    fire(node, config, context, 'portal:ws_connected');
    expect(emitted.some(e => e.type === 'portal:relay_send')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// portal:ws_disconnected
// ---------------------------------------------------------------------------

describe('portal:ws_disconnected', () => {
  it('should set connected=false', () => {
    const { node, config, context } = setup();
    getState(node).connected = true;
    fire(node, config, context, 'portal:ws_disconnected', { reason: 'timeout' });
    expect(getState(node).connected).toBe(false);
  });

  it('should emit portal:disconnected', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:ws_disconnected', { reason: 'timeout' });
    expect(emitted.some(e => e.type === 'portal:disconnected')).toBe(true);
  });

  it('should emit portal:reconnecting when auto_reconnect=true', () => {
    const { node, config, context, emitted } = setup({ auto_reconnect: true, max_reconnect_attempts: 10 });
    fire(node, config, context, 'portal:ws_disconnected', { reason: 'timeout' });
    expect(emitted.some(e => e.type === 'portal:reconnecting')).toBe(true);
  });

  it('should NOT reconnect when auto_reconnect=false', () => {
    const { node, config, context, emitted } = setup({ auto_reconnect: false });
    fire(node, config, context, 'portal:ws_disconnected', { reason: 'manual' });
    expect(emitted.some(e => e.type === 'portal:reconnecting')).toBe(false);
  });

  it('should stop reconnecting after max_reconnect_attempts', () => {
    const { node, config, context, emitted } = setup({
      auto_reconnect: true,
      max_reconnect_attempts: 3,
    });
    getState(node).reconnectAttempts = 3;
    fire(node, config, context, 'portal:ws_disconnected', { reason: 'timeout' });
    expect(emitted.some(e => e.type === 'portal:reconnecting')).toBe(false);
  });

  it('should increment reconnectAttempts on each disconnect', () => {
    const { node, config, context } = setup({ auto_reconnect: true, max_reconnect_attempts: 10 });
    fire(node, config, context, 'portal:ws_disconnected', { reason: 'x' });
    expect(getState(node).reconnectAttempts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// portal:send
// ---------------------------------------------------------------------------

describe('portal:send', () => {
  it('should emit portal:relay_send when connected', () => {
    const { node, config, context, emitted } = setup();
    getState(node).connected = true;
    fire(node, config, context, 'portal:send', {
      to: { sceneId: 'scene-B', agentId: 'b1' },
      messageType: 'ping',
      data: { x: 1 },
    });
    expect(emitted.some(e => e.type === 'portal:relay_send')).toBe(true);
  });

  it('should queue to outbox when disconnected', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal:send', {
      to: { sceneId: 'scene-B', agentId: 'b1' },
      messageType: 'data',
      data: 42,
    });
    expect(getState(node).outbox.length).toBe(1);
  });

  it('should emit portal:message_out', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:send', {
      to: { sceneId: 'scene-B', agentId: 'b1' },
      messageType: 'update',
      data: {},
    });
    expect(emitted.some(e => e.type === 'portal:message_out')).toBe(true);
  });

  it('should respect max_outbox_size', () => {
    const { node, config, context } = setup({ max_outbox_size: 2 });
    for (let i = 0; i < 5; i++) {
      fire(node, config, context, 'portal:send', {
        to: { sceneId: 'scene-B', agentId: 'b' },
        messageType: 'data',
        data: i,
      });
    }
    expect(getState(node).outbox.length).toBe(2);
  });

  it('should attach correlationId when provided', () => {
    const { node, config, context, emitted } = setup();
    getState(node).connected = true;
    fire(node, config, context, 'portal:send', {
      to: { sceneId: 'scene-B', agentId: 'b1' },
      messageType: 'req',
      data: {},
      correlationId: 'corr-123',
    });
    const ev = emitted.find(e => e.type === 'portal:relay_send');
    expect((ev!.payload as any).correlationId).toBe('corr-123');
  });

  it('should increment totalSent when connected', () => {
    const { node, config, context } = setup();
    getState(node).connected = true;
    fire(node, config, context, 'portal:send', {
      to: { sceneId: 'scene-B', agentId: 'b' },
      messageType: 'test',
      data: null,
    });
    expect(getState(node).totalSent).toBe(1);
  });

  it('should ignore send with missing payload', () => {
    const { node, config, context } = setup();
    expect(() => fire(node, config, context, 'portal:send', null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// portal:broadcast
// ---------------------------------------------------------------------------

describe('portal:broadcast', () => {
  it('should send relay_send when connected', () => {
    const { node, config, context, emitted } = setup();
    getState(node).connected = true;
    fire(node, config, context, 'portal:broadcast', { messageType: 'announce', data: 'hello' });
    expect(emitted.some(e => e.type === 'portal:relay_send')).toBe(true);
  });

  it('should queue to outbox when disconnected', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal:broadcast', { messageType: 'announce', data: 'hi' });
    expect(getState(node).outbox.length).toBe(1);
  });

  it('broadcast message should have to=null', () => {
    const { node, config, context, emitted } = setup();
    getState(node).connected = true;
    fire(node, config, context, 'portal:broadcast', { messageType: 'all', data: {} });
    const ev = emitted.find(e => e.type === 'portal:relay_send');
    expect((ev!.payload as any).to).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// portal:relay_message (inbound)
// ---------------------------------------------------------------------------

describe('portal:relay_message', () => {
  it('should push valid message to inbox', () => {
    const { node, config, context } = setup();
    const msg: PortalMessage = {
      id: 'pm_in_1',
      from: { sceneId: 'scene-B', agentId: 'b1' },
      to: { sceneId: 'scene-A', agentId: 'agent-1' },
      type: 'hello',
      payload: { greeting: 'world' },
      timestamp: Date.now(),
      ttl: 60000,
      hopCount: 0,
    };
    fire(node, config, context, 'portal:relay_message', msg);
    expect(getState(node).inbox.length).toBe(1);
  });

  it('should NOT push expired message to inbox', () => {
    const { node, config, context } = setup();
    const msg: PortalMessage = {
      id: 'pm_old',
      from: { sceneId: 'scene-B', agentId: 'b1' },
      to: null,
      type: 'stale',
      payload: null,
      timestamp: Date.now() - 120_000,
      ttl: 60000,
      hopCount: 0,
    };
    fire(node, config, context, 'portal:relay_message', msg);
    expect(getState(node).inbox.length).toBe(0);
  });

  it('should NOT push message with hopCount > max_hop_count', () => {
    const { node, config, context } = setup({ max_hop_count: 5 });
    const msg: PortalMessage = {
      id: 'pm_loop',
      from: { sceneId: 'scene-B', agentId: 'b1' },
      to: null,
      type: 'loop',
      payload: null,
      timestamp: Date.now(),
      ttl: 60000,
      hopCount: 6,
    };
    fire(node, config, context, 'portal:relay_message', msg);
    expect(getState(node).inbox.length).toBe(0);
  });

  it('should increment hopCount by 1 when stored', () => {
    const { node, config, context } = setup();
    const msg: PortalMessage = {
      id: 'pm_hop',
      from: { sceneId: 'scene-B', agentId: 'b1' },
      to: null,
      type: 'data',
      payload: null,
      timestamp: Date.now(),
      ttl: 60000,
      hopCount: 2,
    };
    fire(node, config, context, 'portal:relay_message', msg);
    expect(getState(node).inbox[0].hopCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// portal:scene_announce
// ---------------------------------------------------------------------------

describe('portal:scene_announce', () => {
  it('should add scene to scenes map', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal:scene_announce', {
      sceneId: 'scene-B',
      sceneName: 'Scene B',
      agentCount: 3,
      capabilities: ['physics'],
    });
    expect(getState(node).scenes.has('scene-B')).toBe(true);
  });

  it('should emit portal:scene_discovered for new scene', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:scene_announce', {
      sceneId: 'scene-B',
      sceneName: 'Scene B',
      agentCount: 1,
    });
    expect(emitted.some(e => e.type === 'portal:scene_discovered')).toBe(true);
  });

  it('should NOT emit scene_discovered for repeat announce', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:scene_announce', {
      sceneId: 'scene-B',
      sceneName: 'B',
      agentCount: 1,
    });
    emitted.length = 0;
    fire(node, config, context, 'portal:scene_announce', {
      sceneId: 'scene-B',
      sceneName: 'B',
      agentCount: 2,
    });
    expect(emitted.some(e => e.type === 'portal:scene_discovered')).toBe(false);
  });

  it('should update agentCount on re-announce', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal:scene_announce', { sceneId: 'B', agentCount: 1 });
    fire(node, config, context, 'portal:scene_announce', { sceneId: 'B', agentCount: 5 });
    expect(getState(node).scenes.get('B')!.agentCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// portal:query_agents
// ---------------------------------------------------------------------------

describe('portal:query_agents', () => {
  it('should emit portal:federation_query', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:query_agents', { capability: 'nlp' });
    expect(emitted.some(e => e.type === 'portal:federation_query')).toBe(true);
  });

  it('should return agents matching capability', () => {
    const { node, config, context, emitted } = setup();
    const agents: RemoteAgent[] = [
      { sceneId: 'B', agentId: 'b1', name: 'B1', capabilities: ['nlp'], status: 'active' },
      { sceneId: 'B', agentId: 'b2', name: 'B2', capabilities: ['vision'], status: 'idle' },
    ];
    fire(node, config, context, 'portal:remote_agents', { agents });
    emitted.length = 0;
    fire(node, config, context, 'portal:query_agents', { capability: 'nlp' });
    const ev = emitted.find(e => e.type === 'portal:federation_query');
    expect((ev!.payload as any).results.length).toBe(1);
    expect((ev!.payload as any).results[0].agentId).toBe('b1');
  });

  it('should return all agents when no capability filter', () => {
    const { node, config, context, emitted } = setup();
    const agents: RemoteAgent[] = [
      { sceneId: 'B', agentId: 'b1', name: 'B1', capabilities: ['nlp'], status: 'active' },
      { sceneId: 'B', agentId: 'b2', name: 'B2', capabilities: ['vision'], status: 'idle' },
    ];
    fire(node, config, context, 'portal:remote_agents', { agents });
    emitted.length = 0;
    fire(node, config, context, 'portal:query_agents', {});
    const ev = emitted.find(e => e.type === 'portal:federation_query');
    expect((ev!.payload as any).results.length).toBe(2);
  });

  it('should include totalScenes in query result', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:scene_announce', { sceneId: 'B', agentCount: 1 });
    fire(node, config, context, 'portal:query_agents', {});
    const ev = emitted.find(e => e.type === 'portal:federation_query');
    expect((ev!.payload as any).totalScenes).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// portal:remote_agents
// ---------------------------------------------------------------------------

describe('portal:remote_agents', () => {
  it('should add agents to remoteAgents map', () => {
    const { node, config, context } = setup();
    const agents: RemoteAgent[] = [
      { sceneId: 'B', agentId: 'b1', name: 'B1', capabilities: [], status: 'active' },
    ];
    fire(node, config, context, 'portal:remote_agents', { agents });
    expect(getState(node).remoteAgents.size).toBe(1);
  });

  it('should key agents as sceneId:agentId', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal:remote_agents', {
      agents: [{ sceneId: 'X', agentId: 'y', name: 'Y', capabilities: [], status: 'idle' }],
    });
    expect(getState(node).remoteAgents.has('X:y')).toBe(true);
  });

  it('should ignore if agents field missing', () => {
    const { node, config, context } = setup();
    expect(() => fire(node, config, context, 'portal:remote_agents', {})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// portal:migrate_out / portal:migrate_in
// ---------------------------------------------------------------------------

describe('agent migration', () => {
  it('should emit portal:agent_migrated on migrate_out', () => {
    const { node, config, context, emitted } = setup();
    getState(node).connected = true;
    fire(node, config, context, 'portal:migrate_out', {
      agentId: 'a1',
      name: 'Agent One',
      capabilities: ['nlp'],
      memory: {},
      state: {},
      targetScene: 'scene-B',
    });
    expect(emitted.some(e => e.type === 'portal:agent_migrated')).toBe(true);
  });

  it('should send relay message on migrate_out when connected', () => {
    const { node, config, context, emitted } = setup();
    getState(node).connected = true;
    fire(node, config, context, 'portal:migrate_out', {
      agentId: 'a1',
      name: 'A',
      capabilities: [],
      memory: {},
      state: {},
      targetScene: 'scene-B',
    });
    expect(emitted.some(e => e.type === 'portal:relay_send')).toBe(true);
  });

  it('should queue migration to outbox when disconnected', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal:migrate_out', {
      agentId: 'a1',
      name: 'A',
      capabilities: [],
      memory: {},
      state: {},
      targetScene: 'scene-B',
    });
    expect(getState(node).outbox.length).toBe(1);
  });

  it('should increment totalMigrations on migrate_out', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal:migrate_out', {
      agentId: 'a1',
      name: 'A',
      capabilities: [],
      memory: {},
      state: {},
      targetScene: 'scene-B',
    });
    expect(getState(node).totalMigrations).toBe(1);
  });

  it('should queue to pendingMigrations on migrate_in for matching scene', () => {
    const { node, config, context } = setup({ scene_id: 'scene-A' });
    const packet: AgentMigrationPacket = {
      agentId: 'b1',
      name: 'B',
      capabilities: [],
      memory: {},
      state: {},
      sourceScene: 'scene-B',
      targetScene: 'scene-A',
      timestamp: Date.now(),
    };
    fire(node, config, context, 'portal:migrate_in', packet);
    expect(getState(node).pendingMigrations.length).toBe(1);
  });

  it('should ignore migrate_in for different target scene', () => {
    const { node, config, context } = setup({ scene_id: 'scene-A' });
    const packet: AgentMigrationPacket = {
      agentId: 'c1',
      name: 'C',
      capabilities: [],
      memory: {},
      state: {},
      sourceScene: 'scene-B',
      targetScene: 'scene-C',
      timestamp: Date.now(),
    };
    fire(node, config, context, 'portal:migrate_in', packet);
    expect(getState(node).pendingMigrations.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// portal:get_stats
// ---------------------------------------------------------------------------

describe('portal:get_stats', () => {
  it('should emit portal:stats', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:get_stats');
    expect(emitted.some(e => e.type === 'portal:stats')).toBe(true);
  });

  it('stats should include connected field', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:get_stats');
    const ev = emitted.find(e => e.type === 'portal:stats');
    expect((ev!.payload as any)).toHaveProperty('connected');
  });

  it('stats should include totalSent and totalReceived', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:get_stats');
    const ev = emitted.find(e => e.type === 'portal:stats');
    const p = ev!.payload as any;
    expect(p).toHaveProperty('totalSent');
    expect(p).toHaveProperty('totalReceived');
  });

  it('stats should include sceneCount', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal:scene_announce', { sceneId: 'B', agentCount: 1 });
    emitted.length = 0;
    fire(node, config, context, 'portal:get_stats');
    const ev = emitted.find(e => e.type === 'portal:stats');
    expect((ev!.payload as any).sceneCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// onUpdate — heartbeat
// ---------------------------------------------------------------------------

describe('onUpdate — heartbeat', () => {
  it('should emit portal:heartbeat when connected and interval elapsed', () => {
    const { node, config, context, emitted } = setup({ heartbeat_interval: 30000 });
    getState(node).connected = true;
    // Advance by heartbeat_interval / 1000 seconds
    agentPortalHandler.onUpdate(node, config, context, 30); // 30s
    expect(emitted.some(e => e.type === 'portal:heartbeat')).toBe(true);
  });

  it('should NOT emit heartbeat before interval', () => {
    const { node, config, context, emitted } = setup({ heartbeat_interval: 30000 });
    getState(node).connected = true;
    agentPortalHandler.onUpdate(node, config, context, 0.016);
    expect(emitted.some(e => e.type === 'portal:heartbeat')).toBe(false);
  });

  it('should NOT emit heartbeat when disconnected', () => {
    const { node, config, context, emitted } = setup({ heartbeat_interval: 1000 });
    agentPortalHandler.onUpdate(node, config, context, 2);
    expect(emitted.some(e => e.type === 'portal:heartbeat')).toBe(false);
  });

  it('should process inbox messages on update', () => {
    const { node, config, context, emitted } = setup();
    const state = getState(node);
    state.inbox.push({
      id: 'pm_1',
      from: { sceneId: 'B', agentId: 'b1' },
      to: { sceneId: 'scene-A', agentId: 'agent-1' },
      type: 'ping',
      payload: 'hello',
      timestamp: Date.now(),
      ttl: 60000,
      hopCount: 0,
    });
    agentPortalHandler.onUpdate(node, config, context, 0.016);
    expect(state.inbox.length).toBe(0);
    expect(emitted.some(e => e.type === 'portal:message_in')).toBe(true);
  });

  it('should skip expired inbox messages', () => {
    const { node, config, context, emitted } = setup();
    const state = getState(node);
    state.inbox.push({
      id: 'pm_stale',
      from: { sceneId: 'B', agentId: 'b1' },
      to: null,
      type: 'old',
      payload: null,
      timestamp: Date.now() - 120_000,
      ttl: 60000,
      hopCount: 0,
    });
    agentPortalHandler.onUpdate(node, config, context, 0.016);
    expect(emitted.some(e => e.type === 'portal:message_in')).toBe(false);
  });

  it('should deliver pending migrations on update', () => {
    const { node, config, context, emitted } = setup();
    const state = getState(node);
    state.pendingMigrations.push({
      agentId: 'b1',
      name: 'B',
      capabilities: [],
      memory: {},
      state: {},
      sourceScene: 'scene-B',
      targetScene: 'scene-A',
      timestamp: Date.now(),
    });
    agentPortalHandler.onUpdate(node, config, context, 0.016);
    expect(emitted.some(e => e.type === 'portal:agent_arrived')).toBe(true);
    expect(state.pendingMigrations.length).toBe(0);
  });

  it('should prune scenes that exceed heartbeat timeout', () => {
    const { node, config, context, emitted } = setup({
      heartbeat_interval: 10000,
      offline_threshold: 3,
    });
    const state = getState(node);
    state.scenes.set('dead-scene', {
      sceneId: 'dead-scene',
      name: 'Dead',
      agentCount: 1,
      capabilities: [],
      lastHeartbeat: Date.now() - 40_000, // 40s > 3×10s=30s threshold
      latencyMs: 0,
    });
    agentPortalHandler.onUpdate(node, config, context, 0.016);
    expect(state.scenes.has('dead-scene')).toBe(false);
    expect(emitted.some(e => e.type === 'portal:scene_lost')).toBe(true);
  });

  it('should not throw if no state on update', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => agentPortalHandler.onUpdate(node, BASE_CONFIG, context, 0.016)).not.toThrow();
  });
});
