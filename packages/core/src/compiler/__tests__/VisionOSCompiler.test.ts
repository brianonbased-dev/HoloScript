import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VisionOSCompiler } from '../VisionOSCompiler';
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
      state: {
        properties: [
          { key: 'count', value: 0 },
          { key: 'active', value: true },
        ],
      },
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
      lights: [
        { name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 1000 }] },
      ] as any,
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

  it('filters @platform() blocks for visionOS before Swift generation', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'vision_panel',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: [],
          platformConstraint: { include: ['visionos'], exclude: [] },
        },
        {
          name: 'android_panel',
          properties: [{ key: 'geometry', value: 'box' }],
          traits: [],
          platformConstraint: { include: ['androidxr'], exclude: [] },
        },
        { name: 'shared_panel', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });

    const swift = compiler.compile(comp, 'test-token');
    expect(swift).toContain('vision_panel');
    expect(swift).toContain('shared_panel');
    expect(swift).not.toContain('android_panel');
  });

  // =========== Reset ===========

  it('resets between compilations', () => {
    compiler.compile(makeComposition({ name: 'first' }), 'test-token');
    const swift = compiler.compile(makeComposition({ name: 'second' }), 'test-token');
    expect(swift).toContain('second');
  });

  // =========== Scene blocks ===========
  // The parser keeps a scene's contents on composition.scenes, not composition.objects.

  const crate = `object "SceneCrate" {
      geometry: "sphere"
      position: [1.5, 2.5, -3.5]
    }`;

  it('compiles an object written only inside a scene like the same object at the top level', () => {
    const inScene = parseClean(`composition "Scenes" {\n  scene "Main" {\n    ${crate}\n  }\n}`);
    const atTop = parseClean(`composition "Scenes" {\n  ${crate}\n}`);
    expect(inScene.objects).toEqual([]);

    const swift = compiler.compile(inScene, 'test-token');
    expect(swift).toContain('let SceneCrateMesh = MeshResource.generateSphere(radius: 0.5)');
    expect(swift).toContain(
      'let SceneCrate = ModelEntity(mesh: SceneCrateMesh, materials: [SimpleMaterial()])'
    );
    expect(swift).toContain('SceneCrate.position = SIMD3<Float>(1.5, 2.5, -3.5)');
    expect(swift).toContain('root.addChild(SceneCrate)');
    expect(swift).toBe(compiler.compile(atTop, 'test-token'));
  });

  it("emits top-level objects first, then each scene's objects in scene order", () => {
    const swift = compiler.compile(
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
    const order = ['AtTop', 'InFirst', 'InSecond'].map((n) => swift.indexOf(`// Object: ${n}`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const n of ['AtTop', 'InFirst', 'InSecond']) {
      expect(swift).toContain(`root.addChild(${n})`);
    }
  });

  it('uses the environment written inside a scene when the composition has none', () => {
    const swift = compiler.compile(
      parseClean(`composition "Scenes" {
  scene "Main" {
    environment { skybox: "sunset" }
  }
}`),
      'test-token'
    );
    expect(swift).toContain('// Environment preset: "sunset"');
    expect(swift).not.toContain('WARNING');
  });

  it("names a scene environment it does not apply, and says the composition's own applies", () => {
    // The composition's own environment is written after the scene; it still wins.
    const swift = compiler.compile(
      parseClean(`composition "Scenes" {
  scene "Night" {
    environment { skybox: "night" }
  }
  environment { skybox: "sunset" }
}`),
      'test-token'
    );
    expect(swift).toContain('// Environment preset: "sunset"');
    expect(swift).not.toContain('"night"');
    expect(swift).toContain(
      `// WARNING: the environment in scene "Night" is not applied: this output is one world with one environment, and the composition's own environment applies.`
    );
  });

  it('leaves out a scene object whose name is already taken, and names it', () => {
    const swift = compiler.compile(
      parseClean(`composition "Scenes" {
  scene "Day" {
    object "Ground" { geometry: "plane" }
  }
  scene "Night" {
    object "Ground" { geometry: "plane" }
    object "Moon" { geometry: "sphere" }
  }
}`),
      'test-token'
    );
    // One scope has one `let Ground`: a second one would not compile.
    expect(swift.match(/let Ground = /g)).toHaveLength(1);
    expect(swift).toContain('let Moon = ModelEntity(');
    expect(swift).toContain(
      '// WARNING: object "Ground" in scene "Night" is not built: this output is one world, and another object in it already uses the name "Ground".'
    );
  });

  // Objects are not the only constants in the RealityView closure: every part below declares the
  // constant named beside it there, and the closure has a `root` and a `content` of its own. A
  // scene object that would declare one again is left out the same way, and the WARNING says
  // what has it.
  const declarations = (swift: string, name: string) =>
    swift.match(new RegExp(`\\b(?:let|var) ${name} = `, 'g')) ?? [];

  it.each([
    ['a light', 'light "Ground" point { intensity: 1 }', 'Ground', 1],
    ['a group', 'spatial_group "Ground" {\n    object "Lamp" { mesh: "sphere" }\n  }', 'Ground', 1],
    ['a sound', 'audio "Ground" { src: "wind.ogg" }', 'Ground', 1],
    ['a zone', 'zone "Ground" { shape: "box" }', 'Ground', 1],
    ['the scene root', '', 'root', 1],
    ['the scene content', '', 'content', 0],
  ])(
    'leaves out a scene object whose constant %s already declares',
    (by, part, name, declaredBy) => {
      const swift = compiler.compile(
        parseClean(`composition "Parts" {
  ${part}
  scene "Level" {
    object "${name}" { geometry: "cube" }
    object "Crate" { geometry: "cube" }
  }
}`),
        'test-token'
      );
      // `content` is the closure's parameter, so there is no `let content` to count.
      expect(declarations(swift, name)).toHaveLength(declaredBy);
      expect(swift).toContain('let Crate = ModelEntity(');
      expect(swift).toContain(
        `// WARNING: object "${name}" in scene "Level" is not built: this output is one world, and ${by} in it already uses the name "${name}".`
      );
    }
  );

  it('counts the constants a part derives from its name, both ways round', () => {
    const swift = compiler.compile(
      parseClean(`composition "Derived" {
  object "Floor" {
    geometry: "box"
    material: { color: "#888888" }
  }
  light "CrateMaterial" point { intensity: 1 }
  scene "Level" {
    object "FloorMesh" { geometry: "cube" }
    object "Crate" {
      geometry: "box"
      material: { color: "#aa5500" }
    }
  }
}`),
      'test-token'
    );
    // Floor's mesh is the constant `FloorMesh`.
    expect(declarations(swift, 'FloorMesh')).toHaveLength(1);
    expect(swift).toContain(
      '// WARNING: object "FloorMesh" in scene "Level" is not built: this output is one world, and another object in it already uses the name "FloorMesh".'
    );
    // Building Crate would declare `CrateMaterial` for its material, and the light has it.
    expect(declarations(swift, 'CrateMaterial')).toHaveLength(1);
    expect(declarations(swift, 'Crate')).toHaveLength(0);
    expect(swift).toContain(
      '// WARNING: object "Crate" in scene "Level" is not built: this output is one world, and a light in it already uses the name "CrateMaterial".'
    );
  });

  it('counts the objects inside an object and inside a spatial group: they are in the same scope', () => {
    const swift = compiler.compile(
      parseClean(`composition "Nested" {
  object "Leg" { geometry: "cylinder" }
  spatial_group "Props" {
    object "Lamp" { mesh: "sphere" }
  }
  scene "Level" {
    object "Table" {
      geometry: "box"
      object "Leg" { geometry: "cylinder" }
    }
    object "Lamp" { geometry: "cube" }
    object "Desk" {
      geometry: "box"
      object "Drawer" { geometry: "box" }
    }
    object "Chest" {
      geometry: "box"
      object "Drawer" { geometry: "box" }
    }
  }
}`),
      'test-token'
    );
    for (const name of ['Leg', 'Lamp', 'Drawer']) {
      expect(declarations(swift, name)).toHaveLength(1);
    }
    // Desk is built with the Drawer inside it; the others would declare a second one.
    expect(declarations(swift, 'Desk')).toHaveLength(1);
    for (const left of ['Table', 'Chest']) expect(declarations(swift, left)).toHaveLength(0);
    for (const [object, taken] of [
      ['Table', 'Leg'],
      ['Lamp', 'Lamp'],
      ['Chest', 'Drawer'],
    ]) {
      expect(swift).toContain(
        `// WARNING: object "${object}" in scene "Level" is not built: this output is one world, and another object in it already uses the name "${taken}".`
      );
    }
    expect(swift.match(/WARNING/g)).toHaveLength(3);
  });

  it('builds a second object that has the same trait: what trait code names inside a block of its own clashes with nothing', () => {
    // @hand_tracking and @animated write locals (`anchor`, `tips`, `controller`, ...) inside their
    // own blocks; the same trait on two objects repeats them, and that is not a clash. Neither is a
    // scene object named like one of them: the object's `let` is in the closure, theirs is not.
    const swift = compiler.compile(
      parseClean(`composition "Traits" {
  object "Floor" {
    @hand_tracking
    @animated
    geometry: "cube"
  }
  scene "Level" {
    object "Wall" {
      @hand_tracking
      @animated
      geometry: "cube"
    }
    object "Roof" {
      @animated
      geometry: "cube"
    }
    object "anchor" { geometry: "cube" }
    object "controller" { geometry: "cube" }
  }
}`),
      'test-token'
    );
    for (const name of ['Floor', 'Wall', 'Roof']) {
      expect(declarations(swift, name)).toHaveLength(1);
    }
    expect(swift).toContain('let anchor = ModelEntity(');
    expect(swift).toContain('let controller = ModelEntity(');
    expect(swift).not.toContain('WARNING');
  });

  it('counts the functions and types a trait writes at the closure level, with the names it derives', () => {
    // @lod writes `struct <Name>LODComponent`, and @controlnet a `func` whose name is the same for
    // every object that has it: in one closure either is a second declaration of the name.
    const swift = compiler.compile(
      parseClean(`composition "Traits" {
  object "ALODComponent" { geometry: "cube" }
  object "Net1" {
    @controlnet
    geometry: "cube"
  }
  scene "Level" {
    object "A" {
      @lod
      geometry: "cube"
    }
    object "Net2" {
      @controlnet
      geometry: "cube"
    }
    object "B" {
      @lod
      geometry: "cube"
    }
  }
}`),
      'test-token'
    );
    expect(swift.match(/^\s*(?:let|struct) ALODComponent\b/gm)).toHaveLength(1);
    expect(swift.match(/^\s*func controlnetInfer_canny\b/gm)).toHaveLength(1);
    expect(declarations(swift, 'A')).toHaveLength(0);
    expect(declarations(swift, 'Net2')).toHaveLength(0);
    // B is the only scene object whose @lod struct (`BLODComponent`) is a name nothing has.
    expect(declarations(swift, 'B')).toHaveLength(1);
    expect(swift).toContain(
      '// WARNING: object "A" in scene "Level" is not built: this output is one world, and another object in it already uses the name "ALODComponent".'
    );
    expect(swift).toContain(
      '// WARNING: object "Net2" in scene "Level" is not built: this output is one world, and another object in it already uses the name "controlnetInfer_canny".'
    );
    expect(swift.match(/WARNING/g)).toHaveLength(2);
  });

  it('compares names as Swift spells them, where "My Box" and "My_Box" are one', () => {
    const swift = compiler.compile(
      parseClean(`composition "Spelled" {
  light "My Box" point { intensity: 1 }
  scene "Level" {
    object "My_Box" { geometry: "cube" }
  }
}`),
      'test-token'
    );
    expect(declarations(swift, 'My_Box')).toHaveLength(1);
    expect(swift).toContain(
      '// WARNING: object "My_Box" in scene "Level" is not built: this output is one world, and a light in it already uses the name "My_Box".'
    );
  });

  it('reads the traits written on a scene object: a grabbable one gets the drag gesture', () => {
    const grabbable = parseClean(`composition "Scenes" {
  scene "Main" {
    object "Ball" {
      @grabbable
      geometry: "sphere"
    }
  }
}`);
    expect(compiler.compile(grabbable, 'test-token')).toContain(
      '.gesture(DragGesture().targetedToAnyEntity().onChanged { value in'
    );
    expect(compiler.compile(makeComposition(), 'test-token')).not.toContain('.gesture(');
  });

  it('builds only the scene objects this platform keeps, and only they take names', () => {
    // The parser does not attach a @platform() written inside a scene, so it is set on the AST.
    const comp = parseClean(`composition "Scenes" {
  scene "Level" {
    object "VROnly" { geometry: "cube" }
    object "Hero" { geometry: "sphere" }
    object "Hero" { geometry: "box" }
  }
}`);
    const [vrOnly, heroForOthers, heroForVisionOS] = comp.scenes![0].objects;
    vrOnly.platformConstraint = { include: ['quest3'], exclude: [] };
    heroForOthers.platformConstraint = { include: ['androidxr'], exclude: [] };
    heroForVisionOS.platformConstraint = { include: ['visionos'], exclude: [] };

    const swift = compiler.compile(comp, 'test-token');
    expect(swift).not.toContain('VROnly');
    // Two variants of one name: the one for this platform is built, once, and nothing is left out.
    expect(swift.match(/let Hero = /g)).toHaveLength(1);
    expect(swift).toContain('let HeroMesh = MeshResource.generateBox(size: 1.0)');
    expect(swift).not.toContain('generateSphere');
    expect(swift).not.toContain('WARNING');
  });

  it('lets a scene object use the name of a top-level object this platform excludes', () => {
    const swift = compiler.compile(
      parseClean(`composition "Scenes" {
  @platform(android-xr) object "Hero" { geometry: "sphere" }
  scene "Level" {
    object "Hero" { geometry: "box" }
  }
}`),
      'test-token'
    );
    expect(swift.match(/let Hero = /g)).toHaveLength(1);
    expect(swift).toContain('let HeroMesh = MeshResource.generateBox(size: 1.0)');
    expect(swift).not.toContain('WARNING');
  });

  it('builds a scene object that clashes with nothing exactly as if it were written at the top level', () => {
    const parts = `light "Sun" directional { intensity: 1 }
  environment { skybox: "sunset" }
  object "Floor" {
    geometry: "box"
    material: { color: "#888888" }
  }
  spatial_group "Props" {
    object "Lamp" { mesh: "sphere" }
  }
  audio "Wind" { src: "wind.ogg" }
  zone "Pad" { shape: "box" }`;
    const barrel = `object "Barrel" {
    geometry: "cylinder"
    material: { color: "#aa5500" }
  }`;
    const inScene = compiler.compile(
      parseClean(`composition "C" {\n  ${parts}\n  scene "Level" {\n    ${barrel}\n  }\n}`),
      'test-token'
    );
    const atTop = compiler.compile(
      parseClean(`composition "C" {\n  ${parts}\n  ${barrel}\n}`),
      'test-token'
    );
    expect(inScene).not.toContain('WARNING');
    expect(inScene).toContain('var BarrelMaterial = PhysicallyBasedMaterial()');
    expect(inScene).toBe(atTop);
  });
});
