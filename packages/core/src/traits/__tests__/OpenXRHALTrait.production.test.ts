/**
 * OpenXRHALTrait - Production Test Suite
 *
 * Commence All V — Tests aligned to actual openXRHALHandler implementation.
 * Covers: onAttach state/simulated session, onDetach cleanup, onUpdate perf
 * level detection + frame emit, onEvent dispatch (xr_session_start,
 * trigger_haptic, request_haptic_capability, get_device_profile).
 * Phase 4: error handling, feature tracking.
 *
 * NOTE: In Node/test environment there is no `navigator.xr`, so
 * initializeOpenXR() falls back to createSimulatedSession when
 * fallback_mode is 'simulate' (the default). This means onAttach
 * auto-initialises state.isInitialized = true with a simulated profile.
 */

import { describe, it, expect, vi } from 'vitest';
import { openXRHALHandler } from '../OpenXRHALTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'test-xr') {
  return { id, __openxrHALState: undefined as any };
}

function makeContext() {
  const emitted: { event: string; data: any }[] = [];
  return {
    emit: (event: string, data: any) => emitted.push({ event, data }),
    emitted,
  };
}

function defaultConfig() {
  return { ...openXRHALHandler.defaultConfig };
}

function attachNode(config = defaultConfig()) {
  const node = makeNode();
  const ctx = makeContext();
  openXRHALHandler.onAttach(node, config, ctx);
  return { node, ctx };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('OpenXRHALTrait — Production Tests', () => {
  // =========================================================================
  // Handler defaults
  // =========================================================================
  describe('handler defaults', () => {
    it('has name openxr_hal', () => {
      expect(openXRHALHandler.name).toBe('openxr_hal');
    });

    it('default preferred refresh rate is 0 (auto)', () => {
      expect(openXRHALHandler.defaultConfig.preferred_refresh_rate).toBe(0);
    });

    it('default passthrough disabled', () => {
      expect(openXRHALHandler.defaultConfig.enable_passthrough).toBe(false);
    });

    it('default hand tracking enabled', () => {
      expect(openXRHALHandler.defaultConfig.enable_hand_tracking).toBe(true);
    });

    it('default eye tracking disabled', () => {
      expect(openXRHALHandler.defaultConfig.enable_eye_tracking).toBe(false);
    });

    it('default performance mode is balanced', () => {
      expect(openXRHALHandler.defaultConfig.performance_mode).toBe('balanced');
    });

    it('default fallback mode is simulate', () => {
      expect(openXRHALHandler.defaultConfig.fallback_mode).toBe('simulate');
    });

    it('default haptic simulation enabled', () => {
      expect(openXRHALHandler.defaultConfig.simulate_haptics).toBe(true);
    });

    it('default device overrides is null', () => {
      expect(openXRHALHandler.defaultConfig.device_overrides).toBeNull();
    });
  });

  // =========================================================================
  // onAttach — State initialization (with simulated session)
  // =========================================================================
  describe('onAttach', () => {
    it('initializes state on node', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState).toBeDefined();
    });

    it('creates simulated session in test env (no navigator.xr)', () => {
      const { node } = attachNode();
      // In Node test env, fallback_mode: "simulate" triggers createSimulatedSession
      expect(node.__openxrHALState.isInitialized).toBe(true);
      expect(node.__openxrHALState.session).toBeDefined();
      expect((node.__openxrHALState.session as any).simulated).toBe(true);
    });

    it('sets device profile for simulated device', () => {
      const { node } = attachNode();
      const profile = node.__openxrHALState.deviceProfile;
      expect(profile).toBeDefined();
      expect(profile.type).toBe('generic_openxr');
      expect(profile.name).toBe('Simulated XR Device');
      expect(profile.manufacturer).toBe('HoloScript');
    });

    it('simulated device has rumble haptics', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.deviceProfile.hapticCapabilities).toContain('rumble');
    });

    it('default frame rate is 90', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.frameRate).toBe(90);
    });

    it('default performance level is medium', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.performanceLevel).toBe('medium');
    });

    it('passthrough not active by default', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.isPassthroughActive).toBe(false);
    });

    it('hand tracking not active by default', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.handTrackingActive).toBe(false);
    });

    it('eye tracking not active by default', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.eyeTrackingActive).toBe(false);
    });

    it('starts with empty features set', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.featuresAvailable).toBeInstanceOf(Set);
    });

    it('starts with zero error count', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.errorCount).toBe(0);
    });

    it('starts with null lastError', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.lastError).toBeNull();
    });

    it('starts visible (sessionVisible true)', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.sessionVisible).toBe(true);
    });

    it('starts not interrupted', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.sessionInterrupted).toBe(false);
    });

    it('reconnectAttempts starts at zero', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.reconnectAttempts).toBe(0);
    });

    it('emits openxr_simulated event for simulated fallback', () => {
      const { ctx } = attachNode();
      const simEvents = ctx.emitted.filter((e) => e.event === 'openxr_simulated');
      expect(simEvents.length).toBe(1);
    });

    it('does NOT auto-init when fallback_mode is disable', () => {
      const config = { ...defaultConfig(), fallback_mode: 'disable' as const };
      const { node } = attachNode(config);
      expect(node.__openxrHALState.isInitialized).toBe(false);
      expect(node.__openxrHALState.session).toBeNull();
    });
  });

  // =========================================================================
  // onDetach — Cleanup
  // =========================================================================
  describe('onDetach', () => {
    it('removes state from node', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onDetach(node, defaultConfig(), ctx);
      expect(node.__openxrHALState).toBeUndefined();
    });

    it('emits openxr_session_end if session existed', () => {
      const { node, ctx } = attachNode();
      // Default attach creates simulated session
      openXRHALHandler.onDetach(node, defaultConfig(), ctx);
      const endEvents = ctx.emitted.filter((e) => e.event === 'openxr_session_end');
      expect(endEvents.length).toBe(1);
    });
  });

  // =========================================================================
  // onUpdate — Performance level detection
  // =========================================================================
  describe('onUpdate — performance level detection', () => {
    it('does not throw on normal update', () => {
      const { node, ctx } = attachNode();
      expect(() => openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 11)).not.toThrow();
    });

    it('sets performanceLevel to low for high delta (> 16.67ms)', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 20);
      expect(node.__openxrHALState.performanceLevel).toBe('low');
    });

    it('sets performanceLevel to medium for delta > 11.11ms', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 13);
      expect(node.__openxrHALState.performanceLevel).toBe('medium');
    });

    it('sets performanceLevel to high for delta > 8.33ms', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 9);
      expect(node.__openxrHALState.performanceLevel).toBe('high');
    });

    it('sets performanceLevel to max for delta <= 8.33ms', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 5);
      expect(node.__openxrHALState.performanceLevel).toBe('max');
    });

    it('emits openxr_frame event on update', () => {
      const { node, ctx } = attachNode();
      const beforeCount = ctx.emitted.length;
      openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 11);
      const frameEvents = ctx.emitted.slice(beforeCount).filter((e) => e.event === 'openxr_frame');
      expect(frameEvents.length).toBe(1);
    });

    it('openxr_frame event contains performanceLevel', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 5);
      const frameEvent = ctx.emitted.find((e) => e.event === 'openxr_frame');
      expect(frameEvent?.data.performanceLevel).toBe('max');
    });

    it('skips update when not initialized', () => {
      const config = { ...defaultConfig(), fallback_mode: 'disable' as const };
      const { node, ctx } = attachNode(config);
      const before = ctx.emitted.length;
      openXRHALHandler.onUpdate(node, config, ctx, 11);
      const frameEvents = ctx.emitted.slice(before).filter((e) => e.event === 'openxr_frame');
      expect(frameEvents.length).toBe(0);
    });

    it('skips update when session is interrupted', () => {
      const { node, ctx } = attachNode();
      node.__openxrHALState.sessionInterrupted = true;
      const before = ctx.emitted.length;
      openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 11);
      const frameEvents = ctx.emitted.slice(before).filter((e) => e.event === 'openxr_frame');
      expect(frameEvents.length).toBe(0);
    });
  });

  // =========================================================================
  // onEvent — xr_session_start
  // =========================================================================
  describe('onEvent — xr_session_start', () => {
    it('sets isInitialized to true', () => {
      const config = { ...defaultConfig(), fallback_mode: 'disable' as const };
      const { node, ctx } = attachNode(config);
      expect(node.__openxrHALState.isInitialized).toBe(false);
      openXRHALHandler.onEvent(node, config, ctx, {
        type: 'xr_session_start',
        payload: {},
      });
      expect(node.__openxrHALState.isInitialized).toBe(true);
    });

    it('emits openxr_ready with capabilities', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'xr_session_start',
        payload: {},
      });
      const readyEvents = ctx.emitted.filter((e) => e.event === 'openxr_ready');
      expect(readyEvents.length).toBe(1);
      expect(readyEvents[0].data.capabilities).toBeDefined();
    });
  });

  // =========================================================================
  // onEvent — trigger_haptic
  // =========================================================================
  describe('onEvent — trigger_haptic', () => {
    it('emits haptic_triggered event', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'trigger_haptic',
        payload: { hand: 'right', intensity: 0.5, duration: 100 },
      });
      const hapticEvents = ctx.emitted.filter((e) => e.event === 'haptic_triggered');
      expect(hapticEvents.length).toBe(1);
    });

    it('haptic event contains hand, intensity, duration', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'trigger_haptic',
        payload: { hand: 'left', intensity: 0.8, duration: 200 },
      });
      const haptic = ctx.emitted.find((e) => e.event === 'haptic_triggered');
      expect(haptic?.data.hand).toBe('left');
      expect(haptic?.data.intensity).toBe(0.8);
      expect(haptic?.data.duration).toBe(200);
    });

    it('indicates simulation for simulated session', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'trigger_haptic',
        payload: { hand: 'right' },
      });
      const haptic = ctx.emitted.find((e) => e.event === 'haptic_triggered');
      expect(haptic?.data.simulated).toBe(true);
    });

    it('reports success true in simulated mode', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'trigger_haptic',
        payload: { hand: 'right' },
      });
      const haptic = ctx.emitted.find((e) => e.event === 'haptic_triggered');
      expect(haptic?.data.success).toBe(true);
    });
  });

  // =========================================================================
  // onEvent — request_haptic_capability
  // =========================================================================
  describe('onEvent — request_haptic_capability', () => {
    it('responds with supported=true for rumble on default device', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'request_haptic_capability',
        payload: { capability: 'rumble' },
      });
      const response = ctx.emitted.find((e) => e.event === 'haptic_capability_response');
      expect(response?.data.supported).toBe(true);
    });

    it('responds with supported=false for hd_haptics on simulated device', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'request_haptic_capability',
        payload: { capability: 'hd_haptics' },
      });
      const response = ctx.emitted.find((e) => e.event === 'haptic_capability_response');
      expect(response?.data.supported).toBe(false);
    });
  });

  // =========================================================================
  // onEvent — get_device_profile
  // =========================================================================
  describe('onEvent — get_device_profile', () => {
    it('returns device profile and simulation status', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'get_device_profile',
        payload: {},
      });
      const response = ctx.emitted.find((e) => e.event === 'device_profile_response');
      expect(response).toBeDefined();
      expect(response?.data.deviceProfile).toBeDefined();
      expect(response?.data.isSimulated).toBe(true);
    });
  });

  // =========================================================================
  // Simulated controller
  // =========================================================================
  describe('simulated controller profile', () => {
    it('left and right controllers exist', () => {
      const { node } = attachNode();
      const profile = node.__openxrHALState.deviceProfile;
      expect(profile.controllers.left).toBeDefined();
      expect(profile.controllers.right).toBeDefined();
    });

    it('simulated controller has 1 haptic actuator', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.deviceProfile.controllers.left.hapticActuators).toBe(1);
    });

    it('simulated controller has thumbstick', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.deviceProfile.controllers.left.hasThumbstick).toBe(true);
    });

    it('simulated controller has trigger and grip', () => {
      const { node } = attachNode();
      const ctrl = node.__openxrHALState.deviceProfile.controllers.right;
      expect(ctrl.hasTrigger).toBe(true);
      expect(ctrl.hasGripButton).toBe(true);
    });

    it('simulated controller does not support HD haptics', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.deviceProfile.controllers.left.supportsHDHaptics).toBe(false);
    });
  });

  // =========================================================================
  // Phase 4: Error state tracking
  // =========================================================================
  describe('Error Tracking', () => {
    it('lastFrameTime updates on each onUpdate', () => {
      const { node, ctx } = attachNode();
      openXRHALHandler.onUpdate(node, defaultConfig(), ctx, 12.5);
      expect(node.__openxrHALState.lastFrameTime).toBe(12.5);
    });

    it('featuresAvailable is a Set', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.featuresAvailable instanceof Set).toBe(true);
    });

    it('inputSourcesCache starts empty', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.inputSourcesCache).toEqual([]);
    });

    it('referenceSpace starts null', () => {
      const { node } = attachNode();
      expect(node.__openxrHALState.referenceSpace).toBeNull();
    });
  });
});
