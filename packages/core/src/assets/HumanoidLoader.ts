/**
 * @holoscript/core Humanoid Avatar Loader
 *
 * Unified loader for humanoid avatars supporting Ready Player Me and VRM formats.
 * Integrates with HoloScript's humanoid traits (skeleton, face, expressive, etc.)
 *
 * @version 1.0.0
 * @see https://github.com/pixiv/three-vrm
 * @see https://docs.readyplayer.me/
 */

import type { SmartAssetLoader, LoadResult } from './SmartAssetLoader';
import type { AssetMetadata } from './AssetMetadata';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Avatar format types
 */
export type AvatarFormat = 'vrm' | 'vrm0' | 'vrm1' | 'rpm' | 'gltf' | 'glb';

/**
 * Standard VRM bone names (VRM 1.0 specification)
 */
export type VRMBoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'leftFoot'
  | 'leftToes'
  | 'rightUpperLeg'
  | 'rightLowerLeg'
  | 'rightFoot'
  | 'rightToes'
  | 'leftThumbMetacarpal'
  | 'leftThumbProximal'
  | 'leftThumbDistal'
  | 'leftIndexProximal'
  | 'leftIndexIntermediate'
  | 'leftIndexDistal'
  | 'leftMiddleProximal'
  | 'leftMiddleIntermediate'
  | 'leftMiddleDistal'
  | 'leftRingProximal'
  | 'leftRingIntermediate'
  | 'leftRingDistal'
  | 'leftLittleProximal'
  | 'leftLittleIntermediate'
  | 'leftLittleDistal'
  | 'rightThumbMetacarpal'
  | 'rightThumbProximal'
  | 'rightThumbDistal'
  | 'rightIndexProximal'
  | 'rightIndexIntermediate'
  | 'rightIndexDistal'
  | 'rightMiddleProximal'
  | 'rightMiddleIntermediate'
  | 'rightMiddleDistal'
  | 'rightRingProximal'
  | 'rightRingIntermediate'
  | 'rightRingDistal'
  | 'rightLittleProximal'
  | 'rightLittleIntermediate'
  | 'rightLittleDistal'
  | 'leftEye'
  | 'rightEye'
  | 'jaw';

/**
 * Standard VRM expression names (VRM 1.0)
 */
export type VRMExpressionName =
  | 'happy'
  | 'angry'
  | 'sad'
  | 'relaxed'
  | 'surprised'
  | 'aa'
  | 'ih'
  | 'ou'
  | 'ee'
  | 'oh'
  | 'blink'
  | 'blinkLeft'
  | 'blinkRight'
  | 'lookUp'
  | 'lookDown'
  | 'lookLeft'
  | 'lookRight'
  | 'neutral';

/**
 * Vector3 type
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Quaternion type
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Transform type
 */
export interface Transform {
  position: Vector3;
  rotation: Quaternion;
  scale?: Vector3;
}

/**
 * Bone transform data
 */
export interface BoneTransform {
  name: VRMBoneName | string;
  position: Vector3;
  rotation: Quaternion;
}

/**
 * Skeleton pose data
 */
export interface SkeletonPose {
  timestamp: number;
  rootTransform: Transform;
  bones: BoneTransform[];
}

/**
 * VRM metadata (from VRM extension)
 */
export interface VRMMetadata {
  name?: string;
  version?: string;
  authors?: string[];
  copyrightInformation?: string;
  contactInformation?: string;
  references?: string[];
  thirdPartyLicenses?: string;
  thumbnailImage?: string;
  licenseUrl?: string;
  avatarPermission?: 'onlyAuthor' | 'onlySeparatelyLicensedPerson' | 'everyone';
  allowExcessivelyViolentUsage?: boolean;
  allowExcessivelySexualUsage?: boolean;
  commercialUsage?: 'personalNonProfit' | 'personalProfit' | 'corporation';
  allowPoliticalOrReligiousUsage?: boolean;
  allowAntisocialOrHateUsage?: boolean;
  creditNotation?: 'required' | 'unnecessary';
  allowRedistribution?: boolean;
  modification?: 'prohibited' | 'allowModification' | 'allowModificationRedistribution';
  otherLicenseUrl?: string;
}

