/**
 * OpenXR HAL (Hardware Abstraction Layer) Trait
 *
 * Critical foundation for ALL haptic traits - abstracts XR hardware capabilities.
 * Provides unified interface across Quest, Vive, Index, Vision Pro, and future devices.
 *
 * Research Reference: uAA2++ Protocol - "OpenXR HAL blocks ALL haptic traits without it"
 *
 * @version 3.1.0
 * @Sprint v3.1 (March 2026)
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// WEBXR MINIMAL INTERFACES (avoids @webxr typings dependency)
// =============================================================================

interface XRSessionLike {
  simulated?: boolean;
  end(): void;
  requestAnimationFrame(callback: (time: number, frame: XRFrameLike) => void): number;
  requestReferenceSpace(type: string): Promise<unknown>;
  inputSources?: XRInputSourceLike[];
  enabledFeatures?: string[];
  updateTargetFrameRate?(rate: number): Promise<void>;
  visibilityState?: string;
  environmentBlendMode?: string;
  renderState?: { layers?: unknown };
  depthUsage?: unknown;
  domOverlayState?: unknown;
  requestHitTestSource?: unknown;
  requestLightProbe?: unknown;
  addEventListener(event: string, handler: (...args: unknown[]) => void): void;
}

interface XRPoseResult {
  transform: {
    position: [number, number, number];
    orientation: { x: number; y: number; z: number; w: number };
  };
  radius?: number;
}

interface XRFrameLike {
  getPose(space: unknown, referenceSpace: unknown): XRPoseResult | null;
  getJointPose(joint: unknown, referenceSpace: unknown): XRPoseResult | null;
}

interface XRInputSourceLike {
  handedness: string;
  targetRayMode: string;
  profiles?: string[];
  gamepad?: {
    hapticActuators?: Array<{ pulse(intensity: number, duration: number): void }>;
    buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
    axes: number[];
  };
  hand?: Map<string, unknown>;
  gripSpace?: unknown;
  targetRaySpace?: unknown;
}

interface XRSystemLike {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, init?: Record<string, string[]>): Promise<XRSessionLike>;
}

interface XRInputSourcesChangeEvent {
  added: XRInputSourceLike[];
  removed: XRInputSourceLike[];
}

// =============================================================================
// TYPES
// =============================================================================

type XRDeviceType =
  | 'quest_3'
  | 'quest_pro'
  | 'vive_xr_elite'
  | 'valve_index'
  | 'vision_pro'
  | 'pico_4'
  | 'generic_openxr'
  | 'unknown';

type HapticCapability = 'rumble' | 'hd_haptics' | 'force_feedback' | 'thermal' | 'none';
type TrackingCapability = 'controller' | 'hand' | 'eye' | 'body' | 'face';
type RenderCapability = 'passthrough' | 'depth_sensing' | 'mesh_detection' | 'plane_detection';

interface XRDeviceProfile {
  type: XRDeviceType;
  name: string;
  manufacturer: string;
  hapticCapabilities: HapticCapability[];
  trackingCapabilities: TrackingCapability[];
  renderCapabilities: RenderCapability[];
  refreshRates: number[];
  resolution: { width: number; height: number };
  fov: number;
  controllers: {
    left: ControllerProfile | null;
    right: ControllerProfile | null;
  };
}

interface ControllerProfile {
  hapticActuators: number;
  hapticFrequencyRange: [number, number]; // Hz
  maxAmplitude: number;
  supportsHDHaptics: boolean;
  buttonCount: number;
  hasThumbstick: boolean;
  hasTouchpad: boolean;
  hasGripButton: boolean;
  hasTrigger: boolean;
}

// Phase 2: Button types and gamepad state
type ControllerButton =
  | 'trigger'
  | 'grip'
  | 'thumbstick'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'menu'
  | 'system'
  | 'touchpad';

interface ButtonState {
  pressed: boolean;
  touched: boolean;
  value: number; // 0.0 to 1.0
}

interface GamepadState {
  buttons: Map<ControllerButton, ButtonState>;
  thumbstick: { x: number; y: number }; // -1.0 to 1.0
  touchpad?: { x: number; y: number }; // -1.0 to 1.0
  triggerValue: number; // 0.0 to 1.0
  gripValue: number; // 0.0 to 1.0
}

interface ControllerProfileDatabase {
  buttonMapping: (ControllerButton | null)[]; // Maps button index to semantic name
  thumbstickXAxis: number; // Axes index for thumbstick X
  thumbstickYAxis: number; // Axes index for thumbstick Y
  touchpadXAxis?: number; // Axes index for touchpad X (if present)
  touchpadYAxis?: number; // Axes index for touchpad Y (if present)
  hapticActuators: number; // Number of haptic actuators
}

// Phase 3: Hand tracking types
type HandJoint =
  | 'wrist'
  | 'thumb-metacarpal'
  | 'thumb-phalanx-proximal'
  | 'thumb-phalanx-distal'
  | 'thumb-tip'
  | 'index-finger-metacarpal'
  | 'index-finger-phalanx-proximal'
  | 'index-finger-phalanx-intermediate'
  | 'index-finger-phalanx-distal'
  | 'index-finger-tip'
  | 'middle-finger-metacarpal'
  | 'middle-finger-phalanx-proximal'
  | 'middle-finger-phalanx-intermediate'
  | 'middle-finger-phalanx-distal'
  | 'middle-finger-tip'
  | 'ring-finger-metacarpal'
  | 'ring-finger-phalanx-proximal'
  | 'ring-finger-phalanx-intermediate'
  | 'ring-finger-phalanx-distal'
  | 'ring-finger-tip'
  | 'pinky-finger-metacarpal'
  | 'pinky-finger-phalanx-proximal'
  | 'pinky-finger-phalanx-intermediate'
  | 'pinky-finger-phalanx-distal'
  | 'pinky-finger-tip';

interface JointPose {
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion (x, y, z, w) — founder ruling 2026-04-28: 4-tuple form, canonical at types/HoloScriptPlus.ts:26
  radius: number; // Joint radius in meters
}

interface HandTrackingState {
  joints: Map<HandJoint, JointPose>;
  pinchStrength: number; // 0.0 (open) to 1.0 (pinched)
  gripStrength: number; // 0.0 (open) to 1.0 (gripped)
}

// Phase 3: Eye tracking types
interface GazeRay {
  origin: [number, number, number];
  direction: [number, number, number];
}

interface OpenXRHALState {
  isInitialized: boolean;
  session: XRSessionLike | null;
  deviceProfile: XRDeviceProfile | null;
  frameRate: number;
  isPassthroughActive: boolean;
  handTrackingActive: boolean;
  eyeTrackingActive: boolean;
  lastFrameTime: number;
  performanceLevel: 'low' | 'medium' | 'high' | 'max';
  inputSourcesCache: XRInputSourceLike[];
  referenceSpace: unknown | null; // XRReferenceSpace for pose calculations
  currentFrame: XRFrameLike | null;
  // Phase 4: Session lifecycle tracking
  sessionVisible: boolean; // Track visibility state
  sessionInterrupted: boolean; // Track interruption state
  reconnectAttempts: number; // Count reconnection attempts
  featuresAvailable: Set<string>; // Track available WebXR features
  lastError: string | null; // Last error message
  errorCount: number; // Total error count this session
}

interface OpenXRHALConfig {
  /** Preferred refresh rate (0 = auto) */
  preferred_refresh_rate: number;
  /** Enable passthrough if available */
  enable_passthrough: boolean;
  /** Enable hand tracking if available */
  enable_hand_tracking: boolean;
  /** Enable eye tracking if available (requires permission) */
  enable_eye_tracking: boolean;
  /** Performance mode */
  performance_mode: 'battery_saver' | 'balanced' | 'performance';
  /** Fallback behavior when OpenXR unavailable */
  fallback_mode: 'simulate' | 'disable' | 'error';
  /** Enable haptic simulation in non-VR mode */
  simulate_haptics: boolean;
  /** Custom device overrides */
  device_overrides: Partial<XRDeviceProfile> | null;
}

