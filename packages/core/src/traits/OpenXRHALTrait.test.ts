import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openXRHALHandler, OpenXRHALConfig } from './OpenXRHALTrait';

describe('OpenXRHALTrait', () => {
  let mockNode: any;
  let mockContext: any;
  let mockXR: any;
  let mockSession: any;

  beforeEach(() => {
    mockNode = { name: 'xr-rig' };
    mockContext = {
      emit: vi.fn(),
    };

    mockSession = {
      addEventListener: vi.fn(),
      updateTargetFrameRate: vi.fn(),
      end: vi.fn(),
      inputSources: [],
      requestReferenceSpace: vi.fn().mockResolvedValue({}),
    };

    mockXR = {
      isSessionSupported: vi.fn().mockResolvedValue(true),
      requestSession: vi.fn().mockResolvedValue(mockSession),
    };

    // Mock global navigator
    vi.stubGlobal('navigator', { xr: mockXR });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should check XR support on attach', async () => {
    const config: OpenXRHALConfig = {
      preferred_refresh_rate: 90,
      enable_passthrough: false,
      enable_hand_tracking: true,
      enable_eye_tracking: false,
      performance_mode: 'balanced',
      fallback_mode: 'simulate',
      simulate_haptics: true,
      device_overrides: null,
    };

    openXRHALHandler.onAttach!(mockNode, config, mockContext);

    // Wait for promise
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockXR.isSessionSupported).toHaveBeenCalledWith('immersive-vr');
    expect(mockContext.emit).toHaveBeenCalledWith('openxr_available', expect.any(Object));
  });

  it('should request XR session', async () => {
    const config: OpenXRHALConfig = {
      preferred_refresh_rate: 90,
      enable_passthrough: false,
      enable_hand_tracking: true,
      enable_eye_tracking: false,
      performance_mode: 'balanced',
      fallback_mode: 'simulate',
      simulate_haptics: true,
      device_overrides: null,
    };

    openXRHALHandler.onAttach!(mockNode, config, mockContext);

    // Trigger request
    await openXRHALHandler.onEvent!(mockNode, config, mockContext, {
      type: 'request_xr_session',
      payload: { mode: 'immersive-vr' },
    } as any);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockXR.requestSession).toHaveBeenCalledWith(
      'immersive-vr',
      expect.objectContaining({
        optionalFeatures: ['hand-tracking'],
      })
    );

    expect(mockContext.emit).toHaveBeenCalledWith('openxr_session_start', expect.any(Object));
  });

  it('should fallback to simulation if XR missing', async () => {
    // Remove XR
    vi.stubGlobal('navigator', {});

    const config: OpenXRHALConfig = {
      preferred_refresh_rate: 90,
      enable_passthrough: false,
      enable_hand_tracking: true,
      enable_eye_tracking: false,
      performance_mode: 'balanced',
      fallback_mode: 'simulate',
      simulate_haptics: true,
      device_overrides: null,
    };

    openXRHALHandler.onAttach!(mockNode, config, mockContext);

    // request session
    await openXRHALHandler.onEvent!(mockNode, config, mockContext, {
      type: 'request_xr_session',
    } as any);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = (mockNode as any).__openxrHALState;
    expect(state.session.simulated).toBe(true);
    expect(mockContext.emit).toHaveBeenCalledWith('openxr_simulated', expect.any(Object));
  });
});
