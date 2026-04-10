/**
 * PointCloudTrait — Production Test Suite
 *
 * pointCloudHandler stores state on node.__pointCloudState.
 * loadPointCloud() is called internally on attach when source is set.
 *
 * Key behaviours:
 * 1. defaultConfig — 11 fields
 * 2. onAttach — state init (isLoaded=false, isLoading=false, pointCount=0, etc.);
 *              source set → emits point_cloud_load; source empty → no load
 * 3. onDetach — emits point_cloud_destroy when octreeHandle set; removes state
 * 4. onUpdate — no-op when !isLoaded; LOD computed from camera→center distance;
 *              emits point_cloud_set_lod only when level changes
 * 5. onEvent — point_cloud_loaded: isLoaded=true, sets pointCount+boundingBox+octreeHandle+emits on_point_cloud_loaded;
 *              point_cloud_load_progress: emits on_point_cloud_progress;
 *              point_cloud_load_error: isLoading=false, emits on_point_cloud_error;
 *              point_cloud_visibility_update: sets visiblePoints;
 *              point_cloud_set_point_size: emits point_cloud_update_size;
 *              point_cloud_set_color_mode: emits point_cloud_update_color with ranges;
 *              point_cloud_filter: emits point_cloud_apply_filter;
 *              point_cloud_clear_filter: emits point_cloud_reset_filter;
 *              point_cloud_set_source: destroys old, reloads new;
 *              point_cloud_pick: emits point_cloud_ray_pick;
 *              point_cloud_query: emits point_cloud_info snapshot
 */
import { describe, it, expect, vi } from 'vitest';
import { pointCloudHandler } from '../PointCloudTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'pc_node', properties: {} };
}

function makeCtx(cameraPos = { x: 0, y: 0, z: 0 }) {
  return { emit: vi.fn(), camera: { position: cameraPos } };
}

