/**
 * GltfMeshExtractor tests — fully headless (no GPU, no asset file).
 *
 * Builds a tiny in-memory .glb (one triangle, a 2-joint RPM-named skin, identity inverse-binds)
 * and asserts the whole extract path: GLB container parse, accessor decode + Uint16→Uint32 index
 * upcast, glTF-joint → canonical palette remap via the matched standard, the 4→1 dominant-weight
 * reduction, palette-ordered inverse-binds, and ArrayBuffer-backed outputs. Includes the false
 * case (G.GOLD.013): an unmapped joint name falls back to root.
 */
import { describe, it, expect } from 'vitest';
import {
  parseGlb,
  extractGltfSkinnedMesh,
  extractGltfStaticMesh,
  extractGltfMeshes,
} from '../GltfMeshExtractor';
import { BONE_ORDER, JOINT_COUNT } from '../AgentAvatarMesh';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import { renderCharacter } from '../character-render';
import { IDENTITY4 } from '../skin-math';
import { fromTranslation } from '../skin-math';
import type { CharacterDrawSpec } from '../../native-render/draw-spec';

const HIPS = BONE_ORDER.indexOf('hips');
const SPINE = BONE_ORDER.indexOf('spine');

/** Assemble a .glb from a glTF JSON object + a BIN ArrayBuffer (4-byte chunk padding). */
function buildGlb(json: object, bin: ArrayBuffer): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (bin.byteLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.byteLength + binPad;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint32(0, 0x46546c67, true); // magic 'glTF'
  dv.setUint32(4, 2, true); // version
  dv.setUint32(8, total, true);
  let off = 12;
  // JSON chunk
  dv.setUint32(off, jsonBytes.length + jsonPad, true);
  dv.setUint32(off + 4, 0x4e4f534a, true); // 'JSON'
  u8.set(jsonBytes, off + 8);
  for (let i = 0; i < jsonPad; i++) u8[off + 8 + jsonBytes.length + i] = 0x20; // space pad
  off += 8 + jsonBytes.length + jsonPad;
  // BIN chunk
  dv.setUint32(off, bin.byteLength + binPad, true);
  dv.setUint32(off + 4, 0x004e4942, true); // 'BIN\0'
  u8.set(new Uint8Array(bin), off + 8);
  return buf;
}

/** A one-triangle skinned .glb with 2 RPM-named joints (Hips, Spine) + identity inverse-binds. */
function makeSkinnedTriangleGlb(): ArrayBuffer {
  // BIN layout (one bufferView, accessors by byteOffset):
  //   POSITION VEC3 f32 x3  @0   (36)
  //   NORMAL   VEC3 f32 x3  @36  (36)
  //   JOINTS_0 VEC4 u8  x3  @72  (12)
  //   WEIGHTS_0 VEC4 f32 x3 @84  (48)
  //   indices  SCALAR u16 x3 @132 (6)
  //   IBM      MAT4 f32 x2  @140 (128)  [pad 138→140]
  const binLen = 268;
  const bin = new ArrayBuffer(binLen);
  const dv = new DataView(bin);
  const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  pos.forEach((v, i) => dv.setFloat32(i * 4, v, true));
  const nrm = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  nrm.forEach((v, i) => dv.setFloat32(36 + i * 4, v, true));
  // JOINTS_0 (u8) per vert: all reference skin slots {0:Hips, 1:Spine}
  const joints = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  joints.forEach((v, i) => dv.setUint8(72 + i, v));
  // WEIGHTS_0 (f32): vert0 dominant slot0(Hips), vert1 dominant slot1(Spine), vert2 dominant slot0
  const weights = [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0];
  weights.forEach((v, i) => dv.setFloat32(84 + i * 4, v, true));
  // indices u16
  [0, 1, 2].forEach((v, i) => dv.setUint16(132 + i * 2, v, true));
  // IBM: two identity mat4
  for (let m = 0; m < 2; m++) {
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    I.forEach((v, i) => dv.setFloat32(140 + m * 64 + i * 4, v, true));
  }

  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binLen }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binLen }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' }, // POSITION
      { bufferView: 0, byteOffset: 36, componentType: 5126, count: 3, type: 'VEC3' }, // NORMAL
      { bufferView: 0, byteOffset: 72, componentType: 5121, count: 3, type: 'VEC4' }, // JOINTS_0 (u8)
      { bufferView: 0, byteOffset: 84, componentType: 5126, count: 3, type: 'VEC4' }, // WEIGHTS_0
      { bufferView: 0, byteOffset: 132, componentType: 5123, count: 3, type: 'SCALAR' }, // indices u16
      { bufferView: 0, byteOffset: 140, componentType: 5126, count: 2, type: 'MAT4' }, // IBM
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 },
            indices: 4,
            mode: 4,
          },
        ],
      },
    ],
    nodes: [{ mesh: 0, skin: 0 }, { name: 'Hips' }, { name: 'Spine' }],
    skins: [{ joints: [1, 2], inverseBindMatrices: 5 }],
  };
  return buildGlb(json, bin);
}

