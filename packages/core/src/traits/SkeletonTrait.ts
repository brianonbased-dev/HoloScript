import type { Vector3 } from '../types';
/**
 * @holoscript/core Skeleton Trait
 *
 * Enables bone-based skeletal animation with blend trees and IK support.
 *
 * @example
 * ```hsplus
 * object "Character" {
 *   @skeleton {
 *     rig: "humanoid",
 *     animations: ["idle", "walk", "run", "jump"],
 *     blendTree: {
 *       type: "1D",
 *       parameter: "speed",
 *       clips: [
 *         { name: "idle", threshold: 0 },
 *         { name: "walk", threshold: 0.5 },
 *         { name: "run", threshold: 1 }
 *       ]
 *     }
 *   }
 * }
 * ```
 */

/**
 * 3D Vector
 */


/**
 * Quaternion rotation — canonical 4-tuple definition lives at
 * packages/core/src/types/HoloScriptPlus.ts:26. Founder ruling (2026-04-28):
 * single source of truth.
 */
import type { Quaternion } from '../types/HoloScriptPlus';
export type { Quaternion };

/**
 * Bone transform
 */
export interface BoneTransform {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

/**
 * Bone definition
 */
export interface BoneDefinition {
  /** Bone name */
  name: string;

  /** Parent bone name (null for root) */
  parent?: string;

  /** Local bind pose transform */
  bindPose: BoneTransform;

  /** Length of bone */
  length: number;

  /** Children bone names */
  children?: string[];
}

/**
 * Humanoid bone mapping for auto-rigging
 */
export interface HumanoidBoneMap {
  hips?: string;
  spine?: string;
  chest?: string;
  upperChest?: string;
  neck?: string;
  head?: string;
  leftShoulder?: string;
  leftUpperArm?: string;
  leftLowerArm?: string;
  leftHand?: string;
  rightShoulder?: string;
  rightUpperArm?: string;
  rightLowerArm?: string;
  rightHand?: string;
  leftUpperLeg?: string;
  leftLowerLeg?: string;
  leftFoot?: string;
  leftToes?: string;
  rightUpperLeg?: string;
  rightLowerLeg?: string;
  rightFoot?: string;
  rightToes?: string;
}

/**
 * Animation clip
 */
export interface AnimationClip {
  /** Clip name */
  name: string;

  /** Duration in seconds */
  duration: number;

  /** Frames per second */
  fps?: number;

  /** Is looping */
  loop?: boolean;

  /** Animation curves per bone */
  curves?: Map<string, BoneAnimationCurve>;

  /** Animation events */
  events?: AnimationEvent[];

  /** Root motion enabled */
  rootMotion?: boolean;

  /** Additive animation */
  additive?: boolean;
}

/**
 * Animation curve for a bone
 */
export interface BoneAnimationCurve {
  /** Position keyframes */
  position?: Keyframe<Vector3>[];

  /** Rotation keyframes */
  rotation?: Keyframe<Quaternion>[];

  /** Scale keyframes */
  scale?: Keyframe<Vector3>[];
}

/**
 * Keyframe
 */
export interface Keyframe<T> {
  time: number;
  value: T;
  inTangent?: T;
  outTangent?: T;
}

/**
 * Animation event (triggered at specific time)
 */
export interface AnimationEvent {
  time: number;
  name: string;
  data?: Record<string, unknown>;
}

/**
 * Blend tree types
 */
export type BlendTreeType = '1D' | '2D-simple' | '2D-freeform' | 'direct';

/**
 * Blend tree node
 */
export interface BlendTreeNode {
  /** Blend tree type */
  type: BlendTreeType;

  /** Parameter(s) controlling blend */
  parameter: string;
  parameter2?: string; // For 2D

  /** Motion clips with thresholds */
  motions: BlendTreeMotion[];
}

/**
 * Motion in blend tree
 */
export interface BlendTreeMotion {
  /** Clip name or nested blend tree */
  clip?: string;
  blendTree?: BlendTreeNode;

  /** 1D threshold */
  threshold?: number;

