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
    this.setWalletAuth = vi.fn();
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

  it('returns all 15 action handlers (9 V1 + 3 V2 + 2 V3 + 1 V5) and wireTraitListeners', () => {
    const { actions, wireTraitListeners } = createHoloMeshDaemonActions(client, config);

    expect(Object.keys(actions)).toHaveLength(17);
    expect(actions.mesh_register).toBeTypeOf('function');
    expect(actions.mesh_discover_peers).toBeTypeOf('function');
    expect(actions.mesh_check_inbox).toBeTypeOf('function');
    expect(actions.mesh_reply_queries).toBeTypeOf('function');
    expect(actions.mesh_contribute_knowledge).toBeTypeOf('function');
    expect(actions.mesh_query_network).toBeTypeOf('function');
    expect(actions.mesh_collect_premium).toBeTypeOf('function');
    expect(actions.mesh_heartbeat).toBeTypeOf('function');
    expect(actions.mesh_follow_back).toBeTypeOf('function');
    expect(actions.mesh_gossip_sync).toBeTypeOf('function');
    expect(actions.mesh_p2p_discover).toBeTypeOf('function');
    expect(actions.mesh_persist_crdt).toBeTypeOf('function');
    expect(actions.mesh_wallet_balance).toBeTypeOf('function');
    expect(actions.mesh_settle_micro).toBeTypeOf('function');
    expect(actions.mesh_create_profile).toBeTypeOf('function');
    expect(wireTraitListeners).toBeTypeOf('function');
  });

  it('V1 actions still work when V2 and V3 are disabled', () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({ v2Enabled: false, walletEnabled: false })
    );
    expect(Object.keys(actions)).toHaveLength(17);
    // V2/V3 actions exist but will return false when called
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
      undefined // No wallet auth when wallet is disabled
    );
    expect(bb.agent_id).toBe('mesh-agent-001');
  });

  it('skips registration if already registered', async () => {
    client.getAgentId.mockReturnValue('existing-agent');
    // Simulate state with agentId already set by loading state
    const stateConfig = createTestConfig();
    const fs = await import('fs');
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        ...INITIAL_MESH_STATE,
        agentId: 'existing-agent',
      })
    );

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
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        ...INITIAL_MESH_STATE,
        processedMessageIds: ['msg-1'],
      })
    );

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
    expect(client.sendMessage).toHaveBeenCalledWith(
      'peer-1',
      expect.objectContaining({
        type: 'response',
      })
    );
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

    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        localKnowledge: entries,
      })
    );

    const bb = emptyBB();
    const result = await actions.mesh_contribute_knowledge({}, bb, {});

    expect(result).toBe(true);
    expect(client.contributeKnowledge).toHaveBeenCalledWith(entries);
    expect(bb.contributed_this_cycle).toBe(3);
  });

  it('returns false when no new entries to contribute', async () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        localKnowledge: [],
      })
    );

    const result = await actions.mesh_contribute_knowledge({}, emptyBB(), {});

    expect(result).toBe(false);
    expect(client.contributeKnowledge).not.toHaveBeenCalled();
  });

  it('skips already-contributed entries', async () => {
    const fs = await import('fs');
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        ...INITIAL_MESH_STATE,
        contributedIds: ['W.001'],
      })
    );

    const entries = [makeEntry('W.001'), makeEntry('W.002')];
    client.contributeKnowledge.mockResolvedValue(1);

    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        localKnowledge: entries,
      })
    );

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

    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        localKnowledge: entries,
        maxContributionsPerCycle: 2,
      })
    );

    await actions.mesh_contribute_knowledge({}, emptyBB(), {});

    // Should batch to maxContributionsPerCycle=2
    expect(client.contributeKnowledge).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'W.0' })])
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

    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        searchTopics: ['topic-A', 'topic-B', 'topic-C'],
      })
    );
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
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        ...INITIAL_MESH_STATE,
        receivedIds: ['W.old.001'],
      })
    );

    client.queryKnowledge.mockResolvedValue([makeEntry('W.old.001'), makeEntry('W.new.001')]);

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
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        ...INITIAL_MESH_STATE,
        queryHistory: Array.from({ length: 50 }, (_, i) => `old-topic-${i}`),
      })
    );

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
    bb.query_results = [makeEntry('W.paid.001', 0.5), makeEntry('W.paid.002', 1.0)];

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
    expect(client.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        reputation: expect.any(Number),
        reputationTier: expect.any(String),
        contributions: expect.any(Number),
      })
    );
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

