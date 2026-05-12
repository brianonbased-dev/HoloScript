import { describe, expect, it, beforeEach } from 'vitest';
import {
  estimateWebcamGazeFromLandmarks,
  webcamGazeHandler,
  webcamGazeToRay,
  type NormalizedFaceLandmark,
} from '../WebcamGazeTrait';
import {
  attachTrait,
  createMockContext,
  createMockNode,
  getLastEvent,
  sendEvent,
} from './traitTestHelpers';

function makeLandmarks(irisOffsetX = 0, irisOffsetY = 0): NormalizedFaceLandmark[] {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

  points[33] = { x: 0.35, y: 0.4 };
  points[133] = { x: 0.45, y: 0.4 };
  points[362] = { x: 0.55, y: 0.4 };
  points[263] = { x: 0.65, y: 0.4 };

  for (const index of [468, 469, 470, 471, 472]) {
    points[index] = { x: 0.4 + irisOffsetX, y: 0.4 + irisOffsetY };
  }
  for (const index of [473, 474, 475, 476, 477]) {
    points[index] = { x: 0.6 + irisOffsetX, y: 0.4 + irisOffsetY };
  }

  return points;
}

describe('WebcamGazeTrait gaze math', () => {
  it('estimates centered iris landmarks as viewport center', () => {
    const sample = estimateWebcamGazeFromLandmarks(makeLandmarks());
    expect(sample).not.toBeNull();
    expect(sample?.gaze_x).toBeCloseTo(0.5, 3);
    expect(sample?.gaze_y).toBeCloseTo(0.5, 3);
    expect(sample?.foveal_center[0]).toBeCloseTo(0, 6);
    expect(sample?.foveal_center[1]).toBeCloseTo(0, 6);
  });

  it('maps iris displacement into foveal-center NDC', () => {
    const sample = estimateWebcamGazeFromLandmarks(makeLandmarks(0.02, -0.01));
    expect(sample).not.toBeNull();
    expect(sample?.gaze_x).toBeGreaterThan(0.5);
    expect(sample?.gaze_y).toBeLessThan(0.5);
    expect(sample?.foveal_center[0]).toBeGreaterThan(0);
    expect(sample?.foveal_center[1]).toBeGreaterThan(0);
  });

  it('bridges normalized foveal centers into forward eye rays', () => {
    const direction = webcamGazeToRay({ foveal_center: [0, 0] });
    expect(direction[0]).toBeCloseTo(0);
    expect(direction[1]).toBeCloseTo(0);
    expect(direction[2]).toBeCloseTo(-1);
  });
});

describe('WebcamGazeTrait handler', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('webcam-gaze-node');
    ctx = createMockContext();
  });

  it('emits ready without touching the camera when auto_start=false', () => {
    attachTrait(webcamGazeHandler, node, { auto_start: false }, ctx);
    const ready = getLastEvent(ctx, 'webcam_gaze_ready');
    expect(ready.autoStart).toBe(false);
  });

  it('converts landmark events into foveal and avatar eye-tracking events', () => {
    attachTrait(webcamGazeHandler, node, { auto_start: false }, ctx);
    sendEvent(webcamGazeHandler, node, { auto_start: false }, ctx, {
      type: 'webcam_gaze_landmarks',
      landmarks: makeLandmarks(0.02, 0),
    });

    const gaze = getLastEvent(ctx, 'webcam_gaze_update');
    const foveal = getLastEvent(ctx, 'foveal_center_update');
    const avatarInput = getLastEvent(ctx, 'avatar_input_sample');
    const eyeGaze = getLastEvent(ctx, 'eye_gaze_update');

    expect(gaze.gaze_x).toBeGreaterThan(0.5);
    expect(foveal.foveal_center[0]).toBeGreaterThan(0);
    expect(avatarInput.device).toBe('eye_tracking');
    expect(avatarInput.axes.gaze_x).toBe(gaze.gaze_x);
    expect(eyeGaze.direction[2]).toBeLessThan(0);
  });
});
