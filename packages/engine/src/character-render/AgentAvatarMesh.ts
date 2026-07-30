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
 * Geometry: compatibility bodies use one oriented box per skeletal segment. Source-authored
 * bodies can replace the axial torso, shoulder roots, and neck with one connected elliptical
 * loft while retaining the sovereign `HUMANOID_65_SKELETON` skinning path. Each vertex stays
 * rigidly bound to one canonical bone, so the native GPU palette poses the entire figure
 * without an imported body asset or provider runtime.
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
  /** Primary skin weight per vertex. Legacy profiles remain rigid at 1.0. */
  jointWeights: Float32Array<ArrayBuffer>;
  /** Optional second palette index. Present only for profiles that emit blended deformation. */
  secondaryJointIndices?: Uint32Array<ArrayBuffer>;
  /** Optional second skin weight. Primary + secondary is normalized for authored blends. */
  secondaryJointWeights?: Float32Array<ArrayBuffer>;
  vertexCount: number;
  /** Number of palette slots = HUMANOID_BONE_NAMES.length (65). */
  jointCount: number;
  /** Palette index → canonical bone name. */
  boneOrder: readonly string[];
  /** Present only when the neutral anatomical head emitted operative orbital geometry. */
  orbital?: AgentAvatarOrbitalGeometryReceipt;
  /** Present only when the source selects the denser civic facial-landmark profile. */
  facialLandmarks?: AgentAvatarFacialLandmarkReceipt;
  /** Exact clamped proportions used by the native procedural body and face builders. */
  anatomy: AgentAvatarAnatomyReceipt;
  /** Present only when the emitted mesh contains operative dual-influence deformation. */
  jointDeformation?: AgentAvatarJointDeformationReceipt;
  /** Present only when the V5 anatomical hand-surface construction is actually emitted. */
  handSurface?: AgentAvatarHandSurfaceReceipt;
}

export type AgentAvatarFaceTopology = 'procedural-head-v1' | 'neutral-anatomical-v2';
export const AGENT_AVATAR_UPPER_BODY_PROFILES = [
  'legacy-segments-v1',
  'coherent-shoulder-neck-torso-v1',
  'coherent-anatomical-limbs-v2',
  'coherent-hand-landmarks-v3',
  'coherent-deforming-hands-v4',
  'coherent-hand-surface-v5',
  'coherent-portrait-anatomy-v6',
  'coherent-expressive-anatomy-v7',
] as const;
export type AgentAvatarUpperBodyProfile = (typeof AGENT_AVATAR_UPPER_BODY_PROFILES)[number];
export const AGENT_AVATAR_ORBITAL_PROFILES = [
  'tearline-rim-v1',
  'recessed-lids-v1',
  'anatomical-lid-fold-v2',
] as const;
export type AgentAvatarOrbitalProfile = (typeof AGENT_AVATAR_ORBITAL_PROFILES)[number];
export const AGENT_AVATAR_FACIAL_DETAIL_PROFILES = [
  'legacy-landmarks-v1',
  'civic-landmarks-v1',
  'portrait-silhouette-v2',
  'portrait-cranial-v3',
  'portrait-soft-tissue-v4',
] as const;
export type AgentAvatarFacialDetailProfile = (typeof AGENT_AVATAR_FACIAL_DETAIL_PROFILES)[number];

export interface AgentAvatarOrbitalGeometryReceipt {
  profile: AgentAvatarOrbitalProfile;
  /** Globe recession as a fraction of the procedural eyeball radius. */
  eyeRecess: number;
  /** Vertical palpebral opening as a fraction of the procedural eyeball radius. */
  lidOpening: number;
  /** Outer-canthus rise as a fraction of the procedural eyeball radius. */
  canthalTilt: number;
  /** Globe size relative to the compatibility procedural eye radius. */
  eyeScale?: number;
  /** Present only when an independently indexed upper-lid crease is emitted. */
  lidFoldProfile?: 'upper-crease-continuity-v1';
  vertexRange: { vertexStart: number; vertexCount: number };
  indexRange: { indexStart: number; indexCount: number };
}

export interface AgentAvatarFacialLandmarkReceipt {
  schemaVersion:
    | 'holoscript.agent-avatar-facial-landmarks.v1'
    | 'holoscript.agent-avatar-facial-landmarks.v2'
    | 'holoscript.agent-avatar-facial-landmarks.v3'
    | 'holoscript.agent-avatar-facial-landmarks.v4';
  profile:
    | 'civic-landmarks-v1'
    | 'portrait-silhouette-v2'
    | 'portrait-cranial-v3'
    | 'portrait-soft-tissue-v4';
  radialSegments: number;
  verticalSegments: number;
  eyeScale: number;
  browHeight: number;
  browThickness: number;
  earScale: number;
  mouthDepth: number;
  /** V2 cheek-volume multiplier applied to the native head surface. */
  cheekboneScale?: number;
  /** V2 forward chin projection applied to the native head surface. */
  chinProjection?: number;
  /** V2 temple-width multiplier applied to the native head surface. */
  templeWidth?: number;
  /** H3Y connected upper/seam/lower lip surface replacing separate ellipsoid volumes. */
  lipTopology?: 'connected-cupid-bow-ribbon-v1';
  lipSurfaceVertexCount?: number;
  lipSurfaceTriangleCount?: number;
  vertexRange: { vertexStart: number; vertexCount: number };
  indexRange: { indexStart: number; indexCount: number };
}

export interface AgentAvatarCranialNeckGeometryReceipt {
  schemaVersion: 'holoscript.agent-avatar-cranial-neck.v1';
  profile: 'indexed-neck-cranium-stitch-v1';
  neckRadialSegments: number;
  cranialRadialSegments: number;
  bridgeTriangleCount: number;
  /** Bind-space separation between the upper neck ring and truncated cranial ring. */
  axialSeparation: number;
  /** Largest closest-sample distance between the two stitched boundary loops. */
  maxSeamGap: number;
  neckVertexRange: { vertexStart: number; vertexCount: number };
  cranialVertexRange: { vertexStart: number; vertexCount: number };
  indexRange: { indexStart: number; indexCount: number };
}

export interface AgentAvatarAnatomyReceipt {
  schemaVersion:
    | 'holoscript.agent-avatar-anatomy.v1'
    | 'holoscript.agent-avatar-anatomy.v2'
    | 'holoscript.agent-avatar-anatomy.v3';
  faceWidth: number;
  faceLength: number;
  jawTaper: number;
  shoulderScale: number;
  torsoScale: number;
  /** Present only when the connected native upper-body surface is actually emitted. */
  upperBody?: AgentAvatarUpperBodyGeometryReceipt;
  /** H3X indexed transition between the authored upper-neck and truncated cranial loops. */
  cranialNeck?: AgentAvatarCranialNeckGeometryReceipt;
}

export interface AgentAvatarJointDeformationReceipt {
  schemaVersion:
    | 'holoscript.agent-avatar-joint-deformation.v1'
    | 'holoscript.agent-avatar-joint-deformation.v2'
    | 'holoscript.agent-avatar-joint-deformation.v3'
    | 'holoscript.agent-avatar-joint-deformation.v4';
  profile:
    | 'dual-influence-upper-limb-v1'
    | 'portrait-shoulder-volume-v2'
    | 'expressive-neck-scapular-volume-v3'
    | 'expressive-cranial-neck-volume-v4';
  influencedVertexCount: number;
  jointPairCount: number;
  maxSecondaryWeight: number;
  maxWeightSumError: number;
  regionVertexCounts: {
    shoulder: number;
    elbow: number;
    wrist: number;
    digitRoot: number;
    fingerJoint: number;
    /** V7 axial rings blended between spine2 and neck. */
    neck?: number;
    /** H3X stitched neck and lower-cranium loops blended between neck and head. */
    cranialNeck?: number;
  };
  /** V2 source-derived shoulder transition contract. */
  shoulderVolume?: {
    blendRingCount: 6;
    rootOverlapDepth: number;
    minimumAuthoredRadiusRatio: number;
    influenceWeights: readonly [number, number, number, number, number, number];
  };
  /** V7 source controls and operative neck/scapular blend topology. */
  expressiveAsymmetry?: {
    profile: 'source-asymmetric-neck-scapula-v1';
    scapularElevation: { left: number; right: number };
    scapularProtraction: { left: number; right: number };
    neckBlendRingCount: 4;
    neckInfluenceWeights: readonly [number, number, number, number];
  };
  /** H3X head/neck deformation continuity over the indexed cranial stitch. */
  cranialNeckContinuity?: {
    profile: 'dual-influence-neck-head-stitch-v1';
    neckToHeadWeight: 0.35;
    headToNeckWeight: 0.45;
  };
}

export interface AgentAvatarUpperBodyGeometryReceipt {
  schemaVersion: 'holoscript.agent-avatar-upper-body-geometry.v1';
  profile:
    | 'coherent-shoulder-neck-torso-v1'
    | 'anatomical-shoulder-neck-torso-v2'
    | 'anatomical-hand-landmarks-v3'
    | 'anatomical-deforming-hands-v4'
    | 'anatomical-hand-surface-v5'
    | 'portrait-anatomy-v6'
    | 'expressive-anatomy-v7';
  radialSegments: number;
  ringCount: number;
  /** Emitted bind-space half width at the shoulder ring, after authored scaling. */
  shoulderHalfWidth: number;
  /** Emitted bind-space half width at the waist ring, after authored scaling. */
  waistHalfWidth: number;
  /** Emitted bind-space radius at the top neck ring, after authored scaling. */
  neckRadius: number;
  vertexRange: { vertexStart: number; vertexCount: number };
  indexRange: { indexStart: number; indexCount: number };
  /** One continuous shoulder-to-palm surface per side. */
  upperLimbs: [AgentAvatarUpperLimbGeometryReceipt, AgentAvatarUpperLimbGeometryReceipt];
}

export interface AgentAvatarUpperLimbGeometryReceipt {
  schemaVersion: 'holoscript.agent-avatar-upper-limb-geometry.v1';
  profile:
    | 'coherent-arm-palm-v1'
    | 'anatomical-deltoid-hand-v2'
    | 'anatomical-landmark-hand-v3'
    | 'arched-palm-joint-deformation-v4'
    | 'tapered-hand-surface-v5'
    | 'portrait-deltoid-hand-surface-v6'
    | 'expressive-scapular-hand-surface-v7';
  side: 'left' | 'right';
  radialSegments: number;
  ringCount: number;
  shoulderRadius: number;
  wristRadius: number;
  palmHalfWidth: number;
  /** V2 rings that swell from the shoulder root into the upper arm. */
  deltoidBlendRingCount?: number;
  /** V2 root overlap that hides the old torso/arm silhouette seam. */
  shoulderOverlapDepth?: number;
  /** V6 transition rings distributed across the scapular/deltoid envelope. */
  shoulderBlendRingCount?: 6;
  /** V6 smallest authored shoulder-section radius divided by its root radius. */
  minimumShoulderRadiusRatio?: number;
  /** V6 upper-pole scale that prevents a circular shoulder section from reading as a spike. */
  superiorContourScaleMin?: number;
  /** V7 bind-space elevation authored independently per scapula (-1..1). */
  scapularElevation?: number;
  /** V7 bind-space forward/back scapular travel authored independently per side (-1..1). */
  scapularProtraction?: number;
  /** Five separately skinned, three-phalanx native digit surfaces in V2. */
  digits?: readonly AgentAvatarDigitGeometryReceipt[];
  /** V3 skin and keratin landmarks: webs, knuckles, tendons, and nail plates. */
  handLandmarks?: readonly AgentAvatarHandLandmarkGeometryReceipt[];
  /** V4 bind silhouette that gives the palm a metacarpal arch and asymmetric muscle volume. */
  palmProfile?: 'arched-thenar-palm-v1';
  /** Wrist-to-metacarpal rings participating in the V4 palm transition. */
  palmBlendRingCount?: 4 | 6;
  /** Maximum radial thenar expansion relative to the local palm section. */
  thenarBulgeRatio?: number;
  /** Maximum radial hypothenar expansion relative to the local palm section. */
  hypothenarBulgeRatio?: number;
  /** Dorsal rise of the metacarpal arch in emitted metres. */
  palmArchRise?: number;
  /** Distal palm thickness divided by the widest metacarpal thickness. */
  metacarpalTaperRatio?: number;
  /** Arm/palm plus separately connected digit and landmark surfaces. */
  connectedSurfaceCount?: number;
  /** V5 topology and silhouette evidence for the emitted anatomical hand surface. */
  handSurface?: AgentAvatarHandSurfaceGeometryReceipt;
  vertexRange: { vertexStart: number; vertexCount: number };
  indexRange: { indexStart: number; indexCount: number };
}

export interface AgentAvatarHandSurfaceGeometryReceipt {
  schemaVersion: 'holoscript.agent-avatar-hand-surface-geometry.v1';
  profile: 'tapered-digit-commissure-cuticle-wrist-v1';
  side: 'left' | 'right';
  wristTransitionRingCount: 6;
  digitSectionRingCount: 14;
  digitSectionExponent: 2.35;
  commissureRows: 5;
  commissureColumns: 7;
  commissureSaddleDepth: number;
  nailRows: 7;
  nailColumns: 7;
  cuticleInsetRatio: 0.36;
  freeEdgeInsetRatio: 0.18;
  regionVertexCounts: {
    wristTransition: number;
    digitSections: number;
    metacarpalKnuckles: number;
    interdigitalCommissures: number;
    nailCuticles: number;
  };
  regionIndexCounts: {
    wristTransition: number;
    digitSections: number;
    metacarpalKnuckles: number;
    interdigitalCommissures: number;
    nailCuticles: number;
  };
}

export interface AgentAvatarHandSurfaceReceipt {
  schemaVersion: 'holoscript.agent-avatar-hand-surface.v1';
  profile: 'tapered-digit-commissure-cuticle-wrist-v1';
  upperBodyProfile:
    | 'coherent-hand-surface-v5'
    | 'coherent-portrait-anatomy-v6'
    | 'coherent-expressive-anatomy-v7';
  limbs: [AgentAvatarHandSurfaceGeometryReceipt, AgentAvatarHandSurfaceGeometryReceipt];
  regionVertexCounts: AgentAvatarHandSurfaceGeometryReceipt['regionVertexCounts'];
  regionIndexCounts: AgentAvatarHandSurfaceGeometryReceipt['regionIndexCounts'];
}

export const AGENT_AVATAR_DIGIT_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type AgentAvatarDigitName = (typeof AGENT_AVATAR_DIGIT_NAMES)[number];

export interface AgentAvatarDigitGeometryReceipt {
  schemaVersion: 'holoscript.agent-avatar-digit-geometry.v1';
  profile:
    | 'articulated-three-phalanx-v1'
    | 'volume-preserving-three-phalanx-v2'
    | 'tapered-superellipse-three-phalanx-v3';
  side: 'left' | 'right';
  digit: AgentAvatarDigitName;
  radialSegments: number;
  ringCount: number;
  phalanxSegmentCount: 3;
  webBlendRingCount: 1 | 2;
  /** Extra V3 rings that bound radius loss around the articulated joints. */
  jointVolumeBlendRingCount?: number;
  /** Smallest non-tip ring radius divided by the emitted base radius. */
  minimumJointRadiusRatio?: number;
  /** Largest adjacent ring-radius loss divided by the emitted base radius. */
  maximumAdjacentRadiusDrop?: number;
  /** Dorsal-palmar radius divided by lateral radius for the V3 oval section. */
  crossSectionAspectRatio?: number;
  /** V5 superellipse exponent; values above 2 flatten the dorsal and palmar faces. */
  crossSectionExponent?: number;
  /** V5 rings that restore volume at the metacarpal, PIP, and DIP landmarks. */
  knuckleVolumeRingCount?: number;
  totalLength: number;
  baseRadius: number;
  tipRadius: number;
  vertexRange: { vertexStart: number; vertexCount: number };
  indexRange: { indexStart: number; indexCount: number };
}

export type AgentAvatarHandLandmarkKind =
  | 'interdigital-web'
  | 'metacarpal-knuckle'
  | 'dorsal-tendon-ridge'
  | 'nail-plate';

