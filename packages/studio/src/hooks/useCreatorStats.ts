'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchCreatorContent } from '@/lib/marketplaceApi';
import type { MarketplaceCreatorData } from '@/lib/marketplaceApi';

// ---------------------------------------------------------------------------
// Public interfaces (unchanged -- consumed by dashboard components)
// ---------------------------------------------------------------------------

export interface NFTData {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  status: 'minted' | 'listed' | 'sold';
  salesCount: number;
  royaltiesEarned: number;
  mintedAt: string;
  zoraUrl: string;
}

export interface RevenueDataPoint {
  date: string;
  primarySales: number;
  royalties: number;
  total: number;
}

/**
 * Per-content-type analytics
 */
export interface ContentTypeStats {
  type: string;
  label: string;
  count: number;
  published: number;
  downloads: number;
  revenue: number; // USD cents
  rating: number;
  ratingCount: number;
}

export interface CreatorStats {
  // Existing NFT stats
  totalSales: number;
  royaltiesEarned: number;
  nftsMinted: number;
  floorPrice: number;
  averageSalePrice: number;
  collectors: number;
  totalViews: number;
  revenueOverTime: RevenueDataPoint[];
  mintedNFTs: NFTData[];
  topPerforming: NFTData[];
  revenueBreakdown: {
    artist: number;
    platform: number;
    aiProviders: number;
  };
  floorPriceTrend: {
    sevenDays: number;
    thirtyDays: number;
    allTime: number;
  };

  // Multi-content analytics
  contentByType: ContentTypeStats[];
  totalContent: number;
  totalPublished: number;
  totalDownloads: number;
  totalContentRevenue: number; // across all content types (USD cents)

  /** True when the data was generated from the local mock fallback. */
  isMockData?: boolean;
}

// ---------------------------------------------------------------------------
// Mock data generator (fallback when API is unreachable)
// ---------------------------------------------------------------------------

/**
 * Generates deterministic mock data for the creator dashboard.
 *
 * Used as a fallback during local development when the marketplace-api
 * is not running, or when the API returns an error.
 */
export const generateMockStats = (address: string): CreatorStats => {
  const mockNFTs: NFTData[] = Array.from({ length: 12 }, (_, i) => ({
    id: `nft-${i + 1}`,
    name: `Film3D Scene #${i + 1}`,
    description: `AI-generated cinematic scene with advanced lighting`,
    imageUrl: `/api/placeholder/300/300?text=Scene${i + 1}`,
    price: 0.1 + Math.random() * 0.5,
    status: ['minted', 'listed', 'sold'][Math.floor(Math.random() * 3)] as NFTData['status'],
    salesCount: Math.floor(Math.random() * 20),
    royaltiesEarned: Math.random() * 10,
    mintedAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
    zoraUrl: `https://zora.co/collect/eth:0x${address}/nft-${i + 1}`,
  }));

  const revenueData: RevenueDataPoint[] = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const primarySales = Math.random() * 500;
    const royalties = Math.random() * 200;
    return {
      date: date.toISOString().split('T')[0],
      primarySales,
      royalties,
      total: primarySales + royalties,
    };
  });

  const totalSales = mockNFTs.reduce((sum, nft) => sum + nft.price * nft.salesCount, 0);
  const royaltiesEarned = mockNFTs.reduce((sum, nft) => sum + nft.royaltiesEarned, 0);

  // Multi-content mock data
  const contentByType: ContentTypeStats[] = [
    {
      type: 'scene',
      label: 'Scenes',
      count: 8,
      published: 5,
      downloads: 342,
      revenue: 4999,
      rating: 4.3,
      ratingCount: 28,
    },
    {
      type: 'skill',
      label: 'AI Skills',
      count: 3,
      published: 2,
      downloads: 127,
      revenue: 2999,
      rating: 4.7,
      ratingCount: 12,
    },
    {
      type: 'agent_config',
      label: 'Agent Configs',
      count: 2,
      published: 1,
      downloads: 45,
      revenue: 999,
      rating: 4.5,
      ratingCount: 5,
    },
    {
      type: 'trait',
      label: 'Traits',
      count: 5,
      published: 3,
      downloads: 89,
      revenue: 1499,
      rating: 4.1,
      ratingCount: 9,
    },
    {
      type: 'plugin',
      label: 'Plugins',
      count: 1,
      published: 1,
      downloads: 67,
      revenue: 0,
      rating: 4.8,
      ratingCount: 3,
    },
  ];
  const totalContent = contentByType.reduce((s, c) => s + c.count, 0);
  const totalPublished = contentByType.reduce((s, c) => s + c.published, 0);
  const totalDownloads = contentByType.reduce((s, c) => s + c.downloads, 0);
  const totalContentRevenue = contentByType.reduce((s, c) => s + c.revenue, 0);

  return {
    totalSales,
    royaltiesEarned,
    nftsMinted: mockNFTs.length,
    floorPrice: Math.min(...mockNFTs.map((n) => n.price)),
    averageSalePrice: totalSales / mockNFTs.reduce((sum, n) => sum + n.salesCount, 0) || 0,
    collectors: Math.floor(Math.random() * 500) + 50,
    totalViews: Math.floor(Math.random() * 10000) + 1000,
    revenueOverTime: revenueData,
    mintedNFTs: mockNFTs,
    topPerforming: [...mockNFTs].sort((a, b) => b.salesCount - a.salesCount).slice(0, 5),
    revenueBreakdown: {
      artist: totalSales * 0.8,
      platform: totalSales * 0.1,
      aiProviders: totalSales * 0.1,
    },
    floorPriceTrend: {
      sevenDays: 0.15,
      thirtyDays: 0.12,
      allTime: 0.1,
    },
    contentByType,
    totalContent,
    totalPublished,
    totalDownloads,
    totalContentRevenue,
    isMockData: true,
  };
};

