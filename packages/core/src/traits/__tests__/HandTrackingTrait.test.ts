import { describe, it, expect, beforeEach } from 'vitest';
import { handTrackingHandler } from '../HandTrackingTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('HandTrackingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'skeletal' as const,
    gesture_set: [],
    pinch_threshold: 0.8,
    grip_threshold: 0.7,
    tracked_joints: [],
    haptic_on_gesture: true,
    prediction: true,
    update_rate: 60,
    smoothing: 0.5,
  };

  beforeEach(() => {
    node = createMockNode('ht');
    ctx = createMockContext();
    attachTrait(handTrackingHandler, node, cfg, ctx);
  });

  it('registers on attach', () => {
    expect(getEventCount(ctx, 'hand_tracking_register')).toBe(1);
    const s = (node as any).__handTrackingState;
    expect(s.left.visible).toBe(false);
    expect(s.right.visible).toBe(false);
  });

  it('hand_data makes hand visible and emits hand_found', () => {
    sendEvent(handTrackingHandler, node, cfg, ctx, {
      type: 'hand_data',
      hand: 'left',
      data: { visible: true, pinchStrength: 0, gripStrength: 0 },
    });
    expect((node as any).__handTrackingState.left.visible).toBe(true);
    expect(getEventCount(ctx, 'hand_found')).toBe(1);
  });

  it('hand lost emits hand_lost', () => {
    sendEvent(handTrackingHandler, node, cfg, ctx, {
      type: 'hand_data',
      hand: 'right',
      data: { visible: true },
    });
    sendEvent(handTrackingHandler, node, cfg, ctx, {
      type: 'hand_data',
      hand: 'right',
      data: { visible: false },
    });
    expect(getEventCount(ctx, 'hand_lost')).toBe(1);
  });

  it('pinch detection emits hand_gesture_start and hand_pinch_start', () => {
    const s = (node as any).__handTrackingState;
    s.right.visible = true;
    s.right.pinchStrength = 0.9;
    // Need enough delta to pass rate limiting (1/60 ≈ 0.0167)
    updateTrait(handTrackingHandler, node, cfg, ctx, 0.02);
    expect(getEventCount(ctx, 'hand_gesture_start')).toBeGreaterThanOrEqual(1);
    expect(getEventCount(ctx, 'hand_pinch_start')).toBe(1);
  });

  it('pinch end detected', () => {
    const s = (node as any).__handTrackingState;
    s.right.visible = true;
    s.right.pinchStrength = 0.9;
    updateTrait(handTrackingHandler, node, cfg, ctx, 0.02);
    s.right.pinchStrength = 0.1;
    s.updateAccum = 0;
    updateTrait(handTrackingHandler, node, cfg, ctx, 0.02);
    expect(getEventCount(ctx, 'hand_pinch_end')).toBe(1);
  });

  it('grab gesture detected', () => {
    const s = (node as any).__handTrackingState;
    s.left.visible = true;
    s.left.gripStrength = 0.9;
    updateTrait(handTrackingHandler, node, cfg, ctx, 0.02);
    expect(getEventCount(ctx, 'hand_gesture_start')).toBeGreaterThanOrEqual(1);
  });

  it('open hand gesture detected when both strengths low', () => {
    const s = (node as any).__handTrackingState;
    s.right.visible = true;
    s.right.gripStrength = 0.1;
    s.right.pinchStrength = 0.1;
    updateTrait(handTrackingHandler, node, cfg, ctx, 0.02);
    expect(getEventCount(ctx, 'hand_gesture_start')).toBeGreaterThanOrEqual(1);
  });

  it('haptic pulse emitted on gesture when enabled', () => {
    const s = (node as any).__handTrackingState;
    s.right.visible = true;
    s.right.pinchStrength = 0.9;
    updateTrait(handTrackingHandler, node, cfg, ctx, 0.02);
    expect(getEventCount(ctx, 'haptic_pulse')).toBeGreaterThanOrEqual(1);
  });

  it('get_hand_joint returns joint data', () => {
    sendEvent(handTrackingHandler, node, cfg, ctx, {
      type: 'get_hand_joint',
      hand: 'left',
      joint: 'wrist',
      queryId: 'q1',
    });
    expect(getEventCount(ctx, 'hand_joint_result')).toBe(1);
  });

  it('rate limiting skips update within interval', () => {
    const s = (node as any).__handTrackingState;
    s.right.visible = true;
    s.right.pinchStrength = 0.9;
    // Very small delta should be accumulated, not processed
    updateTrait(handTrackingHandler, node, cfg, ctx, 0.001);
    expect(getEventCount(ctx, 'hand_gesture_start')).toBe(0);
  });

  it('detach unregisters', () => {
    handTrackingHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__handTrackingState).toBeUndefined();
    expect(getEventCount(ctx, 'hand_tracking_unregister')).toBe(1);
  });
});
