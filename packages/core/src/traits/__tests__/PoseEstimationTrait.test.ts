import { describe, it, expect, beforeEach } from 'vitest';
import { poseEstimationHandler } from '../PoseEstimationTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('PoseEstimationTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    model: 'mediapipe' as const,
    keypoints: 17 as const,
    smoothing: 0.5,
    min_confidence: 0.5,
    multi_person: false,
    tracking_enabled: true,
  };

  const makeKeypoints = (offset = 0) => [
    { x: 0.5 + offset, y: 0.5 + offset, z: 0, confidence: 0.9, name: 'nose' },
    { x: 0.4 + offset, y: 0.4 + offset, z: 0, confidence: 0.8, name: 'left_eye' },
  ];

  beforeEach(() => {
    node = createMockNode('pe');
    ctx = createMockContext();
    attachTrait(poseEstimationHandler, node, cfg, ctx);
  });

  it('emits pose_estimation_init on attach', () => {
    expect(getEventCount(ctx, 'pose_estimation_init')).toBe(1);
    const s = (node as any).__poseEstimationState;
    expect(s.detected_pose).toBeNull();
  });

  it('pose_detected updates state', () => {
    sendEvent(poseEstimationHandler, node, cfg, ctx, {
      type: 'pose_detected',
      keypoints: makeKeypoints(),
      confidence: 0.9,
    });
    const s = (node as any).__poseEstimationState;
    expect(s.detected_pose).not.toBeNull();
    expect(s.confidence).toBe(0.9);
    expect(getEventCount(ctx, 'on_pose_updated')).toBe(1);
  });

  it('low confidence ignored', () => {
    sendEvent(poseEstimationHandler, node, cfg, ctx, {
      type: 'pose_detected',
      keypoints: makeKeypoints(),
      confidence: 0.3,
    });
    expect((node as any).__poseEstimationState.detected_pose).toBeNull();
    expect(getEventCount(ctx, 'on_pose_updated')).toBe(0);
  });

  it('tracking_enabled assigns tracking_id', () => {
    sendEvent(poseEstimationHandler, node, cfg, ctx, {
      type: 'pose_detected',
      keypoints: makeKeypoints(),
      confidence: 0.9,
    });
    expect((node as any).__poseEstimationState.tracking_id).not.toBeNull();
  });

  it('smoothing applied on consecutive detections', () => {
    sendEvent(poseEstimationHandler, node, cfg, ctx, {
      type: 'pose_detected',
      keypoints: makeKeypoints(0),
      confidence: 0.9,
    });
    const first = (node as any).__poseEstimationState.detected_pose[0].x;
    sendEvent(poseEstimationHandler, node, cfg, ctx, {
      type: 'pose_detected',
      keypoints: makeKeypoints(0.1),
      confidence: 0.9,
    });
    const second = (node as any).__poseEstimationState.detected_pose[0].x;
    // Smoothing factor 0.5 means blended with previous
    expect(second).not.toBe(0.6); // not raw
    expect(second).toBeGreaterThan(first);
  });

  it('pose_lost resets state', () => {
    sendEvent(poseEstimationHandler, node, cfg, ctx, {
      type: 'pose_detected',
      keypoints: makeKeypoints(),
      confidence: 0.9,
    });
    sendEvent(poseEstimationHandler, node, cfg, ctx, { type: 'pose_lost' });
    const s = (node as any).__poseEstimationState;
    expect(s.detected_pose).toBeNull();
    expect(s.tracking_id).toBeNull();
    expect(getEventCount(ctx, 'on_pose_lost')).toBe(1);
  });

  it('get_keypoint returns found keypoint', () => {
    sendEvent(poseEstimationHandler, node, cfg, ctx, {
      type: 'pose_detected',
      keypoints: makeKeypoints(),
      confidence: 0.9,
    });
    sendEvent(poseEstimationHandler, node, cfg, ctx, { type: 'get_keypoint', name: 'nose' });
    expect(getEventCount(ctx, 'on_keypoint_result')).toBe(1);
    const ev = getLastEvent(ctx, 'on_keypoint_result') as any;
    expect(ev.found).toBe(true);
  });

  it('detach cleans up', () => {
    poseEstimationHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__poseEstimationState).toBeUndefined();
  });
});
