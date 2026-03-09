/**
 * DiffusionRealtimeTrait Production Tests
 *
 * Real-time diffusion streaming: start/stop, frame delivery, FPS calculation,
 * dropped frames, latency, dynamic prompt, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diffusionRealtimeHandler } from '../DiffusionRealtimeTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'dr-node') {
  return { id } as any;
}

function makeConfig(overrides: any = {}) {
  return { ...diffusionRealtimeHandler.defaultConfig, ...overrides };
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
  return ctx.getState().diffusionRealtime;
}

// =============================================================================
// TESTS
// =============================================================================

describe('DiffusionRealtimeTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    diffusionRealtimeHandler.onAttach(node, config, ctx);
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes idle state', () => {
      const s = getState(ctx);
      expect(s.isStreaming).toBe(false);
      expect(s.currentFps).toBe(0);
      expect(s.frameCount).toBe(0);
      expect(s.droppedFrames).toBe(0);
      expect(s.lastFrameUrl).toBeNull();
    });

    it('emits ready with backend and fps', () => {
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:ready', {
        backend: 'lcm',
        target_fps: 15,
      });
    });

    it('has correct defaults', () => {
      const d = diffusionRealtimeHandler.defaultConfig;
      expect(d.backend).toBe('lcm');
      expect(d.stream_mode).toBe('img2img');
      expect(d.steps).toBe(4);
      expect(d.width).toBe(512);
    });

    it('handler name is diffusion_realtime', () => {
      expect(diffusionRealtimeHandler.name).toBe('diffusion_realtime');
    });
  });

  // ======== STREAM LIFECYCLE ========

  describe('stream lifecycle', () => {
    it('starts stream', () => {
      const cfg = makeConfig({ prompt: 'cyberpunk city' });
      ctx.emit.mockClear();

      diffusionRealtimeHandler.onEvent!(node, cfg, ctx, {
        type: 'diffusion_rt:start',
        payload: {},
      });

      const s = getState(ctx);
      expect(s.isStreaming).toBe(true);
      expect(s.frameCount).toBe(0);
      expect(s.streamStartTime).toBeGreaterThan(0);
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:started', {
        backend: 'lcm',
        prompt: 'cyberpunk city',
      });
    });

    it('stops stream with stats', () => {
      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:start',
        payload: {},
      });
      getState(ctx).frameCount = 150;
      getState(ctx).droppedFrames = 3;
      getState(ctx).currentFps = 14.5;
      ctx.emit.mockClear();

      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:stop',
        payload: {},
      });

      expect(getState(ctx).isStreaming).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:stopped', {
        frameCount: 150,
        droppedFrames: 3,
        avgFps: 14.5,
      });
    });
  });

  // ======== FRAME DELIVERY ========

  describe('frame delivery', () => {
    it('receives frame and updates state', () => {
      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:start',
        payload: {},
      });
      ctx.emit.mockClear();

      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:frame',
        payload: { frameUrl: 'blob:frame1', latencyMs: 33 },
      });

      const s = getState(ctx);
      expect(s.lastFrameUrl).toBe('blob:frame1');
      expect(s.frameCount).toBe(1);
      expect(s.latencyMs).toBe(33);
      expect(ctx.emit).toHaveBeenCalledWith(
        'diffusion_rt:frame_ready',
        expect.objectContaining({
          frameUrl: 'blob:frame1',
          frameCount: 1,
        })
      );
    });

    it('ignores frame when not streaming', () => {
      ctx.emit.mockClear();

      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:frame',
        payload: { frameUrl: 'blob:ignored' },
      });

      expect(getState(ctx).frameCount).toBe(0);
      expect(ctx.emit).not.toHaveBeenCalledWith('diffusion_rt:frame_ready', expect.anything());
    });

    it('tracks dropped frames', () => {
      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:start',
        payload: {},
      });

      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:frame_dropped',
        payload: {},
      });
      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:frame_dropped',
        payload: {},
      });

      expect(getState(ctx).droppedFrames).toBe(2);
    });
  });

  // ======== DYNAMIC PROMPT ========

  describe('dynamic prompt', () => {
    it('updates prompt during stream', () => {
      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:start',
        payload: {},
      });
      ctx.emit.mockClear();

      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:prompt_update',
        payload: { prompt: 'underwater ruins' },
      });

      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:prompt_updated', {
        prompt: 'underwater ruins',
      });
    });

    it('falls back to config prompt when none provided', () => {
      const cfg = makeConfig({ prompt: 'default_prompt' });
      ctx.emit.mockClear();

      diffusionRealtimeHandler.onEvent!(node, cfg, ctx, {
        type: 'diffusion_rt:prompt_update',
        payload: {},
      });

      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:prompt_updated', {
        prompt: 'default_prompt',
      });
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('stops stream on detach if active', () => {
      diffusionRealtimeHandler.onEvent!(node, config, ctx, {
        type: 'diffusion_rt:start',
        payload: {},
      });
      getState(ctx).frameCount = 42;
      ctx.emit.mockClear();

      diffusionRealtimeHandler.onDetach!(node, config, ctx);

      expect(getState(ctx).isStreaming).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:stopped', { frameCount: 42 });
    });

    it('no-op detach when idle', () => {
      ctx.emit.mockClear();
      diffusionRealtimeHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).not.toHaveBeenCalledWith('diffusion_rt:stopped', expect.anything());
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };
      diffusionRealtimeHandler.onEvent!(node, config, noCtx, {
        type: 'diffusion_rt:start',
        payload: {},
      });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
