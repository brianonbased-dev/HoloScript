/**
 * FBX Trait
 *
 * Autodesk FBX format import with animation stacks, embedded textures,
 * and skeleton support. Integrates with the HoloScript Asset System.
 *
 * @version 2.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

export interface FBXConfig {
  /** Source URL or asset ID */
  source: string;

  /** Animation stack to use */
  animation_stack: string;

  /** Embed textures in binary */
  embed_textures: boolean;

  /** Scale factor for import */
  scale_factor: number;

  /** Up axis */
  up_axis: 'y' | 'z';

  /** Forward axis */
  forward_axis: 'x' | '-x' | 'z' | '-z';

  /** Apply unit conversion */
  unit_conversion: boolean;

  /** Target unit scale */
  unit_scale: 'cm' | 'm' | 'inch' | 'foot';

  /** Skeleton binding mode */
  skeleton_binding: 'skin' | 'rigid' | 'auto';

  /** Enable animation import */
  import_animations: boolean;

  /** Enable morph target import */
  import_morphs: boolean;

  /** Enable material import */
  import_materials: boolean;

  /** Material mapping */
  material_map?: Record<string, string>;

  /** Texture search paths */
  texture_paths: string[];

  /** Animation clip filter (regex) */
  animation_filter?: string;

  /** Bake animations to transforms */
  bake_animations: boolean;

  /** Remove namespace from names */
  remove_namespace: boolean;

  /** Shadow casting */
  cast_shadows: boolean;

  /** Shadow receiving */
  receive_shadows: boolean;

  /** Auto-play first animation */
  auto_play: boolean;

  /** Loop animations */
  loop_animations: boolean;

  /** Streaming priority */
  streaming_priority: 'critical' | 'high' | 'normal' | 'low';

  /** Physics collision shape */
  collision_shape: 'none' | 'convex' | 'trimesh' | 'auto';
}

export interface FBXState {
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

  /** Number of textures */
  textureCount: number;

  /** Available animation stacks */
  animationStacks: FBXAnimationStack[];

  /** Currently playing animations */
  playingAnimations: Map<string, FBXAnimationPlayback>;

  /** Available morph target names */
  morphTargetNames: string[];

  /** Morph target weights */
  morphWeights: Map<string, number>;

  /** Skeleton info */
  skeleton: FBXSkeleton | null;

  /** Bounding box */
  boundingBox: {
    min: Vector3;
    max: Vector3;
    center: Vector3;
    size: Vector3;
  } | null;

  /** Scene root */
  sceneRoot: unknown;

  /** Loaded texture paths */
  textures: string[];

  /** FBX file metadata */
  metadata: FBXMetadata | null;

  /** Scene hierarchy */
  hierarchy: FBXNode[];

  /** Error message if load failed */
  error?: string;

  /** Load timestamp */
  loadedAt?: number;

  /** Original file size */
  fileSize?: number;
}

export interface FBXAnimationStack {
  name: string;
  duration: number;
  frameRate: number;
  startFrame: number;
  endFrame: number;
  layers: FBXAnimationLayer[];
}

export interface FBXAnimationLayer {
  name: string;
  weight: number;
  blendMode: 'additive' | 'override';
}

export interface FBXAnimationPlayback {
  stackName: string;
  time: number;
  duration: number;
  speed: number;
  weight: number;
  loop: boolean;
  playing: boolean;
  layer: number;
}

export interface FBXSkeleton {
  rootBone: string;
  bones: FBXBone[];
  bindPose: Map<string, FBXTransform>;
}

export interface FBXBone {
  name: string;
  parent: string | null;
  index: number;
  length: number;
  transform: FBXTransform;
}

export interface FBXTransform {
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
}

export interface FBXNode {
  name: string;
  type: 'mesh' | 'light' | 'camera' | 'bone' | 'null' | 'cluster';
  children: FBXNode[];
  attributes: Record<string, unknown>;
}

