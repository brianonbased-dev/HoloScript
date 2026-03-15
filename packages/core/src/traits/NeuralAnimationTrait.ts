/**
 * NeuralAnimation Trait
 *
 * Neural motion synthesis and animation generation.
 * Supports pose-to-animation, motion retargeting, and procedural animation.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type AnimationModel = 'neural_motion' | 'motion_matching' | 'diffusion';

export interface SkeletonPose {
  joints: Record<
    string,
    { position: [number, number, number]; rotation: [number, number, number, number] }
  >;
  timestamp: number;
}

export interface NeuralAnimationConfig {
  animation_model: AnimationModel;
  smoothing: number; // 0.0 - 1.0
  retargeting: boolean;
  blend_weight: number; // 0.0 - 1.0 for blending with existing animation
  target_skeleton?: string; // Skeleton to retarget to
}

interface NeuralAnimationState {
  current_pose: SkeletonPose | null;
  animation_buffer: SkeletonPose[];
  is_generating: boolean;
  target_pose: SkeletonPose | null;
  blend_accumulator: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function interpolatePoses(from: SkeletonPose, to: SkeletonPose, t: number): SkeletonPose {
  const interpolated: SkeletonPose = {
    joints: {},
    timestamp: Date.now(),
  };

  for (const jointName in from.joints) {
    const fromJoint = from.joints[jointName];
    const toJoint = to.joints[jointName];

    if (!toJoint) {
      interpolated.joints[jointName] = fromJoint;
      continue;
    }

    interpolated.joints[jointName] = {
      position: [
        fromJoint.position[0] * (1 - t) + toJoint.position[0] * t,
        fromJoint.position[1] * (1 - t) + toJoint.position[1] * t,
        fromJoint.position[2] * (1 - t) + toJoint.position[2] * t,
      ],
      rotation: [
        fromJoint.rotation[0] * (1 - t) + toJoint.rotation[0] * t,
        fromJoint.rotation[1] * (1 - t) + toJoint.rotation[1] * t,
        fromJoint.rotation[2] * (1 - t) + toJoint.rotation[2] * t,
        fromJoint.rotation[3] * (1 - t) + toJoint.rotation[3] * t,
      ],
    };
  }

  return interpolated;
}

// =============================================================================
// HANDLER
// =============================================================================

export const neuralAnimationHandler: TraitHandler<NeuralAnimationConfig> = {
  name: 'neural_animation',

  defaultConfig: {
    animation_model: 'neural_motion',
    smoothing: 0.7,
    retargeting: false,
    blend_weight: 1.0,
    target_skeleton: undefined,
  },

  onAttach(node, config, context) {
    const state: NeuralAnimationState = {
      current_pose: null,
      animation_buffer: [],
      is_generating: false,
      target_pose: null,
      blend_accumulator: 0,
    };
    (node as any).__neuralAnimationState = state;

    context.emit?.('neural_animation_init', {
      node,
      model: config.animation_model,
      retargeting: config.retargeting,
    });
  },

  onDetach(node, config, context) {
    delete (node as any).__neuralAnimationState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__neuralAnimationState as NeuralAnimationState;
    if (!state || !state.target_pose) return;

    // Smooth interpolation to target pose
    if (state.current_pose) {
      state.blend_accumulator += delta * (1 / config.smoothing);
      const t = Math.min(state.blend_accumulator, 1.0);

      const blended = interpolatePoses(
        state.current_pose,
        state.target_pose,
        t * config.blend_weight
      );

      state.current_pose = blended;

      context.emit?.('neural_animation_frame', {
        node,
        pose: state.current_pose,
      });

      if (t >= 1.0) {
        state.target_pose = null;
        state.blend_accumulator = 0;
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__neuralAnimationState as NeuralAnimationState;
    if (!state) return;

    if (event.type === 'neural_animation_synthesize') {
      const targetPose = event.target_pose as SkeletonPose;
      state.target_pose = targetPose;
      state.blend_accumulator = 0;
      state.is_generating = true;

      context.emit?.('on_animation_synthesis_start', {
        node,
        targetPose,
      });
    } else if (event.type === 'neural_animation_retarget') {
      const sourceSkeleton = event.source_skeleton as string;
      const targetSkeleton = config.target_skeleton || (event.target_skeleton as string);

      // Request retargeting computation
      context.emit?.('neural_animation_request_retarget', {
        node,
        sourceSkeleton,
        targetSkeleton,
        currentPose: state.current_pose,
      });
    } else if (event.type === 'neural_animation_retarget_result') {
      const retargetedPose = event.pose as SkeletonPose;
      state.target_pose = retargetedPose;
      state.blend_accumulator = 0;

      context.emit?.('on_retargeting_complete', {
        node,
        pose: retargetedPose,
      });
    }
  },
};
