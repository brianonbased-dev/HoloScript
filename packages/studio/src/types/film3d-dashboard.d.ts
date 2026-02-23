/**
 * Type definitions for Film3D Creator Dashboard
 * Auto-generated from implementation
 */

// ============================================================================
// NFT Data Types
// ============================================================================

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

// ============================================================================
// Revenue & Analytics Types
// ============================================================================

export interface RevenueDataPoint {
  date: string;
  primarySales: number;
  royalties: number;
  total: number;
}

export interface RevenueBreakdown {
  artist: number;      // 80% of revenue
  platform: number;    // 10% of revenue
  aiProviders: number; // 10% of revenue
}

export interface FloorPriceTrend {
  sevenDays: number;
  thirtyDays: number;
  allTime: number;
}

// ============================================================================
// Main Stats Interface
// ============================================================================

export interface CreatorStats {
  // Financial metrics
  totalSales: number;
  royaltiesEarned: number;
  floorPrice: number;
  averageSalePrice: number;

  // Collection metrics
  nftsMinted: number;
  collectors: number;
  totalViews: number;

  // Time-series data
  revenueOverTime: RevenueDataPoint[];

  // NFT collections
  mintedNFTs: NFTData[];
  topPerforming: NFTData[];

  // Revenue analytics
  revenueBreakdown: RevenueBreakdown;

  // Price trends
  floorPriceTrend: FloorPriceTrend;
}

// ============================================================================
// Component Props
// ============================================================================

export interface CreatorDashboardProps {
  address?: string;
  refetchInterval?: number;
}

export type StatFormat = 'usd' | 'eth' | 'number';

export interface StatCardProps {
  title: string;
  value: number;
  format: StatFormat;
  trend?: number;
  loading?: boolean;
}

export interface RevenueChartProps {
  data: RevenueDataPoint[];
  loading?: boolean;
}

export interface NFTGalleryProps {
  nfts: NFTData[];
  loading?: boolean;
}

export interface AnalyticsPanelProps {
  stats: CreatorStats;
  loading?: boolean;
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface UseCreatorStatsOptions {
  address?: string;
  refetchInterval?: number;
}

export interface UseCreatorStatsReturn {
  stats: CreatorStats | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// Chart Configuration Types
// ============================================================================

export type TimeRange = '7D' | '30D' | '90D' | 'ALL';

export interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  fill?: boolean;
  tension?: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

// ============================================================================
// Export Functions (for external use)
// ============================================================================

export type FormatValueFunction = (value: number, format: StatFormat) => string;

export type ExportCSVFunction = (stats: CreatorStats) => void;

// ============================================================================
// Constants
// ============================================================================

export const ITEMS_PER_PAGE = 12;

export const DEFAULT_REFETCH_INTERVAL = 30000; // 30 seconds

export const TIME_RANGES: TimeRange[] = ['7D', '30D', '90D', 'ALL'];

export const REVENUE_SPLIT = {
  ARTIST: 0.8,     // 80%
  PLATFORM: 0.1,   // 10%
  AI: 0.1,         // 10%
} as const;

// ============================================================================
// Integration Types (for CreatorMonetization service)
// ============================================================================

export interface CreatorMonetizationConfig {
  privateKey: string;
  rpcUrl: string;
  zoraNetwork: 'base-sepolia' | 'base-mainnet' | 'zora-mainnet';
}

export interface CreatorMonetization {
  getCreatorStats(address: string): Promise<CreatorStats>;
  mintNFT(params: MintNFTParams): Promise<MintNFTResponse>;
  withdrawEarnings(nftId: string): Promise<WithdrawResponse>;
  updatePrice(nftId: string, newPrice: number): Promise<UpdatePriceResponse>;
}

export interface MintNFTParams {
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  metadata?: Record<string, any>;
}

export interface MintNFTResponse {
  success: boolean;
  nftId: string;
  transactionHash: string;
  zoraUrl: string;
}

export interface WithdrawResponse {
  success: boolean;
  amount: number;
  transactionHash: string;
}

export interface UpdatePriceResponse {
  success: boolean;
  newPrice: number;
  transactionHash: string;
}
