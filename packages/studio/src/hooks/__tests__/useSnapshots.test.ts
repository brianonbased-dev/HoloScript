// @vitest-environment jsdom
/**
 * useSnapshots.test.ts
 * Tests for snapshot management hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSnapshots, type Snapshot } from '../useSnapshots';
import { useSceneStore } from '@/lib/store';

describe('useSnapshots', () => {
  const mockSceneId = 'test-scene-123';
  const mockSnapshot: Snapshot = {
    id: 'snap-1',
    sceneId: mockSceneId,
    label: 'Test Snapshot',
    dataUrl: 'data:image/png;base64,mock',
    code: 'scene Test { object "Box" {} }',
    createdAt: '2026-02-26T00:00:00.000Z',
  };

  beforeEach(() => {
    // Reset scene store
    useSceneStore.setState({ code: 'scene Current {}' });

    // Reset fetch mock
    global.fetch = vi.fn();

    // Mock canvas for screenshot capture
    const mockCanvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,mockCanvasData'),
    };
    document.querySelector = vi.fn((selector) => {
      if (selector.includes('canvas')) return mockCanvas as any;
      return null;
    });
  });

  describe('Initial State', () => {
    it('should initialize with empty snapshots', () => {
      const { result } = renderHook(() => useSnapshots(mockSceneId));

      expect(result.current.snapshots).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.capturing).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Load Snapshots', () => {
    it('should load snapshots from API', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          snapshots: [mockSnapshot],
        }),
      });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.load();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/snapshots?sceneId=${encodeURIComponent(mockSceneId)}`
      );
      expect(result.current.snapshots).toEqual([mockSnapshot]);
      expect(result.current.loading).toBe(false);
    });

    it('should set loading state during load', async () => {
      let resolveLoad: any;
      const loadPromise = new Promise((resolve) => {
        resolveLoad = resolve;
      });

      (global.fetch as any).mockReturnValueOnce(
        loadPromise.then(() => ({
          ok: true,
          json: () => Promise.resolve({ snapshots: [] }),
        }))
      );

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      act(() => {
        result.current.load();
      });

      // Should be loading
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveLoad();
        await loadPromise;
      });

      // Should finish loading
      expect(result.current.loading).toBe(false);
    });

    it('should handle load errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.load();
      });

      expect(result.current.error).toContain('Network error');
      expect(result.current.loading).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      (global.fetch as any).mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.load();
      });

      expect(result.current.error).toBe('Load failed');
    });

    it('should load multiple snapshots', async () => {
      const snapshots = [
        { ...mockSnapshot, id: 'snap-1', label: 'Snapshot 1' },
        { ...mockSnapshot, id: 'snap-2', label: 'Snapshot 2' },
        { ...mockSnapshot, id: 'snap-3', label: 'Snapshot 3' },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ snapshots }),
      });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.load();
      });

      expect(result.current.snapshots).toHaveLength(3);
      expect(result.current.snapshots).toEqual(snapshots);
    });
  });

  describe('Capture Snapshot', () => {
    it('should capture snapshot with canvas', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ snapshot: mockSnapshot }),
      });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.capture('My Snapshot');
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('My Snapshot'),
      });

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.sceneId).toBe(mockSceneId);
      expect(callBody.label).toBe('My Snapshot');
      expect(callBody.dataUrl).toContain('mockCanvasData');
      expect(callBody.code).toBe('scene Current {}');
    });

    it('should use default label if not provided', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ snapshot: mockSnapshot }),
      });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.capture();
      });

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.label).toContain('Snapshot');
      expect(callBody.label).toMatch(/\d+:\d+:\d+/); // Contains time
    });

    it('should use fallback image when no canvas found', async () => {
      document.querySelector = vi.fn(() => null); // No canvas

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ snapshot: mockSnapshot }),
      });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.capture('No Canvas');
      });

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.dataUrl).toContain('data:image/png;base64');
      expect(callBody.dataUrl).not.toContain('mockCanvasData');
    });

    it('should add captured snapshot to list', async () => {
      const existingSnapshot = { ...mockSnapshot, id: 'existing-snap' };
      const newSnapshot = { ...mockSnapshot, id: 'new-snap' };

      // First load existing snapshots
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ snapshots: [existingSnapshot] }),
      });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.load();
      });

      expect(result.current.snapshots).toHaveLength(1);

      // Then capture a new one
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ snapshot: newSnapshot }),
      });

      await act(async () => {
        await result.current.capture('New');
      });

      expect(result.current.snapshots).toHaveLength(2);
      expect(result.current.snapshots[0].id).toBe('existing-snap');
      expect(result.current.snapshots[1].id).toBe('new-snap');
    });

    it('should set capturing state', async () => {
      let resolveCapture: any;
      const capturePromise = new Promise((resolve) => {
        resolveCapture = resolve;
      });

      (global.fetch as any).mockReturnValueOnce(
        capturePromise.then(() => ({
          ok: true,
          json: () => Promise.resolve({ snapshot: mockSnapshot }),
        }))
      );

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      act(() => {
        result.current.capture();
      });

      // Should be capturing
      expect(result.current.capturing).toBe(true);

      await act(async () => {
        resolveCapture();
        await capturePromise;
      });

      // Should finish capturing
      expect(result.current.capturing).toBe(false);
    });

    it('should handle capture errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Upload failed'));

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.capture();
      });

      expect(result.current.error).toContain('Upload failed');
      expect(result.current.capturing).toBe(false);
    });

    it('should clear error before capture', async () => {
      // First capture fails
      (global.fetch as any).mockRejectedValueOnce(new Error('First error'));

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.capture();
      });

      expect(result.current.error).toContain('First error');

      // Second capture succeeds
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ snapshot: mockSnapshot }),
      });

      await act(async () => {
        await result.current.capture();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Restore Snapshot', () => {
    it('should restore code from snapshot', () => {
      const { result } = renderHook(() => useSnapshots(mockSceneId));

      act(() => {
        result.current.restore(mockSnapshot);
      });

      expect(useSceneStore.getState().code).toBe(mockSnapshot.code);
    });

    it('should restore different snapshot codes', () => {
      const snapshot1 = { ...mockSnapshot, code: 'scene First {}' };
      const snapshot2 = { ...mockSnapshot, code: 'scene Second {}' };

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      act(() => {
        result.current.restore(snapshot1);
      });
      expect(useSceneStore.getState().code).toBe('scene First {}');

      act(() => {
        result.current.restore(snapshot2);
      });
      expect(useSceneStore.getState().code).toBe('scene Second {}');
    });
  });

  describe('Remove Snapshot', () => {
    it('should remove snapshot via API', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      // Set initial snapshots
      act(() => {
        result.current.snapshots.push(mockSnapshot);
      });

      await act(async () => {
        await result.current.remove('snap-1');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/snapshots?id=snap-1',
        { method: 'DELETE' }
      );
    });

    it('should remove snapshot from list', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            snapshots: [
              { ...mockSnapshot, id: 'snap-1' },
              { ...mockSnapshot, id: 'snap-2' },
              { ...mockSnapshot, id: 'snap-3' },
            ],
          }),
        })
        .mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      // Load snapshots
      await act(async () => {
        await result.current.load();
      });

      expect(result.current.snapshots).toHaveLength(3);

      // Remove one
      await act(async () => {
        await result.current.remove('snap-2');
      });

      expect(result.current.snapshots).toHaveLength(2);
      expect(result.current.snapshots.find((s) => s.id === 'snap-2')).toBeUndefined();
    });

    it('should not remove if API call fails', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            snapshots: [mockSnapshot],
          }),
        })
        .mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useSnapshots(mockSceneId));

      await act(async () => {
        await result.current.load();
      });

      expect(result.current.snapshots).toHaveLength(1);

      await act(async () => {
        await result.current.remove('snap-1');
      });

      // Should still be there since API failed
      expect(result.current.snapshots).toHaveLength(1);
    });
  });

  describe('Scene ID Changes', () => {
    it('should reload snapshots when scene ID changes', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            snapshots: [{ ...mockSnapshot, sceneId: 'scene-1' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            snapshots: [{ ...mockSnapshot, sceneId: 'scene-2' }],
          }),
        });

      const { result, rerender } = renderHook(
        ({ sceneId }) => useSnapshots(sceneId),
        { initialProps: { sceneId: 'scene-1' } }
      );

      await act(async () => {
        await result.current.load();
      });

      expect(result.current.snapshots[0].sceneId).toBe('scene-1');

      // Change scene ID
      rerender({ sceneId: 'scene-2' });

      await act(async () => {
        await result.current.load();
      });

      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/snapshots?sceneId=scene-2'
      );
    });
  });
});
