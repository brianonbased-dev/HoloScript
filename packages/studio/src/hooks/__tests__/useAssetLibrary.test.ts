// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAssetLibrary, type Asset, type AssetCategory } from '../useAssetLibrary';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useAssetLibrary', () => {
  const mockAssets: Asset[] = [
    {
      id: 'asset-1',
      name: 'Robot Model',
      category: 'model',
      tags: ['robot', 'character'],
      thumbnail: '/thumb1.jpg',
      url: '/robot.glb',
      format: 'gltf',
      sizeKb: 1024,
      creator: 'Artist 1',
      license: 'CC0',
    },
    {
      id: 'asset-2',
      name: 'Sky HDR',
      category: 'hdr',
      tags: ['sky', 'outdoor'],
      thumbnail: '/thumb2.jpg',
      url: '/sky.hdr',
      format: 'hdr',
      sizeKb: 2048,
      creator: 'Artist 2',
      license: 'CC-BY',
    },
  ];

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('Initial State', () => {
    it('should initialize with empty results', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      expect(result.current.results).toEqual([]);
    });

    it('should initialize with loading true', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      expect(result.current.loading).toBe(true);
    });

    it('should initialize with no error', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      expect(result.current.error).toBeNull();
    });

    it('should initialize with empty query', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      expect(result.current.query).toBe('');
    });

    it('should initialize with empty category', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      expect(result.current.category).toBe('');
    });
  });

  describe('Initial Load', () => {
    it('should fetch assets on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: mockAssets,
          total: 2,
          page: 1,
          pages: 1,
        }),
      });

      renderHook(() => useAssetLibrary());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/assets?page=1');
      });
    });

    it('should set results after initial load', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: mockAssets,
          total: 2,
          page: 1,
          pages: 1,
        }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => {
        expect(result.current.results).toEqual(mockAssets);
      });
    });

    it('should set pagination info after initial load', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: mockAssets,
          total: 10,
          page: 1,
          pages: 5,
        }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => {
        expect(result.current.total).toBe(10);
        expect(result.current.page).toBe(1);
        expect(result.current.pages).toBe(5);
      });
    });

    it('should set loading to false after load', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: mockAssets,
          total: 2,
          page: 1,
          pages: 1,
        }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Search Function', () => {
    it('should search with query parameter', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[0]],
            total: 1,
            page: 1,
            pages: 1,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('robot');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets?q=robot&page=1');
    });

    it('should search with category parameter', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[0]],
            total: 1,
            page: 1,
            pages: 1,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('', 'model' as AssetCategory);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets?category=model&page=1');
    });

    it('should search with both query and category', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[0]],
            total: 1,
            page: 1,
            pages: 1,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('robot', 'model' as AssetCategory);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets?q=robot&category=model&page=1');
    });

    it('should update query state after search', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[0]],
            total: 1,
            page: 1,
            pages: 1,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('robot');
      });

      expect(result.current.query).toBe('robot');
    });

    it('should update category state after search', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[1]],
            total: 1,
            page: 1,
            pages: 1,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('', 'hdr' as AssetCategory);
      });

      expect(result.current.category).toBe('hdr');
    });
  });

  describe('Pagination', () => {
    it('should fetch specific page', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[0]],
            total: 10,
            page: 2,
            pages: 5,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('', '', 2);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets?page=2');
    });

    it('should update page state', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[1]],
            total: 10,
            page: 3,
            pages: 5,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('', '', 3);
      });

      expect(result.current.page).toBe(3);
    });

    it('should use setPage helper', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[0]],
            total: 1,
            page: 1,
            pages: 1,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[1]],
            total: 10,
            page: 2,
            pages: 5,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Set query first
      await act(async () => {
        await result.current.search('test');
      });

      // Then change page
      await act(async () => {
        await result.current.setPage(2);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets?q=test&page=2');
    });
  });

  describe('Error Handling', () => {
    it('should set error on fetch failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('test');
      });

      expect(result.current.error).toBe('Network error');
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('test');
      });

      expect(result.current.error).toBe('Search failed');
    });

    it('should clear error on successful search', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: mockAssets,
            total: 2,
            page: 1,
            pages: 1,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      // First search fails
      await act(async () => {
        await result.current.search('fail');
      });

      expect(result.current.error).toBe('Network error');

      // Second search succeeds
      await act(async () => {
        await result.current.search('success');
      });

      expect(result.current.error).toBeNull();
    });

    it('should set loading to false even on error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('test');
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search results', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [],
            total: 0,
            page: 1,
            pages: 0,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search('nonexistent');
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.total).toBe(0);
    });

    it('should handle search with undefined parameters', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: mockAssets,
            total: 2,
            page: 1,
            pages: 1,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.search();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets?page=1');
    });

    it('should preserve current query when not provided', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0, page: 1, pages: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[0]],
            total: 1,
            page: 1,
            pages: 1,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [mockAssets[0]],
            total: 1,
            page: 2,
            pages: 2,
          }),
        });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Search with query
      await act(async () => {
        await result.current.search('robot');
      });

      // Search without query (should preserve 'robot')
      await act(async () => {
        await result.current.search(undefined, undefined, 2);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets?q=robot&page=2');
    });

    it('should handle all asset categories', async () => {
      const categories: AssetCategory[] = ['model', 'hdr', 'texture', 'audio'];

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [],
          total: 0,
          page: 1,
          pages: 1,
        }),
      });

      const { result } = renderHook(() => useAssetLibrary());

      await waitFor(() => expect(result.current.loading).toBe(false));

      for (const cat of categories) {
        await act(async () => {
          await result.current.search('', cat);
        });

        expect(result.current.category).toBe(cat);
      }
    });
  });
});
