'use client';

import Link from 'next/link';
import type { TraitSummary } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { Download, Star, CheckCircle, ArrowRight } from 'lucide-react';

interface PopularTraitsProps {
  traits: TraitSummary[];
}

export function PopularTraits({ traits }: PopularTraitsProps) {
  const formatDownloads = (count: number): string => {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {traits.map((trait) => (
        <Link
          key={trait.id}
          href={`/traits/${encodeURIComponent(trait.id)}`}
          className="group flex items-center gap-4 p-4 bg-white dark:bg-zinc-800 
            rounded-xl border border-zinc-200 dark:border-zinc-700
            hover:border-holoscript-300 dark:hover:border-holoscript-700
            hover:shadow-md transition-all"
        >
          {/* Rank / Avatar */}
          <div
            className="flex-shrink-0 w-12 h-12 bg-holoscript-100 dark:bg-holoscript-900/30 
            rounded-lg flex items-center justify-center 
            text-holoscript-600 dark:text-holoscript-400 font-bold text-lg"
          >
            {trait.author.avatar ? (
              <img
                src={trait.author.avatar}
                alt={trait.author.name}
                className="w-full h-full rounded-lg object-cover"
              />
            ) : (
              trait.name.charAt(0).toUpperCase()
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-zinc-900 dark:text-white truncate">{trait.name}</h3>
              {trait.verified && (
                <CheckCircle className="h-3.5 w-3.5 text-holoscript-500 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              <span className={`category-${trait.category} px-1.5 py-0.5 rounded-full`}>
                {CATEGORY_LABELS[trait.category]}
              </span>
              <div className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                {formatDownloads(trait.downloads)}
              </div>
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                {trait.rating.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Arrow */}
          <ArrowRight
            className="h-4 w-4 text-zinc-400 group-hover:text-holoscript-500 
            group-hover:translate-x-1 transition-all flex-shrink-0"
          />
        </Link>
      ))}
    </div>
  );
}