// ---------------------------------------------------------------------------
// Transform marketplace API data into CreatorStats shape
// ---------------------------------------------------------------------------

/**
 * Merges live marketplace data with NFT data.
 *
 * NFT data (Zora on-chain stats) is not yet available from the marketplace
 * API and will continue to use mock values until the CreatorMonetization
 * service endpoints are deployed. The multi-content stats (traits, plugins,
 * skills) come from the real API.
 */
function transformToCreatorStats(apiData: MarketplaceCreatorData, address: string): CreatorStats {
  // NFT stats are still mocked until CreatorMonetization API is live.
  // We generate mock NFT data but use real multi-content stats from the API.
  const mockBase = generateMockStats(address);

  // Map API content types to the ContentTypeStats interface
  const contentByType: ContentTypeStats[] = apiData.contentByType.map((ct) => ({
    type: ct.type,
    label: ct.label,
    count: ct.count,
    published: ct.published,
    downloads: ct.downloads,
    revenue: ct.revenue,
    rating: Math.round(ct.rating * 10) / 10,
    ratingCount: ct.ratingCount,
  }));

  return {
    // NFT stats from mock (pending CreatorMonetization API)
    totalSales: mockBase.totalSales,
    royaltiesEarned: mockBase.royaltiesEarned,
    nftsMinted: mockBase.nftsMinted,
    floorPrice: mockBase.floorPrice,
    averageSalePrice: mockBase.averageSalePrice,
    collectors: mockBase.collectors,
    totalViews: mockBase.totalViews,
    revenueOverTime: mockBase.revenueOverTime,
    mintedNFTs: mockBase.mintedNFTs,
    topPerforming: mockBase.topPerforming,
    revenueBreakdown: mockBase.revenueBreakdown,
    floorPriceTrend: mockBase.floorPriceTrend,

    // Multi-content stats from real API
    contentByType,
    totalContent: apiData.totalContent,
    totalPublished: apiData.totalPublished,
    totalDownloads: apiData.totalDownloads,
    totalContentRevenue: apiData.totalContentRevenue,

    isMockData: false,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCreatorStatsOptions {
  /** Creator wallet address or username to fetch stats for. */
  address?: string;
  /** How often to refetch in ms (default: 30 000 = 30s). */
  refetchInterval?: number;
  /** Force mock data even when the API is available (useful for Storybook). */
  forceMock?: boolean;
}

/**
 * React hook that fetches creator analytics from the marketplace API.
 *
 * Features:
 * - Uses React Query (`@tanstack/react-query`) for caching, deduplication,
 *   and background refetching.
 * - Calls the marketplace-api REST endpoints for traits, plugins, and skills
 *   filtered by author.
 * - Falls back to deterministic mock data when the API is unreachable.
 * - NFT / Zora stats remain mocked until the CreatorMonetization endpoints
 *   are deployed.
 *
 * @example
 * ```tsx
 * const { stats, loading, error, isMock, refetch } = useCreatorStats({
 *   address: '0xCreator123',
 *   refetchInterval: 60_000,
 * });
 *
 * if (loading) return <Spinner />;
 * if (stats?.isMockData) return <Banner>Using demo data</Banner>;
 * ```
 */
export function useCreatorStats(options: UseCreatorStatsOptions = {}) {
  const { address = '0x1234567890abcdef', refetchInterval = 30000, forceMock = false } = options;

  const { data, isLoading, error, refetch } = useQuery<CreatorStats>({
    queryKey: ['creatorStats', address],
    queryFn: async () => {
      // If forced to mock, skip the API call entirely
      if (forceMock) {
        return generateMockStats(address);
      }

      try {
        const apiData = await fetchCreatorContent(address);
        return transformToCreatorStats(apiData, address);
      } catch {
        // API is unreachable -- fall back to mock data.
        // This is expected during local development when marketplace-api
        // is not running. We log a warning rather than throwing so the
        // dashboard remains usable.
        if (typeof console !== 'undefined') {
          console.warn(
            '[useCreatorStats] Marketplace API unreachable, using mock data. ' +
              'Start the marketplace-api dev server or set NEXT_PUBLIC_MARKETPLACE_URL.'
          );
        }
        return generateMockStats(address);
      }
    },
    refetchInterval,
    staleTime: 10000,
    // Don't retry aggressively when the API is down
    retry: 1,
    retryDelay: 2000,
  });

  return {
    stats: data,
    loading: isLoading,
    error,
    refetch,
    /** True when the returned data came from the mock fallback. */
    isMock: data?.isMockData ?? false,
  };
}
