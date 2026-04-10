// @vitest-environment jsdom
/**
 * useSceneExport.test.ts
 * Tests for scene export hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSceneExport } from '../useSceneExport';
import { useSceneStore, useSceneGraphStore } from '@/lib/stores';

describe('useSceneExport', () => {
  beforeEach(() => {
    // Reset stores
    useSceneStore.setState({ code: 'scene TestScene {}' });
    useSceneGraphStore.setState({ nodes: [] });

    // Reset fetch mock
    global.fetch = vi.fn();

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  describe('Initial State', () => {
    it('should initialize with idle status', () => {
      const { result } = renderHook(() => useSceneExport());

      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBeNull();
    });
  });

  describe('GLTF Export', () => {
    it('should call API with correct parameters', async () => {
      const mockBlob = new Blob(['mock gltf data'], { type: 'model/gltf+json' });
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
        headers: new Map([['Content-Disposition', 'filename="test.gltf"']]),
      });

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"format":"gltf"'),
      });

      expect(result.current.status).toBe('done');
    });

    it('should include scene name in request', async () => {
      const mockBlob = new Blob(['mock data']);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
        headers: new Map(),
      });

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf', 'MyScene');
      });

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.sceneName).toBe('MyScene');
      expect(callBody.format).toBe('gltf');
    });

    it('should include code from scene store', async () => {
      useSceneStore.setState({ code: 'scene CustomCode {}' });

      const mockBlob = new Blob(['mock data']);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
        headers: new Map(),
      });

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.code).toBe('scene CustomCode {}');
    });
  });

  describe('Format Support', () => {
    it.each([['gltf'], ['usd'], ['usdz'], ['json']] as const)(
      'should support %s format',
      async (format) => {
        const mockBlob = new Blob(['mock data']);
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
          headers: new Map(),
        });

        const { result } = renderHook(() => useSceneExport());

        await act(async () => {
          await result.current.exportScene(format);
        });

        const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(callBody.format).toBe(format);
        expect(result.current.status).toBe('done');
      }
    );
  });

  describe('JSON Export', () => {
    it('should include nodes for JSON format', async () => {
      useSceneGraphStore.setState({
        nodes: [
          {
            id: 'node1',
            name: 'Box',
            type: 'object',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
        ],
      });

      const mockBlob = new Blob(['mock json data']);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
        headers: new Map(),
      });

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('json');
      });

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.nodes).toBeDefined();
      expect(callBody.nodes.length).toBe(1);
      expect(callBody.nodes[0].id).toBe('node1');
    });

    it('should not include nodes for non-JSON formats', async () => {
      useSceneGraphStore.setState({
        nodes: [
          {
            id: 'node1',
            name: 'Box',
            type: 'object',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
        ],
      });

      const mockBlob = new Blob(['mock data']);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
        headers: new Map(),
      });

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.nodes).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP errors with error message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('Server error');
    });

    it('should handle HTTP errors without error message', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('HTTP 404');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('Network failure');
    });

    it('should clear error on successful export after previous error', async () => {
      // First call fails
      (global.fetch as any).mockRejectedValueOnce(new Error('First error'));

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      expect(result.current.error).toContain('First error');

      // Second call succeeds
      const mockBlob = new Blob(['success']);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
        headers: new Map(),
      });

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe('done');
    });
  });

  describe('Status Management', () => {
    it('should start in idle state', () => {
      const { result } = renderHook(() => useSceneExport());
      expect(result.current.status).toBe('idle');
    });

    it('should transition to done on successful export', async () => {
      const mockBlob = new Blob(['data']);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
        headers: new Map(),
      });

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      expect(result.current.status).toBe('done');
    });

    it('should transition to error on failure', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Fail'));

      const { result } = renderHook(() => useSceneExport());

      await act(async () => {
        await result.current.exportScene('gltf');
      });

      expect(result.current.status).toBe('error');
    });
  });
});
