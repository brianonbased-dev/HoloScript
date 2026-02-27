/**
 * viralPoseTrait.ts — Viral Pose Trait for Auto-Cycling Trending Poses
 *
 * MEME-004: Viral pose trait
 * Priority: Medium | Estimate: 6 hours
 *
 * Features:
 * - Auto-cycle through viral poses
 * - Smooth transitions between poses
 * - Manual pose triggering
 * - Configurable pose sequence
 * - Hold time and transition timing
 */

import * as THREE from 'three';
import {
  type ViralPose,
  type BonePose,
  type PoseCategory,
  getAllPoses,
  getPoseById,
  getPosesByCategory,
  getTrendingPoses,
  interpolatePoses,
  applyEasing,
} from '../poseLibrary';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ViralPoseConfig {
  /**
   * Poses to cycle through (IDs or categories)
   * Default: 'trending' (auto-selects trending poses)
   */
  poses?: string[] | PoseCategory;

  /**
   * Auto-cycle through poses
   * Default: true
   */
  autoCycle?: boolean;

  /**
   * Time to hold each pose (ms)
   * Default: use pose.duration
   */
  holdTime?: number;

  /**
   * Transition duration between poses (ms)
   * Default: 500ms
   */
  transitionDuration?: number;

  /**
   * Transition easing
   * Default: 'easeInOut'
   */
  transitionEasing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce';

  /**
   * Randomize pose order
   * Default: false
   */
  randomOrder?: boolean;

  /**
   * Loop pose sequence
   * Default: true
   */
  loop?: boolean;
}

interface PoseState {
  currentPose: ViralPose | null;
  nextPose: ViralPose | null;
  isTransitioning: boolean;
  transitionProgress: number;
  holdTimeRemaining: number;
  poseIndex: number;
}

// ─── Viral Pose Trait ────────────────────────────────────────────────────────

export class ViralPoseTrait {
  private config: Required<ViralPoseConfig>;
  private poseSequence: ViralPose[];
  private state: PoseState;
  private skeleton: THREE.Skeleton | null = null;
  private boneMap: Map<string, THREE.Bone> = new Map();
  private onPoseChangeCallbacks: Array<(pose: ViralPose) => void> = [];

  constructor(config: ViralPoseConfig = {}) {
    // Default configuration
    this.config = {
      poses: config.poses || 'trending',
      autoCycle: config.autoCycle ?? true,
      holdTime: config.holdTime ?? 0, // 0 = use pose.duration
      transitionDuration: config.transitionDuration ?? 500,
      transitionEasing: config.transitionEasing || 'easeInOut',
      randomOrder: config.randomOrder ?? false,
      loop: config.loop ?? true,
    };

    // Initialize pose sequence
    this.poseSequence = this.loadPoseSequence();

    // Initialize state
    this.state = {
      currentPose: null,
      nextPose: this.poseSequence[0] || null,
      isTransitioning: false,
      transitionProgress: 0,
      holdTimeRemaining: 0,
      poseIndex: -1,
    };

    console.log(
      `[ViralPoseTrait] Initialized with ${this.poseSequence.length} poses`,
      this.poseSequence.map((p) => p.name)
    );
  }

  /**
   * Load pose sequence from config
   */
  private loadPoseSequence(): ViralPose[] {
    let poses: ViralPose[];

    if (typeof this.config.poses === 'string') {
      // Category-based selection
      if (this.config.poses === 'trending') {
        poses = getTrendingPoses();
      } else {
        poses = getPosesByCategory(this.config.poses as PoseCategory);
      }
    } else {
      // ID-based selection
      poses = this.config.poses
        .map((id) => getPoseById(id))
        .filter((p): p is ViralPose => p !== undefined);
    }

    if (poses.length === 0) {
      console.warn('[ViralPoseTrait] No poses found, using all poses');
      poses = getAllPoses();
    }

    // Randomize if configured
    if (this.config.randomOrder) {
      poses = this.shuffleArray([...poses]);
    }

    return poses;
  }

