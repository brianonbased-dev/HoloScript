import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearNeRFInferenceAdapter,
  createNeRFHandler,
  registerNeRFInferenceAdapter,
  type NeRFConfig,
} from './NeRFTrait';
import type { TraitContext } from './types';

function makeCtx(extra: Partial<TraitContext> = {}) {
  const events: { type: string; payload: unknown }[] = [];
  return {
    events,
    emit: vi.fn((type: string, payload?: unknown) => events.push({ type, payload })),
    ...extra,
  };
}

const baseConfig: NeRFConfig = {
  method: 'instant_ngp',
  resolution: 256,
  nearPlane: 0.1,
  farPlane: 4,
  samplesPerRay: 32,
  batchSize: 1024,
  enableDeformation: false,
  source: 'stage.nerf.json',
  cacheFrames: true,
  cacheSize: 2,
};

afterEach(() => {
  clearNeRFInferenceAdapter();
  vi.restoreAllMocks();
});

describe('film3d NeRFTrait', () => {
  it('emits a core-compatible load request when no native adapter is registered', () => {
    const handler = createNeRFHandler();
    const node = { id: 'nerf-node' };
    const ctx = makeCtx();

    handler.onAttach(node, baseConfig, ctx);

    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_load',
      expect.objectContaining({
        node,
        url: 'stage.nerf.json',
        method: 'instant_ngp',
      })
    );
    expect((node as any).__nerfState.isLoading).toBe(true);
  });

  it('loads and renders through a registered native inference adapter', async () => {
    const handler = createNeRFHandler();
    const node = { id: 'nerf-node' };
    const ctx = makeCtx({
      camera: { position: [1, 2, 3], rotation: [0, 0, 0], fov: 55 },
    });
    const adapter = {
      loadModel: vi.fn(() => ({ handle: 'h1' })),
      renderFrame: vi.fn(() => ({
        frame: { pixels: 'rgba' },
        renderTime: 12,
        psnr: 31,
      })),
    };
    registerNeRFInferenceAdapter(adapter);

    handler.onAttach(node, baseConfig, ctx);
    await Promise.resolve();

    expect(adapter.loadModel).toHaveBeenCalledWith(expect.objectContaining(baseConfig), node);
    expect((node as any).__nerfState.isReady).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_nerf_ready', { node });

    handler.onEvent(node, baseConfig, ctx, { type: 'nerf:render' });
    await Promise.resolve();

    expect(adapter.renderFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        node,
        handle: { handle: 'h1' },
        method: 'instant_ngp',
        source: 'stage.nerf.json',
        resolution: 256,
        samplesPerRay: 32,
        cacheKey: '1,2,3,0,0,0',
      })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_frame_rendered',
      expect.objectContaining({
        frame: { pixels: 'rgba' },
        renderTime: 12,
        psnr: 31,
        cacheKey: '1,2,3,0,0,0',
      })
    );
  });

  it('uses cached frames instead of dispatching duplicate adapter renders', async () => {
    const handler = createNeRFHandler();
    const node = { id: 'nerf-node' };
    const ctx = makeCtx({
      camera: { position: [0, 0, 0], rotation: [0, 0, 0], fov: 60 },
    });
    const adapter = {
      loadModel: vi.fn(() => 'handle'),
      renderFrame: vi.fn(() => ({ frame: 'frame0', renderTime: 8 })),
    };
    registerNeRFInferenceAdapter(adapter);

    handler.onAttach(node, baseConfig, ctx);
    await Promise.resolve();
    handler.onEvent(node, baseConfig, ctx, { type: 'nerf:render' });
    await Promise.resolve();
    handler.onEvent(node, baseConfig, ctx, { type: 'nerf:render' });

    expect(adapter.renderFrame).toHaveBeenCalledTimes(1);
    expect(ctx.emit).toHaveBeenCalledWith('nerf_use_cached', {
      node,
      cacheKey: '0,0,0,0,0,0',
    });
  });

  it('turns host model-loaded events into render requests when no adapter is present', () => {
    const handler = createNeRFHandler();
    const node = { id: 'nerf-node' };
    const ctx = makeCtx({
      camera: { position: [0.123, 0, 0], rotation: [0, 0, 0], fov: 60 },
    });

    handler.onAttach(node, baseConfig, ctx);
    handler.onEvent(node, baseConfig, ctx, { type: 'nerf_model_loaded', handle: 'host-handle' });
    handler.onEvent(node, baseConfig, ctx, { type: 'nerf:render' });

    expect(ctx.emit).toHaveBeenCalledWith(
      'nerf_render',
      expect.objectContaining({
        handle: 'host-handle',
        cacheKey: '0.12,0,0,0,0,0',
      })
    );
  });

  it('does not spam host render requests on unchanged camera updates', () => {
    const handler = createNeRFHandler();
    const node = { id: 'nerf-node' };
    const ctx = makeCtx({
      camera: { position: [1, 0, 0], rotation: [0, 0, 0], fov: 60 },
    });

    handler.onAttach(node, baseConfig, ctx);
    handler.onEvent(node, baseConfig, ctx, { type: 'nerf_model_loaded', handle: 'host-handle' });
    handler.onEvent(node, baseConfig, ctx, { type: 'nerf:render' });
    (ctx.emit as unknown as { mockClear: () => void }).mockClear();

    handler.onUpdate(node, baseConfig, ctx, 0.016);
    handler.onUpdate(node, baseConfig, ctx, 0.016);

    expect(ctx.emit).not.toHaveBeenCalledWith('nerf_render', expect.anything());
  });
});
