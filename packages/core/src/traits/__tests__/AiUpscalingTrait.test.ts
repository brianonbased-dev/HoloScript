import { describe, it, expect, beforeEach } from 'vitest';
import { aiUpscalingHandler } from '../AiUpscalingTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('AiUpscalingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    upscale_model: 'realesrgan' as const,
    scale_factor: 4 as const,
    tile_size: 512,
    denoise_strength: 0.5,
    input_source: 'texture' as const,
    preserve_details: true,
    apply_to_material: true,
  };

  beforeEach(() => {
    node = createMockNode('up');
    ctx = createMockContext();
    attachTrait(aiUpscalingHandler, node, cfg, ctx);
  });

  it('inits and starts processing on attach for texture input', () => {
    expect(getEventCount(ctx, 'ai_upscaling_init')).toBe(1);
    expect(getEventCount(ctx, 'ai_upscaling_request')).toBe(1);
    expect((node as any).__aiUpscalingState.is_processing).toBe(true);
  });

  it('live mode does not auto-request on attach', () => {
    const n = createMockNode('up2');
    const c = createMockContext();
    attachTrait(aiUpscalingHandler, n, { ...cfg, input_source: 'live' as const }, c);
    expect(getEventCount(c, 'ai_upscaling_request')).toBe(0);
    expect((n as any).__aiUpscalingState.is_processing).toBe(false);
  });

  it('result applies material and caches', () => {
    sendEvent(aiUpscalingHandler, node, cfg, ctx, {
      type: 'ai_upscaling_result',
      texture: 'upscaled_tex',
      processingTime: 150,
    });
    expect((node as any).__aiUpscalingState.output_texture).toBe('upscaled_tex');
    expect((node as any).__aiUpscalingState.is_processing).toBe(false);
    expect(getEventCount(ctx, 'material_set_texture')).toBe(1);
    expect(getEventCount(ctx, 'on_upscaling_complete')).toBe(1);
    expect((node as any).__aiUpscalingState.cache.size).toBe(1);
  });

  it('error clears processing flag', () => {
    sendEvent(aiUpscalingHandler, node, cfg, ctx, { type: 'ai_upscaling_error', error: 'OOM' });
    expect((node as any).__aiUpscalingState.is_processing).toBe(false);
    expect(getEventCount(ctx, 'on_upscaling_error')).toBe(1);
  });

  it('live mode re-requests on update interval', () => {
    const n = createMockNode('lv');
    const c = createMockContext();
    attachTrait(aiUpscalingHandler, n, { ...cfg, input_source: 'live' as const }, c);
    // Accumulate 2+ seconds
    updateTrait(aiUpscalingHandler, n, { ...cfg, input_source: 'live' as const }, c, 2.1);
    expect(getEventCount(c, 'ai_upscaling_request')).toBe(1);
    expect((n as any).__aiUpscalingState.is_processing).toBe(true);
  });

  it('detach cancels if processing', () => {
    aiUpscalingHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'ai_upscaling_cancel')).toBe(1);
    expect((node as any).__aiUpscalingState).toBeUndefined();
  });
});