/**
 * Ready Player Me metadata
 */
export interface RPMMetadata {
  avatarId?: string;
  bodyType?: 'fullbody' | 'halfbody';
  gender?: 'male' | 'female' | 'neutral';
  outfitGender?: 'male' | 'female' | 'neutral';
}

/**
 * Humanoid avatar configuration
 */
export interface HumanoidConfig {
  /** Avatar URL (VRM, GLB, or Ready Player Me) */
  url: string;

  /** Avatar format (auto-detected if not specified) */
  format?: AvatarFormat;

  /** Initial scale */
  scale?: number;

  /** Enable IK retargeting */
  enableIK?: boolean;

  /** Enable expression/morph blending */
  enableExpressions?: boolean;

  /** Enable look-at tracking */
  enableLookAt?: boolean;

  /** Enable spring bones (hair, clothes physics) */
  enableSpringBones?: boolean;

  /** Enable MToon materials (for VRM) */
  enableMToon?: boolean;

  /** Custom bone mapping overrides */
  boneMapping?: Partial<Record<VRMBoneName, string>>;

  /** Custom expression mapping overrides */
  expressionMapping?: Partial<Record<VRMExpressionName, string>>;

  /** Ready Player Me specific options */
  rpm?: {
    /** Quality preset */
    quality?: 'low' | 'medium' | 'high';
    /** Include morph targets */
    morphTargets?: string;
    /** Texture atlas size */
    textureAtlas?: number;
    /** Use Draco compression */
    useDraco?: boolean;
    /** LOD level (0-2) */
    lod?: number;
  };
}

/**
 * Loaded humanoid avatar state
 */
export interface HumanoidState {
  /** Avatar ID */
  id: string;

  /** Avatar format */
  format: AvatarFormat;

  /** VRM metadata (if VRM) */
  vrmMetadata?: VRMMetadata;

  /** RPM metadata (if Ready Player Me) */
  rpmMetadata?: RPMMetadata;

  /** Current transform */
  transform: Transform;

  /** Current pose */
  pose?: SkeletonPose;

  /** Active expression */
  expression?: VRMExpressionName | string;

  /** Expression weight */
  expressionWeight?: number;

  /** Look-at target */
  lookAtTarget?: Vector3;

  /** Is visible */
  visible: boolean;

  /** Available bone names */
  availableBones: string[];

  /** Available expression names */
  availableExpressions: string[];

  /** Has spring bones */
  hasSpringBones: boolean;

  /** Is loaded */
  isLoaded: boolean;

  /** Load error */
  error?: string;
}

/**
 * Humanoid load result
 */
export interface HumanoidLoadResult<T = unknown> extends LoadResult<T> {
  /** Humanoid state */
  humanoidState: HumanoidState;

  /** VRM instance (if using @pixiv/three-vrm) */
  vrm?: unknown;

  /** Animation mixer (if animations present) */
  mixer?: unknown;

  /** Available animations */
  animations: string[];
}

/**
 * Humanoid loader events
 */
export type HumanoidLoaderEvent =
  | 'load-start'
  | 'load-progress'
  | 'load-complete'
  | 'load-error'
  | 'expression-change'
  | 'pose-update'
  | 'look-at-change';

/**
 * Humanoid event callback
 */
export type HumanoidEventCallback = (event: {
  type: HumanoidLoaderEvent;
  avatarId: string;
  data?: unknown;
}) => void;

// ============================================================================
// MINIMAL THREE.JS INTERFACES (avoids importing full @types/three)
// ============================================================================

/** Minimal GLTF loader interface */
interface GLTFLoaderLike {
  register: (pluginFactory: (parser: unknown) => unknown) => void;
  setDRACOLoader: (loader: unknown) => void;
  load: (
    url: string,
    onLoad: (gltf: GLTFLoadResult) => void,
    onProgress: (progress: { loaded: number; total: number }) => void,
    onError: (error: { message?: string }) => void
  ) => void;
}