export interface AgentAvatarHandLandmarkGeometryReceipt {
  schemaVersion: 'holoscript.agent-avatar-hand-landmark-geometry.v1';
  profile:
    | 'anatomical-hand-landmark-v1'
    | 'volumetric-interdigital-web-v2'
    | 'surface-conforming-nail-plate-v2'
    | 'integrated-metacarpal-knuckle-v2'
    | 'concave-interdigital-commissure-v3'
    | 'cuticle-contoured-nail-plate-v3';
  side: 'left' | 'right';
  kind: AgentAvatarHandLandmarkKind;
  /** Primary digit, when the landmark belongs to one digit. */
  digit?: AgentAvatarDigitName;
  /** Adjacent digit pair bridged by an interdigital web. */
  betweenDigits?: readonly [AgentAvatarDigitName, AgentAvatarDigitName];
  /** Native shading region. Nail plates are excluded from the skin draw ranges. */
  materialRole: 'skin' | 'keratin-nail';
  jointName: string;
  /** Curved cross-section rings used by a V3 interdigital web. */
  blendRingCount?: number;
  /** Nail attachment is an intentionally embedded, conforming distal surface, not watertight skin. */
  attachment?: 'distal-phalanx-surface-conforming-v1';
  /** Number of underside vertices sampled against the distal digit loft. */
  attachmentSampleCount?: number;
  /** Positive authored penetration below the sampled digit surface, in emitted metres. */
  surfaceEmbedDepth?: number;
  /** Keratin plate thickness at the distal free edge, in emitted metres. */
  freeEdgeThickness?: number;
  /** Rows and columns in the closed V5 commissure or nail surface. */
  surfaceRows?: number;
  surfaceColumns?: number;
  /** Maximum V5 free-margin recession, in emitted metres. */
  saddleDepth?: number;
  /** V5 lateral inset at the proximal cuticle and distal free edge. */
  cuticleInsetRatio?: number;
  freeEdgeInsetRatio?: number;
  vertexRange: { vertexStart: number; vertexCount: number };
  indexRange: { indexStart: number; indexCount: number };
}

export interface AgentAvatarMeshOptions {
  /** Drives deterministic accent colour (D.094 entity-generic). */
  entityId?: string;
  /** 1.0 = 1.75 m reference figure. */
  heightScale?: number;
  /** Limb/torso thickness multiplier. */
  buildScale?: number;
  /** Source-authored facial topology. Legacy remains the default for compatibility. */
  faceTopology?: AgentAvatarFaceTopology;
  /** Longitude segments (12..32 legacy; 12..48 for portrait-cranial-v3). */
  faceRadialSegments?: number;
  /** Latitude segments (8..24 legacy; 8..36 for portrait-cranial-v3). */
  faceVerticalSegments?: number;
  /** Emit native eyelid/tearline rim topology around the procedural eyes. */
  faceTearline?: boolean;
  /** Native orbital construction profile. The tearline rim remains the compatibility default. */
  orbitalProfile?: AgentAvatarOrbitalProfile;
  /** Globe recession as a fraction of the procedural eyeball radius (0..0.45). */
  eyeRecess?: number;
  /** Vertical palpebral opening as a fraction of the eyeball radius (0.42..0.78). */
  lidOpening?: number;
  /** Outer-canthus rise as a fraction of the eyeball radius (-0.25..0.25). */
  canthalTilt?: number;
  /** Optional denser native facial-landmark profile. Compatibility default is legacy. */
  facialDetailProfile?: AgentAvatarFacialDetailProfile;
  /** Procedural ocular globe scale (0.72..1.08). */
  eyeScale?: number;
  /** Brow center rise above the upper lid, in eye-radius units (0.65..1.65). */
  browHeight?: number;
  /** Brow ribbon thickness, in eye-radius units (0.08..0.32). */
  browThickness?: number;
  /** Native ear scale (0.7..1.3). */
  earScale?: number;
  /** Lip-volume depth multiplier (0.25..1.4). */
  mouthDepth?: number;
  /** Portrait-silhouette-v2 cheek-volume multiplier (0.82..1.22). */
  cheekboneScale?: number;
  /** Portrait-silhouette-v2 forward chin projection (0.72..1.28). */
  chinProjection?: number;
  /** Portrait-silhouette-v2 temple-width multiplier (0.88..1.12). */
  templeWidth?: number;
  /** Neutral-head width multiplier (0.84..1.2). */
  faceWidth?: number;
  /** Neutral-head vertical-length multiplier (0.86..1.16). */
  faceLength?: number;
  /** Lower-face width reduction from forehead to chin (0.08..0.38). */
  jawTaper?: number;
  /** Bind-space shoulder/arm span multiplier (0.85..1.25). */
  shoulderScale?: number;
  /** Hips/spine thickness multiplier, independent of global build scale (0.85..1.2). */
  torsoScale?: number;
  /** Native upper-body construction. Compatibility segment boxes remain the default. */
  upperBodyProfile?: AgentAvatarUpperBodyProfile;
  /** Circumferential topology budget for the connected upper-body loft (12..32). */
  upperBodyRadialSegments?: number;
  /** V7 independent left scapular elevation (-1..1). */
  leftScapularElevation?: number;
  /** V7 independent right scapular elevation (-1..1). */
  rightScapularElevation?: number;
  /** V7 independent left scapular forward/back travel (-1..1). */
  leftScapularProtraction?: number;
  /** V7 independent right scapular forward/back travel (-1..1). */
  rightScapularProtraction?: number;
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

function radiusFor(name: string, buildScale: number, torsoScale = 1): number {
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
  const upperBodyScale =
    name === 'hips' || name === 'spine' || name === 'spine1' || name === 'spine2' ? torsoScale : 1;
  return r * buildScale * upperBodyScale;
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
function midpoint(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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

function clampFloat(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value ?? fallback));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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

interface UpperBodyRing {
  y: number;
  radiusX: number;
  radiusZ: number;
  centerZ: number;
  jointName: 'hips' | 'spine' | 'spine1' | 'spine2' | 'neck';
}

/**
 * Append one connected, indexed elliptical loft from the upper hips through the shoulder
 * girdle and neck. Shared triangles replace the interpenetrating axial and shoulder boxes
 * while preserving the one-weight skinning ABI used by the sovereign native renderer.
 */
function pushCoherentUpperBody(
  acc: MeshAccum,
  profile: Exclude<AgentAvatarUpperBodyProfile, 'legacy-segments-v1'>,
  radialSegments: number,
  buildScale: number,
  shoulderScale: number,
  torsoScale: number,
  heightScale: number
): Omit<AgentAvatarUpperBodyGeometryReceipt, 'upperLimbs'> {
  const torso = buildScale * torsoScale;
  const anatomical = profile !== 'coherent-shoulder-neck-torso-v1';
  const expressive = profile === 'coherent-expressive-anatomy-v7';
  const portrait = profile === 'coherent-portrait-anatomy-v6' || expressive;
  const handSurface = profile === 'coherent-hand-surface-v5' || portrait;
  const deforming = profile === 'coherent-deforming-hands-v4' || handSurface;
  const landmarked = profile === 'coherent-hand-landmarks-v3' || deforming;
  const foundationRings: UpperBodyRing[] = [
    { y: 0.91, radiusX: 0.16 * torso, radiusZ: 0.13 * torso, centerZ: 0, jointName: 'hips' },
    { y: 0.99, radiusX: 0.18 * torso, radiusZ: 0.14 * torso, centerZ: 0, jointName: 'hips' },
    { y: 1.07, radiusX: 0.17 * torso, radiusZ: 0.13 * torso, centerZ: 0, jointName: 'spine' },
    { y: 1.15, radiusX: 0.18 * torso, radiusZ: 0.14 * torso, centerZ: 0, jointName: 'spine1' },
    {
      y: 1.23,
      radiusX: 0.195 * torso,
      radiusZ: 0.145 * torso,
      centerZ: 0.005,
      jointName: 'spine1',
    },
    {
      y: 1.31,
      radiusX: 0.215 * torso,
      radiusZ: 0.155 * torso,
      centerZ: 0.01,
      jointName: 'spine2',
    },
    {
      y: 1.365,
      radiusX: 0.23 * torso,
      radiusZ: 0.16 * torso,
      centerZ: 0.012,
      jointName: 'spine2',
    },
  ];
  const rings: UpperBodyRing[] = anatomical
    ? [
        ...foundationRings,
        {
          y: 1.395,
          radiusX: 0.242 * buildScale * shoulderScale,
          radiusZ: 0.158 * buildScale,
          centerZ: 0.008,
          jointName: 'spine2',
        },
        {
          y: 1.422,
          radiusX: 0.218 * buildScale * shoulderScale,
          radiusZ: 0.146 * buildScale,
          centerZ: 0.004,
          jointName: 'spine2',
        },
        {
          y: 1.448,
          radiusX: 0.15 * buildScale,
          radiusZ: 0.112 * buildScale,
          centerZ: 0.001,
          jointName: 'neck',
        },
        {
          y: 1.475,
          radiusX: 0.082 * buildScale,
          radiusZ: 0.071 * buildScale,
          centerZ: 0,
          jointName: 'neck',
        },
        {
          y: 1.51,
          radiusX: 0.054 * buildScale,
          radiusZ: 0.052 * buildScale,
          centerZ: 0,
          jointName: 'neck',
        },
      ]
    : [
        ...foundationRings,
        {
          y: 1.41,
          radiusX: 0.24 * buildScale * shoulderScale,
          radiusZ: 0.15 * buildScale,
          centerZ: 0.005,
          jointName: 'spine2',
        },
        {
          y: 1.45,
          radiusX: 0.1 * buildScale,
          radiusZ: 0.09 * buildScale,
          centerZ: 0,
          jointName: 'neck',
        },
        {
          y: 1.51,
          radiusX: 0.054 * buildScale,
          radiusZ: 0.052 * buildScale,
          centerZ: 0,
          jointName: 'neck',
        },
      ];
  const vertexStart = acc.positions.length / 3;
  const indexStart = acc.indices.length;

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    const previous = rings[Math.max(0, ringIndex - 1)];
    const next = rings[Math.min(rings.length - 1, ringIndex + 1)];
    const deltaY = Math.max(1e-6, next.y - previous.y);
    const slopeX = (next.radiusX - previous.radiusX) / deltaY;
    const slopeZ = (next.radiusZ - previous.radiusZ) / deltaY;
    const centerSlopeZ = (next.centerZ - previous.centerZ) / deltaY;
    const jointIndex = BONE_INDEX.get(ring.jointName) ?? 0;

    for (let segment = 0; segment < radialSegments; segment++) {
      const theta = (segment / radialSegments) * Math.PI * 2;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const tangentTheta = normalize({
        x: -ring.radiusX * sine,
        y: 0,
        z: ring.radiusZ * cosine,
      });
      const tangentY = {
        x: slopeX * cosine,
        y: 1,
        z: centerSlopeZ + slopeZ * sine,
      };
      const normal = normalize(cross(tangentY, tangentTheta));

      acc.positions.push(ring.radiusX * cosine, ring.y, ring.centerZ + ring.radiusZ * sine);
      acc.normals.push(normal.x, normal.y, normal.z);
      acc.tangents.push(tangentTheta.x, tangentTheta.y, tangentTheta.z, 1);
      acc.jointIndices.push(jointIndex);
      acc.jointWeights.push(1);
    }
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex++) {
    const lower = vertexStart + ringIndex * radialSegments;
    const upper = lower + radialSegments;
    for (let segment = 0; segment < radialSegments; segment++) {
      const nextSegment = (segment + 1) % radialSegments;
      const a = lower + segment;
      const b = lower + nextSegment;
      const c = upper + nextSegment;
      const d = upper + segment;
      acc.indices.push(a, b, c, a, c, d);
    }
  }

  return {
    schemaVersion: 'holoscript.agent-avatar-upper-body-geometry.v1',
    profile: expressive
      ? 'expressive-anatomy-v7'
      : portrait
        ? 'portrait-anatomy-v6'
        : handSurface
          ? 'anatomical-hand-surface-v5'
          : deforming
            ? 'anatomical-deforming-hands-v4'
            : landmarked
              ? 'anatomical-hand-landmarks-v3'
              : anatomical
                ? 'anatomical-shoulder-neck-torso-v2'
                : 'coherent-shoulder-neck-torso-v1',
    radialSegments,
    ringCount: rings.length,
    shoulderHalfWidth: round6(Math.max(...rings.map((ring) => ring.radiusX)) * heightScale),
    waistHalfWidth: round6(rings[0].radiusX * heightScale),
    neckRadius: round6(rings[rings.length - 1].radiusX * heightScale),
    vertexRange: {
      vertexStart,
      vertexCount: acc.positions.length / 3 - vertexStart,
    },
    indexRange: {
      indexStart,
      indexCount: acc.indices.length - indexStart,
    },
  };
}

interface UpperLimbRing {
  center: Vec3;
  radiusY: number;
  radiusZ: number;
  jointName: string;
  /** V6-only scale for the superior half of a deltoid section. */
  superiorScale?: number;
  /** V4+ positive-Z thenar and negative-Z hypothenar silhouette expansion. */
  palmBulge?: { thenar: number; hypothenar: number };
}

function isFingerBone(name: string | null): boolean {
  return Boolean(
    name && /_(thumb|index|middle|ring|pinky)_(proximal|intermediate|distal)$/.test(name)
  );
}

interface ConvergedDigitRing {
  center: Vec3;
  radiusY: number;
  radiusZ: number;
  jointName: string;
  phase: number;
}

interface ConvergedDigitLayout {
  baseRadius: number;
  tipRadius: number;
  crossSectionExponent: 2 | 2.35;
  rings: readonly ConvergedDigitRing[];
}

/**
 * V3-only bind-space digit loft. Compatibility profiles keep the original five
 * circular rings byte-for-byte; this denser layout is shared with the nail
 * attachment sampler so the keratin underside follows the emitted skin surface.
 */
function buildConvergedDigitLayout(
  side: 'left' | 'right',
  digit: AgentAvatarDigitName,
  bindWorld: Map<string, Mat4>,
  buildScale: number,
  shoulderScale: number,
  detailedHandSurface = false
): ConvergedDigitLayout {
  const direction = side === 'left' ? 1 : -1;
  const boneName = (segment: 'proximal' | 'intermediate' | 'distal') =>
    `${side}_${digit}_${segment}`;
  const scaledBindPoint = (bone: string): Vec3 => {
    const point = getTranslation(bindWorld.get(bone)!);
    return { x: point.x * shoulderScale, y: point.y, z: point.z };
  };
  const proximal = scaledBindPoint(boneName('proximal'));
  const intermediate = scaledBindPoint(boneName('intermediate'));
  const distal = scaledBindPoint(boneName('distal'));
  const distalLength =
    HUMANOID_65_SKELETON.find((bone) => bone.name === boneName('distal'))?.length ?? 0.018;
  const tip = {
    x: distal.x + direction * distalLength * shoulderScale,
    y: distal.y,
    z: distal.z,
  };
  const radiusScale: Record<AgentAvatarDigitName, number> = {
    thumb: 1.18,
    index: 1.02,
    middle: 1.08,
    ring: 1,
    pinky: 0.86,
  };
  const fan: Record<AgentAvatarDigitName, number> = {
    thumb: 0.0045,
    index: 0.0015,
    middle: 0,
    ring: -0.0012,
    pinky: -0.003,
  };
  const baseRadius = 0.0106 * buildScale * shoulderScale * radiusScale[digit];
  const tipRadius = baseRadius * (detailedHandSurface ? 0.46 : 0.52);
  const web = {
    x: proximal.x - direction * baseRadius * 1.1,
    y: proximal.y,
    z: proximal.z,
  };
  const shapeCenter = (center: Vec3, phase: number): Vec3 => ({
    x: center.x,
    y: center.y + (digit === 'thumb' ? -0.004 * phase : 0.0015 * Math.sin(phase * 0.9)),
    z: center.z + fan[digit] * phase,
  });
  const convergedSamples: Array<{
    center: Vec3;
    phase: number;
    radiusRatio: number;
    jointName: string;
  }> = [
    { center: web, phase: 0, radiusRatio: 1.08, jointName: `${side}_hand` },
    {
      center: midpoint(web, proximal, 0.55),
      phase: 0.55,
      radiusRatio: 1.045,
      jointName: boneName('proximal'),
    },
    { center: proximal, phase: 1, radiusRatio: 1, jointName: boneName('proximal') },
    {
      center: midpoint(proximal, intermediate, 0.45),
      phase: 1.45,
      radiusRatio: 0.92,
      jointName: boneName('proximal'),
    },
    {
      center: intermediate,
      phase: 2,
      radiusRatio: 0.85,
      jointName: boneName('intermediate'),
    },
    {
      center: midpoint(intermediate, distal, 0.48),
      phase: 2.48,
      radiusRatio: 0.78,
      jointName: boneName('intermediate'),
    },
    { center: distal, phase: 3, radiusRatio: 0.71, jointName: boneName('distal') },
    {
      center: midpoint(distal, tip, 0.58),
      phase: 3.58,
      radiusRatio: 0.62,
      jointName: boneName('distal'),
    },
    { center: tip, phase: 4, radiusRatio: 0.52, jointName: boneName('distal') },
  ];
  const detailedSamples: typeof convergedSamples = [
    { center: web, phase: 0, radiusRatio: 1.08, jointName: `${side}_hand` },
    {
      center: midpoint(web, proximal, 0.45),
      phase: 0.45,
      radiusRatio: 1.04,
      jointName: boneName('proximal'),
    },
    { center: proximal, phase: 1, radiusRatio: 1.03, jointName: boneName('proximal') },
    {
      center: midpoint(proximal, intermediate, 0.28),
      phase: 1.28,
      radiusRatio: 0.94,
      jointName: boneName('proximal'),
    },
    {
      center: midpoint(proximal, intermediate, 0.62),
      phase: 1.62,
      radiusRatio: 0.88,
      jointName: boneName('proximal'),
    },
    {
      center: midpoint(proximal, intermediate, 0.88),
      phase: 1.88,
      radiusRatio: 0.92,
      jointName: boneName('proximal'),
    },
    {
      center: intermediate,
      phase: 2,
      radiusRatio: 0.95,
      jointName: boneName('intermediate'),
    },
    {
      center: midpoint(intermediate, distal, 0.18),
      phase: 2.18,
      radiusRatio: 0.88,
      jointName: boneName('intermediate'),
    },
    {
      center: midpoint(intermediate, distal, 0.52),
      phase: 2.52,
      radiusRatio: 0.79,
      jointName: boneName('intermediate'),
    },
    {
      center: midpoint(intermediate, distal, 0.84),
      phase: 2.84,
      radiusRatio: 0.77,
      jointName: boneName('intermediate'),
    },
    { center: distal, phase: 3, radiusRatio: 0.8, jointName: boneName('distal') },
    {
      center: midpoint(distal, tip, 0.28),
      phase: 3.28,
      radiusRatio: 0.7,
      jointName: boneName('distal'),
    },
    {
      center: midpoint(distal, tip, 0.62),
      phase: 3.62,
      radiusRatio: 0.57,
      jointName: boneName('distal'),
    },
    { center: tip, phase: 4, radiusRatio: 0.46, jointName: boneName('distal') },
  ];
  const samples = detailedHandSurface ? detailedSamples : convergedSamples;
  return {
    baseRadius,
    tipRadius,
    crossSectionExponent: detailedHandSurface ? 2.35 : 2,
    rings: samples.map((sample) => ({
      center: shapeCenter(sample.center, sample.phase),
      radiusY:
        baseRadius *
        sample.radiusRatio *
        (detailedHandSurface ? 0.82 + 0.05 * (1 - sample.phase / 4) : 0.88),
      radiusZ: baseRadius * sample.radiusRatio,
      jointName: sample.jointName,
      phase: sample.phase,
    })),
  };
}

function sampleConvergedDigitLayout(
  layout: ConvergedDigitLayout,
  phase: number
): ConvergedDigitRing {
  const boundedPhase = Math.max(
    layout.rings[0].phase,
    Math.min(layout.rings[layout.rings.length - 1].phase, phase)
  );
  const upperIndex = Math.max(
    1,
    layout.rings.findIndex((ring) => ring.phase >= boundedPhase)
  );
  const lower = layout.rings[upperIndex - 1];
  const upper = layout.rings[upperIndex];
  const span = Math.max(1e-6, upper.phase - lower.phase);
  const t = (boundedPhase - lower.phase) / span;
  return {
    center: midpoint(lower.center, upper.center, t),
    radiusY: lower.radiusY + (upper.radiusY - lower.radiusY) * t,
    radiusZ: lower.radiusZ + (upper.radiusZ - lower.radiusZ) * t,
    jointName: upper.jointName,
    phase: boundedPhase,
  };
}

function pushArticulatedDigit(
  acc: MeshAccum,
  side: 'left' | 'right',
  digit: AgentAvatarDigitName,
  radialSegments: number,
  bindWorld: Map<string, Mat4>,
  buildScale: number,
  shoulderScale: number,
  heightScale: number,
  converged: boolean,
  detailedHandSurface = false
): AgentAvatarDigitGeometryReceipt {
  const direction = side === 'left' ? 1 : -1;
  const boneName = (segment: 'proximal' | 'intermediate' | 'distal') =>
    `${side}_${digit}_${segment}`;
  const scaledBindPoint = (bone: string): Vec3 => {
    const point = getTranslation(bindWorld.get(bone)!);
    return { x: point.x * shoulderScale, y: point.y, z: point.z };
  };
  const proximal = scaledBindPoint(boneName('proximal'));
  const intermediate = scaledBindPoint(boneName('intermediate'));
  const distal = scaledBindPoint(boneName('distal'));
  const distalLength =
    HUMANOID_65_SKELETON.find((bone) => bone.name === boneName('distal'))?.length ?? 0.018;
  const tip = {
    x: distal.x + direction * distalLength * shoulderScale,
    y: distal.y,
    z: distal.z,
  };
  const radiusScale: Record<AgentAvatarDigitName, number> = {
    thumb: 1.18,
    index: 1.02,
    middle: 1.08,
    ring: 1,
    pinky: 0.86,
  };
  const baseRadius = 0.0106 * buildScale * shoulderScale * radiusScale[digit];
  const web = {
    x: proximal.x - direction * baseRadius * 1.1,
    y: proximal.y,
    z: proximal.z,
  };
  const fan: Record<AgentAvatarDigitName, number> = {
    thumb: 0.0045,
    index: 0.0015,
    middle: 0,
    ring: -0.0012,
    pinky: -0.003,
  };
  const shapeCenter = (center: Vec3, index: number): Vec3 => ({
    x: center.x,
    y: center.y + (digit === 'thumb' ? -0.004 * index : 0.0015 * Math.sin(index * 0.9)),
    z: center.z + fan[digit] * index,
  });
  const convergedLayout = converged
    ? buildConvergedDigitLayout(
        side,
        digit,
        bindWorld,
        buildScale,
        shoulderScale,
        detailedHandSurface
      )
    : undefined;
  const tipRadius = convergedLayout?.tipRadius ?? baseRadius * 0.5;
  const legacyCenters = [web, proximal, intermediate, distal, tip].map(shapeCenter);
  const legacyRadii = [
    baseRadius * 1.06,
    baseRadius,
    baseRadius * 0.82,
    baseRadius * 0.67,
    tipRadius,
  ];
  const legacyJoints = [
    `${side}_hand`,
    boneName('proximal'),
    boneName('intermediate'),
    boneName('distal'),
    boneName('distal'),
  ];
  const centers = convergedLayout
    ? convergedLayout.rings.map((ring) => ring.center)
    : legacyCenters;
  const radiiY = convergedLayout ? convergedLayout.rings.map((ring) => ring.radiusY) : legacyRadii;
  const radiiZ = convergedLayout ? convergedLayout.rings.map((ring) => ring.radiusZ) : legacyRadii;
  const joints = convergedLayout
    ? convergedLayout.rings.map((ring) => ring.jointName)
    : legacyJoints;
  const vertexStart = acc.positions.length / 3;
  const indexStart = acc.indices.length;

  for (let ringIndex = 0; ringIndex < centers.length; ringIndex++) {
    const center = centers[ringIndex];
    const jointIndex = BONE_INDEX.get(joints[ringIndex]) ?? 0;
    const previousCenter = centers[Math.max(0, ringIndex - 1)];
    const nextCenter = centers[Math.min(centers.length - 1, ringIndex + 1)];
    const centerlineTangent = normalize(sub(nextCenter, previousCenter));
    const previousRadius =
      (radiiY[Math.max(0, ringIndex - 1)] + radiiZ[Math.max(0, ringIndex - 1)]) * 0.5;
    const nextRadius =
      (radiiY[Math.min(radiiY.length - 1, ringIndex + 1)] +
        radiiZ[Math.min(radiiZ.length - 1, ringIndex + 1)]) *
      0.5;
    const radiusSlope =
      (nextRadius - previousRadius) / Math.max(1e-6, distance(previousCenter, nextCenter));
    for (let segment = 0; segment < radialSegments; segment++) {
      const theta = (segment / radialSegments) * Math.PI * 2;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const sectionExponent = convergedLayout?.crossSectionExponent ?? 2;
      const sectionY = detailedHandSurface
        ? Math.sign(cosine) * Math.pow(Math.abs(cosine), 2 / sectionExponent)
        : cosine;
      const sectionZ = detailedHandSurface
        ? Math.sign(sine) * Math.pow(Math.abs(sine), 2 / sectionExponent)
        : sine;
      acc.positions.push(
        center.x,
        center.y + radiiY[ringIndex] * sectionY,
        center.z + radiiZ[ringIndex] * sectionZ
      );
      if (converged) {
        const radialNormal = detailedHandSurface
          ? normalize({
              x: 0,
              y:
                (Math.sign(sectionY) * Math.pow(Math.abs(sectionY), sectionExponent - 1)) /
                Math.max(1e-6, radiiY[ringIndex]),
              z:
                (Math.sign(sectionZ) * Math.pow(Math.abs(sectionZ), sectionExponent - 1)) /
                Math.max(1e-6, radiiZ[ringIndex]),
            })
          : normalize({
              x: 0,
              y: cosine / Math.max(1e-6, radiiY[ringIndex]),
              z: sine / Math.max(1e-6, radiiZ[ringIndex]),
            });
        const normal = normalize(sub(radialNormal, scale(centerlineTangent, radiusSlope)));
        acc.normals.push(normal.x, normal.y, normal.z);
        acc.tangents.push(centerlineTangent.x, centerlineTangent.y, centerlineTangent.z, 1);
      } else {
        acc.normals.push(0, cosine, sine);
        acc.tangents.push(direction, 0, 0, 1);
      }
      acc.jointIndices.push(jointIndex);
      acc.jointWeights.push(1);
    }
  }

  for (let ringIndex = 0; ringIndex < centers.length - 1; ringIndex++) {
    const inner = vertexStart + ringIndex * radialSegments;
    const outer = inner + radialSegments;
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      acc.indices.push(
        inner + segment,
        inner + next,
        outer + next,
        inner + segment,
        outer + next,
        outer + segment
      );
    }
  }

