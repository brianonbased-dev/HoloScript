'use client';

import { useState, useMemo } from 'react';
import { MarketplaceItem, ContentType } from '@/lib/marketplace/types';
import { ContentCard } from '@/components/marketplace/ContentCard';
import { Layers, ShieldCheck, Zap, Package } from 'lucide-react';

interface StoreGridProps {
  items: MarketplaceItem[];
  loading: boolean;
  onSelectItem: (item: MarketplaceItem) => void;
  onInstall: (id: string) => void;
}

export function StoreGrid({ items, loading, onSelectItem, onInstall }: StoreGridProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'marketplace' | 'registry'>('all');

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    if (activeFilter === 'marketplace') return items.filter(i => i.verified);
    if (activeFilter === 'registry') return items.filter(i => !i.verified);
    return items;
  }, [items, activeFilter]);

  if (loading && items.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-6 lg:px-12 animate-pulse">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-64 bg-studio-panel rounded-2xl border border-studio-border" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 pb-24">
      {/* Category Tabs */}
      <div className="flex items-center gap-4 mb-10 overflow-x-auto pb-4 scrollbar-hide">
        {[
          { id: 'all', label: 'All Content', icon: Layers },
          { id: 'marketplace', label: 'Marketplace (Verified)', icon: ShieldCheck },
          { id: 'registry', label: 'Local Registry', icon: Package },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold transition-all whitespace-nowrap ${
              activeFilter === tab.id
                ? 'bg-studio-accent text-white shadow-lg shadow-studio-accent/20'
                : 'bg-studio-panel border border-studio-border text-studio-muted hover:border-studio-accent/50'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filteredItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onSelect={() => onSelectItem(item)}
              onDownload={() => onInstall(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="py-24 text-center border-2 border-dashed border-studio-border rounded-3xl">
          <Zap className="h-12 w-12 text-studio-muted/30 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-studio-text">No matches found</h3>
          <p className="text-studio-muted">Try expanding your search or category filters.</p>
        </div>
      )}
    </div>
  );
}