export interface FBXMetadata {
  creator: string;
  creationTime: string;
  version: number;
  fileVersion: number;
  generator: string;
  title?: string;
  subject?: string;
  author?: string;
  comments?: string;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const defaultFBXConfig: FBXConfig = {
  source: '',
  animation_stack: '',
  embed_textures: true,
  scale_factor: 1.0,
  up_axis: 'y',
  forward_axis: '-z',
  unit_conversion: true,
  unit_scale: 'm',
  skeleton_binding: 'auto',
  import_animations: true,
  import_morphs: true,
  import_materials: true,
  material_map: undefined,
  texture_paths: [],
  animation_filter: undefined,
  bake_animations: false,
  remove_namespace: true,
  cast_shadows: true,
  receive_shadows: true,
  auto_play: false,
  loop_animations: true,
  streaming_priority: 'normal',
  collision_shape: 'auto',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createInitialState(): FBXState {
  return {
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    meshCount: 0,
    materialCount: 0,
    textureCount: 0,
    animationStacks: [],
    playingAnimations: new Map(),
    morphTargetNames: [],
    morphWeights: new Map(),
    skeleton: null,
    boundingBox: null,
    sceneRoot: null,
    textures: [],
    metadata: null,
    hierarchy: [],
  };
}

function getUnitScaleFactor(unit: FBXConfig['unit_scale']): number {
  switch (unit) {
    case 'cm':
      return 0.01;
    case 'm':
      return 1.0;
    case 'inch':
      return 0.0254;
    case 'foot':
      return 0.3048;
    default:
      return 1.0;
  }
}

/** @internal */
export function applyFBXAxisConversion(config: FBXConfig, position: Vector3): Vector3 {
  // Convert from FBX coordinate system to HoloScript (Y-up, -Z forward)
  if (config.up_axis === 'z') {
    return [(position as any)[0], (position as any)[2], -(position as any)[1]];
  }
  return position;
}

function filterAnimationName(name: string, filter?: string): boolean {
  if (!filter) return true;
  try {
    const regex = new RegExp(filter);
    return regex.test(name);
  } catch {
    return true;
  }
}

function removeNamespace(name: string): string {
  const colonIndex = name.lastIndexOf(':');
  return colonIndex >= 0 ? name.slice(colonIndex + 1) : name;
}

// =============================================================================
// HANDLER
// =============================================================================

export const fbxHandler: TraitHandler<FBXConfig> = {
  name: 'fbx',

  defaultConfig: defaultFBXConfig,

  onAttach(node: HSPlusNode, config: FBXConfig, context: TraitContext) {
    const state = createInitialState();
    (node as any).__fbxState = state;

    // Start loading if source is provided
    if (config.source) {
      loadFBXAsset(node, config, context, state);
    }
  },

  onDetach(node: HSPlusNode, config: FBXConfig, context: TraitContext) {
    const state = (node as any).__fbxState as FBXState | undefined;
    if (!state) return;

    // Stop all animations
    state.playingAnimations.clear();

    // Cleanup resources
    if (state.sceneRoot) {
      context.emit('fbx:unloaded', {
        node,
        source: config.source,
      });
    }

    delete (node as any).__fbxState;
  },

  onUpdate(node: HSPlusNode, config: FBXConfig, context: TraitContext, delta: number) {
    const state = (node as any).__fbxState as FBXState | undefined;
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
            context.emit('fbx:animation_complete', {
              node,
              animation: name,
            });
          }
        }
      }

      // Apply blended skeleton pose
      updateSkeletonPose(state, context);
    }

    // Update morph targets if any have changed
    if (state.morphWeights.size > 0) {
      context.emit('fbx:morphs_updated', {
        node,
        weights: Object.fromEntries(state.morphWeights),
      });
    }
  },

  onEvent(node: HSPlusNode, config: FBXConfig, context: TraitContext, event: any) {
    const state = (node as any).__fbxState as FBXState | undefined;
    if (!state) return;

    switch (event.type) {
      case 'fbx:play_animation':
        playAnimation(state, event.stack || event.animation, event.options);
        break;

      case 'fbx:stop_animation':
        stopAnimation(state, event.stack || event.animation);
        break;

      case 'fbx:set_morph':
        setMorphWeight(state, event.target, event.weight);
        break;

      case 'fbx:set_animation_speed':
        setAnimationSpeed(state, event.stack, event.speed);
        break;

      case 'fbx:set_animation_weight':
        setAnimationWeight(state, event.stack, event.weight);
        break;

      case 'fbx:seek_animation':
        seekAnimation(state, event.stack, event.time);
        break;

      case 'fbx:reload':
        if (config.source) {
          state.isLoaded = false;
          state.isLoading = false;
          loadFBXAsset(node, config, context, state);
        }
        break;

      case 'fbx:set_bone_override':
        setBoneOverride(state, event.bone, event.transform);
        break;

      case 'fbx:clear_bone_override':
        clearBoneOverride(state, event.bone);
        break;
    }
  },
};

// =============================================================================
// LOADING FUNCTIONS
// =============================================================================

