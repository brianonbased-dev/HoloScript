/**
 * @holoscript/core Asset Metadata Schema
 *
 * Rich metadata schema for smart asset management in Hololand.
 * Enables AI-driven asset optimization, platform-aware loading, and semantic discovery.
 */

// ============================================================================
// Asset Format Types
// ============================================================================

export type AssetFormat =
  | 'gltf'
  | 'glb'
  | 'fbx'
  | 'usd'
  | 'usda'
  | 'usdc'
  | 'usdz'
  | 'obj'
  | 'stl'
  | 'ply'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'webp'
  | 'avif'
  | 'exr'
  | 'hdr'
  | 'ktx2'
  | 'basis'
  | 'mp3'
  | 'ogg'
  | 'wav'
  | 'mp4'
  | 'webm'
  | 'holo'
  | 'hsplus'
  | 'hs';

export type AssetType =
  | 'model'
  | 'texture'
  | 'material'
  | 'animation'
  | 'scene'
  | 'shader'
  | 'audio'
  | 'video'
  | 'font'
  | 'script'
  | 'data';

export type TextureFormat =
  | 'RGBA8'
  | 'RGB8'
  | 'RGB565'
  | 'RGBA4444'
  | 'BC1'
  | 'BC3'
  | 'BC7'
  | 'ASTC'
  | 'PVRTC'
  | 'ETC2'
  | 'BASIS';

export type CompressionFormat =
  | 'none'
  | 'draco'
  | 'meshopt'
  | 'basis'
  | 'astc'
  | 'ktx2'
  | 'gzip'
  | 'brotli';

export type TextureResolution = '256' | '512' | '1K' | '2K' | '4K' | '8K';

// ============================================================================
// Platform Compatibility
// ============================================================================

export interface PlatformCompatibility {
  webgl?: boolean;
  webgl2?: boolean;
  webgpu?: boolean;
  vr?: {
    quest?: boolean;
    quest2?: boolean;
    quest3?: boolean;
    questPro?: boolean;
    vive?: boolean;
    index?: boolean;
    psvr2?: boolean;
    visionPro?: boolean;
  };
  ar?: {
    arkit?: boolean;
    arcore?: boolean;
    webxr?: boolean;
  };
  mobile?: {
    ios?: boolean;
    android?: boolean;
    minIOSVersion?: string;
    minAndroidAPI?: number;
  };
  desktop?: {
    windows?: boolean;
    macos?: boolean;
    linux?: boolean;
  };
}

// ============================================================================
// Asset Dependencies
// ============================================================================

export interface AssetDependency {
  /** Dependent asset ID or path */
  assetId: string;

  /** Type of dependency */
  type: 'texture' | 'material' | 'shader' | 'animation' | 'script' | 'data';

  /** Is this dependency required? */
  required: boolean;

  /** Fallback asset if dependency fails to load */
  fallback?: string;
}

// ============================================================================
// Asset Optimization
// ============================================================================

export interface AssetOptimization {
  /** Optimization type */
  type:
    | 'texture_compression'
    | 'mesh_simplification'
    | 'lod_generation'
    | 'atlas_packing'
    | 'animation_compression'
    | 'format_conversion';

  /** Suggested action */
  suggestion: string;

  /** Estimated improvement */
  estimatedImprovement: {
    memorySavings?: number; // bytes
    loadTimeSavings?: number; // ms
    renderTimeSavings?: number; // ms
  };

  /** Priority (0-1) */
  priority: number;

  /** Auto-applicable? */
  autoApply: boolean;
}

// ============================================================================
// Semantic Tags
// ============================================================================

export interface SemanticTags {
  /** Category (character, prop, environment, ui, effect) */
  category?: 'character' | 'prop' | 'environment' | 'ui' | 'effect' | 'system';

  /** Sub-category */
  subcategory?: string;

  /** Rig type for characters */
  rig?: 'humanoid' | 'quadruped' | 'biped' | 'custom' | 'none';

  /** Material type */
  material?: 'pbr' | 'unlit' | 'toon' | 'custom';

  /** Animation types available */
  animations?: string[];

  /** Style tags */
  style?: string[];

  /** Mood/atmosphere tags */
  mood?: string[];

  /** Custom tags */
  custom?: Record<string, string>;
}

// ============================================================================
// LOD Configuration
// ============================================================================

export interface LODLevel {
  /** LOD level (0 = highest quality) */
  level: number;

  /** Distance threshold for this LOD */
  distance: number;

  /** Asset path for this LOD */
  assetPath?: string;

  /** Polygon count at this LOD */
  polyCount?: number;

  /** Texture resolution at this LOD */
  textureResolution?: TextureResolution;

  /** Screen coverage threshold (0-1) */
  screenCoverage?: number;
}

