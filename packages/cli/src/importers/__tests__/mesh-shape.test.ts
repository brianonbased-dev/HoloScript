/**
 * Track-0 round-trip: a real mesh survives import → `.holo` file → parse, carried
 * as a `shape … mesh { … }` block rather than a text pointer.
 * @see ../mesh-shape.ts  @see ../gltf-importer.ts
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseHolo } from '@holoscript/core/parser';
import { encodeSkinnedMeshToHolo, type SkinnedMeshData } from '@holoscript/engine';
import { meshShapeToHolo, holoShapeToMesh } from '../mesh-shape';
import { importGltf } from '../gltf-importer';

function constructedMesh(): SkinnedMeshData {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    jointIndices: new Uint32Array([0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]),
    jointWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    vertexCount: 3,
  };
}

function findMeshShape(holo: string) {
  const result = parseHolo(holo);
  expect(result.success).toBe(true);
  const shape = result.ast?.shapes?.find((s: { shapeType: string }) => s.shapeType === 'mesh');
  expect(shape).toBeDefined();
  return shape!;
}

// ─── minimal skinned-triangle GLB (mirrors GltfMeshExtractor.test.ts) ──────────

function buildGlb(json: object, bin: ArrayBuffer): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.byteLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.byteLength + binPad;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let off = 12;
  dv.setUint32(off, jsonBytes.length + jsonPad, true);
  dv.setUint32(off + 4, 0x4e4f534a, true);
  u8.set(jsonBytes, off + 8);
  for (let i = 0; i < jsonPad; i++) u8[off + 8 + jsonBytes.length + i] = 0x20;
  off += 8 + jsonBytes.length + jsonPad;
  dv.setUint32(off, bin.byteLength + binPad, true);
  dv.setUint32(off + 4, 0x004e4942, true);
  u8.set(new Uint8Array(bin), off + 8);
  return buf;
}

function makeSkinnedTriangleGlb(): ArrayBuffer {
  const binLen = 268;
  const bin = new ArrayBuffer(binLen);
  const dv = new DataView(bin);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true));
  [0, 0, 1, 0, 0, 1, 0, 0, 1].forEach((v, i) => dv.setFloat32(36 + i * 4, v, true));
  [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0].forEach((v, i) => dv.setUint8(72 + i, v));
  [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0].forEach((v, i) => dv.setFloat32(84 + i * 4, v, true));
  [0, 1, 2].forEach((v, i) => dv.setUint16(132 + i * 2, v, true));
  for (let m = 0; m < 2; m++) {
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((v, i) =>
      dv.setFloat32(140 + m * 64 + i * 4, v, true)
    );
  }
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binLen }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binLen }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 0, byteOffset: 36, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 0, byteOffset: 72, componentType: 5121, count: 3, type: 'VEC4' },
      { bufferView: 0, byteOffset: 84, componentType: 5126, count: 3, type: 'VEC4' },
      { bufferView: 0, byteOffset: 132, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 0, byteOffset: 140, componentType: 5126, count: 2, type: 'MAT4' },
    ],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 4, mode: 4 },
        ],
      },
    ],
    nodes: [{ mesh: 0, skin: 0 }, { name: 'Hips' }, { name: 'Spine' }],
    skins: [{ joints: [1, 2], inverseBindMatrices: 5 }],
  };
  return buildGlb(json, bin);
}

// ─── minimal NON-skinned (static) triangle GLB ────────────────────────────────

function makeStaticTriangleGlb(): ArrayBuffer {
  // POSITION VEC3 f32 x3 @0 (36); NORMAL VEC3 f32 x3 @36 (36); indices u16 x3 @72 (6).
  const binLen = 78;
  const bin = new ArrayBuffer(binLen);
  const dv = new DataView(bin);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true));
  [0, 0, 1, 0, 0, 1, 0, 0, 1].forEach((v, i) => dv.setFloat32(36 + i * 4, v, true));
  [0, 1, 2].forEach((v, i) => dv.setUint16(72 + i * 2, v, true));
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binLen }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 6 },
    ],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    // NO JOINTS_0 / WEIGHTS_0 / skin — exercises the static extractor fallback.
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }] }],
    nodes: [{ mesh: 0 }],
  };
  return buildGlb(json, bin);
}

// ─── minimal TWO-mesh GLB (two static triangles, one node each) ───────────────

function makeTwoMeshGlb(): ArrayBuffer {
  // mesh0 POS @0 (36), idx @36 (6); pad→44; mesh1 POS @44 (36), idx @80 (6).
  const binLen = 88;
  const bin = new ArrayBuffer(binLen);
  const dv = new DataView(bin);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true)); // mesh0 @origin
  [0, 1, 2].forEach((v, i) => dv.setUint16(36 + i * 2, v, true));
  [5, 0, 0, 6, 0, 0, 5, 1, 0].forEach((v, i) => dv.setFloat32(44 + i * 4, v, true)); // mesh1 @+5x
  [0, 1, 2].forEach((v, i) => dv.setUint16(80 + i * 2, v, true));
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binLen }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
      { buffer: 0, byteOffset: 44, byteLength: 36 },
      { buffer: 0, byteOffset: 80, byteLength: 6 },
    ],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 2, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 3, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] },
      { primitives: [{ attributes: { POSITION: 2 }, indices: 3, mode: 4 }] },
    ],
    nodes: [{ name: 'A', mesh: 0 }, { name: 'B', mesh: 1 }],
  };
  return buildGlb(json, bin);
}

// ─── tests ─────────────────────────────────────────────────────────────────────

describe('Track-0 .holo mesh shape round-trip', () => {
  it('a constructed mesh round-trips through the REAL parser (parseHolo) byte-exact', () => {
    const mesh = constructedMesh();
    const block = meshShapeToHolo('Tri', encodeSkinnedMeshToHolo(mesh));
    const holo = `composition "T" {\n${block}\n}`;
    const back = holoShapeToMesh(findMeshShape(holo));

    expect(Array.from(back.positions)).toEqual(Array.from(mesh.positions));
    expect(Array.from(back.normals)).toEqual(Array.from(mesh.normals));
    expect(Array.from(back.uvs!)).toEqual(Array.from(mesh.uvs!));
    expect(Array.from(back.indices)).toEqual(Array.from(mesh.indices));
    expect(Array.from(back.jointIndices)).toEqual(Array.from(mesh.jointIndices));
    expect(Array.from(back.jointWeights)).toEqual(Array.from(mesh.jointWeights));
    expect(back.vertexCount).toBe(3);
  });

  it('importGltf emits a real mesh shape for a skinned .glb (import → .holo file → parse → mesh intact)', () => {
    const tmp = path.join(os.tmpdir(), `holo-track0-${process.pid}.glb`);
    fs.writeFileSync(tmp, Buffer.from(makeSkinnedTriangleGlb()));
    try {
      const holo = importGltf(tmp);
      expect(holo).toContain(' mesh {'); // a real mesh shape, not just a text pointer
      const back = holoShapeToMesh(findMeshShape(holo));
      expect(back.vertexCount).toBe(3);
      expect(back.positions.length).toBe(9); // 3 verts × 3
      expect(back.indices.length).toBe(3);
      // skin survived the round-trip (the extractor applies a 4→1 dominant-weight
      // reduction, so length tracks the extractor's layout, not a fixed 4/vert)
      expect(back.jointWeights.length).toBeGreaterThan(0);
      expect(back.jointIndices.length).toBe(back.jointWeights.length);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  it('the object geometry references the in-file carried shape, not a dead external pointer (single-mesh GLB)', () => {
    const tmp = path.join(os.tmpdir(), `holo-track0-link-${process.pid}.glb`);
    fs.writeFileSync(tmp, Buffer.from(makeSkinnedTriangleGlb()));
    try {
      const holo = importGltf(tmp);
      const shape = findMeshShape(holo);
      const geom = holo.match(/geometry:\s*"([^"]+)"/);
      expect(geom).not.toBeNull();
      // object.geometry resolves to the carried shape BY NAME — the surface lives
      // in the `.holo` file, not a `file.glb#Node` pointer to an external model.
      expect(geom![1]).toBe(shape.name);
      expect(holo).not.toMatch(/geometry:\s*"[^"]*\.glb#/);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  it('importGltf carries a NON-skinned static .glb as a real mesh (static extractor fallback)', () => {
    const tmp = path.join(os.tmpdir(), `holo-track0-static-${process.pid}.glb`);
    fs.writeFileSync(tmp, Buffer.from(makeStaticTriangleGlb()));
    try {
      const holo = importGltf(tmp);
      expect(holo).toContain(' mesh {'); // real geometry carried, not a text pointer
      const shape = findMeshShape(holo);
      const back = holoShapeToMesh(shape);
      expect(back.vertexCount).toBe(3);
      expect(Array.from(back.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      expect(Array.from(back.normals)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
      expect(Array.from(back.indices)).toEqual([0, 1, 2]);
      // rigid identity bind: no source skin → every vertex → root, weight 1.0.
      expect(Array.from(back.jointIndices)).toEqual([0, 0, 0]);
      expect(Array.from(back.jointWeights)).toEqual([1, 1, 1]);
      // single-mesh → object geometry references the carried shape, no dead pointer.
      const geom = holo.match(/geometry:\s*"([^"]+)"/);
      expect(geom?.[1]).toBe(shape.name);
      expect(holo).not.toMatch(/geometry:\s*"[^"]*\.glb#/);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  it('importGltf links each node to its OWN carried shape for a multi-mesh GLB (no dead pointers)', () => {
    const tmp = path.join(os.tmpdir(), `holo-track0-multi-${process.pid}.glb`);
    fs.writeFileSync(tmp, Buffer.from(makeTwoMeshGlb()));
    try {
      const holo = importGltf(tmp);
      const result = parseHolo(holo);
      expect(result.success).toBe(true);
      // Two distinct carried mesh shapes — one per glTF mesh.
      const meshShapes =
        result.ast?.shapes?.filter((s: { shapeType: string }) => s.shapeType === 'mesh') ?? [];
      expect(meshShapes.length).toBe(2);
      const shapeNames = new Set(meshShapes.map((s: { name: string }) => s.name));
      // Each object node references a real carried shape; both distinct; no dead pointer.
      const geomRefs = [...holo.matchAll(/geometry:\s*"([^"]+)"/g)].map((m) => m[1]);
      expect(geomRefs.length).toBe(2);
      expect(geomRefs[0]).not.toBe(geomRefs[1]);
      expect(new Set(geomRefs)).toEqual(shapeNames);
      expect(holo).not.toMatch(/geometry:\s*"[^"]*\.glb#/);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});
