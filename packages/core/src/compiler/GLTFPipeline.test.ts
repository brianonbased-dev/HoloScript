import { describe, it, expect, beforeEach } from 'vitest';
import { GLTFPipeline, createGLTFPipeline } from './GLTFPipeline';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';
import { registerAllPresets } from '../traits/visual/index';

// Ensure all visual presets are registered
registerAllPresets();

// ---------------------------------------------------------------------------
// Test helpers — minimal HoloComposition stubs
// ---------------------------------------------------------------------------

function makeObject(name: string, overrides: Partial<HoloObjectDecl> = {}): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: [],
    traits: [],
    templates: [],
    ...overrides,
  } as HoloObjectDecl;
}

function makeComposition(name: string, objects: HoloObjectDecl[] = []): HoloComposition {
  return {
    type: 'Composition',
    name,
    objects,
    spatialGroups: [],
    lights: [],
    templates: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  } as HoloComposition;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GLTFPipeline', () => {
  let pipeline: GLTFPipeline;

  beforeEach(() => {
    pipeline = new GLTFPipeline();
  });

  // ── Construction ─────────────────────────────────────────────────

  it('creates pipeline with default options', () => {
    expect(pipeline).toBeDefined();
  });

  it('creates pipeline via factory function', () => {
    const p = createGLTFPipeline({ format: 'gltf', copyright: 'Test' });
    expect(p).toBeDefined();
  });

  // ── Basic compilation ────────────────────────────────────────────

  it('compiles empty composition to valid GLB', () => {
    const comp = makeComposition('Empty');
    const result = pipeline.compile(comp);

    expect(result.binary).toBeDefined();
    expect(result.binary!.length).toBeGreaterThan(0);
    expect(result.stats.nodeCount).toBe(0);
    expect(result.stats.meshCount).toBe(0);
  });

  it('compiles single box object', () => {
    const obj = makeObject('TestBox', {
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'box' },
        { type: 'ObjectProperty', key: 'position', value: [1, 2, -3] },
        { type: 'ObjectProperty', key: 'color', value: '#ff0000' },
      ],
    });
    const comp = makeComposition('BoxScene', [obj]);
    const result = pipeline.compile(comp);

    expect(result.stats.nodeCount).toBe(1);
    expect(result.stats.meshCount).toBe(1);
    expect(result.stats.materialCount).toBe(1);
    expect(result.stats.totalVertices).toBe(24); // box = 24 verts
    expect(result.stats.totalTriangles).toBe(12); // box = 12 tris
  });

  it('compiles sphere geometry', () => {
    const obj = makeObject('Ball', {
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'sphere' }],
    });
    const comp = makeComposition('SphereScene', [obj]);
    const result = pipeline.compile(comp);

    expect(result.stats.meshCount).toBe(1);
    expect(result.stats.totalVertices).toBeGreaterThan(100); // UV sphere has many verts
  });

  it('compiles cylinder geometry', () => {
    const obj = makeObject('Pipe', {
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'cylinder' }],
    });
    const comp = makeComposition('CylinderScene', [obj]);
    const result = pipeline.compile(comp);

    expect(result.stats.meshCount).toBe(1);
    expect(result.stats.totalVertices).toBeGreaterThan(40);
  });

  it('compiles plane geometry', () => {
    const obj = makeObject('Floor', {
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'plane' }],
    });
    const comp = makeComposition('PlaneScene', [obj]);
    const result = pipeline.compile(comp);

    expect(result.stats.meshCount).toBe(1);
    expect(result.stats.totalVertices).toBe(4); // plane = 4 verts
    expect(result.stats.totalTriangles).toBe(2);
  });

  // ── GLB binary format ────────────────────────────────────────────

  it('GLB starts with magic bytes 0x46546C67', () => {
    const obj = makeObject('Cube', {
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'box' }],
    });
    const result = pipeline.compile(makeComposition('GLBTest', [obj]));
    const view = new DataView(result.binary!.buffer);

    // glTF magic: 0x46546C67 (little-endian)
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    // Version 2
    expect(view.getUint32(4, true)).toBe(2);
    // Total length matches buffer length
    expect(view.getUint32(8, true)).toBe(result.binary!.length);
  });

  // ── JSON format ──────────────────────────────────────────────────

  it('compiles to JSON format when format = gltf', () => {
    const p = new GLTFPipeline({ format: 'gltf' });
    const obj = makeObject('Cube', {
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'box' }],
    });
    const result = p.compile(makeComposition('JSONTest', [obj]));

    expect(result.json).toBeDefined();
    expect(result.buffer).toBeDefined();
    const doc = result.json as Record<string, unknown>;
    expect(doc.asset).toBeDefined();
    expect((doc.asset as Record<string, unknown>).version).toBe('2.0');
    expect(doc.scene).toBe(0);
    expect(doc.scenes).toBeDefined();
    expect(doc.nodes).toBeDefined();
    expect(doc.meshes).toBeDefined();
    expect(doc.materials).toBeDefined();
  });

  // ── Multiple objects ─────────────────────────────────────────────

  it('compiles multiple objects', () => {
    const objects = [
      makeObject('Box1', {
        properties: [
          { type: 'ObjectProperty', key: 'geometry', value: 'box' },
          { type: 'ObjectProperty', key: 'position', value: [0, 0, 0] },
        ],
      }),
      makeObject('Sphere1', {
        properties: [
          { type: 'ObjectProperty', key: 'geometry', value: 'sphere' },
          { type: 'ObjectProperty', key: 'position', value: [2, 0, 0] },
        ],
      }),
      makeObject('Cone1', {
        properties: [
          { type: 'ObjectProperty', key: 'geometry', value: 'cone' },
          { type: 'ObjectProperty', key: 'position', value: [-2, 0, 0] },
        ],
      }),
    ];

    const result = pipeline.compile(makeComposition('MultiScene', objects));
    expect(result.stats.nodeCount).toBe(3);
    expect(result.stats.meshCount).toBe(3);
  });

  // ── Child objects ────────────────────────────────────────────────

  it('compiles nested child objects', () => {
    const parent = makeObject('Parent', {
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'box' },
        { type: 'ObjectProperty', key: 'position', value: [0, 0, 0] },
      ],
      children: [
        makeObject('Child1', {
          properties: [
            { type: 'ObjectProperty', key: 'geometry', value: 'sphere' },
            { type: 'ObjectProperty', key: 'position', value: [1, 0, 0] },
          ],
        }),
        makeObject('Child2', {
          properties: [
            { type: 'ObjectProperty', key: 'geometry', value: 'cylinder' },
            { type: 'ObjectProperty', key: 'position', value: [-1, 0, 0] },
          ],
        }),
      ],
    });

    const result = pipeline.compile(makeComposition('NestedScene', [parent]));
    expect(result.stats.nodeCount).toBe(3); // parent + 2 children
  });

  // ── Spatial groups ───────────────────────────────────────────────

  it('compiles spatial groups with objects', () => {
    const comp = makeComposition('GroupScene');
    comp.spatialGroups = [
      {
        type: 'SpatialGroup',
        name: 'Room',
        properties: [{ type: 'GroupProperty', key: 'position', value: [0, 0, -5] }],
        objects: [
          makeObject('Table', {
            properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'box' }],
          }),
        ],
      } as any,
    ];

    const result = pipeline.compile(comp);
    // 1 group node + 1 object node
    expect(result.stats.nodeCount).toBe(2);
  });

  // ── Trait-based materials ────────────────────────────────────────

  it('composes material from VR traits', () => {
    const obj = makeObject('MetalCube', {
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'box' }],
      traits: [
        { type: 'ObjectTrait', name: 'iron_material', config: {} },
        { type: 'ObjectTrait', name: 'polished', config: {} },
      ],
    });

    const p = new GLTFPipeline({ format: 'gltf' });
    const result = p.compile(makeComposition('TraitScene', [obj]));
    const doc = result.json as Record<string, unknown>;
    const materials = doc.materials as Array<{ pbrMetallicRoughness?: Record<string, unknown> }>;

    expect(materials.length).toBeGreaterThanOrEqual(1);
    const pbr = materials[0].pbrMetallicRoughness;
    expect(pbr).toBeDefined();
    // iron_material has metalness: 0.9
    expect(pbr!.metallicFactor).toBeGreaterThan(0);
  });

  it('composes material from named material preset', () => {
    const obj = makeObject('GlassOrb', {
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'sphere' },
        { type: 'ObjectProperty', key: 'material', value: 'glass' },
      ],
    });

    const p = new GLTFPipeline({ format: 'gltf' });
    const result = p.compile(makeComposition('GlassScene', [obj]));
    const doc = result.json as Record<string, unknown>;
    const materials = doc.materials as Array<{
      pbrMetallicRoughness?: { roughnessFactor?: number; baseColorFactor?: number[] };
      alphaMode?: string;
    }>;

    expect(materials.length).toBeGreaterThanOrEqual(1);
    // Glass has low roughness and is transparent (BLEND alpha mode)
    expect(materials[0].pbrMetallicRoughness!.roughnessFactor).toBe(0);
    expect(materials[0].alphaMode).toBe('BLEND');
  });

  it('direct color override takes precedence over traits', () => {
    const obj = makeObject('ColorOverride', {
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'box' },
        { type: 'ObjectProperty', key: 'color', value: '#00ff00' },
      ],
      traits: [{ type: 'ObjectTrait', name: 'rusty', config: {} }],
    });

    const p = new GLTFPipeline({ format: 'gltf' });
    const result = p.compile(makeComposition('OverrideScene', [obj]));
    const doc = result.json as Record<string, unknown>;
    const materials = doc.materials as Array<{
      pbrMetallicRoughness?: { baseColorFactor?: number[] };
    }>;

    // Color should be green (#00ff00) regardless of rusty trait's color
    const baseColor = materials[0].pbrMetallicRoughness!.baseColorFactor!;
    expect(baseColor[0]).toBeCloseTo(0, 1); // R
    expect(baseColor[1]).toBeCloseTo(1, 1); // G
    expect(baseColor[2]).toBeCloseTo(0, 1); // B
  });

  // ── Material caching ─────────────────────────────────────────────

  it('deduplicates identical materials', () => {
    const obj1 = makeObject('Cube1', {
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'box' },
        { type: 'ObjectProperty', key: 'color', value: '#ff0000' },
      ],
    });
    const obj2 = makeObject('Cube2', {
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'box' },
        { type: 'ObjectProperty', key: 'color', value: '#ff0000' },
      ],
    });

    const result = pipeline.compile(makeComposition('DedupScene', [obj1, obj2]));
    // Same color → same material → deduped
    expect(result.stats.materialCount).toBe(1);
    expect(result.stats.meshCount).toBe(2); // meshes are still separate
  });

  // ── Lights ───────────────────────────────────────────────────────

  it('includes lights as nodes with extras', () => {
    const comp = makeComposition('LightScene');
    comp.lights = [
      {
        type: 'Light',
        name: 'Sun',
        lightType: 'directional',
        properties: [
          { type: 'LightProperty', key: 'color', value: '#ffffee' },
          { type: 'LightProperty', key: 'intensity', value: 1.5 },
          { type: 'LightProperty', key: 'position', value: [0, 10, 0] },
        ],
      } as any,
    ];

    const p = new GLTFPipeline({ format: 'gltf' });
    const result = p.compile(comp);
    const doc = result.json as Record<string, unknown>;
    const nodes = doc.nodes as Array<{ name?: string; extras?: Record<string, unknown> }>;

    const lightNode = nodes.find((n) => n.name === 'Sun');
    expect(lightNode).toBeDefined();
    expect(lightNode!.extras?.type).toBe('light');
    expect(lightNode!.extras?.lightType).toBe('directional');
    expect(lightNode!.extras?.intensity).toBe(1.5);
  });

  // ── Camera ───────────────────────────────────────────────────────

  it('includes camera as node with extras', () => {
    const comp = makeComposition('CameraScene');
    comp.camera = {
      type: 'Camera',
      cameraType: 'perspective',
      properties: [
        { type: 'CameraProperty', key: 'fov', value: 60 },
        { type: 'CameraProperty', key: 'position', value: [0, 5, 10] },
      ],
    } as any;

    const p = new GLTFPipeline({ format: 'gltf' });
    const result = p.compile(comp);
    const doc = result.json as Record<string, unknown>;
    const nodes = doc.nodes as Array<{
      name?: string;
      extras?: Record<string, unknown>;
      translation?: number[];
    }>;

    const camNode = nodes.find((n) => n.extras?.type === 'camera');
    expect(camNode).toBeDefined();
    expect(camNode!.extras!.fov).toBe(60);
    expect(camNode!.translation).toEqual([0, 5, 10]);
  });

  // ── Default geometry ─────────────────────────────────────────────

  it('defaults to box when no geometry specified', () => {
    const obj = makeObject('NoGeom', {
      properties: [{ type: 'ObjectProperty', key: 'position', value: [0, 0, 0] }],
    });

    const result = pipeline.compile(makeComposition('DefaultGeom', [obj]));
    expect(result.stats.meshCount).toBe(1);
    expect(result.stats.totalVertices).toBe(24); // box = 24 verts
  });

  // ── Stats ────────────────────────────────────────────────────────

  it('reports accurate file size in stats', () => {
    const obj = makeObject('Cube', {
      properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'box' }],
    });
    const result = pipeline.compile(makeComposition('StatsTest', [obj]));

    expect(result.stats.fileSizeBytes).toBe(result.binary!.length);
    expect(result.stats.fileSizeBytes).toBeGreaterThan(0);
  });

  // ── Transform ────────────────────────────────────────────────────

  it('applies position, rotation and scale transforms', () => {
    const obj = makeObject('Transformed', {
      properties: [
        { type: 'ObjectProperty', key: 'geometry', value: 'box' },
        { type: 'ObjectProperty', key: 'position', value: [3, 4, 5] },
        { type: 'ObjectProperty', key: 'rotation', value: [0, 90, 0] },
        { type: 'ObjectProperty', key: 'scale', value: [2, 2, 2] },
      ],
    });

    const p = new GLTFPipeline({ format: 'gltf' });
    const result = p.compile(makeComposition('TransformTest', [obj]));
    const doc = result.json as Record<string, unknown>;
    const nodes = doc.nodes as Array<{ translation?: number[]; rotation?: number[] }>;

    expect(nodes[0].translation).toEqual([3, 4, 5]);
    expect(nodes[0].rotation).toBeDefined();
    // 90° Y rotation quaternion: [0, sin(45°), 0, cos(45°)] ≈ [0, 0.707, 0, 0.707]
    expect(nodes[0].rotation![1]).toBeCloseTo(0.707, 2);
    expect(nodes[0].rotation![3]).toBeCloseTo(0.707, 2);
  });
});
