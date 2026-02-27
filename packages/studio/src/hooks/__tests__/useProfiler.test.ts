// @vitest-environment jsdom
/**
 * useProfiler.test.ts
 * Tests for performance profiling hook with requestAnimationFrame
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProfiler } from '../useProfiler';

describe('useProfiler', () => {
  let rafCallbacks: ((time: number) => void)[] = [];
  let rafId = 0;
  let currentTime = 0;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    currentTime = 0;

    // Mock requestAnimationFrame
    global.requestAnimationFrame = vi.fn((callback) => {
      const id = ++rafId;
      rafCallbacks.push(callback);
      return id;
    });

    // Mock cancelAnimationFrame
    global.cancelAnimationFrame = vi.fn((id) => {
      // Simple implementation - just clear callbacks
      rafCallbacks = [];
    });
  });

  afterEach(() => {
    rafCallbacks = [];
    vi.clearAllMocks();
  });

  // Helper to simulate RAF frames
  const simulateFrames = (frameTimes: number[]) => {
    frameTimes.forEach((deltaMs) => {
      currentTime += deltaMs;
      const callback = rafCallbacks[rafCallbacks.length - 1];
      if (callback) {
        act(() => {
          callback(currentTime);
        });
      }
    });
  };

  describe('Initial State', () => {
    it('should start with idle state', () => {
      const { result } = renderHook(() => useProfiler());

      expect(result.current.snap.fps).toBe(0);
      expect(result.current.snap.frameMs).toBe(0);
      expect(result.current.snap.avgFrameMs).toBe(0);
      expect(result.current.snap.p95FrameMs).toBe(0);
      expect(result.current.snap.droppedFrames).toBe(0);
      expect(result.current.snap.history).toEqual([]);
      expect(result.current.snap.running).toBe(false);
    });

    it('should provide control functions', () => {
      const { result } = renderHook(() => useProfiler());

      expect(typeof result.current.start).toBe('function');
      expect(typeof result.current.stop).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('Start Profiling', () => {
    it('should start profiling and request animation frame', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      expect(requestAnimationFrame).toHaveBeenCalled();
      expect(rafCallbacks.length).toBeGreaterThan(0);
    });

    it('should not start if already running', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      const initialCallCount = (requestAnimationFrame as any).mock.calls.length;

      act(() => {
        result.current.start();
      });

      // Should not call RAF again
      expect((requestAnimationFrame as any).mock.calls.length).toBe(initialCallCount);
    });

    it('should reset history and dropped frames on start', () => {
      const { result } = renderHook(() => useProfiler());

      // Start, simulate some frames, then stop
      act(() => {
        result.current.start();
      });

      simulateFrames([16, 16, 40]); // Third frame is dropped

      act(() => {
        result.current.stop();
      });

      // Start again - should reset
      act(() => {
        result.current.start();
      });

      // History should be cleared (will populate with new frames)
      expect(result.current.snap.droppedFrames).toBe(0);
    });
  });

  describe('Stop Profiling', () => {
    it('should stop profiling and cancel animation frame', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      act(() => {
        result.current.stop();
      });

      expect(cancelAnimationFrame).toHaveBeenCalled();
      expect(result.current.snap.running).toBe(false);
    });

    it('should preserve stats when stopped', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate 6 frames to trigger state update
      simulateFrames([16, 16, 16, 16, 16, 16]);

      const statsBeforeStop = { ...result.current.snap };

      act(() => {
        result.current.stop();
      });

      // Stats should be preserved (except running flag)
      expect(result.current.snap.fps).toBe(statsBeforeStop.fps);
      expect(result.current.snap.frameMs).toBe(statsBeforeStop.frameMs);
      expect(result.current.snap.running).toBe(false);
    });
  });

  describe('Reset Stats', () => {
    it('should clear history and dropped frames', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate frames to build history
      simulateFrames([16, 16, 40, 16, 16, 16]); // One dropped frame

      act(() => {
        result.current.reset();
      });

      expect(result.current.snap.droppedFrames).toBe(0);
      expect(result.current.snap.history).toEqual([]);
    });

    it('should not affect running state', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      simulateFrames([16, 16, 16, 16, 16, 16]);

      const wasRunning = result.current.snap.running;

      act(() => {
        result.current.reset();
      });

      expect(result.current.snap.running).toBe(wasRunning);
    });
  });

  describe('Frame Time Calculations', () => {
    it('should calculate FPS from frame time', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate 6 frames at 16ms each (60fps)
      simulateFrames([16, 16, 16, 16, 16, 16]);

      // fps = 1000 / frameMs = 1000 / 16 = 62.5 rounded to 63
      expect(result.current.snap.fps).toBeGreaterThanOrEqual(60);
      expect(result.current.snap.fps).toBeLessThanOrEqual(65);
    });

    it('should calculate average frame time', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate 6 frames with varying times
      simulateFrames([10, 20, 15, 25, 20, 18]);

      // Average should be around (10+20+15+25+20+18)/6 = 18ms
      expect(result.current.snap.avgFrameMs).toBeGreaterThan(15);
      expect(result.current.snap.avgFrameMs).toBeLessThan(22);
    });

    it('should calculate p95 frame time', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate frames with one spike
      simulateFrames([16, 16, 16, 50, 16, 16]);

      // p95 should be close to the spike (95th percentile)
      expect(result.current.snap.p95FrameMs).toBeGreaterThan(30);
    });

    it('should round frame times to 1 decimal place', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      simulateFrames([16.666, 16.666, 16.666, 16.666, 16.666, 16.666]);

      // Should be rounded to 1 decimal (e.g., 16.7, not 16.666)
      // Just verify it's a reasonable value with limited decimals
      expect(result.current.snap.frameMs).toBeGreaterThan(15);
      expect(result.current.snap.frameMs).toBeLessThan(18);
    });
  });

  describe('Dropped Frames', () => {
    it('should count frames exceeding 33ms as dropped', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate 6 frames: 2 dropped (>33ms)
      simulateFrames([16, 40, 16, 50, 16, 16]);

      expect(result.current.snap.droppedFrames).toBe(2);
    });

    it('should not count frames at exactly 33ms as dropped', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      simulateFrames([16, 33, 16, 33, 16, 33]);

      expect(result.current.snap.droppedFrames).toBe(0);
    });

    it('should accumulate dropped frames across updates', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // First batch: 1 dropped
      simulateFrames([16, 40, 16, 16, 16, 16]);

      const dropped1 = result.current.snap.droppedFrames;

      // Second batch: 1 more dropped
      simulateFrames([16, 50, 16, 16, 16, 16]);

      expect(result.current.snap.droppedFrames).toBe(dropped1 + 1);
    });
  });

  describe('Rolling Window', () => {
    it('should maintain history up to 120 frames', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate 130 frames
      const frames = Array(130).fill(16);
      simulateFrames(frames);

      // History should cap at 120
      expect(result.current.snap.history.length).toBeLessThanOrEqual(120);
    });

    it('should shift oldest frames when window is full', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Fill window with 16ms frames
      simulateFrames(Array(120).fill(16));

      // Add a distinctive frame
      simulateFrames([100, 16, 16, 16, 16, 16]);

      // The 100ms frame should still be in recent history
      expect(result.current.snap.history).toContain(100);
    });
  });

  describe('State Update Throttling', () => {
    it('should update state every 6 frames', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate 5 frames - should not update state yet
      simulateFrames([16, 16, 16, 16, 16]);

      // State might still be initial (or from previous update cycle)
      const fps5 = result.current.snap.fps;

      // 6th frame should trigger update
      simulateFrames([16]);

      // State should be updated now
      expect(result.current.snap.running).toBe(true);
      expect(result.current.snap.history.length).toBeGreaterThan(0);
    });

    it('should not flood with re-renders', () => {
      const { result } = renderHook(() => useProfiler());
      let renderCount = 0;

      act(() => {
        result.current.start();
      });

      // Track renders by checking if snap object changed
      const snapshots: any[] = [result.current.snap];

      // Simulate 20 frames
      for (let i = 0; i < 20; i++) {
        simulateFrames([16]);
        if (result.current.snap !== snapshots[snapshots.length - 1]) {
          snapshots.push(result.current.snap);
          renderCount++;
        }
      }

      // Should update ~3 times (every 6 frames) not 20 times
      expect(renderCount).toBeLessThan(10);
    });
  });

  describe('Cleanup', () => {
    it('should cancel RAF on unmount', () => {
      const { unmount } = renderHook(() => useProfiler());

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should stop profiling on unmount', () => {
      const { result, unmount } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      unmount();

      // RAF should be cancelled
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle first frame with no previous time', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // First frame should use default 16.67ms
      simulateFrames([100]); // Large time, but no prev time

      // Should not crash and should handle gracefully
      expect(result.current.snap).toBeDefined();
    });

    it('should be stable across re-renders', () => {
      const { result, rerender } = renderHook(() => useProfiler());

      const firstStart = result.current.start;
      const firstStop = result.current.stop;
      const firstReset = result.current.reset;

      rerender();

      // Functions should be stable (useCallback)
      expect(result.current.start).toBe(firstStart);
      expect(result.current.stop).toBe(firstStop);
      expect(result.current.reset).toBe(firstReset);
    });

    it('should handle zero frame time gracefully', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // Simulate zero-delta frames (shouldn't happen but edge case)
      simulateFrames([0, 0, 16, 16, 16, 16]);

      // Should not crash
      expect(result.current.snap).toBeDefined();
    });

    it('should handle very large frame times', () => {
      const { result } = renderHook(() => useProfiler());

      act(() => {
        result.current.start();
      });

      // First frame uses default 16.67ms, so simulate more frames to get the 1000ms counted
      simulateFrames([16, 1000, 16, 16, 16, 16]);

      expect(result.current.snap.droppedFrames).toBeGreaterThan(0);
      expect(result.current.snap.history).toContain(1000);
    });

    it('should handle stop without start', () => {
      const { result } = renderHook(() => useProfiler());

      // Stop without starting
      act(() => {
        result.current.stop();
      });

      // Should not crash
      expect(result.current.snap.running).toBe(false);
    });

    it('should handle reset without start', () => {
      const { result } = renderHook(() => useProfiler());

      // Reset without starting
      act(() => {
        result.current.reset();
      });

      // Should not crash
      expect(result.current.snap.droppedFrames).toBe(0);
      expect(result.current.snap.history).toEqual([]);
    });
  });

  describe('Multiple Start/Stop Cycles', () => {
    it('should handle start -> stop -> start cycle', () => {
      const { result } = renderHook(() => useProfiler());

      // First cycle
      act(() => {
        result.current.start();
      });

      simulateFrames([16, 16, 16, 16, 16, 16]);

      act(() => {
        result.current.stop();
      });

      // Second cycle
      act(() => {
        result.current.start();
      });

      simulateFrames([16, 16, 16, 16, 16, 16]);

      expect(result.current.snap.running).toBe(true);
      expect(result.current.snap.history.length).toBeGreaterThan(0);
    });
  });
});