  const capVertex = acc.positions.length / 3;
  const capCenter = centers[centers.length - 1];
  const capJoint = BONE_INDEX.get(boneName('distal')) ?? 0;
  acc.positions.push(capCenter.x, capCenter.y, capCenter.z);
  acc.normals.push(direction, 0, 0);
  acc.tangents.push(0, 1, 0, 1);
  acc.jointIndices.push(capJoint);
  acc.jointWeights.push(1);
  const lastRing = vertexStart + (centers.length - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    acc.indices.push(capVertex, lastRing + segment, lastRing + next);
  }

  let totalLength = 0;
  for (let index = converged ? 3 : 2; index < centers.length; index++) {
    totalLength += distance(centers[index - 1], centers[index]);
  }
  return {
    schemaVersion: 'holoscript.agent-avatar-digit-geometry.v1',
    profile: detailedHandSurface
      ? 'tapered-superellipse-three-phalanx-v3'
      : converged
        ? 'volume-preserving-three-phalanx-v2'
        : 'articulated-three-phalanx-v1',
    side,
    digit,
    radialSegments,
    ringCount: centers.length,
    phalanxSegmentCount: 3,
    webBlendRingCount: converged ? 2 : 1,
    ...(detailedHandSurface
      ? {
          jointVolumeBlendRingCount: 6,
          minimumJointRadiusRatio: 0.57,
          maximumAdjacentRadiusDrop: 0.13,
          crossSectionAspectRatio: 0.87,
          crossSectionExponent: 2.35,
          knuckleVolumeRingCount: 3,
        }
      : converged
        ? {
            jointVolumeBlendRingCount: 4,
            minimumJointRadiusRatio: 0.62,
            maximumAdjacentRadiusDrop: 0.1,
            crossSectionAspectRatio: 0.88,
          }
        : {}),
    totalLength: round6(totalLength * heightScale),
    baseRadius: round6(baseRadius * heightScale),
    tipRadius: round6(tipRadius * heightScale),
    vertexRange: {
      vertexStart,
      vertexCount: acc.positions.length / 3 - vertexStart,
    },
    indexRange: {
      indexStart,
      indexCount: acc.indices.length - indexStart,
    },
  };
}

interface HandLandmarkShape {
  side: 'left' | 'right';
  kind: AgentAvatarHandLandmarkKind;
  center: Vec3;
  radii: Vec3;
  jointName: string;
  materialRole: AgentAvatarHandLandmarkGeometryReceipt['materialRole'];
  digit?: AgentAvatarDigitName;
  betweenDigits?: readonly [AgentAvatarDigitName, AgentAvatarDigitName];
  integratedKnuckle?: boolean;
}

function pushHandLandmarkEllipsoid(
  acc: MeshAccum,
  shape: HandLandmarkShape
): AgentAvatarHandLandmarkGeometryReceipt {
  const radialSegments = 8;
  const verticalSegments = 4;
  const jointIndex = BONE_INDEX.get(shape.jointName) ?? 0;
  const vertexStart = acc.positions.length / 3;
  const indexStart = acc.indices.length;
  const pushVertex = (position: Vec3, normal: Vec3, tangent: Vec3): void => {
    acc.positions.push(position.x, position.y, position.z);
    acc.normals.push(normal.x, normal.y, normal.z);
    acc.tangents.push(tangent.x, tangent.y, tangent.z, 1);
    acc.jointIndices.push(jointIndex);
    acc.jointWeights.push(1);
  };

  pushVertex(
    { x: shape.center.x, y: shape.center.y + shape.radii.y, z: shape.center.z },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 }
  );
  for (let latitude = 1; latitude < verticalSegments; latitude++) {
    const phi = (latitude / verticalSegments) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let segment = 0; segment < radialSegments; segment++) {
      const theta = (segment / radialSegments) * Math.PI * 2;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const offset = {
        x: shape.radii.x * sinPhi * cosine,
        y: shape.radii.y * cosPhi,
        z: shape.radii.z * sinPhi * sine,
      };
      pushVertex(
        add(shape.center, offset),
        normalize({
          x: offset.x / Math.max(1e-6, shape.radii.x * shape.radii.x),
          y: offset.y / Math.max(1e-6, shape.radii.y * shape.radii.y),
          z: offset.z / Math.max(1e-6, shape.radii.z * shape.radii.z),
        }),
        normalize({ x: -sine, y: 0, z: cosine })
      );
    }
  }
  const bottomVertex = acc.positions.length / 3;
  pushVertex(
    { x: shape.center.x, y: shape.center.y - shape.radii.y, z: shape.center.z },
    { x: 0, y: -1, z: 0 },
    { x: 1, y: 0, z: 0 }
  );

  const firstRing = vertexStart + 1;
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    acc.indices.push(vertexStart, firstRing + segment, firstRing + next);
  }
  for (let latitude = 0; latitude < verticalSegments - 2; latitude++) {
    const upper = firstRing + latitude * radialSegments;
    const lower = upper + radialSegments;
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      acc.indices.push(
        upper + segment,
        lower + segment,
        lower + next,
        upper + segment,
        lower + next,
        upper + next
      );
    }
  }
  const lastRing = firstRing + (verticalSegments - 2) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    acc.indices.push(bottomVertex, lastRing + next, lastRing + segment);
  }

  return {
    schemaVersion: 'holoscript.agent-avatar-hand-landmark-geometry.v1',
    profile: shape.integratedKnuckle
      ? 'integrated-metacarpal-knuckle-v2'
      : 'anatomical-hand-landmark-v1',
    side: shape.side,
    kind: shape.kind,
    materialRole: shape.materialRole,
    jointName: shape.jointName,
    ...(shape.digit ? { digit: shape.digit } : {}),
    ...(shape.betweenDigits ? { betweenDigits: shape.betweenDigits } : {}),
    vertexRange: {
      vertexStart,
      vertexCount: acc.positions.length / 3 - vertexStart,
    },
    indexRange: {
      indexStart,
      indexCount: acc.indices.length - indexStart,
    },
  };
}

