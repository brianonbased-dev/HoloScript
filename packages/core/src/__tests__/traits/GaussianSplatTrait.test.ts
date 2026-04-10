/**
 * GaussianSplatTrait — Comprehensive Tests
 *
 * Coverage:
 *   Config & defaults:
 *   - defaultConfig has expected values (format, quality, sh_degree, etc.)
 *   - v4.1 defaults: lod, temporal_mode, gaussian_budget, spz
 *
 *   onAttach:
 *   - State initialized with isLoaded=false, splatCount=0
 *   - v4.1 state: currentLODLevel=0, gaussianBudgetUsed=0, temporalFrameIndex=0
 *   - splat_load emitted when source provided (includes v4.1 fields)
 *   - No splat_load when source is empty
 *
 *   onDetach:
 *   - State cleaned up from node
 *   - splat_destroy emitted when renderHandle exists
 *
 *   onUpdate:
 *   - No-op when not loaded
 *   - needsSort set true when camera moves > 0.1 units
 *   - splat_sort emitted with camera position
 *   - No splat_sort when sort_mode='radix'
 *   - No re-sort if camera hasn't moved
 *   - LOD evaluation emits splat_lod_change on level transitions (v4.1)
 *   - Budget enforcement emits splat_budget_exceeded when over cap (v4.1)
 *
 *   onEvent(splat_load_complete):
 *   - isLoaded=true, splatCount set, gaussianBudgetUsed set
 *   - on_splat_loaded emitted
 *   - needsSort set true
 *
 *   onEvent(splat_load_error):
 *   - isLoading=false, on_splat_error emitted
 *
 *   onEvent(splat_load_progress):
 *   - on_splat_progress emitted with progress value
 *
 *   onEvent(splat_set_source):
 *   - splat_destroy emitted for old handle, new load triggered
 *   - Same source = no action
 *
 *   onEvent(splat_set_quality):
 *   - splat_update_quality emitted
 *
 *   onEvent(splat_query):
 *   - splat_info emitted with full state (including v4.1 fields)
 *
 *   onEvent(splat_visibility_update):
 *   - visibleSplats updated
 *
 *   onEvent(splat_set_lod) (v4.1):
 *   - splat_update_lod emitted with merged config
 *
 *   onEvent(splat_set_budget) (v4.1):
 *   - splat_update_budget emitted with merged config
 *
 *   onEvent(splat_set_temporal_mode) (v4.1):
 *   - splat_update_temporal emitted, frame index reset
 *
 *   onEvent(splat_temporal_advance) (v4.1):
 *   - frame index advanced in 4d/streaming modes, no-op in static
 *
 *   No state guard: onEvent before onAttach doesn't crash
 */

import { describe, it, expect } from 'vitest';
import { gaussianSplatHandler } from '../../traits/GaussianSplatTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'splat-1'): Record<string, unknown> {
  return { id, properties: {} };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return { ...gaussianSplatHandler.defaultConfig, ...overrides } as any;
}

function makeContext() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    emit: (event: string, data: unknown) => emitted.push({ event, data }),
    emitted,
    camera: null as any,
  };
}

function getState(node: Record<string, unknown>) {
  return (node as any).__gaussianSplatState as any;
}

// =============================================================================
// Config defaults
// =============================================================================

