// @vitest-environment jsdom
/**
 * useDebugger.test.ts
 * Tests for step-through HoloScript debugger hook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebugger, type DebugFrame, type DebugVar } from '../useDebugger';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useDebugger', () => {
  const mockFrames: DebugFrame[] = [
    { index: 0, line: 1, type: 'scene', label: 'Main', isBreakpoint: false },
    { index: 1, line: 2, type: 'object', label: 'box', detail: 'name: "test"', isBreakpoint: false },
    { index: 2, line: 3, type: 'property', label: 'color', detail: 'red', isBreakpoint: false },
  ];

  const mockVariables: DebugVar[] = [
    { name: 'x', type: 'number', value: '10', scope: 'global' },
    { name: 'y', type: 'number', value: '20', scope: 'scene' },
  ];

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should start with empty state', () => {
      const { result } = renderHook(() => useDebugger());

      expect(result.current.frames).toEqual([]);
      expect(result.current.currentFrame).toBe(-1);
      expect(result.current.variables).toEqual([]);
      expect(result.current.breakpoints).toEqual([]);
      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBeNull();
    });

    it('should provide debug functions', () => {
      const { result } = renderHook(() => useDebugger());

      expect(typeof result.current.start).toBe('function');
      expect(typeof result.current.step).toBe('function');
      expect(typeof result.current.cont).toBe('function');
      expect(typeof result.current.reset).toBe('function');
      expect(typeof result.current.toggleBreakpoint).toBe('function');
    });
  });

  describe('Start Debugging', () => {
    it('should start debug session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: mockVariables,
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.start('scene Main { box(); }');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'scene Main { box(); }',
          breakpoints: [],
          action: 'start',
          currentFrame: -1,
        }),
      });

      expect(result.current.frames).toEqual(mockFrames);
      expect(result.current.currentFrame).toBe(0);
      expect(result.current.variables).toEqual(mockVariables);
      expect(result.current.status).toBe('paused');
    });

    it('should start with breakpoints', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: [],
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      // Set breakpoints first
      act(() => {
        result.current.toggleBreakpoint(2);
        result.current.toggleBreakpoint(5);
      });

      await act(async () => {
        await result.current.start('scene Main { box(); }');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'scene Main { box(); }',
          breakpoints: [2, 5],
          action: 'start',
          currentFrame: -1,
        }),
      });
    });

    it('should reset currentFrame to -1 when starting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: [],
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.start('scene Main { box(); }');
      });

      // Verify that start passes -1 as currentFrame
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.currentFrame).toBe(-1);
    });
  });

  describe('Step Debugging', () => {
    it('should step to next frame', async () => {
      const { result } = renderHook(() => useDebugger());

      // Start first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: mockVariables,
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.start('scene Main { box(); }');
      });

      // Step
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 1,
          variables: mockVariables,
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.step('scene Main { box(); }');
      });

      expect(result.current.currentFrame).toBe(1);
      expect(result.current.status).toBe('paused');
    });

    it('should use current frame when stepping', async () => {
      const { result } = renderHook(() => useDebugger());

      // Set up initial state
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 1,
          variables: [],
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.start('scene Main { box(); }');
      });

      // Step should pass current frame (1)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 2,
          variables: [],
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.step('scene Main { box(); }');
      });

      const callBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(callBody.currentFrame).toBe(1);
      expect(callBody.action).toBe('step');
    });
  });

  describe('Continue Debugging', () => {
    it('should continue to next breakpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 5,
          variables: mockVariables,
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.cont('scene Main { box(); sphere(); }');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'scene Main { box(); sphere(); }',
          breakpoints: [],
          action: 'continue',
          currentFrame: -1,
        }),
      });

      expect(result.current.currentFrame).toBe(5);
      expect(result.current.status).toBe('paused');
    });

    it('should finish when no more breakpoints', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: [],
          currentFrame: -1,
          variables: [],
          finished: true,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.cont('scene Main { box(); }');
      });

      expect(result.current.status).toBe('finished');
      expect(result.current.frames).toEqual([]);
    });
  });

  describe('Reset Debugging', () => {
    it('should reset debug session', async () => {
      const { result } = renderHook(() => useDebugger());

      // Start debugging first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 2,
          variables: mockVariables,
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.start('scene Main { box(); }');
      });

      expect(result.current.currentFrame).toBe(2);

      // Reset
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: [],
          currentFrame: -1,
          variables: [],
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.reset('scene Main { box(); }');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'scene Main { box(); }',
          breakpoints: [],
          action: 'reset',
          currentFrame: -1,
        }),
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.currentFrame).toBe(-1);
      expect(result.current.frames).toEqual([]);
    });

    it('should reset currentFrame to -1', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: [],
          currentFrame: -1,
          variables: [],
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.reset('scene Main {}');
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.currentFrame).toBe(-1);
      expect(callBody.action).toBe('reset');
    });
  });

  describe('Breakpoints', () => {
    it('should toggle breakpoint on', () => {
      const { result } = renderHook(() => useDebugger());

      act(() => {
        result.current.toggleBreakpoint(5);
      });

      expect(result.current.breakpoints).toEqual([5]);
    });

    it('should toggle breakpoint off', () => {
      const { result } = renderHook(() => useDebugger());

      act(() => {
        result.current.toggleBreakpoint(5);
        result.current.toggleBreakpoint(10);
      });

      expect(result.current.breakpoints).toEqual([5, 10]);

      act(() => {
        result.current.toggleBreakpoint(5);
      });

      expect(result.current.breakpoints).toEqual([10]);
    });

    it('should handle multiple breakpoints', () => {
      const { result } = renderHook(() => useDebugger());

      act(() => {
        result.current.toggleBreakpoint(1);
        result.current.toggleBreakpoint(5);
        result.current.toggleBreakpoint(10);
        result.current.toggleBreakpoint(15);
      });

      expect(result.current.breakpoints).toEqual([1, 5, 10, 15]);
    });

    it('should preserve breakpoints across debug sessions', async () => {
      const { result } = renderHook(() => useDebugger());

      act(() => {
        result.current.toggleBreakpoint(3);
      });

      // Start debugging
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: [],
          currentFrame: 0,
          variables: [],
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.start('scene Main {}');
      });

      // Breakpoints should still be there
      expect(result.current.breakpoints).toEqual([3]);
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.start('scene Main { box(); }');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Network error');
    });

    it('should handle non-Error thrown values', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.step('scene Main {}');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('String error');
    });

    it('should clear previous error on new debug action', async () => {
      const { result } = renderHook(() => useDebugger());

      // First call fails
      mockFetch.mockRejectedValueOnce(new Error('First error'));

      await act(async () => {
        await result.current.start('scene Main {}');
      });

      expect(result.current.error).toBe('First error');

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: [],
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.start('scene Main { box(); }');
      });

      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe('paused');
    });
  });

  describe('Status Transitions', () => {
    it('should transition to paused when not finished', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: [],
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.start('scene Main {}');
      });

      expect(result.current.status).toBe('paused');
    });

    it('should transition to finished when complete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: [],
          currentFrame: -1,
          variables: [],
          finished: true,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.cont('scene Main {}');
      });

      expect(result.current.status).toBe('finished');
    });

    it('should transition to idle on reset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: [],
          currentFrame: -1,
          variables: [],
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.reset('scene Main {}');
      });

      expect(result.current.status).toBe('idle');
    });

    it('should transition to error on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API error'));

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.start('scene Main {}');
      });

      expect(result.current.status).toBe('error');
    });
  });

  describe('Variables and Frames', () => {
    it('should update variables from API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: mockVariables,
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.start('scene Main {}');
      });

      expect(result.current.variables).toEqual(mockVariables);
    });

    it('should update frames from API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 1,
          variables: [],
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.step('scene Main {}');
      });

      expect(result.current.frames).toEqual(mockFrames);
      expect(result.current.currentFrame).toBe(1);
    });

    it('should handle empty variables', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: [],
          finished: false,
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.start('scene Main {}');
      });

      expect(result.current.variables).toEqual([]);
    });
  });

  describe('Multiple Debug Sessions', () => {
    it('should handle sequential debug sessions', async () => {
      const { result } = renderHook(() => useDebugger());

      // First session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames.slice(0, 1),
          currentFrame: 0,
          variables: [],
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.start('scene Main {}');
      });

      expect(result.current.frames).toEqual(mockFrames.slice(0, 1));

      // Second session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: mockVariables,
          finished: false,
        }),
      });

      await act(async () => {
        await result.current.start('scene Main { box(); sphere(); }');
      });

      expect(result.current.frames).toEqual(mockFrames);
      expect(result.current.variables).toEqual(mockVariables);
    });
  });

  describe('Edge Cases', () => {
    it('should be stable across re-renders', () => {
      const { result, rerender } = renderHook(() => useDebugger());

      const firstStart = result.current.start;
      const firstStep = result.current.step;
      const firstToggle = result.current.toggleBreakpoint;

      rerender();

      // toggleBreakpoint should be stable (useCallback with no deps)
      expect(result.current.toggleBreakpoint).toBe(firstToggle);

      // start and step depend on call, which depends on breakpoints and currentFrame
      // So they may change, but should still be functions
      expect(typeof result.current.start).toBe('function');
      expect(typeof result.current.step).toBe('function');
    });

    it('should handle API response with no finished field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          frames: mockFrames,
          currentFrame: 0,
          variables: [],
          // finished field missing
        }),
      });

      const { result } = renderHook(() => useDebugger());

      await act(async () => {
        await result.current.start('scene Main {}');
      });

      // Should treat as not finished (falsy)
      expect(result.current.status).toBe('paused');
    });
  });
});
