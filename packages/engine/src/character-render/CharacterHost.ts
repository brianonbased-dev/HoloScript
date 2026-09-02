/**
 * CharacterHost — entity-generic native character render driver.
 *
 * Owns one body (procedural `AgentAvatarMesh` by default; a glTF/VRM→DrawSpec upgrade is a
 * separate opt-in path), applies a pose each frame (skeleton FK → joint-matrix palette), and
 * emits a pure-data `CharacterDrawSpec` the native WebGPU renderer consumes (`renderCharacter`).
 * NO Three.js, NO R3F.
 *
 * The SAME host serves all three archetypes (D.094 entity-generic):
 *   - human / avatar  → posed by animation/author,
 *   - embodied agent  → posed + PLACED by an authoritative world-state driver keyed by
 *     `entityId` (the WebGPU-native analogue of xr-embodiment's AgentAvatarTracker).
 *
 * Current scope includes body, skeleton-pose palette, locomotion, deterministic cloth, a bounded
 * native procedural-head FACS/viseme subset, world-state placement, and the D.102 portable-mind
 * seam. Production facial topology and activity-driven expressions remain later upgrade lanes.
 *
 * @module character-render
 */

import type {
  CharacterDrawSpec,
  MaterialSpec,
  MaterialGroup,
  SkinSSSMaterialSpec,
  MarschnerHairMaterialSpec,
  RefractiveEyeMaterialSpec,
  BaseMaterialSpec,
  WovenClothMaterialSpec,
  WovenClothTextureTile,
} from '../native-render/draw-spec';
import {
  computeBindWorld,
  computeInverseBind,
  computeJointPalette,
  colorForEntity,
  JOINT_COUNT,
  type AgentAvatarAnatomyReceipt,
  type AgentAvatarFacialDetailProfile,
  type AgentAvatarFacialLandmarkReceipt,
  type AgentAvatarFaceTopology,
  type AgentAvatarHandSurfaceReceipt,
  type AgentAvatarJointDeformationReceipt,
  type AgentAvatarOrbitalGeometryReceipt,
  type AgentAvatarOrbitalProfile,
  type AgentAvatarUpperBodyProfile,
  type AvatarPose,
} from './AgentAvatarMesh';
import {
  buildCharacterMesh,
  type AgentAvatarGroomGeometryReceipt,
  type AgentAvatarGroomProfile,
  type AgentAvatarHairMaterialReceipt,
  type AgentAvatarHairStyle,
  type AgentAvatarSkinUvReceipt,
  type AgentAvatarOcularGeometryReceipt,
  type AgentAvatarOcularProfile,
  type CharacterMeshData,
} from './AgentAvatarHair';
import {
  applyNativeFacialMorph,
  type NativeMorphNormalPolicy,
  type NativeMorphReceipt,
  type NativeMorphWeights,
} from './AgentAvatarMorph';
import type {
  AgentAvatarGarmentGeometryReceipt,
  SovereignGarmentStyle,
  SovereignMantleStyle,
} from './AgentAvatarGarment';
import {
  DeterministicClothSimulation,
  type ClothSimulationConfig,
  type ClothSimulationReceipt,
} from './AgentAvatarCloth';
import {
  applyNativeCharacterMicroMotion,
  type CharacterMicroMotionApplicationReceipt,
  type NativeCharacterMicroMotionReceipt,
  type CharacterMicroMotionSample,
} from './AgentAvatarMicroMotion';
import {
  fromRotationTranslation,
  fromTranslation,
  quatFromAxisAngle,
  type Mat4,
  type Quat,
} from './skin-math';
import { gaitPose, type GaitMode } from './gait';
import type { CharacterMind, MindIdentity, MindMemoryEntry } from './CharacterMind';

