import type { Vector3 } from '@holoscript/core';
export {
  AnimClip,
  type InterpolationMode,
  type ClipKeyframe,
  type ClipTrack,
  type ClipEvent,
} from './AnimationClip';

export {
  AnimationEngine,
  Easing,
  type EasingFn,
  type Keyframe as AnimationEngineKeyframe,
  type AnimationClip as EngineAnimationClip,
  type ActiveAnimation,
} from './AnimationEngine';

export {
  AnimationGraph,
  type AnimationClip as GraphAnimationClip,
  type AnimationTrack,
  type Keyframe as GraphKeyframe,
  type AnimationState,
  type AnimationTransition,
  type TransitionCondition,
  type BlendNode,
  type AnimationLayer,
  type AnimationGraphInstance,
} from './AnimationGraph';

export {
  animationTraitHandler,
  getSharedAnimationEngine,
  type HSPlusNode,
  type TraitHandler,
  type AnimationTraitConfig,
  type AnimationClipDef,
  type SpringDef,
} from './AnimationTrait';

export {
  AnimationTransitionSystem,
  type IVector3,
  type BonePose,
  type TransitionConfig,
  type TransitionDirection as RagdollTransitionDirection,
  type BlendState,
} from './AnimationTransitions';

export { AvatarController, type AvatarInput } from './AvatarController';

export { BoneSystem, type BoneTransform, type Bone } from './BoneSystem';

export {
  CutsceneTimeline,
  CutsceneBuilder,
  type TimelineEventType,
  type TimelineEvent,
  type TimelineTrack,
  type CutsceneDefinition,
  type CutsceneState,
} from './CutsceneTimeline';

export { IKSolver, type IKBone, type IKChain, type FootPlacementConfig } from './IKSolver';

export {
  MorphTargetSystem,
  type MorphDelta,
  type MorphTarget,
  type MorphPreset,
} from './MorphTargets';

export { SkeletalBlender, type AnimPose, type AnimLayer } from './SkeletalBlender';

export {
  SpringAnimator,
  Vec3SpringAnimator,
  SpringPresets,
  type SpringConfig,
} from './SpringAnimator';

export { Timeline, type TimelineMode, type TimelineEntry, type TimelineConfig } from './Timeline';

export {
  TransitionSystem,
  type TransitionDirection as UiTransitionDirection,
  type TransitionOptions,
} from './TransitionSystem';
