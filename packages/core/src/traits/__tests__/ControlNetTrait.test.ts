/**
 * ControlNetTrait Tests
 *
 * Tests for ControlNet conditioning trait covering initialization,
 * processing workflow, map extraction, error handling, and cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { controlNetHandler } from '../ControlNetTrait';
import type { ControlNetConfig } from '../ControlNetTrait';
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

describe('ControlNetTrait', () => {
  let node: Record<string, unknown>;
  let ctx: StatefulMockContext;
  const defaultConfig = controlNetHandler.defaultConfig;

  beforeEach(() => {
    node = createMockNode('controlnet-node');
    ctx = createStatefulMockContext();
    controlNetHandler.onAttach!(node as any, defaultConfig, ctx as any);
  });

  // =========================================================================
  // Default config
  // =========================================================================

  describe('default config', () => {
    it('uses canny model type', () => {
      expect(defaultConfig.model_type).toBe('canny');
    });

    it('control weight defaults to 1.0', () => {
      expect(defaultConfig.control_weight).toBe(1.0);
    });

    it('guidance range is 0.0 to 1.0', () => {
      expect(defaultConfig.guidance_start).toBe(0.0);
      expect(defaultConfig.guidance_end).toBe(1.0);
    });

    it('preprocessor resolution is 512', () => {
      expect(defaultConfig.preprocessor_resolution).toBe(512);
    });

    it('invert_mask defaults to false', () => {
      expect(defaultConfig.invert_mask).toBe(false);
    });
  });

  // =========================================================================
  // onAttach
  // =========================================================================

  describe('onAttach', () => {
    it('initializes controlNet state', () => {
      const state = ctx.getState().controlNet as any;
      expect(state).toBeDefined();
      expect(state.isProcessing).toBe(false);
      expect(state.lastControlMap).toBeNull();
      expect(state.processCount).toBe(0);
      expect(state.lastPrompt).toBeNull();
      expect(state.lastResult).toBeNull();
    });

    it('emits controlnet:ready with model and weight', () => {
      expect(getEventCount(ctx, 'controlnet:ready')).toBe(1);
      const data = getLastEvent(ctx, 'controlnet:ready') as any;
      expect(data.model).toBe('canny');
      expect(data.weight).toBe(1.0);
    });
  });

  // =========================================================================
  // onDetach
  // =========================================================================

  describe('onDetach', () => {
    it('emits controlnet:cancelled when processing', () => {
      const state = ctx.getState().controlNet as any;
      state.isProcessing = true;

      ctx.clearEvents();
      controlNetHandler.onDetach!(node as any, defaultConfig, ctx as any);

      expect(getEventCount(ctx, 'controlnet:cancelled')).toBe(1);
    });

    it('does not emit when idle', () => {
      ctx.clearEvents();
      controlNetHandler.onDetach!(node as any, defaultConfig, ctx as any);
      expect(getEventCount(ctx, 'controlnet:cancelled')).toBe(0);
    });
  });

  // =========================================================================
  // controlnet:process event
  // =========================================================================

  describe('controlnet:process', () => {
    it('starts processing and stores control map', () => {
      ctx.clearEvents();
      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:process',
        payload: { controlMap: 'base64_canny_map', prompt: 'cyberpunk city' },
      });

      const state = ctx.getState().controlNet as any;
      expect(state.isProcessing).toBe(true);
      expect(state.lastControlMap).toBe('base64_canny_map');
      expect(state.lastPrompt).toBe('cyberpunk city');
      expect(getEventCount(ctx, 'controlnet:started')).toBe(1);
    });

    it('emits started event with model and prompt', () => {
      ctx.clearEvents();
      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:process',
        payload: { prompt: 'forest path' },
      });

      const data = getLastEvent(ctx, 'controlnet:started') as any;
      expect(data.model).toBe('canny');
      expect(data.prompt).toBe('forest path');
    });
  });

  // =========================================================================
  // controlnet:complete event
  // =========================================================================

  describe('controlnet:complete', () => {
    it('completes processing and stores result', () => {
      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:process',
        payload: { prompt: 'test' },
      });
      ctx.clearEvents();

      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:complete',
        payload: { result: 'https://cdn.example.com/result.png', elapsedMs: 800 },
      });

      const state = ctx.getState().controlNet as any;
      expect(state.isProcessing).toBe(false);
      expect(state.lastResult).toBe('https://cdn.example.com/result.png');
      expect(state.processCount).toBe(1);
    });

    it('emits controlnet:result', () => {
      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:process',
        payload: {},
      });
      ctx.clearEvents();

      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:complete',
        payload: { result: 'url', elapsedMs: 200 },
      });

      expect(getEventCount(ctx, 'controlnet:result')).toBe(1);
      const data = getLastEvent(ctx, 'controlnet:result') as any;
      expect(data.result).toBe('url');
      expect(data.model).toBe('canny');
      expect(data.elapsedMs).toBe(200);
    });

    it('calculates rolling average process time', () => {
      for (let i = 0; i < 2; i++) {
        controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
          type: 'controlnet:process',
          payload: {},
        });
        controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
          type: 'controlnet:complete',
          payload: { result: 'url', elapsedMs: i === 0 ? 400 : 200 },
        });
      }

      const state = ctx.getState().controlNet as any;
      expect(state.avgProcessTimeMs).toBe(300);
    });
  });

  // =========================================================================
  // controlnet:error event
  // =========================================================================

  describe('controlnet:error', () => {
    it('stops processing and emits error', () => {
      const state = ctx.getState().controlNet as any;
      state.isProcessing = true;

      ctx.clearEvents();
      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:error',
        payload: { message: 'Model not loaded' },
      });

      expect(state.isProcessing).toBe(false);
      expect(getEventCount(ctx, 'controlnet:error')).toBe(1);
      const data = getLastEvent(ctx, 'controlnet:error') as any;
      expect(data.message).toBe('Model not loaded');
    });

    it('uses default error message when none provided', () => {
      ctx.clearEvents();
      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:error',
        payload: {},
      });

      const data = getLastEvent(ctx, 'controlnet:error') as any;
      expect(data.message).toBe('Unknown error');
    });
  });

  // =========================================================================
  // controlnet:extract_map event
  // =========================================================================

  describe('controlnet:extract_map', () => {
    it('emits map_requested with model type and resolution', () => {
      ctx.clearEvents();
      controlNetHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'controlnet:extract_map',
      });

      expect(getEventCount(ctx, 'controlnet:map_requested')).toBe(1);
      const data = getLastEvent(ctx, 'controlnet:map_requested') as any;
      expect(data.type).toBe('canny');
      expect(data.resolution).toBe(512);
    });

    it('uses configured model type for extraction', () => {
      const depthConfig: ControlNetConfig = {
        ...defaultConfig,
        model_type: 'depth',
        preprocessor_resolution: 1024,
      };
      ctx.clearEvents();

      controlNetHandler.onEvent!(node as any, depthConfig, ctx as any, {
        type: 'controlnet:extract_map',
      });

      const data = getLastEvent(ctx, 'controlnet:map_requested') as any;
      expect(data.type).toBe('depth');
      expect(data.resolution).toBe(1024);
    });
  });

  // =========================================================================
  // No state guard
  // =========================================================================

  describe('no state guard', () => {
    it('onEvent does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      controlNetHandler.onEvent!(node as any, defaultConfig, freshCtx as any, {
        type: 'controlnet:process',
        payload: {},
      });
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });
  });
});