function pushHandWebPatch(
  acc: MeshAccum,
  shape: HandLandmarkShape
): AgentAvatarHandLandmarkGeometryReceipt {
  const radialSegments = 12;
  const ringOffsets = [-1, -0.38, 0.38, 1] as const;
  const radiusFactors = [0.56, 1, 1, 0.56] as const;
  const jointIndex = BONE_INDEX.get(shape.jointName) ?? 0;
  const vertexStart = acc.positions.length / 3;
  const indexStart = acc.indices.length;
  const pushVertex = (position: Vec3, normal: Vec3): number => {
    const vertex = acc.positions.length / 3;
    acc.positions.push(position.x, position.y, position.z);
    acc.normals.push(normal.x, normal.y, normal.z);
    acc.tangents.push(0, 0, 1, 1);
    acc.jointIndices.push(jointIndex);
    acc.jointWeights.push(1);
    return vertex;
  };

  for (let ringIndex = 0; ringIndex < ringOffsets.length; ringIndex++) {
    const factor = radiusFactors[ringIndex];
    for (let segment = 0; segment < radialSegments; segment++) {
      const theta = (segment / radialSegments) * Math.PI * 2;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const offset = {
        x: shape.radii.x * factor * cosine,
        y: shape.radii.y * factor * sine,
        z: shape.radii.z * ringOffsets[ringIndex],
      };
      pushVertex(
        add(shape.center, offset),
        normalize({
          x: cosine / Math.max(1e-6, shape.radii.x * factor),
          y: sine / Math.max(1e-6, shape.radii.y * factor),
          z: ringOffsets[ringIndex] * 0.32,
        })
      );
    }
  }

  for (let ringIndex = 0; ringIndex < ringOffsets.length - 1; ringIndex++) {
    const lower = vertexStart + ringIndex * radialSegments;
    const upper = lower + radialSegments;
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      acc.indices.push(
        lower + segment,
        lower + next,
        upper + next,
        lower + segment,
        upper + next,
        upper + segment
      );
    }
  }

  const lowerCap = pushVertex(
    { x: shape.center.x, y: shape.center.y, z: shape.center.z - shape.radii.z },
    { x: 0, y: 0, z: -1 }
  );
  const upperCap = pushVertex(
    { x: shape.center.x, y: shape.center.y, z: shape.center.z + shape.radii.z },
    { x: 0, y: 0, z: 1 }
  );
  const firstRing = vertexStart;
  const lastRing = vertexStart + (ringOffsets.length - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    acc.indices.push(lowerCap, firstRing + next, firstRing + segment);
    acc.indices.push(upperCap, lastRing + segment, lastRing + next);
  }

  return {
    schemaVersion: 'holoscript.agent-avatar-hand-landmark-geometry.v1',
    profile: 'volumetric-interdigital-web-v2',
    side: shape.side,
    kind: shape.kind,
    materialRole: shape.materialRole,
    jointName: shape.jointName,
    blendRingCount: ringOffsets.length,
    ...(shape.digit ? { digit: shape.digit } : {}),
    ...(shape.betweenDigits ? { betweenDigits: shape.betweenDigits } : {}),
    vertexRange: {
      vertexStart,
      vertexCount: acc.positions.length / 3 - vertexStart,
    },
    indexRange: {
      indexStart,
      indexCount: acc.indices.length - indexStart,
    },
  };
}

/**
 * Append a closed, two-layer interdigital saddle. Unlike the V3 tube, the distal
 * free margin recedes toward the palm at the middle of the gap, producing the
 * concave U silhouette visible between neighboring fingers.
 */
function pushConcaveHandCommissure(
  acc: MeshAccum,
  shape: HandLandmarkShape,
  buildScale: number,
  heightScale: number
): AgentAvatarHandLandmarkGeometryReceipt {
  const rows = 5;
  const columns = 7;
  const direction = shape.side === 'left' ? 1 : -1;
  const jointIndex = BONE_INDEX.get(shape.jointName) ?? 0;
  const vertexStart = acc.positions.length / 3;
  const indexStart = acc.indices.length;
  const saddleDepth = 0.0045 * buildScale;
  const layerThickness = 0.0014 * buildScale;

  for (let layer = 0; layer < 2; layer++) {
    const layerSign = layer === 0 ? -1 : 1;
    for (let row = 0; row < rows; row++) {
      const longitudinal = row / (rows - 1);
      for (let column = 0; column < columns; column++) {
        const across = -1 + (column / (columns - 1)) * 2;
        const centerRecession = (1 - Math.abs(across)) * longitudinal;
        const rimLift = 0.35 + 0.65 * Math.abs(across);
        const position = {
          x:
            shape.center.x +
            direction *
              (shape.radii.x * (-0.72 + longitudinal * 1.44) - saddleDepth * centerRecession),
          y:
            shape.center.y -
            shape.radii.y * centerRecession +
            layerSign * layerThickness * 0.5 * rimLift,
          z: shape.center.z + shape.radii.z * across,
        };
        const normal = normalize({
          x: -direction * centerRecession * 0.22,
          y: layerSign,
          z: across * 0.18,
        });
        acc.positions.push(position.x, position.y, position.z);
        acc.normals.push(normal.x, normal.y, normal.z);
        acc.tangents.push(direction, 0, 0, 1);
        acc.jointIndices.push(jointIndex);
        acc.jointWeights.push(1);
      }
    }
  }

  const layerVertexCount = rows * columns;
  const pushGrid = (layerOffset: number, top: boolean): void => {
    for (let row = 0; row < rows - 1; row++) {
      for (let column = 0; column < columns - 1; column++) {
        const a = vertexStart + layerOffset + row * columns + column;
        const b = a + 1;
        const d = a + columns;
        const c = d + 1;
        const forward = (shape.side === 'left') === top;
        acc.indices.push(...(forward ? [a, b, c, a, c, d] : [a, d, c, a, c, b]));
      }
    }
  };
  pushGrid(0, false);
  pushGrid(layerVertexCount, true);

  const perimeter: number[] = [];
  for (let column = 0; column < columns; column++) perimeter.push(column);
  for (let row = 1; row < rows; row++) perimeter.push(row * columns + columns - 1);
  for (let column = columns - 2; column >= 0; column--) {
    perimeter.push((rows - 1) * columns + column);
  }
  for (let row = rows - 2; row > 0; row--) perimeter.push(row * columns);
  for (let edge = 0; edge < perimeter.length; edge++) {
    const next = (edge + 1) % perimeter.length;
    const bottomA = vertexStart + perimeter[edge];
    const bottomB = vertexStart + perimeter[next];
    const topA = bottomA + layerVertexCount;
    const topB = bottomB + layerVertexCount;
    acc.indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
  }

  return {
    schemaVersion: 'holoscript.agent-avatar-hand-landmark-geometry.v1',
    profile: 'concave-interdigital-commissure-v3',
    side: shape.side,
    kind: shape.kind,
    materialRole: shape.materialRole,
    jointName: shape.jointName,
    blendRingCount: rows,
    surfaceRows: rows,
    surfaceColumns: columns,
    saddleDepth: round6(saddleDepth * heightScale),
    ...(shape.betweenDigits ? { betweenDigits: shape.betweenDigits } : {}),
    vertexRange: {
      vertexStart,
      vertexCount: acc.positions.length / 3 - vertexStart,
    },
    indexRange: {
      indexStart,
      indexCount: acc.indices.length - indexStart,
    },
  };
}

function pushAttachedNailPlate(
  acc: MeshAccum,
  side: 'left' | 'right',
  digit: AgentAvatarDigitName,
  bindWorld: Map<string, Mat4>,
  buildScale: number,
  shoulderScale: number,
  heightScale: number,
  digitRadialSegments: number,
  detailedHandSurface = false
): AgentAvatarHandLandmarkGeometryReceipt {
  const layout = buildConvergedDigitLayout(
    side,
    digit,
    bindWorld,
    buildScale,
    shoulderScale,
    detailedHandSurface
  );
  const longitudinalPhases: readonly number[] = detailedHandSurface
    ? [3.04, 3.18, 3.34, 3.52, 3.68, 3.82, 3.92]
    : [3.12, 3.3, 3.5, 3.68, 3.84];
  const transverseSamples: readonly number[] = detailedHandSurface
    ? [-1, -0.666667, -0.333333, 0, 0.333333, 0.666667, 1]
    : [-1, -0.5, 0, 0.5, 1];
  const widthEnvelope: readonly number[] = detailedHandSurface
    ? [0.64, 0.82, 0.96, 1, 0.99, 0.94, 0.82]
    : [0.82, 0.96, 1, 0.98, 0.88];
  const widthRatio = digit === 'thumb' ? 0.64 : 0.6;
  const embedDepth = 0.00018 * buildScale;
  const freeEdgeThickness = (digit === 'thumb' ? 0.00115 : 0.00095) * buildScale;
  const jointName = `${side}_${digit}_distal`;
  const jointIndex = BONE_INDEX.get(jointName) ?? 0;
  const vertexStart = acc.positions.length / 3;
  const indexStart = acc.indices.length;
  const columns = transverseSamples.length;
  const rows = longitudinalPhases.length;

  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row < rows; row++) {
      const sample = sampleConvergedDigitLayout(layout, longitudinalPhases[row]);
      for (let column = 0; column < columns; column++) {
        const across = transverseSamples[column];
        const zOffset = sample.radiusZ * widthRatio * widthEnvelope[row] * across;
        const normalizedZ = Math.min(1, Math.abs(zOffset) / Math.max(1e-6, sample.radiusZ));
        const quadrantSegments = Math.ceil(digitRadialSegments / 4);
        let dorsalRatio = 0;
        for (let segment = 0; segment < quadrantSegments; segment++) {
          const thetaA = (segment / digitRadialSegments) * Math.PI * 2;
          const thetaB = ((segment + 1) / digitRadialSegments) * Math.PI * 2;
          const zA = Math.sin(thetaA);
          const zB = Math.sin(thetaB);
          if (normalizedZ <= zB || segment === quadrantSegments - 1) {
            const t = (normalizedZ - zA) / Math.max(1e-6, zB - zA);
            dorsalRatio = Math.cos(thetaA) + (Math.cos(thetaB) - Math.cos(thetaA)) * t;
            break;
          }
        }
        const skinSurfaceY = sample.center.y + sample.radiusY * Math.max(0, dorsalRatio);
        const cuticleTaper = detailedHandSurface
          ? row === 0
            ? 0.56
            : row === 1
              ? 0.8
              : 1
          : row === 0
            ? 0.72
            : row === 1
              ? 0.92
              : 1;
        const freeEdgeLift = detailedHandSurface && row === rows - 1 ? freeEdgeThickness * 0.08 : 0;
        const camber = layer === 1 ? freeEdgeThickness * 0.12 * (1 - across * across) : 0;
        const position = {
          x: sample.center.x,
          y:
            skinSurfaceY -
            embedDepth +
            (layer === 1 ? freeEdgeThickness * cuticleTaper + camber + freeEdgeLift : 0),
          z: sample.center.z + zOffset,
        };
        acc.positions.push(position.x, position.y, position.z);
        acc.normals.push(0, layer === 1 ? 1 : -1, 0);
        acc.tangents.push(side === 'left' ? 1 : -1, 0, 0, 1);
        acc.jointIndices.push(jointIndex);
        acc.jointWeights.push(1);
      }
    }
  }

  const layerVertexCount = rows * columns;
  const pushGrid = (layerOffset: number, top: boolean): void => {
    for (let row = 0; row < rows - 1; row++) {
      for (let column = 0; column < columns - 1; column++) {
        const a = vertexStart + layerOffset + row * columns + column;
        const b = a + 1;
        const d = a + columns;
        const c = d + 1;
        const forward = (side === 'left') === top;
        acc.indices.push(...(forward ? [a, b, c, a, c, d] : [a, d, c, a, c, b]));
      }
    }
  };
  pushGrid(0, false);
  pushGrid(layerVertexCount, true);

  const perimeter: number[] = [];
  for (let column = 0; column < columns; column++) perimeter.push(column);
  for (let row = 1; row < rows; row++) perimeter.push(row * columns + columns - 1);
  for (let column = columns - 2; column >= 0; column--) {
    perimeter.push((rows - 1) * columns + column);
  }
  for (let row = rows - 2; row > 0; row--) perimeter.push(row * columns);
  for (let edge = 0; edge < perimeter.length; edge++) {
    const next = (edge + 1) % perimeter.length;
    const bottomA = vertexStart + perimeter[edge];
    const bottomB = vertexStart + perimeter[next];
    const topA = bottomA + layerVertexCount;
    const topB = bottomB + layerVertexCount;
    acc.indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
  }

  return {
    schemaVersion: 'holoscript.agent-avatar-hand-landmark-geometry.v1',
    profile: detailedHandSurface
      ? 'cuticle-contoured-nail-plate-v3'
      : 'surface-conforming-nail-plate-v2',
    side,
    kind: 'nail-plate',
    digit,
    materialRole: 'keratin-nail',
    jointName,
    attachment: 'distal-phalanx-surface-conforming-v1',
    attachmentSampleCount: layerVertexCount,
    surfaceEmbedDepth: round6(embedDepth * heightScale),
    freeEdgeThickness: round6(freeEdgeThickness * heightScale),
    ...(detailedHandSurface
      ? {
          surfaceRows: rows,
          surfaceColumns: columns,
          cuticleInsetRatio: 0.36,
          freeEdgeInsetRatio: 0.18,
        }
      : {}),
    vertexRange: {
      vertexStart,
      vertexCount: acc.positions.length / 3 - vertexStart,
    },
    indexRange: {
      indexStart,
      indexCount: acc.indices.length - indexStart,
    },
  };
}

function pushHandLandmarks(
  acc: MeshAccum,
  side: 'left' | 'right',
  bindWorld: Map<string, Mat4>,
  buildScale: number,
  shoulderScale: number,
  heightScale: number,
  digitRadialSegments: number,
  detailedHandSurface = false
): AgentAvatarHandLandmarkGeometryReceipt[] {
  const direction = side === 'left' ? 1 : -1;
  const scaleXZ = buildScale * shoulderScale;
  const scaledBindPoint = (bone: string): Vec3 => {
    const point = getTranslation(bindWorld.get(bone)!);
    return { x: point.x * shoulderScale, y: point.y, z: point.z };
  };
  const proximal = (digit: AgentAvatarDigitName): Vec3 =>
    scaledBindPoint(`${side}_${digit}_proximal`);
  const wrist = scaledBindPoint(`${side}_hand`);
  const landmarks: AgentAvatarHandLandmarkGeometryReceipt[] = [];
  const webPairs: Array<readonly [AgentAvatarDigitName, AgentAvatarDigitName]> = [
    ['thumb', 'index'],
    ['index', 'middle'],
    ['middle', 'ring'],
    ['ring', 'pinky'],
  ];
  for (const pair of webPairs) {
    const a = proximal(pair[0]);
    const b = proximal(pair[1]);
    const center = midpoint(a, b, 0.5);
    const shape: HandLandmarkShape = {
      side,
      kind: 'interdigital-web',
      center: {
        x: center.x - direction * 0.008 * scaleXZ,
        y: center.y - 0.001,
        z: center.z,
      },
      radii: {
        x: 0.012 * scaleXZ,
        y: 0.0035 * buildScale,
        z: Math.max(0.0045 * buildScale, Math.abs(a.z - b.z) * 0.38),
      },
      jointName: `${side}_hand`,
      materialRole: 'skin',
      betweenDigits: pair,
    };
    landmarks.push(
      detailedHandSurface
        ? pushConcaveHandCommissure(acc, shape, buildScale, heightScale)
        : pushHandWebPatch(acc, shape)
    );
  }
  for (const digit of AGENT_AVATAR_DIGIT_NAMES) {
    const center = proximal(digit);
    landmarks.push(
      pushHandLandmarkEllipsoid(acc, {
        side,
        kind: 'metacarpal-knuckle',
        center: {
          x: center.x - direction * 0.005 * scaleXZ,
          y: center.y + (detailedHandSurface ? 0.0072 : 0.0085) * buildScale,
          z: center.z,
        },
        radii: {
          x:
            (digit === 'thumb'
              ? detailedHandSurface
                ? 0.0102
                : 0.009
              : detailedHandSurface
                ? 0.0125
                : 0.0115) * scaleXZ,
          y: (detailedHandSurface ? 0.0068 : 0.006) * buildScale,
          z:
            (digit === 'thumb'
              ? detailedHandSurface
                ? 0.0102
                : 0.0095
              : detailedHandSurface
                ? 0.0118
                : 0.011) * buildScale,
        },
        jointName: `${side}_${digit}_proximal`,
        materialRole: 'skin',
        digit,
        integratedKnuckle: detailedHandSurface,
      })
    );
  }
  for (const digit of AGENT_AVATAR_DIGIT_NAMES.filter((name) => name !== 'thumb')) {
    const center = midpoint(wrist, proximal(digit), 0.62);
    landmarks.push(
      pushHandLandmarkEllipsoid(acc, {
        side,
        kind: 'dorsal-tendon-ridge',
        center: {
          x: center.x,
          y: center.y + 0.022 * buildScale,
          z: center.z,
        },
        radii: {
          x: 0.028 * scaleXZ,
          y: 0.0026 * buildScale,
          z: 0.0038 * buildScale,
        },
        jointName: `${side}_hand`,
        materialRole: 'skin',
        digit,
      })
    );
  }
  for (const digit of AGENT_AVATAR_DIGIT_NAMES) {
    landmarks.push(
      pushAttachedNailPlate(
        acc,
        side,
        digit,
        bindWorld,
        buildScale,
        shoulderScale,
        heightScale,
        digitRadialSegments,
        detailedHandSurface
      )
    );
  }
  return landmarks;
}

