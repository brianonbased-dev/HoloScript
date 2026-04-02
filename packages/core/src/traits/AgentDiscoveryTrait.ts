/**
 * Agent Discovery Trait
 *
 * Enables nodes to discover, register with, and communicate with
 * the AgentRegistry for multi-agent choreography.
 *
 * Part of HoloScript v3.1 Agentic Choreography.
 *
 * Features:
 * - Agent registration with capabilities
 * - Peer discovery via capability queries
 * - Automatic heartbeat management
 * - Discovery events and callbacks
 * - Spatial scope awareness
 *
 * @version 3.1.0
 * @milestone v3.1 (March 2026)
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type {
  AgentManifest,
  AgentCapability,
  AgentEndpoint,
  SpatialScope,
  TrustLevel,
} from '../agents/AgentManifest';
import type { CapabilityQuery } from '../agents/CapabilityMatcher';
import { AgentRegistry, getDefaultRegistry, type RegistryConfig } from '../agents/AgentRegistry';

// =============================================================================
// TYPES
// =============================================================================

type DiscoveryMode = 'passive' | 'active' | 'broadcast';
type RegistrationStatus = 'unregistered' | 'registering' | 'registered' | 'failed';

interface DiscoveredAgent {
  manifest: AgentManifest;
  discoveredAt: number;
  matchScore: number;
  lastSeen: number;
  connectionStatus: 'unknown' | 'connected' | 'disconnected' | 'error';
}

interface DiscoveryEvent {
  type: 'discovered' | 'lost' | 'updated' | 'connected' | 'disconnected';
  agent: AgentManifest;
  timestamp: number;
  reason?: string;
}

interface AgentDiscoveryState {
  registrationStatus: RegistrationStatus;
  manifest: AgentManifest | null;
  discoveredAgents: Map<string, DiscoveredAgent>;
  activeQueries: Map<string, CapabilityQuery>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  discoveryTimer: ReturnType<typeof setInterval> | null;
  eventHistory: DiscoveryEvent[];
  registry: AgentRegistry | null;
}

interface AgentDiscoveryConfig {
  /** Unique agent ID (auto-generated if not provided) */
  agent_id: string;
  /** Agent name */
  agent_name: string;
  /** Agent version */
  agent_version: string;
  /** Agent description */
  description: string;
  /** Capabilities this agent provides */
  capabilities: AgentCapability[];
  /** Communication endpoints */
  endpoints: AgentEndpoint[];
  /** Spatial scope */
  spatial_scope: SpatialScope | null;
  /** Trust level */
  trust_level: TrustLevel;
  /** Discovery mode */
  discovery_mode: DiscoveryMode;
  /** Heartbeat interval (ms) */
  heartbeat_interval: number;
  /** Discovery poll interval (ms) */
  discovery_interval: number;
  /** Auto-register on attach */
  auto_register: boolean;
  /** Auto-discover peers on attach */
  auto_discover: boolean;
  /** Default capability query for discovery */
  default_query: CapabilityQuery | null;
  /** Maximum discovered agents to track */
  max_discovered_agents: number;
  /** Event history limit */
  event_history_limit: number;
  /** Custom registry config (uses default if null) */
  registry_config: Partial<RegistryConfig> | null;
  /** Tags for this agent */
  tags: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function createManifest(nodeId: string, config: AgentDiscoveryConfig): AgentManifest {
  return {
    id: config.agent_id || generateAgentId(),
    name: config.agent_name || `Agent_${nodeId}`,
    version: config.agent_version,
    description: config.description,
    capabilities: config.capabilities,
    endpoints: config.endpoints,
    spatialScope: config.spatial_scope || undefined,
    trustLevel: config.trust_level,
    tags: config.tags,
    status: 'unknown',
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const agentDiscoveryHandler: TraitHandler<AgentDiscoveryConfig> = {
  name: 'agent_discovery',

  defaultConfig: {
    agent_id: '',
    agent_name: '',
    agent_version: '1.0.0',
    description: '',
    capabilities: [],
    endpoints: [
      {
        protocol: 'local',
        address: 'in-process',
        primary: true,
      },
    ],
    spatial_scope: null,
    trust_level: 'local',
    discovery_mode: 'active',
    heartbeat_interval: 10000, // 10 seconds
    discovery_interval: 30000, // 30 seconds
    auto_register: true,
    auto_discover: true,
    default_query: null,
    max_discovered_agents: 100,
    event_history_limit: 1000,
    registry_config: null,
    tags: [],
  },

  onAttach(node, config, context) {
    // Initialize state
    const state: AgentDiscoveryState = {
      registrationStatus: 'unregistered',
      manifest: null,
      discoveredAgents: new Map(),
      activeQueries: new Map(),
      heartbeatTimer: null,
      discoveryTimer: null,
      eventHistory: [],
      registry: null,
    };
    node.__agentDiscoveryState = state;

    // Get or create registry
    state.registry = getDefaultRegistry(config.registry_config || undefined);

    // Create manifest
    const nodeId = (node as any).id || 'unknown';
    state.manifest = createManifest(nodeId, config);

    // Auto-register if enabled
    if (config.auto_register) {
      registerAgent(state, config, context);
    }

    // Start heartbeat timer
    if (config.heartbeat_interval > 0) {
      state.heartbeatTimer = setInterval(() => {
        sendHeartbeat(state, context);
      }, config.heartbeat_interval);
    }

    // Start discovery timer
    if (config.auto_discover && config.discovery_interval > 0) {
      state.discoveryTimer = setInterval(() => {
        discoverPeers(state, config, context);
      }, config.discovery_interval);

      // Initial discovery
      discoverPeers(state, config, context);
    }

    context.emit?.('agent_discovery_initialized', {
      node,
      manifest: state.manifest,
      mode: config.discovery_mode,
    });
  },

  onDetach(node, config, context) {
    const state = node.__agentDiscoveryState as AgentDiscoveryState;
    if (!state) return;

    // Stop timers
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
    if (state.discoveryTimer) {
      clearInterval(state.discoveryTimer);
      state.discoveryTimer = null;
    }

    // Deregister from registry
    if (state.registry && state.manifest && state.registrationStatus === 'registered') {
      state.registry.deregister(state.manifest.id).catch((err) => {
        context.emit?.('agent_discovery_error', {
          error: 'deregister_failed',
          message: String(err),
        });
      });
    }

    context.emit?.('agent_discovery_detached', {
      node,
      agentId: state.manifest?.id,
    });

    delete node.__agentDiscoveryState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__agentDiscoveryState as AgentDiscoveryState;
    if (!state) return;

    // Heartbeat on each update cycle if registered
    if (state.registrationStatus === 'registered') {
      sendHeartbeat(state, context);
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__agentDiscoveryState as AgentDiscoveryState;
    if (!state) return;

    // Handle custom agent discovery events
    const eventType = (event as Record<string, unknown>).type as string;

    switch (eventType) {
      case 'agent_register':
        registerAgent(state, config, context);
        break;

      case 'agent_deregister':
        deregisterAgent(state, context);
        break;

      case 'agent_discover':
        discoverPeers(state, config, context);
        break;

      case 'agent_query': {
        const query = (event as Record<string, unknown>).query as CapabilityQuery;
        if (query) {
          runQuery(state, query, context);
        }
        break;
      }

      case 'agent_get_discovered':
        returnDiscoveredAgents(state, context);
        break;

      case 'agent_get_status':
        returnStatus(state, context);
        break;
    }
  },
};

// =============================================================================
// INTERNAL FUNCTIONS
// =============================================================================

async function registerAgent(
  state: AgentDiscoveryState,
  config: AgentDiscoveryConfig,
  context: TraitContext
): Promise<void> {
  if (!state.registry || !state.manifest) return;

  state.registrationStatus = 'registering';

  try {
    await state.registry.register(state.manifest);
    state.registrationStatus = 'registered';
    state.manifest.status = 'online';

    context.emit?.('agent_registered', {
      agentId: state.manifest.id,
      name: state.manifest.name,
      capabilities: state.manifest.capabilities.length,
    });
  } catch (error) {
    state.registrationStatus = 'failed';

    context.emit?.('agent_discovery_error', {
      error: 'registration_failed',
      message: String(error),
    });
  }
}

async function deregisterAgent(state: AgentDiscoveryState, context: TraitContext): Promise<void> {
  if (!state.registry || !state.manifest) return;

  try {
    await state.registry.deregister(state.manifest.id);
    state.registrationStatus = 'unregistered';
    state.manifest.status = 'offline';

    context.emit?.('agent_deregistered', {
      agentId: state.manifest.id,
    });
  } catch (error) {
    context.emit?.('agent_discovery_error', {
      error: 'deregistration_failed',
      message: String(error),
    });
  }
}

async function sendHeartbeat(state: AgentDiscoveryState, context: TraitContext): Promise<void> {
  if (!state.registry || !state.manifest || state.registrationStatus !== 'registered') {
    return;
  }

  try {
    await state.registry.heartbeat(state.manifest.id);
  } catch (error) {
    // Agent may have been removed - try re-registering
    state.registrationStatus = 'unregistered';
    context.emit?.('agent_discovery_error', {
      error: 'heartbeat_failed',
      message: String(error),
    });
  }
}

async function discoverPeers(
  state: AgentDiscoveryState,
  config: AgentDiscoveryConfig,
  context: TraitContext
): Promise<void> {
  if (!state.registry) return;

  const query = config.default_query || {};

  try {
    const matches = await state.registry.discoverWithScores(query);
    const now = Date.now();

    // Track which agents we've seen
    const seenIds = new Set<string>();

    for (const match of matches) {
      // Skip self
      if (match.manifest.id === state.manifest?.id) continue;

      seenIds.add(match.manifest.id);

      const existing = state.discoveredAgents.get(match.manifest.id);
      if (existing) {
        // Update existing
        existing.manifest = match.manifest;
        existing.matchScore = match.score;
        existing.lastSeen = now;
      } else {
        // New discovery
        if (state.discoveredAgents.size < config.max_discovered_agents) {
          state.discoveredAgents.set(match.manifest.id, {
            manifest: match.manifest,
            discoveredAt: now,
            matchScore: match.score,
            lastSeen: now,
            connectionStatus: 'unknown',
          });

          addDiscoveryEvent(state, config, {
            type: 'discovered',
            agent: match.manifest,
            timestamp: now,
          });

          context.emit?.('peer_discovered', {
            agent: match.manifest,
            score: match.score,
          });
        }
      }
    }

    // Check for lost agents
    for (const [id, agent] of state.discoveredAgents) {
      if (!seenIds.has(id)) {
        addDiscoveryEvent(state, config, {
          type: 'lost',
          agent: agent.manifest,
          timestamp: now,
          reason: 'not_in_discovery',
        });

        context.emit?.('peer_lost', {
          agentId: id,
          name: agent.manifest.name,
        });

        state.discoveredAgents.delete(id);
      }
    }
  } catch (error) {
    context.emit?.('agent_discovery_error', {
      error: 'discovery_failed',
      message: String(error),
    });
  }
}

async function runQuery(
  state: AgentDiscoveryState,
  query: CapabilityQuery,
  context: TraitContext
): Promise<void> {
  if (!state.registry) return;

  try {
    const matches = await state.registry.discoverWithScores(query);

    context.emit?.('query_result', {
      query,
      matches: matches.map((m) => ({
        id: m.manifest.id,
        name: m.manifest.name,
        score: m.score,
        capabilities: m.capabilities.length,
      })),
      count: matches.length,
    });
  } catch (error) {
    context.emit?.('agent_discovery_error', {
      error: 'query_failed',
      message: String(error),
    });
  }
}

function addDiscoveryEvent(
  state: AgentDiscoveryState,
  config: AgentDiscoveryConfig,
  event: DiscoveryEvent
): void {
  state.eventHistory.push(event);

  // Trim history
  while (state.eventHistory.length > config.event_history_limit) {
    state.eventHistory.shift();
  }
}

function returnDiscoveredAgents(state: AgentDiscoveryState, context: TraitContext): void {
  const agents = Array.from(state.discoveredAgents.values()).map((d) => ({
    id: d.manifest.id,
    name: d.manifest.name,
    score: d.matchScore,
    lastSeen: d.lastSeen,
    status: d.connectionStatus,
  }));

  context.emit?.('discovered_agents', {
    agents,
    count: agents.length,
  });
}

function returnStatus(state: AgentDiscoveryState, context: TraitContext): void {
  context.emit?.('discovery_status', {
    registrationStatus: state.registrationStatus,
    agentId: state.manifest?.id,
    agentName: state.manifest?.name,
    discoveredCount: state.discoveredAgents.size,
    eventCount: state.eventHistory.length,
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { AgentDiscoveryConfig, AgentDiscoveryState, DiscoveredAgent, DiscoveryEvent };