describe('GaussianSplatTrait — defaultConfig', () => {
  it('has correct default format and quality', () => {
    expect(gaussianSplatHandler.defaultConfig!.format).toBe('ply');
    expect(gaussianSplatHandler.defaultConfig!.quality).toBe('medium');
  });

  it('has sh_degree=3 by default', () => {
    expect(gaussianSplatHandler.defaultConfig!.sh_degree).toBe(3);
  });

  it('has max_splats=1000000 by default', () => {
    expect(gaussianSplatHandler.defaultConfig!.max_splats).toBe(1000000);
  });

  // v4.1 defaults
  it('has lod defaults (mode=none, depth=0, empty thresholds)', () => {
    const d = gaussianSplatHandler.defaultConfig!;
    expect(d.lod.mode).toBe('none');
    expect(d.lod.octree_depth).toBe(0);
    expect(d.lod.anchor_thresholds).toEqual([]);
  });

  it('has temporal_mode=static by default', () => {
    expect(gaussianSplatHandler.defaultConfig!.temporal_mode).toBe('static');
  });

  it('has gaussian_budget defaults (cap=0, reservation=0)', () => {
    const d = gaussianSplatHandler.defaultConfig!;
    expect(d.gaussian_budget.total_cap).toBe(0);
    expect(d.gaussian_budget.per_avatar_reservation).toBe(0);
  });

  it('has spz defaults (version=2.0, quaternion_encoding=smallest_three)', () => {
    const d = gaussianSplatHandler.defaultConfig!;
    expect(d.spz.version).toBe('2.0');
    expect(d.spz.quaternion_encoding).toBe('smallest_three');
  });
});

// =============================================================================
// onAttach
// =============================================================================

describe('GaussianSplatTrait — onAttach', () => {
  it('initializes state with isLoaded=false', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    const st = getState(node);
    expect(st).toBeDefined();
    expect(st.isLoaded).toBe(false);
    expect(st.splatCount).toBe(0);
  });

  it('initializes v4.1 state fields', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    const st = getState(node);
    expect(st.currentLODLevel).toBe(0);
    expect(st.gaussianBudgetUsed).toBe(0);
    expect(st.temporalFrameIndex).toBe(0);
  });

  it('emits splat_load when source is provided', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: 'scene.ply' }), ctx as any);
    expect(ctx.emitted.some((e) => e.event === 'splat_load')).toBe(true);
  });

  it('splat_load payload includes source and shDegree', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(
      node as any,
      makeConfig({ source: 'room.ply', sh_degree: 2 }),
      ctx as any
    );
    const load = ctx.emitted.find((e) => e.event === 'splat_load');
    expect((load!.data as any).source).toBe('room.ply');
    expect((load!.data as any).shDegree).toBe(2);
  });

  it('splat_load payload includes v4.1 fields', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(
      node as any,
      makeConfig({ source: 'scene.spz', format: 'spz' }),
      ctx as any
    );
    const load = ctx.emitted.find((e) => e.event === 'splat_load');
    expect((load!.data as any).format).toBe('spz');
    expect((load!.data as any).lod).toBeDefined();
    expect((load!.data as any).temporalMode).toBe('static');
    expect((load!.data as any).gaussianBudget).toBeDefined();
    expect((load!.data as any).spz).toBeDefined();
    expect((load!.data as any).spz.version).toBe('2.0');
  });

  it('does NOT emit splat_load when source is empty', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    expect(ctx.emitted.some((e) => e.event === 'splat_load')).toBe(false);
  });
});

// =============================================================================
// onDetach
// =============================================================================

describe('GaussianSplatTrait — onDetach', () => {
  it('removes state from node', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    gaussianSplatHandler.onDetach!(node as any, makeConfig(), ctx as any);
    expect((node as any).__gaussianSplatState).toBeUndefined();
  });

  it('emits splat_destroy when renderHandle exists', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    getState(node).renderHandle = { id: 'handle-1' };
    ctx.emitted.length = 0;
    gaussianSplatHandler.onDetach!(node as any, makeConfig(), ctx as any);
    expect(ctx.emitted.some((e) => e.event === 'splat_destroy')).toBe(true);
  });

  it('no splat_destroy when renderHandle is null', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onDetach!(node as any, makeConfig(), ctx as any);
    expect(ctx.emitted.some((e) => e.event === 'splat_destroy')).toBe(false);
  });
});

// =============================================================================
// onUpdate
// =============================================================================

