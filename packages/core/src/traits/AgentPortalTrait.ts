/**
 * AgentPortalTrait — v5.0
 *
 * Cross-scene agent communication via WebSocket relay server.
 * Extends MultiAgentTrait's in-scene messaging to federated multi-scene networks.
 *
 * Architecture:
 *   Scene A (MultiAgentTrait) ─┐
 *                               ├─ Portal Relay Server ─┤
 *   Scene B (MultiAgentTrait) ─┘                        └─ Scene C
 *
 * Features:
 *  - Cross-scene unicast and broadcast messaging
 *  - Federated agent discovery (query agents across all connected scenes)
 *  - Agent migration: serialize state + transfer to another scene
 *  - Heartbeat-based scene presence tracking
 *  - Hop-count TTL to prevent infinite message loops
 *
 * Events:
 *  portal:connected      { sceneId, relayUrl }
 *  portal:disconnected   { sceneId, reason }
 *  portal:message_in     { from: { sceneId, agentId }, type, payload }
 *  portal:message_out    { to: { sceneId, agentId }, type, payload }
 *  portal:scene_discovered  { sceneId, agentCount, capabilities }
 *  portal:scene_lost        { sceneId, reason }
 *  portal:agent_migrated    { agentId, fromScene, toScene }
 *  portal:federation_query  { capability, results: RemoteAgent[] }
 *
 * @version 5.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Identifies an agent across the federation */
export interface FederatedAgentId {
  sceneId: string;
  agentId: string;
}

/** Portal message envelope for cross-scene communication */
export interface PortalMessage {
  id: string;
  from: FederatedAgentId;
  to: FederatedAgentId | null; // null = broadcast
  type: string;
  payload: unknown;
  timestamp: number;
  ttl: number;
  hopCount: number;
  correlationId?: string;
}

/** Discovery info about a remote scene */
export interface RemoteScene {
  sceneId: string;
  name: string;
  agentCount: number;
  capabilities: string[];
  lastHeartbeat: number;
  latencyMs: number;
}

/** Discovery info about a remote agent */
export interface RemoteAgent {
  sceneId: string;
  agentId: string;
  name: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'busy';
}

/** Serialized agent state for migration */
export interface AgentMigrationPacket {
  agentId: string;
  name: string;
  capabilities: string[];
  memory: Record<string, unknown>;
  state: Record<string, unknown>;
  sourceScene: string;
  targetScene: string;
  timestamp: number;
}

// =============================================================================
// CONFIG & STATE
// =============================================================================

export interface PortalConfig {
  /** This scene's unique ID */
  scene_id: string;
  /** This scene's display name */
  scene_name: string;
  /** This agent's ID within the scene */
  agent_id: string;
  /** This agent's capabilities */
  capabilities: string[];
  /** Relay server URL (WebSocket) */
  relay_url: string;
  /** Auth token for relay */
  auth_token: string;
  /** Reconnect on disconnect */
  auto_reconnect: boolean;
  /** Reconnect delay (ms) */
  reconnect_delay: number;
  /** Max reconnect attempts (0 = infinite) */
  max_reconnect_attempts: number;
  /** Scene heartbeat interval (ms) */
  heartbeat_interval: number;
  /** Scene offline threshold (missed heartbeats) */
  offline_threshold: number;
  /** Max hops for messages to prevent loops */
  max_hop_count: number;
  /** Default message TTL (ms) */
  default_ttl: number;
  /** Max queued outbound messages */
  max_outbox_size: number;
}

