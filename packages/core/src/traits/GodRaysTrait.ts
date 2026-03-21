/**
 * @god_rays Trait — Screen-Space Volumetric Light Scattering
 *
 * Post-process effect that renders god rays (crepuscular rays) from
 * the sun position. Reads sun_position from @weather blackboard.
 *
 * Uses a screen-space radial blur from the projected light source.
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import { weatherBlackboard } from '../environment/WeatherBlackboard';

interface GodRaysConfig {
  /** Light decay per sample (default: 0.96) */
  decay: number;
  /** Ray weight/brightness (default: 0.5) */
  weight: number;
  /** Overall exposure (default: 0.3) */
  exposure: number;
  /** Number of radial blur samples (default: 100) */
  samples: number;
  /** Density of the medium (default: 1.0) */
  density: number;
  /** Whether to read sun position from @weather (default: true) */
  use_weather: boolean;
  /** Manual light position if not using weather [x, y, z] */
  light_position: [number, number, number];
}

export const godRaysHandler: TraitHandler<GodRaysConfig> = {
  name: 'god_rays' as any,
  defaultConfig: {
    decay: 0.96,
    weight: 0.5,
    exposure: 0.3,
    samples: 100,
    density: 1.0,
    use_weather: true,
    light_position: [100, 200, 100],
  },

  onAttach(node, config, context) {
    (node as any).__godRaysActive = true;

    const lightPos = config.use_weather
      ? weatherBlackboard.sun_position
      : config.light_position;

    context.emit('god_rays_create', {
      decay: config.decay,
      weight: config.weight,
      exposure: config.exposure,
      samples: config.samples,
      density: config.density,
      lightPosition: lightPos,
    });
  },

  onDetach(node, _config, context) {
    if ((node as any).__godRaysActive) {
      context.emit('god_rays_destroy', { nodeId: node.id });
      delete (node as any).__godRaysActive;
    }
  },

  onUpdate(node, config, context, _delta) {
    if (!(node as any).__godRaysActive) return;

    if (config.use_weather) {
      // Only emit update when sun moves (every frame for smooth rays)
      context.emit('god_rays_update', {
        lightPosition: weatherBlackboard.sun_position,
        intensity: weatherBlackboard.sun_intensity,
        isNight: weatherBlackboard.is_night,
      });
    }
  },

  onEvent(node, config, context, event) {
    if (!(node as any).__godRaysActive) return;

    switch (event.type) {
      case 'god_rays_set_params':
        context.emit('god_rays_update', {
          decay: (event as any).decay ?? config.decay,
          weight: (event as any).weight ?? config.weight,
          exposure: (event as any).exposure ?? config.exposure,
        });
        break;
    }
  },
};
