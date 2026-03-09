// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreatorStats } from '../useCreatorStats';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock the marketplace API client
// ---------------------------------------------------------------------------

const mockFetchCreatorContent = vi.fn();

vi.mock('@/lib/marketplaceApi', () => ({
  fetchCreatorContent: (...args: unknown[]) => mockFetchCreatorContent(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApiResponse(overrides: Record<string, unknown> = {}) {
  return {
    traits: [
      {
        id: 'trait-1',
        name: 'spatial-audio',
        version: '1.0.0',
        description: 'Spatial audio trait',
        author: { name: 'TestCreator', verified: true },
        category: 'audio',
        platforms: ['web'],
        downloads: 150,
        rating: 4.5,
        ratingCount: 10,
        verified: true,
        deprecated: false,
        updatedAt: '2026-03-01T00:00:00Z',
      },
    ],
    plugins: [
      {
        id: 'plugin-1',
        name: 'shader-preview',
        version: '2.0.0',
        description: 'Shader preview plugin',
        author: { name: 'TestCreator', verified: true },
        category: 'rendering',
        downloads: 80,
        rating: 4.8,
        ratingCount: 5,
        verified: true,
        updatedAt: '2026-03-01T00:00:00Z',
      },
    ],
    skills: [],
    contentByType: [
      {
        type: 'trait',
        label: 'Traits',
        count: 1,
        published: 1,
        downloads: 150,
        revenue: 0,
        rating: 4.5,
        ratingCount: 10,
      },
      {
        type: 'plugin',
        label: 'Plugins',
        count: 1,
        published: 1,
        downloads: 80,
        revenue: 0,
        rating: 4.8,
        ratingCount: 5,
      },
    ],
    totalContent: 2,
    totalPublished: 2,
    totalDownloads: 230,
    totalContentRevenue: 0,
    ...overrides,
  };
}

describe('useCreatorStats', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    mockFetchCreatorContent.mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // =========================================================================
  // Initial State
  // =========================================================================

  describe('Initial State', () => {
    it('should start with loading state', () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      expect(result.current.loading).toBe(true);
      expect(result.current.stats).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it('should accept custom address option', () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats({ address: '0xCustomAddress' }), {
        wrapper,
      });

      expect(result.current.loading).toBe(true);
    });
  });

  // =========================================================================
  // Real API Integration
  // =========================================================================

  describe('API Integration', () => {
    it('should fetch and transform real API data', async () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats({ address: '0xRealCreator' }), {
        wrapper,
      });

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(mockFetchCreatorContent).toHaveBeenCalledWith('0xRealCreator');
      expect(result.current.stats).toBeDefined();
      expect(result.current.error).toBeNull();
      expect(result.current.isMock).toBe(false);
    });

    it('should populate multi-content stats from API data', async () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.totalContent).toBe(2);
      expect(stats.totalPublished).toBe(2);
      expect(stats.totalDownloads).toBe(230);
      expect(stats.contentByType).toHaveLength(2);
      expect(stats.contentByType[0].type).toBe('trait');
      expect(stats.contentByType[1].type).toBe('plugin');
    });

    it('should still include NFT stats (mocked) alongside real content stats', async () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      // NFT stats are still present (from mock NFT layer)
      expect(stats).toHaveProperty('totalSales');
      expect(stats).toHaveProperty('royaltiesEarned');
      expect(stats).toHaveProperty('nftsMinted');
      expect(stats).toHaveProperty('mintedNFTs');
      expect(stats.mintedNFTs).toBeInstanceOf(Array);
      expect(stats.mintedNFTs.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Mock Fallback
  // =========================================================================

  describe('Mock Fallback', () => {
    it('should fall back to mock data when API is unreachable', async () => {
      mockFetchCreatorContent.mockRejectedValue(new Error('Network error: API unreachable'));

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(result.current.stats).toBeDefined();
      expect(result.current.stats?.isMockData).toBe(true);
      expect(result.current.isMock).toBe(true);
      // No error surfaced because fallback handled it
      expect(result.current.error).toBeNull();
    });

    it('should use mock data when forceMock is true', async () => {
      // API should NOT be called when forceMock is set
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      expect(mockFetchCreatorContent).not.toHaveBeenCalled();
      expect(result.current.stats?.isMockData).toBe(true);
      expect(result.current.isMock).toBe(true);
    });

    it('should produce complete mock data structure on fallback', async () => {
      mockFetchCreatorContent.mockRejectedValue(new Error('timeout'));

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.mintedNFTs).toBeInstanceOf(Array);
      expect(stats.mintedNFTs.length).toBeGreaterThan(0);
      expect(stats.revenueOverTime).toBeInstanceOf(Array);
      expect(stats.revenueOverTime.length).toBe(30);
      expect(stats.contentByType).toBeInstanceOf(Array);
      expect(stats.contentByType.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Data Consistency (works for both API and mock paths)
  // =========================================================================

  describe('Data Fetching', () => {
    beforeEach(() => {
      // Use forceMock to get deterministic mock data for consistency tests
    });

    it('should load creator stats successfully', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        { timeout: 3000 }
      );

      expect(result.current.stats).toBeDefined();
      expect(result.current.stats).toHaveProperty('totalSales');
      expect(result.current.stats).toHaveProperty('royaltiesEarned');
      expect(result.current.stats).toHaveProperty('nftsMinted');
      expect(result.current.error).toBeNull();
    });

    it('should return valid NFT data structure', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.mintedNFTs).toBeInstanceOf(Array);
      expect(stats.mintedNFTs.length).toBeGreaterThan(0);

      const nft = stats.mintedNFTs[0];
      expect(nft).toHaveProperty('id');
      expect(nft).toHaveProperty('name');
      expect(nft).toHaveProperty('description');
      expect(nft).toHaveProperty('imageUrl');
      expect(nft).toHaveProperty('price');
      expect(nft).toHaveProperty('status');
      expect(['minted', 'listed', 'sold']).toContain(nft.status);
    });

    it('should return revenue over time data', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.revenueOverTime).toBeInstanceOf(Array);
      expect(stats.revenueOverTime.length).toBe(30);

      const dataPoint = stats.revenueOverTime[0];
      expect(dataPoint).toHaveProperty('date');
      expect(dataPoint).toHaveProperty('primarySales');
      expect(dataPoint).toHaveProperty('royalties');
      expect(dataPoint).toHaveProperty('total');
      expect(dataPoint.total).toBe(dataPoint.primarySales + dataPoint.royalties);
    });

    it('should calculate top performing NFTs', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.topPerforming).toBeInstanceOf(Array);
      expect(stats.topPerforming.length).toBeLessThanOrEqual(5);

      // Should be sorted by sales count (descending)
      for (let i = 1; i < stats.topPerforming.length; i++) {
        expect(stats.topPerforming[i - 1].salesCount).toBeGreaterThanOrEqual(
          stats.topPerforming[i].salesCount
        );
      }
    });

    it('should include revenue breakdown', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.revenueBreakdown).toBeDefined();
      expect(stats.revenueBreakdown).toHaveProperty('artist');
      expect(stats.revenueBreakdown).toHaveProperty('platform');
      expect(stats.revenueBreakdown).toHaveProperty('aiProviders');

      const breakdown = stats.revenueBreakdown;
      const sum = breakdown.artist + breakdown.platform + breakdown.aiProviders;
      expect(Math.abs(sum - stats.totalSales)).toBeLessThan(0.01);
    });

    it('should include floor price trend', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.floorPriceTrend).toBeDefined();
      expect(stats.floorPriceTrend).toHaveProperty('sevenDays');
      expect(stats.floorPriceTrend).toHaveProperty('thirtyDays');
      expect(stats.floorPriceTrend).toHaveProperty('allTime');
    });

    it('should calculate correct floor price', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      const minPrice = Math.min(...stats.mintedNFTs.map((n) => n.price));
      expect(stats.floorPrice).toBe(minPrice);
    });
  });

  // =========================================================================
  // Address Parameter
  // =========================================================================

  describe('Address Parameter', () => {
    it('should fetch stats for custom address', async () => {
      const customAddress = '0xCustomCreator123';
      const { result } = renderHook(
        () => useCreatorStats({ address: customAddress, forceMock: true }),
        { wrapper }
      );

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const nft = result.current.stats!.mintedNFTs[0];
      expect(nft.zoraUrl).toContain(customAddress);
    });

    it('should pass address to API client', async () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats({ address: '0xApiAddress' }), {
        wrapper,
      });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      expect(mockFetchCreatorContent).toHaveBeenCalledWith('0xApiAddress');
    });

    it('should update when address changes', async () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result, rerender } = renderHook(
        ({ address }: { address: string }) => useCreatorStats({ address }),
        { wrapper, initialProps: { address: '0xAddress1' } }
      );

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      mockFetchCreatorContent.mockResolvedValue(makeApiResponse({ totalContent: 5 }));

      rerender({ address: '0xAddress2' });

      await waitFor(
        () => {
          expect(mockFetchCreatorContent).toHaveBeenCalledWith('0xAddress2');
        },
        { timeout: 3000 }
      );
    });
  });

  // =========================================================================
  // Manual Refetch
  // =========================================================================

  describe('Manual Refetch', () => {
    it('should provide refetch function', async () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      expect(typeof result.current.refetch).toBe('function');
    });
  });

  // =========================================================================
  // Data Consistency (mock path)
  // =========================================================================

  describe('Data Consistency', () => {
    it('should have consistent total sales calculation', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      const calculatedTotal = stats.mintedNFTs.reduce(
        (sum, nft) => sum + nft.price * nft.salesCount,
        0
      );
      expect(Math.abs(stats.totalSales - calculatedTotal)).toBeLessThan(0.01);
    });

    it('should have consistent royalties calculation', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      const calculatedRoyalties = stats.mintedNFTs.reduce(
        (sum, nft) => sum + nft.royaltiesEarned,
        0
      );
      expect(Math.abs(stats.royaltiesEarned - calculatedRoyalties)).toBeLessThan(0.01);
    });

    it('should have valid NFT count', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.nftsMinted).toBe(stats.mintedNFTs.length);
    });
  });

  // =========================================================================
  // NFT Status Distribution
  // =========================================================================

  describe('NFT Status Distribution', () => {
    it('should have valid NFT statuses', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      const validStatuses = ['minted', 'listed', 'sold'];

      stats.mintedNFTs.forEach((nft) => {
        expect(validStatuses).toContain(nft.status);
      });
    });
  });

  // =========================================================================
  // Date Formatting
  // =========================================================================

  describe('Date Formatting', () => {
    it('should have correctly formatted revenue dates', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;

      stats.revenueOverTime.forEach((dataPoint) => {
        expect(dataPoint.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('should have valid mint dates for NFTs', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;

      stats.mintedNFTs.forEach((nft) => {
        const mintDate = new Date(nft.mintedAt);
        expect(mintDate.getTime()).not.toBeNaN();
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        expect(mintDate.getTime()).toBeGreaterThan(ninetyDaysAgo);
      });
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle zero sales gracefully', async () => {
      const { result } = renderHook(() => useCreatorStats({ forceMock: true }), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(typeof stats.averageSalePrice).toBe('number');
      expect(stats.averageSalePrice).toBeGreaterThanOrEqual(0);
    });

    it('should handle unmount during loading', async () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { unmount } = renderHook(() => useCreatorStats(), { wrapper });
      unmount();
      // Should not throw
    });

    it('should handle empty API response gracefully', async () => {
      mockFetchCreatorContent.mockResolvedValue({
        traits: [],
        plugins: [],
        skills: [],
        contentByType: [],
        totalContent: 0,
        totalPublished: 0,
        totalDownloads: 0,
        totalContentRevenue: 0,
      });

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      const stats = result.current.stats!;
      expect(stats.totalContent).toBe(0);
      expect(stats.totalDownloads).toBe(0);
      expect(stats.contentByType).toEqual([]);
      expect(stats.isMockData).toBe(false);
    });
  });

  // =========================================================================
  // isMock indicator
  // =========================================================================

  describe('isMock indicator', () => {
    it('should report isMock=false when API succeeds', async () => {
      mockFetchCreatorContent.mockResolvedValue(makeApiResponse());

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      expect(result.current.isMock).toBe(false);
    });

    it('should report isMock=true when API fails', async () => {
      mockFetchCreatorContent.mockRejectedValue(new Error('ECONNREFUSED'));

      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      await waitFor(
        () => {
          expect(result.current.stats).toBeDefined();
        },
        { timeout: 3000 }
      );

      expect(result.current.isMock).toBe(true);
    });
  });
});
