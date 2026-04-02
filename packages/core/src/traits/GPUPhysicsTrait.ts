import type { TraitHandler, HSPlusNode } from './TraitTypes';
import { getPhysicsEngine } from '../runtime/PhysicsEngine';
import { IslandDetector } from '../physics/IslandDetector';
import { SoftBodyAdapter } from '../physics/SoftBodyAdapter';

function extractPosition(node: HSPlusNode): [number, number, number] {
  const pos = node?.properties?.position ?? node?.position;
  if (Array.isArray(pos) && pos.length >= 3) {
    return [pos[0], pos[1], pos[2]];
  }
  if (pos && typeof pos === 'object' && 'x' in pos) {
    return [pos.x, pos.y, pos.z];
  }
  return [0, 0, 0];
}

/**
 * GPUPhysics Trait
 *
 * GPU-side physics simulation bridge.
 * Uses the PhysicsEngine @builtin to offload simulation to GPU.
 */

export interface GPUPhysicsConfig {
  sim_type?: 'particles' | 'rigid_body' | 'soft_body';
  method?: 'pbd' | 'xpbd' | 'impulse';
  gravity?: [number, number, number];
  substeps?: number;
  mass?: number;
  shape?: 'box' | 'sphere' | 'capsule' | 'mesh';
  shapeParams?: number[];
  friction?: number;
  restitution?: number;
  isStatic?: boolean;
}

interface InternalState {
  engineId: string;
  isSimulating: boolean;
  lastPosition: [number, number, number];
  islandDetector: IslandDetector;
  softBody?: SoftBodyAdapter;
}

export const gpuPhysicsHandler: TraitHandler<GPUPhysicsConfig> = {
  name: 'gpu_physics',

  defaultConfig: {
    sim_type: 'rigid_body',
    method: 'pbd',
    gravity: [0, -9.81, 0],
    substeps: 4,
    mass: 1.0,
    shape: 'box',
    shapeParams: [1, 1, 1],
    friction: 0.5,
    restitution: 0.3,
    isStatic: false,
  },

  onAttach(node, config, _context) {
    // 1. Check for Soft Body
    if (config.sim_type === 'soft_body') {
      const softBody = new SoftBodyAdapter(node, config);
      node.__gpuPhysicsState = {
        engineId: 'soft_body_solver',
        isSimulating: true,
        lastPosition: extractPosition(node),
        islandDetector: new IslandDetector(),
        softBody,
      };
      return;
    }

    // 2. Default Rigid Body Logic
    const engine = getPhysicsEngine('webgpu') || getPhysicsEngine('default');
    if (!engine) {
      console.warn('No GPU PhysicsEngine found. Physics will be disabled for', node.name);
      return;
    }

    const state: InternalState = {
      engineId: 'webgpu', // Fallback or from config
      isSimulating: true,
      lastPosition: [0, 0, 0],
      islandDetector: new IslandDetector(),
    };
    node.__gpuPhysicsState = state;

    // Register body in GPU engine
    engine?.addBody(node.name || '', {
      type: config.isStatic ? 'static' : 'dynamic',
      mass: config.mass ?? 1.0,
      position: extractPosition(node),
      rotation: [0, 0, 0, 1],
      shape: config.shape ?? 'box',
      shapeParams: config.shapeParams ?? [1, 1, 1],
      friction: config.friction,
      restitution: config.restitution,
    });
  },

  onDetach(node) {
    const state = node.__gpuPhysicsState as InternalState;
    if (state) {
      if (state.softBody) {
        // Dispose soft body resources if any
      } else {
        const engine = getPhysicsEngine(state.engineId);
        engine?.removeBody(node.name || '');
      }
      delete node.__gpuPhysicsState;
    }
  },

  onUpdate(node, _config, _context, _delta) {
    const state = node.__gpuPhysicsState as InternalState;
    if (!state || !state.isSimulating) return;

    // 1. Soft Body Update
    if (state.softBody) {
      state.softBody.update(_delta);
      return;
    }

    // 2. Rigid Body Sync
    const engine = getPhysicsEngine(state.engineId);
    if (!engine) return;

    // The actual step happens globally in the runtime,
    // here we just sync state back to the node if needed or apply per-node forces.
    const states = engine.getStates();
    const bodyState = states[node.name || ''];

    if (bodyState && !bodyState.isSleeping) {
      // Sync GPU position/rotation back to the node
      // This allows HoloScript code and animations to track the physics
      node.position = bodyState.position as any;
      node.rotation = bodyState.rotation as any;
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__gpuPhysicsState as InternalState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    if (eventType === 'apply-force') {
      if (state.softBody) {
        // Forward force to soft body (Implementation pending in adapter)
      } else {
        const engine = getPhysicsEngine(state.engineId || 'webgpu');
        engine?.applyForce(
          node.name || '',
          (event as any).data?.force,
          (event as any).data?.point
        );
      }
    }
  },
};

export default gpuPhysicsHandler;
