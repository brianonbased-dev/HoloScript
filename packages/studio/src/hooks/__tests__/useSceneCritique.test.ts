// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSceneCritique } from '../useSceneCritique';
import { useSceneStore } from '@/lib/stores';
import type { CritiqueResult } from '@/app/api/critique/route';

vi.mock('@/lib/stores', () => ({
  useSceneStore: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useSceneCritique', () => {
  let mockCode = 'scene Main { box(); }';

  beforeEach(() => {
    // Reset mockCode to default
    mockCode = 'scene Main { box(); }';
    mockFetch.mockClear();
    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = { code: mockCode };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should initialize with null result', () => {
      const { result } = renderHook(() => useSceneCritique());
      expect(result.current.result).toBeNull();
    });

    it('should initialize with loading false', () => {
      const { result } = renderHook(() => useSceneCritique());
      expect(result.current.loading).toBe(false);
    });

    it('should initialize with no error', () => {
      const { result } = renderHook(() => useSceneCritique());
      expect(result.current.error).toBeNull();
    });

    it('should initialize with isStale false', () => {
      const { result } = renderHook(() => useSceneCritique());
      expect(result.current.isStale).toBe(false);
    });
  });

  describe('Analyse Function', () => {
    it('should send code to /api/critique', async () => {
      const mockResult: CritiqueResult = {
        score: 85,
        suggestions: ['Add lighting', 'Use materials'],
        strengths: ['Good structure'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mockCode }),
      });
    });

    it('should set loading to false after analysis', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ score: 80, suggestions: [], strengths: [] }),
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.loading).toBe(false);
    });

    it('should set result from API response', async () => {
      const mockResult: CritiqueResult = {
        score: 92,
        suggestions: ['Add camera movement', 'Use post-processing'],
        strengths: ['Excellent composition', 'Good use of materials'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.result).toEqual(mockResult);
    });

    it('should update lastAnalysedLen after analysis', async () => {
      mockCode = 'scene Main { box(); sphere(); }';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ score: 80, suggestions: [], strengths: [] }),
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      // isStale should be false since code length matches
      expect(result.current.isStale).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should set error when code is empty', async () => {
      mockCode = '';

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.error).toBe('No code to analyse.');
    });

    it('should set error when code is only whitespace', async () => {
      mockCode = '   \n\t  ';

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.error).toBe('No code to analyse.');
    });

    it('should not call API when code is empty', async () => {
      mockCode = '';

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should set error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.error).toBe('Server error 500');
    });

    it('should set error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.error).toBe('Network timeout');
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.error).toBe('Unknown error');
    });

    it('should clear error on successful analysis', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.error).toBeTruthy();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ score: 80, suggestions: [], strengths: [] }),
      });

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Stale Detection', () => {
    it('should mark result as stale when code length changes', async () => {
      mockCode = 'scene Main { box(); }';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ score: 80, suggestions: [], strengths: [] }),
      });

      const { result, rerender } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.isStale).toBe(false);

      // Change code length
      mockCode = 'scene Main { box(); sphere(); }';
      rerender();

      expect(result.current.isStale).toBe(true);
    });

    it('should not mark as stale when code length is same', async () => {
      // Start with code of exactly 21 characters
      mockCode = 'scene Main { box(); }'; // 21 chars

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ score: 80, suggestions: [], strengths: [] }),
      });

      let currentCode = mockCode;
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: currentCode };
        return selector(state);
      });

      const { result, rerender } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.isStale).toBe(false);

      // Change to different code with same length (21 chars)
      currentCode = 'scene Test{ cube(); }'; // 21 chars
      rerender();

      expect(result.current.isStale).toBe(false);
    });

    it('should not mark as stale when no result exists', () => {
      mockCode = 'scene Main { box(); }';

      const { result, rerender } = renderHook(() => useSceneCritique());

      expect(result.current.isStale).toBe(false);

      mockCode = 'scene Main { box(); sphere(); }';
      rerender();

      expect(result.current.isStale).toBe(false);
    });

    it('should reset stale flag after re-analysis', async () => {
      mockCode = 'scene Main { box(); }';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ score: 80, suggestions: [], strengths: [] }),
      });

      const { result, rerender } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      mockCode = 'scene Main { box(); sphere(); }';
      rerender();

      expect(result.current.isStale).toBe(true);

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.isStale).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle critique with empty suggestions', async () => {
      const mockResult: CritiqueResult = {
        score: 100,
        suggestions: [],
        strengths: ['Perfect scene'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.result?.suggestions).toEqual([]);
    });

    it('should handle critique with empty strengths', async () => {
      const mockResult: CritiqueResult = {
        score: 30,
        suggestions: ['Improve everything'],
        strengths: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.result?.strengths).toEqual([]);
    });

    it('should handle multiple analyses with different results', async () => {
      const result1: CritiqueResult = {
        score: 70,
        suggestions: ['Add lighting'],
        strengths: ['Good start'],
      };

      const result2: CritiqueResult = {
        score: 85,
        suggestions: ['Add animation'],
        strengths: ['Excellent lighting', 'Good composition'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => result1,
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.result).toEqual(result1);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => result2,
      });

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.result).toEqual(result2);
    });

    it('should handle very long code', async () => {
      mockCode = 'scene Main {\n' + '  box();\n'.repeat(1000) + '}';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ score: 80, suggestions: [], strengths: [] }),
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/critique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mockCode }),
      });
    });

    it('should handle code with null from store', async () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: null };
        return selector(state);
      });

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.error).toBe('No code to analyse.');
    });

    it('should update loading state even on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useSceneCritique());

      await act(async () => {
        await result.current.analyse();
      });

      expect(result.current.loading).toBe(false);
    });
  });
});
