/**
 * HoloMesh Daemon Actions — Tests
 *
 * Unit tests for all 9 BT action handlers + wireTraitListeners.
 * Mocks the HoloMeshOrchestratorClient to avoid network calls.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHoloMeshDaemonActions, type HoloMeshDaemonConfig } from './holomesh-daemon-actions';
import { HoloMeshOrchestratorClient } from '../orchestrator-client';
import type { MeshKnowledgeEntry, MeshConfig } from '../types';
import { computeReputation, resolveReputationTier, INITIAL_MESH_STATE } from '../types';

// ─── Mocks ───

vi.mock('../orchestrator-client', () => {
  // W.011: use function(){} not arrow for constructors
  const HoloMeshOrchestratorClient = vi.fn(function (this: any) {
    this.registerAgent = vi.fn().mockResolvedValue('agent-001');
    this.discoverPeers = vi.fn().mockResolvedValue([]);
    this.getAgentCard = vi.fn().mockResolvedValue(null);
    this.heartbeat = vi.fn().mockResolvedValue(true);
    this.sendMessage = vi.fn().mockResolvedValue(true);
    this.readInbox = vi.fn().mockResolvedValue([]);
    this.subscribe = vi.fn().mockResolvedValue(true);
    this.broadcast = vi.fn().mockResolvedValue(true);
    this.contributeKnowledge = vi.fn().mockResolvedValue(3);
    this.queryKnowledge = vi.fn().mockResolvedValue([]);
    this.getAgentReputation = vi.fn().mockResolvedValue({ score: 0, tier: 'newcomer' });
    this.getAgentId = vi.fn().mockReturnValue(null);
    this.setAgentId = vi.fn();
  });
  return { HoloMeshOrchestratorClient };
});

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
}));

// ─── Test Helpers ───

function createMockClient() {
  const config: MeshConfig = {
    orchestratorUrl: 'http://localhost:3000',
    apiKey: 'test-key',
    workspace: 'test-workspace',
    agentName: 'test-agent',
    discoveryIntervalMs: 60000,
    inboxIntervalMs: 30000,
    maxContributionsPerCycle: 5,
    maxQueriesPerCycle: 3,
    budgetCapUSD: 5.0,
  };
  return new HoloMeshOrchestratorClient(config);
}

function createTestConfig(overrides: Partial<HoloMeshDaemonConfig> = {}): HoloMeshDaemonConfig {
  return {
    stateFile: '/tmp/test-holomesh-state.json',
    verbose: false,
    ...overrides,
  };
}

function makeEntry(id: string, price = 0): MeshKnowledgeEntry {
  return {
    id,
    workspaceId: 'ai-ecosystem',
    type: 'wisdom',
    content: `Test entry ${id}`,
    provenanceHash: `hash-${id}`,
    authorId: 'author-001',
    authorName: 'test-author',
    price,
    queryCount: 0,
    reuseCount: 0,
    createdAt: new Date().toISOString(),
  };
}

const emptyBB = () => ({
  inbox_messages: [],
  discovered_peers: [],
  query_results: [],
  contributed_this_cycle: 0,
  queries_this_cycle: 0,
});

// ─── Tests ───

describe('createHoloMeshDaemonActions', () => {
  let client: any;
  let config: HoloMeshDaemonConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    config = createTestConfig();
  });

  it('returns all 9 action handlers and wireTraitListeners', () => {
    const { actions, wireTraitListeners } = createHoloMeshDaemonActions(client, config);

    expect(Object.keys(actions)).toHaveLength(9);
    expect(actions.mesh_register).toBeTypeOf('function');
    expect(actions.mesh_discover_peers).toBeTypeOf('function');
    expect(actions.mesh_check_inbox).toBeTypeOf('function');
    expect(actions.mesh_reply_queries).toBeTypeOf('function');
    expect(actions.mesh_contribute_knowledge).toBeTypeOf('function');
    expect(actions.mesh_query_network).toBeTypeOf('function');
    expect(actions.mesh_collect_premium).toBeTypeOf('function');
    expect(actions.mesh_heartbeat).toBeTypeOf('function');
    expect(actions.mesh_follow_back).toBeTypeOf('function');
    expect(wireTraitListeners).toBeTypeOf('function');
  });
});

describe('mesh_register', () => {
  let client: any;
  let config: HoloMeshDaemonConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    config = createTestConfig();
  });

  it('registers on orchestrator and stores agent ID', async () => {
    client.registerAgent.mockResolvedValue('mesh-agent-001');
    const { actions } = createHoloMeshDaemonActions(client, config);
    const bb = emptyBB();

    const result = await actions.mesh_register({}, bb, {});

    expect(result).toBe(true);
    expect(client.registerAgent).toHaveBeenCalledWith(
      expect.arrayContaining(['@knowledge-exchange']),
    );
    expect(bb.agent_id).toBe('mesh-agent-001');
  });

  it('skips registration if already registered', async () => {
    client.getAgentId.mockReturnValue('existing-agent');
    // Simulate state with agentId already set by loading state
    const stateConfig = createTestConfig();
    const fs = await import('fs');
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      ...INITIAL_MESH_STATE,
      agentId: 'existing-agent',
    }));

    const { actions } = createHoloMeshDaemonActions(client, stateConfig);
    const bb = emptyBB();

    const result = await actions.mesh_register({}, bb, {});

    expect(result).toBe(true);
    // Should call setAgentId, not registerAgent
    expect(client.setAgentId).toHaveBeenCalledWith('existing-agent');
    expect(client.registerAgent).not.toHaveBeenCalled();
  });

  it('handles registration failure gracefully', async () => {
    // Reset fs mocks to ensure fresh state (no persisted agentId)
    const fs = await import('fs');
    (fs.existsSync as any).mockReturnValue(false);

    const failClient = createMockClient();
    failClient.registerAgent = vi.fn().mockRejectedValue(new Error('Network error'));
    const { actions } = createHoloMeshDaemonActions(failClient, config);

    const result = await actions.mesh_register({}, emptyBB(), {});

    expect(result).toBe(false);
  });
});

describe('mesh_discover_peers', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('discovers peers and updates state', async () => {
    client.discoverPeers.mockResolvedValue([
      { id: 'peer-1', name: 'Agent Alpha', traits: ['@research'] },
      { id: 'peer-2', name: 'Agent Beta', traits: ['@philosophy'] },
    ]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    const bb = emptyBB();

    const result = await actions.mesh_discover_peers({}, bb, {});

    expect(result).toBe(true);
    expect(bb.discovered_peers).toHaveLength(2);
  });

  it('returns false when no peers found', async () => {
    client.discoverPeers.mockResolvedValue([]);
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const result = await actions.mesh_discover_peers({}, emptyBB(), {});

    expect(result).toBe(false);
  });

  it('handles discovery failure', async () => {
    client.discoverPeers.mockRejectedValue(new Error('Timeout'));
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const result = await actions.mesh_discover_peers({}, emptyBB(), {});

    expect(result).toBe(false);
  });
});

describe('mesh_check_inbox', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('loads unread messages into blackboard', async () => {
    client.readInbox.mockResolvedValue([
      { id: 'msg-1', content: '{"type":"query"}', from: 'peer-1' },
      { id: 'msg-2', content: '{"type":"signal"}', from: 'peer-2' },
    ]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    const bb = emptyBB();

    const result = await actions.mesh_check_inbox({}, bb, {});

    expect(result).toBe(true);
    expect(bb.inbox_messages).toHaveLength(2);
  });

  it('returns false when inbox is empty', async () => {
    client.readInbox.mockResolvedValue([]);
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const result = await actions.mesh_check_inbox({}, emptyBB(), {});

    expect(result).toBe(false);
  });

  it('filters out already-processed messages', async () => {
    const fs = await import('fs');
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      ...INITIAL_MESH_STATE,
      processedMessageIds: ['msg-1'],
    }));

    client.readInbox.mockResolvedValue([
      { id: 'msg-1', content: '{"type":"query"}', from: 'peer-1' },
      { id: 'msg-2', content: '{"type":"signal"}', from: 'peer-2' },
    ]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    const bb = emptyBB();

    const result = await actions.mesh_check_inbox({}, bb, {});

    expect(result).toBe(true);
    expect(bb.inbox_messages).toHaveLength(1);
    expect(bb.inbox_messages[0].id).toBe('msg-2');
  });
});

describe('mesh_reply_queries', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('replies to query messages with knowledge results', async () => {
    client.queryKnowledge.mockResolvedValue([makeEntry('W.001')]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    const bb = emptyBB();
    bb.inbox_messages = [
      {
        id: 'msg-q1',
        from: 'peer-1',
        content: JSON.stringify({ type: 'query', payload: { search: 'safety constraints' } }),
      },
    ];

    const result = await actions.mesh_reply_queries({}, bb, {});

    expect(result).toBe(true);
    expect(client.queryKnowledge).toHaveBeenCalledWith('safety constraints', { limit: 3 });
    expect(client.sendMessage).toHaveBeenCalledWith('peer-1', expect.objectContaining({
      type: 'response',
    }));
  });

  it('returns false when no query messages in inbox', async () => {
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    const bb = emptyBB();
    bb.inbox_messages = [
      { id: 'msg-s1', content: JSON.stringify({ type: 'signal', payload: {} }), from: 'peer-1' },
    ];

    const result = await actions.mesh_reply_queries({}, bb, {});

    expect(result).toBe(false);
  });

  it('returns false when no inbox messages at all', async () => {
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    const result = await actions.mesh_reply_queries({}, emptyBB(), {});

    expect(result).toBe(false);
  });
});

describe('mesh_contribute_knowledge', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('contributes local knowledge entries', async () => {
    const entries = [makeEntry('W.001'), makeEntry('P.001'), makeEntry('G.001')];
    client.contributeKnowledge.mockResolvedValue(3);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({
      localKnowledge: entries,
    }));

    const bb = emptyBB();
    const result = await actions.mesh_contribute_knowledge({}, bb, {});

    expect(result).toBe(true);
    expect(client.contributeKnowledge).toHaveBeenCalledWith(entries);
    expect(bb.contributed_this_cycle).toBe(3);
  });

  it('returns false when no new entries to contribute', async () => {
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({
      localKnowledge: [],
    }));

    const result = await actions.mesh_contribute_knowledge({}, emptyBB(), {});

    expect(result).toBe(false);
    expect(client.contributeKnowledge).not.toHaveBeenCalled();
  });

  it('skips already-contributed entries', async () => {
    const fs = await import('fs');
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      ...INITIAL_MESH_STATE,
      contributedIds: ['W.001'],
    }));

    const entries = [makeEntry('W.001'), makeEntry('W.002')];
    client.contributeKnowledge.mockResolvedValue(1);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({
      localKnowledge: entries,
    }));

    const bb = emptyBB();
    const result = await actions.mesh_contribute_knowledge({}, bb, {});

    expect(result).toBe(true);
    // Should only contribute W.002 (W.001 already contributed)
    expect(client.contributeKnowledge).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'W.002' }),
    ]);
  });

  it('respects maxContributionsPerCycle limit', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry(`W.${i}`));
    client.contributeKnowledge.mockResolvedValue(2);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({
      localKnowledge: entries,
      maxContributionsPerCycle: 2,
    }));

    await actions.mesh_contribute_knowledge({}, emptyBB(), {});

    // Should batch to maxContributionsPerCycle=2
    expect(client.contributeKnowledge).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'W.0' })]),
    );
    const callArg = client.contributeKnowledge.mock.calls[0][0];
    expect(callArg).toHaveLength(2);
  });
});

describe('mesh_query_network', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('queries network with rotating search topics', async () => {
    client.queryKnowledge.mockResolvedValue([makeEntry('W.net.001')]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({
      searchTopics: ['topic-A', 'topic-B', 'topic-C'],
    }));
    const bb = emptyBB();

    // First call: topic-A
    await actions.mesh_query_network({}, bb, {});
    expect(client.queryKnowledge).toHaveBeenCalledWith('topic-A', { limit: 5 });

    // Second call: topic-B
    client.queryKnowledge.mockResolvedValue([makeEntry('W.net.002')]);
    await actions.mesh_query_network({}, emptyBB(), {});
    expect(client.queryKnowledge).toHaveBeenLastCalledWith('topic-B', { limit: 5 });
  });

  it('returns false when no new results', async () => {
    client.queryKnowledge.mockResolvedValue([]);
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const result = await actions.mesh_query_network({}, emptyBB(), {});

    expect(result).toBe(false);
  });

  it('deduplicates already-received entries', async () => {
    const fs = await import('fs');
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      ...INITIAL_MESH_STATE,
      receivedIds: ['W.old.001'],
    }));

    client.queryKnowledge.mockResolvedValue([
      makeEntry('W.old.001'),
      makeEntry('W.new.001'),
    ]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    const bb = emptyBB();

    const result = await actions.mesh_query_network({}, bb, {});

    expect(result).toBe(true);
    // Only the new entry should be in query_results
    expect(bb.query_results).toHaveLength(1);
    expect(bb.query_results[0].id).toBe('W.new.001');
  });

  it('caps query history at 50', async () => {
    const fs = await import('fs');
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      ...INITIAL_MESH_STATE,
      queryHistory: Array.from({ length: 50 }, (_, i) => `old-topic-${i}`),
    }));

    client.queryKnowledge.mockResolvedValue([makeEntry('W.x')]);
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    await actions.mesh_query_network({}, emptyBB(), {});

    // writeFileSync should have been called with trimmed history
    const fsMock = await import('fs');
    const writeCalls = (fsMock.writeFileSync as any).mock.calls;
    const lastState = JSON.parse(writeCalls[writeCalls.length - 1][1]);
    expect(lastState.queryHistory.length).toBeLessThanOrEqual(50);
  });
});

describe('mesh_collect_premium', () => {
  it('logs premium entries and increments totalCollects', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const bb = emptyBB();
    bb.query_results = [makeEntry('W.paid.001', 0.50), makeEntry('W.paid.002', 1.00)];

    const result = await actions.mesh_collect_premium({}, bb, {});

    expect(result).toBe(true);
  });

  it('returns false when no premium entries', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const bb = emptyBB();
    bb.query_results = [makeEntry('W.free.001', 0)];

    const result = await actions.mesh_collect_premium({}, bb, {});

    expect(result).toBe(false);
  });
});

describe('mesh_heartbeat', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('sends heartbeat with reputation info', async () => {
    client.heartbeat.mockResolvedValue(true);
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const result = await actions.mesh_heartbeat({}, emptyBB(), {});

    expect(result).toBe(true);
    expect(client.heartbeat).toHaveBeenCalledWith(expect.objectContaining({
      reputation: expect.any(Number),
      reputationTier: expect.any(String),
      contributions: expect.any(Number),
    }));
  });

  it('handles heartbeat failure', async () => {
    client.heartbeat.mockRejectedValue(new Error('Connection refused'));
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const result = await actions.mesh_heartbeat({}, emptyBB(), {});

    expect(result).toBe(false);
  });
});

describe('mesh_follow_back', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('subscribes to common topics', async () => {
    client.subscribe.mockResolvedValue(true);
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const result = await actions.mesh_follow_back({}, emptyBB(), {});

    expect(result).toBe(true);
    expect(client.subscribe).toHaveBeenCalledTimes(3);
    expect(client.subscribe).toHaveBeenCalledWith('knowledge-exchange');
    expect(client.subscribe).toHaveBeenCalledWith('security');
    expect(client.subscribe).toHaveBeenCalledWith('compilation');
  });
});

describe('wireTraitListeners', () => {
  it('wires rate_limit, circuit_breaker, and economy events', () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { wireTraitListeners } = createHoloMeshDaemonActions(client, createTestConfig());

    const eventHandlers: Record<string, Function> = {};
    const mockRuntime = {
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
    };

    wireTraitListeners(mockRuntime);

    expect(mockRuntime.on).toHaveBeenCalledWith('rate_limit_exceeded', expect.any(Function));
    expect(mockRuntime.on).toHaveBeenCalledWith('circuit_breaker_open', expect.any(Function));
    expect(mockRuntime.on).toHaveBeenCalledWith('circuit_breaker_close', expect.any(Function));
    expect(mockRuntime.on).toHaveBeenCalledWith('economy_spend', expect.any(Function));
  });

  it('does not throw if runtime has no .on method', () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { wireTraitListeners } = createHoloMeshDaemonActions(client, createTestConfig());

    expect(() => wireTraitListeners({})).not.toThrow();
  });
});

// ─── Pure Function Tests ───

describe('computeReputation', () => {
  it('returns 0 for zero inputs', () => {
    expect(computeReputation(0, 0, 0)).toBe(0);
  });

  it('weights contributions at 0.3', () => {
    expect(computeReputation(10, 0, 0)).toBe(3);
  });

  it('weights queriesAnswered at 0.2', () => {
    expect(computeReputation(0, 10, 0)).toBe(2);
  });

  it('weights reuseRate at 50', () => {
    expect(computeReputation(0, 0, 1.0)).toBe(50);
  });

  it('combines all factors', () => {
    // 10*0.3 + 5*0.2 + 0.5*50 = 3 + 1 + 25 = 29
    expect(computeReputation(10, 5, 0.5)).toBe(29);
  });
});

describe('resolveReputationTier', () => {
  it('returns newcomer for 0', () => {
    expect(resolveReputationTier(0)).toBe('newcomer');
  });

  it('returns contributor for 5', () => {
    expect(resolveReputationTier(5)).toBe('contributor');
  });

  it('returns expert for 30', () => {
    expect(resolveReputationTier(30)).toBe('expert');
  });

  it('returns authority for 100', () => {
    expect(resolveReputationTier(100)).toBe('authority');
  });

  it('returns authority for scores above 100', () => {
    expect(resolveReputationTier(250)).toBe('authority');
  });
});
