/**
 * SessionPresenceCoordinator — fourth and final consumer-bus closing
 * Pattern E for the multiplayer-presence trait cluster: SharePlay +
 * SpatialVoice + WorldHeartbeat + Messaging. /stub-audit Phase 3.5
 * found 26 distinct events across these 4 traits with zero downstream
 * listeners (task_1777281302813_eezs).
 *
 * Follows the canonical AssetLoadCoordinator template:
 *   - Duck-typed `EventSource` ({ on(event, handler) })
 *   - Subscribes once at construction to the full presence vocabulary
 *   - Per-domain state aggregates (sessions / voice / messaging / heartbeat)
 *   - Unified `subscribe(listener)` surface for downstream consumers
 *   - Bus discipline: a thrown listener never crashes other listeners
 *
 * **Why these 4 traits share one bus**:
 * They all answer the same question — "who is here, what are they
 * doing, and is the world still alive?" — but from different angles:
 *   - SharePlay: app-level co-presence (sessions, participants)
 *   - SpatialVoice: spatial-audio peer roster (peer joins/leaves, mute, VAD)
 *   - Messaging: external-platform liveness (Discord/Telegram/etc.)
 *   - WorldHeartbeat: world-clock + failover liveness
 * Downstream consumers (lobby UI, peer roster, presence indicators,
 * uptime dashboards, network-quality meters) need a unified view across
 * all of them — exactly what this bus provides.
 *
 * Subscribe via `traitRuntime.sessionPresenceCoordinator.subscribe(listener)`.
 */

/** Duck-typed event source — TraitContextFactory matches this shape. */
export interface SessionPresenceEventSource {
  on(event: string, handler: (payload: unknown) => void): void;
}

/** Domain bucket the bus routes a given event into. */
export type PresenceDomain = 'shareplay' | 'voice' | 'messaging' | 'heartbeat' | 'unknown';

/** SharePlay session status. */
export type SessionStatus = 'idle' | 'started' | 'joined' | 'ended';

/** Tracked SharePlay session. */
export interface SharePlaySessionState {
  sessionId: string;
  status: SessionStatus;
  /** Distinct participant IDs currently in the session. */
  participants: Set<string>;
  /** Activity title, when carried by `shareplay:ready`. */
  activityTitle?: string;
  updatedAt: number;
}

/** Tracked SpatialVoice node (the listener anchor — typically the local user). */
export interface SpatialVoiceState {
  /** Node id the trait is attached to. */
  nodeId: string;
  /** Peer IDs currently joined to the spatial-voice graph for this node. */
  peers: Set<string>;
  muted: boolean;
  /** Last VAD activity ms epoch (0 means never). */
  lastVoiceActivityAt: number;
  updatedAt: number;
}

/** Tracked Messaging platform connection. */
export type MessagingConnectionStatus = 'disconnected' | 'connected' | 'errored';
export interface MessagingConnectionState {
  platform: string;
  status: MessagingConnectionStatus;
  /** Total messages observed received on this platform. */
  messagesReceived: number;
  /** Total messages successfully sent. */
  messagesSent: number;
  /** Last error message when status === 'errored'. */
  error?: string;
  updatedAt: number;
}

/** Tracked WorldHeartbeat liveness. */
export interface HeartbeatState {
  /** Stable id — usually node.id of the node carrying the trait. */
  nodeId: string;
  status: 'initialized' | 'alive' | 'failover' | 'errored';
  /** Total observed ticks. */
  ticks: number;
  /** Last tick ms epoch. */
  lastTickAt: number;
  /** Last error string when status === 'errored'. */
  error?: string;
  updatedAt: number;
}

/** Aggregate stats across all tracked presence state. */
export interface SessionPresenceStats {
  sessions: { active: number; ended: number; participants: number };
  voice: { nodes: number; peers: number; muted: number };
  messaging: { connections: number; connected: number; errored: number };
  heartbeat: { tracked: number; alive: number; failover: number; errored: number };
}

export type SessionPresenceListener = (envelope: SessionPresenceEnvelope) => void;

/** Envelope wrapping one observed event for downstream listeners. */
export interface SessionPresenceEnvelope {
  domain: PresenceDomain;
  event: string;
  payload: unknown;
  observedAt: number;
}

