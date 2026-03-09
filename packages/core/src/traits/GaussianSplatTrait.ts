/**
 * GaussianSplat Trait
 *
 * Load/render 3D Gaussian Splatting scenes with distance-based sorting,
 * view-dependent spherical harmonics, octree-based LOD, temporal modes
 * (static/4D/streaming), Gaussian budget management, and SPZ v2 compression.
 *
 * @version 4.1.0
 *
 * Research references:
 *   W.031 - SPZ compression (90% size reduction, KHR_spz_gaussian_splats_compression)
 *   W.032 - Octree-GS LOD (anchor-based level selection, TPAMI 2025)
 *   W.034 - VR Gaussian budget (~180K total on Quest 3, 60K per avatar via SqueezeMe)
 *   G.030.04 - SPZ v2 quaternion encoding (smallest-three-components, 10-bit signed)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type SplatFormat = 'ply' | 'splat' | 'compressed' | 'spz';
type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
type SortMode = 'distance' | 'depth' | 'radix';
type LODMode = 'none' | 'octree' | 'distance';
type TemporalMode = 'static' | '4d' | 'streaming';
type SPZVersion = '1.0' | '2.0';
type SPZQuaternionEncoding = 'default' | 'smallest_three';

interface LODConfig {
  /** Octree hierarchy depth (0 = flat, 4-8 typical for city-scale) */
  octree_depth: number;
  /** LOD selection strategy */
  mode: LODMode;
  /** Camera distance thresholds per LOD level (ascending order, in world units) */
  anchor_thresholds: number[];
}

interface GaussianBudget {
  /** Hard ceiling for total Gaussians in the scene (e.g., 180000 for Quest 3 at 72fps) */
  total_cap: number;
  /** Gaussian reservation per avatar (e.g., 60000 after SqueezeMe UV-space reduction) */
  per_avatar_reservation: number;
}

interface SPZConfig {
  /** SPZ format version (v2.0 required for production per G.030.04) */
  version: SPZVersion;
  /** Quaternion encoding strategy (v2 uses smallest_three with 10-bit signed integers) */
  quaternion_encoding: SPZQuaternionEncoding;
}

interface GaussianSplatState {
  isLoaded: boolean;
  isLoading: boolean;
  splatCount: number;
  visibleSplats: number;
  memoryUsage: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  renderHandle: unknown;
  lastCameraPosition: { x: number; y: number; z: number } | null;
  needsSort: boolean;
  /** Current LOD level index (0 = highest detail) */
  currentLODLevel: number;
  /** Total Gaussians currently allocated against the budget */
  gaussianBudgetUsed: number;
  /** Current temporal frame index for 4D/streaming modes */
  temporalFrameIndex: number;
}

interface GaussianSplatConfig {
  source: string;
  format: SplatFormat;
  quality: QualityLevel;
  max_splats: number;
  sort_mode: SortMode;
  streaming: boolean;
  compression: boolean;
  sh_degree: number; // 0-3 spherical harmonics degree
  cull_invisible: boolean;
  alpha_threshold: number;
  scale_modifier: number;
  /** LOD configuration for octree-based level-of-detail (W.032) */
  lod: LODConfig;
  /** Temporal rendering mode: static, 4D volumetric, or streaming (W.033/W.036) */
  temporal_mode: TemporalMode;
  /** Gaussian budget management for VR hardware limits (W.034) */
  gaussian_budget: GaussianBudget;
  /** SPZ compression configuration (W.031, G.030.04) */
  spz: SPZConfig;
}

// =============================================================================
// HANDLER
// =============================================================================

