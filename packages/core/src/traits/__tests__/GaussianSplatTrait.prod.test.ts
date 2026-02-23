/**
 * GaussianSplatTrait — Production Test Suite
 *
 * gaussianSplatHandler stores state on node.__gaussianSplatState.
 *
 * Key behaviours:
 * 1. defaultConfig — 11 fields
 * 2. onAttach — state init; calls loadSplatScene when config.source non-empty
 * 3. onDetach — emits splat_destroy when renderHandle set; removes state
 * 4. onUpdate — no-op when !isLoaded; camera move >0.1 sets needsSort;
 *    sort_mode!='radix' emits splat_sort and clears needsSort
 * 5. onEvent — splat_load_complete, splat_load_error, splat_load_progress,
 *              splat_visibility_update, splat_set_source, splat_set_quality, splat_query
 */
import { describe, it, expect, vi } from 'vitest';
import { gaussianSplatHandler } from '../GaussianSplatTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(id = 'splat_node') {
  return { id, properties: {} };
}

function makeCtx() {
  return { emit: vi.fn(), camera: { position: { x: 0, y: 0, z: 0 } } };
}

function attach(cfg: Partial<typeof gaussianSplatHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...gaussianSplatHandler.defaultConfig!, ...cfg };
  gaussianSplatHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('gaussianSplatHandler.defaultConfig', () => {
  const d = gaussianSplatHandler.defaultConfig!;
  it('source=""', () => expect(d.source).toBe(''));
  it('format=ply', () => expect(d.format).toBe('ply'));
  it('quality=medium', () => expect(d.quality).toBe('medium'));
  it('max_splats=1000000', () => expect(d.max_splats).toBe(1000000));
  it('sort_mode=distance', () => expect(d.sort_mode).toBe('distance'));
  it('streaming=false', () => expect(d.streaming).toBe(false));
  it('compression=true', () => expect(d.compression).toBe(true));
  it('sh_degree=3', () => expect(d.sh_degree).toBe(3));
  it('cull_invisible=true', () => expect(d.cull_invisible).toBe(true));
  it('alpha_threshold=0.01', () => expect(d.alpha_threshold).toBe(0.01));
  it('scale_modifier=1.0', () => expect(d.scale_modifier).toBe(1.0));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('gaussianSplatHandler.onAttach', () => {
  it('initialises __gaussianSplatState', () => {
    const { node } = attach();
    expect((node as any).__gaussianSplatState).toBeDefined();
  });

  it('isLoaded=false, isLoading=false, splatCount=0 initially (no source)', () => {
    const { node } = attach({ source: '' });
    const s = (node as any).__gaussianSplatState;
    expect(s.isLoaded).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.splatCount).toBe(0);
  });

  it('emits splat_load when source is set', () => {
    const { ctx } = attach({ source: 'scene.ply' });
    expect(ctx.emit).toHaveBeenCalledWith('splat_load', expect.objectContaining({ source: 'scene.ply' }));
  });

  it('splat_load emission has format + shDegree', () => {
    const { ctx } = attach({ source: 'x.splat', format: 'splat', sh_degree: 0 });
    expect(ctx.emit).toHaveBeenCalledWith('splat_load', expect.objectContaining({ format: 'splat', shDegree: 0 }));
  });

  it('sets isLoading=true when source non-empty', () => {
    const { node } = attach({ source: 'scene.ply' });
    expect((node as any).__gaussianSplatState.isLoading).toBe(true);
  });

  it('no splat_load when source is empty', () => {
    const { ctx } = attach({ source: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_load', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('gaussianSplatHandler.onDetach', () => {
  it('emits splat_destroy when renderHandle is set', () => {
    const { node, ctx, config } = attach();
    (node as any).__gaussianSplatState.renderHandle = 'handle_abc';
    ctx.emit.mockClear();
    gaussianSplatHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('splat_destroy', expect.any(Object));
  });

  it('does NOT emit splat_destroy when renderHandle is null', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gaussianSplatHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_destroy', expect.anything());
  });

  it('removes __gaussianSplatState', () => {
    const { node, ctx, config } = attach();
    gaussianSplatHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__gaussianSplatState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('gaussianSplatHandler.onUpdate', () => {
  it('no-op when isLoaded=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('sets lastCameraPosition on first call', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    ctx.camera.position = { x: 1, y: 2, z: 3 };
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.lastCameraPosition).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('sets needsSort=true when camera moves >0.1 units (verified via radix mode)', () => {
    // Use radix sort_mode: camera move sets needsSort=true but radix skips the emit+clear
    const { node, ctx, config } = attach({ sort_mode: 'radix' });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    // Pre-set lastCameraPosition so onUpdate enters the comparison branch
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.camera.position = { x: 0, y: 0, z: 0.2 }; // moved 0.2 > 0.1
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.needsSort).toBe(true);
  });

  it('does NOT set needsSort when camera moves <=0.1 units', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.needsSort = false;
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.camera.position = { x: 0, y: 0, z: 0.05 }; // moved 0.05 ≤ 0.1
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.needsSort).toBe(false);
  });

  it('emits splat_sort when needsSort=true and sort_mode!=radix', () => {
    const { node, ctx, config } = attach({ sort_mode: 'distance' });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.needsSort = true;
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('splat_sort', expect.objectContaining({ mode: 'distance' }));
    expect(state.needsSort).toBe(false);
  });

  it('does NOT emit splat_sort when sort_mode=radix', () => {
    const { node, ctx, config } = attach({ sort_mode: 'radix' });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.needsSort = true;
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_sort', expect.anything());
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('gaussianSplatHandler.onEvent — splat_load_complete', () => {
  it('sets isLoaded=true and splatCount', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gaussianSplatState;
    state.isLoading = true;
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_load_complete', splatCount: 500000, memoryUsage: 128, boundingBox: { min: [-1,-1,-1], max: [1,1,1] }, renderHandle: 'h1',
    });
    expect(state.isLoaded).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.splatCount).toBe(500000);
    expect(state.renderHandle).toBe('h1');
    expect(state.needsSort).toBe(true);
  });

  it('emits on_splat_loaded', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_load_complete', splatCount: 100, memoryUsage: 4, boundingBox: { min: [0,0,0], max: [1,1,1] }, renderHandle: 'h',
    });
    expect(ctx.emit).toHaveBeenCalledWith('on_splat_loaded', expect.objectContaining({ splatCount: 100 }));
  });
});

describe('gaussianSplatHandler.onEvent — splat_load_error', () => {
  it('sets isLoading=false and emits on_splat_error', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gaussianSplatState;
    state.isLoading = true;
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, { type: 'splat_load_error', error: 'network timeout' });
    expect(state.isLoading).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('on_splat_error', expect.objectContaining({ error: 'network timeout' }));
  });
});