/** The same one-triangle skinned .glb, plus a TEXCOORD_0 (UV) attribute. */
function makeSkinnedTriangleGlbWithUv(): ArrayBuffer {
  // BIN: POSITION@0(36) NORMAL@36(36) TEXCOORD_0@72(24) JOINTS_0@96(12,u8)
  //      WEIGHTS_0@108(48) indices@156(6,u16) [pad→164] IBM@164(128) = 292
  const binLen = 292;
  const bin = new ArrayBuffer(binLen);
  const dv = new DataView(bin);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true)); // POSITION
  [0, 0, 1, 0, 0, 1, 0, 0, 1].forEach((v, i) => dv.setFloat32(36 + i * 4, v, true)); // NORMAL
  [0, 0, 1, 0, 0, 1].forEach((v, i) => dv.setFloat32(72 + i * 4, v, true)); // TEXCOORD_0: uv0,uv1,uv2
  [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0].forEach((v, i) => dv.setUint8(96 + i, v)); // JOINTS_0
  [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0].forEach((v, i) => dv.setFloat32(108 + i * 4, v, true)); // WEIGHTS_0
  [0, 1, 2].forEach((v, i) => dv.setUint16(156 + i * 2, v, true)); // indices
  for (let m = 0; m < 2; m++) {
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((v, i) =>
      dv.setFloat32(164 + m * 64 + i * 4, v, true)
    ); // IBM (two identity mat4)
  }
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binLen }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binLen }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' }, // POSITION
      { bufferView: 0, byteOffset: 36, componentType: 5126, count: 3, type: 'VEC3' }, // NORMAL
      { bufferView: 0, byteOffset: 72, componentType: 5126, count: 3, type: 'VEC2' }, // TEXCOORD_0
      { bufferView: 0, byteOffset: 96, componentType: 5121, count: 3, type: 'VEC4' }, // JOINTS_0 (u8)
      { bufferView: 0, byteOffset: 108, componentType: 5126, count: 3, type: 'VEC4' }, // WEIGHTS_0
      { bufferView: 0, byteOffset: 156, componentType: 5123, count: 3, type: 'SCALAR' }, // indices u16
      { bufferView: 0, byteOffset: 164, componentType: 5126, count: 2, type: 'MAT4' }, // IBM
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
            indices: 5,
            mode: 4,
          },
        ],
      },
    ],
    nodes: [{ mesh: 0, skin: 0 }, { name: 'Hips' }, { name: 'Spine' }],
    skins: [{ joints: [1, 2], inverseBindMatrices: 6 }],
  };
  return buildGlb(json, bin);
}

