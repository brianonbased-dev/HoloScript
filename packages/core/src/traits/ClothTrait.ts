/**
 * Cloth Trait
 *
 * Cloth simulation using position-based dynamics or Verlet integration.
 * Supports wind, gravity, collision, tearing, and pinning.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface ClothVertex {
  position: [number, number, number];
  prevPosition: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  isPinned: boolean;
  mass: number;
}

interface ClothState {
  isSimulating: boolean;
  isTorn: boolean;
  vertices: ClothVertex[][];
  constraints: Array<{
    a: [number, number];
    b: [number, number];
    restLength: number;
    broken: boolean;
  }>;
  windForce: { x: number; y: number; z: number };
  simulationHandle: unknown;
}

interface ClothConfig {
  resolution: number; // Grid resolution NxN
  stiffness: number; // 0-1
  damping: number;
  mass: number;
  gravity_scale: number;
  wind_response: number;
  collision_margin: number;
  self_collision: boolean;
  tearable: boolean;
  tear_threshold: number;
  pin_vertices: Array<[number, number]>; // Grid coordinates to pin
}

// =============================================================================
// HANDLER
// =============================================================================

export const clothHandler: TraitHandler<ClothConfig> = {
  name: 'cloth',

  defaultConfig: {
    resolution: 32,
    stiffness: 0.8,
    damping: 0.01,
    mass: 1.0,
    gravity_scale: 1.0,
    wind_response: 0.5,
    collision_margin: 0.01,
    self_collision: false,
    tearable: false,
    tear_threshold: 100,
    pin_vertices: [],
  },

  onAttach(node, config, context) {
    const state: ClothState = {
      isSimulating: false,
      isTorn: false,
      vertices: [],
      constraints: [],
      windForce: { x: 0, y: 0, z: 0 },
      simulationHandle: null,
    };
    node.__clothState = state;

    // Initialize cloth mesh
    initializeClothMesh(state, config);

    // Register with physics system
    context.emit?.('cloth_create', {
      node,
      resolution: config.resolution,
      stiffness: config.stiffness,
      damping: config.damping,
      mass: config.mass,
      gravityScale: config.gravity_scale,
      selfCollision: config.self_collision,
      collisionMargin: config.collision_margin,
    });

    state.isSimulating = true;
  },

  onDetach(node, config, context) {
    const state = node.__clothState as ClothState;
    if (state?.isSimulating) {
      context.emit?.('cloth_destroy', { node });
    }
    delete node.__clothState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__clothState as ClothState;
    if (!state || !state.isSimulating) return;

    // Apply wind force
    if (config.wind_response > 0) {
      context.emit?.('cloth_apply_force', {
        node,
        force: {
          x: state.windForce.x * config.wind_response,
          y: state.windForce.y * config.wind_response,
          z: state.windForce.z * config.wind_response,
        },
      });
    }

    // Update simulation
    context.emit?.('cloth_step', {
      node,
      deltaTime: delta,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__clothState as ClothState;
    if (!state) return;

    if (event.type === 'cloth_vertex_update') {
      // Update vertex positions from physics
      const positions = event.positions as Array<{ x: number; y: number; z: number }>;
      const res = config.resolution;

      for (let i = 0; i < res && i < positions.length / res; i++) {
        for (let j = 0; j < res; j++) {
          const idx = i * res + j;
          if (idx < positions.length && state.vertices[i]?.[j]) {
            state.vertices[i][j].position = positions[idx];
          }
        }
      }

      // Update mesh
      context.emit?.('cloth_mesh_update', {
        node,
        vertices: state.vertices,
      });
    } else if (event.type === 'wind_update') {
      state.windForce = event.direction as typeof state.windForce;
    } else if (event.type === 'cloth_apply_force') {
      const force = event.force as { x: number; y: number; z: number };
      const position = event.position as { x: number; y: number; z: number } | undefined;

      context.emit?.('cloth_external_force', {
        node,
        force,
        position,
        radius: (event.radius as number) || 0.5,
      });
    } else if (event.type === 'cloth_pin_vertex') {
      const x = event.x as number;
      const y = event.y as number;

      if (state.vertices[x]?.[y]) {
        state.vertices[x][y].isPinned = true;

        context.emit?.('cloth_update_pin', {
          node,
          vertex: [x, y],
          pinned: true,
        });
      }
    } else if (event.type === 'cloth_unpin_vertex') {
      const x = event.x as number;
      const y = event.y as number;

      if (state.vertices[x]?.[y]) {
        state.vertices[x][y].isPinned = false;

        context.emit?.('cloth_update_pin', {
          node,
          vertex: [x, y],
          pinned: false,
        });
      }
    } else if (event.type === 'cloth_constraint_break') {
      if (config.tearable) {
        const constraintIdx = event.constraintIndex as number;
        if (state.constraints[constraintIdx]) {
          state.constraints[constraintIdx].broken = true;
          state.isTorn = true;

          context.emit?.('on_cloth_tear', {
            node,
            constraintIndex: constraintIdx,
          });
        }
      }
    } else if (event.type === 'cloth_reset') {
      initializeClothMesh(state, config);
      state.isTorn = false;

      context.emit?.('cloth_reinitialize', {
        node,
        vertices: state.vertices,
        constraints: state.constraints,
      });
    } else if (event.type === 'cloth_pause') {
      state.isSimulating = false;
    } else if (event.type === 'cloth_resume') {
      state.isSimulating = true;
    } else if (event.type === 'cloth_query') {
      context.emit?.('cloth_info', {
        queryId: event.queryId,
        node,
        isSimulating: state.isSimulating,
        isTorn: state.isTorn,
        vertexCount: config.resolution * config.resolution,
        constraintCount: state.constraints.length,
        brokenConstraints: state.constraints.filter((c) => c.broken).length,
      });
    }
  },
};

function initializeClothMesh(state: ClothState, config: ClothConfig): void {
  const res = config.resolution;
  state.vertices = [];
  state.constraints = [];

  // Create vertex grid
  for (let i = 0; i < res; i++) {
    state.vertices[i] = [];
    for (let j = 0; j < res; j++) {
      const isPinned = config.pin_vertices.some(([px, py]) => px === i && py === j);

      state.vertices[i][j] = {
        position: [j / res, 0, i / res],
        prevPosition: { x: j / res, y: 0, z: i / res },
        velocity: { x: 0, y: 0, z: 0 },
        isPinned,
        mass: config.mass / (res * res),
      };
    }
  }

  // Create structural constraints
  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      // Horizontal
      if (j < res - 1) {
        state.constraints.push({
          a: [i, j],
          b: [i, j + 1],
          restLength: 1 / res,
          broken: false,
        });
      }
      // Vertical
      if (i < res - 1) {
        state.constraints.push({
          a: [i, j],
          b: [i + 1, j],
          restLength: 1 / res,
          broken: false,
        });
      }
    }
  }
}

export default clothHandler;
