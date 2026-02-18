import { describe, it, expect, beforeEach } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

describe('AndroidCompiler', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  // =========== Result structure ===========

  it('returns AndroidCompileResult with all files', () => {
    const result = compiler.compile(makeComposition());
    expect(result).toHaveProperty('activityFile');
    expect(result).toHaveProperty('stateFile');
    expect(result).toHaveProperty('nodeFactoryFile');
    expect(result).toHaveProperty('manifestFile');
    expect(result).toHaveProperty('buildGradle');
  });

  // =========== Activity file ===========

  it('generates Kotlin activity file', () => {
    const result = compiler.compile(makeComposition());
    expect(result.activityFile).toContain('class');
    expect(result.activityFile).toContain('Activity');
  });

  it('includes ARCore imports', () => {
    const result = compiler.compile(makeComposition());
    expect(result.activityFile).toContain('import');
  });

  // =========== Options ===========

  it('respects custom package name', () => {
    const c = new AndroidCompiler({ packageName: 'com.test.app' });
    const result = c.compile(makeComposition());
    expect(result.activityFile).toContain('com.test.app');
  });

  it('respects custom class name', () => {
    const c = new AndroidCompiler({ className: 'MyARActivity' });
    const result = c.compile(makeComposition());
    expect(result.activityFile).toContain('MyARActivity');
  });

  // =========== State file ===========

  it('generates state file with state properties', () => {
    const comp = makeComposition({
      state: { properties: [{ key: 'score', value: 0 }, { key: 'active', value: true }] },
    });
    const result = compiler.compile(comp);
    expect(result.stateFile).toContain('score');
    expect(result.stateFile).toContain('active');
  });

  // =========== Objects → node factory ===========

  it('generates node factory for objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp);
    expect(result.nodeFactoryFile).toContain('NodeFactory');
  });

  // =========== Manifest ===========

  it('generates manifest with AR permissions', () => {
    const result = compiler.compile(makeComposition());
    expect(result.manifestFile).toContain('uses-permission');
  });

  // =========== Build gradle ===========

  it('generates build.gradle with dependencies', () => {
    const result = compiler.compile(makeComposition());
    expect(result.buildGradle).toContain('dependencies');
  });

  it('respects minSdk option', () => {
    const c = new AndroidCompiler({ minSdk: 26 });
    const result = c.compile(makeComposition());
    expect(result.buildGradle).toContain('26');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects to factory methods', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp);
    expect(result.nodeFactoryFile).toContain('NodeFactory');
    expect(result.nodeFactoryFile).toContain('Renderable');
  });

  // =========== Name sanitization ===========

  it('sanitizes object names in Kotlin output', () => {
    const comp = makeComposition({
      objects: [
        { name: 'my_obj', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp);
    expect(result.nodeFactoryFile).toContain('createDefaultNode');
  });

  // =========== Convenience export ===========

  it('exports compileToAndroid convenience function', async () => {
    const mod = await import('../AndroidCompiler');
    expect(mod.compileToAndroid).toBeTypeOf('function');
  });
});
