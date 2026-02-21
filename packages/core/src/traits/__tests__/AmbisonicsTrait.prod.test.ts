/**
 * AmbisonicsTrait — Production Test Suite
 *
 * Tests defaultConfig, onAttach state init + decoder init emission,
 * onDetach cleanup, onUpdate rotation forwarding,
 * and onEvent play / stop / pause / rotation / volume / order.
 */
import { describe, it, expect, vi } from 'vitest';
import { ambisonicsHandler } from '../AmbisonicsTrait';

function makeNode() { return { id: 'amb_1' }; }
function makeContext() { return { emit: vi.fn() }; }
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...ambisonicsHandler.defaultConfig!, ...config };
  ambisonicsHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('ambisonicsHandler.defaultConfig', () => {
  it('order = 1', () => expect(ambisonicsHandler.defaultConfig!.order).toBe(1));
  it('normalization = sn3d', () => expect(ambisonicsHandler.defaultConfig!.normalization).toBe('sn3d'));
  it('channel_ordering = acn', () => expect(ambisonicsHandler.defaultConfig!.channel_ordering).toBe('acn'));
  it('decoder = binaural', () => expect(ambisonicsHandler.defaultConfig!.decoder).toBe('binaural'));
  it('source = empty string', () => expect(ambisonicsHandler.defaultConfig!.source).toBe(''));
  it('loop = true', () => expect(ambisonicsHandler.defaultConfig!.loop).toBe(true));
  it('volume = 1.0', () => expect(ambisonicsHandler.defaultConfig!.volume).toBe(1.0));
  it('scene_rotation_lock = false', () => expect(ambisonicsHandler.defaultConfig!.scene_rotation_lock).toBe(false));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('ambisonicsHandler.onAttach', () => {
  it('sets __ambisonicsState on node', () => {
    const { node } = attachNode();
    expect((node as any).__ambisonicsState).toBeDefined();
  });
  it('initial isPlaying = false', () => {
    const { node } = attachNode();
    expect((node as any).__ambisonicsState.isPlaying).toBe(false);
  });
  it('initial currentOrder = configured order', () => {
    const { node } = attachNode({ order: 2 });
    expect((node as any).__ambisonicsState.currentOrder).toBe(2);
  });
  it('initial sourceLoaded = false', () => {
    const { node } = attachNode();
    expect((node as any).__ambisonicsState.sourceLoaded).toBe(false);
  });
  it('initial decoderReady = false', () => {
    const { node } = attachNode();
    expect((node as any).__ambisonicsState.decoderReady).toBe(false);
  });
  it('initial rotation = identity quaternion {0,0,0,1}', () => {
    const { node } = attachNode();
    expect((node as any).__ambisonicsState.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });
  it('initial gain = volume', () => {
    const { node } = attachNode({ volume: 0.5 });
    expect((node as any).__ambisonicsState.gain).toBe(0.5);
  });
  it('emits ambisonics_init_decoder on attach', () => {
    const { ctx } = attachNode();
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_init_decoder', expect.any(Object));
  });
  it('init_decoder includes order, normalization, channelOrdering, decoderType', () => {
    const { ctx } = attachNode({ order: 3, normalization: 'n3d', channel_ordering: 'fuma', decoder: 'stereo' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'ambisonics_init_decoder');
    expect(call?.[1]).toMatchObject({ order: 3, normalization: 'n3d', channelOrdering: 'fuma', decoderType: 'stereo' });
  });
  it('emits ambisonics_load_source when source is provided', () => {
    const { ctx } = attachNode({ source: 'scene.ogg' });
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_load_source', expect.objectContaining({ url: 'scene.ogg' }));
  });
  it('does NOT emit ambisonics_load_source when source is empty', () => {
    const { ctx } = attachNode({ source: '' });
    const called = ctx.emit.mock.calls.some((c: any[]) => c[0] === 'ambisonics_load_source');
    expect(called).toBe(false);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('ambisonicsHandler.onDetach', () => {
  it('removes __ambisonicsState', () => {
    const { node, cfg, ctx } = attachNode();
    ambisonicsHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__ambisonicsState).toBeUndefined();
  });
  it('emits ambisonics_stop if playing', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__ambisonicsState.isPlaying = true;
    ctx.emit.mockClear();
    ambisonicsHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_stop', expect.any(Object));
  });
  it('emits ambisonics_cleanup always', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    ambisonicsHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_cleanup', expect.any(Object));
  });
});

// ─── onUpdate ────────────────────────────────────────────────────────────────

describe('ambisonicsHandler.onUpdate', () => {
  it('emits ambisonics_update_rotation when playing and scene_rotation_lock=false', () => {
    const { node, cfg, ctx } = attachNode({ scene_rotation_lock: false });
    (node as any).__ambisonicsState.isPlaying = true;
    ctx.emit.mockClear();
    ambisonicsHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_update_rotation', expect.any(Object));
  });
  it('does NOT emit rotation when scene_rotation_lock=true', () => {
    const { node, cfg, ctx } = attachNode({ scene_rotation_lock: true });
    (node as any).__ambisonicsState.isPlaying = true;
    ctx.emit.mockClear();
    ambisonicsHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('ambisonics_update_rotation', expect.any(Object));
  });
  it('does NOT emit rotation when not playing', () => {
    const { node, cfg, ctx } = attachNode({ scene_rotation_lock: false });
    (node as any).__ambisonicsState.isPlaying = false;
    ctx.emit.mockClear();
    ambisonicsHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('ambisonics_update_rotation', expect.any(Object));
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────

describe('ambisonicsHandler.onEvent', () => {
  it('ambisonics_source_loaded sets sourceLoaded=true and emits ambisonics_ready', () => {
    const { node, cfg, ctx } = attachNode();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_source_loaded' });
    expect((node as any).__ambisonicsState.sourceLoaded).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_ready', expect.any(Object));
  });
  it('ambisonics_decoder_ready sets decoderReady=true', () => {
    const { node, cfg, ctx } = attachNode();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_decoder_ready' });
    expect((node as any).__ambisonicsState.decoderReady).toBe(true);
  });
  it('ambisonics_play does nothing if source not loaded', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__ambisonicsState.decoderReady = true;
    ctx.emit.mockClear();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_play' });
    expect((node as any).__ambisonicsState.isPlaying).toBe(false);
  });
  it('ambisonics_play does nothing if decoder not ready', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__ambisonicsState.sourceLoaded = true;
    ctx.emit.mockClear();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_play' });
    expect((node as any).__ambisonicsState.isPlaying).toBe(false);
  });
  it('ambisonics_play sets isPlaying=true and emits start_playback when both ready', () => {
    const { node, cfg, ctx } = attachNode({ loop: false });
    (node as any).__ambisonicsState.sourceLoaded = true;
    (node as any).__ambisonicsState.decoderReady = true;
    ctx.emit.mockClear();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_play' });
    expect((node as any).__ambisonicsState.isPlaying).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_start_playback', expect.objectContaining({ loop: false }));
  });
  it('ambisonics_stop sets isPlaying=false and emits stop_playback', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__ambisonicsState.isPlaying = true;
    ctx.emit.mockClear();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_stop' });
    expect((node as any).__ambisonicsState.isPlaying).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_stop_playback', expect.any(Object));
  });
  it('ambisonics_pause sets isPlaying=false and emits pause_playback', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__ambisonicsState.isPlaying = true;
    ctx.emit.mockClear();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_pause' });
    expect((node as any).__ambisonicsState.isPlaying).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_pause_playback', expect.any(Object));
  });
  it('listener_rotation_update sets rotation state', () => {
    const { node, cfg, ctx } = attachNode();
    const newRot = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 };
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'listener_rotation_update', rotation: newRot });
    expect((node as any).__ambisonicsState.rotation).toEqual(newRot);
  });
  it('ambisonics_set_volume updates gain and emits ambisonics_update_gain', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_set_volume', volume: 0.3 });
    expect((node as any).__ambisonicsState.gain).toBe(0.3);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_update_gain', expect.objectContaining({ gain: 0.3 }));
  });
  it('ambisonics_set_order updates currentOrder and emits ambisonics_reconfigure', () => {
    const { node, cfg, ctx } = attachNode({ order: 1 });
    ctx.emit.mockClear();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_set_order', order: 3 });
    expect((node as any).__ambisonicsState.currentOrder).toBe(3);
    expect(ctx.emit).toHaveBeenCalledWith('ambisonics_reconfigure', expect.objectContaining({ order: 3 }));
  });
  it('ambisonics_set_order does not emit if same order', () => {
    const { node, cfg, ctx } = attachNode({ order: 2 });
    ctx.emit.mockClear();
    ambisonicsHandler.onEvent!(node, cfg, ctx, { type: 'ambisonics_set_order', order: 2 });
    expect(ctx.emit).not.toHaveBeenCalledWith('ambisonics_reconfigure', expect.any(Object));
  });
});
