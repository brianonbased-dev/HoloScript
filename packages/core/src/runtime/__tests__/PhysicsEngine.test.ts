/**
 * PhysicsEngine Tests
 *
 * Tests the PhysicsEngine registry functions and interface contracts:
 * - registerPhysicsEngine / getPhysicsEngine
 * - physicsEngineRegistry Map behavior
 * - Mock engine creation and method validation
 * - Edge cases (overwrite, missing, dispose)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  physicsEngineRegistry,
  registerPhysicsEngine,
  getPhysicsEngine,
} from '../PhysicsEngine';
import type { PhysicsEngine, PhysicsConfig, BodyProps, BodyState } from '../PhysicsEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPhysicsEngine(overrides?: Partial<PhysicsEngine>): PhysicsEngine {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    addBody: vi.fn(),
    removeBody: vi.fn(),
    updateBody: vi.fn(),
    applyForce: vi.fn(),
    step: vi.fn(),
    getStates: vi.fn().mockReturnValue({}),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createDefaultConfig(): PhysicsConfig {
  return {
    backend: 'test',
    gravity: [0, -9.81, 0],
  };
}

function createDefaultBodyProps(): BodyProps {
  return {
    type: 'dynamic',
    mass: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    shape: 'box',
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('PhysicsEngine — registry', () => {
  beforeEach(() => {
    physicsEngineRegistry.clear();
  });

  it('physicsEngineRegistry starts empty (after clear)', () => {
    expect(physicsEngineRegistry.size).toBe(0);
  });

  it('registerPhysicsEngine adds engine to registry', () => {
    const engine = createMockPhysicsEngine();
    registerPhysicsEngine('webgpu', engine);
    expect(physicsEngineRegistry.has('webgpu')).toBe(true);
  });

  it('getPhysicsEngine retrieves a registered engine', () => {
    const engine = createMockPhysicsEngine();
    registerPhysicsEngine('bullet', engine);
    expect(getPhysicsEngine('bullet')).toBe(engine);
  });

  it('getPhysicsEngine returns undefined for unregistered name', () => {
    expect(getPhysicsEngine('nonexistent')).toBeUndefined();
  });

  it('registering with same name overwrites the previous engine', () => {
    const engine1 = createMockPhysicsEngine();
    const engine2 = createMockPhysicsEngine();
    registerPhysicsEngine('shared', engine1);
    registerPhysicsEngine('shared', engine2);
    expect(getPhysicsEngine('shared')).toBe(engine2);
    expect(getPhysicsEngine('shared')).not.toBe(engine1);
  });

  it('multiple engines can be registered independently', () => {
    const webgpu = createMockPhysicsEngine();
    const physx = createMockPhysicsEngine();
    const bullet = createMockPhysicsEngine();
    registerPhysicsEngine('webgpu', webgpu);
    registerPhysicsEngine('physx', physx);
    registerPhysicsEngine('bullet', bullet);

    expect(getPhysicsEngine('webgpu')).toBe(webgpu);
    expect(getPhysicsEngine('physx')).toBe(physx);
    expect(getPhysicsEngine('bullet')).toBe(bullet);
    expect(physicsEngineRegistry.size).toBe(3);
  });

  it('physicsEngineRegistry is a standard Map', () => {
    expect(physicsEngineRegistry).toBeInstanceOf(Map);
  });
});

// ---------------------------------------------------------------------------
// Mock engine — initialize
// ---------------------------------------------------------------------------

describe('PhysicsEngine — initialize', () => {
  it('initialize is called with config', async () => {
    const engine = createMockPhysicsEngine();
    const config = createDefaultConfig();
    await engine.initialize(config);
    expect(engine.initialize).toHaveBeenCalledWith(config);
  });

  it('initialize resolves successfully', async () => {
    const engine = createMockPhysicsEngine();
    await expect(engine.initialize(createDefaultConfig())).resolves.toBeUndefined();
  });

  it('initialize with parameters', async () => {
    const engine = createMockPhysicsEngine();
    const config: PhysicsConfig = {
      backend: 'physx-gpu',
      gravity: [0, -10, 0],
      parameters: {
        substeps: 4,
        solverIterations: 8,
        broadphase: 'bvh',
        gpuMemoryLimitMB: 256,
      },
    };
    await engine.initialize(config);
    expect(engine.initialize).toHaveBeenCalledWith(config);
  });
});

// ---------------------------------------------------------------------------
// Mock engine — body management
// ---------------------------------------------------------------------------

describe('PhysicsEngine — body management', () => {
  it('addBody is callable with id and props', () => {
    const engine = createMockPhysicsEngine();
    const props = createDefaultBodyProps();
    engine.addBody('body-1', props);
    expect(engine.addBody).toHaveBeenCalledWith('body-1', props);
  });

  it('addBody with all optional properties', () => {
    const engine = createMockPhysicsEngine();
    const props: BodyProps = {
      type: 'dynamic',
      mass: 5,
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      velocity: [1, 0, 0],
      angularVelocity: [0, 1, 0],
      shape: 'sphere',
      shapeParams: [2.5],
      friction: 0.5,
      restitution: 0.8,
      linearDamping: 0.1,
      angularDamping: 0.2,
    };
    engine.addBody('full-body', props);
    expect(engine.addBody).toHaveBeenCalledWith('full-body', props);
  });

  it('removeBody removes by id', () => {
    const engine = createMockPhysicsEngine();
    engine.removeBody('body-1');
    expect(engine.removeBody).toHaveBeenCalledWith('body-1');
  });

  it('updateBody allows partial property updates', () => {
    const engine = createMockPhysicsEngine();
    engine.updateBody('body-1', { mass: 10, position: [5, 5, 5] });
    expect(engine.updateBody).toHaveBeenCalledWith('body-1', {
      mass: 10,
      position: [5, 5, 5],
    });
  });

  it('supports all body types: dynamic, static, kinematic', () => {
    const engine = createMockPhysicsEngine();
    const base = createDefaultBodyProps();

    engine.addBody('dyn', { ...base, type: 'dynamic' });
    engine.addBody('stat', { ...base, type: 'static' });
    engine.addBody('kin', { ...base, type: 'kinematic' });

    expect(engine.addBody).toHaveBeenCalledTimes(3);
  });

  it('supports all shape types: box, sphere, capsule, mesh', () => {
    const engine = createMockPhysicsEngine();
    const base = createDefaultBodyProps();

    engine.addBody('b', { ...base, shape: 'box', shapeParams: [1, 1, 1] });
    engine.addBody('s', { ...base, shape: 'sphere', shapeParams: [1] });
    engine.addBody('c', { ...base, shape: 'capsule', shapeParams: [0.5, 2] });
    engine.addBody('m', { ...base, shape: 'mesh' });

    expect(engine.addBody).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// Mock engine — forces
// ---------------------------------------------------------------------------

describe('PhysicsEngine — forces', () => {
  it('applyForce with force vector only', () => {
    const engine = createMockPhysicsEngine();
    engine.applyForce('body-1', [10, 0, 0]);
    expect(engine.applyForce).toHaveBeenCalledWith('body-1', [10, 0, 0]);
  });

  it('applyForce with force vector and application point', () => {
    const engine = createMockPhysicsEngine();
    engine.applyForce('body-1', [0, 100, 0], [0, 1, 0]);
    expect(engine.applyForce).toHaveBeenCalledWith(
      'body-1',
      [0, 100, 0],
      [0, 1, 0],
    );
  });
});

// ---------------------------------------------------------------------------
// Mock engine — simulation step
// ---------------------------------------------------------------------------

describe('PhysicsEngine — simulation', () => {
  it('step is called with delta time', () => {
    const engine = createMockPhysicsEngine();
    engine.step(0.016);
    expect(engine.step).toHaveBeenCalledWith(0.016);
  });

  it('getStates returns body state record', () => {
    const states: Record<string, BodyState> = {
      'body-1': {
        position: [1, 2, 3],
        rotation: [0, 0, 0, 1],
        velocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
        isSleeping: false,
      },
    };
    const engine = createMockPhysicsEngine({
      getStates: vi.fn().mockReturnValue(states),
    });

    const result = engine.getStates();
    expect(result).toEqual(states);
    expect(result['body-1'].isSleeping).toBe(false);
  });

  it('getStates returns empty record when no bodies exist', () => {
    const engine = createMockPhysicsEngine();
    expect(engine.getStates()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Mock engine — dispose
// ---------------------------------------------------------------------------

describe('PhysicsEngine — dispose', () => {
  it('dispose is callable', () => {
    const engine = createMockPhysicsEngine();
    engine.dispose();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
  });

  it('dispose can be called multiple times', () => {
    const engine = createMockPhysicsEngine();
    engine.dispose();
    engine.dispose();
    expect(engine.dispose).toHaveBeenCalledTimes(2);
  });
});
