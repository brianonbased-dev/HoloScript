/**
 * MixamoIntegration.ts
 *
 * API integration for Mixamo character animations. Provides animation search,
 * download, retargeting to HoloScript skeletons, and caching for efficient
 * reuse. Designed for Hololand's animation pipeline.
 *
 * NOTE: Mixamo API access requires authentication via Adobe ID.
 * The API endpoints are reverse-engineered from the web interface and
 * may change without notice. This integration provides a stable abstraction
 * layer over those endpoints.
 *
 * Staging area file for Hololand integration (TODO-039).
 *
 * @version 1.0.0
 * @package hololand/animation
 */

// =============================================================================
// TYPES
// =============================================================================

/** Mixamo animation categories */
export type MixamoCategory =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'dance'
  | 'fight'
  | 'gesture'
  | 'sports'
  | 'interact'
  | 'emote'
  | 'locomotion'
  | 'acrobatics';

/** Mixamo animation format for download */
export type MixamoDownloadFormat = 'fbx' | 'fbx7' | 'dae';

/** Skeleton type for retargeting */
export type SkeletonType =
  | 'mixamo'        // standard Mixamo T-pose
  | 'vrm'           // VRM humanoid
  | 'holoscript'    // HoloScript skeleton convention
  | 'custom';

/** Mixamo API authentication state */
export interface MixamoAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  userId: string;
}

/** Mixamo animation metadata */
export interface MixamoAnimation {
  id: string;
  name: string;
  description: string;
  category: MixamoCategory;
  duration: number; // seconds
  frameCount: number;
  fps: number;
  isLoopable: boolean;
  /** Whether this animation requires in-place root motion */
  inPlace: boolean;
  /** Tags for search */
  tags: string[];
  /** Thumbnail URL */
  thumbnailUrl: string;
  /** Preview animation URL (if available) */
  previewUrl?: string;
}

/** Mixamo character (for upload/retarget) */
export interface MixamoCharacter {
  id: string;
  name: string;
  /** Whether this is a user-uploaded character or a Mixamo default */
  isCustom: boolean;
  /** Upload status */
  status: 'ready' | 'processing' | 'error';
}

/** Animation search parameters */
export interface MixamoSearchParams {
  query?: string;
  category?: MixamoCategory;
  page?: number;
  pageSize?: number;
  loopableOnly?: boolean;
  /** Min duration in seconds */
  minDuration?: number;
  /** Max duration in seconds */
  maxDuration?: number;
}

