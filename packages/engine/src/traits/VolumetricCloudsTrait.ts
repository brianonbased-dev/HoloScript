/**
 * @volumetric_clouds Trait — Raymarched Volumetric Cloud Layer
 *
 * Renders a sky dome of volumetric clouds using ray-marching with
 * Beer-Lambert absorption and Henyey-Greenstein phase function.
 * Reads wind/cloud_density/cloud_altitude from @weather blackboard.
 *
 * @module traits
 */

import type { TraitHandler } from '@holoscript/core';
import type { HSPlusNode } from '@holoscript/core';
import { weatherBlackboard } from '@holoscript/engine/environment/WeatherBlackboard';

interface VolumetricCloudsConfig {
  /** Cloud layer altitude in world units (default: 500) */
  altitude: number;
  /** Cloud layer thickness (default: 200) */
  thickness: number;
  /** Base cloud density (default: 0.04) */
  absorption_coeff: number;
  /** Scattering coefficient (default: 0.06) */
  scattering_coeff: number;
  /** Henyey-Greenstein phase asymmetry (default: 0.3, forward scattering) */
  phase_g: number;
  /** Max ray-march steps (default: 64) */
  max_steps: number;
  /** Wind influence scale (default: 1.0) */
  wind_scale: number;
  /** Cloud coverage 0-1 (default: 0.5, overridden by @weather) */
  coverage: number;
  /** Whether to read from @weather blackboard (default: true) */
  use_weather: boolean;
}

interface CloudState {
  active: boolean;
  time: number;
  windOffset: [number, number, number];
}

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, CloudState>();

export const volumetricCloudsHandler: TraitHandler<VolumetricCloudsConfig> = {
  name: 'volumetric_clouds',
  defaultConfig: {
    altitude: 500,
    thickness: 200,
    absorption_coeff: 0.04,
    scattering_coeff: 0.06,
    phase_g: 0.3,
    max_steps: 64,
    wind_scale: 1.0,
    coverage: 0.5,
    use_weather: true,
  },

  onAttach(node, config, context) {
    const state: CloudState = {
      active: true,
      time: 0,
      windOffset: [0, 0, 0],
    };
    traitState.set(node, state);
    node.__cloudState = state;

    context.emit('volumetric_clouds_create', {
      altitude: config.altitude,
      thickness: config.thickness,
      absorptionCoeff: config.absorption_coeff,
      scatteringCoeff: config.scattering_coeff,
      phaseG: config.phase_g,
      maxSteps: config.max_steps,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      context.emit('volumetric_clouds_destroy', { nodeId: node.id });
      traitState.delete(node);
      delete node.__cloudState;
    }
  },

  onUpdate(node, config, context, delta) {
    const state = traitState.get(node);
    if (!state?.active) return;

    state.time += delta;

    // Read weather blackboard for wind and cloud density
    let coverage = config.coverage;
    let windX = 0,
      windZ = 0;

    if (config.use_weather) {
      coverage = weatherBlackboard.cloud_density;
      windX = weatherBlackboard.wind_vector[0] * config.wind_scale;
      windZ = weatherBlackboard.wind_vector[2] * config.wind_scale;
    }

    // Accumulate wind offset for cloud scrolling
    state.windOffset[0] += windX * delta;
    state.windOffset[2] += windZ * delta;

    context.emit('volumetric_clouds_update', {
      time: state.time,
      coverage,
      windOffset: [...state.windOffset],
      sunPosition: weatherBlackboard.sun_position,
      sunIntensity: weatherBlackboard.sun_intensity,
    });
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    switch (event.type) {
      case 'clouds_set_coverage':
        context.emit('volumetric_clouds_update', {
          coverage: (event.coverage as number) ?? config.coverage,
        });
        break;
      case 'clouds_pause':
        state.active = false;
        break;
      case 'clouds_resume':
        state.active = true;
        break;
    }
  },
};
