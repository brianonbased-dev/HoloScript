/**
 * GaussianSplatTrait — Production Test Suite
 *
 * gaussianSplatHandler stores state on node.__gaussianSplatState.
 *
 * Key behaviours:
 * 1. defaultConfig — 15 fields (11 original + 4 v4.1: lod, temporal_mode, gaussian_budget, spz)
 * 2. onAttach — state init; calls loadSplatScene when config.source non-empty
 * 3. onDetach — emits splat_destroy when renderHandle set; removes state
 * 4. onUpdate — no-op when !isLoaded; camera move >0.1 sets needsSort;
 *    sort_mode!='radix' emits splat_sort and clears needsSort;
 *    LOD evaluation emits splat_lod_change on level transitions;
 *    budget enforcement emits splat_budget_exceeded when over cap
 * 5. onEvent — splat_load_complete, splat_load_error, splat_load_progress,
 *              splat_visibility_update, splat_set_source, splat_set_quality, splat_query,
 *              splat_set_lod, splat_set_budget, splat_set_temporal_mode, splat_temporal_advance
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

  // v4.1 defaults
  it('lod.octree_depth=0', () => expect(d.lod.octree_depth).toBe(0));
  it('lod.mode=none', () => expect(d.lod.mode).toBe('none'));
  it('lod.anchor_thresholds=[]', () => expect(d.lod.anchor_thresholds).toEqual([]));
  it('temporal_mode=static', () => expect(d.temporal_mode).toBe('static'));
  it('gaussian_budget.total_cap=0', () => expect(d.gaussian_budget.total_cap).toBe(0));
  it('gaussian_budget.per_avatar_reservation=0', () => expect(d.gaussian_budget.per_avatar_reservation).toBe(0));
  it('spz.version=2.0', () => expect(d.spz.version).toBe('2.0'));
  it('spz.quaternion_encoding=smallest_three', () => expect(d.spz.quaternion_encoding).toBe('smallest_three'));
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

  it('initialises v4.1 state fields', () => {
    const { node } = attach({ source: '' });
    const s = (node as any).__gaussianSplatState;
    expect(s.currentLODLevel).toBe(0);
    expect(s.gaussianBudgetUsed).toBe(0);
    expect(s.temporalFrameIndex).toBe(0);
  });

  it('emits splat_load when source is set', () => {
    const { ctx } = attach({ source: 'scene.ply' });
    expect(ctx.emit).toHaveBeenCalledWith('splat_load', expect.objectContaining({ source: 'scene.ply' }));
  });

  it('splat_load emission has format + shDegree', () => {
    const { ctx } = attach({ source: 'x.splat', format: 'splat', sh_degree: 0 });
    expect(ctx.emit).toHaveBeenCalledWith('splat_load', expect.objectContaining({ format: 'splat', shDegree: 0 }));
  });

  it('splat_load emission includes v4.1 fields', () => {
    const { ctx } = attach({ source: 'scene.spz', format: 'spz' });
    expect(ctx.emit).toHaveBeenCalledWith('splat_load', expect.objectContaining({
      format: 'spz',
      lod: expect.objectContaining({ mode: 'none' }),
      temporalMode: 'static',
      gaussianBudget: expect.objectContaining({ total_cap: 0 }),
      spz: expect.objectContaining({ version: '2.0' }),
    }));
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
    const { node, ctx, config } = attach({ sort_mode: 'radix' });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.camera.position = { x: 0, y: 0, z: 0.2 };
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.needsSort).toBe(true);
  });

  it('does NOT set needsSort when camera moves <=0.1 units', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.needsSort = false;
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.camera.position = { x: 0, y: 0, z: 0.05 };
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

// ─── onUpdate — LOD (v4.1) ───────────────────────────────────────────────────

describe('gaussianSplatHandler.onUpdate — LOD', () => {
  it('emits splat_lod_change when camera crosses threshold', () => {
    const { node, ctx, config } = attach({
      lod: { octree_depth: 4, mode: 'octree', anchor_thresholds: [5, 15, 30] },
    });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.boundingBox = { min: [0, 0, 0], max: [10, 10, 10] };
    state.lastCameraPosition = { x: 5, y: 5, z: 5 }; // at scene center, dist=0 -> level 0
    // Move camera far from scene center
    ctx.camera.position = { x: 5, y: 5, z: 50 }; // dist ~45 from center(5,5,5) -> beyond threshold 30 -> level 3
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('splat_lod_change', expect.objectContaining({
      previousLevel: 0,
      currentLevel: 3,
      mode: 'octree',
    }));
  });

  it('does NOT emit splat_lod_change when lod.mode=none', () => {
    const { node, ctx, config } = attach({
      lod: { octree_depth: 4, mode: 'none', anchor_thresholds: [5, 15, 30] },
    });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.boundingBox = { min: [0, 0, 0], max: [10, 10, 10] };
    state.lastCameraPosition = { x: 5, y: 5, z: 5 };
    ctx.camera.position = { x: 5, y: 5, z: 50 };
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_lod_change', expect.anything());
  });

  it('does NOT emit splat_lod_change when LOD level stays the same', () => {
    const { node, ctx, config } = attach({
      lod: { octree_depth: 4, mode: 'octree', anchor_thresholds: [5, 15, 30] },
    });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.boundingBox = { min: [0, 0, 0], max: [10, 10, 10] };
    // Camera close to center -> level 0, stays 0
    state.lastCameraPosition = { x: 5, y: 5, z: 5 };
    state.currentLODLevel = 0;
    ctx.camera.position = { x: 5, y: 5.2, z: 5 }; // barely moved, still within threshold 0
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_lod_change', expect.anything());
  });

  it('computes LOD level correctly at intermediate distance', () => {
    const { node, ctx, config } = attach({
      lod: { octree_depth: 4, mode: 'distance', anchor_thresholds: [5, 15, 30] },
    });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.boundingBox = { min: [0, 0, 0], max: [0, 0, 0] }; // center at origin
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.camera.position = { x: 10, y: 0, z: 0 }; // dist=10, above 5 but below 15 -> level 1
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('splat_lod_change', expect.objectContaining({
      currentLevel: 1,
    }));
    expect(state.currentLODLevel).toBe(1);
  });
});

// ─── onUpdate — Gaussian Budget (v4.1) ───────────────────────────────────────

describe('gaussianSplatHandler.onUpdate — Gaussian Budget', () => {
  it('emits splat_budget_exceeded when splatCount exceeds total_cap', () => {
    const { node, ctx, config } = attach({
      gaussian_budget: { total_cap: 180000, per_avatar_reservation: 60000 },
    });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.splatCount = 200000; // exceeds 180000
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('splat_budget_exceeded', expect.objectContaining({
      current: 200000,
      cap: 180000,
      overage: 20000,
    }));
  });

  it('does NOT emit splat_budget_exceeded when under budget', () => {
    const { node, ctx, config } = attach({
      gaussian_budget: { total_cap: 180000, per_avatar_reservation: 60000 },
    });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.splatCount = 150000; // under 180000
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_budget_exceeded', expect.anything());
  });

  it('does NOT emit splat_budget_exceeded when total_cap=0 (disabled)', () => {
    const { node, ctx, config } = attach({
      gaussian_budget: { total_cap: 0, per_avatar_reservation: 0 },
    });
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.splatCount = 500000;
    state.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.emit.mockClear();
    gaussianSplatHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_budget_exceeded', expect.anything());
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

  it('sets gaussianBudgetUsed on load complete', () => {
    const { node, ctx, config } = attach();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_load_complete', splatCount: 120000, memoryUsage: 64, boundingBox: { min: [0,0,0], max: [1,1,1] }, renderHandle: 'h',
    });
    expect((node as any).__gaussianSplatState.gaussianBudgetUsed).toBe(120000);
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
  it('emits splat_info snapshot with v4.1 fields', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__gaussianSplatState;
    state.isLoaded = true;
    state.splatCount = 999;
    state.visibleSplats = 500;
    state.currentLODLevel = 2;
    state.gaussianBudgetUsed = 999;
    state.temporalFrameIndex = 7;
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, { type: 'splat_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith('splat_info', expect.objectContaining({
      queryId: 'q1', isLoaded: true, splatCount: 999, visibleSplats: 500,
      currentLODLevel: 2,
      gaussianBudgetUsed: 999,
      temporalFrameIndex: 7,
    }));
  });
});

// ─── onEvent — v4.1 handlers ─────────────────────────────────────────────────

describe('gaussianSplatHandler.onEvent — splat_set_lod (v4.1)', () => {
  it('emits splat_update_lod with new LOD config', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_set_lod',
      mode: 'octree',
      octree_depth: 6,
      anchor_thresholds: [5, 10, 20, 40],
    });
    expect(ctx.emit).toHaveBeenCalledWith('splat_update_lod', expect.objectContaining({
      mode: 'octree',
      octree_depth: 6,
      anchor_thresholds: [5, 10, 20, 40],
    }));
  });

  it('uses config defaults when partial event', () => {
    const { node, ctx, config } = attach({
      lod: { octree_depth: 4, mode: 'distance', anchor_thresholds: [10, 20] },
    });
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_set_lod',
      mode: 'octree',
      // octree_depth and anchor_thresholds omitted -> falls back to config
    });
    expect(ctx.emit).toHaveBeenCalledWith('splat_update_lod', expect.objectContaining({
      mode: 'octree',
      octree_depth: 4,
      anchor_thresholds: [10, 20],
    }));
  });
});

describe('gaussianSplatHandler.onEvent — splat_set_budget (v4.1)', () => {
  it('emits splat_update_budget with new limits', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_set_budget',
      total_cap: 180000,
      per_avatar_reservation: 60000,
    });
    expect(ctx.emit).toHaveBeenCalledWith('splat_update_budget', expect.objectContaining({
      total_cap: 180000,
      per_avatar_reservation: 60000,
    }));
  });

  it('uses config defaults when partial event', () => {
    const { node, ctx, config } = attach({
      gaussian_budget: { total_cap: 200000, per_avatar_reservation: 50000 },
    });
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_set_budget',
      total_cap: 180000,
      // per_avatar_reservation omitted -> falls back to config
    });
    expect(ctx.emit).toHaveBeenCalledWith('splat_update_budget', expect.objectContaining({
      total_cap: 180000,
      per_avatar_reservation: 50000,
    }));
  });
});

describe('gaussianSplatHandler.onEvent — splat_set_temporal_mode (v4.1)', () => {
  it('emits splat_update_temporal and resets frame index', () => {
    const { node, ctx, config } = attach({ temporal_mode: 'static' });
    const state = (node as any).__gaussianSplatState;
    state.temporalFrameIndex = 42; // should be reset
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_set_temporal_mode',
      temporal_mode: '4d',
    });
    expect(state.temporalFrameIndex).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('splat_update_temporal', expect.objectContaining({
      temporal_mode: '4d',
      previousMode: 'static',
    }));
  });
});

describe('gaussianSplatHandler.onEvent — splat_temporal_advance (v4.1)', () => {
  it('advances frame index in 4d mode', () => {
    const { node, ctx, config } = attach({ temporal_mode: '4d' });
    const state = (node as any).__gaussianSplatState;
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_temporal_advance',
      frameIndex: 15,
    });
    expect(state.temporalFrameIndex).toBe(15);
    expect(ctx.emit).toHaveBeenCalledWith('splat_temporal_frame', expect.objectContaining({
      frameIndex: 15,
      temporal_mode: '4d',
    }));
  });

  it('advances frame index in streaming mode', () => {
    const { node, ctx, config } = attach({ temporal_mode: 'streaming' });
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_temporal_advance',
      frameIndex: 100,
    });
    expect((node as any).__gaussianSplatState.temporalFrameIndex).toBe(100);
    expect(ctx.emit).toHaveBeenCalledWith('splat_temporal_frame', expect.objectContaining({
      frameIndex: 100,
      temporal_mode: 'streaming',
    }));
  });

  it('no-op in static mode', () => {
    const { node, ctx, config } = attach({ temporal_mode: 'static' });
    const state = (node as any).__gaussianSplatState;
    state.temporalFrameIndex = 0;
    ctx.emit.mockClear();
    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_temporal_advance',
      frameIndex: 10,
    });
    expect(state.temporalFrameIndex).toBe(0); // unchanged
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_temporal_frame', expect.anything());
  });
});
