import { makeTestContext } from './helpers.js';
/**
 * GPUPhysicsTrait — Production Test Suite
 *
 * gpuPhysicsHandler depends on:
 * - getPhysicsEngine (from ../runtime/PhysicsEngine)
 * - IslandDetector (from ../physics/IslandDetector)
 * - SoftBodyAdapter (from ../physics/SoftBodyAdapter)
 *
 * We mock all 3.
 *
 * Key behaviours:
 * 1. defaultConfig — sim_type=rigid_body, method=pbd, gravity=[0,-9.81,0], substeps=4, etc.
 * 2. extractPosition — reads from node.properties.position array, object {x,y,z}, or defaults [0,0,0]
 * 3. onAttach (rigid_body) — calls engine.addBody() with correct params; creates __gpuPhysicsState
 * 4. onAttach (rigid_body, no engine) — warns, no state created
 * 5. onAttach (soft_body) — creates SoftBodyAdapter; sets engineId='soft_body_solver'
 * 6. onDetach (rigid_body state) — calls engine.removeBody(); removes state
 * 7. onDetach (soft_body state) — disposes soft body; removes state
 * 8. onDetach (no state) — no-op
 * 9. onUpdate — no-op when !isSimulating
 * 10. onUpdate (soft_body) — calls softBody.update(delta)
 * 11. onUpdate (rigid_body, no engine) — no-op
 * 12. onUpdate (rigid_body, active body) — syncs position+rotation to node
 * 13. onUpdate (rigid_body, sleeping body) — does NOT update node.position
 * 14. onEvent 'apply-force' (rigid_body) — calls engine.applyForce()
 * 15. onEvent 'apply-force' (soft_body) — no engine.applyForce called
 * 16. onEvent unknown — no-op
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let _mockEngine: ReturnType<typeof makeMockEngine>;
let _softBodyInstance: ReturnType<typeof makeMockSoftBody>;

function makeMockEngine() {
  return {
    addBody: vi.fn(),
    removeBody: vi.fn(),
    applyForce: vi.fn(),
    getStates: vi.fn().mockReturnValue({}),
    step: vi.fn(),
  };
}

function makeMockSoftBody() {
  return {
    update: vi.fn(),
    dispose: vi.fn(),
  };
}

vi.mock('@holoscript/engine/runtime/PhysicsEngine', () => {
  return {
    getPhysicsEngine: (name: string) => {
      // 'webgpu' and 'default' both return the current engine
      return _mockEngine ?? null;
    },
  };
});

vi.mock('@holoscript/engine/physics/IslandDetector', () => {
  function IslandDetector() {
    return { detect: vi.fn() };
  }
  return { IslandDetector };
});

vi.mock('@holoscript/engine/physics/SoftBodyAdapter', () => {
  function SoftBodyAdapter(node: any, config: any) {
    _softBodyInstance = makeMockSoftBody();
    return _softBodyInstance;
  }
  return { SoftBodyAdapter };
});

import { gpuPhysicsHandler } from '../GPUPhysicsTrait';

// ─── helpers ──────────────────────────────────────────────────────────────────

let _nodeId = 0;
function makeNode(props: Record<string, unknown> = {}) {
  return { id: `physics_node_${++_nodeId}`, name: `PhysNode_${_nodeId}`, ...props };
}

function makeConfig(overrides: any = {}) {
  return { ...gpuPhysicsHandler.defaultConfig!, ...overrides };
}

function getState(node: any) {
  return (node as any).__gpuPhysicsState;
}

function makeCtx() {
  return { emit: vi.fn() };
}

beforeEach(() => {
  _mockEngine = makeMockEngine();
  _softBodyInstance = undefined as any;
  vi.clearAllMocks();
});

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('gpuPhysicsHandler.defaultConfig', () => {
  const d = gpuPhysicsHandler.defaultConfig!;
  it('sim_type = rigid_body', () => expect(d.sim_type).toBe('rigid_body'));
  it('method = pbd', () => expect(d.method).toBe('pbd'));
  it('gravity = [0,-9.81,0]', () => expect(d.gravity).toEqual([0, -9.81, 0]));
  it('substeps = 4', () => expect(d.substeps).toBe(4));
  it('mass = 1.0', () => expect(d.mass).toBe(1.0));
  it('shape = box', () => expect(d.shape).toBe('box'));
  it('shapeParams = [1,1,1]', () => expect(d.shapeParams).toEqual([1, 1, 1]));
  it('friction = 0.5', () => expect(d.friction).toBe(0.5));
  it('restitution = 0.3', () => expect(d.restitution).toBe(0.3));
  it('isStatic = false', () => expect(d.isStatic).toBe(false));
});

// ─── extractPosition (tested via onAttach) ────────────────────────────────────

describe('extractPosition via onAttach', () => {
  it('reads position from node.position array', () => {
    const node = makeNode({ position: [1, 2, 3] });
    const config = makeConfig();
    gpuPhysicsHandler.onAttach!(node as any, config, makeCtx() as any);
    expect(_mockEngine.addBody).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ position: [1, 2, 3] })
    );
  });

  it('reads position from node.properties.position array', () => {
    const node = makeNode({ properties: { position: [4, 5, 6] } });
    const config = makeConfig();
    gpuPhysicsHandler.onAttach!(node as any, config, makeCtx() as any);
    expect(_mockEngine.addBody).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ position: [4, 5, 6] })
    );
  });

  it('reads position from node.position {x,y,z} object', () => {
    const node = makeNode({ position: { x: 7, y: 8, z: 9 } });
    const config = makeConfig();
    gpuPhysicsHandler.onAttach!(node as any, config, makeCtx() as any);
    expect(_mockEngine.addBody).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ position: [7, 8, 9] })
    );
  });

  it('defaults to [0,0,0] when no position on node', () => {
    const node = makeNode();
    const config = makeConfig();
    gpuPhysicsHandler.onAttach!(node as any, config, makeCtx() as any);
    expect(_mockEngine.addBody).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ position: [0, 0, 0] })
    );
  });
});

// ─── onAttach — rigid body ────────────────────────────────────────────────────

describe('gpuPhysicsHandler.onAttach — rigid_body', () => {
  it('creates __gpuPhysicsState with isSimulating=true', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    expect(getState(node).isSimulating).toBe(true);
  });

  it('calls engine.addBody with type=dynamic for !isStatic', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(node as any, makeConfig({ isStatic: false }), makeCtx() as any);
    expect(_mockEngine.addBody).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'dynamic' })
    );
  });

  it('calls engine.addBody with type=static for isStatic=true', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(node as any, makeConfig({ isStatic: true }), makeCtx() as any);
    expect(_mockEngine.addBody).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'static' })
    );
  });

  it('passes mass, shape, friction, restitution to addBody', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(
      node as any,
      makeConfig({ mass: 2.5, shape: 'sphere', friction: 0.8, restitution: 0.1 }),
      makeCtx() as any
    );
    expect(_mockEngine.addBody).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mass: 2.5, shape: 'sphere', friction: 0.8, restitution: 0.1 })
    );
  });

  it('does NOT create state when no engine is available', () => {
    _mockEngine = null as any; // simulate no engine
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    expect(getState(node)).toBeUndefined();
  });
});

// ─── onAttach — soft body ─────────────────────────────────────────────────────

describe('gpuPhysicsHandler.onAttach — soft_body', () => {
  it('creates state with engineId=soft_body_solver', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any
    );
    expect(getState(node).engineId).toBe('soft_body_solver');
  });

  it('stores SoftBodyAdapter in state.softBody', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any
    );
    expect(getState(node).softBody).toBeDefined();
  });

  it('does NOT call engine.addBody for soft_body', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any
    );
    expect(_mockEngine.addBody).not.toHaveBeenCalled();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('gpuPhysicsHandler.onDetach — rigid_body', () => {
  it('calls engine.removeBody() and removes state', () => {
    const node = makeNode({ name: 'TestBody' });
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    gpuPhysicsHandler.onDetach!(node as any, makeConfig(), makeCtx() as any);
    expect(_mockEngine.removeBody).toHaveBeenCalledWith('TestBody');
    expect(getState(node)).toBeUndefined();
  });
});

describe('gpuPhysicsHandler.onDetach — soft_body', () => {
  it('does NOT call engine.removeBody()', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any
    );
    gpuPhysicsHandler.onDetach!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any
    );
    expect(_mockEngine.removeBody).not.toHaveBeenCalled();
    expect(getState(node)).toBeUndefined();
  });
});

describe('gpuPhysicsHandler.onDetach — no state', () => {
  it('is a no-op', () => {
    const node = makeNode();
    // Never attached — no state
    expect(() =>
      gpuPhysicsHandler.onDetach!(node as any, makeConfig(), makeTestContext(makeCtx() as any))).not.toThrow();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('gpuPhysicsHandler.onUpdate — rigid_body', () => {
  it('no-op when !isSimulating', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    getState(node).isSimulating = false;
    _mockEngine.getStates.mockClear();
    gpuPhysicsHandler.onUpdate!(node as any, makeConfig(), makeCtx() as any, 0.016);
    expect(_mockEngine.getStates).not.toHaveBeenCalled();
  });

  it('syncs position + rotation from engine state when body is not sleeping', () => {
    const node = makeNode({ name: 'SyncBody' });
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    _mockEngine.getStates.mockReturnValue({
      SyncBody: { isSleeping: false, position: [1, 2, 3], rotation: [0, 0, 0, 1] },
    });
    gpuPhysicsHandler.onUpdate!(node as any, makeConfig(), makeCtx() as any, 0.016);
    expect(node.position).toEqual([1, 2, 3]);
    expect(node.rotation).toEqual([0, 0, 0, 1]);
  });

  it('does NOT update node when body is sleeping', () => {
    const node = makeNode({ name: 'SleepBody', position: [5, 5, 5] });
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    _mockEngine.getStates.mockReturnValue({
      SleepBody: { isSleeping: true, position: [1, 2, 3], rotation: [0, 0, 0, 1] },
    });
    gpuPhysicsHandler.onUpdate!(node as any, makeConfig(), makeCtx() as any, 0.016);
    expect(node.position).toEqual([5, 5, 5]); // unchanged
  });

  it('no-op when engine not available during update', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    _mockEngine = null as any; // engine gone
    expect(() =>
      gpuPhysicsHandler.onUpdate!(node as any, makeConfig(), makeTestContext(makeCtx()), )).not.toThrow();
  });
});

describe('gpuPhysicsHandler.onUpdate — soft_body', () => {
  it('calls softBody.update(delta)', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any
    );
    gpuPhysicsHandler.onUpdate!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any,
      0.05
    );
    expect(_softBodyInstance.update).toHaveBeenCalledWith(0.05);
  });

  it('does NOT call engine.getStates for soft_body', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any
    );
    _mockEngine.getStates.mockClear();
    gpuPhysicsHandler.onUpdate!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any,
      0.016
    );
    expect(_mockEngine.getStates).not.toHaveBeenCalled();
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('gpuPhysicsHandler.onEvent', () => {
  it('apply-force (rigid_body) — calls engine.applyForce with force + point', () => {
    const node = makeNode({ name: 'ForceBody' });
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    const force = [0, 100, 0];
    const point = [0, 0, 0];
    gpuPhysicsHandler.onEvent!(node as any, makeConfig(), makeCtx() as any, {
      type: 'apply-force',
      data: { force, point },
    });
    expect(_mockEngine.applyForce).toHaveBeenCalledWith('ForceBody', force, point);
  });

  it('apply-force (soft_body) — does NOT call engine.applyForce', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any
    );
    _mockEngine.applyForce.mockClear();
    gpuPhysicsHandler.onEvent!(
      node as any,
      makeConfig({ sim_type: 'soft_body' }),
      makeCtx() as any,
      {
        type: 'apply-force',
        data: { force: [0, 50, 0], point: [0, 0, 0] },
      }
    );
    expect(_mockEngine.applyForce).not.toHaveBeenCalled();
  });

  it('unknown event — no-op, no throw', () => {
    const node = makeNode();
    gpuPhysicsHandler.onAttach!(node as any, makeConfig(), makeCtx() as any);
    expect(() =>
      gpuPhysicsHandler.onEvent!(node as any, makeConfig(), makeTestContext(makeCtx()), { type: 'unknown_event' })).not.toThrow();
  });

  it('no-op when state is missing', () => {
    const node = makeNode();
    // no attach
    expect(() =>
      gpuPhysicsHandler.onEvent!(node as any, makeConfig(), makeCtx() as any, {
        type: 'apply-force',
        data: {},
      })
    ).not.toThrow();
  });
});