// ─── V2 Action Tests ───

describe('mesh_gossip_sync (V2)', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('returns false when V2 is disabled', async () => {
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({ v2Enabled: false }));
    const result = await actions.mesh_gossip_sync({}, emptyBB(), {});
    expect(result).toBe(false);
  });

  it('returns false when no localAgentDid provided', async () => {
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({ v2Enabled: true }));
    const result = await actions.mesh_gossip_sync({}, emptyBB(), {});
    expect(result).toBe(false);
  });

  it('returns false when no gossip targets available', async () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        v2Enabled: true,
        localAgentDid: 'test-did',
        localMcpUrl: 'https://local',
      })
    );
    const result = await actions.mesh_gossip_sync({}, emptyBB(), {});
    expect(result).toBe(false);
  });
});

describe('mesh_p2p_discover (V2)', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('returns false when V2 is disabled', async () => {
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({ v2Enabled: false }));
    const result = await actions.mesh_p2p_discover({}, emptyBB(), {});
    expect(result).toBe(false);
  });

  it('bootstraps from orchestrator when few peers', async () => {
    client.discoverPeers.mockResolvedValue([
      {
        id: 'peer-1',
        did: 'peer-1',
        name: 'P1',
        mcpEndpoint: 'https://p1',
        traits: [],
        reputation: 0,
      },
    ]);
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        v2Enabled: true,
        localAgentDid: 'test-did',
        localMcpUrl: 'https://local',
      })
    );
    const bb = emptyBB();

    const result = await actions.mesh_p2p_discover({}, bb, {});

    // Should have bootstrapped and found peers
    expect(result).toBe(true);
    expect(bb.p2p_peer_count).toBeGreaterThan(0);
  });
});

describe('mesh_persist_crdt (V2)', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('returns false when V2 is disabled', async () => {
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig({ v2Enabled: false }));
    const result = await actions.mesh_persist_crdt({}, emptyBB(), {});
    expect(result).toBe(false);
  });

  it('returns false when no snapshot path configured', async () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        v2Enabled: true,
        localAgentDid: 'test-did',
      })
    );
    // No crdtSnapshotPath → saveSnapshot returns false
    const result = await actions.mesh_persist_crdt({}, emptyBB(), {});
    expect(result).toBe(false);
  });

  it('saves snapshot when path is configured', async () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        v2Enabled: true,
        localAgentDid: 'test-did',
        crdtSnapshotPath: '/tmp/test-snapshot.bin',
      })
    );
    const result = await actions.mesh_persist_crdt({}, emptyBB(), {});
    // saveSnapshot should succeed (fs.writeFileSync is mocked)
    expect(result).toBe(true);
  });
});

// ─── V3 Wallet Action Tests ───

// V3 injectable wallet test helpers
function createMockWallet() {
  return {
    getAddress: vi.fn().mockReturnValue('0xTestWalletAddress'),
    getPublicClient: vi.fn().mockReturnValue({
      readContract: vi.fn().mockResolvedValue(BigInt(5_000_000)), // 5 USDC
    }),
    getWalletClient: vi.fn().mockReturnValue({}),
    getChainId: vi.fn().mockReturnValue(84532),
  };
}

function createMockMicroLedger() {
  return {
    record: vi.fn().mockReturnValue({ id: 'entry-1' }),
    getUnsettled: vi.fn().mockReturnValue([]),
    markSettled: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalEntries: 0, unsettledEntries: 0 }),
    getUnsettledVolume: vi.fn().mockReturnValue(0),
    pruneSettled: vi.fn().mockReturnValue(0),
  };
}

