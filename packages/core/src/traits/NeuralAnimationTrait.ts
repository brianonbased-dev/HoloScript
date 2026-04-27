/**
 * NeuralAnimation Trait
 *
 * Neural motion synthesis and animation generation.
 * Supports pose-to-animation, motion retargeting, and procedural animation.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';
import type {
  MotionMatchingEngine,
  MotionInferenceResult,
  Vec3,
  Gait,
  ContactFeatures,
} from './engines/motion-matching';

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

/**
 * Locomotion knobs from the @neural_locomotion spec (idea-run-3 2026-04-26).
 * Nested + optional so existing flat config remains back-compatible.
 * Active only when animation_model === 'motion_matching' and an engine
 * has been registered via the 'neural_animation_set_engine' event.
 */
export interface NeuralLocomotionConfig {
  max_speed?: number;
  min_speed?: number;
  acceleration?: number;
  deceleration?: number;
  turn_rate?: number;
  stride_scale?: number;
  terrain_adaptation?: boolean;
  foot_ik_enabled?: boolean;
  energy_efficiency?: number;
  performance_mode?: 'high' | 'balanced' | 'low' | 'auto';
  fallback_mode?: 'physics' | 'clip' | 'disabled';
  lod_distance?: number;
  blend_with_physics?: number;
  trajectory_visual?: boolean;
}

export interface NeuralAnimationConfig {
  animation_model: AnimationModel;
  smoothing: number; // 0.0 - 1.0
  retargeting: boolean;
  blend_weight: number; // 0.0 - 1.0 for blending with existing animation
  target_skeleton?: string; // Skeleton to retarget to
  locomotion?: NeuralLocomotionConfig;
}

export interface LocomotionState {
  phase: number;
  trajectory: Array<[number, number, number]>;
  stability: number;
  contact: ContactFeatures;
  currentGait: Gait;
  /**
   * Renamed from `energyCost` per /critic Serious #4. NOT physical
   * cost-of-transport — see MotionInferenceResult.kineticEnergyProxy.
   */
  kineticEnergyProxy: number;
}

interface NeuralAnimationState {
  current_pose: SkeletonPose | null;
  animation_buffer: SkeletonPose[];
  is_generating: boolean;
  target_pose: SkeletonPose | null;
  blend_accumulator: number;
  // Motion-matching seam — populated only when an engine is set + animation_model === 'motion_matching'
  engine: MotionMatchingEngine | null;
  target_velocity: Vec3;
  locomotion: LocomotionState | null;
  prev_left_contact: boolean;
  prev_right_contact: boolean;
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
      engine: null,
      target_velocity: { x: 0, y: 0, z: 0 },
      locomotion: null,
      prev_left_contact: false,
      prev_right_contact: false,
    };
    node.__neuralAnimationState = state;

    context.emit?.('neural_animation_init', {
      node,
      model: config.animation_model,
      retargeting: config.retargeting,
    });
  },

  onDetach(node, config, context) {
    delete node.__neuralAnimationState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__neuralAnimationState as NeuralAnimationState;
    if (!state) return;

    // Motion-matching path — engine present + correct model selected.
    // Falls through to legacy interpolator path when engine missing
    // (per fallback_mode: 'clip' default — see locomotion config).
    if (config.animation_model === 'motion_matching' && state.engine) {
      const result: MotionInferenceResult = state.engine.infer({
        targetVelocity: state.target_velocity,
        currentPhase: state.locomotion?.phase ?? 0,
        delta,
        energyEfficiency: config.locomotion?.energy_efficiency,
      });

      state.locomotion = {
        phase: result.phase,
        trajectory: result.trajectory,
        stability: result.stability,
        contact: result.contactFeatures,
        currentGait: result.gait,
        kineticEnergyProxy: result.kineticEnergyProxy,
      };
      state.current_pose = result.pose;

      // Foot-contact transition events — drive @ik bridge (WIRE-1)
      if (result.contactFeatures.leftFoot !== state.prev_left_contact) {
        context.emit?.('on_foot_contact', { node, side: 'left', state: result.contactFeatures.leftFoot });
        state.prev_left_contact = result.contactFeatures.leftFoot;
      }
      if (result.contactFeatures.rightFoot !== state.prev_right_contact) {
        context.emit?.('on_foot_contact', { node, side: 'right', state: result.contactFeatures.rightFoot });
        state.prev_right_contact = result.contactFeatures.rightFoot;
      }

      // Stumble detection — drives recovery hook (spec §5)
      if (result.stability < 0.3) {
        context.emit?.('on_stumble_detected', { node, stability: result.stability });
      }

      context.emit?.('neural_animation_frame', { node, pose: state.current_pose });
      return;
    }

    // Legacy pose-blender path — preserved unchanged for back-compat.
    if (!state.target_pose) return;

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
    const state = node.__neuralAnimationState as NeuralAnimationState;
    if (!state) return;

    // Motion-matching seam events
    if (event.type === 'neural_animation_set_engine') {
      state.engine = event.engine as MotionMatchingEngine;
      context.emit?.('on_locomotion_initialized', {
        node,
        modelId: state.engine?.modelId,
      });
      return;
    }
    if (event.type === 'neural_animation_clear_engine') {
      state.engine?.dispose();
      state.engine = null;
      state.locomotion = null;
      context.emit?.('on_locomotion_fallback', {
        node,
        mode: config.locomotion?.fallback_mode ?? 'clip',
      });
      return;
    }
    if (event.type === 'neural_animation_set_target_velocity') {
      const v = (event.velocity ?? { x: 0, y: 0, z: 0 }) as Partial<Vec3>;
      state.target_velocity = { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 };
      return;
    }

    // WIRE-2: LLM agent perceptual query (idea-run-3).
    // Responds with current locomotion state so @llm_agent can introspect
    // gait/stability/trajectory without direct state access.
    if (event.type === 'neural_animation_query_locomotion') {
      context.emit?.('locomotion_features', {
        node,
        locomotion: state.locomotion,
        targetVelocity: state.target_velocity,
        engineLoaded: state.engine !== null,
      });
      return;
    }

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
