/**
 * Fluid Trait
 *
 * Fluid dynamics simulation using MLS-MPM (GPU) or SPH (CPU fallback).
 * Supports splash effects, viscosity, and screen-space fluid rendering (SSFR).
 *
 * GPU backend: MLS-MPM via WebGPU compute shaders (100K+ particles)
 * CPU fallback: SPH via FluidSim.ts (~500 particles)
 *
 * Reads wind from @weather blackboard when present.
 *
 * @version 3.0.0
 */

import type { TraitHandler } from './TraitTypes';
import { MLSMPMFluid } from '../physics/MLSMPMFluid';
import { weatherBlackboard } from '../environment/WeatherBlackboard';

// =============================================================================
// TYPES
// =============================================================================

type SimulationMethod = 'mls_mpm' | 'sph' | 'flip' | 'pic' | 'pbf';
type RenderMode = 'ssfr' | 'particles' | 'mesh' | 'marching_cubes' | 'splatting';

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
  /** MLS-MPM GPU simulation instance (null if using CPU fallback) */
  mlsMpm: MLSMPMFluid | null;
  /** Whether GPU init has completed */
  gpuReady: boolean;
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
  /** MLS-MPM grid resolution (default: 128) */
  grid_resolution: number;
  /** SSFR render resolution scale (default: 0.5 = half-res) */
  resolution_scale: number;
  /** MLS-MPM bulk modulus / compressibility (default: 50) */
  bulk_modulus: number;
  /** Domain size in world units (default: 10) */
  domain_size: number;
  /** How much @weather wind affects fluid surface (default: 1.0) */
  wind_sensitivity: number;
  /** SSFR absorption color [R, G, B] */
  absorption_color: [number, number, number];
  /** SSFR absorption strength */
  absorption_strength: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const fluidHandler: TraitHandler<FluidConfig> = {
  name: 'fluid',

  defaultConfig: {
    method: 'mls_mpm',
    particle_count: 50000,
    viscosity: 0.01,
    surface_tension: 0.07,
    density: 1000,
    gravity: [0, -9.81, 0],
    render_mode: 'ssfr',
    kernel_radius: 0.04,
    time_step: 0.001,
    collision_damping: 0.3,
    rest_density: 1000,
    grid_resolution: 128,
    resolution_scale: 0.5,
    bulk_modulus: 50,
    domain_size: 10,
    wind_sensitivity: 1.0,
    absorption_color: [0.4, 0.04, 0.0],
    absorption_strength: 2.0,
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
      mlsMpm: null,
      gpuReady: false,
    };
    node.__fluidState = state;

    // Try GPU MLS-MPM backend first, fall back to event-based SPH
    if (config.method === 'mls_mpm' && (context as any).gpuDevice) {
      const sim = new MLSMPMFluid({
        type: 'liquid',
        particleCount: config.particle_count,
        viscosity: config.viscosity,
        gridResolution: config.grid_resolution,
        resolutionScale: config.resolution_scale,
        restDensity: config.rest_density,
        bulkModulus: config.bulk_modulus,
        domainSize: config.domain_size,
        particleRadius: config.kernel_radius,
        gravity: config.gravity[1],
        absorptionColor: config.absorption_color,
        absorptionStrength: config.absorption_strength,
      });
      state.mlsMpm = sim;

      sim.init((context as any).gpuDevice).then(() => {
        state.gpuReady = true;
        state.particleCount = config.particle_count;
        // Generate default particle block in lower half of domain
        const ds = config.domain_size;
        sim.generateParticleBlock(
          [ds * 0.2, ds * 0.2, ds * 0.2],
          [ds * 0.8, ds * 0.5, ds * 0.8],
        );
      });
    } else {
      // CPU fallback: use existing event-based SPH pipeline
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
    }

    state.isSimulating = true;
  },

  onDetach(node, _config, context) {
    const state = node.__fluidState as FluidState;
    if (state) {
      // Dispose GPU resources if using MLS-MPM
      if (state.mlsMpm) {
        state.mlsMpm.dispose();
      }
      if (state.isSimulating && !state.mlsMpm) {
        // CPU fallback cleanup via events
        context.emit?.('fluid_destroy', { node });
      }
    }
    delete node.__fluidState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__fluidState as FluidState;
    if (!state || !state.isSimulating) return;

    // GPU path: MLS-MPM
    if (state.mlsMpm && state.gpuReady) {
      // Apply wind from @weather blackboard as external force on the MLS-MPM grid
      if (config.wind_sensitivity > 0 && weatherBlackboard.wind_speed > 0) {
        const s = config.wind_sensitivity;
        const windDir = weatherBlackboard.wind_direction ?? { x: 0, y: 0, z: 0 };
        const windSpeed = weatherBlackboard.wind_speed;
        state.mlsMpm.setExternalForce(
          windDir.x * windSpeed * s,
          windDir.y * windSpeed * s,
          windDir.z * windSpeed * s,
        );
      } else if (state.mlsMpm) {
        state.mlsMpm.setExternalForce(0, 0, 0);
      }

      state.mlsMpm.step(delta);
      return;
    }

    // CPU fallback path: event-based SPH
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

    // Step CPU simulation
    context.emit?.('fluid_step', {
      node,
      deltaTime: delta,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__fluidState as FluidState;
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
