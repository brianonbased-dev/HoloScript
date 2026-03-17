/**
 * StableDiffusion Trait
 *
 * AI-powered texture and image generation using Stable Diffusion models.
 * Supports SDXL, SD1.5, SD2.1, LCM, and real-time diffusion.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type DiffusionModel = 'sdxl' | 'sd15' | 'sd21' | 'playground_v2' | 'lcm';
export type ControlMode = 'canny' | 'depth' | 'pose' | 'scribble' | 'normal';

export interface StableDiffusionConfig {
  diffusion_model: DiffusionModel;
  prompt: string;
  negative_prompt: string;
  resolution: number;
  steps: number;
  cfg_scale: number;
  seed?: number;
  // ControlNet support
  control_mode?: ControlMode;
  control_strength?: number;
  control_image?: string;
  // Real-time diffusion
  realtime?: boolean;
  streaming?: boolean;
  // Inpainting
  inpaint_mask?: string;
  inpaint_strength?: number;
  // Upscaling
  upscale_factor?: number;
  upscale_model?: 'esrgan' | 'realesrgan' | 'swinir';
}

interface DiffusionState {
  is_generating: boolean;
  current_step: number;
  output_texture: string | null;
  generation_time: number;
  last_prompt: string;
  texture_cache: Map<string, { texture: string; timestamp: number }>;
}

// =============================================================================
// HANDLER
// =============================================================================

export const stableDiffusionHandler: TraitHandler<StableDiffusionConfig> = {
  name: 'stable_diffusion',

  defaultConfig: {
    diffusion_model: 'sdxl',
    prompt: '',
    negative_prompt: 'blurry, low quality, artifacts',
    resolution: 1024,
    steps: 30,
    cfg_scale: 7.5,
    seed: undefined,
    control_mode: undefined,
    control_strength: 1.0,
    control_image: undefined,
    realtime: false,
    streaming: false,
    inpaint_mask: undefined,
    inpaint_strength: 0.75,
    upscale_factor: 2,
    upscale_model: 'esrgan',
  },

  onAttach(node, config, context) {
    const state: DiffusionState = {
      is_generating: false,
      current_step: 0,
      output_texture: null,
      generation_time: 0,
      last_prompt: config.prompt,
      texture_cache: new Map(),
    };
    node.__stableDiffusionState = state;

    context.emit?.('stable_diffusion_init', {
      node,
      model: config.diffusion_model,
      resolution: config.resolution,
    });

    // Auto-generate if prompt provided
    if (config.prompt && config.prompt.length > 0) {
      context.emit?.('stable_diffusion_generate', {
        node,
        prompt: config.prompt,
        negativePrompt: config.negative_prompt,
        steps: config.steps,
        cfgScale: config.cfg_scale,
        seed: config.seed,
      });
      state.is_generating = true;
    }
  },

  onDetach(node, config, context) {
    const state = node.__stableDiffusionState as DiffusionState;

    if (state?.is_generating) {
      context.emit?.('stable_diffusion_cancel', { node });
    }

    // Clear texture cache
    state?.texture_cache.clear();

    delete node.__stableDiffusionState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__stableDiffusionState as DiffusionState;
    if (!state) return;

    // Real-time diffusion mode
    if (config.realtime && state.is_generating) {
      // Update generation time
      state.generation_time += delta;

      // Emit progress events for streaming
      if (config.streaming && state.current_step < config.steps) {
        context.emit?.('stable_diffusion_progress', {
          node,
          step: state.current_step,
          totalSteps: config.steps,
          progress: state.current_step / config.steps,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__stableDiffusionState as DiffusionState;
    if (!state) return;

    if (event.type === 'stable_diffusion_result') {
      state.is_generating = false;
      state.output_texture = event.texture as string;
      state.current_step = config.steps;

      // Cache the result
      const cacheKey = `${config.prompt}_${config.seed || 'random'}`;
      state.texture_cache.set(cacheKey, {
        texture: state.output_texture,
        timestamp: Date.now(),
      });

      context.emit?.('on_texture_generated', {
        node,
        texture: state.output_texture,
        prompt: config.prompt,
        generationTime: state.generation_time,
      });
    } else if (event.type === 'stable_diffusion_step') {
      state.current_step = event.step as number;
    } else if (event.type === 'stable_diffusion_error') {
      state.is_generating = false;
      context.emit?.('on_generation_error', {
        node,
        error: event.error,
      });
    }
  },
};

// =============================================================================
// ALIAS HANDLERS
// =============================================================================

/**
 * AI Texture Gen - Alias to stable_diffusion
 */
export const aiTextureGenHandler: TraitHandler<StableDiffusionConfig> = {
  ...stableDiffusionHandler,
  name: 'ai_texture_gen',
};

/**
 * Diffusion Realtime - Stable diffusion with streaming enabled
 */
export const diffusionRealtimeHandler: TraitHandler<StableDiffusionConfig> = {
  ...stableDiffusionHandler,
  name: 'diffusion_realtime',
  defaultConfig: {
    ...stableDiffusionHandler.defaultConfig,
    realtime: true,
    streaming: true,
    steps: 15, // Fewer steps for real-time
  },
};

/**
 * AI Inpainting - Stable diffusion with inpainting
 */
export const aiInpaintingHandler: TraitHandler<StableDiffusionConfig> = {
  ...stableDiffusionHandler,
  name: 'ai_inpainting',
  defaultConfig: {
    ...stableDiffusionHandler.defaultConfig,
    inpaint_strength: 0.75,
  },
};

/**
 * ControlNet - Stable diffusion with ControlNet conditioning
 */
export const controlnetHandler: TraitHandler<StableDiffusionConfig> = {
  ...stableDiffusionHandler,
  name: 'controlnet',
  defaultConfig: {
    ...stableDiffusionHandler.defaultConfig,
    control_mode: 'canny',
    control_strength: 1.0,
  },
};
