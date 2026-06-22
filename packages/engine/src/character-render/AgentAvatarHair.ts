/**
 * AgentAvatarHair — procedural hair geometry + body+hair mesh combiner, as PURE DATA.
 *
 * Hair is card-strips seeded over a scalp dome above the head bone. EVERY hair vertex is
 * pinned to the 'head' palette index with weight 1.0, so the body's joint-matrix palette
 * (`computeJointPalette`) skins the hair through forward kinematics with zero extra wiring —
 * the hair rides the head bone for free. Each vertex carries a REAL strand tangent (xyz) +
 * strandT (w, 0 root → 1 tip) for the Kajiya-Kay hair shader (fixing HairRenderer.tsx:97's
 * hardcoded placeholder tangent).
 *
 * `buildCharacterMesh` concatenates the body (skin) + hair into ONE SkinnedMeshData and
 * reports the two index ranges, so the renderer draws body=skin-SSS / hair=marschner as two
 * material groups over a single shared vertex buffer + skin palette. No GPU, no Three.js.
 *
 * @module character-render
 */

import { HUMANOID_BONE_NAMES } from '../character/HumanoidSkeleton';
import type { SkinnedMeshData } from '../native-render/draw-spec';
import {
  buildAgentAvatarMesh,
  computeBindWorld,
  type AgentAvatarMeshOptions,
} from './AgentAvatarMesh';
import { getTranslation, type Vec3 } from './skin-math';

const HEAD_INDEX = HUMANOID_BONE_NAMES.indexOf('head');

export interface HairMeshData {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  /** 4 floats/vertex: xyz strand-flow tangent + w strandT (0 root → 1 tip). */
  tangents: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  jointIndices: Uint32Array<ArrayBuffer>; // all = head palette index
  jointWeights: Float32Array<ArrayBuffer>; // all = 1.0
  vertexCount: number;
}

export interface HairOptions {
  buildScale?: number;
  heightScale?: number;
  /** Scalp guide roots (default 140). */
  guides?: number;
  /** Cards per guide for volume (default 2). */
  cardsPerGuide?: number;
  /** Points per guide curve (default 5). */
  segments?: number;
  /** Card width in metres (default 0.014). */
  cardWidth?: number;
  /** Tip length in metres (default 0.16). */
  length?: number;
}

// ── small vec helpers ──
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scl = (a: Vec3, s: number): Vec3 => v(a.x * s, a.y * s, a.z * s);
const cross = (a: Vec3, b: Vec3): Vec3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const nrm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return v(a.x / l, a.y / l, a.z / l);
};
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(scl(a, 1 - t), scl(b, t));

/**
 * Build procedural hair as card-strips over the scalp dome. Deterministic (golden-angle
 * Fibonacci seeding — no RNG). All vertices skin to the head bone.
 */
