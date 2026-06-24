/**
 * HoloMeshGeometry codec tests — the `.holo` mesh round-trip (Track 0 slice).
 * @see ../HoloMeshGeometry.ts
 */
import { describe, it, expect } from 'vitest';
import {
  encodeSkinnedMeshToHolo,
  decodeSkinnedMeshFromHolo,
  type HoloMeshGeometry,
} from '../HoloMeshGeometry';
import type { SkinnedMeshData } from '../draw-spec';
import { extractGltfSkinnedMesh } from '../../character-render/GltfMeshExtractor';

// ─── minimal in-memory GLB fixtures (mirrors GltfMeshExtractor.test.ts) ────────

function buildGlb(json: object, bin: ArrayBuffer): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.byteLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.byteLength + binPad;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let off = 12;
  dv.setUint32(off, jsonBytes.length + jsonPad, true);
  dv.setUint32(off + 4, 0x4e4f534a, true); // 'JSON'
  u8.set(jsonBytes, off + 8);
  for (let i = 0; i < jsonPad; i++) u8[off + 8 + jsonBytes.length + i] = 0x20;
  off += 8 + jsonBytes.length + jsonPad;
  dv.setUint32(off, bin.byteLength + binPad, true);
  dv.setUint32(off + 4, 0x004e4942, true); // 'BIN\0'
  u8.set(new Uint8Array(bin), off + 8);
  return buf;
}

/** One-triangle skinned .glb, 2 RPM-named joints (Hips, Spine), identity inverse-binds, no UVs. */
function makeSkinnedTriangleGlb(): ArrayBuffer {
  const binLen = 268;
  const bin = new ArrayBuffer(binLen);
  const dv = new DataView(bin);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true)); // POSITION
  [0, 0, 1, 0, 0, 1, 0, 0, 1].forEach((v, i) => dv.setFloat32(36 + i * 4, v, true)); // NORMAL
  [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0].forEach((v, i) => dv.setUint8(72 + i, v)); // JOINTS_0 (u8)
  [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0].forEach((v, i) => dv.setFloat32(84 + i * 4, v, true)); // WEIGHTS_0
  [0, 1, 2].forEach((v, i) => dv.setUint16(132 + i * 2, v, true)); // indices u16
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

function eq(a: ArrayLike<number> | undefined, b: ArrayLike<number> | undefined) {
  return JSON.stringify(a ? Array.from(a) : undefined) === JSON.stringify(b ? Array.from(b) : undefined);
}

// ─── tests ─────────────────────────────────────────────────────────────────────

describe('HoloMeshGeometry codec', () => {
  it('round-trips a constructed SkinnedMeshData byte-exact (with UVs)', () => {
    const mesh: SkinnedMeshData = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      jointIndices: new Uint32Array([0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]),
      jointWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      vertexCount: 3,
    };
    const back = decodeSkinnedMeshFromHolo(encodeSkinnedMeshToHolo(mesh));
    expect(eq(back.positions, mesh.positions)).toBe(true);
    expect(eq(back.normals, mesh.normals)).toBe(true);
    expect(eq(back.tangents, mesh.tangents)).toBe(true);
    expect(eq(back.uvs, mesh.uvs)).toBe(true);
    expect(eq(back.indices, mesh.indices)).toBe(true);
    expect(eq(back.jointIndices, mesh.jointIndices)).toBe(true);
    expect(eq(back.jointWeights, mesh.jointWeights)).toBe(true);
    expect(back.vertexCount).toBe(3);
  });

  it('omits uvs when the source mesh has none (false case)', () => {
    const mesh: SkinnedMeshData = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      jointIndices: new Uint32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      jointWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      vertexCount: 3,
    };
    const geo: HoloMeshGeometry = encodeSkinnedMeshToHolo(mesh);
    expect(geo.uvsB64).toBeUndefined();
    expect(decodeSkinnedMeshFromHolo(geo).uvs).toBeUndefined();
  });

  it('carries a REAL extracted GLB mesh through .holo intact (Track-0 round-trip)', () => {
    const mesh = extractGltfSkinnedMesh(makeSkinnedTriangleGlb());
    const back = decodeSkinnedMeshFromHolo(encodeSkinnedMeshToHolo(mesh));
    expect(eq(back.positions, mesh.positions)).toBe(true);
    expect(eq(back.normals, mesh.normals)).toBe(true);
    expect(eq(back.indices, mesh.indices)).toBe(true);
    expect(eq(back.jointIndices, mesh.jointIndices)).toBe(true);
    expect(eq(back.jointWeights, mesh.jointWeights)).toBe(true);
    expect(back.vertexCount).toBe(mesh.vertexCount);
  });
});
