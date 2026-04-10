/**
 * Buoyancy Trait
 *
 * Liquid buoyancy simulation - applies Archimedes' principle
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface BuoyancyState {
  isSubmerged: boolean;
  submersionRatio: number;
  buoyancyForce: number;
  lastPosition: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  splashCooldown: number;
}

interface BuoyancyConfig {
  fluid_density: number; // kg/m³ (water = 1000)
  fluid_level: number; // Y position of water surface
  drag: number; // Linear drag in fluid
  angular_drag: number; // Angular drag in fluid
  flow_direction: number[]; // Current direction [x, y, z]
  flow_strength: number; // Current strength
  splash_effect: boolean; // Emit splash events
  submerge_threshold: number; // Ratio for "fully submerged"
  object_density: number; // Object density (kg/m³)
  object_volume: number; // Object volume (m³)
}

// =============================================================================
// PHYSICS HELPERS
// =============================================================================

function calculateSubmersionRatio(
  objectY: number,
  objectHeight: number,
  fluidLevel: number
): number {
  const objectTop = objectY + objectHeight / 2;
  const objectBottom = objectY - objectHeight / 2;

  if (objectTop <= fluidLevel) return 1.0; // Fully submerged
  if (objectBottom >= fluidLevel) return 0.0; // Above water

  // Partially submerged
  return (fluidLevel - objectBottom) / objectHeight;
}

function calculateBuoyancyForce(
  fluidDensity: number,
  volume: number,
  submersionRatio: number,
  gravity: number = 9.81
): number {
  // Archimedes' principle: F = ρ * V * g
  return fluidDensity * volume * submersionRatio * gravity;
}

// =============================================================================
// HANDLER
// =============================================================================

export const buoyancyHandler: TraitHandler<BuoyancyConfig> = {
  name: 'buoyancy',

  defaultConfig: {
    fluid_density: 1000,
    fluid_level: 0,
    drag: 1.0,
    angular_drag: 0.5,
    flow_direction: [0, 0, 0],
    flow_strength: 0,
    splash_effect: true,
    submerge_threshold: 0.9,
    object_density: 500, // Default: wood-like (floats)
    object_volume: 1.0, // 1 cubic meter
  },

  onAttach(node, _config, _context) {
    const position = node.position || { x: 0, y: 0, z: 0 };
    const state: BuoyancyState = {
      isSubmerged: false,
      submersionRatio: 0,
      buoyancyForce: 0,
      lastPosition: { ...position },
      velocity: { x: 0, y: 0, z: 0 },
      splashCooldown: 0,
    };
    node.__buoyancyState = state;
  },

  onDetach(node) {
    delete node.__buoyancyState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__buoyancyState as BuoyancyState;
    if (!state) return;

    const position = node.position || { x: 0, y: 0, z: 0 };
    const scale = node.scale || { x: 1, y: 1, z: 1 };
    const objectHeight = scale.y;

    // Calculate velocity from position change
    state.velocity = {
      x: (position.x - state.lastPosition.x) / delta,
      y: (position.y - state.lastPosition.y) / delta,
      z: (position.z - state.lastPosition.z) / delta,
    };
    state.lastPosition = { ...position };

    // Calculate submersion
    const prevSubmersion = state.submersionRatio;
    state.submersionRatio = calculateSubmersionRatio(position.y, objectHeight, config.fluid_level);

    const wasSubmerged = state.isSubmerged;
    state.isSubmerged = state.submersionRatio >= config.submerge_threshold;

    // Calculate buoyancy force
    state.buoyancyForce = calculateBuoyancyForce(
      config.fluid_density,
      config.object_volume,
      state.submersionRatio
    );

    // Apply physics via events
    if (state.submersionRatio > 0) {
      // Buoyancy force (upward)
      const objectWeight = config.object_density * config.object_volume * 9.81;
      const netForce = state.buoyancyForce - objectWeight;
      context.emit?.('apply_force', { node, force: { x: 0, y: netForce, z: 0 } });

      // Fluid drag (opposes velocity)
      const dragCoeff = config.drag * state.submersionRatio;
      context.emit?.('apply_force', {
        node,
        force: {
          x: -state.velocity.x * dragCoeff,
          y: -state.velocity.y * dragCoeff,
          z: -state.velocity.z * dragCoeff,
        },
      });

      // Current/flow force
      if (config.flow_strength > 0) {
        context.emit?.('apply_force', {
          node,
          force: {
            x: config.flow_direction[0] * config.flow_strength * state.submersionRatio,
            y: config.flow_direction[1] * config.flow_strength * state.submersionRatio,
            z: config.flow_direction[2] * config.flow_strength * state.submersionRatio,
          },
        });
      }
    }

    // Emit events
    state.splashCooldown = Math.max(0, state.splashCooldown - delta);

    if (config.splash_effect && state.splashCooldown <= 0) {
      // Entering water
      if (prevSubmersion === 0 && state.submersionRatio > 0) {
        const splashIntensity = Math.min(1, Math.abs(state.velocity.y) / 5);
        context.emit?.('on_splash', { node, intensity: splashIntensity, entering: true });
        state.splashCooldown = 0.5; // 500ms cooldown
      }
      // Exiting water
      else if (prevSubmersion > 0 && state.submersionRatio === 0) {
        context.emit?.('on_splash', { node, intensity: 0.3, entering: false });
        state.splashCooldown = 0.5;
      }
    }

    // Submersion state change
    if (!wasSubmerged && state.isSubmerged) {
      context.emit?.('on_submerge', { node, submersionRatio: state.submersionRatio });
    } else if (wasSubmerged && !state.isSubmerged) {
      context.emit?.('on_surface', { node });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__buoyancyState as BuoyancyState;
    if (!state) return;

    // Handle external events that affect buoyancy
    if (event.type === 'set_fluid_level' && typeof event.level === 'number') {
      config.fluid_level = event.level;
    }
  },
};

export default buoyancyHandler;
