/**
 * native-render data layer (D.083, task 2h3s, Inc 0 + 1 + Track-0 meshData):
 * pure-data scene extraction + primitive mesh generation. Headless — no GPUDevice,
 * no Three.js — so it runs in CI. The GPU resource builder (DrawSpec[] + GPUDevice →
 * IDrawCall[]) is a separate opt-in backend gated on a browser receipt; it is
 * intentionally NOT covered here.
 */
import { describe, it, expect } from 'vitest';
import { ECSWorld } from '../../vm/executor';
import { ComponentType, GeometryType } from '../../vm/opcodes';
import { extractDrawSpecs, geometryKindFromType, composeTRS, type SkinnedMeshData } from '../draw-spec';
import { primitiveToMesh } from '../primitive-mesh';

function addCube(
  world: ECSWorld,
  name: string,
  pos: { x: number; y: number; z: number },
  scale: number,
  color: number
) {
  const id = world.spawn(name);
  world.setComponent(id, ComponentType.Transform, {
    position: pos,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: scale, y: scale, z: scale },
  });
  world.setComponent(id, ComponentType.Geometry, { type: GeometryType.Cube, params: {} });
  world.setComponent(id, ComponentType.Material, {
    color,
    metalness: 0,
    roughness: 1,
    emissive: 0,
    opacity: 1,
  });
  return id;
}

describe('draw-spec — pure-data scene extraction from engine/vm ECSWorld', () => {
  it('extracts one DrawSpec from a renderable cube entity', () => {
    const w = new ECSWorld();
    addCube(w, 'cube', { x: 1, y: 2, z: 3 }, 2, 0xff0000);

    const specs = extractDrawSpecs(w);
    expect(specs).toHaveLength(1);
    expect(specs[0].geometry.kind).toBe('cube');
    expect(specs[0].material.color).toBe(0xff0000);
    // identity rotation + scale 2 → diagonal scale, translation in last column
    expect(specs[0].modelMatrix[0]).toBeCloseTo(2);
    expect(specs[0].modelMatrix[5]).toBeCloseTo(2);
    expect(specs[0].modelMatrix[10]).toBeCloseTo(2);
    expect([specs[0].modelMatrix[12], specs[0].modelMatrix[13], specs[0].modelMatrix[14]]).toEqual([
      1, 2, 3,
    ]);
  });

  it('skips non-renderable entities (missing Material) and orders by id', () => {
    const w = new ECSWorld();
    addCube(w, 'a', { x: -2, y: 0, z: 0 }, 1, 0x00ff00);
    const bare = w.spawn('no-material');
    w.setComponent(bare, ComponentType.Transform, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });
    w.setComponent(bare, ComponentType.Geometry, { type: GeometryType.Cube, params: {} });
    addCube(w, 'b', { x: 2, y: 0, z: 0 }, 1, 0x0000ff);

    const specs = extractDrawSpecs(w);
    expect(specs.map((s) => s.material.color)).toEqual([0x00ff00, 0x0000ff]); // bare skipped, ordered by id
  });

  it('geometryKindFromType maps enum → kind', () => {
    expect(geometryKindFromType(GeometryType.Cube)).toBe('cube');
    expect(geometryKindFromType(GeometryType.Sphere)).toBe('sphere');
    expect(geometryKindFromType(0xffff)).toBe('unknown');
  });

  it('composeTRS produces a column-major TRS matrix', () => {
    const m = composeTRS({ x: 5, y: 6, z: 7 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 2, y: 3, z: 4 });
    expect(m[0]).toBeCloseTo(2);
    expect(m[5]).toBeCloseTo(3);
    expect(m[10]).toBeCloseTo(4);
    expect([m[12], m[13], m[14], m[15]]).toEqual([5, 6, 7, 1]);
  });

  // Track-0 / D.101/ssja: DrawSpec.geometry.meshData — carry real vertex buffers through the IR.
  it('mesh entity with meshData carries real vertex buffers into DrawSpec (Track-0 gate)', () => {
    // Minimal SkinnedMeshData: a single triangle (3 verts, 3 indices).
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const tangents = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const jointIndices = new Uint32Array(3); // all root
    const jointWeights = new Float32Array([1, 1, 1]);
    const meshData: SkinnedMeshData = {
      positions,
      normals,
      tangents,
      indices,
      jointIndices,
      jointWeights,
      vertexCount: 3,
    };

    const w = new ECSWorld();
    const id = w.spawn('imported-mesh');
    w.setComponent(id, ComponentType.Transform, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });
    w.setComponent(id, ComponentType.Geometry, {
      type: GeometryType.Mesh,
      params: {},
      meshData,
    });
    w.setComponent(id, ComponentType.Material, {
      color: 0x00ff00,
      metalness: 0,
      roughness: 1,
      emissive: 0,
      opacity: 1,
    });

    const specs = extractDrawSpecs(w);
    expect(specs).toHaveLength(1);
    expect(specs[0].geometry.kind).toBe('mesh');
    // meshData must be carried through — the native render path uploads buffers from here.
    expect(specs[0].geometry.meshData).toBeDefined();
    expect(specs[0].geometry.meshData!.positions).toBe(positions); // same reference, not a copy
    expect(specs[0].geometry.meshData!.indices).toBe(indices);
    expect(specs[0].geometry.meshData!.vertexCount).toBe(3);
  });

  it('mesh entity WITHOUT meshData (legacy text pointer) skips meshData in DrawSpec', () => {
    const w = new ECSWorld();
    const id = w.spawn('external-ref-mesh');
    w.setComponent(id, ComponentType.Transform, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });
    // No meshData — legacy external reference ("file.glb#NodeName")
    w.setComponent(id, ComponentType.Geometry, { type: GeometryType.Mesh, params: {} });
    w.setComponent(id, ComponentType.Material, {
      color: 0xff0000,
      metalness: 0,
      roughness: 1,
      emissive: 0,
      opacity: 1,
    });

    const specs = extractDrawSpecs(w);
    expect(specs).toHaveLength(1);
    expect(specs[0].geometry.kind).toBe('mesh');
    expect(specs[0].geometry.meshData).toBeUndefined();
  });
});

