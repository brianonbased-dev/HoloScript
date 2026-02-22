/**
 * AiUpscalingTrait — Production Test Suite
 *
 * Tests: defaultConfig, neuralUpscalingHandler alias, onAttach (state + auto-kick for texture/rendertarget),
 * onDetach (cancel if processing + cache clear), onUpdate (live-mode 2s timer),
 * onEvent ai_upscaling_result (cache + apply_to_material + on_upscaling_complete),
 * ai_upscaling_request (dedup when processing), ai_upscaling_error.
 */
import { describe, it, expect, vi } from 'vitest';
import { aiUpscalingHandler, neuralUpscalingHandler } from '../AiUpscalingTrait';

function makeNode() { return { id: 'upscale_node' }; }
function makeContext() { return { emit: vi.fn() }; }
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...aiUpscalingHandler.defaultConfig!, ...config };
  aiUpscalingHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('aiUpscalingHandler.defaultConfig', () => {
  it('upscale_model = realesrgan', () => expect(aiUpscalingHandler.defaultConfig!.upscale_model).toBe('realesrgan'));
  it('scale_factor = 4', () => expect(aiUpscalingHandler.defaultConfig!.scale_factor).toBe(4));
  it('tile_size = 512', () => expect(aiUpscalingHandler.defaultConfig!.tile_size).toBe(512));
  it('denoise_strength = 0.5', () => expect(aiUpscalingHandler.defaultConfig!.denoise_strength).toBe(0.5));
  it('input_source = texture', () => expect(aiUpscalingHandler.defaultConfig!.input_source).toBe('texture'));
  it('output_resolution = undefined', () => expect(aiUpscalingHandler.defaultConfig!.output_resolution).toBeUndefined());
  it('preserve_details = true', () => expect(aiUpscalingHandler.defaultConfig!.preserve_details).toBe(true));
  it('apply_to_material = true', () => expect(aiUpscalingHandler.defaultConfig!.apply_to_material).toBe(true));
});

// ─── neuralUpscalingHandler alias ────────────────────────────────────────────

describe('neuralUpscalingHandler', () => {
  it('name = neural_upscaling', () => expect((neuralUpscalingHandler as any).name).toBe('neural_upscaling'));
  it('upscale_model = swinir', () => expect(neuralUpscalingHandler.defaultConfig!.upscale_model).toBe('swinir'));
  it('preserve_details = true', () => expect(neuralUpscalingHandler.defaultConfig!.preserve_details).toBe(true));
  it('scale_factor inherited from aiUpscalingHandler (4)', () => expect(neuralUpscalingHandler.defaultConfig!.scale_factor).toBe(4));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('aiUpscalingHandler.onAttach', () => {
  it('creates __aiUpscalingState on node', () => {
    const { node } = attachNode();
    expect((node as any).__aiUpscalingState).toBeDefined();
  });
  it('is_processing = false initially', () => {
    const { node } = attachNode({ input_source: 'live' }); // live doesn't auto-kick
    expect((node as any).__aiUpscalingState.is_processing).toBe(false);
  });
  it('output_texture = null initially', () => {
    const { node } = attachNode({ input_source: 'live' });
    expect((node as any).__aiUpscalingState.output_texture).toBeNull();
  });
  it('cache is a Map', () => {
    const { node } = attachNode({ input_source: 'live' });
    expect((node as any).__aiUpscalingState.cache).toBeInstanceOf(Map);
  });
  it('emits ai_upscaling_init with model and scaleFactor', () => {
    const { ctx } = attachNode({ upscale_model: 'swinir', scale_factor: 2 });
    expect(ctx.emit).toHaveBeenCalledWith('ai_upscaling_init', expect.objectContaining({ model: 'swinir', scaleFactor: 2 }));
  });
  it('auto-kicks ai_upscaling_request for input_source=texture', () => {
    const { ctx } = attachNode({ input_source: 'texture' });
    expect(ctx.emit).toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
  });
  it('auto-kicks ai_upscaling_request for input_source=rendertarget', () => {
    const { ctx } = attachNode({ input_source: 'rendertarget' });
    expect(ctx.emit).toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
  });
  it('sets is_processing=true when auto-kick fires', () => {
    const { node } = attachNode({ input_source: 'texture' });
    expect((node as any).__aiUpscalingState.is_processing).toBe(true);
  });
  it('does NOT auto-kick for input_source=live', () => {
    const { ctx } = attachNode({ input_source: 'live' });
    const calls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'ai_upscaling_request');
    expect(calls).toHaveLength(0);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('aiUpscalingHandler.onDetach', () => {
  it('removes __aiUpscalingState', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'live' });
    aiUpscalingHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__aiUpscalingState).toBeUndefined();
  });
  it('emits ai_upscaling_cancel when is_processing=true', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture' }); // auto-kicks → is_processing=true
    ctx.emit.mockClear();
    aiUpscalingHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('ai_upscaling_cancel', expect.any(Object));
  });
  it('does NOT emit ai_upscaling_cancel when not processing', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'live' });
    ctx.emit.mockClear();
    aiUpscalingHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('ai_upscaling_cancel', expect.any(Object));
  });
});

// ─── onUpdate — live mode 2s timer ───────────────────────────────────────────