  /** 2D position */
  position?: { x: number; y: number };

  /** Direct blend weight */
  directWeight?: number;

  /** Speed multiplier */
  speed?: number;

  /** Mirror animation */
  mirror?: boolean;
}

/**
 * Animation layer
 */
export interface AnimationLayer {
  /** Layer name */
  name: string;

  /** Blend weight (0-1) */
  weight: number;

  /** Blending mode */
  blendMode: 'override' | 'additive';

  /** Mask (which bones this layer affects) */
  mask?: string[];

  /** Is sync layer (syncs with base layer timing) */
  syncedToBase?: boolean;
}

/**
 * Skeleton configuration
 */
export interface SkeletonConfig {
  /** Rig type (custom or humanoid) */
  rigType?: 'custom' | 'humanoid';

  /** Bone definitions (for custom) */
  bones?: BoneDefinition[];

  /** Humanoid bone mapping */
  humanoidMap?: HumanoidBoneMap;

  /** Animation clips */
  clips?: AnimationClip[];

  /** Blend trees */
  blendTrees?: Map<string, BlendTreeNode>;

  /** Animation layers */
  layers?: AnimationLayer[];

  /** Animation parameters */
  parameters?: Map<string, number | boolean>;

  /** Default clip */
  defaultClip?: string;

  /** Animation speed multiplier */
  speed?: number;

  /** Root motion enabled */
  rootMotion?: boolean;

  /** Culling mode */
  cullingMode?: 'always' | 'cull-update' | 'cull-completely';
}

/**
 * Animation state
 */
export interface AnimationState {
  /** Currently playing clip */
  currentClip?: string;

  /** Current time in clip */
  currentTime: number;

  /** Normalized time (0-1) */
  normalizedTime: number;

  /** Is playing */
  isPlaying: boolean;

  /** Current layer weights */
  layerWeights: number[];

  /** Active blend tree */
  activeBlendTree?: string;

  /** Crossfade target */
  crossfadeTarget?: string;
  crossfadeProgress?: number;
}

/**
 * Animation event callback
 */
type AnimationEventCallback = (event: AnimationEvent) => void;

/**
 * Skeleton Trait - Bone-based animation
 */
export class SkeletonTrait {
  private config: SkeletonConfig;
  private state: AnimationState;
  private bones: Map<string, BoneDefinition> = new Map();
  private boneTransforms: Map<string, BoneTransform> = new Map();
  private clips: Map<string, AnimationClip> = new Map();
  private parameters: Map<string, number | boolean> = new Map();
  private eventListeners: Map<string, AnimationEventCallback[]> = new Map();
  private enabled: boolean = true;

  constructor(config: Partial<SkeletonConfig> = {}) {
    this.config = {
      rigType: config.rigType ?? 'custom',
      bones: config.bones,
      humanoidMap: config.humanoidMap,
      clips: config.clips,
      blendTrees: config.blendTrees ?? new Map(),
      layers: config.layers ?? [{ name: 'base', weight: 1, blendMode: 'override' }],
      parameters: config.parameters ?? new Map(),
      defaultClip: config.defaultClip,
      speed: config.speed ?? 1.0,
      rootMotion: config.rootMotion ?? false,
      cullingMode: config.cullingMode ?? 'always',
    };

    this.state = {
      currentTime: 0,
      normalizedTime: 0,
      isPlaying: false,
      layerWeights: this.config.layers?.map((l) => l.weight) ?? [1],
    };

    // Initialize bones
    if (config.bones) {
      for (const bone of config.bones) {
        this.bones.set(bone.name, bone);
        this.boneTransforms.set(bone.name, { ...bone.bindPose });
      }
    }

    // Initialize clips
    if (config.clips) {
      for (const clip of config.clips) {
        this.clips.set(clip.name, clip);
      }
    }

    // Initialize parameters
    if (config.parameters) {
      this.parameters = new Map(config.parameters);
    }
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): SkeletonConfig {
    return { ...this.config };
  }

