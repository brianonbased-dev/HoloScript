import { describe, it, expect, beforeEach } from 'vitest';
import { gaussianSplatHandler } from '../GaussianSplatTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

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

  it('emits splat_load on attach with source', () => {
    expect(getEventCount(ctx, 'splat_load')).toBe(1);
    const ev = getLastEvent(ctx, 'splat_load');
    expect(ev.source).toBe('scene.ply');
    expect(ev.format).toBe('ply');
  });

  it('no loading without source', () => {
    const n2 = createMockNode('s2');
    const c2 = createMockContext();
    attachTrait(gaussianSplatHandler, n2, { ...cfg, source: '' }, c2);
    expect(getEventCount(c2, 'splat_load')).toBe(0);
    expect((n2 as any).__gaussianSplatState.isLoading).toBe(false);
  });

  it('splat_load_complete marks loaded', () => {
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

  it('splat_query returns info', () => {
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
  });

  it('splat_visibility_update updates visible count', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, { type: 'splat_visibility_update', visibleCount: 42 });
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
    sendEvent(gaussianSplatHandler, node, cfg, ctx, { type: 'splat_set_source', source: 'new.ply' });
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
});
