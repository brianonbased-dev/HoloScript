/**
 * HandTrackingTrait Production Tests
 *
 * Articulated hand tracking: register/unregister, hand_data events,
 * visibility changes, joint smoothing, gesture detection via onUpdate,
 * pinch/grab state, rate limiting, joint query, and haptic feedback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handTrackingHandler } from '../HandTrackingTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'ht-node') { return { id } as any; }

function makeConfig(overrides: any = {}) {
  return { ...handTrackingHandler.defaultConfig, ...overrides };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function getState(node: any) {
  return node.__handTrackingState;
}

// =============================================================================
// TESTS
// =============================================================================

describe('HandTrackingTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeCtx();
    handTrackingHandler.onAttach(node, config, ctx);
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes empty hand state', () => {
      const s = getState(node);
      expect(s.left.visible).toBe(false);
      expect(s.right.visible).toBe(false);
      expect(s.leftGesture).toBeNull();
      expect(s.rightGesture).toBeNull();
      expect(s.leftPinching).toBe(false);
      expect(s.rightPinching).toBe(false);
    });

    it('emits hand_tracking_register', () => {
      expect(ctx.emit).toHaveBeenCalledWith('hand_tracking_register', { node });
    });

    it('has correct defaults', () => {
      const d = handTrackingHandler.defaultConfig;
      expect(d.mode).toBe('skeletal');
      expect(d.pinch_threshold).toBe(0.8);
      expect(d.grip_threshold).toBe(0.7);
      expect(d.haptic_on_gesture).toBe(true);
      expect(d.update_rate).toBe(60);
    });

    it('handler name is hand_tracking', () => {
      expect(handTrackingHandler.name).toBe('hand_tracking');
    });
  });

  // ======== HAND DATA EVENTS ========

  describe('hand_data events', () => {
    it('updates hand visibility to found', () => {
      ctx.emit.mockClear();

      handTrackingHandler.onEvent!(node, config, ctx, {
        type: 'hand_data',
        hand: 'left',
        data: { visible: true },
      });

      expect(getState(node).left.visible).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('hand_found', { node, hand: 'left' });
    });

    it('updates hand visibility to lost', () => {
      // First make visible
      handTrackingHandler.onEvent!(node, config, ctx, {
        type: 'hand_data',
        hand: 'right',
        data: { visible: true },
      });
      ctx.emit.mockClear();

      handTrackingHandler.onEvent!(node, config, ctx, {
        type: 'hand_data',
        hand: 'right',
        data: { visible: false },
      });

      expect(getState(node).right.visible).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('hand_lost', { node, hand: 'right' });
    });

    it('updates pinch and grip strength', () => {
      handTrackingHandler.onEvent!(node, config, ctx, {
        type: 'hand_data',
        hand: 'left',
        data: { visible: true, pinchStrength: 0.9, gripStrength: 0.5 },
      });

      expect(getState(node).left.pinchStrength).toBe(0.9);
      expect(getState(node).left.gripStrength).toBe(0.5);
    });

    it('applies joint smoothing', () => {
      const cfg = makeConfig({ smoothing: 0.5 });
      const n = makeNode('smooth');
      const c = makeCtx();
      handTrackingHandler.onAttach(n, cfg, c);

      const joints1 = new Map([
        ['wrist', { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, radius: 0.01 }],
      ]);

      // First update to set initial joints
      handTrackingHandler.onEvent!(n, cfg, c, {
        type: 'hand_data',
        hand: 'left',
        data: { visible: true, joints: joints1 },
      });

      // Second update with different position — smoothing applies
      const joints2 = new Map([
        ['wrist', { position: { x: 10, y: 10, z: 10 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, radius: 0.01 }],
      ]);

      handTrackingHandler.onEvent!(n, cfg, c, {
        type: 'hand_data',
        hand: 'left',
        data: { visible: true, joints: joints2 },
      });

      const wrist = getState(n).left.joints.get('wrist');
      // With 0.5 smoothing: 0 * 0.5 + 10 * 0.5 = 5
      expect(wrist.position.x).toBe(5);
    });
  });

  // ======== ON UPDATE — GESTURE DETECTION ========

  describe('onUpdate — gesture detection', () => {
    it('detects pinch gesture when above threshold', () => {
      // Set up hand with high pinch strength
      getState(node).left.visible = true;
      getState(node).left.pinchStrength = 0.9;
      getState(node).left.gripStrength = 0;
      getState(node).updateAccum = 1; // exceed rate limit
      ctx.emit.mockClear();

      handTrackingHandler.onUpdate!(node, config, ctx, 0.017);

      expect(getState(node).leftGesture).toBe('pinch');
      expect(ctx.emit).toHaveBeenCalledWith('hand_gesture_start', {
        node,
        hand: 'left',
        gesture: 'pinch',
      });
    });

    it('detects open gesture', () => {
      getState(node).left.visible = true;
      getState(node).left.pinchStrength = 0.1;
      getState(node).left.gripStrength = 0.1;
      getState(node).updateAccum = 1;
      ctx.emit.mockClear();

      handTrackingHandler.onUpdate!(node, config, ctx, 0.017);

      expect(getState(node).leftGesture).toBe('open');
    });

    it('emits gesture_end when gesture changes', () => {
      // Set initial gesture
      getState(node).left.visible = true;
      getState(node).left.pinchStrength = 0.9;
      getState(node).updateAccum = 1;
      handTrackingHandler.onUpdate!(node, config, ctx, 0.017);

      // Change to open
      getState(node).left.pinchStrength = 0.1;
      getState(node).left.gripStrength = 0.1;
      getState(node).updateAccum = 1;
      ctx.emit.mockClear();
      handTrackingHandler.onUpdate!(node, config, ctx, 0.017);

      expect(ctx.emit).toHaveBeenCalledWith('hand_gesture_end', {
        node,
        hand: 'left',
        gesture: 'pinch',
      });
    });

    it('emits haptic pulse on gesture when enabled', () => {
      getState(node).right.visible = true;
      getState(node).right.gripStrength = 0.8;
      getState(node).right.pinchStrength = 0;
      getState(node).updateAccum = 1;
      ctx.emit.mockClear();

      handTrackingHandler.onUpdate!(node, config, ctx, 0.017);

      expect(ctx.emit).toHaveBeenCalledWith('haptic_pulse', { hand: 'right', intensity: 0.3, duration: 50 });
    });

    it('does NOT emit haptic when disabled', () => {
      const cfg = makeConfig({ haptic_on_gesture: false });
      const n = makeNode('nohaptic');
      const c = makeCtx();
      handTrackingHandler.onAttach(n, cfg, c);

      getState(n).left.visible = true;
      getState(n).left.pinchStrength = 0.9;
      getState(n).updateAccum = 1;
      c.emit.mockClear();

      handTrackingHandler.onUpdate!(n, cfg, c, 0.017);

      expect(c.emit).not.toHaveBeenCalledWith('haptic_pulse', expect.anything());
    });
  });

  // ======== PINCH STATE ========

  describe('pinch state tracking', () => {
    it('emits pinch_start when crossing threshold', () => {
      getState(node).left.visible = true;
      getState(node).left.pinchStrength = 0.9;
      getState(node).updateAccum = 1;
      ctx.emit.mockClear();

      handTrackingHandler.onUpdate!(node, config, ctx, 0.017);

      expect(ctx.emit).toHaveBeenCalledWith('hand_pinch_start', {
        node,
        hand: 'left',
        strength: 0.9,
      });
      expect(getState(node).leftPinching).toBe(true);
    });

    it('emits pinch_end when releasing', () => {
      getState(node).left.visible = true;
      getState(node).left.pinchStrength = 0.9;
      getState(node).updateAccum = 1;
      handTrackingHandler.onUpdate!(node, config, ctx, 0.017);

      // Release pinch
      getState(node).left.pinchStrength = 0.1;
      getState(node).left.gripStrength = 0.1;
      getState(node).updateAccum = 1;
      ctx.emit.mockClear();
      handTrackingHandler.onUpdate!(node, config, ctx, 0.017);

      expect(ctx.emit).toHaveBeenCalledWith('hand_pinch_end', { node, hand: 'left' });
      expect(getState(node).leftPinching).toBe(false);
    });
  });

  // ======== RATE LIMITING ========

  describe('rate limiting', () => {
    it('skips update when below rate interval', () => {
      getState(node).left.visible = true;
      getState(node).left.pinchStrength = 0.9;
      // updateAccum is 0, rate is 60 Hz → interval = 0.0167
      ctx.emit.mockClear();

      handTrackingHandler.onUpdate!(node, config, ctx, 0.001); // Too fast
      expect(ctx.emit).not.toHaveBeenCalled();
    });
  });

  // ======== JOINT QUERY ========

  describe('joint query', () => {
    it('returns joint pose', () => {
      const joints = new Map([
        ['index_tip', { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, radius: 0.005 }],
      ]);
      handTrackingHandler.onEvent!(node, config, ctx, {
        type: 'hand_data',
        hand: 'left',
        data: { visible: true, joints },
      });
      ctx.emit.mockClear();

      handTrackingHandler.onEvent!(node, config, ctx, {
        type: 'get_hand_joint',
        hand: 'left',
        joint: 'index_tip',
        queryId: 'q1',
      });

      expect(ctx.emit).toHaveBeenCalledWith('hand_joint_result', expect.objectContaining({
        queryId: 'q1',
        hand: 'left',
        joint: 'index_tip',
        visible: true,
      }));
    });

    it('returns null for unknown joint', () => {
      ctx.emit.mockClear();
      handTrackingHandler.onEvent!(node, config, ctx, {
        type: 'get_hand_joint',
        hand: 'left',
        joint: 'thumb_tip',
        queryId: 'q2',
      });

      expect(ctx.emit).toHaveBeenCalledWith('hand_joint_result', expect.objectContaining({
        pose: null,
        visible: false,
      }));
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('unregisters and cleans up state', () => {
      ctx.emit.mockClear();
      handTrackingHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith('hand_tracking_unregister', { node });
      expect(node.__handTrackingState).toBeUndefined();
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const bare = makeNode('bare');
      const c = makeCtx();
      handTrackingHandler.onEvent!(bare, config, c, { type: 'hand_data', hand: 'left', data: { visible: true } });
      expect(c.emit).not.toHaveBeenCalled();
    });

    it('onUpdate with no state is a no-op', () => {
      const bare = makeNode('bare');
      handTrackingHandler.onUpdate!(bare, config, makeCtx(), 0.016);
      // No crash
    });
  });
});
