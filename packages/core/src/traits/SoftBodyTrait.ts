/**
 * SoftBody Trait
 *
 * Deformable body physics for squishy objects.
 * Supports pressure simulation, volume conservation, and mesh deformation.
 *
 * @version 2.0.0
 */

import type { TraitHandler, HSPlusNode } from './TraitTypes';
import { SoftBodySolver, type Particle, type DistanceConstraint } from '../physics/SoftBodySolver';

// =============================================================================
// TYPES
// =============================================================================

interface SoftBodyVertex {
  position: { x: number; y: number; z: number };
  restPosition: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

interface SoftBodyState {
  isSimulating: boolean;
  isDeformed: boolean;
  deformationAmount: number;
  vertices: SoftBodyVertex[];
  currentVolume: number;
  restVolume: number;
  centerOfMass: { x: number; y: number; z: number };
  solver: SoftBodySolver | null;
}

interface SoftBodyConfig {
  stiffness: number; // 0-1
  damping: number;
  mass: number;
  pressure: number; // Internal pressure
  volume_conservation: number; // 0-1
  collision_margin: number;
  solver_iterations: number;
  tetrahedral: boolean; // Use tetrahedral mesh
  surface_stiffness: number;
  bending_stiffness: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Automatically creates PBD particles and constraints from mesh data
 */
function autoPopulateFromMesh(
  node: HSPlusNode,
  config: SoftBodyConfig
): { particles: Particle[]; constraints: DistanceConstraint[] } {
  const meshData = node.properties?.meshData;

  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  if (!meshData || !meshData.positions || !meshData.indices) {
    // Fallback to simple line segment for entities without mesh data
    return {
      particles: [
        { position: [0, 0, 0], previousPosition: [0, 0, 0], velocity: [0, 0, 0], invMass: 1.0 },
        { position: [0, 1, 0], previousPosition: [0, 1, 0], velocity: [0, 0, 0], invMass: 1.0 },
      ],
      constraints: [{ p1: 0, p2: 1, restLength: 1.0, stiffness: config.stiffness }],
    };
  }

  const particles: Particle[] = [];
  const constraints: DistanceConstraint[] = [];
  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  const positions = meshData.positions;
  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  const indices = meshData.indices;

  // Create particles from vertices
  for (let i = 0; i < positions.length; i += 3) {
    particles.push({
      position: [positions[i], positions[i + 1], positions[i + 2]],
      previousPosition: [positions[i], positions[i + 1], positions[i + 2]],
      velocity: [0, 0, 0],
      invMass: config.mass > 0 ? 1.0 / (config.mass / (positions.length / 3)) : 0,
    });
  }

  // Create distance constraints from triangle edges
  const edgeSet = new Set<string>();
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    const edges = [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ];

    for (const [a, b] of edges) {
      if (a === undefined || b === undefined || !particles[a] || !particles[b]) continue;

      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        const pA = particles[a].position;
        const pB = particles[b].position;
        const dist = Math.sqrt(
          Math.pow(pA[0] - pB[0], 2) + Math.pow(pA[1] - pB[1], 2) + Math.pow(pA[2] - pB[2], 2)
        );
        constraints.push({ p1: a, p2: b, restLength: dist, stiffness: config.stiffness });
      }
    }
  }

  return { particles, constraints };
}

// =============================================================================
// HANDLER
// =============================================================================

