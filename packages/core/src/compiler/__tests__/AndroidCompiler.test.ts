import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import { parseHolo } from '../../parser/HoloCompositionParser';
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

/** Parse .holo source that must read without an error. */
function parseClean(source: string): HoloComposition {
  const result = parseHolo(source);
  expect(result.errors).toEqual([]);
  expect(result.ast).toBeDefined();
  return result.ast as HoloComposition;
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

  // =========== Scene blocks ===========
  // The parser keeps a scene's contents on composition.scenes, not composition.objects.

  const crate = `object "SceneCrate" {
      geometry: "sphere"
      position: [1.5, 2.5, -3.5]
      color: "#ff0000"
    }`;

  it('compiles an object written only inside a scene like the same object at the top level', () => {
    const inScene = parseClean(`composition "Scenes" {\n  scene "Main" {\n    ${crate}\n  }\n}`);
    const atTop = parseClean(`composition "Scenes" {\n  ${crate}\n}`);
    expect(inScene.objects).toEqual([]);

    const result = compiler.compile(inScene, 'test-token');
    expect(result.activityFile).toContain('// SceneCrate — geometry: sphere');
    expect(result.activityFile).toContain('SphereNode(');
    expect(result.activityFile).toContain('position = Position(x = 1.5f, y = 2.5f, z = -3.5f)');
    expect(result).toEqual(compiler.compile(atTop, 'test-token'));
  });

  it("emits top-level objects first, then each scene's objects in scene order", () => {
    const { activityFile } = compiler.compile(
      parseClean(`composition "Scenes" {
  scene "First" {
    object "InFirst" { geometry: "cube" }
  }
  object "AtTop" { geometry: "cube" }
  scene "Second" {
    object "InSecond" { geometry: "cube" }
  }
}`),
      'test-token'
    );
    const order = ['AtTop', 'InFirst', 'InSecond'].map((n) => activityFile.indexOf(`// ${n} —`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('builds a scene object that shares its name with a top-level one: here a name is only a comment', () => {
    // Every object is a node composable of its own and nothing is declared under its name (the
    // feature files quote it as a string), so there is nothing to clash and nothing to leave out.
    const { activityFile } = compiler.compile(
      parseClean(`composition "Scenes" {
  object "Ground" { geometry: "cube" }
  scene "Night" {
    object "Ground" { geometry: "cylinder" }
    object "ground" { geometry: "sphere" }
  }
}`),
      'test-token'
    );
    expect(activityFile.match(/\/\/ Ground — geometry:/g)).toHaveLength(2);
    expect(activityFile).toContain('// ground — geometry: sphere');
    expect(activityFile).toContain('CubeNode(');
    expect(activityFile).toContain('CylinderNode(');
    expect(activityFile).not.toContain('WARNING');
  });

  it('reads the traits written on a scene object: they reach the feature file and the manifest', () => {
    const result = compiler.compile(
      parseClean(`composition "Scenes" {
  scene "Main" {
    object "Anchor" {
      @geo_anchor { latitude: 37.5 longitude: -122.25 }
      geometry: "cube"
    }
  }
}`),
      'test-token'
    );
    expect(result.geoAnchorSetup).toContain('SceneViewGeoAnchor("Anchor", 37.5, -122.25, 0, 0f)');
    expect(result.manifestFile).toContain('android.permission.ACCESS_FINE_LOCATION');
    // Without a scene object carrying the trait there is no such file.
    expect(compiler.compile(makeComposition(), 'test-token').geoAnchorSetup).toBeUndefined();
  });

  it('says nothing about a scene environment: no part of this target reads an environment', () => {
    const withEnvironments = parseClean(`composition "Scenes" {
  environment { skybox: "sunset" }
  scene "Night" {
    environment { skybox: "night" }
    object "Moon" { geometry: "sphere" }
  }
}`);
    const withoutEnvironments = parseClean(`composition "Scenes" {
  scene "Night" {
    object "Moon" { geometry: "sphere" }
  }
}`);
    const result = compiler.compile(withEnvironments, 'test-token');
    expect(result.activityFile).not.toContain('WARNING');
    expect(result).toEqual(compiler.compile(withoutEnvironments, 'test-token'));
  });
});
