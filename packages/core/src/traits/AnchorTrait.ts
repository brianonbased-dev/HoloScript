/**
 * Anchor Trait
 *
 * Spatial anchor for attaching content to physical locations in AR/MR.
 * Supports world-locked, plane-based, and persistent anchors.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AnchorType = 'spatial' | 'plane' | 'image' | 'face' | 'body' | 'persistent';
type TrackingState = 'initializing' | 'tracking' | 'paused' | 'lost' | 'stopped';
type Alignment = 'gravity' | 'camera' | 'plane' | 'none';
type FallbackBehavior = 'freeze' | 'hide' | 'interpolate' | 'reset';

interface AnchorPose {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  confidence: number;
}

interface AnchorState {
  isAnchored: boolean;
  anchorId: string | null;
  trackingState: TrackingState;
  pose: AnchorPose | null;
  lastValidPose: AnchorPose | null;
  lostTime: number;
  persistenceId: string | null;
  createdAt: number;
  updateCount: number;
}

interface AnchorConfig {
  anchor_type: AnchorType;
  tracking_quality: 'low' | 'medium' | 'high';
  offset: [number, number, number];
  alignment: Alignment;
  fallback_behavior: FallbackBehavior;
  timeout_ms: number;
  persist: boolean;
  recovery_attempts: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const anchorHandler: TraitHandler<AnchorConfig> = {
  name: 'anchor',

  defaultConfig: {
    anchor_type: 'spatial',
    tracking_quality: 'high',
    offset: [0, 0, 0],
    alignment: 'gravity',
    fallback_behavior: 'freeze',
    timeout_ms: 5000,
    persist: false,
    recovery_attempts: 3,
  },

  onAttach(node, config, context) {
    const state: AnchorState = {
      isAnchored: false,
      anchorId: null,
      trackingState: 'initializing',
      pose: null,
      lastValidPose: null,
      lostTime: 0,
      persistenceId: null,
      createdAt: Date.now(),
      updateCount: 0,
    };
    (node as any).__anchorState = state;

    // Request anchor creation
    context.emit?.('anchor_request', {
      node,
      type: config.anchor_type,
      quality: config.tracking_quality,
      persist: config.persist,
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__anchorState as AnchorState;
    if (state?.anchorId) {
      context.emit?.('anchor_release', {
        anchorId: state.anchorId,
        persist: config.persist,
      });
    }
    delete (node as any).__anchorState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__anchorState as AnchorState;
    if (!state) return;

    // Handle tracking state
    if (state.trackingState === 'lost') {
      state.lostTime += delta * 1000;

      // Handle fallback behavior
      switch (config.fallback_behavior) {
        case 'freeze':
          // Keep last valid pose (do nothing)
          break;
        case 'hide':
          context.emit?.('set_visible', { node, visible: false });
          break;
        case 'interpolate':
          // Interpolate toward last known position
          if (state.lastValidPose) {
            context.emit?.('set_position', {
              node,
              position: state.lastValidPose.position,
            });
          }
          break;
        case 'reset':
          if (state.lostTime > config.timeout_ms) {
            state.isAnchored = false;
            state.anchorId = null;
            state.trackingState = 'stopped';
            context.emit?.('anchor_timeout', { node });
          }
          break;
      }
    }

    // Apply offset to current pose
    if (state.pose && state.trackingState === 'tracking') {
      const [ox, oy, oz] = config.offset;
      context.emit?.('set_position', {
        node,
        position: {
          x: state.pose.position.x + ox,
          y: state.pose.position.y + oy,
          z: state.pose.position.z + oz,
        },
      });

      context.emit?.('set_rotation', {
        node,
        rotation: state.pose.rotation,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__anchorState as AnchorState;
    if (!state) return;

    if (event.type === 'anchor_created') {
      state.anchorId = event.anchorId as string;
      state.isAnchored = true;
      state.trackingState = 'tracking';
      if (event.persistenceId) {
        state.persistenceId = event.persistenceId as string;
      }
      context.emit?.('anchor_ready', { node, anchorId: state.anchorId });
    } else if (event.type === 'anchor_pose_update') {
      if (event.anchorId !== state.anchorId) return;

      const pose = event.pose as AnchorPose;
      state.pose = pose;
      state.lastValidPose = pose;
      state.updateCount++;

      if (state.trackingState === 'lost') {
        state.trackingState = 'tracking';
        state.lostTime = 0;
        context.emit?.('anchor_recovered', { node });
        context.emit?.('set_visible', { node, visible: true });
      }
    } else if (event.type === 'anchor_tracking_lost') {
      if (event.anchorId !== state.anchorId) return;

      const prevState = state.trackingState;
      state.trackingState = 'lost';
      state.lostTime = 0;

      if (prevState === 'tracking') {
        context.emit?.('anchor_lost', { node, anchorId: state.anchorId });
      }
    } else if (event.type === 'anchor_restore') {
      // Restore from persistent anchor
      const persistId = event.persistenceId as string;
      context.emit?.('anchor_restore_request', {
        node,
        persistenceId: persistId,
      });
    }
  },
};

export default anchorHandler;
