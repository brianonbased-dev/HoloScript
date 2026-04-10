/**
 * Diffusion Realtime Trait (V43 Tier 2)
 *
 * Real-time diffusion streaming for live AR/VR scene stylisation.
 * Uses latent consistency models (LCM) or StreamDiffusion to generate
 * frames at interactive rates (10–30fps) with minimal latency.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type DiffusionBackend = 'lcm' | 'stream_diffusion' | 'turbo' | 'lightning';
export type StreamMode = 'img2img' | 'txt2img' | 'inpaint_stream';

export interface DiffusionRealtimeConfig {
  backend: DiffusionBackend;
  stream_mode: StreamMode;
  target_fps: number;
  guidance_scale: number;
  noise_strength: number; // 0–1, how much to denoise each frame
  steps: number; // inference steps per frame (2–4 for LCM)
  width: number;
  height: number;
  prompt: string;
  negative_prompt: string;
}

interface DiffusionRealtimeState {
  isStreaming: boolean;
  currentFps: number;
  frameCount: number;
  droppedFrames: number;
  latencyMs: number;
  lastFrameUrl: string | null;
  streamStartTime: number | null;
}

// =============================================================================
// HANDLER
// =============================================================================

export const diffusionRealtimeHandler: TraitHandler<DiffusionRealtimeConfig> = {
  name: 'diffusion_realtime',

  defaultConfig: {
    backend: 'lcm',
    stream_mode: 'img2img',
    target_fps: 15,
    guidance_scale: 1.0,
    noise_strength: 0.5,
    steps: 4,
    width: 512,
    height: 512,
    prompt: '',
    negative_prompt: '',
  },

  onAttach(node, config, context) {
    const state: DiffusionRealtimeState = {
      isStreaming: false,
      currentFps: 0,
      frameCount: 0,
      droppedFrames: 0,
      latencyMs: 0,
      lastFrameUrl: null,
      streamStartTime: null,
    };
    context.setState({ diffusionRealtime: state });
    context.emit('diffusion_rt:ready', {
      backend: config.backend,
      target_fps: config.target_fps,
    });
  },

  onDetach(node, config, context) {
    const state = context.getState().diffusionRealtime as DiffusionRealtimeState | undefined;
    if (state?.isStreaming) {
      state.isStreaming = false;
      context.emit('diffusion_rt:stopped', { frameCount: state.frameCount });
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().diffusionRealtime as DiffusionRealtimeState | undefined;
    if (!state) return;

    if (event.type === 'diffusion_rt:start') {
      state.isStreaming = true;
      state.frameCount = 0;
      state.droppedFrames = 0;
      state.streamStartTime = Date.now();
      context.emit('diffusion_rt:started', {
        backend: config.backend,
        prompt: config.prompt,
      });
    } else if (event.type === 'diffusion_rt:stop') {
      state.isStreaming = false;
      context.emit('diffusion_rt:stopped', {
        frameCount: state.frameCount,
        droppedFrames: state.droppedFrames,
        avgFps: state.currentFps,
      });
    } else if (event.type === 'diffusion_rt:frame') {
      if (!state.isStreaming) return;
      const payload = event.payload as { frameUrl?: string | null; latencyMs?: number } | undefined;
      state.lastFrameUrl = payload?.frameUrl ?? null;
      state.frameCount += 1;
      state.latencyMs = payload?.latencyMs ?? state.latencyMs;

      // Rolling FPS estimate
      if (state.streamStartTime) {
        const elapsed = (Date.now() - state.streamStartTime) / 1000;
        state.currentFps = elapsed > 0 ? state.frameCount / elapsed : 0;
      }

      context.emit('diffusion_rt:frame_ready', {
        frameUrl: state.lastFrameUrl,
        frameCount: state.frameCount,
        fps: Math.round(state.currentFps * 10) / 10,
        latencyMs: state.latencyMs,
      });
    } else if (event.type === 'diffusion_rt:frame_dropped') {
      state.droppedFrames += 1;
    } else if (event.type === 'diffusion_rt:prompt_update') {
      // Dynamic prompt steering during stream
      context.emit('diffusion_rt:prompt_updated', {
        prompt: (event.payload as { prompt?: string } | undefined)?.prompt ?? config.prompt,
      });
    }
  },
};
