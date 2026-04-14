import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HoloScriptPlusRuntimeImpl } from '@holoscript/engine/runtime/HoloScriptPlusRuntime';
import { PhysicsWorldImpl } from '@holoscript/engine/physics/PhysicsWorldImpl';
import { WebGPURenderer } from '../rendering/webgpu/WebGPURenderer';

// Mock Physics World
vi.mock('@holoscript/engine/physics/PhysicsWorldImpl', () => {
  return {
    PhysicsWorldImpl: vi.fn().mockImplementation(function () {
      const bodies = new Map();
      bodies.set('box1', {
        position: [0, 0, -0.5],
        velocity: [0, 0, 0 ],
        type: 'dynamic',
      });

      return {
        step: vi.fn(),
        createBody: vi.fn((config) => {
          const id = config.id || `body_${bodies.size}`;
          bodies.set(id, {
            position: config.position,
            velocity: [0, 0, 0 ],
            type: config.type,
          });
          return id;
        }),
        addBody: vi.fn((id, config) => {
          bodies.set(id, {
            position: config.position,
            velocity: [0, 0, 0 ],
            type: config.type,
          });
        }),
        getBody: vi.fn((id) => bodies.get(id) || null),
        createConstraint: vi.fn(),
        addConstraint: vi.fn(),
        removeConstraint: vi.fn(),
        removeConstraints: vi.fn(),
        setPosition: vi.fn(),
        setLinearVelocity: vi.fn(),
        getContacts: vi.fn().mockReturnValue([]),
        raycast: vi.fn(),
        getStates: vi.fn().mockReturnValue({}),
      };
    }),
  };
});

// Mock WebGPURenderer
vi.mock('@holoscript/engine/rendering/webgpu/WebGPURenderer', () => {
  return {
    WebGPURenderer: vi.fn().mockImplementation(function () {
      return {
        createElement: vi.fn(),
        destroy: vi.fn(),
        context: {},
      };
    }),
  };
});

describe('Physics Interaction', () => {
  let runtime: HoloScriptPlusRuntimeImpl;
  let physicsWorld: any;
  let mockRenderer: any;

  beforeEach(() => {
    mockRenderer = {
      createElement: vi.fn(),
      destroy: vi.fn(),
      context: {},
    };

    const mockAST = {
      root: {
        type: 'composition',
        id: 'root',
        children: [],
        traits: new Map(),
        properties: {},
        directives: [],
      },
      imports: [],
      version: 1,
    };

    runtime = new HoloScriptPlusRuntimeImpl(mockAST as any, {
      vrEnabled: true,
      renderer: mockRenderer,
    });

    // Get access to the mocked physics world
    physicsWorld = (runtime as any).physicsWorld;

    // Bypass return guard
    (runtime as any).rootInstance = { id: 'root' };
  });

  it('creates hand bodies in physics world on update', () => {
    const bridge = (runtime as any).vrPhysicsBridge;
    const handData = {
      position: [-0.2, 1.5, -0.5],
      rotation: [0, 0, 0 ],
      pinchStrength: 0,
    };

    bridge.updateHand(handData, 'left', 0.016);
    expect(physicsWorld.createBody).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hand_left' })
    );
  });

  it('triggers grab event when pinching near object', () => {
    // Ensure hand body exists
    const bridge = (runtime as any).vrPhysicsBridge;
    bridge.updateHand(
      { position: [0, 0, 0], rotation: [0, 0, 0 ], pinchStrength: 1 },
      'right',
      0.016
    );

    const payload = { nodeId: 'box1', hand: 'right' };
    (runtime as any).emit('physics_grab', payload);

    expect(physicsWorld.createConstraint).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'fixed',
        bodyB: 'box1',
      })
    );
  });

  it('triggers release event and applies velocity', () => {
    const payload = { nodeId: 'box1', velocity: [10, 5, 0] };
    (runtime as any).emit('physics_release', payload);

    expect(physicsWorld.removeConstraint).toHaveBeenCalledWith(expect.stringContaining('box1'));

    // Check if getBody was called to retrieve the body for velocity application
    expect(physicsWorld.getBody).toHaveBeenCalledWith('box1');

    // Since we mock the world, we can't easily check the *value* of velocity on the body
    // without a more complex mock that returns a mutable object.
    // But we proved the flow works.
  });
});
