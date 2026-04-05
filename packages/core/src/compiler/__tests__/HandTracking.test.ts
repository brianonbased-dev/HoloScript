/**
 * Camera Hand Tracking Compilation Tests (M.010.04)
 *
 * Tests that camera_hand_* traits produce correct MediaPipe Hands (Android)
 * and Vision framework (iOS) code for camera-based hand gesture recognition.
 */

import { describe, it, expect, vi } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import { IOSCompiler } from '../IOSCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'HandTrackingTestScene',
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  };
}

function createHandObject(
  name: string,
  traits: Array<string | { name: string; config?: Record<string, unknown> }> = []
): HoloObjectDecl {
  return {
    name,
    properties: [{ key: 'geometry', value: 'cube' }],
    traits,
  } as HoloObjectDecl;
}

// =========================================================
// Android Compiler
// =========================================================

describe('AndroidCompiler — Camera Hand Tracking', () => {
  const compiler = new AndroidCompiler();

  it('emits setupHandTracking when camera_hand_track trait is present', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('setupHandTracking()');
    expect(result.activityFile).toContain('Camera Hand Tracking: MediaPipe Hands');
  });

  it('does not emit hand tracking without camera_hand_* traits', () => {
    const composition = createComposition({
      objects: [createHandObject('Plain', ['clickable'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).not.toContain('setupHandTracking');
    expect(result.activityFile).not.toContain('MediaPipe');
  });

  it('adds MediaPipe dependency to build.gradle', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition);

    expect(result.buildGradle).toContain('com.google.mediapipe:solution-hands:0.10.14');
    expect(result.buildGradle).toContain('androidx.camera:camera-core');
    expect(result.buildGradle).toContain('androidx.camera:camera-lifecycle');
  });

  it('does not add MediaPipe dependency without hand tracking traits', () => {
    const composition = createComposition({
      objects: [createHandObject('Plain', ['clickable'])],
    });
    const result = compiler.compile(composition);

    expect(result.buildGradle).not.toContain('mediapipe');
  });

  it('sets maxNumHands to 2 when camera_hand_two_hands is present', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_two_hands'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('.setMaxNumHands(2)');
  });

  it('sets maxNumHands to 1 by default', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('.setMaxNumHands(1)');
  });

  it('emits pinch gesture recognition', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_gesture_pinch'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('Pinch gesture');
    expect(result.activityFile).toContain('pinchDist');
    expect(result.activityFile).toContain('PINCH detected');
  });

  it('emits point gesture recognition', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_gesture_point'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('Point gesture');
    expect(result.activityFile).toContain('indexExtended');
    expect(result.activityFile).toContain('POINT detected');
  });

  it('emits palm gesture recognition', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_gesture_palm'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('Palm gesture');
    expect(result.activityFile).toContain('allExtended');
    expect(result.activityFile).toContain('PALM detected');
  });

  it('emits fist gesture recognition', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_gesture_fist'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('Fist gesture');
    expect(result.activityFile).toContain('allCurled');
    expect(result.activityFile).toContain('FIST detected');
  });

  it('emits 21-joint skeleton when camera_hand_skeleton is present', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_skeleton'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('21-joint skeleton data');
    expect(result.activityFile).toContain('val wrist = landmarks.landmarkList[0]');
    expect(result.activityFile).toContain('val thumbCmc = landmarks.landmarkList[1]');
    expect(result.activityFile).toContain('val pinkyTip = landmarks.landmarkList[20]');
  });

  it('emits higher confidence threshold when camera_hand_confidence is present', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_confidence'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('.setMinHandDetectionConfidence(0.7f)');
    expect(result.activityFile).toContain('Filter low-confidence landmarks');
  });

  it('emits spatial input bridge when camera_hand_to_spatial is present', () => {
    const composition = createComposition({
      objects: [
        createHandObject('Controller', [
          'camera_hand_track',
          'camera_hand_gesture_pinch',
          'camera_hand_to_spatial',
        ]),
      ],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('onSpatialInput("pinch"');
    expect(result.activityFile).toContain('Bridge to HoloScript spatial_input');
  });

  it('emits CameraX front camera setup', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition);

    expect(result.activityFile).toContain('startCameraForHandTracking');
    expect(result.activityFile).toContain('DEFAULT_FRONT_CAMERA');
    expect(result.activityFile).toContain('ProcessCameraProvider');
  });
});

