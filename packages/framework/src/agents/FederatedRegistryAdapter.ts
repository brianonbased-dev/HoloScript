/**
 * @holoscript/core - Federated Registry Adapter
 *
 * Extends the AgentRegistry with cross-composition discovery by
 * fetching remote A2A Agent Cards from /.well-known/agent-card.json
 * endpoints and converting them to AgentManifest entries.
 *
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

import type { AgentManifest, TrustLevel, AgentCapability, AgentEndpoint } from './AgentManifest';
import type { AgentRegistry } from './AgentRegistry';
import type { CapabilityQuery, AgentMatch } from './CapabilityMatcher';

// =============================================================================
// A2A AGENT CARD TYPES (subset needed for conversion)
// =============================================================================

/**
 * Minimal A2A AgentCard shape for federation.
 * Matches the full AgentCard type in packages/mcp-server/src/a2a.ts.
 */
export interface A2AAgentCard {
  id: string;
  name: string;
  description?: string;
  endpoint: string;
  version: string;
  provider?: { organization: string; url: string };
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  skills?: A2ASkill[];
}

export interface A2ASkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface FederatedRegistryConfig {
  /** Remote agent-card.json URLs to poll */
  seedUrls: string[];
  /** Poll interval in ms (default 60_000) */
  pollIntervalMs: number;
  /** Maximum remote agents to track (default 100) */
  maxRemoteAgents: number;
  /** Trust level assigned to remote agents (default 'external') */
  trustRemoteAs: TrustLevel;
  /** HTTP fetch timeout in ms (default 5_000) */
  timeout: number;
  /** Custom fetch function (for testing) */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}

const DEFAULT_CONFIG: FederatedRegistryConfig = {
  seedUrls: [],
  pollIntervalMs: 60_000,
  maxRemoteAgents: 100,
  trustRemoteAs: 'external',
  timeout: 5_000,
};

// =============================================================================
// TAG-TO-CAPABILITY MAPPING
// =============================================================================

const TAG_TO_TYPE: Record<string, string> = {
  parsing: 'analyze',
  validation: 'validate',
  compilation: 'transform',
  generation: 'generate',
  rendering: 'render',
  analysis: 'analyze',
  optimization: 'optimize',
  storage: 'store',
  retrieval: 'retrieve',
  orchestration: 'orchestrate',
  detection: 'detect',
  communication: 'communicate',
};

const TAG_TO_DOMAIN: Record<string, string> = {
  spatial: 'spatial',
  '3d': 'spatial',
  vr: 'spatial',
  ar: 'spatial',
  nlp: 'nlp',
  language: 'nlp',
  vision: 'vision',
  blockchain: 'blockchain',
  web3: 'blockchain',
  audio: 'audio',
  video: 'video',
  physics: 'physics',
  network: 'networking',
  security: 'security',
  trading: 'trading',
  social: 'social',
  gaming: 'gaming',
};

// =============================================================================
// FEDERATED REGISTRY ADAPTER
// =============================================================================

export class FederatedRegistryAdapter {
  private registry: AgentRegistry;
  private config: FederatedRegistryConfig;
  private pollTimer?: ReturnType<typeof setInterval>;
  private remoteAgentIds: Set<string> = new Set();
  private lastPollResults: Map<string, { timestamp: number; success: boolean }> = new Map();

