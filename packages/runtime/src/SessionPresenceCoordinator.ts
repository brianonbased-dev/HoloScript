/**
 * @holoscript/runtime - SessionPresenceCoordinator
 *
 * Consumes session/presence events emitted by SharePlay, SpatialVoice,
 * WorldHeartbeat, and Messaging traits (Pattern E consumer infrastructure).
 * Bridges them to a unified presence registry so components and services can
 * observe live multiplayer session state without coupling to individual traits.
 *
 * Pattern E consumer infrastructure — closes the missing listener side for 4 traits.
 */

import type { EventBus } from './events.js';

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export interface SharePlayEvent {
  sessionId: string;
  localPeerId?: string;
  remotePeerId?: string;
  metadata?: Record<string, unknown>;
}

export interface SpatialVoiceEvent {
  peerId: string;
  node?: string;
  active: boolean;
  volume?: number;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
}

export interface HeartbeatEvent {
  sourceId: string;
  targetId?: string;
  timestamp: number;
  latencyMs?: number;
}

export interface MessagingEvent {
  messageId: string;
  fromPeerId: string;
  toPeerId?: string; // undefined = broadcast
  payload: unknown;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Internal records
// ---------------------------------------------------------------------------

export interface SessionRecord {
  sessionId: string;
  localPeerId?: string;
  status: 'active' | 'ended';
  startedAt: number;
  endedAt?: number;
  peers: Set<string>;
}

export interface PeerRecord {
  peerId: string;
  sessionId: string;
  joinedAt: number;
  leftAt?: number;
  voiceActive: boolean;
  voiceVolume?: number;
  position?: { x: number; y: number; z: number };
}

export interface HeartbeatStatus {
  sourceId: string;
  lastPingAt: number;
  lastPongAt?: number;
  latencyMs?: number;
  timedOut: boolean;
}

// ---------------------------------------------------------------------------
// Options & handlers
// ---------------------------------------------------------------------------

export type PeerHandler = (peer: PeerRecord) => void;
export type MessageHandler = (msg: MessagingEvent) => void;
export type HeartbeatHandler = (status: HeartbeatStatus) => void;

export interface SessionPresenceCoordinatorOptions {
  bus: EventBus;
  /** Heartbeat timeout in ms. Default 30 000. */
  heartbeatTimeoutMs?: number;
  /** Max retained ended sessions. Default 50. */
  maxEndedSessions?: number;
  /** Max retained messages per peer. Default 100. */
  maxMessagesPerPeer?: number;
  onPeerJoined?: PeerHandler;
  onPeerLeft?: PeerHandler;
  onHeartbeatTimeout?: HeartbeatHandler;
  onMessageReceived?: MessageHandler;
}

// ---------------------------------------------------------------------------
// SessionPresenceCoordinator
// ---------------------------------------------------------------------------

/**
 * Unified presence tracker for SharePlay, SpatialVoice, WorldHeartbeat, and
 * Messaging trait events.
 *
 * ```ts
 * import { eventBus } from '@holoscript/runtime';
 * const presence = new SessionPresenceCoordinator({ bus: eventBus });
 * presence.start();
 *
 * presence.onPeerJoined((peer) => renderPeerAvatar(peer.peerId));
 * const active = presence.getActivePeers();
 * ```
 */
export class SessionPresenceCoordinator {
  private readonly bus: EventBus;
  private readonly opts: SessionPresenceCoordinatorOptions;
  private readonly heartbeatTimeoutMs: number;
  private readonly maxEndedSessions: number;
  private readonly maxMessagesPerPeer: number;

  private sessions = new Map<string, SessionRecord>();
  private peers = new Map<string, PeerRecord>();
  private heartbeats = new Map<string, HeartbeatStatus>();
  private messages = new Map<string, MessagingEvent[]>(); // keyed by fromPeerId

  private peerJoinedHandlers = new Set<PeerHandler>();
  private peerLeftHandlers = new Set<PeerHandler>();
  private heartbeatTimeoutHandlers = new Set<HeartbeatHandler>();
  private messageHandlers = new Set<MessageHandler>();

  private unsubscribers: Array<() => void> = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private _started = false;

