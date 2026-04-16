/**
 * AgentDiscoveryTrait — Production Test Suite
 *
 * agentDiscoveryHandler stores state on node.__agentDiscoveryState.
 * It uses getDefaultRegistry() (singleton). We mock the entire
 * '../agents/AgentRegistry' module to inject a controllable mock.
 *
 * Key behaviours tested:
 * 1. defaultConfig — 17 fields
 * 2. onAttach — state init; creates manifest from config fields;
 *              emits agent_discovery_initialized;
 *              auto_register=false avoids registry call;
 *              heartbeat_interval=0 skips timer;
 *              auto_discover=false skips discovery timer
 * 3. onDetach — clears timers, removes state, emits agent_discovery_detached;
 *              calls registry.deregister when status=registered
 * 4. onUpdate — calls sendHeartbeat only when registrationStatus='registered'
 * 5. onEvent:
 *    - agent_get_discovered → emits discovered_agents (count, agents array)
 *    - agent_get_status     → emits discovery_status with registrationStatus
 *    - agent_register       → calls registerAgent path
 *    - agent_deregister     → calls deregisterAgent path
 *
 * Note: async operations are tested only for sync effects. For pure async paths
 * (registerAgent, discoverPeers, runQuery) we test state changes that happen
 * synchronously or via awaiting vitest's fake timers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock AgentRegistry module ────────────────────────────────────────────────
// Must use require() inside factory to avoid TDZ error (vi.mock is hoisted)

vi.mock('@holoscript/framework/agents', () => {
  const mockRegistry = {
    register: vi.fn().mockResolvedValue(undefined),
    deregister: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    discoverWithScores: vi.fn().mockResolvedValue([]),
  };
  return {
    getDefaultRegistry: vi.fn(() => mockRegistry),
    AgentRegistry: vi.fn(() => mockRegistry),
    resetDefaultRegistry: vi.fn(),
    _mockRegistry: mockRegistry,
  };
});

import { agentDiscoveryHandler } from '../AgentDiscoveryTrait';
import * as AgentRegistryModule from '@holoscript/framework/agents';

// ─── helpers ─────────────────────────────────────────────────────────────────

function getRegistry() {
  return (AgentRegistryModule as any)._mockRegistry;
}

function makeNode(id = 'node_1') {
  return { id, properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof agentDiscoveryHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = {
    ...agentDiscoveryHandler.defaultConfig!,
    heartbeat_interval: 0, // avoid setInterval in tests
    discovery_interval: 0, // avoid setInterval in tests
    auto_register: false, // avoid async register in tests
    auto_discover: false, // avoid async discover in tests
    ...cfg,
  };
  agentDiscoveryHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('agentDiscoveryHandler.defaultConfig', () => {
  const d = agentDiscoveryHandler.defaultConfig!;
  it('agent_id=""', () => expect(d.agent_id).toBe(''));
  it('agent_name=""', () => expect(d.agent_name).toBe(''));
  it('agent_version="1.0.0"', () => expect(d.agent_version).toBe('1.0.0'));
  it('capabilities=[]', () => expect(d.capabilities).toEqual([]));
  it('endpoints has one local entry', () => expect(d.endpoints[0].protocol).toBe('local'));
  it('spatial_scope=null', () => expect(d.spatial_scope).toBeNull());
  it('trust_level=local', () => expect(d.trust_level).toBe('local'));
  it('discovery_mode=active', () => expect(d.discovery_mode).toBe('active'));
  it('heartbeat_interval=10000', () => expect(d.heartbeat_interval).toBe(10000));
  it('discovery_interval=30000', () => expect(d.discovery_interval).toBe(30000));
  it('auto_register=true', () => expect(d.auto_register).toBe(true));
  it('auto_discover=true', () => expect(d.auto_discover).toBe(true));
  it('max_discovered_agents=100', () => expect(d.max_discovered_agents).toBe(100));
  it('event_history_limit=1000', () => expect(d.event_history_limit).toBe(1000));
  it('registry_config=null', () => expect(d.registry_config).toBeNull());
  it('tags=[]', () => expect(d.tags).toEqual([]));
  it('default_query=null', () => expect(d.default_query).toBeNull());
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('agentDiscoveryHandler.onAttach', () => {
  it('creates __agentDiscoveryState on node', () => {
    const { node } = attach();
    expect((node as any).__agentDiscoveryState).toBeDefined();
  });

  it('registrationStatus starts unregistered', () => {
    const { node } = attach();
    expect((node as any).__agentDiscoveryState.registrationStatus).toBe('unregistered');
  });

  it('creates manifest from config agent_name + node id', () => {
    const { node } = attach({ agent_name: 'MyAgent', agent_id: 'fixed_id' });
    const manifest = (node as any).__agentDiscoveryState.manifest;
    expect(manifest.name).toBe('MyAgent');
    expect(manifest.id).toBe('fixed_id');
  });

  it('manifest uses node id as fallback name when agent_name empty', () => {
    const node = makeNode('node_xyz');
    const ctx = makeCtx();
    const config = {
      ...agentDiscoveryHandler.defaultConfig!,
      heartbeat_interval: 0,
      discovery_interval: 0,
      auto_register: false,
      auto_discover: false,
      agent_name: '',
      agent_id: '',
    };
    agentDiscoveryHandler.onAttach!(node as any, config, ctx as any);
    const manifest = (node as any).__agentDiscoveryState.manifest;
    expect(manifest.name).toContain('node_xyz');
    expect(manifest.id).toMatch(/agent_\d+_/);
  });

  it('emits agent_discovery_initialized', () => {
    const { ctx } = attach({ agent_name: 'TestAgent' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'agent_discovery_initialized',
      expect.objectContaining({ mode: 'active' })
    );
  });

  it('discoveredAgents starts empty', () => {
    const { node } = attach();
    expect((node as any).__agentDiscoveryState.discoveredAgents.size).toBe(0);
  });

  it('heartbeatTimer=null when heartbeat_interval=0', () => {
    const { node } = attach({ heartbeat_interval: 0 });
    expect((node as any).__agentDiscoveryState.heartbeatTimer).toBeNull();
  });

  it('discoveryTimer=null when auto_discover=false', () => {
    const { node } = attach({ auto_discover: false });
    expect((node as any).__agentDiscoveryState.discoveryTimer).toBeNull();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('agentDiscoveryHandler.onDetach', () => {
  it('removes __agentDiscoveryState from node', () => {
    const { node, ctx, config } = attach();
    agentDiscoveryHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__agentDiscoveryState).toBeUndefined();
  });

  it('emits agent_discovery_detached', () => {
    const { node, ctx, config } = attach({ agent_id: 'test_agent' });
    ctx.emit.mockClear();
    agentDiscoveryHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('agent_discovery_detached', expect.any(Object));
  });

  it('calls registry.deregister when status=registered', async () => {
    const { node, ctx, config } = attach({ agent_id: 'agent_reg' });
    const state = (node as any).__agentDiscoveryState;
    state.registrationStatus = 'registered';
    state.registry = getRegistry();
    agentDiscoveryHandler.onDetach!(node as any, config, ctx as any);
    // deregister is called async — give micro-tick time
    await Promise.resolve();
    expect(getRegistry().deregister).toHaveBeenCalled();
  });

  it('does NOT call registry.deregister when status=unregistered', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__agentDiscoveryState;
    expect(state.registrationStatus).toBe('unregistered');
    agentDiscoveryHandler.onDetach!(node as any, config, ctx as any);
    expect(getRegistry().deregister).not.toHaveBeenCalled();
  });

  it('clears heartbeatTimer if set', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__agentDiscoveryState;
    const timerId = setInterval(() => {}, 99999);
    state.heartbeatTimer = timerId;
    expect(() => agentDiscoveryHandler.onDetach!(node as any, config, ctx as any)).not.toThrow();
    expect(state.heartbeatTimer).toBeNull();
    clearInterval(timerId); // safety
  });
});

// ─── onEvent: agent_get_discovered ───────────────────────────────────────────

describe('agentDiscoveryHandler.onEvent — agent_get_discovered', () => {
  it('emits discovered_agents with count=0 initially', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    agentDiscoveryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'agent_get_discovered',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'discovered_agents',
      expect.objectContaining({ count: 0, agents: [] })
    );
  });

  it('emits discovered_agents with correct agents list', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__agentDiscoveryState;
    const fakeManifest = {
      id: 'peer_1',
      name: 'PeerAgent',
      capabilities: [],
      endpoints: [],
      trustLevel: 'local',
      tags: [],
      status: 'online',
    };
    state.discoveredAgents.set('peer_1', {
      manifest: fakeManifest,
      discoveredAt: Date.now(),
      matchScore: 0.9,
      lastSeen: Date.now(),
      connectionStatus: 'connected',
    });
    ctx.emit.mockClear();
    agentDiscoveryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'agent_get_discovered',
    });
    const [, payload] = ctx.emit.mock.calls[0];
    expect(payload.count).toBe(1);
    expect(payload.agents[0].id).toBe('peer_1');
    expect(payload.agents[0].name).toBe('PeerAgent');
  });
});

// ─── onEvent: agent_get_status ────────────────────────────────────────────────

describe('agentDiscoveryHandler.onEvent — agent_get_status', () => {
  it('emits discovery_status with registrationStatus', () => {
    const { node, ctx, config } = attach({ agent_id: 'a1', agent_name: 'Agent1' });
    ctx.emit.mockClear();
    agentDiscoveryHandler.onEvent!(node as any, config, ctx as any, { type: 'agent_get_status' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'discovery_status',
      expect.objectContaining({
        registrationStatus: 'unregistered',
        agentName: 'Agent1',
        discoveredCount: 0,
      })
    );
  });

  it('includes eventCount in status', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__agentDiscoveryState;
    state.eventHistory = [{ type: 'discovered', agent: {}, timestamp: 0 }];
    ctx.emit.mockClear();
    agentDiscoveryHandler.onEvent!(node as any, config, ctx as any, { type: 'agent_get_status' });
    const [, payload] = ctx.emit.mock.calls[0];
    expect(payload.eventCount).toBe(1);
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('agentDiscoveryHandler.onUpdate', () => {
  it('calls heartbeat when registrationStatus=registered', async () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__agentDiscoveryState;
    state.registrationStatus = 'registered';
    state.manifest = {
      id: 'a1',
      name: 'A',
      capabilities: [],
      endpoints: [],
      trustLevel: 'local',
      tags: [],
      status: 'online',
    };
    state.registry = getRegistry();
    agentDiscoveryHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    await Promise.resolve();
    expect(getRegistry().heartbeat).toHaveBeenCalledWith('a1');
  });

  it('does NOT call heartbeat when unregistered', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__agentDiscoveryState;
    expect(state.registrationStatus).toBe('unregistered');
    agentDiscoveryHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getRegistry().heartbeat).not.toHaveBeenCalled();
  });
});
