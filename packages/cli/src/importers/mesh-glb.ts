/**
 * `.holo` mesh → glTF 2.0 .glb exporter — the inverse of the native extractor,
 * and the "compile" half of the Track-0 round-trip.
 *
 * `meshToGlb` writes a mesh's GEOMETRY (POSITION / NORMAL / TEXCOORD_0 /
 * indices) to a real binary .glb and, when the mesh carries a RIG
 * (inverse-bind matrices + joint count), also re-emits a glTF SKIN
 * (JOINTS_0 / WEIGHTS_0 + synthesized joint nodes + inverse-bind matrices).
 * `compileMeshShapeToGlb` runs it on a parsed `.holo` `shape … mesh { … }`
 * block. Together with `importGltf` (which carries a real mesh INTO `.holo`)
 * this closes the import → `.holo` file → compile → `.glb` round-trip.
 *
 * Skin fidelity: the import path reduces 4 glTF influences → 1 dominant joint
 * (the WGSL skinning shader is single-influence), so the re-emitted skin is
 * single-influence too — JOINTS_0 slot 0 = the dominant palette joint, weight
 * 1.0, the other three slots zero. That is a faithful round-trip of what the IR
 * holds, not a lossy downgrade introduced here. A mesh with no carried rig
 * (unskinned import) re-emits geometry-only, exactly as before.
 *
 * Scope: single mesh, single primitive. Draco re-compression on export is not a
 * goal (the importer DEcompresses; we emit plain glTF).
 *
 * @package @holoscript/cli/importers
 */
import type { SkinnedMeshData } from '@holoscript/engine';
import { holoShapeToMesh } from './mesh-shape';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

const CT_FLOAT = 5126; // FLOAT
const CT_USHORT = 5123; // UNSIGNED_SHORT
const CT_UINT = 5125; // UNSIGNED_INT

/** A mesh plus, optionally, the rig needed to re-emit a glTF skin. Matches the engine's
 *  `DecodedHoloMesh` structurally without importing it (keeps the type surface minimal). */
type ExportMesh = SkinnedMeshData & {
  inverseBindMatrices?: Float32Array;
  jointCount?: number;
};

/**
 * Compile a mesh to a glTF 2.0 .glb (single mesh, single primitive). Emits a skin when the
 * mesh carries inverse-bind matrices + a joint count; geometry-only otherwise.
 */
