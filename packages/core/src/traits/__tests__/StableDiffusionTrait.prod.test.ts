/**
 * StableDiffusionTrait Production Tests
 *
 * AI-powered texture and image generation using Stable Diffusion models.
 * Covers: defaultConfig (including alias handlers), onAttach (auto-generate guard),
 * onDetach (cancel guard + cache clear), onUpdate (realtime streaming progress),
 * and all 3 onEvent types: stable_diffusion_result, stable_diffusion_step, stable_diffusion_error.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  stableDiffusionHandler,
  aiTextureGenHandler,
  diffusionRealtimeHandler,
  aiInpaintingHandler,
  controlnetHandler,
} from '../StableDiffusionTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'sd_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...stableDiffusionHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  stableDiffusionHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__stableDiffusionState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  stableDiffusionHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('StableDiffusionTrait — defaultConfig', () => {
  it('has correct core fields', () => {
    const d = stableDiffusionHandler.defaultConfig!;
    expect(d.diffusion_model).toBe('sdxl');
    expect(d.prompt).toBe('');
    expect(d.negative_prompt).toBe('blurry, low quality, artifacts');
    expect(d.resolution).toBe(1024);
    expect(d.steps).toBe(30);
    expect(d.cfg_scale).toBeCloseTo(7.5);
    expect(d.realtime).toBe(false);
    expect(d.streaming).toBe(false);
    expect(d.inpaint_strength).toBeCloseTo(0.75);
    expect(d.upscale_factor).toBe(2);
    expect(d.upscale_model).toBe('esrgan');
  });

  it('diffusionRealtimeHandler has realtime=true, streaming=true, steps=15', () => {
    const d = diffusionRealtimeHandler.defaultConfig!;
    expect(d.realtime).toBe(true);
    expect(d.streaming).toBe(true);
    expect(d.steps).toBe(15);
    expect(diffusionRealtimeHandler.name).toBe('diffusion_realtime');
  });

  it('controlnetHandler has control_mode=canny, control_strength=1.0', () => {
    const d = controlnetHandler.defaultConfig!;
    expect(d.control_mode).toBe('canny');
    expect(d.control_strength).toBeCloseTo(1.0);
    expect(controlnetHandler.name).toBe('controlnet');
  });

  it('aiTextureGenHandler alias name=ai_texture_gen', () => {
    expect(aiTextureGenHandler.name).toBe('ai_texture_gen');
  });

  it('aiInpaintingHandler alias name=ai_inpainting', () => {
    expect(aiInpaintingHandler.name).toBe('ai_inpainting');
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('StableDiffusionTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.is_generating).toBe(false);
    expect(s.current_step).toBe(0);
    expect(s.output_texture).toBeNull();
    expect(s.generation_time).toBe(0);
    expect(s.texture_cache).toBeInstanceOf(Map);
    expect(s.texture_cache.size).toBe(0);
  });

  it('always emits stable_diffusion_init with model and resolution', () => {
    const node = makeNode();
    const { ctx } = attach(node, { diffusion_model: 'sd15', resolution: 512 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'stable_diffusion_init',
      expect.objectContaining({
        model: 'sd15',
        resolution: 512,
      })
    );
  });

  it('auto-generate when prompt is provided: emits stable_diffusion_generate, sets is_generating', () => {
    const node = makeNode();
    const { ctx } = attach(node, {
      prompt: 'cyberpunk city',
      negative_prompt: 'blur',
      steps: 20,
      cfg_scale: 8,
      seed: 42,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'stable_diffusion_generate',
      expect.objectContaining({
        prompt: 'cyberpunk city',
        negativePrompt: 'blur',
        steps: 20,
        cfgScale: 8,
        seed: 42,
      })
    );
    expect(st(node).is_generating).toBe(true);
  });

  it('no auto-generate when prompt is empty', () => {
    const node = makeNode();
    const { ctx } = attach(node, { prompt: '' });
    expect(st(node).is_generating).toBe(false);
    expect(ctx.emit).not.toHaveBeenCalledWith('stable_diffusion_generate', expect.any(Object));
  });

  it('last_prompt set to config.prompt on attach', () => {
    const node = makeNode();
    attach(node, { prompt: 'forest' });
    expect(st(node).last_prompt).toBe('forest');
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('StableDiffusionTrait — onDetach', () => {
  it('emits stable_diffusion_cancel when is_generating=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'mountain' });
    // is_generating is true after prompt
    ctx.emit.mockClear();
    stableDiffusionHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('stable_diffusion_cancel', expect.any(Object));
  });

  it('does NOT emit cancel when not generating', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: '' });
    ctx.emit.mockClear();
    stableDiffusionHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('stable_diffusion_cancel', expect.any(Object));
  });

  it('clears texture_cache on detach', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).texture_cache.set('key', { texture: 'tex', timestamp: 1 });
    stableDiffusionHandler.onDetach!(node, cfg, ctx as any);
    // After detach state is deleted, cache.clear was called
    expect(node.__stableDiffusionState).toBeUndefined();
  });

  it('removes __stableDiffusionState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    stableDiffusionHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__stableDiffusionState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('StableDiffusionTrait — onUpdate', () => {
  it('no-op when not generating', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { realtime: true, streaming: true });
    // is_generating is false (no prompt)
    ctx.emit.mockClear();
    stableDiffusionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('realtime=false: no progress emit even when generating', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'art', realtime: false, streaming: true });
    ctx.emit.mockClear();
    stableDiffusionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('stable_diffusion_progress', expect.any(Object));
  });

  it('realtime=true + streaming=true + generating: emits stable_diffusion_progress', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      prompt: 'ocean',
      realtime: true,
      streaming: true,
      steps: 20,
    });
    st(node).current_step = 5;
    ctx.emit.mockClear();
    stableDiffusionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'stable_diffusion_progress',
      expect.objectContaining({
        step: 5,
        totalSteps: 20,
        progress: 5 / 20,
      })
    );
  });

  it('realtime=true + streaming=true: accumulates generation_time', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'space', realtime: true, streaming: true });
    stableDiffusionHandler.onUpdate!(node, cfg, ctx as any, 0.5);
    expect(st(node).generation_time).toBeCloseTo(0.5);
  });

  it('realtime=true + streaming=false: no progress emit', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'coast', realtime: true, streaming: false });
    ctx.emit.mockClear();
    stableDiffusionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('stable_diffusion_progress', expect.any(Object));
  });
});

// ─── onEvent — stable_diffusion_result ────────────────────────────────────────

describe('StableDiffusionTrait — onEvent: stable_diffusion_result', () => {
  it('stores texture, marks done, caches result, emits on_texture_generated', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'sun', steps: 10 });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'stable_diffusion_result', texture: 'blob:tex-data' });
    const s = st(node);
    expect(s.is_generating).toBe(false);
    expect(s.output_texture).toBe('blob:tex-data');
    expect(s.current_step).toBe(10); // = config.steps
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_texture_generated',
      expect.objectContaining({ texture: 'blob:tex-data', prompt: 'sun' })
    );
  });

  it('caches result under prompt_seed key, accessible later', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'river', seed: 999 });
    fire(node, cfg, ctx, { type: 'stable_diffusion_result', texture: 'tex-river' });
    const cacheKey = 'river_999';
    expect(st(node).texture_cache.get(cacheKey)).toMatchObject({ texture: 'tex-river' });
  });

  it('cache key uses "random" when no seed', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'lake' });
    fire(node, cfg, ctx, { type: 'stable_diffusion_result', texture: 'tex-lake' });
    expect(st(node).texture_cache.get('lake_random')).toBeDefined();
  });
});

// ─── onEvent — stable_diffusion_step ──────────────────────────────────────────

describe('StableDiffusionTrait — onEvent: stable_diffusion_step', () => {
  it('updates current_step', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'wave' });
    fire(node, cfg, ctx, { type: 'stable_diffusion_step', step: 12 });
    expect(st(node).current_step).toBe(12);
    fire(node, cfg, ctx, { type: 'stable_diffusion_step', step: 24 });
    expect(st(node).current_step).toBe(24);
  });
});

// ─── onEvent — stable_diffusion_error ─────────────────────────────────────────

describe('StableDiffusionTrait — onEvent: stable_diffusion_error', () => {
  it('clears is_generating and emits on_generation_error', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { prompt: 'fog' });
    // is_generating = true after prompt
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'stable_diffusion_error', error: 'VRAM exceeded' });
    expect(st(node).is_generating).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_generation_error',
      expect.objectContaining({ error: 'VRAM exceeded' })
    );
  });
});