  /**
   * Attach to skeleton
   */
  attachToSkeleton(skeleton: THREE.Skeleton): void {
    this.skeleton = skeleton;
    this.buildBoneMap();
    console.log('[ViralPoseTrait] Attached to skeleton with', this.boneMap.size, 'bones');
  }

  /**
   * Build bone name → THREE.Bone map
   */
  private buildBoneMap(): void {
    if (!this.skeleton) return;

    this.boneMap.clear();

    const traverse = (bone: THREE.Bone) => {
      this.boneMap.set(bone.name, bone);
      bone.children.forEach((child) => {
        if (child instanceof THREE.Bone) {
          traverse(child);
        }
      });
    };

    this.skeleton.bones.forEach((bone) => traverse(bone));
  }

  /**
   * Start auto-cycling
   */
  start(): void {
    this.config.autoCycle = true;
    if (!this.state.currentPose && this.poseSequence.length > 0) {
      this.triggerNextPose();
    }
    console.log('[ViralPoseTrait] Started auto-cycling');
  }

  /**
   * Stop auto-cycling
   */
  stop(): void {
    this.config.autoCycle = false;
    console.log('[ViralPoseTrait] Stopped auto-cycling');
  }

  /**
   * Trigger specific pose by ID
   */
  triggerPose(poseId: string): void {
    const pose = getPoseById(poseId);
    if (!pose) {
      console.warn('[ViralPoseTrait] Pose not found:', poseId);
      return;
    }

    this.transitionToPose(pose);
  }

  /**
   * Trigger next pose in sequence
   */
  triggerNextPose(): void {
    if (this.poseSequence.length === 0) return;

    // Advance to next pose
    this.state.poseIndex = (this.state.poseIndex + 1) % this.poseSequence.length;

    // Check loop condition
    if (!this.config.loop && this.state.poseIndex === 0 && this.state.currentPose) {
      console.log('[ViralPoseTrait] Sequence complete, not looping');
      return;
    }

    const nextPose = this.poseSequence[this.state.poseIndex];
    this.transitionToPose(nextPose);
  }

  /**
   * Trigger previous pose in sequence
   */
  triggerPreviousPose(): void {
    if (this.poseSequence.length === 0) return;

    this.state.poseIndex =
      (this.state.poseIndex - 1 + this.poseSequence.length) % this.poseSequence.length;
    const prevPose = this.poseSequence[this.state.poseIndex];
    this.transitionToPose(prevPose);
  }

  /**
   * Transition to a new pose
   */
  private transitionToPose(pose: ViralPose): void {
    this.state.nextPose = pose;
    this.state.isTransitioning = true;
    this.state.transitionProgress = 0;

    console.log('[ViralPoseTrait] Transitioning to:', pose.name);
  }

  /**
   * Update (call in animation loop)
   */
  update(deltaTime: number): void {
    if (!this.skeleton || this.poseSequence.length === 0) return;

    if (this.state.isTransitioning) {
      this.updateTransition(deltaTime);
    } else if (this.config.autoCycle && this.state.currentPose) {
      this.updateHold(deltaTime);
    }
  }

  /**
   * Update transition between poses
   */
  private updateTransition(deltaTime: number): void {
    this.state.transitionProgress += deltaTime / this.config.transitionDuration;

    if (this.state.transitionProgress >= 1) {
      // Transition complete
      this.state.transitionProgress = 1;
      this.state.isTransitioning = false;
      this.state.currentPose = this.state.nextPose;
      this.state.nextPose = null;

      // Set hold time
      const holdTime = this.config.holdTime || this.state.currentPose!.duration;
      this.state.holdTimeRemaining = holdTime;

      // Notify listeners
      this.onPoseChangeCallbacks.forEach((cb) => cb(this.state.currentPose!));

      console.log('[ViralPoseTrait] Transition complete:', this.state.currentPose!.name);
    }

    // Apply interpolated pose
    this.applyInterpolatedPose();
  }

  /**
   * Update hold time
   */
  private updateHold(deltaTime: number): void {
    this.state.holdTimeRemaining -= deltaTime;

    if (this.state.holdTimeRemaining <= 0) {
      // Hold time expired, trigger next pose
      this.triggerNextPose();
    }
  }

