'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { TraitSummary } from '@/types';
import { CATEGORY_LABELS, PLATFORM_LABELS } from '@/types';
import { useInstallStore } from '@/lib/store';
import { Download, Star, CheckCircle, Loader2, ArrowDownToLine, AlertTriangle, ShoppingCart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CheckoutModal } from './CheckoutModal';
import { useState } from 'react';

interface TraitCardProps {
  trait: TraitSummary;
}

export function TraitCard({ trait }: TraitCardProps) {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const { install, isInstalling, isInstalled, getError } = useInstallStore();
  const installing = isInstalling(trait.id);
  const installed = isInstalled(trait.id);
  const error = getError(trait.id);

  const handleInstall = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // In our marketplace-web UX, clicking Install on a Web3 marketplace might prompt purchase.
    // For demonstration, let's open checkout modal first.
    setIsCheckoutOpen(true);
  };
  
  const finishInstall = async () => {
    await install(trait.id, trait.version);
  };

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
    <Link
      href={`/traits/${encodeURIComponent(trait.id)}`}
      className="trait-card block bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-700">
        <div className="flex items-start gap-3">
          {/* Author Avatar */}
          <div className="flex-shrink-0">
            {trait.author.avatar ? (
              <Image
                src={trait.author.avatar}
                alt={trait.author.name}
                width={40}
                height={40}
                className="rounded-full"
              />
            ) : (
              <div className="w-10 h-10 bg-holoscript-100 dark:bg-holoscript-900 rounded-full flex items-center justify-center text-holoscript-600 dark:text-holoscript-400 font-medium">
                {trait.author.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Title & Author */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white truncate">
                {trait.name}
              </h3>
              {trait.verified && (
                <CheckCircle className="h-4 w-4 text-holoscript-500 flex-shrink-0" />
              )}
              {trait.deprecated && (
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="truncate">{trait.author.name}</span>
              {trait.author.verified && (
                <CheckCircle className="h-3 w-3 text-holoscript-500 flex-shrink-0" />
              )}
              <span>•</span>
              <span>v{trait.version}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="p-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{trait.description}</p>
      </div>

      {/* Category & Platforms */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <span className={`category-${trait.category} text-xs px-2 py-1 rounded-full`}>
          {CATEGORY_LABELS[trait.category]}
        </span>
        {trait.platforms.slice(0, 3).map((platform) => (
          <span
            key={platform}
            className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-full"
          >
            {PLATFORM_LABELS[platform]}
          </span>
        ))}
        {trait.platforms.length > 3 && (
          <span className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-full">
            +{trait.platforms.length - 3}
          </span>
        )}
      </div>

      {/* Stats & Actions */}
      <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          {/* Downloads */}
          <div className="flex items-center gap-1.5">
            <Download className="h-4 w-4" />
            <span>{formatDownloads(trait.downloads)}</span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1.5">
            <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
            <span>{trait.rating.toFixed(1)}</span>
            <span className="text-zinc-400">({trait.ratingCount})</span>
          </div>

          {/* Updated */}
          <span className="hidden sm:inline text-zinc-400">
            {formatDistanceToNow(new Date(trait.updatedAt), { addSuffix: true })}
          </span>
        </div>

        {/* Install Button */}
        <button
          onClick={handleInstall}
          disabled={installing || installed}
          className={`
            install-button flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${
              installed
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : installing
                  ? 'bg-holoscript-100 dark:bg-holoscript-900/30 text-holoscript-600 dark:text-holoscript-400'
                  : 'bg-zinc-900 dark:bg-holoscript-500 hover:bg-zinc-800 dark:hover:bg-holoscript-600 text-white'
            }
          `}
        >
          {installed ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Installed
            </>
          ) : installing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Installing
            </>
          ) : (
            <>
              <ShoppingCart className="h-4 w-4" />
              Buy
            </>
          )}
        </button>
      </div>

      <CheckoutModal 
        trait={trait} 
        isOpen={isCheckoutOpen} 
        onClose={() => setIsCheckoutOpen(false)} 
        onSuccess={finishInstall}
      />

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
    </Link>
  );
}