/** Animation search results */
export interface MixamoSearchResult {
  animations: MixamoAnimation[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Download options */
export interface MixamoDownloadOptions {
  format: MixamoDownloadFormat;
  /** FPS for the export (24, 30, 60) */
  fps: 24 | 30 | 60;
  /** Whether to apply in-place root motion */
  inPlace: boolean;
  /** Arm spacing for T-pose (0-100) */
  armSpacing?: number;
  /** Custom character ID to apply animation to */
  characterId?: string;
  /** Trim start time (seconds) */
  trimStart?: number;
  /** Trim end time (seconds) */
  trimEnd?: number;
  /** Whether to include skin (mesh) or only skeleton */
  withSkin: boolean;
}

/** Downloaded animation data */
export interface MixamoDownloadResult {
  animationId: string;
  animationName: string;
  format: MixamoDownloadFormat;
  /** Raw binary data */
  data: ArrayBuffer;
  /** File size in bytes */
  sizeBytes: number;
  /** Download timestamp */
  downloadedAt: number;
}

// =============================================================================
// Retargeting Types
// =============================================================================

/** Bone name mapping between skeleton types */
export interface BoneNameMapping {
  sourceBone: string;
  targetBone: string;
  /** Optional rotation offset (Euler, radians) */
  rotationOffset?: [number, number, number];
  /** Optional scale factor */
  scaleFactor?: number;
}

/** Complete retarget configuration */
export interface RetargetConfig {
  sourceType: SkeletonType;
  targetType: SkeletonType;
  boneMappings: BoneNameMapping[];
  /** Whether to apply root motion transform */
  applyRootMotion: boolean;
  /** Scale factor for the entire animation */
  globalScale: number;
  /** Coordinate system conversion */
  coordinateSystem: 'y-up' | 'z-up';
}

/** Retarget result */
export interface RetargetResult {
  success: boolean;
  sourceAnimationId: string;
  targetSkeletonType: SkeletonType;
  /** Retargeted keyframe data per bone */
  tracks: AnimationTrack[];
  /** Bones that could not be mapped */
  unmappedBones: string[];
  warnings: string[];
  /** Duration of retargeted animation in seconds */
  duration: number;
}

/** Single bone animation track */
export interface AnimationTrack {
  boneName: string;
  /** Position keyframes (time -> [x, y, z]) */
  positionKeys: { time: number; value: [number, number, number] }[];
  /** Rotation keyframes (time -> [x, y, z, w] quaternion) */
  rotationKeys: { time: number; value: [number, number, number, number] }[];
  /** Scale keyframes (time -> [x, y, z]) */
  scaleKeys: { time: number; value: [number, number, number] }[];
}

/** Cached animation entry */
export interface CachedAnimation {
  animation: MixamoAnimation;
  downloadResult?: MixamoDownloadResult;
  retargetResults: Map<SkeletonType, RetargetResult>;
  lastAccessedAt: number;
}

// =============================================================================
// Default Bone Mappings
// =============================================================================

/** Mixamo to VRM bone name mapping */
export const MIXAMO_TO_VRM_BONE_MAP: BoneNameMapping[] = [
  { sourceBone: 'mixamorig:Hips', targetBone: 'hips' },
  { sourceBone: 'mixamorig:Spine', targetBone: 'spine' },
  { sourceBone: 'mixamorig:Spine1', targetBone: 'chest' },
  { sourceBone: 'mixamorig:Spine2', targetBone: 'upperChest' },
  { sourceBone: 'mixamorig:Neck', targetBone: 'neck' },
  { sourceBone: 'mixamorig:Head', targetBone: 'head' },
  { sourceBone: 'mixamorig:LeftShoulder', targetBone: 'leftShoulder' },
  { sourceBone: 'mixamorig:LeftArm', targetBone: 'leftUpperArm' },
  { sourceBone: 'mixamorig:LeftForeArm', targetBone: 'leftLowerArm' },
  { sourceBone: 'mixamorig:LeftHand', targetBone: 'leftHand' },
  { sourceBone: 'mixamorig:RightShoulder', targetBone: 'rightShoulder' },
  { sourceBone: 'mixamorig:RightArm', targetBone: 'rightUpperArm' },
  { sourceBone: 'mixamorig:RightForeArm', targetBone: 'rightLowerArm' },
  { sourceBone: 'mixamorig:RightHand', targetBone: 'rightHand' },
  { sourceBone: 'mixamorig:LeftUpLeg', targetBone: 'leftUpperLeg' },
  { sourceBone: 'mixamorig:LeftLeg', targetBone: 'leftLowerLeg' },
  { sourceBone: 'mixamorig:LeftFoot', targetBone: 'leftFoot' },
  { sourceBone: 'mixamorig:LeftToeBase', targetBone: 'leftToes' },
  { sourceBone: 'mixamorig:RightUpLeg', targetBone: 'rightUpperLeg' },
  { sourceBone: 'mixamorig:RightLeg', targetBone: 'rightLowerLeg' },
  { sourceBone: 'mixamorig:RightFoot', targetBone: 'rightFoot' },
  { sourceBone: 'mixamorig:RightToeBase', targetBone: 'rightToes' },
  // Finger bones
  { sourceBone: 'mixamorig:LeftHandThumb1', targetBone: 'leftThumbMetacarpal' },
  { sourceBone: 'mixamorig:LeftHandThumb2', targetBone: 'leftThumbProximal' },
  { sourceBone: 'mixamorig:LeftHandThumb3', targetBone: 'leftThumbDistal' },
  { sourceBone: 'mixamorig:LeftHandIndex1', targetBone: 'leftIndexProximal' },
  { sourceBone: 'mixamorig:LeftHandIndex2', targetBone: 'leftIndexIntermediate' },
  { sourceBone: 'mixamorig:LeftHandIndex3', targetBone: 'leftIndexDistal' },
  { sourceBone: 'mixamorig:LeftHandMiddle1', targetBone: 'leftMiddleProximal' },
  { sourceBone: 'mixamorig:LeftHandMiddle2', targetBone: 'leftMiddleIntermediate' },
  { sourceBone: 'mixamorig:LeftHandMiddle3', targetBone: 'leftMiddleDistal' },
  { sourceBone: 'mixamorig:LeftHandRing1', targetBone: 'leftRingProximal' },
  { sourceBone: 'mixamorig:LeftHandRing2', targetBone: 'leftRingIntermediate' },
  { sourceBone: 'mixamorig:LeftHandRing3', targetBone: 'leftRingDistal' },
  { sourceBone: 'mixamorig:LeftHandPinky1', targetBone: 'leftLittleProximal' },
  { sourceBone: 'mixamorig:LeftHandPinky2', targetBone: 'leftLittleIntermediate' },
  { sourceBone: 'mixamorig:LeftHandPinky3', targetBone: 'leftLittleDistal' },
  { sourceBone: 'mixamorig:RightHandThumb1', targetBone: 'rightThumbMetacarpal' },
  { sourceBone: 'mixamorig:RightHandThumb2', targetBone: 'rightThumbProximal' },
  { sourceBone: 'mixamorig:RightHandThumb3', targetBone: 'rightThumbDistal' },
  { sourceBone: 'mixamorig:RightHandIndex1', targetBone: 'rightIndexProximal' },
  { sourceBone: 'mixamorig:RightHandIndex2', targetBone: 'rightIndexIntermediate' },
  { sourceBone: 'mixamorig:RightHandIndex3', targetBone: 'rightIndexDistal' },
  { sourceBone: 'mixamorig:RightHandMiddle1', targetBone: 'rightMiddleProximal' },
  { sourceBone: 'mixamorig:RightHandMiddle2', targetBone: 'rightMiddleIntermediate' },
  { sourceBone: 'mixamorig:RightHandMiddle3', targetBone: 'rightMiddleDistal' },
  { sourceBone: 'mixamorig:RightHandRing1', targetBone: 'rightRingProximal' },
  { sourceBone: 'mixamorig:RightHandRing2', targetBone: 'rightRingIntermediate' },
  { sourceBone: 'mixamorig:RightHandRing3', targetBone: 'rightRingDistal' },
  { sourceBone: 'mixamorig:RightHandPinky1', targetBone: 'rightLittleProximal' },
  { sourceBone: 'mixamorig:RightHandPinky2', targetBone: 'rightLittleIntermediate' },
  { sourceBone: 'mixamorig:RightHandPinky3', targetBone: 'rightLittleDistal' },
];

/** Mixamo to HoloScript skeleton bone map */
export const MIXAMO_TO_HOLOSCRIPT_BONE_MAP: BoneNameMapping[] = [
  { sourceBone: 'mixamorig:Hips', targetBone: 'root' },
  { sourceBone: 'mixamorig:Spine', targetBone: 'spine_01' },
  { sourceBone: 'mixamorig:Spine1', targetBone: 'spine_02' },
  { sourceBone: 'mixamorig:Spine2', targetBone: 'spine_03' },
  { sourceBone: 'mixamorig:Neck', targetBone: 'neck_01' },
  { sourceBone: 'mixamorig:Head', targetBone: 'head' },
  { sourceBone: 'mixamorig:LeftShoulder', targetBone: 'clavicle_l' },
  { sourceBone: 'mixamorig:LeftArm', targetBone: 'upperarm_l' },
  { sourceBone: 'mixamorig:LeftForeArm', targetBone: 'lowerarm_l' },
  { sourceBone: 'mixamorig:LeftHand', targetBone: 'hand_l' },
  { sourceBone: 'mixamorig:RightShoulder', targetBone: 'clavicle_r' },
  { sourceBone: 'mixamorig:RightArm', targetBone: 'upperarm_r' },
  { sourceBone: 'mixamorig:RightForeArm', targetBone: 'lowerarm_r' },
  { sourceBone: 'mixamorig:RightHand', targetBone: 'hand_r' },
  { sourceBone: 'mixamorig:LeftUpLeg', targetBone: 'thigh_l' },
  { sourceBone: 'mixamorig:LeftLeg', targetBone: 'calf_l' },
  { sourceBone: 'mixamorig:LeftFoot', targetBone: 'foot_l' },
  { sourceBone: 'mixamorig:LeftToeBase', targetBone: 'ball_l' },
  { sourceBone: 'mixamorig:RightUpLeg', targetBone: 'thigh_r' },
  { sourceBone: 'mixamorig:RightLeg', targetBone: 'calf_r' },
  { sourceBone: 'mixamorig:RightFoot', targetBone: 'foot_r' },
  { sourceBone: 'mixamorig:RightToeBase', targetBone: 'ball_r' },
];

// =============================================================================
// Animation Cache
// =============================================================================

/**
 * LRU cache for downloaded Mixamo animations.
 * Keeps frequently used animations in memory to avoid redundant downloads.
 */
export class AnimationCache {
  private cache: Map<string, CachedAnimation> = new Map();
  private maxEntries: number;
  private maxMemoryMB: number;
  private currentMemoryBytes: number = 0;

  constructor(options?: { maxEntries?: number; maxMemoryMB?: number }) {
    this.maxEntries = options?.maxEntries ?? 100;
    this.maxMemoryMB = options?.maxMemoryMB ?? 512;
  }

  /** Check if an animation is cached */
  has(animationId: string): boolean {
    return this.cache.has(animationId);
  }

  /** Get a cached animation (updates LRU access time) */
  get(animationId: string): CachedAnimation | undefined {
    const entry = this.cache.get(animationId);
    if (entry) {
      entry.lastAccessedAt = Date.now();
    }
    return entry;
  }

  /** Cache an animation */
  set(animationId: string, entry: CachedAnimation): void {
    // Evict if necessary
    while (
      this.cache.size >= this.maxEntries ||
      this.currentMemoryBytes > this.maxMemoryMB * 1024 * 1024
    ) {
      this.evictLRU();
    }

    const memSize = entry.downloadResult?.sizeBytes ?? 0;
    this.currentMemoryBytes += memSize;
    this.cache.set(animationId, entry);
  }

  /** Get a cached retarget result */
  getRetarget(animationId: string, targetType: SkeletonType): RetargetResult | undefined {
    const entry = this.get(animationId);
    return entry?.retargetResults.get(targetType);
  }

  /** Cache a retarget result */
  setRetarget(animationId: string, targetType: SkeletonType, result: RetargetResult): void {
    const entry = this.get(animationId);
    if (entry) {
      entry.retargetResults.set(targetType, result);
    }
  }

  /** Clear the entire cache */
  clear(): void {
    this.cache.clear();
    this.currentMemoryBytes = 0;
  }

  /** Get cache statistics */
  getStats(): {
    entries: number;
    maxEntries: number;
    memoryUsedMB: number;
    maxMemoryMB: number;
  } {
    return {
      entries: this.cache.size,
      maxEntries: this.maxEntries,
      memoryUsedMB: this.currentMemoryBytes / (1024 * 1024),
      maxMemoryMB: this.maxMemoryMB,
    };
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry?.downloadResult) {
        this.currentMemoryBytes -= entry.downloadResult.sizeBytes;
      }
      this.cache.delete(oldestKey);
    }
  }
}