/** A textured one-triangle skinned glb: UV geometry + a 4-byte embedded baseColor image. */
function makeTexturedSkinnedTriangleGlb(): ArrayBuffer {
  const geomLen = 292; // same geometry layout as makeSkinnedTriangleGlbWithUv
  const imgBytes = [0x89, 0x50, 0x4e, 0x47]; // 'PNG' magic — opaque to the extractor (no decode)
  const binLen = geomLen + imgBytes.length; // 296
  const bin = new ArrayBuffer(binLen);
  const dv = new DataView(bin);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true)); // POSITION
  [0, 0, 1, 0, 0, 1, 0, 0, 1].forEach((v, i) => dv.setFloat32(36 + i * 4, v, true)); // NORMAL
  [0, 0, 1, 0, 0, 1].forEach((v, i) => dv.setFloat32(72 + i * 4, v, true)); // TEXCOORD_0
  [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0].forEach((v, i) => dv.setUint8(96 + i, v)); // JOINTS_0
  [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0].forEach((v, i) => dv.setFloat32(108 + i * 4, v, true)); // WEIGHTS_0
  [0, 1, 2].forEach((v, i) => dv.setUint16(156 + i * 2, v, true)); // indices
  for (let m = 0; m < 2; m++) {
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((v, i) =>
      dv.setFloat32(164 + m * 64 + i * 4, v, true)
    ); // IBM
  }
  imgBytes.forEach((b, i) => dv.setUint8(geomLen + i, b)); // embedded baseColor image @292
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binLen }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: geomLen },
      { buffer: 0, byteOffset: geomLen, byteLength: imgBytes.length },
    ],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 0, byteOffset: 36, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 0, byteOffset: 72, componentType: 5126, count: 3, type: 'VEC2' },
      { bufferView: 0, byteOffset: 96, componentType: 5121, count: 3, type: 'VEC4' },
      { bufferView: 0, byteOffset: 108, componentType: 5126, count: 3, type: 'VEC4' },
      { bufferView: 0, byteOffset: 156, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 0, byteOffset: 164, componentType: 5126, count: 2, type: 'MAT4' },
    ],
    images: [{ bufferView: 1, mimeType: 'image/png' }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
            indices: 5,
            material: 0,
            mode: 4,
          },
        ],
      },
    ],
    nodes: [{ mesh: 0, skin: 0 }, { name: 'Hips' }, { name: 'Spine' }],
    skins: [{ joints: [1, 2], inverseBindMatrices: 6 }],
  };
  return buildGlb(json, bin);
}