export const gaussianSplatHandler: TraitHandler<GaussianSplatConfig> = {
  name: 'gaussian_splat' as any,

  defaultConfig: {
    source: '',
    format: 'ply',
    quality: 'medium',
    max_splats: 1000000,
    sort_mode: 'distance',
    streaming: false,
    compression: true,
    sh_degree: 3,
    cull_invisible: true,
    alpha_threshold: 0.01,
    scale_modifier: 1.0,
    lod: {
      octree_depth: 0,
      mode: 'none',
      anchor_thresholds: [],
    },
    temporal_mode: 'static',
    gaussian_budget: {
      total_cap: 0,
      per_avatar_reservation: 0,
    },
    spz: {
      version: '2.0',
      quaternion_encoding: 'smallest_three',
    },
  },

  onAttach(node, config, context) {
    const state: GaussianSplatState = {
      isLoaded: false,
      isLoading: false,
      splatCount: 0,
      visibleSplats: 0,
      memoryUsage: 0,
      boundingBox: { min: [0, 0, 0], max: [0, 0, 0] },
      renderHandle: null,
      lastCameraPosition: null,
      needsSort: false,
      currentLODLevel: 0,
      gaussianBudgetUsed: 0,
      temporalFrameIndex: 0,
    };
    (node as any).__gaussianSplatState = state;

    if (config.source) {
      loadSplatScene(node, state, config, context);
    }
  },

  onDetach(node, config, context) {
    const state = (node as any).__gaussianSplatState as GaussianSplatState;
    if (state?.renderHandle) {
      context.emit?.('splat_destroy', { node });
    }
    delete (node as any).__gaussianSplatState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__gaussianSplatState as GaussianSplatState;
    if (!state || !state.isLoaded) return;

    // Check if camera moved and needs resort
    const cameraPos = context.camera?.position;
    if (cameraPos && state.lastCameraPosition) {
      const dx = cameraPos.x - state.lastCameraPosition.x;
      const dy = cameraPos.y - state.lastCameraPosition.y;
      const dz = cameraPos.z - state.lastCameraPosition.z;
      const distMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distMoved > 0.1) {
        state.needsSort = true;
        state.lastCameraPosition = { ...cameraPos };
      }
    } else if (cameraPos) {
      state.lastCameraPosition = { ...cameraPos };
    }

    // Request sort if needed
    if (state.needsSort && config.sort_mode !== 'radix') {
      context.emit?.('splat_sort', {
        node,
        cameraPosition: state.lastCameraPosition,
        mode: config.sort_mode,
      });
      state.needsSort = false;
    }

    // LOD evaluation (W.032): select octree level based on camera distance
    if (config.lod.mode !== 'none' && cameraPos) {
      const lodLevel = computeLODLevel(cameraPos, state.boundingBox, config.lod);
      if (lodLevel !== state.currentLODLevel) {
        const previousLevel = state.currentLODLevel;
        state.currentLODLevel = lodLevel;
        context.emit?.('splat_lod_change', {
          node,
          previousLevel,
          currentLevel: lodLevel,
          mode: config.lod.mode,
        });
      }
    }

    // Gaussian budget enforcement (W.034)
    if (
      config.gaussian_budget.total_cap > 0 &&
      state.splatCount > config.gaussian_budget.total_cap
    ) {
      context.emit?.('splat_budget_exceeded', {
        node,
        current: state.splatCount,
        cap: config.gaussian_budget.total_cap,
        overage: state.splatCount - config.gaussian_budget.total_cap,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__gaussianSplatState as GaussianSplatState;
    if (!state) return;

    if (event.type === 'splat_load_complete') {
      state.isLoading = false;
      state.isLoaded = true;
      state.splatCount = event.splatCount as number;
      state.memoryUsage = event.memoryUsage as number;
      state.boundingBox = event.boundingBox as typeof state.boundingBox;
      state.renderHandle = event.renderHandle;
      state.needsSort = true;
      state.gaussianBudgetUsed = event.splatCount as number;

      context.emit?.('on_splat_loaded', {
        node,
        splatCount: state.splatCount,
        memoryUsage: state.memoryUsage,
      });
    } else if (event.type === 'splat_load_error') {
      state.isLoading = false;
      context.emit?.('on_splat_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'splat_load_progress') {
      context.emit?.('on_splat_progress', {
        node,
        progress: event.progress as number,
        loadedSplats: event.loadedSplats as number,
      });
    } else if (event.type === 'splat_visibility_update') {
      state.visibleSplats = event.visibleCount as number;
    } else if (event.type === 'splat_set_source') {
      const newSource = event.source as string;
      if (newSource !== config.source) {
        // Unload current
        if (state.renderHandle) {
          context.emit?.('splat_destroy', { node });
        }
        state.isLoaded = false;
        state.splatCount = 0;

        // Load new
        loadSplatScene(node, state, { ...config, source: newSource }, context);
      }
    } else if (event.type === 'splat_set_quality') {
      context.emit?.('splat_update_quality', {
        node,
        quality: event.quality as string,
      });
    } else if (event.type === 'splat_query') {
      context.emit?.('splat_info', {
        queryId: event.queryId,
        node,
        isLoaded: state.isLoaded,
        splatCount: state.splatCount,
        visibleSplats: state.visibleSplats,
        memoryUsage: state.memoryUsage,
        boundingBox: state.boundingBox,
        currentLODLevel: state.currentLODLevel,
        gaussianBudgetUsed: state.gaussianBudgetUsed,
        temporalFrameIndex: state.temporalFrameIndex,
      });

      // --- v4.1 Event Handlers ---
    } else if (event.type === 'splat_set_lod') {
      // Dynamically update LOD configuration
      const newMode = event.mode as LODMode | undefined;
      const newDepth = event.octree_depth as number | undefined;
      const newThresholds = event.anchor_thresholds as number[] | undefined;
      context.emit?.('splat_update_lod', {
        node,
        mode: newMode ?? config.lod.mode,
        octree_depth: newDepth ?? config.lod.octree_depth,
        anchor_thresholds: newThresholds ?? config.lod.anchor_thresholds,
      });
    } else if (event.type === 'splat_set_budget') {
      // Dynamically update Gaussian budget
      const newCap = event.total_cap as number | undefined;
      const newReservation = event.per_avatar_reservation as number | undefined;
      context.emit?.('splat_update_budget', {
        node,
        total_cap: newCap ?? config.gaussian_budget.total_cap,
        per_avatar_reservation: newReservation ?? config.gaussian_budget.per_avatar_reservation,
      });
    } else if (event.type === 'splat_set_temporal_mode') {
      // Switch temporal rendering mode
      const newMode = event.temporal_mode as TemporalMode;
      state.temporalFrameIndex = 0; // Reset frame index on mode change
      context.emit?.('splat_update_temporal', {
        node,
        temporal_mode: newMode,
        previousMode: config.temporal_mode,
      });
    } else if (event.type === 'splat_temporal_advance') {
      // Advance temporal frame index (4D/streaming modes)
      if (config.temporal_mode !== 'static') {
        state.temporalFrameIndex = event.frameIndex as number;
        context.emit?.('splat_temporal_frame', {
          node,
          frameIndex: state.temporalFrameIndex,
          temporal_mode: config.temporal_mode,
        });
      }
    }
  },
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Compute the appropriate LOD level based on camera distance to scene center.
 * Uses anchor_thresholds to determine which octree level to activate.
 * Lower levels = higher detail (closer to camera).
 */
function computeLODLevel(
  cameraPos: { x: number; y: number; z: number },
  boundingBox: { min: [number, number, number]; max: [number, number, number] },
  lod: LODConfig
): number {
  // Compute scene center from bounding box
  const cx = (boundingBox.min[0] + boundingBox.max[0]) / 2;
  const cy = (boundingBox.min[1] + boundingBox.max[1]) / 2;
  const cz = (boundingBox.min[2] + boundingBox.max[2]) / 2;

  const dx = cameraPos.x - cx;
  const dy = cameraPos.y - cy;
  const dz = cameraPos.z - cz;
  const distToCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Walk thresholds: each threshold defines the distance at which we step
  // to the next (coarser) LOD level
  const thresholds = lod.anchor_thresholds;
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (distToCenter > thresholds[i]) {
      level = i + 1;
    } else {
      break;
    }
  }

  return level;
}

function loadSplatScene(
  node: unknown,
  state: GaussianSplatState,
  config: GaussianSplatConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  state.isLoading = true;

  context.emit?.('splat_load', {
    node,
    source: config.source,
    format: config.format,
    maxSplats: config.max_splats,
    compression: config.compression,
    shDegree: config.sh_degree,
    streaming: config.streaming,
    alphaThreshold: config.alpha_threshold,
    scaleModifier: config.scale_modifier,
    // v4.1 fields
    lod: config.lod,
    temporalMode: config.temporal_mode,
    gaussianBudget: config.gaussian_budget,
    spz: config.spz,
  });
}

export default gaussianSplatHandler;