function attach(
  cfg: Partial<typeof pointCloudHandler.defaultConfig> = {},
  camera = { x: 0, y: 0, z: 0 }
) {
  const node = makeNode();
  const ctx = makeCtx(camera);
  const config = { ...pointCloudHandler.defaultConfig!, source: '', ...cfg };
  pointCloudHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

function attachLoaded(
  overrideState: Partial<any> = {},
  cfg: Partial<typeof pointCloudHandler.defaultConfig> = {}
) {
  const { node, ctx, config } = attach(cfg);
  Object.assign((node as any).__pointCloudState, {
    isLoaded: true,
    isLoading: false,
    octreeHandle: { handle: 'oct1' },
    pointCount: 1000000,
    boundingBox: { min: [0, 0, 0], max: [10, 5, 10] }, // center = [5,2.5,5]
    ...overrideState,
  });
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('pointCloudHandler.defaultConfig', () => {
  const d = pointCloudHandler.defaultConfig!;
  it('source=""', () => expect(d.source).toBe(''));
  it('point_size=1.0', () => expect(d.point_size).toBe(1.0));
  it('color_mode=rgb', () => expect(d.color_mode).toBe('rgb'));
  it('max_points=5000000', () => expect(d.max_points).toBe(5000000));
  it('lod=true', () => expect(d.lod).toBe(true));
  it('lod_levels=4', () => expect(d.lod_levels).toBe(4));
  it('streaming=false', () => expect(d.streaming).toBe(false));
  it('chunk_size=100000', () => expect(d.chunk_size).toBe(100000));
  it('format=ply', () => expect(d.format).toBe('ply'));
  it('intensity_range=[0,255]', () => expect(d.intensity_range).toEqual([0, 255]));
  it('height_range=[0,100]', () => expect(d.height_range).toEqual([0, 100]));
  it('eye_dome_lighting=true', () => expect(d.eye_dome_lighting).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('pointCloudHandler.onAttach', () => {
  it('initialises __pointCloudState', () => {
    const { node } = attach();
    expect((node as any).__pointCloudState).toBeDefined();
  });

  it('isLoaded=false initially', () => {
    const { node } = attach();
    expect((node as any).__pointCloudState.isLoaded).toBe(false);
  });

  it('pointCount=0 initially', () => {
    const { node } = attach();
    expect((node as any).__pointCloudState.pointCount).toBe(0);
  });

  it('lodLevel=0 initially', () => {
    const { node } = attach();
    expect((node as any).__pointCloudState.lodLevel).toBe(0);
  });

  it('source set → emits point_cloud_load', () => {
    const { ctx } = attach({ source: 'scene.ply' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_load',
      expect.objectContaining({ source: 'scene.ply' })
    );
  });

  it('source empty → does NOT emit point_cloud_load', () => {
    const { ctx } = attach({ source: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('point_cloud_load', expect.anything());
  });

  it('point_cloud_load carries format and lod settings', () => {
    const { ctx } = attach({ source: 'city.las', format: 'las', lod: true, lod_levels: 5 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_load',
      expect.objectContaining({
        format: 'las',
        buildLod: true,
        lodLevels: 5,
      })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('pointCloudHandler.onDetach', () => {
  it('emits point_cloud_destroy when octreeHandle is set', () => {
    const { node, ctx, config } = attachLoaded();
    ctx.emit.mockClear();
    pointCloudHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('point_cloud_destroy', expect.objectContaining({ node }));
  });

  it('does NOT emit point_cloud_destroy when octreeHandle is null', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    pointCloudHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('point_cloud_destroy', expect.anything());
  });

  it('removes __pointCloudState', () => {
    const { node, ctx, config } = attach();
    pointCloudHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__pointCloudState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('pointCloudHandler.onUpdate', () => {
  it('no-op when isLoaded=false', () => {
    const { node, ctx, config } = attach({ lod: true });
    (ctx as any).camera = { position: { x: 0, y: 0, z: 100 } };
    ctx.emit.mockClear();
    pointCloudHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits point_cloud_set_lod when LOD level changes', () => {
    // boundingBox center is [5,2.5,5]; camera at [5,2.5,55] → distance=50 → lodLevel=Math.min(3, floor(50/10))=3
    const { node, ctx, config } = attachLoaded({}, { lod: true, lod_levels: 4 });
    (ctx as any).camera = { position: { x: 5, y: 2.5, z: 55 } };
    ctx.emit.mockClear();
    pointCloudHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_set_lod',
      expect.objectContaining({ level: 3 })
    );
  });

  it('does NOT emit point_cloud_set_lod when level is unchanged', () => {
    const { node, ctx, config } = attachLoaded({ lodLevel: 3 }, { lod: true, lod_levels: 4 });
    // Camera 50 units away → lod=3 (same as state)
    (ctx as any).camera = { position: { x: 5, y: 2.5, z: 55 } };
    ctx.emit.mockClear();
    pointCloudHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('point_cloud_set_lod', expect.anything());
  });

  it('no-op when lod=false', () => {
    const { node, ctx, config } = attachLoaded({}, { lod: false });
    (ctx as any).camera = { position: { x: 5, y: 2.5, z: 55 } };
    ctx.emit.mockClear();
    pointCloudHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — point_cloud_loaded ─────────────────────────────────────────────

describe('pointCloudHandler.onEvent — point_cloud_loaded', () => {
  it('sets isLoaded=true', () => {
    const { node, ctx, config } = attach();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_loaded',
      pointCount: 500000,
      boundingBox: { min: [0, 0, 0], max: [10, 10, 10] },
      memoryUsage: 256,
      octree: { h: 1 },
    });
    expect((node as any).__pointCloudState.isLoaded).toBe(true);
  });

  it('populates pointCount and octreeHandle', () => {
    const { node, ctx, config } = attach();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_loaded',
      pointCount: 1234567,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      memoryUsage: 100,
      octree: 'oct-handle',
    });
    expect((node as any).__pointCloudState.pointCount).toBe(1234567);
    expect((node as any).__pointCloudState.octreeHandle).toBe('oct-handle');
  });

  it('emits on_point_cloud_loaded', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_loaded',
      pointCount: 100,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      memoryUsage: 10,
      octree: {},
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_point_cloud_loaded',
      expect.objectContaining({ pointCount: 100 })
    );
  });
});

// ─── onEvent — point_cloud_load_progress ────────────────────────────────────

describe('pointCloudHandler.onEvent — point_cloud_load_progress', () => {
  it('emits on_point_cloud_progress', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_load_progress',
      loadedPoints: 50000,
      totalPoints: 100000,
      progress: 0.5,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_point_cloud_progress',
      expect.objectContaining({ progress: 0.5 })
    );
  });
});

// ─── onEvent — point_cloud_load_error ────────────────────────────────────────

describe('pointCloudHandler.onEvent — point_cloud_load_error', () => {
  it('sets isLoading=false and emits on_point_cloud_error', () => {
    const { node, ctx, config } = attach();
    (node as any).__pointCloudState.isLoading = true;
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_load_error',
      error: 'File not found',
    });
    expect((node as any).__pointCloudState.isLoading).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_point_cloud_error',
      expect.objectContaining({ error: 'File not found' })
    );
  });
});

// ─── onEvent — visibility, point_size, color_mode ────────────────────────────

describe('pointCloudHandler.onEvent — visibility / size / color', () => {
  it('point_cloud_visibility_update sets visiblePoints', () => {
    const { node, ctx, config } = attach();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_visibility_update',
      visibleCount: 250000,
    });
    expect((node as any).__pointCloudState.visiblePoints).toBe(250000);
  });

  it('point_cloud_set_point_size emits point_cloud_update_size', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_set_point_size',
      size: 2.5,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_update_size',
      expect.objectContaining({ size: 2.5 })
    );
  });

  it('point_cloud_set_color_mode emits point_cloud_update_color with ranges from config', () => {
    const { node, ctx, config } = attach({ intensity_range: [10, 200], height_range: [5, 50] });
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_set_color_mode',
      mode: 'intensity',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_update_color',
      expect.objectContaining({
        mode: 'intensity',
        intensityRange: [10, 200],
        heightRange: [5, 50],
      })
    );
  });
});

// ─── onEvent — filter / clear_filter ──────────────────────────────────────────

describe('pointCloudHandler.onEvent — filter / clear_filter', () => {
  it('point_cloud_filter emits point_cloud_apply_filter', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_filter',
      filter: { classification: [1, 2], heightRange: [0, 10] },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_apply_filter',
      expect.objectContaining({ classification: [1, 2] })
    );
  });

  it('point_cloud_clear_filter emits point_cloud_reset_filter', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_clear_filter',
    });
    expect(ctx.emit).toHaveBeenCalledWith('point_cloud_reset_filter', expect.any(Object));
  });
});

