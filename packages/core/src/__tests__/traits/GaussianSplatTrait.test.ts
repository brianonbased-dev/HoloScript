/**
 * GaussianSplatTrait — Comprehensive Tests
 *
 * Coverage:
 *   Config & defaults:
 *   - defaultConfig has expected values (format, quality, sh_degree, etc.)
 *
 *   onAttach:
 *   - State initialized with isLoaded=false, splatCount=0
 *   - splat_load emitted when source provided
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
 *
 *   onEvent(splat_load_complete):
 *   - isLoaded=true, splatCount set
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
 *   - splat_info emitted with full state
 *
 *   onEvent(splat_visibility_update):
 *   - visibleSplats updated
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

  it('emits splat_load when source is provided', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: 'scene.ply' }), ctx as any);
    expect(ctx.emitted.some(e => e.event === 'splat_load')).toBe(true);
  });

  it('splat_load payload includes source and shDegree', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: 'room.ply', sh_degree: 2 }), ctx as any);
    const load = ctx.emitted.find(e => e.event === 'splat_load');
    expect((load!.data as any).source).toBe('room.ply');
    expect((load!.data as any).shDegree).toBe(2);
  });

  it('does NOT emit splat_load when source is empty', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    expect(ctx.emitted.some(e => e.event === 'splat_load')).toBe(false);
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
    // Simulate loaded scene with renderHandle
    getState(node).renderHandle = { id: 'handle-1' };
    ctx.emitted.length = 0;
    gaussianSplatHandler.onDetach!(node as any, makeConfig(), ctx as any);
    expect(ctx.emitted.some(e => e.event === 'splat_destroy')).toBe(true);
  });

  it('no splat_destroy when renderHandle is null', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    ctx.emitted.length = 0;
    gaussianSplatHandler.onDetach!(node as any, makeConfig(), ctx as any);
    expect(ctx.emitted.some(e => e.event === 'splat_destroy')).toBe(false);
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
    // Simulate loaded
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
    ctx.camera = { position: { x: 1, y: 0, z: 0 } }; // moved 1 unit

    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);

    expect(ctx.emitted.some(e => e.event === 'splat_sort')).toBe(true);
    expect(st.needsSort).toBe(false); // reset after sort emit
  });

  it('no splat_sort when sort_mode=radix', () => {
    const { node, ctx, st, cfg } = attachLoaded({ sort_mode: 'radix' });
    st.lastCameraPosition = { x: 0, y: 0, z: 0 };
    st.needsSort = true;
    ctx.camera = { position: { x: 1, y: 0, z: 0 } };

    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(ctx.emitted.some(e => e.event === 'splat_sort')).toBe(false);
  });

  it('sets initial camera position on first update', () => {
    const { node, ctx, st, cfg } = attachLoaded();
    st.lastCameraPosition = null; // no prior position
    ctx.camera = { position: { x: 5, y: 5, z: 5 } };

    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(st.lastCameraPosition).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('no sort when camera moves less than threshold (0.1)', () => {
    const { node, ctx, st, cfg } = attachLoaded();
    st.lastCameraPosition = { x: 0, y: 0, z: 0 };
    ctx.camera = { position: { x: 0.05, y: 0, z: 0 } }; // < 0.1

    gaussianSplatHandler.onUpdate!(node as any, cfg, ctx as any, 16);
    expect(ctx.emitted.some(e => e.event === 'splat_sort')).toBe(false);
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
      boundingBox: { min: [-5,-5,-5], max: [5,5,5] },
      renderHandle: { id: 'h1' },
    });

    const st = getState(node);
    expect(st.isLoaded).toBe(true);
    expect(st.splatCount).toBe(250000);
    expect(ctx.emitted.some(e => e.event === 'on_splat_loaded')).toBe(true);
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
    expect(ctx.emitted.some(e => e.event === 'on_splat_error')).toBe(true);
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
    const prg = ctx.emitted.find(e => e.event === 'on_splat_progress');
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

    expect(ctx.emitted.some(e => e.event === 'splat_destroy')).toBe(true);
    expect(ctx.emitted.some(e => e.event === 'splat_load')).toBe(true);
  });

  it('no action when source is same', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ source: 'same.ply' });
    gaussianSplatHandler.onAttach!(node as any, config, ctx as any);
    ctx.emitted.length = 0;

    gaussianSplatHandler.onEvent!(node as any, config, ctx as any, {
      type: 'splat_set_source',
      source: 'same.ply', // same!
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
    const qEvt = ctx.emitted.find(e => e.event === 'splat_update_quality');
    expect(qEvt).toBeDefined();
    expect((qEvt!.data as any).quality).toBe('ultra');
  });
});

describe('GaussianSplatTrait — onEvent(splat_query)', () => {

  it('emits splat_info with current state', () => {
    const node = makeNode();
    const ctx = makeContext();
    gaussianSplatHandler.onAttach!(node as any, makeConfig({ source: '' }), ctx as any);
    getState(node).splatCount = 50000;
    ctx.emitted.length = 0;
    gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_query',
      queryId: 'q1',
    });
    const info = ctx.emitted.find(e => e.event === 'splat_info');
    expect(info).toBeDefined();
    expect((info!.data as any).queryId).toBe('q1');
    expect((info!.data as any).splatCount).toBe(50000);
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
// Guard: no state
// =============================================================================

describe('GaussianSplatTrait — no-state guard', () => {

  it('onEvent before onAttach does not crash', () => {
    const node = makeNode(); // no attach
    const ctx = makeContext();
    expect(() => gaussianSplatHandler.onEvent!(node as any, makeConfig(), ctx as any, {
      type: 'splat_load_complete',
      splatCount: 1,
      memoryUsage: 1,
      boundingBox: { min: [0,0,0], max: [1,1,1] },
      renderHandle: null,
    })).not.toThrow();
  });
});
