/**
 * AgentAvatarMorph — deterministic native facial channels for the procedural character mesh.
 *
 * This is deliberately a small, falsifiable FACS/viseme substrate rather than a claim that the
 * segmented procedural head has production facial topology. It deforms real head/eye vertices
 * for a stable initial set (blink, AU12 smile, AU26 jaw-open, and aa/ee/oh visemes), emits a
 * replay digest, and reports unsupported authored targets instead of silently pretending.
 *
 * @module character-render
 */

import { HUMANOID_BONE_NAMES } from '../character/HumanoidSkeleton';

const HEAD_INDEX = HUMANOID_BONE_NAMES.indexOf('head');
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const NATIVE_FACIAL_MORPH_TARGETS = [
  'blink_left',
  'blink_right',
  'brow_raise_left',
  'brow_raise_right',
  'smile',
  'jaw_open',
  'viseme_aa',
  'viseme_ee',
  'viseme_oh',
] as const;

export type NativeFacialMorphTarget = (typeof NATIVE_FACIAL_MORPH_TARGETS)[number];
export type NativeMorphWeights = Readonly<Record<string, number>>;
export type NativeFacialTopology = 'procedural-head-v1' | 'neutral-anatomical-v2';
export type NativeMorphNormalPolicy = 'legacy-static-v1' | 'recompute-affected-v1';

export interface NativeFacialMorphGeometry {
  bodyVertexRange: { vertexStart: number; vertexCount: number };
  eyeVertexRange: { vertexStart: number; vertexCount: number };
  /** Optional native eyelid-shell range; V2 blink closes the authored lid topology as well as the globe. */
  orbitalVertexRange?: { vertexStart: number; vertexCount: number };
  topology?: NativeFacialTopology;
  /** Neutral normals used as the deterministic reset state for opt-in expression recomputation. */
  baseNormals?: Float32Array;
  /** Full native mesh index buffer used to find triangles adjacent to deformed vertices. */
  indices?: Uint32Array;
  /** Legacy keeps serialized normals byte-identical; H3X recomputes only the affected neighborhood. */
  normalPolicy?: NativeMorphNormalPolicy;
}

export interface NativeMorphReceipt {
  schemaVersion:
    | 'holoscript.native-facial-morph.v1'
    | 'holoscript.native-facial-morph.v2'
    | 'holoscript.native-facial-morph.v3';
  topology: NativeFacialTopology;
  appliedTargets: Array<{ target: NativeFacialMorphTarget; weight: number }>;
  ignoredTargets: string[];
  changedVertexCount: number;
  positionDigest: string;
  normalsRecomputed: boolean;
  /** Present only for the opt-in H3X expression-normal path. */
  normalPolicy?: 'recompute-affected-v1';
  /** Vertices whose complete one-ring normal was recomputed. */
  normalAffectedVertexCount?: number;
  /** Recomputed normals whose final value differs from the neutral normal. */
  normalChangedVertexCount?: number;
  /** Triangles traversed to rebuild the affected one-ring normals. */
  normalTriangleCount?: number;
  /** Deterministic digest of the full emitted normal buffer. */
  normalDigest?: string;
}

export interface NativeMorphResult {
  positions: Float32Array<ArrayBuffer>;
  /** Present only when the source opts into expression-time normal recomputation. */
  normals?: Float32Array<ArrayBuffer>;
  receipt: NativeMorphReceipt;
}

const TARGET_ALIASES: Readonly<Record<string, readonly NativeFacialMorphTarget[]>> = {
  blink: ['blink_left', 'blink_right'],
  eyeblink: ['blink_left', 'blink_right'],
  au45: ['blink_left', 'blink_right'],
  blinkleft: ['blink_left'],
  eyeblinkleft: ['blink_left'],
  au45l: ['blink_left'],
  blinkright: ['blink_right'],
  eyeblinkright: ['blink_right'],
  au45r: ['blink_right'],
  browraise: ['brow_raise_left', 'brow_raise_right'],
  browraiser: ['brow_raise_left', 'brow_raise_right'],
  innerbrowraiser: ['brow_raise_left', 'brow_raise_right'],
  au1: ['brow_raise_left', 'brow_raise_right'],
  browraiseleft: ['brow_raise_left'],
  browraiserleft: ['brow_raise_left'],
  au1l: ['brow_raise_left'],
  browraiseright: ['brow_raise_right'],
  browraiserright: ['brow_raise_right'],
  au1r: ['brow_raise_right'],
  smile: ['smile'],
  mouthsmile: ['smile'],
  lipcornerpuller: ['smile'],
  au12: ['smile'],
  jawopen: ['jaw_open'],
  jawdrop: ['jaw_open'],
  mouthopen: ['jaw_open'],
  au26: ['jaw_open'],
  aa: ['viseme_aa'],
  visemeaa: ['viseme_aa'],
  ee: ['viseme_ee'],
  visemeee: ['viseme_ee'],
  oh: ['viseme_oh'],
  visemeoh: ['viseme_oh'],
};