/**
 * Full presence event vocabulary the bus subscribes to. Sourced from
 * emit-call audit (2026-04-27).
 */
const PRESENCE_EVENTS = [
  // --- SharePlay ---
  'shareplay:ready',
  'shareplay:ended',
  'shareplay:started',
  'shareplay:joined',
  'shareplay:participant_joined',
  'shareplay:participant_left',
  'shareplay:state_synced',
  // --- SpatialVoice ---
  'spatial_voice_create',
  'spatial_voice_destroy',
  'spatial_voice_position',
  'spatial_voice_peer_joined',
  'spatial_voice_peer_left',
  'spatial_voice_muted',
  'spatial_voice_unmuted',
  'on_voice_activity',
  // --- Messaging ---
  'messaging_connected',
  'messaging_disconnected',
  'messaging_error',
  'messaging_stats',
  'message_received',
  'message_sent',
  'command_parsed',
  // (`command_<name>` events are dynamic — not subscribed here. Consumers
  // that care about specific commands subscribe directly through the
  // event source.)
  // --- WorldHeartbeat ---
  'heartbeat_initialized',
  'heartbeat_tick',
  'heartbeat_failover',
  'heartbeat_error',
] as const;

export class SessionPresenceCoordinator {
  private sessions = new Map<string, SharePlaySessionState>();
  private voice = new Map<string, SpatialVoiceState>();
  private messaging = new Map<string, MessagingConnectionState>();
  private heartbeats = new Map<string, HeartbeatState>();
  private listeners = new Set<SessionPresenceListener>();

  constructor(source: SessionPresenceEventSource) {
    for (const event of PRESENCE_EVENTS) {
      source.on(event, (payload: unknown) => this.handleEvent(event, payload));
    }
  }

  // ---- Event ingestion ---------------------------------------------------

  private handleEvent(event: string, payload: unknown): void {
    const domain = this.domainFromEvent(event);
    const observedAt = Date.now();

    if (domain === 'shareplay') this.applySharePlayEvent(event, payload, observedAt);
    else if (domain === 'voice') this.applyVoiceEvent(event, payload, observedAt);
    else if (domain === 'messaging') this.applyMessagingEvent(event, payload, observedAt);
    else if (domain === 'heartbeat') this.applyHeartbeatEvent(event, payload, observedAt);

    this.notifyListeners({ domain, event, payload, observedAt });
  }

  private domainFromEvent(event: string): PresenceDomain {
    if (event.startsWith('shareplay:')) return 'shareplay';
    if (event.startsWith('spatial_voice_') || event === 'on_voice_activity') return 'voice';
    if (event.startsWith('messaging_') || event === 'message_received' || event === 'message_sent' || event === 'command_parsed')
      return 'messaging';
    if (event.startsWith('heartbeat_')) return 'heartbeat';
    return 'unknown';
  }

  // ---- SharePlay ---------------------------------------------------------

  private applySharePlayEvent(event: string, payload: unknown, observedAt: number): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;

    // shareplay:ready — activity-title only, no sessionId yet. Treat
    // as observation; downstream listener can read.
    if (event === 'shareplay:ready') return;

    const sessionId = typeof p.sessionId === 'string' ? p.sessionId : undefined;
    if (!sessionId) return;

    const existing = this.sessions.get(sessionId);
    const participants = new Set(existing?.participants ?? []);
    let status: SessionStatus = existing?.status ?? 'idle';

    if (event === 'shareplay:started') status = 'started';
    else if (event === 'shareplay:joined') status = 'joined';
    else if (event === 'shareplay:ended') status = 'ended';
    else if (event === 'shareplay:participant_joined') {
      const pid = typeof p.participantId === 'string' ? p.participantId : undefined;
      if (pid) participants.add(pid);
    } else if (event === 'shareplay:participant_left') {
      const pid = typeof p.participantId === 'string' ? p.participantId : undefined;
      if (pid) participants.delete(pid);
    }
    // shareplay:state_synced is observation-only; carry through to listeners.