describe('gaussianSplatHandler.onEvent — splat_load_progress', () => {
  it('emits on_splat_progress', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, { type: 'splat_load_progress', progress: 0.5, loadedSplats: 50000 });
    expect(ctx.emit).toHaveBeenCalledWith('on_splat_progress', expect.objectContaining({ progress: 0.5, loadedSplats: 50000 }));
  });
});

describe('gaussianSplatHandler.onEvent — splat_visibility_update', () => {
  it('updates visibleSplats', () => {
    const { node, ctx, config } = attach();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, { type: 'splat_visibility_update', visibleCount: 42000 });
    expect((node as any).__gaussianSplatState.visibleSplats).toBe(42000);
  });
});

describe('gaussianSplatHandler.onEvent — splat_set_source', () => {
  it('emits splat_destroy then splat_load for a new source', () => {
    const { node, ctx, config } = attach({ source: 'old.ply' });
    const state = (node as any).__gaussianSplatState;
    state.renderHandle = 'existing_handle';
    state.isLoaded = true;
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, { type: 'splat_set_source', source: 'new.ply' });
    expect(ctx.emit).toHaveBeenCalledWith('splat_destroy', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('splat_load', expect.objectContaining({ source: 'new.ply' }));
    expect(state.isLoaded).toBe(false);
    expect(state.splatCount).toBe(0);
  });

  it('no-op when source is same as config.source', () => {
    const { node, ctx, config } = attach({ source: 'same.ply' });
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, { type: 'splat_set_source', source: 'same.ply' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

describe('gaussianSplatHandler.onEvent — splat_set_quality', () => {
  it('emits splat_update_quality', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, { type: 'splat_set_quality', quality: 'ultra' });
    expect(ctx.emit).toHaveBeenCalledWith('splat_update_quality', expect.objectContaining({ quality: 'ultra' }));
  });
});

describe('gaussianSplatHandler.onEvent — splat_query', () => {
  it('emits splat_info snapshot', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.splatCount = 999;
    state.visibleSplats = 500;
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, { type: 'splat_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith('splat_info', expect.objectContaining({
      queryId: 'q1', isLoaded: true, splatCount: 999, visibleSplats: 500,
    }));
  });
});
