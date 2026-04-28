import type { Vector3 } from '../types';
/**
 * Volumetric Trait
 *
 * Support for Gaussian Splatting, NeRF, and high-fidelity volumetric video.
 * Handles level-of-detail (LOD), opacity clipping, and spatial anchors.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';
import { SplatProcessingService, type SplatData } from '../services/SplatProcessingService';

// =============================================================================
// TYPES
// =============================================================================

interface VolumetricState {
  isLoaded: boolean;
  isLoading: boolean;
  pointCount: number;
  currentLOD: number;
  renderMode: 'splat' | 'nerf' | 'cloud';
  opacity: number;
  clipBounds: { min: Vector3; max: Vector3 } | null;
  splatData: SplatData | null;
  indices: Uint32Array | null;
  service: SplatProcessingService;
}

interface VolumetricConfig {
  src: string;
  renderMode: 'splat' | 'nerf' | 'cloud';
  pointSize: number;
  opacity: number;
  lod_auto: boolean;
  max_points: number;
  use_gpu_compute: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const volumetricHandler: TraitHandler<VolumetricConfig> = {
  name: 'volumetric',

  defaultConfig: {
    src: '',
    renderMode: 'splat',
    pointSize: 1.0,
    opacity: 1.0,
    lod_auto: true,
    max_points: 1000000,
    use_gpu_compute: true,
  },

  onAttach(node, config, context) {
    const state: VolumetricState = {
      isLoaded: false,
      isLoading: !!config.src,
      pointCount: 0,
      currentLOD: 0,
      renderMode: config.renderMode,
      opacity: config.opacity,
      clipBounds: null,
      splatData: null,
      indices: null,
      service: new SplatProcessingService(),
    };
    node.__volumetricState = state;

    if (config.src) {
      context.emit?.('volumetric_load_start', { node, src: config.src });
    }
  },

  onDetach(node, config, context) {
    const state = node.__volumetricState as VolumetricState;
    if (state?.isLoaded) {
      context.emit?.('volumetric_unload', { node });
    }
    delete node.__volumetricState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__volumetricState as VolumetricState;
    if (!state || !state.isLoaded || !state.splatData) return;

    // Optional: Trigger re-sort if camera moved significantly
    // In this trait, we emit the state to the renderer
    context.emit?.('volumetric_render_update', {
      node,
      indices: state.indices,
      opacity: config.opacity,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__volumetricState as VolumetricState;
    if (!state) return;

    if (event.type === 'volumetric_data_ready') {
      const buffer = event.buffer as ArrayBuffer;
      if (state.renderMode === 'splat') {
        state.service.parseSplat(buffer).then((data) => {
          state.splatData = data;
          state.pointCount = data.count;
          state.isLoaded = true;
          state.isLoading = false;

          // Initial sort from origin
          state.indices = state.service.sortSplat(data, [0, 0, 0]);

          context.emit?.('on_volumetric_ready', {
            node,
            pointCount: state.pointCount,
            dimensions: event.dimensions,
          });
        });
      }
    } else if (event.type === 'volumetric_sort_request') {
      const cameraPos = event.cameraPosition as Vector3;
      if (state.splatData) {
        state.indices = state.service.sortSplat(state.splatData, cameraPos);
      }
    } else if (event.type === 'volumetric_set_lod') {
      state.currentLOD = (event.lod as number) || 0;
    } else if (event.type === 'volumetric_set_clip') {
      state.clipBounds = {
        min: event.min as Vector3,
        max: event.max as Vector3,
      };
      context.emit?.('volumetric_clip_updated', { node, bounds: state.clipBounds });
    } else if (event.type === 'volumetric_reset_clip') {
      state.clipBounds = null;
    } else if (event.type === 'volumetric_ray_query') {
      const { origin, direction, threshold } = event as unknown as {
        origin: Vector3;
        direction: Vector3;
        threshold: number;
      };
      if (state.renderMode === 'splat' && state.splatData) {
        const hit = state.service.intersectRay(
          state.splatData,
          origin,
          direction,
          threshold || 0.5
        );

        context.emit?.('volumetric_ray_hit', {
          node,
          hit,
          queryId: (event as Record<string, unknown>).queryId,
        });
      }
    }
  },
};

export default volumetricHandler;
