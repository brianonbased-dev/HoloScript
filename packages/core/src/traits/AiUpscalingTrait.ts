/**
 * AiUpscaling Trait
 *
 * AI-powered texture and render upscaling using super-resolution models.
 * Supports ESRGAN, Real-ESRGAN, SwinIR, and latent diffusion upscaling.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type UpscaleModel = 'esrgan' | 'realesrgan' | 'swinir' | 'real_esrgan_x4' | 'ldm';

export interface AiUpscalingConfig {
  /** Super-resolution model to use */
  upscale_model: UpscaleModel;
  /** Output resolution multiplier (2×, 3×, 4×) */
  scale_factor: 2 | 3 | 4;
  /** Tile size for tiled inference (manages VRAM; 0 = no tiling) */
  tile_size: number;
  /** Post-process denoising strength (0.0–1.0) */
  denoise_strength: number;
  /** Source to upscale: live render, static texture, or render target */
  input_source: 'live' | 'texture' | 'rendertarget';
  /** Explicit output resolution in pixels (overrides scale_factor when set) */
  output_resolution?: number;
  /** Bias toward edge/face detail preservation */
  preserve_details: boolean;
  /** Auto-apply the upscaled result to the node's material */
  apply_to_material: boolean;
}

interface UpscalingState {
  is_processing: boolean;
  output_texture: string | null;
  processing_time: number;
  last_upscale: number;
  cache: Map<string, { texture: string; timestamp: number }>;
}

// =============================================================================
// HANDLER
// =============================================================================

export const aiUpscalingHandler: TraitHandler<AiUpscalingConfig> = {
  name: 'ai_upscaling',

  defaultConfig: {
    upscale_model: 'realesrgan',
    scale_factor: 4,
    tile_size: 512,
    denoise_strength: 0.5,
    input_source: 'texture',
    output_resolution: undefined,
    preserve_details: true,
    apply_to_material: true,
  },

  onAttach(node, config, context) {
    const state: UpscalingState = {
      is_processing: false,
      output_texture: null,
      processing_time: 0,
      last_upscale: 0,
      cache: new Map(),
    };
    node.__aiUpscalingState = state;

    context.emit?.('ai_upscaling_init', {
      node,
      model: config.upscale_model,
      scaleFactor: config.scale_factor,
      tileSize: config.tile_size,
    });

    // Kick off immediately for static texture sources
    if (config.input_source === 'texture' || config.input_source === 'rendertarget') {
      context.emit?.('ai_upscaling_request', {
        node,
        model: config.upscale_model,
        scaleFactor: config.scale_factor,
        tileSize: config.tile_size,
        denoiseStrength: config.denoise_strength,
        preserveDetails: config.preserve_details,
        outputResolution: config.output_resolution,
      });
      state.is_processing = true;
    }
  },

  onDetach(node, _config, context) {
    const state = node.__aiUpscalingState as UpscalingState;

    if (state?.is_processing) {
      context.emit?.('ai_upscaling_cancel', { node });
    }

    state?.cache.clear();
    delete node.__aiUpscalingState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__aiUpscalingState as UpscalingState;
    if (!state || config.input_source !== 'live' || state.is_processing) return;

    // Live mode: re-upscale every 2 seconds
    state.last_upscale += delta * 1000;
    if (state.last_upscale < 2000) return;

    state.last_upscale = 0;
    state.is_processing = true;

    context.emit?.('ai_upscaling_request', {
      node,
      model: config.upscale_model,
      scaleFactor: config.scale_factor,
      tileSize: config.tile_size,
      denoiseStrength: config.denoise_strength,
      preserveDetails: config.preserve_details,
      outputResolution: config.output_resolution,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__aiUpscalingState as UpscalingState;
    if (!state) return;

    if (event.type === 'ai_upscaling_result') {
      const texture = event.texture as string;
      state.is_processing = false;
      state.output_texture = texture;
      state.processing_time = (event.processingTime as number) ?? 0;

      // Cache by model + scale key
      const cacheKey = `${config.upscale_model}_${config.scale_factor}x`;
      state.cache.set(cacheKey, { texture, timestamp: Date.now() });

      if (config.apply_to_material) {
        context.emit?.('material_set_texture', { node, texture });
      }

      context.emit?.('on_upscaling_complete', {
        node,
        texture,
        model: config.upscale_model,
        scaleFactor: config.scale_factor,
        processingTime: state.processing_time,
      });
    } else if (event.type === 'ai_upscaling_request') {
      // External trigger (e.g., from another trait)
      if (!state.is_processing) {
        state.is_processing = true;
        context.emit?.('ai_upscaling_request', {
          node,
          model: config.upscale_model,
          scaleFactor: config.scale_factor,
          tileSize: config.tile_size,
          denoiseStrength: config.denoise_strength,
          preserveDetails: config.preserve_details,
          outputResolution: config.output_resolution,
        });
      }
    } else if (event.type === 'ai_upscaling_error') {
      state.is_processing = false;
      context.emit?.('on_upscaling_error', {
        node,
        error: event.error,
        model: config.upscale_model,
      });
    }
  },
};

// =============================================================================
// ALIAS HANDLERS
// =============================================================================

/**
 * Neural Upscaling - Alias to ai_upscaling with SwinIR default
 * (consolidates the `neural_upscaling` trait name)
 */
export const neuralUpscalingHandler: TraitHandler<AiUpscalingConfig> = {
  ...aiUpscalingHandler,
  name: 'neural_upscaling',
  defaultConfig: {
    ...aiUpscalingHandler.defaultConfig,
    upscale_model: 'swinir',
    preserve_details: true,
  },
};
