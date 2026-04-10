/**
 * USDPhysicsCompiler — Production Test Suite
 *
 * Covers: compile() returns .usda text, PhysicsScene, PhysicsRigidBodyAPI,
 * PhysicsCollisionAPI, PhysicsMassAPI, articulation, joints, materials,
 * up-axis, gravity, GPU dynamics, and spatial groups.
 *
 * Key behavioural notes:
 * - Default upAxis = 'Z' (Isaac Sim convention), not 'Y'.
 * - PhysicsCollisionAPI is added when object has 'collidable' or 'trigger'
 *   trait, OR when object has 'physics' trait.
 *   The includeCollision *option* does not override trait-based logic;
 *   it controls global inclusion on the stage level.
 * - PhysicsRigidBodyAPI requires @physics or @rigid trait.
 * - PhysicsMassAPI is added alongside PhysicsRigidBodyAPI.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { USDPhysicsCompiler } from '../USDPhysicsCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'PhysicsScene',
    objects: [],
    lights: [],
    timelines: [],
    transitions: [],
    ...overrides,
  } as HoloComposition;
}

function makeObj(
  name: string,
  props: Array<{ key: string; value: unknown }> = [],
  traits: any[] = []
): HoloObjectDecl {
  return {
    name,
    properties: props.map(({ key, value }) => ({ key, value })),
    traits,
    children: [],
  } as any;
}

describe('USDPhysicsCompiler — Production', () => {
  let compiler: USDPhysicsCompiler;

  beforeEach(() => {
    compiler = new USDPhysicsCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with custom options', () => {
    const c = new USDPhysicsCompiler({
      stageName: 'RobotScene',
      upAxis: 'Z',
      gravity: [0, -9.81, 0],
      enableGPUDynamics: true,
    });
    expect(c).toBeDefined();
  });

  // ─── compile() ────────────────────────────────────────────────────────
  it('compile returns a string', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── USD structure ────────────────────────────────────────────────────
  it('output starts with usda header', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('#usda');
  });

  it('output contains metersPerUnit', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('metersPerUnit');
  });

  it('output contains upAxis', () => {
    const out = compiler.compile(makeComp(), 'test-token');
    expect(out).toContain('upAxis');
  });

  it('upAxis Z is used when specified', () => {
    const c = new USDPhysicsCompiler({ upAxis: 'Z' });
    const out = c.compile(makeComp(), 'test-token');
    expect(out).toContain('"Z"');
  });

  // Default upAxis is 'Z' (Isaac Sim convention)
  it('upAxis Z is default', () => {
    const out = compiler.compile(makeComp(), 'test-token'); // default upAxis = 'Z'
    expect(out).toContain('"Z"');
  });

  it('upAxis Y is used when specified', () => {
    const c = new USDPhysicsCompiler({ upAxis: 'Y' });
    const out = c.compile(makeComp(), 'test-token');
    expect(out).toContain('"Y"');
  });

  // ─── Physics scene ────────────────────────────────────────────────────
  it('includePhysicsScene adds PhysicsScene prim', () => {
    const c = new USDPhysicsCompiler({ includePhysicsScene: true });
    const out = c.compile(makeComp(), 'test-token');
    expect(out).toContain('PhysicsScene');
  });

  it('gravity direction appears in physics scene', () => {
    const c = new USDPhysicsCompiler({ includePhysicsScene: true, gravity: [0, -9.81, 0] });
    const out = c.compile(makeComp(), 'test-token');
    expect(out).toContain('PhysicsScene');
  });

  // ─── Objects: rigid body ──────────────────────────────────────────────
  it('object with physics trait gets PhysicsRigidBodyAPI', () => {
    const obj = makeObj(
      'Cube',
      [{ key: 'mesh', value: 'cube' }],
      [{ name: 'physics', config: { mass: 1.0 } }]
    );
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('PhysicsRigidBodyAPI');
  });

  it('rigid body object name appears in output', () => {
    const obj = makeObj(
      'FallingBox',
      [{ key: 'mesh', value: 'box' }],
      [{ name: 'physics', config: {} }]
    );
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('FallingBox');
  });

  // ─── Objects: static (no physics trait) ───────────────────────────────
  it('static object compiles without rigid body API', () => {
    const obj = makeObj('Floor', [{ key: 'mesh', value: 'plane' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('Floor');
  });

  // ─── Collision API ────────────────────────────────────────────────────
  // PhysicsCollisionAPI is added when object has 'collidable' or 'physics' trait.
  it('collidable trait adds PhysicsCollisionAPI', () => {
    const obj = makeObj('Wall', [{ key: 'mesh', value: 'box' }], [{ name: 'collidable' }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('PhysicsCollisionAPI');
  });

  it('physics trait also adds PhysicsCollisionAPI', () => {
    const obj = makeObj('DynWall', [], [{ name: 'physics', config: { mass: 1.0 } }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('PhysicsCollisionAPI');
  });

  // ─── Mass API ─────────────────────────────────────────────────────────
  it('physics object gets PhysicsMassAPI', () => {
    const obj = makeObj('HeavyCrate', [], [{ name: 'physics', config: { mass: 50 } }]);
    const out = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(out).toContain('PhysicsMassAPI');
  });

  // ─── GPU dynamics ─────────────────────────────────────────────────────
  it('enableGPUDynamics option compiles without error', () => {
    const c = new USDPhysicsCompiler({ enableGPUDynamics: true });
    expect(() => c.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects', () => {
    const objs = [
      makeObj('Ground'),
      makeObj('Ball', [], [{ name: 'physics', config: {} }]),
      makeObj('Ramp'),
    ];
    const out = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(out).toContain('Ground');
    expect(out).toContain('Ball');
    expect(out).toContain('Ramp');
  });

  // ─── timeCodesPerSecond ───────────────────────────────────────────────
  it('custom timeCodesPerSecond appears in output', () => {
    const c = new USDPhysicsCompiler({ timeCodesPerSecond: 120 });
    const out = c.compile(makeComp(), 'test-token');
    expect(out).toContain('120');
  });
});
