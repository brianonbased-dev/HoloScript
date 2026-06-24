/**
 * GltfMeshExtractor — native (Three.js-free) .glb → SkinnedMeshData extractor.
 *
 * The opt-in photoreal body source: parses a binary glTF (.glb), pulls the first skinned
 * primitive's POSITION/NORMAL/JOINTS_0/WEIGHTS_0/indices (+ TANGENT or a placeholder, +
 * TEXCOORD_0 UVs and the bound material's PBR texture maps as encoded bytes when present), and
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

import type { SkinnedMeshData, MaterialTextureMaps, TextureRef } from '../native-render/draw-spec';
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
  materials?: GltfMaterial[];
  textures?: Array<{ source?: number }>;
  images?: Array<{ bufferView?: number; mimeType?: string; uri?: string }>;
}
interface GltfTextureInfo {
  index: number;
}
interface GltfMaterial {
  pbrMetallicRoughness?: {
    baseColorTexture?: GltfTextureInfo;
    metallicRoughnessTexture?: GltfTextureInfo;
  };
  normalTexture?: GltfTextureInfo;
  emissiveTexture?: GltfTextureInfo;
}
interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  mode?: number;
  material?: number;
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
  /** The bound material's PBR texture maps (encoded image bytes), when the primitive has a
   *  material with texture maps. Undefined for an un-textured / material-less primitive. */
  materialMaps?: MaterialTextureMaps;
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
 * Resolve a primitive's material PBR texture maps into pure-data TextureRefs (encoded image
 * bytes + mime, or external uri). Returns undefined when the primitive has no material or no
 * texture maps — the scalar-only path is unaffected. No image decoding: carries encoded bytes,
 * a later stage / the GPU backend decodes + uploads.
 */
function extractMaterialMaps(
  g: GltfJson,
  bin: Uint8Array,
  prim: GltfPrimitive
): MaterialTextureMaps | undefined {
  if (prim.material === undefined) return undefined;
  const mat = g.materials?.[prim.material];
  if (!mat) return undefined;
  const refOf = (info?: GltfTextureInfo): TextureRef | undefined => {
    if (!info) return undefined;
    const tex = g.textures?.[info.index];
    if (tex?.source === undefined) return undefined;
    const img = g.images?.[tex.source];
    if (!img) return undefined;
    if (img.uri) return { uri: img.uri };
    if (img.bufferView !== undefined) {
      const bv = g.bufferViews?.[img.bufferView];
      if (!bv) return undefined;
      const start = bv.byteOffset ?? 0;
      const bytes = new Uint8Array(bv.byteLength);
      bytes.set(bin.subarray(start, start + bv.byteLength));
      return img.mimeType ? { bytes, mimeType: img.mimeType } : { bytes };
    }
    return undefined;
  };
  const albedoMap = refOf(mat.pbrMetallicRoughness?.baseColorTexture);
  const normalMap = refOf(mat.normalTexture);
  const metalRoughMap = refOf(mat.pbrMetallicRoughness?.metallicRoughnessTexture);
  const emissiveMap = refOf(mat.emissiveTexture);
  if (!albedoMap && !normalMap && !metalRoughMap && !emissiveMap) return undefined;
  return {
    ...(albedoMap ? { albedoMap } : {}),
    ...(normalMap ? { normalMap } : {}),
    ...(metalRoughMap ? { metalRoughMap } : {}),
    ...(emissiveMap ? { emissiveMap } : {}),
  };
}

/** The scalar geometry an extractor reads from one primitive — shared by the
 *  skinned and static paths (the skinned one layers skin attributes on top). */
interface PrimitiveGeometry {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  tangents: Float32Array<ArrayBuffer>;
  uvs?: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  vertexCount: number;
  materialMaps?: MaterialTextureMaps;
}

/**
 * Read a primitive's POSITION/NORMAL/TANGENT/TEXCOORD_0/indices (+ bound PBR maps)
 * into typed arrays, synthesizing the glTF-optional fields: an up-normal (0,1,0)
 * when NORMAL is absent, a (0,1,0,0) placeholder tangent when TANGENT is absent,
 * and sequential indices when the primitive is non-indexed. Skin attributes are
 * NOT read here — the skinned extractor reads JOINTS_0/WEIGHTS_0 separately.
 */
function readPrimitiveGeometry(g: GltfJson, bin: Uint8Array, prim: GltfPrimitive): PrimitiveGeometry {
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
  const idxR = prim.indices !== undefined ? readAccessor(g, bin, prim.indices).array : undefined;
  const indices = new Uint32Array(idxR ? idxR : Array.from({ length: vertexCount }, (_, i) => i));
  const tangents = new Float32Array(vertexCount * 4);
  if (prim.attributes.TANGENT !== undefined) {
    tangents.set(readAccessor(g, bin, prim.attributes.TANGENT).array);
  } else {
    for (let v = 0; v < vertexCount; v++) tangents[v * 4 + 1] = 1; // body placeholder (0,1,0,0)
  }
  // TEXCOORD_0 UVs (2/vert) when the primitive carries them — undefined otherwise so the
  // procedural body (no UVs) and un-textured imports are unaffected. (Track 0 prerequisite.)
  const uvs =
    prim.attributes.TEXCOORD_0 !== undefined
      ? new Float32Array(readAccessor(g, bin, prim.attributes.TEXCOORD_0).array)
      : undefined;
  // The bound material's PBR texture maps (encoded bytes), when present. (Track 0 prerequisite.)
  const materialMaps = extractMaterialMaps(g, bin, prim);
  return {
    positions,
    normals,
    tangents,
    ...(uvs ? { uvs } : {}),
    indices,
    vertexCount,
    ...(materialMaps ? { materialMaps } : {}),
  };
}

