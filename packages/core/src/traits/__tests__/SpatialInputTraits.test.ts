/**
 * SpatialInputTraits Test Suite
 *
 * Comprehensive tests for the four spatial input traits:
 *   1. spatial_input_hand_tracking (90Hz articulated skeleton)
 *   2. spatial_input_gaze_transient_pointer (privacy-first gaze)
 *   3. spatial_input_anchor_shared (multi-user shared anchors)
 *   4. spatial_input_controller (unified controller input)
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  spatialHandTrackingHandler,
  gazeTransientPointerHandler,
  spatialAnchorSharedHandler,
  spatialControllerInputHandler,
  type SpatialHandTrackingConfig,
  type GazeTransientPointerConfig,
  type SpatialAnchorSharedConfig,
  type SpatialControllerInputConfig,
  type SpatialHandTrackingState,
  type GazeTransientPointerState,
  type SpatialAnchorSharedState,
  type SpatialControllerInputState,
} from '../SpatialInputTraits';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

// =============================================================================
// 1. HAND TRACKING TRAIT TESTS
// =============================================================================

describe('SpatialInputHandTrackingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const defaultCfg: Partial<SpatialHandTrackingConfig> = {};

  beforeEach(() => {
    node = createMockNode('hand-track-node');
    ctx = createMockContext();
    attachTrait(spatialHandTrackingHandler, node, defaultCfg, ctx);
  });

  it('initializes state on attach', () => {
    expect(getEventCount(ctx, 'spatial_hand_tracking_start')).toBe(1);
    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    expect(state).toBeDefined();
    expect(state.left.tracked).toBe(false);
    expect(state.right.tracked).toBe(false);
    expect(state.leftGesture).toBeNull();
    expect(state.rightGesture).toBeNull();
    expect(state.updateAccum).toBe(0);
  });

  it('emits start event with correct config', () => {
    const data = getLastEvent(ctx, 'spatial_hand_tracking_start') as any;
    expect(data.updateRateHz).toBe(90);
    expect(data.prediction).toBe(true);
  });

  it('cleans up state on detach', () => {
    spatialHandTrackingHandler.onDetach?.(node as any, spatialHandTrackingHandler.defaultConfig, ctx as any);
    expect((node as any).__spatialHandTrackingState).toBeUndefined();
    expect(getEventCount(ctx, 'spatial_hand_tracking_stop')).toBe(1);
  });

  // --- Hand data events ---

  it('processes spatial_hand_data and sets tracking state', () => {
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'left',
      tracked: true,
      joints: {
        wrist: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, radius: 0.02 },
      },
      pinchStrength: 0.2,
      gripStrength: 0.1,
    });

    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    expect(state.left.tracked).toBe(true);
    expect(state.left.joints.has('wrist')).toBe(true);
    expect(state.left.pinchStrength).toBe(0.2);
    expect(state.left.gripStrength).toBe(0.1);
  });

  it('emits spatial_hand_found when hand becomes tracked', () => {
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'right',
      tracked: true,
      pinchStrength: 0,
      gripStrength: 0,
    });
    expect(getEventCount(ctx, 'spatial_hand_found')).toBe(1);
    const data = getLastEvent(ctx, 'spatial_hand_found') as any;
    expect(data.hand).toBe('right');
  });

  it('emits spatial_hand_lost when hand becomes untracked', () => {
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'left',
      tracked: true,
      pinchStrength: 0,
      gripStrength: 0,
    });
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'left',
      tracked: false,
      pinchStrength: 0,
      gripStrength: 0,
    });
    expect(getEventCount(ctx, 'spatial_hand_lost')).toBe(1);
  });

  it('does not emit hand_found if already tracked', () => {
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'left',
      tracked: true,
      pinchStrength: 0,
      gripStrength: 0,
    });
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'left',
      tracked: true,
      pinchStrength: 0.5,
      gripStrength: 0.3,
    });
    expect(getEventCount(ctx, 'spatial_hand_found')).toBe(1); // only once
  });

  // --- Gesture detection ---

  it('detects pinch gesture on update', () => {
    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    state.right.tracked = true;
    state.right.pinchStrength = 0.9;

    // Need delta large enough to pass 90Hz rate limiting (1/90 ≈ 0.0111)
    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.012);

    expect(getEventCount(ctx, 'spatial_gesture_start')).toBeGreaterThanOrEqual(1);
    const gestureEvt = getLastEvent(ctx, 'spatial_gesture_start') as any;
    expect(gestureEvt.hand).toBe('right');
    expect(gestureEvt.gesture).toBe('pinch');
  });

  it('detects grab gesture on update', () => {
    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    state.left.tracked = true;
    state.left.gripStrength = 0.8;
    state.left.pinchStrength = 0.2;

    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.012);

    const gestureEvt = getLastEvent(ctx, 'spatial_gesture_start') as any;
    expect(gestureEvt.gesture).toBe('grab');
  });

  it('detects open_hand gesture', () => {
    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    state.right.tracked = true;
    state.right.pinchStrength = 0.05;
    state.right.gripStrength = 0.05;

    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.012);

    const gestureEvt = getLastEvent(ctx, 'spatial_gesture_start') as any;
    expect(gestureEvt.gesture).toBe('open_hand');
  });

  it('emits spatial_gesture_end when gesture changes', () => {
    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    state.left.tracked = true;
    state.left.pinchStrength = 0.9;

    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.012);
    expect(state.leftGesture).toBe('pinch');

    // Change to open
    state.left.pinchStrength = 0.05;
    state.left.gripStrength = 0.05;
    state.updateAccum = 0;
    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.012);

    expect(getEventCount(ctx, 'spatial_gesture_end')).toBeGreaterThanOrEqual(1);
    const endEvt = getLastEvent(ctx, 'spatial_gesture_end') as any;
    expect(endEvt.gesture).toBe('pinch');
  });

  it('fires haptic on gesture when enabled', () => {
    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    state.right.tracked = true;
    state.right.pinchStrength = 0.9;

    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.012);
    expect(getEventCount(ctx, 'haptic_pulse')).toBeGreaterThanOrEqual(1);
  });

  it('respects rate limiting (does not update before interval)', () => {
    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    state.right.tracked = true;
    state.right.pinchStrength = 0.9;

    // Delta too small for 90Hz (0.005 < 0.0111)
    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.005);
    expect(getEventCount(ctx, 'spatial_gesture_start')).toBe(0);

    // Another small delta accumulates
    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.007);
    expect(getEventCount(ctx, 'spatial_gesture_start')).toBeGreaterThanOrEqual(1);
  });

  it('applies joint smoothing', () => {
    // Send initial joint data
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'left',
      tracked: true,
      joints: {
        wrist: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, radius: 0.02 },
      },
      pinchStrength: 0,
      gripStrength: 0,
    });

    // Send second data point (should be smoothed toward first)
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'left',
      tracked: true,
      joints: {
        wrist: { position: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, radius: 0.02 },
      },
      pinchStrength: 0,
      gripStrength: 0,
    });

    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    const wrist = state.left.joints.get('wrist');
    expect(wrist).toBeDefined();
    // With 0.3 smoothing: prev * 0.3 + current * 0.7 = 0*0.3 + 1*0.7 = 0.7
    expect(wrist!.position.x).toBeCloseTo(0.7, 1);
  });

  it('updates wrist pose for anchor reference', () => {
    sendEvent(spatialHandTrackingHandler, node, defaultCfg, ctx, {
      type: 'spatial_hand_data',
      hand: 'right',
      tracked: true,
      joints: {
        wrist: { position: { x: 0.5, y: 1.2, z: -0.3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, radius: 0.02 },
      },
      pinchStrength: 0,
      gripStrength: 0,
    });

    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    expect(state.right.wristPose).not.toBeNull();
    expect(state.right.wristPose!.position.x).toBeCloseTo(0.5);
  });

  it('emits pose update on update when hands tracked', () => {
    const state = (node as any).__spatialHandTrackingState as SpatialHandTrackingState;
    state.left.tracked = true;
    state.left.joints.set('wrist', { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, radius: 0.02 });

    updateTrait(spatialHandTrackingHandler, node, defaultCfg, ctx, 0.012);
    expect(getEventCount(ctx, 'spatial_hand_pose_update')).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// 2. GAZE TRANSIENT POINTER TRAIT TESTS
// =============================================================================

describe('SpatialInputGazeTransientPointerTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const defaultCfg: Partial<GazeTransientPointerConfig> = {};

  beforeEach(() => {
    node = createMockNode('gaze-node');
    ctx = createMockContext();
    attachTrait(gazeTransientPointerHandler, node, defaultCfg, ctx);
  });

  it('initializes state on attach', () => {
    expect(getEventCount(ctx, 'gaze_transient_pointer_start')).toBe(1);
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    expect(state).toBeDefined();
    expect(state.active).toBe(false);
    expect(state.commitPoint).toBeNull();
    expect(state.isCommitted).toBe(false);
    expect(state.dwellProgress).toBe(0);
  });

  it('cleans up on detach', () => {
    gazeTransientPointerHandler.onDetach?.(node as any, gazeTransientPointerHandler.defaultConfig, ctx as any);
    expect((node as any).__gazeTransientPointerState).toBeUndefined();
    expect(getEventCount(ctx, 'gaze_transient_pointer_stop')).toBe(1);
  });

  it('activates on gaze_transient_activate event', () => {
    sendEvent(gazeTransientPointerHandler, node, defaultCfg, ctx, {
      type: 'gaze_transient_activate',
    });
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    expect(state.active).toBe(true);
  });

  it('deactivates and resets on gaze_transient_deactivate', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = true;
    state.isCommitted = true;
    state.commitPoint = { x: 1, y: 2, z: 3 };
    state._dwellAccum = 500;

    sendEvent(gazeTransientPointerHandler, node, defaultCfg, ctx, {
      type: 'gaze_transient_deactivate',
    });

    expect(state.active).toBe(false);
    expect(state.isCommitted).toBe(false);
    expect(state.commitPoint).toBeNull();
    expect(state._dwellAccum).toBe(0);
    expect(state.dwellProgress).toBe(0);
  });

  // --- Privacy-first commit model ---

  it('handles pinch commit with intersection point', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = true;

    sendEvent(gazeTransientPointerHandler, node, defaultCfg, ctx, {
      type: 'gaze_transient_pinch_commit',
      point: { x: 1.5, y: 0.8, z: -2.0 },
      normal: { x: 0, y: 1, z: 0 },
      targetId: 'target-button-42',
    });

    expect(state.isCommitted).toBe(true);
    expect(state.commitPoint).toEqual({ x: 1.5, y: 0.8, z: -2.0 });
    expect(state.commitNormal).toEqual({ x: 0, y: 1, z: 0 });
    expect(state.commitTargetId).toBe('target-button-42');
    expect(state.lastCommitTime).toBeGreaterThan(0);

    expect(getEventCount(ctx, 'gaze_transient_commit')).toBe(1);
    const commitData = getLastEvent(ctx, 'gaze_transient_commit') as any;
    expect(commitData.method).toBe('pinch');
    expect(commitData.point.x).toBe(1.5);
    expect(commitData.targetId).toBe('target-button-42');
  });

  it('fires haptic on commit when enabled', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = true;

    sendEvent(gazeTransientPointerHandler, node, defaultCfg, ctx, {
      type: 'gaze_transient_pinch_commit',
      point: { x: 0, y: 0, z: 0 },
    });

    expect(getEventCount(ctx, 'haptic_pulse')).toBe(1);
    const haptic = getLastEvent(ctx, 'haptic_pulse') as any;
    expect(haptic.intensity).toBe(0.4);
  });

  it('handles pinch release', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = true;
    state.isCommitted = true;
    state.commitPoint = { x: 1, y: 1, z: 1 };
    state.commitTargetId = 'btn';

    sendEvent(gazeTransientPointerHandler, node, defaultCfg, ctx, {
      type: 'gaze_transient_pinch_release',
    });

    expect(state.isCommitted).toBe(false);
    expect(state.commitPoint).toBeNull();
    expect(state.commitTargetId).toBeNull();
    expect(getEventCount(ctx, 'gaze_transient_release')).toBe(1);
  });

  // --- Dwell mechanism ---

  it('accumulates dwell time via gaze_dwell_tick events', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = true;

    sendEvent(gazeTransientPointerHandler, node, defaultCfg, ctx, {
      type: 'gaze_dwell_tick',
      deltaMs: 200,
    });

    expect(state._dwellAccum).toBe(200);
  });

  it('computes dwell progress on update', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = true;
    state._dwellAccum = 400; // Half of 800ms default

    updateTrait(gazeTransientPointerHandler, node, defaultCfg, ctx, 0.016);

    expect(state.dwellProgress).toBeCloseTo(0.5, 1);
    expect(getEventCount(ctx, 'gaze_dwell_progress')).toBe(1);
  });

  it('auto-commits on dwell completion', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = true;
    state._dwellAccum = 900; // > 800ms default

    updateTrait(gazeTransientPointerHandler, node, defaultCfg, ctx, 0.016);

    expect(state.isCommitted).toBe(true);
    expect(getEventCount(ctx, 'gaze_transient_commit')).toBe(1);
    const commitData = getLastEvent(ctx, 'gaze_transient_commit') as any;
    expect(commitData.method).toBe('dwell');
  });

  it('resets dwell after completion', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = true;
    state._dwellAccum = 900;

    updateTrait(gazeTransientPointerHandler, node, defaultCfg, ctx, 0.016);

    expect(state._dwellAccum).toBe(0);
    expect(state.dwellProgress).toBe(0);
  });

  it('resets dwell via gaze_dwell_reset event', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state._dwellAccum = 500;
    state.dwellProgress = 0.625;

    sendEvent(gazeTransientPointerHandler, node, defaultCfg, ctx, {
      type: 'gaze_dwell_reset',
    });

    expect(state._dwellAccum).toBe(0);
    expect(state.dwellProgress).toBe(0);
  });

  it('does not process update when inactive', () => {
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    state.active = false;
    state._dwellAccum = 900;

    updateTrait(gazeTransientPointerHandler, node, defaultCfg, ctx, 0.016);

    // Should not emit any events
    expect(getEventCount(ctx, 'gaze_transient_commit')).toBe(0);
    expect(getEventCount(ctx, 'gaze_dwell_progress')).toBe(0);
  });

  it('privacy: never exposes gaze direction (only commit point)', () => {
    // Verify the state interface has no gazeDirection field
    const state = (node as any).__gazeTransientPointerState as GazeTransientPointerState;
    expect('gazeDirection' in state).toBe(false);
    expect('gazeRay' in state).toBe(false);
    expect('gazeOrigin' in state).toBe(false);
  });
});

// =============================================================================
// 3. SHARED SPATIAL ANCHOR TRAIT TESTS
// =============================================================================

describe('SpatialInputAnchorSharedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const defaultCfg: Partial<SpatialAnchorSharedConfig> = {
    room_id: 'test-room',
  };

  beforeEach(() => {
    node = createMockNode('anchor-node');
    ctx = createMockContext();
    attachTrait(spatialAnchorSharedHandler, node, defaultCfg, ctx);
  });

  it('initializes state on attach and starts resolving when auto_share', () => {
    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    expect(state).toBeDefined();
    expect(state.resolveState).toBe('resolving'); // auto_share triggers immediate resolve
    expect(state.cloudAnchorId).toBeNull();
    expect(state.peers.size).toBe(0);
    expect(getEventCount(ctx, 'shared_anchor_create')).toBe(1);
  });

  it('does not auto-resolve when auto_share is false', () => {
    const node2 = createMockNode('anchor-2');
    const ctx2 = createMockContext();
    attachTrait(spatialAnchorSharedHandler, node2, { auto_share: false }, ctx2);
    const state = (node2 as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    expect(state.resolveState).toBe('unresolved');
    expect(getEventCount(ctx2, 'shared_anchor_create')).toBe(0);
  });

  it('cleans up on detach and releases cloud anchor', () => {
    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    state.cloudAnchorId = 'cloud-abc-123';

    spatialAnchorSharedHandler.onDetach?.(
      node as any,
      { ...spatialAnchorSharedHandler.defaultConfig, ...defaultCfg },
      ctx as any
    );

    expect((node as any).__spatialAnchorSharedState).toBeUndefined();
    expect(getEventCount(ctx, 'shared_anchor_release')).toBe(1);
    const releaseData = getLastEvent(ctx, 'shared_anchor_release') as any;
    expect(releaseData.cloudAnchorId).toBe('cloud-abc-123');
  });

  // --- Anchor lifecycle ---

  it('handles shared_anchor_resolved event', () => {
    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_resolved',
      pose: { position: { x: 1, y: 0, z: -2 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 0.95 },
      cloudAnchorId: 'cloud-xyz-456',
    });

    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    expect(state.cloudAnchorId).toBe('cloud-xyz-456');
    expect(state.localPose).not.toBeNull();
    expect(state.localPose!.position.x).toBe(1);
    expect(getEventCount(ctx, 'shared_anchor_ready')).toBe(1);
    // auto_share = true → transitions to sharing
    expect(state.resolveState).toBe('sharing');
    expect(getEventCount(ctx, 'shared_anchor_share')).toBe(1);
  });

  it('handles shared_anchor_shared event', () => {
    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    state.cloudAnchorId = 'cloud-xyz';
    state.resolveState = 'sharing';

    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_shared',
    });

    expect(state.resolveState).toBe('shared');
    expect(getEventCount(ctx, 'shared_anchor_available')).toBe(1);
  });

  it('handles join and joined events', () => {
    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_join',
      cloudAnchorId: 'remote-anchor-789',
    });

    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    expect(state.resolveState).toBe('joining');
    expect(state.cloudAnchorId).toBe('remote-anchor-789');

    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_joined',
      pose: { position: { x: 2, y: 1, z: -1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 0.9 },
    });

    expect(state.resolveState).toBe('joined');
    expect(state.localPose!.position.x).toBe(2);
    expect(getEventCount(ctx, 'shared_anchor_synced')).toBe(1);
  });

  // --- Peer management ---

  it('tracks peer joins', () => {
    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_peer_joined',
      peerId: 'peer-alice',
      displayName: 'Alice',
    });

    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    expect(state.peers.size).toBe(1);
    expect(state.peers.get('peer-alice')?.displayName).toBe('Alice');
    expect(getEventCount(ctx, 'shared_anchor_peer_update')).toBe(1);
  });

  it('tracks peer leaving', () => {
    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    state.peers.set('peer-bob', { peerId: 'peer-bob', resolvedAt: Date.now() });

    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_peer_left',
      peerId: 'peer-bob',
    });

    expect(state.peers.size).toBe(0);
    expect(getEventCount(ctx, 'shared_anchor_peer_update')).toBe(1);
  });

  // --- Failure and retry ---

  it('retries on failure up to max_retries', () => {
    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_failed',
      error: 'Network timeout',
    });

    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    expect(state.resolveAttempts).toBe(1);
    expect(state.resolveState).toBe('resolving'); // retrying
    expect(getEventCount(ctx, 'shared_anchor_retry')).toBe(1);
  });

  it('fails after max retries exceeded', () => {
    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    state.resolveAttempts = 4; // Just below default max of 5

    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_failed',
      error: 'Final failure',
    });

    expect(state.resolveState).toBe('failed');
    expect(state.errorMessage).toBe('Final failure');
    expect(getEventCount(ctx, 'shared_anchor_error')).toBe(1);
  });

  // --- TTL expiry ---

  it('handles TTL expiry', () => {
    const cfgWithTTL: Partial<SpatialAnchorSharedConfig> = {
      room_id: 'ttl-room',
      ttl_seconds: 1, // 1 second TTL
    };

    const node2 = createMockNode('ttl-anchor');
    const ctx2 = createMockContext();
    attachTrait(spatialAnchorSharedHandler, node2, cfgWithTTL, ctx2);

    const state = (node2 as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    state.resolveState = 'shared';
    state.cloudAnchorId = 'ttl-anchor-id';
    state.createdAt = Date.now() - 2000; // Created 2s ago, TTL is 1s

    updateTrait(spatialAnchorSharedHandler, node2, cfgWithTTL, ctx2, 0.016);

    expect(state.resolveState).toBe('failed');
    expect(state.errorMessage).toBe('Anchor TTL expired');
    expect(getEventCount(ctx2, 'shared_anchor_expired')).toBe(1);
  });

  // --- Pose updates ---

  it('applies pose to node on update when resolved', () => {
    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    state.resolveState = 'resolved';
    state.localPose = {
      position: { x: 3, y: 0, z: -5 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      confidence: 0.9,
    };

    updateTrait(spatialAnchorSharedHandler, node, defaultCfg, ctx, 0.016);

    expect(getEventCount(ctx, 'set_position')).toBe(1);
    expect(getEventCount(ctx, 'set_rotation')).toBe(1);
  });

  it('updates local pose from pose update event when quality sufficient', () => {
    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;

    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_pose_update',
      pose: { position: { x: 5, y: 1, z: -3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 0.8 },
    });

    expect(state.localPose!.position.x).toBe(5);
  });

  it('ignores low-quality pose updates', () => {
    const state = (node as any).__spatialAnchorSharedState as SpatialAnchorSharedState;
    state.localPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      confidence: 0.9,
    };

    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_pose_update',
      pose: { position: { x: 99, y: 99, z: 99 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 0.2 },
    });

    expect(state.localPose!.position.x).toBe(0); // unchanged
  });

  // --- Transform sync ---

  it('relays peer transform when sync enabled', () => {
    sendEvent(spatialAnchorSharedHandler, node, defaultCfg, ctx, {
      type: 'shared_anchor_transform_sync',
      peerId: 'peer-charlie',
      transform: { position: { x: 10, y: 0, z: -10 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    });

    expect(getEventCount(ctx, 'shared_anchor_peer_transform')).toBe(1);
  });
});

// =============================================================================
// 4. CONTROLLER INPUT TRAIT TESTS
// =============================================================================

describe('SpatialInputControllerTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const defaultCfg: Partial<SpatialControllerInputConfig> = {};

  beforeEach(() => {
    node = createMockNode('ctrl-node');
    ctx = createMockContext();
    attachTrait(spatialControllerInputHandler, node, defaultCfg, ctx);
  });

  it('initializes state on attach', () => {
    expect(getEventCount(ctx, 'spatial_controller_start')).toBe(1);
    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    expect(state).toBeDefined();
    expect(state.left.connected).toBe(false);
    expect(state.right.connected).toBe(false);
    expect(state.changedButtons).toHaveLength(0);
  });

  it('cleans up on detach', () => {
    spatialControllerInputHandler.onDetach?.(
      node as any,
      spatialControllerInputHandler.defaultConfig,
      ctx as any
    );
    expect((node as any).__spatialControllerInputState).toBeUndefined();
    expect(getEventCount(ctx, 'spatial_controller_stop')).toBe(1);
  });

  // --- Controller connection ---

  it('emits connected event when controller arrives', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'right',
      connected: true,
      profiles: ['oculus-touch-v3'],
      thumbstick: { x: 0, y: 0 },
    });

    expect(getEventCount(ctx, 'spatial_controller_connected')).toBe(1);
    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    expect(state.right.connected).toBe(true);
    expect(state.right.profiles).toEqual(['oculus-touch-v3']);
  });

  it('emits disconnected event', () => {
    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    state.right.connected = true;

    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_disconnect',
      hand: 'right',
    });

    expect(state.right.connected).toBe(false);
    expect(getEventCount(ctx, 'spatial_controller_disconnected')).toBe(1);
  });

  // --- Button tracking ---

  it('tracks button state changes', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'left',
      connected: true,
      buttons: {
        trigger: { pressed: true, touched: true, value: 0.9 },
      },
      thumbstick: { x: 0, y: 0 },
    });

    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    expect(state.left.buttons.get('trigger')).toEqual({ pressed: true, touched: true, value: 0.9 });
    expect(state.changedButtons).toHaveLength(1);
    expect(state.changedButtons[0].button).toBe('trigger');
    expect(state.changedButtons[0].state.pressed).toBe(true);
  });

  it('emits button press events on update', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'right',
      connected: true,
      buttons: {
        primary: { pressed: true, touched: true, value: 1 },
      },
      thumbstick: { x: 0, y: 0 },
    });

    updateTrait(spatialControllerInputHandler, node, defaultCfg, ctx, 0.016);

    expect(getEventCount(ctx, 'spatial_button_press')).toBe(1);
    const pressData = getLastEvent(ctx, 'spatial_button_press') as any;
    expect(pressData.hand).toBe('right');
    expect(pressData.button).toBe('primary');
    expect(pressData.value).toBe(1);
  });

  it('emits button release events on update', () => {
    // First press
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'left',
      connected: true,
      buttons: { grip: { pressed: true, touched: true, value: 1 } },
      thumbstick: { x: 0, y: 0 },
    });
    updateTrait(spatialControllerInputHandler, node, defaultCfg, ctx, 0.016);

    // Then release
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'left',
      connected: true,
      buttons: { grip: { pressed: false, touched: false, value: 0 } },
      thumbstick: { x: 0, y: 0 },
    });
    updateTrait(spatialControllerInputHandler, node, defaultCfg, ctx, 0.016);

    expect(getEventCount(ctx, 'spatial_button_release')).toBe(1);
  });

  it('fires haptic on button press when enabled', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'right',
      connected: true,
      buttons: { trigger: { pressed: true, touched: true, value: 0.8 } },
      thumbstick: { x: 0, y: 0 },
    });
    updateTrait(spatialControllerInputHandler, node, defaultCfg, ctx, 0.016);

    expect(getEventCount(ctx, 'haptic_pulse')).toBeGreaterThanOrEqual(1);
  });

  // --- Thumbstick / axes ---

  it('applies deadzone to thumbstick', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'left',
      connected: true,
      thumbstick: { x: 0.1, y: 0.05 }, // Below default deadzone of 0.15
    });

    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    expect(state.left.thumbstick.x).toBe(0); // deadzone applied
    expect(state.left.thumbstick.y).toBe(0);
  });

  it('passes through values above deadzone', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'right',
      connected: true,
      thumbstick: { x: 0.8, y: -0.6 },
    });

    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    expect(state.right.thumbstick.x).toBeGreaterThan(0);
    expect(state.right.thumbstick.y).toBeLessThan(0);
  });

  it('thumbstick as dpad emits directional events', () => {
    const dpadCfg: Partial<SpatialControllerInputConfig> = {
      thumbstick_as_dpad: true,
      dpad_threshold: 0.7,
    };

    const dpadNode = createMockNode('dpad-node');
    const dpadCtx = createMockContext();
    attachTrait(spatialControllerInputHandler, dpadNode, dpadCfg, dpadCtx);

    const state = (dpadNode as any).__spatialControllerInputState as SpatialControllerInputState;
    state.right.connected = true;
    state.right.thumbstick = { x: 0.9, y: 0 };

    updateTrait(spatialControllerInputHandler, dpadNode, dpadCfg, dpadCtx, 0.016);

    expect(getEventCount(dpadCtx, 'spatial_dpad')).toBeGreaterThanOrEqual(1);
    const dpadData = getLastEvent(dpadCtx, 'spatial_dpad') as any;
    expect(dpadData.direction).toBe('right');
  });

  // --- Trigger / grip values ---

  it('updates trigger and grip values', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'right',
      connected: true,
      triggerValue: 0.75,
      gripValue: 0.5,
      thumbstick: { x: 0, y: 0 },
    });

    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    expect(state.right.triggerValue).toBe(0.75);
    expect(state.right.gripValue).toBe(0.5);
  });

  // --- Pose tracking ---

  it('updates controller pose', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'left',
      connected: true,
      pose: {
        position: { x: -0.3, y: 1.0, z: -0.5 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        confidence: 1.0,
      },
      thumbstick: { x: 0, y: 0 },
    });

    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    expect(state.left.pose).not.toBeNull();
    expect(state.left.pose!.position.x).toBeCloseTo(-0.3);
  });

  // --- Axes event emission ---

  it('emits spatial_controller_axes on update when connected', () => {
    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_data',
      hand: 'right',
      connected: true,
      thumbstick: { x: 0.5, y: -0.3 },
      triggerValue: 0.6,
      gripValue: 0.2,
    });

    expect(getEventCount(ctx, 'spatial_controller_axes')).toBe(1);
  });

  // --- Button filter ---

  it('filters buttons when tracked_buttons configured', () => {
    const filteredCfg: Partial<SpatialControllerInputConfig> = {
      tracked_buttons: ['trigger', 'grip'],
    };

    const fNode = createMockNode('filtered');
    const fCtx = createMockContext();
    attachTrait(spatialControllerInputHandler, fNode, filteredCfg, fCtx);

    sendEvent(spatialControllerInputHandler, fNode, filteredCfg, fCtx, {
      type: 'spatial_controller_data',
      hand: 'left',
      connected: true,
      buttons: {
        trigger: { pressed: true, touched: true, value: 1 },
        primary: { pressed: true, touched: true, value: 1 }, // not in tracked list
      },
      thumbstick: { x: 0, y: 0 },
    });

    const state = (fNode as any).__spatialControllerInputState as SpatialControllerInputState;
    expect(state.left.buttons.has('trigger')).toBe(true);
    expect(state.left.buttons.has('primary')).toBe(false); // filtered out
    expect(state.changedButtons).toHaveLength(1);
    expect(state.changedButtons[0].button).toBe('trigger');
  });

  // --- Disconnect resets ---

  it('clears state on controller disconnect', () => {
    const state = (node as any).__spatialControllerInputState as SpatialControllerInputState;
    state.left.connected = true;
    state.left.buttons.set('trigger', { pressed: true, touched: true, value: 1 });
    state.left.thumbstick = { x: 0.5, y: 0.5 };
    state.left.triggerValue = 0.9;
    state.left.gripValue = 0.8;

    sendEvent(spatialControllerInputHandler, node, defaultCfg, ctx, {
      type: 'spatial_controller_disconnect',
      hand: 'left',
    });

    expect(state.left.connected).toBe(false);
    expect(state.left.buttons.size).toBe(0);
    expect(state.left.thumbstick).toEqual({ x: 0, y: 0 });
    expect(state.left.triggerValue).toBe(0);
    expect(state.left.gripValue).toBe(0);
  });
});
