/**
 * BodyTracking Trait
 *
 * Full-body skeleton tracking for avatars and motion capture.
 * Supports upper body, full body, and custom joint sets.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type BodyTrackingMode = 'upper_body' | 'full_body' | 'hands_only' | 'custom';

type BodyJoint =
  | 'head'
  | 'neck'
  | 'spine_chest'
  | 'spine_mid'
  | 'spine_base'
  | 'hips'
  | 'shoulder_left'
  | 'shoulder_right'
  | 'elbow_left'
  | 'elbow_right'
  | 'wrist_left'
  | 'wrist_right'
  | 'hand_left'
  | 'hand_right'
  | 'hip_left'
  | 'hip_right'
  | 'knee_left'
  | 'knee_right'
  | 'ankle_left'
  | 'ankle_right'
  | 'foot_left'
  | 'foot_right';

interface JointPose {
  position: [number, number, number];
  rotation: { x: number; y: number; z: number; w: number };
  confidence: number;
  velocity?: { x: number; y: number; z: number };
}

interface BodyTrackingState {
  isTracking: boolean;
  joints: Map<BodyJoint, JointPose>;
  prevJoints: Map<BodyJoint, JointPose>;
  bodyHeight: number;
  armSpan: number;
  lastUpdateTime: number;
  lostTime: number;
  calibrated: boolean;
}

interface BodyTrackingConfig {
  mode: BodyTrackingMode;
  joint_smoothing: number;
  prediction: boolean;
  avatar_binding: boolean;
  calibrate_on_start: boolean;
  tracking_confidence_threshold: number;
  custom_joints?: BodyJoint[];
}

// =============================================================================
// HELPERS
// =============================================================================

const UPPER_BODY_JOINTS: BodyJoint[] = [
  'head',
  'neck',
  'spine_chest',
  'spine_mid',
  'shoulder_left',
  'shoulder_right',
  'elbow_left',
  'elbow_right',
  'wrist_left',
  'wrist_right',
  'hand_left',
  'hand_right',
];

const FULL_BODY_JOINTS: BodyJoint[] = [
  ...UPPER_BODY_JOINTS,
  'spine_base',
  'hips',
  'hip_left',
  'hip_right',
  'knee_left',
  'knee_right',
  'ankle_left',
  'ankle_right',
  'foot_left',
  'foot_right',
];

function getTrackedJoints(mode: BodyTrackingMode, customJoints?: BodyJoint[]): BodyJoint[] {
  switch (mode) {
    case 'full_body':
      return FULL_BODY_JOINTS;
    case 'upper_body':
      return UPPER_BODY_JOINTS;
    case 'hands_only':
      return ['wrist_left', 'wrist_right', 'hand_left', 'hand_right'];
    case 'custom':
      return customJoints || UPPER_BODY_JOINTS;
  }
}

function smoothPose(current: JointPose, prev: JointPose, smoothing: number): JointPose {
  const s = smoothing;
  const inv = 1 - s;
  return {
    position: [prev.position.x * s + current.position.x * inv, prev.position.y * s + current.position.y * inv, prev.position.z * s + current.position.z * inv,],
    rotation: {
      x: prev.rotation.x * s + current.rotation.x * inv,
      y: prev.rotation.y * s + current.rotation.y * inv,
      z: prev.rotation.z * s + current.rotation.z * inv,
      w: prev.rotation.w * s + current.rotation.w * inv,
    },
    confidence: current.confidence,
    velocity: current.velocity,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const bodyTrackingHandler: TraitHandler<BodyTrackingConfig> = {
  name: 'body_tracking',

  defaultConfig: {
    mode: 'upper_body',
    joint_smoothing: 0.5,
    prediction: true,
    avatar_binding: true,
    calibrate_on_start: true,
    tracking_confidence_threshold: 0.5,
  },

  onAttach(node, config, context) {
    const state: BodyTrackingState = {
      isTracking: false,
      joints: new Map(),
      prevJoints: new Map(),
      bodyHeight: 0,
      armSpan: 0,
      lastUpdateTime: 0,
      lostTime: 0,
      calibrated: false,
    };
    node.__bodyTrackingState = state;

    const trackedJoints = getTrackedJoints(config.mode, config.custom_joints);

    context.emit?.('body_tracking_start', {
      node,
      mode: config.mode,
      joints: trackedJoints,
      prediction: config.prediction,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('body_tracking_stop', { node });
    delete node.__bodyTrackingState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__bodyTrackingState as BodyTrackingState;
    if (!state) return;

    if (!state.isTracking) {
      state.lostTime += delta * 1000;
      return;
    }

    if (config.avatar_binding && state.joints.size > 0) {
      context.emit?.('avatar_pose_update', {
        node,
        joints: Object.fromEntries(state.joints),
        deltaTime: delta,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__bodyTrackingState as BodyTrackingState;
    if (!state) return;

    if (event.type === 'body_pose_update') {
      const jointData = event.joints as Record<string, JointPose>;
      const trackedJoints = getTrackedJoints(config.mode, config.custom_joints);
      const wasTracking = state.isTracking;

      for (const [joint, pose] of state.joints) {
        state.prevJoints.set(joint, pose);
      }

      let validJoints = 0;

      for (const jointName of trackedJoints) {
        const pose = jointData[jointName];
        if (!pose) continue;

        if (pose.confidence >= config.tracking_confidence_threshold) {
          validJoints++;
          const prevPose = state.prevJoints.get(jointName);
          const finalPose =
            prevPose && config.joint_smoothing > 0
              ? smoothPose(pose, prevPose, config.joint_smoothing)
              : pose;
          state.joints.set(jointName, finalPose);
        }
      }

      state.isTracking = validJoints >= trackedJoints.length * 0.5;
      state.lastUpdateTime = Date.now();

      if (state.isTracking) {
        state.lostTime = 0;
        if (!wasTracking) {
          context.emit?.('body_tracking_found', { node });
        }
        context.emit?.('body_pose_changed', {
          node,
          joints: Object.fromEntries(state.joints),
          confidence: validJoints / trackedJoints.length,
        });
      } else if (wasTracking) {
        context.emit?.('body_tracking_lost', { node });
      }
    } else if (event.type === 'body_calibrate') {
      const head = state.joints.get('head');
      const feet = state.joints.get('foot_left') || state.joints.get('ankle_left');
      const leftHand = state.joints.get('hand_left');
      const rightHand = state.joints.get('hand_right');

      if (head && feet) {
        state.bodyHeight = head.position.y - feet.position.y;
      }
      if (leftHand && rightHand) {
        const dx = rightHand.position.x - leftHand.position.x;
        const dy = rightHand.position.y - leftHand.position.y;
        const dz = rightHand.position.z - leftHand.position.z;
        state.armSpan = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      state.calibrated = true;
      context.emit?.('body_calibrated', {
        node,
        bodyHeight: state.bodyHeight,
        armSpan: state.armSpan,
      });
    }
  },
};

export default bodyTrackingHandler;