describe('GaussianSplatTrait — onUpdate', () => {
  function attachLoaded(config = {}) {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = makeConfig({ source: 'scene.ply', ...config });
    gaussianSplatHandler.onAttach!(node as any, cfg, ctx as any);
    const st = getState(node);
    st.isLoaded = true;
    st.splatCount = 5000;
    st.renderHandle = { id: 'h1' };
    ctx.emitted.length = 0;
    return { node, ctx, st, cfg };
  }

  it('no-op when state not loaded', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onUpdate!(node as any, makeConfig(), ctx as any, 16);
    expect(ctx.emitted).toHaveLength(0);
  });

  it('sets needsSort and emits splat_sort when camera moves', () => {
    const { node, ctx, st, cfg } = attachLoaded();
    st.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.camera = { position: { x: 1, y: 0, z: 0 } };

    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);

    expect(ctx.emitted.some((e) => e.event === 'splat_sort')).toBe(true);
    expect(st.needsSort).toBe(false);
  });

  it('no splat_sort when sort_mode=radix', () => {
    const { node, ctx, st, cfg } = attachLoaded({ sort_mode: 'radix' });
    st.lastCameraPosition = { x: 0, y: 0, z: 0 };
    st.needsSort = true;
    ctx.camera = { position: { x: 1, y: 0, z: 0 } };

    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(ctx.emitted.some((e) => e.event === 'splat_sort')).toBe(false);
  });

  it('sets initial camera position on first update', () => {
    const { node, ctx, st, cfg } = attachLoaded();
    st.lastCameraPosition = null;
    ctx.camera = { position: { x: 5, y: 5, z: 5 } };

    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(st.lastCameraPosition).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('no sort when camera moves less than threshold (0.1)', () => {
    const { node, ctx, st, cfg } = attachLoaded();
    st.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.camera = { position: { x: 0.05, y: 0, z: 0 } };

    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(ctx.emitted.some((e) => e.event === 'splat_sort')).toBe(false);
  });
});

// =============================================================================
// onUpdate — LOD (v4.1)
// =============================================================================

describe('GaussianSplatTrait — onUpdate LOD', () => {
  function attachLoadedWithLOD(lodConfig: Record<string, unknown> = {}) {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = makeConfig({
      source: 'scene.ply',
      lod: {
        octree_depth: 4,
        mode: 'octree',
        anchor_thresholds: [5, 15, 30],
        ...lodConfig,
      },
    });
    gaussianSplatHandler.onAttach!(node as any, cfg, ctx as any);
    const st = getState(node);
    st.isLoaded = true;
    st.splatCount = 100000;
    st.renderHandle = { id: 'h1' };
    st.boundingBox = { min: [0, 0, 0], max: [10, 10, 10] }; // center at (5,5,5)
    ctx.emitted.length = 0;
    return { node, ctx, st, cfg };
  }

  it('emits splat_lod_change when camera crosses threshold', () => {
    const { node, ctx, st, cfg } = attachLoadedWithLOD();
    st.lastCameraPosition = { x: 5, y: 5, z: 5 };
    // Camera at (5,5,50) -> dist from center (5,5,5) = 45 -> beyond 30 -> level 3
    ctx.camera = { position: { x: 5, y: 5, z: 50 } };
    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);

    const lodEvt = ctx.emitted.find((e) => e.event === 'splat_lod_change');
    expect(lodEvt).toBeDefined();
    expect((lodEvt!.data as any).previousLevel).toBe(0);
    expect((lodEvt!.data as any).currentLevel).toBe(3);
  });

  it('does NOT emit splat_lod_change when mode=none', () => {
    const { node, ctx, st, cfg } = attachLoadedWithLOD({ mode: 'none' });
    st.lastCameraPosition = { x: 5, y: 5, z: 5 };
    ctx.camera = { position: { x: 5, y: 5, z: 50 } };
    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(ctx.emitted.some((e) => e.event === 'splat_lod_change')).toBe(false);
  });

  it('does NOT emit splat_lod_change when level stays the same', () => {
    const { node, ctx, st, cfg } = attachLoadedWithLOD();
    st.lastCameraPosition = { x: 5, y: 5, z: 5 };
    st.currentLODLevel = 0;
    // Camera at center -> dist = 0 -> level 0 (same as current)
    ctx.camera = { position: { x: 5, y: 5.2, z: 5 } };
    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(ctx.emitted.some((e) => e.event === 'splat_lod_change')).toBe(false);
  });
});

