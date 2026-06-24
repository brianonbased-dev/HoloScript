/**
 * Track-0 follow-up: a Draco/meshopt-compressed GLB decompresses at the import boundary so its
 * REAL mesh is carried into `.holo`, instead of failing the native extractor.
 * @see ../glb-decompress.ts
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { parseHolo } from '@holoscript/core/parser';
import { CharacterRender } from '@holoscript/engine';
import { isGlbCompressed, decompressGlb, importGltfAsync } from '../glb-decompress';

// ─── fixtures ────────────────────────────────────────────────────────────────

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

/** Minimal skinned-triangle GLB (mirrors GltfMeshExtractor.test.ts / mesh-glb.test.ts). */
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
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
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

/** Compress an existing GLB with Draco (EDGEBREAKER) via glTF-Transform — produces the kind of
 *  compressed asset a Meshy/Tripo export or most published `.glb`s ship as. */
async function compressDraco(glb: ArrayBuffer): Promise<ArrayBuffer> {
  const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  const doc = await io.readBinary(new Uint8Array(glb));
  doc
    .createExtension(KHRDracoMeshCompression)
    .setRequired(true)
    .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER });
  const out = await io.writeBinary(doc);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('Track-0 GLB decompression boundary', () => {
  it('isGlbCompressed: false for a plain GLB, true for a Draco-compressed one', async () => {
    const plain = makeSkinnedTriangleGlb();
    expect(isGlbCompressed(plain)).toBe(false);
    expect(isGlbCompressed(await compressDraco(plain))).toBe(true);
  });

  it('isGlbCompressed: detects EXT_meshopt_compression via extensionsUsed', () => {
    const glb = buildGlb({ asset: { version: '2.0' }, extensionsUsed: ['EXT_meshopt_compression'] }, new ArrayBuffer(0));
    expect(isGlbCompressed(glb)).toBe(true);
  });

  it('decompressGlb: a Draco GLB → plain glTF the native extractor reads', async () => {
    const compressed = await compressDraco(makeSkinnedTriangleGlb());
    const plain = await decompressGlb(compressed);
    // the compression extension is gone …
    expect(isGlbCompressed(plain)).toBe(false);
    // … and the native skinned extractor (which throws on a compressed primitive) now succeeds
    const mesh = CharacterRender.extractGltfSkinnedMesh(plain);
    expect(mesh.vertexCount).toBe(3);
    expect(mesh.indices.length).toBe(3);
  });

  it('importGltfAsync: a compressed GLB carries a real mesh shape into `.holo`', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-decomp-test-'));
    const file = path.join(dir, 'compressed_model.glb');
    fs.writeFileSync(file, Buffer.from(await compressDraco(makeSkinnedTriangleGlb())));
    try {
      const holo = await importGltfAsync(file);
      // a real mesh shape — not the degraded `file.glb#Node` text pointer
      expect(holo).toContain(' mesh {');
      const parsed = parseHolo(holo);
      expect(parsed.success).toBe(true);
      const shape = parsed.ast?.shapes?.find((s: { shapeType: string }) => s.shapeType === 'mesh');
      expect(shape).toBeDefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('importGltfAsync: an uncompressed GLB delegates to importGltf (still carries the mesh)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-plain-test-'));
    const file = path.join(dir, 'plain_model.glb');
    fs.writeFileSync(file, Buffer.from(makeSkinnedTriangleGlb()));
    try {
      const holo = await importGltfAsync(file);
      expect(holo).toContain(' mesh {');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
