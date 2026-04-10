// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSceneShare } from '../useSceneShare';

describe('useSceneShare', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock window.location.origin
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://holoscript.app' },
      writable: true,
    });
  });

  describe('Initial State', () => {
    it('should initialize with null shareUrl', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scenes: [] }),
      });

      const { result } = renderHook(() => useSceneShare());

      expect(result.current.shareUrl).toBeNull();
    });

    it('should initialize with empty gallery', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scenes: [] }),
      });

      const { result } = renderHook(() => useSceneShare());

      expect(result.current.gallery).toEqual([]);
    });

    it('should not be publishing initially', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scenes: [] }),
      });

      const { result } = renderHook(() => useSceneShare());

      expect(result.current.publishing).toBe(false);
    });

    it('should load gallery on mount', async () => {
      const mockScenes = [
        { id: '1', name: 'Scene 1', author: 'Alice', createdAt: '2024-01-01', views: 10 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scenes: mockScenes }),
      });

      const { result } = renderHook(() => useSceneShare());

      await waitFor(() => {
        expect(result.current.gallery).toEqual(mockScenes);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/share');
    });
  });

  describe('Publish', () => {
    it('should publish scene successfully', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'abc123', url: '/shared/abc123' }),
        });

      const { result } = renderHook(() => useSceneShare());

      let shareUrl: string | null = null;
      await act(async () => {
        shareUrl = await result.current.publish({
          name: 'Test Scene',
          code: 'scene Main {}',
          author: 'Bob',
        });
      });

      expect(shareUrl).toBe('https://holoscript.app/shared/abc123');
      expect(result.current.shareUrl).toBe('https://holoscript.app/shared/abc123');
    });

    it('should use default author if not provided', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'abc123' }),
        });

      const { result } = renderHook(() => useSceneShare());

      await act(async () => {
        await result.current.publish({ name: 'Test', code: 'scene Main {}' });
      });

      const callArgs = mockFetch.mock.calls[1][1];
      const body = JSON.parse(callArgs.body);
      expect(body.author).toBe('Anonymous');
    });

    it('should set publishing state during publish', async () => {
      let resolvePromise: (value: any) => void;
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
        );

      const { result } = renderHook(() => useSceneShare());

      act(() => {
        result.current.publish({ name: 'Test', code: 'test' });
      });

      expect(result.current.publishing).toBe(true);

      await act(async () => {
        resolvePromise!({ ok: true, json: async () => ({ id: '123' }) });
      });

      await waitFor(() => {
        expect(result.current.publishing).toBe(false);
      });
    });

    it('should handle HTTP errors', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' }),
        });

      const { result } = renderHook(() => useSceneShare());

      const shareUrl = await act(async () => {
        return await result.current.publish({ name: 'Test', code: 'test' });
      });

      expect(shareUrl).toBeNull();
      expect(result.current.error).toBe('Server error');
    });

    it('should handle network errors', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useSceneShare());

      const shareUrl = await act(async () => {
        return await result.current.publish({ name: 'Test', code: 'test' });
      });

      expect(shareUrl).toBeNull();
      expect(result.current.error).toBe('Network failure');
    });

    it('should clear previous shareUrl on new publish', async () => {
      mockFetch
        .mockResolvedValue({ ok: true, json: async () => ({ scenes: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '2' }) });

      const { result } = renderHook(() => useSceneShare());

      await act(async () => {
        await result.current.publish({ name: 'First', code: 'test' });
      });

      await act(async () => {
        await result.current.publish({ name: 'Second', code: 'test' });
      });

      expect(result.current.shareUrl).toContain('/shared/2');
    });
  });

  describe('Load Gallery', () => {
    it('should load gallery scenes', async () => {
      const mockScenes = [
        { id: '1', name: 'Scene 1', author: 'Alice', createdAt: '2024-01-01', views: 10 },
        { id: '2', name: 'Scene 2', author: 'Bob', createdAt: '2024-01-02', views: 20 },
      ];

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: mockScenes }) });

      const { result } = renderHook(() => useSceneShare());

      await act(async () => {
        await result.current.loadGallery();
      });

      expect(result.current.gallery).toEqual(mockScenes);
    });

    it('should set loadingGallery state', async () => {
      let resolvePromise: (value: any) => void;
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolvePromise = resolve;
          })
        );

      const { result } = renderHook(() => useSceneShare());

      act(() => {
        result.current.loadGallery();
      });

      expect(result.current.loadingGallery).toBe(true);

      await act(async () => {
        resolvePromise!({ ok: true, json: async () => ({ scenes: [] }) });
      });

      await waitFor(() => {
        expect(result.current.loadingGallery).toBe(false);
      });
    });

    it('should handle gallery load errors', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockRejectedValueOnce(new Error('Load failed'));

      const { result } = renderHook(() => useSceneShare());

      await act(async () => {
        await result.current.loadGallery();
      });

      expect(result.current.error).toBe('Load failed');
    });
  });

  describe('Reset', () => {
    it('should clear shareUrl', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '123' }) });

      const { result } = renderHook(() => useSceneShare());

      await act(async () => {
        await result.current.publish({ name: 'Test', code: 'test' });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.shareUrl).toBeNull();
    });

    it('should clear error', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenes: [] }) })
        .mockRejectedValueOnce(new Error('Publish failed'));

      const { result } = renderHook(() => useSceneShare());

      await act(async () => {
        await result.current.publish({ name: 'Test', code: 'test' });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