// =============================================================================
// DEVICE PROFILES DATABASE
// =============================================================================

const deviceProfiles: Record<string, Partial<XRDeviceProfile>> = {
  'meta quest 3': {
    type: 'quest_3',
    name: 'Meta Quest 3',
    manufacturer: 'Meta',
    hapticCapabilities: ['rumble', 'hd_haptics'],
    trackingCapabilities: ['controller', 'hand', 'eye'],
    renderCapabilities: ['passthrough', 'depth_sensing', 'mesh_detection', 'plane_detection'],
    refreshRates: [72, 90, 120],
    resolution: { width: 2064, height: 2208 },
    fov: 110,
  },
  'meta quest pro': {
    type: 'quest_pro',
    name: 'Meta Quest Pro',
    manufacturer: 'Meta',
    hapticCapabilities: ['rumble', 'hd_haptics', 'force_feedback'],
    trackingCapabilities: ['controller', 'hand', 'eye', 'face'],
    renderCapabilities: ['passthrough', 'depth_sensing', 'mesh_detection', 'plane_detection'],
    refreshRates: [72, 90],
    resolution: { width: 1800, height: 1920 },
    fov: 106,
  },
  'apple vision pro': {
    type: 'vision_pro',
    name: 'Apple Vision Pro',
    manufacturer: 'Apple',
    hapticCapabilities: ['none'], // No controllers, uses hand tracking
    trackingCapabilities: ['hand', 'eye'],
    renderCapabilities: ['passthrough', 'depth_sensing', 'mesh_detection', 'plane_detection'],
    refreshRates: [90, 96, 100],
    resolution: { width: 3660, height: 3200 },
    fov: 120,
  },
  'valve index': {
    type: 'valve_index',
    name: 'Valve Index',
    manufacturer: 'Valve',
    hapticCapabilities: ['rumble', 'hd_haptics', 'force_feedback'],
    trackingCapabilities: ['controller', 'hand'],
    renderCapabilities: [],
    refreshRates: [80, 90, 120, 144],
    resolution: { width: 1440, height: 1600 },
    fov: 130,
  },
  'htc vive xr elite': {
    type: 'vive_xr_elite',
    name: 'HTC Vive XR Elite',
    manufacturer: 'HTC',
    hapticCapabilities: ['rumble'],
    trackingCapabilities: ['controller', 'hand'],
    renderCapabilities: ['passthrough', 'depth_sensing'],
    refreshRates: [90],
    resolution: { width: 1920, height: 1920 },
    fov: 110,
  },
};

// =============================================================================
// CONTROLLER PROFILE DATABASE (Phase 2)
// =============================================================================

/**
 * Device-specific button mappings for gamepad state extraction
 * Maps XRInputSource.profiles to button/axis indices
 */