// =============================================================================
// Mixamo Integration Client
// =============================================================================

/**
 * Mixamo API integration client.
 *
 * Provides search, download, and retargeting of Mixamo animations
 * for use in HoloScript / Hololand VR experiences.
 */
export class MixamoIntegration {
  private auth: MixamoAuth | null = null;
  private cache: AnimationCache;
  private baseUrl: string = 'https://www.mixamo.com/api/v1';
  private retargetConfigs: Map<string, RetargetConfig> = new Map();

  constructor(options?: {
    cacheMaxEntries?: number;
    cacheMaxMemoryMB?: number;
  }) {
    this.cache = new AnimationCache({
      maxEntries: options?.cacheMaxEntries,
      maxMemoryMB: options?.cacheMaxMemoryMB,
    });

    // Register default retarget configs
    this.registerRetargetConfig('mixamo-to-vrm', {
      sourceType: 'mixamo',
      targetType: 'vrm',
      boneMappings: MIXAMO_TO_VRM_BONE_MAP,
      applyRootMotion: true,
      globalScale: 1.0,
      coordinateSystem: 'y-up',
    });

    this.registerRetargetConfig('mixamo-to-holoscript', {
      sourceType: 'mixamo',
      targetType: 'holoscript',
      boneMappings: MIXAMO_TO_HOLOSCRIPT_BONE_MAP,
      applyRootMotion: true,
      globalScale: 1.0,
      coordinateSystem: 'y-up',
    });
  }

