/**
 * ModalitySelector — Automatic Modality Transliteration
 *
 * Given a device's platform target (or raw capabilities), selects the optimal
 * output modality: which ExportTarget to compile to, which embodiment the
 * agent/user takes, and what rendering strategy to use.
 *
 * This is the missing bridge between:
 *   - PlatformConditional (knows what devices can do)
 *   - CrossRealityTraitRegistry (knows which embodiment fits)
 *   - ExportManager (knows which compiler to invoke)
 *
 * The key principle: **transliteration, not degradation.**
 * A phone doesn't get a broken 3D box. It gets a Native 2D UI that preserves
 * the full semantic graph. Traits remain intact; the lens pivots.
 *
 * @module @holoscript/core/compiler/platform/ModalitySelector
 * @version 1.0.0
 */

import type { PlatformTarget, PlatformCategory, PlatformCapabilities } from './PlatformConditional';
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_CATEGORIES,
  platformCategory,
} from './PlatformConditional';
import type { CompileTimeEmbodiment } from './CrossRealityTraitRegistry';
import {
  CATEGORY_DEFAULT_EMBODIMENT,
  PLATFORM_EMBODIMENT_OVERRIDES,
} from './CrossRealityTraitRegistry';
import type { ExportTarget } from '../CircuitBreaker';
import type { JsonLdSceneGraph } from '../SemanticSceneGraph';

// =============================================================================
// TYPES
// =============================================================================

/** The result of modality selection */
export interface ModalitySelection {
  /** The platform we're compiling for */
  platform: PlatformTarget;
  /** The platform category (form factor) */
  category: PlatformCategory;
  /** The embodiment type the agent/user takes */
  embodiment: CompileTimeEmbodiment;
  /** The primary ExportTarget for compilation */
  exportTarget: ExportTarget;
  /** Fallback ExportTarget if primary fails */
  fallbackTarget: ExportTarget | null;
  /** Device capabilities used to make this decision */
  capabilities: PlatformCapabilities;
  /** Whether this device can handle spatial (3D) rendering locally */
  canRenderSpatial: boolean;
  /** Whether this device should receive streamed frames instead */
  recommendStreaming: boolean;
  /** Rendering budget constraints */
  budget: {
    frameBudgetMs: number;
    agentBudgetMs: number;
    computeModel: 'edge-first' | 'cloud-first' | 'safety-critical';
  };
  /** Reasoning trace for debugging / agent introspection */
  reasoning: string[];
}

/** Options for modality selection */
export interface ModalitySelectorOptions {
  /** Prefer streaming over local rendering when possible */
  preferStreaming?: boolean;
  /** Force a specific embodiment (overrides auto-detection) */
  forceEmbodiment?: CompileTimeEmbodiment;
  /** Force a specific export target */
  forceExportTarget?: ExportTarget;
  /** Minimum GPU capability required for spatial rendering */
  spatialGpuThreshold?: boolean;
}

// =============================================================================
// EMBODIMENT → EXPORT TARGET MAPPING
// =============================================================================

/**
 * Maps embodiment types to their primary and fallback ExportTargets.
 * This is the core of modality transliteration: same semantic graph,
 * different output modality based on what the device can actually render.
 */
const EMBODIMENT_TO_TARGET: Record<
  CompileTimeEmbodiment,
  { primary: ExportTarget; fallback: ExportTarget | null }
> = {
  FullAvatar: { primary: 'openxr', fallback: 'r3f' },
  FloatingAgent: { primary: 'visionos', fallback: 'r3f' },
  UI2D: { primary: 'native-2d', fallback: 'r3f' },
  VoiceOnly: { primary: 'native-2d', fallback: null },
  UIMinimal: { primary: 'native-2d', fallback: null },
  VoiceHUD: { primary: 'native-2d', fallback: null },
  Haptic: { primary: 'native-2d', fallback: null },
  GlassOverlay: { primary: 'android-xr', fallback: 'native-2d' },
};

/**
 * Platform-specific export target overrides.
 * Some platforms need specific compilers even if the embodiment says otherwise.
 */
const PLATFORM_TARGET_OVERRIDES: Partial<Record<PlatformTarget, ExportTarget>> = {
  quest3: 'openxr',
  pcvr: 'openxr',
  visionos: 'visionos',
  'android-xr': 'android-xr',
  'visionos-ar': 'visionos',
  'android-xr-ar': 'android-xr',
  webxr: 'r3f',
  ios: 'native-2d',
  android: 'native-2d',
  windows: 'r3f',
  macos: 'r3f',
  linux: 'r3f',
  web: 'r3f',
  'android-auto': 'native-2d',
  carplay: 'native-2d',
  watchos: 'native-2d',
  wearos: 'native-2d',
};

// =============================================================================
// MODALITY SELECTOR
// =============================================================================

