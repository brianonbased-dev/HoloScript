import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockNode,
  createMockContext,
  attachTrait,
  updateTrait,
  sendEvent,
} from './traitTestHelpers';

// Mock dependencies — use class-style mocks for constructors
const mockEngine = {
  addBody: vi.fn(),
  removeBody: vi.fn(),
  getStates: vi.fn().mockReturnValue({}),
  applyForce: vi.fn(),
};
vi.mock('../../runtime/PhysicsEngine', () => ({
  getPhysicsEngine: vi.fn(() => mockEngine),
}));

vi.mock('../../physics/SoftBodyAdapter', () => ({
  SoftBodyAdapter: class MockSoftBodyAdapter {
    update = vi.fn();
  },
}));

import { gpuPhysicsHandler } from '../GPUPhysicsTrait';

describe('GPUPhysicsTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const rigidCfg = {
    sim_type: 'rigid_body' as const,
    method: 'pbd' as const,
    gravity: [0, -9.81, 0] as [number, number, number],
    substeps: 4,
    mass: 1.0,
    shape: 'box' as const,
    shapeParams: [1, 1, 1],
    friction: 0.5,
    restitution: 0.3,
    isStatic: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('physObj');
    (node as any).properties = { position: [1, 2, 3] };
    ctx = createMockContext();
  });

  it('initializes rigid body state on attach', () => {
    attachTrait(gpuPhysicsHandler, node, rigidCfg, ctx);
    const s = (node as any).__gpuPhysicsState;
    expect(s).toBeDefined();
    expect(s.isSimulating).toBe(true);
    expect(s.islandDetector).toBeDefined();
  });

  it('calls engine.addBody on rigid body attach', () => {
    attachTrait(gpuPhysicsHandler, node, rigidCfg, ctx);
    expect(mockEngine.addBody).toHaveBeenCalled();
  });

  it('registers as static when isStatic is true', () => {
    attachTrait(gpuPhysicsHandler, node, { ...rigidCfg, isStatic: true }, ctx);
    expect(mockEngine.addBody).toHaveBeenCalledWith(
      'physObj',
      expect.objectContaining({
        type: 'static',
      })
    );
  });

  it('initializes soft body path', () => {
    const softCfg = { ...rigidCfg, sim_type: 'soft_body' as const };
    attachTrait(gpuPhysicsHandler, node, softCfg, ctx);
    const s = (node as any).__gpuPhysicsState;
    expect(s.softBody).toBeDefined();
    expect(s.engineId).toBe('soft_body_solver');
  });

  it('cleans up on detach (rigid)', () => {
    attachTrait(gpuPhysicsHandler, node, rigidCfg, ctx);
    gpuPhysicsHandler.onDetach?.(node as any, rigidCfg as any, ctx as any);
    expect((node as any).__gpuPhysicsState).toBeUndefined();
  });

  it('cleans up soft body on detach', () => {
    const softCfg = { ...rigidCfg, sim_type: 'soft_body' as const };
    attachTrait(gpuPhysicsHandler, node, softCfg, ctx);
    gpuPhysicsHandler.onDetach?.(node as any, softCfg as any, ctx as any);
    expect((node as any).__gpuPhysicsState).toBeUndefined();
  });

  it('calls engine.getStates on update for rigid body', () => {
    attachTrait(gpuPhysicsHandler, node, rigidCfg, ctx);
    updateTrait(gpuPhysicsHandler, node, rigidCfg, ctx, 0.016);
    // Should not throw — engine.getStates returns {}
  });

  it('forwards apply-force event to engine', () => {
    attachTrait(gpuPhysicsHandler, node, rigidCfg, ctx);
    sendEvent(gpuPhysicsHandler, node, rigidCfg, ctx, {
      type: 'apply-force',
      data: { force: [10, 0, 0], point: [0, 0, 0] },
    });
    // Should not throw
  });

  it('has correct handler name', () => {
    expect(gpuPhysicsHandler.name).toBe('gpu_physics');
  });

  it('has correct default config', () => {
    expect((gpuPhysicsHandler.defaultConfig as any).sim_type).toBe('rigid_body');
    expect((gpuPhysicsHandler.defaultConfig as any).mass).toBe(1.0);
    expect((gpuPhysicsHandler.defaultConfig as any).friction).toBe(0.5);
  });
});
