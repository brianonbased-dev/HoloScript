import { describe, it, expect, beforeEach } from 'vitest';
import { headTrackedAudioHandler } from '../HeadTrackedAudioTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('HeadTrackedAudioTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source: 'audio.mp3',
    anchor_mode: 'world' as const,
    tracking_latency_compensation: true,
    stabilization: 0.5,
    bypass_spatialization: false,
    volume: 1.0,
    loop: false,
    autoplay: false,
  };

  beforeEach(() => {
    node = createMockNode('hta');
    ctx = createMockContext();
    attachTrait(headTrackedAudioHandler, node, cfg, ctx);
  });

  it('loads audio source on attach', () => {
    expect(getEventCount(ctx, 'audio_load_source')).toBe(1);
  });

  it('autoplay sets playing on attach', () => {
    const n = createMockNode('h2');
    const c = createMockContext();
    attachTrait(headTrackedAudioHandler, n, { ...cfg, autoplay: true }, c);
    expect((n as any).__headTrackedAudioState.isPlaying).toBe(true);
  });

  it('audio_source_loaded sets source id', () => {
    sendEvent(headTrackedAudioHandler, node, cfg, ctx, { type: 'audio_source_loaded', sourceId: 'src1' });
    expect((node as any).__headTrackedAudioState.audioSourceId).toBe('src1');
  });

  it('audio_play starts playback', () => {
    sendEvent(headTrackedAudioHandler, node, cfg, ctx, { type: 'audio_play' });
    expect((node as any).__headTrackedAudioState.isPlaying).toBe(true);
    expect(getEventCount(ctx, 'audio_start')).toBe(1);
  });

  it('audio_stop stops playback', () => {
    sendEvent(headTrackedAudioHandler, node, cfg, ctx, { type: 'audio_play' });
    sendEvent(headTrackedAudioHandler, node, cfg, ctx, { type: 'audio_stop' });
    expect((node as any).__headTrackedAudioState.isPlaying).toBe(false);
  });

  it('head_rotation_update stores rotation', () => {
    sendEvent(headTrackedAudioHandler, node, cfg, ctx, {
      type: 'head_rotation_update',
      rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
    });
    expect((node as any).__headTrackedAudioState.headRotation.y).toBe(0.2);
  });

  it('world position update stores position', () => {
    sendEvent(headTrackedAudioHandler, node, cfg, ctx, {
      type: 'audio_set_world_position',
      position: { x: 5, y: 10, z: 15 },
    });
    expect((node as any).__headTrackedAudioState.worldPosition.x).toBe(5);
  });

  it('update emits position when playing in world mode', () => {
    sendEvent(headTrackedAudioHandler, node, cfg, ctx, { type: 'audio_play' });
    updateTrait(headTrackedAudioHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'audio_set_position')).toBe(1);
  });

  it('detach stops and disposes audio', () => {
    sendEvent(headTrackedAudioHandler, node, cfg, ctx, { type: 'audio_play' });
    headTrackedAudioHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'audio_stop')).toBe(1);
    expect(getEventCount(ctx, 'audio_dispose_source')).toBe(1);
    expect((node as any).__headTrackedAudioState).toBeUndefined();
  });
});
