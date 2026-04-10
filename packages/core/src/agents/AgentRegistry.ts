/**
 * @holoscript/core - Agent Registry
 *
 * Central registry for agent registration, discovery, and health tracking.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

import { EventEmitter } from 'events';
import type { AgentManifest, TrustLevel } from './AgentManifest';
import { validateManifest } from './AgentManifest';
import { CapabilityMatcher, type CapabilityQuery, type AgentMatch } from './CapabilityMatcher';

// ============================================================================
// REGISTRY CONFIGURATION
// ============================================================================

/**
 * Discovery mode for the registry
 */
export type DiscoveryMode = 'central' | 'broadcast' | 'hybrid';

/**
 * Registry configuration
 */
export interface RegistryConfig {
  /** Discovery mode */
  mode: DiscoveryMode;
  /** Default TTL for agent registrations (ms) */
  defaultTTL: number;
  /** Health check interval (ms) */
  healthCheckInterval: number;
  /** Max time before agent is marked offline (ms) */
  offlineThreshold: number;
  /** Whether to auto-cleanup offline agents */
  autoCleanup: boolean;
  /** Cleanup interval (ms) */
  cleanupInterval: number;
  /** Maximum number of agents */
  maxAgents: number;
  /** Minimum trust level for registration */
  minTrustForRegistration: TrustLevel;
}

/**
 * Default configuration
 */
export const DEFAULT_REGISTRY_CONFIG: RegistryConfig = {
  mode: 'central',
  defaultTTL: 300000, // 5 minutes
  healthCheckInterval: 10000, // 10 seconds
  offlineThreshold: 30000, // 30 seconds
  autoCleanup: true,
  cleanupInterval: 60000, // 1 minute
  maxAgents: 1000,
  minTrustForRegistration: 'external',
};

// ============================================================================
// REGISTRY EVENTS
// ============================================================================

/**
 * Registry event types
 */
export interface RegistryEvents {
  'agent:registered': (manifest: AgentManifest) => void;
  'agent:deregistered': (agentId: string, reason: string) => void;
  'agent:online': (agentId: string) => void;
  'agent:offline': (agentId: string) => void;
  'agent:degraded': (agentId: string) => void;
  'agent:updated': (manifest: AgentManifest) => void;
  'registry:cleanup': (removedCount: number) => void;
  'registry:error': (error: Error) => void;
}

// ============================================================================
// AGENT ENTRY
// ============================================================================

/**
 * Internal agent entry with metadata
 */
interface AgentEntry {
  manifest: AgentManifest;
  registeredAt: number;
  lastHeartbeat: number;
  heartbeatCount: number;
  missedHeartbeats: number;
  ttl: number;
}

// ============================================================================
// AGENT REGISTRY
// ============================================================================

/**
 * Central registry for agent registration and discovery
 */