export function buildAgentAvatarHair(o: HairOptions = {}): HairMeshData {
  const bs = o.buildScale ?? 1;
  const hScale = o.heightScale ?? 1;
  const guideCount = o.guides ?? 140;
  const cardsPerGuide = o.cardsPerGuide ?? 2;
  const segs = o.segments ?? 5;
  const cardW = (o.cardWidth ?? 0.014) * bs;
  const tipLen = (o.length ?? 0.16) * bs;

  const bind = computeBindWorld();
  const head = getTranslation(bind.get('head')!); // scalp base, world-bind y≈1.51
  const headR = 0.09 * bs; // radiusFor('head')
  const center = add(head, v(0, 0.06 * bs, 0)); // dome center, just above the head joint
  const shellR = headR + 0.006 * bs; // sit just off the skull

  const positions: number[] = [];
  const normals: number[] = [];
  const tangents: number[] = [];
  const indices: number[] = [];
  const ji: number[] = [];
  const jw: number[] = [];

  for (let g = 0; g < guideCount; g++) {
    const t01 = g / guideCount;
    const phi = Math.acos(1 - t01); // 0..~π/2 → upper-hemisphere bias
    const theta = g * 2.399963; // golden angle
    const dir = v(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    // Hairline mask: no hair under the crown (y<-0.1) or sprouting off the front face (+Z).
    if (dir.y < -0.1) continue;
    if (dir.z > 0.55 && dir.y < 0.35) continue;
    const root = add(center, scl(dir, shellR));

    // Guide curve: hug the skull at the root, fall under gravity toward the tip.
    const curve: Vec3[] = [];
    for (let i = 0; i < segs; i++) {
      const u = i / (segs - 1);
      const flow = nrm(lerp(dir, v(0, -1, 0), u * 0.85));
      curve.push(i === 0 ? root : add(curve[i - 1], scl(flow, tipLen / (segs - 1))));
    }

    for (let c = 0; c < cardsPerGuide; c++) {
      const roll = (c / cardsPerGuide) * Math.PI;
      const vbase = positions.length / 3;
      for (let i = 0; i < segs; i++) {
        const p = curve[i];
        const seg = i < segs - 1 ? sub(curve[i + 1], curve[i]) : sub(curve[i], curve[i - 1]);
        const tan = nrm(seg);
        const up = Math.abs(tan.y) > 0.99 ? v(1, 0, 0) : v(0, 1, 0);
        const right0 = nrm(cross(tan, up));
        // roll the card around the strand axis for volume
        const right = nrm(add(scl(right0, Math.cos(roll)), scl(cross(tan, right0), Math.sin(roll))));
        const faceN = nrm(cross(right, tan));
        const strandT = i / (segs - 1);
        const off = scl(right, cardW * 0.5);
        for (const s of [-1, 1]) {
          const vp = add(p, scl(off, s));
          positions.push(vp.x, vp.y, vp.z);
          normals.push(faceN.x, faceN.y, faceN.z);
          tangents.push(tan.x, tan.y, tan.z, strandT); // real tangent + strandT
          ji.push(HEAD_INDEX);
          jw.push(1.0);
        }
        if (i < segs - 1) {
          const b = vbase + i * 2;
          indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
    }
  }

  // Uniform height scale about the floor (matches the body's heightScale).
  const pos = new Float32Array(positions);
  if (hScale !== 1) for (let i = 0; i < pos.length; i++) pos[i] *= hScale;

  return {
    positions: pos,
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    indices: new Uint32Array(indices),
    jointIndices: new Uint32Array(ji),
    jointWeights: new Float32Array(jw),
    vertexCount: positions.length / 3,
  };
}

// ── typed-array concat helpers ──
function catF32(a: Float32Array, b: Float32Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
function catU32(a: Uint32Array, b: Uint32Array): Uint32Array<ArrayBuffer> {
  const out = new Uint32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export interface CharacterMeshData {
  mesh: SkinnedMeshData;
  bodyRange: { indexStart: number; indexCount: number };
  hairRange: { indexStart: number; indexCount: number };
}

/**
 * Build the combined body+hair mesh as one SkinnedMeshData, with the two index ranges the
 * renderer slices for the body=skin-SSS and hair=marschner material groups.
 */
export function buildCharacterMesh(
  opts: AgentAvatarMeshOptions & HairOptions = {}
): CharacterMeshData {
  const body = buildAgentAvatarMesh(opts);
  const hair = buildAgentAvatarHair({
    buildScale: opts.buildScale,
    heightScale: opts.heightScale,
    guides: opts.guides,
    cardsPerGuide: opts.cardsPerGuide,
    segments: opts.segments,
    cardWidth: opts.cardWidth,
    length: opts.length,
  });

  const bodyVC = body.vertexCount;
  // Hair indices reference hair-local verts; offset by the body vertex count after concat.
  const hairIdx = new Uint32Array(hair.indices.length);
  for (let i = 0; i < hairIdx.length; i++) hairIdx[i] = hair.indices[i] + bodyVC;

  const mesh: SkinnedMeshData = {
    positions: catF32(body.positions, hair.positions),
    normals: catF32(body.normals, hair.normals),
    tangents: catF32(body.tangents, hair.tangents),
    indices: catU32(body.indices, hairIdx),
    jointIndices: catU32(body.jointIndices, hair.jointIndices),
    jointWeights: catF32(body.jointWeights, hair.jointWeights),
    vertexCount: bodyVC + hair.vertexCount,
  };

  return {
    mesh,
    bodyRange: { indexStart: 0, indexCount: body.indices.length },
    hairRange: { indexStart: body.indices.length, indexCount: hair.indices.length },
  };
}
