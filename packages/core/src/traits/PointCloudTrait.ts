/**
 * PointCloud Trait
 *
 * Raw point cloud rendering with LOD and streaming support.
 * Handles massive point clouds (millions of points) efficiently.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ColorMode = 'rgb' | 'intensity' | 'height' | 'classification' | 'normal';
type PointFormat = 'ply' | 'las' | 'laz' | 'xyz' | 'pcd' | 'e57';

interface PointCloudState {
  isLoaded: boolean;
  isLoading: boolean;
  pointCount: number;
  visiblePoints: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  lodLevel: number;
  memoryUsage: number;
  octreeHandle: unknown;
}

interface PointCloudConfig {
  source: string;
  point_size: number;
  color_mode: ColorMode;
  max_points: number;
  lod: boolean;
  lod_levels: number;
  streaming: boolean;
  chunk_size: number; // Points per chunk
  format: PointFormat;
  intensity_range: [number, number];
  height_range: [number, number];
  eye_dome_lighting: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const pointCloudHandler: TraitHandler<PointCloudConfig> = {
  name: 'point_cloud',

  defaultConfig: {
    source: '',
    point_size: 1.0,
    color_mode: 'rgb',
    max_points: 5000000,
    lod: true,
    lod_levels: 4,
    streaming: false,
    chunk_size: 100000,
    format: 'ply',
    intensity_range: [0, 255],
    height_range: [0, 100],
    eye_dome_lighting: true,
  },

  onAttach(node, config, context) {
    const state: PointCloudState = {
      isLoaded: false,
      isLoading: false,
      pointCount: 0,
      visiblePoints: 0,
      boundingBox: { min: [0, 0, 0], max: [0, 0, 0] },
      lodLevel: 0,
      memoryUsage: 0,
      octreeHandle: null,
    };
    (node as any).__pointCloudState = state;

    if (config.source) {
      loadPointCloud(node, state, config, context);
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__pointCloudState as PointCloudState;
    if (state?.octreeHandle) {
      context.emit?.('point_cloud_destroy', { node });
    }
    delete (node as any).__pointCloudState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__pointCloudState as PointCloudState;
    if (!state || !state.isLoaded) return;

    // Update LOD based on camera distance if enabled
    if (config.lod) {
      const camera = context.camera;
      if (camera?.position) {
        // Calculate distance to bounding box center
        const center = [
          (state.boundingBox.min[0] + state.boundingBox.max[0]) / 2,
          (state.boundingBox.min[1] + state.boundingBox.max[1]) / 2,
          (state.boundingBox.min[2] + state.boundingBox.max[2]) / 2,
        ];
        const dx = camera.position.x - center[0];
        const dy = camera.position.y - center[1];
        const dz = camera.position.z - center[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Calculate LOD level based on distance
        const lodLevel = Math.min(
          config.lod_levels - 1,
          Math.floor(distance / 10) // Adjust divisor for LOD sensitivity
        );

        if (lodLevel !== state.lodLevel) {
          state.lodLevel = lodLevel;

          context.emit?.('point_cloud_set_lod', {
            node,
            level: lodLevel,
          });
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__pointCloudState as PointCloudState;
    if (!state) return;

    if (event.type === 'point_cloud_loaded') {
      state.isLoading = false;
      state.isLoaded = true;
      state.pointCount = event.pointCount as number;
      state.boundingBox = event.boundingBox as typeof state.boundingBox;
      state.memoryUsage = event.memoryUsage as number;
      state.octreeHandle = event.octree;

      context.emit?.('on_point_cloud_loaded', {
        node,
        pointCount: state.pointCount,
        boundingBox: state.boundingBox,
      });
    } else if (event.type === 'point_cloud_load_progress') {
      context.emit?.('on_point_cloud_progress', {
        node,
        loadedPoints: event.loadedPoints as number,
        totalPoints: event.totalPoints as number,
        progress: event.progress as number,
      });
    } else if (event.type === 'point_cloud_load_error') {
      state.isLoading = false;
      context.emit?.('on_point_cloud_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'point_cloud_visibility_update') {
      state.visiblePoints = event.visibleCount as number;
    } else if (event.type === 'point_cloud_set_point_size') {
      context.emit?.('point_cloud_update_size', {
        node,
        size: event.size as number,
      });
    } else if (event.type === 'point_cloud_set_color_mode') {
      context.emit?.('point_cloud_update_color', {
        node,
        mode: event.mode as string,
        intensityRange: config.intensity_range,
        heightRange: config.height_range,
      });
    } else if (event.type === 'point_cloud_filter') {
      const filter = event.filter as { classification?: number[]; heightRange?: [number, number] };

      context.emit?.('point_cloud_apply_filter', {
        node,
        classification: filter.classification,
        heightRange: filter.heightRange,
      });
    } else if (event.type === 'point_cloud_clear_filter') {
      context.emit?.('point_cloud_reset_filter', { node });
    } else if (event.type === 'point_cloud_set_source') {
      const newSource = event.source as string;
      if (state.octreeHandle) {
        context.emit?.('point_cloud_destroy', { node });
      }
      state.isLoaded = false;
      state.pointCount = 0;

      loadPointCloud(node, state, { ...config, source: newSource }, context);
    } else if (event.type === 'point_cloud_pick') {
      const screenX = event.x as number;
      const screenY = event.y as number;

      context.emit?.('point_cloud_ray_pick', {
        node,
        screenX,
        screenY,
        callbackId: event.callbackId,
      });
    } else if (event.type === 'point_cloud_query') {
      context.emit?.('point_cloud_info', {
        queryId: event.queryId,
        node,
        isLoaded: state.isLoaded,
        pointCount: state.pointCount,
        visiblePoints: state.visiblePoints,
        lodLevel: state.lodLevel,
        memoryUsage: state.memoryUsage,
        boundingBox: state.boundingBox,
      });
    }
  },
};

function loadPointCloud(
  node: unknown,
  state: PointCloudState,
  config: PointCloudConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  state.isLoading = true;

  context.emit?.('point_cloud_load', {
    node,
    source: config.source,
    format: config.format,
    maxPoints: config.max_points,
    streaming: config.streaming,
    chunkSize: config.chunk_size,
    buildLod: config.lod,
    lodLevels: config.lod_levels,
    colorMode: config.color_mode,
    pointSize: config.point_size,
    eyeDomeLighting: config.eye_dome_lighting,
  });
}

export default pointCloudHandler;
