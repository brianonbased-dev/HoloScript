/**
 * @deformable_terrain Trait — GPU Hydraulic Erosion
 *
 * Real-time terrain deformation with erosion driven by @weather precipitation.
 * Uses GPU compute for heightmap erosion (thermal + hydraulic).
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import { weatherBlackboard } from '../environment/WeatherBlackboard';

interface DeformableTerrainConfig {
  /** Heightmap resolution (default: 256) */
  resolution: number;
  /** Terrain scale in world units (default: 100) */
  scale: number;
  /** Maximum displacement (default: 5.0) */
  displacement_scale: number;
  /** Erosion rate (default: 0.01) */
  erosion_rate: number;
  /** Sediment capacity (default: 0.02) */
  sediment_capacity: number;
  /** Thermal erosion threshold angle in degrees (default: 45) */
  thermal_threshold: number;
  /** Whether to read precipitation from @weather (default: true) */
  use_weather: boolean;
  /** Use GPU compute for erosion (default: true) */
  use_gpu: boolean;
}

interface TerrainState {
  active: boolean;
  totalErosion: number;
  erosionSteps: number;
}

export const deformableTerrainHandler: TraitHandler<DeformableTerrainConfig> = {
  name: 'deformable_terrain' as any,
  defaultConfig: {
    resolution: 256,
    scale: 100,
    displacement_scale: 5.0,
    erosion_rate: 0.01,
    sediment_capacity: 0.02,
    thermal_threshold: 45,
    use_weather: true,
    use_gpu: true,
  },

  onAttach(node, config, context) {
    const state: TerrainState = {
      active: true,
      totalErosion: 0,
      erosionSteps: 0,
    };
    (node as any).__terrainState = state;

    context.emit('deformable_terrain_create', {
      resolution: config.resolution,
      scale: config.scale,
      displacementScale: config.displacement_scale,
      useGPU: config.use_gpu,
    });
  },

  onDetach(node, _config, context) {
    if ((node as any).__terrainState) {
      context.emit('deformable_terrain_destroy', { nodeId: node.id });
      delete (node as any).__terrainState;
    }
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__terrainState as TerrainState | undefined;
    if (!state?.active) return;

    // Read precipitation from @weather blackboard
    let precipitationIntensity = 0;
    if (config.use_weather) {
      precipitationIntensity = weatherBlackboard.precipitation;
    }

    // Only erode when there's precipitation (or manual trigger)
    if (precipitationIntensity > 0) {
      state.erosionSteps++;
      state.totalErosion += precipitationIntensity * config.erosion_rate * delta;

      context.emit('deformable_terrain_erode', {
        deltaTime: delta,
        erosionRate: config.erosion_rate * precipitationIntensity,
        sedimentCapacity: config.sediment_capacity,
        thermalThreshold: config.thermal_threshold,
        windDirection: [weatherBlackboard.wind_vector[0], weatherBlackboard.wind_vector[2]],
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__terrainState as TerrainState | undefined;
    if (!state) return;

    switch (event.type) {
      case 'terrain_deform': {
        const e = event as any;
        context.emit('deformable_terrain_deform', {
          position: e.position,
          radius: e.radius ?? 5.0,
          strength: e.strength ?? 1.0,
          mode: e.mode ?? 'dig', // 'dig' | 'raise' | 'smooth'
        });
        break;
      }
      case 'terrain_reset':
        state.totalErosion = 0;
        state.erosionSteps = 0;
        context.emit('deformable_terrain_reset', {});
        break;
    }
  },
};
