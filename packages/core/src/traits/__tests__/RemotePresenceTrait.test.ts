import { describe, it, expect, beforeEach } from 'vitest';
import { remotePresenceHandler } from '../RemotePresenceTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('RemotePresenceTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    avatar_type: 'head_hands' as const,
    voice_enabled: true,
    video_enabled: false,
    latency_compensation: true,
    quality_adaptive: true,
    bandwidth_limit: 0,
    interpolation_buffer: 100,
    sync_rate: 30,
  };

  beforeEach(() => {
    node = createMockNode('presence');
    ctx = createMockContext();
    attachTrait(remotePresenceHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = (node as any).__remotePresenceState;
    expect(state).toBeDefined();
    expect(state.state).toBe('disconnected');
    expect(state.isConnected).toBe(false);
    expect(state.peers.size).toBe(0);
  });

  it('emits remote_presence_init on attach', () => {
    expect(getEventCount(ctx, 'remote_presence_init')).toBe(1);
  });

  it('connected event updates state', () => {
    sendEvent(remotePresenceHandler, node, cfg, ctx, {
      type: 'remote_presence_connected',
      peerId: 'local1',
      isHost: true,
    });
    const state = (node as any).__remotePresenceState;
    expect(state.isConnected).toBe(true);
    expect(state.state).toBe('connected');
    expect(state.localPeerId).toBe('local1');
  });

  it('peer_joined adds peer and emits events', () => {
    sendEvent(remotePresenceHandler, node, cfg, ctx, {
      type: 'remote_presence_peer_joined',
      peerId: 'p1',
    });
    expect((node as any).__remotePresenceState.peers.size).toBe(1);
    expect(getEventCount(ctx, 'remote_presence_spawn_avatar')).toBe(1);
    expect(getEventCount(ctx, 'on_peer_joined')).toBe(1);
  });

  it('peer_left removes peer', () => {
    sendEvent(remotePresenceHandler, node, cfg, ctx, {
      type: 'remote_presence_peer_joined',
      peerId: 'p1',
    });
    sendEvent(remotePresenceHandler, node, cfg, ctx, {
      type: 'remote_presence_peer_left',
      peerId: 'p1',
    });
    expect((node as any).__remotePresenceState.peers.size).toBe(0);
    expect(getEventCount(ctx, 'on_peer_left')).toBe(1);
  });

  it('enable/disable voice toggles state', () => {
    sendEvent(remotePresenceHandler, node, cfg, ctx, { type: 'remote_presence_disable_voice' });
    expect((node as any).__remotePresenceState.voiceEnabled).toBe(false);
    sendEvent(remotePresenceHandler, node, cfg, ctx, { type: 'remote_presence_enable_voice' });
    expect((node as any).__remotePresenceState.voiceEnabled).toBe(true);
  });

  it('bandwidth_update sets bandwidth', () => {
    sendEvent(remotePresenceHandler, node, cfg, ctx, {
      type: 'remote_presence_bandwidth_update',
      bytesPerSec: 50000,
    });
    expect((node as any).__remotePresenceState.bandwidthUsage).toBe(50000);
  });

  it('connect event sets connecting state', () => {
    sendEvent(remotePresenceHandler, node, cfg, ctx, { type: 'remote_presence_connect' });
    expect((node as any).__remotePresenceState.state).toBe('connecting');
  });

  it('detach cleans up', () => {
    remotePresenceHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__remotePresenceState).toBeUndefined();
  });
});
