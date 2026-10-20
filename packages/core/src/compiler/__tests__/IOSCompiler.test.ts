import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IOSCompiler } from '../IOSCompiler';
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

describe('IOSCompiler', () => {
  let compiler: IOSCompiler;

  beforeEach(() => {
    compiler = new IOSCompiler();
  });

  // =========== Result structure ===========

  it('returns IOSCompileResult with all files', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result).toHaveProperty('viewFile');
    expect(result).toHaveProperty('sceneFile');
    expect(result).toHaveProperty('stateFile');
    expect(result).toHaveProperty('infoPlist');
  });

  // =========== View file ===========

  it('generates Swift view file', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.viewFile).toContain('import');
    expect(result.viewFile).toContain('struct');
  });

  it('includes ARKit framework', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.viewFile).toContain('ARKit');
  });

  // =========== Options ===========

  it('respects custom class name', () => {
    const c = new IOSCompiler({ className: 'MyARView' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.viewFile).toContain('MyARView');
  });

  it('targets iOS version in config', () => {
    const c = new IOSCompiler({ iosVersion: '17.0' });
    const result = c.compile(makeComposition(), 'test-token');
    expect(result.viewFile).toBeDefined();
  });

  // =========== Scene file ===========

  it('generates scene file', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.sceneFile).toBeDefined();
    expect(result.sceneFile.length).toBeGreaterThan(0);
  });

  // =========== State file ===========

  it('generates state file with properties', () => {
    const comp = makeComposition({
      state: {
        properties: [
          { key: 'health', value: 100 },
          { key: 'name', value: 'Player' },
        ],
      },
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.stateFile).toContain('health');
  });

  // =========== Objects ===========

  it('compiles objects into scene setup', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.sceneFile).toContain('cube');
  });

  // =========== Lights ===========

  it('compiles lights', () => {
    const comp = makeComposition({
      lights: [
        { name: 'sun', lightType: 'directional', properties: [{ key: 'color', value: '#ffffff' }] },
      ] as any,
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.sceneFile).toContain('sun');
  });

  // =========== Info.plist ===========

  it('generates Info.plist with camera usage description', () => {
    const result = compiler.compile(makeComposition(), 'test-token');
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
    const result = compiler.compile(comp, 'test-token');
    expect(result.sceneFile).toContain('obj_a');
    expect(result.sceneFile).toContain('obj_b');
  });

  // =========== Convenience export ===========

  it('exports compileToIOS convenience function', async () => {
    const mod = await import('../IOSCompiler');
    expect(mod.compileToIOS).toBeTypeOf('function');
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
    expect(result.sceneFile).toContain('static func makeSceneCrate() -> SCNNode {');
    expect(result.sceneFile).toContain('let geometry = SCNSphere(radius: 0.05)');
    expect(result.sceneFile).toContain('node.position = SCNVector3(1.5, 2.5, -3.5)');
    expect(result.sceneFile).toContain('nodes["SceneCrate"] = makeSceneCrate()');
    expect(result).toEqual(compiler.compile(atTop, 'test-token'));
  });

  it("emits top-level objects first, then each scene's objects in scene order", () => {
    const { sceneFile } = compiler.compile(
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
    for (const prefix of ['static func make', 'nodes["']) {
      const at = (n: string) => sceneFile.indexOf(`${prefix}${n}`);
      const order = ['AtTop', 'InFirst', 'InSecond'].map(at);
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });

  it('leaves out a scene object whose name is already taken, and names it', () => {
    const { sceneFile } = compiler.compile(
      parseClean(`composition "Scenes" {
  object "Floor" { geometry: "plane" }
  scene "Day" {
    object "Ground" { geometry: "plane" }
    object "Floor" { geometry: "plane" }
  }
  scene "Night" {
    object "Ground" { geometry: "plane" }
    object "Moon" { geometry: "sphere" }
  }
}`),
      'test-token'
    );
    // One enum has one `makeGround`: a second one would not compile.
    expect(sceneFile.match(/static func makeGround\(/g)).toHaveLength(1);
    expect(sceneFile.match(/static func makeFloor\(/g)).toHaveLength(1);
    expect(sceneFile).toContain('static func makeMoon() -> SCNNode {');
    expect(sceneFile).toContain(
      '// WARNING: object "Ground" in scene "Night" is not built: this output is one world, and another object in it already uses the name "Ground".'
    );
    expect(sceneFile).toContain(
      '// WARNING: object "Floor" in scene "Day" is not built: this output is one world, and another object in it already uses the name "Floor".'
    );
    expect(sceneFile.match(/WARNING/g)).toHaveLength(2);
  });

  it('compares names as the Swift function is spelled, where "crate" and "Crate" are one', () => {
    const { sceneFile } = compiler.compile(
      parseClean(`composition "Scenes" {
  object "Crate" { geometry: "cube" }
  scene "Level" {
    object "crate" { geometry: "cube" }
    object "My Box" { geometry: "cube" }
    object "My_Box" { geometry: "cube" }
  }
}`),
      'test-token'
    );
    expect(sceneFile.match(/static func makeCrate\(/g)).toHaveLength(1);
    expect(sceneFile.match(/static func makeMy_Box\(/g)).toHaveLength(1);
    expect(sceneFile).toContain(
      '// WARNING: object "crate" in scene "Level" is not built: this output is one world, and another object in it already uses the name "Crate".'
    );
    expect(sceneFile).toContain(
      '// WARNING: object "My_Box" in scene "Level" is not built: this output is one world, and another object in it already uses the name "My_Box".'
    );
    // The composition's own objects are never left out, even when two share a name.
    expect(sceneFile.match(/WARNING/g)).toHaveLength(2);
  });

  it('builds a scene object that shares its name with a light or a sound: those are in enums of their own', () => {
    const { sceneFile } = compiler.compile(
      parseClean(`composition "Parts" {
  light "Ground" point { intensity: 1 }
  audio "Ground" { src: "wind.ogg" }
  scene "Level" {
    object "Ground" { geometry: "plane" }
  }
}`),
      'test-token'
    );
    // One `makeGround` in each of the three enums.
    expect(sceneFile.match(/static func makeGround\(/g)).toHaveLength(3);
    expect(sceneFile).toContain('enum GeneratedARSceneObjects {');
    expect(sceneFile).toContain('enum SceneLights {');
    expect(sceneFile).toContain('enum SceneAudio {');
    expect(sceneFile).not.toContain('WARNING');
  });

  it('counts only the objects this target builds: one inside a spatial group takes no name', () => {
    // Spatial groups and the objects inside objects are not built here, so no function is
    // declared for them and a scene object of the same name has nothing to clash with.
    const { sceneFile } = compiler.compile(
      parseClean(`composition "Parts" {
  spatial_group "Props" {
    object "Lamp" { geometry: "sphere" }
  }
  scene "Level" {
    object "Lamp" { geometry: "sphere" }
  }
}`),
      'test-token'
    );
    expect(sceneFile.match(/static func makeLamp\(/g)).toHaveLength(1);
    expect(sceneFile).not.toContain('WARNING');
  });

  it('reads the traits written on a scene object: they reach the feature file', () => {
    const scanner = parseClean(`composition "Scenes" {
  scene "Main" {
    object "Scanner" {
      @lidar_scan
      geometry: "cube"
    }
  }
}`);
    expect(compiler.compile(scanner, 'test-token').lidarScannerFile).toBeDefined();
    // Without a scene object carrying the trait there is no such file.
    expect(compiler.compile(makeComposition(), 'test-token').lidarScannerFile).toBeUndefined();
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
    expect(result.sceneFile).not.toContain('WARNING');
    expect(result).toEqual(compiler.compile(withoutEnvironments, 'test-token'));
  });

  it('builds a scene object that clashes with nothing exactly as if it were written at the top level', () => {
    const parts = `light "Sun" directional { intensity: 1 }
  audio "Wind" { src: "wind.ogg" }
  object "Floor" { geometry: "box" color: "#888888" }`;
    const barrel = `object "Barrel" { geometry: "cylinder" scale: [0.5, 1, 0.5] }`;
    const inScene = compiler.compile(
      parseClean(`composition "C" {\n  ${parts}\n  scene "Level" {\n    ${barrel}\n  }\n}`),
      'test-token'
    );
    const atTop = compiler.compile(
      parseClean(`composition "C" {\n  ${parts}\n  ${barrel}\n}`),
      'test-token'
    );
    expect(inScene.sceneFile).not.toContain('WARNING');
    expect(inScene.sceneFile).toContain('static func makeBarrel() -> SCNNode {');
    expect(inScene).toEqual(atTop);
  });
});