/**
 * Select the optimal output modality for a given platform.
 *
 * Decision chain:
 *   1. Resolve platform capabilities
 *   2. Determine embodiment (category default → platform override → force override)
 *   3. Map embodiment → ExportTarget (with platform-specific overrides)
 *   4. Check if spatial rendering is feasible
 *   5. Recommend streaming if device can't render locally
 *
 * @example
 * ```typescript
 * const result = selectModality('quest3');
 * // → { embodiment: 'FullAvatar', exportTarget: 'openxr', canRenderSpatial: true }
 *
 * const result = selectModality('ios');
 * // → { embodiment: 'UI2D', exportTarget: 'native-2d', canRenderSpatial: false, recommendStreaming: true }
 *
 * const result = selectModality('android-auto');
 * // → { embodiment: 'VoiceOnly', exportTarget: 'native-2d', canRenderSpatial: false }
 * ```
 */
export function selectModality(
  platform: PlatformTarget,
  options: ModalitySelectorOptions = {}
): ModalitySelection {
  const reasoning: string[] = [];
  const capabilities = PLATFORM_CAPABILITIES[platform];
  const category = platformCategory(platform);

  // 1. Resolve embodiment
  let embodiment: CompileTimeEmbodiment;
  if (options.forceEmbodiment) {
    embodiment = options.forceEmbodiment;
    reasoning.push(`Embodiment forced to ${embodiment} by caller`);
  } else if (platform in PLATFORM_EMBODIMENT_OVERRIDES) {
    embodiment =
      PLATFORM_EMBODIMENT_OVERRIDES[platform as keyof typeof PLATFORM_EMBODIMENT_OVERRIDES]!;
    reasoning.push(
      `Embodiment ${embodiment} from platform-specific override for ${platform}`
    );
  } else {
    embodiment = CATEGORY_DEFAULT_EMBODIMENT[category];
    reasoning.push(
      `Embodiment ${embodiment} from category default for ${category}`
    );
  }

  // 2. Resolve export target
  let exportTarget: ExportTarget;
  let fallbackTarget: ExportTarget | null;

  if (options.forceExportTarget) {
    exportTarget = options.forceExportTarget;
    fallbackTarget = EMBODIMENT_TO_TARGET[embodiment]?.fallback ?? null;
    reasoning.push(`ExportTarget forced to ${exportTarget} by caller`);
  } else if (platform in PLATFORM_TARGET_OVERRIDES) {
    exportTarget = PLATFORM_TARGET_OVERRIDES[platform]!;
    fallbackTarget = EMBODIMENT_TO_TARGET[embodiment]?.fallback ?? null;
    reasoning.push(
      `ExportTarget ${exportTarget} from platform-specific override for ${platform}`
    );
  } else {
    const mapping = EMBODIMENT_TO_TARGET[embodiment];
    exportTarget = mapping.primary;
    fallbackTarget = mapping.fallback;
    reasoning.push(
      `ExportTarget ${exportTarget} from embodiment mapping for ${embodiment}`
    );
  }

  // 3. Determine spatial rendering capability
  const canRenderSpatial =
    capabilities.gpu3D && capabilities.frameBudgetMs <= 16.6;
  reasoning.push(
    canRenderSpatial
      ? `Device can render spatial: gpu3D=${capabilities.gpu3D}, frameBudget=${capabilities.frameBudgetMs}ms`
      : `Device cannot render spatial locally: gpu3D=${capabilities.gpu3D}, frameBudget=${capabilities.frameBudgetMs}ms`
  );

  // 4. Streaming recommendation
  const recommendStreaming =
    !canRenderSpatial &&
    embodiment !== 'VoiceOnly' &&
    embodiment !== 'Haptic' &&
    (options.preferStreaming ?? false);

  if (recommendStreaming) {
    reasoning.push(
      'Recommending neural streaming: device lacks spatial GPU but caller prefers streamed spatial view'
    );
  }

  return {
    platform,
    category,
    embodiment,
    exportTarget,
    fallbackTarget,
    capabilities,
    canRenderSpatial,
    recommendStreaming,
    budget: {
      frameBudgetMs: capabilities.frameBudgetMs,
      agentBudgetMs: capabilities.agentBudgetMs,
      computeModel: capabilities.computeModel,
    },
    reasoning,
  };
}

/**
 * Select modalities for ALL platforms simultaneously.
 * Returns a map of platform → ModalitySelection, useful for generating
 * multi-target compilation plans or cross-reality validation.
 */
export function selectModalityForAll(
  options: ModalitySelectorOptions = {}
): Map<PlatformTarget, ModalitySelection> {
  const results = new Map<PlatformTarget, ModalitySelection>();
  for (const platform of Object.keys(PLATFORM_CAPABILITIES) as PlatformTarget[]) {
    results.set(platform, selectModality(platform, options));
  }
  return results;
}

