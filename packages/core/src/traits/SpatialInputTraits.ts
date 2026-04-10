/**
 * Spatial Input Traits — Unified Abstraction Layer
 *
 * Provides four foundational spatial input traits that abstract across
 * ARCore, ARKit, OpenXR, and WebXR backends:
 *
 *   1. spatial_input_hand_tracking — 90Hz articulated hand skeleton
 *   2. spatial_input_gaze_transient_pointer — privacy-first gaze (revealed only at pinch)
 *   3. spatial_input_anchor_shared — multi-user shared spatial anchors
 *   4. spatial_input_controller — unified controller input with button/axis abstraction
 *
 * Design principles:
 *   - Privacy-first: gaze direction is NEVER exposed continuously; only the
 *     intersection point at the moment of pinch/commit is revealed.
 *   - Platform-agnostic: all traits operate on a common intermediate
 *     representation; the SpatialInputCompilerMixin handles platform-specific
 *     code generation.
 *   - 90Hz target: hand tracking update loop is rate-capped at 90Hz (11.1ms)
 *     to match VR display refresh rates without exceeding frame budget.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// SHARED TYPES
// =============================================================================

/** 3D position vector */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Quaternion rotation */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** 6-DOF pose (position + orientation) */
export interface SpatialPose {
  position: Vec3;
  rotation: Quat;
  /** Tracking confidence [0..1] */
  confidence: number;
}

/** XR platform backend identifier */
export type SpatialInputBackend = 'arcore' | 'arkit' | 'openxr' | 'webxr';

// =============================================================================
// 1. HAND TRACKING TRAIT — 90Hz Articulated Skeleton
// =============================================================================

/** All 26 joints per hand per the OpenXR hand tracking extension */
export type SpatialHandJoint =
  | 'palm'
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

export interface SpatialHandJointPose {
  position: Vec3;
  rotation: Quat;
  radius: number;
  linearVelocity?: Vec3;
}

export interface SpatialHandState {
  tracked: boolean;
  joints: Map<SpatialHandJoint, SpatialHandJointPose>;
  pinchStrength: number;
  gripStrength: number;
  wristPose: SpatialPose | null;
}

export interface SpatialHandTrackingState {
  left: SpatialHandState;
  right: SpatialHandState;
  /** Accumulated time for rate limiting (seconds) */
  updateAccum: number;
  /** Detected gesture per hand */
  leftGesture: string | null;
  rightGesture: string | null;
  prevLeftGesture: string | null;
  prevRightGesture: string | null;
}

/** Gesture types recognizable by the hand tracking system */
export type SpatialGestureType =
  | 'pinch'
  | 'grab'
  | 'open_hand'
  | 'point'
  | 'fist'
  | 'thumbs_up'
  | 'custom';

export interface SpatialHandTrackingConfig {
  /** Target update rate in Hz. Default 90 to match VR refresh. */
  update_rate_hz: number;
  /** Joint smoothing factor [0..1]. 0 = no smoothing, 1 = maximum smoothing. */
  smoothing: number;
  /** Pinch detection threshold [0..1] */
  pinch_threshold: number;
  /** Grip detection threshold [0..1] */
  grip_threshold: number;
  /** Minimum tracking confidence to accept joint data [0..1] */
  confidence_threshold: number;
  /** Enable predictive tracking to reduce perceived latency */
  prediction: boolean;
  /** Fire haptic pulse on gesture detection */
  haptic_on_gesture: boolean;
  /** Gestures to detect */
  gesture_set: SpatialGestureType[];
}

function createEmptySpatialHandState(): SpatialHandState {
  return {
    tracked: false,
    joints: new Map(),
    pinchStrength: 0,
    gripStrength: 0,
    wristPose: null,
  };
}

