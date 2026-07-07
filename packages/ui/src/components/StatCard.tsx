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
      <div className="bg-studio-panel rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-studio-surface rounded w-24 mb-4"></div>
        <div className="h-8 bg-studio-surface rounded w-32 mb-2"></div>
        <div className="h-4 bg-studio-surface rounded w-16"></div>
      </div>
    );
  }

  const formattedValue = formatValue(value, format);
  const isPositive = trend !== undefined && trend > 0;
  const isNegative = trend !== undefined && trend < 0;

  return (
    <div className="bg-studio-panel rounded-lg p-6 hover:bg-studio-panel-hover transition-colors">
      <h3 className="text-studio-muted text-sm font-medium mb-2">{title}</h3>
      <p className="text-studio-text text-3xl font-bold mb-2">{formattedValue}</p>
      {trend !== undefined && (
        <div className="flex items-center gap-1">
          {isPositive && <TrendingUp className="w-4 h-4 text-studio-success" />}
          {isNegative && <TrendingDown className="w-4 h-4 text-studio-error" />}
          <span
            className={`text-sm font-medium ${
              isPositive ? 'text-studio-success' : isNegative ? 'text-studio-error' : 'text-studio-muted'
            }`}
          >
            {isPositive && '+'}
            {trend.toFixed(1)}%
          </span>
          <span className="text-studio-muted text-sm ml-1">vs last period</span>
        </div>
      )}
    </div>
  );
}