/**
 * Append one indexed shoulder-to-palm loft.
 *
 * The surface is continuous across the upper arm, elbow, forearm, wrist, and palm;
 * changing the ring's rigid joint binding at anatomical boundaries lets the existing
 * palette articulate it without restoring the old one-box-per-segment silhouette.
 */
function pushCoherentUpperLimb(
  acc: MeshAccum,
  side: 'left' | 'right',
  profile: Exclude<AgentAvatarUpperBodyProfile, 'legacy-segments-v1'>,
  radialSegments: number,
  bindWorld: Map<string, Mat4>,
  buildScale: number,
  shoulderScale: number,
  heightScale: number,
  scapularElevation = 0,
  scapularProtraction = 0
): AgentAvatarUpperLimbGeometryReceipt {
  const direction = side === 'left' ? 1 : -1;
  const anatomical = profile !== 'coherent-shoulder-neck-torso-v1';
  const expressive = profile === 'coherent-expressive-anatomy-v7';
  const portrait = profile === 'coherent-portrait-anatomy-v6' || expressive;
  const handSurface = profile === 'coherent-hand-surface-v5' || portrait;
  const deforming = profile === 'coherent-deforming-hands-v4' || handSurface;
  const landmarked = profile === 'coherent-hand-landmarks-v3' || deforming;
  const scaledBindPoint = (bone: string): Vec3 => {
    const point = getTranslation(bindWorld.get(bone)!);
    return { x: point.x * shoulderScale, y: point.y, z: point.z };
  };
  const elbow = scaledBindPoint(`${side}_forearm`);
  const wrist = scaledBindPoint(`${side}_hand`);
  const shoulderRadius =
    (portrait ? 0.082 : anatomical ? 0.075 : 0.065) * buildScale * shoulderScale;
  const wristRadius = 0.035 * buildScale * shoulderScale;
  const palmHalfWidth = 0.048 * buildScale * shoulderScale;
  const root: Vec3 = {
    x: direction * (portrait ? 0.202 : anatomical ? 0.218 : 0.225) * buildScale * shoulderScale,
    y:
      (portrait ? 1.394 : anatomical ? 1.397 : 1.405) +
      (expressive ? scapularElevation * 0.018 * buildScale : 0),
    z:
      (portrait ? 0.012 : anatomical ? 0.008 : 0.005) +
      (expressive ? scapularProtraction * 0.014 * buildScale : 0),
  };
  const palmEnd: Vec3 = {
    x: wrist.x + direction * 0.08 * buildScale * shoulderScale,
    y: wrist.y,
    z: wrist.z,
  };
  const midpoint = (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });
  const coherentRings: UpperLimbRing[] = [
    {
      center: root,
      radiusY: shoulderRadius,
      radiusZ: shoulderRadius,
      jointName: 'spine2',
    },
    {
      center: midpoint(root, elbow, 0.2),
      radiusY: shoulderRadius * 0.97,
      radiusZ: shoulderRadius * 0.94,
      jointName: `${side}_shoulder`,
    },
    {
      center: midpoint(root, elbow, 0.55),
      radiusY: shoulderRadius * 0.86,
      radiusZ: shoulderRadius * 0.82,
      jointName: `${side}_upper_arm`,
    },
    {
      center: elbow,
      radiusY: shoulderRadius * 0.77,
      radiusZ: shoulderRadius * 0.73,
      jointName: `${side}_upper_arm`,
    },
    {
      center: midpoint(elbow, wrist, 0.52),
      radiusY: shoulderRadius * 0.68,
      radiusZ: shoulderRadius * 0.64,
      jointName: `${side}_forearm`,
    },
    {
      center: wrist,
      radiusY: wristRadius,
      radiusZ: wristRadius * 0.94,
      jointName: `${side}_forearm`,
    },
    {
      center: midpoint(wrist, palmEnd, 0.48),
      radiusY: 0.029 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth,
      jointName: `${side}_hand`,
    },
    {
      center: palmEnd,
      radiusY: 0.024 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 0.92,
      jointName: `${side}_hand`,
    },
  ];
  const anatomicalArmRings: UpperLimbRing[] = [
    {
      center: root,
      radiusY: shoulderRadius * 1.06,
      radiusZ: shoulderRadius,
      jointName: 'spine2',
    },
    {
      center: {
        ...midpoint(root, elbow, 0.11),
        y: root.y + 0.012,
      },
      radiusY: shoulderRadius * 1.12,
      radiusZ: shoulderRadius * 1.05,
      jointName: `${side}_shoulder`,
    },
    {
      center: midpoint(root, elbow, 0.29),
      radiusY: shoulderRadius,
      radiusZ: shoulderRadius * 0.94,
      jointName: `${side}_upper_arm`,
    },
    {
      center: midpoint(root, elbow, 0.61),
      radiusY: shoulderRadius * 0.83,
      radiusZ: shoulderRadius * 0.78,
      jointName: `${side}_upper_arm`,
    },
    {
      center: elbow,
      radiusY: shoulderRadius * 0.73,
      radiusZ: shoulderRadius * 0.69,
      jointName: `${side}_upper_arm`,
    },
    {
      center: midpoint(elbow, wrist, 0.5),
      radiusY: shoulderRadius * 0.61,
      radiusZ: shoulderRadius * 0.57,
      jointName: `${side}_forearm`,
    },
    {
      center: wrist,
      radiusY: wristRadius,
      radiusZ: wristRadius * 0.92,
      jointName: `${side}_forearm`,
    },
  ];
  const portraitArmRings: UpperLimbRing[] = [
    {
      center: root,
      radiusY: shoulderRadius * 1.1,
      radiusZ: shoulderRadius * 1.04,
      jointName: 'spine2',
      superiorScale: 0.15,
    },
    {
      center: {
        ...midpoint(root, elbow, 0.06),
        y: root.y + 0.014,
        z: root.z + 0.004,
      },
      radiusY: shoulderRadius * 1.18,
      radiusZ: shoulderRadius * 1.1,
      jointName: `${side}_shoulder`,
      superiorScale: 0.4,
    },
    {
      center: {
        ...midpoint(root, elbow, 0.16),
        y: root.y + 0.01,
        z: root.z + 0.003,
      },
      radiusY: shoulderRadius * 1.15,
      radiusZ: shoulderRadius * 1.06,
      jointName: `${side}_shoulder`,
      superiorScale: 0.68,
    },
    {
      center: midpoint(root, elbow, 0.3),
      radiusY: shoulderRadius * 1.04,
      radiusZ: shoulderRadius * 0.98,
      jointName: `${side}_upper_arm`,
    },
    {
      center: midpoint(root, elbow, 0.5),
      radiusY: shoulderRadius * 0.92,
      radiusZ: shoulderRadius * 0.86,
      jointName: `${side}_upper_arm`,
    },
    {
      center: midpoint(root, elbow, 0.74),
      radiusY: shoulderRadius * 0.82,
      radiusZ: shoulderRadius * 0.77,
      jointName: `${side}_upper_arm`,
    },
    {
      center: elbow,
      radiusY: shoulderRadius * 0.73,
      radiusZ: shoulderRadius * 0.69,
      jointName: `${side}_upper_arm`,
    },
    {
      center: midpoint(elbow, wrist, 0.5),
      radiusY: shoulderRadius * 0.61,
      radiusZ: shoulderRadius * 0.57,
      jointName: `${side}_forearm`,
    },
    {
      center: wrist,
      radiusY: wristRadius,
      radiusZ: wristRadius * 0.92,
      jointName: `${side}_forearm`,
    },
  ];
  const v4PalmRings: UpperLimbRing[] = [
    ...anatomicalArmRings,
    {
      center: {
        ...midpoint(wrist, palmEnd, 0.18),
        y: wrist.y + 0.0015 * buildScale * shoulderScale,
        z: wrist.z + 0.0015 * buildScale * shoulderScale,
      },
      radiusY: 0.0315 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 0.9,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.055, hypothenar: 0.03 },
    },
    {
      center: {
        ...midpoint(wrist, palmEnd, 0.43),
        y: wrist.y + 0.004 * buildScale * shoulderScale,
        z: wrist.z + 0.0025 * buildScale * shoulderScale,
      },
      radiusY: 0.0325 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 1.045,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.12, hypothenar: 0.065 },
    },
    {
      center: {
        ...midpoint(wrist, palmEnd, 0.72),
        y: wrist.y + 0.0025 * buildScale * shoulderScale,
        z: wrist.z + 0.001 * buildScale * shoulderScale,
      },
      radiusY: 0.0285 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 1.02,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.085, hypothenar: 0.05 },
    },
    {
      center: palmEnd,
      radiusY: 0.024 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 0.94,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.025, hypothenar: 0.02 },
    },
  ];
  const v5PalmRings: UpperLimbRing[] = [
    ...anatomicalArmRings,
    {
      center: {
        ...midpoint(wrist, palmEnd, 0.1),
        y: wrist.y + 0.0008 * buildScale * shoulderScale,
        z: wrist.z + 0.0008 * buildScale * shoulderScale,
      },
      radiusY: 0.0335 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 0.82,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.035, hypothenar: 0.02 },
    },
    {
      center: {
        ...midpoint(wrist, palmEnd, 0.26),
        y: wrist.y + 0.0024 * buildScale * shoulderScale,
        z: wrist.z + 0.0018 * buildScale * shoulderScale,
      },
      radiusY: 0.0328 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 0.94,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.085, hypothenar: 0.045 },
    },
    {
      center: {
        ...midpoint(wrist, palmEnd, 0.44),
        y: wrist.y + 0.0042 * buildScale * shoulderScale,
        z: wrist.z + 0.0028 * buildScale * shoulderScale,
      },
      radiusY: 0.0324 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 1.05,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.125, hypothenar: 0.07 },
    },
    {
      center: {
        ...midpoint(wrist, palmEnd, 0.64),
        y: wrist.y + 0.0038 * buildScale * shoulderScale,
        z: wrist.z + 0.0022 * buildScale * shoulderScale,
      },
      radiusY: 0.0302 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 1.06,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.11, hypothenar: 0.065 },
    },
    {
      center: {
        ...midpoint(wrist, palmEnd, 0.82),
        y: wrist.y + 0.0021 * buildScale * shoulderScale,
        z: wrist.z + 0.001 * buildScale * shoulderScale,
      },
      radiusY: 0.027 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 1.01,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.07, hypothenar: 0.045 },
    },
    {
      center: palmEnd,
      radiusY: 0.023 * buildScale * shoulderScale,
      radiusZ: palmHalfWidth * 0.92,
      jointName: `${side}_hand`,
      palmBulge: { thenar: 0.025, hypothenar: 0.02 },
    },
  ];
  const portraitPalmRings: UpperLimbRing[] = [
    ...portraitArmRings,
    ...v5PalmRings.slice(anatomicalArmRings.length),
  ];
  const rings: UpperLimbRing[] = portrait
    ? portraitPalmRings
    : handSurface
      ? v5PalmRings
      : deforming
        ? v4PalmRings
        : anatomical
          ? [
              ...anatomicalArmRings,
              {
                center: midpoint(wrist, palmEnd, 0.46),
                radiusY: 0.028 * buildScale * shoulderScale,
                radiusZ: palmHalfWidth,
                jointName: `${side}_hand`,
              },
              {
                center: palmEnd,
                radiusY: 0.022 * buildScale * shoulderScale,
                radiusZ: palmHalfWidth * 0.96,
                jointName: `${side}_hand`,
              },
            ]
          : coherentRings;
  const vertexStart = acc.positions.length / 3;
  const indexStart = acc.indices.length;

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    const previous = rings[Math.max(0, ringIndex - 1)].center;
    const next = rings[Math.min(rings.length - 1, ringIndex + 1)].center;
    const centerlineTangent = normalize(sub(next, previous));
    const jointIndex = BONE_INDEX.get(ring.jointName) ?? 0;
    for (let segment = 0; segment < radialSegments; segment++) {
      const theta = (segment / radialSegments) * Math.PI * 2;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const bulgeRatio =
        sine >= 0
          ? (ring.palmBulge?.thenar ?? 0) * sine
          : (ring.palmBulge?.hypothenar ?? 0) * -sine;
      const palmarBias = 0.55 + 0.45 * Math.max(0, -cosine);
      const radialScale = 1 + bulgeRatio * palmarBias;
      const superiorScale = cosine >= 0 ? (ring.superiorScale ?? 1) : 1;
      acc.positions.push(
        ring.center.x,
        ring.center.y + ring.radiusY * cosine * radialScale * superiorScale,
        ring.center.z + ring.radiusZ * sine * radialScale
      );
      const radial = normalize({ x: 0, y: cosine, z: sine });
      const normal = anatomical
        ? normalize(sub(radial, scale(centerlineTangent, dot(radial, centerlineTangent))))
        : radial;
      acc.normals.push(normal.x, normal.y, normal.z);
      acc.tangents.push(
        anatomical ? centerlineTangent.x : direction,
        anatomical ? centerlineTangent.y : 0,
        anatomical ? centerlineTangent.z : 0,
        1
      );
      acc.jointIndices.push(jointIndex);
      acc.jointWeights.push(1);
    }
  }

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex++) {
    const inner = vertexStart + ringIndex * radialSegments;
    const outer = inner + radialSegments;
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      const a = inner + segment;
      const b = inner + next;
      const c = outer + next;
      const d = outer + segment;
      acc.indices.push(a, b, c, a, c, d);
    }
  }

  const palmCenter = acc.positions.length / 3;
  const palmJoint = BONE_INDEX.get(`${side}_hand`) ?? 0;
  acc.positions.push(palmEnd.x, palmEnd.y, palmEnd.z);
  acc.normals.push(direction, 0, 0);
  acc.tangents.push(0, 1, 0, 1);
  acc.jointIndices.push(palmJoint);
  acc.jointWeights.push(1);
  const lastRing = vertexStart + (rings.length - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    acc.indices.push(palmCenter, lastRing + segment, lastRing + next);
  }

  const digitRadialSegments = landmarked
    ? Math.max(10, Math.min(14, Math.round(radialSegments / 2)))
    : Math.max(6, Math.min(10, Math.round(radialSegments / 3)));
  const digits = anatomical
    ? AGENT_AVATAR_DIGIT_NAMES.map((digit) =>
        pushArticulatedDigit(
          acc,
          side,
          digit,
          digitRadialSegments,
          bindWorld,
          buildScale,
          shoulderScale,
          heightScale,
          landmarked,
          handSurface
        )
      )
    : undefined;
  const handLandmarks = landmarked
    ? pushHandLandmarks(
        acc,
        side,
        bindWorld,
        buildScale,
        shoulderScale,
        heightScale,
        digitRadialSegments,
        handSurface
      )
    : undefined;
  const metacarpalKnuckles =
    handLandmarks?.filter((landmark) => landmark.kind === 'metacarpal-knuckle') ?? [];
  const interdigitalCommissures =
    handLandmarks?.filter((landmark) => landmark.kind === 'interdigital-web') ?? [];
  const nailCuticles = handLandmarks?.filter((landmark) => landmark.kind === 'nail-plate') ?? [];
  const sumVertexCounts = (regions: readonly { vertexRange: { vertexCount: number } }[]): number =>
    regions.reduce((sum, region) => sum + region.vertexRange.vertexCount, 0);
  const sumIndexCounts = (regions: readonly { indexRange: { indexCount: number } }[]): number =>
    regions.reduce((sum, region) => sum + region.indexRange.indexCount, 0);
  const handSurfaceReceipt: AgentAvatarHandSurfaceGeometryReceipt | undefined = handSurface
    ? {
        schemaVersion: 'holoscript.agent-avatar-hand-surface-geometry.v1',
        profile: 'tapered-digit-commissure-cuticle-wrist-v1',
        side,
        wristTransitionRingCount: 6,
        digitSectionRingCount: 14,
        digitSectionExponent: 2.35,
        commissureRows: 5,
        commissureColumns: 7,
        commissureSaddleDepth: round6(0.0045 * buildScale * heightScale),
        nailRows: 7,
        nailColumns: 7,
        cuticleInsetRatio: 0.36,
        freeEdgeInsetRatio: 0.18,
        regionVertexCounts: {
          wristTransition: 6 * radialSegments,
          digitSections: sumVertexCounts(digits ?? []),
          metacarpalKnuckles: sumVertexCounts(metacarpalKnuckles),
          interdigitalCommissures: sumVertexCounts(interdigitalCommissures),
          nailCuticles: sumVertexCounts(nailCuticles),
        },
        regionIndexCounts: {
          wristTransition: 6 * radialSegments * 6,
          digitSections: sumIndexCounts(digits ?? []),
          metacarpalKnuckles: sumIndexCounts(metacarpalKnuckles),
          interdigitalCommissures: sumIndexCounts(interdigitalCommissures),
          nailCuticles: sumIndexCounts(nailCuticles),
        },
      }
    : undefined;

  return {
    schemaVersion: 'holoscript.agent-avatar-upper-limb-geometry.v1',
    profile: expressive
      ? 'expressive-scapular-hand-surface-v7'
      : portrait
        ? 'portrait-deltoid-hand-surface-v6'
        : handSurface
          ? 'tapered-hand-surface-v5'
          : deforming
            ? 'arched-palm-joint-deformation-v4'
            : landmarked
              ? 'anatomical-landmark-hand-v3'
              : anatomical
                ? 'anatomical-deltoid-hand-v2'
                : 'coherent-arm-palm-v1',
    side,
    radialSegments,
    ringCount: rings.length,
    shoulderRadius: round6(shoulderRadius * heightScale),
    wristRadius: round6(wristRadius * heightScale),
    palmHalfWidth: round6(palmHalfWidth * heightScale),
    ...(anatomical
      ? {
          deltoidBlendRingCount: portrait ? 6 : 3,
          shoulderOverlapDepth: round6(
            (portrait ? 0.04 : 0.024) * buildScale * shoulderScale * heightScale
          ),
          ...(portrait
            ? {
                shoulderBlendRingCount: 6 as const,
                minimumShoulderRadiusRatio: round6(
                  Math.min(
                    ...portraitArmRings
                      .slice(0, 6)
                      .map((ring) => Math.min(ring.radiusY, ring.radiusZ))
                  ) /
                    (shoulderRadius * 1.1)
                ),
                superiorContourScaleMin: Math.min(
                  ...portraitArmRings.slice(0, 6).map((ring) => ring.superiorScale ?? 1)
                ),
                ...(expressive
                  ? {
                      scapularElevation: round6(scapularElevation),
                      scapularProtraction: round6(scapularProtraction),
                    }
                  : {}),
              }
            : {}),
          digits,
          ...(handLandmarks ? { handLandmarks } : {}),
          ...(handSurface
            ? {
                palmProfile: 'arched-thenar-palm-v1' as const,
                palmBlendRingCount: 6 as const,
                thenarBulgeRatio: 0.125,
                hypothenarBulgeRatio: 0.07,
                palmArchRise: round6(0.0042 * buildScale * shoulderScale * heightScale),
                metacarpalTaperRatio: round6(0.023 / 0.0328),
                handSurface: handSurfaceReceipt,
              }
            : deforming
              ? {
                  palmProfile: 'arched-thenar-palm-v1' as const,
                  palmBlendRingCount: 4 as const,
                  thenarBulgeRatio: 0.12,
                  hypothenarBulgeRatio: 0.065,
                  palmArchRise: round6(0.004 * buildScale * shoulderScale * heightScale),
                  metacarpalTaperRatio: round6(0.024 / 0.0325),
                }
              : {}),
          connectedSurfaceCount: 1 + (digits?.length ?? 0) + (handLandmarks?.length ?? 0),
        }
      : {}),
    vertexRange: {
      vertexStart,
      vertexCount: (digits?.[0]?.vertexRange.vertexStart ?? acc.positions.length / 3) - vertexStart,
    },
    indexRange: {
      indexStart,
      indexCount: (digits?.[0]?.indexRange.indexStart ?? acc.indices.length) - indexStart,
    },
  };
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

