/**
 * VoiceMeshTrait — Production Test Suite
 *
 * voiceMeshHandler stores state on node.__voiceMeshState.
 * NOTE: startLocalStream is async and browser-gated (navigator.mediaDevices guard).
 * In the test environment navigator is undefined, so auto_connect is a no-op.
 *
 * Key behaviours:
 * 1. defaultConfig — all 5 fields
 * 2. onAttach — state init (isMuted=config.mute), emits voice_mesh_ready,
 *               no crash when auto_connect=true (browser guard)
 * 3. onDetach — stops localStream tracks, closes audioContext, removes state
 * 4. onUpdate — no-op when analyzer absent; no-op when isMuted
 * 5. onEvent — voice_stream_received: stores in remoteStreams, emits audio_source_loaded
 */
import { describe, it, expect, vi } from 'vitest';
import { voiceMeshHandler } from '../VoiceMeshTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'vm_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof voiceMeshHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...voiceMeshHandler.defaultConfig!, ...cfg };
  voiceMeshHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('voiceMeshHandler.defaultConfig', () => {
  const d = voiceMeshHandler.defaultConfig!;
  it('auto_connect=true', () => expect(d.auto_connect).toBe(true));
  it('mute=false', () => expect(d.mute).toBe(false));
  it('spatial=true', () => expect(d.spatial).toBe(true));
  it('volume=1.0', () => expect(d.volume).toBe(1.0));
  it('vad_threshold=-50', () => expect(d.vad_threshold).toBe(-50));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('voiceMeshHandler.onAttach', () => {
  it('initialises __voiceMeshState', () => {
    const { node } = attach({ auto_connect: false });
    expect((node as any).__voiceMeshState).toBeDefined();
  });

  it('isMuted = config.mute (false)', () => {
    const { node } = attach({ mute: false, auto_connect: false });
    expect((node as any).__voiceMeshState.isMuted).toBe(false);
  });

  it('isMuted = config.mute (true)', () => {
    const { node } = attach({ mute: true, auto_connect: false });
    expect((node as any).__voiceMeshState.isMuted).toBe(true);
  });

  it('isTalking=false initially', () => {
    const { node } = attach({ auto_connect: false });
    expect((node as any).__voiceMeshState.isTalking).toBe(false);
  });

  it('remoteStreams is an empty Map', () => {
    const { node } = attach({ auto_connect: false });
    const s = (node as any).__voiceMeshState;
    expect(s.remoteStreams).toBeInstanceOf(Map);
    expect(s.remoteStreams.size).toBe(0);
  });

  it('emits voice_mesh_ready', () => {
    const { ctx } = attach({ auto_connect: false });
    expect(ctx.emit).toHaveBeenCalledWith('voice_mesh_ready', expect.any(Object));
  });

  it('does not throw when auto_connect=true (browser guard handles navigator missing)', () => {
    // startLocalStream checks typeof navigator === 'undefined' and returns
    expect(() => attach({ auto_connect: true })).not.toThrow();
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('voiceMeshHandler.onDetach', () => {
  it('removes __voiceMeshState', () => {
    const { node, ctx, config } = attach({ auto_connect: false });
    voiceMeshHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__voiceMeshState).toBeUndefined();
  });

  it('calls getTracks().stop() on localStream if present', () => {
    const { node, ctx, config } = attach({ auto_connect: false });
    const mockTrack = { stop: vi.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    (node as any).__voiceMeshState.localStream = mockStream;
    voiceMeshHandler.onDetach!(node as any, config, ctx as any);
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('calls audioContext.close() if present', () => {
    const { node, ctx, config } = attach({ auto_connect: false });
    const mockAudioCtx = { close: vi.fn() };
    (node as any).__voiceMeshState.audioContext = mockAudioCtx;
    voiceMeshHandler.onDetach!(node as any, config, ctx as any);
    expect(mockAudioCtx.close).toHaveBeenCalled();
  });

  it('no crash when __voiceMeshState is absent', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = voiceMeshHandler.defaultConfig!;
    expect(() => voiceMeshHandler.onDetach!(node as any, config, ctx as any)).not.toThrow();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('voiceMeshHandler.onUpdate', () => {
  it('no-op when analyzer is null', () => {
    const { node, ctx, config } = attach({ auto_connect: false });
    ctx.emit.mockClear();
    voiceMeshHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('no-op when isMuted=true (even if analyzer present)', () => {
    const { node, ctx, config } = attach({ auto_connect: false, mute: true });
    const mockAnalyzer = {
      frequencyBinCount: 4,
      getByteFrequencyData: vi.fn((arr: Uint8Array) => { arr[0] = 200; arr[1] = 200; arr[2] = 200; arr[3] = 200; }),
    };
    (node as any).__voiceMeshState.analyzer = mockAnalyzer;
    (node as any).__voiceMeshState.isMuted = true;
    ctx.emit.mockClear();
    voiceMeshHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits voice_activity_change when isTalking state flips', () => {
    const { node, ctx, config } = attach({ auto_connect: false, vad_threshold: -100 });
    // With vad_threshold=-100: mock VAD check = average > (-100+100) = average > 0
    // We'll make average=100 → isTalking=true
    const mockAnalyzer = {
      frequencyBinCount: 2,
      getByteFrequencyData: vi.fn((arr: Uint8Array) => { arr[0] = 100; arr[1] = 100; }),
    };
    (node as any).__voiceMeshState.analyzer = mockAnalyzer;
    (node as any).__voiceMeshState.isMuted = false;
    // isTalking starts false, should flip to true → emits
    ctx.emit.mockClear();
    voiceMeshHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('voice_activity_change', expect.objectContaining({ isTalking: true }));
    expect((node as any).__voiceMeshState.isTalking).toBe(true);
  });

  it('does NOT emit voice_activity_change when isTalking stays same', () => {
    const { node, ctx, config } = attach({ auto_connect: false, vad_threshold: -100 });
    const mockAnalyzer = {
      frequencyBinCount: 2,
      getByteFrequencyData: vi.fn((arr: Uint8Array) => { arr[0] = 100; arr[1] = 100; }),
    };
    (node as any).__voiceMeshState.analyzer = mockAnalyzer;
    (node as any).__voiceMeshState.isTalking = true; // already true
    ctx.emit.mockClear();
    voiceMeshHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('voiceMeshHandler.onEvent', () => {
  it('voice_stream_received — stores stream in remoteStreams', () => {
    const { node, ctx, config } = attach({ auto_connect: false });
    const stream = { id: 'mock_stream' };
    voiceMeshHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_stream_received',
      peerId: 'peer_A',
      stream,
    });
    expect((node as any).__voiceMeshState.remoteStreams.get('peer_A')).toBe(stream);
  });

  it('voice_stream_received — emits audio_source_loaded with sourceId + spatial', () => {
    const { node, ctx, config } = attach({ auto_connect: false, spatial: true });
    const stream = {};
    ctx.emit.mockClear();
    voiceMeshHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_stream_received',
      peerId: 'peer_B',
      stream,
    });
    expect(ctx.emit).toHaveBeenCalledWith('audio_source_loaded', expect.objectContaining({
      sourceId: 'voice_peer_B',
      stream,
      spatial: true,
    }));
  });

  it('voice_stream_received — spatial=false when config.spatial=false', () => {
    const { node, ctx, config } = attach({ auto_connect: false, spatial: false });
    ctx.emit.mockClear();
    voiceMeshHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_stream_received',
      peerId: 'peer_C',
      stream: {},
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_source_loaded');
    expect(call![1].spatial).toBe(false);
  });

  it('no-op gracefully when __voiceMeshState is absent', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = voiceMeshHandler.defaultConfig!;
    expect(() => voiceMeshHandler.onEvent!(node as any, config, ctx as any, {
      type: 'voice_stream_received', peerId: 'x', stream: {},
    })).not.toThrow();
  });
});