export const softBodyHandler: TraitHandler<SoftBodyConfig> = {
  name: 'soft_body',

  defaultConfig: {
    stiffness: 0.5,
    damping: 0.05,
    mass: 1.0,
    pressure: 1.0,
    volume_conservation: 0.9,
    collision_margin: 0.01,
    solver_iterations: 10,
    tetrahedral: false,
    surface_stiffness: 0.5,
    bending_stiffness: 0.3,
  },

  onAttach(node, config, context) {
    const state: SoftBodyState = {
      isSimulating: false,
      isDeformed: false,
      deformationAmount: 0,
      vertices: [],
      currentVolume: 1,
      restVolume: 1,
      centerOfMass: { x: 0, y: 0, z: 0 },
      solver: null,
    };
    node.__softBodyState = state;

    // Build solver particles from mesh data
    const { particles, constraints } = autoPopulateFromMesh(node, config);
    state.solver = new SoftBodySolver(particles, constraints);
    state.isSimulating = true;

    // Set rest volume if available
    state.restVolume = (node.properties?.meshData as any)?.volume || 1.0;
  },

  onDetach(node, config, context) {
    const state = node.__softBodyState as SoftBodyState;
    if (state?.isSimulating) {
      context.emit?.('soft_body_destroy', { node });
    }
    delete node.__softBodyState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__softBodyState as SoftBodyState;
    if (!state || !state.isSimulating) return;

    // Step simulation
    if (state.solver) {
      state.solver.step(delta);
      const particles = state.solver.getParticles();

      // Sync back to internal vertex state
      state.vertices = particles.map((p) => ({
        position: { x: p.position[0], y: p.position[1], z: p.position[2] },
        restPosition: {
          x: p.previousPosition[0],
          y: p.previousPosition[1],
          z: p.previousPosition[2],
        },
        velocity: { x: p.velocity[0], y: p.velocity[1], z: p.velocity[2] },
        normal: { x: 0, y: 1, z: 0 },
      }));
    }

    // Volume conservation pressure
    if (config.volume_conservation > 0 && state.restVolume > 0) {
      const volumeRatio = state.currentVolume / state.restVolume;
      const pressureCorrection = (1 - volumeRatio) * config.volume_conservation * config.pressure;

      if (Math.abs(pressureCorrection) > 0.01) {
        context.emit?.('soft_body_apply_pressure', {
          node,
          pressure: pressureCorrection,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__softBodyState as SoftBodyState;
    if (!state) return;

    if (event.type === 'soft_body_vertex_update') {
      const positions = event.positions as Array<{ x: number; y: number; z: number }>;
      const normals = (event.normals as Array<{ x: number; y: number; z: number }>) || [];

      // Update vertices
      for (let i = 0; i < positions.length; i++) {
        if (!state.vertices[i]) {
          state.vertices[i] = {
            position: positions[i],
            restPosition: { ...positions[i] },
            velocity: { x: 0, y: 0, z: 0 },
            normal: normals[i] || { x: 0, y: 1, z: 0 },
          };
        } else {
          state.vertices[i].position = positions[i];
          if (normals[i]) {
            state.vertices[i].normal = normals[i];
          }
        }
      }

      // Calculate deformation
      let totalDeform = 0;
      for (const vert of state.vertices) {
        const dx = vert.position.x - vert.restPosition.x;
        const dy = vert.position.y - vert.restPosition.y;
        const dz = vert.position.z - vert.restPosition.z;
        totalDeform += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      state.deformationAmount = state.vertices.length > 0 ? totalDeform / state.vertices.length : 0;
      state.isDeformed = state.deformationAmount > 0.01;

      state.currentVolume = (event.volume as number) || state.currentVolume;
      state.centerOfMass = (event.centerOfMass as typeof state.centerOfMass) || state.centerOfMass;

      // Update mesh
      context.emit?.('soft_body_mesh_update', {
        node,
        vertices: state.vertices.map((v) => v.position),
        normals: state.vertices.map((v) => v.normal),
      });

      if (state.isDeformed) {
        context.emit?.('on_soft_body_deform', {
          node,
          deformationAmount: state.deformationAmount,
        });
      }
    } else if (event.type === 'soft_body_apply_force') {
      const force = event.force as { x: number; y: number; z: number };
      const position = event.position as { x: number; y: number; z: number } | undefined;
      const radius = (event.radius as number) || 0.1;

      context.emit?.('soft_body_external_force', {
        node,
        force,
        position,
        radius,
      });
    } else if (event.type === 'soft_body_poke') {
      const position = event.position as { x: number; y: number; z: number };
      const force = (event.force as number) || 10;
      const direction = (event.direction as { x: number; y: number; z: number }) || {
        x: 0,
        y: -1,
        z: 0,
      };

      context.emit?.('soft_body_impulse', {
        node,
        position,
        force: {
          x: direction.x * force,
          y: direction.y * force,
          z: direction.z * force,
        },
      });
    } else if (event.type === 'soft_body_set_anchor') {
      const vertexIndex = event.vertexIndex as number;
      const targetPosition = event.targetPosition as
        | { x: number; y: number; z: number }
        | undefined;

      context.emit?.('soft_body_anchor_vertex', {
        node,
        vertexIndex,
        targetPosition,
      });
    } else if (event.type === 'soft_body_release_anchor') {
      const vertexIndex = event.vertexIndex as number;

      context.emit?.('soft_body_unanchor_vertex', {
        node,
        vertexIndex,
      });
    } else if (event.type === 'soft_body_grab_start') {
      // Grab interaction: find closest vertices and create compliant attachments
      const handId = (event.handId as string) || 'default';
      const handPosition = event.handPosition as { x: number; y: number; z: number };
      const grabRadius = (event.grabRadius as number) || 0.15;

      context.emit?.('soft_body_grab_begin', {
        node,
        handId,
        handPosition,
        grabRadius,
      });
    } else if (event.type === 'soft_body_grab_update') {
      // Update grab target as hand moves
      const handId = (event.handId as string) || 'default';
      const handPosition = event.handPosition as { x: number; y: number; z: number };

      context.emit?.('soft_body_grab_move', {
        node,
        handId,
        handPosition,
      });
    } else if (event.type === 'soft_body_grab_end') {
      // Release grab
      const handId = (event.handId as string) || 'default';

      context.emit?.('soft_body_grab_release', {
        node,
        handId,
      });
    } else if (event.type === 'soft_body_reset') {
      // Reset to rest shape
      for (const vert of state.vertices) {
        vert.position = { ...vert.restPosition };
        vert.velocity = { x: 0, y: 0, z: 0 };
      }
      state.isDeformed = false;
      state.deformationAmount = 0;
      state.currentVolume = state.restVolume;

      context.emit?.('soft_body_reset_shape', { node });
    } else if (event.type === 'soft_body_pause') {
      state.isSimulating = false;
    } else if (event.type === 'soft_body_resume') {
      state.isSimulating = true;
    } else if (event.type === 'soft_body_query') {
      context.emit?.('soft_body_info', {
        queryId: event.queryId,
        node,
        isSimulating: state.isSimulating,
        isDeformed: state.isDeformed,
        deformationAmount: state.deformationAmount,
        vertexCount: state.vertices.length,
        currentVolume: state.currentVolume,
        volumeRatio: state.restVolume > 0 ? state.currentVolume / state.restVolume : 1,
        centerOfMass: state.centerOfMass,
      });
    }
  },
};

export default softBodyHandler;
