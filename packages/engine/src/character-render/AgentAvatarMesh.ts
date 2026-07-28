/**
 * AgentAvatarMesh — entity-generic procedural humanoid skinned mesh, as PURE DATA.
 *
 * Generalised from the Brittney-locked `studio/.../BrittneyAvatarMesh.tsx` (D.094: the
 * body is entity-generic, parameterised by id; default Brittney, never hardcoded). Unlike
 * that React/Three.js component, this is the sovereign native path: it emits flat vertex
 * arrays + per-vertex skin bindings (NO Three.js, NO GPU) that the native WebGPU character
 * renderer uploads and skins on-GPU. It is the always-works default body source; a glTF/VRM
 * upgrade is a separate, opt-in path (plan: "Both body sources").
 *
 * Geometry: one oriented box per skeletal segment (joint→child-joint), each segment weighted
 * (rigid, weight 1) to the bone it represents, so GPU linear-blend skinning over the
 * `HUMANOID_65_SKELETON` poses the whole figure through forward kinematics. Recognisable as a
 * segmented humanoid; Phase 1 layers proper limb geometry + SSS/hair materials on top.
 *
 * @module character-render
 */

import {
  HUMANOID_65_SKELETON,
  HUMANOID_BONE_NAMES,
  type BoneDefinition,
} from '../character/HumanoidSkeleton';
import {
  type Mat4,
  type Quat,
  type Vec3,
  IDENTITY4,
  IDENTITY_QUAT,
  fromTranslation,
  fromRotationTranslation,
  multiply,
  invert,
  getTranslation,
} from './skin-math';

// ---------------------------------------------------------------------------
// Pure-data mesh + palette types
// ---------------------------------------------------------------------------

export interface AgentAvatarMeshData {
  // <ArrayBuffer>-typed so they're assignable to SkinnedMeshData / GPU writeBuffer.
  /** Flat XYZ positions in world-bind space, 3 floats/vertex. */
  positions: Float32Array<ArrayBuffer>;
  /** Flat XYZ flat-face normals, 3 floats/vertex. */
  normals: Float32Array<ArrayBuffer>;
  /** 4 floats/vertex: xyz tangent + w strandT. Body = placeholder (0,1,0,0). */
  tangents: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  /** One palette (bone) index per vertex. */
  jointIndices: Uint32Array<ArrayBuffer>;
  /** One skin weight per vertex (1.0 — rigid per-bone for the procedural body). */
  jointWeights: Float32Array<ArrayBuffer>;
  vertexCount: number;
  /** Number of palette slots = HUMANOID_BONE_NAMES.length (65). */
  jointCount: number;
  /** Palette index → canonical bone name. */
  boneOrder: readonly string[];
}

export type AgentAvatarFaceTopology = 'procedural-head-v1' | 'neutral-anatomical-v2';

export interface AgentAvatarMeshOptions {
  /** Drives deterministic accent colour (D.094 entity-generic). */
  entityId?: string;
  /** 1.0 = 1.75 m reference figure. */
  heightScale?: number;
  /** Limb/torso thickness multiplier. */
  buildScale?: number;
  /** Source-authored facial topology. Legacy remains the default for compatibility. */
  faceTopology?: AgentAvatarFaceTopology;
  /** Longitude segments for neutral-anatomical-v2 (12..32). */
  faceRadialSegments?: number;
  /** Latitude segments for neutral-anatomical-v2 (8..24). */
  faceVerticalSegments?: number;
  /** Emit native eyelid/tearline rim topology around the procedural eyes. */
  faceTearline?: boolean;
}

/** Pose = per-bone LOCAL rotation applied at the joint (absent ⇒ identity / bind). */
export type AvatarPose = ReadonlyMap<string, Quat>;

// ---------------------------------------------------------------------------
// Palette order (canonical 65-bone set)
// ---------------------------------------------------------------------------

export const BONE_ORDER: readonly string[] = HUMANOID_BONE_NAMES;
export const JOINT_COUNT = BONE_ORDER.length;

const BONE_INDEX = new Map<string, number>(BONE_ORDER.map((n, i) => [n, i]));

// ---------------------------------------------------------------------------
// Forward kinematics over HUMANOID_65_SKELETON
// ---------------------------------------------------------------------------

/**
 * Bind-pose world matrices per bone (rotations identity, translations = local offsets).
 * Bones are listed parent-before-child in HUMANOID_65_SKELETON, so a single pass suffices.
 */
