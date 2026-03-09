/**
 * PhotogrammetryTrait Production Tests
 *
 * Photo-derived 3D model integration with capture and processing support.
 * Covers: defaultConfig, onAttach, onDetach (meshHandle guard),
 * and all 8 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { photogrammetryHandler } from '../PhotogrammetryTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'pg_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...photogrammetryHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  photogrammetryHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__photogrammetryState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  photogrammetryHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('PhotogrammetryTrait — defaultConfig', () => {
  it('has 9 fields with correct defaults', () => {
    const d = photogrammetryHandler.defaultConfig!;
    expect(d.source_type).toBe('images');
    expect(d.quality).toBe('medium');
    expect(d.mesh_simplification).toBeCloseTo(0.5);
    expect(d.texture_resolution).toBe(2048);
    expect(d.auto_align).toBe(true);
    expect(d.geo_reference).toBe(false);
    expect(d.coordinate_system).toBe('local');
    expect(d.mask_background).toBe(true);
    expect(d.feature_matching).toBe('sift');
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('PhotogrammetryTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.isProcessing).toBe(false);
    expect(s.stage).toBe('idle');
    expect(s.progress).toBe(0);
    expect(s.imageCount).toBe(0);
    expect(s.meshHandle).toBeNull();
    expect(s.boundingBox).toBeNull();
  });

  it('textureResolution mirrors config.texture_resolution', () => {
    const node = makeNode();
    attach(node, { texture_resolution: 4096 });
    expect(st(node).textureResolution).toBe(4096);
  });

  it('emits photogrammetry_init with quality, featureMatching, autoAlign, geoReference', () => {
    const node = makeNode();
    const { ctx } = attach(node, {
      quality: 'high',
      feature_matching: 'superpoint',
      auto_align: false,
      geo_reference: true,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'photogrammetry_init',
      expect.objectContaining({
        quality: 'high',
        featureMatching: 'superpoint',
        autoAlign: false,
        geoReference: true,
      })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('PhotogrammetryTrait — onDetach', () => {
  it('emits photogrammetry_destroy when meshHandle is set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).meshHandle = { mesh: 'handle' };
    ctx.emit.mockClear();
    photogrammetryHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('photogrammetry_destroy', expect.any(Object));
  });

  it('does NOT emit photogrammetry_destroy when meshHandle is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    photogrammetryHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('photogrammetry_destroy', expect.any(Object));
  });

  it('removes __photogrammetryState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    photogrammetryHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__photogrammetryState).toBeUndefined();
  });
});

// ─── onEvent — photogrammetry_add_images ──────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_add_images', () => {
  it('accumulates imageCount and emits photogrammetry_upload', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source_type: 'depth_images' });
    ctx.emit.mockClear();
    const imgs = ['a.jpg', 'b.jpg', 'c.jpg'];
    fire(node, cfg, ctx, { type: 'photogrammetry_add_images', images: imgs });
    expect(st(node).imageCount).toBe(3);
    expect(ctx.emit).toHaveBeenCalledWith(
      'photogrammetry_upload',
      expect.objectContaining({
        images: imgs,
        sourceType: 'depth_images',
      })
    );
  });

  it('accumulates across multiple add_images calls', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'photogrammetry_add_images', images: ['a.jpg', 'b.jpg'] });
    fire(node, cfg, ctx, { type: 'photogrammetry_add_images', images: ['c.jpg'] });
    expect(st(node).imageCount).toBe(3);
  });
});

// ─── onEvent — photogrammetry_start ───────────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_start', () => {
  it('does nothing when imageCount=0', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_start' });
    expect(st(node).isProcessing).toBe(false);
    expect(ctx.emit).not.toHaveBeenCalledWith('photogrammetry_process', expect.any(Object));
  });

  it('starts processing when imageCount > 0: sets isProcessing+stage+progress=0, emits process', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      quality: 'ultra',
      mesh_simplification: 0.8,
      texture_resolution: 4096,
      mask_background: false,
    });
    st(node).imageCount = 5;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_start' });
    expect(st(node).isProcessing).toBe(true);
    expect(st(node).stage).toBe('uploading');
    expect(st(node).progress).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith(
      'photogrammetry_process',
      expect.objectContaining({
        quality: 'ultra',
        meshSimplification: 0.8,
        textureResolution: 4096,
        maskBackground: false,
      })
    );
  });
});

// ─── onEvent — photogrammetry_progress ────────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_progress', () => {
  it('updates stage and progress, emits on_photogrammetry_progress', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_progress', stage: 'aligning', progress: 35 });
    expect(st(node).stage).toBe('aligning');
    expect(st(node).progress).toBe(35);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_photogrammetry_progress',
      expect.objectContaining({
        stage: 'aligning',
        progress: 35,
      })
    );
  });
});

// ─── onEvent — photogrammetry_complete ────────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_complete', () => {
  it('clears isProcessing, sets stage=complete, progress=100, stores mesh+boundingBox, emits both', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { texture_resolution: 2048 });
    st(node).isProcessing = true;
    ctx.emit.mockClear();
    const mesh = { id: 'mesh1' };
    const bb = { min: [-1, -1, -1], max: [1, 1, 1] };
    fire(node, cfg, ctx, {
      type: 'photogrammetry_complete',
      mesh,
      boundingBox: bb,
      vertexCount: 50000,
    });
    const s = st(node);
    expect(s.isProcessing).toBe(false);
    expect(s.stage).toBe('complete');
    expect(s.progress).toBe(100);
    expect(s.meshHandle).toBe(mesh);
    expect(s.boundingBox).toEqual(bb);
    expect(ctx.emit).toHaveBeenCalledWith(
      'photogrammetry_apply_mesh',
      expect.objectContaining({ mesh })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_capture_complete',
      expect.objectContaining({
        vertexCount: 50000,
        textureResolution: 2048,
      })
    );
  });
});

// ─── onEvent — photogrammetry_error ───────────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_error', () => {
  it('clears isProcessing and emits on_photogrammetry_error with stage', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isProcessing = true;
    st(node).stage = 'dense_cloud';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_error', error: 'OOM' });
    expect(st(node).isProcessing).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_photogrammetry_error',
      expect.objectContaining({
        error: 'OOM',
        stage: 'dense_cloud',
      })
    );
  });
});

// ─── onEvent — photogrammetry_cancel ──────────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_cancel', () => {
  it('resets isProcessing, stage=idle, progress=0, emits photogrammetry_abort', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isProcessing = true;
    st(node).stage = 'meshing';
    st(node).progress = 60;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_cancel' });
    expect(st(node).isProcessing).toBe(false);
    expect(st(node).stage).toBe('idle');
    expect(st(node).progress).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('photogrammetry_abort', expect.any(Object));
  });
});

// ─── onEvent — photogrammetry_export ──────────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_export', () => {
  it('emits photogrammetry_export_mesh with format and includeTexture=true by default', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_export' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'photogrammetry_export_mesh',
      expect.objectContaining({
        format: 'glb',
        includeTexture: true,
      })
    );
  });

  it('respects explicit format and includeTexture=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_export', format: 'obj', includeTexture: false });
    expect(ctx.emit).toHaveBeenCalledWith(
      'photogrammetry_export_mesh',
      expect.objectContaining({
        format: 'obj',
        includeTexture: false,
      })
    );
  });
});

// ─── onEvent — photogrammetry_clear ───────────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_clear', () => {
  it('resets imageCount/stage/progress and emits photogrammetry_clear_mesh when mesh exists', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).imageCount = 10;
    st(node).stage = 'complete';
    st(node).progress = 100;
    st(node).meshHandle = { id: 'm1' };
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_clear' });
    expect(st(node).imageCount).toBe(0);
    expect(st(node).stage).toBe('idle');
    expect(st(node).progress).toBe(0);
    expect(st(node).meshHandle).toBeNull();
    expect(ctx.emit).toHaveBeenCalledWith('photogrammetry_clear_mesh', expect.any(Object));
  });

  it('does NOT emit clear_mesh when meshHandle is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_clear' });
    expect(ctx.emit).not.toHaveBeenCalledWith('photogrammetry_clear_mesh', expect.any(Object));
  });
});

// ─── onEvent — photogrammetry_query ───────────────────────────────────────────

describe('PhotogrammetryTrait — onEvent: photogrammetry_query', () => {
  it('emits photogrammetry_info with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isProcessing = false;
    st(node).stage = 'complete';
    st(node).progress = 100;
    st(node).imageCount = 25;
    st(node).meshHandle = { id: 'm2' };
    st(node).boundingBox = { min: [-1, -1, -1], max: [1, 1, 1] };
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'photogrammetry_query', queryId: 'pq1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'photogrammetry_info',
      expect.objectContaining({
        queryId: 'pq1',
        isProcessing: false,
        stage: 'complete',
        progress: 100,
        imageCount: 25,
        hasMesh: true,
      })
    );
  });
});
