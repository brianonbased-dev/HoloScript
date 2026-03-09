/**
 * @fileoverview @platform() Conditional Compilation
 * @module @holoscript/core/compiler/platform
 *
 * Enables per-form-factor trait variants and code branches.
 * HoloScript objects can declare platform-specific behaviors that
 * are resolved at compile time — dead code elimination for
 * non-target platforms.
 *
 * Platform hierarchy:
 *   vr → quest3, pcvr, visionos, android-xr
 *   ar → visionos-ar, android-xr-ar, webxr
 *   mobile → ios, android
 *   desktop → windows, macos, linux, web
 *   automotive → android-auto, carplay
 *   wearable → watchos, wearos
 *
 * @version 1.0.0
 */

// =============================================================================
// PLATFORM DEFINITIONS
// =============================================================================

/** Specific platform targets */
export type PlatformTarget =
  // VR
  | 'quest3'
  | 'pcvr'
  | 'visionos'
  | 'android-xr'
  // AR
  | 'visionos-ar'
  | 'android-xr-ar'
  | 'webxr'
  // Mobile
  | 'ios'
  | 'android'
  // Desktop
  | 'windows'
  | 'macos'
  | 'linux'
  | 'web'
  // Automotive
  | 'android-auto'
  | 'carplay'
  // Wearable
  | 'watchos'
  | 'wearos';

/** Platform category (form factor) */
export type PlatformCategory = 'vr' | 'ar' | 'mobile' | 'desktop' | 'automotive' | 'wearable';

/** Map categories to their member platforms */
export const PLATFORM_CATEGORIES: Record<PlatformCategory, PlatformTarget[]> = {
  vr: ['quest3', 'pcvr', 'visionos', 'android-xr'],
  ar: ['visionos-ar', 'android-xr-ar', 'webxr'],
  mobile: ['ios', 'android'],
  desktop: ['windows', 'macos', 'linux', 'web'],
  automotive: ['android-auto', 'carplay'],
  wearable: ['watchos', 'wearos'],
};

/** All valid platform targets (flattened) */
export const ALL_PLATFORMS: PlatformTarget[] = Object.values(
  PLATFORM_CATEGORIES
).flat() as PlatformTarget[];

/** Get the category of a platform */
export function platformCategory(target: PlatformTarget): PlatformCategory {
  for (const [cat, platforms] of Object.entries(PLATFORM_CATEGORIES)) {
    if ((platforms as string[]).includes(target)) return cat as PlatformCategory;
  }
  return 'desktop'; // fallback
}

// =============================================================================
// PLATFORM CAPABILITIES
// =============================================================================

/** Capabilities available per platform */
export interface PlatformCapabilities {
  spatialTracking: boolean;
  handTracking: boolean;
  eyeTracking: boolean;
  haptics: boolean;
  spatialAudio: boolean;
  gpu3D: boolean;
  arCamera: boolean;
  gps: boolean;
  npu: boolean; // Neural processing unit
  webxrSupport: boolean;
  // Frame budget
  frameBudgetMs: number;
  agentBudgetMs: number;
  computeModel: 'edge-first' | 'cloud-first' | 'safety-critical';
}

