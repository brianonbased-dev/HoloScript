import { describe, it, expect, beforeEach, vi} from 'vitest';
import { USDPhysicsCompiler } from '../USDPhysicsCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestRobot', objects: [], ...overrides } as HoloComposition;
}

describe('USDPhysicsCompiler', () => {
  let compiler: USDPhysicsCompiler;

  beforeEach(() => {
    compiler = new USDPhysicsCompiler();
  });

  // =========== Constructor / defaults ===========

  it('compiles minimal composition to USDA', () => {
    const usda = compiler.compile(makeComposition(), 'test-token');
    expect(usda).toContain('#usda');
    expect(usda).toContain('def Xform');
  });

  it('includes stage metadata', () => {
    const usda = compiler.compile(makeComposition(), 'test-token');
    expect(usda).toContain('upAxis');
    expect(usda).toContain('metersPerUnit');
  });

  // =========== Options ===========

  it('respects upAxis option', () => {
    const c = new USDPhysicsCompiler({ upAxis: 'Z' });
    const usda = c.compile(makeComposition(), 'test-token');
    expect(usda).toContain('"Z"');
  });

  it('includes physics scene by default', () => {
    const usda = compiler.compile(makeComposition(), 'test-token');
    expect(usda).toContain('PhysicsScene');
  });

  it('omits physics scene when disabled', () => {
    const c = new USDPhysicsCompiler({ includePhysicsScene: false });
    const usda = c.compile(makeComposition(), 'test-token');
    expect(usda).not.toContain('PhysicsScene');
  });

  // =========== Objects → Prims ===========

  it('compiles objects to USD prims', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'block',
          properties: [
            { key: 'geometry', value: 'box' },
            { key: 'position', value: [1, 2, 3] },
          ],
          traits: [],
        },
      ] as any,
    });
    const usda = compiler.compile(comp, 'test-token');
    expect(usda).toContain('block');
  });

  it('includes collision API for collidable objects', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'wall',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: ['collidable'],
        },
      ] as any,
    });
    const usda = compiler.compile(comp, 'test-token');
    expect(usda).toContain('Collision');
  });

  it('includes RigidBody API for physics objects', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'crate',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: ['physics'],
        },
      ] as any,
    });
    const usda = compiler.compile(comp, 'test-token');
    expect(usda).toContain('RigidBody');
  });

  // =========== Geometry types ===========

  it('handles sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'geometry', value: 'sphere' }], traits: ['physics'] },
      ] as any,
    });
    const usda = compiler.compile(comp, 'test-token');
    expect(usda).toContain('Sphere');
  });

  it('handles cylinder geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'tube', properties: [{ key: 'geometry', value: 'cylinder' }], traits: ['physics'] },
      ] as any,
    });
    const usda = compiler.compile(comp, 'test-token');
    expect(usda).toContain('Cylinder');
  });

  // =========== Spatial groups ===========

  it('processes spatial groups', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          name: 'robot_arm',
          objects: [
            { name: 'link1', properties: [{ key: 'geometry', value: 'cylinder' }], traits: ['physics'] },
          ],
        },
      ] as any,
    });
    const usda = compiler.compile(comp, 'test-token');
    expect(usda).toContain('robot_arm');
  });

  // =========== Gravity ===========

  it('respects custom gravity', () => {
    const c = new USDPhysicsCompiler({ gravity: [0, 0, -9.81] });
    const usda = c.compile(makeComposition(), 'test-token');
    // Gravity magnitude is emitted as absolute value
    expect(usda).toContain('9.81');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'prim_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'prim_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const usda = compiler.compile(comp, 'test-token');
    expect(usda).toContain('prim_a');
    expect(usda).toContain('prim_b');
  });

  // =========== Name sanitization ===========

  it('sanitizes special characters', () => {
    const comp = makeComposition({
      objects: [
        { name: 'my object!', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const usda = compiler.compile(comp, 'test-token');
    expect(usda).not.toContain('!');
  });

  // =========== Reset between compilations ===========

  it('resets state between compilations', () => {
    compiler.compile(makeComposition({ name: 'first' }), 'test-token');
    const usda = compiler.compile(makeComposition({ name: 'second' }), 'test-token');
    expect(usda).toContain('second');
    // Should not contain first composition data
    expect(usda).not.toContain('"first"');
  });
});
