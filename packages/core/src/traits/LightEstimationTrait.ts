import type { Vector3 } from '../types';
/**
 * LightEstimation Trait
 *
 * Match virtual lighting to real environment for realistic AR.
 * Supports ambient intensity, color temperature, and directional light.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type EstimationMode =
  | 'ambient_intensity'
  | 'ambient_spherical'
  | 'directional'
  | 'environmental_hdr';

interface LightEstimationState {
  isActive: boolean;
  intensity: number; // 0-2 (1 = normal)
  colorTemperature: number; // Kelvin
  colorCorrection: { r: number; g: number; b: number };
  primaryDirection: Vector3;
  sphericalHarmonics: Float32Array | null;
  environmentMap: unknown;
  updateAccumulator: number;
}

interface LightEstimationConfig {
  mode: EstimationMode;
  auto_apply: boolean;
  update_rate: number; // Hz
  shadow_estimation: boolean;
  color_temperature: boolean;
  smoothing: number; // 0-1
  intensity_multiplier: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function kelvinToRGB(kelvin: number): { r: number; g: number; b: number } {
  const temp = kelvin / 100;
  let r: number, g: number, b: number;

  if (temp <= 66) {
    r = 255;
    g = Math.min(255, Math.max(0, 99.4708025861 * Math.log(temp) - 161.1195681661));
    b =
      temp <= 19
        ? 0
        : Math.min(255, Math.max(0, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
  } else {
    r = Math.min(255, Math.max(0, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
    g = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));
    b = 255;
  }

  return { r: r / 255, g: g / 255, b: b / 255 };
}

// =============================================================================
// HANDLER
// =============================================================================

export const lightEstimationHandler: TraitHandler<LightEstimationConfig> = {
  name: 'light_estimation',

  defaultConfig: {
    mode: 'ambient_intensity',
    auto_apply: true,
    update_rate: 30,
    shadow_estimation: false,
    color_temperature: true,
    smoothing: 0.8,
    intensity_multiplier: 1.0,
  },

  onAttach(node, config, context) {
    const state: LightEstimationState = {
      isActive: false,
      intensity: 1.0,
      colorTemperature: 6500,
      colorCorrection: { r: 1, g: 1, b: 1 },
      primaryDirection: [0, -1, 0 ],
      sphericalHarmonics: null,
      environmentMap: null,
      updateAccumulator: 0,
    };
    node.__lightEstimationState = state;

    context.emit?.('light_estimation_request', {
      node,
      mode: config.mode,
      shadowEstimation: config.shadow_estimation,
    });

    state.isActive = true;
  },

  onDetach(node, config, context) {
    context.emit?.('light_estimation_stop', { node });
    delete node.__lightEstimationState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__lightEstimationState as LightEstimationState;
    if (!state || !state.isActive) return;

    state.updateAccumulator += delta;
    const updateInterval = 1 / config.update_rate;

    if (state.updateAccumulator >= updateInterval) {
      state.updateAccumulator = 0;

      // Request new light estimate
      context.emit?.('light_estimation_poll', { node });
    }

    // Auto-apply lighting to scene
    if (config.auto_apply) {
      const finalIntensity = state.intensity * config.intensity_multiplier;

      context.emit?.('scene_light_update', {
        node,
        intensity: finalIntensity,
        colorCorrection: state.colorCorrection,
        direction: state.primaryDirection,
        sphericalHarmonics: state.sphericalHarmonics,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__lightEstimationState as LightEstimationState;
    if (!state) return;

    if (event.type === 'light_estimation_update') {
      // Smooth intensity
      const newIntensity = event.intensity as number;
      state.intensity = state.intensity * config.smoothing + newIntensity * (1 - config.smoothing);

      // Color temperature
      if (config.color_temperature && event.colorTemperature !== undefined) {
        const newTemp = event.colorTemperature as number;
        state.colorTemperature =
          state.colorTemperature * config.smoothing + newTemp * (1 - config.smoothing);

        state.colorCorrection = kelvinToRGB(state.colorTemperature);
      }

      // Directional light
      if (event.direction) {
        const dir = event.direction as typeof state.primaryDirection;
        state.primaryDirection = {
          x: state.primaryDirection[0] * config.smoothing + dir[0] * (1 - config.smoothing),
          y: state.primaryDirection[1] * config.smoothing + dir[1] * (1 - config.smoothing),
          z: state.primaryDirection[2] * config.smoothing + dir[2] * (1 - config.smoothing),
        };
      }

      // Spherical harmonics
      if (event.sphericalHarmonics) {
        state.sphericalHarmonics = event.sphericalHarmonics as Float32Array;
      }

      context.emit?.('on_light_estimated', {
        node,
        intensity: state.intensity,
        colorTemperature: state.colorTemperature,
        direction: state.primaryDirection,
      });
    } else if (event.type === 'light_estimation_env_map') {
      state.environmentMap = event.envMap;

      context.emit?.('scene_environment_map_update', {
        node,
        envMap: event.envMap,
      });
    } else if (event.type === 'light_estimation_pause') {
      state.isActive = false;
    } else if (event.type === 'light_estimation_resume') {
      state.isActive = true;
    } else if (event.type === 'light_estimation_query') {
      context.emit?.('light_estimation_response', {
        queryId: event.queryId,
        node,
        intensity: state.intensity,
        colorTemperature: state.colorTemperature,
        colorCorrection: state.colorCorrection,
        direction: state.primaryDirection,
        hasSphericalHarmonics: state.sphericalHarmonics !== null,
        hasEnvironmentMap: state.environmentMap !== null,
      });
    }
  },
};

export default lightEstimationHandler;
