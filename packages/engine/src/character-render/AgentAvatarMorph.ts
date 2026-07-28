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
  'smile',
  'jaw_open',
  'viseme_aa',
  'viseme_ee',
  'viseme_oh',
] as const;

export type NativeFacialMorphTarget = (typeof NATIVE_FACIAL_MORPH_TARGETS)[number];
export type NativeMorphWeights = Readonly<Record<string, number>>;

export interface NativeFacialMorphGeometry {
  bodyVertexRange: { vertexStart: number; vertexCount: number };
  eyeVertexRange: { vertexStart: number; vertexCount: number };
}

export interface NativeMorphReceipt {
  schemaVersion: 'holoscript.native-facial-morph.v1';
  topology: 'procedural-head-v1';
  appliedTargets: Array<{ target: NativeFacialMorphTarget; weight: number }>;
  ignoredTargets: string[];
  changedVertexCount: number;
  positionDigest: string;
  normalsRecomputed: false;
}

export interface NativeMorphResult {
  positions: Float32Array<ArrayBuffer>;
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

function digestPositions(positions: Float32Array): string {
  const bytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
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

    for (const vertex of headVertices) {
      const p = vertex * 3;
      const x = basePositions[p];
      const y = basePositions[p + 1];
      const z = basePositions[p + 2];
      const nx = (x - centerX) / halfX;
      const lower = clamp01((centerY - y) / halfY);
      const front = clamp01((z - centerZ) / halfZ);
      const corner = Math.abs(nx);
      const influence = lower * front;
      const dx = Math.sign(nx || 1) * scale * influence * (smile * 0.12 * corner - round * 0.15);
      const dy = scale * influence * (smile * 0.18 * (0.35 + corner * 0.65) - jaw * 0.3);
      const dz = scale * influence * (jaw * 0.06 + round * 0.14);
      if (changed(output, vertex, x + dx, y + dy, z + dz)) changedVertexCount++;
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
      if (changed(output, vertex, x, y, z)) changedVertexCount++;
    }
  }

  return {
    positions: output,
    receipt: {
      schemaVersion: 'holoscript.native-facial-morph.v1',
      topology: 'procedural-head-v1',
      appliedTargets,
      ignoredTargets: [...new Set(ignoredTargets)].sort(),
      changedVertexCount,
      positionDigest: digestPositions(output),
      normalsRecomputed: false,
    },
  };
}
