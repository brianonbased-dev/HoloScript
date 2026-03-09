/**
 * NerfTrait Production Tests
 *
 * Neural Radiance Field rendering for photorealistic scene capture.
 * Covers: defaultConfig, onAttach (no-URL no-op + URL triggers load),
 * onDetach (modelHandle guard), onUpdate (camera hash diff + cache hit/miss),
 * and all 8 onEvent types including LRU cache eviction.
 */

import { describe, it, expect, vi } from 'vitest';
import { nerfHandler } from '../NerfTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'nerf_test' } as any;
}
function makeCtx(camera?: any) {
  return { emit: vi.fn(), camera: camera ?? null };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...nerfHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  nerfHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__nerfState as any;
}
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  nerfHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('NerfTrait — defaultConfig', () => {
  it('has 10 fields with correct defaults', () => {
    const d = nerfHandler.defaultConfig!;
    expect(d.model_url).toBe('');
    expect(d.resolution).toBe(512);
    expect(d.render_mode).toBe('volume');
    expect(d.quality).toBe('balanced');
    expect(d.cache_frames).toBe(true);
    expect(d.cache_size).toBe(32);
    expect(d.near_plane).toBeCloseTo(0.1);
    expect(d.far_plane).toBe(100);
    expect(d.samples_per_ray).toBe(64);
    expect(d.background_color).toEqual([0, 0, 0]);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('NerfTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.isReady).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.renderTime).toBe(0);
    expect(s.frameCache).toBeInstanceOf(Map);
    expect(s.lastCameraHash).toBe('');
    expect(s.modelHandle).toBeNull();
  });

  it('emits nerf_load when model_url is set', () => {
    const node = makeNode();
    const { ctx } = attach(node, { model_url: 'model.nerf', background_color: [0.1, 0.2, 0.3] });
    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_load',
      expect.objectContaining({
        url: 'model.nerf',
        backgroundColor: [0.1, 0.2, 0.3],
      })
    );
  });

  it('does NOT emit nerf_load when model_url is empty', () => {
    const node = makeNode();
    const { ctx } = attach(node, { model_url: '' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('NerfTrait — onDetach', () => {
  it('emits nerf_destroy when modelHandle is set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).modelHandle = { h: 1 };
    ctx.emit.mockClear();
    nerfHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('nerf_destroy', expect.any(Object));
  });

  it('does NOT emit nerf_destroy when modelHandle is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    nerfHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('nerf_destroy', expect.any(Object));
  });

  it('removes __nerfState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    nerfHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__nerfState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('NerfTrait — onUpdate', () => {
  it('no-op when isReady=false', () => {
    const node = makeNode();
    const { cfg } = attach(node);
    const ctx = makeCtx({ position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } });
    // isReady is false after attach with no URL
    nerfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('no-op when context.camera is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isReady = true;
    nerfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits nerf_render on new camera hash', () => {
    const node = makeNode();
    const { cfg } = attach(node, { resolution: 1024, quality: 'quality', cache_frames: true });
    const cam = { position: { x: 1.0, y: 2.0, z: 3.0 }, rotation: { x: 0, y: 0, z: 0 }, fov: 60 };
    const ctx = makeCtx(cam);
    st(node).isReady = true;
    nerfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_render',
      expect.objectContaining({
        resolution: 1024,
        quality: 'quality',
      })
    );
  });

  it('does NOT re-render on same camera hash (no change)', () => {
    const node = makeNode();
    const { cfg } = attach(node, { cache_frames: true });
    const cam = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, fov: 60 };
    const ctx = makeCtx(cam);
    st(node).isReady = true;
    // First update sets the hash
    nerfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    ctx.emit.mockClear();
    // Second update same position → same hash → no emit
    nerfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits nerf_use_cached when frame in cache and camera hash matches', () => {
    const node = makeNode();
    const { cfg } = attach(node, { cache_frames: true });
    const cam = { position: { x: 5, y: 5, z: 5 }, rotation: { x: 0, y: 0, z: 0 }, fov: 60 };
    const ctx = makeCtx(cam);
    st(node).isReady = true;
    // Pre-populate cache with the hash
    const hash = '5,5,5,0,0,0';
    st(node).frameCache.set(hash, 'cached_frame');
    nerfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_use_cached',
      expect.objectContaining({ cacheKey: hash })
    );
  });

  it('cacheKey is undefined in nerf_render when cache_frames=false', () => {
    const node = makeNode();
    const { cfg } = attach(node, { cache_frames: false });
    const cam = { position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, fov: 60 };
    const ctx = makeCtx(cam);
    st(node).isReady = true;
    nerfHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const call = (ctx.emit as any).mock.calls.find((c: any[]) => c[0] === 'nerf_render');
    expect(call![1].cacheKey).toBeUndefined();
  });
});

// ─── onEvent — nerf_model_loaded ──────────────────────────────────────────────

describe('NerfTrait — onEvent: nerf_model_loaded', () => {
  it('sets isReady=true, stores handle, emits on_nerf_ready', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'nerf_model_loaded', handle: { h: 42 } });
    expect(st(node).isReady).toBe(true);
    expect(st(node).isLoading).toBe(false);
    expect(st(node).modelHandle).toEqual({ h: 42 });
    expect(ctx.emit).toHaveBeenCalledWith('on_nerf_ready', expect.any(Object));
  });
});

