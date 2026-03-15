/**
 * Heatmap3D Trait
 *
 * 3D spatial heatmap overlay for visualizing scalar data on geometry.
 * Supports animated transitions and various color maps.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ColorMap =
  | 'viridis'
  | 'plasma'
  | 'inferno'
  | 'magma'
  | 'turbo'
  | 'jet'
  | 'hot'
  | 'cool'
  | 'rainbow';
type Interpolation = 'nearest' | 'linear' | 'cubic';

interface DataPoint {
  position: [number, number, number];
  value: number;
}

interface Heatmap3DState {
  isLoaded: boolean;
  dataPoints: DataPoint[];
  minValue: number;
  maxValue: number;
  textureHandle: unknown;
  needsUpdate: boolean;
  animationProgress: number;
  previousData: DataPoint[] | null;
}

interface Heatmap3DConfig {
  data_source: string; // URL or inline data
  color_map: ColorMap;
  opacity: number;
  resolution: number; // Grid resolution
  interpolation: Interpolation;
  range: { min: number; max: number }; // Value range
  auto_range: boolean;
  animated: boolean;
  animation_duration: number; // ms
  legend: boolean;
  legend_position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  height_extrusion: number; // 3D extrusion based on value
}

// =============================================================================
// HANDLER
// =============================================================================

export const heatmap3dHandler: TraitHandler<Heatmap3DConfig> = {
  name: 'heatmap_3d',

  defaultConfig: {
    data_source: '',
    color_map: 'viridis',
    opacity: 0.7,
    resolution: 32,
    interpolation: 'linear',
    range: { min: 0, max: 1 },
    auto_range: true,
    animated: false,
    animation_duration: 500,
    legend: true,
    legend_position: 'bottom-right',
    height_extrusion: 0,
  },

  onAttach(node, config, context) {
    const state: Heatmap3DState = {
      isLoaded: false,
      dataPoints: [],
      minValue: config.range.min,
      maxValue: config.range.max,
      textureHandle: null,
      needsUpdate: false,
      animationProgress: 1,
      previousData: null,
    };
    (node as any).__heatmap3dState = state;

    // Create heatmap renderer
    context.emit?.('heatmap_create', {
      node,
      colorMap: config.color_map,
      opacity: config.opacity,
      resolution: config.resolution,
      interpolation: config.interpolation,
      heightExtrusion: config.height_extrusion,
    });

    if (config.data_source) {
      context.emit?.('heatmap_load_data', {
        node,
        source: config.data_source,
      });
    }

    if (config.legend) {
      context.emit?.('heatmap_show_legend', {
        node,
        position: config.legend_position,
        colorMap: config.color_map,
        range: config.range,
      });
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__heatmap3dState as Heatmap3DState;
    if (state?.textureHandle) {
      context.emit?.('heatmap_destroy', { node });
    }
    delete (node as any).__heatmap3dState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__heatmap3dState as Heatmap3DState;
    if (!state) return;

    // Handle animated transitions
    if (config.animated && state.animationProgress < 1 && state.previousData) {
      state.animationProgress += delta / (config.animation_duration / 1000);

      if (state.animationProgress >= 1) {
        state.animationProgress = 1;
        state.previousData = null;

        context.emit?.('heatmap_render', {
          node,
          data: state.dataPoints,
          range: { min: state.minValue, max: state.maxValue },
        });
      } else {
        // Interpolate between previous and current data
        const interpolatedData = interpolateData(
          state.previousData,
          state.dataPoints,
          state.animationProgress
        );

        context.emit?.('heatmap_render', {
          node,
          data: interpolatedData,
          range: { min: state.minValue, max: state.maxValue },
        });
      }
    } else if (state.needsUpdate) {
      state.needsUpdate = false;

      context.emit?.('heatmap_render', {
        node,
        data: state.dataPoints,
        range: { min: state.minValue, max: state.maxValue },
      });

      context.emit?.('on_heatmap_update', {
        node,
        pointCount: state.dataPoints.length,
        range: { min: state.minValue, max: state.maxValue },
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__heatmap3dState as Heatmap3DState;
    if (!state) return;

    if (event.type === 'heatmap_data_loaded') {
      const newData = event.data as DataPoint[];

      if (config.animated && state.dataPoints.length > 0) {
        state.previousData = [...state.dataPoints];
        state.animationProgress = 0;
      }

      state.dataPoints = newData;
      state.isLoaded = true;

      // Calculate auto range
      if (config.auto_range && newData.length > 0) {
        state.minValue = Math.min(...newData.map((p) => p.value));
        state.maxValue = Math.max(...newData.map((p) => p.value));
      }

      state.needsUpdate = true;
    } else if (event.type === 'heatmap_set_data') {
      const newData = event.data as DataPoint[];

      if (config.animated && state.dataPoints.length > 0) {
        state.previousData = [...state.dataPoints];
        state.animationProgress = 0;
      }

      state.dataPoints = newData;

      if (config.auto_range && newData.length > 0) {
        state.minValue = Math.min(...newData.map((p) => p.value));
        state.maxValue = Math.max(...newData.map((p) => p.value));
      }

      state.needsUpdate = true;
    } else if (event.type === 'heatmap_add_point') {
      const point = event.point as DataPoint;
      state.dataPoints.push(point);

      if (config.auto_range) {
        state.minValue = Math.min(state.minValue, point.value);
        state.maxValue = Math.max(state.maxValue, point.value);
      }

      state.needsUpdate = true;
    } else if (event.type === 'heatmap_set_range') {
      state.minValue = event.min as number;
      state.maxValue = event.max as number;
      state.needsUpdate = true;

      if (config.legend) {
        context.emit?.('heatmap_update_legend', {
          node,
          range: { min: state.minValue, max: state.maxValue },
        });
      }
    } else if (event.type === 'heatmap_set_colormap') {
      context.emit?.('heatmap_change_colormap', {
        node,
        colorMap: event.colorMap as string,
      });
      state.needsUpdate = true;
    } else if (event.type === 'heatmap_clear') {
      state.dataPoints = [];
      state.previousData = null;
      state.needsUpdate = true;
    } else if (event.type === 'heatmap_query') {
      context.emit?.('heatmap_info', {
        queryId: event.queryId,
        node,
        isLoaded: state.isLoaded,
        pointCount: state.dataPoints.length,
        range: { min: state.minValue, max: state.maxValue },
        isAnimating: state.animationProgress < 1,
      });
    }
  },
};

function interpolateData(from: DataPoint[], to: DataPoint[], t: number): DataPoint[] {
  const result: DataPoint[] = [];
  const maxLen = Math.max(from.length, to.length);

  for (let i = 0; i < maxLen; i++) {
    const fromPoint = from[i] || to[i];
    const toPoint = to[i] || from[i];

    result.push({
      position: [
        fromPoint.position[0] + (toPoint.position[0] - fromPoint.position[0]) * t,
        fromPoint.position[1] + (toPoint.position[1] - fromPoint.position[1]) * t,
        fromPoint.position[2] + (toPoint.position[2] - fromPoint.position[2]) * t,
      ],
      value: fromPoint.value + (toPoint.value - fromPoint.value) * t,
    });
  }

  return result;
}

export default heatmap3dHandler;