/**
 * Merge several primitives' scalar geometry into one contiguous buffer set, offsetting each
 * primitive's indices into the merged vertex stream. UVs survive only when EVERY input carries
 * them (a mixed set drops UVs rather than emit garbage coordinates); the FIRST input's material
 * maps are carried (faithful per-primitive material GROUPS are a further layer — see
 * CharacterDrawSpec.materialGroups). A single-element merge returns that geometry unchanged.
 */
function mergePrimitiveGeometries(geoms: PrimitiveGeometry[]): PrimitiveGeometry {
  if (geoms.length === 1) return geoms[0];
  const totalV = geoms.reduce((s, x) => s + x.vertexCount, 0);
  const totalI = geoms.reduce((s, x) => s + x.indices.length, 0);
  const allHaveUv = geoms.every((x) => x.uvs);
  const positions = new Float32Array(totalV * 3);
  const normals = new Float32Array(totalV * 3);
  const tangents = new Float32Array(totalV * 4);
  const uvs = allHaveUv ? new Float32Array(totalV * 2) : undefined;
  const indices = new Uint32Array(totalI);
  let vBase = 0;
  let iBase = 0;
  for (const x of geoms) {
    positions.set(x.positions, vBase * 3);
    normals.set(x.normals, vBase * 3);
    tangents.set(x.tangents, vBase * 4);
    if (uvs && x.uvs) uvs.set(x.uvs, vBase * 2);
    for (let k = 0; k < x.indices.length; k++) indices[iBase + k] = x.indices[k] + vBase; // offset into merged stream
    vBase += x.vertexCount;
    iBase += x.indices.length;
  }
  const materialMaps = geoms[0].materialMaps;
  return {
    positions,
    normals,
    tangents,
    ...(uvs ? { uvs } : {}),
    indices,
    vertexCount: totalV,
    ...(materialMaps ? { materialMaps } : {}),
  };
}

/**
 * Extract the first skinned primitive of a .glb into a palette-remapped SkinnedMeshData.
 * When `onlyMeshIndex` is given, the search is restricted to that one glTF mesh —
 * the per-mesh entry point for the importer's multi-mesh carry.
 */
export function extractGltfSkinnedMesh(glb: ArrayBuffer, onlyMeshIndex?: number): GltfSkinnedMesh {
  const { json: g, bin } = parseGlb(glb);
  return skinnedMeshFromParsed(g, bin, onlyMeshIndex);
}

/** The post-parse core of {@link extractGltfSkinnedMesh}, over an already-parsed
 *  glTF — lets {@link extractGltfMeshes} carry every mesh from ONE container parse. */