  // ============================
  // Authentication
  // ============================

  /** Set authentication credentials */
  setAuth(auth: MixamoAuth): void {
    this.auth = auth;
  }

  /** Check if authenticated */
  get isAuthenticated(): boolean {
    return this.auth !== null && this.auth.expiresAt > Date.now();
  }

  // ============================
  // Animation Search
  // ============================

  /**
   * Search for animations on Mixamo.
   *
   * NOTE: In a real implementation, this would call the Mixamo API.
   * The method signature and return types are production-ready.
   */
  async searchAnimations(params: MixamoSearchParams): Promise<MixamoSearchResult> {
    this.requireAuth();

    const queryParts: string[] = [];
    if (params.query) queryParts.push(`q=${encodeURIComponent(params.query)}`);
    if (params.category) queryParts.push(`category=${params.category}`);
    if (params.page) queryParts.push(`page=${params.page}`);
    if (params.pageSize) queryParts.push(`limit=${params.pageSize}`);

    const url = `${this.baseUrl}/animations?${queryParts.join('&')}`;

    // In production, this would be: const response = await fetch(url, { headers: this.getHeaders() });
    // For the POC, we return structured mock data
    return this.mockSearchResult(params);
  }

  /**
   * Get animation details by ID.
   */
  async getAnimation(animationId: string): Promise<MixamoAnimation | null> {
    // Check cache first
    const cached = this.cache.get(animationId);
    if (cached) return cached.animation;

    this.requireAuth();

    // In production: const response = await fetch(`${this.baseUrl}/animations/${animationId}`, ...);
    return null;
  }