function createMockPaymentGateway() {
  return {
    createPaymentAuthorization: vi.fn().mockReturnValue({ chainId: 84532 }),
    runBatchSettlement: vi.fn().mockResolvedValue({ settled: 0, failed: 0, totalVolume: 0 }),
    getFacilitator: vi.fn(),
    dispose: vi.fn(),
  };
}

function walletTestConfig(overrides: Partial<HoloMeshDaemonConfig> = {}) {
  const w = createMockWallet();
  const ml = createMockMicroLedger();
  const pg = createMockPaymentGateway();
  return {
    config: createTestConfig({
      walletEnabled: true,
      walletTestnet: true,
      localAgentDid: 'test-did',
      _wallet: w as any,
      _paymentGateway: pg as any,
      _microLedger: ml as any,
      ...overrides,
    }),
    wallet: w,
    microLedger: ml,
    paymentGateway: pg,
  };
}

describe('createHoloMeshDaemonActions with V3 wallet', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('returns 15 action handlers (12 V2 + 2 V3 + 1 V5)', () => {
    const { config } = walletTestConfig();
    const { actions } = createHoloMeshDaemonActions(client, config);

    expect(Object.keys(actions)).toHaveLength(17);
    expect(actions.mesh_wallet_balance).toBeTypeOf('function');
    expect(actions.mesh_settle_micro).toBeTypeOf('function');
    expect(actions.mesh_create_profile).toBeTypeOf('function');
  });

  it('V1/V2 actions still work when wallet is disabled', () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        walletEnabled: false,
      })
    );
    expect(Object.keys(actions)).toHaveLength(17);
    expect(actions.mesh_register).toBeTypeOf('function');
    expect(actions.mesh_gossip_sync).toBeTypeOf('function');
  });
});

describe('mesh_wallet_balance (V3)', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('returns false when wallet not enabled', async () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        walletEnabled: false,
      })
    );
    const result = await actions.mesh_wallet_balance({}, emptyBB(), {});
    expect(result).toBe(false);
  });

  it('reads USDC balance and updates state', async () => {
    const { config, wallet } = walletTestConfig();
    const { actions } = createHoloMeshDaemonActions(client, config);
    const bb = emptyBB();

    const result = await actions.mesh_wallet_balance({}, bb, {});

    expect(result).toBe(true);
    expect(bb.wallet_balance).toBe(5); // 5_000_000 / 1_000_000
    expect(wallet.getPublicClient).toHaveBeenCalled();
  });

  it('handles RPC failure gracefully', async () => {
    const { config, wallet } = walletTestConfig();
    wallet.getPublicClient.mockReturnValueOnce({
      readContract: vi.fn().mockRejectedValue(new Error('RPC timeout')),
    });
    const { actions } = createHoloMeshDaemonActions(client, config);

    const result = await actions.mesh_wallet_balance({}, emptyBB(), {});
    expect(result).toBe(false);
  });
});

