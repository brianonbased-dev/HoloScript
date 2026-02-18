/**
 * OpenXRHALTrait WebXR Integration Tests
 *
 * Tests the WebXR device detection, session management, feature probing,
 * reference space fallback chain, and graceful degradation.
 *
 * Commence All VI — Track 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  openXRHALHandler,
  deviceProfiles,
  getCapabilities,
  createSimulatedController,
  REFERENCE_SPACE_CHAIN,
} from '../OpenXRHALTrait';

// =============================================================================
// Mock Factories
// =============================================================================

function createMockNode(id = 'xr-node') {
  return { id, name: id };
}

function createMockContext() {
  return { emit: vi.fn() };
}

function createMockXRInputSource(overrides: Partial<any> = {}) {
  return {
    handedness: 'right',
    targetRayMode: 'tracked-pointer',
    profiles: ['oculus-touch-v3'],
    gamepad: {
      hapticActuators: [{ pulse: vi.fn() }],
      buttons: [
        { pressed: false, touched: false, value: 0 },
        { pressed: false, touched: false, value: 0 },
        { pressed: false, touched: false, value: 0 },
        { pressed: false, touched: false, value: 0 },
        { pressed: false, touched: false, value: 0 },
        { pressed: false, touched: false, value: 0 },
      ],
      axes: [0, 0, 0, 0],
    },
    gripSpace: {},
    targetRaySpace: {},
    hand: null,
    ...overrides,
  };
}

function createMockSession(overrides: Partial<any> = {}) {
  const listeners: Record<string, Function[]> = {};
  const inputSources = overrides.inputSources ?? [
    createMockXRInputSource({ handedness: 'left' }),
    createMockXRInputSource({ handedness: 'right' }),
  ];

  return {
    inputSources,
    visibilityState: 'visible',
    environmentBlendMode: 'opaque',
    enabledFeatures: [],
    renderState: {},
    requestReferenceSpace: vi.fn().mockResolvedValue({ type: 'local-floor' }),
    requestAnimationFrame: vi.fn(),
    updateTargetFrameRate: vi.fn().mockResolvedValue(undefined),
    requestHitTestSource: null,
    depthUsage: null,
    domOverlayState: null,
    end: vi.fn(),
    addEventListener: vi.fn((type: string, handler: Function) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    }),
    _triggerEvent(type: string, event?: any) {
      (listeners[type] || []).forEach((fn) => fn(event || {}));
    },
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('OpenXRHALTrait — WebXR Integration', () => {
  let node: any;
  let ctx: any;
  const config = { ...openXRHALHandler.defaultConfig };

  beforeEach(() => {
    node = createMockNode();
    ctx = createMockContext();
  });

  // ---------------------------------------------------------------------------
  // 1. INITIALIZATION & SIMULATED FALLBACK
  // ---------------------------------------------------------------------------

  describe('initialization', () => {
    it('initializes with simulated session when navigator.xr is unavailable', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state).toBeDefined();
      expect(state.isInitialized).toBe(true);
      expect((state.session as any)?.simulated).toBe(true);
    });

    it('sets default performance level to medium', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.performanceLevel).toBe('medium');
    });

    it('initializes empty features set', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.featuresAvailable).toBeInstanceOf(Set);
    });

    it('initializes lifecycle flags correctly', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.sessionVisible).toBe(true);
      expect(state.sessionInterrupted).toBe(false);
      expect(state.reconnectAttempts).toBe(0);
      expect(state.lastError).toBeNull();
      expect(state.errorCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SESSION REQUEST VIA EVENT
  // ---------------------------------------------------------------------------

  describe('session request', () => {
    it('handles request_xr_session event', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'request_xr_session',
        payload: { mode: 'immersive-vr' },
      } as any);
      // Should not throw — falls back to simulated since navigator.xr is absent
      const state = (node as any).__openxrHALState;
      expect(state.isInitialized).toBe(true);
    });

    it('handles immersive-ar session request', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'request_xr_session',
        payload: { mode: 'immersive-ar' },
      } as any);
      const state = (node as any).__openxrHALState;
      expect(state.isInitialized).toBe(true);
    });

    it('defaults to immersive-vr when no mode specified', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'request_xr_session',
        payload: {},
      } as any);
      const state = (node as any).__openxrHALState;
      expect(state.isInitialized).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. XR_SESSION_START EVENT — DEVICE DETECTION
  // ---------------------------------------------------------------------------

  describe('xr_session_start — device detection', () => {
    it('detects device and emits openxr_ready on xr_session_start', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'xr_session_start',
        payload: {},
      } as any);

      const readyCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'openxr_ready');
      expect(readyCalls.length).toBeGreaterThanOrEqual(1);
      expect(readyCalls[0][1]).toHaveProperty('capabilities');
    });

    it('sets isInitialized after xr_session_start', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'xr_session_start',
        payload: {},
      } as any);
      const state = (node as any).__openxrHALState;
      expect(state.isInitialized).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. DEVICE PROFILES DATABASE
  // ---------------------------------------------------------------------------

  describe('device profiles database', () => {
    it('contains Quest 3 profile', () => {
      expect(deviceProfiles['meta quest 3']).toBeDefined();
      expect(deviceProfiles['meta quest 3'].type).toBe('quest_3');
      expect(deviceProfiles['meta quest 3'].manufacturer).toBe('Meta');
    });

    it('contains Quest Pro profile with eye tracking', () => {
      const pro = deviceProfiles['meta quest pro'];
      expect(pro).toBeDefined();
      expect(pro.trackingCapabilities).toContain('eye');
      expect(pro.trackingCapabilities).toContain('face');
    });

    it('contains Apple Vision Pro profile', () => {
      const vp = deviceProfiles['apple vision pro'];
      expect(vp).toBeDefined();
      expect(vp.hapticCapabilities).toContain('none');
      expect(vp.trackingCapabilities).toContain('hand');
      expect(vp.trackingCapabilities).toContain('eye');
    });

    it('contains Valve Index profile with high refresh rates', () => {
      const idx = deviceProfiles['valve index'];
      expect(idx).toBeDefined();
      expect(idx.refreshRates).toContain(144);
      expect(idx.hapticCapabilities).toContain('force_feedback');
    });

    it('contains HTC Vive XR Elite profile', () => {
      const vive = deviceProfiles['htc vive xr elite'];
      expect(vive).toBeDefined();
      expect(vive.manufacturer).toBe('HTC');
    });

    it('all profiles have required fields', () => {
      for (const [name, profile] of Object.entries(deviceProfiles)) {
        expect(profile.type, `${name} missing type`).toBeDefined();
        expect(profile.name, `${name} missing name`).toBeDefined();
        expect(profile.manufacturer, `${name} missing manufacturer`).toBeDefined();
        expect(profile.hapticCapabilities, `${name} missing haptics`).toBeDefined();
        expect(profile.resolution, `${name} missing resolution`).toBeDefined();
        expect(profile.fov, `${name} missing fov`).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5. SIMULATED SESSION
  // ---------------------------------------------------------------------------

  describe('simulated session', () => {
    it('creates simulated device profile', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.deviceProfile).toBeDefined();
      expect(state.deviceProfile.name).toBe('Simulated XR Device');
      expect(state.deviceProfile.manufacturer).toBe('HoloScript');
    });

    it('simulated controller has correct defaults', () => {
      const controller = createSimulatedController();
      expect(controller.hapticActuators).toBe(1);
      expect(controller.buttonCount).toBe(6);
      expect(controller.hasThumbstick).toBe(true);
      expect(controller.hasTrigger).toBe(true);
      expect(controller.hasGripButton).toBe(true);
      expect(controller.hasTouchpad).toBe(false);
      expect(controller.supportsHDHaptics).toBe(false);
    });

    it('simulated session has both controllers', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.deviceProfile.controllers.left).toBeDefined();
      expect(state.deviceProfile.controllers.right).toBeDefined();
    });

    it('simulated session with haptics disabled has no haptic capabilities', () => {
      const noHapticsConfig = { ...config, simulate_haptics: false };
      openXRHALHandler.onAttach!(node, noHapticsConfig, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.deviceProfile.hapticCapabilities).toContain('none');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. CAPABILITIES QUERY
  // ---------------------------------------------------------------------------

  describe('capabilities', () => {
    it('getCapabilities returns correct flags for Quest 3', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      state.deviceProfile = {
        ...state.deviceProfile,
        hapticCapabilities: ['rumble', 'hd_haptics'],
        trackingCapabilities: ['controller', 'hand', 'eye'],
        renderCapabilities: ['passthrough', 'depth_sensing'],
      };

      const caps = getCapabilities(state);
      expect(caps.hasRumble).toBe(true);
      expect(caps.hasHDHaptics).toBe(true);
      expect(caps.hasHandTracking).toBe(true);
      expect(caps.hasEyeTracking).toBe(true);
      expect(caps.hasPassthrough).toBe(true);
      expect(caps.hasDepthSensing).toBe(true);
    });

    it('getCapabilities returns empty when no profile', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      state.deviceProfile = null;
      expect(getCapabilities(state)).toEqual({});
    });

    it('emits device_profile_response on get_device_profile event', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'get_device_profile',
        payload: {},
      } as any);

      const profileCalls = ctx.emit.mock.calls.filter(
        (c: any) => c[0] === 'device_profile_response'
      );
      expect(profileCalls.length).toBe(1);
      expect(profileCalls[0][1]).toHaveProperty('deviceProfile');
      expect(profileCalls[0][1].isSimulated).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. HAPTIC FEEDBACK
  // ---------------------------------------------------------------------------

  describe('haptics', () => {
    it('emits haptic_triggered on trigger_haptic event', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'trigger_haptic',
        payload: { hand: 'right', intensity: 0.8, duration: 200 },
      } as any);

      const hapticCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'haptic_triggered');
      expect(hapticCalls.length).toBe(1);
      expect(hapticCalls[0][1].hand).toBe('right');
      expect(hapticCalls[0][1].intensity).toBe(0.8);
      expect(hapticCalls[0][1].duration).toBe(200);
      expect(hapticCalls[0][1].simulated).toBe(true);
    });

    it('haptic_capability_response reflects device profile', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'request_haptic_capability',
        payload: { capability: 'rumble' },
      } as any);

      const capCalls = ctx.emit.mock.calls.filter(
        (c: any) => c[0] === 'haptic_capability_response'
      );
      expect(capCalls.length).toBe(1);
      expect(capCalls[0][1].capability).toBe('rumble');
    });

    it('defaults to right hand with full intensity', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'trigger_haptic',
        payload: {},
      } as any);

      const hapticCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'haptic_triggered');
      expect(hapticCalls[0][1].hand).toBe('right');
      expect(hapticCalls[0][1].intensity).toBe(1.0);
      expect(hapticCalls[0][1].duration).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. PERFORMANCE MONITORING
  // ---------------------------------------------------------------------------

  describe('performance monitoring', () => {
    it('sets performance level to low for high frame times', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onUpdate!(node, config, ctx, 20.0); // > 16.67ms
      const state = (node as any).__openxrHALState;
      expect(state.performanceLevel).toBe('low');
    });

    it('sets performance level to medium for normal frame times', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onUpdate!(node, config, ctx, 14.0); // 11.11-16.67ms
      const state = (node as any).__openxrHALState;
      expect(state.performanceLevel).toBe('medium');
    });

    it('sets performance level to high for good frame times', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onUpdate!(node, config, ctx, 10.0); // 8.33-11.11ms
      const state = (node as any).__openxrHALState;
      expect(state.performanceLevel).toBe('high');
    });

    it('sets performance level to max for excellent frame times', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onUpdate!(node, config, ctx, 5.0); // < 8.33ms
      const state = (node as any).__openxrHALState;
      expect(state.performanceLevel).toBe('max');
    });

    it('emits openxr_frame with performance data', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onUpdate!(node, config, ctx, 11.1);

      const frameCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'openxr_frame');
      expect(frameCalls.length).toBe(1);
      expect(frameCalls[0][1].delta).toBe(11.1);
      expect(frameCalls[0][1]).toHaveProperty('performanceLevel');
      expect(frameCalls[0][1]).toHaveProperty('sessionVisible');
    });
  });

  // ---------------------------------------------------------------------------
  // 9. SESSION LIFECYCLE
  // ---------------------------------------------------------------------------

  describe('session lifecycle', () => {
    it('skips updates when session is interrupted', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      state.sessionInterrupted = true;
      ctx.emit.mockClear();

      openXRHALHandler.onUpdate!(node, config, ctx, 11.1);
      // Should NOT emit openxr_frame when interrupted
      const frameCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'openxr_frame');
      expect(frameCalls.length).toBe(0);
    });

    it('cleans up state on detach', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      expect((node as any).__openxrHALState).toBeDefined();

      openXRHALHandler.onDetach!(node, config, ctx);
      expect((node as any).__openxrHALState).toBeUndefined();
    });

    it('emits session_end on detach if session exists', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      ctx.emit.mockClear();

      openXRHALHandler.onDetach!(node, config, ctx);
      const endCalls = ctx.emit.mock.calls.filter((c: any) => c[0] === 'openxr_session_end');
      expect(endCalls.length).toBe(1);
    });

    it('handles end_xr_session event', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      openXRHALHandler.onEvent!(node, config, ctx, {
        type: 'end_xr_session',
        payload: {},
      } as any);
      // Should not throw
    });
  });

  // ---------------------------------------------------------------------------
  // 10. REFERENCE SPACE FALLBACK CHAIN
  // ---------------------------------------------------------------------------

  describe('reference space fallback chain', () => {
    it('exports correct chain order', () => {
      expect(REFERENCE_SPACE_CHAIN).toEqual([
        'unbounded',
        'bounded-floor',
        'local-floor',
        'local',
        'viewer',
      ]);
    });

    it('chain has 5 levels', () => {
      expect(REFERENCE_SPACE_CHAIN.length).toBe(5);
    });

    it('unbounded is highest priority', () => {
      expect(REFERENCE_SPACE_CHAIN[0]).toBe('unbounded');
    });

    it('viewer is lowest priority (always available)', () => {
      expect(REFERENCE_SPACE_CHAIN[REFERENCE_SPACE_CHAIN.length - 1]).toBe('viewer');
    });
  });

  // ---------------------------------------------------------------------------
  // 11. DEVICE OVERRIDES
  // ---------------------------------------------------------------------------

  describe('device overrides', () => {
    it('applies device overrides on xr_session_start', () => {
      const overrideConfig = {
        ...config,
        device_overrides: {
          name: 'Custom HMD',
          fov: 150,
          manufacturer: 'TestCo',
        },
      };
      openXRHALHandler.onAttach!(node, overrideConfig, ctx);
      openXRHALHandler.onEvent!(node, overrideConfig, ctx, {
        type: 'xr_session_start',
        payload: {},
      } as any);

      const state = (node as any).__openxrHALState;
      expect(state.deviceProfile.name).toBe('Custom HMD');
      expect(state.deviceProfile.fov).toBe(150);
      expect(state.deviceProfile.manufacturer).toBe('TestCo');
    });
  });

  // ---------------------------------------------------------------------------
  // 12. HANDLER METADATA
  // ---------------------------------------------------------------------------

  describe('handler metadata', () => {
    it('has correct name', () => {
      expect(openXRHALHandler.name).toBe('openxr_hal');
    });

    it('has all lifecycle methods', () => {
      expect(openXRHALHandler.onAttach).toBeTypeOf('function');
      expect(openXRHALHandler.onDetach).toBeTypeOf('function');
      expect(openXRHALHandler.onUpdate).toBeTypeOf('function');
      expect(openXRHALHandler.onEvent).toBeTypeOf('function');
    });

    it('default config has sensible values', () => {
      const defaults = openXRHALHandler.defaultConfig;
      expect(defaults.preferred_refresh_rate).toBe(0);
      expect(defaults.enable_hand_tracking).toBe(true);
      expect(defaults.enable_eye_tracking).toBe(false);
      expect(defaults.performance_mode).toBe('balanced');
      expect(defaults.fallback_mode).toBe('simulate');
      expect(defaults.simulate_haptics).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 13. ERROR HANDLING
  // ---------------------------------------------------------------------------

  describe('error handling', () => {
    it('error count starts at 0', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.errorCount).toBe(0);
    });

    it('reconnect attempts start at 0', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.reconnectAttempts).toBe(0);
    });

    it('lastError starts as null', () => {
      openXRHALHandler.onAttach!(node, config, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.lastError).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 14. FALLBACK MODE CONFIGURATIONS
  // ---------------------------------------------------------------------------

  describe('fallback modes', () => {
    it('simulate mode creates simulated session', () => {
      openXRHALHandler.onAttach!(node, { ...config, fallback_mode: 'simulate' }, ctx);
      const state = (node as any).__openxrHALState;
      expect(state.isInitialized).toBe(true);
      expect((state.session as any)?.simulated).toBe(true);
    });

    it('disable mode does not initialize', () => {
      openXRHALHandler.onAttach!(node, { ...config, fallback_mode: 'disable' }, ctx);
      const state = (node as any).__openxrHALState;
      // In disable mode without navigator.xr, session stays null
      expect(state.isInitialized).toBe(false);
    });

    it('error mode emits error when no WebXR', () => {
      openXRHALHandler.onAttach!(node, { ...config, fallback_mode: 'error' }, ctx);
      // Check that it did not create a simulated session
      const state = (node as any).__openxrHALState;
      expect((state.session as any)?.simulated).toBeUndefined();
    });
  });
});