export function meshToGlb(mesh: ExportMesh): ArrayBuffer {
  const n = mesh.vertexCount;
  const hasUv = !!mesh.uvs && mesh.uvs.length === n * 2;
  const hasSkin =
    !!mesh.inverseBindMatrices &&
    mesh.jointCount !== undefined &&
    mesh.jointCount > 0 &&
    mesh.jointIndices.length >= n &&
    mesh.jointWeights.length >= n;

  // ── BIN: one bufferView per attribute. Every region is f32/u32/u16-VEC4 → its byteLength is
  //    a multiple of 4, so each region stays 4-byte aligned with no inter-region padding. ──
  const parts: Uint8Array[] = [];
  const bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
  let off = 0;
  const addView = (bytes: Uint8Array): number => {
    bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.byteLength });
    parts.push(bytes);
    off += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const f32 = (a: Float32Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const u32 = (a: Uint32Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

  const posView = addView(f32(mesh.positions));
  const nrmView = addView(f32(mesh.normals));
  const uvView = hasUv ? addView(f32(mesh.uvs!)) : -1;
  const idxView = addView(u32(mesh.indices));

  // POSITION min/max (glTF spec requires them on the position accessor).
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < n; v++) {
    for (let c = 0; c < 3; c++) {
      const x = mesh.positions[v * 3 + c];
      if (x < min[c]) min[c] = x;
      if (x > max[c]) max[c] = x;
    }
  }

  const accessors: Array<Record<string, unknown>> = [
    { bufferView: posView, componentType: CT_FLOAT, count: n, type: 'VEC3', min, max },
    { bufferView: nrmView, componentType: CT_FLOAT, count: n, type: 'VEC3' },
  ];
  const attributes: Record<string, number> = { POSITION: 0, NORMAL: 1 };
  if (hasUv) {
    attributes.TEXCOORD_0 = accessors.length;
    accessors.push({ bufferView: uvView, componentType: CT_FLOAT, count: n, type: 'VEC2' });
  }

  // ── Skin attributes (single-influence): JOINTS_0 (u16 VEC4) + WEIGHTS_0 (f32 VEC4). ──
  let skins: Array<Record<string, unknown>> | undefined;
  let skinNodeIndex: number | undefined;
  const extraNodes: Array<Record<string, unknown>> = [];
  if (hasSkin) {
    const jointCount = mesh.jointCount!;
    const joints = new Uint16Array(n * 4); // [dominant, 0, 0, 0] per vertex
    const weights = new Float32Array(n * 4); // [w, 0, 0, 0] per vertex
    for (let v = 0; v < n; v++) {
      // Clamp the palette index into [0, jointCount) — a carried index out of range would make
      // an invalid skin; fall back to root (0) rather than emit a broken glb.
      const j = mesh.jointIndices[v];
      joints[v * 4] = j < jointCount ? j : 0;
      weights[v * 4] = mesh.jointWeights[v];
    }
    const u16 = (a: Uint16Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const jntView = addView(u16(joints));
    const wgtView = addView(f32(weights));
    // Pad the IBM to exactly jointCount × 16 floats (defensive — extractor already sizes it so).
    const ibmSrc = mesh.inverseBindMatrices!;
    const ibm = new Float32Array(jointCount * 16);
    ibm.set(ibmSrc.subarray(0, Math.min(ibmSrc.length, ibm.length)));
    const ibmView = addView(f32(ibm));

    attributes.JOINTS_0 = accessors.length;
    accessors.push({ bufferView: jntView, componentType: CT_USHORT, count: n, type: 'VEC4' });
    attributes.WEIGHTS_0 = accessors.length;
    accessors.push({ bufferView: wgtView, componentType: CT_FLOAT, count: n, type: 'VEC4' });
    const ibmAccessor = accessors.length;
    accessors.push({
      bufferView: ibmView,
      componentType: CT_FLOAT,
      count: jointCount,
      type: 'MAT4',
    });

    // Synthesize `jointCount` joint nodes (node 1..jointCount; the mesh node is node 0). The
    // bind pose lives in the inverse-bind matrices, so the joint nodes are plain (identity).
    const jointNodeIndices: number[] = [];
    for (let j = 0; j < jointCount; j++) {
      jointNodeIndices.push(1 + j); // node indices after the mesh node (node 0)
      extraNodes.push({ name: `joint${j}` });
    }
    skins = [{ joints: jointNodeIndices, inverseBindMatrices: ibmAccessor }];
    skinNodeIndex = 0;
  }

  const idxAccessor = accessors.length;
  accessors.push({
    bufferView: idxView,
    componentType: CT_UINT,
    count: mesh.indices.length,
    type: 'SCALAR',
  });

  const meshNode: Record<string, unknown> = { mesh: 0 };
  if (skinNodeIndex !== undefined) meshNode.skin = 0;
  const nodes = [meshNode, ...extraNodes];
  // Scene roots: the mesh node + every joint node (so the joints are reachable).
  const sceneNodes = [0, ...extraNodes.map((_, i) => 1 + i)];

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'HoloScript meshToGlb (Track-0)' },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes,
    meshes: [{ primitives: [{ attributes, indices: idxAccessor, mode: 4 }] }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: off }],
    ...(skins ? { skins } : {}),
  };

  // ── Assemble GLB container. ──
  const binLength = off;
  const bin = new Uint8Array(binLength);
  let w = 0;
  for (const p of parts) {
    bin.set(p, w);
    w += p.byteLength;
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binPad = (4 - (binLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + binLength + binPad;

  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let o = 12;
  dv.setUint32(o, jsonBytes.length + jsonPad, true);
  dv.setUint32(o + 4, CHUNK_JSON, true);
  u8.set(jsonBytes, o + 8);
  for (let i = 0; i < jsonPad; i++) u8[o + 8 + jsonBytes.length + i] = 0x20; // space
  o += 8 + jsonBytes.length + jsonPad;
  dv.setUint32(o, binLength + binPad, true);
  dv.setUint32(o + 4, CHUNK_BIN, true);
  u8.set(bin, o + 8);
  // BIN trailing pad bytes are already zero.
  return out;
}

/** Compile a parsed `.holo` `shape … mesh { … }` block to a .glb (skin re-emitted when carried). */
export function compileMeshShapeToGlb(shape: {
  properties: ReadonlyArray<{ key: string; value: unknown }>;
}): ArrayBuffer {
  return meshToGlb(holoShapeToMesh(shape));
}