/** Per-platform capability profiles */
export const PLATFORM_CAPABILITIES: Record<PlatformTarget, PlatformCapabilities> = {
  quest3: {
    spatialTracking: true,
    handTracking: true,
    eyeTracking: true,
    haptics: true,
    spatialAudio: true,
    gpu3D: true,
    arCamera: true,
    gps: false,
    npu: true,
    webxrSupport: true,
    frameBudgetMs: 11.1,
    agentBudgetMs: 5,
    computeModel: 'edge-first',
  },
  pcvr: {
    spatialTracking: true,
    handTracking: true,
    eyeTracking: true,
    haptics: true,
    spatialAudio: true,
    gpu3D: true,
    arCamera: false,
    gps: false,
    npu: false,
    webxrSupport: true,
    frameBudgetMs: 11.1,
    agentBudgetMs: 5,
    computeModel: 'edge-first',
  },
  visionos: {
    spatialTracking: true,
    handTracking: true,
    eyeTracking: true,
    haptics: false,
    spatialAudio: true,
    gpu3D: true,
    arCamera: true,
    gps: false,
    npu: true,
    webxrSupport: false,
    frameBudgetMs: 11.1,
    agentBudgetMs: 5,
    computeModel: 'edge-first',
  },
  'android-xr': {
    spatialTracking: true,
    handTracking: true,
    eyeTracking: true,
    haptics: true,
    spatialAudio: true,
    gpu3D: true,
    arCamera: true,
    gps: true,
    npu: true,
    webxrSupport: true,
    frameBudgetMs: 11.1,
    agentBudgetMs: 5,
    computeModel: 'edge-first',
  },
  'visionos-ar': {
    spatialTracking: true,
    handTracking: true,
    eyeTracking: true,
    haptics: false,
    spatialAudio: true,
    gpu3D: true,
    arCamera: true,
    gps: true,
    npu: true,
    webxrSupport: false,
    frameBudgetMs: 16.6,
    agentBudgetMs: 10,
    computeModel: 'edge-first',
  },
  'android-xr-ar': {
    spatialTracking: true,
    handTracking: true,
    eyeTracking: false,
    haptics: true,
    spatialAudio: true,
    gpu3D: true,
    arCamera: true,
    gps: true,
    npu: true,
    webxrSupport: true,
    frameBudgetMs: 16.6,
    agentBudgetMs: 10,
    computeModel: 'edge-first',
  },
  webxr: {
    spatialTracking: true,
    handTracking: false,
    eyeTracking: false,
    haptics: false,
    spatialAudio: false,
    gpu3D: true,
    arCamera: true,
    gps: false,
    npu: false,
    webxrSupport: true,
    frameBudgetMs: 16.6,
    agentBudgetMs: 15,
    computeModel: 'cloud-first',
  },
  ios: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: true,
    spatialAudio: false,
    gpu3D: true,
    arCamera: true,
    gps: true,
    npu: true,
    webxrSupport: false,
    frameBudgetMs: 16.6,
    agentBudgetMs: 100,
    computeModel: 'cloud-first',
  },
  android: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: true,
    spatialAudio: false,
    gpu3D: true,
    arCamera: true,
    gps: true,
    npu: true,
    webxrSupport: true,
    frameBudgetMs: 16.6,
    agentBudgetMs: 100,
    computeModel: 'cloud-first',
  },
  windows: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: false,
    spatialAudio: false,
    gpu3D: true,
    arCamera: false,
    gps: false,
    npu: false,
    webxrSupport: true,
    frameBudgetMs: 16.6,
    agentBudgetMs: 200,
    computeModel: 'cloud-first',
  },
  macos: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: false,
    spatialAudio: false,
    gpu3D: true,
    arCamera: false,
    gps: false,
    npu: true,
    webxrSupport: true,
    frameBudgetMs: 16.6,
    agentBudgetMs: 200,
    computeModel: 'cloud-first',
  },
  linux: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: false,
    spatialAudio: false,
    gpu3D: true,
    arCamera: false,
    gps: false,
    npu: false,
    webxrSupport: true,
    frameBudgetMs: 16.6,
    agentBudgetMs: 200,
    computeModel: 'cloud-first',
  },
  web: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: false,
    spatialAudio: false,
    gpu3D: true,
    arCamera: false,
    gps: false,
    npu: false,
    webxrSupport: true,
    frameBudgetMs: 16.6,
    agentBudgetMs: 200,
    computeModel: 'cloud-first',
  },
  'android-auto': {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: false,
    spatialAudio: true,
    gpu3D: false,
    arCamera: false,
    gps: true,
    npu: false,
    webxrSupport: false,
    frameBudgetMs: 30,
    agentBudgetMs: 15,
    computeModel: 'safety-critical',
  },
  carplay: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: false,
    spatialAudio: true,
    gpu3D: false,
    arCamera: false,
    gps: true,
    npu: false,
    webxrSupport: false,
    frameBudgetMs: 30,
    agentBudgetMs: 15,
    computeModel: 'safety-critical',
  },
  watchos: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: true,
    spatialAudio: false,
    gpu3D: false,
    arCamera: false,
    gps: true,
    npu: true,
    webxrSupport: false,
    frameBudgetMs: 33.3,
    agentBudgetMs: 50,
    computeModel: 'cloud-first',
  },
  wearos: {
    spatialTracking: false,
    handTracking: false,
    eyeTracking: false,
    haptics: true,
    spatialAudio: false,
    gpu3D: false,
    arCamera: false,
    gps: true,
    npu: false,
    webxrSupport: false,
    frameBudgetMs: 33.3,
    agentBudgetMs: 50,
    computeModel: 'cloud-first',
  },
};

