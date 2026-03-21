'use client';

/**
 * TemplateGallery — right-rail template browser with categories and one-click apply.
 */

import { useState, useEffect } from 'react';
import { LayoutTemplate, X, Search, ChevronRight, Layers } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';

type TemplateCategory = 'environment' | 'architecture' | 'sci-fi' | 'fantasy' | 'minimal' | 'game';

interface SceneTemplate {
  id: string;
  name: string;
  category: TemplateCategory | string;
  tags: string[];
  description: string;
  thumbnail: string;
  code: string;
  objectCount: number;
  complexity: 'simple' | 'medium' | 'complex';
}

const COMPLEXITY_COLOR: Record<string, string> = {
  simple: 'text-green-400',
  medium: 'text-yellow-400',
  complex: 'text-orange-400',
};

const CATEGORY_EMOJI: Record<string, string> = {
  environment: '🌿',
  'sci-fi': '🚀',
  fantasy: '🏰',
  minimal: '⬜',
  game: '🎮',
  architecture: '🏛️',
  film: '🎬',
  art: '🎨',
  iot: '📡',
  education: '🎓',
  robotics: '🦾',
  science: '🔬',
  web: '🌐',
  healthcare: '💊',
  agriculture: '🌾',
  creator: '🎭',
};

interface TemplateGalleryProps {
  onClose: () => void;
}

export function TemplateGallery({ onClose }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [applied, setApplied] = useState<string | null>(null);
  const setCode = useSceneStore((s) => s.setCode);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/templates?category=${encodeURIComponent(activeCategory)}&q=${encodeURIComponent(q)}`
    )
      .then((r) => r.json())
      .then((d: { templates: SceneTemplate[]; categories: string[] }) => {
        setTemplates(d.templates);
        if (d.categories?.length) setCategories(d.categories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeCategory, q]);

  const apply = (t: SceneTemplate) => {
    setCode(t.code);
    setApplied(t.id);
    setTimeout(() => setApplied(null), 2000);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <LayoutTemplate className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Scene Templates</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-studio-border p-2.5 space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search templates…"
            className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40"
          />
        </div>
        {/* Category pills */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory('')}
            className={`rounded-full px-2 py-0.5 text-[9px] border transition ${activeCategory === '' ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c === activeCategory ? '' : c)}
              className={`rounded-full px-2 py-0.5 text-[9px] border transition ${activeCategory === c ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'}`}
            >
              {CATEGORY_EMOJI[c] ?? '📁'} {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {loading && (
          <p className="py-8 text-center text-[10px] text-studio-muted animate-pulse">
            Loading templates…
          </p>
        )}
        {!loading && templates.length === 0 && (
          <p className="py-8 text-center text-[10px] text-studio-muted">No templates found.</p>
        )}
        {templates.map((t) => (
          <div
            key={t.id}
            className="overflow-hidden rounded-xl border border-studio-border bg-studio-surface transition hover:border-studio-accent/40"
          >
            {/* Preview area — real image with fallback */}
            <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-studio-panel to-black/40">
              {t.thumbnail ? (
                <img
                  src={t.thumbnail}
                  alt={t.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : null}
              {/* Category badge */}
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] backdrop-blur">
                {CATEGORY_EMOJI[t.category] ?? '📁'} {t.category}
              </span>
            </div>
            {/* Info */}
            <div className="p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold text-studio-text">{t.name}</p>
                  <p className="mt-0.5 text-[9px] text-studio-muted line-clamp-2">
                    {t.description}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[9px] font-medium ${COMPLEXITY_COLOR[t.complexity] ?? 'text-studio-muted'}`}
                >
                  {t.complexity}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex items-center gap-1 text-[9px] text-studio-muted">
                  <Layers className="h-2.5 w-2.5" />
                  {t.objectCount} objects
                </div>
                <div className="ml-auto flex gap-1 flex-wrap">
                  {t.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-studio-border/60 px-1 py-0.5 text-[8px] text-studio-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => apply(t)}
                className={`mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-[10px] font-semibold transition ${
                  applied === t.id
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-studio-accent text-white hover:brightness-110'
                }`}
              >
                {applied === t.id ? (
                  '✅ Applied!'
                ) : (
                  <>
                    <ChevronRight className="h-3 w-3" /> Use Template
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
