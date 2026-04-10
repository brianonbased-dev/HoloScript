/**
 * RemotePresenceTrait Production Tests
 *
 * Telepresence with avatar representation for remote collaboration.
 * Covers: defaultConfig, onAttach, onDetach, onUpdate (adaptive quality),
 * and all 13 onEvent types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { remotePresenceHandler } from '../RemotePresenceTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'rp_test', name: 'TestNode' } as any;
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Partial<typeof remotePresenceHandler.defaultConfig> = {}) {
  const cfg = { ...remotePresenceHandler.defaultConfig!, ...overrides };
  const ctx = makeCtx();
  remotePresenceHandler.onAttach!(node, cfg as any, ctx as any);
  return { cfg, ctx };
}

function state(node: any) {
  return node.__remotePresenceState as any;
}

function fireEvent(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  remotePresenceHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

function peerJoin(node: any, cfg: any, ctx: any, peerId = 'peer_1', avatarType = 'head_hands') {
  fireEvent(node, cfg, ctx, { type: 'remote_presence_peer_joined', peerId, avatarType });
}

function connect(node: any, cfg: any, ctx: any, peerId = 'local_peer') {
  fireEvent(node, cfg, ctx, { type: 'remote_presence_connected', peerId });
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('RemotePresenceTrait — defaultConfig', () => {
  it('has 8 fields with correct defaults', () => {
    const d = remotePresenceHandler.defaultConfig!;
    expect(d.avatar_type).toBe('head_hands');
    expect(d.voice_enabled).toBe(true);
    expect(d.video_enabled).toBe(false);
    expect(d.latency_compensation).toBe(true);
    expect(d.quality_adaptive).toBe(true);
    expect(d.bandwidth_limit).toBe(0);
    expect(d.interpolation_buffer).toBe(100);
    expect(d.sync_rate).toBe(30);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('RemotePresenceTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    const {} = attach(node);
    const s = state(node);
    expect(s.state).toBe('disconnected');
    expect(s.isConnected).toBe(false);
    expect(s.localPeerId).toBeNull();
    expect(s.latency).toBe(0);
    expect(s.peers).toBeInstanceOf(Map);
    expect(s.peers.size).toBe(0);
    expect(s.voiceEnabled).toBe(true);
    expect(s.videoEnabled).toBe(false);
    expect(s.qualityLevel).toBe(1.0);
    expect(s.bandwidthUsage).toBe(0);
  });

  it('emits remote_presence_init with config fields', () => {
    const node = makeNode();
    const { ctx, cfg } = attach(node);
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_init',
      expect.objectContaining({
        avatarType: cfg.avatar_type,
        voiceEnabled: cfg.voice_enabled,
        videoEnabled: cfg.video_enabled,
        syncRate: cfg.sync_rate,
      })
    );
  });

  it('picks up voice_enabled=false from config', () => {
    const node = makeNode();
    attach(node, { voice_enabled: false });
    expect(state(node).voiceEnabled).toBe(false);
  });

  it('picks up video_enabled=true from config', () => {
    const node = makeNode();
    attach(node, { video_enabled: true });
    expect(state(node).videoEnabled).toBe(true);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('RemotePresenceTrait — onDetach', () => {
  it('emits remote_presence_disconnect when connected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    connect(node, cfg, ctx);
    ctx.emit.mockClear();
    remotePresenceHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('remote_presence_disconnect', expect.any(Object));
  });

  it('does NOT emit disconnect when not connected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // state.isConnected is false by default
    ctx.emit.mockClear();
    remotePresenceHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('remote_presence_disconnect', expect.any(Object));
  });

  it('removes __remotePresenceState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    remotePresenceHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__remotePresenceState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('RemotePresenceTrait — onUpdate', () => {
  it('no-op when not connected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    remotePresenceHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits remote_presence_update_avatar for each fresh peer', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    connect(node, cfg, ctx);
    peerJoin(node, cfg, ctx, 'p1');
    ctx.emit.mockClear();
    remotePresenceHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_update_avatar',
      expect.objectContaining({ peerId: 'p1' })
    );
  });

  it('skips stale peers (lastUpdate > 5000ms ago)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    connect(node, cfg, ctx);
    peerJoin(node, cfg, ctx, 'stale');
    // Age the peer
    const s = state(node);
    s.peers.get('stale')!.lastUpdate = Date.now() - 6000;
    ctx.emit.mockClear();
    remotePresenceHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('remote_presence_update_avatar', expect.any(Object));
  });

  it('interpolate flag set based on interpolation_buffer', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { interpolation_buffer: 0 });
    connect(node, cfg, ctx);
    peerJoin(node, cfg, ctx, 'p2');
    ctx.emit.mockClear();
    remotePresenceHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_update_avatar',
      expect.objectContaining({
        interpolate: false,
      })
    );
  });

  it('lowers qualityLevel when bandwidth is over 90% of limit', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { quality_adaptive: true, bandwidth_limit: 1000 });
    connect(node, cfg, ctx);
    const s = state(node);
    s.bandwidthUsage = 950; // > 900 (90%)
    s.qualityLevel = 1.0;
    remotePresenceHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    expect(s.qualityLevel).toBeLessThan(1.0);
  });

  it('raises qualityLevel when bandwidth is under 50% of limit', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { quality_adaptive: true, bandwidth_limit: 1000 });
    connect(node, cfg, ctx);
    const s = state(node);
    s.bandwidthUsage = 400; // < 500 (50%)
    s.qualityLevel = 0.5;
    remotePresenceHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    expect(s.qualityLevel).toBeGreaterThan(0.5);
  });

  it('qualityLevel does not drop below 0.3', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { quality_adaptive: true, bandwidth_limit: 1000 });
    connect(node, cfg, ctx);
    const s = state(node);
    s.bandwidthUsage = 999;
    s.qualityLevel = 0.3;
    remotePresenceHandler.onUpdate!(node, cfg, ctx as any, 10); // big delta
    expect(s.qualityLevel).toBeGreaterThanOrEqual(0.3);
  });

  it('qualityLevel does not exceed 1.0', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { quality_adaptive: true, bandwidth_limit: 1000 });
    connect(node, cfg, ctx);
    const s = state(node);
    s.bandwidthUsage = 100;
    s.qualityLevel = 1.0;
    remotePresenceHandler.onUpdate!(node, cfg, ctx as any, 10);
    expect(s.qualityLevel).toBeLessThanOrEqual(1.0);
  });
});

// ─── onEvent — connection ──────────────────────────────────────────────────────

describe('RemotePresenceTrait — onEvent: connection', () => {
  it('remote_presence_connected sets state + emits on_presence_connected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fireEvent(node, cfg, ctx, { type: 'remote_presence_connected', peerId: 'local_p' });
    const s = state(node);
    expect(s.state).toBe('connected');
    expect(s.isConnected).toBe(true);
    expect(s.localPeerId).toBe('local_p');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_presence_connected',
      expect.objectContaining({ peerId: 'local_p' })
    );
  });

  it('remote_presence_disconnected clears peers + emits on_presence_disconnected', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    connect(node, cfg, ctx);
    peerJoin(node, cfg, ctx, 'p1');
    fireEvent(node, cfg, ctx, { type: 'remote_presence_disconnected', reason: 'timeout' });
    const s = state(node);
    expect(s.state).toBe('disconnected');
    expect(s.isConnected).toBe(false);
    expect(s.peers.size).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_presence_disconnected',
      expect.objectContaining({ reason: 'timeout' })
    );
  });

  it('remote_presence_connect sets state=connecting + emits connect_request', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fireEvent(node, cfg, ctx, { type: 'remote_presence_connect' });
    expect(state(node).state).toBe('connecting');
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_connect_request',
      expect.objectContaining({
        avatarType: cfg.avatar_type,
      })
    );
  });
});

// ─── onEvent — peer lifecycle ──────────────────────────────────────────────────

describe('RemotePresenceTrait — onEvent: peer lifecycle', () => {
  it('remote_presence_peer_joined adds peer to map + emits spawn_avatar + on_peer_joined', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    connect(node, cfg, ctx);
    peerJoin(node, cfg, ctx, 'p1', 'full_body');
    const s = state(node);
    expect(s.peers.size).toBe(1);
    const peer = s.peers.get('p1');
    expect(peer.peerId).toBe('p1');
    expect(peer.avatarType).toBe('full_body');
    expect(peer.isVoiceActive).toBe(false);
    expect(peer.isVideoActive).toBe(false);
    expect(peer.pose.head.position).toMatchObject({ x: 0, y: 1.6, z: 0 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_spawn_avatar',
      expect.objectContaining({ peerId: 'p1' })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_peer_joined',
      expect.objectContaining({ peerId: 'p1', peerCount: 1 })
    );
  });

  it('peerCount increments with each join', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    peerJoin(node, cfg, ctx, 'p1');
    peerJoin(node, cfg, ctx, 'p2');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_peer_joined',
      expect.objectContaining({ peerCount: 2 })
    );
  });

  it('missing avatarType defaults to head_hands', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fireEvent(node, cfg, ctx, { type: 'remote_presence_peer_joined', peerId: 'p1' });
    expect(state(node).peers.get('p1').avatarType).toBe('head_hands');
  });

  it('remote_presence_peer_left removes peer + emits on_peer_left', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    peerJoin(node, cfg, ctx, 'p1');
    fireEvent(node, cfg, ctx, { type: 'remote_presence_peer_left', peerId: 'p1' });
    expect(state(node).peers.size).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_peer_left',
      expect.objectContaining({ peerId: 'p1', peerCount: 0 })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_remove_avatar',
      expect.objectContaining({ peerId: 'p1' })
    );
  });
});

// ─── onEvent — pose / voice / video ───────────────────────────────────────────

describe('RemotePresenceTrait — onEvent: pose, voice, video', () => {
  it('remote_presence_pose_update stores pose and latency on peer', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    peerJoin(node, cfg, ctx, 'p1');
    const newPose = {
      head: { position: { x: 1, y: 1.8, z: -1 }, rotation: { x: 0, y: 0.7, z: 0, w: 0.7 } },
    };
    fireEvent(node, cfg, ctx, {
      type: 'remote_presence_pose_update',
      peerId: 'p1',
      pose: newPose,
      latency: 42,
    });
    const peer = state(node).peers.get('p1');
    expect(peer.pose).toBe(newPose);
    expect(peer.latency).toBe(42);
  });

  it('remote_presence_pose_update on unknown peer is no-op', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    expect(() =>
      fireEvent(node, cfg, ctx, { type: 'remote_presence_pose_update', peerId: 'ghost', pose: {} })
    ).not.toThrow();
  });

  it('remote_presence_voice_state updates isVoiceActive + emits voice_indicator', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    peerJoin(node, cfg, ctx, 'p1');
    ctx.emit.mockClear();
    fireEvent(node, cfg, ctx, {
      type: 'remote_presence_voice_state',
      peerId: 'p1',
      isActive: true,
    });
    expect(state(node).peers.get('p1').isVoiceActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_voice_indicator',
      expect.objectContaining({ peerId: 'p1', isActive: true })
    );
  });

  it('remote_presence_enable_voice sets voiceEnabled + emits voice_start', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { voice_enabled: false });
    fireEvent(node, cfg, ctx, { type: 'remote_presence_enable_voice' });
    expect(state(node).voiceEnabled).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('remote_presence_voice_start', expect.any(Object));
  });

  it('remote_presence_disable_voice sets voiceEnabled=false + emits voice_stop', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fireEvent(node, cfg, ctx, { type: 'remote_presence_disable_voice' });
    expect(state(node).voiceEnabled).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('remote_presence_voice_stop', expect.any(Object));
  });

  it('remote_presence_enable_video sets videoEnabled + emits video_start', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fireEvent(node, cfg, ctx, { type: 'remote_presence_enable_video' });
    expect(state(node).videoEnabled).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('remote_presence_video_start', expect.any(Object));
  });

  it('remote_presence_disable_video sets videoEnabled=false + emits video_stop', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { video_enabled: true });
    fireEvent(node, cfg, ctx, { type: 'remote_presence_disable_video' });
    expect(state(node).videoEnabled).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('remote_presence_video_stop', expect.any(Object));
  });
});

// ─── onEvent — bandwidth / latency ────────────────────────────────────────────

describe('RemotePresenceTrait — onEvent: bandwidth & latency', () => {
  it('remote_presence_bandwidth_update sets bandwidthUsage', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fireEvent(node, cfg, ctx, { type: 'remote_presence_bandwidth_update', bytesPerSec: 512000 });
    expect(state(node).bandwidthUsage).toBe(512000);
  });

  it('remote_presence_latency_update sets latency', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fireEvent(node, cfg, ctx, { type: 'remote_presence_latency_update', latency: 78 });
    expect(state(node).latency).toBe(78);
  });
});

// ─── onEvent — query ──────────────────────────────────────────────────────────

describe('RemotePresenceTrait — onEvent: query', () => {
  it('remote_presence_query emits remote_presence_info with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    connect(node, cfg, ctx, 'me');
    peerJoin(node, cfg, ctx, 'p1');
    peerJoin(node, cfg, ctx, 'p2');
    ctx.emit.mockClear();

    fireEvent(node, cfg, ctx, { type: 'remote_presence_query', queryId: 'q42' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_info',
      expect.objectContaining({
        queryId: 'q42',
        state: 'connected',
        isConnected: true,
        localPeerId: 'me',
        peerCount: 2,
      })
    );
    const call = (ctx.emit as any).mock.calls.find((c: any[]) => c[0] === 'remote_presence_info');
    expect(call[1].peers).toHaveLength(2);
  });

  it('query includes latency and qualityLevel', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    const s = state(node);
    s.latency = 55;
    s.qualityLevel = 0.8;
    fireEvent(node, cfg, ctx, { type: 'remote_presence_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'remote_presence_info',
      expect.objectContaining({
        latency: 55,
        qualityLevel: 0.8,
      })
    );
  });
});
