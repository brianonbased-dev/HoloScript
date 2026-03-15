/**
 * Fluid Trait
 *
 * Fluid dynamics simulation using SPH or grid-based methods.
 * Supports splash effects, viscosity, and surface rendering.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type SimulationMethod = 'sph' | 'flip' | 'pic' | 'pbf';
type RenderMode = 'particles' | 'mesh' | 'marching_cubes' | 'splatting';

interface FluidState {
  isSimulating: boolean;
  particleCount: number;
  volume: number;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  simulationHandle: unknown;
  emitters: Map<
    string,
    {
      position: { x: number; y: number; z: number };
      rate: number;
      velocity: { x: number; y: number; z: number };
    }
  >;
}

interface FluidConfig {
  method: SimulationMethod;
  particle_count: number;
  viscosity: number; // Pa·s
  surface_tension: number; // N/m
  density: number; // kg/m³
  gravity: [number, number, number];
  render_mode: RenderMode;
  kernel_radius: number;
  time_step: number;
  collision_damping: number;
  rest_density: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const fluidHandler: TraitHandler<FluidConfig> = {
  name: 'fluid',

  defaultConfig: {
    method: 'sph',
    particle_count: 10000,
    viscosity: 0.01,
    surface_tension: 0.07,
    density: 1000,
    gravity: [0, -9.81, 0],
    render_mode: 'particles',
    kernel_radius: 0.04,
    time_step: 0.001,
    collision_damping: 0.3,
    rest_density: 1000,
  },

  onAttach(node, config, context) {
    const state: FluidState = {
      isSimulating: false,
      particleCount: 0,
      volume: 0,
      boundingBox: {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
      },
      simulationHandle: null,
      emitters: new Map(),
    };
    (node as any).__fluidState = state;

    // Create fluid simulation
    context.emit?.('fluid_create', {
      node,
      method: config.method,
      maxParticles: config.particle_count,
      viscosity: config.viscosity,
      surfaceTension: config.surface_tension,
      density: config.density,
      gravity: config.gravity,
      kernelRadius: config.kernel_radius,
      timeStep: config.time_step,
    });

    state.isSimulating = true;
  },

  onDetach(node, config, context) {
    const state = (node as any).__fluidState as FluidState;
    if (state?.isSimulating) {
      context.emit?.('fluid_destroy', { node });
    }
    delete (node as any).__fluidState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__fluidState as FluidState;
    if (!state || !state.isSimulating) return;

    // Process emitters
    for (const [emitterId, emitter] of state.emitters) {
      const particlesToEmit = Math.floor(emitter.rate * delta);

      if (particlesToEmit > 0 && state.particleCount < config.particle_count) {
        context.emit?.('fluid_emit_particles', {
          node,
          emitterId,
          count: Math.min(particlesToEmit, config.particle_count - state.particleCount),
          position: emitter.position,
          velocity: emitter.velocity,
        });
      }
    }

    // Step simulation
    context.emit?.('fluid_step', {
      node,
      deltaTime: delta,
    });
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__fluidState as FluidState;
    if (!state) return;

    if (event.type === 'fluid_particle_update') {
      state.particleCount = event.particleCount as number;
      state.volume = (event.volume as number) || 0;
      state.boundingBox = (event.boundingBox as typeof state.boundingBox) || state.boundingBox;

      // Update rendering
      context.emit?.('fluid_render_update', {
        node,
        particlePositions: event.positions,
        particleVelocities: event.velocities,
        mode: config.render_mode,
      });
    } else if (event.type === 'fluid_add_emitter') {
      const emitterId = (event.emitterId as string) || `emitter_${state.emitters.size}`;

      state.emitters.set(emitterId, {
        position: (event.position as { x: number; y: number; z: number }) || { x: 0, y: 0, z: 0 },
        rate: (event.rate as number) || 100,
        velocity: (event.velocity as { x: number; y: number; z: number }) || { x: 0, y: -1, z: 0 },
      });
    } else if (event.type === 'fluid_remove_emitter') {
      const emitterId = event.emitterId as string;
      state.emitters.delete(emitterId);
    } else if (event.type === 'fluid_add_particles') {
      const positions = event.positions as Array<{ x: number; y: number; z: number }>;
      const velocities = (event.velocities as Array<{ x: number; y: number; z: number }>) || [];

      context.emit?.('fluid_spawn_particles', {
        node,
        positions,
        velocities,
      });
    } else if (event.type === 'fluid_splash') {
      const position = event.position as { x: number; y: number; z: number };
      const force = (event.force as number) || 10;
      const radius = (event.radius as number) || 0.5;

      context.emit?.('fluid_apply_impulse', {
        node,
        position,
        force,
        radius,
      });

      context.emit?.('on_fluid_splash', {
        node,
        position,
        force,
      });
    } else if (event.type === 'fluid_set_bounds') {
      state.boundingBox = {
        min: event.min as typeof state.boundingBox.min,
        max: event.max as typeof state.boundingBox.max,
      };

      context.emit?.('fluid_update_bounds', {
        node,
        bounds: state.boundingBox,
      });
    } else if (event.type === 'fluid_pause') {
      state.isSimulating = false;
    } else if (event.type === 'fluid_resume') {
      state.isSimulating = true;
    } else if (event.type === 'fluid_reset') {
      state.particleCount = 0;
      state.volume = 0;
      state.emitters.clear();

      context.emit?.('fluid_clear', { node });
    } else if (event.type === 'fluid_set_viscosity') {
      context.emit?.('fluid_update_params', {
        node,
        viscosity: event.viscosity as number,
      });
    } else if (event.type === 'fluid_query') {
      context.emit?.('fluid_info', {
        queryId: event.queryId,
        node,
        isSimulating: state.isSimulating,
        particleCount: state.particleCount,
        volume: state.volume,
        emitterCount: state.emitters.size,
        boundingBox: state.boundingBox,
      });
    }
  },
};

export default fluidHandler;
