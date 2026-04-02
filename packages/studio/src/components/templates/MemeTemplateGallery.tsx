'use client';

/**
 * MemeTemplateGallery — Browse and apply meme character templates
 *
 * Shows real preview images for each meme character (Pepe, Wojak, Gigachad, etc.)
 * Clicking a template configures the character pipeline with the template's
 * traits, animations, and materials.
 */

import { useState, useMemo } from 'react';
import { X, Search, Flame, TrendingUp, Star, Sparkles } from 'lucide-react';
import { MEME_TEMPLATES, searchTemplates, type MemeTemplate } from '@/lib/memeTemplates';
import { useSceneStore } from '@/lib/stores';
import { APPLY_FEEDBACK_DURATION } from '@/lib/ui-timings';

interface MemeTemplateGalleryProps {
  onClose: () => void;
  onApply?: (template: MemeTemplate) => void;
}

const POPULARITY_ICONS: Record<string, typeof Star> = {
  viral: Flame,
  trending: TrendingUp,
  classic: Star,
  niche: Sparkles,
};

const POPULARITY_COLOR: Record<string, string> = {
  viral: 'text-red-400',
  trending: 'text-yellow-400',
  classic: 'text-blue-400',
  niche: 'text-purple-400',
};

function MemeCard({ meme, onSelect }: { meme: MemeTemplate; onSelect: (m: MemeTemplate) => void }) {
  const [imgError, setImgError] = useState(false);
  const PopIcon = POPULARITY_ICONS[meme.popularity] ?? Star;

  return (
    <button
      onClick={() => onSelect(meme)}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-panel text-left transition hover:border-studio-accent hover:bg-studio-surface hover:shadow-lg hover:shadow-studio-accent/10"
    >
      {/* Thumbnail — real image */}
      <div className="relative h-36 overflow-hidden bg-[#0a0a12]">
        {meme.previewImage && !imgError ? (
          <img
            src={meme.previewImage}
            alt={meme.displayName}
            className="h-full w-full object-cover transition group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl text-studio-muted/20 font-bold">
            {meme.displayName.charAt(0)}
          </div>
        )}

        {/* Popularity badge */}
        <div
          className={`absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium backdrop-blur ${POPULARITY_COLOR[meme.popularity]}`}
        >
          <PopIcon className="h-2.5 w-2.5" />
          {meme.popularity}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-[12px] font-bold text-studio-text">{meme.displayName}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-studio-muted line-clamp-2">
          {meme.description}
        </p>

        {/* Tags */}
        <div className="mt-2 flex flex-wrap gap-1">
          {meme.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-studio-accent/10 px-1.5 py-0.5 text-[8px] text-studio-accent"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Suggested animations */}
        <p className="mt-2 text-[9px] text-studio-muted">
          {meme.suggestedAnimations.length} animations available
        </p>
      </div>
    </button>
  );
}

export function MemeTemplateGallery({ onClose, onApply }: MemeTemplateGalleryProps) {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!query.trim()) return MEME_TEMPLATES;
    return searchTemplates(query);
  }, [query]);

  const setCode = useSceneStore((s) => s.setCode);
  const setMetadata = useSceneStore((s) => s.setMetadata);

  const handleSelect = (meme: MemeTemplate) => {
    // Use the real HoloScript composition code from the template
    setCode(meme.holoScript);
    setMetadata({ name: meme.displayName });
    setApplied(meme.id);
    onApply?.(meme);
    setTimeout(() => setApplied(null), APPLY_FEEDBACK_DURATION);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative flex h-[80vh] w-[900px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-studio-border bg-studio-bg shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-studio-border px-5 py-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-studio-text">Meme Character Templates</h2>
            <p className="text-[11px] text-studio-muted">
              Click to apply character traits, animations & materials
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-studio-muted" />
            <input
              autoFocus
              type="text"
              placeholder="Search characters…"
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
              No meme characters match &quot;{query}&quot;
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {results.map((m) => (
                <MemeCard key={m.id} meme={m} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>

        {/* Footer status */}
        {applied && (
          <div className="shrink-0 border-t border-studio-border bg-green-500/10 px-5 py-2 text-center text-[11px] text-green-400 font-medium animate-fade-in">
            ✅ Template applied! Traits, animations, and materials configured.
          </div>
        )}
      </div>
    </div>
  );
}