// =============================================================================
// onUpdate — Budget (v4.1)
// =============================================================================

describe('GaussianSplatTrait — onUpdate Budget', () => {
  function attachWithBudget(
    budget: { total_cap: number; per_avatar_reservation: number },
    splatCount: number
  ) {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = makeConfig({ source: 'scene.ply', gaussian_budget: budget });
    gaussianSplatHandler.onAttach!(node as any, cfg, ctx as any);
    const st = getState(node);
    st.isLoaded = true;
    st.splatCount = splatCount;
    st.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.emitted.length = 0;
    return { node, ctx, st, cfg };
  }

  it('emits splat_budget_exceeded when over cap', () => {
    const { node, ctx, cfg } = attachWithBudget(
      { total_cap: 180000, per_avatar_reservation: 60000 },
      200000
    );
    ctx.camera = { position: { x: 0, y: 0, z: 0 } };
    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    const evt = ctx.emitted.find((e) => e.event === 'splat_budget_exceeded');
    expect(evt).toBeDefined();
    expect((evt!.data as any).current).toBe(200000);
    expect((evt!.data as any).cap).toBe(180000);
    expect((evt!.data as any).overage).toBe(20000);
  });

  it('does NOT emit splat_budget_exceeded when under cap', () => {
    const { node, ctx, cfg } = attachWithBudget(
      { total_cap: 180000, per_avatar_reservation: 60000 },
      150000
    );
    ctx.camera = { position: { x: 0, y: 0, z: 0 } };
    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(ctx.emitted.some((e) => e.event === 'splat_budget_exceeded')).toBe(false);
  });

  it('does NOT emit when total_cap=0 (disabled)', () => {
    const { node, ctx, cfg } = attachWithBudget(
      { total_cap: 0, per_avatar_reservation: 0 },
      500000
    );
    ctx.camera = { position: { x: 0, y: 0, z: 0 } };
    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(ctx.emitted.some((e) => e.event === 'splat_budget_exceeded')).toBe(false);
  });
});

// =============================================================================
// onEvent — load lifecycle
// =============================================================================

describe('GaussianSplatTrait — onEvent(splat_load_complete)', () => {
  it('sets isLoaded and splatCount', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_load_complete',
      splatCount: 250000,
      memoryUsage: 40,
      boundingBox: { min: [-5, -5, -5], max: [5, 5, 5] },
      renderHandle: { id: 'h1' },
    });

    const st = getState(node);
    expect(st.isLoaded).toBe(true);
    expect(st.splatCount).toBe(250000);
    expect(st.gaussianBudgetUsed).toBe(250000);
    expect(ctx.emitted.some((e) => e.event === 'on_splat_loaded')).toBe(true);
  });
});

describe('GaussianSplatTrait — onEvent(splat_load_error)', () => {
  it('emits on_splat_error', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: 'bad.ply' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_load_error',
      error: 'Not found',
    });
    expect(ctx.emitted.some((e) => e.event === 'on_splat_error')).toBe(true);
    expect(getState(node).isLoading).toBe(false);
  });
});

describe('GaussianSplatTrait — onEvent(splat_load_progress)', () => {
  it('emits on_splat_progress with progress value', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_load_progress',
      progress: 0.45,
      loadedSplats: 112500,
    });
    const prg = ctx.emitted.find((e) => e.event === 'on_splat_progress');
    expect(prg).toBeDefined();
    expect((prg!.data as any).progress).toBe(0.45);
  });
});

