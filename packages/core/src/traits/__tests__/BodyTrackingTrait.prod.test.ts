/**
 * BodyTrackingTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { bodyTrackingHandler } from '../BodyTrackingTrait';

function makeNode() {
  return { id: 'bt_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...bodyTrackingHandler.defaultConfig!, ...cfg };
  bodyTrackingHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

function makePose(x = 0, y = 0, z = 0, conf = 1.0) {
  return { position: { x, y, z }, rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: conf };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('bodyTrackingHandler.defaultConfig', () => {
  const d = bodyTrackingHandler.defaultConfig!;
  it('mode=upper_body', () => expect(d.mode).toBe('upper_body'));
  it('joint_smoothing=0.5', () => expect(d.joint_smoothing).toBe(0.5));
  it('prediction=true', () => expect(d.prediction).toBe(true));
  it('avatar_binding=true', () => expect(d.avatar_binding).toBe(true));
  it('calibrate_on_start=true', () => expect(d.calibrate_on_start).toBe(true));
  it('tracking_confidence_threshold=0.5', () => expect(d.tracking_confidence_threshold).toBe(0.5));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('bodyTrackingHandler.onAttach', () => {
  it('creates __bodyTrackingState', () => expect(attach().node.__bodyTrackingState).toBeDefined());
  it('isTracking=false', () => expect(attach().node.__bodyTrackingState.isTracking).toBe(false));
  it('joints is empty Map', () => expect(attach().node.__bodyTrackingState.joints.size).toBe(0));
  it('prevJoints is empty Map', () =>
    expect(attach().node.__bodyTrackingState.prevJoints.size).toBe(0));
  it('bodyHeight=0', () => expect(attach().node.__bodyTrackingState.bodyHeight).toBe(0));
  it('armSpan=0', () => expect(attach().node.__bodyTrackingState.armSpan).toBe(0));
  it('calibrated=false', () => expect(attach().node.__bodyTrackingState.calibrated).toBe(false));
  it('emits body_tracking_start with mode + joints + prediction', () => {
    const { ctx } = attach({ mode: 'hands_only', prediction: false });
    expect(ctx.emit).toHaveBeenCalledWith(
      'body_tracking_start',
      expect.objectContaining({
        mode: 'hands_only',
        prediction: false,
        joints: expect.arrayContaining(['wrist_left', 'hand_right']),
      })
    );
  });
  it('joint list for upper_body excludes lower body joints', () => {
    const { ctx } = attach({ mode: 'upper_body' });
    const call = ctx.emit.mock.calls[0][1];
    expect(call.joints).toContain('head');
    expect(call.joints).not.toContain('knee_left');
  });
  it('joint list for full_body includes lower body joints', () => {
    const { ctx } = attach({ mode: 'full_body' });
    const call = ctx.emit.mock.calls[0][1];
    expect(call.joints).toContain('foot_left');
  });
  it('custom mode uses custom_joints array', () => {
    const { ctx } = attach({ mode: 'custom', custom_joints: ['head', 'neck'] });
    const call = ctx.emit.mock.calls[0][1];
    expect(call.joints).toEqual(['head', 'neck']);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('bodyTrackingHandler.onDetach', () => {
  it('emits body_tracking_stop', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    bodyTrackingHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('body_tracking_stop', { node });
  });
  it('removes __bodyTrackingState', () => {
    const { node, config, ctx } = attach();
    bodyTrackingHandler.onDetach!(node, config, ctx);
    expect(node.__bodyTrackingState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('bodyTrackingHandler.onUpdate — not tracking', () => {
  it('accumulates lostTime += delta * 1000 when !isTracking', () => {
    const { node, config, ctx } = attach();
    bodyTrackingHandler.onUpdate!(node, config, ctx, 0.5);
    expect(node.__bodyTrackingState.lostTime).toBeCloseTo(500, 5);
  });
  it('does NOT emit avatar_pose_update when not tracking', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    bodyTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

describe('bodyTrackingHandler.onUpdate — tracking + avatar_binding', () => {
  it('emits avatar_pose_update when isTracking + avatar_binding + joints non-empty', () => {
    const { node, config, ctx } = attach({ avatar_binding: true });
    node.__bodyTrackingState.isTracking = true;
    node.__bodyTrackingState.joints.set('head', makePose(0, 1.8, 0));
    ctx.emit.mockClear();
    bodyTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'avatar_pose_update',
      expect.objectContaining({
        joints: expect.objectContaining({ head: expect.any(Object) }),
      })
    );
  });
  it('does NOT emit avatar_pose_update when avatar_binding=false', () => {
    const { node, config, ctx } = attach({ avatar_binding: false });
    node.__bodyTrackingState.isTracking = true;
    node.__bodyTrackingState.joints.set('head', makePose(0, 1.8, 0));
    ctx.emit.mockClear();
    bodyTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('does NOT emit avatar_pose_update when joints is empty', () => {
    const { node, config, ctx } = attach({ avatar_binding: true });
    node.__bodyTrackingState.isTracking = true;
    ctx.emit.mockClear();
    bodyTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — body_pose_update ───────────────────────────────────────────────

describe('bodyTrackingHandler.onEvent — body_pose_update', () => {
  it('stores joints above confidence threshold', () => {
    const { node, config, ctx } = attach({
      mode: 'upper_body',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    bodyTrackingHandler.onEvent!(node, config, ctx, {
      type: 'body_pose_update',
      joints: { head: makePose(0, 1.8, 0, 0.9), neck: makePose(0, 1.6, 0, 0.8) },
    });
    expect(node.__bodyTrackingState.joints.has('head')).toBe(true);
    expect(node.__bodyTrackingState.joints.has('neck')).toBe(true);
  });
  it('ignores joints below confidence threshold', () => {
    const { node, config, ctx } = attach({
      mode: 'upper_body',
      tracking_confidence_threshold: 0.8,
      joint_smoothing: 0,
    });
    bodyTrackingHandler.onEvent!(node, config, ctx, {
      type: 'body_pose_update',
      joints: { head: makePose(0, 1.8, 0, 0.3) }, // 0.3 < 0.8
    });
    expect(node.__bodyTrackingState.joints.has('head')).toBe(false);
  });
  it('sets isTracking=true when >=50% joints valid', () => {
    // upper_body has 12 joints, send all with high confidence
    const { node, config, ctx } = attach({
      mode: 'upper_body',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    const allJoints: any = {};
    for (const j of [
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
    ]) {
      allJoints[j] = makePose(0, 0, 0, 1.0);
    }
    bodyTrackingHandler.onEvent!(node, config, ctx, {
      type: 'body_pose_update',
      joints: allJoints,
    });
    expect(node.__bodyTrackingState.isTracking).toBe(true);
  });
  it('emits body_tracking_found on first valid update (wasTracking=false)', () => {
    const { node, config, ctx } = attach({
      mode: 'upper_body',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    const allJoints: any = {};
    for (const j of [
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
    ]) {
      allJoints[j] = makePose(0, 0, 0, 1.0);
    }
    ctx.emit.mockClear();
    bodyTrackingHandler.onEvent!(node, config, ctx, {
      type: 'body_pose_update',
      joints: allJoints,
    });
    expect(ctx.emit).toHaveBeenCalledWith('body_tracking_found', { node });
  });
  it('does NOT emit body_tracking_found on subsequent updates', () => {
    const { node, config, ctx } = attach({
      mode: 'hands_only',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    const joints: any = {
      wrist_left: makePose(0, 0, 0, 1),
      wrist_right: makePose(0, 0, 0, 1),
      hand_left: makePose(0, 0, 0, 1),
      hand_right: makePose(0, 0, 0, 1),
    };
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_pose_update', joints });
    ctx.emit.mockClear();
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_pose_update', joints });
    expect(ctx.emit).not.toHaveBeenCalledWith('body_tracking_found', expect.any(Object));
  });
  it('emits body_pose_changed with confidence when tracking', () => {
    const { node, config, ctx } = attach({
      mode: 'hands_only',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    const joints: any = {
      wrist_left: makePose(0, 0, 0, 1),
      wrist_right: makePose(0, 0, 0, 1),
      hand_left: makePose(0, 0, 0, 1),
      hand_right: makePose(0, 0, 0, 1),
    };
    ctx.emit.mockClear();
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_pose_update', joints });
    expect(ctx.emit).toHaveBeenCalledWith(
      'body_pose_changed',
      expect.objectContaining({ confidence: 1.0 })
    );
  });
  it('emits body_tracking_lost when transitioning from tracking to lost', () => {
    const { node, config, ctx } = attach({
      mode: 'hands_only',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    // First: establish tracking
    const joints: any = {
      wrist_left: makePose(0, 0, 0, 1),
      wrist_right: makePose(0, 0, 0, 1),
      hand_left: makePose(0, 0, 0, 1),
      hand_right: makePose(0, 0, 0, 1),
    };
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_pose_update', joints });
    ctx.emit.mockClear();
    // Now: send low confidence (everything below threshold)
    const badJoints: any = { wrist_left: makePose(0, 0, 0, 0.1) };
    bodyTrackingHandler.onEvent!(node, config, ctx, {
      type: 'body_pose_update',
      joints: badJoints,
    });
    expect(ctx.emit).toHaveBeenCalledWith('body_tracking_lost', { node });
  });
  it('resets lostTime when tracking resumes', () => {
    const { node, config, ctx } = attach({
      mode: 'hands_only',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    node.__bodyTrackingState.lostTime = 2000;
    const joints: any = {
      wrist_left: makePose(0, 0, 0, 1),
      wrist_right: makePose(0, 0, 0, 1),
      hand_left: makePose(0, 0, 0, 1),
      hand_right: makePose(0, 0, 0, 1),
    };
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_pose_update', joints });
    expect(node.__bodyTrackingState.lostTime).toBe(0);
  });
  it('smoothes joint pose when joint_smoothing>0 and prevJoint exists', () => {
    const { node, config, ctx } = attach({
      mode: 'hands_only',
      tracking_confidence_threshold: 0,
      joint_smoothing: 0.5,
    });
    // First update: prev = zero pose
    node.__bodyTrackingState.prevJoints.set('wrist_left', makePose(0, 0, 0));
    // Send wrist_left at x=1
    bodyTrackingHandler.onEvent!(node, config, ctx, {
      type: 'body_pose_update',
      joints: {
        wrist_left: makePose(1, 0, 0, 1),
        wrist_right: makePose(0, 0, 0, 1),
        hand_left: makePose(0, 0, 0, 1),
        hand_right: makePose(0, 0, 0, 1),
      },
    });
    // smoothed = prev*0.5 + current*0.5 = 0*0.5 + 1*0.5 = 0.5
    expect(node.__bodyTrackingState.joints.get('wrist_left')?.position.x).toBeCloseTo(0.5, 5);
  });
  it('uses raw pose when joint_smoothing=0', () => {
    const { node, config, ctx } = attach({
      mode: 'hands_only',
      tracking_confidence_threshold: 0,
      joint_smoothing: 0,
    });
    const joints: any = {
      wrist_left: makePose(3, 0, 0, 1),
      wrist_right: makePose(0, 0, 0, 1),
      hand_left: makePose(0, 0, 0, 1),
      hand_right: makePose(0, 0, 0, 1),
    };
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_pose_update', joints });
    expect(node.__bodyTrackingState.joints.get('wrist_left')?.position.x).toBe(3);
  });
  it('updates lastUpdateTime', () => {
    const before = Date.now();
    const { node, config, ctx } = attach({
      mode: 'hands_only',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    const joints: any = {
      wrist_left: makePose(0, 0, 0, 1),
      wrist_right: makePose(0, 0, 0, 1),
      hand_left: makePose(0, 0, 0, 1),
      hand_right: makePose(0, 0, 0, 1),
    };
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_pose_update', joints });
    expect(node.__bodyTrackingState.lastUpdateTime).toBeGreaterThanOrEqual(before);
  });
});

// ─── onEvent — body_calibrate ─────────────────────────────────────────────────

describe('bodyTrackingHandler.onEvent — body_calibrate', () => {
  it('computes bodyHeight = head.y - feet.y when head + foot_left set', () => {
    const { node, config, ctx } = attach({
      mode: 'full_body',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    node.__bodyTrackingState.joints.set('head', makePose(0, 1.8, 0));
    node.__bodyTrackingState.joints.set('foot_left', makePose(0, 0, 0));
    ctx.emit.mockClear();
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_calibrate' });
    expect(node.__bodyTrackingState.bodyHeight).toBeCloseTo(1.8, 5);
  });
  it('falls back to ankle_left when foot_left not set', () => {
    const { node, config, ctx } = attach({
      mode: 'full_body',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    node.__bodyTrackingState.joints.set('head', makePose(0, 1.75, 0));
    node.__bodyTrackingState.joints.set('ankle_left', makePose(0, 0.05, 0));
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_calibrate' });
    expect(node.__bodyTrackingState.bodyHeight).toBeCloseTo(1.7, 5);
  });
  it('computes armSpan using hand_left + hand_right distance', () => {
    const { node, config, ctx } = attach({
      mode: 'full_body',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    node.__bodyTrackingState.joints.set('hand_left', makePose(-0.9, 0, 0));
    node.__bodyTrackingState.joints.set('hand_right', makePose(0.9, 0, 0));
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_calibrate' });
    expect(node.__bodyTrackingState.armSpan).toBeCloseTo(1.8, 5);
  });
  it('sets calibrated=true', () => {
    const { node, config, ctx } = attach();
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_calibrate' });
    expect(node.__bodyTrackingState.calibrated).toBe(true);
  });
  it('emits body_calibrated with bodyHeight and armSpan', () => {
    const { node, config, ctx } = attach({
      mode: 'full_body',
      tracking_confidence_threshold: 0.5,
      joint_smoothing: 0,
    });
    node.__bodyTrackingState.joints.set('head', makePose(0, 1.8, 0));
    node.__bodyTrackingState.joints.set('foot_left', makePose(0, 0, 0));
    ctx.emit.mockClear();
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_calibrate' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'body_calibrated',
      expect.objectContaining({
        bodyHeight: expect.any(Number),
        armSpan: expect.any(Number),
      })
    );
  });
  it('does NOT set bodyHeight when head or feet missing', () => {
    const { node, config, ctx } = attach();
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_calibrate' });
    expect(node.__bodyTrackingState.bodyHeight).toBe(0);
  });
  it('does NOT set armSpan when hands missing', () => {
    const { node, config, ctx } = attach();
    bodyTrackingHandler.onEvent!(node, config, ctx, { type: 'body_calibrate' });
    expect(node.__bodyTrackingState.armSpan).toBe(0);
  });
});