export function computeBindWorld(): Map<string, Mat4> {
  const world = new Map<string, Mat4>();
  for (const bone of HUMANOID_65_SKELETON) {
    const local = fromTranslation(bone.position[0], bone.position[1], bone.position[2]);
    const parentWorld = bone.parent ? (world.get(bone.parent) ?? IDENTITY4()) : IDENTITY4();
    world.set(bone.name, multiply(parentWorld, local));
  }
  return world;
}

/** Inverse-bind matrix per bone (maps world-bind space → bone-local bind space). */
export function computeInverseBind(bindWorld: Map<string, Mat4>): Map<string, Mat4> {
  const inv = new Map<string, Mat4>();
  for (const [name, m] of bindWorld) inv.set(name, invert(m));
  return inv;
}

/**
 * Posed world matrices per bone: worldPose(b) = worldPose(parent) · T(localPos) · R(poseQuat).
 */
function computePoseWorld(pose: AvatarPose): Map<string, Mat4> {
  const world = new Map<string, Mat4>();
  for (const bone of HUMANOID_65_SKELETON) {
    const q = pose.get(bone.name) ?? IDENTITY_QUAT;
    const local = fromRotationTranslation(q, {
      x: bone.position[0],
      y: bone.position[1],
      z: bone.position[2],
    });
    const parentWorld = bone.parent ? (world.get(bone.parent) ?? IDENTITY4()) : IDENTITY4();
    world.set(bone.name, multiply(parentWorld, local));
  }
  return world;
}

/**
 * Skin matrix palette for a pose: skin(b) = worldPose(b) · inverseBind(b), flattened to
 * JOINT_COUNT × 16 column-major floats in BONE_ORDER. At bind pose every entry is identity,
 * so the mesh renders unchanged — the structural correctness check (G.GOLD.013: test the
 * false case too).
 */
export function computeJointPalette(
  pose: AvatarPose,
  bindWorld: Map<string, Mat4> = computeBindWorld(),
  inverseBind: Map<string, Mat4> = computeInverseBind(bindWorld)
): Float32Array<ArrayBuffer> {
  const poseWorld = computePoseWorld(pose);
  const palette = new Float32Array(JOINT_COUNT * 16);
  for (let i = 0; i < JOINT_COUNT; i++) {
    const name = BONE_ORDER[i];
    const wp = poseWorld.get(name);
    const ib = inverseBind.get(name);
    const skin = wp && ib ? multiply(wp, ib) : IDENTITY4();
    palette.set(skin, i * 16);
  }
  return palette;
}

// ---------------------------------------------------------------------------
// Per-bone segment radius (thickness) heuristic — keyed by canonical name
// ---------------------------------------------------------------------------

function radiusFor(name: string, buildScale: number): number {
  const r =
    name === 'hips'
      ? 0.11
      : name === 'spine' || name === 'spine1' || name === 'spine2'
        ? 0.105
        : name === 'neck'
          ? 0.045
          : name === 'head'
            ? 0.09
            : name.endsWith('_shoulder')
              ? 0.05
              : name.endsWith('_upper_arm') || name.endsWith('_upper_leg')
                ? 0.055
                : name.endsWith('_forearm') || name.endsWith('_lower_leg')
                  ? 0.045
                  : name.endsWith('_hand') || name.endsWith('_foot')
                    ? 0.035
                    : name.endsWith('_toes') || name.endsWith('_toe_end')
                      ? 0.022
                      : /_(thumb|index|middle|ring|pinky)_/.test(name)
                        ? 0.012
                        : 0.04;
  return r * buildScale;
}

// ---------------------------------------------------------------------------
// Oriented-box geometry builder
// ---------------------------------------------------------------------------

interface MeshAccum {
  positions: number[];
  normals: number[];
  tangents: number[];
  indices: number[];
  jointIndices: number[];
  jointWeights: number[];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function normalize(a: Vec3): Vec3 {
  const len = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value ?? fallback)));
}