  /**
   * Get animations by category.
   */
  async getAnimationsByCategory(
    category: MixamoCategory,
    page: number = 0,
    pageSize: number = 20
  ): Promise<MixamoSearchResult> {
    return this.searchAnimations({ category, page, pageSize });
  }

  // ============================
  // Animation Download
  // ============================

  /**
   * Download an animation from Mixamo.
   *
   * Downloads are cached for subsequent use. If the animation has already
   * been downloaded and is in the cache, the cached version is returned.
   */
  async downloadAnimation(
    animationId: string,
    options?: Partial<MixamoDownloadOptions>
  ): Promise<MixamoDownloadResult> {
    // Check cache
    const cached = this.cache.get(animationId);
    if (cached?.downloadResult) {
      return cached.downloadResult;
    }

    this.requireAuth();

    const downloadOptions: MixamoDownloadOptions = {
      format: options?.format ?? 'fbx',
      fps: options?.fps ?? 30,
      inPlace: options?.inPlace ?? false,
      withSkin: options?.withSkin ?? false,
      ...options,
    };

    // In production, this would trigger the Mixamo export pipeline:
    // 1. POST /animations/{id}/export with options
    // 2. Poll for completion
    // 3. GET the download URL
    // 4. Fetch the binary data

    const result: MixamoDownloadResult = {
      animationId,
      animationName: cached?.animation.name ?? animationId,
      format: downloadOptions.format,
      data: new ArrayBuffer(0), // Would contain actual FBX/DAE data
      sizeBytes: 0,
      downloadedAt: Date.now(),
    };

    // Cache the result
    if (cached) {
      cached.downloadResult = result;
    } else {
      this.cache.set(animationId, {
        animation: {
          id: animationId,
          name: animationId,
          description: '',
          category: 'idle',
          duration: 0,
          frameCount: 0,
          fps: downloadOptions.fps,
          isLoopable: false,
          inPlace: downloadOptions.inPlace,
          tags: [],
          thumbnailUrl: '',
        },
        downloadResult: result,
        retargetResults: new Map(),
        lastAccessedAt: Date.now(),
      });
    }

    return result;
  }

