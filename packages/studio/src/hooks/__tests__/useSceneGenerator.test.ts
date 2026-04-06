// @vitest-environment jsdom
/**
 * useSceneGenerator.test.ts
 * Tests for AI scene generation hook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSceneGenerator } from '../useSceneGenerator';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useSceneGenerator', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should start with idle status', () => {
      const { result } = renderHook(() => useSceneGenerator());

      expect(result.current.status).toBe('idle');
      expect(result.current.generatedCode).toBe('');
      expect(result.current.warning).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should provide generate and reset functions', () => {
      const { result } = renderHook(() => useSceneGenerator());

      expect(typeof result.current.generate).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('Generate Function', () => {
    it('should generate code from prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main {\n  box("test");\n}',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create a box');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'create a box', existingCode: undefined }),
      });

      expect(result.current.status).toBe('done');
      expect(result.current.generatedCode).toBe('scene Main {\n  box("test");\n}');
      expect(result.current.error).toBeNull();
    });

    it('should generate with existing code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main {\n  box("updated");\n}',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());
      const existingCode = 'scene Main {\n  box("old");\n}';

      await act(async () => {
        await result.current.generate('update the box', existingCode);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'update the box', existingCode }),
      });

      expect(result.current.generatedCode).toBe('scene Main {\n  box("updated");\n}');
    });

    it('should not generate with empty prompt', async () => {
      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('');
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });

    it('should not generate with whitespace-only prompt', async () => {
      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('   ');
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });

    it('should set status to generating during API call', async () => {
      let resolveFetch: (value: any) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      mockFetch.mockReturnValueOnce(fetchPromise);

      const { result } = renderHook(() => useSceneGenerator());

      act(() => {
        result.current.generate('create a sphere');
      });

      // Status should be generating immediately
      expect(result.current.status).toBe('generating');

      // Resolve the fetch
      await act(async () => {
        resolveFetch!({
          ok: true,
          json: async () => ({
            success: true,
            code: 'scene Main { sphere(); }',
          }),
        });
        await fetchPromise;
      });

      expect(result.current.status).toBe('done');
    });

    it('should clear previous state when generating', async () => {
      const { result } = renderHook(() => useSceneGenerator());

      // Set some initial state
      act(() => {
        result.current.reset();
      });

      // Manually set error state
      mockFetch.mockRejectedValueOnce(new Error('Previous error'));
      await act(async () => {
        await result.current.generate('fail');
      });

      expect(result.current.error).toBe('Previous error');
      expect(result.current.status).toBe('error');

      // Now generate again - should clear previous error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main {}',
        }),
      });

      await act(async () => {
        await result.current.generate('new prompt');
      });

      expect(result.current.error).toBeNull();
      expect(result.current.warning).toBeNull();
      expect(result.current.status).toBe('done');
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: 'Internal server error',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Internal server error');
      expect(result.current.generatedCode).toBe('');
    });

    it('should handle HTTP error without error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('HTTP 404');
    });

    it('should handle success: false in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Generation failed',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Generation failed');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Network error');
    });

    it('should handle non-Error thrown values', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('String error');
    });
  });

  describe('Warning Handling', () => {
    it('should set warning when provided in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main {}',
          warning: 'This is a custom warning',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('done');
      expect(result.current.warning).toBe('This is a custom warning');
      expect(result.current.generatedCode).toBe('scene Main {}');
    });

    it('should set warning when source is mock', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main {}',
          source: 'mock',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('done');
      expect(result.current.warning).toBe('Using template fallback (cloud AI unavailable)');
    });

    it('should prefer custom warning over mock warning', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main {}',
          warning: 'Custom warning message',
          source: 'mock',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.warning).toBe('Custom warning message');
    });
  });

  describe('Reset Function', () => {
    it('should reset to initial state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main { box(); }',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      // Generate some code
      await act(async () => {
        await result.current.generate('create a box');
      });

      expect(result.current.status).toBe('done');
      expect(result.current.generatedCode).toBe('scene Main { box(); }');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.generatedCode).toBe('');
      expect(result.current.error).toBeNull();
      expect(result.current.warning).toBeNull();
    });

    it('should reset error state', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API error'));

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('API error');

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBeNull();
    });

    it('should reset warning state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main {}',
          warning: 'Test warning',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.warning).toBe('Test warning');

      act(() => {
        result.current.reset();
      });

      expect(result.current.warning).toBeNull();
    });
  });

  describe('Code Generation', () => {
    it('should handle empty code in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: '',
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('done');
      expect(result.current.generatedCode).toBe('');
    });

    it('should handle missing code in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create something');
      });

      expect(result.current.status).toBe('done');
      expect(result.current.generatedCode).toBe('');
    });

    it('should handle complex code response', async () => {
      const complexCode = `scene Main {
  // Create a grid of boxes
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      box({ position: [i * 2, 0, j * 2] });
    }
  }
}`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: complexCode,
        }),
      });

      const { result } = renderHook(() => useSceneGenerator());

      await act(async () => {
        await result.current.generate('create a grid of boxes');
      });

      expect(result.current.generatedCode).toBe(complexCode);
    });
  });

  describe('Multiple Generations', () => {
    it('should handle multiple sequential generations', async () => {
      const { result } = renderHook(() => useSceneGenerator());

      // First generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main { box(); }',
        }),
      });

      await act(async () => {
        await result.current.generate('create a box');
      });

      expect(result.current.generatedCode).toBe('scene Main { box(); }');

      // Second generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main { sphere(); }',
        }),
      });

      await act(async () => {
        await result.current.generate('create a sphere');
      });

      expect(result.current.generatedCode).toBe('scene Main { sphere(); }');
    });

    it('should replace previous code when generating new code', async () => {
      const { result } = renderHook(() => useSceneGenerator());

      // First generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main { box(); }',
        }),
      });

      await act(async () => {
        await result.current.generate('create a box');
      });

      expect(result.current.generatedCode).toBe('scene Main { box(); }');

      // Second generation should replace the code
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main { sphere(); }',
        }),
      });

      await act(async () => {
        await result.current.generate('create a sphere');
      });

      expect(result.current.generatedCode).toBe('scene Main { sphere(); }');
    });
  });

  describe('Edge Cases', () => {
    it('should be stable across re-renders', () => {
      const { result, rerender } = renderHook(() => useSceneGenerator());

      const firstGenerate = result.current.generate;
      const firstReset = result.current.reset;

      rerender();

      expect(result.current.generate).toBe(firstGenerate);
      expect(result.current.reset).toBe(firstReset);
    });

    it('should handle rapid generate calls', async () => {
      const { result } = renderHook(() => useSceneGenerator());

      // Queue multiple generates rapidly (only last one should matter)
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          code: 'scene Main { final(); }',
        }),
      });

      await act(async () => {
        // Fire multiple generates
        const p1 = result.current.generate('first');
        const p2 = result.current.generate('second');
        const p3 = result.current.generate('third');

        await Promise.all([p1, p2, p3]);
      });

      // All three should have completed
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.current.status).toBe('done');
    });
  });
});
