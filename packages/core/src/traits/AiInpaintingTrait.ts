/**
 * AI Inpainting Trait (V43 Tier 2)
 *
 * AI-powered inpainting to fill, remove, or modify regions of rendered
 * XR scenes. Integrates with diffusion models (SD-inpaint, FLUX-fill)
 * to seamlessly blend generated content with existing scene geometry.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type InpaintModel = 'sd-inpaint' | 'flux-fill' | 'dalle-edit' | 'lama';
export type MaskSource = 'manual' | 'depth_threshold' | 'segmentation' | 'selection';
export type BlendMode = 'seamless' | 'hard' | 'feathered' | 'alpha';

export interface AiInpaintingConfig {
  model: InpaintModel;
  mask_source: MaskSource;
  blend_mode: BlendMode;
  strength: number;          // 0–1, how strongly to apply inpainting
  padding: number;           // pixels of mask padding for context
  guidance_scale: number;
  steps: number;
  preserve_original_on_mask_clear: boolean;
}

interface InpaintRegion {
  id: string;
  maskData: string | null;    // base64 mask or null
  prompt: string;
  resultUrl: string | null;
  appliedAt: number | null;
}

interface AiInpaintingState {
  isProcessing: boolean;
  activeMask: string | null;   // current mask (base64 or URL)
  regions: Map<string, InpaintRegion>;
  totalInpaints: number;
  lastResultUrl: string | null;
  avgProcessTimeMs: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const aiInpaintingHandler: TraitHandler<AiInpaintingConfig> = {
  name: 'ai_inpainting' as any,

  defaultConfig: {
    model: 'sd-inpaint',
    mask_source: 'manual',
    blend_mode: 'seamless',
    strength: 0.8,
    padding: 16,
    guidance_scale: 7.5,
    steps: 20,
    preserve_original_on_mask_clear: true,
  },

  onAttach(node, config, context) {
    const state: AiInpaintingState = {
      isProcessing: false,
      activeMask: null,
      regions: new Map(),
      totalInpaints: 0,
      lastResultUrl: null,
      avgProcessTimeMs: 0,
    };
    context.setState({ aiInpainting: state });
    context.emit('inpainting:ready', {
      model: config.model,
      blend_mode: config.blend_mode,
    });
  },

  onDetach(node, config, context) {
    const state = context.getState().aiInpainting as AiInpaintingState | undefined;
    if (state?.isProcessing) {
      context.emit('inpainting:cancelled');
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().aiInpainting as AiInpaintingState | undefined;
    if (!state) return;

    if (event.type === 'inpainting:set_mask') {
      const payload = event.payload as any;
      state.activeMask = payload?.maskData ?? null;
      context.emit('inpainting:mask_set', {
        hasMask: state.activeMask !== null,
        source: config.mask_source,
      });
    } else if (event.type === 'inpainting:process') {
      if (!state.activeMask) {
        context.emit('inpainting:error', { message: 'No mask set' });
        return;
      }
      const payload = event.payload as any;
      const regionId: string = payload?.regionId ?? `region_${Date.now()}`;
      const prompt: string = payload?.prompt ?? '';

      state.isProcessing = true;
      state.regions.set(regionId, {
        id: regionId,
        maskData: state.activeMask,
        prompt,
        resultUrl: null,
        appliedAt: null,
      });

      context.emit('inpainting:started', {
        regionId,
        prompt,
        model: config.model,
        strength: config.strength,
      });
    } else if (event.type === 'inpainting:complete') {
      const payload = event.payload as any;
      const regionId: string = payload?.regionId ?? '';
      const region = state.regions.get(regionId);

      if (region) {
        region.resultUrl = payload?.resultUrl ?? null;
        region.appliedAt = Date.now();
      }

      state.isProcessing = false;
      state.lastResultUrl = payload?.resultUrl ?? null;
      state.totalInpaints += 1;

      const elapsed: number = payload?.elapsedMs ?? 0;
      state.avgProcessTimeMs = state.totalInpaints > 1
        ? (state.avgProcessTimeMs * (state.totalInpaints - 1) + elapsed) / state.totalInpaints
        : elapsed;

      context.emit('inpainting:result', {
        regionId,
        resultUrl: state.lastResultUrl,
        blend_mode: config.blend_mode,
        elapsedMs: elapsed,
      });
    } else if (event.type === 'inpainting:clear_mask') {
      if (config.preserve_original_on_mask_clear) {
        context.emit('inpainting:original_restored');
      }
      state.activeMask = null;
    } else if (event.type === 'inpainting:error') {
      state.isProcessing = false;
      context.emit('inpainting:error', {
        message: (event.payload as any)?.message ?? 'Inpainting failed',
      });
    }
  },
};
