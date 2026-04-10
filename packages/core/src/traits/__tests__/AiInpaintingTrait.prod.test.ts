/**
 * AiInpaintingTrait Production Tests
 *
 * AI-powered scene inpainting: mask management, process lifecycle,
 * region tracking, clear mask with preserve, error handling, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiInpaintingHandler } from '../AiInpaintingTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'inp-node') {
  return { id } as any;
}

function makeConfig(overrides: any = {}) {
  return { ...aiInpaintingHandler.defaultConfig, ...overrides };
}

function makeContext() {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
  };
}

function getState(ctx: ReturnType<typeof makeContext>) {
  return ctx.getState().aiInpainting;
}

// =============================================================================
// TESTS
// =============================================================================

describe('AiInpaintingTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    aiInpaintingHandler.onAttach(node, config, ctx);
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes idle state', () => {
      const s = getState(ctx);
      expect(s.isProcessing).toBe(false);
      expect(s.activeMask).toBeNull();
      expect(s.regions.size).toBe(0);
      expect(s.totalInpaints).toBe(0);
      expect(s.lastResultUrl).toBeNull();
      expect(s.avgProcessTimeMs).toBe(0);
    });

    it('emits inpainting:ready', () => {
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:ready', {
        model: 'sd-inpaint',
        blend_mode: 'seamless',
      });
    });

    it('has correct defaults', () => {
      const d = aiInpaintingHandler.defaultConfig;
      expect(d.model).toBe('sd-inpaint');
      expect(d.strength).toBe(0.8);
      expect(d.padding).toBe(16);
      expect(d.preserve_original_on_mask_clear).toBe(true);
    });

    it('handler name is ai_inpainting', () => {
      expect(aiInpaintingHandler.name).toBe('ai_inpainting');
    });
  });

  // ======== MASK MANAGEMENT ========

  describe('mask management', () => {
    it('sets active mask', () => {
      ctx.emit.mockClear();
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'data:image/png;base64,mask1' },
      });

      expect(getState(ctx).activeMask).toBe('data:image/png;base64,mask1');
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:mask_set', {
        hasMask: true,
        source: 'manual',
      });
    });

    it('clears mask with preserve_original', () => {
      getState(ctx).activeMask = 'some-mask';
      ctx.emit.mockClear();

      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:clear_mask',
        payload: {},
      });

      expect(getState(ctx).activeMask).toBeNull();
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:original_restored');
    });

    it('clears mask without restore when preserve disabled', () => {
      const cfg = makeConfig({ preserve_original_on_mask_clear: false });
      const c = makeContext();
      aiInpaintingHandler.onAttach(node, cfg, c);
      getState(c).activeMask = 'mask';
      c.emit.mockClear();

      aiInpaintingHandler.onEvent!(node, cfg, c, { type: 'inpainting:clear_mask', payload: {} });

      expect(getState(c).activeMask).toBeNull();
      expect(c.emit).not.toHaveBeenCalledWith('inpainting:original_restored');
    });
  });

  // ======== PROCESS LIFECYCLE ========

  describe('process lifecycle', () => {
    it('fails to process without mask', () => {
      ctx.emit.mockClear();

      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:process',
        payload: { prompt: 'fill sky' },
      });

      expect(getState(ctx).isProcessing).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:error', { message: 'No mask set' });
    });

    it('starts processing with mask set', () => {
      // Set mask first
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask_data' },
      });
      ctx.emit.mockClear();

      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:process',
        payload: { regionId: 'r1', prompt: 'add clouds' },
      });

      const s = getState(ctx);
      expect(s.isProcessing).toBe(true);
      expect(s.regions.has('r1')).toBe(true);
      expect(s.regions.get('r1').prompt).toBe('add clouds');
      expect(ctx.emit).toHaveBeenCalledWith(
        'inpainting:started',
        expect.objectContaining({
          regionId: 'r1',
          prompt: 'add clouds',
          model: 'sd-inpaint',
        })
      );
    });

    it('completes and stores result in region', () => {
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      });
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:process',
        payload: { regionId: 'r1', prompt: 'test' },
      });
      ctx.emit.mockClear();

      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:complete',
        payload: { regionId: 'r1', resultUrl: 'https://cdn/result.png', elapsedMs: 500 },
      });

      const s = getState(ctx);
      expect(s.isProcessing).toBe(false);
      expect(s.totalInpaints).toBe(1);
      expect(s.lastResultUrl).toBe('https://cdn/result.png');
      expect(s.regions.get('r1').resultUrl).toBe('https://cdn/result.png');
      expect(ctx.emit).toHaveBeenCalledWith(
        'inpainting:result',
        expect.objectContaining({
          regionId: 'r1',
          blend_mode: 'seamless',
        })
      );
    });

    it('calculates rolling average time', () => {
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'm' },
      });

      // Process 1: 100ms
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:process',
        payload: { regionId: 'a' },
      });
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:complete',
        payload: { regionId: 'a', elapsedMs: 100 },
      });

      // Process 2: 300ms → avg = 200
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:process',
        payload: { regionId: 'b' },
      });
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:complete',
        payload: { regionId: 'b', elapsedMs: 300 },
      });

      expect(getState(ctx).avgProcessTimeMs).toBe(200);
    });
  });

  // ======== ERROR HANDLING ========

  describe('error handling', () => {
    it('clears processing on error', () => {
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'm' },
      });
      aiInpaintingHandler.onEvent!(node, config, ctx, { type: 'inpainting:process', payload: {} });
      ctx.emit.mockClear();

      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:error',
        payload: { message: 'OOM' },
      });

      expect(getState(ctx).isProcessing).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:error', { message: 'OOM' });
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('emits cancelled when processing', () => {
      aiInpaintingHandler.onEvent!(node, config, ctx, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'm' },
      });
      aiInpaintingHandler.onEvent!(node, config, ctx, { type: 'inpainting:process', payload: {} });
      ctx.emit.mockClear();

      aiInpaintingHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:cancelled');
    });

    it('no-op detach when idle', () => {
      ctx.emit.mockClear();
      aiInpaintingHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).not.toHaveBeenCalledWith('inpainting:cancelled');
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };
      aiInpaintingHandler.onEvent!(node, config, noCtx, {
        type: 'inpainting:process',
        payload: {},
      });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
