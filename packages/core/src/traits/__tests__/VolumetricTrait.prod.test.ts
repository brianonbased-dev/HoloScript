/**
 * VolumetricTrait Production Tests
 *
 * Gaussian Splatting / NeRF / volumetric video support.
 * Focuses on synchronous event handlers and lifecycle guards.
 * The async parseSplat() path (volumetric_data_ready) is skipped here.
 * Covers: defaultConfig, onAttach (src guard), onDetach (isLoaded guard),
 * onUpdate (isLoaded+splatData guard), and 4 sync onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { volumetricHandler } from '../VolumetricTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'vol_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...volumetricHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  volumetricHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__volumetricState as any;
}
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  volumetricHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('VolumetricTrait — defaultConfig', () => {
  it('has 7 fields with correct defaults', () => {
    const d = volumetricHandler.defaultConfig!;
    expect(d.src).toBe('');
    expect(d.renderMode).toBe('splat');
    expect(d.pointSize).toBeCloseTo(1.0);
    expect(d.opacity).toBeCloseTo(1.0);
    expect(d.lod_auto).toBe(true);
    expect(d.max_points).toBe(1000000);
    expect(d.use_gpu_compute).toBe(true);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('VolumetricTrait — onAttach', () => {
  it('initialises state with correct defaults when no src', () => {
    const node = makeNode();
    attach(node, { src: '' });
    const s = st(node);
    expect(s.isLoaded).toBe(false);
    expect(s.isLoading).toBe(false); // no src → false
    expect(s.pointCount).toBe(0);
    expect(s.currentLOD).toBe(0);
    expect(s.renderMode).toBe('splat');
    expect(s.opacity).toBeCloseTo(1.0);
    expect(s.clipBounds).toBeNull();
    expect(s.splatData).toBeNull();
    expect(s.indices).toBeNull();
  });

  it('sets isLoading=true and emits volumetric_load_start when src set', () => {
    const node = makeNode();
    const { ctx } = attach(node, { src: 'scene.splat' });
    expect(st(node).isLoading).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'volumetric_load_start',
      expect.objectContaining({ src: 'scene.splat' })
    );
  });

  it('does NOT emit volumetric_load_start when src is empty', () => {
    const node = makeNode();
    const { ctx } = attach(node, { src: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_load_start', expect.any(Object));
  });

  it('mirrors config.renderMode and opacity into state', () => {
    const node = makeNode();
    attach(node, { renderMode: 'nerf', opacity: 0.7 });
    expect(st(node).renderMode).toBe('nerf');
    expect(st(node).opacity).toBeCloseTo(0.7);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('VolumetricTrait — onDetach', () => {
  it('emits volumetric_unload when isLoaded=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isLoaded = true;
    ctx.emit.mockClear();
    volumetricHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_unload', expect.any(Object));
  });

  it('does NOT emit volumetric_unload when isLoaded=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    volumetricHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_unload', expect.any(Object));
  });

  it('removes __volumetricState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    volumetricHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__volumetricState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('VolumetricTrait — onUpdate', () => {
  it('no-op when isLoaded=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // isLoaded defaults false
    ctx.emit.mockClear();
    volumetricHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_render_update', expect.any(Object));
  });

  it('no-op when splatData is null (even if isLoaded=true)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isLoaded = true;
    ctx.emit.mockClear();
    volumetricHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_render_update', expect.any(Object));
  });

  it('emits volumetric_render_update with indices+opacity when loaded+splatData set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { opacity: 0.8 });
    st(node).isLoaded = true;
    st(node).splatData = { count: 100, positions: new Float32Array(300) };
    st(node).indices = new Uint32Array([0, 1, 2]);
    ctx.emit.mockClear();
    volumetricHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'volumetric_render_update',
      expect.objectContaining({
        indices: st(node).indices,
        opacity: 0.8,
      })
    );
  });
});

// ─── onEvent — volumetric_sort_request ───────────────────────────────────────

describe('VolumetricTrait — onEvent: volumetric_sort_request', () => {
  it('updates indices when splatData is set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // Provide minimal fake splatData (sortSplat is a real call on service)
    const fakeSplat = { count: 3, positions: new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]) } as any;
    st(node).splatData = fakeSplat;
    // service.sortSplat should return a Uint32Array
    fire(node, cfg, ctx, { type: 'volumetric_sort_request', cameraPosition: { x: 0, y: 0, z: 0 } });
    expect(st(node).indices).not.toBeNull();
    expect(st(node).indices).toBeInstanceOf(Uint32Array);
  });

  it('no-op when splatData is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    const prevIndices = st(node).indices;
    fire(node, cfg, ctx, { type: 'volumetric_sort_request', cameraPosition: { x: 0, y: 0, z: 0 } });
    expect(st(node).indices).toBe(prevIndices); // unchanged (still null)
  });
});

// ─── onEvent — volumetric_set_lod ────────────────────────────────────────────

describe('VolumetricTrait — onEvent: volumetric_set_lod', () => {
  it('updates currentLOD', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'volumetric_set_lod', lod: 2 });
    expect(st(node).currentLOD).toBe(2);
  });

  it('defaults to 0 when lod is falsy', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).currentLOD = 3;
    fire(node, cfg, ctx, { type: 'volumetric_set_lod', lod: 0 });
    expect(st(node).currentLOD).toBe(0);
  });
});

// ─── onEvent — volumetric_set_clip ───────────────────────────────────────────

describe('VolumetricTrait — onEvent: volumetric_set_clip', () => {
  it('stores clipBounds and emits volumetric_clip_updated', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    const min = { x: -1, y: -1, z: -1 };
    const max = { x: 1, y: 1, z: 1 };
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_set_clip', min, max });
    expect(st(node).clipBounds).toEqual({ min, max });
    expect(ctx.emit).toHaveBeenCalledWith(
      'volumetric_clip_updated',
      expect.objectContaining({
        bounds: { min, max },
      })
    );
  });
});

// ─── onEvent — volumetric_reset_clip ─────────────────────────────────────────

describe('VolumetricTrait — onEvent: volumetric_reset_clip', () => {
  it('resets clipBounds to null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).clipBounds = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
    fire(node, cfg, ctx, { type: 'volumetric_reset_clip' });
    expect(st(node).clipBounds).toBeNull();
  });
});

// ─── onEvent — volumetric_ray_query ──────────────────────────────────────────

describe('VolumetricTrait — onEvent: volumetric_ray_query', () => {
  it('calls intersectRay and emits volumetric_ray_hit when renderMode=splat and splatData set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { renderMode: 'splat' });
    // SplatProcessingService.intersectRay reads positions, scales, and opacities
    const fakeSplat = {
      count: 1,
      positions: new Float32Array([0, 0, 0]),
      scales: new Float32Array([1, 1, 1]),
      opacities: new Float32Array([1.0]),
      rotations: new Float32Array([1, 0, 0, 0]),
      colors: new Uint8Array([255, 255, 255, 255]),
    } as any;
    st(node).splatData = fakeSplat;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'volumetric_ray_query',
      origin: { x: 0, y: 5, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      threshold: 0.1,
      queryId: 'rq1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'volumetric_ray_hit',
      expect.objectContaining({ queryId: 'rq1' })
    );
  });

  it('no-op when renderMode=nerf (ray query only for splat)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { renderMode: 'nerf' });
    const fakeSplat = { count: 1, positions: new Float32Array([0, 0, 0]) } as any;
    st(node).splatData = fakeSplat;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'volumetric_ray_query',
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      queryId: 'rq2',
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_ray_hit', expect.any(Object));
  });

  it('no-op when splatData is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { renderMode: 'splat' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'volumetric_ray_query',
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      queryId: 'rq3',
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_ray_hit', expect.any(Object));
  });
});