export interface CharacterHostOptions {
  /** Entity id — drives deterministic accent colour + world-state driver binding (D.094). */
  entityId: string;
  /** 1.0 = 1.75 m reference figure. */
  heightScale?: number;
  /** Limb/torso thickness multiplier. */
  buildScale?: number;
  /** Source-authored facial topology. */
  faceTopology?: AgentAvatarFaceTopology;
  /** Longitude segments for the neutral anatomical face. */
  faceRadialSegments?: number;
  /** Latitude segments for the neutral anatomical face. */
  faceVerticalSegments?: number;
  /** Include native eyelid/tearline rim topology. */
  faceTearline?: boolean;
  /** Native orbital construction profile; legacy tearline rims remain the default. */
  orbitalProfile?: AgentAvatarOrbitalProfile;
  /** Globe recession as a fraction of the procedural eyeball radius (0..0.45). */
  eyeRecess?: number;
  /** Vertical palpebral opening as a fraction of the eyeball radius (0.42..0.78). */
  lidOpening?: number;
  /** Outer-canthus rise as a fraction of the eyeball radius (-0.25..0.25). */
  canthalTilt?: number;
  /** Optional denser facial landmark profile. */
  facialDetailProfile?: AgentAvatarFacialDetailProfile;
  /** Procedural ocular globe scale (0.72..1.08). */
  eyeScale?: number;
  /** Interocular spacing relative to the anatomical-head baseline. */
  eyeSpacing?: number;
  /** Brow rise above the upper lid, in eye-radius units. */
  browHeight?: number;
  /** Brow ribbon thickness, in eye-radius units. */
  browThickness?: number;
  /** Native ear scale. */
  earScale?: number;
  /** Lip-volume depth multiplier. */
  mouthDepth?: number;
  /** Nasal bridge width relative to the portrait facial-volume baseline. */
  noseBridgeWidth?: number;
  /** Nasal vertical length relative to the portrait facial-volume baseline. */
  noseLength?: number;
  /** Nasal forward projection relative to the portrait facial-volume baseline. */
  noseProjection?: number;
  /** Mouth width relative to the anatomical lip baseline. */
  mouthWidth?: number;
  /** Upper-lip soft-tissue fullness relative to the anatomical lip baseline. */
  upperLipFullness?: number;
  /** Lower-lip soft-tissue fullness relative to the anatomical lip baseline. */
  lowerLipFullness?: number;
  /** Portrait-silhouette-v2 cheek-volume multiplier. */
  cheekboneScale?: number;
  /** Portrait-silhouette-v2 forward chin projection. */
  chinProjection?: number;
  /** Portrait-silhouette-v2 temple-width multiplier. */
  templeWidth?: number;
  /** Portrait-facial-planes-v6 brow/malar/jaw plane strength. */
  facialPlaneStrength?: number;
  /**
   * Expression-time normal handling. The compatibility default preserves authored normals;
   * H3X can opt into deterministic recomputation around deformed facial vertices.
   */
  expressionNormalPolicy?: NativeMorphNormalPolicy;
  /** Neutral-head width multiplier (0.84..1.2). */
  faceWidth?: number;
  /** Neutral-head vertical-length multiplier (0.86..1.16). */
  faceLength?: number;
  /** Lower-face width reduction (0.08..0.38). */
  jawTaper?: number;
  /** Bind-space shoulder/arm span multiplier (0.85..1.25). */
  shoulderScale?: number;
  /** Hips/spine thickness multiplier (0.85..1.2). */
  torsoScale?: number;
  /** Source-authored native upper-body construction. */
  upperBodyProfile?: AgentAvatarUpperBodyProfile;
  /** Circumferential topology budget for the connected upper-body loft. */
  upperBodyRadialSegments?: number;
  /** V7 independent left scapular elevation (-1..1). */
  leftScapularElevation?: number;
  /** V7 independent right scapular elevation (-1..1). */
  rightScapularElevation?: number;
  /** V7 independent left scapular forward/back travel (-1..1). */
  leftScapularProtraction?: number;
  /** V7 independent right scapular forward/back travel (-1..1). */
  rightScapularProtraction?: number;
  /** Packed 0xRRGGBB keratin nail-plate colour for coherent-hand-landmarks-v3. */
  nailTone?: number;
  /** Keratin nail-plate microsurface roughness (0.08..0.65). */
  nailRoughness?: number;
  /** Explicit proximal nail-bed colour for fixed-light material calibration. */
  nailBedTone?: number;
  /** Proximal nail-bed microsurface roughness (0.12..0.72). */
  nailBedRoughness?: number;
  /** Opt-in analytic material calibration. Legacy characters retain their original draw schedule. */
  materialCalibrationProfile?: AgentAvatarMaterialCalibrationProfile;
  /** Packed 0xRRGGBB accent/fallback colour; defaults to a deterministic colour from `entityId`. */
  color?: number;
  /** Skin base colour 0xRRGGBB for the SSS material (default warm skin #e8c4a0). */
  skinTone?: number;
  /**
   * Authored subsurface scatter colour in linear RGB. Omitted characters retain the
   * human-skin preset; non-human/sovereign bodies can provide their own material response.
   */
  skinScatterColor?: [number, number, number];
  /** Provider-independent native skin microdetail profile. */
  skinMicrodetailProfile?: AgentAvatarSkinMicrodetailProfile;
  /** Analytic pore frequency in inverse metres. */
  skinMicrodetailScale?: number;
  /** Bounded analytic roughness-response amplitude. */
  skinMicrodetailStrength?: number;
  /**
   * Opt-in decoupled skin-surface response. Omission preserves the legacy coupled
   * albedo/roughness response and its byte-compatible material packing.
   */
  skinSurfaceResponseProfile?: AgentAvatarSkinSurfaceResponseProfile;
  /** Independent analytic base-colour variation amplitude. */
  skinAlbedoVariationStrength?: number;
  /** Independent analytic microsurface roughness variation amplitude. */
  skinRoughnessVariationStrength?: number;
  /** Tangent-plane analytic fine-normal response amplitude. */
  skinNormalMicrodetailStrength?: number;
  /** Source-authored bind-space facial colour response. */
  skinComplexionProfile?: AgentAvatarSkinComplexionProfile;
  /** Bounded strength of the anatomical complexion response. */
  skinComplexionStrength?: number;
  /** UV-driven portrait texture-space response. */
  skinTextureSpaceProfile?: AgentAvatarSkinTextureSpaceProfile;
  /** Bounded UV-space albedo and microsurface contribution. */
  skinTextureSpaceStrength?: number;
  /** Hair eumelanin 0..1 (0 = white/blond, ~0.9 = black). Default 0.7 (dark brown). */
  melanin?: number;
  /** Hair pheomelanin/redness 0..1. Default 0.2. */
  melaninRedness?: number;
  /** Exact source-authored @hair(color) value. Omission preserves melanin-only hair shading. */
  hairTone?: number;
  /**
   * Source-authored weight of the `hairTone` chroma over the melanin response (0..1).
   * Omission preserves the default blend, and the weight is inert without `hairTone`
   * because there is no source chroma to contribute.
   */
  hairSourceColorWeight?: number;
  /** Source-authored deterministic procedural hair geometry profile. */
  hairStyle?: AgentAvatarHairStyle;
  /** Source-authored scalp guide budget selected by @lod. */
  hairGuides?: number;
  /** Source-authored cards-per-guide budget selected by @lod. */
  hairCardsPerGuide?: number;
  /** Source-authored points-per-guide budget selected by @lod. */
  hairSegments?: number;
  /** Source-authored native groom construction algorithm. */
  hairGroomProfile?: AgentAvatarGroomProfile;
  /** Source-authored card width in metres. */
  hairCardWidth?: number;
  /** Source-authored scalp shell lift in metres. */
  hairRootLift?: number;
  /** Source-authored tip/root card-width ratio. */
  hairTipTaper?: number;
  /** Source-authored front hairline retraction. */
  hairlineBias?: number;
  /** Signed crown-flow rotation around the scalp normal. */
  hairCrownWhorl?: number;
  /** Optional angular groom cluster count. */
  hairClusterCount?: number;
  /** Fraction of each groom cluster sector occupied by roots. */
  hairClusterSpread?: number;
  /** Source-authored analytic hair-card coverage profile. */
  hairCoverageProfile?: MarschnerHairMaterialSpec['coverageProfile'];
  /** Visible normalized card half-width (0.2..1). */
  hairStrandCoverage?: number;
  /** Analytic card edge transition (0.01..0.5). */
  hairEdgeSoftness?: number;
  /** Strand-tangent contribution to the highlight response (0..1). */
  hairAnisotropyStrength?: number;
  /** Longitudinal tangent/normal lobe shift (-0.35..0.35). */
  hairLongitudinalShift?: number;
  /** Layered card density and root-occlusion response. */
  hairDensityProfile?: MarschnerHairMaterialSpec['densityProfile'];
  /** Layered analytic card-opacity contribution. */
  hairDensityStrength?: number;
  /** Analytic root darkening/occlusion contribution. */
  hairRootShadowStrength?: number;
  /** Iris colour 0xRRGGBB (default warm brown #4a3520). */
  irisColor?: number;
  /** Native eye construction profile; legacy composite remains the compatibility default. */
  ocularProfile?: AgentAvatarOcularProfile;
  /** Visible iris radius as a fraction of the eyeball radius (0.34..0.62). */
  irisScale?: number;
  /** Pupil radius as a fraction of the iris radius (0.2..0.72). */
  pupilScale?: number;
  /** Sclera base colour 0xRRGGBB (default warm off-white #eeeae3). */
  scleraColor?: number;
  /** Cornea index of refraction (default 1.376). */
  corneaIor?: number;
  /** Initial world position. */
  position?: [number, number, number];
  /** Operative native garment preset selected by @clothing. */
  garmentStyle?: SovereignGarmentStyle;
  /** Packed 0xRRGGBB cloth base colour. */
  garmentColor?: number;
  /** Authored radial topology selected by @lod. */
  garmentSegments?: number;
  /** Optional detachable public/story mantle selected by @clothing(mantle_style). */
  mantleStyle?: SovereignMantleStyle;
  /** Packed 0xRRGGBB mantle base colour. */
  mantleColor?: number;
  /** Source-authored deterministic cloth dynamics. Omission keeps the rest-pose garment. */
  clothSimulation?: Partial<ClothSimulationConfig>;
  /** Procedural hair can be suppressed by a closed hood. */
  includeHair?: boolean;
  /** Procedural eyes can be suppressed by a faceless visor. */
  includeEyes?: boolean;
}

export type AgentAvatarSkinMicrodetailProfile = 'none' | 'analytic-pore-v1';
export type AgentAvatarSkinSurfaceResponseProfile = 'calibrated-skin-surface-v1';
export type AgentAvatarSkinComplexionProfile = 'anatomical-complexion-v1';
export type AgentAvatarSkinTextureSpaceProfile = 'portrait-texture-space-v1';
export type AgentAvatarMaterialCalibrationProfile = 'legacy-v1' | 'fixed-light-human-v1';

