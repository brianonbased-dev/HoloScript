/**
 * CharacterHostFromComposition — derive a renderable CharacterHost from an authored
 * `.holo`/`.hsplus` character composition. The bridge that makes the native authored
 * structure library actually RENDER (composition → CharacterHost → renderCharacter).
 *
 * Pure-data + GPU-free + parser-decoupled: it takes a STRUCTURAL view of the parsed AST (the
 * minimal subset it reads), so it needs no cross-package type import and no runtime parser
 * dependency — the caller parses (`parseHolo`) and passes `.ast` in. It maps the cleanly
 * supported traits (@body, @face, @subsurface_scattering, @hair, @morph, @skeleton, @locomotion)
 * onto CharacterHost and returns an honest report of what is mapped vs stubbed. The native
 * morph channel is a bounded procedural-head FACS/viseme subset; unsupported target/style
 * names remain explicit instead of being silently accepted.
 *
 * @module character-render
 */

import {
  CharacterHost,
  type AgentAvatarMaterialCalibrationProfile,
  type AgentAvatarSkinMaterialReceipt,
  type AgentAvatarSkinMicrodetailProfile,
  type AgentAvatarSkinSurfaceResponseProfile,
} from './CharacterHost';
import { HUMANOID_BONE_NAMES } from '../character/HumanoidSkeleton';
import type { HairCoverageProfile } from '../native-render/draw-spec';
import type {
  AgentAvatarAnatomyReceipt,
  AgentAvatarFacialDetailProfile,
  AgentAvatarFacialLandmarkReceipt,
  AgentAvatarFaceTopology,
  AgentAvatarHandSurfaceReceipt,
  AgentAvatarJointDeformationReceipt,
  AgentAvatarOrbitalProfile,
  AgentAvatarUpperBodyProfile,
} from './AgentAvatarMesh';
import type { GaitMode } from './gait';
import type { ClothSimulationConfig } from './AgentAvatarCloth';
import {
  resolveAgentAvatarGroomProfile,
  resolveAgentAvatarHairCoverageProfile,
  resolveAgentAvatarHairStyle,
  type AgentAvatarGroomGeometryReceipt,
  type AgentAvatarGroomProfile,
  type AgentAvatarHairStyle,
  type AgentAvatarOcularGeometryReceipt,
  type AgentAvatarOcularProfile,
} from './AgentAvatarHair';
import type {
  NativeMorphNormalPolicy,
  NativeMorphReceipt,
  NativeMorphWeights,
} from './AgentAvatarMorph';
import {
  deriveCharacterEnvironmentLightReceipt,
  type CharacterEnvironmentLightOptions,
  type CharacterEnvironmentLightReceipt,
} from './character-render';
import type { Quat } from './skin-math';
import {
  type AgentAvatarGarmentGeometryReceipt,
  type SovereignGarmentStyle,
} from './AgentAvatarGarment';
import {
  getSovereignMantleCatalogEntry,
  isSovereignMantleStyle,
  type SovereignMantleStyle,
} from './AgentAvatarMantleCatalog';

// ── Minimal structural view of the parsed composition (matches HoloComposition AST shape). ──
export interface CompTrait {
  name: string;
  config?: Record<string, unknown>;
}
export interface CompObject {
  id?: string;
  name?: string;
  position?: { x?: number; y?: number; z?: number };
  template?: string;
  traits?: CompTrait[];
  children?: CompObject[];
}
export interface CompTemplate {
  name: string;
  traits?: CompTrait[];
}
export interface ParsedComposition {
  name?: string;
  objects?: CompObject[];
  templates?: CompTemplate[];
  spatialGroups?: Array<{ objects?: CompObject[] }>;
}

export interface CharacterHostFromCompositionOptions {
  /** Override the entity id (else: chosen object id → name → composition name → 'character'). */
  entityId?: string;
  /** Pick a specific character node by id/name (else: first object with a body/skeleton trait). */
  objectId?: string;
  /** Clamp bounds for derived scales (default 0.5..2.0). */
  scaleBounds?: { min: number; max: number };
  /** Select one source-authored @lod level for the emitted native mesh (default 0). */
  lodLevel?: number;
}

export interface CharacterLODTransitionReceipt {
  schemaVersion: 'holoscript.character-lod-transition.v1';
  selectionMode: 'distance' | 'screen-size' | 'manual';
  mode: 'instant' | 'crossfade' | 'dither';
  durationSeconds: number;
  hysteresisBand: number;
}

export interface CharacterPoseReceipt {
  schemaVersion: 'holoscript.character-source-pose.v1';
  name: string;
  space: 'local-bone';
  quaternionOrder: 'xyzw';
  boneCount: number;
  boneNames: readonly string[];
  normalizedQuaternionCount: number;
}

export interface CharacterHostFromCompositionResult {
  ok: boolean;
  host?: CharacterHost;
  /** Gait descriptor for the caller's per-frame `host.applyLocomotion(mode, t, speed)`. */
  gait?: { mode: GaitMode; speed: number };
  /** Packed 0xRRGGBB derived from @subsurface_scattering(color), if present. */
  materialColor?: number;
  /** The operative authored LOD selection, when @lod is present. */
  lod?: {
    level: number;
    distance: number;
    garmentSegments: number;
    hairGuides?: number;
    hairCardsPerGuide?: number;
    hairSegments?: number;
    /** Portrait-cranial-v3 longitude budget selected by this authored tier. */
    faceRadialSegments?: number;
    /** Portrait-cranial-v3 latitude budget selected by this authored tier. */
    faceVerticalSegments?: number;
    /** Source-authored switching semantics shared by every selected tier. */
    transition?: CharacterLODTransitionReceipt;
  };
  /** Operative deterministic cloth configuration, when @cloth_simulation is supported. */
  cloth?: ClothSimulationConfig;
  /** Source-authored native facial topology selection. */
  face?: {
    topology: AgentAvatarFaceTopology;
    radialSegments?: number;
    verticalSegments?: number;
    tearline?: boolean;
    orbitalProfile?: AgentAvatarOrbitalProfile;
    eyeRecess?: number;
    lidOpening?: number;
    canthalTilt?: number;
    facialDetailProfile?: AgentAvatarFacialDetailProfile;
    eyeScale?: number;
    browHeight?: number;
    browThickness?: number;
    earScale?: number;
    mouthDepth?: number;
    cheekboneScale?: number;
    chinProjection?: number;
    templeWidth?: number;
    expressionNormalPolicy?: NativeMorphNormalPolicy;
    faceWidth?: number;
    faceLength?: number;
    jawTaper?: number;
    ocularProfile?: AgentAvatarOcularProfile;
    irisScale?: number;
    pupilScale?: number;
    irisColor?: number;
    scleraColor?: number;
    corneaIor?: number;
  };
  /** Exact native face and upper-body proportions when source-authored controls are operative. */
  anatomy?: AgentAvatarAnatomyReceipt;
  /** Exact native skin-surface response when a supported profile is source-authored. */
  skin?: AgentAvatarSkinMaterialReceipt;
  /** Exact native civic facial landmark topology when source-authored. */
  facialLandmarks?: AgentAvatarFacialLandmarkReceipt;
  /** Exact native garment preset and topology when source-authored. */
  garment?: AgentAvatarGarmentGeometryReceipt;
  /** Exact native ocular topology when a layered eye profile is source-authored. */
  ocular?: AgentAvatarOcularGeometryReceipt;
  /** Derived native groom geometry evidence when hair is operative. */
  groom?: AgentAvatarGroomGeometryReceipt;
  /** Native procedural-head deformation receipt, when supported @morph targets are authored. */
  morph?: NativeMorphReceipt;
  /** First-class source expression receipt; shares the native FACS substrate with @morph. */
  expression?: NativeMorphReceipt;
  /** Source-authored analytic environment and its exact renderer binding receipt. */
  environmentLight?: {
    options: CharacterEnvironmentLightOptions;
    receipt: CharacterEnvironmentLightReceipt;
  };
  /** Source-authored local-bone pose that was applied to the operative native host. */
  pose?: CharacterPoseReceipt;
  /** Operative dual-influence deformation emitted by the selected native body profile. */
  jointDeformation?: AgentAvatarJointDeformationReceipt;
  /** Operative V5 anatomical hand-surface topology emitted by the selected native body profile. */
  handSurface?: AgentAvatarHandSurfaceReceipt;
  /** Detachable public/story mantle and source refs resolved by the host platform. */
  mantle?: {
    style: SovereignMantleStyle;
    detachable: boolean;
    albedoMap?: string;
    normalMap?: string;
    roughnessMap?: string;
  };
  report: {
    objectId?: string;
    resolvedVia: 'objectId' | 'body-trait-heuristic' | 'first-object' | 'none';
    mapped: string[];
    stubbed: Array<{ trait: string; reason: string }>;
    warnings: string[];
  };
}

const DEFAULT_BOUNDS = { min: 0.5, max: 2.0 };
const HUMAN_REF_HEIGHT_M = 1.75;
/** The single skeletal rig the procedural body renders (HUMANOID_65 / 55-bone palette). */
const SUPPORTED_RIG = 'humanoid_65';
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const asNum = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asRecord = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const asVec3 = (v: unknown): [number, number, number] | undefined =>
  Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => typeof x === 'number')
    ? [v[0] as number, v[1] as number, v[2] as number]
    : undefined;
const HUMANOID_BONE_NAME_SET = new Set<string>(HUMANOID_BONE_NAMES);

