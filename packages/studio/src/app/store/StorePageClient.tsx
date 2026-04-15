'use client';
/**
 * HoloScript Store — The AI-Native Hardware & Software Gateway
 *
 * Uniting:
 * 1. Software: Local Registry + Global Marketplace
 * 2. Hardware: HoloScript Replication Script (setup.ps1)
 * 3. AI: Semantic Search powered by Absorb
 */

import { useState, useCallback, useEffect } from 'react';
import { StoreHero } from '@/components/store/StoreHero';
import { HardwareBanner } from '@/components/store/HardwareBanner';
import { StoreGrid } from '@/components/store/StoreGrid';
import { ContentDetailModal } from '@/components/marketplace/ContentDetailModal';
import { HoloPreviewModal } from '@/components/store/HoloPreviewModal';
import { useMarketplace, useDownload } from '@/lib/marketplace/hooks';
import { MarketplaceItem } from '@/lib/marketplace/types';
import { logger } from '@/lib/logger';
import { StudioEvents } from '@/lib/analytics';
import { useStudioBus } from '@/hooks/useStudioBus';
import { Footer } from '@/components/layout/Footer';

export default function StorePageClient() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [previewItem, setPreviewItem] = useState<MarketplaceItem | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { items, loading, refresh } = useMarketplace({
    search: searchQuery || undefined,
    limit: 50,
    sortBy: 'popular',
  });

  const { download } = useDownload();
  const { emit } = useStudioBus();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length > 3) {
        setIsSearching(true);
        try {
          const res = await fetch('/api/store/search', {
            method: 'POST',
            body: JSON.stringify({ query: searchQuery }),
          });
          await res.json();
          await refresh();
        } catch (err) {
          logger.error('Semantic search failed:', err);
        }
        setIsSearching(false);
      } else {
        refresh();
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [searchQuery, refresh]);

  const handleInstall = useCallback(
    async (itemId: string) => {
      try {
        const content = await download(itemId);
        StudioEvents.marketplaceDownload(itemId);

        const item = items.find((i) => i.id === itemId);
        if (item) {
          emit('asset:imported', { type: item.type, content });
          logger.info(`Successfully installed ${item.name}`);
          setSelectedItem(null);
          setPreviewItem(null);
        }
      } catch (err) {
        logger.error('Installation failed:', err);
      }
    },
    [download, items, emit]
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#05050a]">
      <StoreHero onSearch={setSearchQuery} />
      <HardwareBanner />
      <div className="flex-1">
        <StoreGrid
          items={items}
          loading={loading || isSearching}
          onSelectItem={setPreviewItem}
          onInstall={handleInstall}
        />
      </div>

      {selectedItem && (
        <ContentDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onDownload={handleInstall}
          onFavorite={() => {}}
          isFavorited={false}
        />
      )}

      {previewItem && (
        <HoloPreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onInstall={handleInstall}
        />
      )}

      <Footer />
    </div>
  );
}
