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
  type AvatarPose,
} from './AgentAvatarMesh';
import {
  buildCharacterMesh,
  type AgentAvatarHairStyle,
  type CharacterMeshData,
} from './AgentAvatarHair';
import {
  applyNativeFacialMorph,
  type NativeMorphReceipt,
  type NativeMorphWeights,
} from './AgentAvatarMorph';
import type { SovereignGarmentStyle, SovereignMantleStyle } from './AgentAvatarGarment';
import {
  DeterministicClothSimulation,
  type ClothSimulationConfig,
  type ClothSimulationReceipt,
} from './AgentAvatarCloth';
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
  /** Packed 0xRRGGBB accent/fallback colour; defaults to a deterministic colour from `entityId`. */
  color?: number;
  /** Skin base colour 0xRRGGBB for the SSS material (default warm skin #e8c4a0). */
  skinTone?: number;
  /**
   * Authored subsurface scatter colour in linear RGB. Omitted characters retain the
   * human-skin preset; non-human/sovereign bodies can provide their own material response.
   */
  skinScatterColor?: [number, number, number];
  /** Hair eumelanin 0..1 (0 = white/blond, ~0.9 = black). Default 0.7 (dark brown). */
  melanin?: number;
  /** Hair pheomelanin/redness 0..1. Default 0.2. */
  melaninRedness?: number;
  /** Source-authored deterministic procedural hair geometry profile. */
  hairStyle?: AgentAvatarHairStyle;
  /** Source-authored scalp guide budget selected by @lod. */
  hairGuides?: number;
  /** Source-authored cards-per-guide budget selected by @lod. */
  hairCardsPerGuide?: number;
  /** Source-authored points-per-guide budget selected by @lod. */
  hairSegments?: number;
  /** Iris colour 0xRRGGBB (default warm brown #4a3520). */
  irisColor?: number;
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
};

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
};

/** Refractive eye preset; iris colour set per-host. */
const EYE_BASE: Omit<RefractiveEyeMaterialSpec, 'color'> = {
  shadingModel: 'refractive-eye',
  metalness: 0,
  roughness: 0.05,
  emissive: 0,
  opacity: 1,
  ior: 1.376,
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
  private readonly bindWorld: Map<string, Mat4>;
  private readonly inverseBind: Map<string, Mat4>;
  private readonly material: MaterialSpec;
  private readonly skinMaterial: SkinSSSMaterialSpec;
  private readonly hairMaterial: MarschnerHairMaterialSpec;
  private readonly eyeMaterial: RefractiveEyeMaterialSpec;
  private readonly garmentMaterial: WovenClothMaterialSpec;
  private readonly mantleMaterial: WovenClothMaterialSpec;
  private readonly visorMaterial: BaseMaterialSpec;
  private readonly clothSimulation: DeterministicClothSimulation | null;
  private lastClothReceipt: ClothSimulationReceipt | null = null;
  private deformationBasePositions: Float32Array<ArrayBuffer>;
  private morphWeights: NativeMorphWeights = {};
  private lastMorphReceipt: NativeMorphReceipt | null = null;
  private modelMatrix: Mat4;
  private pose: Map<string, Quat> = new Map();
  // D.102 portable mind (opt-in via bindMind; body renders identically with or without it).
  private mind: CharacterMind | null = null;
  private boundIdentity: MindIdentity | null = null;
  private memory: MindMemoryEntry[] = [];

  constructor(opts: CharacterHostOptions) {
    this.entityId = opts.entityId;
    this.built = buildCharacterMesh({
      entityId: opts.entityId,
      heightScale: opts.heightScale,
      buildScale: opts.buildScale,
      garmentStyle: opts.garmentStyle,
      garmentSegments: opts.garmentSegments,
      mantleStyle: opts.mantleStyle,
      includeHair: opts.includeHair,
      includeEyes: opts.includeEyes,
      style: opts.hairStyle,
      guides: opts.hairGuides,
      cardsPerGuide: opts.hairCardsPerGuide,
      segments: opts.hairSegments,
    });
    this.deformationBasePositions = new Float32Array(this.built.mesh.positions);
    this.bindWorld = computeBindWorld();
    this.inverseBind = computeInverseBind(this.bindWorld);
    const skinTone = opts.skinTone ?? 0xe8c4a0;
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
      ...HUMAN_SKIN,
      color: skinTone,
      ...(opts.skinScatterColor
        ? { scatterColor: [...opts.skinScatterColor] as [number, number, number] }
        : {}),
    };
    this.hairMaterial = {
      ...HAIR_BASE,
      melanin: opts.melanin ?? 0.7,
      melaninRedness: opts.melaninRedness ?? 0.2,
    };
    this.eyeMaterial = { ...EYE_BASE, color: opts.irisColor ?? 0x4a3520 };
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
    if (Object.keys(this.morphWeights).length > 0) {
      this.applyMorphWeights(this.morphWeights);
    } else {
      this.built.mesh.positions = new Float32Array(this.deformationBasePositions);
    }
    this.lastClothReceipt = sampled.receipt;
    return { ...sampled.receipt };
  }

  /** Latest deterministic cloth receipt, or null when the source did not author cloth dynamics. */
  getClothSimulationReceipt(): ClothSimulationReceipt | null {
    return this.lastClothReceipt ? { ...this.lastClothReceipt } : null;
  }

  /**
   * Apply the native procedural-head FACS/viseme subset to real mesh vertices.
   *
   * Every call starts from the current neutral/cloth deformation base, so weights are absolute
   * rather than cumulatively drifting. Unsupported names are preserved in the returned receipt.
   */
  applyMorphWeights(weights: NativeMorphWeights): NativeMorphReceipt {
    this.morphWeights = { ...weights };
    const morphed = applyNativeFacialMorph(
      this.deformationBasePositions,
      this.built.mesh.jointIndices,
      {
        bodyVertexRange: this.built.bodyVertexRange,
        eyeVertexRange: this.built.eyeVertexRange,
      },
      this.morphWeights
    );
    this.built.mesh.positions = morphed.positions;
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
   * The body renders as a single SSS-skin material group; `material` remains the lambert
   * fallback for callers that render without material groups.
   */
  getDrawSpec(): CharacterDrawSpec {
    const groups: MaterialGroup[] = [
      { ...this.built.bodyRange, material: this.skinMaterial },
      { ...this.built.hairRange, material: this.hairMaterial },
      { ...this.built.eyeRange, material: this.eyeMaterial },
      { ...this.built.garmentRange, material: this.garmentMaterial },
      { ...this.built.visorRange, material: this.visorMaterial },
      { ...this.built.mantleRange, material: this.mantleMaterial },
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
