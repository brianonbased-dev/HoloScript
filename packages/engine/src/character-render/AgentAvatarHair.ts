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
import type { HairCoverageProfile, SkinnedMeshData } from '../native-render/draw-spec';
import {
  buildAgentAvatarMesh,
  computeBindWorld,
  type AgentAvatarMeshData,
  type AgentAvatarMeshOptions,
} from './AgentAvatarMesh';
import {
  buildAgentAvatarGarment,
  type AgentAvatarGarmentGeometryReceipt,
  type SovereignGarmentStyle,
  type SovereignMantleStyle,
} from './AgentAvatarGarment';
import { getTranslation, type Vec3 } from './skin-math';

const HEAD_INDEX = HUMANOID_BONE_NAMES.indexOf('head');

export interface HairMeshData {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  /** 4 floats/vertex: xyz strand-flow tangent + w strandT (0 root → 1 tip). */
  tangents: Float32Array<ArrayBuffer>;
  /** 2 floats/vertex. Hair cards use u=0/1 across width; scalp-cap v stays negative. */
  uvs?: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  jointIndices: Uint32Array<ArrayBuffer>; // all = head palette index
  jointWeights: Float32Array<ArrayBuffer>; // all = 1.0
  vertexCount: number;
  /** Derived evidence for the operative native groom geometry, when requested. */
  groom?: AgentAvatarGroomGeometryReceipt;
}

export const AGENT_AVATAR_OCULAR_PROFILES = [
  'legacy-composite-v1',
  'layered-ocular-v1',
  'layered-ocular-tearfilm-v2',
  'layered-ocular-calibrated-v3',
] as const;

export type AgentAvatarOcularProfile = (typeof AGENT_AVATAR_OCULAR_PROFILES)[number];
export type AgentAvatarOcularRegion = 'sclera' | 'iris' | 'pupil' | 'cornea';

export interface OcularMeshData extends HairMeshData {
  /** Radial UVs used by the native iris material; non-iris regions stay deterministic. */
  uvs: Float32Array<ArrayBuffer>;
  /** Per-eye contiguous index ranges, ordered left then right for each authored region. */
  regionRanges: Record<AgentAvatarOcularRegion, Array<{ indexStart: number; indexCount: number }>>;
  receipt?: AgentAvatarOcularGeometryReceipt;
}

export interface AgentAvatarOcularGeometryReceipt {
  schemaVersion:
    | 'holoscript.agent-avatar-ocular-geometry.v1'
    | 'holoscript.agent-avatar-ocular-geometry.v2'
    | 'holoscript.agent-avatar-ocular-geometry.v3';
  profile: AgentAvatarOcularProfile;
  eyeCount: 2;
  regionCount: 4;
  /** H3Z independently indexed lower-cornea wetline. */
  tearMeniscusProfile?: 'lower-cornea-meniscus-v1';
  tearMeniscusIndexCount?: number;
  /** H4A proportions shared with the source-authored lid and wetline response. */
  calibrationProfile?: 'portrait-ocular-balance-v1';
  irisScale?: number;
  pupilScale?: number;
  lidOpening?: number;
  corneaRadiusScale?: number;
}

export const AGENT_AVATAR_HAIR_STYLES = [
  'short',
  'medium_wavy',
  'long',
  'swept_ridge',
  'cropped_coils',
] as const;

export type AgentAvatarHairStyle = (typeof AGENT_AVATAR_HAIR_STYLES)[number];

export const AGENT_AVATAR_GROOM_PROFILES = [
  'radial-cards-v1',
  'scalp-flow-v1',
  'scalp-flow-containment-v2',
  'scalp-flow-breakup-v3',
  'scalp-flow-portrait-v4',
  'scalp-flow-volume-v5',
  'scalp-flow-density-v6',
] as const;

export type AgentAvatarGroomProfile = (typeof AGENT_AVATAR_GROOM_PROFILES)[number];

export const AGENT_AVATAR_HAIR_COVERAGE_PROFILES = [
  'opaque-v1',
  'alpha-to-coverage-v1',
] as const satisfies readonly HairCoverageProfile[];

export interface AgentAvatarHairMaterialReceipt {
  schemaVersion:
    | 'holoscript.agent-avatar-hair-material.v1'
    | 'holoscript.agent-avatar-hair-material.v2'
    | 'holoscript.agent-avatar-hair-material.v3';
  shadingModel: 'marschner-hair';
  /** Exact source-authored 0xRRGGBB hair chroma when the v2 material path is active. */
  sourceColor?: number;
  /** Bounded source-chroma contribution; omission preserves the v1 melanin-only response. */
  sourceColorWeight?: number;
  coverageProfile: HairCoverageProfile;
  strandCoverage: number;
  edgeSoftness: number;
  anisotropyStrength: number;
  longitudinalShift: number;
  primaryExponent: number;
  secondaryExponent: number;
  tangentAttribute: 'strand-flow';
  cardUvAttribute: 'card-width';
  alphaToCoverageRequested: boolean;
  /** H4J layered opacity and root-occlusion response over the A2C card path. */
  densityProfile?: 'layered-card-density-v1';
  densityStrength?: number;
  rootShadowStrength?: number;
}

export interface AgentAvatarGroomGeometryReceipt {
  schemaVersion:
    | 'holoscript.agent-avatar-groom-geometry.v1'
    | 'holoscript.agent-avatar-groom-geometry.v2'
    | 'holoscript.agent-avatar-groom-geometry.v3'
    | 'holoscript.agent-avatar-groom-geometry.v4'
    | 'holoscript.agent-avatar-groom-geometry.v5'
    | 'holoscript.agent-avatar-groom-geometry.v6';
  profile: AgentAvatarGroomProfile;
  rootLift: number;
  tipTaper: number;
  hairlineBias: number;
  /** Signed crown-flow rotation around the scalp normal (-1..1). */
  crownWhorl: number;
  /** Optional source-authored angular cluster count. Omitted preserves legacy root seeding. */
  clusterCount?: number;
  /** Optional within-cluster angular spread (0.08..1). */
  clusterSpread?: number;
  requestedGuideCount: number;
  emittedGuideCount: number;
  cardCount: number;
  scalpSurface: 'legacy-sphere' | 'neutral-anatomical-ellipsoid';
  scalpCapVertexCount: number;
  scalpCapTriangleCount: number;
  vertexCount: number;
  triangleCount: number;
  /** p95 absolute dot(root tangent, scalp normal); lower means less radial card eruption. */
  rootTangentRadialDotP95: number;
  /** Hair vertices inside a deterministic upper-face prism in bind space. */
  frontalOcclusionVertexCount: number;
  /** H3Y exterior projection used to keep cards and guides outside the authored scalp. */
  containmentProfile?: 'ellipsoidal-scalp-exterior-v1';
  /** Vertices projected outward because their authored position crossed the scalp surface. */
  containmentAdjustedVertexCount?: number;
  /** Final vertices remaining inside the scalp ellipsoid after containment. */
  scalpPenetrationVertexCount?: number;
  /** H3Z deterministic, scalp-contained silhouette breakup. */
  breakupProfile?: 'contained-flyaway-breakup-v1';
  flyawayGuideCount?: number;
  flyawayCardCount?: number;
  /** H4A hair-material facial framing emitted with the scalp groom. */
  facialFramingProfile?: 'portrait-brow-lash-ribbons-v1';
  browCardCount?: number;
  lashCardCount?: number;
  facialFramingVertexCount?: number;
  /** H4I deterministic scalp-volume and broad-lock silhouette treatment. */
  silhouetteProfile?: 'massed-silhouette-clumps-v1';
  massGuideCount?: number;
  massCardCount?: number;
  /** Maximum source-independent cap lift in metres after build scaling is removed. */
  scalpCapMaxLift?: number;
  /** H4J three-axis undercoat cards added below the broad silhouette locks. */
  densityLayerProfile?: 'cross-card-undercoat-v1';
  densityLayerCardCount?: number;
  /** Source-derived native shading/coverage contract joined by CharacterHost. */
  material?: AgentAvatarHairMaterialReceipt;
}

interface HairStyleProfile {
  guides: number;
  cardsPerGuide: number;
  segments: number;
  cardWidth: number;
  length: number;
  gravityBlend: number;
  waveAmplitude: number;
  waveTurns: number;
  sweepX: number;
  sweepZ: number;
}

