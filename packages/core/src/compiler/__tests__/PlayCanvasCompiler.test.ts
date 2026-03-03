import { describe, it, expect, beforeEach, vi} from 'vitest';
import { PlayCanvasCompiler } from '../PlayCanvasCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

describe('PlayCanvasCompiler', () => {
  let compiler: PlayCanvasCompiler;

  beforeEach(() => {
    compiler = new PlayCanvasCompiler();
  });

  // =========== Minimal output ===========

  it('compiles minimal composition to PlayCanvas code', () => {
    const code = compiler.compile(makeComposition(), 'test-token');
    expect(code).toContain('pc');
  });

  it('includes application setup', () => {
    const code = compiler.compile(makeComposition(), 'test-token');
    expect(code).toContain('app');
  });

  // =========== Options ===========

  it('respects custom class name', () => {
    const c = new PlayCanvasCompiler({ className: 'MyScene' });
    const code = c.compile(makeComposition(), 'test-token');
    expect(code).toContain('MyScene');
  });

  it('includes XR setup when enabled', () => {
    const c = new PlayCanvasCompiler({ enableXR: true });
    const code = c.compile(makeComposition(), 'test-token');
    expect(code).toContain('xr');
  });

  // =========== Objects → entities ===========

  it('compiles objects to PlayCanvas entities', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp, 'test-token');
    expect(code).toContain('Entity');
    expect(code).toContain('cube');
  });

  it('maps sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp, 'test-token');
    expect(code).toContain('ball');
  });

  // =========== Lights ===========

  it('compiles lights', () => {
    const comp = makeComposition({
      lights: [{ name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 1.0 }] }] as any,
    });
    const code = compiler.compile(comp, 'test-token');
    expect(code).toContain('light');
    expect(code).toContain('sun');
  });

  // =========== Camera ===========

  it('compiles camera', () => {
    const comp = makeComposition({
      camera: { name: 'main', properties: [{ key: 'position', value: [0, 5, -10] }] } as any,
    });
    const code = compiler.compile(comp, 'test-token');
    expect(code).toContain('camera');
  });

  // =========== Environment ===========

  it('compiles environment', () => {
    const comp = makeComposition({
      environment: { properties: [{ key: 'skybox', value: 'sunset' }] } as any,
    });
    const code = compiler.compile(comp, 'test-token');
    expect(code).toBeDefined();
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp, 'test-token');
    expect(code).toContain('obj_a');
    expect(code).toContain('obj_b');
  });

  // =========== Spatial groups ===========

  it('compiles spatial groups', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          name: 'grp',
          objects: [{ name: 'child', properties: [{ key: 'geometry', value: 'box' }], traits: [] }],
          properties: [],
        },
      ] as any,
    });
    const code = compiler.compile(comp, 'test-token');
    expect(code).toContain('grp');
  });

  // =========== Reset ===========

  it('resets between compilations', () => {
    compiler.compile(makeComposition({ name: 'first' }), 'test-token');
    const code = compiler.compile(makeComposition({ name: 'second' }), 'test-token');
    expect(code).toContain('second');
  });
});
