// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAIMaterial } from '../useAIMaterial';

describe('useAIMaterial', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with idle status', () => {
      const { result } = renderHook(() => useAIMaterial());

      expect(result.current.status).toBe('idle');
    });

    it('should initialize with empty glsl', () => {
      const { result } = renderHook(() => useAIMaterial());

      expect(result.current.glsl).toBe('');
    });

    it('should initialize with empty traits', () => {
      const { result } = renderHook(() => useAIMaterial());

      expect(result.current.traits).toBe('');
    });

    it('should initialize with null error', () => {
      const { result } = renderHook(() => useAIMaterial());

      expect(result.current.error).toBeNull();
    });
  });

  describe('Generate Function', () => {
    it('should call API with prompt and baseColor', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          glsl: 'void main() {}',
          traits: '@material(shader: "custom")',
        }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'metallic surface', baseColor: '#silver' });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/material/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'metallic surface', baseColor: '#silver' }),
      });
    });

    it('should use default baseColor if not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: '', traits: '' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/material/generate',
        expect.objectContaining({
          body: JSON.stringify({ prompt: 'test', baseColor: '#ffffff' }),
        })
      );
    });

    it('should set status to generating during API call', async () => {
      let resolvePromise: (value: any) => void;
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );

      const { result } = renderHook(() => useAIMaterial());

      act(() => {
        result.current.generate({ prompt: 'test' });
      });

      // Status should be generating while API call is pending
      expect(result.current.status).toBe('generating');

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: async () => ({ glsl: 'test', traits: 'test' }),
        });
      });
    });

    it('should set glsl and traits on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          glsl: 'uniform float time;\nvoid main() { gl_FragColor = vec4(1.0); }',
          traits: '@material(color: "#ff0000", shader: "custom")',
        }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'red surface' });
      });

      expect(result.current.glsl).toBe(
        'uniform float time;\nvoid main() { gl_FragColor = vec4(1.0); }'
      );
      expect(result.current.traits).toBe('@material(color: "#ff0000", shader: "custom")');
    });

    it('should set status to done on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'test', traits: 'test' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.status).toBe('done');
    });

    it('should clear previous results before generating', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ glsl: 'new glsl', traits: 'new traits' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'first' });
      });

      expect(result.current.glsl).toBe('new glsl');

      await act(async () => {
        await result.current.generate({ prompt: 'second' });
      });

      expect(result.current.glsl).toBe('new glsl');
    });

    it('should handle missing glsl in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ traits: '@material(color: "#fff")' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.glsl).toBe('');
      expect(result.current.traits).toBe('@material(color: "#fff")');
    });

    it('should handle missing traits in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'void main() {}' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.glsl).toBe('void main() {}');
      expect(result.current.traits).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Server error');
    });

    it('should handle API error field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'AI model unavailable' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('AI model unavailable');
    });

    it('should use HTTP status as fallback error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.error).toBe('HTTP 404');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Network failure');
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Unknown error');
    });

    it('should clear previous error on new generate', async () => {
      mockFetch.mockRejectedValueOnce(new Error('First error')).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'success', traits: 'success' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'fail' });
      });

      expect(result.current.error).toBe('First error');

      await act(async () => {
        await result.current.generate({ prompt: 'success' });
      });

      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe('done');
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('Invalid JSON');
    });
  });

  describe('Reset Function', () => {
    it('should reset glsl to empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'test glsl', traits: 'test traits' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.glsl).toBe('test glsl');

      act(() => {
        result.current.reset();
      });

      expect(result.current.glsl).toBe('');
    });

    it('should reset traits to empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'test', traits: 'test traits' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.traits).toBe('');
    });

    it('should reset status to idle', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'test', traits: 'test' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.status).toBe('done');

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
    });

    it('should clear error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Callback Memoization', () => {
    it('should not recreate generate on re-render', () => {
      const { result, rerender } = renderHook(() => useAIMaterial());

      const firstGenerate = result.current.generate;

      rerender();

      expect(result.current.generate).toBe(firstGenerate);
    });

    it('should not recreate reset on re-render', () => {
      const { result, rerender } = renderHook(() => useAIMaterial());

      const firstReset = result.current.reset;

      rerender();

      expect(result.current.reset).toBe(firstReset);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'default', traits: 'default' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: '' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/material/generate',
        expect.objectContaining({
          body: JSON.stringify({ prompt: '', baseColor: '#ffffff' }),
        })
      );
    });

    it('should handle very long prompts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'test', traits: 'test' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      const longPrompt = 'A '.repeat(1000) + 'surface';

      await act(async () => {
        await result.current.generate({ prompt: longPrompt });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/material/generate',
        expect.objectContaining({
          body: expect.stringContaining(longPrompt),
        })
      );
    });

    it('should handle unicode in prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'test', traits: 'test' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: '🌟 星 émoji' });
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle special characters in baseColor', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ glsl: 'test', traits: 'test' }),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test', baseColor: '#ff00ff!@#' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/material/generate',
        expect.objectContaining({
          body: JSON.stringify({ prompt: 'test', baseColor: '#ff00ff!@#' }),
        })
      );
    });

    it('should handle empty response object', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useAIMaterial());

      await act(async () => {
        await result.current.generate({ prompt: 'test' });
      });

      expect(result.current.glsl).toBe('');
      expect(result.current.traits).toBe('');
      expect(result.current.status).toBe('done');
    });
  });
});
