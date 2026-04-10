import { describe, it, expect, vi } from 'vitest';
import { gpuPhysicsHandler } from '../traits/GPUPhysicsTrait';

// Mock PhysicsEngine so we don't crash on 'webgpu' not found
vi.mock('@holoscript/engine/runtime/PhysicsEngine', () => ({
  getPhysicsEngine: () => ({
    addBody: vi.fn(),
    removeBody: vi.fn(),
    getStates: () => ({}),
  }),
}));

describe('Soft Body Activation', () => {
  it('should activate SoftBodyAdapter when sim_type="soft_body"', () => {
    // 1. Setup Node with Vertices
    const node = {
      id: 'jelly1',
      name: 'jelly_blob',
      geometry: {
        vertices: [
          0,
          1,
          0, // Top
          0,
          0,
          0, // Bottom
        ],
        needsUpdate: false,
      },
    };

    const config = {
      sim_type: 'soft_body' as const,
      mass: 1.0,
      stiffness: 0.5,
    };
    const context = {} as any;

    // 2. Attach Trait
    gpuPhysicsHandler.onAttach!(node as any, config, context);

    const state = (node as any).__gpuPhysicsState;
    expect(state.engineId).toBe('soft_body_solver');
    expect(state.softBody).toBeDefined();

    // 3. Update (Simulate Gravity)
    // Top vertex (Y=1) should fall towards Bottom vertex (Y=0) or floor
    // But since we use PBD and standard gravity -9.81, position should change.

    gpuPhysicsHandler.onUpdate!(node as any, config, context, 0.1);

    // Verify Vertices Updated
    const newY = node.geometry.vertices[1]; // Y of first vertex
    expect(newY).toBeLessThan(1.0); // Gravity pulled it down
    expect(node.geometry.needsUpdate).toBe(true);
  });

  it('should default to rigid body otherwise', () => {
    const node = { name: 'rock', geometry: { vertices: [] } };
    const config = { sim_type: 'rigid_body' as const };
    const context = {} as any;

    gpuPhysicsHandler.onAttach!(node as any, config, context);

    const state = (node as any).__gpuPhysicsState;
    expect(state.engineId).toBe('webgpu');
    expect(state.softBody).toBeUndefined();
  });
});
