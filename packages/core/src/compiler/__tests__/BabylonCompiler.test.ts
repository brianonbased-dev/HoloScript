import { describe, it, expect, beforeEach } from 'vitest';
import { BabylonCompiler } from '../BabylonCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

describe('BabylonCompiler', () => {
  let compiler: BabylonCompiler;

  beforeEach(() => {
    compiler = new BabylonCompiler();
  });

  // =========== Minimal output ===========

  it('compiles minimal composition to Babylon.js code', () => {
    const code = compiler.compile(makeComposition());
    expect(code).toContain('BABYLON');
    expect(code).toContain('Scene');
  });

  it('includes scene setup', () => {
    const code = compiler.compile(makeComposition());
    expect(code).toContain('Engine');
  });

  // =========== Options ===========

  it('respects custom class name', () => {
    const c = new BabylonCompiler({ className: 'MyScene' });
    const code = c.compile(makeComposition());
    expect(code).toContain('MyScene');
  });

  it('includes XR setup when enabled', () => {
    const c = new BabylonCompiler({ enableXR: true });
    const code = c.compile(makeComposition());
    expect(code).toContain('XR');
  });

  // =========== Objects → MeshBuilder ===========

  it('compiles objects to MeshBuilder calls', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('MeshBuilder');
    expect(code).toContain('cube');
  });

  it('maps sphere geometry to CreateSphere', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('CreateSphere');
  });

  // =========== Lights ===========

  it('compiles lights', () => {
    const comp = makeComposition({
      lights: [{ name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 1.5 }] }] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('Light');
    expect(code).toContain('sun');
  });

  // =========== Camera ===========

  it('compiles camera', () => {
    const comp = makeComposition({
      camera: { name: 'main', properties: [{ key: 'position', value: [0, 5, -10] }] } as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('Camera');
  });

  // =========== Environment ===========

  it('compiles environment', () => {
    const comp = makeComposition({
      environment: { properties: [{ key: 'skybox', value: 'sunset' }] } as any,
    });
    const code = compiler.compile(comp);
    expect(code).toBeDefined();
  });

  // =========== Render loop ===========

  it('generates render loop', () => {
    const code = compiler.compile(makeComposition());
    expect(code).toContain('runRenderLoop');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const code = compiler.compile(comp);
    expect(code).toContain('obj_a');
    expect(code).toContain('obj_b');
  });

  // =========== Reset ===========

  it('resets between compilations', () => {
    compiler.compile(makeComposition({ name: 'first' }));
    const code = compiler.compile(makeComposition({ name: 'second' }));
    expect(code).toContain('second');
  });
});
