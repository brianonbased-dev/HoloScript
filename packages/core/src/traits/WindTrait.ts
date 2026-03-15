/**
 * Wind Trait
 *
 * Wind force field with turbulence, gusts, and falloff
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface WindState {
  currentStrength: number;
  gustTimer: number;
  turbulenceOffset: { x: number; y: number; z: number };
  time: number;
  isActive: boolean;
}

interface WindConfig {
  direction: number[]; // Normalized wind direction [x, y, z]
  strength: number; // Base wind strength (m/s)
  turbulence: number; // Turbulence intensity (0-1)
  turbulence_frequency: number; // How fast turbulence changes
  pulse: boolean; // Whether wind pulses on/off
  pulse_frequency: number; // Pulses per second
  falloff: 'none' | 'linear' | 'quadratic'; // Distance falloff
  radius: number; // Effective radius
  affects: string[]; // Tags of objects to affect (empty = all)
  gust_chance: number; // Chance of random gusts (0-1)
  gust_multiplier: number; // Gust strength multiplier
}

// =============================================================================
// NOISE FUNCTION (Simple Perlin-like)
// =============================================================================

function noise(x: number, y: number, z: number): number {
  // Simple pseudo-random noise
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1; // Range: -1 to 1
}

function smoothNoise(t: number, seed: number = 0): number {
  const floor = Math.floor(t);
  const frac = t - floor;
  // Smooth interpolation
  const smooth = frac * frac * (3 - 2 * frac);
  const a = noise(floor, seed, 0);
  const b = noise(floor + 1, seed, 0);
  return a + smooth * (b - a);
}

// =============================================================================
// HANDLER
// =============================================================================

export const windHandler: TraitHandler<WindConfig> = {
  name: 'wind',

  defaultConfig: {
    direction: [1, 0, 0],
    strength: 5,
    turbulence: 0.3,
    turbulence_frequency: 1.0,
    pulse: false,
    pulse_frequency: 0.5,
    falloff: 'none',
    radius: 100,
    affects: [],
    gust_chance: 0.01,
    gust_multiplier: 2.0,
  },

  onAttach(node, config, context) {
    const state: WindState = {
      currentStrength: config.strength,
      gustTimer: 0,
      turbulenceOffset: { x: 0, y: 0, z: 0 },
      time: 0,
      isActive: true,
    };
    (node as any).__windState = state;

    // Register wind zone with physics system via event
    context.emit?.('register_wind_zone', {
      node,
      position: (node as any).position || { x: 0, y: 0, z: 0 },
      radius: config.radius,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('unregister_wind_zone', { node });
    delete (node as any).__windState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__windState as WindState;
    if (!state || !state.isActive) return;

    state.time += delta;

    // Update turbulence
    const turbTime = state.time * config.turbulence_frequency;
    state.turbulenceOffset = {
      x: smoothNoise(turbTime, 0) * config.turbulence,
      y: smoothNoise(turbTime, 1) * config.turbulence * 0.5, // Less vertical turbulence
      z: smoothNoise(turbTime, 2) * config.turbulence,
    };

    // Handle pulsing
    let pulseMultiplier = 1.0;
    if (config.pulse) {
      const pulsePhase = state.time * config.pulse_frequency * Math.PI * 2;
      pulseMultiplier = (Math.sin(pulsePhase) + 1) / 2; // 0 to 1
    }

    // Handle gusts
    state.gustTimer = Math.max(0, state.gustTimer - delta);
    let gustMultiplier = 1.0;

    if (state.gustTimer > 0) {
      gustMultiplier = config.gust_multiplier;
    } else if (Math.random() < config.gust_chance * delta * 60) {
      // Random gust
      state.gustTimer = 0.5 + Math.random() * 1.5; // 0.5-2 second gust
      gustMultiplier = config.gust_multiplier;
      context.emit?.('on_gust_start', { node, duration: state.gustTimer });
    }

    // Calculate current effective strength
    state.currentStrength = config.strength * pulseMultiplier * gustMultiplier;

    // Request objects in radius and apply wind force via events
    const windPos = (node as any).position || { x: 0, y: 0, z: 0 };

    // Emit wind zone update for physics system to apply forces
    context.emit?.('wind_zone_update', {
      node,
      position: windPos,
      radius: config.radius,
      direction: config.direction,
      strength: state.currentStrength,
      turbulence: state.turbulenceOffset,
      falloff: config.falloff,
      affects: config.affects,
    });

    // Emit wind change event when strength changes significantly
    if (Math.abs(state.currentStrength - config.strength * pulseMultiplier) > 0.5) {
      context.emit?.('on_wind_change', {
        node,
        strength: state.currentStrength,
        direction: config.direction,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__windState as WindState;
    if (!state) return;

    if (event.type === 'set_wind_direction') {
      config.direction = event.direction;
    } else if (event.type === 'set_wind_strength') {
      config.strength = event.strength;
    } else if (event.type === 'toggle_wind') {
      state.isActive = !state.isActive;
    } else if (event.type === 'trigger_gust') {
      state.gustTimer = event.duration || 1.0;
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function _calculateWindForce(
  state: WindState,
  config: WindConfig,
  windPos: { x: number; y: number; z: number },
  objectPos: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  // Calculate distance
  const dx = objectPos.x - windPos.x;
  const dy = objectPos.y - windPos.y;
  const dz = objectPos.z - windPos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Calculate falloff
  let falloff = 1.0;
  if (distance > config.radius) {
    falloff = 0;
  } else if (config.falloff === 'linear') {
    falloff = 1 - distance / config.radius;
  } else if (config.falloff === 'quadratic') {
    const ratio = distance / config.radius;
    falloff = 1 - ratio * ratio;
  }

  if (falloff <= 0) return { x: 0, y: 0, z: 0 };

  // Apply turbulence to direction
  const dir = {
    x: config.direction[0] + state.turbulenceOffset.x,
    y: config.direction[1] + state.turbulenceOffset.y,
    z: config.direction[2] + state.turbulenceOffset.z,
  };

  // Normalize
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (len > 0) {
    dir.x /= len;
    dir.y /= len;
    dir.z /= len;
  }

  // Calculate final force
  const forceMag = state.currentStrength * falloff;

  return {
    x: dir.x * forceMag,
    y: dir.y * forceMag,
    z: dir.z * forceMag,
  };
}

export default windHandler;
