// @vitest-environment jsdom
/**
 * useKeyframes.test.ts
 * Tests for animation keyframe playback and editing hook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useKeyframes, type AnimTrack, type Keyframe } from '../useKeyframes';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useKeyframes', () => {
  let rafCallbacks: ((time: number) => void)[] = [];
  let rafId = 0;
  let currentTime = 0;

  const mockTracks: AnimTrack[] = [
    {
      id: 'track-1',
      sceneId: 'scene-1',
      name: 'Position X',
      property: 'position.x',
      objectName: 'box',
      keyframes: [
        { id: 'kf-1', track: 'track-1', time: 0, value: 0, easing: 'linear' },
        { id: 'kf-2', track: 'track-1', time: 2, value: 10, easing: 'linear' },
        { id: 'kf-3', track: 'track-1', time: 4, value: 5, easing: 'linear' },
      ],
    },
  ];

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    currentTime = 0;
    mockFetch.mockClear();

    // Mock RAF
    global.requestAnimationFrame = vi.fn((callback) => {
      const id = ++rafId;
      rafCallbacks.push(callback);
      return id;
    });

    global.cancelAnimationFrame = vi.fn(() => {
      rafCallbacks = [];
    });

    // Default mock: empty tracks
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tracks: [] }),
    });
  });

  afterEach(() => {
    rafCallbacks = [];
    vi.clearAllMocks();
  });

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
    it('should start with empty tracks', async () => {
      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.tracks).toEqual([]);
      expect(result.current.currentTime).toBe(0);
      expect(result.current.playState).toBe('stopped');
      expect(result.current.duration).toBe(10);
    });

    it('should provide control functions', async () => {
      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.play).toBe('function');
      expect(typeof result.current.pause).toBe('function');
      expect(typeof result.current.stop).toBe('function');
      expect(typeof result.current.scrub).toBe('function');
      expect(typeof result.current.addKeyframe).toBe('function');
      expect(typeof result.current.deleteKeyframe).toBe('function');
      expect(typeof result.current.evaluate).toBe('function');
      expect(typeof result.current.reload).toBe('function');
    });
  });

  describe('Load Tracks', () => {
    it('should load tracks on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes('scene-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/keyframes?sceneId=scene-1');
      expect(result.current.tracks).toEqual(mockTracks);
    });

    it('should calculate duration from keyframes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Max keyframe time is 4, so duration should be at least 6 (4 + 2)
      expect(result.current.duration).toBeGreaterThanOrEqual(6);
    });

    it('should set minimum duration of 10 seconds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tracks: [
            {
              ...mockTracks[0],
              keyframes: [{ id: 'kf-1', track: 'track-1', time: 1, value: 0, easing: 'linear' }],
            },
          ],
        }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.duration).toBe(10);
    });

    it('should handle load errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not crash
      expect(result.current.tracks).toEqual([]);
    });

    it('should set loading state during load', async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ tracks: [] }),
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useKeyframes());

      // Should be loading initially
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Playback Controls', () => {
    it('should play animation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.play();
      });

      expect(result.current.playState).toBe('playing');
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it('should pause animation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.play();
      });

      act(() => {
        result.current.pause();
      });

      expect(result.current.playState).toBe('paused');
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should stop animation and reset time', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.play();
      });

      simulateFrames([1000, 1000]); // Advance time

      act(() => {
        result.current.stop();
      });

      expect(result.current.playState).toBe('stopped');
      expect(result.current.currentTime).toBe(0);
    });

    it('should advance time during playback', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.play();
      });

      const initialTime = result.current.currentTime;

      // First frame has delta=0, need at least 2 frames to see time advance
      simulateFrames([1000, 1000]); // 2 seconds

      expect(result.current.currentTime).toBeGreaterThan(initialTime);
    });

    it('should stop when reaching end of timeline', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const duration = result.current.duration;

      act(() => {
        result.current.play();
      });

      // Simulate enough time to reach end (first frame is delta=0, so add extra)
      simulateFrames(Array(Math.ceil(duration) + 3).fill(1000));

      await waitFor(() => {
        expect(result.current.playState).toBe('stopped');
      });

      // When stopped, time is reset (checking state transition is sufficient)
    });
  });

  describe('Scrubbing', () => {
    it('should scrub to specific time', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.scrub(3.5);
      });

      expect(result.current.currentTime).toBe(3.5);
    });

    it('should clamp scrub time to duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const duration = result.current.duration;

      act(() => {
        result.current.scrub(duration + 10);
      });

      expect(result.current.currentTime).toBe(duration);
    });

    it('should clamp scrub time to zero', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.scrub(-5);
      });

      expect(result.current.currentTime).toBe(0);
    });

    it('should pause if scrubbing while playing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.play();
      });

      act(() => {
        result.current.scrub(2);
      });

      expect(result.current.playState).toBe('paused');
    });
  });

  describe('Add Keyframe', () => {
    it('should add keyframe via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes('scene-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newTrack: AnimTrack = {
        ...mockTracks[0],
        keyframes: [
          ...mockTracks[0].keyframes,
          { id: 'kf-4', track: 'track-1', time: 5, value: 15, easing: 'linear' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ track: newTrack }),
      });

      await act(async () => {
        await result.current.addKeyframe('box', 'position.x', 5, 15);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/keyframes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId: 'scene-1',
          objectName: 'box',
          property: 'position.x',
          time: 5,
          value: 15,
        }),
      });

      expect(result.current.tracks[0].keyframes).toHaveLength(4);
    });

    it('should update existing track when adding keyframe', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const updatedTrack: AnimTrack = {
        ...mockTracks[0],
        keyframes: [
          ...mockTracks[0].keyframes,
          { id: 'kf-new', track: 'track-1', time: 6, value: 20, easing: 'ease-in' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ track: updatedTrack }),
      });

      await act(async () => {
        await result.current.addKeyframe('box', 'position.x', 6, 20);
      });

      // Should update the existing track
      const track = result.current.tracks.find((t) => t.id === 'track-1');
      expect(track?.keyframes).toHaveLength(4);
    });

    it('should add new track when adding keyframe to non-existent track', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: [] }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const newTrack: AnimTrack = {
        id: 'track-new',
        sceneId: 'default',
        name: 'Rotation Y',
        property: 'rotation.y',
        objectName: 'sphere',
        keyframes: [{ id: 'kf-new', track: 'track-new', time: 0, value: 0, easing: 'linear' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ track: newTrack }),
      });

      await act(async () => {
        await result.current.addKeyframe('sphere', 'rotation.y', 0, 0);
      });

      expect(result.current.tracks).toHaveLength(1);
      expect(result.current.tracks[0].id).toBe('track-new');
    });
  });

  describe('Delete Keyframe', () => {
    it('should delete keyframe via API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes('scene-1'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await act(async () => {
        await result.current.deleteKeyframe('kf-2');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/keyframes?id=kf-2&sceneId=scene-1', {
        method: 'DELETE',
      });

      // Should remove keyframe from track
      const track = result.current.tracks.find((t) => t.id === 'track-1');
      expect(track?.keyframes.find((k) => k.id === 'kf-2')).toBeUndefined();
    });

    it('should preserve other keyframes when deleting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialCount = result.current.tracks[0].keyframes.length;

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await act(async () => {
        await result.current.deleteKeyframe('kf-1');
      });

      expect(result.current.tracks[0].keyframes.length).toBe(initialCount - 1);
      expect(result.current.tracks[0].keyframes.find((k) => k.id === 'kf-3')).toBeDefined();
    });
  });

  describe('Evaluate Track', () => {
    it('should evaluate track value at current time', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Set time to middle of first segment (0 to 2 seconds, value 0 to 10)
      act(() => {
        result.current.scrub(1); // 50% of the way
      });

      const value = result.current.evaluate('track-1');

      // Linear interpolation: 0 + (10 - 0) * 0.5 = 5
      expect(value).toBe(5);
    });

    it('should return first value when before first keyframe', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.scrub(0);
      });

      const value = result.current.evaluate('track-1');

      expect(value).toBe(0); // First keyframe value
    });

    it('should return last value when after last keyframe', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.scrub(10); // After all keyframes
      });

      const value = result.current.evaluate('track-1');

      expect(value).toBe(5); // Last keyframe value
    });

    it('should return null for non-existent track', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const value = result.current.evaluate('non-existent-track');

      expect(value).toBeNull();
    });

    it('should return null for track with no keyframes', async () => {
      const emptyTrack: AnimTrack = {
        id: 'track-empty',
        sceneId: 'scene-1',
        name: 'Empty',
        property: 'empty',
        objectName: 'empty',
        keyframes: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: [emptyTrack] }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const value = result.current.evaluate('track-empty');

      expect(value).toBeNull();
    });

    it('should interpolate between keyframes correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Time 3 is between keyframe at 2 (value 10) and keyframe at 4 (value 5)
      // t = (3 - 2) / (4 - 2) = 0.5
      // value = 10 + (5 - 10) * 0.5 = 7.5
      act(() => {
        result.current.scrub(3);
      });

      const value = result.current.evaluate('track-1');

      expect(value).toBe(7.5);
    });
  });

  describe('Duration Management', () => {
    it('should allow setting custom duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: [] }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.setDuration(20);
      });

      expect(result.current.duration).toBe(20);
    });
  });

  describe('Reload', () => {
    it('should reload tracks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: [] }),
      });

      const { result } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: mockTracks }),
      });

      await act(async () => {
        await result.current.reload();
      });

      expect(result.current.tracks).toEqual(mockTracks);
    });
  });

  describe('Cleanup', () => {
    it('should cancel RAF on unmount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracks: [] }),
      });

      const { unmount } = renderHook(() => useKeyframes());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});
