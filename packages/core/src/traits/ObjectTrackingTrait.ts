/**
 * Object Tracking Trait (V43 Tier 2)
 *
 * Tracks and anchors virtual objects to real-world targets using ARCore/RealityKit.
 * Supports room-scale anchor persistence and tracking quality monitoring.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type TrackingTarget = 'furniture' | 'walls' | 'floors' | 'hands' | 'objects' | 'body' | 'face';
export type AnchorPersistence = 'session' | 'local' | 'cloud';
export type TrackingQuality = 'low' | 'medium' | 'high';

export interface ObjectTrackingConfig {
  tracking_target: TrackingTarget;
  anchor_persistence: AnchorPersistence;
  tracking_quality: TrackingQuality;
  max_distance: number;        // meters
  update_rate_hz: number;
  auto_recover: boolean;
  visualization: boolean;      // show tracking debug overlay
}

interface ObjectTrackingState {
  isTracking: boolean;
  trackingLost: boolean;
  anchorId: string | null;
  lastKnownPosition: [number, number, number] | null;
  trackingConfidence: number;  // 0–1
  totalTrackingTime: number;
  recoveryAttempts: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const objectTrackingHandler: TraitHandler<ObjectTrackingConfig> = {
  name: 'object_tracking' as any,

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
      trackingConfidence: 0,
      totalTrackingTime: 0,
      recoveryAttempts: 0,
    };
    context.setState({ objectTracking: state });
    context.emit('tracking:init', { target: config.tracking_target });
  },

  onUpdate(node, config, context, delta) {
    const state = context.getState().objectTracking as ObjectTrackingState | undefined;
    if (!state) return;

    if (state.isTracking) {
      state.totalTrackingTime += delta;
    }

    if (state.trackingLost && config.auto_recover) {
      state.recoveryAttempts += 1;
      context.emit('tracking:recovery_attempt', { attempt: state.recoveryAttempts });
    }
  },

  onDetach(node, config, context) {
    const state = context.getState().objectTracking as ObjectTrackingState | undefined;
    if (state?.anchorId) {
      context.emit('tracking:anchor_removed', { anchorId: state.anchorId });
    }
  },

  onEvent(node, config, context, event) {
    if (event.type === 'tracking:acquired') {
      const state = context.getState().objectTracking as ObjectTrackingState;
      state.isTracking = true;
      state.trackingLost = false;
      state.anchorId = (event.payload as any)?.anchorId ?? null;
      state.trackingConfidence = 1.0;
    } else if (event.type === 'tracking:lost') {
      const state = context.getState().objectTracking as ObjectTrackingState;
      state.isTracking = false;
      state.trackingLost = true;
      state.trackingConfidence = 0;
      context.emit('tracking:lost', { target: config.tracking_target });
    }
  },
};
