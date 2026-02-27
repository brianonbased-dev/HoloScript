// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useREPL, type TraceEntry } from '../useREPL';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useREPL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should initialize with empty code', () => {
      const { result } = renderHook(() => useREPL());
      expect(result.current.code).toBe('');
    });

    it('should initialize with empty trace', () => {
      const { result } = renderHook(() => useREPL());
      expect(result.current.trace).toEqual([]);
    });

    it('should initialize with idle status', () => {
      const { result } = renderHook(() => useREPL());
      expect(result.current.status).toBe('idle');
    });

    it('should initialize with no error', () => {
      const { result } = renderHook(() => useREPL());
      expect(result.current.error).toBeNull();
    });
  });

  describe('Code Management', () => {
    it('should update code via setCode', () => {
      const { result } = renderHook(() => useREPL());

      act(() => {
        result.current.setCode('scene Main {}');
      });

      expect(result.current.code).toBe('scene Main {}');
    });

    it('should allow multiple code updates', () => {
      const { result } = renderHook(() => useREPL());

      act(() => {
        result.current.setCode('scene Main {}');
      });
      expect(result.current.code).toBe('scene Main {}');

      act(() => {
        result.current.setCode('scene Test { box(); }');
      });
      expect(result.current.code).toBe('scene Test { box(); }');
    });
  });

  describe('Manual Run', () => {
    it('should send code to /api/repl on run', async () => {
      const mockTrace: TraceEntry[] = [
        { step: 1, type: 'scene', name: 'Main', message: 'Scene created', timeMs: 0 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('scene Main {}');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/repl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'scene Main {}' }),
      });
    });

    it('should set trace from API response', async () => {
      const mockTrace: TraceEntry[] = [
        { step: 1, type: 'scene', name: 'Main', message: 'Scene created', timeMs: 0 },
        { step: 2, type: 'object', name: 'box', message: 'Object created', timeMs: 5 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('scene Main { box(); }');
      });

      expect(result.current.trace).toEqual(mockTrace);
    });

    it('should set status to "idle" after successful run', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: [] }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('scene Main {}');
      });

      expect(result.current.status).toBe('idle');
    });

    it('should clear previous error on run', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Syntax error' }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('invalid code');
      });

      expect(result.current.error).toBeTruthy();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: [] }),
      });

      await act(async () => {
        await result.current.run('scene Main {}');
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should set status to "error" on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Syntax error' }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('invalid code');
      });

      expect(result.current.status).toBe('error');
    });

    it('should set error message from API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Syntax error on line 1' }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('invalid code');
      });

      expect(result.current.error).toBe('Error: Syntax error on line 1');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('scene Main {}');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('Network error');
    });

    it('should handle missing error message in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('invalid code');
      });

      expect(result.current.error).toBe('Error: REPL error');
    });
  });

  describe('Auto-Run with Debounce', () => {
    it('should not auto-run when autoRunMs is not set', async () => {
      const { result } = renderHook(() => useREPL());

      act(() => {
        result.current.setCode('scene Main {}');
      });

      vi.advanceTimersByTime(5000);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should auto-run after debounce delay', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ trace: [] }),
      });

      const { result } = renderHook(() => useREPL({ autoRunMs: 500 }));

      act(() => {
        result.current.setCode('scene Main {}');
      });

      // Advance delay and run all timers
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledWith('/api/repl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'scene Main {}' }),
      });
    });

    it('should debounce multiple rapid code changes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ trace: [] }),
      });

      const { result } = renderHook(() => useREPL({ autoRunMs: 500 }));

      act(() => {
        result.current.setCode('scene Main {}');
      });

      vi.advanceTimersByTime(200);

      act(() => {
        result.current.setCode('scene Main { box(); }');
      });

      vi.advanceTimersByTime(200);

      act(() => {
        result.current.setCode('scene Main { box(); sphere(); }');
      });

      // Run all pending timers
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should have sent last code
      expect(mockFetch).toHaveBeenCalledWith('/api/repl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'scene Main { box(); sphere(); }' }),
      });
    });

    it('should cancel debounce timer on unmount', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ trace: [] }),
      });

      const { result, unmount } = renderHook(() => useREPL({ autoRunMs: 500 }));

      act(() => {
        result.current.setCode('scene Main {}');
      });

      unmount();

      vi.advanceTimersByTime(500);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty trace in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: [] }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('scene Main {}');
      });

      expect(result.current.trace).toEqual([]);
    });

    it('should handle missing trace in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('scene Main {}');
      });

      expect(result.current.trace).toEqual([]);
    });

    it('should handle complex trace with multiple entry types', async () => {
      const mockTrace: TraceEntry[] = [
        { step: 1, type: 'scene', name: 'Main', message: 'Scene created', timeMs: 0 },
        { step: 2, type: 'object', name: 'box', props: { size: '1' }, message: 'Object created', timeMs: 5 },
        { step: 3, type: 'trait', trait: 'red', message: 'Trait applied', timeMs: 10 },
        { step: 4, type: 'error', message: 'Warning: deprecated', timeMs: 15 },
        { step: 5, type: 'info', message: 'Compilation complete', timeMs: 20 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: mockTrace }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('scene Main { box() { red(); } }');
      });

      expect(result.current.trace).toEqual(mockTrace);
    });

    it('should allow running with empty code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trace: [] }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/repl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '' }),
      });
    });

    it('should handle multiple sequential runs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ trace: [] }),
      });

      const { result } = renderHook(() => useREPL());

      await act(async () => {
        await result.current.run('scene Main {}');
      });

      await act(async () => {
        await result.current.run('scene Test {}');
      });

      await act(async () => {
        await result.current.run('scene Final {}');
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
