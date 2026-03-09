/**
 * ControlNet Trait (V43 Tier 2)
 *
 * ControlNet conditioning for guided diffusion generation in XR environments.
 * Extracts control maps (edges, depth, pose, normals) from scene geometry
 * and feeds them as conditioning signals to a diffusion pipeline.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type ControlNetModel =
  | 'canny'
  | 'depth'
  | 'pose'
  | 'normal'
  | 'hed'
  | 'seg'
  | 'scribble'
  | 'softedge'
  | 'lineart';

export interface ControlNetConfig {
  model_type: ControlNetModel;
  control_weight: number; // 0–2, strength of conditioning
  guidance_start: number; // 0–1, fraction of steps to start applying
  guidance_end: number; // 0–1, fraction of steps to stop applying
  preprocessor_resolution: number; // pixels for control map extraction
  invert_mask: boolean;
}

interface ControlNetState {
  isProcessing: boolean;
  lastControlMap: string | null; // base64 or URL
  processCount: number;
  lastPrompt: string | null;
  lastResult: string | null;
  avgProcessTimeMs: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const controlNetHandler: TraitHandler<ControlNetConfig> = {
  name: 'controlnet' as any,

  defaultConfig: {
    model_type: 'canny',
    control_weight: 1.0,
    guidance_start: 0.0,
    guidance_end: 1.0,
    preprocessor_resolution: 512,
    invert_mask: false,
  },

  onAttach(node, config, context) {
    const state: ControlNetState = {
      isProcessing: false,
      lastControlMap: null,
      processCount: 0,
      lastPrompt: null,
      lastResult: null,
      avgProcessTimeMs: 0,
    };
    context.setState({ controlNet: state });
    context.emit('controlnet:ready', {
      model: config.model_type,
      weight: config.control_weight,
    });
  },

  onDetach(node, config, context) {
    const state = context.getState().controlNet as ControlNetState | undefined;
    if (state?.isProcessing) {
      context.emit('controlnet:cancelled');
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().controlNet as ControlNetState | undefined;
    if (!state) return;

    if (event.type === 'controlnet:process') {
      const payload = event.payload as any;
      state.isProcessing = true;
      state.lastControlMap = payload?.controlMap ?? null;
      state.lastPrompt = payload?.prompt ?? null;
      context.emit('controlnet:started', {
        model: config.model_type,
        prompt: state.lastPrompt,
      });
    } else if (event.type === 'controlnet:complete') {
      const payload = event.payload as any;
      state.isProcessing = false;
      state.lastResult = payload?.result ?? null;
      state.processCount += 1;

      const elapsed: number = payload?.elapsedMs ?? 0;
      state.avgProcessTimeMs =
        state.processCount > 1
          ? (state.avgProcessTimeMs * (state.processCount - 1) + elapsed) / state.processCount
          : elapsed;

      context.emit('controlnet:result', {
        result: state.lastResult,
        model: config.model_type,
        elapsedMs: elapsed,
      });
    } else if (event.type === 'controlnet:error') {
      state.isProcessing = false;
      context.emit('controlnet:error', {
        message: (event.payload as any)?.message ?? 'Unknown error',
      });
    } else if (event.type === 'controlnet:extract_map') {
      // Trigger control map extraction from current scene
      context.emit('controlnet:map_requested', {
        type: config.model_type,
        resolution: config.preprocessor_resolution,
      });
    }
  },
};