function asNormalizedQuat(v: unknown): { value: Quat; normalized: boolean } | undefined {
  const record = asRecord(v);
  const components = Array.isArray(v)
    ? v.slice(0, 4)
    : record
      ? [record.x, record.y, record.z, record.w]
      : [];
  if (
    components.length !== 4 ||
    !components.every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    return undefined;
  }
  const [x, y, z, w] = components as [number, number, number, number];
  const magnitude = Math.hypot(x, y, z, w);
  if (magnitude < 1e-8) return undefined;
  return {
    value: {
      x: x / magnitude,
      y: y / magnitude,
      z: z / magnitude,
      w: w / magnitude,
    },
    normalized: Math.abs(magnitude - 1) > 1e-6,
  };
}

function authoredSourcePose(
  trait: TraitRec,
  report: CharacterHostFromCompositionResult['report']
): { pose: Map<string, Quat>; receipt: CharacterPoseReceipt } | undefined {
  const authoredBones = asRecord(cfgVal(trait, 'bones', 'rotations', 'joints'));
  if (!authoredBones) {
    report.stubbed.push({
      trait: '@pose',
      reason: 'pose requires a bones record of HUMANOID_65 local xyzw quaternions',
    });
    return undefined;
  }

  const pose = new Map<string, Quat>();
  let normalizedQuaternionCount = 0;
  for (const [boneName, authoredQuaternion] of Object.entries(authoredBones)) {
    if (!HUMANOID_BONE_NAME_SET.has(boneName)) {
      report.stubbed.push({
        trait: `@pose(bone=${boneName})`,
        reason: `bone is not part of the operative ${SUPPORTED_RIG} palette`,
      });
      continue;
    }
    const quaternion = asNormalizedQuat(authoredQuaternion);
    if (!quaternion) {
      report.stubbed.push({
        trait: `@pose(bone=${boneName})`,
        reason: 'rotation must be a finite non-zero local quaternion in xyzw order',
      });
      continue;
    }
    pose.set(boneName, quaternion.value);
    if (quaternion.normalized) normalizedQuaternionCount++;
  }
  if (pose.size === 0) {
    report.stubbed.push({
      trait: '@pose',
      reason: 'no supported, valid local-bone rotations were authored',
    });
    return undefined;
  }

  const name = asStr(cfgVal(trait, 'name', 'pose_name', 'poseName'))?.trim() || 'source-operative';
  const boneNames = [...pose.keys()].sort();
  const receipt: CharacterPoseReceipt = {
    schemaVersion: 'holoscript.character-source-pose.v1',
    name,
    space: 'local-bone',
    quaternionOrder: 'xyzw',
    boneCount: boneNames.length,
    boneNames,
    normalizedQuaternionCount,
  };
  report.mapped.push(`@pose(name=${name},bones=${boneNames.join(',')})`);
  return { pose, receipt };
}

function authoredLODTransition(
  trait: TraitRec,
  report: CharacterHostFromCompositionResult['report']
): CharacterLODTransitionReceipt | undefined {
  const authoredKeys = ['mode', 'hysteresis', 'fade_mode', 'fade_duration_ms'];
  if (!authoredKeys.some((key) => trait.config[key] !== undefined)) return undefined;

  const selectionSource = (asStr(cfgVal(trait, 'mode')) ?? 'screen_size')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  const selectionMode =
    selectionSource === 'distance' ||
    selectionSource === 'screen-size' ||
    selectionSource === 'manual'
      ? selectionSource
      : undefined;
  const fadeSource = (asStr(cfgVal(trait, 'fade_mode')) ?? 'cross_fade')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  const mode =
    fadeSource === 'instant'
      ? 'instant'
      : fadeSource === 'cross-fade' || fadeSource === 'crossfade'
        ? 'crossfade'
        : fadeSource === 'dither'
          ? 'dither'
          : undefined;
  if (!selectionMode || !mode) {
    report.stubbed.push({
      trait: '@lod(transition)',
      reason:
        `unsupported mode '${selectionSource}' or fade_mode '${fadeSource}'; ` +
        'native character transition receipt omitted',
    });
    return undefined;
  }

  const durationMilliseconds = clamp(asNum(cfgVal(trait, 'fade_duration_ms')) ?? 200, 1, 5000);
  const transition: CharacterLODTransitionReceipt = {
    schemaVersion: 'holoscript.character-lod-transition.v1',
    selectionMode,
    mode,
    durationSeconds: durationMilliseconds / 1000,
    hysteresisBand: clamp(asNum(cfgVal(trait, 'hysteresis')) ?? 0.05, 0, 100),
  };
  report.mapped.push(
    `@lod(transition=${transition.mode},duration_s=${transition.durationSeconds},` +
      `hysteresis=${transition.hysteresisBand},selection=${transition.selectionMode})`
  );
  return transition;
}

/** Normalize an authored RGB array or #RRGGBB string to a clamped linear-RGB tuple. */
function asRgb(v: unknown): [number, number, number] | undefined {
  if (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => typeof x === 'number')) {
    return [clamp(v[0] as number, 0, 1), clamp(v[1] as number, 0, 1), clamp(v[2] as number, 0, 1)];
  }
  if (typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v)) {
    const packed = parseInt(v.replace('#', ''), 16);
    return [((packed >> 16) & 0xff) / 255, ((packed >> 8) & 0xff) / 255, (packed & 0xff) / 255];
  }
  return undefined;
}

function packRgb(rgb: [number, number, number] | undefined): number | undefined {
  if (!rgb) return undefined;
  return (
    (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255)
  );
}

/** Read a trait config value by key, falling back to the parser's positional `_arg0`. */
function cfgVal(t: TraitRec | undefined, ...keys: string[]): unknown {
  if (!t) return undefined;
  for (const k of keys) if (t.config[k] !== undefined) return t.config[k];
  return t.config._arg0;
}

interface TraitRec {
  config: Record<string, unknown>;
}
type TraitMap = Map<string, TraitRec>;

/** Accept both current dict targets and legacy array-of-{name,weight} avatar authoring. */
function authoredMorphWeights(trait: TraitRec): NativeMorphWeights {
  const targets = cfgVal(trait, 'targets', 'weights');
  const weights: Record<string, number> = {};
  const targetRecord = asRecord(targets);
  if (targetRecord) {
    for (const [name, value] of Object.entries(targetRecord)) {
      if (typeof value === 'number') weights[name] = value;
    }
    return weights;
  }
  if (!Array.isArray(targets)) return weights;
  for (const target of targets) {
    if (typeof target === 'string') {
      weights[target] = 1;
      continue;
    }
    const record = asRecord(target);
    const name = record ? asStr(record.name) : undefined;
    const weight = record ? asNum(record.weight) : undefined;
    if (name) weights[name] = weight ?? 1;
  }
  return weights;
}

/** @expression accepts both a targets record and direct first-class FACS controls. */
function authoredExpressionWeights(trait: TraitRec): NativeMorphWeights {
  const weights = { ...authoredMorphWeights(trait) } as Record<string, number>;
  for (const key of [
    'blink',
    'blink_left',
    'blink_right',
    'brow_raise',
    'brow_raise_left',
    'brow_raise_right',
    'smile',
    'jaw_open',
  ]) {
    const value = asNum(trait.config[key]);
    if (value !== undefined) weights[key] = value;
  }
  return weights;
}

/** Merge an object's own traits over its `using` template's traits (template carries the set). */
function mergeTraits(obj: CompObject, templates: CompTemplate[]): TraitMap {
  const m: TraitMap = new Map();
  const add = (tr: CompTrait): void => {
    m.set(tr.name.replace(/^@/, '').toLowerCase(), { config: tr.config ?? {} });
  };
  if (obj.template) templates.find((t) => t.name === obj.template)?.traits?.forEach(add);
  obj.traits?.forEach(add);
  return m;
}

/** Flatten scene objects + spatial groups + nested children. */
function allObjects(comp: ParsedComposition): CompObject[] {
  const out: CompObject[] = [];
  const walk = (o: CompObject): void => {
    out.push(o);
    o.children?.forEach(walk);
  };
  comp.objects?.forEach(walk);
  comp.spatialGroups?.forEach((g) => g.objects?.forEach(walk));
  return out;
}

const BODY_TRAITS = ['body', 'skeleton', 'poseable', 'pose'];

/**
 * Project a LocomotionConfig / VR-locomotion mode onto a skeletal gait. Movement modes →
 * walk/run; comfort/teleport/none → idle (recorded as stubbed). Covers the full LocomotionMode
 * vocabulary + VR `default_mode` values.
 */
const GAIT_FROM_MODE: Record<string, GaitMode | null> = {
  idle: 'idle',
  walk: 'walk',
  smooth: 'walk', // VR smooth-locomotion = continuous walking
  run: 'run',
  jog: 'run',
  glide: 'walk',
  path: 'walk',
  orbit: 'walk',
  follow: 'walk',
  // no skinned gait — comfort / discrete / non-bipedal:
  teleport: null,
  room_scale: null,
  snap: null,
  fly: null,
  swim: null,
};

/**
 * Build a renderable CharacterHost from a parsed character composition.
 * The caller parses the source (e.g. `parseHolo(src).ast`) and passes it here.
 */