  /**
   * Get animation state
   */
  public getState(): AnimationState {
    return { ...this.state };
  }

  /**
   * Get bone count
   */
  public getBoneCount(): number {
    return this.bones.size;
  }

  /**
   * Get bone names
   */
  public getBoneNames(): string[] {
    return Array.from(this.bones.keys());
  }

  /**
   * Get bone transform
   */
  public getBoneTransform(boneName: string): BoneTransform | undefined {
    return this.boneTransforms.get(boneName);
  }

  /**
   * Set bone transform (for IK or procedural animation)
   */
  public setBoneTransform(boneName: string, transform: Partial<BoneTransform>): void {
    const current = this.boneTransforms.get(boneName);
    if (current) {
      this.boneTransforms.set(boneName, {
        position: transform.position ?? current.position,
        rotation: transform.rotation ?? current.rotation,
        scale: transform.scale ?? current.scale,
      });
    }
  }

  // ============================================================================
  // Animation Playback
  // ============================================================================

  /**
   * Play animation clip
   */
  public play(
    clipName: string,
    options?: { speed?: number; layer?: number; crossfade?: number }
  ): void {
    const clip = this.clips.get(clipName);
    if (!clip) {
      console.warn(`Animation clip not found: ${clipName}`);
      return;
    }

    const crossfade = options?.crossfade ?? 0;

    if (crossfade > 0 && this.state.currentClip) {
      // Start crossfade
      this.state.crossfadeTarget = clipName;
      this.state.crossfadeProgress = 0;
    } else {
      this.state.currentClip = clipName;
      this.state.currentTime = 0;
      this.state.normalizedTime = 0;
    }

    this.state.isPlaying = true;
  }

  /**
   * Stop animation
   */
  public stop(): void {
    this.state.isPlaying = false;
    this.state.currentTime = 0;
    this.state.normalizedTime = 0;
  }

  /**
   * Pause animation
   */
  public pause(): void {
    this.state.isPlaying = false;
  }

  /**
   * Resume animation
   */
  public resume(): void {
    this.state.isPlaying = true;
  }

  /**
   * Is playing
   */
  public isPlaying(): boolean {
    return this.state.isPlaying;
  }

  /**
   * Get current clip name
   */
  public getCurrentClip(): string | undefined {
    return this.state.currentClip;
  }

  /**
   * Set playback speed
   */
  public setSpeed(speed: number): void {
    this.config.speed = speed;
  }

  /**
   * Get playback speed
   */
  public getSpeed(): number {
    return this.config.speed ?? 1.0;
  }

  // ============================================================================
  // Parameters (for blend trees and state machines)
  // ============================================================================

  /**
   * Set parameter
   */
  public setParameter(name: string, value: number | boolean): void {
    this.parameters.set(name, value);
  }

  /**
   * Get parameter
   */
  public getParameter(name: string): number | boolean | undefined {
    return this.parameters.get(name);
  }

  /**
   * Set float parameter
   */
  public setFloat(name: string, value: number): void {
    this.parameters.set(name, value);
  }

  /**
   * Set bool parameter
   */
  public setBool(name: string, value: boolean): void {
    this.parameters.set(name, value);
  }

  /**
   * Set trigger (auto-resets)
   */
  public setTrigger(name: string): void {
    this.parameters.set(name, true);
    // Trigger should reset after being consumed
  }

  // ============================================================================
  // Blend Trees
  // ============================================================================

  /**
   * Add blend tree
   */
  public addBlendTree(name: string, tree: BlendTreeNode): void {
    if (!this.config.blendTrees) {
      this.config.blendTrees = new Map();
    }
    this.config.blendTrees.set(name, tree);
  }

  /**
   * Activate blend tree
   */
  public activateBlendTree(name: string): void {
    if (this.config.blendTrees?.has(name)) {
      this.state.activeBlendTree = name;
    }
  }

  // ============================================================================
  // Layers
  // ============================================================================

  /**
   * Set layer weight
   */
  public setLayerWeight(layerIndex: number, weight: number): void {
    if (this.state.layerWeights[layerIndex] !== undefined) {
      this.state.layerWeights[layerIndex] = Math.max(0, Math.min(1, weight));
    }
  }

