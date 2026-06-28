import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoloMeshOrchestratorClient } from '../orchestrator-client';
import type { MeshConfig } from '../types';

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
