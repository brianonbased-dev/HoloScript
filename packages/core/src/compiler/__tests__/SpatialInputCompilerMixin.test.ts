/**
 * SpatialInputCompilerMixin Test Suite
 *
 * Tests the compilation of spatial input domain blocks to intermediate
 * representations and platform-specific code generation for:
 *   - ARCore (Kotlin)
 *   - ARKit (Swift)
 *   - OpenXR (C++)
 *   - WebXR (TypeScript)
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  compileHandTrackingBlock,
  compileGazeTransientPointerBlock,
  compileSharedSpatialAnchorBlock,
  compileControllerInputBlock,
  compileSpatialInputBlock,
  spatialInputToTarget,
  compileSpatialInputBlocks,
  handTrackingToARCore,
  handTrackingToARKit,
  handTrackingToOpenXR,
  handTrackingToWebXR,
  gazeTransientPointerToARCore,
  gazeTransientPointerToARKit,
  gazeTransientPointerToOpenXR,
  gazeTransientPointerToWebXR,
  sharedAnchorToARCore,
  sharedAnchorToARKit,
  sharedAnchorToOpenXR,
  sharedAnchorToWebXR,
  controllerInputToARCore,
  controllerInputToARKit,
  controllerInputToOpenXR,
  controllerInputToWebXR,
  type CompiledHandTracking,
  type CompiledGazeTransientPointer,
  type CompiledSharedSpatialAnchor,
  type CompiledControllerInput,
} from '../SpatialInputCompilerMixin';

// =============================================================================
// HELPERS
// =============================================================================

function mockBlock(overrides: any = {}) {
  return {
    type: 'DomainBlock',
    keyword: 'hand_tracking',
    name: 'TestHandTracker',
    domain: 'input',
    properties: {},
    traits: [],
    children: [],
    ...overrides,
  };
}

// =============================================================================
// COMPILE FUNCTIONS — Intermediate Representations
// =============================================================================

describe('compileHandTrackingBlock', () => {
  it('extracts hand tracking configuration from block', () => {
    const ht = compileHandTrackingBlock(
      mockBlock({
        name: 'MyHands',
        properties: {
          update_rate_hz: 120,
          smoothing: 0.5,
          pinch_threshold: 0.7,
          grip_threshold: 0.6,
          confidence_threshold: 0.4,
          prediction: false,
          haptic_on_gesture: false,
          gesture_set: ['pinch', 'grab'],
        },
      })
    );

    expect(ht.name).toBe('MyHands');
    expect(ht.updateRateHz).toBe(120);
    expect(ht.smoothing).toBe(0.5);
    expect(ht.pinchThreshold).toBe(0.7);
    expect(ht.gripThreshold).toBe(0.6);
    expect(ht.confidenceThreshold).toBe(0.4);
    expect(ht.prediction).toBe(false);
    expect(ht.hapticOnGesture).toBe(false);
    expect(ht.gestureSet).toEqual(['pinch', 'grab']);
  });

  it('uses defaults for missing properties', () => {
    const ht = compileHandTrackingBlock(mockBlock());
    expect(ht.name).toBe('TestHandTracker');
    expect(ht.updateRateHz).toBe(90);
    expect(ht.smoothing).toBe(0.3);
    expect(ht.pinchThreshold).toBe(0.8);
    expect(ht.prediction).toBe(true);
    expect(ht.hapticOnGesture).toBe(true);
  });

  it('handles missing name', () => {
    const ht = compileHandTrackingBlock(mockBlock({ name: undefined }));
    expect(ht.name).toBe('hand_tracker');
  });
});

describe('compileGazeTransientPointerBlock', () => {
  it('extracts gaze config from block', () => {
    const gaze = compileGazeTransientPointerBlock(
      mockBlock({
        keyword: 'gaze_transient_pointer',
        name: 'VisionGaze',
        properties: {
          dwell_enabled: false,
          dwell_time_ms: 1200,
          max_distance: 20,
          pinch_to_commit: false,
          haptic_intensity: 0.8,
        },
      })
    );

    expect(gaze.name).toBe('VisionGaze');
    expect(gaze.dwellEnabled).toBe(false);
    expect(gaze.dwellTimeMs).toBe(1200);
    expect(gaze.maxDistance).toBe(20);
    expect(gaze.pinchToCommit).toBe(false);
    expect(gaze.hapticIntensity).toBe(0.8);
  });

  it('uses defaults for missing properties', () => {
    const gaze = compileGazeTransientPointerBlock(
      mockBlock({
        keyword: 'gaze_transient_pointer',
      })
    );
    expect(gaze.dwellEnabled).toBe(true);
    expect(gaze.dwellTimeMs).toBe(800);
    expect(gaze.maxDistance).toBe(10);
    expect(gaze.pinchToCommit).toBe(true);
  });
});

describe('compileSharedSpatialAnchorBlock', () => {
  it('extracts shared anchor config', () => {
    const anchor = compileSharedSpatialAnchorBlock(
      mockBlock({
        keyword: 'shared_anchor',
        name: 'GameAnchor',
        properties: {
          auto_share: false,
          ttl_seconds: 3600,
          max_retries: 10,
          quality_threshold: 0.8,
          persistent: true,
          room_id: 'game-room-42',
          sync_transforms: false,
        },
      })
    );

    expect(anchor.name).toBe('GameAnchor');
    expect(anchor.autoShare).toBe(false);
    expect(anchor.ttlSeconds).toBe(3600);
    expect(anchor.maxRetries).toBe(10);
    expect(anchor.qualityThreshold).toBe(0.8);
    expect(anchor.persistent).toBe(true);
    expect(anchor.roomId).toBe('game-room-42');
    expect(anchor.syncTransforms).toBe(false);
  });

  it('uses defaults for missing properties', () => {
    const anchor = compileSharedSpatialAnchorBlock(
      mockBlock({
        keyword: 'shared_anchor',
      })
    );
    expect(anchor.autoShare).toBe(true);
    expect(anchor.ttlSeconds).toBe(0);
    expect(anchor.maxRetries).toBe(5);
    expect(anchor.persistent).toBe(false);
  });
});

describe('compileControllerInputBlock', () => {
  it('extracts controller config', () => {
    const ctrl = compileControllerInputBlock(
      mockBlock({
        keyword: 'controller_input',
        name: 'QuestController',
        properties: {
          deadzone: 0.2,
          trigger_threshold: 0.4,
          grip_threshold: 0.6,
          haptic_on_press: false,
          thumbstick_as_dpad: true,
          dpad_threshold: 0.8,
          tracked_buttons: ['trigger', 'grip'],
        },
      })
    );

    expect(ctrl.name).toBe('QuestController');
    expect(ctrl.deadzone).toBe(0.2);
    expect(ctrl.triggerThreshold).toBe(0.4);
    expect(ctrl.gripThreshold).toBe(0.6);
    expect(ctrl.hapticOnPress).toBe(false);
    expect(ctrl.thumbstickAsDpad).toBe(true);
    expect(ctrl.dpadThreshold).toBe(0.8);
    expect(ctrl.trackedButtons).toEqual(['trigger', 'grip']);
  });

  it('uses defaults for missing properties', () => {
    const ctrl = compileControllerInputBlock(
      mockBlock({
        keyword: 'controller_input',
      })
    );
    expect(ctrl.deadzone).toBe(0.15);
    expect(ctrl.triggerThreshold).toBe(0.5);
    expect(ctrl.thumbstickAsDpad).toBe(false);
  });
});

// =============================================================================
// compileSpatialInputBlock — keyword routing
// =============================================================================

describe('compileSpatialInputBlock', () => {
  it('routes hand_tracking keyword', () => {
    const result = compileSpatialInputBlock(mockBlock({ keyword: 'hand_tracking' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('hand_tracking');
  });

  it('routes spatial_input_hand_tracking keyword', () => {
    const result = compileSpatialInputBlock(mockBlock({ keyword: 'spatial_input_hand_tracking' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('hand_tracking');
  });

  it('routes gaze_transient_pointer keyword', () => {
    const result = compileSpatialInputBlock(mockBlock({ keyword: 'gaze_transient_pointer' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('gaze_transient_pointer');
  });

  it('routes spatial_input_gaze_transient_pointer keyword', () => {
    const result = compileSpatialInputBlock(
      mockBlock({ keyword: 'spatial_input_gaze_transient_pointer' })
    );
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('gaze_transient_pointer');
  });

  it('routes shared_anchor keyword', () => {
    const result = compileSpatialInputBlock(mockBlock({ keyword: 'shared_anchor' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('shared_anchor');
  });

  it('routes controller_input keyword', () => {
    const result = compileSpatialInputBlock(mockBlock({ keyword: 'controller_input' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('controller_input');
  });

  it('returns null for unknown keywords', () => {
    expect(compileSpatialInputBlock(mockBlock({ keyword: 'material' }))).toBeNull();
    expect(compileSpatialInputBlock(mockBlock({ keyword: 'rigidbody' }))).toBeNull();
    expect(compileSpatialInputBlock(mockBlock({ keyword: 'audio_source' }))).toBeNull();
  });
});

// =============================================================================
// ARCORE (Kotlin) CODE GENERATION
// =============================================================================

describe('ARCore (Kotlin) code generation', () => {
  const defaultHT: CompiledHandTracking = {
    name: 'hands',
    updateRateHz: 90,
    smoothing: 0.3,
    pinchThreshold: 0.8,
    gripThreshold: 0.7,
    confidenceThreshold: 0.5,
    prediction: true,
    hapticOnGesture: true,
    gestureSet: ['pinch', 'grab'],
    traits: [],
  };

  const defaultGaze: CompiledGazeTransientPointer = {
    name: 'gaze',
    dwellEnabled: true,
    dwellTimeMs: 800,
    dwellFeedback: true,
    hapticOnCommit: true,
    hapticIntensity: 0.4,
    maxDistance: 10,
    pinchToCommit: true,
    traits: [],
  };

  const defaultAnchor: CompiledSharedSpatialAnchor = {
    name: 'anchor',
    autoShare: true,
    ttlSeconds: 0,
    maxRetries: 5,
    retryDelayMs: 2000,
    qualityThreshold: 0.6,
    persistent: false,
    roomId: 'room-1',
    syncTransforms: true,
    traits: [],
  };

  const defaultCtrl: CompiledControllerInput = {
    name: 'ctrl',
    deadzone: 0.15,
    triggerThreshold: 0.5,
    gripThreshold: 0.5,
    hapticOnPress: true,
    hapticIntensity: 0.3,
    trackedButtons: [],
    thumbstickAsDpad: false,
    dpadThreshold: 0.7,
    traits: [],
  };

  it('generates hand tracking Kotlin code', () => {
    const code = handTrackingToARCore(defaultHT);
    expect(code).toContain('HandTrackingConfig');
    expect(code).toContain('setUpdateRateHz(90)');
    expect(code).toContain('setSmoothing(0.3f)');
    expect(code).toContain('setPinchThreshold(0.8f)');
    expect(code).toContain('createHandTracker');
    expect(code).toContain('setOnFrameCallback');
    expect(code).toContain('vibrateController'); // haptic
  });

  it('generates gaze transient pointer Kotlin code', () => {
    const code = gazeTransientPointerToARCore(defaultGaze);
    expect(code).toContain('GazeTransientPointerConfig');
    expect(code).toContain('privacy-first');
    expect(code).toContain('NEVER exposed');
    expect(code).toContain('setOnCommitListener');
    expect(code).toContain('setMaxDistance(10f)');
    expect(code).toContain('vibrateController'); // haptic
    expect(code).toContain('setOnDwellProgressListener'); // dwell
  });

  it('generates shared anchor Kotlin code', () => {
    const code = sharedAnchorToARCore(defaultAnchor);
    expect(code).toContain('SharedAnchorConfig');
    expect(code).toContain('hostCloudAnchorAsync');
    expect(code).toContain('shareAnchorToRoom');
    expect(code).toContain('"room-1"');
    expect(code).toContain('enableTransformSync'); // sync
    expect(code).toContain('retryHostAnchor');
  });

  it('generates controller input Kotlin code', () => {
    const code = controllerInputToARCore(defaultCtrl);
    expect(code).toContain('ControllerInputConfig');
    expect(code).toContain('setDeadzone(0.15f)');
    expect(code).toContain('setOnInputListener');
    expect(code).toContain('applyDeadzone');
    expect(code).toContain('vibrateController'); // haptic
  });

  it('supports variable prefix', () => {
    const code = handTrackingToARCore(defaultHT, 'player');
    expect(code).toContain('player_handTrackingConfig');
    expect(code).toContain('player_handTracker');
  });
});

// =============================================================================
// ARKIT (Swift) CODE GENERATION
// =============================================================================

describe('ARKit (Swift) code generation', () => {
  const defaultHT: CompiledHandTracking = {
    name: 'hands',
    updateRateHz: 90,
    smoothing: 0.3,
    pinchThreshold: 0.8,
    gripThreshold: 0.7,
    confidenceThreshold: 0.5,
    prediction: true,
    hapticOnGesture: true,
    gestureSet: ['pinch', 'grab'],
    traits: [],
  };

  const defaultGaze: CompiledGazeTransientPointer = {
    name: 'gaze',
    dwellEnabled: true,
    dwellTimeMs: 800,
    dwellFeedback: true,
    hapticOnCommit: true,
    hapticIntensity: 0.4,
    maxDistance: 10,
    pinchToCommit: true,
    traits: [],
  };

  const defaultAnchor: CompiledSharedSpatialAnchor = {
    name: 'anchor',
    autoShare: true,
    ttlSeconds: 0,
    maxRetries: 5,
    retryDelayMs: 2000,
    qualityThreshold: 0.6,
    persistent: true,
    roomId: 'room-1',
    syncTransforms: true,
    traits: [],
  };

  const defaultCtrl: CompiledControllerInput = {
    name: 'ctrl',
    deadzone: 0.15,
    triggerThreshold: 0.5,
    gripThreshold: 0.5,
    hapticOnPress: true,
    hapticIntensity: 0.3,
    trackedButtons: [],
    thumbstickAsDpad: false,
    dpadThreshold: 0.7,
    traits: [],
  };

  it('generates hand tracking Swift code', () => {
    const code = handTrackingToARKit(defaultHT);
    expect(code).toContain('HandTrackingProvider');
    expect(code).toContain('ARKitSession');
    expect(code).toContain('anchorUpdates');
    expect(code).toContain('handSkeleton');
    expect(code).toContain('pinchDistance');
    expect(code).toContain('CHHapticEngine'); // haptic
  });

  it('generates gaze transient pointer Swift code (visionOS model)', () => {
    const code = gazeTransientPointerToARKit(defaultGaze);
    expect(code).toContain('visionOS privacy-first');
    expect(code).toContain('NEVER exposed');
    expect(code).toContain('SpatialTapGesture');
    expect(code).toContain('InputTargetComponent');
    expect(code).toContain('HoverEffectComponent');
    expect(code).toContain('CHHapticEngine'); // haptic
    expect(code).toContain('accessibilityAction'); // dwell fallback
  });

  it('generates shared anchor Swift code', () => {
    const code = sharedAnchorToARKit(defaultAnchor);
    expect(code).toContain('WorldTrackingProvider');
    expect(code).toContain('WorldAnchor');
    expect(code).toContain('shareAnchorData');
    expect(code).toContain('"room-1"');
    expect(code).toContain('GroupSessionManager'); // sync
    expect(code).toContain('persistAnchor'); // persistent
    expect(code).toContain('resolveSharedAnchor');
  });

  it('generates controller input Swift code', () => {
    const code = controllerInputToARKit(defaultCtrl);
    expect(code).toContain('GameController');
    expect(code).toContain('GCController');
    expect(code).toContain('extendedGamepad');
    expect(code).toContain('applyDeadzone');
    expect(code).toContain('playTransient'); // haptic
  });
});

// =============================================================================
// OPENXR (C++) CODE GENERATION
// =============================================================================

describe('OpenXR (C++) code generation', () => {
  const defaultHT: CompiledHandTracking = {
    name: 'hands',
    updateRateHz: 90,
    smoothing: 0.3,
    pinchThreshold: 0.8,
    gripThreshold: 0.7,
    confidenceThreshold: 0.5,
    prediction: true,
    hapticOnGesture: true,
    gestureSet: ['pinch', 'grab'],
    traits: [],
  };

  const defaultGaze: CompiledGazeTransientPointer = {
    name: 'gaze',
    dwellEnabled: true,
    dwellTimeMs: 800,
    dwellFeedback: true,
    hapticOnCommit: true,
    hapticIntensity: 0.4,
    maxDistance: 10,
    pinchToCommit: true,
    traits: [],
  };

  const defaultAnchor: CompiledSharedSpatialAnchor = {
    name: 'anchor',
    autoShare: true,
    ttlSeconds: 0,
    maxRetries: 5,
    retryDelayMs: 2000,
    qualityThreshold: 0.6,
    persistent: false,
    roomId: 'room-1',
    syncTransforms: true,
    traits: [],
  };

  const defaultCtrl: CompiledControllerInput = {
    name: 'ctrl',
    deadzone: 0.15,
    triggerThreshold: 0.5,
    gripThreshold: 0.5,
    hapticOnPress: true,
    hapticIntensity: 0.3,
    trackedButtons: [],
    thumbstickAsDpad: true,
    dpadThreshold: 0.7,
    traits: [],
  };

  it('generates hand tracking C++ code', () => {
    const code = handTrackingToOpenXR(defaultHT);
    expect(code).toContain('XR_EXT_hand_tracking');
    expect(code).toContain('XrHandTrackerEXT');
    expect(code).toContain('xrCreateHandTrackerEXT');
    expect(code).toContain('xrLocateHandJointsEXT');
    expect(code).toContain('XR_HAND_JOINT_COUNT_EXT');
    expect(code).toContain('XR_HAND_LEFT_EXT');
    expect(code).toContain('XR_HAND_RIGHT_EXT');
    expect(code).toContain('detectGestures');
    expect(code).toContain('0.5f'); // confidence threshold
  });

  it('generates gaze transient pointer C++ code', () => {
    const code = gazeTransientPointerToOpenXR(defaultGaze);
    expect(code).toContain('XR_EXT_eye_gaze_interaction');
    expect(code).toContain('privacy-first');
    expect(code).toContain('NEVER stored');
    expect(code).toContain('/user/eyes_ext/input/gaze_ext/pose');
    expect(code).toContain('processGazeCommit');
    expect(code).toContain('castRay');
    expect(code).toContain('XrHapticVibration'); // haptic
    expect(code).toContain('gaze pose is NOT stored'); // privacy invariant
  });

  it('generates shared anchor C++ code', () => {
    const code = sharedAnchorToOpenXR(defaultAnchor);
    expect(code).toContain('XR_MSFT_spatial_anchor');
    expect(code).toContain('xrCreateSpatialAnchorMSFT');
    expect(code).toContain('xrCreateSpatialAnchorSpaceMSFT');
    expect(code).toContain('exportAndShareAnchor');
    expect(code).toContain('"room-1"');
    expect(code).toContain('enableTransformSync'); // sync
  });

  it('generates controller input C++ code', () => {
    const code = controllerInputToOpenXR(defaultCtrl);
    expect(code).toContain('XrAction');
    expect(code).toContain('xrCreateAction');
    expect(code).toContain('XR_ACTION_TYPE_FLOAT_INPUT');
    expect(code).toContain('XR_ACTION_TYPE_VECTOR2F_INPUT');
    expect(code).toContain('xrGetActionStateFloat');
    expect(code).toContain('xrGetActionStateVector2f');
    expect(code).toContain('applyDeadzone');
    expect(code).toContain('XrHapticVibration'); // haptic
    expect(code).toContain('DPAD_RIGHT'); // dpad
    expect(code).toContain('DPAD_UP');
  });
});

// =============================================================================
// WEBXR (TypeScript) CODE GENERATION
// =============================================================================

describe('WebXR (TypeScript) code generation', () => {
  const defaultHT: CompiledHandTracking = {
    name: 'hands',
    updateRateHz: 90,
    smoothing: 0.3,
    pinchThreshold: 0.8,
    gripThreshold: 0.7,
    confidenceThreshold: 0.5,
    prediction: true,
    hapticOnGesture: true,
    gestureSet: ['pinch', 'grab'],
    traits: [],
  };

  const defaultGaze: CompiledGazeTransientPointer = {
    name: 'gaze',
    dwellEnabled: true,
    dwellTimeMs: 800,
    dwellFeedback: true,
    hapticOnCommit: true,
    hapticIntensity: 0.4,
    maxDistance: 10,
    pinchToCommit: true,
    traits: [],
  };

  const defaultAnchor: CompiledSharedSpatialAnchor = {
    name: 'anchor',
    autoShare: true,
    ttlSeconds: 0,
    maxRetries: 5,
    retryDelayMs: 2000,
    qualityThreshold: 0.6,
    persistent: false,
    roomId: 'room-1',
    syncTransforms: true,
    traits: [],
  };

  const defaultCtrl: CompiledControllerInput = {
    name: 'ctrl',
    deadzone: 0.15,
    triggerThreshold: 0.5,
    gripThreshold: 0.5,
    hapticOnPress: true,
    hapticIntensity: 0.3,
    trackedButtons: [],
    thumbstickAsDpad: true,
    dpadThreshold: 0.7,
    traits: [],
  };

  it('generates hand tracking TypeScript code', () => {
    const code = handTrackingToWebXR(defaultHT);
    expect(code).toContain('hand-tracking');
    expect(code).toContain('XRFrame');
    expect(code).toContain('getJointPose');
    expect(code).toContain('inputSource.hand');
    expect(code).toContain('Float32Array');
    expect(code).toContain('thumb-tip');
    expect(code).toContain('index-finger-tip');
    expect(code).toContain('pinchStrength');
    expect(code).toContain('hapticActuators'); // haptic
  });

  it('generates gaze transient pointer TypeScript code', () => {
    const code = gazeTransientPointerToWebXR(defaultGaze);
    expect(code).toContain('transient-pointer');
    expect(code).toContain('privacy-first');
    expect(code).toContain('NEVER exposed');
    expect(code).toContain("addEventListener('select'");
    expect(code).toContain("addEventListener('selectend'");
    expect(code).toContain('targetRaySpace');
    expect(code).toContain('hapticActuators'); // haptic
  });

  it('generates shared anchor TypeScript code', () => {
    const code = sharedAnchorToWebXR(defaultAnchor);
    expect(code).toContain('WebXR Anchors');
    expect(code).toContain('createAnchor');
    expect(code).toContain('XRRigidTransform');
    expect(code).toContain('crypto.randomUUID');
    expect(code).toContain("'room-1'");
    expect(code).toContain('shareAnchorToRoom'); // auto-share
    expect(code).toContain('enableTransformSync'); // sync
    expect(code).toContain('MAX_RETRIES');
    expect(code).toContain('RETRY_DELAY_MS');
  });

  it('generates controller input TypeScript code', () => {
    const code = controllerInputToWebXR(defaultCtrl);
    expect(code).toContain('tracked-pointer');
    expect(code).toContain('gamepad');
    expect(code).toContain('BUTTON_MAP');
    expect(code).toContain('applyDeadzone');
    expect(code).toContain('hapticActuators'); // haptic
    expect(code).toContain('onSpatialDpad'); // dpad
  });
});

// =============================================================================
// CONVENIENCE: spatialInputToTarget
// =============================================================================

describe('spatialInputToTarget', () => {
  it('routes hand tracking to all targets', () => {
    const ht: CompiledHandTracking = {
      name: 'ht',
      updateRateHz: 90,
      smoothing: 0.3,
      pinchThreshold: 0.8,
      gripThreshold: 0.7,
      confidenceThreshold: 0.5,
      prediction: true,
      hapticOnGesture: true,
      gestureSet: ['pinch'],
      traits: [],
    };
    const input = { kind: 'hand_tracking' as const, data: ht };

    expect(spatialInputToTarget(input, 'arcore')).toContain('HandTrackingConfig');
    expect(spatialInputToTarget(input, 'arkit')).toContain('HandTrackingProvider');
    expect(spatialInputToTarget(input, 'openxr')).toContain('XrHandTrackerEXT');
    expect(spatialInputToTarget(input, 'webxr')).toContain('getJointPose');
  });

  it('routes gaze to all targets', () => {
    const gaze: CompiledGazeTransientPointer = {
      name: 'g',
      dwellEnabled: true,
      dwellTimeMs: 800,
      dwellFeedback: true,
      hapticOnCommit: true,
      hapticIntensity: 0.4,
      maxDistance: 10,
      pinchToCommit: true,
      traits: [],
    };
    const input = { kind: 'gaze_transient_pointer' as const, data: gaze };

    for (const target of ['arcore', 'arkit', 'openxr', 'webxr'] as const) {
      const code = spatialInputToTarget(input, target);
      expect(code.length).toBeGreaterThan(50);
      expect(code).toContain('privacy');
    }
  });

  it('handles variable prefix', () => {
    const ht: CompiledHandTracking = {
      name: 'ht',
      updateRateHz: 90,
      smoothing: 0.3,
      pinchThreshold: 0.8,
      gripThreshold: 0.7,
      confidenceThreshold: 0.5,
      prediction: true,
      hapticOnGesture: true,
      gestureSet: ['pinch'],
      traits: [],
    };
    const input = { kind: 'hand_tracking' as const, data: ht };

    const code = spatialInputToTarget(input, 'arcore', 'myPrefix');
    expect(code).toContain('myPrefix_');
  });
});

// =============================================================================
// CONVENIENCE: compileSpatialInputBlocks
// =============================================================================

describe('compileSpatialInputBlocks', () => {
  it('compiles multiple spatial input blocks for a target', () => {
    const blocks = [
      mockBlock({ keyword: 'hand_tracking', name: 'Hands' }),
      mockBlock({ keyword: 'controller_input', name: 'Controllers' }),
      mockBlock({ keyword: 'material', name: 'WoodMat' }), // should be skipped
    ];

    const results = compileSpatialInputBlocks(blocks as any, 'webxr');
    expect(results).toHaveLength(2);
    expect(results[0]).toContain('getJointPose'); // hand tracking
    expect(results[1]).toContain('tracked-pointer'); // controller
  });

  it('returns empty array when no spatial input blocks found', () => {
    const blocks = [mockBlock({ keyword: 'material' }), mockBlock({ keyword: 'rigidbody' })];

    const results = compileSpatialInputBlocks(blocks as any, 'openxr');
    expect(results).toHaveLength(0);
  });

  it('works with all four spatial input types', () => {
    const blocks = [
      mockBlock({ keyword: 'hand_tracking' }),
      mockBlock({ keyword: 'gaze_transient_pointer' }),
      mockBlock({ keyword: 'shared_anchor' }),
      mockBlock({ keyword: 'controller_input' }),
    ];

    for (const target of ['arcore', 'arkit', 'openxr', 'webxr'] as const) {
      const results = compileSpatialInputBlocks(blocks as any, target);
      expect(results).toHaveLength(4);
      results.forEach((code) => {
        expect(code.length).toBeGreaterThan(20);
      });
    }
  });
});

// =============================================================================
// PRIVACY INVARIANT VERIFICATION
// =============================================================================

describe('Privacy invariant: gaze direction never exposed', () => {
  const gazeConfig: CompiledGazeTransientPointer = {
    name: 'privacy_gaze',
    dwellEnabled: true,
    dwellTimeMs: 800,
    dwellFeedback: true,
    hapticOnCommit: true,
    hapticIntensity: 0.4,
    maxDistance: 10,
    pinchToCommit: true,
    traits: [],
  };

  const targets: Array<[string, (g: CompiledGazeTransientPointer, p?: string) => string]> = [
    ['ARCore', gazeTransientPointerToARCore],
    ['ARKit', gazeTransientPointerToARKit],
    ['OpenXR', gazeTransientPointerToOpenXR],
    ['WebXR', gazeTransientPointerToWebXR],
  ];

  for (const [name, fn] of targets) {
    it(`${name}: code mentions privacy-first or transient model`, () => {
      const code = fn(gazeConfig);
      const hasPrivacyNote =
        code.includes('NEVER') || code.includes('privacy') || code.includes('transient');
      expect(hasPrivacyNote).toBe(true);
    });

    it(`${name}: code does not contain continuous gaze stream`, () => {
      const code = fn(gazeConfig);
      // Should not contain patterns suggesting continuous gaze data forwarding
      expect(code).not.toContain('setGazeDirectionListener');
      expect(code).not.toContain('onGazeDirection');
      expect(code).not.toContain('gazeRay');
    });
  }
});

// =============================================================================
// HAPTIC FEEDBACK CONDITIONAL GENERATION
// =============================================================================

describe('Haptic feedback conditional generation', () => {
  it('omits haptic code when disabled for hand tracking (ARCore)', () => {
    const ht: CompiledHandTracking = {
      name: 'no_haptic',
      updateRateHz: 90,
      smoothing: 0.3,
      pinchThreshold: 0.8,
      gripThreshold: 0.7,
      confidenceThreshold: 0.5,
      prediction: true,
      hapticOnGesture: false,
      gestureSet: ['pinch'],
      traits: [],
    };
    const code = handTrackingToARCore(ht);
    expect(code).not.toContain('vibrateController');
  });

  it('omits haptic code when disabled for gaze (ARKit)', () => {
    const gaze: CompiledGazeTransientPointer = {
      name: 'no_haptic',
      dwellEnabled: true,
      dwellTimeMs: 800,
      dwellFeedback: true,
      hapticOnCommit: false,
      hapticIntensity: 0,
      maxDistance: 10,
      pinchToCommit: true,
      traits: [],
    };
    const code = gazeTransientPointerToARKit(gaze);
    expect(code).not.toContain('CHHapticEngine');
  });

  it('omits haptic code when disabled for controller (WebXR)', () => {
    const ctrl: CompiledControllerInput = {
      name: 'no_haptic',
      deadzone: 0.15,
      triggerThreshold: 0.5,
      gripThreshold: 0.5,
      hapticOnPress: false,
      hapticIntensity: 0,
      trackedButtons: [],
      thumbstickAsDpad: false,
      dpadThreshold: 0.7,
      traits: [],
    };
    const code = controllerInputToWebXR(ctrl);
    expect(code).not.toContain('hapticActuators');
  });
});
