/**
 * @deformable_terrain Trait — GPU Hydraulic Erosion
 *
 * Real-time terrain deformation with erosion driven by @weather precipitation.
 * Uses GPU compute for heightmap erosion (thermal + hydraulic).
 *
 * @module traits
 */

import type { TraitHandler } from '@holoscript/core';
import type { HSPlusNode } from '@holoscript/core';
import { weatherBlackboard } from '@holoscript/engine/environment/WeatherBlackboard';

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

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, TerrainState>();

export const deformableTerrainHandler: TraitHandler<DeformableTerrainConfig> = {
  name: 'deformable_terrain',
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
    traitState.set(node, state);
    node.__terrainState = state;

    context.emit('deformable_terrain_create', {
      resolution: config.resolution,
      scale: config.scale,
      displacementScale: config.displacement_scale,
      useGPU: config.use_gpu,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      context.emit('deformable_terrain_destroy', { nodeId: node.id });
      traitState.delete(node);
      delete node.__terrainState;
    }
  },

  onUpdate(node, config, context, delta) {
    const state = traitState.get(node);
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
    const state = traitState.get(node);
    if (!state) return;

    switch (event.type) {
      case 'terrain_deform': {
        context.emit('deformable_terrain_deform', {
          position: event.position,
          radius: (event.radius as number) ?? 5.0,
          strength: (event.strength as number) ?? 1.0,
          mode: (event.mode as string) ?? 'dig', // 'dig' | 'raise' | 'smooth'
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