export function buildCharacterHostFromComposition(
  parsed: ParsedComposition,
  opts: CharacterHostFromCompositionOptions = {}
): CharacterHostFromCompositionResult {
  const bounds = opts.scaleBounds ?? DEFAULT_BOUNDS;
  const templates = parsed.templates ?? [];
  const objs = allObjects(parsed);
  const report: CharacterHostFromCompositionResult['report'] = {
    resolvedVia: 'none',
    mapped: [],
    stubbed: [],
    warnings: [],
  };

  // 1. Resolve the character object.
  let obj: CompObject | undefined;
  if (opts.objectId) {
    obj = objs.find((o) => o.id === opts.objectId || o.name === opts.objectId);
    if (obj) report.resolvedVia = 'objectId';
  }
  if (!obj) {
    obj = objs.find((o) => {
      const tm = mergeTraits(o, templates);
      return BODY_TRAITS.some((t) => tm.has(t));
    });
    if (obj) report.resolvedVia = 'body-trait-heuristic';
  }
  if (!obj && objs.length > 0) {
    obj = objs[0];
    report.resolvedVia = 'first-object';
  }
  if (!obj) {
    report.warnings.push('no character object found; not fabricating a body');
    return { ok: false, report };
  }
  report.objectId = obj.id ?? obj.name;
  const traits = mergeTraits(obj, templates);

  // 2. @lod → an authored topology selection. The compiler chooses one declared level;
  //    it never invents decimation tiers from the LOD0 mesh.
  let lod: CharacterHostFromCompositionResult['lod'];
  const lodTrait = traits.get('lod');
  if (lodTrait) {
    const transition = authoredLODTransition(lodTrait, report);
    const requestedLevel = Math.max(0, Math.round(opts.lodLevel ?? 0));
    const levels = cfgVal(lodTrait, 'levels');
    const authored = Array.isArray(levels)
      ? levels.map(asRecord).filter((level): level is Record<string, unknown> => !!level)
      : [];
    const selected = authored.find(
      (level) => Math.round(asNum(level.level) ?? -1) === requestedLevel
    );
    if (selected) {
      const garmentSegments = Math.max(
        6,
        Math.min(32, Math.round(asNum(selected.garment_segments) ?? 24))
      );
      const authoredHairGuides = asNum(selected.hair_guides);
      const authoredHairCardsPerGuide = asNum(selected.hair_cards_per_guide);
      const authoredHairSegments = asNum(selected.hair_segments);
      const authoredFaceRadialSegments = asNum(selected.face_radial_segments);
      const authoredFaceVerticalSegments = asNum(selected.face_vertical_segments);
      const hairGuides =
        authoredHairGuides === undefined
          ? undefined
          : Math.max(16, Math.min(512, Math.round(authoredHairGuides)));
      const hairCardsPerGuide =
        authoredHairCardsPerGuide === undefined
          ? undefined
          : Math.max(1, Math.min(4, Math.round(authoredHairCardsPerGuide)));
      const hairSegments =
        authoredHairSegments === undefined
          ? undefined
          : Math.max(2, Math.min(16, Math.round(authoredHairSegments)));
      const faceRadialSegments =
        authoredFaceRadialSegments === undefined
          ? undefined
          : Math.max(12, Math.min(48, Math.round(authoredFaceRadialSegments)));
      const faceVerticalSegments =
        authoredFaceVerticalSegments === undefined
          ? undefined
          : Math.max(8, Math.min(36, Math.round(authoredFaceVerticalSegments)));
      lod = {
        level: requestedLevel,
        distance: Math.max(0, asNum(selected.distance) ?? 0),
        garmentSegments,
        ...(hairGuides === undefined ? {} : { hairGuides }),
        ...(hairCardsPerGuide === undefined ? {} : { hairCardsPerGuide }),
        ...(hairSegments === undefined ? {} : { hairSegments }),
        ...(faceRadialSegments === undefined ? {} : { faceRadialSegments }),
        ...(faceVerticalSegments === undefined ? {} : { faceVerticalSegments }),
        ...(transition ? { transition } : {}),
      };
      report.mapped.push(`@lod(level=${requestedLevel})`);
      if (
        hairGuides !== undefined ||
        hairCardsPerGuide !== undefined ||
        hairSegments !== undefined
      ) {
        report.mapped.push(
          `@lod(hair_guides=${hairGuides ?? 'style-default'},` +
            `hair_cards_per_guide=${hairCardsPerGuide ?? 'style-default'},` +
            `hair_segments=${hairSegments ?? 'style-default'})`
        );
      }
    } else {
      report.stubbed.push({
        trait: '@lod',
        reason: `level ${requestedLevel} is not authored; no generated fallback tier`,
      });
    }
  }

  // 3. @body → heightScale / buildScale (height authored in METRES; reference = 1.75 m).
  let heightScale = 1;
  let buildScale = 1;
  let shoulderScale = 1;
  let torsoScale = 1;
  let upperBodyProfile: AgentAvatarUpperBodyProfile | undefined;
  let upperBodyRadialSegments: number | undefined;
  let leftScapularElevation: number | undefined;
  let rightScapularElevation: number | undefined;
  let leftScapularProtraction: number | undefined;
  let rightScapularProtraction: number | undefined;
  let nailTone: number | undefined;
  let nailRoughness: number | undefined;
  let nailBedTone: number | undefined;
  let nailBedRoughness: number | undefined;
  let anatomyAuthored = false;
  const body = traits.get('body');
  if (body) {
    report.mapped.push('@body');
    const h = asNum(cfgVal(body, 'height', 'height_m'));
    if (h !== undefined) {
      const scale = h > 0.5 ? h / HUMAN_REF_HEIGHT_M : h; // metres → scale; tiny values = explicit scale
      heightScale = clamp(scale, bounds.min, bounds.max);
    }
    const b = asNum(cfgVal(body, 'build_scale', 'thickness'));
    if (b !== undefined) buildScale = clamp(b, bounds.min, bounds.max);
    const authoredShoulderScale = asNum(body.config.shoulder_scale ?? body.config.shoulderScale);
    const authoredTorsoScale = asNum(body.config.torso_scale ?? body.config.torsoScale);
    if (authoredShoulderScale !== undefined || authoredTorsoScale !== undefined) {
      shoulderScale = clamp(authoredShoulderScale ?? 1, 0.85, 1.25);
      torsoScale = clamp(authoredTorsoScale ?? 1, 0.85, 1.2);
      anatomyAuthored = true;
      report.mapped.push(`@body(shoulder_scale=${shoulderScale},torso_scale=${torsoScale})`);
    }
    const authoredUpperBodyProfile = asStr(
      body.config.upper_body_profile ?? body.config.upperBodyProfile
    )
      ?.toLowerCase()
      .replace(/_/g, '-');
    const authoredUpperBodyRadialSegments = asNum(
      body.config.upper_body_radial_segments ?? body.config.upperBodyRadialSegments
    );
    if (
      authoredUpperBodyProfile === 'coherent-shoulder-neck-torso-v1' ||
      authoredUpperBodyProfile === 'coherent-anatomical-limbs-v2' ||
      authoredUpperBodyProfile === 'coherent-hand-landmarks-v3' ||
      authoredUpperBodyProfile === 'coherent-deforming-hands-v4' ||
      authoredUpperBodyProfile === 'coherent-hand-surface-v5' ||
      authoredUpperBodyProfile === 'coherent-portrait-anatomy-v6' ||
      authoredUpperBodyProfile === 'coherent-expressive-anatomy-v7' ||
      authoredUpperBodyProfile === 'legacy-segments-v1'
    ) {
      upperBodyProfile = authoredUpperBodyProfile;
      anatomyAuthored = true;
      if (upperBodyProfile !== 'legacy-segments-v1') {
        upperBodyRadialSegments = Math.max(
          12,
          Math.min(32, Math.round(authoredUpperBodyRadialSegments ?? 24))
        );
        report.mapped.push(
          `@body(upper_body_profile=${upperBodyProfile},` +
            `upper_body_radial_segments=${upperBodyRadialSegments})`
        );
      } else {
        report.mapped.push(`@body(upper_body_profile=${upperBodyProfile})`);
        if (authoredUpperBodyRadialSegments !== undefined) {
          report.stubbed.push({
            trait: '@body(upper_body_topology_controls)',
            reason: 'upper-body topology controls require the coherent upper_body_profile',
          });
        }
      }
      const authoredNailTone = packRgb(asRgb(body.config.nail_tone ?? body.config.nailTone));
      const authoredNailRoughness = asNum(body.config.nail_roughness ?? body.config.nailRoughness);
      const authoredNailBedTone = packRgb(
        asRgb(body.config.nail_bed_tone ?? body.config.nailBedTone)
      );
      const authoredNailBedRoughness = asNum(
        body.config.nail_bed_roughness ?? body.config.nailBedRoughness
      );
      if (
        upperBodyProfile === 'coherent-hand-landmarks-v3' ||
        upperBodyProfile === 'coherent-deforming-hands-v4' ||
        upperBodyProfile === 'coherent-hand-surface-v5' ||
        upperBodyProfile === 'coherent-portrait-anatomy-v6' ||
        upperBodyProfile === 'coherent-expressive-anatomy-v7'
      ) {
        nailTone = authoredNailTone;
        nailRoughness =
          authoredNailRoughness === undefined
            ? undefined
            : clamp(authoredNailRoughness, 0.08, 0.65);
        nailBedTone = authoredNailBedTone;
        nailBedRoughness =
          authoredNailBedRoughness === undefined
            ? undefined
            : clamp(authoredNailBedRoughness, 0.12, 0.72);
        if (authoredNailTone !== undefined || authoredNailRoughness !== undefined) {
          report.mapped.push(
            `@body(nail_tone=${authoredNailTone ?? 'profile-default'},` +
              `nail_roughness=${nailRoughness ?? 'profile-default'})`
          );
        }
      } else if (
        authoredNailTone !== undefined ||
        authoredNailRoughness !== undefined ||
        authoredNailBedTone !== undefined ||
        authoredNailBedRoughness !== undefined
      ) {
        report.stubbed.push({
          trait: '@body(nail_material_controls)',
          reason:
            'nail material controls require a native hand-landmark profile from V3 through V7',
        });
      }
      const hasScapularControls =
        body.config.left_scapular_elevation !== undefined ||
        body.config.right_scapular_elevation !== undefined ||
        body.config.left_scapular_protraction !== undefined ||
        body.config.right_scapular_protraction !== undefined;
      if (upperBodyProfile === 'coherent-expressive-anatomy-v7') {
        leftScapularElevation = clamp(asNum(body.config.left_scapular_elevation) ?? 0, -1, 1);
        rightScapularElevation = clamp(asNum(body.config.right_scapular_elevation) ?? 0, -1, 1);
        leftScapularProtraction = clamp(asNum(body.config.left_scapular_protraction) ?? 0, -1, 1);
        rightScapularProtraction = clamp(asNum(body.config.right_scapular_protraction) ?? 0, -1, 1);
        report.mapped.push(
          `@body(scapular_elevation=${leftScapularElevation}:${rightScapularElevation},` +
            `scapular_protraction=${leftScapularProtraction}:${rightScapularProtraction})`
        );
      } else if (hasScapularControls) {
        report.stubbed.push({
          trait: '@body(scapular_controls)',
          reason: 'independent scapular controls require coherent-expressive-anatomy-v7',
        });
      }
    } else if (authoredUpperBodyProfile) {
      report.stubbed.push({
        trait: '@body(upper_body_profile)',
        reason: `profile '${authoredUpperBodyProfile}' has no native upper-body geometry implementation`,
      });
      if (authoredUpperBodyRadialSegments !== undefined) {
        report.stubbed.push({
          trait: '@body(upper_body_topology_controls)',
          reason: 'upper-body topology controls require a supported upper_body_profile',
        });
      }
    } else if (authoredUpperBodyRadialSegments !== undefined) {
      report.stubbed.push({
        trait: '@body(upper_body_topology_controls)',
        reason: 'upper-body topology controls require a supported upper_body_profile',
      });
    }
  }

  // 4. @face → a source-selectable native facial topology. The legacy cap remains the default;
  //    unsupported topology names are never accepted as if they rendered.
  let faceTopology: AgentAvatarFaceTopology = 'procedural-head-v1';
  let faceRadialSegments: number | undefined;
  let faceVerticalSegments: number | undefined;
  let faceTearline: boolean | undefined;
  let orbitalProfile: AgentAvatarOrbitalProfile | undefined;
  let eyeRecess: number | undefined;
  let lidOpening: number | undefined;
  let canthalTilt: number | undefined;
  let facialDetailProfile: AgentAvatarFacialDetailProfile | undefined;
  let eyeScale: number | undefined;
  let browHeight: number | undefined;
  let browThickness: number | undefined;
  let earScale: number | undefined;
  let mouthDepth: number | undefined;
  let cheekboneScale: number | undefined;
  let chinProjection: number | undefined;
  let templeWidth: number | undefined;
  let expressionNormalPolicy: NativeMorphNormalPolicy | undefined;
  let faceWidth = 1;
  let faceLength = 1;
  let jawTaper = 0.22;
  let authoredFaceWidth: number | undefined;
  let authoredFaceLength: number | undefined;
  let authoredJawTaper: number | undefined;
  let ocularProfile: AgentAvatarOcularProfile | undefined;
  let irisScale: number | undefined;
  let pupilScale: number | undefined;
  let irisColor: number | undefined;
  let scleraColor: number | undefined;
  let corneaIor: number | undefined;
  let face: CharacterHostFromCompositionResult['face'];
  const faceTrait = traits.get('face');
  if (faceTrait) {
    const authoredTopology = (
      asStr(cfgVal(faceTrait, 'topology', 'profile')) ?? 'procedural-head-v1'
    )
      .toLowerCase()
      .replace(/_/g, '-');
    if (authoredTopology === 'procedural-head-v1' || authoredTopology === 'neutral-anatomical-v2') {
      faceTopology = authoredTopology;
      if (faceTopology === 'neutral-anatomical-v2') {
        const authoredFaceRadialSegments = asNum(cfgVal(faceTrait, 'radial_segments'));
        const authoredFaceVerticalSegments = asNum(cfgVal(faceTrait, 'vertical_segments'));
        faceRadialSegments = Math.max(
          12,
          Math.min(32, Math.round(authoredFaceRadialSegments ?? 20))
        );
        faceVerticalSegments = Math.max(
          8,
          Math.min(24, Math.round(authoredFaceVerticalSegments ?? 14))
        );
        faceTearline = cfgVal(faceTrait, 'tearline', 'include_tearline') !== false;
        authoredFaceWidth = asNum(faceTrait.config.face_width ?? faceTrait.config.faceWidth);
        authoredFaceLength = asNum(faceTrait.config.face_length ?? faceTrait.config.faceLength);
        authoredJawTaper = asNum(faceTrait.config.jaw_taper ?? faceTrait.config.jawTaper);
        if (
          authoredFaceWidth !== undefined ||
          authoredFaceLength !== undefined ||
          authoredJawTaper !== undefined
        ) {
          faceWidth = clamp(authoredFaceWidth ?? 1, 0.84, 1.2);
          faceLength = clamp(authoredFaceLength ?? 1, 0.86, 1.16);
          jawTaper = clamp(authoredJawTaper ?? 0.22, 0.08, 0.38);
          anatomyAuthored = true;
          report.mapped.push(
            `@face(face_width=${faceWidth},face_length=${faceLength},jaw_taper=${jawTaper})`
          );
        }
        const authoredOrbitalProfile = asStr(cfgVal(faceTrait, 'orbital_profile', 'eyelid_profile'))
          ?.toLowerCase()
          .replace(/_/g, '-');
        if (
          authoredOrbitalProfile === 'tearline-rim-v1' ||
          authoredOrbitalProfile === 'recessed-lids-v1' ||
          authoredOrbitalProfile === 'anatomical-lid-fold-v2' ||
          authoredOrbitalProfile === 'anatomical-lid-blend-v3'
        ) {
          orbitalProfile = authoredOrbitalProfile;
          eyeRecess = clamp(
            asNum(cfgVal(faceTrait, 'eye_recess', 'globe_recess')) ??
              (orbitalProfile === 'recessed-lids-v1' ||
              orbitalProfile === 'anatomical-lid-fold-v2' ||
              orbitalProfile === 'anatomical-lid-blend-v3'
                ? 0.28
                : 0),
            0,
            0.45
          );
          lidOpening = clamp(asNum(cfgVal(faceTrait, 'lid_opening')) ?? 0.56, 0.42, 0.78);
          canthalTilt = clamp(asNum(cfgVal(faceTrait, 'canthal_tilt')) ?? 0.12, -0.25, 0.25);
          report.mapped.push(`@face(orbital_profile=${orbitalProfile})`);
        } else if (authoredOrbitalProfile) {
          report.stubbed.push({
            trait: '@face(orbital_profile)',
            reason: `profile '${authoredOrbitalProfile}' has no native orbital geometry channel`,
          });
        }
        const authoredFacialDetailProfile = asStr(
          cfgVal(faceTrait, 'facial_detail_profile', 'landmark_profile')
        )
          ?.toLowerCase()
          .replace(/_/g, '-');
        const hasPortraitSilhouetteControls =
          faceTrait.config.cheekbone_scale !== undefined ||
          faceTrait.config.chin_projection !== undefined ||
          faceTrait.config.temple_width !== undefined;
        if (
          authoredFacialDetailProfile === 'legacy-landmarks-v1' ||
          authoredFacialDetailProfile === 'civic-landmarks-v1' ||
          authoredFacialDetailProfile === 'portrait-silhouette-v2' ||
          authoredFacialDetailProfile === 'portrait-cranial-v3' ||
          authoredFacialDetailProfile === 'portrait-soft-tissue-v4' ||
          authoredFacialDetailProfile === 'portrait-facial-volume-v5'
        ) {
          if (
            (authoredFacialDetailProfile === 'portrait-cranial-v3' ||
              authoredFacialDetailProfile === 'portrait-soft-tissue-v4' ||
              authoredFacialDetailProfile === 'portrait-facial-volume-v5') &&
            upperBodyProfile !== 'coherent-expressive-anatomy-v7'
          ) {
            report.stubbed.push({
              trait: '@face(facial_detail_profile)',
              reason:
                `${authoredFacialDetailProfile} requires coherent-expressive-anatomy-v7 ` +
                'for indexed neck-cranium continuity',
            });
          } else {
            facialDetailProfile = authoredFacialDetailProfile;
            eyeScale = clamp(asNum(cfgVal(faceTrait, 'eye_scale', 'globe_scale')) ?? 1, 0.72, 1.08);
            browHeight = clamp(asNum(cfgVal(faceTrait, 'brow_height')) ?? 1.05, 0.65, 1.65);
            browThickness = clamp(asNum(cfgVal(faceTrait, 'brow_thickness')) ?? 0.16, 0.08, 0.32);
            earScale = clamp(asNum(cfgVal(faceTrait, 'ear_scale')) ?? 1, 0.7, 1.3);
            mouthDepth = clamp(asNum(cfgVal(faceTrait, 'mouth_depth')) ?? 0.72, 0.25, 1.4);
          }
          if (
            facialDetailProfile === 'portrait-silhouette-v2' ||
            facialDetailProfile === 'portrait-cranial-v3' ||
            facialDetailProfile === 'portrait-soft-tissue-v4' ||
            facialDetailProfile === 'portrait-facial-volume-v5'
          ) {
            cheekboneScale = clamp(asNum(cfgVal(faceTrait, 'cheekbone_scale')) ?? 1, 0.82, 1.22);
            chinProjection = clamp(asNum(cfgVal(faceTrait, 'chin_projection')) ?? 1, 0.72, 1.28);
            templeWidth = clamp(asNum(cfgVal(faceTrait, 'temple_width')) ?? 1, 0.88, 1.12);
          } else if (hasPortraitSilhouetteControls) {
            report.stubbed.push({
              trait: '@face(portrait_silhouette_controls)',
              reason:
                'cheekbone_scale, chin_projection, and temple_width require portrait_silhouette_v2',
            });
          }
          if (facialDetailProfile) {
            if (
              facialDetailProfile === 'portrait-cranial-v3' ||
              facialDetailProfile === 'portrait-soft-tissue-v4' ||
              facialDetailProfile === 'portrait-facial-volume-v5'
            ) {
              faceRadialSegments = Math.max(
                12,
                Math.min(
                  48,
                  Math.round(lod?.faceRadialSegments ?? authoredFaceRadialSegments ?? 40)
                )
              );
              faceVerticalSegments = Math.max(
                8,
                Math.min(
                  36,
                  Math.round(lod?.faceVerticalSegments ?? authoredFaceVerticalSegments ?? 28)
                )
              );
              anatomyAuthored = true;
              report.mapped.push(
                `@lod(face_segments=${faceRadialSegments}x${faceVerticalSegments})`
              );
            }
            report.mapped.push(
              `@face(facial_detail_profile=${facialDetailProfile},eye_scale=${eyeScale},` +
                `brow_height=${browHeight},brow_thickness=${browThickness},` +
                `ear_scale=${earScale},mouth_depth=${mouthDepth}` +
                (facialDetailProfile === 'portrait-silhouette-v2' ||
                facialDetailProfile === 'portrait-cranial-v3' ||
                facialDetailProfile === 'portrait-soft-tissue-v4' ||
                facialDetailProfile === 'portrait-facial-volume-v5'
                  ? `,cheekbone_scale=${cheekboneScale},chin_projection=${chinProjection},` +
                    `temple_width=${templeWidth}`
                  : '') +
                ')'
            );
          }
        } else if (authoredFacialDetailProfile) {
          report.stubbed.push({
            trait: '@face(facial_detail_profile)',
            reason: `profile '${authoredFacialDetailProfile}' has no native landmark geometry channel`,
          });
        } else if (
          faceTrait.config.eye_scale !== undefined ||
          faceTrait.config.globe_scale !== undefined ||
          faceTrait.config.brow_height !== undefined ||
          faceTrait.config.brow_thickness !== undefined ||
          faceTrait.config.ear_scale !== undefined ||
          faceTrait.config.mouth_depth !== undefined ||
          hasPortraitSilhouetteControls
        ) {
          report.stubbed.push({
            trait: '@face(facial_landmark_controls)',
            reason: 'facial landmark controls require a supported facial_detail_profile',
          });
        }
        const authoredExpressionNormalPolicy = asStr(
          cfgVal(faceTrait, 'expression_normal_policy', 'expressionNormalPolicy')
        )
          ?.toLowerCase()
          .replace(/_/g, '-');
        if (
          authoredExpressionNormalPolicy === 'recompute-affected-v1' &&
          (facialDetailProfile === 'portrait-cranial-v3' ||
            facialDetailProfile === 'portrait-soft-tissue-v4' ||
            facialDetailProfile === 'portrait-facial-volume-v5')
        ) {
          expressionNormalPolicy = authoredExpressionNormalPolicy;
          report.mapped.push(`@face(expression_normal_policy=${expressionNormalPolicy})`);
        } else if (authoredExpressionNormalPolicy === 'legacy-static-v1') {
          expressionNormalPolicy = authoredExpressionNormalPolicy;
          report.mapped.push(`@face(expression_normal_policy=${expressionNormalPolicy})`);
        } else if (authoredExpressionNormalPolicy) {
          report.stubbed.push({
            trait: '@face(expression_normal_policy)',
            reason:
              authoredExpressionNormalPolicy === 'recompute-affected-v1'
                ? 'recompute-affected-v1 requires a portrait cranial profile'
                : `policy '${authoredExpressionNormalPolicy}' has no native expression-normal channel`,
          });
        }
      } else if (
        faceTrait.config.face_width !== undefined ||
        faceTrait.config.faceWidth !== undefined ||
        faceTrait.config.face_length !== undefined ||
        faceTrait.config.faceLength !== undefined ||
        faceTrait.config.jaw_taper !== undefined ||
        faceTrait.config.jawTaper !== undefined
      ) {
        report.stubbed.push({
          trait: '@face(proportions)',
          reason: 'face proportion controls require topology neutral_anatomical_v2',
        });
      }
      const authoredOcularProfile = asStr(cfgVal(faceTrait, 'ocular_profile', 'eye_profile'))
        ?.toLowerCase()
        .replace(/_/g, '-');
      if (
        authoredOcularProfile === 'layered-ocular-v1' ||
        authoredOcularProfile === 'layered-ocular-tearfilm-v2' ||
        authoredOcularProfile === 'layered-ocular-calibrated-v3' ||
        authoredOcularProfile === 'legacy-composite-v1'
      ) {
        ocularProfile = authoredOcularProfile;
        irisScale = clamp(asNum(cfgVal(faceTrait, 'iris_scale')) ?? 0.48, 0.34, 0.62);
        pupilScale = clamp(asNum(cfgVal(faceTrait, 'pupil_scale')) ?? 0.42, 0.2, 0.72);
        irisColor = packRgb(asRgb(cfgVal(faceTrait, 'iris_color', 'iris_colour')));
        scleraColor = packRgb(asRgb(cfgVal(faceTrait, 'sclera_color', 'sclera_colour')));
        corneaIor = clamp(asNum(cfgVal(faceTrait, 'cornea_ior')) ?? 1.376, 1.3, 1.45);
        report.mapped.push(`@face(ocular_profile=${ocularProfile})`);
      } else if (authoredOcularProfile) {
        report.stubbed.push({
          trait: '@face(ocular_profile)',
          reason: `profile '${authoredOcularProfile}' has no native ocular geometry channel`,
        });
      }
      face = {
        topology: faceTopology,
        ...(faceRadialSegments === undefined ? {} : { radialSegments: faceRadialSegments }),
        ...(faceVerticalSegments === undefined ? {} : { verticalSegments: faceVerticalSegments }),
        ...(faceTearline === undefined ? {} : { tearline: faceTearline }),
        ...(orbitalProfile === undefined ? {} : { orbitalProfile }),
        ...(eyeRecess === undefined ? {} : { eyeRecess }),
        ...(lidOpening === undefined ? {} : { lidOpening }),
        ...(canthalTilt === undefined ? {} : { canthalTilt }),
        ...(facialDetailProfile === undefined ? {} : { facialDetailProfile }),
        ...(eyeScale === undefined ? {} : { eyeScale }),
        ...(browHeight === undefined ? {} : { browHeight }),
        ...(browThickness === undefined ? {} : { browThickness }),
        ...(earScale === undefined ? {} : { earScale }),
        ...(mouthDepth === undefined ? {} : { mouthDepth }),
        ...(cheekboneScale === undefined ? {} : { cheekboneScale }),
        ...(chinProjection === undefined ? {} : { chinProjection }),
        ...(templeWidth === undefined ? {} : { templeWidth }),
        ...(expressionNormalPolicy === undefined ? {} : { expressionNormalPolicy }),
        ...(authoredFaceWidth === undefined ? {} : { faceWidth }),
        ...(authoredFaceLength === undefined ? {} : { faceLength }),
        ...(authoredJawTaper === undefined ? {} : { jawTaper }),
        ...(ocularProfile === undefined ? {} : { ocularProfile }),
        ...(irisScale === undefined ? {} : { irisScale }),
        ...(pupilScale === undefined ? {} : { pupilScale }),
        ...(irisColor === undefined ? {} : { irisColor }),
        ...(scleraColor === undefined ? {} : { scleraColor }),
        ...(corneaIor === undefined ? {} : { corneaIor }),
      };
      report.mapped.push(`@face(topology=${faceTopology})`);
    } else {
      report.stubbed.push({
        trait: '@face',
        reason: `topology '${authoredTopology}' has no native facial geometry channel`,
      });
    }
  }

  // 5. Skin tone → packed colour. Prefer @subsurface_scattering(color); fall back to
  //    @body(skin_tone) (the canonical avatar-template authoring shape).
  let color: number | undefined;
  const sss = traits.get('subsurface_scattering');
  const sssColor = sss ? cfgVal(sss, 'color', 'base_color', 'skin_tone') : undefined;
  const normalizedSssColor = asRgb(sssColor);
  if (normalizedSssColor) {
    const [r, g, b] = normalizedSssColor;
    color = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
    report.mapped.push('@subsurface_scattering');
  } else {
    const tone = asStr(cfgVal(body, 'skin_tone'));
    if (tone && /^#?[0-9a-fA-F]{6}$/.test(tone)) {
      color = parseInt(tone.replace('#', ''), 16);
      report.warnings.push('skin tone taken from @body(skin_tone)');
    }
  }
  const skinScatterColor = asRgb(sss ? cfgVal(sss, 'scatter_color', 'scatterColor') : undefined);
  if (skinScatterColor) {
    report.mapped.push('@subsurface_scattering(scatter_color)');
  }
  let skinMicrodetailProfile: AgentAvatarSkinMicrodetailProfile | undefined;
  let skinMicrodetailScale: number | undefined;
  let skinMicrodetailStrength: number | undefined;
  let skinSurfaceResponseProfile: AgentAvatarSkinSurfaceResponseProfile | undefined;
  let skinAlbedoVariationStrength: number | undefined;
  let skinRoughnessVariationStrength: number | undefined;
  let skinNormalMicrodetailStrength: number | undefined;
  let materialCalibrationProfile: AgentAvatarMaterialCalibrationProfile | undefined;
  const authoredMaterialCalibrationProfile = asStr(
    sss?.config.material_calibration_profile ??
      sss?.config.materialCalibrationProfile ??
      sss?.config.calibration_profile ??
      sss?.config.calibrationProfile
  )
    ?.trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (
    authoredMaterialCalibrationProfile === 'fixed-light-human-v1' ||
    authoredMaterialCalibrationProfile === 'legacy-v1'
  ) {
    materialCalibrationProfile = authoredMaterialCalibrationProfile;
    report.mapped.push(
      `@subsurface_scattering(material_calibration_profile=${materialCalibrationProfile})`
    );
  } else if (authoredMaterialCalibrationProfile) {
    report.stubbed.push({
      trait: '@subsurface_scattering(material_calibration_profile)',
      reason: `profile '${authoredMaterialCalibrationProfile}' has no native material calibration`,
    });
  }
  const authoredSkinMicrodetailProfile = asStr(
    sss?.config.microdetail_profile ?? sss?.config.microdetailProfile
  )
    ?.trim()
    .toLowerCase()
    .replace(/_/g, '-');
  const authoredSkinMicrodetailScale = asNum(
    sss?.config.microdetail_scale ?? sss?.config.microdetailScale
  );
  const authoredSkinMicrodetailStrength = asNum(
    sss?.config.microdetail_strength ?? sss?.config.microdetailStrength
  );
  if (
    authoredSkinMicrodetailProfile === 'analytic-pore-v1' ||
    authoredSkinMicrodetailProfile === 'none'
  ) {
    skinMicrodetailProfile = authoredSkinMicrodetailProfile;
    skinMicrodetailScale =
      skinMicrodetailProfile === 'analytic-pore-v1'
        ? clamp(authoredSkinMicrodetailScale ?? 80, 20, 180)
        : 0;
    skinMicrodetailStrength =
      skinMicrodetailProfile === 'analytic-pore-v1'
        ? clamp(authoredSkinMicrodetailStrength ?? 0.06, 0, 0.2)
        : 0;
    report.mapped.push(
      `@subsurface_scattering(microdetail_profile=${skinMicrodetailProfile},` +
        `microdetail_scale=${skinMicrodetailScale},` +
        `microdetail_strength=${skinMicrodetailStrength})`
    );
  } else if (authoredSkinMicrodetailProfile) {
    report.stubbed.push({
      trait: '@subsurface_scattering(microdetail_profile)',
      reason: `profile '${authoredSkinMicrodetailProfile}' has no native skin material channel`,
    });
  }
  if (nailBedTone !== undefined || nailBedRoughness !== undefined) {
    if (materialCalibrationProfile === 'fixed-light-human-v1') {
      report.mapped.push(
        `@body(nail_bed_tone=${nailBedTone ?? 'profile-default'},` +
          `nail_bed_roughness=${nailBedRoughness ?? 'profile-default'})`
      );
    } else {
      report.stubbed.push({
        trait: '@body(nail_bed_material_controls)',
        reason: 'nail-bed controls require fixed-light-human-v1 material calibration',
      });
      nailBedTone = undefined;
      nailBedRoughness = undefined;
    }
  }
  if (
    !skinMicrodetailProfile &&
    (authoredSkinMicrodetailScale !== undefined || authoredSkinMicrodetailStrength !== undefined)
  ) {
    report.stubbed.push({
      trait: '@subsurface_scattering(microdetail_controls)',
      reason: 'microdetail controls require a supported microdetail_profile',
    });
  }
  const authoredSkinSurfaceResponseProfile = asStr(
    sss?.config.surface_response_profile ?? sss?.config.surfaceResponseProfile
  )
    ?.trim()
    .toLowerCase()
    .replace(/_/g, '-');
  const authoredSkinAlbedoVariationStrength = asNum(
    sss?.config.albedo_variation_strength ?? sss?.config.albedoVariationStrength
  );
  const authoredSkinRoughnessVariationStrength = asNum(
    sss?.config.roughness_variation_strength ?? sss?.config.roughnessVariationStrength
  );
  const authoredSkinNormalMicrodetailStrength = asNum(
    sss?.config.normal_microdetail_strength ?? sss?.config.normalMicrodetailStrength
  );
  if (authoredSkinSurfaceResponseProfile === 'calibrated-skin-surface-v1') {
    if (skinMicrodetailProfile === 'analytic-pore-v1') {
      skinSurfaceResponseProfile = authoredSkinSurfaceResponseProfile;
      skinAlbedoVariationStrength = clamp(
        authoredSkinAlbedoVariationStrength ?? (skinMicrodetailStrength ?? 0.06) * 0.35,
        0,
        0.08
      );
      skinRoughnessVariationStrength = clamp(
        authoredSkinRoughnessVariationStrength ?? skinMicrodetailStrength ?? 0.06,
        0,
        0.2
      );
      skinNormalMicrodetailStrength = clamp(authoredSkinNormalMicrodetailStrength ?? 0.08, 0, 0.35);
      report.mapped.push(
        `@subsurface_scattering(surface_response_profile=${skinSurfaceResponseProfile},` +
          `albedo_variation_strength=${skinAlbedoVariationStrength},` +
          `roughness_variation_strength=${skinRoughnessVariationStrength},` +
          `normal_microdetail_strength=${skinNormalMicrodetailStrength})`
      );
    } else {
      report.stubbed.push({
        trait: '@subsurface_scattering(surface_response_profile)',
        reason: 'calibrated-skin-surface-v1 requires analytic-pore-v1 microdetail',
      });
    }
  } else if (authoredSkinSurfaceResponseProfile) {
    report.stubbed.push({
      trait: '@subsurface_scattering(surface_response_profile)',
      reason: `profile '${authoredSkinSurfaceResponseProfile}' has no native skin-surface response`,
    });
  }
  if (
    !authoredSkinSurfaceResponseProfile &&
    (authoredSkinAlbedoVariationStrength !== undefined ||
      authoredSkinRoughnessVariationStrength !== undefined ||
      authoredSkinNormalMicrodetailStrength !== undefined)
  ) {
    report.stubbed.push({
      trait: '@subsurface_scattering(surface_response_controls)',
      reason: 'decoupled surface controls require calibrated-skin-surface-v1',
    });
  }

  // 6. @hair(color/style) → authored Marschner response plus deterministic card geometry.
  //    Unknown style names are recorded as unsupported rather than borrowing the default.
  let melanin: number | undefined;
  let melaninRedness: number | undefined;
  let hairStyle: AgentAvatarHairStyle | undefined;
  let hairGroomProfile: AgentAvatarGroomProfile | undefined;
  let hairCardWidth: number | undefined;
  let hairRootLift: number | undefined;
  let hairTipTaper: number | undefined;
  let hairlineBias: number | undefined;
  let hairCrownWhorl: number | undefined;
  let hairClusterCount: number | undefined;
  let hairClusterSpread: number | undefined;
  let hairCoverageProfile: HairCoverageProfile | undefined;
  let hairStrandCoverage: number | undefined;
  let hairEdgeSoftness: number | undefined;
  let hairAnisotropyStrength: number | undefined;
  let hairLongitudinalShift: number | undefined;
  let authoredHairStyle: string | undefined;
  let authoredGroomProfile: string | undefined;
  let authoredCoverageProfile: string | undefined;
  let hairColorMapped = false;
  const hair = traits.get('hair');
  if (hair) {
    const hairColor = asStr(cfgVal(hair, 'color', 'base_color'));
    authoredHairStyle = asStr(cfgVal(hair, 'style'));
    authoredGroomProfile = asStr(cfgVal(hair, 'groom_profile', 'groomProfile'));
    authoredCoverageProfile = asStr(cfgVal(hair, 'coverage_profile', 'coverageProfile'));
    if (authoredHairStyle) {
      hairStyle = resolveAgentAvatarHairStyle(authoredHairStyle);
      if (!hairStyle) {
        report.stubbed.push({
          trait: '@hair(style)',
          reason: `style '${authoredHairStyle}' has no native procedural geometry profile`,
        });
      }
    }
    if (authoredGroomProfile) {
      hairGroomProfile = resolveAgentAvatarGroomProfile(authoredGroomProfile);
      if (!hairGroomProfile) {
        report.stubbed.push({
          trait: '@hair(groom_profile)',
          reason: `groom profile '${authoredGroomProfile}' has no native geometry implementation`,
        });
      }
    }
    hairCardWidth = asNum(cfgVal(hair, 'card_width', 'cardWidth'));
    hairRootLift = asNum(cfgVal(hair, 'root_lift', 'rootLift'));
    hairTipTaper = asNum(cfgVal(hair, 'tip_taper', 'tipTaper'));
    hairlineBias = asNum(cfgVal(hair, 'hairline_bias', 'hairlineBias'));
    hairCrownWhorl = asNum(hair.config.crown_whorl ?? hair.config.crownWhorl);
    hairClusterCount = asNum(hair.config.cluster_count ?? hair.config.clusterCount);
    hairClusterSpread = asNum(hair.config.cluster_spread ?? hair.config.clusterSpread);
    if (authoredCoverageProfile) {
      hairCoverageProfile = resolveAgentAvatarHairCoverageProfile(authoredCoverageProfile);
      if (!hairCoverageProfile) {
        report.stubbed.push({
          trait: '@hair(coverage_profile)',
          reason: `coverage profile '${authoredCoverageProfile}' has no native material implementation`,
        });
      }
    }
    hairStrandCoverage = asNum(cfgVal(hair, 'strand_coverage', 'strandCoverage'));
    hairEdgeSoftness = asNum(cfgVal(hair, 'edge_softness', 'edgeSoftness'));
    hairAnisotropyStrength = asNum(cfgVal(hair, 'anisotropy_strength', 'anisotropyStrength'));
    hairLongitudinalShift = asNum(cfgVal(hair, 'longitudinal_shift', 'longitudinalShift'));
    if (hairColor && /^#?[0-9a-fA-F]{6}$/.test(hairColor)) {
      const rgb = parseInt(hairColor.replace('#', ''), 16);
      const r = ((rgb >> 16) & 0xff) / 255;
      const g = ((rgb >> 8) & 0xff) / 255;
      const b = (rgb & 0xff) / 255;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      melanin = clamp(1 - luminance, 0.05, 0.95);
      melaninRedness = clamp((r - b) * 1.5, 0, 1);
      hairColorMapped = true;
    } else if (!authoredHairStyle) {
      report.warnings.push('@hair present: default medium_wavy geometry and material rendered');
    }
  }

  // 7. @clothing → operative sovereign garment geometry/material. The closed hood suppresses
  //    hair/eyes; the open civic style deliberately preserves the authored face and groom.
  let garmentStyle: SovereignGarmentStyle | undefined;
  let garmentColor: number | undefined;
  let includeHair: boolean | undefined;
  let includeEyes: boolean | undefined;
  let mantleStyle: SovereignMantleStyle | undefined;
  let mantleColor: number | undefined;
  let mantle: CharacterHostFromCompositionResult['mantle'];
  const clothing = traits.get('clothing');
  if (clothing) {
    const style = asStr(cfgVal(clothing, 'style', 'type', 'preset'))?.toLowerCase();
    if (
      style === 'stormglass_hooded_tunic' ||
      style === 'stormglass_open_civic_tunic' ||
      style === 'stormglass_tailored_fieldcoat' ||
      style === 'stormglass_structured_fieldcoat' ||
      style === 'stormglass_portrait_fieldcoat'
    ) {
      garmentStyle = style;
      const authoredColor = asRgb(cfgVal(clothing, 'color', 'base_color'));
      if (authoredColor) {
        const [r, g, b] = authoredColor;
        garmentColor =
          (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
      }
      if (garmentStyle === 'stormglass_hooded_tunic') {
        includeHair = false;
        includeEyes = false;
      }
      report.mapped.push(`@clothing(style=${garmentStyle})`);
      const authoredMantle = asStr(cfgVal(clothing, 'mantle_style', 'mantle'))?.toLowerCase();
      if (authoredMantle && isSovereignMantleStyle(authoredMantle)) {
        mantleStyle = authoredMantle;
        const catalogEntry = getSovereignMantleCatalogEntry(mantleStyle);
        const authoredMantleColor = asRgb(cfgVal(clothing, 'mantle_color', 'mantle_base_color'));
        if (authoredMantleColor) {
          const [r, g, b] = authoredMantleColor;
          mantleColor =
            (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
        } else {
          mantleColor = catalogEntry.accentColor;
        }
        mantle = {
          style: mantleStyle,
          detachable: cfgVal(clothing, 'mantle_detachable', 'detachable_mantle') !== false,
          ...((asStr(cfgVal(clothing, 'mantle_albedo_map')) as string | undefined)
            ? { albedoMap: asStr(cfgVal(clothing, 'mantle_albedo_map')) }
            : {}),
          ...((asStr(cfgVal(clothing, 'mantle_normal_map')) as string | undefined)
            ? { normalMap: asStr(cfgVal(clothing, 'mantle_normal_map')) }
            : {}),
          ...((asStr(cfgVal(clothing, 'mantle_roughness_map')) as string | undefined)
            ? { roughnessMap: asStr(cfgVal(clothing, 'mantle_roughness_map')) }
            : {}),
        };
        report.mapped.push(`@clothing(mantle_style=${mantleStyle})`);
      } else if (authoredMantle) {
        report.stubbed.push({
          trait: '@clothing(mantle_style)',
          reason: `mantle '${authoredMantle}' has no sovereign character geometry channel`,
        });
      }
    } else {
      report.stubbed.push({
        trait: '@clothing',
        reason: `style '${style ?? 'unspecified'}' has no sovereign character geometry channel`,
      });
    }
  }

  // A closed hood intentionally emits no hair group, so do not claim hair traits were rendered.
  if (hair) {
    if (includeHair === false) {
      if (hairColorMapped || authoredHairStyle) {
        report.stubbed.push({
          trait: '@hair',
          reason: 'source-authored hair suppressed by closed hood geometry',
        });
      }
    } else {
      if (hairColorMapped) report.mapped.push('@hair(color)');
      if (hairStyle) report.mapped.push(`@hair(style=${hairStyle})`);
      if (hairGroomProfile) {
        report.mapped.push(
          `@hair(groom_profile=${hairGroomProfile},` +
            `card_width=${hairCardWidth ?? 'style-default'},` +
            `root_lift=${hairRootLift ?? 'profile-default'},` +
            `tip_taper=${hairTipTaper ?? 'profile-default'},` +
            `hairline_bias=${hairlineBias ?? 'profile-default'})`
        );
        if (hairCrownWhorl !== undefined) {
          hairCrownWhorl = clamp(hairCrownWhorl, -1, 1);
          report.mapped.push(`@hair(crown_whorl=${hairCrownWhorl})`);
        }
        if (hairClusterCount !== undefined || hairClusterSpread !== undefined) {
          hairClusterCount = Math.max(2, Math.min(64, Math.round(hairClusterCount ?? 8)));
          hairClusterSpread = clamp(hairClusterSpread ?? 0.62, 0.08, 1);
          report.mapped.push(
            `@hair(cluster_count=${hairClusterCount},cluster_spread=${hairClusterSpread})`
          );
        }
      } else if (
        hairCardWidth !== undefined ||
        hairRootLift !== undefined ||
        hairTipTaper !== undefined ||
        hairlineBias !== undefined ||
        hairCrownWhorl !== undefined ||
        hairClusterCount !== undefined ||
        hairClusterSpread !== undefined
      ) {
        report.stubbed.push({
          trait: '@hair(groom_controls)',
          reason: 'groom controls require a supported @hair(groom_profile)',
        });
      }
      if (hairCoverageProfile) {
        report.mapped.push(
          `@hair(coverage_profile=${hairCoverageProfile},` +
            `strand_coverage=${hairStrandCoverage ?? 'profile-default'},` +
            `edge_softness=${hairEdgeSoftness ?? 'profile-default'},` +
            `anisotropy_strength=${hairAnisotropyStrength ?? 'profile-default'},` +
            `longitudinal_shift=${hairLongitudinalShift ?? 'profile-default'})`
        );
      } else if (
        hairStrandCoverage !== undefined ||
        hairEdgeSoftness !== undefined ||
        hairAnisotropyStrength !== undefined ||
        hairLongitudinalShift !== undefined
      ) {
        report.stubbed.push({
          trait: '@hair(material_controls)',
          reason: 'material controls require a supported @hair(coverage_profile)',
        });
      }
    }
  }

  // 8. @cloth_simulation → deterministic fixed-step local-space XPBD.
  let cloth: ClothSimulationConfig | undefined;
  const clothTrait = traits.get('cloth_simulation');
  if (clothTrait) {
    const solver = (asStr(cfgVal(clothTrait, 'solver')) ?? '').toLowerCase();
    if (solver === 'xpbd') {
      cloth = {
        solver: 'xpbd',
        fixedStepHz: Math.max(
          30,
          Math.min(240, Math.round(asNum(cfgVal(clothTrait, 'fixed_step_hz')) ?? 120))
        ),
        iterations: Math.max(
          1,
          Math.min(12, Math.round(asNum(cfgVal(clothTrait, 'iterations')) ?? 4))
        ),
        damping: clamp(asNum(cfgVal(clothTrait, 'damping')) ?? 0.985, 0.8, 1),
        gravity: asVec3(cfgVal(clothTrait, 'gravity')) ?? [0, -0.42, 0],
        wind: asVec3(cfgVal(clothTrait, 'wind')) ?? [0.34, 0.02, 0.2],
        windFrequency: Math.max(0, asNum(cfgVal(clothTrait, 'wind_frequency')) ?? 1.35),
        tetherStiffness: clamp(asNum(cfgVal(clothTrait, 'tether_stiffness')) ?? 8.5, 0, 30),
        constraintStiffness: clamp(asNum(cfgVal(clothTrait, 'constraint_stiffness')) ?? 0.72, 0, 1),
        maxDisplacement: clamp(asNum(cfgVal(clothTrait, 'max_displacement')) ?? 0.2, 0.01, 0.6),
      };
      report.mapped.push('@cloth_simulation(solver=xpbd)');
    } else {
      report.stubbed.push({
        trait: '@cloth_simulation',
        reason: `solver '${solver || 'unspecified'}' unsupported; no dynamics fabricated`,
      });
    }
  }

  // 9. entityId + position.
  const entityId = opts.entityId ?? obj.id ?? obj.name ?? parsed.name ?? 'character';
  const p = obj.position;
  const position: [number, number, number] | undefined = p
    ? [p.x ?? 0, p.y ?? 0, p.z ?? 0]
    : undefined;

  // 10. Construct (undefined fields → CharacterHost uses its skin-tone / hair defaults).
  const host = new CharacterHost({
    entityId,
    heightScale,
    buildScale,
    faceTopology,
    faceRadialSegments,
    faceVerticalSegments,
    faceTearline,
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
    cheekboneScale,
    chinProjection,
    templeWidth,
    expressionNormalPolicy,
    faceWidth,
    faceLength,
    jawTaper,
    shoulderScale,
    torsoScale,
    upperBodyProfile,
    upperBodyRadialSegments,
    leftScapularElevation,
    rightScapularElevation,
    leftScapularProtraction,
    rightScapularProtraction,
    nailTone,
    nailRoughness,
    nailBedTone,
    nailBedRoughness,
    materialCalibrationProfile,
    ocularProfile,
    irisScale,
    pupilScale,
    irisColor,
    scleraColor,
    corneaIor,
    skinTone: color,
    skinScatterColor,
    skinMicrodetailProfile,
    skinMicrodetailScale,
    skinMicrodetailStrength,
    skinSurfaceResponseProfile,
    skinAlbedoVariationStrength,
    skinRoughnessVariationStrength,
    skinNormalMicrodetailStrength,
    melanin,
    melaninRedness,
    hairStyle,
    hairGuides: lod?.hairGuides,
    hairCardsPerGuide: lod?.hairCardsPerGuide,
    hairSegments: lod?.hairSegments,
    hairGroomProfile,
    hairCardWidth: hairGroomProfile ? hairCardWidth : undefined,
    hairRootLift: hairGroomProfile ? hairRootLift : undefined,
    hairTipTaper: hairGroomProfile ? hairTipTaper : undefined,
    hairlineBias: hairGroomProfile ? hairlineBias : undefined,
    hairCrownWhorl: hairGroomProfile ? hairCrownWhorl : undefined,
    hairClusterCount: hairGroomProfile ? hairClusterCount : undefined,
    hairClusterSpread: hairGroomProfile ? hairClusterSpread : undefined,
    hairCoverageProfile,
    hairStrandCoverage: hairCoverageProfile ? hairStrandCoverage : undefined,
    hairEdgeSoftness: hairCoverageProfile ? hairEdgeSoftness : undefined,
    hairAnisotropyStrength: hairCoverageProfile ? hairAnisotropyStrength : undefined,
    hairLongitudinalShift: hairCoverageProfile ? hairLongitudinalShift : undefined,
    position,
    garmentStyle,
    garmentColor,
    garmentSegments: lod?.garmentSegments,
    mantleStyle,
    mantleColor,
    clothSimulation: cloth,
    includeHair,
    includeEyes,
  });

  // 11. @pose → validated source-authored local-bone quaternions on the operative host.
  const poseTrait = traits.get('pose');
  const poseMapping = poseTrait ? authoredSourcePose(poseTrait, report) : undefined;
  if (poseMapping) host.setPose(poseMapping.pose);

  // 12. @morph/@expression → one absolute native FACS/viseme deformation state.
  let morph: NativeMorphReceipt | undefined;
  let expression: NativeMorphReceipt | undefined;
  const morphTrait = traits.get('morph');
  const expressionTrait = traits.get('expression');
  const morphWeights = morphTrait ? authoredMorphWeights(morphTrait) : {};
  const expressionWeights = expressionTrait ? authoredExpressionWeights(expressionTrait) : {};
  const weights = { ...morphWeights, ...expressionWeights };
  if (morphTrait && Object.keys(morphWeights).length === 0) {
    report.stubbed.push({
      trait: '@morph',
      reason: 'no initial targets authored; runtime channel is available via applyMorphWeights',
    });
  }
  if (expressionTrait && Object.keys(expressionWeights).length === 0) {
    report.stubbed.push({
      trait: '@expression',
      reason: 'no supported first-class expression controls were authored',
    });
  }
  if (Object.keys(weights).length > 0) {
    const receipt = host.applyMorphWeights(weights);
    if (receipt.appliedTargets.length > 0) {
      morph = receipt;
      if (morphTrait && Object.keys(morphWeights).length > 0) {
        report.mapped.push(
          `@morph(targets=${receipt.appliedTargets.map(({ target }) => target).join(',')})`
        );
      }
      if (expressionTrait && Object.keys(expressionWeights).length > 0) {
        expression = receipt;
        report.mapped.push(
          `@expression(targets=${receipt.appliedTargets.map(({ target }) => target).join(',')})`
        );
      }
    }
    for (const target of receipt.ignoredTargets) {
      const sourceTrait = expressionWeights[target] !== undefined ? '@expression' : '@morph';
      report.stubbed.push({
        trait: `${sourceTrait}(target=${target})`,
        reason: 'target has no native procedural-head deformation channel',
      });
    }
    if (receipt.appliedTargets.length === 0) {
      report.stubbed.push({
        trait: expressionTrait ? '@expression' : '@morph',
        reason: 'none of the authored targets have native procedural-head channels',
      });
    }
  }

  // 12. @locomotion → gait descriptor (caller drives the per-frame clock).
  let gait: { mode: GaitMode; speed: number } | undefined;
  const loco = traits.get('locomotion');
  if (loco) {
    const rawMode = (asStr(cfgVal(loco, 'mode', 'default_mode')) ?? 'walk').toLowerCase();
    const speed = asNum(cfgVal(loco, 'speed', 'smooth_speed', 'walk_speed', 'move_speed')) ?? 1.4;
    const mapped = GAIT_FROM_MODE[rawMode];
    if (mapped) {
      gait = { mode: mapped, speed };
      report.mapped.push('@locomotion');
      if (rawMode === 'glide' || rawMode === 'smooth') {
        report.warnings.push(`locomotion '${rawMode}' rendered as 'walk' gait`);
      }
    } else {
      gait = { mode: 'idle', speed };
      report.stubbed.push({
        trait: '@locomotion',
        reason: `mode '${rawMode}' has no skinned gait (only idle/walk/run); rendered idle`,
      });
    }
  }

  // 13. @skeleton(rig) → validated against the one rig the host renders. A matching rig is
  //    operative-by-agreement (the authored rig IS what renders); a mismatch is reported, never
  //    silently mis-rendered.
  const skel = traits.get('skeleton');
  if (skel) {
    const rig = asStr(cfgVal(skel, 'rig', 'template'));
    if (!rig || rig.toLowerCase() === SUPPORTED_RIG) {
      report.mapped.push(`@skeleton(rig=${rig ?? SUPPORTED_RIG})`);
    } else {
      report.stubbed.push({
        trait: '@skeleton',
        reason: `rig '${rig}' unsupported; rendering ${SUPPORTED_RIG}`,
      });
    }
  }

  let environmentLight: CharacterHostFromCompositionResult['environmentLight'];
  const environmentTrait = traits.get('environment_light');
  if (environmentTrait) {
    const profile = (asStr(cfgVal(environmentTrait, 'profile')) ?? 'analytic-three-point-v1')
      .toLowerCase()
      .replace(/_/g, '-') as CharacterEnvironmentLightOptions['profile'];
    if (
      profile === 'analytic-three-point-v1' ||
      profile === 'legacy-key-v1' ||
      profile === 'directional-reflection-probe-v1' ||
      profile === 'stormglass-room-basis-v2'
    ) {
      const options: CharacterEnvironmentLightOptions = {
        profile,
        keyDirection: asVec3(cfgVal(environmentTrait, 'key_direction')),
        keyColor: asRgb(cfgVal(environmentTrait, 'key_color')),
        keyIntensity: asNum(cfgVal(environmentTrait, 'key_intensity')),
        fillDirection: asVec3(cfgVal(environmentTrait, 'fill_direction')),
        fillColor: asRgb(cfgVal(environmentTrait, 'fill_color')),
        fillIntensity: asNum(cfgVal(environmentTrait, 'fill_intensity')),
        rimDirection: asVec3(cfgVal(environmentTrait, 'rim_direction')),
        rimColor: asRgb(cfgVal(environmentTrait, 'rim_color')),
        rimIntensity: asNum(cfgVal(environmentTrait, 'rim_intensity')),
        exposure: asNum(cfgVal(environmentTrait, 'exposure')),
      };
      environmentLight = {
        options,
        receipt: deriveCharacterEnvironmentLightReceipt(options),
      };
      report.mapped.push(`@environment_light(profile=${profile})`);
    } else {
      report.stubbed.push({
        trait: '@environment_light',
        reason: `profile '${profile}' has no native environment renderer binding`,
      });
    }
  }

  const groom =
    hair && includeHair !== false ? (host.getGroomGeometryReceipt() ?? undefined) : undefined;
  const anatomy = anatomyAuthored ? host.getAnatomyReceipt() : undefined;
  const jointDeformation = host.getJointDeformationReceipt() ?? undefined;
  const handSurface = host.getHandSurfaceReceipt() ?? undefined;
  const skin = skinMicrodetailProfile ? host.getSkinMaterialReceipt() : undefined;
  const facialLandmarks = facialDetailProfile
    ? (host.getFacialLandmarkReceipt() ?? undefined)
    : undefined;
  const garment = garmentStyle ? (host.getGarmentGeometryReceipt() ?? undefined) : undefined;
  const ocular = ocularProfile ? (host.getOcularGeometryReceipt() ?? undefined) : undefined;
  return {
    ok: true,
    host,
    gait,
    materialColor: color,
    lod,
    cloth,
    face,
    anatomy,
    skin,
    facialLandmarks,
    garment,
    ocular,
    groom,
    morph,
    expression,
    environmentLight,
    pose: poseMapping?.receipt,
    jointDeformation,
    handSurface,
    mantle,
    report,
  };
}
