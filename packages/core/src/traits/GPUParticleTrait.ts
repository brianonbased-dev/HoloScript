/**
 * GPUParticle Trait
 *
 * GPU-accelerated particle system using compute shaders.
 * Supports millions of particles with forces, collision, and effects.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface ParticleForce {
  type: 'gravity' | 'wind' | 'vortex' | 'attractor' | 'turbulence';
  strength: number;
  position?: [number, number, number];
  direction?: [number, number, number];
  radius?: number;
}

interface ColorStop {
  time: number; // 0-1
  color: [number, number, number, number]; // RGBA
}

interface SizeStop {
  time: number;
  size: number;
}

interface GPUParticleState {
  isRunning: boolean;
  isEmitting: boolean;
  activeCount: number;
  totalEmitted: number;
  computeHandle: unknown;
  emitterPosition: { x: number; y: number; z: number };
  emitterVelocity: { x: number; y: number; z: number };
  burstQueue: Array<{ count: number; position?: { x: number; y: number; z: number } }>;
}

interface GPUParticleConfig {
  count: number; // Max particles
  emission_rate: number; // Particles per second
  lifetime: number; // Seconds
  lifetime_variance: number;
  initial_velocity: [number, number, number];
  velocity_variance: [number, number, number];
  spread_angle: number; // Degrees
  forces: ParticleForce[];
  color_over_life: ColorStop[];
  size_over_life: SizeStop[];
  collision: boolean;
  collision_damping: number;
  spatial_hash: boolean;
  sprite: string;
  blend_mode: 'additive' | 'alpha' | 'multiply';
}

// =============================================================================
// HANDLER
// =============================================================================

export const gpuParticleHandler: TraitHandler<GPUParticleConfig> = {
  name: 'gpu_particle',

  defaultConfig: {
    count: 10000,
    emission_rate: 1000,
    lifetime: 2.0,
    lifetime_variance: 0.5,
    initial_velocity: [0, 5, 0],
    velocity_variance: [1, 1, 1],
    spread_angle: 30,
    forces: [{ type: 'gravity', strength: 9.81, direction: [0, -1, 0] }],
    color_over_life: [
      { time: 0, color: [1, 1, 1, 1] },
      { time: 1, color: [1, 1, 1, 0] },
    ],
    size_over_life: [
      { time: 0, size: 0.1 },
      { time: 0.5, size: 0.15 },
      { time: 1, size: 0 },
    ],
    collision: false,
    collision_damping: 0.5,
    spatial_hash: false,
    sprite: '',
    blend_mode: 'additive',
  },

  onAttach(node, config, context) {
    const state: GPUParticleState = {
      isRunning: false,
      isEmitting: true,
      activeCount: 0,
      totalEmitted: 0,
      computeHandle: null,
      emitterPosition: { x: 0, y: 0, z: 0 },
      emitterVelocity: { x: 0, y: 0, z: 0 },
      burstQueue: [],
    };
    node.__gpuParticleState = state;

    // Create GPU particle system
    context.emit?.('gpu_particle_create', {
      node,
      maxParticles: config.count,
      emissionRate: config.emission_rate,
      lifetime: config.lifetime,
      lifetimeVariance: config.lifetime_variance,
      initialVelocity: config.initial_velocity,
      velocityVariance: config.velocity_variance,
      spreadAngle: config.spread_angle,
      forces: config.forces,
      colorOverLife: config.color_over_life,
      sizeOverLife: config.size_over_life,
      collision: config.collision,
      spatialHash: config.spatial_hash,
      sprite: config.sprite,
      blendMode: config.blend_mode,
    });

    state.isRunning = true;
  },

  onDetach(node, config, context) {
    const state = node.__gpuParticleState as GPUParticleState;
    if (state?.computeHandle) {
      context.emit?.('gpu_particle_destroy', { node });
    }
    delete node.__gpuParticleState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__gpuParticleState as GPUParticleState;
    if (!state || !state.isRunning) return;

    // Process burst queue
    if (state.burstQueue.length > 0) {
      const bursts = [...state.burstQueue];
      state.burstQueue = [];

      for (const burst of bursts) {
        context.emit?.('gpu_particle_burst', {
          node,
          count: burst.count,
          position: burst.position || state.emitterPosition,
        });
        state.totalEmitted += burst.count;
      }
    }

    // Emit continuous particles
    if (state.isEmitting && config.emission_rate > 0) {
      const toEmit = Math.floor(config.emission_rate * delta);
      if (toEmit > 0 && state.activeCount < config.count) {
        context.emit?.('gpu_particle_emit', {
          node,
          count: Math.min(toEmit, config.count - state.activeCount),
          position: state.emitterPosition,
          velocity: state.emitterVelocity,
        });
      }
    }

    // Update simulation
    context.emit?.('gpu_particle_step', {
      node,
      deltaTime: delta,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__gpuParticleState as GPUParticleState;
    if (!state) return;

    if (event.type === 'gpu_particle_update') {
      state.activeCount = event.activeCount as number;
    } else if (event.type === 'particle_burst') {
      const count = (event.count as number) || 100;
      const position = event.position as { x: number; y: number; z: number } | undefined;
      state.burstQueue.push({ count, position });
    } else if (event.type === 'particle_set_emitter') {
      if (event.position) {
        state.emitterPosition = event.position as typeof state.emitterPosition;
      }
      if (event.velocity) {
        state.emitterVelocity = event.velocity as typeof state.emitterVelocity;
      }
    } else if (event.type === 'particle_start') {
      state.isEmitting = true;
    } else if (event.type === 'particle_stop') {
      state.isEmitting = false;
    } else if (event.type === 'particle_pause') {
      state.isRunning = false;
    } else if (event.type === 'particle_resume') {
      state.isRunning = true;
    } else if (event.type === 'particle_clear') {
      context.emit?.('gpu_particle_clear', { node });
      state.activeCount = 0;
    } else if (event.type === 'particle_add_force') {
      const force = event.force as ParticleForce;
      context.emit?.('gpu_particle_add_force', {
        node,
        force,
      });
    } else if (event.type === 'particle_remove_force') {
      const forceIndex = event.forceIndex as number;
      context.emit?.('gpu_particle_remove_force', {
        node,
        forceIndex,
      });
    } else if (event.type === 'particle_query') {
      context.emit?.('particle_info', {
        queryId: event.queryId,
        node,
        isRunning: state.isRunning,
        isEmitting: state.isEmitting,
        activeCount: state.activeCount,
        totalEmitted: state.totalEmitted,
        maxParticles: config.count,
        emitterPosition: state.emitterPosition,
      });
    }
  },
};

export default gpuParticleHandler;