export interface PortalState {
  /** Connection status */
  connected: boolean;
  /** Known remote scenes */
  scenes: Map<string, RemoteScene>;
  /** Known remote agents */
  remoteAgents: Map<string, RemoteAgent>;
  /** Inbound message queue */
  inbox: PortalMessage[];
  /** Outbound message queue (when disconnected) */
  outbox: PortalMessage[];
  /** Pending migration packets */
  pendingMigrations: AgentMigrationPacket[];
  /** Reconnect attempt counter */
  reconnectAttempts: number;
  /** Heartbeat accumulator (seconds) */
  heartbeatAccumulator: number;
  /** Message ID counter */
  messageCounter: number;
  /** Total messages sent */
  totalSent: number;
  /** Total messages received */
  totalReceived: number;
  /** Total migrations */
  totalMigrations: number;
  /** WebSocket reference (opaque — platform provides) */
  ws: unknown | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateMessageId(state: PortalState): string {
  return `pm_${Date.now()}_${state.messageCounter++}`;
}

function isExpired(msg: PortalMessage): boolean {
  return Date.now() - msg.timestamp > msg.ttl;
}

function isSceneOffline(scene: RemoteScene, thresholdMs: number): boolean {
  return Date.now() - scene.lastHeartbeat > thresholdMs;
}

function createPortalMessage(
  state: PortalState,
  config: PortalConfig,
  to: FederatedAgentId | null,
  type: string,
  payload: unknown,
): PortalMessage {
  return {
    id: generateMessageId(state),
    from: { sceneId: config.scene_id, agentId: config.agent_id },
    to,
    type,
    payload,
    timestamp: Date.now(),
    ttl: config.default_ttl,
    hopCount: 0,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const agentPortalHandler: TraitHandler<PortalConfig> = {
  name: 'agent_portal' as any,

  defaultConfig: {
    scene_id: '',
    scene_name: 'Untitled Scene',
    agent_id: '',
    capabilities: [],
    relay_url: 'ws://localhost:4200/portal',
    auth_token: '',
    auto_reconnect: true,
    reconnect_delay: 3000,
    max_reconnect_attempts: 10,
    heartbeat_interval: 30000,
    offline_threshold: 3,
    max_hop_count: 5,
    default_ttl: 60000,
    max_outbox_size: 200,
  },

  // ===========================================================================
  // onAttach — initialize portal state, attempt relay connection
  // ===========================================================================
  onAttach(node: any, config: PortalConfig, context: any): void {
    const state: PortalState = {
      connected: false,
      scenes: new Map(),
      remoteAgents: new Map(),
      inbox: [],
      outbox: [],
      pendingMigrations: [],
      reconnectAttempts: 0,
      heartbeatAccumulator: 0,
      messageCounter: 0,
      totalSent: 0,
      totalReceived: 0,
      totalMigrations: 0,
      ws: null,
    };

    node.__portalState = state;

    // Emit ready event — actual WebSocket connection is platform-provided
    context.emit?.('portal:init', {
      sceneId: config.scene_id,
      sceneName: config.scene_name,
      agentId: config.agent_id,
      relayUrl: config.relay_url,
      capabilities: config.capabilities,
    });
  },

  // ===========================================================================
  // onDetach — disconnect and cleanup
  // ===========================================================================
  onDetach(node: any, config: PortalConfig, context: any): void {
    const state: PortalState | undefined = node.__portalState;
    if (!state) return;

    // Notify federation of departure
    if (state.connected) {
      context.emit?.('portal:disconnecting', {
        sceneId: config.scene_id,
        agentId: config.agent_id,
      });
    }

    state.connected = false;
    state.scenes.clear();
    state.remoteAgents.clear();
    state.inbox = [];
    state.outbox = [];
    state.pendingMigrations = [];
    state.ws = null;

    context.emit?.('portal:disconnected', {
      sceneId: config.scene_id,
      reason: 'detached',
    });

    delete node.__portalState;
  },

  // ===========================================================================
  // onUpdate — heartbeat, prune offline scenes, process inbox
  // ===========================================================================
  onUpdate(node: any, config: PortalConfig, context: any, delta: number): void {
    const state: PortalState | undefined = node.__portalState;
    if (!state) return;

    // Heartbeat accumulator
    state.heartbeatAccumulator += delta * 1000;
    if (state.heartbeatAccumulator >= config.heartbeat_interval) {
      state.heartbeatAccumulator = 0;

      if (state.connected) {
        // Send heartbeat to relay
        context.emit?.('portal:heartbeat', {
          sceneId: config.scene_id,
          agentCount: 1, // This scene's local agent count
          capabilities: config.capabilities,
          timestamp: Date.now(),
        });
      }
    }

    // Prune offline scenes
    const offlineThresholdMs = config.heartbeat_interval * config.offline_threshold;
    for (const [id, scene] of state.scenes) {
      if (isSceneOffline(scene, offlineThresholdMs)) {
        state.scenes.delete(id);
        // Remove agents from that scene
        for (const [agentKey, agent] of state.remoteAgents) {
          if (agent.sceneId === id) {
            state.remoteAgents.delete(agentKey);
          }
        }
        context.emit?.('portal:scene_lost', {
          sceneId: id,
          reason: 'heartbeat_timeout',
        });
      }
    }

    // Process inbox — deliver messages to local agent system
    while (state.inbox.length > 0) {
      const msg = state.inbox.shift()!;

      // Skip expired or over-hop messages
      if (isExpired(msg) || msg.hopCount > config.max_hop_count) continue;

      state.totalReceived++;
      context.emit?.('portal:message_in', {
        from: msg.from,
        type: msg.type,
        payload: msg.payload,
        id: msg.id,
        correlationId: msg.correlationId,
      });
    }

    // Process pending migrations
    while (state.pendingMigrations.length > 0) {
      const packet = state.pendingMigrations.shift()!;
      context.emit?.('portal:agent_arrived', {
        agentId: packet.agentId,
        name: packet.name,
        capabilities: packet.capabilities,
        memory: packet.memory,
        state: packet.state,
        sourceScene: packet.sourceScene,
      });
    }
  },

  // ===========================================================================
  // onEvent — handle portal events
  // ===========================================================================
  onEvent(node: any, config: PortalConfig, context: any, event: any): void {
    const state: PortalState | undefined = node.__portalState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? (event as any);

    switch (eventType) {
      // ─── Connection lifecycle (platform-triggered) ───────────────────
      case 'portal:ws_connected': {
        state.connected = true;
        state.reconnectAttempts = 0;
        context.emit?.('portal:connected', {
          sceneId: config.scene_id,
          relayUrl: config.relay_url,
        });

        // Flush outbox
        while (state.outbox.length > 0 && state.connected) {
          const msg = state.outbox.shift()!;
          if (!isExpired(msg)) {
            state.totalSent++;
            context.emit?.('portal:relay_send', msg);
          }
        }
        break;
      }

      case 'portal:ws_disconnected': {
        state.connected = false;
        const reason = payload?.reason ?? 'unknown';
        context.emit?.('portal:disconnected', {
          sceneId: config.scene_id,
          reason,
        });

        // Auto-reconnect
        if (config.auto_reconnect) {
          if (config.max_reconnect_attempts === 0 || state.reconnectAttempts < config.max_reconnect_attempts) {
            state.reconnectAttempts++;
            context.emit?.('portal:reconnecting', {
              attempt: state.reconnectAttempts,
              delayMs: config.reconnect_delay,
            });
          }
        }
        break;
      }

      // ─── Outbound messaging ──────────────────────────────────────────
      case 'portal:send': {
        const msg = createPortalMessage(
          state, config,
          payload.to ?? null,
          payload.messageType ?? 'data',
          payload.data,
        );
        if (payload.correlationId) msg.correlationId = payload.correlationId;

        if (state.connected) {
          state.totalSent++;
          context.emit?.('portal:relay_send', msg);
        } else if (state.outbox.length < config.max_outbox_size) {
          state.outbox.push(msg);
        }

        context.emit?.('portal:message_out', {
          to: msg.to,
          type: msg.type,
          payload: msg.payload,
          id: msg.id,
        });
        break;
      }

      case 'portal:broadcast': {
        const msg = createPortalMessage(
          state, config,
          null, // broadcast
          payload.messageType ?? 'broadcast',
          payload.data,
        );

        if (state.connected) {
          state.totalSent++;
          context.emit?.('portal:relay_send', msg);
        } else if (state.outbox.length < config.max_outbox_size) {
          state.outbox.push(msg);
        }
        break;
      }

      // ─── Inbound from relay (platform pushes these) ──────────────────
      case 'portal:relay_message': {
        const inMsg = payload as PortalMessage;
        if (inMsg && !isExpired(inMsg) && inMsg.hopCount <= config.max_hop_count) {
          state.inbox.push({ ...inMsg, hopCount: inMsg.hopCount + 1 });
        }
        break;
      }

      // ─── Scene discovery (relay pushes scene presence) ────────────────
      case 'portal:scene_announce': {
        const sceneInfo: RemoteScene = {
          sceneId: payload.sceneId,
          name: payload.sceneName ?? payload.sceneId,
          agentCount: payload.agentCount ?? 0,
          capabilities: payload.capabilities ?? [],
          lastHeartbeat: Date.now(),
          latencyMs: payload.latencyMs ?? 0,
        };

        const isNew = !state.scenes.has(sceneInfo.sceneId);
        state.scenes.set(sceneInfo.sceneId, sceneInfo);

        if (isNew) {
          context.emit?.('portal:scene_discovered', {
            sceneId: sceneInfo.sceneId,
            name: sceneInfo.name,
            agentCount: sceneInfo.agentCount,
            capabilities: sceneInfo.capabilities,
          });
        }
        break;
      }

      // ─── Federation queries ───────────────────────────────────────────
      case 'portal:query_agents': {
        const capability = payload?.capability as string;
        const results: RemoteAgent[] = [];

        for (const agent of state.remoteAgents.values()) {
          if (!capability || agent.capabilities.includes(capability)) {
            results.push(agent);
          }
        }

        context.emit?.('portal:federation_query', {
          capability,
          results,
          totalScenes: state.scenes.size,
        });
        break;
      }

      // ─── Agent registry update from relay ─────────────────────────────
      case 'portal:remote_agents': {
        const agents = payload?.agents as RemoteAgent[] ?? [];
        for (const agent of agents) {
          const key = `${agent.sceneId}:${agent.agentId}`;
          state.remoteAgents.set(key, agent);
        }
        break;
      }

      // ─── Agent migration ──────────────────────────────────────────────
      case 'portal:migrate_out': {
        const packet: AgentMigrationPacket = {
          agentId: payload.agentId,
          name: payload.name ?? payload.agentId,
          capabilities: payload.capabilities ?? [],
          memory: payload.memory ?? {},
          state: payload.state ?? {},
          sourceScene: config.scene_id,
          targetScene: payload.targetScene,
          timestamp: Date.now(),
        };

        state.totalMigrations++;
        context.emit?.('portal:agent_migrated', {
          agentId: packet.agentId,
          fromScene: config.scene_id,
          toScene: payload.targetScene,
        });

        // Send migration packet through relay
        const migrationMsg = createPortalMessage(
          state, config,
          { sceneId: payload.targetScene, agentId: '__portal__' },
          'agent_migration',
          packet,
        );

        if (state.connected) {
          state.totalSent++;
          context.emit?.('portal:relay_send', migrationMsg);
        } else {
          state.outbox.push(migrationMsg);
        }
        break;
      }

      case 'portal:migrate_in': {
        const packet = payload as AgentMigrationPacket;
        if (packet && packet.targetScene === config.scene_id) {
          state.pendingMigrations.push(packet);
        }
        break;
      }

      // ─── Stats query ──────────────────────────────────────────────────
      case 'portal:get_stats': {
        context.emit?.('portal:stats', {
          connected: state.connected,
          sceneCount: state.scenes.size,
          remoteAgentCount: state.remoteAgents.size,
          outboxSize: state.outbox.length,
          totalSent: state.totalSent,
          totalReceived: state.totalReceived,
          totalMigrations: state.totalMigrations,
          reconnectAttempts: state.reconnectAttempts,
        });
        break;
      }
    }
  },
};

export default agentPortalHandler;