function skinnedMeshFromParsed(g: GltfJson, bin: Uint8Array, onlyMeshIndex?: number): GltfSkinnedMesh {
  // 1) Find the first skinned primitive + its bound skin (within onlyMeshIndex, if given).
  let prim: GltfPrimitive | undefined;
  let meshIndex = -1;
  for (let mi = 0; mi < (g.meshes?.length ?? 0); mi++) {
    if (onlyMeshIndex !== undefined && mi !== onlyMeshIndex) continue;
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

  // 2) Vertex attributes — scalar geometry (shared with the static path) + skin.
  const { positions, normals, tangents, uvs, indices, vertexCount, materialMaps } =
    readPrimitiveGeometry(g, bin, prim);
  const j4 = readAccessor(g, bin, prim.attributes.JOINTS_0).array; // 4 slots/vert
  const w4 = readAccessor(g, bin, prim.attributes.WEIGHTS_0).array; // 4 weights/vert

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
    ...(uvs ? { uvs } : {}),
    ...(materialMaps ? { materialMaps } : {}),
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

/** A non-skinned mesh extracted with a rigid identity bind. Structurally a
 *  {@link GltfSkinnedMesh} so it flows through the same SkinnedMeshData / `.holo`
 *  mesh-shape pipeline — its "skin" is the no-deformation identity (joint 0,
 *  weight 1, identity inverse-binds). */
export type GltfStaticMesh = GltfSkinnedMesh;

/**
 * Extract a .glb as a STATIC mesh: real POSITION/NORMAL/TANGENT/TEXCOORD_0/indices (+ bound PBR
 * maps) carried with a rigid identity bind — every vertex rides palette root (joint 0) at weight
 * 1.0 with identity inverse-binds, i.e. undeformed at rest. This lets a NON-skinned GLB (the
 * majority of environment/object assets) carry its real surface through the exact same codec +
 * `.holo` `shape "<name>" mesh { … }` block as a skinned one, instead of degrading to an external
 * text pointer. The rigid root bind is the same form the skinned extractor emits for an unmapped
 * vertex (jointIndices=0, weight=1). Any JOINTS_0/WEIGHTS_0 on the primitives are ignored — call
 * {@link extractGltfSkinnedMesh} for those.
 *
 * MULTI-PRIMITIVE: ALL triangle primitives of the first mesh that has any are MERGED into one
 * geometry (multi-primitive props — split by material — are common). Non-triangle primitives are
 * skipped; the first primitive's PBR maps are carried (per-primitive material groups are a further
 * layer). Limits: no Draco/meshopt (decode at the CLI import boundary, `glb-decompress.ts`), no
 * sparse/external buffers, first mesh only.
 */
export function extractGltfStaticMesh(glb: ArrayBuffer, onlyMeshIndex?: number): GltfStaticMesh {
  const { json: g, bin } = parseGlb(glb);
  return staticMeshFromParsed(g, bin, onlyMeshIndex);
}

/** The post-parse core of {@link extractGltfStaticMesh}, over an already-parsed glTF. */
function staticMeshFromParsed(g: GltfJson, bin: Uint8Array, onlyMeshIndex?: number): GltfStaticMesh {
  // First mesh with >=1 triangle primitive carrying POSITION; merge all such primitives of it.
  // When `onlyMeshIndex` is given, restrict to that one glTF mesh (multi-mesh per-node import).
  let prims: GltfPrimitive[] | undefined;
  for (let mi = 0; mi < (g.meshes?.length ?? 0); mi++) {
    if (onlyMeshIndex !== undefined && mi !== onlyMeshIndex) continue;
    const tris: GltfPrimitive[] = [];
    for (const p of g.meshes![mi].primitives) {
      if (p.extensions?.KHR_draco_mesh_compression || p.extensions?.EXT_meshopt_compression)
        throw new Error('compressed primitive (Draco/meshopt) not supported by the native extractor');
      if (p.mode !== undefined && p.mode !== 4) continue; // non-triangle primitive: skip, don't merge
      if (p.attributes?.POSITION !== undefined) tris.push(p);
    }
    if (tris.length) {
      prims = tris;
      break;
    }
  }
  if (!prims || !prims.length) throw new Error('no triangle primitive with a POSITION attribute found');

  const { positions, normals, tangents, uvs, indices, vertexCount, materialMaps } =
    mergePrimitiveGeometries(prims.map((p) => readPrimitiveGeometry(g, bin, p)));

  // Rigid identity bind: no source skin → every vertex → palette root at weight
  // 1.0 with identity inverse-binds. Undeformed at rest; identical in form to the
  // skinned extractor's fallback for an unmapped vertex.
  const jointIndices = new Uint32Array(vertexCount); // all 0 (root)
  const jointWeights = new Float32Array(vertexCount).fill(1.0);
  const inverseBindMatrices = new Float32Array(JOINT_COUNT * 16);
  for (let i = 0; i < JOINT_COUNT; i++) inverseBindMatrices.set(IDENTITY4(), i * 16);

  return {
    positions,
    normals,
    tangents,
    ...(uvs ? { uvs } : {}),
    ...(materialMaps ? { materialMaps } : {}),
    indices,
    jointIndices,
    jointWeights,
    vertexCount,
    jointCount: JOINT_COUNT,
    boneOrder: BONE_ORDER,
    inverseBindMatrices,
    skeletonStandard: 'holoscript_65',
    unmappedJoints: [],
  };
}

/**
 * Carry EVERY mesh of a .glb in a SINGLE container parse. For each glTF mesh,
 * prefers the skinned core (palette-remapped skin) and falls back to the static
 * core (rigid identity bind); a mesh neither can read (Draco/meshopt that wasn't
 * decompressed, or no triangle POSITION primitive) is skipped, not thrown. Returns
 * one entry per carryable mesh, keyed by its glTF mesh index — the importer's
 * multi-mesh entry point (one parse, vs. re-parsing the container per mesh).
 */
export function extractGltfMeshes(glb: ArrayBuffer): Array<{ meshIndex: number; mesh: GltfSkinnedMesh }> {
  const { json: g, bin } = parseGlb(glb);
  const out: Array<{ meshIndex: number; mesh: GltfSkinnedMesh }> = [];
  for (let mi = 0; mi < (g.meshes?.length ?? 0); mi++) {
    let mesh: GltfSkinnedMesh | undefined;
    try {
      mesh = skinnedMeshFromParsed(g, bin, mi);
    } catch {
      try {
        mesh = staticMeshFromParsed(g, bin, mi);
      } catch {
        // Draco/meshopt or no extractable primitive — skip this mesh.
      }
    }
    if (mesh) out.push({ meshIndex: mi, mesh });
  }
  return out;
}
