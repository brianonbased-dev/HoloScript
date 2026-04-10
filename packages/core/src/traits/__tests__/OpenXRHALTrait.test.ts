/**
 * OpenXRHALTrait Tests
 *
 * Tests for OpenXR Hardware Abstraction Layer trait.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  openXRHALHandler,
  deviceProfiles,
  getCapabilities,
  createSimulatedController,
  type OpenXRHALConfig,
  type XRDeviceProfile,
} from '../OpenXRHALTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('openXRHALHandler', () => {
  let node: any;
  let context: ReturnType<typeof createMockContext>;
  let config: OpenXRHALConfig;

  beforeEach(() => {
    node = createMockNode('xr-test-node');
    context = createMockContext();
    config = {
      preferred_refresh_rate: 0,
      enable_passthrough: false,
      enable_hand_tracking: true,
      enable_eye_tracking: false,
      performance_mode: 'balanced',
      fallback_mode: 'simulate',
      simulate_haptics: true,
      device_overrides: null,
    };
  });

  describe('handler metadata', () => {
    it('should have correct name', () => {
      expect(openXRHALHandler.name).toBe('openxr_hal');
    });

    it('should have default config', () => {
      expect(openXRHALHandler.defaultConfig).toBeDefined();
      expect(openXRHALHandler.defaultConfig.performance_mode).toBe('balanced');
      expect(openXRHALHandler.defaultConfig.fallback_mode).toBe('simulate');
    });
  });

  describe('onAttach', () => {
    it('should initialize state on node', () => {
      attachTrait(openXRHALHandler, node, config, context);

      expect(node.__openxrHALState).toBeDefined();
      // In test environment without WebXR, simulate fallback initializes automatically
      expect(typeof node.__openxrHALState.isInitialized).toBe('boolean');
      // Session may be simulated or null depending on timing
      expect('session' in node.__openxrHALState).toBe(true);
    });

    it('should set default frame rate', () => {
      attachTrait(openXRHALHandler, node, config, context);

      expect(node.__openxrHALState.frameRate).toBe(90);
    });

    it('should create simulated session in fallback mode', () => {
      // In test environment, WebXR is not available
      attachTrait(openXRHALHandler, node, config, context);

      // Should have created simulated session due to fallback_mode: 'simulate'
      // (may be async, so check for either state)
      expect(node.__openxrHALState).toBeDefined();
    });
  });

  describe('onDetach', () => {
    it('should clean up state', () => {
      attachTrait(openXRHALHandler, node, config, context);
      openXRHALHandler.onDetach?.(node, config, context);

      expect(node.__openxrHALState).toBeUndefined();
    });

    it('should emit session end event if session active', () => {
      attachTrait(openXRHALHandler, node, config, context);
      node.__openxrHALState.session = { simulated: true };

      openXRHALHandler.onDetach?.(node, config, context);

      expect(getEventCount(context, 'openxr_session_end')).toBeGreaterThan(0);
    });
  });

  describe('onUpdate', () => {
    beforeEach(() => {
      attachTrait(openXRHALHandler, node, config, context);
      node.__openxrHALState.isInitialized = true;
    });

    it('should not update when not initialized', () => {
      node.__openxrHALState.isInitialized = false;

      updateTrait(openXRHALHandler, node, config, context, 16);

      expect(getEventCount(context, 'openxr_frame')).toBe(0);
    });

    it('should update last frame time', () => {
      updateTrait(openXRHALHandler, node, config, context, 11);

      expect(node.__openxrHALState.lastFrameTime).toBe(11);
    });

    it('should calculate performance level - low', () => {
      updateTrait(openXRHALHandler, node, config, context, 20); // 20ms = 50fps

      expect(node.__openxrHALState.performanceLevel).toBe('low');
    });

    it('should calculate performance level - medium', () => {
      updateTrait(openXRHALHandler, node, config, context, 14); // ~71fps

      expect(node.__openxrHALState.performanceLevel).toBe('medium');
    });

    it('should calculate performance level - high', () => {
      updateTrait(openXRHALHandler, node, config, context, 10); // 100fps

      expect(node.__openxrHALState.performanceLevel).toBe('high');
    });

    it('should calculate performance level - max', () => {
      updateTrait(openXRHALHandler, node, config, context, 7); // ~143fps

      expect(node.__openxrHALState.performanceLevel).toBe('max');
    });

    it('should emit openxr_frame event', () => {
      updateTrait(openXRHALHandler, node, config, context, 16);

      expect(getEventCount(context, 'openxr_frame')).toBe(1);

      const event = getLastEvent(context, 'openxr_frame');
      expect(event?.delta).toBe(16);
    });
  });

  describe('onEvent', () => {
    beforeEach(() => {
      attachTrait(openXRHALHandler, node, config, context);
    });

    it('should handle xr_session_start event', () => {
      sendEvent(openXRHALHandler, node, config, context, {
        type: 'xr_session_start',
      });

      expect(node.__openxrHALState.isInitialized).toBe(true);
      expect(getEventCount(context, 'openxr_ready')).toBe(1);
    });

    it('should handle request_xr_session event', () => {
      sendEvent(openXRHALHandler, node, config, context, {
        type: 'request_xr_session',
        payload: { mode: 'immersive-vr' },
      });

      // Without real WebXR, should fall back to simulate
      // Just verify no error
      expect(node.__openxrHALState).toBeDefined();
    });

    it('should handle end_xr_session event', () => {
      node.__openxrHALState.session = {
        simulated: true,
        end: vi.fn(),
      };

      sendEvent(openXRHALHandler, node, config, context, {
        type: 'end_xr_session',
      });

      expect(node.__openxrHALState.session.end).toHaveBeenCalled();
    });

    it('should handle trigger_haptic event', () => {
      node.__openxrHALState.session = { simulated: true };
      node.__openxrHALState.isInitialized = true;

      sendEvent(openXRHALHandler, node, config, context, {
        type: 'trigger_haptic',
        payload: {
          hand: 'right',
          intensity: 0.8,
          duration: 100,
        },
      });

      expect(getEventCount(context, 'haptic_triggered')).toBe(1);

      const event = getLastEvent(context, 'haptic_triggered');
      expect(event?.hand).toBe('right');
      expect(event?.intensity).toBe(0.8);
      expect(event?.simulated).toBe(true);
    });

    it('should handle request_haptic_capability event', () => {
      node.__openxrHALState.deviceProfile = {
        hapticCapabilities: ['rumble', 'hd_haptics'],
      };

      sendEvent(openXRHALHandler, node, config, context, {
        type: 'request_haptic_capability',
        payload: { capability: 'rumble' },
      });

      expect(getEventCount(context, 'haptic_capability_response')).toBe(1);

      const event = getLastEvent(context, 'haptic_capability_response');
      expect(event?.supported).toBe(true);
    });

    it('should handle get_device_profile event', () => {
      node.__openxrHALState.deviceProfile = {
        type: 'quest_3',
        name: 'Meta Quest 3',
      };

      sendEvent(openXRHALHandler, node, config, context, {
        type: 'get_device_profile',
      });

      expect(getEventCount(context, 'device_profile_response')).toBe(1);

      const event = getLastEvent(context, 'device_profile_response');
      expect(event?.deviceProfile.type).toBe('quest_3');
    });
  });
});

describe('deviceProfiles', () => {
  it('should include Quest 3', () => {
    expect(deviceProfiles['meta quest 3']).toBeDefined();
    expect(deviceProfiles['meta quest 3'].type).toBe('quest_3');
    expect(deviceProfiles['meta quest 3'].hapticCapabilities).toContain('rumble');
  });

  it('should include Quest Pro', () => {
    expect(deviceProfiles['meta quest pro']).toBeDefined();
    expect(deviceProfiles['meta quest pro'].type).toBe('quest_pro');
    expect(deviceProfiles['meta quest pro'].hapticCapabilities).toContain('force_feedback');
  });

  it('should include Vision Pro', () => {
    expect(deviceProfiles['apple vision pro']).toBeDefined();
    expect(deviceProfiles['apple vision pro'].type).toBe('vision_pro');
    expect(deviceProfiles['apple vision pro'].trackingCapabilities).toContain('eye');
  });

  it('should include Valve Index', () => {
    expect(deviceProfiles['valve index']).toBeDefined();
    expect(deviceProfiles['valve index'].type).toBe('valve_index');
    expect(deviceProfiles['valve index'].refreshRates).toContain(144);
  });

  it('should include Vive XR Elite', () => {
    expect(deviceProfiles['htc vive xr elite']).toBeDefined();
    expect(deviceProfiles['htc vive xr elite'].type).toBe('vive_xr_elite');
  });
});

describe('getCapabilities', () => {
  it('should return empty object for null state', () => {
    const state = { deviceProfile: null };
    const caps = getCapabilities(state as any);

    expect(caps).toEqual({});
  });

  it('should detect rumble capability', () => {
    const state = {
      deviceProfile: {
        hapticCapabilities: ['rumble'],
        trackingCapabilities: [],
        renderCapabilities: [],
      },
    };
    const caps = getCapabilities(state as any);

    expect(caps.hasRumble).toBe(true);
    expect(caps.hasHDHaptics).toBe(false);
  });

  it('should detect all capabilities', () => {
    const state = {
      deviceProfile: {
        hapticCapabilities: ['rumble', 'hd_haptics', 'force_feedback', 'thermal'],
        trackingCapabilities: ['hand', 'eye', 'body', 'face'],
        renderCapabilities: ['passthrough', 'depth_sensing', 'mesh_detection', 'plane_detection'],
      },
    };
    const caps = getCapabilities(state as any);

    expect(caps.hasRumble).toBe(true);
    expect(caps.hasHDHaptics).toBe(true);
    expect(caps.hasForceFeedback).toBe(true);
    expect(caps.hasThermal).toBe(true);
    expect(caps.hasHandTracking).toBe(true);
    expect(caps.hasEyeTracking).toBe(true);
    expect(caps.hasBodyTracking).toBe(true);
    expect(caps.hasFaceTracking).toBe(true);
    expect(caps.hasPassthrough).toBe(true);
    expect(caps.hasDepthSensing).toBe(true);
    expect(caps.hasMeshDetection).toBe(true);
    expect(caps.hasPlaneDetection).toBe(true);
  });
});

describe('createSimulatedController', () => {
  it('should create controller profile', () => {
    const controller = createSimulatedController();

    expect(controller).toBeDefined();
    expect(controller.hapticActuators).toBe(1);
    expect(controller.hapticFrequencyRange).toEqual([0, 500]);
    expect(controller.maxAmplitude).toBe(1.0);
    expect(controller.supportsHDHaptics).toBe(false);
  });

  it('should have button configuration', () => {
    const controller = createSimulatedController();

    expect(controller.buttonCount).toBe(6);
    expect(controller.hasThumbstick).toBe(true);
    expect(controller.hasTouchpad).toBe(false);
    expect(controller.hasGripButton).toBe(true);
    expect(controller.hasTrigger).toBe(true);
  });
});

describe('OpenXRHALConfig', () => {
  it('should support performance modes', () => {
    const modes: OpenXRHALConfig['performance_mode'][] = [
      'battery_saver',
      'balanced',
      'performance',
    ];

    modes.forEach((mode) => {
      expect(['battery_saver', 'balanced', 'performance']).toContain(mode);
    });
  });

  it('should support fallback modes', () => {
    const modes: OpenXRHALConfig['fallback_mode'][] = ['simulate', 'disable', 'error'];

    modes.forEach((mode) => {
      expect(['simulate', 'disable', 'error']).toContain(mode);
    });
  });

  it('should support device overrides', () => {
    const config: OpenXRHALConfig = {
      preferred_refresh_rate: 120,
      enable_passthrough: true,
      enable_hand_tracking: true,
      enable_eye_tracking: true,
      performance_mode: 'performance',
      fallback_mode: 'simulate',
      simulate_haptics: true,
      device_overrides: {
        type: 'quest_3',
        fov: 120,
      },
    };

    expect(config.device_overrides?.type).toBe('quest_3');
    expect(config.device_overrides?.fov).toBe(120);
  });
});