// ============================================================================
// Main Asset Metadata Interface
// ============================================================================

export interface AssetMetadata {
  // ─── Identity ────────────────────────────────────────────────────────────
  /** Unique asset identifier */
  id: string;

  /** Asset name (file name without extension) */
  name: string;

  /** Display name for UI */
  displayName: string;

  /** Human-readable description */
  description?: string;

  // ─── Format & Type ───────────────────────────────────────────────────────
  /** File format */
  format: AssetFormat;

  /** Asset type */
  assetType: AssetType;

  /** MIME type */
  mimeType: string;

  /** File extension */
  extension: string;

  // ─── Location ────────────────────────────────────────────────────────────
  /** Source file path (relative to project root) */
  sourcePath: string;

  /** Resolved URL for loading */
  url?: string;

  /** CDN URL if available */
  cdnUrl?: string;

  /** Local cache path */
  cachePath?: string;

  // ─── Versioning & Compatibility ──────────────────────────────────────────
  /** Asset version */
  version: string;

  /** Source tool version (e.g., Blender 4.0) */
  sourceVersion?: string;

  /** Minimum HoloScript version required */
  minHoloScriptVersion?: string;

  /** Platform compatibility matrix */
  platformCompatibility: PlatformCompatibility;

  // ─── Content Information ─────────────────────────────────────────────────
  /** Dimensions (for textures/videos) */
  dimensions?: {
    width: number;
    height: number;
    depth?: number;
  };

  /** File size in bytes */
  fileSize: number;

  /** Compressed size in bytes */
  compressedSize?: number;

  /** Compression format used */
  compressionFormat?: CompressionFormat;

  /** Mesh statistics (for models) */
  meshStats?: {
    meshCount: number;
    vertexCount: number;
    triangleCount: number;
    boneCount?: number;
    morphTargetCount?: number;
  };

  /** Texture statistics */
  textureStats?: {
    textureCount: number;
    totalTextureMemory: number;
    maxResolution: TextureResolution;
    formats: TextureFormat[];
  };

  /** Material count */
  materialCount?: number;

  /** Animation clips */
  animationClips?: Array<{
    name: string;
    duration: number; // seconds
    frameCount: number;
    fps: number;
  }>;

  // ─── Performance Estimates ───────────────────────────────────────────────
  /** Estimated GPU memory usage (bytes) */
  estimatedGPUMemory: number;

  /** Estimated CPU memory usage (bytes) */
  estimatedCPUMemory: number;

  /** Estimated load time (ms) on average connection */
  estimatedLoadTime: number;

  /** Draw calls per frame (estimate) */
  estimatedDrawCalls?: number;

  // ─── LOD Configuration ───────────────────────────────────────────────────
  /** LOD levels available */
  lodLevels?: LODLevel[];

  /** Has automatic LOD generation */
  hasAutoLOD?: boolean;

  // ─── Semantics & Tags ────────────────────────────────────────────────────
  /** Simple string tags for search */
  tags: string[];

  /** Semantic categorization */
  semanticTags: SemanticTags;

  // ─── Dependencies ────────────────────────────────────────────────────────
  /** Asset dependencies */
  dependencies: AssetDependency[];

  /** External texture dependencies */
  textureDependencies: string[];

  /** Shader dependencies */
  shaderDependencies: string[];

  // ─── Source Information ──────────────────────────────────────────────────
  /** Original source file */
  sourceFile: string;

  /** Hash of source file (for change detection) */
  sourceHash: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last modification timestamp */
  modifiedAt: string;

  /** Author/creator */
  author?: string;

  /** License information */
  license?: string;

  /** Attribution requirements */
  attribution?: string;

  // ─── Optimization ────────────────────────────────────────────────────────
  /** Available optimizations */
  optimizations: AssetOptimization[];

  /** Is this asset optimized? */
  isOptimized: boolean;

  /** Optimization profile used */
  optimizationProfile?: 'mobile' | 'desktop' | 'vr' | 'balanced';

  // ─── Validation ──────────────────────────────────────────────────────────
  /** Has been validated? */
  validated: boolean;

  /** Validation timestamp */
  validatedAt?: string;

  /** Validation errors */
  validationErrors: string[];

  /** Validation warnings */
  validationWarnings: string[];

  // ─── Hololand Integration ────────────────────────────────────────────────
  /** Hololand-specific metadata */
  hololand?: {
    /** Asset is available on Hololand CDN */
    onCDN: boolean;

    /** CDN region availability */
    cdnRegions?: string[];

    /** Streaming enabled */
    streamingEnabled: boolean;

    /** Preload priority (0-10) */
    preloadPriority?: number;

    /** Cache policy */
    cachePolicy?: 'immutable' | 'stale-while-revalidate' | 'no-cache';

    /** Max cache age (seconds) */
    maxCacheAge?: number;
  };

