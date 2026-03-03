import { describe, it, expect, beforeEach, vi} from 'vitest';
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
    expect(view.getUint32(0, true)).toBe(0x46546C67);
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
    pipeline.compile(makeComposition({
      objects: [{ name: 'a', properties: [{ key: 'geometry', value: 'box' }], traits: [] }] as any,
    }), 'test-token');
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