function detectSpatialGesture(
  hand: SpatialHandState,
  config: SpatialHandTrackingConfig
): string | null {
  if (!hand.tracked) return null;

  const gestureSet = config.gesture_set;

  // Pinch: thumb tip and index tip close proximity
  if (gestureSet.includes('pinch') && hand.pinchStrength >= config.pinch_threshold) {
    return 'pinch';
  }

  // Grab: high grip strength
  if (gestureSet.includes('grab') && hand.gripStrength >= config.grip_threshold) {
    return 'grab';
  }

  // Fist: very high grip, low pinch
  if (gestureSet.includes('fist') && hand.gripStrength > 0.85 && hand.pinchStrength < 0.3) {
    return 'fist';
  }

  // Open hand: low grip, low pinch
  if (gestureSet.includes('open_hand') && hand.gripStrength < 0.15 && hand.pinchStrength < 0.15) {
    return 'open_hand';
  }

  // Point: low grip, moderate pinch region (index extended)
  if (gestureSet.includes('point') && hand.gripStrength > 0.5 && hand.pinchStrength < 0.3) {
    return 'point';
  }

  return null;
}

function smoothJointPose(
  current: SpatialHandJointPose,
  prev: SpatialHandJointPose,
  factor: number
): SpatialHandJointPose {
  const inv = 1 - factor;
  return {
    position: {
      x: prev.position.x * factor + current.position.x * inv,
      y: prev.position.y * factor + current.position.y * inv,
      z: prev.position.z * factor + current.position.z * inv,
    },
    rotation: {
      x: prev.rotation.x * factor + current.rotation.x * inv,
      y: prev.rotation.y * factor + current.rotation.y * inv,
      z: prev.rotation.z * factor + current.rotation.z * inv,
      w: prev.rotation.w * factor + current.rotation.w * inv,
    },
    radius: current.radius,
    linearVelocity: current.linearVelocity,
  };
}