// ─── onEvent — nerf_load_error ────────────────────────────────────────────────

describe('NerfTrait — onEvent: nerf_load_error', () => {
  it('clears isLoading, emits on_nerf_error', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isLoading = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'nerf_load_error', error: 'ENOTFOUND' });
    expect(st(node).isLoading).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_nerf_error',
      expect.objectContaining({ error: 'ENOTFOUND' })
    );
  });
});

// ─── onEvent — nerf_frame_rendered ───────────────────────────────────────────

describe('NerfTrait — onEvent: nerf_frame_rendered', () => {
  it('stores renderTime and caches frame when cache_frames=true + cacheKey set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { cache_frames: true, cache_size: 32 });
    fire(node, cfg, ctx, {
      type: 'nerf_frame_rendered',
      renderTime: 14,
      cacheKey: 'k1',
      frame: 'frame_data',
    });
    expect(st(node).renderTime).toBe(14);
    expect(st(node).frameCache.get('k1')).toBe('frame_data');
  });

  it('does NOT cache when cache_frames=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { cache_frames: false });
    fire(node, cfg, ctx, {
      type: 'nerf_frame_rendered',
      renderTime: 14,
      cacheKey: 'k1',
      frame: 'fd',
    });
    expect(st(node).frameCache.size).toBe(0);
  });

  it('LRU evicts oldest entry when cache full (cache_size=2)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { cache_frames: true, cache_size: 2 });
    fire(node, cfg, ctx, {
      type: 'nerf_frame_rendered',
      renderTime: 1,
      cacheKey: 'k1',
      frame: 'f1',
    });
    fire(node, cfg, ctx, {
      type: 'nerf_frame_rendered',
      renderTime: 1,
      cacheKey: 'k2',
      frame: 'f2',
    });
    // Cache full (size=2). Adding k3 should evict k1.
    fire(node, cfg, ctx, {
      type: 'nerf_frame_rendered',
      renderTime: 1,
      cacheKey: 'k3',
      frame: 'f3',
    });
    expect(st(node).frameCache.has('k1')).toBe(false); // evicted
    expect(st(node).frameCache.has('k2')).toBe(true);
    expect(st(node).frameCache.has('k3')).toBe(true);
    expect(st(node).frameCache.size).toBe(2);
  });
});

// ─── onEvent — quality / resolution ──────────────────────────────────────────

describe('NerfTrait — onEvent: nerf_set_quality / nerf_set_resolution', () => {
  it('nerf_set_quality emits nerf_update_quality', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'nerf_set_quality', quality: 'fast' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_update_quality',
      expect.objectContaining({ quality: 'fast' })
    );
  });

  it('nerf_set_resolution emits nerf_update_resolution', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'nerf_set_resolution', resolution: 1024 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_update_resolution',
      expect.objectContaining({ resolution: 1024 })
    );
  });
});

// ─── onEvent — nerf_clear_cache ──────────────────────────────────────────────

describe('NerfTrait — onEvent: nerf_clear_cache', () => {
  it('clears frameCache', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { cache_frames: true });
    fire(node, cfg, ctx, {
      type: 'nerf_frame_rendered',
      renderTime: 1,
      cacheKey: 'k1',
      frame: 'f1',
    });
    expect(st(node).frameCache.size).toBe(1);
    fire(node, cfg, ctx, { type: 'nerf_clear_cache' });
    expect(st(node).frameCache.size).toBe(0);
  });
});

// ─── onEvent — nerf_reload ────────────────────────────────────────────────────

describe('NerfTrait — onEvent: nerf_reload', () => {
  it('emits nerf_destroy + resets isReady + clears cache + reloads when modelHandle set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { model_url: 'model.nerf', cache_frames: true });
    st(node).modelHandle = { h: 1 };
    st(node).isReady = true;
    st(node).frameCache.set('k1', 'f1');
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'nerf_reload' });
    expect(ctx.emit).toHaveBeenCalledWith('nerf_destroy', expect.any(Object));
    expect(st(node).isReady).toBe(false);
    expect(st(node).frameCache.size).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('nerf_load', expect.any(Object));
  });

  it('no-op when model_url is empty', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { model_url: '' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'nerf_reload' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — nerf_query ─────────────────────────────────────────────────────

describe('NerfTrait — onEvent: nerf_query', () => {
  it('emits nerf_info with snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { cache_size: 16, cache_frames: true });
    st(node).isReady = true;
    st(node).renderTime = 22;
    st(node).frameCache.set('k1', 'f1');
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'nerf_query', queryId: 'nq1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_info',
      expect.objectContaining({
        queryId: 'nq1',
        isReady: true,
        renderTime: 22,
        cachedFrames: 1,
        cacheSize: 16,
      })
    );
  });
});