function normalizedTargetName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function digestFloat32(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function changed(
  output: Float32Array,
  vertexIndex: number,
  x: number,
  y: number,
  z: number
): boolean {
  const p = vertexIndex * 3;
  const didChange = output[p] !== x || output[p + 1] !== y || output[p + 2] !== z;
  output[p] = x;
  output[p + 1] = y;
  output[p + 2] = z;
  return didChange;
}

interface RecomputedNormalResult {
  normals: Float32Array<ArrayBuffer>;
  affectedVertexCount: number;
  changedVertexCount: number;
  triangleCount: number;
  digest: string;
}

/**
 * Recompute complete one-ring normals around deformed vertices.
 *
 * The two-pass adjacency expansion avoids rewriting the untouched mesh and still includes every
 * triangle contributing to an affected vertex. Face normals remain area weighted until the final
 * normalization, which is deterministic for identical positions and indices.
 */
function recomputeAffectedNormals(
  positions: Float32Array,
  baseNormals: Float32Array,
  indices: Uint32Array,
  changedVertices: ReadonlySet<number>
): RecomputedNormalResult {
  if (baseNormals.length !== positions.length) {
    throw new Error('Expression normal recomputation requires one XYZ normal per vertex');
  }
  const vertexCount = positions.length / 3;
  const affected = new Uint8Array(vertexCount);
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    if (changedVertices.has(a) || changedVertices.has(b) || changedVertices.has(c)) {
      affected[a] = 1;
      affected[b] = 1;
      affected[c] = 1;
    }
  }

  const accumulated = new Float64Array(positions.length);
  let triangleCount = 0;
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    if (affected[a] === 0 && affected[b] === 0 && affected[c] === 0) continue;
    triangleCount++;
    const ap = a * 3;
    const bp = b * 3;
    const cp = c * 3;
    const abx = positions[bp] - positions[ap];
    const aby = positions[bp + 1] - positions[ap + 1];
    const abz = positions[bp + 2] - positions[ap + 2];
    const acx = positions[cp] - positions[ap];
    const acy = positions[cp + 1] - positions[ap + 1];
    const acz = positions[cp + 2] - positions[ap + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const vertex of [a, b, c]) {
      if (affected[vertex] === 0) continue;
      const p = vertex * 3;
      accumulated[p] += nx;
      accumulated[p + 1] += ny;
      accumulated[p + 2] += nz;
    }
  }

  const normals = new Float32Array(baseNormals);
  let affectedVertexCount = 0;
  let changedVertexCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (affected[vertex] === 0) continue;
    affectedVertexCount++;
    const p = vertex * 3;
    const length = Math.hypot(accumulated[p], accumulated[p + 1], accumulated[p + 2]);
    if (length <= 1e-12) continue;
    let x = accumulated[p] / length;
    let y = accumulated[p + 1] / length;
    let z = accumulated[p + 2] / length;
    const neutralDot =
      x * baseNormals[p] + y * baseNormals[p + 1] + z * baseNormals[p + 2];
    if (neutralDot < 0) {
      x = -x;
      y = -y;
      z = -z;
    }
    if (normals[p] !== x || normals[p + 1] !== y || normals[p + 2] !== z) {
      changedVertexCount++;
    }
    normals[p] = x;
    normals[p + 1] = y;
    normals[p + 2] = z;
  }

  return {
    normals,
    affectedVertexCount,
    changedVertexCount,
    triangleCount,
    digest: digestFloat32(normals),
  };
}

