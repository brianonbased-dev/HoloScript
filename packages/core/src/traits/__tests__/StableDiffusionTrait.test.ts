import { describe, it, expect, beforeEach } from 'vitest';
import { stableDiffusionHandler } from '../StableDiffusionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('StableDiffusionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    diffusion_model: 'sdxl' as const,
    prompt: '',
    negative_prompt: 'blurry',
    resolution: 1024,
    steps: 30,
    cfg_scale: 7.5,
    seed: undefined as number | undefined,
    realtime: false,
    streaming: false,
  };

  beforeEach(() => {
    node = createMockNode('sd');
    ctx = createMockContext();
    attachTrait(stableDiffusionHandler, node, cfg, ctx);
  });

  it('emits init on attach', () => {
    expect(getEventCount(ctx, 'stable_diffusion_init')).toBe(1);
    expect((node as any).__stableDiffusionState.is_generating).toBe(false);
  });

  it('auto-generates when prompt provided', () => {
    const n = createMockNode('sd2');
    const c = createMockContext();
    attachTrait(stableDiffusionHandler, n, { ...cfg, prompt: 'a cat' }, c);
    expect(getEventCount(c, 'stable_diffusion_generate')).toBe(1);
    expect((n as any).__stableDiffusionState.is_generating).toBe(true);
  });

  it('result stores texture and caches', () => {
    sendEvent(stableDiffusionHandler, node, cfg, ctx, {
      type: 'stable_diffusion_result',
      texture: 'tex_001',
    });
    const s = (node as any).__stableDiffusionState;
    expect(s.is_generating).toBe(false);
    expect(s.output_texture).toBe('tex_001');
    expect(s.texture_cache.size).toBe(1);
    expect(getEventCount(ctx, 'on_texture_generated')).toBe(1);
  });

  it('step event updates current_step', () => {
    sendEvent(stableDiffusionHandler, node, cfg, ctx, { type: 'stable_diffusion_step', step: 15 });
    expect((node as any).__stableDiffusionState.current_step).toBe(15);
  });

  it('error stops generating', () => {
    sendEvent(stableDiffusionHandler, node, cfg, ctx, { type: 'stable_diffusion_error', error: 'OOM' });
    expect((node as any).__stableDiffusionState.is_generating).toBe(false);
    expect(getEventCount(ctx, 'on_generation_error')).toBe(1);
  });

  it('realtime streaming emits progress on update', () => {
    const rtCfg = { ...cfg, realtime: true, streaming: true, prompt: 'test' };
    const n = createMockNode('sd3');
    const c = createMockContext();
    attachTrait(stableDiffusionHandler, n, rtCfg, c);
    updateTrait(stableDiffusionHandler, n, rtCfg, c, 0.016);
    expect(getEventCount(c, 'stable_diffusion_progress')).toBe(1);
  });

  it('detach cancels if generating', () => {
    const n = createMockNode('sd4');
    const c = createMockContext();
    attachTrait(stableDiffusionHandler, n, { ...cfg, prompt: 'gen' }, c);
    stableDiffusionHandler.onDetach?.(n as any, cfg as any, c as any);
    expect(getEventCount(c, 'stable_diffusion_cancel')).toBe(1);
    expect((n as any).__stableDiffusionState).toBeUndefined();
  });
});