// =========================================================
// iOS Compiler
// =========================================================

describe('IOSCompiler — Camera Hand Tracking', () => {
  const compiler = new IOSCompiler();

  it('emits handTrackingFile when camera_hand_track trait is present', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toBeDefined();
    expect(typeof result.handTrackingFile).toBe('string');
    expect(result.handTrackingFile!.length).toBeGreaterThan(0);
  });

  it('does NOT emit handTrackingFile without camera_hand_* traits', () => {
    const composition = createComposition({
      objects: [createHandObject('Plain', ['clickable'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toBeUndefined();
  });

  it('imports Vision and AVFoundation frameworks', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('import Vision');
    expect(result.handTrackingFile).toContain('import AVFoundation');
  });

  it('creates VNDetectHumanHandPoseRequest', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('VNDetectHumanHandPoseRequest');
  });

  it('sets maximumHandCount to 2 when camera_hand_two_hands is present', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_two_hands'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('maximumHandCount = 2');
  });

  it('sets maximumHandCount to 1 by default', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('maximumHandCount = 1');
  });

  it('emits pinch gesture recognition with Vision joints', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_gesture_pinch'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('Pinch gesture');
    expect(result.handTrackingFile).toContain('.thumbTip');
    expect(result.handTrackingFile).toContain('.indexTip');
    expect(result.handTrackingFile).toContain('pinchDist');
  });

  it('emits point gesture recognition', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_gesture_point'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('Point gesture');
    expect(result.handTrackingFile).toContain('indexExtended');
    expect(result.handTrackingFile).toContain('.point');
  });

  it('emits palm gesture recognition', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_gesture_palm'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('Palm gesture');
    expect(result.handTrackingFile).toContain('allExtended');
  });

  it('emits fist gesture recognition', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_gesture_fist'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('Fist gesture');
    expect(result.handTrackingFile).toContain('allCurled');
  });

  it('emits 21-joint extraction when camera_hand_skeleton is present', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_skeleton'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('Extract all 21 joints');
    expect(result.handTrackingFile).toContain('.wrist');
    expect(result.handTrackingFile).toContain('.thumbCMC');
    expect(result.handTrackingFile).toContain('.littleTip');
  });

  it('emits confidence filtering when camera_hand_confidence is present', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track', 'camera_hand_confidence'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('minConfidence: Float = 0.7');
    expect(result.handTrackingFile).toContain('Filter low-confidence');
  });

  it('emits spatial input bridge when camera_hand_to_spatial is present', () => {
    const composition = createComposition({
      objects: [
        createHandObject('Controller', [
          'camera_hand_track',
          'camera_hand_gesture_pinch',
          'camera_hand_to_spatial',
        ]),
      ],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('emitSpatialInput');
    expect(result.handTrackingFile).toContain('Bridge to HoloScript spatial_input');
  });

  it('wraps AVCaptureSession for front camera', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('AVCaptureSession');
    expect(result.handTrackingFile).toContain('.front');
    expect(result.handTrackingFile).toContain('startTracking');
    expect(result.handTrackingFile).toContain('stopTracking');
  });

  it('emits HandGesture enum with requested gestures', () => {
    const composition = createComposition({
      objects: [
        createHandObject('Controller', [
          'camera_hand_track',
          'camera_hand_gesture_pinch',
          'camera_hand_gesture_fist',
        ]),
      ],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('enum HandGesture');
    expect(result.handTrackingFile).toContain('case pinch');
    expect(result.handTrackingFile).toContain('case fist');
    expect(result.handTrackingFile).toContain('case none');
  });

  it('uses AVCaptureVideoDataOutputSampleBufferDelegate extension', () => {
    const composition = createComposition({
      objects: [createHandObject('Controller', ['camera_hand_track'])],
    });
    const result = compiler.compile(composition, 'test-token');

    expect(result.handTrackingFile).toContain('AVCaptureVideoDataOutputSampleBufferDelegate');
    expect(result.handTrackingFile).toContain('captureOutput');
    expect(result.handTrackingFile).toContain('VNImageRequestHandler');
  });
});
