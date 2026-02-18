/**
 * ControlNetTrait Production Tests
 *
 * Guided diffusion conditioning: process lifecycle, map extraction,
 * rolling average time, error handling, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { controlNetHandler } from '../ControlNetTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'cn-node') { return { id } as any; }

function makeConfig(overrides: any = {}) {
  return { ...controlNetHandler.defaultConfig, ...overrides };
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
  return ctx.getState().controlNet;
}

// =============================================================================
// TESTS
// =============================================================================

describe('ControlNetTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    controlNetHandler.onAttach(node, config, ctx);
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes idle state', () => {
      const s = getState(ctx);
      expect(s.isProcessing).toBe(false);
      expect(s.processCount).toBe(0);
      expect(s.lastControlMap).toBeNull();
      expect(s.lastPrompt).toBeNull();
      expect(s.lastResult).toBeNull();
      expect(s.avgProcessTimeMs).toBe(0);
    });

    it('emits controlnet:ready with model and weight', () => {
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:ready', {
        model: 'canny',
        weight: 1.0,
      });
    });

    it('has correct defaults', () => {
      const d = controlNetHandler.defaultConfig;
      expect(d.model_type).toBe('canny');
      expect(d.control_weight).toBe(1.0);
      expect(d.preprocessor_resolution).toBe(512);
    });

    it('handler name is controlnet', () => {
      expect(controlNetHandler.name).toBe('controlnet');
    });
  });

  // ======== PROCESS LIFECYCLE ========

  describe('process lifecycle', () => {
    it('starts processing with control map and prompt', () => {
      ctx.emit.mockClear();

      controlNetHandler.onEvent!(node, config, ctx, {
        type: 'controlnet:process',
        payload: { controlMap: 'data:image/png;base64,...', prompt: 'futuristic city' },
      });

      const s = getState(ctx);
      expect(s.isProcessing).toBe(true);
      expect(s.lastControlMap).toBe('data:image/png;base64,...');
      expect(s.lastPrompt).toBe('futuristic city');
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:started', {
        model: 'canny',
        prompt: 'futuristic city',
      });
    });

    it('completes processing with result', () => {
      controlNetHandler.onEvent!(node, config, ctx, {
        type: 'controlnet:process',
        payload: { prompt: 'test' },
      });
      ctx.emit.mockClear();

      controlNetHandler.onEvent!(node, config, ctx, {
        type: 'controlnet:complete',
        payload: { result: 'https://cdn.io/result.png', elapsedMs: 200 },
      });

      const s = getState(ctx);
      expect(s.isProcessing).toBe(false);
      expect(s.lastResult).toBe('https://cdn.io/result.png');
      expect(s.processCount).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:result', {
        result: 'https://cdn.io/result.png',
        model: 'canny',
        elapsedMs: 200,
      });
    });

    it('calculates rolling average time over multiple completions', () => {
      // Process 1: 100ms
      controlNetHandler.onEvent!(node, config, ctx, { type: 'controlnet:process', payload: {} });
      controlNetHandler.onEvent!(node, config, ctx, { type: 'controlnet:complete', payload: { elapsedMs: 100 } });

      // Process 2: 300ms → avg = 200
      controlNetHandler.onEvent!(node, config, ctx, { type: 'controlnet:process', payload: {} });
      controlNetHandler.onEvent!(node, config, ctx, { type: 'controlnet:complete', payload: { elapsedMs: 300 } });

      expect(getState(ctx).avgProcessTimeMs).toBe(200);
      expect(getState(ctx).processCount).toBe(2);
    });
  });

  // ======== ERROR HANDLING ========

  describe('error handling', () => {
    it('clears processing flag on error', () => {
      controlNetHandler.onEvent!(node, config, ctx, { type: 'controlnet:process', payload: {} });
      expect(getState(ctx).isProcessing).toBe(true);

      ctx.emit.mockClear();
      controlNetHandler.onEvent!(node, config, ctx, {
        type: 'controlnet:error',
        payload: { message: 'GPU OOM' },
      });

      expect(getState(ctx).isProcessing).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:error', { message: 'GPU OOM' });
    });

    it('uses default message when none provided', () => {
      controlNetHandler.onEvent!(node, config, ctx, { type: 'controlnet:process', payload: {} });
      ctx.emit.mockClear();
      controlNetHandler.onEvent!(node, config, ctx, { type: 'controlnet:error', payload: {} });

      expect(ctx.emit).toHaveBeenCalledWith('controlnet:error', { message: 'Unknown error' });
    });
  });

  // ======== EXTRACT MAP ========

  describe('extract map', () => {
    it('requests control map extraction with config', () => {
      const cfg = makeConfig({ model_type: 'depth', preprocessor_resolution: 1024 });
      ctx.emit.mockClear();

      controlNetHandler.onEvent!(node, cfg, ctx, {
        type: 'controlnet:extract_map',
        payload: {},
      });

      expect(ctx.emit).toHaveBeenCalledWith('controlnet:map_requested', {
        type: 'depth',
        resolution: 1024,
      });
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('emits cancelled when detaching during processing', () => {
      controlNetHandler.onEvent!(node, config, ctx, { type: 'controlnet:process', payload: {} });
      ctx.emit.mockClear();

      controlNetHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith('controlnet:cancelled');
    });

    it('does NOT emit cancelled when idle', () => {
      ctx.emit.mockClear();
      controlNetHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).not.toHaveBeenCalledWith('controlnet:cancelled');
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };
      controlNetHandler.onEvent!(node, config, noCtx, { type: 'controlnet:process', payload: {} });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
