'use client';

import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { RevenueDataPoint } from '../hooks/useCreatorStats';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type TimeRange = '7D' | '30D' | '90D' | 'ALL';

export interface RevenueChartProps {
  data: RevenueDataPoint[];
  loading?: boolean;
}

export function RevenueChart({ data, loading }: RevenueChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30D');

  const filteredData = useMemo(() => {
    if (!data) return [];

    const _now = new Date();
    const ranges: Record<TimeRange, number> = {
      '7D': 7,
      '30D': 30,
      '90D': 90,
      ALL: Infinity,
    };

    const daysToShow = ranges[timeRange];
    if (daysToShow === Infinity) return data;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToShow);

    return data.filter((point) => new Date(point.date) >= cutoffDate);
  }, [data, timeRange]);

  const chartData = useMemo(() => {
    return {
      labels: filteredData.map((point) => {
        const date = new Date(point.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [
        {
          label: 'Primary Sales',
          data: filteredData.map((point) => point.primarySales),
          borderColor: 'rgb(99, 102, 241)',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Royalties',
          data: filteredData.map((point) => point.royalties),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }, [filteredData]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            color: 'rgb(156, 163, 175)',
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.9)',
          titleColor: 'rgb(229, 231, 235)',
          bodyColor: 'rgb(156, 163, 175)',
          borderColor: 'rgb(55, 65, 81)',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function (context: { dataset: { label?: string }; parsed: { y: number | null } }) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(context.parsed.y);
              }
              return label;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(55, 65, 81, 0.3)',
          },
          ticks: {
            color: 'rgb(156, 163, 175)',
          },
        },
        y: {
          grid: {
            color: 'rgba(55, 65, 81, 0.3)',
          },
          ticks: {
            color: 'rgb(156, 163, 175)',
            callback: function (value: string | number) {
              return '$' + value.toLocaleString();
            },
          },
        },
      },
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
    }),
    []
  );

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-32 mb-4"></div>
        <div className="h-64 bg-gray-700 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Revenue Over Time</h2>
        <div className="flex gap-2">
          {(['7D', '30D', '90D', 'ALL'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
