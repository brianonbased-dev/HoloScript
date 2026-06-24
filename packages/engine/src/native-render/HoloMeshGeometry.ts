/**
 * `.holo` mesh-geometry codec — the SERIALIZATION half of Track 0.
 *
 * The in-memory mesh IR ({@link SkinnedMeshData}, draw-spec.ts) already exists and
 * `extractGltfSkinnedMesh` produces it from a real GLB — but a `.holo` file still
 * can only point at external geometry (`gltf-importer.ts` emits
 * `geometry: "file#Node"`). This codec lets a `.holo` composition CARRY the real
 * mesh: it serializes a `SkinnedMeshData` to/from a compact base64 block so the
 * surface survives a round-trip (import → `.holo` → parse → compile) byte-exact,
 * instead of degrading to a text pointer.
 *
 * Buffers are base64 over the raw little-endian bytes (the same convention as
 * `HolomapPointCloudPayload`). Encoding is symmetric, so the round-trip is
 * byte-exact on any single runtime. Web-safe (btoa/atob, no Node `Buffer`) —
 * engine renders in-browser.
 *
 * @package @holoscript/engine/native-render
 */
import type { SkinnedMeshData } from './draw-spec';

/**
 * A real imported triangle mesh, embeddable in `.holo` text. Positions/normals/
 * tangents/uvs are Float32; indices/jointIndices are Uint32; all base64 LE.
 */
export interface HoloMeshGeometry {
  /** base64 LE Float32, 3 floats/vertex. */
  positionsB64: string;
  /** base64 LE Float32, 3 floats/vertex. */
  normalsB64: string;
  /** base64 LE Float32, 4 floats/vertex (Kajiya-Kay strand tangent + strandT). */
  tangentsB64: string;
  /** base64 LE Float32, 2 floats/vertex (glTF TEXCOORD_0). Omitted when the source has no UVs. */
  uvsB64?: string;
  /** base64 LE Uint32 triangle indices. */
  indicesB64: string;
  /** base64 LE Uint32, 4 palette joint indices/vertex. */
  jointIndicesB64: string;
  /** base64 LE Float32, 4 skin weights/vertex. */
  jointWeightsB64: string;
  /** base64 LE Float32, `jointCount` × 16 column-major inverse-bind matrices. Carries the RIG
   *  so a carried mesh can be re-emitted WITH a glTF skin (joints + JOINTS_0/WEIGHTS_0 + IBM);
   *  omitted for an unskinned mesh, in which case export degrades to geometry-only. */
  inverseBindMatricesB64?: string;
  /** Palette joint count the inverse-binds + joint indices index into (present iff IBM is). */
  jointCount?: number;
  vertexCount: number;
}

/**
 * A decoded mesh plus — when the `.holo` block carried a rig — the inverse-bind matrices and
 * palette joint count needed to re-emit a glTF skin. The base {@link SkinnedMeshData} has no
 * rig fields, so the exporter reads these to decide skin-vs-geometry-only re-emit.
 */
export interface DecodedHoloMesh extends SkinnedMeshData {
  inverseBindMatrices?: Float32Array<ArrayBuffer>;
  jointCount?: number;
}

// ─── base64 <-> bytes (web-safe; no Node Buffer) ──────────────────────────────

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000; // keep String.fromCharCode arg-spread under engine limits
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Decode base64 into a FRESH, exactly-sized ArrayBuffer (zero-offset). Typed as
 *  `ArrayBuffer` — not `ArrayBufferLike` — so the views below satisfy
 *  SkinnedMeshData's `Float32Array<ArrayBuffer>` fields. */
function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const ab = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(ab);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return ab;
}

function f32ToB64(a: Float32Array): string {
  return bytesToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}
function u32ToB64(a: Uint32Array): string {
  return bytesToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}
function b64ToF32(b64: string): Float32Array<ArrayBuffer> {
  const ab = b64ToArrayBuffer(b64);
  return new Float32Array(ab, 0, ab.byteLength / 4);
}
function b64ToU32(b64: string): Uint32Array<ArrayBuffer> {
  const ab = b64ToArrayBuffer(b64);
  return new Uint32Array(ab, 0, ab.byteLength / 4);
}

// ─── codec ────────────────────────────────────────────────────────────────────

/**
 * Serialize an in-memory mesh to a `.holo`-carriable block. Accepts the base
 * {@link SkinnedMeshData} and, optionally, the rig ({@link GltfSkinnedMesh} satisfies this) —
 * when `inverseBindMatrices` + `jointCount` are present they are carried so the mesh can later
 * be re-emitted WITH a glTF skin instead of degrading to geometry-only.
 */
export function encodeSkinnedMeshToHolo(
  mesh: SkinnedMeshData & { inverseBindMatrices?: Float32Array; jointCount?: number }
): HoloMeshGeometry {
  const carryRig = !!mesh.inverseBindMatrices && mesh.jointCount !== undefined;
  return {
    positionsB64: f32ToB64(mesh.positions),
    normalsB64: f32ToB64(mesh.normals),
    tangentsB64: f32ToB64(mesh.tangents),
    ...(mesh.uvs ? { uvsB64: f32ToB64(mesh.uvs) } : {}),
    indicesB64: u32ToB64(mesh.indices),
    jointIndicesB64: u32ToB64(mesh.jointIndices),
    jointWeightsB64: f32ToB64(mesh.jointWeights),
    ...(carryRig
      ? {
          inverseBindMatricesB64: f32ToB64(
            // Float32Array (any backing buffer) → bytes; symmetric with b64ToF32 on decode.
            new Float32Array(mesh.inverseBindMatrices!)
          ),
          jointCount: mesh.jointCount,
        }
      : {}),
    vertexCount: mesh.vertexCount,
  };
}

/** Decode a `.holo` mesh block back to an in-memory mesh, surfacing the rig when carried. */
export function decodeSkinnedMeshFromHolo(geo: HoloMeshGeometry): DecodedHoloMesh {
  return {
    positions: b64ToF32(geo.positionsB64),
    normals: b64ToF32(geo.normalsB64),
    tangents: b64ToF32(geo.tangentsB64),
    ...(geo.uvsB64 ? { uvs: b64ToF32(geo.uvsB64) } : {}),
    indices: b64ToU32(geo.indicesB64),
    jointIndices: b64ToU32(geo.jointIndicesB64),
    jointWeights: b64ToF32(geo.jointWeightsB64),
    ...(geo.inverseBindMatricesB64 && geo.jointCount !== undefined
      ? { inverseBindMatrices: b64ToF32(geo.inverseBindMatricesB64), jointCount: geo.jointCount }
      : {}),
    vertexCount: geo.vertexCount,
  };
}