/** Append an oriented box spanning a→b (world-bind), thickness r, all verts weighted to jointIdx. */
function pushBox(acc: MeshAccum, a: Vec3, b: Vec3, r: number, jointIdx: number): void {
  const axisVec = sub(b, a);
  const halfLen = Math.hypot(axisVec.x, axisVec.y, axisVec.z) / 2;
  if (halfLen < 1e-5) return; // degenerate segment (zero-length) — skip
  const axisN = normalize(axisVec);
  const center = scale(add(a, b), 0.5);
  const up: Vec3 = Math.abs(axisN.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(up, axisN));
  const up2 = normalize(cross(axisN, right));

  // Corner at signed offsets along (axis, right, up2).
  const corner = (sx: number, sy: number, sz: number): Vec3 =>
    add(add(add(center, scale(axisN, sx * halfLen)), scale(right, sy * r)), scale(up2, sz * r));

  // 6 faces: [4 corner sign-triples, outward normal].
  const faces: Array<{ c: [number, number, number][]; n: Vec3 }> = [
    {
      c: [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
      n: axisN,
    },
    {
      c: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
      n: scale(axisN, -1),
    },
    {
      c: [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
      n: right,
    },
    {
      c: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      n: scale(right, -1),
    },
    {
      c: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
      n: up2,
    },
    {
      c: [
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
        [1, -1, -1],
      ],
      n: scale(up2, -1),
    },
  ];

  for (const face of faces) {
    const base = acc.positions.length / 3;
    for (const [sx, sy, sz] of face.c) {
      const p = corner(sx, sy, sz);
      acc.positions.push(p.x, p.y, p.z);
      acc.normals.push(face.n.x, face.n.y, face.n.z);
      acc.tangents.push(0, 1, 0, 0); // body placeholder (only hair reads tangent)
      acc.jointIndices.push(jointIdx);
      acc.jointWeights.push(1.0);
    }
    // Two triangles; cullMode 'none' downstream so winding is irrelevant.
    acc.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Append a thin front-facing anatomical rim. It is geometry, not a painted texture, so eyes
 * and the neutral mouth remain legible in an offline native character bundle.
 */
function pushFacialArc(
  acc: MeshAccum,
  center: Vec3,
  outerRadiusX: number,
  outerRadiusY: number,
  thickness: number,
  segments: number,
  startAngle: number,
  endAngle: number,
  jointIdx: number
): void {
  const base = acc.positions.length / 3;
  const innerRadiusX = Math.max(0.001, outerRadiusX - thickness);
  const innerRadiusY = Math.max(0.001, outerRadiusY - thickness);
  for (let segment = 0; segment <= segments; segment++) {
    const angle = startAngle + (segment / segments) * (endAngle - startAngle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const [radiusX, radiusY] of [
      [outerRadiusX, outerRadiusY],
      [innerRadiusX, innerRadiusY],
    ] as const) {
      acc.positions.push(center.x + cos * radiusX, center.y + sin * radiusY, center.z);
      acc.normals.push(0, 0, 1);
      acc.tangents.push(1, 0, 0, 1);
      acc.jointIndices.push(jointIdx);
      acc.jointWeights.push(1);
    }
  }
  for (let segment = 0; segment < segments; segment++) {
    const next = segment + 1;
    const outer = base + segment * 2;
    const inner = outer + 1;
    const nextOuter = base + next * 2;
    const nextInner = nextOuter + 1;
    acc.indices.push(outer, nextOuter, inner, inner, nextOuter, nextInner);
  }
}

function pushSmoothEllipsoid(
  acc: MeshAccum,
  center: Vec3,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  latitudes: number,
  longitudes: number,
  jointIdx: number
): void {
  const base = acc.positions.length / 3;
  for (let latitude = 0; latitude <= latitudes; latitude++) {
    const theta = (latitude / latitudes) * Math.PI;
    const ring = Math.sin(theta);
    const y = Math.cos(theta);
    for (let longitude = 0; longitude <= longitudes; longitude++) {
      const phi = (longitude / longitudes) * Math.PI * 2;
      const x = Math.cos(phi) * ring;
      const z = Math.sin(phi) * ring;
      const normal = normalize({
        x: x / radiusX,
        y: y / radiusY,
        z: z / radiusZ,
      });
      acc.positions.push(center.x + x * radiusX, center.y + y * radiusY, center.z + z * radiusZ);
      acc.normals.push(normal.x, normal.y, normal.z);
      acc.tangents.push(1, 0, 0, 1);
      acc.jointIndices.push(jointIdx);
      acc.jointWeights.push(1);
    }
  }
  const stride = longitudes + 1;
  for (let latitude = 0; latitude < latitudes; latitude++) {
    for (let longitude = 0; longitude < longitudes; longitude++) {
      const a = base + latitude * stride + longitude;
      const b = a + stride;
      acc.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

function pushNeutralMouthSeam(
  acc: MeshAccum,
  center: Vec3,
  halfWidth: number,
  bowDepth: number,
  thickness: number,
  segments: number,
  jointIdx: number
): void {
  const base = acc.positions.length / 3;
  for (let segment = 0; segment <= segments; segment++) {
    const unitX = segment / segments;
    const x = (unitX * 2 - 1) * halfWidth;
    const y =
      bowDepth * (0.4 * Math.cos(unitX * Math.PI * 2) - 0.18 * Math.cos(unitX * Math.PI * 4));
    for (const edge of [-0.5, 0.5]) {
      acc.positions.push(center.x + x, center.y + y + thickness * edge, center.z);
      acc.normals.push(0, 0, 1);
      acc.tangents.push(1, 0, 0, 1);
      acc.jointIndices.push(jointIdx);
      acc.jointWeights.push(1);
    }
  }
  for (let segment = 0; segment < segments; segment++) {
    const a = base + segment * 2;
    const b = a + 2;
    acc.indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
}

/**
 * Source-selectable neutral facial foundation. This is intentionally bounded: it is not a scan
 * or a production blendshape rig, but it replaces the visible block head with a smooth,
 * deformable surface whose facial landmarks survive native serialization.
 */
function pushNeutralAnatomicalHead(
  acc: MeshAccum,
  headBase: Vec3,
  headLength: number,
  radius: number,
  jointIdx: number,
  radialSegments: number,
  verticalSegments: number,
  includeTearline: boolean
): void {
  const center = {
    x: headBase.x,
    y: headBase.y + headLength * 0.52,
    z: headBase.z,
  };
  const radiusX = radius * 1.06;
  const radiusY = headLength * 0.62;
  const radiusZ = radius * 1.08;
  const base = acc.positions.length / 3;

  for (let latitude = 0; latitude <= verticalSegments; latitude++) {
    const theta = (latitude / verticalSegments) * Math.PI;
    const normalizedY = Math.cos(theta);
    const ring = Math.sin(theta);
    const lowerFace = Math.max(0, -normalizedY);
    const jawTaper = 1 - lowerFace * 0.22;
    for (let longitude = 0; longitude <= radialSegments; longitude++) {
      const phi = (longitude / radialSegments) * Math.PI * 2;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const front = Math.max(0, sin);
      const x = cos * ring * radiusX * jawTaper;
      const y = normalizedY * radiusY;
      // A flatter face and fuller occiput read more human than a perfect ellipsoid.
      const zScale = 1 - front * 0.045 + Math.max(0, -sin) * 0.035;
      const z = sin * ring * radiusZ * zScale;
      const normal = normalize({
        x: x / (radiusX * radiusX),
        y: y / (radiusY * radiusY),
        z: z / (radiusZ * radiusZ),
      });
      acc.positions.push(center.x + x, center.y + y, center.z + z);
      acc.normals.push(normal.x, normal.y, normal.z);
      acc.tangents.push(1, 0, 0, 1);
      acc.jointIndices.push(jointIdx);
      acc.jointWeights.push(1);
    }
  }

  const stride = radialSegments + 1;
  for (let latitude = 0; latitude < verticalSegments; latitude++) {
    for (let longitude = 0; longitude < radialSegments; longitude++) {
      const a = base + latitude * stride + longitude;
      const b = a + stride;
      acc.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const faceZ = center.z + radiusZ * 0.965;
  pushSmoothEllipsoid(
    acc,
    {
      x: center.x,
      y: center.y - radiusY * 0.075,
      z: faceZ + radiusZ * 0.075,
    },
    radiusX * 0.12,
    radiusY * 0.21,
    radiusZ * 0.08,
    7,
    10,
    jointIdx
  );

  if (includeTearline) {
    const buildScale = radius / 0.09;
    const eyeY = headBase.y + 0.12 * buildScale;
    const eyeZ = headBase.z + radius * 1.045;
    for (const eyeX of [-0.035 * buildScale, 0.035 * buildScale]) {
      const eyeCenter = {
        x: headBase.x + eyeX,
        y: eyeY,
        z: eyeZ,
      };
      pushFacialArc(
        acc,
        eyeCenter,
        radiusX * 0.235,
        radiusY * 0.13,
        radiusX * 0.018,
        10,
        0,
        Math.PI,
        jointIdx
      );
      pushFacialArc(
        acc,
        eyeCenter,
        radiusX * 0.235,
        radiusY * 0.13,
        radiusX * 0.012,
        7,
        Math.PI * 1.12,
        Math.PI * 1.88,
        jointIdx
      );
    }
  }

  pushNeutralMouthSeam(
    acc,
    {
      x: center.x,
      y: center.y - radiusY * 0.39,
      z: faceZ + radiusZ * 0.035,
    },
    radiusX * 0.3,
    radiusY * 0.025,
    radiusX * 0.012,
    14,
    jointIdx
  );
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build the entity-generic procedural humanoid skinned mesh (bind pose, world-bind space).
 * Combine with `computeJointPalette(pose)` to skin it on the GPU.
 */
export function buildAgentAvatarMesh(opts: AgentAvatarMeshOptions = {}): AgentAvatarMeshData {
  const buildScale = opts.buildScale ?? 1;
  const heightScale = opts.heightScale ?? 1;
  const faceTopology = opts.faceTopology ?? 'procedural-head-v1';
  const faceRadialSegments = clampInt(opts.faceRadialSegments, 20, 12, 32);
  const faceVerticalSegments = clampInt(opts.faceVerticalSegments, 14, 8, 24);
  const bindWorld = computeBindWorld();
  const acc: MeshAccum = {
    positions: [],
    normals: [],
    tangents: [],
    indices: [],
    jointIndices: [],
    jointWeights: [],
  };

  const childCount = new Map<string, number>();
  for (const bone of HUMANOID_65_SKELETON) {
    if (bone.parent) childCount.set(bone.parent, (childCount.get(bone.parent) ?? 0) + 1);
  }

  // One box per segment (parent-joint → this-joint), weighted to the PARENT bone it represents.
  for (const bone of HUMANOID_65_SKELETON) {
    if (!bone.parent) continue;
    const a = getTranslation(bindWorld.get(bone.parent)!);
    const b = getTranslation(bindWorld.get(bone.name)!);
    const jointIdx = BONE_INDEX.get(bone.parent) ?? 0;
    pushBox(acc, a, b, radiusFor(bone.parent, buildScale), jointIdx);
  }

  // Cap boxes for leaf bones with length>0 (mainly the head), extruded +Y in world-bind.
  for (const bone of HUMANOID_65_SKELETON as BoneDefinition[]) {
    if ((childCount.get(bone.name) ?? 0) === 0 && bone.length > 0) {
      const a = getTranslation(bindWorld.get(bone.name)!);
      const b = { x: a.x, y: a.y + bone.length, z: a.z };
      const jointIdx = BONE_INDEX.get(bone.name) ?? 0;
      if (bone.name === 'head' && faceTopology === 'neutral-anatomical-v2') {
        pushNeutralAnatomicalHead(
          acc,
          a,
          bone.length,
          radiusFor(bone.name, buildScale),
          jointIdx,
          faceRadialSegments,
          faceVerticalSegments,
          opts.faceTearline !== false
        );
      } else {
        pushBox(acc, a, b, radiusFor(bone.name, buildScale), jointIdx);
      }
    }
  }

  // Apply uniform height scale about the floor (y=0).
  const positions = new Float32Array(acc.positions);
  if (heightScale !== 1) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= heightScale;
      positions[i + 1] *= heightScale;
      positions[i + 2] *= heightScale;
    }
  }

  return {
    positions,
    normals: new Float32Array(acc.normals),
    tangents: new Float32Array(acc.tangents),
    indices: new Uint32Array(acc.indices),
    jointIndices: new Uint32Array(acc.jointIndices),
    jointWeights: new Float32Array(acc.jointWeights),
    vertexCount: acc.positions.length / 3,
    jointCount: JOINT_COUNT,
    boneOrder: BONE_ORDER,
  };
}

/** Deterministic accent colour (0xRRGGBB) from an entity id — same id → same colour (D.094). */
export function colorForEntity(entityId: string): number {
  let h = 0;
  for (let i = 0; i < entityId.length; i++) h = (h * 31 + entityId.charCodeAt(i)) >>> 0;
  // HSL → RGB with fixed S/L for vivid, distinct bodies.
  const hue = (h % 360) / 360;
  const s = 0.6;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const seg = Math.floor(hue * 6);
  if (seg === 0) [r, g, b] = [c, x, 0];
  else if (seg === 1) [r, g, b] = [x, c, 0];
  else if (seg === 2) [r, g, b] = [0, c, x];
  else if (seg === 3) [r, g, b] = [0, x, c];
  else if (seg === 4) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) | (G << 8) | B;
}
