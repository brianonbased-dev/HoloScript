/**
 * VolumetricWindowTrait Production Tests
 *
 * VisionOS volumetric window: open/close, resize (with resizable guard),
 * scale clamping, immersion progress, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { volumetricWindowHandler } from '../VolumetricWindowTrait';

function makeNode(id = 'vw-node') { return { id } as any; }
function makeConfig(o: any = {}) { return { ...volumetricWindowHandler.defaultConfig, ...o }; }
function makeContext() {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
  };
}
function getState(ctx: ReturnType<typeof makeContext>) { return ctx.getState().volumetricWindow; }

describe('VolumetricWindowTrait — Production', () => {
  let node: any, config: any, ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    volumetricWindowHandler.onAttach(node, config, ctx);
  });

  describe('construction', () => {
    it('initializes closed window state', () => {
      const s = getState(ctx);
      expect(s.isOpen).toBe(false);
      expect(s.currentWidth).toBe(0.6);
      expect(s.currentHeight).toBe(0.4);
      expect(s.currentDepth).toBe(0.3);
      expect(s.currentScale).toBe(1.0);
      expect(s.isImmersive).toBe(false);
    });

    it('sets immersive state for immersive window type', () => {
      const cfg = makeConfig({ window_type: 'immersive' });
      const c = makeContext();
      volumetricWindowHandler.onAttach(node, cfg, c);

      expect(getState(c).isImmersive).toBe(true);
      expect(getState(c).immersionProgress).toBe(1);
    });

    it('emits vWindow:init', () => {
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:init', { type: 'bounded', scale_mode: 'tabletop' });
    });

    it('has correct defaults', () => {
      const d = volumetricWindowHandler.defaultConfig;
      expect(d.resizable).toBe(true);
      expect(d.min_scale).toBe(0.1);
      expect(d.max_scale).toBe(10.0);
    });
  });

  describe('open/close', () => {
    it('opens window', () => {
      ctx.emit.mockClear();
      volumetricWindowHandler.onEvent!(node, config, ctx, {
        type: 'vWindow:open',
        payload: { position: [1, 2, 3] },
      });

      expect(getState(ctx).isOpen).toBe(true);
      expect(getState(ctx).placement).toEqual([1, 2, 3]);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:opened', { type: 'bounded' });
    });

    it('closes window', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx, { type: 'vWindow:open', payload: {} });
      ctx.emit.mockClear();

      volumetricWindowHandler.onEvent!(node, config, ctx, { type: 'vWindow:close' });

      expect(getState(ctx).isOpen).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:closed');
    });
  });

  describe('resize', () => {
    it('resizes when resizable', () => {
      ctx.emit.mockClear();
      volumetricWindowHandler.onEvent!(node, config, ctx, {
        type: 'vWindow:resize',
        payload: { width: 1.0, height: 0.8, depth: 0.5 },
      });

      const s = getState(ctx);
      expect(s.currentWidth).toBe(1.0);
      expect(s.currentHeight).toBe(0.8);
      expect(s.currentDepth).toBe(0.5);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:resized', { width: 1.0, height: 0.8, depth: 0.5 });
    });

    it('ignores resize when not resizable', () => {
      const cfg = makeConfig({ resizable: false });
      const c = makeContext();
      volumetricWindowHandler.onAttach(node, cfg, c);
      c.emit.mockClear();

      volumetricWindowHandler.onEvent!(node, cfg, c, {
        type: 'vWindow:resize',
        payload: { width: 2.0 },
      });

      expect(getState(c).currentWidth).toBe(0.6); // unchanged
      expect(c.emit).not.toHaveBeenCalledWith('vWindow:resized', expect.anything());
    });
  });

  describe('scale', () => {
    it('applies scale with clamping', () => {
      ctx.emit.mockClear();
      volumetricWindowHandler.onEvent!(node, config, ctx, {
        type: 'vWindow:scale',
        payload: { scale: 5.0 },
      });

      expect(getState(ctx).currentScale).toBe(5.0);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:scaled', { scale: 5.0 });
    });

    it('clamps scale to min', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx, {
        type: 'vWindow:scale',
        payload: { scale: 0.001 },
      });
      expect(getState(ctx).currentScale).toBe(0.1); // min_scale
    });

    it('clamps scale to max', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx, {
        type: 'vWindow:scale',
        payload: { scale: 99 },
      });
      expect(getState(ctx).currentScale).toBe(10.0); // max_scale
    });
  });

  describe('immersion', () => {
    it('updates immersion progress', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx, {
        type: 'vWindow:immersion_change',
        payload: { progress: 0.75 },
      });

      expect(getState(ctx).immersionProgress).toBe(0.75);
      expect(getState(ctx).isImmersive).toBe(false);
    });

    it('sets isImmersive at full progress', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx, {
        type: 'vWindow:immersion_change',
        payload: { progress: 1.0 },
      });
      expect(getState(ctx).isImmersive).toBe(true);
    });
  });

  describe('detach', () => {
    it('emits closed when open', () => {
      volumetricWindowHandler.onEvent!(node, config, ctx, { type: 'vWindow:open', payload: {} });
      ctx.emit.mockClear();

      volumetricWindowHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('vWindow:closed');
    });

    it('no-op detach when closed', () => {
      ctx.emit.mockClear();
      volumetricWindowHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).not.toHaveBeenCalledWith('vWindow:closed');
    });
  });

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };
      volumetricWindowHandler.onEvent!(node, config, noCtx, { type: 'vWindow:open', payload: {} });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