    this.sessions.set(sessionId, {
      sessionId,
      status,
      participants,
      activityTitle: existing?.activityTitle,
      updatedAt: observedAt,
    });
  }

  // ---- SpatialVoice ------------------------------------------------------

  private applyVoiceEvent(event: string, payload: unknown, observedAt: number): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const nodeId = typeof p.nodeId === 'string' ? p.nodeId : undefined;

    // spatial_voice_create / spatial_voice_destroy carry nodeId. Mute /
    // unmute / VAD events don't carry nodeId — they apply to "the local
    // listener". For these we update every tracked entry (or no-op when
    // nothing is tracked yet — multi-listener installs are rare and
    // currently not differentiated by the source traits).
    if (event === 'spatial_voice_create' && nodeId) {
      this.voice.set(nodeId, {
        nodeId,
        peers: new Set(),
        muted: false,
        lastVoiceActivityAt: 0,
        updatedAt: observedAt,
      });
      return;
    }
    if (event === 'spatial_voice_destroy' && nodeId) {
      this.voice.delete(nodeId);
      return;
    }

    if (event === 'spatial_voice_peer_joined' && nodeId) {
      const peerId = typeof p.peerId === 'string' ? p.peerId : undefined;
      const existing = this.voice.get(nodeId);
      if (!existing || !peerId) return;
      const peers = new Set(existing.peers);
      peers.add(peerId);
      this.voice.set(nodeId, { ...existing, peers, updatedAt: observedAt });
      return;
    }
    if (event === 'spatial_voice_peer_left' && nodeId) {
      const peerId = typeof p.peerId === 'string' ? p.peerId : undefined;
      const existing = this.voice.get(nodeId);
      if (!existing || !peerId) return;
      const peers = new Set(existing.peers);
      peers.delete(peerId);
      this.voice.set(nodeId, { ...existing, peers, updatedAt: observedAt });
      return;
    }

    // spatial_voice_muted / unmuted / on_voice_activity / spatial_voice_position
    // apply to the local listener. Update all tracked listener nodes
    // uniformly — this is correct for the common single-listener case
    // and harmless for hypothetical multi-listener installs (every
    // listener observes the same local state). See note above.
    for (const existing of this.voice.values()) {
      let next = existing;
      if (event === 'spatial_voice_muted') next = { ...existing, muted: true, updatedAt: observedAt };
      else if (event === 'spatial_voice_unmuted') next = { ...existing, muted: false, updatedAt: observedAt };
      else if (event === 'on_voice_activity')
        next = { ...existing, lastVoiceActivityAt: observedAt, updatedAt: observedAt };
      else continue; // spatial_voice_position — observation only
      this.voice.set(existing.nodeId, next);
    }
  }

  // ---- Messaging ---------------------------------------------------------

  private applyMessagingEvent(event: string, payload: unknown, observedAt: number): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const platform = typeof p.platform === 'string' ? p.platform : undefined;
    if (!platform) return;

    const existing = this.messaging.get(platform) ?? {
      platform,
      status: 'disconnected' as MessagingConnectionStatus,
      messagesReceived: 0,
      messagesSent: 0,
      updatedAt: observedAt,
    };
    let status = existing.status;
    let error = existing.error;
    let received = existing.messagesReceived;
    let sent = existing.messagesSent;

    if (event === 'messaging_connected') {
      status = 'connected';
      error = undefined;
    } else if (event === 'messaging_disconnected') {
      status = 'disconnected';
    } else if (event === 'messaging_error') {
      status = 'errored';
      error = typeof p.error === 'string' ? p.error : 'unknown error';
    } else if (event === 'message_received') {
      received++;
    } else if (event === 'message_sent') {
      sent++;
    } else if (event === 'messaging_stats' || event === 'command_parsed') {
      // Observation only — listener can subscribe directly for these.
    }

    this.messaging.set(platform, {
      platform,
      status,
      messagesReceived: received,
      messagesSent: sent,
      error,
      updatedAt: observedAt,
    });
  }

  // ---- WorldHeartbeat ----------------------------------------------------

  private applyHeartbeatEvent(event: string, payload: unknown, observedAt: number): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const nodeId =
      (typeof p.nodeId === 'string' && p.nodeId) ||
      (typeof p.worldId === 'string' && p.worldId) ||
      (typeof p.id === 'string' && p.id) ||
      undefined;
    if (!nodeId) return;

    const existing = this.heartbeats.get(nodeId) ?? {
      nodeId,
      status: 'initialized' as HeartbeatState['status'],
      ticks: 0,
      lastTickAt: 0,
      updatedAt: observedAt,
    };
    let status = existing.status;
    let ticks = existing.ticks;
    let lastTickAt = existing.lastTickAt;
    let error = existing.error;

    if (event === 'heartbeat_initialized') {
      status = 'initialized';
      error = undefined;
    } else if (event === 'heartbeat_tick') {
      status = 'alive';
      ticks++;
      lastTickAt = observedAt;
    } else if (event === 'heartbeat_failover') {
      status = 'failover';
    } else if (event === 'heartbeat_error') {
      status = 'errored';
      error =
        typeof p.error === 'string' ? p.error : typeof p.message === 'string' ? p.message : 'unknown error';
    }

    this.heartbeats.set(nodeId, { nodeId, status, ticks, lastTickAt, error, updatedAt: observedAt });
  }

  private notifyListeners(envelope: SessionPresenceEnvelope): void {
    for (const listener of this.listeners) {
      try {
        listener(envelope);
      } catch (_) {
        // Bus discipline — see AssetLoadCoordinator.notifyListeners.
      }
    }
  }

  // ---- Public API --------------------------------------------------------

  /** Subscribe to all presence events. Returns an unsubscribe function. */
  subscribe(listener: SessionPresenceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // SharePlay
  getSession(sessionId: string): SharePlaySessionState | undefined {
    const s = this.sessions.get(sessionId);
    return s ? { ...s, participants: new Set(s.participants) } : undefined;
  }
  getAllSessions(): SharePlaySessionState[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s, participants: new Set(s.participants) }));
  }

  // SpatialVoice
  getVoiceNode(nodeId: string): SpatialVoiceState | undefined {
    const v = this.voice.get(nodeId);
    return v ? { ...v, peers: new Set(v.peers) } : undefined;
  }
  getAllVoiceNodes(): SpatialVoiceState[] {
    return Array.from(this.voice.values()).map((v) => ({ ...v, peers: new Set(v.peers) }));
  }

  // Messaging
  getMessagingConnection(platform: string): MessagingConnectionState | undefined {
    return this.messaging.get(platform);
  }
  getAllMessagingConnections(): MessagingConnectionState[] {
    return Array.from(this.messaging.values());
  }

  // Heartbeat
  getHeartbeat(nodeId: string): HeartbeatState | undefined {
    return this.heartbeats.get(nodeId);
  }
  getAllHeartbeats(): HeartbeatState[] {
    return Array.from(this.heartbeats.values());
  }

  getStats(): SessionPresenceStats {
    const sessions = Array.from(this.sessions.values());
    const voice = Array.from(this.voice.values());
    const messaging = Array.from(this.messaging.values());
    const heartbeats = Array.from(this.heartbeats.values());

    const totalParticipants = sessions.reduce((sum, s) => sum + s.participants.size, 0);
    const totalPeers = voice.reduce((sum, v) => sum + v.peers.size, 0);

    return {
      sessions: {
        active: sessions.filter((s) => s.status === 'started' || s.status === 'joined').length,
        ended: sessions.filter((s) => s.status === 'ended').length,
        participants: totalParticipants,
      },
      voice: {
        nodes: voice.length,
        peers: totalPeers,
        muted: voice.filter((v) => v.muted).length,
      },
      messaging: {
        connections: messaging.length,
        connected: messaging.filter((m) => m.status === 'connected').length,
        errored: messaging.filter((m) => m.status === 'errored').length,
      },
      heartbeat: {
        tracked: heartbeats.length,
        alive: heartbeats.filter((h) => h.status === 'alive').length,
        failover: heartbeats.filter((h) => h.status === 'failover').length,
        errored: heartbeats.filter((h) => h.status === 'errored').length,
      },
    };
  }

  /** Clear all tracked state — typically called on world teardown / scene change. */
  reset(): void {
    this.sessions.clear();
    this.voice.clear();
    this.messaging.clear();
    this.heartbeats.clear();
  }

  /** Number of distinct event types this coordinator subscribes to (diagnostic). */
  get subscribedEventCount(): number {
    return PRESENCE_EVENTS.length;
  }
}