// =============================================================================
// onEvent — source swap, quality, query, visibility
// =============================================================================

describe('GaussianSplatTrait — onEvent(splat_set_source)', () => {
  it('destroys old handle and loads new source', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ source: 'old.ply' });
    gaussianSplatHandler.onAttach!(node as any, config, ctx as any);
    getState(node).renderHandle = { id: 'old-handle' };
    getState(node).isLoaded = true;
    ctx.emitted.length = 0;

    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_set_source',
      source: 'new.ply',
    });

    expect(ctx.emitted.some((e) => e.event === 'splat_destroy')).toBe(true);
    expect(ctx.emitted.some((e) => e.event === 'splat_load')).toBe(true);
  });

  it('no action when source is same', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ source: 'same.ply' });
    gaussianSplatHandler.onAttach!(node as any, config, ctx as any);
    ctx.emitted.length = 0;

    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_set_source',
      source: 'same.ply',
    });

    expect(ctx.emitted).toHaveLength(0);
  });
});

describe('GaussianSplatTrait — onEvent(splat_set_quality)', () => {
  it('emits splat_update_quality', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_set_quality',
      quality: 'ultra',
    });
    const qEvt = ctx.emitted.find((e) => e.event === 'splat_update_quality');
    expect(qEvt).toBeDefined();
    expect((qEvt!.data as any).quality).toBe('ultra');
  });
});

describe('GaussianSplatTrait — onEvent(splat_query)', () => {
  it('emits splat_info with current state including v4.1 fields', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    const st = getState(node);
    st.splatCount = 50000;
    st.currentLODLevel = 2;
    st.gaussianBudgetUsed = 50000;
    st.temporalFrameIndex = 12;
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_query',
      queryId: 'q1',
    });
    const info = ctx.emitted.find((e) => e.event === 'splat_info');
    expect(info).toBeDefined();
    expect((info!.data as any).queryId).toBe('q1');
    expect((info!.data as any).splatCount).toBe(50000);
    expect((info!.data as any).currentLODLevel).toBe(2);
    expect((info!.data as any).gaussianBudgetUsed).toBe(50000);
    expect((info!.data as any).temporalFrameIndex).toBe(12);
  });
});

describe('GaussianSplatTrait — onEvent(splat_visibility_update)', () => {
  it('updates visibleSplats count', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_visibility_update',
      visibleCount: 180000,
    });
    expect(getState(node).visibleSplats).toBe(180000);
  });
});

// =============================================================================
// onEvent — v4.1 handlers
// =============================================================================

describe('GaussianSplatTrait — onEvent(splat_set_lod) v4.1', () => {
  it('emits splat_update_lod with new LOD config', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_set_lod',
      mode: 'octree',
      octree_depth: 6,
      anchor_thresholds: [5, 10, 20, 40],
    });
    const evt = ctx.emitted.find((e) => e.event === 'splat_update_lod');
    expect(evt).toBeDefined();
    expect((evt!.data as any).mode).toBe('octree');
    expect((evt!.data as any).octree_depth).toBe(6);
    expect((evt!.data as any).anchor_thresholds).toEqual([5, 10, 20, 40]);
  });

  it('falls back to config defaults for omitted fields', () => {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = makeConfig({
      source: '',
      lod: { octree_depth: 4, mode: 'distance', anchor_thresholds: [10, 20] },
    });
    gaussianSplatHandler.onAttach!(node as any, cfg, ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, cfg, ctx as any, {
      type: 'splat_set_lod',
      mode: 'octree',
    });
    const evt = ctx.emitted.find((e) => e.event === 'splat_update_lod');
    expect((evt!.data as any).mode).toBe('octree');
    expect((evt!.data as any).octree_depth).toBe(4); // from config
    expect((evt!.data as any).anchor_thresholds).toEqual([10, 20]); // from config
  });
});