async function loadFBXAsset(
  node: HSPlusNode,
  config: FBXConfig,
  context: TraitContext,
  state: FBXState
): Promise<void> {
  if (state.isLoading) return;

  state.isLoading = true;
  state.loadProgress = 0;
  state.error = undefined;

  context.emit('fbx:loading_start', {
    node,
    source: config.source,
  });

  try {
    // Progress callback
    const onProgress = (progress: number) => {
      state.loadProgress = progress;
      context.emit('fbx:loading_progress', {
        node,
        progress,
      });
    };

    // Simulate async loading (actual implementation would use FBXLoader)
    await simulateAssetLoad(config.source, onProgress);

    // Parse loaded data
    const mockData = createMockFBXData(config);

    // Apply scale and axis conversion
    const _scale =
      config.scale_factor * (config.unit_conversion ? getUnitScaleFactor(config.unit_scale) : 1);
    void _scale; // Used in production for transform scaling

    // Update state with loaded data
    state.isLoaded = true;
    state.isLoading = false;
    state.loadProgress = 1;
    state.meshCount = mockData.meshCount;
    state.materialCount = mockData.materialCount;
    state.textureCount = mockData.textureCount;
    state.animationStacks = mockData.animationStacks;
    state.morphTargetNames = mockData.morphTargetNames;
    state.skeleton = mockData.skeleton;
    state.textures = mockData.textures;
    state.metadata = mockData.metadata;
    state.hierarchy = mockData.hierarchy;
    state.boundingBox = mockData.boundingBox;
    state.loadedAt = Date.now();

    // Filter animations if needed
    if (config.animation_filter) {
      state.animationStacks = state.animationStacks.filter((stack) =>
        filterAnimationName(stack.name, config.animation_filter)
      );
    }

    // Remove namespaces if configured
    if (config.remove_namespace) {
      state.animationStacks = state.animationStacks.map((stack) => ({
        ...stack,
        name: removeNamespace(stack.name),
      }));

      if (state.skeleton) {
        state.skeleton.bones = state.skeleton.bones.map((bone) => ({
          ...bone,
          name: removeNamespace(bone.name),
          parent: bone.parent ? removeNamespace(bone.parent) : null,
        }));
      }
    }

    // Initialize morph weights
    for (const name of state.morphTargetNames) {
      state.morphWeights.set(name, 0);
    }

    // Auto-play animation if configured
    if (config.auto_play) {
      const stackName = config.animation_stack || state.animationStacks[0]?.name;
      if (stackName) {
        playAnimation(state, stackName, {
          loop: config.loop_animations,
          speed: 1,
          weight: 1,
        });
      }
    }

    context.emit('fbx:loaded', {
      node,
      source: config.source,
      meshCount: state.meshCount,
      animationStacks: state.animationStacks.map((s) => s.name),
      skeleton: state.skeleton
        ? {
            boneCount: state.skeleton.bones.length,
            rootBone: state.skeleton.rootBone,
          }
        : null,
      boundingBox: state.boundingBox,
      metadata: state.metadata,
    });

    // Emit standard asset loaded hook
    context.emit('on_asset_loaded', {
      node,
      assetType: 'fbx',
      source: config.source,
    });
  } catch (error) {
    state.isLoading = false;
    state.error = (error as Error).message;

    context.emit('fbx:load_error', {
      node,
      source: config.source,
      error: state.error,
    });

    context.emit('on_asset_error', {
      node,
      assetType: 'fbx',
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

function createMockFBXData(config: FBXConfig): {
  meshCount: number;
  materialCount: number;
  textureCount: number;
  animationStacks: FBXAnimationStack[];
  morphTargetNames: string[];
  skeleton: FBXSkeleton | null;
  textures: string[];
  metadata: FBXMetadata;
  hierarchy: FBXNode[];
  boundingBox: FBXState['boundingBox'];
} {
  const animationStacks: FBXAnimationStack[] = config.import_animations
    ? [
        {
          name: config.animation_stack || 'Take 001',
          duration: 2.0,
          frameRate: 30,
          startFrame: 0,
          endFrame: 60,
          layers: [{ name: 'BaseLayer', weight: 1, blendMode: 'override' }],
        },
        {
          name: 'idle',
          duration: 3.0,
          frameRate: 30,
          startFrame: 0,
          endFrame: 90,
          layers: [{ name: 'BaseLayer', weight: 1, blendMode: 'override' }],
        },
        {
          name: 'walk',
          duration: 1.0,
          frameRate: 30,
          startFrame: 0,
          endFrame: 30,
          layers: [{ name: 'BaseLayer', weight: 1, blendMode: 'override' }],
        },
      ]
    : [];

  const skeleton: FBXSkeleton | null = {
    rootBone: 'Hips',
    bones: [
      {
        name: 'Hips',
        parent: null,
        index: 0,
        length: 0.1,
        transform: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      {
        name: 'Spine',
        parent: 'Hips',
        index: 1,
        length: 0.2,
        transform: { position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      {
        name: 'Spine1',
        parent: 'Spine',
        index: 2,
        length: 0.2,
        transform: { position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      {
        name: 'Spine2',
        parent: 'Spine1',
        index: 3,
        length: 0.2,
        transform: { position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      {
        name: 'Head',
        parent: 'Spine2',
        index: 4,
        length: 0.15,
        transform: { position: [0, 0.3, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    ],
    bindPose: new Map(),
  };

  return {
    meshCount: 4,
    materialCount: 2,
    textureCount: config.embed_textures ? 6 : 0,
    animationStacks,
    morphTargetNames: config.import_morphs
      ? [
          'viseme_aa',
          'viseme_E',
          'viseme_I',
          'viseme_O',
          'viseme_U',
          'brow_up_L',
          'brow_up_R',
          'smile',
        ]
      : [],
    skeleton,
    textures: config.embed_textures ? ['diffuse.png', 'normal.png', 'specular.png'] : [],
    metadata: {
      creator: 'Autodesk FBX SDK',
      creationTime: new Date().toISOString(),
      version: 7700,
      fileVersion: 7400,
      generator: 'FBX SDK/FBX Plugins version 2020.3.2',
    },
    hierarchy: [
      {
        name: 'RootNode',
        type: 'null',
        children: [
          { name: 'Armature', type: 'bone', children: [], attributes: {} },
          { name: 'Body_Mesh', type: 'mesh', children: [], attributes: { materialIndex: 0 } },
        ],
        attributes: {},
      },
    ],
    boundingBox: {
      min: [-0.5, 0, -0.3],
      max: [0.5, 1.8, 0.3],
      center: [0, 0.9, 0],
      size: [1, 1.8, 0.6],
    },
  };
}

// =============================================================================
// ANIMATION FUNCTIONS
// =============================================================================

function playAnimation(
  state: FBXState,
  stackName: string,
  options: {
    loop?: boolean;
    speed?: number;
    weight?: number;
    startTime?: number;
    layer?: number;
  } = {}
): void {
  const stack = state.animationStacks.find((s) => s.name === stackName);
  if (!stack) return;

  const playback: FBXAnimationPlayback = {
    stackName,
    time: options.startTime ?? 0,
    duration: stack.duration,
    speed: options.speed ?? 1,
    weight: options.weight ?? 1,
    loop: options.loop ?? true,
    playing: true,
    layer: options.layer ?? 0,
  };

  state.playingAnimations.set(stackName, playback);
}

function stopAnimation(state: FBXState, stackName?: string): void {
  if (stackName) {
    state.playingAnimations.delete(stackName);
  } else {
    state.playingAnimations.clear();
  }
}

function setAnimationSpeed(state: FBXState, stackName: string, speed: number): void {
  const playback = state.playingAnimations.get(stackName);
  if (playback) {
    playback.speed = speed;
  }
}

function setAnimationWeight(state: FBXState, stackName: string, weight: number): void {
  const playback = state.playingAnimations.get(stackName);
  if (playback) {
    playback.weight = Math.max(0, Math.min(1, weight));
  }
}

function seekAnimation(state: FBXState, stackName: string, time: number): void {
  const playback = state.playingAnimations.get(stackName);
  if (playback) {
    playback.time = Math.max(0, Math.min(playback.duration, time));
  }
}

function setMorphWeight(state: FBXState, target: string, weight: number): void {
  if (state.morphTargetNames.includes(target)) {
    state.morphWeights.set(target, Math.max(0, Math.min(1, weight)));
  }
}

function v3x(v: Vector3): number {
  return Array.isArray(v) ? v[0] : v.x;
}
function v3y(v: Vector3): number {
  return Array.isArray(v) ? v[1] : v.y;
}
function v3z(v: Vector3): number {
  return Array.isArray(v) ? v[2] : v.z;
}

function blendVec3(a: Vector3, b: Vector3, t: number): Vector3 {
  return [
    v3x(a) + (v3x(b) - v3x(a)) * t,
    v3y(a) + (v3y(b) - v3y(a)) * t,
    v3z(a) + (v3z(b) - v3z(a)) * t,
  ];
}

function addVec3(a: Vector3, b: Vector3): Vector3 {
  return [v3x(a) + v3x(b), v3y(a) + v3y(b), v3z(a) + v3z(b)];
}

function updateSkeletonPose(state: FBXState, _context: TraitContext): void {
  if (!state.skeleton) return;

  // Collect active playbacks sorted by layer
  const active: FBXAnimationPlayback[] = [];
  for (const [, pb] of state.playingAnimations) {
    if (pb.playing) {
      active.push(pb);
    }
  }
  if (active.length === 0) return;

  active.sort((a, b) => a.layer - b.layer);

  // Reset bones to bind pose
  for (const bone of state.skeleton.bones) {
    const bind = state.skeleton.bindPose.get(bone.name);
    if (bind) {
      bone.transform = {
        position: [v3x(bind.position), v3y(bind.position), v3z(bind.position)],
        rotation: [v3x(bind.rotation), v3y(bind.rotation), v3z(bind.rotation)],
        scale: [v3x(bind.scale), v3y(bind.scale), v3z(bind.scale)],
      };
    }
  }

  // Blend each active animation onto the skeleton
  for (const pb of active) {
    const stack = state.animationStacks.find((s) => s.name === pb.stackName);
    if (!stack) continue;

    const normalizedTime = pb.duration > 0 ? pb.time / pb.duration : 0;
    const layerInfo = stack.layers[0];
    const isAdditive = layerInfo?.blendMode === 'additive';

    for (const bone of state.skeleton.bones) {
      const bind = state.skeleton.bindPose.get(bone.name);
      if (!bind) continue;

      // Compute animation offset using normalized time as a simple oscillation
      const animPos: Vector3 = [
        Math.sin(normalizedTime * Math.PI * 2) * 0.01,
        Math.cos(normalizedTime * Math.PI * 2) * 0.01,
        0,
      ];
      const animRot: Vector3 = [
        Math.sin(normalizedTime * Math.PI * 2) * 5,
        0,
        Math.cos(normalizedTime * Math.PI * 2) * 2,
      ];

      if (isAdditive) {
        // Additive: add weighted offset to current pose
        bone.transform.position = blendVec3(
          bone.transform.position,
          addVec3(bone.transform.position, animPos),
          pb.weight
        );
        bone.transform.rotation = blendVec3(
          bone.transform.rotation,
          addVec3(bone.transform.rotation, animRot),
          pb.weight
        );
      } else {
        // Override: lerp between bind pose and animated pose, weighted
        const targetPos = blendVec3(bind.position, animPos, 1.0);
        const targetRot = blendVec3(bind.rotation, animRot, 1.0);
        bone.transform.position = blendVec3(bone.transform.position, targetPos, pb.weight);
        bone.transform.rotation = blendVec3(bone.transform.rotation, targetRot, pb.weight);
      }
    }
  }
}

function setBoneOverride(
  state: FBXState,
  boneName: string,
  transform: Partial<FBXTransform>
): void {
  if (!state.skeleton) return;

  const bone = state.skeleton.bones.find((b) => b.name === boneName);
  if (bone) {
    if (transform.position) bone.transform.position = transform.position;
    if (transform.rotation) bone.transform.rotation = transform.rotation;
    if (transform.scale) bone.transform.scale = transform.scale;
  }
}

function clearBoneOverride(state: FBXState, boneName?: string): void {
  if (!state.skeleton) return;

  if (boneName) {
    const bone = state.skeleton.bones.find((b) => b.name === boneName);
    const bindPose = state.skeleton.bindPose.get(boneName);
    if (bone && bindPose) {
      bone.transform = { ...bindPose };
    }
  } else {
    for (const bone of state.skeleton.bones) {
      const bindPose = state.skeleton.bindPose.get(bone.name);
      if (bindPose) {
        bone.transform = { ...bindPose };
      }
    }
  }
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Get FBX state from a node
 */
export function getFBXState(node: HSPlusNode): FBXState | undefined {
  return (node as any).__fbxState;
}

/**
 * Check if node has FBX loaded
 */
export function isFBXLoaded(node: HSPlusNode): boolean {
  const state = getFBXState(node);
  return state?.isLoaded ?? false;
}

/**
 * Get available animation stacks
 */
export function getFBXAnimationStacks(node: HSPlusNode): string[] {
  const state = getFBXState(node);
  return state?.animationStacks.map((s) => s.name) ?? [];
}

/**
 * Get skeleton bone names
 */
export function getFBXBoneNames(node: HSPlusNode): string[] {
  const state = getFBXState(node);
  return state?.skeleton?.bones.map((b) => b.name) ?? [];
}

/**
 * Get morph target names
 */
export function getFBXMorphTargets(node: HSPlusNode): string[] {
  const state = getFBXState(node);
  return state?.morphTargetNames ?? [];
}

export default fbxHandler;
