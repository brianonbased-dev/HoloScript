/**
 * VolumetricWindowTrait Tests
 *
 * Tests the visionOS volumetric window handler: init, open/close lifecycle,
 * resize with resizable guard, scale clamping, immersion progress, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { volumetricWindowHandler } from '../VolumetricWindowTrait';
import type { VolumetricWindowConfig } from '../VolumetricWindowTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'vw-node') {
  return { id } as any;
}

function makeConfig(overrides: Partial<VolumetricWindowConfig> = {}) {
  return { ...volumetricWindowHandler.defaultConfig, ...overrides };
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
  return ctx.getState().volumetricWindow;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VolumetricWindowTrait', () => {
  let node: any;
  let config: VolumetricWindowConfig;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    volumetricWindowHandler.onAttach!(node, config, ctx as any);
  });

  describe('initialization', () => {
    it('initializes closed window state', () => {
      const s = getState(ctx);
      expect(s.isOpen).toBe(false);
      expect(s.currentWidth).toBe(0.6);
      expect(s.currentHeight).toBe(0.4);
      expect(s.currentDepth).toBe(0.3);
      expect(s.currentScale).toBe(1.0);
      expect(s.placement).toBeNull();
      expect(s.isImmersive).toBe(false);
      expect(s.immersionProgress).toBe(0);
    });

    it('emits vWindow:init with type and scale_mode', () => {
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:init', {
        type: 'bounded',
        scale_mode: 'tabletop',
      });
    });

    it('sets immersive state for immersive window type', () => {
      const c = makeContext();
      const cfg = makeConfig({ window_type: 'immersive' });
      volumetricWindowHandler.onAttach!(node, cfg, c as any);
      const s = getState(c);
      expect(s.isImmersive).toBe(true);
      expect(s.immersionProgress).toBe(1);
    });

    it('has correct default config values', () => {
      const d = volumetricWindowHandler.defaultConfig;
      expect(d.window_type).toBe('bounded');
      expect(d.scale_mode).toBe('tabletop');
      expect(d.immersion_style).toBe('mixed');
      expect(d.initial_width).toBe(0.6);
      expect(d.initial_height).toBe(0.4);
      expect(d.initial_depth).toBe(0.3);
      expect(d.resizable).toBe(true);
      expect(d.min_scale).toBe(0.1);
      expect(d.max_scale).toBe(10.0);
      expect(d.default_placement).toBe('front');
      expect(d.ornament_visibility).toBe(true);
    });
  });

  describe('open/close lifecycle', () => {
    it('vWindow:open sets isOpen and emits opened event', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, { type: 'vWindow:open' });
      expect(getState(ctx).isOpen).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:opened', { type: 'bounded' });
    });

    it('vWindow:open stores position from payload', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:open',
        payload: { position: [1, 2, 3] },
      });
      expect(getState(ctx).placement).toEqual([1, 2, 3]);
    });

    it('vWindow:close sets isOpen to false and emits closed', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, { type: 'vWindow:open' });
      ctx.emit.mockClear();
      volumetricWindowHandler.onEvent!(node, config, ctx as any, { type: 'vWindow:close' });
      expect(getState(ctx).isOpen).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:closed');
    });
  });

  describe('resize', () => {
    it('updates dimensions when resizable', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:resize',
        payload: { width: 1.0, height: 0.8, depth: 0.5 },
      });

      const s = getState(ctx);
      expect(s.currentWidth).toBe(1.0);
      expect(s.currentHeight).toBe(0.8);
      expect(s.currentDepth).toBe(0.5);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:resized', {
        width: 1.0,
        height: 0.8,
        depth: 0.5,
      });
    });

    it('ignores resize when not resizable', () => {
      const cfg = makeConfig({ resizable: false });
      const c = makeContext();
      volumetricWindowHandler.onAttach!(node, cfg, c as any);
      c.emit.mockClear();

      volumetricWindowHandler.onEvent!(node, cfg, c as any, {
        type: 'vWindow:resize',
        payload: { width: 2.0 },
      });

      expect(getState(c).currentWidth).toBe(0.6); // unchanged
      expect(c.emit).not.toHaveBeenCalledWith('vWindow:resized', expect.anything());
    });

    it('partially updates dimensions', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:resize',
        payload: { width: 0.9 },
      });

      const s = getState(ctx);
      expect(s.currentWidth).toBe(0.9);
      expect(s.currentHeight).toBe(0.4); // unchanged
    });
  });

  describe('scale', () => {
    it('updates scale within bounds', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:scale',
        payload: { scale: 5.0 },
      });
      expect(getState(ctx).currentScale).toBe(5.0);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:scaled', { scale: 5.0 });
    });

    it('clamps scale to min_scale', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:scale',
        payload: { scale: 0.01 },
      });
      expect(getState(ctx).currentScale).toBe(0.1); // min_scale
    });

    it('clamps scale to max_scale', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:scale',
        payload: { scale: 100 },
      });
      expect(getState(ctx).currentScale).toBe(10.0); // max_scale
    });
  });

  describe('immersion', () => {
    it('updates immersion progress and sets isImmersive at 1.0', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:immersion_change',
        payload: { progress: 0.5 },
      });
      expect(getState(ctx).immersionProgress).toBe(0.5);
      expect(getState(ctx).isImmersive).toBe(false);

      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:immersion_change',
        payload: { progress: 1.0 },
      });
      expect(getState(ctx).immersionProgress).toBe(1.0);
      expect(getState(ctx).isImmersive).toBe(true);
    });

    it('clamps immersion progress to 0-1 range', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:immersion_change',
        payload: { progress: -0.5 },
      });
      expect(getState(ctx).immersionProgress).toBe(0);

      volumetricWindowHandler.onEvent!(node, config, ctx as any, {
        type: 'vWindow:immersion_change',
        payload: { progress: 2.0 },
      });
      expect(getState(ctx).immersionProgress).toBe(1);
    });
  });

  describe('onDetach', () => {
    it('emits vWindow:closed if window is open', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx as any, { type: 'vWindow:open' });
      ctx.emit.mockClear();
      volumetricWindowHandler.onDetach!(node, config, ctx as any);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:closed');
    });

    it('does not emit vWindow:closed if window is already closed', () => {
      ctx.emit.mockClear();
      volumetricWindowHandler.onDetach!(node, config, ctx as any);
      expect(ctx.emit).not.toHaveBeenCalledWith('vWindow:closed');
    });
  });
});
