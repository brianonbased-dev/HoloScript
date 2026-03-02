/**
 * AiInpaintingTrait Tests
 *
 * Tests for AI-powered inpainting trait covering initialization,
 * mask management, inpainting workflow, error handling, and cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { aiInpaintingHandler } from '../AiInpaintingTrait';
import type { AiInpaintingConfig } from '../AiInpaintingTrait';
import { createMockNode } from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Extended mock context with setState/getState
// ---------------------------------------------------------------------------

interface StatefulMockContext {
  emit: (event: string, data: unknown) => void;
  emittedEvents: Array<{ event: string; data: unknown }>;
  clearEvents: () => void;
  getState: () => Record<string, unknown>;
  setState: (updates: Record<string, unknown>) => void;
}

function createStatefulMockContext(): StatefulMockContext {
  const emittedEvents: Array<{ event: string; data: unknown }> = [];
  let state: Record<string, unknown> = {};
  return {
    emit(event: string, data: unknown) {
      emittedEvents.push({ event, data });
    },
    emittedEvents,
    clearEvents() {
      emittedEvents.length = 0;
    },
    getState() {
      return state;
    },
    setState(updates: Record<string, unknown>) {
      state = { ...state, ...updates };
    },
  };
}

function getLastEvent(ctx: StatefulMockContext, eventType: string) {
  for (let i = ctx.emittedEvents.length - 1; i >= 0; i--) {
    if (ctx.emittedEvents[i].event === eventType) {
      return ctx.emittedEvents[i].data;
    }
  }
  return undefined;
}

function getEventCount(ctx: StatefulMockContext, eventType: string): number {
  return ctx.emittedEvents.filter((e) => e.event === eventType).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiInpaintingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: StatefulMockContext;
  const defaultConfig = aiInpaintingHandler.defaultConfig;

  beforeEach(() => {
    node = createMockNode('inpaint-node');
    ctx = createStatefulMockContext();
    aiInpaintingHandler.onAttach!(node as any, defaultConfig, ctx as any);
  });

  // =========================================================================
  // Default config
  // =========================================================================

  describe('default config', () => {
    it('uses sd-inpaint model', () => {
      expect(defaultConfig.model).toBe('sd-inpaint');
    });

    it('uses manual mask source', () => {
      expect(defaultConfig.mask_source).toBe('manual');
    });

    it('uses seamless blend mode', () => {
      expect(defaultConfig.blend_mode).toBe('seamless');
    });

    it('strength defaults to 0.8', () => {
      expect(defaultConfig.strength).toBe(0.8);
    });

    it('defaults to 20 steps', () => {
      expect(defaultConfig.steps).toBe(20);
    });

    it('preserves original on mask clear', () => {
      expect(defaultConfig.preserve_original_on_mask_clear).toBe(true);
    });
  });

  // =========================================================================
  // onAttach
  // =========================================================================

  describe('onAttach', () => {
    it('initializes aiInpainting state', () => {
      const state = ctx.getState().aiInpainting as any;
      expect(state).toBeDefined();
      expect(state.isProcessing).toBe(false);
      expect(state.activeMask).toBeNull();
      expect(state.totalInpaints).toBe(0);
      expect(state.lastResultUrl).toBeNull();
    });

    it('emits inpainting:ready with model and blend mode', () => {
      expect(getEventCount(ctx, 'inpainting:ready')).toBe(1);
      const data = getLastEvent(ctx, 'inpainting:ready') as any;
      expect(data.model).toBe('sd-inpaint');
      expect(data.blend_mode).toBe('seamless');
    });
  });

  // =========================================================================
  // onDetach
  // =========================================================================

  describe('onDetach', () => {
    it('emits inpainting:cancelled when processing', () => {
      const state = ctx.getState().aiInpainting as any;
      state.isProcessing = true;

      ctx.clearEvents();
      aiInpaintingHandler.onDetach!(node as any, defaultConfig, ctx as any);

      expect(getEventCount(ctx, 'inpainting:cancelled')).toBe(1);
    });

    it('does not emit when not processing', () => {
      ctx.clearEvents();
      aiInpaintingHandler.onDetach!(node as any, defaultConfig, ctx as any);
      expect(getEventCount(ctx, 'inpainting:cancelled')).toBe(0);
    });
  });

  // =========================================================================
  // inpainting:set_mask event
  // =========================================================================

  describe('inpainting:set_mask', () => {
    it('sets active mask and emits mask_set', () => {
      ctx.clearEvents();
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'base64_mask_data' },
      });

      const state = ctx.getState().aiInpainting as any;
      expect(state.activeMask).toBe('base64_mask_data');
      expect(getEventCount(ctx, 'inpainting:mask_set')).toBe(1);
      const data = getLastEvent(ctx, 'inpainting:mask_set') as any;
      expect(data.hasMask).toBe(true);
    });

    it('handles null mask data', () => {
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:set_mask',
        payload: {},
      });

      const state = ctx.getState().aiInpainting as any;
      expect(state.activeMask).toBeNull();
    });
  });

  // =========================================================================
  // inpainting:process event
  // =========================================================================

  describe('inpainting:process', () => {
    it('starts processing when mask is set', () => {
      // Set a mask first
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask123' },
      });
      ctx.clearEvents();

      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:process',
        payload: { regionId: 'r1', prompt: 'fill with grass' },
      });

      const state = ctx.getState().aiInpainting as any;
      expect(state.isProcessing).toBe(true);
      expect(state.regions.has('r1')).toBe(true);
      expect(getEventCount(ctx, 'inpainting:started')).toBe(1);
    });

    it('emits error when no mask is set', () => {
      ctx.clearEvents();
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:process',
        payload: { prompt: 'test' },
      });

      expect(getEventCount(ctx, 'inpainting:error')).toBe(1);
      const data = getLastEvent(ctx, 'inpainting:error') as any;
      expect(data.message).toBe('No mask set');
    });

    it('creates region with mask data and prompt', () => {
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask_abc' },
      });
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:process',
        payload: { regionId: 'region-1', prompt: 'replace with sky' },
      });

      const state = ctx.getState().aiInpainting as any;
      const region = state.regions.get('region-1');
      expect(region).toBeDefined();
      expect(region.maskData).toBe('mask_abc');
      expect(region.prompt).toBe('replace with sky');
      expect(region.resultUrl).toBeNull();
    });
  });

  // =========================================================================
  // inpainting:complete event
  // =========================================================================

  describe('inpainting:complete', () => {
    it('completes processing and updates region', () => {
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      });
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:process',
        payload: { regionId: 'r1', prompt: 'grass' },
      });
      ctx.clearEvents();

      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:complete',
        payload: { regionId: 'r1', resultUrl: 'https://cdn.example.com/result.png', elapsedMs: 1200 },
      });

      const state = ctx.getState().aiInpainting as any;
      expect(state.isProcessing).toBe(false);
      expect(state.totalInpaints).toBe(1);
      expect(state.lastResultUrl).toBe('https://cdn.example.com/result.png');

      const region = state.regions.get('r1');
      expect(region.resultUrl).toBe('https://cdn.example.com/result.png');
      expect(region.appliedAt).toBeDefined();
    });

    it('emits inpainting:result', () => {
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'm' },
      });
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:process',
        payload: { regionId: 'r1' },
      });
      ctx.clearEvents();

      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:complete',
        payload: { regionId: 'r1', resultUrl: 'url', elapsedMs: 500 },
      });

      expect(getEventCount(ctx, 'inpainting:result')).toBe(1);
      const data = getLastEvent(ctx, 'inpainting:result') as any;
      expect(data.regionId).toBe('r1');
      expect(data.elapsedMs).toBe(500);
    });

    it('calculates rolling average process time', () => {
      // Two inpainting cycles
      for (let i = 0; i < 2; i++) {
        aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
          type: 'inpainting:set_mask',
          payload: { maskData: 'm' },
        });
        aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
          type: 'inpainting:process',
          payload: { regionId: `r${i}` },
        });
        aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
          type: 'inpainting:complete',
          payload: { regionId: `r${i}`, resultUrl: 'url', elapsedMs: i === 0 ? 1000 : 500 },
        });
      }

      const state = ctx.getState().aiInpainting as any;
      expect(state.avgProcessTimeMs).toBe(750); // (1000 + 500) / 2
    });
  });

  // =========================================================================
  // inpainting:clear_mask event
  // =========================================================================

  describe('inpainting:clear_mask', () => {
    it('clears mask and emits original_restored when preserve is true', () => {
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      });
      ctx.clearEvents();

      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:clear_mask',
      });

      const state = ctx.getState().aiInpainting as any;
      expect(state.activeMask).toBeNull();
      expect(getEventCount(ctx, 'inpainting:original_restored')).toBe(1);
    });

    it('does not emit original_restored when preserve is false', () => {
      const noPreserve: AiInpaintingConfig = { ...defaultConfig, preserve_original_on_mask_clear: false };

      aiInpaintingHandler.onEvent!(node as any, noPreserve, ctx as any, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      });
      ctx.clearEvents();

      aiInpaintingHandler.onEvent!(node as any, noPreserve, ctx as any, {
        type: 'inpainting:clear_mask',
      });

      expect(getEventCount(ctx, 'inpainting:original_restored')).toBe(0);
    });
  });

  // =========================================================================
  // inpainting:error event
  // =========================================================================

  describe('inpainting:error', () => {
    it('stops processing and emits error', () => {
      const state = ctx.getState().aiInpainting as any;
      state.isProcessing = true;

      ctx.clearEvents();
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'inpainting:error',
        payload: { message: 'GPU out of memory' },
      });

      expect(state.isProcessing).toBe(false);
      expect(getEventCount(ctx, 'inpainting:error')).toBe(1);
      const data = getLastEvent(ctx, 'inpainting:error') as any;
      expect(data.message).toBe('GPU out of memory');
    });
  });

  // =========================================================================
  // No state guard
  // =========================================================================

  describe('no state guard', () => {
    it('onEvent does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      aiInpaintingHandler.onEvent!(node as any, defaultConfig, freshCtx as any, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'test' },
      });
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });
  });
});
