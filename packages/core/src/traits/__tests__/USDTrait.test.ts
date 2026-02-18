import { describe, it, expect, beforeEach } from 'vitest';
import { usdHandler, applyUSDAxisConversion, usdTimeCodeToSeconds, secondsToUSDTimeCode } from '../USDTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('USDTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source: '',
    layer: '',
    variant_set: '',
    variant: '',
    purpose: 'default' as const,
    time_code: 0,
    payload_loading: 'eager' as const,
    enable_ar: false,
    ar_anchor: 'plane' as const,
    scale: 1.0,
    up_axis: 'y' as const,
    meters_per_unit: 1.0,
    enable_skeletal: true,
    enable_blend_shapes: true,
    enable_physics: false,
    material_conversion: 'preview' as const,
    cast_shadows: true,
    receive_shadows: true,
    auto_play: false,
    loop_animation: true,
    frame_rate: 24,
    streaming_priority: 'normal' as const,
    enable_instancing: true,
    subdivision_level: 0,
  };

  beforeEach(() => {
    node = createMockNode('usd');
    ctx = createMockContext();
    attachTrait(usdHandler, node, cfg, ctx);
  });

  it('initializes empty state when no source', () => {
    const state = (node as any).__usdState;
    expect(state).toBeDefined();
    expect(state.isLoaded).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.primCount).toBe(0);
    expect(state.isUSDZ).toBe(false);
  });

  it('play event is harmless without animation', () => {
    sendEvent(usdHandler, node, cfg, ctx, { type: 'usd:play' });
    expect((node as any).__usdState.isPlaying).toBe(false);
  });

  it('pause sets isPlaying false', () => {
    sendEvent(usdHandler, node, cfg, ctx, { type: 'usd:pause' });
    expect((node as any).__usdState.isPlaying).toBe(false);
  });

  it('stop resets time code', () => {
    sendEvent(usdHandler, node, cfg, ctx, { type: 'usd:stop' });
    expect((node as any).__usdState.currentTimeCode).toBe(0);
  });

  it('set_variant is safe when no variants loaded', () => {
    sendEvent(usdHandler, node, cfg, ctx, { type: 'usd:set_variant', variantSet: 'LOD', variant: 'high' });
    // Should not crash
    expect((node as any).__usdState.activeVariants.size).toBe(0);
  });

  it('set_blend_shape is safe when no shapes loaded', () => {
    sendEvent(usdHandler, node, cfg, ctx, { type: 'usd:set_blend_shape', target: 'smile', weight: 0.5 });
    expect((node as any).__usdState.blendWeights.size).toBe(0);
  });

  it('applyUSDAxisConversion with y-up passes through', () => {
    const result = applyUSDAxisConversion('y', [1, 2, 3] as any);
    expect(result).toEqual([1, 2, 3]);
  });

  it('applyUSDAxisConversion with z-up swaps', () => {
    const result = applyUSDAxisConversion('z', [1, 2, 3] as any);
    expect(result).toEqual([1, 3, -2]);
  });

  it('usdTimeCodeToSeconds converts correctly', () => {
    expect(usdTimeCodeToSeconds(48, 24)).toBe(2);
  });

  it('secondsToUSDTimeCode converts correctly', () => {
    expect(secondsToUSDTimeCode(2, 24)).toBe(48);
  });

  it('detach cleans up state', () => {
    usdHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__usdState).toBeUndefined();
  });
});