// ─── onEvent — set_source ─────────────────────────────────────────────────────

describe('pointCloudHandler.onEvent — point_cloud_set_source', () => {
  it('emits point_cloud_destroy when old octreeHandle exists', () => {
    const { node, ctx, config } = attachLoaded();
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_set_source',
      source: 'new.ply',
    });
    expect(ctx.emit).toHaveBeenCalledWith('point_cloud_destroy', expect.any(Object));
  });

  it('resets isLoaded=false and emits point_cloud_load for new source', () => {
    const { node, ctx, config } = attachLoaded();
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_set_source',
      source: 'new.ply',
    });
    expect((node as any).__pointCloudState.isLoaded).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_load',
      expect.objectContaining({ source: 'new.ply' })
    );
  });
});

// ─── onEvent — pick / query ────────────────────────────────────────────────────

describe('pointCloudHandler.onEvent — pick / query', () => {
  it('point_cloud_pick emits point_cloud_ray_pick', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_pick',
      x: 320,
      y: 240,
      callbackId: 'cb1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_ray_pick',
      expect.objectContaining({ screenX: 320, screenY: 240, callbackId: 'cb1' })
    );
  });

  it('point_cloud_query emits point_cloud_info snapshot', () => {
    const { node, ctx, config } = attachLoaded({
      pointCount: 42,
      visiblePoints: 10,
      lodLevel: 2,
      memoryUsage: 512,
    });
    ctx.emit.mockClear();
    pointCloudHandler.onEvent!(node as any, config, ctx as any, {
      type: 'point_cloud_query',
      queryId: 'q1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'point_cloud_info',
      expect.objectContaining({
        queryId: 'q1',
        isLoaded: true,
        pointCount: 42,
        visiblePoints: 10,
        lodLevel: 2,
        memoryUsage: 512,
      })
    );
  });
});
