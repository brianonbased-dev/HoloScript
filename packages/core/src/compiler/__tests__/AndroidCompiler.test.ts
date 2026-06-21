import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
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

describe('AndroidCompiler', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  // =========== Result structure ===========

  it('returns AndroidCompileResult with all files', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result).toHaveProperty('activityFile');
    expect(result).toHaveProperty('stateFile');
    expect(result).toHaveProperty('nodeFactoryFile');
    expect(result).toHaveProperty('manifestFile');
    expect(result).toHaveProperty('buildGradle');
  });

  // =========== Activity file ===========

  it('generates Kotlin activity file', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.activityFile).toContain('class');
    expect(result.activityFile).toContain('Activity');
  });

  it('includes ARCore imports', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.activityFile).toContain('import');
  });

  // =========== Options ===========

  it('respects custom package name', () => {
    const c = new AndroidCompiler({ packageName: 'com.test.app' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.activityFile).toContain('com.test.app');
  });

  it('respects custom class name', () => {
    const c = new AndroidCompiler({ className: 'MyARActivity' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.activityFile).toContain('MyARActivity');
  });

  // =========== State file ===========

  it('dissolves the state file under the declarative SceneView model', () => {
    const comp = makeComposition({
      state: {
        properties: [
          { key: 'score', value: 0 },
          { key: 'active', value: true },
        ],
      },
    });
    const result = compiler.compile(comp, 'test-token');
    // SceneView keeps state in the composable tree — no separate SceneState ViewModel.
    expect(result.stateFile).toBe('');
  });

  // =========== Objects → declarative nodes ===========

  it('emits a declarative node per object in the activity', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.activityFile).toContain('CubeNode');
    expect(result.nodeFactoryFile).toBe('');
  });

  // =========== Manifest ===========

  it('generates manifest with AR permissions', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.manifestFile).toContain('uses-permission');
  });

  // =========== Build gradle ===========

  it('generates build.gradle with dependencies', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.buildGradle).toContain('dependencies');
  });

  it('respects minSdk option', () => {
    const c = new AndroidCompiler({ minSdk: 26 });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.buildGradle).toContain('26');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects to declarative nodes', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.activityFile).toContain('CubeNode');
    expect(result.activityFile).toContain('SphereNode');
  });

  // =========== Object names in output ===========

  it('includes object names in the generated activity', () => {
    const comp = makeComposition({
      objects: [
        { name: 'my_obj', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.activityFile).toContain('my_obj');
  });

  // =========== Convenience export ===========

  it('exports compileToAndroid convenience function', async () => {
    const mod = await import('../AndroidCompiler');
    expect(mod.compileToAndroid).toBeTypeOf('function');
  });
});