/**
 * Given a set of required traits, find the best platform category
 * that can natively support all of them.
 */
export function bestCategoryForTraits(
  requiredCapabilities: Partial<PlatformCapabilities>
): PlatformCategory[] {
  const categories: PlatformCategory[] = [];

  for (const [cat, platforms] of Object.entries(PLATFORM_CATEGORIES)) {
    const canSupport = platforms.some((platform) => {
      const caps = PLATFORM_CAPABILITIES[platform as PlatformTarget];
      return Object.entries(requiredCapabilities).every(([key, required]) => {
        if (typeof required === 'boolean') return !required || caps[key as keyof PlatformCapabilities] === true;
        if (typeof required === 'number') return (caps[key as keyof PlatformCapabilities] as number) <= required;
        return true;
      });
    });
    if (canSupport) categories.push(cat as PlatformCategory);
  }

  return categories;
}

/**
 * Analyze a semantic scene graph to infer required platform capabilities.
 * @param graph The JSON-LD scene graph
 * @returns Minimum required capabilities to fully experience the scene
 */
export function inferCapabilitiesFromGraph(graph: JsonLdSceneGraph): Partial<PlatformCapabilities> {
  let needs3D = false;
  let needsAudio = false;
  let hasHaptics = false;
  let objectCount = 0;
  
  const inspectNode = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    
    const type = node['@type'];
    if (type === 'hs:Object' || type === 'hs:SpatialGroup' || 
        type === 'hs:Light' || type === 'hs:Camera' || type === 'hs:Shape') {
      needs3D = true;
      objectCount++;
    }
    if (type === 'hs:Audio') {
      needsAudio = true;
    }
    
    // Check traits
    const traits = node['hs:traits'];
    if (Array.isArray(traits)) {
      for (const t of traits) {
        const tId = typeof t === 'string' ? t : t['@id'];
        if (tId) {
          if (tId.includes('physics') || tId.includes('visual') || tId.includes('spatial')) {
            needs3D = true;
          }
          if (tId.includes('haptic') || tId.includes('touch')) {
            hasHaptics = true;
          }
        }
      }
    }
    
    // Recurse common child arrays
    ['hs:objects', 'hs:spatialGroups', 'hs:lights', 'hs:audio', 'hs:camera', 'hs:shapes'].forEach(key => {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(inspectNode);
      } else if (child && typeof child === 'object') {
        inspectNode(child);
      }
    });
  };

  inspectNode(graph);

  const caps: Partial<PlatformCapabilities> = {};
  if (needs3D) caps.gpu3D = true;
  if (needsAudio) caps.spatialAudio = true;
  
  // Rule: complex scenes (e.g. >50 objects) demand strict frame budget (90Hz -> 11.1ms)
  if (objectCount > 50) {
    caps.frameBudgetMs = 11.1;
  }
  if (hasHaptics) {
    caps.haptics = true;
  }
  
  return caps;
}

/**
 * Automatically infer optimal modality given a semantic scene graph and optional platform target.
 * If a target is provided, it validates the capabilities and transliterates (e.g. forces UI2D if device lacks 3D).
 * If no target is provided, it returns the minimum viable primary ModalitySelection.
 * 
 * @param graph The semantic JSON-LD scene graph
 * @param platform Optional specific platform to target
 * @param options Additional fallback/override options
 */
export function inferModalityFromGraph(
  graph: JsonLdSceneGraph,
  platform?: PlatformTarget,
  options: ModalitySelectorOptions = {}
): ModalitySelection | null {
  const caps = inferCapabilitiesFromGraph(graph);
  
  if (platform) {
    const platformCaps = PLATFORM_CAPABILITIES[platform];
    const opts = { ...options };
    
    // Transliteration logic: scene needs 3D, but device lacks it
    if (caps.gpu3D && !platformCaps.gpu3D) {
      if (!opts.forceEmbodiment) {
        // Degrade embodiment gracefully to 2D UI list view of scene graph
        opts.forceEmbodiment = 'UI2D';
      }
      if (opts.preferStreaming === undefined) {
        // Recommend neural streaming so they can see the 3D representation via video
        opts.preferStreaming = true; 
      }
    }
    
    const selection = selectModality(platform, opts);
    
    // Inject inference trace
    selection.reasoning.unshift(`Inferred scene dependencies: 3D=${!!caps.gpu3D}, Objects=${Object.keys(caps).length}`);
    return selection;
  }
  
  // Find best generic category
  const categories = bestCategoryForTraits(caps);
  if (categories.length > 0) {
    const primaryCat = categories[0];
    const idealPlatform = PLATFORM_CATEGORIES[primaryCat][0];
    const selection = selectModality(idealPlatform as PlatformTarget, options);
    selection.reasoning.unshift(`Auto-inferred ideal platform category: ${primaryCat}`);
    return selection;
  }
  
  return null;
}
