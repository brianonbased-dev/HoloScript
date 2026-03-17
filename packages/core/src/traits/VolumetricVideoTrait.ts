/**
 * VolumetricVideo Trait
 *
 * 4D Gaussian Splatting / volumetric capture playback.
 * Supports streaming, seeking, and spatial audio sync.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type VolumetricFormat = '4dgs' | 'v3d' | 'draco' | 'ply_sequence';
type PlaybackState = 'stopped' | 'playing' | 'paused' | 'buffering' | 'error';

interface VolumetricVideoState {
  playbackState: PlaybackState;
  currentFrame: number;
  currentTime: number; // seconds
  totalFrames: number;
  duration: number; // seconds
  fps: number;
  bufferedFrames: number;
  isLoaded: boolean;
}

interface VolumetricVideoConfig {
  source: string;
  format: VolumetricFormat;
  loop: boolean;
  playback_rate: number;
  preload: boolean;
  buffer_size: number; // Frames to buffer ahead
  spatial_audio: boolean;
  audio_source: string;
  quality: 'low' | 'medium' | 'high' | 'auto';
  start_time: number;
  end_time: number; // 0 = play to end
}

// =============================================================================
// HANDLER
// =============================================================================

export const volumetricVideoHandler: TraitHandler<VolumetricVideoConfig> = {
  name: 'volumetric_video',

  defaultConfig: {
    source: '',
    format: '4dgs',
    loop: false,
    playback_rate: 1.0,
    preload: false,
    buffer_size: 30,
    spatial_audio: true,
    audio_source: '',
    quality: 'auto',
    start_time: 0,
    end_time: 0,
  },

  onAttach(node, config, context) {
    const state: VolumetricVideoState = {
      playbackState: 'stopped',
      currentFrame: 0,
      currentTime: 0,
      totalFrames: 0,
      duration: 0,
      fps: 30,
      bufferedFrames: 0,
      isLoaded: false,
    };
    node.__volumetricVideoState = state;

    if (config.source) {
      if (config.preload) {
        loadVolumetricVideo(node, state, config, context);
      } else {
        context.emit?.('volumetric_init', {
          node,
          source: config.source,
          format: config.format,
        });
      }
    }
  },

  onDetach(node, config, context) {
    const state = node.__volumetricVideoState as VolumetricVideoState;
    if (state?.playbackState === 'playing') {
      context.emit?.('volumetric_stop', { node });
    }
    context.emit?.('volumetric_unload', { node });
    delete node.__volumetricVideoState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__volumetricVideoState as VolumetricVideoState;
    if (!state || state.playbackState !== 'playing') return;

    // Advance playback
    const frameDelta = (delta / 1000) * state.fps * config.playback_rate;
    state.currentFrame += frameDelta;
    state.currentTime = state.currentFrame / state.fps;

    // Check end time
    const endTime = config.end_time > 0 ? config.end_time : state.duration;
    if (state.currentTime >= endTime) {
      if (config.loop) {
        state.currentFrame = config.start_time * state.fps;
        state.currentTime = config.start_time;
        context.emit?.('on_volume_loop', { node });
      } else {
        state.playbackState = 'stopped';
        state.currentFrame = state.totalFrames - 1;
        state.currentTime = state.duration;
        context.emit?.('on_volume_complete', { node });
      }
    }

    // Request frame render
    const frameIndex = Math.floor(state.currentFrame) % state.totalFrames;
    context.emit?.('volumetric_render_frame', {
      node,
      frame: frameIndex,
      time: state.currentTime,
    });

    context.emit?.('on_volume_frame', {
      node,
      frame: frameIndex,
      time: state.currentTime,
      progress: state.currentTime / state.duration,
    });

    // Check buffer state
    if (state.bufferedFrames < config.buffer_size) {
      state.playbackState = 'buffering';
      context.emit?.('volumetric_buffer_request', {
        node,
        startFrame: frameIndex + state.bufferedFrames,
        count: config.buffer_size - state.bufferedFrames,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__volumetricVideoState as VolumetricVideoState;
    if (!state) return;

    if (event.type === 'volumetric_play') {
      if (!state.isLoaded) {
        loadVolumetricVideo(node, state, config, context);
        return;
      }

      state.playbackState = 'playing';

      // Sync audio if configured
      if (config.spatial_audio && config.audio_source) {
        context.emit?.('volumetric_sync_audio', {
          node,
          audioSource: config.audio_source,
          time: state.currentTime,
          rate: config.playback_rate,
        });
      }

      context.emit?.('on_volume_play', {
        node,
        time: state.currentTime,
      });
    } else if (event.type === 'volumetric_pause') {
      state.playbackState = 'paused';

      if (config.spatial_audio) {
        context.emit?.('volumetric_pause_audio', { node });
      }

      context.emit?.('on_volume_pause', {
        node,
        time: state.currentTime,
      });
    } else if (event.type === 'volumetric_stop') {
      state.playbackState = 'stopped';
      state.currentFrame = config.start_time * state.fps;
      state.currentTime = config.start_time;

      if (config.spatial_audio) {
        context.emit?.('volumetric_stop_audio', { node });
      }

      context.emit?.('on_volume_stop', { node });
    } else if (event.type === 'volumetric_seek') {
      const time = event.time as number;
      state.currentTime = Math.max(config.start_time, Math.min(time, state.duration));
      state.currentFrame = state.currentTime * state.fps;

      // Invalidate buffer
      state.bufferedFrames = 0;

      if (config.spatial_audio) {
        context.emit?.('volumetric_seek_audio', {
          node,
          time: state.currentTime,
        });
      }

      context.emit?.('on_volume_seek', {
        node,
        time: state.currentTime,
      });
    } else if (event.type === 'volumetric_set_rate') {
      const rate = event.rate as number;

      if (config.spatial_audio) {
        context.emit?.('volumetric_set_audio_rate', {
          node,
          rate,
        });
      }
    } else if (event.type === 'volumetric_loaded') {
      state.isLoaded = true;
      state.totalFrames = event.totalFrames as number;
      state.fps = (event.fps as number) || 30;
      state.duration = state.totalFrames / state.fps;
      state.currentFrame = config.start_time * state.fps;
      state.currentTime = config.start_time;

      context.emit?.('on_volume_loaded', {
        node,
        duration: state.duration,
        totalFrames: state.totalFrames,
        fps: state.fps,
      });
    } else if (event.type === 'volumetric_buffered') {
      state.bufferedFrames = event.count as number;

      if (state.playbackState === 'buffering' && state.bufferedFrames >= config.buffer_size / 2) {
        state.playbackState = 'playing';
      }
    } else if (event.type === 'volumetric_error') {
      state.playbackState = 'error';

      context.emit?.('on_volume_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'volumetric_query') {
      context.emit?.('volumetric_info', {
        queryId: event.queryId,
        node,
        playbackState: state.playbackState,
        currentTime: state.currentTime,
        duration: state.duration,
        currentFrame: Math.floor(state.currentFrame),
        totalFrames: state.totalFrames,
        fps: state.fps,
        isLoaded: state.isLoaded,
        bufferedFrames: state.bufferedFrames,
        format: config.format,
      });
    }
  },
};

function loadVolumetricVideo(
  node: unknown,
  state: VolumetricVideoState,
  config: VolumetricVideoConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  context.emit?.('volumetric_load', {
    node,
    source: config.source,
    format: config.format,
    quality: config.quality,
    bufferSize: config.buffer_size,
  });
}

export default volumetricVideoHandler;
