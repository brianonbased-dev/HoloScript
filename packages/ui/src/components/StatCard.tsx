'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

export type StatFormat = 'usd' | 'eth' | 'number';

export interface StatCardProps {
  title: string;
  value: number;
  format: StatFormat;
  trend?: number; // percentage change
  loading?: boolean;
}

const formatValue = (value: number, format: StatFormat): string => {
  switch (format) {
    case 'usd':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case 'eth':
      return `${value.toFixed(4)} ETH`;
    case 'number':
      return new Intl.NumberFormat('en-US').format(value);
    default:
      return String(value);
  }
};

export function StatCard({ title, value, format, trend, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-24 mb-4"></div>
        <div className="h-8 bg-gray-700 rounded w-32 mb-2"></div>
        <div className="h-4 bg-gray-700 rounded w-16"></div>
      </div>
    );
  }

  const formattedValue = formatValue(value, format);
  const isPositive = trend !== undefined && trend > 0;
  const isNegative = trend !== undefined && trend < 0;

  return (
    <div className="bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition-colors">
      <h3 className="text-gray-400 text-sm font-medium mb-2">{title}</h3>
      <p className="text-white text-3xl font-bold mb-2">{formattedValue}</p>
      {trend !== undefined && (
        <div className="flex items-center gap-1">
          {isPositive && <TrendingUp className="w-4 h-4 text-green-500" />}
          {isNegative && <TrendingDown className="w-4 h-4 text-red-500" />}
          <span
            className={`text-sm font-medium ${
              isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-400'
            }`}
          >
            {isPositive && '+'}
            {trend.toFixed(1)}%
          </span>
          <span className="text-gray-400 text-sm ml-1">vs last period</span>
        </div>
      )}
    </div>
  );
}