const HAIR_STYLE_PROFILES: Record<AgentAvatarHairStyle, HairStyleProfile> = {
  short: {
    guides: 112,
    cardsPerGuide: 2,
    segments: 4,
    cardWidth: 0.017,
    length: 0.07,
    gravityBlend: 0.65,
    waveAmplitude: 0,
    waveTurns: 0,
    sweepX: 0,
    sweepZ: 0,
  },
  medium_wavy: {
    guides: 140,
    cardsPerGuide: 2,
    segments: 6,
    cardWidth: 0.014,
    length: 0.17,
    gravityBlend: 0.85,
    waveAmplitude: 0.18,
    waveTurns: 1.5,
    sweepX: 0,
    sweepZ: 0,
  },
  long: {
    guides: 160,
    cardsPerGuide: 2,
    segments: 8,
    cardWidth: 0.012,
    length: 0.31,
    gravityBlend: 0.98,
    waveAmplitude: 0.06,
    waveTurns: 1,
    sweepX: 0,
    sweepZ: 0,
  },
  swept_ridge: {
    guides: 126,
    cardsPerGuide: 2,
    segments: 6,
    cardWidth: 0.015,
    length: 0.18,
    gravityBlend: 0.58,
    waveAmplitude: 0.04,
    waveTurns: 0.75,
    sweepX: 0.38,
    sweepZ: -0.08,
  },
  cropped_coils: {
    guides: 168,
    cardsPerGuide: 2,
    segments: 7,
    cardWidth: 0.012,
    length: 0.11,
    gravityBlend: 0.42,
    waveAmplitude: 0.34,
    waveTurns: 2.5,
    sweepX: 0,
    sweepZ: 0,
  },
};

const HAIR_STYLE_ALIASES: Readonly<Record<string, AgentAvatarHairStyle>> = {
  short: 'short',
  cropped: 'short',
  medium: 'medium_wavy',
  medium_wavy: 'medium_wavy',
  wavy: 'medium_wavy',
  long: 'long',
  long_wavy: 'long',
  swept: 'swept_ridge',
  swept_ridge: 'swept_ridge',
  cropped_coils: 'cropped_coils',
  coils: 'cropped_coils',
};

const GROOM_PROFILE_ALIASES: Readonly<Record<string, AgentAvatarGroomProfile>> = {
  radial_cards_v1: 'radial-cards-v1',
  legacy: 'radial-cards-v1',
  scalp_flow_v1: 'scalp-flow-v1',
  scalp_flow: 'scalp-flow-v1',
  scalp_flow_containment_v2: 'scalp-flow-containment-v2',
  scalp_flow_containment: 'scalp-flow-containment-v2',
  containment: 'scalp-flow-containment-v2',
  scalp_flow_breakup_v3: 'scalp-flow-breakup-v3',
  scalp_flow_breakup: 'scalp-flow-breakup-v3',
  breakup: 'scalp-flow-breakup-v3',
  scalp_flow_portrait_v4: 'scalp-flow-portrait-v4',
  scalp_flow_portrait: 'scalp-flow-portrait-v4',
  portrait: 'scalp-flow-portrait-v4',
  scalp_flow_volume_v5: 'scalp-flow-volume-v5',
  scalp_flow_volume: 'scalp-flow-volume-v5',
  volume: 'scalp-flow-volume-v5',
  scalp_flow_density_v6: 'scalp-flow-density-v6',
  scalp_flow_density: 'scalp-flow-density-v6',
  density: 'scalp-flow-density-v6',
};

const HAIR_COVERAGE_PROFILE_ALIASES: Readonly<Record<string, HairCoverageProfile>> = {
  opaque_v1: 'opaque-v1',
  opaque: 'opaque-v1',
  alpha_to_coverage_v1: 'alpha-to-coverage-v1',
  alpha_to_coverage: 'alpha-to-coverage-v1',
  a2c: 'alpha-to-coverage-v1',
};

/** Resolve author-facing aliases without silently accepting an unknown geometry style. */
export function resolveAgentAvatarHairStyle(style: string): AgentAvatarHairStyle | undefined {
  return HAIR_STYLE_ALIASES[
    style
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
  ];
}

/** Resolve source spellings without relabelling an unknown groom implementation. */
export function resolveAgentAvatarGroomProfile(
  profile: string
): AgentAvatarGroomProfile | undefined {
  return GROOM_PROFILE_ALIASES[
    profile
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
  ];
}

/** Resolve source spellings without silently accepting an unknown coverage implementation. */
export function resolveAgentAvatarHairCoverageProfile(
  profile: string
): HairCoverageProfile | undefined {
  return HAIR_COVERAGE_PROFILE_ALIASES[
    profile
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
  ];
}

export interface HairOptions {
  buildScale?: number;
  heightScale?: number;
  /** Face topology whose scalp surface the opt-in groom follows. */
  faceTopology?: AgentAvatarMeshOptions['faceTopology'];
  /** Neutral-head width multiplier used to align the scalp and eyes. */
  faceWidth?: AgentAvatarMeshOptions['faceWidth'];
  /** Neutral-head length multiplier used to align the scalp shell. */
  faceLength?: AgentAvatarMeshOptions['faceLength'];
  /** Deterministic source-authored geometry profile (default `medium_wavy`). */
  style?: AgentAvatarHairStyle;
  /** Scalp guide roots (default comes from the selected style profile). */
  guides?: number;
  /** Cards per guide for volume (default comes from the selected style profile). */
  cardsPerGuide?: number;
  /** Points per guide curve (default comes from the selected style profile). */
  segments?: number;
  /** Card width in metres (default comes from the selected style profile). */
  cardWidth?: number;
  /** Tip length in metres (default comes from the selected style profile). */
  length?: number;
  /** Native root-flow/card-orientation algorithm. Compatibility default is `radial-cards-v1`. */
  groomProfile?: AgentAvatarGroomProfile;
  /** Extra shell offset in metres for the scalp-flow root. */
  rootLift?: number;
  /** Tip width divided by root width, clamped to 0.02..1. */
  tipTaper?: number;
  /** Additional front-hairline retraction, clamped to 0..0.3. */
  hairlineBias?: number;
  /** Signed crown-flow rotation around the scalp normal, clamped to -1..1. */
  crownWhorl?: number;
  /** Angular groom clusters. Values below 2 disable clustering and preserve legacy geometry. */
  clusterCount?: number;
  /** Fraction of each cluster sector occupied by roots (0.08..1). */
  clusterSpread?: number;
}

// ── small vec helpers ──
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scl = (a: Vec3, s: number): Vec3 => v(a.x * s, a.y * s, a.z * s);
const cross = (a: Vec3, b: Vec3): Vec3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const nrm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return v(a.x / l, a.y / l, a.z / l);
};
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(scl(a, 1 - t), scl(b, t));
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
const p95 = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
};

/**
 * Build procedural hair as card-strips over the scalp dome. Deterministic (golden-angle
 * Fibonacci seeding — no RNG). All vertices skin to the head bone.
 */
