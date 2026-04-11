'use client';

/**
 * ContentCard - Universal marketplace content card
 *
 * Displays any content type (scenes, characters, workflows, audio, etc.)
 * with thumbnail, metadata, and action buttons.
 */

import { useState } from 'react';
import { Heart, Download, Eye, Star, CheckCircle, ExternalLink } from 'lucide-react';
import type { MarketplaceItem, _ContentType } from '@/lib/marketplace/types';
import { CONTENT_TYPE_METADATA } from '@/lib/marketplace/types';
import * as LucideIcons from 'lucide-react';

interface ContentCardProps {
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
  isFavorited = false,
  onDownload,
}: ContentCardProps) {
  const [imageError, setImageError] = useState(false);
  const metadata = CONTENT_TYPE_METADATA[item.type];

  // Get icon component from metadata
  const IconComponent = (LucideIcons as unknown as Record<string, typeof LucideIcons.Box>)[metadata.icon] || LucideIcons.Box;

  // Format numbers for display
  const formatCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorite?.(item.id);
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload?.(item.id);
  };

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-panel transition-all hover:border-studio-accent hover:shadow-lg hover:shadow-studio-accent/10 cursor-pointer"
      onClick={() => onSelect(item)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-studio-surface">
        {item.thumbnailUrl && !imageError ? (
          <img
            src={item.thumbnailUrl}
            alt={item.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <IconComponent className="h-16 w-16 text-studio-muted/30" />
          </div>
        )}

        {/* Badges overlay */}
        <div className="absolute top-2 left-2 flex gap-1">
          {item.featured && (
            <div className="rounded bg-yellow-500/90 px-2 py-0.5 text-[10px] font-bold text-black backdrop-blur-sm">
              ⭐ FEATURED
            </div>
          )}
          {item.verified && (
            <div className="rounded bg-blue-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              VERIFIED
            </div>
          )}
        </div>

        {/* Favorite button */}
        {onFavorite && (
          <button
            onClick={handleFavoriteClick}
            className="absolute top-2 right-2 rounded-full bg-black/50 p-2 backdrop-blur-sm transition-colors hover:bg-black/70"
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              className={`h-4 w-4 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-white'}`}
            />
          </button>
        )}

        {/* License badge */}
        {item.license && (
          <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[9px] font-mono text-white backdrop-blur-sm">
            {item.license}
          </div>
        )}
      </div>

      {/* Content info */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Type icon + title */}
        <div className="flex items-start gap-2">
          <IconComponent className="mt-0.5 h-4 w-4 shrink-0 text-studio-accent" />
          <div className="flex-1 min-w-0">
            <h3 className="truncate text-sm font-semibold text-studio-text">{item.name}</h3>
            <p className="text-[10px] text-studio-muted">{metadata.label}</p>
          </div>
        </div>

        {/* Description */}
        <p className="line-clamp-2 text-[11px] text-studio-muted">{item.description}</p>

        {/* Author */}
        <div className="flex items-center gap-1.5">
          {item.author.avatar ? (
            <img src={item.author.avatar} alt={item.author.name} className="h-4 w-4 rounded-full" />
          ) : (
            <div className="h-4 w-4 rounded-full bg-studio-accent/20" />
          )}
          <span className="text-[10px] text-studio-muted truncate">{item.author.name}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-studio-muted border-t border-studio-border pt-2 mt-auto">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
            <span>{item.rating.toFixed(1)}</span>
          </div>

          {/* Downloads */}
          <div className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            <span>{formatCount(item.downloadCount)}</span>
          </div>

          {/* Views */}
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            <span>{formatCount(item.viewCount)}</span>
          </div>

          {/* File size */}
          {formatFileSize(item.fileSize) && (
            <div className="ml-auto text-[9px] font-mono">{formatFileSize(item.fileSize)}</div>
          )}
        </div>

        {/* Actions (visible on hover) */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 mt-2">
          {onDownload && (
            <button
              onClick={handleDownloadClick}
              className="flex-1 rounded bg-studio-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-studio-accent/90 transition-colors flex items-center justify-center gap-1"
            >
              <Download className="h-3 w-3" />
              Install
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item);
            }}
            className="rounded bg-studio-surface px-3 py-1.5 text-[11px] font-medium hover:bg-studio-border transition-colors flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Details
          </button>
        </div>
      </div>
    </div>
  );
}
