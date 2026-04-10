'use client';

/**
 * MarketplacePanel - Universal HoloScript content marketplace
 *
 * Browse, search, and download all content types:
 * - Scenes, Characters, Models, Materials
 * - Workflows, Behavior Trees
 * - Audio, Music, VR Environments
 * - Plugins, Scripts, Presets
 */

import { useState, useCallback, useEffect } from 'react';
import {
  X,
  Search,
  Upload,
  SlidersHorizontal,
  TrendingUp,
  Star,
  Grid3x3,
  List,
} from 'lucide-react';
import { useMarketplace, useFavorites, useDownload } from '@/lib/marketplace/hooks';
import { StudioEvents } from '@/lib/analytics';
import type { ContentType, MarketplaceItem } from '@/lib/marketplace/types';
import { ContentCard } from './ContentCard';
import { ContentTypeFilter } from './ContentTypeFilter';
import { ContentDetailModal } from './ContentDetailModal';
import { UploadWizard } from './UploadWizard';
import { logger } from '@/lib/logger';
import { useSceneStore } from '@/lib/stores/sceneStore';
import { useStudioBus } from '@/hooks/useStudioBus';

interface MarketplacePanelProps {
  onClose: () => void;
}

export function MarketplacePanel({ onClose }: MarketplacePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>([]);
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'rating' | 'downloads' | 'views'>(
    'popular'
  );
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [showUploadWizard, setShowUploadWizard] = useState(false);
  const [remixItem, setRemixItem] = useState<MarketplaceItem | null>(null);

  // Hooks
  const { items, loading, error, hasMore, loadMore, refresh } = useMarketplace({
    type: selectedTypes.length > 0 ? selectedTypes : undefined,
    search: searchQuery || undefined,
    sortBy,
    limit: 20,
  });

  const { favorites, isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { download, downloading } = useDownload();
  const setCode = useSceneStore((s) => s.setCode);
  const { emit } = useStudioBus();

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    refresh();
  }, [debouncedQuery, selectedTypes, sortBy]);

  const handleFavoriteToggle = useCallback(
    async (itemId: string) => {
      const wasFavorited = isFavorite(itemId);
      if (wasFavorited) {
        await removeFavorite(itemId);
      } else {
        await addFavorite(itemId);
      }
      StudioEvents.marketplaceFavorite(itemId, !wasFavorited);
    },
    [isFavorite, addFavorite, removeFavorite]
  );

  const handleDownload = useCallback(
    async (itemId: string) => {
      try {
        const content = await download(itemId);
        StudioEvents.marketplaceDownload(itemId);
        logger.debug('Downloaded content:', content);

        const item = items.find((i) => i.id === itemId);
        if (item) {
          switch (item.type) {
            case 'scene':
            case 'preset':
              if (typeof content === 'string') {
                setCode(content);
                emit('scene:loaded', { id: item.id });
              }
              break;
            case 'script':
            case 'workflow':
            case 'behavior_tree':
            case 'character':
            case 'model':
            case 'audio':
            case 'music':
            case 'material':
            case 'particle_effect':
            case 'shader_graph':
              emit('asset:imported', { type: item.type, content });
              break;
            case 'plugin':
              emit('plugin:installed', { pluginId: item.id, content });
              break;
            default:
              logger.info(`Downloaded ${item.type} content but no auto-importer is registered.`);
          }
        }
      } catch (err) {
        logger.error('Download failed:', err);
      }
    },
    [download, items, setCode, emit]
  );

  const handleRemix = useCallback((item: MarketplaceItem) => {
    StudioEvents.marketplaceRemix(item.id);
    setRemixItem(item);
    setShowUploadWizard(true);
    setSelectedItem(null); // Close detail modal
  }, []);

  // Infinite scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
      if (bottom && hasMore && !loading) {
        loadMore();
      }
    },
    [hasMore, loading, loadMore]
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-studio-panel">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-studio-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-studio-accent/20 p-2">
            <Upload className="h-5 w-5 text-studio-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-studio-text">Marketplace</h2>
            <p className="text-[10px] text-studio-muted">
              {items.length} {selectedTypes.length > 0 ? 'filtered ' : ''}items
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-muted" />
          <input
            type="text"
            placeholder="Search content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-studio-border bg-studio-surface py-2 pl-9 pr-3 text-sm text-studio-text placeholder-studio-muted focus:border-studio-accent focus:outline-none focus:ring-1 focus:ring-studio-accent"
          />
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none focus:ring-1 focus:ring-studio-accent"
        >
          <option value="popular">Popular</option>
          <option value="recent">Recent</option>
          <option value="rating">Rating</option>
          <option value="downloads">Downloads</option>
          <option value="views">Views</option>
        </select>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-studio-border overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 ${
              viewMode === 'grid'
                ? 'bg-studio-accent text-white'
                : 'bg-studio-surface text-studio-muted hover:text-studio-text'
            }`}
            title="Grid view"
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 ${
              viewMode === 'list'
                ? 'bg-studio-accent text-white'
                : 'bg-studio-surface text-studio-muted hover:text-studio-text'
            }`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Upload button */}
        <button
          onClick={() => setShowUploadWizard(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/30"
          title="Upload content"
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Upload</span>
        </button>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`rounded-lg p-2 ${
            showFilters
              ? 'bg-studio-accent text-white'
              : 'bg-studio-surface text-studio-muted hover:text-studio-text'
          }`}
          title="Toggle filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-studio-muted hover:bg-studio-surface hover:text-studio-text"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar filters */}
        {showFilters && (
          <div className="w-64 shrink-0 overflow-y-auto border-r border-studio-border bg-studio-surface p-4">
            <ContentTypeFilter selectedTypes={selectedTypes} onChange={setSelectedTypes} />

            {/* Quick filters */}
            <div className="mt-6 flex flex-col gap-2">
              <div className="text-sm font-semibold text-studio-text">Quick Filters</div>
              <button
                onClick={() => {
                  setSelectedTypes([]);
                  setSortBy('popular');
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-studio-panel transition-colors"
              >
                <TrendingUp className="h-3.5 w-3.5 text-orange-400" />
                <span>Trending</span>
              </button>
              <button
                onClick={() => {
                  setSelectedTypes([]);
                  setSortBy('rating');
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] hover:bg-studio-panel transition-colors"
              >
                <Star className="h-3.5 w-3.5 text-yellow-400" />
                <span>Top Rated</span>
              </button>
            </div>

            {/* Favorites */}
            {favorites.length > 0 && (
              <div className="mt-6 flex flex-col gap-2">
                <div className="text-sm font-semibold text-studio-text">
                  Favorites ({favorites.length})
                </div>
                <div className="text-[10px] text-studio-muted">View your saved content</div>
              </div>
            )}
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto p-4" onScroll={handleScroll}>
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="rounded-full bg-studio-surface p-6">
                <Search className="h-12 w-12 text-studio-muted" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-studio-text">No content found</h3>
                <p className="text-sm text-studio-muted mt-1">
                  Try adjusting your filters or search query
                </p>
              </div>
            </div>
          )}

          {/* Grid view */}
          {viewMode === 'grid' && items.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <ContentCard
                  key={item.id}
                  item={item}
                  onSelect={setSelectedItem}
                  onFavorite={handleFavoriteToggle}
                  isFavorited={isFavorite(item.id)}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          )}

          {/* List view */}
          {viewMode === 'list' && items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-studio-border bg-studio-panel p-3 hover:border-studio-accent transition-colors cursor-pointer"
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={item.thumbnailUrl || ''}
                      alt={item.name}
                      className="h-12 w-12 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-studio-text truncate">
                        {item.name}
                      </h3>
                      <p className="text-[10px] text-studio-muted truncate">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-studio-muted">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      <span>{item.rating.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Loading more */}
          {loading && (
            <div className="mt-4 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
            </div>
          )}

          {/* Load more button */}
          {!loading && hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={loadMore}
                className="rounded-lg bg-studio-accent px-6 py-2 text-sm font-medium text-white hover:bg-studio-accent/90 transition-colors"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selectedItem && (
        <ContentDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDownload={handleDownload}
          onFavorite={handleFavoriteToggle}
          onRemix={handleRemix}
          isFavorited={isFavorite(selectedItem.id)}
        />
      )}

      {/* Upload wizard */}
      {showUploadWizard && (
        <UploadWizard
          onClose={() => {
            setShowUploadWizard(false);
            setRemixItem(null);
          }}
          onSuccess={() => {
            setShowUploadWizard(false);
            setRemixItem(null);
            refresh(); // Refresh marketplace after successful upload
          }}
          remixFrom={
            remixItem
              ? {
                  id: remixItem.id,
                  name: remixItem.name,
                  description: remixItem.description,
                  type: remixItem.type,
                  thumbnailUrl: remixItem.thumbnailUrl,
                  author: remixItem.author,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
