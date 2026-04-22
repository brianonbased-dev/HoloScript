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

import type { TraitHandler } from '@holoscript/core';
import type { HSPlusNode } from '@holoscript/core';
import { weatherBlackboard } from '@holoscript/engine/environment/WeatherBlackboard';

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

/** Module-level state store to avoid casting node to any */
const activeNodes = new WeakSet<HSPlusNode>();
/** Tracks whether god rays are active per node (replaces __godRaysActive property) */
const godRaysActiveFlag = new WeakMap<HSPlusNode, boolean>();

export const godRaysHandler: TraitHandler<GodRaysConfig> = {
  name: 'god_rays',
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
    activeNodes.add(node);
    godRaysActiveFlag.set(node, true);
    (node as unknown as Record<string, unknown>).__godRaysActive = true;

    const lightPos = config.use_weather ? weatherBlackboard.sun_position : config.light_position;

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
    if (activeNodes.has(node)) {
      context.emit('god_rays_destroy', { nodeId: node.id });
      activeNodes.delete(node);
      godRaysActiveFlag.delete(node);
      delete (node as unknown as Record<string, unknown>).__godRaysActive;
    }
  },

  onUpdate(node, config, context, _delta) {
    if (
      !activeNodes.has(node) ||
      godRaysActiveFlag.get(node) === false ||
      (node as unknown as Record<string, unknown>).__godRaysActive === false
    )
      return;

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
    if (
      !activeNodes.has(node) ||
      godRaysActiveFlag.get(node) === false ||
      (node as unknown as Record<string, unknown>).__godRaysActive === false
    )
      return;

    switch (event.type) {
      case 'god_rays_set_params':
        context.emit('god_rays_update', {
          decay: (event.decay as number) ?? config.decay,
          weight: (event.weight as number) ?? config.weight,
          exposure: (event.exposure as number) ?? config.exposure,
        });
        break;
    }
  },
};
