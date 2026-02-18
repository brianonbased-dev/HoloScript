import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait, updateTrait, sendEvent } from './traitTestHelpers';

// Mock SplatProcessingService
vi.mock('../../services/SplatProcessingService', () => ({
  SplatProcessingService: class MockSplatProcessingService {
    parseSplat = vi.fn().mockResolvedValue({ count: 1000, positions: new Float32Array(3000) });
    sortSplat = vi.fn().mockReturnValue(new Uint32Array(1000));
    intersectRay = vi.fn().mockReturnValue({ index: 42, distance: 1.5 });
  },
}));

import { volumetricHandler } from '../VolumetricTrait';

describe('VolumetricTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    src: 'model.splat',
    renderMode: 'splat' as const,
    pointSize: 1.0,
    opacity: 1.0,
    lod_auto: true,
    max_points: 1000000,
    use_gpu_compute: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('vol1');
    ctx = createMockContext();
    attachTrait(volumetricHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const s = (node as any).__volumetricState;
    expect(s).toBeDefined();
    expect(s.isLoaded).toBe(false);
    expect(s.isLoading).toBe(true);
    expect(s.renderMode).toBe('splat');
    expect(s.service).toBeDefined();
  });

  it('emits load start event when src is provided', () => {
    const loadEvents = ctx.emittedEvents.filter(e => e.event === 'volumetric_load_start');
    expect(loadEvents.length).toBe(1);
    expect((loadEvents[0].data as any).src).toBe('model.splat');
  });

  it('does not emit load event when src is empty', () => {
    const node2 = createMockNode('vol2');
    const ctx2 = createMockContext();
    attachTrait(volumetricHandler, node2, { ...cfg, src: '' }, ctx2);
    expect(ctx2.emittedEvents.find(e => e.event === 'volumetric_load_start')).toBeUndefined();
  });

  it('cleans up on detach and emits unload', () => {
    (node as any).__volumetricState.isLoaded = true;
    volumetricHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(ctx.emittedEvents.some(e => e.event === 'volumetric_unload')).toBe(true);
    expect((node as any).__volumetricState).toBeUndefined();
  });

  it('sets LOD on volumetric_set_lod event', () => {
    sendEvent(volumetricHandler, node, cfg, ctx, { type: 'volumetric_set_lod', lod: 2 });
    expect((node as any).__volumetricState.currentLOD).toBe(2);
  });

  it('sets clip bounds on volumetric_set_clip event', () => {
    sendEvent(volumetricHandler, node, cfg, ctx, {
      type: 'volumetric_set_clip',
      min: [0, 0, 0],
      max: [1, 1, 1],
    });
    expect((node as any).__volumetricState.clipBounds).toBeDefined();
  });

  it('resets clip bounds on volumetric_reset_clip event', () => {
    (node as any).__volumetricState.clipBounds = { min: [0,0,0], max: [1,1,1] };
    sendEvent(volumetricHandler, node, cfg, ctx, { type: 'volumetric_reset_clip' });
    expect((node as any).__volumetricState.clipBounds).toBeNull();
  });

  it('does not render update when not loaded', () => {
    ctx.clearEvents();
    updateTrait(volumetricHandler, node, cfg, ctx, 0.016);
    expect(ctx.emittedEvents.find(e => e.event === 'volumetric_render_update')).toBeUndefined();
  });

  it('has correct handler name', () => {
    expect(volumetricHandler.name).toBe('volumetric');
  });

  it('has correct default config', () => {
    expect((volumetricHandler.defaultConfig as any).renderMode).toBe('splat');
    expect((volumetricHandler.defaultConfig as any).max_points).toBe(1000000);
  });
});