  // ─── Custom Data ─────────────────────────────────────────────────────────
  /** Custom metadata fields */
  custom?: Record<string, unknown>;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create empty asset metadata with defaults
 */
export function createAssetMetadata(
  partial: Partial<AssetMetadata> &
    Pick<AssetMetadata, 'id' | 'name' | 'format' | 'assetType' | 'sourcePath'>
): AssetMetadata {
  const now = new Date().toISOString();

  return {
    // Required fields
    id: partial.id,
    name: partial.name,
    format: partial.format,
    assetType: partial.assetType,
    sourcePath: partial.sourcePath,

    // Defaults
    displayName: partial.displayName ?? partial.name,
    description: partial.description,
    mimeType: partial.mimeType ?? getMimeType(partial.format),
    extension: partial.extension ?? partial.format,
    version: partial.version ?? '1.0.0',
    platformCompatibility: partial.platformCompatibility ?? {
      webgl: true,
      webgl2: true,
      webgpu: false,
    },
    fileSize: partial.fileSize ?? 0,
    estimatedGPUMemory: partial.estimatedGPUMemory ?? 0,
    estimatedCPUMemory: partial.estimatedCPUMemory ?? 0,
    estimatedLoadTime: partial.estimatedLoadTime ?? 0,
    tags: partial.tags ?? [],
    semanticTags: partial.semanticTags ?? {},
    dependencies: partial.dependencies ?? [],
    textureDependencies: partial.textureDependencies ?? [],
    shaderDependencies: partial.shaderDependencies ?? [],
    sourceFile: partial.sourceFile ?? partial.sourcePath,
    sourceHash: partial.sourceHash ?? '',
    createdAt: partial.createdAt ?? now,
    modifiedAt: partial.modifiedAt ?? now,
    optimizations: partial.optimizations ?? [],
    isOptimized: partial.isOptimized ?? false,
    validated: partial.validated ?? false,
    validationErrors: partial.validationErrors ?? [],
    validationWarnings: partial.validationWarnings ?? [],
  };
}

/**
 * Get MIME type for asset format
 */
export function getMimeType(format: AssetFormat): string {
  const mimeTypes: Record<AssetFormat, string> = {
    gltf: 'model/gltf+json',
    glb: 'model/gltf-binary',
    fbx: 'application/octet-stream',
    usd: 'model/vnd.usd+zip',
    usda: 'model/vnd.usda',
    usdc: 'model/vnd.usdc',
    usdz: 'model/vnd.usdz+zip',
    obj: 'model/obj',
    stl: 'model/stl',
    ply: 'application/x-ply',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    exr: 'image/x-exr',
    hdr: 'image/vnd.radiance',
    ktx2: 'image/ktx2',
    basis: 'image/x-basis',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
    holo: 'text/x-holoscript',
    hsplus: 'text/x-holoscript-plus',
    hs: 'text/x-holoscript',
  };

  return mimeTypes[format] ?? 'application/octet-stream';
}

/**
 * Infer asset type from format
 */
export function inferAssetType(format: AssetFormat): AssetType {
  const typeMap: Record<AssetFormat, AssetType> = {
    gltf: 'model',
    glb: 'model',
    fbx: 'model',
    usd: 'scene',
    usda: 'scene',
    usdc: 'scene',
    usdz: 'scene',
    obj: 'model',
    stl: 'model',
    ply: 'model',
    png: 'texture',
    jpg: 'texture',
    jpeg: 'texture',
    webp: 'texture',
    avif: 'texture',
    exr: 'texture',
    hdr: 'texture',
    ktx2: 'texture',
    basis: 'texture',
    mp3: 'audio',
    ogg: 'audio',
    wav: 'audio',
    mp4: 'video',
    webm: 'video',
    holo: 'scene',
    hsplus: 'script',
    hs: 'script',
  };

  return typeMap[format] ?? 'data';
}

/**
 * Estimate memory usage from file size and format
 */
export function estimateMemoryUsage(
  fileSize: number,
  format: AssetFormat,
  assetType: AssetType
): { gpu: number; cpu: number } {
  // Textures typically decompress to ~4x their file size in GPU memory
  if (assetType === 'texture') {
    return {
      gpu: fileSize * 4,
      cpu: fileSize,
    };
  }

  // Models have vertex buffers in GPU, plus CPU-side scene graph
  if (assetType === 'model' || assetType === 'scene') {
    return {
      gpu: fileSize * 2,
      cpu: fileSize * 1.5,
    };
  }

  // Audio/video stay mostly in CPU memory
  if (assetType === 'audio' || assetType === 'video') {
    return {
      gpu: 0,
      cpu: fileSize,
    };
  }

  return {
    gpu: 0,
    cpu: fileSize,
  };
}