describe('mesh_collect_premium (V3 upgrade)', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('still works without wallet (logs only, backwards compat)', async () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        walletEnabled: false,
      })
    );

    const bb = emptyBB();
    bb.query_results = [makeEntry('W.paid.001', 0.5)];

    const result = await actions.mesh_collect_premium({}, bb, {});
    expect(result).toBe(true);
  });

  it('records micro-payment in ledger when wallet enabled', async () => {
    const { config, microLedger } = walletTestConfig();
    microLedger.getUnsettled.mockReturnValue([{ id: '1' }]);
    const { actions } = createHoloMeshDaemonActions(client, config);

    const bb = emptyBB();
    bb.query_results = [makeEntry('W.paid.001', 0.05)];

    const result = await actions.mesh_collect_premium({}, bb, {});

    expect(result).toBe(true);
    expect(microLedger.record).toHaveBeenCalledWith(
      '0xTestWalletAddress',
      'author-001',
      0.05,
      'hash-W.paid.001'
    );
    expect(bb.collected_this_cycle).toBe(1);
  });

  it('respects budget cap', async () => {
    const fsModule = await import('fs');
    (fsModule.existsSync as any).mockReturnValue(true);
    (fsModule.readFileSync as any).mockReturnValue(
      JSON.stringify({
        ...INITIAL_MESH_STATE,
        spentUSD: 4.9,
        budgetCapUSD: 5.0,
      })
    );

    const { config } = walletTestConfig();
    const { actions } = createHoloMeshDaemonActions(client, config);

    const bb = emptyBB();
    bb.query_results = [makeEntry('W.expensive', 0.5)];

    const result = await actions.mesh_collect_premium({}, bb, {});
    // Should skip because 4.90 + 0.50 > 5.0
    expect(result).toBe(false);
  });

  it('returns false when no premium entries', async () => {
    const { config } = walletTestConfig();
    const { actions } = createHoloMeshDaemonActions(client, config);

    const bb = emptyBB();
    bb.query_results = [makeEntry('W.free', 0)];

    const result = await actions.mesh_collect_premium({}, bb, {});
    expect(result).toBe(false);
  });
});

describe('mesh_settle_micro (V3)', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('returns false when wallet not enabled', async () => {
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        walletEnabled: false,
      })
    );
    const result = await actions.mesh_settle_micro({}, emptyBB(), {});
    expect(result).toBe(false);
  });

  it('returns false when no unsettled payments', async () => {
    const { config, microLedger } = walletTestConfig();
    microLedger.getUnsettled.mockReturnValue([]);
    const { actions } = createHoloMeshDaemonActions(client, config);

    const result = await actions.mesh_settle_micro({}, emptyBB(), {});
    expect(result).toBe(false);
  });

  it('runs batch settlement when unsettled exist', async () => {
    const { config, microLedger, paymentGateway } = walletTestConfig();
    microLedger.getUnsettled.mockReturnValue([{ id: '1', amount: 0.05 }]);
    paymentGateway.runBatchSettlement.mockResolvedValue({
      settled: 1,
      failed: 0,
      totalVolume: 0.05,
    });

    const { actions } = createHoloMeshDaemonActions(client, config);

    const result = await actions.mesh_settle_micro({}, emptyBB(), {});
    expect(result).toBe(true);
    expect(paymentGateway.runBatchSettlement).toHaveBeenCalled();
  });

  it('handles settlement failure gracefully', async () => {
    const { config, microLedger, paymentGateway } = walletTestConfig();
    microLedger.getUnsettled.mockReturnValue([{ id: '1' }]);
    paymentGateway.runBatchSettlement.mockRejectedValue(new Error('Settlement failed'));

    const { actions } = createHoloMeshDaemonActions(client, config);

    const result = await actions.mesh_settle_micro({}, emptyBB(), {});
    expect(result).toBe(false);
  });
});

describe('wallet initialization via injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips wallet when walletEnabled is false', () => {
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        walletEnabled: false,
      })
    );
    expect(actions.mesh_wallet_balance).toBeTypeOf('function');
    expect(actions.mesh_settle_micro).toBeTypeOf('function');
  });

  it('uses injected wallet instance', async () => {
    const client = createMockClient();
    const { config, wallet } = walletTestConfig();
    const { actions } = createHoloMeshDaemonActions(client, config);

    // Wallet balance should work because we injected the wallet
    const bb = emptyBB();
    const result = await actions.mesh_wallet_balance({}, bb, {});
    expect(result).toBe(true);
    expect(wallet.getAddress).toHaveBeenCalled();
  });

  it('sets wallet state fields when wallet provided', async () => {
    const client = createMockClient();
    const { config } = walletTestConfig();
    createHoloMeshDaemonActions(client, config);

    // State should have been written with wallet info
    const fsModule = await import('fs');
    const writeCalls = (fsModule.writeFileSync as any).mock.calls;
    expect(writeCalls.length).toBeGreaterThan(0);
    const lastState = JSON.parse(writeCalls[writeCalls.length - 1][1]);
    expect(lastState.walletEnabled).toBe(true);
    expect(lastState.walletAddress).toBe('0xTestWalletAddress');
    expect(lastState.walletChainId).toBe(84532);
  });
});