describe('primitive-mesh — CPU geometry generation', () => {
  it('cube: 8 verts, 36 indices, bbox ±0.5', () => {
    const m = primitiveToMesh('cube');
    expect(m.vertexCount).toBe(8);
    expect(m.indices.length).toBe(36); // 12 triangles
    let min = Infinity,
      max = -Infinity;
    for (const v of m.positions) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeCloseTo(-0.5);
    expect(max).toBeCloseTo(0.5);
    // every index in range
    for (const i of m.indices) expect(i).toBeLessThan(m.vertexCount);
  });

  it('plane: 4 verts, 6 indices', () => {
    const m = primitiveToMesh('plane');
    expect(m.vertexCount).toBe(4);
    expect(m.indices.length).toBe(6);
  });

  it('sphere: closed mesh, all indices valid, radius ~0.5', () => {
    const m = primitiveToMesh('sphere', { segments: 8, rings: 6 });
    expect(m.vertexCount).toBeGreaterThan(0);
    expect(m.indices.length % 3).toBe(0);
    for (const i of m.indices) expect(i).toBeLessThan(m.vertexCount);
    // farthest vertex from origin ≈ radius 0.5
    let maxR = 0;
    for (let k = 0; k < m.positions.length; k += 3) {
      maxR = Math.max(maxR, Math.hypot(m.positions[k], m.positions[k + 1], m.positions[k + 2]));
    }
    expect(maxR).toBeCloseTo(0.5, 1);
  });

  it('unknown kind falls back to a cube placeholder (visible, not missing)', () => {
    const m = primitiveToMesh('cylinder');
    expect(m.vertexCount).toBe(8); // cube fallback
  });
});
