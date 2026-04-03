/**
 * USD Trait
 *
 * OpenUSD (Universal Scene Description) import/export with layer composition,
 * variant sets, and time-sampled animation. Supports USDZ for Apple platforms.
 * Integrates with the HoloScript Asset System.
 *
 * @version 2.0.0
 */

import type { TraitHandler, TraitEvent, TraitContext } from './TraitTypes';
import type { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

export interface USDConfig {
  /** Source URL or asset ID */
  source: string;

  /** Specific layer to load (empty = root layer) */
  layer: string;

  /** Variant set to activate */
  variant_set: string;

  /** Variant selection within set */
  variant: string;

  /** Purpose filter (render, proxy, guide) */
  purpose: USDPurpose;

  /** Time code for time-sampled attributes */
  time_code: number;

  /** Payload loading strategy */
  payload_loading: 'eager' | 'lazy' | 'deferred';

  /** Enable USDZ AR features */
  enable_ar: boolean;

  /** AR anchor type */
  ar_anchor: 'plane' | 'face' | 'world' | 'image';

  /** Scale factor */
  scale: number;

  /** Up axis */
  up_axis: 'y' | 'z';

  /** Meters per unit */
  meters_per_unit: number;

  /** Enable skeletal animation */
  enable_skeletal: boolean;

  /** Enable blend shapes */
  enable_blend_shapes: boolean;

  /** Enable physics */
  enable_physics: boolean;

  /** Material conversion */
  material_conversion: 'preview' | 'materialx' | 'native';

  /** Shadow casting */
  cast_shadows: boolean;

  /** Shadow receiving */
  receive_shadows: boolean;

  /** Auto-play animation */
  auto_play: boolean;

  /** Loop animation */
  loop_animation: boolean;

  /** Animation frame rate */
  frame_rate: number;

  /** Streaming priority */
  streaming_priority: 'critical' | 'high' | 'normal' | 'low';

  /** Enable instancing */
  enable_instancing: boolean;

  /** Subdivision level */
  subdivision_level: number;
}

export type USDPurpose = 'default' | 'render' | 'proxy' | 'guide';

export interface USDState {
  /** Is the stage loaded? */
  isLoaded: boolean;

  /** Is currently loading? */
  isLoading: boolean;

  /** Load progress (0-1) */
  loadProgress: number;

  /** Layer stack */
  layerStack: USDLayer[];

  /** Root layer identifier */
  rootLayer: string;

  /** Available variant sets */
  variantSets: USDVariantSet[];

  /** Active variants */
  activeVariants: Map<string, string>;

  /** Time-sampled animation info */
  animation: USDAnimation | null;

  /** Current time code */
  currentTimeCode: number;

  /** Is playing animation */
  isPlaying: boolean;

  /** Skeleton info */
  skeleton: USDSkeleton | null;

  /** Blend shape targets */
  blendShapes: string[];

  /** Blend shape weights */
  blendWeights: Map<string, number>;

  /** Prims in stage */
  primCount: number;

  /** Mesh prims count */
  meshCount: number;

  /** Material prims count */
  materialCount: number;

  /** Bounding box */
  boundingBox: {
    min: Vector3;
    max: Vector3;
    center: Vector3;
    size: Vector3;
  } | null;

  /** Stage root */
  stageRoot: unknown;

  /** Scene hierarchy */
  hierarchy: USDPrim[];

  /** Stage metadata */
  metadata: USDStageMetadata | null;

  /** Error message if load failed */
  error?: string;

  /** Load timestamp */
  loadedAt?: number;

  /** File size in bytes */
  fileSize?: number;

  /** Is USDZ format */
  isUSDZ: boolean;
}

export interface USDLayer {
  identifier: string;
  displayName: string;
  isAnonymous: boolean;
  hasPayload: boolean;
  sublayers: string[];
  references: string[];
}

export interface USDVariantSet {
  name: string;
  variants: string[];
  default: string;
}

export interface USDAnimation {
  startTimeCode: number;
  endTimeCode: number;
  timeCodesPerSecond: number;
  framesPerSecond: number;
  hasTimeSamples: boolean;
  animatedPaths: string[];
}

export interface USDSkeleton {
  path: string;
  joints: string[];
  bindTransforms: Map<string, USDMatrix4>;
  restTransforms: Map<string, USDMatrix4>;
  topology: Map<string, string | null>; // joint -> parent
}

export interface USDMatrix4 {
  data: number[]; // 16 floats, column-major
}

export interface USDPrim {
  path: string;
  name: string;
  typeName: string;
  purpose: USDPurpose;
  visibility: 'inherited' | 'visible' | 'invisible';
  active: boolean;
  children: USDPrim[];
  hasPayload: boolean;
  variantSets: string[];
  attributes: Record<string, unknown>;
}

export interface USDStageMetadata {
  defaultPrim: string;
  upAxis: 'Y' | 'Z';
  metersPerUnit: number;
  startTimeCode: number;
  endTimeCode: number;
  timeCodesPerSecond: number;
  framesPerSecond: number;
  customLayerData: Record<string, unknown>;
  documentation?: string;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const defaultUSDConfig: USDConfig = {
  source: '',
  layer: '',
  variant_set: '',
  variant: '',
  purpose: 'default',
  time_code: 0,
  payload_loading: 'eager',
  enable_ar: false,
  ar_anchor: 'plane',
  scale: 1.0,
  up_axis: 'y',
  meters_per_unit: 1.0,
  enable_skeletal: true,
  enable_blend_shapes: true,
  enable_physics: false,
  material_conversion: 'preview',
  cast_shadows: true,
  receive_shadows: true,
  auto_play: false,
  loop_animation: true,
  frame_rate: 24,
  streaming_priority: 'normal',
  enable_instancing: true,
  subdivision_level: 0,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createInitialState(): USDState {
  return {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    layerStack: [],
    rootLayer: '',
    variantSets: [],
    activeVariants: new Map(),
    animation: null,
    currentTimeCode: 0,
    isPlaying: false,
    skeleton: null,
    blendShapes: [],
    blendWeights: new Map(),
    primCount: 0,
    meshCount: 0,
    materialCount: 0,
    boundingBox: null,
    stageRoot: null,
    hierarchy: [],
    metadata: null,
    isUSDZ: false,
  };
}

function isUSDZFile(source: string): boolean {
  return source.toLowerCase().endsWith('.usdz');
}

/** @internal */
export function applyUSDAxisConversion(upAxis: 'y' | 'z', position: Vector3): Vector3 {
  if (upAxis === 'z') {
    return [(position as any)[0], (position as any)[2], -(position as any)[1]];
  }
  return position;
}

/** @internal */
export function usdTimeCodeToSeconds(timeCode: number, fps: number): number {
  return timeCode / fps;
}

/** @internal */
export function secondsToUSDTimeCode(seconds: number, fps: number): number {
  return seconds * fps;
}

// =============================================================================
// HANDLER
// =============================================================================

export const usdHandler: TraitHandler<USDConfig> = {
  name: 'usd',

  defaultConfig: defaultUSDConfig,

  onAttach(node: HSPlusNode, config: USDConfig, context: TraitContext) {
    const state = createInitialState();
    node.__usdState = state;

    // Start loading if source is provided
    if (config.source) {
      loadUSDAsset(node, config, context, state);
    }
  },

  onDetach(node: HSPlusNode, config: USDConfig, context: TraitContext) {
    const state = node.__usdState as USDState | undefined;
    if (!state) return;

    // Stop animation
    state.isPlaying = false;

    // Cleanup resources
    if (state.stageRoot) {
      context.emit('usd:unloaded', {
        node,
        source: config.source,
      });
    }

    delete node.__usdState;
  },

  onUpdate(node: HSPlusNode, config: USDConfig, context: TraitContext, delta: number) {
    const state = node.__usdState as USDState | undefined;
    if (!state || !state.isLoaded) return;

    // Update animation
    if (state.isPlaying && state.animation) {
      const fps = state.animation.framesPerSecond || config.frame_rate;
      state.currentTimeCode += delta * fps;

      if (state.currentTimeCode > state.animation.endTimeCode) {
        if (config.loop_animation) {
          state.currentTimeCode =
            state.animation.startTimeCode +
            ((state.currentTimeCode - state.animation.startTimeCode) %
              (state.animation.endTimeCode - state.animation.startTimeCode));
        } else {
          state.currentTimeCode = state.animation.endTimeCode;
          state.isPlaying = false;
          context.emit('usd:animation_complete', { node });
        }
      }

      // Emit time code update for rendering
      context.emit('usd:time_code_changed', {
        node,
        timeCode: state.currentTimeCode,
      });
    }

    // Update blend shapes if any have changed
    if (state.blendWeights.size > 0) {
      context.emit('usd:blend_shapes_updated', {
        node,
        weights: Object.fromEntries(state.blendWeights),
      });
    }
  },

  onEvent(node: HSPlusNode, config: USDConfig, context: TraitContext, event: TraitEvent) {
    const state = node.__usdState as USDState | undefined;
    if (!state) return;

    switch (event.type) {
      case 'usd:play':
        if (state.animation) {
          state.isPlaying = true;
        }
        break;

      case 'usd:pause':
        state.isPlaying = false;
        break;

      case 'usd:stop':
        state.isPlaying = false;
        state.currentTimeCode = state.animation?.startTimeCode ?? 0;
        break;

      case 'usd:seek':
        if (state.animation) {
          state.currentTimeCode = Math.max(
            state.animation.startTimeCode,
            Math.min(state.animation.endTimeCode, (event.timeCode as number))
          );
        }
        break;

      case 'usd:set_variant':
        setVariant(state, context, (event.variantSet as string), (event.variant as string));
        break;

      case 'usd:set_blend_shape':
        setBlendShape(state, (event.target as string), (event.weight as number));
        break;

      case 'usd:load_payload':
        loadPayload(state, context, (event.primPath as string));
        break;

      case 'usd:unload_payload':
        unloadPayload(state, context, (event.primPath as string));
        break;

      case 'usd:set_purpose':
        setPurpose(state, context, (event.purpose as USDPurpose));
        break;

      case 'usd:reload':
        if (config.source) {
          state.isLoaded = false;
          state.isLoading = false;
          loadUSDAsset(node, config, context, state);
        }
        break;

      case 'usd:export':
        exportStage(state, context, (event.format as "usdz" | "usda" | "usdc"), (event.options as Record<string, unknown>));
        break;
    }
  },
};

// =============================================================================
// LOADING FUNCTIONS
// =============================================================================

async function loadUSDAsset(
  node: HSPlusNode,
  config: USDConfig,
  context: TraitContext,
  state: USDState
): Promise<void> {
  if (state.isLoading) return;

  state.isLoading = true;
  state.loadProgress = 0;
  state.error = undefined;
  state.isUSDZ = isUSDZFile(config.source);

  context.emit('usd:loading_start', {
    node,
    source: config.source,
    isUSDZ: state.isUSDZ,
  });

  try {
    // Progress callback
    const onProgress = (progress: number) => {
      state.loadProgress = progress;
      context.emit('usd:loading_progress', {
        node,
        progress,
      });
    };

    // Simulate async loading
    await simulateAssetLoad(config.source, onProgress);

    // Parse loaded data
    const mockData = createMockUSDData(config);

    // Update state with loaded data
    state.isLoaded = true;
    state.isLoading = false;
    state.loadProgress = 1;
    state.layerStack = mockData.layerStack;
    state.rootLayer = mockData.rootLayer;
    state.variantSets = mockData.variantSets;
    state.animation = mockData.animation;
    state.currentTimeCode = config.time_code || mockData.animation?.startTimeCode || 0;
    state.skeleton = mockData.skeleton;
    state.blendShapes = mockData.blendShapes;
    state.primCount = mockData.primCount;
    state.meshCount = mockData.meshCount;
    state.materialCount = mockData.materialCount;
    state.hierarchy = mockData.hierarchy;
    state.metadata = mockData.metadata;
    state.boundingBox = mockData.boundingBox;
    state.loadedAt = Date.now();

    // Initialize blend weights
    for (const name of state.blendShapes) {
      state.blendWeights.set(name, 0);
    }

    // Set initial variant if configured
    if (config.variant_set && config.variant) {
      setVariant(state, context, config.variant_set, config.variant);
    } else {
      // Set defaults for all variant sets
      for (const vs of state.variantSets) {
        state.activeVariants.set(vs.name, vs.default);
      }
    }

    // Auto-play animation if configured
    if (config.auto_play && state.animation) {
      state.isPlaying = true;
    }

    context.emit('usd:loaded', {
      node,
      source: config.source,
      isUSDZ: state.isUSDZ,
      primCount: state.primCount,
      meshCount: state.meshCount,
      variantSets: state.variantSets.map((vs) => vs.name),
      hasAnimation: !!state.animation,
      hasSkeleton: !!state.skeleton,
      metadata: state.metadata,
      boundingBox: state.boundingBox,
    });

    // Emit standard asset loaded hook
    context.emit('on_asset_loaded', {
      node,
      assetType: state.isUSDZ ? 'usdz' : 'usd',
      source: config.source,
    });

    // Emit AR-ready event for USDZ on supported platforms
    if (state.isUSDZ && config.enable_ar) {
      context.emit('usd:ar_ready', {
        node,
        anchorType: config.ar_anchor,
      });
    }
  } catch (error) {
    state.isLoading = false;
    state.error = (error as Error).message;

    context.emit('usd:load_error', {
      node,
      source: config.source,
      error: state.error,
    });

    context.emit('on_asset_error', {
      node,
      assetType: state.isUSDZ ? 'usdz' : 'usd',
      source: config.source,
      error: state.error,
    });
  }
}

async function simulateAssetLoad(
  source: string,
  onProgress: (progress: number) => void
): Promise<void> {
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    onProgress(i / steps);
  }
}

function createMockUSDData(config: USDConfig): {
  layerStack: USDLayer[];
  rootLayer: string;
  variantSets: USDVariantSet[];
  animation: USDAnimation | null;
  skeleton: USDSkeleton | null;
  blendShapes: string[];
  primCount: number;
  meshCount: number;
  materialCount: number;
  hierarchy: USDPrim[];
  metadata: USDStageMetadata;
  boundingBox: USDState['boundingBox'];
} {
  const hasAnimation = config.auto_play || config.time_code > 0;

  return {
    layerStack: [
      {
        identifier: config.source,
        displayName: config.source.split('/').pop() || 'root.usda',
        isAnonymous: false,
        hasPayload: config.payload_loading === 'lazy',
        sublayers: [],
        references: [],
      },
    ],
    rootLayer: config.source,
    variantSets: [
      {
        name: 'LOD',
        variants: ['high', 'medium', 'low'],
        default: 'high',
      },
      {
        name: 'Material',
        variants: ['plastic', 'metal', 'wood'],
        default: 'plastic',
      },
    ],
    animation: hasAnimation
      ? {
          startTimeCode: 0,
          endTimeCode: 120,
          timeCodesPerSecond: 24,
          framesPerSecond: config.frame_rate,
          hasTimeSamples: true,
          animatedPaths: ['/Root/Body', '/Root/Skeleton'],
        }
      : null,
    skeleton: config.enable_skeletal
      ? {
          path: '/Root/Skeleton',
          joints: ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'],
          bindTransforms: new Map(),
          restTransforms: new Map(),
          topology: new Map([
            ['Hips', null],
            ['Spine', 'Hips'],
            ['Spine1', 'Spine'],
            ['Spine2', 'Spine1'],
            ['Neck', 'Spine2'],
            ['Head', 'Neck'],
          ]),
        }
      : null,
    blendShapes: config.enable_blend_shapes ? ['smile', 'frown', 'blink'] : [],
    primCount: 50,
    meshCount: 8,
    materialCount: 4,
    hierarchy: [
      {
        path: '/Root',
        name: 'Root',
        typeName: 'Xform',
        purpose: 'default',
        visibility: 'inherited',
        active: true,
        children: [
          {
            path: '/Root/Body',
            name: 'Body',
            typeName: 'Mesh',
            purpose: 'render',
            visibility: 'inherited',
            active: true,
            children: [],
            hasPayload: false,
            variantSets: ['LOD', 'Material'],
            attributes: { subdivisionScheme: 'catmullClark' },
          },
          {
            path: '/Root/Skeleton',
            name: 'Skeleton',
            typeName: 'Skeleton',
            purpose: 'default',
            visibility: 'inherited',
            active: true,
            children: [],
            hasPayload: false,
            variantSets: [],
            attributes: {},
          },
        ],
        hasPayload: config.payload_loading === 'lazy',
        variantSets: [],
        attributes: {},
      },
    ],
    metadata: {
      defaultPrim: 'Root',
      upAxis: config.up_axis.toUpperCase() as 'Y' | 'Z',
      metersPerUnit: config.meters_per_unit,
      startTimeCode: 0,
      endTimeCode: 120,
      timeCodesPerSecond: 24,
      framesPerSecond: config.frame_rate,
      customLayerData: {},
      documentation: 'Generated USD stage',
    },
    boundingBox: {
      min: [-1, 0, -1],
      max: [1, 2, 1],
      center: [0, 1, 0],
      size: [2, 2, 2],
    },
  };
}

// =============================================================================
// VARIANT FUNCTIONS
// =============================================================================

function setVariant(
  state: USDState,
  context: TraitContext,
  variantSetName: string,
  variantName: string
): void {
  const variantSet = state.variantSets.find((vs) => vs.name === variantSetName);
  if (!variantSet || !variantSet.variants.includes(variantName)) return;

  state.activeVariants.set(variantSetName, variantName);

  context.emit('usd:variant_changed', {
    variantSet: variantSetName,
    variant: variantName,
  });
}

// =============================================================================
// BLEND SHAPE FUNCTIONS
// =============================================================================

function setBlendShape(state: USDState, target: string, weight: number): void {
  if (state.blendShapes.includes(target)) {
    state.blendWeights.set(target, Math.max(0, Math.min(1, weight)));
  }
}

// =============================================================================
// PAYLOAD FUNCTIONS
// =============================================================================

function loadPayload(state: USDState, context: TraitContext, primPath: string): void {
  const prim = findPrim(state.hierarchy, primPath);
  if (prim && prim.hasPayload) {
    // Would load payload data
    context.emit('usd:payload_loaded', { primPath });
  }
}

function unloadPayload(state: USDState, context: TraitContext, primPath: string): void {
  const prim = findPrim(state.hierarchy, primPath);
  if (prim && prim.hasPayload) {
    // Would unload payload data
    context.emit('usd:payload_unloaded', { primPath });
  }
}

function findPrim(hierarchy: USDPrim[], path: string): USDPrim | null {
  for (const prim of hierarchy) {
    if (prim.path === path) return prim;
    const found = findPrim(prim.children, path);
    if (found) return found;
  }
  return null;
}

// =============================================================================
// PURPOSE FUNCTIONS
// =============================================================================

function setPurpose(state: USDState, context: TraitContext, purpose: USDPurpose): void {
  context.emit('usd:purpose_changed', { purpose });
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

function exportStage(
  state: USDState,
  context: TraitContext,
  format: 'usda' | 'usdc' | 'usdz',
  _options: Record<string, unknown>
): void {
  // Would export stage to specified format
  context.emit('usd:export_complete', {
    format,
    success: true,
  });
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Get USD state from a node
 */
export function getUSDState(node: HSPlusNode): USDState | undefined {
  return node.__usdState as USDState | undefined;
}

/**
 * Check if node has USD loaded
 */
export function isUSDLoaded(node: HSPlusNode): boolean {
  const state = getUSDState(node);
  return state?.isLoaded ?? false;
}

/**
 * Get available variant sets
 */
export function getUSDVariantSets(node: HSPlusNode): USDVariantSet[] {
  const state = getUSDState(node);
  return state?.variantSets ?? [];
}

/**
 * Get active variant for a set
 */
export function getUSDActiveVariant(node: HSPlusNode, variantSet: string): string | undefined {
  const state = getUSDState(node);
  return state?.activeVariants.get(variantSet);
}

/**
 * Get animation info
 */
export function getUSDAnimation(node: HSPlusNode): USDAnimation | null {
  const state = getUSDState(node);
  return state?.animation ?? null;
}

/**
 * Get skeleton joint names
 */
export function getUSDJointNames(node: HSPlusNode): string[] {
  const state = getUSDState(node);
  return state?.skeleton?.joints ?? [];
}

/**
 * Get blend shape names
 */
export function getUSDBlendShapes(node: HSPlusNode): string[] {
  const state = getUSDState(node);
  return state?.blendShapes ?? [];
}

/**
 * Check if this is a USDZ file
 */
export function isUSDZ(node: HSPlusNode): boolean {
  const state = getUSDState(node);
  return state?.isUSDZ ?? false;
}

export default usdHandler;
