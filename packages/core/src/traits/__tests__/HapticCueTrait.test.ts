import { describe, it, expect, beforeEach } from 'vitest';
import { hapticCueHandler } from '../HapticCueTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('HapticCueTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    pattern: 'pulse' as const,
    intensity: 0.5,
    duration: 100,
    repeat: 0,
    repeat_delay: 200,
    spatial_direction: false,
    trigger_on: 'interact',
    custom_pattern: [] as number[],
  };

  beforeEach(() => {
    node = createMockNode('haptic');
    ctx = createMockContext();
    attachTrait(hapticCueHandler, node, cfg, ctx);
  });

  it('initializes and registers', () => {
    expect((node as any).__hapticCueState.isPlaying).toBe(false);
    expect(getEventCount(ctx, 'haptic_cue_register')).toBe(1);
  });

  it('trigger event plays haptic', () => {
    sendEvent(hapticCueHandler, node, cfg, ctx, { type: 'interact' });
    expect((node as any).__hapticCueState.isPlaying).toBe(true);
    expect(getEventCount(ctx, 'haptic_play')).toBe(1);
    expect(getEventCount(ctx, 'on_haptic_start')).toBe(1);
  });

  it('haptic_trigger also triggers playback', () => {
    sendEvent(hapticCueHandler, node, cfg, ctx, { type: 'haptic_trigger' });
    expect(getEventCount(ctx, 'haptic_play')).toBe(1);
  });

  it('repeat triggers additional plays on update', () => {
    const repeatCfg = { ...cfg, repeat: 2, repeat_delay: 100 };
    const n2 = createMockNode('rep');
    const c2 = createMockContext();
    attachTrait(hapticCueHandler, n2, repeatCfg, c2);
    sendEvent(hapticCueHandler, n2, repeatCfg, c2, { type: 'interact' });
    // Simulate enough time for one repeat
    updateTrait(hapticCueHandler, n2, repeatCfg, c2, 0.15); // 150ms > repeat_delay 100ms
    expect(getEventCount(c2, 'haptic_play')).toBe(2);
  });

  it('haptic_stop cancels playback', () => {
    sendEvent(hapticCueHandler, node, cfg, ctx, { type: 'interact' });
    sendEvent(hapticCueHandler, node, cfg, ctx, { type: 'haptic_stop' });
    expect((node as any).__hapticCueState.isPlaying).toBe(false);
    expect(getEventCount(ctx, 'haptic_cancel')).toBe(1);
  });

  it('set_intensity emits update', () => {
    sendEvent(hapticCueHandler, node, cfg, ctx, { type: 'haptic_set_intensity', intensity: 0.8 });
    expect(getEventCount(ctx, 'haptic_update_intensity')).toBe(1);
  });

  it('spatial_direction includes direction vector', () => {
    const spatialCfg = { ...cfg, spatial_direction: true };
    const n2 = createMockNode('spat');
    (n2 as any).position = { x: 3, y: 4, z: 0 };
    const c2 = createMockContext();
    attachTrait(hapticCueHandler, n2, spatialCfg, c2);
    sendEvent(hapticCueHandler, n2, spatialCfg, c2, { type: 'interact' });
    const ev = getLastEvent(c2, 'haptic_play') as any;
    expect(ev.direction).toBeDefined();
    expect(ev.direction.x).toBeCloseTo(0.6, 1);
    expect(ev.direction.y).toBeCloseTo(0.8, 1);
  });

  it('cleans up on detach', () => {
    hapticCueHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__hapticCueState).toBeUndefined();
    expect(getEventCount(ctx, 'haptic_cue_stop')).toBe(1);
  });
});
