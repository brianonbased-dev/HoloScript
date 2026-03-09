import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockNode,
  createMockContext,
  attachTrait,
  updateTrait,
  sendEvent,
} from './traitTestHelpers';

// Mock AgentRegistry
const mockRegister = vi.fn().mockResolvedValue(undefined);
const mockDeregister = vi.fn().mockResolvedValue(undefined);
const mockHeartbeat = vi.fn().mockResolvedValue(undefined);
const mockDiscoverWithScores = vi.fn().mockResolvedValue([]);

vi.mock('../../agents/AgentRegistry', () => ({
  AgentRegistry: class {},
  getDefaultRegistry: vi.fn(() => ({
    register: mockRegister,
    deregister: mockDeregister,
    heartbeat: mockHeartbeat,
    discoverWithScores: mockDiscoverWithScores,
  })),
}));

import { agentDiscoveryHandler } from '../AgentDiscoveryTrait';

describe('AgentDiscoveryTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    agent_id: 'test-agent-1',
    agent_name: 'TestAgent',
    agent_version: '1.0.0',
    description: 'A test agent',
    capabilities: [],
    endpoints: [{ protocol: 'local', address: 'in-process', primary: true }],
    spatial_scope: null,
    trust_level: 'local' as const,
    discovery_mode: 'active' as const,
    heartbeat_interval: 0, // disable timers for testing
    discovery_interval: 0, // disable timers for testing
    auto_register: true,
    auto_discover: false,
    default_query: null,
    max_discovered_agents: 100,
    event_history_limit: 1000,
    registry_config: null,
    tags: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('agent1');
    (node as any).id = 'agent1';
    ctx = createMockContext();
    attachTrait(agentDiscoveryHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const s = (node as any).__agentDiscoveryState;
    expect(s).toBeDefined();
    expect(s.manifest).toBeDefined();
    expect(s.manifest.id).toBe('test-agent-1');
    expect(s.manifest.name).toBe('TestAgent');
    expect(s.discoveredAgents).toBeInstanceOf(Map);
  });

  it('auto-registers when auto_register is true', () => {
    expect(mockRegister).toHaveBeenCalled();
  });

  it('emits agent_discovery_initialized on attach', () => {
    expect(ctx.emittedEvents.some((e) => e.event === 'agent_discovery_initialized')).toBe(true);
  });

  it('cleans up on detach', () => {
    agentDiscoveryHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__agentDiscoveryState).toBeUndefined();
  });

  it('deregisters on detach when registered', async () => {
    const s = (node as any).__agentDiscoveryState;
    s.registrationStatus = 'registered';
    agentDiscoveryHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(mockDeregister).toHaveBeenCalledWith('test-agent-1');
  });

  it('sends heartbeat on update when registered', () => {
    const s = (node as any).__agentDiscoveryState;
    s.registrationStatus = 'registered';
    updateTrait(agentDiscoveryHandler, node, cfg, ctx, 0.016);
    expect(mockHeartbeat).toHaveBeenCalledWith('test-agent-1');
  });

  it('does not send heartbeat when not registered', () => {
    // Create a separate node that does NOT auto-register
    const noRegNode = createMockNode('noReg');
    (noRegNode as any).id = 'noReg';
    const noRegCfg = { ...cfg, auto_register: false };
    attachTrait(agentDiscoveryHandler, noRegNode, noRegCfg, ctx);
    updateTrait(agentDiscoveryHandler, noRegNode, noRegCfg, ctx, 0.016);
    expect(mockHeartbeat).not.toHaveBeenCalled();
  });

  it('handles agent_deregister event', () => {
    const s = (node as any).__agentDiscoveryState;
    s.registrationStatus = 'registered';
    sendEvent(agentDiscoveryHandler, node, cfg, ctx, { type: 'agent_deregister' });
    expect(mockDeregister).toHaveBeenCalled();
  });

  it('handles agent_get_status event', () => {
    sendEvent(agentDiscoveryHandler, node, cfg, ctx, { type: 'agent_get_status' });
    expect(ctx.emittedEvents.some((e) => e.event === 'discovery_status')).toBe(true);
  });

  it('handles agent_get_discovered event', () => {
    sendEvent(agentDiscoveryHandler, node, cfg, ctx, { type: 'agent_get_discovered' });
    expect(ctx.emittedEvents.some((e) => e.event === 'discovered_agents')).toBe(true);
  });

  it('has correct handler name', () => {
    expect(agentDiscoveryHandler.name).toBe('agent_discovery');
  });
});