const CONTROLLER_PROFILES: Record<string, ControllerProfileDatabase> = {
  // Meta Quest 3 - Touch Plus controllers
  'oculus-touch-v3': {
    buttonMapping: [
      'trigger', // 0
      'grip', // 1
      'thumbstick', // 2
      'x', // 3 (left) / a (right)
      'y', // 4 (left) / b (right)
      'menu', // 5 (left only)
    ],
    thumbstickXAxis: 2,
    thumbstickYAxis: 3,
    hapticActuators: 1,
  },

  // Meta Quest Pro - TruTouch controllers (dual actuators)
  'oculus-touch-v2': {
    buttonMapping: [
      'trigger', // 0
      'grip', // 1
      'thumbstick', // 2
      'x', // 3 (left) / a (right)
      'y', // 4 (left) / b (right)
      'menu', // 5 (left only)
    ],
    thumbstickXAxis: 2,
    thumbstickYAxis: 3,
    hapticActuators: 2, // TruTouch dual actuators
  },

  // Valve Index - Knuckles controllers
  'valve-index': {
    buttonMapping: [
      'trigger', // 0
      'grip', // 1
      'thumbstick', // 2
      'a', // 3
      'b', // 4
      'system', // 5
    ],
    thumbstickXAxis: 2,
    thumbstickYAxis: 3,
    touchpadXAxis: 0,
    touchpadYAxis: 1,
    hapticActuators: 1,
  },

  // HTC Vive XR Elite
  'htc-vive-focus': {
    buttonMapping: [
      'trigger', // 0
      'grip', // 1
      'touchpad', // 2
      'menu', // 3
      'system', // 4
    ],
    thumbstickXAxis: 2,
    thumbstickYAxis: 3,
    touchpadXAxis: 0,
    touchpadYAxis: 1,
    hapticActuators: 1,
  },

  // Generic fallback
  generic: {
    buttonMapping: ['trigger', 'grip', 'thumbstick', 'a', 'b', 'menu'],
    thumbstickXAxis: 2,
    thumbstickYAxis: 3,
    hapticActuators: 1,
  },
};

// =============================================================================
// HANDLER
// =============================================================================