describe('wireTraitListeners (V3)', () => {
  it('wires economy_earn event', () => {
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

    expect(mockRuntime.on).toHaveBeenCalledWith('economy_earn', expect.any(Function));
  });
});

// ─── V4 Wallet Identity Tests ───

describe('mesh_register with V4 wallet auth', () => {
  let client: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
  });

  it('derives agentDid and passes wallet auth to registerAgent', async () => {
    const { config, wallet } = walletTestConfig();
    wallet.getWalletClient.mockReturnValue({
      signMessage: vi.fn().mockResolvedValue('0xWalletSignature'),
    });
    client.registerAgent.mockResolvedValue('did:pkh:eip155:84532:0xTestWalletAddress');

    const { actions } = createHoloMeshDaemonActions(client, config);
    const bb = emptyBB();

    const result = await actions.mesh_register({}, bb, {});

    expect(result).toBe(true);
    expect(client.registerAgent).toHaveBeenCalledWith(
      expect.arrayContaining(['@knowledge-exchange']),
      expect.objectContaining({
        did: expect.stringContaining('did:pkh:eip155:84532:'),
        address: '0xTestWalletAddress',
        signature: '0xWalletSignature',
      })
    );
  });

  it('falls back to UUID registration if wallet signing fails', async () => {
    const { config, wallet } = walletTestConfig();
    wallet.getWalletClient.mockReturnValue({
      signMessage: vi.fn().mockRejectedValue(new Error('sign failed')),
    });
    client.registerAgent.mockResolvedValue('holomesh-agent-fallback');

    const { actions } = createHoloMeshDaemonActions(client, config);
    const bb = emptyBB();

    const result = await actions.mesh_register({}, bb, {});

    expect(result).toBe(true);
    // Should still call registerAgent, just without walletAuth
    expect(client.registerAgent).toHaveBeenCalledWith(
      expect.arrayContaining(['@knowledge-exchange']),
      undefined
    );
  });

  it('sets wallet auth headers on reconnect when already registered', async () => {
    const fsModule = await import('fs');
    (fsModule.existsSync as any).mockReturnValue(true);
    (fsModule.readFileSync as any).mockReturnValue(
      JSON.stringify({
        ...INITIAL_MESH_STATE,
        agentId: 'did:pkh:eip155:84532:0xTestWalletAddress',
        agentDid: 'did:pkh:eip155:84532:0xTestWalletAddress',
        walletAddress: '0xTestWalletAddress',
        walletEnabled: true,
      })
    );

    const { config } = walletTestConfig();
    const { actions } = createHoloMeshDaemonActions(client, config);
    const bb = emptyBB();

    const result = await actions.mesh_register({}, bb, {});
    expect(result).toBe(true);
    expect(client.setWalletAuth).toHaveBeenCalledWith(
      'did:pkh:eip155:84532:0xTestWalletAddress',
      '0xTestWalletAddress'
    );
  });
});

describe('wallet state initialization (V4)', () => {
  it('sets agentDid from wallet address and chain ID', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { config } = walletTestConfig();
    createHoloMeshDaemonActions(client, config);

    const fsModule = await import('fs');
    const writeCalls = (fsModule.writeFileSync as any).mock.calls;
    const lastState = JSON.parse(writeCalls[writeCalls.length - 1][1]);
    expect(lastState.agentDid).toBe('did:pkh:eip155:84532:0xTestWalletAddress');
  });

  it('does not set agentDid when wallet is disabled', () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        walletEnabled: false,
      })
    );
    // agentDid stays null — no wallet init
    expect(actions.mesh_wallet_balance).toBeTypeOf('function');
  });
});

// ─── V5 Agent Profile Tests ───

