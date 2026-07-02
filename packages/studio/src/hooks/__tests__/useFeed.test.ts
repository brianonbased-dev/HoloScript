// @vitest-environment jsdom
/**
 * useFeed.test.ts
 * Tests for the WS-2 public shared-worlds feed hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFeed, type FeedScene } from '../useFeed';

describe('useFeed', () => {
  const mockScene: FeedScene = {
    id: 'scene_abc123',
    title: 'A Shared World',
    description: 'A description',
    createdAt: Date.now(),
    author: 'tester',
    previewUrl: '/scene/scene_abc123',
  };

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('should initialize with empty scenes and no error', () => {
    const { result } = renderHook(() => useFeed());

    expect(result.current.scenes).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should load scenes from /api/feed', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scenes: [mockScene] }),
    });

    const { result } = renderHook(() => useFeed());

    await act(async () => {
      await result.current.reload();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/feed');
    expect(result.current.scenes).toEqual([mockScene]);
    expect(result.current.loading).toBe(false);
  });

  it('should pass the limit query param through when provided', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scenes: [] }),
    });

    const { result } = renderHook(() => useFeed(5));

    await act(async () => {
      await result.current.reload();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/feed?limit=5');
  });

  it('should set loading state during reload', async () => {
    let resolveLoad: any;
    const loadPromise = new Promise((resolve) => {
      resolveLoad = resolve;
    });

    (global.fetch as any).mockReturnValueOnce(
      loadPromise.then(() => ({
        ok: true,
        json: () => Promise.resolve({ scenes: [] }),
      }))
    );

    const { result } = renderHook(() => useFeed());

    act(() => {
      result.current.reload();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveLoad();
      await loadPromise;
    });

    expect(result.current.loading).toBe(false);
  });

  it('should handle a non-ok response with a graceful empty-array fallback + error', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ scenes: [], error: 'Failed to load shared worlds feed' }),
    });

    const { result } = renderHook(() => useFeed());

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.scenes).toEqual([]);
    expect(result.current.error).toBe('Failed to load shared worlds feed');
  });

  it('should handle network errors', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFeed());

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toContain('Network error');
    expect(result.current.loading).toBe(false);
  });
});
