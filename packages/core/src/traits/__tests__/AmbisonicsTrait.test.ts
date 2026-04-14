import { describe, it, expect, beforeEach } from 'vitest';
import { ambisonicsHandler } from '../AmbisonicsTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('AmbisonicsTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    order: 1 as const,
    normalization: 'sn3d' as const,
    channel_ordering: 'acn' as const,
    decoder: 'binaural' as const,
    source: 'test.amb',
    loop: true,
    volume: 0.8,
    scene_rotation_lock: false,
  };

  beforeEach(() => {
    node = createMockNode('ambisonic');
    ctx = createMockContext();
    attachTrait(ambisonicsHandler, node, cfg, ctx);
  });

  it('initializes with correct state', () => {
    const s = (node as any).__ambisonicsState;
    expect(s.isPlaying).toBe(false);
    expect(s.currentOrder).toBe(1);
    expect(s.gain).toBe(0.8);
  });

  it('emits init_decoder and load_source on attach', () => {
    expect(getEventCount(ctx, 'ambisonics_init_decoder')).toBe(1);
    expect(getEventCount(ctx, 'ambisonics_load_source')).toBe(1);
  });

  it('source_loaded marks source ready', () => {
    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_source_loaded' });
    expect((node as any).__ambisonicsState.sourceLoaded).toBe(true);
    expect(getEventCount(ctx, 'ambisonics_ready')).toBe(1);
  });

  it('play only starts when source and decoder ready', () => {
    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_play' });
    expect((node as any).__ambisonicsState.isPlaying).toBe(false);

    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_source_loaded' });
    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_decoder_ready' });
    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_play' });
    expect((node as any).__ambisonicsState.isPlaying).toBe(true);
    expect(getEventCount(ctx, 'ambisonics_start_playback')).toBe(1);
  });

  it('stop stops playback', () => {
    const s = (node as any).__ambisonicsState;
    s.sourceLoaded = true;
    s.decoderReady = true;
    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_play' });
    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_stop' });
    expect(s.isPlaying).toBe(false);
  });

  it('set_volume updates gain', () => {
    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_set_volume', volume: 0.5 });
    expect((node as any).__ambisonicsState.gain).toBe(0.5);
  });

  it('set_order reconfigures', () => {
    sendEvent(ambisonicsHandler, node, cfg, ctx, { type: 'ambisonics_set_order', order: 3 });
    expect((node as any).__ambisonicsState.currentOrder).toBe(3);
    expect(getEventCount(ctx, 'ambisonics_reconfigure')).toBe(1);
  });

  it('listener_rotation_update updates rotation', () => {
    sendEvent(ambisonicsHandler, node, cfg, ctx, {
      type: 'listener_rotation_update',
      rotation: [1, 0, 0, 0 ],
    });
    expect((node as any).__ambisonicsState.rotation[0]).toBe(1);
  });

  it('cleans up on detach', () => {
    const s = (node as any).__ambisonicsState;
    s.isPlaying = true;
    ambisonicsHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__ambisonicsState).toBeUndefined();
    expect(getEventCount(ctx, 'ambisonics_stop')).toBe(1);
    expect(getEventCount(ctx, 'ambisonics_cleanup')).toBe(1);
  });
});
