import { describe, it, expect, vi } from 'vitest';
import { spatialVoiceHandler } from '../SpatialVoiceTrait';
type Config = NonNullable<Parameters<typeof spatialVoiceHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...spatialVoiceHandler.defaultConfig!, ...o };
}
function mkNode(id = 'voice-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  spatialVoiceHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('spatialVoiceHandler — defaultConfig', () => {
  it('range = 20', () => expect(spatialVoiceHandler.defaultConfig?.range).toBe(20));
  it('rolloff = inverse', () => expect(spatialVoiceHandler.defaultConfig?.rolloff).toBe('inverse'));
  it('max_streams = 8', () => expect(spatialVoiceHandler.defaultConfig?.max_streams).toBe(8));
});

describe('spatialVoiceHandler — onAttach', () => {
  it('creates __spatialVoiceState', () => {
    const { node } = attach();
    expect((node as any).__spatialVoiceState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__spatialVoiceState.active).toBe(true);
  });
  it('emits spatial_voice_create with config values', () => {
    const node = mkNode();
    const ctx = mkCtx();
    spatialVoiceHandler.onAttach!(node, mkCfg({ range: 50, hrtf: false }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'spatial_voice_create');
    expect(ev?.payload.range).toBe(50);
    expect(ev?.payload.hrtf).toBe(false);
  });
  it('connectedPeers starts empty', () => {
    const { node } = attach();
    expect((node as any).__spatialVoiceState.connectedPeers.size).toBe(0);
  });
});

describe('spatialVoiceHandler — onDetach', () => {
  it('emits spatial_voice_destroy', () => {
    const { node, ctx, cfg } = attach();
    spatialVoiceHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'spatial_voice_destroy')).toBe(true);
  });
  it('clears connectedPeers and removes state', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__spatialVoiceState.connectedPeers.add('peer1');
    spatialVoiceHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__spatialVoiceState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => spatialVoiceHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('spatialVoiceHandler — onUpdate', () => {
  it('emits spatial_voice_position when active', () => {
    const { node, ctx, cfg } = attach();
    spatialVoiceHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'spatial_voice_position')).toBe(true);
  });
  it('no-op when not active', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__spatialVoiceState.active = false;
    spatialVoiceHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'spatial_voice_position')).toBe(false);
  });
});

describe('spatialVoiceHandler — onEvent', () => {
  it('voice_peer_connected adds peer and emits joined', () => {
    const { node, ctx, cfg } = attach();
    spatialVoiceHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'voice_peer_connected', peerId: 'p1' } as any
    );
    expect((node as any).__spatialVoiceState.connectedPeers.has('p1')).toBe(true);
    const ev = ctx.emitted.find((e: any) => e.type === 'spatial_voice_peer_joined');
    expect(ev?.payload.peerId).toBe('p1');
    expect(ev?.payload.peerCount).toBe(1);
  });
  it('voice_peer_disconnected removes peer and emits left', () => {
    const { node, ctx, cfg } = attach();
    spatialVoiceHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'voice_peer_connected', peerId: 'p2' } as any
    );
    ctx.emitted.length = 0;
    spatialVoiceHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'voice_peer_disconnected', peerId: 'p2' } as any
    );
    expect((node as any).__spatialVoiceState.connectedPeers.has('p2')).toBe(false);
    const ev = ctx.emitted.find((e: any) => e.type === 'spatial_voice_peer_left');
    expect(ev?.payload.peerCount).toBe(0);
  });
  it('voice_mute sets active = false and emits muted', () => {
    const { node, ctx, cfg } = attach();
    spatialVoiceHandler.onEvent!(node, cfg, ctx as any, { type: 'voice_mute' } as any);
    expect((node as any).__spatialVoiceState.active).toBe(false);
    expect(ctx.emitted.some((e: any) => e.type === 'spatial_voice_muted')).toBe(true);
  });
  it('voice_unmute sets active = true and emits unmuted', () => {
    const { node, ctx, cfg } = attach();
    spatialVoiceHandler.onEvent!(node, cfg, ctx as any, { type: 'voice_mute' } as any);
    ctx.emitted.length = 0;
    spatialVoiceHandler.onEvent!(node, cfg, ctx as any, { type: 'voice_unmute' } as any);
    expect((node as any).__spatialVoiceState.active).toBe(true);
    expect(ctx.emitted.some((e: any) => e.type === 'spatial_voice_unmuted')).toBe(true);
  });
  it('voice_vad_event updates speaking state and emits activity', () => {
    const { node, ctx, cfg } = attach();
    spatialVoiceHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'voice_vad_event',
        speaking: true,
        volume: 0.8,
      } as any
    );
    expect((node as any).__spatialVoiceState.isSpeaking).toBe(true);
    const ev = ctx.emitted.find((e: any) => e.type === 'on_voice_activity');
    expect(ev?.payload.speaking).toBe(true);
    expect(ev?.payload.volume).toBe(0.8);
  });
  it('no-op when no state', () => {
    expect(() =>
      spatialVoiceHandler.onEvent!(
        mkNode() as any,
        mkCfg(),
        mkCtx() as any,
        { type: 'voice_mute' } as any
      )
    ).not.toThrow();
  });
});
