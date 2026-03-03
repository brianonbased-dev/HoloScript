'use client';

import { useCreatorStats } from '../hooks/useCreatorStats';
import { StatCard } from './StatCard';
import { RevenueChart } from './RevenueChart';
import { AnalyticsPanel } from './AnalyticsPanel';
import { NFTGallery } from './NFTGallery';
import { AlertCircle, RefreshCw, Brain, Bot, Puzzle, Package, Layers, Star, Download, DollarSign } from 'lucide-react';
import type { ContentTypeStats } from '../hooks/useCreatorStats';

const CONTENT_TYPE_ICONS: Record<string, typeof Brain> = {
  scene: Layers,
  skill: Brain,
  agent_config: Bot,
  trait: Puzzle,
  plugin: Package,
};

const CONTENT_TYPE_COLORS: Record<string, string> = {
  scene: 'bg-indigo-500/20 text-indigo-400',
  skill: 'bg-amber-500/20 text-amber-400',
  agent_config: 'bg-cyan-500/20 text-cyan-400',
  trait: 'bg-emerald-500/20 text-emerald-400',
  plugin: 'bg-rose-500/20 text-rose-400',
};

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
            <h1 className="text-3xl font-bold text-white mb-2">Creator Dashboard</h1>
            <p className="text-gray-400">
              Track sales, content performance, and marketplace analytics
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

        {/* Stats Grid — includes both NFT + content metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          <StatCard
            title="Total Sales"
            value={stats?.totalSales || 0}
            format="usd"
            trend={12.5}
            loading={loading}
          />
          <StatCard
            title="Royalties"
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
            title="Content Items"
            value={stats?.totalContent || 0}
            format="number"
            loading={loading}
          />
          <StatCard
            title="Published"
            value={stats?.totalPublished || 0}
            format="number"
            loading={loading}
          />
          <StatCard
            title="Downloads"
            value={stats?.totalDownloads || 0}
            format="number"
            trend={22.1}
            loading={loading}
          />
          <StatCard
            title="Content Rev"
            value={(stats?.totalContentRevenue || 0) / 100}
            format="usd"
            trend={15.0}
            loading={loading}
          />
        </div>

        {/* Content Overview by Type */}
        {stats?.contentByType && stats.contentByType.length > 0 && !loading && (
          <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-700/50 px-5 py-3">
              <h2 className="text-sm font-semibold text-white">Marketplace Content</h2>
              <span className="text-xs text-gray-500">
                {stats.totalPublished} of {stats.totalContent} published
              </span>
            </div>
            <div className="divide-y divide-gray-700/30">
              {stats.contentByType.map((ct: ContentTypeStats) => {
                const Icon = CONTENT_TYPE_ICONS[ct.type] || Package;
                const colorClass = CONTENT_TYPE_COLORS[ct.type] || 'bg-gray-500/20 text-gray-400';

                return (
                  <div key={ct.type} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-700/20 transition">
                    {/* Icon + Label */}
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white">{ct.label}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {ct.count} items · {ct.published} live
                      </span>
                    </div>

                    {/* Downloads */}
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Download className="h-3 w-3" />
                      {ct.downloads.toLocaleString()}
                    </div>

                    {/* Revenue */}
                    <div className="flex items-center gap-1 text-xs text-emerald-400 w-20 justify-end">
                      <DollarSign className="h-3 w-3" />
                      {(ct.revenue / 100).toFixed(2)}
                    </div>

                    {/* Rating */}
                    <div className="flex items-center gap-1 text-xs text-amber-400 w-16 justify-end">
                      <Star className="h-3 w-3 fill-amber-400" />
                      {ct.rating.toFixed(1)}
                      <span className="text-gray-500">({ct.ratingCount})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
