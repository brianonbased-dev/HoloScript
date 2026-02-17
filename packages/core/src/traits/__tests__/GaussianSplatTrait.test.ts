import { describe, it, expect, beforeEach } from 'vitest';
import { gaussianSplatHandler } from '../GaussianSplatTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

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
    node = createMockNode('gs');
    ctx = createMockContext();
    attachTrait(gaussianSplatHandler, node, cfg, ctx);
  });

  it('emits splat_load on attach with source', () => {
    expect(getEventCount(ctx, 'splat_load')).toBe(1);
    expect((node as any).__gaussianSplatState.isLoading).toBe(true);
  });

  it('no load without source', () => {
    const n = createMockNode('gs2');
    const c = createMockContext();
    attachTrait(gaussianSplatHandler, n, { ...cfg, source: '' }, c);
    expect(getEventCount(c, 'splat_load')).toBe(0);
  });

  it('splat_load_complete marks loaded', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_load_complete',
      splatCount: 500000,
      memoryUsage: 1024,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      renderHandle: {},
    });
    const s = (node as any).__gaussianSplatState;
    expect(s.isLoaded).toBe(true);
    expect(s.splatCount).toBe(500000);
    expect(getEventCount(ctx, 'on_splat_loaded')).toBe(1);
  });

  it('splat_load_error stops loading', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, { type: 'splat_load_error', error: 'bad file' });
    expect((node as any).__gaussianSplatState.isLoading).toBe(false);
    expect(getEventCount(ctx, 'on_splat_error')).toBe(1);
  });

  it('splat_visibility_update tracks visible count', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, { type: 'splat_visibility_update', visibleCount: 1000 });
    expect((node as any).__gaussianSplatState.visibleSplats).toBe(1000);
  });

  it('splat_set_source destroys old and loads new', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_load_complete',
      splatCount: 100,
      memoryUsage: 50,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      renderHandle: {},
    });
    sendEvent(gaussianSplatHandler, node, cfg, ctx, { type: 'splat_set_source', source: 'new.ply' });
    expect(getEventCount(ctx, 'splat_destroy')).toBe(1);
    expect(getEventCount(ctx, 'splat_load')).toBe(2);
  });

  it('splat_query emits info', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, { type: 'splat_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'splat_info')).toBe(1);
  });

  it('detach destroys render handle', () => {
    sendEvent(gaussianSplatHandler, node, cfg, ctx, {
      type: 'splat_load_complete',
      splatCount: 100,
      memoryUsage: 50,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      renderHandle: {},
    });
    gaussianSplatHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'splat_destroy')).toBe(1);
    expect((node as any).__gaussianSplatState).toBeUndefined();
  });
});
