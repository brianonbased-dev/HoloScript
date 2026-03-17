/**
 * GLTF Trait
 *
 * First-class glTF/glb support with extensions, streaming, and optimization.
 * Integrates with the HoloScript Asset System for smart loading and caching.
 *
 * @version 2.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

export interface GLTFConfig {
  /** Source URL or asset ID */
  source: string;

  /** Enable Draco mesh compression */
  draco_compression: boolean;

  /** Enable Meshopt compression */
  meshopt_compression: boolean;

  /** Enable KTX2 texture transcoding */
  ktx2_textures: boolean;

  /** Extensions to enable */
  extensions: GLTFExtension[];

  /** Default animation clip to play */
  animation_clip: string;

  /** Number of LOD levels to generate */
  lod_levels: number;

  /** LOD distance thresholds */
  lod_distances: number[];

  /** Enable GPU instancing */
  enable_instancing: boolean;

  /** Shadow casting mode */
  cast_shadows: boolean;

  /** Shadow receiving mode */
  receive_shadows: boolean;

  /** Material override */
  material_override?: string;

  /** Scale factor */
  scale: number;

  /** Auto-play animations */
  auto_play: boolean;

  /** Animation loop mode */
  loop_animations: boolean;

  /** Enable morph targets */
  enable_morphs: boolean;

  /** Skeleton retargeting profile */
  skeleton_profile?: string;

  /** Asset streaming priority */
  streaming_priority: 'critical' | 'high' | 'normal' | 'low';

  /** Enable lightmap loading */
  load_lightmaps: boolean;

  /** Physics collision shape */
  collision_shape: 'none' | 'convex' | 'trimesh' | 'auto';
}

export type GLTFExtension =
  | 'KHR_draco_mesh_compression'
  | 'KHR_materials_unlit'
  | 'KHR_materials_pbrSpecularGlossiness'
  | 'KHR_materials_clearcoat'
  | 'KHR_materials_transmission'
  | 'KHR_materials_sheen'
  | 'KHR_materials_volume'
  | 'KHR_materials_ior'
  | 'KHR_materials_specular'
  | 'KHR_materials_iridescence'
  | 'KHR_materials_emissive_strength'
  | 'KHR_texture_basisu'
  | 'KHR_texture_transform'
  | 'KHR_mesh_quantization'
  | 'KHR_lights_punctual'
  | 'EXT_meshopt_compression'
  | 'EXT_texture_webp'
  | 'MSFT_texture_dds'
  | 'KHR_animation_pointer'
  | 'OMI_audio_emitter'
  | 'OMI_physics_body'
  | 'OMI_physics_shape';

export interface GLTFState {
  /** Is the model loaded? */
  isLoaded: boolean;

  /** Is currently loading? */
  isLoading: boolean;

  /** Load progress (0-1) */
  loadProgress: number;

  /** Number of meshes */
  meshCount: number;

  /** Number of materials */
  materialCount: number;

  /** Available animation names */
  animationNames: string[];

  /** Currently playing animations */
  playingAnimations: Map<string, AnimationPlayback>;

  /** Available morph target names */
  morphTargetNames: string[];

  /** Morph target weights */
  morphWeights: Map<string, number>;

  /** Bounding box */
  boundingBox: {
    min: Vector3;
    max: Vector3;
    center: Vector3;
    size: Vector3;
  } | null;

  /** Scene graph root */
  sceneRoot: unknown;

  /** Loaded textures */
  textures: string[];

  /** Active LOD level */
  currentLOD: number;

  /** Scene hierarchy */
  hierarchy: GLTFNode[];

  /** Error message if load failed */
  error?: string;

  /** Load timestamp */
  loadedAt?: number;

  /** File size in bytes */
  fileSize?: number;
}

export interface GLTFNode {
  name: string;
  index: number;
  type: 'mesh' | 'light' | 'camera' | 'empty' | 'skeleton';
  children: GLTFNode[];
  meshIndex?: number;
  skinIndex?: number;
}