/** Minimal GLTF load result */
interface GLTFLoadResult {
  scene: ThreeSceneObject;
  animations: Array<{ name: string }>;
  userData?: { vrm?: VRMInstanceData };
}

/** Minimal Three.js scene for traversal */
interface ThreeSceneObject {
  traverse?: (callback: (obj: ThreeTraversableObject) => void) => void;
}

/** Minimal Three.js object for bone/morph extraction */
interface ThreeTraversableObject {
  isBone?: boolean;
  name: string;
  morphTargetDictionary?: Record<string, number>;
}

/** Minimal VRM instance data */
interface VRMInstanceData {
  meta?: Partial<VRMMetadata>;
  humanoid?: { humanBones?: Record<string, unknown> };
  expressionManager?: { expressionMap?: Map<string, unknown> };
  springBoneManager?: unknown;
}

// ============================================================================
// HUMANOID LOADER
// ============================================================================

/**
 * Humanoid Avatar Loader
 *
 * Provides unified loading for VRM and Ready Player Me avatars with
 * full integration into HoloScript's humanoid trait system.
 */
export class HumanoidLoader {
  private avatars: Map<string, HumanoidState> = new Map();
  private eventListeners: Map<HumanoidLoaderEvent, HumanoidEventCallback[]> = new Map();
  private assetLoader: SmartAssetLoader | null = null;
  private vrmLoaderPlugin: unknown = null;
  private gltfLoader: unknown = null;

  /**
   * Cached Ready Player Me configuration for URL building
   */
  private static readonly RPM_BASE_URL = 'https://models.readyplayer.me/';
  private static readonly RPM_RENDER_URL = 'https://render.readyplayer.me/render';

  constructor(assetLoader?: SmartAssetLoader) {
    this.assetLoader = assetLoader ?? null;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the loader with Three.js dependencies
   * Call this after Three.js and loaders are available
   */
  async initialize(_three?: unknown): Promise<void> {
    // Dynamic import pattern for Three.js loaders
    // This allows the loader to work without Three.js being bundled
    try {
      // Dynamic import pattern for Three.js GLTFLoader
      // @ts-ignore - three.js is an optional peer dependency
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      this.gltfLoader = new GLTFLoader();

      // Try to import VRM loader plugin
      try {
        // @ts-ignore - VRM plugin is optional
        const { VRMLoaderPlugin } = await import('@pixiv/three-vrm');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.gltfLoader as GLTFLoaderLike).register(
          (parser: unknown) => new VRMLoaderPlugin(parser as any)
        );
        this.vrmLoaderPlugin = VRMLoaderPlugin;
        console.log('[HumanoidLoader] VRM support enabled');
      } catch {
        console.warn('[HumanoidLoader] VRM plugin not available, VRM-specific features disabled');
      }

      // Try to add Draco support
      try {
        // @ts-ignore - Draco loader is optional
        const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        (this.gltfLoader as GLTFLoaderLike).setDRACOLoader(dracoLoader);
        console.log('[HumanoidLoader] Draco compression support enabled');
      } catch {
        console.warn('[HumanoidLoader] Draco loader not available');
      }

      console.log('[HumanoidLoader] Initialized successfully');
    } catch (error) {
      console.error('[HumanoidLoader] Failed to initialize:', error);
      throw new Error('HumanoidLoader initialization failed. Ensure Three.js is available.');
    }
  }

  // ============================================================================
  // AVATAR LOADING
  // ============================================================================

