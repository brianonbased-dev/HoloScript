import { describe, it, expect, beforeEach } from 'vitest';
import { photogrammetryHandler } from '../PhotogrammetryTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
} from './traitTestHelpers';

describe('PhotogrammetryTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source_type: 'images' as const,
    quality: 'medium' as const,
    mesh_simplification: 0.5,
    texture_resolution: 2048,
    auto_align: true,
    geo_reference: false,
    coordinate_system: 'local',
    mask_background: true,
    feature_matching: 'sift' as const,
  };

  beforeEach(() => {
    node = createMockNode('pg');
    ctx = createMockContext();
    attachTrait(photogrammetryHandler, node, cfg, ctx);
  });

  it('emits init on attach', () => {
    expect(getEventCount(ctx, 'photogrammetry_init')).toBe(1);
    expect((node as any).__photogrammetryState.stage).toBe('idle');
  });

  it('add images increments count', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, {
      type: 'photogrammetry_add_images',
      images: ['img1.jpg', 'img2.jpg'],
    });
    expect((node as any).__photogrammetryState.imageCount).toBe(2);
    expect(getEventCount(ctx, 'photogrammetry_upload')).toBe(1);
  });

  it('start processing begins pipeline', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, {
      type: 'photogrammetry_add_images',
      images: ['a.jpg'],
    });
    sendEvent(photogrammetryHandler, node, cfg, ctx, { type: 'photogrammetry_start' });
    expect((node as any).__photogrammetryState.isProcessing).toBe(true);
    expect(getEventCount(ctx, 'photogrammetry_process')).toBe(1);
  });

  it('start without images does nothing', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, { type: 'photogrammetry_start' });
    expect((node as any).__photogrammetryState.isProcessing).toBe(false);
  });

  it('progress updates state', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, {
      type: 'photogrammetry_progress',
      stage: 'meshing',
      progress: 50,
    });
    expect((node as any).__photogrammetryState.stage).toBe('meshing');
    expect(getEventCount(ctx, 'on_photogrammetry_progress')).toBe(1);
  });

  it('complete sets mesh handle', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, {
      type: 'photogrammetry_complete',
      mesh: { id: 'mesh-1' },
      vertexCount: 1000,
      boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
    });
    const s = (node as any).__photogrammetryState;
    expect(s.isProcessing).toBe(false);
    expect(s.stage).toBe('complete');
    expect(s.meshHandle).toBeTruthy();
    expect(getEventCount(ctx, 'on_capture_complete')).toBe(1);
  });

  it('error stops processing', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, {
      type: 'photogrammetry_error',
      error: 'fail',
    });
    expect(getEventCount(ctx, 'on_photogrammetry_error')).toBe(1);
  });

  it('cancel resets state', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, { type: 'photogrammetry_cancel' });
    expect((node as any).__photogrammetryState.stage).toBe('idle');
  });

  it('clear removes images and mesh', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, {
      type: 'photogrammetry_add_images',
      images: ['a.jpg'],
    });
    sendEvent(photogrammetryHandler, node, cfg, ctx, { type: 'photogrammetry_complete', mesh: {} });
    sendEvent(photogrammetryHandler, node, cfg, ctx, { type: 'photogrammetry_clear' });
    const s = (node as any).__photogrammetryState;
    expect(s.imageCount).toBe(0);
    expect(s.meshHandle).toBeNull();
  });

  it('query emits info', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, {
      type: 'photogrammetry_query',
      queryId: 'q1',
    });
    expect(getEventCount(ctx, 'photogrammetry_info')).toBe(1);
  });

  it('detach destroys mesh if loaded', () => {
    sendEvent(photogrammetryHandler, node, cfg, ctx, { type: 'photogrammetry_complete', mesh: {} });
    photogrammetryHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'photogrammetry_destroy')).toBe(1);
    expect((node as any).__photogrammetryState).toBeUndefined();
  });
});