  /**
   * Get layer weight
   */
  public getLayerWeight(layerIndex: number): number {
    return this.state.layerWeights[layerIndex] ?? 0;
  }

  // ============================================================================
  // Clips
  // ============================================================================

  /**
   * Add animation clip
   */
  public addClip(clip: AnimationClip): void {
    this.clips.set(clip.name, clip);
    if (!this.config.clips) {
      this.config.clips = [];
    }
    this.config.clips.push(clip);
  }

  /**
   * Get clip
   */
  public getClip(name: string): AnimationClip | undefined {
    return this.clips.get(name);
  }

  /**
   * Get clip duration
   */
  public getClipDuration(name: string): number {
    return this.clips.get(name)?.duration ?? 0;
  }

  /**
   * Get all clip names
   */
  public getClipNames(): string[] {
    return Array.from(this.clips.keys());
  }

  // ============================================================================
  // Update (called each frame)
  // ============================================================================

  /**
   * Update animation (called by animation system each frame)
   */
  public update(deltaTime: number): void {
    if (!this.enabled || !this.state.isPlaying) return;

    const clip = this.state.currentClip ? this.clips.get(this.state.currentClip) : undefined;
    if (!clip) return;

    const speed = this.config.speed ?? 1.0;
    this.state.currentTime += deltaTime * speed;

    if (clip.loop) {
      this.state.currentTime = this.state.currentTime % clip.duration;
    } else if (this.state.currentTime >= clip.duration) {
      this.state.currentTime = clip.duration;
      this.state.isPlaying = false;
    }

    this.state.normalizedTime = clip.duration > 0 ? this.state.currentTime / clip.duration : 0;

    // Check for animation events
    if (clip.events) {
      for (const event of clip.events) {
        // Simplified event checking
        if (Math.abs(this.state.currentTime - event.time) < deltaTime) {
          this.emitEvent(event);
        }
      }
    }

    // Handle crossfade
    if (this.state.crossfadeTarget && this.state.crossfadeProgress !== undefined) {
      this.state.crossfadeProgress += deltaTime;
      // Crossfade completion logic would go here
    }
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Add event listener
   */
  public on(event: string, callback: AnimationEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  public off(event: string, callback: AnimationEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit animation event
   */
  private emitEvent(event: AnimationEvent): void {
    const listeners = this.eventListeners.get(event.name);
    if (listeners) {
      for (const callback of listeners) {
        callback(event);
      }
    }
  }

  // ============================================================================
  // Enable/Disable
  // ============================================================================

  /**
   * Enable/disable skeleton
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Serialize for animation system
   */
  public serialize(): Record<string, unknown> {
    return {
      rigType: this.config.rigType,
      boneCount: this.bones.size,
      clipCount: this.clips.size,
      layerCount: this.config.layers?.length ?? 0,
      currentClip: this.state.currentClip,
      currentTime: this.state.currentTime,
      normalizedTime: this.state.normalizedTime,
      isPlaying: this.state.isPlaying,
      speed: this.config.speed,
      rootMotion: this.config.rootMotion,
      enabled: this.enabled,
    };
  }
}

/**
 * Factory function
 */
export function createSkeletonTrait(config: Partial<SkeletonConfig> = {}): SkeletonTrait {
  return new SkeletonTrait(config);
}

// Type aliases for re-export
export type SkeletonRigType = 'custom' | 'humanoid';
export type SkeletonBlendTreeType = BlendTreeType;
export type SkeletonCullingMode = 'always' | 'cull-update' | 'cull-completely';

// ── Handler (delegates to SkeletonTrait) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const skeletonHandler = {
  name: 'skeleton',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new SkeletonTrait(config);
    node.__skeleton_instance = instance;
    ctx.emit('skeleton_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__skeleton_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('skeleton_detached', { node });
    delete node.__skeleton_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__skeleton_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'skeleton_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('skeleton_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__skeleton_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