export const spatialHandTrackingHandler: TraitHandler<SpatialHandTrackingConfig> = {
  name: 'spatial_input_hand_tracking',

  defaultConfig: {
    update_rate_hz: 90,
    smoothing: 0.3,
    pinch_threshold: 0.8,
    grip_threshold: 0.7,
    confidence_threshold: 0.5,
    prediction: true,
    haptic_on_gesture: true,
    gesture_set: ['pinch', 'grab', 'open_hand', 'point', 'fist'],
  },

  onAttach(node, config, context) {
    const state: SpatialHandTrackingState = {
      left: createEmptySpatialHandState(),
      right: createEmptySpatialHandState(),
      updateAccum: 0,
      leftGesture: null,
      rightGesture: null,
      prevLeftGesture: null,
      prevRightGesture: null,
    };
    node.__spatialHandTrackingState = state;

    context.emit?.('spatial_hand_tracking_start', {
      node,
      updateRateHz: config.update_rate_hz,
      prediction: config.prediction,
    });
  },

  onDetach(node, _config, context) {
    context.emit?.('spatial_hand_tracking_stop', { node });
    delete node.__spatialHandTrackingState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__spatialHandTrackingState as SpatialHandTrackingState;
    if (!state) return;

    // Rate limiting to target Hz
    const interval = 1 / config.update_rate_hz;
    state.updateAccum += delta;
    if (state.updateAccum < interval) return;
    state.updateAccum -= interval;

    // Detect gestures
    state.prevLeftGesture = state.leftGesture;
    state.prevRightGesture = state.rightGesture;
    state.leftGesture = detectSpatialGesture(state.left, config);
    state.rightGesture = detectSpatialGesture(state.right, config);

    // Emit gesture change events — left hand
    if (state.leftGesture !== state.prevLeftGesture) {
      if (state.prevLeftGesture) {
        context.emit?.('spatial_gesture_end', {
          node,
          hand: 'left',
          gesture: state.prevLeftGesture,
        });
      }
      if (state.leftGesture) {
        context.emit?.('spatial_gesture_start', {
          node,
          hand: 'left',
          gesture: state.leftGesture,
        });
        if (config.haptic_on_gesture) {
          context.emit?.('haptic_pulse', { hand: 'left', intensity: 0.25, duration: 40 });
        }
      }
    }

    // Emit gesture change events — right hand
    if (state.rightGesture !== state.prevRightGesture) {
      if (state.prevRightGesture) {
        context.emit?.('spatial_gesture_end', {
          node,
          hand: 'right',
          gesture: state.prevRightGesture,
        });
      }
      if (state.rightGesture) {
        context.emit?.('spatial_gesture_start', {
          node,
          hand: 'right',
          gesture: state.rightGesture,
        });
        if (config.haptic_on_gesture) {
          context.emit?.('haptic_pulse', { hand: 'right', intensity: 0.25, duration: 40 });
        }
      }
    }

    // Emit continuous joint data for bound avatars
    if (state.left.tracked || state.right.tracked) {
      context.emit?.('spatial_hand_pose_update', {
        node,
        left: state.left.tracked ? Object.fromEntries(state.left.joints) : null,
        right: state.right.tracked ? Object.fromEntries(state.right.joints) : null,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__spatialHandTrackingState as SpatialHandTrackingState;
    if (!state) return;

    if (event.type === 'spatial_hand_data') {
      const hand = (event as Record<string, unknown>).hand as 'left' | 'right';
      const jointData = (event as Record<string, unknown>).joints as
        | Record<string, SpatialHandJointPose>
        | undefined;
      const pinch = (event as Record<string, unknown>).pinchStrength as number | undefined;
      const grip = (event as Record<string, unknown>).gripStrength as number | undefined;
      const tracked = (event as Record<string, unknown>).tracked as boolean;

      const handState = hand === 'left' ? state.left : state.right;
      const wasTracked = handState.tracked;
      handState.tracked = tracked;

      if (jointData) {
        for (const [jointName, pose] of Object.entries(jointData)) {
          if (pose.position && pose.rotation) {
            // Filter by confidence
            const confidence =
              ((pose as unknown as Record<string, unknown>).confidence as number) ?? 1;
            if (confidence < config.confidence_threshold) continue;

            const prev = handState.joints.get(jointName as SpatialHandJoint);
            const finalPose =
              prev && config.smoothing > 0 ? smoothJointPose(pose, prev, config.smoothing) : pose;
            handState.joints.set(jointName as SpatialHandJoint, finalPose);
          }
        }

        // Update wrist pose for anchor reference
        const wrist = handState.joints.get('wrist');
        if (wrist) {
          handState.wristPose = {
            position: wrist.position,
            rotation: wrist.rotation,
            confidence: 1,
          };
        }
      }

      if (pinch !== undefined) handState.pinchStrength = pinch;
      if (grip !== undefined) handState.gripStrength = grip;

      // Visibility transitions
      if (tracked && !wasTracked) {
        context.emit?.('spatial_hand_found', { node, hand });
      } else if (!tracked && wasTracked) {
        context.emit?.('spatial_hand_lost', { node, hand });
      }
    }
  },
};

// =============================================================================
// 2. GAZE TRANSIENT POINTER TRAIT — Privacy-First Model
// =============================================================================

/**
 * Transient pointer state.
 *
 * The key privacy invariant: `gazeDirection` is NEVER exposed to the
 * application. Only the `commitPoint` (the intersection at the moment of
 * pinch/commit) is shared.  This matches Apple Vision Pro's privacy model
 * and is the recommended pattern for all platforms.
 */
export interface GazeTransientPointerState {
  /** Whether gaze hardware is active */
  active: boolean;
  /** The committed interaction point (only set at pinch moment) */
  commitPoint: Vec3 | null;
  /** The committed surface normal at interaction point */
  commitNormal: Vec3 | null;
  /** Target node ID at commit (if any) */
  commitTargetId: string | null;
  /** Whether a commit (pinch) is currently held */
  isCommitted: boolean;
  /** Dwell progress [0..1] for accessibility (does NOT reveal gaze direction) */
  dwellProgress: number;
  /** Timestamp of last commit */
  lastCommitTime: number;
  /** Internal: accumulated dwell time (ms) — NOT exposed to application */
  _dwellAccum: number;
}

export interface GazeTransientPointerConfig {
  /** Enable dwell-to-commit for accessibility */
  dwell_enabled: boolean;
  /** Dwell time to trigger commit (ms) */
  dwell_time_ms: number;
  /** Visual feedback during dwell (generic indicator, not gaze cursor) */
  dwell_feedback: boolean;
  /** Haptic pulse on commit */
  haptic_on_commit: boolean;
  /** Haptic intensity [0..1] */
  haptic_intensity: number;
  /** Maximum interaction distance (meters) */
  max_distance: number;
  /** Whether to require pinch gesture for commit (vs controller button) */
  pinch_to_commit: boolean;
}

export const gazeTransientPointerHandler: TraitHandler<GazeTransientPointerConfig> = {
  name: 'spatial_input_gaze_transient_pointer',

  defaultConfig: {
    dwell_enabled: true,
    dwell_time_ms: 800,
    dwell_feedback: true,
    haptic_on_commit: true,
    haptic_intensity: 0.4,
    max_distance: 10,
    pinch_to_commit: true,
  },

  onAttach(node, config, context) {
    const state: GazeTransientPointerState = {
      active: false,
      commitPoint: null,
      commitNormal: null,
      commitTargetId: null,
      isCommitted: false,
      dwellProgress: 0,
      lastCommitTime: 0,
      _dwellAccum: 0,
    };
    node.__gazeTransientPointerState = state;

    context.emit?.('gaze_transient_pointer_start', {
      node,
      maxDistance: config.max_distance,
      dwellEnabled: config.dwell_enabled,
    });
  },

  onDetach(node, _config, context) {
    context.emit?.('gaze_transient_pointer_stop', { node });
    delete node.__gazeTransientPointerState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__gazeTransientPointerState as GazeTransientPointerState;
    if (!state || !state.active) return;

    // Dwell accumulation — note: the runtime system notifies us of dwell
    // candidacy via 'gaze_dwell_tick' events without revealing the gaze ray.
    // This ensures the application only sees dwell progress, never direction.
    if (config.dwell_enabled && state._dwellAccum > 0) {
      state.dwellProgress = Math.min(state._dwellAccum / config.dwell_time_ms, 1);

      if (config.dwell_feedback) {
        context.emit?.('gaze_dwell_progress', {
          node,
          progress: state.dwellProgress,
        });
      }

      // Auto-commit on dwell completion
      if (state.dwellProgress >= 1 && !state.isCommitted) {
        state.isCommitted = true;
        state.lastCommitTime = Date.now();
        context.emit?.('gaze_transient_commit', {
          node,
          point: state.commitPoint,
          normal: state.commitNormal,
          targetId: state.commitTargetId,
          method: 'dwell',
        });

        if (config.haptic_on_commit) {
          context.emit?.('haptic_pulse', {
            hand: 'right',
            intensity: config.haptic_intensity,
            duration: 60,
          });
        }

        // Reset dwell
        state._dwellAccum = 0;
        state.dwellProgress = 0;
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__gazeTransientPointerState as GazeTransientPointerState;
    if (!state) return;

    if (event.type === 'gaze_transient_activate') {
      state.active = true;
    } else if (event.type === 'gaze_transient_deactivate') {
      state.active = false;
      state.isCommitted = false;
      state.commitPoint = null;
      state.commitNormal = null;
      state.commitTargetId = null;
      state._dwellAccum = 0;
      state.dwellProgress = 0;
    } else if (event.type === 'gaze_transient_pinch_commit') {
      // Runtime reveals the intersection ONLY at the pinch moment
      const point = (event as Record<string, unknown>).point as Vec3 | undefined;
      const normal = (event as Record<string, unknown>).normal as Vec3 | undefined;
      const targetId = (event as Record<string, unknown>).targetId as string | undefined;

      state.commitPoint = point || null;
      state.commitNormal = normal || null;
      state.commitTargetId = targetId || null;
      state.isCommitted = true;
      state.lastCommitTime = Date.now();

      context.emit?.('gaze_transient_commit', {
        node,
        point: state.commitPoint,
        normal: state.commitNormal,
        targetId: state.commitTargetId,
        method: config.pinch_to_commit ? 'pinch' : 'button',
      });

      if (config.haptic_on_commit) {
        context.emit?.('haptic_pulse', {
          hand: 'right',
          intensity: config.haptic_intensity,
          duration: 60,
        });
      }
    } else if (event.type === 'gaze_transient_pinch_release') {
      state.isCommitted = false;
      state.commitPoint = null;
      state.commitNormal = null;
      state.commitTargetId = null;

      context.emit?.('gaze_transient_release', { node });
    } else if (event.type === 'gaze_dwell_tick') {
      // Runtime ticks dwell time without revealing gaze direction
      const deltaMs = (event as Record<string, unknown>).deltaMs as number;
      if (deltaMs > 0) {
        state._dwellAccum += deltaMs;
      }
    } else if (event.type === 'gaze_dwell_reset') {
      state._dwellAccum = 0;
      state.dwellProgress = 0;
    }
  },
};

// =============================================================================
// 3. SHARED SPATIAL ANCHOR TRAIT — Multi-User
// =============================================================================

export type SharedAnchorResolveState =
  | 'unresolved'
  | 'resolving'
  | 'resolved'
  | 'sharing'
  | 'shared'
  | 'joining'
  | 'joined'
  | 'failed';

export interface SharedAnchorPeer {
  peerId: string;
  displayName?: string;
  resolvedAt: number;
}

export interface SpatialAnchorSharedState {
  /** Local anchor resolved pose */
  localPose: SpatialPose | null;
  /** Cloud anchor identifier for sharing */
  cloudAnchorId: string | null;
  /** Current resolution state */
  resolveState: SharedAnchorResolveState;
  /** Peers who have resolved this anchor */
  peers: Map<string, SharedAnchorPeer>;
  /** Error message if failed */
  errorMessage: string | null;
  /** Number of resolve attempts */
  resolveAttempts: number;
  /** Creation timestamp */
  createdAt: number;
  /** Time-to-live for cloud anchor (ms) */
  ttl: number;
}

export interface SpatialAnchorSharedConfig {
  /** Auto-create and share anchor on attach */
  auto_share: boolean;
  /** Time-to-live for the cloud anchor (seconds). 0 = unlimited. */
  ttl_seconds: number;
  /** Maximum number of resolve retries */
  max_retries: number;
  /** Retry delay (ms) */
  retry_delay_ms: number;
  /** Required resolve quality [0..1] */
  quality_threshold: number;
  /** Persist anchor across sessions */
  persistent: boolean;
  /** Room/session identifier for anchor discovery */
  room_id: string;
  /** Synchronize attached object transforms across peers */
  sync_transforms: boolean;
}

export const spatialAnchorSharedHandler: TraitHandler<SpatialAnchorSharedConfig> = {
  name: 'spatial_input_anchor_shared',

  defaultConfig: {
    auto_share: true,
    ttl_seconds: 0,
    max_retries: 5,
    retry_delay_ms: 2000,
    quality_threshold: 0.6,
    persistent: false,
    room_id: '',
    sync_transforms: true,
  },

  onAttach(node, config, context) {
    const state: SpatialAnchorSharedState = {
      localPose: null,
      cloudAnchorId: null,
      resolveState: 'unresolved',
      peers: new Map(),
      errorMessage: null,
      resolveAttempts: 0,
      createdAt: Date.now(),
      ttl: config.ttl_seconds * 1000,
    };
    node.__spatialAnchorSharedState = state;

    if (config.auto_share) {
      state.resolveState = 'resolving';
      context.emit?.('shared_anchor_create', {
        node,
        roomId: config.room_id,
        persistent: config.persistent,
        ttlSeconds: config.ttl_seconds,
        qualityThreshold: config.quality_threshold,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__spatialAnchorSharedState as SpatialAnchorSharedState;
    if (state?.cloudAnchorId) {
      context.emit?.('shared_anchor_release', {
        node,
        cloudAnchorId: state.cloudAnchorId,
        persistent: config.persistent,
      });
    }
    delete node.__spatialAnchorSharedState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__spatialAnchorSharedState as SpatialAnchorSharedState;
    if (!state) return;

    // Apply local pose to node when resolved/joined
    if (
      state.localPose &&
      (state.resolveState === 'resolved' ||
        state.resolveState === 'shared' ||
        state.resolveState === 'joined')
    ) {
      context.emit?.('set_position', {
        node,
        position: state.localPose.position,
      });
      context.emit?.('set_rotation', {
        node,
        rotation: state.localPose.rotation,
      });
    }

    // Check TTL expiry
    if (state.ttl > 0 && Date.now() - state.createdAt > state.ttl) {
      if (state.resolveState === 'shared' || state.resolveState === 'joined') {
        state.resolveState = 'failed';
        state.errorMessage = 'Anchor TTL expired';
        context.emit?.('shared_anchor_expired', {
          node,
          cloudAnchorId: state.cloudAnchorId,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__spatialAnchorSharedState as SpatialAnchorSharedState;
    if (!state) return;

    if (event.type === 'shared_anchor_resolved') {
      const pose = (event as Record<string, unknown>).pose as SpatialPose;
      const cloudId = (event as Record<string, unknown>).cloudAnchorId as string;

      state.localPose = pose;
      state.cloudAnchorId = cloudId;
      state.resolveState = 'resolved';
      state.resolveAttempts = 0;

      context.emit?.('shared_anchor_ready', {
        node,
        cloudAnchorId: cloudId,
        pose,
      });

      // Auto-transition to sharing
      if (config.auto_share) {
        state.resolveState = 'sharing';
        context.emit?.('shared_anchor_share', {
          node,
          cloudAnchorId: cloudId,
          roomId: config.room_id,
        });
      }
    } else if (event.type === 'shared_anchor_shared') {
      state.resolveState = 'shared';
      context.emit?.('shared_anchor_available', {
        node,
        cloudAnchorId: state.cloudAnchorId,
        roomId: config.room_id,
      });
    } else if (event.type === 'shared_anchor_join') {
      const cloudId = (event as Record<string, unknown>).cloudAnchorId as string;
      state.cloudAnchorId = cloudId;
      state.resolveState = 'joining';
      context.emit?.('shared_anchor_resolve', {
        node,
        cloudAnchorId: cloudId,
      });
    } else if (event.type === 'shared_anchor_joined') {
      const pose = (event as Record<string, unknown>).pose as SpatialPose;
      state.localPose = pose;
      state.resolveState = 'joined';
      context.emit?.('shared_anchor_synced', {
        node,
        cloudAnchorId: state.cloudAnchorId,
        pose,
      });
    } else if (event.type === 'shared_anchor_peer_joined') {
      const peerId = (event as Record<string, unknown>).peerId as string;
      const displayName = (event as Record<string, unknown>).displayName as string | undefined;
      state.peers.set(peerId, {
        peerId,
        displayName,
        resolvedAt: Date.now(),
      });
      context.emit?.('shared_anchor_peer_update', {
        node,
        peers: Array.from(state.peers.values()),
      });
    } else if (event.type === 'shared_anchor_peer_left') {
      const peerId = (event as Record<string, unknown>).peerId as string;
      state.peers.delete(peerId);
      context.emit?.('shared_anchor_peer_update', {
        node,
        peers: Array.from(state.peers.values()),
      });
    } else if (event.type === 'shared_anchor_failed') {
      const error = (event as Record<string, unknown>).error as string;
      state.resolveAttempts++;

      if (state.resolveAttempts < config.max_retries) {
        // Retry
        state.resolveState = 'resolving';
        context.emit?.('shared_anchor_retry', {
          node,
          attempt: state.resolveAttempts,
          maxRetries: config.max_retries,
          delayMs: config.retry_delay_ms,
        });
      } else {
        state.resolveState = 'failed';
        state.errorMessage = error || 'Max retries exceeded';
        context.emit?.('shared_anchor_error', {
          node,
          error: state.errorMessage,
          attempts: state.resolveAttempts,
        });
      }
    } else if (event.type === 'shared_anchor_pose_update') {
      const pose = (event as Record<string, unknown>).pose as SpatialPose;
      if (pose.confidence >= config.quality_threshold) {
        state.localPose = pose;
      }
    } else if (event.type === 'shared_anchor_transform_sync' && config.sync_transforms) {
      // Receive transform from peer
      const peerId = (event as Record<string, unknown>).peerId as string;
      const transform = (event as Record<string, unknown>).transform as {
        position: Vec3;
        rotation: Quat;
      };
      context.emit?.('shared_anchor_peer_transform', {
        node,
        peerId,
        position: transform.position,
        rotation: transform.rotation,
      });
    }
  },
};

// =============================================================================
// 4. CONTROLLER INPUT TRAIT — Unified Abstraction
// =============================================================================

export type SpatialControllerButton =
  | 'trigger'
  | 'grip'
  | 'primary' // A/X
  | 'secondary' // B/Y
  | 'thumbstick'
  | 'thumbstick_click'
  | 'touchpad'
  | 'menu'
  | 'system';

export interface SpatialButtonState {
  pressed: boolean;
  touched: boolean;
  value: number; // analog [0..1]
}

export interface SpatialControllerState {
  connected: boolean;
  hand: 'left' | 'right' | 'none';
  pose: SpatialPose | null;
  buttons: Map<SpatialControllerButton, SpatialButtonState>;
  thumbstick: { x: number; y: number };
  touchpad: { x: number; y: number } | null;
  triggerValue: number;
  gripValue: number;
  /** Controller profile IDs (e.g., "oculus-touch-v3") */
  profiles: string[];
}

export interface SpatialControllerInputState {
  left: SpatialControllerState;
  right: SpatialControllerState;
  /** Buttons that changed state this frame */
  changedButtons: Array<{
    hand: 'left' | 'right';
    button: SpatialControllerButton;
    state: SpatialButtonState;
  }>;
}

export interface SpatialControllerInputConfig {
  /** Deadzone for thumbstick/touchpad [0..1] */
  deadzone: number;
  /** Trigger press threshold [0..1] */
  trigger_threshold: number;
  /** Grip press threshold [0..1] */
  grip_threshold: number;
  /** Enable vibration feedback on button press */
  haptic_on_press: boolean;
  /** Haptic intensity for button press [0..1] */
  haptic_intensity: number;
  /** Buttons to track (empty = all) */
  tracked_buttons: SpatialControllerButton[];
  /** Emit thumbstick as directional events (up/down/left/right) */
  thumbstick_as_dpad: boolean;
  /** Thumbstick dpad threshold [0..1] */
  dpad_threshold: number;
}

function createEmptyControllerState(hand: 'left' | 'right' | 'none'): SpatialControllerState {
  return {
    connected: false,
    hand,
    pose: null,
    buttons: new Map(),
    thumbstick: { x: 0, y: 0 },
    touchpad: null,
    triggerValue: 0,
    gripValue: 0,
    profiles: [],
  };
}

function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) < deadzone) return 0;
  const sign = value > 0 ? 1 : -1;
  return sign * ((Math.abs(value) - deadzone) / (1 - deadzone));
}

export const spatialControllerInputHandler: TraitHandler<SpatialControllerInputConfig> = {
  name: 'spatial_input_controller',

  defaultConfig: {
    deadzone: 0.15,
    trigger_threshold: 0.5,
    grip_threshold: 0.5,
    haptic_on_press: true,
    haptic_intensity: 0.3,
    tracked_buttons: [],
    thumbstick_as_dpad: false,
    dpad_threshold: 0.7,
  },

  onAttach(node, config, context) {
    const state: SpatialControllerInputState = {
      left: createEmptyControllerState('left'),
      right: createEmptyControllerState('right'),
      changedButtons: [],
    };
    node.__spatialControllerInputState = state;

    context.emit?.('spatial_controller_start', {
      node,
      trackedButtons: config.tracked_buttons,
    });
  },

  onDetach(node, _config, context) {
    context.emit?.('spatial_controller_stop', { node });
    delete node.__spatialControllerInputState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__spatialControllerInputState as SpatialControllerInputState;
    if (!state) return;

    // Process button changes accumulated this frame
    for (const change of state.changedButtons) {
      if (change.state.pressed) {
        context.emit?.('spatial_button_press', {
          node,
          hand: change.hand,
          button: change.button,
          value: change.state.value,
        });
        if (config.haptic_on_press) {
          context.emit?.('haptic_pulse', {
            hand: change.hand,
            intensity: config.haptic_intensity,
            duration: 30,
          });
        }
      } else {
        context.emit?.('spatial_button_release', {
          node,
          hand: change.hand,
          button: change.button,
        });
      }
    }
    state.changedButtons = [];

    // Thumbstick as dpad
    if (config.thumbstick_as_dpad) {
      for (const hand of ['left', 'right'] as const) {
        const ctrl = state[hand];
        if (!ctrl.connected) continue;
        const { x, y } = ctrl.thumbstick;
        if (Math.abs(x) > config.dpad_threshold) {
          context.emit?.('spatial_dpad', {
            node,
            hand,
            direction: x > 0 ? 'right' : 'left',
            value: Math.abs(x),
          });
        }
        if (Math.abs(y) > config.dpad_threshold) {
          context.emit?.('spatial_dpad', {
            node,
            hand,
            direction: y > 0 ? 'up' : 'down',
            value: Math.abs(y),
          });
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__spatialControllerInputState as SpatialControllerInputState;
    if (!state) return;

    if (event.type === 'spatial_controller_data') {
      const hand = (event as Record<string, unknown>).hand as 'left' | 'right';
      const ctrl = state[hand];
      const wasConnected = ctrl.connected;

      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      ctrl.connected = (event as Record<string, unknown>).connected ?? true;
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      ctrl.profiles = (event as Record<string, unknown>).profiles ?? ctrl.profiles;

      // Update pose
      if ((event as Record<string, unknown>).pose) {
        ctrl.pose = (event as Record<string, unknown>).pose as SpatialPose;
      }

      // Update buttons
      const buttons = (event as Record<string, unknown>).buttons as
        | Record<string, SpatialButtonState>
        | undefined;
      if (buttons) {
        for (const [btnName, btnState] of Object.entries(buttons)) {
          const button = btnName as SpatialControllerButton;

          // Filter to tracked buttons if configured
          if (config.tracked_buttons.length > 0 && !config.tracked_buttons.includes(button)) {
            continue;
          }

          const prev = ctrl.buttons.get(button);
          const changed = !prev || prev.pressed !== btnState.pressed;

          ctrl.buttons.set(button, btnState);

          if (changed) {
            state.changedButtons.push({ hand, button, state: btnState });
          }
        }
      }

      // Update axes with deadzone
      if ((event as Record<string, unknown>).thumbstick) {
        const ts = (event as Record<string, unknown>).thumbstick as { x: number; y: number };
        ctrl.thumbstick = {
          x: applyDeadzone(ts.x, config.deadzone),
          y: applyDeadzone(ts.y, config.deadzone),
        };
      }

      if ((event as Record<string, unknown>).touchpad) {
        const tp = (event as Record<string, unknown>).touchpad as { x: number; y: number };
        ctrl.touchpad = {
          x: applyDeadzone(tp.x, config.deadzone),
          y: applyDeadzone(tp.y, config.deadzone),
        };
      }

      if ((event as Record<string, unknown>).triggerValue !== undefined) {
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        ctrl.triggerValue = (event as Record<string, unknown>).triggerValue;
      }
      if ((event as Record<string, unknown>).gripValue !== undefined) {
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        ctrl.gripValue = (event as Record<string, unknown>).gripValue;
      }

      // Connection events
      if (ctrl.connected && !wasConnected) {
        context.emit?.('spatial_controller_connected', {
          node,
          hand,
          profiles: ctrl.profiles,
        });
      } else if (!ctrl.connected && wasConnected) {
        context.emit?.('spatial_controller_disconnected', { node, hand });
      }

      // Emit continuous thumbstick/axis data
      if (ctrl.connected) {
        context.emit?.('spatial_controller_axes', {
          node,
          hand,
          thumbstick: ctrl.thumbstick,
          touchpad: ctrl.touchpad,
          triggerValue: ctrl.triggerValue,
          gripValue: ctrl.gripValue,
        });
      }
    } else if (event.type === 'spatial_controller_disconnect') {
      const hand = (event as Record<string, unknown>).hand as 'left' | 'right';
      const ctrl = state[hand];
      ctrl.connected = false;
      ctrl.buttons.clear();
      ctrl.thumbstick = { x: 0, y: 0 };
      ctrl.touchpad = null;
      ctrl.triggerValue = 0;
      ctrl.gripValue = 0;
      context.emit?.('spatial_controller_disconnected', { node, hand });
    }
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  spatialHandTrackingHandler,
  gazeTransientPointerHandler,
  spatialAnchorSharedHandler,
  spatialControllerInputHandler,
};
