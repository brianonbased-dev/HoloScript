'use client';

import { useCreatorStats } from '../hooks/useCreatorStats';
import { StatCard } from './StatCard';
import { RevenueChart } from './RevenueChart';
import { AnalyticsPanel } from './AnalyticsPanel';
import { NFTGallery } from './NFTGallery';
import { AlertCircle, RefreshCw } from 'lucide-react';

export interface CreatorDashboardProps {
  address?: string;
  refetchInterval?: number;
}

export function CreatorDashboard({ address, refetchInterval }: CreatorDashboardProps) {
  const { stats, loading, error, refetch } = useCreatorStats({
    address,
    refetchInterval,
  });

  // Error State
  if (error && !loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-red-500 font-semibold mb-2">Error Loading Dashboard</h3>
              <p className="text-gray-300 mb-4">
                {error instanceof Error ? error.message : 'Failed to load creator statistics'}
              </p>
              <button
                onClick={() => refetch()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Film3D Creator Dashboard</h1>
            <p className="text-gray-400">
              Track your NFT sales, royalties, and analytics
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            title="Total Sales"
            value={stats?.totalSales || 0}
            format="usd"
            trend={12.5}
            loading={loading}
          />
          <StatCard
            title="Royalties Earned"
            value={stats?.royaltiesEarned || 0}
            format="usd"
            trend={8.3}
            loading={loading}
          />
          <StatCard
            title="NFTs Minted"
            value={stats?.nftsMinted || 0}
            format="number"
            loading={loading}
          />
          <StatCard
            title="Floor Price"
            value={stats?.floorPrice || 0}
            format="eth"
            trend={5.2}
            loading={loading}
          />
          <StatCard
            title="Avg Sale Price"
            value={stats?.averageSalePrice || 0}
            format="eth"
            trend={-2.1}
            loading={loading}
          />
          <StatCard
            title="Collectors"
            value={stats?.collectors || 0}
            format="number"
            trend={15.7}
            loading={loading}
          />
        </div>

        {/* Revenue Chart */}
        <RevenueChart data={stats?.revenueOverTime || []} loading={loading} />

        {/* Analytics Panel */}
        <AnalyticsPanel stats={stats!} loading={loading} />

        {/* NFT Gallery */}
        <NFTGallery nfts={stats?.mintedNFTs || []} loading={loading} />

        {/* Footer Info */}
        {stats && !loading && (
          <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 text-gray-400">
              <span>Last updated: {new Date().toLocaleString()}</span>
              <span>•</span>
              <span>Total Views: {stats.totalViews.toLocaleString()}</span>
            </div>
            <div className="text-gray-400">
              Wallet: {address?.slice(0, 6)}...{address?.slice(-4)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