// =============================================================================
// CONDITIONAL COMPILATION
// =============================================================================

/** A platform condition — what platforms a code block applies to */
export interface PlatformCondition {
  /** Include these specific platforms */
  include?: PlatformTarget[];
  /** Include all platforms in these categories */
  includeCategories?: PlatformCategory[];
  /** Exclude these specific platforms */
  exclude?: PlatformTarget[];
  /** Require these capabilities */
  requireCapabilities?: (keyof PlatformCapabilities)[];
}

/** A platform-conditional code block (AST node decoration) */
export interface PlatformBlock<T = unknown> {
  condition: PlatformCondition;
  body: T;
}

/** Agent embodiment type per form factor */
export type EmbodimentType =
  | 'Avatar3D'
  | 'SpatialPersona'
  | 'VoiceHUD'
  | 'UI2D'
  | 'FullGUI'
  | 'WebXR';

/** Map platform categories to default embodiment */
export const DEFAULT_EMBODIMENT: Record<PlatformCategory, EmbodimentType> = {
  vr: 'Avatar3D',
  ar: 'SpatialPersona',
  mobile: 'UI2D',
  desktop: 'FullGUI',
  automotive: 'VoiceHUD',
  wearable: 'UI2D',
};

/**
 * Resolve which platforms match a condition.
 */
export function resolvePlatforms(condition: PlatformCondition): PlatformTarget[] {
  let platforms = new Set<PlatformTarget>();

  // Start with includes
  if (condition.include) {
    for (const p of condition.include) platforms.add(p);
  }
  if (condition.includeCategories) {
    for (const cat of condition.includeCategories) {
      for (const p of PLATFORM_CATEGORIES[cat]) platforms.add(p);
    }
  }
  // If no includes specified, start with all
  if (!condition.include && !condition.includeCategories) {
    for (const p of ALL_PLATFORMS) platforms.add(p);
  }

  // Apply excludes
  if (condition.exclude) {
    for (const p of condition.exclude) platforms.delete(p);
  }

  // Filter by required capabilities
  if (condition.requireCapabilities) {
    platforms = new Set(
      [...platforms].filter((p) => {
        const caps = PLATFORM_CAPABILITIES[p];
        return condition.requireCapabilities!.every((cap) => {
          const val = caps[cap];
          return typeof val === 'boolean' ? val : Number(val) > 0;
        });
      })
    );
  }

  return [...platforms];
}

/**
 * Check if a target platform matches a condition.
 */
export function matchesPlatform(target: PlatformTarget, condition: PlatformCondition): boolean {
  return resolvePlatforms(condition).includes(target);
}

/**
 * Select the matching block for a target platform from a list of conditional blocks.
 * Returns the first matching block, or undefined if none match.
 */
export function selectBlock<T>(target: PlatformTarget, blocks: PlatformBlock<T>[]): T | undefined {
  for (const block of blocks) {
    if (matchesPlatform(target, block.condition)) return block.body;
  }
  return undefined;
}

/**
 * Dead code elimination: given a target platform, filter an array of
 * platform-conditional blocks to only those that apply.
 */
export function eliminateDeadCode<T>(target: PlatformTarget, blocks: PlatformBlock<T>[]): T[] {
  return blocks.filter((b) => matchesPlatform(target, b.condition)).map((b) => b.body);
}

/**
 * Get the embodiment type for a platform.
 */
export function embodimentFor(target: PlatformTarget): EmbodimentType {
  return DEFAULT_EMBODIMENT[platformCategory(target)];
}

/**
 * Get the agent compute budget for a platform (ms).
 */
export function agentBudgetFor(target: PlatformTarget): number {
  return PLATFORM_CAPABILITIES[target].agentBudgetMs;
}

/**
 * Check if a platform supports a specific capability.
 */
export function hasCapability(target: PlatformTarget, cap: keyof PlatformCapabilities): boolean {
  const val = PLATFORM_CAPABILITIES[target][cap];
  return typeof val === 'boolean' ? val : Number(val) > 0;
}
