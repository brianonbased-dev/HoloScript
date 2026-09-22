import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoloMeshOrchestratorClient } from '../orchestrator-client';
import type { MeshConfig, MeshKnowledgeEntry } from '../types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const baseConfig: MeshConfig = {
  orchestratorUrl: 'https://orchestrator.example',
  apiKey: 'test-key',
  workspace: 'test-workspace',
  agentName: 'test-agent',
  discoveryIntervalMs: 1000,
  inboxIntervalMs: 1000,
  maxContributionsPerCycle: 1,
  maxQueriesPerCycle: 1,
  budgetCapUSD: 1,
};

describe('HoloMeshOrchestratorClient endpoint metadata', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('publishes normalized MCP and CRDT endpoint metadata when registering', async () => {
    process.env.MCP_LOCAL_URL = 'https://mcp.holoscript.net/mcp';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agent: { id: 'agent-1' } }),
    });

    const client = new HoloMeshOrchestratorClient(baseConfig);
    await client.registerAgent(['@crdt-gossip']);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.mcpEndpoint).toBe('https://mcp.holoscript.net');
    expect(body.mcp_endpoint).toBe('https://mcp.holoscript.net');
    expect(body.metadata.mcpEndpoint).toBe('https://mcp.holoscript.net');
    expect(body.metadata.crdtGossipUrl).toBe('https://mcp.holoscript.net/.well-known/crdt-gossip');
  });

  it('maps orchestrator endpoint aliases back into discoverable peer cards', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: [
          {
            id: 'peer-1',
            name: 'Peer One',
            metadata: {
              did: 'did:peer:1',
              mcp_endpoint: 'https://peer.example/mcp',
              traits: ['@crdt-gossip'],
              reputation: 7,
            },
          },
        ],
      }),
    });

    const client = new HoloMeshOrchestratorClient(baseConfig);
    client.setAgentId('self');
    const peers = await client.discoverPeers({ traits: ['@crdt-gossip'] });

    expect(peers).toHaveLength(1);
    expect(peers[0].did).toBe('did:peer:1');
    expect(peers[0].mcpEndpoint).toBe('https://peer.example');
    expect(peers[0].mcpBaseUrl).toBe('https://peer.example');
    expect(peers[0].traits).toContain('@crdt-gossip');
  });
});

describe('HoloMeshOrchestratorClient queryKnowledge metadata', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('copies orchestrator metadata so public-feed quality filters can run', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'W.quality',
            type: 'wisdom',
            content: 'Rejected dumps must keep their quality metadata.',
            created_at: '2026-01-01T00:00:00.000Z',
            tags: ['ok'],
            metadata: {
              authorId: 'agent-1',
              authorName: 'Alice',
              quality: { state: 'rejected' },
            },
          },
        ],
      }),
    });

    const client = new HoloMeshOrchestratorClient(baseConfig);
    const entries = await client.queryKnowledge('rejected', { limit: 10 });

    expect(entries).toHaveLength(1);
    expect(entries[0].authorId).toBe('agent-1');
    expect(entries[0].authorName).toBe('Alice');
    expect(entries[0].metadata).toEqual(
      expect.objectContaining({
        quality: { state: 'rejected' },
      })
    );
  });
});

// task_1790081256205_w6ui: post() returned null on any non-2xx, the same shape as a network
// failure, and contributeKnowledge then fell back to entries.length, so a refused write was
// reported as synced. The client now reports what the orchestrator accepted and why not.
describe('HoloMeshOrchestratorClient contributeKnowledge reports what the orchestrator accepted', () => {
  const entry: MeshKnowledgeEntry = {
    id: 'W.team.1',
    workspaceId: 'team:t1',
    type: 'wisdom',
    content: 'a row',
    provenanceHash: 'hash',
    authorId: 'agent-a',
    authorName: 'Agent A',
    price: 0,
    queryCount: 0,
    reuseCount: 0,
    createdAt: '2026-09-22T12:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a refused write is synced: 0 with the status and the reason, never the caller's own count", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) });
    const client = new HoloMeshOrchestratorClient(baseConfig);
    expect(await client.contributeKnowledge([entry])).toBe(0);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'bad key' }) });
    const outcome = await client.contributeKnowledgeDetailed([entry]);
    expect(outcome).toMatchObject({ synced: 0, accepted: false, status: 401 });
    expect(outcome.reason).toContain('HTTP 401');
    expect(outcome.reason).toContain('bad key');
  });

  it('an unreachable orchestrator is synced: 0 with the error named', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = new HoloMeshOrchestratorClient(baseConfig);
    const outcome = await client.contributeKnowledgeDetailed([entry]);
    expect(outcome).toMatchObject({ synced: 0, accepted: false, status: null });
    expect(outcome.reason).toContain('unreachable');
    expect(outcome.reason).toContain('ECONNREFUSED');
  });

  it("an accepted write reports the orchestrator's count, or the batch size when it names none", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ synced: 2 }) });
    const client = new HoloMeshOrchestratorClient(baseConfig);
    expect(await client.contributeKnowledgeDetailed([entry, { ...entry, id: 'W.team.2' }])).toMatchObject({ synced: 2, accepted: true, status: 200, reason: null });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    expect(await client.contributeKnowledge([entry])).toBe(1);
    // A 2xx that says it accepted nothing is 0, not the batch size.
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ synced: 0 }) });
    expect(await client.contributeKnowledge([entry])).toBe(0);
  });
});
