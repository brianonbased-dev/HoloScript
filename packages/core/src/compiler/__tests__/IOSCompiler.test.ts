import { describe, it, expect, beforeEach } from 'vitest';
import { IOSCompiler } from '../IOSCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

describe('IOSCompiler', () => {
  let compiler: IOSCompiler;

  beforeEach(() => {
    compiler = new IOSCompiler();
  });

  // =========== Result structure ===========

  it('returns IOSCompileResult with all files', () => {
    const result = compiler.compile(makeComposition());
    expect(result).toHaveProperty('viewFile');
    expect(result).toHaveProperty('sceneFile');
    expect(result).toHaveProperty('stateFile');
    expect(result).toHaveProperty('infoPlist');
  });

  // =========== View file ===========

  it('generates Swift view file', () => {
    const result = compiler.compile(makeComposition());
    expect(result.viewFile).toContain('import');
    expect(result.viewFile).toContain('struct');
  });

  it('includes ARKit framework', () => {
    const result = compiler.compile(makeComposition());
    expect(result.viewFile).toContain('ARKit');
  });

  // =========== Options ===========

  it('respects custom class name', () => {
    const c = new IOSCompiler({ className: 'MyARView' });
    const result = c.compile(makeComposition());
    expect(result.viewFile).toContain('MyARView');
  });

  it('targets iOS version in config', () => {
    const c = new IOSCompiler({ iosVersion: '17.0' });
    const result = c.compile(makeComposition());
    expect(result.viewFile).toBeDefined();
  });

  // =========== Scene file ===========

  it('generates scene file', () => {
    const result = compiler.compile(makeComposition());
    expect(result.sceneFile).toBeDefined();
    expect(result.sceneFile.length).toBeGreaterThan(0);
  });

  // =========== State file ===========

  it('generates state file with properties', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'health', value: 100 }, { key: 'name', value: 'Player' }] },
    });
    const result = compiler.compile(comp);
    expect(result.stateFile).toContain('health');
  });

  // =========== Objects ===========

  it('compiles objects into scene setup', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp);
    expect(result.sceneFile).toContain('cube');
  });

  // =========== Lights ===========

  it('compiles lights', () => {
    const comp = makeComposition({
      lights: [{ name: 'sun', lightType: 'directional', properties: [{ key: 'color', value: '#ffffff' }] }] as any,
    });
    const result = compiler.compile(comp);
    expect(result.sceneFile).toContain('sun');
  });

  // =========== Info.plist ===========

  it('generates Info.plist with camera usage description', () => {
    const result = compiler.compile(makeComposition());
    expect(result.infoPlist).toContain('NSCameraUsageDescription');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp);
    expect(result.sceneFile).toContain('obj_a');
    expect(result.sceneFile).toContain('obj_b');
  });

  // =========== Convenience export ===========

  it('exports compileToIOS convenience function', async () => {
    const mod = await import('../IOSCompiler');
    expect(mod.compileToIOS).toBeTypeOf('function');
  });
});
