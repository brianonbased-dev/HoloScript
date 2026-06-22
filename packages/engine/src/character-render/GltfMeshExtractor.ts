/**
 * GltfMeshExtractor — native (Three.js-free) .glb → SkinnedMeshData extractor.
 *
 * The opt-in photoreal body source: parses a binary glTF (.glb), pulls the first skinned
 * primitive's POSITION/NORMAL/JOINTS_0/WEIGHTS_0/indices (+ TANGENT or a placeholder), and
 * remaps the rig's joints onto the canonical HoloScript palette via SkeletonStandardRegistry
 * so it feeds the SAME CharacterHost/renderCharacter path as the procedural body. The WGSL
 * shader is single-influence, so the 4-bone glTF skin is reduced to the dominant joint
 * (argmax weight, weight forced to 1.0) — matching the rigid procedural body's contract.
 *
 * Pure data, zero GPU, zero Three.js → headless CI-testable. The procedural AgentAvatarMesh
 * stays the always-works default; this is the fidelity upgrade when a real GLB is supplied.
 *
 * Scope (documented limits): first skinned primitive only; no Draco/meshopt decode (fail
 * loud); no external/uri buffers; no sparse accessors. A full multi-primitive importer is a
 * later upgrade.
 *
 * @module character-render
 */

import type { SkinnedMeshData } from '../native-render/draw-spec';
import { BONE_ORDER, JOINT_COUNT } from './AgentAvatarMesh';
import {
  matchSkeletonStandard,
  resolveProfileBone,
  type SkeletonStandardId,
} from '../character/SkeletonStandardRegistry';
import type { HumanoidBoneName } from '../character/HumanoidSkeleton';
import { IDENTITY4 } from './skin-math';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

/** glTF componentType → bytes-per-element. */
const CT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
/** glTF accessor type → component count. */
const NUM_COMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// Minimal structural glTF JSON shapes (only what we read).
interface GltfJson {
  meshes?: Array<{ primitives: GltfPrimitive[] }>;
  accessors?: GltfAccessor[];
  bufferViews?: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
  buffers?: Array<{ uri?: string; byteLength: number }>;
  nodes?: Array<{ name?: string; mesh?: number; skin?: number }>;
  skins?: Array<{ joints: number[]; inverseBindMatrices?: number }>;
}
interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  mode?: number;
  extensions?: Record<string, unknown>;
}
interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  normalized?: boolean;
  sparse?: unknown;
}

export interface GltfSkinnedMesh extends SkinnedMeshData {
  jointCount: number;
  boneOrder: readonly string[];
  /** Inverse-bind matrices re-indexed into palette order (JOINT_COUNT × 16), identity for unmapped. */
  inverseBindMatrices: Float32Array<ArrayBuffer>;
  skeletonStandard: SkeletonStandardId;
  unmappedJoints: string[];
}

/** Parse a .glb container into its JSON + BIN chunks. */
export function parseGlb(glb: ArrayBuffer): { json: GltfJson; bin: Uint8Array } {
  const dv = new DataView(glb);
  if (glb.byteLength < 12 || dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a .glb (bad magic)');
  if (dv.getUint32(4, true) !== 2) throw new Error('only glTF 2.0 .glb is supported');
  const total = Math.min(dv.getUint32(8, true), glb.byteLength);
  let off = 12;
  let json: GltfJson | undefined;
  let bin: Uint8Array | undefined;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > total) break; // guard truncated chunk
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, start, len))) as GltfJson;
    else if (type === CHUNK_BIN) bin = new Uint8Array(glb, start, len);
    off = start + len;
  }
  if (!json) throw new Error('.glb missing JSON chunk');
  return { json, bin: bin ?? new Uint8Array(0) };
}

/** Read one accessor into a flat numeric array, honoring byteStride + normalized integers. */
function readAccessor(g: GltfJson, bin: Uint8Array, idx: number): { array: number[]; comps: number; count: number } {
  const acc = g.accessors![idx];
  if (acc.sparse) throw new Error('sparse accessors not supported');
  const comps = NUM_COMP[acc.type];
  if (!comps) throw new Error(`unknown accessor type ${acc.type}`);
  const bv = g.bufferViews![acc.bufferView];
  if (g.buffers?.[bv.buffer]?.uri) throw new Error('external/uri buffer not supported in .glb');
  const elemBytes = CT_BYTES[acc.componentType];
  if (!elemBytes) throw new Error(`bad componentType ${acc.componentType}`);
  const baseOff = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = bv.byteStride ?? comps * elemBytes;
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out: number[] = new Array(acc.count * comps);
  for (let e = 0; e < acc.count; e++) {
    for (let c = 0; c < comps; c++) {
      const at = baseOff + e * stride + c * elemBytes;
      out[e * comps + c] = readScalar(dv, at, acc.componentType, acc.normalized);
    }
  }
  return { array: out, comps, count: acc.count };
}

function readScalar(dv: DataView, at: number, ct: number, normalized?: boolean): number {
  switch (ct) {
    case 5126:
      return dv.getFloat32(at, true);
    case 5125:
      return dv.getUint32(at, true);
    case 5123: {
      const v = dv.getUint16(at, true);
      return normalized ? v / 65535 : v;
    }
    case 5121: {
      const v = dv.getUint8(at);
      return normalized ? v / 255 : v;
    }
    case 5122:
      return dv.getInt16(at, true);
    case 5120:
      return dv.getInt8(at);
    default:
      throw new Error(`bad componentType ${ct}`);
  }
}

