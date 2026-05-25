/**
 * Object Tracking Trait (V43 Tier 2)
 *
 * Maintains tracking-state bookkeeping for externally supplied AR/WebXR session poses.
 * Platform adapters provide anchor pose; this trait does not compute anchors itself.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { ARSessionPose, HSPlusNode, TraitContext, TraitHandler, Vector3 } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type TrackingTarget =
  | 'furniture'
  | 'walls'
  | 'floors'
  | 'hands'
  | 'objects'
  | 'body'
  | 'face';
export type AnchorPersistence = 'session' | 'local' | 'cloud';
export type TrackingQuality = 'low' | 'medium' | 'high';

export interface ObjectTrackingConfig {
  tracking_target: TrackingTarget;
  anchor_persistence: AnchorPersistence;
  tracking_quality: TrackingQuality;
  max_distance: number; // meters
  update_rate_hz: number;
  auto_recover: boolean;
  visualization: boolean; // show tracking debug overlay
}

interface ObjectTrackingState {
  isTracking: boolean;
  trackingLost: boolean;
  anchorId: string | null;
  lastKnownPosition: Vector3 | null;
  lastKnownRotation: Vector3 | null;
  lastPoseTimestampMs: number | null;
  trackingSource: 'none' | 'event' | 'ar_session';
  trackingConfidence: number; // 0-1
  totalTrackingTime: number;
  recoveryAttempts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVector3(value: unknown): value is Vector3 {
  return Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readConfidence(value: unknown, fallback: number): number {
  const confidence = readNumber(value);
  if (confidence === undefined) return fallback;
  return Math.max(0, Math.min(1, confidence));
}

function readTrackingState(value: unknown): ARSessionPose['trackingState'] | undefined {
  if (value === 'not_available' || value === 'limited' || value === 'normal' || value === 'lost') {
    return value;
  }
  return undefined;
}

function poseFromPayload(payload: Record<string, unknown> | undefined): ARSessionPose | null {
  if (!payload) return null;

  const posePayload = isRecord(payload.pose) ? payload.pose : payload;
  const position = isVector3(posePayload.position) ? posePayload.position : undefined;
  if (!position) return null;

  const rotation = isVector3(posePayload.rotation) ? posePayload.rotation : undefined;
  return {
    anchorId: readString(posePayload.anchorId) ?? readString(payload.anchorId),
    target: readString(posePayload.target) ?? readString(payload.target),
    position: [...position] as Vector3,
    rotation: rotation ? ([...rotation] as Vector3) : undefined,
    confidence: readNumber(posePayload.confidence) ?? readNumber(payload.confidence),
    timestampMs: readNumber(posePayload.timestampMs) ?? readNumber(payload.timestampMs),
    trackingState:
      readTrackingState(posePayload.trackingState) ?? readTrackingState(payload.trackingState),
    source: readString(posePayload.source) ?? readString(payload.source),
  };
}

function applyPose(
  state: ObjectTrackingState,
  pose: ARSessionPose,
  source: ObjectTrackingState['trackingSource']
): void {
  state.lastKnownPosition = [...pose.position] as Vector3;
  if (pose.rotation) state.lastKnownRotation = [...pose.rotation] as Vector3;
  if (pose.anchorId) state.anchorId = pose.anchorId;
  state.lastPoseTimestampMs = pose.timestampMs ?? Date.now();
  state.trackingSource = source;
  state.trackingConfidence = readConfidence(pose.confidence, state.trackingConfidence);

  if (pose.trackingState === 'lost' || pose.trackingState === 'not_available') {
    state.isTracking = false;
    state.trackingLost = true;
    state.trackingConfidence = 0;
  } else {
    state.isTracking = true;
    state.trackingLost = false;
  }
}

function emitTrackingUpdated(
  node: HSPlusNode,
  config: ObjectTrackingConfig,
  context: TraitContext,
  state: ObjectTrackingState
): void {
  context.emit('tracking:updated', {
    nodeId: node.id,
    target: config.tracking_target,
    anchorId: state.anchorId,
    position: state.lastKnownPosition,
    rotation: state.lastKnownRotation,
    confidence: state.trackingConfidence,
    source: state.trackingSource,
    timestampMs: state.lastPoseTimestampMs,
  });
}

function readState(context: TraitContext): ObjectTrackingState | undefined {
  return context.getState().objectTracking as ObjectTrackingState | undefined;
}

// =============================================================================
// HANDLER
// =============================================================================

export const objectTrackingHandler: TraitHandler<ObjectTrackingConfig> = {
  name: 'object_tracking',

  defaultConfig: {
    tracking_target: 'objects',
    anchor_persistence: 'session',
    tracking_quality: 'medium',
    max_distance: 5.0,
    update_rate_hz: 30,
    auto_recover: true,
    visualization: false,
  },

  onAttach(node, config, context) {
    const state: ObjectTrackingState = {
      isTracking: false,
      trackingLost: false,
      anchorId: null,
      lastKnownPosition: null,
      lastKnownRotation: null,
      lastPoseTimestampMs: null,
      trackingSource: 'none',
      trackingConfidence: 0,
      totalTrackingTime: 0,
      recoveryAttempts: 0,
    };
    context.setState({ objectTracking: state });
    context.emit('tracking:init', { nodeId: node.id, target: config.tracking_target });
  },

  onUpdate(node, config, context, delta) {
    const state = readState(context);
    if (!state) return;

    if (state.isTracking) {
      state.totalTrackingTime += delta;

      const session = context.arSession;
      if (session?.available) {
        const pose =
          state.anchorId && session.getAnchor
            ? session.getAnchor(state.anchorId)
            : session.getPose(node.id);
        if (pose) {
          applyPose(state, pose, 'ar_session');
          emitTrackingUpdated(node, config, context, state);
        }
      }
    }

    if (state.trackingLost && config.auto_recover) {
      state.recoveryAttempts += 1;
      context.emit('tracking:recovery_attempt', {
        nodeId: node.id,
        target: config.tracking_target,
        anchorId: state.anchorId,
        attempt: state.recoveryAttempts,
      });
    }
  },

  onDetach(node, config, context) {
    const state = readState(context);
    if (state?.anchorId) {
      context.emit('tracking:anchor_removed', {
        nodeId: node.id,
        target: config.tracking_target,
        anchorId: state.anchorId,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = readState(context);
    if (!state) return;

    if (event.type === 'tracking:acquired') {
      state.isTracking = true;
      state.trackingLost = false;
      state.anchorId = readString(event.payload?.anchorId) ?? state.anchorId;
      state.trackingConfidence = readConfidence(event.payload?.confidence, 1.0);

      const pose = poseFromPayload(event.payload);
      if (pose) applyPose(state, pose, 'event');
      emitTrackingUpdated(node, config, context, state);
    } else if (event.type === 'tracking:pose' || event.type === 'tracking:update') {
      const pose = poseFromPayload(event.payload);
      if (!pose) return;
      applyPose(state, pose, 'event');
      emitTrackingUpdated(node, config, context, state);
    } else if (event.type === 'tracking:lost') {
      state.isTracking = false;
      state.trackingLost = true;
      state.trackingConfidence = 0;
      context.emit('tracking:lost', {
        nodeId: node.id,
        target: config.tracking_target,
        anchorId: state.anchorId,
      });
    }
  },
};
