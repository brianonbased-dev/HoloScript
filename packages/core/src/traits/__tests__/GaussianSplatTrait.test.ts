import { describe, it, expect, beforeEach } from 'vitest';
import { gaussianSplatHandler } from '../GaussianSplatTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('GaussianSplatTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source: 'scene.ply',
    format: 'ply' as const,
    quality: 'medium' as const,
    max_splats: 1000000,
    sort_mode: 'distance' as const,
    streaming: false,
    compression: true,
    sh_degree: 3,
    cull_invisible: true,
    alpha_threshold: 0.01,
    scale_modifier: 1.0,
    lod: { octree_depth: 0, mode: 'none' as const, anchor_thresholds: [] as number[] },
    temporal_mode: 'static' as const,
    gaussian_budget: { total_cap: 0, per_avatar_reservation: 0 },
    spz: { version: '2.0' as const, quaternion_encoding: 'smallest_three' as const },
  };

  beforeEach(() => {
    node = createMockNode('splat');
    ctx = createMockContext();
    attachTrait(gaussianSplatHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = (node as any).__gaussianSplatState;
    expect(state).toBeDefined();
    expect(state.isLoading).toBe(true); // source provided
    expect(state.isLoaded).toBe(false);
  });

  it('initializes v4.1 state fields on attach', () => {
    const state = (node as any).__gaussianSplatState;
    expect(state.currentLODLevel).toBe(0);
    expect(state.gaussianBudgetUsed).toBe(0);
    expect(state.temporalFrameIndex).toBe(0);
  });

  it('emits splat_load on attach with source', () => {
    expect(getEventCount(ctx, 'splat_load')).toBe(1);
    const ev = getLastEvent(ctx, 'splat_load');
    expect(ev.source).toBe('scene.ply');
    expect(ev.format).toBe('ply');
  });

  it('splat_load includes v4.1 config fields', () => {
    const ev = getLastEvent(ctx, 'splat_load');
    expect(ev.lod).toBeDefined();
    expect(ev.temporalMode).toBe('static');
    expect(ev.gaussianBudget).toBeDefined();
    expect(ev.spz).toBeDefined();
    expect(ev.spz.version).toBe('2.0');
  });

  it('no loading without source', () => {
    const n2 = createMockNode('s2');
    const c2 = createMockContext();
    attachTrait(gaussianSplatHandler, n2, { ...cfg, source: '' }, c2);
    expect(getEventCount(c2, 'splat_load')).toBe(0);
    expect((n2 as any).__gaussianSplatState.isLoading).toBe(false);
  });

  it('splat_load_complete marks loaded and sets budget used', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_load_complete',
      splatCount: 500000,
      memoryUsage: 1024 * 1024,
      boundingBox: { min: [-1, -1, -1], max: [1, 1, 1] },
      renderHandle: 'handle1',
    });
    const state = (node as any).__gaussianSplatState;
    expect(state.isLoaded).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.splatCount).toBe(500000);
    expect(state.gaussianBudgetUsed).toBe(500000);
    expect(getEventCount(ctx, 'on_splat_loaded')).toBe(1);
  });

  it('splat_load_error handles failure', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_load_error',
      error: 'file not found',
    });
    expect((node as any).__gaussianSplatState.isLoading).toBe(false);
    expect(getEventCount(ctx, 'on_splat_error')).toBe(1);
  });

  it('splat_query returns info including v4.1 fields', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_load_complete',
      splatCount: 100,
      memoryUsage: 512,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      renderHandle: 'h',
    });
    sendEvent(gaussianSplatHandler, node, cfg, ctx, { type: 'splat_query', queryId: 'q1' });
    const info = getLastEvent(ctx, 'splat_info');
    expect(info.queryId).toBe('q1');
    expect(info.isLoaded).toBe(true);
    expect(info.splatCount).toBe(100);
    expect(info.currentLODLevel).toBe(0);
    expect(info.gaussianBudgetUsed).toBe(100);
    expect(info.temporalFrameIndex).toBe(0);
  });

  it('splat_visibility_update updates visible count', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_visibility_update',
      visibleCount: 42,
    });
    expect((node as any).__gaussianSplatState.visibleSplats).toBe(42);
  });

  it('splat_set_source reloads', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_load_complete',
      splatCount: 1,
      memoryUsage: 1,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      renderHandle: 'h',
    });
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_set_source',
      source: 'new.ply',
    });
    expect(getEventCount(ctx, 'splat_destroy')).toBe(1);
    expect(getEventCount(ctx, 'splat_load')).toBe(2); // original + reload
  });

  it('detach cleans up and emits destroy if loaded', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_load_complete',
      splatCount: 1,
      memoryUsage: 1,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      renderHandle: 'h',
    });
    gaussianSplatHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'splat_destroy')).toBe(1);
    expect((node as any).__gaussianSplatState).toBeUndefined();
  });

  // v4.1: SPZ format support
  it('accepts spz format in config', () => {
    const n2 = createMockNode('s3');
    const c2 = createMockContext();
    const spzCfg = { ...cfg, source: 'scene.spz', format: 'spz' as const };
    attachTrait(gaussianSplatHandler, n2, spzCfg, c2);
    expect(getEventCount(c2, 'splat_load')).toBe(1);
    const ev = getLastEvent(c2, 'splat_load');
    expect(ev.format).toBe('spz');
  });

  // v4.1: LOD event
  it('splat_set_lod emits splat_update_lod', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_set_lod',
      mode: 'octree',
      octree_depth: 6,
      anchor_thresholds: [5, 10, 20],
    });
    expect(getEventCount(ctx, 'splat_update_lod')).toBe(1);
    const ev = getLastEvent(ctx, 'splat_update_lod');
    expect(ev.mode).toBe('octree');
    expect(ev.octree_depth).toBe(6);
  });

  // v4.1: Budget event
  it('splat_set_budget emits splat_update_budget', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_set_budget',
      total_cap: 180000,
      per_avatar_reservation: 60000,
    });
    expect(getEventCount(ctx, 'splat_update_budget')).toBe(1);
    const ev = getLastEvent(ctx, 'splat_update_budget');
    expect(ev.total_cap).toBe(180000);
    expect(ev.per_avatar_reservation).toBe(60000);
  });

  // v4.1: Temporal mode event
  it('splat_set_temporal_mode resets frame index and emits', () => {
    const state = (node as any).__gaussianSplatState;
    state.temporalFrameIndex = 99;
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_set_temporal_mode',
      temporal_mode: '4d',
    });
    expect(state.temporalFrameIndex).toBe(0);
    expect(getEventCount(ctx, 'splat_update_temporal')).toBe(1);
  });

  // v4.1: Temporal advance event
  it('splat_temporal_advance is no-op in static mode', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_temporal_advance',
      frameIndex: 10,
    });
    expect((node as any).__gaussianSplatState.temporalFrameIndex).toBe(0);
    expect(getEventCount(ctx, 'splat_temporal_frame')).toBe(0);
  });

  it('splat_temporal_advance works in 4d mode', () => {
    const n2 = createMockNode('s4');
    const c2 = createMockContext();
    const tdCfg = { ...cfg, temporal_mode: '4d' as const };
    attachTrait(gaussianSplatHandler, n2, tdCfg, c2);
    sendEvent(gaussianSplatHandler, n2, tdCfg, c2, {
      type: 'splat_temporal_advance',
      frameIndex: 25,
    });
    expect((n2 as any).__gaussianSplatState.temporalFrameIndex).toBe(25);
    expect(getEventCount(c2, 'splat_temporal_frame')).toBe(1);
  });
});
