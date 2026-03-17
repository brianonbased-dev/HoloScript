/**
 * HandTracking Trait
 *
 * Articulated hand skeleton tracking with gesture recognition.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type HandJoint =
  | 'wrist'
  | 'thumb_metacarpal'
  | 'thumb_proximal'
  | 'thumb_distal'
  | 'thumb_tip'
  | 'index_metacarpal'
  | 'index_proximal'
  | 'index_intermediate'
  | 'index_distal'
  | 'index_tip'
  | 'middle_metacarpal'
  | 'middle_proximal'
  | 'middle_intermediate'
  | 'middle_distal'
  | 'middle_tip'
  | 'ring_metacarpal'
  | 'ring_proximal'
  | 'ring_intermediate'
  | 'ring_distal'
  | 'ring_tip'
  | 'pinky_metacarpal'
  | 'pinky_proximal'
  | 'pinky_intermediate'
  | 'pinky_distal'
  | 'pinky_tip';

interface JointPose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  radius: number;
}

interface HandData {
  visible: boolean;
  joints: Map<HandJoint, JointPose>;
  pinchStrength: number;
  gripStrength: number;
  velocity: { x: number; y: number; z: number };
}

type GestureType = 'pinch' | 'grab' | 'point' | 'fist' | 'open' | 'thumbs_up' | 'peace' | 'custom';

interface GestureDefinition {
  name: string;
  type: GestureType;
  requirements?: Record<string, { curl?: [number, number]; spread?: [number, number] }>;
}

interface HandTrackingState {
  left: HandData;
  right: HandData;
  leftGesture: string | null;
  rightGesture: string | null;
  prevLeftGesture: string | null;
  prevRightGesture: string | null;
  leftPinching: boolean;
  rightPinching: boolean;
  leftGrabbing: boolean;
  rightGrabbing: boolean;
  updateAccum: number;
}

interface HandTrackingConfig {
  mode: 'skeletal' | 'simple';
  gesture_set: GestureDefinition[];
  pinch_threshold: number;
  grip_threshold: number;
  tracked_joints: HandJoint[];
  haptic_on_gesture: boolean;
  prediction: boolean;
  update_rate: number;
  smoothing: number;
}

// =============================================================================
// GESTURE DETECTION
// =============================================================================

const _BUILT_IN_GESTURES: GestureDefinition[] = [
  { name: 'pinch', type: 'pinch' },
  { name: 'grab', type: 'grab' },
  { name: 'point', type: 'point' },
  { name: 'fist', type: 'fist' },
  { name: 'open', type: 'open' },
];

function detectBuiltInGesture(hand: HandData, config: HandTrackingConfig): string | null {
  if (!hand.visible) return null;

  // Pinch: thumb and index tips close together
  if (hand.pinchStrength >= config.pinch_threshold) {
    return 'pinch';
  }

  // Grab: high grip strength
  if (hand.gripStrength >= config.grip_threshold) {
    return 'grab';
  }

  // Simple gesture detection based on finger curls would go here
  // For now, return based on grip/pinch values
  if (hand.gripStrength < 0.2 && hand.pinchStrength < 0.2) {
    return 'open';
  }

  if (hand.gripStrength > 0.8) {
    return 'fist';
  }

  return null;
}

function createEmptyHandData(): HandData {
  return {
    visible: false,
    joints: new Map(),
    pinchStrength: 0,
    gripStrength: 0,
    velocity: { x: 0, y: 0, z: 0 },
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const handTrackingHandler: TraitHandler<HandTrackingConfig> = {
  name: 'hand_tracking',

  defaultConfig: {
    mode: 'skeletal',
    gesture_set: [],
    pinch_threshold: 0.8,
    grip_threshold: 0.7,
    tracked_joints: [],
    haptic_on_gesture: true,
    prediction: true,
    update_rate: 60,
    smoothing: 0.5,
  },

  onAttach(node, config, context) {
    const state: HandTrackingState = {
      left: createEmptyHandData(),
      right: createEmptyHandData(),
      leftGesture: null,
      rightGesture: null,
      prevLeftGesture: null,
      prevRightGesture: null,
      leftPinching: false,
      rightPinching: false,
      leftGrabbing: false,
      rightGrabbing: false,
      updateAccum: 0,
    };
    node.__handTrackingState = state;

    // Register for hand tracking updates
    context.emit?.('hand_tracking_register', { node });
  },

  onDetach(node, config, context) {
    context.emit?.('hand_tracking_unregister', { node });
    delete node.__handTrackingState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__handTrackingState as HandTrackingState;
    if (!state) return;

    // Rate limiting
    const updateInterval = 1 / config.update_rate;
    state.updateAccum += delta;
    if (state.updateAccum < updateInterval) return;
    state.updateAccum = 0;

    // Detect gestures for each hand
    state.prevLeftGesture = state.leftGesture;
    state.prevRightGesture = state.rightGesture;

    state.leftGesture = detectBuiltInGesture(state.left, config);
    state.rightGesture = detectBuiltInGesture(state.right, config);

    // Emit gesture change events
    if (state.leftGesture !== state.prevLeftGesture) {
      if (state.leftGesture) {
        context.emit?.('hand_gesture_start', {
          node,
          hand: 'left',
          gesture: state.leftGesture,
        });

        if (config.haptic_on_gesture) {
          context.emit?.('haptic_pulse', { hand: 'left', intensity: 0.3, duration: 50 });
        }
      }
      if (state.prevLeftGesture) {
        context.emit?.('hand_gesture_end', {
          node,
          hand: 'left',
          gesture: state.prevLeftGesture,
        });
      }
    }

    if (state.rightGesture !== state.prevRightGesture) {
      if (state.rightGesture) {
        context.emit?.('hand_gesture_start', {
          node,
          hand: 'right',
          gesture: state.rightGesture,
        });

        if (config.haptic_on_gesture) {
          context.emit?.('haptic_pulse', { hand: 'right', intensity: 0.3, duration: 50 });
        }
      }
      if (state.prevRightGesture) {
        context.emit?.('hand_gesture_end', {
          node,
          hand: 'right',
          gesture: state.prevRightGesture,
        });
      }
    }

    // Track pinch state changes
    const leftPinching = state.left.pinchStrength >= config.pinch_threshold;
    const rightPinching = state.right.pinchStrength >= config.pinch_threshold;

    if (leftPinching && !state.leftPinching) {
      context.emit?.('hand_pinch_start', {
        node,
        hand: 'left',
        strength: state.left.pinchStrength,
      });
    } else if (!leftPinching && state.leftPinching) {
      context.emit?.('hand_pinch_end', { node, hand: 'left' });
    }

    if (rightPinching && !state.rightPinching) {
      context.emit?.('hand_pinch_start', {
        node,
        hand: 'right',
        strength: state.right.pinchStrength,
      });
    } else if (!rightPinching && state.rightPinching) {
      context.emit?.('hand_pinch_end', { node, hand: 'right' });
    }

    state.leftPinching = leftPinching;
    state.rightPinching = rightPinching;

    // Hand visibility changes
    // (handled in hand_data event)
  },

  onEvent(node, config, context, event) {
    const state = node.__handTrackingState as HandTrackingState;
    if (!state) return;

    if (event.type === 'hand_data') {
      // Receive hand tracking data from XR system
      const hand = event.hand as 'left' | 'right';
      const data = (event as any).data as {
        visible: boolean;
        joints?: Map<HandJoint, JointPose>;
        pinchStrength?: number;
        gripStrength?: number;
        velocity?: { x: number; y: number; z: number };
      };

      const handState = hand === 'left' ? state.left : state.right;
      const wasVisible = handState.visible;

      handState.visible = data.visible;

      if (data.joints) {
        // Apply smoothing
        if (config.smoothing > 0 && handState.joints.size > 0) {
          for (const [joint, pose] of data.joints) {
            const prev = handState.joints.get(joint);
            if (prev) {
              const s = config.smoothing;
              pose.position.x = prev.position.x * s + pose.position.x * (1 - s);
              pose.position.y = prev.position.y * s + pose.position.y * (1 - s);
              pose.position.z = prev.position.z * s + pose.position.z * (1 - s);
            }
          }
        }
        handState.joints = data.joints;
      }

      if (data.pinchStrength !== undefined) {
        handState.pinchStrength = data.pinchStrength;
      }
      if (data.gripStrength !== undefined) {
        handState.gripStrength = data.gripStrength;
      }
      if (data.velocity) {
        handState.velocity = data.velocity;
      }

      // Visibility change events
      if (data.visible && !wasVisible) {
        context.emit?.('hand_found', { node, hand });
      } else if (!data.visible && wasVisible) {
        context.emit?.('hand_lost', { node, hand });
      }
    } else if (event.type === 'get_hand_joint') {
      // Query specific joint position
      const hand = event.hand as 'left' | 'right';
      const joint = event.joint as HandJoint;

      const handState = hand === 'left' ? state.left : state.right;
      const pose = handState.joints.get(joint);

      context.emit?.('hand_joint_result', {
        queryId: event.queryId,
        hand,
        joint,
        pose: pose || null,
        visible: handState.visible,
      });
    }
  },
};

export default handTrackingHandler;
