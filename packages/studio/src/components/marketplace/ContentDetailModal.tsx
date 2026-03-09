'use client';

/**
 * ContentDetailModal - Full content item details with reviews
 */

import {
  X,
  Download,
  Heart,
  Star,
  Eye,
  Calendar,
  Package,
  ExternalLink,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import type { MarketplaceItem } from '@/lib/marketplace/types';
import { CONTENT_TYPE_METADATA } from '@/lib/marketplace/types';
import * as LucideIcons from 'lucide-react';

interface ContentDetailModalProps {
  item: MarketplaceItem;
  onClose: () => void;
  onDownload: (id: string) => void;
  onFavorite: (id: string) => void;
  onRemix?: (item: MarketplaceItem) => void;
  isFavorited: boolean;
}

export function ContentDetailModal({
  item,
  onClose,
  onDownload,
  onFavorite,
  onRemix,
  isFavorited,
}: ContentDetailModalProps) {
  const metadata = CONTENT_TYPE_METADATA[item.type];
  const IconComponent = (LucideIcons as any)[metadata.icon] || LucideIcons.Box;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-studio-accent/20 p-2">
              <IconComponent className="h-5 w-5 text-studio-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-studio-text">{item.name}</h2>
              <p className="text-sm text-studio-muted">{metadata.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-80px)] overflow-y-auto">
          <div className="grid grid-cols-3 gap-6 p-6">
            {/* Left column - Image & Actions */}
            <div className="col-span-1 flex flex-col gap-4">
              {/* Preview image */}
              <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-studio-border">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-studio-surface">
                    <IconComponent className="h-24 w-24 text-studio-muted/30" />
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  {item.featured && (
                    <div className="rounded bg-yellow-500/90 px-2 py-1 text-[10px] font-bold text-black backdrop-blur-sm">
                      ⭐ FEATURED
                    </div>
                  )}
                  {item.verified && (
                    <div className="rounded bg-blue-500/90 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      VERIFIED
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onDownload(item.id)}
                  className="flex items-center justify-center gap-2 rounded-lg bg-studio-accent px-4 py-3 font-medium text-white hover:bg-studio-accent/90 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Install
                </button>
                <button
                  onClick={() => onFavorite(item.id)}
                  className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors ${
                    isFavorited
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-studio-surface text-studio-text hover:bg-studio-border'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${isFavorited ? 'fill-current' : ''}`} />
                  {isFavorited ? 'Favorited' : 'Add to Favorites'}
                </button>
                {onRemix && (
                  <button
                    onClick={() => onRemix(item)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-purple-500/20 px-4 py-3 font-medium text-purple-400 hover:bg-purple-500/30 transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    Remix
                  </button>
                )}
              </div>

              {/* Stats */}
              <div className="flex flex-col gap-2 rounded-lg border border-studio-border bg-studio-surface p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-studio-muted">Rating</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                    <span className="font-semibold">{item.rating.toFixed(1)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-studio-muted">Downloads</span>
                  <span className="font-semibold">{item.downloadCount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-studio-muted">Views</span>
                  <div className="flex items-center gap-1">
                    <Eye className="h-4 w-4 text-studio-muted" />
                    <span className="font-semibold">{item.viewCount.toLocaleString()}</span>
                  </div>
                </div>
                {item.fileSize && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-studio-muted">File Size</span>
                    <div className="flex items-center gap-1">
                      <Package className="h-4 w-4 text-studio-muted" />
                      <span className="font-mono text-xs">{formatFileSize(item.fileSize)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="flex flex-col gap-2 text-xs">
                {item.license && (
                  <div className="flex items-center gap-2">
                    <span className="text-studio-muted">License:</span>
                    <span className="rounded bg-studio-surface px-2 py-0.5 font-mono">
                      {item.license}
                    </span>
                  </div>
                )}
                {item.version && (
                  <div className="flex items-center gap-2">
                    <span className="text-studio-muted">Version:</span>
                    <span className="font-mono">{item.version}</span>
                  </div>
                )}
                {item.compatibility && (
                  <div className="flex items-center gap-2">
                    <span className="text-studio-muted">Requires:</span>
                    <span className="font-mono text-[10px]">{item.compatibility}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-studio-muted" />
                  <span className="text-studio-muted">{formatDate(item.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Right column - Details & Reviews */}
            <div className="col-span-2 flex flex-col gap-6">
              {/* Author */}
              <div className="flex items-center gap-3">
                {item.author.avatar ? (
                  <img
                    src={item.author.avatar}
                    alt={item.author.name}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-studio-accent/20" />
                )}
                <div>
                  <div className="text-sm font-medium text-studio-text">{item.author.name}</div>
                  <div className="text-xs text-studio-muted">Content Creator</div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-studio-text">Description</h3>
                <p className="text-sm text-studio-muted leading-relaxed whitespace-pre-wrap">
                  {item.description}
                </p>
              </div>

              {/* Tags */}
              {item.tags.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-studio-text">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-studio-surface px-3 py-1 text-xs text-studio-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview link */}
              {item.previewUrl && (
                <div>
                  <a
                    href={item.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-studio-accent hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View live preview
                  </a>
                </div>
              )}

              {/* Reviews placeholder */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-studio-text">Reviews</h3>
                <div className="rounded-lg border border-studio-border bg-studio-surface p-4 text-center text-sm text-studio-muted">
                  Reviews coming soon
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
