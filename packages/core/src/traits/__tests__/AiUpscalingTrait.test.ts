import { describe, it, expect, beforeEach } from 'vitest';
import { aiUpscalingHandler } from '../AiUpscalingTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('AiUpscalingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    upscale_model: 'realesrgan' as const,
    scale_factor: 4 as const,
    tile_size: 512,
    denoise_strength: 0.5,
    input_source: 'texture' as const,
    output_resolution: undefined,
    preserve_details: true,
    apply_to_material: true,
  };

  beforeEach(() => {
    node = createMockNode('tex');
    ctx = createMockContext();
    attachTrait(aiUpscalingHandler, node, cfg, ctx);
  });

  it('initializes and starts processing for texture source', () => {
    const s = (node as any).__aiUpscalingState;
    expect(s.is_processing).toBe(true);
    expect(getEventCount(ctx, 'ai_upscaling_init')).toBe(1);
    expect(getEventCount(ctx, 'ai_upscaling_request')).toBe(1);
  });

  it('live source does not auto-process on attach', () => {
    const n2 = createMockNode('live');
    const c2 = createMockContext();
    const liveCfg = { ...cfg, input_source: 'live' as const };
    attachTrait(aiUpscalingHandler, n2, liveCfg, c2);
    expect((n2 as any).__aiUpscalingState.is_processing).toBe(false);
  });

  it('result event stores texture and applies to material', () => {
    sendEvent(aiUpscalingHandler, node, cfg, ctx, { type: 'ai_upscaling_result', texture: 'tex_4x', processingTime: 123 });
    const s = (node as any).__aiUpscalingState;
    expect(s.is_processing).toBe(false);
    expect(s.output_texture).toBe('tex_4x');
    expect(getEventCount(ctx, 'material_set_texture')).toBe(1);
    expect(getEventCount(ctx, 'on_upscaling_complete')).toBe(1);
  });

  it('caches result by model+scale key', () => {
    sendEvent(aiUpscalingHandler, node, cfg, ctx, { type: 'ai_upscaling_result', texture: 'tex_4x' });
    expect((node as any).__aiUpscalingState.cache.has('realesrgan_4x')).toBe(true);
  });

  it('error event clears processing flag', () => {
    sendEvent(aiUpscalingHandler, node, cfg, ctx, { type: 'ai_upscaling_error', error: 'OOM' });
    expect((node as any).__aiUpscalingState.is_processing).toBe(false);
    expect(getEventCount(ctx, 'on_upscaling_error')).toBe(1);
  });

  it('live mode triggers re-upscale on update after interval', () => {
    const n2 = createMockNode('live2');
    const c2 = createMockContext();
    const liveCfg = { ...cfg, input_source: 'live' as const };
    attachTrait(aiUpscalingHandler, n2, liveCfg, c2);
    c2.clearEvents();
    updateTrait(aiUpscalingHandler, n2, liveCfg, c2, 3.0); // 3s > 2s interval
    expect(getEventCount(c2, 'ai_upscaling_request')).toBe(1);
  });

  it('cleans up and cancels on detach', () => {
    aiUpscalingHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__aiUpscalingState).toBeUndefined();
    expect(getEventCount(ctx, 'ai_upscaling_cancel')).toBe(1);
  });
});
