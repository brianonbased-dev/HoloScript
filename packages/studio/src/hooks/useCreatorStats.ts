'use client';

import { useQuery } from '@tanstack/react-query';

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
  revenue: number;       // USD cents
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
  totalContentRevenue: number;  // across all content types (USD cents)
}

// Mock data generator for development
const generateMockStats = (address: string): CreatorStats => {
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
    { type: 'scene', label: 'Scenes', count: 8, published: 5, downloads: 342, revenue: 4999, rating: 4.3, ratingCount: 28 },
    { type: 'skill', label: 'AI Skills', count: 3, published: 2, downloads: 127, revenue: 2999, rating: 4.7, ratingCount: 12 },
    { type: 'agent_config', label: 'Agent Configs', count: 2, published: 1, downloads: 45, revenue: 999, rating: 4.5, ratingCount: 5 },
    { type: 'trait', label: 'Traits', count: 5, published: 3, downloads: 89, revenue: 1499, rating: 4.1, ratingCount: 9 },
    { type: 'plugin', label: 'Plugins', count: 1, published: 1, downloads: 67, revenue: 0, rating: 4.8, ratingCount: 3 },
  ];
  const totalContent = contentByType.reduce((s, c) => s + c.count, 0);
  const totalPublished = contentByType.reduce((s, c) => s + c.published, 0);
  const totalDownloads = contentByType.reduce((s, c) => s + c.downloads, 0);
  const totalContentRevenue = contentByType.reduce((s, c) => s + c.revenue, 0);

  return {
    totalSales,
    royaltiesEarned,
    nftsMinted: mockNFTs.length,
    floorPrice: Math.min(...mockNFTs.map(n => n.price)),
    averageSalePrice: totalSales / mockNFTs.reduce((sum, n) => sum + n.salesCount, 0) || 0,
    collectors: Math.floor(Math.random() * 500) + 50,
    totalViews: Math.floor(Math.random() * 10000) + 1000,
    revenueOverTime: revenueData,
    mintedNFTs: mockNFTs,
    topPerforming: mockNFTs.sort((a, b) => b.salesCount - a.salesCount).slice(0, 5),
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
  };
};

export interface UseCreatorStatsOptions {
  address?: string;
  refetchInterval?: number;
}

export function useCreatorStats(options: UseCreatorStatsOptions = {}) {
  const { address = '0x1234567890abcdef', refetchInterval = 30000 } = options;

  const { data, isLoading, error, refetch } = useQuery<CreatorStats>({
    queryKey: ['creatorStats', address],
    queryFn: async () => {
      // TODO: Replace with actual CreatorMonetization service call
      // const monetization = new CreatorMonetization({ ... });
      // return await monetization.getCreatorStats(address);

      // Mock delay to simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      return generateMockStats(address);
    },
    refetchInterval,
    staleTime: 10000,
  });

  return {
    stats: data,
    loading: isLoading,
    error,
    refetch,
  };
}