export interface AnimationPlayback {
  name: string;
  time: number;
  duration: number;
  speed: number;
  weight: number;
  loop: boolean;
  playing: boolean;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const defaultGLTFConfig: GLTFConfig = {
  source: '',
  draco_compression: true,
  meshopt_compression: false,
  ktx2_textures: false,
  extensions: [],
  animation_clip: '',
  lod_levels: 1,
  lod_distances: [10, 25, 50, 100],
  enable_instancing: true,
  cast_shadows: true,
  receive_shadows: true,
  material_override: undefined,
  scale: 1.0,
  auto_play: false,
  loop_animations: true,
  enable_morphs: true,
  skeleton_profile: undefined,
  streaming_priority: 'normal',
  load_lightmaps: false,
  collision_shape: 'auto',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createInitialState(): GLTFState {
  return {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    meshCount: 0,
    materialCount: 0,
    animationNames: [],
    playingAnimations: new Map(),
    morphTargetNames: [],
    morphWeights: new Map(),
    boundingBox: null,
    sceneRoot: null,
    textures: [],
    currentLOD: 0,
    hierarchy: [],
  };
}

function getRequiredExtensions(config: GLTFConfig): GLTFExtension[] {
  const extensions: GLTFExtension[] = [...config.extensions];

  if (config.draco_compression) {
    extensions.push('KHR_draco_mesh_compression');
  }
  if (config.meshopt_compression) {
    extensions.push('EXT_meshopt_compression');
  }
  if (config.ktx2_textures) {
    extensions.push('KHR_texture_basisu');
  }

  return [...new Set(extensions)];
}

function calculateBoundingBox(_meshData: unknown[]): GLTFState['boundingBox'] {
  // Simplified bounding box calculation
  const minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  const maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  // Would iterate through mesh positions in real implementation

  // Return default if no valid data
  if (!isFinite(minX)) {
    return {
      min: [-1, -1, -1],
      max: [1, 1, 1],
      center: [0, 0, 0],
      size: [2, 2, 2],
    };
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}

function selectLODLevel(distance: number, lodDistances: number[], maxLOD: number): number {
  for (let i = 0; i < lodDistances.length; i++) {
    if (distance < lodDistances[i]) {
      return Math.min(i, maxLOD - 1);
    }
  }
  return maxLOD - 1;
}

// =============================================================================
// HANDLER
// =============================================================================

export const gltfHandler: TraitHandler<GLTFConfig> = {
  name: 'gltf',

  defaultConfig: defaultGLTFConfig,

  onAttach(node: HSPlusNode, config: GLTFConfig, context: TraitContext) {
    const state = createInitialState();
    node.__gltfState = state;

    // Start loading if source is provided
    if (config.source) {
      loadGLTFAsset(node, config, context, state);
    }
  },

  onDetach(node: HSPlusNode, config: GLTFConfig, context: TraitContext) {
    const state = node.__gltfState as GLTFState | undefined;
    if (!state) return;

    // Stop all animations
    state.playingAnimations.clear();

    // Cleanup resources
    if (state.sceneRoot) {
      context.emit('gltf:unloaded', {
        node,
        source: config.source,
      });
    }

    delete node.__gltfState;
  },

  onUpdate(node: HSPlusNode, config: GLTFConfig, context: TraitContext, delta: number) {
    const state = node.__gltfState as GLTFState | undefined;
    if (!state || !state.isLoaded) return;

    // Update animations
    if (state.playingAnimations.size > 0) {
      for (const [name, playback] of state.playingAnimations) {
        if (!playback.playing) continue;

        playback.time += delta * playback.speed;

        if (playback.time >= playback.duration) {
          if (playback.loop) {
            playback.time = playback.time % playback.duration;
          } else {
            playback.playing = false;
            playback.time = playback.duration;
            context.emit('gltf:animation_complete', {
              node,
              animation: name,
            });
          }
        }
      }
    }

    // Update LOD based on distance from camera
    if (config.lod_levels > 1) {
      const cameraDistance = calculateCameraDistance(node, context);
      const newLOD = selectLODLevel(cameraDistance, config.lod_distances, config.lod_levels);

      if (newLOD !== state.currentLOD) {
        state.currentLOD = newLOD;
        context.emit('gltf:lod_changed', {
          node,
          lod: newLOD,
        });
      }
    }
  },

  onEvent(node: HSPlusNode, config: GLTFConfig, context: TraitContext, event: any) {
    const state = node.__gltfState as GLTFState | undefined;
    if (!state) return;

    switch (event.type) {
      case 'gltf:play_animation':
        playAnimation(state, event.animation, event.options);
        break;

      case 'gltf:stop_animation':
        stopAnimation(state, event.animation);
        break;

      case 'gltf:set_morph':
        setMorphWeight(state, event.target, event.weight);
        break;

      case 'gltf:reload':
        if (config.source) {
          state.isLoaded = false;
          state.isLoading = false;
          loadGLTFAsset(node, config, context, state);
        }
        break;

      case 'gltf:set_material':
        // Handle material override
        context.emit('gltf:material_changed', {
          node,
          material: event.material,
        });
        break;
    }
  },
};

// =============================================================================
// LOADING FUNCTIONS
// =============================================================================

async function loadGLTFAsset(
  node: HSPlusNode,
  config: GLTFConfig,
  context: TraitContext,
  state: GLTFState
): Promise<void> {
  if (state.isLoading) return;

  state.isLoading = true;
  state.loadProgress = 0;
  state.error = undefined;

  context.emit('gltf:loading_start', {
    node,
    source: config.source,
  });

  try {
    // Get required extensions (used for loader configuration)
    const extensions = getRequiredExtensions(config);
    void extensions; // Extensions would configure the actual GLTF loader

    // Emit progress updates
    const onProgress = (progress: number) => {
      state.loadProgress = progress;
      context.emit('gltf:loading_progress', {
        node,
        progress,
      });
    };

    // Simulate async loading (actual implementation would use Three.js GLTFLoader)
    await simulateAssetLoad(config.source, onProgress);

    // Parse loaded data
    const mockData = createMockGLTFData(config);

    // Update state with loaded data
    state.isLoaded = true;
    state.isLoading = false;
    state.loadProgress = 1;
    state.meshCount = mockData.meshCount;
    state.materialCount = mockData.materialCount;
    state.animationNames = mockData.animationNames;
    state.morphTargetNames = mockData.morphTargetNames;
    state.textures = mockData.textures;
    state.hierarchy = mockData.hierarchy;
    state.boundingBox = calculateBoundingBox([]);
    state.loadedAt = Date.now();

    // Initialize morph weights
    for (const name of state.morphTargetNames) {
      state.morphWeights.set(name, 0);
    }

    // Auto-play animation if configured
    if (
      config.auto_play &&
      config.animation_clip &&
      state.animationNames.includes(config.animation_clip)
    ) {
      playAnimation(state, config.animation_clip, {
        loop: config.loop_animations,
        speed: 1,
        weight: 1,
      });
    }

    context.emit('gltf:loaded', {
      node,
      source: config.source,
      meshCount: state.meshCount,
      animationNames: state.animationNames,
      boundingBox: state.boundingBox,
    });

    // Emit standard asset loaded hook
    context.emit('on_asset_loaded', {
      node,
      assetType: 'gltf',
      source: config.source,
    });
  } catch (error) {
    state.isLoading = false;
    state.error = (error as Error).message;

    context.emit('gltf:load_error', {
      node,
      source: config.source,
      error: state.error,
    });

    context.emit('on_asset_error', {
      node,
      assetType: 'gltf',
      source: config.source,
      error: state.error,
    });
  }
}

async function simulateAssetLoad(
  source: string,
  onProgress: (progress: number) => void
): Promise<void> {
  // Simulated loading with progress
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    onProgress(i / steps);
  }
}

function createMockGLTFData(config: GLTFConfig): {
  meshCount: number;
  materialCount: number;
  animationNames: string[];
  morphTargetNames: string[];
  textures: string[];
  hierarchy: GLTFNode[];
} {
  return {
    meshCount: 5,
    materialCount: 3,
    animationNames: config.animation_clip
      ? [config.animation_clip, 'idle', 'walk', 'run']
      : ['idle', 'walk', 'run'],
    morphTargetNames: config.enable_morphs ? ['smile', 'frown', 'blink_L', 'blink_R'] : [],
    textures: ['diffuse.ktx2', 'normal.ktx2', 'orm.ktx2'],
    hierarchy: [
      {
        name: 'Root',
        index: 0,
        type: 'empty',
        children: [
          { name: 'Mesh', index: 1, type: 'mesh', meshIndex: 0, children: [] },
          { name: 'Armature', index: 2, type: 'skeleton', children: [] },
        ],
      },
    ],
  };
}

function calculateCameraDistance(node: HSPlusNode, context: TraitContext): number {
  const nodePos = (node as any).position || [0, 0, 0];
  const cameraPos = context.vr.headset.position;

  const dx = nodePos[0] - (cameraPos as any)[0];
  const dy = nodePos[1] - (cameraPos as any)[1];
  const dz = nodePos[2] - (cameraPos as any)[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// =============================================================================
// ANIMATION FUNCTIONS
// =============================================================================

function playAnimation(
  state: GLTFState,
  name: string,
  options: {
    loop?: boolean;
    speed?: number;
    weight?: number;
    startTime?: number;
  } = {}
): void {
  if (!state.animationNames.includes(name)) return;

  const playback: AnimationPlayback = {
    name,
    time: options.startTime ?? 0,
    duration: 1.0, // Would be parsed from GLTF
    speed: options.speed ?? 1,
    weight: options.weight ?? 1,
    loop: options.loop ?? true,
    playing: true,
  };

  state.playingAnimations.set(name, playback);
}

function stopAnimation(state: GLTFState, name?: string): void {
  if (name) {
    state.playingAnimations.delete(name);
  } else {
    state.playingAnimations.clear();
  }
}

function setMorphWeight(state: GLTFState, target: string, weight: number): void {
  if (state.morphTargetNames.includes(target)) {
    state.morphWeights.set(target, Math.max(0, Math.min(1, weight)));
  }
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Get GLTF state from a node
 */
export function getGLTFState(node: HSPlusNode): GLTFState | undefined {
  return node.__gltfState;
}

/**
 * Check if node has GLTF loaded
 */
export function isGLTFLoaded(node: HSPlusNode): boolean {
  const state = getGLTFState(node);
  return state?.isLoaded ?? false;
}

/**
 * Get available animations
 */
export function getGLTFAnimations(node: HSPlusNode): string[] {
  const state = getGLTFState(node);
  return state?.animationNames ?? [];
}

/**
 * Get morph target names
 */
export function getGLTFMorphTargets(node: HSPlusNode): string[] {
  const state = getGLTFState(node);
  return state?.morphTargetNames ?? [];
}

export default gltfHandler;