export function buildAgentAvatarHair(o: HairOptions = {}): HairMeshData {
  const bs = o.buildScale ?? 1;
  const hScale = o.heightScale ?? 1;
  const profile = HAIR_STYLE_PROFILES[o.style ?? 'medium_wavy'];
  const guideCount = o.guides ?? profile.guides;
  const cardsPerGuide = o.cardsPerGuide ?? profile.cardsPerGuide;
  const segs = o.segments ?? profile.segments;
  const cardW = (o.cardWidth ?? profile.cardWidth) * bs;
  const tipLen = (o.length ?? profile.length) * bs;
  const groomProfile = o.groomProfile ?? 'radial-cards-v1';
  const layeredDensity = groomProfile === 'scalp-flow-density-v6';
  const massedSilhouette = groomProfile === 'scalp-flow-volume-v5' || layeredDensity;
  const portraitFraming = groomProfile === 'scalp-flow-portrait-v4' || massedSilhouette;
  const breakup = groomProfile === 'scalp-flow-breakup-v3' || portraitFraming;
  const containment = groomProfile === 'scalp-flow-containment-v2' || breakup;
  const scalpFlow = groomProfile === 'scalp-flow-v1' || containment;
  const neutralScalp = scalpFlow && o.faceTopology === 'neutral-anatomical-v2';
  const rootLift = scalpFlow ? clamp(o.rootLift ?? 0.003, 0, 0.02) * bs : 0;
  const tipTaper = scalpFlow ? clamp(o.tipTaper ?? 0.12, 0.02, 1) : 1;
  const hairlineBias = scalpFlow ? clamp(o.hairlineBias ?? 0.12, 0, 0.3) : 0;
  const crownWhorl = scalpFlow ? clamp(o.crownWhorl ?? 0, -1, 1) : 0;
  const clusterCount = scalpFlow ? Math.max(0, Math.min(64, Math.round(o.clusterCount ?? 0))) : 0;
  const clusterSpread = clusterCount >= 2 ? clamp(o.clusterSpread ?? 0.62, 0.08, 1) : 1;
  const faceWidth = clamp(o.faceWidth ?? 1, 0.84, 1.2);
  const faceLength = clamp(o.faceLength ?? 1, 0.86, 1.16);

  const bind = computeBindWorld();
  const head = getTranslation(bind.get('head')!); // scalp base, world-bind y≈1.51
  const headR = 0.09 * bs; // radiusFor('head')
  const center = add(head, v(0, (neutralScalp ? 0.104 : 0.06) * bs, 0));
  const shellR = headR + 0.006 * bs; // sit just off the skull
  const scalpRadius = neutralScalp
    ? v(
        (0.09 * 1.06 * faceWidth + 0.006) * bs,
        (0.2 * 0.62 * faceLength + 0.006) * bs,
        (0.09 * 1.08 + 0.006) * bs
      )
    : v(shellR, shellR, shellR);
  const scalpNormal = (dir: Vec3): Vec3 =>
    nrm(v(dir.x / scalpRadius.x, dir.y / scalpRadius.y, dir.z / scalpRadius.z));
  const scalpPoint = (dir: Vec3, lift = 0): Vec3 => {
    const surface = add(
      center,
      v(dir.x * scalpRadius.x, dir.y * scalpRadius.y, dir.z * scalpRadius.z)
    );
    return lift === 0 ? surface : add(surface, scl(scalpNormal(dir), lift));
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const tangents: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ji: number[] = [];
  const jw: number[] = [];
  const rootTangentRadialDots: number[] = [];
  let emittedGuideCount = 0;
  let frontalOcclusionVertexCount = 0;
  let containmentAdjustedVertexCount = 0;
  let scalpPenetrationVertexCount = 0;
  let scalpCapVertexCount = 0;
  let scalpCapTriangleCount = 0;
  let flyawayGuideCount = 0;
  let flyawayCardCount = 0;
  let browCardCount = 0;
  let lashCardCount = 0;
  let facialFramingVertexCount = 0;
  let massGuideCount = 0;
  let massCardCount = 0;
  let scalpCapMaxLift = 0;

  const scalpMetric = (position: Vec3, clearance = 0): number => {
    const rel = sub(position, center);
    return Math.hypot(
      rel.x / (scalpRadius.x + clearance),
      rel.y / (scalpRadius.y + clearance),
      rel.z / (scalpRadius.z + clearance)
    );
  };
  const containToScalpExterior = (position: Vec3): Vec3 => {
    if (!containment) return position;
    const clearance = 0.0015 * bs;
    const rel = sub(position, center);
    const metric = scalpMetric(position, clearance);
    if (metric >= 1) return position;
    containmentAdjustedVertexCount++;
    return add(center, scl(rel, 1 / Math.max(metric, 1e-6)));
  };

  const pushHairVertex = (
    position: Vec3,
    normal: Vec3,
    tangent: Vec3,
    strandT: number,
    uvX = 0.5,
    uvY = strandT
  ): void => {
    const containedPosition = containToScalpExterior(position);
    positions.push(containedPosition.x, containedPosition.y, containedPosition.z);
    normals.push(normal.x, normal.y, normal.z);
    tangents.push(tangent.x, tangent.y, tangent.z, strandT);
    uvs.push(uvX, uvY);
    ji.push(HEAD_INDEX);
    jw.push(1);
    const rel = sub(containedPosition, head);
    if (
      Math.abs(rel.x) < headR * 0.9 &&
      rel.y > 0.01 * bs &&
      rel.y < headR * 1.25 &&
      rel.z > headR * 0.35
    ) {
      frontalOcclusionVertexCount++;
    }
    if (containment && scalpMetric(containedPosition) < 1 - 1e-6) {
      scalpPenetrationVertexCount++;
    }
  };

  if (scalpFlow) {
    const radialSegments = 28;
    const rings = 7;
    const capLift = rootLift * 0.45;
    const capClumpCount =
      clusterCount >= 5 ? Math.min(5, Math.max(3, Math.round(clusterCount / 2))) : 4;
    const topMassLift = massedSilhouette ? (layeredDensity ? 0.0075 : 0.012) * bs : 0;
    scalpCapMaxLift = capLift + topMassLift;
    const topFlow = v(0, 0, -1);
    pushHairVertex(
      scalpPoint(v(0, 1, 0), capLift + topMassLift),
      v(0, 1, 0),
      topFlow,
      0,
      0.5,
      -0.001
    );
    scalpCapVertexCount++;
    for (let ring = 1; ring <= rings; ring++) {
      const ringT = ring / rings;
      for (let segment = 0; segment < radialSegments; segment++) {
        const theta = (segment / radialSegments) * Math.PI * 2;
        const frontness = Math.max(0, Math.sin(theta));
        const templeRecession =
          frontness * Math.pow(Math.sin(theta * 2), 2) * (0.055 + hairlineBias * 0.06);
        const centerPoint = Math.pow(frontness, 8) * 0.045;
        const partOffset =
          frontness * Math.cos(theta) * clamp(profile.sweepX * 0.06, -0.024, 0.024);
        const maxPhi =
          1.29 -
          Math.sqrt(frontness) * (0.26 + hairlineBias * 0.38) -
          templeRecession +
          centerPoint +
          partOffset;
        const phi = maxPhi * ringT;
        const clumpWave = 0.5 + 0.5 * Math.sin(theta * capClumpCount + ringT * 2.1);
        const massLift = massedSilhouette
          ? layeredDensity
            ? (0.004 + clumpWave * 0.005) * (1 - ringT * 0.3) * bs
            : (0.006 + clumpWave * 0.008) * (1 - ringT * 0.3) * bs
          : 0;
        scalpCapMaxLift = Math.max(scalpCapMaxLift, capLift + massLift);
        const dir = v(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta)
        );
        const normal = scalpNormal(dir);
        const desired = v(profile.sweepX * 0.45, -0.32, -1 + profile.sweepZ);
        const projected = sub(desired, scl(normal, dot(desired, normal)));
        const crownT = clamp((dir.y - 0.35) / 0.6, 0, 1);
        const crownWeight = crownT * crownT * (3 - 2 * crownT);
        const whorl = cross(v(0, 1, 0), normal);
        const crownFlow =
          len(whorl) > 1e-6 ? add(projected, scl(nrm(whorl), crownWhorl * crownWeight)) : projected;
        const tangent = len(crownFlow) > 1e-6 ? nrm(crownFlow) : topFlow;
        pushHairVertex(
          scalpPoint(dir, capLift + massLift),
          normal,
          tangent,
          ringT,
          segment / radialSegments,
          -ringT
        );
        scalpCapVertexCount++;
      }
    }
    const firstRing = 1;
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      indices.push(0, firstRing + segment, firstRing + next);
    }
    scalpCapTriangleCount += radialSegments;
    for (let ring = 2; ring <= rings; ring++) {
      const previousBase = 1 + (ring - 2) * radialSegments;
      const currentBase = 1 + (ring - 1) * radialSegments;
      for (let segment = 0; segment < radialSegments; segment++) {
        const next = (segment + 1) % radialSegments;
        const a = previousBase + segment;
        const b = previousBase + next;
        const c = currentBase + segment;
        const d = currentBase + next;
        indices.push(a, c, b, b, c, d);
      }
      scalpCapTriangleCount += radialSegments * 2;
    }
  }

  if (massedSilhouette && neutralScalp) {
    const massGuideBudget = Math.min(24, Math.max(12, Math.round(guideCount / 8)));
    const massSegments = 5;
    const massLength = layeredDensity
      ? Math.min(tipLen * 0.42, 0.045 * bs)
      : Math.min(tipLen * 0.52, 0.065 * bs);
    const massWidth = layeredDensity
      ? Math.max(cardW * 2.5, 0.013 * bs)
      : Math.max(cardW * 3.4, 0.018 * bs);
    for (let guide = 0; guide < massGuideBudget; guide++) {
      const guideT = massGuideBudget <= 1 ? 0 : guide / (massGuideBudget - 1);
      const phi = 0.2 + guideT * 0.92;
      const theta = guide * 2.399963;
      const dir = v(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );
      if (dir.z > 0.08 && dir.y < 0.78 + hairlineBias * 0.55) continue;
      const rootNormal = scalpNormal(dir);
      const ridge =
        (layeredDensity
          ? 0.004 + 0.003 * (0.5 + 0.5 * Math.sin(theta * 3.0))
          : 0.008 + 0.005 * (0.5 + 0.5 * Math.sin(theta * 3.0))) * bs;
      const root = scalpPoint(dir, rootLift + ridge);
      const side = nrm(cross(rootNormal, v(0, 1, 0)));
      const authoredBack = v(profile.sweepX * 0.45, -0.24, -1 + profile.sweepZ);
      const projectedBack = sub(authoredBack, scl(rootNormal, dot(authoredBack, rootNormal)));
      const tangent = len(projectedBack) > 1e-6 ? nrm(projectedBack) : nrm(cross(side, rootNormal));
      const curve: Vec3[] = [];
      for (let segment = 0; segment < massSegments; segment++) {
        const strandT = segment / (massSegments - 1);
        curve.push(
          add(
            root,
            add(
              scl(tangent, massLength * strandT),
              add(
                scl(rootNormal, ridge * 0.42 * Math.sin(Math.PI * strandT)),
                v(0, -massLength * 0.22 * strandT * strandT, 0)
              )
            )
          )
        );
      }
      const massCardsPerGuide = layeredDensity ? 3 : 2;
      for (let card = 0; card < massCardsPerGuide; card++) {
        const roll = (card / massCardsPerGuide) * Math.PI;
        const base = positions.length / 3;
        for (let segment = 0; segment < massSegments; segment++) {
          const p = curve[segment];
          const flow =
            segment < massSegments - 1
              ? nrm(sub(curve[segment + 1], curve[segment]))
              : nrm(sub(curve[segment], curve[segment - 1]));
          const right0 = nrm(cross(flow, rootNormal));
          const right = nrm(
            add(scl(right0, Math.cos(roll)), scl(cross(flow, right0), Math.sin(roll)))
          );
          const faceNormal = nrm(cross(right, flow));
          const strandT = segment / (massSegments - 1);
          const width = massWidth * (1 - strandT * (layeredDensity ? 0.32 : 0.55));
          for (const edge of [-1, 1] as const) {
            pushHairVertex(
              add(p, scl(right, edge * width * 0.5)),
              faceNormal,
              flow,
              strandT,
              edge < 0 ? 0 : 1,
              strandT
            );
          }
          if (segment < massSegments - 1) {
            const offset = base + segment * 2;
            indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
          }
        }
        massCardCount++;
      }
      massGuideCount++;
    }
  }

  for (let g = 0; g < guideCount; g++) {
    const t01 = g / guideCount;
    const phi = Math.acos(1 - t01); // 0..~π/2 → upper-hemisphere bias
    const legacyTheta = g * 2.399963; // golden angle
    const clusterIndex = clusterCount >= 2 ? g % clusterCount : 0;
    const memberIndex = clusterCount >= 2 ? Math.floor(g / clusterCount) : 0;
    const memberPhase = (memberIndex * 0.61803398875) % 1;
    const clusterCenter =
      clusterCount >= 2 ? ((clusterIndex + 0.5) / clusterCount) * Math.PI * 2 : legacyTheta;
    const theta =
      clusterCount >= 2
        ? clusterCenter + (memberPhase - 0.5) * ((Math.PI * 2) / clusterCount) * clusterSpread
        : legacyTheta;
    const dir = v(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    // Hairline mask: no hair under the crown (y<-0.1) or sprouting off the front face (+Z).
    if (dir.y < -0.1) continue;
    if (
      scalpFlow ? dir.z > 0.08 && dir.y < 0.78 + hairlineBias * 0.55 : dir.z > 0.55 && dir.y < 0.35
    ) {
      continue;
    }
    const rootNormal = scalpNormal(dir);
    const root = scalpFlow ? scalpPoint(dir, rootLift) : add(center, scl(dir, shellR));

    // Guide curve: hug the skull at the root, fall under gravity toward the tip.
    const curve: Vec3[] = [];
    const side = nrm(cross(rootNormal, v(0, 1, 0)));
    const authoredBack = v(profile.sweepX * 0.45, -0.32, -1 + profile.sweepZ);
    const projectedBack = sub(authoredBack, scl(rootNormal, dot(authoredBack, rootNormal)));
    const crownT = clamp((dir.y - 0.35) / 0.6, 0, 1);
    const crownWeight = crownT * crownT * (3 - 2 * crownT);
    const whorl = cross(v(0, 1, 0), rootNormal);
    const crownFlow =
      len(whorl) > 1e-6
        ? add(projectedBack, scl(nrm(whorl), crownWhorl * crownWeight))
        : projectedBack;
    const scalpTangent = len(crownFlow) > 1e-6 ? nrm(crownFlow) : nrm(cross(side, rootNormal));
    for (let i = 0; i < segs; i++) {
      const u = i / (segs - 1);
      const wave =
        Math.sin(theta * 0.5 + u * Math.PI * 2 * profile.waveTurns) * profile.waveAmplitude * u;
      const firstStepU = 1 / (segs - 1);
      const gravityU = clamp((u - firstStepU) / Math.max(1e-6, 1 - firstStepU), 0, 1);
      const styledFlow = scalpFlow
        ? add(
            lerp(scalpTangent, v(0, -1, 0), clamp(gravityU * profile.gravityBlend, 0, 1)),
            scl(side, wave)
          )
        : add(
            add(
              lerp(dir, v(0, -1, 0), u * profile.gravityBlend),
              v(profile.sweepX * u, 0, profile.sweepZ * u)
            ),
            scl(side, wave)
          );
      const flow = nrm(styledFlow);
      curve.push(i === 0 ? root : add(curve[i - 1], scl(flow, tipLen / (segs - 1))));
    }
    if (curve.length > 1) {
      rootTangentRadialDots.push(Math.abs(dot(nrm(sub(curve[1], curve[0])), rootNormal)));
    }
    emittedGuideCount++;

    for (let c = 0; c < cardsPerGuide; c++) {
      const roll = (c / cardsPerGuide) * Math.PI;
      const vbase = positions.length / 3;
      for (let i = 0; i < segs; i++) {
        const p = curve[i];
        const seg = i < segs - 1 ? sub(curve[i + 1], curve[i]) : sub(curve[i], curve[i - 1]);
        const tan = nrm(seg);
        const up = Math.abs(tan.y) > 0.99 ? v(1, 0, 0) : v(0, 1, 0);
        const scalpRight = cross(tan, rootNormal);
        const right0 = scalpFlow && len(scalpRight) > 1e-6 ? nrm(scalpRight) : nrm(cross(tan, up));
        // roll the card around the strand axis for volume
        const right = nrm(
          add(scl(right0, Math.cos(roll)), scl(cross(tan, right0), Math.sin(roll)))
        );
        const faceN = nrm(cross(right, tan));
        const strandT = i / (segs - 1);
        const smoothT = strandT * strandT * (3 - 2 * strandT);
        const widthScale = scalpFlow ? 1 - (1 - tipTaper) * smoothT : 1;
        const off = scl(right, cardW * widthScale * 0.5);
        for (const s of [-1, 1]) {
          const vp = add(p, scl(off, s));
          pushHairVertex(vp, faceN, tan, strandT, s < 0 ? 0 : 1, strandT);
        }
        if (i < segs - 1) {
          const b = vbase + i * 2;
          indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
    }
  }

  if (breakup) {
    const flyawaySegments = 4;
    const flyawayLength = Math.min(tipLen * 0.42, 0.045 * bs);
    const flyawayWidth = cardW * 0.42;
    for (let guide = 0; guide < 12; guide++) {
      const theta = guide * 2.399963;
      const dir = nrm(v(Math.cos(theta) * 0.58, 0.78, Math.sin(theta) * 0.58));
      const rootNormal = scalpNormal(dir);
      const root = scalpPoint(dir, rootLift + 0.002 * bs);
      const sideFlow = nrm(cross(rootNormal, v(0, 1, 0)));
      const tangent = nrm(
        add(
          scl(rootNormal, 0.52 + (guide % 3) * 0.08),
          add(scl(sideFlow, guide % 2 === 0 ? 0.34 : -0.34), v(0, 0.18, -0.2))
        )
      );
      const right = nrm(cross(tangent, rootNormal));
      const faceNormal = nrm(cross(right, tangent));
      const base = positions.length / 3;
      for (let segment = 0; segment < flyawaySegments; segment++) {
        const strandT = segment / (flyawaySegments - 1);
        const curve = add(
          root,
          add(
            scl(tangent, flyawayLength * strandT),
            scl(rootNormal, flyawayLength * 0.16 * strandT * strandT)
          )
        );
        const width = flyawayWidth * (1 - strandT * 0.86);
        for (const side of [-1, 1] as const) {
          pushHairVertex(
            add(curve, scl(right, side * width * 0.5)),
            faceNormal,
            tangent,
            strandT,
            side < 0 ? 0 : 1,
            strandT
          );
        }
        if (segment < flyawaySegments - 1) {
          const offset = base + segment * 2;
          indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
        }
      }
      flyawayGuideCount++;
      flyawayCardCount++;
    }
  }

  if (portraitFraming && neutralScalp) {
    const framingVertexStart = positions.length / 3;
    const eyeY = head.y + 0.12 * bs;
    const faceZ = head.z + headR * 1.12;
    const pushFacialRibbon = (
      ribbonCenter: Vec3,
      halfWidth: number,
      archHeight: number,
      thickness: number,
      segmentCount: number
    ): void => {
      const base = positions.length / 3;
      for (let segment = 0; segment <= segmentCount; segment++) {
        const u = segment / segmentCount;
        const x = (u * 2 - 1) * halfWidth;
        const arch = archHeight * (1 - Math.pow(u * 2 - 1, 2));
        for (const edge of [-1, 1] as const) {
          pushHairVertex(
            v(ribbonCenter.x + x, ribbonCenter.y + arch + edge * thickness * 0.5, ribbonCenter.z),
            v(0, 0, 1),
            v(1, 0, 0),
            u,
            edge < 0 ? 0 : 1,
            u
          );
        }
      }
      for (let segment = 0; segment < segmentCount; segment++) {
        const a = base + segment * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };

    for (const side of [-1, 1] as const) {
      const eyeX = head.x + side * 0.035 * bs * faceWidth;
      pushFacialRibbon(v(eyeX, eyeY + 0.019 * bs, faceZ), 0.026 * bs, 0.006 * bs, 0.0042 * bs, 22);
      browCardCount++;
      pushFacialRibbon(
        v(eyeX, eyeY + 0.0062 * bs, faceZ + 0.001 * bs),
        0.019 * bs,
        0.0025 * bs,
        0.0014 * bs,
        18
      );
      pushFacialRibbon(
        v(eyeX, eyeY - 0.0068 * bs, faceZ + 0.0005 * bs),
        0.017 * bs,
        -0.0015 * bs,
        0.001 * bs,
        16
      );
      lashCardCount += 2;
    }
    facialFramingVertexCount = positions.length / 3 - framingVertexStart;
  }

  // Uniform height scale about the floor (matches the body's heightScale).
  const pos = new Float32Array(positions);
  if (hScale !== 1) for (let i = 0; i < pos.length; i++) pos[i] *= hScale;

  return {
    positions: pos,
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    jointIndices: new Uint32Array(ji),
    jointWeights: new Float32Array(jw),
    vertexCount: positions.length / 3,
    groom: {
      schemaVersion: layeredDensity
        ? 'holoscript.agent-avatar-groom-geometry.v6'
        : massedSilhouette
          ? 'holoscript.agent-avatar-groom-geometry.v5'
          : portraitFraming
            ? 'holoscript.agent-avatar-groom-geometry.v4'
            : breakup
              ? 'holoscript.agent-avatar-groom-geometry.v3'
              : containment
                ? 'holoscript.agent-avatar-groom-geometry.v2'
                : 'holoscript.agent-avatar-groom-geometry.v1',
      profile: groomProfile,
      rootLift: rootLift / bs,
      tipTaper,
      hairlineBias,
      crownWhorl,
      ...(clusterCount >= 2 ? { clusterCount, clusterSpread } : {}),
      requestedGuideCount: guideCount,
      emittedGuideCount,
      cardCount: emittedGuideCount * cardsPerGuide + flyawayCardCount + massCardCount,
      scalpSurface: neutralScalp ? 'neutral-anatomical-ellipsoid' : 'legacy-sphere',
      scalpCapVertexCount,
      scalpCapTriangleCount,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
      rootTangentRadialDotP95: p95(rootTangentRadialDots),
      frontalOcclusionVertexCount,
      ...(containment
        ? {
            containmentProfile: 'ellipsoidal-scalp-exterior-v1' as const,
            containmentAdjustedVertexCount,
            scalpPenetrationVertexCount,
          }
        : {}),
      ...(breakup
        ? {
            breakupProfile: 'contained-flyaway-breakup-v1' as const,
            flyawayGuideCount,
            flyawayCardCount,
          }
        : {}),
      ...(portraitFraming
        ? {
            facialFramingProfile: 'portrait-brow-lash-ribbons-v1' as const,
            browCardCount,
            lashCardCount,
            facialFramingVertexCount,
          }
        : {}),
      ...(massedSilhouette
        ? {
            silhouetteProfile: 'massed-silhouette-clumps-v1' as const,
            massGuideCount,
            massCardCount,
            scalpCapMaxLift: scalpCapMaxLift / bs,
          }
        : {}),
      ...(layeredDensity
        ? {
            densityLayerProfile: 'cross-card-undercoat-v1' as const,
            densityLayerCardCount: massCardCount,
          }
        : {}),
    },
  };
}

/**
 * Two eyeball spheres at the front of the head, weighted to the head bone (so they ride the
 * head). Emits the same 6-array format as hair; rendered with the refractive-eye material.
 */
export function buildAgentAvatarEyes(
  o: {
    buildScale?: number;
    heightScale?: number;
    faceTopology?: AgentAvatarMeshOptions['faceTopology'];
    orbitalProfile?: AgentAvatarMeshOptions['orbitalProfile'];
    eyeRecess?: number;
    eyeScale?: number;
    faceWidth?: AgentAvatarMeshOptions['faceWidth'];
  } = {}
): HairMeshData {
  const bs = o.buildScale ?? 1;
  const hScale = o.heightScale ?? 1;
  const bind = computeBindWorld();
  const head = getTranslation(bind.get('head')!); // y≈1.51
  const headR = 0.09 * bs;
  const anatomical = o.faceTopology === 'neutral-anatomical-v2';
  const r = (anatomical ? 0.0145 : 0.02) * bs * clamp(o.eyeScale ?? 1, 0.72, 1.08);
  const eyeY = head.y + 0.12 * bs;
  const recessed =
    o.orbitalProfile === 'recessed-lids-v1' ||
    o.orbitalProfile === 'anatomical-lid-fold-v2' ||
    o.orbitalProfile === 'anatomical-lid-blend-v3';
  const eyeRecess = recessed ? Math.max(0, Math.min(0.45, o.eyeRecess ?? 0.28)) : 0;
  const eyeZ = head.z + headR * (anatomical ? 0.91 : 0.85) - r * eyeRecess;
  const eyeX = 0.035 * bs * clamp(o.faceWidth ?? 1, 0.84, 1.2);
  const centers: Vec3[] = [v(head.x - eyeX, eyeY, eyeZ), v(head.x + eyeX, eyeY, eyeZ)];

  const positions: number[] = [];
  const normals: number[] = [];
  const tangents: number[] = [];
  const indices: number[] = [];
  const ji: number[] = [];
  const jw: number[] = [];
  const lat = 8;
  const lon = 10;

  for (const c of centers) {
    const base = positions.length / 3;
    for (let y = 0; y <= lat; y++) {
      const theta = (y / lat) * Math.PI;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      for (let x = 0; x <= lon; x++) {
        const phi = (x / lon) * Math.PI * 2;
        const n = v(Math.cos(phi) * st, ct, Math.sin(phi) * st);
        positions.push(c.x + r * n.x, c.y + r * n.y, c.z + r * n.z);
        normals.push(n.x, n.y, n.z);
        tangents.push(0, 1, 0, 0);
        ji.push(HEAD_INDEX);
        jw.push(1.0);
      }
    }
    const stride = lon + 1;
    for (let y = 0; y < lat; y++) {
      for (let x = 0; x < lon; x++) {
        const a = base + y * stride + x;
        const b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

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
/**
 * Build source-selectable layered ocular geometry.
 *
 * Each eye is emitted as four actual mesh regions (sclera sphere, iris disc, pupil disc, and
 * transparent cornea cap). The left eye is fully emitted before the right eye so the existing
 * native blink channel can continue splitting the aggregate eye vertex range in half.
 */
export function buildAgentAvatarOcularRegions(
  o: {
    buildScale?: number;
    heightScale?: number;
    faceTopology?: AgentAvatarMeshOptions['faceTopology'];
    orbitalProfile?: AgentAvatarMeshOptions['orbitalProfile'];
    eyeRecess?: number;
    eyeScale?: number;
    faceWidth?: AgentAvatarMeshOptions['faceWidth'];
    irisScale?: number;
    pupilScale?: number;
    lidOpening?: number;
    ocularProfile?: AgentAvatarOcularProfile;
  } = {}
): OcularMeshData {
  const bs = o.buildScale ?? 1;
  const hScale = o.heightScale ?? 1;
  const bind = computeBindWorld();
  const head = getTranslation(bind.get('head')!);
  const headR = 0.09 * bs;
  const anatomical = o.faceTopology === 'neutral-anatomical-v2';
  const radius = (anatomical ? 0.0145 : 0.02) * bs * clamp(o.eyeScale ?? 1, 0.72, 1.08);
  const eyeY = head.y + 0.12 * bs;
  const recessed =
    o.orbitalProfile === 'recessed-lids-v1' ||
    o.orbitalProfile === 'anatomical-lid-fold-v2' ||
    o.orbitalProfile === 'anatomical-lid-blend-v3';
  const eyeRecess = recessed ? Math.max(0, Math.min(0.45, o.eyeRecess ?? 0.28)) : 0;
  const eyeZ = head.z + headR * (anatomical ? 0.91 : 0.85) - radius * eyeRecess;
  const eyeX = 0.035 * bs * clamp(o.faceWidth ?? 1, 0.84, 1.2);
  const centers: Vec3[] = [v(head.x - eyeX, eyeY, eyeZ), v(head.x + eyeX, eyeY, eyeZ)];
  const irisScale = Math.max(0.34, Math.min(0.62, o.irisScale ?? 0.48));
  const pupilScale = Math.max(0.2, Math.min(0.72, o.pupilScale ?? 0.42));
  const ocularProfile = o.ocularProfile ?? 'layered-ocular-v1';
  const calibrated = ocularProfile === 'layered-ocular-calibrated-v3';
  const tearfilm = ocularProfile === 'layered-ocular-tearfilm-v2' || calibrated;
  const lidOpening = clamp(o.lidOpening ?? 0.54, 0.42, 0.78);

  const positions: number[] = [];
  const normals: number[] = [];
  const tangents: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ji: number[] = [];
  const jw: number[] = [];
  let tearMeniscusIndexCount = 0;
  const regionRanges: OcularMeshData['regionRanges'] = {
    sclera: [],
    iris: [],
    pupil: [],
    cornea: [],
  };

  const appendVertex = (position: Vec3, normal: Vec3, uv: [number, number]): number => {
    const index = positions.length / 3;
    positions.push(position.x, position.y, position.z);
    normals.push(normal.x, normal.y, normal.z);
    tangents.push(1, 0, 0, 0);
    uvs.push(uv[0], uv[1]);
    ji.push(HEAD_INDEX);
    jw.push(1);
    return index;
  };

  const recordRegion = (region: AgentAvatarOcularRegion, start: number): void => {
    regionRanges[region].push({ indexStart: start, indexCount: indices.length - start });
  };

  const appendSphere = (center: Vec3): void => {
    const start = indices.length;
    const lat = calibrated ? 12 : 10;
    const lon = calibrated ? 20 : 16;
    const base = positions.length / 3;
    for (let y = 0; y <= lat; y++) {
      const theta = (y / lat) * Math.PI;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      for (let x = 0; x <= lon; x++) {
        const phi = (x / lon) * Math.PI * 2;
        const normal = v(Math.cos(phi) * st, ct, Math.sin(phi) * st);
        appendVertex(
          v(
            center.x + radius * normal.x,
            center.y + radius * normal.y,
            center.z + radius * normal.z
          ),
          normal,
          [x / lon, y / lat]
        );
      }
    }
    const stride = lon + 1;
    for (let y = 0; y < lat; y++) {
      for (let x = 0; x < lon; x++) {
        const a = base + y * stride + x;
        const b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    recordRegion('sclera', start);
  };

  const appendDisc = (
    center: Vec3,
    discRadius: number,
    zOffset: number,
    region: 'iris' | 'pupil'
  ): void => {
    const start = indices.length;
    const segments = calibrated ? 32 : 24;
    const z = center.z + zOffset;
    const base = appendVertex(v(center.x, center.y, z), v(0, 0, 1), [0.5, 0.5]);
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      appendVertex(v(center.x + x * discRadius, center.y + y * discRadius, z), v(0, 0, 1), [
        0.5 + x * 0.5,
        0.5 + y * 0.5,
      ]);
    }
    for (let segment = 0; segment < segments; segment++) {
      indices.push(base, base + segment + 1, base + segment + 2);
    }
    recordRegion(region, start);
  };

  const appendCornea = (center: Vec3): void => {
    const start = indices.length;
    const segments = calibrated ? 32 : 24;
    const rings = calibrated ? 6 : 5;
    const maxAngle = Math.PI * (calibrated ? 0.235 : 0.26);
    const corneaRadiusScale = calibrated ? 1.038 : 1.055;
    const corneaRadius = radius * corneaRadiusScale;
    const centerVertex = appendVertex(
      v(center.x, center.y, center.z + corneaRadius),
      v(0, 0, 1),
      [0.5, 0.5]
    );
    let previousRingStart = -1;
    for (let ring = 1; ring <= rings; ring++) {
      const angle = (ring / rings) * maxAngle;
      const radial = Math.sin(angle);
      const nz = Math.cos(angle);
      const ringStart = positions.length / 3;
      for (let segment = 0; segment <= segments; segment++) {
        const phi = (segment / segments) * Math.PI * 2;
        const nx = Math.cos(phi) * radial;
        const ny = Math.sin(phi) * radial;
        appendVertex(
          v(
            center.x + corneaRadius * nx,
            center.y + corneaRadius * ny,
            center.z + corneaRadius * nz
          ),
          v(nx, ny, nz),
          [0.5 + nx * 0.5, 0.5 + ny * 0.5]
        );
      }
      if (ring === 1) {
        for (let segment = 0; segment < segments; segment++) {
          indices.push(centerVertex, ringStart + segment, ringStart + segment + 1);
        }
      } else {
        for (let segment = 0; segment < segments; segment++) {
          const a = previousRingStart + segment;
          const b = ringStart + segment;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      previousRingStart = ringStart;
    }
    if (tearfilm) {
      const arcSegments = 16;
      const arcStart = positions.length / 3;
      for (let row = 0; row < 2; row++) {
        const angularRadius = maxAngle * (0.72 + row * 0.16);
        const radial = Math.sin(angularRadius);
        const nz = Math.cos(angularRadius);
        for (let segment = 0; segment <= arcSegments; segment++) {
          const u = segment / arcSegments;
          const phi = Math.PI * (1.08 + u * 0.84);
          const nx = Math.cos(phi) * radial;
          const ny = Math.sin(phi) * radial;
          appendVertex(
            v(
              center.x + corneaRadius * nx,
              center.y + corneaRadius * ny,
              center.z + corneaRadius * nz + row * 0.0004 * bs
            ),
            v(nx, ny, nz),
            [u, 1.2 + row * 0.1]
          );
        }
      }
      const stride = arcSegments + 1;
      for (let segment = 0; segment < arcSegments; segment++) {
        const a = arcStart + segment;
        const b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
        tearMeniscusIndexCount += 6;
      }
    }
    recordRegion('cornea', start);
  };

  for (const center of centers) {
    appendSphere(center);
    const irisRadius = radius * irisScale;
    appendDisc(center, irisRadius, radius * 1.012, 'iris');
    appendDisc(center, irisRadius * pupilScale, radius * 1.018, 'pupil');
    appendCornea(center);
  }

  const scaledPositions = new Float32Array(positions);
  if (hScale !== 1) {
    for (let index = 0; index < scaledPositions.length; index++) {
      scaledPositions[index] *= hScale;
    }
  }

  return {
    positions: scaledPositions,
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    jointIndices: new Uint32Array(ji),
    jointWeights: new Float32Array(jw),
    vertexCount: positions.length / 3,
    regionRanges,
    receipt: {
      schemaVersion: calibrated
        ? 'holoscript.agent-avatar-ocular-geometry.v3'
        : tearfilm
          ? 'holoscript.agent-avatar-ocular-geometry.v2'
          : 'holoscript.agent-avatar-ocular-geometry.v1',
      profile: ocularProfile,
      eyeCount: 2,
      regionCount: 4,
      ...(tearfilm
        ? {
            tearMeniscusProfile: 'lower-cornea-meniscus-v1' as const,
            tearMeniscusIndexCount,
          }
        : {}),
      ...(calibrated
        ? {
            calibrationProfile: 'portrait-ocular-balance-v1' as const,
            irisScale,
            pupilScale,
            lidOpening,
            corneaRadiusScale: 1.038,
          }
        : {}),
    },
  };
}

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
  groom?: AgentAvatarGroomGeometryReceipt;
  anatomy: AgentAvatarMeshData['anatomy'];
  jointDeformation?: AgentAvatarMeshData['jointDeformation'];
  handSurface?: AgentAvatarMeshData['handSurface'];
  facialLandmarks?: AgentAvatarMeshData['facialLandmarks'];
  garment?: AgentAvatarGarmentGeometryReceipt;
  ocular?: AgentAvatarOcularGeometryReceipt;
  ocularProfile: AgentAvatarOcularProfile;
  orbital: AgentAvatarMeshData['orbital'];
  /** H4J analytic body/head UV atlas receipt, present only when explicitly authored. */
  skinUv?: AgentAvatarSkinUvReceipt;
  bodyVertexRange: { vertexStart: number; vertexCount: number };
  hairVertexRange: { vertexStart: number; vertexCount: number };
  eyeVertexRange: { vertexStart: number; vertexCount: number };
  bodyRange: { indexStart: number; indexCount: number };
  /** Body index slices with keratin nail plates removed for the SSS skin draw. */
  bodySkinRanges: Array<{ indexStart: number; indexCount: number }>;
  /** V3 keratin nail-plate slices, empty for every compatibility profile. */
  nailRanges: Array<{ indexStart: number; indexCount: number }>;
  hairRange: { indexStart: number; indexCount: number };
  eyeRange: { indexStart: number; indexCount: number };
  ocularRanges: Record<AgentAvatarOcularRegion, Array<{ indexStart: number; indexCount: number }>>;
  garmentRange: { indexStart: number; indexCount: number };
  visorRange: { indexStart: number; indexCount: number };
  mantleRange: { indexStart: number; indexCount: number };
  /** One authored mobility value per combined mesh vertex for deterministic cloth dynamics. */
  clothSimulationWeights: Float32Array<ArrayBuffer>;
}

export type AgentAvatarSkinUvProfile = 'portrait-atlas-v1';

export interface AgentAvatarSkinUvReceipt {
  schemaVersion: 'holoscript.agent-avatar-skin-uv.v1';
  profile: AgentAvatarSkinUvProfile;
  vertexCount: number;
  nonDegenerateVertexCount: number;
  headIslandVertexCount: number;
  uRange: [number, number];
  vRange: [number, number];
}

function buildPortraitSkinUv(positions: Float32Array): {
  uvs: Float32Array<ArrayBuffer>;
  receipt: AgentAvatarSkinUvReceipt;
} {
  const vertexCount = positions.length / 3;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < vertexCount; index++) {
    const y = positions[index * 3 + 1];
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const spanY = Math.max(1e-6, maxY - minY);
  const headStartY = minY + spanY * 0.82;
  const headSpan = Math.max(1e-6, maxY - headStartY);
  const uvs = new Float32Array(vertexCount * 2);
  let headIslandVertexCount = 0;
  let minU = 1;
  let maxU = 0;
  let minV = 1;
  let maxV = 0;
  for (let index = 0; index < vertexCount; index++) {
    const x = positions[index * 3];
    const y = positions[index * 3 + 1];
    const z = positions[index * 3 + 2];
    const angular = Math.atan2(x, z) / (Math.PI * 2);
    const isHead = y >= headStartY;
    const u = isHead ? 0.25 + angular * 0.5 : 0.75 + angular * 0.5;
    const atlasV = isHead
      ? 0.52 + clamp((y - headStartY) / headSpan, 0, 1) * 0.46
      : 0.02 + clamp((y - minY) / Math.max(1e-6, headStartY - minY), 0, 1) * 0.46;
    uvs[index * 2] = u;
    uvs[index * 2 + 1] = atlasV;
    if (isHead) headIslandVertexCount++;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, atlasV);
    maxV = Math.max(maxV, atlasV);
  }
  return {
    uvs,
    receipt: {
      schemaVersion: 'holoscript.agent-avatar-skin-uv.v1',
      profile: 'portrait-atlas-v1',
      vertexCount,
      nonDegenerateVertexCount: vertexCount,
      headIslandVertexCount,
      uRange: [minU, maxU],
      vRange: [minV, maxV],
    },
  };
}

/** Offset a set of mesh-local indices by a vertex base (for concatenation). */
function offsetIndices(src: Uint32Array, base: number): Uint32Array {
  const out = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] + base;
  return out;
}

function excludeIndexRanges(
  totalIndexCount: number,
  excluded: Array<{ indexStart: number; indexCount: number }>
): Array<{ indexStart: number; indexCount: number }> {
  const ranges: Array<{ indexStart: number; indexCount: number }> = [];
  let cursor = 0;
  for (const range of [...excluded].sort((a, b) => a.indexStart - b.indexStart)) {
    if (range.indexStart > cursor) {
      ranges.push({ indexStart: cursor, indexCount: range.indexStart - cursor });
    }
    cursor = Math.max(cursor, range.indexStart + range.indexCount);
  }
  if (cursor < totalIndexCount) {
    ranges.push({ indexStart: cursor, indexCount: totalIndexCount - cursor });
  }
  return ranges.filter((range) => range.indexCount > 0);
}

/**
 * Build the combined body+hair+eyes mesh as one SkinnedMeshData, with the three index ranges
 * the renderer slices for the body=skin-SSS / hair=marschner / eyes=refractive material groups.
 */
export function buildCharacterMesh(
  opts: AgentAvatarMeshOptions &
    HairOptions & {
      garmentStyle?: SovereignGarmentStyle;
      garmentSegments?: number;
      mantleStyle?: SovereignMantleStyle;
      includeHair?: boolean;
      includeEyes?: boolean;
      ocularProfile?: AgentAvatarOcularProfile;
      irisScale?: number;
      pupilScale?: number;
      skinUvProfile?: AgentAvatarSkinUvProfile;
    } = {}
): CharacterMeshData {
  const body = buildAgentAvatarMesh(opts);
  const empty = (): HairMeshData => ({
    positions: new Float32Array(),
    normals: new Float32Array(),
    tangents: new Float32Array(),
    indices: new Uint32Array(),
    jointIndices: new Uint32Array(),
    jointWeights: new Float32Array(),
    vertexCount: 0,
  });
  const hair =
    opts.includeHair === false
      ? empty()
      : buildAgentAvatarHair({
          buildScale: opts.buildScale,
          heightScale: opts.heightScale,
          faceTopology: opts.faceTopology,
          faceWidth: opts.faceWidth,
          faceLength: opts.faceLength,
          guides: opts.guides,
          cardsPerGuide: opts.cardsPerGuide,
          segments: opts.segments,
          cardWidth: opts.cardWidth,
          length: opts.length,
          style: opts.style,
          groomProfile: opts.groomProfile,
          rootLift: opts.rootLift,
          tipTaper: opts.tipTaper,
          hairlineBias: opts.hairlineBias,
          crownWhorl: opts.crownWhorl,
          clusterCount: opts.clusterCount,
          clusterSpread: opts.clusterSpread,
        });
  const ocularProfile = opts.ocularProfile ?? 'legacy-composite-v1';
  const emptyOcular = (): OcularMeshData => ({
    ...empty(),
    uvs: new Float32Array(),
    regionRanges: { sclera: [], iris: [], pupil: [], cornea: [] },
  });
  const eyes: OcularMeshData =
    opts.includeEyes === false
      ? emptyOcular()
      : ocularProfile === 'layered-ocular-v1' ||
          ocularProfile === 'layered-ocular-tearfilm-v2' ||
          ocularProfile === 'layered-ocular-calibrated-v3'
        ? buildAgentAvatarOcularRegions({
            buildScale: opts.buildScale,
            heightScale: opts.heightScale,
            faceTopology: opts.faceTopology,
            orbitalProfile: opts.orbitalProfile,
            eyeRecess: opts.eyeRecess,
            eyeScale: opts.eyeScale,
            faceWidth: opts.faceWidth,
            irisScale: opts.irisScale,
            pupilScale: opts.pupilScale,
            lidOpening: opts.lidOpening,
            ocularProfile,
          })
        : {
            ...buildAgentAvatarEyes({
              buildScale: opts.buildScale,
              heightScale: opts.heightScale,
              faceTopology: opts.faceTopology,
              orbitalProfile: opts.orbitalProfile,
              eyeRecess: opts.eyeRecess,
              eyeScale: opts.eyeScale,
              faceWidth: opts.faceWidth,
            }),
            uvs: new Float32Array(),
            regionRanges: { sclera: [], iris: [], pupil: [], cornea: [] },
          };
  const authoredGarment = opts.garmentStyle
    ? buildAgentAvatarGarment({
        style: opts.garmentStyle,
        buildScale: opts.buildScale,
        heightScale: opts.heightScale,
        torsoScale: opts.torsoScale,
        shoulderScale: opts.shoulderScale,
        radialSegments: opts.garmentSegments,
        mantleStyle: opts.mantleStyle,
      })
    : undefined;
  const garment = authoredGarment ?? {
    cloth: { ...empty(), uvs: new Float32Array(), clothWeights: new Float32Array() },
    visor: { ...empty(), uvs: new Float32Array(), clothWeights: new Float32Array() },
    mantle: { ...empty(), uvs: new Float32Array(), clothWeights: new Float32Array() },
  };

  const bodyVC = body.vertexCount;
  const skinUv =
    opts.skinUvProfile === 'portrait-atlas-v1' ? buildPortraitSkinUv(body.positions) : undefined;
  const hairVC = hair.vertexCount;
  const hairIdx = offsetIndices(hair.indices, bodyVC);
  const eyeIdx = offsetIndices(eyes.indices, bodyVC + hairVC);
  const garmentIdx = offsetIndices(garment.cloth.indices, bodyVC + hairVC + eyes.vertexCount);
  const visorIdx = offsetIndices(
    garment.visor.indices,
    bodyVC + hairVC + eyes.vertexCount + garment.cloth.vertexCount
  );
  const mantleIdx = offsetIndices(
    garment.mantle.indices,
    bodyVC + hairVC + eyes.vertexCount + garment.cloth.vertexCount + garment.visor.vertexCount
  );
  const zeroUv = (vertexCount: number): Float32Array<ArrayBuffer> =>
    new Float32Array(vertexCount * 2);
  const zeroWeight = (vertexCount: number): Float32Array<ArrayBuffer> =>
    new Float32Array(vertexCount);
  const bodySecondaryJointIndices = body.secondaryJointIndices ?? body.jointIndices;
  const bodySecondaryJointWeights =
    body.secondaryJointWeights ?? new Float32Array(body.vertexCount);

  const mesh: SkinnedMeshData = {
    positions: catF32(
      catF32(
        catF32(
          catF32(catF32(body.positions, hair.positions), eyes.positions),
          garment.cloth.positions
        ),
        garment.visor.positions
      ),
      garment.mantle.positions
    ),
    normals: catF32(
      catF32(
        catF32(catF32(catF32(body.normals, hair.normals), eyes.normals), garment.cloth.normals),
        garment.visor.normals
      ),
      garment.mantle.normals
    ),
    tangents: catF32(
      catF32(
        catF32(catF32(catF32(body.tangents, hair.tangents), eyes.tangents), garment.cloth.tangents),
        garment.visor.tangents
      ),
      garment.mantle.tangents
    ),
    uvs: catF32(
      catF32(
        catF32(
          catF32(
            catF32(
              skinUv?.uvs ?? zeroUv(bodyVC),
              hair.uvs?.length === hairVC * 2 ? hair.uvs : zeroUv(hairVC)
            ),
            eyes.uvs.length === eyes.vertexCount * 2 ? eyes.uvs : zeroUv(eyes.vertexCount)
          ),
          garment.cloth.uvs
        ),
        garment.visor.uvs
      ),
      garment.mantle.uvs
    ),
    indices: catU32(
      catU32(catU32(catU32(catU32(body.indices, hairIdx), eyeIdx), garmentIdx), visorIdx),
      mantleIdx
    ),
    jointIndices: catU32(
      catU32(
        catU32(
          catU32(catU32(body.jointIndices, hair.jointIndices), eyes.jointIndices),
          garment.cloth.jointIndices
        ),
        garment.visor.jointIndices
      ),
      garment.mantle.jointIndices
    ),
    jointWeights: catF32(
      catF32(
        catF32(
          catF32(catF32(body.jointWeights, hair.jointWeights), eyes.jointWeights),
          garment.cloth.jointWeights
        ),
        garment.visor.jointWeights
      ),
      garment.mantle.jointWeights
    ),
    secondaryJointIndices: catU32(
      catU32(
        catU32(
          catU32(catU32(bodySecondaryJointIndices, hair.jointIndices), eyes.jointIndices),
          garment.cloth.jointIndices
        ),
        garment.visor.jointIndices
      ),
      garment.mantle.jointIndices
    ),
    secondaryJointWeights: catF32(
      catF32(
        catF32(
          catF32(
            catF32(bodySecondaryJointWeights, zeroWeight(hairVC)),
            zeroWeight(eyes.vertexCount)
          ),
          zeroWeight(garment.cloth.vertexCount)
        ),
        zeroWeight(garment.visor.vertexCount)
      ),
      zeroWeight(garment.mantle.vertexCount)
    ),
    vertexCount:
      bodyVC +
      hairVC +
      eyes.vertexCount +
      garment.cloth.vertexCount +
      garment.visor.vertexCount +
      garment.mantle.vertexCount,
  };
  const clothSimulationWeights = catF32(
    catF32(
      catF32(
        catF32(catF32(zeroWeight(bodyVC), zeroWeight(hairVC)), zeroWeight(eyes.vertexCount)),
        garment.cloth.clothWeights
      ),
      garment.visor.clothWeights
    ),
    garment.mantle.clothWeights
  );

  const hairStart = body.indices.length;
  const eyeStart = hairStart + hair.indices.length;
  const garmentStart = eyeStart + eyes.indices.length;
  const visorStart = garmentStart + garment.cloth.indices.length;
  const mantleStart = visorStart + garment.visor.indices.length;
  const offsetOcularRanges = (
    ranges: Array<{ indexStart: number; indexCount: number }>
  ): Array<{ indexStart: number; indexCount: number }> =>
    ranges.map((range) => ({
      indexStart: eyeStart + range.indexStart,
      indexCount: range.indexCount,
    }));
  const nailRanges =
    body.anatomy.upperBody?.upperLimbs.flatMap(
      (limb) =>
        limb.handLandmarks
          ?.filter((landmark) => landmark.materialRole === 'keratin-nail')
          .map((landmark) => ({ ...landmark.indexRange })) ?? []
    ) ?? [];
  const bodySkinRanges = excludeIndexRanges(body.indices.length, nailRanges);
  return {
    mesh,
    ...(hair.groom ? { groom: hair.groom } : {}),
    anatomy: body.anatomy,
    ...(body.jointDeformation ? { jointDeformation: body.jointDeformation } : {}),
    ...(body.handSurface ? { handSurface: body.handSurface } : {}),
    ...(body.facialLandmarks ? { facialLandmarks: body.facialLandmarks } : {}),
    ...(authoredGarment ? { garment: authoredGarment.receipt } : {}),
    ...(eyes.receipt ? { ocular: eyes.receipt } : {}),
    ocularProfile,
    orbital: body.orbital,
    ...(skinUv ? { skinUv: skinUv.receipt } : {}),
    bodyVertexRange: { vertexStart: 0, vertexCount: bodyVC },
    hairVertexRange: { vertexStart: bodyVC, vertexCount: hairVC },
    eyeVertexRange: {
      vertexStart: bodyVC + hairVC,
      vertexCount: eyes.vertexCount,
    },
    bodyRange: { indexStart: 0, indexCount: body.indices.length },
    bodySkinRanges,
    nailRanges,
    hairRange: { indexStart: hairStart, indexCount: hair.indices.length },
    eyeRange: { indexStart: eyeStart, indexCount: eyes.indices.length },
    ocularRanges: {
      sclera: offsetOcularRanges(eyes.regionRanges.sclera),
      iris: offsetOcularRanges(eyes.regionRanges.iris),
      pupil: offsetOcularRanges(eyes.regionRanges.pupil),
      cornea: offsetOcularRanges(eyes.regionRanges.cornea),
    },
    garmentRange: {
      indexStart: garmentStart,
      indexCount: garment.cloth.indices.length,
    },
    visorRange: { indexStart: visorStart, indexCount: garment.visor.indices.length },
    mantleRange: { indexStart: mantleStart, indexCount: garment.mantle.indices.length },
    clothSimulationWeights,
  };
}
