import { describe, it, expect, beforeEach, vi} from 'vitest';
import { VisionOSCompiler } from '../VisionOSCompiler';
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

describe('VisionOSCompiler', () => {
  let compiler: VisionOSCompiler;

  beforeEach(() => {
    compiler = new VisionOSCompiler();
  });

  // =========== Minimal output ===========

  it('compiles minimal composition to Swift', () => {
    const swift = compiler.compile(makeComposition(), 'test-token');
    expect(swift).toContain('import RealityKit');
    expect(swift).toContain('struct');
  });

  it('includes auto-generated header', () => {
    const swift = compiler.compile(makeComposition(), 'test-token');
    expect(swift).toContain('Auto-generated');
    expect(swift).toContain('TestScene');
  });

  // =========== Options ===========

  it('respects custom struct name', () => {
    const c = new VisionOSCompiler({ structName: 'MyImmersive' });
    const swift = c.compile(makeComposition(), 'test-token');
    expect(swift).toContain('MyImmersive');
  });

  // =========== State → properties ===========

  it('compiles state to Swift properties', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'count', value: 0 }, { key: 'active', value: true }] },
    });
    const swift = compiler.compile(comp, 'test-token');
    expect(swift).toContain('count');
    expect(swift).toContain('active');
  });

  // =========== Objects ===========

  it('compiles objects to RealityKit entities', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const swift = compiler.compile(comp, 'test-token');
    expect(swift).toContain('cube');
    expect(swift).toContain('ModelEntity');
  });

  it('handles sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const swift = compiler.compile(comp, 'test-token');
    expect(swift).toContain('ball');
  });

  // =========== Lights ===========

  it('compiles lights', () => {
    const comp = makeComposition({
      lights: [{ name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 1000 }] }] as any,
    });
    const swift = compiler.compile(comp, 'test-token');
    expect(swift).toContain('sun');
  });

  // =========== Environment ===========

  it('compiles environment', () => {
    const comp = makeComposition({
      environment: { properties: [{ key: 'skybox', value: 'sunset' }] } as any,
    });
    const swift = compiler.compile(comp, 'test-token');
    expect(swift).toBeDefined();
  });

  // =========== Spatial groups ===========

  it('compiles spatial groups', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          name: 'group1',
          objects: [{ name: 'child', properties: [{ key: 'geometry', value: 'box' }], traits: [] }],
          properties: [],
        },
      ] as any,
    });
    const swift = compiler.compile(comp, 'test-token');
    expect(swift).toContain('group1');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const swift = compiler.compile(comp, 'test-token');
    expect(swift).toContain('obj_a');
    expect(swift).toContain('obj_b');
  });

  // =========== Reset ===========

  it('resets between compilations', () => {
    compiler.compile(makeComposition({ name: 'first' }), 'test-token');
    const swift = compiler.compile(makeComposition({ name: 'second' }), 'test-token');
    expect(swift).toContain('second');
  });
});
