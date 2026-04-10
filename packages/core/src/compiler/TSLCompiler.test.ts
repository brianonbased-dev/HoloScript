import { describe, it, expect, beforeEach } from 'vitest';
import { TSLCompiler } from './TSLCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

// Minimal composition factory
function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
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
    ...overrides,
  } as HoloComposition;
}

function createObject(
  name: string,
  traits: Array<{ name: string; config?: Record<string, any> }> = []
): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: [],
    traits: traits.map((t) => ({
      type: 'ObjectTrait' as const,
      name: t.name,
      config: t.config || {},
    })),
  } as HoloObjectDecl;
}

describe('TSLCompiler', () => {
  let compiler: TSLCompiler;

  beforeEach(() => {
    compiler = new TSLCompiler();
  });

  it('compiles empty composition', () => {
    const result = compiler.compile(createComposition());
    expect(result).toBeDefined();
    expect(result['_globals.wgsl']).toContain('CameraUniforms');
  });

  it('generates multi-file output for trait-bearing objects', () => {
    const comp = createComposition({
      objects: [createObject('Hero', [{ name: 'pbr' }, { name: 'hologram' }])],
    });
    const result = compiler.compile(comp);

    expect(result['Hero.vertex.wgsl']).toContain('vs_main');
    expect(result['Hero.fragment.wgsl']).toContain('fs_main');
    expect(result['Hero.fragment.wgsl']).toContain('u_roughness');
    expect(result['Hero.fragment.wgsl']).toContain('holoScanline');
  });

  it('generates compute shaders for GPU traits', () => {
    const comp = createComposition({
      objects: [createObject('Parts', [{ name: 'gpu_particle', config: { count: 10000 } }])],
    });
    const result = compiler.compile(comp);

    expect(result['Parts.compute.gpu_particle.wgsl']).toContain('@compute');
    expect(result['Parts.compute.gpu_particle.wgsl']).toContain('Particle');
  });

  it('produces pipeline TypeScript setup', () => {
    const comp = createComposition({
      objects: [createObject('Mesh', [{ name: 'pbr' }])],
    });
    const result = compiler.compile(comp);

    expect(result['_pipeline.ts']).toContain('createTSLPipelines');
    expect(result['_pipeline.ts']).toContain('Mesh');
  });

  it('warns on unmapped traits', () => {
    const comp = createComposition({
      objects: [createObject('Obj', [{ name: 'totally_fake_trait' }])],
    });
    const result = compiler.compile(comp);

    expect(result['_warnings.txt']).toContain('totally_fake_trait');
  });

  it('composes multiple material + VFX traits', () => {
    const comp = createComposition({
      objects: [
        createObject('Shield', [{ name: 'pbr' }, { name: 'force_field' }, { name: 'emissive' }]),
      ],
    });
    const result = compiler.compile(comp);
    const fs = result['Shield.fragment.wgsl'];

    expect(fs).toContain('u_roughness');
    expect(fs).toContain('u_fieldColor');
    expect(fs).toContain('u_emissiveColor');
  });

  it('includes PBR Cook-Torrance BRDF code', () => {
    const comp = createComposition({
      objects: [createObject('Lit', [{ name: 'pbr' }])],
    });
    const result = compiler.compile(comp);
    const fs = result['Lit.fragment.wgsl'];

    expect(fs).toContain('distributionGGX');
    expect(fs).toContain('fresnelSchlick');
    expect(fs).toContain('geometrySmith');
  });

  it('produces shared helpers module', () => {
    const result = compiler.compile(createComposition());

    expect(result['_helpers.wgsl']).toContain('simpleNoise');
    expect(result['_helpers.wgsl']).toContain('distributionGGX');
  });
});
