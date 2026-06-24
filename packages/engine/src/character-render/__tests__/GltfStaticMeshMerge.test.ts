/**
 * Track-0 follow-up: a multi-primitive static GLB merges ALL its triangle primitives into one
 * `.holo`-carriable geometry (multi-primitive props are split by material — extracting only the
 * first primitive would drop the rest of the surface).
 * @see ../GltfMeshExtractor.ts  (extractGltfStaticMesh + mergePrimitiveGeometries)
 */
import { describe, it, expect } from 'vitest';
import { extractGltfStaticMesh } from '../GltfMeshExtractor';

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

/** Two-triangle-primitive static mesh: primitive A at x∈[0,1], primitive B shifted to x∈[2,3]. */
function makeTwoPrimitiveGlb(): ArrayBuffer {
  const bin = new ArrayBuffer(96);
  const dv = new DataView(bin);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true)); // posA  @0
  [2, 0, 0, 3, 0, 0, 2, 1, 0].forEach((v, i) => dv.setFloat32(36 + i * 4, v, true)); // posB @36
  [0, 1, 2].forEach((v, i) => dv.setUint32(72 + i * 4, v, true)); // idxA @72
  [0, 1, 2].forEach((v, i) => dv.setUint32(84 + i * 4, v, true)); // idxB @84
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 96 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 12 },
      { buffer: 0, byteOffset: 84, byteLength: 12 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3', min: [2, 0, 0], max: [3, 1, 0] },
      { bufferView: 2, componentType: 5125, count: 3, type: 'SCALAR' },
      { bufferView: 3, componentType: 5125, count: 3, type: 'SCALAR' },
    ],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0 }, indices: 2, mode: 4 },
          { attributes: { POSITION: 1 }, indices: 3, mode: 4 },
        ],
      },
    ],
    nodes: [{ mesh: 0 }],
  };
  return buildGlb(json, bin);
}

describe('extractGltfStaticMesh — multi-primitive merge', () => {
  it('merges all triangle primitives into one geometry with offset indices', () => {
    const mesh = extractGltfStaticMesh(makeTwoPrimitiveGlb());
    // both primitives' vertices are present
    expect(mesh.vertexCount).toBe(6);
    expect(mesh.positions.length).toBe(18);
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]);
    // primitive B's indices are offset into the merged vertex stream (not 0,1,2 again)
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2, 3, 4, 5]);
    // neutral rigid bind covers every merged vertex
    expect(mesh.jointIndices.length).toBe(6);
    expect(mesh.jointWeights.length).toBe(6);
    expect(Array.from(mesh.jointWeights)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('a single-primitive mesh still extracts unchanged (degenerate merge)', () => {
    const bin = new ArrayBuffer(48);
    const dv = new DataView(bin);
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true));
    [0, 1, 2].forEach((v, i) => dv.setUint32(36 + i * 4, v, true));
    const glb = buildGlb(
      {
        asset: { version: '2.0' },
        buffers: [{ byteLength: 48 }],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 36 },
          { buffer: 0, byteOffset: 36, byteLength: 12 },
        ],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
          { bufferView: 1, componentType: 5125, count: 3, type: 'SCALAR' },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
        nodes: [{ mesh: 0 }],
      },
      bin
    );
    const mesh = extractGltfStaticMesh(glb);
    expect(mesh.vertexCount).toBe(3);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
  });
});