  // ============================
  // Character Upload
  // ============================

  /**
   * Upload a custom character to Mixamo for auto-rigging.
   *
   * Accepts FBX or OBJ files. Mixamo will auto-rig the character and
   * return a character ID for applying animations.
   */
  async uploadCharacter(
    name: string,
    fileData: ArrayBuffer,
    fileFormat: 'fbx' | 'obj'
  ): Promise<MixamoCharacter> {
    this.requireAuth();

    // In production:
    // 1. POST /characters with multipart form data
    // 2. Poll for auto-rigging completion

    return {
      id: `char_${Date.now()}`,
      name,
      isCustom: true,
      status: 'processing',
    };
  }

  /**
   * Check the status of a character upload.
   */
  async getCharacterStatus(characterId: string): Promise<MixamoCharacter> {
    this.requireAuth();
    // In production: GET /characters/{characterId}
    return {
      id: characterId,
      name: 'Unknown',
      isCustom: true,
      status: 'ready',
    };
  }

  // ============================
  // Retargeting
  // ============================

  /**
   * Register a custom retarget configuration.
   */
  registerRetargetConfig(name: string, config: RetargetConfig): void {
    this.retargetConfigs.set(name, config);
  }

  /**
   * Get a registered retarget configuration.
   */
  getRetargetConfig(name: string): RetargetConfig | undefined {
    return this.retargetConfigs.get(name);
  }

  /**
   * Retarget a downloaded animation to a different skeleton type.
   *
   * This method takes raw animation data (from a Mixamo download) and
   * remaps the bone names and transforms to match the target skeleton.
   */
  retargetAnimation(
    animationId: string,
    targetType: SkeletonType,
    sourceTracks: AnimationTrack[],
    configName?: string
  ): RetargetResult {
    // Check cache
    const cachedRetarget = this.cache.getRetarget(animationId, targetType);
    if (cachedRetarget) return cachedRetarget;

    // Find appropriate config
    const configKey = configName ?? `mixamo-to-${targetType}`;
    const config = this.retargetConfigs.get(configKey);

    if (!config) {
      return {
        success: false,
        sourceAnimationId: animationId,
        targetSkeletonType: targetType,
        tracks: [],
        unmappedBones: sourceTracks.map((t) => t.boneName),
        warnings: [`No retarget config found for "${configKey}"`],
        duration: 0,
      };
    }

    // Build bone name lookup
    const boneMap = new Map<string, BoneNameMapping>();
    for (const mapping of config.boneMappings) {
      boneMap.set(mapping.sourceBone, mapping);
    }

    const retargetedTracks: AnimationTrack[] = [];
    const unmappedBones: string[] = [];
    const warnings: string[] = [];
    let maxDuration = 0;

    for (const sourceTrack of sourceTracks) {
      const mapping = boneMap.get(sourceTrack.boneName);
      if (!mapping) {
        unmappedBones.push(sourceTrack.boneName);
        continue;
      }

      const retargetedTrack: AnimationTrack = {
        boneName: mapping.targetBone,
        positionKeys: sourceTrack.positionKeys.map((key) => ({
          time: key.time,
          value: this.applyScaleToPosition(key.value, config.globalScale),
        })),
        rotationKeys: sourceTrack.rotationKeys.map((key) => ({
          time: key.time,
          value: mapping.rotationOffset
            ? this.applyRotationOffset(key.value, mapping.rotationOffset)
            : key.value,
        })),
        scaleKeys: [...sourceTrack.scaleKeys],
      };

      retargetedTracks.push(retargetedTrack);

      // Track max duration
      for (const key of sourceTrack.positionKeys) {
        maxDuration = Math.max(maxDuration, key.time);
      }
      for (const key of sourceTrack.rotationKeys) {
        maxDuration = Math.max(maxDuration, key.time);
      }
    }

    if (unmappedBones.length > 0) {
      warnings.push(`${unmappedBones.length} bones could not be mapped: ${unmappedBones.slice(0, 5).join(', ')}${unmappedBones.length > 5 ? '...' : ''}`);
    }

    const result: RetargetResult = {
      success: true,
      sourceAnimationId: animationId,
      targetSkeletonType: targetType,
      tracks: retargetedTracks,
      unmappedBones,
      warnings,
      duration: maxDuration,
    };

    // Cache
    this.cache.setRetarget(animationId, targetType, result);

    return result;
  }

