'use client';

/**
 * ContentCard — compact marketplace tile (grid view).
 */

import { Star, Download, Heart } from 'lucide-react';
import type { MarketplaceItem } from '@/lib/marketplace/types';
import { CONTENT_TYPE_METADATA } from '@/lib/marketplace/types';
import * as LucideIcons from 'lucide-react';

export interface ContentCardProps {
  item: MarketplaceItem;
  onSelect: (item: MarketplaceItem) => void;
  onFavorite?: (id: string) => void;
  isFavorited?: boolean;
  onDownload?: (id: string) => void;
}

export function ContentCard({
  item,
  onSelect,
  onFavorite,
  isFavorited,
  onDownload,
}: ContentCardProps) {
  const meta = CONTENT_TYPE_METADATA[item.type];
  const Icon =
    (LucideIcons as unknown as Record<string, typeof LucideIcons.Box>)[meta.icon] ||
    LucideIcons.Box;

  return (
    <article
      tabIndex={0}
      aria-label={`View ${item.name}`}
      role="link"
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item);
        }
      }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-lg border border-studio-border bg-studio-panel text-left transition-colors hover:border-studio-accent"
    >
      <div className="relative aspect-video w-full bg-studio-surface">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon className="h-12 w-12 text-studio-muted/40" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-studio-muted">
            {meta.label}
          </p>
          <h3 className="line-clamp-1 text-sm font-semibold text-studio-text">{item.name}</h3>
        </div>
        <p className="line-clamp-2 text-xs text-studio-muted">{item.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-studio-muted">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 text-yellow-500" />
            {item.rating.toFixed(1)}
          </span>
          <div className="flex gap-1">
            {onDownload && (
              <button
                type="button"
                className="rounded p-1 hover:bg-studio-surface"
                aria-label="Download"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(item.id);
                }}
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            {onFavorite && (
              <button
                type="button"
                className="rounded p-1 hover:bg-studio-surface"
                aria-label={isFavorited ? 'Unfavorite' : 'Favorite'}
                onClick={(e) => {
                  e.stopPropagation();
                  onFavorite(item.id);
                }}
              >
                <Heart className={`h-4 w-4 ${isFavorited ? 'fill-red-400 text-red-400' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
