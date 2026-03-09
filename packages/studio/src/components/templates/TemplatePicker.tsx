'use client';

/**
 * TemplatePicker — modal panel for choosing a starter scene template
 *
 * Loads the template's HoloScript code into the scene store.
 * The parser then produces the R3F tree and populates the scene graph.
 *
 * Features:
 *   - Search by name / tag
 *   - Category tab row ("All" + one tab per unique category)
 *   - Both filters combine
 */

import { useState, useCallback, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import { SCENE_TEMPLATES, searchTemplates, type SceneTemplate } from '@/lib/sceneTemplates';
import { useSceneStore } from '@/lib/stores';

interface TemplatePickerProps {
  onClose: () => void;
}

// ── Card ──────────────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onSelect,
}: {
  template: SceneTemplate;
  onSelect: (t: SceneTemplate) => void;
}) {
  return (
    <button
      onClick={() => onSelect(template)}
      className="group relative flex flex-col gap-2 rounded-xl border border-studio-border bg-studio-panel p-3 text-left transition hover:border-studio-accent hover:bg-studio-surface"
    >
      {/* Thumbnail — real image with fallback */}
      <div className="relative h-28 overflow-hidden rounded-lg bg-[#0a0a12] transition group-hover:scale-[1.02]">
        <img
          src={template.thumbnail}
          alt={template.name}
          className="h-full w-full object-cover"
          onError={(e) => {
            // Fallback: hide broken image, show category initial
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).parentElement!.classList.add(
              'flex',
              'items-center',
              'justify-center'
            );
            const span = document.createElement('span');
            span.className = 'text-3xl text-studio-muted/30 font-bold';
            span.textContent = template.category.charAt(0).toUpperCase();
            (e.target as HTMLImageElement).parentElement!.appendChild(span);
          }}
        />
      </div>

      {/* Info */}
      <div>
        <p className="text-[12px] font-semibold text-studio-text">{template.name}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-studio-muted line-clamp-2">
          {template.description}
        </p>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {template.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-studio-accent/10 px-1.5 py-0.5 text-[9px] text-studio-accent"
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

// ── Main picker ───────────────────────────────────────────────────────────────

export function TemplatePicker({ onClose }: TemplatePickerProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const setCode = useSceneStore((s) => s.setCode);
  const setMetadata = useSceneStore((s) => s.setMetadata);
  const markClean = useSceneStore((s) => s.markClean);

  // Derive unique sorted categories
  const categories = useMemo(() => {
    const cats = new Set(SCENE_TEMPLATES.map((t) => t.category ?? 'General'));
    return Array.from(cats).sort();
  }, []);

  // Combined filter: search query + active category
  const results = useMemo(() => {
    let list = searchTemplates(query);
    if (activeCategory) {
      list = list.filter((t) => (t.category ?? 'General') === activeCategory);
    }
    return list;
  }, [query, activeCategory]);

  const handleSelect = useCallback(
    (template: SceneTemplate) => {
      setCode(template.code);
      setMetadata({ name: template.name });
      markClean();
      onClose();
    },
    [setCode, setMetadata, markClean, onClose]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative flex h-[80vh] w-[820px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-studio-border bg-studio-bg shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-studio-border px-5 py-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-studio-text">Choose a Scene Template</h2>
            <p className="text-[11px] text-studio-muted">Start from a pre-built composition</p>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-studio-muted" />
            <input
              autoFocus
              type="text"
              placeholder="Search templates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-lg border border-studio-border bg-studio-surface pl-8 pr-3 py-1.5 text-[11px] text-studio-text placeholder:text-studio-muted outline-none focus:border-studio-accent"
            />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-studio-muted hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-studio-border px-5 py-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-medium transition ${
              activeCategory === null
                ? 'bg-studio-accent text-white'
                : 'bg-studio-surface text-studio-muted hover:text-studio-text'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-medium transition ${
                activeCategory === cat
                  ? 'bg-studio-accent text-white'
                  : 'bg-studio-surface text-studio-muted hover:text-studio-text'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {results.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-studio-muted">
              No templates match {query ? `"${query}"` : `category "${activeCategory}"`}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {results.map((t) => (
                <TemplateCard key={t.id} template={t} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