describe('GltfMeshExtractor', () => {
  it('parses the GLB container into JSON + BIN chunks', () => {
    const { json, bin } = parseGlb(makeSkinnedTriangleGlb());
    expect(json.meshes?.length).toBe(1);
    expect(bin.byteLength).toBeGreaterThanOrEqual(268);
  });

  it('extracts a skinned mesh with palette-remapped single-influence joints', () => {
    const m = extractGltfSkinnedMesh(makeSkinnedTriangleGlb());
    expect(m.vertexCount).toBe(3);
    expect(m.positions.length).toBe(9);
    expect(m.tangents.length).toBe(12); // 4/vert placeholder
    expect(Array.from(m.indices)).toEqual([0, 1, 2]); // Uint16 upcast → Uint32
    expect(m.indices).toBeInstanceOf(Uint32Array);

    // RPM-named joints → matched standard; Hips/Spine remap to canonical palette indices.
    expect(m.skeletonStandard).toBe('rpm');
    expect(m.unmappedJoints).toEqual([]);
    // Dominant-weight reduction: vert0→Hips, vert1→Spine, vert2→Hips.
    expect(Array.from(m.jointIndices)).toEqual([HIPS, SPINE, HIPS]);
    expect(Array.from(m.jointWeights)).toEqual([1, 1, 1]);

    // Palette-ordered inverse-binds, ArrayBuffer-backed.
    expect(m.inverseBindMatrices.length).toBe(JOINT_COUNT * 16);
    expect(m.jointCount).toBe(JOINT_COUNT);
    expect(m.positions.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('extracts TEXCOORD_0 UVs that round-trip from the GLB (Track 0: .holo mesh carries UVs)', () => {
    const m = extractGltfSkinnedMesh(makeSkinnedTriangleGlbWithUv());
    expect(m.uvs).toBeInstanceOf(Float32Array);
    expect(m.uvs!.length).toBe(m.vertexCount * 2); // 2 floats/vert
    expect(Array.from(m.uvs!)).toEqual([0, 0, 1, 0, 0, 1]); // source UVs survive byte-for-byte
    expect(m.uvs!.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('leaves uvs undefined when the primitive has no TEXCOORD_0 (false case)', () => {
    const m = extractGltfSkinnedMesh(makeSkinnedTriangleGlb());
    expect(m.uvs).toBeUndefined();
  });

  it('extracts the material baseColor texture map as encoded bytes (Track 0: .holo material carries texture maps)', () => {
    const m = extractGltfSkinnedMesh(makeTexturedSkinnedTriangleGlb());
    expect(m.materialMaps).toBeDefined();
    expect(m.materialMaps!.albedoMap?.mimeType).toBe('image/png');
    // the embedded image bytes round-trip out of the GLB BIN verbatim
    expect(Array.from(m.materialMaps!.albedoMap!.bytes!)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(m.materialMaps!.albedoMap!.bytes!.buffer).toBeInstanceOf(ArrayBuffer);
    // un-referenced maps stay undefined
    expect(m.materialMaps!.normalMap).toBeUndefined();
    expect(m.materialMaps!.metalRoughMap).toBeUndefined();
  });

  it('leaves materialMaps undefined when the primitive has no material (false case)', () => {
    const m = extractGltfSkinnedMesh(makeSkinnedTriangleGlbWithUv());
    expect(m.materialMaps).toBeUndefined();
  });

  it('rejects Draco-compressed primitives loudly', () => {
    // Hand-build a glb whose primitive declares the Draco extension.
    const bin = new ArrayBuffer(4);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      accessors: [],
      meshes: [
        {
          primitives: [
            {
              attributes: { JOINTS_0: 0, WEIGHTS_0: 0 },
              extensions: { KHR_draco_mesh_compression: {} },
            },
          ],
        },
      ],
    };
    expect(() => extractGltfSkinnedMesh(buildGlb(json, bin))).toThrow(/Draco|meshopt|compressed/i);
  });

  it('falls back to root for an unmapped joint name (false case)', () => {
    // Build a glb whose single joint has a non-canonical name → unmapped → vertices collapse to root.
    const binLen = 268;
    const bin = new ArrayBuffer(binLen);
    const dv = new DataView(bin);
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true));
    [0, 0, 1, 0, 0, 1, 0, 0, 1].forEach((v, i) => dv.setFloat32(36 + i * 4, v, true));
    for (let i = 0; i < 12; i++) dv.setUint8(72 + i, 0); // all → slot 0
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0].forEach((v, i) => dv.setFloat32(84 + i * 4, v, true));
    [0, 1, 2].forEach((v, i) => dv.setUint16(132 + i * 2, v, true));
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((v, i) =>
      dv.setFloat32(140 + i * 4, v, true)
    );
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
        { bufferView: 0, byteOffset: 140, componentType: 5126, count: 1, type: 'MAT4' },
      ],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 },
              indices: 4,
              mode: 4,
            },
          ],
        },
      ],
      nodes: [{ mesh: 0, skin: 0 }, { name: 'made_up_bone' }],
      skins: [{ joints: [1], inverseBindMatrices: 5 }],
    };
    const m = extractGltfSkinnedMesh(buildGlb(json, bin));
    expect(m.unmappedJoints).toContain('made_up_bone');
    expect(Array.from(m.jointIndices)).toEqual([0, 0, 0]); // collapse to root
  });

  const itGpu = GPU_LIVE ? it : it.skip;
  itGpu('the extracted glTF mesh renders natively at bind pose (GLB → WebGPU pixels)', async () => {
    const m = extractGltfSkinnedMesh(makeSkinnedTriangleGlb());
    // Bind pose = identity skin palette (skinnedPos == authored vertex; no deform).
    const palette = new Float32Array(JOINT_COUNT * 16);
    for (let i = 0; i < JOINT_COUNT; i++) palette.set(IDENTITY4(), i * 16);
    const spec: CharacterDrawSpec = {
      entityId: 'gltf-test',
      mesh: m,
      jointMatrices: palette,
      jointCount: JOINT_COUNT,
      material: { color: 0xc08040, metalness: 0, roughness: 0.8, emissive: 0, opacity: 1 },
      modelMatrix: fromTranslation(0, 0, 0),
    };
    // Frame the unit triangle (spans x,y in [0,1]).
    const grid = await renderCharacter(testDevice!, spec, { size: 64, heightScale: 1 });
    let nonClear = 0;
    for (let i = 0; i < grid.data.length; i += 4) {
      if (
        Math.abs(grid.data[i] - 18) +
          Math.abs(grid.data[i + 1] - 18) +
          Math.abs(grid.data[i + 2] - 23) >
        40
      )
        nonClear++;
    }
    expect(nonClear).toBeGreaterThan(20); // the triangle rasterized
  });

  // ─── static (non-skinned) extractor ─────────────────────────────────────────

  /** A one-triangle NON-skinned glb: POSITION + indices only (no NORMAL, no skin). */
  function makeStaticTriangleGlbNoNormal(): ArrayBuffer {
    const binLen = 42; // POSITION VEC3 f32 x3 @0 (36); indices u16 x3 @36 (6).
    const bin = new ArrayBuffer(binLen);
    const dv = new DataView(bin);
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true));
    [0, 1, 2].forEach((v, i) => dv.setUint16(36 + i * 2, v, true));
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: binLen }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
      nodes: [{ mesh: 0 }],
    };
    return buildGlb(json, bin);
  }

  it('extractGltfStaticMesh carries a non-skinned mesh with a rigid identity bind', () => {
    const m = extractGltfStaticMesh(makeStaticTriangleGlbNoNormal());
    expect(m.vertexCount).toBe(3);
    expect(Array.from(m.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(m.indices)).toEqual([0, 1, 2]);
    // No source skin → every vertex rides palette root (joint 0) at weight 1.0.
    expect(Array.from(m.jointIndices)).toEqual([0, 0, 0]);
    expect(Array.from(m.jointWeights)).toEqual([1, 1, 1]);
    expect(m.jointCount).toBe(JOINT_COUNT);
    expect(m.skeletonStandard).toBe('holoscript_65');
  });

  it('extractGltfStaticMesh synthesizes up-normals when NORMAL is absent', () => {
    const m = extractGltfStaticMesh(makeStaticTriangleGlbNoNormal());
    expect(Array.from(m.normals)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]); // (0,1,0)/vert
  });

  it('extractGltfStaticMesh throws on a Draco-compressed primitive (fail loud)', () => {
    const bin = new ArrayBuffer(4);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 1, type: 'SCALAR' }],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
              extensions: { KHR_draco_mesh_compression: {} },
              mode: 4,
            },
          ],
        },
      ],
      nodes: [{ mesh: 0 }],
    };
    expect(() => extractGltfStaticMesh(buildGlb(json, bin))).toThrow(/Draco/);
  });

  // ─── extractGltfMeshes (single-parse, all meshes) ───────────────────────────

  /** Two static triangles, one glTF mesh each (mesh0 @origin, mesh1 @+5x). */
  function makeTwoStaticMeshGlb(): ArrayBuffer {
    const binLen = 88; // m0 POS@0(36) idx@36(6) pad→44; m1 POS@44(36) idx@80(6).
    const bin = new ArrayBuffer(binLen);
    const dv = new DataView(bin);
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true));
    [0, 1, 2].forEach((v, i) => dv.setUint16(36 + i * 2, v, true));
    [5, 0, 0, 6, 0, 0, 5, 1, 0].forEach((v, i) => dv.setFloat32(44 + i * 4, v, true));
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
      nodes: [{ mesh: 0 }, { mesh: 1 }],
    };
    return buildGlb(json, bin);
  }

  /** mesh0 readable static; mesh1 a Draco primitive (must be skipped, not thrown). */
  function makeStaticThenDracoGlb(): ArrayBuffer {
    const binLen = 42;
    const bin = new ArrayBuffer(binLen);
    const dv = new DataView(bin);
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => dv.setFloat32(i * 4, v, true));
    [0, 1, 2].forEach((v, i) => dv.setUint16(36 + i * 2, v, true));
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: binLen }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] },
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
              extensions: { KHR_draco_mesh_compression: {} },
              mode: 4,
            },
          ],
        },
      ],
      nodes: [{ mesh: 0 }, { mesh: 1 }],
    };
    return buildGlb(json, bin);
  }

  it('extractGltfMeshes returns one entry per carryable mesh, keyed by glTF mesh index', () => {
    const meshes = extractGltfMeshes(makeTwoStaticMeshGlb());
    expect(meshes.map((m) => m.meshIndex)).toEqual([0, 1]);
    expect(meshes[0].mesh.vertexCount).toBe(3);
    expect(Array.from(meshes[0].mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(meshes[1].mesh.positions)).toEqual([5, 0, 0, 6, 0, 0, 5, 1, 0]);
  });

  it('extractGltfMeshes skips a mesh neither extractor can read (Draco), without throwing', () => {
    const meshes = extractGltfMeshes(makeStaticThenDracoGlb());
    expect(meshes.map((m) => m.meshIndex)).toEqual([0]); // mesh1 (Draco) skipped
    expect(meshes[0].mesh.vertexCount).toBe(3);
  });
});