/**
 * Extract the first skinned primitive of a .glb into a palette-remapped SkinnedMeshData.
 */
export function extractGltfSkinnedMesh(glb: ArrayBuffer): GltfSkinnedMesh {
  const { json: g, bin } = parseGlb(glb);

  // 1) Find the first skinned primitive + its bound skin.
  let prim: GltfPrimitive | undefined;
  let meshIndex = -1;
  for (let mi = 0; mi < (g.meshes?.length ?? 0); mi++) {
    for (const p of g.meshes![mi].primitives) {
      if (p.extensions?.KHR_draco_mesh_compression || p.extensions?.EXT_meshopt_compression)
        throw new Error('compressed primitive (Draco/meshopt) not supported by the native extractor');
      if (p.attributes?.JOINTS_0 !== undefined && p.attributes?.WEIGHTS_0 !== undefined) {
        prim = p;
        meshIndex = mi;
        break;
      }
    }
    if (prim) break;
  }
  if (!prim) throw new Error('no skinned primitive (JOINTS_0/WEIGHTS_0) found');
  if (prim.mode !== undefined && prim.mode !== 4) throw new Error('only triangle primitives (mode 4) supported');
  const node = g.nodes?.find((n) => n.mesh === meshIndex && n.skin !== undefined);
  const skin = g.skins![node?.skin ?? 0];

  // 2) Vertex attributes.
  const posR = readAccessor(g, bin, prim.attributes.POSITION);
  const vertexCount = posR.count;
  const positions = new Float32Array(posR.array);
  const normals =
    prim.attributes.NORMAL !== undefined
      ? new Float32Array(readAccessor(g, bin, prim.attributes.NORMAL).array)
      : (() => {
          const n = new Float32Array(vertexCount * 3);
          for (let v = 0; v < vertexCount; v++) n[v * 3 + 1] = 1; // default up
          return n;
        })();
  const j4 = readAccessor(g, bin, prim.attributes.JOINTS_0).array; // 4 slots/vert
  const w4 = readAccessor(g, bin, prim.attributes.WEIGHTS_0).array; // 4 weights/vert
  const idxR = prim.indices !== undefined ? readAccessor(g, bin, prim.indices).array : undefined;
  const indices = new Uint32Array(idxR ? idxR : Array.from({ length: vertexCount }, (_, i) => i));
  const tangents = new Float32Array(vertexCount * 4);
  if (prim.attributes.TANGENT !== undefined) {
    tangents.set(readAccessor(g, bin, prim.attributes.TANGENT).array);
  } else {
    for (let v = 0; v < vertexCount; v++) tangents[v * 4 + 1] = 1; // body placeholder (0,1,0,0)
  }

  // 3) glTF joint slot → canonical palette index (via the matched skeleton standard).
  const jointNames: string[] = skin.joints.map((nodeIdx) => g.nodes?.[nodeIdx]?.name ?? '');
  const standard: SkeletonStandardId = matchSkeletonStandard(jointNames)[0]?.standard ?? 'holoscript_65';
  const nameToSlot = new Map<string, number>(jointNames.map((n, s) => [n, s]));
  const remap = new Int32Array(skin.joints.length).fill(-1);
  for (let i = 0; i < JOINT_COUNT; i++) {
    const platform = resolveProfileBone(standard, BONE_ORDER[i] as HumanoidBoneName);
    const slot = platform !== undefined ? nameToSlot.get(platform) : undefined;
    if (slot !== undefined) remap[slot] = i;
  }
  const unmapped: string[] = [];
  jointNames.forEach((n, s) => {
    if (remap[s] < 0) unmapped.push(n);
  });

  // 4) Inverse-bind matrices re-indexed to palette order (glTF is column-major; copy verbatim).
  const inverseBindMatrices = new Float32Array(JOINT_COUNT * 16);
  for (let i = 0; i < JOINT_COUNT; i++) inverseBindMatrices.set(IDENTITY4(), i * 16);
  if (skin.inverseBindMatrices !== undefined) {
    const ibm = readAccessor(g, bin, skin.inverseBindMatrices).array;
    for (let s = 0; s < skin.joints.length; s++) {
      const c = remap[s];
      if (c < 0) continue;
      for (let k = 0; k < 16; k++) inverseBindMatrices[c * 16 + k] = ibm[s * 16 + k];
    }
  }

  // 5) 4-influence → single dominant influence (shader is single-bone).
  const jointIndices = new Uint32Array(vertexCount);
  const jointWeights = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    let bestW = -1;
    let bestCanon = -1;
    for (let k = 0; k < 4; k++) {
      const w = w4[v * 4 + k];
      const canon = remap[j4[v * 4 + k]];
      if (canon >= 0 && w > bestW) {
        bestW = w;
        bestCanon = canon;
      }
    }
    jointIndices[v] = bestCanon >= 0 ? bestCanon : 0; // fallback: root
    jointWeights[v] = 1.0; // rigid, matches AgentAvatarMesh
  }

  return {
    positions,
    normals,
    tangents,
    indices,
    jointIndices,
    jointWeights,
    vertexCount,
    jointCount: JOINT_COUNT,
    boneOrder: BONE_ORDER,
    inverseBindMatrices,
    skeletonStandard: standard,
    unmappedJoints: unmapped,
  };
}