interface AgentAvatarSkinMaterialReceiptBase {
  calibrationProfile: AgentAvatarMaterialCalibrationProfile;
  shadingModel: 'skin-sss';
  color: number;
  scatterColor: [number, number, number];
  scatterRadii: [number, number, number];
  specularF0: number;
  thickness: number;
  transmitStrength: number;
  ambient: number;
  microdetailProfile: AgentAvatarSkinMicrodetailProfile;
  microdetailScale: number;
  microdetailStrength: number;
  roughness: number;
}

export interface AgentAvatarSkinMaterialReceiptV2 extends AgentAvatarSkinMaterialReceiptBase {
  schemaVersion: 'holoscript.agent-avatar-skin-material.v2';
}

export interface AgentAvatarSkinMaterialReceiptV3 extends AgentAvatarSkinMaterialReceiptBase {
  schemaVersion: 'holoscript.agent-avatar-skin-material.v3';
  surfaceResponseProfile: AgentAvatarSkinSurfaceResponseProfile;
  albedoVariationStrength: number;
  roughnessVariationStrength: number;
  normalMicrodetailStrength: number;
}

export interface AgentAvatarSkinMaterialReceiptV4 extends Omit<
  AgentAvatarSkinMaterialReceiptV3,
  'schemaVersion'
> {
  schemaVersion: 'holoscript.agent-avatar-skin-material.v4';
  complexionProfile: AgentAvatarSkinComplexionProfile;
  complexionStrength: number;
}

export interface AgentAvatarSkinMaterialReceiptV5 extends Omit<
  AgentAvatarSkinMaterialReceiptV4,
  'schemaVersion'
> {
  schemaVersion: 'holoscript.agent-avatar-skin-material.v5';
  textureSpaceProfile: AgentAvatarSkinTextureSpaceProfile;
  textureSpaceStrength: number;
  uv: AgentAvatarSkinUvReceipt;
}

export type AgentAvatarSkinMaterialReceipt =
  | AgentAvatarSkinMaterialReceiptV2
  | AgentAvatarSkinMaterialReceiptV3
  | AgentAvatarSkinMaterialReceiptV4
  | AgentAvatarSkinMaterialReceiptV5;

/** Human-skin SSS preset (SubsurfaceScattering.ts humanSkin + SkinSSRenderer defaults). */
const HUMAN_SKIN: Omit<SkinSSSMaterialSpec, 'color'> = {
  shadingModel: 'skin-sss',
  metalness: 0,
  roughness: 0.45,
  emissive: 0,
  opacity: 1,
  scatterColor: [0.8, 0.25, 0.13],
  scatterRadii: [3.67, 1.37, 0.68],
  specularF0: 0.028,
  thickness: 0.3,
  transmitStrength: 0.4,
  ambient: 0.12,
  microdetailProfile: 'none',
  microdetailScale: 0,
  microdetailStrength: 0,
};

/**
 * Bounded analytic calibration for the fixed Stormglass look-development light.
 *
 * These values are renderer controls, not a claim that the shader is a measured
 * tissue model. The profile lowers the broad ambient/transmission response that
 * made the compatibility preset waxy while retaining the authored scatter colour.
 */
const FIXED_LIGHT_SKIN: Omit<SkinSSSMaterialSpec, 'color'> = {
  ...HUMAN_SKIN,
  roughness: 0.5,
  specularF0: 0.028,
  thickness: 0.24,
  transmitStrength: 0.32,
  ambient: 0.09,
};

const FIXED_LIGHT_KERATIN: Omit<SkinSSSMaterialSpec, 'color'> = {
  ...HUMAN_SKIN,
  scatterColor: [0.6, 0.26, 0.22],
  scatterRadii: [0.92, 0.38, 0.18],
  specularF0: 0.045,
  thickness: 0.36,
  transmitStrength: 0.1,
  ambient: 0.08,
  microdetailProfile: 'none',
  microdetailScale: 0,
  microdetailStrength: 0,
};

const FIXED_LIGHT_NAIL_BED: Omit<SkinSSSMaterialSpec, 'color'> = {
  ...HUMAN_SKIN,
  scatterColor: [0.76, 0.22, 0.2],
  scatterRadii: [1.9, 0.72, 0.34],
  specularF0: 0.032,
  thickness: 0.52,
  transmitStrength: 0.24,
  roughness: 0.36,
  ambient: 0.09,
  microdetailProfile: 'none',
  microdetailScale: 0,
  microdetailStrength: 0,
};

