/**
 * Nerf Trait
 *
 * Neural Radiance Field rendering for photorealistic scene capture.
 * Supports view-dependent rendering and cached frame optimization.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type RenderMode = 'volume' | 'mesh' | 'hybrid';
type QualityLevel = 'fast' | 'balanced' | 'quality';

interface NerfState {
  isReady: boolean;
  isLoading: boolean;
  renderTime: number;
  frameCache: Map<string, unknown>;
  lastCameraHash: string;
  modelHandle: unknown;
}

interface NerfConfig {
  model_url: string;
  resolution: number;
  render_mode: RenderMode;
  quality: QualityLevel;
  cache_frames: boolean;
  cache_size: number; // Max cached views
  near_plane: number;
  far_plane: number;
  samples_per_ray: number;
  background_color: [number, number, number];
}

// =============================================================================
// HANDLER
// =============================================================================

export const nerfHandler: TraitHandler<NerfConfig> = {
  name: 'nerf',

  defaultConfig: {
    model_url: '',
    resolution: 512,
    render_mode: 'volume',
    quality: 'balanced',
    cache_frames: true,
    cache_size: 32,
    near_plane: 0.1,
    far_plane: 100,
    samples_per_ray: 64,
    background_color: [0, 0, 0],
  },

  onAttach(node, config, context) {
    const state: NerfState = {
      isReady: false,
      isLoading: false,
      renderTime: 0,
      frameCache: new Map(),
      lastCameraHash: '',
      modelHandle: null,
    };
    (node as any).__nerfState = state;

    if (config.model_url) {
      loadNerfModel(node, state, config, context);
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__nerfState as NerfState;
    if (state?.modelHandle) {
      context.emit?.('nerf_destroy', { node });
    }
    delete (node as any).__nerfState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__nerfState as NerfState;
    if (!state || !state.isReady) return;

    // Get camera position and check cache
    const camera = context.camera;
    if (!camera) return;

    const cameraHash = getCameraHash(camera);

    if (cameraHash !== state.lastCameraHash) {
      state.lastCameraHash = cameraHash;

      // Check cache
      if (config.cache_frames && state.frameCache.has(cameraHash)) {
        context.emit?.('nerf_use_cached', {
          node,
          cacheKey: cameraHash,
        });
      } else {
        // Request new render
        const startTime = Date.now();

        context.emit?.('nerf_render', {
          node,
          camera: {
            position: camera.position,
            rotation: camera.rotation,
            fov: camera.fov,
          },
          resolution: config.resolution,
          quality: config.quality,
          renderMode: config.render_mode,
          samplesPerRay: config.samples_per_ray,
          nearPlane: config.near_plane,
          farPlane: config.far_plane,
          cacheKey: config.cache_frames ? cameraHash : undefined,
        });

        state.renderTime = Date.now() - startTime;
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__nerfState as NerfState;
    if (!state) return;

    if (event.type === 'nerf_model_loaded') {
      state.isLoading = false;
      state.isReady = true;
      state.modelHandle = event.handle;

      context.emit?.('on_nerf_ready', {
        node,
      });
    } else if (event.type === 'nerf_load_error') {
      state.isLoading = false;
      context.emit?.('on_nerf_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'nerf_frame_rendered') {
      state.renderTime = event.renderTime as number;

      // Cache if enabled
      if (config.cache_frames && event.cacheKey) {
        // Evict old entries if cache full
        if (state.frameCache.size >= config.cache_size) {
          const firstKey = state.frameCache.keys().next().value;
          if (firstKey) state.frameCache.delete(firstKey);
        }
        state.frameCache.set(event.cacheKey as string, event.frame);
      }
    } else if (event.type === 'nerf_set_quality') {
      context.emit?.('nerf_update_quality', {
        node,
        quality: event.quality as string,
      });
    } else if (event.type === 'nerf_set_resolution') {
      context.emit?.('nerf_update_resolution', {
        node,
        resolution: event.resolution as number,
      });
    } else if (event.type === 'nerf_clear_cache') {
      state.frameCache.clear();
    } else if (event.type === 'nerf_reload') {
      if (config.model_url) {
        if (state.modelHandle) {
          context.emit?.('nerf_destroy', { node });
        }
        state.isReady = false;
        state.frameCache.clear();
        loadNerfModel(node, state, config, context);
      }
    } else if (event.type === 'nerf_query') {
      context.emit?.('nerf_info', {
        queryId: event.queryId,
        node,
        isReady: state.isReady,
        renderTime: state.renderTime,
        cachedFrames: state.frameCache.size,
        cacheSize: config.cache_size,
      });
    }
  },
};

function loadNerfModel(
  node: unknown,
  state: NerfState,
  config: NerfConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  state.isLoading = true;

  context.emit?.('nerf_load', {
    node,
    url: config.model_url,
    backgroundColor: config.background_color,
  });
}

function getCameraHash(camera: {
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
}): string {
  const pos = camera.position || { x: 0, y: 0, z: 0 };
  const rot = camera.rotation || { x: 0, y: 0, z: 0 };
  // Quantize to reduce cache misses for minor movements
  const px = Math.round(pos.x * 100) / 100;
  const py = Math.round(pos.y * 100) / 100;
  const pz = Math.round(pos.z * 100) / 100;
  const rx = Math.round(rot.x * 100) / 100;
  const ry = Math.round(rot.y * 100) / 100;
  const rz = Math.round(rot.z * 100) / 100;
  return `${px},${py},${pz},${rx},${ry},${rz}`;
}

export default nerfHandler;
