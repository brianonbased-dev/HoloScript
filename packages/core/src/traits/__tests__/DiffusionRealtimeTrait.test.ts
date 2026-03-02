/**
 * DiffusionRealtimeTrait Tests
 *
 * Tests for real-time diffusion streaming trait covering initialization,
 * stream lifecycle, frame handling, FPS tracking, and prompt updates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { diffusionRealtimeHandler } from '../DiffusionRealtimeTrait';
import type { DiffusionRealtimeConfig } from '../DiffusionRealtimeTrait';
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

describe('DiffusionRealtimeTrait', () => {
  let node: Record<string, unknown>;
  let ctx: StatefulMockContext;
  const defaultConfig = diffusionRealtimeHandler.defaultConfig;

  beforeEach(() => {
    node = createMockNode('diffusion-node');
    ctx = createStatefulMockContext();
    diffusionRealtimeHandler.onAttach!(node as any, defaultConfig, ctx as any);
  });

  // =========================================================================
  // Default config
  // =========================================================================

  describe('default config', () => {
    it('uses lcm backend', () => {
      expect(defaultConfig.backend).toBe('lcm');
    });

    it('uses img2img stream mode', () => {
      expect(defaultConfig.stream_mode).toBe('img2img');
    });

    it('targets 15 FPS', () => {
      expect(defaultConfig.target_fps).toBe(15);
    });

    it('guidance scale defaults to 1.0', () => {
      expect(defaultConfig.guidance_scale).toBe(1.0);
    });

    it('noise strength defaults to 0.5', () => {
      expect(defaultConfig.noise_strength).toBe(0.5);
    });

    it('uses 4 inference steps', () => {
      expect(defaultConfig.steps).toBe(4);
    });

    it('dimensions default to 512x512', () => {
      expect(defaultConfig.width).toBe(512);
      expect(defaultConfig.height).toBe(512);
    });
  });

  // =========================================================================
  // onAttach
  // =========================================================================

  describe('onAttach', () => {
    it('initializes diffusionRealtime state', () => {
      const state = ctx.getState().diffusionRealtime as any;
      expect(state).toBeDefined();
      expect(state.isStreaming).toBe(false);
      expect(state.currentFps).toBe(0);
      expect(state.frameCount).toBe(0);
      expect(state.droppedFrames).toBe(0);
      expect(state.lastFrameUrl).toBeNull();
      expect(state.streamStartTime).toBeNull();
    });

    it('emits diffusion_rt:ready with backend and target fps', () => {
      expect(getEventCount(ctx, 'diffusion_rt:ready')).toBe(1);
      const data = getLastEvent(ctx, 'diffusion_rt:ready') as any;
      expect(data.backend).toBe('lcm');
      expect(data.target_fps).toBe(15);
    });
  });

  // =========================================================================
  // onDetach
  // =========================================================================

  describe('onDetach', () => {
    it('emits diffusion_rt:stopped when streaming', () => {
      const state = ctx.getState().diffusionRealtime as any;
      state.isStreaming = true;
      state.frameCount = 42;

      ctx.clearEvents();
      diffusionRealtimeHandler.onDetach!(node as any, defaultConfig, ctx as any);

      expect(state.isStreaming).toBe(false);
      expect(getEventCount(ctx, 'diffusion_rt:stopped')).toBe(1);
      const data = getLastEvent(ctx, 'diffusion_rt:stopped') as any;
      expect(data.frameCount).toBe(42);
    });

    it('does not emit when not streaming', () => {
      ctx.clearEvents();
      diffusionRealtimeHandler.onDetach!(node as any, defaultConfig, ctx as any);
      expect(getEventCount(ctx, 'diffusion_rt:stopped')).toBe(0);
    });
  });

  // =========================================================================
  // diffusion_rt:start event
  // =========================================================================

  describe('diffusion_rt:start', () => {
    it('starts streaming and resets counters', () => {
      ctx.clearEvents();
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:start',
      });

      const state = ctx.getState().diffusionRealtime as any;
      expect(state.isStreaming).toBe(true);
      expect(state.frameCount).toBe(0);
      expect(state.droppedFrames).toBe(0);
      expect(state.streamStartTime).toBeDefined();
    });

    it('emits diffusion_rt:started', () => {
      ctx.clearEvents();
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:start',
      });

      expect(getEventCount(ctx, 'diffusion_rt:started')).toBe(1);
      const data = getLastEvent(ctx, 'diffusion_rt:started') as any;
      expect(data.backend).toBe('lcm');
    });
  });

  // =========================================================================
  // diffusion_rt:stop event
  // =========================================================================

  describe('diffusion_rt:stop', () => {
    it('stops streaming and emits stats', () => {
      // Start first
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:start',
      });
      const state = ctx.getState().diffusionRealtime as any;
      state.frameCount = 100;
      state.droppedFrames = 5;
      ctx.clearEvents();

      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:stop',
      });

      expect(state.isStreaming).toBe(false);
      expect(getEventCount(ctx, 'diffusion_rt:stopped')).toBe(1);
      const data = getLastEvent(ctx, 'diffusion_rt:stopped') as any;
      expect(data.frameCount).toBe(100);
      expect(data.droppedFrames).toBe(5);
    });
  });

  // =========================================================================
  // diffusion_rt:frame event
  // =========================================================================

  describe('diffusion_rt:frame', () => {
    it('increments frame count and emits frame_ready', () => {
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:start',
      });
      ctx.clearEvents();

      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:frame',
        payload: { frameUrl: 'https://frame/1.png', latencyMs: 33 },
      });

      const state = ctx.getState().diffusionRealtime as any;
      expect(state.frameCount).toBe(1);
      expect(state.lastFrameUrl).toBe('https://frame/1.png');
      expect(state.latencyMs).toBe(33);
      expect(getEventCount(ctx, 'diffusion_rt:frame_ready')).toBe(1);
    });

    it('ignores frames when not streaming', () => {
      ctx.clearEvents();
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:frame',
        payload: { frameUrl: 'url' },
      });

      expect(getEventCount(ctx, 'diffusion_rt:frame_ready')).toBe(0);
    });

    it('calculates FPS based on elapsed time', () => {
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:start',
      });

      // Manually set start time to 2 seconds ago for predictable FPS
      const state = ctx.getState().diffusionRealtime as any;
      state.streamStartTime = Date.now() - 2000;

      // Simulate 30 frames
      for (let i = 0; i < 30; i++) {
        diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
          type: 'diffusion_rt:frame',
          payload: { frameUrl: `frame_${i}` },
        });
      }

      expect(state.frameCount).toBe(30);
      // FPS should be approximately 15 (30 frames / ~2 seconds)
      expect(state.currentFps).toBeGreaterThan(10);
      expect(state.currentFps).toBeLessThan(20);
    });
  });

  // =========================================================================
  // diffusion_rt:frame_dropped event
  // =========================================================================

  describe('diffusion_rt:frame_dropped', () => {
    it('increments dropped frame counter', () => {
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:start',
      });

      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:frame_dropped',
      });
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:frame_dropped',
      });

      const state = ctx.getState().diffusionRealtime as any;
      expect(state.droppedFrames).toBe(2);
    });
  });

  // =========================================================================
  // diffusion_rt:prompt_update event
  // =========================================================================

  describe('diffusion_rt:prompt_update', () => {
    it('emits prompt_updated with new prompt', () => {
      ctx.clearEvents();
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'diffusion_rt:prompt_update',
        payload: { prompt: 'neon city at night' },
      });

      expect(getEventCount(ctx, 'diffusion_rt:prompt_updated')).toBe(1);
      const data = getLastEvent(ctx, 'diffusion_rt:prompt_updated') as any;
      expect(data.prompt).toBe('neon city at night');
    });

    it('falls back to config prompt when not provided', () => {
      const customConfig: DiffusionRealtimeConfig = { ...defaultConfig, prompt: 'default scene' };
      ctx.clearEvents();

      diffusionRealtimeHandler.onEvent!(node as any, customConfig, ctx as any, {
        type: 'diffusion_rt:prompt_update',
        payload: {},
      });

      const data = getLastEvent(ctx, 'diffusion_rt:prompt_updated') as any;
      expect(data.prompt).toBe('default scene');
    });
  });

  // =========================================================================
  // No state guard
  // =========================================================================

  describe('no state guard', () => {
    it('onEvent does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      diffusionRealtimeHandler.onEvent!(node as any, defaultConfig, freshCtx as any, {
        type: 'diffusion_rt:start',
      });
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });
  });
});