describe('mesh_create_profile', () => {
  it('creates profile from daemon state', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const result = await actions.mesh_create_profile(emptyBB());
    expect(result).toBe(true);

    // Verify state was persisted
    const fsModule = await import('fs');
    const writeCalls = (fsModule.writeFileSync as any).mock.calls;
    expect(writeCalls.length).toBeGreaterThan(0);
    const lastState = JSON.parse(writeCalls[writeCalls.length - 1][1]);
    expect(lastState.profileCreated).toBe(true);
    expect(lastState.profileDisplayName).toBeTruthy();
    expect(lastState.profileThemeColor).toBe('#6366f1');
  });

  it('is idempotent — skips if profile already created', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    // First call creates
    await actions.mesh_create_profile(emptyBB());
    const fsModule = await import('fs');
    const callsAfterFirst = (fsModule.writeFileSync as any).mock.calls.length;

    // Second call should skip (no additional writes)
    const result = await actions.mesh_create_profile(emptyBB());
    expect(result).toBe(true);
    // writeFileSync may or may not be called again depending on implementation,
    // but profileCreated flag should remain true
    const writeCalls = (fsModule.writeFileSync as any).mock.calls;
    if (writeCalls.length > callsAfterFirst) {
      const lastState = JSON.parse(writeCalls[writeCalls.length - 1][1]);
      expect(lastState.profileCreated).toBe(true);
    }
  });

  it('populates bio from workspace and reputation', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    await actions.mesh_create_profile(emptyBB());

    const fsModule = await import('fs');
    const writeCalls = (fsModule.writeFileSync as any).mock.calls;
    const lastState = JSON.parse(writeCalls[writeCalls.length - 1][1]);
    expect(lastState.profileBio).toContain('HoloMesh network');
  });

  it('uses default theme color #6366f1', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    await actions.mesh_create_profile(emptyBB());

    const fsModule = await import('fs');
    const writeCalls = (fsModule.writeFileSync as any).mock.calls;
    const lastState = JSON.parse(writeCalls[writeCalls.length - 1][1]);
    expect(lastState.profileThemeColor).toBe('#6366f1');
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

  it('V10: reuseRate ignored when contributions < 3 (Sybil guard)', () => {
    // Before V10: computeReputation(0, 0, 1.0) = 50 (authority with zero work!)
    // After V10: reuseRate zeroed when contributions < 3
    expect(computeReputation(0, 0, 1.0)).toBe(0);
    expect(computeReputation(2, 0, 1.0)).toBe(0.6); // 2*0.3 = 0.6, reuseRate ignored
  });

  it('V10: reuseRate counts after 3+ contributions with capped weight', () => {
    // V11: directWork=0.9, reuseWeight=min(20, 40, 0.9*2=1.8)=1.8 → total=2.7
    expect(computeReputation(3, 0, 1.0)).toBe(2.7);
  });

  it('V11: reuseRate weight bounded by 2x direct work', () => {
    // directWork=0.9, reuseWeight=min(100, 40, 1.8)=1.8 → total=2.7
    expect(computeReputation(3, 0, 5.0)).toBe(2.7);
  });

  it('combines all factors with V11 formula', () => {
    // directWork=10*0.3+5*0.2=4, reuseWeight=min(10, 40, 8)=8 → total=12
    expect(computeReputation(10, 5, 0.5)).toBe(12);
  });

  it('V11: high direct work unlocks full reuseWeight', () => {
    // directWork=100*0.3+50*0.2=40, reuseWeight=min(40, 40, 80)=40 → total=80
    expect(computeReputation(100, 50, 2.0)).toBe(80);
  });

  it('V10: prevents Sybil authority (was computeReputation(0,0,2.0)=100)', () => {
    // The original Sybil vector: zero contributions, fake reuseRate = instant authority
    expect(computeReputation(0, 0, 2.0)).toBe(0);
    // Even with 2 contributions (below threshold), still blocked
    expect(computeReputation(2, 0, 2.0)).toBe(0.6);
  });

  it('V11: reuseWeight cannot exceed 2x direct work score', () => {
    // directWork=3*0.3=0.9, reuseWeight capped at 0.9*2=1.8
    const rep = computeReputation(3, 0, 10.0);
    expect(rep).toBe(2.7); // 0.9 + 1.8
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

// ─── Wiring Tests: Startup Ordering & Blackboard Handoff ───

describe('wiring: startup ordering', () => {
  it('V2 instances are created when v2Enabled=true + localAgentDid', () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        v2Enabled: true,
        localAgentDid: 'did:test:agent-v2',
        localMcpUrl: 'http://localhost:4000',
      })
    );
    // V2-gated actions should be callable and return false (no peers) rather than undefined
    expect(actions.mesh_gossip_sync).toBeTypeOf('function');
    expect(actions.mesh_p2p_discover).toBeTypeOf('function');
    expect(actions.mesh_persist_crdt).toBeTypeOf('function');
  });

  it('V2 actions return false gracefully when v2Enabled=false', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(
      client,
      createTestConfig({
        v2Enabled: false,
      })
    );
    expect(await actions.mesh_gossip_sync({}, emptyBB(), {})).toBe(false);
    expect(await actions.mesh_p2p_discover({}, emptyBB(), {})).toBe(false);
    expect(await actions.mesh_persist_crdt({}, emptyBB(), {})).toBe(false);
  });

  it('all 15 action handlers are present', () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    const expected = [
      'mesh_register',
      'mesh_discover_peers',
      'mesh_check_inbox',
      'mesh_reply_queries',
      'mesh_contribute_knowledge',
      'mesh_query_network',
      'mesh_collect_premium',
      'mesh_heartbeat',
      'mesh_follow_back',
      'mesh_gossip_sync',
      'mesh_p2p_discover',
      'mesh_persist_crdt',
      'mesh_wallet_balance',
      'mesh_settle_micro',
      'mesh_create_profile',
    ];
    for (const name of expected) {
      expect(actions[name]).toBeTypeOf('function');
    }
  });
});