export const openXRHALHandler: TraitHandler<OpenXRHALConfig> = {
  name: 'openxr_hal',

  defaultConfig: {
    preferred_refresh_rate: 0,
    enable_passthrough: false,
    enable_hand_tracking: true,
    enable_eye_tracking: false,
    performance_mode: 'balanced',
    fallback_mode: 'simulate',
    simulate_haptics: true,
    device_overrides: null,
  },

  onAttach(node, config, context) {
    const state: OpenXRHALState = {
      isInitialized: false,
      session: null,
      deviceProfile: null,
      frameRate: 90,
      isPassthroughActive: false,
      handTrackingActive: false,
      eyeTrackingActive: false,
      lastFrameTime: 0,
      performanceLevel: 'medium',
      inputSourcesCache: [],
      referenceSpace: null,
      currentFrame: null,
      // Phase 4: Session lifecycle initialization
      sessionVisible: true,
      sessionInterrupted: false,
      reconnectAttempts: 0,
      featuresAvailable: new Set<string>(),
      lastError: null,
      errorCount: 0,
    };
    node.__openxrHALState = state;

    initializeOpenXR(node, state, config, context);
  },

  onDetach(node, _config, context) {
    const state = node.__openxrHALState as OpenXRHALState;
    if (state?.session) {
      context.emit?.('openxr_session_end', { node });
    }
    delete node.__openxrHALState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__openxrHALState as OpenXRHALState;
    if (!state || !state.isInitialized) return;

    // Phase 4: Skip updates if session is interrupted
    if (state.sessionInterrupted) {
      return;
    }

    state.lastFrameTime = delta;

    // Update performance level based on frame timing
    if (delta > 16.67) {
      state.performanceLevel = 'low';
    } else if (delta > 11.11) {
      state.performanceLevel = 'medium';
    } else if (delta > 8.33) {
      state.performanceLevel = 'high';
    } else {
      state.performanceLevel = 'max';
    }

    // Phase 4: Poll input sources with error handling
    if (state.session && !state.session!.simulated) {
      try {
        pollInputSources(state, context, node);
      } catch (error) {
        handleFrameError(state, config, context, node, error);
      }
    }

    // Emit frame data for dependent traits
    context.emit?.('openxr_frame', {
      node,
      delta,
      deviceProfile: state.deviceProfile,
      performanceLevel: state.performanceLevel,
      sessionVisible: state.sessionVisible,
      errorCount: state.errorCount,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__openxrHALState as OpenXRHALState;
    if (!state) return;

    if (event.type === 'xr_session_start') {
      detectDevice(state, config);
      state.isInitialized = true;
      context.emit?.('openxr_ready', {
        node,
        deviceProfile: state.deviceProfile,
        capabilities: getCapabilities(state),
      });
    }

    // Request to start XR session
    if (event.type === 'request_xr_session') {
      const p = event.payload as Record<string, unknown> | undefined;
      const mode = (p?.mode as 'immersive-vr' | 'immersive-ar' | 'inline') || 'immersive-vr';
      requestXRSession(state, config, context, node, mode);
    }

    // End XR session
    if (event.type === 'end_xr_session') {
      if (state.session) {
        state.session.end();
      }
    }

    // Trigger haptic feedback
    if (event.type === 'trigger_haptic') {
      const p = event.payload as Record<string, unknown> | undefined;
      const hand = (p?.hand as 'left' | 'right') || 'right';
      const intensity = (p?.intensity as number) ?? 1.0;
      const duration = (p?.duration as number) ?? 100;
      const actuatorIndex = (p?.actuator_index as number) ?? 0; // Phase 2
      const success = triggerHaptic(state, hand, intensity, duration, actuatorIndex);
      context.emit?.('haptic_triggered', {
        node,
        hand,
        intensity,
        duration,
        actuatorIndex, // Phase 2
        success,
        simulated: state.session?.simulated === true,
      });
    }

    if (event.type === 'request_haptic_capability') {
      const p = event.payload as Record<string, unknown> | undefined;
      const capability = p?.capability as HapticCapability;
      const supported = state.deviceProfile?.hapticCapabilities.includes(capability) ?? false;
      context.emit?.('haptic_capability_response', {
        node,
        capability,
        supported,
        fallback: config.simulate_haptics && config.fallback_mode === 'simulate',
      });
    }

    // Query device profile
    if (event.type === 'get_device_profile') {
      context.emit?.('device_profile_response', {
        node,
        deviceProfile: state.deviceProfile,
        isSimulated: state.session?.simulated === true,
      });
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Request and start an XR session
 */
async function requestXRSession(
  state: OpenXRHALState,
  config: OpenXRHALConfig,
  context: TraitContext,
  node: HSPlusNode,
  mode: 'immersive-vr' | 'immersive-ar' | 'inline' = 'immersive-vr'
): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('xr' in navigator)) {
    if (config.fallback_mode === 'simulate') {
      createSimulatedSession(state, config);
      return true;
    }
    return false;
  }

  try {
    const xr = (navigator as unknown as { xr?: XRSystemLike }).xr!;
    const sessionInit: { optionalFeatures: string[] } = {
      optionalFeatures: [],
    };

    // Request optional features based on config
    if (config.enable_hand_tracking) {
      sessionInit.optionalFeatures.push('hand-tracking');
    }
    if (config.enable_passthrough && mode === 'immersive-ar') {
      sessionInit.optionalFeatures.push('dom-overlay');
    }

    const session = await xr.requestSession(mode, sessionInit);

    state.session = session;
    state.isInitialized = true;

    // Set frame rate if supported
    if (config.preferred_refresh_rate > 0 && session.updateTargetFrameRate) {
      try {
        await session.updateTargetFrameRate(config.preferred_refresh_rate);
        state.frameRate = config.preferred_refresh_rate;
      } catch {
        // Frame rate not supported at requested value
      }
    }

    // Phase 4: Setup comprehensive session event handlers
    setupSessionEventHandlers(session, state, config, context, node);

    // Detect device from session
    detectDeviceFromSession(state, session, config);

    // Phase 4: Detect available features
    detectAvailableFeatures(session, state, config, context, node);

    // Phase 4: Start frame loop to capture XRFrame for pose queries
    if (typeof session.requestAnimationFrame === 'function') {
      const frameLoop = (_time: number, frame: XRFrameLike) => {
        if (!state.session) return; // Session ended
        state.currentFrame = frame;
        state.session.requestAnimationFrame(frameLoop);
      };
      session.requestAnimationFrame(frameLoop);
    }

    context.emit?.('openxr_session_start', {
      node,
      mode,
      deviceProfile: state.deviceProfile,
      featuresAvailable: Array.from(state.featuresAvailable),
    });

    return true;
  } catch (error) {
    if (config.fallback_mode === 'simulate') {
      createSimulatedSession(state, config);
      context.emit?.('openxr_simulated', { node, reason: String(error) });
      return true;
    } else if (config.fallback_mode === 'error') {
      context.emit?.('openxr_error', { node, error: String(error) });
    }
    return false;
  }
}

/**
 * Phase 4: Setup comprehensive session event handlers
 * Handles session lifecycle events, visibility changes, and input source changes
 */
function setupSessionEventHandlers(
  session: XRSessionLike,
  state: OpenXRHALState,
  config: OpenXRHALConfig,
  context: TraitContext,
  node: HSPlusNode
): void {
  // Session end event
  session.addEventListener('end', () => {
    state.session = null;
    state.isInitialized = false;
    state.sessionVisible = false;
    context.emit?.('openxr_session_end', {
      node,
      reason: 'ended',
      errorCount: state.errorCount,
    });
  });

  // Visibility change event (session hidden/visible)
  session.addEventListener('visibilitychange', () => {
    const wasVisible = state.sessionVisible;
    state.sessionVisible = session.visibilityState === 'visible';

    if (!wasVisible && state.sessionVisible) {
      // Session became visible again
      context.emit?.('openxr_session_resumed', { node });
      state.sessionInterrupted = false;
    } else if (wasVisible && !state.sessionVisible) {
      // Session became hidden/interrupted
      context.emit?.('openxr_session_interrupted', {
        node,
        visibilityState: session.visibilityState,
      });
      state.sessionInterrupted = true;
    }
  });

  // Input sources change event (controllers connected/disconnected)
  session.addEventListener('inputsourceschange', (...args: unknown[]) => {
    const event = args[0] as XRInputSourcesChangeEvent;
    // Update input sources cache
    state.inputSourcesCache = Array.from(session.inputSources || []) as XRInputSourceLike[];

    const added = event.added || [];
    const removed = event.removed || [];

    context.emit?.('openxr_input_sources_changed', {
      node,
      added: added.length,
      removed: removed.length,
      totalSources: state.inputSourcesCache.length,
      sources: state.inputSourcesCache.map((source: XRInputSourceLike) => ({
        handedness: source.handedness,
        targetRayMode: source.targetRayMode,
        profiles: source.profiles,
      })),
    });

    // Re-detect device profile if controllers changed
    if (added.length > 0 || removed.length > 0) {
      detectDeviceFromSession(state, session, config);
    }
  });

  // Session focus blur event (if available)
  if ('onfocusblur' in session || session.addEventListener) {
    try {
      session.addEventListener('blur', () => {
        context.emit?.('openxr_session_blur', { node });
      });
      session.addEventListener('focus', () => {
        context.emit?.('openxr_session_focus', { node });
      });
    } catch {
      // Not all browsers support focus/blur events
    }
  }
}

/**
 * Phase 4: Detect available WebXR features and capabilities
 * Provides feature detection for graceful degradation
 */
function detectAvailableFeatures(
  session: XRSessionLike,
  state: OpenXRHALState,
  config: OpenXRHALConfig,
  context: TraitContext,
  node: HSPlusNode
): void {
  const features = new Set<string>();

  // Check for hand tracking support
  if (session.enabledFeatures?.includes('hand-tracking')) {
    features.add('hand-tracking');
    state.handTrackingActive = true;
  } else if (config.enable_hand_tracking) {
    // Requested but not available
    context.emit?.('openxr_feature_unavailable', {
      node,
      feature: 'hand-tracking',
      fallback: config.fallback_mode,
    });
  }

  // Check for eye tracking support (gaze input)
  const hasGazeInput = session.inputSources?.some(
    (source: XRInputSourceLike) => source.targetRayMode === 'gaze'
  );
  if (hasGazeInput || session.enabledFeatures?.includes('gaze')) {
    features.add('eye-tracking');
    state.eyeTrackingActive = true;
  } else if (config.enable_eye_tracking) {
    context.emit?.('openxr_feature_unavailable', {
      node,
      feature: 'eye-tracking',
      fallback: 'controllers',
    });
  }

  // Establish reference space with fallback chain
  requestReferenceSpaceWithFallback(session, state, context, node);

  // Check for layers API (composition layers)
  if (session.renderState?.layers !== undefined) {
    features.add('layers');
  }

  // Check for depth sensing
  if (session.depthUsage || session.enabledFeatures?.includes('depth-sensing')) {
    features.add('depth-sensing');
  }

  // Check for hit testing (AR)
  if (session.requestHitTestSource) {
    features.add('hit-test');
  }

  // Check for anchors
  if (session.environmentBlendMode) {
    features.add('anchors');
  }

  // Check for DOM overlay (AR)
  if (session.domOverlayState) {
    features.add('dom-overlay');
  }

  // Check for passthrough (if AR session)
  if (
    session.environmentBlendMode === 'alpha-blend' ||
    session.environmentBlendMode === 'additive'
  ) {
    features.add('passthrough');
    state.isPassthroughActive = true;
  }

  // Check for plane detection
  if (session.enabledFeatures?.includes('plane-detection')) {
    features.add('plane-detection');
  }

  // Check for mesh detection
  if (session.enabledFeatures?.includes('mesh-detection')) {
    features.add('mesh-detection');
  }

  // Check for light estimation
  if (session.requestLightProbe) {
    features.add('light-estimation');
  }

  // Check for camera access
  if (session.enabledFeatures?.includes('camera-access')) {
    features.add('camera-access');
  }

  // Store detected features
  state.featuresAvailable = features;

  // Emit feature detection results
  context.emit?.('openxr_features_detected', {
    node,
    features: Array.from(features),
    handTracking: state.handTrackingActive,
    eyeTracking: state.eyeTrackingActive,
    passthrough: state.isPassthroughActive,
  });
}

/**
 * Phase 4: Handle frame loop errors with graceful recovery
 */
function handleFrameError(
  state: OpenXRHALState,
  config: OpenXRHALConfig,
  context: TraitContext,
  node: HSPlusNode,
  error: unknown
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  state.lastError = errorMessage;
  state.errorCount++;

  // Emit error event
  context.emit?.('openxr_frame_error', {
    node,
    error: errorMessage,
    errorCount: state.errorCount,
    recoveryAttempt: state.reconnectAttempts,
  });

  // Recovery strategy based on error count
  if (state.errorCount < 3) {
    // Minor error - log and continue
    console.warn(`[OpenXRHAL] Frame error (${state.errorCount}/3):`, errorMessage);
  } else if (state.errorCount < 10) {
    // Moderate errors - attempt session recovery
    attemptSessionRecovery(state, config, context, node);
  } else {
    // Too many errors - end session gracefully
    context.emit?.('openxr_session_failed', {
      node,
      reason: 'too_many_errors',
      errorCount: state.errorCount,
      lastError: errorMessage,
    });

    // End the session
    if (state.session && typeof state.session!.end === 'function') {
      try {
        state.session!.end();
      } catch {
        // Session already ended
      }
    }
    state.session = null;
    state.isInitialized = false;

    // Attempt fallback if configured
    if (config.fallback_mode === 'simulate') {
      createSimulatedSession(state, config);
      context.emit?.('openxr_fallback_activated', {
        node,
        reason: 'error_threshold_exceeded',
      });
    }
  }
}

/**
 * Phase 4: Attempt to recover from session errors
 */
function attemptSessionRecovery(
  state: OpenXRHALState,
  config: OpenXRHALConfig,
  context: TraitContext,
  node: HSPlusNode
): void {
  state.reconnectAttempts++;

  // Reset error count to give recovery a chance
  state.errorCount = 0;

  context.emit?.('openxr_recovery_attempt', {
    node,
    attempt: state.reconnectAttempts,
  });

  // Clear reference space to force re-initialization
  state.referenceSpace = null;

  // Request a new reference space
  if (state.session && typeof state.session.requestReferenceSpace === 'function') {
    state.session
      .requestReferenceSpace('local-floor')
      .then((refSpace: unknown) => {
        state.referenceSpace = refSpace;
        context.emit?.('openxr_recovery_success', {
          node,
          attempt: state.reconnectAttempts,
        });
      })
      .catch((error: Error) => {
        context.emit?.('openxr_recovery_failed', {
          node,
          attempt: state.reconnectAttempts,
          error: error.message,
        });
      });
  }
}

/**
 * Detect device profile from active XR session
 */
function detectDeviceFromSession(
  state: OpenXRHALState,
  session: XRSessionLike,
  config: OpenXRHALConfig
): void {
  const inputSources = session.inputSources || [];
  let detectedProfile: Partial<XRDeviceProfile> | null = null;

  // Try to determine device by examining input source profiles
  for (const source of inputSources) {
    if (source.profiles) {
      for (const profileName of source.profiles) {
        const lowerName = profileName.toLowerCase();
        for (const [key, profile] of Object.entries(deviceProfiles)) {
          if (lowerName.includes(key.toLowerCase()) || lowerName.includes(profile.type!)) {
            detectedProfile = profile;
            break;
          }
        }
        if (detectedProfile) break;
      }
    }
    if (detectedProfile) break;
  }

  // Fallback check for Vision Pro (hand tracking only, no controller profiles)
  if (
    !detectedProfile &&
    session.environmentBlendMode === 'alpha-blend' &&
    inputSources.length === 0
  ) {
    detectedProfile = deviceProfiles['apple vision pro'];
  }

  // Build final profile
  state.deviceProfile = {
    type: detectedProfile?.type || 'generic_openxr',
    name: detectedProfile?.name || 'Generic OpenXR Device',
    manufacturer: detectedProfile?.manufacturer || 'Unknown',
    hapticCapabilities: detectedProfile?.hapticCapabilities || ['rumble'],
    trackingCapabilities: detectedProfile?.trackingCapabilities || ['controller'],
    renderCapabilities: detectedProfile?.renderCapabilities || [],
    refreshRates: detectedProfile?.refreshRates || [90],
    resolution: detectedProfile?.resolution || { width: 1920, height: 1080 },
    fov: detectedProfile?.fov || 90,
    controllers: {
      left: detectedProfile?.controllers?.left || createSimulatedController(),
      right: detectedProfile?.controllers?.right || createSimulatedController(),
    },
    ...config.device_overrides,
  };
}

/**
 * Trigger haptic feedback on controller
 * Phase 2: Added multi-actuator support (Quest Pro TruTouch)
 */
function triggerHaptic(
  state: OpenXRHALState,
  hand: 'left' | 'right',
  intensity: number = 1.0,
  durationMs: number = 100,
  actuatorIndex: number = 0 // Phase 2: Support multiple actuators
): boolean {
  if (!state.session || !state.isInitialized) return false;

  if (state.session.simulated) return true; // Pretend it worked if simulated

  const inputSources = state.session.inputSources || [];

  for (const source of inputSources) {
    if (source.handedness === hand && source.gamepad?.hapticActuators) {
      const actuators = source.gamepad.hapticActuators;

      // Phase 2: Validate actuator index
      if (actuators && actuators.length > 0) {
        const targetIndex = Math.min(actuatorIndex, actuators.length - 1);

        // Use WebXR Gamepad Haptics API
        try {
          actuators[targetIndex].pulse(intensity, durationMs);
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  return false;
}

/**
 * Extract gamepad button and axis state (Phase 2)
 */
function pollGamepadState(
  source: XRInputSourceLike, // XRInputSource
  _hand: string
): GamepadState | null {
  if (!source.gamepad) return null;

  // Determine controller profile from source.profiles
  let profile: ControllerProfileDatabase = CONTROLLER_PROFILES['generic'];
  if (source.profiles && source.profiles.length > 0) {
    for (const profileId of source.profiles) {
      if (CONTROLLER_PROFILES[profileId]) {
        profile = CONTROLLER_PROFILES[profileId];
        break;
      }
    }
  }

  // Extract button states
  const buttons = new Map<ControllerButton, ButtonState>();
  const gamepad = source.gamepad;

  for (let i = 0; i < gamepad.buttons.length && i < profile.buttonMapping.length; i++) {
    const button = gamepad.buttons[i];
    const semanticName = profile.buttonMapping[i];

    if (semanticName) {
      buttons.set(semanticName, {
        pressed: button.pressed || false,
        touched: button.touched || false,
        value: button.value || 0,
      });
    }
  }

  // Extract thumbstick axes
  const thumbstick = {
    x: gamepad.axes[profile.thumbstickXAxis] || 0,
    y: gamepad.axes[profile.thumbstickYAxis] || 0,
  };

  // Extract touchpad axes (if present)
  const touchpad =
    profile.touchpadXAxis !== undefined && profile.touchpadYAxis !== undefined
      ? {
          x: gamepad.axes[profile.touchpadXAxis] || 0,
          y: gamepad.axes[profile.touchpadYAxis] || 0,
        }
      : undefined;

  // Extract trigger and grip values
  const triggerValue = buttons.get('trigger')?.value || 0;
  const gripValue = buttons.get('grip')?.value || 0;

  return {
    buttons,
    thumbstick,
    touchpad,
    triggerValue,
    gripValue,
  };
}

/**
 * Calculate pinch strength from hand joint positions (Phase 3)
 * Returns 0.0 (open) to 1.0 (pinched)
 */
function calculatePinchStrength(joints: Map<HandJoint, JointPose>): number {
  const thumbTip = joints.get('thumb-tip');
  const indexTip = joints.get('index-finger-tip');

  if (!thumbTip || !indexTip) return 0;

  const dx = thumbTip.position[0] - indexTip.position[0];
  const dy = thumbTip.position[1] - indexTip.position[1];
  const dz = thumbTip.position[2] - indexTip.position[2];
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Normalize: 0.05m = open (0.0), 0.01m = pinched (1.0)
  const normalized = Math.max(0, Math.min(1, (0.05 - distance) / 0.04));
  return normalized;
}

/**
 * Calculate grip strength from hand joint curl (Phase 3)
 * Returns 0.0 (open) to 1.0 (gripped)
 */
function calculateGripStrength(joints: Map<HandJoint, JointPose>): number {
  // Average curl of all fingers except thumb
  const fingerTips: HandJoint[] = [
    'index-finger-tip',
    'middle-finger-tip',
    'ring-finger-tip',
    'pinky-finger-tip',
  ];

  const wrist = joints.get('wrist');
  if (!wrist) return 0;

  let totalCurl = 0;
  let validFingers = 0;

  for (const tipJoint of fingerTips) {
    const tip = joints.get(tipJoint);
    if (!tip) continue;

    // Distance from wrist to fingertip
    const dx = tip.position[0] - wrist.position[0];
    const dy = tip.position[1] - wrist.position[1];
    const dz = tip.position[2] - wrist.position[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Normalize: 0.15m = open (0.0), 0.08m = gripped (1.0)
    const curl = Math.max(0, Math.min(1, (0.15 - distance) / 0.07));
    totalCurl += curl;
    validFingers++;
  }

  return validFingers > 0 ? totalCurl / validFingers : 0;
}

/**
 * Poll hand tracking joints per frame (Phase 3)
 * Requires XRHand API support (Quest Pro, Vision Pro)
 */
function pollHandTracking(
  source: XRInputSourceLike,
  frame: XRFrameLike | null,
  referenceSpace: unknown
): HandTrackingState | null {
  if (!source.hand) return null;

  const joints = new Map<HandJoint, JointPose>();

  // XRHand provides joint data as an iterable
  for (const [jointName, xrJoint] of source.hand.entries()) {
    let position: [number, number, number] = [0, 0, 0];
    let rotation: [number, number, number, number] = [0, 0, 0, 1];
    let radius = 0.01;

    if (frame && referenceSpace) {
      try {
        const jointPose = frame.getJointPose(xrJoint, referenceSpace);
        if (jointPose) {
          const t = jointPose.transform.position;
          const r = jointPose.transform.orientation;
          // t is assumed to be an array from XRPoseResult, but if it was not we would wrap it
          // WebXR's XRRigidTransform.orientation is DOMPointReadOnly (object
          // form { x, y, z, w }); .position here is already a numeric tuple.
          // Convert orientation at the boundary to the canonical tuple form
          // (founder ruling 2026-04-28).
          position = [t[0], t[1], t[2]];
          rotation = [r.x, r.y, r.z, r.w];
          radius = jointPose.radius ?? 0.01;
        }
      } catch {
        // Joint pose unavailable for this joint
      }
    }

    joints.set(jointName as HandJoint, { position, rotation, radius });
  }

  const pinchStrength = calculatePinchStrength(joints);
  const gripStrength = calculateGripStrength(joints);

  return {
    joints,
    pinchStrength,
    gripStrength,
  };
}

/**
 * Calculate forward direction vector from quaternion (Phase 3)
 */
function _calculateForwardVector(quaternion: { x: number; y: number; z: number; w: number }): [number, number, number] {
  const { x, y, z, w } = quaternion;

  // Forward is -Z axis rotated by quaternion
  return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
}

/**
 * Poll eye tracking gaze vector (Phase 3)
 * Requires eye tracking permission (Vision Pro, Quest Pro)
 */
function pollEyeTracking(
  session: XRSessionLike,
  state: OpenXRHALState,
  frame: XRFrameLike | null
): GazeRay | null {
  if (!session.inputSources) return null;

  // Find gaze input source
  const gazeSource = Array.from(session.inputSources).find(
    (source: XRInputSourceLike) => source.targetRayMode === 'gaze'
  );

  if (!gazeSource) return null;

  if (frame && state.referenceSpace && gazeSource.targetRaySpace) {
    try {
      const gazePose = frame.getPose(gazeSource.targetRaySpace, state.referenceSpace);
        if (gazePose) {
          const t = gazePose.transform.position;
          const r = gazePose.transform.orientation;
          // Compute forward from quaternion: rotate -Z by orientation
          const { x, y, z, w } = r;
          return {
            origin: [t[0], t[1], t[2]],
            direction: [
              2 * (x * z + w * y),
              2 * (y * z - w * x),
              1 - 2 * (x * x + y * y),
            ],
          };
        }
    } catch {
      // Gaze pose unavailable
    }
  }

  // Fallback: approximate eye height, forward direction
  return {
    origin: [0, 1.6, 0],
    direction: [0, 0, -1],
  };
}

/**
 * Poll input sources per frame and emit updates
 */
function pollInputSources(state: OpenXRHALState, context: TraitContext, node: HSPlusNode): void {
  if (!state.session || state.session.simulated) return;

  const inputSources = state.session.inputSources;

  if (!inputSources) return;

  // Update cache
  state.inputSourcesCache = Array.from(inputSources) as XRInputSourceLike[];

  const frame = state.currentFrame;

  // Emit update for each input source
  for (const source of inputSources) {
    let pose = null;

    // Get controller grip pose from the current XRFrame
    if (frame && state.referenceSpace && source.gripSpace) {
      try {
        const xrPose = frame.getPose(source.gripSpace, state.referenceSpace);
        if (xrPose) {
          const t = xrPose.transform.position;
          const r = xrPose.transform.orientation;
          // WebXR DOMPointReadOnly orientation -> canonical tuple form.
          pose = {
            position: [t[0], t[1], t[2]],
            rotation: [r.x, r.y, r.z, r.w],
          };
        }
      } catch {
        pose = null;
      }
    }

    // Phase 2: Poll gamepad state for button/axis data
    const gamepadState = pollGamepadState(source, source.handedness);

    context.emit?.('xr_input_source_update', {
      node,
      source: {
        handedness: source.handedness,
        targetRayMode: source.targetRayMode,
        profiles: source.profiles || [],
        hasGamepad: !!source.gamepad,
        hasHand: !!source.hand,
      },
      pose,
      timestamp: Date.now(),
    });

    // Phase 2: Emit controller data if gamepad is present
    if (gamepadState) {
      // Convert Map to plain object for event emission
      const buttonsObj: Record<string, ButtonState> = {};
      gamepadState.buttons.forEach((state, button) => {
        buttonsObj[button] = state;
      });

      context.emit?.('controller_data', {
        node,
        hand: source.handedness,
        buttons: buttonsObj,
        thumbstick: gamepadState.thumbstick,
        touchpad: gamepadState.touchpad,
        triggerValue: gamepadState.triggerValue,
        gripValue: gamepadState.gripValue,
        timestamp: Date.now(),
      });
    }

    // Phase 3: Poll hand tracking if available
    const handState = pollHandTracking(source, frame, state.referenceSpace);
    if (handState) {
      // Convert Map to plain object for event emission
      const jointsObj: Record<string, JointPose> = {};
      handState.joints.forEach((pose, joint) => {
        jointsObj[joint] = pose;
      });

      context.emit?.('hand_data', {
        node,
        hand: source.handedness,
        joints: jointsObj,
        pinchStrength: handState.pinchStrength,
        gripStrength: handState.gripStrength,
        timestamp: Date.now(),
      });
    }
  }

  // Phase 3: Poll eye tracking (per-session, not per-source)
  if (state.eyeTrackingActive) {
    const gazeRay = pollEyeTracking(state.session!, state, frame);
    if (gazeRay) {
      context.emit?.('eye_gaze_update', {
        node,
        origin: gazeRay.origin,
        direction: gazeRay.direction,
        timestamp: Date.now(),
      });
    }
  }
}

function initializeOpenXR(
  node: HSPlusNode,
  state: OpenXRHALState,
  config: OpenXRHALConfig,
  context: TraitContext
): void {
  // Check for WebXR support
  if (typeof navigator !== 'undefined' && 'xr' in navigator) {
    (navigator as unknown as { xr?: XRSystemLike }).xr
      ?.isSessionSupported('immersive-vr')
      .then((supported: boolean) => {
        if (supported) {
          context.emit?.('openxr_available', { node, mode: 'immersive-vr' });
        } else if (config.fallback_mode === 'simulate') {
          createSimulatedSession(state, config);
          context.emit?.('openxr_simulated', { node });
        } else if (config.fallback_mode === 'error') {
          context.emit?.('openxr_error', { node, error: 'WebXR not supported' });
        }
      });
  } else if (config.fallback_mode === 'simulate') {
    createSimulatedSession(state, config);
    context.emit?.('openxr_simulated', { node });
  }
}

function createSimulatedSession(state: OpenXRHALState, config: OpenXRHALConfig): void {
  state.isInitialized = true;
  state.session = {
    simulated: true,
    end() {
      /* no-op */
    },
    requestAnimationFrame() {
      return 0;
    },
    requestReferenceSpace() {
      return Promise.resolve(null);
    },
    addEventListener() {
      /* no-op */
    },
  };
  state.deviceProfile = {
    type: 'generic_openxr',
    name: 'Simulated XR Device',
    manufacturer: 'HoloScript',
    hapticCapabilities: config.simulate_haptics ? ['rumble'] : ['none'],
    trackingCapabilities: ['controller'],
    renderCapabilities: [],
    refreshRates: [60, 90],
    resolution: { width: 1920, height: 1080 },
    fov: 90,
    controllers: {
      left: createSimulatedController(),
      right: createSimulatedController(),
    },
  };
  state.frameRate = 90;
}

function createSimulatedController(): ControllerProfile {
  return {
    hapticActuators: 1,
    hapticFrequencyRange: [0, 500],
    maxAmplitude: 1.0,
    supportsHDHaptics: false,
    buttonCount: 6,
    hasThumbstick: true,
    hasTouchpad: false,
    hasGripButton: true,
    hasTrigger: true,
  };
}

function detectDevice(state: OpenXRHALState, config: OpenXRHALConfig): void {
  // In real implementation, query navigator.xr.requestSession for device info
  // For now, use a simulation or device overrides
  if (config.device_overrides) {
    state.deviceProfile = {
      type: 'generic_openxr',
      name: 'Custom Device',
      manufacturer: 'Unknown',
      hapticCapabilities: ['rumble'],
      trackingCapabilities: ['controller'],
      renderCapabilities: [],
      refreshRates: [90],
      resolution: { width: 1920, height: 1080 },
      fov: 90,
      controllers: { left: null, right: null },
      ...config.device_overrides,
    };
  }
}

function getCapabilities(state: OpenXRHALState): Record<string, boolean> {
  const profile = state.deviceProfile;
  if (!profile) return {};

  return {
    hasRumble: profile.hapticCapabilities.includes('rumble'),
    hasHDHaptics: profile.hapticCapabilities.includes('hd_haptics'),
    hasForceFeedback: profile.hapticCapabilities.includes('force_feedback'),
    hasThermal: profile.hapticCapabilities.includes('thermal'),
    hasHandTracking: profile.trackingCapabilities.includes('hand'),
    hasEyeTracking: profile.trackingCapabilities.includes('eye'),
    hasBodyTracking: profile.trackingCapabilities.includes('body'),
    hasFaceTracking: profile.trackingCapabilities.includes('face'),
    hasPassthrough: profile.renderCapabilities.includes('passthrough'),
    hasDepthSensing: profile.renderCapabilities.includes('depth_sensing'),
    hasMeshDetection: profile.renderCapabilities.includes('mesh_detection'),
    hasPlaneDetection: profile.renderCapabilities.includes('plane_detection'),
  };
}

// =============================================================================
// REFERENCE SPACE FALLBACK CHAIN (v3.1)
// =============================================================================

/**
 * Reference space preference order for immersive sessions.
 * unbounded â†’ bounded-floor â†’ local-floor â†’ local â†’ viewer
 */
const REFERENCE_SPACE_CHAIN = [
  'unbounded',
  'bounded-floor',
  'local-floor',
  'local',
  'viewer',
] as const;

/**
 * Request a reference space with automatic fallback chain.
 * Tries each space in order until one succeeds.
 */
async function requestReferenceSpaceWithFallback(
  session: XRSessionLike,
  state: OpenXRHALState,
  context: TraitContext,
  node: HSPlusNode
): Promise<void> {
  if (typeof session.requestReferenceSpace !== 'function') return;

  for (const spaceType of REFERENCE_SPACE_CHAIN) {
    try {
      const refSpace = await session.requestReferenceSpace(spaceType);
      state.referenceSpace = refSpace;
      state.featuresAvailable.add(spaceType);
      context.emit?.('openxr_reference_space_acquired', {
        node,
        spaceType,
        fallbackChain: REFERENCE_SPACE_CHAIN,
      });
      return;
    } catch {
      // This space type not available, try next
      context.emit?.('openxr_reference_space_fallback', {
        node,
        attempted: spaceType,
        reason: 'not_supported',
      });
    }
  }

  // All reference spaces failed
  context.emit?.('openxr_reference_space_failed', {
    node,
    attempted: [...REFERENCE_SPACE_CHAIN],
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  OpenXRHALConfig,
  OpenXRHALState,
  XRDeviceProfile,
  HapticCapability,
  TrackingCapability,
  RenderCapability,
  ControllerProfile,
  XRDeviceType,
  HandJoint,
  JointPose,
  HandTrackingState,
  GazeRay,
  GamepadState,
  ControllerButton,
  ButtonState,
  ControllerProfileDatabase,
  REFERENCE_SPACE_CHAIN,
};

// Export device profiles for external use
export { deviceProfiles };

// Export utility functions
export { getCapabilities, createSimulatedController };
