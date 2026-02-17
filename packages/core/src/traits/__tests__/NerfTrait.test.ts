import { describe, it, expect, beforeEach } from 'vitest';
import { nerfHandler } from '../NerfTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

describe('NerfTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    model_url: 'scene.nrf',
    resolution: 512,
    render_mode: 'volume' as const,
    quality: 'balanced' as const,
    cache_frames: true,
    cache_size: 32,
    near_plane: 0.1,
    far_plane: 100,
    samples_per_ray: 64,
    background_color: [0, 0, 0] as [number, number, number],
  };

  beforeEach(() => {
    node = createMockNode('nerf');
    ctx = createMockContext();
    attachTrait(nerfHandler, node, cfg, ctx);
  });

  it('loads model on attach when url provided', () => {
    expect(getEventCount(ctx, 'nerf_load')).toBe(1);
    expect((node as any).__nerfState.isLoading).toBe(true);
  });

  it('no load without model url', () => {
    const n = createMockNode('n2');
    const c = createMockContext();
    attachTrait(nerfHandler, n, { ...cfg, model_url: '' }, c);
    expect(getEventCount(c, 'nerf_load')).toBe(0);
  });

  it('model loaded marks ready', () => {
    sendEvent(nerfHandler, node, cfg, ctx, { type: 'nerf_model_loaded', handle: 'h1' });
    const s = (node as any).__nerfState;
    expect(s.isReady).toBe(true);
    expect(s.isLoading).toBe(false);
    expect(getEventCount(ctx, 'on_nerf_ready')).toBe(1);
  });

  it('load error clears loading', () => {
    sendEvent(nerfHandler, node, cfg, ctx, { type: 'nerf_load_error', error: 'bad file' });
    expect((node as any).__nerfState.isLoading).toBe(false);
    expect(getEventCount(ctx, 'on_nerf_error')).toBe(1);
  });

  it('frame rendered caches result', () => {
    sendEvent(nerfHandler, node, cfg, ctx, {
      type: 'nerf_frame_rendered',
      renderTime: 10,
      cacheKey: 'cam1',
      frame: { data: 'pixels' },
    });
    expect((node as any).__nerfState.frameCache.size).toBe(1);
  });

  it('cache evicts oldest when full', () => {
    for (let i = 0; i < 33; i++) {
      sendEvent(nerfHandler, node, cfg, ctx, {
        type: 'nerf_frame_rendered',
        renderTime: 1,
        cacheKey: `cam${i}`,
        frame: {},
      });
    }
    expect((node as any).__nerfState.frameCache.size).toBe(32);
  });

  it('clear_cache empties cache', () => {
    sendEvent(nerfHandler, node, cfg, ctx, { type: 'nerf_frame_rendered', renderTime: 1, cacheKey: 'k', frame: {} });
    sendEvent(nerfHandler, node, cfg, ctx, { type: 'nerf_clear_cache' });
    expect((node as any).__nerfState.frameCache.size).toBe(0);
  });

  it('reload destroys and reloads', () => {
    sendEvent(nerfHandler, node, cfg, ctx, { type: 'nerf_model_loaded', handle: 'h1' });
    sendEvent(nerfHandler, node, cfg, ctx, { type: 'nerf_reload' });
    expect(getEventCount(ctx, 'nerf_destroy')).toBe(1);
    expect(getEventCount(ctx, 'nerf_load')).toBe(2);
  });

  it('query emits info', () => {
    sendEvent(nerfHandler, node, cfg, ctx, { type: 'nerf_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'nerf_info')).toBe(1);
  });

  it('detach destroys model handle', () => {
    sendEvent(nerfHandler, node, cfg, ctx, { type: 'nerf_model_loaded', handle: 'h1' });
    nerfHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'nerf_destroy')).toBe(1);
    expect((node as any).__nerfState).toBeUndefined();
  });
});
