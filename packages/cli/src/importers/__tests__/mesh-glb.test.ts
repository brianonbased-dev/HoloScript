/**
 * Track-0 export: `.holo` mesh shape → real .glb, closing the
 * import → `.holo` file → compile → `.glb` round-trip with geometry intact.
 * @see ../mesh-glb.ts
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseHolo } from '@holoscript/core/parser';
import { CharacterRender, type SkinnedMeshData } from '@holoscript/engine';
import { meshToGlb, compileMeshShapeToGlb } from '../mesh-glb';
import { importGltf } from '../gltf-importer';

type GltfLike = {
  accessors: Array<{ bufferView: number; count: number; type: string; componentType?: number }>;
  bufferViews: Array<{ byteOffset?: number; byteLength: number }>;
  meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices: number }> }>;
  nodes?: Array<{ mesh?: number; skin?: number; name?: string }>;
  skins?: Array<{ joints: number[]; inverseBindMatrices?: number }>;
};

const COMPS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readF32(g: GltfLike, bin: Uint8Array, acc: number): number[] {
  const a = g.accessors[acc];
  const bv = g.bufferViews[a.bufferView];
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), bv.byteLength);
  const out: number[] = [];
  for (let i = 0; i < a.count * COMPS[a.type]; i++) out.push(dv.getFloat32(i * 4, true));
  return out;
}
function readU32(g: GltfLike, bin: Uint8Array, acc: number): number[] {
  const a = g.accessors[acc];
  const bv = g.bufferViews[a.bufferView];
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), bv.byteLength);
  const out: number[] = [];
  for (let i = 0; i < a.count; i++) out.push(dv.getUint32(i * 4, true));
  return out;
}
function readU16(g: GltfLike, bin: Uint8Array, acc: number): number[] {
  const a = g.accessors[acc];
  const bv = g.bufferViews[a.bufferView];
  const dv = new DataView(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), bv.byteLength);
  const out: number[] = [];
  for (let i = 0; i < a.count * COMPS[a.type]; i++) out.push(dv.getUint16(i * 2, true));
  return out;
}

function parse(glb: ArrayBuffer) {
  const { json, bin } = CharacterRender.parseGlb(glb);
  return { g: json as unknown as GltfLike, bin };
}

function constructedMesh(): SkinnedMeshData {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    jointIndices: new Uint32Array([0, 1, 0]),
    jointWeights: new Float32Array([1, 1, 1]),
    vertexCount: 3,
  };
}

// minimal skinned-triangle GLB fixture (mirrors GltfMeshExtractor.test.ts)
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

describe('Track-0 mesh → .glb export', () => {
  it('meshToGlb writes geometry (POSITION/NORMAL/TEXCOORD_0/indices) round-trip-intact', () => {
    const mesh = constructedMesh();
    const { g, bin } = parse(meshToGlb(mesh));
    const prim = g.meshes[0].primitives[0];

    expect(readF32(g, bin, prim.attributes.POSITION)).toEqual(Array.from(mesh.positions));
    expect(readF32(g, bin, prim.attributes.NORMAL)).toEqual(Array.from(mesh.normals));
    expect(readF32(g, bin, prim.attributes.TEXCOORD_0)).toEqual(Array.from(mesh.uvs!));
    expect(readU32(g, bin, prim.indices)).toEqual(Array.from(mesh.indices));
  });

  it('full vertical: real GLB → importGltf → .holo → parse → compile → .glb (geometry intact)', () => {
    const tmp = path.join(os.tmpdir(), `holo-track0-glb-${process.pid}.glb`);
    fs.writeFileSync(tmp, Buffer.from(makeSkinnedTriangleGlb()));
    try {
      const result = parseHolo(importGltf(tmp));
      const shape = result.ast?.shapes?.find((s: { shapeType?: string }) => s.shapeType === 'mesh');
      expect(shape).toBeDefined();

      const { g, bin } = parse(compileMeshShapeToGlb(shape!));
      const prim = g.meshes[0].primitives[0];
      // the original triangle survives the entire loop
      expect(readF32(g, bin, prim.attributes.POSITION)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      expect(readU32(g, bin, prim.indices)).toEqual([0, 1, 2]);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  // ─── skin re-emit (Track-0 follow-up) ─────────────────────────────────────────

  function riggedMesh(): SkinnedMeshData & { inverseBindMatrices: Float32Array; jointCount: number } {
    // jointCount=2; distinct (non-identity) inverse-binds so we can prove the values survive.
    const ibm = new Float32Array(2 * 16);
    for (let j = 0; j < 2; j++) {
      ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, j === 0 ? -1 : 2, 0.5, 0, 1], j * 16);
    }
    return {
      ...constructedMesh(),
      jointIndices: new Uint32Array([0, 1, 0]),
      jointWeights: new Float32Array([1, 1, 1]),
      inverseBindMatrices: ibm,
      jointCount: 2,
    };
  }

  it('meshToGlb re-emits a skin (JOINTS_0/WEIGHTS_0 + joints + inverse-binds) when the mesh carries a rig', () => {
    const mesh = riggedMesh();
    const { g, bin } = parse(meshToGlb(mesh));
    const prim = g.meshes[0].primitives[0];

    // single-influence skin attributes are present
    expect(prim.attributes.JOINTS_0).toBeDefined();
    expect(prim.attributes.WEIGHTS_0).toBeDefined();
    // dominant joint lands in slot 0; the other three slots are zero
    expect(readU16(g, bin, prim.attributes.JOINTS_0)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(readF32(g, bin, prim.attributes.WEIGHTS_0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);

    // a real skin: 2 joint nodes, mesh node bound to it, inverse-binds carried verbatim
    expect(g.skins).toBeDefined();
    expect(g.skins![0].joints.length).toBe(2);
    expect(g.nodes?.[0].skin).toBe(0);
    const ibmAcc = g.skins![0].inverseBindMatrices!;
    expect(g.accessors[ibmAcc].type).toBe('MAT4');
    expect(g.accessors[ibmAcc].count).toBe(2);
    expect(readF32(g, bin, ibmAcc)).toEqual(Array.from(mesh.inverseBindMatrices));
  });

  it('geometry-only mesh (no rig) re-emits NO skin', () => {
    const { g } = parse(meshToGlb(constructedMesh()));
    expect(g.skins).toBeUndefined();
    expect(g.meshes[0].primitives[0].attributes.JOINTS_0).toBeUndefined();
    expect(g.nodes?.[0].skin).toBeUndefined();
  });

  it('full vertical with skin: real skinned GLB → importGltf → .holo → compile → .glb keeps a skin', () => {
    const tmp = path.join(os.tmpdir(), `holo-track0-skin-${process.pid}.glb`);
    fs.writeFileSync(tmp, Buffer.from(makeSkinnedTriangleGlb()));
    try {
      const result = parseHolo(importGltf(tmp));
      const shape = result.ast?.shapes?.find((s: { shapeType?: string }) => s.shapeType === 'mesh');
      expect(shape).toBeDefined();

      const { g, bin } = parse(compileMeshShapeToGlb(shape!));
      const prim = g.meshes[0].primitives[0];
      // the rig carried by the importer round-trips into a real skin on export
      expect(prim.attributes.JOINTS_0).toBeDefined();
      expect(prim.attributes.WEIGHTS_0).toBeDefined();
      expect(g.skins).toBeDefined();
      expect(g.skins![0].joints.length).toBeGreaterThan(0);
      // geometry still intact alongside the skin
      expect(readF32(g, bin, prim.attributes.POSITION)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});