describe('aiUpscalingHandler.onUpdate (live mode)', () => {
  it('does nothing when input_source != live', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture' });
    (node as any).__aiUpscalingState.is_processing = false;
    (node as any).__aiUpscalingState.last_upscale = 3000; // over threshold
    ctx.emit.mockClear();
    aiUpscalingHandler.onUpdate!(node, cfg, ctx, 0.016);
    // texture source → early return
    expect(ctx.emit).not.toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
  });
  it('does nothing while is_processing=true (live mode)', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'live' });
    (node as any).__aiUpscalingState.is_processing = true;
    (node as any).__aiUpscalingState.last_upscale = 3000;
    ctx.emit.mockClear();
    aiUpscalingHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
  });
  it('does not fire when timer < 2s', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'live' });
    (node as any).__aiUpscalingState.is_processing = false;
    (node as any).__aiUpscalingState.last_upscale = 0; // just started
    ctx.emit.mockClear();
    aiUpscalingHandler.onUpdate!(node, cfg, ctx, 0.016); // adds 16ms, not ≥2000
    expect(ctx.emit).not.toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
  });
  it('fires ai_upscaling_request and sets is_processing=true when timer >= 2s', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'live' });
    (node as any).__aiUpscalingState.is_processing = false;
    (node as any).__aiUpscalingState.last_upscale = 1990; // just under, step adds 1000ms*10 = needs 2000ms
    ctx.emit.mockClear();
    // Large delta to cross 2000ms threshold: 0.1s → adds 100ms → 1990+100=2090 >= 2000
    aiUpscalingHandler.onUpdate!(node, cfg, ctx, 0.1);
    expect(ctx.emit).toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
    expect((node as any).__aiUpscalingState.is_processing).toBe(true);
  });
  it('resets last_upscale to 0 after firing', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'live' });
    (node as any).__aiUpscalingState.is_processing = false;
    (node as any).__aiUpscalingState.last_upscale = 1990;
    aiUpscalingHandler.onUpdate!(node, cfg, ctx, 0.1);
    expect((node as any).__aiUpscalingState.last_upscale).toBe(0);
  });
});

// ─── onEvent — ai_upscaling_result ───────────────────────────────────────────

describe('aiUpscalingHandler.onEvent — ai_upscaling_result', () => {
  it('sets is_processing=false', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture' });
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_result', texture: 'tex_hd', processingTime: 250 });
    expect((node as any).__aiUpscalingState.is_processing).toBe(false);
  });
  it('sets output_texture', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture' });
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_result', texture: 'tex_hd', processingTime: 250 });
    expect((node as any).__aiUpscalingState.output_texture).toBe('tex_hd');
  });
  it('caches result by model_scaleFactor key', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture', upscale_model: 'esrgan', scale_factor: 2 });
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_result', texture: 'tex_2x', processingTime: 100 });
    const cached = (node as any).__aiUpscalingState.cache.get('esrgan_2x');
    expect(cached).toBeDefined();
    expect(cached.texture).toBe('tex_2x');
  });
  it('emits material_set_texture when apply_to_material=true', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture', apply_to_material: true });
    ctx.emit.mockClear();
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_result', texture: 'hd_tex', processingTime: 50 });
    expect(ctx.emit).toHaveBeenCalledWith('material_set_texture', expect.objectContaining({ texture: 'hd_tex' }));
  });
  it('does NOT emit material_set_texture when apply_to_material=false', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture', apply_to_material: false });
    ctx.emit.mockClear();
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_result', texture: 'hd_tex', processingTime: 50 });
    expect(ctx.emit).not.toHaveBeenCalledWith('material_set_texture', expect.any(Object));
  });
  it('emits on_upscaling_complete with texture, model, scaleFactor, processingTime', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture', upscale_model: 'swinir', scale_factor: 4 });
    ctx.emit.mockClear();
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_result', texture: 'out', processingTime: 300 });
    expect(ctx.emit).toHaveBeenCalledWith('on_upscaling_complete', expect.objectContaining({ texture: 'out', model: 'swinir', scaleFactor: 4, processingTime: 300 }));
  });
});

// ─── onEvent — ai_upscaling_request (dedup) ───────────────────────────────────

describe('aiUpscalingHandler.onEvent — ai_upscaling_request (manual)', () => {
  it('triggers new request when not processing', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'live' });
    (node as any).__aiUpscalingState.is_processing = false;
    ctx.emit.mockClear();
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_request' });
    expect(ctx.emit).toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
    expect((node as any).__aiUpscalingState.is_processing).toBe(true);
  });
  it('does NOT re-trigger when already processing (dedup)', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture' }); // auto-kick → is_processing=true
    ctx.emit.mockClear();
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_request' });
    expect(ctx.emit).not.toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
  });
});

// ─── onEvent — ai_upscaling_error ────────────────────────────────────────────

describe('aiUpscalingHandler.onEvent — ai_upscaling_error', () => {
  it('clears is_processing', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture' });
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_error', error: 'OOM' });
    expect((node as any).__aiUpscalingState.is_processing).toBe(false);
  });
  it('emits on_upscaling_error with error and model', () => {
    const { node, cfg, ctx } = attachNode({ input_source: 'texture', upscale_model: 'ldm' });
    ctx.emit.mockClear();
    aiUpscalingHandler.onEvent!(node, cfg, ctx, { type: 'ai_upscaling_error', error: 'VRAM_LIMIT' });
    expect(ctx.emit).toHaveBeenCalledWith('on_upscaling_error', expect.objectContaining({ error: 'VRAM_LIMIT', model: 'ldm' }));
  });
});