/**
 * Apply supported facial weights to a fresh copy of `basePositions`.
 *
 * Repeated calls with the same base positions and weights are byte deterministic. Unknown target
 * names remain in `ignoredTargets`; callers use that list for honest mapped/stubbed reporting.
 */
export function applyNativeFacialMorph(
  basePositions: Float32Array,
  jointIndices: Uint32Array,
  geometry: NativeFacialMorphGeometry,
  authoredWeights: NativeMorphWeights
): NativeMorphResult {
  const output = new Float32Array(basePositions);
  const channelWeights = new Map<NativeFacialMorphTarget, number>();
  const ignoredTargets: string[] = [];
  const changedVertices = new Set<number>();
  const writeChanged = (
    vertexIndex: number,
    x: number,
    y: number,
    z: number
  ): boolean => {
    const didChange = changed(output, vertexIndex, x, y, z);
    if (didChange) changedVertices.add(vertexIndex);
    return didChange;
  };

  for (const [authoredTarget, authoredWeight] of Object.entries(authoredWeights).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const channels = TARGET_ALIASES[normalizedTargetName(authoredTarget)];
    if (!channels || !Number.isFinite(authoredWeight)) {
      ignoredTargets.push(authoredTarget);
      continue;
    }
    const weight = clamp01(authoredWeight);
    for (const channel of channels) {
      channelWeights.set(channel, clamp01((channelWeights.get(channel) ?? 0) + weight));
    }
  }

  const appliedTargets = NATIVE_FACIAL_MORPH_TARGETS.filter((target) =>
    channelWeights.has(target)
  ).map((target) => ({ target, weight: channelWeights.get(target) ?? 0 }));

  const headVertices: number[] = [];
  const bodyEnd = geometry.bodyVertexRange.vertexStart + geometry.bodyVertexRange.vertexCount;
  for (let vertex = geometry.bodyVertexRange.vertexStart; vertex < bodyEnd; vertex++) {
    if (jointIndices[vertex] === HEAD_INDEX) headVertices.push(vertex);
  }

  let changedVertexCount = 0;
  if (headVertices.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const vertex of headVertices) {
      const p = vertex * 3;
      minX = Math.min(minX, basePositions[p]);
      minY = Math.min(minY, basePositions[p + 1]);
      minZ = Math.min(minZ, basePositions[p + 2]);
      maxX = Math.max(maxX, basePositions[p]);
      maxY = Math.max(maxY, basePositions[p + 1]);
      maxZ = Math.max(maxZ, basePositions[p + 2]);
    }
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const halfX = Math.max((maxX - minX) * 0.5, 0.0001);
    const halfY = Math.max((maxY - minY) * 0.5, 0.0001);
    const halfZ = Math.max((maxZ - minZ) * 0.5, 0.0001);
    const scale = Math.max(halfX, halfY, halfZ);
    const smile =
      (channelWeights.get('smile') ?? 0) + (channelWeights.get('viseme_ee') ?? 0) * 0.45;
    const jaw =
      (channelWeights.get('jaw_open') ?? 0) +
      (channelWeights.get('viseme_aa') ?? 0) * 0.75 +
      (channelWeights.get('viseme_oh') ?? 0) * 0.35;
    const round = channelWeights.get('viseme_oh') ?? 0;
    const leftBrowRaise = channelWeights.get('brow_raise_left') ?? 0;
    const rightBrowRaise = channelWeights.get('brow_raise_right') ?? 0;

    for (const vertex of headVertices) {
      const p = vertex * 3;
      const x = basePositions[p];
      const y = basePositions[p + 1];
      const z = basePositions[p + 2];
      const nx = (x - centerX) / halfX;
      const ny = (y - centerY) / halfY;
      const lower = clamp01((centerY - y) / halfY);
      const front = clamp01((z - centerZ) / halfZ);
      const corner = Math.abs(nx);
      const influence = lower * front;
      const dx = Math.sign(nx || 1) * scale * influence * (smile * 0.12 * corner - round * 0.15);
      const browSideWeight = nx >= 0 ? leftBrowRaise : rightBrowRaise;
      const browBand = Math.exp(-Math.pow((ny - 0.2) / 0.19, 2)) * front;
      const dy =
        scale *
        (influence * (smile * 0.18 * (0.35 + corner * 0.65) - jaw * 0.3) +
          browBand * browSideWeight * 0.12);
      const dz = scale * influence * (jaw * 0.06 + round * 0.14);
      if (writeChanged(vertex, x + dx, y + dy, z + dz)) changedVertexCount++;
    }
  }

  const eyeStart = geometry.eyeVertexRange.vertexStart;
  const eyeCount = geometry.eyeVertexRange.vertexCount;
  const perEyeCount = Math.floor(eyeCount / 2);
  const blinkWeights = [
    channelWeights.get('blink_left') ?? 0,
    channelWeights.get('blink_right') ?? 0,
  ];
  for (let eye = 0; eye < 2; eye++) {
    const count = eye === 0 ? perEyeCount : eyeCount - perEyeCount;
    const start = eyeStart + eye * perEyeCount;
    if (count <= 0 || blinkWeights[eye] <= 0) continue;
    let centerY = 0;
    for (let i = 0; i < count; i++) centerY += basePositions[(start + i) * 3 + 1];
    centerY /= count;
    const verticalScale = 1 - blinkWeights[eye] * 0.88;
    for (let i = 0; i < count; i++) {
      const vertex = start + i;
      const p = vertex * 3;
      const x = basePositions[p];
      const y = centerY + (basePositions[p + 1] - centerY) * verticalScale;
      const z = basePositions[p + 2];
      if (writeChanged(vertex, x, y, z)) changedVertexCount++;
    }
  }

  const orbital = geometry.orbitalVertexRange;
  if (orbital && orbital.vertexCount > 0) {
    const perSideCount = Math.floor(orbital.vertexCount / 2);
    for (let side = 0; side < 2; side++) {
      const count = side === 0 ? perSideCount : orbital.vertexCount - perSideCount;
      const start = orbital.vertexStart + side * perSideCount;
      const blink = blinkWeights[side];
      if (count <= 0 || blink <= 0) continue;
      let centerY = 0;
      for (let index = 0; index < count; index++) centerY += output[(start + index) * 3 + 1];
      centerY /= count;
      const verticalScale = 1 - blink * 0.94;
      for (let index = 0; index < count; index++) {
        const vertex = start + index;
        const p = vertex * 3;
        const x = output[p];
        const y = centerY + (output[p + 1] - centerY) * verticalScale;
        const z = output[p + 2];
        if (writeChanged(vertex, x, y, z)) changedVertexCount++;
      }
    }
  }

  const normalPolicy = geometry.normalPolicy ?? 'legacy-static-v1';
  const recomputed =
    normalPolicy === 'recompute-affected-v1'
      ? recomputeAffectedNormals(
          output,
          geometry.baseNormals ??
            (() => {
              throw new Error(
                'recompute-affected-v1 requires NativeFacialMorphGeometry.baseNormals'
              );
            })(),
          geometry.indices ??
            (() => {
              throw new Error('recompute-affected-v1 requires NativeFacialMorphGeometry.indices');
            })(),
          changedVertices
        )
      : undefined;

  return {
    positions: output,
    ...(recomputed ? { normals: recomputed.normals } : {}),
    receipt: {
      schemaVersion:
        recomputed
          ? 'holoscript.native-facial-morph.v3'
          : orbital ||
              channelWeights.has('brow_raise_left') ||
              channelWeights.has('brow_raise_right')
            ? 'holoscript.native-facial-morph.v2'
            : 'holoscript.native-facial-morph.v1',
      topology: geometry.topology ?? 'procedural-head-v1',
      appliedTargets,
      ignoredTargets: [...new Set(ignoredTargets)].sort(),
      changedVertexCount,
      positionDigest: digestFloat32(output),
      normalsRecomputed: Boolean(recomputed),
      ...(recomputed
        ? {
            normalPolicy: 'recompute-affected-v1' as const,
            normalAffectedVertexCount: recomputed.affectedVertexCount,
            normalChangedVertexCount: recomputed.changedVertexCount,
            normalTriangleCount: recomputed.triangleCount,
            normalDigest: recomputed.digest,
          }
        : {}),
    },
  };
}
