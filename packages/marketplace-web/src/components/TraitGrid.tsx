'use client';

import type { TraitSummary } from '@/types';
import { TraitCard } from './TraitCard';
import { Loader2, Package } from 'lucide-react';

interface TraitGridProps {
  traits: TraitSummary[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function TraitGrid({
  traits,
  isLoading = false,
  emptyMessage = 'No traits found',
}: TraitGridProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <TraitCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (traits.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="h-16 w-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{emptyMessage}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  // Grid of traits
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {traits.map((trait) => (
        <TraitCard key={trait.id} trait={trait} />
      ))}
    </div>
  );
}

function TraitCardSkeleton() {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden animate-pulse">
      {/* Header */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-700">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
          <div className="flex-1">
            <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4 mb-2" />
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="p-4">
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full mb-2" />
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-4/5" />
      </div>

      {/* Tags */}
      <div className="px-4 pb-3 flex gap-2">
        <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded-full w-20" />
        <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded-full w-16" />
        <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded-full w-14" />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
        <div className="flex gap-4">
          <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-12" />
          <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-16" />
        </div>
        <div className="h-8 bg-zinc-200 dark:bg-zinc-700 rounded-lg w-20" />
      </div>
    </div>
  );
}
