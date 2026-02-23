'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { Download, TrendingUp } from 'lucide-react';
import type { CreatorStats } from '../hooks/useCreatorStats';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export interface AnalyticsPanelProps {
  stats: CreatorStats;
  loading?: boolean;
}

export function AnalyticsPanel({ stats, loading }: AnalyticsPanelProps) {
  const revenueBreakdownData = useMemo(() => {
    if (!stats) return null;

    return {
      labels: ['Artist (80%)', 'Platform (10%)', 'AI Providers (10%)'],
      datasets: [
        {
          data: [stats.revenueBreakdown.artist, stats.revenueBreakdown.platform, stats.revenueBreakdown.aiProviders],
          backgroundColor: [
            'rgba(99, 102, 241, 0.8)',
            'rgba(34, 197, 94, 0.8)',
            'rgba(251, 191, 36, 0.8)',
          ],
          borderColor: [
            'rgb(99, 102, 241)',
            'rgb(34, 197, 94)',
            'rgb(251, 191, 36)',
          ],
          borderWidth: 2,
        },
      ],
    };
  }, [stats]);

  const viewsData = useMemo(() => {
    if (!stats) return null;

    // Simulated weekly views data
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const totalViews = stats.totalViews;
    const viewsPerWeek = weeks.map((_, i) => Math.floor(totalViews / 4) + Math.random() * 500 - 250);

    return {
      labels: weeks,
      datasets: [
        {
          label: 'Views',
          data: viewsPerWeek,
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderColor: 'rgb(99, 102, 241)',
          borderWidth: 2,
        },
      ],
    };
  }, [stats]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: 'rgb(156, 163, 175)',
          font: { size: 11 },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: 'rgb(229, 231, 235)',
        bodyColor: 'rgb(156, 163, 175)',
        borderColor: 'rgb(55, 65, 81)',
        borderWidth: 1,
        padding: 12,
      },
    },
  };

  const barChartOptions = {
    ...chartOptions,
    scales: {
      x: {
        grid: { color: 'rgba(55, 65, 81, 0.3)' },
        ticks: { color: 'rgb(156, 163, 175)' },
      },
      y: {
        grid: { color: 'rgba(55, 65, 81, 0.3)' },
        ticks: { color: 'rgb(156, 163, 175)' },
      },
    },
  };

  const handleExportCSV = () => {
    if (!stats) return;

    const csvData = [
      ['NFT Name', 'Sales Count', 'Price (ETH)', 'Royalties Earned ($)', 'Status'],
      ...stats.mintedNFTs.map(nft => [
        nft.name,
        nft.salesCount.toString(),
        nft.price.toFixed(4),
        nft.royaltiesEarned.toFixed(2),
        nft.status,
      ]),
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `creator-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-40 mb-6"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-700 rounded"></div>
          <div className="h-64 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <p className="text-gray-400">No analytics data available</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Analytics</h2>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Revenue Breakdown Pie Chart */}
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-4">Revenue Distribution</h3>
          <div className="h-64">
            {revenueBreakdownData && <Pie data={revenueBreakdownData} options={chartOptions} />}
          </div>
        </div>

        {/* Views Bar Chart */}
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-4">Total Views (Last 4 Weeks)</h3>
          <div className="h-64">
            {viewsData && <Bar data={viewsData} options={barChartOptions} />}
          </div>
        </div>
      </div>

      {/* Floor Price Trend */}
      <div className="bg-gray-700 rounded-lg p-4 mb-6">
        <h3 className="text-white font-semibold mb-4">Floor Price Trend</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-600 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-2">7 Days</div>
            <div className="text-white text-2xl font-bold">{stats.floorPriceTrend.sevenDays.toFixed(4)} ETH</div>
            <div className="flex items-center gap-1 text-green-500 text-sm mt-2">
              <TrendingUp className="w-4 h-4" />
              <span>+{((stats.floorPriceTrend.sevenDays / stats.floorPriceTrend.allTime - 1) * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="bg-gray-600 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-2">30 Days</div>
            <div className="text-white text-2xl font-bold">{stats.floorPriceTrend.thirtyDays.toFixed(4)} ETH</div>
            <div className="flex items-center gap-1 text-green-500 text-sm mt-2">
              <TrendingUp className="w-4 h-4" />
              <span>+{((stats.floorPriceTrend.thirtyDays / stats.floorPriceTrend.allTime - 1) * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="bg-gray-600 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-2">All Time</div>
            <div className="text-white text-2xl font-bold">{stats.floorPriceTrend.allTime.toFixed(4)} ETH</div>
            <div className="text-gray-400 text-sm mt-2">Baseline</div>
          </div>
        </div>
      </div>

      {/* Top Performing NFTs Table */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-4">Top Performing NFTs</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="text-left text-gray-400 text-sm font-medium pb-3">Name</th>
                <th className="text-right text-gray-400 text-sm font-medium pb-3">Sales</th>
                <th className="text-right text-gray-400 text-sm font-medium pb-3">Price</th>
                <th className="text-right text-gray-400 text-sm font-medium pb-3">Royalties</th>
                <th className="text-right text-gray-400 text-sm font-medium pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.topPerforming.map((nft, index) => (
                <tr key={nft.id} className="border-b border-gray-600 last:border-0">
                  <td className="py-3 text-white font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">#{index + 1}</span>
                      {nft.name}
                    </div>
                  </td>
                  <td className="py-3 text-right text-white">{nft.salesCount}</td>
                  <td className="py-3 text-right text-white">{nft.price.toFixed(4)} ETH</td>
                  <td className="py-3 text-right text-green-500">${nft.royaltiesEarned.toFixed(2)}</td>
                  <td className="py-3 text-right">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        nft.status === 'sold'
                          ? 'bg-green-500/10 text-green-500'
                          : nft.status === 'listed'
                          ? 'bg-blue-500/10 text-blue-500'
                          : 'bg-gray-500/10 text-gray-400'
                      }`}
                    >
                      {nft.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
