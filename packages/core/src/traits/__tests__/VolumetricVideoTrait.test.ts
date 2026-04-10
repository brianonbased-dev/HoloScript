/**
 * VolumetricVideoTrait Tests
 *
 * Tests for 4DGS / volumetric video playback
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { volumetricVideoHandler } from '../VolumetricVideoTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('VolumetricVideoTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('video-node');
    ctx = createMockContext();
  });

  describe('initialization', () => {
    it('should have correct default config', () => {
      expect(volumetricVideoHandler.defaultConfig.format).toBe('4dgs');
      expect(volumetricVideoHandler.defaultConfig.loop).toBe(false);
      expect(volumetricVideoHandler.defaultConfig.playback_rate).toBe(1.0);
      expect(volumetricVideoHandler.defaultConfig.buffer_size).toBe(30);
    });

    it('should attach and initialize state', () => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
        },
        ctx
      );

      const state = (node as any).__volumetricVideoState;
      expect(state).toBeDefined();
      expect(state.isLoaded).toBe(false);
      expect(state.playbackState).toBe('stopped');
      expect(state.currentTime).toBe(0);
      expect(state.currentFrame).toBe(0);
    });

    it('should emit volumetric_init on attach with source', () => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
        },
        ctx
      );

      expect(getEventCount(ctx, 'volumetric_init')).toBe(1);
      const initEvent = getLastEvent(ctx, 'volumetric_init');
      expect(initEvent.source).toBe('video.4dgs');
    });
  });

  describe('loading', () => {
    beforeEach(() => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
        },
        ctx
      );
      ctx.clearEvents();
    });

    it('should handle volumetric_loaded event', () => {
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_loaded',
        totalFrames: 900,
        fps: 30,
      });

      const state = (node as any).__volumetricVideoState;
      expect(state.isLoaded).toBe(true);
      expect(state.totalFrames).toBe(900);
      expect(state.duration).toBe(30); // 900 frames / 30 fps
      expect(getEventCount(ctx, 'on_volume_loaded')).toBe(1);
    });

    it('should handle volumetric_error event', () => {
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_error',
        error: 'File not found',
      });

      const state = (node as any).__volumetricVideoState;
      expect(state.playbackState).toBe('error');
      expect(getEventCount(ctx, 'on_volume_error')).toBe(1);
    });
  });

  describe('playback', () => {
    beforeEach(() => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
        },
        ctx
      );
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_loaded',
        totalFrames: 900,
        fps: 30,
      });
      ctx.clearEvents();
    });

    it('should start playback on volumetric_play', () => {
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_play',
      });

      const state = (node as any).__volumetricVideoState;
      expect(state.playbackState).toBe('playing');
      expect(getEventCount(ctx, 'on_volume_play')).toBe(1);
    });

    it('should pause playback on volumetric_pause', () => {
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_play',
      });
      ctx.clearEvents();

      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_pause',
      });

      const state = (node as any).__volumetricVideoState;
      expect(state.playbackState).toBe('paused');
      expect(getEventCount(ctx, 'on_volume_pause')).toBe(1);
    });

    it('should stop and reset on volumetric_stop', () => {
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_play',
      });

      const state = (node as any).__volumetricVideoState;
      state.currentTime = 15.0;
      state.currentFrame = 450;
      ctx.clearEvents();

      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_stop',
      });

      expect(state.playbackState).toBe('stopped');
      expect(state.currentTime).toBe(0);
      expect(state.currentFrame).toBe(0);
      expect(getEventCount(ctx, 'on_volume_stop')).toBe(1);
    });
  });

  describe('seeking', () => {
    beforeEach(() => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
        },
        ctx
      );
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_loaded',
        totalFrames: 900,
        fps: 30,
      });
      ctx.clearEvents();
    });

    it('should seek to time', () => {
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_seek',
        time: 15.0,
      });

      const state = (node as any).__volumetricVideoState;
      expect(state.currentTime).toBe(15.0);
      expect(state.currentFrame).toBe(450); // 15 * 30 fps
      expect(getEventCount(ctx, 'on_volume_seek')).toBe(1);
    });

    it('should clamp seek to duration', () => {
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_seek',
        time: 100.0, // Beyond 30s duration
      });

      const state = (node as any).__volumetricVideoState;
      expect(state.currentTime).toBeLessThanOrEqual(30);
    });

    it('should invalidate buffer on seek', () => {
      const state = (node as any).__volumetricVideoState;
      state.bufferedFrames = 60;

      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_seek',
        time: 15.0,
      });

      expect(state.bufferedFrames).toBe(0);
    });
  });

  describe('looping', () => {
    beforeEach(() => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
          loop: true,
          buffer_size: 30,
        },
        ctx
      );
      sendEvent(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', loop: true, buffer_size: 30 },
        ctx,
        {
          type: 'volumetric_loaded',
          totalFrames: 300,
          fps: 30,
        }
      );
      sendEvent(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', loop: true, buffer_size: 30 },
        ctx,
        {
          type: 'volumetric_play',
        }
      );
      ctx.clearEvents();
    });

    it('should loop when reaching end', () => {
      const state = (node as any).__volumetricVideoState;
      state.currentTime = 9.9;
      state.currentFrame = 297;
      // Ensure enough frames are buffered
      state.bufferedFrames = 100;

      // Advance past end
      updateTrait(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', loop: true, buffer_size: 30 },
        ctx,
        100
      );

      expect(state.currentTime).toBeLessThan(10);
      expect(getEventCount(ctx, 'on_volume_loop')).toBe(1);
    });
  });

  describe('completion', () => {
    beforeEach(() => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
          loop: false,
          buffer_size: 30,
        },
        ctx
      );
      sendEvent(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', loop: false, buffer_size: 30 },
        ctx,
        {
          type: 'volumetric_loaded',
          totalFrames: 300,
          fps: 30,
        }
      );
      sendEvent(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', loop: false, buffer_size: 30 },
        ctx,
        {
          type: 'volumetric_play',
        }
      );
      ctx.clearEvents();
    });

    it('should stop and emit complete when not looping', () => {
      const state = (node as any).__volumetricVideoState;
      state.currentTime = 9.9;
      state.currentFrame = 297;
      // Ensure enough frames are buffered to prevent buffering state
      state.bufferedFrames = 100;

      // Advance past end
      updateTrait(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', loop: false, buffer_size: 30 },
        ctx,
        100
      );

      expect(state.playbackState).toBe('stopped');
      expect(getEventCount(ctx, 'on_volume_complete')).toBe(1);
    });
  });

  describe('update loop', () => {
    beforeEach(() => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
          playback_rate: 1.0,
        },
        ctx
      );
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_loaded',
        totalFrames: 900,
        fps: 30,
      });
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_play',
      });
      ctx.clearEvents();
    });

    it('should advance time on update', () => {
      const state = (node as any).__volumetricVideoState;
      const initialTime = state.currentTime;

      updateTrait(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', playback_rate: 1.0 },
        ctx,
        100
      );

      expect(state.currentTime).toBeGreaterThan(initialTime);
    });

    it('should emit render frame event', () => {
      updateTrait(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', playback_rate: 1.0 },
        ctx,
        33
      );

      expect(getEventCount(ctx, 'volumetric_render_frame')).toBe(1);
    });

    it('should emit frame event with progress', () => {
      updateTrait(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', playback_rate: 1.0 },
        ctx,
        33
      );

      expect(getEventCount(ctx, 'on_volume_frame')).toBe(1);
      const frameEvent = getLastEvent(ctx, 'on_volume_frame');
      expect(frameEvent.progress).toBeDefined();
    });
  });

  describe('spatial audio', () => {
    it('should sync spatial audio on play', () => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
          spatial_audio: true,
          audio_source: 'audio.mp3',
        },
        ctx
      );
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_loaded',
        totalFrames: 900,
        fps: 30,
      });
      ctx.clearEvents();

      sendEvent(
        volumetricVideoHandler,
        node,
        { source: 'video.4dgs', spatial_audio: true, audio_source: 'audio.mp3' },
        ctx,
        {
          type: 'volumetric_play',
        }
      );

      expect(getEventCount(ctx, 'volumetric_sync_audio')).toBe(1);
    });

    it('should pause audio on pause', () => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
          spatial_audio: true,
        },
        ctx
      );
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_loaded',
        totalFrames: 900,
        fps: 30,
      });
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs', spatial_audio: true }, ctx, {
        type: 'volumetric_play',
      });
      ctx.clearEvents();

      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs', spatial_audio: true }, ctx, {
        type: 'volumetric_pause',
      });

      expect(getEventCount(ctx, 'volumetric_pause_audio')).toBe(1);
    });
  });

  describe('buffering', () => {
    beforeEach(() => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
          buffer_size: 30,
        },
        ctx
      );
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs', buffer_size: 30 }, ctx, {
        type: 'volumetric_loaded',
        totalFrames: 900,
        fps: 30,
      });
      ctx.clearEvents();
    });

    it('should update buffered frames', () => {
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs', buffer_size: 30 }, ctx, {
        type: 'volumetric_buffered',
        count: 60,
      });

      const state = (node as any).__volumetricVideoState;
      expect(state.bufferedFrames).toBe(60);
    });

    it('should resume from buffering when enough buffered', () => {
      const state = (node as any).__volumetricVideoState;
      state.playbackState = 'buffering';

      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs', buffer_size: 30 }, ctx, {
        type: 'volumetric_buffered',
        count: 20, // >= buffer_size / 2
      });

      expect(state.playbackState).toBe('playing');
    });
  });

  describe('cleanup', () => {
    it('should clean up on detach', () => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
        },
        ctx
      );
      ctx.clearEvents();

      volumetricVideoHandler.onDetach?.(node, volumetricVideoHandler.defaultConfig, ctx);

      expect((node as any).__volumetricVideoState).toBeUndefined();
      expect(getEventCount(ctx, 'volumetric_unload')).toBe(1);
    });

    it('should stop playback on detach if playing', () => {
      attachTrait(
        volumetricVideoHandler,
        node,
        {
          source: 'video.4dgs',
        },
        ctx
      );
      sendEvent(volumetricVideoHandler, node, { source: 'video.4dgs' }, ctx, {
        type: 'volumetric_loaded',
        totalFrames: 900,
        fps: 30,
      });

      const state = (node as any).__volumetricVideoState;
      state.playbackState = 'playing';
      ctx.clearEvents();

      volumetricVideoHandler.onDetach?.(node, volumetricVideoHandler.defaultConfig, ctx);

      expect(getEventCount(ctx, 'volumetric_stop')).toBe(1);
    });
  });
});
