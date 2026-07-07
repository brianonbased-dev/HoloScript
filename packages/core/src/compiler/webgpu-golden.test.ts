import { describe, it, expect, vi } from 'vitest';
import { WebGPUCompiler } from './WebGPUCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloLight,
  HoloCamera,
} from '../parser/HoloCompositionTypes';

// Mirror WebGPUCompiler.test.ts: allow compiler access under test.
vi.mock('./identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

const prop = (key: string, value: unknown) => ({ key, value });
const obj = (name: string, props: Array<{ key: string; value: unknown }>): HoloObjectDecl =>
  ({ type: 'ObjectDecl', name, properties: props, traits: [] }) as HoloObjectDecl;

// A representative scene that exercises EVERY emitted geometry path (cube, sphere,
// torus, cylinder, cone, plane, orb-alias, unmapped fallback) plus a spatial group,
// lights, camera and environment. This is the byte-diff BASELINE that guards the
// render-module refactor (Slices 1-5): any change to compile() output surfaces here
// as a snapshot diff, so behavior-preserving extractions can be proven byte-identical
// and intended behavior changes (e.g. template mesh resolution) are reviewed as an
// explicit, deliberate diff instead of slipping past presence-only assertions.
const GOLDEN_SCENE: HoloComposition = {
  type: 'HoloComposition',
  name: 'WebGPUGoldenScene',
  environment: {
    type: 'Environment',
    properties: [prop('skybox', 'deep_machine_ocean'), prop('ambient_light', 0.42)],
  },
  objects: [
    obj('BoxObj', [prop('mesh', 'cube'), prop('position', [0, 0, 0]), prop('color', '#ff8870'), prop('scale', [1, 1, 1])]),
    obj('SphereObj', [prop('mesh', 'sphere'), prop('position', [1.5, 0, 0]), prop('color', '#36e5ff')]),
    obj('TorusObj', [prop('mesh', 'torus'), prop('position', [-1.5, 0, 0]), prop('color', '#20def0')]),
    obj('CylinderObj', [prop('mesh', 'cylinder'), prop('position', [0, 1.5, 0])]),
    obj('ConeObj', [prop('mesh', 'cone'), prop('position', [0, -1.5, 0])]),
    obj('PlaneObj', [prop('mesh', 'plane'), prop('position', [0, 0, -2]), prop('color', '#06131f')]),
    obj('OrbObj', [prop('mesh', 'orb'), prop('position', [2, 2, 0])]),
    obj('UnmappedMeshObj', [prop('mesh', 'rounded_panel'), prop('position', [-2, -2, 0])]),
  ],
  spatialGroups: [
    {
      type: 'SpatialGroup',
      name: 'GroupA',
      objects: [
        obj('GroupedSphere', [prop('mesh', 'sphere'), prop('position', [3, 0, 0]), prop('color', '#58ffc7')]),
        obj('GroupedCube', [prop('mesh', 'cube'), prop('position', [3, 1, 0])]),
      ],
      properties: [],
    } as HoloSpatialGroup,
  ],
  lights: [
    {
      type: 'Light',
      name: 'Key',
      lightType: 'directional',
      properties: [prop('position', [10, 20, 10]), prop('intensity', 1.2)],
    } as HoloLight,
  ],
  camera: {
    type: 'Camera',
    cameraType: 'perspective',
    properties: [prop('position', [0, 3, 10]), prop('target', [0, 0, 0])],
  } as HoloCamera,
} as HoloComposition;

describe('WebGPU golden output (byte-diff baseline for render-module refactor)', () => {
  it('compiles the golden scene to a stable, full-scene string', () => {
    const out = new WebGPUCompiler().compile(GOLDEN_SCENE, 'golden-token');
    // Sanity: this is a whole-scene compile, not a fragment.
    expect(out).toContain('navigator.gpu.requestAdapter()');
    expect(out).toContain('canvas.getContext("webgpu")');
    expect(out.length).toBeGreaterThan(2000);
    expect(out).toMatchSnapshot();
  });

  it('is deterministic — two compiles of the same scene are byte-identical', () => {
    const a = new WebGPUCompiler().compile(GOLDEN_SCENE, 'golden-token');
    const b = new WebGPUCompiler().compile(GOLDEN_SCENE, 'golden-token');
    expect(a).toEqual(b);
  });

  it('named glow material (hologram) self-illuminates in its own color', () => {
    const scene = {
      type: 'HoloComposition',
      name: 'GlowScene',
      objects: [obj('Glow', [prop('mesh', 'sphere'), prop('color', '#36e5ff'), prop('material', 'hologram')])],
    } as HoloComposition;
    const out = new WebGPUCompiler().compile(scene, 'golden-token');
    // color #36e5ff -> [0.2118, 0.898, 1]; glow sets emissiveStrength 0.65 and emissive = color.
    // Mat layout: color(4) | rm=[rough,metal,emissiveStrength,0](4) | emissive(4)
    expect(out).toContain('0.5,0,0.65,0, 0.2118,0.898,1,0');
  });

  it('plain material stays non-emissive (glow does not leak onto ordinary objects)', () => {
    const scene = {
      type: 'HoloComposition',
      name: 'FlatScene',
      objects: [obj('Flat', [prop('mesh', 'cube'), prop('color', '#36e5ff')])],
    } as HoloComposition;
    const out = new WebGPUCompiler().compile(scene, 'golden-token');
    // No glow material: emissiveStrength stays 1, emissive stays [0,0,0].
    expect(out).toContain('0.5,0,1,0, 0,0,0,0');
  });

  it('scene lights aggregate into one shared uniform each mesh binds (real lights, not a fixed sun)', () => {
    const scene = {
      type: 'HoloComposition',
      name: 'LitScene',
      objects: [obj('Lit', [prop('mesh', 'sphere'), prop('color', '#ffffff')])],
      lights: [
        {
          type: 'Light',
          name: 'Key',
          lightType: 'directional',
          properties: [prop('color', '#ff0000'), prop('position', [0, 10, 0]), prop('intensity', 2)],
        } as HoloLight,
      ],
    } as HoloComposition;
    const out = new WebGPUCompiler().compile(scene, 'golden-token');
    // count=1 | red@2x | pos [0,10,0] | dir derived toward origin = [0,-10,0].
    expect(out).toContain('const sceneLights = createBuffer(device, new Float32Array([1,0,0,0, 2,0,0,0, 0,10,0,0, 0,-10,0,0');
    // Every mesh binds the shared lights uniform at binding 3.
    expect(out).toContain('{ binding: 3, resource: { buffer: sceneLights } }');
    // Fragment shader loops over the declared lights instead of a hardcoded vec3.
    expect(out).toContain('let n = i32(lights.count.x);');
    expect(out).not.toContain('let L = normalize(vec3<f32>(1.0, 2.0, 1.5))');
  });

  it('light-less scene stays lit via a synthesized key light', () => {
    const scene = {
      type: 'HoloComposition',
      name: 'NoLights',
      objects: [obj('X', [prop('mesh', 'cube')])],
    } as HoloComposition;
    const out = new WebGPUCompiler().compile(scene, 'golden-token');
    // Synthesized default: white directional, dir = [-1,-2,-1.5] (reproduces the old fixed sun).
    expect(out).toContain('const sceneLights = createBuffer(device, new Float32Array([1,0,0,0, 1,1,1,0, 1,2,1.5,0, -1,-2,-1.5,0');
  });
});
