// @vitest-environment jsdom
/**
 * useXRSession.test.ts
 * Tests for WebXR session management hook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useXRSession, type XRMode } from '../useXRSession';

describe('useXRSession', () => {
  let mockXR: any;
  let mockSession: any;
  let sessionEndCallbacks: Function[];

  beforeEach(() => {
    sessionEndCallbacks = [];

    // Mock XRSession
    mockSession = {
      end: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn((event: string, callback: Function) => {
        if (event === 'end') {
          sessionEndCallbacks.push(callback);
        }
      }),
      removeEventListener: vi.fn(),
    };

    // Mock navigator.xr
    mockXR = {
      isSessionSupported: vi.fn(),
      requestSession: vi.fn(),
    };

    Object.defineProperty(navigator, 'xr', {
      value: mockXR,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    sessionEndCallbacks = [];
  });

  describe('XR Support Detection', () => {
    it('should detect when WebXR is not available', async () => {
      Object.defineProperty(navigator, 'xr', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      expect(result.current.supported).toEqual([]);
      expect(result.current.activeMode).toBeNull();
    });

    it('should detect VR support', async () => {
      mockXR.isSessionSupported.mockImplementation(async (mode: string) => {
        return mode === 'immersive-vr';
      });

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      expect(result.current.supported).toContain('immersive-vr');
      expect(result.current.supported).not.toContain('immersive-ar');
    });

    it('should detect AR support', async () => {
      mockXR.isSessionSupported.mockImplementation(async (mode: string) => {
        return mode === 'immersive-ar';
      });

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      expect(result.current.supported).toContain('immersive-ar');
      expect(result.current.supported).not.toContain('immersive-vr');
    });

    it('should detect both VR and AR support', async () => {
      mockXR.isSessionSupported.mockResolvedValue(true);

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      expect(result.current.supported).toContain('immersive-vr');
      expect(result.current.supported).toContain('immersive-ar');
      expect(result.current.supported).toHaveLength(2);
    });

    it('should detect no XR support', async () => {
      mockXR.isSessionSupported.mockResolvedValue(false);

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      expect(result.current.supported).toEqual([]);
    });

    it('should handle support detection errors gracefully', async () => {
      mockXR.isSessionSupported.mockRejectedValue(new Error('Detection failed'));

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      expect(result.current.supported).toEqual([]);
    });

    it('should start with checking state', () => {
      mockXR.isSessionSupported.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 100))
      );

      const { result } = renderHook(() => useXRSession());

      expect(result.current.checking).toBe(true);
    });
  });

  describe('Request Session', () => {
    beforeEach(async () => {
      mockXR.isSessionSupported.mockResolvedValue(true);
      mockXR.requestSession.mockResolvedValue(mockSession);
    });

    it('should request VR session', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      expect(mockXR.requestSession).toHaveBeenCalledWith('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'bounded-floor', 'anchors', 'depth-sensing'],
      });
      expect(result.current.activeMode).toBe('immersive-vr');
    });

    it('should request AR session', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.requestSession('immersive-ar');
      });

      expect(mockXR.requestSession).toHaveBeenCalledWith('immersive-ar', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'bounded-floor', 'anchors', 'depth-sensing'],
      });
      expect(result.current.activeMode).toBe('immersive-ar');
    });

    it('should not request session for "none" mode', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.requestSession('none');
      });

      expect(mockXR.requestSession).not.toHaveBeenCalled();
      expect(result.current.activeMode).toBeNull();
    });

    it('should throw error when WebXR not available', async () => {
      Object.defineProperty(navigator, 'xr', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.requestSession('immersive-vr');
        });
      }).rejects.toThrow('WebXR not available');
    });

    it('should set up session end listener', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      expect(mockSession.addEventListener).toHaveBeenCalledWith('end', expect.any(Function));
    });

    it('should update state when session ends', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      expect(result.current.activeMode).toBe('immersive-vr');

      // Trigger session end
      act(() => {
        sessionEndCallbacks.forEach((cb) => cb());
      });

      expect(result.current.activeMode).toBeNull();
    });

    it('should handle session request errors', async () => {
      mockXR.requestSession.mockRejectedValue(new Error('Session request denied'));

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await expect(async () => {
        await act(async () => {
          await result.current.requestSession('immersive-vr');
        });
      }).rejects.toThrow('Session request denied');

      expect(result.current.activeMode).toBeNull();
    });
  });

  describe('End Session', () => {
    beforeEach(async () => {
      mockXR.isSessionSupported.mockResolvedValue(true);
      mockXR.requestSession.mockResolvedValue(mockSession);
    });

    it('should end active session', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      // Start session
      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      expect(result.current.activeMode).toBe('immersive-vr');

      // End session
      await act(async () => {
        await result.current.endSession();
      });

      expect(mockSession.end).toHaveBeenCalled();
    });

    it('should do nothing when no session active', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.endSession();
      });

      expect(mockSession.end).not.toHaveBeenCalled();
    });

    it('should handle session end errors', async () => {
      mockSession.end.mockRejectedValue(new Error('End failed'));

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      await expect(async () => {
        await act(async () => {
          await result.current.endSession();
        });
      }).rejects.toThrow('End failed');
    });
  });

  describe('Session State Management', () => {
    beforeEach(async () => {
      mockXR.isSessionSupported.mockResolvedValue(true);
      mockXR.requestSession.mockResolvedValue(mockSession);
    });

    it('should track active session mode', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      expect(result.current.activeMode).toBeNull();

      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      expect(result.current.activeMode).toBe('immersive-vr');
    });

    it('should switch between VR and AR sessions', async () => {
      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      // Start VR session
      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      expect(result.current.activeMode).toBe('immersive-vr');

      // Trigger VR session end
      act(() => {
        sessionEndCallbacks.forEach((cb) => cb());
      });
      sessionEndCallbacks = [];

      expect(result.current.activeMode).toBeNull();

      // Start AR session
      const newMockSession = { ...mockSession };
      mockXR.requestSession.mockResolvedValue(newMockSession);

      await act(async () => {
        await result.current.requestSession('immersive-ar');
      });

      expect(result.current.activeMode).toBe('immersive-ar');
    });

    it('should maintain state across re-renders', async () => {
      const { result, rerender } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      const activeModeBefore = result.current.activeMode;

      rerender();

      expect(result.current.activeMode).toBe(activeModeBefore);
      expect(result.current.activeMode).toBe('immersive-vr');
    });
  });

  describe('Initial State', () => {
    it('should initialize with correct defaults', () => {
      // Don't wait for support detection
      mockXR.isSessionSupported.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useXRSession());

      expect(result.current.supported).toEqual([]);
      expect(result.current.activeMode).toBeNull();
      expect(result.current.checking).toBe(true);
      expect(typeof result.current.requestSession).toBe('function');
      expect(typeof result.current.endSession).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple simultaneous support checks', async () => {
      let resolveChecks: Function[] = [];
      mockXR.isSessionSupported.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveChecks.push(() => resolve(true));
          })
      );

      const { result } = renderHook(() => useXRSession());

      expect(result.current.checking).toBe(true);

      // Resolve all checks
      await act(async () => {
        resolveChecks.forEach((resolve) => resolve());
        await new Promise((r) => setTimeout(r, 10));
      });

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      expect(result.current.supported).toHaveLength(2);
    });

    it('should handle session end callback multiple times', async () => {
      mockXR.isSessionSupported.mockResolvedValue(true);
      mockXR.requestSession.mockResolvedValue(mockSession);

      const { result } = renderHook(() => useXRSession());

      await waitFor(() => {
        expect(result.current.checking).toBe(false);
      });

      await act(async () => {
        await result.current.requestSession('immersive-vr');
      });

      expect(result.current.activeMode).toBe('immersive-vr');

      // Trigger end multiple times
      act(() => {
        sessionEndCallbacks.forEach((cb) => cb());
        sessionEndCallbacks.forEach((cb) => cb());
      });

      expect(result.current.activeMode).toBeNull();
    });
  });
});
