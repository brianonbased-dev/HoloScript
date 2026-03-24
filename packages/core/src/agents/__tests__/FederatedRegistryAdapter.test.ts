/**
 * FederatedRegistryAdapter Tests
 *
 * Tests cross-composition agent discovery via remote A2A Agent Card fetching.
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FederatedRegistryAdapter,
  type FederatedRegistryConfig,
  type A2AAgentCard,
} from '../FederatedRegistryAdapter';
import { AgentRegistry, resetDefaultRegistry } from '../AgentRegistry';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function makeAgentCard(overrides: Partial<A2AAgentCard> = {}): A2AAgentCard {
  return {
    id: 'remote-agent-1',
    name: 'Remote Agent',
    description: 'A remote agent for testing',
    endpoint: 'https://remote.example.com/a2a',
    version: '1.0.0',
    provider: { organization: 'TestOrg', url: 'https://example.com' },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    skills: [
      {
        id: 'parse_hs',
        name: 'Parse HoloScript',
        description: 'Parses HoloScript source code',
        tags: ['parsing', 'spatial'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'compile_hs',
        name: 'Compile HoloScript',
        description: 'Compiles HoloScript to target',
        tags: ['compilation', 'spatial'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
    ...overrides,
  };
}

function makeMockFetch(
  cards: Record<string, A2AAgentCard | null>
): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url: string) => {
    const card = cards[url];
    if (card === null || card === undefined) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => card,
    } as Response;
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('FederatedRegistryAdapter', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    resetDefaultRegistry();
    registry = new AgentRegistry();
  });

  afterEach(() => {
    registry.stop();
    registry.clear();
  });

  describe('a2aCardToManifest', () => {
    it('converts an A2A AgentCard to an AgentManifest', () => {
      const adapter = new FederatedRegistryAdapter(registry);
      const card = makeAgentCard();
      const manifest = adapter.a2aCardToManifest(card, 'https://remote.example.com/.well-known/agent-card.json');

      expect(manifest.id).toBe('remote-agent-1');
      expect(manifest.name).toBe('Remote Agent');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.trustLevel).toBe('external');
      expect(manifest.tags).toContain('remote');
      expect(manifest.tags).toContain('a2a');
      expect(manifest.tags).toContain('TestOrg');
      expect(manifest.endpoints).toHaveLength(1);
      expect(manifest.endpoints[0].protocol).toBe('https');
      expect(manifest.endpoints[0].address).toBe('https://remote.example.com/a2a');
      expect(manifest.capabilities.length).toBeGreaterThan(0);
      expect(manifest.metadata?.sourceUrl).toBe('https://remote.example.com/.well-known/agent-card.json');
    });

    it('extracts capability type from skill tags', () => {
      const adapter = new FederatedRegistryAdapter(registry);
      const card = makeAgentCard({
        skills: [
          { id: 'skill-1', name: 'Analyzer', tags: ['analysis', 'nlp'], inputModes: [], outputModes: [] },
        ],
      });
      const manifest = adapter.a2aCardToManifest(card, 'https://example.com');

      expect(manifest.capabilities[0].type).toBe('analyze');
      expect(manifest.capabilities[0].domain).toBe('nlp');
    });

    it('deduplicates capabilities by type+domain', () => {
      const adapter = new FederatedRegistryAdapter(registry);
      const card = makeAgentCard({
        skills: [
          { id: 's1', name: 'Parse 1', tags: ['parsing', 'spatial'], inputModes: [], outputModes: [] },
          { id: 's2', name: 'Parse 2', tags: ['parsing', 'spatial'], inputModes: [], outputModes: [] },
          { id: 's3', name: 'Compile', tags: ['compilation', 'spatial'], inputModes: [], outputModes: [] },
        ],
      });
      const manifest = adapter.a2aCardToManifest(card, 'https://example.com');

      // Should have 2 unique type+domain pairs: analyze:spatial and transform:spatial
      expect(manifest.capabilities).toHaveLength(2);
    });

    it('handles cards with no skills', () => {
      const adapter = new FederatedRegistryAdapter(registry);
      const card = makeAgentCard({ skills: [] });
      const manifest = adapter.a2aCardToManifest(card, 'https://example.com');

      expect(manifest.capabilities).toHaveLength(1);
      expect(manifest.capabilities[0].type).toBe('custom');
      expect(manifest.capabilities[0].domain).toBe('general');
    });

    it('respects custom trustRemoteAs config', () => {
      const adapter = new FederatedRegistryAdapter(registry, { trustRemoteAs: 'known' });
      const card = makeAgentCard();
      const manifest = adapter.a2aCardToManifest(card, 'https://example.com');

      expect(manifest.trustLevel).toBe('known');
    });
  });

  describe('fetchAndRegister', () => {
    it('fetches a remote agent card and registers into registry', async () => {
      const card = makeAgentCard();
      const adapter = new FederatedRegistryAdapter(registry, {
        fetchFn: makeMockFetch({
          'https://remote.example.com/.well-known/agent-card.json': card,
        }),
      });

      const manifest = await adapter.fetchAndRegister(
        'https://remote.example.com/.well-known/agent-card.json'
      );

      expect(manifest).not.toBeNull();
      expect(manifest!.id).toBe('remote-agent-1');
      expect(registry.has('remote-agent-1')).toBe(true);
      expect(adapter.remoteAgentCount).toBe(1);
    });

    it('returns null for failed HTTP requests', async () => {
      const adapter = new FederatedRegistryAdapter(registry, {
        fetchFn: makeMockFetch({ 'https://fail.example.com': null }),
      });

      const manifest = await adapter.fetchAndRegister('https://fail.example.com');

      expect(manifest).toBeNull();
      expect(adapter.remoteAgentCount).toBe(0);
    });

    it('returns null when card is missing required fields', async () => {
      const adapter = new FederatedRegistryAdapter(registry, {
        fetchFn: async () =>
          ({ ok: true, json: async () => ({ version: '1.0.0' }) } as Response),
      });

      const manifest = await adapter.fetchAndRegister('https://bad.example.com');
      expect(manifest).toBeNull();
    });

    it('enforces maxRemoteAgents capacity', async () => {
      const adapter = new FederatedRegistryAdapter(registry, {
        maxRemoteAgents: 1,
        fetchFn: makeMockFetch({
          'https://agent1.com': makeAgentCard({ id: 'agent-1', name: 'Agent 1' }),
          'https://agent2.com': makeAgentCard({ id: 'agent-2', name: 'Agent 2' }),
        }),
      });

      const m1 = await adapter.fetchAndRegister('https://agent1.com');
      const m2 = await adapter.fetchAndRegister('https://agent2.com');

      expect(m1).not.toBeNull();
      expect(m2).toBeNull(); // Capacity reached
      expect(adapter.remoteAgentCount).toBe(1);
    });

    it('allows re-registering an existing remote agent (update)', async () => {
      const card = makeAgentCard();
      const adapter = new FederatedRegistryAdapter(registry, {
        maxRemoteAgents: 1,
        fetchFn: makeMockFetch({
          'https://agent1.com': card,
        }),
      });

      await adapter.fetchAndRegister('https://agent1.com');
      const m2 = await adapter.fetchAndRegister('https://agent1.com');

      expect(m2).not.toBeNull(); // Same ID, should update, not be blocked by capacity
      expect(adapter.remoteAgentCount).toBe(1);
    });
  });

  describe('pollAll', () => {
    it('polls all seed URLs and returns summary', async () => {
      const adapter = new FederatedRegistryAdapter(registry, {
        seedUrls: [
          'https://agent1.com/.well-known/agent-card.json',
          'https://agent2.com/.well-known/agent-card.json',
          'https://fail.com/.well-known/agent-card.json',
        ],
        fetchFn: makeMockFetch({
          'https://agent1.com/.well-known/agent-card.json': makeAgentCard({
            id: 'agent-1',
            name: 'Agent 1',
          }),
          'https://agent2.com/.well-known/agent-card.json': makeAgentCard({
            id: 'agent-2',
            name: 'Agent 2',
          }),
        }),
      });

      const result = await adapter.pollAll();

      expect(result.added).toBe(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toBe('https://fail.com/.well-known/agent-card.json');
      expect(registry.size).toBe(2);
    });

    it('reports updated on subsequent polls', async () => {
      const adapter = new FederatedRegistryAdapter(registry, {
        seedUrls: ['https://agent1.com'],
        fetchFn: makeMockFetch({
          'https://agent1.com': makeAgentCard({ id: 'agent-1', name: 'Agent 1' }),
        }),
      });

      const first = await adapter.pollAll();
      expect(first.added).toBe(1);
      expect(first.updated).toBe(0);

      const second = await adapter.pollAll();
      expect(second.added).toBe(0);
      expect(second.updated).toBe(1);
    });
  });

  describe('polling lifecycle', () => {
    it('starts and stops polling', () => {
      const adapter = new FederatedRegistryAdapter(registry, { pollIntervalMs: 100_000 });

      expect(adapter.isPolling).toBe(false);
      adapter.startPolling();
      expect(adapter.isPolling).toBe(true);
      adapter.stopPolling();
      expect(adapter.isPolling).toBe(false);
    });

    it('does not start duplicate polling timers', () => {
      const adapter = new FederatedRegistryAdapter(registry, { pollIntervalMs: 100_000 });

      adapter.startPolling();
      adapter.startPolling(); // Should not create a second timer
      expect(adapter.isPolling).toBe(true);
      adapter.stopPolling();
      expect(adapter.isPolling).toBe(false);
    });
  });

  describe('discoverFederated', () => {
    it('discovers agents across local and remote registries', async () => {
      // Register a local agent
      await registry.register({
        id: 'local-agent',
        name: 'Local Agent',
        version: '1.0.0',
        capabilities: [{ type: 'analyze', domain: 'spatial' }],
        endpoints: [{ protocol: 'local', address: 'local://agent' }],
        trustLevel: 'local',
      });

      // Set up adapter with a remote agent
      const adapter = new FederatedRegistryAdapter(registry, {
        seedUrls: ['https://remote.com/.well-known/agent-card.json'],
        fetchFn: makeMockFetch({
          'https://remote.com/.well-known/agent-card.json': makeAgentCard({
            id: 'remote-1',
            name: 'Remote 1',
            skills: [
              { id: 's1', name: 'Analyze', tags: ['analysis', 'spatial'], inputModes: [], outputModes: [] },
            ],
          }),
        }),
      });

      const matches = await adapter.discoverFederated({
        type: 'analyze',
        domain: 'spatial',
        includeOffline: true,
      });

      expect(matches.length).toBe(2);
      const ids = matches.map((m) => m.manifest.id);
      expect(ids).toContain('local-agent');
      expect(ids).toContain('remote-1');
    });
  });

  describe('seed URL management', () => {
    it('addSeedUrl adds a new URL', () => {
      const adapter = new FederatedRegistryAdapter(registry, { seedUrls: ['https://a.com'] });
      adapter.addSeedUrl('https://b.com');
      adapter.addSeedUrl('https://a.com'); // Duplicate, should not add

      expect(adapter.getRemoteAgentIds()).toHaveLength(0); // No agents yet
    });

    it('removeSeedUrl deregisters the associated agent', async () => {
      const adapter = new FederatedRegistryAdapter(registry, {
        seedUrls: ['https://agent1.com'],
        fetchFn: makeMockFetch({
          'https://agent1.com': makeAgentCard({ id: 'agent-1', name: 'Agent 1' }),
        }),
      });

      await adapter.fetchAndRegister('https://agent1.com');
      expect(registry.has('agent-1')).toBe(true);

      await adapter.removeSeedUrl('https://agent1.com');
      expect(registry.has('agent-1')).toBe(false);
    });
  });

  describe('getPollResult', () => {
    it('tracks poll results per URL', async () => {
      const adapter = new FederatedRegistryAdapter(registry, {
        fetchFn: makeMockFetch({
          'https://ok.com': makeAgentCard(),
        }),
      });

      await adapter.fetchAndRegister('https://ok.com');
      await adapter.fetchAndRegister('https://fail.com');

      const okResult = adapter.getPollResult('https://ok.com');
      expect(okResult?.success).toBe(true);

      const failResult = adapter.getPollResult('https://fail.com');
      expect(failResult?.success).toBe(false);
    });
  });
});
