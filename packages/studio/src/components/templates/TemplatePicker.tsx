'use client';

/**
 * TemplatePicker — modal panel for choosing a starter scene template
 *
 * Loads the template's HoloScript code into the scene store.
 * The parser then produces the R3F tree and populates the scene graph.
 */

import { useState, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { SCENE_TEMPLATES, searchTemplates, type SceneTemplate } from '@/lib/sceneTemplates';
import { useSceneStore } from '@/lib/store';

interface TemplatePickerProps {
  onClose: () => void;
}

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
      {/* Thumbnail emoji */}
      <div className="flex h-20 items-center justify-center rounded-lg bg-[#0a0a12] text-4xl transition group-hover:scale-105">
        {template.thumbnail}
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

export function TemplatePicker({ onClose }: TemplatePickerProps) {
  const [query, setQuery] = useState('');
  const results = searchTemplates(query);

  const setCode = useSceneStore((s) => s.setCode);
  const setMetadata = useSceneStore((s) => s.setMetadata);
  const markClean = useSceneStore((s) => s.markClean);

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
      <div className="relative flex h-[80vh] w-[780px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-studio-border bg-studio-bg shadow-2xl">
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

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {results.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-studio-muted">
              No templates match "{query}"
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