  // ============================
  // Cache Management
  // ============================

  /** Get the animation cache */
  getCache(): AnimationCache {
    return this.cache;
  }

  /** Clear the animation cache */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================
  // Private Helpers
  // ============================

  private requireAuth(): void {
    if (!this.isAuthenticated) {
      throw new Error('Mixamo authentication required. Call setAuth() first.');
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.auth!.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private applyScaleToPosition(
    pos: [number, number, number],
    scale: number
  ): [number, number, number] {
    return [pos[0] * scale, pos[1] * scale, pos[2] * scale];
  }

  private applyRotationOffset(
    quat: [number, number, number, number],
    eulerOffset: [number, number, number]
  ): [number, number, number, number] {
    // Convert Euler offset to quaternion and multiply
    // Simplified — a full implementation would use proper quaternion math
    const [rx, ry, rz] = eulerOffset;
    const cr = Math.cos(rx * 0.5), sr = Math.sin(rx * 0.5);
    const cp = Math.cos(ry * 0.5), sp = Math.sin(ry * 0.5);
    const cy = Math.cos(rz * 0.5), sy = Math.sin(rz * 0.5);

    const ox = sr * cp * cy - cr * sp * sy;
    const oy = cr * sp * cy + sr * cp * sy;
    const oz = cr * cp * sy - sr * sp * cy;
    const ow = cr * cp * cy + sr * sp * sy;

    // Quaternion multiplication: offset * quat
    const [qx, qy, qz, qw] = quat;
    return [
      ow * qx + ox * qw + oy * qz - oz * qy,
      ow * qy - ox * qz + oy * qw + oz * qx,
      ow * qz + ox * qy - oy * qx + oz * qw,
      ow * qw - ox * qx - oy * qy - oz * qz,
    ];
  }

  private mockSearchResult(params: MixamoSearchParams): MixamoSearchResult {
    // Provide structured mock data for testing the integration layer
    const mockAnimations: MixamoAnimation[] = [
      {
        id: 'anim_idle_01',
        name: 'Idle Breathing',
        description: 'Relaxed breathing idle',
        category: 'idle',
        duration: 4.0,
        frameCount: 120,
        fps: 30,
        isLoopable: true,
        inPlace: true,
        tags: ['idle', 'breathing', 'relaxed'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/idle_breathing.jpg',
      },
      {
        id: 'anim_walk_01',
        name: 'Walking',
        description: 'Standard walking cycle',
        category: 'walk',
        duration: 1.0,
        frameCount: 30,
        fps: 30,
        isLoopable: true,
        inPlace: false,
        tags: ['walk', 'locomotion', 'cycle'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/walking.jpg',
      },
      {
        id: 'anim_dance_01',
        name: 'Hip Hop Dancing',
        description: 'Hip hop dance moves',
        category: 'dance',
        duration: 8.0,
        frameCount: 240,
        fps: 30,
        isLoopable: true,
        inPlace: true,
        tags: ['dance', 'hiphop', 'performance'],
        thumbnailUrl: 'https://www.mixamo.com/thumbnails/hiphop_dance.jpg',
      },
    ];

    let filtered = mockAnimations;
    if (params.category) {
      filtered = filtered.filter((a) => a.category === params.category);
    }
    if (params.query) {
      const q = params.query.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.includes(q))
      );
    }
    if (params.loopableOnly) {
      filtered = filtered.filter((a) => a.isLoopable);
    }

    const page = params.page ?? 0;
    const pageSize = params.pageSize ?? 20;
    const start = page * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return {
      animations: paged,
      totalCount: filtered.length,
      page,
      pageSize,
      hasMore: start + pageSize < filtered.length,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MixamoIntegration instance.
 */
export function createMixamoIntegration(options?: {
  cacheMaxEntries?: number;
  cacheMaxMemoryMB?: number;
}): MixamoIntegration {
  return new MixamoIntegration(options);
}