describe('GaussianSplatTrait — onEvent(splat_set_budget) v4.1', () => {
  it('emits splat_update_budget', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_set_budget',
      total_cap: 180000,
      per_avatar_reservation: 60000,
    });
    const evt = ctx.emitted.find((e) => e.event === 'splat_update_budget');
    expect(evt).toBeDefined();
    expect((evt!.data as any).total_cap).toBe(180000);
    expect((evt!.data as any).per_avatar_reservation).toBe(60000);
  });
});

describe('GaussianSplatTrait — onEvent(splat_set_temporal_mode) v4.1', () => {
  it('emits splat_update_temporal and resets frame index', () => {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = makeConfig({ source: '', temporal_mode: 'static' });
    gaussianSplatHandler.onAttach!(node as any, cfg, ctx as any);
    getState(node).temporalFrameIndex = 42;
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, cfg, ctx as any, {
      type: 'splat_set_temporal_mode',
      temporal_mode: '4d',
    });
    expect(getState(node).temporalFrameIndex).toBe(0);
    const evt = ctx.emitted.find((e) => e.event === 'splat_update_temporal');
    expect(evt).toBeDefined();
    expect((evt!.data as any).temporal_mode).toBe('4d');
    expect((evt!.data as any).previousMode).toBe('static');
  });
});

describe('GaussianSplatTrait — onEvent(splat_temporal_advance) v4.1', () => {
  it('advances frame index in 4d mode', () => {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = makeConfig({ source: '', temporal_mode: '4d' });
    gaussianSplatHandler.onAttach!(node as any, cfg, ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, cfg, ctx as any, {
      type: 'splat_temporal_advance',
      frameIndex: 15,
    });
    expect(getState(node).temporalFrameIndex).toBe(15);
    const evt = ctx.emitted.find((e) => e.event === 'splat_temporal_frame');
    expect(evt).toBeDefined();
    expect((evt!.data as any).frameIndex).toBe(15);
    expect((evt!.data as any).temporal_mode).toBe('4d');
  });

  it('advances frame index in streaming mode', () => {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = makeConfig({ source: '', temporal_mode: 'streaming' });
    gaussianSplatHandler.onAttach!(node as any, cfg, ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, cfg, ctx as any, {
      type: 'splat_temporal_advance',
      frameIndex: 100,
    });
    expect(getState(node).temporalFrameIndex).toBe(100);
  });

  it('no-op in static mode', () => {
    const node = makeNode();
    const ctx = makeContext();
    const cfg = makeConfig({ source: '', temporal_mode: 'static' });
    gaussianSplatHandler.onAttach!(node as any, cfg, ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, cfg, ctx as any, {
      type: 'splat_temporal_advance',
      frameIndex: 10,
    });
    expect(getState(node).temporalFrameIndex).toBe(0);
    expect(ctx.emitted.some((e) => e.event === 'splat_temporal_frame')).toBe(false);
  });
});

// =============================================================================
// Guard: no state
// =============================================================================

describe('GaussianSplatTrait — no-state guard', () => {
  it('onEvent before onAttach does not crash', () => {
    const node = makeNode();
    const ctx = makeContext();
    expect(() =>
      gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
        type: 'splat_load_complete',
        splatCount: 1,
        memoryUsage: 1,
        boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
        renderHandle: null,
      })
    ).not.toThrow();
  });

  it('v4.1 events before onAttach do not crash', () => {
    const node = makeNode();
    const ctx = makeContext();
    expect(() =>
      gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
        type: 'splat_set_lod',
        mode: 'octree',
      })
    ).not.toThrow();
    expect(() =>
      gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
        type: 'splat_set_budget',
        total_cap: 180000,
      })
    ).not.toThrow();
    expect(() =>
      gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
        type: 'splat_set_temporal_mode',
        temporal_mode: '4d',
      })
    ).not.toThrow();
    expect(() =>
      gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
        type: 'splat_temporal_advance',
        frameIndex: 5,
      })
    ).not.toThrow();
  });
});
