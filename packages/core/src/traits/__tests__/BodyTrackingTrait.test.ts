import { describe, it, expect, beforeEach } from 'vitest';
import { bodyTrackingHandler } from '../BodyTrackingTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('BodyTrackingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'upper_body' as const,
    joint_smoothing: 0.5,
    prediction: true,
    avatar_binding: true,
    calibrate_on_start: true,
    tracking_confidence_threshold: 0.5,
  };

  beforeEach(() => {
    node = createMockNode('bt');
    ctx = createMockContext();
    attachTrait(bodyTrackingHandler, node, cfg, ctx);
  });

  it('emits body_tracking_start on attach', () => {
    expect(getEventCount(ctx, 'body_tracking_start')).toBe(1);
    expect((node as any).__bodyTrackingState.isTracking).toBe(false);
  });

  it('body_pose_update with sufficient joints activates tracking', () => {
    const joints: Record<string, any> = {};
    const upperJoints = [
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
    for (const j of upperJoints) {
      joints[j] = {
        position: [0, 1, 0],
        rotation: [0, 0, 0, 1 ],
        confidence: 0.9,
      };
    }
    sendEvent(bodyTrackingHandler, node, cfg, ctx, { type: 'body_pose_update', joints });
    expect((node as any).__bodyTrackingState.isTracking).toBe(true);
    expect(getEventCount(ctx, 'body_tracking_found')).toBe(1);
    expect(getEventCount(ctx, 'body_pose_changed')).toBe(1);
  });

  it('low confidence joints do not count', () => {
    const joints: Record<string, any> = {};
    const upperJoints = [
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
    for (const j of upperJoints) {
      joints[j] = {
        position: [0, 1, 0],
        rotation: [0, 0, 0, 1 ],
        confidence: 0.1,
      };
    }
    sendEvent(bodyTrackingHandler, node, cfg, ctx, { type: 'body_pose_update', joints });
    expect((node as any).__bodyTrackingState.isTracking).toBe(false);
  });

  it('tracking lost emits body_tracking_lost', () => {
    // First, get tracking
    const joints: Record<string, any> = {};
    const upperJoints = [
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
    for (const j of upperJoints) {
      joints[j] = {
        position: [0, 1, 0],
        rotation: [0, 0, 0, 1 ],
        confidence: 0.9,
      };
    }
    sendEvent(bodyTrackingHandler, node, cfg, ctx, { type: 'body_pose_update', joints });
    // Then lose it
    const lowJoints: Record<string, any> = {};
    for (const j of upperJoints) {
      lowJoints[j] = {
        position: [0, 1, 0],
        rotation: [0, 0, 0, 1 ],
        confidence: 0.1,
      };
    }
    sendEvent(bodyTrackingHandler, node, cfg, ctx, { type: 'body_pose_update', joints: lowJoints });
    expect(getEventCount(ctx, 'body_tracking_lost')).toBe(1);
  });

  it('avatar_pose_update emitted on update when tracking', () => {
    const s = (node as any).__bodyTrackingState;
    s.isTracking = true;
    s.joints.set('head', {
      position: [0, 1.8, 0],
      rotation: [0, 0, 0, 1 ],
      confidence: 0.9,
    });
    updateTrait(bodyTrackingHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'avatar_pose_update')).toBe(1);
  });

  it('body_calibrate measures height and arm span', () => {
    const s = (node as any).__bodyTrackingState;
    s.joints.set('head', {
      position: [0, 1.8, 0],
      rotation: [0, 0, 0, 1 ],
      confidence: 1,
    });
    s.joints.set('foot_left', {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1 ],
      confidence: 1,
    });
    s.joints.set('hand_left', {
      position: [-0.9, 1.2, 0],
      rotation: [0, 0, 0, 1 ],
      confidence: 1,
    });
    s.joints.set('hand_right', {
      position: [0.9, 1.2, 0],
      rotation: [0, 0, 0, 1 ],
      confidence: 1,
    });
    sendEvent(bodyTrackingHandler, node, cfg, ctx, { type: 'body_calibrate' });
    expect(s.calibrated).toBe(true);
    expect(s.bodyHeight).toBeCloseTo(1.8);
    expect(s.armSpan).toBeCloseTo(1.8);
    expect(getEventCount(ctx, 'body_calibrated')).toBe(1);
  });

  it('detach cleans up', () => {
    bodyTrackingHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__bodyTrackingState).toBeUndefined();
    expect(getEventCount(ctx, 'body_tracking_stop')).toBe(1);
  });
});