export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentEntry> = new Map();
  private matcher: CapabilityMatcher = new CapabilityMatcher();
  private config: RegistryConfig;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private isShuttingDown = false;

  constructor(config: Partial<RegistryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Start the registry (begins health checks and cleanup)
   */
  start(): void {
    if (this.isShuttingDown) {
      throw new Error('Registry is shutting down');
    }

    // Start health check timer
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Start cleanup timer if enabled
    if (this.config.autoCleanup) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
    }
  }

  /**
   * Stop the registry
   */
  stop(): void {
    this.isShuttingDown = true;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clear all agents and reset
   */
  clear(): void {
    this.agents.clear();
  }

  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  /**
   * Register an agent
   */
  async register(manifest: AgentManifest): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Registry is shutting down');
    }

    // Validate manifest
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
    }

    // Check trust level
    const trustLevels: TrustLevel[] = ['local', 'verified', 'known', 'external', 'untrusted'];
    const minTrustIndex = trustLevels.indexOf(this.config.minTrustForRegistration);
    const agentTrustIndex = trustLevels.indexOf(manifest.trustLevel);
    if (agentTrustIndex > minTrustIndex) {
      throw new Error(
        `Trust level ${manifest.trustLevel} does not meet minimum ${this.config.minTrustForRegistration}`
      );
    }

    // Check max agents
    if (this.agents.size >= this.config.maxAgents && !this.agents.has(manifest.id)) {
      throw new Error(`Registry full: maximum ${this.config.maxAgents} agents`);
    }

    const now = Date.now();
    const entry: AgentEntry = {
      manifest: {
        ...manifest,
        registeredAt: now,
        updatedAt: now,
        lastHeartbeat: now,
        status: 'online',
      },
      registeredAt: now,
      lastHeartbeat: now,
      heartbeatCount: 0,
      missedHeartbeats: 0,
      ttl: manifest.healthCheckInterval || this.config.defaultTTL,
    };

    const isUpdate = this.agents.has(manifest.id);
    this.agents.set(manifest.id, entry);

    if (isUpdate) {
      this.emit('agent:updated', entry.manifest);
    } else {
      this.emit('agent:registered', entry.manifest);
    }
  }

  /**
   * Deregister an agent
   */
  async deregister(agentId: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (entry) {
      this.agents.delete(agentId);
      this.emit('agent:deregistered', agentId, 'explicit');
    }
  }

  /**
   * Update an agent's heartbeat
   */
  async heartbeat(agentId: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const now = Date.now();
    const wasOffline = entry.manifest.status === 'offline';

    entry.lastHeartbeat = now;
    entry.heartbeatCount++;
    entry.missedHeartbeats = 0;
    entry.manifest.lastHeartbeat = now;
    entry.manifest.status = 'online';

    if (wasOffline) {
      this.emit('agent:online', agentId);
    }
  }

  // ==========================================================================
  // DISCOVERY
  // ==========================================================================

  /**
   * Discover agents matching a capability query
   */
  async discover(query: CapabilityQuery): Promise<AgentManifest[]> {
    const manifests = this.getAllManifests();
    const matches = this.matcher.findMatches(manifests, query);
    return matches.map((m) => m.manifest);
  }

  /**
   * Discover agents with full match details
   */
  async discoverWithScores(query: CapabilityQuery): Promise<AgentMatch[]> {
    const manifests = this.getAllManifests();
    return this.matcher.findMatches(manifests, query);
  }

  /**
   * Find the best agent for a query
   */
  async findBest(query: CapabilityQuery): Promise<AgentManifest | null> {
    const manifests = this.getAllManifests();
    const match = this.matcher.findBest(manifests, query);
    return match?.manifest || null;
  }

  /**
   * Get a specific agent by ID
   */
  get(agentId: string): AgentManifest | undefined {
    return this.agents.get(agentId)?.manifest;
  }

  /**
   * Check if an agent is registered
   */
  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Get all registered manifests
   */
  getAllManifests(): AgentManifest[] {
    return Array.from(this.agents.values()).map((e) => e.manifest);
  }

  /**
   * Get count of registered agents
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Get count by status
   */
  getStatusCounts(): Record<string, number> {
    const counts: Record<string, number> = {
      online: 0,
      offline: 0,
      degraded: 0,
      unknown: 0,
    };

    for (const entry of this.agents.values()) {
      const status = entry.manifest.status || 'unknown';
      counts[status] = (counts[status] || 0) + 1;
    }

    return counts;
  }

  // ==========================================================================
  // HEALTH CHECKS
  // ==========================================================================

  /**
   * Perform health check on all agents
   */
  private performHealthCheck(): void {
    const now = Date.now();

    for (const [agentId, entry] of this.agents) {
      const timeSinceHeartbeat = now - entry.lastHeartbeat;

      if (timeSinceHeartbeat > this.config.offlineThreshold) {
        const wasOnline = entry.manifest.status === 'online';
        entry.manifest.status = 'offline';
        entry.missedHeartbeats++;

        if (wasOnline) {
          this.emit('agent:offline', agentId);
        }
      } else if (timeSinceHeartbeat > this.config.healthCheckInterval * 2) {
        const wasOnline = entry.manifest.status === 'online';
        entry.manifest.status = 'degraded';

        if (wasOnline) {
          this.emit('agent:degraded', agentId);
        }
      }
    }
  }

  /**
   * Cleanup expired/offline agents
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [agentId, entry] of this.agents) {
      const _age = now - entry.registeredAt;
      const timeSinceHeartbeat = now - entry.lastHeartbeat;

      // Remove if TTL exceeded and offline
      if (entry.manifest.status === 'offline' && timeSinceHeartbeat > entry.ttl) {
        this.agents.delete(agentId);
        this.emit('agent:deregistered', agentId, 'ttl-expired');
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.emit('registry:cleanup', removedCount);
    }
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Find agents by trust level
   */
  findByTrust(trustLevel: TrustLevel): AgentManifest[] {
    return this.getAllManifests().filter((m) => m.trustLevel === trustLevel);
  }

  /**
   * Find agents by tag
   */
  findByTag(tag: string): AgentManifest[] {
    return this.getAllManifests().filter((m) => m.tags?.includes(tag));
  }

  /**
   * Find online agents
   */
  findOnline(): AgentManifest[] {
    return this.getAllManifests().filter((m) => m.status === 'online');
  }

  /**
   * Find agents in a scene
   */
  findInScene(scene: string): AgentManifest[] {
    return this.getAllManifests().filter(
      (m) => m.spatialScope?.scene === scene || m.spatialScope?.global
    );
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  /**
   * Export registry state
   */
  export(): {
    agents: AgentManifest[];
    config: RegistryConfig;
    timestamp: number;
  } {
    return {
      agents: this.getAllManifests(),
      config: this.config,
      timestamp: Date.now(),
    };
  }

  /**
   * Import registry state
   */
  async import(data: { agents: AgentManifest[] }): Promise<void> {
    for (const manifest of data.agents) {
      await this.register(manifest);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultRegistry: AgentRegistry | null = null;

/**
 * Get or create the default registry instance
 */
export function getDefaultRegistry(config?: Partial<RegistryConfig>): AgentRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new AgentRegistry(config);
  }
  return defaultRegistry;
}

/**
 * Reset the default registry
 */
export function resetDefaultRegistry(): void {
  if (defaultRegistry) {
    defaultRegistry.stop();
    defaultRegistry.clear();
    defaultRegistry = null;
  }
}
