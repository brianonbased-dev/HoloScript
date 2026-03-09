import { describe, it, expect, beforeEach } from 'vitest';
import { pointCloudHandler } from '../PointCloudTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('PointCloudTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source: 'test.ply',
    point_size: 1.0,
    color_mode: 'rgb' as const,
    max_points: 5000000,
    lod: true,
    lod_levels: 4,
    streaming: false,
    chunk_size: 100000,
    format: 'ply' as const,
    intensity_range: [0, 255] as [number, number],
    height_range: [0, 100] as [number, number],
    eye_dome_lighting: true,
  };

  beforeEach(() => {
    node = createMockNode('pc');
    ctx = createMockContext();
    attachTrait(pointCloudHandler, node, cfg, ctx);
  });

  it('starts loading on attach', () => {
    expect((node as any).__pointCloudState.isLoading).toBe(true);
    expect(getEventCount(ctx, 'point_cloud_load')).toBe(1);
  });

  it('loaded event updates state', () => {
    sendEvent(pointCloudHandler, node, cfg, ctx, {
      type: 'point_cloud_loaded',
      pointCount: 1000000,
      boundingBox: { min: [0, 0, 0], max: [10, 10, 10] },
      memoryUsage: 50000000,
      octree: 'handle',
    });
    const s = (node as any).__pointCloudState;
    expect(s.isLoaded).toBe(true);
    expect(s.isLoading).toBe(false);
    expect(s.pointCount).toBe(1000000);
    expect(getEventCount(ctx, 'on_point_cloud_loaded')).toBe(1);
  });

  it('load_progress emits progress event', () => {
    sendEvent(pointCloudHandler, node, cfg, ctx, {
      type: 'point_cloud_load_progress',
      loadedPoints: 500,
      totalPoints: 1000,
      progress: 0.5,
    });
    expect(getEventCount(ctx, 'on_point_cloud_progress')).toBe(1);
  });

  it('load_error clears loading flag', () => {
    sendEvent(pointCloudHandler, node, cfg, ctx, {
      type: 'point_cloud_load_error',
      error: 'File not found',
    });
    expect((node as any).__pointCloudState.isLoading).toBe(false);
    expect(getEventCount(ctx, 'on_point_cloud_error')).toBe(1);
  });

  it('visibility_update tracks visible points', () => {
    sendEvent(pointCloudHandler, node, cfg, ctx, {
      type: 'point_cloud_visibility_update',
      visibleCount: 500000,
    });
    expect((node as any).__pointCloudState.visiblePoints).toBe(500000);
  });

  it('set_point_size emits update', () => {
    sendEvent(pointCloudHandler, node, cfg, ctx, { type: 'point_cloud_set_point_size', size: 2 });
    expect(getEventCount(ctx, 'point_cloud_update_size')).toBe(1);
  });

  it('set_color_mode emits update', () => {
    sendEvent(pointCloudHandler, node, cfg, ctx, {
      type: 'point_cloud_set_color_mode',
      mode: 'height',
    });
    expect(getEventCount(ctx, 'point_cloud_update_color')).toBe(1);
  });

  it('filter and clear_filter emit events', () => {
    sendEvent(pointCloudHandler, node, cfg, ctx, {
      type: 'point_cloud_filter',
      filter: { heightRange: [10, 50] },
    });
    expect(getEventCount(ctx, 'point_cloud_apply_filter')).toBe(1);
    sendEvent(pointCloudHandler, node, cfg, ctx, { type: 'point_cloud_clear_filter' });
    expect(getEventCount(ctx, 'point_cloud_reset_filter')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(pointCloudHandler, node, cfg, ctx, { type: 'point_cloud_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'point_cloud_info') as any;
    expect(r.isLoaded).toBe(false);
    expect(r.queryId).toBe('q1');
  });

  it('cleans up on detach', () => {
    (node as any).__pointCloudState.octreeHandle = 'h1';
    pointCloudHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__pointCloudState).toBeUndefined();
    expect(getEventCount(ctx, 'point_cloud_destroy')).toBe(1);
  });
});
