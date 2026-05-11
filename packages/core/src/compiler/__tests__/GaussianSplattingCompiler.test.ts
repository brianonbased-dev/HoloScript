/**
 * GaussianSplattingCompiler tests
 *
 * @see GaussianSplattingCompiler.ts
 */

import { describe, it, expect } from 'vitest';
import {
  GaussianSplattingCompiler,
  createGaussianSplattingCompiler,
} from '../GaussianSplattingCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

function makeCompositionWithGaussian(params?: {
  positions?: Float32Array;
  scales?: Float32Array;
  rotations?: Float32Array;
  colors?: Float32Array;
  opacities?: Float32Array;
  shCoefficients?: Float32Array;
}): HoloComposition {
  const obj: HoloObjectDecl = {
    type: 'Object',
    name: 'GaussianObj',
    properties: [],
    traits: [
      {
        type: 'ObjectTrait',
        name: 'gaussian_splat',
        config: {
          positions: params?.positions ?? new Float32Array([0, 0, 0, 1, 0, 0]),
          scales: params?.scales ?? new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
          rotations: params?.rotations ?? new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
          colors: params?.colors ?? new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]),
          opacities: params?.opacities ?? new Float32Array([1, 1]),
          ...(params?.shCoefficients
            ? { shCoefficients: params.shCoefficients }
            : {}),
        },
      },
    ],
  };

  return {
    type: 'Composition',
    name: 'GaussianTest',
    templates: [],
    objects: [obj],
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
  };
}

function makeEmptyComposition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'EmptyTest',
    templates: [],
    objects: [],
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
  };
}

describe('GaussianSplattingCompiler', () => {
  it('should instantiate with default options', () => {
    const compiler = new GaussianSplattingCompiler();
    expect(compiler).toBeDefined();
  });

  it('should create via factory', () => {
    const compiler = createGaussianSplattingCompiler({ format: 'gltf' });
    expect(compiler).toBeDefined();
  });

  it('should compile to GLB by default', () => {
    const compiler = new GaussianSplattingCompiler();
    const composition = makeCompositionWithGaussian();
    const result = compiler.compile(composition);

    expect(result.binary).toBeDefined();
    expect(result.binary!.byteLength).toBeGreaterThan(0);
    expect(result.stats.totalVertices).toBe(2);
    expect(result.stats.totalTriangles).toBe(0);
    expect(result.stats.meshCount).toBe(1);
    expect(result.stats.nodeCount).toBe(1);
    expect(result.stats.fileSizeBytes).toBeGreaterThan(0);
  });

  it('should compile to glTF + separate buffer', () => {
    const compiler = new GaussianSplattingCompiler({ format: 'gltf' });
    const composition = makeCompositionWithGaussian();
    const result = compiler.compile(composition);

    expect(result.json).toBeDefined();
    expect(result.buffer).toBeDefined();
    expect(result.binary).toBeUndefined();
    expect(result.stats.totalVertices).toBe(2);

    const gltf = result.json as Record<string, unknown>;
    expect(gltf.asset).toBeDefined();
    expect((gltf.asset as Record<string, string>).version).toBe('2.0');
    expect(gltf.extensionsUsed).toEqual(['KHR_gaussian_splatting']);
  });

  it('should generate a demo grid when no gaussian_splat trait is present', () => {
    const compiler = new GaussianSplattingCompiler();
    const composition = makeEmptyComposition();
    const result = compiler.compile(composition);

    expect(result.binary).toBeDefined();
    expect(result.stats.totalVertices).toBe(8);
    expect(result.stats.fileSizeBytes).toBeGreaterThan(0);
  });

  it('should generate a demo grid when trait params are incomplete', () => {
    const compiler = new GaussianSplattingCompiler();
    const composition = makeCompositionWithGaussian({
      positions: new Float32Array([0, 0, 0]),
      scales: new Float32Array([0.1, 0.1, 0.1]),
      // missing rotations, colors, opacities
    } as any);
    const result = compiler.compile(composition);

    expect(result.binary).toBeDefined();
    expect(result.stats.totalVertices).toBe(8); // demo grid fallback
  });

  it('should set generator and copyright metadata', () => {
    const compiler = new GaussianSplattingCompiler({
      format: 'gltf',
      generator: 'TestGenerator',
      copyright: 'TestCopyright',
    });
    const composition = makeCompositionWithGaussian();
    const result = compiler.compile(composition);

    const gltf = result.json as Record<string, unknown>;
    const asset = gltf.asset as Record<string, string>;
    expect(asset.generator).toBe('TestGenerator');
    expect(asset.copyright).toBe('TestCopyright');
  });

  it('should include KHR_gaussian_splatting extension on the primitive', () => {
    const compiler = new GaussianSplattingCompiler({
      format: 'gltf',
      colorSpace: 'lin_rec709_display',
    });
    const composition = makeCompositionWithGaussian();
    const result = compiler.compile(composition);

    const gltf = result.json as Record<string, unknown>;
    const meshes = gltf.meshes as Array<Record<string, unknown>>;
    const primitive = (meshes[0].primitives as Array<Record<string, unknown>>)[0];
    expect(primitive.mode).toBe(0);
    const extensions = primitive.extensions as Record<string, unknown>;
    expect(extensions).toBeDefined();
    expect(extensions.KHR_gaussian_splatting).toEqual({
      colorSpace: 'lin_rec709_display',
    });
  });

  it('should parse regular arrays into Float32Arrays', () => {
    const compiler = new GaussianSplattingCompiler();
    const composition = makeCompositionWithGaussian({
      positions: [0, 0, 0, 1, 0, 0] as any,
      scales: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1] as any,
      rotations: [0, 0, 0, 1, 0, 0, 0, 1] as any,
      colors: [1, 0, 0, 1, 0, 1, 0, 1] as any,
      opacities: [1, 1] as any,
    });
    const result = compiler.compile(composition);
    expect(result.stats.totalVertices).toBe(2);
  });
});
