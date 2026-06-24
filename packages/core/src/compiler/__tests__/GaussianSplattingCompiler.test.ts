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
          ...(params?.shCoefficients ? { shCoefficients: params.shCoefficients } : {}),
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

/** Build a HolomapPointCloudPayload exactly as holo_reconstruct_export packs it
 * (base64 little-endian Float32 xyz + base64 uint8 rgb). */
function makeHolomapCloud(positions: number[], rgb: number[]) {
  const pos = new Float32Array(positions);
  const col = Uint8Array.from(rgb);
  return {
    positionsB64: Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength).toString('base64'),
    colorsB64: Buffer.from(col.buffer, col.byteOffset, col.byteLength).toString('base64'),
    pointCount: Math.floor(positions.length / 3),
  };
}

/** Same as makeHolomapCloud but with optional per-point provenance, encoded the
 *  way holo_reconstruct_export would pack it (base64 uint8 class codes:
 *  0=observed, 1=interpolated, 2=generative-extended). */
function makeHolomapCloudProv(
  positions: number[],
  rgb: number[],
  opts?: {
    provenance?: number[];
    provenanceDefault?: 'observed' | 'interpolated' | 'generative-extended';
    provenanceSource?: string;
  }
) {
  const base = makeHolomapCloud(positions, rgb);
  const extra: Record<string, unknown> = {};
  if (opts?.provenance) {
    extra.provenanceB64 = Buffer.from(Uint8Array.from(opts.provenance)).toString('base64');
  }
  if (opts?.provenanceDefault) extra.provenanceDefault = opts.provenanceDefault;
  if (opts?.provenanceSource) extra.provenanceSource = opts.provenanceSource;
  return { ...base, ...extra };
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
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBe(1);
    expect(result.warnings![0]).toContain('falling back to demo grid');
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

  it('should compute covariance from raw point cloud (positions + RGB colors)', () => {
    // 8 points in a 2x2x2 grid — covariance should produce small anisotropic scales
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1,
    ]);
    const colors = new Float32Array([
      1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5,
    ]);
    const compiler = new GaussianSplattingCompiler();
    const composition = makeCompositionWithGaussian({
      positions,
      colors,
      // scales / rotations / opacities deliberately omitted
    } as any);
    const result = compiler.compile(composition);

    expect(result.binary).toBeDefined();
    expect(result.stats.totalVertices).toBe(8);
    expect(result.stats.fileSizeBytes).toBeGreaterThan(0);
  });

  it('should compute covariance from raw point cloud with RGBA colors', () => {
    const positions = new Float32Array([0, 0, 0, 0.5, 0, 0, 1, 0, 0]);
    const colors = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]);
    const compiler = new GaussianSplattingCompiler({ format: 'gltf' });
    const composition = makeCompositionWithGaussian({
      positions,
      colors,
    } as any);
    const result = compiler.compile(composition);

    expect(result.json).toBeDefined();
    expect(result.stats.totalVertices).toBe(3);
  });

  it('should splat a HoloMap point cloud from compilerOptions when no @gaussian_splat trait is present (ssja capture seam)', () => {
    // 3 captured points threaded through ExportManager.compilerOptions, exactly
    // as holo_reconstruct_export does. Must splat the capture via covariance —
    // NOT fall back to the 8-point demo grid.
    const cloud = makeHolomapCloud(
      [0, 0, 0, 1, 0, 0, 0, 1, 0],
      [255, 0, 0, 0, 255, 0, 0, 0, 255]
    );
    const compiler = new GaussianSplattingCompiler({ holomapPointCloud: cloud });
    const result = compiler.compile(makeEmptyComposition());

    expect(result.binary).toBeDefined();
    expect(result.stats.totalVertices).toBe(3); // captured points, not the 8-point demo grid
    expect(result.warnings ?? []).not.toContain(
      'No valid @gaussian_splat trait data found; falling back to demo grid'
    );
  });

  it('should still fall back to the demo grid when neither a trait nor a cloud is present', () => {
    // Regression: the capture seam must not change the no-data behavior.
    const compiler = new GaussianSplattingCompiler();
    const result = compiler.compile(makeEmptyComposition());
    expect(result.stats.totalVertices).toBe(8);
  });

  describe('per-point provenance (observed-vs-invented moat axis)', () => {
    it('tags a raw HoloMap capture as observed by default and records it in glTF', () => {
      const cloud = makeHolomapCloudProv(
        [0, 0, 0, 1, 0, 0, 0, 1, 0],
        [255, 0, 0, 0, 255, 0, 0, 0, 255]
      );
      const compiler = new GaussianSplattingCompiler({ format: 'gltf', holomapPointCloud: cloud });
      const result = compiler.compile(makeEmptyComposition());

      const gltf = result.json as Record<string, unknown>;
      const meshes = gltf.meshes as Array<Record<string, unknown>>;
      const primitive = (meshes[0].primitives as Array<Record<string, unknown>>)[0];
      const attrs = primitive.attributes as Record<string, number>;
      expect(attrs._PROVENANCE).toBe(5);

      const extras = (gltf.asset as Record<string, unknown>).extras as Record<string, unknown>;
      const prov = extras.holoProvenance as Record<string, unknown>;
      expect(prov.total).toBe(3);
      expect(prov.observed).toBe(3);
      expect(prov['generative-extended']).toBe(0);
      expect(prov.observedFraction).toBe(1);
      expect(prov.source).toBe('holomap-capture');
    });

    it('carries explicit per-point provenance codes through to the histogram', () => {
      // 2 observed (0) + 1 generative-extended (2)
      const cloud = makeHolomapCloudProv(
        [0, 0, 0, 1, 0, 0, 0, 1, 0],
        [255, 0, 0, 0, 255, 0, 0, 0, 255],
        { provenance: [0, 0, 2], provenanceSource: 'artifixer-14b' }
      );
      const compiler = new GaussianSplattingCompiler({ format: 'gltf', holomapPointCloud: cloud });
      const result = compiler.compile(makeEmptyComposition());

      const gltf = result.json as Record<string, unknown>;
      const extras = (gltf.asset as Record<string, unknown>).extras as Record<string, unknown>;
      const prov = extras.holoProvenance as Record<string, unknown>;
      expect(prov.observed).toBe(2);
      expect(prov['generative-extended']).toBe(1);
      expect(prov.total).toBe(3);
      expect(prov.observedFraction).toBeCloseTo(2 / 3, 5);
      expect(prov.source).toBe('artifixer-14b');
    });

    it('honours provenanceDefault so a densified cloud cannot masquerade as observed', () => {
      const cloud = makeHolomapCloudProv(
        [0, 0, 0, 1, 0, 0, 0, 1, 0],
        [255, 0, 0, 0, 255, 0, 0, 0, 255],
        { provenanceDefault: 'generative-extended', provenanceSource: 'artifixer-14b' }
      );
      const compiler = new GaussianSplattingCompiler({ format: 'gltf', holomapPointCloud: cloud });
      const result = compiler.compile(makeEmptyComposition());

      const gltf = result.json as Record<string, unknown>;
      const extras = (gltf.asset as Record<string, unknown>).extras as Record<string, unknown>;
      const prov = extras.holoProvenance as Record<string, unknown>;
      expect(prov.observed).toBe(0);
      expect(prov['generative-extended']).toBe(3);
      expect(prov.observedFraction).toBe(0);
    });

    it('does NOT emit _PROVENANCE for an authored @gaussian_splat trait (false case)', () => {
      // G.GOLD.013: test the FALSE case. Authored splats carry no provenance, so
      // no _PROVENANCE attribute and no asset.extras provenance block.
      const compiler = new GaussianSplattingCompiler({ format: 'gltf' });
      const result = compiler.compile(makeCompositionWithGaussian());

      const gltf = result.json as Record<string, unknown>;
      const meshes = gltf.meshes as Array<Record<string, unknown>>;
      const primitive = (meshes[0].primitives as Array<Record<string, unknown>>)[0];
      const attrs = primitive.attributes as Record<string, number>;
      expect(attrs._PROVENANCE).toBeUndefined();
      const asset = gltf.asset as Record<string, unknown>;
      expect(asset.extras).toBeUndefined();
    });
  });
});
