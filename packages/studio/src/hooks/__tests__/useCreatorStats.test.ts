// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreatorStats } from '../useCreatorStats';
import React from 'react';

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
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  describe('Initial State', () => {
    it('should start with loading state', () => {
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

      expect(result.current.loading).toBe(true);
      expect(result.current.stats).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it('should accept custom address option', () => {
      const { result } = renderHook(
        () => useCreatorStats({ address: '0xCustomAddress' }),
        { wrapper }
      );

      expect(result.current.loading).toBe(true);
    });
  });

  describe('Data Fetching', () => {
    it('should load creator stats successfully', async () => {
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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

  describe('Address Parameter', () => {
    it('should fetch stats for custom address', async () => {
      const customAddress = '0xCustomCreator123';
      const { result } = renderHook(
        () => useCreatorStats({ address: customAddress }),
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

    it('should update when address changes', async () => {
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

      const firstNFT = result.current.stats!.mintedNFTs[0];

      rerender({ address: '0xAddress2' });

      await waitFor(
        () => {
          const currentNFT = result.current.stats?.mintedNFTs[0];
          expect(currentNFT?.zoraUrl).not.toBe(firstNFT.zoraUrl);
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Manual Refetch', () => {
    it('should provide refetch function', async () => {
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

  describe('Data Consistency', () => {
    it('should have consistent total sales calculation', async () => {
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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

  describe('NFT Status Distribution', () => {
    it('should have valid NFT statuses', async () => {
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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

  describe('Date Formatting', () => {
    it('should have correctly formatted revenue dates', async () => {
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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

  describe('Edge Cases', () => {
    it('should handle zero sales gracefully', async () => {
      const { result } = renderHook(() => useCreatorStats(), { wrapper });

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
      const { unmount } = renderHook(() => useCreatorStats(), { wrapper });
      unmount();
      // Should not throw
    });
  });
});
