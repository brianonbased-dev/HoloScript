/**
 * SessionPresenceCoordinator — fourth and final consumer-bus closing
 * Pattern E for the multiplayer-presence trait cluster (SharePlay +
 * SpatialVoice + WorldHeartbeat + Messaging). Tests use a MockEventSource
 * mirroring TraitContextFactory.on/.emit semantics.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionPresenceCoordinator,
  type SessionPresenceEventSource,
  type SessionPresenceEnvelope,
} from '../SessionPresenceCoordinator';

class MockEventSource implements SessionPresenceEventSource {
  private handlers = new Map<string, Array<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  fire(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }

  get subscriberCount(): number {
    return this.handlers.size;
  }
}

describe('SessionPresenceCoordinator — Pattern E remediation for presence cluster', () => {
  let source: MockEventSource;
  let coord: SessionPresenceCoordinator;

  beforeEach(() => {
    source = new MockEventSource();
    coord = new SessionPresenceCoordinator(source);
  });

  it('subscribes to the full presence vocabulary on construction', () => {
    // 7 shareplay + 8 spatial_voice + 7 messaging + 4 heartbeat = 26
    expect(source.subscriberCount).toBe(coord.subscribedEventCount);
    expect(coord.subscribedEventCount).toBe(26);
  });

  it('starts with empty state', () => {
    expect(coord.getAllSessions()).toEqual([]);
    expect(coord.getAllVoiceNodes()).toEqual([]);
    expect(coord.getAllMessagingConnections()).toEqual([]);
    expect(coord.getAllHeartbeats()).toEqual([]);
  });

  // ---- SHAREPLAY -------------------------------------------------------

  describe('SharePlay sessions', () => {
    it('shareplay:started tracks a new session', () => {
      source.fire('shareplay:started', { sessionId: 'sp1' });
      expect(coord.getSession('sp1')?.status).toBe('started');
    });

    it('shareplay:joined transitions to joined', () => {
      source.fire('shareplay:started', { sessionId: 'sp2' });
      source.fire('shareplay:joined', { sessionId: 'sp2' });
      expect(coord.getSession('sp2')?.status).toBe('joined');
    });

    it('shareplay:participant_joined adds participant to the set', () => {
      source.fire('shareplay:started', { sessionId: 'sp3' });
      source.fire('shareplay:participant_joined', { sessionId: 'sp3', participantId: 'pA' });
      source.fire('shareplay:participant_joined', { sessionId: 'sp3', participantId: 'pB' });
      const s = coord.getSession('sp3');
      expect(s?.participants.has('pA')).toBe(true);
      expect(s?.participants.has('pB')).toBe(true);
      expect(s?.participants.size).toBe(2);
    });

    it('shareplay:participant_left removes the participant', () => {
      source.fire('shareplay:started', { sessionId: 'sp4' });
      source.fire('shareplay:participant_joined', { sessionId: 'sp4', participantId: 'pA' });
      source.fire('shareplay:participant_left', { sessionId: 'sp4', participantId: 'pA' });
      expect(coord.getSession('sp4')?.participants.has('pA')).toBe(false);
    });

    it('shareplay:ended flips status to ended', () => {
      source.fire('shareplay:started', { sessionId: 'sp5' });
      source.fire('shareplay:ended', { sessionId: 'sp5' });
      expect(coord.getSession('sp5')?.status).toBe('ended');
    });

    it('returned session is a defensive copy (mutation does not affect bus)', () => {
      source.fire('shareplay:started', { sessionId: 'sp6' });
      source.fire('shareplay:participant_joined', { sessionId: 'sp6', participantId: 'pA' });
      const snap = coord.getSession('sp6')!;
      snap.participants.add('rogue');
      expect(coord.getSession('sp6')?.participants.has('rogue')).toBe(false);
    });

    it('shareplay:ready does not create a session (no sessionId yet)', () => {
      source.fire('shareplay:ready', { activity: 'Test' });
      expect(coord.getAllSessions()).toEqual([]);
    });
  });

  // ---- SPATIAL VOICE ---------------------------------------------------

  describe('SpatialVoice peers', () => {
    it('spatial_voice_create starts tracking a node with empty peers', () => {
      source.fire('spatial_voice_create', { nodeId: 'n1' });
      const v = coord.getVoiceNode('n1');
      expect(v?.peers.size).toBe(0);
      expect(v?.muted).toBe(false);
    });

    it('spatial_voice_destroy removes the node', () => {
      source.fire('spatial_voice_create', { nodeId: 'n2' });
      source.fire('spatial_voice_destroy', { nodeId: 'n2' });
      expect(coord.getVoiceNode('n2')).toBeUndefined();
    });

    it('spatial_voice_peer_joined adds a peer', () => {
      source.fire('spatial_voice_create', { nodeId: 'n3' });
      source.fire('spatial_voice_peer_joined', { nodeId: 'n3', peerId: 'remoteA' });
      expect(coord.getVoiceNode('n3')?.peers.has('remoteA')).toBe(true);
    });

    it('spatial_voice_peer_left removes the peer', () => {
      source.fire('spatial_voice_create', { nodeId: 'n4' });
      source.fire('spatial_voice_peer_joined', { nodeId: 'n4', peerId: 'remoteA' });
      source.fire('spatial_voice_peer_left', { nodeId: 'n4', peerId: 'remoteA' });
      expect(coord.getVoiceNode('n4')?.peers.has('remoteA')).toBe(false);
    });

    it('spatial_voice_muted updates mute flag on tracked listeners', () => {
      source.fire('spatial_voice_create', { nodeId: 'n5' });
      source.fire('spatial_voice_muted', {});
      expect(coord.getVoiceNode('n5')?.muted).toBe(true);
    });

    it('spatial_voice_unmuted clears mute flag', () => {
      source.fire('spatial_voice_create', { nodeId: 'n6' });
      source.fire('spatial_voice_muted', {});
      source.fire('spatial_voice_unmuted', {});
      expect(coord.getVoiceNode('n6')?.muted).toBe(false);
    });

    it('on_voice_activity updates lastVoiceActivityAt', () => {
      source.fire('spatial_voice_create', { nodeId: 'n7' });
      const before = coord.getVoiceNode('n7')!.lastVoiceActivityAt;
      source.fire('on_voice_activity', { speaking: true });
      const after = coord.getVoiceNode('n7')!.lastVoiceActivityAt;
      expect(after).toBeGreaterThanOrEqual(before);
      expect(after).toBeGreaterThan(0);
    });

    it('voice node is a defensive copy', () => {
      source.fire('spatial_voice_create', { nodeId: 'n8' });
      source.fire('spatial_voice_peer_joined', { nodeId: 'n8', peerId: 'peer1' });
      const snap = coord.getVoiceNode('n8')!;
      snap.peers.add('rogue');
      expect(coord.getVoiceNode('n8')?.peers.has('rogue')).toBe(false);
    });
  });

  // ---- MESSAGING -------------------------------------------------------

  describe('Messaging connections', () => {
    it('messaging_connected starts a connection', () => {
      source.fire('messaging_connected', { platform: 'discord' });
      expect(coord.getMessagingConnection('discord')?.status).toBe('connected');
    });

    it('messaging_disconnected updates status', () => {
      source.fire('messaging_connected', { platform: 'discord' });
      source.fire('messaging_disconnected', { platform: 'discord' });
      expect(coord.getMessagingConnection('discord')?.status).toBe('disconnected');
    });

    it('messaging_error captures error string', () => {
      source.fire('messaging_error', { platform: 'telegram', error: 'auth failed' });
      const c = coord.getMessagingConnection('telegram');
      expect(c?.status).toBe('errored');
      expect(c?.error).toBe('auth failed');
    });

    it('message_received increments counter', () => {
      source.fire('messaging_connected', { platform: 'discord' });
      source.fire('message_received', { platform: 'discord' });
      source.fire('message_received', { platform: 'discord' });
      expect(coord.getMessagingConnection('discord')?.messagesReceived).toBe(2);
    });

    it('message_sent increments counter', () => {
      source.fire('messaging_connected', { platform: 'discord' });
      source.fire('message_sent', { platform: 'discord', chat: 'c', messageId: 'm1' });
      expect(coord.getMessagingConnection('discord')?.messagesSent).toBe(1);
    });

    it('reconnect after error clears the error', () => {
      source.fire('messaging_error', { platform: 'discord', error: 'fail' });
      source.fire('messaging_connected', { platform: 'discord' });
      const c = coord.getMessagingConnection('discord');
      expect(c?.status).toBe('connected');
      expect(c?.error).toBeUndefined();
    });
  });

  // ---- HEARTBEAT -------------------------------------------------------

  describe('WorldHeartbeat liveness', () => {
    it('heartbeat_initialized starts tracking a node', () => {
      source.fire('heartbeat_initialized', { nodeId: 'h1' });
      expect(coord.getHeartbeat('h1')?.status).toBe('initialized');
    });

    it('heartbeat_tick increments ticks and flips to alive', () => {
      source.fire('heartbeat_initialized', { nodeId: 'h2' });
      source.fire('heartbeat_tick', { nodeId: 'h2' });
      source.fire('heartbeat_tick', { nodeId: 'h2' });
      const h = coord.getHeartbeat('h2');
      expect(h?.status).toBe('alive');
      expect(h?.ticks).toBe(2);
      expect(h?.lastTickAt).toBeGreaterThan(0);
    });

    it('heartbeat_failover flips status', () => {
      source.fire('heartbeat_initialized', { nodeId: 'h3' });
      source.fire('heartbeat_failover', { nodeId: 'h3' });
      expect(coord.getHeartbeat('h3')?.status).toBe('failover');
    });

    it('heartbeat_error captures error', () => {
      source.fire('heartbeat_error', { nodeId: 'h4', error: 'network down' });
      expect(coord.getHeartbeat('h4')?.status).toBe('errored');
      expect(coord.getHeartbeat('h4')?.error).toBe('network down');
    });
  });

  // ---- subscribe + bus discipline --------------------------------------

  describe('subscribe + bus discipline', () => {
    it('subscribers receive envelopes for every observed event', () => {
      const seen: SessionPresenceEnvelope[] = [];
      coord.subscribe((e) => seen.push(e));
      source.fire('shareplay:started', { sessionId: 'sp1' });
      source.fire('messaging_connected', { platform: 'discord' });
      source.fire('heartbeat_tick', { nodeId: 'h1' });
      expect(seen).toHaveLength(3);
      expect(seen[0].domain).toBe('shareplay');
      expect(seen[1].domain).toBe('messaging');
      expect(seen[2].domain).toBe('heartbeat');
    });

    it('unsubscribe stops further deliveries', () => {
      const seen: SessionPresenceEnvelope[] = [];
      const unsub = coord.subscribe((e) => seen.push(e));
      source.fire('shareplay:started', { sessionId: 'sp1' });
      unsub();
      source.fire('shareplay:ended', { sessionId: 'sp1' });
      expect(seen).toHaveLength(1);
    });

    it('a thrown listener never crashes other listeners', () => {
      const seen: SessionPresenceEnvelope[] = [];
      coord.subscribe(() => {
        throw new Error('boom');
      });
      coord.subscribe((e) => seen.push(e));
      source.fire('messaging_connected', { platform: 'discord' });
      expect(seen).toHaveLength(1);
    });
  });

  // ---- stats + reset ---------------------------------------------------

  describe('stats + reset', () => {
    it('getStats aggregates across all 4 domains', () => {
      source.fire('shareplay:started', { sessionId: 'sp1' });
      source.fire('shareplay:participant_joined', { sessionId: 'sp1', participantId: 'pA' });
      source.fire('shareplay:participant_joined', { sessionId: 'sp1', participantId: 'pB' });
      source.fire('spatial_voice_create', { nodeId: 'n1' });
      source.fire('spatial_voice_peer_joined', { nodeId: 'n1', peerId: 'remoteA' });
      source.fire('spatial_voice_muted', {});
      source.fire('messaging_connected', { platform: 'discord' });
      source.fire('messaging_error', { platform: 'telegram', error: 'fail' });
      source.fire('heartbeat_initialized', { nodeId: 'h1' });
      source.fire('heartbeat_tick', { nodeId: 'h1' });
      source.fire('heartbeat_failover', { nodeId: 'h2' });

      const stats = coord.getStats();
      expect(stats.sessions.active).toBe(1);
      expect(stats.sessions.participants).toBe(2);
      expect(stats.voice.nodes).toBe(1);
      expect(stats.voice.peers).toBe(1);
      expect(stats.voice.muted).toBe(1);
      expect(stats.messaging.connected).toBe(1);
      expect(stats.messaging.errored).toBe(1);
      expect(stats.heartbeat.alive).toBe(1);
      expect(stats.heartbeat.failover).toBe(1);
    });

    it('reset clears all 4 domains', () => {
      source.fire('shareplay:started', { sessionId: 'sp1' });
      source.fire('spatial_voice_create', { nodeId: 'n1' });
      source.fire('messaging_connected', { platform: 'discord' });
      source.fire('heartbeat_initialized', { nodeId: 'h1' });
      coord.reset();
      expect(coord.getAllSessions()).toEqual([]);
      expect(coord.getAllVoiceNodes()).toEqual([]);
      expect(coord.getAllMessagingConnections()).toEqual([]);
      expect(coord.getAllHeartbeats()).toEqual([]);
    });
  });
});
