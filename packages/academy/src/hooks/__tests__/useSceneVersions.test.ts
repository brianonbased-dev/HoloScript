// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSceneVersions } from '../useSceneVersions';
import type { SceneVersion } from '../useSceneVersions';

// Mock the store
const mockSetCode = vi.fn();
const mockMarkClean = vi.fn();
vi.mock('@/lib/stores', () => ({
  useSceneStore: vi.fn((selector) => {
    const store = {
      setCode: mockSetCode,
      metadata: { id: 'scene-1', name: 'Test Scene' },
      code: 'scene "Main" {}',
      markClean: mockMarkClean,
    };
    return selector ? selector(store) : store;
  }),
}));

describe('useSceneVersions', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockVersion1: SceneVersion = {
    versionId: 'v1',
    sceneId: 'main-scene',
    label: 'Initial version',
    code: 'scene "Main" {}',
    savedAt: '2024-01-01T00:00:00Z',
    lineCount: 1,
  };

  const mockVersion2: SceneVersion = {
    versionId: 'v2',
    sceneId: 'main-scene',
    label: 'Added box',
    code: 'scene "Main" {\n  box "Cube" {}\n}',
    savedAt: '2024-01-01T01:00:00Z',
    lineCount: 3,
  };

  const mockVersion3: SceneVersion = {
    versionId: 'v3',
    sceneId: 'main-scene',
    label: 'Added light',
    code: 'scene "Main" {\n  box "Cube" {}\n  light "Sun" {}\n}',
    savedAt: '2024-01-01T02:00:00Z',
    lineCount: 4,
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    mockSetCode.mockClear();
    mockMarkClean.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with empty versions array', () => {
      const { result } = renderHook(() => useSceneVersions('main-scene'));

      expect(result.current.versions).toEqual([]);
    });

    it('should initialize with idle status', () => {
      const { result } = renderHook(() => useSceneVersions('main-scene'));

      expect(result.current.status).toBe('idle');
    });

    it('should initialize with null error', () => {
      const { result } = renderHook(() => useSceneVersions('main-scene'));

      expect(result.current.error).toBeNull();
    });

    it('should expose all required methods', () => {
      const { result } = renderHook(() => useSceneVersions('main-scene'));

      expect(result.current.loadVersions).toBeInstanceOf(Function);
      expect(result.current.saveVersion).toBeInstanceOf(Function);
      expect(result.current.restoreVersion).toBeInstanceOf(Function);
      expect(result.current.deleteVersion).toBeInstanceOf(Function);
      expect(result.current.clearError).toBeInstanceOf(Function);
    });
  });

  describe('Load Versions', () => {
    it('should set status to loading when fetching versions', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      act(() => {
        result.current.loadVersions();
      });

      expect(result.current.status).toBe('loading');
    });

    it('should fetch versions from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [mockVersion1, mockVersion2] }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/versions?sceneId=main-scene');
    });

    it('should update versions state on successful load', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [mockVersion1, mockVersion2] }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await waitFor(() => {
        expect(result.current.versions).toEqual([mockVersion1, mockVersion2]);
        expect(result.current.status).toBe('idle');
      });
    });

    it('should encode sceneId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [] }),
      });

      const { result } = renderHook(() => useSceneVersions('scene with spaces'));

      await act(async () => {
        await result.current.loadVersions();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/versions?sceneId=scene%20with%20spaces');
    });

    it('should handle empty versions array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [] }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await waitFor(() => {
        expect(result.current.versions).toEqual([]);
        expect(result.current.status).toBe('idle');
      });
    });

    it('should handle missing versions field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await waitFor(() => {
        expect(result.current.versions).toEqual([]);
      });
    });

    it('should set error status on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Database error' }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('Error: Database error');
      });
    });

    it('should set error status on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toContain('Network failure');
      });
    });

    it('should not fetch when sceneId is empty', async () => {
      const { result } = renderHook(() => useSceneVersions(''));

      await act(async () => {
        await result.current.loadVersions();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Save Version', () => {
    it('should set status to saving when saving version', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      act(() => {
        result.current.saveVersion('scene "Main" {}', 'Test version');
      });

      expect(result.current.status).toBe('saving');
    });

    it('should POST to /api/versions with code and label', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: mockVersion1 }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.saveVersion('scene "Main" {}', 'Initial version');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId: 'main-scene',
          code: 'scene "Main" {}',
          label: 'Initial version',
        }),
      });
    });

    it('should save version without label', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: { ...mockVersion1, label: '' } }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.saveVersion('scene "Main" {}');
      });

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.label).toBeUndefined();
    });

    it('should prepend new version to versions array', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: [mockVersion1] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ version: mockVersion2 }),
        });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await act(async () => {
        await result.current.saveVersion('scene "Main" {\n  box "Cube" {}\n}', 'Added box');
      });

      await waitFor(() => {
        expect(result.current.versions).toEqual([mockVersion2, mockVersion1]);
      });
    });

    it('should return the saved version', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: mockVersion1 }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      let savedVersion: SceneVersion | undefined;
      await act(async () => {
        savedVersion = await result.current.saveVersion('scene "Main" {}', 'Initial version');
      });

      expect(savedVersion).toEqual(mockVersion1);
    });

    it('should set idle status after successful save', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: mockVersion1 }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.saveVersion('scene "Main" {}', 'Initial version');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });
    });

    it('should handle save errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Storage full' }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.saveVersion('scene "Main" {}', 'Test');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('Error: Storage full');
      });
    });

    it('should not save when sceneId is empty', async () => {
      const { result } = renderHook(() => useSceneVersions(''));

      await act(async () => {
        await result.current.saveVersion('scene "Main" {}');
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Restore Version', () => {
    it('should set status to restoring when restoring version', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      act(() => {
        result.current.restoreVersion('v1');
      });

      expect(result.current.status).toBe('restoring');
    });

    it('should PUT to /api/versions/:sceneId with versionId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'scene "Main" {}' }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.restoreVersion('v1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/versions/main-scene?v=v1', {
        method: 'PUT',
      });
    });

    it('should encode sceneId and versionId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'scene "Main" {}' }),
      });

      const { result } = renderHook(() => useSceneVersions('scene with spaces'));

      await act(async () => {
        await result.current.restoreVersion('version/with/slashes');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/versions/scene%20with%20spaces?v=version%2Fwith%2Fslashes',
        { method: 'PUT' }
      );
    });

    it('should call setCode with restored code', async () => {
      const restoredCode = 'scene "Restored" {\n  box "Cube" {}\n}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: restoredCode }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.restoreVersion('v2');
      });

      await waitFor(() => {
        expect(mockSetCode).toHaveBeenCalledWith(restoredCode);
      });
    });

    it('should set idle status after successful restore', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'scene "Main" {}' }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.restoreVersion('v1');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });
    });

    it('should handle restore errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Version not found' }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.restoreVersion('v999');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('Error: Version not found');
      });
    });

    it('should handle missing code field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.restoreVersion('v1');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe('Error: Restore failed');
      });
    });

    it('should not restore when sceneId is empty', async () => {
      const { result } = renderHook(() => useSceneVersions(''));

      await act(async () => {
        await result.current.restoreVersion('v1');
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSetCode).not.toHaveBeenCalled();
    });
  });

  describe('Delete Version', () => {
    it('should DELETE to /api/versions/:sceneId with versionId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.deleteVersion('v1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/versions/main-scene?v=v1', {
        method: 'DELETE',
      });
    });

    it('should remove version from array', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: [mockVersion1, mockVersion2, mockVersion3] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await act(async () => {
        await result.current.deleteVersion('v2');
      });

      await waitFor(() => {
        expect(result.current.versions).toEqual([mockVersion1, mockVersion3]);
      });
    });

    it('should encode sceneId and versionId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useSceneVersions('scene/with/slashes'));

      await act(async () => {
        await result.current.deleteVersion('version with spaces');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/versions/scene%2Fwith%2Fslashes?v=version%20with%20spaces',
        { method: 'DELETE' }
      );
    });

    it('should handle delete errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Delete failed'));

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.deleteVersion('v1');
      });

      await waitFor(() => {
        expect(result.current.error).toContain('Delete failed');
      });
    });

    it('should not affect versions array on delete error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: [mockVersion1, mockVersion2] }),
        })
        .mockRejectedValueOnce(new Error('Delete failed'));

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await act(async () => {
        await result.current.deleteVersion('v1');
      });

      // Array should not change on error because filter is inside try block
      await waitFor(() => {
        expect(result.current.versions).toEqual([mockVersion1, mockVersion2]);
        expect(result.current.error).toContain('Delete failed');
      });
    });

    it('should handle deleting non-existent version', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: [mockVersion1] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await act(async () => {
        await result.current.deleteVersion('v999');
      });

      await waitFor(() => {
        // Should remain unchanged
        expect(result.current.versions).toEqual([mockVersion1]);
      });
    });
  });

  describe('Clear Error', () => {
    it('should clear error state', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Load failed'));

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it('should not affect other state when clearing error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Load failed'));

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      const statusBefore = result.current.status;
      const versionsBefore = result.current.versions;

      act(() => {
        result.current.clearError();
      });

      expect(result.current.status).toBe(statusBefore);
      expect(result.current.versions).toBe(versionsBefore);
    });
  });

  describe('SceneId Changes', () => {
    it('should use new sceneId after rerender', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ versions: [] }),
      });

      const { result, rerender } = renderHook(({ sceneId }) => useSceneVersions(sceneId), {
        initialProps: { sceneId: 'scene-1' },
      });

      await act(async () => {
        await result.current.loadVersions();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/versions?sceneId=scene-1');

      rerender({ sceneId: 'scene-2' });

      await act(async () => {
        await result.current.loadVersions();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/versions?sceneId=scene-2');
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple rapid loadVersions calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ versions: [mockVersion1] }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        result.current.loadVersions();
        result.current.loadVersions();
        await result.current.loadVersions();
      });

      // Should make 3 calls (no debouncing in this hook)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle very long code strings', async () => {
      const longCode = 'scene "Main" {\n'.repeat(10000) + '}';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: { ...mockVersion1, code: longCode } }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.saveVersion(longCode, 'Long version');
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle special characters in labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: mockVersion1 }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.saveVersion('scene "Main" {}', 'Version with 特殊字符 @#$%');
      });

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.label).toBe('Version with 特殊字符 @#$%');
    });

    it('should handle concurrent operations', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ versions: [mockVersion1] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ version: mockVersion2 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 'restored code' }),
        });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        // Start all operations
        const p1 = result.current.loadVersions();
        const p2 = result.current.saveVersion('new code', 'New');
        const p3 = result.current.restoreVersion('v1');
        await Promise.all([p1, p2, p3]);
      });

      // All operations should complete
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should preserve versions array reference when possible', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ versions: [mockVersion1] }),
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      const versionsRef = result.current.versions;

      // Call clearError should not change versions reference
      act(() => {
        result.current.clearError();
      });

      expect(result.current.versions).toBe(versionsRef);
    });

    it('should handle empty string sceneId consistently', async () => {
      const { result } = renderHook(() => useSceneVersions(''));

      await act(async () => {
        await result.current.loadVersions();
        await result.current.saveVersion('code');
        await result.current.restoreVersion('v1');
      });

      // No API calls should be made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const { result } = renderHook(() => useSceneVersions('main-scene'));

      await act(async () => {
        await result.current.loadVersions();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toContain('Invalid JSON');
      });
    });
  });
});