/**
 * Append upper and lower skin shells around one procedural globe.
 *
 * The inner edges form an almond aperture while the outer edges blend toward the face plane.
 * This is actual occluding skin geometry, not a line painted over a round exposed eyeball.
 */
function pushOrbitalLidShell(
  acc: MeshAccum,
  center: Vec3,
  eyeRadius: number,
  facePlaneZ: number,
  lidOpening: number,
  canthalTilt: number,
  side: -1 | 1,
  jointIdx: number
): void {
  const segments = 18;
  const apertureHalfWidth = eyeRadius * 1.08;
  const apertureHalfHeight = eyeRadius * lidOpening;
  const outerHalfHeight = eyeRadius * 1.34;

  const pushLid = (upper: boolean): void => {
    const base = acc.positions.length / 3;
    for (let segment = 0; segment <= segments; segment++) {
      const normalizedX = -1 + (segment / segments) * 2;
      const almond = Math.pow(Math.max(0, 1 - normalizedX * normalizedX), 0.62);
      const outward = side * normalizedX;
      const tilt = eyeRadius * canthalTilt * outward;
      const direction = upper ? 1 : -1;
      const lowerOpeningScale = upper ? 1 : 0.88;
      const innerY = center.y + tilt + direction * apertureHalfHeight * almond * lowerOpeningScale;
      const outerY =
        center.y + tilt + direction * outerHalfHeight * (0.74 + almond * 0.26) * lowerOpeningScale;
      const x = center.x + normalizedX * apertureHalfWidth;
      const innerZ = center.z + eyeRadius * (0.84 + almond * 0.07);
      const outerZ = facePlaneZ - eyeRadius * Math.abs(normalizedX) * 0.035;
      const normal = normalize({
        x: normalizedX * 0.08,
        y: upper ? -0.16 : 0.16,
        z: 1,
      });

      for (const [y, z] of [
        [innerY, innerZ],
        [outerY, outerZ],
      ] as const) {
        acc.positions.push(x, y, z);
        acc.normals.push(normal.x, normal.y, normal.z);
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
  };

  pushLid(true);
  pushLid(false);
}

function pushAnatomicalLidFold(
  acc: MeshAccum,
  center: Vec3,
  eyeRadius: number,
  facePlaneZ: number,
  jointIdx: number
): void {
  pushFacialArc(
    acc,
    {
      x: center.x,
      y: center.y + eyeRadius * 0.16,
      z: facePlaneZ + eyeRadius * 0.015,
    },
    eyeRadius * 1.12,
    eyeRadius * 0.48,
    eyeRadius * 0.055,
    18,
    Math.PI * 0.12,
    Math.PI * 0.88,
    jointIdx
  );
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

function pushAnatomicalLipSurface(
  acc: MeshAccum,
  center: Vec3,
  halfWidth: number,
  halfHeight: number,
  depth: number,
  segments: number,
  jointIdx: number
): { vertexCount: number; triangleCount: number } {
  const base = acc.positions.length / 3;
  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments;
    const normalizedX = t * 2 - 1;
    const volume = Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX));
    const cupidBow = 0.78 + 0.22 * Math.cos(normalizedX * Math.PI * 2);
    const seamY =
      halfHeight * (0.12 * Math.cos(t * Math.PI * 2) - 0.055 * Math.cos(t * Math.PI * 4));
    const upperY = halfHeight * volume * cupidBow;
    const lowerY = -halfHeight * volume * (0.72 + 0.08 * Math.cos(normalizedX * Math.PI));
    const x = center.x + normalizedX * halfWidth;
    for (const [y, z, normalY] of [
      [upperY, depth * (0.62 + volume * 0.38), 0.24],
      [seamY, depth * (0.18 + volume * 0.12), 0],
      [lowerY, depth * (0.56 + volume * 0.32), -0.2],
    ] as const) {
      const normal = normalize({ x: normalizedX * 0.08, y: normalY, z: 1 });
      acc.positions.push(x, center.y + y, center.z + z);
      acc.normals.push(normal.x, normal.y, normal.z);
      acc.tangents.push(1, 0, 0, 1);
      acc.jointIndices.push(jointIdx);
      acc.jointWeights.push(1);
    }
  }
  for (let segment = 0; segment < segments; segment++) {
    const a = base + segment * 3;
    const b = a + 3;
    acc.indices.push(a, b, a + 1, a + 1, b, b + 1);
    acc.indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  return {
    vertexCount: (segments + 1) * 3,
    triangleCount: segments * 4,
  };
}

function pushCivicFacialLandmarks(
  acc: MeshAccum,
  center: Vec3,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  eyeRadius: number,
  eyeY: number,
  browHeight: number,
  browThickness: number,
  earScale: number,
  mouthDepth: number,
  jointIdx: number,
  includeLegacyLips = true
): void {
  const facePlaneZ = center.z + radiusZ * 1.006;
  const browY = eyeY + eyeRadius * browHeight;
  for (const side of [-1, 1] as const) {
    pushFacialArc(
      acc,
      {
        x: center.x + side * radiusX * 0.37,
        y: browY,
        z: facePlaneZ + eyeRadius * 0.055,
      },
      eyeRadius * 1.18,
      eyeRadius * 0.42,
      eyeRadius * browThickness,
      14,
      Math.PI * 0.08,
      Math.PI * 0.92,
      jointIdx
    );
  }

  for (const side of [-1, 1] as const) {
    const earCenter = {
      x: center.x + side * radiusX * 1.015,
      y: center.y - radiusY * 0.02,
      z: center.z + radiusZ * 0.02,
    };
    pushSmoothEllipsoid(
      acc,
      earCenter,
      radiusX * 0.095 * earScale,
      radiusY * 0.19 * earScale,
      radiusZ * 0.055 * earScale,
      8,
      12,
      jointIdx
    );
    pushFacialArc(
      acc,
      {
        x: earCenter.x,
        y: earCenter.y,
        z: earCenter.z + radiusZ * 0.058 * earScale,
      },
      radiusX * 0.052 * earScale,
      radiusY * 0.115 * earScale,
      radiusX * 0.013 * earScale,
      9,
      Math.PI * 0.32,
      Math.PI * 1.68,
      jointIdx
    );
  }

  if (includeLegacyLips) {
    const mouthCenter = {
      x: center.x,
      y: center.y - radiusY * 0.39,
      z: center.z + radiusZ * 1.003,
    };
    for (const direction of [-1, 1] as const) {
      pushSmoothEllipsoid(
        acc,
        {
          x: mouthCenter.x,
          y: mouthCenter.y + direction * radiusY * 0.018,
          z: mouthCenter.z + radiusZ * 0.02 * mouthDepth,
        },
        radiusX * (direction > 0 ? 0.27 : 0.25),
        radiusY * (direction > 0 ? 0.028 : 0.024),
        radiusZ * 0.022 * mouthDepth,
        5,
        14,
        jointIdx
      );
    }
  }
}

function stitchCranialNeckLoops(
  acc: MeshAccum,
  neckVertexStart: number,
  neckRadialSegments: number,
  cranialVertexStart: number,
  cranialRadialSegments: number,
  heightScale: number
): AgentAvatarCranialNeckGeometryReceipt {
  const indexStart = acc.indices.length;
  let neckIndex = 0;
  let cranialIndex = 0;
  while (neckIndex < neckRadialSegments || cranialIndex < cranialRadialSegments) {
    const neckNext = (neckIndex + 1) / neckRadialSegments;
    const cranialNext = (cranialIndex + 1) / cranialRadialSegments;
    const neckA = neckVertexStart + (neckIndex % neckRadialSegments);
    const neckB = neckVertexStart + ((neckIndex + 1) % neckRadialSegments);
    const cranialA = cranialVertexStart + (cranialIndex % cranialRadialSegments);
    const cranialB = cranialVertexStart + ((cranialIndex + 1) % cranialRadialSegments);
    if (Math.abs(neckNext - cranialNext) < 1e-12) {
      acc.indices.push(neckA, neckB, cranialB, neckA, cranialB, cranialA);
      neckIndex++;
      cranialIndex++;
    } else if (neckNext < cranialNext) {
      acc.indices.push(neckA, neckB, cranialA);
      neckIndex++;
    } else {
      acc.indices.push(neckA, cranialB, cranialA);
      cranialIndex++;
    }
  }

  const pointAt = (vertex: number): Vec3 => ({
    x: acc.positions[vertex * 3],
    y: acc.positions[vertex * 3 + 1],
    z: acc.positions[vertex * 3 + 2],
  });
  const neckPoints = Array.from({ length: neckRadialSegments }, (_, index) =>
    pointAt(neckVertexStart + index)
  );
  const cranialPoints = Array.from({ length: cranialRadialSegments }, (_, index) =>
    pointAt(cranialVertexStart + index)
  );
  const nearestDistance = (point: Vec3, candidates: readonly Vec3[]): number =>
    Math.min(...candidates.map((candidate) => distance(point, candidate)));
  const maxSeamGap =
    Math.max(
      ...neckPoints.map((point) => nearestDistance(point, cranialPoints)),
      ...cranialPoints.map((point) => nearestDistance(point, neckPoints))
    ) * heightScale;
  const averageY = (points: readonly Vec3[]): number =>
    points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length);

  return {
    schemaVersion: 'holoscript.agent-avatar-cranial-neck.v1',
    profile: 'indexed-neck-cranium-stitch-v1',
    neckRadialSegments,
    cranialRadialSegments,
    bridgeTriangleCount: (acc.indices.length - indexStart) / 3,
    axialSeparation: round6(Math.abs(averageY(cranialPoints) - averageY(neckPoints)) * heightScale),
    maxSeamGap: round6(maxSeamGap),
    neckVertexRange: {
      vertexStart: neckVertexStart,
      vertexCount: neckRadialSegments,
    },
    cranialVertexRange: {
      vertexStart: cranialVertexStart,
      vertexCount: cranialRadialSegments,
    },
    indexRange: {
      indexStart,
      indexCount: acc.indices.length - indexStart,
    },
  };
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
  includeTearline: boolean,
  orbitalProfile: AgentAvatarOrbitalProfile,
  eyeRecess: number,
  lidOpening: number,
  canthalTilt: number,
  facialDetailProfile: AgentAvatarFacialDetailProfile,
  eyeScale: number,
  browHeight: number,
  browThickness: number,
  earScale: number,
  mouthDepth: number,
  faceWidth: number,
  faceLength: number,
  jawTaperAmount: number,
  cheekboneScale: number,
  chinProjection: number,
  templeWidth: number,
  cranialNeckAnchor:
    | {
        vertexStart: number;
        radialSegments: number;
      }
    | undefined,
  heightScale: number
): {
  orbital?: AgentAvatarOrbitalGeometryReceipt;
  facialLandmarks?: AgentAvatarFacialLandmarkReceipt;
  cranialNeck?: AgentAvatarCranialNeckGeometryReceipt;
} {
  const center = {
    x: headBase.x,
    y: headBase.y + headLength * 0.52,
    z: headBase.z,
  };
  const radiusX = radius * 1.06 * faceWidth;
  const radiusY = headLength * 0.62 * faceLength;
  const radiusZ = radius * 1.08;
  const base = acc.positions.length / 3;
  const softTissue = facialDetailProfile === 'portrait-soft-tissue-v4';
  const portraitCranial = facialDetailProfile === 'portrait-cranial-v3' || softTissue;
  const portraitSilhouette = facialDetailProfile === 'portrait-silhouette-v2' || portraitCranial;
  const cranialMinimumY = headBase.y + headLength * 0.054;
  const lowerNormalizedY = portraitCranial
    ? clampFloat((cranialMinimumY - center.y) / radiusY, -0.76, -0.9, -0.62)
    : -1;
  const thetaLimit = Math.acos(lowerNormalizedY);

  for (let latitude = 0; latitude <= verticalSegments; latitude++) {
    const theta = (latitude / verticalSegments) * thetaLimit;
    const normalizedY = Math.cos(theta);
    const ring = Math.sin(theta);
    const lowerFace = Math.max(0, -normalizedY);
    const jawTaper = 1 - lowerFace * jawTaperAmount;
    const cheekBand = Math.exp(-Math.pow((normalizedY + 0.08) / 0.26, 2));
    const templeBand = Math.exp(-Math.pow((normalizedY - 0.42) / 0.22, 2));
    const chinBand = Math.exp(-Math.pow((normalizedY + 0.82) / 0.16, 2));
    const silhouetteScale = portraitSilhouette
      ? 1 + cheekBand * (cheekboneScale - 1) * 0.34 + templeBand * (templeWidth - 1) * 0.5
      : 1;
    for (let longitude = 0; longitude <= radialSegments; longitude++) {
      const phi = (longitude / radialSegments) * Math.PI * 2;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const front = Math.max(0, sin);
      const x = cos * ring * radiusX * jawTaper * silhouetteScale;
      const y = normalizedY * radiusY;
      // A flatter face and fuller occiput read more human than a perfect ellipsoid.
      const portraitProjection = portraitSilhouette
        ? front *
          (cheekBand * (cheekboneScale - 1) * 0.035 + chinBand * (chinProjection - 1) * 0.12)
        : 0;
      const zScale = 1 - front * 0.045 + Math.max(0, -sin) * 0.035 + portraitProjection;
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
  const cranialNeck =
    portraitCranial && cranialNeckAnchor
      ? stitchCranialNeckLoops(
          acc,
          cranialNeckAnchor.vertexStart,
          cranialNeckAnchor.radialSegments,
          base + verticalSegments * stride,
          radialSegments,
          heightScale
        )
      : undefined;

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

  let orbital: AgentAvatarOrbitalGeometryReceipt | undefined;
  if (includeTearline) {
    const orbitalVertexStart = acc.positions.length / 3;
    const orbitalIndexStart = acc.indices.length;
    const buildScale = radius / 0.09;
    const eyeY = headBase.y + 0.12 * buildScale;
    if (orbitalProfile === 'recessed-lids-v1' || orbitalProfile === 'anatomical-lid-fold-v2') {
      const eyeRadius = 0.0145 * buildScale * eyeScale;
      const eyeCenterZ = headBase.z + radius * 0.91 - eyeRadius * eyeRecess;
      const facePlaneZ = headBase.z + radius * 1.025;
      for (const side of [-1, 1] as const) {
        pushOrbitalLidShell(
          acc,
          {
            x: headBase.x + side * 0.035 * buildScale * faceWidth,
            y: eyeY,
            z: eyeCenterZ,
          },
          eyeRadius,
          facePlaneZ,
          lidOpening,
          canthalTilt,
          side,
          jointIdx
        );
        if (orbitalProfile === 'anatomical-lid-fold-v2') {
          pushAnatomicalLidFold(
            acc,
            {
              x: headBase.x + side * 0.035 * buildScale * faceWidth,
              y: eyeY,
              z: eyeCenterZ,
            },
            eyeRadius,
            facePlaneZ,
            jointIdx
          );
        }
      }
    } else {
      const eyeZ = headBase.z + radius * 1.045;
      for (const eyeX of [-0.035 * buildScale * faceWidth, 0.035 * buildScale * faceWidth]) {
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
    orbital = {
      profile: orbitalProfile,
      eyeRecess,
      lidOpening,
      canthalTilt,
      ...(eyeScale === 1 ? {} : { eyeScale }),
      ...(orbitalProfile === 'anatomical-lid-fold-v2'
        ? { lidFoldProfile: 'upper-crease-continuity-v1' as const }
        : {}),
      vertexRange: {
        vertexStart: orbitalVertexStart,
        vertexCount: acc.positions.length / 3 - orbitalVertexStart,
      },
      indexRange: {
        indexStart: orbitalIndexStart,
        indexCount: acc.indices.length - orbitalIndexStart,
      },
    };
  }

  if (!softTissue) {
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
  let facialLandmarks: AgentAvatarFacialLandmarkReceipt | undefined;
  if (
    facialDetailProfile === 'civic-landmarks-v1' ||
    facialDetailProfile === 'portrait-silhouette-v2' ||
    facialDetailProfile === 'portrait-cranial-v3' ||
    softTissue
  ) {
    const landmarkVertexStart = acc.positions.length / 3;
    const landmarkIndexStart = acc.indices.length;
    const buildScale = radius / 0.09;
    const eyeRadius = 0.0145 * buildScale * eyeScale;
    const lipSurface = softTissue
      ? pushAnatomicalLipSurface(
          acc,
          {
            x: center.x,
            y: center.y - radiusY * 0.39,
            z: faceZ + radiusZ * 0.026,
          },
          radiusX * 0.285,
          radiusY * 0.052,
          radiusZ * 0.034 * mouthDepth,
          17,
          jointIdx
        )
      : undefined;
    pushCivicFacialLandmarks(
      acc,
      center,
      radiusX,
      radiusY,
      radiusZ,
      eyeRadius,
      headBase.y + 0.12 * buildScale,
      browHeight,
      browThickness,
      earScale,
      mouthDepth,
      jointIdx,
      !softTissue
    );
    facialLandmarks = {
      schemaVersion: softTissue
        ? 'holoscript.agent-avatar-facial-landmarks.v4'
        : portraitCranial
          ? 'holoscript.agent-avatar-facial-landmarks.v3'
          : portraitSilhouette
            ? 'holoscript.agent-avatar-facial-landmarks.v2'
            : 'holoscript.agent-avatar-facial-landmarks.v1',
      profile: facialDetailProfile,
      radialSegments,
      verticalSegments,
      eyeScale,
      browHeight,
      browThickness,
      earScale,
      mouthDepth,
      ...(portraitSilhouette
        ? {
            cheekboneScale,
            chinProjection,
            templeWidth,
          }
        : {}),
      ...(lipSurface
        ? {
            lipTopology: 'connected-cupid-bow-ribbon-v1' as const,
            lipSurfaceVertexCount: lipSurface.vertexCount,
            lipSurfaceTriangleCount: lipSurface.triangleCount,
          }
        : {}),
      vertexRange: {
        vertexStart: landmarkVertexStart,
        vertexCount: acc.positions.length / 3 - landmarkVertexStart,
      },
      indexRange: {
        indexStart: landmarkIndexStart,
        indexCount: acc.indices.length - landmarkIndexStart,
      },
    };
  }
  return {
    ...(orbital ? { orbital } : {}),
    ...(facialLandmarks ? { facialLandmarks } : {}),
    ...(cranialNeck ? { cranialNeck } : {}),
  };
}

interface DualInfluenceBuild {
  primaryJointWeights: Float32Array<ArrayBuffer>;
  secondaryJointIndices: Uint32Array<ArrayBuffer>;
  secondaryJointWeights: Float32Array<ArrayBuffer>;
  receipt: AgentAvatarJointDeformationReceipt;
}

/**
 * Convert the V4/V5/V6 upper-limb transition rings from rigid binding to two normalized influences.
 *
 * The topology receipts are the addressing contract: if a later mesh edit moves a ring onto an
 * unexpected primary joint this fails loudly instead of silently skinning the wrong vertices.
 * Landmark and nail surfaces deliberately remain rigid in this bounded deformation profile.
 */
function buildDualInfluenceJointDeformation(
  acc: MeshAccum,
  upperBody: AgentAvatarUpperBodyGeometryReceipt,
  cranialNeck?: AgentAvatarCranialNeckGeometryReceipt
): DualInfluenceBuild {
  const expressive = upperBody.profile === 'expressive-anatomy-v7';
  const portrait = upperBody.profile === 'portrait-anatomy-v6' || expressive;
  const portraitShoulderWeights = [0.12, 0.15, 0.18, 0.4, 0.22, 0.08] as const;
  const neckInfluenceWeights = [0.08, 0.22, 0.45, 0.2] as const;
  const primaryJointWeights = new Float32Array(acc.jointWeights);
  const secondaryJointIndices = new Uint32Array(acc.jointIndices);
  const secondaryJointWeights = new Float32Array(acc.jointWeights.length);
  const regionVertexCounts: AgentAvatarJointDeformationReceipt['regionVertexCounts'] = {
    shoulder: 0,
    elbow: 0,
    wrist: 0,
    digitRoot: 0,
    fingerJoint: 0,
    ...(expressive ? { neck: 0 } : {}),
    ...(cranialNeck ? { cranialNeck: 0 } : {}),
  };
  const jointPairs = new Set<string>();
  let maxSecondaryWeight = 0;
  let maxWeightSumError = 0;

  const assignRing = (
    vertexStart: number,
    radialSegments: number,
    ringIndex: number,
    expectedPrimaryName: string,
    secondaryName: string,
    secondaryWeight: number,
    region: keyof typeof regionVertexCounts
  ): void => {
    const expectedPrimary = BONE_INDEX.get(expectedPrimaryName);
    const secondary = BONE_INDEX.get(secondaryName);
    if (expectedPrimary === undefined || secondary === undefined) {
      throw new Error(
        `Unknown hand deformation joint pair ${expectedPrimaryName} -> ${secondaryName}`
      );
    }
    const ringStart = vertexStart + ringIndex * radialSegments;
    for (let vertex = ringStart; vertex < ringStart + radialSegments; vertex++) {
      if (acc.jointIndices[vertex] !== expectedPrimary) {
        throw new Error(
          `Hand deformation topology drift at vertex ${vertex}: expected ${expectedPrimaryName}`
        );
      }
      primaryJointWeights[vertex] = 1 - secondaryWeight;
      secondaryJointIndices[vertex] = secondary;
      secondaryJointWeights[vertex] = secondaryWeight;
      maxSecondaryWeight = Math.max(maxSecondaryWeight, secondaryWeight);
      maxWeightSumError = Math.max(
        maxWeightSumError,
        Math.abs(primaryJointWeights[vertex] + secondaryJointWeights[vertex] - 1)
      );
    }
    const low = Math.min(expectedPrimary, secondary);
    const high = Math.max(expectedPrimary, secondary);
    jointPairs.add(`${low}:${high}`);
    regionVertexCounts[region] = (regionVertexCounts[region] ?? 0) + radialSegments;
  };

  for (const limb of upperBody.upperLimbs) {
    const side = limb.side;
    const main = limb.vertexRange.vertexStart;
    const radial = limb.radialSegments;
    if (portrait) {
      assignRing(
        main,
        radial,
        0,
        'spine2',
        `${side}_shoulder`,
        portraitShoulderWeights[0],
        'shoulder'
      );
      assignRing(
        main,
        radial,
        1,
        `${side}_shoulder`,
        'spine2',
        portraitShoulderWeights[1],
        'shoulder'
      );
      assignRing(
        main,
        radial,
        2,
        `${side}_shoulder`,
        `${side}_upper_arm`,
        portraitShoulderWeights[2],
        'shoulder'
      );
      assignRing(
        main,
        radial,
        3,
        `${side}_upper_arm`,
        `${side}_shoulder`,
        portraitShoulderWeights[3],
        'shoulder'
      );
      assignRing(
        main,
        radial,
        4,
        `${side}_upper_arm`,
        `${side}_shoulder`,
        portraitShoulderWeights[4],
        'shoulder'
      );
      assignRing(
        main,
        radial,
        5,
        `${side}_upper_arm`,
        `${side}_shoulder`,
        portraitShoulderWeights[5],
        'shoulder'
      );
      assignRing(main, radial, 6, `${side}_upper_arm`, `${side}_forearm`, 0.25, 'elbow');
      assignRing(main, radial, 7, `${side}_forearm`, `${side}_upper_arm`, 0.35, 'elbow');
      assignRing(main, radial, 8, `${side}_forearm`, `${side}_hand`, 0.55, 'wrist');
      assignRing(main, radial, 9, `${side}_hand`, `${side}_forearm`, 0.3, 'wrist');
    } else {
      assignRing(main, radial, 0, 'spine2', `${side}_shoulder`, 0.2, 'shoulder');
      assignRing(main, radial, 1, `${side}_shoulder`, `${side}_upper_arm`, 0.35, 'shoulder');
      assignRing(main, radial, 3, `${side}_upper_arm`, `${side}_forearm`, 0.18, 'elbow');
      assignRing(main, radial, 4, `${side}_upper_arm`, `${side}_forearm`, 0.5, 'elbow');
      assignRing(main, radial, 6, `${side}_forearm`, `${side}_hand`, 0.55, 'wrist');
      assignRing(main, radial, 7, `${side}_hand`, `${side}_forearm`, 0.25, 'wrist');
    }

    for (const digit of limb.digits ?? []) {
      const root = digit.vertexRange.vertexStart;
      const digitRadial = digit.radialSegments;
      const proximal = `${side}_${digit.digit}_proximal`;
      const intermediate = `${side}_${digit.digit}_intermediate`;
      const distal = `${side}_${digit.digit}_distal`;
      assignRing(root, digitRadial, 0, `${side}_hand`, proximal, 0.25, 'digitRoot');
      assignRing(root, digitRadial, 1, proximal, `${side}_hand`, 0.25, 'digitRoot');
      if (digit.profile === 'tapered-superellipse-three-phalanx-v3') {
        assignRing(root, digitRadial, 5, proximal, intermediate, 0.25, 'fingerJoint');
        assignRing(root, digitRadial, 6, intermediate, proximal, 0.25, 'fingerJoint');
        assignRing(root, digitRadial, 9, intermediate, distal, 0.25, 'fingerJoint');
        assignRing(root, digitRadial, 10, distal, intermediate, 0.25, 'fingerJoint');
      } else {
        assignRing(root, digitRadial, 3, proximal, intermediate, 0.25, 'fingerJoint');
        assignRing(root, digitRadial, 4, intermediate, proximal, 0.25, 'fingerJoint');
        assignRing(root, digitRadial, 5, intermediate, distal, 0.25, 'fingerJoint');
        assignRing(root, digitRadial, 6, distal, intermediate, 0.25, 'fingerJoint');
      }
    }
  }

  if (expressive) {
    const axial = upperBody.vertexRange.vertexStart;
    const radial = upperBody.radialSegments;
    assignRing(axial, radial, 7, 'spine2', 'neck', neckInfluenceWeights[0], 'neck');
    assignRing(axial, radial, 8, 'spine2', 'neck', neckInfluenceWeights[1], 'neck');
    assignRing(axial, radial, 9, 'neck', 'spine2', neckInfluenceWeights[2], 'neck');
    assignRing(axial, radial, 10, 'neck', 'spine2', neckInfluenceWeights[3], 'neck');
  }
  if (cranialNeck) {
    assignRing(
      cranialNeck.neckVertexRange.vertexStart,
      cranialNeck.neckRadialSegments,
      0,
      'neck',
      'head',
      0.35,
      'cranialNeck'
    );
    assignRing(
      cranialNeck.cranialVertexRange.vertexStart,
      cranialNeck.cranialRadialSegments,
      0,
      'head',
      'neck',
      0.45,
      'cranialNeck'
    );
  }

  const influencedVertexCount = Object.values(regionVertexCounts).reduce(
    (sum, count) => sum + (count ?? 0),
    0
  );
  return {
    primaryJointWeights,
    secondaryJointIndices,
    secondaryJointWeights,
    receipt: {
      schemaVersion: cranialNeck
        ? 'holoscript.agent-avatar-joint-deformation.v4'
        : expressive
          ? 'holoscript.agent-avatar-joint-deformation.v3'
          : portrait
            ? 'holoscript.agent-avatar-joint-deformation.v2'
            : 'holoscript.agent-avatar-joint-deformation.v1',
      profile: cranialNeck
        ? 'expressive-cranial-neck-volume-v4'
        : expressive
          ? 'expressive-neck-scapular-volume-v3'
          : portrait
            ? 'portrait-shoulder-volume-v2'
            : 'dual-influence-upper-limb-v1',
      influencedVertexCount,
      jointPairCount: jointPairs.size,
      maxSecondaryWeight: round6(maxSecondaryWeight),
      maxWeightSumError: round6(maxWeightSumError),
      regionVertexCounts,
      ...(portrait
        ? {
            shoulderVolume: {
              blendRingCount: 6 as const,
              rootOverlapDepth: Math.min(
                ...upperBody.upperLimbs.map((limb) => limb.shoulderOverlapDepth ?? 0)
              ),
              minimumAuthoredRadiusRatio: Math.min(
                ...upperBody.upperLimbs.map((limb) => limb.minimumShoulderRadiusRatio ?? 0)
              ),
              influenceWeights: portraitShoulderWeights,
            },
          }
        : {}),
      ...(expressive
        ? {
            expressiveAsymmetry: {
              profile: 'source-asymmetric-neck-scapula-v1' as const,
              scapularElevation: {
                left: upperBody.upperLimbs[0].scapularElevation ?? 0,
                right: upperBody.upperLimbs[1].scapularElevation ?? 0,
              },
              scapularProtraction: {
                left: upperBody.upperLimbs[0].scapularProtraction ?? 0,
                right: upperBody.upperLimbs[1].scapularProtraction ?? 0,
              },
              neckBlendRingCount: 4 as const,
              neckInfluenceWeights,
            },
          }
        : {}),
      ...(cranialNeck
        ? {
            cranialNeckContinuity: {
              profile: 'dual-influence-neck-head-stitch-v1' as const,
              neckToHeadWeight: 0.35 as const,
              headToNeckWeight: 0.45 as const,
            },
          }
        : {}),
    },
  };
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
  const facialDetailProfile = opts.facialDetailProfile ?? 'legacy-landmarks-v1';
  const portraitCranial =
    facialDetailProfile === 'portrait-cranial-v3' ||
    facialDetailProfile === 'portrait-soft-tissue-v4';
  const faceRadialSegments = clampInt(
    opts.faceRadialSegments,
    portraitCranial ? 40 : 20,
    12,
    portraitCranial ? 48 : 32
  );
  const faceVerticalSegments = clampInt(
    opts.faceVerticalSegments,
    portraitCranial ? 28 : 14,
    8,
    portraitCranial ? 36 : 24
  );
  const orbitalProfile = opts.orbitalProfile ?? 'tearline-rim-v1';
  const eyeRecess = clampFloat(
    opts.eyeRecess,
    orbitalProfile === 'recessed-lids-v1' || orbitalProfile === 'anatomical-lid-fold-v2' ? 0.28 : 0,
    0,
    0.45
  );
  const lidOpening = clampFloat(opts.lidOpening, 0.56, 0.42, 0.78);
  const canthalTilt = clampFloat(opts.canthalTilt, 0.12, -0.25, 0.25);
  const eyeScale = clampFloat(opts.eyeScale, 1, 0.72, 1.08);
  const browHeight = clampFloat(opts.browHeight, 1.05, 0.65, 1.65);
  const browThickness = clampFloat(opts.browThickness, 0.16, 0.08, 0.32);
  const earScale = clampFloat(opts.earScale, 1, 0.7, 1.3);
  const mouthDepth = clampFloat(opts.mouthDepth, 0.72, 0.25, 1.4);
  const cheekboneScale = clampFloat(opts.cheekboneScale, 1, 0.82, 1.22);
  const chinProjection = clampFloat(opts.chinProjection, 1, 0.72, 1.28);
  const templeWidth = clampFloat(opts.templeWidth, 1, 0.88, 1.12);
  const faceWidth = clampFloat(opts.faceWidth, 1, 0.84, 1.2);
  const faceLength = clampFloat(opts.faceLength, 1, 0.86, 1.16);
  const jawTaper = clampFloat(opts.jawTaper, 0.22, 0.08, 0.38);
  const shoulderScale = clampFloat(opts.shoulderScale, 1, 0.85, 1.25);
  const torsoScale = clampFloat(opts.torsoScale, 1, 0.85, 1.2);
  const upperBodyProfile = opts.upperBodyProfile ?? 'legacy-segments-v1';
  const upperBodyRadialSegments = clampInt(opts.upperBodyRadialSegments, 24, 12, 32);
  const leftScapularElevation = clampFloat(opts.leftScapularElevation, 0, -1, 1);
  const rightScapularElevation = clampFloat(opts.rightScapularElevation, 0, -1, 1);
  const leftScapularProtraction = clampFloat(opts.leftScapularProtraction, 0, -1, 1);
  const rightScapularProtraction = clampFloat(opts.rightScapularProtraction, 0, -1, 1);
  const bindWorld = computeBindWorld();
  const acc: MeshAccum = {
    positions: [],
    normals: [],
    tangents: [],
    indices: [],
    jointIndices: [],
    jointWeights: [],
  };
  let orbital: AgentAvatarOrbitalGeometryReceipt | undefined;
  let facialLandmarks: AgentAvatarFacialLandmarkReceipt | undefined;
  let cranialNeck: AgentAvatarCranialNeckGeometryReceipt | undefined;
  const coherentProfile = upperBodyProfile === 'legacy-segments-v1' ? undefined : upperBodyProfile;
  const upperBodyBase = coherentProfile
    ? pushCoherentUpperBody(
        acc,
        coherentProfile,
        upperBodyRadialSegments,
        buildScale,
        shoulderScale,
        torsoScale,
        heightScale
      )
    : undefined;
  const upperBody: AgentAvatarUpperBodyGeometryReceipt | undefined =
    coherentProfile && upperBodyBase
      ? {
          ...upperBodyBase,
          upperLimbs: [
            pushCoherentUpperLimb(
              acc,
              'left',
              coherentProfile,
              upperBodyRadialSegments,
              bindWorld,
              buildScale,
              shoulderScale,
              heightScale,
              leftScapularElevation,
              leftScapularProtraction
            ),
            pushCoherentUpperLimb(
              acc,
              'right',
              coherentProfile,
              upperBodyRadialSegments,
              bindWorld,
              buildScale,
              shoulderScale,
              heightScale,
              rightScapularElevation,
              rightScapularProtraction
            ),
          ],
        }
      : undefined;
  const handSurfaceProfile: AgentAvatarHandSurfaceReceipt['upperBodyProfile'] | undefined =
    upperBodyProfile === 'coherent-hand-surface-v5' ||
    upperBodyProfile === 'coherent-portrait-anatomy-v6' ||
    upperBodyProfile === 'coherent-expressive-anatomy-v7'
      ? upperBodyProfile
      : undefined;
  const handSurfaceLimbs =
    handSurfaceProfile && upperBody
      ? upperBody.upperLimbs.map((limb) => limb.handSurface).filter(Boolean)
      : [];
  const handSurface: AgentAvatarHandSurfaceReceipt | undefined =
    handSurfaceLimbs.length === 2 && handSurfaceProfile
      ? {
          schemaVersion: 'holoscript.agent-avatar-hand-surface.v1',
          profile: 'tapered-digit-commissure-cuticle-wrist-v1',
          upperBodyProfile: handSurfaceProfile,
          limbs: handSurfaceLimbs as [
            AgentAvatarHandSurfaceGeometryReceipt,
            AgentAvatarHandSurfaceGeometryReceipt,
          ],
          regionVertexCounts: {
            wristTransition: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionVertexCounts.wristTransition,
              0
            ),
            digitSections: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionVertexCounts.digitSections,
              0
            ),
            metacarpalKnuckles: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionVertexCounts.metacarpalKnuckles,
              0
            ),
            interdigitalCommissures: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionVertexCounts.interdigitalCommissures,
              0
            ),
            nailCuticles: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionVertexCounts.nailCuticles,
              0
            ),
          },
          regionIndexCounts: {
            wristTransition: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionIndexCounts.wristTransition,
              0
            ),
            digitSections: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionIndexCounts.digitSections,
              0
            ),
            metacarpalKnuckles: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionIndexCounts.metacarpalKnuckles,
              0
            ),
            interdigitalCommissures: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionIndexCounts.interdigitalCommissures,
              0
            ),
            nailCuticles: handSurfaceLimbs.reduce(
              (sum, limb) => sum + limb!.regionIndexCounts.nailCuticles,
              0
            ),
          },
        }
      : undefined;

  const childCount = new Map<string, number>();
  for (const bone of HUMANOID_65_SKELETON) {
    if (bone.parent) childCount.set(bone.parent, (childCount.get(bone.parent) ?? 0) + 1);
  }

  const coherentUpperBodySegments = new Set([
    'hips',
    'spine',
    'spine1',
    'spine2',
    'neck',
    'head',
    'left_shoulder',
    'left_upper_arm',
    'left_forearm',
    'left_hand',
    'right_shoulder',
    'right_upper_arm',
    'right_forearm',
    'right_hand',
  ]);
  const anatomicalDigits =
    upperBodyProfile === 'coherent-anatomical-limbs-v2' ||
    upperBodyProfile === 'coherent-hand-landmarks-v3' ||
    upperBodyProfile === 'coherent-deforming-hands-v4' ||
    upperBodyProfile === 'coherent-hand-surface-v5' ||
    upperBodyProfile === 'coherent-portrait-anatomy-v6' ||
    upperBodyProfile === 'coherent-expressive-anatomy-v7';

  // One box per segment (parent-joint → this-joint), weighted to the PARENT bone it represents.
  for (const bone of HUMANOID_65_SKELETON) {
    if (!bone.parent) continue;
    if (upperBody && coherentUpperBodySegments.has(bone.name)) continue;
    if (anatomicalDigits && (isFingerBone(bone.name) || isFingerBone(bone.parent))) continue;
    const a0 = getTranslation(bindWorld.get(bone.parent)!);
    const b0 = getTranslation(bindWorld.get(bone.name)!);
    const upperLimb =
      bone.parent.endsWith('_shoulder') ||
      bone.parent.endsWith('_upper_arm') ||
      bone.parent.endsWith('_forearm') ||
      bone.parent.endsWith('_hand') ||
      bone.name.endsWith('_shoulder') ||
      bone.name.endsWith('_upper_arm') ||
      bone.name.endsWith('_forearm') ||
      bone.name.endsWith('_hand');
    const a = upperLimb ? { ...a0, x: a0.x * shoulderScale } : a0;
    const b = upperLimb ? { ...b0, x: b0.x * shoulderScale } : b0;
    const jointIdx = BONE_INDEX.get(bone.parent) ?? 0;
    pushBox(acc, a, b, radiusFor(bone.parent, buildScale, torsoScale), jointIdx);
  }

  // Cap boxes for leaf bones with length>0 (mainly the head), extruded +Y in world-bind.
  for (const bone of HUMANOID_65_SKELETON as BoneDefinition[]) {
    if ((childCount.get(bone.name) ?? 0) === 0 && bone.length > 0) {
      if (anatomicalDigits && isFingerBone(bone.name)) continue;
      const a = getTranslation(bindWorld.get(bone.name)!);
      const b = { x: a.x, y: a.y + bone.length, z: a.z };
      const jointIdx = BONE_INDEX.get(bone.name) ?? 0;
      if (bone.name === 'head' && faceTopology === 'neutral-anatomical-v2') {
        const faceGeometry = pushNeutralAnatomicalHead(
          acc,
          a,
          bone.length,
          radiusFor(bone.name, buildScale, torsoScale),
          jointIdx,
          faceRadialSegments,
          faceVerticalSegments,
          opts.faceTearline !== false,
          orbitalProfile,
          eyeRecess,
          lidOpening,
          canthalTilt,
          facialDetailProfile,
          eyeScale,
          browHeight,
          browThickness,
          earScale,
          mouthDepth,
          faceWidth,
          faceLength,
          jawTaper,
          cheekboneScale,
          chinProjection,
          templeWidth,
          portraitCranial && upperBodyProfile === 'coherent-expressive-anatomy-v7' && upperBody
            ? {
                vertexStart:
                  upperBody.vertexRange.vertexStart +
                  (upperBody.ringCount - 1) * upperBody.radialSegments,
                radialSegments: upperBody.radialSegments,
              }
            : undefined,
          heightScale
        );
        orbital = faceGeometry.orbital;
        facialLandmarks = faceGeometry.facialLandmarks;
        cranialNeck = faceGeometry.cranialNeck;
      } else {
        pushBox(acc, a, b, radiusFor(bone.name, buildScale, torsoScale), jointIdx);
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
  const jointDeformation =
    (upperBodyProfile === 'coherent-deforming-hands-v4' ||
      upperBodyProfile === 'coherent-hand-surface-v5' ||
      upperBodyProfile === 'coherent-portrait-anatomy-v6' ||
      upperBodyProfile === 'coherent-expressive-anatomy-v7') &&
    upperBody
      ? buildDualInfluenceJointDeformation(acc, upperBody, cranialNeck)
      : undefined;

  return {
    positions,
    normals: new Float32Array(acc.normals),
    tangents: new Float32Array(acc.tangents),
    indices: new Uint32Array(acc.indices),
    jointIndices: new Uint32Array(acc.jointIndices),
    jointWeights: jointDeformation?.primaryJointWeights ?? new Float32Array(acc.jointWeights),
    ...(jointDeformation
      ? {
          secondaryJointIndices: jointDeformation.secondaryJointIndices,
          secondaryJointWeights: jointDeformation.secondaryJointWeights,
          jointDeformation: jointDeformation.receipt,
        }
      : {}),
    vertexCount: acc.positions.length / 3,
    jointCount: JOINT_COUNT,
    boneOrder: BONE_ORDER,
    anatomy: {
      schemaVersion: cranialNeck
        ? 'holoscript.agent-avatar-anatomy.v3'
        : upperBodyProfile === 'coherent-expressive-anatomy-v7'
          ? 'holoscript.agent-avatar-anatomy.v2'
          : 'holoscript.agent-avatar-anatomy.v1',
      faceWidth,
      faceLength,
      jawTaper,
      shoulderScale,
      torsoScale,
      ...(upperBody
        ? {
            upperBody: {
              ...upperBody,
              vertexRange: { ...upperBody.vertexRange },
              indexRange: { ...upperBody.indexRange },
              upperLimbs: upperBody.upperLimbs.map((limb) => ({
                ...limb,
                vertexRange: { ...limb.vertexRange },
                indexRange: { ...limb.indexRange },
                ...(limb.digits
                  ? {
                      digits: limb.digits.map((digit) => ({
                        ...digit,
                        vertexRange: { ...digit.vertexRange },
                        indexRange: { ...digit.indexRange },
                      })),
                    }
                  : {}),
                ...(limb.handLandmarks
                  ? {
                      handLandmarks: limb.handLandmarks.map((landmark) => ({
                        ...landmark,
                        ...(landmark.betweenDigits
                          ? { betweenDigits: [...landmark.betweenDigits] as const }
                          : {}),
                        vertexRange: { ...landmark.vertexRange },
                        indexRange: { ...landmark.indexRange },
                      })),
                    }
                  : {}),
                ...(limb.handSurface
                  ? {
                      handSurface: {
                        ...limb.handSurface,
                        regionVertexCounts: { ...limb.handSurface.regionVertexCounts },
                        regionIndexCounts: { ...limb.handSurface.regionIndexCounts },
                      },
                    }
                  : {}),
              })) as [AgentAvatarUpperLimbGeometryReceipt, AgentAvatarUpperLimbGeometryReceipt],
            },
          }
        : {}),
      ...(cranialNeck
        ? {
            cranialNeck: {
              ...cranialNeck,
              neckVertexRange: { ...cranialNeck.neckVertexRange },
              cranialVertexRange: { ...cranialNeck.cranialVertexRange },
              indexRange: { ...cranialNeck.indexRange },
            },
          }
        : {}),
    },
    ...(handSurface
      ? {
          handSurface: {
            ...handSurface,
            limbs: handSurface.limbs.map((limb) => ({
              ...limb,
              regionVertexCounts: { ...limb.regionVertexCounts },
              regionIndexCounts: { ...limb.regionIndexCounts },
            })) as [AgentAvatarHandSurfaceGeometryReceipt, AgentAvatarHandSurfaceGeometryReceipt],
            regionVertexCounts: { ...handSurface.regionVertexCounts },
            regionIndexCounts: { ...handSurface.regionIndexCounts },
          },
        }
      : {}),
    ...(orbital ? { orbital } : {}),
    ...(facialLandmarks ? { facialLandmarks } : {}),
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
