/**
 * PoseEstimationTrait — Production Test Suite
 *
 * No external dependencies — pure logic.
 *
 * Key behaviours:
 * 1. defaultConfig — 6 fields
 * 2. onAttach — creates __poseEstimationState; emits pose_estimation_init with model + keypoints
 * 3. onDetach — removes state; no throw
 * 4. onUpdate — no-op (event-driven); does not throw
 * 5. onEvent 'pose_detected':
 *   - filters low-confidence detections (< min_confidence)
 *   - smooths keypoints using smoothing_buffer: lerp between current and previous
 *   - pushes smoothed keypoints to smoothing_buffer; caps buffer at 5
 *   - updates detected_pose, confidence, last_detection_time
 *   - creates tracking_id when tracking_enabled=true and tracking_id is null
 *   - does NOT create new tracking_id if already set
 *   - tracking_id = null when tracking_enabled=false
 *   - emits on_pose_updated with pose, confidence, trackingId
 * 6. onEvent 'pose_lost':
 *   - clears detected_pose / confidence / tracking_id / smoothing_buffer
 *   - emits on_pose_lost
 * 7. onEvent 'get_keypoint':
 *   - returns named keypoint when found
 *   - emits on_keypoint_result with found=true/false
 * 8. smoothKeypoints math: smoothing=0 → current values pass through; smoothing=0.5 → midpoint
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { poseEstimationHandler } from '../PoseEstimationTrait';
import type { Keypoint } from '../PoseEstimationTrait';

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nodeId = 0;
function makeNode() {
  return { id: `pose_${++_nodeId}` };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function makeConfig(o: any = {}) {
  return { ...poseEstimationHandler.defaultConfig!, ...o };
}

function attach(o: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(o);
  poseEstimationHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) {
  return (node as any).__poseEstimationState;
}

function makeKeypoints(names: string[], val = 0.8): Keypoint[] {
  return names.map((name) => ({ x: 10, y: 20, z: 5, confidence: val, name }));
}

const BASIC_KPS = ['nose', 'left_eye', 'right_eye'];

beforeEach(() => vi.clearAllMocks());

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('poseEstimationHandler.defaultConfig', () => {
  const d = poseEstimationHandler.defaultConfig!;
  it('model = mediapipe', () => expect(d.model).toBe('mediapipe'));
  it('keypoints = 17', () => expect(d.keypoints).toBe(17));
  it('smoothing = 0.5', () => expect(d.smoothing).toBe(0.5));
  it('min_confidence = 0.5', () => expect(d.min_confidence).toBe(0.5));
  it('multi_person = false', () => expect(d.multi_person).toBe(false));
  it('tracking_enabled = true', () => expect(d.tracking_enabled).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('poseEstimationHandler.onAttach', () => {
  it('creates __poseEstimationState', () => {
    const { node } = attach();
    expect(getState(node)).toBeDefined();
  });
  it('detected_pose = null', () =>
    expect(attach().node.__poseEstimationState?.detected_pose).toBeNull());
  it('confidence = 0', () => expect(attach().node.__poseEstimationState?.confidence).toBe(0));
  it('tracking_id = null', () =>
    expect(attach().node.__poseEstimationState?.tracking_id).toBeNull());
  it('smoothing_buffer = []', () =>
    expect(attach().node.__poseEstimationState?.smoothing_buffer).toEqual([]));
  it('emits pose_estimation_init with model + keypoints', () => {
    const { ctx } = attach({ model: 'movenet', keypoints: 33 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'pose_estimation_init',
      expect.objectContaining({
        model: 'movenet',
        keypoints: 33,
      })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('poseEstimationHandler.onDetach', () => {
  it('removes __poseEstimationState', () => {
    const { node, ctx, config } = attach();
    poseEstimationHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
  it('does not throw', () => {
    const { node, ctx, config } = attach();
    expect(() => poseEstimationHandler.onDetach!(node as any, config, ctx as any)).not.toThrow();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────
describe('poseEstimationHandler.onUpdate', () => {
  it('does not throw and emits nothing', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    expect(() =>
      poseEstimationHandler.onUpdate!(node as any, config, ctx as any, 0.016)
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent 'pose_detected' ──────────────────────────────────────────────────
describe("onEvent 'pose_detected'", () => {
  it('ignores low-confidence detection (< min_confidence)', () => {
    const { node, ctx, config } = attach({ min_confidence: 0.7 });
    ctx.emit.mockClear();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(BASIC_KPS),
      confidence: 0.5,
    });
    expect(getState(node).detected_pose).toBeNull();
    expect(ctx.emit).not.toHaveBeenCalledWith('on_pose_updated', expect.anything());
  });

  it('accepts detection exactly at min_confidence', () => {
    const { node, ctx, config } = attach({ min_confidence: 0.5 });
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(BASIC_KPS, 0.5),
      confidence: 0.5,
    });
    expect(getState(node).detected_pose).not.toBeNull();
  });

  it('updates detected_pose and confidence', () => {
    const { node, ctx, config } = attach();
    const kps = makeKeypoints(BASIC_KPS);
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: kps,
      confidence: 0.9,
    });
    const state = getState(node);
    expect(state.confidence).toBe(0.9);
    expect(state.detected_pose).toHaveLength(BASIC_KPS.length);
  });

  it('emits on_pose_updated with pose/confidence/trackingId', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(BASIC_KPS),
      confidence: 0.8,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_pose_updated',
      expect.objectContaining({
        confidence: 0.8,
        trackingId: expect.any(String),
      })
    );
  });

  it('creates tracking_id on first detection when tracking_enabled=true', () => {
    const { node, ctx, config } = attach({ tracking_enabled: true });
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(BASIC_KPS),
      confidence: 0.8,
    });
    expect(getState(node).tracking_id).toMatch(/^track_/);
  });

  it('does NOT replace tracking_id on subsequent detections', () => {
    const { node, ctx, config } = attach({ tracking_enabled: true });
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(BASIC_KPS),
      confidence: 0.8,
    });
    const firstId = getState(node).tracking_id;
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(BASIC_KPS),
      confidence: 0.9,
    });
    expect(getState(node).tracking_id).toBe(firstId);
  });

  it('tracking_id = null when tracking_enabled=false', () => {
    const { node, ctx, config } = attach({ tracking_enabled: false });
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(BASIC_KPS),
      confidence: 0.8,
    });
    expect(getState(node).tracking_id).toBeNull();
  });

  it('smoothing_buffer capped at 5 entries', () => {
    const { node, ctx, config } = attach();
    for (let i = 0; i < 7; i++) {
      poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
        type: 'pose_detected',
        keypoints: makeKeypoints(BASIC_KPS),
        confidence: 0.9,
      });
    }
    expect(getState(node).smoothing_buffer.length).toBe(5);
  });

  it('smoothing=0: keypoints pass through unchanged', () => {
    const { node, ctx, config } = attach({ smoothing: 0 });
    // First detection (no buffer yet → no smoothing)
    const kps = [{ x: 50, y: 60, z: 0, confidence: 0.9, name: 'nose' }];
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: kps,
      confidence: 0.9,
    });
    // Store the first pose in buffer
    const poseAfterFirst = getState(node).detected_pose!;
    expect(poseAfterFirst[0].x).toBeCloseTo(50, 1);

    // Second detection: smoothing=0 → result = current * 1 + prev * 0 = current
    const kps2 = [{ x: 100, y: 200, z: 0, confidence: 0.9, name: 'nose' }];
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: kps2,
      confidence: 0.9,
    });
    expect(getState(node).detected_pose![0].x).toBeCloseTo(100, 1);
  });

  it('smoothing=0.5: x is midpoint between current and previous', () => {
    const { node, ctx, config } = attach({ smoothing: 0.5, min_confidence: 0 });
    // First frame: x=0
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: [{ x: 0, y: 0, confidence: 1, name: 'nose' }],
      confidence: 1,
    });
    // Second frame: x=100, smoothing=0.5 → result = 100 * 0.5 + 0 * 0.5 = 50
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: [{ x: 100, y: 0, confidence: 1, name: 'nose' }],
      confidence: 1,
    });
    expect(getState(node).detected_pose![0].x).toBeCloseTo(50, 1);
  });
});

// ─── onEvent 'pose_lost' ──────────────────────────────────────────────────────
describe("onEvent 'pose_lost'", () => {
  it('clears detected_pose / confidence / tracking_id / smoothing_buffer', () => {
    const { node, ctx, config } = attach();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(BASIC_KPS),
      confidence: 0.9,
    });
    ctx.emit.mockClear();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, { type: 'pose_lost' });
    const state = getState(node);
    expect(state.detected_pose).toBeNull();
    expect(state.confidence).toBe(0);
    expect(state.tracking_id).toBeNull();
    expect(state.smoothing_buffer).toEqual([]);
  });

  it('emits on_pose_lost', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, { type: 'pose_lost' });
    expect(ctx.emit).toHaveBeenCalledWith('on_pose_lost', expect.any(Object));
  });
});

// ─── onEvent 'get_keypoint' ───────────────────────────────────────────────────
describe("onEvent 'get_keypoint'", () => {
  it('emits on_keypoint_result with found=true and keypoint when present', () => {
    const { node, ctx, config } = attach();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(['nose', 'left_eye']),
      confidence: 0.9,
    });
    ctx.emit.mockClear();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'get_keypoint',
      name: 'nose',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_keypoint_result',
      expect.objectContaining({
        found: true,
        keypoint: expect.objectContaining({ name: 'nose' }),
      })
    );
  });

  it('emits on_keypoint_result with found=false when keypoint not in pose', () => {
    const { node, ctx, config } = attach();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'pose_detected',
      keypoints: makeKeypoints(['nose']),
      confidence: 0.9,
    });
    ctx.emit.mockClear();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'get_keypoint',
      name: 'right_wrist',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_keypoint_result',
      expect.objectContaining({ found: false })
    );
  });

  it('emits on_keypoint_result with found=false when no pose detected', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    poseEstimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'get_keypoint',
      name: 'nose',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_keypoint_result',
      expect.objectContaining({ found: false })
    );
  });
});
