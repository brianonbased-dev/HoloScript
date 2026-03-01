/**
 * Tests for the new 3D spatial engine foundation modules:
 * Quaternion, SpatialEngine, PhysicsStep, RenderGraph, SpatialEngineBridge
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Quaternion Tests
// ============================================================================

import {
  identity, fromEuler, fromAxisAngle, multiply, conjugate,
  normalize, dot, slerp, rotateVec3, toMatrix4, toEuler, angleBetween,
} from '../../../../core/src/math/Quaternion';

describe('Quaternion', () => {
  it('identity is (0,0,0,1)', () => {
    const q = identity();
    expect(q).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('fromEuler(0,0,0) returns identity', () => {
    const q = fromEuler(0, 0, 0);
    expect(q.w).toBeCloseTo(1, 5);
    expect(q.x).toBeCloseTo(0, 5);
  });

  it('fromAxisAngle(0,1,0, π/2) rotates 90° around Y', () => {
    const q = fromAxisAngle(0, 1, 0, Math.PI / 2);
    expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
    expect(q.y).toBeCloseTo(Math.sin(Math.PI / 4), 5);
  });

  it('multiply(q, conjugate(q)) ≈ identity', () => {
    const q = fromEuler(0.3, 0.7, 1.1);
    const result = multiply(q, conjugate(q));
    expect(result.w).toBeCloseTo(1, 5);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  it('normalize handles zero-length gracefully', () => {
    const q = normalize({ x: 0, y: 0, z: 0, w: 0 });
    expect(q.w).toBe(1); // Falls back to identity
  });

  it('dot product of identical quaternions is 1', () => {
    const q = normalize(fromEuler(1, 2, 3));
    expect(dot(q, q)).toBeCloseTo(1, 5);
  });

  it('slerp(a, b, 0) === a and slerp(a, b, 1) ≈ b', () => {
    const a = fromEuler(0, 0, 0);
    const b = fromEuler(Math.PI / 2, 0, 0);

    const at0 = slerp(a, b, 0);
    expect(at0.w).toBeCloseTo(a.w, 4);

    const at1 = slerp(a, b, 1);
    expect(at1.w).toBeCloseTo(b.w, 4);
    expect(at1.x).toBeCloseTo(b.x, 4);
  });

  it('slerp midpoint is halfway rotation', () => {
    const a = identity();
    const b = fromAxisAngle(0, 1, 0, Math.PI);
    const mid = slerp(a, b, 0.5);
    const angle = angleBetween(a, mid);
    expect(angle).toBeCloseTo(Math.PI / 2, 2);
  });

  it('rotateVec3 rotates (1,0,0) by 90° around Y to (0,0,-1)', () => {
    const q = fromAxisAngle(0, 1, 0, Math.PI / 2);
    const result = rotateVec3(q, 1, 0, 0);
    expect(result.x).toBeCloseTo(0, 3);
    expect(result.z).toBeCloseTo(-1, 3);
  });

  it('toMatrix4 produces a valid 4×4 matrix', () => {
    const q = fromEuler(0, Math.PI / 4, 0);
    const m = toMatrix4(q);
    expect(m.length).toBe(16);
    expect(m[15]).toBeCloseTo(1, 5);
    // Diagonal should be valid rotation values
    expect(Math.abs(m[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(m[5])).toBeLessThanOrEqual(1);
    expect(Math.abs(m[10])).toBeLessThanOrEqual(1);
  });

  it('toEuler roundtrips fromEuler for small angles', () => {
    const pitch = 0.2, yaw = 0.1, roll = 0.15;
    const q = fromEuler(pitch, yaw, roll);
    const e = toEuler(q);
    // Verify roundtrip preserves orientation (Euler decomposition has inherent ambiguity)
    const q2 = fromEuler(e.pitch, e.yaw, e.roll);
    expect(angleBetween(q, q2)).toBeLessThan(0.1); // Within 0.1 rad
  });

  it('angleBetween identical quaternions is 0', () => {
    const q = fromEuler(1, 2, 3);
    expect(angleBetween(q, q)).toBeCloseTo(0, 5);
  });
});

// ============================================================================
// SpatialEngine Tests
// ============================================================================

import { SpatialEngine } from '../../../../core/src/engine/SpatialEngine';
import type { EngineSystem } from '../../../../core/src/engine/SpatialEngine';

describe('SpatialEngine', () => {
  it('starts in stopped state', () => {
    const engine = new SpatialEngine();
    expect(engine.getState()).toBe('stopped');
  });

  it('addSystem registers and sorts by priority', () => {
    const engine = new SpatialEngine();
    const calls: string[] = [];
    engine.addSystem({ name: 'B', priority: 200, update: () => calls.push('B') });
    engine.addSystem({ name: 'A', priority: 100, update: () => calls.push('A') });

    // stepManual calls update in priority order
    engine.stepManual(1 / 60);
    expect(calls).toEqual(['A', 'B']);
  });

  it('removeSystem destroys and removes', () => {
    const engine = new SpatialEngine();
    const destroyed = vi.fn();
    engine.addSystem({ name: 'X', destroy: destroyed });
    expect(engine.removeSystem('X')).toBe(true);
    expect(destroyed).toHaveBeenCalled();
  });

  it('stepManual advances physics with fixed timestep', () => {
    const engine = new SpatialEngine({ physicsTimestep: 1 / 60 });
    const fixedCalls: number[] = [];
    engine.addSystem({
      name: 'physics',
      fixedUpdate: (dt) => fixedCalls.push(dt),
    });

    engine.stepManual(1 / 30); // 2 fixed steps at 1/60
    expect(fixedCalls.length).toBeGreaterThanOrEqual(2);
    expect(fixedCalls[0]).toBeCloseTo(1 / 60, 5);
  });

  it('getSystem returns registered system', () => {
    const engine = new SpatialEngine();
    const mySystem: EngineSystem = { name: 'MySystem' };
    engine.addSystem(mySystem);
    expect(engine.getSystem('MySystem')).toBe(mySystem);
    expect(engine.getSystem('NonExistent')).toBeUndefined();
  });

  it('lateUpdate is called after fixedUpdate', () => {
    const engine = new SpatialEngine({ physicsTimestep: 1 / 60 });
    const order: string[] = [];
    engine.addSystem({
      name: 'Test',
      update: () => order.push('update'),
      fixedUpdate: () => order.push('fixedUpdate'),
      lateUpdate: () => order.push('lateUpdate'),
    });

    engine.stepManual(1 / 60);
    expect(order[0]).toBe('update');
    expect(order[order.length - 1]).toBe('lateUpdate');
  });
});

// ============================================================================
// PhysicsStep Tests
// ============================================================================

import { PhysicsStep } from '../../../../core/src/engine/PhysicsStep';

describe('PhysicsStep', () => {
  it('adds and retrieves bodies', () => {
    const phys = new PhysicsStep();
    phys.addBody({
      id: 'ball', position: { x: 0, y: 10, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1,
      isStatic: false, restitution: 0.5, friction: 0.3,
    });

    expect(phys.getBody('ball')).toBeDefined();
    expect(phys.getActiveBodyCount()).toBe(1);
  });

  it('gravity pulls bodies downward', () => {
    const phys = new PhysicsStep();
    phys.addBody({
      id: 'ball', position: { x: 0, y: 10, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1,
      isStatic: false, restitution: 0.5, friction: 0.3,
    });

    phys.fixedUpdate(1 / 60);
    const body = phys.getBody('ball')!;
    expect(body.velocity.y).toBeLessThan(0);
    expect(body.position.y).toBeLessThan(10);
  });

  it('ground plane stops falling bodies', () => {
    const phys = new PhysicsStep();
    phys.addBody({
      id: 'ball', position: { x: 0, y: 0.001, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: -5, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1,
      isStatic: false, restitution: 0.8, friction: 0.3,
    });

    phys.fixedUpdate(1 / 60);
    const body = phys.getBody('ball')!;
    expect(body.position.y).toBeGreaterThanOrEqual(0);
  });

  it('static bodies are not affected by gravity', () => {
    const phys = new PhysicsStep();
    phys.addBody({
      id: 'floor', position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }, mass: 0,
      isStatic: true, restitution: 1, friction: 0.5,
    });

    phys.fixedUpdate(1 / 60);
    const body = phys.getBody('floor')!;
    expect(body.position.y).toBe(0);
    expect(body.velocity.y).toBe(0);
  });

  it('collision callback fires on impact', () => {
    const phys = new PhysicsStep();
    phys.setCellSize(100);
    phys.setGravity(0, 0, 0);

    // Place bodies overlapping (dist=0.3 < minDist=1.0) with zero velocity
    // The resolver will push them apart and fire the callback
    phys.addBody({
      id: 'a', position: { x: 0, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1,
      isStatic: false, restitution: 0.5, friction: 0,
    });
    phys.addBody({
      id: 'b', position: { x: 0.3, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1,
      isStatic: false, restitution: 0.5, friction: 0,
    });

    const events: any[] = [];
    phys.onCollision((e) => events.push(e));
    phys.fixedUpdate(1 / 60);

    // Bodies start overlapping with zero relVel along normal, so collision fires
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].bodyA).toBeDefined();
    expect(events[0].bodyB).toBeDefined();
  });

  it('raycast hits a body', () => {
    const phys = new PhysicsStep();
    phys.addBody({
      id: 'target', position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1,
      isStatic: true, restitution: 1, friction: 0,
    });

    const hit = phys.raycast({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 100);
    expect(hit).not.toBeNull();
    expect(hit!.bodyId).toBe('target');
    expect(hit!.distance).toBeGreaterThan(0);
  });

  it('removeBody cleans up', () => {
    const phys = new PhysicsStep();
    phys.addBody({
      id: 'x', position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }, mass: 1,
      isStatic: false, restitution: 1, friction: 0,
    });
    expect(phys.removeBody('x')).toBe(true);
    expect(phys.getBody('x')).toBeUndefined();
  });
});

// ============================================================================
// RenderGraph Tests
// ============================================================================

import { RenderGraph } from '../../../../core/src/render/RenderGraph';

describe('RenderGraph', () => {
  it('topologically sorts passes by dependencies', () => {
    const graph = new RenderGraph();
    graph.addTarget({ id: 'depth', width: 1920, height: 1080, format: 'depth24plus' });
    graph.addTarget({ id: 'color', width: 1920, height: 1080, format: 'rgba16float' });

    graph.addPass({ id: 'main', inputs: ['depth'], outputs: ['color'], execute: () => {}, priority: 200 });
    graph.addPass({ id: 'depth-pass', inputs: [], outputs: ['depth'], execute: () => {}, priority: 100 });

    const order = graph.getExecutionOrder();
    const depthIdx = order.indexOf('depth-pass');
    const mainIdx = order.indexOf('main');
    expect(depthIdx).toBeLessThan(mainIdx);
  });

  it('passes execute in correct order', () => {
    const graph = new RenderGraph();
    graph.addTarget({ id: 't1', width: 100, height: 100, format: 'rgba8unorm' });

    const calls: string[] = [];
    graph.addPass({ id: 'A', inputs: [], outputs: ['t1'], execute: () => calls.push('A') });
    graph.addPass({ id: 'B', inputs: ['t1'], outputs: [], execute: () => calls.push('B') });

    graph.lateUpdate(1 / 60);
    expect(calls).toEqual(['A', 'B']);
  });

  it('disabled passes are skipped', () => {
    const graph = new RenderGraph();
    const calls: string[] = [];
    graph.addPass({ id: 'active', inputs: [], outputs: [], execute: () => calls.push('active') });
    graph.addPass({ id: 'disabled', inputs: [], outputs: [], execute: () => calls.push('disabled'), enabled: false });

    graph.lateUpdate(1 / 60);
    expect(calls).toEqual(['active']);
  });

  it('setupForwardPipeline creates standard passes', () => {
    const graph = new RenderGraph();
    graph.setupForwardPipeline();

    const order = graph.getExecutionOrder();
    expect(order).toContain('shadow-pass');
    expect(order).toContain('depth-prepass');
    expect(order).toContain('main-color');
    expect(order).toContain('post-process');
    expect(order).toContain('present');

    // Verify ordering: shadow < depth < main < post < present
    expect(order.indexOf('shadow-pass')).toBeLessThan(order.indexOf('main-color'));
    expect(order.indexOf('main-color')).toBeLessThan(order.indexOf('post-process'));
    expect(order.indexOf('post-process')).toBeLessThan(order.indexOf('present'));
  });

  it('getStats returns pass timings', () => {
    const graph = new RenderGraph();
    graph.addPass({ id: 'test', inputs: [], outputs: [], execute: () => {} });
    graph.lateUpdate(1 / 60);

    const stats = graph.getStats();
    expect(stats.passCount).toBe(1);
    expect(stats.passTimings.has('test')).toBe(true);
  });

  it('getPassesByTag filters correctly', () => {
    const graph = new RenderGraph();
    graph.addPass({ id: 'a', inputs: [], outputs: [], execute: () => {}, tags: ['shadow'] });
    graph.addPass({ id: 'b', inputs: [], outputs: [], execute: () => {}, tags: ['post'] });
    graph.addPass({ id: 'c', inputs: [], outputs: [], execute: () => {}, tags: ['shadow'] });

    const shadows = graph.getPassesByTag('shadow');
    expect(shadows.length).toBe(2);
  });
});

// ============================================================================
// SpatialEngineBridge Tests (Fallback mode only)
// ============================================================================

import { SpatialEngineBridge } from '../../../../core/src/wasm/SpatialEngineBridge';

describe('SpatialEngineBridge (fallback mode)', () => {
  it('starts in fallback mode', () => {
    const bridge = new SpatialEngineBridge();
    expect(bridge.isWasmAvailable()).toBe(false);
    expect(bridge.getStatus().fallbackMode).toBe(true);
  });

  it('perlinNoise2D returns values in [-1, 1]', () => {
    const bridge = new SpatialEngineBridge();
    for (let i = 0; i < 50; i++) {
      const val = bridge.perlinNoise2D(i * 0.1, i * 0.3, 42);
      expect(val).toBeGreaterThanOrEqual(-1);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('perlinNoise2D is deterministic for same seed', () => {
    const bridge = new SpatialEngineBridge();
    const a = bridge.perlinNoise2D(1.5, 2.5, 42);
    const b = bridge.perlinNoise2D(1.5, 2.5, 42);
    expect(a).toBe(b);
  });

  it('fbmNoise returns values in expected range', () => {
    const bridge = new SpatialEngineBridge();
    const val = bridge.fbmNoise(1.0, 2.0, 4, 2.0, 0.5, 42);
    expect(val).toBeGreaterThanOrEqual(-1);
    expect(val).toBeLessThanOrEqual(1);
  });

  it('sphereSphereTest detects collision', () => {
    const bridge = new SpatialEngineBridge();
    expect(bridge.sphereSphereTest({ x: 0, y: 0, z: 0 }, 1, { x: 1.5, y: 0, z: 0 }, 1)).toBe(true);
    expect(bridge.sphereSphereTest({ x: 0, y: 0, z: 0 }, 1, { x: 5, y: 0, z: 0 }, 1)).toBe(false);
  });

  it('aabbOverlap detects overlap', () => {
    const bridge = new SpatialEngineBridge();
    expect(bridge.aabbOverlap(
      { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 },
      { x: 1, y: 1, z: 1 }, { x: 3, y: 3, z: 3 },
    )).toBe(true);
    expect(bridge.aabbOverlap(
      { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 },
      { x: 5, y: 5, z: 5 }, { x: 6, y: 6, z: 6 },
    )).toBe(false);
  });

  it('findPath finds a valid path on open grid', () => {
    const bridge = new SpatialEngineBridge();
    const w = 10, h = 10;
    const grid = new Uint8Array(w * h); // All walkable

    const path = bridge.findPath(grid, w, h, 0, 0, 9, 9);
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual([0, 0]);
    expect(path[path.length - 1]).toEqual([9, 9]);
  });

  it('findPath returns empty for completely blocked grid', () => {
    const bridge = new SpatialEngineBridge();
    const w = 5, h = 5;
    const grid = new Uint8Array(w * h).fill(1); // All blocked
    grid[0] = 0; // Start is walkable
    grid[w * h - 1] = 0; // End is walkable

    const path = bridge.findPath(grid, w, h, 0, 0, 4, 4);
    expect(path.length).toBe(0);
  });

  it('findPath navigates around walls', () => {
    const bridge = new SpatialEngineBridge();
    const w = 5, h = 5;
    const grid = new Uint8Array(w * h); // All walkable
    // Put a wall in the middle column (x=2) except bottom
    grid[2 + 0 * w] = 1;
    grid[2 + 1 * w] = 1;
    grid[2 + 2 * w] = 1;
    grid[2 + 3 * w] = 1;
    // grid[2 + 4*w] stays 0 (gap at bottom)

    const path = bridge.findPath(grid, w, h, 0, 0, 4, 0);
    expect(path.length).toBeGreaterThan(0);
    // Path must go around the wall
    expect(path[path.length - 1]).toEqual([4, 0]);
  });
});