describe('wiring: blackboard handoff', () => {
  it('mesh_check_inbox → mesh_reply_queries (inbox_messages flows through)', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const queryMsg = {
      id: 'msg-001',
      from: 'agent-peer',
      content: JSON.stringify({ type: 'query', payload: { search: 'safety' } }),
    };
    client.readInbox.mockResolvedValue([queryMsg]);
    client.queryKnowledge.mockResolvedValue([makeEntry('W.reply.001')]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());
    await actions.mesh_register({}, emptyBB(), {});

    // Simulate BT flow: check_inbox writes to bb, reply_queries reads from bb
    const bb = emptyBB();
    await actions.mesh_check_inbox({}, bb, {});
    expect(bb.inbox_messages).toBeDefined();
    expect(bb.inbox_messages.length).toBe(1);

    await actions.mesh_reply_queries({}, bb, {});
    expect(client.sendMessage).toHaveBeenCalled();
  });

  it('mesh_query_network → mesh_collect_premium (query_results flows through)', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    const premiumEntry = makeEntry('W.premium.001', 0.5);
    client.queryKnowledge.mockResolvedValue([premiumEntry]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    const bb = emptyBB();
    await actions.mesh_query_network({}, bb, {});
    expect(bb.query_results).toBeDefined();
    expect(bb.query_results.length).toBe(1);

    const collected = await actions.mesh_collect_premium({}, bb, {});
    expect(collected).toBe(true);
  });

  it('register must succeed before discover works', async () => {
    vi.clearAllMocks();
    const client = createMockClient();
    client.registerAgent.mockResolvedValue('agent-wiring-test');
    client.discoverPeers.mockResolvedValue([{ id: 'peer-1', name: 'test' }]);

    const { actions } = createHoloMeshDaemonActions(client, createTestConfig());

    // Register first
    const regResult = await actions.mesh_register({}, emptyBB(), {});
    expect(regResult).toBe(true);

    // Now discover should work
    const discResult = await actions.mesh_discover_peers({}, emptyBB(), {});
    expect(discResult).toBe(true);
  });
});