  /**
   * Apply interpolated pose to skeleton
   */
  private applyInterpolatedPose(): void {
    if (!this.state.currentPose && !this.state.nextPose) return;

    let bones: BonePose[];

    if (this.state.isTransitioning && this.state.currentPose && this.state.nextPose) {
      // Interpolate between current and next pose
      const easedProgress = applyEasing(
        this.state.transitionProgress,
        this.config.transitionEasing
      );
      bones = interpolatePoses(this.state.currentPose, this.state.nextPose, easedProgress);
    } else if (this.state.currentPose) {
      // Apply current pose
      bones = this.state.currentPose.bones;
    } else if (this.state.nextPose) {
      // Apply next pose (first pose)
      bones = this.state.nextPose.bones;
    } else {
      return;
    }

    // Apply bone rotations
    bones.forEach((bonePose) => {
      const bone = this.boneMap.get(bonePose.boneName);
      if (!bone) return;

      // Apply rotation
      bone.quaternion.set(
        bonePose.rotation.x,
        bonePose.rotation.y,
        bonePose.rotation.z,
        bonePose.rotation.w
      );

      // Apply position if specified
      if (bonePose.position) {
        bone.position.set(bonePose.position.x, bonePose.position.y, bonePose.position.z);
      }
    });
  }

  /**
   * Get current pose
   */
  getCurrentPose(): ViralPose | null {
    return this.state.currentPose;
  }

  /**
   * Get pose sequence
   */
  getPoseSequence(): ViralPose[] {
    return this.poseSequence;
  }

  /**
   * Set pose sequence
   */
  setPoseSequence(poses: string[] | PoseCategory): void {
    this.config.poses = poses;
    this.poseSequence = this.loadPoseSequence();
    this.state.poseIndex = -1;
    console.log('[ViralPoseTrait] Updated pose sequence:', this.poseSequence.map((p) => p.name));
  }

  /**
   * Listen to pose changes
   */
  onPoseChange(callback: (pose: ViralPose) => void): () => void {
    this.onPoseChangeCallbacks.push(callback);
    return () => {
      const index = this.onPoseChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onPoseChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Get current state (for debugging/UI)
   */
  getState(): Readonly<PoseState> {
    return { ...this.state };
  }

  /**
   * Dispose trait
   */
  dispose(): void {
    this.stop();
    this.onPoseChangeCallbacks = [];
    this.boneMap.clear();
    this.skeleton = null;
  }
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/**
 * React hook for viral pose trait
 */
export function useViralPose(
  skeleton: THREE.Skeleton | null,
  config?: ViralPoseConfig
) {
  const [trait, setTrait] = React.useState<ViralPoseTrait | null>(null);
  const [currentPose, setCurrentPose] = React.useState<ViralPose | null>(null);

  React.useEffect(() => {
    if (!skeleton) return;

    const viralTrait = new ViralPoseTrait(config);
    viralTrait.attachToSkeleton(skeleton);

    // Listen to pose changes
    const unsubscribe = viralTrait.onPoseChange((pose) => {
      setCurrentPose(pose);
    });

    setTrait(viralTrait);

    return () => {
      unsubscribe();
      viralTrait.dispose();
    };
  }, [skeleton, config]);

  const triggerPose = React.useCallback(
    (poseId: string) => {
      trait?.triggerPose(poseId);
    },
    [trait]
  );

  const triggerNext = React.useCallback(() => {
    trait?.triggerNextPose();
  }, [trait]);

  const triggerPrevious = React.useCallback(() => {
    trait?.triggerPreviousPose();
  }, [trait]);

  const start = React.useCallback(() => {
    trait?.start();
  }, [trait]);

  const stop = React.useCallback(() => {
    trait?.stop();
  }, [trait]);

  return {
    trait,
    currentPose,
    triggerPose,
    triggerNext,
    triggerPrevious,
    start,
    stop,
    poseSequence: trait?.getPoseSequence() || [],
  };
}

// Lazy React import
let React: typeof import('react');
if (typeof window !== 'undefined') {
  React = require('react');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default ViralPoseTrait;