  /**
   * Load a humanoid avatar from URL
   */
  async loadAvatar(id: string, config: HumanoidConfig): Promise<HumanoidLoadResult> {
    // Check if already loaded
    if (this.avatars.has(id)) {
      throw new Error(`Avatar ${id} already exists. Call removeAvatar first.`);
    }

    // Emit load start
    this.emit('load-start', id);

    // Detect format
    const format = config.format ?? this.detectFormat(config.url);

    // Build final URL
    const url = this.buildAvatarUrl(config.url, format, config);

    // Create initial state
    const state: HumanoidState = {
      id,
      format,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: config.scale ?? 1, y: config.scale ?? 1, z: config.scale ?? 1 },
      },
      visible: true,
      availableBones: [],
      availableExpressions: [],
      hasSpringBones: false,
      isLoaded: false,
    };

    try {
      // Load the model
      const result = await this.loadGLTF(url, state, config);

      // Store state
      this.avatars.set(id, state);

      // Emit complete
      this.emit('load-complete', id, { state, result });

      return result;
    } catch (error) {
      state.isLoaded = false;
      state.error = error instanceof Error ? error.message : String(error);

      // Emit error
      this.emit('load-error', id, { error: state.error });

      throw error;
    }
  }

  /**
   * Load GLTF/VRM model
   */
  private async loadGLTF(
    url: string,
    state: HumanoidState,
    config: HumanoidConfig
  ): Promise<HumanoidLoadResult> {
    if (!this.gltfLoader) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      (this.gltfLoader as GLTFLoaderLike).load(
        url,
        (gltf: GLTFLoadResult) => {
          try {
            const result = this.processLoadedModel(gltf, state, config);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        (progress: { loaded: number; total: number }) => {
          // Emit progress
          const percent = progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0;
          this.emit('load-progress', state.id, {
            loaded: progress.loaded,
            total: progress.total,
            percent,
          });
        },
        (error: { message?: string }) => {
          reject(new Error(`Failed to load avatar: ${error.message ?? error}`));
        }
      );
    });
  }

  /**
   * Process loaded model and extract humanoid data
   */
  private processLoadedModel(
    gltf: GLTFLoadResult,
    state: HumanoidState,
    config: HumanoidConfig
  ): HumanoidLoadResult {
    const vrm = gltf.userData?.vrm;
    const scene = gltf.scene;
    const animations = gltf.animations ?? [];

    // Extract VRM data if present
    if (vrm) {
      state.vrmMetadata = this.extractVRMMetadata(vrm);
      state.availableBones = this.extractVRMBones(vrm);
      state.availableExpressions = this.extractVRMExpressions(vrm);
      state.hasSpringBones = !!vrm.springBoneManager;
    } else {
      // Standard GLTF/GLB - extract skeleton from scene
      state.availableBones = this.extractGLTFBones(scene);
      state.availableExpressions = this.extractGLTFMorphTargets(scene);
    }

    // Check for RPM metadata
    if (config.url.includes('readyplayer.me') || config.url.includes('rpm')) {
      state.rpmMetadata = this.extractRPMMetadata(config, gltf);
    }

    state.isLoaded = true;

    // Create animation mixer if animations exist
    let mixer: unknown = undefined;
    if (animations.length > 0) {
      try {
        // Dynamic import THREE for AnimationMixer
        const threeLib = (globalThis as unknown as Record<string, unknown>).THREE as
          | { AnimationMixer?: new (root: unknown) => unknown }
          | undefined;
        if (threeLib?.AnimationMixer) {
          mixer = new threeLib.AnimationMixer(scene);
        }
      } catch {
        console.warn('[HumanoidLoader] Could not create animation mixer');
      }
    }

    // Build result
    const result: HumanoidLoadResult = {
      assetId: state.id,
      metadata: {
        id: state.id,
        assetType: 'model',
        format: state.format,
        sourcePath: config.url,
        fileSize: 0,
        mimeType: 'model/gltf-binary',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        estimatedGPUMemory: 0,
        estimatedCPUMemory: 0,
      } as unknown as AssetMetadata,
      data: scene,
      lodLevel: 0,
      quality: 'high',
      loadTime: 0,
      fromCache: false,
      url: config.url,
      humanoidState: state,
      vrm: vrm,
      mixer: mixer,
      animations: animations.map((a) => a.name),
    };

    return result;
  }

  // ============================================================================
  // AVATAR CONTROL
  // ============================================================================

  /**
   * Set avatar transform
   */
  setTransform(id: string, transform: Partial<Transform>): void {
    const state = this.avatars.get(id);
    if (!state) return;

    if (transform.position) {
      state.transform.position = transform.position;
    }
    if (transform.rotation) {
      state.transform.rotation = transform.rotation;
    }
    if (transform.scale) {
      state.transform.scale = transform.scale;
    }
  }

  /**
   * Apply skeleton pose
   */
  applyPose(id: string, pose: SkeletonPose): void {
    const state = this.avatars.get(id);
    if (!state) return;

    state.pose = pose;
    this.emit('pose-update', id, { pose });
  }

  /**
   * Set expression
   */
  setExpression(id: string, expression: VRMExpressionName | string, weight: number = 1): void {
    const state = this.avatars.get(id);
    if (!state) return;

    state.expression = expression;
    state.expressionWeight = Math.max(0, Math.min(1, weight));
    this.emit('expression-change', id, { expression, weight });
  }

  /**
   * Set look-at target
   */
  setLookAt(id: string, target: Vector3): void {
    const state = this.avatars.get(id);
    if (!state) return;

    state.lookAtTarget = target;
    this.emit('look-at-change', id, { target });
  }

  /**
   * Set visibility
   */
  setVisible(id: string, visible: boolean): void {
    const state = this.avatars.get(id);
    if (state) {
      state.visible = visible;
    }
  }

  /**
   * Get avatar state
   */
  getState(id: string): HumanoidState | undefined {
    return this.avatars.get(id);
  }

  /**
   * Get all avatar IDs
   */
  getAvatarIds(): string[] {
    return Array.from(this.avatars.keys());
  }

  /**
   * Remove avatar
   */
  removeAvatar(id: string): void {
    this.avatars.delete(id);
  }

  // ============================================================================
  // URL BUILDING
  // ============================================================================

  /**
   * Detect avatar format from URL
   */
  private detectFormat(url: string): AvatarFormat {
    const lower = url.toLowerCase();

    if (lower.endsWith('.vrm')) {
      return 'vrm';
    }
    if (lower.includes('readyplayer.me') || lower.includes('rpm')) {
      return 'rpm';
    }
    if (lower.endsWith('.glb')) {
      return 'glb';
    }
    if (lower.endsWith('.gltf')) {
      return 'gltf';
    }

    // Default to GLB
    return 'glb';
  }

  /**
   * Build avatar URL with appropriate parameters
   */
  private buildAvatarUrl(url: string, format: AvatarFormat, config: HumanoidConfig): string {
    // If it's a Ready Player Me avatar ID
    if (format === 'rpm' && !url.startsWith('http')) {
      return this.buildRPMUrl(url, config);
    }

    // If it's a Ready Player Me URL but needs parameters
    if (format === 'rpm' && url.includes('readyplayer.me')) {
      return this.appendRPMParameters(url, config);
    }

    return url;
  }

  /**
   * Build Ready Player Me URL from avatar ID
   */
  private buildRPMUrl(avatarId: string, config: HumanoidConfig): string {
    const url = `${HumanoidLoader.RPM_BASE_URL}${avatarId}.glb`;
    return this.appendRPMParameters(url, config);
  }

  /**
   * Append Ready Player Me query parameters
   */
  private appendRPMParameters(url: string, config: HumanoidConfig): string {
    const params = new URLSearchParams();

    if (config.rpm?.quality) {
      params.append('quality', config.rpm.quality);
    }
    if (config.rpm?.morphTargets) {
      params.append('morphTargets', config.rpm.morphTargets);
    }
    if (config.rpm?.textureAtlas) {
      params.append('textureAtlas', String(config.rpm.textureAtlas));
    }
    if (config.rpm?.useDraco !== false) {
      params.append('useDraco', 'true');
    }
    if (config.rpm?.lod !== undefined) {
      params.append('lod', String(config.rpm.lod));
    }

    // Default morph targets for expressions
    if (!config.rpm?.morphTargets) {
      params.append('morphTargets', 'ARKit,Oculus Visemes');
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${params.toString()}`;
  }

  // ============================================================================
  // METADATA EXTRACTION
  // ============================================================================

  /**
   * Extract VRM metadata
   */
  private extractVRMMetadata(vrm: VRMInstanceData): VRMMetadata {
    const meta = vrm.meta;
    if (!meta) return {};

    return {
      name: meta.name,
      version: meta.version,
      authors: meta.authors,
      copyrightInformation: meta.copyrightInformation,
      contactInformation: meta.contactInformation,
      references: meta.references,
      thirdPartyLicenses: meta.thirdPartyLicenses,
      thumbnailImage: meta.thumbnailImage,
      licenseUrl: meta.licenseUrl,
      avatarPermission: meta.avatarPermission,
      allowExcessivelyViolentUsage: meta.allowExcessivelyViolentUsage,
      allowExcessivelySexualUsage: meta.allowExcessivelySexualUsage,
      commercialUsage: meta.commercialUsage,
      allowPoliticalOrReligiousUsage: meta.allowPoliticalOrReligiousUsage,
      allowAntisocialOrHateUsage: meta.allowAntisocialOrHateUsage,
      creditNotation: meta.creditNotation,
      allowRedistribution: meta.allowRedistribution,
      modification: meta.modification,
      otherLicenseUrl: meta.otherLicenseUrl,
    };
  }

  /**
   * Extract VRM bone names
   */
  private extractVRMBones(vrm: VRMInstanceData): string[] {
    const humanoid = vrm.humanoid;
    if (!humanoid) return [];

    const bones: string[] = [];
    const humanBones = humanoid.humanBones;

    if (humanBones) {
      for (const boneName of Object.keys(humanBones)) {
        bones.push(boneName);
      }
    }

    return bones;
  }

  /**
   * Extract VRM expression names
   */
  private extractVRMExpressions(vrm: VRMInstanceData): string[] {
    const expressionManager = vrm.expressionManager;
    if (!expressionManager) return [];

    return expressionManager.expressionMap
      ? Array.from(expressionManager.expressionMap.keys())
      : [];
  }

  /**
   * Extract GLTF skeleton bones
   */
  private extractGLTFBones(scene: ThreeSceneObject): string[] {
    const bones: string[] = [];

    scene.traverse?.((obj: ThreeTraversableObject) => {
      if (obj.isBone) {
        bones.push(obj.name);
      }
    });

    return bones;
  }

  /**
   * Extract GLTF morph targets as expressions
   */
  private extractGLTFMorphTargets(scene: ThreeSceneObject): string[] {
    const morphTargets: Set<string> = new Set();

    scene.traverse?.((obj: ThreeTraversableObject) => {
      if (obj.morphTargetDictionary) {
        for (const name of Object.keys(obj.morphTargetDictionary)) {
          morphTargets.add(name);
        }
      }
    });

    return Array.from(morphTargets);
  }

  /**
   * Extract Ready Player Me metadata
   */
  private extractRPMMetadata(config: HumanoidConfig, _gltf: GLTFLoadResult): RPMMetadata {
    // Parse avatar ID from URL
    const match = config.url.match(/\/([a-f0-9-]+)\.glb/i);

    return {
      avatarId: match?.[1],
      bodyType: config.url.includes('halfbody') ? 'halfbody' : 'fullbody',
      gender: config.url.includes('male')
        ? 'male'
        : config.url.includes('female')
          ? 'female'
          : 'neutral',
    };
  }

  // ============================================================================
  // BONE MAPPING
  // ============================================================================

  /**
   * Standard bone name mapping from various naming conventions
   */
  static readonly BONE_NAME_MAP: Record<string, VRMBoneName> = {
    // Common naming variations
    pelvis: 'hips',
    spine_01: 'spine',
    spine_02: 'chest',
    spine_03: 'upperChest',
    clavicle_l: 'leftShoulder',
    upperarm_l: 'leftUpperArm',
    lowerarm_l: 'leftLowerArm',
    hand_l: 'leftHand',
    clavicle_r: 'rightShoulder',
    upperarm_r: 'rightUpperArm',
    lowerarm_r: 'rightLowerArm',
    hand_r: 'rightHand',
    thigh_l: 'leftUpperLeg',
    calf_l: 'leftLowerLeg',
    foot_l: 'leftFoot',
    ball_l: 'leftToes',
    thigh_r: 'rightUpperLeg',
    calf_r: 'rightLowerLeg',
    foot_r: 'rightFoot',
    ball_r: 'rightToes',
    // Mixamo naming
    'mixamorig:Hips': 'hips',
    'mixamorig:Spine': 'spine',
    'mixamorig:Spine1': 'chest',
    'mixamorig:Spine2': 'upperChest',
    'mixamorig:Neck': 'neck',
    'mixamorig:Head': 'head',
    'mixamorig:LeftShoulder': 'leftShoulder',
    'mixamorig:LeftArm': 'leftUpperArm',
    'mixamorig:LeftForeArm': 'leftLowerArm',
    'mixamorig:LeftHand': 'leftHand',
    'mixamorig:RightShoulder': 'rightShoulder',
    'mixamorig:RightArm': 'rightUpperArm',
    'mixamorig:RightForeArm': 'rightLowerArm',
    'mixamorig:RightHand': 'rightHand',
    'mixamorig:LeftUpLeg': 'leftUpperLeg',
    'mixamorig:LeftLeg': 'leftLowerLeg',
    'mixamorig:LeftFoot': 'leftFoot',
    'mixamorig:LeftToeBase': 'leftToes',
    'mixamorig:RightUpLeg': 'rightUpperLeg',
    'mixamorig:RightLeg': 'rightLowerLeg',
    'mixamorig:RightFoot': 'rightFoot',
    'mixamorig:RightToeBase': 'rightToes',
  };

  /**
   * Map a bone name to VRM standard
   */
  mapBoneName(name: string): VRMBoneName | null {
    const lower = name.toLowerCase();

    // Check direct mapping
    if (HumanoidLoader.BONE_NAME_MAP[name]) {
      return HumanoidLoader.BONE_NAME_MAP[name];
    }

    // Check lowercase mapping
    for (const [key, value] of Object.entries(HumanoidLoader.BONE_NAME_MAP)) {
      if (key.toLowerCase() === lower) {
        return value;
      }
    }

    // Check if it's already a VRM bone name
    const vrmBones: VRMBoneName[] = [
      'hips',
      'spine',
      'chest',
      'upperChest',
      'neck',
      'head',
      'leftShoulder',
      'leftUpperArm',
      'leftLowerArm',
      'leftHand',
      'rightShoulder',
      'rightUpperArm',
      'rightLowerArm',
      'rightHand',
      'leftUpperLeg',
      'leftLowerLeg',
      'leftFoot',
      'leftToes',
      'rightUpperLeg',
      'rightLowerLeg',
      'rightFoot',
      'rightToes',
    ];

    if (vrmBones.includes(lower as VRMBoneName)) {
      return lower as VRMBoneName;
    }

    return null;
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  /**
   * Add event listener
   */
  on(event: HumanoidLoaderEvent, callback: HumanoidEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(event: HumanoidLoaderEvent, callback: HumanoidEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: HumanoidLoaderEvent, avatarId: string, data?: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        callback({ type: event, avatarId, data });
      }
    }
  }

  // ============================================================================
  // DISPOSE
  // ============================================================================

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.avatars.clear();
    this.eventListeners.clear();
    this.gltfLoader = null;
    this.vrmLoaderPlugin = null;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

let defaultLoader: HumanoidLoader | null = null;

/**
 * Get default humanoid loader
 */
export function getHumanoidLoader(): HumanoidLoader {
  if (!defaultLoader) {
    defaultLoader = new HumanoidLoader();
  }
  return defaultLoader;
}

/**
 * Create a new humanoid loader
 */
export function createHumanoidLoader(assetLoader?: SmartAssetLoader): HumanoidLoader {
  return new HumanoidLoader(assetLoader);
}

/**
 * Load humanoid avatar using default loader
 */
export async function loadHumanoid(
  id: string,
  config: HumanoidConfig
): Promise<HumanoidLoadResult> {
  return getHumanoidLoader().loadAvatar(id, config);
}