  constructor(registry: AgentRegistry, config: Partial<FederatedRegistryConfig> = {}) {
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // CORE: FETCH & REGISTER
  // ===========================================================================

  /**
   * Fetch a remote agent card and register it into the local registry.
   * Returns the converted manifest on success, null on failure.
   */
  async fetchAndRegister(url: string): Promise<AgentManifest | null> {
    try {
      const card = await this.fetchAgentCard(url);
      if (!card || !card.id || !card.name) {
        this.lastPollResults.set(url, { timestamp: Date.now(), success: false });
        return null;
      }

      // Capacity check
      if (
        this.remoteAgentIds.size >= this.config.maxRemoteAgents &&
        !this.remoteAgentIds.has(card.id)
      ) {
        this.lastPollResults.set(url, { timestamp: Date.now(), success: false });
        return null;
      }

      const manifest = this.a2aCardToManifest(card, url);
      await this.registry.register(manifest);
      this.remoteAgentIds.add(card.id);
      this.lastPollResults.set(url, { timestamp: Date.now(), success: true });
      return manifest;
    } catch {
      this.lastPollResults.set(url, { timestamp: Date.now(), success: false });
      return null;
    }
  }

  /**
   * Poll all seed URLs once. Returns summary of results.
   */
  async pollAll(): Promise<{ added: number; updated: number; failed: string[] }> {
    let added = 0;
    let updated = 0;
    const failed: string[] = [];

    const _results = await Promise.allSettled(
      this.config.seedUrls.map(async (url) => {
        const wasKnown = this.isKnownUrl(url);
        const manifest = await this.fetchAndRegister(url);
        if (manifest) {
          if (wasKnown) {
            updated++;
          } else {
            added++;
          }
        } else {
          failed.push(url);
        }
      })
    );

    return { added, updated, failed };
  }

  // ===========================================================================
  // POLLING LIFECYCLE
  // ===========================================================================

  /**
   * Start periodic polling of seed URLs.
   */
  startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.pollAll();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop periodic polling.
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Whether polling is currently active.
   */
  get isPolling(): boolean {
    return this.pollTimer !== undefined;
  }

  // ===========================================================================
  // CONVERSION: A2A AgentCard → AgentManifest
  // ===========================================================================

  /**
   * Convert an A2A AgentCard to an AgentManifest.
   */
  a2aCardToManifest(card: A2AAgentCard, sourceUrl: string): AgentManifest {
    const capabilities = this.extractCapabilities(card);
    const endpoint = this.extractEndpoint(card);

    return {
      id: card.id,
      name: card.name,
      version: card.version || '0.0.0',
      description: card.description,
      capabilities,
      endpoints: [endpoint],
      trustLevel: this.config.trustRemoteAs,
      tags: ['remote', 'a2a', ...(card.provider?.organization ? [card.provider.organization] : [])],
      status: 'online',
      metadata: {
        sourceUrl,
        a2aEndpoint: card.endpoint,
        provider: card.provider,
        a2aCapabilities: card.capabilities,
        skillCount: card.skills?.length ?? 0,
      },
    };
  }

  // ===========================================================================
  // FEDERATED DISCOVERY
  // ===========================================================================

  /**
   * Discover agents across local registry + remote seeds.
   * Ensures all seed URLs are polled before querying.
   */
  async discoverFederated(query: CapabilityQuery): Promise<AgentMatch[]> {
    // Ensure remote agents are loaded
    if (this.remoteAgentIds.size === 0 && this.config.seedUrls.length > 0) {
      await this.pollAll();
    }

    // The registry now contains both local and remote agents
    return this.registry.discoverWithScores(query);
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get all remote agent IDs tracked by this adapter.
   */
  getRemoteAgentIds(): string[] {
    return Array.from(this.remoteAgentIds);
  }

  /**
   * Get the number of remote agents currently tracked.
   */
  get remoteAgentCount(): number {
    return this.remoteAgentIds.size;
  }

  /**
   * Get poll results for a specific URL.
   */
  getPollResult(url: string): { timestamp: number; success: boolean } | undefined {
    return this.lastPollResults.get(url);
  }

  /**
   * Add a seed URL dynamically (does not trigger immediate poll).
   */
  addSeedUrl(url: string): void {
    if (!this.config.seedUrls.includes(url)) {
      this.config.seedUrls.push(url);
    }
  }

  /**
   * Remove a seed URL and optionally deregister its agent.
   */
  async removeSeedUrl(url: string, deregister = true): Promise<void> {
    this.config.seedUrls = this.config.seedUrls.filter((u) => u !== url);
    if (deregister) {
      // Find the agent registered from this URL and remove it
      for (const agentId of this.remoteAgentIds) {
        const manifest = this.registry.get(agentId);
        if (manifest?.metadata?.sourceUrl === url) {
          await this.registry.deregister(agentId);
          this.remoteAgentIds.delete(agentId);
          break;
        }
      }
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Fetch an agent card from a URL.
   */
  private async fetchAgentCard(url: string): Promise<A2AAgentCard | null> {
    const fetchFn = this.config.fetchFn || globalThis.fetch;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetchFn(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as A2AAgentCard;
      return data;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extract capabilities from an A2A AgentCard's skills.
   */
  private extractCapabilities(card: A2AAgentCard): AgentCapability[] {
    if (!card.skills || card.skills.length === 0) {
      return [{ type: 'custom', domain: 'general', name: card.name }];
    }

    // Deduplicate by type+domain pairs derived from skill tags
    const capMap = new Map<string, AgentCapability>();

    for (const skill of card.skills) {
      const tags = skill.tags || [];
      const type = this.deriveType(tags);
      const domain = this.deriveDomain(tags);
      const key = `${type}:${domain}`;

      if (!capMap.has(key)) {
        capMap.set(key, {
          type,
          domain,
          name: skill.name,
          description: skill.description,
          available: true,
        });
      }
    }

    return Array.from(capMap.values());
  }

  /**
   * Extract endpoint from an A2A AgentCard.
   */
  private extractEndpoint(card: A2AAgentCard): AgentEndpoint {
    const url = card.endpoint || '';
    const isSecure = url.startsWith('https');
    return {
      protocol: isSecure ? 'https' : 'http',
      address: url,
      primary: true,
      formats: ['json'],
    };
  }

  /**
   * Derive capability type from A2A skill tags.
   */
  private deriveType(tags: string[]): string {
    for (const tag of tags) {
      const mapped = TAG_TO_TYPE[tag.toLowerCase()];
      if (mapped) return mapped;
    }
    return 'custom';
  }

  /**
   * Derive capability domain from A2A skill tags.
   */
  private deriveDomain(tags: string[]): string {
    for (const tag of tags) {
      const mapped = TAG_TO_DOMAIN[tag.toLowerCase()];
      if (mapped) return mapped;
    }
    return 'general';
  }

  /**
   * Check if a URL has been successfully polled before.
   */
  private isKnownUrl(url: string): boolean {
    const result = this.lastPollResults.get(url);
    return !!result?.success;
  }
}