  constructor(options: SessionPresenceCoordinatorOptions) {
    this.bus = options.bus;
    this.opts = options;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 30_000;
    this.maxEndedSessions = options.maxEndedSessions ?? 50;
    this.maxMessagesPerPeer = options.maxMessagesPerPeer ?? 100;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    if (this._started) return;
    this._started = true;

    // SharePlay
    this.unsubscribers.push(
      this.bus.on<SharePlayEvent>('shareplay:session_started', (e) =>
        this.onSessionStarted(e)
      )
    );
    this.unsubscribers.push(
      this.bus.on<SharePlayEvent>('shareplay:peer_joined', (e) => this.onPeerJoined(e))
    );
    this.unsubscribers.push(
      this.bus.on<SharePlayEvent>('shareplay:peer_left', (e) => this.onPeerLeft(e))
    );
    this.unsubscribers.push(
      this.bus.on<SharePlayEvent>('shareplay:session_ended', (e) =>
        this.onSessionEnded(e)
      )
    );

    // SpatialVoice
    this.unsubscribers.push(
      this.bus.on<SpatialVoiceEvent>('spatial_voice:started', (e) =>
        this.onVoiceChange(e, true)
      )
    );
    this.unsubscribers.push(
      this.bus.on<SpatialVoiceEvent>('spatial_voice:stopped', (e) =>
        this.onVoiceChange(e, false)
      )
    );
    this.unsubscribers.push(
      this.bus.on<SpatialVoiceEvent>('spatial_voice:peer_speaking', (e) =>
        this.onPeerSpeaking(e)
      )
    );

    // WorldHeartbeat
    this.unsubscribers.push(
      this.bus.on<HeartbeatEvent>('world_heartbeat:ping', (e) => this.onPing(e))
    );
    this.unsubscribers.push(
      this.bus.on<HeartbeatEvent>('world_heartbeat:pong', (e) => this.onPong(e))
    );
    this.unsubscribers.push(
      this.bus.on<HeartbeatEvent>('world_heartbeat:timeout', (e) =>
        this.onHeartbeatTimeout(e)
      )
    );

    // Messaging
    this.unsubscribers.push(
      this.bus.on<MessagingEvent>('messaging:send', (e) => this.onMessageSend(e))
    );
    this.unsubscribers.push(
      this.bus.on<MessagingEvent>('messaging:receive', (e) => this.onMessageReceive(e))
    );
    this.unsubscribers.push(
      this.bus.on<MessagingEvent>('messaging:delivered', (e) =>
        this.onMessageDelivered(e)
      )
    );

    // Heartbeat watchdog
    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), 5_000);
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this._started = false;
  }

  // -------------------------------------------------------------------------
  // SharePlay handlers
  // -------------------------------------------------------------------------

  private onSessionStarted(e: SharePlayEvent): void {
    this.sessions.set(e.sessionId, {
      sessionId: e.sessionId,
      localPeerId: e.localPeerId,
      status: 'active',
      startedAt: Date.now(),
      peers: new Set(),
    });
    this.bus.emit('presence:session_started', e);
  }

  private onPeerJoined(e: SharePlayEvent): void {
    const peerId = e.remotePeerId ?? e.localPeerId;
    if (!peerId) return;
    const peer: PeerRecord = {
      peerId,
      sessionId: e.sessionId,
      joinedAt: Date.now(),
      voiceActive: false,
    };
    this.peers.set(peerId, peer);
    const session = this.sessions.get(e.sessionId);
    if (session) session.peers.add(peerId);
    this.opts.onPeerJoined?.(peer);
    this.peerJoinedHandlers.forEach((h) => h(peer));
    this.bus.emit('presence:peer_joined', peer);
  }

  private onPeerLeft(e: SharePlayEvent): void {
    const peerId = e.remotePeerId ?? e.localPeerId;
    if (!peerId) return;
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.leftAt = Date.now();
    const session = this.sessions.get(e.sessionId);
    if (session) session.peers.delete(peerId);
    this.opts.onPeerLeft?.(peer);
    this.peerLeftHandlers.forEach((h) => h(peer));
    this.bus.emit('presence:peer_left', peer);
    this.peers.delete(peerId);
  }

  private onSessionEnded(e: SharePlayEvent): void {
    const session = this.sessions.get(e.sessionId);
    if (!session) return;
    session.status = 'ended';
    session.endedAt = Date.now();
    this.pruneEndedSessions();
    this.bus.emit('presence:session_ended', session);
  }

  // -------------------------------------------------------------------------
  // SpatialVoice handlers
  // -------------------------------------------------------------------------

  private onVoiceChange(e: SpatialVoiceEvent, active: boolean): void {
    let peer = this.peers.get(e.peerId);
    if (!peer) {
      peer = { peerId: e.peerId, sessionId: '', joinedAt: Date.now(), voiceActive: false };
      this.peers.set(e.peerId, peer);
    }
    peer.voiceActive = active;
    if (e.volume !== undefined) peer.voiceVolume = e.volume;
    this.bus.emit('presence:voice_change', { peerId: e.peerId, active });
  }

  private onPeerSpeaking(e: SpatialVoiceEvent): void {
    const peer = this.peers.get(e.peerId);
    if (!peer) return;
    if (e.positionX !== undefined) {
      peer.position = {
        x: e.positionX ?? 0,
        y: e.positionY ?? 0,
        z: e.positionZ ?? 0,
      };
    }
    this.bus.emit('presence:peer_speaking', peer);
  }

  // -------------------------------------------------------------------------
  // WorldHeartbeat handlers
  // -------------------------------------------------------------------------

  private onPing(e: HeartbeatEvent): void {
    this.heartbeats.set(e.sourceId, {
      sourceId: e.sourceId,
      lastPingAt: e.timestamp,
      timedOut: false,
    });
    this.bus.emit('presence:heartbeat_ping', e);
  }

  private onPong(e: HeartbeatEvent): void {
    const hb = this.heartbeats.get(e.sourceId);
    if (!hb) return;
    hb.lastPongAt = e.timestamp;
    hb.latencyMs = e.latencyMs;
    hb.timedOut = false;
    this.bus.emit('presence:heartbeat_pong', e);
  }

  private onHeartbeatTimeout(e: HeartbeatEvent): void {
    const hb = this.heartbeats.get(e.sourceId) ?? {
      sourceId: e.sourceId,
      lastPingAt: e.timestamp,
      timedOut: true,
    };
    hb.timedOut = true;
    this.heartbeats.set(e.sourceId, hb);
    this.opts.onHeartbeatTimeout?.(hb);
    this.heartbeatTimeoutHandlers.forEach((h) => h(hb));
    this.bus.emit('presence:heartbeat_timeout', hb);
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const hb of this.heartbeats.values()) {
      if (!hb.timedOut && now - hb.lastPingAt > this.heartbeatTimeoutMs) {
        hb.timedOut = true;
        this.opts.onHeartbeatTimeout?.(hb);
        this.heartbeatTimeoutHandlers.forEach((h) => h(hb));
        this.bus.emit('presence:heartbeat_timeout', hb);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Messaging handlers
  // -------------------------------------------------------------------------

  private onMessageSend(e: MessagingEvent): void {
    this.appendMessage(e.fromPeerId, e);
    this.bus.emit('presence:message_send', e);
  }

  private onMessageReceive(e: MessagingEvent): void {
    this.appendMessage(e.fromPeerId, e);
    this.opts.onMessageReceived?.(e);
    this.messageHandlers.forEach((h) => h(e));
    this.bus.emit('presence:message_receive', e);
  }

  private onMessageDelivered(e: MessagingEvent): void {
    this.bus.emit('presence:message_delivered', e);
  }

  private appendMessage(peerId: string, msg: MessagingEvent): void {
    const list = this.messages.get(peerId) ?? [];
    list.push(msg);
    if (list.length > this.maxMessagesPerPeer) {
      list.splice(0, list.length - this.maxMessagesPerPeer);
    }
    this.messages.set(peerId, list);
  }

  // -------------------------------------------------------------------------
  // Pruning
  // -------------------------------------------------------------------------

  private pruneEndedSessions(): void {
    const ended = Array.from(this.sessions.values()).filter((s) => s.status === 'ended');
    if (ended.length > this.maxEndedSessions) {
      ended
        .sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))
        .slice(0, ended.length - this.maxEndedSessions)
        .forEach((s) => this.sessions.delete(s.sessionId));
    }
  }

  // -------------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------------

  onPeerJoined(handler: PeerHandler): () => void {
    this.peerJoinedHandlers.add(handler);
    return () => this.peerJoinedHandlers.delete(handler);
  }

  onPeerLeft(handler: PeerHandler): () => void {
    this.peerLeftHandlers.add(handler);
    return () => this.peerLeftHandlers.delete(handler);
  }

  onHeartbeatTimeout(handler: HeartbeatHandler): () => void {
    this.heartbeatTimeoutHandlers.add(handler);
    return () => this.heartbeatTimeoutHandlers.delete(handler);
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

  getSession(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessions(): SessionRecord[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === 'active');
  }

  isSessionActive(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.status === 'active';
  }

  getPeer(peerId: string): PeerRecord | undefined {
    return this.peers.get(peerId);
  }

  getActivePeers(): PeerRecord[] {
    return Array.from(this.peers.values()).filter((p) => p.leftAt === undefined);
  }

  getSpeakingPeers(): PeerRecord[] {
    return this.getActivePeers().filter((p) => p.voiceActive);
  }

  getHeartbeatStatus(sourceId: string): HeartbeatStatus | undefined {
    return this.heartbeats.get(sourceId);
  }

  getTimedOutPeers(): HeartbeatStatus[] {
    return Array.from(this.heartbeats.values()).filter((h) => h.timedOut);
  }

  getMessages(fromPeerId: string): MessagingEvent[] {
    return this.messages.get(fromPeerId) ?? [];
  }

  get started(): boolean {
    return this._started;
  }

  clearHistory(): void {
    this.messages.clear();
    this.sessions.forEach((s, id) => {
      if (s.status === 'ended') this.sessions.delete(id);
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSessionPresenceCoordinator(
  options: SessionPresenceCoordinatorOptions
): SessionPresenceCoordinator {
  const coordinator = new SessionPresenceCoordinator(options);
  coordinator.start();
  return coordinator;
}
