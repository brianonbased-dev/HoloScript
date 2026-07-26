import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GLTFPipeline } from '../GLTFPipeline';
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

function readGLBJson(binary: Uint8Array): {
  accessors?: Array<{ count?: number }>;
  meshes?: Array<{
    extensions?: Record<string, unknown>;
    primitives?: Array<{ indices?: number }>;
  }>;
  nodes?: Array<{
    name?: string;
    mesh?: number;
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    children?: number[];
    extensions?: Record<string, { ids?: number[] }>;
  }>;
  scenes?: Array<{ nodes?: number[] }>;
  extensionsUsed?: string[];
} {
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error('Expected GLB JSON chunk');
  }

  const jsonBytes = binary.subarray(20, 20 + jsonChunkLength);
  return JSON.parse(new TextDecoder().decode(jsonBytes));
}

describe('GLTFPipeline', () => {
  let pipeline: GLTFPipeline;

  beforeEach(() => {
    pipeline = new GLTFPipeline();
  });

  // =========== Constructor ===========

  it('instantiates with default options', () => {
    expect(pipeline).toBeDefined();
  });

  // =========== GLB output (default) ===========

  it('compiles to GLB binary by default', () => {
    const result = pipeline.compile(makeComposition(), 'test-token');
    expect(result.binary).toBeDefined();
    expect(result.binary).toBeInstanceOf(Uint8Array);
    expect(result.stats).toBeDefined();
  });

  it('GLB starts with glTF magic bytes', () => {
    const result = pipeline.compile(makeComposition(), 'test-token');
    // glTF magic: 0x46546C67 = "glTF"
    const view = new DataView(result.binary!.buffer, result.binary!.byteOffset);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
  });

  it('emits node-level MSFT_lod groups in generated GLBs', () => {
    const result = pipeline.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'anchor',
            properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'none' }],
            traits: [],
          },
          {
            type: 'Object',
            name: 'lod_subject',
            properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'sphere' }],
            traits: [],
          },
        ],
      }),
      'test-token'
    );
    const json = readGLBJson(result.binary!);

    expect(json.extensionsUsed).toContain('MSFT_lod');
    expect(json.meshes?.every((mesh) => mesh.extensions?.MSFT_lod === undefined)).toBe(true);

    const highestLodNodeIndex =
      json.nodes?.findIndex((node) => node.name === 'lod_subject') ?? -1;
    expect(highestLodNodeIndex).toBeGreaterThanOrEqual(0);

    const highestLodNode = json.nodes?.[highestLodNodeIndex];
    const lodNodeIds = highestLodNode?.extensions?.MSFT_lod?.ids;
    expect(lodNodeIds).toHaveLength(2);
    if (!lodNodeIds || !json.nodes) {
      throw new Error('Expected node-level MSFT_lod ids');
    }

    const lowerLodNodes = lodNodeIds.map((nodeId) => json.nodes?.[nodeId]);
    expect(lowerLodNodes.every((node) => node?.mesh !== undefined)).toBe(true);
    expect(lodNodeIds).not.toEqual(lowerLodNodes.map((node) => node?.mesh));
    for (const lowerLodNode of lowerLodNodes) {
      expect(lowerLodNode?.translation).toEqual(highestLodNode?.translation);
      expect(lowerLodNode?.rotation).toEqual(highestLodNode?.rotation);
      expect(lowerLodNode?.scale).toEqual(highestLodNode?.scale);
    }

    const triangleCount = (
      node: NonNullable<typeof json.nodes>[number] | undefined
    ): number => {
      if (node?.mesh === undefined) return 0;
      const primitives = json.meshes?.[node.mesh]?.primitives ?? [];
      return primitives.reduce((total, primitive) => {
        if (primitive.indices === undefined) return total;
        return total + (json.accessors?.[primitive.indices]?.count ?? 0) / 3;
      }, 0);
    };
    const lodTriangleCounts = [highestLodNode, ...lowerLodNodes].map(triangleCount);
    expect(lodTriangleCounts[1]).toBeLessThan(lodTriangleCounts[0]);
    expect(lodTriangleCounts[2]).toBeLessThan(lodTriangleCounts[1]);

    expect(json.scenes?.[0]?.nodes).toContain(highestLodNodeIndex);
    const childNodeIds = json.nodes.flatMap((node) => node.children ?? []);
    for (const lodNodeId of lodNodeIds) {
      expect(json.scenes?.[0]?.nodes).not.toContain(lodNodeId);
      expect(childNodeIds).not.toContain(lodNodeId);
    }
  });

  it('does not attach MSFT_lod to mesh nodes with children', () => {
    const result = pipeline.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'parent',
            properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'sphere' }],
            traits: [],
            children: [
              {
                type: 'Object',
                name: 'child',
                properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'sphere' }],
                traits: [],
              },
            ],
          },
        ],
      }),
      'test-token'
    );
    const json = readGLBJson(result.binary!);
    const parentNode = json.nodes?.find((node) => node.name === 'parent');
    const childNode = json.nodes?.find((node) => node.name === 'child');

    expect(parentNode?.children).toHaveLength(1);
    expect(parentNode?.extensions?.MSFT_lod).toBeUndefined();
    expect(childNode?.extensions?.MSFT_lod?.ids).toHaveLength(2);
  });

  it('does not emit MSFT_lod groups for non-reducing meshes', () => {
    const result = pipeline.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'cube',
            properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'box' }],
            traits: [],
          },
        ],
      }),
      'test-token'
    );
    const json = readGLBJson(result.binary!);
    const cubeNode = json.nodes?.find((node) => node.name === 'cube');

    expect(cubeNode?.extensions?.MSFT_lod).toBeUndefined();
    expect(json.extensionsUsed ?? []).not.toContain('MSFT_lod');
    expect(json.meshes).toHaveLength(1);
  });

  // =========== glTF JSON output ===========

  it('compiles to glTF JSON when format is gltf', () => {
    const p = new GLTFPipeline({ format: 'gltf' });
    const result = p.compile(makeComposition(), 'test-token');
    expect(result.json).toBeDefined();
    expect(result.buffer).toBeDefined();
  });

  it('glTF JSON contains asset info', () => {
    const p = new GLTFPipeline({ format: 'gltf' });
    const result = p.compile(makeComposition(), 'test-token');
    const json = result.json as any;
    expect(json.asset).toBeDefined();
    expect(json.asset.version).toBe('2.0');
  });

  // =========== Stats ===========

  it('returns stats with counts', () => {
    const result = pipeline.compile(makeComposition(), 'test-token');
    expect(result.stats.nodeCount).toBeTypeOf('number');
    expect(result.stats.meshCount).toBeTypeOf('number');
    expect(result.stats.materialCount).toBeTypeOf('number');
    expect(result.stats.fileSizeBytes).toBeGreaterThan(0);
  });

  // =========== Objects → meshes ===========

  it('compiles objects to glTF meshes', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const result = pipeline.compile(comp, 'test-token');
    expect(result.stats.meshCount).toBeGreaterThanOrEqual(1);
    expect(result.stats.nodeCount).toBeGreaterThanOrEqual(1);
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const result = pipeline.compile(comp, 'test-token');
    expect(result.stats.meshCount).toBeGreaterThanOrEqual(2);
  });

  // =========== Generator string ===========

  it('respects custom generator string', () => {
    const p = new GLTFPipeline({ format: 'gltf', generator: 'MyTool v1' });
    const result = p.compile(makeComposition(), 'test-token');
    const json = result.json as any;
    expect(json.asset.generator).toBe('MyTool v1');
  });

  // =========== Reset ===========

  it('resets between compilations', () => {
    pipeline.compile(
      makeComposition({
        objects: [
          { name: 'a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        ] as any,
      }),
      'test-token'
    );
    const result = pipeline.compile(makeComposition(), 'test-token');
    expect(result.stats.meshCount).toBe(0);
  });

  // =========== Sphere geometry ===========

  it('compiles sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const result = pipeline.compile(comp, 'test-token');
    expect(result.stats.totalVertices).toBeGreaterThan(0);
    expect(result.stats.totalTriangles).toBeGreaterThan(0);
  });
});
