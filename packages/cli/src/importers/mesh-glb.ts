/**
 * `.holo` mesh → glTF 2.0 .glb exporter — the inverse of the native extractor,
 * and the "compile" half of the Track-0 round-trip.
 *
 * `meshToGlb` writes a SkinnedMeshData's GEOMETRY (POSITION / NORMAL /
 * TEXCOORD_0 / indices) to a real binary .glb; `compileMeshShapeToGlb` runs it
 * on a parsed `.holo` `shape … mesh { … }` block. Together with `importGltf`
 * (which carries a real mesh INTO `.holo`) this closes the
 * import → `.holo` file → compile → `.glb` round-trip with geometry intact.
 *
 * Scope: geometry only this slice. Skin re-emit (JOINTS_0 / WEIGHTS_0 + a skin
 * node + inverse-binds) and Draco are follow-ups — the import path already
 * reduces 4→1 dominant weights, so a faithful skin round-trip is bounded there.
 *
 * @package @holoscript/cli/importers
 */
import type { SkinnedMeshData } from '@holoscript/engine';
import { holoShapeToMesh } from './mesh-shape';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

/** Compile a mesh's geometry to a glTF 2.0 .glb (single mesh, single primitive). */
export function meshToGlb(mesh: SkinnedMeshData): ArrayBuffer {
  const n = mesh.vertexCount;
  const hasUv = !!mesh.uvs && mesh.uvs.length === n * 2;

  // ── BIN: one bufferView per attribute. All f32/u32, so every region is
  //    4-byte aligned and no inter-region padding is needed. ──
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
    { bufferView: posView, componentType: 5126, count: n, type: 'VEC3', min, max },
    { bufferView: nrmView, componentType: 5126, count: n, type: 'VEC3' },
  ];
  const attributes: Record<string, number> = { POSITION: 0, NORMAL: 1 };
  if (hasUv) {
    attributes.TEXCOORD_0 = accessors.length;
    accessors.push({ bufferView: uvView, componentType: 5126, count: n, type: 'VEC2' });
  }
  const idxAccessor = accessors.length;
  accessors.push({
    bufferView: idxView,
    componentType: 5125, // UNSIGNED_INT
    count: mesh.indices.length,
    type: 'SCALAR',
  });

  const json = {
    asset: { version: '2.0', generator: 'HoloScript meshToGlb (Track-0)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes, indices: idxAccessor, mode: 4 }] }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: off }],
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

/** Compile a parsed `.holo` `shape … mesh { … }` block to a .glb. */
export function compileMeshShapeToGlb(shape: {
  properties: ReadonlyArray<{ key: string; value: unknown }>;
}): ArrayBuffer {
  return meshToGlb(holoShapeToMesh(shape));
}
