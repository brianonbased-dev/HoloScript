/**
 * PoseEstimation Trait
 *
 * Human pose estimation using MediaPipe, MoveNet, or OpenPose.
 * Detects keypoints and skeleton tracking for full-body pose.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type PoseModel = 'mediapipe' | 'movenet' | 'openpose';
export type KeypointSet = 17 | 33 | 'full_body';

export interface Keypoint {
  x: number;
  y: number;
  z?: number;
  confidence: number;
  name: string;
}

export interface PoseEstimationConfig {
  model: PoseModel;
  keypoints: KeypointSet;
  smoothing: number; // 0.0 - 1.0
  min_confidence: number;
  multi_person: boolean;
  tracking_enabled: boolean;
}

interface PoseState {
  detected_pose: Keypoint[] | null;
  confidence: number;
  tracking_id: string | null;
  last_detection_time: number;
  smoothing_buffer: Keypoint[][];
}

// =============================================================================
// KEYPOINT DEFINITIONS
// =============================================================================

const COCO_17_KEYPOINTS = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function smoothKeypoints(current: Keypoint[], buffer: Keypoint[][], smoothing: number): Keypoint[] {
  const withCompat = (kp: Keypoint): Keypoint => {
    const out = { ...kp } as Keypoint & { [index: number]: number | undefined };
    out[0] = out.x;
    out[1] = out.y;
    out[2] = out.z;
    return out;
  };

  if (buffer.length === 0) return current.map(withCompat);

  const smoothed: Keypoint[] = [];

  for (let i = 0; i < current.length; i++) {
    const curr = current[i];
    const prev = buffer[buffer.length - 1][i];

    if (!prev) {
      smoothed.push(curr);
      continue;
    }

    smoothed.push(withCompat({
      x: curr.x * (1 - smoothing) + prev.x * smoothing,
      y: curr.y * (1 - smoothing) + prev.y * smoothing,
      z:
        curr.z !== undefined && prev.z !== undefined
          ? curr.z * (1 - smoothing) + prev.z * smoothing
          : curr.z,
      confidence: curr.confidence,
      name: curr.name,
    }));
  }

  return smoothed;
}

// =============================================================================
// HANDLER
// =============================================================================

export const poseEstimationHandler: TraitHandler<PoseEstimationConfig> = {
  name: 'pose_estimation',

  defaultConfig: {
    model: 'mediapipe',
    keypoints: 17,
    smoothing: 0.5,
    min_confidence: 0.5,
    multi_person: false,
    tracking_enabled: true,
  },

  onAttach(node, config, context) {
    const state: PoseState = {
      detected_pose: null,
      confidence: 0,
      tracking_id: null,
      last_detection_time: 0,
      smoothing_buffer: [],
    };
    node.__poseEstimationState = state;

    context.emit?.('pose_estimation_init', {
      node,
      model: config.model,
      keypoints: config.keypoints,
    });
  },

  onDetach(node, config, context) {
    delete node.__poseEstimationState;
  },

  onUpdate(node, config, context, delta) {
    // Pose estimation is event-driven from camera feed
  },

  onEvent(node, config, context, event) {
    const state = node.__poseEstimationState as PoseState;
    if (!state) return;

    if (event.type === 'pose_detected') {
      const rawKeypoints = event.keypoints as Keypoint[];
      const confidence = event.confidence as number;

      // Filter by confidence
      if (confidence < config.min_confidence) {
        return;
      }

      // Smooth keypoints
      const smoothedKeypoints = smoothKeypoints(
        rawKeypoints,
        state.smoothing_buffer,
        config.smoothing
      );

      // Update buffer
      state.smoothing_buffer.push(smoothedKeypoints);
      if (state.smoothing_buffer.length > 5) {
        state.smoothing_buffer.shift();
      }

      state.detected_pose = smoothedKeypoints;
      state.confidence = confidence;
      state.last_detection_time = Date.now();

      if (config.tracking_enabled && !state.tracking_id) {
        state.tracking_id = `track_${Date.now()}`;
      }

      context.emit?.('on_pose_updated', {
        node,
        pose: state.detected_pose,
        confidence: state.confidence,
        trackingId: state.tracking_id,
      });
    } else if (event.type === 'pose_lost') {
      state.detected_pose = null;
      state.confidence = 0;
      state.tracking_id = null;
      state.smoothing_buffer = [];

      context.emit?.('on_pose_lost', { node });
    } else if (event.type === 'get_keypoint') {
      const keypointName = event.name as string;
      const keypoint = state.detected_pose?.find((kp) => kp.name === keypointName);

      context.emit?.('on_keypoint_result', {
        node,
        keypoint,
        found: !!keypoint,
      });
    }
  },
};
