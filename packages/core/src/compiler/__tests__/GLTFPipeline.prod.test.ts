/**
 * GLTFPipeline — Production Test Suite
 *
 * Covers: glTF/GLB compilation, geometry generation (cube/sphere/cylinder/plane),
 * material processing, node transforms, export stats, options.
 */
import { describe, it, expect, vi } from 'vitest';
import { GLTFPipeline } from '../GLTFPipeline';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────
function makeObj(
  name: string,
  props: Array<{ key: string; value: unknown }> = [],
  traits: unknown[] = []
): HoloObjectDecl {
  return { name, properties: props, traits, children: [] } as HoloObjectDecl;
}

function makeComp(name: string, objects: HoloObjectDecl[] = []): HoloComposition {
  return { name, objects, spatialGroups: [] } as HoloComposition;
}

describe('GLTFPipeline — Production', () => {
  // ─── Basic Compile ────────────────────────────────────────────────
  it('compiles empty composition', () => {
    const pipeline = new GLTFPipeline();
    const result = pipeline.compile(makeComp('Empty'), 'test-token');
    expect(result.stats.nodeCount).toBe(0);
  });

  it('compiles single cube object', () => {
    const comp = makeComp('Scene', [
      makeObj('Box', [
        { key: 'geometry', value: 'cube' },
        { key: 'scale', value: [1, 1, 1] },
      ]),
    ]);
    const pipeline = new GLTFPipeline();
    const result = pipeline.compile(comp, 'test-token');
    expect(result.stats.nodeCount).toBeGreaterThanOrEqual(1);
    expect(result.stats.meshCount).toBeGreaterThanOrEqual(1);
  });

  it('compiles sphere object', () => {
    const comp = makeComp('Scene', [makeObj('Ball', [{ key: 'geometry', value: 'sphere' }])]);
    const pipeline = new GLTFPipeline();
    const result = pipeline.compile(comp, 'test-token');
    expect(result.stats.meshCount).toBeGreaterThanOrEqual(1);
    expect(result.stats.totalVertices).toBeGreaterThan(0);
  });

  it('compiles plane object', () => {
    const comp = makeComp('Scene', [makeObj('Floor', [{ key: 'geometry', value: 'plane' }])]);
    const pipeline = new GLTFPipeline();
    const result = pipeline.compile(comp, 'test-token');
    expect(result.stats.meshCount).toBeGreaterThanOrEqual(1);
    expect(result.stats.totalVertices).toBe(4); // plane = 4 vertices
  });

  it('compiles cylinder object', () => {
    const comp = makeComp('Scene', [makeObj('Pillar', [{ key: 'geometry', value: 'cylinder' }])]);
    const pipeline = new GLTFPipeline();
    const result = pipeline.compile(comp, 'test-token');
    expect(result.stats.meshCount).toBeGreaterThanOrEqual(1);
  });

  // ─── Transforms ───────────────────────────────────────────────────
  it('applies position transform', () => {
    const comp = makeComp('Scene', [
      makeObj('A', [
        { key: 'geometry', value: 'cube' },
        { key: 'position', value: [1, 2, 3] },
      ]),
    ]);
    const pipeline = new GLTFPipeline({ format: 'gltf' });
    const result = pipeline.compile(comp, 'test-token');
    expect(result.json).toBeDefined();
    const json = result.json as any;
    expect(json.nodes[0].translation).toEqual([1, 2, 3]);
  });

  // ─── Multiple Objects ─────────────────────────────────────────────
  it('compiles multiple objects', () => {
    const comp = makeComp('Scene', [
      makeObj('A', [{ key: 'geometry', value: 'cube' }]),
      makeObj('B', [{ key: 'geometry', value: 'sphere' }]),
      makeObj('C', [{ key: 'geometry', value: 'plane' }]),
    ]);
    const pipeline = new GLTFPipeline();
    const result = pipeline.compile(comp, 'test-token');
    expect(result.stats.nodeCount).toBe(3);
    expect(result.stats.meshCount).toBe(3);
  });

  // ─── Export Stats ─────────────────────────────────────────────────
  it('tracks vertex and triangle counts', () => {
    const comp = makeComp('Scene', [makeObj('Box', [{ key: 'geometry', value: 'cube' }])]);
    const result = new GLTFPipeline().compile(comp, 'test-token');
    expect(result.stats.totalVertices).toBe(24); // cube = 6 faces * 4 vertices
    expect(result.stats.totalTriangles).toBe(12); // cube = 6 faces * 2 triangles
  });

  // ─── Options ──────────────────────────────────────────────────────
  it('respects generator option', () => {
    const pipeline = new GLTFPipeline({ format: 'gltf', generator: 'TestGen v1.0' });
    const result = pipeline.compile(makeComp('Scene'), 'test-token');
    const json = result.json as any;
    expect(json.asset?.generator).toBe('TestGen v1.0');
  });

  it('respects copyright option', () => {
    const pipeline = new GLTFPipeline({ format: 'gltf', copyright: '© 2026 Test' });
    const result = pipeline.compile(makeComp('Scene'), 'test-token');
    const json = result.json as any;
    expect(json.asset?.copyright).toBe('© 2026 Test');
  });

  // ─── Scale Handling ───────────────────────────────────────────────
  it('handles custom scale', () => {
    const comp = makeComp('Scene', [
      makeObj('BigBox', [
        { key: 'geometry', value: 'cube' },
        { key: 'scale', value: [2, 3, 4] },
      ]),
    ]);
    const result = new GLTFPipeline().compile(comp, 'test-token');
    expect(result.stats.totalVertices).toBe(24);
  });

  // ─── Material Processing ──────────────────────────────────────────
  it('assigns material to object with color', () => {
    const comp = makeComp('Scene', [
      makeObj('RedBox', [
        { key: 'geometry', value: 'cube' },
        { key: 'color', value: '#ff0000' },
      ]),
    ]);
    const result = new GLTFPipeline().compile(comp, 'test-token');
    expect(result.stats.materialCount).toBeGreaterThanOrEqual(1);
  });
});