function mixPackedRgb(a: number, b: number, t: number): number {
  const mix = (shift: number): number =>
    Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Kajiya-Kay hair preset; melanin/redness set per-host. */
const HAIR_BASE: Omit<MarschnerHairMaterialSpec, 'melanin' | 'melaninRedness'> = {
  shadingModel: 'marschner-hair',
  color: 0xffffff,
  metalness: 0,
  roughness: 0.4,
  emissive: 0,
  opacity: 1,
  primaryExp: 48,
  secondaryExp: 12,
  coverageProfile: 'opaque-v1',
  strandCoverage: 1,
  edgeSoftness: 0.08,
  anisotropyStrength: 1,
  longitudinalShift: 0,
};

/**
 * Chroma weight applied to an authored `hairTone` when the source does not author one.
 * This is the historical unauthored blend; `@hair(source_color_weight)` overrides it.
 */
export const DEFAULT_HAIR_SOURCE_COLOR_WEIGHT = 0.55;

/** Refractive eye preset; iris colour set per-host. */
const EYE_BASE: Omit<RefractiveEyeMaterialSpec, 'color'> = {
  shadingModel: 'refractive-eye',
  metalness: 0,
  roughness: 0.05,
  emissive: 0,
  opacity: 1,
  ior: 1.376,
};

/** H3Z source-owned cross-weave tile; compact pure data, not an external texture dependency. */
const STORMGLASS_CROSSWEAVE_TILE: WovenClothTextureTile = {
  size: 4,
  albedo: [
    0.94, 1.02, 0.96, 1.04, 1.03, 0.95, 1.01, 0.97, 0.96, 1.04, 0.94, 1.02, 1.01, 0.97, 1.03, 0.95,
  ],
  normalXY: [
    0.42, 0.5, 0.58, 0.5, 0.42, 0.5, 0.58, 0.5, 0.5, 0.58, 0.5, 0.42, 0.5, 0.58, 0.5, 0.42, 0.58,
    0.5, 0.42, 0.5, 0.58, 0.5, 0.42, 0.5, 0.5, 0.42, 0.5, 0.58, 0.5, 0.42, 0.5, 0.58,
  ],
  roughness: [
    0.76, 0.68, 0.74, 0.66, 0.69, 0.77, 0.67, 0.75, 0.74, 0.66, 0.76, 0.68, 0.67, 0.75, 0.69, 0.77,
  ],
  repeat: 12,
  normalScale: 0.82,
};

/** Authoritative world-state for an embodied agent (subset of xr-embodiment's WorldStateSource). */
export interface CharacterWorldState {
  position?: { x?: number; y?: number; z?: number };
  /** Facing yaw in radians (rotation about Y). */
  rotationY?: number;
  /** Activity intent (e.g. 'idle' | 'walk' | 'speak') — Phase 1 maps to gait/visemes. */
  activity?: string;
}

export class CharacterHost {
  readonly entityId: string;
  private readonly built: CharacterMeshData;
  private readonly faceTopology: AgentAvatarFaceTopology;
  private readonly expressionNormalPolicy: NativeMorphNormalPolicy;
  private readonly bindWorld: Map<string, Mat4>;
  private readonly inverseBind: Map<string, Mat4>;
  private readonly material: MaterialSpec;
  private readonly materialCalibrationProfile: AgentAvatarMaterialCalibrationProfile;
  private readonly skinMaterial: SkinSSSMaterialSpec;
  private readonly nailMaterial: SkinSSSMaterialSpec;
  private readonly nailBedMaterial: SkinSSSMaterialSpec;
  private readonly hairMaterial: MarschnerHairMaterialSpec;
  private readonly eyeMaterial: RefractiveEyeMaterialSpec;
  private readonly scleraMaterial: RefractiveEyeMaterialSpec;
  private readonly irisMaterial: RefractiveEyeMaterialSpec;
  private readonly pupilMaterial: RefractiveEyeMaterialSpec;
  private readonly corneaMaterial: RefractiveEyeMaterialSpec;
  private readonly garmentMaterial: WovenClothMaterialSpec;
  private readonly mantleMaterial: WovenClothMaterialSpec;
  private readonly visorMaterial: BaseMaterialSpec;
  private readonly clothSimulation: DeterministicClothSimulation | null;
  private lastClothReceipt: ClothSimulationReceipt | null = null;
  private deformationBasePositions: Float32Array<ArrayBuffer>;
  private readonly deformationBaseNormals: Float32Array<ArrayBuffer>;
  private morphWeights: NativeMorphWeights = {};
  private microMotionBlinkWeight = 0;
  private microMotionSample: CharacterMicroMotionSample | null = null;
  private lastNativeMicroMotionReceipt: NativeCharacterMicroMotionReceipt | null = null;
  private lastMorphReceipt: NativeMorphReceipt | null = null;
  private modelMatrix: Mat4;
  private pose: Map<string, Quat> = new Map();
  // D.102 portable mind (opt-in via bindMind; body renders identically with or without it).
  private mind: CharacterMind | null = null;
  private boundIdentity: MindIdentity | null = null;
  private memory: MindMemoryEntry[] = [];

  constructor(opts: CharacterHostOptions) {
    this.entityId = opts.entityId;
    this.faceTopology = opts.faceTopology ?? 'procedural-head-v1';
    this.expressionNormalPolicy = opts.expressionNormalPolicy ?? 'legacy-static-v1';
    this.built = buildCharacterMesh({
      entityId: opts.entityId,
      heightScale: opts.heightScale,
      buildScale: opts.buildScale,
      faceTopology: this.faceTopology,
      faceRadialSegments: opts.faceRadialSegments,
      faceVerticalSegments: opts.faceVerticalSegments,
      faceTearline: opts.faceTearline,
      orbitalProfile: opts.orbitalProfile,
      eyeRecess: opts.eyeRecess,
      lidOpening: opts.lidOpening,
      canthalTilt: opts.canthalTilt,
      facialDetailProfile: opts.facialDetailProfile,
      eyeScale: opts.eyeScale,
      eyeSpacing: opts.eyeSpacing,
      browHeight: opts.browHeight,
      browThickness: opts.browThickness,
      earScale: opts.earScale,
      mouthDepth: opts.mouthDepth,
      noseBridgeWidth: opts.noseBridgeWidth,
      noseLength: opts.noseLength,
      noseProjection: opts.noseProjection,
      mouthWidth: opts.mouthWidth,
      upperLipFullness: opts.upperLipFullness,
      lowerLipFullness: opts.lowerLipFullness,
      cheekboneScale: opts.cheekboneScale,
      chinProjection: opts.chinProjection,
      templeWidth: opts.templeWidth,
      facialPlaneStrength: opts.facialPlaneStrength,
      faceWidth: opts.faceWidth,
      faceLength: opts.faceLength,
      jawTaper: opts.jawTaper,
      shoulderScale: opts.shoulderScale,
      torsoScale: opts.torsoScale,
      upperBodyProfile: opts.upperBodyProfile,
      upperBodyRadialSegments: opts.upperBodyRadialSegments,
      leftScapularElevation: opts.leftScapularElevation,
      rightScapularElevation: opts.rightScapularElevation,
      leftScapularProtraction: opts.leftScapularProtraction,
      rightScapularProtraction: opts.rightScapularProtraction,
      garmentStyle: opts.garmentStyle,
      garmentSegments: opts.garmentSegments,
      mantleStyle: opts.mantleStyle,
      includeHair: opts.includeHair,
      includeEyes: opts.includeEyes,
      ocularProfile: opts.ocularProfile,
      irisScale: opts.irisScale,
      pupilScale: opts.pupilScale,
      style: opts.hairStyle,
      guides: opts.hairGuides,
      cardsPerGuide: opts.hairCardsPerGuide,
      segments: opts.hairSegments,
      groomProfile: opts.hairGroomProfile,
      cardWidth: opts.hairCardWidth,
      rootLift: opts.hairRootLift,
      tipTaper: opts.hairTipTaper,
      hairlineBias: opts.hairlineBias,
      crownWhorl: opts.hairCrownWhorl,
      clusterCount: opts.hairClusterCount,
      clusterSpread: opts.hairClusterSpread,
      skinUvProfile:
        opts.skinTextureSpaceProfile === 'portrait-texture-space-v1'
          ? 'portrait-atlas-v1'
          : undefined,
    });
    this.deformationBasePositions = new Float32Array(this.built.mesh.positions);
    this.deformationBaseNormals = new Float32Array(this.built.mesh.normals);
    this.bindWorld = computeBindWorld();
    this.inverseBind = computeInverseBind(this.bindWorld);
    const skinTone = opts.skinTone ?? 0xe8c4a0;
    const nailTone = opts.nailTone ?? 0xf1d2c7;
    this.materialCalibrationProfile = opts.materialCalibrationProfile ?? 'legacy-v1';
    const fixedLight = this.materialCalibrationProfile === 'fixed-light-human-v1';
    // Lambert fallback colour (accent / used if a caller renders without material groups).
    this.material = {
      color: opts.color ?? colorForEntity(opts.entityId),
      metalness: 0,
      roughness: 0.8,
      emissive: 0,
      opacity: 1,
    };
    // Default SSS skin material — characters have skin (W.241: biggest realism jump).
    this.skinMaterial = {
      ...(fixedLight ? FIXED_LIGHT_SKIN : HUMAN_SKIN),
      color: skinTone,
      ...(opts.skinScatterColor
        ? { scatterColor: [...opts.skinScatterColor] as [number, number, number] }
        : {}),
      microdetailProfile: opts.skinMicrodetailProfile ?? HUMAN_SKIN.microdetailProfile,
      microdetailScale:
        opts.skinMicrodetailProfile === 'analytic-pore-v1'
          ? Math.max(20, Math.min(180, opts.skinMicrodetailScale ?? 80))
          : 0,
      microdetailStrength:
        opts.skinMicrodetailProfile === 'analytic-pore-v1'
          ? Math.max(0, Math.min(0.2, opts.skinMicrodetailStrength ?? 0.06))
          : 0,
      ...(opts.skinSurfaceResponseProfile === 'calibrated-skin-surface-v1'
        ? {
            surfaceResponseProfile: opts.skinSurfaceResponseProfile,
            albedoVariationStrength: Math.max(
              0,
              Math.min(
                0.08,
                opts.skinAlbedoVariationStrength ??
                  Math.max(0, Math.min(0.2, opts.skinMicrodetailStrength ?? 0.06)) * 0.35
              )
            ),
            roughnessVariationStrength: Math.max(
              0,
              Math.min(
                0.2,
                opts.skinRoughnessVariationStrength ??
                  Math.max(0, Math.min(0.2, opts.skinMicrodetailStrength ?? 0.06))
              )
            ),
            normalMicrodetailStrength: Math.max(
              0,
              Math.min(0.35, opts.skinNormalMicrodetailStrength ?? 0.08)
            ),
          }
        : {}),
      ...(opts.skinComplexionProfile === 'anatomical-complexion-v1'
        ? {
            complexionProfile: opts.skinComplexionProfile,
            complexionStrength: Math.max(0, Math.min(1, opts.skinComplexionStrength ?? 0.55)),
          }
        : {}),
      ...(opts.skinTextureSpaceProfile === 'portrait-texture-space-v1'
        ? {
            textureSpaceProfile: opts.skinTextureSpaceProfile,
            textureSpaceStrength: Math.max(0, Math.min(1, opts.skinTextureSpaceStrength ?? 0.48)),
          }
        : {}),
    };
    this.nailMaterial = {
      ...(fixedLight
        ? FIXED_LIGHT_KERATIN
        : {
            ...HUMAN_SKIN,
            scatterColor: [0.72, 0.34, 0.3] as [number, number, number],
            scatterRadii: [1.4, 0.7, 0.38] as [number, number, number],
            specularF0: 0.035,
            thickness: 0.72,
            transmitStrength: 0.14,
          }),
      color: nailTone,
      roughness: Math.max(0.08, Math.min(0.65, opts.nailRoughness ?? 0.28)),
      microdetailProfile: 'none',
      microdetailScale: 0,
      microdetailStrength: 0,
    };
    this.nailBedMaterial = {
      ...FIXED_LIGHT_NAIL_BED,
      color: opts.nailBedTone ?? mixPackedRgb(skinTone, nailTone, 0.28),
      roughness: Math.max(
        0.12,
        Math.min(0.72, opts.nailBedRoughness ?? FIXED_LIGHT_NAIL_BED.roughness)
      ),
    };
    this.hairMaterial = {
      ...HAIR_BASE,
      color: opts.hairTone ?? HAIR_BASE.color,
      melanin: opts.melanin ?? 0.7,
      melaninRedness: opts.melaninRedness ?? 0.2,
      sourceColorWeight:
        opts.hairTone === undefined
          ? 0
          : Math.max(0, Math.min(1, opts.hairSourceColorWeight ?? DEFAULT_HAIR_SOURCE_COLOR_WEIGHT)),
      coverageProfile: opts.hairCoverageProfile ?? HAIR_BASE.coverageProfile,
      strandCoverage: Math.max(
        0.2,
        Math.min(1, opts.hairStrandCoverage ?? HAIR_BASE.strandCoverage)
      ),
      edgeSoftness: Math.max(0.01, Math.min(0.5, opts.hairEdgeSoftness ?? HAIR_BASE.edgeSoftness)),
      anisotropyStrength: Math.max(
        0,
        Math.min(1, opts.hairAnisotropyStrength ?? HAIR_BASE.anisotropyStrength)
      ),
      longitudinalShift: Math.max(
        -0.35,
        Math.min(0.35, opts.hairLongitudinalShift ?? HAIR_BASE.longitudinalShift)
      ),
      ...(opts.hairDensityProfile === 'layered-card-density-v1'
        ? {
            densityProfile: opts.hairDensityProfile,
            densityStrength: Math.max(0, Math.min(1, opts.hairDensityStrength ?? 0.72)),
            rootShadowStrength: Math.max(0, Math.min(1, opts.hairRootShadowStrength ?? 0.58)),
          }
        : {}),
    };
    this.eyeMaterial = { ...EYE_BASE, color: opts.irisColor ?? 0x4a3520 };
    this.scleraMaterial = {
      ...EYE_BASE,
      color: opts.scleraColor ?? 0xeeeae3,
      roughness: 0.18,
      eyeRegion: 'sclera',
    };
    this.irisMaterial = {
      ...EYE_BASE,
      color: opts.irisColor ?? 0x4a3520,
      roughness: 0.12,
      eyeRegion: 'iris',
    };
    this.pupilMaterial = {
      ...EYE_BASE,
      color: 0x030405,
      roughness: 0.08,
      eyeRegion: 'pupil',
    };
    this.corneaMaterial = {
      ...EYE_BASE,
      color: 0xffffff,
      roughness: 0.015,
      opacity: 0.12,
      ior: Math.max(1.3, Math.min(1.45, opts.corneaIor ?? 1.376)),
      eyeRegion: 'cornea',
    };
    this.garmentMaterial = {
      shadingModel: 'woven-cloth',
      color: opts.garmentColor ?? 0x4f7182,
      metalness: 0,
      roughness: 0.72,
      emissive: 0,
      opacity: 1,
      sheen: 0.42,
      weaveScale: 18,
      rimStrength: 0.32,
      ...(opts.garmentStyle === 'stormglass_structured_fieldcoat' ||
      opts.garmentStyle === 'stormglass_portrait_fieldcoat'
        ? {
            textureTile: {
              ...STORMGLASS_CROSSWEAVE_TILE,
              albedo: [...STORMGLASS_CROSSWEAVE_TILE.albedo],
              normalXY: [...STORMGLASS_CROSSWEAVE_TILE.normalXY],
              roughness: [...STORMGLASS_CROSSWEAVE_TILE.roughness],
            },
          }
        : {}),
    };
    this.mantleMaterial = {
      shadingModel: 'woven-cloth',
      color: opts.mantleColor ?? 0xd6d1c7,
      metalness: 0,
      roughness: 0.64,
      emissive: 0,
      opacity: 1,
      sheen: 0.58,
      weaveScale: 14,
      rimStrength: 0.44,
    };
    this.visorMaterial = {
      shadingModel: 'lambert',
      color: 0x07111f,
      metalness: 0,
      roughness: 0.35,
      emissive: 0,
      opacity: 1,
    };
    this.clothSimulation = opts.clothSimulation
      ? new DeterministicClothSimulation(
          this.built.mesh.positions,
          this.built.mesh.indices,
          this.built.clothSimulationWeights,
          opts.clothSimulation
        )
      : null;
    const p = opts.position ?? [0, 0, 0];
    this.modelMatrix = fromTranslation(p[0], p[1], p[2]);
  }

  /** Replace the whole pose (per-bone local rotations). Absent bones default to bind. */
  setPose(pose: AvatarPose): void {
    this.pose = new Map(pose);
  }

  /** Set a single bone's local rotation (e.g. raise an arm). */
  setBoneRotation(bone: string, rotation: Quat): void {
    this.pose.set(bone, rotation);
  }

  /**
   * Drive the skeletal pose from a locomotion gait at time `t` (seconds). Replaces the pose
   * with a walk/run stride cycle or an idle rest (modes track `LocomotionConfig.mode`).
   */
  applyLocomotion(mode: GaitMode, t: number, speed = 1.4): void {
    this.pose = gaitPose(mode, t, speed);
  }

  /** Place the figure at a world position (yaw 0). */
  setPosition(x: number, y: number, z: number): void {
    this.modelMatrix = fromTranslation(x, y, z);
  }

  /**
   * Drive the body from authoritative world-state (embodied-agent path). Sets root
   * position + facing yaw. Activity→gait/visemes is a Phase-1 seam (currently a no-op on pose).
   */
  applyWorldState(state: CharacterWorldState): void {
    const p = state.position ?? {};
    const pos = { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 };
    const yaw = state.rotationY ?? 0;
    this.modelMatrix = fromRotationTranslation(quatFromAxisAngle(0, 1, 0, yaw), pos);
    // Phase-1 seam: map state.activity → locomotion gait pose + FACS speak visemes.
  }

  /**
   * Deterministically sample authored cloth dynamics at absolute time. Sampling the same time
   * always restarts from the same bind-space state and emits the same position digest.
   */
  sampleClothSimulation(timeSeconds: number): ClothSimulationReceipt | null {
    if (!this.clothSimulation) return null;
    const sampled = this.clothSimulation.sample(timeSeconds);
    this.deformationBasePositions = new Float32Array(sampled.positions);
    if (
      Object.keys(this.morphWeights).length > 0 ||
      this.microMotionBlinkWeight > 0 ||
      this.microMotionSample
    ) {
      this.applyResolvedMorphWeights();
    } else {
      this.built.mesh.positions = new Float32Array(this.deformationBasePositions);
      this.built.mesh.normals = new Float32Array(this.deformationBaseNormals);
    }
    this.lastClothReceipt = sampled.receipt;
    return { ...sampled.receipt };
  }

  /** Latest deterministic cloth receipt, or null when the source did not author cloth dynamics. */
  getClothSimulationReceipt(): ClothSimulationReceipt | null {
    return this.lastClothReceipt ? { ...this.lastClothReceipt } : null;
  }

  /** Derived bind-space evidence for the operative native procedural groom. */
  getGroomGeometryReceipt(): AgentAvatarGroomGeometryReceipt | null {
    return this.built.groom
      ? {
          ...this.built.groom,
          material: this.getHairMaterialReceipt(),
        }
      : null;
  }

  /** Exact clamped native face and upper-body proportions used by the emitted geometry. */
  getAnatomyReceipt(): AgentAvatarAnatomyReceipt {
    return {
      ...this.built.anatomy,
      ...(this.built.anatomy.upperBody
        ? {
            upperBody: {
              ...this.built.anatomy.upperBody,
              vertexRange: { ...this.built.anatomy.upperBody.vertexRange },
              indexRange: { ...this.built.anatomy.upperBody.indexRange },
            },
          }
        : {}),
      ...(this.built.anatomy.cranialNeck
        ? {
            cranialNeck: {
              ...this.built.anatomy.cranialNeck,
              neckVertexRange: { ...this.built.anatomy.cranialNeck.neckVertexRange },
              cranialVertexRange: { ...this.built.anatomy.cranialNeck.cranialVertexRange },
              indexRange: { ...this.built.anatomy.cranialNeck.indexRange },
            },
          }
        : {}),
    };
  }

  /** Exact operative dual-influence zones emitted by the selected procedural profile. */
  getJointDeformationReceipt(): AgentAvatarJointDeformationReceipt | null {
    return this.built.jointDeformation
      ? {
          ...this.built.jointDeformation,
          regionVertexCounts: { ...this.built.jointDeformation.regionVertexCounts },
        }
      : null;
  }

  /** Exact V5 digit, commissure, nail/cuticle, and wrist-transition topology evidence. */
  getHandSurfaceReceipt(): AgentAvatarHandSurfaceReceipt | null {
    return this.built.handSurface
      ? {
          ...this.built.handSurface,
          limbs: this.built.handSurface.limbs.map((limb) => ({
            ...limb,
            regionVertexCounts: { ...limb.regionVertexCounts },
            regionIndexCounts: { ...limb.regionIndexCounts },
          })) as AgentAvatarHandSurfaceReceipt['limbs'],
          regionVertexCounts: { ...this.built.handSurface.regionVertexCounts },
          regionIndexCounts: { ...this.built.handSurface.regionIndexCounts },
        }
      : null;
  }

  /** Exact native civic facial-landmark topology and authored controls, when selected. */
  getFacialLandmarkReceipt(): AgentAvatarFacialLandmarkReceipt | null {
    return this.built.facialLandmarks
      ? {
          ...this.built.facialLandmarks,
          vertexRange: { ...this.built.facialLandmarks.vertexRange },
          indexRange: { ...this.built.facialLandmarks.indexRange },
        }
      : null;
  }

  /** Exact native orbital construction receipt, including H4K head-shell stitching. */
  getOrbitalGeometryReceipt(): AgentAvatarOrbitalGeometryReceipt | null {
    return this.built.orbital
      ? {
          ...this.built.orbital,
          ...(this.built.orbital.headSurfaceVertexRange
            ? { headSurfaceVertexRange: { ...this.built.orbital.headSurfaceVertexRange } }
            : {}),
          vertexRange: { ...this.built.orbital.vertexRange },
          indexRange: { ...this.built.orbital.indexRange },
        }
      : null;
  }

  /** Exact native garment preset and emitted topology, when @clothing is operative. */
  getGarmentGeometryReceipt(): AgentAvatarGarmentGeometryReceipt | null {
    return this.built.garment ? { ...this.built.garment } : null;
  }

  /** Exact native ocular construction receipt, including H3Z tear-meniscus topology. */
  getOcularGeometryReceipt(): AgentAvatarOcularGeometryReceipt | null {
    return this.built.ocular ? { ...this.built.ocular } : null;
  }

  /** Exact native skin-surface response derived from @subsurface_scattering. */
  getSkinMaterialReceipt(): AgentAvatarSkinMaterialReceipt {
    const base: Omit<AgentAvatarSkinMaterialReceiptV2, 'schemaVersion'> = {
      calibrationProfile: this.materialCalibrationProfile,
      shadingModel: 'skin-sss',
      color: this.skinMaterial.color,
      scatterColor: [...this.skinMaterial.scatterColor],
      scatterRadii: [...this.skinMaterial.scatterRadii],
      specularF0: this.skinMaterial.specularF0,
      thickness: this.skinMaterial.thickness,
      transmitStrength: this.skinMaterial.transmitStrength,
      ambient: this.skinMaterial.ambient,
      microdetailProfile: this.skinMaterial.microdetailProfile ?? 'none',
      microdetailScale: this.skinMaterial.microdetailScale ?? 0,
      microdetailStrength: this.skinMaterial.microdetailStrength ?? 0,
      roughness: this.skinMaterial.roughness,
    };
    if (this.skinMaterial.surfaceResponseProfile === 'calibrated-skin-surface-v1') {
      if (this.skinMaterial.complexionProfile === 'anatomical-complexion-v1') {
        if (
          this.skinMaterial.textureSpaceProfile === 'portrait-texture-space-v1' &&
          this.built.skinUv
        ) {
          return {
            schemaVersion: 'holoscript.agent-avatar-skin-material.v5',
            ...base,
            surfaceResponseProfile: this.skinMaterial.surfaceResponseProfile,
            albedoVariationStrength: this.skinMaterial.albedoVariationStrength ?? 0,
            roughnessVariationStrength: this.skinMaterial.roughnessVariationStrength ?? 0,
            normalMicrodetailStrength: this.skinMaterial.normalMicrodetailStrength ?? 0,
            complexionProfile: this.skinMaterial.complexionProfile,
            complexionStrength: this.skinMaterial.complexionStrength ?? 0,
            textureSpaceProfile: this.skinMaterial.textureSpaceProfile,
            textureSpaceStrength: this.skinMaterial.textureSpaceStrength ?? 0,
            uv: {
              ...this.built.skinUv,
              uRange: [...this.built.skinUv.uRange],
              vRange: [...this.built.skinUv.vRange],
            },
          };
        }
        return {
          schemaVersion: 'holoscript.agent-avatar-skin-material.v4',
          ...base,
          surfaceResponseProfile: this.skinMaterial.surfaceResponseProfile,
          albedoVariationStrength: this.skinMaterial.albedoVariationStrength ?? 0,
          roughnessVariationStrength: this.skinMaterial.roughnessVariationStrength ?? 0,
          normalMicrodetailStrength: this.skinMaterial.normalMicrodetailStrength ?? 0,
          complexionProfile: this.skinMaterial.complexionProfile,
          complexionStrength: this.skinMaterial.complexionStrength ?? 0,
        };
      }
      return {
        schemaVersion: 'holoscript.agent-avatar-skin-material.v3',
        ...base,
        surfaceResponseProfile: this.skinMaterial.surfaceResponseProfile,
        albedoVariationStrength: this.skinMaterial.albedoVariationStrength ?? 0,
        roughnessVariationStrength: this.skinMaterial.roughnessVariationStrength ?? 0,
        normalMicrodetailStrength: this.skinMaterial.normalMicrodetailStrength ?? 0,
      };
    }
    return {
      schemaVersion: 'holoscript.agent-avatar-skin-material.v2',
      ...base,
    };
  }

  /** Source-derived native hair response joined to geometry and compiler receipts. */
  getHairMaterialReceipt(): AgentAvatarHairMaterialReceipt {
    const base = {
      shadingModel: 'marschner-hair',
      coverageProfile: this.hairMaterial.coverageProfile,
      strandCoverage: this.hairMaterial.strandCoverage,
      edgeSoftness: this.hairMaterial.edgeSoftness,
      anisotropyStrength: this.hairMaterial.anisotropyStrength,
      longitudinalShift: this.hairMaterial.longitudinalShift,
      primaryExponent: this.hairMaterial.primaryExp,
      secondaryExponent: this.hairMaterial.secondaryExp,
      tangentAttribute: 'strand-flow',
      cardUvAttribute: 'card-width',
      alphaToCoverageRequested: this.hairMaterial.coverageProfile === 'alpha-to-coverage-v1',
    } as const;
    const sourceColorWeight = this.hairMaterial.sourceColorWeight ?? 0;
    if (this.hairMaterial.densityProfile === 'layered-card-density-v1') {
      return {
        schemaVersion: 'holoscript.agent-avatar-hair-material.v3',
        ...base,
        ...(sourceColorWeight > 0
          ? { sourceColor: this.hairMaterial.color, sourceColorWeight }
          : {}),
        densityProfile: this.hairMaterial.densityProfile,
        densityStrength: this.hairMaterial.densityStrength ?? 0,
        rootShadowStrength: this.hairMaterial.rootShadowStrength ?? 0,
      };
    }
    return sourceColorWeight > 0
      ? {
          schemaVersion: 'holoscript.agent-avatar-hair-material.v2',
          ...base,
          sourceColor: this.hairMaterial.color,
          sourceColorWeight,
        }
      : {
          schemaVersion: 'holoscript.agent-avatar-hair-material.v1',
          ...base,
        };
  }

  /**
   * Apply the native procedural-head FACS/viseme subset to real mesh vertices.
   *
   * Every call starts from the current neutral/cloth deformation base, so weights are absolute
   * rather than cumulatively drifting. Unsupported names are preserved in the returned receipt.
   */
  applyMorphWeights(weights: NativeMorphWeights): NativeMorphReceipt {
    this.morphWeights = { ...weights };
    return this.applyResolvedMorphWeights();
  }

  /**
   * Bind one absolute-time sample to native eyelid, ocular-globe, and upper-chest deformation.
   *
   * Authored expression weights remain the baseline, and every application restarts from the
   * current neutral/cloth base so repeated or out-of-order samples cannot accumulate drift.
   */
  applyMicroMotionSample(
    sample: CharacterMicroMotionSample
  ): CharacterMicroMotionApplicationReceipt {
    this.microMotionBlinkWeight = Math.max(0, Math.min(1, sample.blink.weight));
    this.microMotionSample = sample;
    const morph = this.applyResolvedMorphWeights();
    const native = this.lastNativeMicroMotionReceipt;
    if (!native) {
      throw new Error('native character micro-motion receipt was not emitted');
    }
    let changedVertexCount = 0;
    for (let vertex = 0; vertex < this.built.mesh.vertexCount; vertex++) {
      const offset = vertex * 3;
      if (
        this.built.mesh.positions[offset] !== this.deformationBasePositions[offset] ||
        this.built.mesh.positions[offset + 1] !== this.deformationBasePositions[offset + 1] ||
        this.built.mesh.positions[offset + 2] !== this.deformationBasePositions[offset + 2]
      ) {
        changedVertexCount++;
      }
    }
    return {
      schemaVersion: 'holoscript.character-micro-motion-application.v2',
      sampleDigest: sample.sampleDigest,
      blinkWeight: this.microMotionBlinkWeight,
      gazeYawRadians: sample.gaze.yawRadians,
      gazePitchRadians: sample.gaze.pitchRadians,
      breathScale: sample.breath.scale,
      nativeBlinkApplied: true,
      nativeGazeApplied: native.nativeGazeApplied,
      nativeBreathApplied: native.nativeBreathApplied,
      facialChangedVertexCount: morph.changedVertexCount,
      gazeChangedVertexCount: native.gazeChangedVertexCount,
      breathChangedVertexCount: native.breathChangedVertexCount,
      changedVertexCount,
      positionDigest: native.positionDigest,
      normalDigest: native.normalDigest,
    };
  }

  private applyResolvedMorphWeights(): NativeMorphReceipt {
    const authoredBlink = typeof this.morphWeights.blink === 'number' ? this.morphWeights.blink : 0;
    const resolvedWeights: NativeMorphWeights = {
      ...this.morphWeights,
      ...(this.microMotionBlinkWeight > 0 || authoredBlink > 0
        ? { blink: Math.max(authoredBlink, this.microMotionBlinkWeight) }
        : {}),
    };
    const morphed = applyNativeFacialMorph(
      this.deformationBasePositions,
      this.built.mesh.jointIndices,
      {
        bodyVertexRange: this.built.bodyVertexRange,
        eyeVertexRange: this.built.eyeVertexRange,
        orbitalVertexRange: this.built.orbital?.vertexRange,
        topology: this.faceTopology,
        baseNormals: this.deformationBaseNormals,
        indices: this.built.mesh.indices,
        normalPolicy: this.expressionNormalPolicy,
      },
      resolvedWeights
    );
    if (this.microMotionSample) {
      const native = applyNativeCharacterMicroMotion(
        morphed.positions,
        morphed.normals ?? this.deformationBaseNormals,
        {
          eyeVertexRange: this.built.eyeVertexRange,
          jointIndices: this.built.mesh.jointIndices,
          secondaryJointIndices: this.built.mesh.secondaryJointIndices,
          secondaryJointWeights: this.built.mesh.secondaryJointWeights,
        },
        this.microMotionSample
      );
      this.built.mesh.positions = native.positions;
      this.built.mesh.normals = native.normals;
      this.lastNativeMicroMotionReceipt = native.receipt;
    } else {
      this.built.mesh.positions = morphed.positions;
      this.built.mesh.normals = morphed.normals
        ? morphed.normals
        : new Float32Array(this.deformationBaseNormals);
      this.lastNativeMicroMotionReceipt = null;
    }
    this.lastMorphReceipt = morphed.receipt;
    return {
      ...morphed.receipt,
      appliedTargets: morphed.receipt.appliedTargets.map((target) => ({ ...target })),
      ignoredTargets: [...morphed.receipt.ignoredTargets],
    };
  }

  /** Latest native facial deformation receipt, or null until morph weights are applied. */
  getMorphReceipt(): NativeMorphReceipt | null {
    return this.lastMorphReceipt
      ? {
          ...this.lastMorphReceipt,
          appliedTargets: this.lastMorphReceipt.appliedTargets.map((target) => ({ ...target })),
          ignoredTargets: [...this.lastMorphReceipt.ignoredTargets],
        }
      : null;
  }

  /** Apply a source-resolved local UV texture tile to the detachable mantle material. */
  setMantleTextureTile(textureTile: WovenClothTextureTile | undefined): void {
    this.mantleMaterial.textureTile = textureTile
      ? {
          ...textureTile,
          albedo: [...textureTile.albedo],
          normalXY: [...textureTile.normalXY],
          roughness: [...textureTile.roughness],
        }
      : undefined;
  }

  /**
   * Emit the current frame's pure-data character draw spec for the native WebGPU renderer.
   * The compatibility body renders as one SSS-skin material group. V3 keratin nail plates
   * are excluded from those skin slices and receive their own SSS-derived material groups;
   * `material` remains the lambert fallback for callers that render without groups.
   */
  getDrawSpec(): CharacterDrawSpec {
    const layeredEyes =
      this.built.ocularProfile === 'layered-ocular-v1' ||
      this.built.ocularProfile === 'layered-ocular-tearfilm-v2' ||
      this.built.ocularProfile === 'layered-ocular-calibrated-v3';
    const opaqueEyeGroups: MaterialGroup[] = layeredEyes
      ? [
          ...this.built.ocularRanges.sclera.map((range) => ({
            ...range,
            material: this.scleraMaterial,
            materialRole: 'sclera' as const,
          })),
          ...this.built.ocularRanges.iris.map((range) => ({
            ...range,
            material: this.irisMaterial,
            materialRole: 'iris' as const,
          })),
          ...this.built.ocularRanges.pupil.map((range) => ({
            ...range,
            material: this.pupilMaterial,
            materialRole: 'pupil' as const,
          })),
        ]
      : [{ ...this.built.eyeRange, material: this.eyeMaterial, materialRole: 'eye' as const }];
    const corneaGroups: MaterialGroup[] = layeredEyes
      ? this.built.ocularRanges.cornea.map((range) => ({
          ...range,
          material: this.corneaMaterial,
          materialRole: 'cornea' as const,
          transparent: true,
        }))
      : [];
    const nailGroups: MaterialGroup[] =
      this.materialCalibrationProfile === 'fixed-light-human-v1'
        ? this.built.nailRanges.flatMap((range) => {
            if (range.indexCount % 12 !== 0) {
              throw new RangeError(
                `fixed-light nail partition requires an index count divisible by 12, received ${range.indexCount}`
              );
            }
            const proximalKeratinIndexCount = range.indexCount / 3;
            const nailBedIndexCount = range.indexCount / 4;
            const distalKeratinIndexCount =
              range.indexCount - proximalKeratinIndexCount - nailBedIndexCount;
            return [
              {
                indexStart: range.indexStart,
                indexCount: proximalKeratinIndexCount,
                material: this.nailMaterial,
                materialRole: 'keratin-nail' as const,
              },
              {
                indexStart: range.indexStart + proximalKeratinIndexCount,
                indexCount: nailBedIndexCount,
                material: this.nailBedMaterial,
                materialRole: 'nail-bed' as const,
              },
              {
                indexStart: range.indexStart + proximalKeratinIndexCount + nailBedIndexCount,
                indexCount: distalKeratinIndexCount,
                material: this.nailMaterial,
                materialRole: 'keratin-nail' as const,
              },
            ];
          })
        : this.built.nailRanges.map((range) => ({
            ...range,
            material: this.nailMaterial,
            materialRole: 'keratin-nail' as const,
          }));
    const groups: MaterialGroup[] = [
      ...this.built.bodySkinRanges.map((range) => ({
        ...range,
        material: this.skinMaterial,
        materialRole: 'skin' as const,
      })),
      ...nailGroups,
      { ...this.built.hairRange, material: this.hairMaterial, materialRole: 'hair' as const },
      ...opaqueEyeGroups,
      {
        ...this.built.garmentRange,
        material: this.garmentMaterial,
        materialRole: 'garment' as const,
      },
      {
        ...this.built.visorRange,
        material: this.visorMaterial,
        materialRole: 'visor' as const,
      },
      {
        ...this.built.mantleRange,
        material: this.mantleMaterial,
        materialRole: 'mantle' as const,
      },
      ...corneaGroups,
    ].filter((group) => group.indexCount > 0);
    return {
      entityId: this.entityId,
      mesh: this.built.mesh,
      jointMatrices: computeJointPalette(this.pose, this.bindWorld, this.inverseBind),
      jointCount: JOINT_COUNT,
      material: this.material,
      modelMatrix: this.modelMatrix,
      materialGroups: groups,
    };
  }

  // ── D.102 "portable agent mind" — wired seam (opt-in) ──
  /**
   * Bind a portable mind to this body: adopt its wallet identity and load its wallet-scoped
   * memory (private:<wallet>) so the SAME agent inhabits the body across substrates (Jetson →
   * headset). Degrades to body-only on any failure — NEVER throws, and never changes how the
   * body renders (getDrawSpec is byte-identical with or without a bound mind).
   */
  async bindMind(mind: CharacterMind, query?: string, limit?: number): Promise<void> {
    this.mind = mind;
    try {
      this.boundIdentity = mind.identity();
      this.memory = await mind.loadMemory(query, limit);
    } catch {
      // body-without-mind: keep rendering; identity/memory simply stay empty.
      this.memory = [];
    }
  }

  /** The bound mind's identity (wallet + agent id), or null if no mind is bound. */
  getIdentity(): MindIdentity | null {
    return this.boundIdentity ? { ...this.boundIdentity } : null;
  }

  /** A copy of the loaded wallet-scoped memory (empty if no mind / load failed). */
  getMemory(): MindMemoryEntry[] {
    return this.memory.map((e) => ({ ...e }));
  }

  /** True once a mind has been bound (regardless of whether memory loaded). */
  hasMind(): boolean {
    return this.mind !== null;
  }
}
