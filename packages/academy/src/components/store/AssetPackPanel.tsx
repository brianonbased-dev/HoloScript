'use client';

/**
 * AssetPackPanel — curated pack store with per-item insert and "Insert All" actions.
 */

import { useEffect, useState } from 'react';
import { Store, X, Plus, PackagePlus, ChevronDown, ChevronRight } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';
import type { AssetPack, AssetPackItem } from '@/app/api/asset-packs/route';

const CATEGORY_COLORS: Record<string, string> = {
  'sci-fi': '#44aaff',
  fantasy: '#aa44ff',
  nature: '#44cc66',
  urban: '#ffaa44',
  abstract: '#ff44aa',
  'vr-ui': '#44ffee',
};

const CATEGORY_LABELS: Record<string, string> = {
  'sci-fi': '🛸 Sci-Fi',
  fantasy: '🏰 Fantasy',
  nature: '🌿 Nature',
  urban: '🏙️ Urban',
  abstract: '🎨 Abstract',
  'vr-ui': '🥽 VR UI',
};

interface AssetPackPanelProps {
  onClose: () => void;
}

export function AssetPackPanel({ onClose }: AssetPackPanelProps) {
  const [packs, setPacks] = useState<AssetPack[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [expandedPack, setExpandedPack] = useState<string | null>(null);
  const [insertedItems, setInsertedItems] = useState<Set<string>>(new Set());
  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  useEffect(() => {
    fetch(`/api/asset-packs${activeCategory ? `?category=${activeCategory}` : ''}`)
      .then((r) => r.json())
      .then((d: { packs: AssetPack[]; categories: string[] }) => {
        setPacks(d.packs);
        setCategories(d.categories);
      })
      .catch(() => {});
  }, [activeCategory]);

  const insertItem = (item: AssetPackItem) => {
    setCode(code + `\n${item.traitSnippet}\n`);
    setInsertedItems((prev) => new Set(prev).add(item.id));
  };

  const insertAll = (pack: AssetPack) => {
    const snippet = pack.items.map((i) => i.traitSnippet).join('\n\n');
    setCode(code + `\n// === ${pack.name} ===\n${snippet}\n`);
    setInsertedItems((prev) => {
      const next = new Set(prev);
      pack.items.forEach((i) => next.add(i.id));
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Store className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Asset Pack Store</span>
        <span className="rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted">
          {packs.length} packs
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Category pills */}
      <div className="shrink-0 flex gap-1 overflow-x-auto border-b border-studio-border px-2 py-1.5">
        <button
          onClick={() => setActiveCategory('')}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] transition ${!activeCategory ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={
              activeCategory === cat
                ? {
                    borderColor: CATEGORY_COLORS[cat],
                    color: CATEGORY_COLORS[cat],
                    backgroundColor: `${CATEGORY_COLORS[cat]}18`,
                  }
                : undefined
            }
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] transition ${activeCategory !== cat ? 'border-studio-border text-studio-muted hover:text-studio-text' : ''}`}
          >
            {(CATEGORY_LABELS[cat] ?? cat).split(' ').slice(0, 2).join(' ')}
          </button>
        ))}
      </div>

      {/* Pack list */}
      <div className="flex-1 overflow-y-auto divide-y divide-studio-border/40">
        {packs.map((pack) => {
          const isExpanded = expandedPack === pack.id;
          const catColor = CATEGORY_COLORS[pack.category] ?? '#888';
          return (
            <div key={pack.id} className="overflow-hidden">
              {/* Pack header */}
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-studio-surface/40 transition">
                <button
                  onClick={() => setExpandedPack(isExpanded ? null : pack.id)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-studio-muted" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-studio-muted" />
                  )}
                  <span className="text-base">{pack.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold truncate">{pack.name}</p>
                    <p className="text-[7px] text-studio-muted">
                      {pack.itemCount} objects · {pack.author}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[7px]"
                    style={{ backgroundColor: `${catColor}22`, color: catColor }}
                  >
                    {pack.category}
                  </span>
                </button>
                <button
                  onClick={() => insertAll(pack)}
                  title="Insert All"
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-studio-border px-2 py-1 text-[8px] text-studio-muted hover:border-studio-accent hover:text-studio-accent transition"
                >
                  <PackagePlus className="h-3 w-3" /> All
                </button>
              </div>

              {/* Description */}
              {isExpanded && (
                <div className="px-10 pb-1 -mt-0.5">
                  <p className="text-[8px] text-studio-muted leading-snug">{pack.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {pack.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pack items */}
              {isExpanded && (
                <div className="divide-y divide-studio-border/30 border-t border-studio-border/30 ml-6">
                  {pack.items.map((item) => {
                    const wasInserted = insertedItems.has(item.id);
                    return (
                      <div key={item.id} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="text-sm">{item.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-medium truncate">{item.name}</p>
                          <p className="text-[7px] text-studio-muted capitalize">{item.type}</p>
                        </div>
                        <button
                          onClick={() => insertItem(item)}
                          className={`shrink-0 flex items-center gap-1 rounded-lg border px-2 py-1 text-[8px] transition ${wasInserted ? 'border-green-600/40 text-green-400 bg-green-900/20' : 'border-studio-border text-studio-muted hover:border-studio-accent hover:text-studio-accent'}`}
                        >
                          <Plus className="h-2.5 w-2.5" />
                          {wasInserted ? 'Added' : 'Insert'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
